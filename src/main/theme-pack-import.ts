import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';

const FORMAT = 'mad-station-theme-pack';
const CONTRACT = 'madstation-theme-api-v1';
const MAX_ARCHIVE_BYTES = 80 * 1024 * 1024;
const MAX_ENTRIES = 1200;
const MAX_FILE_BYTES = 24 * 1024 * 1024;
const MAX_TOTAL_UNCOMPRESSED = 160 * 1024 * 1024;
const MAX_COMPRESSION_RATIO = 250;
const STAGED_TTL_MS = 15 * 60 * 1000;
const MAX_STAGED_PACKS = 4;

const BUILTIN_MODE_BY_FILENAME: Record<string, string> = {
  'home-v2.html': 'v2',
  'home-v3.html': 'parallax',
  'home-v4.html': 'parallax-big',
  'home-retro.html': 'retro',
  'home-retro-complex.html': 'retro-complex',
  'home-galaxy.html': 'galaxy',
  'home-parallax-jungle.html': 'parallax-jungle',
  'home-claymorphism.html': 'claymorphism',
  'home-glass.html': 'glass',
  'home-isometric-world.html': 'isometric-world',
};
const BUILTIN_ID_BY_FILENAME: Record<string, string> = {
  'home-v2.html': 'simple', 'home-v3.html': 'parallax', 'home-v4.html': 'parallax-big',
  'home-retro.html': 'simple-retro', 'home-retro-complex.html': 'retro-complex',
  'home-galaxy.html': 'galaxy', 'home-parallax-jungle.html': 'parallax-jungle',
  'home-claymorphism.html': 'claymorphism', 'home-glass.html': 'glass',
  'home-isometric-world.html': 'isometric-world',
};
const BUILTIN_LABELS: Record<string, string> = {
  legacy: 'Default', v2: 'Simple', retro: 'Simple Retro', 'retro-complex': 'Retro Complex',
  parallax: '3D Parallax', 'parallax-big': '3D Parallax Big App', galaxy: 'Galaxy',
  'parallax-jungle': 'Parallax Jungle', claymorphism: 'Claymorphism', glass: 'Glass',
  'isometric-world': 'Isometric World',
};
const BUILTIN_CHANNELS: Record<string, string> = {
  v2: 'madstation-home-v2', retro: 'madstation-home-simple-retro',
  'retro-complex': 'madstation-home-retro-complex', parallax: 'madstation-home-parallax',
  'parallax-big': 'madstation-home-parallax-big', galaxy: 'madstation-home-galaxy',
  'parallax-jungle': 'madstation-home-parallax-jungle', claymorphism: 'madstation-home-claymorphism',
  glass: 'madstation-home-glass', 'isometric-world': 'madstation-home-isometric-world',
};
const BLOCKED_SCRIPT_SOURCE = /(?:\brequire\s*\(|\bipcRenderer\b|\bprocess\s*(?:\.|\[)|window\s*\.\s*aiHub\b|(?:window\s*\.\s*)?parent\s*\.\s*postMessage\b|(?:window\s*\.\s*)?top\s*\.\s*postMessage\b|\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\bEventSource\b|\bsendBeacon\s*\(|\beval\s*\(|\bnew\s+Function\b|\bimport\s*\(|document\s*\.\s*cookie\b|window\s*\.\s*open\s*\(|(?:window\s*\.\s*)?(?:top|parent)\s*\.\s*location\b)/i;
const BLOCKED_SCRIPT_NAME = /(?:^|[-_.])(?:bridge|preload|ipc|host|native|integration)(?:[-_.]|$)|settings-bridge|visual-only-guard/i;
const SAFE_RESOURCE_EXTENSIONS = new Set(['.css', '.js', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.ico', '.woff', '.woff2', '.ttf', '.otf', '.mp4', '.webm', '.ogg', '.mp3', '.json']);

interface ZipEntry {
  name: string;
  data: Buffer;
  crc32: number;
}
interface PackTheme {
  id: string;
  title: string;
  description: string;
  filename: string;
  entryPath: string;
  fingerprint: string;
  sourceFingerprint?: string;
  builtinMode: string | null;
  status: 'new' | 'changed' | 'current';
  defaultAction: 'add';
}
interface ScannedPack {
  scanId: string;
  packageTitle: string;
  sourcePath: string;
  packageRoot: string;
  files: Map<string, Buffer>;
  themes: PackTheme[];
  instructionPath: string | null;
  instructionText: string | null;
  manifestPresent: boolean;
  warnings: string[];
  createdAt: number;
}
interface InstalledThemeEntry {
  mode: string;
  title: string;
  description: string;
  filename: string;
  entryPath: string;
  fingerprint: string;
  sourceFingerprint?: string;
  kind: 'custom';
  installedAt: string;
}
interface InstalledRegistry { schemaVersion: 1; themes: InstalledThemeEntry[] }
export interface ThemePackScanTheme extends Omit<PackTheme, 'entryPath' | 'sourceFingerprint'> {}
export interface ThemePackScanResult {
  ok: true;
  scanId: string;
  packageTitle: string;
  manifestPresent: boolean;
  instructionsPresent: boolean;
  instructionsFile: string | null;
  themeCount: number;
  fileCount: number;
  uncompressedBytes: number;
  warnings: string[];
  themes: ThemePackScanTheme[];
}
export interface ThemePackImportChoice { id: string; action: 'add' }
export interface ThemePackImportResult {
  ok: true;
  installed: Array<{ mode: string; title: string; kind: 'custom'; status: string }>;
  catalog: ImportedThemeCatalog;
  backupCount: number;
  restartRequired: false;
  restartStatus: ThemeImportRestartStatus;
}
export interface ThemeImportRestartStatus { required: boolean; importedAt: string | null; themeCount: number; themes: string[]; }
export interface ImportedThemeCatalog {
  customThemes: Array<{ mode: string; title: string; description: string; entryUrl: string; channel: string }>;
  /** Themes still listed in the installed registry but whose source folder/page vanished outside the app. */
  missingThemes: Array<{ mode: string; title: string; description: string; kind: 'custom' }>;
  options: Array<{ id: string; label: string; description: string; custom: boolean }>;
}

const stagedPacks = new Map<string, ScannedPack>();

function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}
function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function safeArchiveName(raw: string): string {
  if (!raw || raw.includes('\0')) throw new Error('The ZIP contains an invalid path.');
  const normalizedSeparators = raw.replace(/\\/g, '/');
  if (normalizedSeparators.startsWith('/') || /^[a-z]:/i.test(normalizedSeparators)) throw new Error('The ZIP contains an absolute path, which is not allowed.');
  const parts = normalizedSeparators.split('/').filter((part) => part && part !== '.');
  if (!parts.length || parts.some((part) => part === '..' || part.includes('\0'))) throw new Error('The ZIP contains a path traversal entry.');
  return parts.join('/');
}
function readZipEntries(archive: Buffer): Map<string, Buffer> {
  if (archive.length > MAX_ARCHIVE_BYTES) throw new Error('Theme ZIP is too large. The compressed archive limit is 80 MB.');
  let eocd = -1;
  const minOffset = Math.max(0, archive.length - 22 - 65_535);
  for (let offset = archive.length - 22; offset >= minOffset; offset -= 1) {
    if (archive.readUInt32LE(offset) === 0x06054b50) { eocd = offset; break; }
  }
  if (eocd < 0 || eocd + 22 > archive.length) throw new Error('This file is not a valid ZIP archive.');
  const disk = archive.readUInt16LE(eocd + 4);
  const centralDisk = archive.readUInt16LE(eocd + 6);
  const diskEntries = archive.readUInt16LE(eocd + 8);
  const entryCount = archive.readUInt16LE(eocd + 10);
  const centralSize = archive.readUInt32LE(eocd + 12);
  const centralOffset = archive.readUInt32LE(eocd + 16);
  if (disk !== 0 || centralDisk !== 0 || diskEntries !== entryCount) throw new Error('Multi-disk ZIP archives are not supported.');
  if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) throw new Error('ZIP64 archives are not supported by the theme importer yet.');
  if (entryCount > MAX_ENTRIES) throw new Error(`The ZIP has too many entries (${entryCount}); the limit is ${MAX_ENTRIES}.`);
  if (centralOffset + centralSize > eocd || centralOffset + centralSize > archive.length) throw new Error('The ZIP central directory is invalid.');
  const files = new Map<string, Buffer>();
  let position = centralOffset;
  let totalUncompressed = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (position + 46 > archive.length || archive.readUInt32LE(position) !== 0x02014b50) throw new Error('The ZIP central directory has a malformed entry.');
    const madeBy = archive.readUInt16LE(position + 4);
    const flags = archive.readUInt16LE(position + 8);
    const method = archive.readUInt16LE(position + 10);
    const externalAttributes = archive.readUInt32LE(position + 38);
    const expectedCrc = archive.readUInt32LE(position + 16);
    const compressedSize = archive.readUInt32LE(position + 20);
    const uncompressedSize = archive.readUInt32LE(position + 24);
    const nameLength = archive.readUInt16LE(position + 28);
    const extraLength = archive.readUInt16LE(position + 30);
    const commentLength = archive.readUInt16LE(position + 32);
    const localOffset = archive.readUInt32LE(position + 42);
    const end = position + 46 + nameLength + extraLength + commentLength;
    if (end > archive.length) throw new Error('The ZIP has a truncated file name or metadata entry.');
    const nameBuffer = archive.subarray(position + 46, position + 46 + nameLength);
    const rawName = flags & 0x0800 ? nameBuffer.toString('utf8') : nameBuffer.toString('latin1');
    position = end;
    const isDirectory = rawName.endsWith('/');
    // Validate directory names too; a malicious `../` directory entry must not
    // be ignored before the archive path policy sees it.
    const name = safeArchiveName(isDirectory ? rawName.slice(0, -1) : rawName);
    const unixType = (externalAttributes >>> 16) & 0xf000;
    if ((madeBy >>> 8) === 3 && unixType === 0xa000) throw new Error(`The ZIP contains a symbolic-link entry, which is not allowed (${name}).`);
    if ((madeBy >>> 8) === 3 && unixType !== 0 && unixType !== 0x8000 && unixType !== 0x4000) throw new Error(`The ZIP contains an unsupported special file entry (${name}).`);
    if (isDirectory) continue;
    if ((madeBy >>> 8) === 3 && unixType === 0x4000) throw new Error(`The ZIP directory entry is missing its directory marker (${name}).`);
    if (files.has(name)) throw new Error(`The ZIP contains a duplicate path: ${name}`);
    if (flags & 0x2041) throw new Error(`Encrypted ZIP entries are not supported (${name}).`);
    if (method !== 0 && method !== 8) throw new Error(`Unsupported ZIP compression method ${method} for ${name}.`);
    if (uncompressedSize > MAX_FILE_BYTES) throw new Error(`The ZIP entry ${name} exceeds the 24 MB per-file limit.`);
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > MAX_TOTAL_UNCOMPRESSED) throw new Error('The ZIP expands beyond the 160 MB safety limit.');
    if (compressedSize === 0 ? uncompressedSize > 0 : uncompressedSize / compressedSize > MAX_COMPRESSION_RATIO) throw new Error(`The ZIP entry ${name} has an unsafe compression ratio.`);
    if (localOffset + 30 > archive.length || archive.readUInt32LE(localOffset) !== 0x04034b50) throw new Error(`The ZIP local header for ${name} is invalid.`);
    const localFlags = archive.readUInt16LE(localOffset + 6);
    const localMethod = archive.readUInt16LE(localOffset + 8);
    const localNameLength = archive.readUInt16LE(localOffset + 26);
    const localExtraLength = archive.readUInt16LE(localOffset + 28);
    const localNameStart = localOffset + 30;
    const localNameEnd = localNameStart + localNameLength;
    const dataStart = localNameEnd + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (localFlags !== flags || localMethod !== method) throw new Error(`The ZIP local and central headers disagree for ${name}.`);
    if (localNameEnd > archive.length) throw new Error(`The ZIP local header name is truncated for ${name}.`);
    const localNameBuffer = archive.subarray(localNameStart, localNameEnd);
    const localRawName = localFlags & 0x0800 ? localNameBuffer.toString('utf8') : localNameBuffer.toString('latin1');
    if (safeArchiveName(localRawName) !== name) throw new Error(`The ZIP local and central paths disagree for ${name}.`);
    if (dataEnd > centralOffset || dataStart < 0) throw new Error(`The ZIP data for ${name} is truncated or overlaps the central directory.`);
    const compressed = archive.subarray(dataStart, dataEnd);
    let content: Buffer;
    try { content = method === 0 ? Buffer.from(compressed) : inflateRawSync(compressed, { maxOutputLength: MAX_FILE_BYTES }); }
    catch { throw new Error(`The ZIP entry ${name} could not be decompressed safely.`); }
    if (content.length !== uncompressedSize) throw new Error(`The ZIP entry ${name} has an incorrect expanded size.`);
    if (crc32(content) !== expectedCrc) throw new Error(`The ZIP entry ${name} failed its integrity check.`);
    files.set(name, content);
  }
  return files;
}
function normalizeRoot(files: Map<string, Buffer>): { root: string; relativeFiles: Map<string, Buffer> } {
  const paths = [...files.keys()];
  const manifest = paths.find((entry) => entry.toLowerCase().endsWith('/madstation-theme-pack.json') || entry.toLowerCase() === 'madstation-theme-pack.json');
  let root = manifest ? path.posix.dirname(manifest) : '';
  if (root === '.') root = '';
  if (!root) {
    const candidate = paths.find((entry) => /(?:^|\/)themes\/home-[^/]+\.html$/i.test(entry));
    if (candidate) {
      const segments = candidate.split('/');
      const themesIndex = segments.lastIndexOf('themes');
      root = themesIndex > 0 ? segments.slice(0, themesIndex).join('/') : '';
    } else {
      const direct = paths.find((entry) => /^home-[^/]+\.html$/i.test(path.posix.basename(entry)));
      if (direct) root = path.posix.dirname(direct) === '.' ? '' : path.posix.dirname(direct);
    }
  }
  const relativeFiles = new Map<string, Buffer>();
  const prefix = root ? `${root}/` : '';
  for (const [name, content] of files) {
    if (root && !name.startsWith(prefix)) continue;
    const relative = root ? name.slice(prefix.length) : name;
    if (!relative || relative.split('/').some((part) => part === '..')) continue;
    relativeFiles.set(relative, content);
  }
  return { root, relativeFiles };
}
function parseJsonFile<T>(files: Map<string, Buffer>, name: string): T | null {
  const raw = files.get(name);
  if (!raw) return null;
  try { return JSON.parse(raw.toString('utf8')) as T; }
  catch { throw new Error(`${name} is not valid JSON.`); }
}
function slug(value: string): string {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'imported-theme';
}
function plainTitle(html: string, fallback: string): string {
  const match = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html);
  const value = (match?.[1] || fallback).replace(/<[^>]+>/g, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/\s+/g, ' ').trim();
  return value.slice(0, 100) || fallback;
}
function fileFingerprint(filename: string, entryHtml: Buffer, files: Map<string, Buffer>): string {
  const chunks: Buffer[] = [Buffer.from(filename), entryHtml];
  for (const [name, content] of [...files.entries()].filter(([name]) => /^(?:shared-css|visual-js|assets)\//.test(name)).sort(([a], [b]) => a.localeCompare(b))) {
    chunks.push(Buffer.from(`\n${name}\0`), content);
  }
  return sha256(Buffer.concat(chunks));
}
function stagedPack(scanId: string): ScannedPack {
  const pack = stagedPacks.get(scanId);
  if (!pack || Date.now() - pack.createdAt > STAGED_TTL_MS) {
    if (pack) stagedPacks.delete(scanId);
    throw new Error('This scan has expired. Scan the theme ZIP again before importing.');
  }
  return pack;
}
function pruneStages(): void {
  const now = Date.now();
  for (const [id, pack] of stagedPacks) if (now - pack.createdAt > STAGED_TTL_MS) stagedPacks.delete(id);
  while (stagedPacks.size >= MAX_STAGED_PACKS) {
    const oldest = [...stagedPacks.values()].sort((a, b) => a.createdAt - b.createdAt)[0];
    if (!oldest) break;
    stagedPacks.delete(oldest.scanId);
  }
}
function readRegistry(userDataPath: string): InstalledRegistry {
  const file = path.join(userDataPath, 'theme-imports', 'installed-themes.json');
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<InstalledRegistry>;
    if (value.schemaVersion !== 1 || !Array.isArray(value.themes)) return { schemaVersion: 1, themes: [] };
    const themes = value.themes.filter((entry): entry is InstalledThemeEntry => {
      if (!entry || typeof entry !== 'object') return false;
      const item = entry as InstalledThemeEntry;
      const validMode = item.kind === 'custom' && /^custom-[a-z0-9-]{1,64}$/.test(item.mode);
      return validMode && typeof item.title === 'string' && typeof item.description === 'string'
        && typeof item.filename === 'string' && /^home-[a-z0-9][a-z0-9_-]*\.html$/i.test(item.filename)
        && typeof item.entryPath === 'string' && /^themes\/home-[a-z0-9][a-z0-9_-]*\.html$/i.test(item.entryPath)
        && typeof item.fingerprint === 'string' && typeof item.installedAt === 'string';
    });
    return { schemaVersion: 1, themes };
  } catch { return { schemaVersion: 1, themes: [] }; }
}
function writeJsonAtomically(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try { fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' }); fs.renameSync(temp, file); }
  catch (error) { try { fs.unlinkSync(temp); } catch { /* already renamed or removed */ } throw error; }
}
function targetForEntry(entry: InstalledThemeEntry, userDataPath: string): string {
  const root = path.resolve(userDataPath, 'theme-imports', entry.mode);
  const candidate = path.resolve(root, entry.entryPath);
  if (!candidate.startsWith(`${root}${path.sep}`)) throw new Error('Installed theme path is invalid.');
  return candidate;
}
function buildCatalog(userDataPath: string, srcRoot?: string): ImportedThemeCatalog {
  const registry = readRegistry(userDataPath);
  const customThemes: ImportedThemeCatalog['customThemes'] = [];
  const missingThemes: ImportedThemeCatalog['missingThemes'] = [];
  const liveEntries: InstalledThemeEntry[] = [];
  for (const item of registry.themes) {
    let entryUrl = '';
    try {
      const file = targetForEntry(item, userDataPath);
      if (!fs.statSync(file).isFile()) {
        missingThemes.push({ mode: item.mode, title: item.title, description: item.description, kind: 'custom' });
        continue;
      }
      entryUrl = pathToFileURL(file).href;
    } catch {
      missingThemes.push({ mode: item.mode, title: item.title, description: item.description, kind: 'custom' });
      continue;
    }
    liveEntries.push(item);
    customThemes.push({
      mode: item.mode, title: item.title, description: item.description, entryUrl,
      channel: `madstation-home-${item.mode}`,
    });
  }
  // Built-in slots are source-controlled. Normalize the registry on upgrade so legacy
  // override-* records cannot shadow src/home-*.html or remain visible to older UI code.
  let hasLegacyRegistryEntries = false;
  try {
    const saved = JSON.parse(fs.readFileSync(path.join(userDataPath, 'theme-imports', 'installed-themes.json'), 'utf8'));
    hasLegacyRegistryEntries = Array.isArray(saved?.themes) && saved.themes.some((item: unknown) =>
      !item || typeof item !== 'object' || (item as { kind?: unknown }).kind !== 'custom'
      || typeof (item as { mode?: unknown }).mode !== 'string' || !/^custom-[a-z0-9-]{1,64}$/.test((item as { mode: string }).mode));
  } catch { /* no registry yet; first install will create it */ }
  if (srcRoot && (missingThemes.length || hasLegacyRegistryEntries)) {
    const importRoot = path.resolve(userDataPath, 'theme-imports');
    writeRegistryWithConfigs(importRoot, { schemaVersion: 1, themes: liveEntries }, srcRoot);
  }
  const baseOptions = Object.entries(BUILTIN_LABELS).map(([id, label]) => ({ id, label, description: `${label} Mad Station homepage`, custom: false }));
  const customOptions = customThemes.map((item) => ({ id: item.mode, label: item.title, description: item.description, custom: true }));
  return { customThemes, missingThemes, options: [...baseOptions, ...customOptions] };
}
function channelForMode(mode: string): string { return BUILTIN_CHANNELS[mode] || `madstation-home-${mode}`; }
function integrationConfigScript(mode: string, registry: InstalledRegistry): string {
  const options = [
    ...Object.entries(BUILTIN_LABELS).map(([id, label]) => ({ id, label })),
    ...registry.themes.filter((item) => item.kind === 'custom').map((item) => ({ id: item.mode, label: item.title })),
  ];
  const value = { mode, channel: channelForMode(mode), themes: options };
  const serialized = JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return `/* Generated by Mad Station's trusted theme integration adapter. */\nwindow.MadStationThemeConfig = Object.freeze(${serialized});\n`;
}
function writeThemeFiles(targetDir: string, theme: PackTheme, pack: ScannedPack, installMode: string, srcRoot: string, registry: InstalledRegistry): string {
  const themesDir = path.join(targetDir, 'themes');
  const sharedCssDir = path.join(targetDir, 'shared-css');
  const visualJsDir = path.join(targetDir, 'visual-js');
  const assetsDir = path.join(targetDir, 'assets');
  fs.mkdirSync(themesDir, { recursive: true });
  fs.mkdirSync(sharedCssDir, { recursive: true });
  fs.mkdirSync(visualJsDir, { recursive: true });
  fs.mkdirSync(assetsDir, { recursive: true });

  // Each installed theme is self-contained. Resource paths are preserved from the ZIP root.
  for (const [name, content] of pack.files) {
    if (!/^(?:shared-css|visual-js|assets)\//.test(name)) continue;
    const basename = path.posix.basename(name);
    if (name.startsWith('visual-js/') && BLOCKED_SCRIPT_NAME.test(basename)) continue;
    const ext = path.posix.extname(name).toLowerCase();
    if (!SAFE_RESOURCE_EXTENSIONS.has(ext)) continue;
    if (name.startsWith('visual-js/') && ext === '.js') assertSafeExecutable(content.toString('utf8'), name);
    if (name.startsWith('shared-css/') && ext === '.css') assertSafeCss(content.toString('utf8'), name);
    const output = path.resolve(targetDir, name);
    if (!output.startsWith(`${path.resolve(targetDir)}${path.sep}`)) throw new Error(`Unsafe resource path: ${name}`);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    const outputContent = name.startsWith('visual-js/') && ext === '.js'
      ? Buffer.from(reconnectExportedLaunchStubs(content.toString('utf8')), 'utf8')
      : content;
    fs.writeFileSync(output, outputContent);
  }

  // Use the application's vetted Quick Access controller and integration bridge, not a placeholder or ZIP-supplied bridge.
  const quickAccessController = path.join(srcRoot, 'home-quick-access-theme.js');
  const adapterTemplate = path.join(srcRoot, 'home-imported-theme-adapter.js');
  if (!fs.existsSync(quickAccessController) || !fs.existsSync(adapterTemplate)) throw new Error('The built-in theme integration runtime is missing from this Mad Station installation.');
  fs.copyFileSync(quickAccessController, path.join(visualJsDir, 'home-quick-access-theme.js'));
  fs.copyFileSync(adapterTemplate, path.join(visualJsDir, 'theme-live-adapter.js'));
  fs.writeFileSync(path.join(visualJsDir, 'theme-live-config.js'), integrationConfigScript(installMode, registry), 'utf8');
  const fallbackQuickCss = path.join(srcRoot, 'home-quick-access-theme.css');
  if (!fs.existsSync(path.join(sharedCssDir, 'home-quick-access-theme.css')) && fs.existsSync(fallbackQuickCss)) fs.copyFileSync(fallbackQuickCss, path.join(sharedCssDir, 'home-quick-access-theme.css'));

  const sourceHtml = pack.files.get(theme.entryPath);
  if (!sourceHtml) throw new Error(`Theme entry page is missing: ${theme.entryPath}`);
  let html = reconnectExportedLaunchStubs(sanitizeThemeHtml(sourceHtml.toString('utf8'), theme.entryPath, pack.files));
  // Remove a pack-supplied Quick Access controller and any inert placeholder guard. The trusted app-owned versions are appended below.
  html = html.replace(/<script\b(?=[^>]*\bsrc\s*=\s*(['"])[^'"]*(?:home-quick-access-theme\.js|visual-only-guard\.js|theme-live-adapter\.js|theme-live-config\.js)[^'"]*\1)[^>]*>[\s\S]*?<\/script\s*>/gi, '');
  const integrationScripts = [
    '<script src="../visual-js/theme-live-config.js"></script>',
    '<script src="../visual-js/home-quick-access-theme.js"></script>',
    '<script src="../visual-js/theme-live-adapter.js"></script>',
  ].join('\n');
  if (/<\/body\s*>/i.test(html)) html = html.replace(/<\/body\s*>/i, `${integrationScripts}\n</body>`);
  else html += `\n${integrationScripts}\n`;
  fs.writeFileSync(path.join(themesDir, theme.filename), html, 'utf8');
  return `themes/${theme.filename}`;
}
function assertSafeExecutable(source: string, filename: string): void {
  if (BLOCKED_SCRIPT_NAME.test(path.posix.basename(filename))) throw new Error(`The theme pack includes a prohibited integration script: ${filename}`);
  if (BLOCKED_SCRIPT_SOURCE.test(source)) throw new Error(`The theme script ${filename} contains host integration, network, filesystem, or dynamic-code behavior. Remove it before importing.`);
}
function assertSafeCss(source: string, filename: string): void {
  if (/@import\s+(?:url\()?\s*(['"]?)(?:https?:|\/\/|file:|javascript:)/i.test(source)) throw new Error(`${filename} imports a remote stylesheet; theme imports must be self-contained and local.`);
  const urls = [...source.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)].map((match) => String(match[2] || '').trim());
  if (urls.some((url) => /^(?:https?:|\/\/|file:|javascript:)/i.test(url))) throw new Error(`${filename} contains a remote asset reference. Add the asset to the ZIP instead.`);
}
function reconnectExportedLaunchStubs(source: string): string {
  // The visual-only exporter removes the original function body and leaves this exact marker.
  // Reconnect only those known inert stubs; never revive arbitrary ZIP-supplied launcher code.
  return source
    .replace(/function\s+launch\s*\(\s*id\s*\)\s*\{\s*\/\*\s*(?:Visual-only export: app launching disabled|Visual-only pack: app placeholders never launch)\.\s*\*\/\s*\}/gi,
      'function launch(id) { window.MadStationTheme?.launch(id); }')
    .replace(/const\s+launch\s*=\s*\(\s*id\s*\)\s*=>\s*\{\s*\/\*\s*(?:Visual-only export: app launching disabled|Visual-only pack: app placeholders never launch)\.\s*\*\/\s*\}\s*;?/gi,
      'const launch = (id) => { window.MadStationTheme?.launch(id); };');
}

const IMPORTED_THEME_CSP = "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' data:; font-src 'self' data:; connect-src 'none'; frame-src 'none'; child-src 'none'; object-src 'none'; worker-src 'none'; manifest-src 'none'; base-uri 'none'; form-action 'none'";

function htmlAttributeValue(tag: string, attribute: string): string | null {
  const escaped = attribute.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(?:^|\\s)${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  if (!match) return null;
  return match[1] ?? match[2] ?? match[3] ?? '';
}

function assertSafePackReference(rawValue: string, fromPath: string, files: Map<string, Buffer>, context: string, allowEmbeddedImage = false): void {
  const value = rawValue.trim();
  if (!value || value.startsWith('#')) return;
  if (/^data:/i.test(value)) {
    if (allowEmbeddedImage && /^data:image\/(?:png|jpeg|jpg|gif|webp|avif|svg\+xml);base64,[A-Za-z0-9+/=]+$/i.test(value) && value.length <= 720000) return;
    throw new Error(`${context} uses an unsupported embedded resource.`);
  }
  // Absolute filesystem paths, remote URLs and custom schemes are never part
  // of a self-contained theme pack. This also rejects protocol-relative URLs.
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith('/') || value.startsWith('\\')) throw new Error(`${context} references a remote or unsafe resource (${value.slice(0, 120)}).`);
  const resolved = resolvePackReference(fromPath, value);
  if (resolved && !files.has(resolved)) throw new Error(`${context} references a missing local resource: ${value}`);
}

function applyImportedThemeCsp(html: string): string {
  const policy = `<meta http-equiv="Content-Security-Policy" content="${IMPORTED_THEME_CSP}">`;
  if (/<head\b[^>]*>/i.test(html)) return html.replace(/<head\b[^>]*>/i, (opening) => `${opening}\n${policy}`);
  if (/<html\b[^>]*>/i.test(html)) return html.replace(/<html\b[^>]*>/i, (opening) => `${opening}\n<head>${policy}</head>`);
  return `<!doctype html><html><head>${policy}</head><body>${html}</body></html>`;
}

function sanitizeThemeHtml(html: string, filename: string, files: Map<string, Buffer>): string {
  // App bridge scripts from user ZIPs are never executed; Mad Station appends its own narrow adapter.
  html = html.replace(/<script\b(?=[^>]*\bsrc\s*=\s*(['"])[^'"]*\1)[^>]*>[\s\S]*?<\/script\s*>/gi, (tag) => {
    const rawSrc = htmlAttributeValue(tag, 'src') || '';
    const base = path.posix.basename(rawSrc.split(/[?#]/)[0] || '');
    if (BLOCKED_SCRIPT_NAME.test(base)) return '';
    if (/^[a-z][a-z0-9+.-]*:/i.test(rawSrc) || rawSrc.startsWith('/') || rawSrc.startsWith('\\')) throw new Error(`${filename} references an external script (${base || rawSrc}). Scripts must be packaged locally.`);
    if (base === 'home-quick-access-theme.js' || base === 'visual-only-guard.js' || base === 'theme-live-adapter.js' || base === 'theme-live-config.js') return '';
    const resolved = resolvePackReference(filename, rawSrc);
    const script = resolved ? files.get(resolved) : null;
    if (!script) throw new Error(`${filename} references missing local JavaScript: ${rawSrc}`);
    assertSafeExecutable(script.toString('utf8'), resolved!);
    return tag;
  });
  html = html.replace(/<base\b[^>]*>/gi, '');

  // Re-scan every surviving script tag with a parser that handles quoted and
  // unquoted attributes. Otherwise `<script src=https://...>` bypasses the
  // older quote-dependent regular expression and can execute remote code.
  for (const match of html.matchAll(/<script\b[^>]*>/gi)) {
    const rawSrc = htmlAttributeValue(match[0], 'src');
    if (rawSrc === null) continue;
    assertSafePackReference(rawSrc, filename, files, `${filename} script`);
    const resolved = resolvePackReference(filename, rawSrc);
    const script = resolved ? files.get(resolved) : null;
    if (!script) throw new Error(`${filename} references missing local JavaScript: ${rawSrc}`);
    assertSafeExecutable(script.toString('utf8'), resolved!);
  }

  html = html.replace(/<link\b[^>]*>/gi, (tag) => {
    const rel = htmlAttributeValue(tag, 'rel') || '';
    if (!/(?:^|\s)stylesheet(?:\s|$)/i.test(rel)) return tag;
    const href = htmlAttributeValue(tag, 'href');
    if (href === null || !href) return tag;
    assertSafePackReference(href, filename, files, `${filename} stylesheet`);
    return tag;
  });

  // Event-handler attributes are executable JavaScript; remove quoted and
  // unquoted forms, not only the quoted attributes used by the older filter.
  html = html.replace(/\s+on[a-z][a-z0-9_-]*\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  // Remote media/styles are rejected. The attribute parser below additionally
  // covers unquoted URLs and absolute paths that the original filter missed.
  html = html.replace(/(<(?:img|source|video|audio|track|iframe|object|embed)\b[^>]*(?:src|srcset|data|poster)\s*=\s*)(['"])(.*?)\2/gi, (whole, _prefix: string, _quote: string, raw: string) => {
    assertSafePackReference(raw, filename, files, `${filename} media`, true);
    return whole;
  });
  for (const match of html.matchAll(/<(?:img|source|video|audio|track|iframe|object|embed)\b[^>]*>/gi)) {
    const tag = match[0];
    for (const attribute of ['src', 'poster', 'data']) {
      const value = htmlAttributeValue(tag, attribute);
      if (value !== null) assertSafePackReference(value, filename, files, `${filename} media`, true);
    }
    const srcset = htmlAttributeValue(tag, 'srcset');
    if (srcset !== null) {
      if (/^data:/i.test(srcset.trim())) assertSafePackReference(srcset, filename, files, `${filename} media`, true);
      else for (const candidate of srcset.split(',').map((part) => part.trim()).filter(Boolean)) {
        assertSafePackReference(candidate.split(/\s+/)[0], filename, files, `${filename} media`, true);
      }
    }
  }

  // A srcdoc iframe is an independent inline HTML program; nested browsing
  // contexts are also disabled by the CSP below.
  html = html.replace(/\s+srcdoc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  html = html.replace(/<meta\b[^>]*>/gi, (tag) => (htmlAttributeValue(tag, 'http-equiv') || '').toLowerCase() === 'refresh' ? '' : tag);

  // Links with a scheme or absolute path must not navigate a packaged theme to
  // a remote site, custom protocol, or arbitrary filesystem resource.
  html = html.replace(/<a\b[^>]*>/gi, (tag) => {
    const href = htmlAttributeValue(tag, 'href');
    if (href === null || href.startsWith('#')) return tag;
    if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('/') || href.startsWith('\\')) {
      return tag.replace(/\s+href\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i, ' href="#" aria-disabled="true"');
    }
    return tag;
  });

  for (const inline of html.matchAll(/<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    const source = inline[1] || '';
    if (source.trim()) assertSafeExecutable(source, `${filename} inline script`);
  }
  // CSS references in inline style blocks and attributes may not fetch from the network.
  const cssSources = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)].map((m) => m[1] || '');
  cssSources.push(...[...html.matchAll(/\bstyle\s*=\s*(['"])(.*?)\1/gi)].map((m) => m[2] || ''));
  for (const css of cssSources) assertSafeCss(css, `${filename} inline CSS`);
  return applyImportedThemeCsp(html);
}
function resolvePackReference(fromPath: string, rawRef: string): string | null {
  const value = String(rawRef || '').trim().replace(/[?#].*$/, '');
  if (!value || value.startsWith('#') || /^(?:[a-z][a-z0-9+.-]*:|\/\/|\/)/i.test(value)) return null;
  const joined = path.posix.normalize(path.posix.join(path.posix.dirname(fromPath), value.replace(/\\/g, '/')));
  if (joined === '..' || joined.startsWith('../') || joined.startsWith('/')) throw new Error(`Theme resource path escapes the ZIP package: ${rawRef}`);
  return joined;
}
function sanitizeCssAndAssets(files: Map<string, Buffer>): void {
  for (const [name, content] of files) {
    if (name.startsWith('shared-css/') && path.posix.extname(name).toLowerCase() === '.css') assertSafeCss(content.toString('utf8'), name);
    if (name.startsWith('visual-js/') && path.posix.extname(name).toLowerCase() === '.js' && !BLOCKED_SCRIPT_NAME.test(path.posix.basename(name)) && path.posix.basename(name) !== 'home-quick-access-theme.js') assertSafeExecutable(content.toString('utf8'), name);
  }
}
function findSourceFingerprint(themeManifest: unknown, filename: string): string | undefined {
  if (!themeManifest || typeof themeManifest !== 'object') return undefined;
  const themes = (themeManifest as { themes?: unknown }).themes;
  if (!Array.isArray(themes)) return undefined;
  for (const item of themes) {
    if (!item || typeof item !== 'object') continue;
    const value = item as Record<string, unknown>;
    if (value.filename === filename && typeof value.sourceFingerprint === 'string' && /^[a-f0-9]{64}$/i.test(value.sourceFingerprint)) return value.sourceFingerprint.toLowerCase();
  }
  return undefined;
}
function installedKey(item: InstalledThemeEntry): string { return `custom:${item.mode}`; }
function customModeForIdentity(id: string, title: string, filename: string): string {
  if (/^custom-[a-z0-9-]{1,64}$/.test(id)) return id;
  const identity = id || title || filename.replace(/^home-|\.html$/gi, '');
  return `custom-${slug(identity).slice(0, 55)}`;
}

export function scanThemePackZip(zipPath: string, srcRoot: string, userDataPath: string, liveThemes: Array<{ id: string; title: string; filename: string; fingerprint: string }> = []): ThemePackScanResult {
  const zipBuffer = fs.readFileSync(zipPath);
  const rawFiles = readZipEntries(zipBuffer);
  const { root, relativeFiles } = normalizeRoot(rawFiles);
  const manifest = parseJsonFile<Record<string, unknown>>(relativeFiles, 'madstation-theme-pack.json');
  const legacyManifest = parseJsonFile<Record<string, unknown>>(relativeFiles, 'theme-manifest.json');
  if (!relativeFiles.size) throw new Error('The ZIP did not contain a recognized theme package folder.');
  if (manifest && manifest.format !== FORMAT) throw new Error('The ZIP manifest is not a Mad Station theme pack.');
  const entries: Array<Record<string, unknown>> = [];
  if (manifest && Array.isArray(manifest.themes)) {
    for (const item of manifest.themes) if (item && typeof item === 'object' && !Array.isArray(item)) entries.push(item as Record<string, unknown>);
  }
  if (!entries.length) {
    const prefix = 'themes/';
    for (const name of relativeFiles.keys()) {
      if (name.startsWith(prefix) && /^home-[a-z0-9][a-z0-9_-]*\.html$/i.test(path.posix.basename(name))) entries.push({ entry: name, id: path.posix.basename(name).replace(/^home-|\.html$/gi, ''), title: '' });
    }
    if (!entries.length) {
      for (const name of relativeFiles.keys()) {
        if (/^home-[a-z0-9][a-z0-9_-]*\.html$/i.test(name)) entries.push({ entry: name, id: path.posix.basename(name).replace(/^home-|\.html$/gi, ''), title: '' });
      }
    }
  }
  if (!entries.length) throw new Error('No theme pages were found. Include themes/home-*.html or a madstation-theme-pack.json manifest.');
  if (entries.length > 200) throw new Error('The theme ZIP contains more than 200 themes.');
  const themeManifest = legacyManifest;
  const themeSeen = new Set<string>();
  const idsSeen = new Set<string>();
  const filenamesSeen = new Set<string>();
  const themeRecords: PackTheme[] = [];
  const registry = readRegistry(userDataPath);
  const installedByKey = new Map(registry.themes.map((item) => [installedKey(item), item]));
  const sourceByFilename = new Map(liveThemes.map((theme) => [theme.filename, theme]));
  for (const item of entries) {
    const rawEntry = typeof item.entry === 'string' ? item.entry : typeof item.path === 'string' ? item.path : '';
    let entryPath = safeArchiveName(rawEntry);
    if (!relativeFiles.has(entryPath) && relativeFiles.has(`themes/${entryPath}`)) entryPath = `themes/${entryPath}`;
    if (!relativeFiles.has(entryPath)) throw new Error(`A theme entry page is missing from the ZIP: ${rawEntry || '(empty entry)'}`);
    if (!/^themes\/home-[a-z0-9][a-z0-9_-]*\.html$/i.test(entryPath) && !/^home-[a-z0-9][a-z0-9_-]*\.html$/i.test(entryPath)) throw new Error(`Theme entry must be a local home-*.html file: ${entryPath}`);
    const filename = path.posix.basename(entryPath);
    const html = relativeFiles.get(entryPath)!.toString('utf8');
    if (html.length > MAX_FILE_BYTES) throw new Error(`Theme page ${filename} is too large.`);
    const hasDeclaredId = typeof item.id === 'string' && item.id.trim().length > 0;
    const declaredId = hasDeclaredId ? String(item.id).trim() : filename.replace(/^home-|\.html$/gi, '');
    const id = slug(declaredId);
    const uniqueness = `${id}:${filename}`;
    if (themeSeen.has(uniqueness) || idsSeen.has(id) || filenamesSeen.has(filename.toLowerCase())) throw new Error(`The ZIP contains duplicate theme IDs or filenames for ${filename}.`);
    themeSeen.add(uniqueness);
    idsSeen.add(id);
    filenamesSeen.add(filename.toLowerCase());
    const declaredTitle = typeof item.title === 'string' ? item.title.trim() : '';
    const title = (declaredTitle || plainTitle(html, filename.replace(/^home-|\.html$/i, ''))).slice(0, 100);
    const description = (typeof item.description === 'string' && item.description.trim() ? item.description.trim() : `Imported ${title} homepage theme.`).slice(0, 240);
    const normalizedFilename = filename.toLowerCase();
    const filenameBuiltinMode = BUILTIN_MODE_BY_FILENAME[normalizedFilename] || null;
    const filenameBuiltinId = BUILTIN_ID_BY_FILENAME[normalizedFilename] || '';
    const idMatchesBuiltin = !hasDeclaredId || id === filenameBuiltinId
      || id === slug(filename.replace(/^home-|\.html$/i, '')) || id === filenameBuiltinMode;
    const titleMatchesBuiltin = !declaredTitle || (filenameBuiltinMode !== null
      && slug(title) === slug(BUILTIN_LABELS[filenameBuiltinMode] || ''));
    // A matching filename helps identify bundled source content for status reporting only.
    // ZIP imports can never replace a built-in slot; all imported pages receive custom IDs.
    const builtinMode = filenameBuiltinMode && idMatchesBuiltin && titleMatchesBuiltin ? filenameBuiltinMode : null;
    const sourceFingerprint = typeof item.sourceFingerprint === 'string' && /^[a-f0-9]{64}$/i.test(item.sourceFingerprint)
      ? item.sourceFingerprint.toLowerCase() : findSourceFingerprint(themeManifest, filename);
    const actualPackageFingerprint = fileFingerprint(filename, relativeFiles.get(entryPath)!, relativeFiles);
    const declaredPackageFingerprint = typeof item.packageFingerprint === 'string' && /^[a-f0-9]{64}$/i.test(item.packageFingerprint)
      ? item.packageFingerprint.toLowerCase() : undefined;
    // Trust only the checksum computed from the bytes we scanned. Metadata hashes are comparisons, not authority.
    const fingerprint = actualPackageFingerprint;
    const installedCustomMode = installedByKey.get(`custom:${customModeForIdentity(id, title, filename)}`);
    const installedMode = installedCustomMode;
    const live = sourceByFilename.get(filename);
    let status: PackTheme['status'] = builtinMode || installedMode ? 'changed' : 'new';
    const packageMatchesDeclaration = Boolean(declaredPackageFingerprint && declaredPackageFingerprint === actualPackageFingerprint);
    if (installedMode?.fingerprint === fingerprint) status = 'current';
    else if (builtinMode && packageMatchesDeclaration && sourceFingerprint && live?.fingerprint === sourceFingerprint) status = 'current';
    else if (builtinMode || installedMode) status = 'changed';
    else status = 'new';
    const fallbackTitle = BUILTIN_LABELS[builtinMode || ''] || title;
    themeRecords.push({
      id, title: title || fallbackTitle, description, filename, entryPath, fingerprint, sourceFingerprint,
      builtinMode, status, defaultAction: 'add',
    });
  }
  // Validate only the executable/style dependencies the pack might use; reject suspicious code before it can be staged.
  sanitizeCssAndAssets(relativeFiles);
  for (const theme of themeRecords) {
    const html = relativeFiles.get(theme.entryPath)!.toString('utf8');
    sanitizeThemeHtml(html, theme.entryPath, relativeFiles);
  }
  const manifestInstructions = typeof manifest?.instructionsFile === 'string' ? manifest.instructionsFile : '';
  const expectedInstruction = manifestInstructions ? safeArchiveName(manifestInstructions) : 'THEME_INTEGRATION.md';
  const instructionCandidates = [expectedInstruction, 'THEME_INTEGRATION.md', 'AI_START_HERE.md', 'README.md'].filter((item, index, all) => all.indexOf(item) === index);
  const instructionPath = instructionCandidates.find((name) => relativeFiles.has(name)) || null;
  const instructionText = instructionPath ? relativeFiles.get(instructionPath)!.toString('utf8').slice(0, 60_000) : null;
  const warnings: string[] = [];
  if (!manifest) warnings.push('No madstation-theme-pack.json was found. Themes were discovered by their home-*.html pages and will use the built-in integration rules.');
  if (!instructionPath) warnings.push('No theme integration instruction file was found. This ZIP is still importable: the built-in action mappings and safe adapter will reconnect supported buttons.');
  if (manifest && manifest.integrationContract !== CONTRACT) warnings.push('The theme pack uses an unknown or older integration contract. The importer will use the current built-in adapter instead of executing ZIP-supplied bridges.');
  if (instructionText && !/Mad Station|MadStationTheme|theme/i.test(instructionText)) warnings.push('The declared instruction file does not look like a Mad Station theme integration guide; built-in mappings will take precedence.');
  const scanId = randomUUID();
  const pack: ScannedPack = {
    scanId, packageTitle: typeof manifest?.packageTitle === 'string' ? manifest.packageTitle.slice(0, 120) : 'Imported Mad Station themes',
    sourcePath: path.resolve(zipPath), packageRoot: root, files: relativeFiles, themes: themeRecords,
    instructionPath, instructionText, manifestPresent: Boolean(manifest), warnings, createdAt: Date.now(),
  };
  pruneStages();
  stagedPacks.set(scanId, pack);
  return {
    ok: true, scanId, packageTitle: pack.packageTitle, manifestPresent: pack.manifestPresent,
    instructionsPresent: Boolean(instructionPath), instructionsFile: instructionPath,
    themeCount: themeRecords.length, fileCount: relativeFiles.size,
    uncompressedBytes: [...relativeFiles.values()].reduce((sum, entry) => sum + entry.length, 0),
    warnings: [...warnings, 'Imports are always added as separate custom themes. Built-in app themes are edited only in the project source files.'],
    themes: themeRecords.map(({ entryPath: _entryPath, sourceFingerprint: _sourceFingerprint, ...theme }) => theme),
  };
}

function chooseInstallMode(choice: ThemePackImportChoice, theme: PackTheme, usedModes: Set<string>, registry: InstalledRegistry): { mode: string; kind: 'custom' } {
  if (choice.action !== 'add') throw new Error('Theme ZIP imports can only add separate custom themes. Edit src/home-*.html to change a built-in theme.');
  // ZIP imports never shadow source-controlled built-in themes. Stable IDs let an imported
  // custom theme be updated in place without changing a built-in page.
  const base = customModeForIdentity(theme.id, theme.title, theme.filename);
  const existingCustom = registry.themes.find((entry) => entry.mode === base && entry.kind === 'custom');
  if (existingCustom) return { mode: existingCustom.mode, kind: 'custom' };
  let mode = base;
  let counter = 2;
  while (usedModes.has(mode)) { mode = `${base}-${counter}`; counter += 1; }
  return { mode, kind: 'custom' };
}
function installDir(importRoot: string, mode: string, _kind: 'custom'): string {
  return path.join(importRoot, mode);
}
function writeRegistryWithConfigs(importRoot: string, registry: InstalledRegistry, srcRoot: string): void {
  // Quick Access is dynamic across all themes, so update the generated config for every installed theme after catalogue changes.
  for (const entry of registry.themes) {
    const dir = installDir(importRoot, entry.mode, entry.kind);
    const configPath = path.join(dir, 'visual-js', 'theme-live-config.js');
    if (fs.existsSync(path.join(dir, 'themes', entry.filename))) fs.writeFileSync(configPath, integrationConfigScript(entry.mode, registry), 'utf8');
  }
  writeJsonAtomically(path.join(importRoot, 'installed-themes.json'), registry);
  // Preserve a copy of the integration contract in the user's writable theme package area.
  const instructionSource = path.join(srcRoot, 'THEME_INTEGRATION.md');
  if (fs.existsSync(instructionSource)) {
    try { fs.copyFileSync(instructionSource, path.join(importRoot, 'THEME_INTEGRATION.md')); } catch { /* registry remains valid if this convenience copy cannot be written */ }
  }
}

export function importScannedThemePack(userDataPath: string, srcRoot: string, scanId: unknown, choicesInput: unknown): ThemePackImportResult {
  if (typeof scanId !== 'string' || !/^[a-f0-9-]{36}$/i.test(scanId)) throw new Error('Theme scan token is invalid. Scan the ZIP again.');
  if (!Array.isArray(choicesInput) || choicesInput.length < 1 || choicesInput.length > 200) throw new Error('Select at least one theme to import.');
  const pack = stagedPack(scanId);
  const choiceById = new Map<string, ThemePackImportChoice>();
  for (const raw of choicesInput) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('The theme selection is invalid.');
    const value = raw as Partial<ThemePackImportChoice>;
    if (typeof value.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.id) || value.action !== 'add') throw new Error('A selected theme action is invalid.');
    if (choiceById.has(value.id)) throw new Error('The theme selection contains duplicates.');
    choiceById.set(value.id, { id: value.id, action: 'add' });
  }
  const selectedThemes = pack.themes.filter((theme) => choiceById.has(theme.id));
  if (selectedThemes.length !== choiceById.size) throw new Error('One or more selected themes are no longer present in the scanned ZIP. Scan the ZIP again.');
  const importRoot = path.join(userDataPath, 'theme-imports');
  fs.mkdirSync(importRoot, { recursive: true });
  const previousRegistry = readRegistry(userDataPath);
  const nextRegistry: InstalledRegistry = { schemaVersion: 1, themes: [...previousRegistry.themes] };
  const usedModes = new Set(nextRegistry.themes.filter((item) => item.kind === 'custom').map((item) => item.mode));
  const stagedDirs: string[] = [];
  const installedTargets: string[] = [];
  const backupDirs: Array<{ backup: string; target: string }> = [];
  const installed: ThemePackImportResult['installed'] = [];
  let backupCount = 0;
  try {
    const prepared: Array<{ theme: PackTheme; choice: ThemePackImportChoice; mode: string; kind: 'custom'; stage: string; entryPath: string }> = [];
    const destinationKeys = new Set<string>();
    for (const theme of selectedThemes) {
      const choice = choiceById.get(theme.id)!;
      const install = chooseInstallMode(choice, theme, usedModes, nextRegistry);
      const destinationKey = `${install.kind}:${install.mode}`;
      if (destinationKeys.has(destinationKey)) throw new Error(`More than one selected theme targets ${install.mode}. Select only one version of each custom theme.`);
      destinationKeys.add(destinationKey);
      usedModes.add(install.mode);
      const stage = path.join(importRoot, `.stage-${randomUUID()}`);
      fs.mkdirSync(stage, { recursive: true });
      stagedDirs.push(stage);
      const entryPath = writeThemeFiles(stage, theme, pack, install.mode, srcRoot, nextRegistry);
      prepared.push({ theme, choice, mode: install.mode, kind: install.kind, stage, entryPath });
    }
    const now = new Date().toISOString();
    for (const item of prepared) {
      const target = installDir(importRoot, item.mode, item.kind);
      const sameKey = (candidate: InstalledThemeEntry) => candidate.mode === item.mode && candidate.kind === item.kind;
      const oldEntry = nextRegistry.themes.find(sameKey);
      const stage = item.stage;
      if (fs.existsSync(target)) {
        const backup = path.join(importRoot, '.backups', `${item.mode}-${Date.now()}-${randomUUID()}`);
        fs.mkdirSync(path.dirname(backup), { recursive: true });
        fs.renameSync(target, backup);
        backupDirs.push({ backup, target });
        backupCount += 1;
      }
      fs.renameSync(stage, target);
      installedTargets.push(target);
      const entry: InstalledThemeEntry = {
        mode: item.mode, title: item.theme.title, description: item.theme.description, filename: item.theme.filename,
        entryPath: item.entryPath, fingerprint: item.theme.fingerprint,
        ...(item.theme.sourceFingerprint ? { sourceFingerprint: item.theme.sourceFingerprint } : {}),
        kind: item.kind, installedAt: now,
      };
      if (oldEntry) nextRegistry.themes = nextRegistry.themes.filter((candidate) => !sameKey(candidate));
      // If a previous custom-theme filename was imported under a different identifier, the custom mode remains authoritative.
      nextRegistry.themes.push(entry);
      installed.push({ mode: item.mode, title: item.theme.title, kind: item.kind, status: item.theme.status });
    }
    writeRegistryWithConfigs(importRoot, nextRegistry, srcRoot);
    const restartStatus: ThemeImportRestartStatus = {
      required: false,
      importedAt: now,
      themeCount: installed.length,
      themes: installed.map((item) => item.title).slice(0, 200),
    };
    // The homepage switcher consumes madstation:theme-imported and reloads the
    // relevant iframe in-process. Clear any stale restart marker left by older
    // versions instead of showing a restart banner for ordinary theme changes.
    try { fs.rmSync(path.join(importRoot, 'restart-required.json'), { force: true }); } catch { /* live theme application remains usable */ }
    stagedPacks.delete(scanId);
    return { ok: true, installed, catalog: buildCatalog(userDataPath, srcRoot), backupCount, restartRequired: false, restartStatus };
  } catch (error) {
    for (const stage of stagedDirs) { try { fs.rmSync(stage, { recursive: true, force: true }); } catch { /* best-effort staging cleanup */ } }
    // Roll back target directories if the registry could not be committed.
    for (const target of installedTargets.reverse()) { try { fs.rmSync(target, { recursive: true, force: true }); } catch { /* best-effort rollback */ } }
    for (const item of backupDirs.reverse()) {
      try { fs.mkdirSync(path.dirname(item.target), { recursive: true }); fs.renameSync(item.backup, item.target); } catch { /* retain backup folder for manual recovery */ }
    }
    throw error;
  }
}

export function getImportedThemeCatalog(userDataPath: string, srcRoot?: string): ImportedThemeCatalog { return buildCatalog(userDataPath, srcRoot); }

/** Remove an installed custom theme. Built-in themes cannot be replaced or removed. */
export function removeImportedTheme(userDataPath: string, srcRoot: string, modeInput: unknown): {
  ok: true;
  removed: { mode: string; title: string; kind: 'custom' };
  catalog: ImportedThemeCatalog;
} {
  if (typeof modeInput !== 'string' || !/^custom-[a-z0-9-]{1,64}$/.test(modeInput)) {
    throw new Error('Choose a valid installed theme to remove.');
  }
  const importRoot = path.resolve(userDataPath, 'theme-imports');
  const previous = readRegistry(userDataPath);
  const entry = previous.themes.find((item) => item.mode === modeInput);
  if (!entry) throw new Error('This theme has no imported installation to remove. Built-in themes cannot be deleted.');

  const target = path.resolve(installDir(importRoot, entry.mode, entry.kind));
  if (!target.startsWith(`${importRoot}${path.sep}`)) throw new Error('Installed theme path is invalid.');
  const quarantine = path.join(importRoot, `.deleting-${randomUUID()}`);
  const next: InstalledRegistry = { schemaVersion: 1, themes: previous.themes.filter((item) => !(item.mode === entry.mode && item.kind === entry.kind)) };
  let moved = false;
  try {
    if (fs.existsSync(target)) {
      fs.renameSync(target, quarantine);
      moved = true;
    }
    // Refresh the config inside every remaining imported theme before publishing the new registry.
    writeRegistryWithConfigs(importRoot, next, srcRoot);
    if (moved) {
      // Once it is absent from the registry the theme is no longer app-visible. Best-effort cleanup
      // removes its files; a cleanup error must not resurrect it in the catalogue.
      try { fs.rmSync(quarantine, { recursive: true, force: true }); } catch { /* orphaned quarantine is not loaded by the app */ }
    }
    return { ok: true, removed: { mode: entry.mode, title: entry.title, kind: entry.kind }, catalog: buildCatalog(userDataPath, srcRoot) };
  } catch (error) {
    if (moved && fs.existsSync(quarantine) && !fs.existsSync(target)) {
      try { fs.renameSync(quarantine, target); } catch { /* retain the quarantine if recovery itself fails */ }
    }
    try { writeRegistryWithConfigs(importRoot, previous, srcRoot); } catch { /* best-effort rollback of registry/config files */ }
    throw error;
  }
}


export function getThemeImportRestartStatus(userDataPath: string): ThemeImportRestartStatus {
  const file = path.join(userDataPath, 'theme-imports', 'restart-required.json');
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<ThemeImportRestartStatus>;
    if (raw.required !== true || typeof raw.importedAt !== 'string' || typeof raw.themeCount !== 'number' || !Number.isFinite(raw.themeCount) || !Array.isArray(raw.themes)) {
      return { required: false, importedAt: null, themeCount: 0, themes: [] };
    }
    return { required: true, importedAt: raw.importedAt, themeCount: Math.max(0, Math.min(200, Math.trunc(raw.themeCount as number))), themes: raw.themes.filter((item): item is string => typeof item === 'string').slice(0, 200) };
  } catch { return { required: false, importedAt: null, themeCount: 0, themes: [] }; }
}
export function clearThemeImportRestartStatus(userDataPath: string): void {
  try { fs.rmSync(path.join(userDataPath, 'theme-imports', 'restart-required.json'), { force: true }); } catch { /* A stale notice is preferable to blocking app startup if cleanup fails. */ }
}
export function getThemeImportInstructionPath(srcRoot: string): string { return path.join(srcRoot, 'THEME_INTEGRATION.md'); }

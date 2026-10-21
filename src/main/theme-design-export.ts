import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';

// This is a metadata preference list, not an inventory. Actual themes are discovered
// from the current source tree every time the Developer panel scans or exports.
export const THEME_DESIGN_EXPORTS = [
  { id: 'simple', title: 'Simple', filename: 'home-v2.html', description: 'Clean launcher and layered parallax background.' },
  { id: 'parallax', title: '3D Parallax', filename: 'home-v3.html', description: 'Depth, tilt and layered app cards.' },
  { id: 'parallax-big', title: '3D Parallax Big App', filename: 'home-v4.html', description: 'Large, immersive parallax composition.' },
  { id: 'simple-retro', title: 'Simple Retro', filename: 'home-retro.html', description: 'Classic retro desktop scene.' },
  { id: 'retro-complex', title: 'Retro Complex', filename: 'home-retro-complex.html', description: 'CRT monitor, disks and analog gauges.' },
  { id: 'claymorphism', title: 'Claymorphism', filename: 'home-claymorphism.html', description: 'Soft dimensional cards and panels.' },
  { id: 'glass', title: 'Glass', filename: 'home-glass.html', description: 'Translucent surfaces and layered glass.' },
  { id: 'galaxy', title: 'Galaxy', filename: 'home-galaxy.html', description: 'Starfield, planets and orbiting elements.' },
  { id: 'parallax-jungle', title: 'Parallax Jungle', filename: 'home-parallax-jungle.html', description: 'Forest layers, foliage and lighting.' },
  { id: 'isometric-world', title: 'Isometric World', filename: 'home-isometric-world.html', description: 'Isometric landscape and interactive app objects.' },
] as const;
export type ThemeDesignExportId = string;
export interface DiscoveredThemeDesign {
  id: string; title: string; filename: string; description: string;
  fingerprint: string; dependencyCount: number; missingDependencies: string[]; modifiedAtMs: number;
}
interface ResolvedThemeDesign extends DiscoveredThemeDesign { sourceRoot: string; sourceFilename: string; }
const KNOWN_THEME_BY_FILENAME = new Map<string, (typeof THEME_DESIGN_EXPORTS)[number]>(THEME_DESIGN_EXPORTS.map((theme) => [theme.filename, theme] as [string, (typeof THEME_DESIGN_EXPORTS)[number]]));
// Quick Access is included through a constrained visual-only adapter below: its menu,
// keyboard behavior and local appearance controls work in exported previews, but it
// cannot send commands to the application host.
const VISUAL_JS = new Set(['appearance.js', 'home-parallax-background.js', 'home-v5.js', 'home-v3.js', 'home-v4.js', 'home-quick-access-theme.js']);
const BLOCKED_SCRIPT_NAME = /(?:^|[-_.])(bridge|preload|ipc|host|native|integration)(?:[-_.]|$)|settings-bridge|theme-live-(?:adapter|config)/i;
const BLOCKED_SCRIPT_SOURCE = /window\.parent\.postMessage|window\.aiHub|ipcRenderer|require\s*\(|\bprocess\.|\bfetch\s*\(|XMLHttpRequest|WebSocket|MadHome\.memoryAction|MadHomeApps\s*\.\s*setLauncher/i;
const WINDOW_RULES = {
  defaultWidth: 1450, defaultHeight: 920, minimumWidth: 900, minimumHeight: 560,
  viewportTests: [[1450, 920], [1280, 800], [900, 560], [1920, 1080]],
  behavior: 'Fluid layout: fit the complete primary UI in the default window where practical, adapt when resized/maximized, and avoid page-level scrolling at the default size.',
  note: 'These are native window dimensions; the usable content viewport may be smaller because of app chrome.',
};

function isWithin(basePath: string, candidatePath: string): boolean {
  const relative = path.relative(path.resolve(basePath), path.resolve(candidatePath));
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}
function readText(sourceRoot: string, filename: string): string {
  const root = path.resolve(sourceRoot);
  const fullPath = path.resolve(root, filename);
  if (!isWithin(root, fullPath)) throw new Error('Invalid theme source path.');
  return fs.readFileSync(fullPath, 'utf8');
}
function safeLocalRef(raw: string): string | null {
  const value = String(raw || '').trim().replace(/[?#].*$/, '');
  if (!value || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(value) || value.startsWith('/')) return null;
  try { return decodeURIComponent(value); } catch { return value; }
}
function resolveLocalFile(sourceRoot: string, fromFile: string, rawRef: string): string | null {
  const ref = safeLocalRef(rawRef);
  if (!ref) return null;
  const sourcePath = path.resolve(path.dirname(fromFile), ref);
  const appRoot = path.dirname(path.resolve(sourceRoot));
  if (!isWithin(appRoot, sourcePath)) return null;
  return sourcePath;
}
function outputResourcePath(category: 'shared-css' | 'visual-js', sourceRoot: string, sourcePath: string): string {
  const root = path.resolve(sourceRoot);
  const appRoot = path.dirname(root);
  // Imported theme source roots live at theme-imports/<theme-id> and their page
  // files are nested under `themes/`. Export resources relative to that page
  // directory so repeated `themes/` segments do not leak into package paths.
  const segments = root.split(path.sep);
  const importRootIndex = segments.lastIndexOf('theme-imports');
  const isInstalledThemeRoot = importRootIndex >= 0 && importRootIndex + 1 < segments.length;
  const installedThemePageRoot = path.join(root, 'themes');
  const installedCategoryRoot = path.join(root, category);
  const resourceBase = isInstalledThemeRoot && isWithin(installedCategoryRoot, sourcePath)
    ? installedCategoryRoot
    : isInstalledThemeRoot && isWithin(installedThemePageRoot, sourcePath)
      ? installedThemePageRoot
      : root;
  const relative = isWithin(resourceBase, sourcePath)
    ? path.relative(resourceBase, sourcePath)
    : path.join('_project', path.relative(appRoot, sourcePath));
  // CSS/JS files from different packs can share names with different content.
  const namespace = isInstalledThemeRoot ? segments[importRootIndex + 1] : '';
  return `${category}/${namespace ? `${namespace}/` : ''}${relative.split(path.sep).join('/')}`;
}
function outputAssetPath(sourceRoot: string, sourcePath: string): string {
  const appRoot = path.dirname(path.resolve(sourceRoot));
  return `assets/${path.relative(appRoot, sourcePath).split(path.sep).join('/')}`;
}
function relativeOutputUrl(fromOutputPath: string, toOutputPath: string): string {
  const value = path.posix.relative(path.posix.dirname(fromOutputPath), toOutputPath);
  return value.startsWith('.') ? value : `./${value}`;
}
function replaceFunctionBody(text: string, pattern: RegExp): { text: string; changed: boolean } {
  const match = pattern.exec(text);
  if (!match) return { text, changed: false };
  const openBrace = text.indexOf('{', match.index);
  if (openBrace < 0) return { text, changed: false };
  let depth = 0; let quote = ''; let escaped = false; let lineComment = false; let blockComment = false;
  for (let i = openBrace; i < text.length; i += 1) {
    const ch = text[i]; const next = text[i + 1] || '';
    if (lineComment) { if (ch === '\n') lineComment = false; continue; }
    if (blockComment) { if (ch === '*' && next === '/') { blockComment = false; i += 1; } continue; }
    if (quote) { if (escaped) escaped = false; else if (ch === '\\') escaped = true; else if (ch === quote) quote = ''; continue; }
    if (ch === '/' && next === '/') { lineComment = true; i += 1; continue; }
    if (ch === '/' && next === '*') { blockComment = true; i += 1; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return { text: `${text.slice(0, openBrace + 1)} /* Visual-only export: app launching disabled. */ ${text.slice(i)}`, changed: true };
    }
  }
  return { text, changed: false };
}
function disableLaunchFunctions(source: string): { text: string; patches: string[] } {
  let text = source; const patches: string[] = [];
  for (const [pattern, label] of [
    [/function\s+launch\s*\(\s*id\s*\)\s*\{/m, 'function launch()'],
    [/const\s+launch\s*=\s*\(\s*id\s*\)\s*=>\s*\{/m, 'const launch = (id)'],
  ] as Array<[RegExp, string]>) {
    const result = replaceFunctionBody(text, pattern);
    if (result.changed) { text = result.text; patches.push(label); }
  }
  return { text, patches };
}
function replaceFunctionBodyWith(text: string, pattern: RegExp, body: string): { text: string; changed: boolean } {
  const match = pattern.exec(text);
  if (!match) return { text, changed: false };
  // This pattern includes a default object parameter (`detail = {}`), so choose
  // the last opening brace in the matched signature: the actual function body.
  const openBrace = text.lastIndexOf('{', match.index + match[0].length - 1);
  if (openBrace < 0) return { text, changed: false };
  let depth = 0; let quote = ''; let escaped = false; let lineComment = false; let blockComment = false;
  for (let i = openBrace; i < text.length; i += 1) {
    const ch = text[i]; const next = text[i + 1] || '';
    if (lineComment) { if (ch === '\n') lineComment = false; continue; }
    if (blockComment) { if (ch === '*' && next === '/') { blockComment = false; i += 1; } continue; }
    if (quote) { if (escaped) escaped = false; else if (ch === '\\') escaped = true; else if (ch === quote) quote = ''; continue; }
    if (ch === '/' && next === '/') { lineComment = true; i += 1; continue; }
    if (ch === '/' && next === '*') { blockComment = true; i += 1; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return { text: `${text.slice(0, openBrace + 1)}\n${body}\n${text.slice(i)}`, changed: true };
    }
  }
  return { text, changed: false };
}
function makeQuickAccessVisualOnly(source: string): string {
  const replaced = replaceFunctionBodyWith(source, /const\s+send\s*=\s*\(type,\s*detail\s*=\s*\{\}\)\s*=>\s*\{/m, `
    // Exported previews stay local: no postMessage, IPC, or host-side actions.
    if (type === 'toggle-theme') {
      state.theme = resolvedTheme(state.theme) === 'light' ? 'dark' : 'light';
      document.body.dataset.theme = state.theme;
      document.documentElement.dataset.theme = state.theme;
      window.dispatchEvent(new CustomEvent('madstation:appearance-theme-mode', { detail: state.theme }));
      updateUI();
      return true;
    }
    if (type === 'set-accent') {
      const selected = accents.find((item) => item.id === detail.accent);
      if (!selected) return false;
      state.accent = selected.id;
      const colors = { blue: '#69d9ff', violet: '#9b83ff', pink: '#ff85bf', red: '#ff7474', orange: '#ffad69', green: '#75e2a1', teal: '#68ddd5' };
      const color = colors[selected.id];
      for (const property of ['--accent', '--accent-strong', '--a', '--ph', '--cyan']) document.documentElement.style.setProperty(property, color);
      window.dispatchEvent(new CustomEvent('madstation:appearance-accent', { detail: selected.id }));
      updateUI();
      return true;
    }
    if (type === 'set-homepage') {
      const selected = styles.find((item) => item.id === detail.mode);
      if (!selected) return false;
      state.activeMode = selected.id;
      updateUI();
      return true;
    }
    if (type === 'set-season') {
      const selected = seasons.find((item) => item.id === detail.season);
      if (!selected) return false;
      state.season = selected.id;
      document.body.dataset.season = selected.id;
      updateUI();
      return true;
    }
    if (type === 'open-settings') {
      const settingsButton = document.getElementById('launcherSettingsBtn');
      if (settingsButton) { settingsButton.click(); return true; }
      const toast = document.getElementById('homeToast');
      if (toast) { toast.textContent = 'Appearance settings are available in the Mad Station app'; toast.classList.add('show'); }
    }
    return false;`);
  if (!replaced.changed) throw new Error('Quick Access visual runtime could not be safely isolated; refusing to export a non-functional or host-connected script.');
  // Disable inbound host-state synchronization in the standalone design preview.
  // The live application source keeps its original, channel-checked bridge unchanged.
  return replaced.text.replace(/const\s+framed\s*=\s*window\.parent\s*!==\s*window\s*&&\s*Boolean\(channel\)\s*;/, 'const framed = false;');
}

function captureCssLinks(html: string): string[] {
  return [...html.matchAll(/<link\b[^>]*\bhref=["']([^"']+\.css(?:\?[^"']*)?(?:#[^"']*)?)["'][^>]*>/gi)]
    .map((m) => m[1]).filter((ref) => Boolean(safeLocalRef(ref)));
}
function captureScriptLinks(html: string): string[] {
  return [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+\.js(?:\?[^"']*)?(?:#[^"']*)?)["'][^>]*>/gi)]
    .map((m) => m[1]).filter((ref) => Boolean(safeLocalRef(ref)));
}
function getTitle(html: string, fallback: string): string {
  const title = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html)?.[1];
  const cleaned = title ? title.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim() : '';
  return cleaned.replace(/\s*(?:[-–—|:]\s*)?Mad Station(?:\s+(?:Home|Theme|App))?\s*$/i, '').trim() || fallback;
}
function humanizeThemeFilename(filename: string): string {
  const raw = path.basename(filename, '.html').replace(/^home-?/i, '').replace(/^v2$/i, 'simple').replace(/^v3$/i, 'parallax').replace(/^v4$/i, 'parallax-big');
  return raw.replace(/[_-]+/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase()) || 'Untitled theme';
}
function escapeHtml(value: string): string { return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function scriptIsVisualOnly(sourceRoot: string, reference: string, source: string): boolean {
  const name = path.posix.basename(reference.replace(/\\/g, '/').split(/[?#]/)[0]);
  if (VISUAL_JS.has(name)) return true;
  if (BLOCKED_SCRIPT_NAME.test(name) || BLOCKED_SCRIPT_SOURCE.test(source)) return false;
  return true;
}
interface ResourceLink { reference: string; sourcePath: string; outputPath: string; included?: boolean; }
function localResourceExists(sourceRoot: string, fromFile: string, reference: string): string | null {
  const resolved = resolveLocalFile(sourceRoot, fromFile, reference);
  if (!resolved) return null;
  try { return fs.statSync(resolved).isFile() ? resolved : null; } catch { return null; }
}
function packageAsset(sourceRoot: string, sourcePath: string, files: Map<string, Buffer | string>): string {
  const outputPath = outputAssetPath(sourceRoot, sourcePath);
  if (!files.has(outputPath)) files.set(outputPath, fs.readFileSync(sourcePath));
  return outputPath;
}
function packageCss(sourceRoot: string, cssSourcePath: string, files: Map<string, Buffer | string>, processed: Set<string>, processing: Set<string>, missing: Set<string>): string {
  const outputPath = outputResourcePath('shared-css', sourceRoot, cssSourcePath);
  if (processed.has(cssSourcePath) || processing.has(cssSourcePath)) return outputPath;
  processing.add(cssSourcePath);
  let css = fs.readFileSync(cssSourcePath, 'utf8');
  css = css.replace(/url\(\s*(["']?)([^)"']+)\1\s*\)/gi, (whole, _quote: string, rawRef: string) => {
    const ref = rawRef.trim();
    if (!safeLocalRef(ref)) return whole;
    const target = localResourceExists(sourceRoot, cssSourcePath, ref);
    if (!target) { if (/\.(?:css|svg|png|jpe?g|gif|webp|avif|woff2?|ttf|otf)(?:[?#]|$)/i.test(ref)) missing.add(`${path.basename(cssSourcePath)} → ${ref}`); return whole; }
    const suffix = /\.css(?:[?#]|$)/i.test(ref) ? packageCss(sourceRoot, target, files, processed, processing, missing) : packageAsset(sourceRoot, target, files);
    return `url("${relativeOutputUrl(outputPath, suffix)}")`;
  });
  css = css.replace(/@import\s+(["'])([^"']+\.css(?:\?[^"']*)?)\1/gi, (whole, _quote: string, rawRef: string) => {
    if (!safeLocalRef(rawRef)) return whole;
    const target = localResourceExists(sourceRoot, cssSourcePath, rawRef);
    if (!target) { missing.add(`${path.basename(cssSourcePath)} → ${rawRef}`); return whole; }
    const childOutput = packageCss(sourceRoot, target, files, processed, processing, missing);
    return `@import url("${relativeOutputUrl(outputPath, childOutput)}")`;
  });
  processing.delete(cssSourcePath);
  processed.add(cssSourcePath);
  files.set(outputPath, css);
  return outputPath;
}
function rewriteHtmlAssetReferences(html: string, sourceRoot: string, htmlSourcePath: string, htmlOutputPath: string, files: Map<string, Buffer | string>, missing: Set<string>): string {
  let result = html.replace(/<link\b([^>]*\bhref=(['"])([^'"]+)\2[^>]*)>/gi, (whole, attrs: string, quote: string, ref: string) => {
    if (/\.(?:css|js)(?:[?#]|$)/i.test(ref) || !/\.(?:svg|png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf)(?:[?#]|$)/i.test(ref) || !safeLocalRef(ref)) return whole;
    const target = localResourceExists(sourceRoot, htmlSourcePath, ref);
    if (!target) { missing.add(`${path.basename(htmlSourcePath)} → ${ref}`); return whole; }
    const output = packageAsset(sourceRoot, target, files);
    const escaped = ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rewrittenAttrs = attrs.replace(new RegExp(`(href\\s*=\\s*)(['"])${escaped}\\2`, 'i'), `$1${quote}${relativeOutputUrl(htmlOutputPath, output)}${quote}`);
    return `<link${rewrittenAttrs}>`;
  });
  result = result.replace(/\b(src|poster|data-src|data-background)=(['"])([^'"]+)\2/gi, (whole, attr: string, quote: string, ref: string) => {
    if (/\.(?:css|js)(?:[?#]|$)/i.test(ref) || !safeLocalRef(ref)) return whole;
    const target = localResourceExists(sourceRoot, htmlSourcePath, ref);
    if (!target) { if (/\.(?:svg|png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|mp4|webm)(?:[?#]|$)/i.test(ref)) missing.add(`${path.basename(htmlSourcePath)} → ${ref}`); return whole; }
    const output = packageAsset(sourceRoot, target, files);
    return `${attr}=${quote}${relativeOutputUrl(htmlOutputPath, output)}${quote}`;
  });
  result = result.replace(/url\(\s*(["']?)([^)"']+)\1\s*\)/gi, (whole, _quote: string, rawRef: string) => {
    const ref = rawRef.trim();
    if (!safeLocalRef(ref) || /\.(?:css|js)(?:[?#]|$)/i.test(ref)) return whole;
    const target = localResourceExists(sourceRoot, htmlSourcePath, ref);
    if (!target) { if (/\.(?:svg|png|jpe?g|gif|webp|avif|woff2?|ttf|otf)(?:[?#]|$)/i.test(ref)) missing.add(`${path.basename(htmlSourcePath)} → ${ref}`); return whole; }
    const output = packageAsset(sourceRoot, target, files);
    return `url("${relativeOutputUrl(htmlOutputPath, output)}")`;
  });
  return result;
}
function rewriteVisualScriptAssetReferences(source: string, sourceRoot: string, sourcePath: string, outputPath: string, files: Map<string, Buffer | string>, processedCss: Set<string>, processingCss: Set<string>, missing: Set<string>): string {
  let result = rewriteHtmlAssetReferences(source, sourceRoot, sourcePath, outputPath, files, missing);
  // Scripts sometimes construct backgrounds or load textures by assigning a quoted local path.
  // Repoint these literals to their packaged dependency paths instead of leaving source-tree URLs.
  result = result.replace(/(["'`])((?:\.{1,2}\/)?[a-z0-9_./-]+\.(?:css|svg|png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|mp4|webm)(?:[?#][^"'`]*)?)\1/gi, (whole, quote: string, ref: string) => {
    if (/^\.\.\/(?:assets|shared-css)\//i.test(ref) || !safeLocalRef(ref)) return whole;
    const target = localResourceExists(sourceRoot, sourcePath, ref);
    if (!target) { missing.add(`${path.basename(sourcePath)} → ${ref}`); return whole; }
    const resourceOutput = /\.css(?:[?#]|$)/i.test(ref)
      ? packageCss(sourceRoot, target, files, processedCss, processingCss, missing)
      : packageAsset(sourceRoot, target, files);
    return `${quote}${relativeOutputUrl(outputPath, resourceOutput)}${quote}`;
  });
  return result;
}
function sanitizeThemeHtml(original: string, theme: DiscoveredThemeDesign, sourceRoot: string, cssLinks: ResourceLink[], scripts: ResourceLink[], files: Map<string, Buffer | string>, processedCss: Set<string>, processingCss: Set<string>, missing: Set<string>, sourceFilename = theme.filename) {
  let html = original;
  const sourceScripts = scripts.map((script) => path.posix.basename(script.reference.replace(/\\/g, '/').split(/[?#]/)[0]));
  const includedScripts = scripts.filter((script) => script.included).map((script) => path.posix.basename(script.outputPath));
  const excludedScripts = scripts.filter((script) => !script.included).map((script) => path.posix.basename(script.reference.replace(/\\/g, '/').split(/[?#]/)[0]));
  const inlineLaunchPatches: string[] = [];
  html = html.replace(/<meta\b[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/gi, '');
  html = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi, (whole, attrs: string, body: string) => {
    if (/\bsrc\s*=/.test(attrs)) return whole;
    if (/^\s*\/\*\s*Mad Station host bridge/i.test(body) || /^\s*\/\/\s*Host bridge for Mad Station/i.test(body)) return '';
    return whole;
  });
  for (const link of cssLinks) {
    const escaped = link.reference.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    html = html.replace(new RegExp(`(href=["'])${escaped}(?:[?#][^"']*)?(["'])`, 'gi'), `$1../${link.outputPath}$2`);
  }
  html = html.replace(/<script\b([^>]*)\bsrc=["']([^"']+\.js(?:\?[^"']*)?(?:#[^"']*)?)["']([^>]*)>\s*<\/script\s*>/gi, (whole, before: string, src: string, after: string) => {
    const matched = scripts.find((script) => script.reference === src || script.reference === src.split(/[?#]/)[0]);
    return matched?.included ? `<script${before}src="../${matched.outputPath}"${after}></script>` : '';
  });
  const inlinePatched = disableLaunchFunctions(html); html = inlinePatched.text; inlineLaunchPatches.push(...inlinePatched.patches);
  html = html.replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  // Strip inline page-to-host bridge senders while keeping their visual pages runnable alone.
  html = html.replace(/try\s*\{\s*window\.parent\.postMessage\(\{\s*channel:\s*CHANNEL,\s*type,\s*\.\.\.detail\s*\},\s*(['\"])\*\1\);\s*return true;\s*\}\s*catch\s*\{\s*return false;\s*\}/g, 'try { return false; } catch { return false; }');
  html = html.replace("if (window.parent !== window) window.parent.postMessage({ channel: 'madstation-home-parallax-jungle', type: 'set-season', season: SN[k].toLowerCase() }, '*'); else setSeason(k);", 'setSeason(k);');
  html = html.replace("if (window.parent !== window) window.parent.postMessage({ channel: 'madstation-home-parallax-jungle', type: 'set-season', season: SN[sv.k].toLowerCase(), automatic: true }, '*'); else setSeason(sv.k);", 'setSeason(sv.k);');
  html = html.replace("if (window.parent !== window) window.parent.postMessage({ channel: 'madstation-home-parallax-jungle', type: 'set-season', season: SN[sv.k].toLowerCase(), automatic: true }, '*');", '');
  const sourcePath = path.resolve(sourceRoot, sourceFilename);
  html = rewriteHtmlAssetReferences(html, sourceRoot, sourcePath, `themes/${theme.filename}`, files, missing);
  html = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi, (whole, attrs: string, body: string) => {
    if (/\bsrc\s*=/.test(attrs) || !body.trim()) return whole;
    const rewritten = rewriteVisualScriptAssetReferences(body, sourceRoot, sourcePath, `themes/${theme.filename}`, files, processedCss, processingCss, missing);
    return `<script${attrs}>${rewritten}</script>`;
  });
  if (theme.filename === 'home-retro.html' || theme.filename === 'home-retro-complex.html') {
    html = html.replace(/<body\b([^>]*)>/i, (bodyTag: string) => {
      if (/\bclass\s*=/.test(bodyTag)) return bodyTag.replace(/\bclass=(['"])(.*?)\1/i, (_m: string, quote: string, classes: string) => `class=${quote}${classes.split(/\s+/).includes('on') ? classes : `${classes} on`}${quote}`);
      return bodyTag.replace(/>$/, ' class="on">');
    });
  }
  html = html.replace(/<head\b[^>]*>/i, (head: string) => `${head}\n<meta name="robots" content="noindex"/>\n<!-- Visual-only export: latest source revision copied; host bridges excluded. -->`);
  html = html.replace(/<\/body\s*>/i, '<script src="../visual-js/visual-only-guard.js"></script>\n</body>');
  return { html, sourceScripts, includedScripts, excludedScripts, inlineLaunchPatches };
}

function fingerprintTheme(sourceRoot: string, filename: string, html: string): { fingerprint: string; dependencyCount: number; missingDependencies: string[]; modifiedAtMs: number } {
  const root = path.resolve(sourceRoot);
  const htmlPath = path.resolve(root, filename);
  const files = new Map<string, Buffer>();
  const missing = new Set<string>();
  const cssQueue: Array<{ fromFile: string; ref: string }> = captureCssLinks(html).map((ref) => ({ fromFile: htmlPath, ref }));
  const scriptRefs = captureScriptLinks(html);
  const resourceRefs = (text: string, fromFile: string) => {
    const refs = new Set<string>();
    for (const match of text.matchAll(/\b(?:src|poster|data-src|data-background|href)=["']([^"']+)["']/gi)) {
      const ref = match[1];
      if (/\.(?:css|svg|png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|mp4|webm)(?:[?#]|$)/i.test(ref)) refs.add(ref);
    }
    for (const match of text.matchAll(/\b(?:srcset|data-srcset)=["']([^"']+)["']/gi)) {
      for (const candidate of match[1].split(',')) {
        const ref = candidate.trim().split(/\s+/)[0];
        if (ref) refs.add(ref);
      }
    }
    for (const match of text.matchAll(/url\(\s*(["']?)([^)"']+)\1\s*\)/gi)) refs.add(match[2].trim());
    for (const match of text.matchAll(/@import\s+(["'])([^"']+\.css(?:\?[^"']*)?)\1/gi)) refs.add(match[2]);
    // Visual scripts often reference textures/media as quoted strings rather than HTML attributes.
    for (const match of text.matchAll(/["'`]((?:\.{1,2}\/)?[a-z0-9_./-]+\.(?:css|svg|png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|mp4|webm)(?:[?#][^"'`]*)?)["'`]/gi)) refs.add(match[1]);
    return [...refs].map((ref) => ({ fromFile, ref })).filter(({ ref }) => Boolean(safeLocalRef(ref)));
  };
  const collectResource = (fromFile: string, ref: string) => {
    if (/\.css(?:[?#]|$)/i.test(ref)) { cssQueue.push({ fromFile, ref }); return; }
    if (/\.js(?:[?#]|$)/i.test(ref)) return;
    const target = localResourceExists(sourceRoot, fromFile, ref);
    if (target) { try { files.set(target, fs.readFileSync(target)); } catch { missing.add(ref); } }
    else if (/\.(?:svg|png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|mp4|webm)(?:[?#]|$)/i.test(ref)) missing.add(ref);
  };
  for (const ref of resourceRefs(html, htmlPath)) collectResource(ref.fromFile, ref.ref);
  const seenCss = new Set<string>();
  while (cssQueue.length) {
    const item = cssQueue.shift()!;
    const target = localResourceExists(sourceRoot, item.fromFile, item.ref);
    if (!target) { missing.add(item.ref); continue; }
    if (seenCss.has(target)) continue;
    seenCss.add(target);
    try {
      const content = fs.readFileSync(target);
      files.set(target, content);
      const text = content.toString('utf8');
      for (const ref of resourceRefs(text, target)) collectResource(ref.fromFile, ref.ref);
    } catch { missing.add(item.ref); }
  }
  for (const reference of scriptRefs) {
    const target = localResourceExists(sourceRoot, htmlPath, reference);
    if (!target) { missing.add(reference); continue; }
    try {
      const contents = fs.readFileSync(target);
      const scriptText = contents.toString('utf8');
      if (scriptIsVisualOnly(sourceRoot, reference, scriptText)) {
        files.set(target, contents);
        for (const ref of resourceRefs(scriptText, target)) collectResource(ref.fromFile, ref.ref);
      }
    } catch { missing.add(reference); }
  }
  // Scripts can refer to CSS dynamically, so drain any newly discovered stylesheets too.
  while (cssQueue.length) {
    const item = cssQueue.shift()!;
    const target = localResourceExists(sourceRoot, item.fromFile, item.ref);
    if (!target) { missing.add(item.ref); continue; }
    if (seenCss.has(target)) continue;
    seenCss.add(target);
    try {
      const content = fs.readFileSync(target);
      files.set(target, content);
      for (const ref of resourceRefs(content.toString('utf8'), target)) collectResource(ref.fromFile, ref.ref);
    } catch { missing.add(item.ref); }
  }
  files.set(htmlPath, Buffer.from(html, 'utf8'));
  const hash = createHash('sha256'); let modifiedAtMs = 0;
  for (const [file, contents] of [...files.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    hash.update(path.relative(path.dirname(root), file).split(path.sep).join('/')).update('\0').update(contents).update('\0');
    try { modifiedAtMs = Math.max(modifiedAtMs, fs.statSync(file).mtimeMs); } catch { /* the content was already read */ }
  }
  return { fingerprint: hash.digest('hex'), dependencyCount: Math.max(0, files.size - 1), missingDependencies: [...missing].sort(), modifiedAtMs };
}



function discoverSourceThemes(root: string): ResolvedThemeDesign[] {
  const knownOrder = new Map<string, number>(THEME_DESIGN_EXPORTS.map((theme, index) => [theme.filename, index]));
  const entries = fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^home-[a-z0-9][a-z0-9._-]*\.html$/i.test(entry.name))
    .sort((a, b) => {
      const ai = knownOrder.get(a.name), bi = knownOrder.get(b.name);
      if (ai !== undefined && bi !== undefined) return ai - bi;
      if (ai !== undefined) return -1;
      if (bi !== undefined) return 1;
      return a.name.localeCompare(b.name);
    });
  const usedIds = new Set<string>();
  const discovered = entries.map((entry): ResolvedThemeDesign | null => {
    const filename = entry.name;
    const html = fs.readFileSync(path.join(root, filename), 'utf8');
    if (!/<html\b/i.test(html) || !/<body\b/i.test(html)) return null;
    const known = KNOWN_THEME_BY_FILENAME.get(filename);
    let id = known?.id || path.basename(filename, '.html').replace(/^home-/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!id) return null;
    if (usedIds.has(id)) id = `${id}-${createHash('sha1').update(filename).digest('hex').slice(0, 7)}`;
    usedIds.add(id);
    const title = known?.title || getTitle(html, humanizeThemeFilename(filename));
    const description: string = known?.description || `${title} theme discovered from the current source file. Latest HTML, linked styles, safe visual scripts and local visual assets are scanned at export time.`;
    const scan = fingerprintTheme(root, filename, html);
    return { id, title, filename, description, ...scan, sourceRoot: root, sourceFilename: filename };
  }).filter((item): item is ResolvedThemeDesign => item !== null);
  return discovered;
}

function readInstalledThemeEntries(importedThemesRoot: string): Array<{ mode: string; title: string; description: string; filename: string; entryPath: string; kind: 'custom' }> {
  const manifestPath = path.join(importedThemesRoot, 'installed-themes.json');
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { schemaVersion?: unknown; themes?: unknown };
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.themes)) return [];
    return parsed.themes.filter((value): value is { mode: string; title: string; description: string; filename: string; entryPath: string; kind: 'custom' } => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
      const item = value as Record<string, unknown>;
      return item.kind === 'custom' && typeof item.mode === 'string' && /^custom-[a-z0-9-]{1,64}$/.test(item.mode)
        && typeof item.title === 'string' && typeof item.description === 'string'
        && typeof item.filename === 'string' && /^home-[a-z0-9][a-z0-9_-]*\.html$/i.test(item.filename)
        && typeof item.entryPath === 'string' && /^themes\/home-[a-z0-9][a-z0-9_-]*\.html$/i.test(item.entryPath);
    }).map((value) => ({
      mode: value.mode, title: value.title, description: value.description, filename: value.filename,
      entryPath: value.entryPath, kind: 'custom',
    }));
  } catch { return []; }
}
function discoverThemeSources(sourceRoot: string, importedThemesRoot?: string): ResolvedThemeDesign[] {
  const root = path.resolve(sourceRoot);
  const discovered = discoverSourceThemes(root);
  if (!importedThemesRoot) return sortThemeSources(discovered);
  const importedRoot = path.resolve(importedThemesRoot);
  const entries = readInstalledThemeEntries(importedRoot);
  for (const item of entries) {
    const directoryName = item.mode;
    const themeRoot = path.resolve(importedRoot, directoryName);
    if (!isWithin(importedRoot, themeRoot)) continue;
    const sourceFilename = item.entryPath;
    const sourcePath = path.resolve(themeRoot, sourceFilename);
    if (!isWithin(themeRoot, sourcePath) || !fs.existsSync(sourcePath)) continue;
    let id: string;
    let filename: string;
    id = item.mode;
    // Stable, unique export names prevent collisions with the source-controlled built-ins.
    filename = `home-${item.mode}.html`;
    let html = '';
    try { html = fs.readFileSync(sourcePath, 'utf8'); } catch { continue; }
    if (!/<html\b/i.test(html) || !/<body\b/i.test(html)) continue;
    const scan = fingerprintTheme(themeRoot, sourceFilename, html);
    discovered.push({ id, title: item.title || getTitle(html, humanizeThemeFilename(filename)), filename, description: item.description || `${item.title} imported theme.`, ...scan, sourceRoot: themeRoot, sourceFilename });
  }
  return sortThemeSources(discovered);
}

function sortThemeSources(themes: ResolvedThemeDesign[]): ResolvedThemeDesign[] {
  const knownOrder = new Map<string, number>(THEME_DESIGN_EXPORTS.map((theme, index) => [theme.filename, index]));
  return themes.sort((a, b) => {
    const ai = knownOrder.get(a.filename), bi = knownOrder.get(b.filename);
    if (ai !== undefined && bi !== undefined) return ai - bi;
    if (ai !== undefined) return -1;
    if (bi !== undefined) return 1;
    return a.title.localeCompare(b.title);
  });
}

export function discoverThemeDesigns(sourceRoot: string, importedThemesRoot?: string): DiscoveredThemeDesign[] {
  return discoverThemeSources(sourceRoot, importedThemesRoot).map(({ sourceRoot: _sourceRoot, sourceFilename: _sourceFilename, ...theme }) => theme);
}

const VISUAL_ONLY_GUARD = `/* App placeholders are deliberately inert in this visual-only pack. */
(() => { 'use strict';
 const APP_SURFACES = ['.tile','.pl','.fr','.open','.app-tile','.app-card','.app-button','#iOpen','#iMk','#mainCard','.main','.mcard','[data-app]','[data-app-id]','[data-launch]','[data-launch-target]','[data-action="launch"]'].join(',');
 const findSurface = (target) => target instanceof Element ? target.closest(APP_SURFACES) : null;
 document.addEventListener('click', (event) => { if (!findSurface(event.target)) return; event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation(); }, true);
 document.addEventListener('keydown', (event) => { if (!['Enter',' '].includes(event.key) || !findSurface(event.target)) return; event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation(); }, true);
})();\n`;

interface ThemeRecord {
  id: string; title: string; filename: string; description: string; css: string[];
  sourceScripts: string[]; includedScripts: string[]; excludedScripts: string[];
  inlineLaunchPatches: string[]; originalChars: number; exportChars: number; fingerprint: string; dependencyCount: number; missingDependencies: string[];
}
function buildIndex(records: Array<Pick<ThemeRecord, 'id' | 'title' | 'filename' | 'description'>>): string {
  const cards = records.map((r) => `<a class="theme" href="themes/${r.filename}"><strong>${escapeHtml(r.title)}</strong><code>themes/${r.filename}</code><span>${escapeHtml(r.description)}</span><em>Open visual-only page ↗</em></a>`).join('\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mad Station — Visual Theme Studio</title><style>
*{box-sizing:border-box}body{margin:0;padding:clamp(18px,4vw,42px);font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;background:#0b111a;color:#ecf2ff}h1{margin:0 0 8px;font-size:clamp(27px,4vw,40px)}p{max-width:76ch;color:#a8b5ca}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,270px),1fr));gap:12px;margin-top:24px}.theme{display:flex;flex-direction:column;gap:8px;padding:18px;border:1px solid #2b3a4e;border-radius:14px;background:#131d2b;color:inherit;text-decoration:none;transition:transform .18s,border-color .18s}.theme:hover{transform:translateY(-2px);border-color:#718dff}.theme strong{font-size:17px}.theme code{font-size:12px;overflow-wrap:anywhere;color:#a9c1ff}.theme span{font-size:13px;color:#9fadc1}.theme em{font-style:normal;color:#c2d0ff;font-size:12px}.note{margin-top:24px;border:1px solid #2b3a4e;border-radius:14px;padding:16px;background:#101925}.note li{margin:6px 0;color:#bdc8d8}</style></head><body><h1>Mad Station — Visual Theme Studio Pack</h1><p>Full scenes, original backgrounds, named app placeholders, CSS and visual animations are retained. App placeholders are inert; real app functions and host bridges are excluded. Screenshot previews are omitted to reduce size.</p><div class="grid">${cards}</div><section class="note"><strong>AI handoff files</strong><ul><li><a href="AI_START_HERE.md">AI_START_HERE.md</a></li><li><a href="THEME_INDEX.md">THEME_INDEX.md</a></li><li><a href="THEME_INTEGRATION.md">THEME_INTEGRATION.md</a></li><li><a href="madstation-theme-pack.json">madstation-theme-pack.json</a></li><li><a href="theme-manifest.json">theme-manifest.json</a></li><li><a href="README.md">README.md</a></li></ul><p>Default window: 1450 × 920 px. Minimum: 900 × 560 px. Fit the UI at the default size, then adapt when resized or maximized.</p></section></body></html>`;
}
function buildDocumentation(records: ThemeRecord[], sharedCss: string[], visualJs: string[]) {
  const aiStart = [
    '# AI START HERE — Mad Station Visual Theme Design Pack', '',
    '## Goal', 'Redesign only the appearance and visual motion of the selected Mad Station home themes. Preserve each complete scene: backgrounds, decorative layers, 3D/parallax motion, props, panels, gauges, named app tiles and theme-specific effects.', '',
    '## Authoritative source — read before editing',
    '- This ZIP is an exported visual-design artifact for inspection, sharing, and isolated design work. It is not the installed app and is not the authoritative source for a built-in theme.',
    '- If the request is to restyle a built-in theme in the actual Mad Station app, edit the original project files under src/ (the relevant src/home-*.html plus its linked CSS, visual JS, and local assets), then rebuild and reinstall the app.',
    '- Mad Station imports ZIPs only as separate custom themes. Changing an HTML/CSS file inside this ZIP alone will not modify the built-in theme in the installed application.',
    '- For Retro Complex, the source-controlled entry page is src/home-retro-complex.html. Follow its linked local source dependencies in the original project.', '',
    '## Mandatory window-size rules',
    '- Default native window: 1450 × 920 px.', '- Minimum native window: 900 × 560 px.',
    '- The usable content viewport may be smaller because app chrome uses space; account for it when testing.',
    '- Show the complete primary UI at the default size without page-level scrolling wherever practical.',
    '- When maximized, expand fluidly. Do not lock the design to a small fixed canvas.',
    '- At smaller sizes, reflow or compact instead of clipping essential items. Use local scrolling only when necessary.',
    '- Test 1450 × 920, 1280 × 800, 900 × 560, and 1920 × 1080.', '',
    '## Hard boundary: visual-only',
    '- No host bridges, main-process IPC, APIs, account handling, filesystem operations or network calls.',
    '- App names and icons stay visible as decorative placeholders. Clicking or pressing Enter/Space on them must do nothing.',
    '- Video Hub, Image Hub, AI Hub and other apps are only shown as visual placeholders.',
    '- CPU, memory and account figures are demo visuals only. Do not add real system monitoring.',
    '- Visual animation, hover styles and decorative local controls may remain.', '- Quick Access is included as a local preview control (menu, accent/day-night appearance, and selected-option state); it never sends messages to the host or launches apps.',
    '- Never remove Galaxy, Parallax Jungle, or another theme-defining scene/background.', '',
    '## Token-efficient workflow',
    '1. Read AI_START_HERE.md and THEME_INDEX.md first.',
    '2. Read only the requested theme HTML and the CSS/visual JS listed for it. Do not ingest every theme for a single-theme task.',
    '3. Screenshot previews are deliberately excluded; the theme HTML and CSS are the source reference.',
    '4. The exporter discovers current home-*.html pages during each scan. New pages appear as selectable rows, deleted pages vanish, and each row can be included or excluded independently.',
    '5. Export performs a fresh scan immediately before writing. If pages were added or removed, review the refreshed selection; otherwise, the ZIP is created from the latest source revision. It never reuses an old ZIP snapshot.',
    '6. SHA-256 fingerprints compare HTML, linked/nested CSS, safe visual JavaScript, and referenced local assets to identify changes.',
    '7. Local CSS imports, safe visual scripts and referenced local image/font/media assets are collected from current source files. Host bridges and unsafe integration scripts are excluded.',
    '8. Edit HTML/CSS and selected visual animation code only. Never recreate real app behavior.',
    '9. Keep changes scoped to the requested theme unless a shared change is necessary.',
    '10. Return changed files and a concise summary. Disclose viewports that were not tested.', '',
    '## Package layout',
    '- themes/ — full visual theme HTML pages.', '- shared-css/ — stylesheets referenced by the selected themes.',
    '- visual-js/ — detected safe visual renderers, local-only Quick Access preview controller, and inert-placeholder guard; app launching is disabled.',
    '- assets/ — referenced local images, fonts, textures and media.',
    '- index.html — lightweight theme link gallery without screenshots.', '- THEME_INDEX.md — theme/dependency map and missing-resource notes.',
    '- theme-manifest.json — machine-readable inventory and sizing rules.', '- madstation-theme-pack.json — machine-readable theme entries and import metadata.', '- THEME_INTEGRATION.md — the required app-integration contract for reconnecting app controls after a theme import.', '',
    'Inert app placeholders are intentional. Do not add the missing functionality.', ''
  ].join('\n');
  const lines = [
    '# Theme index and source map', '',
    'The selected theme pages are visual-only copies. Original backgrounds, scene markup, CSS and selected visual renderers remain; app placeholders are visible but inert, and host bridges/app functions are excluded.', '',
    '## Theme source map', '', '| Theme | HTML | CSS dependencies | Visual JS |', '|---|---|---|---|'
  ];
  for (const r of records) {
    const css = r.css.map((name) => `shared-css/${name}`).join(', ') || 'inline styles';
    const js = r.includedScripts.map((name) => `visual-js/${name}`).join(', ') || 'inline visual JS';
    lines.push(`| ${r.title.replace(/\|/g, '\\|')} | themes/${r.filename} | ${css} | ${js} |`);
  }
  lines.push('', '## Live source and scan behavior', '', '- Theme pages are discovered from the current source folder by the home-*.html naming convention; deleted pages disappear automatically. Each page is independently selectable for export.', '- The export is generated from current HTML/CSS/visual JavaScript and referenced local assets at export time; it does not reuse a saved ZIP snapshot.', '- The Developer panel fingerprints HTML, linked/nested CSS, safe visual JavaScript and referenced local assets. It rescans before export; added/removed pages require the user to review the selection.', '- Removed source pages disappear from the next scan. The user can select or deselect each discovered theme.', '', '## Viewport rules', '', '- Default native window: 1450 × 920 px.', '- Minimum native window: 900 × 560 px.', '- Test 1450 × 920, 1280 × 800, 900 × 560, and 1920 × 1080.', '- At default size, fit the primary UI without page-level scrolling where practical.', '- Maximized layouts expand fluidly; smaller layouts reflow instead of clipping essential content.', '- Native window dimensions are larger than the usable content area because of app chrome.', '', '## Visual-only behavior', '', '- Host bridges and backend integrations are excluded.', '- App launch functions are stubbed and visual-only-guard.js blocks click/Enter/Space on app placeholders.', '- CPU, memory and account values are demo visuals; do not add real monitoring.', '- Preserve Galaxy, Parallax Jungle, and all other theme-specific backgrounds and decorative elements.', '- Theme-specific local visual controls, hover effects and animations may remain.', '', '## Shared files', '', `CSS: ${sharedCss.join(', ')}`, '', `Visual JS: ${visualJs.join(', ')}`, '', 'Per-theme script exclusions and file character counts are in theme-manifest.json.', '');
  const readme = [
    '# Mad Station — Visual Theme Design Pack', '',
    'This ZIP exports selected Mad Station themes for AI visual redesign. It preserves theme HTML, original backgrounds, decorative scenes, linked CSS and selected visual animations. Quick Access remains locally interactive in preview mode; app tiles remain inert placeholders and host bridges are excluded.', '',
    '## Start here', '1. Read AI_START_HERE.md for global constraints and the agent workflow.', '2. Read THEME_INDEX.md for the source map.', '3. Open index.html and choose a theme, or open its HTML file under themes/ directly.', '',
    '## Live discovery', '- The Developer section scans current home-*.html theme pages and fingerprints their referenced visual dependencies.', '- New pages appear as selectable themes; deleted pages disappear. Export rescans immediately before writing and asks you to review if the theme list changed.', '- Edited HTML, linked/nested CSS, safe visual scripts and referenced local assets are read fresh at export time.', '',
    '## Window sizing', '- Default: 1450 × 920 px.', '- Minimum: 900 × 560 px.', '- Fit the default size, expand when maximized, and reflow at smaller sizes.', '',
    '## File map', '- themes/ — visual HTML pages.', '- shared-css/ — linked stylesheets and local imports.', '- visual-js/ — safe visual renderers, local-only Quick Access controller and inert-placeholder guard.', '- assets/ — collected local images, fonts, textures and media.', '- theme-manifest.json — structured metadata and source fingerprints.', '- index.html — link gallery; screenshot previews are not included.', ''
  ].join('\n');
  const manifest = {
    package: 'Mad Station Visual Theme Design Pack',
    purpose: 'Token-efficient visual-only redesign source built from current theme source files at export time; original scenes and named app placeholders retained while app functionality is excluded.',
    sourceDiscovery: { mode: 'dynamic', filenamePattern: 'home-*.html', refreshableInDeveloperSettings: true, preExportRescan: true, reviewRequiredOnThemeAddOrRemove: true, readsLatestSourceAtExport: true, detectsContentChanges: true, fingerprintAlgorithm: 'SHA-256', fingerprintIncludes: ['HTML', 'linked CSS', 'nested CSS imports', 'safe visual JavaScript', 'referenced local assets'], includesReferencedLocalAssets: true, screenshotsIncluded: false },
    createdAt: new Date().toISOString(), appFunctionalityIncluded: false, hostBridgesIncluded: false,
    appPlaceholderClickEnabled: false, screenshotPreviewsIncluded: false,
    windowSizing: { defaultWidth: 1450, defaultHeight: 920, minimumWidth: 900, minimumHeight: 560, viewportTests: [[1450, 920], [1280, 800], [900, 560], [1920, 1080]], fluidResize: true, pageLevelScrollAtDefault: false, nativeSizeNote: 'Usable content viewport may be smaller because app chrome uses space.' },
    selectedThemeIds: records.map((r) => r.id),
    themes: records.map((r) => ({ id: r.id, title: r.title, filename: r.filename, description: r.description, css: r.css, sourceScripts: r.sourceScripts, visualScriptsIncluded: r.includedScripts, hostBridgeScriptsExcluded: r.excludedScripts, launchFunctionsDisabled: true, inlineLaunchPatches: r.inlineLaunchPatches, originalCharacters: r.originalChars, exportCharacters: r.exportChars, sourceFingerprint: r.fingerprint, dependencyCount: r.dependencyCount, missingDependencies: r.missingDependencies })),
    sharedCss, visualJs,
  };
  return { 'AI_START_HERE.md': aiStart, 'THEME_INDEX.md': lines.join('\n'), 'README.md': readme, 'theme-manifest.json': JSON.stringify(manifest, null, 2) };
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) { let value = n; for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1; table[n] = value >>> 0; }
  return table;
})();
function dosDateTime(date = new Date()): { date: number; time: number } {
  const year = Math.max(1980, date.getFullYear());
  return { date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(), time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2) };
}
function makeZip(files: Map<string, Buffer | string>): Buffer {
  const localParts: Buffer[] = []; const centralParts: Buffer[] = []; let localOffset = 0; const stamp = dosDateTime();
  for (const [fileName, raw] of files) {
    const name = Buffer.from(fileName.replace(/\\/g, '/'), 'utf8');
    const original = Buffer.isBuffer(raw) ? raw : Buffer.from(raw, 'utf8');
    const compressed = deflateRawSync(original, { level: 6 }); const checksum = crc32(original);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8);
    local.writeUInt16LE(stamp.time, 10); local.writeUInt16LE(stamp.date, 12); local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(original.length, 22); local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
    localParts.push(local, name, compressed);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(0x0314, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(8, 10);
    central.writeUInt16LE(stamp.time, 12); central.writeUInt16LE(stamp.date, 14); central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(original.length, 24); central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30); central.writeUInt16LE(0, 32); central.writeUInt16LE(0, 34); central.writeUInt16LE(0, 36); central.writeUInt32LE(0, 38); central.writeUInt32LE(localOffset, 42);
    centralParts.push(central, name); localOffset += local.length + name.length + compressed.length;
  }
  const localData = Buffer.concat(localParts); const centralData = Buffer.concat(centralParts); const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6); end.writeUInt16LE(files.size, 8); end.writeUInt16LE(files.size, 10); end.writeUInt32LE(centralData.length, 12); end.writeUInt32LE(localData.length, 16); end.writeUInt16LE(0, 20);
  return Buffer.concat([localData, centralData, end]);
}

function packageThemeFingerprint(filename: string, files: Map<string, Buffer | string>): string {
  const entry = files.get(`themes/${filename}`);
  if (entry === undefined) return '';
  const chunks: Buffer[] = [Buffer.from(filename), Buffer.isBuffer(entry) ? entry : Buffer.from(entry, 'utf8')];
  const resources = [...files.entries()]
    .filter(([name]) => /^(?:shared-css|visual-js|assets)\//.test(name))
    .sort(([left], [right]) => left.localeCompare(right));
  for (const [name, content] of resources) {
    chunks.push(Buffer.from(`\n${name}\0`), Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8'));
  }
  return createHash('sha256').update(Buffer.concat(chunks)).digest('hex');
}

export interface ThemeDesignPackBuildResult { archive: Buffer; selectedThemeIds: ThemeDesignExportId[]; fileCount: number; themeCount: number }
export function buildThemeDesignPack(sourceRoot: string, requestedIds: unknown, importedThemesRoot?: string): ThemeDesignPackBuildResult {
  // Discovery happens inside the export action as well as in the UI. This prevents
  // stale checkbox state from ever exporting a deleted or cached theme revision.
  const discovered = discoverThemeSources(sourceRoot, importedThemesRoot);
  if (!Array.isArray(requestedIds) || requestedIds.length < 1 || requestedIds.length > 200) {
    throw new Error('Choose at least one currently discovered theme to export. Scan for new themes if the list is outdated.');
  }
  const byId = new Map(discovered.map((theme) => [theme.id, theme]));
  const selectedIds: ThemeDesignExportId[] = [];
  for (const value of requestedIds) {
    if (typeof value !== 'string' || !byId.has(value)) throw new Error('A selected theme is no longer available. Scan themes again and retry.');
    if (selectedIds.includes(value)) throw new Error('The selected theme list contains a duplicate.');
    selectedIds.push(value);
  }
  const selected = selectedIds.map((id) => byId.get(id)!);
  const files = new Map<string, Buffer | string>();
  const processedCss = new Set<string>();
  const processingCss = new Set<string>();
  const visualScriptOutputPaths = new Set<string>();
  const records: ThemeRecord[] = [];

  for (const theme of selected) {
    // Re-read the current source files at export time. This is intentionally not a
    // cached snapshot: edits made after the last scan still go into this ZIP.
    const activeSourceRoot = theme.sourceRoot;
    const sourceFilename = theme.sourceFilename;
    const sourcePath = path.resolve(activeSourceRoot, sourceFilename);
    const original = fs.readFileSync(sourcePath, 'utf8');
    const currentScan = fingerprintTheme(activeSourceRoot, sourceFilename, original);
    const localMissing = new Set<string>();
    const cssLinks: ResourceLink[] = [];
    for (const reference of captureCssLinks(original)) {
      const cssSourcePath = localResourceExists(activeSourceRoot, sourcePath, reference);
      if (!cssSourcePath) { localMissing.add(reference); continue; }
      const outputPath = packageCss(activeSourceRoot, cssSourcePath, files, processedCss, processingCss, localMissing);
      cssLinks.push({ reference, sourcePath: cssSourcePath, outputPath });
    }

    const scripts: ResourceLink[] = [];
    const sourceScriptNames: string[] = [];
    const includedScriptNames: string[] = [];
    const excludedScriptNames: string[] = [];
    const launchPatches: string[] = [];
    for (const reference of captureScriptLinks(original)) {
      const scriptSourcePath = localResourceExists(activeSourceRoot, sourcePath, reference);
      const scriptName = path.posix.basename(reference.replace(/\\/g, '/').split(/[?#]/)[0]);
      sourceScriptNames.push(scriptName);
      if (!scriptSourcePath) {
        localMissing.add(reference);
        excludedScriptNames.push(scriptName);
        scripts.push({ reference, sourcePath: '', outputPath: '', included: false });
        continue;
      }
      const scriptSource = fs.readFileSync(scriptSourcePath, 'utf8');
      const included = scriptIsVisualOnly(activeSourceRoot, reference, scriptSource);
      const outputPath = outputResourcePath('visual-js', activeSourceRoot, scriptSourcePath);
      scripts.push({ reference, sourcePath: scriptSourcePath, outputPath, included });
      if (included) {
        const exportSource = scriptName === 'home-quick-access-theme.js' ? makeQuickAccessVisualOnly(scriptSource) : scriptSource;
        const withAssets = rewriteVisualScriptAssetReferences(exportSource, activeSourceRoot, scriptSourcePath, outputPath, files, processedCss, processingCss, localMissing);
        const sanitized = disableLaunchFunctions(withAssets);
        files.set(outputPath, sanitized.text);
        visualScriptOutputPaths.add(outputPath);
        includedScriptNames.push(path.posix.basename(outputPath));
        launchPatches.push(...sanitized.patches.map((patch) => `${scriptName}: ${patch}`));
      } else {
        excludedScriptNames.push(scriptName);
      }
    }

    const transformed = sanitizeThemeHtml(original, theme, activeSourceRoot, cssLinks, scripts, files, processedCss, processingCss, localMissing, sourceFilename);
    files.set(`themes/${theme.filename}`, transformed.html);
    records.push({
      id: theme.id,
      title: theme.title,
      filename: theme.filename,
      description: theme.description,
      css: cssLinks.map((link) => link.outputPath.replace(/^shared-css\//, '')),
      sourceScripts: [...new Set(sourceScriptNames)],
      includedScripts: [...new Set(includedScriptNames)],
      excludedScripts: [...new Set(excludedScriptNames)],
      inlineLaunchPatches: [...transformed.inlineLaunchPatches, ...launchPatches],
      originalChars: original.length,
      exportChars: transformed.html.length,
      fingerprint: currentScan.fingerprint,
      dependencyCount: currentScan.dependencyCount,
      missingDependencies: [...new Set([...currentScan.missingDependencies, ...localMissing])].sort(),
    });
  }

  files.set('visual-js/visual-only-guard.js', VISUAL_ONLY_GUARD);
  const sharedCss = [...files.keys()].filter((name) => name.startsWith('shared-css/')).map((name) => name.replace(/^shared-css\//, '')).sort();
  const visualJs = [...visualScriptOutputPaths].map((name) => name.replace(/^visual-js\//, '')).concat('visual-only-guard.js').sort();
  const docs = buildDocumentation(records, sharedCss, visualJs);
  for (const [name, content] of Object.entries(docs)) files.set(name, content);
  const sourceGuide = path.resolve(sourceRoot, 'THEME_INTEGRATION.md');
  // Synthetic/custom source roots may not carry the guide, but every exported ZIP
  // must still ship the same app-owned integration contract.
  const bundledGuide = path.resolve(__dirname, '../../src/THEME_INTEGRATION.md');
  const integrationGuide = fs.existsSync(sourceGuide)
    ? readText(sourceRoot, 'THEME_INTEGRATION.md')
    : fs.readFileSync(bundledGuide, 'utf8');
  files.set('THEME_INTEGRATION.md', integrationGuide);
  files.set('madstation-theme-pack.json', JSON.stringify({
    format: 'mad-station-theme-pack',
    schemaVersion: 1,
    packageTitle: 'Mad Station Visual Theme Design Pack',
    purpose: 'Visual-only theme source. Mad Station reconnects supported app controls through its trusted built-in adapter when imported.',
    integrationContract: 'madstation-theme-api-v1',
    instructionsFile: 'THEME_INTEGRATION.md',
    screenshotsIncluded: false,
    themes: records.map((record) => ({
      id: record.id,
      title: record.title,
      description: record.description,
      entry: `themes/${record.filename}`,
      sourceFingerprint: record.fingerprint,
      packageFingerprint: packageThemeFingerprint(record.filename, files),
    })),
  }, null, 2));
  files.set('index.html', buildIndex(records));
  return { archive: makeZip(files), selectedThemeIds: selectedIds, fileCount: files.size, themeCount: selected.length };
}

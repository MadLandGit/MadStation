// Download handling for Mad Station.
//
// Every account session reports its downloads here. The manager decides where a file is
// saved, tracks progress for the Downloads panel, and exposes a small set of actions that
// work on download IDs only: the renderer never supplies a file path.
//
// Everything that needs Electron (shell, dialogs, notifications) is injected, so the helpers
// and the manager can be tested without launching Electron.

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as https from 'node:https';
import * as fsPromises from 'node:fs/promises';

import type { WriteStream } from 'node:fs';
import type { ClientRequest, IncomingMessage } from 'node:http';

export interface DownloadSettings {
  askWhereToSave: boolean;
  folder: string;
  notifyWhenDone: boolean;
}

export type DownloadState = 'progressing' | 'interrupted' | 'completed' | 'cancelled' | 'failed';
export type DownloadKind = 'browser' | 'managed';

export interface DownloadSource {
  url: string;
  name: string;
  [key: string]: unknown;
}

interface ManagedDownloadEntry extends DownloadEntry {
  displayName: string;
  kind: 'managed';
  managedKey: string;
  category: string;
  sourceIndex: number;
  sourceCount: number;
  sourceName: string;
  source: DownloadSource;
  sourceAttempts: DownloadSourceAttempt[];
}

export interface DownloadSourceAttempt {
  name: string;
  host: string;
  error: string;
}

export interface DownloadEntry {
  id: string;
  name: string;
  displayName?: string;
  host: string;
  accountId: string;
  accountName?: string;
  kind?: DownloadKind;
  managedKey?: string;
  category?: string;
  state: DownloadState;
  paused: boolean;
  received: number;
  total: number;
  path: string;
  program: boolean;
  startedAt: number;
  error: string;
  sourceIndex?: number;
  sourceCount?: number;
  sourceName?: string;
  source?: DownloadSource;
  sourceAttempts?: DownloadSourceAttempt[];
}

export interface PublicDownloadEntry {
  id: string;
  name: string;
  displayName: string;
  host: string;
  accountId: string;
  accountName: string;
  kind: DownloadKind;
  managedKey: string;
  category: string;
  state: DownloadState;
  paused: boolean;
  received: number;
  total: number;
  folder: string;
  program: boolean;
  startedAt: number;
  sourceIndex: number;
  sourceCount: number;
  sourceName: string;
  canOpen: boolean;
  canShow: boolean;
}

export interface DownloadItemLike {
  getFilename(): string;
  getURL(): string;
  getTotalBytes(): number;
  getReceivedBytes(): number;
  getSavePath(): string;
  setSaveDialogOptions(options: { title: string; defaultPath: string }): void;
  setSavePath(path: string): void;
  isPaused(): boolean;
  canResume(): boolean;
  pause(): void;
  resume(): void;
  cancel(): void;
  on(event: 'updated', listener: (event: unknown, state: string) => void): unknown;
  once(event: 'done', listener: (event: unknown, state: string) => void): unknown;
}

interface LiveDownloadControl {
  cancel(): void;
  isPaused?: () => boolean;
  pause?: () => void;
  canResume?: () => boolean;
  resume?: () => void;
  kind?: 'managed';
  entry?: DownloadEntry;
}

export interface ManagedDownloadOptions {
  key?: unknown;
  name?: string;
  url?: string;
  sources?: unknown[];
  destination?: string;
  category?: string;
  maxBytes?: number;
  totalBytes?: number;
  finalize?: (temporaryPath: string, entry: DownloadEntry) => Promise<string | void> | string | void;
  fsPromisesImpl?: Pick<typeof fsPromises, 'rm'>;
}

interface DownloadShell {
  openPath(path: string): Promise<string>;
  showItemInFolder(path: string): void;
}

export interface CreateDownloadManagerOptions {
  getSettings(): unknown;
  getDefaultFolder(): string;
  getAccountName?: (accountId: string) => string;
  shell: DownloadShell;
  onChange?: () => void;
  onFinished?: (entry: PublicDownloadEntry) => void;
  now?: () => number;
  fsImpl?: typeof fs;
  httpsImpl?: typeof https;
}

export interface DownloadManager {
  handleWillDownload(item: DownloadItemLike, accountId: string): DownloadEntry;
  startManagedDownload(options?: ManagedDownloadOptions): Record<string, unknown>;
  getState(): { items: PublicDownloadEntry[]; active: number; folder: string };
  cancel(id: string): { ok: boolean; error?: string };
  pause(id: string): { ok: boolean; error?: string };
  resume(id: string): { ok: boolean; error?: string };
  open(id: string): Promise<{ ok: boolean; error?: string }>;
  show(id: string): { ok: boolean; error?: string };
  remove(id: string): { ok: boolean; error?: string };
  clearFinished(): { ok: boolean };
  openFolder(): Promise<{ ok: boolean; path?: string; error?: string }>;
  cancelForAccount(accountId: string): void;
  cancelAll(): void;
  activeCount(): number;
}

function messageOf(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return fallback;
}

const MAX_LIST = 50;
const MAX_NAME_LENGTH = 180;
const PROGRESS_INTERVAL_MS = 250;

const DEFAULT_DOWNLOAD_SETTINGS: DownloadSettings = {
  askWhereToSave: false,
  folder: '',
  notifyWhenDone: true,
};

// Programs and scripts. These always ask where to save and can never be launched from
// inside Mad Station (they can still be revealed in their folder).
const PROGRAM_EXTENSIONS = new Set([
  '.exe', '.msi', '.msix', '.appx', '.bat', '.cmd', '.com', '.scr', '.pif', '.cpl', '.msc',
  '.dll', '.ps1', '.psm1', '.vbs', '.vbe', '.js', '.jse', '.wsf', '.wsh', '.hta', '.lnk',
  '.jar', '.reg', '.inf', '.url', '.application', '.gadget', '.sh',
  '.docm', '.xlsm', '.pptm', '.dotm', '.xlam',
]);

const RESERVED_WINDOWS_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeDownloadSettings(raw: unknown): DownloadSettings {
  const out = { ...DEFAULT_DOWNLOAD_SETTINGS };
  if (!isPlainObject(raw)) return out;
  if (typeof raw.askWhereToSave === 'boolean') out.askWhereToSave = raw.askWhereToSave;
  if (typeof raw.notifyWhenDone === 'boolean') out.notifyWhenDone = raw.notifyWhenDone;
  if (typeof raw.folder === 'string') {
    const folder = raw.folder.trim();
    if (folder && folder.length <= 500 && !folder.includes('\0') && path.isAbsolute(folder)) out.folder = folder;
  }
  return out;
}

// Turns whatever name a website suggested into a safe single file name.
function sanitizeFileName(name: unknown, fallback = 'download'): string {
  let clean = String(name == null ? '' : name)
    .replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  // Windows silently drops trailing dots and spaces, which can change the real extension.
  clean = clean.replace(/[. ]+$/, '');
  clean = clean.replace(/^\.+/, '');
  if (!clean) clean = fallback;

  let ext = path.extname(clean);
  let base = ext ? clean.slice(0, -ext.length) : clean;
  if (RESERVED_WINDOWS_NAMES.test(base)) base = `_${base}`;
  if (base.length + ext.length > MAX_NAME_LENGTH) {
    ext = ext.slice(0, 20);
    base = base.slice(0, Math.max(1, MAX_NAME_LENGTH - ext.length));
  }
  base = base.replace(/[. ]+$/, '') || fallback;
  return `${base}${ext}`;
}

function isProgramFileName(name: unknown): boolean {
  return PROGRAM_EXTENSIONS.has(path.extname(String(name || '')).toLowerCase());
}

// "report.pdf" -> "report (1).pdf" -> "report (2).pdf" ... never overwrites a file.
function uniqueFilePath(dir: string, name: string, exists: (filePath: string) => boolean = fs.existsSync): string {
  const ext = path.extname(name);
  const base = ext ? name.slice(0, -ext.length) : name;
  let candidate = path.join(dir, name);
  for (let i = 1; exists(candidate); i += 1) {
    if (i > 999) return path.join(dir, `${base} (${Date.now()})${ext}`);
    candidate = path.join(dir, `${base} (${i})${ext}`);
  }
  return candidate;
}

function hostOnly(url: unknown): string {
  // Only the host is kept: full download URLs often contain one-time tokens.
  try { return new URL(String(url)).hostname.replace(/^www\./, ''); } catch { return ''; }
}

function createDownloadManager({
  getSettings,
  getDefaultFolder,
  getAccountName = () => '',
  shell,
  onChange = () => {},
  onFinished = () => {},
  now = Date.now,
  fsImpl = fs,
  httpsImpl = https,
}: CreateDownloadManagerOptions): DownloadManager {
  const entries: DownloadEntry[] = []; // newest first
  const live = new Map<string, LiveDownloadControl>(); // id -> native item or managed control
  let counter = 0;
  let lastEmit = 0;
  const managedCompletions = new Map();
  let emitTimer: NodeJS.Timeout | null = null;

  function emit(force = false) {
    const elapsed = now() - lastEmit;
    if (!force && elapsed < PROGRESS_INTERVAL_MS) {
      if (!emitTimer) {
        emitTimer = setTimeout(() => { emitTimer = null; emit(true); }, PROGRESS_INTERVAL_MS - elapsed);
        if (emitTimer.unref) emitTimer.unref();
      }
      return;
    }
    lastEmit = now();
    try { onChange(); } catch { /* UI may be gone */ }
  }

  function effectiveFolder() {
    const wanted = normalizeDownloadSettings(getSettings()).folder;
    if (wanted) {
      try {
        fsImpl.mkdirSync(wanted, { recursive: true });
        return wanted;
      } catch { /* fall back to the system folder */ }
    }
    return getDefaultFolder();
  }

  function trimList() {
    while (entries.length > MAX_LIST) {
      const index = [...entries].reverse().findIndex((e) => e.state !== 'progressing');
      if (index === -1) break;
      entries.splice(entries.length - 1 - index, 1);
    }
  }

  function find(id: string): DownloadEntry | null { return entries.find((e) => e.id === id) || null; }

  // The Save As window lets the user pick another name or extension, and unique-name
  // handling may add a number. The list shows the real file, and the program check is
  // always made on the final extension.
  function syncFromItem(entry: DownloadEntry, item: DownloadItemLike): void {
    const saved = item.getSavePath() || entry.path;
    if (!saved) return;
    entry.path = saved;
    entry.name = path.basename(saved);
    entry.program = isProgramFileName(entry.name);
  }


  function findByManagedKey(key: string): DownloadEntry | null {
    const wanted = String(key || '');
    if (!wanted) return null;
    return entries.find((entry) => entry.kind === 'managed' && entry.managedKey === wanted) || null;
  }

  // Generic app-managed download. This feeds the same progress list as Chromium downloads,
  // but never lets the renderer choose a URL or filesystem path. The caller supplies both from
  // trusted main-process metadata and may optionally finalize the temp file (for example, by
  // verifying a checksum and extracting an archive).
  function startManagedDownload(options: ManagedDownloadOptions = {}): Record<string, unknown> {
    const {
      key,
      name,
      url,
      sources: rawSources,
      destination,
      category = 'Application',
      maxBytes = 2 * 1024 * 1024 * 1024,
      totalBytes = 0,
      finalize = async (tmpPath: string) => {
        await fsPromises.rename(tmpPath, destination as string);
        return destination;
      },
      fsPromisesImpl = null,
    } = options;
    const managedKey = String(key || '').trim().slice(0, 120);
    if (!managedKey) return { ok: false, error: 'Managed download key is required.' };
    const existing = findByManagedKey(managedKey);
    if (existing && existing.state === 'progressing') {
      return { ok: true, existing: true, ...publicEntry(existing), completion: managedCompletions.get(managedKey) || null };
    }
    const sourceList: DownloadSource[] = (Array.isArray(rawSources) && rawSources.length ? rawSources : [url])
      .map((source: unknown, index: number): DownloadSource => {
        const value: Record<string, unknown> = typeof source === 'string' ? { url: source } : (isPlainObject(source) ? { ...source } : {});
        const sourceUrl = String(value.url || '').trim();
        return {
          ...value,
          url: sourceUrl,
          name: String(value.name || hostOnly(sourceUrl) || `Source ${index + 1}`).slice(0, 120),
        };
      })
      .filter((source) => Boolean(source.url));
    if (!sourceList.length) return { ok: false, error: 'At least one managed download source is required.' };
    if (sourceList.some((source) => !/^https:\/\//i.test(source.url))) {
      return { ok: false, error: 'Managed download sources must use HTTPS.' };
    }
    const safeName = sanitizeFileName(name || path.basename(destination || 'download'));
    const displayName = String(name || safeName).slice(0, MAX_NAME_LENGTH);
    const target = String(destination || '').trim();
    if (!target || !path.isAbsolute(target) || target.includes('\0')) return { ok: false, error: 'Managed download destination is invalid.' };
    const workFs = fsPromisesImpl || fsPromises;
    const partPath = `${target}.download-part-${process.pid}-${Date.now()}`;
    counter += 1;
    const entry: ManagedDownloadEntry = {
      id: `dl-${now().toString(36)}-${counter}`,
      name: safeName,
      displayName,
      host: hostOnly(sourceList[0].url),
      accountId: '',
      accountName: '',
      kind: 'managed',
      managedKey,
      category: String(category || 'Application').slice(0, 80),
      state: 'progressing',
      paused: false,
      received: 0,
      total: Number(totalBytes) > 0 ? Number(totalBytes) : 0,
      path: target,
      program: false,
      startedAt: now(),
      error: '',
      sourceIndex: 0,
      sourceCount: sourceList.length,
      sourceName: sourceList[0].name,
      source: sourceList[0],
      sourceAttempts: [],
    };
    let request: ClientRequest | null = null;
    let response: IncomingMessage | null = null;
    let output: WriteStream | null = null;
    let settled = false;
    let attemptToken = 0;
    let resolveCompletion: ((value: PublicDownloadEntry) => void) | null = null;
    const completion: Promise<PublicDownloadEntry> = new Promise((resolve) => { resolveCompletion = resolve; });
    managedCompletions.set(managedKey, completion);
    const cleanupPart = async () => { try { await workFs.rm(partPath, { force: true }); } catch {} };

    const finish = async (state: DownloadState, errorMessage = ''): Promise<void> => {
      if (settled) return;
      settled = true;
      live.delete(entry.id);
      try { request?.destroy?.(); } catch {}
      try { response?.destroy?.(); } catch {}
      try { output?.destroy?.(); } catch {}
      entry.paused = false;
      entry.state = state;
      entry.error = errorMessage || '';
      await cleanupPart();
      emit(true);
      const publicState = publicEntry(entry);
      if (resolveCompletion) resolveCompletion(publicState);
      managedCompletions.delete(managedKey);
      if (entry.state === 'completed' || entry.state === 'failed') {
        try { onFinished({ ...publicState, accountName: '' }); } catch {}
      }
    };

    const tryNextSource = async (reason: unknown): Promise<void> => {
      if (settled) return;
      const failedSource = entry.source;
      entry.sourceAttempts.push({
        name: failedSource?.name || hostOnly(failedSource?.url),
        host: hostOnly(failedSource?.url),
        error: messageOf(reason, 'The source failed.').slice(0, 300),
      });
      try { request?.destroy?.(); } catch {}
      try { response?.destroy?.(); } catch {}
      try { output?.destroy?.(); } catch {}
      request = null;
      response = null;
      output = null;
      await cleanupPart();
      if (entry.sourceIndex + 1 >= sourceList.length) {
        const suffix = entry.sourceAttempts.length > 1 ? ` Tried ${entry.sourceAttempts.length} sources.` : '';
        await finish('failed', `${messageOf(reason, 'The download failed.')}${suffix}`);
        return;
      }
      entry.sourceIndex += 1;
      entry.source = sourceList[entry.sourceIndex];
      entry.sourceName = entry.source.name;
      entry.host = hostOnly(entry.source.url);
      entry.received = 0;
      entry.total = 0;
      entry.error = `Source ${entry.sourceIndex} failed. Trying ${entry.sourceName} (${entry.sourceIndex + 1}/${sourceList.length})…`;
      emit(true);
      fetchUrl(entry.source.url, entry.sourceIndex, 0);
    };

    const finalizeDownloadedFile = async (): Promise<void> => {
      if (settled) return;
      try {
        const finalPath = await finalize(partPath, entry);
        entry.path = finalPath || entry.path;
        entry.state = 'completed';
        entry.error = '';
        if (!entry.total || entry.total < entry.received) entry.total = entry.received;
        settled = true;
        live.delete(entry.id);
        try { output?.destroy?.(); } catch {}
        entry.paused = false;
        emit(true);
        const publicState = publicEntry(entry);
        if (resolveCompletion) resolveCompletion(publicState);
        managedCompletions.delete(managedKey);
        try { onFinished({ ...publicState, accountName: '' }); } catch {}
      } catch (error) {
        // A bad archive/checksum is treated just like a source failure, so a verified
        // alternate source gets a chance before the whole managed download is failed.
        await tryNextSource(messageOf(error, 'The downloaded component could not be installed.'));
      }
    };

    const fetchUrl = (nextUrl: string, sourceIndex: number, redirectDepth = 0): void => {
      if (settled) return;
      if (redirectDepth > 8) { tryNextSource('Too many redirects while downloading.'); return; }
      if (!/^https:\/\//i.test(nextUrl)) { tryNextSource('Managed download redirected to an insecure URL.'); return; }
      const myToken = ++attemptToken;
      let attemptEnded = false;
      const activeRequest = httpsImpl.get(nextUrl, { headers: { 'User-Agent': 'Mad-Station/1.4 local-assets' } }, (res) => {
        if (settled || myToken !== attemptToken) { res.resume(); return; }
        response = res;
        const status = Number(res.statusCode || 0);
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          fetchUrl(new URL(res.headers.location, nextUrl).toString(), sourceIndex, redirectDepth + 1);
          return;
        }
        if (status !== 200) {
          res.resume();
          if (attemptEnded) return;
          attemptEnded = true;
          tryNextSource(`Download failed from ${entry.sourceName} (HTTP ${status}).`);
          return;
        }
        entry.sourceIndex = sourceIndex;
        entry.source = sourceList[sourceIndex];
        entry.sourceName = entry.source.name;
        entry.host = hostOnly(nextUrl);
        const contentLength = Number(res.headers['content-length']) || 0;
        if (contentLength > 0) entry.total = contentLength;
        if (entry.total > maxBytes) {
          res.resume();
          if (attemptEnded) return;
          attemptEnded = true;
          tryNextSource(`The file from ${entry.sourceName} is unexpectedly large.`);
          return;
        }
        try { fsImpl.mkdirSync(path.dirname(target), { recursive: true }); } catch (error) {
          if (attemptEnded) return;
          attemptEnded = true;
          tryNextSource(messageOf(error, 'Could not prepare the download folder.'));
          return;
        }
        let outputStream: WriteStream;
        try { outputStream = fsImpl.createWriteStream(partPath, { flags: 'wx' }); output = outputStream; } catch (error) {
          if (attemptEnded) return;
          attemptEnded = true;
          tryNextSource(messageOf(error, 'Could not create the download file.'));
          return;
        }
        const fail = (error: Error) => {
          if (settled || myToken !== attemptToken || attemptEnded) return;
          attemptEnded = true;
          tryNextSource(messageOf(error, 'The download failed.'));
        };
        res.on('data', (chunk) => {
          if (settled || myToken !== attemptToken || attemptEnded) return;
          entry.received += chunk.length;
          if (entry.received > maxBytes) {
            try { res.destroy(new Error('Downloaded file is unexpectedly large.')); } catch {}
            return;
          }
          if (!outputStream.write(chunk)) res.pause();
          emit();
        });
        outputStream.on('drain', () => { try { response?.resume?.(); } catch {} });
        res.on('error', fail);
        outputStream.on('error', fail);
        res.on('end', () => {
          if (settled || myToken !== attemptToken || attemptEnded) return;
          attemptEnded = true;
          outputStream.end(() => finalizeDownloadedFile());
        });
      });
      request = activeRequest;
      activeRequest.setTimeout(120000, () => activeRequest.destroy(new Error('Download timed out.')));
      activeRequest.on('error', (error) => {
        if (settled || myToken !== attemptToken || attemptEnded) return;
        if (String(error?.message || '').toLowerCase() === 'cancelled') {
          attemptEnded = true;
          finish('cancelled');
        } else {
          attemptEnded = true;
          tryNextSource(messageOf(error, 'The download failed.'));
        }
      });
    };

    entries.unshift(entry);
    live.set(entry.id, { kind: 'managed', cancel: () => request?.destroy?.(new Error('cancelled')), entry });
    trimList();
    emit(true);
    fetchUrl(entry.source.url, 0, 0);
    return { ok: true, ...publicEntry(entry), completion };
  }

  function handleWillDownload(item: DownloadItemLike, accountId: string): DownloadEntry {
    const settings = normalizeDownloadSettings(getSettings());
    const name = sanitizeFileName(item.getFilename());
    const program = isProgramFileName(name);
    const folder = effectiveFolder();
    const ask = settings.askWhereToSave || program;

    counter += 1;
    const entry: DownloadEntry = {
      id: `dl-${now().toString(36)}-${counter}`,
      name,
      host: hostOnly(item.getURL()),
      accountId: String(accountId || ''),
      state: 'progressing',
      paused: false,
      received: 0,
      total: Number(item.getTotalBytes()) || 0,
      path: '',
      program,
      startedAt: now(),
      error: '',
    };

    if (ask) {
      item.setSaveDialogOptions({ title: 'Save file', defaultPath: path.join(folder, name) });
    } else {
      item.setSavePath(uniqueFilePath(folder, name, (p) => fsImpl.existsSync(p)));
      syncFromItem(entry, item);
    }

    entries.unshift(entry);
    live.set(entry.id, item);
    trimList();

    item.on('updated', (_event, state) => {
      entry.received = Number(item.getReceivedBytes()) || 0;
      entry.total = Number(item.getTotalBytes()) || entry.total;
      entry.paused = Boolean(item.isPaused());
      syncFromItem(entry, item);
      if (state === 'interrupted') entry.state = 'interrupted';
      else if (entry.state === 'interrupted') entry.state = 'progressing';
      emit();
    });

    item.once('done', (_event, state) => {
      live.delete(entry.id);
      entry.paused = false;
      entry.received = Number(item.getReceivedBytes()) || entry.received;
      syncFromItem(entry, item);
      if (state === 'completed') {
        entry.state = 'completed';
        if (!entry.total || entry.total < entry.received) entry.total = entry.received;
      } else if (state === 'cancelled') {
        entry.state = 'cancelled';
        // The Save dialog was dismissed before anything was written: nothing to show.
        if (!entry.path) {
          const index = entries.indexOf(entry);
          if (index !== -1) entries.splice(index, 1);
        }
      } else {
        entry.state = 'failed';
        entry.error = 'The download was interrupted.';
      }
      emit(true);
      if (entry.state === 'completed' || entry.state === 'failed') {
        try {
          onFinished({ ...publicEntry(entry), accountName: getAccountName(entry.accountId) });
        } catch { /* ignore */ }
      }
    });

    emit(true);
    return entry;
  }

  function publicEntry(entry: DownloadEntry): PublicDownloadEntry {
    return {
      id: entry.id,
      name: entry.name,
      displayName: entry.displayName || entry.name,
      host: entry.host,
      accountId: entry.accountId,
      accountName: entry.kind === 'managed' ? '' : getAccountName(entry.accountId),
      kind: entry.kind || 'browser',
      managedKey: entry.managedKey || '',
      category: entry.category || '',
      state: entry.state,
      paused: entry.paused,
      received: entry.received,
      total: entry.total,
      folder: entry.path ? path.dirname(entry.path) : '',
      program: entry.program,
      startedAt: entry.startedAt,
      sourceIndex: Number(entry.sourceIndex) || 0,
      sourceCount: Number(entry.sourceCount) || 1,
      sourceName: entry.sourceName || '',
      canOpen: entry.state === 'completed' && entry.kind !== 'managed' && !entry.program && Boolean(entry.path),
      canShow: entry.state === 'completed' && Boolean(entry.path),
    };
  }

  function getState(): { items: PublicDownloadEntry[]; active: number; folder: string } {
    return {
      items: entries.map(publicEntry),
      active: entries.filter((e) => e.state === 'progressing').length,
      folder: effectiveFolder(),
    };
  }

  function cancel(id: string): { ok: boolean; error?: string } {
    const item = live.get(id);
    if (!item) return { ok: false, error: 'That download is not active.' };
    try { item.cancel(); } catch { return { ok: false, error: 'Could not cancel the download.' }; }
    return { ok: true };
  }

  function pause(id: string): { ok: boolean; error?: string } {
    const item = live.get(id);
    if (!item) return { ok: false, error: 'That download is not active.' };
    try { if (!item.isPaused || !item.pause) return { ok: false, error: 'Could not pause.' }; if (!item.isPaused()) item.pause(); } catch { return { ok: false, error: 'Could not pause.' }; }
    emit(true);
    return { ok: true };
  }

  function resume(id: string): { ok: boolean; error?: string } {
    const item = live.get(id);
    if (!item) return { ok: false, error: 'That download is not active.' };
    try {
      if (!item.canResume || !item.resume) return { ok: false, error: 'Could not resume.' };
      if (!item.canResume()) return { ok: false, error: 'This download cannot be resumed.' };
      item.resume();
    } catch { return { ok: false, error: 'Could not resume.' }; }
    emit(true);
    return { ok: true };
  }

  async function open(id: string): Promise<{ ok: boolean; error?: string }> {
    const entry = find(id);
    if (!entry || entry.state !== 'completed' || !entry.path) return { ok: false, error: 'That file is not available.' };
    if (entry.program) return { ok: false, error: 'Programs and scripts are never opened from Mad Station. Use Show in folder.' };
    if (!fsImpl.existsSync(entry.path)) return { ok: false, error: 'The file was moved or deleted.' };
    const error = await shell.openPath(entry.path);
    return error ? { ok: false, error } : { ok: true };
  }

  function show(id: string): { ok: boolean; error?: string } {
    const entry = find(id);
    if (!entry || !entry.path) return { ok: false, error: 'That file is not available.' };
    if (!fsImpl.existsSync(entry.path)) return { ok: false, error: 'The file was moved or deleted.' };
    shell.showItemInFolder(entry.path);
    return { ok: true };
  }

  function remove(id: string): { ok: boolean; error?: string } {
    const entry = find(id);
    if (!entry) return { ok: false, error: 'Download not found.' };
    if (live.has(id)) return { ok: false, error: 'Cancel the download first.' };
    entries.splice(entries.indexOf(entry), 1);
    emit(true);
    return { ok: true };
  }

  function clearFinished(): { ok: boolean } {
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      if (entries[i].state !== 'progressing') entries.splice(i, 1);
    }
    emit(true);
    return { ok: true };
  }

  async function openFolder(): Promise<{ ok: boolean; path?: string; error?: string }> {
    const folder = effectiveFolder();
    try { fsImpl.mkdirSync(folder, { recursive: true }); } catch { /* ignore */ }
    const error = await shell.openPath(folder);
    return error ? { ok: false, error } : { ok: true, path: folder };
  }

  function cancelForAccount(accountId: string): void {
    for (const [id, item] of live) {
      const entry = find(id);
      if (entry && entry.accountId === accountId) {
        try { item.cancel(); } catch { /* ignore */ }
      }
    }
  }

  function cancelAll(): void {
    for (const item of live.values()) {
      try { item.cancel(); } catch { /* ignore */ }
    }
  }

  return {
    handleWillDownload, startManagedDownload, getState, cancel, pause, resume, open, show, remove,
    clearFinished, openFolder, cancelForAccount, cancelAll, activeCount: () => live.size,
  };
}

export { DEFAULT_DOWNLOAD_SETTINGS, PROGRAM_EXTENSIONS, normalizeDownloadSettings, sanitizeFileName, isProgramFileName, uniqueFilePath, createDownloadManager };

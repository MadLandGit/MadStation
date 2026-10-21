import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import * as https from 'node:https';
import { createPublicInternetLookup } from './network-security.js';
export { createPublicInternetLookup, isPublicInternetAddress } from './network-security.js';

const MAX_ICON_BYTES = 512 * 1024;
const MAX_CACHE_ENTRIES = 128;
const MAX_CACHE_TOTAL_BYTES = 32 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const REQUEST_TIMEOUT_MS = 8000;
const INDEX_FILE = 'index.json';

const lookupPublicHost = createPublicInternetLookup();

const ALLOWED_MIME = new Map([
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
  ['image/x-icon', '.ico'],
  ['image/vnd.microsoft.icon', '.ico'],
  ['image/ico', '.ico'],
]);

interface CachedIconEntry { file: string; mime: string; size: number; icon: string }
interface ImageResult { url: string; mime: string; bytes: Buffer }
interface CacheCandidate { normalized: string; file: string; mime: string; filePath: string; size: number; mtimeMs: number }

function normalizeHttpsUrl(value: unknown): string {
  try {
    const raw = String(value || '').trim();
    if (!raw || raw.length > 2048) return '';
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !parsed.hostname) return '';
    return parsed.href;
  } catch {
    return '';
  }
}

function dataUrl(bytes: Buffer, mime: string): string {
  return `data:${mime};base64,${bytes.toString('base64')}`;
}

function fetchImage(url: string, redirects = 0): Promise<ImageResult> {
  return new Promise<ImageResult>((resolve, reject) => {
    const normalized = normalizeHttpsUrl(url);
    if (!normalized) return reject(new Error('Invalid icon URL'));
    if (redirects > MAX_REDIRECTS) return reject(new Error('Too many redirects'));

    const request = https.get(normalized, {
      headers: {
        'User-Agent': 'Mad-Station/1.6.3 IconCache',
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/png,image/jpeg,image/gif,image/x-icon,*/*;q=0.8',
      },
      timeout: REQUEST_TIMEOUT_MS,
      lookup: lookupPublicHost,
    }, (response) => {
      const status = response.statusCode || 0;
      if (status >= 300 && status < 400 && response.headers.location) {
        response.resume();
        const next = new URL(response.headers.location, normalized).href;
        return fetchImage(next, redirects + 1).then(resolve, reject);
      }
      if (status < 200 || status >= 300) {
        response.resume();
        return reject(new Error(`Icon request returned HTTP ${status}`));
      }

      const contentType = String(response.headers['content-type'] || '').split(';', 1)[0].trim().toLowerCase();
      let mime = ALLOWED_MIME.has(contentType) ? contentType : '';
      if (!mime) {
        try {
          const ext = path.extname(new URL(normalized).pathname).toLowerCase();
          if (ext === '.ico') mime = 'image/x-icon';
          else if (ext === '.png') mime = 'image/png';
          else if (ext === '.jpg' || ext === '.jpeg') mime = 'image/jpeg';
          else if (ext === '.webp') mime = 'image/webp';
          else if (ext === '.gif') mime = 'image/gif';
        } catch { /* ignore */ }
      }
      if (!mime) {
        response.resume();
        return reject(new Error('Response is not a supported image'));
      }

      const chunks: Buffer[] = [];
      let size = 0;
      let aborted = false;
      response.on('data', (chunk: Buffer) => {
        if (aborted) return;
        size += chunk.length;
        if (size > MAX_ICON_BYTES) {
          aborted = true;
          response.destroy(new Error('Icon is too large'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        if (aborted) return;
        const bytes = Buffer.concat(chunks);
        if (!bytes.length) return reject(new Error('Empty icon response'));
        resolve({ url: normalized, mime, bytes });
      });
      response.on('error', reject);
    });
    request.on('timeout', () => request.destroy(new Error('Icon request timed out')));
    request.on('error', reject);
  });
}

function makeFileName(url: string, mime: string): string {
  const ext = ALLOWED_MIME.get(mime) || '.img';
  return `${crypto.createHash('sha256').update(url).digest('hex')}${ext}`;
}

class RemoteIconCache {
  private readonly folder: string;
  private readonly indexPath: string;
  private readonly entries = new Map<string, CachedIconEntry>();
  private readonly inFlight = new Map<string, Promise<string>>();
  private ready = false;
  private totalBytes = 0;

  constructor(folder: string) {
    this.folder = folder;
    this.indexPath = path.join(folder, INDEX_FILE);
  }

  init(): void {
    if (this.ready) return;
    this.ready = true;
    try {
      fs.mkdirSync(this.folder, { recursive: true });
      const parsed: unknown = JSON.parse(fs.readFileSync(this.indexPath, 'utf8'));
      if (parsed && typeof parsed === 'object') {
        const candidates: CacheCandidate[] = [];
        for (const [url, meta] of Object.entries(parsed as Record<string, unknown>)) {
          const metadata = meta && typeof meta === 'object' ? meta as Record<string, unknown> : {};
          const normalized = normalizeHttpsUrl(url);
          const file = typeof metadata.file === 'string' && /^[a-f0-9]{64}\.(png|jpg|webp|gif|ico|img)$/.test(metadata.file) ? metadata.file : '';
          const mime = typeof metadata.mime === 'string' && ALLOWED_MIME.has(metadata.mime) ? metadata.mime : '';
          if (!normalized || !file || !mime) continue;
          const filePath = path.join(this.folder, file);
          try {
            const stat = fs.statSync(filePath);
            if (!stat.isFile() || stat.size === 0 || stat.size > MAX_ICON_BYTES) continue;
            candidates.push({ normalized, file, mime, filePath, size: stat.size, mtimeMs: stat.mtimeMs });
          } catch { /* stale entry */ }
        }
        candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
        for (const item of candidates.slice(0, MAX_CACHE_ENTRIES)) {
          if (this.totalBytes + item.size > MAX_CACHE_TOTAL_BYTES) continue;
          try {
            const bytes = fs.readFileSync(item.filePath);
            this.entries.set(item.normalized, { file: item.file, mime: item.mime, size: item.size, icon: dataUrl(bytes, item.mime) });
            this.totalBytes += item.size;
          } catch { /* stale entry */ }
        }
        this.evictIfNeeded();
      }
    } catch { /* empty/corrupt cache simply starts clean */ }
  }

  get(url: unknown): string {
    this.init();
    const normalized = normalizeHttpsUrl(url);
    if (!normalized) return '';
    const entry = this.entries.get(normalized);
    if (!entry) return '';
    this.entries.delete(normalized);
    this.entries.set(normalized, entry);
    return entry.icon || '';
  }

  private evictIfNeeded(): void {
    while (this.entries.size > MAX_CACHE_ENTRIES || this.totalBytes > MAX_CACHE_TOTAL_BYTES) {
      const oldest = this.entries.keys().next().value;
      if (!oldest) break;
      const entry = this.entries.get(oldest);
      this.entries.delete(oldest);
      this.totalBytes = Math.max(0, this.totalBytes - Number(entry?.size || 0));
      if (entry?.file) {
        try { fs.unlinkSync(path.join(this.folder, entry.file)); } catch { /* best effort */ }
      }
    }
  }

  async cache(url: unknown): Promise<string> {
    this.init();
    const normalized = normalizeHttpsUrl(url);
    if (!normalized) return '';
    const cached = this.entries.get(normalized)?.icon;
    if (cached) return cached;
    const pending = this.inFlight.get(normalized);
    if (pending) return pending;

    const promise = (async () => {
      try {
        const result = await fetchImage(normalized);
        const file = makeFileName(normalized, result.mime);
        const target = path.join(this.folder, file);
        const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
        fs.writeFileSync(tmp, result.bytes);
        fs.renameSync(tmp, target);
        const previous = this.entries.get(normalized);
        if (previous) this.totalBytes = Math.max(0, this.totalBytes - Number(previous.size || 0));
        this.entries.delete(normalized);
        this.entries.set(normalized, { file, mime: result.mime, size: result.bytes.length, icon: dataUrl(result.bytes, result.mime) });
        this.totalBytes += result.bytes.length;
        this.evictIfNeeded();
        this.writeIndex();
        return this.entries.get(normalized)?.icon || '';
      } catch {
        return '';
      } finally {
        this.inFlight.delete(normalized);
      }
    })();
    this.inFlight.set(normalized, promise);
    return promise;
  }

  async cacheFirst(urls: unknown): Promise<string> {
    for (const url of Array.isArray(urls) ? urls as unknown[] : []) {
      const normalized = normalizeHttpsUrl(url);
      if (!normalized) continue;
      const cached = this.get(normalized);
      if (cached) return cached;
      const icon = await this.cache(normalized);
      if (icon) return icon;
    }
    return '';
  }

  private writeIndex(): void {
    try {
      const out: Record<string, { file: string; mime: string }> = {};
      for (const [url, meta] of this.entries.entries()) out[url] = { file: meta.file, mime: meta.mime };
      const tmp = `${this.indexPath}.tmp-${process.pid}-${Date.now()}`;
      fs.writeFileSync(tmp, JSON.stringify(out, null, 2), 'utf8');
      fs.renameSync(tmp, this.indexPath);
    } catch { /* cache is best effort */ }
  }

  releaseMemory(): boolean {
    // Keep the on-disk cache intact; only release decoded/base64 data held in RAM.
    if (this.inFlight.size) return false;
    this.entries.clear();
    this.totalBytes = 0;
    this.ready = false;
    return true;
  }

  clear(): void {
    this.init();
    this.entries.clear();
    this.inFlight.clear();
    this.totalBytes = 0;
    try {
      fs.rmSync(this.folder, { recursive: true, force: true });
    } catch { /* best effort */ }
    this.ready = false;
    this.init();
  }
}

export function createRemoteIconCache(folder: string): RemoteIconCache {
  return new RemoteIconCache(folder);
}

export { MAX_ICON_BYTES, MAX_CACHE_ENTRIES, MAX_CACHE_TOTAL_BYTES, normalizeHttpsUrl };

/** Local/remote provider-icon discovery and bounded warm-cache orchestration. */

type IconService = { id?: string; name?: string; url?: string; icon?: string };
type IconAccount = { serviceId?: string; icon?: string };
type IconConfig = { services?: IconService[]; accounts?: IconAccount[] };
type PathApi = { join(...parts: string[]): string; extname(value: string): string; basename(value: string, ext?: string): string };
type FileEntry = { isFile(): boolean; name: string };
type FileStat = { isFile(): boolean; size: number };
type FileSystemApi = {
  statSync(value: string): FileStat;
  readFileSync(value: string): { toString(encoding: string): string };
  mkdirSync(value: string, options?: { recursive?: boolean }): unknown;
  readdirSync(value: string, options: { withFileTypes: true }): FileEntry[];
};
type RemoteIconCache = {
  get(url: string): string;
  cacheFirst(candidates: string[]): Promise<string>;
  cache(url: string): Promise<string | null | undefined>;
  clear(): unknown;
  releaseMemory?(): unknown;
  totalBytes?: number;
  entries?: Map<unknown, unknown>;
};

export interface IconRuntimeDependencies {
  path: PathApi;
  fs: FileSystemApi;
  getUserDataPath(): string;
  iconFolderName: string;
  remoteCacheFolderName: string;
  iconExtensions: Set<string>;
  maxIconFileBytes: number;
  maxLocalCacheBytes: number;
  iconKey(value: unknown): string;
  hostOf(value: unknown): string;
  sanitizeIcon(value: unknown): string;
  faviconForUrl(value: unknown): string;
  getConfig(): IconConfig | null;
  remoteIconsEnabled(): boolean;
  createRemoteCache(folder: string): RemoteIconCache;
  pushConfig(): void;
}

type LocalIconCache = { files: Map<string, string>; data: Map<string, string>; bytes: number };

export function createIconRuntime(dependencies: IconRuntimeDependencies) {
  let localCache: LocalIconCache | null = null;
  let remoteCache: RemoteIconCache | null = null;
  let remoteWarmPromise: Promise<boolean> | null = null;
  const { path, fs } = dependencies;

  function iconFolderPath() { return path.join(dependencies.getUserDataPath(), dependencies.iconFolderName); }
  function remoteIconCacheFolderPath() { return path.join(iconFolderPath(), dependencies.remoteCacheFolderName); }
  function getRemoteIconCache() {
    if (!remoteCache) remoteCache = dependencies.createRemoteCache(remoteIconCacheFolderPath());
    return remoteCache;
  }
  function imageDataUrl(filePath: string) {
    try {
      const stat = fs.statSync(filePath);
      if (!stat.isFile() || stat.size > dependencies.maxIconFileBytes) return '';
      const ext = path.extname(filePath).toLowerCase();
      const mime = ext === '.ico' ? 'image/x-icon' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : ext === '.gif' ? 'image/gif' : 'image/png';
      return `data:${mime};base64,${fs.readFileSync(filePath).toString('base64')}`;
    } catch { return ''; }
  }
  function localIconFor(service: IconService | null | undefined) {
    const dir = iconFolderPath();
    try {
      if (!localCache) {
        fs.mkdirSync(dir, { recursive: true });
        localCache = { files: new Map(), data: new Map(), bytes: 0 };
        for (const file of fs.readdirSync(dir, { withFileTypes: true })) {
          if (!file.isFile()) continue;
          const ext = path.extname(file.name).toLowerCase();
          if (!dependencies.iconExtensions.has(ext)) continue;
          const filePath = path.join(dir, file.name);
          for (const key of [dependencies.iconKey(path.basename(file.name, ext)), dependencies.iconKey(file.name)].filter(Boolean)) {
            if (!localCache.files.has(key)) localCache.files.set(key, filePath);
          }
        }
      }
      const keys = [dependencies.iconKey(service?.id), dependencies.iconKey(service?.name), dependencies.iconKey(service?.url), dependencies.iconKey(service?.url ? dependencies.hostOf(service.url) : '')].filter(Boolean);
      for (const key of keys) {
        if (localCache.data.has(key)) return localCache.data.get(key)!;
        const filePath = localCache.files.get(key);
        if (!filePath) continue;
        const stat = fs.statSync(filePath);
        if (stat.size > dependencies.maxIconFileBytes || localCache.bytes + stat.size > dependencies.maxLocalCacheBytes) continue;
        const data = imageDataUrl(filePath);
        if (data) { localCache.data.set(key, data); localCache.bytes += stat.size; return data; }
      }
    } catch { /* best effort */ }
    return '';
  }
  function rawIconCandidatesFor(service: IconService | null | undefined, preferred = '') {
    const url = service?.url || '';
    const host = dependencies.hostOf(url);
    const saved = dependencies.sanitizeIcon(preferred);
    const local = saved ? '' : localIconFor(service);
    const siteFavicon = dependencies.faviconForUrl(url);
    return [...new Set([
      saved, local, dependencies.sanitizeIcon(service?.icon), siteFavicon,
      host && `https://${host}/favicon.png`, host && `https://${host}/favicon-32x32.png`,
      host && `https://${host}/apple-touch-icon.png`, host && `https://icons.duckduckgo.com/ip3/${host}.ico`,
      host && `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`, host && `https://favicon.im/${host}`,
    ].filter(Boolean))];
  }
  function iconCandidatesFor(service: IconService | null | undefined, preferred = '', options: { includeCachedRemote?: boolean } = {}) {
    const includeCachedRemote = options.includeCachedRemote !== false;
    const raw = rawIconCandidatesFor(service, preferred);
    const embedded = raw.filter((candidate) => /^data:image\//i.test(candidate));
    if (!includeCachedRemote) return [...new Set([...embedded, ...raw.filter((candidate) => /^https:/i.test(candidate))])];
    let cachedRemote = '';
    for (const candidate of raw) {
      if (!/^https:/i.test(candidate)) continue;
      cachedRemote = getRemoteIconCache().get(candidate);
      if (cachedRemote) break;
    }
    return [...new Set([...embedded, ...(cachedRemote ? [cachedRemote] : []), ...raw])];
  }
  function warmRemoteIcons() {
    if (!dependencies.remoteIconsEnabled()) return Promise.resolve(false);
    if (remoteWarmPromise) return remoteWarmPromise;
    remoteWarmPromise = (async () => {
      const cache = getRemoteIconCache();
      const groups: string[][] = [];
      const config = dependencies.getConfig();
      const services = config?.services || [];
      for (const service of services) {
        const candidates = rawIconCandidatesFor(service, service.icon).filter((candidate) => /^https:/i.test(candidate));
        if (candidates.length && !candidates.some((candidate) => cache.get(candidate))) groups.push(candidates);
      }
      for (const account of config?.accounts || []) {
        const service = services.find((item) => item.id === account.serviceId);
        const preferred = dependencies.sanitizeIcon(account.icon);
        if (!service || !preferred || !/^https:/i.test(preferred) || preferred === service.icon) continue;
        const candidates = rawIconCandidatesFor(service, preferred).filter((candidate) => /^https:/i.test(candidate));
        if (candidates.length && !candidates.some((candidate) => cache.get(candidate))) groups.push(candidates);
      }
      let changed = false;
      let cursor = 0;
      const worker = async () => {
        while (cursor < groups.length) {
          const candidates = groups[cursor++];
          const icon = await cache.cacheFirst(candidates);
          if (icon) changed = true;
        }
      };
      await Promise.all(Array.from({ length: Math.min(4, groups.length) }, () => worker()));
      return changed;
    })().finally(() => { remoteWarmPromise = null; });
    return remoteWarmPromise;
  }
  function warmRemoteIconsAndPush() {
    void warmRemoteIcons().then((changed) => { if (changed) dependencies.pushConfig(); }).catch(() => { /* icon caching is best effort */ });
  }
  function clearLocalIconCache() { localCache = null; }
  function releaseRemoteCacheMemory() { try { getRemoteIconCache().releaseMemory?.(); } catch { /* best effort */ } }
  function localIconCacheStats() { return { bytes: localCache?.bytes || 0, entries: localCache?.data.size || 0 }; }

  return { iconFolderPath, remoteIconCacheFolderPath, getRemoteIconCache, imageDataUrl, localIconFor, rawIconCandidatesFor, iconCandidatesFor, warmRemoteIcons, warmRemoteIconsAndPush, clearLocalIconCache, releaseRemoteCacheMemory, localIconCacheStats };
}

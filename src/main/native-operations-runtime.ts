/** Typed adapters for native file dialogs, developer-source access, icon cache actions,
 * and release-feed checks. Secure sender/lock/payload authorization remains in main.js
 * and every public operation is still registered through that existing wrapper.
 */

type UnknownRecord = Record<string, unknown>;
type PathLike = {
  isAbsolute(path: string): boolean;
  resolve(...parts: string[]): string;
  join(...parts: string[]): string;
  extname(path: string): string;
  basename(path: string): string;
  sep: string;
};
type HeadRequest = {
  on(event: string, listener: (...args: any[]) => void): unknown;
  setTimeout(milliseconds: number, callback: () => void): unknown;
  abort(): unknown;
  end(): unknown;
};
type PublicAddress = { address: string; family: number };
type FileSystemLike = {
  existsSync(path: string): boolean;
  statSync(path: string): { isFile(): boolean; size: number };
  mkdirSync(path: string, options?: { recursive?: boolean }): unknown;
  readFileSync(path: string): { toString(encoding: string): string };
};

export interface NativeOperationsDependencies {
  path: PathLike;
  fs: FileSystemLike;
  getDeveloperRoot(): string;
  developerFiles: Set<string>;
  showInFolder(path: string): void;
  openPath(path: string): Promise<string>;
  getUserDataPath(): string;
  getIconFolderPath(): string;
  chooseIconFile(): Promise<{ canceled: boolean; filePaths?: string[] }>;
  maxIconBytes: number;
  sanitizeIcon(value: unknown): string;
  getRemoteIconCache(): { cache(url: string): Promise<string | null | undefined>; clear(): unknown };
  clearLocalIconCache(): void;
  pushConfig(): void;
  warmRemoteIconsAndPush(): void;
  resolvePublicHost(hostname: string): Promise<PublicAddress[]>;
  fetchReleaseFeed(url: string, addresses: readonly PublicAddress[]): Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
  getReleaseFeedUrl(): string;
  getCurrentVersion(): string;
  normalizeHttpsUrl(value: unknown): string | null;
  createHeadRequest(url: string, addresses: readonly PublicAddress[]): HeadRequest;
}

export function parseStableVersion(value: unknown): number[] | null {
  const match = /^([0-9]+)\.([0-9]+)\.([0-9]+)$/.exec(String(value || '').trim());
  return match ? match.slice(1).map(Number) : null;
}

export function compareStableVersions(a: unknown, b: unknown): number | null {
  const left = parseStableVersion(a);
  const right = parseStableVersion(b);
  if (!left || !right) return null;
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] > right[index] ? 1 : -1;
  }
  return 0;
}

export function createNativeOperationsRuntime(dependencies: NativeOperationsDependencies) {
  const { path, fs } = dependencies;

  async function showDeveloperFileLocation(relativeFile: unknown) {
    try {
      if (typeof relativeFile !== 'string' || !dependencies.developerFiles.has(relativeFile) || path.isAbsolute(relativeFile) || relativeFile.split(/[\\/]/).includes('..')) {
        return { ok: false, error: 'That developer file is not on the allowlist.' };
      }
      const base = dependencies.getDeveloperRoot();
      const filePath = path.resolve(base, relativeFile);
      const allowedRoot = path.resolve(base) + path.sep;
      if (!filePath.startsWith(allowedRoot)) return { ok: false, error: 'Invalid developer file path.' };
      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return { ok: false, error: 'Developer file is not included in this installation. Open the source repository to access it.' };
      dependencies.showInFolder(filePath);
      return { ok: true, path: filePath };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Could not show that developer file location.' };
    }
  }

  async function openDeveloperFile(relativeFile: unknown) {
    try {
      if (typeof relativeFile !== 'string' || !dependencies.developerFiles.has(relativeFile) || path.isAbsolute(relativeFile) || relativeFile.split(/[\\/]/).includes('..')) {
        return { ok: false, error: 'That developer file is not on the allowlist.' };
      }
      const base = dependencies.getDeveloperRoot();
      const filePath = path.resolve(base, relativeFile);
      const allowedRoot = path.resolve(base) + path.sep;
      if (!filePath.startsWith(allowedRoot)) return { ok: false, error: 'Invalid developer file path.' };
      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return { ok: false, error: 'Developer file is not included in this installation. Open the source repository to access it.' };
      const error = await dependencies.openPath(filePath);
      return error ? { ok: false, error } : { ok: true, path: filePath };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Could not open that developer file.' };
    }
  }

  async function openDataFolder() {
    try {
      const folder = dependencies.getUserDataPath();
      const error = await dependencies.openPath(folder);
      return error ? { ok: false, error } : { ok: true, path: folder };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Could not open the data folder.' };
    }
  }

  async function openIconFolder() {
    try {
      const folder = dependencies.getIconFolderPath();
      fs.mkdirSync(folder, { recursive: true });
      const error = await dependencies.openPath(folder);
      return error ? { ok: false, error } : { ok: true, path: folder };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Could not open the icon folder.' };
    }
  }

  function refreshIcons() {
    dependencies.clearLocalIconCache();
    try { fs.mkdirSync(dependencies.getIconFolderPath(), { recursive: true }); } catch { /* best effort */ }
    try { dependencies.getRemoteIconCache().clear(); } catch { /* best effort */ }
    dependencies.pushConfig();
    dependencies.warmRemoteIconsAndPush();
    return { ok: true };
  }

  async function cacheIcon(iconUrl: unknown) {
    const normalized = dependencies.sanitizeIcon(iconUrl);
    if (!/^https:/i.test(normalized)) return { ok: false, error: 'Only HTTPS icon URLs can be cached.' };
    const icon = await dependencies.getRemoteIconCache().cache(normalized);
    return icon ? { ok: true, icon } : { ok: false, error: 'Could not cache that icon.' };
  }

  async function chooseIcon() {
    const { canceled, filePaths } = await dependencies.chooseIconFile();
    if (canceled || !filePaths?.[0]) return { ok: false, canceled: true };
    const filePath = filePaths[0];
    try {
      if (fs.statSync(filePath).size > dependencies.maxIconBytes) return { ok: false, error: 'Image is too large (max 512 KB).' };
    } catch { return { ok: false, error: 'Could not read that file.' }; }
    const extension = path.extname(filePath).toLowerCase();
    const mime = extension === '.ico' ? 'image/x-icon'
      : extension === '.jpg' || extension === '.jpeg' ? 'image/jpeg'
        : extension === '.webp' ? 'image/webp'
          : extension === '.gif' ? 'image/gif' : 'image/png';
    const data = fs.readFileSync(filePath).toString('base64');
    return { ok: true, icon: `data:${mime};base64,${data}`, name: path.basename(filePath) };
  }

  async function verifyProvider(rawUrl: unknown) {
    const url = dependencies.normalizeHttpsUrl(rawUrl);
    if (!url) return { ok: false, error: 'Enter a valid HTTPS URL first.' };
    let addresses: PublicAddress[];
    try {
      const hostname = new URL(url).hostname;
      addresses = await dependencies.resolvePublicHost(hostname);
    } catch {
      return { ok: false, error: 'Provider verification only checks public internet hosts; private, local, or reserved network addresses are blocked.' };
    }
    if (!addresses.length) return { ok: false, error: 'The provider host did not resolve to a public internet address.' };
    return await new Promise<{ ok: boolean; statusCode?: number; statusText?: string; url?: string; error?: string }>((resolve) => {
      let settled = false;
      const finish = (result: { ok: boolean; statusCode?: number; statusText?: string; url?: string; error?: string }) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };
      try {
        const request = dependencies.createHeadRequest(url, addresses);
        request.on('redirect', () => {
          try { request.abort(); } catch { /* ignore abort errors */ }
          finish({ ok: false, error: 'Provider verification redirects are blocked.' });
        });
        request.on('response', (response: { statusCode?: number; statusMessage?: string }) => {
          const statusCode = Number(response.statusCode || 0);
          finish(statusCode >= 300 && statusCode < 400
            ? { ok: false, error: 'Provider verification redirects are blocked.', statusCode }
            : { ok: statusCode >= 200 && statusCode < 400, statusCode, statusText: response.statusMessage || '', url });
        });
        request.on('error', (error: { message?: string }) => finish({ ok: false, error: error?.message || 'The website could not be reached.' }));
        request.setTimeout(10_000, () => {
          try { request.abort(); } catch { /* ignore abort errors */ }
          finish({ ok: false, error: 'The website did not respond within 10 seconds.' });
        });
        request.end();
      } catch (error) {
        finish({ ok: false, error: error instanceof Error ? error.message : 'Could not verify that website.' });
      }
    });
  }

  async function checkForUpdates() {
    const feed = dependencies.getReleaseFeedUrl();
    if (!feed) return { ok: false, configured: false, error: 'No release feed is configured. Add a release feed URL in Data settings.' };
    try {
      const parsed = new URL(feed);
      if (parsed.protocol !== 'https:') return { ok: false, error: 'The release feed must use HTTPS.' };
      if (!parsed.hostname || parsed.username || parsed.password || feed.length > 2048 || parsed.hash) {
        return { ok: false, error: 'The release feed URL is invalid.' };
      }
      const normalizedFeed = dependencies.normalizeHttpsUrl(parsed.href);
      if (!normalizedFeed) return { ok: false, error: 'The release feed URL is invalid.' };
      let addresses: PublicAddress[];
      try { addresses = await dependencies.resolvePublicHost(parsed.hostname); }
      catch { return { ok: false, error: 'The release feed must resolve only to public internet addresses.' }; }
      if (!addresses.length) return { ok: false, error: 'The release feed did not resolve to a public internet address.' };
      const response = await dependencies.fetchReleaseFeed(normalizedFeed, addresses);
      if (!response.ok) return { ok: false, error: `Update feed returned HTTP ${response.status}.` };
      const dataRaw = await response.json();
      const data = dataRaw !== null && typeof dataRaw === 'object' && !Array.isArray(dataRaw) ? dataRaw as UnknownRecord : {};
      const latest = String(data.version || data.tag || '').replace(/^v/i, '');
      const versionComparison = compareStableVersions(dependencies.getCurrentVersion(), latest);
      if (versionComparison === null) return { ok: false, error: 'The release feed version must use stable x.y.z format.' };
      const candidateUrl = String(data.url || data.releaseUrl || '').trim();
      const url = dependencies.normalizeHttpsUrl(candidateUrl) || '';
      return { ok: true, current: dependencies.getCurrentVersion(), latest, updateAvailable: versionComparison < 0, url };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Could not check for updates.' };
    }
  }

  return { showDeveloperFileLocation, openDeveloperFile, openDataFolder, openIconFolder, refreshIcons, cacheIcon, chooseIcon, verifyProvider, checkForUpdates };
}

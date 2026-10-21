/** Typed filesystem boundary for user-selected custom background images.
 *
 * Native file selection and persisted settings remain in the Electron host.
 * This module validates selected paths and image types, copies imported images
 * into the managed user-data directory, and only removes files whose resolved
 * file URL is contained directly inside that directory.
 */

export const MAX_BACKGROUND_FILE_BYTES = 25 * 1024 * 1024;

const BACKGROUND_MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
};

const ALLOWED_BACKGROUND_EXTENSIONS = new Set(Object.keys(BACKGROUND_MIME_BY_EXTENSION));

export interface BackgroundPathApi {
  isAbsolute(value: string): boolean;
  resolve(...paths: string[]): string;
  extname(value: string): string;
  basename(value: string, suffix?: string): string;
  join(...paths: string[]): string;
  relative(from: string, to: string): string;
  readonly sep: string;
}

export interface BackgroundFileSystem {
  mkdirSync(path: string, options: { recursive: true }): unknown;
  statSync(path: string): { isFile(): boolean; size: number };
  lstatSync(path: string): { isFile(): boolean; isSymbolicLink(): boolean };
  copyFileSync(source: string, destination: string, mode?: number): void;
  unlinkSync(path: string): void;
}

export interface BackgroundUrlApi {
  fileURLToPath(value: string): string;
  pathToFileURL(value: string): { href: string };
}

export interface BackgroundRecord {
  id: string;
  name: string;
  type: 'local';
  url: string;
  createdAt: string;
  mime: string;
}

export type AddBackgroundResult =
  | { ok: true; background: BackgroundRecord }
  | { ok: false; error: string };

export interface BackgroundFileDependencies {
  path: BackgroundPathApi;
  fs: BackgroundFileSystem;
  url: BackgroundUrlApi;
  getStoreDirectory(): string;
  createId(): string;
  now(): string;
  copyFileExclusiveFlag: number;
  maxBytes?: number;
  redactError?(value: unknown, fallback: string): string;
}

function errorCode(value: unknown): string {
  return value && typeof value === 'object' && 'code' in value
    ? String((value as { code?: unknown }).code ?? '')
    : '';
}

export function createBackgroundFilesController(dependencies: BackgroundFileDependencies) {
  const maxBytes = Number.isFinite(dependencies.maxBytes)
    ? Math.max(0, Math.floor(dependencies.maxBytes as number))
    : MAX_BACKGROUND_FILE_BYTES;

  function safeError(value: unknown, fallback: string): string {
    const message = dependencies.redactError?.(value, fallback) ?? fallback;
    return String(message || fallback).slice(0, 320);
  }

  function managedStoreDirectory(): string {
    const configured = dependencies.getStoreDirectory();
    if (typeof configured !== 'string' || !configured || configured.includes('\0') || !dependencies.path.isAbsolute(configured)) {
      throw new Error('Background storage is unavailable.');
    }
    return dependencies.path.resolve(configured);
  }

  /** Return a normalized path only when a file URL points directly below the managed store. */
  function managedPathFromUrl(fileUrl: unknown): string | null {
    if (typeof fileUrl !== 'string' || !fileUrl.startsWith('file://') || fileUrl.length > 32767) return null;
    try {
      const target = dependencies.path.resolve(dependencies.url.fileURLToPath(fileUrl));
      const root = managedStoreDirectory();
      const relative = dependencies.path.relative(root, target);
      if (!relative || relative === '..' || relative.startsWith(`..${dependencies.path.sep}`) || dependencies.path.isAbsolute(relative)) {
        return null;
      }
      // Backgrounds are flat, generated files only; don't let a modified config
      // use this cleanup path to unlink unrelated files in the same directory.
      if (relative.includes('/') || relative.includes('\\')) return null;
      if (!/^local-[A-Za-z0-9_-]{1,80}\.(?:png|jpe?g|webp|gif|bmp|avif|svg)$/i.test(relative)) return null;
      // Do not treat a symlink with a trusted-looking generated name as a managed
      // image: the renderer would otherwise load content outside the store.
      const fileStat = dependencies.fs.lstatSync(target);
      if (fileStat.isSymbolicLink() || !fileStat.isFile()) return null;
      return target;
    } catch {
      return null;
    }
  }

  function addFromPath(selectedPath: unknown): AddBackgroundResult {
    if (typeof selectedPath !== 'string' || !selectedPath || selectedPath.includes('\0') || selectedPath.length > 32767 || !dependencies.path.isAbsolute(selectedPath)) {
      return { ok: false, error: 'Choose a valid image file.' };
    }

    const source = dependencies.path.resolve(selectedPath);
    const extension = dependencies.path.extname(source).toLowerCase();
    if (!ALLOWED_BACKGROUND_EXTENSIONS.has(extension)) {
      return { ok: false, error: 'That file type is not supported as a background.' };
    }

    try {
      const stats = dependencies.fs.statSync(source);
      if (!stats.isFile()) return { ok: false, error: 'That selection is not a file.' };
      if (!Number.isFinite(stats.size) || stats.size < 0 || stats.size > maxBytes) {
        return { ok: false, error: 'Backgrounds must be 25 MB or smaller.' };
      }

      const idSuffix = dependencies.createId();
      if (typeof idSuffix !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(idSuffix)) {
        return { ok: false, error: 'Could not create a safe background identifier.' };
      }
      const id = `local-${idSuffix}`;
      const directory = managedStoreDirectory();
      dependencies.fs.mkdirSync(directory, { recursive: true });
      const destination = dependencies.path.join(directory, `${id}${extension}`);
      const relative = dependencies.path.relative(directory, destination);
      if (!relative || relative === '..' || relative.startsWith(`..${dependencies.path.sep}`) || dependencies.path.isAbsolute(relative)) {
        return { ok: false, error: 'Could not create a safe background destination.' };
      }

      try {
        dependencies.fs.copyFileSync(source, destination, dependencies.copyFileExclusiveFlag);
      } catch (error) {
        // If exclusive creation failed because the name already exists, do not
        // unlink a file owned by a different operation. Other copy failures may
        // leave a partial target; clean that target up best-effort.
        if (errorCode(error) !== 'EEXIST') {
          try { dependencies.fs.unlinkSync(destination); } catch { /* best-effort partial-file cleanup */ }
        }
        throw error;
      }

      const name = dependencies.path.basename(source, extension) || 'Local background';
      return {
        ok: true,
        background: {
          id,
          name,
          type: 'local',
          url: dependencies.url.pathToFileURL(destination).href,
          createdAt: dependencies.now(),
          mime: BACKGROUND_MIME_BY_EXTENSION[extension] || 'application/octet-stream',
        },
      };
    } catch (error) {
      return { ok: false, error: safeError(error, 'Could not add that background.') };
    }
  }

  /** Remove only managed local files. Stale/unremovable files do not block settings cleanup. */
  function removeStoredFile(fileUrl: unknown): boolean {
    const target = managedPathFromUrl(fileUrl);
    if (!target) return false;
    try {
      dependencies.fs.unlinkSync(target);
      return true;
    } catch {
      return false;
    }
  }

  return {
    addFromPath,
    isManagedFileUrl: (fileUrl: unknown) => managedPathFromUrl(fileUrl) !== null,
    removeStoredFile,
  };
}

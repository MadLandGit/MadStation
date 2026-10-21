/** File-boundary helpers for account exports and workspace backups.
 * Electron still owns the dialogs; these injected helpers validate the result
 * and constrain JSON reads/writes before data reaches the transfer controller.
 */

export interface TransferPathApi {
  isAbsolute(value: string): boolean;
  resolve(value: string): string;
  extname(value: string): string;
  basename(value: string): string;
}

export interface TransferFileSystem {
  statSync(path: string): { isFile(): boolean; size: number };
  readFileSync(path: string, encoding: 'utf8'): string;
  writeFileSync(path: string, data: string, options: { encoding: 'utf8'; flag: 'wx'; mode: number }): void;
  renameSync(oldPath: string, newPath: string): void;
  existsSync(path: string): boolean;
  unlinkSync(path: string): void;
}

export interface TransferFileDependencies {
  path: TransferPathApi;
  fs: TransferFileSystem;
  temporarySuffix(): string;
}

export const MAX_WORKSPACE_TRANSFER_BYTES = 25 * 1024 * 1024;

export function normalizeWorkspaceJsonPath(selectedPath: unknown, pathApi: TransferPathApi): string {
  if (typeof selectedPath !== 'string' || !selectedPath || selectedPath.includes('\0') || selectedPath.length > 32767) {
    throw new Error('Choose a valid JSON file path.');
  }
  if (!pathApi.isAbsolute(selectedPath)) throw new Error('Choose an absolute JSON file path.');
  const normalized = pathApi.resolve(selectedPath);
  const basename = pathApi.basename(normalized);
  if (!basename || basename === '.' || basename === '..' || pathApi.extname(normalized).toLowerCase() !== '.json') {
    throw new Error('The selected file must use the .json extension.');
  }
  return normalized;
}

export function readWorkspaceJson(
  selectedPath: unknown,
  dependencies: TransferFileDependencies,
  maxBytes = MAX_WORKSPACE_TRANSFER_BYTES,
): unknown {
  const filePath = normalizeWorkspaceJsonPath(selectedPath, dependencies.path);
  const stat = dependencies.fs.statSync(filePath);
  if (!stat.isFile()) throw new Error('The selected path is not a file.');
  if (!Number.isFinite(stat.size) || stat.size < 0 || stat.size > maxBytes) {
    throw new Error('The selected JSON file is too large to import.');
  }
  return JSON.parse(dependencies.fs.readFileSync(filePath, 'utf8')) as unknown;
}

/** Write user-selected JSON destinations through an exclusive sibling temp file. */
export function writeWorkspaceJsonAtomically(
  selectedPath: unknown,
  data: unknown,
  dependencies: TransferFileDependencies,
): void {
  const targetPath = normalizeWorkspaceJsonPath(selectedPath, dependencies.path);
  const serialized = JSON.stringify(data, null, 2);
  if (typeof serialized !== 'string') throw new Error('The JSON data could not be serialized.');
  const suffix = dependencies.temporarySuffix();
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(suffix)) throw new Error('Invalid temporary file token.');
  const temporaryPath = `${targetPath}.tmp-${suffix}`;
  try {
    dependencies.fs.writeFileSync(temporaryPath, serialized, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    dependencies.fs.renameSync(temporaryPath, targetPath);
  } finally {
    try {
      if (dependencies.fs.existsSync(temporaryPath)) dependencies.fs.unlinkSync(temporaryPath);
    } catch {
      // Preserve the original operation error; temporary-file cleanup is best effort.
    }
  }
}

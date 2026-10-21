/** Atomic JSON config persistence with backup recovery and corrupt-file quarantine. */
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface ConfigStoreFileSystem {
  mkdirSync: typeof fs.mkdirSync;
  existsSync: typeof fs.existsSync;
  writeFileSync: typeof fs.writeFileSync;
  copyFileSync: typeof fs.copyFileSync;
  renameSync: typeof fs.renameSync;
  unlinkSync: typeof fs.unlinkSync;
  readFileSync: typeof fs.readFileSync;
}

export interface ConfigStoreLogger {
  warn(...values: unknown[]): void;
  error(...values: unknown[]): void;
}

export interface ConfigStoreDependencies {
  getFilePath(): string;
  migrateConfig(value: unknown): unknown;
  makeDefaultConfig(): unknown;
  fileSystem?: ConfigStoreFileSystem;
  logger?: ConfigStoreLogger;
  now?: () => number;
  processId?: number;
}

export interface SaveConfigOptions {
  createBackup?: boolean;
}

export interface ConfigStore {
  saveConfig(config: unknown, options?: SaveConfigOptions): boolean;
  loadConfig(): unknown;
}

function errorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('code' in error)) return null;
  return typeof error.code === 'string' ? error.code : null;
}

export function createConfigStore(dependencies: ConfigStoreDependencies): ConfigStore {
  const fileSystem = dependencies.fileSystem || fs;
  const logger = dependencies.logger || console;
  const now = dependencies.now || Date.now;
  const processId = dependencies.processId ?? process.pid;

  function saveConfig(config: unknown, { createBackup = true }: SaveConfigOptions = {}): boolean {
    const file = dependencies.getFilePath();
    const temporaryFile = `${file}.tmp-${processId}`;
    let lastError: unknown = null;
    try {
      fileSystem.mkdirSync(path.dirname(file), { recursive: true });
      const payload = JSON.stringify(config, null, 2);
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          fileSystem.writeFileSync(temporaryFile, payload, 'utf8');
          if (createBackup && fileSystem.existsSync(file)) {
            try {
              fileSystem.copyFileSync(file, `${file}.bak`);
            } catch (error) {
              logger.warn('Could not refresh config backup:', error);
            }
          }
          fileSystem.renameSync(temporaryFile, file);
          return true;
        } catch (error) {
          lastError = error;
          if (!['EPERM', 'EACCES', 'EBUSY'].includes(errorCode(error) || '') || attempt === 2) break;
        }
      }
    } catch (error) {
      lastError = error;
    } finally {
      try {
        if (fileSystem.existsSync(temporaryFile)) fileSystem.unlinkSync(temporaryFile);
      } catch {
        // Best effort cleanup; the primary error is reported below.
      }
    }
    logger.error('Could not save config:', lastError);
    return false;
  }

  function quarantineCorruptConfig(file: string): void {
    try {
      fileSystem.renameSync(file, path.join(path.dirname(file), `config.corrupt-${now()}.json`));
    } catch {
      // Best effort: keep the original file if quarantine isn't possible.
    }
  }

  function loadConfig(): unknown {
    const file = dependencies.getFilePath();
    for (const candidate of [file, `${file}.bak`]) {
      if (!fileSystem.existsSync(candidate)) continue;
      try {
        const parsed: unknown = dependencies.migrateConfig(JSON.parse(fileSystem.readFileSync(candidate, 'utf8')));
        saveConfig(parsed, { createBackup: candidate === file });
        return parsed;
      } catch {
        // Never silently overwrite a file we could not read: keep it for recovery.
        if (candidate === file) quarantineCorruptConfig(file);
      }
    }
    const config = dependencies.makeDefaultConfig();
    saveConfig(config);
    return config;
  }

  return { saveConfig, loadConfig };
}

/**
 * OS-backed storage boundary for AI Lab API credentials.
 *
 * Electron and Node capabilities are injected by the main-process composition
 * root. The persisted envelope remains `mad-station-secure-credentials` so
 * existing installations can read their saved keys without a data migration.
 */

export interface CredentialPathApi {
  dirname(filePath: string): string;
}

export interface CredentialFileSystem {
  readFileSync(filePath: string, encoding: 'utf8'): string;
  mkdirSync(directory: string, options: { recursive: true }): void;
  writeFileSync(
    filePath: string,
    data: string,
    options: { encoding: 'utf8'; flag: 'wx'; mode: number },
  ): void;
  renameSync(oldPath: string, newPath: string): void;
  existsSync(filePath: string): boolean;
  unlinkSync(filePath: string): void;
}

export interface CredentialSafeStorage {
  isEncryptionAvailable(): boolean;
  getSelectedStorageBackend?(): string | undefined;
  encryptStringAsync?: (value: string) => Promise<Uint8Array>;
  encryptString?: (value: string) => Uint8Array;
  decryptStringAsync?: (value: Uint8Array) => Promise<string>;
  decryptString?: (value: Uint8Array) => string;
}

export interface AiLabCredentialDependencies {
  getFilePath(): string;
  path: CredentialPathApi;
  fs: CredentialFileSystem;
  safeStorage: CredentialSafeStorage;
  encodeBase64(value: Uint8Array): string;
  decodeBase64(value: string): Uint8Array;
  temporarySuffix(): string;
}

export type AiLabCredentials = Record<string, string>;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isCredentialRecord(value: unknown): value is AiLabCredentials {
  return isPlainRecord(value) && Object.values(value).every((item) => typeof item === 'string');
}

export function createAiLabCredentialStore(dependencies: AiLabCredentialDependencies) {
  const storageAvailable = (): boolean => {
    try {
      if (!dependencies.safeStorage.isEncryptionAvailable()) return false;
      const backend = dependencies.safeStorage.getSelectedStorageBackend?.();
      return backend ? backend !== 'basic_text' : true;
    } catch {
      return false;
    }
  };

  const encrypt = async (value: string): Promise<Uint8Array> => {
    if (!storageAvailable()) throw new Error('Secure credential storage is unavailable on this device.');
    if (dependencies.safeStorage.encryptStringAsync) return dependencies.safeStorage.encryptStringAsync(value);
    if (dependencies.safeStorage.encryptString) return dependencies.safeStorage.encryptString(value);
    throw new Error('Secure credential storage is unavailable on this device.');
  };

  const decrypt = async (value: Uint8Array): Promise<string> => {
    if (!storageAvailable()) throw new Error('Secure credential storage is unavailable on this device.');
    if (dependencies.safeStorage.decryptStringAsync) return dependencies.safeStorage.decryptStringAsync(value);
    if (dependencies.safeStorage.decryptString) return dependencies.safeStorage.decryptString(value);
    throw new Error('Secure credential storage is unavailable on this device.');
  };

  async function read(): Promise<AiLabCredentials> {
    try {
      const raw = JSON.parse(dependencies.fs.readFileSync(dependencies.getFilePath(), 'utf8')) as unknown;
      if (!isPlainRecord(raw) || raw.format !== 'mad-station-secure-credentials' || typeof raw.data !== 'string' || !raw.data) {
        return {};
      }
      const decrypted = await decrypt(dependencies.decodeBase64(raw.data));
      const parsed = JSON.parse(decrypted) as unknown;
      if (!isPlainRecord(parsed) || !isCredentialRecord(parsed.items)) return {};
      return parsed.items;
    } catch {
      // Keep startup non-destructive when the key file is missing, corrupt, or
      // unavailable through the OS credential backend. Save operations still
      // fail loudly rather than silently losing new credentials.
      return {};
    }
  }

  async function write(items: AiLabCredentials): Promise<true> {
    if (!isCredentialRecord(items)) throw new Error('Invalid AI Lab credential data.');
    const target = dependencies.getFilePath();
    const suffix = dependencies.temporarySuffix();
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(suffix)) throw new Error('Invalid temporary file token.');
    const temporary = `${target}.tmp-${suffix}`;
    const plaintext = JSON.stringify({ version: 1, items });
    const encrypted = await encrypt(plaintext);
    const envelope = JSON.stringify({
      format: 'mad-station-secure-credentials',
      version: 1,
      data: dependencies.encodeBase64(encrypted),
    }, null, 2);

    let ownsTemporary = false;
    try {
      dependencies.fs.mkdirSync(dependencies.path.dirname(target), { recursive: true });
      // Keys are encrypted before any disk write. The temp file is exclusive
      // and owner-readable/writable on POSIX. Do not remove another writer's
      // file if our exclusive open fails due to a name collision.
      dependencies.fs.writeFileSync(temporary, envelope, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
      ownsTemporary = true;
      dependencies.fs.renameSync(temporary, target);
      ownsTemporary = false;
      return true;
    } finally {
      try {
        if (ownsTemporary && dependencies.fs.existsSync(temporary)) dependencies.fs.unlinkSync(temporary);
      } catch {
        // Preserve the original operation error; best-effort cleanup only.
      }
    }
  }

  return { storageAvailable, read, write };
}

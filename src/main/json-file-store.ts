/** Small atomic JSON-file persistence primitive for trusted main-process stores.
 * Path choice, schema validation, recovery defaults and mutations remain with
 * the domain owner; this module only handles file IO and corrupt-file quarantine.
 */

type JsonFileSystem = {
  readFileSync(path: string, encoding: 'utf8'): string;
  writeFileSync(path: string, data: string, encoding: 'utf8'): void;
  renameSync(source: string, destination: string): void;
};

export interface AtomicJsonFileStoreDependencies {
  getFilePath(): string;
  fs: JsonFileSystem;
  now?: () => number;
}

export interface JsonFileReadResult {
  ok: boolean;
  value: unknown;
}

export function createAtomicJsonFileStore(dependencies: AtomicJsonFileStoreDependencies) {
  const now = dependencies.now || Date.now;

  function read(): JsonFileReadResult {
    const file = dependencies.getFilePath();
    let exists = false;
    try {
      const serialized = dependencies.fs.readFileSync(file, 'utf8');
      exists = true;
      return { ok: true, value: JSON.parse(serialized) as unknown };
    } catch {
      if (exists) {
        try { dependencies.fs.renameSync(file, `${file}.corrupt-${now()}`); } catch { /* preserve default recovery if quarantine fails */ }
      }
      return { ok: false, value: null };
    }
  }

  function write(value: unknown): boolean {
    try {
      const file = dependencies.getFilePath();
      const temporary = `${file}.tmp`;
      dependencies.fs.writeFileSync(temporary, JSON.stringify(value, null, 2), 'utf8');
      dependencies.fs.renameSync(temporary, file);
      return true;
    } catch {
      return false;
    }
  }

  return { read, write };
}

/** Typed diagnostics boundary.
 *
 * The Electron host injects dialogs, filesystem operations, and live diagnostic
 * collection. This module validates user-selected export paths, writes JSON
 * atomically, and redacts errors before they cross back to the renderer.
 */

export interface DiagnosticsPathApi {
  isAbsolute(value: string): boolean;
  resolve(value: string): string;
  extname(value: string): string;
  basename(value: string): string;
  dirname(value: string): string;
}

export interface DiagnosticsFileSystem {
  writeFileSync(path: string, data: string, options: { encoding: 'utf8'; flag: 'wx'; mode: number }): void;
  renameSync(oldPath: string, newPath: string): void;
  existsSync(path: string): boolean;
  unlinkSync(path: string): void;
}

export interface DiagnosticsExportDependencies {
  path: DiagnosticsPathApi;
  fs: DiagnosticsFileSystem;
  temporarySuffix: () => string;
}

export interface DiagnosticsDialogResult {
  canceled?: boolean;
  filePath?: string;
}

export interface DiagnosticsControllerDependencies {
  collectDiagnostics(options: { probeProviders: boolean }): Promise<unknown>;
  showSaveDialog(options: {
    title: string;
    defaultPath: string;
    filters: Array<{ name: string; extensions: string[] }>;
  }): Promise<DiagnosticsDialogResult>;
  writeDiagnosticsFile(filePath: string, data: unknown): void;
  defaultFileName(): string;
}

/** Remove URLs, local filesystem paths, and line breaks from diagnostic text. */
export function redactDiagnosticText(value: unknown, maxLength = 320): string {
  const limit = Number.isFinite(maxLength) ? Math.max(0, Math.min(6000, Math.floor(maxLength))) : 320;
  return String(value ?? '')
    .replace(/(?:https?|file):\/\/[^\s"'<>]+/gi, '[redacted-url]')
    .replace(/(["'])([A-Za-z]:\\[^"']+)\1/g, '$1[redacted-path]$1')
    .replace(/\b[A-Za-z]:\\[^"'<>]+/g, '[redacted-path]')
    .replace(/(["'])(\/(?:Users|home|private|tmp|var\/folders)\/[^"']+)\1/g, '$1[redacted-path]$1')
    .replace(/\/(?:Users|home|private|tmp|var\/folders)\/[^\s"'<>]+/g, '[redacted-path]')
    .replace(/\b(Bearer)\s+[A-Za-z0-9._~+/-]+=*/gi, '$1 [redacted]')
    .replace(/\b(api[_-]?key|access[_-]?token|refresh[_-]?token|authorization)\s*[:=]\s*[^,;\s]+/gi, '$1=[redacted]')
    .replace(/[\r\n\t]+/g, ' ')
    .slice(0, limit);
}

export function diagnosticError(value: unknown, fallback = ''): string {
  const message = value instanceof Error ? value.message : String(value ?? '');
  return redactDiagnosticText(message, 320) || fallback;
}

/** Keep the memory payload intentionally numeric and aggregate-only. */
export function summarizeMemoryForDiagnostics(snapshot: unknown): Record<string, number> {
  const value = snapshot && typeof snapshot === 'object' ? snapshot as Record<string, unknown> : {};
  const number = (key: string): number => Number(value[key]) || 0;
  return {
    appWorkingSetKb: number('totalKb'),
    mainKb: number('mainKb'),
    browserKb: number('aiHubKb') + number('arenaKb') + number('forgeKb'),
    aiHubKb: number('aiHubKb'),
    arenaKb: number('arenaKb'),
    forgeKb: number('forgeKb'),
    gpuKb: number('gpuKb'),
    uiKb: number('uiKb'),
    systemTotalKb: number('systemTotalKb'),
    systemAvailableKb: number('systemAvailableKb'),
  };
}

/**
 * Normalize a path returned by the native Save dialog.
 * Relative paths and non-JSON targets are rejected before any file operation.
 */
export function normalizeDiagnosticsExportPath(selectedPath: unknown, pathApi: DiagnosticsPathApi): string {
  if (typeof selectedPath !== 'string' || !selectedPath || selectedPath.includes('\0') || selectedPath.length > 32767) {
    throw new Error('Choose a valid JSON file path for diagnostics export.');
  }
  if (!pathApi.isAbsolute(selectedPath)) {
    throw new Error('Choose an absolute JSON file path for diagnostics export.');
  }
  const normalized = pathApi.resolve(selectedPath);
  const base = pathApi.basename(normalized);
  if (!base || base === '.' || base === '..' || pathApi.extname(normalized).toLowerCase() !== '.json') {
    throw new Error('Diagnostics must be exported to a .json file.');
  }
  return normalized;
}

/** Write through an exclusive sibling temp file, then rename into place. */
export function writeDiagnosticsJsonAtomically(
  selectedPath: unknown,
  data: unknown,
  dependencies: DiagnosticsExportDependencies,
): void {
  const targetPath = normalizeDiagnosticsExportPath(selectedPath, dependencies.path);
  const serialized = JSON.stringify(data, null, 2);
  if (typeof serialized !== 'string') throw new Error('Diagnostics could not be serialized.');

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
      // Preserve the original write/rename error; temp cleanup is best effort.
    }
  }
}

/** IPC-facing commands return sanitized errors and never expose local paths. */
export function createDiagnosticsController(dependencies: DiagnosticsControllerDependencies) {
  return {
    async getDiagnostics() {
      try {
        return { ok: true, data: await dependencies.collectDiagnostics({ probeProviders: false }) };
      } catch (error) {
        return { ok: false, error: diagnosticError(error, 'Could not collect diagnostics.') || 'Could not collect diagnostics.' };
      }
    },
    async checkProviderCompatibility() {
      try {
        const data = await dependencies.collectDiagnostics({ probeProviders: true }) as { providers?: unknown };
        return { ok: true, providers: Array.isArray(data?.providers) ? data.providers : [] };
      } catch (error) {
        return { ok: false, error: diagnosticError(error, 'Could not check providers.') || 'Could not check providers.' };
      }
    },
    async exportDiagnostics() {
      try {
        const diagnostics = await dependencies.collectDiagnostics({ probeProviders: true });
        const result = await dependencies.showSaveDialog({
          title: 'Export Mad Station diagnostics',
          defaultPath: dependencies.defaultFileName(),
          filters: [{ name: 'Diagnostics JSON', extensions: ['json'] }],
        });
        if (result.canceled || !result.filePath) return { ok: false, canceled: true };
        dependencies.writeDiagnosticsFile(result.filePath, diagnostics);
        // Do not return the local path to the renderer; it may contain the Windows username.
        return { ok: true };
      } catch (error) {
        return { ok: false, error: diagnosticError(error, 'Could not export diagnostics.') || 'Could not export diagnostics.' };
      }
    },
  };
}

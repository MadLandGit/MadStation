/** Typed IPC registration for diagnostics commands. The supplied registrar
 * must be the existing secure Electron main-process `handle` wrapper.
 */
import type { SecureIpcHandle } from './settings-ipc.js';

export interface DiagnosticsCommands {
  getDiagnostics(): unknown;
  checkProviderCompatibility(): unknown;
  exportDiagnostics(): unknown;
}

export function registerDiagnosticsIpcHandlers(handle: SecureIpcHandle, commands: DiagnosticsCommands): void {
  handle('get-diagnostics', () => commands.getDiagnostics());
  handle('check-provider-compatibility', () => commands.checkProviderCompatibility());
  handle('export-diagnostics', () => commands.exportDiagnostics());
}

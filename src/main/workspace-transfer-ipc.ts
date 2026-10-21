/** Typed registration boundary for account import/export and workspace backup/restore. */
import type { SecureIpcHandle } from './settings-ipc.js';

export interface WorkspaceTransferCommands {
  exportAccounts(): unknown;
  importAccounts(): unknown;
  backupConfig(): unknown;
  restoreConfig(): unknown;
}

export function registerWorkspaceTransferIpcHandlers(
  handle: SecureIpcHandle,
  commands: WorkspaceTransferCommands,
): void {
  handle('export-accounts', () => commands.exportAccounts());
  handle('import-accounts', () => commands.importAccounts());
  handle('backup-config', () => commands.backupConfig());
  handle('restore-config', () => commands.restoreConfig());
}

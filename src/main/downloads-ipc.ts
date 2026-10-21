/** Typed IPC registration for download commands.
 *
 * The supplied `handle` function must be the Electron main process's existing
 * trusted-sender, lock-state, and payload-validation wrapper.
 */
import type { SecureIpcHandle } from './settings-ipc.js';

export interface DownloadsCommands {
  chooseFolder(): unknown;
  getDownloads(): unknown;
  performAction(action: unknown, id: unknown): unknown;
}

export function registerDownloadsIpcHandlers(handle: SecureIpcHandle, controller: DownloadsCommands): void {
  handle('choose-download-folder', () => controller.chooseFolder());
  handle('get-downloads', () => controller.getDownloads());
  handle('download-action', (_event, action, id) => controller.performAction(action, id));
}

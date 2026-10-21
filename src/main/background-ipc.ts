/** Typed registration boundary for custom background image IPC. */
import type { SecureIpcHandle } from './settings-ipc.js';

export interface BackgroundCommands {
  chooseBackgroundFile(): unknown;
  removeBackground(id: unknown): unknown;
}

export function registerBackgroundIpcHandlers(handle: SecureIpcHandle, commands: BackgroundCommands): void {
  handle('choose-background-file', () => commands.chooseBackgroundFile());
  handle('remove-background', (_event, id) => commands.removeBackground(id));
}

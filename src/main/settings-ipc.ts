/** Typed IPC registration for settings commands.
 *
 * Electron authorization stays in the main-process `handle` wrapper. Keeping
 * registration here makes the channel-to-controller mapping explicit without
 * duplicating sender checks or changing the renderer-facing contract.
 */

export type IpcHandler = (event: unknown, ...args: unknown[]) => unknown;
export type SecureIpcHandle = (
  channel: string,
  handler: IpcHandler,
  options?: { toolbar?: boolean },
) => void;

export interface SettingsCommands {
  setAppSettings(patch: unknown): unknown;
  resetSettings(): unknown;
  setSecuritySettings(patch: unknown): unknown;
  setDownloadSettings(patch: unknown): unknown;
}

export function registerSettingsIpcHandlers(handle: SecureIpcHandle, controller: SettingsCommands): void {
  handle('set-app-settings', (_event, patch) => controller.setAppSettings(patch));
  handle('reset-settings', () => controller.resetSettings());
  handle('set-security-settings', (_event, patch) => controller.setSecuritySettings(patch));
  handle('set-download-settings', (_event, patch) => controller.setDownloadSettings(patch));
}

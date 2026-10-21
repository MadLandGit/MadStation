/** Typed IPC registration for Video Hub commands.
 *
 * The supplied registrar is Electron main's existing secure `handle` wrapper.
 * This module intentionally owns only the channel-to-command mapping: browser
 * views, account partitions, persistence, and authorization stay in their
 * existing owners while the boundary is migrated incrementally.
 */
import type { SecureIpcHandle } from './settings-ipc.js';

export interface VideoHubCommands {
  getState(): unknown;
  getNetworkMode(): unknown;
  setNetworkMode(mode: unknown): unknown;
  addProvider(payload: unknown): unknown;
  deleteProvider(id: unknown): unknown;
  addAccount(payload: unknown): unknown;
  renameAccount(id: unknown, name: unknown): unknown;
  deleteAccount(id: unknown): unknown;
  resetLogin(id: unknown): unknown;
  setActiveAccount(id: unknown): unknown;
  setLayout(payload: unknown): unknown;
  setSettingsOverlay(open: unknown): unknown;
  setNotificationOverlay(open: unknown): unknown;
  navigate(action: unknown): unknown;
  openInBrowser(): unknown;
  suspendBrowsers(): unknown;
}

export function registerVideoHubIpcHandlers(handle: SecureIpcHandle, commands: VideoHubCommands): void {
  handle('video-hub-get-state', () => commands.getState());
  handle('video-hub-get-network-mode', () => commands.getNetworkMode());
  handle('video-hub-set-network-mode', (_event, mode) => commands.setNetworkMode(mode));
  handle('video-hub-add-provider', (_event, payload) => commands.addProvider(payload || {}));
  handle('video-hub-delete-provider', (_event, id) => commands.deleteProvider(id));
  handle('video-hub-add-account', (_event, payload) => commands.addAccount(payload || {}));
  handle('video-hub-rename-account', (_event, id, name) => commands.renameAccount(id, name));
  handle('video-hub-delete-account', (_event, id) => commands.deleteAccount(id));
  handle('video-hub-reset-login', (_event, id) => commands.resetLogin(id));
  handle('video-hub-set-active-account', (_event, id) => commands.setActiveAccount(id));
  handle('video-hub-set-layout', (_event, payload) => commands.setLayout(payload || {}));
  handle('video-hub-settings-overlay', (_event, open) => commands.setSettingsOverlay(open));
  handle('video-hub-notification-overlay', (_event, open) => commands.setNotificationOverlay(open));
  handle('video-hub-navigate', (_event, action) => commands.navigate(action));
  handle('video-hub-open-in-browser', () => commands.openInBrowser());
  handle('video-hub-suspend-browsers', () => commands.suspendBrowsers());
}

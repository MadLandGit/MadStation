/** Typed IPC registration for AI Hub provider/account operations.
 *
 * This module owns channel names and argument forwarding only. The supplied
 * registrar remains responsible for trusted-sender, lock-state and payload
 * checks. Main-process command implementations retain persistence timing,
 * broadcasts, and browser/session lifecycle side effects.
 */
import type { SecureIpcHandle } from './settings-ipc.js';

export interface AiHubCommands {
  addService(payload: unknown): unknown;
  updateService(id: unknown, payload: unknown): unknown;
  deleteService(id: unknown): unknown;
  addAccount(payload: unknown): unknown;
  updateAccount(id: unknown, payload: unknown): unknown;
  renameAccount(id: unknown, name: unknown): unknown;
  setAccountShortcut(id: unknown, shortcut: unknown): unknown;
  deleteAccount(id: unknown): unknown;
  reorderServices(ids: unknown): unknown;
  reorderAccounts(ids: unknown): unknown;
  resetAccount(id: unknown): unknown;
  clearAccountCache(id: unknown): unknown;
  clearAccountSiteData(id: unknown): unknown;
}

export function registerAiHubIpcHandlers(handle: SecureIpcHandle, commands: AiHubCommands): void {
  handle('add-service', (_event, payload) => commands.addService(payload));
  handle('update-service', (_event, id, payload) => commands.updateService(id, payload));
  handle('delete-service', (_event, id) => commands.deleteService(id));
  handle('add-account', (_event, payload) => commands.addAccount(payload));
  handle('update-account', (_event, id, payload) => commands.updateAccount(id, payload));
  handle('rename-account', (_event, id, name) => commands.renameAccount(id, name));
  handle('set-account-shortcut', (_event, id, shortcut) => commands.setAccountShortcut(id, shortcut));
  handle('delete-account', (_event, id) => commands.deleteAccount(id));
  handle('reorder-services', (_event, ids) => commands.reorderServices(ids));
  handle('reorder-accounts', (_event, ids) => commands.reorderAccounts(ids));
  handle('reset-account', (_event, id) => commands.resetAccount(id));
  handle('clear-account-cache', (_event, id) => commands.clearAccountCache(id));
  handle('clear-account-site-data', (_event, id) => commands.clearAccountSiteData(id));
}

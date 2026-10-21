/** App-lock IPC registration through the existing secure main-process handle wrapper. */

export type LockIpcHandler = (event: unknown, ...args: unknown[]) => unknown;
export type SecureLockIpcHandle = (channel: string, handler: LockIpcHandler, options?: { toolbar?: boolean }) => void;

export interface LockCommands {
  setAppPassword(payload: unknown): unknown;
  removeAppPassword(payload: unknown): unknown;
  lockNow(workspace?: unknown): unknown;
  unlock(password: unknown): unknown;
  resetAppLock(): unknown;
}

export function registerLockIpcHandlers(handle: SecureLockIpcHandle, commands: LockCommands): void {
  handle('set-app-password', (_event, payload) => commands.setAppPassword(payload));
  handle('remove-app-password', (_event, payload) => commands.removeAppPassword(payload));
  handle('lock-now', (_event, workspace) => commands.lockNow(workspace));
  handle('unlock', (_event, password) => commands.unlock(password));
  handle('reset-app-lock', () => commands.resetAppLock());
}

/** App-lock command controller. Electron lifecycle and view side effects are injected by main.js. */

export interface LockCommandResult {
  ok: boolean;
  error?: string;
  workspace?: string;
}

export interface LockControllerDependencies {
  normalizePassword(value: unknown): string;
  hasPassword(): boolean;
  checkPassword(password: unknown): Promise<{ ok: boolean; error?: string }>;
  createLock(password: string): Promise<unknown>;
  setLock(value: unknown): void;
  clearLock(): void;
  broadcastConfig(): unknown;
  lockApp(workspace?: unknown): unknown;
  getWorkspaceApp(): string;
  isLocked(): boolean;
  unlockApp(): void;
  wipeAllSessions(): Promise<unknown>;
}

function readPayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null ? value as Record<string, unknown> : {};
}

export function createLockController(dependencies: LockControllerDependencies) {
  async function setAppPassword(payload: unknown): Promise<LockCommandResult> {
    const values = readPayload(payload);
    const next = dependencies.normalizePassword(values.next);
    if (next.length < 8) return { ok: false, error: 'Use at least 8 characters.' };
    if (next.length > 256) return { ok: false, error: 'Password is too long (max 256 characters).' };

    if (dependencies.hasPassword()) {
      const check = await dependencies.checkPassword(values.current);
      if (!check.ok) return check;
    }

    const lock = await dependencies.createLock(next);
    dependencies.setLock(lock);
    dependencies.broadcastConfig();
    return { ok: true };
  }

  async function removeAppPassword(payload: unknown): Promise<LockCommandResult> {
    if (!dependencies.hasPassword()) return { ok: true };
    const values = readPayload(payload);
    const check = await dependencies.checkPassword(values.current);
    if (!check.ok) return check;
    dependencies.clearLock();
    dependencies.broadcastConfig();
    return { ok: true };
  }

  function lockNow(workspace?: unknown): LockCommandResult {
    if (!dependencies.hasPassword()) return { ok: false, error: 'Set an app lock password first.' };
    dependencies.lockApp(workspace);
    return { ok: true, workspace: dependencies.getWorkspaceApp() };
  }

  async function unlock(password: unknown): Promise<LockCommandResult> {
    if (!dependencies.isLocked()) return { ok: true };
    const check = await dependencies.checkPassword(password);
    if (!check.ok) return check;
    dependencies.unlockApp();
    return { ok: true };
  }

  async function resetAppLock(): Promise<LockCommandResult> {
    // Clearing an app lock is only allowed after every persisted account session is wiped.
    await dependencies.wipeAllSessions();
    dependencies.clearLock();
    dependencies.unlockApp();
    dependencies.broadcastConfig();
    return { ok: true };
  }

  return { setAppPassword, removeAppPassword, lockNow, unlock, resetAppLock };
}

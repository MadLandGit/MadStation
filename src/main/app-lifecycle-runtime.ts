/** Testable runtime wiring for idle/system-lock watchers. Electron objects are injected. */

export interface LockWatcherSecurity {
  lockOnIdle: boolean;
  idleMinutes: number;
  lockOnSystemLock: boolean;
}

export type PowerLifecycleEvent = 'lock-screen' | 'suspend';

export interface LockWatcherDependencies {
  scheduleRepeating(callback: () => void, intervalMs: number): unknown;
  onPowerEvent(event: PowerLifecycleEvent, callback: () => void): void;
  isLocked(): boolean;
  hasPassword(): boolean;
  getSecurity(): LockWatcherSecurity;
  getSystemIdleTimeSeconds(): number;
  lockApp(): unknown;
}

export function startLockWatchersRuntime(dependencies: LockWatcherDependencies): void {
  dependencies.scheduleRepeating(() => {
    if (dependencies.isLocked() || !dependencies.hasPassword()) return;
    const current = dependencies.getSecurity();
    if (current.lockOnIdle && dependencies.getSystemIdleTimeSeconds() >= current.idleMinutes * 60) {
      dependencies.lockApp();
    }
  }, 15000);

  const onSystemLock = (): void => {
    if (dependencies.getSecurity().lockOnSystemLock) dependencies.lockApp();
  };
  dependencies.onPowerEvent('lock-screen', onSystemLock);
  dependencies.onPowerEvent('suspend', onSystemLock);
}

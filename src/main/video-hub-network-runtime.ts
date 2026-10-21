/** Video Hub network preference, proxy application and rollback orchestration.
 * Electron Session and persistent-file access are supplied by the main composition root.
 */
export type VideoHubNetworkMode = 'direct' | 'system';
type AccountRecord = Record<string, unknown>;
type SessionLike = {
  setProxy(options: { mode: 'direct' | 'system' }): Promise<void>;
  closeAllConnections?: () => Promise<void>;
};

export interface VideoHubNetworkRuntimeDependencies<TAccount extends AccountRecord, TSession extends SessionLike> {
  readSettings(): unknown;
  writeSettings(mode: VideoHubNetworkMode): void;
  getAccounts(): TAccount[];
  getRuntimeAccount(account: TAccount): AccountRecord;
  getSession(account: AccountRecord): TSession;
  waitForSessionReady(session: TSession): Promise<unknown> | undefined;
  getMode(): VideoHubNetworkMode | null;
  setMode(mode: VideoHubNetworkMode): void;
  reloadActivePage(): void;
}

export function createVideoHubNetworkRuntime<TAccount extends AccountRecord, TSession extends SessionLike>(dependencies: VideoHubNetworkRuntimeDependencies<TAccount, TSession>) {
  let cachedMode: VideoHubNetworkMode | null = null;

  function getMode(): VideoHubNetworkMode {
    const current = dependencies.getMode();
    if (current === 'direct' || current === 'system') return current;
    if (cachedMode) return cachedMode;
    try {
      const stored = dependencies.readSettings() as { mode?: unknown } | null;
      cachedMode = stored?.mode === 'system' ? 'system' : 'direct';
    } catch { cachedMode = 'direct'; }
    dependencies.setMode(cachedMode);
    return cachedMode;
  }

  async function applyProxyToSession(session: TSession, mode: VideoHubNetworkMode = getMode(), { closeConnections = false }: { closeConnections?: boolean } = {}) {
    await session.setProxy({ mode: mode === 'system' ? 'system' : 'direct' });
    if (closeConnections && typeof session.closeAllConnections === 'function') await session.closeAllConnections();
  }

  async function setMode(mode: unknown) {
    const nextMode: VideoHubNetworkMode | null = mode === 'system' ? 'system' : mode === 'direct' ? 'direct' : null;
    if (!nextMode) return { ok: false as const, error: 'Choose normal network or system proxy.' };
    const previousMode = getMode();
    const sessions: TSession[] = [];
    try {
      for (const account of dependencies.getAccounts()) {
        const session = dependencies.getSession(dependencies.getRuntimeAccount(account));
        if (!sessions.includes(session)) sessions.push(session);
      }
      // Publish before waiting so sessions created concurrently inherit the intended route.
      cachedMode = nextMode;
      dependencies.setMode(nextMode);
      for (const session of sessions) {
        const ready = dependencies.waitForSessionReady(session);
        if (ready) await ready;
        await applyProxyToSession(session, nextMode, { closeConnections: true });
      }
      dependencies.writeSettings(nextMode);
      dependencies.reloadActivePage();
      return { ok: true as const, mode: nextMode, changed: previousMode !== nextMode };
    } catch (error) {
      cachedMode = previousMode;
      dependencies.setMode(previousMode);
      for (const account of dependencies.getAccounts()) {
        try {
          const session = dependencies.getSession(dependencies.getRuntimeAccount(account));
          const ready = dependencies.waitForSessionReady(session);
          if (ready) await ready;
          await applyProxyToSession(session, previousMode, { closeConnections: true });
        } catch { /* preserve original failure; rollback is best-effort */ }
      }
      try { dependencies.writeSettings(previousMode); } catch { /* preserve original failure */ }
      const detail = error instanceof Error ? error.message : 'proxy configuration failed';
      return { ok: false as const, error: `Could not apply network mode: ${detail || 'proxy configuration failed'}` };
    }
  }

  return { getMode, applyProxyToSession, setMode };
}

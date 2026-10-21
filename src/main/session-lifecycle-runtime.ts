/**
 * Session partition ownership and best-effort storage cleanup for account-scoped
 * Chromium workspaces. Electron's session object is supplied by the host so
 * this module can be tested without starting Electron or opening real profiles.
 */

export interface SessionPartitionAccount {
  id: string;
}

export interface SessionDataStore {
  clearStorageData(options?: { storages?: string[] }): Promise<unknown>;
  clearCache(): Promise<unknown>;
  clearCodeCaches?(options?: Record<string, unknown>): Promise<unknown>;
  setSpellCheckerEnabled?(enabled: boolean): void;
  setProxy?(config: { mode: string }): Promise<unknown>;
  closeAllConnections?(): Promise<unknown>;
}

export interface VideoHubSessionReadiness {
  ok: boolean;
  error?: unknown;
}

export interface SessionLifecycleDependencies<
  TAccount extends SessionPartitionAccount,
  TSession extends SessionDataStore,
> {
  fromPartition(partition: string, options: { cache: boolean }): TSession;
  cacheEnabled(): boolean;
  configureSession(session: TSession, account: TAccount): void;
  getVideoHubNetworkMode(): string;
  applyVideoHubProxy(session: TSession, mode: string): Promise<unknown>;
  onVideoHubProxyFailure?(account: TAccount, error: unknown): void;
}

export type SessionDataClearMode = 'all' | 'application-cache';

/**
 * Clear session storage using the historical app semantics. Full sign-out clears
 * storage before cache. Cache-only cleanup clears cache/code cache before selected
 * application caches and service workers; failure of optional code-cache cleanup
 * is deliberately ignored, while storage/cache failures remain visible to callers.
 */
export async function clearSessionDataRuntime<TSession extends SessionDataStore>(
  session: TSession,
  mode: SessionDataClearMode,
): Promise<void> {
  if (mode === 'all') {
    await session.clearStorageData();
    await session.clearCache();
    return;
  }

  await session.clearCache();
  try { await session.clearCodeCaches?.({}); } catch { /* optional Chromium cache */ }
  await session.clearStorageData({ storages: ['cachestorage', 'serviceworkers', 'shadercache'] });
}

export function createSessionLifecycleRuntime<
  TAccount extends SessionPartitionAccount,
  TSession extends SessionDataStore,
>(dependencies: SessionLifecycleDependencies<TAccount, TSession>) {
  const accountPartitions = new WeakSet<object>();
  const arenaPartitions = new WeakSet<object>();
  const videoHubPartitions = new WeakSet<object>();
  const imageHubPartitions = new WeakSet<object>();
  const videoHubReadiness = new WeakMap<object, Promise<VideoHubSessionReadiness>>();

  const sessionForPartition = (partition: string): TSession => dependencies.fromPartition(partition, { cache: dependencies.cacheEnabled() });

  const ensureConfigured = (session: TSession, account: TAccount, configured: WeakSet<object>): void => {
    if (configured.has(session as object)) return;
    // Mark only after configuration succeeds. A failed configuration may be retried.
    dependencies.configureSession(session, account);
    configured.add(session as object);
  };

  const getAccountSession = (account: TAccount): TSession => {
    const session = sessionForPartition(`persist:aihub-${account.id}`);
    ensureConfigured(session, account, accountPartitions);
    return session;
  };

  const getArenaSession = (account: TAccount): TSession => {
    const session = sessionForPartition(`persist:arena-${account.id}`);
    ensureConfigured(session, account, arenaPartitions);
    return session;
  };

  const getImageHubSession = (account: TAccount): TSession => {
    const session = sessionForPartition(`persist:image-hub-${account.id}`);
    ensureConfigured(session, account, imageHubPartitions);
    return session;
  };

  const getVideoHubSession = (account: TAccount): TSession => {
    const session = sessionForPartition(`persist:video-hub-${account.id}`);
    if (videoHubPartitions.has(session as object)) return session;

    ensureConfigured(session, account, videoHubPartitions);
    // Always store a fulfilled readiness promise so callers can await setup without
    // creating an unhandled rejection when cleanup creates the session first.
    const readiness = Promise.resolve()
      .then(() => dependencies.applyVideoHubProxy(session, dependencies.getVideoHubNetworkMode()))
      .then((): VideoHubSessionReadiness => ({ ok: true }))
      .catch((error): VideoHubSessionReadiness => {
        try { dependencies.onVideoHubProxyFailure?.(account, error); } catch { /* diagnostics must not break readiness */ }
        return { ok: false, error };
      });
    videoHubReadiness.set(session as object, readiness);
    return session;
  };

  const getVideoHubReadiness = (session: TSession): Promise<VideoHubSessionReadiness> | undefined =>
    videoHubReadiness.get(session as object);

  const sessionPartition = {
    aiHub: (account: SessionPartitionAccount) => `persist:aihub-${account.id}`,
    arena: (account: SessionPartitionAccount) => `persist:arena-${account.id}`,
    videoHub: (account: SessionPartitionAccount) => `persist:video-hub-${account.id}`,
    imageHub: (account: SessionPartitionAccount) => `persist:image-hub-${account.id}`,
  };

  return {
    sessionPartition,
    sessionForPartition,
    getAccountSession,
    getArenaSession,
    getImageHubSession,
    getVideoHubSession,
    getVideoHubReadiness,
  };
}

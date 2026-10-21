/** Aggregate-only memory and support diagnostics for the Electron host.
 * All Electron/process access and mutable workspace state are injected by main.js.
 */
import { summarizeMemoryForDiagnostics } from './diagnostics-controller.js';

type MetricMemory = { workingSetSize?: unknown };
type ProcessMetric = { pid?: unknown; type?: unknown; serviceName?: unknown; name?: unknown; memory?: MetricMemory };
type WebContentsLike = { isDestroyed(): boolean; getOSProcessId(): number };
type BrowserViewLike = { webContents: WebContentsLike };
type ViewMap = Map<string, BrowserViewLike>;
type ConfigForDiagnostics = {
  services: Array<Record<string, any>>;
  accounts: Array<Record<string, any>>;
  recentAccountIds?: string[];
};
type PublicAddress = { address: string; family: number };
type HeadRequestLike = {
  on(event: string, listener: (value: any) => void): unknown;
  setTimeout(milliseconds: number, callback: () => void): unknown;
  abort(): unknown;
  end(): unknown;
};

type WorkspaceKind = 'ai-hub' | 'arena' | 'forge' | 'control' | 'toolbar';

export interface MemoryDiagnosticsDependencies {
  getAppMetrics(): ProcessMetric[];
  processId: number;
  getSystemMemoryInfo(): { total?: unknown; available?: unknown; free?: unknown };
  views: { aiHub: ViewMap; arena: ViewMap; forge: ViewMap };
  getControlWebContents(): WebContentsLike | null;
  getToolbarWebContents(): WebContentsLike | null;
  getAccount(id: string): { name?: string } | null;
  getWorkspaceApp(): string;
  isLocked(): boolean;
  getActiveId(): string | null;
  getConfig(): ConfigForDiagnostics;
  getArenaBrowserModels(): { left?: unknown; right?: unknown };
  getForgeBrowserAccountId(): string | null;
  getAccountRuntime(id: string): { lastError?: string };
  normalizeHttpsUrl(value: unknown): string | null;
  diagnosticError(value: unknown): string;
  getSecurity(): { remoteIcons?: boolean; clearCacheOnExit?: boolean; signOutOnExit?: boolean; blockHttp?: boolean };
  getLocalIconCacheStats(): { bytes?: number; entries?: number };
  getRemoteIconCacheStats(): { totalBytes?: number; entries?: Map<unknown, unknown> | { size?: number } };
  getDownloadState(): { active?: number; items?: unknown[] };
  getRuntimeInfo(): { version: string; electron: string; chromium: string; node: string; platform: string; arch: string; osRelease: string };
  resolvePublicHost(hostname: string): Promise<PublicAddress[]>;
  createHeadRequest(url: string, addresses: readonly PublicAddress[]): HeadRequestLike;
  now(): number;
  nowIso(): string;
}

export function createMemoryDiagnosticsRuntime(dependencies: MemoryDiagnosticsDependencies) {
  function getMemorySnapshot() {
    const metrics: ProcessMetric[] = [];
    try { metrics.push(...(dependencies.getAppMetrics?.() || [])); } catch { /* older Electron/runtime */ }
    const byPid = new Map<number, { pid: number; type: string; serviceName: string; name: string; workingSetKb: number }>();
    const addMetric = (metric: ProcessMetric) => {
      const pid = Number(metric?.pid);
      if (!pid || byPid.has(pid)) return;
      const memory = metric?.memory || {};
      const workingSetKb = Number(memory.workingSetSize);
      if (!Number.isFinite(workingSetKb) || workingSetKb < 0) return;
      byPid.set(pid, { pid, type: String(metric.type || 'Other'), serviceName: String(metric.serviceName || ''), name: String(metric.name || ''), workingSetKb });
    };
    metrics.forEach(addMetric);

    const pidOf = (wc: WebContentsLike | null | undefined) => { try { return wc && !wc.isDestroyed() ? Number(wc.getOSProcessId()) : 0; } catch { return 0; } };
    const labels = new Map<number, { kind: WorkspaceKind; id: string }>();
    const addLabels = (map: ViewMap, kind: WorkspaceKind) => {
      for (const [id, view] of map) {
        const pid = pidOf(view.webContents);
        if (pid) labels.set(pid, { kind, id });
      }
    };
    addLabels(dependencies.views.aiHub, 'ai-hub');
    addLabels(dependencies.views.arena, 'arena');
    addLabels(dependencies.views.forge, 'forge');
    const controlPid = pidOf(dependencies.getControlWebContents());
    const toolbarPid = pidOf(dependencies.getToolbarWebContents());
    if (controlPid) labels.set(controlPid, { kind: 'control', id: 'control' });
    if (toolbarPid) labels.set(toolbarPid, { kind: 'toolbar', id: 'toolbar' });

    const values = [...byPid.values()];
    const sum = (predicate: (item: (typeof values)[number]) => boolean) => values.filter(predicate).reduce((total, item) => total + item.workingSetKb, 0);
    const totalKb = values.reduce((total, item) => total + item.workingSetKb, 0);
    const sumWorkspace = (kind: WorkspaceKind) => [...labels.entries()].filter(([, label]) => label.kind === kind).reduce((total, [pid]) => total + (byPid.get(pid)?.workingSetKb || 0), 0);
    const aiHubKb = sumWorkspace('ai-hub');
    const arenaKb = sumWorkspace('arena');
    const forgeKb = sumWorkspace('forge');
    const uiKb = [...new Set([controlPid, toolbarPid].filter(Boolean))].reduce((total, pid) => total + (byPid.get(pid)?.workingSetKb || 0), 0);
    const isGpu = (item: (typeof values)[number]) => /gpu/i.test(item.type) || /gpu/i.test(item.name) || /gpu/i.test(item.serviceName);
    const gpuKb = sum(isGpu);
    const pageKb = sum((item) => /tab|renderer/i.test(item.type));
    const mainKb = byPid.get(dependencies.processId)?.workingSetKb || 0;
    let system: { total?: unknown; available?: unknown; free?: unknown } = {};
    try { system = dependencies.getSystemMemoryInfo() || {}; } catch { /* ignore */ }
    const systemTotalKb = Number(system.total) || 0;
    const systemAvailableKb = Number(system.available ?? system.free) || 0;
    const mapProcess = (item: (typeof values)[number]) => {
      const label = labels.get(item.pid);
      const rawName = item.serviceName || item.name || item.type;
      let displayName = rawName;
      if (label?.kind === 'arena') displayName = `Arena · ${label.id}`;
      else if (label?.kind === 'forge') displayName = `Forge · ${dependencies.getAccount(label.id)?.name || label.id}`;
      else if (label?.kind === 'ai-hub') displayName = `AI Hub · ${dependencies.getAccount(label.id)?.name || label.id}`;
      else if (label?.kind === 'control') displayName = 'Mad Station UI';
      else if (label?.kind === 'toolbar') displayName = 'Toolbar';
      else if (/video.?capture|capture.?service/i.test(rawName) || /video.?capture|capture.?service/i.test(item.type)) displayName = 'Video Capture Service';
      else if (isGpu(item)) displayName = 'GPU process';
      return { pid: item.pid, type: item.type, name: displayName, workingSetKb: item.workingSetKb };
    };
    const processes = values.slice().sort((a, b) => b.workingSetKb - a.workingSetKb).map(mapProcess);
    const top = processes.slice(0, 8);
    const config = dependencies.getConfig();
    const activeId = dependencies.getActiveId();
    const workspaceApp = dependencies.getWorkspaceApp();
    const locked = dependencies.isLocked();
    const arenaModels = dependencies.getArenaBrowserModels();
    return {
      ok: true,
      timestamp: dependencies.now(),
      totalKb,
      systemTotalKb,
      systemAvailableKb,
      mainKb,
      pageKb,
      rendererKb: pageKb,
      gpuKb,
      uiKb,
      aiHubKb,
      arenaKb,
      forgeKb,
      liveAiHubSessions: dependencies.views.aiHub.size,
      aiHubSessionsExpected: workspaceApp === 'ai-hub' && !locked && activeId ? 1 : 0,
      aiHubSavedSessions: config.accounts.length,
      liveArenaSessions: dependencies.views.arena.size,
      arenaSavedSelections: ['left', 'right'].filter((side) => Boolean(arenaModels[side as 'left' | 'right'])).length,
      liveForgeSessions: dependencies.views.forge.size,
      forgeBrowserAccountId: dependencies.getForgeBrowserAccountId(),
      top,
      processes,
    };
  }

  function collectSessionDiagnostics() {
    const activeId = dependencies.getActiveId();
    const activeAccount = activeId ? dependencies.getAccount(activeId) : null;
    const workspaceApp = dependencies.getWorkspaceApp();
    const locked = dependencies.isLocked();
    const config = dependencies.getConfig();
    const arenaModels = dependencies.getArenaBrowserModels();
    const forgeBrowserAccountId = dependencies.getForgeBrowserAccountId();
    return {
      workspace: workspaceApp,
      locked: Boolean(locked),
      activeAccountPresent: Boolean(activeAccount),
      savedAiHubAccounts: config.accounts.length,
      liveAiHubViews: dependencies.views.aiHub.size,
      expectedAiHubViews: workspaceApp === 'ai-hub' && !locked && activeId ? 1 : 0,
      liveArenaViews: dependencies.views.arena.size,
      expectedArenaViews: workspaceApp === 'ai-lab' && !locked ? Math.min(2, ['left', 'right'].filter((side) => Boolean(arenaModels[side as 'left' | 'right'])).length) : 0,
      liveForgeViews: dependencies.views.forge.size,
      expectedForgeViews: workspaceApp === 'instruction-forge' && !locked && forgeBrowserAccountId ? 1 : 0,
      browserPolicy: 'AI Hub views exist only while AI Hub is active; Arena views only while its browser panel is active; Forge keeps a bounded per-account browser set only while Instruction Forge is active.',
    };
  }

  async function probeProvider(service: Record<string, any>) {
    const started = dependencies.now();
    const result: { configuredUrlValid: boolean; reachable: boolean; statusCode: number | null; latencyMs: number | null; error: string } = {
      configuredUrlValid: false, reachable: false, statusCode: null, latencyMs: null, error: '',
    };
    const url = dependencies.normalizeHttpsUrl(service?.url || '');
    if (!url) { result.error = 'Invalid HTTPS provider URL.'; return result; }
    result.configuredUrlValid = true;
    let addresses: PublicAddress[];
    try { addresses = await dependencies.resolvePublicHost(new URL(url).hostname); }
    catch {
      result.error = 'Provider diagnostics only checks public internet hosts; private, local, or reserved network addresses are blocked.';
      result.latencyMs = dependencies.now() - started;
      return result;
    }
    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = (patch: Partial<typeof result> = {}) => { if (settled) return; settled = true; Object.assign(result, patch); resolve(); };
      try {
        const request = dependencies.createHeadRequest(url, addresses);
        request.on('response', (response: { statusCode?: number }) => {
          const statusCode = Number(response.statusCode) || 0;
          finish(statusCode >= 300 && statusCode < 400
            ? { reachable: false, statusCode, error: 'Provider diagnostics redirects are blocked.', latencyMs: dependencies.now() - started }
            : { reachable: statusCode >= 200 && statusCode < 400, statusCode, latencyMs: dependencies.now() - started });
        });
        request.on('redirect', () => {
          try { request.abort(); } catch { /* ignore */ }
          finish({ error: 'Provider diagnostics redirects are blocked.', latencyMs: dependencies.now() - started });
        });
        request.on('error', (error: { message?: string }) => finish({ error: dependencies.diagnosticError(error?.message || 'Provider could not be reached.'), latencyMs: dependencies.now() - started }));
        request.setTimeout(10_000, () => { try { request.abort(); } catch { /* ignore */ } finish({ error: 'Provider did not respond within 10 seconds.', latencyMs: dependencies.now() - started }); });
        request.end();
      } catch (error) { finish({ error: dependencies.diagnosticError(error instanceof Error ? error.message : 'Provider check failed.'), latencyMs: dependencies.now() - started }); }
    });
    return result;
  }

  async function collectDiagnostics({ probeProviders = false }: { probeProviders?: boolean } = {}) {
    const memory = getMemorySnapshot();
    const config = dependencies.getConfig();
    const providers: Array<Record<string, unknown>> = [];
    for (const service of config.services) {
      const accountErrors = config.accounts.filter((account) => account.serviceId === service.id).map((account) => dependencies.diagnosticError(dependencies.getAccountRuntime(String(account.id)).lastError)).filter(Boolean);
      const base = {
        providerIndex: providers.length + 1,
        host: (() => { try { return new URL(String(service.url)).hostname; } catch { return ''; } })(),
        accountCount: config.accounts.filter((account) => account.serviceId === service.id).length,
        accountErrorCount: accountErrors.length,
        accountErrors: accountErrors.slice(0, 3),
        authDomainCount: Array.isArray(service.authDomains) ? service.authDomains.length : 0,
      };
      if (probeProviders) providers.push({ ...base, ...(await probeProvider(service)) });
      else providers.push({ ...base, configuredUrlValid: Boolean(dependencies.normalizeHttpsUrl(service.url)) });
    }
    const info = dependencies.getRuntimeInfo();
    const security = dependencies.getSecurity();
    const localIcon = dependencies.getLocalIconCacheStats();
    const remoteIcon = dependencies.getRemoteIconCacheStats();
    const downloadState = dependencies.getDownloadState();
    const activeId = dependencies.getActiveId();
    return {
      format: 'mad-station-diagnostics', version: 1, generatedAt: dependencies.nowIso(),
      app: { name: 'Mad Station', version: info.version, electron: info.electron, chromium: info.chromium, node: info.node, platform: info.platform, arch: info.arch, osRelease: info.osRelease },
      workspace: collectSessionDiagnostics(),
      memory: summarizeMemoryForDiagnostics(memory),
      processCount: Array.isArray(memory.processes) ? memory.processes.length : 0,
      processes: (Array.isArray(memory.processes) ? memory.processes : []).map((item: any) => ({ pid: item.pid, type: item.type, name: item.name, workingSetKb: item.workingSetKb })),
      config: {
        providerCount: config.services.length, accountCount: config.accounts.length,
        recentCount: Array.isArray(config.recentAccountIds) ? config.recentAccountIds.length : 0,
        activeAccountPresent: Boolean(activeId && dependencies.getAccount(activeId)),
        security: { remoteIcons: Boolean(security.remoteIcons), clearCacheOnExit: Boolean(security.clearCacheOnExit), signOutOnExit: Boolean(security.signOutOnExit), blockHttp: Boolean(security.blockHttp) },
      },
      providers,
      caches: { localIconMemoryBytes: Number(localIcon.bytes) || 0, localIconEntries: Number(localIcon.entries) || 0, remoteIconMemoryBytes: Number(remoteIcon.totalBytes) || 0, remoteIconEntries: Number((remoteIcon.entries as any)?.size) || 0 },
      downloads: { active: Number(downloadState.active) || 0, totalListed: Array.isArray(downloadState.items) ? downloadState.items.length : 0 },
      privacy: { includesClipboardContents: false, includesApiKeys: false, includesCookies: false, includesBrowserStorage: false },
    };
  }

  return { getMemorySnapshot, collectSessionDiagnostics, probeProvider, collectDiagnostics };
}

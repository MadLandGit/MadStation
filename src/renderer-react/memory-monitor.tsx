import { createRoot } from 'react-dom/client';
import type { CSSProperties } from 'react';

export type MemoryMonitorScope = 'ailab' | 'sidebar' | 'clipboard' | 'home' | 'forge';

export interface MemoryMonitorProcessRow {
  name: string;
  ram: string;
}

export interface MemoryMonitorViewModel {
  totalLabel: string;
  compactTotalLabel: string;
  systemLabel: string;
  percentLabel: string;
  appPercent: number;
  mainLabel: string;
  browserLabel: string;
  arenaLabel: string;
  gpuLabel: string;
  clipboardLabel: string;
  summaryLabel: string;
  sessionsLabel: string;
  processCountLabel: string;
  processPreviewLabel: string;
  processRows: MemoryMonitorProcessRow[];
  systemCpuPercent: number | null;
  systemCpuLabel: string;
  home: {
    otherLabel: string;
    mainShare: number;
    browserShare: number;
    gpuShare: number;
    otherShare: number;
    level: 'low' | 'mid' | 'high';
    sparkLine: string;
    sparkArea: string;
  };
}

export type MemoryMonitorAction = 'refresh' | 'cleanup' | 'details';

export interface MemoryMonitorBridge {
  attachReactRenderer(renderer: (model: MemoryMonitorViewModel) => void): void;
  requestAction(action: MemoryMonitorAction): void;
}

declare global {
  interface Window {
    MadStationMemoryMonitor?: MemoryMonitorBridge;
  }
}

const SCOPES: ReadonlyArray<{ mountId: string; scope: MemoryMonitorScope }> = [
  { mountId: 'aiLabRamMonitorMount', scope: 'ailab' },
  { mountId: 'aiHubRamMonitorMount', scope: 'sidebar' },
  { mountId: 'videoHubRamMonitorMount', scope: 'sidebar' },
  { mountId: 'imageHubRamMonitorMount', scope: 'sidebar' },
  { mountId: 'clipboardRamMonitorMount', scope: 'clipboard' },
  { mountId: 'launcherRamMonitorMount', scope: 'home' },
  { mountId: 'forgeRamMonitorMount', scope: 'forge' },
];

function request(action: MemoryMonitorAction): void {
  window.MadStationMemoryMonitor?.requestAction(action);
}

function MonitorActions() {
  return (
    <span className="resource-monitor-actions">
      <button className="resource-monitor-tool" type="button" title="Reclaim unused memory" aria-label="Reclaim unused memory" onClick={() => request('cleanup')}>♻</button>
      <button className="resource-monitor-tool" type="button" title="Refresh RAM monitor" aria-label="Refresh RAM monitor" onClick={() => request('refresh')}>↻</button>
    </span>
  );
}

function CompactMonitor({ scope, model }: { scope: MemoryMonitorScope; model: MemoryMonitorViewModel }) {
  return (
    <section className={`resource-monitor resource-monitor--compact-page resource-monitor--${scope}`} data-memory-monitor data-memory-scope={scope} aria-label="RAM usage">
      <div className="compact-ram-ring" style={{ '--ram-progress': `${Math.max(0, Math.min(100, model.appPercent)) * 3.6}deg` } as CSSProperties} aria-hidden="true">
        <div className="compact-ram-ring-inner"><strong>{model.percentLabel}</strong><span>RAM</span></div>
      </div>
      <strong className="compact-ram-total">{model.compactTotalLabel}</strong>
    </section>
  );
}

function HomeMonitor({ model }: { model: MemoryMonitorViewModel }) {
  return (
    <section className="home-tele" data-memory-monitor data-memory-scope="home" data-level={model.home.level} aria-label="Mad Station RAM monitor">
      <header className="home-tele-head">
        <span className="home-tele-title"><i className="home-tele-dot" aria-hidden="true" />RAM monitor</span>
        <span className="home-tele-actions">
          <button className="home-tele-btn" type="button" title="Reclaim unused memory" aria-label="Reclaim unused memory" onClick={() => request('cleanup')}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 3c4.5 3 6.5 6 6.5 9.2A6.5 6.5 0 0 1 12 19a6.5 6.5 0 0 1-6.5-6.8C5.5 9 7.5 6 12 3z"/><path d="M12 19v-7M12 15l3-3"/></svg></button>
          <button className="home-tele-btn" type="button" title="Refresh RAM monitor" aria-label="Refresh RAM monitor" onClick={() => request('refresh')}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v5h-5"/></svg></button>
        </span>
      </header>
      <div className="home-tele-main">
        <div className="home-tele-ring" style={{ '--ram-progress': `${Math.max(0, Math.min(100, model.appPercent)) * 3.6}deg` } as CSSProperties} aria-hidden="true"><div className="home-tele-ring-inner"><strong>{model.percentLabel}</strong><span>of RAM</span></div></div>
        <div className="home-tele-readout"><span className="home-tele-label">App memory</span><strong className="home-tele-total">{model.totalLabel}</strong><span className="home-tele-sub">{model.summaryLabel}</span></div>
      </div>
      <div className="home-tele-cpu" data-level={model.systemCpuPercent === null ? 'unknown' : model.systemCpuPercent >= 80 ? 'high' : model.systemCpuPercent >= 50 ? 'mid' : 'low'}>
        <div className="home-tele-cpu-head"><span>Processor</span><strong>{model.systemCpuLabel}</strong></div>
        <div className="home-tele-cpu-meter" role="meter" aria-label="System CPU utilization" aria-valuemin={0} aria-valuemax={100} aria-valuenow={model.systemCpuPercent ?? undefined} aria-valuetext={model.systemCpuLabel}><i style={{ width: `${model.systemCpuPercent ?? 0}%` }}/></div>
        <div className="home-tele-cpu-foot"><span>System CPU · all logical cores</span><span>{model.systemCpuPercent === null ? 'Sampling…' : 'Live'}</span></div>
      </div>
      <div className="home-tele-spark" aria-hidden="true"><small>Last 2 min</small><svg viewBox="0 0 120 40" preserveAspectRatio="none"><path className="home-spark-area" d={model.home.sparkArea}/><path className="home-spark-line" d={model.home.sparkLine}/></svg></div>
      <div className="home-tele-bar" aria-hidden="true"><i data-memory-bar="main" style={{ flexGrow: model.home.mainShare }}/><i data-memory-bar="browser" style={{ flexGrow: model.home.browserShare }}/><i data-memory-bar="gpu" style={{ flexGrow: model.home.gpuShare }}/><i data-memory-bar="other" style={{ flexGrow: model.home.otherShare }}/></div>
      <ul className="home-tele-legend" aria-label="RAM breakdown">
        <li data-seg="main"><span>Main process</span><strong>{model.mainLabel}</strong></li>
        <li data-seg="browser"><span>AI browsers</span><strong>{model.browserLabel}</strong></li>
        <li data-seg="gpu"><span>GPU</span><strong>{model.gpuLabel}</strong></li>
        <li data-seg="other"><span>UI &amp; other</span><strong>{model.home.otherLabel}</strong></li>
      </ul>
      <p className="home-tele-note">Arena browsers use <b>{model.arenaLabel}</b> · clip buffer ≈ <b>{model.clipboardLabel}</b></p>
      <div className="home-tele-foot"><span>{model.sessionsLabel}</span><button className="home-tele-more" type="button" onClick={() => request('details')}>Processes <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button></div>
    </section>
  );
}

function DetailedMonitor({ scope, model }: { scope: MemoryMonitorScope; model: MemoryMonitorViewModel }) {
  const scopeLabel = scope === 'ailab' ? 'AI Playground' : scope === 'forge' ? 'Prompt Studio' : scope === 'clipboard' ? 'Notes & Tasks' : 'Main';
  return (
    <section className={`resource-monitor resource-monitor--${scope}`} data-memory-monitor data-memory-scope={scope} aria-label="Mad Station RAM monitor">
      <div className="resource-monitor-head"><div className="resource-monitor-title"><span className="resource-monitor-dot" aria-hidden="true"/><strong>RAM</strong><span className="resource-monitor-context">{scopeLabel}</span></div><MonitorActions/></div>
      <div className="resource-monitor-hero">
        <div className="resource-monitor-ring" style={{ '--ram-progress': `${Math.max(0, Math.min(100, model.appPercent)) * 3.6}deg` } as CSSProperties} aria-hidden="true"><div className="resource-monitor-ring-inner"><strong>{model.percentLabel}</strong><span>RAM</span></div></div>
        <div className="resource-monitor-readout"><span className="resource-monitor-readout-label">Working set</span><strong>{model.totalLabel}</strong><span className="resource-monitor-system">{model.systemLabel}</span><div className="resource-monitor-glow-line" aria-hidden="true"><span style={{ width: `${Math.max(0, Math.min(100, model.appPercent))}%` }}/></div></div>
      </div>
      <div className="resource-monitor-stats" aria-label="RAM breakdown"><span><b>Main</b><strong>{model.mainLabel}</strong></span><span><b>Browsers</b><strong>{model.browserLabel}</strong></span><span><b>Arena</b><strong>{model.arenaLabel}</strong></span><span><b>GPU</b><strong>{model.gpuLabel}</strong></span><span><b>Clip</b><strong>{model.clipboardLabel}</strong></span></div>
      <div className="resource-monitor-meta"><span>{model.sessionsLabel}</span><span>{model.summaryLabel}</span></div>
      <details className="resource-monitor-details"><summary><span>Processes</span><span>{model.processCountLabel}</span></summary><div className="resource-monitor-process-actions"><span>{model.processPreviewLabel}</span><button className="resource-monitor-details-btn" type="button" onClick={() => request('details')}>View details</button></div><div className="resource-monitor-processes">{model.processRows.length ? model.processRows.map((process, index) => <div className="resource-monitor-process-row" key={`${process.name}-${index}`}><span>{process.name}</span><strong>{process.ram}</strong></div>) : <div className="resource-monitor-process-empty">Process metrics unavailable.</div>}</div></details>
    </section>
  );
}

function MemoryMonitor({ scope, model }: { scope: MemoryMonitorScope; model: MemoryMonitorViewModel }) {
  if (scope === 'home') return <HomeMonitor model={model}/>;
  if (scope === 'ailab' || scope === 'sidebar' || scope === 'clipboard' || scope === 'forge') return <CompactMonitor scope={scope} model={model}/>;
  return <DetailedMonitor scope={scope} model={model}/>;
}

function mountMemoryMonitors(): void {
  const bridge = window.MadStationMemoryMonitor;
  if (!bridge) return;
  const roots = new Map<string, { scope: MemoryMonitorScope; host: HTMLElement; root: ReturnType<typeof createRoot> }>();
  let latestModel: MemoryMonitorViewModel | null = null;

  function syncRoots(): void {
    // Home's launcherRamMonitorMount is created inside a React-owned widget after
    // this entry may have started. Reconcile mounts after every widget rebuild.
    const liveHosts = new Map(SCOPES.map(({ mountId }) => [mountId, document.getElementById(mountId)]));
    for (const [mountId, entry] of roots) {
      if (liveHosts.get(mountId) !== entry.host) {
        entry.root.unmount();
        roots.delete(mountId);
      }
    }
    for (const { mountId, scope } of SCOPES) {
      const host = liveHosts.get(mountId);
      if (!(host instanceof HTMLElement) || roots.has(mountId)) continue;
      const root = createRoot(host);
      roots.set(mountId, { scope, host, root });
      if (latestModel) root.render(<MemoryMonitor scope={scope} model={latestModel}/>);
    }
  }

  bridge.attachReactRenderer((model) => {
    latestModel = model;
    syncRoots();
    roots.forEach(({ scope, root }) => root.render(<MemoryMonitor scope={scope} model={model}/>));
  });
  document.addEventListener('mad:home-widgets-built', syncRoots);
  // Also cover programmatic Home widget toggles if a caller forgets to emit the
  // normal build event; the observer is tightly scoped to the widget subtree.
  const homeWidgets = document.getElementById('homeWidgets');
  if (homeWidgets && typeof MutationObserver === 'function') {
    const observer = new MutationObserver(syncRoots);
    observer.observe(homeWidgets, { childList: true, subtree: true });
  }
  syncRoots();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountMemoryMonitors, { once: true });
else mountMemoryMonitors();

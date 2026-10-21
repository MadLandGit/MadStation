import { createRoot, type Root } from 'react-dom/client';
import { useEffect, useState, type ReactElement } from 'react';

type PlaygroundSettingsSnapshot = {
  defaultTab: 'model-arena' | 'arena-accounts' | 'scoreboard';
  defaultArena: 'free-account' | 'api' | 'local';
  autoScanLocal: boolean;
  rememberArenaAccounts: boolean;
};
type PlaygroundSettingsAction =
  | { type: 'close' }
  | ({ type: 'save' } & PlaygroundSettingsSnapshot);

const DEFAULT_SNAPSHOT: PlaygroundSettingsSnapshot = {
  defaultTab: 'model-arena',
  defaultArena: 'free-account',
  autoScanLocal: true,
  rememberArenaAccounts: true,
};

function dispatch(action: PlaygroundSettingsAction): void {
  window.dispatchEvent(new CustomEvent<PlaygroundSettingsAction>('madstation:ai-playground-settings-action', { detail: action }));
}

function isSnapshot(value: unknown): value is PlaygroundSettingsSnapshot {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PlaygroundSettingsSnapshot>;
  return ['model-arena', 'arena-accounts', 'scoreboard'].includes(String(candidate.defaultTab))
    && ['free-account', 'api', 'local'].includes(String(candidate.defaultArena))
    && typeof candidate.autoScanLocal === 'boolean'
    && typeof candidate.rememberArenaAccounts === 'boolean';
}

function PlaygroundSettings({ snapshot }: { snapshot: PlaygroundSettingsSnapshot }): ReactElement {
  const [draft, setDraft] = useState<PlaygroundSettingsSnapshot>(snapshot);
  useEffect(() => setDraft(snapshot), [snapshot.defaultTab, snapshot.defaultArena, snapshot.autoScanLocal, snapshot.rememberArenaAccounts]);

  return <section className="ms-card ms-card--flat clipboard-settings-card" role="dialog" aria-modal="true" aria-labelledby="aiPlaygroundSettingsTitle">
    <div className="clipboard-settings-heading">
      <div className="clipboard-settings-icon ms-brand-tile" aria-hidden="true">⚙</div>
      <div><div className="modal-title" id="aiPlaygroundSettingsTitle">AI Playground settings</div><div className="modal-subtitle">Set the starting Arena view and local-model behavior for AI Playground.</div></div>
      <button aria-label="Back" className="close ms-icon-btn" type="button" title="Back" onClick={() => dispatch({ type: 'close' })}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg></button>
    </div>
    <div className="clipboard-settings-section">
      <div className="clipboard-settings-section-title ms-eyebrow">Playground defaults</div>
      <div className="clipboard-settings-section-subtitle ms-muted">These preferences are stored with AI Playground and do not change AI Hub.</div>
      <label className="clipboard-setting-label">Default Playground tab<select className="ms-input" value={draft.defaultTab} onChange={(event) => setDraft((current) => ({ ...current, defaultTab: event.currentTarget.value as PlaygroundSettingsSnapshot['defaultTab'] }))}>
        <option value="model-arena">Model Arena</option><option value="arena-accounts">Arena Accounts</option><option value="scoreboard">Leaderboard</option>
      </select></label>
      <label className="clipboard-setting-label">Default Arena mode<select className="ms-input" value={draft.defaultArena} onChange={(event) => setDraft((current) => ({ ...current, defaultArena: event.currentTarget.value as PlaygroundSettingsSnapshot['defaultArena'] }))}>
        <option value="free-account">Free Account Arena</option><option value="api">API Arena</option><option value="local">Local AI Arena</option>
      </select></label>
      <label className="toggle-row"><input type="checkbox" checked={draft.autoScanLocal} onChange={(event) => setDraft((current) => ({ ...current, autoScanLocal: event.currentTarget.checked }))} /><span><strong>Scan local models when opened</strong><small>Refresh local-model discovery whenever Local AI Arena is selected.</small></span></label>
      <label className="toggle-row"><input type="checkbox" checked={draft.rememberArenaAccounts} onChange={(event) => setDraft((current) => ({ ...current, rememberArenaAccounts: event.currentTarget.checked }))} /><span><strong>Remember Arena account pair</strong><small>Restore the last left/right Free Account Arena accounts next time AI Lab opens.</small></span></label>
    </div>
    <div className="clipboard-settings-actions"><button className="ms-btn" type="button" onClick={() => dispatch({ type: 'close' })}>Cancel</button><button className="ms-btn ms-btn--primary" type="button" onClick={() => dispatch({ type: 'save', ...draft })}>Save settings</button></div>
  </section>;
}

function mountPlaygroundSettings(): void {
  const host = document.getElementById('aiLabSettingsReactMount');
  if (!(host instanceof HTMLElement)) return;
  const root: Root = createRoot(host);
  let snapshot = DEFAULT_SNAPSHOT;
  window.addEventListener('madstation:ai-playground-settings-state', (event: Event) => {
    const candidate = (event as CustomEvent<unknown>).detail;
    if (!isSnapshot(candidate)) return;
    snapshot = candidate;
    root.render(<PlaygroundSettings snapshot={snapshot} />);
  });
  root.render(<PlaygroundSettings snapshot={snapshot} />);
  window.dispatchEvent(new Event('madstation:ai-playground-settings-mounted'));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountPlaygroundSettings, { once: true });
else mountPlaygroundSettings();

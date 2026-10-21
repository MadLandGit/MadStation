import { createRoot, type Root } from 'react-dom/client';
import { useEffect, useState, type ReactElement } from 'react';

type ForgeSettingsModel = { id: string; label: string };
type ForgeSettingsSnapshot = {
  models: ForgeSettingsModel[];
  defaultModel: string;
  clearOutput: boolean;
  autoCopyOutput: boolean;
  keepInput: boolean;
};
type ForgeSettingsAction =
  | { type: 'close' }
  | { type: 'save'; defaultModel: string; clearOutput: boolean; autoCopyOutput: boolean; keepInput: boolean };

const EMPTY_SNAPSHOT: ForgeSettingsSnapshot = {
  models: [], defaultModel: '', clearOutput: true, autoCopyOutput: false, keepInput: true,
};
function dispatch(action: ForgeSettingsAction): void {
  window.dispatchEvent(new CustomEvent<ForgeSettingsAction>('madstation:instruction-forge-settings-action', { detail: action }));
}

function ForgeSettings({ snapshot }: { snapshot: ForgeSettingsSnapshot }): ReactElement {
  const [draft, setDraft] = useState<ForgeSettingsSnapshot>(snapshot);
  useEffect(() => {
    setDraft(snapshot);
  }, [snapshot.models, snapshot.defaultModel, snapshot.clearOutput, snapshot.autoCopyOutput, snapshot.keepInput]);

  return <section className="ms-card ms-card--flat clipboard-settings-card" aria-labelledby="instructionForgeSettingsTitle">
    <div className="clipboard-settings-heading">
      <div className="clipboard-settings-icon ms-brand-tile" aria-hidden="true">⚙</div>
      <div><div className="modal-title" id="instructionForgeSettingsTitle">Prompt Studio settings</div><div className="modal-subtitle">Choose the default AI and output behavior for Prompt Studio.</div></div>
      <button aria-label="Back" className="close ms-icon-btn" type="button" title="Back" onClick={() => dispatch({ type: 'close' })}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg></button>
    </div>
    <div className="clipboard-settings-section">
      <div className="clipboard-settings-section-title ms-eyebrow">Prompt defaults</div>
      <div className="clipboard-settings-section-subtitle ms-muted">These preferences only affect Prompt Studio.</div>
      <label className="clipboard-setting-label">Default AI<select className="ms-input" value={draft.defaultModel} onChange={(event) => setDraft((current) => ({ ...current, defaultModel: event.currentTarget.value }))}>
        {draft.models.length ? draft.models.map((model) => <option value={model.id} key={model.id}>{model.label}</option>) : <option value="">No models available</option>}
      </select></label>
      <label className="toggle-row"><input type="checkbox" checked={draft.clearOutput} onChange={(event) => setDraft((current) => ({ ...current, clearOutput: event.currentTarget.checked }))} /><span><strong>Clear previous result when generating</strong><small>Remove the old instruction as soon as a new Forge run starts.</small></span></label>
      <label className="toggle-row"><input type="checkbox" checked={draft.autoCopyOutput} onChange={(event) => setDraft((current) => ({ ...current, autoCopyOutput: event.currentTarget.checked }))} /><span><strong>Copy generated prompt automatically</strong><small>Put a successful generated prompt on the system clipboard.</small></span></label>
      <label className="toggle-row"><input type="checkbox" checked={draft.keepInput} onChange={(event) => setDraft((current) => ({ ...current, keepInput: event.currentTarget.checked }))} /><span><strong>Keep input after generating</strong><small>Leave your original explanation in the input box after a successful generation.</small></span></label>
    </div>
    <div className="clipboard-settings-actions"><button className="ms-btn" type="button" onClick={() => dispatch({ type: 'close' })}>Cancel</button><button className="ms-btn ms-btn--primary" type="button" onClick={() => dispatch({ type: 'save', defaultModel: draft.defaultModel, clearOutput: draft.clearOutput, autoCopyOutput: draft.autoCopyOutput, keepInput: draft.keepInput })}>Save settings</button></div>
  </section>;
}

function mountForgeSettings(): void {
  const host = document.getElementById('instructionSettingsReactMount');
  if (!(host instanceof HTMLElement)) return;
  const root: Root = createRoot(host);
  let snapshot = EMPTY_SNAPSHOT;
  window.addEventListener('madstation:instruction-forge-settings-state', (event: Event) => {
    const candidate = (event as CustomEvent<ForgeSettingsSnapshot>).detail;
    if (!candidate || !Array.isArray(candidate.models) || typeof candidate.defaultModel !== 'string') return;
    if (typeof candidate.clearOutput !== 'boolean' || typeof candidate.autoCopyOutput !== 'boolean' || typeof candidate.keepInput !== 'boolean') return;
    snapshot = candidate;
    root.render(<ForgeSettings snapshot={snapshot} />);
  });
  root.render(<ForgeSettings snapshot={snapshot} />);
  window.dispatchEvent(new Event('madstation:instruction-forge-settings-mounted'));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountForgeSettings, { once: true });
else mountForgeSettings();

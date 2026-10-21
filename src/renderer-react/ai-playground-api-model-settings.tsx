import { createRoot, type Root } from 'react-dom/client';
import { useEffect, useState, type FormEvent, type ReactElement } from 'react';

type ApiModelSettingsModel = {
  id: string;
  name: string;
  provider: string;
  endpoint: string;
  model: string;
  apiKeyRequired: boolean;
  apiKeyConfigured: boolean;
  apiKeyNeedsRebind: boolean;
};
type ApiModelSettingsSnapshot = {
  models: ApiModelSettingsModel[];
  selectedId: string;
};
type ApiModelSettingsDraft = {
  name: string;
  endpoint: string;
  model: string;
  apiKey: string;
};
type ApiModelSettingsAction =
  | { type: 'select-model'; id: string }
  | { type: 'save-model'; id: string; name: string; endpoint: string; model: string; apiKey: string }
  | { type: 'clear-key'; id: string };

const EMPTY_SNAPSHOT: ApiModelSettingsSnapshot = { models: [], selectedId: '' };
const EMPTY_DRAFT: ApiModelSettingsDraft = { name: '', endpoint: '', model: '', apiKey: '' };

function dispatch(action: ApiModelSettingsAction): void {
  window.dispatchEvent(new CustomEvent<ApiModelSettingsAction>('madstation:api-model-settings-action', { detail: action }));
}

function ApiModelSettings({ snapshot }: { snapshot: ApiModelSettingsSnapshot }): ReactElement {
  const selected = snapshot.models.find((model) => model.id === snapshot.selectedId) || null;
  const [draft, setDraft] = useState<ApiModelSettingsDraft>(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    setDraft({
      name: selected?.name || '',
      endpoint: selected?.endpoint || '',
      model: selected?.model || '',
      apiKey: '',
    });
    setNotice('');
  }, [selected?.id, selected?.name, selected?.endpoint, selected?.model]);

  useEffect(() => {
    const onBusy = (event: Event) => {
      const detail = (event as CustomEvent<{ busy?: unknown; message?: unknown }>).detail;
      setBusy(detail?.busy === true);
      if (typeof detail?.message === 'string') setNotice(detail.message);
    };
    window.addEventListener('madstation:api-model-settings-busy', onBusy);
    return () => window.removeEventListener('madstation:api-model-settings-busy', onBusy);
  }, []);

  function update<K extends keyof ApiModelSettingsDraft>(field: K, value: ApiModelSettingsDraft[K]): void {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!selected || busy) return;
    if (!draft.name.trim() || !draft.endpoint.trim() || !draft.model.trim()) {
      setNotice('Model name, endpoint, and model are required.');
      return;
    }
    if (!/^https?:\/\//i.test(draft.endpoint.trim())) {
      setNotice('Endpoint must use http(s).');
      return;
    }
    dispatch({
      type: 'save-model', id: selected.id,
      name: draft.name, endpoint: draft.endpoint, model: draft.model, apiKey: draft.apiKey,
    });
  }

  if (!snapshot.models.length) {
    return <div className="api-model-settings-workflow">
      <div className="ms-empty" role="status">No API models configured. Add a supported API model to enable comparison.</div>
    </div>;
  }

  return <div className="api-model-settings-workflow">
    <form className="api-model-settings-form" onSubmit={submit}>
      <div className="form-grid api-model-grid">
        <label>API model<select className="ms-input" aria-label="API model settings model" value={selected?.id || ''} onChange={(event) => dispatch({ type: 'select-model', id: event.currentTarget.value })}>
          {snapshot.models.map((model) => <option value={model.id} key={model.id}>{model.name || model.model || 'Model'}</option>)}
        </select></label>
        <label>Provider<input aria-label="API provider" value={selected?.provider || ''} readOnly /></label>
        <label>Display name<input aria-label="API model display name" maxLength={120} value={draft.name} onChange={(event) => update('name', event.currentTarget.value)} /></label>
        <label>Model ID<input aria-label="API model ID" maxLength={240} value={draft.model} onChange={(event) => update('model', event.currentTarget.value)} /></label>
        <label className="span-2">Endpoint<input aria-label="API endpoint" maxLength={2048} placeholder="https://api.example.com/v1" type="url" value={draft.endpoint} onChange={(event) => update('endpoint', event.currentTarget.value)} /></label>
        <label className="span-2">API key<input aria-label="API key" autoComplete="new-password" maxLength={8192} placeholder="Enter a new key to store securely" type="password" value={draft.apiKey} onChange={(event) => update('apiKey', event.currentTarget.value)} /><span className="field-hint" role="status">{selected?.apiKeyConfigured ? 'Key stored securely on this device.' : selected?.apiKeyNeedsRebind ? 'Re-enter the API key to bind it to this endpoint.' : selected?.apiKeyRequired ? 'API key required.' : 'No key required.'}</span></label>
      </div>
      <div className="form-actions">
        <button className="ms-btn" type="button" disabled={busy || !selected?.apiKeyConfigured} onClick={() => selected && dispatch({ type: 'clear-key', id: selected.id })}>Clear stored key</button>
        <span className="actions-spacer" />
        <button className="ms-btn ms-btn--primary" type="submit" disabled={busy || !selected || !draft.name.trim() || !draft.endpoint.trim() || !draft.model.trim()}>{busy ? 'Saving…' : 'Save API model'}</button>
      </div>
      {notice ? <div className="field-hint api-model-settings-notice" role="status" aria-live="polite">{notice}</div> : null}
    </form>
  </div>;
}

function mountApiModelSettings(): void {
  const host = document.getElementById('apiModelSettingsBody');
  if (!(host instanceof HTMLElement)) return;
  const root: Root = createRoot(host);
  let snapshot = EMPTY_SNAPSHOT;
  root.render(<ApiModelSettings snapshot={snapshot} />);
  window.addEventListener('madstation:api-model-settings-state', (event: Event) => {
    const candidate = (event as CustomEvent<ApiModelSettingsSnapshot>).detail;
    if (!candidate || !Array.isArray(candidate.models) || typeof candidate.selectedId !== 'string') return;
    snapshot = candidate;
    root.render(<ApiModelSettings snapshot={snapshot} />);
  });
  window.dispatchEvent(new Event('madstation:api-model-settings-mounted'));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountApiModelSettings, { once: true });
else mountApiModelSettings();

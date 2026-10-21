import { createRoot, type Root } from 'react-dom/client';
import { useEffect, useState, type KeyboardEvent, type ReactElement } from 'react';

type ArenaSetupProvider = { id: string; label: string };
type ArenaSetupSnapshot = {
  providers: ArenaSetupProvider[];
  selectedProviderId: string;
  accountResetVersion: number;
  providerResetVersion: number;
};
type ArenaSetupAction =
  | { type: 'select-provider'; providerId: string }
  | { type: 'add-account'; providerId: string; name: string }
  | { type: 'add-provider'; name: string; url: string };

const EMPTY_SNAPSHOT: ArenaSetupSnapshot = {
  providers: [],
  selectedProviderId: '',
  accountResetVersion: 0,
  providerResetVersion: 0,
};

function dispatch(action: ArenaSetupAction): void {
  window.dispatchEvent(new CustomEvent<ArenaSetupAction>('madstation:arena-setup-action', { detail: action }));
}

function isSnapshot(value: unknown): value is ArenaSetupSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<ArenaSetupSnapshot>;
  return Array.isArray(candidate.providers)
    && candidate.providers.every((provider) => Boolean(provider)
      && typeof provider.id === 'string' && provider.id.length <= 128
      && typeof provider.label === 'string' && provider.label.length <= 120)
    && typeof candidate.selectedProviderId === 'string' && candidate.selectedProviderId.length <= 128
    && Number.isSafeInteger(candidate.accountResetVersion) && Number(candidate.accountResetVersion) >= 0
    && Number.isSafeInteger(candidate.providerResetVersion) && Number(candidate.providerResetVersion) >= 0;
}

function ArenaSetupForm({ snapshot }: { snapshot: ArenaSetupSnapshot }): ReactElement {
  const [providerId, setProviderId] = useState(snapshot.selectedProviderId);
  const [accountName, setAccountName] = useState('');
  const [providerName, setProviderName] = useState('');
  const [providerUrl, setProviderUrl] = useState('');
  const providers = snapshot.providers;

  useEffect(() => setProviderId(snapshot.selectedProviderId), [snapshot.selectedProviderId, providers.length]);
  useEffect(() => setAccountName(''), [snapshot.accountResetVersion]);
  useEffect(() => {
    setProviderName('');
    setProviderUrl('');
  }, [snapshot.providerResetVersion]);

  const addAccount = (): void => dispatch({ type: 'add-account', providerId, name: accountName });
  const onAccountNameKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addAccount();
    }
  };

  return <section className="lab-card arena-acc-add" aria-label="Add Arena account or provider">
    <div className="arena-acc-form">
      <label><span className="field-label">Provider</span><select className="ms-input" value={providerId} onChange={(event) => {
        const next = event.currentTarget.value;
        setProviderId(next);
        dispatch({ type: 'select-provider', providerId: next });
      }}>
        {providers.length ? providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.label}</option>) : <option value="">No providers</option>}
      </select></label>
      <label><span className="field-label">Account name (optional)</span><input className="ms-input" value={accountName} type="text" maxLength={60} placeholder="e.g. Personal, Work, Free #2" onChange={(event) => setAccountName(event.currentTarget.value)} onKeyDown={onAccountNameKeyDown} /></label>
      <button className="ms-btn ms-btn--primary" type="button" onClick={addAccount}>Add account</button>
    </div>
    <details className="arena-prov-add"><summary>Add a provider that isn't listed</summary>
      <div className="arena-acc-form">
        <label><span className="field-label">Provider name</span><input className="ms-input" type="text" maxLength={60} value={providerName} placeholder="e.g. HuggingChat" onChange={(event) => setProviderName(event.currentTarget.value)} /></label>
        <label><span className="field-label">Website (https)</span><input className="ms-input" type="text" maxLength={300} value={providerUrl} placeholder="https://huggingface.co/chat/" onChange={(event) => setProviderUrl(event.currentTarget.value)} onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            dispatch({ type: 'add-provider', name: providerName, url: providerUrl });
          }
        }} /></label>
        <button className="ms-btn" type="button" onClick={() => dispatch({ type: 'add-provider', name: providerName, url: providerUrl })}>Add provider</button>
      </div>
    </details>
  </section>;
}

function mountArenaSetup(): void {
  const host = document.getElementById('arenaSetupReactMount');
  if (!(host instanceof HTMLElement)) return;
  const root: Root = createRoot(host);
  let snapshot = EMPTY_SNAPSHOT;
  window.addEventListener('madstation:arena-setup-state', (event: Event) => {
    const candidate = (event as CustomEvent<unknown>).detail;
    if (!isSnapshot(candidate)) return;
    snapshot = candidate;
    root.render(<ArenaSetupForm snapshot={snapshot} />);
  });
  root.render(<ArenaSetupForm snapshot={snapshot} />);
  window.dispatchEvent(new Event('madstation:arena-setup-mounted'));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountArenaSetup, { once: true });
else mountArenaSetup();

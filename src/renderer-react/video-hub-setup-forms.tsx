import { createRoot, type Root } from 'react-dom/client';
import { useEffect, useState } from 'react';

export interface VideoHubAddAccountProvider {
  id: string;
  name: string;
}

export interface VideoHubAddAccountModel {
  providers: VideoHubAddAccountProvider[];
  selectedProviderId: string;
}

export interface VideoHubAddAccountBridge {
  attachReactRenderers(accountRenderer: (model: VideoHubAddAccountModel) => void, siteRenderer: () => void): void;
}

declare global {
  interface Window {
    MadStationVideoHubAddAccount?: VideoHubAddAccountBridge;
  }
}

function VideoHubAddAccountForm({ model }: { model: VideoHubAddAccountModel }) {
  const firstProviderId = model.providers[0]?.id || '';
  const [providerId, setProviderId] = useState(model.selectedProviderId || firstProviderId);
  const [name, setName] = useState('');

  useEffect(() => {
    setProviderId((current) => model.providers.some((provider) => provider.id === current)
      ? current
      : (model.providers.some((provider) => provider.id === model.selectedProviderId)
        ? model.selectedProviderId
        : firstProviderId));
  }, [model.providers, model.selectedProviderId, firstProviderId]);

  useEffect(() => {
    const onSelectProvider = (event: Event) => {
      const detail = (event as CustomEvent<{ providerId?: unknown }>).detail;
      if (typeof detail?.providerId === 'string') setProviderId(detail.providerId);
    };
    const onAdded = () => setName('');
    window.addEventListener('madstation:video-hub-add-account-select-provider', onSelectProvider);
    window.addEventListener('madstation:video-hub-add-account-success', onAdded);
    return () => {
      window.removeEventListener('madstation:video-hub-add-account-select-provider', onSelectProvider);
      window.removeEventListener('madstation:video-hub-add-account-success', onAdded);
    };
  }, []);

  const hasProvider = model.providers.some((provider) => provider.id === providerId);
  return (
    <>
      <label className="video-hub-field-label" htmlFor="videoHubNewProvider">Video site</label>
      <select
        className="ms-input"
        id="videoHubNewProvider"
        value={hasProvider ? providerId : ''}
        onChange={(event) => setProviderId(event.currentTarget.value)}
        aria-label="Video site"
      >
        {!model.providers.length ? <option value="">No video sites available</option> : null}
        {model.providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
      </select>
      <label className="video-hub-field-label" htmlFor="videoHubNewName">Account label <span className="ms-muted">(optional)</span></label>
      <input
        className="ms-input"
        id="videoHubNewName"
        maxLength={60}
        placeholder="e.g. Personal account"
        autoComplete="off"
        value={name}
        onChange={(event) => setName(event.currentTarget.value)}
      />
      <button
        className="ms-btn ms-btn--primary video-hub-add-btn"
        id="videoHubAddAccountBtn"
        type="button"
        disabled={!hasProvider}
        onClick={() => window.dispatchEvent(new CustomEvent('madstation:video-hub-add-account-action', {
          detail: { providerId, name: name.trim() },
        }))}
      >
        + Add account
      </button>
    </>
  );
}

function VideoHubAddSiteForm() {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [icon, setIcon] = useState('');

  useEffect(() => {
    const onAdded = () => { setName(''); setUrl(''); setIcon(''); };
    window.addEventListener('madstation:video-hub-add-site-success', onAdded);
    return () => window.removeEventListener('madstation:video-hub-add-site-success', onAdded);
  }, []);

  return (
    <form
      id="videoHubAddProviderForm"
      className="video-hub-provider-form"
      onSubmit={(event) => {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent('madstation:video-hub-add-provider-action', {
          detail: { name: name.trim(), url: url.trim(), icon: icon.trim() },
        }));
      }}
    >
      <label className="video-hub-field-label" htmlFor="videoHubNewProviderName">Site name</label>
      <input className="ms-input" id="videoHubNewProviderName" maxLength={60} placeholder="Video service name" required value={name} onChange={(event) => setName(event.currentTarget.value)} />
      <label className="video-hub-field-label" htmlFor="videoHubNewProviderUrl">Website URL</label>
      <input className="ms-input" id="videoHubNewProviderUrl" type="url" maxLength={2048} placeholder="https://example.com" required value={url} onChange={(event) => setUrl(event.currentTarget.value)} />
      <label className="video-hub-field-label" htmlFor="videoHubNewProviderIcon">Company icon URL <span className="ms-muted">(optional)</span></label>
      <input className="ms-input" id="videoHubNewProviderIcon" type="url" maxLength={2048} placeholder="https://example.com/logo.png" value={icon} onChange={(event) => setIcon(event.currentTarget.value)} />
      <span className="ms-muted">Leave blank to fetch the site favicon automatically. You can supply a direct HTTPS logo or image URL.</span>
      <button className="ms-btn" type="submit">Add video site</button>
    </form>
  );
}

function mountVideoHubAddAccount() {
  const accountHost = document.getElementById('videoHubAddAccountReactMount');
  const siteHost = document.getElementById('videoHubAddSiteReactMount');
  const bridge = window.MadStationVideoHubAddAccount;
  if (!(accountHost instanceof HTMLElement) || !(siteHost instanceof HTMLElement) || !bridge) return;
  const accountRoot: Root = createRoot(accountHost);
  const siteRoot: Root = createRoot(siteHost);
  bridge.attachReactRenderers(
    (model) => accountRoot.render(<VideoHubAddAccountForm model={model} />),
    () => siteRoot.render(<VideoHubAddSiteForm />),
  );
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountVideoHubAddAccount, { once: true });
else mountVideoHubAddAccount();

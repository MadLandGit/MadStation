import { createRoot, type Root } from 'react-dom/client';
import { useEffect, useLayoutEffect, useState, type FormEvent } from 'react';

export type ImageHubCategory = 'all' | 'generate' | 'edit' | 'upscale';

export interface ImageHubDiscoveryTool {
  id: string;
  name: string;
  url: string;
  category: Exclude<ImageHubCategory, 'all'>;
  description: string;
  custom: boolean;
  favorite: boolean;
  accountCount: number;
  iconCandidates: string[];
}

export interface ImageHubDiscoveryModel {
  categoryFilter: ImageHubCategory;
  toolCountLabel: string;
  tools: ImageHubDiscoveryTool[];
  providers: Array<{ id: string; name: string }>;
  confirmRemove: boolean;
}

export type ImageHubDiscoveryAction =
  | { type: 'category'; category: ImageHubCategory }
  | { type: 'toggle-favorite'; id: string }
  | { type: 'add-account'; providerId: string; name: string }
  | { type: 'add-custom-tool'; name: string; url: string }
  | { type: 'remove-custom-tool'; id: string };

export interface ImageHubDiscoveryBridge {
  attachReactRenderer(renderer: (model: ImageHubDiscoveryModel) => void): void;
  bindIconFallbacks(root: HTMLElement): void;
}

declare global {
  interface Window {
    MadStationImageHubDiscovery?: ImageHubDiscoveryBridge;
  }
}

const CATEGORIES: Array<{ id: ImageHubCategory; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'generate', label: 'Generate' },
  { id: 'edit', label: 'Edit' },
  { id: 'upscale', label: 'Upscale' },
];

function dispatch(action: ImageHubDiscoveryAction): void {
  window.dispatchEvent(new CustomEvent<ImageHubDiscoveryAction>('madstation:image-hub-discovery-action', { detail: action }));
}

function ToolIcon({ tool }: { tool: ImageHubDiscoveryTool }) {
  const candidates = tool.iconCandidates;
  return (
    <img
      className="provider-icon-img image-hub-real-icon"
      src={candidates[0] || ''}
      data-icon-candidates={encodeURIComponent(JSON.stringify(candidates))}
      data-icon-index="0"
      data-icon-cache-tried=""
      draggable={false}
      alt=""
      aria-hidden="true"
      referrerPolicy="no-referrer"
    />
  );
}

function CategoryFilters({ model }: { model: ImageHubDiscoveryModel }) {
  return <>{CATEGORIES.map((category) => {
    const selected = model.categoryFilter === category.id;
    return <button
      className={`tiny-btn${selected ? ' active' : ''}`}
      type="button"
      key={category.id}
      data-image-filter={category.id}
      aria-pressed={selected}
      onClick={() => dispatch({ type: 'category', category: category.id })}
    >{category.label}</button>;
  })}</>;
}

function ToolCard({ tool }: { tool: ImageHubDiscoveryTool }) {
  const accountLabel = `${tool.accountCount} account${tool.accountCount === 1 ? '' : 's'}`;
  return <article className="ms-card image-hub-tool-card" data-image-tool-id={tool.id}>
    <div className="ms-card-head">
      <span className="ms-brand-tile" aria-hidden="true"><ToolIcon tool={tool}/></span>
      <span className="image-hub-tool-copy"><strong>{tool.name}</strong><span className="ms-muted">{tool.description || tool.url}</span></span>
    </div>
    <div className="image-hub-tool-actions">
      <span className="ms-chip">{accountLabel}</span>
      <button className="ms-icon-btn image-hub-star" type="button" data-image-fav={tool.id}
        aria-label={tool.favorite ? `Remove ${tool.name} from favorites` : `Add ${tool.name} to favorites`}
        aria-pressed={tool.favorite} title={tool.favorite ? 'Unfavorite' : 'Favorite'}
        onClick={() => dispatch({ type: 'toggle-favorite', id: tool.id })}>{tool.favorite ? '★' : '☆'}</button>
      <button className="ms-btn ms-btn--primary ms-btn--sm" type="button" data-image-add-account={tool.id}
        onClick={() => dispatch({ type: 'add-account', providerId: tool.id, name: '' })}>+ Add account</button>
      {tool.custom ? <button className="ms-btn ms-btn--sm" type="button" data-image-remove={tool.id}
        onClick={() => dispatch({ type: 'remove-custom-tool', id: tool.id })}>Remove</button> : null}
    </div>
  </article>;
}

function ImageHubDiscovery({ model, bridge }: { model: ImageHubDiscoveryModel; bridge: ImageHubDiscoveryBridge }) {
  const [selectedProviderId, setSelectedProviderId] = useState(model.providers[0]?.id || '');
  const [accountName, setAccountName] = useState('');
  const [customName, setCustomName] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [customError, setCustomError] = useState('');

  useEffect(() => {
    if (!model.providers.some((provider) => provider.id === selectedProviderId)) {
      setSelectedProviderId(model.providers[0]?.id || '');
    }
  }, [model.providers, selectedProviderId]);

  useLayoutEffect(() => {
    const host = document.getElementById('imageHubDiscoveryReactMount');
    if (host instanceof HTMLElement) bridge.bindIconFallbacks(host);
  }, [bridge, model.tools]);

  function addAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProviderId) return;
    dispatch({ type: 'add-account', providerId: selectedProviderId, name: accountName.trim().slice(0, 60) });
    setAccountName('');
  }

  function addCustomTool(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = customName.trim().slice(0, 60);
    try {
      const parsed = new URL(customUrl.trim());
      if (!name) { setCustomError('Enter a name for this image tool.'); return; }
      if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) { setCustomError('Use a valid HTTPS website URL without embedded credentials.'); return; }
      setCustomError('');
      dispatch({ type: 'add-custom-tool', name, url: parsed.href });
      setCustomName('');
      setCustomUrl('');
    } catch {
      setCustomError('Enter a valid HTTPS website URL.');
    }
  }

  return <>
    <section className="ms-card image-hub-quickstart" aria-label="Quick start">
      <div className="image-hub-section-head"><div><span className="ms-eyebrow">Quick start</span><h2 className="ms-title">Pick a tool, add an account</h2><p className="ms-muted">One click creates an isolated login for that image tool. Free allowances may change at each provider.</p></div><span className="ms-chip">{model.toolCountLabel}</span></div>
      <div className="ms-grid image-hub-grid" id="imageHubToolCards">
        {model.tools.length ? model.tools.map((tool) => <ToolCard key={tool.id} tool={tool}/>) : <div className="ms-empty">No tools match this filter. Try another search or add a custom tool.</div>}
      </div>
    </section>
    <div className="image-hub-account-setup">
      <section className="ms-card image-hub-manage-card">
        <div className="image-hub-section-head"><div><span className="ms-eyebrow">Accounts</span><h2 className="ms-title">Add an account</h2><p className="ms-muted">Choose a tool and create an isolated login.</p></div></div>
        <form className="image-hub-account-form" onSubmit={addAccount}>
          <label className="image-hub-field-label" htmlFor="imageHubNewProviderReact">Image tool</label>
          <select className="ms-input" id="imageHubNewProviderReact" value={selectedProviderId} onChange={(event) => setSelectedProviderId(event.currentTarget.value)} required>
            {model.providers.map((provider) => <option value={provider.id} key={provider.id}>{provider.name}</option>)}
          </select>
          <label className="image-hub-field-label" htmlFor="imageHubNewNameReact">Account label <span className="ms-muted">(optional)</span></label>
          <input className="ms-input" id="imageHubNewNameReact" maxLength={60} placeholder="e.g. Personal account" autoComplete="off" value={accountName} onChange={(event) => setAccountName(event.currentTarget.value)}/>
          <button className="ms-btn ms-btn--primary" type="submit" disabled={!model.providers.length}>+ Add account</button>
        </form>
      </section>
      <section className="ms-card image-hub-custom-tool">
        <div className="image-hub-section-head"><div><span className="ms-eyebrow">Image tools</span><h2 className="ms-title">Add another tool</h2><p className="ms-muted">Add any HTTPS image generator, editor or upscaler. Its icon is fetched automatically.</p></div></div>
        <form className="image-hub-tool-form" onSubmit={addCustomTool}>
          <label className="image-hub-field-label" htmlFor="imageHubCustomNameReact">Tool name</label>
          <input className="ms-input" id="imageHubCustomNameReact" placeholder="Tool name" maxLength={60} required value={customName} onChange={(event) => setCustomName(event.currentTarget.value)} />
          <label className="image-hub-field-label" htmlFor="imageHubCustomUrlReact">Website URL</label>
          <input className="ms-input" id="imageHubCustomUrlReact" type="url" placeholder="https://example.com" required value={customUrl} onChange={(event) => setCustomUrl(event.currentTarget.value)} aria-invalid={Boolean(customError)} aria-describedby={customError ? 'imageHubCustomUrlError' : undefined} />
          {customError ? <p className="image-hub-validation-error" id="imageHubCustomUrlError" role="alert">{customError}</p> : null}
          <button className="ms-btn" type="submit">Add image tool</button>
        </form>
      </section>
    </div>
    <p className="ms-muted image-hub-note">Each account has its own persistent browser session. Accounts, custom tools and preferences are stored locally on this device.</p>
  </>;
}

function mountImageHubDiscovery() {
  const discoveryHost = document.getElementById('imageHubDiscoveryReactMount');
  const filtersHost = document.getElementById('imageHubCategoryFiltersReactMount');
  const bridge = window.MadStationImageHubDiscovery;
  if (!(discoveryHost instanceof HTMLElement) || !(filtersHost instanceof HTMLElement) || !bridge) return;
  const discoveryRoot: Root = createRoot(discoveryHost);
  const filtersRoot: Root = createRoot(filtersHost);
  bridge.attachReactRenderer((model) => {
    discoveryRoot.render(<ImageHubDiscovery model={model} bridge={bridge}/>);
    filtersRoot.render(<CategoryFilters model={model}/>);
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountImageHubDiscovery, { once: true });
else mountImageHubDiscovery();

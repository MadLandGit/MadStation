import { createRoot, type Root } from 'react-dom/client';
import { useLayoutEffect } from 'react';

export interface ImageHubIconView {
  iconCandidates: string[];
}

export interface ImageHubProviderView extends ImageHubIconView {
  id: string;
  name: string;
  count: number;
  iconKind: 'grid' | 'image';
}

export interface ImageHubAccountView extends ImageHubIconView {
  id: string;
  name: string;
  providerName: string;
  active: boolean;
}

export interface ImageHubSidebarModel {
  providerFilter: string;
  providers: ImageHubProviderView[];
  accounts: ImageHubAccountView[];
  accountView: 'list' | 'grid';
  accountCountLabel: string;
  listTitle: string;
  emptyMessage: string;
  listAriaLabel: string;
}

export interface ImageHubSidebarBridge {
  attachReactRenderer(renderer: (model: ImageHubSidebarModel) => void): void;
  bindIconFallbacks(root: HTMLElement): void;
  setProviderFilter(providerId: string): void;
}

declare global {
  interface Window {
    MadStationImageHubSidebar?: ImageHubSidebarBridge;
  }
}

function ProviderIcon({ item, className = 'image-hub-real-icon' }: {
  item: ImageHubIconView;
  className?: string;
}) {
  const candidates = item.iconCandidates;
  const initialIcon = candidates[0] || '';
  return (
    <img
      className={`provider-icon-img ${className}${initialIcon.startsWith('data:image/svg+xml') ? ' provider-icon-default' : ''}`}
      src={initialIcon}
      data-icon-candidates={encodeURIComponent(JSON.stringify(candidates))}
      data-icon-index="0"
      data-icon-cache-tried=""
      draggable={false}
      alt=""
      referrerPolicy="no-referrer"
    />
  );
}

function GridIcon() {
  return (
    <svg className="image-hub-real-icon image-hub-grid-glyph" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function ProviderTiles({ model, bridge }: { model: ImageHubSidebarModel; bridge: ImageHubSidebarBridge }) {
  useLayoutEffect(() => {
    const host = document.getElementById('imageHubProviderTiles');
    if (host instanceof HTMLElement) bridge.bindIconFallbacks(host);
  }, [bridge, model.providers]);

  return (
    <>
      {model.providers.map((provider) => {
        const selected = model.providerFilter === provider.id;
        const accountLabel = `${provider.count} account${provider.count === 1 ? '' : 's'}`;
        return (
          <button
            className={`tile${selected ? ' selected' : ''}`}
            type="button"
            role="tab"
            key={provider.id}
            title={`${provider.name} · ${accountLabel}`}
            aria-label={`${provider.name} · ${accountLabel}`}
            data-image-provider-filter={provider.id}
            aria-selected={selected}
            onClick={() => bridge.setProviderFilter(provider.id)}
          >
            <span className="tile-icon">{provider.iconKind === 'grid' ? <GridIcon /> : <ProviderIcon item={provider} />}</span>
            <span className="tile-label">{provider.name}</span>
            <span className="tile-count">{provider.count}</span>
          </button>
        );
      })}
    </>
  );
}

function AccountRows({ model, bridge }: { model: ImageHubSidebarModel; bridge: ImageHubSidebarBridge }) {
  useLayoutEffect(() => {
    const host = document.getElementById('imageHubAccountList');
    if (host instanceof HTMLElement) bridge.bindIconFallbacks(host);
  }, [bridge, model.accounts]);

  return (
    <>
      {model.emptyMessage ? <div className="ms-empty">{model.emptyMessage}</div> : model.accounts.map((account) => (
        <div
          className={`account-row image-hub-tile${account.active ? ' active' : ''}`}
          role="listitem"
          data-image-hub-account={account.id}
          key={account.id}
        >
          <button
            type="button"
            className="account-btn"
            data-image-account={account.id}
            aria-label={`${account.name} · ${account.providerName}${account.active ? ' · Active account' : ' · Open account'}`}
            aria-current={account.active ? 'true' : 'false'}
          >
            <span className="account-icon"><ProviderIcon item={account} /></span>
            <span className="image-hub-account-labels">
              <span className="image-hub-account-name-line"><strong className="image-hub-account-name">{account.name}</strong></span>
              <span className="image-hub-account-provider">{account.providerName}</span>
            </span>
            {account.active ? <span className="image-hub-row-active">Active</span> : null}
          </button>
        </div>
      ))}
    </>
  );
}

function mountImageHubSidebar() {
  const providerHost = document.getElementById('imageHubProviderTiles');
  const accountHost = document.getElementById('imageHubAccountList');
  const bridge = window.MadStationImageHubSidebar;
  if (!(providerHost instanceof HTMLElement) || !(accountHost instanceof HTMLElement) || !bridge) return;

  const providerRoot: Root = createRoot(providerHost);
  const accountRoot: Root = createRoot(accountHost);
  bridge.attachReactRenderer((model) => {
    providerRoot.render(<ProviderTiles model={model} bridge={bridge} />);
    accountRoot.render(<AccountRows model={model} bridge={bridge} />);
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountImageHubSidebar, { once: true });
else mountImageHubSidebar();

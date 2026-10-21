import { createRoot, type Root } from 'react-dom/client';
import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';

export interface VideoHubAccountView {
  id: string;
  providerId: string;
  name: string;
  providerName: string;
  iconCandidates: string[];
  active: boolean;
  pinned: boolean;
}

export interface VideoHubAccountListModel {
  accounts: VideoHubAccountView[];
  activeAccountId: string | null;
  query: string;
  providerFilter: string;
  pinnedOnly: boolean;
  accountView: 'grid' | 'list';
  renamingId: string;
  iconGeneration: number;
  hasAnyAccounts: boolean;
}

export interface VideoHubAccountListBridge {
  attachReactRenderer(renderer: (model: VideoHubAccountListModel) => void): void;
  bindIconFallbacks(root: HTMLElement): void;
  action(action: string, id: string, name?: string): void;
  openMenu(id: string, x: number, y: number): void;
}

declare global {
  interface Window {
    MadStationVideoHubAccounts?: VideoHubAccountListBridge;
  }
}

function AccountIcon({ account }: { account: VideoHubAccountView }) {
  const candidates = account.iconCandidates;
  const initial = candidates[0] || '';
  return (
    <img
      className={`provider-icon-img video-hub-real-icon${initial.startsWith('data:image/svg+xml') ? ' provider-icon-default' : ''}`}
      src={initial}
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

function MoreIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>;
}

function RenameRow({ account, bridge }: { account: VideoHubAccountView; bridge: VideoHubAccountListBridge }) {
  const [name, setName] = useState(account.name);
  const inputRef = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const save = () => bridge.action('save-rename', account.id, name);
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      save();
    }
    if (event.key === 'Escape') bridge.action('cancel-rename', account.id);
  };

  return (
    <article className="ms-row video-hub-account-row video-hub-rename-row video-hub-rename-row--react" data-video-hub-account={account.id} data-provider-id={account.providerId} role="listitem">
      <span className="video-hub-logo" aria-hidden="true"><AccountIcon account={account} /></span>
      <div className="video-hub-account-copy">
        <input
          ref={inputRef}
          className="ms-input video-hub-rename-input"
          data-video-hub-rename={account.id}
          aria-label="Account label"
          maxLength={60}
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
          onKeyDown={onKeyDown}
        />
        <span className="ms-muted">{account.providerName} · separate cookies and storage</span>
      </div>
      <button className="ms-btn ms-btn--sm" type="button" disabled={account.active} onClick={() => bridge.action('activate', account.id)}>
        {account.active ? 'Active' : 'Open'}
      </button>
      <div className="video-hub-account-actions">
        <button className="ms-btn ms-btn--sm ms-btn--primary" type="button" onClick={save}>Save</button>
        <button className="ms-btn ms-btn--sm" type="button" onClick={() => bridge.action('cancel-rename', account.id)}>Cancel</button>
      </div>
    </article>
  );
}

function AccountTile({ account, model, bridge, popoverVisible, setPopoverId, column, columns }: {
  account: VideoHubAccountView;
  model: VideoHubAccountListModel;
  bridge: VideoHubAccountListBridge;
  popoverVisible: boolean;
  column: number;
  columns: number;
  setPopoverId(id: string | null): void;
}) {
  const active = account.active;
  const showName = () => {
    if (model.accountView === 'grid') setPopoverId(account.id);
  };
  const hideName = () => setPopoverId(null);
  const openMenu = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const bounds = event.currentTarget.getBoundingClientRect();
    bridge.openMenu(account.id, bounds.right, bounds.bottom + 4);
  };

  return (
    <div
      className={`account-row video-hub-tile${active ? ' active' : ''}`}
      data-video-hub-account={account.id}
      data-provider-id={account.providerId}
      role="listitem"
      onContextMenu={(event) => {
        event.preventDefault();
        bridge.openMenu(account.id, event.clientX, event.clientY);
      }}
    >
      <button
        className="account-btn"
        type="button"
        aria-label={`${account.name} · ${account.providerName}${active ? ' · Active account' : ' · Open account'}`}
        aria-current={active ? 'true' : undefined}
        onClick={() => { if (!active) bridge.action('activate', account.id); }}
        onMouseEnter={showName}
        onMouseLeave={hideName}
        onFocus={showName}
        onBlur={hideName}
      >
        <span className="account-icon"><AccountIcon account={account} /></span>
        <span className="video-hub-account-labels">
          <span className="video-hub-account-name-line">
            <strong className="video-hub-account-name">{account.name}</strong>
            {account.pinned ? <span className="video-hub-row-pin" title="Pinned account">★ Pinned</span> : null}
          </span>
          <span className="video-hub-account-provider">{account.providerName}</span>
        </span>
        {active ? <span className="video-hub-row-active">Active</span> : null}
        {account.pinned ? <span className="video-hub-tile-pin" aria-hidden="true">★</span> : null}
      </button>
      <div className={`account-name-popover${column === 0 ? ' edge-left' : column >= columns - 1 ? ' edge-right' : ''}${popoverVisible ? ' is-visible' : ''}`} role="tooltip">
        <strong>{account.name}</strong><span>{account.providerName}</span>
      </div>
      <button className="more-btn" type="button" title="Account options" aria-label={`Options for ${account.name}`} onClick={openMenu}>
        <MoreIcon />
      </button>
    </div>
  );
}

function VideoHubAccountList({ model, bridge }: { model: VideoHubAccountListModel; bridge: VideoHubAccountListBridge }) {
  const [popoverId, setPopoverId] = useState<string | null>(null);
  const [columns, setColumns] = useState(1);
  useLayoutEffect(() => {
    const host = document.getElementById('videoHubAccountList');
    if (!(host instanceof HTMLElement)) return;
    const updateColumns = () => setColumns(Math.max(1, Math.floor((host.clientWidth + 7) / 63)));
    updateColumns();
    const observer = new ResizeObserver(updateColumns);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);
  const visibleAccounts = useMemo(() => model.accounts
    .filter((account) => {
      const matchesQuery = !model.query || `${account.name} ${account.providerName}`.toLowerCase().includes(model.query);
      return matchesQuery
        && (model.providerFilter === 'all' || account.providerId === model.providerFilter)
        && (!model.pinnedOnly || account.pinned);
    })
    .map((account, index) => ({ account, index }))
    .sort((a, b) => Number(b.account.pinned) - Number(a.account.pinned) || a.index - b.index)
    .map(({ account }) => account), [model.accounts, model.query, model.providerFilter, model.pinnedOnly]);

  useLayoutEffect(() => {
    const host = document.getElementById('videoHubAccountList');
    if (host instanceof HTMLElement) bridge.bindIconFallbacks(host);
  }, [bridge, visibleAccounts, model.iconGeneration]);

  if (!model.hasAnyAccounts) {
    return <div className="ms-empty">No accounts yet. Open Add Accounts to create your first account.</div>;
  }

  return (
    <>
      {visibleAccounts.map((account, index) => account.id === model.renamingId
        ? <RenameRow key={`${account.id}:${model.iconGeneration}`} account={account} bridge={bridge} />
        : <AccountTile key={`${account.id}:${model.iconGeneration}`} account={account} model={model} bridge={bridge} column={index % columns} columns={columns} popoverVisible={popoverId === account.id} setPopoverId={setPopoverId} />)}
    </>
  );
}

function mountVideoHubAccountList() {
  const host = document.getElementById('videoHubAccountList');
  const bridge = window.MadStationVideoHubAccounts;
  if (!(host instanceof HTMLElement) || !bridge) return;
  const root: Root = createRoot(host);
  bridge.attachReactRenderer((model) => {
    host.classList.toggle('is-list-view', model.accountView === 'list');
    host.dataset.view = model.accountView;
    host.setAttribute('aria-label', model.accountView === 'list' ? 'Video Hub accounts, list view' : 'Video Hub accounts, icon grid view');
    root.render(<VideoHubAccountList model={model} bridge={bridge} />);
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountVideoHubAccountList, { once: true });
else mountVideoHubAccountList();

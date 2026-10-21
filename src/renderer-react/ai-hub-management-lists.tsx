import { createRoot, type Root } from 'react-dom/client';
import { useLayoutEffect, useRef, type DragEvent } from 'react';

export interface AiHubManagementProviderRow {
  id: string;
  name: string;
  url: string;
  category: string;
  description: string;
  freeTier: boolean;
  accountCount: number;
  iconCandidates: string[];
}

export interface AiHubManagementAccountRow {
  id: string;
  name: string;
  url: string;
  serviceId: string;
  serviceName: string;
  favorite: boolean;
  shortcut: string;
  iconCandidates: string[];
}

export interface AiHubManagementListsModel {
  services: AiHubManagementProviderRow[];
  accounts: AiHubManagementAccountRow[];
  activeId: string | null;
  recordingShortcutTarget: string | null;
}

export type AiHubManagementAction =
  | 'edit-provider'
  | 'delete-provider'
  | 'select-account'
  | 'shortcut'
  | 'rename-account'
  | 'delete-account';
export type AiHubManagementOrderType = 'service' | 'account';
export type AiHubManagementDirection = 'up' | 'down';

export interface AiHubManagementListsBridge {
  attachReactRenderer(renderer: (model: AiHubManagementListsModel) => void): void;
  bindIconFallbacks(root: HTMLElement): void;
  action(action: AiHubManagementAction, id: string): void;
  moveOrder(type: AiHubManagementOrderType, id: string, direction: AiHubManagementDirection): void;
  reorder(type: AiHubManagementOrderType, draggedId: string, targetId: string, after: boolean): void;
  clearShortcut(id: string): void;
}

declare global {
  interface Window {
    MadStationAiHubManagementLists?: AiHubManagementListsBridge;
  }
}

function useIconFallback(rootId: string, bridge: AiHubManagementListsBridge, revision: unknown): void {
  useLayoutEffect(() => {
    const root = document.getElementById(rootId);
    if (root instanceof HTMLElement) bridge.bindIconFallbacks(root);
  }, [bridge, rootId, revision]);
}

function ProviderIcon({ candidates, small = false }: { candidates: string[]; small?: boolean }) {
  const list = candidates.length ? candidates : [];
  const src = list[0] || '';
  const image = <img
    className="provider-icon-img"
    draggable={false}
    src={src}
    data-icon-candidates={encodeURIComponent(JSON.stringify(list))}
    data-icon-index="0"
    data-icon-cache-tried=""
    alt=""
    aria-hidden="true"
    referrerPolicy="no-referrer"
  />;
  return small ? <span className="provider-icon small">{image}</span> : <div className="provider-icon">{image}</div>;
}

function canDropAfter(event: DragEvent<HTMLElement>): boolean {
  const rect = event.currentTarget.getBoundingClientRect();
  return event.clientY > rect.top + rect.height / 2;
}

function clearDropIndicators(container: HTMLElement | null): void {
  container?.querySelectorAll('.reorder-before, .reorder-after').forEach((element) => {
    element.classList.remove('reorder-before', 'reorder-after');
  });
}

function ProviderManagementList({ model, bridge }: { model: AiHubManagementListsModel; bridge: AiHubManagementListsBridge }) {
  const draggingId = useRef<string | null>(null);
  useIconFallback('providerList', bridge, model.services);

  if (!model.services.length) return <div className="empty-state">No providers available.</div>;

  return <>
    {model.services.map((service, index) => {
      const onDragOver = (event: DragEvent<HTMLDivElement>) => {
        if (!draggingId.current || draggingId.current === service.id) return;
        event.preventDefault();
        clearDropIndicators(event.currentTarget.parentElement);
        event.currentTarget.classList.add(canDropAfter(event) ? 'reorder-after' : 'reorder-before');
      };
      const onDrop = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        const dragged = draggingId.current;
        const after = canDropAfter(event);
        clearDropIndicators(event.currentTarget.parentElement);
        draggingId.current = null;
        if (dragged && dragged !== service.id) bridge.reorder('service', dragged, service.id, after);
      };
      return <div
        className="provider-row reorder-row"
        draggable
        data-reorder-type="service"
        data-reorder-id={service.id}
        key={service.id}
        onDragStart={(event) => {
          draggingId.current = service.id;
          event.currentTarget.classList.add('dragging');
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', service.id);
        }}
        onDragEnd={(event) => {
          draggingId.current = null;
          event.currentTarget.classList.remove('dragging');
          clearDropIndicators(event.currentTarget.parentElement);
        }}
        onDragOver={onDragOver}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            event.currentTarget.classList.remove('reorder-before', 'reorder-after');
          }
        }}
        onDrop={onDrop}
      >
        <button className="drag-handle" type="button" title="Drag to reorder" aria-label={`Drag ${service.name} to reorder`} tabIndex={-1}>⋮⋮</button>
        <div className="provider-main">
          <ProviderIcon candidates={service.iconCandidates} />
          <div className="provider-copy">
            <strong>{service.name}{service.freeTier ? <> <span className="free-badge">Free</span></> : null}</strong>
            <span>{service.freeTier ? 'Free tier' : 'Custom'} · {service.url}{service.category ? ` · ${service.category}` : ''}{service.description ? ` · ${service.description}` : ''} · {service.accountCount} account{service.accountCount === 1 ? '' : 's'}</span>
          </div>
        </div>
        <div className="row-actions">
          <button className="ms-btn ms-btn--sm order-btn" type="button" data-order-action="up" data-order-type="service" data-order-id={service.id} disabled={index === 0} aria-label={`Move ${service.name} up`} onClick={() => bridge.moveOrder('service', service.id, 'up')}><svg aria-hidden="true" viewBox="0 0 24 24" className="glyph-ico"><path d="M12 19V5M6 11l6-6 6 6" /></svg></button>
          <button className="ms-btn ms-btn--sm order-btn" type="button" data-order-action="down" data-order-type="service" data-order-id={service.id} disabled={index === model.services.length - 1} aria-label={`Move ${service.name} down`} onClick={() => bridge.moveOrder('service', service.id, 'down')}><svg aria-hidden="true" viewBox="0 0 24 24" className="glyph-ico"><path d="M12 5v14M6 13l6 6 6-6" /></svg></button>
          <button className="ms-btn ms-btn--sm" type="button" data-action="edit-provider" data-id={service.id} onClick={() => bridge.action('edit-provider', service.id)}>Edit</button>
          <button className="ms-btn ms-btn--sm danger" type="button" data-action="delete-provider" data-id={service.id} onClick={() => bridge.action('delete-provider', service.id)}>Delete</button>
        </div>
      </div>;
    })}
  </>;
}

function AccountManagementList({ model, bridge }: { model: AiHubManagementListsModel; bridge: AiHubManagementListsBridge }) {
  const draggingId = useRef<string | null>(null);
  useIconFallback('settingsAccountList', bridge, model.accounts);

  if (!model.accounts.length) return <div className="empty-state">No matching accounts.</div>;

  return <>
    {model.accounts.map((account, index) => {
      const onDragOver = (event: DragEvent<HTMLDivElement>) => {
        if (!draggingId.current || draggingId.current === account.id) return;
        event.preventDefault();
        clearDropIndicators(event.currentTarget.parentElement);
        event.currentTarget.classList.add(canDropAfter(event) ? 'reorder-after' : 'reorder-before');
      };
      const onDrop = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        const dragged = draggingId.current;
        const after = canDropAfter(event);
        clearDropIndicators(event.currentTarget.parentElement);
        draggingId.current = null;
        if (dragged && dragged !== account.id) bridge.reorder('account', dragged, account.id, after);
      };
      return <div
        className="settings-account-row reorder-row"
        draggable
        data-reorder-type="account"
        data-reorder-id={account.id}
        key={account.id}
        onDragStart={(event) => {
          draggingId.current = account.id;
          event.currentTarget.classList.add('dragging');
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', account.id);
        }}
        onDragEnd={(event) => {
          draggingId.current = null;
          event.currentTarget.classList.remove('dragging');
          clearDropIndicators(event.currentTarget.parentElement);
        }}
        onDragOver={onDragOver}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            event.currentTarget.classList.remove('reorder-before', 'reorder-after');
          }
        }}
        onDrop={onDrop}
      >
        <button className="drag-handle" type="button" title="Drag to reorder" aria-label={`Drag ${account.name} to reorder`} tabIndex={-1}>⋮⋮</button>
        <button className={`mini-account-select${account.id === model.activeId ? ' selected' : ''}`} type="button" data-id={account.id} onClick={() => bridge.action('select-account', account.id)}>
          <ProviderIcon candidates={account.iconCandidates} small />
          <span className="mini-copy"><strong>{account.name}</strong><span>{account.serviceName} · {account.url}</span></span>
        </button>
        <div className="row-actions">
          <button className="ms-btn ms-btn--sm order-btn" type="button" data-order-action="up" data-order-type="account" data-order-id={account.id} disabled={index === 0} aria-label={`Move ${account.name} up`} onClick={() => bridge.moveOrder('account', account.id, 'up')}><svg aria-hidden="true" viewBox="0 0 24 24" className="glyph-ico"><path d="M12 19V5M6 11l6-6 6 6" /></svg></button>
          <button className="ms-btn ms-btn--sm order-btn" type="button" data-order-action="down" data-order-type="account" data-order-id={account.id} disabled={index === model.accounts.length - 1} aria-label={`Move ${account.name} down`} onClick={() => bridge.moveOrder('account', account.id, 'down')}><svg aria-hidden="true" viewBox="0 0 24 24" className="glyph-ico"><path d="M12 5v14M6 13l6 6 6-6" /></svg></button>
          <button className="ms-btn ms-btn--sm" type="button" data-account-action="shortcut" data-id={account.id} onClick={() => bridge.action('shortcut', account.id)}>{account.shortcut || 'Set shortcut'}</button>
          <button className="ms-btn ms-btn--sm" type="button" data-account-action="rename" data-id={account.id} onClick={() => bridge.action('rename-account', account.id)}>Rename</button>
          <button className="ms-btn ms-btn--sm danger" type="button" data-account-action="delete" data-id={account.id} onClick={() => bridge.action('delete-account', account.id)}>Delete</button>
        </div>
      </div>;
    })}
  </>;
}

function ShortcutManagementList({ model, bridge }: { model: AiHubManagementListsModel; bridge: AiHubManagementListsBridge }) {
  useIconFallback('shortcutList', bridge, model.accounts);
  return <>
    {model.accounts.map((account) => <div className="shortcut-row" key={account.id}>
      <div className="shortcut-copy"><ProviderIcon candidates={account.iconCandidates} small /><div><strong>{account.name}</strong><span>{account.serviceName}</span></div></div>
      <button className={`shortcut-input${model.recordingShortcutTarget === account.id ? ' recording' : ''}`} type="button" data-shortcut-id={account.id} onClick={() => bridge.action('shortcut', account.id)}>{model.recordingShortcutTarget === account.id ? 'Press keys…' : (account.shortcut || 'Not assigned')}</button>
      <button className="ms-btn ms-btn--sm" type="button" data-clear-shortcut={account.id} onClick={() => bridge.clearShortcut(account.id)}>Clear</button>
    </div>)}
  </>;
}

let providerRoot: Root | null = null;
let accountRoot: Root | null = null;
let shortcutRoot: Root | null = null;

function mountAiHubManagementLists(): void {
  const bridge = window.MadStationAiHubManagementLists;
  const providerHost = document.getElementById('providerList');
  const accountHost = document.getElementById('settingsAccountList');
  const shortcutHost = document.getElementById('shortcutList');
  if (!bridge || !(providerHost instanceof HTMLElement) || !(accountHost instanceof HTMLElement) || !(shortcutHost instanceof HTMLElement)) return;

  providerRoot = createRoot(providerHost);
  accountRoot = createRoot(accountHost);
  shortcutRoot = createRoot(shortcutHost);
  bridge.attachReactRenderer((model) => {
    providerRoot?.render(<ProviderManagementList model={model} bridge={bridge} />);
    accountRoot?.render(<AccountManagementList model={model} bridge={bridge} />);
    shortcutRoot?.render(<ShortcutManagementList model={model} bridge={bridge} />);
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountAiHubManagementLists, { once: true });
else mountAiHubManagementLists();

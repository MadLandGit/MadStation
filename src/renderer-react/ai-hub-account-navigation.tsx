import { createRoot, type Root } from 'react-dom/client';
import { useLayoutEffect, useRef, type DragEvent } from 'react';

export interface AiHubAccountNavigationService {
  id: string;
  name: string;
  accountCount: number;
  title: string;
  iconCandidates: string[];
}

export interface AiHubAccountNavigationRecentAccount {
  id: string;
  name: string;
  iconCandidates: string[];
}

export interface AiHubAccountNavigationModel {
  services: AiHubAccountNavigationService[];
  totalAccounts: number;
  providerFilter: string;
  searchActive: boolean;
  favorites: boolean;
  group: string;
  groups: string[];
  listTitle: string;
  recent: AiHubAccountNavigationRecentAccount[];
  showRecent: boolean;
}

export interface AiHubAccountNavigationBridge {
  attachReactRenderer(renderer: (model: AiHubAccountNavigationModel) => void): void;
  bindIconFallbacks(root: HTMLElement): void;
  selectProvider(id: string): void;
  openProviderMenu(id: string, x: number, y: number): void;
  addProvider(): void;
  moveOrder(id: string, direction: 'up' | 'down'): void;
  reorder(draggedId: string, targetId: string, after: boolean): void;
  selectAccount(id: string): void;
  showAllAccounts(): void;
  showFavorites(): void;
  setGroup(group: string): void;
}

declare global {
  interface Window {
    MadStationAiHubAccountNavigation?: AiHubAccountNavigationBridge;
  }
}

function useIconFallbacks(bridge: AiHubAccountNavigationBridge, model: AiHubAccountNavigationModel): void {
  useLayoutEffect(() => {
    const providers = document.getElementById('providerTiles');
    const recent = document.getElementById('recentAccounts');
    if (providers instanceof HTMLElement) bridge.bindIconFallbacks(providers);
    if (recent instanceof HTMLElement) bridge.bindIconFallbacks(recent);
  }, [bridge, model.services, model.recent]);
}

function ProviderIcon({ candidates }: { candidates: string[] }) {
  const src = candidates[0] || '';
  const isDefault = src.startsWith('data:image/svg+xml');
  return (
    <img
      className={`provider-icon-img${isDefault ? ' provider-icon-default' : ''}`}
      draggable={false}
      src={src}
      data-icon-candidates={encodeURIComponent(JSON.stringify(candidates))}
      data-icon-index="0"
      data-icon-cache-tried=""
      alt=""
      aria-hidden="true"
      referrerPolicy="no-referrer"
    />
  );
}

function clearDropIndicators(container: HTMLElement | null): void {
  container?.querySelectorAll('.reorder-before, .reorder-after').forEach((element) => {
    element.classList.remove('reorder-before', 'reorder-after');
  });
}

function isAfter(event: DragEvent<HTMLButtonElement>): boolean {
  const rect = event.currentTarget.getBoundingClientRect();
  return event.clientX > rect.left + rect.width / 2;
}

function ProviderFilterTiles({ model, bridge }: {
  model: AiHubAccountNavigationModel;
  bridge: AiHubAccountNavigationBridge;
}) {
  const draggingId = useRef<string | null>(null);
  useIconFallbacks(bridge, model);

  return <>
    <button
      className={`tile${!model.searchActive && model.providerFilter === 'all' ? ' selected' : ''}`}
      type="button"
      title={`All · ${model.totalAccounts} accounts`}
      data-provider-filter="all"
      role="tab"
      aria-selected={!model.searchActive && model.providerFilter === 'all'}
      onClick={() => bridge.selectProvider('all')}
    >
      <span className="tile-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></svg></span>
      <span className="tile-label">All</span>
      <span className="tile-count">{model.totalAccounts}</span>
    </button>
    {model.services.map((service) => {
      const selected = !model.searchActive && model.providerFilter === service.id;
      const onDragOver = (event: DragEvent<HTMLButtonElement>) => {
        if (!draggingId.current || draggingId.current === service.id) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        clearDropIndicators(event.currentTarget.parentElement);
        event.currentTarget.classList.add(isAfter(event) ? 'reorder-after' : 'reorder-before');
      };
      const onDrop = (event: DragEvent<HTMLButtonElement>) => {
        event.preventDefault();
        const dragged = draggingId.current;
        const after = isAfter(event);
        clearDropIndicators(event.currentTarget.parentElement);
        draggingId.current = null;
        if (dragged && dragged !== service.id) bridge.reorder(dragged, service.id, after);
      };
      return <button
        className={`tile${selected ? ' selected' : ''}`}
        type="button"
        title={service.title}
        data-provider-filter={service.id}
        data-reorder-type="service"
        data-reorder-id={service.id}
        role="tab"
        aria-selected={selected}
        draggable
        key={service.id}
        onClick={() => bridge.selectProvider(service.id)}
        onContextMenu={(event) => {
          event.preventDefault();
          bridge.openProviderMenu(service.id, event.clientX, event.clientY);
        }}
        onKeyDown={(event) => {
          if (!event.ctrlKey || !event.shiftKey || event.altKey) return;
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          bridge.moveOrder(service.id, event.key === 'ArrowLeft' ? 'up' : 'down');
        }}
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
        <span className="tile-icon"><ProviderIcon candidates={service.iconCandidates} /></span>
        <span className="tile-label">{service.name}</span>
        <span className="tile-count">{service.accountCount}</span>
      </button>;
    })}
    <button className="tile tile-add" type="button" title="Add a new provider" data-provider-filter="__add__" role="tab" aria-selected={false} onClick={() => bridge.addProvider()}>
      <span className="tile-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg></span>
      <span className="tile-label">Provider</span>
    </button>
  </>;
}

function OrganizationFilters({ model, bridge }: {
  model: AiHubAccountNavigationModel;
  bridge: AiHubAccountNavigationBridge;
}) {
  return <>
    <button className={`tiny-btn${!model.favorites && !model.group ? ' active' : ''}`} id="orgAllBtn" type="button" onClick={() => bridge.showAllAccounts()}>All</button>
    <button className={`tiny-btn${model.favorites ? ' active' : ''}`} id="orgFavoritesBtn" type="button" onClick={() => bridge.showFavorites()}>Pinned</button>
    <select className="ms-input org-group-filter" id="orgGroupFilter" aria-label="Filter by group" value={model.group} onChange={(event) => bridge.setGroup(event.currentTarget.value)}>
      <option value="">Groups</option>
      {model.groups.map((group) => <option value={group} key={group}>{group}</option>)}
    </select>
  </>;
}

function RecentAccounts({ model, bridge }: {
  model: AiHubAccountNavigationModel;
  bridge: AiHubAccountNavigationBridge;
}) {
  useIconFallbacks(bridge, model);
  if (!model.showRecent || model.recent.length === 0) return null;
  return <>
    <div className="recent-head">Recent</div>
    {model.recent.map((account) => <button type="button" className="recent-item" data-recent-id={account.id} key={account.id} onClick={() => bridge.selectAccount(account.id)}>
      <ProviderIcon candidates={account.iconCandidates} />
      <span>{account.name}</span>
    </button>)}
  </>;
}

let providerRoot: Root | null = null;
let organizationRoot: Root | null = null;
let recentRoot: Root | null = null;
let titleRoot: Root | null = null;

function mountAiHubAccountNavigation(): void {
  const bridge = window.MadStationAiHubAccountNavigation;
  const providerHost = document.getElementById('providerTiles');
  const organizationHost = document.getElementById('orgBar');
  const recentHost = document.getElementById('recentAccounts');
  const titleHost = document.getElementById('listTitle');
  if (!bridge || !(providerHost instanceof HTMLElement) || !(organizationHost instanceof HTMLElement) || !(recentHost instanceof HTMLElement) || !(titleHost instanceof HTMLElement)) return;

  providerRoot = createRoot(providerHost);
  organizationRoot = createRoot(organizationHost);
  recentRoot = createRoot(recentHost);
  titleRoot = createRoot(titleHost);
  bridge.attachReactRenderer((model) => {
    providerRoot?.render(<ProviderFilterTiles model={model} bridge={bridge} />);
    organizationRoot?.render(<OrganizationFilters model={model} bridge={bridge} />);
    recentRoot?.render(<RecentAccounts model={model} bridge={bridge} />);
    titleRoot?.render(model.listTitle);
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountAiHubAccountNavigation, { once: true });
else mountAiHubAccountNavigation();

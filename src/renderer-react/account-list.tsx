import { createRoot, type Root } from 'react-dom/client';
import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent, type MutableRefObject } from 'react';

export interface AccountListService {
  id: string;
  name: string;
  icon?: string;
  iconCandidates?: string[];
}

export interface AccountListAccount {
  id: string;
  name: string;
  url?: string;
  serviceId: string;
  icon?: string;
  iconCandidates?: string[];
  favorite?: boolean;
  group?: string;
  status?: string;
}

export interface AccountListProps {
  accounts: AccountListAccount[];
  hasAnyAccounts: boolean;
  services: AccountListService[];
  activeId: string | null;
  density: string;
  remoteIcons: boolean;
  columns: number;
  emptyTitle: string;
  emptyDescription: string;
  addTitle: string;
  filterServiceId: string | null;
  onSelect(id: string): void;
  onOpenMenu(id: string, x: number, y: number): void;
  onAddAccount(providerId: string): void;
  onReorder(draggedId: string, targetId: string, after: boolean): void | Promise<void>;
}

export interface AccountListController {
  update(props: AccountListProps): void;
}

declare global {
  interface Window {
    MadStationAccountList?: AccountListController;
  }
}

const DEFAULT_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect x="2" y="2" width="44" height="44" rx="12" fill="#161b2b"/><path d="M24 7l3.1 9.9L37 20l-9.9 3.1L24 33l-3.1-9.9L11 20l9.9-3.1L24 7z" fill="#8b7cff"/><path d="M15 36h18" stroke="#c7c9d8" stroke-width="2.5" stroke-linecap="round"/><circle cx="16" cy="16" r="2" fill="#c7c9d8"/><circle cx="32" cy="31" r="2" fill="#8b7cff"/></svg>';
const DEFAULT_ICON_URL = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(DEFAULT_ICON_SVG)}`;

function isSafeIcon(value: unknown, remoteIcons: boolean): value is string {
  if (typeof value !== 'string') return false;
  if (/^data:image\//i.test(value)) return true;
  return remoteIcons && /^https:\/\//i.test(value);
}

async function cacheRemoteIcon(url: string): Promise<{ ok: boolean; icon?: string } | null> {
  try {
    const result: unknown = await window.aiHub.cacheIcon(url);
    if (!result || typeof result !== 'object') return null;
    const record = result as Record<string, unknown>;
    return { ok: record.ok === true, icon: typeof record.icon === 'string' ? record.icon : undefined };
  } catch {
    return null;
  }
}

function AccountIcon({ account, service, remoteIcons }: {
  account: AccountListAccount;
  service: AccountListService;
  remoteIcons: boolean;
}) {
  const candidates = useMemo(() => [...new Set([
    account.icon,
    ...(Array.isArray(account.iconCandidates) ? account.iconCandidates : []),
    service.icon,
    ...(Array.isArray(service.iconCandidates) ? service.iconCandidates : []),
  ].filter((value): value is string => isSafeIcon(value, remoteIcons)))].concat(DEFAULT_ICON_URL), [account.icon, account.iconCandidates, service.icon, service.iconCandidates, remoteIcons]);
  const candidateKey = candidates.join('\n');
  const [index, setIndex] = useState(0);
  const [cachedIcon, setCachedIcon] = useState<string | null>(null);
  const cacheTried = useRef(new Set<string>());

  useEffect(() => {
    setIndex(0);
    setCachedIcon(null);
    cacheTried.current.clear();
  }, [candidateKey]);

  const source = cachedIcon || candidates[Math.min(index, candidates.length - 1)] || DEFAULT_ICON_URL;
  const onError = async () => {
    const failed = candidates[index];
    if (failed && /^https:\/\//i.test(failed) && !cacheTried.current.has(failed)) {
      cacheTried.current.add(failed);
      try {
        const result = await cacheRemoteIcon(failed);
        if (result?.ok && typeof result.icon === 'string' && isSafeIcon(result.icon, remoteIcons)) {
          setCachedIcon(result.icon);
          return;
        }
      } catch {
        // A missing cache entry must not prevent trying the next icon candidate.
      }
    }
    setCachedIcon(null);
    setIndex((current) => Math.min(current + 1, candidates.length - 1));
  };

  return (
    <img
      className={`provider-icon-img${source === DEFAULT_ICON_URL ? ' provider-icon-default' : ''}`}
      draggable={false}
      src={source}
      alt=""
      aria-hidden="true"
      referrerPolicy="no-referrer"
      onError={onError}
      onLoad={() => {
        if (remoteIcons && /^https:\/\//i.test(source)) {
          // Keep cache side effects bounded to a single request per URL in this icon instance.
          if (!cacheTried.current.has(source)) {
            cacheTried.current.add(source);
            void cacheRemoteIcon(source);
          }
        }
      }}
    />
  );
}

function AccountRow({ account, service, props, column, draggingId, onDragStart, onDropEnd }: {
  account: AccountListAccount;
  service: AccountListService;
  props: AccountListProps;
  column: number;
  draggingId: MutableRefObject<string | null>;
  onDragStart(id: string): void;
  onDropEnd(): void;
}) {
  const active = account.id === props.activeId;
  const [nameVisible, setNameVisible] = useState(false);
  const [dropPosition, setDropPosition] = useState<'before' | 'after' | null>(null);
  const label = `${account.name}${active ? ' · Open' : ''}`;

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    const dragged = draggingId.current;
    if (!dragged || dragged === account.id) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const rect = event.currentTarget.getBoundingClientRect();
    const after = props.density === 'compact'
      ? event.clientX > rect.left + rect.width / 2
      : event.clientY > rect.top + rect.height / 2;
    setDropPosition(after ? 'after' : 'before');
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const dragged = draggingId.current;
    if (!dragged || dragged === account.id) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const after = props.density === 'compact'
      ? event.clientX > rect.left + rect.width / 2
      : event.clientY > rect.top + rect.height / 2;
    void props.onReorder(dragged, account.id, after);
    setDropPosition(null);
    onDropEnd();
  };

  const showName = () => {
    if (props.density !== 'compact') return;
    document.querySelectorAll('.account-name-popover.is-visible').forEach((element) => element.classList.remove('is-visible'));
    setNameVisible(true);
  };

  return (
    <div
      className={`account-row reorder-row${active ? ' active' : ''}${dropPosition ? ` reorder-${dropPosition}` : ''}`}
      draggable
      data-reorder-type="account"
      data-reorder-id={account.id}
      onDragStart={() => onDragStart(account.id)}
      onDragEnd={() => { setDropPosition(null); onDropEnd(); }}
      onDragOver={handleDragOver}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropPosition(null); }}
      onDrop={handleDrop}
      onContextMenu={(event: MouseEvent<HTMLDivElement>) => {
        event.preventDefault();
        props.onOpenMenu(account.id, event.clientX, event.clientY);
      }}
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Escape') setNameVisible(false);
      }}
    >
      <button
        className="account-btn"
        type="button"
        data-account-id={account.id}
        aria-current={active ? 'true' : undefined}
        aria-label={label}
        onClick={() => props.onSelect(account.id)}
        onMouseEnter={showName}
        onMouseLeave={() => setNameVisible(false)}
        onFocus={showName}
        onBlur={() => setNameVisible(false)}
      >
        <span className="account-icon"><AccountIcon account={account} service={service} remoteIcons={props.remoteIcons} /></span>
        <span className="account-text"><span className="account-name">{account.name}</span><span className="account-sub">{service.name}</span></span>
        <span className="account-end"><span className="group-pill">{account.group || ''}</span><span className="pin-pill">{account.favorite ? '★' : ''}</span><span className="live-pill">{active ? 'Open' : ''}</span></span>
      </button>
      <div className={`account-name-popover${column <= 0 ? ' edge-left' : column >= props.columns - 1 ? ' edge-right' : ''}${nameVisible ? ' is-visible' : ''}`} role="tooltip">
        <strong>{account.name}</strong><span>{service.name}</span>
      </div>
      <button
        className="more-btn"
        type="button"
        title="Account options"
        aria-label={`Options for ${account.name}`}
        onClick={(event) => {
          event.stopPropagation();
          const bounds = event.currentTarget.getBoundingClientRect();
          props.onOpenMenu(account.id, bounds.right, bounds.bottom + 4);
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>
      </button>
    </div>
  );
}

function AccountList(props: AccountListProps) {
  const serviceMap = useMemo(() => new Map(props.services.map((service) => [service.id, service])), [props.services]);
  const draggingId = useRef<string | null>(null);

  const onDragStart = (id: string) => { draggingId.current = id; };
  const onDropEnd = () => { draggingId.current = null; };

  if (!props.hasAnyAccounts) {
    return <><div className="empty-state"><strong>No accounts yet</strong><span>Add an account to open an AI website with its own separate login.</span></div><AddAccountButton title={props.addTitle} onClick={() => props.onAddAccount(props.filterServiceId || '')} /></>;
  }
  if (props.accounts.length === 0 || props.emptyTitle) {
    return <><div className="empty-state"><strong>{props.emptyTitle}</strong><span>{props.emptyDescription}</span></div><AddAccountButton title={props.addTitle} onClick={() => props.onAddAccount(props.filterServiceId || '')} /></>;
  }

  return <>
    {props.accounts.map((account, cardIndex) => {
      const service = serviceMap.get(account.serviceId) || { id: account.serviceId, name: 'Unknown', icon: '' };
      const column = cardIndex % Math.max(1, props.columns);
      return <AccountRow key={account.id} account={account} service={service} props={props} column={column} draggingId={draggingId} onDragStart={onDragStart} onDropEnd={onDropEnd} />;
    })}
    <AddAccountButton title={props.addTitle} onClick={() => props.onAddAccount(props.filterServiceId || '')} />
  </>;
}

function AddAccountButton({ title, onClick }: { title: string; onClick(): void }) {
  return <button type="button" className="accounts-end-add" title={title} aria-label={title} onClick={onClick}>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg><span>Add account</span>
  </button>;
}

let root: Root | null = null;
const mount = document.getElementById('accounts');
if (mount) {
  root = createRoot(mount);
  window.MadStationAccountList = {
    update(props) {
      root?.render(<AccountList {...props} />);
    },
  };
  window.dispatchEvent(new Event('madstation:accounts-react-ready'));
}

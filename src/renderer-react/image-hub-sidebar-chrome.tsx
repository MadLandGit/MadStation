import { createRoot, type Root } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';

interface SidebarChromeModel {
  search: string;
  listTitle: string;
  accountCountLabel: string;
  collapsed: boolean;
  notificationCount: number;
}
type SidebarChromeAction =
  | { type: 'search'; value: string }
  | { type: 'settings' | 'notifications' | 'toggle-sidebar' | 'back' | 'open-first-result' };
const DEFAULT_MODEL: SidebarChromeModel = {
  search: '', listTitle: 'All accounts', accountCountLabel: '0 accounts', collapsed: false, notificationCount: 0,
};
function dispatch(action: SidebarChromeAction): void {
  window.dispatchEvent(new CustomEvent<SidebarChromeAction>('madstation:image-hub-sidebar-chrome-action', { detail: action }));
}

function SidebarBrand() {
  return <>
    <button aria-label="Back" className="back-settings" id="imageHubBackBtn" title="Back" type="button" onClick={() => dispatch({ type: 'back' })}>
      <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>
    </button>
    <div className="brand-mark brand-mark-ai" aria-label="Image Hub logo"><svg aria-hidden="true" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg></div>
  </>;
}

function SidebarActions({ model }: { model: SidebarChromeModel }) {
  const sidebarLabel = model.collapsed ? 'Show sidebar' : 'Hide sidebar';
  return <>
    <button aria-label="Settings" className="icon-only" id="imageHubSettingsBtn" title="Settings" type="button" onClick={() => dispatch({ type: 'settings' })}>
      <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h0a1.7 1.7 0 0 0 1.9-.3l-.1-.1a2 2 0 1 1 2.8 2.8l.1.1a1.7 1.7 0 0 0 .3 1.9v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>
    </button>
    <button aria-label="Notifications" className="icon-only" id="imageHubNotificationsBtn" title="Notifications" type="button" onClick={() => dispatch({ type: 'notifications' })}>
      <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>
      <span className={`notification-badge${model.notificationCount ? '' : ' hidden'}`} id="imageHubNotificationBadge">{Math.min(99, model.notificationCount)}</span>
    </button>
    <button aria-label={sidebarLabel} className="icon-only aihub-hide-sidebar-btn" id="imageHubHideSidebarBtn" title={sidebarLabel} type="button" aria-pressed={model.collapsed} onClick={() => dispatch({ type: 'toggle-sidebar' })}>
      <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 6h16M4 12h10M4 18h16"/><path d="M18 9l-3 3 3 3"/></svg>
    </button>
  </>;
}

function SearchBox({ model }: { model: SidebarChromeModel }) {
  return <div className="search-wrap image-hub-search">
    <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
    <input autoComplete="off" className="search" id="imageHubSearch" placeholder="Search accounts…" aria-label="Search image accounts" value={model.search}
      onChange={(event) => { const value = event.currentTarget.value.slice(0, 200); dispatch({ type: 'search', value }); }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && model.search) { event.preventDefault(); event.stopPropagation(); dispatch({ type: 'search', value: '' }); }
        else if (event.key === 'Enter') { event.preventDefault(); dispatch({ type: 'open-first-result' }); }
      }} />
    <kbd id="imageHubSearchKbd" className={model.search ? 'hidden' : ''}>Ctrl K</kbd>
    <button aria-label="Clear search" className={`search-clear${model.search ? '' : ' hidden'}`} id="imageHubSearchClear" title="Clear search" type="button" onClick={() => dispatch({ type: 'search', value: '' })}>
      <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>
    </button>
  </div>;
}

function ListHeading({ model }: { model: SidebarChromeModel }) {
  return <div className="list-head"><div className="list-title" id="imageHubListTitle">{model.listTitle}</div><span className="ms-chip" id="imageHubAccountCount">{model.accountCountLabel}</span></div>;
}

function SidebarChromeController() {
  const [model, setModel] = useState<SidebarChromeModel>(DEFAULT_MODEL);
  useEffect(() => {
    const onState = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (!detail || typeof detail !== 'object') return;
      const next = detail as Partial<SidebarChromeModel>;
      setModel({
        search: typeof next.search === 'string' ? next.search.slice(0, 200) : '',
        listTitle: typeof next.listTitle === 'string' ? next.listTitle.slice(0, 140) : 'All accounts',
        accountCountLabel: typeof next.accountCountLabel === 'string' ? next.accountCountLabel.slice(0, 80) : '0 accounts',
        collapsed: next.collapsed === true,
        notificationCount: Number.isFinite(next.notificationCount) ? Math.max(0, Math.min(9999, Number(next.notificationCount))) : 0,
      });
    };
    window.addEventListener('madstation:image-hub-sidebar-chrome-state', onState);
    window.dispatchEvent(new Event('madstation:image-hub-sidebar-chrome-mounted'));
    return () => window.removeEventListener('madstation:image-hub-sidebar-chrome-state', onState);
  }, []);

  const brandHost = document.getElementById('imageHubSidebarBrandReactMount');
  const actionsHost = document.getElementById('imageHubSidebarActionsReactMount');
  const searchHost = document.getElementById('imageHubSearchReactMount');
  const headingHost = document.getElementById('imageHubSidebarListHeadingReactMount');
  return <>
    {brandHost ? createPortal(<SidebarBrand />, brandHost) : null}
    {actionsHost ? createPortal(<SidebarActions model={model} />, actionsHost) : null}
    {searchHost ? createPortal(<SearchBox model={model} />, searchHost) : null}
    {headingHost ? createPortal(<ListHeading model={model} />, headingHost) : null}
  </>;
}

function mountSidebarChrome(): void {
  const host = document.getElementById('imageHubSidebarChromeControllerMount');
  if (!(host instanceof HTMLElement)) return;
  const root: Root = createRoot(host);
  root.render(<SidebarChromeController />);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountSidebarChrome, { once: true });
else mountSidebarChrome();

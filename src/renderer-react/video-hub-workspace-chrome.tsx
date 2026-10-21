import { createRoot, type Root } from 'react-dom/client';
import { useLayoutEffect } from 'react';

export interface VideoHubChromeAccount {
  id: string;
  name: string;
  hostname: string;
  iconCandidates: string[];
}

export interface VideoHubWorkspaceChromeModel {
  activeTab: 'studio' | 'accounts';
  collapsed: boolean;
  accountCount: number;
  providerCount: number;
  pinnedCount: number;
  notificationsCount: number;
  activeAccount: VideoHubChromeAccount | null;
  loading: boolean;
  iconGeneration: number;
}

export interface VideoHubWorkspaceChromeBridge {
  attachHeaderRenderer(renderer: (model: VideoHubWorkspaceChromeModel) => void): void;
  attachToolbarRenderer(renderer: (model: VideoHubWorkspaceChromeModel) => void): void;
  attachStatsRenderer(renderer: (model: VideoHubWorkspaceChromeModel) => void): void;
  bindIconFallbacks(root: HTMLElement): void;
  action(action: string, value?: string, anchor?: HTMLElement): void;
}

declare global {
  interface Window { MadStationVideoHubChrome?: VideoHubWorkspaceChromeBridge; }
}

function ToggleSidebarIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h10M4 18h16"/><path d="M18 9l-3 3 3 3"/></svg>;
}

function WorkspaceHeader({ model, bridge }: { model: VideoHubWorkspaceChromeModel; bridge: VideoHubWorkspaceChromeBridge }) {
  return (
    <>
      <button className="ms-icon-btn" id="videoHubSidebarToggle" type="button" aria-label={model.collapsed ? 'Show account list' : 'Hide account list'} aria-pressed={model.collapsed} title={model.collapsed ? 'Show account list' : 'Hide account list'} onClick={() => bridge.action('toggle-sidebar')}><ToggleSidebarIcon /></button>
      <div className="ms-tabs video-hub-tabs" role="tablist" aria-label="Video Hub sections">
        <button className={`ms-tab video-hub-tab${model.activeTab === 'studio' ? ' is-active' : ''}`} type="button" role="tab" aria-selected={model.activeTab === 'studio'} data-video-hub-tab="studio" onClick={() => bridge.action('tab', 'studio')}>Video Studio</button>
        <button className={`ms-tab video-hub-tab${model.activeTab === 'accounts' ? ' is-active' : ''}`} type="button" role="tab" aria-selected={model.activeTab === 'accounts'} data-video-hub-tab="accounts" onClick={() => bridge.action('tab', 'accounts')}>Add Accounts</button>
      </div>
      <div className="ms-brand">
        <span className="ms-brand-text"><span className="ms-brand-name">Video Hub</span><span className="ms-brand-tag">Free AI video generators · one login per account</span></span>
      </div>
    </>
  );
}

function GenericAccountIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/></svg>;
}
function ActiveAccountIcon({ account }: { account: VideoHubChromeAccount | null }) {
  const candidates = account?.iconCandidates || [];
  const first = candidates[0] || '';
  if (!account || !first) return <GenericAccountIcon />;
  return <img className="provider-icon-img video-hub-real-icon ms-browser-address-icon" src={first} data-icon-candidates={encodeURIComponent(JSON.stringify(candidates))} data-icon-index="0" data-icon-cache-tried="" draggable={false} alt="" aria-hidden="true" referrerPolicy="no-referrer" />;
}
function BrowserToolbar({ model, bridge }: { model: VideoHubWorkspaceChromeModel; bridge: VideoHubWorkspaceChromeBridge }) {
  useLayoutEffect(() => {
    const root = document.getElementById('videoHubBrowserToolbarReactMount');
    if (root instanceof HTMLElement) {
      bridge.bindIconFallbacks(root);
      root.classList.toggle('is-loading', model.loading);
      root.setAttribute('aria-busy', String(model.loading));
    }
  }, [bridge, model.activeAccount, model.iconGeneration, model.loading]);
  const active = model.activeAccount;
  return (
    <>
      <div className="video-hub-browser-actions ms-browser-nav" role="group" aria-label="Page navigation">
        {(['back', 'forward', 'refresh'] as const).map((action) => <button key={action} className="ms-btn ms-btn--sm ms-browser-tool-btn" type="button" data-video-hub-nav={action} aria-label={action === 'refresh' ? 'Refresh page' : action === 'back' ? 'Go back' : 'Go forward'} title={action === 'refresh' ? 'Refresh page' : action === 'back' ? 'Go back' : 'Go forward'} disabled={!active} onClick={() => bridge.action('navigate', action)}>
          {action === 'back' ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg> : action === 'forward' ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg> : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5"/><path d="M19 12a7 7 0 0 0-12-4L4 11"/><path d="M4 17v-5h5"/><path d="M5 12a7 7 0 0 0 12 4l3-3"/></svg>}
        </button>)}
      </div>
      <div className="ms-browser-address video-hub-active-copy" role="group" aria-label="Active Video Hub account and website">
        <span className="ms-browser-address-icon-wrap" id="videoHubActiveIcon" aria-hidden="true"><ActiveAccountIcon account={active} /></span>
        <svg className="ms-browser-address-lock" id="videoHubActiveSecurity" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
        <span id="videoHubActiveSite" className="ms-browser-address-location ms-muted">{active?.hostname || 'Add an account to begin'}</span>
        <span id="videoHubActiveLabel" className="ms-browser-address-account">{active?.name || 'No account selected'}</span>
      </div>
      <button className="ms-btn ms-btn--sm ms-browser-open-external video-hub-open-external-btn" id="videoHubOpenExternalBtn" type="button" disabled={!active} onClick={() => bridge.action('open-external')}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6"/></svg><span>Open in browser</span></button>
    </>
  );
}
function WorkspaceStats({ model }: { model: VideoHubWorkspaceChromeModel }) {
  return <>
    <div className="ms-stat"><span>Accounts</span><strong id="videoHubStatAccounts">{model.accountCount}</strong></div>
    <div className="ms-stat"><span>Video sites</span><strong id="videoHubStatSites">{model.providerCount}</strong></div>
    <div className="ms-stat"><span>Pinned</span><strong id="videoHubStatPinned">{model.pinnedCount}</strong></div>
  </>;
}

function mountVideoHubWorkspaceChrome() {
  const bridge = window.MadStationVideoHubChrome;
  const headerHost = document.getElementById('videoHubHeaderReactMount');
  const toolbarHost = document.getElementById('videoHubBrowserToolbarReactMount');
  const statsHost = document.getElementById('videoHubStatsReactMount');
  if (!bridge || !(headerHost instanceof HTMLElement) || !(toolbarHost instanceof HTMLElement) || !(statsHost instanceof HTMLElement)) return;
  const headerRoot: Root = createRoot(headerHost);
  const toolbarRoot: Root = createRoot(toolbarHost);
  const statsRoot: Root = createRoot(statsHost);
  bridge.attachHeaderRenderer((model) => headerRoot.render(<WorkspaceHeader model={model} bridge={bridge} />));
  bridge.attachToolbarRenderer((model) => toolbarRoot.render(<BrowserToolbar model={model} bridge={bridge} />));
  bridge.attachStatsRenderer((model) => statsRoot.render(<WorkspaceStats model={model} />));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountVideoHubWorkspaceChrome, { once: true });
else mountVideoHubWorkspaceChrome();

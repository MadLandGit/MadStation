import { createRoot, type Root } from 'react-dom/client';
import { useEffect, useLayoutEffect, useState } from 'react';

export interface ImageHubBrowserToolbarModel {
  activeAccountId: string;
  activeAccountName: string;
  iconCandidates: string[];
  siteHost: string;
  siteRest: string;
  siteTitle: string;
  secure: boolean | null;
  canGoBack: boolean;
  canGoForward: boolean;
  canReload: boolean;
  loading: boolean;
  canOpenExternal: boolean;
}

export interface ImageHubBrowserToolbarBridge {
  bindIconFallbacks(root: HTMLElement): void;
}

declare global {
  interface Window { MadStationImageHubToolbar?: ImageHubBrowserToolbarBridge; }
}

const EMPTY_MODEL: ImageHubBrowserToolbarModel = {
  activeAccountId: '', activeAccountName: '', iconCandidates: [], siteHost: '', siteRest: '',
  siteTitle: '', secure: null, canGoBack: false, canGoForward: false, canReload: false,
  loading: false, canOpenExternal: false,
};

function emitAction(action: 'back' | 'forward' | 'reload' | 'open-external'): void {
  window.dispatchEvent(new CustomEvent('madstation:image-hub-toolbar-action', { detail: { action } }));
}

function GenericAccountIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/></svg>;
}

function ActiveAccountIcon({ model }: { model: ImageHubBrowserToolbarModel }) {
  const candidates = model.iconCandidates;
  const first = candidates[0] || '';
  if (!model.activeAccountId || !first) return <GenericAccountIcon />;
  return <img
    className={`provider-icon-img image-hub-real-icon ms-browser-address-icon${first.startsWith('data:image/svg+xml') ? ' provider-icon-default' : ''}`}
    src={first}
    data-icon-candidates={encodeURIComponent(JSON.stringify(candidates))}
    data-icon-index="0"
    data-icon-cache-tried=""
    draggable={false}
    alt=""
    aria-hidden="true"
    referrerPolicy="no-referrer"
  />;
}

function BrowserToolbar({ model, bridge }: { model: ImageHubBrowserToolbarModel; bridge: ImageHubBrowserToolbarBridge }) {
  useLayoutEffect(() => {
    const root = document.getElementById('imageHubBrowserToolbar');
    if (root instanceof HTMLElement) {
      bridge.bindIconFallbacks(root);
      root.classList.toggle('is-loading', model.loading);
      root.setAttribute('aria-busy', String(model.loading));
    }
  }, [bridge, model.activeAccountId, model.iconCandidates, model.loading]);

  return <>
    <div className="image-hub-browser-actions ms-browser-nav" role="group" aria-label="Page navigation">
      <button className="ms-btn ms-btn--sm ms-browser-tool-btn" type="button" id="imageHubBrowserBack" data-image-hub-nav="back" aria-label="Go back" title="Go back" disabled={!model.canGoBack} onClick={() => emitAction('back')}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <button className="ms-btn ms-btn--sm ms-browser-tool-btn" type="button" id="imageHubBrowserForward" data-image-hub-nav="forward" aria-label="Go forward" title="Go forward" disabled={!model.canGoForward} onClick={() => emitAction('forward')}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>
      </button>
      <button className={`ms-btn ms-btn--sm ms-browser-tool-btn${model.loading ? ' is-stop' : ''}`} type="button" id="imageHubBrowserReload" data-image-hub-nav="reload" aria-label={model.loading ? 'Stop loading' : 'Refresh page'} title={model.loading ? 'Stop loading' : 'Refresh page'} disabled={!model.canReload} onClick={() => emitAction('reload')}>
        {model.loading
          ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
          : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5"/><path d="M19 12a7 7 0 0 0-12-4L4 11"/><path d="M4 17v-5h5"/><path d="M5 12a7 7 0 0 0 12 4l3-3"/></svg>}
      </button>
    </div>
    <div className="ms-browser-address image-hub-active-copy" role="group" aria-label="Active Image Hub account and website">
      <span className="ms-browser-address-icon-wrap" id="imageHubActiveIcon" aria-hidden="true"><ActiveAccountIcon model={model} /></span>
      <svg className={`ms-browser-address-lock${model.siteHost ? '' : ' hidden'}${model.siteHost && model.secure === false ? ' is-insecure' : ''}`} id="imageHubActiveSecurity" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
      <span id="imageHubActiveSite" className={`ms-browser-address-location${model.siteHost ? '' : ' ms-muted'}`} title={model.siteTitle}>
        {model.siteHost ? <><strong>{model.siteHost}</strong>{model.siteRest ? <span className="ms-muted">{model.siteRest}</span> : null}</> : (model.activeAccountId ? 'Select the account to open its site' : 'Add an account to begin')}
      </span>
      <span id="imageHubActiveLabel" className={`ms-browser-address-account${model.activeAccountId ? '' : ' hidden'}`}>{model.activeAccountName || 'No account selected'}</span>
    </div>
    <button className="ms-btn ms-btn--sm ms-browser-open-external image-hub-open-external-btn" id="imageHubBrowserExternal" data-image-hub-nav="open-external" type="button" disabled={!model.canOpenExternal} onClick={() => emitAction('open-external')}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6"/></svg><span>Open in browser</span>
    </button>
  </>;
}

function ImageHubBrowserToolbarApp({ bridge }: { bridge: ImageHubBrowserToolbarBridge }) {
  const [model, setModel] = useState<ImageHubBrowserToolbarModel>(EMPTY_MODEL);
  useEffect(() => {
    const onState = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (!detail || typeof detail !== 'object') return;
      const value = detail as Partial<ImageHubBrowserToolbarModel>;
      setModel({
        ...EMPTY_MODEL,
        activeAccountId: typeof value.activeAccountId === 'string' ? value.activeAccountId : '',
        activeAccountName: typeof value.activeAccountName === 'string' ? value.activeAccountName : '',
        iconCandidates: Array.isArray(value.iconCandidates) ? value.iconCandidates.filter((item): item is string => typeof item === 'string') : [],
        siteHost: typeof value.siteHost === 'string' ? value.siteHost : '',
        siteRest: typeof value.siteRest === 'string' ? value.siteRest : '',
        siteTitle: typeof value.siteTitle === 'string' ? value.siteTitle : '',
        secure: typeof value.secure === 'boolean' ? value.secure : null,
        canGoBack: value.canGoBack === true,
        canGoForward: value.canGoForward === true,
        canReload: value.canReload === true,
        loading: value.loading === true,
        canOpenExternal: value.canOpenExternal === true,
      });
    };
    window.addEventListener('madstation:image-hub-toolbar-state', onState);
    window.dispatchEvent(new Event('madstation:image-hub-toolbar-mounted'));
    return () => window.removeEventListener('madstation:image-hub-toolbar-state', onState);
  }, []);
  return <BrowserToolbar model={model} bridge={bridge} />;
}

function mountImageHubBrowserToolbar() {
  const host = document.getElementById('imageHubBrowserToolbar');
  const bridge = window.MadStationImageHubToolbar;
  if (!(host instanceof HTMLElement) || !bridge) return;
  const root: Root = createRoot(host);
  root.render(<ImageHubBrowserToolbarApp bridge={bridge} />);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountImageHubBrowserToolbar, { once: true });
else mountImageHubBrowserToolbar();

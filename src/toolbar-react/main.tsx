import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { ToolbarNavigationAction, ToolbarState } from '../shared/api-contract';
import './toolbar.css';

type IconName = 'sidebar' | 'back' | 'forward' | 'reload' | 'stop' | 'external' | 'lock' | 'warning';

function Icon({ name }: { name: IconName }) {
  switch (name) {
    case 'sidebar':
      return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h10M4 18h16" /> <path d="m18 9-3 3 3 3" /></svg>;
    case 'back': return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7" /></svg>;
    case 'forward': return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>;
    case 'reload': return <svg className="ico-reload" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.6-5.9" /><path d="M20 4v5h-5" /></svg>;
    case 'stop': return <svg className="ico-stop" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>;
    case 'external': return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>;
    case 'lock': return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>;
    case 'warning': return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 4 9 16H3L12 4Z" /><path d="M12 10v4m0 3v.01" /></svg>;
  }
}

function safeIconSource(state: ToolbarState): string | null {
  const icon = state.accountIcon.trim();
  if (/^data:image\/(?:png|jpe?g|gif|webp|svg\+xml);/i.test(icon)) return icon;
  if (state.remoteIcons && /^https:\/\//i.test(icon)) return icon;
  return null;
}

function readAddress(rawUrl: string) {
  if (!rawUrl) return { host: 'Nothing open', path: '', scheme: '' as '' | 'https' | 'http' };
  try {
    const url = new URL(rawUrl);
    return {
      host: url.hostname.replace(/^www\./, '') || 'Nothing open',
      path: `${url.pathname === '/' ? '' : url.pathname}${url.search}`.slice(0, 80),
      scheme: url.protocol === 'https:' ? 'https' as const : url.protocol === 'http:' ? 'http' as const : '' as const,
    };
  } catch {
    return { host: rawUrl.slice(0, 80), path: '', scheme: '' as const };
  }
}

function Toolbar() {
  const [state, setState] = useState<ToolbarState | null>(null);
  const [actionError, setActionError] = useState('');
  const [iconFailed, setIconFailed] = useState(false);
  const address = useMemo(() => readAddress(state?.url ?? ''), [state?.url]);
  const iconSource = state ? safeIconSource(state) : null;
  useEffect(() => setIconFailed(false), [iconSource]);

  useEffect(() => {
    let receivedState = false;
    let mounted = true;
    const unsubscribeState = window.aiHubToolbar.onState((next) => {
      receivedState = true;
      if (mounted) setState(next);
    });
    const unsubscribeSidebar = window.aiHubToolbar.onSidebarState(({ hidden }) => {
      if (mounted) setState((current) => current ? { ...current, sidebarHidden: hidden } : current);
    });
    void window.aiHubToolbar.getState().then((next) => {
      if (mounted && !receivedState && 'hasAccount' in next) setState(next);
    }).catch(() => {
      if (mounted) setActionError('Toolbar status is temporarily unavailable.');
    });
    return () => {
      mounted = false;
      unsubscribeState();
      unsubscribeSidebar();
    };
  }, []);

  useEffect(() => {
    if (state) window.applyAppearance(state);
  }, [state]);

  const run = async (operation: () => Promise<unknown>) => {
    setActionError('');
    try {
      await operation();
    } catch {
      setActionError('That action could not be completed.');
    }
  };
  const navigate = (action: ToolbarNavigationAction) => run(() => window.aiHubToolbar.navigate(action));
  const canBrowse = Boolean(state?.hasAccount);
  const reloadTitle = state?.loading ? 'Stop loading' : 'Reload (Ctrl+R)';
  const sidebarLabel = state?.sidebarHidden ? 'Show sidebar' : 'Hide sidebar';

  return (
    <div className="toolbar" role="toolbar" aria-label="Browser controls" aria-busy={Boolean(state?.loading && canBrowse)}>
      <button
        className={`tb-btn tb-sidebar-toggle${state?.sidebarHidden ? ' is-sidebar-hidden' : ''}`}
        id="tbSidebar" type="button" title={sidebarLabel} aria-label={sidebarLabel}
        onClick={() => run(async () => {
          const result = state?.sidebarHidden
            ? await window.aiHubToolbar.showSidebar()
            : await window.aiHubToolbar.toggleSidebar();
          const hidden = result.hidden;
          if (result.ok && typeof hidden === 'boolean') {
            setState((current) => current ? { ...current, sidebarHidden: hidden } : current);
          }
        })}
      >
        <Icon name="sidebar" />
      </button>

      <div className="tb-nav" aria-label="Page navigation">
        <button className="tb-btn" id="tbBack" type="button" title="Back (Alt+Left)" aria-label="Back" disabled={!canBrowse || !state?.canGoBack} onClick={() => void navigate('back')}><Icon name="back" /></button>
        <button className="tb-btn" id="tbForward" type="button" title="Forward (Alt+Right)" aria-label="Forward" disabled={!canBrowse || !state?.canGoForward} onClick={() => void navigate('forward')}><Icon name="forward" /></button>
        <button className={`tb-btn${state?.loading ? ' loading' : ''}`} id="tbReload" type="button" title={reloadTitle} aria-label={state?.loading ? 'Stop loading' : 'Reload'} disabled={!canBrowse} onClick={() => void navigate(state?.loading ? 'stop' : 'reload')}><Icon name="reload" /><Icon name="stop" /></button>
      </div>

      <div className="tb-address" id="tbAddress" title={state?.hasAccount ? [state.title, state.url].filter(Boolean).join('\n') : ''}>
        <span className="tb-site-icon" id="tbIcon">
          {state?.hasAccount && iconSource && !iconFailed
            ? <img className="tb-icon-img" src={iconSource} alt="" referrerPolicy="no-referrer" onError={() => setIconFailed(true)} />
            : state?.hasAccount ? <svg className="tb-icon-default" viewBox="0 0 48 48" aria-hidden="true"><rect x="2" y="2" width="44" height="44" rx="12" fill="#161b2b" /><path d="M24 7l3.1 9.9L37 20l-9.9 3.1L24 33l-3.1-9.9L11 20l9.9-3.1L24 7z" fill="#8b7cff" /></svg>
            : null}
        </span>
        <span className="tb-url">
          <span className={`tb-secure${address.scheme === 'http' ? ' warn' : ''}`} id="tbSecure" aria-label={address.scheme === 'https' ? 'Secure HTTPS connection' : address.scheme === 'http' ? 'Unencrypted HTTP connection' : undefined}>
            {address.scheme === 'https' ? <Icon name="lock" /> : address.scheme === 'http' ? <Icon name="warning" /> : null}
          </span>
          <span className="tb-host" id="tbHost">{address.host}</span><span className="tb-path" id="tbPath">{address.path}</span>
        </span>
        <span className={`tb-account${state?.hasAccount ? '' : ' hidden'}`} id="tbAccount">{state?.hasAccount ? state.accountName : ''}</span>
      </div>

      <button className="tb-btn tb-open" id="tbOpen" type="button" title="Open this page in your default browser" aria-label="Open in browser" disabled={!canBrowse || !state?.url} onClick={() => void run(() => window.aiHubToolbar.openExternal())}>
        <Icon name="external" /><span>Open in browser</span>
      </button>

      <div className={`tb-progress${state?.loading && canBrowse ? ' active' : ''}`} id="tbProgress" aria-hidden="true" />
      <div className="tb-window-controls" aria-label="Window controls">
        <button className="window-control window-minimize" id="tbWindowMinimizeBtn" type="button" aria-label="Minimize" title="Minimize" onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); }} onClick={() => void run(() => window.aiHubToolbar.windowMinimize())}>−</button>
        <button className="window-control window-maximize" id="tbWindowMaximizeBtn" type="button" aria-label="Maximize" title="Maximize" onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); }} onClick={() => void run(() => window.aiHubToolbar.windowToggleMaximize())}>□</button>
        <button className="window-control window-close" id="tbWindowCloseBtn" type="button" aria-label="Close" title="Close" onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); }} onClick={() => void run(() => window.aiHubToolbar.windowClose())}>×</button>
      </div>
      <span className="toolbar-action-error" role="status" aria-live="polite">{actionError}</span>
    </div>
  );
}

const mount = document.getElementById('toolbar-root');
if (!mount) throw new Error('Missing #toolbar-root mount.');
createRoot(mount).render(<StrictMode><Toolbar /></StrictMode>);

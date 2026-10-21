import { createRoot, type Root } from 'react-dom/client';
import { useEffect, useState } from 'react';

type BrowserState = { hasActiveAccount: boolean; hasBrowserView: boolean; error: string; loading: boolean };
const EMPTY_STATE: BrowserState = { hasActiveAccount: false, hasBrowserView: false, error: '', loading: false };

function VideoHubBrowserPlaceholder() {
  const [state, setState] = useState<BrowserState>(EMPTY_STATE);

  useEffect(() => {
    const onState = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (!detail || typeof detail !== 'object') return;
      const candidate = detail as Partial<BrowserState>;
      if (typeof candidate.hasActiveAccount !== 'boolean') return;
      setState({
        hasActiveAccount: candidate.hasActiveAccount,
        hasBrowserView: candidate.hasBrowserView === true,
        error: typeof candidate.error === 'string' ? candidate.error.slice(0, 300) : '',
        loading: candidate.loading === true,
      });
    };
    window.addEventListener('madstation:video-hub-browser-state', onState);
    window.dispatchEvent(new Event('madstation:video-hub-browser-state-mounted'));
    return () => window.removeEventListener('madstation:video-hub-browser-state', onState);
  }, []);

  if (state.hasBrowserView) return null;
  const failed = Boolean(state.error);
  const title = failed
    ? 'Video Hub could not open this browser'
    : state.hasActiveAccount
      ? (state.loading ? 'Loading video studio…' : 'Preparing video studio…')
      : 'Your video studio opens here';
  const message = state.error || (state.hasActiveAccount
    ? 'The embedded browser has not attached yet. You can retry opening this account.'
    : 'Select an account, sign in, and use the site normally. Its login stays separate from every other Video Hub account and from AI Hub.');

  return (
    <div className={`video-hub-browser-placeholder${failed ? ' is-error' : ''}`} id="videoHubBrowserPlaceholderReact" role={failed ? 'alert' : 'status'} aria-live="polite">
      <span className="video-hub-play-mark" aria-hidden="true">▶</span>
      <strong>{title}</strong>
      <span>{message}</span>
      {state.hasActiveAccount ? <button type="button" className="ms-btn ms-btn--sm" onClick={() => window.dispatchEvent(new CustomEvent('madstation:video-hub-browser-state-action', { detail: { type: 'retry' } }))}>Try again</button> : null}
    </div>
  );
}

function mountVideoHubBrowserPlaceholder(): void {
  const host = document.getElementById('videoHubBrowserStateReactMount');
  if (!(host instanceof HTMLElement)) return;
  const root: Root = createRoot(host);
  root.render(<VideoHubBrowserPlaceholder />);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountVideoHubBrowserPlaceholder, { once: true });
else mountVideoHubBrowserPlaceholder();

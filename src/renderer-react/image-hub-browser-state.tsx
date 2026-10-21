import { createRoot, type Root } from 'react-dom/client';
import { useEffect, useState } from 'react';

type BrowserStateKind = 'empty' | 'loading' | 'ready' | 'error';
interface BrowserStateModel { kind: BrowserStateKind; title?: string; message?: string; }
const DEFAULT_MODEL: BrowserStateModel = {
  kind: 'empty',
  title: 'Your image studio opens here',
  message: 'Add an account, pick a tool from the sidebar, and sign in as usual. Each account keeps its own separate login.',
};

function BrowserState() {
  const [model, setModel] = useState<BrowserStateModel>(DEFAULT_MODEL);
  useEffect(() => {
    const onState = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (!detail || typeof detail !== 'object') return;
      const candidate = detail as Partial<BrowserStateModel>;
      const kind: BrowserStateKind = ['empty', 'loading', 'ready', 'error'].includes(String(candidate.kind)) ? candidate.kind as BrowserStateKind : 'empty';
      setModel({
        kind,
        title: typeof candidate.title === 'string' ? candidate.title.slice(0, 160) : DEFAULT_MODEL.title,
        message: typeof candidate.message === 'string' ? candidate.message.slice(0, 500) : DEFAULT_MODEL.message,
      });
    };
    window.addEventListener('madstation:image-hub-browser-state', onState);
    window.dispatchEvent(new Event('madstation:image-hub-browser-state-mounted'));
    return () => window.removeEventListener('madstation:image-hub-browser-state', onState);
  }, []);

  if (model.kind === 'ready') return null;
  const loading = model.kind === 'loading';
  const error = model.kind === 'error';
  return <div className={`image-hub-browser-placeholder${error ? ' is-error' : ''}${loading ? ' is-loading' : ''}`} role={error ? 'alert' : 'status'} aria-live="polite">
    <span className="image-hub-play-mark" aria-hidden="true">
      {error ? <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5h.01"/></svg> : loading ? <svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v6h-6"/></svg> : <svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>}
    </span>
    <strong>{model.title || (loading ? 'Loading image studio…' : error ? 'This page could not be loaded' : DEFAULT_MODEL.title)}</strong>
    <span>{model.message || (loading ? 'Connecting to the selected image tool…' : error ? 'Check your connection and try reloading the page.' : DEFAULT_MODEL.message)}</span>
    {error ? <button type="button" className="ms-btn ms-btn--sm" onClick={() => window.dispatchEvent(new CustomEvent('madstation:image-hub-browser-state-action', { detail: { type: 'retry' } }))}>Try again</button> : null}
  </div>;
}

function mountImageHubBrowserState(): void {
  const host = document.getElementById('imageHubBrowserStateReactMount');
  if (!(host instanceof HTMLElement)) return;
  const root: Root = createRoot(host);
  root.render(<BrowserState />);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountImageHubBrowserState, { once: true });
else mountImageHubBrowserState();

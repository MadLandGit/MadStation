import { createRoot, type Root } from 'react-dom/client';
import { useEffect, useState } from 'react';

type ImageHubTab = 'studio' | 'accounts';
interface ImageHubWorkspaceChromeModel {
  tab: ImageHubTab;
  collapsed: boolean;
}
type ImageHubWorkspaceChromeAction =
  | { type: 'select-tab'; tab: ImageHubTab }
  | { type: 'toggle-sidebar' };

const DEFAULT_MODEL: ImageHubWorkspaceChromeModel = { tab: 'studio', collapsed: false };

function dispatch(action: ImageHubWorkspaceChromeAction): void {
  window.dispatchEvent(new CustomEvent<ImageHubWorkspaceChromeAction>(
    'madstation:image-hub-workspace-chrome-action', { detail: action },
  ));
}

function WorkspaceChrome({ model }: { model: ImageHubWorkspaceChromeModel }) {
  const sidebarLabel = model.collapsed ? 'Show sidebar' : 'Hide sidebar';
  return <header className="ms-header image-hub-header">
    <button
      className="ms-icon-btn"
      id="imageHubSidebarToggle"
      type="button"
      aria-label={sidebarLabel}
      aria-pressed={model.collapsed}
      title={sidebarLabel}
      onClick={() => dispatch({ type: 'toggle-sidebar' })}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h10M4 18h16"/><path d="M18 9l-3 3 3 3"/></svg>
    </button>
    <div className="ms-tabs image-hub-tabs" role="tablist" aria-label="Image Hub sections">
      <button
        className={`ms-tab image-hub-tab${model.tab === 'studio' ? ' is-active active' : ''}`}
        type="button" role="tab" aria-selected={model.tab === 'studio'}
        data-image-hub-tab="studio"
        onClick={() => dispatch({ type: 'select-tab', tab: 'studio' })}
      >Image Studio</button>
      <button
        className={`ms-tab image-hub-tab${model.tab === 'accounts' ? ' is-active active' : ''}`}
        type="button" role="tab" aria-selected={model.tab === 'accounts'}
        data-image-hub-tab="accounts"
        onClick={() => dispatch({ type: 'select-tab', tab: 'accounts' })}
      >Add Account</button>
    </div>
    <div className="ms-brand">
      <span className="ms-brand-text"><span className="ms-brand-name">Image Hub</span><span className="ms-brand-tag">AI image tools · generators, editors and upscalers</span></span>
    </div>
  </header>;
}

function ImageHubWorkspaceChromeApp() {
  const [model, setModel] = useState<ImageHubWorkspaceChromeModel>(DEFAULT_MODEL);
  useEffect(() => {
    const onState = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (!detail || typeof detail !== 'object') return;
      const candidate = detail as Partial<ImageHubWorkspaceChromeModel>;
      setModel({
        tab: candidate.tab === 'accounts' ? 'accounts' : 'studio',
        collapsed: candidate.collapsed === true,
      });
    };
    window.addEventListener('madstation:image-hub-workspace-chrome-state', onState);
    window.dispatchEvent(new Event('madstation:image-hub-workspace-chrome-mounted'));
    return () => window.removeEventListener('madstation:image-hub-workspace-chrome-state', onState);
  }, []);
  return <WorkspaceChrome model={model} />;
}

function mountImageHubWorkspaceChrome(): void {
  const host = document.getElementById('imageHubWorkspaceChromeReactMount');
  if (!(host instanceof HTMLElement)) return;
  const root: Root = createRoot(host);
  root.render(<ImageHubWorkspaceChromeApp />);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountImageHubWorkspaceChrome, { once: true });
else mountImageHubWorkspaceChrome();

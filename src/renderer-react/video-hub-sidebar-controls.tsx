import { createRoot, type Root } from 'react-dom/client';

function SearchGlyph() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>;
}

function ClearGlyph() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>;
}

/** React owns the sidebar controls; renderer.js retains filtering and account selection policy. */
function VideoHubSidebarControls() {
  return (
    <>
      <div className="search-wrap video-hub-search">
        <SearchGlyph />
        <input autoComplete="off" className="search" id="videoHubSearch" placeholder="Search accounts…" aria-label="Search video accounts" />
        <kbd id="videoHubSearchKbd">Ctrl K</kbd>
        <button aria-label="Clear search" className="search-clear hidden" id="videoHubSearchClear" title="Clear search" type="button"><ClearGlyph /></button>
      </div>
      <div className="org-bar">
        <button className="tiny-btn active" id="videoHubFilterAll" type="button" aria-pressed="true">All</button>
        <button className="tiny-btn" id="videoHubFilterPinned" type="button" aria-pressed="false">Pinned</button>
      </div>
    </>
  );
}

function mountVideoHubSidebarControls() {
  const host = document.getElementById('videoHubSidebarControlsReactMount');
  if (!(host instanceof HTMLElement) || host.dataset.reactMounted === 'true') return;
  host.dataset.reactMounted = 'true';
  const root: Root = createRoot(host);
  root.render(<VideoHubSidebarControls />);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountVideoHubSidebarControls, { once: true });
} else {
  mountVideoHubSidebarControls();
}

import { createRoot, type Root } from 'react-dom/client';

export interface VideoHubRecentAccount {
  id: string;
  name: string;
  providerName: string;
}

export interface VideoHubRecentModel {
  items: VideoHubRecentAccount[];
}

export interface VideoHubRecentBridge {
  attachReactRenderer(renderer: (model: VideoHubRecentModel) => void): void;
}

declare global {
  interface Window {
    MadStationVideoHubRecent?: VideoHubRecentBridge;
  }
}

function VideoHubRecentAccounts({ model }: { model: VideoHubRecentModel }) {
  if (model.items.length === 0) return null;

  return (
    <>
      <span className="ms-eyebrow">Recent</span>
      {model.items.map((account) => (
        <button
          className="ms-btn ms-btn--sm"
          type="button"
          data-video-hub-recent={account.id}
          title={account.providerName}
          key={account.id}
        >
          {account.name}
        </button>
      ))}
    </>
  );
}

function mountVideoHubRecent() {
  const host = document.getElementById('videoHubRecent');
  const bridge = window.MadStationVideoHubRecent;
  if (!(host instanceof HTMLElement) || !bridge) return;

  const root: Root = createRoot(host);
  bridge.attachReactRenderer((model) => root.render(<VideoHubRecentAccounts model={model} />));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountVideoHubRecent, { once: true });
else mountVideoHubRecent();

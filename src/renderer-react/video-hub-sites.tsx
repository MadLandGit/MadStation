import { createRoot, type Root } from 'react-dom/client';
import { useLayoutEffect } from 'react';

export interface VideoHubSiteView {
  id: string;
  name: string;
  note: string;
  count: number;
  hue: string;
  iconCandidates: string[];
}

export interface VideoHubSitesModel {
  sites: VideoHubSiteView[];
  emptyMessage: string;
  iconGeneration: number;
}

export interface VideoHubSitesBridge {
  attachReactRenderer(renderer: (model: VideoHubSitesModel) => void): void;
  bindIconFallbacks(root: HTMLElement): void;
}

declare global {
  interface Window {
    MadStationVideoHubSites?: VideoHubSitesBridge;
  }
}

function SiteIcon({ site }: { site: VideoHubSiteView }) {
  const candidates = site.iconCandidates;
  const first = candidates[0] || '';
  return (
    <img
      className="provider-icon-img video-hub-real-icon"
      src={first}
      data-icon-candidates={encodeURIComponent(JSON.stringify(candidates))}
      data-icon-index="0"
      data-icon-cache-tried=""
      draggable={false}
      alt=""
      referrerPolicy="no-referrer"
    />
  );
}

function VideoHubSiteCards({ model, bridge }: { model: VideoHubSitesModel; bridge: VideoHubSitesBridge }) {
  useLayoutEffect(() => {
    const host = document.getElementById('videoHubSiteGrid');
    if (host instanceof HTMLElement) bridge.bindIconFallbacks(host);
  }, [bridge, model.sites]);

  if (!model.sites.length) return <div className="ms-empty">{model.emptyMessage || 'No video sites available.'}</div>;

  return (
    <>
      {model.sites.map((site) => (
        <article className="ms-card video-hub-site-card" data-video-hub-site-id={site.id} key={`${site.id}:${model.iconGeneration}`}>
          <div className="ms-card-head">
            <span className={`ms-brand-tile ms-brand-tile--${site.hue}`} aria-hidden="true">
              <SiteIcon site={site} />
            </span>
            <div className="video-hub-site-copy">
              <strong>{site.name}</strong>
              <span className="ms-muted">{site.note}</span>
            </div>
          </div>
          <div className="video-hub-site-foot">
            <span className="ms-chip">{site.count} account{site.count === 1 ? '' : 's'}</span>
            <button className="ms-btn ms-btn--sm ms-btn--primary" type="button" data-video-hub-quick-add={site.id}>
              Add account
            </button>
          </div>
        </article>
      ))}
    </>
  );
}

function mountVideoHubSites() {
  const host = document.getElementById('videoHubSiteGrid');
  const bridge = window.MadStationVideoHubSites;
  if (!(host instanceof HTMLElement) || !bridge) return;

  const root: Root = createRoot(host);
  bridge.attachReactRenderer((model) => root.render(<VideoHubSiteCards model={model} bridge={bridge} />));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountVideoHubSites, { once: true });
else mountVideoHubSites();

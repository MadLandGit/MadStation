import { createRoot, type Root } from 'react-dom/client';
import { useLayoutEffect } from 'react';

export interface VideoHubProviderView {
  id: string;
  name: string;
  url: string;
  note: string;
  builtin: boolean;
  iconCandidates: string[];
}

export interface VideoHubProvidersModel {
  providers: VideoHubProviderView[];
  iconGeneration: number;
}

export interface VideoHubProvidersBridge {
  attachReactRenderer(renderer: (model: VideoHubProvidersModel) => void): void;
  bindIconFallbacks(root: HTMLElement): void;
  removeProvider(id: string): void | Promise<void>;
}

declare global {
  interface Window {
    MadStationVideoHubProviders?: VideoHubProvidersBridge;
  }
}

function ProviderIcon({ provider }: { provider: VideoHubProviderView }) {
  const candidates = provider.iconCandidates;
  const initial = candidates[0] || '';
  return (
    <img
      className={`provider-icon-img video-hub-real-icon${initial.startsWith('data:image/svg+xml') ? ' provider-icon-default' : ''}`}
      src={initial}
      data-icon-candidates={encodeURIComponent(JSON.stringify(candidates))}
      data-icon-index="0"
      data-icon-cache-tried=""
      draggable={false}
      alt=""
      aria-hidden="true"
      referrerPolicy="no-referrer"
    />
  );
}

function VideoHubProviderRows({ model, bridge }: { model: VideoHubProvidersModel; bridge: VideoHubProvidersBridge }) {
  useLayoutEffect(() => {
    const host = document.getElementById('videoHubProviderList');
    if (host instanceof HTMLElement) bridge.bindIconFallbacks(host);
  }, [bridge, model.providers, model.iconGeneration]);

  if (model.providers.length === 0) return <div className="ms-empty">No video sites available.</div>;

  return (
    <>
      {model.providers.map((provider) => (
        <div
          className="ms-row video-hub-provider-row"
          data-video-hub-provider-id={provider.id}
          key={`${provider.id}:${model.iconGeneration}`}
        >
          <span className="video-hub-logo" aria-hidden="true"><ProviderIcon provider={provider} /></span>
          <span>
            <strong>{provider.name}</strong>
            <br />
            <span className="ms-muted">{provider.note || provider.url}</span>
          </span>
          {!provider.builtin ? (
            <button
              className="ms-btn ms-btn--sm"
              type="button"
              data-video-hub-delete-provider={provider.id}
              aria-label={`Remove ${provider.name}`}
              onClick={() => { void bridge.removeProvider(provider.id); }}
            >
              Remove
            </button>
          ) : null}
        </div>
      ))}
    </>
  );
}

function mountVideoHubProviders() {
  const host = document.getElementById('videoHubProviderList');
  const bridge = window.MadStationVideoHubProviders;
  if (!(host instanceof HTMLElement) || !bridge) return;

  const root: Root = createRoot(host);
  bridge.attachReactRenderer((model) => root.render(<VideoHubProviderRows model={model} bridge={bridge} />));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountVideoHubProviders, { once: true });
else mountVideoHubProviders();

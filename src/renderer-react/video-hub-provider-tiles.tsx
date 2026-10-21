import { createRoot, type Root } from 'react-dom/client';
import { useLayoutEffect } from 'react';

export interface VideoHubProviderTileView {
  id: string;
  name: string;
  count: number;
  iconKind: 'grid' | 'image';
  iconCandidates: string[];
}

export interface VideoHubProviderTilesModel {
  selectedProvider: string;
  iconGeneration: number;
  tiles: VideoHubProviderTileView[];
}

export interface VideoHubProviderTilesBridge {
  attachReactRenderer(renderer: (model: VideoHubProviderTilesModel) => void): void;
  bindIconFallbacks(root: HTMLElement): void;
}

declare global {
  interface Window {
    MadStationVideoHubProviderTiles?: VideoHubProviderTilesBridge;
  }
}

function ProviderIcon({ tile }: { tile: VideoHubProviderTileView }) {
  const candidates = tile.iconCandidates;
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
      referrerPolicy="no-referrer"
    />
  );
}

function GridIcon() {
  return (
    <svg className="video-hub-grid-glyph" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function ProviderTiles({ model, bridge }: { model: VideoHubProviderTilesModel; bridge: VideoHubProviderTilesBridge }) {
  useLayoutEffect(() => {
    const host = document.getElementById('videoHubProviderTiles');
    if (host instanceof HTMLElement) bridge.bindIconFallbacks(host);
  }, [bridge, model.tiles]);

  return (
    <>
      {model.tiles.map((tile) => {
        const selected = model.selectedProvider === tile.id;
        const accountLabel = `${tile.count} account${tile.count === 1 ? '' : 's'}`;
        return (
          <button
            className={`tile video-hub-provider-filter-tile${selected ? ' selected' : ''}`}
            type="button"
            role="tab"
            key={`${tile.id}:${model.iconGeneration}`}
            title={`${tile.name} · ${accountLabel}`}
            aria-label={`${tile.name} · ${accountLabel}`}
            data-video-hub-provider-filter={tile.id}
            aria-selected={selected}
          >
            <span className="tile-icon">{tile.iconKind === 'grid' ? <GridIcon /> : <ProviderIcon tile={tile} />}</span>
            <span className="tile-label">{tile.name}</span>
            <span className="tile-count">{tile.count}</span>
          </button>
        );
      })}
    </>
  );
}

function mountVideoHubProviderTiles() {
  const host = document.getElementById('videoHubProviderTiles');
  const bridge = window.MadStationVideoHubProviderTiles;
  if (!(host instanceof HTMLElement) || !bridge) return;

  const root: Root = createRoot(host);
  bridge.attachReactRenderer((model) => root.render(<ProviderTiles model={model} bridge={bridge} />));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountVideoHubProviderTiles, { once: true });
else mountVideoHubProviderTiles();

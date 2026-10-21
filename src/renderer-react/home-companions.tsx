import { createRoot, type Root } from 'react-dom/client';
import { useLayoutEffect, useRef, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';

export type HomeCompanionChip = string | { html: string };

export interface HomeCompanionApp {
  id: string;
  name: string;
  description: string;
  chips: HomeCompanionChip[];
  iconSvg: string;
  iconUrl: string;
  hue: number | null;
  paletteIndex: number;
  order: number | null;
  enabled: boolean;
}

export type HomeCompanionLayout = 'cards' | 'tiles' | 'stack';

export interface HomeCompanionsModel {
  revision: number;
  visibleApps: HomeCompanionApp[];
  hiddenApps: HomeCompanionApp[];
  layoutName: HomeCompanionLayout;
  appCount: number;
  moreDescription: string;
  moreOpen: boolean;
  panelPosition: { left: number; top: number; height: number };
  paletteSize: number;
  maxCardHeight: number;
  maxTileHeight: number;
  tileColumns: number;
}

export interface HomeAppsBridge {
  attachReactRenderer(renderer: (model: HomeCompanionsModel) => void): void;
  launch(id: string): void;
  launchTarget(target: string): void;
  openMore(anchor: HTMLButtonElement): void;
  closeMore(): void;
}

declare global {
  interface Window {
    MadHomeApps?: HomeAppsBridge;
    MadHomeCore?: { refresh(): void };
  }
}

const FALLBACK_ICON = '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"></rect><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"></rect><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"></rect><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"></rect>';
const MORE_ICON = '<circle cx="5.5" cy="12" r="1.6"></circle><circle cx="12" cy="12" r="1.6"></circle><circle cx="18.5" cy="12" r="1.6"></circle>';
const ARROW = '<path d="M5 12h14M13 6l6 6-6 6"></path>';
const ALLOWED_SVG_TAGS = new Set(['path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse']);
const ALLOWED_SVG_ATTRIBUTES = new Set([
  'd', 'cx', 'cy', 'r', 'x', 'y', 'width', 'height', 'rx', 'ry', 'x1', 'x2', 'y1', 'y2',
  'points', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
]);

function sanitizeSvgMarkup(markup: string): string {
  return markup.replace(/<\s*(\/?)\s*([a-z][a-z0-9:-]*)\b([^>]*)>/gi, (_match, close: string, rawTag: string, rawAttributes: string) => {
    const tag = String(rawTag).toLowerCase();
    if (!ALLOWED_SVG_TAGS.has(tag)) return '';
    if (close) return `</${tag}>`;
    const attributes: string[] = [];
    String(rawAttributes).replace(/([a-z][a-z0-9:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi, (_attributeMatch, rawName: string, doubleValue: string | undefined, singleValue: string | undefined) => {
      const name = String(rawName).toLowerCase();
      const value = doubleValue ?? singleValue ?? '';
      if (!ALLOWED_SVG_ATTRIBUTES.has(name)) return '';
      if (/[<>]/.test(value)) return '';
      attributes.push(`${name}="${value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`);
      return '';
    });
    const selfClosing = /\/\s*$/.test(String(rawAttributes));
    return `<${tag}${attributes.length ? ` ${attributes.join(' ')}` : ''}${selfClosing ? ' /' : ''}>`;
  });
}

function iconMarkup(app: HomeCompanionApp): string {
  return sanitizeSvgMarkup(app.iconSvg || FALLBACK_ICON);
}

function chipText(chip: HomeCompanionChip): string {
  // Old registry definitions allowed trusted markup for a chip. Custom entries
  // can originate in localStorage, so render only its text and never HTML.
  if (typeof chip === 'string') return chip;
  return String(chip.html || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').trim();
}

function icon(app: HomeCompanionApp, className: string) {
  if (app.iconUrl) return <img className={className} src={app.iconUrl} alt="" draggable={false} />;
  return <svg className={className} viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: iconMarkup(app) }} />;
}

function pointerGlow(event: ReactPointerEvent<HTMLElement>) {
  const rect = event.currentTarget.getBoundingClientRect();
  event.currentTarget.style.setProperty('--mx', `${event.clientX - rect.left}px`);
  event.currentTarget.style.setProperty('--my', `${event.clientY - rect.top}px`);
}

function moduleStyle(app: HomeCompanionApp, index: number, model: HomeCompanionsModel): CSSProperties {
  return Object.assign({} as CSSProperties, {
    '--mod': `var(--h-m${((app.hue ?? app.paletteIndex ?? index) % model.paletteSize) + 1})`,
    '--i': String(index),
    '--enter': `${0.12 + Math.min(index, 10) * 0.07}s`,
  });
}

function CompanionCard({ app, index, model, onLaunch }: {
  app: HomeCompanionApp;
  index: number;
  model: HomeCompanionsModel;
  onLaunch(id: string): void;
}) {
  return (
    <button
      className="home-module"
      type="button"
      data-app-id={app.id}
      title={app.name}
      style={moduleStyle(app, index, model)}
      onPointerMove={pointerGlow}
      onClick={() => onLaunch(app.id)}
    >
      <span className="home-module-in">
        <span className="home-module-icon" aria-hidden="true">{icon(app, '')}</span>
        <span className="home-module-go" aria-hidden="true"><svg viewBox="0 0 24 24"> <path d="M5 12h14M13 6l6 6-6 6" /></svg></span>
        <span className="home-module-body">
          <span className="home-module-copy"><strong>{app.name}</strong><span>{app.description}</span></span>
          <span className="home-chips">{app.chips.map((chip, chipIndex) => <span key={`${app.id}-chip-${chipIndex}`}>{chipText(chip)}</span>)}</span>
        </span>
      </span>
    </button>
  );
}

function MoreCard({ model, onOpenMore, onCloseMore }: {
  model: HomeCompanionsModel;
  onOpenMore(anchor: HTMLButtonElement): void;
  onCloseMore(): void;
}) {
  const onClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (model.moreOpen) onCloseMore();
    else onOpenMore(event.currentTarget);
  };
  const style = Object.assign({} as CSSProperties, {
    '--mod': 'var(--h-a)',
    '--i': String(model.appCount),
    '--enter': `${0.12 + Math.min(model.appCount, 10) * 0.07}s`,
  });

  return (
    <button
      className={`home-module home-module--more${model.moreOpen ? ' is-open' : ''}`}
      type="button"
      data-app-id="__more__"
      title="More apps"
      aria-haspopup="dialog"
      aria-expanded={model.moreOpen}
      style={style}
      onPointerMove={pointerGlow}
      onClick={onClick}
    >
      <span className="home-module-in">
        <span className="home-module-icon" aria-hidden="true"><svg viewBox="0 0 24 24" dangerouslySetInnerHTML={{ __html: MORE_ICON }} /></span>
        <span className="home-module-go" aria-hidden="true"><svg viewBox="0 0 24 24" dangerouslySetInnerHTML={{ __html: ARROW }} /></span>
        <span className="home-module-body">
          <span className="home-module-copy"><strong>More apps</strong><span>{model.moreDescription || 'Everything else wired to AI Hub.'}</span></span>
          <span className="home-chips"><span><b>{model.hiddenApps.length}</b> more</span></span>
        </span>
      </span>
    </button>
  );
}

function MoreAppsPanel({ model, onLaunch }: { model: HomeCompanionsModel; onLaunch(id: string): void }) {
  const style = Object.assign({} as CSSProperties, {
    '--panel-left': `${model.panelPosition.left}px`,
    '--panel-top': `${model.panelPosition.top}px`,
    '--panel-h': `${model.panelPosition.height}px`,
  });

  return createPortal(
    <div className="home-more-panel" role="dialog" aria-label="More apps" style={style}>
      <div className="home-more-head"><span>More apps</span><small>{model.hiddenApps.length} app{model.hiddenApps.length === 1 ? '' : 's'}</small></div>
      <div className="home-more-list">
        {model.hiddenApps.map((app, index) => (
          <button className="home-more-item" type="button" key={app.id} data-app-id={app.id} style={moduleStyle(app, index, model)} onClick={() => onLaunch(app.id)}>
            <span className="home-more-icon" aria-hidden="true">{icon(app, '')}</span>
            <span className="home-more-text"><strong>{app.name}</strong><span>{app.description}</span></span>
          </button>
        ))}
      </div>
    </div>,
    document.getElementById('launcherScreen') || document.body,
  );
}

function HomeCompanionsView({ model, bridge }: { model: HomeCompanionsModel; bridge: HomeAppsBridge }) {
  const lastRevision = useRef(-1);

  useLayoutEffect(() => {
    window.MadHomeCore?.refresh();
    if (lastRevision.current !== model.revision) {
      lastRevision.current = model.revision;
      document.dispatchEvent(new CustomEvent('mad:home-apps-built'));
    }
  }, [model]);

  return (
    <>
      {model.visibleApps.map((app, index) => <CompanionCard key={app.id} app={app} index={index} model={model} onLaunch={bridge.launch} />)}
      {model.hiddenApps.length > 0 ? <MoreCard model={model} onOpenMore={bridge.openMore} onCloseMore={bridge.closeMore} /> : null}
      {model.moreOpen ? <MoreAppsPanel model={model} onLaunch={bridge.launch} /> : null}
    </>
  );
}

function mountHomeCompanions() {
  const mount = document.getElementById('homeAppsReactMount');
  const bridge = window.MadHomeApps;
  if (!mount || !bridge) return;
  const root: Root = createRoot(mount);
  bridge.attachReactRenderer((model) => {
    root.render(<HomeCompanionsView model={model} bridge={bridge} />);
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountHomeCompanions, { once: true });
else mountHomeCompanions();

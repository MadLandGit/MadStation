import { createRoot, type Root } from 'react-dom/client';
import { useLayoutEffect, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';

export interface HomeMiniApp {
  id: string;
  name: string;
  iconSvg: string;
  launch: string;
  color: string;
  order: number | null;
  enabled: boolean;
}

export interface HomeMiniAppsModel {
  revision: number;
  apps: HomeMiniApp[];
}

export interface HomeMiniAppsBridge {
  attachReactRenderer(renderer: (model: HomeMiniAppsModel) => void): void;
}

declare global {
  interface Window {
    MadHomeMiniApps?: HomeMiniAppsBridge;
    MadHomeCore?: { refresh(): void };
  }
}

const ALLOWED_SVG_TAGS = new Set(['path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse']);
const ALLOWED_SVG_ATTRIBUTES = new Set([
  'd', 'cx', 'cy', 'r', 'x', 'y', 'width', 'height', 'rx', 'ry', 'x1', 'x2', 'y1', 'y2',
  'points', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
]);
const FALLBACK_ICON = '<rect x="4" y="4" width="16" height="16" rx="4"></rect>';

function sanitizeSvgMarkup(markup: string): string {
  return markup.replace(/<\s*(\/?)\s*([a-z][a-z0-9:-]*)\b([^>]*)>/gi, (_match, close: string, rawTag: string, rawAttributes: string) => {
    const tag = String(rawTag).toLowerCase();
    if (!ALLOWED_SVG_TAGS.has(tag)) return '';
    if (close) return `</${tag}>`;
    const attributes: string[] = [];
    String(rawAttributes).replace(/([a-z][a-z0-9:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi, (_attributeMatch, rawName: string, doubleValue: string | undefined, singleValue: string | undefined) => {
      const name = String(rawName).toLowerCase();
      const value = doubleValue ?? singleValue ?? '';
      if (!ALLOWED_SVG_ATTRIBUTES.has(name) || /[<>]/.test(value) || /\burl\s*\(/i.test(value)) return '';
      if ((name === 'fill' || name === 'stroke') && !/^(none|currentColor|transparent|#[0-9a-f]{3,8}|[a-z]{1,20})$/i.test(value)) return '';
      if (name === 'stroke-width' && !/^\d+(?:\.\d+)?$/.test(value)) return '';
      attributes.push(`${name}="${value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`);
      return '';
    });
    const selfClosing = /\/\s*$/.test(String(rawAttributes));
    return `<${tag}${attributes.length ? ` ${attributes.join(' ')}` : ''}${selfClosing ? ' /' : ''}>`;
  });
}

function pointerGlow(event: ReactPointerEvent<HTMLButtonElement>) {
  const bounds = event.currentTarget.getBoundingClientRect();
  event.currentTarget.style.setProperty('--mx', `${event.clientX - bounds.left}px`);
  event.currentTarget.style.setProperty('--my', `${event.clientY - bounds.top}px`);
}

function MiniAppTile({ app, index, count }: { app: HomeMiniApp; index: number; count: number }) {
  const style = Object.assign({} as CSSProperties, {
    '--mod': app.color || `var(--h-m${index % 6 + 1})`,
    '--mini-offset': `${(index - (count - 1) / 2) * 64}px`,
  });
  const markup = sanitizeSvgMarkup(app.iconSvg || FALLBACK_ICON);
  return (
    <button
      className="home-module home-mini-app-tile"
      type="button"
      data-app-id={app.id}
      title={app.name}
      aria-label={app.name}
      style={style}
      onPointerMove={pointerGlow}
      onClick={() => window.MadHomeApps?.launchTarget(app.launch)}
    >
      <span className="home-module-in">
        <span className="home-module-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" dangerouslySetInnerHTML={{ __html: markup }} />
        </span>
      </span>
    </button>
  );
}

function HomeMiniAppsView({ model }: { model: HomeMiniAppsModel }) {
  useLayoutEffect(() => {
    // Signal-line discovery reads rendered .home-mini-app-tile elements, so notify
    // Core only after React commits the subtree.
    document.dispatchEvent(new CustomEvent('mad:home-mini-apps-built', { detail: { revision: model.revision } }));
    window.MadHomeCore?.refresh();
  }, [model]);

  return <>{model.apps.map((app, index) => <MiniAppTile app={app} count={model.apps.length} index={index} key={app.id} />)}</>;
}

function mountHomeMiniApps() {
  const mount = document.getElementById('homeMiniApps');
  const bridge = window.MadHomeMiniApps;
  if (!mount || !bridge) return;
  const root: Root = createRoot(mount);
  bridge.attachReactRenderer((model) => root.render(<HomeMiniAppsView model={model} />));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountHomeMiniApps, { once: true });
else mountHomeMiniApps();

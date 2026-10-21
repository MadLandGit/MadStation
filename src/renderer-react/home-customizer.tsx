import { createRoot, type Root } from 'react-dom/client';
import { useEffect, useLayoutEffect, useRef, type FormEvent, type MouseEvent as ReactMouseEvent } from 'react';

export type HomeCustomizerKind = 'companions' | 'miniApps' | 'widgets';
export type HomeWidgetSize = 'small' | 'medium' | 'large';
export type HomeShortcutKind = 'companion' | 'mini';

export interface HomeCustomizerItem {
  id: string;
  name: string;
  enabled: boolean;
  order: number | null;
  size?: HomeWidgetSize;
}

export interface HomeCustomizerSection {
  kind: HomeCustomizerKind;
  title: string;
  items: HomeCustomizerItem[];
}

export interface HomeCustomizerTarget {
  id: string;
  label: string;
}

export interface HomeCustomizerModel {
  revision: number;
  isOpen: boolean;
  toast: string;
  targets: HomeCustomizerTarget[];
  sections: HomeCustomizerSection[];
}

export interface HomeCustomizerBridge {
  attachReactRenderer(renderer: (model: HomeCustomizerModel) => void): void;
  close(): void;
  setEnabled(kind: HomeCustomizerKind, id: string, enabled: boolean): void;
  move(kind: HomeCustomizerKind, id: string, delta: -1 | 1): void;
  setSize(kind: 'widgets', id: string, size: HomeWidgetSize): void;
  removeCustom(kind: Exclude<HomeCustomizerKind, 'widgets'>, id: string): void;
  addShortcut(input: { kind: HomeShortcutKind; name: string; target: string }): boolean;
  resetDefaults(): void;
}

declare global {
  interface Window {
    MadHomeCustomizer?: HomeCustomizerBridge;
  }
}

function isCustomItem(item: HomeCustomizerItem, kind: HomeCustomizerKind): boolean {
  return kind === 'companions'
    ? item.id.startsWith('custom-companion-')
    : kind === 'miniApps' && item.id.startsWith('custom-mini-');
}

function CustomizerRow({ section, item, index, bridge }: {
  section: HomeCustomizerSection;
  item: HomeCustomizerItem;
  index: number;
  bridge: HomeCustomizerBridge;
}) {
  const canRemove = isCustomItem(item, section.kind);
  const kind = section.kind;
  const previousLabel = `Move ${item.name} earlier`;
  const nextLabel = `Move ${item.name} later`;

  return (
    <div className="home-customize-row" data-customize-kind={kind} data-module-id={item.id}>
      <label className="home-customize-row-main">
        <input
          type="checkbox"
          checked={item.enabled}
          aria-label={`Show ${item.name}`}
          onChange={(event) => bridge.setEnabled(kind, item.id, event.currentTarget.checked)}
        />
        <span className="home-customize-row-name">{item.name || item.id}</span>
      </label>
      <div className="home-customize-row-actions">
        <button type="button" disabled={index === 0} title="Move earlier" aria-label={previousLabel} onClick={() => bridge.move(kind, item.id, -1)}>↑</button>
        <button type="button" disabled={index === section.items.length - 1} title="Move later" aria-label={nextLabel} onClick={() => bridge.move(kind, item.id, 1)}>↓</button>
        {kind === 'widgets' && (
          <select
            value={item.size || 'medium'}
            aria-label={`Size for ${item.name}`}
            onChange={(event) => bridge.setSize('widgets', item.id, event.currentTarget.value as HomeWidgetSize)}
          >
            <option value="small">small</option>
            <option value="medium">medium</option>
            <option value="large">large</option>
          </select>
        )}
        {canRemove && kind !== 'widgets' && (
          <button
            className="home-customize-remove"
            type="button"
            title="Remove custom shortcut"
            aria-label={`Remove ${item.name}`}
            onClick={() => bridge.removeCustom(kind, item.id)}
          >×</button>
        )}
      </div>
    </div>
  );
}

function CustomizerSection({ section, bridge }: { section: HomeCustomizerSection; bridge: HomeCustomizerBridge }) {
  return (
    <section className="home-customize-section">
      <h3>{section.title}</h3>
      <div className="home-customize-list" data-home-customize-list={section.kind}>
        {section.items.length === 0
          ? <p className="home-customize-empty">No modules registered yet.</p>
          : section.items.map((item, index) => (
            <CustomizerRow key={item.id} section={section} item={item} index={index} bridge={bridge} />
          ))}
      </div>
    </section>
  );
}

function HomeCustomizerView({ model, bridge }: { model: HomeCustomizerModel; bridge: HomeCustomizerBridge }) {
  const closeButton = useRef<HTMLButtonElement | null>(null);

  useLayoutEffect(() => {
    if (model.isOpen) closeButton.current?.focus({ preventScroll: true });
  }, [model.isOpen]);

  useEffect(() => {
    if (!model.isOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        bridge.close();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [model.isOpen, bridge]);

  function addShortcut(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const name = String(values.get('name') || '').trim();
    const kind = String(values.get('kind') || 'companion');
    const target = String(values.get('target') || '');
    if (kind !== 'companion' && kind !== 'mini') return;
    if (bridge.addShortcut({ kind, name, target })) {
      const nameField = form.elements.namedItem('name');
      if (nameField instanceof HTMLInputElement) nameField.value = '';
    }
  }

  function onOverlayMouseDown(event: ReactMouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) bridge.close();
  }

  return (
    <div id="homeCustomizeOverlay" className="home-customize-overlay" hidden={!model.isOpen} onMouseDown={onOverlayMouseDown}>
      <section className="home-customize-dialog" role="dialog" aria-modal="true" aria-labelledby="homeCustomizeTitle">
        <header className="home-customize-head">
          <div>
            <h2 id="homeCustomizeTitle">Customize your Home</h2>
            <p>Replace shortcuts, choose what appears, set the order, and resize performance panels.</p>
          </div>
          <button ref={closeButton} className="home-customize-close" type="button" aria-label="Close customization" onClick={() => bridge.close()}>×</button>
        </header>
        <div className="home-customize-body">
          {model.sections.map((section) => <CustomizerSection key={section.kind} section={section} bridge={bridge} />)}
        </div>
        <form className="home-customize-add" id="homeCustomizeAddForm" onSubmit={addShortcut}>
          <label className="home-customize-field">
            Shortcut type
            <select name="kind" defaultValue="companion">
              <option value="companion">Companion card</option>
              <option value="mini">Mini app tile</option>
            </select>
          </label>
          <label className="home-customize-field">
            Name
            <input name="name" maxLength={42} required autoComplete="off" placeholder="My shortcut" />
          </label>
          <label className="home-customize-field">
            Open workspace
            <select name="target" defaultValue={model.targets[0]?.id || 'ai-hub'}>
              {model.targets.map((target) => <option key={target.id} value={target.id}>{target.label}</option>)}
            </select>
          </label>
          <button className="home-customize-primary" type="submit">＋ Add shortcut</button>
        </form>
        <footer className="home-customize-foot">
          <p>Changes are saved on this device. Add shortcuts to any built-in workspace; hidden items remain available here.</p>
          <div>
            <span className="home-customize-toast" aria-live="polite">{model.toast}</span>{' '}
            <button className="home-customize-reset" type="button" onClick={() => bridge.resetDefaults()}>Reset defaults</button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function mountHomeCustomizer() {
  const mount = document.getElementById('homeCustomizerReactMount');
  const bridge = window.MadHomeCustomizer;
  if (!mount || !bridge) return;
  const root: Root = createRoot(mount);
  bridge.attachReactRenderer((model) => root.render(<HomeCustomizerView model={model} bridge={bridge} />));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountHomeCustomizer, { once: true });
else mountHomeCustomizer();

import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';

export type ContextMenuIcon = 'rename' | 'plus' | 'keyboard' | 'refresh' | 'reset' | 'trash' | 'arrowLeft' | 'arrowRight';

export interface ContextMenuItemModel {
  id: number;
  label: string;
  icon: ContextMenuIcon | null;
  danger: boolean;
  separator: boolean;
}

export interface ContextMenuModel {
  items: ContextMenuItemModel[];
}

export interface ContextMenuBridge {
  attachReactRenderer(renderer: (model: ContextMenuModel) => void): void;
  action(id: number): void;
}

declare global {
  interface Window {
    MadStationContextMenu?: ContextMenuBridge;
  }
}

function MenuIcon({ name }: { name: ContextMenuIcon | null }) {
  if (!name) return null;
  const props = { viewBox: '0 0 24 24', 'aria-hidden': true as const, focusable: false as const };
  switch (name) {
    case 'rename': return <svg {...props}><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></svg>;
    case 'plus': return <svg {...props}><path d="M12 5v14M5 12h14" /></svg>;
    case 'keyboard': return <svg {...props}><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10" /></svg>;
    case 'refresh': return <svg {...props}><path d="M20 12a8 8 0 1 1-2.6-5.9" /><path d="M20 4v5h-5" /></svg>;
    case 'reset': return <svg {...props}><path d="M20 12a8 8 0 1 1-2.6-5.9" /><path d="M20 4v5h-5" /></svg>;
    case 'trash': return <svg {...props}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>;
    case 'arrowLeft': return <svg {...props}><path d="M19 12H5M11 6l-6 6 6 6" /></svg>;
    case 'arrowRight': return <svg {...props}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
    default: return null;
  }
}

function ContextMenu({ model, bridge }: { model: ContextMenuModel; bridge: ContextMenuBridge }) {
  return <>
    {model.items.map((item) => item.separator
      ? <div className="ctx-sep" key={`separator-${item.id}`} role="separator" />
      : <button
        key={item.id}
        type="button"
        className={`ctx-item${item.danger ? ' danger' : ''}`}
        role="menuitem"
        onClick={() => bridge.action(item.id)}
      >
        <MenuIcon name={item.icon} />
        <span>{item.label}</span>
      </button>)}
  </>;
}

let root: Root | null = null;
let attachedBridge: ContextMenuBridge | null = null;

function mountContextMenu(): void {
  const bridge = window.MadStationContextMenu;
  const host = document.getElementById('ctxMenu');
  if (!bridge || !(host instanceof HTMLElement)) return;
  attachedBridge = bridge;
  root ??= createRoot(host);
  bridge.attachReactRenderer((model) => {
    if (!root || attachedBridge !== bridge) return;
    flushSync(() => root?.render(<ContextMenu model={model} bridge={bridge} />));
  });
}

mountContextMenu();

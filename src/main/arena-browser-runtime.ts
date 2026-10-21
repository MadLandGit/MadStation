/**
 * Model Arena browser lifecycle and user-facing navigation orchestration.
 * Electron view construction, permission/session hardening, event bindings, and
 * host geometry are injected so those privileged boundaries remain in main.js.
 */
import { attachAndRegisterWebContentsViewRuntime } from './web-contents-view-attachment-runtime';
import { closeWorkspaceBrowserViewRuntime } from './workspace-browser-view-runtime';

type Side = 'left' | 'right';
type Rect = { x: number; y: number; width: number; height: number } | null;
type UnknownRecord = Record<string, unknown>;
type ArenaAccount = { id: string; url: string; [key: string]: unknown };
type WebContentsLike = {
  isDestroyed(): boolean;
  canGoBack(): boolean;
  canGoForward(): boolean;
  goBack(): void;
  goForward(): void;
  getURL(): string;
  loadURL(url: string): Promise<unknown>;
  reload(): void;
  close(): void;
};
type BrowserViewLike = { webContents: WebContentsLike };
type ArenaStoreLike = { selected?: { left: string | null; right: string | null } };

export interface ArenaBrowserRuntimeDependencies<TView extends BrowserViewLike> {
  views: Map<string, TView>;
  models: { left: string | null; right: string | null };
  layout: { left: Rect; right: Rect };
  loadStore(): ArenaStoreLike;
  saveStore(): unknown;
  getAccount(id: unknown): (ArenaAccount & UnknownRecord) | null;
  runtimeAccount(account: ArenaAccount & UnknownRecord): ArenaAccount;
  getSession(account: ArenaAccount): unknown;
  createView(account: ArenaAccount, session: unknown): TView;
  hardenView(view: TView, account: ArenaAccount, session: unknown): void;
  bindEvents(view: TView, account: ArenaAccount): void;
  attachView(view: TView): void;
  detachView(view: TView): void;
  isWebContentsDestroyed(view: TView): boolean;
  closeWebContents(view: TView): void;
  positionViews(): void;
}

export function createArenaBrowserRuntime<TView extends BrowserViewLike>(dependencies: ArenaBrowserRuntimeDependencies<TView>) {
  const { views, models, layout } = dependencies;

  function createBrowserView(record: ArenaAccount & UnknownRecord): TView {
    const existing = views.get(record.id);
    if (existing) return existing;
    const account = dependencies.runtimeAccount(record);
    const session = dependencies.getSession(account);
    const view = dependencies.createView(account, session);
    dependencies.hardenView(view, account, session);
    dependencies.bindEvents(view, record);
    attachAndRegisterWebContentsViewRuntime(view, {
      initialNavigationTiming: 'before-attach',
      navigate: (candidate) => { void candidate.webContents.loadURL(account.url); },
      attach: dependencies.attachView,
      register: (candidate) => views.set(record.id, candidate),
    });
    return view;
  }

  function closeView(id: string) {
    return closeWorkspaceBrowserViewRuntime(id, {
      getView: (viewId) => views.get(viewId),
      detachView: dependencies.detachView,
      closeWebContents: dependencies.closeWebContents,
      forgetView: (viewId) => { views.delete(viewId); },
    });
  }

  function clearBrowserBindings() {
    models.left = null;
    models.right = null;
    layout.left = null;
    layout.right = null;
    for (const id of [...views.keys()]) closeView(id);
  }

  function suspendBrowsers() {
    layout.left = null;
    layout.right = null;
    for (const id of [...views.keys()]) closeView(id);
    return { ok: true };
  }

  async function setBrowserModels(input: unknown = {}) {
    const store = dependencies.loadStore();
    const modelsInput = input && typeof input === 'object' && !Array.isArray(input) ? input as UnknownRecord : {};
    const next: { left: string | null; right: string | null } = {
      left: typeof modelsInput.left === 'string' && modelsInput.left ? modelsInput.left : null,
      right: typeof modelsInput.right === 'string' && modelsInput.right ? modelsInput.right : null,
    };
    if (next.left && next.left === next.right) return { ok: false, error: 'Choose two different Arena accounts.' };
    for (const side of ['left', 'right'] as const) {
      if (next[side] && !dependencies.getAccount(next[side])) return { ok: false, error: 'Arena account not found.' };
    }
    const unchanged = store.selected?.left === next.left && store.selected?.right === next.right;
    models.left = next.left;
    models.right = next.right;
    store.selected = { left: next.left, right: next.right };
    if (!unchanged) dependencies.saveStore();
    // Keep only the selected two WebContentsViews alive; their persistent
    // session partitions preserve login state after the native view is closed.
    for (const id of [...views.keys()]) {
      if (id !== next.left && id !== next.right) closeView(id);
    }
    for (const side of ['left', 'right'] as const) {
      const record = next[side] ? dependencies.getAccount(next[side]) : null;
      if (record) createBrowserView(record);
    }
    dependencies.positionViews();
    return { ok: true, models: { ...models } };
  }

  async function navigateBrowser(sideInput: unknown, actionInput: unknown) {
    if ((sideInput !== 'left' && sideInput !== 'right') || !['back', 'forward', 'refresh'].includes(String(actionInput))) {
      return { ok: false, error: 'Invalid Arena browser navigation.' };
    }
    const side = sideInput as Side;
    const action = actionInput as 'back' | 'forward' | 'refresh';
    const id = models[side];
    const view = id ? views.get(id) : null;
    if (!view || dependencies.isWebContentsDestroyed(view)) return { ok: false, error: 'No browser selected for this side.' };
    try {
      const wc = view.webContents;
      if (action === 'back') {
        if (wc.canGoBack()) wc.goBack();
        else return { ok: false, error: 'No previous page.' };
      } else if (action === 'forward') {
        if (wc.canGoForward()) wc.goForward();
        else return { ok: false, error: 'No next page.' };
      } else {
        const currentUrl = wc.getURL();
        if (!currentUrl || currentUrl === 'about:blank') return { ok: false, error: 'This browser does not have a page to reload yet.' };
        await wc.loadURL(currentUrl);
      }
      return { ok: true, side, action };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Navigation failed.' };
    }
  }

  async function refreshBrowsers() {
    const refreshed: string[] = [];
    for (const side of ['left', 'right'] as const) {
      const id = models[side];
      const view = id ? views.get(id) : null;
      if (!view) continue;
      try { view.webContents.reload(); refreshed.push(id as string); } catch { /* ignore */ }
    }
    return { ok: true, refreshed };
  }

  function setBrowserLayout(input: unknown = {}) {
    const before = JSON.stringify(layout);
    const value = input && typeof input === 'object' && !Array.isArray(input) ? input as UnknownRecord : {};
    for (const side of ['left', 'right'] as const) {
      const raw = value[side] && typeof value[side] === 'object' ? value[side] as UnknownRecord : null;
      layout[side] = raw && Number.isFinite(Number(raw.x)) && Number.isFinite(Number(raw.y)) && Number(raw.width) > 8 && Number(raw.height) > 8
        ? { x: Number(raw.x), y: Number(raw.y), width: Number(raw.width), height: Number(raw.height) }
        : null;
    }
    if (JSON.stringify(layout) !== before) dependencies.positionViews();
    return { ok: true };
  }

  return { createBrowserView, closeView, clearBrowserBindings, suspendBrowsers, setBrowserModels, navigateBrowser, refreshBrowsers, setBrowserLayout };
}

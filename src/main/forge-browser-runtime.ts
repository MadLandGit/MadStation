/** Instruction Forge browser/session view orchestration over injected Electron edges. */
import { attachAndRegisterWebContentsViewRuntime } from './web-contents-view-attachment-runtime';
import { closeWorkspaceBrowserViewRuntime } from './workspace-browser-view-runtime';
import { planViewPrune } from './browser-view-policy';

type UnknownRecord = Record<string, unknown>;
type ForgeAccount = { id: string; name: string; url: string; serviceId: string; [key: string]: unknown };
type Rect = { x: number; y: number; width: number; height: number } | null;
type ForgeWebContents = {
  isDestroyed(): boolean;
  getURL(): string;
  getTitle(): string;
  isLoading(): boolean;
  focus(): void;
  reload(): void;
};
type ForgeView = { webContents: ForgeWebContents };

export interface ForgeBrowserRuntimeDependencies<TView extends ForgeView, TAccount extends ForgeAccount> {
  views: Map<string, TView>;
  layout: { main: Rect };
  getSelectedAccountId(): string | null;
  setSelectedAccountId(id: string | null): void;
  getAccount(id: unknown): TAccount | null;
  getServiceName(serviceId: unknown): string;
  getWorkspaceApp(): string;
  isLocked(): boolean;
  maxLiveViews: number;
  getLastVisitedAt(id: string): number;
  setLastVisitedAt(id: string, timestamp: number): void;
  now?(): number;
  createNativeView(account: TAccount): TView;
  loadUrl(view: TView, url: string): void;
  attachView(view: TView): void;
  detachView(view: TView): void;
  closeWebContents(view: TView): void;
  isWebContentsDestroyed(view: TView): boolean;
  positionViews(): void;
  notifyState(state: UnknownRecord): void;
  canGoBack(view: TView): boolean;
  canGoForward(view: TView): boolean;
  goBack(view: TView): unknown;
  goForward(view: TView): unknown;
}

export function createForgeBrowserRuntime<TView extends ForgeView, TAccount extends ForgeAccount>(dependencies: ForgeBrowserRuntimeDependencies<TView, TAccount>) {
  const { views, layout } = dependencies;
  const now = dependencies.now || Date.now;

  function stateForRenderer(): UnknownRecord {
    const id = dependencies.getSelectedAccountId();
    const account = id ? dependencies.getAccount(id) : null;
    const view = id ? views.get(id) : null;
    const wc = view && !dependencies.isWebContentsDestroyed(view) ? view.webContents : null;
    return {
      ok: true,
      accountId: id || null,
      accountName: account?.name || '',
      providerName: account ? dependencies.getServiceName(account.serviceId) : '',
      url: wc ? wc.getURL() : account?.url || '',
      title: wc ? wc.getTitle() : '',
      loading: Boolean(wc?.isLoading?.()),
    };
  }

  function pushState() { dependencies.notifyState(stateForRenderer()); }

  function closeBrowserView(id: string, options: { clearSelection?: boolean } = {}) {
    const result = closeWorkspaceBrowserViewRuntime(id, {
      getView: (viewId) => views.get(viewId),
      detachView: dependencies.detachView,
      closeWebContents: dependencies.closeWebContents,
      forgetView: (viewId) => { views.delete(viewId); },
    });
    if (result.status === 'missing') return;
    if (dependencies.getSelectedAccountId() === id && options.clearSelection) dependencies.setSelectedAccountId(null);
  }

  function pruneBrowserViews(preferredId = dependencies.getSelectedAccountId()) {
    const ids = [...views.keys()];
    const lastVisitedAt = new Map(ids.map((id) => [id, dependencies.getLastVisitedAt(id) || 0]));
    const closeIds = planViewPrune({ viewIds: ids, preferredId, maxLiveViews: dependencies.maxLiveViews, lastVisitedAt });
    for (const id of closeIds) closeBrowserView(id);
  }

  function createBrowserView(account: TAccount): TView | null {
    if (!account) return null;
    const existing = views.get(account.id);
    if (existing) return existing;
    const view = dependencies.createNativeView(account);
    dependencies.setLastVisitedAt(account.id, now());
    attachAndRegisterWebContentsViewRuntime(view, {
      initialNavigationTiming: 'before-attach',
      navigate: (candidate) => { dependencies.loadUrl(candidate, account.url); },
      attach: dependencies.attachView,
      register: (candidate) => views.set(account.id, candidate),
      afterRegister: () => pruneBrowserViews(account.id),
    });
    return view;
  }

  function closeAllBrowserViews(options: { clearSelection?: boolean } = {}) {
    for (const id of [...views.keys()]) closeBrowserView(id, options);
    layout.main = null;
  }

  function setBrowserAccount(id: unknown) {
    if (dependencies.isLocked() || dependencies.getWorkspaceApp() !== 'instruction-forge') return { ok: false, error: 'Instruction Forge browser is only active inside Instruction Forge.' };
    const account = dependencies.getAccount(id);
    if (!account) return { ok: false, error: 'AI Hub account not found.' };
    dependencies.setSelectedAccountId(account.id);
    const view = createBrowserView(account);
    if (!view || dependencies.isWebContentsDestroyed(view)) return { ok: false, error: 'Could not open the Forge browser for this account.' };
    dependencies.positionViews();
    view.webContents.focus();
    pushState();
    return { ok: true, accountId: account.id, accountName: account.name, providerName: dependencies.getServiceName(account.serviceId), url: account.url };
  }

  async function navigateBrowser(actionInput: unknown) {
    if (!['back', 'forward', 'refresh'].includes(String(actionInput))) return { ok: false, error: 'Invalid Forge browser navigation.' };
    const action = actionInput as 'back' | 'forward' | 'refresh';
    const id = dependencies.getSelectedAccountId();
    const view = id ? views.get(id) : null;
    if (!view || dependencies.isWebContentsDestroyed(view)) return { ok: false, error: 'Choose an AI account browser first.' };
    try {
      if (action === 'back') {
        if (!dependencies.canGoBack(view)) return { ok: false, error: 'There is no previous page in this browser.' };
        await Promise.resolve(dependencies.goBack(view));
      } else if (action === 'forward') {
        if (!dependencies.canGoForward(view)) return { ok: false, error: 'There is no next page in this browser.' };
        await Promise.resolve(dependencies.goForward(view));
      } else {
        view.webContents.reload();
      }
      pushState();
      return { ok: true, action, state: stateForRenderer() };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Forge browser navigation failed.' };
    }
  }

  function setBrowserLayout(input: unknown = {}) {
    const value = input && typeof input === 'object' && !Array.isArray(input) ? input as UnknownRecord : {};
    const raw = value.main && typeof value.main === 'object' ? value.main as UnknownRecord : null;
    layout.main = raw && Number.isFinite(Number(raw.x)) && Number.isFinite(Number(raw.y)) && Number(raw.width) > 8 && Number(raw.height) > 8
      ? { x: Number(raw.x), y: Number(raw.y), width: Number(raw.width), height: Number(raw.height) }
      : null;
    dependencies.positionViews();
    return { ok: true };
  }

  function suspendBrowsers() {
    closeAllBrowserViews({ clearSelection: false });
    return { ok: true };
  }

  return { stateForRenderer, pushState, pruneBrowserViews, createBrowserView, closeBrowserView, closeAllBrowserViews, setBrowserAccount, navigateBrowser, setBrowserLayout, suspendBrowsers };
}

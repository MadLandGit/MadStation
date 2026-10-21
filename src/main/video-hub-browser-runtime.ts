/** Video Hub's single-live-view/session lifecycle. Browser security hooks and native
 * Electron construction remain injected by main.js; this module owns orchestration.
 */
import { attachAndRegisterWebContentsViewRuntime } from './web-contents-view-attachment-runtime';

type UnknownRecord = Record<string, unknown>;
type Rect = { x: number; y: number; width: number; height: number } | null;
type VideoHubAccount = { id: string; url: string; [key: string]: unknown };
type VideoHubView = {
  webContents: {
    isDestroyed(): boolean;
    canGoBack(): boolean;
    canGoForward(): boolean;
    goBack(): void;
    goForward(): void;
    reload(): void;
    getURL(): string;
    loadURL(url: string): Promise<unknown>;
    close(): void;
  };
};
type ChildWindow = { isDestroyed(): boolean; close(): void };

export interface VideoHubBrowserRuntimeDependencies<TView extends VideoHubView, TAccount extends VideoHubAccount> {
  layout: { main: Rect };
  pendingCreations: Map<string, Promise<TView | null>>;
  childWindows: Set<ChildWindow>;
  getBrowserView(): TView | null;
  setBrowserView(view: TView | null): void;
  getActiveAccountId(): string | null;
  setActiveAccountId(id: string | null): void;
  getRequestSerial(): number;
  advanceRequestSerial(): number;
  getWorkspaceApp(): string;
  isLocked(): boolean;
  loadStore(): { activeAccountId: string | null };
  saveStore(): unknown;
  getAccount(id: unknown): TAccount | null;
  getRuntimeAccount(account: TAccount): UnknownRecord;
  getSession(account: UnknownRecord): unknown;
  waitForSessionReady(session: unknown): Promise<{ ok?: boolean; error?: Error | { message?: string } | null } | null | undefined>;
  createNativeView(account: TAccount, runtimeAccount: UnknownRecord, session: unknown): TView;
  attachView(view: TView): void;
  detachView(view: TView): void;
  isWebContentsDestroyed(view: TView): boolean;
  closeWebContents(view: TView): void;
  loadUrl(view: TView, url: string): Promise<unknown>;
  positionViews(): void;
  getRendererState(): UnknownRecord;
  normalizeActiveId(id: unknown): string | null;
  onProxyFailure(account: TAccount, errorMessage: string): void;
  onCreateFailure(account: TAccount, errorMessage: string): void;
  onNavigationFailure(account: TAccount, errorMessage: string): void;
  externalUrlForPage(url: string, account: TAccount): string;
  openExternalSafe(url: string): Promise<boolean>;
}

export function createVideoHubBrowserRuntime<TView extends VideoHubView, TAccount extends VideoHubAccount>(dependencies: VideoHubBrowserRuntimeDependencies<TView, TAccount>) {
  const { layout, pendingCreations, childWindows } = dependencies;

  function closeBrowserView() {
    // Invalidate any creation awaiting proxy initialization, preventing a stale view from attaching later.
    dependencies.advanceRequestSerial();
    pendingCreations.clear();
    const view = dependencies.getBrowserView();
    dependencies.setBrowserView(null);
    for (const child of [...childWindows]) {
      childWindows.delete(child);
      try { if (!child.isDestroyed()) child.close(); } catch { /* ignore */ }
    }
    if (!view) return;
    try { dependencies.detachView(view); } catch { /* ignore */ }
    try { if (!dependencies.isWebContentsDestroyed(view)) dependencies.closeWebContents(view); } catch { /* ignore */ }
  }

  function suspendBrowsers(clearLayout = true) {
    closeBrowserView();
    if (clearLayout) layout.main = null;
    dependencies.positionViews();
    return { ok: true };
  }

  function createBrowserView(account: TAccount): Promise<TView | null> {
    if (!account) return Promise.resolve(null);
    const current = dependencies.getBrowserView();
    if (current && !dependencies.isWebContentsDestroyed(current)) {
      if (dependencies.getActiveAccountId() === account.id) return Promise.resolve(current);
      closeBrowserView();
    }
    const existing = pendingCreations.get(account.id);
    if (existing) return existing;

    const requestSerial = dependencies.advanceRequestSerial();
    let creation: Promise<TView | null>;
    creation = (async () => {
      const runtimeAccount = dependencies.getRuntimeAccount(account);
      const session = dependencies.getSession(runtimeAccount);
      const readiness = await dependencies.waitForSessionReady(session);
      if (!readiness?.ok) {
        const detail = readiness?.error && 'message' in readiness.error ? readiness.error.message || 'proxy initialization failed' : 'proxy initialization failed';
        dependencies.onProxyFailure(account, detail);
        return null;
      }
      // Workspace switch, account switch, or lock during proxy setup invalidates this request.
      if (requestSerial !== dependencies.getRequestSerial() || dependencies.getWorkspaceApp() !== 'video-hub' || dependencies.isLocked() || dependencies.getActiveAccountId() !== account.id) return null;
      const currentView = dependencies.getBrowserView();
      if (currentView && !dependencies.isWebContentsDestroyed(currentView)) return currentView;

      const view = dependencies.createNativeView(account, runtimeAccount, session);
      attachAndRegisterWebContentsViewRuntime(view, {
        initialNavigationTiming: 'after-register',
        attach: dependencies.attachView,
        register: (candidate) => dependencies.setBrowserView(candidate),
        afterRegister: () => dependencies.positionViews(),
        navigate: (candidate) => {
          void dependencies.loadUrl(candidate, account.url).catch((error) => {
            dependencies.onNavigationFailure(account, error instanceof Error ? error.message : 'unknown');
          });
        },
      });
      return view;
    })().catch((error) => {
      dependencies.onCreateFailure(account, error instanceof Error ? error.message : String(error));
      return null;
    }).finally(() => {
      if (pendingCreations.get(account.id) === creation) pendingCreations.delete(account.id);
    });
    pendingCreations.set(account.id, creation);
    return creation;
  }

  function setActiveAccount(id: unknown) {
    const store = dependencies.loadStore();
    const nextId = dependencies.normalizeActiveId(id);
    if (nextId && !dependencies.getAccount(nextId)) return { ok: false, error: 'Video Hub account not found.' };
    if (nextId !== store.activeAccountId || nextId !== dependencies.getActiveAccountId()) {
      closeBrowserView();
      store.activeAccountId = nextId;
      dependencies.setActiveAccountId(nextId);
      dependencies.saveStore();
    }
    if (nextId && dependencies.getWorkspaceApp() === 'video-hub' && !dependencies.isLocked()) {
      const account = dependencies.getAccount(nextId);
      if (account) void createBrowserView(account);
    }
    if (!nextId) closeBrowserView();
    dependencies.positionViews();
    return { ok: true, ...dependencies.getRendererState() };
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

  async function navigate(actionInput: unknown) {
    if (!['back', 'forward', 'refresh'].includes(String(actionInput))) return { ok: false, error: 'Invalid Video Hub browser action.' };
    const view = dependencies.getBrowserView();
    if (!view || dependencies.isWebContentsDestroyed(view)) return { ok: false, error: 'Select a Video Hub account first.' };
    const wc = view.webContents;
    try {
      if (actionInput === 'back') { if (!wc.canGoBack()) return { ok: false, error: 'There is no previous page.' }; wc.goBack(); }
      else if (actionInput === 'forward') { if (!wc.canGoForward()) return { ok: false, error: 'There is no next page.' }; wc.goForward(); }
      else wc.reload();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Browser navigation failed.' };
    }
  }

  async function openInBrowser() {
    const view = dependencies.getBrowserView();
    const activeId = dependencies.getActiveAccountId() || dependencies.loadStore().activeAccountId;
    const account = activeId ? dependencies.getAccount(activeId) : null;
    if (!account || !view || dependencies.isWebContentsDestroyed(view)) return { ok: false, error: 'Select a Video Hub account first.' };
    const opened = await dependencies.openExternalSafe(dependencies.externalUrlForPage(view.webContents.getURL() || account.url, account));
    return opened ? { ok: true } : { ok: false, error: 'Could not open the site in your browser.' };
  }

  return { closeBrowserView, suspendBrowsers, createBrowserView, setActiveAccount, setBrowserLayout, navigate, openInBrowser };
}

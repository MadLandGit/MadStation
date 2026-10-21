/** Image Hub's single-live-view browser lifecycle.
 * Native construction and hardening are injected by main.js so the runtime can
 * validate renderer requests and manage bounds/navigation without importing Electron.
 */

export interface ImageHubBrowserAccount {
  id: string;
  providerId: string;
  name: string;
  url: string;
}

export interface ImageHubBrowserRect { x: number; y: number; width: number; height: number }
export interface ImageHubBrowserState {
  accountId: string;
  url: string;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  hasBrowserView: boolean;
  error: string;
}

type ImageHubWebContents = {
  isDestroyed(): boolean;
  isLoading(): boolean;
  getURL(): string;
  getTitle(): string;
  canGoBack?(): boolean;
  canGoForward?(): boolean;
  goBack?(): void;
  goForward?(): void;
  reload?(): void;
  stop?(): void;
  loadURL(url: string): Promise<unknown>;
  close(): void;
};
type ImageHubView = { webContents: ImageHubWebContents };
type ImageHubChildWindow = { isDestroyed(): boolean; close(): void };

export interface ImageHubBrowserRuntimeDependencies<TView extends ImageHubView> {
  layout: { main: ImageHubBrowserRect | null };
  childWindows: Set<ImageHubChildWindow>;
  getWorkspaceApp(): string;
  isLocked(): boolean;
  getBrowserView(): TView | null;
  setBrowserView(view: TView | null): void;
  createNativeView(account: ImageHubBrowserAccount): TView;
  attachView(view: TView): void;
  detachView(view: TView): void;
  isWebContentsDestroyed(view: TView): boolean;
  closeWebContents(view: TView): void;
  positionViews(): void;
  openExternalSafe(url: string): Promise<boolean>;
  sendState(state: ImageHubBrowserState): void;
}

const ACCOUNT_ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;
const PROVIDER_ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

function normalizeRequest(input: unknown): { account: ImageHubBrowserAccount | null; error: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { account: null, error: 'Invalid Image Hub browser request.' };
  const candidate = input as Record<string, unknown>;
  const id = typeof candidate.accountId === 'string' ? candidate.accountId : '';
  const providerId = typeof candidate.providerId === 'string' ? candidate.providerId : '';
  const name = typeof candidate.name === 'string' ? candidate.name.trim().slice(0, 100) : '';
  const rawUrl = typeof candidate.url === 'string' ? candidate.url.trim() : '';
  if (!ACCOUNT_ID_PATTERN.test(id) || !PROVIDER_ID_PATTERN.test(providerId)) return { account: null, error: 'Invalid Image Hub account.' };
  if (!rawUrl || rawUrl.length > 2048) return { account: null, error: 'Invalid Image Hub website URL.' };
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) {
      return { account: null, error: 'Image Hub only opens valid HTTPS websites.' };
    }
    return { account: { id, providerId, name: name || 'Image Hub account', url: parsed.href }, error: '' };
  } catch {
    return { account: null, error: 'Invalid Image Hub website URL.' };
  }
}

export function createImageHubBrowserRuntime<TView extends ImageHubView>(dependencies: ImageHubBrowserRuntimeDependencies<TView>) {
  let activeAccount: ImageHubBrowserAccount | null = null;
  let loading = false;
  let lastError = '';

  function getState(): ImageHubBrowserState {
    const view = dependencies.getBrowserView();
    const alive = Boolean(view && !dependencies.isWebContentsDestroyed(view));
    let url = activeAccount?.url || '';
    let title = '';
    let canGoBack = false;
    let canGoForward = false;
    if (alive && view) {
      try { url = view.webContents.getURL() || url; } catch { /* closing */ }
      try { title = view.webContents.getTitle() || ''; } catch { /* closing */ }
      try { canGoBack = Boolean(view.webContents.canGoBack?.()); } catch { /* closing */ }
      try { canGoForward = Boolean(view.webContents.canGoForward?.()); } catch { /* closing */ }
      try { loading = view.webContents.isLoading(); } catch { /* closing */ }
    }
    return {
      accountId: activeAccount?.id || '',
      url,
      title,
      loading: alive ? loading : false,
      canGoBack,
      canGoForward,
      hasBrowserView: alive,
      error: lastError,
    };
  }

  function publishState(): ImageHubBrowserState {
    const state = getState();
    try { dependencies.sendState(state); } catch { /* renderer may be closing */ }
    return state;
  }

  function closeBrowserView(clearLayout = false) {
    const view = dependencies.getBrowserView();
    dependencies.setBrowserView(null);
    activeAccount = null;
    loading = false;
    lastError = '';
    if (clearLayout) dependencies.layout.main = null;
    for (const child of [...dependencies.childWindows]) {
      dependencies.childWindows.delete(child);
      try { if (!child.isDestroyed()) child.close(); } catch { /* best effort */ }
    }
    if (view) {
      try { dependencies.detachView(view); } catch { /* best effort */ }
      try { if (!dependencies.isWebContentsDestroyed(view)) dependencies.closeWebContents(view); } catch { /* best effort */ }
    }
    dependencies.positionViews();
    publishState();
    return { ok: true, ...getState() };
  }

  function suspendBrowsers(clearLayout = true) {
    return closeBrowserView(clearLayout);
  }

  function openBrowser(input: unknown) {
    if (dependencies.isLocked()) return { ok: false, error: 'Mad Station is locked.' };
    if (dependencies.getWorkspaceApp() !== 'image-hub') return { ok: false, error: 'Open Image Hub to use its browser.' };
    const { account, error } = normalizeRequest(input);
    if (!account) return { ok: false, error };
    const current = dependencies.getBrowserView();
    if (current && !dependencies.isWebContentsDestroyed(current)
      && activeAccount?.id === account.id && activeAccount.url === account.url) {
      dependencies.positionViews();
      return { ok: true, ...publishState() };
    }

    closeBrowserView(false);
    let createdView: TView | null = null;
    try {
      const view = dependencies.createNativeView(account);
      createdView = view;
      activeAccount = account;
      loading = true;
      lastError = '';
      dependencies.setBrowserView(view);
      dependencies.attachView(view);
      dependencies.positionViews();
      publishState();
      try {
        void Promise.resolve(view.webContents.loadURL(account.url)).catch(() => {
          if (dependencies.getBrowserView() !== view) return;
          reportFailure('This page could not be loaded. Check your connection and try again.');
        });
      } catch {
        reportFailure('This page could not be loaded. Check your connection and try again.');
      }
      return { ok: true, ...getState() };
    } catch {
      if (createdView) {
        try { dependencies.detachView(createdView); } catch { /* best effort */ }
        try { if (!dependencies.isWebContentsDestroyed(createdView)) dependencies.closeWebContents(createdView); } catch { /* best effort */ }
      }
      dependencies.setBrowserView(null);
      activeAccount = account;
      loading = false;
      lastError = 'Image Hub could not create the embedded browser. Try selecting the account again.';
      dependencies.positionViews();
      publishState();
      return { ...getState(), ok: false };
    }
  }

  function setBrowserLayout(input: unknown = {}) {
    const candidate = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
    const raw = candidate.main && typeof candidate.main === 'object' && !Array.isArray(candidate.main)
      ? candidate.main as Record<string, unknown> : null;
    const x = Number(raw?.x), y = Number(raw?.y), width = Number(raw?.width), height = Number(raw?.height);
    dependencies.layout.main = raw && Number.isFinite(x) && Number.isFinite(y)
      && Number.isFinite(width) && Number.isFinite(height)
      && Math.abs(x) <= 20000 && Math.abs(y) <= 20000
      && width > 8 && width <= 20000 && height > 8 && height <= 20000
      ? { x, y, width, height } : null;
    dependencies.positionViews();
    return { ok: true };
  }

  async function navigate(actionInput: unknown) {
    const action = typeof actionInput === 'string' ? actionInput : '';
    if (!['back', 'forward', 'reload', 'stop', 'open-external'].includes(action)) return { ok: false, error: 'Invalid Image Hub browser action.' };
    if (dependencies.isLocked() || dependencies.getWorkspaceApp() !== 'image-hub') return { ok: false, error: 'Image Hub browser is not active.' };
    const view = dependencies.getBrowserView();
    if (!view || dependencies.isWebContentsDestroyed(view)) return { ok: false, error: 'Select an image tool to open its browser.' };
    const wc = view.webContents;
    try {
      if (action === 'back' && wc.canGoBack?.()) wc.goBack?.();
      else if (action === 'forward' && wc.canGoForward?.()) wc.goForward?.();
      else if (action === 'reload') {
        if (loading || wc.isLoading()) { wc.stop?.(); loading = false; }
        else { wc.reload?.(); loading = true; lastError = ''; }
      } else if (action === 'stop') { wc.stop?.(); loading = false; }
      else if (action === 'open-external') {
        const state = getState();
        const opened = await dependencies.openExternalSafe(state.url);
        return opened ? { ok: true } : { ok: false, error: 'Could not open that page in your default browser.' };
      }
      publishState();
      return { ok: true, ...getState() };
    } catch {
      return { ok: false, error: 'Image Hub could not complete that browser action.' };
    }
  }

  function reportLoading(value: boolean) {
    loading = Boolean(value);
    if (loading) lastError = '';
    return publishState();
  }
  function reportNavigation() { lastError = ''; return publishState(); }
  function reportTitle() { return publishState(); }
  function reportFailure(message = '') {
    loading = false;
    lastError = String(message || 'This page could not be loaded. Check your connection and try again.').slice(0, 240);
    const view = dependencies.getBrowserView();
    if (view) {
      dependencies.setBrowserView(null);
      for (const child of [...dependencies.childWindows]) {
        dependencies.childWindows.delete(child);
        try { if (!child.isDestroyed()) child.close(); } catch { /* best effort */ }
      }
      try { dependencies.detachView(view); } catch { /* best effort */ }
      try { if (!dependencies.isWebContentsDestroyed(view)) dependencies.closeWebContents(view); } catch { /* best effort */ }
    }
    dependencies.positionViews();
    return publishState();
  }

  return { openBrowser, closeBrowserView, suspendBrowsers, setBrowserLayout, navigate, publishState, reportLoading, reportNavigation, reportTitle, reportFailure, getState };
}

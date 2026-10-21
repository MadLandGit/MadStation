/**
 * Event wiring for workspace WebContentsViews. Native view creation, session
 * creation, hardening, attachment order and workspace state remain in main.js;
 * this module owns the repeated page/input lifecycle listeners and receives all
 * host decisions through explicit callbacks.
 */

export interface BrowserEventInput {
  type?: string;
  key?: string;
  control?: boolean;
  meta?: boolean;
  alt?: boolean;
  shift?: boolean;
  [key: string]: unknown;
}

export interface BrowserEventContents {
  on(event: string, listener: (...args: any[]) => void): unknown;
  isDestroyed(): boolean;
  isLoading(): boolean;
  getURL(): string;
  getTitle(): string;
  canGoBack?(): boolean;
  canGoForward?(): boolean;
  reload?(): unknown;
  goBack?(): unknown;
  goForward?(): unknown;
}

export interface BrowserEventView { webContents: BrowserEventContents }
export interface BrowserEventAccount { id: string; name: string; url: string }
export interface BrowserAccountRuntime {
  pageLoads: number;
  lastLoadedAt: number;
  lastVisitedAt: number;
  currentUrl: string;
  currentTitle: string;
  lastError: string;
  navigations: number;
}

type InputEvent = { preventDefault(): void };
type FailureEvent = unknown;

export interface SharedBrowserInputDependencies {
  normalizeShortcutFromInput(input: BrowserEventInput): string;
  handleShortcut(shortcut: string): boolean;
  handleBrowserKey(input: BrowserEventInput): boolean;
}

function bindInputEvents(view: BrowserEventView, dependencies: SharedBrowserInputDependencies & {
  beforeInputMode?: 'standard' | 'video-hub';
}) {
  view.webContents.on('before-input-event', (event: InputEvent, rawInput: BrowserEventInput) => {
    const input = rawInput || {};
    if (input.type !== 'keyDown') return;
    if (dependencies.beforeInputMode === 'video-hub') {
      const key = String(input.key || '').toLowerCase();
      if ((input.control || input.meta) && !input.alt && !input.shift && key === 'r') {
        event.preventDefault();
        view.webContents.reload?.();
        return;
      }
      if (input.alt && !input.control && !input.meta && !input.shift && input.key === 'ArrowLeft') {
        event.preventDefault();
        if (view.webContents.canGoBack?.()) view.webContents.goBack?.();
        return;
      }
      if (input.alt && !input.control && !input.meta && !input.shift && input.key === 'ArrowRight') {
        event.preventDefault();
        if (view.webContents.canGoForward?.()) view.webContents.goForward?.();
      }
      return;
    }
    const shortcut = dependencies.normalizeShortcutFromInput(input);
    if (shortcut && dependencies.handleShortcut(shortcut)) { event.preventDefault(); return; }
    if (dependencies.handleBrowserKey(input)) event.preventDefault();
  });
}

export interface AiHubBrowserEventDependencies extends SharedBrowserInputDependencies {
  getRuntime(accountId: string): BrowserAccountRuntime;
  getActiveAccountId(): string | null;
  isLocked(): boolean;
  getControlContents(): { isDestroyed(): boolean; send(channel: string, payload: unknown): unknown } | null;
  pushToolbar(): void;
  notice(message: string): void;
  applyZoom(contents: BrowserEventContents): void;
  now?(): number;
}

export function bindAiHubBrowserEvents(
  view: BrowserEventView,
  account: BrowserEventAccount,
  dependencies: AiHubBrowserEventDependencies,
): void {
  bindInputEvents(view, dependencies);
  const runtime = dependencies.getRuntime(account.id);
  const now = dependencies.now || Date.now;
  const sendState = () => { if (dependencies.getActiveAccountId() === account.id) dependencies.pushToolbar(); };
  view.webContents.on('did-finish-load', () => {
    runtime.pageLoads += 1;
    runtime.lastLoadedAt = now();
    runtime.lastVisitedAt = now();
    runtime.currentUrl = view.webContents.getURL();
    runtime.currentTitle = view.webContents.getTitle();
    runtime.lastError = '';
    sendState();
  });
  view.webContents.on('did-stop-loading', () => sendState());
  view.webContents.on('did-start-loading', () => sendState());
  const onNavigate = () => {
    runtime.navigations += 1;
    runtime.lastVisitedAt = now();
    runtime.currentUrl = view.webContents.getURL();
    sendState();
  };
  view.webContents.on('did-navigate', onNavigate);
  view.webContents.on('did-navigate-in-page', onNavigate);
  view.webContents.on('did-fail-load', (_event: FailureEvent, errorCode: number, errorDescription: string, validatedURL: string, isMainFrame: boolean) => {
    if (isMainFrame && errorCode !== -3) {
      runtime.lastError = `${errorDescription || 'Page load failed'} (${validatedURL || 'unknown URL'})`;
      if (dependencies.getActiveAccountId() === account.id) dependencies.notice(`${account.name}: ${errorDescription || 'The page could not be loaded.'}`);
    }
  });
  view.webContents.on('page-title-updated', (_event: FailureEvent, title: string) => {
    runtime.currentTitle = title || '';
    runtime.lastVisitedAt = now();
    if (!dependencies.isLocked() && dependencies.getActiveAccountId() === account.id) {
      const control = dependencies.getControlContents();
      if (control && !control.isDestroyed()) control.send('page-title', { id: account.id, title });
    }
    if (dependencies.getActiveAccountId() === account.id) dependencies.pushToolbar();
  });
  view.webContents.on('dom-ready', () => dependencies.applyZoom(view.webContents));
}

export interface ForgeBrowserEventDependencies extends SharedBrowserInputDependencies {
  getRuntime(accountId: string): BrowserAccountRuntime;
  getSelectedAccountId(): string | null;
  pushState(): void;
  notice(message: string): void;
  applyZoom(contents: BrowserEventContents): void;
  now?(): number;
}

export function bindForgeBrowserEvents(
  view: BrowserEventView,
  account: BrowserEventAccount,
  dependencies: ForgeBrowserEventDependencies,
): void {
  bindInputEvents(view, dependencies);
  const runtime = dependencies.getRuntime(account.id);
  const now = dependencies.now || Date.now;
  view.webContents.on('did-start-loading', () => dependencies.pushState());
  view.webContents.on('did-stop-loading', () => dependencies.pushState());
  view.webContents.on('did-finish-load', () => {
    runtime.pageLoads += 1;
    runtime.lastLoadedAt = now();
    runtime.lastVisitedAt = now();
    runtime.currentUrl = view.webContents.getURL();
    runtime.currentTitle = view.webContents.getTitle();
    runtime.lastError = '';
    dependencies.pushState();
  });
  const onNavigate = () => {
    runtime.navigations += 1;
    runtime.lastVisitedAt = now();
    runtime.currentUrl = view.webContents.getURL();
    dependencies.pushState();
  };
  view.webContents.on('did-navigate', onNavigate);
  view.webContents.on('did-navigate-in-page', onNavigate);
  view.webContents.on('page-title-updated', (_event: FailureEvent, title: string) => {
    runtime.currentTitle = title || '';
    runtime.lastVisitedAt = now();
    dependencies.pushState();
  });
  view.webContents.on('did-fail-load', (_event: FailureEvent, errorCode: number, errorDescription: string, validatedURL: string, isMainFrame: boolean) => {
    if (isMainFrame && errorCode !== -3) {
      runtime.lastError = `${errorDescription || 'Page load failed'} (${validatedURL || 'unknown URL'})`;
      if (dependencies.getSelectedAccountId() === account.id) dependencies.notice(`${account.name}: ${errorDescription || 'The page could not be loaded.'}`);
      dependencies.pushState();
    }
  });
  view.webContents.on('dom-ready', () => dependencies.applyZoom(view.webContents));
}

export interface VideoHubBrowserEventDependencies {
  applyZoom(contents: BrowserEventContents): void;
  hostOf(url: string): string;
  warn(message: string): void;
  onLoadingChange?(loading: boolean): void;
}

export function bindVideoHubBrowserEvents(
  view: BrowserEventView,
  account: BrowserEventAccount,
  dependencies: VideoHubBrowserEventDependencies,
): void {
  bindInputEvents(view, {
    beforeInputMode: 'video-hub',
    normalizeShortcutFromInput: () => '',
    handleShortcut: () => false,
    handleBrowserKey: () => false,
  });
  view.webContents.on('did-start-loading', () => dependencies.onLoadingChange?.(true));
  view.webContents.on('did-stop-loading', () => dependencies.onLoadingChange?.(false));
  view.webContents.on('dom-ready', () => dependencies.applyZoom(view.webContents));
  view.webContents.on('did-fail-load', (_event: FailureEvent, errorCode: number, errorDescription: string, validatedURL: string, isMainFrame: boolean) => {
    if (isMainFrame && errorCode !== -3) {
      dependencies.onLoadingChange?.(false);
      const safeError = String(errorDescription || 'unknown').replace(/[^a-zA-Z0-9 _:-]/g, '').slice(0, 100);
      dependencies.warn(`[Mad Station navigation] Video Hub page load failed: host=${dependencies.hostOf(validatedURL || account.url)} code=${errorCode} error=${safeError}`);
    }
  });
  dependencies.onLoadingChange?.(view.webContents.isLoading());
}

export interface ArenaBrowserEventDependencies extends SharedBrowserInputDependencies {
  applyZoom(contents: BrowserEventContents): void;
  onLoadingChange?(loading: boolean): void;
}

export function bindArenaBrowserEvents(view: BrowserEventView, dependencies: ArenaBrowserEventDependencies): void {
  bindInputEvents(view, dependencies);
  view.webContents.on('did-start-loading', () => dependencies.onLoadingChange?.(true));
  view.webContents.on('did-stop-loading', () => dependencies.onLoadingChange?.(false));
  view.webContents.on('did-fail-load', (_event: FailureEvent, errorCode: number, _errorDescription: string, _validatedURL: string, isMainFrame: boolean) => {
    if (isMainFrame && errorCode !== -3) dependencies.onLoadingChange?.(false);
  });
  view.webContents.on('dom-ready', () => dependencies.applyZoom(view.webContents));
  dependencies.onLoadingChange?.(view.webContents.isLoading());
}

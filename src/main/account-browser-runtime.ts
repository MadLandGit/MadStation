/** AI Hub account WebContentsView lifecycle orchestration.
 * Native construction and account hardening remain host-injected so this runtime
 * owns lifecycle sequencing without owning Electron or security policy.
 */
import { attachAndRegisterWebContentsViewRuntime } from './web-contents-view-attachment-runtime';
import { closeAccountBrowserViewRuntime } from './browser-view-runtime';
import { planViewPrune } from './browser-view-policy';
import { applyViewPrunePlan } from './browser-view-pruning-runtime';

type UnknownRecord = Record<string, unknown>;
type AccountRecord = { id: string; url: string; preferences?: UnknownRecord; [key: string]: unknown };
type RuntimeRecord = { lastVisitedAt?: number; [key: string]: unknown };
type WebContentsLike = { isDestroyed(): boolean; focus(): void; loadURL(url: string): Promise<unknown>; close(): void };
type AccountViewLike = { webContents: WebContentsLike };
type AppConfig = { accounts: AccountRecord[]; activeId: string | null; settings?: UnknownRecord; [key: string]: unknown };

export interface AccountBrowserRuntimeDependencies<TView extends AccountViewLike, TAccount extends AccountRecord> {
  views: Map<string, TView>;
  maxLiveViews: number;
  getWorkspaceApp(): string;
  isLocked(): boolean;
  getAccount(id: unknown): TAccount | null;
  getRuntime(id: string): RuntimeRecord;
  getSession(account: TAccount): unknown;
  createNativeView(account: TAccount, session: unknown): TView;
  hardenView(view: TView, account: TAccount, session: unknown): void;
  bindEvents(view: TView, account: TAccount): void;
  attachView(view: TView): void;
  detachView(view: TView): void;
  isWebContentsDestroyed(view: TView): boolean;
  closeWebContents(view: TView): void;
  getConfig(): AppConfig;
  saveConfig(config: AppConfig): boolean;
  getActiveId(): string | null;
  setActiveId(id: string): void;
  cancelDownloads(id: string): void;
  closeForgeBrowserView(id: string, options: { clearSelection?: boolean }): void;
  removeRuntime(id: string): void;
  positionViews(): void;
  moveViewToFront(view: TView): void;
  notice(message: string): void;
  notifyActiveChanged(id: string): void;
  pushToolbar(): void;
  now?(): number;
  warn?(message: string, count: number): void;
}

export function createAccountBrowserRuntime<TView extends AccountViewLike, TAccount extends AccountRecord>(dependencies: AccountBrowserRuntimeDependencies<TView, TAccount>) {
  const { views } = dependencies;
  const now = dependencies.now || Date.now;

  function removeView(id: string, options: { preserveRuntime?: boolean; cancelDownloads?: boolean } = {}) {
    if (options.cancelDownloads !== false) dependencies.cancelDownloads(id);
    try { dependencies.closeForgeBrowserView(id, { clearSelection: true }); } catch { /* Forge view may not exist during startup */ }
    const result = closeAccountBrowserViewRuntime(id, {
      getView: (viewId) => views.get(viewId),
      detachView: dependencies.detachView,
      isWebContentsDestroyed: dependencies.isWebContentsDestroyed,
      closeWebContents: dependencies.closeWebContents,
      forgetView: (viewId, view) => { if (views.get(viewId) === view) views.delete(viewId); },
    });
    if (!options.preserveRuntime) dependencies.removeRuntime(id);
    return result;
  }

  function pruneInactiveViews(preferredId = dependencies.getActiveId()) {
    const viewIds = [...views.keys()];
    const lastVisitedAt = new Map(viewIds.map((id) => [id, dependencies.getRuntime(id).lastVisitedAt || 0]));
    const closeIds = planViewPrune({ viewIds, preferredId, maxLiveViews: dependencies.maxLiveViews, lastVisitedAt });
    const result = applyViewPrunePlan(closeIds, (id) => removeView(id, { preserveRuntime: true, cancelDownloads: false }));
    if (result.failedIds.length > 0) dependencies.warn?.('[browser-view-prune] One or more inactive account views could not be fully removed:', result.failedIds.length);
    return result;
  }

  function createView(accountInput: TAccount | null | undefined, options: { allowOutsideWorkspace?: boolean } = {}): TView | null {
    const account = accountInput;
    if (!account) return null;
    if (!options.allowOutsideWorkspace && (dependencies.getWorkspaceApp() !== 'ai-hub' || dependencies.isLocked())) return null;
    if (views.has(account.id)) return views.get(account.id)!;

    const session = dependencies.getSession(account);
    const view = dependencies.createNativeView(account, session);
    dependencies.getRuntime(account.id).lastVisitedAt = now();
    dependencies.hardenView(view, account, session);
    dependencies.bindEvents(view, account);
    attachAndRegisterWebContentsViewRuntime(view, {
      initialNavigationTiming: 'before-attach',
      navigate: (candidate) => { void candidate.webContents.loadURL(account.url); },
      attach: dependencies.attachView,
      register: (candidate) => views.set(account.id, candidate),
      afterRegister: () => pruneInactiveViews(account.id),
    });
    return view;
  }

  function activateAccount(id: string) {
    if (dependencies.isLocked()) return { ok: false, error: 'Mad Station is locked.' };
    if (dependencies.getWorkspaceApp() !== 'ai-hub') return { ok: false, error: 'AI Hub browser is only active inside AI Hub.' };
    const account = dependencies.getAccount(id);
    if (!account) return { ok: false, error: 'Account not found.' };
    const view = createView(account);
    if (!view) return { ok: false, error: 'Could not open the account browser.' };
    dependencies.getRuntime(id).lastVisitedAt = now();
    dependencies.setActiveId(id);
    const config = dependencies.getConfig();
    config.activeId = id;
    if (!dependencies.saveConfig(config)) dependencies.notice('Could not save the active account change. Please retry.');
    dependencies.moveViewToFront(view);
    dependencies.positionViews();
    pruneInactiveViews(id);
    view.webContents.focus();
    dependencies.notifyActiveChanged(id);
    dependencies.pushToolbar();
    return { ok: true };
  }

  function closeAllViews() {
    // Account WebContentsViews are workspace-scoped; session partitions retain login state.
    for (const id of [...views.keys()]) removeView(id, { preserveRuntime: true, cancelDownloads: false });
  }

  return { createView, activateAccount, removeView, closeAllViews, pruneInactiveViews };
}

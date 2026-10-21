/**
 * Small injected adapter for the native side effects involved in closing an
 * AI Hub account WebContentsView. Selection/retention decisions stay in
 * browser-view-policy.ts; this module only performs one requested closure.
 *
 * Electron is intentionally not imported here. The composition root supplies
 * view lookup, parent detachment, destruction inspection, close, and registry
 * cleanup capabilities.
 */

export type BrowserViewCloseStep =
  | 'detach-view'
  | 'inspect-destroyed-state'
  | 'close-web-contents'
  | 'forget-view';

export interface BrowserViewCloseResult {
  status: 'missing' | 'closed' | 'already-destroyed' | 'failed';
  detached: boolean;
  closeAttempted: boolean;
  failures: BrowserViewCloseStep[];
}

export interface BrowserViewRuntimeDependencies<TView> {
  getView(id: string): TView | null | undefined;
  detachView(view: TView): void;
  isWebContentsDestroyed(view: TView): boolean;
  closeWebContents(view: TView): void;
  /** Remove this exact view from the registry, without deleting a replacement. */
  forgetView(id: string, view: TView): void;
}

/**
 * Close one account view using best-effort cleanup semantics matching the old
 * main-process implementation: attempt detachment, skip close() if Electron
 * confirms WebContents is already destroyed, and always attempt registry
 * cleanup once a view was found. One failed step must not skip later cleanup.
 */
export function closeAccountBrowserViewRuntime<TView>(
  id: string,
  dependencies: BrowserViewRuntimeDependencies<TView>,
): BrowserViewCloseResult {
  const view = dependencies.getView(id);
  if (view == null) {
    return { status: 'missing', detached: false, closeAttempted: false, failures: [] };
  }

  const failures: BrowserViewCloseStep[] = [];
  let detached = false;
  let closeAttempted = false;
  let alreadyDestroyed = false;

  try {
    dependencies.detachView(view);
    detached = true;
  } catch {
    failures.push('detach-view');
  }

  try {
    alreadyDestroyed = dependencies.isWebContentsDestroyed(view);
  } catch {
    // Match the old host behavior: if Electron cannot answer the state query,
    // try close() and let the close operation fail softly if necessary.
    failures.push('inspect-destroyed-state');
  }

  if (!alreadyDestroyed) {
    closeAttempted = true;
    try {
      dependencies.closeWebContents(view);
    } catch {
      failures.push('close-web-contents');
    }
  }

  try {
    dependencies.forgetView(id, view);
  } catch {
    failures.push('forget-view');
  }

  const status: BrowserViewCloseResult['status'] = failures.length > 0
    ? 'failed'
    : alreadyDestroyed
      ? 'already-destroyed'
      : 'closed';

  return { status, detached, closeAttempted, failures };
}

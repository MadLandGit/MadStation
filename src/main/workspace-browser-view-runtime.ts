/**
 * Best-effort close sequence shared by Model Arena and Instruction Forge views.
 *
 * This boundary deliberately does not import Electron or own either workspace's
 * selection/layout/session state. The host injects native detachment, close,
 * and registry callbacks. Cleanup is attempted in order even when an earlier
 * step fails, and results contain only safe step identifiers.
 */

export type WorkspaceBrowserViewCloseStep =
  | 'detach-view'
  | 'close-web-contents'
  | 'forget-view';

export interface WorkspaceBrowserViewCloseResult {
  status: 'missing' | 'closed' | 'failed';
  detached: boolean;
  closeAttempted: boolean;
  failures: WorkspaceBrowserViewCloseStep[];
}

export interface WorkspaceBrowserViewCloseDependencies<TView> {
  getView(id: string): TView | null | undefined;
  detachView(view: TView): void;
  closeWebContents(view: TView): void;
  forgetView(id: string, view: TView): void;
}

export function closeWorkspaceBrowserViewRuntime<TView>(
  id: string,
  dependencies: WorkspaceBrowserViewCloseDependencies<TView>,
): WorkspaceBrowserViewCloseResult {
  const view = dependencies.getView(id);
  if (!view) {
    return { status: 'missing', detached: false, closeAttempted: false, failures: [] };
  }

  const failures: WorkspaceBrowserViewCloseStep[] = [];
  let detached = false;
  let closeAttempted = false;

  try {
    dependencies.detachView(view);
    detached = true;
  } catch {
    failures.push('detach-view');
  }

  // Preserve the existing Arena/Forge behavior: make a best-effort close call
  // even when detach failed; WebContents.close() itself is allowed to fail softly.
  closeAttempted = true;
  try {
    dependencies.closeWebContents(view);
  } catch {
    failures.push('close-web-contents');
  }

  // Always attempt to remove the old registry entry so a failed native cleanup
  // does not leave a stale view blocking a future view creation.
  try {
    dependencies.forgetView(id, view);
  } catch {
    failures.push('forget-view');
  }

  return {
    status: failures.length > 0 ? 'failed' : 'closed',
    detached,
    closeAttempted,
    failures,
  };
}

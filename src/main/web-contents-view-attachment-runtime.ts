/**
 * Shared post-configuration lifecycle for native WebContentsViews.
 * Event handlers and secure WebContents setup stay in the Electron host; this
 * adapter owns navigation/attachment/registry ordering only and is testable with
 * simple fakes. Workspace-specific ordering can be preserved explicitly.
 */

export type InitialNavigationTiming = 'before-attach' | 'after-register';

export interface WebContentsViewAttachmentDependencies<TView> {
  initialNavigationTiming: InitialNavigationTiming;
  navigate(view: TView): void;
  attach(view: TView): void;
  register(view: TView): void;
  afterRegister?(view: TView): void;
}

export function attachAndRegisterWebContentsViewRuntime<TView>(
  view: TView,
  dependencies: WebContentsViewAttachmentDependencies<TView>,
): TView {
  if (dependencies.initialNavigationTiming === 'before-attach') {
    dependencies.navigate(view);
  }

  dependencies.attach(view);
  dependencies.register(view);
  dependencies.afterRegister?.(view);

  if (dependencies.initialNavigationTiming === 'after-register') {
    dependencies.navigate(view);
  }

  return view;
}

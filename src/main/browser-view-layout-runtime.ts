/**
 * Layout and visibility policy for the app's embedded WebContentsViews.
 * This module accepts structural view interfaces and live state callbacks instead
 * of importing Electron, so geometry and workspace visibility can be regression-tested.
 */

export interface BrowserViewBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BrowserLayoutView<TContents = unknown> {
  webContents: TContents;
  setBounds(bounds: BrowserViewBounds): void;
  setVisible(visible: boolean): void;
}

export interface BrowserLayoutRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BrowserViewLayoutState<TView extends BrowserLayoutView<TContents>, TContents> {
  sidebarWidth: number;
  toolbarHeight: number;
  sidebarHidden: boolean;
  locked: boolean;
  controlMode: string;
  workspaceApp: string;
  activeId: string | null;
  contentViews: Map<string, TView>;
  forgeContentViews: Map<string, TView>;
  forgeBrowserLayout: { main: BrowserLayoutRect | null };
  forgeBrowserAccountId: string | null;
  arenaContentViews: Map<string, TView>;
  arenaBrowserModels: { left: string | null; right: string | null };
  arenaBrowserLayout: { left: BrowserLayoutRect | null; right: BrowserLayoutRect | null };
  videoHubBrowserView: TView | null;
  videoHubBrowserLayout: { main: BrowserLayoutRect | null };
  videoHubSettingsOverlayOpen: boolean;
  videoHubNotificationOverlayOpen: boolean;
  imageHubBrowserView: TView | null;
  imageHubBrowserLayout: { main: BrowserLayoutRect | null };
}

export interface BrowserViewLayoutDependencies<TView extends BrowserLayoutView<TContents>, TContents> {
  getWindowContentBounds(): { width: number; height: number } | null;
  getControlView(): TView | null;
  getToolbarView(): TView | null;
  getState(): BrowserViewLayoutState<TView, TContents>;
  applyZoom(contents: TContents): void;
  applyArenaBrowserZoom(contents: TContents): void;
}

function roundedRect(rect: BrowserLayoutRect): BrowserViewBounds {
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height)),
  };
}

export function createBrowserViewLayoutRuntime<
  TView extends BrowserLayoutView<TContents>,
  TContents,
>(dependencies: BrowserViewLayoutDependencies<TView, TContents>) {
  function positionViews(): void {
    const bounds = dependencies.getWindowContentBounds();
    const controlView = dependencies.getControlView();
    if (!bounds || !controlView) return;

    const state = dependencies.getState();
    const { width, height } = bounds;
    const normalSidebarWidth = Math.min(state.sidebarWidth, Math.max(280, width - 480));
    const sidebarWidth = state.sidebarHidden ? 0 : normalSidebarWidth;
    // Settings, dialogs and the lock screen use the whole window.
    const fullScreenUi = state.locked || state.controlMode !== 'app';

    if (fullScreenUi) {
      controlView.setBounds({ x: 0, y: 0, width, height });
    } else {
      // Keep a real-sized view even while hidden; zero-sized WebContentsViews can fail to paint after restore.
      controlView.setBounds({ x: 0, y: 0, width: normalSidebarWidth, height });
    }
    controlView.setVisible(fullScreenUi || !state.sidebarHidden);

    const toolbarView = dependencies.getToolbarView();
    if (toolbarView) {
      // The toolbar spans the remaining window width so native window controls stay at the top-right edge.
      toolbarView.setBounds({ x: sidebarWidth, y: 0, width: Math.max(1, width - sidebarWidth), height: state.toolbarHeight });
      toolbarView.setVisible(!fullScreenUi && state.workspaceApp !== 'instruction-forge');
    }

    const arenaActive = !state.locked && state.workspaceApp === 'ai-lab' && state.controlMode === 'launcher';
    const forgeActive = !state.locked && state.workspaceApp === 'instruction-forge' && state.controlMode === 'launcher';

    for (const [id, view] of state.contentViews) {
      view.setBounds({
        x: sidebarWidth,
        y: state.toolbarHeight,
        width: Math.max(1, width - sidebarWidth),
        height: Math.max(1, height - state.toolbarHeight),
      });
      dependencies.applyZoom(view.webContents);
      view.setVisible(!state.locked && state.controlMode === 'app' && id === state.activeId && !arenaActive);
    }

    for (const [id, view] of state.forgeContentViews) {
      const rect = state.forgeBrowserLayout.main;
      if (forgeActive && id === state.forgeBrowserAccountId && rect) {
        // Forge rectangles are measured against the full workspace surface; don't add sidebar/toolbar offsets.
        view.setBounds(roundedRect(rect));
        dependencies.applyZoom(view.webContents);
        view.setVisible(true);
      } else {
        view.setVisible(false);
      }
    }

    for (const [id, view] of state.arenaContentViews) {
      const side = state.arenaBrowserModels.left === id ? 'left' : state.arenaBrowserModels.right === id ? 'right' : null;
      const rect = side ? state.arenaBrowserLayout[side] : null;
      if (arenaActive && rect) {
        view.setBounds(roundedRect(rect));
        dependencies.applyArenaBrowserZoom(view.webContents);
        view.setVisible(true);
      } else {
        view.setVisible(false);
      }
    }

    const videoHubActive = !state.locked && state.workspaceApp === 'video-hub' && state.controlMode === 'launcher';
    const videoHubView = state.videoHubBrowserView;
    if (videoHubView) {
      const rect = state.videoHubBrowserLayout.main;
      if (videoHubActive && rect && !state.videoHubSettingsOverlayOpen && !state.videoHubNotificationOverlayOpen) {
        videoHubView.setBounds(roundedRect(rect));
        dependencies.applyZoom(videoHubView.webContents);
        videoHubView.setVisible(true);
      } else {
        videoHubView.setVisible(false);
      }
    }

    // Image Hub's browser uses the same hardened native view policy as Video Hub.
    // Its layout rectangle comes from the renderer's visible Studio browser slot.
    const imageHubActive = !state.locked && state.workspaceApp === 'image-hub' && state.controlMode === 'launcher';
    const imageHubView = state.imageHubBrowserView;
    if (imageHubView) {
      const rect = state.imageHubBrowserLayout.main;
      if (imageHubActive && rect) {
        imageHubView.setBounds(roundedRect(rect));
        dependencies.applyZoom(imageHubView.webContents);
        imageHubView.setVisible(true);
      } else {
        imageHubView.setVisible(false);
      }
    }
  }

  return { positionViews };
}

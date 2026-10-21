/** Main window creation and lifecycle wiring, with Electron effects injected by main.js. */

export interface MainWindowStartupAccount {
  id: string;
  preferences?: { openOnStartup?: boolean };
}

export interface MainWindowConfig {
  accounts: MainWindowStartupAccount[];
  settings?: { startMaximized?: boolean; restoreLastAccount?: boolean; security?: { contentProtection?: boolean; lockOnMinimize?: boolean } };
  activeId?: string | null;
  accountOrder?: string[];
}

export interface MainWindowSecurity {
  contentProtection?: boolean;
  lockOnMinimize?: boolean;
}

export interface MainWindowLike {
  maximize(): void;
  setContentProtection(enabled: boolean): void;
  on(event: 'resize' | 'minimize' | 'closed', listener: (...args: any[]) => void): void;
}

export interface MainWindowControlView {
  webContents: {
    once(event: 'did-finish-load', listener: () => void): void;
    send(channel: string, payload: unknown): void;
    isDestroyed(): boolean;
  };
}

export interface MainWindowChild {
  close(): void;
}

export interface MainWindowRuntimeDependencies {
  createWindow(options: Record<string, unknown>): MainWindowLike;
  iconPath: string;
  getConfig(): MainWindowConfig;
  getSecurity(): MainWindowSecurity;
  getLocked(): boolean;
  getWorkspaceApp(): string;
  getActiveId(): string | null;
  setActiveId(id: string | null): void;
  getAccount(id: string): MainWindowStartupAccount | null;
  orderedConfigItems(accounts: MainWindowStartupAccount[], order?: string[]): MainWindowStartupAccount[];
  setMainWindow(window: MainWindowLike): void;
  createControlView(): void;
  createToolbarView(): void;
  getControlView(): MainWindowControlView | null;
  createAccountView(account: MainWindowStartupAccount | null): void;
  positionViews(): void;
  lockApp(): void;
  getChildWindows(): Iterable<MainWindowChild>;
  clearWindowReferences(): void;
  clearContentViews(): void;
  safeConfigForRenderer(): unknown;
  writeStartupDiagnostic(kind: string): void;
}

export function createMainWindowRuntime(dependencies: MainWindowRuntimeDependencies): MainWindowLike {
  const window = dependencies.createWindow({
    width: 1450,
    height: 920,
    minWidth: 900,
    minHeight: 560,
    title: 'Mad Station',
    icon: dependencies.iconPath,
    backgroundColor: '#0b1020',
    frame: false,
    roundedCorners: false,
  });
  // Publish the native window before constructing child views; those adapters attach
  // directly to the current window in the composition root.
  dependencies.setMainWindow(window);
  dependencies.createControlView();
  dependencies.createToolbarView();

  const config = dependencies.getConfig();
  if (config.settings?.startMaximized) window.maximize();
  try { window.setContentProtection(Boolean(dependencies.getSecurity().contentProtection)); } catch { /* best effort */ }
  window.on('resize', () => dependencies.positionViews());
  window.on('minimize', () => {
    if (dependencies.getSecurity().lockOnMinimize) dependencies.lockApp();
  });
  window.on('closed', () => {
    for (const child of [...dependencies.getChildWindows()]) {
      try { child.close(); } catch { /* best effort */ }
    }
    dependencies.clearWindowReferences();
    dependencies.clearContentViews();
  });

  const startupAccount = config.accounts.find((account) => account.preferences?.openOnStartup);
  const activeId = startupAccount?.id || (config.settings?.restoreLastAccount !== false && config.activeId && dependencies.getAccount(config.activeId)
    ? config.activeId
    : dependencies.orderedConfigItems(config.accounts, config.accountOrder)[0]?.id || null);
  dependencies.setActiveId(activeId);

  // While locked at launch, no website is loaded until the correct password is entered.
  if (activeId && dependencies.getWorkspaceApp() === 'ai-hub' && !dependencies.getLocked()) {
    dependencies.createAccountView(dependencies.getAccount(activeId));
  }

  const controlView = dependencies.getControlView();
  controlView?.webContents.once('did-finish-load', () => {
    dependencies.writeStartupDiagnostic('control-renderer-loaded');
    controlView.webContents.send('config', dependencies.safeConfigForRenderer());
    const currentActiveId = dependencies.getActiveId();
    if (currentActiveId && !dependencies.getLocked()) controlView.webContents.send('active-changed', { id: currentActiveId });
    dependencies.positionViews();
  });
  dependencies.positionViews();
  return window;
}

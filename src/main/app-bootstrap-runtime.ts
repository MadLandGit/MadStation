/** Testable Electron app-ready orchestration. All application services remain injected. */

export interface AppBootstrapLike {
  whenReady(): Promise<unknown>;
  on(event: 'activate' | 'window-all-closed', listener: () => void): void;
}

export interface AppBootstrapDependencies {
  app: AppBootstrapLike;
  platform: string;
  loadConfiguration(): void;
  cleanupRetiredRuntimeData(): void;
  disableApplicationMenu(): void;
  initializeSecurityState(): void;
  configureDefaultSessionSecurity(): void;
  writeStartupDiagnostic(kind: string): void;
  createMainWindow(): void;
  applyLiveAppSettings(): void;
  startLockWatchers(): void;
  warmRemoteIconsAndPush(): void;
  getMainWindow(): unknown;
  quit(): void;
  onStartupError(error: unknown): void;
}

/**
 * Preserve the established startup order: configuration and security setup must
 * precede window creation, while live settings and lock watchers follow it.
 */
export function registerAppBootstrapRuntime(dependencies: AppBootstrapDependencies): void {
  dependencies.app.whenReady().then(() => {
    dependencies.loadConfiguration();
    dependencies.cleanupRetiredRuntimeData();
    dependencies.disableApplicationMenu();
    dependencies.initializeSecurityState();
    dependencies.configureDefaultSessionSecurity();
    dependencies.writeStartupDiagnostic('app-ready-config-loaded');
    dependencies.createMainWindow();
    dependencies.writeStartupDiagnostic('main-window-created');
    dependencies.applyLiveAppSettings();
    dependencies.startLockWatchers();
    dependencies.warmRemoteIconsAndPush();
    dependencies.app.on('activate', () => {
      if (!dependencies.getMainWindow()) dependencies.createMainWindow();
    });
  }).catch((error: unknown) => dependencies.onStartupError(error));

  dependencies.app.on('window-all-closed', () => {
    if (dependencies.platform !== 'darwin') dependencies.quit();
  });
}

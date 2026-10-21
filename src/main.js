const {
  app,
  BaseWindow,
  BrowserWindow,
  WebContentsView,
  ipcMain,
  session,
  shell,
  dialog,
  powerMonitor,
  Notification,
  net,
  clipboard,
  safeStorage,
} = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');
const { fileURLToPath, pathToFileURL } = require('node:url');

// Startup diagnostics are intentionally independent of compiled app services so
// they can record a missing build file or an early initialization exception.
// Only error metadata is written; account names, URLs, cookies, and config data
// are never logged.
function diagnosticCandidates() {
  const candidates = [];
  try { candidates.push(path.join(app.getPath('userData'), 'startup-diagnostics.log')); } catch { /* app paths may not be ready */ }
  candidates.push(path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'MadStation-startup-diagnostics.log'));
  return [...new Set(candidates)];
}
function diagnosticText(value, maxLength = 4000) {
  return String(value ?? '').replace(/https?:\/\/[^\s"'`]+/gi, '[redacted-url]').slice(0, maxLength);
}
function writeStartupDiagnostic(kind, details = {}) {
  const record = { timestamp: new Date().toISOString(), kind };
  // The one-click startup diagnostic captures only these allowlisted event names
  // from stdout, which confirms real app startup after the user closes the UI.
  // Details stay in the redacted diagnostic file and are never echoed here.
  const startupConsoleEvents = new Set([
    'main-module-evaluated', 'app-ready-config-loaded', 'main-window-created',
    'control-renderer-loaded', 'control-renderer-load-failed', 'control-renderer-process-gone',
    'toolbar-renderer-loaded', 'toolbar-renderer-load-failed', 'toolbar-renderer-process-gone',
    'fatal-startup-error', 'unhandled-rejection',
  ]);
  try {
    if (startupConsoleEvents.has(kind)) console.log(`[Mad Station startup] ${kind}`);
  } catch { /* file logging remains authoritative */ }
  for (const [key, value] of Object.entries(details)) {
    if (value instanceof Error) {
      record[key] = { name: diagnosticText(value.name, 200), message: diagnosticText(value.message), stack: diagnosticText(value.stack, 6000) };
    } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
      record[key] = typeof value === 'string' ? diagnosticText(value, 2000) : value;
    }
  }
  const line = `${JSON.stringify(record)}\n`;
  for (const file of diagnosticCandidates()) {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      try { if (fs.statSync(file).size > 1024 * 1024) fs.writeFileSync(file, ''); } catch { /* new log */ }
      fs.appendFileSync(file, line, 'utf8');
      return file;
    } catch { /* try temp fallback */ }
  }
  return 'log file could not be written';
}
function showFatalStartupError(title, error) {
  const summary = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const logPath = writeStartupDiagnostic('fatal-startup-error', { error: error instanceof Error ? error : new Error(summary) });
  try { dialog.showErrorBox(title, `${diagnosticText(summary, 1500)}\n\nDiagnostic log: ${logPath}`); } catch { /* log is still available */ }
  try { app.exit(1); } catch { process.exitCode = 1; }
}
process.on('uncaughtException', (error) => showFatalStartupError('Mad Station encountered a fatal error', error));
process.on('unhandledRejection', (reason) => {
  const error = reason instanceof Error ? reason : new Error(diagnosticText(reason, 2000));
  writeStartupDiagnostic('unhandled-rejection', { error });
});
writeStartupDiagnostic('main-module-evaluated', { nodeVersion: process.versions.node, electronVersion: process.versions.electron || 'unknown' });

const { createRemoteIconCache } = require('../build/main/icon-cache.js');
const { resolvePublicInternetAddresses, createPinnedHttpsRequest, fetchPinnedHttpsJson } = require('../build/main/network-security.js');
const DEFAULT_SERVICES = require('./default-providers');
const { createDownloadManager, normalizeDownloadSettings, DEFAULT_DOWNLOAD_SETTINGS } = require('../build/main/downloads.js');
const { createDownloadsController } = require('../build/main/downloads-controller.js');
const { isSafeIpcPayload } = require('../build/main/ipc-validation.js');
const { isPlainObject, cleanText, cleanId, normalizeHttpsUrl, sanitizeIcon, faviconForUrl, iconKey, hostOf, hostMatches, isControlMode, isStringWithinLength, isBooleanValue } = require('../build/main/input-validation.js');
const { createConfigSchema } = require('../build/main/config-schema.js');
const { createConfigStore } = require('../build/main/config-store.js');
const { createSettingsController } = require('../build/main/settings-controller.js');
const { registerSettingsIpcHandlers } = require('../build/main/settings-ipc.js');
const { registerDownloadsIpcHandlers } = require('../build/main/downloads-ipc.js');
const { registerVideoHubIpcHandlers } = require('../build/main/video-hub-ipc.js');
const { registerAiHubIpcHandlers } = require('../build/main/ai-hub-ipc.js');
const { createVideoHubStoreController } = require('../build/main/video-hub-controller.js');
const { createAtomicJsonFileStore } = require('../build/main/json-file-store.js');
const { createAiHubController } = require('../build/main/ai-hub-controller.js');
const { buildAiHubReadModel, orderedConfigItems, reorderConfigCollection } = require('../build/main/ai-hub-read-model.js');
const { createDiagnosticsController, diagnosticError, summarizeMemoryForDiagnostics, writeDiagnosticsJsonAtomically } = require('../build/main/diagnostics-controller.js');
const { registerDiagnosticsIpcHandlers } = require('../build/main/diagnostics-ipc.js');
const { createWorkspaceTransferController } = require('../build/main/workspace-transfer-controller.js');
const { registerWorkspaceTransferIpcHandlers } = require('../build/main/workspace-transfer-ipc.js');
const { readWorkspaceJson, writeWorkspaceJsonAtomically } = require('../build/main/workspace-transfer-files.js');
const { createBackgroundFilesController } = require('../build/main/background-files.js');
const { registerBackgroundIpcHandlers } = require('../build/main/background-ipc.js');
const { createAiLabCredentialStore } = require('../build/main/ai-lab-credentials.js');
const { createAiLabRuntime } = require('../build/main/ai-lab-runtime.js');
const { createArenaStoreRuntime } = require('../build/main/arena-store-runtime.js');
const { createAccountPromptRuntime } = require('../build/main/account-prompt-runtime.js');
const { createNativeOperationsRuntime } = require('../build/main/native-operations-runtime.js');
const { buildThemeDesignPack, discoverThemeDesigns } = require('../build/main/theme-design-export.js');
const { scanThemePackZip, importScannedThemePack, getImportedThemeCatalog, removeImportedTheme, getThemeImportRestartStatus, clearThemeImportRestartStatus } = require('../build/main/theme-pack-import.js');
const { createArenaBrowserRuntime } = require('../build/main/arena-browser-runtime.js');
const { createArenaPromptRuntime } = require('../build/main/arena-prompt-runtime.js');
const { createForgeBrowserRuntime } = require('../build/main/forge-browser-runtime.js');
const { createVideoHubBrowserRuntime } = require('../build/main/video-hub-browser-runtime.js');
const { createImageHubBrowserRuntime } = require('../build/main/image-hub-browser-runtime.js');
const { createVideoHubNetworkRuntime } = require('../build/main/video-hub-network-runtime.js');
const { createAccountBrowserRuntime } = require('../build/main/account-browser-runtime.js');
const { createMemoryDiagnosticsRuntime } = require('../build/main/memory-diagnostics-runtime.js');
const { createSystemCpuUsageSampler } = require('./main/system-cpu-usage.js');
const { createIconRuntime } = require('../build/main/icon-runtime.js');
const { planViewPrune } = require('../build/main/browser-view-policy.js');
const { closeAccountBrowserViewRuntime } = require('../build/main/browser-view-runtime.js');
const { applyViewPrunePlan } = require('../build/main/browser-view-pruning-runtime.js');
const { reclaimAccountViewsRuntime } = require('../build/main/browser-view-reclamation-runtime.js');
const { closeWorkspaceBrowserViewRuntime } = require('../build/main/workspace-browser-view-runtime.js');
const { createSessionLifecycleRuntime, clearSessionDataRuntime } = require('../build/main/session-lifecycle-runtime.js');
const { createBrowserViewLayoutRuntime } = require('../build/main/browser-view-layout-runtime.js');
const { attachAndRegisterWebContentsViewRuntime } = require('../build/main/web-contents-view-attachment-runtime.js');
const { bindAiHubBrowserEvents, bindForgeBrowserEvents, bindVideoHubBrowserEvents, bindArenaBrowserEvents } = require('../build/main/workspace-browser-events.js');
const { wipeArenaAccountDataRuntime } = require('../build/main/arena-account-data-runtime.js');
const { createLockSecurityService, createPasswordAttemptLimiter } = require('../build/main/lock-security.js');
const { createLockController } = require('../build/main/lock-controller.js');
const { registerLockIpcHandlers } = require('../build/main/lock-ipc.js');
const { createDeveloperOptionsAuth } = require('./main/developer-options-auth.js');
const { startLockWatchersRuntime } = require('../build/main/app-lifecycle-runtime.js');
const { createAccountSessionSecurity } = require('../build/main/account-session-security.js');
const { createMainWindowRuntime } = require('../build/main/main-window-runtime.js');
const { registerAppBootstrapRuntime } = require('../build/main/app-bootstrap-runtime.js');

const SIDEBAR_WIDTH = 368;
const TOOLBAR_HEIGHT = 50;
const APP_VERSION = app.getVersion();
const CONFIG_SCHEMA_VERSION = 13;
const MAX_ICON_FILE_BYTES = 512 * 1024;
const ICON_FOLDER_NAME = 'icons';
const ICON_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.ico', '.gif']);
const REMOTE_ICON_CACHE_FOLDER_NAME = 'remote-cache';
const MAX_LIVE_ACCOUNT_VIEWS = 4;
const { DEFAULT_SECURITY, DEFAULT_APP_SETTINGS, normalizeAppSettings, normalizeSecurity, ZOOM_CHOICES } = require('../build/main/settings.js');

// Sign-in pages that official AI sites commonly use. Only used for navigation and
// popups (never for website permissions), and can be switched off in Security settings.
const LOGIN_PROVIDER_HOSTS = [
  'accounts.google.com',
  'appleid.apple.com',
  'idmsa.apple.com',
  'login.microsoftonline.com',
  'login.live.com',
  'github.com',
  'facebook.com',
  'auth0.com',
];

const SAFE_WEB_PREFERENCES = {
  sandbox: true,
  contextIsolation: true,
  nodeIntegration: false,
  webSecurity: true,
  allowRunningInsecureContent: false,
  webviewTag: false,
  safeDialogs: true,
};

const RENDERER_FILE = path.join(__dirname, 'renderer.html');
const DEVELOPER_DEBUG_WINDOW_FILE = path.join(__dirname, 'developer-debug-window.html');
const DEVELOPER_DEBUG_WINDOW_PRELOAD = path.join(__dirname, 'developer-debug-window-preload.js');
// The trusted browser toolbar is compiled by Vite from toolbar.html + React/TypeScript.
const TOOLBAR_FILE = path.resolve(__dirname, '../build/toolbar.html');
const PRELOAD_FILE = path.resolve(__dirname, '../build/preload.js');
const TOOLBAR_PRELOAD_FILE = path.resolve(__dirname, '../build/toolbar-preload.js');

let mainWindow = null;
let developerDebugWindow = null;
let latestDeveloperDebugSnapshot = null;
let developerDebugClickClearBefore = 0;
let controlView = null;
let toolbarView = null;
let workspaceApp = 'launcher';
let activeId = null;
let controlMode = 'launcher';
let locked = false;
let diskCacheDisabledAtLaunch = false;
let quitCleanupStarted = false;
let config = null;
// Initialize app-lock helpers before config-schema consumes normalizeLock below.
// The service reads `config` only when a password operation runs after startup.
const lockSecurity = createLockSecurityService({ getLock: () => config?.lock });
const { normalizeLock, normalizePassword, hasPassword, createLock, verifyPassword } = lockSecurity;
const developerOptionsAuth = createDeveloperOptionsAuth({
  getFilePath: () => path.join(app.getPath('userData'), 'developer-options-password.json'),
});
const contentViews = new Map();
const aiLabBorrowedAccountViews = new Set();
// Model Arena owns its own providers, accounts and browser runtime. Nothing is
// shared with AI Hub: Arena accounts live in arena-accounts.json and every Arena
// account has its own persistent session partition (persist:arena-<id>).
const arenaBrowserModels = { left: null, right: null };
const arenaBrowserLayout = { left: null, right: null };
const arenaContentViews = new Map();
// Video Hub has its own account store and persistent Chromium partitions. It
// never reuses AI Hub or Model Arena sessions. Only the selected account keeps
// a live browser view while Video Hub is open.
let videoHubStore = null;
let videoHubNetworkMode = null;
let videoHubActiveAccountId = null;
let videoHubBrowserView = null;
let videoHubSettingsOverlayOpen = false;
let videoHubNotificationOverlayOpen = false;
const videoHubBrowserLayout = { main: null };
let imageHubBrowserView = null;
const imageHubBrowserLayout = { main: null };
const imageHubChildWindows = new Set();
// Proxy setup is asynchronous. Never navigate a Video Hub view until its session
// has applied the selected network mode.
const videoHubPendingViewCreations = new Map();
let videoHubViewRequestSerial = 0;
const videoHubChildWindows = new Set();
// Instruction Forge uses the same persistent account partitions as AI Hub, but
// owns its own Chromium views so leaving Forge can tear them down without
// touching the AI Hub workspace. Only a small LRU set stays alive while inside Forge.
const MAX_LIVE_FORGE_BROWSER_VIEWS = 4;
const forgeContentViews = new Map();
const forgeBrowserLayout = { main: null };
let forgeBrowserAccountId = null;
let sidebarHidden = false;
const accountRuntime = new Map();

function accountRuntimeFor(id) {
  let runtime = accountRuntime.get(id);
  if (!runtime) {
    runtime = { pageLoads: 0, navigations: 0, lastLoadedAt: 0, lastVisitedAt: 0, currentUrl: '', currentTitle: '', lastError: '' };
    accountRuntime.set(id, runtime);
  }
  return runtime;
}

const childWindows = new Set();
const configuredSessions = new WeakSet();

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function randomId() {
  return crypto.randomBytes(5).toString('hex');
}

const iconRuntime = createIconRuntime({
  path,
  fs,
  getUserDataPath: () => app.getPath('userData'),
  iconFolderName: ICON_FOLDER_NAME,
  remoteCacheFolderName: REMOTE_ICON_CACHE_FOLDER_NAME,
  iconExtensions: ICON_EXTENSIONS,
  maxIconFileBytes: MAX_ICON_FILE_BYTES,
  maxLocalCacheBytes: 16 * 1024 * 1024,
  iconKey,
  hostOf,
  sanitizeIcon,
  faviconForUrl,
  getConfig: () => config,
  remoteIconsEnabled: () => security().remoteIcons !== false,
  createRemoteCache: (folder) => createRemoteIconCache(folder),
  pushConfig: () => pushConfig(),
});
function iconFolderPath() { return iconRuntime.iconFolderPath(); }
function imageDataUrl(filePath) { return iconRuntime.imageDataUrl(filePath); }
function localIconFor(service) { return iconRuntime.localIconFor(service); }
function rawIconCandidatesFor(service, preferred = '') { return iconRuntime.rawIconCandidatesFor(service, preferred); }
function remoteIconCacheFolderPath() { return iconRuntime.remoteIconCacheFolderPath(); }
function getRemoteIconCache() { return iconRuntime.getRemoteIconCache(); }
function iconCandidatesFor(service, preferred = '', options = {}) { return iconRuntime.iconCandidatesFor(service, preferred, options); }
function warmRemoteIcons() { return iconRuntime.warmRemoteIcons(); }
function warmRemoteIconsAndPush() { return iconRuntime.warmRemoteIconsAndPush(); }

// ---------------------------------------------------------------------------
// Config (atomic writes, backup, corrupt-file quarantine)
// ---------------------------------------------------------------------------

function configPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

function shortcutForIndex(index) {
  const n = index + 1;
  if (n <= 9) return `Ctrl+${n}`;
  if (n <= 18) return `Ctrl+Shift+${n - 9}`;
  if (n <= 27) return `Ctrl+Alt+${n - 18}`;
  return '';
}

const {
  normalizeProviderMetadata,
  normalizeAccountPreferences,
  makeDefaultConfig,
  migrateConfig,
} = createConfigSchema({
  defaultServices: DEFAULT_SERVICES,
  configSchemaVersion: CONFIG_SCHEMA_VERSION,
  randomId,
  shortcutForIndex,
  normalizeShortcut,
  normalizeLock,
  zoomChoices: ZOOM_CHOICES,
  defaultAppSettings: DEFAULT_APP_SETTINGS,
  defaultSecurity: DEFAULT_SECURITY,
  defaultDownloadSettings: DEFAULT_DOWNLOAD_SETTINGS,
  normalizeAppSettings,
  normalizeSecurity,
  normalizeDownloadSettings,
});

const { saveConfig, loadConfig } = createConfigStore({
  getFilePath: configPath,
  migrateConfig,
  makeDefaultConfig,
});

function security() {
  return config?.settings?.security || DEFAULT_SECURITY;
}

function downloadSettings() {
  return config?.settings?.downloads || DEFAULT_DOWNLOAD_SETTINGS;
}

// ---------------------------------------------------------------------------
// Downloads (see src/main/downloads.ts). Lists are kept in memory only: nothing about what you
// downloaded is written to Mad Station's own settings, and the list is gone after a restart.
// ---------------------------------------------------------------------------

function pushDownloads() {
  if (locked) return;
  if (controlView && !controlView.webContents.isDestroyed()) {
    controlView.webContents.send('downloads', downloads.getState());
  }
}

function announceDownload(entry) {
  if (!downloadSettings().notifyWhenDone) return;
  const ok = entry.state === 'completed';
  const message = ok ? `Downloaded ${entry.name}` : `Download failed: ${entry.name}`;
  if (!locked) notice(message);
  const background = !mainWindow || mainWindow.isMinimized() || !mainWindow.isFocused();
  if (background && Notification.isSupported()) {
    try {
      // While locked, the file name is not shown outside the lock screen.
      new Notification({ title: ok ? 'Download complete' : 'Download failed', body: locked ? '' : entry.name, silent: true }).show();
    } catch { /* notifications are best effort */ }
  }
}

const downloads = createDownloadManager({
  getSettings: downloadSettings,
  getDefaultFolder: () => app.getPath('downloads'),
  getAccountName: (id) => getAccount(id)?.name || '',
  shell,
  onChange: pushDownloads,
  onFinished: announceDownload,
});

function getAccount(id) {
  return config.accounts.find((a) => a.id === id) || null;
}

function getService(id) {
  return config.services.find((s) => s.id === id) || null;
}

// Account session policy is a typed module. Native session creation/partition ownership
// remains in this composition root; every security decision receives live state here.
const accountSessionSecurity = createAccountSessionSecurity({
  getSecurity: security,
  getService,
  hostMatches,
  loginProviderHosts: LOGIN_PROVIDER_HOSTS,
  safeWebPreferences: SAFE_WEB_PREFERENCES,
  handleWillDownload: (item, accountId) => downloads.handleWillDownload(item, accountId),
  openExternal: (url) => shell.openExternal(url),
  getPlatform: () => process.platform,
  getSessionForAccount: (account) => sessionFor(account),
  getChildWindows: () => childWindows,
  getVideoHubChildWindows: () => videoHubChildWindows,
  getImageHubChildWindows: () => imageHubChildWindows,
  notice,
  hostOf,
  warn: (message) => console.warn(message),
});

// AI Hub account/provider data transitions are typed and independently tested.
// Session teardown, persistence timing, broadcasts, and activation remain here.
const aiHubController = createAiHubController({
  getConfig: () => config,
  getService,
  getAccount,
  cleanText,
  normalizeHttpsUrl,
  sanitizeIcon,
  faviconForUrl,
  normalizeShortcut,
  normalizeProviderMetadata,
  normalizeAccountPreferences,
  randomId,
});

// Account transfer and workspace backup data transformations are typed and pure.
// Native dialogs, file I/O, secure IPC, persistence timing, and restore/session
// sequencing remain owned by this Electron composition root.
const workspaceTransferController = createWorkspaceTransferController({
  cleanText,
  normalizeHttpsUrl,
  sanitizeIcon,
  faviconForUrl,
  normalizeProviderMetadata,
  normalizeAccountPreferences,
  randomId,
  migrateConfig,
});
const workspaceTransferFileDependencies = {
  path,
  fs,
  temporarySuffix: () => `${process.pid}-${randomId()}`,
};
const backgroundFilesController = createBackgroundFilesController({
  path,
  fs,
  url: { fileURLToPath, pathToFileURL },
  getStoreDirectory: () => path.join(app.getPath('userData'), 'backgrounds'),
  createId: randomId,
  now: () => new Date().toISOString(),
  copyFileExclusiveFlag: fs.constants.COPYFILE_EXCL,
  redactError: (error, fallback) => diagnosticError(error, fallback) || fallback,
});

function arenaSessionFor(account) {
  return sessionLifecycleRuntime.getArenaSession(account);
}
// ---------------------------------------------------------------------------
// App lock (scrypt-hashed password; a UI gate, not disk encryption)
// Password storage and brute-force slowdown are kept in a pure TypeScript service.
// ---------------------------------------------------------------------------
const passwordAttemptLimiter = createPasswordAttemptLimiter({ verifyPassword });
async function checkPasswordWithLimit(password) {
  return passwordAttemptLimiter.check(password);
}

const lockController = createLockController({
  normalizePassword,
  hasPassword,
  checkPassword: checkPasswordWithLimit,
  createLock,
  setLock: (nextLock) => { config.lock = nextLock; },
  clearLock: () => { delete config.lock; },
  broadcastConfig,
  lockApp: (workspace) => lockApp(workspace),
  getWorkspaceApp: () => workspaceApp,
  isLocked: () => locked,
  unlockApp,
  wipeAllSessions,
});

const VALID_WORKSPACE_APPS = new Set(['launcher', 'ai-hub', 'clipboard', 'ai-lab', 'instruction-forge', 'video-hub', 'image-hub']);
function normalizeWorkspaceApp(app) {
  return VALID_WORKSPACE_APPS.has(app) ? app : 'launcher';
}

function lockApp(requestedWorkspaceApp = null) {
  if (!hasPassword() || locked || !mainWindow) return false;
  // Manual lock requests come from the renderer and carry the workspace that the
  // user was actually viewing. This prevents a stale main-process workspace from
  // restoring an unrelated browser after unlock.
  if (requestedWorkspaceApp != null) workspaceApp = normalizeWorkspaceApp(requestedWorkspaceApp);
  developerOptionsAuth.lock();
  locked = true;
  // A locked workspace must not keep provider or Arena web renderers alive.
  closeAllAccountViews();
  clearArenaBrowserBindings();
  closeAllForgeBrowserViews({ clearSelection: false });
  suspendVideoHubBrowsers(false);
  suspendImageHubBrowsers(false);
  for (const child of [...childWindows]) {
    try { child.close(); } catch { /* ignore */ }
  }
  controlMode = 'app';
  positionViews();
  pushConfig();
  if (controlView && !controlView.webContents.isDestroyed()) {
    controlView.webContents.send('workspace-app', { app: workspaceApp });
    controlView.webContents.send('control-mode', { mode: 'app' });
    controlView.webContents.focus();
  }
  return true;
}

function restoreWorkspaceAfterUnlock() {
  // Restore the exact workspace that was active when the app was locked. The
  // renderer is explicitly resynchronized before account browser recreation.
  if (workspaceApp === 'ai-hub') {
    controlMode = 'app';
    positionViews();
    if (controlView && !controlView.webContents.isDestroyed()) {
      controlView.webContents.send('workspace-app', { app: workspaceApp });
      controlView.webContents.send('control-mode', { mode: 'app' });
    }
    if (activeId && getAccount(activeId)) activateAccount(activeId);
    return;
  }
  if (workspaceApp === 'instruction-forge') {
    controlMode = 'launcher';
    positionViews();
    if (controlView && !controlView.webContents.isDestroyed()) {
      controlView.webContents.send('workspace-app', { app: workspaceApp });
      controlView.webContents.send('control-mode', { mode: 'launcher' });
    }
    if (forgeBrowserAccountId && getAccount(forgeBrowserAccountId)) setForgeBrowserAccount(forgeBrowserAccountId);
    return;
  }
  if (workspaceApp === 'image-hub') {
    controlMode = 'launcher';
    positionViews();
    if (controlView && !controlView.webContents.isDestroyed()) {
      controlView.webContents.send('workspace-app', { app: workspaceApp });
      controlView.webContents.send('control-mode', { mode: 'launcher' });
    }
    return;
  }
  if (workspaceApp === 'video-hub') {
    controlMode = 'launcher';
    positionViews();
    if (controlView && !controlView.webContents.isDestroyed()) {
      controlView.webContents.send('workspace-app', { app: workspaceApp });
      controlView.webContents.send('control-mode', { mode: 'launcher' });
    }
    const selected = loadVideoHubStore().activeAccountId;
    if (selected) setVideoHubActiveAccount(selected);
    return;
  }
  closeAllAccountViews();
  clearArenaBrowserBindings();
  controlMode = 'launcher';
  positionViews();
  if (controlView && !controlView.webContents.isDestroyed()) {
    controlView.webContents.send('workspace-app', { app: workspaceApp });
    controlView.webContents.send('control-mode', { mode: 'launcher' });
  }
}

function unlockApp() {
  locked = false;
  passwordAttemptLimiter.reset();
  pushConfig();
  restoreWorkspaceAfterUnlock();
}

// ---------------------------------------------------------------------------
// Sessions, permissions and web protection
// ---------------------------------------------------------------------------

function allowedHostsForAccount(account) { return accountSessionSecurity.allowedHostsForAccount(account); }
function permissionAllowed(permission, details = {}, account = null) { return accountSessionSecurity.permissionAllowed(permission, details, account); }
function configureSession(sess, account) { return accountSessionSecurity.configureSession(sess, account); }

// Navigation helpers: prefer webContents.navigationHistory, fall back to the older methods.
function navCanGoBack(wc) { const h = wc.navigationHistory; return h ? h.canGoBack() : wc.canGoBack(); }
function navCanGoForward(wc) { const h = wc.navigationHistory; return h ? h.canGoForward() : wc.canGoForward(); }
function navGoBack(wc) { const h = wc.navigationHistory; if (h) h.goBack(); else wc.goBack(); }
function navGoForward(wc) { const h = wc.navigationHistory; if (h) h.goForward(); else wc.goForward(); }

function openExternalSafe(url) { return accountSessionSecurity.openExternalSafe(url); }
function isGoogleAuthUrl(rawUrl) { return accountSessionSecurity.isGoogleAuthUrl(rawUrl); }
function externalEntryUrlForAccount(account) { return accountSessionSecurity.externalEntryUrlForAccount(account); }
function externalUrlForPage(rawUrl, account) { return accountSessionSecurity.externalUrlForPage(rawUrl, account); }
function openGoogleAuthFallback(account) { return accountSessionSecurity.openGoogleAuthFallback(account); }

function notice(message) {
  if (controlView && !controlView.webContents.isDestroyed()) {
    controlView.webContents.send('notice', { message });
  }
}

function evaluateUrl(rawUrl, account, restrictHosts) { return accountSessionSecurity.evaluateUrl(rawUrl, account, restrictHosts); }
function hardenAccountContents(contents, account, browserSession = sessionFor(account)) {
  return accountSessionSecurity.hardenAccountContents(contents, account, browserSession);
}

// Session partitions and one-time permission/network setup have a typed lifecycle
// owner. Electron Session instances remain created by the composition root.
const sessionLifecycleRuntime = createSessionLifecycleRuntime({
  fromPartition: (partition, options) => session.fromPartition(partition, options),
  cacheEnabled: () => !diskCacheDisabledAtLaunch,
  configureSession: (sess, account) => configureSession(sess, account),
  getVideoHubNetworkMode: () => getVideoHubNetworkMode(),
  applyVideoHubProxy: (sess, mode) => applyVideoHubProxyToSession(sess, mode),
  onVideoHubProxyFailure: (account, error) => {
    console.error(`[Mad Station network] Video Hub proxy setup failed: ${error?.message || 'unknown error'}`);
  },
});
function sessionFor(account) { return sessionLifecycleRuntime.getAccountSession(account); }

// Applies to every web contents the app ever creates.
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', (event) => event.preventDefault());
  contents.on('devtools-opened', () => {
    if (security().blockDevTools) contents.closeDevTools();
  });
});

function applyLiveSecurity() {
  const sec = security();
  try { if (mainWindow) mainWindow.setContentProtection(Boolean(sec.contentProtection)); } catch { /* ignore */ }
  try { session.defaultSession.setSpellCheckerEnabled(sec.spellcheck); } catch { /* ignore */ }
  for (const account of config.accounts) {
    try { sessionFor(account).setSpellCheckerEnabled(sec.spellcheck); } catch { /* ignore */ }
  }
}

// ---------------------------------------------------------------------------
// Cache and data clearing
// ---------------------------------------------------------------------------

async function clearAccountCaches(account) {
  await clearSessionDataRuntime(sessionFor(account), 'application-cache');
}

async function clearAccountEverything(account) {
  await clearSessionDataRuntime(sessionFor(account), 'all');
}

async function wipeTemporaryAccounts() {
  const temporary = config.accounts.filter((account) => account.temporary);
  for (const account of temporary) { removeAccountView(account.id); try { await clearAccountEverything(account); } catch {} }
  if (!temporary.length) return;
  const ids = new Set(temporary.map((a) => a.id));
  config.accounts = config.accounts.filter((a) => !ids.has(a.id));
  config.accountOrder = (config.accountOrder || []).filter((id) => !ids.has(id));
  config.recentAccountIds = (config.recentAccountIds || []).filter((id) => !ids.has(id));
  if (ids.has(activeId)) activeId = orderedConfigItems(config.accounts, config.accountOrder)[0]?.id || null;
  config.activeId = activeId;
}

async function wipeAllSessions() {
  for (const [id, view] of contentViews) {
    try {
      mainWindow?.contentView.removeChildView(view);
      view.webContents.close();
    } catch { /* ignore */ }
    contentViews.delete(id);
  }
  await Promise.allSettled(config.accounts.map((account) => clearAccountEverything(account)));
}

async function runExitCleanup() {
  const sec = security();
  const regularSessionWork = config.accounts.map((account) => (
    account.preferences?.signOutOnExit === true || (account.preferences?.signOutOnExit === null && sec.signOutOnExit) ? clearAccountEverything(account) : ((account.preferences?.clearCacheOnExit !== false && sec.clearCacheOnExit) ? clearAccountCaches(account) : Promise.resolve())
  ));
  const videoSessionWork = loadVideoHubStore().accounts.map(async (account) => {
    if (!sec.signOutOnExit && !sec.clearCacheOnExit) return;
    const sess = sessionLifecycleRuntime.sessionForPartition(sessionLifecycleRuntime.sessionPartition.videoHub(account));
    await clearSessionDataRuntime(sess, sec.signOutOnExit ? 'all' : 'application-cache');
  });
  const work = Promise.allSettled([...regularSessionWork, ...videoSessionWork]);
  await Promise.race([work, new Promise((resolve) => setTimeout(resolve, 8000))]);
}

app.on('before-quit', async (event) => {
  if (quitCleanupStarted || !config) return;
  const sec = security();
  if (!sec.clearCacheOnExit && !sec.signOutOnExit && !config.accounts.some((a) => a.temporary)) return;
  event.preventDefault();
  quitCleanupStarted = true;
  try { await wipeTemporaryAccounts(); if (!saveConfig(config)) console.error('Could not save cleanup state before quitting.'); } catch (error) { console.error('Quit cleanup failed:', error); }
  runExitCleanup().catch(() => {}).finally(() => app.quit());
});

// ---------------------------------------------------------------------------
// Views and windows
// ---------------------------------------------------------------------------

// Applies the general settings that take effect immediately (zoom, start with Windows).
const AI_LAB_BROWSER_ZOOM = 0.70;

function applyZoom(wc) {
  try {
    if (!wc || wc.isDestroyed()) return;
    const accountId = [...contentViews.entries()].find(([, view]) => view.webContents === wc)?.[0];
    const prefs = accountId ? getAccount(accountId)?.preferences : null;
    wc.setZoomFactor((prefs?.pageZoom || config?.settings?.pageZoom || 100) / 100);
  } catch { /* ignore */ }
}

function applyArenaBrowserZoom(wc) {
  try {
    if (!wc || wc.isDestroyed()) return;
    wc.setZoomFactor(AI_LAB_BROWSER_ZOOM);
  } catch { /* ignore */ }
}

function applyLiveAppSettings() {
  for (const view of contentViews.values()) applyZoom(view.webContents);
  // Only the installed app can register itself with Windows; `npm start` would register Electron itself.
  if (app.isPackaged) {
    try { app.setLoginItemSettings({ openAtLogin: Boolean(config?.settings?.launchAtLogin) }); } catch { /* ignore */ }
  }
}

const accountBrowserRuntime = createAccountBrowserRuntime({
  views: contentViews,
  maxLiveViews: MAX_LIVE_ACCOUNT_VIEWS,
  getWorkspaceApp: () => workspaceApp,
  isLocked: () => locked,
  getAccount: (id) => getAccount(id),
  getRuntime: (id) => accountRuntimeFor(id),
  getSession: (account) => sessionFor(account),
  createNativeView: (_account, sess) => new WebContentsView({ webPreferences: { ...SAFE_WEB_PREFERENCES, session: sess } }),
  hardenView: (view, account, sess) => hardenAccountContents(view.webContents, account, sess),
  bindEvents: (view, account) => bindAiHubBrowserEvents(view, account, {
    normalizeShortcutFromInput,
    handleShortcut,
    handleBrowserKey,
    getRuntime: accountRuntimeFor,
    getActiveAccountId: () => activeId,
    isLocked: () => locked,
    getControlContents: () => controlView?.webContents || null,
    pushToolbar,
    notice,
    applyZoom,
  }),
  attachView: (view) => mainWindow.contentView.addChildView(view),
  detachView: (view) => mainWindow?.contentView.removeChildView(view),
  isWebContentsDestroyed: (view) => view.webContents.isDestroyed(),
  closeWebContents: (view) => view.webContents.close(),
  getConfig: () => config,
  saveConfig: (current) => saveConfig(current),
  getActiveId: () => activeId,
  setActiveId: (id) => { activeId = id; },
  cancelDownloads: (id) => downloads.cancelForAccount(id),
  closeForgeBrowserView: (id, options) => closeForgeBrowserView(id, options),
  removeRuntime: (id) => accountRuntime.delete(id),
  positionViews: () => positionViews(),
  moveViewToFront: (view) => { mainWindow.contentView.removeChildView(view); mainWindow.contentView.addChildView(view); },
  notice: (message) => notice(message),
  notifyActiveChanged: (id) => {
    if (controlView && !controlView.webContents.isDestroyed()) controlView.webContents.send('active-changed', { id });
  },
  pushToolbar: () => pushToolbar(),
  now: () => Date.now(),
  warn: (message, count) => console.warn(message, count),
});
function pruneInactiveAccountViews(preferredId = activeId) { return accountBrowserRuntime.pruneInactiveViews(preferredId); }
function createAccountView(account, options = {}) { return accountBrowserRuntime.createView(account, options); }

// ---------------------------------------------------------------------------
// Instruction Forge browser runtime: one persistent session per AI Hub account,
// with a bounded number of live Chromium views while Forge is open.
// ---------------------------------------------------------------------------
const forgeBrowserRuntime = createForgeBrowserRuntime({
  views: forgeContentViews,
  layout: forgeBrowserLayout,
  getSelectedAccountId: () => forgeBrowserAccountId,
  setSelectedAccountId: (id) => { forgeBrowserAccountId = id; },
  getAccount: (id) => getAccount(id),
  getServiceName: (serviceId) => getService(serviceId)?.name || '',
  getWorkspaceApp: () => workspaceApp,
  isLocked: () => locked,
  maxLiveViews: MAX_LIVE_FORGE_BROWSER_VIEWS,
  getLastVisitedAt: (id) => accountRuntimeFor(id).lastVisitedAt || 0,
  setLastVisitedAt: (id, timestamp) => { accountRuntimeFor(id).lastVisitedAt = timestamp; },
  createNativeView: (account) => {
    const sess = sessionFor(account);
    const view = new WebContentsView({ webPreferences: { ...SAFE_WEB_PREFERENCES, session: sess } });
    hardenAccountContents(view.webContents, account);
    bindForgeBrowserEvents(view, account, {
      normalizeShortcutFromInput,
      handleShortcut,
      handleBrowserKey,
      getRuntime: accountRuntimeFor,
      getSelectedAccountId: () => forgeBrowserAccountId,
      pushState: pushForgeBrowserState,
      notice,
      applyZoom,
    });
    return view;
  },
  loadUrl: (view, url) => { void view.webContents.loadURL(url); },
  attachView: (view) => mainWindow.contentView.addChildView(view),
  detachView: (view) => { mainWindow?.contentView.removeChildView(view); },
  closeWebContents: (view) => view.webContents.close(),
  isWebContentsDestroyed: (view) => view.webContents.isDestroyed(),
  positionViews: () => positionViews(),
  notifyState: (state) => {
    if (controlView && !controlView.webContents.isDestroyed()) controlView.webContents.send('forge-browser-state', state);
  },
  canGoBack: (view) => navCanGoBack(view.webContents),
  canGoForward: (view) => navCanGoForward(view.webContents),
  goBack: (view) => navGoBack(view.webContents),
  goForward: (view) => navGoForward(view.webContents),
});
function forgeBrowserState() { return forgeBrowserRuntime.stateForRenderer(); }
function pushForgeBrowserState() { return forgeBrowserRuntime.pushState(); }
function pruneForgeBrowserViews(preferredId = forgeBrowserAccountId) { return forgeBrowserRuntime.pruneBrowserViews(preferredId); }
function createForgeBrowserView(account) { return forgeBrowserRuntime.createBrowserView(account); }
function closeForgeBrowserView(id, options = {}) { return forgeBrowserRuntime.closeBrowserView(id, options); }
function closeAllForgeBrowserViews(options = {}) { return forgeBrowserRuntime.closeAllBrowserViews(options); }
function setForgeBrowserAccount(id) { return forgeBrowserRuntime.setBrowserAccount(id); }
function navigateForgeBrowser(action) { return forgeBrowserRuntime.navigateBrowser(action); }
function setForgeBrowserLayout(layout = {}) { return forgeBrowserRuntime.setBrowserLayout(layout); }
function suspendForgeBrowsers() { return forgeBrowserRuntime.suspendBrowsers(); }

function videoHubStorePath() { return path.join(app.getPath('userData'), 'video-hub-accounts.json'); }
function videoHubNetworkSettingsPath() { return path.join(app.getPath('userData'), 'video-hub-network.json'); }
const videoHubNetworkRuntime = createVideoHubNetworkRuntime({
  readSettings: () => JSON.parse(fs.readFileSync(videoHubNetworkSettingsPath(), 'utf8')),
  writeSettings: (mode) => fs.writeFileSync(videoHubNetworkSettingsPath(), JSON.stringify({ mode }, null, 2), 'utf8'),
  getAccounts: () => loadVideoHubStore().accounts,
  getRuntimeAccount: (account) => videoHubRuntimeAccount(account),
  getSession: (account) => sessionLifecycleRuntime.getVideoHubSession(account),
  waitForSessionReady: (sess) => sessionLifecycleRuntime.getVideoHubReadiness(sess),
  getMode: () => videoHubNetworkMode,
  setMode: (mode) => { videoHubNetworkMode = mode; },
  reloadActivePage: () => {
    if (videoHubBrowserView && !videoHubBrowserView.webContents.isDestroyed()) {
      try { videoHubBrowserView.webContents.reload(); } catch { /* the view may be closing */ }
    }
  },
});
function getVideoHubNetworkMode() { return videoHubNetworkRuntime.getMode(); }
function applyVideoHubProxyToSession(sess, mode = getVideoHubNetworkMode(), options = {}) {
  return videoHubNetworkRuntime.applyProxyToSession(sess, mode, options);
}
function setVideoHubNetworkMode(mode) { return videoHubNetworkRuntime.setMode(mode); }

const videoHubJsonStore = createAtomicJsonFileStore({
  getFilePath: videoHubStorePath,
  fs,
});
function saveVideoHubStore() {
  return videoHubJsonStore.write(videoHubStore);
}
function loadVideoHubStore() {
  if (videoHubStore) return videoHubStore;
  const loaded = videoHubJsonStore.read();
  const raw = loaded.ok ? loaded.value : null;
  if (isPlainObject(raw)) videoHubStore = videoHubStoreController.sanitizeStore(raw);
  else videoHubStore = videoHubStoreController.defaultStore();
  saveVideoHubStore();
  videoHubActiveAccountId = videoHubStore.activeAccountId;
  return videoHubStore;
}
const videoHubStoreController = createVideoHubStoreController({
  getStore: loadVideoHubStore,
  saveStore: saveVideoHubStore,
  randomId,
  cleanId,
  cleanText,
  normalizeHttpsUrl,
  sanitizeIcon,
  faviconForUrl,
  setActiveAccountId: (id) => { videoHubActiveAccountId = id; },
});
function videoHubGetProvider(id) { return videoHubStoreController.getProvider(id); }
function videoHubGetAccount(id) { return videoHubStoreController.getAccount(id); }
function videoHubStateForRenderer() { return videoHubStoreController.stateForRenderer(); }
function videoHubRuntimeAccount(account) {
  const provider = videoHubGetProvider(account.providerId);
  return { id: account.id, serviceId: account.providerId, name: account.name, url: account.url, icon: account.icon, authDomains: provider?.authDomains || [], preferences: {}, isVideoHubAccount: true };
}
function videoHubSessionFor(account) {
  return sessionLifecycleRuntime.getVideoHubSession(account);
}
function videoHubAddProvider(payload) { return videoHubStoreController.addProvider(payload); }
function videoHubAddAccount(payload) { return videoHubStoreController.addAccount(payload); }
function videoHubRenameAccount(id, name) { return videoHubStoreController.renameAccount(id, name); }
const videoHubBrowserRuntime = createVideoHubBrowserRuntime({
  layout: videoHubBrowserLayout,
  pendingCreations: videoHubPendingViewCreations,
  childWindows: videoHubChildWindows,
  getBrowserView: () => videoHubBrowserView,
  setBrowserView: (view) => { videoHubBrowserView = view; },
  getActiveAccountId: () => videoHubActiveAccountId,
  setActiveAccountId: (id) => { videoHubActiveAccountId = id; },
  getRequestSerial: () => videoHubViewRequestSerial,
  advanceRequestSerial: () => ++videoHubViewRequestSerial,
  getWorkspaceApp: () => workspaceApp,
  isLocked: () => locked,
  loadStore: () => loadVideoHubStore(),
  saveStore: () => saveVideoHubStore(),
  getAccount: (id) => videoHubGetAccount(id),
  getRuntimeAccount: (account) => videoHubRuntimeAccount(account),
  getSession: (account) => videoHubSessionFor(account),
  waitForSessionReady: (sess) => sessionLifecycleRuntime.getVideoHubReadiness(sess),
  createNativeView: (account, runtimeAccount, sess) => {
    const view = new WebContentsView({ webPreferences: { ...SAFE_WEB_PREFERENCES, session: sess } });
    hardenAccountContents(view.webContents, runtimeAccount, sess);
    bindVideoHubBrowserEvents(view, account, {
      applyZoom,
      hostOf,
      warn: (message) => console.warn(message),
      onLoadingChange: (loading) => {
        // Ignore late events from a view that has been closed or replaced.
        if (videoHubBrowserView !== view) return;
        if (controlView && !controlView.webContents.isDestroyed()) {
          controlView.webContents.send('video-hub-browser-loading', { accountId: account.id, loading: Boolean(loading) });
          controlView.webContents.send('video-hub-browser-status', { accountId: account.id, hasBrowserView: true, error: '' });
        }
      },
    });
    return view;
  },
  attachView: (view) => {
    mainWindow.contentView.addChildView(view);
    if (controlView && !controlView.webContents.isDestroyed()) {
      controlView.webContents.send('video-hub-browser-status', { accountId: videoHubActiveAccountId || '', hasBrowserView: true, error: '' });
    }
  },
  detachView: (view) => { mainWindow?.contentView.removeChildView(view); },
  isWebContentsDestroyed: (view) => view.webContents.isDestroyed(),
  closeWebContents: (view) => view.webContents.close(),
  loadUrl: (view, url) => view.webContents.loadURL(url),
  positionViews: () => positionViews(),
  getRendererState: () => videoHubStateForRenderer(),
  normalizeActiveId: (id) => id ? String(id) : null,
  onProxyFailure: (account, detail) => {
    console.error(`[Mad Station network] Video Hub cannot open ${hostOf(account.url)}: ${detail}`);
    if (controlView && !controlView.webContents.isDestroyed()) controlView.webContents.send('video-hub-browser-status', { accountId: account.id, hasBrowserView: false, error: 'Could not prepare this account’s network connection. Check the system proxy setting and try again.' });
    if (videoHubActiveAccountId === account.id) notice('Video Hub could not prepare this account’s network connection. Check the system proxy setting and try again.');
  },
  onCreateFailure: (account, error) => {
    console.error(`[Mad Station network] Could not create Video Hub browser: ${error}`);
    if (controlView && !controlView.webContents.isDestroyed()) controlView.webContents.send('video-hub-browser-status', { accountId: account.id, hasBrowserView: false, error: 'Video Hub could not open this page. Try selecting the account again.' });
    if (videoHubActiveAccountId === account.id) notice('Video Hub could not open this page. Check the network settings and try again.');
  },
  onNavigationFailure: (account, error) => {
    console.warn(`[Mad Station navigation] Initial Video Hub navigation failed: host=${hostOf(account.url)} error=${String(error || 'unknown').replace(/[^a-zA-Z0-9 _:-]/g, '').slice(0, 100)}`);
  },
  externalUrlForPage,
  openExternalSafe,
});
function closeVideoHubBrowserView() { return videoHubBrowserRuntime.closeBrowserView(); }
function suspendVideoHubBrowsers(clearLayout = true) {
  const accountId = videoHubActiveAccountId || loadVideoHubStore()?.activeAccountId || '';
  const result = videoHubBrowserRuntime.suspendBrowsers(clearLayout);
  if (controlView && !controlView.webContents.isDestroyed()) controlView.webContents.send('video-hub-browser-status', { accountId, hasBrowserView: false, error: '' });
  return result;
}
function createVideoHubBrowserView(account) { return videoHubBrowserRuntime.createBrowserView(account); }
function setVideoHubActiveAccount(id) { return videoHubBrowserRuntime.setActiveAccount(id); }

function setVideoHubSettingsOverlayOpen(open) {
  videoHubSettingsOverlayOpen = Boolean(open);
  positionViews();
  return { ok: true };
}
function setVideoHubNotificationOverlayOpen(open) {
  videoHubNotificationOverlayOpen = Boolean(open);
  positionViews();
  return { ok: true };
}
function setVideoHubBrowserLayout(layout = {}) { return videoHubBrowserRuntime.setBrowserLayout(layout); }
function videoHubNavigate(action) { return videoHubBrowserRuntime.navigate(action); }
function videoHubOpenInBrowser() { return videoHubBrowserRuntime.openInBrowser(); }

const imageHubBrowserRuntime = createImageHubBrowserRuntime({
  layout: imageHubBrowserLayout,
  childWindows: imageHubChildWindows,
  getWorkspaceApp: () => workspaceApp,
  isLocked: () => locked,
  getBrowserView: () => imageHubBrowserView,
  setBrowserView: (view) => { imageHubBrowserView = view; },
  createNativeView: (account) => {
    const runtimeAccount = {
      id: account.id,
      name: account.name,
      url: account.url,
      serviceId: account.providerId,
      authDomains: [],
      preferences: {},
      isImageHubAccount: true,
    };
    const sess = sessionLifecycleRuntime.getImageHubSession(runtimeAccount);
    const view = new WebContentsView({ webPreferences: { ...SAFE_WEB_PREFERENCES, session: sess } });
    hardenAccountContents(view.webContents, runtimeAccount, sess);
    view.webContents.on('did-start-loading', () => {
      if (imageHubBrowserView === view) imageHubBrowserRuntime.reportLoading(true);
    });
    view.webContents.on('did-stop-loading', () => {
      if (imageHubBrowserView === view) imageHubBrowserRuntime.reportLoading(false);
    });
    view.webContents.on('did-navigate', () => {
      if (imageHubBrowserView === view) imageHubBrowserRuntime.reportNavigation();
    });
    view.webContents.on('did-navigate-in-page', () => {
      if (imageHubBrowserView === view) imageHubBrowserRuntime.reportNavigation();
    });
    view.webContents.on('page-title-updated', () => {
      if (imageHubBrowserView === view) imageHubBrowserRuntime.reportTitle();
    });
    view.webContents.on('did-fail-load', (_event, code, _description, _url, isMainFrame) => {
      if (imageHubBrowserView !== view || isMainFrame === false || code === -3) return;
      imageHubBrowserRuntime.reportFailure('This page could not be loaded. Check your connection and try again.');
    });
    view.webContents.on('dom-ready', () => applyZoom(view.webContents));
    return view;
  },
  attachView: (view) => mainWindow.contentView.addChildView(view),
  detachView: (view) => { mainWindow?.contentView.removeChildView(view); },
  isWebContentsDestroyed: (view) => view.webContents.isDestroyed(),
  closeWebContents: (view) => view.webContents.close(),
  positionViews: () => positionViews(),
  openExternalSafe,
  sendState: (state) => {
    if (controlView && !controlView.webContents.isDestroyed()) controlView.webContents.send('image-hub-browser-state', state);
  },
});
function suspendImageHubBrowsers(clearLayout = true) { return imageHubBrowserRuntime.suspendBrowsers(clearLayout); }
function setImageHubBrowserLayout(layout = {}) { return imageHubBrowserRuntime.setBrowserLayout(layout); }
function imageHubBrowserNavigate(action) { return imageHubBrowserRuntime.navigate(action); }
async function videoHubWipeAccountData(account, { reopen = true } = {}) {
  const wasActive = videoHubActiveAccountId === account.id || loadVideoHubStore().activeAccountId === account.id;
  if (wasActive) closeVideoHubBrowserView();
  try {
    const sess = videoHubSessionFor(videoHubRuntimeAccount(account));
    // Let the session finish applying its saved network mode before touching it.
    // A proxy failure must not prevent the user from clearing login data.
    const readiness = sessionLifecycleRuntime.getVideoHubReadiness(sess);
    if (readiness) await readiness;
    // Clear all storage classes rather than relying on a partial list; Chromium
    // sessionStorage is per tab and disappears with the closed WebContents.
    await clearSessionDataRuntime(sess, 'all');
  } catch { /* best effort */ }
  if (wasActive && reopen && workspaceApp === 'video-hub' && !locked) void createVideoHubBrowserView(account);
}
async function videoHubResetLogin(id) {
  const account = videoHubGetAccount(id);
  if (!account) return { ok: false, error: 'Video Hub account not found.' };
  await videoHubWipeAccountData(account);
  return { ok: true };
}
async function videoHubDeleteAccount(id) {
  const store = loadVideoHubStore();
  const account = videoHubGetAccount(id);
  if (!account) return { ok: false, error: 'Video Hub account not found.' };
  await videoHubWipeAccountData(account, { reopen: false });
  store.accounts = store.accounts.filter((item) => item.id !== id);
  if (store.activeAccountId === id) store.activeAccountId = store.accounts[0]?.id || null;
  videoHubActiveAccountId = store.activeAccountId;
  saveVideoHubStore();
  if (workspaceApp === 'video-hub' && !locked) { closeVideoHubBrowserView(); if (store.activeAccountId) void createVideoHubBrowserView(videoHubGetAccount(store.activeAccountId)); }
  return { ok: true, ...videoHubStateForRenderer() };
}
async function videoHubDeleteProvider(id) {
  const store = loadVideoHubStore();
  const provider = videoHubGetProvider(id);
  if (!provider) return { ok: false, error: 'Video site not found.' };
  if (provider.builtin) return { ok: false, error: 'Built-in video sites cannot be removed.' };
  const accounts = store.accounts.filter((account) => account.providerId === id);
  for (const account of accounts) await videoHubWipeAccountData(account, { reopen: false });
  store.accounts = store.accounts.filter((account) => account.providerId !== id);
  store.providers = store.providers.filter((item) => item.id !== id);
  if (accounts.some((account) => account.id === store.activeAccountId)) store.activeAccountId = store.accounts[0]?.id || null;
  videoHubActiveAccountId = store.activeAccountId;
  saveVideoHubStore();
  if (workspaceApp === 'video-hub' && !locked) {
    closeVideoHubBrowserView();
    if (store.activeAccountId) void createVideoHubBrowserView(videoHubGetAccount(store.activeAccountId));
  }
  return { ok: true, ...videoHubStateForRenderer() };
}

// ---------------------------------------------------------------------------
// Model Arena: own providers + accounts (arena-accounts.json), own sessions,
// two side-by-side browsers, and "type the question into both chat boxes".
// ---------------------------------------------------------------------------
const arenaStoreRuntime = createArenaStoreRuntime({
  getFilePath: () => path.join(app.getPath('userData'), 'arena-accounts.json'),
  fs,
  defaultProviders: DEFAULT_SERVICES,
  cleanId,
  cleanText,
  normalizeHttpsUrl,
  sanitizeIcon,
  faviconForUrl,
  randomId,
  isPlainObject,
  iconCandidatesFor: (service, preferred) => iconCandidatesFor(service, preferred),
  wipeAccountData: (account) => wipeArenaAccountDataRuntime(account, {
    closeView: (accountId) => closeArenaView(accountId),
    getSession: (record) => arenaSessionFor(arenaStoreRuntime.runtimeAccount(record)),
  }),
  setBrowserModels: (models) => setArenaBrowserModels(models),
});
function loadArenaStore() { return arenaStoreRuntime.loadStore(); }
function saveArenaStore() { return arenaStoreRuntime.saveStore(); }
function arenaGetAccount(id) { return arenaStoreRuntime.getAccount(id); }
function arenaGetProvider(id) { return arenaStoreRuntime.getProvider(id); }
function arenaRuntimeAccount(account) { return arenaStoreRuntime.runtimeAccount(account); }
function arenaStateForRenderer() { return arenaStoreRuntime.stateForRenderer(); }
function arenaAddProvider(payload) { return arenaStoreRuntime.addProvider(payload); }
function arenaAddAccount(payload) { return arenaStoreRuntime.addAccount(payload); }
function arenaRenameAccount(id, name) { return arenaStoreRuntime.renameAccount(id, name); }
function arenaDeleteAccount(id) { return arenaStoreRuntime.deleteAccount(id); }
function arenaDeleteProvider(id) { return arenaStoreRuntime.deleteProvider(id); }
function arenaResetLogin(id) { return arenaStoreRuntime.resetLogin(id); }

const arenaBrowserRuntime = createArenaBrowserRuntime({
  views: arenaContentViews,
  models: arenaBrowserModels,
  layout: arenaBrowserLayout,
  loadStore: () => loadArenaStore(),
  saveStore: () => saveArenaStore(),
  getAccount: (id) => arenaGetAccount(id),
  runtimeAccount: (account) => arenaRuntimeAccount(account),
  getSession: (account) => arenaSessionFor(account),
  createView: (_account, session) => new WebContentsView({ webPreferences: { ...SAFE_WEB_PREFERENCES, session } }),
  hardenView: (view, account, session) => hardenAccountContents(view.webContents, account, session),
  bindEvents: (view, account) => bindArenaBrowserEvents(view, {
    normalizeShortcutFromInput,
    handleShortcut,
    handleBrowserKey,
    applyZoom: applyArenaBrowserZoom,
    onLoadingChange: (loading) => {
      const accountId = typeof account?.id === 'string' ? account.id : '';
      const registeredView = accountId ? arenaContentViews.get(accountId) : null;
      // Ignore late events from a replaced view; permit a start event during attach/register ordering.
      if (registeredView && registeredView !== view) return;
      if (!registeredView && !loading) return;
      const side = accountId && arenaBrowserModels.left === accountId ? 'left'
        : accountId && arenaBrowserModels.right === accountId ? 'right' : null;
      if (side && controlView && !controlView.webContents.isDestroyed()) {
        controlView.webContents.send('arena-browser-loading', { side, accountId, loading: Boolean(loading) });
      }
    },
  }),
  attachView: (view) => mainWindow.contentView.addChildView(view),
  detachView: (view) => { mainWindow?.contentView.removeChildView(view); },
  isWebContentsDestroyed: (view) => view.webContents.isDestroyed(),
  closeWebContents: (view) => view.webContents.close(),
  positionViews: () => positionViews(),
});

function createArenaBrowserView(record) { return arenaBrowserRuntime.createBrowserView(record); }
function closeArenaView(id) { return arenaBrowserRuntime.closeView(id); }
function clearArenaBrowserBindings() { return arenaBrowserRuntime.clearBrowserBindings(); }
function suspendArenaBrowsers() { return arenaBrowserRuntime.suspendBrowsers(); }
function setArenaBrowserModels(models = {}) { return arenaBrowserRuntime.setBrowserModels(models); }
function navigateArenaBrowser(side, action) { return arenaBrowserRuntime.navigateBrowser(side, action); }
function refreshArenaBrowsers() { return arenaBrowserRuntime.refreshBrowsers(); }
function setArenaBrowserLayout(layout = {}) { return arenaBrowserRuntime.setBrowserLayout(layout); }

const arenaPromptRuntime = createArenaPromptRuntime({
  getWorkspaceApp: () => workspaceApp,
  getControlMode: () => controlMode,
  getViewForSide: (side) => {
    const id = arenaBrowserModels[side];
    return id ? arenaContentViews.get(id) : null;
  },
});
async function arenaSendPrompt(rawPrompt) { return arenaPromptRuntime.sendPrompt(rawPrompt); }

const browserViewLayoutRuntime = createBrowserViewLayoutRuntime({
  getWindowContentBounds: () => mainWindow ? mainWindow.getContentBounds() : null,
  getControlView: () => controlView,
  getToolbarView: () => toolbarView,
  getState: () => ({
    sidebarWidth: SIDEBAR_WIDTH,
    toolbarHeight: TOOLBAR_HEIGHT,
    sidebarHidden,
    locked,
    controlMode,
    workspaceApp,
    activeId,
    contentViews,
    forgeContentViews,
    forgeBrowserLayout,
    forgeBrowserAccountId,
    arenaContentViews,
    arenaBrowserModels,
    arenaBrowserLayout,
    videoHubBrowserView,
    videoHubBrowserLayout,
    videoHubSettingsOverlayOpen,
    videoHubNotificationOverlayOpen,
    imageHubBrowserView,
    imageHubBrowserLayout,
  }),
  applyZoom,
  applyArenaBrowserZoom,
});

function positionViews() {
  browserViewLayoutRuntime.positionViews();
}

function setControlMode(mode) {
  controlMode = ['app', 'settings', 'dialog', 'launcher'].includes(mode) ? mode : 'app';
  positionViews();
  if (controlView && !controlView.webContents.isDestroyed()) {
    controlView.webContents.send('control-mode', { mode: controlMode });
  }
}

function activateAccount(id) { return accountBrowserRuntime.activateAccount(id); }

function createControlView() {
  controlView = new WebContentsView({
    webPreferences: {
      ...SAFE_WEB_PREFERENCES,
      preload: PRELOAD_FILE,
    },
  });
  const contents = controlView.webContents;
  contents.on('did-fail-load', (_event, errorCode, errorDescription, _validatedURL, isMainFrame) => {
    if (isMainFrame) writeStartupDiagnostic('control-renderer-load-failed', { errorCode, errorDescription });
  });
  contents.on('render-process-gone', (_event, details = {}) => {
    writeStartupDiagnostic('control-renderer-process-gone', { reason: details.reason || 'unknown', exitCode: Number(details.exitCode) || 0 });
  });
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (event) => event.preventDefault());
  contents.on('will-redirect', (event) => event.preventDefault());
  contents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const shortcut = normalizeShortcutFromInput(input);
    if (shortcut && handleShortcut(shortcut)) event.preventDefault();
  });
  contents.loadFile(RENDERER_FILE);
  mainWindow.contentView.addChildView(controlView);
}

function createToolbarView() {
  toolbarView = new WebContentsView({
    webPreferences: {
      ...SAFE_WEB_PREFERENCES,
      preload: TOOLBAR_PRELOAD_FILE,
    },
  });
  const contents = toolbarView.webContents;
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (event) => event.preventDefault());
  contents.on('will-redirect', (event) => event.preventDefault());
  contents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const shortcut = normalizeShortcutFromInput(input);
    if (shortcut && handleShortcut(shortcut)) { event.preventDefault(); return; }
    if (handleBrowserKey(input)) event.preventDefault();
  });
  contents.once('did-finish-load', () => {
    writeStartupDiagnostic('toolbar-renderer-loaded');
    pushToolbar();
  });
  contents.on('did-fail-load', (_event, errorCode, errorDescription, _validatedURL, isMainFrame) => {
    if (isMainFrame) writeStartupDiagnostic('toolbar-renderer-load-failed', { errorCode, errorDescription });
  });
  contents.on('render-process-gone', (_event, details = {}) => {
    writeStartupDiagnostic('toolbar-renderer-process-gone', { reason: details.reason || 'unknown', exitCode: Number(details.exitCode) || 0 });
  });
  const toolbarDevUrl = process.env.MAD_STATION_TOOLBAR_DEV_URL;
  if (toolbarDevUrl) contents.loadURL(toolbarDevUrl);
  else contents.loadFile(TOOLBAR_FILE);
  mainWindow.contentView.addChildView(toolbarView);
}

// Everything the browser-style toolbar above the website needs to draw itself.
function broadcastSidebarState() {
  if (controlView && !controlView.webContents.isDestroyed()) controlView.webContents.send('sidebar-state', { hidden: sidebarHidden });
  if (toolbarView && !toolbarView.webContents.isDestroyed()) toolbarView.webContents.send('sidebar-state', { hidden: sidebarHidden });
}

function toolbarState() {
  const account = !locked && activeId ? getAccount(activeId) : null;
  const view = account ? contentViews.get(account.id) : null;
  const wc = view && !view.webContents.isDestroyed() ? view.webContents : null;
  const preferredIcon = sanitizeIcon(account?.icon);
  const cachedIcon = preferredIcon && /^https:/i.test(preferredIcon) ? getRemoteIconCache().get(preferredIcon) : '';
  return { sidebarHidden,
    theme: config?.settings?.theme || 'dark',
    accent: config?.settings?.accent || 'blue',
    surfaceStyle: config?.settings?.surfaceStyle || 'solid',
    backgroundStyle: config?.settings?.backgroundStyle || 'plain',
    cornerStyle: config?.settings?.cornerStyle || 'soft',
    buttonCorner: config?.settings?.buttonCorner || 'soft',
    buttonBackground: config?.settings?.buttonBackground || 'solid',
    borderStyle: config?.settings?.borderStyle || 'subtle',
    shadowStyle: config?.settings?.shadowStyle || 'soft',
    cardSpacing: config?.settings?.cardSpacing || 'comfortable',
    borderSpacing: config?.settings?.borderSpacing || 'comfortable',
    animateHover: config?.settings?.animateHover !== false,
    reduceMotion: config?.settings?.reduceMotion === true,
    showStatusBar: config?.settings?.showStatusBar !== false,
    remoteIcons: security().remoteIcons !== false,
    hasAccount: Boolean(account),
    accountName: account?.name || '',
    accountIcon: cachedIcon || preferredIcon || '',
    url: wc ? wc.getURL() : (account?.url || ''),
    title: wc ? wc.getTitle() : '',
    loading: wc ? wc.isLoading() : false,
    canGoBack: wc ? navCanGoBack(wc) : false,
    canGoForward: wc ? navCanGoForward(wc) : false,
  };
}

function pushToolbar() {
  if (toolbarView && !toolbarView.webContents.isDestroyed()) {
    toolbarView.webContents.send('toolbar-state', toolbarState());
  }
}

// Browser-style keys that work while a website (or the toolbar) has focus.
function handleBrowserKey(input) {
  if (locked || (controlMode !== 'app' && !(controlMode === 'launcher' && workspaceApp === 'instruction-forge'))) return false;
  const isForge = workspaceApp === 'instruction-forge' && Boolean(forgeBrowserAccountId);
  const targetId = isForge ? forgeBrowserAccountId : activeId;
  const view = targetId ? (isForge ? forgeContentViews.get(targetId) : contentViews.get(targetId)) : null;
  if (!view || view.webContents.isDestroyed()) return false;
  const wc = view.webContents;
  const key = input.key;
  const plain = !input.control && !input.meta && !input.alt && !input.shift;
  if (input.alt && !input.control && !input.meta && !input.shift) {
    if (key === 'ArrowLeft') { if (navCanGoBack(wc)) navGoBack(wc); return true; }
    if (key === 'ArrowRight') { if (navCanGoForward(wc)) navGoForward(wc); return true; }
  }
  if ((plain && key === 'F5') || ((input.control || input.meta) && !input.alt && !input.shift && key.toLowerCase() === 'r')) {
    wc.reload();
    return true;
  }
  return false;
}

function normalizeShortcutFromInput(input) {
  const modifiers = [];
  if (input.control || input.meta) modifiers.push('Ctrl');
  if (input.alt) modifiers.push('Alt');
  if (input.shift) modifiers.push('Shift');
  if (!modifiers.length) return null;
  let key = input.key;
  if (key === ' ') key = 'Space';
  const map = { Escape: 'Esc', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right' };
  key = map[key] || key;
  if (!key || ['Control', 'Shift', 'Alt', 'Meta'].includes(key)) return null;
  if (key.length === 1) key = key.toUpperCase();
  return [...modifiers, key].join('+');
}

function normalizeShortcut(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const parts = raw.split('+').map((part) => part.trim()).filter(Boolean);
  const mods = [];
  let key = '';
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower === 'ctrl' || lower === 'control' || lower === 'cmd' || lower === 'command') mods.push('Ctrl');
    else if (lower === 'alt' || lower === 'option') mods.push('Alt');
    else if (lower === 'shift') mods.push('Shift');
    else key = part.length === 1 ? part.toUpperCase() : part;
  }
  const uniqueMods = [...new Set(mods)];
  return key ? [...uniqueMods, key].join('+') : '';
}

function handleShortcut(shortcut) {
  if (locked) return false;
  const normalized = normalizeShortcut(shortcut);
  if (!normalized) return false;
  const account = config.accounts.find((a) => normalizeShortcut(a.shortcut) === normalized);
  if (account) {
    activateAccount(account.id);
    return true;
  }
  // Ctrl+Shift+L locks the app when a password is set (unless you assigned it to an account).
  if (normalized === 'Ctrl+Shift+L' && hasPassword()) {
    lockApp();
    return true;
  }
  return false;
}

function createMainWindow() {
  return createMainWindowRuntime({
    createWindow: (options) => new BaseWindow(options),
    iconPath: path.join(__dirname, '../assets/icon.png'),
    getConfig: () => config,
    getSecurity: security,
    getLocked: () => locked,
    getWorkspaceApp: () => workspaceApp,
    getActiveId: () => activeId,
    setActiveId: (id) => { activeId = id; },
    getAccount,
    orderedConfigItems,
    setMainWindow: (window) => { mainWindow = window; },
    createControlView,
    createToolbarView,
    getControlView: () => controlView,
    createAccountView,
    positionViews,
    lockApp: () => lockApp(),
    getChildWindows: () => childWindows,
    clearWindowReferences: () => { mainWindow = null; controlView = null; toolbarView = null; },
    clearContentViews: () => contentViews.clear(),
    safeConfigForRenderer,
    writeStartupDiagnostic: (kind) => writeStartupDiagnostic(kind),
  });
}

function safeConfigForRenderer() {
  const base = {
    settings: config.settings,
    locked,
    hasPassword: hasPassword(),
    appVersion: APP_VERSION,
    runtime: { diskCacheDisabledAtLaunch, iconFolder: iconFolderPath() },
  };
  return buildAiHubReadModel({
    base,
    locked,
    config,
    activeId,
    accountRuntime,
    localIconFor,
    sanitizeIcon,
    faviconForUrl,
    iconCandidatesFor,
    normalizeAccountPreferences,
  });
}

function pushConfig() {
  if (controlView && !controlView.webContents.isDestroyed()) {
    controlView.webContents.send('config', safeConfigForRenderer());
  }
  pushDownloads();
  pushToolbar();
}

function broadcastConfig() {
  const saved = saveConfig(config);
  pushConfig();
  if (!saved) notice('Could not save the workspace. Please retry or check the Mad Station data folder.');
  return saved;
}

// Typed settings transitions are separated from Electron IPC registration.
// The `handle` wrapper below still enforces trusted sender, lock, and payload checks.
const settingsController = createSettingsController({
  getSettings: () => config.settings,
  setSettings: (settings) => { config.settings = settings; },
  getSecurity: () => security(),
  setSecurity: (settings) => { config.settings.security = settings; },
  getDownloads: () => downloadSettings(),
  setDownloads: (settings) => { config.settings.downloads = settings; },
  normalizeDownloads: normalizeDownloadSettings,
  defaultDownloads: DEFAULT_DOWNLOAD_SETTINGS,
  applyLiveAppSettings,
  applyLiveSecurity,
  broadcastConfig,
  isManagedBackgroundUrl: (value) => backgroundFilesController.isManagedFileUrl(value),
});

// ---------------------------------------------------------------------------
// IPC (every handler checks the sender and the lock state)
// ---------------------------------------------------------------------------

function frameMatchesLocalFile(frameUrl, expectedPath) {
  try {
    const parsed = new URL(frameUrl);
    if (parsed.protocol !== 'file:') return false;
    const actualPath = path.resolve(fileURLToPath(parsed));
    const expected = path.resolve(expectedPath);
    return process.platform === 'win32'
      ? actualPath.toLowerCase() === expected.toLowerCase()
      : actualPath === expected;
  } catch {
    return false;
  }
}

function isTrustedSender(event, { toolbar = false } = {}) {
  try {
    const frame = event.senderFrame;
    if (!frame || frame !== event.sender.mainFrame) return false;
    if (controlView && event.sender === controlView.webContents) {
      return frameMatchesLocalFile(frame.url, RENDERER_FILE);
    }
    // The toolbar may only use the small set of channels that opt in with { toolbar: true }.
    // Development trusts only the exact Vite document URL configured by scripts/dev.mjs.
    if (toolbar && toolbarView && event.sender === toolbarView.webContents) {
      const toolbarDevUrl = process.env.MAD_STATION_TOOLBAR_DEV_URL;
      if (toolbarDevUrl && frame.url === toolbarDevUrl) return true;
      return frameMatchesLocalFile(frame.url, TOOLBAR_FILE);
    }
    return false;
  } catch {
    return false;
  }
}

const ALLOWED_WHILE_LOCKED = new Set(['unlock', 'reset-app-lock', 'lock-developer-options']);

function handle(channel, fn, options = {}) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isTrustedSender(event, options)) return { ok: false, error: 'Untrusted sender.' };
    if (locked && !ALLOWED_WHILE_LOCKED.has(channel)) return { ok: false, error: 'Mad Station is locked.' };
    if (!isSafeIpcPayload(args)) return { ok: false, error: 'Invalid IPC payload.' };
    return fn(event, ...args);
  });
}

function safeDebugText(value, maxLength = 220) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, maxLength) : '';
}
function safeDebugNumber(value, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(-10000000, Math.min(10000000, value)) : fallback;
}
function sanitizeDebugEdges(value, fallback = '—') {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return { top: safeDebugText(input.top, 24) || fallback, right: safeDebugText(input.right, 24) || fallback, bottom: safeDebugText(input.bottom, 24) || fallback, left: safeDebugText(input.left, 24) || fallback };
}
function sanitizeDebugElement(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const rectValue = value.rect && typeof value.rect === 'object' ? value.rect : {};
  const layoutValue = value.layout && typeof value.layout === 'object' ? value.layout : {};
  const a11yValue = value.accessibility && typeof value.accessibility === 'object' ? value.accessibility : {};
  const boxValue = value.boxModel && typeof value.boxModel === 'object' ? value.boxModel : {};
  const rect = { x: safeDebugNumber(rectValue.x), y: safeDebugNumber(rectValue.y), width: safeDebugNumber(rectValue.width), height: safeDebugNumber(rectValue.height), right: safeDebugNumber(rectValue.right), bottom: safeDebugNumber(rectValue.bottom) };
  const cleanClasses = Array.isArray(value.classes) ? value.classes.slice(0, 16).map((item) => safeDebugText(item, 90)).filter(Boolean) : [];
  return {
    tag: safeDebugText(value.tag, 60), id: safeDebugText(value.id, 180), classes: cleanClasses, selector: safeDebugText(value.selector, 700), shadowHosts: Array.isArray(value.shadowHosts) ? value.shadowHosts.slice(0, 12).map((item) => safeDebugText(item, 700)).filter(Boolean) : [], label: safeDebugText(value.label, 180), rect,
    layout: {
      display: safeDebugText(layoutValue.display, 60), position: safeDebugText(layoutValue.position, 60), zIndex: safeDebugText(layoutValue.zIndex, 40), pointerEvents: safeDebugText(layoutValue.pointerEvents, 40),
      overflowX: safeDebugText(layoutValue.overflowX, 40), overflowY: safeDebugText(layoutValue.overflowY, 40), opacity: safeDebugText(layoutValue.opacity, 32), visibility: safeDebugText(layoutValue.visibility, 32),
      cursor: safeDebugText(layoutValue.cursor, 60), flex: safeDebugText(layoutValue.flex, 100), flexBasis: safeDebugText(layoutValue.flexBasis, 100), flexGrow: safeDebugText(layoutValue.flexGrow, 32), flexShrink: safeDebugText(layoutValue.flexShrink, 32), gridArea: safeDebugText(layoutValue.gridArea, 100), transform: safeDebugText(layoutValue.transform, 180),
      flexDirection: safeDebugText(layoutValue.flexDirection, 40), flexWrap: safeDebugText(layoutValue.flexWrap, 40), gridTemplateColumns: safeDebugText(layoutValue.gridTemplateColumns, 180), gridTemplateRows: safeDebugText(layoutValue.gridTemplateRows, 180), gridColumn: safeDebugText(layoutValue.gridColumn, 100), gridRow: safeDebugText(layoutValue.gridRow, 100),
      gap: safeDebugText(layoutValue.gap, 60), rowGap: safeDebugText(layoutValue.rowGap, 40), columnGap: safeDebugText(layoutValue.columnGap, 40), alignItems: safeDebugText(layoutValue.alignItems, 40), alignSelf: safeDebugText(layoutValue.alignSelf, 40), justifyContent: safeDebugText(layoutValue.justifyContent, 40), justifySelf: safeDebugText(layoutValue.justifySelf, 40),
      width: safeDebugText(layoutValue.width, 40), height: safeDebugText(layoutValue.height, 40), minWidth: safeDebugText(layoutValue.minWidth, 40), minHeight: safeDebugText(layoutValue.minHeight, 40), maxWidth: safeDebugText(layoutValue.maxWidth, 40), maxHeight: safeDebugText(layoutValue.maxHeight, 40), boxSizing: safeDebugText(layoutValue.boxSizing, 40), borderRadius: safeDebugText(layoutValue.borderRadius, 100),
      fontFamily: safeDebugText(layoutValue.fontFamily, 180), fontSize: safeDebugText(layoutValue.fontSize, 40), fontWeight: safeDebugText(layoutValue.fontWeight, 40), lineHeight: safeDebugText(layoutValue.lineHeight, 40),
      color: safeDebugText(layoutValue.color, 80), backgroundColor: safeDebugText(layoutValue.backgroundColor, 80), backgroundImage: safeDebugText(layoutValue.backgroundImage, 180), whiteSpace: safeDebugText(layoutValue.whiteSpace, 40), overflowWrap: safeDebugText(layoutValue.overflowWrap, 40), isolation: safeDebugText(layoutValue.isolation, 40),
      filter: safeDebugText(layoutValue.filter, 100), backdropFilter: safeDebugText(layoutValue.backdropFilter, 100), animationName: safeDebugText(layoutValue.animationName, 100), animationDuration: safeDebugText(layoutValue.animationDuration, 80), transitionProperty: safeDebugText(layoutValue.transitionProperty, 100), transitionDuration: safeDebugText(layoutValue.transitionDuration, 80),
    },
    accessibility: {
      role: safeDebugText(a11yValue.role, 80), type: safeDebugText(a11yValue.type, 60), tabIndex: safeDebugText(a11yValue.tabIndex, 16), label: safeDebugText(a11yValue.label, 180),
      disabled: typeof a11yValue.disabled === 'boolean' ? a11yValue.disabled : null, focused: typeof a11yValue.focused === 'boolean' ? a11yValue.focused : null,
    },
    boxModel: { padding: sanitizeDebugEdges(boxValue.padding), margin: sanitizeDebugEdges(boxValue.margin), border: sanitizeDebugEdges(boxValue.border) },
  };
}
function sanitizeDeveloperDebugSnapshot(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const pageValue = value.page && typeof value.page === 'object' ? value.page : {};
  const statsValue = value.stats && typeof value.stats === 'object' ? value.stats : {};
  const viewportValue = pageValue.viewport && typeof pageValue.viewport === 'object' ? pageValue.viewport : null;
  const scrollValue = pageValue.scroll && typeof pageValue.scroll === 'object' ? pageValue.scroll : null;
  const sizeValue = pageValue.documentSize && typeof pageValue.documentSize === 'object' ? pageValue.documentSize : null;
  const clickValue = value.lastClick && typeof value.lastClick === 'object' ? value.lastClick : null;
  const explorerValue = value.elementExplorer && typeof value.elementExplorer === 'object' && !Array.isArray(value.elementExplorer) ? value.elementExplorer : null;
  const debugHiddenValue = Array.isArray(value.debugHiddenElements) ? value.debugHiddenElements : [];
  const count = (input) => Math.max(0, Math.min(10000000, Math.round(safeDebugNumber(input))));
  const sanitizeExplorerResult = (item) => {
    const element = sanitizeDebugElement(item);
    if (!element || !item || typeof item !== 'object') return null;
    const scrollSize = item.scrollSize && typeof item.scrollSize === 'object' ? item.scrollSize : {};
    const offsetSize = item.offsetSize && typeof item.offsetSize === 'object' ? item.offsetSize : {};
    return {
      ...element, hidden: Boolean(item.hidden), parentSelector: safeDebugText(item.parentSelector, 700), childCount: count(item.childCount),
      scrollSize: { width: count(scrollSize.width), height: count(scrollSize.height) },
      offsetSize: { width: count(offsetSize.width), height: count(offsetSize.height) }, outsideViewport: Boolean(item.outsideViewport),
    };
  };
  const sanitizeDebugHiddenElement = (item) => {
    const element = sanitizeDebugElement(item);
    if (!element || !item || typeof item !== 'object') return null;
    return {
      ...element,
      token: safeDebugText(item.token, 80),
      parentSelector: safeDebugText(item.parentSelector, 700),
      hiddenByDebug: item.hiddenByDebug === true,
    };
  };
  return {
    status: 'active', statusText: '', updatedAt: safeDebugNumber(value.updatedAt, Date.now()),
    page: {
      title: safeDebugText(pageValue.title, 180), file: safeDebugText(pageValue.file, 140), name: safeDebugText(pageValue.name, 140), workspace: safeDebugText(pageValue.workspace, 100), theme: safeDebugText(pageValue.theme, 140), iframe: Boolean(pageValue.iframe),
      viewport: viewportValue ? { width: count(viewportValue.width), height: count(viewportValue.height) } : null,
      scroll: scrollValue ? { x: safeDebugNumber(scrollValue.x), y: safeDebugNumber(scrollValue.y) } : null,
      documentSize: sizeValue ? { width: count(sizeValue.width), height: count(sizeValue.height) } : null,
    },
    stats: { elements: count(statsValue.elements), gridFlex: count(statsValue.gridFlex), overflow: count(statsValue.overflow), hidden: count(statsValue.hidden), interactive: count(statsValue.interactive), duplicateIds: count(statsValue.duplicateIds), fixedSticky: count(statsValue.fixedSticky) },
    hovered: sanitizeDebugElement(value.hovered),
    hitTest: Array.isArray(value.hitTest) ? value.hitTest.slice(0, 8).map(sanitizeDebugElement).filter(Boolean) : [],
    lastClick: clickValue ? { target: sanitizeDebugElement(clickValue.target), actionableAncestor: sanitizeDebugElement(clickValue.actionableAncestor), trusted: Boolean(clickValue.trusted), defaultPrevented: typeof clickValue.defaultPrevented === 'boolean' ? clickValue.defaultPrevented : null, timestamp: safeDebugNumber(clickValue.timestamp, Date.now()) } : null,
    hiddenSamples: Array.isArray(value.hiddenSamples) ? value.hiddenSamples.slice(0, 8).map((item) => safeDebugText(item, 180)).filter(Boolean) : [],
    overflowSamples: Array.isArray(value.overflowSamples) ? value.overflowSamples.slice(0, 8).map((item) => safeDebugText(item, 700)).filter(Boolean) : [],
    debugHiddenElements: debugHiddenValue.slice(0, 200).map(sanitizeDebugHiddenElement).filter((item) => item && item.token),
    elementExplorer: explorerValue ? {
      requestId: safeDebugText(explorerValue.requestId, 100), query: safeDebugText(explorerValue.query, 240), includeHidden: Boolean(explorerValue.includeHidden),
      offset: count(explorerValue.offset), limit: Math.max(1, Math.min(100, count(explorerValue.limit))), total: count(explorerValue.total),
      hasPrevious: Boolean(explorerValue.hasPrevious), hasNext: Boolean(explorerValue.hasNext), status: safeDebugText(explorerValue.status, 40),
      results: Array.isArray(explorerValue.results) ? explorerValue.results.slice(0, 100).map(sanitizeExplorerResult).filter(Boolean) : [],
    } : null,
    pointer: value.pointer && typeof value.pointer === 'object' ? { x: safeDebugNumber(value.pointer.x), y: safeDebugNumber(value.pointer.y) } : null,
  };
}
function initialDeveloperDebugSnapshot() {
  return {
    status: 'waiting', statusText: 'Move the pointer over the app to begin inspecting.', updatedAt: Date.now(),
    page: { title: 'Mad Station', file: '', name: 'Waiting for page data', workspace: '—', theme: '—', iframe: false, viewport: null, scroll: null, documentSize: null },
    stats: { elements: 0, gridFlex: 0, overflow: 0, hidden: 0, interactive: 0, duplicateIds: 0, fixedSticky: 0 }, hovered: null, hitTest: [], lastClick: null, hiddenSamples: [], overflowSamples: [], debugHiddenElements: [], elementExplorer: null, pointer: null,
  };
}
function pushDeveloperDebugSnapshot() {
  if (developerDebugWindow && !developerDebugWindow.isDestroyed() && !developerDebugWindow.webContents.isDestroyed()) {
    developerDebugWindow.webContents.send('developer-debug-snapshot', latestDeveloperDebugSnapshot || initialDeveloperDebugSnapshot());
  }
}
function openDeveloperDebugWindow(focusWindow = true) {
  if (developerDebugWindow && !developerDebugWindow.isDestroyed()) {
    developerDebugWindow.show();
    if (focusWindow) developerDebugWindow.focus();
    pushDeveloperDebugSnapshot();
    return { ok: true, reopened: true, pinned: developerDebugWindow.isAlwaysOnTop() };
  }
  const inspector = new BrowserWindow({
    width: 1120, height: 860, minWidth: 820, minHeight: 620,
    title: 'Mad Station — Developer Inspector', backgroundColor: '#0a1019',
    show: false, autoHideMenuBar: true, alwaysOnTop: true,
    webPreferences: { ...SAFE_WEB_PREFERENCES, preload: DEVELOPER_DEBUG_WINDOW_PRELOAD },
  });
  developerDebugWindow = inspector;
  childWindows.add(inspector);
  inspector.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  inspector.webContents.on('will-navigate', (event) => event.preventDefault());
  inspector.webContents.on('will-redirect', (event) => event.preventDefault());
  inspector.on('closed', () => {
    childWindows.delete(inspector);
    if (developerDebugWindow === inspector) developerDebugWindow = null;
  });
  inspector.webContents.once('did-finish-load', () => {
    if (developerDebugWindow !== inspector || inspector.isDestroyed()) return;
    inspector.webContents.send('developer-debug-window-state', { pinned: inspector.isAlwaysOnTop() });
    pushDeveloperDebugSnapshot();
    inspector.show();
    if (focusWindow) inspector.focus();
  });
  inspector.loadFile(DEVELOPER_DEBUG_WINDOW_FILE).catch((error) => {
    writeStartupDiagnostic('developer-debug-window-load-failed', { error });
    try { inspector.close(); } catch { /* window may already have been destroyed */ }
  });
  return { ok: true, reopened: false, pinned: true };
}
function isTrustedDeveloperDebugWindowSender(event) {
  try { return Boolean(developerDebugWindow && event.sender === developerDebugWindow.webContents && event.senderFrame === event.sender.mainFrame && frameMatchesLocalFile(event.senderFrame.url, DEVELOPER_DEBUG_WINDOW_FILE)); }
  catch { return false; }
}

// The separate inspector uses a distinct trusted sender, but it must obey the
// same locked-state and bounded-payload policy as the primary renderer IPC.
// The lock transition closes child windows; these checks also cover queued or
// in-flight IPC delivered while that close is taking effect.
function handleDeveloperDebugWindow(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!isTrustedDeveloperDebugWindowSender(event)) return { ok: false, error: 'Untrusted inspector window.' };
    if (locked) return { ok: false, error: 'Mad Station is locked.' };
    if (!isSafeIpcPayload(args)) return { ok: false, error: 'Invalid IPC payload.' };
    const result = await fn(event, ...args);
    if (locked) return { ok: false, error: 'Mad Station is locked.' };
    return result;
  });
}

const DEVELOPER_DEBUG_SETTING_DEFAULTS = Object.freeze({
  enabled: false, outlines: true, containers: false, grid: false, labels: false,
  overflow: true, hud: true, hoverInspector: false, hitTest: true, boxModel: false,
  focusable: false, clickTrace: false, pauseAnimations: false, hiddenAudit: true,
});
function normalizeDeveloperDebugSettings(value) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const result = { ...DEVELOPER_DEBUG_SETTING_DEFAULTS };
  for (const key of Object.keys(result)) if (typeof input[key] === 'boolean') result[key] = input[key];
  return result;
}
// Mad Station's main shell is an Electron BaseWindow. BaseWindow deliberately has no
// `webContents`; the trusted renderer lives in the attached controlView (WebContentsView).
// Keeping this lookup in one place avoids inspector IPC handlers throwing when they try
// to read `mainWindow.webContents.isDestroyed()` and ensures settings are sent to the
// renderer that owns localStorage, React Developer Settings, and the homepage switcher.
function getMainRendererWebContents() {
  try {
    if (!mainWindow || typeof mainWindow.isDestroyed !== 'function' || mainWindow.isDestroyed()) return null;
    const contents = controlView?.webContents;
    if (!contents || typeof contents.isDestroyed !== 'function' || contents.isDestroyed()) return null;
    return contents;
  } catch {
    return null;
  }
}
async function readDeveloperDebugSettingsFromMainWindow() {
  const contents = getMainRendererWebContents();
  if (!contents) throw new Error('Mad Station main renderer is not available.');
  const value = await contents.executeJavaScript(`(() => { try { return JSON.parse(localStorage.getItem('madstation.developer-debug.v1') || '{}'); } catch { return {}; } })()`, true);
  return normalizeDeveloperDebugSettings(value);
}

handleDeveloperDebugWindow('developer-debug-window-get-settings', async () => {
  try {
    return { ok: true, settings: await readDeveloperDebugSettingsFromMainWindow() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not read debug settings from Mad Station.' };
  }
});
handleDeveloperDebugWindow('developer-debug-window-set-settings', (_event, value) => {
  const contents = getMainRendererWebContents();
  if (!contents) return { ok: false, error: 'Mad Station main renderer is not available.' };
  const settings = normalizeDeveloperDebugSettings(value);
  try {
    contents.send('developer-debug-settings-from-inspector', settings);
    return { ok: true, settings };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not apply debug settings to Mad Station.' };
  }
});
// Keep the separate Inspector's controls synchronized when Debug Mode is changed
// from Developer Settings or by the inspector itself. This channel accepts only the
// trusted main renderer; the inspector preload receives a display-only state update.
handle('developer-debug-settings-changed', (_event, value) => {
  const settings = normalizeDeveloperDebugSettings(value);
  if (developerDebugWindow && !developerDebugWindow.isDestroyed() && !developerDebugWindow.webContents.isDestroyed()) {
    developerDebugWindow.webContents.send('developer-debug-window-settings-sync', settings);
  }
  return { ok: true, settings };
});

handleDeveloperDebugWindow('developer-debug-window-search-elements', (_event, payload) => {
  const contents = getMainRendererWebContents();
  if (!contents) return { ok: false, error: 'Mad Station main renderer is not available.' };
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { ok: false, error: 'Invalid element search request.' };
  const requestId = safeDebugText(payload.requestId, 100);
  if (!requestId) return { ok: false, error: 'Missing search request ID.' };
  try {
    contents.send('developer-debug-inspector-command', {
      type: 'search-elements', requestId, query: safeDebugText(payload.query, 240),
      includeHidden: payload.includeHidden === true,
      offset: Math.max(0, Math.min(10000000, Math.floor(safeDebugNumber(payload.offset)))),
      limit: Math.max(1, Math.min(100, Math.floor(safeDebugNumber(payload.limit, 50)))),
    });
    return { ok: true, requestId };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not send the element search to Mad Station.' };
  }
});
handleDeveloperDebugWindow('developer-debug-window-highlight-element', (_event, payload) => {
  const contents = getMainRendererWebContents();
  if (!contents) return { ok: false, error: 'Mad Station main renderer is not available.' };
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || typeof payload.selector !== 'string' || !payload.selector || payload.selector.length > 700) return { ok: false, error: 'Invalid element selector.' };
  try {
    contents.send('developer-debug-inspector-command', { type: 'highlight-element', selector: payload.selector, shadowHosts: Array.isArray(payload.shadowHosts) ? payload.shadowHosts.slice(0, 12).map((item) => safeDebugText(item, 700)).filter(Boolean) : [] });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not highlight the selected element.' };
  }
});
handleDeveloperDebugWindow('developer-debug-window-manage-hidden-elements', (_event, payload) => {
  const contents = getMainRendererWebContents();
  if (!contents) return { ok: false, error: 'Mad Station main renderer is not available.' };
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { ok: false, error: 'Invalid hidden-element request.' };
  const action = safeDebugText(payload.action, 24);
  if (!['unhide', 'unhide-all'].includes(action)) return { ok: false, error: 'Unsupported hidden-element action.' };
  const token = safeDebugText(payload.token, 80);
  if (action === 'unhide' && !token) return { ok: false, error: 'Missing temporary hidden-element ID.' };
  try {
    contents.send('developer-debug-inspector-command', action === 'unhide'
      ? { type: 'unhide-element', token }
      : { type: 'unhide-all-elements' });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not update hidden elements.' };
  }
});

// Developer Settings is protected by a main-process password session. Hiding
// the React panel is only presentation; every privileged Developer command also
// checks this gate so a renderer event cannot bypass the password screen.
function handleDeveloper(channel, fn, options = {}) {
  handle(channel, (event, ...args) => {
    if (!developerOptionsAuth.isUnlocked()) return { ok: false, error: 'Unlock Developer Options to use this feature.' };
    return fn(event, ...args);
  }, options);
}

handle('get-developer-options-status', () => developerOptionsAuth.status());
handle('unlock-developer-options', (_event, password) => developerOptionsAuth.unlock(password));
handle('lock-developer-options', () => developerOptionsAuth.lock());
handle('close-developer-options-section', () => developerOptionsAuth.closeSection());
handle('set-developer-options-keep-unlocked-for-session', (_event, enabled) => developerOptionsAuth.setKeepUnlockedForSession(enabled));
handle('change-developer-options-password', (_event, payload) => developerOptionsAuth.changePassword(payload));

handle('developer-debug-open-window', (_event, focusWindow) => openDeveloperDebugWindow(focusWindow !== false));
handle('developer-debug-close-window', () => {
  if (developerDebugWindow && !developerDebugWindow.isDestroyed()) developerDebugWindow.close();
  return { ok: true };
});
handle('developer-debug-publish-snapshot', (_event, payload) => {
  const snapshot = sanitizeDeveloperDebugSnapshot(payload);
  if (!snapshot) return { ok: false, error: 'Invalid debug snapshot.' };
  if (snapshot.lastClick && snapshot.lastClick.timestamp <= developerDebugClickClearBefore) snapshot.lastClick = null;
  latestDeveloperDebugSnapshot = snapshot;
  pushDeveloperDebugSnapshot();
  return { ok: true };
});

handleDeveloperDebugWindow('developer-debug-window-set-pinned', (_event, pinned) => {
  if (typeof pinned !== 'boolean') return { ok: false, error: 'Invalid pin state.' };
  developerDebugWindow.setAlwaysOnTop(pinned);
  const state = { pinned: developerDebugWindow.isAlwaysOnTop() };
  developerDebugWindow.webContents.send('developer-debug-window-state', state);
  return { ok: true, ...state };
});
handleDeveloperDebugWindow('developer-debug-window-copy-text', (_event, text) => {
  if (typeof text !== 'string' || text.length > 100000) return { ok: false, error: 'Invalid clipboard payload.' };
  try { clipboard.writeText(text); return { ok: true }; }
  catch (error) { return { ok: false, error: error?.message || 'Could not copy text.' }; }
});
handleDeveloperDebugWindow('developer-debug-window-clear-click', () => {
  developerDebugClickClearBefore = Date.now();
  if (latestDeveloperDebugSnapshot) latestDeveloperDebugSnapshot = { ...latestDeveloperDebugSnapshot, lastClick: null };
  pushDeveloperDebugSnapshot();
  return { ok: true };
});

function handleForWorkspaces(workspaces, message) {
  const allowedWorkspaces = new Set(workspaces);
  return (channel, fn, options = {}) => handle(channel, (event, ...args) => {
    if (!allowedWorkspaces.has(workspaceApp)) return { ok: false, error: message };
    return fn(event, ...args);
  }, options);
}
function handleForWorkspace(workspace, message) {
  return handleForWorkspaces([workspace], message);
}

// Settings channel mapping is typed and still routes through the secure wrapper above.
registerSettingsIpcHandlers(handle, settingsController);

function closeAllAccountViews() { return accountBrowserRuntime.closeAllViews(); }

function setWorkspaceApp(app) {
  const next = ['launcher', 'ai-hub', 'clipboard', 'ai-lab', 'instruction-forge', 'video-hub'].includes(app) || app === 'image-hub' ? app : 'launcher';
  workspaceApp = next;
  if (next !== 'ai-lab') clearArenaBrowserBindings();
  if (next !== 'instruction-forge') closeAllForgeBrowserViews({ clearSelection: false });
  if (next !== 'video-hub') { videoHubNotificationOverlayOpen = false; suspendVideoHubBrowsers(true); }
  if (next !== 'image-hub') suspendImageHubBrowsers(true);
  if (next === 'ai-hub' && !locked) {
    setControlMode('app');
    if (activeId) activateAccount(activeId);
  } else if (next === 'instruction-forge' && !locked) {
    closeAllAccountViews();
    setControlMode('launcher');
    if (forgeBrowserAccountId && getAccount(forgeBrowserAccountId)) setForgeBrowserAccount(forgeBrowserAccountId);
  } else {
    closeAllAccountViews();
    setControlMode('launcher');
  }
  if (controlView && !controlView.webContents.isDestroyed()) controlView.webContents.send('workspace-app', { app: workspaceApp });
  return { ok: true, app: workspaceApp };
}

handle('set-control-mode', (_event, mode) => {
  if (!isControlMode(mode)) {
    return { ok: false, error: 'Invalid control mode.' };
  }
  setControlMode(mode);
  return { ok: true, mode: controlMode };
});
handle('window-minimize', () => { if (!mainWindow) return { ok: false }; mainWindow.minimize(); return { ok: true }; }, { toolbar: true });
handle('window-toggle-maximize', () => {
  if (!mainWindow) return { ok: false };
  if (mainWindow.isMaximized()) mainWindow.unmaximize(); else mainWindow.maximize();
  return { ok: true, maximized: mainWindow.isMaximized() };
}, { toolbar: true });
handle('window-close', () => { if (!mainWindow) return { ok: false }; mainWindow.close(); return { ok: true }; }, { toolbar: true });
handle('set-workspace-app', (_event, app) => setWorkspaceApp(app));
handle('write-system-clipboard', (_event, text) => {
  if (typeof text !== 'string') return { ok: false, error: 'Clipboard text must be a string.' };
  if (!isStringWithinLength(text, 50000)) return { ok: false, error: 'Clipboard text is too large.' };
  try {
    clipboard.writeText(text);
    return { ok: true };
  } catch (error) { return { ok: false, error: error?.message || 'Could not write to the system clipboard.' };
  }
});


handle('toggle-sidebar', () => { sidebarHidden = !sidebarHidden; positionViews(); broadcastSidebarState(); pushToolbar(); return { ok: true, hidden: sidebarHidden }; }, { toolbar: true });
handle('set-sidebar-hidden', (_event, hidden) => {
  if (!isBooleanValue(hidden)) return { ok: false, error: 'Invalid sidebar visibility.' };
  sidebarHidden = hidden;
  positionViews();
  broadcastSidebarState();
  pushToolbar();
  return { ok: true, hidden: sidebarHidden };
}, { toolbar: true });


const DEVELOPER_FILES = new Set(['docs/architecture/CORE_SYSTEM.md', 'docs/design/DESIGN_SYSTEM.md', 'docs/README.md', 'AGENTS.md', 'CLAUDE.md', 'README.md', 'docs/security/SECURITY_AUDIT.md', 'docs/licenses/THIRD_PARTY_NOTICES.md', 'docs/licenses/Public-Suffix-List-Notice.md', 'docs/licenses/MPL-2.0.txt', 'package.json', 'src/design-tokens.css', 'src/design-kit.css', 'src/styles.css', 'src/home.css', 'src/pages.css', 'src/developer-visual-debug.js', 'src/developer-visual-debug.css', 'src/developer-debug-window.html', 'src/developer-debug-window.css', 'src/developer-debug-window.js', 'src/developer-debug-window-preload.js', 'src/home-core-system.js', 'src/home-apps.js', 'src/home-app-list.js', 'src/home-mini-apps.js', 'src/home-mini-list.js', 'src/home-widgets.js', 'src/home-widget-list.js', 'src/home-customizer.js', 'src/home-layout-editor.js', 'src/home-galaxy.html', 'src/home-parallax-jungle.html', 'src/home-claymorphism.html', 'src/home-glass.html', 'src/main/settings-controller.ts', 'src/main/downloads-controller.ts', 'src/main/settings-ipc.ts', 'src/main/downloads-ipc.ts', 'src/main/video-hub-ipc.ts', 'src/main/video-hub-controller.ts', 'src/main/json-file-store.ts', 'src/main/ai-hub-controller.ts', 'src/main/ai-hub-ipc.ts', 'src/main/ai-hub-read-model.ts', 'src/main/workspace-transfer-controller.ts', 'src/main/workspace-transfer-ipc.ts', 'src/main/workspace-transfer-files.ts', 'src/main/background-files.ts', 'src/main/background-ipc.ts', 'src/main/ai-lab-credentials.ts', 'src/main/ai-lab-runtime.ts', 'src/main/workspace-browser-events.ts', 'src/main/arena-store-runtime.ts', 'src/main/account-prompt-runtime.ts', 'src/main/native-operations-runtime.ts', 'src/main/arena-browser-runtime.ts', 'src/main/arena-prompt-runtime.ts', 'src/main/forge-browser-runtime.ts', 'src/main/video-hub-browser-runtime.ts', 'src/main/image-hub-browser-runtime.ts', 'src/main/browser-view-policy.ts', 'src/main/browser-view-runtime.ts', 'src/main/browser-view-pruning-runtime.ts', 'src/main/browser-view-reclamation-runtime.ts', 'src/main/workspace-browser-view-runtime.ts', 'src/main/arena-account-data-runtime.ts', 'src/main/session-lifecycle-runtime.ts', 'src/main/browser-view-layout-runtime.ts', 'src/main/web-contents-view-attachment-runtime.ts', 'src/main/video-hub-network-runtime.ts', 'src/main/account-browser-runtime.ts', 'src/main/memory-diagnostics-runtime.ts', 'src/main/system-cpu-usage.js', 'src/main/icon-runtime.ts', 'src/main/network-security.ts', 'src/main/public-suffix-list.ts', 'src/main/lock-controller.ts', 'src/main/lock-ipc.ts', 'src/main/app-lifecycle-runtime.ts', 'src/renderer-react/context-menu.tsx', 'src/renderer-react/rename-account-modal.tsx', 'src/renderer-react/password-modal.tsx', 'src/renderer-react/appearance-controls.tsx', 'src/renderer-react/global-settings-panels.tsx', 'src/renderer-react/system-settings-panels.tsx', 'src/renderer-react/information-security-panels.tsx', 'src/renderer-react/ai-playground-api-arena.tsx', 'src/renderer-react/ai-playground-api-model-settings.tsx', 'src/renderer-react/ai-playground-browser-arenas.tsx', 'src/renderer-react/ai-playground-arena-management.tsx', 'src/renderer-react/instruction-forge-accounts.tsx', 'src/renderer-react/instruction-forge-settings.tsx', 'src/renderer-react/instruction-forge-composer.tsx', 'src/renderer-react/ai-playground-settings.tsx', 'src/renderer-react/ai-playground-arena-setup.tsx', 'src/renderer-react/image-hub-discovery.tsx', 'src/renderer-react/image-hub-workspace-toolbar.tsx', 'src/renderer-react/image-hub-workspace-chrome.tsx', 'src/renderer-react/image-hub-sidebar-chrome.tsx', 'src/renderer-react/image-hub-settings.tsx', 'src/renderer-react/image-hub-browser-state.tsx', 'src/renderer-react/notes-workspace.tsx', 'src/renderer-react/utility-workspaces.tsx', 'src/renderer-react/remaining-settings-panels.tsx', 'docs/design-kit-preview.html']);

const nativeOperationsRuntime = createNativeOperationsRuntime({
  path,
  fs,
  getDeveloperRoot: () => app.isPackaged ? path.join(process.resourcesPath, 'developer-docs') : app.getAppPath(),
  developerFiles: DEVELOPER_FILES,
  showInFolder: (filePath) => shell.showItemInFolder(filePath),
  openPath: (filePath) => shell.openPath(filePath),
  getUserDataPath: () => app.getPath('userData'),
  getIconFolderPath: iconFolderPath,
  chooseIconFile: () => dialog.showOpenDialog(mainWindow, {
    title: 'Choose icon',
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'ico', 'webp', 'gif'] }],
  }),
  maxIconBytes: MAX_ICON_FILE_BYTES,
  sanitizeIcon,
  getRemoteIconCache,
  clearLocalIconCache: () => iconRuntime.clearLocalIconCache(),
  pushConfig,
  warmRemoteIconsAndPush,
  resolvePublicHost: (hostname) => resolvePublicInternetAddresses(hostname),
  fetchReleaseFeed: (url, addresses) => fetchPinnedHttpsJson(url, addresses),
  createHeadRequest: (url, addresses) => createPinnedHttpsRequest(url, addresses, 'HEAD'),
  getReleaseFeedUrl: () => config.settings?.releaseFeedUrl || '',
  getCurrentVersion: () => APP_VERSION,
  normalizeHttpsUrl,
});

handle('check-for-updates', () => nativeOperationsRuntime.checkForUpdates());

registerBackgroundIpcHandlers(handle, {
  async chooseBackgroundFile() {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Add background from your computer', properties: ['openFile'],
      filters: [{ name: 'Image backgrounds', extensions: ['png','jpg','jpeg','webp','gif','bmp','avif','svg'] }]
    });
    if (canceled || !filePaths?.[0]) return { ok: false, canceled: true };
    return backgroundFilesController.addFromPath(filePaths[0]);
  },

  removeBackground(id) {
    const safeId = cleanId(id, 120);
    const existing = (config.settings.customBackgrounds || []).find((item) => item.id === safeId);
    if (!existing) return { ok: false, error: 'Background not found.' };
    if (existing.type === 'local') backgroundFilesController.removeStoredFile(existing.url);
    config.settings = normalizeAppSettings({
      ...config.settings,
      customBackgrounds: (config.settings.customBackgrounds || []).filter((item) => item.id !== safeId),
      ...(config.settings.backgroundStyle === 'custom' && config.settings.backgroundId === safeId ? { backgroundStyle: 'plain', backgroundId: '' } : {}),
    });
    applyLiveAppSettings();
    broadcastConfig();
    return { ok: true, settings: config.settings };
  },
});

registerWorkspaceTransferIpcHandlers(handle, {
  async exportAccounts() {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Export Mad Station accounts',
      defaultPath: `Mad-Station-accounts-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'Account export', extensions: ['json'] }],
    });
    if (canceled || !filePath) return { ok: false, canceled: true };
    try {
      const payload = workspaceTransferController.createAccountExport(config, new Date().toISOString());
      writeWorkspaceJsonAtomically(filePath, payload, workspaceTransferFileDependencies);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: diagnosticError(error, 'Could not export accounts.') || 'Could not export accounts.' };
    }
  },

  async importAccounts() {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Import Mad Station accounts',
      properties: ['openFile'],
      filters: [{ name: 'Account export', extensions: ['json'] }],
    });
    if (canceled || !filePaths?.[0]) return { ok: false, canceled: true };
    try {
      const raw = readWorkspaceJson(filePaths[0], workspaceTransferFileDependencies);
      const result = workspaceTransferController.prepareAccountImport(raw, config);
      if (!result.ok) return result;
      // Commit only after the complete import has been validated/prepared.
      config = result.config;
      broadcastConfig();
      return { ok: true, count: result.count };
    } catch (error) {
      return { ok: false, error: diagnosticError(error, 'Could not import accounts.') || 'Could not import accounts.' };
    }
  },

  async backupConfig() {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Back up Mad Station workspace',
      defaultPath: `Mad-Station-backup-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'Mad Station backup', extensions: ['json'] }],
    });
    if (canceled || !filePath) return { ok: false, canceled: true };
    try {
      const backup = workspaceTransferController.createWorkspaceBackup(config, APP_VERSION, new Date().toISOString());
      writeWorkspaceJsonAtomically(filePath, backup, workspaceTransferFileDependencies);
      // Preserve the existing command result shape for callers that use the selected path.
      return { ok: true, path: filePath };
    } catch (error) {
      return { ok: false, error: diagnosticError(error, 'Could not create the backup.') || 'Could not create the backup.' };
    }
  },

  async restoreConfig() {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Restore Mad Station workspace',
      properties: ['openFile'],
      filters: [{ name: 'Mad Station backup', extensions: ['json'] }],
    });
    if (canceled || !filePaths?.[0]) return { ok: false, canceled: true };
    try {
      const raw = readWorkspaceJson(filePaths[0], workspaceTransferFileDependencies);
      // Complete migration/validation before destructive session cleanup begins.
      const restored = workspaceTransferController.prepareWorkspaceRestore(raw);
      await wipeAllSessions();
      config = restored;
      sanitizeManagedBackgroundSettings();
      activeId = config.activeId || orderedConfigItems(config.accounts, config.accountOrder)[0]?.id || null;
      applyLiveAppSettings();
      applyLiveSecurity();
      broadcastConfig();
      if (activeId && workspaceApp === 'ai-hub' && !locked) {
        createAccountView(getAccount(activeId));
        positionViews();
      }
      return { ok: true, settings: config.settings };
    } catch (error) {
      return { ok: false, error: diagnosticError(error, 'That backup is invalid or could not be restored.') || 'That backup is invalid or could not be restored.' };
    }
  },
});


handleDeveloper('discover-theme-designs', async () => {
  try {
    return { ok: true, themes: discoverThemeDesigns(__dirname, path.join(app.getPath('userData'), 'theme-imports')), catalog: getImportedThemeCatalog(app.getPath('userData'), __dirname), scannedAt: new Date().toISOString() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not scan the current theme source files.' };
  }
});

handleDeveloper('scan-theme-pack-import', async (_event, requestedPath) => {
  let zipPath = '';
  if (requestedPath !== undefined && requestedPath !== null) {
    if (typeof requestedPath !== 'string' || requestedPath.length > 4096) return { ok: false, error: 'Choose a valid theme ZIP file.' };
    try {
      zipPath = path.resolve(requestedPath);
      if (path.extname(zipPath).toLowerCase() !== '.zip') return { ok: false, error: 'Only .zip theme packs can be imported.' };
      const stats = fs.statSync(zipPath);
      if (!stats.isFile()) return { ok: false, error: 'The selected theme ZIP is not a regular file.' };
      if (stats.size > 80 * 1024 * 1024) return { ok: false, error: 'Theme ZIP is too large. The compressed archive limit is 80 MB.' };
    } catch { return { ok: false, error: 'Could not access the selected theme ZIP. Choose it again and retry.' }; }
  } else {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Import Mad Station theme ZIP',
      buttonLabel: 'Scan theme ZIP',
      properties: ['openFile'],
      filters: [{ name: 'Theme design pack (ZIP)', extensions: ['zip'] }],
    });
    if (result.canceled || !result.filePaths?.[0]) return { ok: false, canceled: true };
    zipPath = result.filePaths[0];
  }
  try {
    const liveThemes = discoverThemeDesigns(__dirname, path.join(app.getPath('userData'), 'theme-imports')).map((theme) => ({
      id: theme.id, title: theme.title, filename: theme.filename, fingerprint: theme.fingerprint,
    }));
    return scanThemePackZip(zipPath, __dirname, app.getPath('userData'), liveThemes);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not scan this theme ZIP.' };
  }
});

handleDeveloper('import-theme-pack', async (_event, scanId, choices) => {
  try {
    return importScannedThemePack(app.getPath('userData'), __dirname, scanId, choices);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not import the selected themes.' };
  }
});

handle('get-imported-theme-catalog', async () => {
  try { return { ok: true, catalog: getImportedThemeCatalog(app.getPath('userData'), __dirname) }; }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'Could not load imported themes.' }; }
});

handleDeveloper('remove-imported-theme', async (_event, mode) => {
  try { return removeImportedTheme(app.getPath('userData'), __dirname, mode); }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'Could not remove that imported theme.' }; }
});

handleDeveloper('get-theme-import-restart-status', async () => {
  try { return { ok: true, status: getThemeImportRestartStatus(app.getPath('userData')) }; }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'Could not load the theme restart status.' }; }
});

handleDeveloper('export-theme-design-pack', async (_event, requestedThemeIds) => {
  let built;
  try {
    built = buildThemeDesignPack(__dirname, requestedThemeIds, path.join(app.getPath('userData'), 'theme-imports'));
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not prepare the theme design pack.' };
  }
  const date = new Date().toISOString().slice(0, 10);
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export visual-only theme design pack',
    defaultPath: `Mad-Station-Theme-Design-Pack-${date}.zip`,
    filters: [{ name: 'Theme design pack (ZIP)', extensions: ['zip'] }],
  });
  if (result.canceled || !result.filePath) return { ok: false, canceled: true };
  const filePath = /\.zip$/i.test(result.filePath) ? result.filePath : `${result.filePath}.zip`;
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, built.archive);
    fs.renameSync(temporaryPath, filePath);
    return {
      ok: true,
      path: filePath,
      themeCount: built.themeCount,
      fileCount: built.fileCount,
      sizeBytes: built.archive.length,
    };
  } catch (error) {
    try { fs.unlinkSync(temporaryPath); } catch { /* no temporary file to clean up */ }
    return { ok: false, error: diagnosticError(error, 'Could not write the theme design ZIP.') || 'Could not write the theme design ZIP.' };
  }
});

handleDeveloper('show-developer-file-location', (_event, relativeFile) => nativeOperationsRuntime.showDeveloperFileLocation(relativeFile));
handleDeveloper('open-developer-file', (_event, relativeFile) => nativeOperationsRuntime.openDeveloperFile(relativeFile));
handle('open-data-folder', () => nativeOperationsRuntime.openDataFolder());

// Electron authorization remains in handle(); this controller owns the typed,
// ID-only download command family and folder-setting transition.
const downloadsController = createDownloadsController({
  manager: downloads,
  getDownloadSettings: downloadSettings,
  setDownloadSettings: (next) => { config.settings.downloads = next; },
  getSettingsSnapshot: () => config.settings,
  normalizeSettings: normalizeDownloadSettings,
  chooseDirectory: (options) => dialog.showOpenDialog(mainWindow, options),
  broadcastConfig,
});
registerDownloadsIpcHandlers(handle, downloadsController);

function recordRecentAccount(id) {
  if (!config || !getAccount(id)) return;
  config.recentAccountIds = [id, ...(config.recentAccountIds || []).filter((item) => item !== id)].slice(0, 10);
}

handleForWorkspace('ai-hub', 'Open AI Hub to switch accounts.')('switch-account', (_event, id) => {
  const result = activateAccount(id);
  if (result?.ok !== false) { recordRecentAccount(id); broadcastConfig(); }
  return result;
});

handleForWorkspace('ai-hub', 'Open AI Hub to navigate the active account.')('navigate', (_event, action) => {
  if (!activeId) return false;
  const view = contentViews.get(activeId);
  if (!view || view.webContents.isDestroyed()) return false;
  const wc = view.webContents;
  if (action === 'back' && navCanGoBack(wc)) navGoBack(wc);
  if (action === 'forward' && navCanGoForward(wc)) navGoForward(wc);
  if (action === 'reload') wc.reload();
  if (action === 'stop') wc.stop();
  pushToolbar();
  return true;
}, { toolbar: true });

handleForWorkspace('ai-hub', 'Open AI Hub to open the active account externally.')('open-external', async () => {
  if (!activeId) return false;
  const account = getAccount(activeId);
  const view = contentViews.get(activeId);
  if (!account || !view) return false;
  return await openExternalSafe(externalUrlForPage(view.webContents.getURL() || account.url, account));
}, { toolbar: true });

handle('open-external-url', async (_event, url) => {
  const normalized = normalizeHttpsUrl(url);
  if (!normalized) return { ok: false, error: 'Only valid HTTPS URLs can be opened.' };
  const opened = await openExternalSafe(normalized);
  return opened ? { ok: true } : { ok: false, error: 'Could not open the link in your browser.' };
});

handle('toolbar-get-state', () => toolbarState(), { toolbar: true });

handle('open-icon-folder', () => nativeOperationsRuntime.openIconFolder());
handle('refresh-icons', () => nativeOperationsRuntime.refreshIcons());
handle('cache-icon', (_event, iconUrl) => nativeOperationsRuntime.cacheIcon(iconUrl));
handle('choose-icon', () => nativeOperationsRuntime.chooseIcon());

handle('verify-provider', (_event, rawUrl) => nativeOperationsRuntime.verifyProvider(rawUrl));

function removeAccountView(id, options = {}) { return accountBrowserRuntime.removeView(id, options); }


// AI Hub provider/account IPC mappings are typed separately. The existing
// `handle` wrapper remains responsible for sender authorization, lock-state
// policy, and payload validation; commands below retain host-owned side effects.
registerAiHubIpcHandlers(handle, {
  addService: (payload) => {
    const result = aiHubController.addService(payload);
    if (!result.ok) return result;
    broadcastConfig();
    warmRemoteIconsAndPush();
    return result;
  },
  updateService: (id, payload) => {
    const result = aiHubController.updateService(id, payload);
    if (!result.ok) return result;
    broadcastConfig();
    warmRemoteIconsAndPush();
    return result;
  },
  deleteService: async (id) => {
    const service = getService(id);
    if (!service) return { ok: false, error: 'Provider not found.' };
    const accounts = config.accounts.filter((a) => a.serviceId === id);
    for (const account of accounts) {
      removeAccountView(account.id);
      try { await clearAccountEverything(account); } catch { /* best effort */ }
    }
    config.accounts = config.accounts.filter((a) => a.serviceId !== id);
    config.services = config.services.filter((s) => s.id !== id);
    config.serviceOrder = (config.serviceOrder || []).filter((itemId) => itemId !== id);
    if (!getAccount(activeId)) {
      activeId = orderedConfigItems(config.accounts, config.accountOrder)[0]?.id || null;
      config.activeId = activeId;
    }
    broadcastConfig();
    if (activeId && workspaceApp === 'ai-hub' && !locked) activateAccount(activeId);
    else positionViews();
    return { ok: true };
  },
  addAccount: (payload) => {
    const result = aiHubController.addAccount(payload);
    if (!result.ok) return result;
    const account = result.account;
    broadcastConfig();
    warmRemoteIconsAndPush();
    if (workspaceApp === 'ai-hub' && !locked) activateAccount(account.id);
    else { activeId = account.id; config.activeId = account.id; if (!saveConfig(config)) notice('Could not save the active account change. Please retry.'); }
    return result;
  },
  updateAccount: async (id, payload) => {
    const plan = aiHubController.prepareUpdateAccount(id, payload);
    if (!plan.ok) return plan;
    if (plan.sessionChanged) removeAccountView(plan.accountId);
    const account = aiHubController.applyUpdateAccount(plan);
    if (!account) return { ok: false, error: 'Account not found.' };
    if (plan.sessionChanged) { try { await clearAccountEverything(account); } catch {} }
    broadcastConfig();
    warmRemoteIconsAndPush();
    if (plan.sessionChanged && activeId === plan.accountId) { createAccountView(account); positionViews(); }
    return { ok: true, account };
  },
  renameAccount: (id, name) => {
    const result = aiHubController.renameAccount(id, name);
    if (!result.ok) return result;
    broadcastConfig();
    return result;
  },
  setAccountShortcut: (id, shortcut) => {
    const result = aiHubController.setAccountShortcut(id, shortcut);
    if (!result.ok) return result;
    broadcastConfig();
    return result;
  },
  deleteAccount: async (id) => {
    const account = getAccount(id);
    if (!account) return { ok: false, error: 'Account not found.' };
    removeAccountView(id);
    try { await clearAccountEverything(account); } catch { /* best effort */ }
    config.accounts = config.accounts.filter((a) => a.id !== id);
    config.accountOrder = (config.accountOrder || []).filter((itemId) => itemId !== id);
    if (activeId === id) {
      activeId = orderedConfigItems(config.accounts, config.accountOrder)[0]?.id || null;
      config.activeId = activeId;
    }
    broadcastConfig();
    if (activeId && workspaceApp === 'ai-hub' && !locked) activateAccount(activeId);
    else positionViews();
    return { ok: true };
  },
  reorderServices: (ids) => {
    if (!reorderConfigCollection(config, 'serviceOrder', ids)) return { ok: false, error: 'Invalid provider order.' };
    broadcastConfig();
    return { ok: true, serviceOrder: config.serviceOrder };
  },
  reorderAccounts: (ids) => {
    if (!reorderConfigCollection(config, 'accountOrder', ids)) return { ok: false, error: 'Invalid account order.' };
    broadcastConfig();
    return { ok: true, accountOrder: config.accountOrder };
  },
  resetAccount: async (id) => {
    const account = getAccount(id);
    if (!account) return { ok: false, error: 'Account not found.' };
    const wasActive = activeId === id;
    removeAccountView(id);
    try { await clearAccountEverything(account); } catch { /* best effort */ }
    if (!saveConfig(config)) notice('Could not save the account reset. Please retry.');
    if (wasActive && workspaceApp === 'ai-hub' && !locked) {
      createAccountView(account);
      positionViews();
    }
    return { ok: true };
  },
  clearAccountCache: async (id) => {
    const account = getAccount(id);
    if (!account) return { ok: false, error: 'Account not found.' };
    try { await clearAccountCaches(account); } catch (error) { return { ok: false, error: error?.message || 'Could not clear the account cache.' }; }
    return { ok: true };
  },
  clearAccountSiteData: async (id) => {
    const account = getAccount(id);
    if (!account) return { ok: false, error: 'Account not found.' };
    const wasActive = activeId === id;
    removeAccountView(id);
    try { await sessionFor(account).clearStorageData({ storages: ['cookies', 'localstorage', 'sessionstorage', 'indexdb', 'websql', 'cachestorage', 'serviceworkers'] }); await sessionFor(account).clearCache(); } catch (error) { return { ok: false, error: error?.message || 'Could not clear site data.' }; }
    if (wasActive && workspaceApp === 'ai-hub' && !locked) { createAccountView(account); positionViews(); }
    return { ok: true };
  },
});



// ---------------------------------------------------------------------------
// Memory diagnostics
// ---------------------------------------------------------------------------

const memoryDiagnosticsRuntime = createMemoryDiagnosticsRuntime({
  getAppMetrics: () => app.getAppMetrics?.() || [],
  processId: process.pid,
  getSystemMemoryInfo: () => process.getSystemMemoryInfo(),
  views: { aiHub: contentViews, arena: arenaContentViews, forge: forgeContentViews },
  getControlWebContents: () => controlView?.webContents || null,
  getToolbarWebContents: () => toolbarView?.webContents || null,
  getAccount: (id) => getAccount(id),
  getWorkspaceApp: () => workspaceApp,
  isLocked: () => locked,
  getActiveId: () => activeId,
  getConfig: () => config,
  getArenaBrowserModels: () => arenaBrowserModels,
  getForgeBrowserAccountId: () => forgeBrowserAccountId,
  getAccountRuntime: (id) => accountRuntimeFor(id),
  normalizeHttpsUrl,
  diagnosticError,
  getSecurity: () => security(),
  getLocalIconCacheStats: () => iconRuntime.localIconCacheStats(),
  getRemoteIconCacheStats: () => getRemoteIconCache(),
  getDownloadState: () => downloads.getState?.() || {},
  getRuntimeInfo: () => ({
    version: APP_VERSION,
    electron: process.versions.electron || '',
    chromium: process.versions.chrome || '',
    node: process.versions.node || '',
    platform: process.platform,
    arch: process.arch,
    osRelease: (() => { try { return require('node:os').release(); } catch { return ''; } })(),
  }),
  resolvePublicHost: (hostname) => resolvePublicInternetAddresses(hostname),
  createHeadRequest: (url, addresses) => createPinnedHttpsRequest(url, addresses, 'HEAD'),
  now: () => Date.now(),
  nowIso: () => new Date().toISOString(),
});
const sampleSystemCpuUsagePercent = createSystemCpuUsageSampler();
function getMemorySnapshot() {
  const snapshot = memoryDiagnosticsRuntime.getMemorySnapshot();
  let systemCpuPercent = null;
  try { systemCpuPercent = sampleSystemCpuUsagePercent(os.cpus()); } catch { /* CPU metrics are optional and must not disrupt memory diagnostics. */ }
  return { ...snapshot, systemCpuPercent };
}
function collectSessionDiagnostics() { return memoryDiagnosticsRuntime.collectSessionDiagnostics(); }
async function probeProvider(service) { return memoryDiagnosticsRuntime.probeProvider(service); }
async function collectDiagnostics(options = {}) { return memoryDiagnosticsRuntime.collectDiagnostics(options); }

async function reclaimUnusedMemory() {
  const before = getMemorySnapshot();
  const accountViewReclamation = reclaimAccountViewsRuntime({
    viewIds: [...contentViews.keys()],
    workspaceApp,
    locked,
    activeId,
    borrowedIds: aiLabBorrowedAccountViews,
  }, (id) => {
    const closeResult = removeAccountView(id, { preserveRuntime: true, cancelDownloads: false });
    if (closeResult?.status === 'failed') throw new Error('Account view cleanup was incomplete.');
  });
  const closedAccountViews = accountViewReclamation.plannedIds;
  if (accountViewReclamation.failedIds.length > 0) {
    console.warn('[memory-reclaim] Some account views could not be fully removed:', accountViewReclamation.failedIds.length);
  }
  const arenaClosed = workspaceApp !== 'ai-lab' || locked;
  if (arenaClosed) clearArenaBrowserBindings();
  const forgeClosed = workspaceApp !== 'instruction-forge' || locked;
  if (forgeClosed) closeAllForgeBrowserViews({ clearSelection: false });
  else pruneForgeBrowserViews(forgeBrowserAccountId);
  iconRuntime.clearLocalIconCache();
  iconRuntime.releaseRemoteCacheMemory();
  try { if (typeof global.gc === 'function') global.gc(); } catch { /* optional runtime */ }
  await new Promise((resolve) => setImmediate(resolve));
  const after = getMemorySnapshot();
  return {
    ok: accountViewReclamation.failedIds.length === 0,
    ...(accountViewReclamation.failedIds.length > 0 ? { error: 'Some account views could not be fully removed.' } : {}),
    closedAccountViews,
    failedAccountViewCount: accountViewReclamation.failedIds.length,
    arenaClosed,
    forgeClosed,
    before: summarizeMemoryForDiagnostics(before),
    after: summarizeMemoryForDiagnostics(after),
  };
}

const diagnosticsController = createDiagnosticsController({
  collectDiagnostics,
  showSaveDialog: (options) => dialog.showSaveDialog(mainWindow, options),
  writeDiagnosticsFile: (filePath, data) => writeDiagnosticsJsonAtomically(filePath, data, {
    path,
    fs,
    temporarySuffix: () => `${process.pid}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`,
  }),
  defaultFileName: () => `Mad-Station-diagnostics-${new Date().toISOString().slice(0, 10)}.json`,
});
registerDiagnosticsIpcHandlers(handle, diagnosticsController);

handle('reclaim-memory', async () => {
  try { return await reclaimUnusedMemory(); }
  catch (error) { return { ok: false, error: error?.message || 'Could not reclaim unused memory.' }; }
});

handle('get-memory-info', () => getMemorySnapshot());
handleForWorkspace('ai-lab', 'Open AI Lab to use Model Arena commands.')('arena-suspend-browsers', () => suspendArenaBrowsers());

// ----- AI Lab secure credentials -------------------------------------------
// Credential encryption and disk writes are kept behind a typed storage
// boundary. The Electron host injects OS safeStorage and filesystem adapters.
const aiLabCredentialStore = createAiLabCredentialStore({
  getFilePath: () => path.join(app.getPath('userData'), 'ai-lab-credentials.json'),
  path,
  fs,
  safeStorage: {
    isEncryptionAvailable: () => safeStorage.isEncryptionAvailable(),
    getSelectedStorageBackend: () => safeStorage.getSelectedStorageBackend?.(),
    encryptStringAsync: typeof safeStorage.encryptStringAsync === 'function'
      ? (value) => safeStorage.encryptStringAsync(value)
      : undefined,
    encryptString: (value) => safeStorage.encryptString(value),
    decryptStringAsync: typeof safeStorage.decryptStringAsync === 'function'
      ? (value) => safeStorage.decryptStringAsync(Buffer.from(value))
      : undefined,
    decryptString: (value) => safeStorage.decryptString(Buffer.from(value)),
  },
  encodeBase64: (value) => Buffer.from(value).toString('base64'),
  decodeBase64: (value) => Buffer.from(value, 'base64'),
  temporarySuffix: () => `${process.pid}-${crypto.randomBytes(6).toString('hex')}`,
});
const aiLabRuntime = createAiLabRuntime({
  credentials: aiLabCredentialStore,
  getDataPath: () => path.join(app.getPath('userData'), 'ai-lab.json'),
  path,
  fs,
  cleanId,
  isPlainObject,
  temporarySuffix: () => `${process.pid}-${crypto.randomBytes(4).toString('hex')}`,
});
handleForWorkspace('ai-lab', 'Open AI Lab to manage API models.')('set-ai-lab-api-key', (_event, payload) => aiLabRuntime.setApiKey(payload));
handleForWorkspace('ai-lab', 'Open AI Lab to manage API models.')('clear-ai-lab-api-key', (_event, modelId) => aiLabRuntime.clearApiKey(modelId));
handleForWorkspace('ai-lab', 'Open AI Lab to read its saved data.')('get-ai-lab-data', () => aiLabRuntime.getData());
handleForWorkspace('ai-lab', 'Open AI Lab to save its data.')('save-ai-lab-data', (_event, data) => aiLabRuntime.saveData(data));
handleForWorkspace('ai-lab', 'Open AI Lab to send an API model request.')('ai-lab-request', (_event, payload) => aiLabRuntime.request(payload));

const accountPromptRuntime = createAccountPromptRuntime({
  getAccount,
  getService,
  getWorkspaceApp: () => workspaceApp,
  markBorrowedAccountView: (id, borrowed) => { if (borrowed) aiLabBorrowedAccountViews.add(id); else aiLabBorrowedAccountViews.delete(id); },
  createAccountView,
  createForgeBrowserView,
  closeForgeBrowserView,
  removeAccountView,
  pushForgeBrowserState,
});
async function aiHubAccountRequest(accountId, prompt, side = '', options = {}) {
  return accountPromptRuntime.request(accountId, prompt, side, options);
}

registerVideoHubIpcHandlers(handleForWorkspace('video-hub', 'Open Video Hub to use these commands.'), {
  getState: () => ({ ok: true, ...videoHubStateForRenderer() }),
  getNetworkMode: () => ({ ok: true, mode: getVideoHubNetworkMode() }),
  setNetworkMode: (mode) => setVideoHubNetworkMode(mode),
  addProvider: (payload) => videoHubAddProvider(payload),
  deleteProvider: (id) => videoHubDeleteProvider(id),
  addAccount: (payload) => videoHubAddAccount(payload),
  renameAccount: (id, name) => videoHubRenameAccount(id, name),
  deleteAccount: (id) => videoHubDeleteAccount(id),
  resetLogin: (id) => videoHubResetLogin(id),
  setActiveAccount: (id) => setVideoHubActiveAccount(id),
  setLayout: (payload) => setVideoHubBrowserLayout(payload),
  setSettingsOverlay: (open) => setVideoHubSettingsOverlayOpen(open),
  setNotificationOverlay: (open) => setVideoHubNotificationOverlayOpen(open),
  navigate: (action) => videoHubNavigate(action),
  openInBrowser: () => videoHubOpenInBrowser(),
  suspendBrowsers: () => suspendVideoHubBrowsers(true),
});
handleForWorkspace('image-hub', 'Open Image Hub to use its browser.')('image-hub-browser-open', (_event, payload) => imageHubBrowserRuntime.openBrowser(payload));
handleForWorkspace('image-hub', 'Open Image Hub to position its browser.')('image-hub-browser-set-layout', (_event, payload) => setImageHubBrowserLayout(payload));
handleForWorkspace('image-hub', 'Open Image Hub to navigate its browser.')('image-hub-browser-navigate', (_event, action) => imageHubBrowserNavigate(action));
handleForWorkspace('image-hub', 'Open Image Hub to suspend its browser.')('image-hub-browser-suspend', () => suspendImageHubBrowsers(true));
handle('ai-hub-account-request', (_event, payload) => aiHubAccountRequest(payload?.accountId, payload?.prompt, payload?.side));
handleForWorkspace('ai-lab', 'Open AI Lab to use Model Arena commands.')('arena-get-state', () => ({ ok: true, ...arenaStateForRenderer() }));
handleForWorkspace('ai-lab', 'Open AI Lab to use Model Arena commands.')('arena-add-provider', (_event, payload) => arenaAddProvider(payload || {}));
handleForWorkspace('ai-lab', 'Open AI Lab to use Model Arena commands.')('arena-delete-provider', (_event, id) => arenaDeleteProvider(id));
handleForWorkspace('ai-lab', 'Open AI Lab to use Model Arena commands.')('arena-add-account', (_event, payload) => arenaAddAccount(payload || {}));
handleForWorkspace('ai-lab', 'Open AI Lab to use Model Arena commands.')('arena-rename-account', (_event, id, name) => arenaRenameAccount(id, name));
handleForWorkspace('ai-lab', 'Open AI Lab to use Model Arena commands.')('arena-delete-account', (_event, id) => arenaDeleteAccount(id));
handleForWorkspace('ai-lab', 'Open AI Lab to use Model Arena commands.')('arena-reset-login', (_event, id) => arenaResetLogin(id));
handleForWorkspace('ai-lab', 'Open AI Lab to use Model Arena commands.')('arena-set-browsers', (_event, payload) => setArenaBrowserModels(payload || {}));
handleForWorkspace('ai-lab', 'Open AI Lab to use Model Arena commands.')('arena-set-layout', (_event, payload) => setArenaBrowserLayout(payload || {}));
handleForWorkspace('ai-lab', 'Open AI Lab to use Model Arena commands.')('arena-refresh', () => refreshArenaBrowsers());
handleForWorkspace('ai-lab', 'Open AI Lab to use Model Arena commands.')('arena-navigate', (_event, payload) => navigateArenaBrowser(payload?.side, payload?.action));
handleForWorkspace('ai-lab', 'Open AI Lab to use Model Arena commands.')('arena-open-in-browser', async (_event, side) => {
  if (!['left', 'right'].includes(side)) return { ok: false, error: 'Invalid Arena browser side.' };
  const id = arenaBrowserModels[side];
  const view = id ? arenaContentViews.get(id) : null;
  const url = view && !view.webContents.isDestroyed() ? view.webContents.getURL() : '';
  if (!url || url === 'about:blank') return { ok: false, error: 'No page is ready to open yet.' };
  return await openExternalSafe(externalUrlForPage(url)) ? { ok: true } : { ok: false, error: 'Could not open this page in your default browser.' };
});
handleForWorkspace('ai-lab', 'Open AI Lab to use Model Arena commands.')('arena-send-prompt', (_event, payload) => arenaSendPrompt(payload?.prompt));
handleForWorkspace('instruction-forge', 'Open Instruction Forge to use these commands.')('forge-set-browser', (_event, id) => setForgeBrowserAccount(id));
handleForWorkspace('instruction-forge', 'Open Instruction Forge to use these commands.')('forge-set-layout', (_event, payload) => setForgeBrowserLayout(payload || {}));
handleForWorkspace('instruction-forge', 'Open Instruction Forge to use these commands.')('forge-refresh', () => navigateForgeBrowser('refresh'));
handleForWorkspace('instruction-forge', 'Open Instruction Forge to use these commands.')('forge-navigate', (_event, action) => navigateForgeBrowser(action));
handleForWorkspace('instruction-forge', 'Open Instruction Forge to use these commands.')('forge-open-in-browser', async () => {
  const view = forgeBrowserAccountId ? forgeContentViews.get(forgeBrowserAccountId) : null;
  const url = view && !view.webContents.isDestroyed() ? view.webContents.getURL() : '';
  if (!url || url === 'about:blank') return { ok: false, error: 'No page is ready to open yet.' };
  return await openExternalSafe(externalUrlForPage(url)) ? { ok: true } : { ok: false, error: 'Could not open this page in your default browser.' };
});
handleForWorkspace('instruction-forge', 'Open Instruction Forge to use these commands.')('forge-suspend-browsers', () => suspendForgeBrowsers());
handle('instruction-forge-account-request', (_event, payload) => aiHubAccountRequest(payload?.accountId, payload?.prompt, '', { workspace: 'instruction-forge' }));
handleForWorkspaces(['ai-lab', 'instruction-forge'], 'Open AI Lab or Instruction Forge to access account model snapshots.')('get-ai-hub-ai-models', () => ({
  ok: true,
  models: config.accounts.map((account) => {
    const service = config.services.find((s) => s.id === account.serviceId);
    return {
      id: `aihub:${account.id}`,
      accountId: account.id,
      name: `${account.name} · ${service?.name || 'AI Hub'}`,
      provider: 'ai-hub-account',
      model: service?.name || account.name,
      endpoint: account.url,
      accountName: account.name,
      providerName: service?.name || 'AI Hub',
      session: true,
    };
  }),
}));

handleForWorkspace('ai-lab', 'Open AI Lab to scan local models.')('scan-local-models', () => aiLabRuntime.scanLocalModels());

// ----- Security page actions -----

handle('clear-cache-now', async () => {
  await Promise.allSettled(config.accounts.map((account) => clearAccountCaches(account)));
  return { ok: true };
});

handle('restart-app', () => {
  app.relaunch();
  app.quit();
  return { ok: true };
});

// Lock-related IPC commands share the same sender authorization/lock checks as all
// other privileged commands via `handle`; the typed module owns command transitions.
registerLockIpcHandlers(handle, lockController);

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

function startLockWatchers() {
  startLockWatchersRuntime({
    scheduleRepeating: (callback, intervalMs) => { setInterval(callback, intervalMs); },
    onPowerEvent: (event, callback) => powerMonitor.on(event, callback),
    isLocked: () => locked,
    hasPassword,
    getSecurity: security,
    getSystemIdleTimeSeconds: () => powerMonitor.getSystemIdleTime(),
    lockApp: () => lockApp(),
  });
}

function sanitizeManagedBackgroundSettings() {
  if (!config?.settings || !Array.isArray(config.settings.customBackgrounds)) return false;
  const current = config.settings.customBackgrounds;
  const safe = current.filter((item) => item?.type !== 'local' || backgroundFilesController.isManagedFileUrl(item.url));
  if (safe.length === current.length) return false;
  config.settings = normalizeAppSettings({ ...config.settings, customBackgrounds: safe });
  saveConfig(config);
  return true;
}

// App bootstrap owns event ordering; native work and mutable state remain injected from this composition root.
registerAppBootstrapRuntime({
  app,
  platform: process.platform,
  loadConfiguration: () => { config = loadConfig(); sanitizeManagedBackgroundSettings(); },
  cleanupRetiredRuntimeData: () => {
    // Remove the retired local speech runtime data from older Mad Station versions.
    try { fs.rmSync(path.join(app.getPath('userData'), 'voice-engine'), { recursive: true, force: true }); } catch { /* best effort migration cleanup */ }
    // A restart notice applies to the process that performed the import. If this process
    // has started, the previous theme import's restart has now taken effect.
    clearThemeImportRestartStatus(app.getPath('userData'));
  },
  disableApplicationMenu: () => {
    // Mad Station has its own in-app controls; hide Electron's default File/Edit/View/Window menu.
    const { Menu } = require('electron');
    Menu.setApplicationMenu(null);
  },
  initializeSecurityState: () => {
    diskCacheDisabledAtLaunch = Boolean(security().disableDiskCache);
    locked = hasPassword() && Boolean(security().lockOnLaunch);
  },
  configureDefaultSessionSecurity: () => {
    // The app renderer never captures device media; account sessions apply their own permission policy.
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    try { session.defaultSession.setSpellCheckerEnabled(security().spellcheck); } catch { /* ignore */ }
  },
  writeStartupDiagnostic,
  createMainWindow,
  applyLiveAppSettings,
  startLockWatchers,
  warmRemoteIconsAndPush,
  getMainWindow: () => mainWindow,
  quit: () => app.quit(),
  onStartupError: (error) => showFatalStartupError('Mad Station could not start', error),
});

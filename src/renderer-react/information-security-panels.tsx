import { createRoot, type Root } from 'react-dom/client';
import { useEffect, useRef, useState, type DragEvent, type FormEvent, type ReactElement } from 'react';

type SecurityKey =
  | 'clearCacheOnExit' | 'signOutOnExit' | 'disableDiskCache' | 'contentProtection' | 'spellcheck' | 'blockDevTools'
  | 'blockPopups' | 'restrictNavigation' | 'allowLoginProviders' | 'blockHttp' | 'allowCamera' | 'allowMicrophone' | 'allowNotifications' | 'allowFullscreen';
type SecuritySnapshot = { security?: Record<string, unknown> };
type AboutSnapshot = { version?: string; providers?: number; accounts?: number };
type DeveloperAuthStatus = { ok?: boolean; error?: string; unlocked?: boolean; keepUnlockedForSession?: boolean; mustChangePassword?: boolean; lockoutMessage?: string };
type ThemeExportResult = { ok?: boolean; canceled?: boolean; error?: string; path?: string; themeCount?: number; fileCount?: number };
type ThemeExportOption = { id: string; title: string; filename: string; description: string; fingerprint: string; dependencyCount: number; missingDependencies: string[]; modifiedAtMs: number; scanStatus?: 'new' | 'changed' | 'current' };
type ThemeCatalogItem = { mode?: unknown; title?: unknown; description?: unknown; kind?: unknown };
type ThemeManagementCatalog = { customThemes?: ThemeCatalogItem[]; missingThemes?: ThemeCatalogItem[] };
type ThemeExportScanResult = { ok?: boolean; error?: string; themes?: ThemeExportOption[]; catalog?: ThemeManagementCatalog; scannedAt?: string };
type ThemeExportSavedState = { fingerprints: Record<string, string>; selectedIds: string[]; titles?: Record<string, string> };
type ThemeImportOption = { id: string; title: string; description: string; filename: string; status: 'new' | 'changed' | 'current'; defaultAction: 'add'; };
type ThemeImportScan = { ok?: boolean; canceled?: boolean; error?: string; scanId?: string; packageTitle?: string; manifestPresent?: boolean; instructionsPresent?: boolean; instructionsFile?: string | null; warnings?: string[]; themes?: ThemeImportOption[]; fileCount?: number };
type ThemeImportChoiceUi = { action: 'add' };
type ThemeImportRestartStatus = { required: boolean; importedAt: string | null; themeCount: number; themes: string[] };
type ThemeImportResult = { ok?: boolean; canceled?: boolean; error?: string; installed?: Array<{ mode: string; title: string; kind: 'custom'; status: string }>; catalog?: unknown; backupCount?: number; restartRequired?: boolean; restartStatus?: ThemeImportRestartStatus };
type DeveloperAction = { type: 'show-location'; path: string } | { type: 'copy-prompt'; key: string } | { type: 'scan-theme-pack' } | { type: 'export-theme-pack'; themeIds: string[] } | { type: 'scan-theme-import'; zipFile?: File } | { type: 'import-theme-pack'; scanId: string; choices: Array<{ id: string; action: 'add' }> } | { type: 'remove-imported-theme'; mode: string };
const THEME_EXPORT_STATE_KEY = 'madstation.theme-design-exporter.scan.v1';
function readThemeExportSavedState(): ThemeExportSavedState | null {
  try {
    const raw = localStorage.getItem(THEME_EXPORT_STATE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const fingerprints = value.fingerprints && typeof value.fingerprints === 'object' && !Array.isArray(value.fingerprints) ? value.fingerprints : {};
    const selectedIds = Array.isArray(value.selectedIds) && value.selectedIds.every((id: unknown) => typeof id === 'string') ? value.selectedIds : [];
    const titles = value.titles && typeof value.titles === 'object' && !Array.isArray(value.titles)
      ? Object.fromEntries(Object.entries(value.titles).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
      : {};
    return { fingerprints, selectedIds, titles };
  } catch { return null; }
}
function writeThemeExportSavedState(value: ThemeExportSavedState): void {
  try { localStorage.setItem(THEME_EXPORT_STATE_KEY, JSON.stringify(value)); } catch { /* storage can be disabled; the scanner still works for this session */ }
}

function humanizeThemeId(id: string): string {
  return id.replace(/^home-/, '').replace(/^custom-/, '').replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) || 'Unknown theme';
}



function emit<T>(name: string, detail: T): void { window.dispatchEvent(new CustomEvent(name, { detail })); }

type DeveloperDebugSettings = {
  enabled: boolean;
  outlines: boolean;
  containers: boolean;
  grid: boolean;
  labels: boolean;
  overflow: boolean;
  hud: boolean;
  hoverInspector: boolean;
  hitTest: boolean;
  boxModel: boolean;
  focusable: boolean;
  clickTrace: boolean;
  pauseAnimations: boolean;
  hiddenAudit: boolean;
};
const DEVELOPER_DEBUG_STORAGE_KEY = 'madstation.developer-debug.v1';
const DEVELOPER_DEBUG_DEFAULTS: DeveloperDebugSettings = {
  enabled: false,
  outlines: true,
  containers: false,
  grid: false,
  labels: false,
  overflow: true,
  hud: true,
  hoverInspector: false,
  hitTest: true,
  boxModel: false,
  focusable: false,
  clickTrace: false,
  pauseAnimations: false,
  hiddenAudit: true,
};
function readDeveloperDebugSettings(): DeveloperDebugSettings {
  try {
    const raw = localStorage.getItem(DEVELOPER_DEBUG_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    const value = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    const result = { ...DEVELOPER_DEBUG_DEFAULTS };
    for (const key of Object.keys(result) as Array<keyof DeveloperDebugSettings>) {
      if (typeof value[key] === 'boolean') result[key] = value[key] as boolean;
    }
    return result;
  } catch { return { ...DEVELOPER_DEBUG_DEFAULTS }; }
}
function saveDeveloperDebugSettings(settings: DeveloperDebugSettings): void {
  try { localStorage.setItem(DEVELOPER_DEBUG_STORAGE_KEY, JSON.stringify(settings)); } catch { /* Runtime event still applies for this session. */ }
  window.dispatchEvent(new CustomEvent('madstation:developer-debug-settings', { detail: { settings } }));
}

let developerAuthRequestSequence = 0;
function requestDeveloperSettingsAction(type: 'status' | 'unlock' | 'lock' | 'close-section' | 'keep-unlocked' | 'change-password' | 'restart-status' | 'restart-app', payload?: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const requestId = `developer-auth-${Date.now()}-${++developerAuthRequestSequence}`;
    const cleanup = () => {
      window.removeEventListener('madstation:developer-settings-result', receive);
      window.clearTimeout(timeout);
    };
    const receive = (event: Event) => {
      const detail = (event as CustomEvent<{ requestId?: string; result?: unknown }>).detail;
      if (!detail || detail.requestId !== requestId) return;
      cleanup();
      resolve(detail.result);
    };
    window.addEventListener('madstation:developer-settings-result', receive);
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error('The Developer Options host bridge did not respond.'));
    }, 15000);
    emit('madstation:developer-settings-action', { type, payload, requestId });
  });
}
function useHostSnapshot<T>(snapshotEvent: string, mountedEvent: string, initial: T): T {
  const [snapshot, setSnapshot] = useState<T>(initial);
  useEffect(() => {
    const receive = (event: Event) => setSnapshot((event as CustomEvent<T>).detail);
    window.addEventListener(snapshotEvent, receive);
    window.dispatchEvent(new Event(mountedEvent));
    return () => window.removeEventListener(snapshotEvent, receive);
  }, [snapshotEvent, mountedEvent]);
  useEffect(() => { window.dispatchEvent(new Event('madstation:global-settings-panels-rendered')); }, [snapshot]);
  return snapshot;
}

const PRIVACY_SETTINGS: ReadonlyArray<{ key: SecurityKey; title: string; description: string; query: string }> = [
  { key: 'clearCacheOnExit', title: 'Clear cache on exit', description: 'Deletes cached pages and scripts for every account. You stay logged in.', query: 'Clear cache on exit Deletes cached pages and scripts for every account. You stay logged in.' },
  { key: 'signOutOnExit', title: 'Sign out of all accounts on exit', description: 'Private mode: deletes cookies and site data when Mad Station closes.', query: 'Sign out of all accounts on exit Private mode deletes cookies and site data when Mad Station closes.' },
  { key: 'disableDiskCache', title: 'No disk cache (restart needed)', description: 'Websites cannot cache pages on disk. Pages may load slower.', query: 'No disk cache restart needed Websites cannot cache pages on disk. Pages may load slower.' },
  { key: 'contentProtection', title: 'Hide from screenshots & screen sharing', description: 'The window appears black in recordings and screen shares.', query: 'Hide from screenshots and screen sharing The window appears black in recordings and screen shares.' },
  { key: 'spellcheck', title: 'Spell check', description: 'When off, no spell-check dictionaries are downloaded.', query: 'Spell check When off no spell-check dictionaries are downloaded.' },
  { key: 'blockDevTools', title: 'Block developer tools', description: 'Closes the developer tools window anywhere in Mad Station.', query: 'Block developer tools Closes the developer tools window anywhere in Mad Station.' },
];
const WEBSITE_PROTECTION: ReadonlyArray<{ key: SecurityKey; title: string; description: string; query: string }> = [
  { key: 'blockPopups', title: 'Block unknown popups', description: 'Open them in your default browser instead.', query: 'Block unknown popups Open them in your default browser instead.' },
  { key: 'restrictNavigation', title: 'Keep each account on its own website', description: 'Links that leave the site open in your default browser.', query: 'Keep each account on its own website Links that leave the site open in your default browser.' },
  { key: 'allowLoginProviders', title: 'Allow common sign-in pages', description: 'Google, Microsoft, Apple and GitHub can open inside Mad Station.', query: 'Allow common sign-in pages Google Microsoft Apple and GitHub can open inside Mad Station.' },
  { key: 'blockHttp', title: 'Block insecure (HTTP) pages', description: 'Refuse to load anything that is not HTTPS.', query: 'Block insecure HTTP pages Refuse to load anything that is not HTTPS.' },
];
const WEBSITE_PERMISSIONS: ReadonlyArray<{ key: SecurityKey; title: string; description: string; query: string }> = [
  { key: 'allowCamera', title: 'Camera', description: 'For video features.', query: 'Camera For video features.' },
  { key: 'allowMicrophone', title: 'Microphone', description: 'Allow websites to request audio input for voice chat, dictation, and speech features. Off by default.', query: 'Microphone Voice input dictation and audio features.' },
  { key: 'allowNotifications', title: 'Notifications', description: 'Desktop notifications from websites.', query: 'Notifications Desktop notifications from websites.' },
  { key: 'allowFullscreen', title: 'Fullscreen', description: 'Let websites go fullscreen.', query: 'Fullscreen Let websites go fullscreen.' },
];

function SecurityToggle({ item, security }: { item: (typeof PRIVACY_SETTINGS)[number]; security: Record<string, unknown> }) {
  return <label className="row toggle" data-q={item.query} key={item.key}><span className="row-copy"><strong>{item.title}</strong><span>{item.description}</span></span><span className="switch"><input type="checkbox" data-sec={item.key} checked={Boolean(security[item.key])} onChange={(event) => emit('madstation:ai-hub-security-panels-action', { type: 'setting', key: item.key, value: event.currentTarget.checked })}/><span className="knob"/></span></label>;
}
function PrivacyPanel() {
  const snapshot = useHostSnapshot<SecuritySnapshot>('madstation:ai-hub-security-panels', 'madstation:ai-hub-security-panels-mounted', {});
  const security = snapshot.security || {};
  const [clearing, setClearing] = useState(false);
  const [clearStatus, setClearStatus] = useState('');
  useEffect(() => {
    const receive = (event: Event) => {
      const detail = (event as CustomEvent<{ type?: string; ok?: boolean }>).detail;
      if (detail?.type === 'clear-cache-now') { setClearing(false); setClearStatus(detail.ok ? 'Cache cleared.' : 'Could not clear cache.'); }
    };
    window.addEventListener('madstation:ai-hub-security-panel-result', receive);
    return () => window.removeEventListener('madstation:ai-hub-security-panel-result', receive);
  }, []);
  return <><div className="panel-head"><div><h2 className="ms-title">Privacy</h2><p>Control saved website data and what Mad Station exposes on this computer.</p></div></div><div className="bento"><div className="group-label">Saved data</div>
    <section className="card ms-card ms-card--flat privacy-cache-card"><header className="card-head ms-card-head"><span className="card-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3l8 3v6c0 4.5-3.2 7.6-8 9-4.8-1.4-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/></svg></span><div><h3>Cache &amp; saved data</h3><p>Logins stay saved unless you turn on “Sign out on exit”.</p></div></header><div className="card-body">{PRIVACY_SETTINGS.slice(0, 3).map((item) => <SecurityToggle item={item} security={security} key={item.key} />)}
      <div className="row" data-q="Clear cache now"><span className="row-copy"><strong>Clear cache now</strong><span>Deletes cached data for all accounts. Logins are kept.</span></span><button className="ms-btn" id="clearCacheNowBtn" type="button" disabled={clearing} onClick={() => { setClearing(true); setClearStatus(''); emit('madstation:ai-hub-security-panels-action', { type: 'clear-cache-now' }); }}>{clearing ? 'Clearing…' : 'Clear cache'}</button></div>
      {clearStatus && <p className={`ms-muted${clearStatus === 'Cache cleared.' ? '' : ' form-error' }`} role="status">{clearStatus}</p>}
    </div></section>
    <section className="card ms-card ms-card--flat privacy-settings-card"><header className="card-head ms-card-head"><span className="card-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3l8 3v6c0 4.5-3.2 7.6-8 9-4.8-1.4-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/></svg></span><div><h3>Privacy</h3><p>What Mad Station exposes.</p></div></header><div className="card-body">{PRIVACY_SETTINGS.slice(3).map((item) => <SecurityToggle item={item} security={security} key={item.key} />)}</div></section>
  </div></>;
}
function WebsitesPanel() {
  const snapshot = useHostSnapshot<SecuritySnapshot>('madstation:ai-hub-security-panels', 'madstation:ai-hub-security-panels-mounted', {});
  const security = snapshot.security || {};
  return <><div className="panel-head"><div><h2 className="ms-title">Websites &amp; permissions</h2><p>If a website’s login stops working after a change here, switch the matching option off.</p></div></div><div className="bento">
    <section className="card ms-card ms-card--flat"><header className="card-head ms-card-head"><span className="card-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg></span><div><h3>Web protection</h3><p>How links and popups are handled.</p></div></header><div className="card-body">{WEBSITE_PROTECTION.map((item) => <SecurityToggle item={item} security={security} key={item.key} />)}</div></section>
    <section className="card ms-card ms-card--flat"><header className="card-head ms-card-head"><span className="card-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3l8 3v6c0 4.5-3.2 7.6-8 9-4.8-1.4-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/></svg></span><div><h3>Website permissions</h3><p>Only on each account’s own site. Location, USB, screen capture, and other unlisted access are always blocked.</p></div></header><div className="card-body">{WEBSITE_PERMISSIONS.map((item) => <SecurityToggle item={item} security={security} key={item.key} />)}</div></section>
  </div></>;
}

function AboutPanel() {
  const snapshot = useHostSnapshot<AboutSnapshot>('madstation:about-panel-controls', 'madstation:about-panel-controls-mounted', {});
  const version = snapshot.version || '1.6.3';
  const providers = Number.isFinite(snapshot.providers) ? snapshot.providers! : 0;
  const accounts = Number.isFinite(snapshot.accounts) ? snapshot.accounts! : 0;
  return <><div className="about-hero"><div className="about-logo big"><img alt="Mad Station" src="../assets/mad-station-icon-1024.png"/></div><div><h2>Mad Station</h2><p>Your personal multi-account AI workspace.</p></div><span className="version-pill ms-chip">v<span>{version}</span> · Stable release</span></div><div className="panel-head about-intro"><div><h2>About Mad Station</h2><p>Your personal multi-account AI workspace.</p></div></div><div className="bento"><section className="card ms-card ms-card--flat span-2 no-search"><div className="info-grid"><div><span>Providers</span><strong>{providers}</strong></div><div><span>Accounts</span><strong>{accounts}</strong></div><div><span>Session model</span><strong>Isolated, persistent</strong></div></div></section><section className="card ms-card ms-card--flat span-2 no-search note"><p>Mad Station shows official AI websites in separate browser sessions. It does not merge subscriptions, credits, quotas or accounts. Always on and not optional: one running instance, websites can’t reach the app’s own interface, every site is sandboxed with its own session, and settings are saved safely so a crash can’t wipe your accounts.</p></section></div></>;
}

const DEVELOPER_CONTENT = {
  "cards": [
    {
      "title": "Project files & commands",
      "description": "Project overview and the commands used to test and package Mad Station.",
      "rows": [
        {
          "title": "Build and test commands",
          "description": "Run npm test before handoff and npm run dist to build the Windows installer.",
          "path": "package.json",
          "query": "release tests package scripts version audit"
        },
        {
          "title": "Project overview (README)",
          "description": "Start here for project setup, architecture notes, and development workflow.",
          "path": "README.md",
          "query": "README project overview setup scripts developer documentation"
        }
      ]
    },
    {
      "title": "Workspace App Builder",
      "description": "How new built-in apps should be structured, registered, tested, and maintained in Mad Station.",
      "rows": [
        {
          "title": "Core System — start here",
          "description": "One routing map for agent tasks, home systems, recipes, and required tests.",
          "path": "docs/architecture/CORE_SYSTEM.md",
          "query": ""
        },
        {
          "title": "Build a workspace app",
          "description": "Inspect an existing app first, then follow the registry, navigation, lifecycle, cleanup, persistence, and security patterns. Use the AI prompt recipe below to guide implementation.",
          "path": "src/home-app-list.js",
          "query": ""
        },
        {
          "title": "App registration",
          "description": "Start at docs/architecture/CORE_SYSTEM.md and follow the workspace-app route for view, registry, navigation, and lifecycle changes.",
          "path": "src/home-app-list.js",
          "query": "app builder create register new workspace app launcher registry"
        }
      ]
    },
    {
      "title": "Design System",
      "description": "docs/architecture/CORE_SYSTEM.md routes design work to the relevant visual recipe, tokens, components, and preview.",
      "rows": [
        {
          "title": "AI / contributor instructions",
          "description": "Keep coding assistants aligned with tokens, stable DOM IDs, migration rules, and required tests.",
          "path": "AGENTS.md",
          "query": "AI coding agent instructions AGENTS CLAUDE code rules"
        },
        {
          "title": "Design System",
          "description": "Shared rules, design tokens, component usage, accessibility, and migration recipes.",
          "path": "docs/design/DESIGN_SYSTEM.md",
          "query": "design system guide standards design tokens page migration"
        },
        {
          "title": "Shared Styles",
          "description": "Shared application styles and page styling in src/styles.css , src/home.css , and src/pages.css .",
          "path": "src/styles.css",
          "query": "shared styles stylesheet styles pages home"
        },
        {
          "title": "Toolkit and Components",
          "description": "Reusable .ms-* interface components and shared component styles.",
          "path": "src/design-kit.css",
          "query": "toolkit components reusable UI design kit"
        },
        {
          "title": "Live Designs",
          "description": "Theme and appearance tokens that drive the app’s live visual system.",
          "path": "src/design-tokens.css",
          "query": "live designs design tokens theme appearance values"
        },
        {
          "title": "Live Design Kit Preview",
          "description": "Open the preview page to inspect shared components and appearance combinations.",
          "path": "docs/design-kit-preview.html",
          "query": "live design kit preview demo theme component preview"
        }
      ]
    }
  ],
  "groups": [
    {
      "title": "Project & File Commands Recipes",
      "subtitle": "Existing recipes retained (5) and new recipes added (3).",
      "rows": [
        {
          "title": "Project orientation and file map",
          "description": "Understand the architecture and identify the correct files before making changes.",
          "key": "project-orientation"
        },
        {
          "title": "Refactor or fix an existing feature",
          "description": "Diagnose the issue and make the smallest maintainable change.",
          "key": "refactor"
        },
        {
          "title": "Build, test, and diagnose",
          "description": "Run the right checks and use evidence to isolate failures.",
          "key": "build-test-diagnose"
        },
        {
          "title": "Release and shipping review",
          "description": "Review release readiness without overstating verification.",
          "key": "release"
        },
        {
          "title": "Update project documentation",
          "description": "Keep project instructions aligned with actual implementation.",
          "key": "update-docs"
        },
        {
          "title": "Trace a feature across files",
          "description": "Map dependencies and execution flow before editing.",
          "key": "trace-feature"
        },
        {
          "title": "Make a safe targeted file change",
          "description": "Preserve existing behavior and security boundaries.",
          "key": "safe-file-change"
        },
        {
          "title": "Security and privacy review",
          "description": "Review IPC, permissions, file access, and data handling.",
          "key": "security-privacy-review"
        }
      ]
    },
    {
      "title": "Workspace App Builder Recipes",
      "subtitle": "Existing recipes retained (4) and new recipes added (3).",
      "rows": [
        {
          "title": "Build a workspace app",
          "description": "Create a built-in app wired through the complete workspace lifecycle.",
          "key": "app-builder"
        },
        {
          "title": "Register an existing workspace app",
          "description": "Wire an existing screen into the launcher and routing without duplicating it.",
          "key": "register-app"
        },
        {
          "title": "Add app state and settings safely",
          "description": "Follow established state, persistence, and settings patterns.",
          "key": "app-state-settings"
        },
        {
          "title": "Debug workspace app navigation",
          "description": "Trace app IDs, screen visibility, and launcher return behavior.",
          "key": "debug-navigation"
        },
        {
          "title": "Add safe import and export",
          "description": "Validate file formats and handle malformed or incompatible data.",
          "key": "safe-import-export"
        },
        {
          "title": "Improve app states and recovery",
          "description": "Cover loading, empty, success, and error states.",
          "key": "app-states-recovery"
        },
        {
          "title": "Audit app lifecycle and cleanup",
          "description": "Check navigation, repeated launches, listeners, and resource cleanup.",
          "key": "app-lifecycle-cleanup"
        }
      ]
    },
    {
      "title": "Design System Recipes",
      "subtitle": "Existing recipes retained (5) and new recipes added (3).",
      "rows": [
        {
          "title": "Migrate an existing page",
          "description": "Move a page to shared tokens and components while preserving behavior.",
          "key": "design-migration"
        },
        {
          "title": "Create a new page",
          "description": "Build a consistent screen with responsive layout and accessible controls.",
          "key": "design-page"
        },
        {
          "title": "Audit shared styles and tokens",
          "description": "Find raw values, duplicated rules, and token mapping drift.",
          "key": "audit-shared-styles"
        },
        {
          "title": "Create or improve a shared component",
          "description": "Add a reusable, token-driven .ms-* pattern.",
          "key": "shared-component"
        },
        {
          "title": "Verify visual variants with the live preview",
          "description": "Check the actual stylesheet stack across Appearance combinations.",
          "key": "verify-visual-variants"
        },
        {
          "title": "Responsive layout audit",
          "description": "Check narrow, medium, and wide layouts for overflow and usability.",
          "key": "responsive-audit"
        },
        {
          "title": "Add or repair an Appearance option",
          "description": "Keep settings, tokens, defaults, and preview behavior aligned.",
          "key": "appearance-option"
        },
        {
          "title": "Accessibility and interaction audit",
          "description": "Review keyboard flow, focus, contrast, semantics, and reduced motion.",
          "key": "accessibility-audit"
        }
      ]
    }
  ],
  "guardrails": [
    {
      "title": "Use design tokens",
      "description": "Do not hard-code colors, radii, shadows, or button appearance. Use existing tokens and documented .ms-* classes."
    },
    {
      "title": "Preserve behavior hooks",
      "description": "Keep existing element IDs and data-* attributes unless the related JavaScript and tests are updated together."
    },
    {
      "title": "Verify before handoff",
      "description": "Run npm test ; inspect light and dark themes and at least one glass/neon and one sharp/square appearance."
    },
    {
      "title": "File access",
      "description": "Buttons open allowlisted project documents in your system’s default editor. In an installed build, bundled developer documents are opened from the app’s developer-docs resources folder."
    }
  ]
} as const;
const HIDDEN_DEVELOPER_CARD_TITLES = new Set([
  'Project files & commands',
  'Workspace App Builder',
  'Design System',
  'Project & File Commands Recipes',
  'Workspace App Builder Recipes',
  'Design System Recipes',
  'AI Prompt Recipes',
  'Developer Guide Rails',
  'Developer Guard Rails',
  'Developer Guardrails',
]);

const DEVELOPER_HOME_PAGE_STORAGE_KEY = 'mad-station-homepage-version-v1';
function readDeveloperHomepageMode(): string {
  const homepageApi = (window as Window & { MadStationHomePage?: { getMode?: () => string } }).MadStationHomePage;
  try {
    const liveMode = homepageApi?.getMode?.();
    if (typeof liveMode === 'string') return liveMode;
    return localStorage.getItem(DEVELOPER_HOME_PAGE_STORAGE_KEY) || 'v2';
  } catch { return 'v2'; }
}

function DeveloperPanel() {
  const [developerTabActive, setDeveloperTabActive] = useState(false);
  const [developerAccessUnlocked, setDeveloperAccessUnlocked] = useState(false);
  const [developerKeepUnlockedForSession, setDeveloperKeepUnlockedForSession] = useState(false);
  const [developerMustChangePassword, setDeveloperMustChangePassword] = useState(false);
  const [developerUnlockPassword, setDeveloperUnlockPassword] = useState('');
  const [developerAuthBusy, setDeveloperAuthBusy] = useState(false);
  const [developerAuthError, setDeveloperAuthError] = useState('');
  const [developerPasswordCurrent, setDeveloperPasswordCurrent] = useState('');
  const [developerPasswordNext, setDeveloperPasswordNext] = useState('');
  const [developerPasswordConfirm, setDeveloperPasswordConfirm] = useState('');
  const [developerPasswordStatus, setDeveloperPasswordStatus] = useState('');
  const [developerPasswordError, setDeveloperPasswordError] = useState('');
  const [developerDebugSettings, setDeveloperDebugSettings] = useState<DeveloperDebugSettings>(() => readDeveloperDebugSettings());
  const [activeHomepageMode, setActiveHomepageMode] = useState<string>(() => readDeveloperHomepageMode());
  const [themeOptions, setThemeOptions] = useState<ThemeExportOption[]>([]);
  const [themeManagementCatalog, setThemeManagementCatalog] = useState<ThemeManagementCatalog>({ customThemes: [], missingThemes: [] });
  const [removedThemesSinceScan, setRemovedThemesSinceScan] = useState<Array<{ id: string; title: string }>>([]);
  const [themeManageSearch, setThemeManageSearch] = useState('');
  const [removingManagedTheme, setRemovingManagedTheme] = useState<string | null>(null);
  const [themeManageStatus, setThemeManageStatus] = useState('');
  const [selectedThemes, setSelectedThemes] = useState<string[]>([]);
  const [scanningThemes, setScanningThemes] = useState(true);
  const [exportingThemes, setExportingThemes] = useState(false);
  const [themeExportStatus, setThemeExportStatus] = useState('Scanning current theme files…');
  const [themeScanSummary, setThemeScanSummary] = useState('');
  const [scanningThemeImport, setScanningThemeImport] = useState(false);
  const [importingThemePack, setImportingThemePack] = useState(false);
  const [themeImportScan, setThemeImportScan] = useState<ThemeImportScan | null>(null);
  const [selectedImportThemes, setSelectedImportThemes] = useState<string[]>([]);
  const [themeImportChoices, setThemeImportChoices] = useState<Record<string, ThemeImportChoiceUi>>({});
  const [themeImportStatus, setThemeImportStatus] = useState('');
  const [themeRestartStatus, setThemeRestartStatus] = useState<ThemeImportRestartStatus | null>(null);
  const [restartingApp, setRestartingApp] = useState(false);
  const [themeZipName, setThemeZipName] = useState('');
  const [isThemeZipDragging, setIsThemeZipDragging] = useState(false);
  const [exportThemeSearch, setExportThemeSearch] = useState('');
  const selectedThemesRef = useRef<string[]>([]);
  const hasScannedRef = useRef(false);
  const exportAfterScanRef = useRef(false);
  const action = (detail: DeveloperAction) => emit('madstation:developer-panel-action', detail);
  const updateDeveloperDebugSetting = (key: keyof DeveloperDebugSettings, value: boolean) => {
    setDeveloperDebugSettings((current) => {
      const next = { ...current, [key]: value };
      saveDeveloperDebugSettings(next);
      return next;
    });
  };
  const resetDeveloperDebugSettings = () => {
    const next = { ...DEVELOPER_DEBUG_DEFAULTS };
    setDeveloperDebugSettings(next);
    saveDeveloperDebugSettings(next);
  };
  const openDeveloperInspector = () => {
    const next = { ...developerDebugSettings, enabled: true, hud: true };
    setDeveloperDebugSettings(next);
    saveDeveloperDebugSettings(next);
    emit('madstation:developer-debug-open-window', {});
  };

  const activateDeveloperDefaultHomepage = () => {
    emit('madstation:homepage-style-select', 'legacy');
    setActiveHomepageMode('legacy');
  };

  useEffect(() => {
    const syncHomepageMode = (event: Event) => {
      if (event.type === 'madstation:homepage-fallback') {
        setActiveHomepageMode(readDeveloperHomepageMode());
        return;
      }
      const mode = (event as CustomEvent<{ mode?: unknown }>).detail?.mode;
      setActiveHomepageMode(typeof mode === 'string' ? mode : readDeveloperHomepageMode());
    };
    const syncStorage = () => setActiveHomepageMode(readDeveloperHomepageMode());
    window.addEventListener('madstation:homepage-changed', syncHomepageMode);
    window.addEventListener('madstation:homepage-fallback', syncHomepageMode);
    window.addEventListener('storage', syncStorage);
    return () => {
      window.removeEventListener('madstation:homepage-changed', syncHomepageMode);
      window.removeEventListener('madstation:homepage-fallback', syncHomepageMode);
      window.removeEventListener('storage', syncStorage);
    };
  }, []);

  useEffect(() => {
    const receiveDebugSettings = (event: Event) => {
      const detail = (event as CustomEvent<{ settings?: unknown }>).detail;
      const candidate = detail && typeof detail === 'object' && detail.settings && typeof detail.settings === 'object'
        ? detail.settings as Record<string, unknown> : null;
      if (!candidate) return;
      const next = { ...DEVELOPER_DEBUG_DEFAULTS };
      for (const key of Object.keys(next) as Array<keyof DeveloperDebugSettings>) {
        if (typeof candidate[key] === 'boolean') next[key] = candidate[key] as boolean;
      }
      setDeveloperDebugSettings(next);
    };
    window.addEventListener('madstation:developer-debug-settings', receiveDebugSettings);
    return () => window.removeEventListener('madstation:developer-debug-settings', receiveDebugSettings);
  }, []);

  useEffect(() => {
    let live = true;
    const applyStatus = (raw: unknown) => {
      const result = raw && typeof raw === 'object' ? raw as DeveloperAuthStatus : {};
      if (!live) return;
      if (result.ok === false) {
        setDeveloperAuthError(result.error || 'Could not check Developer Options access.');
        setDeveloperAccessUnlocked(false);
        return;
      }
      setDeveloperAccessUnlocked(result.unlocked === true);
      setDeveloperKeepUnlockedForSession(result.keepUnlockedForSession === true);
      setDeveloperMustChangePassword(result.mustChangePassword === true);
      setDeveloperAuthError(result.lockoutMessage || '');
    };
    const openDeveloper = () => {
      setDeveloperTabActive(true);
      setDeveloperAuthError('');
      try {
        const request = requestDeveloperSettingsAction('status');
        if (request && typeof request.then === 'function') request.then(applyStatus).catch(() => {
          if (live) setDeveloperAuthError('Could not check Developer Options access. Try opening this section again.');
        });
      } catch {
        setDeveloperAuthError('Developer password protection is unavailable in this app session.');
      }
    };
    const closeDeveloper = () => {
      setDeveloperTabActive(false);
      setDeveloperUnlockPassword('');
      setDeveloperPasswordCurrent('');
      setDeveloperPasswordNext('');
      setDeveloperPasswordConfirm('');
      setDeveloperPasswordStatus('');
      setDeveloperPasswordError('');
      // Leaving Developer Settings locks by default. The optional in-memory session
      // preference keeps the main-process auth session open until app exit or manual lock.
      void requestDeveloperSettingsAction('close-section').then((raw) => {
        const result = raw && typeof raw === 'object' ? raw as DeveloperAuthStatus : {};
        setDeveloperAccessUnlocked(result.unlocked === true);
        setDeveloperKeepUnlockedForSession(result.keepUnlockedForSession === true);
      }).catch(() => {
        setDeveloperAccessUnlocked(false);
        setDeveloperKeepUnlockedForSession(false);
      });
    };
    window.addEventListener('madstation:developer-settings-opened', openDeveloper);
    window.addEventListener('madstation:developer-settings-closed', closeDeveloper);
    document.addEventListener('madstation:settings-closed', closeDeveloper);
    return () => {
      live = false;
      window.removeEventListener('madstation:developer-settings-opened', openDeveloper);
      window.removeEventListener('madstation:developer-settings-closed', closeDeveloper);
      document.removeEventListener('madstation:settings-closed', closeDeveloper);
    };
  }, []);

  useEffect(() => {
    const receiveExport = (event: Event) => {
      const result = (event as CustomEvent<ThemeExportResult>).detail || {};
      setExportingThemes(false);
      if (result.ok) setThemeExportStatus(`Exported ${result.themeCount || 0} themes into a ${result.fileCount || 0}-file ZIP using the latest source files.`);
      else if (result.canceled) setThemeExportStatus('Export cancelled. No file was written.');
      else setThemeExportStatus(result.error || 'The theme pack could not be exported.');
    };
    const receiveScan = (event: Event) => {
      const result = (event as CustomEvent<ThemeExportScanResult>).detail || {};
      setScanningThemes(false);
      if (!result.ok || !Array.isArray(result.themes)) {
        exportAfterScanRef.current = false;
        setExportingThemes(false);
        setThemeExportStatus(result.error || 'Could not scan the current theme files.');
        return;
      }
      const themes = result.themes;
      const saved = readThemeExportSavedState();
      const previous = saved?.fingerprints || {};
      const hasBaseline = Object.keys(previous).length > 0;
      const currentIds = new Set(themes.map((theme) => theme.id));
      const newIds = themes.filter((theme) => !Object.prototype.hasOwnProperty.call(previous, theme.id)).map((theme) => theme.id);
      const changedIds = themes.filter((theme) => Object.prototype.hasOwnProperty.call(previous, theme.id) && previous[theme.id] !== theme.fingerprint).map((theme) => theme.id);
      const removedIds = hasBaseline ? Object.keys(previous).filter((id) => !currentIds.has(id)) : [];
      const removedCount = removedIds.length;
      const removedThemes = removedIds.map((id) => ({ id, title: saved?.titles?.[id] || humanizeThemeId(id) }));
      setRemovedThemesSinceScan(removedThemes);
      if (result.catalog && typeof result.catalog === 'object') {
        setThemeManagementCatalog(result.catalog);
        // If a custom theme folder or source page disappeared outside the app,
        // refresh every homepage Quick Access list with the newly scanned catalog.
        if (removedCount > 0 || (result.catalog.missingThemes || []).length > 0) emit('madstation:theme-imported', result.catalog);
      }
      const statusById = new Map<string, 'new' | 'changed' | 'current'>();
      for (const theme of themes) {
        if (!hasBaseline) statusById.set(theme.id, 'current');
        else if (!Object.prototype.hasOwnProperty.call(previous, theme.id)) statusById.set(theme.id, 'new');
        else if (previous[theme.id] !== theme.fingerprint) statusById.set(theme.id, 'changed');
        else statusById.set(theme.id, 'current');
      }
      const enriched = themes.map((theme) => ({ ...theme, scanStatus: statusById.get(theme.id) || 'current' }));
      setThemeOptions(enriched);
      let nextSelection: string[];
      if (!hasScannedRef.current) {
        if (saved && Array.isArray(saved.selectedIds)) {
          nextSelection = [...new Set([...saved.selectedIds.filter((id) => currentIds.has(id)), ...newIds])];
        } else {
          nextSelection = themes.map((theme) => theme.id);
        }
      } else {
        nextSelection = [...new Set([...selectedThemesRef.current.filter((id) => currentIds.has(id)), ...newIds])];
      }
      selectedThemesRef.current = nextSelection;
      setSelectedThemes(nextSelection);
      hasScannedRef.current = true;
      writeThemeExportSavedState({
        fingerprints: Object.fromEntries(themes.map((theme) => [theme.id, theme.fingerprint])),
        selectedIds: nextSelection,
        titles: Object.fromEntries(themes.map((theme) => [theme.id, theme.title])),
      });
      const missingCount = themes.reduce((count, theme) => count + theme.missingDependencies.length, 0);
      const scanLabel = hasBaseline
        ? `Scan complete: ${themes.length} found, ${newIds.length} new, ${changedIds.length} changed, ${removedCount} removed${missingCount ? `, ${missingCount} missing local dependencies` : ''}.`
        : `Scan complete: ${themes.length} themes found${missingCount ? `; ${missingCount} local dependencies could not be found` : ''}.`;
      setThemeScanSummary(`${scanLabel} New themes are selected automatically. Changed themes export their latest source files.`);
      if (exportAfterScanRef.current) {
        exportAfterScanRef.current = false;
        if (hasBaseline && (newIds.length > 0 || removedCount > 0)) {
          setExportingThemes(false);
          setThemeExportStatus(`Fresh scan found ${newIds.length} new and ${removedCount} removed theme${newIds.length + removedCount === 1 ? '' : 's'}. Review the refreshed selections, then export again.`);
        } else if (nextSelection.length > 0) {
          setExportingThemes(true);
          setThemeExportStatus('Scan complete. Creating the ZIP from the latest selected theme files…');
          action({ type: 'export-theme-pack', themeIds: nextSelection });
        } else {
          setExportingThemes(false);
          setThemeExportStatus('No themes are selected. Select at least one theme to export.');
        }
      } else {
        setThemeExportStatus('');
      }
    };
    const receiveImportScan = (event: Event) => {
      const result = (event as CustomEvent<ThemeImportScan>).detail || {};
      setScanningThemeImport(false);
      if (result.canceled) {
        setThemeImportStatus('ZIP selection cancelled. No themes were changed.');
        return;
      }
      if (!result.ok || !Array.isArray(result.themes)) {
        setThemeImportScan(null);
        setSelectedImportThemes([]);
        setThemeImportStatus(result.error || 'Could not scan that theme ZIP.');
        return;
      }
      const themes = result.themes;
      const choices = Object.fromEntries(themes.map((theme) => [theme.id, { action: 'add' as const }]));
      setThemeImportScan(result);
      setThemeImportChoices(choices);
      setSelectedImportThemes(themes.filter((theme) => theme.status !== 'current').map((theme) => theme.id));
      const instructionState = result.instructionsPresent
        ? `Integration instructions found (${result.instructionsFile || 'THEME_INTEGRATION.md'}).`
        : 'No instruction file found; built-in safe control mappings will be used.';
      setThemeImportStatus(`Scanned ${themes.length} theme${themes.length === 1 ? '' : 's'} from “${result.packageTitle || 'theme ZIP'}”. ${instructionState}`);
    };
    const receiveImport = (event: Event) => {
      const result = (event as CustomEvent<ThemeImportResult>).detail || {};
      setImportingThemePack(false);
      if (result.ok) {
        const count = result.installed?.length || 0;
        const restartStatus = result.restartStatus || {
          required: result.restartRequired === true,
          importedAt: new Date().toISOString(),
          themeCount: count,
          themes: (result.installed || []).map((item) => item.title),
        };
        setThemeRestartStatus(restartStatus.required ? restartStatus : null);
        setThemeImportStatus(`Added ${count} custom theme${count === 1 ? '' : 's'} as separate entries. Built-in app themes were not changed. ${result.backupCount ? `${result.backupCount} previous custom version${result.backupCount === 1 ? '' : 's'} saved as rollback backups.` : 'No existing custom theme needed a backup.'} Appearance and Quick Access are refreshing now.`);
        setThemeImportScan(null);
        setSelectedImportThemes([]);
        setThemeImportChoices({});
        setScanningThemes(true);
        setThemeExportStatus('Refreshing the exporter catalogue with the newly installed themes…');
        action({ type: 'scan-theme-pack' });
      } else if (result.canceled) {
        setThemeImportStatus('Theme import cancelled. No themes were changed.');
      } else {
        setThemeImportStatus(result.error || 'Could not install those themes. The importer rolled back any partially installed files.');
      }
    };
    const receiveRemoveTheme = (event: Event) => {
      const result = (event as CustomEvent<{ ok?: boolean; error?: string; removed?: { mode?: string; title?: string; kind?: 'custom' }; catalog?: ThemeManagementCatalog }>).detail || {};
      setRemovingManagedTheme(null);
      if (!result.ok) {
        setThemeManageStatus(result.error || 'Could not update the installed theme catalogue.');
        return;
      }
      const label = result.removed?.title || result.removed?.mode || 'Theme';
      setThemeManageStatus(`Removed imported custom theme “${label}”. Built-in source themes cannot be removed or replaced.`);
      if (result.catalog) {
        setThemeManagementCatalog(result.catalog);
        emit('madstation:theme-imported', result.catalog);
      }
      setScanningThemes(true);
      setThemeExportStatus('Refreshing the theme catalogue after the change…');
      action({ type: 'scan-theme-pack' });
    };
    window.addEventListener('madstation:developer-theme-export-result', receiveExport);
    window.addEventListener('madstation:developer-theme-scan-result', receiveScan);
    window.addEventListener('madstation:developer-theme-import-scan-result', receiveImportScan);
    window.addEventListener('madstation:developer-theme-import-result', receiveImport);
    window.addEventListener('madstation:developer-theme-remove-result', receiveRemoveTheme);
    return () => {
      window.removeEventListener('madstation:developer-theme-export-result', receiveExport);
      window.removeEventListener('madstation:developer-theme-scan-result', receiveScan);
      window.removeEventListener('madstation:developer-theme-import-scan-result', receiveImportScan);
      window.removeEventListener('madstation:developer-theme-import-result', receiveImport);
      window.removeEventListener('madstation:developer-theme-remove-result', receiveRemoveTheme);
    };
  }, []);

  useEffect(() => {
    if (!developerTabActive || !developerAccessUnlocked) return;
    action({ type: 'scan-theme-pack' });
    try {
      const pendingRestart = requestDeveloperSettingsAction('restart-status');
      if (pendingRestart && typeof pendingRestart.then === 'function') {
        pendingRestart.then((raw: unknown) => {
          const result = raw && typeof raw === 'object' ? raw as { ok?: boolean; status?: ThemeImportRestartStatus } : {};
          if (result.ok && result.status && result.status.required === true) setThemeRestartStatus(result.status);
          else if (result.ok) setThemeRestartStatus(null);
        }).catch(() => { /* A missing restart notice does not prevent theme management. */ });
      }
    } catch { /* A missing restart notice does not prevent theme management. */ }
  }, [developerTabActive, developerAccessUnlocked]);

  const restartForThemeChanges = () => {
    if (restartingApp) return;
    setRestartingApp(true);
    setThemeImportStatus('Restarting Mad Station so the imported theme changes can take effect…');
    try {
      const request = requestDeveloperSettingsAction('restart-app');
      if (!request || typeof request.then !== 'function') {
        setRestartingApp(false);
        setThemeImportStatus('Restart is unavailable from this app session. Please close and reopen Mad Station.');
        return;
      }
      request.then((raw: unknown) => {
        const result = raw && typeof raw === 'object' ? raw as { ok?: boolean; error?: string } : {};
        if (result.ok === false) {
          setRestartingApp(false);
          setThemeImportStatus(result.error || 'Mad Station could not restart. Please close and reopen it manually.');
        }
      }).catch((error: unknown) => {
        setRestartingApp(false);
        setThemeImportStatus(error instanceof Error ? `Restart failed: ${error.message}` : 'Mad Station could not restart. Please close and reopen it manually.');
      });
    } catch (error) {
      setRestartingApp(false);
      setThemeImportStatus(error instanceof Error ? `Restart failed: ${error.message}` : 'Mad Station could not restart. Please close and reopen it manually.');
    }
  };

  const updateSelection = (next: string[]) => {
    const unique = [...new Set(next.filter((id) => themeOptions.some((theme) => theme.id === id)))];
    selectedThemesRef.current = unique;
    setSelectedThemes(unique);
    const saved = readThemeExportSavedState();
    if (saved) writeThemeExportSavedState({ ...saved, selectedIds: unique });
  };
  const toggleTheme = (id: string, checked: boolean) => updateSelection(checked ? [...selectedThemesRef.current, id] : selectedThemesRef.current.filter((value) => value !== id));
  const scanThemePack = () => {
    if (scanningThemes || exportingThemes) return;
    setScanningThemes(true);
    setThemeExportStatus('Scanning theme files and checking for UI changes…');
    action({ type: 'scan-theme-pack' });
  };
  const manageTheme = (theme: ThemeExportOption, mode: string) => {
    if (removingManagedTheme || scanningThemes || exportingThemes) return;
    const prompt = `Delete the imported custom theme “${theme.title}”? It will be removed from Appearance, Quick Access, and future exports.`;
    if (!window.confirm(prompt)) return;
    setRemovingManagedTheme(mode);
    setThemeManageStatus('Updating the installed theme catalogue…');
    action({ type: 'remove-imported-theme', mode });
  };
  const exportThemePack = () => {
    if (!selectedThemes.length || exportingThemes || scanningThemes) return;
    // Refresh discovery immediately before export. If themes were added or removed,
    // update the user's choices first instead of silently omitting a newly added page.
    exportAfterScanRef.current = true;
    setScanningThemes(true);
    setThemeExportStatus('Refreshing theme discovery and fingerprints before export…');
    action({ type: 'scan-theme-pack' });
  };
  const scanThemeImport = () => {
    if (scanningThemeImport || importingThemePack) return;
    setScanningThemeImport(true);
    setThemeImportScan(null);
    setSelectedImportThemes([]);
    setThemeZipName('');
    setThemeImportStatus('Choose a ZIP to scan. Its themes will be installed as separate custom entries and will not replace built-in app themes.');
    action({ type: 'scan-theme-import' });
  };
  const scanDroppedThemeZip = (file: File | null | undefined) => {
    if (!file || scanningThemeImport || importingThemePack) return;
    if (!/\.zip$/i.test(file.name)) {
      setThemeImportStatus('That file is not a ZIP. Drop a theme-pack .zip file or use Browse for ZIP.');
      return;
    }
    setThemeZipName(file.name);
    setThemeImportScan(null);
    setSelectedImportThemes([]);
    setScanningThemeImport(true);
    setThemeImportStatus(`Reading “${file.name}” and scanning its themes…`);
    action({ type: 'scan-theme-import', zipFile: file });
  };
  const handleThemeZipDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsThemeZipDragging(false);
    if (scanningThemeImport || importingThemePack) return;
    const files = [...(event.dataTransfer?.files || [])];
    if (files.length !== 1) {
      setThemeImportStatus(files.length ? 'Drop one theme ZIP at a time. Each ZIP can contain multiple themes.' : 'Drop a theme-pack ZIP to start scanning.');
      return;
    }
    scanDroppedThemeZip(files[0]);
  };
  const setImportThemeChecked = (id: string, checked: boolean) => setSelectedImportThemes((current) => checked
    ? [...new Set([...current, id])]
    : current.filter((value) => value !== id));
  const unlockDeveloperOptions = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (developerAuthBusy) return;
    setDeveloperAuthBusy(true);
    setDeveloperAuthError('');
    try {
      const raw = await requestDeveloperSettingsAction('unlock', { password: developerUnlockPassword });
      const result = raw && typeof raw === 'object' ? raw as DeveloperAuthStatus : {};
      if (!result.ok || result.unlocked !== true) {
        setDeveloperAuthError(result.error || result.lockoutMessage || 'The password was not accepted.');
        return;
      }
      setDeveloperAccessUnlocked(true);
      setDeveloperKeepUnlockedForSession(result.keepUnlockedForSession === true);
      setDeveloperMustChangePassword(result.mustChangePassword === true);
      setDeveloperUnlockPassword('');
      setDeveloperAuthError('');
    } catch {
      setDeveloperAuthError('Could not unlock Developer Options. Please try again.');
    } finally {
      setDeveloperAuthBusy(false);
    }
  };
  const lockDeveloperOptions = async () => {
    try { await requestDeveloperSettingsAction('lock'); } catch { /* The local UI still locks immediately. */ }
    setDeveloperAccessUnlocked(false);
    setDeveloperKeepUnlockedForSession(false);
    setDeveloperUnlockPassword('');
    setDeveloperPasswordCurrent('');
    setDeveloperPasswordNext('');
    setDeveloperPasswordConfirm('');
    setDeveloperPasswordStatus('');
    setDeveloperPasswordError('');
  };
  const changeDeveloperKeepUnlockedForSession = async (enabled: boolean) => {
    try {
      const raw = await requestDeveloperSettingsAction('keep-unlocked', { enabled });
      const result = raw && typeof raw === 'object' ? raw as DeveloperAuthStatus : {};
      if (result.ok === false) {
        setDeveloperAuthError(result.error || 'Could not update the session preference.');
        return;
      }
      setDeveloperKeepUnlockedForSession(result.keepUnlockedForSession === true);
      setDeveloperAccessUnlocked(result.unlocked === true);
      setDeveloperAuthError('');
    } catch {
      setDeveloperAuthError('Could not update the session preference. Please try again.');
    }
  };
  const saveDeveloperPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (developerAuthBusy) return;
    setDeveloperAuthBusy(true);
    setDeveloperPasswordError('');
    setDeveloperPasswordStatus('');
    try {
      const raw = await requestDeveloperSettingsAction('change-password', {
        current: developerPasswordCurrent,
        next: developerPasswordNext,
        confirm: developerPasswordConfirm,
      });
      const result = raw && typeof raw === 'object' ? raw as { ok?: boolean; error?: string; status?: DeveloperAuthStatus } : {};
      if (!result.ok) {
        setDeveloperPasswordError(result.error || 'Could not change the Developer Options password.');
        return;
      }
      setDeveloperMustChangePassword(false);
      setDeveloperPasswordCurrent('');
      setDeveloperPasswordNext('');
      setDeveloperPasswordConfirm('');
      setDeveloperPasswordStatus('Developer Options password updated. The new password will be required the next time you unlock this session.');
    } catch {
      setDeveloperPasswordError('Could not change the Developer Options password. Please try again.');
    } finally {
      setDeveloperAuthBusy(false);
    }
  };
  const importSelectedThemes = () => {
    if (!themeImportScan?.scanId || !selectedImportThemes.length || scanningThemeImport || importingThemePack) return;
    const choices = selectedImportThemes.map((id) => ({ id, ...(themeImportChoices[id] || { action: 'add' as const }) }));
    setImportingThemePack(true);
    setThemeImportStatus(`Installing ${choices.length} selected theme${choices.length === 1 ? '' : 's'}…`);
    action({ type: 'import-theme-pack', scanId: themeImportScan.scanId, choices });
  };
  const normalizedExportSearch = exportThemeSearch.trim().toLowerCase();
  const visibleThemeOptions = normalizedExportSearch
    ? themeOptions.filter((theme) => `${theme.title} ${theme.filename} ${theme.description} ${theme.scanStatus || ''}`.toLowerCase().includes(normalizedExportSearch))
    : themeOptions;
  const newExportCount = themeOptions.filter((theme) => theme.scanStatus === 'new').length;
  const changedExportCount = themeOptions.filter((theme) => theme.scanStatus === 'changed').length;
  const allSelected = themeOptions.length > 0 && selectedThemes.length === themeOptions.length;
  const normalizedManageSearch = themeManageSearch.trim().toLowerCase();
  const visibleManagedThemes = normalizedManageSearch
    ? themeOptions.filter((theme) => `${theme.title} ${theme.filename} ${theme.description} ${theme.scanStatus || ''}`.toLowerCase().includes(normalizedManageSearch))
    : themeOptions;
  const customThemeModes = new Map((themeManagementCatalog.customThemes || []).filter((item) => typeof item.mode === 'string').map((item) => [item.mode as string, item] as const));
  if (!developerTabActive) return null;
  if (!developerAccessUnlocked) return <div className="developer-access-shell">
    <div className="developer-access-card ms-card">
      <div className="developer-access-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></svg></div>
      <p className="developer-access-eyebrow">Restricted workspace</p>
      <h2 className="ms-title">Unlock Developer Options</h2>
      <p className="developer-access-description">Theme importing, exporting, and recovery tools are password-protected. {developerMustChangePassword ? 'First-use access is enabled for this installation. Enter your temporary starter password, then change it after unlocking this section.' : 'Enter the password you created for Developer Options.'}</p>
      <form className="developer-access-form" onSubmit={unlockDeveloperOptions}>
        <label htmlFor="developerOptionsPassword">Developer password</label>
        <input id="developerOptionsPassword" className="ms-input" type="password" autoComplete="current-password" autoFocus value={developerUnlockPassword} onChange={(event) => setDeveloperUnlockPassword(event.currentTarget.value)} maxLength={256} required />
        {developerAuthError && <p className="form-error developer-access-error" role="alert">{developerAuthError}</p>}
        <button className="ms-btn ms-btn--primary" type="submit" disabled={developerAuthBusy || !developerUnlockPassword}>{developerAuthBusy ? 'Unlocking…' : 'Unlock Developer Options'}</button>
      </form>
      <p className="developer-access-footnote">By default, the section locks when you leave Developer Settings. You can opt to keep it unlocked for this app session below. Passwords are stored as a salted hash on this device.</p>
    </div>
  </div>;
  return <><div className="panel-head developer-panel-head"><div><h2 className="ms-title">Developer</h2><p>Private tools for importing separate custom themes and exporting editable source previews. Built-in homepage themes are always loaded from the project source files.</p></div><button className="ms-btn developer-lock-action" type="button" onClick={() => { void lockDeveloperOptions(); }}>Lock Developer Options</button></div><div className="bento">
    <section className="card ms-card ms-card--flat span-2 developer-session-card"><header className="card-head ms-card-head"><div><h3>Developer access session</h3><p>Choose whether leaving Developer Settings should require your password again.</p></div><span className={`ms-chip ${developerKeepUnlockedForSession ? 'developer-debug-chip--active' : ''}`}>{developerKeepUnlockedForSession ? 'Session unlocked' : 'Locks on exit'}</span></header><div className="card-body"><label className="developer-debug-master"><input type="checkbox" checked={developerKeepUnlockedForSession} onChange={(event) => { void changeDeveloperKeepUnlockedForSession(event.currentTarget.checked); }} /><span><strong>Keep Developer Options unlocked until Mad Station closes</strong><small>Skip repeat password prompts while this app session is running. The preference is memory-only, and the explicit Lock button or app security lock still locks the section.</small></span></label></div></section>
    <section className="card ms-card ms-card--flat span-2 developer-homepage-card" data-q="Developer-only default homepage legacy homepage diagnostic fallback">
      <header className="card-head ms-card-head"><div><h3>Default homepage (developer only)</h3><p>The original homepage is hidden from Appearance and Quick Access. Use it here only for diagnostics, recovery, or compatibility checks.</p></div><span className={`ms-chip ${activeHomepageMode === 'legacy' ? 'developer-debug-chip--active' : ''}`}>{activeHomepageMode === 'legacy' ? 'Currently active' : 'Developer-only'}</span></header>
      <div className="card-body developer-homepage-body"><button className="ms-btn ms-btn--primary" type="button" data-developer-default-homepage onClick={activateDeveloperDefaultHomepage} aria-pressed={activeHomepageMode === 'legacy'}>{activeHomepageMode === 'legacy' ? 'Default homepage is active' : 'Activate Default homepage'}</button><p className="developer-homepage-note">This option is available only while Developer Options is unlocked. Regular theme menus contain Simple and the other supported homepages.</p></div>
    </section>
    <section className="card ms-card ms-card--flat span-2 developer-password-card">
      <header className="card-head ms-card-head"><div><h3>Developer password</h3><p>{developerMustChangePassword ? 'You are using the temporary first-use password. Create your own password before sharing this installation.' : 'Change the password required to open Developer Settings.'}</p></div><span className={`ms-chip ${developerMustChangePassword ? 'developer-password-chip--temporary' : ''}`}>{developerMustChangePassword ? 'Temporary password' : 'Password protected'}</span></header>
      <form className="card-body developer-password-form" onSubmit={saveDeveloperPassword}>
        <label>Current password<input className="ms-input" type="password" autoComplete="current-password" value={developerPasswordCurrent} onChange={(event) => setDeveloperPasswordCurrent(event.currentTarget.value)} required maxLength={256} /></label>
        <label>New password<input className="ms-input" type="password" autoComplete="new-password" value={developerPasswordNext} onChange={(event) => setDeveloperPasswordNext(event.currentTarget.value)} required minLength={8} maxLength={256} /></label>
        <label>Confirm new password<input className="ms-input" type="password" autoComplete="new-password" value={developerPasswordConfirm} onChange={(event) => setDeveloperPasswordConfirm(event.currentTarget.value)} required minLength={8} maxLength={256} /></label>
        <div className="developer-password-footer"><span>Use at least 8 characters. Your password is stored as a salted hash on this device.</span><button className="ms-btn ms-btn--primary" type="submit" disabled={developerAuthBusy || !developerPasswordCurrent || !developerPasswordNext || !developerPasswordConfirm}>{developerAuthBusy ? 'Saving…' : developerMustChangePassword ? 'Create my password' : 'Change password'}</button></div>
        {developerPasswordError && <p className="form-error" role="alert">{developerPasswordError}</p>}
        {developerPasswordStatus && <p className="theme-export-status" role="status">{developerPasswordStatus}</p>}
      </form>
    </section>
    <section className="card ms-card ms-card--flat span-2 developer-debug-card" data-q="Developer Debug Mode visual debug outlines containers grid element labels overflow viewport HUD hover inspector hidden elements pause animations">
      <header className="card-head ms-card-head"><div><h3>Debug Mode &amp; Visual Inspector</h3><p>Visual outlines stay on the page, while live element details open in a separate resizable desktop window. The inspector separates the hovered element, computed layout, accessibility, hit-test stack, last click, and page diagnostics into readable sections. Debug settings are saved locally and remain off by default.</p></div><span className={`ms-chip ${developerDebugSettings.enabled ? 'developer-debug-chip--active' : ''}`}>{developerDebugSettings.enabled ? 'Debug active' : 'Disabled'}</span></header>
      <div className="card-body developer-debug-body">
        <label className="developer-debug-master"><input type="checkbox" checked={developerDebugSettings.enabled} onChange={(event) => updateDeveloperDebugSetting('enabled', event.currentTarget.checked)} /><span><strong>Enable Debug Mode</strong><small>Turns on the selected visual and layout diagnostics immediately, including in built-in homepage themes.</small></span></label>
        <div className={`developer-debug-options ${developerDebugSettings.enabled ? 'is-enabled' : ''}`} aria-label="Debug options">
          {([
            ['outlines', 'Outline element boxes', 'Draw boundaries around DOM elements and use separate colors for containers and interactive controls.'],
            ['containers', 'Tint layout containers', 'Add a subtle overlay to sections, panels, cards, grids, forms, and other structural containers.'],
            ['grid', 'Show 16 px layout grid', 'Place a pointer-transparent grid over the page to check alignment, gaps, and spacing.'],
            ['labels', 'Label elements and IDs', 'Show the tag name, ID, and key classes near visible elements. Labels are capped to keep the page readable.'],
            ['overflow', 'Highlight overflow', 'Outline elements whose contents overflow their box or that sit outside the visible viewport.'],
            ['hud', 'Open separate inspector window', 'Show live diagnostics in a separate desktop window instead of drawing an information panel over the app. Includes hover details, layout, accessibility, hit-test stack, clicks, and page statistics.'],
            ['hoverInspector', 'Highlight element under pointer', 'Outline the hovered element in the page. Its full selector, bounds, role, tabindex, and computed styles appear in the separate inspector window.'],
            ['hitTest', 'Inspect pointer hit-test stack', 'Show up to eight elements under the pointer in topmost-first order. Use this to find overlays covering buttons or menus.'],
            ['boxModel', 'Show box model details', 'Add computed padding, margin, and border widths for the hovered element.'],
            ['focusable', 'Highlight keyboard-focusable controls', 'Outline buttons, links, inputs, and tabindex elements so you can check navigation and click targets.'],
            ['clickTrace', 'Trace the last click', 'Record the target and actionable ancestor for each click, plus whether another handler called preventDefault. This observer never cancels clicks.'],
            ['hiddenAudit', 'Audit hidden elements', 'Count hidden nodes and show a few IDs in the HUD without forcing hidden UI to appear or breaking layout.'],
            ['pauseAnimations', 'Pause CSS animations under the pointer', 'Pause only the animated element currently under your pointer. It resumes when you move away. Page-wide animations and menu state are never frozen.'],
          ] as Array<[Exclude<keyof DeveloperDebugSettings, 'enabled'>, string, string]>).map(([key, title, description]) => <label className="developer-debug-option" key={key}>
            <input type="checkbox" checked={developerDebugSettings[key]} disabled={!developerDebugSettings.enabled} onChange={(event) => updateDeveloperDebugSetting(key, event.currentTarget.checked)} />
            <span><strong>{title}</strong><small>{description}</small></span>
          </label>)}
        </div>
        <div className="developer-debug-footer"><p>Applies to Mad Station’s renderer UI and built-in homepage themes. Isolated third-party website content is intentionally not inspected. The live inspector is a separate native desktop window that can be resized, moved, pinned above the app, and closed without covering the page with a diagnostic panel. Debug Mode switches off automatically after restart while your chosen tools are remembered. Emergency reset: press Ctrl+Shift+F12 from anywhere in the app to clear every debug overlay and option.</p><div className="developer-debug-footer-actions"><button className="ms-btn ms-btn--primary" type="button" disabled={!developerDebugSettings.enabled} onClick={openDeveloperInspector}>Open Separate Inspector Window</button><button className="ms-btn" type="button" onClick={resetDeveloperDebugSettings}>Reset debug options</button></div></div>
      </div>
    </section>
    {themeRestartStatus?.required && <section className="theme-restart-notice span-2" role="alert" aria-live="assertive">
      <div className="theme-restart-notice-copy"><strong>Restart required to apply theme changes</strong><span>{themeRestartStatus.themeCount > 0 ? `${themeRestartStatus.themeCount} custom theme${themeRestartStatus.themeCount === 1 ? '' : 's'} installed${themeRestartStatus.themes.length ? `: ${themeRestartStatus.themes.join(', ')}` : ''}.` : 'The imported custom theme catalogue has changed.'} Restart Mad Station to load the updated theme files and apply the changes completely.</span></div>
      <button className="ms-btn ms-btn--primary" type="button" disabled={restartingApp} onClick={restartForThemeChanges}>{restartingApp ? 'Restarting…' : 'Restart App Now'}</button>
    </section>}
    <section className="card ms-card ms-card--flat span-2 theme-manage-card" data-q="Manage Themes refresh scan added changed deleted source themes remove imported custom theme see missing files changes">
      <header className="card-head ms-card-head"><div><h3>Manage Themes</h3><p>Refresh the catalogue to detect added, edited, or missing theme source files. Delete imported custom themes here; built-in themes are controlled only by files in the project source.</p></div><span className="ms-chip theme-export-count">{themeOptions.length} detected</span></header>
      <div className="card-body theme-manage-body">
        <div className="theme-manage-toolbar">
          <label className="theme-export-search"><span className="theme-export-search-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="10.8" cy="10.8" r="6.3"/><path d="m15.5 15.5 4.2 4.2"/></svg></span><input type="search" aria-label="Search managed themes" placeholder="Search installed themes…" value={themeManageSearch} onChange={(event) => setThemeManageSearch(event.currentTarget.value)} /></label>
          <button className="ms-btn ms-btn--primary" type="button" disabled={scanningThemes || exportingThemes || Boolean(removingManagedTheme)} onClick={scanThemePack}>{scanningThemes ? 'Refreshing…' : 'Refresh themes'}</button>
        </div>
        {themeScanSummary && <p className="theme-export-scan-summary" role="status">{themeScanSummary}</p>}
        <div className="theme-manage-list">
          {visibleManagedThemes.map((theme) => {
            const customEntry = customThemeModes.get(theme.id);
            const managedMode = typeof customEntry?.mode === 'string' ? customEntry.mode : undefined;
            const busy = removingManagedTheme !== null && (removingManagedTheme === theme.id || removingManagedTheme === managedMode);
            const typeLabel = customEntry ? 'Imported custom theme' : 'Bundled built-in theme';
            return <article className="theme-manage-row" key={theme.id}>
              <div className="theme-manage-copy"><strong>{theme.title}</strong><span>{theme.filename} · {theme.description}</span><small>{typeLabel} · {theme.scanStatus === 'new' ? 'Added since last scan' : theme.scanStatus === 'changed' ? 'Files changed since last scan' : 'Files match the last scan'}</small></div>
              <div className="theme-manage-actions"><em className={`theme-export-badge theme-export-badge--${theme.scanStatus || 'current'}`}>{theme.scanStatus === 'new' ? 'New' : theme.scanStatus === 'changed' ? 'Changed' : 'Current'}</em>
                {managedMode ? <button className="ms-btn theme-manage-remove" type="button" disabled={Boolean(removingManagedTheme) || scanningThemes || exportingThemes} onClick={() => manageTheme(theme, managedMode)}>{busy ? 'Working…' : 'Delete imported'}</button> : <span className="theme-manage-built-in">Built-in source</span>}
              </div>
            </article>;
          })}
          {!visibleManagedThemes.length && <p className="theme-export-empty">{scanningThemes ? 'Scanning theme files…' : themeOptions.length ? 'No installed themes match your search.' : 'No theme pages were discovered. Refresh to scan the project source and installed custom themes.'}</p>}
        </div>
        {removedThemesSinceScan.length > 0 && <div className="theme-manage-change-notice theme-manage-change-notice--removed" role="status"><strong>{removedThemesSinceScan.length} theme{removedThemesSinceScan.length === 1 ? '' : 's'} disappeared since the previous scan</strong><span>{removedThemesSinceScan.map((item) => item.title).join(', ')}. These theme files are no longer in the current scan.</span></div>}
        {(themeManagementCatalog.missingThemes || []).length > 0 && <div className="theme-manage-change-notice theme-manage-change-notice--removed" role="status"><strong>{themeManagementCatalog.missingThemes!.length} installed record{themeManagementCatalog.missingThemes!.length === 1 ? '' : 's'} had missing files</strong><span>{themeManagementCatalog.missingThemes!.map((item) => typeof item.title === 'string' ? item.title : String(item.mode || 'Unknown theme')).join(', ')}. The stale registry entries were cleaned during this refresh; this does not delete any remaining theme files.</span></div>}
        {themeManageStatus && <p className="theme-export-status" role="status">{themeManageStatus}</p>}
      </div>
    </section>
    <section className="card ms-card ms-card--flat span-2 theme-design-import-card" data-q="Theme ZIP importer add new custom themes reconnect Quick Access Settings Appearance buttons adapter integration instructions">
      <header className="card-head ms-card-head"><div><h3>Theme ZIP Importer</h3><p>Scan a designer ZIP and add its pages as separate custom themes. Built-in themes cannot be replaced by ZIP files. App-owned adapters reconnect Quick Access, Settings, Appearance, and supported app-launch buttons.</p></div></header>
      <div className="card-body theme-import-body">
        <div className="theme-import-dropzone-wrap">
          <div className={`theme-import-dropzone ${isThemeZipDragging ? 'is-dragging' : ''} ${scanningThemeImport || importingThemePack ? 'is-busy' : ''}`}
            onDragEnter={(event) => { event.preventDefault(); if (!scanningThemeImport && !importingThemePack) setIsThemeZipDragging(true); }}
            onDragOver={(event) => { event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'; }}
            onDragLeave={(event) => { const nextTarget = event.relatedTarget; if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) setIsThemeZipDragging(false); }}
            onDrop={handleThemeZipDrop}>
            <span className="theme-import-drop-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M7 3h7l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M14 3v5h5M9 12h6M9 16h6"/><path d="M3 9v10a2 2 0 0 0 2 2"/></svg></span>
            <div className="theme-import-drop-copy"><strong>{scanningThemeImport ? 'Scanning theme ZIP…' : importingThemePack ? 'Installing selected themes…' : 'Drop a theme ZIP here'}</strong><span>{themeZipName ? `Selected: ${themeZipName}` : 'We’ll inspect it first. Nothing changes until you confirm the import.'}</span><small>ZIP files only · one pack at a time · imports are staged before installation</small></div>
            <button className="ms-btn ms-btn--primary theme-import-browse" type="button" disabled={scanningThemeImport || importingThemePack} onClick={scanThemeImport}>{scanningThemeImport ? 'Scanning…' : 'Browse for ZIP'}</button>
          </div>
          <div className="theme-import-trust-note"><span className="theme-import-trust-dot" aria-hidden="true"/><span><strong>Safe integration</strong> Mad Station validates paths and assets, then reconnects controls through its trusted adapter. A ZIP’s own app bridges are never trusted.</span></div>
        </div>
        {themeImportScan && <>
          <div className="theme-import-result-heading"><div><h4>{themeImportScan.packageTitle || 'Scanned theme pack'}</h4><p>{themeImportScan.themes?.length || 0} themes detected · {themeImportScan.fileCount || 0} files inspected</p></div><span className={`theme-import-instructions ${themeImportScan.instructionsPresent ? 'is-present' : 'is-missing'}`}>{themeImportScan.instructionsPresent ? 'Integration guide found' : 'Built-in mappings will be used'}</span></div>
          <p className="theme-export-scan-summary" role="status">{themeImportScan.instructionsPresent ? `Instructions found: ${themeImportScan.instructionsFile || 'THEME_INTEGRATION.md'}.` : 'Instruction file missing; safe built-in reconnection will be used.'}</p>
          {(themeImportScan.warnings || []).map((warning, index) => <p className="theme-export-warning" key={`${index}-${warning}`}>{warning}</p>)}
          <div className="theme-export-grid">{(themeImportScan.themes || []).map((theme) => {
            return <div className="theme-export-choice theme-import-choice" key={theme.id}>
              <input type="checkbox" checked={selectedImportThemes.includes(theme.id)} disabled={importingThemePack} aria-label={`Select ${theme.title}`} onChange={(event) => setImportThemeChecked(theme.id, event.currentTarget.checked)} />
              <span><strong>{theme.title}</strong><small>{theme.filename} · {theme.description}</small><small>{theme.status === 'new' ? 'NEW THEME' : theme.status === 'changed' ? 'CHANGED THEME' : 'MATCHES INSTALLED SOURCE'}</small><small>Always added as a separate custom theme. Built-in app themes cannot be replaced by ZIP imports.</small></span>
              <em className={`theme-export-badge theme-export-badge--${theme.status}`}>{theme.status === 'new' ? 'New' : theme.status === 'changed' ? 'Changed' : 'Current'}</em>
            </div>;
          })}{!(themeImportScan.themes || []).length && <p className="theme-export-empty">No theme pages were detected in this ZIP.</p>}</div>
          <div className="theme-export-footer"><span className="theme-export-hint">Imported ZIPs are installed only as separate custom themes. To restyle a built-in theme, edit its source under src/ and rebuild Mad Station. Previous imported custom versions are retained as rollback backups.</span><button className="ms-btn ms-btn--primary" type="button" disabled={!selectedImportThemes.length || importingThemePack || scanningThemeImport} onClick={importSelectedThemes}>{importingThemePack ? 'Installing…' : `Apply ${selectedImportThemes.length} selected theme${selectedImportThemes.length === 1 ? '' : 's'}`}</button></div>
        </>}
        {themeImportStatus && <p className="theme-export-status" role="status">{themeImportStatus}</p>}
      </div>
    </section>
    <section className="card ms-card ms-card--flat span-2 theme-design-export-card" data-q="Theme Design Exporter export AI visual only themes ZIP HTML CSS animations backgrounds placeholders discover scan source changes dynamic themes">
      <header className="card-head ms-card-head"><div><h3>Theme Design Exporter</h3><p>Build a shareable ZIP from the current editable source files. This ZIP is an export artifact, not the app’s source of truth. Built-in themes always export from src/home-*.html; imported custom themes are separate entries.</p></div><span className="ms-chip theme-export-count">{selectedThemes.length} of {themeOptions.length} selected</span></header>
      <div className="card-body theme-export-body">
        <div className="theme-export-overview" aria-label="Theme scan summary">
          <div><span>Available themes</span><strong>{themeOptions.length}</strong></div><div><span>New since scan</span><strong>{newExportCount}</strong></div><div><span>Changed since scan</span><strong>{changedExportCount}</strong></div><div><span>Selected to export</span><strong>{selectedThemes.length}</strong></div>
        </div>
        <p className="theme-export-layout-hint">Theme packs target a 1450 × 920 px default window and reflow for smaller sizes. Exports include the integration guide and manifest; live host bridges stay inside the app.</p>
        <div className="theme-export-tools"><label className="theme-export-search"><span className="theme-export-search-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="10.8" cy="10.8" r="6.3"/><path d="m15.5 15.5 4.2 4.2"/></svg></span><input type="search" aria-label="Search themes to export" placeholder="Search themes by name or file…" value={exportThemeSearch} onChange={(event) => setExportThemeSearch(event.currentTarget.value)} /></label><div className="theme-export-toolbar-actions"><button className="ms-btn" type="button" disabled={exportingThemes || scanningThemes} onClick={scanThemePack}>{scanningThemes ? 'Scanning…' : 'Scan themes & changes'}</button><button className="ms-btn" type="button" disabled={exportingThemes || scanningThemes || !themeOptions.length} onClick={() => updateSelection(themeOptions.map((theme) => theme.id))}>Select all</button><button className="ms-btn" type="button" disabled={exportingThemes || scanningThemes || !selectedThemes.length} onClick={() => updateSelection([])}>Clear selection</button></div></div>
        {themeScanSummary && <p className="theme-export-scan-summary" role="status">{themeScanSummary}</p>}
        <div className="theme-export-grid">{visibleThemeOptions.map((theme) => <label className={`theme-export-choice ${selectedThemes.includes(theme.id) ? 'is-selected' : ''}`} key={theme.id}><input type="checkbox" checked={selectedThemes.includes(theme.id)} disabled={exportingThemes || scanningThemes} onChange={(event) => toggleTheme(theme.id, event.currentTarget.checked)} /><span><strong>{theme.title}</strong><small>{theme.filename} · {theme.description}</small><small>{theme.dependencyCount} local dependencies · {theme.scanStatus === 'new' ? 'New theme' : theme.scanStatus === 'changed' ? 'Source changed' : 'Scanned'}</small>{theme.missingDependencies.length > 0 && <small className="theme-export-warning">{theme.missingDependencies.length} local dependencies missing; check manifest after export.</small>}</span><em className={`theme-export-badge theme-export-badge--${theme.scanStatus || 'current'}`}>{theme.scanStatus === 'new' ? 'New' : theme.scanStatus === 'changed' ? 'Changed' : 'Current'}</em></label>)}{!visibleThemeOptions.length && <p className="theme-export-empty">{scanningThemes ? 'Looking for theme pages…' : themeOptions.length ? 'No themes match your search.' : 'No theme pages were discovered. Built-in theme source pages use src/home-*.html; imported custom pages use their own custom IDs.'}</p>}</div>
        <div className="theme-export-footer"><span className="theme-export-hint">The export contains visual theme files, local assets, a machine-readable manifest, and integration instructions. Host bridges and app-launch functions are excluded.</span><button className="ms-btn ms-btn--primary theme-export-action" type="button" disabled={!selectedThemes.length || exportingThemes || scanningThemes} onClick={exportThemePack}>{exportingThemes ? 'Preparing ZIP…' : `Export ${allSelected ? 'all themes' : `${selectedThemes.length} selected theme${selectedThemes.length === 1 ? '' : 's'}`}`}</button></div>
        {themeExportStatus && <p className="theme-export-status" role="status">{themeExportStatus}</p>}
      </div>
    </section>
    {DEVELOPER_CONTENT.cards.filter((card) => !HIDDEN_DEVELOPER_CARD_TITLES.has(card.title)).map((card) => <section className="card ms-card ms-card--flat span-2" key={card.title}><header className="card-head ms-card-head"><div><h3>{card.title}</h3><p>{card.description}</p></div></header><div className="card-body">{card.rows.map((row) => <div className="row ms-row" data-q={row.query || `${row.title} ${row.description}`} key={row.title}><span className="row-copy"><strong>{row.title}</strong><span>{row.description}</span></span><button className="ms-btn ms-location-btn" type="button" onClick={() => action({ type: 'show-location', path: row.path })} title={`Open file location: ${row.path}`}>Open file location</button></div>)}</div></section>)}
  </div></>;
}

const mountConfig = [
  ['aiHubPrivacyReactMount', PrivacyPanel],
  ['aiHubWebsitesReactMount', WebsitesPanel],
  ['aboutReactMount', AboutPanel],
  ['developerReactMount', DeveloperPanel],
] as const;
const roots: Array<{ root: Root; Component: () => ReactElement | null }> = [];
for (const [id, Component] of mountConfig) {
  const mount = document.getElementById(id);
  if (mount) roots.push({ root: createRoot(mount), Component });
}
for (const mounted of roots) mounted.root.render(<mounted.Component />);

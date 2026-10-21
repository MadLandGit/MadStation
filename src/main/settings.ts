/** Pure, typed application-settings normalization. No Electron or filesystem imports belong here. */

export type Theme = 'dark' | 'light' | 'system';
export type Density = 'comfortable' | 'compact';
export type ButtonCorner = 'soft' | 'pill' | 'square' | 'sharp' | 'glass' | 'neon';
export type ButtonBackground = 'solid' | 'outline' | 'ghost' | 'contrast' | 'glass' | 'neon' | 'text';
export type StartupWorkspace = 'launcher' | 'ai-hub' | 'ai-lab' | 'clipboard' | 'instruction-forge' | 'video-hub';

export interface CustomBackground {
  id: string;
  name: string;
  url: string;
  type: 'local' | 'url';
  createdAt: string;
}

export interface AppSettings {
  theme: Theme;
  accent: string;
  density: Density;
  cardSpacing: 'compact' | 'comfortable' | 'spacious';
  borderSpacing: 'compact' | 'comfortable' | 'spacious';
  reduceMotion: boolean;
  startMaximized: boolean;
  launchAtLogin: boolean;
  restoreLastAccount: boolean;
  startupWorkspace: StartupWorkspace;
  confirmAccountDeletion: boolean;
  pageZoom: 80 | 90 | 100 | 110 | 125 | 150;
  accessibility: {
    textScale: 90 | 100 | 110 | 125 | 150;
    highContrast: boolean;
    focusIndicators: boolean;
    alwaysShowAccountNames: boolean;
  };
  releaseFeedUrl: string;
  surfaceStyle: 'solid' | 'glass' | 'elevated' | 'frosted';
  backgroundStyle: string;
  customBackgrounds: CustomBackground[];
  backgroundId: string;
  cornerStyle: 'soft' | 'sharp' | 'square' | 'ultra';
  buttonCorner: ButtonCorner;
  buttonBackground: ButtonBackground;
  borderStyle: 'subtle' | 'balanced' | 'strong' | 'neon' | 'neon2' | 'glass' | 'none';
  shadowStyle: 'none' | 'soft' | 'strong' | 'neon' | 'glass';
  showStatusBar: boolean;
  animateHover: boolean;
  startupFocus: 'sidebar' | 'search' | 'workspace';
  audio: { outputDeviceId: string };
}

export interface SecuritySettings {
  lockOnLaunch: boolean;
  lockOnSystemLock: boolean;
  lockOnMinimize: boolean;
  lockOnIdle: boolean;
  idleMinutes: 1 | 5 | 10 | 30;
  clearCacheOnExit: boolean;
  signOutOnExit: boolean;
  disableDiskCache: boolean;
  blockPopups: boolean;
  restrictNavigation: boolean;
  allowLoginProviders: boolean;
  blockHttp: boolean;
  allowCamera: boolean;
  allowMicrophone: boolean;
  allowNotifications: boolean;
  allowFullscreen: boolean;
  contentProtection: boolean;
  remoteIcons: boolean;
  spellcheck: boolean;
  blockDevTools: boolean;
}

export const IDLE_CHOICES = [1, 5, 10, 30] as const;
export const ZOOM_CHOICES = [80, 90, 100, 110, 125, 150] as const;
const ACCENT_CHOICES = ['blue', 'violet', 'pink', 'red', 'orange', 'green', 'teal'] as const;
const CUSTOM_ACCENT_RE = /^#[0-9a-f]{6}$/i;
const DENSITY_CHOICES = ['comfortable', 'compact'] as const;
const BUILT_IN_BACKGROUNDS = ['plain', 'aurora', 'grid', 'spotlight', 'mesh', 'neon', 'parallax', 'dots', 'rings', 'hex', 'waves', 'diagonal', 'circuit', 'constellation', 'tiles'] as const;
const CORNER_CHOICES = ['soft', 'sharp', 'square', 'ultra'] as const;
const BUTTON_CORNER_CHOICES = ['soft', 'pill', 'square', 'sharp', 'glass', 'neon'] as const;
const BUTTON_BACKGROUND_CHOICES = ['solid', 'outline', 'ghost', 'contrast', 'glass', 'neon', 'text'] as const;
const BORDER_CHOICES = ['subtle', 'balanced', 'strong', 'neon', 'neon2', 'glass', 'none'] as const;
const SHADOW_CHOICES = ['none', 'soft', 'strong', 'neon', 'glass'] as const;
const STARTUP_FOCUS_CHOICES = ['sidebar', 'search', 'workspace'] as const;
const STARTUP_WORKSPACES = ['launcher', 'ai-hub', 'ai-lab', 'clipboard', 'instruction-forge', 'video-hub'] as const;

export const DEFAULT_SECURITY: SecuritySettings = {
  lockOnLaunch: true,
  lockOnSystemLock: true,
  lockOnMinimize: false,
  lockOnIdle: false,
  idleMinutes: 10,
  clearCacheOnExit: true,
  signOutOnExit: false,
  disableDiskCache: false,
  blockPopups: true,
  restrictNavigation: true,
  allowLoginProviders: true,
  blockHttp: true,
  allowCamera: true,
  allowMicrophone: false,
  allowNotifications: false,
  allowFullscreen: true,
  contentProtection: false,
  remoteIcons: true,
  spellcheck: true,
  blockDevTools: false,
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  theme: 'dark',
  accent: 'blue',
  density: 'comfortable',
  cardSpacing: 'comfortable',
  borderSpacing: 'comfortable',
  reduceMotion: false,
  startMaximized: false,
  launchAtLogin: false,
  restoreLastAccount: true,
  startupWorkspace: 'launcher',
  confirmAccountDeletion: true,
  pageZoom: 100,
  accessibility: { textScale: 100, highContrast: false, focusIndicators: true, alwaysShowAccountNames: false },
  releaseFeedUrl: '',
  surfaceStyle: 'solid',
  backgroundStyle: 'plain',
  customBackgrounds: [],
  backgroundId: '',
  cornerStyle: 'soft',
  buttonCorner: 'soft',
  buttonBackground: 'solid',
  borderStyle: 'subtle',
  shadowStyle: 'soft',
  showStatusBar: true,
  animateHover: true,
  startupFocus: 'sidebar',
  audio: { outputDeviceId: 'default' },
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function oneOf<const T extends readonly unknown[]>(choices: T, value: unknown): value is T[number] {
  return choices.includes(value);
}

function cleanText(value: unknown, max: number): string {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
}

function cleanId(value: unknown, max: number): string {
  const id = String(value ?? '').trim();
  return /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id) && id.length <= max ? id : '';
}

/** Clone nested defaults so normalization never mutates the shared default object. */
function freshAppSettings(): AppSettings {
  return {
    ...DEFAULT_APP_SETTINGS,
    accessibility: { ...DEFAULT_APP_SETTINGS.accessibility },
    customBackgrounds: [],
    audio: { ...DEFAULT_APP_SETTINGS.audio },
  };
}

export function normalizeAppSettings(rawValue: unknown): AppSettings {
  const out = freshAppSettings();
  if (!isPlainObject(rawValue)) return out;
  const raw = rawValue;

  if (oneOf(['dark', 'light', 'system'] as const, raw.theme)) out.theme = raw.theme;
  if (oneOf(ACCENT_CHOICES, raw.accent)) out.accent = raw.accent;
  else if (typeof raw.accent === 'string' && CUSTOM_ACCENT_RE.test(raw.accent)) out.accent = raw.accent.toLowerCase();
  if (oneOf(DENSITY_CHOICES, raw.density)) out.density = raw.density;
  if (oneOf(['compact', 'comfortable', 'spacious'] as const, raw.cardSpacing)) out.cardSpacing = raw.cardSpacing;
  if (oneOf(['compact', 'comfortable', 'spacious'] as const, raw.borderSpacing)) out.borderSpacing = raw.borderSpacing;
  if (oneOf(ZOOM_CHOICES, Number(raw.pageZoom))) out.pageZoom = Number(raw.pageZoom) as AppSettings['pageZoom'];

  for (const key of ['reduceMotion', 'startMaximized', 'launchAtLogin', 'restoreLastAccount', 'confirmAccountDeletion'] as const) {
    if (typeof raw[key] === 'boolean') out[key] = raw[key];
  }

  if (raw.startupWorkspace === 'test-app') out.startupWorkspace = 'video-hub';
  else if (oneOf(STARTUP_WORKSPACES, raw.startupWorkspace)) out.startupWorkspace = raw.startupWorkspace;

  if (isPlainObject(raw.accessibility)) {
    const scale = Number(raw.accessibility.textScale);
    if (oneOf([90, 100, 110, 125, 150] as const, scale)) out.accessibility.textScale = scale;
    for (const key of ['highContrast', 'focusIndicators', 'alwaysShowAccountNames'] as const) {
      if (typeof raw.accessibility[key] === 'boolean') out.accessibility[key] = raw.accessibility[key];
    }
  }

  if (typeof raw.releaseFeedUrl === 'string' && raw.releaseFeedUrl.length <= 2048) out.releaseFeedUrl = raw.releaseFeedUrl.trim();
  if (isPlainObject(raw.audio) && typeof raw.audio.outputDeviceId === 'string' && raw.audio.outputDeviceId.length <= 512) {
    out.audio.outputDeviceId = raw.audio.outputDeviceId || 'default';
  }

  if (oneOf(['solid', 'glass', 'elevated', 'frosted'] as const, raw.surfaceStyle)) out.surfaceStyle = raw.surfaceStyle;
  if (oneOf(BUILT_IN_BACKGROUNDS, raw.backgroundStyle)) {
    out.backgroundStyle = raw.backgroundStyle;
    out.backgroundId = '';
  } else if (raw.backgroundStyle === 'custom' && typeof raw.backgroundId === 'string') {
    out.backgroundStyle = 'custom';
    out.backgroundId = raw.backgroundId;
  }

  const rawBackgrounds = Array.isArray(raw.customBackgrounds) ? raw.customBackgrounds : [];
  out.customBackgrounds = rawBackgrounds.map((item): CustomBackground | null => {
    if (!isPlainObject(item)) return null;
    const id = cleanId(item.id, 120);
    const name = cleanText(item.name, 80);
    const url = typeof item.url === 'string' ? item.url.trim() : '';
    const type = item.type === 'local' ? 'local' : 'url';
    if (!id || !name || !url) return null;
    if (type === 'url' && !/^https:\/\//i.test(url)) return null;
    if (type === 'local' && !/^file:\/\//i.test(url)) return null;
    return { id, name, url, type, createdAt: typeof item.createdAt === 'string' ? item.createdAt : '' };
  }).filter((item): item is CustomBackground => item !== null).slice(0, 32);

  if (out.backgroundStyle === 'custom' && !out.customBackgrounds.some((item) => item.id === out.backgroundId)) {
    out.backgroundStyle = 'plain';
    out.backgroundId = '';
  }

  if (oneOf(CORNER_CHOICES, raw.cornerStyle)) out.cornerStyle = raw.cornerStyle;
  if (oneOf(BUTTON_CORNER_CHOICES, raw.buttonCorner)) out.buttonCorner = raw.buttonCorner;
  if (oneOf(BUTTON_BACKGROUND_CHOICES, raw.buttonBackground)) out.buttonBackground = raw.buttonBackground;

  if (!('buttonCorner' in raw) && !('buttonBackground' in raw) && typeof raw.buttonStyle === 'string') {
    const legacy: Record<string, [ButtonCorner, ButtonBackground]> = {
      soft: ['soft', 'solid'], pill: ['pill', 'solid'], square: ['square', 'solid'], sharp: ['sharp', 'solid'],
      outline: ['soft', 'outline'], ghost: ['soft', 'ghost'], contrast: ['soft', 'contrast'],
      gradient: ['soft', 'solid'], text: ['soft', 'text'],
    };
    const mapped = legacy[raw.buttonStyle];
    if (mapped) [out.buttonCorner, out.buttonBackground] = mapped;
  }

  if (oneOf(BORDER_CHOICES, raw.borderStyle)) out.borderStyle = raw.borderStyle;
  if (oneOf(SHADOW_CHOICES, raw.shadowStyle)) out.shadowStyle = raw.shadowStyle;
  for (const key of ['showStatusBar', 'animateHover'] as const) {
    if (typeof raw[key] === 'boolean') out[key] = raw[key];
  }
  if (oneOf(STARTUP_FOCUS_CHOICES, raw.startupFocus)) out.startupFocus = raw.startupFocus;
  return out;
}

type BooleanSecurityKey = {
  [K in keyof SecuritySettings]: SecuritySettings[K] extends boolean ? K : never;
}[keyof SecuritySettings];

const BOOLEAN_SECURITY_KEYS = Object.keys(DEFAULT_SECURITY).filter((key) => key !== 'idleMinutes') as BooleanSecurityKey[];

export function normalizeSecurity(rawValue: unknown): SecuritySettings {
  const out: SecuritySettings = { ...DEFAULT_SECURITY };
  if (!isPlainObject(rawValue)) return out;
  if (oneOf(IDLE_CHOICES, Number(rawValue.idleMinutes))) out.idleMinutes = Number(rawValue.idleMinutes) as SecuritySettings['idleMinutes'];
  for (const key of BOOLEAN_SECURITY_KEYS) {
    if (typeof rawValue[key] === 'boolean') out[key] = rawValue[key] as SecuritySettings[typeof key] & boolean;
  }
  return out;
}

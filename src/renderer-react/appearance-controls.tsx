import { createRoot, type Root } from 'react-dom/client';
import { useEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react';

type CustomBackground = {
  id: string;
  name: string;
  type: 'url' | 'local';
  url: string;
};

type AppearanceSettings = {
  theme?: string;
  accent?: string;
  backgroundStyle?: string;
  backgroundId?: string;
  customBackgrounds?: unknown[];
};

type AccentPalette = Record<string, { dark: string[]; light: string[] }>;

declare global {
  interface Window {
    MAD_ACCENTS?: AccentPalette;
  }
}

const HOMEPAGE_STYLES = [
  { id: 'v2', label: 'Simple', description: 'A clean, modular app grid with fast access to your tools.' },
  { id: 'retro', label: 'Simple Retro', description: 'A CRT-inspired homepage with pixel-art details and phosphor glow.' },
  { id: 'retro-complex', label: 'Retro Complex', description: 'A vintage desktop scene with a physical CRT and floppy-disk details.' },
  { id: 'parallax', label: '3D Parallax', description: 'A modern app grid with animated depth and layered motion.' },
  { id: 'parallax-big', label: '3D Parallax Big App', description: 'A featured app stage, companion tools, and layered depth.' },
  { id: 'galaxy', label: 'Galaxy', description: 'A cosmic launcher with glowing planets and orbital navigation.' },
  { id: 'parallax-jungle', label: 'Parallax Jungle', description: 'A lush, layered jungle scene with atmospheric motion.' },
  { id: 'claymorphism', label: 'Claymorphism', description: 'Soft, tactile surfaces, rounded controls, and playful depth.' },
  { id: 'glass', label: 'Glass', description: 'Frosted glass panels floating over luminous depth layers.' },
  { id: 'isometric-world', label: 'Isometric World', description: 'An orbitable miniature app island with arrangeable buildings and day/night lighting.' },
] as const;

const HOMEPAGE_STORAGE_KEY = 'mad-station-homepage-version-v1';
function readHomepageStyle(): string {
  try {
    const saved = window.localStorage.getItem(HOMEPAGE_STORAGE_KEY);
    return saved === 'legacy' || HOMEPAGE_STYLES.some((style) => style.id === saved) || (typeof saved === 'string' && /^custom-[a-z0-9-]{1,64}$/.test(saved)) ? saved! : 'v2';
  } catch { return 'v2'; }
}


const THEME_MODES = [
  { id: 'dark', label: 'Night', description: 'Night-time colours', iconClass: 'mode-icon-dark' },
  { id: 'light', label: 'Day', description: 'Daytime colours', iconClass: 'mode-icon-light' },
  { id: 'system', label: 'Auto', description: 'Follow device time', iconClass: 'mode-icon-system' },
] as const;

const ACCENTS = [
  { id: 'blue', label: 'Blue' }, { id: 'violet', label: 'Violet' }, { id: 'pink', label: 'Pink' },
  { id: 'red', label: 'Red' }, { id: 'orange', label: 'Orange' }, { id: 'green', label: 'Green' }, { id: 'teal', label: 'Teal' },
] as const;

const BUILT_IN_BACKGROUNDS = [
  ['plain', 'Plain'], ['parallax', 'Parallax'], ['aurora', 'Aurora'], ['grid', 'Grid'], ['spotlight', 'Spotlight'], ['mesh', 'Mesh'], ['neon', 'Neon'],
  ['dots', 'Dots'], ['rings', 'Rings'], ['hex', 'Hex'], ['waves', 'Waves'], ['diagonal', 'Diagonal'],
  ['circuit', 'Circuit'], ['constellation', 'Constellation'], ['tiles', 'Tiles'],
] as const;

function emit(name: string, detail?: unknown): void {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

function normalizeSettings(value: unknown): AppearanceSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as AppearanceSettings;
}

function normalizeCustomBackgrounds(value: unknown): CustomBackground[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): CustomBackground[] => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const item = entry as Record<string, unknown>;
    if (typeof item.id !== 'string' || !item.id || typeof item.url !== 'string') return [];
    let url: URL;
    try { url = new URL(item.url); } catch { return []; }
    if (url.protocol !== 'https:' && url.protocol !== 'file:') return [];
    return [{
      id: item.id.slice(0, 120),
      name: typeof item.name === 'string' && item.name.trim() ? item.name.trim().slice(0, 120) : 'Custom background',
      type: item.type === 'local' ? 'local' : 'url',
      url: url.href,
    }];
  }).slice(-32);
}

function backgroundImage(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'file:') return undefined;
    // URL parsing normalizes control characters and encodes unsafe path bytes.
    const safe = parsed.href.replace(/\\/g, '%5C').replace(/"/g, '%22').replace(/[\r\n]/g, '');
    return `linear-gradient(135deg, rgba(0,0,0,.16), rgba(0,0,0,.02)), url("${safe}")`;
  } catch { return undefined; }
}

function HomepageStylePreview({ styleId }: { styleId: string }) {
  const previewRef = useRef<HTMLSpanElement>(null);
  const [artScale, setArtScale] = useState(1);
  useEffect(() => {
    const element = previewRef.current;
    if (!element) return;
    const updateScale = () => {
      const width = element.clientWidth;
      if (width < 1) return;
      const next = width / 320;
      setArtScale((current) => Math.abs(current - next) < 0.001 ? current : next);
    };
    updateScale();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateScale);
      return () => window.removeEventListener('resize', updateScale);
    }
    const observer = new ResizeObserver(updateScale);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const tileSet = <><i /><i /><i /><i /><i /><i /></>;
  let artwork: ReactElement;
  switch (styleId) {
    case 'legacy':
      artwork = <>
        <span className="hp-legacy-brand"><i>M</i><b>Mad Station</b><em /></span>
        <span className="hp-legacy-companions"><small>COMPANIONS</small>{[0, 1, 2, 3].map((n) => <i key={n}><b /> <em /></i>)}</span>
        <span className="hp-legacy-core"><i className="hp-legacy-ring hp-legacy-ring-a" /><i className="hp-legacy-ring hp-legacy-ring-b" /><b>M</b><small>AI HUB</small></span>
        <span className="hp-legacy-widgets"><small>SYSTEM</small><i /><i /><i /></span>
      </>;
      break;
    case 'v2':
      artwork = <>
        <span className="hp-simple-header"><i>M</i><b>Mad Station</b><span className="hp-simple-search"><i />Find an app…<b>/</b></span><span className="hp-simple-actions"><i /><i /><i /></span></span>
        <span className="hp-simple-greeting"><b>Welcome back</b><i /><small>DRAG ANY APP TO REARRANGE</small></span>
        <span className="hp-simple-app-grid">
          <i><b>✳</b><strong>AI Hub</strong><em>ACCOUNTS · SESSIONS</em></i>
          <i><b>✎</b><strong>Prompt Studio</strong><em>REFINE · STRUCTURE</em></i>
          <i><b>⌘</b><strong>AI Playground</strong><em>ARENA · API</em></i>
          <i><b>▹</b><strong>Video Hub</strong><em>GENERATE · EDIT</em></i>
          <i><b>▧</b><strong>Image Hub</strong><em>CREATE · UPSCALE</em></i>
          <i><b>✓</b><strong>Notes &amp; Tasks</strong><em>NOTES · CHECKLISTS</em></i>
        </span>
      </>;
      break;
    case 'retro':
      artwork = <>
        <span className="hp-retro-shell">
          <span className="hp-retro-title"><i /> MAD STATION.EXE <b>C:\MAD&gt; _ □ ×</b></span>
          <span className="hp-retro-terminal">
            <span className="hp-retro-main-window"><small>C:\MADSTATION\HOME</small><b>AI HUB</b><i>M</i><em>OPEN WORKSPACE ↗</em></span>
            <span className="hp-retro-rail"><small>DESKTOP</small><i><b /> PROMPT STUDIO</i><i><b /> AI PLAYGROUND</i><i><b /> SYSTEM TOOLS</i><em>› READY</em></span>
            <span className="hp-retro-sys"><b>SYSMON</b><i /><i /><em>RAM&nbsp; CPU</em></span>
          </span>
          <span className="hp-retro-scanlines" />
        </span>
      </>;
      break;
    case 'retro-complex':
      artwork = <>
        <span className="hp-crt-wall" />
        <span className="hp-crt-window"><i className="hp-crt-stars" /><i className="hp-crt-moon" /><i className="hp-crt-hills hp-crt-hills-back" /><i className="hp-crt-hills hp-crt-hills-front" /><i className="hp-crt-mullion-v" /><i className="hp-crt-mullion-h" /></span>
        <span className="hp-crt-lamp"><i className="hp-crt-lamp-cone" /><i className="hp-crt-lamp-shade" /><i className="hp-crt-lamp-bulb" /></span>
        <span className="hp-crt-diskbox"><b>DISK BOX</b><span className="hp-crt-floppies">{[0, 1, 2, 3, 4, 5].map((n) => <i key={n} />)}</span><em>6 DISKS</em></span>
        <span className="hp-crt-case"><i className="hp-crt-vent" /><span className="hp-crt-bezel"><span className="hp-crt-screen"><small>C:\MADSTATION\HOME</small><b>AI HUB</b><span><i /><i /><i /></span><em>OPEN WORKSPACE ↗</em></span></span><span className="hp-crt-controls"><i /><i /><b /></span></span>
        <span className="hp-crt-desk-top" /><span className="hp-crt-desk-front"><i /><i /></span>
        <span className="hp-crt-system"><b>SYS MON</b><span><i /><i /></span><em>RAM · CPU</em></span>
        <span className="hp-crt-drive"><small>A:</small><i className="hp-crt-drive-slot" /><i className="hp-crt-drive-eject" /></span>
      </>;
      break;
    case 'parallax':
      artwork = <>
        <span className="hp-para-depth hp-para-depth-a" /><span className="hp-para-depth hp-para-depth-b" /><span className="hp-para-ring" /><span className="hp-para-orb" />
        <span className="hp-para-header"><i /><b>MAD STATION</b><em /></span>
        <span className="hp-para-grid">{tileSet}</span>
        <span className="hp-para-system"><b><i /> LIVE SYSTEM</b><span><small>APP MEMORY</small><em><i /></em></span><span><small>CPU LOAD</small><em><i /></em></span><span className="hp-para-spark"><i /><i /><i /><i /><i /><i /><i /><i /></span></span>
        <span className="hp-para-floor" />
      </>;
      break;
    case 'parallax-big':
      artwork = <>
        <span className="hp-pbig-depth" /><span className="hp-pbig-header"><i /><b>MAD STATION</b><em /></span>
        <span className="hp-pbig-stage"><small>MAIN APP · READY</small><b>AI HUB</b><i>✳</i><span>Accounts · Providers · Sessions</span><em>OPEN WORKSPACE ↗</em></span>
        <span className="hp-pbig-rail"><small>MORE APPS</small><i /><i /><i /><i /></span>
        <span className="hp-pbig-metrics"><b>LIVE SYSTEM</b><span><i /><em>RAM</em></span><span><i /><em>CPU</em></span></span>
      </>;
      break;
    case 'galaxy':
      artwork = <>
        <span className="hp-galaxy-nebula" /><span className="hp-galaxy-spark hp-galaxy-spark-a" /><span className="hp-galaxy-spark hp-galaxy-spark-b" /><span className="hp-galaxy-spark hp-galaxy-spark-c" /><span className="hp-galaxy-brand"><i /> MAD STATION <em /></span>
        <span className="hp-galaxy-speed">ORBIT SPEED <i /><b>35%</b></span>
        <span className="hp-galaxy-orbit hp-galaxy-orbit-a" /><span className="hp-galaxy-orbit hp-galaxy-orbit-b" /><span className="hp-galaxy-orbit hp-galaxy-orbit-c" />
        <span className="hp-galaxy-sun" /><span className="hp-galaxy-planet hp-galaxy-planet-a" /><span className="hp-galaxy-planet hp-galaxy-planet-b" /><span className="hp-galaxy-planet hp-galaxy-planet-c" /><span className="hp-galaxy-planet hp-galaxy-planet-d" /><span className="hp-galaxy-planet hp-galaxy-planet-e" />
        <span className="hp-galaxy-info"><small>SELECTED WORLD</small><b>AI HUB</b><i /><em>OPEN WORKSPACE ↗</em></span>
        <span className="hp-galaxy-system"><b>LIVE SYSTEM</b><span className="hp-galaxy-gauges"><i className="hp-galaxy-gauge hp-galaxy-gauge-ram"><b>68</b><em>RAM</em></i><i className="hp-galaxy-gauge hp-galaxy-gauge-cpu"><b>24</b><em>CPU</em></i></span></span>
      </>;
      break;
    case 'parallax-jungle':
      artwork = <>
        <span className="hp-jungle-leaf hp-jungle-leaf-a" /><span className="hp-jungle-leaf hp-jungle-leaf-b" /><span className="hp-jungle-leaf hp-jungle-leaf-c" /><span className="hp-jungle-leaf hp-jungle-leaf-d" /><span className="hp-jungle-mist" />
        <span className="hp-jungle-brand"><i /> MAD STATION <em /></span><span className="hp-jungle-season"><i /> SPRING <b>☼</b></span>
        <span className="hp-jungle-portal"><i>✳</i><b>AI HUB</b><em>ENTER WORKSPACE</em></span>
        <span className="hp-jungle-info"><small>SELECTED APP</small><b>AI HUB</b><i /><em>OPEN ↗</em></span>
        <span className="hp-jungle-system"><b>LIVE SYSTEM</b><i /><i /><em>RAM · CPU</em></span>
        <span className="hp-jungle-dock">{[0, 1, 2, 3, 4, 5].map((n) => <i key={n} />)}</span><span className="hp-jungle-vines" />
      </>;
      break;
    case 'claymorphism':
      artwork = <>
        <span className="hp-clay-header"><i>M</i><b>Mad Station</b><em>☼</em><span className="hp-clay-search">⌕ Search apps</span><span className="hp-clay-knobs"><i /><i /></span></span>
        <span className="hp-clay-title"><b>Welcome back!</b><i /></span>
        <span className="hp-clay-main"><b>AI HUB</b><i>✳</i><em>Open workspace</em></span>
        <span className="hp-clay-system"><b>LIVE SYSTEM</b><span><i /><i /></span><em><i /><i /><i /><i /><i /></em></span>
        <span className="hp-clay-tiles">{tileSet}</span>
      </>;
      break;
    case 'glass':
      artwork = <>
        <span className="hp-glass-glow hp-glass-glow-a" /><span className="hp-glass-glow hp-glass-glow-b" />
        <span className="hp-glass-header"><i /> MAD STATION <em>•••</em></span>
        <span className="hp-glass-main"><small>YOUR WORKSPACE</small><b>AI HUB</b><i>✳</i><em>Open app →</em></span>
        <span className="hp-glass-side"><i /><i /><i /></span>
        <span className="hp-glass-system"><b>LIVE SYSTEM</b><i /><i /><em /></span>
        <span className="hp-glass-dock">{[0, 1, 2, 3, 4].map((n) => <i key={n} />)}</span>
      </>;
      break;
    case 'isometric-world':
      artwork = <>
        <span className="hp-iso-atmosphere" />
        <svg className="hp-iso-scene" viewBox="0 0 320 180" role="presentation" focusable="false">
          <defs>
            <linearGradient id="hpIsoFront" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#477a68"/><stop offset="1" stopColor="#18332f"/></linearGradient>
            <linearGradient id="hpIsoGlow" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#9fb8ff"/><stop offset="1" stopColor="#675cdb"/></linearGradient>
          </defs>
          <ellipse className="hp-iso-shadow" cx="160" cy="133" rx="111" ry="22" />
          <polygon className="hp-iso-bottom" points="62,94 160,50 258,94 160,140" />
          <polygon className="hp-iso-side-left" points="62,94 160,140 160,157 62,110" />
          <polygon className="hp-iso-side-right" points="160,140 258,94 258,110 160,157" />
          <polygon className="hp-iso-strata" points="62,105 160,151 258,105 258,111 160,163 62,111" />
          <polygon className="hp-iso-ground" points="62,87 160,42 258,87 160,133" />
          <path className="hp-iso-path" d="M93 91 L129 107 L159 94 L190 108 L224 91" />
          <path className="hp-iso-path-dash" d="M128 68 L160 83 L190 69" />
          <g className="hp-iso-tree"><polygon points="86,77 96,72 106,77 96,82"/><polygon points="86,77 96,82 96,96 86,91"/><polygon points="96,82 106,77 106,91 96,96"/><polygon points="84,68 96,58 108,68 96,78"/><polygon points="88,62 96,54 104,62 96,70"/></g>
          <g className="hp-iso-tree hp-iso-tree-b"><polygon points="211,78 220,74 229,78 220,83"/><polygon points="211,78 220,83 220,96 211,91"/><polygon points="220,83 229,78 229,91 220,96"/><polygon points="208,68 220,59 232,68 220,77"/><polygon points="212,62 220,55 228,62 220,70"/></g>
          <g className="hp-iso-building hp-iso-building-hub">
            <polygon className="hp-iso-roof" points="141,62 160,52 179,62 160,72"/>
            <polygon className="hp-iso-left" points="141,62 160,72 160,98 141,88"/>
            <polygon className="hp-iso-right" points="160,72 179,62 179,88 160,98"/>
            <polygon className="hp-iso-roof-detail" points="148,62 160,56 172,62 160,69"/>
            <path className="hp-iso-window" d="M148 72 l6 3 v7 l-6 -3 z M165 77 l6 -3 v7 l-6 3 z M148 82 l6 3 v2 l-6 -3 z M165 87 l6 -3 v2 l-6 3 z"/>
          </g>
          <g className="hp-iso-building hp-iso-building-a">
            <polygon className="hp-iso-roof" points="111,80 124,73 137,80 124,87"/>
            <polygon className="hp-iso-left" points="111,80 124,87 124,105 111,98"/>
            <polygon className="hp-iso-right" points="124,87 137,80 137,98 124,105"/>
            <path className="hp-iso-window" d="M115 84 l5 3 v5 l-5 -3 z M128 91 l5 -3 v5 l-5 3 z"/>
          </g>
          <g className="hp-iso-building hp-iso-building-b">
            <polygon className="hp-iso-roof" points="183,83 197,76 211,83 197,90"/>
            <polygon className="hp-iso-left" points="183,83 197,90 197,106 183,99"/>
            <polygon className="hp-iso-right" points="197,90 211,83 211,99 197,106"/>
            <path className="hp-iso-window" d="M187 87 l5 3 v5 l-5 -3 z M201 94 l5 -3 v5 l-5 3 z"/>
          </g>
          <circle className="hp-iso-beacon" cx="160" cy="49" r="3" />
          <path className="hp-iso-beacon-line" d="M160 52 V43" />
        </svg>
        <span className="hp-iso-plaque"><i>M</i><span><b>MAD STATION</b><small>ISOMETRIC WORLD</small></span><em /></span>
        <span className="hp-iso-toolstrip"><i>◉</i><i>＋</i><i>↗</i></span>
        <span className="hp-iso-status"><i /> DRAG TO ORBIT <b>DAY / NIGHT</b></span>
        <span className="hp-iso-caption"><small>SELECTED BUILDING</small><b>AI HUB</b><em>ENTER WORKSPACE ↗</em></span>
      </>;
      break;
    default:
      artwork = <span className="hp-simple-app-grid">{tileSet}</span>;
  }
  return <span ref={previewRef} className={`homepage-style-preview homepage-style-preview--${styleId}`} aria-hidden="true"><span className="homepage-style-preview-art" style={{ transform: `scale(${artScale})` }}>{artwork}</span></span>;
}

type HomepageStyleOption = {
  id: string;
  label: string;
  description: string;
};
type ImportedHomepageCatalog = {
  customThemes?: Array<{ mode?: unknown; title?: unknown; description?: unknown; entryUrl?: unknown; channel?: unknown }>;
};

function HomepageStylesGrid({}: { settings: AppearanceSettings }) {
  const [current, setCurrent] = useState(readHomepageStyle);
  const [styles, setStyles] = useState<HomepageStyleOption[]>([...HOMEPAGE_STYLES]);
  useEffect(() => {
    let mounted = true;
    const applyCatalog = (raw: unknown) => {
      const envelope = raw && typeof raw === 'object' ? raw as { catalog?: unknown; ok?: unknown } : null;
      if (envelope?.ok === false) return;
      const catalog = (envelope?.catalog && typeof envelope.catalog === 'object' ? envelope.catalog : raw) as ImportedHomepageCatalog | null;
      if (!catalog || typeof catalog !== 'object') return;
      const custom = (Array.isArray(catalog.customThemes) ? catalog.customThemes : []).filter((item) =>
        typeof item?.mode === 'string' && /^custom-[a-z0-9-]{1,64}$/.test(item.mode)
          && typeof item.entryUrl === 'string' && item.entryUrl.startsWith('file:')
          && typeof item.channel === 'string' && /^madstation-home-[a-z0-9-]{1,90}$/.test(item.channel),
      ).map((item) => ({
        id: item.mode as string,
        label: typeof item.title === 'string' ? item.title.slice(0, 100) : String(item.mode),
        description: typeof item.description === 'string' ? item.description.slice(0, 240) : 'Imported custom homepage.',
      }));
      const nextStyles = [...HOMEPAGE_STYLES, ...custom];
      if (mounted) {
        setStyles(nextStyles);
        const saved = readHomepageStyle();
        setCurrent(saved === 'legacy' ? 'legacy' : nextStyles.some((style) => style.id === saved) ? saved : 'v2');
      }
    };
    const receiveImported = (event: Event) => applyCatalog((event as CustomEvent<unknown>).detail);
    window.addEventListener('madstation:theme-imported', receiveImported);
    try {
      const pending = window.aiHub?.getImportedThemeCatalog?.();
      if (pending && typeof pending.then === 'function') pending.then((result: unknown) => applyCatalog(result)).catch(() => {});
    } catch { /* Built-in homepage options remain available if the import catalogue is unavailable. */ }
    return () => {
      mounted = false;
      window.removeEventListener('madstation:theme-imported', receiveImported);
    };
  }, []);
  useEffect(() => {
    const sync = (event: Event) => {
      const detailMode = (event as CustomEvent<{ mode?: unknown }>).detail?.mode;
      const candidate = event.type === 'madstation:homepage-fallback'
        ? 'legacy'
        : typeof detailMode === 'string' ? detailMode : readHomepageStyle();
      setCurrent(candidate === 'legacy' ? 'legacy' : styles.some((style) => style.id === candidate) ? candidate : 'v2');
    };
    window.addEventListener('madstation:homepage-changed', sync);
    window.addEventListener('madstation:homepage-fallback', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('madstation:homepage-changed', sync);
      window.removeEventListener('madstation:homepage-fallback', sync);
      window.removeEventListener('storage', sync);
    };
  }, [styles]);

  return <>
    {styles.map((style) => {
      const active = current === style.id;
      return <button key={style.id} className={`homepage-style-card ${active ? 'active' : ''}`} data-homepage-style={style.id} data-theme-item={style.id} type="button" aria-pressed={active} onClick={() => emit('madstation:homepage-style-select', style.id)}>
        <HomepageStylePreview styleId={style.id} />
        <span className="homepage-style-card-copy"><strong>{style.label}</strong><span>{style.description}</span></span>
      </button>;
    })}
  </>;
}

function ThemeModeGrid({ settings }: { settings: AppearanceSettings }) {
  const current = ['dark', 'light', 'system'].includes(settings.theme || '') ? settings.theme : 'dark';
  return <>
    {THEME_MODES.map((mode) => <button key={mode.id} className={`mode-choice ${current === mode.id ? 'active' : ''}`} data-theme-choice={mode.id} type="button" aria-pressed={current === mode.id} onClick={() => emit('madstation:appearance-theme-mode', mode.id)}>
      <span className={`mode-choice-icon ${mode.iconClass}`} />
      <span><strong>{mode.label}</strong><small>{mode.description}</small></span>
    </button>)}
  </>;
}

function AccentGrid({ settings }: { settings: AppearanceSettings }) {
  const custom = typeof settings.accent === 'string' && /^#[0-9a-f]{6}$/i.test(settings.accent) ? settings.accent : null;
  const current = typeof settings.accent === 'string' ? settings.accent : 'blue';
  const resolvedTheme = settings.theme === 'light' ? 'light' : 'dark';
  return <>
    {ACCENTS.map((accent) => {
      const palette = window.MAD_ACCENTS?.[accent.id];
      const choiceColor = palette?.[resolvedTheme]?.[1] || 'var(--accent)';
      const active = !custom && current === accent.id;
      return <button key={accent.id} className="accent-choice" data-accent-choice={accent.id} type="button" aria-label={accent.label} title={accent.label} aria-pressed={active} style={Object.assign({} as CSSProperties, { '--choice-color': choiceColor })} onClick={() => emit('madstation:appearance-accent', accent.id)}>
        <span className="accent-choice-swatch" />
      </button>;
    })}
    <label className={`accent-choice accent-custom-choice ${custom ? 'active' : ''}`} id="customAccentChoice" aria-label="Custom colour" title="Custom colour" aria-pressed={Boolean(custom)} style={Object.assign({} as CSSProperties, { '--custom-accent': custom || '#8ab4ff' })}>
      <span className="accent-choice-swatch custom-accent-swatch">
        <span className="custom-accent-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 0 18h1.1a2.1 2.1 0 0 0 1.5-3.5 1.7 1.7 0 0 1 1.3-2.8h1A4.1 4.1 0 0 0 21 10.6C21 6.4 17 3 12 3Z"/><circle cx="7.5" cy="10" r="1"/><circle cx="11.5" cy="7.2" r="1"/><circle cx="16" cy="9" r="1"/><path d="M17.5 15.5v5m-2.5-2.5h5"/></svg></span>
      </span>
      <input aria-label="Custom accent colour" id="customAccentPicker" type="color" value={custom || '#8ab4ff'} onChange={(event) => emit('madstation:appearance-custom-accent', event.currentTarget.value.toLowerCase())} />
    </label>
  </>;
}

function BackgroundLibrary({ settings }: { settings: AppearanceSettings }) {
  const customBackgrounds = normalizeCustomBackgrounds(settings.customBackgrounds);
  const activeId = settings.backgroundStyle === 'custom' ? `custom:${settings.backgroundId || ''}` : settings.backgroundStyle || 'plain';
  const builtIns = BUILT_IN_BACKGROUNDS.map(([id, label]) => {
    const active = activeId === id;
    return <button key={id} className={`background-option ${active ? 'active' : ''}`} type="button" data-background-key={id} aria-pressed={active} title={label} onClick={() => emit('madstation:appearance-background-select', { style: id, id: '' })}>
      <span className="background-option-thumb" data-background-preview={id} aria-hidden="true" />
      <span className="background-option-copy"><strong>{label}</strong><small>Default</small></span>
    </button>;
  });
  const custom = customBackgrounds.map((item) => {
    const key = `custom:${item.id}`;
    const active = activeId === key;
    const style = backgroundImage(item.url);
    return <div className="background-option-wrap" key={item.id}>
      <button className={`background-option ${active ? 'active' : ''}`} type="button" data-background-key={key} aria-pressed={active} title={item.name} onClick={() => emit('madstation:appearance-background-select', { style: 'custom', id: item.id })}>
        <span className="background-option-thumb background-option-thumb--custom" data-background-image={item.url} aria-hidden="true" style={style ? { backgroundImage: style } : undefined} />
        <span className="background-option-copy"><strong>{item.name}</strong><small>{item.type === 'local' ? 'Computer' : 'URL'}</small></span>
      </button>
      <button className="background-remove" type="button" data-remove-background={item.id} aria-label={`Remove ${item.name}`} title="Remove background" onClick={() => emit('madstation:appearance-background-remove', item.id)}>×</button>
    </div>;
  });
  return <>{builtIns}{custom}</>;
}

const mountPoints = [
  ['homepageStyles', HomepageStylesGrid],
  ['themeOptions', ThemeModeGrid],
  ['accentOptions', AccentGrid],
  ['backgroundLibrary', BackgroundLibrary],
] as const;

const roots: Array<{ root: Root; Component: (props: { settings: AppearanceSettings }) => ReactElement }> = [];
for (const [id, Component] of mountPoints) {
  const element = document.getElementById(id);
  if (element) roots.push({ root: createRoot(element), Component });
}

function renderAppearanceSettings(raw: unknown): void {
  const settings = normalizeSettings(raw);
  for (const mounted of roots) mounted.root.render(<mounted.Component settings={settings} />);
}

window.addEventListener('madstation:appearance-settings', (event) => {
  renderAppearanceSettings((event as CustomEvent<unknown>).detail);
});
window.dispatchEvent(new Event('madstation:appearance-controls-ready'));

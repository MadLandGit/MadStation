import { createRoot, type Root } from 'react-dom/client';
import { useEffect, type CSSProperties, type ReactElement, type ReactNode } from 'react';

type SettingsSnapshot = {
  settings?: Record<string, unknown> & { security?: Record<string, unknown> };
};

type AppSettingKey = 'density' | 'cardSpacing' | 'borderSpacing' | 'pageZoom' | 'surfaceStyle' | 'cornerStyle' | 'buttonCorner' | 'buttonBackground' | 'borderStyle' | 'shadowStyle' | 'reduceMotion' | 'animateHover' | 'showStatusBar' | 'confirmAccountDeletion';
type AppearanceAction =
  | { type: 'app-setting'; key: AppSettingKey; value: string | number | boolean }
  | { type: 'security-setting'; key: 'remoteIcons'; value: boolean }
  | { type: 'open-icon-folder' }
  | { type: 'refresh-icons' };

const CHOICES = {
  density: ['comfortable', 'compact'],
  cardSpacing: ['compact', 'comfortable', 'spacious'],
  borderSpacing: ['compact', 'comfortable', 'spacious'],
  pageZoom: [80, 90, 100, 110, 125, 150],
  surfaceStyle: ['solid', 'glass', 'elevated', 'frosted'],
  cornerStyle: ['soft', 'sharp', 'square', 'ultra'],
  buttonCorner: ['soft', 'pill', 'square', 'sharp', 'glass', 'neon'],
  buttonBackground: ['solid', 'outline', 'ghost', 'contrast', 'glass', 'neon', 'text'],
  borderStyle: ['subtle', 'balanced', 'strong', 'neon', 'neon2', 'glass', 'none'],
  shadowStyle: ['none', 'soft', 'strong', 'neon', 'glass'],
} as const;

function emit(action: AppearanceAction): void {
  window.dispatchEvent(new CustomEvent('madstation:remaining-settings-action', { detail: action }));
}
function normalizeSnapshot(value: unknown): SettingsSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  const settings = raw.settings && typeof raw.settings === 'object' && !Array.isArray(raw.settings)
    ? raw.settings as SettingsSnapshot['settings'] : {};
  return { settings };
}
function activeValue(settings: Record<string, unknown>, key: keyof typeof CHOICES): string {
  const choices = CHOICES[key] as readonly (string | number)[];
  const value = settings[key];
  return choices.includes(value as never) ? String(value) : String(key === 'pageZoom' ? 100 : choices[0]);
}

function OptionGroup({
  title, description, settingKey, settings, options, preview,
}: {
  title: string;
  description: string;
  settingKey: keyof typeof CHOICES;
  settings: Record<string, unknown>;
  options: readonly (string | number)[];
  preview?: ReactElement;
}) {
  const selected = activeValue(settings, settingKey);
  return <div className="row" data-q={`${title} ${description} ${options.join(' ')}`}>
    <span className="row-copy"><strong>{title}</strong><span>{description}</span></span>
    {preview}
    <div className="segmented ms-tabs" role="group" aria-label={title}>
      {options.map((value) => <button key={String(value)} className={`ms-tab ${selected === String(value) ? 'active' : ''}`} type="button" data-value={String(value)} aria-pressed={selected === String(value)} onClick={() => emit({ type: 'app-setting', key: settingKey, value })}>{settingKey === 'pageZoom' ? `${value}%` : String(value).replace(/^./, (char) => char.toUpperCase())}</button>)}
    </div>
  </div>;
}

function ToggleSetting({
  title, description, settingKey, checked,
}: { title: string; description: string; settingKey: 'reduceMotion' | 'animateHover' | 'showStatusBar'; checked: boolean }) {
  return <label className="row toggle" data-q={`${title} ${description}`}>
    <span className="row-copy"><strong>{title}</strong><span>{description}</span></span>
    <span className="switch"><input type="checkbox" data-appearance-setting={settingKey} checked={checked} onChange={(event) => emit({ type: 'app-setting', key: settingKey, value: event.currentTarget.checked })}/><span className="knob"/></span>
  </label>;
}

function SidebarAppearancePanel({ settings }: { settings: Record<string, unknown> }) {
  return <section className="card ms-card ms-card--flat span-2">
    <header className="card-head ms-card-head"><span className="card-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-1 1.5-2.2-.5-1.2.3-2.3.3-2.3H17a4 4 0 0 0 4-4C21 6.9 17 3 12 3z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7.5" r="1"/><circle cx="14.5" cy="7.5" r="1"/></svg></span><div><h3>Sidebar</h3><p>Choose how accounts are arranged in the AI Hub sidebar.</p></div></header>
    <div className="card-body"><OptionGroup title="Sidebar style" description="Choose a full account list or a compact icon grid." settingKey="density" settings={settings} options={CHOICES.density} /></div>
  </section>;
}

function AccountSafetyPanel({ settings }: { settings: Record<string, unknown> }) {
  return <section className="card ms-card ms-card--flat span-2">
    <header className="card-head ms-card-head"><span className="card-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3l8 3v6c0 5-3.3 8.5-8 9-4.7-.5-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/></svg></span><div><h3>Account safety</h3><p>Prevent accidental removal of saved AI Hub logins.</p></div></header>
    <div className="card-body"><label className="row toggle" data-q="Confirm account deletion remove saved login session"><span className="row-copy"><strong>Confirm before deleting an account</strong><span>Ask before removing an account and its saved login.</span></span><span className="switch"><input id="confirmAccountDeletionReact" type="checkbox" checked={settings.confirmAccountDeletion !== false} onChange={(event) => emit({ type: 'app-setting', key: 'confirmAccountDeletion', value: event.currentTarget.checked })}/><span className="knob"/></span></label></div>
  </section>;
}

function BuiltInShortcutsPanel() {
  const shortcuts = [
    { title: 'Focus search', description: 'Jump to the account search box', keys: 'Ctrl K', query: 'Focus search Ctrl K' },
    { title: 'Lock Mad Station', description: 'Needs an app password', keys: 'Ctrl Shift L', query: 'Lock Mad Station Ctrl Shift L' },
    { title: 'Back / Forward', description: 'Inside the open website', keys: 'Alt ← / →', query: 'Back forward Alt Left Right' },
    { title: 'Reload', description: 'Reload the open website', keys: 'Ctrl R / F5', query: 'Reload Ctrl R F5' },
  ];
  return <section className="card ms-card ms-card--flat span-2">
    <header className="card-head ms-card-head"><span className="card-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><rect height="12" rx="2" width="18" x="3" y="6"/><path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10"/></svg></span><div><h3>Built-in shortcuts</h3><p>These always work and cannot be changed.</p></div></header>
    <div className="card-body">{shortcuts.map((item) => <div key={item.title} className="row static" data-q={item.query}><span className="row-copy"><strong>{item.title}</strong><span>{item.description}</span></span><kbd>{item.keys}</kbd></div>)}</div>
  </section>;
}

function GlobalAppearanceAdvanced({ settings }: { settings: Record<string, unknown> }) {
  const zoom = Number(CHOICES.pageZoom.includes(settings.pageZoom as never) ? settings.pageZoom : 100);
  const security = settings.security && typeof settings.security === 'object' ? settings.security as Record<string, unknown> : {};
  return <>
    <section className="card ms-card ms-card--flat span-2">
      <header className="card-head ms-card-head"><span className="card-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></svg></span><div><h3>Layout &amp; display</h3><p>Control spacing, page zoom and how the interface is arranged.</p></div></header>
      <div className="card-body">
        <OptionGroup title="Card spacing" description="Control the space between the main cards throughout Mad Station." settingKey="cardSpacing" settings={settings} options={CHOICES.cardSpacing} preview={<div aria-label="Card spacing preview" className="setting-preview" data-preview="spacing"><span className="preview-card-spacing-scene"><i/><i/><i/></span></div>} />
        <OptionGroup title="Border spacing" description="Control the space between bordered setting rows when Border emphasis is visible." settingKey="borderSpacing" settings={settings} options={CHOICES.borderSpacing} preview={<div aria-label="Border spacing preview" className="setting-preview" data-preview="border-spacing"><span className="preview-border-spacing-scene"><i/><i/><i/></span></div>} />
        <div className="row stack" data-q="Page zoom size"><span className="row-copy"><strong>Page zoom</strong><span>Default zoom for every website</span></span><div aria-label="Page zoom preview" className="setting-preview setting-preview-zoom" data-preview="zoom" style={{ '--preview-zoom': String(zoom / 100) } as CSSProperties}><span className="preview-a4"><span className="preview-a4-title">A4</span><span className="preview-a4-lines"><i/><i/><i/><i/></span></span></div><div className="segmented ms-tabs" role="group" aria-label="Page zoom">{CHOICES.pageZoom.map((value) => <button key={value} className={`ms-tab ${zoom === value ? 'active' : ''}`} type="button" data-value={String(value)} aria-pressed={zoom === value} onClick={() => emit({ type: 'app-setting', key: 'pageZoom', value })}>{value}%</button>)}</div></div>
      </div>
    </section>
    <section className="card ms-card ms-card--flat span-2">
      <header className="card-head ms-card-head"><span className="card-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 7h14M5 12h14M5 17h14"/><circle cx="9" cy="7" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="11" cy="17" r="2"/></svg></span><div><h3>Behavior &amp; feedback</h3><p>Control motion, interaction effects and small status indicators across Mad Station.</p></div></header>
      <div className="card-body"><ToggleSetting title="Reduce motion" description="Turn off animations and transitions" settingKey="reduceMotion" checked={Boolean(settings.reduceMotion)}/><ToggleSetting title="Animate hover effects" description="Keep small lift and highlight animations on interactive elements." settingKey="animateHover" checked={settings.animateHover !== false}/><ToggleSetting title="Show status information" description="Keep small readiness and state indicators visible where supported." settingKey="showStatusBar" checked={settings.showStatusBar !== false}/></div>
    </section>
    <section className="card ms-card ms-card--flat span-2">
      <header className="card-head ms-card-head"><span className="card-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><rect height="16" rx="3" width="18" x="3" y="4"/><path d="M3 9h18M8 4v16"/></svg></span><div><h3>Visual style</h3><p>Fine-tune the overall personality of Mad Station. Changes apply instantly.</p></div></header>
      <div className="card-body">
        <OptionGroup title="Surface style" description="Choose solid panels, glass surfaces, elevated cards, or frosted translucency." settingKey="surfaceStyle" settings={settings} options={CHOICES.surfaceStyle} preview={<div aria-label="Surface style preview" className="setting-preview" data-preview="surface"><span className="preview-surface-card">Surface</span></div>} />
        <OptionGroup title="Card corner style" description="Control how rounded cards, tiles and dialogs feel, from soft to completely square." settingKey="cornerStyle" settings={settings} options={CHOICES.cornerStyle} preview={<div aria-label="Card corner style preview" className="setting-preview" data-preview="corner"><span className="preview-corner-box">Card</span></div>} />
        <OptionGroup title="Button corner" description="Choose the shape of buttons independently from their background." settingKey="buttonCorner" settings={settings} options={CHOICES.buttonCorner} preview={<div aria-label="Button corner preview" className="setting-preview" data-preview="button"><button className="preview-shape-button" tabIndex={-1} type="button">Preview</button></div>} />
        <OptionGroup title="Button background" description="Choose the button fill and treatment independently from its shape." settingKey="buttonBackground" settings={settings} options={CHOICES.buttonBackground} preview={<div aria-label="Button background preview" className="setting-preview" data-preview="button-background"><button className="preview-background-button" tabIndex={-1} type="button">Preview</button></div>} />
        <OptionGroup title="Border emphasis" description="Control how visible card and panel edges are, including neon and glass treatments." settingKey="borderStyle" settings={settings} options={CHOICES.borderStyle} preview={<div aria-label="Border emphasis preview" className="setting-preview" data-preview="border"><span className="preview-border-card">Border</span></div>} />
        <OptionGroup title="Shadow style" description="Control the amount and character of depth behind cards." settingKey="shadowStyle" settings={settings} options={CHOICES.shadowStyle} preview={<div aria-label="Shadow style preview" className="setting-preview" data-preview="shadow"><span className="preview-shadow-card">Depth</span></div>} />
      </div>
    </section>
    <section className="card ms-card ms-card--flat span-2 no-fill">
      <header className="card-head ms-card-head"><span className="card-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><rect height="16" rx="3" width="18" x="3" y="4"/><circle cx="9" cy="10" r="1.6"/><path d="M4 18l5-5 4 4 3-3 4 4"/></svg></span><div><h3>Provider icons</h3><p>Add your own PNG, JPG, WebP, GIF or ICO images.</p></div></header>
      <div className="card-body"><div className="row" data-q="Provider icon folder"><span className="row-copy"><strong>Icon folder</strong><span>Name a file after the provider, e.g. <code>claude.png</code>, then refresh.</span></span><span className="row-actions"><button className="ms-btn" type="button" onClick={() => emit({ type: 'open-icon-folder' })}>Open folder</button><button className="ms-btn ms-btn--sm" type="button" onClick={() => emit({ type: 'refresh-icons' })}>Refresh</button></span></div>
        <label className="row toggle" data-q="Load website icons from the internet When off, Mad Station makes no network requests for icons. Icons you picked from a file still work."><span className="row-copy"><strong>Load website icons from the internet</strong><span>When off, Mad Station makes no network requests for icons. Icons you picked from a file still work.</span></span><span className="switch"><input type="checkbox" data-appearance-security="remoteIcons" checked={security.remoteIcons !== false} onChange={(event) => emit({ type: 'security-setting', key: 'remoteIcons', value: event.currentTarget.checked })}/><span className="knob"/></span></label>
      </div>
    </section>
  </>;
}

function BuiltInShortcutsMount() { return <BuiltInShortcutsPanel />; }
function RenderedPanel({ snapshot, children }: { snapshot: SettingsSnapshot; children: ReactNode }) {
  useEffect(() => { window.dispatchEvent(new Event('madstation:global-settings-panels-rendered')); }, [snapshot]);
  return <>{children}</>;
}
function RemainingPanel({ snapshot, kind }: { snapshot: SettingsSnapshot; kind: 'sidebar' | 'safety' | 'appearance' }) {
  const settings = snapshot.settings || {};
  if (kind === 'sidebar') return <SidebarAppearancePanel settings={settings}/>;
  if (kind === 'safety') return <AccountSafetyPanel settings={settings}/>;
  return <GlobalAppearanceAdvanced settings={settings}/>;
}
type PanelKind = 'sidebar' | 'safety' | 'appearance';
const mountConfig: Array<{ id: string; kind: PanelKind | 'shortcuts' }> = [
  { id: 'aiHubSidebarAppearanceReactMount', kind: 'sidebar' },
  { id: 'accountSafetyReactMount', kind: 'safety' },
  { id: 'builtInShortcutsReactMount', kind: 'shortcuts' },
  { id: 'globalAppearanceAdvancedReactMount', kind: 'appearance' },
];
const roots: Array<{ root: Root; kind: PanelKind | 'shortcuts' }> = [];
for (const item of mountConfig) {
  const mount = document.getElementById(item.id);
  if (mount) roots.push({ root: createRoot(mount), kind: item.kind });
}
let latestSnapshot: SettingsSnapshot = {};
function renderSnapshot(value: unknown): void {
  latestSnapshot = normalizeSnapshot(value);
  for (const mounted of roots) {
    if (mounted.kind === 'shortcuts') mounted.root.render(<RenderedPanel snapshot={latestSnapshot}><BuiltInShortcutsMount/></RenderedPanel>);
    else mounted.root.render(<RenderedPanel snapshot={latestSnapshot}><RemainingPanel snapshot={latestSnapshot} kind={mounted.kind}/></RenderedPanel>);
  }
}
window.addEventListener('madstation:appearance-settings', (event) => renderSnapshot((event as CustomEvent<unknown>).detail));
window.dispatchEvent(new Event('madstation:appearance-controls-ready'));
window.dispatchEvent(new Event('madstation:global-settings-panels-rendered'));

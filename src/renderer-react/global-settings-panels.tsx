import { createRoot, type Root } from 'react-dom/client';
import { useEffect, useMemo, type ReactElement } from 'react';

type AudioDevice = { deviceId: string; label: string };
type AccessibilitySettings = {
  textScale?: number;
  highContrast?: boolean;
  focusIndicators?: boolean;
  alwaysShowAccountNames?: boolean;
};
type SettingsSnapshot = {
  settings?: Record<string, unknown> & {
    accessibility?: AccessibilitySettings;
    startupWorkspace?: string;
    audio?: { outputDeviceId?: string };
  };
  audioDevices?: AudioDevice[];
};
type GlobalAction =
  | { type: 'app-setting'; key: 'startMaximized' | 'restoreLastAccount' | 'launchAtLogin'; value: boolean }
  | { type: 'accessibility-setting'; key: 'textScale'; value: number }
  | { type: 'accessibility-setting'; key: 'highContrast' | 'focusIndicators' | 'alwaysShowAccountNames'; value: boolean }
  | { type: 'startup-workspace'; value: string }
  | { type: 'audio-output'; value: string }
  | { type: 'refresh-audio-devices' }
  | { type: 'test-audio-output' };

const WORKSPACES = [
  ['launcher', 'Main page'], ['ai-hub', 'AI Hub'], ['ai-lab', 'AI Playground'],
  ['clipboard', 'Notes & Tasks'], ['instruction-forge', 'Prompt Studio'], ['video-hub', 'Video Hub'],
] as const;
const TEXT_SCALES = [90, 100, 110, 125, 150] as const;
const APP_KEYS = ['startMaximized', 'restoreLastAccount', 'launchAtLogin'] as const;

function emit(action: GlobalAction): void {
  window.dispatchEvent(new CustomEvent('madstation:global-settings-controls-action', { detail: action }));
}
function normalizeSnapshot(value: unknown): SettingsSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  const settings = raw.settings && typeof raw.settings === 'object' && !Array.isArray(raw.settings)
    ? raw.settings as SettingsSnapshot['settings'] : {};
  const devices = Array.isArray(raw.audioDevices) ? raw.audioDevices.flatMap((item): AudioDevice[] => {
    if (!item || typeof item !== 'object') return [];
    const device = item as Record<string, unknown>;
    if (typeof device.deviceId !== 'string' || !device.deviceId) return [];
    return [{ deviceId: device.deviceId, label: typeof device.label === 'string' && device.label ? device.label.slice(0, 180) : 'Audio output' }];
  }).slice(0, 64) : [];
  return { settings, audioDevices: devices };
}

function AccessibilityPanel({ snapshot }: { snapshot: SettingsSnapshot }) {
  const settings = snapshot.settings || {};
  const accessibility = settings.accessibility || {};
  const scale = Number(accessibility.textScale || 100);
  return <section className="card ms-card ms-card--flat span-2">
    <header className="card-head ms-card-head"><span className="card-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M8 12h8M12 8v8"/></svg></span><div><h3>Accessibility</h3><p>Adjust interface scale, contrast, focus visibility and account labels.</p></div></header>
    <div className="card-body">
      <div className="row" data-q="Accessibility text size UI scale"><span className="row-copy"><strong>UI text size</strong><span>Scale Mad Station interface text.</span></span><select className="ms-input" id="accessTextScale" aria-label="UI text size" value={String(TEXT_SCALES.includes(scale as typeof TEXT_SCALES[number]) ? scale : 100)} onChange={(event) => emit({ type: 'accessibility-setting', key: 'textScale', value: Number(event.currentTarget.value) })}>{TEXT_SCALES.map((value) => <option key={value} value={value}>{value}%</option>)}</select></div>
      {([
        ['highContrast', 'High contrast', 'Increase contrast for controls and surfaces.'],
        ['focusIndicators', 'Strong focus indicators', 'Keep keyboard focus outlines highly visible.'],
        ['alwaysShowAccountNames', 'Always show account names', 'Show account labels even in compact icon mode.'],
      ] as const).map(([key, title, description]) => <label className="row toggle" data-q={`${title} accessibility`} key={key}><span className="row-copy"><strong>{title}</strong><span>{description}</span></span><span className="switch"><input type="checkbox" data-access={key} checked={Boolean(accessibility[key])} onChange={(event) => emit({ type: 'accessibility-setting', key, value: event.currentTarget.checked })}/><span className="knob"/></span></label>)}
    </div>
  </section>;
}

function StartupPanel({ snapshot }: { snapshot: SettingsSnapshot }) {
  const settings = snapshot.settings || {};
  return <section className="card ms-card ms-card--flat no-fill">
    <header className="card-head ms-card-head"><span className="card-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3v8M6.3 6.8a8 8 0 1 0 11.4 0"/></svg></span><div><h3>Startup &amp; sessions</h3><p>What happens when Mad Station opens.</p></div></header>
    <div className="card-body">
      {APP_KEYS.map((key) => {
        const labels = {
          startMaximized: ['Start maximized', 'Open the window maximized.'],
          restoreLastAccount: ['Reopen the last account', 'Start on the account you used last instead of the first one.'],
          launchAtLogin: ['Launch when Windows starts', 'Works in the installed version (not with npm start).'],
        } as const;
        const [title, description] = labels[key];
        return <label className="row toggle" data-q={`${title} ${description}`} key={key}><span className="row-copy"><strong>{title}</strong><span>{description}</span></span><span className="switch"><input type="checkbox" data-app={key} checked={Boolean(settings[key])} onChange={(event) => emit({ type: 'app-setting', key, value: event.currentTarget.checked })}/><span className="knob"/></span></label>;
      })}
      <div className="row" data-q="Startup workspace main page AI Hub AI Playground Notes Tasks Prompt Studio"><span className="row-copy"><strong>Startup workspace</strong><span>Open this workspace automatically after Mad Station starts.</span></span><select className="ms-input" id="startupWorkspace" aria-label="Startup workspace" value={WORKSPACES.some(([key]) => key === settings.startupWorkspace) ? settings.startupWorkspace! : 'launcher'} onChange={(event) => emit({ type: 'startup-workspace', value: event.currentTarget.value })}>{WORKSPACES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
      <div className="row static" data-q="Persistent sessions"><span className="row-copy"><strong>Persistent sessions</strong><span>Each account keeps its own cookies and login</span></span><span className="status-chip ms-chip">Always on</span></div>
    </div>
  </section>;
}

function AudioPanel({ snapshot }: { snapshot: SettingsSnapshot }) {
  const devices = snapshot.audioDevices || [];
  const persisted = snapshot.settings?.audio?.outputDeviceId || 'default';
  const selected = devices.some((device) => device.deviceId === persisted) || persisted === 'default' ? persisted : 'default';
  const options = useMemo(() => [{ deviceId: 'default', label: 'System default' }, ...devices.filter((device) => device.deviceId !== 'default')], [devices]);
  return <section className="card ms-card ms-card--flat span-2">
    <header className="card-head ms-card-head"><span className="card-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9.5a4 4 0 0 1 0 5M18.5 7a7.5 7.5 0 0 1 0 10"/></svg></span><div><h3>Speaker / headphones</h3><p>Select the output device for Mad Station audio playback.</p></div><div className="card-action"><button className="ms-btn" id="refreshAudioDevicesBtn" type="button" onClick={() => emit({ type: 'refresh-audio-devices' })}>Refresh devices</button></div></header>
    <div className="card-body">
      <div className="row audio-setting-row" data-q="Speaker output device audio output test playback"><span className="row-copy"><strong>Audio output</strong><span>The speaker/headphone device used for playback.</span></span><select className="ms-input" id="audioOutputDevice" aria-label="Audio output device" value={selected} onChange={(event) => emit({ type: 'audio-output', value: event.currentTarget.value })}>{options.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label}</option>)}</select></div>
      <div className="row audio-test-row" data-q="Test audio output playback speaker headphones"><span className="row-copy"><strong>Test audio output</strong><span>Play a short tone through the selected output device.</span></span><div className="row-actions"><button className="ms-btn" id="testAudioOutputBtn" type="button" onClick={() => emit({ type: 'test-audio-output' })}>Test output</button></div></div>
    </div>
  </section>;
}

const mountConfig = [
  ['globalSettingsAccessibilityReactMount', AccessibilityPanel],
  ['globalSettingsStartupReactMount', StartupPanel],
  ['globalSettingsAudioReactMount', AudioPanel],
] as const;
type PanelComponent = (props: { snapshot: SettingsSnapshot }) => ReactElement;
function PanelMount({ snapshot, Component }: { snapshot: SettingsSnapshot; Component: PanelComponent }) {
  useEffect(() => { window.dispatchEvent(new Event('madstation:global-settings-panels-rendered')); }, [snapshot]);
  return <Component snapshot={snapshot} />;
}
const roots: Array<{ root: Root; Component: PanelComponent }> = [];
for (const [id, Component] of mountConfig) {
  const mount = document.getElementById(id);
  if (mount) roots.push({ root: createRoot(mount), Component });
}
let latestSnapshot: SettingsSnapshot = {};
function renderSnapshot(value: unknown): void {
  latestSnapshot = normalizeSnapshot(value);
  for (const mounted of roots) mounted.root.render(<PanelMount snapshot={latestSnapshot} Component={mounted.Component} />);
}
window.addEventListener('madstation:global-settings-controls', (event) => renderSnapshot((event as CustomEvent<unknown>).detail));
window.dispatchEvent(new Event('madstation:global-settings-controls-mounted'));

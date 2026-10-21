import { createRoot, type Root } from 'react-dom/client';
import { useEffect, useState, type ReactElement } from 'react';

type SecuritySnapshot = { security?: Record<string, unknown>; hasPassword?: boolean };
type DownloadsSnapshot = { settings?: Record<string, unknown>; folderLabel?: string; hasCustomFolder?: boolean };
type DataDiagnosticsSnapshot = {
  releaseFeedUrl?: string;
  diagnosticsSummary?: string;
  diagnosticsSessionState?: string;
  diagnosticsProviderStatus?: string;
  providerCheckBusy?: boolean;
};

type SecurityAction =
  | { type: 'setting'; key: 'lockOnLaunch' | 'lockOnSystemLock' | 'lockOnMinimize' | 'lockOnIdle'; value: boolean }
  | { type: 'idle-minutes'; value: 1 | 5 | 10 | 30 };
type DownloadsAction =
  | { type: 'open-downloads' }
  | { type: 'choose-folder' }
  | { type: 'reset-folder' }
  | { type: 'open-folder' }
  | { type: 'setting'; key: 'askWhereToSave' | 'notifyWhenDone'; value: boolean };
type DataAction =
  | { type: 'open-data-folder' }
  | { type: 'backup' }
  | { type: 'restore' }
  | { type: 'export-accounts' }
  | { type: 'import-accounts' }
  | { type: 'reset-settings' }
  | { type: 'refresh-diagnostics' }
  | { type: 'check-providers' }
  | { type: 'export-diagnostics' }
  | { type: 'check-updates' }
  | { type: 'release-feed-url'; value: string };

function emit<T>(name: string, detail: T): void {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}
function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function useHostSnapshot<T>(eventName: string, readyEvent: string, renderedEvent = true): T {
  const [snapshot, setSnapshot] = useState<T>({} as T);
  useEffect(() => {
    const receive = (event: Event) => setSnapshot((event as CustomEvent<unknown>).detail as T);
    window.addEventListener(eventName, receive);
    window.dispatchEvent(new Event(readyEvent));
    if (renderedEvent) window.dispatchEvent(new Event('madstation:global-settings-panels-rendered'));
    return () => window.removeEventListener(eventName, receive);
  }, [eventName, readyEvent, renderedEvent]);
  useEffect(() => {
    if (renderedEvent) window.dispatchEvent(new Event('madstation:global-settings-panels-rendered'));
  }, [snapshot, renderedEvent]);
  return snapshot;
}

function LockOptionsPanel() {
  const snapshot = useHostSnapshot<SecuritySnapshot>('madstation:security-controls', 'madstation:security-controls-mounted');
  const security = readRecord(snapshot.security);
  const hasPassword = Boolean(snapshot.hasPassword);
  const switches = [
    ['lockOnLaunch', 'Lock when Mad Station starts', 'No website loads until you unlock.'],
    ['lockOnSystemLock', 'Lock when Windows locks or sleeps', 'Win+L or the PC going to sleep.'],
    ['lockOnMinimize', 'Lock when minimized', 'As soon as the window is minimized.'],
    ['lockOnIdle', 'Lock after inactivity', 'No keyboard or mouse activity for the time below.'],
  ] as const;
  const emitAction = (action: SecurityAction) => emit('madstation:security-controls-action', action);
  const idleValue = [1, 5, 10, 30].includes(Number(security.idleMinutes)) ? Number(security.idleMinutes) : 5;
  return <>
    {switches.map(([key, title, description]) => <label className="row toggle" data-q={`${title} ${description}`} key={key}>
      <span className="row-copy"><strong>{title}</strong><span>{description}</span></span>
      <span className="switch"><input type="checkbox" data-sec={key} checked={Boolean(security[key])} disabled={!hasPassword} onChange={(event) => emitAction({ type: 'setting', key, value: event.currentTarget.checked })}/><span className="knob"/></span>
    </label>)}
    <div className="row" data-q="Inactivity time minutes"><span className="row-copy"><strong>Inactivity time</strong><span>Lock instantly anytime with Ctrl+Shift+L.</span></span><div className="segmented ms-tabs" data-sec-choice="idleMinutes">
      {([1, 5, 10, 30] as const).map((value) => <button className={`ms-tab${idleValue === value ? ' active' : ''}`} data-value={value} type="button" key={value} disabled={!hasPassword} onClick={() => emitAction({ type: 'idle-minutes', value })}>{value} min</button>)}
    </div></div>
  </>;
}

function DownloadsPanel() {
  const snapshot = useHostSnapshot<DownloadsSnapshot>('madstation:downloads-settings-controls', 'madstation:downloads-settings-controls-mounted');
  const settings = readRecord(snapshot.settings);
  const emitAction = (action: DownloadsAction) => emit('madstation:downloads-settings-controls-action', action);
  return <section className="card ms-card ms-card--flat span-2">
    <header className="card-head ms-card-head"><span className="card-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 4v11M7 11l5 5 5-5"/><path d="M5 20h14"/></svg></span><div><h3>Website downloads</h3><p>Choose where files from websites are saved. Programs and scripts always ask where to save and are never opened from Mad Station.</p></div><div className="card-action"><button className="ms-btn ms-btn--primary with-ico" id="openDownloadsBtn" type="button" onClick={() => emitAction({ type: 'open-downloads' })}>View downloads</button></div></header>
    <div className="card-body">
      <div className="row" data-q="Save downloads to folder location default Downloads"><span className="row-copy"><strong>Save to</strong><span className="path-label" id="downloadFolderLabel">{snapshot.folderLabel || 'Your Downloads folder'}</span></span><span className="row-actions"><button className="ms-btn" id="chooseDownloadFolderBtn" type="button" onClick={() => emitAction({ type: 'choose-folder' })}>Change…</button><button className={`ms-btn ms-btn--sm${snapshot.hasCustomFolder ? '' : ' hidden'}`} id="resetDownloadFolderBtn" type="button" onClick={() => emitAction({ type: 'reset-folder' })}>Use default</button></span></div>
      {([
        ['askWhereToSave', 'Ask where to save each file', 'Show a Save As window for every download.'],
        ['notifyWhenDone', 'Notify when a download finishes', 'A message in Mad Station, plus a Windows notification when Mad Station is in the background.'],
      ] as const).map(([key, title, description]) => <label className="row toggle" data-q={`${title} ${description}`} key={key}><span className="row-copy"><strong>{title}</strong><span>{description}</span></span><span className="switch"><input type="checkbox" data-dl={key} checked={Boolean(settings[key])} onChange={(event) => emitAction({ type: 'setting', key, value: event.currentTarget.checked })}/><span className="knob"/></span></label>)}
      <div className="row" data-q="Open folder downloads"><span className="row-copy"><strong>Download folder</strong><span>Open it in File Explorer.</span></span><button className="ms-btn" id="openDownloadFolderBtn" type="button" onClick={() => emitAction({ type: 'open-folder' })}>Open folder</button></div>
    </div>
  </section>;
}

function DataDiagnosticsPanel() {
  const snapshot = useHostSnapshot<DataDiagnosticsSnapshot>('madstation:data-settings-controls', 'madstation:data-settings-controls-mounted');
  const [releaseFeedDraft, setReleaseFeedDraft] = useState(snapshot.releaseFeedUrl || '');
  useEffect(() => setReleaseFeedDraft(snapshot.releaseFeedUrl || ''), [snapshot.releaseFeedUrl]);
  const emitAction = (action: DataAction) => emit('madstation:data-settings-controls-action', action);
  return <>
    <section className="card ms-card ms-card--flat span-2">
      <header className="card-head ms-card-head"><span className="card-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.01"/></svg></span><div><h3>Your data</h3><p>Everything Mad Station saves lives in one folder on this PC.</p></div></header>
      <div className="card-body">
        <div className="row" data-q="Backup workspace export configuration"><span className="row-copy"><strong>Back up workspace</strong><span>Export providers, accounts and settings. Browser sessions are not included.</span></span><button className="ms-btn" id="backupBtn" type="button" onClick={() => emitAction({ type: 'backup' })}>Back up</button></div>
        <div className="row" data-q="Restore workspace import configuration"><span className="row-copy"><strong>Restore workspace</strong><span>Replace this workspace with a Mad Station backup. Current sessions will be signed out.</span></span><button className="ms-btn" id="restoreBtn" type="button" onClick={() => emitAction({ type: 'restore' })}>Restore…</button></div>
        <div className="row" data-q="Export accounts account list"><span className="row-copy"><strong>Export accounts</strong><span>Export providers and account setup without browser sessions.</span></span><button className="ms-btn" id="exportAccountsBtn" type="button" onClick={() => emitAction({ type: 'export-accounts' })}>Export…</button></div>
        <div className="row" data-q="Import accounts account list"><span className="row-copy"><strong>Import accounts</strong><span>Add accounts from a Mad Station account export.</span></span><button className="ms-btn" id="importAccountsBtn" type="button" onClick={() => emitAction({ type: 'import-accounts' })}>Import…</button></div>
        <div className="row" data-q="Open data folder"><span className="row-copy"><strong>Data folder</strong><span>Settings, accounts and saved sessions.</span></span><button className="ms-btn" id="openDataFolderBtn" type="button" onClick={() => emitAction({ type: 'open-data-folder' })}>Open folder</button></div>
        <div className="row" data-q="Reset all settings defaults"><span className="row-copy"><strong>Reset all settings</strong><span>Back to defaults. Accounts, providers and your password are kept.</span></span><button className="ms-btn ms-btn--sm danger" id="resetSettingsBtn" type="button" onClick={() => emitAction({ type: 'reset-settings' })}>Reset…</button></div>
      </div>
    </section>
    <section className="card ms-card ms-card--flat span-2 no-search">
      <header className="card-head ms-card-head"><span className="card-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3l8 3v6c0 4.5-3.2 7.6-8 9-4.8-1.4-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/></svg></span><div><h3>Diagnostics</h3><p>Useful when a provider fails to load or behaves unexpectedly.</p></div><div className="card-action"><button className="ms-btn" id="exportDiagnosticsBtn" type="button" onClick={() => emitAction({ type: 'export-diagnostics' })}>Export…</button></div></header>
      <div className="card-body">
        <div className="row" data-q="Diagnostics app version accounts providers"><span className="row-copy"><strong>Workspace health</strong><span id="diagnosticsSummary">{snapshot.diagnosticsSummary || 'Ready'}</span></span><button className="ms-btn" id="refreshDiagnosticsBtn" type="button" onClick={() => emitAction({ type: 'refresh-diagnostics' })}>Refresh</button></div>
        <div className="row" data-q="Session state active browser sessions saved accounts"><span className="row-copy"><strong>Session state</strong><span id="diagnosticsSessionState">{snapshot.diagnosticsSessionState || 'Measuring…'}</span></span><button className="ms-btn" id="checkProviderCompatibilityBtn" type="button" disabled={Boolean(snapshot.providerCheckBusy)} onClick={() => emitAction({ type: 'check-providers' })}>Check providers</button></div>
        <div className="row" data-q="Provider compatibility status"><span className="row-copy"><strong>Provider compatibility</strong><span id="diagnosticsProviderStatus">{snapshot.diagnosticsProviderStatus || 'Not checked yet'}</span></span><span className="muted-note">Reachability + configured URL checks; credentials are never tested or exported.</span></div>
        <div className="row" data-q="Check for updates"><span className="row-copy"><strong>Updates</strong><span>Check a configured HTTPS release feed.</span></span><button className="ms-btn" id="checkUpdatesBtn" type="button" onClick={() => emitAction({ type: 'check-updates' })}>Check</button></div>
        <div className="row" data-q="Release feed URL update source"><span className="row-copy"><strong>Release feed URL</strong><span>Optional JSON feed containing a version field and optional releaseUrl.</span></span><input aria-label="Release feed URL" className="inline-input ms-input" id="releaseFeedUrl" value={releaseFeedDraft} placeholder="https://example.com/mad-station-update.json" onChange={(event) => setReleaseFeedDraft(event.currentTarget.value)} onBlur={() => emitAction({ type: 'release-feed-url', value: releaseFeedDraft.trim() })} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); emitAction({ type: 'release-feed-url', value: releaseFeedDraft.trim() }); } }}/></div>
      </div>
    </section>
  </>;
}

const mounts: Array<{ id: string; Component: () => ReactElement }> = [
  { id: 'lockOptions', Component: LockOptionsPanel },
  { id: 'downloadsSettingsReactMount', Component: DownloadsPanel },
  { id: 'dataDiagnosticsReactMount', Component: DataDiagnosticsPanel },
];
const roots: Root[] = [];
for (const item of mounts) {
  const element = document.getElementById(item.id);
  if (!element) continue;
  const root = createRoot(element, { identifierPrefix: `${item.id}-` });
  root.render(<item.Component />);
  roots.push(root);
}

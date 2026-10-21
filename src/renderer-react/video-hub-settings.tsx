import { createRoot, type Root } from 'react-dom/client';
import { useEffect, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';

type VideoHubSettings = {
  defaultTab: 'studio' | 'accounts';
  accountView: 'grid' | 'list';
  showRecent: boolean;
  startCollapsed: boolean;
  confirmDestructive: boolean;
  networkMode: 'direct' | 'system';
};

type SecurityKey = 'allowCamera' | 'allowMicrophone' | 'allowNotifications' | 'allowFullscreen' | 'blockPopups' | 'restrictNavigation' | 'allowLoginProviders' | 'blockHttp';
type VideoHubSettingsSnapshot = {
  open: boolean;
  settings: VideoHubSettings;
  security: Partial<Record<SecurityKey, boolean>>;
};
type VideoHubSettingsAction =
  | { type: 'close' }
  | { type: 'save'; settings: VideoHubSettings }
  | { type: 'security-setting'; key: SecurityKey; value: boolean };

const DEFAULT_SETTINGS: VideoHubSettings = {
  defaultTab: 'studio', accountView: 'grid', showRecent: true,
  startCollapsed: false, confirmDestructive: true, networkMode: 'direct',
};
const SECURITY_OPTIONS: ReadonlyArray<{ key: SecurityKey; title: string; description: string }> = [
  { key: 'allowCamera', title: 'Camera', description: 'Allow trusted account sites to request camera access.' },
  { key: 'allowMicrophone', title: 'Microphone', description: 'Allow trusted account sites to request microphone access.' },
  { key: 'allowNotifications', title: 'Notifications', description: 'Allow website notifications.' },
  { key: 'allowFullscreen', title: 'Fullscreen', description: 'Allow websites to request fullscreen; user-gesture rules still apply.' },
  { key: 'blockPopups', title: 'Block unknown popups', description: 'Keep unexpected popups blocked.' },
  { key: 'restrictNavigation', title: 'Restrict navigation', description: 'Keep account links within approved site and sign-in domains.' },
  { key: 'allowLoginProviders', title: 'Allow common sign-in providers', description: 'Permit approved Google, Microsoft, Apple and GitHub sign-in pages.' },
  { key: 'blockHttp', title: 'Block insecure HTTP pages', description: 'Prefer secure HTTPS pages.' },
];

function normalizeSettings(value: unknown): VideoHubSettings {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    defaultTab: raw.defaultTab === 'accounts' ? 'accounts' : 'studio',
    accountView: raw.accountView === 'list' ? 'list' : 'grid',
    showRecent: raw.showRecent !== false,
    startCollapsed: raw.startCollapsed === true,
    confirmDestructive: raw.confirmDestructive !== false,
    networkMode: raw.networkMode === 'system' ? 'system' : 'direct',
  };
}

function normalizeSnapshot(value: unknown): VideoHubSettingsSnapshot & { kind: string } {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const securityRaw = raw.security && typeof raw.security === 'object' && !Array.isArray(raw.security)
    ? raw.security as Record<string, unknown> : {};
  const security: Partial<Record<SecurityKey, boolean>> = {};
  for (const { key } of SECURITY_OPTIONS) security[key] = Boolean(securityRaw[key]);
  return {
    open: raw.open === true,
    settings: normalizeSettings(raw.settings),
    security,
    kind: typeof raw.kind === 'string' ? raw.kind : 'sync',
  };
}

function emit(action: VideoHubSettingsAction): void {
  window.dispatchEvent(new CustomEvent('madstation:video-hub-settings-action', { detail: action }));
}

function ToggleRow({ id, securityKey, checked, title, description, onChange }: {
  id?: string;
  securityKey?: SecurityKey;
  checked: boolean;
  title: string;
  description: string;
  onChange: (checked: boolean) => void;
}) {
  return <label className="toggle-row"><input id={id} data-sec={securityKey} type="checkbox" checked={checked} onChange={(event) => onChange(event.currentTarget.checked)} /><span><strong>{title}</strong><small>{description}</small></span></label>;
}

function VideoHubSettingsModal() {
  const [snapshot, setSnapshot] = useState<VideoHubSettingsSnapshot>({ open: false, settings: DEFAULT_SETTINGS, security: {} });
  const [draft, setDraft] = useState<VideoHubSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    const onState = (event: Event) => {
      const next = normalizeSnapshot((event as CustomEvent<unknown>).detail);
      setSnapshot(next);
      if (next.kind === 'open') setDraft(next.settings);
    };
    window.addEventListener('madstation:video-hub-settings-state', onState);
    window.dispatchEvent(new Event('madstation:video-hub-settings-mounted'));
    return () => window.removeEventListener('madstation:video-hub-settings-state', onState);
  }, []);

  useEffect(() => {
    if (snapshot.open) document.getElementById('videoHubSettingsClose')?.focus();
  }, [snapshot.open]);

  const update = <K extends keyof VideoHubSettings,>(key: K, value: VideoHubSettings[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const updateSecurity = (key: SecurityKey, value: boolean) => {
    setSnapshot((current) => ({ ...current, security: { ...current.security, [key]: value } }));
    emit({ type: 'security-setting', key, value });
  };
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      emit({ type: 'close' });
      return;
    }
    if (event.key !== 'Tab') return;
    const overlay = event.currentTarget;
    const focusable = [...overlay.querySelectorAll<HTMLElement>('button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      .filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true');
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || !overlay.contains(document.activeElement))) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !overlay.contains(document.activeElement))) {
      event.preventDefault(); first.focus();
    }
  };

  return <div
    className={`modal feature-settings-modal video-hub-settings-modal${snapshot.open ? '' : ' hidden'}`}
    id="videoHubSettingsOverlay"
    role="dialog"
    aria-modal="true"
    aria-labelledby="videoHubSettingsTitle"
    aria-describedby="videoHubSettingsSubtitle"
    onClick={(event) => { if (event.target === event.currentTarget) emit({ type: 'close' }); }}
    onKeyDown={onKeyDown}
  >
    <section className="ms-card ms-card--flat clipboard-settings-card" aria-label="Video Hub preferences">
      <header className="clipboard-settings-heading">
        <button className="close ms-icon-btn" id="videoHubSettingsClose" type="button" aria-label="Back" title="Back" onClick={() => emit({ type: 'close' })}>
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg>
        </button>
        <span className="clipboard-settings-icon ms-brand-tile" aria-hidden="true">
          <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m10 9 6 3-6 3z" /></svg>
        </span>
        <div>
          <div className="modal-title" id="videoHubSettingsTitle">Video Hub settings</div>
          <div className="modal-subtitle" id="videoHubSettingsSubtitle">Choose how your video workspace opens and protects saved accounts.</div>
        </div>
      </header>
      <div className="clipboard-settings-section">
        <div className="clipboard-settings-section-title ms-eyebrow">Workspace</div>
        <div className="clipboard-settings-section-subtitle ms-muted">Personalize your Video Hub layout. These options affect Video Hub only.</div>
        <label className="clipboard-setting-label" htmlFor="videoHubSettingDefaultTab">Open on startup
          <select id="videoHubSettingDefaultTab" className="ms-input" value={draft.defaultTab} onChange={(event) => update('defaultTab', event.currentTarget.value === 'accounts' ? 'accounts' : 'studio')}><option value="studio">Video Studio</option><option value="accounts">Add Accounts</option></select>
        </label>
        <label className="clipboard-setting-label" htmlFor="videoHubSettingAccountView">Account view
          <select id="videoHubSettingAccountView" className="ms-input" value={draft.accountView} onChange={(event) => update('accountView', event.currentTarget.value === 'list' ? 'list' : 'grid')}><option value="grid">Icon grid</option><option value="list">List</option></select>
        </label>
        <ToggleRow id="videoHubSettingRecent" checked={draft.showRecent} title="Show recent accounts" description="Show shortcuts to recently used accounts in the sidebar." onChange={(value) => update('showRecent', value)} />
        <ToggleRow id="videoHubSettingCollapsed" checked={draft.startCollapsed} title="Start with account list collapsed" description="Give the Video Studio more room when Video Hub opens." onChange={(value) => update('startCollapsed', value)} />
      </div>
      <div className="clipboard-settings-section" aria-label="Browser permissions and site access">
        <div className="clipboard-settings-section-title ms-eyebrow">Browser permissions &amp; site access</div>
        <div className="clipboard-settings-section-subtitle ms-muted">These switches use Mad Station’s website permission policy for account sites and are shared with the matching controls in Settings.</div>
        {SECURITY_OPTIONS.map(({ key, title, description }) => <ToggleRow key={key} securityKey={key} checked={Boolean(snapshot.security[key])} title={title} description={description} onChange={(value) => updateSecurity(key, value)} />)}
        <div className="toggle-row"><span><strong>JavaScript</strong><small>Enabled — required for most video sites and CAPTCHA challenges.</small></span><span className="ms-chip">On</span></div>
        <div className="toggle-row"><span><strong>Cookies &amp; site storage</strong><small>Enabled — needed to keep sign-ins and CAPTCHA sessions working.</small></span><span className="ms-chip">On</span></div>
        <div className="toggle-row"><span><strong>Images &amp; web content</strong><small>Enabled by Chromium defaults. Broken resources can still be blocked by the site, network, or DNS/VPN filtering.</small></span><span className="ms-chip">On</span></div>
        <p className="clipboard-settings-section-subtitle ms-muted">JavaScript, cookies, and images are shown as status-only because disabling them can break sign-in and CAPTCHA challenges. Camera, microphone, and notifications also depend on operating-system settings and site requests.</p>
      </div>
      <div className="clipboard-settings-section" aria-label="Video Hub network connection">
        <div className="clipboard-settings-section-title ms-eyebrow">Network &amp; proxy</div>
        <div className="clipboard-settings-section-subtitle ms-muted">Choose how Video Hub's embedded browser connects. This applies to all Video Hub accounts and does not change Windows or other apps.</div>
        <label className="clipboard-setting-label" htmlFor="videoHubSettingNetworkMode">Connection mode
          <select id="videoHubSettingNetworkMode" className="ms-input" value={draft.networkMode} onChange={(event) => update('networkMode', event.currentTarget.value === 'system' ? 'system' : 'direct')}>
            <option value="direct">Normal network (direct connection)</option>
            <option value="system">Use system proxy settings</option>
          </select>
        </label>
        <p className="clipboard-settings-section-subtitle ms-muted">Normal network bypasses configured proxies. System proxy asks Chromium/Electron to use the operating system's proxy configuration. This cannot bypass firewalls, DNS filtering, or network restrictions. Changing this setting may briefly interrupt open Video Hub pages; refresh them afterward.</p>
      </div>
      <div className="clipboard-settings-section">
        <div className="clipboard-settings-section-title ms-eyebrow">CAPTCHA troubleshooting</div>
        <div className="clipboard-settings-section-subtitle ms-muted">The screenshot says the CAPTCHA script failed to load. Permissions alone may not fix it. Refresh the site, check VPN/DNS/network filtering, and compare with the site opened in your default browser. Never disable security protections globally just to pass a CAPTCHA.</div>
      </div>
      <div className="clipboard-settings-section">
        <div className="clipboard-settings-section-title ms-eyebrow">Safety</div>
        <div className="clipboard-settings-section-subtitle ms-muted">Reduce accidental changes to saved accounts and logins.</div>
        <ToggleRow id="videoHubSettingConfirm" checked={draft.confirmDestructive} title="Confirm destructive actions" description="Ask before deleting accounts or providers and their saved logins." onChange={(value) => update('confirmDestructive', value)} />
      </div>
      <footer className="clipboard-settings-actions">
        <button className="ms-btn" id="videoHubSettingsCancel" type="button" onClick={() => emit({ type: 'close' })}>Cancel</button>
        <button className="ms-btn ms-btn--primary" id="videoHubSettingsSave" type="button" onClick={() => emit({ type: 'save', settings: draft })}>Save settings</button>
      </footer>
    </section>
  </div>;
}

function mountVideoHubSettings() {
  const host = document.getElementById('videoHubSettingsReactMount');
  if (!(host instanceof HTMLElement) || host.dataset.reactMounted === 'true') return;
  host.dataset.reactMounted = 'true';
  const root: Root = createRoot(host);
  root.render(<VideoHubSettingsModal />);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountVideoHubSettings, { once: true });
} else {
  mountVideoHubSettings();
}

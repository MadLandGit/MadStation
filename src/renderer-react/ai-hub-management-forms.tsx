import { createRoot, type Root } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';

export interface ManagementFormProvider {
  id: string;
  name: string;
  url: string;
  icon?: string;
  iconCandidates?: string[];
}

export interface ProviderFormDraft {
  id: string | null;
  name: string;
  url: string;
  icon: string;
  category: string;
  loginUrl: string;
  homepageUrl: string;
  description: string;
  authDomains: string;
  notes: string;
  iconCandidates: string[];
  allowRemoteIcons: boolean;
}

export interface AccountFormDraft {
  id: string | null;
  name: string;
  serviceId: string;
  url: string;
  icon: string;
  shortcut: string;
  group: string;
  tags: string;
  favorite: boolean;
  temporary: boolean;
  pageZoom: string;
  openOnStartup: boolean;
  clearCacheOnExit: string;
  signOutOnExit: string;
  camera: string;
  microphone: string;
  notifications: string;
  fullscreen: string;
  allowRemoteIcons: boolean;
}

export interface AccountFormPayload {
  name: string;
  serviceId: string;
  url: string;
  icon: string;
  shortcut: string;
  favorite: boolean;
  temporary: boolean;
  group: string;
  tags: string;
  preferences: {
    pageZoom: number;
    openOnStartup: boolean;
    clearCacheOnExit: boolean | null;
    signOutOnExit: boolean | null;
    permissions: {
      camera: boolean | undefined;
      microphone: boolean | undefined;
      notifications: boolean | undefined;
      fullscreen: boolean | undefined;
    };
  };
}

export interface ProviderFormPayload {
  name: string;
  url: string;
  icon: string;
  category: string;
  loginUrl: string;
  homepageUrl: string;
  description: string;
  authDomains: string[];
  notes: string;
}

export interface FormActionResult {
  ok: boolean;
  error?: string;
  statusCode?: number;
  statusText?: string;
  icon?: string;
  canceled?: boolean;
}

export interface ManagementFormsHost {
  saveAccount(id: string | null, payload: AccountFormPayload): Promise<FormActionResult>;
  saveProvider(id: string | null, payload: ProviderFormPayload): Promise<FormActionResult>;
  verifyProvider(url: string): Promise<FormActionResult>;
  chooseIcon(): Promise<FormActionResult>;
  cancelAccount(): void;
  cancelProvider(): void;
}

export interface ManagementFormsController {
  openAccount(draft: AccountFormDraft, providers: ManagementFormProvider[], forceTemporary?: boolean): void;
  openProvider(draft: ProviderFormDraft): void;
  updateProviders(providers: ManagementFormProvider[]): void;
  setAccountShortcut(value: string): void;
}

declare global {
  interface Window {
    MadStationAiHubManagementForms?: ManagementFormsController;
    MadStationAiHubManagementFormsHost?: ManagementFormsHost;
  }
}

const EMPTY_ACCOUNT: AccountFormDraft = {
  id: null, name: '', serviceId: '', url: '', icon: '', shortcut: '', group: '', tags: '',
  favorite: false, temporary: false, pageZoom: '100', openOnStartup: false,
  clearCacheOnExit: 'inherit', signOutOnExit: 'inherit', camera: 'inherit', microphone: 'inherit',
  notifications: 'inherit', fullscreen: 'inherit', allowRemoteIcons: false,
};
const EMPTY_PROVIDER: ProviderFormDraft = {
  id: null, name: '', url: '', icon: '', category: '', loginUrl: '', homepageUrl: '',
  description: '', authDomains: '', notes: '', iconCandidates: [], allowRemoteIcons: false,
};

function IconPreview({ value, candidates, allowRemote }: { value: string; candidates: string[]; allowRemote: boolean }) {
  const [index, setIndex] = useState(0);
  const options = [...new Set([value, ...candidates].filter((item): item is string =>
    typeof item === 'string' && (item.startsWith('data:image/') || (allowRemote && /^https:\/\//i.test(item)))))];
  useEffect(() => setIndex(0), [options.join('\n')]);
  const source = options[index] || '';
  return <span className="icon-preview">
    {source ? <img src={source} alt="" aria-hidden="true" referrerPolicy="no-referrer" onError={() => setIndex((current) => Math.min(current + 1, options.length))} /> : <span className="icon-preview-fallback" aria-hidden="true">✦</span>}
  </span>;
}

function Toggle({ id, title, description, checked, onChange }: {
  id: string; title: string; description: string; checked: boolean; onChange(value: boolean): void;
}) {
  return <label className="row toggle" htmlFor={id}>
    <span className="row-copy"><strong>{title}</strong><span>{description}</span></span>
    <span className="switch"><input id={id} type="checkbox" checked={checked} onChange={(event) => onChange(event.currentTarget.checked)} /><span className="knob" /></span>
  </label>;
}

function Field({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <label className={className}>{children}</label>;
}

function AccountForm({
  draft, providers, setDraft, onSubmit, onCancel, onChooseIcon, error, saving,
}: {
  draft: AccountFormDraft; providers: ManagementFormProvider[];
  setDraft(update: Partial<AccountFormDraft>): void;
  onSubmit(event: FormEvent<HTMLFormElement>): void;
  onCancel(): void;
  onChooseIcon(): void;
  error: string; saving: boolean;
}) {
  const selectedProvider = providers.find((provider) => provider.id === draft.serviceId);
  const onProviderChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const provider = providers.find((item) => item.id === event.currentTarget.value);
    if (!provider) { setDraft({ serviceId: event.currentTarget.value }); return; }
    const currentUrl = draft.url.trim();
    const shouldFollowProvider = !currentUrl || providers.some((item) => item.url === currentUrl) || currentUrl === 'https://example.com/';
    setDraft({ serviceId: provider.id, icon: provider.icon || '', url: shouldFollowProvider ? provider.url : draft.url });
  };
  const setPermission = (key: 'camera' | 'microphone' | 'notifications' | 'fullscreen', value: string) => setDraft({ [key]: value } as Partial<AccountFormDraft>);

  return <form id="addForm" onSubmit={onSubmit}>
    <div className="setup-section">
      <div className="setup-section-head"><div><span className="eyebrow">01 · Identity</span><h3>Where should this account live?</h3><p>Choose a provider and give this login a recognizable name.</p></div></div>
      <div className="form-grid">
        <Field>Account name<input id="accountName" value={draft.name} onChange={(event) => setDraft({ name: event.currentTarget.value })} placeholder="e.g. Gemini work" required /></Field>
        <Field>Provider<select id="accountProvider" value={draft.serviceId} onChange={onProviderChange}>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></Field>
        <Field className="span-2">Website URL<input id="accountUrl" value={draft.url} onChange={(event) => setDraft({ url: event.currentTarget.value })} placeholder="https://example.com/" required type="url" /></Field>
        <div className="field span-2"><span className="field-label">Account icon</span><div className="icon-field"><IconPreview value={draft.icon} candidates={selectedProvider?.iconCandidates || [selectedProvider?.icon || '']} allowRemote={draft.allowRemoteIcons} /><input id="accountIcon" type="hidden" value={draft.icon} readOnly /><div className="icon-actions"><button className="secondary icon-pick" id="pickAccountIcon" type="button" onClick={onChooseIcon}>Choose image</button><button className="tiny-btn" id="resetAccountIcon" type="button" onClick={() => setDraft({ icon: selectedProvider?.icon || '' })}>Use provider icon</button></div></div></div>
      </div>
    </div>
    <div className="setup-section">
      <div className="setup-section-head"><div><span className="eyebrow">02 · Organization</span><h3>Make it easy to find</h3><p>Optional labels and a shortcut help you switch between accounts quickly.</p></div></div>
      <div className="form-grid">
        <Field>Shortcut (optional)<input id="accountShortcut" placeholder="e.g. Ctrl+Alt+4" value={draft.shortcut} readOnly /></Field>
        <Field>Group (optional)<input id="accountGroup" maxLength={60} placeholder="Work, Personal…" value={draft.group} onChange={(event) => setDraft({ group: event.currentTarget.value })} /></Field>
        <Field className="span-2">Tags (optional)<input id="accountTags" maxLength={240} placeholder="Coding, Research, Writing" value={draft.tags} onChange={(event) => setDraft({ tags: event.currentTarget.value })} /></Field>
      </div>
      <button className="secondary record-btn" id="recordAccountShortcut" type="button" onClick={() => { setDraft({ shortcut: 'Press keys…' }); window.dispatchEvent(new CustomEvent('madstation:record-account-shortcut')); }}>Press keys to record shortcut</button>
      <div className="setup-toggle-grid">
        <Toggle id="accountFavorite" title="Pin account" description="Keep this account at the top of the sidebar." checked={draft.favorite} onChange={(value) => setDraft({ favorite: value })} />
        <Toggle id="accountTemporary" title="Temporary session" description="Delete this account when Mad Station closes." checked={draft.temporary} onChange={(value) => setDraft({ temporary: value })} />
      </div>
    </div>
    <details className="setup-advanced">
      <summary><span><strong>Advanced account settings</strong><small>Startup, cache, sign-out, zoom and permission overrides</small></span><span className="details-chevron">⌄</span></summary>
      <div className="advanced-body"><section className="card modal-settings-card"><header className="card-head"><div><h3>Account behavior</h3><p>These settings override the global defaults for this account.</p></div></header><div className="card-body">
        <Field>Page zoom<select id="accountPageZoom" value={draft.pageZoom} onChange={(event) => setDraft({ pageZoom: event.currentTarget.value })}>{['80', '90', '100', '110', '125', '150'].map((zoom) => <option key={zoom} value={zoom}>{zoom}%</option>)}</select></Field>
        <Toggle id="accountOpenStartup" title="Open this account on startup" description="Use this account instead of the global startup choice." checked={draft.openOnStartup} onChange={(value) => setDraft({ openOnStartup: value })} />
        <Field>Cache on exit<select id="accountClearCache" value={draft.clearCacheOnExit} onChange={(event) => setDraft({ clearCacheOnExit: event.currentTarget.value })}><option value="inherit">Use global setting</option><option value="true">Always clear</option><option value="false">Keep cache</option></select></Field>
        <Field>Sign out on exit<select id="accountSignOut" value={draft.signOutOnExit} onChange={(event) => setDraft({ signOutOnExit: event.currentTarget.value })}><option value="inherit">Use global setting</option><option value="true">Always sign out</option><option value="false">Keep session</option></select></Field>
        <div className="account-perms"><strong>Permission overrides</strong>
          <Field>Camera<select id="accountCamera" value={draft.camera} onChange={(event) => setPermission('camera', event.currentTarget.value)}><option value="inherit">Global</option><option value="true">Allow</option><option value="false">Block</option></select></Field>
          <Field>Microphone<select id="accountMicrophone" value={draft.microphone} onChange={(event) => setPermission('microphone', event.currentTarget.value)}><option value="inherit">Global</option><option value="true">Allow</option><option value="false">Block</option></select></Field>
          <Field>Notifications<select id="accountNotifications" value={draft.notifications} onChange={(event) => setPermission('notifications', event.currentTarget.value)}><option value="inherit">Global</option><option value="true">Allow</option><option value="false">Block</option></select></Field>
          <Field>Fullscreen<select id="accountFullscreen" value={draft.fullscreen} onChange={(event) => setPermission('fullscreen', event.currentTarget.value)}><option value="inherit">Global</option><option value="true">Allow</option><option value="false">Block</option></select></Field>
        </div>
      </div></section></div>
    </details>
    <div className="form-error" id="formError" role="status" aria-live="polite">{error}</div>
    <div className="form-actions setup-actions"><button className="secondary" id="cancelAccountBtn" type="button" onClick={onCancel}>Cancel</button><button className="primary" id="saveAccountBtn" type="submit" disabled={saving}>{saving ? 'Saving…' : (draft.id ? 'Save changes' : 'Create account')}</button></div>
  </form>;
}

function ProviderForm({
  draft, setDraft, onSubmit, onCancel, onChooseIcon, onVerify, verifying, error, saving,
}: {
  draft: ProviderFormDraft; setDraft(update: Partial<ProviderFormDraft>): void;
  onSubmit(event: FormEvent<HTMLFormElement>): void; onCancel(): void; onChooseIcon(): void;
  onVerify(): void; verifying: boolean; error: string; saving: boolean;
}) {
  return <form id="providerForm" onSubmit={onSubmit}>
    <div className="setup-section">
      <div className="setup-section-head"><div><span className="eyebrow">01 · Provider</span><h3>Identify the service</h3><p>These details appear throughout your sidebar and account setup.</p></div></div>
      <div className="form-grid">
        <Field>Provider name<input id="providerName" placeholder="e.g. Qwen" required value={draft.name} onChange={(event) => setDraft({ name: event.currentTarget.value })} /></Field>
        <Field>Category<input id="providerCategory" maxLength={60} placeholder="AI assistant" value={draft.category} onChange={(event) => setDraft({ category: event.currentTarget.value })} /></Field>
        <Field className="span-2">Website URL<input id="providerUrl" placeholder="https://chat.qwen.ai/" required type="url" value={draft.url} onChange={(event) => setDraft({ url: event.currentTarget.value })} /></Field>
        <Field className="span-2">Description<input id="providerDescription" maxLength={240} placeholder="Short description shown in provider lists" value={draft.description} onChange={(event) => setDraft({ description: event.currentTarget.value })} /></Field>
      </div>
    </div>
    <div className="setup-section">
      <div className="setup-section-head"><div><span className="eyebrow">02 · Branding</span><h3>Choose the provider icon</h3><p>Use the site icon by default, or pick a custom image.</p></div></div>
      <div className="field"><div className="icon-field"><IconPreview value={draft.icon} candidates={draft.iconCandidates} allowRemote={draft.allowRemoteIcons} /><div className="icon-actions"><button className="secondary icon-pick" id="pickProviderIcon" type="button" onClick={onChooseIcon}>Choose image</button><button className="tiny-btn" id="resetProviderIcon" type="button" onClick={() => setDraft({ icon: '' })}>Use site icon</button></div></div><input id="providerIcon" type="hidden" value={draft.icon} readOnly /></div>
    </div>
    <details className="setup-advanced">
      <summary><span><strong>Advanced provider details</strong><small>Login, homepage, authentication domains and internal notes</small></span><span className="details-chevron">⌄</span></summary>
      <div className="advanced-body"><div className="form-grid">
        <Field>Login URL<input id="providerLoginUrl" placeholder="https://example.com/login" type="url" value={draft.loginUrl} onChange={(event) => setDraft({ loginUrl: event.currentTarget.value })} /></Field>
        <Field>Homepage URL<input id="providerHomepageUrl" placeholder="https://example.com/" type="url" value={draft.homepageUrl} onChange={(event) => setDraft({ homepageUrl: event.currentTarget.value })} /></Field>
        <Field className="span-2">Authentication domains<input id="providerAuthDomains" maxLength={500} placeholder="accounts.google.com, auth.example.com" value={draft.authDomains} onChange={(event) => setDraft({ authDomains: event.currentTarget.value })} /></Field>
        <Field className="span-2">Notes<textarea id="providerNotes" maxLength={500} placeholder="Optional provider notes" rows={3} value={draft.notes} onChange={(event) => setDraft({ notes: event.currentTarget.value })} /></Field>
      </div></div>
    </details>
    <div className="form-error" id="providerError" role="status" aria-live="polite">{error}</div>
    <div className="form-actions setup-actions"><button className="secondary" id="verifyProviderBtn" type="button" disabled={verifying} onClick={onVerify}>{verifying ? 'Testing…' : 'Test website'}</button><span className="actions-spacer" /><button className="secondary" id="cancelProviderBtn" type="button" onClick={onCancel}>Cancel</button><button className="primary" id="saveProviderBtn" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save provider'}</button></div>
  </form>;
}

function toNullableBoolean(value: string): boolean | null {
  return value === 'inherit' ? null : value === 'true';
}

function toOptionalBoolean(value: string): boolean | undefined {
  return value === 'inherit' ? undefined : value === 'true';
}

function ManagementFormsApp() {
  const [accountDraft, setAccountDraft] = useState<AccountFormDraft>(EMPTY_ACCOUNT);
  const [providerDraft, setProviderDraft] = useState<ProviderFormDraft>(EMPTY_PROVIDER);
  const [providers, setProviders] = useState<ManagementFormProvider[]>([]);
  const [accountError, setAccountError] = useState('');
  const [providerError, setProviderError] = useState('');
  const [savingAccount, setSavingAccount] = useState(false);
  const [savingProvider, setSavingProvider] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const updateAccount = useCallback((update: Partial<AccountFormDraft>) => setAccountDraft((current) => ({ ...current, ...update })), []);
  const updateProvider = useCallback((update: Partial<ProviderFormDraft>) => setProviderDraft((current) => ({ ...current, ...update })), []);
  const updateProviders = useCallback((nextProviders: ManagementFormProvider[]) => {
    setProviders(nextProviders);
    setAccountDraft((current) => {
      const provider = nextProviders.find((item) => item.id === current.serviceId);
      if (!provider) return current;
      const url = current.url.trim();
      const shouldFollowProvider = !url || nextProviders.some((item) => item.url === url) || url === 'https://example.com/';
      return { ...current, url: shouldFollowProvider ? provider.url : current.url, icon: current.icon || provider.icon || '' };
    });
  }, []);

  useEffect(() => {
    const controller: ManagementFormsController = {
      openAccount(draft, nextProviders, forceTemporary = false) {
        setProviders(nextProviders);
        setAccountDraft({ ...EMPTY_ACCOUNT, ...draft, temporary: forceTemporary || Boolean(draft.temporary) });
        setAccountError('');
        setSavingAccount(false);
      },
      openProvider(draft) {
        setProviderDraft({ ...EMPTY_PROVIDER, ...draft });
        setProviderError('');
        setVerifying(false);
        setSavingProvider(false);
      },
      updateProviders,
      setAccountShortcut(value) { setAccountDraft((current) => ({ ...current, shortcut: value })); },
    };
    window.MadStationAiHubManagementForms = controller;
    window.dispatchEvent(new CustomEvent('madstation:ai-hub-forms-ready'));
    return () => { if (window.MadStationAiHubManagementForms === controller) delete window.MadStationAiHubManagementForms; };
  }, [updateProviders]);

  const chooseAccountIcon = async () => {
    const host = window.MadStationAiHubManagementFormsHost;
    if (!host) return;
    const result = await host.chooseIcon();
    if (result?.ok && typeof result.icon === 'string') updateAccount({ icon: result.icon });
  };
  const chooseProviderIcon = async () => {
    const host = window.MadStationAiHubManagementFormsHost;
    if (!host) return;
    const result = await host.chooseIcon();
    if (result?.ok && typeof result.icon === 'string') updateProvider({ icon: result.icon });
  };

  const submitAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAccountError('');
    setSavingAccount(true);
    const payload: AccountFormPayload = {
      name: accountDraft.name.trim(),
      serviceId: accountDraft.serviceId,
      url: accountDraft.url.trim(),
      icon: accountDraft.icon.trim(),
      shortcut: accountDraft.shortcut === 'Press keys…' ? '' : accountDraft.shortcut.trim(),
      favorite: accountDraft.favorite,
      temporary: accountDraft.temporary,
      group: accountDraft.group.trim(),
      tags: accountDraft.tags.trim(),
      preferences: {
        pageZoom: Number(accountDraft.pageZoom),
        openOnStartup: accountDraft.openOnStartup,
        clearCacheOnExit: toNullableBoolean(accountDraft.clearCacheOnExit),
        signOutOnExit: toNullableBoolean(accountDraft.signOutOnExit),
        permissions: {
          camera: toOptionalBoolean(accountDraft.camera),
          microphone: toOptionalBoolean(accountDraft.microphone),
          notifications: toOptionalBoolean(accountDraft.notifications),
          fullscreen: toOptionalBoolean(accountDraft.fullscreen),
        },
      },
    };
    try {
      const result = await window.MadStationAiHubManagementFormsHost?.saveAccount(accountDraft.id, payload);
      if (!result?.ok) setAccountError(result?.error || 'Could not save the account.');
    } catch {
      setAccountError('Could not save the account.');
    } finally {
      setSavingAccount(false);
    }
  };

  const submitProvider = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProviderError('');
    setSavingProvider(true);
    const payload: ProviderFormPayload = {
      name: providerDraft.name.trim(),
      url: providerDraft.url.trim(),
      icon: providerDraft.icon.trim(),
      category: providerDraft.category.trim(),
      loginUrl: providerDraft.loginUrl.trim(),
      homepageUrl: providerDraft.homepageUrl.trim(),
      description: providerDraft.description.trim(),
      authDomains: providerDraft.authDomains.split(',').map((value) => value.trim()).filter(Boolean),
      notes: providerDraft.notes.trim(),
    };
    try {
      const result = await window.MadStationAiHubManagementFormsHost?.saveProvider(providerDraft.id, payload);
      if (!result?.ok) setProviderError(result?.error || 'Could not save provider.');
    } catch {
      setProviderError('Could not save provider.');
    } finally {
      setSavingProvider(false);
    }
  };

  const verifyProvider = async () => {
    setProviderError('Checking website…');
    setVerifying(true);
    try {
      const result = await window.MadStationAiHubManagementFormsHost?.verifyProvider(providerDraft.url.trim());
      if (!result?.ok) setProviderError(result?.error || 'The website could not be reached.');
      else setProviderError(`Website responded (${result.statusCode}${result.statusText ? ` · ${result.statusText}` : ''}).`);
    } catch {
      setProviderError('The website could not be reached.');
    } finally {
      setVerifying(false);
    }
  };

  const accountMount = document.getElementById('accountFormReactMount');
  const providerMount = document.getElementById('providerFormReactMount');
  return <>
    {accountMount && createPortal(<AccountForm draft={accountDraft} providers={providers} setDraft={updateAccount} onSubmit={(event) => { void submitAccount(event); }} onCancel={() => window.MadStationAiHubManagementFormsHost?.cancelAccount()} onChooseIcon={() => { void chooseAccountIcon(); }} error={accountError} saving={savingAccount} />, accountMount)}
    {providerMount && createPortal(<ProviderForm draft={providerDraft} setDraft={updateProvider} onSubmit={(event) => { void submitProvider(event); }} onCancel={() => window.MadStationAiHubManagementFormsHost?.cancelProvider()} onChooseIcon={() => { void chooseProviderIcon(); }} onVerify={() => { void verifyProvider(); }} verifying={verifying} error={providerError} saving={savingProvider} />, providerMount)}
  </>;
}

let formsRoot: Root | null = null;
function mountAiHubManagementForms(): void {
  const host = document.getElementById('aiHubManagementFormsControllerMount');
  if (!host || formsRoot) return;
  if (!document.getElementById('accountFormReactMount') || !document.getElementById('providerFormReactMount')) return;
  formsRoot = createRoot(host);
  formsRoot.render(<ManagementFormsApp />);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountAiHubManagementForms, { once: true });
else mountAiHubManagementForms();

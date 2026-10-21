import { normalizeAuthDomain } from './input-validation.js';

/** Typed Video Hub provider/account store transitions.
 *
 * This controller owns data normalization and low-coupling mutations only.
 * Electron sessions, browser views, file access, and IPC authorization are
 * injected or remain in the main-process composition root.
 */

export interface VideoHubProvider {
  id: string;
  name: string;
  url: string;
  note: string;
  authDomains: string[];
  icon: string;
  builtin: boolean;
}

export interface VideoHubAccount {
  id: string;
  providerId: string;
  name: string;
  url: string;
  icon: string;
}

export interface VideoHubStore {
  version: 1;
  providers: VideoHubProvider[];
  accounts: VideoHubAccount[];
  activeAccountId: string | null;
}

export interface VideoHubState {
  providers: Array<Pick<VideoHubProvider, 'id' | 'name' | 'url' | 'icon' | 'note' | 'builtin'>>;
  accounts: Array<VideoHubAccount & { providerName: string }>;
  activeAccountId: string | null;
}

export interface VideoHubValidation {
  cleanId(value: unknown): string;
  cleanText(value: unknown, max?: number): string;
  normalizeHttpsUrl(value: unknown): string | null;
  sanitizeIcon(value: unknown): string;
  faviconForUrl(value: unknown): string;
}

export interface VideoHubControllerDependencies extends VideoHubValidation {
  getStore(): VideoHubStore;
  saveStore(): boolean;
  randomId(): string;
  setActiveAccountId(id: string | null): void;
}

export const VIDEO_HUB_DEFAULT_PROVIDERS: ReadonlyArray<Omit<VideoHubProvider, 'icon' | 'builtin'>> = [
  { id: 'higgsfield', name: 'Higgsfield', url: 'https://higgsfield.ai/', note: 'Free plan with daily credits; the allowance can change.', authDomains: ['higgsfield.ai'] },
  { id: 'pixverse', name: 'PixVerse', url: 'https://app.pixverse.ai/', note: 'Official FAQ lists 30 daily credits for non-members and 60 for members; verify the current account balance.', authDomains: ['pixverse.ai'] },
  { id: 'hailuo', name: 'Hailuo AI', url: 'https://hailuoai.video/', note: 'Free/trial credits may be time-limited or campaign-based.', authDomains: ['hailuoai.video', 'minimaxi.com'] },
  { id: 'vidu', name: 'Vidu AI', url: 'https://www.vidu.com/', note: 'Official pricing lists signup credits and daily login rewards; check the current account offer.', authDomains: ['vidu.com', 'go.vidu.com', 's.vidu.com'] },
  { id: 'kling', name: 'Kling AI', url: 'https://kling.ai/', note: 'Official pages advertise free daily credits; amount and watermark depend on current terms.', authDomains: ['kling.ai', 'klingai.com', 'kuaishou.com'] },
];

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

export function createVideoHubStoreController(dependencies: VideoHubControllerDependencies) {
  const {
    getStore,
    saveStore,
    randomId,
    cleanId,
    cleanText,
    normalizeHttpsUrl,
    sanitizeIcon,
    faviconForUrl,
    setActiveAccountId,
  } = dependencies;

  function logoForUrl(url: string): string {
    return `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(url)}&sz=128`;
  }

  function defaultStore(): VideoHubStore {
    return {
      version: 1,
      providers: VIDEO_HUB_DEFAULT_PROVIDERS.map((provider) => ({
        ...provider,
        authDomains: [...provider.authDomains],
        icon: logoForUrl(provider.url),
        builtin: true,
      })),
      accounts: [],
      activeAccountId: null,
    };
  }

  function sanitizeStore(raw: unknown): VideoHubStore {
    const source = asRecord(raw) || {};
    const providers: VideoHubProvider[] = [];
    const providerIds = new Set<string>();

    for (const candidate of Array.isArray(source.providers) ? source.providers : []) {
      const item = asRecord(candidate);
      const id = cleanId(item?.id);
      const name = cleanText(item?.name);
      const url = normalizeHttpsUrl(item?.url);
      if (!id || !name || !url || providerIds.has(id)) continue;
      providerIds.add(id);
      const preset = VIDEO_HUB_DEFAULT_PROVIDERS.find((entry) => entry.id === id);
      let providerHostname = '';
      let presetHostname = '';
      try { providerHostname = new URL(url).hostname.toLowerCase(); } catch { /* URL already normalized */ }
      try { presetHostname = preset ? new URL(preset.url).hostname.toLowerCase() : ''; } catch { /* static defaults are reviewed */ }
      const canonicalBuiltin = Boolean(preset && providerHostname === presetHostname);
      const trustedDomains = canonicalBuiltin ? preset!.authDomains : [];
      const authDomains = [...new Set((Array.isArray(item?.authDomains) ? item.authDomains : [])
        .map((host) => normalizeAuthDomain(host, { providerUrl: url, trustedDomains }))
        .filter((host): host is string => host !== null && (!canonicalBuiltin || trustedDomains.includes(host) || providerHostname === host || providerHostname.endsWith(`.${host}`)))
        .slice(0, 20))];
      providers.push({
        id,
        name,
        url,
        note: cleanText(item?.note, 240),
        authDomains,
        icon: sanitizeIcon(item?.icon) || logoForUrl(url),
        builtin: Boolean(item?.builtin),
      });
    }

    // Merge new defaults into older stores without replacing user-created data.
    for (const preset of VIDEO_HUB_DEFAULT_PROVIDERS) {
      if (!providerIds.has(preset.id)) {
        providers.push({
          ...preset,
          authDomains: [...preset.authDomains],
          icon: logoForUrl(preset.url),
          builtin: true,
        });
        providerIds.add(preset.id);
      }
    }

    const accounts: VideoHubAccount[] = [];
    const accountIds = new Set<string>();
    for (const candidate of Array.isArray(source.accounts) ? source.accounts : []) {
      const item = asRecord(candidate);
      const id = cleanId(item?.id);
      const provider = providers.find((entry) => entry.id === item?.providerId);
      if (!id || !provider || accountIds.has(id)) continue;
      accountIds.add(id);
      const url = normalizeHttpsUrl(item?.url) || provider.url;
      const savedIcon = sanitizeIcon(item?.icon);
      const icon = (savedIcon && savedIcon !== faviconForUrl(url)) || !provider.icon
        ? (savedIcon || provider.icon)
        : provider.icon;
      accounts.push({
        id,
        providerId: provider.id,
        name: cleanText(item?.name) || `${provider.name} ${accounts.length + 1}`,
        url,
        icon,
      });
    }

    const activeAccountId = accounts.some((account) => account.id === source.activeAccountId)
      ? source.activeAccountId as string
      : (accounts[0]?.id || null);
    return { version: 1, providers, accounts, activeAccountId };
  }

  function getProvider(id: unknown): VideoHubProvider | null {
    return getStore().providers.find((provider) => provider.id === id) || null;
  }

  function getAccount(id: unknown): VideoHubAccount | null {
    return getStore().accounts.find((account) => account.id === id) || null;
  }

  function stateForRenderer(): VideoHubState {
    const store = getStore();
    return {
      providers: store.providers.map((provider) => ({
        id: provider.id,
        name: provider.name,
        url: provider.url,
        icon: provider.icon || faviconForUrl(provider.url),
        note: provider.note || '',
        builtin: Boolean(provider.builtin),
      })),
      accounts: store.accounts.map((account) => ({
        ...account,
        providerName: getProvider(account.providerId)?.name || 'Video site',
      })),
      activeAccountId: store.activeAccountId || null,
    };
  }

  function uniqueName(base: string, providerId: string, ignoreId = ''): string {
    const taken = new Set(getStore().accounts
      .filter((account) => account.providerId === providerId && account.id !== ignoreId)
      .map((account) => account.name.toLowerCase()));
    if (!taken.has(base.toLowerCase())) return base;
    for (let n = 2; n < 500; n += 1) {
      const candidate = `${base} ${n}`.slice(0, 60);
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
    return `${base} ${randomId()}`.slice(0, 60);
  }

  function addProvider(payload: unknown): unknown {
    const data = asRecord(payload) || {};
    const store = getStore();
    const name = cleanText(data.name);
    const url = normalizeHttpsUrl(data.url);
    if (!name || !url) return { ok: false, error: 'Enter a site name and a valid HTTPS website URL.' };
    if (store.providers.some((provider) => provider.name.toLowerCase() === name.toLowerCase())) {
      return { ok: false, error: 'A video site with that name already exists.' };
    }
    const parsed = new URL(url);
    const icon = sanitizeIcon(data.icon) || logoForUrl(url);
    const provider: VideoHubProvider = {
      id: `custom-${randomId()}`,
      name,
      url,
      icon,
      note: 'Custom site',
      authDomains: [parsed.hostname],
      builtin: false,
    };
    store.providers.push(provider);
    saveStore();
    return {
      ok: true,
      provider: { id: provider.id, name: provider.name, url: provider.url, icon: provider.icon, note: provider.note, builtin: false },
      ...stateForRenderer(),
    };
  }

  function addAccount(payload: unknown): unknown {
    const data = asRecord(payload) || {};
    const store = getStore();
    const provider = getProvider(String(data.providerId || ''));
    if (!provider) return { ok: false, error: 'Choose a video generator first.' };
    const base = cleanText(data.name) || `${provider.name} ${store.accounts.filter((account) => account.providerId === provider.id).length + 1}`;
    const account: VideoHubAccount = {
      id: `vh-${randomId()}`,
      providerId: provider.id,
      name: uniqueName(base, provider.id),
      url: provider.url,
      icon: provider.icon,
    };
    store.accounts.push(account);
    if (!store.activeAccountId) store.activeAccountId = account.id;
    setActiveAccountId(store.activeAccountId);
    saveStore();
    return { ok: true, account, ...stateForRenderer() };
  }

  function renameAccount(id: unknown, name: unknown): unknown {
    const account = getAccount(id);
    const clean = cleanText(name);
    if (!account) return { ok: false, error: 'Video Hub account not found.' };
    if (!clean) return { ok: false, error: 'Enter an account label.' };
    account.name = uniqueName(clean, account.providerId, account.id);
    saveStore();
    return { ok: true, ...stateForRenderer() };
  }

  return {
    defaultStore,
    sanitizeStore,
    getProvider,
    getAccount,
    stateForRenderer,
    uniqueName,
    addProvider,
    addAccount,
    renameAccount,
  };
}

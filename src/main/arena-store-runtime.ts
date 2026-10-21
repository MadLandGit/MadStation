/**
 * Model Arena provider/account persistence and mutations. Native WebContentsViews
 * and Electron sessions remain injected host operations, so these store commands
 * can be tested without launching Electron.
 */

export interface ArenaProviderRecord { id: string; name: string; url: string; icon: string }
export interface ArenaAccountRecord { id: string; providerId: string; name: string; url: string; icon: string }
export interface ArenaStoreRecord {
  version: 1;
  providers: ArenaProviderRecord[];
  accounts: ArenaAccountRecord[];
  selected: { left: string | null; right: string | null };
}
type UnknownRecord = Record<string, unknown>;
type FileSystemLike = {
  readFileSync(path: string, encoding: string): string;
  writeFileSync(path: string, data: string, encoding: string): void;
  renameSync(source: string, destination: string): void;
};

export interface ArenaStoreRuntimeDependencies {
  getFilePath(): string;
  fs: FileSystemLike;
  defaultProviders: Array<{ id: string; name: string; url: string; icon?: string }>;
  cleanId(value: unknown): string;
  cleanText(value: unknown, maxLength?: number): string;
  normalizeHttpsUrl(value: unknown): string | null;
  sanitizeIcon(value: unknown): string;
  faviconForUrl(url: string): string;
  randomId(): string;
  isPlainObject(value: unknown): value is UnknownRecord;
  iconCandidatesFor(service: { id: string; name: string; url: string; icon?: string }, preferred?: string): unknown[];
  wipeAccountData(account: ArenaAccountRecord): Promise<unknown>;
  setBrowserModels(models: { left: string | null; right: string | null }): Promise<unknown>;
  now?(): number;
}

export function createArenaStoreRuntime(dependencies: ArenaStoreRuntimeDependencies) {
  const { fs, defaultProviders, cleanId, cleanText, normalizeHttpsUrl, sanitizeIcon, faviconForUrl, randomId, isPlainObject } = dependencies;
  const now = dependencies.now || Date.now;
  let store: ArenaStoreRecord | null = null;

  function defaultStore(): ArenaStoreRecord {
    const providers = defaultProviders.map((provider) => ({ id: provider.id, name: provider.name, url: provider.url, icon: provider.icon || faviconForUrl(provider.url) }));
    const accounts = providers.map((provider) => ({ id: `${provider.id}-${randomId()}`, providerId: provider.id, name: `${provider.name} 1`, url: provider.url, icon: provider.icon }));
    return { version: 1, providers, accounts, selected: { left: accounts[0]?.id || null, right: accounts[1]?.id || null } };
  }

  function sanitizeStore(raw: UnknownRecord): ArenaStoreRecord {
    const providers: ArenaProviderRecord[] = [];
    const seenProviders = new Set<string>();
    for (const item of (Array.isArray(raw.providers) ? raw.providers : []) as UnknownRecord[]) {
      const id = cleanId(item?.id);
      const name = cleanText(item?.name);
      const url = normalizeHttpsUrl(item?.url);
      if (!id || !name || !url || seenProviders.has(id)) continue;
      seenProviders.add(id);
      providers.push({ id, name, url, icon: sanitizeIcon(item?.icon) || faviconForUrl(url) });
    }

    const accounts: ArenaAccountRecord[] = [];
    const seenAccounts = new Set<string>();
    for (const item of (Array.isArray(raw.accounts) ? raw.accounts : []) as UnknownRecord[]) {
      const id = cleanId(item?.id);
      const provider = providers.find((candidate) => candidate.id === item?.providerId);
      if (!id || !provider || seenAccounts.has(id)) continue;
      seenAccounts.add(id);
      accounts.push({
        id,
        providerId: provider.id,
        name: cleanText(item?.name) || `${provider.name} ${accounts.length + 1}`,
        url: normalizeHttpsUrl(item?.url) || provider.url,
        icon: sanitizeIcon(item?.icon) || provider.icon,
      });
    }

    const selectedRaw = isPlainObject(raw.selected) ? raw.selected : {};
    let left = accounts.some((account) => account.id === selectedRaw.left) ? String(selectedRaw.left) : null;
    let right = accounts.some((account) => account.id === selectedRaw.right) ? String(selectedRaw.right) : null;
    if (left && left === right) right = null;
    if (!left) left = accounts.find((account) => account.id !== right)?.id || null;
    if (!right) right = accounts.find((account) => account.id !== left)?.id || null;
    return { version: 1, providers, accounts, selected: { left, right } };
  }

  function saveStore(): boolean {
    try {
      const file = dependencies.getFilePath();
      const temporaryFile = `${file}.tmp`;
      fs.writeFileSync(temporaryFile, JSON.stringify(store, null, 2), 'utf8');
      fs.renameSync(temporaryFile, file);
      return true;
    } catch { return false; }
  }

  function loadStore(): ArenaStoreRecord {
    if (store) return store;
    const file = dependencies.getFilePath();
    let raw: unknown = null;
    let exists = false;
    try {
      const text = fs.readFileSync(file, 'utf8');
      exists = true;
      raw = JSON.parse(text);
    } catch {
      if (exists) { try { fs.renameSync(file, `${file}.corrupt-${now()}`); } catch { /* ignore */ } }
    }
    if (isPlainObject(raw)) store = sanitizeStore(raw);
    else { store = defaultStore(); saveStore(); }
    return store;
  }

  function getAccount(id: unknown): ArenaAccountRecord | null {
    return loadStore().accounts.find((account) => account.id === id) || null;
  }
  function getProvider(id: unknown): ArenaProviderRecord | null {
    return loadStore().providers.find((provider) => provider.id === id) || null;
  }
  function runtimeAccount(account: ArenaAccountRecord) {
    return { id: account.id, serviceId: account.providerId, name: account.name, url: account.url, icon: account.icon, preferences: {} };
  }
  function stateForRenderer() {
    const current = loadStore();
    const providers = current.providers.map((provider) => ({ ...provider, iconCandidates: dependencies.iconCandidatesFor(provider, provider.icon) }));
    const byId = new Map(providers.map((provider) => [provider.id, provider]));
    const accounts = current.accounts.map((account) => {
      const provider = byId.get(account.providerId);
      const icon = account.icon || provider?.icon || '';
      return {
        ...account,
        providerName: provider?.name || 'Provider',
        icon,
        iconCandidates: dependencies.iconCandidatesFor(provider || { id: account.providerId, name: account.providerId, url: account.url, icon }, icon),
      };
    });
    return { providers, accounts, selected: { ...current.selected } };
  }
  function uniqueName(base: string, providerId: string, ignoreId = ''): string {
    const taken = new Set(loadStore().accounts.filter((account) => account.providerId === providerId && account.id !== ignoreId).map((account) => account.name.toLowerCase()));
    if (!taken.has(base.toLowerCase())) return base;
    for (let suffix = 2; suffix < 500; suffix += 1) {
      const candidate = `${base} ${suffix}`.slice(0, 60);
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
    return `${base} ${randomId()}`.slice(0, 60);
  }

  function addProvider(payloadInput: unknown) {
    const payload = isPlainObject(payloadInput) ? payloadInput : {};
    const current = loadStore();
    const name = cleanText(payload.name);
    const url = normalizeHttpsUrl(payload.url);
    if (!name || !url) return { ok: false, error: 'Provider name and an HTTPS website URL are required.' };
    if (current.providers.some((provider) => provider.name.toLowerCase() === name.toLowerCase())) return { ok: false, error: 'An Arena provider with that name already exists.' };
    const provider = { id: `custom-${randomId()}`, name, url, icon: sanitizeIcon(payload.icon) || faviconForUrl(url) };
    current.providers.push(provider);
    saveStore();
    return { ok: true, provider, ...stateForRenderer() };
  }

  function addAccount(payloadInput: unknown) {
    const payload = isPlainObject(payloadInput) ? payloadInput : {};
    const current = loadStore();
    const provider = getProvider(String(payload.providerId || ''));
    if (!provider) return { ok: false, error: 'Choose a provider first.' };
    const base = cleanText(payload.name) || `${provider.name} ${current.accounts.filter((account) => account.providerId === provider.id).length + 1}`;
    const account = { id: `${provider.id}-${randomId()}`, providerId: provider.id, name: uniqueName(base, provider.id), url: provider.url, icon: provider.icon };
    current.accounts.push(account);
    if (!current.selected.left) current.selected.left = account.id;
    else if (!current.selected.right && current.selected.left !== account.id) current.selected.right = account.id;
    saveStore();
    return { ok: true, account, ...stateForRenderer() };
  }

  function renameAccount(id: unknown, nameInput: unknown) {
    const account = getAccount(id);
    const name = cleanText(nameInput);
    if (!account) return { ok: false, error: 'Arena account not found.' };
    if (!name) return { ok: false, error: 'Enter a name.' };
    account.name = uniqueName(name, account.providerId, account.id);
    saveStore();
    return { ok: true, ...stateForRenderer() };
  }

  function fixSelection() {
    const current = loadStore();
    const ids = new Set(current.accounts.map((account) => account.id));
    let { left, right } = current.selected;
    if (!ids.has(left || '')) left = null;
    if (!ids.has(right || '') || right === left) right = null;
    if (!left) left = current.accounts.find((account) => account.id !== right)?.id || null;
    if (!right) right = current.accounts.find((account) => account.id !== left)?.id || null;
    current.selected = { left, right };
  }

  async function deleteAccount(id: unknown) {
    const current = loadStore();
    const account = getAccount(id);
    if (!account) return { ok: false, error: 'Arena account not found.' };
    await dependencies.wipeAccountData(account);
    current.accounts = current.accounts.filter((entry) => entry.id !== id);
    fixSelection();
    saveStore();
    await dependencies.setBrowserModels({ left: current.selected.left, right: current.selected.right });
    return { ok: true, ...stateForRenderer() };
  }

  async function deleteProvider(id: unknown) {
    const current = loadStore();
    const provider = getProvider(id);
    if (!provider) return { ok: false, error: 'Arena provider not found.' };
    for (const account of current.accounts.filter((entry) => entry.providerId === id)) await dependencies.wipeAccountData(account);
    current.accounts = current.accounts.filter((account) => account.providerId !== id);
    current.providers = current.providers.filter((entry) => entry.id !== id);
    fixSelection();
    saveStore();
    await dependencies.setBrowserModels({ left: current.selected.left, right: current.selected.right });
    return { ok: true, ...stateForRenderer() };
  }

  async function resetLogin(id: unknown) {
    const account = getAccount(id);
    if (!account) return { ok: false, error: 'Arena account not found.' };
    await dependencies.wipeAccountData(account);
    const { left, right } = loadStore().selected;
    await dependencies.setBrowserModels({ left, right });
    return { ok: true };
  }

  return { loadStore, saveStore, sanitizeStore, defaultStore, getAccount, getProvider, runtimeAccount, stateForRenderer, addProvider, addAccount, renameAccount, deleteAccount, deleteProvider, resetLogin };
}

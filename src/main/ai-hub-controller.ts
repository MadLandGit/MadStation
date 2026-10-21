/** Typed, data-only AI Hub provider/account transitions.
 *
 * This controller owns low-coupling config mutations and their validation.
 * Electron IPC authorization, broadcasts, persistence timing, and live browser
 * session cleanup stay in the main-process composition root.
 */

type UnknownRecord = Record<string, unknown>;

export interface AiHubProvider extends UnknownRecord {
  id: string;
  name: string;
  url: string;
  icon?: string;
}

export interface AiHubAccount extends UnknownRecord {
  id: string;
  serviceId: string;
  name: string;
  url: string;
  icon: string;
  shortcut: string;
  favorite: boolean;
  group: string;
  tags: string[];
  temporary?: boolean;
  preferences: UnknownRecord;
}

export interface AiHubConfig extends UnknownRecord {
  services: AiHubProvider[];
  accounts: AiHubAccount[];
  serviceOrder?: string[];
  accountOrder?: string[];
  activeId?: string | null;
}

export interface AiHubControllerDependencies {
  getConfig(): AiHubConfig;
  getService(id: unknown): AiHubProvider | null;
  getAccount(id: unknown): AiHubAccount | null;
  cleanText(value: unknown, max?: number): string;
  normalizeHttpsUrl(value: unknown): string | null;
  sanitizeIcon(value: unknown): string;
  faviconForUrl(value: unknown): string;
  normalizeShortcut(value: unknown): string;
  normalizeProviderMetadata(value: UnknownRecord): AiHubProvider;
  normalizeAccountPreferences(value: unknown): UnknownRecord;
  randomId(): string;
}

export type CommandFailure = { ok: false; error: string };
export type CommandSuccess<T extends UnknownRecord = UnknownRecord> = { ok: true } & T;

export interface PreparedAccountUpdate {
  ok: true;
  accountId: string;
  sessionChanged: boolean;
  patch: Pick<AiHubAccount,
    'name' | 'serviceId' | 'url' | 'icon' | 'shortcut' | 'favorite' | 'group' | 'tags' | 'temporary' | 'preferences'>;
}

export type AccountUpdatePreparation = CommandFailure | PreparedAccountUpdate;

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

export function createAiHubController(dependencies: AiHubControllerDependencies) {
  const {
    getConfig,
    getService,
    getAccount,
    cleanText,
    normalizeHttpsUrl,
    sanitizeIcon,
    faviconForUrl,
    normalizeShortcut,
    normalizeProviderMetadata,
    normalizeAccountPreferences,
    randomId,
  } = dependencies;

  function addService(payload: unknown): CommandSuccess<{ service: AiHubProvider }> | CommandFailure {
    const data = asRecord(payload) || {};
    const config = getConfig();
    const name = cleanText(data.name);
    const url = normalizeHttpsUrl(data.url);
    if (!name || !url) return { ok: false, error: 'Provider name and an HTTPS website URL are required.' };
    const icon = sanitizeIcon(data.icon) || faviconForUrl(url);
    if (config.services.some((service) => service.name.toLowerCase() === name.toLowerCase())) {
      return { ok: false, error: 'A provider with that name already exists.' };
    }
    const service = normalizeProviderMetadata({
      id: `custom-${randomId()}`,
      name,
      url,
      icon,
      category: data.category,
      description: data.description,
      homepageUrl: data.homepageUrl,
      loginUrl: data.loginUrl,
      authDomains: data.authDomains,
      notes: data.notes,
    });
    config.services.push(service);
    config.serviceOrder = [...(config.serviceOrder || []), service.id];
    return { ok: true, service };
  }

  function updateService(id: unknown, payload: unknown): CommandSuccess | CommandFailure {
    const config = getConfig();
    const service = getService(id);
    if (!service) return { ok: false, error: 'Provider not found.' };
    const data = asRecord(payload) || {};
    const name = cleanText(data.name);
    const url = normalizeHttpsUrl(data.url);
    if (!name || !url) return { ok: false, error: 'Name and HTTPS URL are required.' };
    const icon = sanitizeIcon(data.icon) || faviconForUrl(url);
    const duplicate = config.services.find((entry) => entry.id !== id && entry.name.toLowerCase() === name.toLowerCase());
    if (duplicate) return { ok: false, error: 'Another provider already uses that name.' };
    Object.assign(service, normalizeProviderMetadata({
      ...service,
      name,
      url,
      icon,
      category: data.category,
      description: data.description,
      homepageUrl: data.homepageUrl,
      loginUrl: data.loginUrl,
      authDomains: data.authDomains,
      notes: data.notes,
    }));
    for (const account of config.accounts) {
      if (account.serviceId === id) account.icon = account.icon || icon;
    }
    return { ok: true };
  }

  function addAccount(payload: unknown): CommandSuccess<{ account: AiHubAccount }> | CommandFailure {
    const data = asRecord(payload) || {};
    const config = getConfig();
    const name = cleanText(data.name);
    const rawUrl = String(data.url || '').trim();
    const serviceId = String(data.serviceId || '').trim();
    const serviceName = cleanText(data.serviceName);
    let service = serviceId ? getService(serviceId) : null;

    if (!service && serviceName) {
      service = config.services.find((entry) => entry.name.toLowerCase() === serviceName.toLowerCase()) || null;
    }
    const accountUrl = normalizeHttpsUrl(rawUrl || service?.url || '');
    if (!service && serviceName && accountUrl) {
      const created: AiHubProvider = {
        id: `custom-${randomId()}`,
        name: serviceName,
        url: accountUrl,
        icon: sanitizeIcon(data.icon) || faviconForUrl(accountUrl),
      };
      config.services.push(created);
      config.serviceOrder = [...(config.serviceOrder || []), created.id];
      service = created;
    }
    if (!name || !service || !accountUrl) {
      return { ok: false, error: 'Account name, provider, and an HTTPS URL are required.' };
    }

    const shortcut = normalizeShortcut(data.shortcut || '');
    if (shortcut && config.accounts.some((account) => normalizeShortcut(account.shortcut) === shortcut)) {
      return { ok: false, error: `Shortcut ${shortcut} is already assigned.` };
    }

    const tagsInput = String(data.tags || '');
    const tags = [...new Set(tagsInput.split(',').map((entry) => cleanText(entry, 32)).filter(Boolean).slice(0, 12))];
    const account: AiHubAccount = {
      id: `${service.id}-${randomId()}`,
      serviceId: service.id,
      name,
      url: accountUrl,
      icon: sanitizeIcon(data.icon) || service.icon || '',
      shortcut,
      favorite: Boolean(data.favorite),
      group: cleanText(data.group, 60),
      tags,
      temporary: Boolean(data.temporary),
      preferences: normalizeAccountPreferences({
        preferences: data.preferences,
        favorite: data.favorite,
        group: data.group,
        tags: tagsInput.split(','),
      }),
    };
    config.accounts.push(account);
    config.accountOrder = [...(config.accountOrder || []), account.id];
    return { ok: true, account };
  }

  /** Validate and build an account patch before the host tears down a live view. */
  function prepareUpdateAccount(id: unknown, payload: unknown): AccountUpdatePreparation {
    const config = getConfig();
    const account = getAccount(id);
    if (!account) return { ok: false, error: 'Account not found.' };
    const data = asRecord(payload) || {};
    const name = cleanText(data.name);
    const url = normalizeHttpsUrl(data.url);
    const serviceId = String(data.serviceId || '').trim();
    const service = getService(serviceId);
    if (!name || !service || !url) {
      return { ok: false, error: 'Account name, provider, and an HTTPS URL are required.' };
    }
    const shortcut = normalizeShortcut(data.shortcut || '');
    if (shortcut && config.accounts.some((entry) => entry.id !== account.id && normalizeShortcut(entry.shortcut) === shortcut)) {
      return { ok: false, error: `Shortcut ${shortcut} is already assigned.` };
    }
    const favorite = Boolean(data.favorite);
    const group = cleanText(data.group, 60);
    const tagsInput = String(data.tags || '');
    const tags = [...new Set(tagsInput.split(',').map((entry) => cleanText(entry, 32)).filter(Boolean).slice(0, 12))];
    const patch = {
      name,
      serviceId: service.id,
      url,
      icon: sanitizeIcon(data.icon) || service.icon || '',
      shortcut,
      favorite,
      group,
      tags,
      temporary: Boolean(data.temporary),
      preferences: normalizeAccountPreferences({
        ...account,
        favorite,
        group,
        tags,
        preferences: data.preferences,
      }),
    };
    return {
      ok: true,
      accountId: account.id,
      sessionChanged: account.serviceId !== service.id || account.url !== url,
      patch,
    };
  }

  function applyUpdateAccount(plan: PreparedAccountUpdate): AiHubAccount | null {
    const account = getAccount(plan.accountId);
    if (!account) return null;
    Object.assign(account, plan.patch);
    return account;
  }

  function renameAccount(id: unknown, name: unknown): CommandSuccess | CommandFailure {
    const account = getAccount(id);
    const clean = cleanText(name);
    if (!account || !clean) return { ok: false, error: 'A name is required.' };
    account.name = clean;
    return { ok: true };
  }

  function setAccountShortcut(id: unknown, shortcutValue: unknown): CommandSuccess | CommandFailure {
    const config = getConfig();
    const account = getAccount(id);
    if (!account) return { ok: false, error: 'Account not found.' };
    const shortcut = normalizeShortcut(shortcutValue);
    if (shortcut && config.accounts.some((entry) => entry.id !== account.id && normalizeShortcut(entry.shortcut) === shortcut)) {
      return { ok: false, error: `Shortcut ${shortcut} is already assigned to another account.` };
    }
    account.shortcut = shortcut;
    return { ok: true };
  }

  return {
    addService,
    updateService,
    addAccount,
    prepareUpdateAccount,
    applyUpdateAccount,
    renameAccount,
    setAccountShortcut,
  };
}

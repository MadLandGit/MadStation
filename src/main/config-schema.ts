/**
 * Typed, persistence-format-compatible config migration/normalization.
 *
 * This module is deliberately free of Electron and filesystem access. Random IDs,
 * provider defaults and version-specific helpers are injected from the main
 * process so migration behavior remains tied to the existing application.
 */
import { cleanId, cleanText, faviconForUrl, isPlainObject, normalizeAuthDomain, normalizeHttpsUrl, sanitizeIcon } from './input-validation.js';

type UnknownRecord = Record<string, unknown>;

export interface ConfigSchemaDependencies {
  defaultServices: readonly UnknownRecord[];
  configSchemaVersion: number;
  randomId(): string;
  shortcutForIndex(index: number): string;
  normalizeShortcut(value: unknown): string;
  normalizeLock(value: unknown): UnknownRecord | null;
  zoomChoices: readonly number[];
  defaultAppSettings: UnknownRecord;
  defaultSecurity: UnknownRecord;
  defaultDownloadSettings: UnknownRecord;
  normalizeAppSettings(raw: unknown): UnknownRecord;
  normalizeSecurity(raw: unknown): UnknownRecord;
  normalizeDownloadSettings(raw: unknown): UnknownRecord;
}

interface ProviderRecord extends UnknownRecord {
  id: string;
  name: string;
  url: string;
}

interface AccountRecord extends UnknownRecord {
  id: string;
  serviceId: string;
  name: string;
  url: string;
  icon: string;
  shortcut: string;
  favorite: boolean;
  group: string;
  tags: string[];
  preferences: UnknownRecord;
  temporary?: boolean;
}

interface ConfigRecord extends UnknownRecord {
  services?: unknown;
  accounts?: unknown;
  activeId?: unknown;
  serviceOrder?: unknown;
  accountOrder?: unknown;
  recentAccountIds?: unknown;
  settings?: unknown;
  lock?: unknown;
  version?: unknown;
}

function asRecord(value: unknown): UnknownRecord {
  return isPlainObject(value) ? value : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value as unknown[] : [];
}

function cloneServices(services: readonly UnknownRecord[]): ProviderRecord[] {
  return services.map((service) => ({ ...service }) as ProviderRecord);
}


export function createConfigSchema(dependencies: ConfigSchemaDependencies) {
  const {
    defaultServices,
    configSchemaVersion,
    randomId,
    shortcutForIndex,
    normalizeShortcut,
    normalizeLock,
    zoomChoices,
    defaultAppSettings,
    defaultSecurity,
    defaultDownloadSettings,
    normalizeAppSettings,
    normalizeSecurity,
    normalizeDownloadSettings,
  } = dependencies;

  function normalizeProviderMetadata(value: unknown): ProviderRecord {
    const service = asRecord(value);
    const out: UnknownRecord = { ...service };
    out.category = cleanText(service.category, 60);
    out.description = cleanText(service.description, 240);
    out.homepageUrl = normalizeHttpsUrl(service.homepageUrl || service.url) || service.url;
    out.loginUrl = normalizeHttpsUrl(service.loginUrl || '') || '';
    out.notes = cleanText(service.notes, 500);
    out.authDomains = [...new Set((Array.isArray(service.authDomains) ? service.authDomains : [])
      .map((entry: unknown) => normalizeAuthDomain(entry, { providerUrl: service.url }))
      .filter((entry: string | null): entry is string => Boolean(entry))
      .slice(0, 20))];
    return out as ProviderRecord;
  }

  function normalizeAccountPreferences(value: unknown): UnknownRecord {
    const account = asRecord(value);
    const raw = isPlainObject(account.preferences) ? account.preferences : {};
    const sourceTags = Array.isArray(account.tags) ? account.tags : String(account.tags || '').split(',');
    const tags = [...new Set(sourceTags.map((entry: unknown) => cleanText(entry, 32)).filter(Boolean).slice(0, 12))];
    const requestedZoom = Number(raw.pageZoom);
    const pageZoom = zoomChoices.includes(requestedZoom) ? requestedZoom : 100;
    const rawPermissions = isPlainObject(raw.permissions) ? raw.permissions : {};
    const permissions = Object.fromEntries(Object.entries(rawPermissions)
      .filter(([key, entry]) => ['camera', 'microphone', 'notifications', 'fullscreen'].includes(key) && typeof entry === 'boolean'));
    return {
      favorite: Boolean(account.favorite),
      group: cleanText(account.group, 60),
      tags,
      pageZoom,
      openOnStartup: Boolean(raw.openOnStartup),
      clearCacheOnExit: typeof raw.clearCacheOnExit === 'boolean' ? raw.clearCacheOnExit : null,
      signOutOnExit: typeof raw.signOutOnExit === 'boolean' ? raw.signOutOnExit : null,
      permissions,
    };
  }

  function makeDefaultConfig(): ConfigRecord {
    const services = cloneServices(defaultServices);
    const accounts: AccountRecord[] = services.map((service, index) => ({
      id: `${service.id}-1-${randomId()}`,
      serviceId: service.id,
      name: service.name,
      url: service.url,
      icon: typeof service.icon === 'string' ? service.icon : '',
      shortcut: shortcutForIndex(index),
      favorite: index === 0,
      group: '',
      tags: [],
      preferences: normalizeAccountPreferences({}),
      temporary: false,
    } as AccountRecord));
    return {
      version: configSchemaVersion,
      services,
      accounts,
      activeId: accounts[0]?.id ?? null,
      serviceOrder: services.map((service) => service.id),
      accountOrder: accounts.map((account) => account.id),
      settings: { ...defaultAppSettings, security: { ...defaultSecurity }, downloads: { ...defaultDownloadSettings } },
      recentAccountIds: [],
    };
  }

  function migrateLegacyStarterAccounts(next: ConfigRecord): boolean {
    // Older releases seeded exactly three untouched placeholder accounts for each
    // built-in provider. Only collapse that untouched starter state.
    const legacyIds = new Set(['chatgpt', 'claude', 'deepseek', 'gemini', 'perplexity', 'grok']);
    if (!Array.isArray(next.services) || !Array.isArray(next.accounts)) return false;
    const oldServices = asArray(next.services).map(asRecord);
    const oldAccounts = asArray(next.accounts).map(asRecord);
    if (!oldServices.length || oldServices.some((service) => !legacyIds.has(String(service.id)))) return false;
    if (oldServices.length !== legacyIds.size || oldAccounts.length !== legacyIds.size * 3) return false;

    for (const service of oldServices) {
      const accounts = oldAccounts.filter((account) => account.serviceId === service.id);
      if (accounts.length !== 3) return false;
      const expected = new Set([1, 2, 3].map((number) => `${service.name} ${number}`));
      if (accounts.some((account) => !expected.has(String(account.name)) || account.url !== service.url || account.icon !== service.icon)) return false;
    }

    const services = cloneServices(defaultServices);
    const accounts: AccountRecord[] = services.map((service, index) => {
      const old = oldAccounts.find((account) => account.serviceId === service.id && account.name === `${service.name} 1`);
      return {
        id: typeof old?.id === 'string' && old.id ? old.id : `${service.id}-1-${randomId()}`,
        serviceId: service.id,
        name: service.name,
        url: service.url,
        icon: typeof service.icon === 'string' ? service.icon : '',
        shortcut: shortcutForIndex(index),
        favorite: false,
        group: '',
        tags: [],
        preferences: normalizeAccountPreferences({}),
      } as AccountRecord;
    });

    next.services = services;
    next.accounts = accounts;
    next.activeId = accounts[0]?.id || null;
    return true;
  }

  function migrateConfig(value: unknown): ConfigRecord {
    if (!isPlainObject(value)) throw new Error('Config is not an object.');
    const next = value as ConfigRecord;
    migrateLegacyStarterAccounts(next);
    if (!Array.isArray(next.services)) next.services = cloneServices(defaultServices);
    if (!Array.isArray(next.accounts)) next.accounts = [];

    // Repair malformed legacy entries rather than allowing one bad record to poison the whole config.
    const serviceIds = new Set<string>();
    const repairedServices = asArray(next.services)
      .filter(isPlainObject)
      .map((service, index): ProviderRecord | null => {
        const id = cleanId(service.id, 120) || `custom-${randomId()}-${index}`;
        const name = cleanText(service.name) || `Provider ${index + 1}`;
        const url = normalizeHttpsUrl(service.url);
        if (!url || serviceIds.has(id)) return null;
        serviceIds.add(id);
        const repaired = normalizeProviderMetadata({ ...service, id, name, url, icon: sanitizeIcon(service.icon) || faviconForUrl(url) });
        delete repaired.usageDiscovery;
        return repaired;
      })
      .filter((service): service is ProviderRecord => Boolean(service));
    next.services = repairedServices;

    const usedShortcuts = new Set<string>();
    const usedAccountIds = new Set<string>();
    const repairedAccounts: AccountRecord[] = [];
    const accounts = asArray(next.accounts).filter(isPlainObject);

    for (const [index, account] of accounts.entries()) {
      const requestedServiceId = cleanId(account.serviceId, 120);
      const service = repairedServices.find((candidate) => candidate.id === requestedServiceId)
        || repairedServices.find((candidate) => normalizeHttpsUrl(candidate.url) === normalizeHttpsUrl(account.url));
      const accountUrl = normalizeHttpsUrl(account.url) || service?.url || '';
      if (!accountUrl) continue;
      const repairedServiceId = service?.id || requestedServiceId || `missing-${randomId()}`;
      const id = cleanId(account.id, 160) || `${repairedServiceId}-${randomId()}`;
      if (usedAccountIds.has(id)) continue;
      usedAccountIds.add(id);

      const requested = normalizeShortcut(account.shortcut || '');
      const shortcut = requested && !usedShortcuts.has(requested) ? requested : '';
      if (shortcut) usedShortcuts.add(shortcut);

      const repaired: AccountRecord = {
        ...account,
        id,
        serviceId: repairedServiceId,
        name: cleanText(account.name) || `${service?.name || 'Recovered account'} ${index + 1}`,
        url: accountUrl,
        icon: sanitizeIcon(account.icon) || (typeof service?.icon === 'string' ? service.icon : '') || faviconForUrl(accountUrl),
        shortcut,
        favorite: Boolean(account.favorite),
        group: cleanText(account.group, 60),
        tags: [...new Set((Array.isArray(account.tags) ? account.tags : [])
          .map((entry: unknown) => cleanText(entry, 32)).filter(Boolean).slice(0, 12))],
        preferences: normalizeAccountPreferences(account),
        temporary: Boolean(account.temporary),
      };
      delete repaired.usage;
      delete repaired.dailyUsage;
      repairedAccounts.push(repaired);
    }

    // Fill only missing/colliding shortcuts, preserving valid custom choices.
    for (const account of repairedAccounts) {
      if (account.shortcut) continue;
      for (let index = 0; index < repairedAccounts.length + 27; index += 1) {
        const candidate = shortcutForIndex(index);
        if (candidate && !usedShortcuts.has(candidate)) {
          account.shortcut = candidate;
          usedShortcuts.add(candidate);
          break;
        }
      }
    }
    next.accounts = repairedAccounts;
    next.recentAccountIds = Array.isArray(next.recentAccountIds)
      ? asArray(next.recentAccountIds).filter((id): id is string => typeof id === 'string' && repairedAccounts.some((account) => account.id === id)).slice(0, 10)
      : [];

    const normalizeOrder = (requested: unknown, items: readonly { id: string }[]): string[] => {
      const ids = items.map((item) => item.id);
      const valid = new Set(ids);
      const output: string[] = [];
      for (const id of asArray(requested)) {
        if (typeof id === 'string' && valid.has(id) && !output.includes(id)) output.push(id);
      }
      for (const id of ids) if (!output.includes(id)) output.push(id);
      return output;
    };
    next.serviceOrder = normalizeOrder(next.serviceOrder, repairedServices);
    next.accountOrder = normalizeOrder(next.accountOrder, repairedAccounts);
    next.activeId = repairedAccounts.some((account) => account.id === next.activeId)
      ? next.activeId
      : repairedAccounts[0]?.id || null;

    const rawSettings = isPlainObject(next.settings) ? next.settings : {};
    next.settings = {
      ...normalizeAppSettings(rawSettings),
      security: normalizeSecurity(rawSettings.security),
      downloads: normalizeDownloadSettings(rawSettings.downloads),
    };
    const lock = normalizeLock(next.lock);
    if (lock) next.lock = lock;
    else delete next.lock;
    next.version = configSchemaVersion;
    return next;
  }

  return { normalizeProviderMetadata, normalizeAccountPreferences, makeDefaultConfig, migrateLegacyStarterAccounts, migrateConfig };
}

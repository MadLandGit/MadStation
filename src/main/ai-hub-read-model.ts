/** Typed AI Hub ordering and renderer read-model projection.
 *
 * The functions here are pure apart from applying an explicitly requested
 * order to the supplied config object. Filesystem icon resolution and runtime
 * status remain injected by the Electron composition root.
 */

export interface AiHubReadModelEntity extends Record<string, unknown> {
  id: string;
  name?: string;
  serviceId?: string;
  url?: string;
  icon?: unknown;
  shortcut?: string;
  favorite?: unknown;
  group?: unknown;
  tags?: unknown;
  preferences?: unknown;
  temporary?: unknown;
}

export interface AiHubReadModelConfig extends Record<string, unknown> {
  services: AiHubReadModelEntity[];
  accounts: AiHubReadModelEntity[];
  serviceOrder?: unknown;
  accountOrder?: unknown;
  recentAccountIds?: unknown;
}

export interface AiHubOrderConfig extends Record<string, unknown> {
  serviceOrder?: unknown;
  accountOrder?: unknown;
}

export interface AiHubReadModelDependencies {
  base: Record<string, unknown>;
  locked: boolean;
  config: AiHubReadModelConfig;
  activeId: string | null;
  accountRuntime: ReadonlyMap<string, { lastError?: unknown }>;
  localIconFor(service: AiHubReadModelEntity | null | undefined): string;
  sanitizeIcon(value: unknown): string;
  faviconForUrl(value: unknown): string;
  iconCandidatesFor(
    service: AiHubReadModelEntity,
    preferred?: string,
    options?: { includeCachedRemote?: boolean },
  ): string[];
  normalizeAccountPreferences(account: AiHubReadModelEntity): Record<string, unknown>;
}

/** Preserve configured ranks and append unknown/missing ranks in input order. */
export function orderedConfigItems<T extends { id: string }>(items: readonly T[], order: unknown): T[] {
  const rank = new Map<unknown, number>(
    (Array.isArray(order) ? order : []).map((id: unknown, index: number) => [id, index]),
  );
  return [...items].sort((a, b) => (rank.get(a.id) ?? 999999) - (rank.get(b.id) ?? 999999));
}

/** Validate a complete, duplicate-free reorder request and apply it atomically. */
export function reorderConfigCollection(
  config: AiHubOrderConfig,
  orderKey: 'serviceOrder' | 'accountOrder',
  ids: unknown,
): boolean {
  const current = config[orderKey];
  if (!Array.isArray(current) || !Array.isArray(ids) || ids.length !== current.length) return false;
  const allowed = new Set<unknown>(current);
  const next: string[] = [];
  for (const id of ids) {
    if (typeof id !== 'string' || !allowed.has(id) || next.includes(id)) return false;
    next.push(id);
  }
  config[orderKey] = next;
  return true;
}

/** Build the non-sensitive AI Hub config projection consumed by the renderer. */
export function buildAiHubReadModel(dependencies: AiHubReadModelDependencies): Record<string, unknown> {
  const {
    base,
    locked,
    config,
    activeId,
    accountRuntime,
    localIconFor,
    sanitizeIcon,
    faviconForUrl,
    iconCandidatesFor,
    normalizeAccountPreferences,
  } = dependencies;

  if (locked) return { ...base, services: [], accounts: [], activeId: null };

  const services: AiHubReadModelEntity[] = orderedConfigItems(config.services, config.serviceOrder).map((service) => ({
    ...service,
    icon: localIconFor(service) || sanitizeIcon(service.icon) || faviconForUrl(service.url),
    iconCandidates: iconCandidatesFor(service, typeof service.icon === 'string' ? service.icon : ''),
  }));
  const serviceMap = new Map(services.map((service) => [service.id, service] as const));
  const orderedAccounts = orderedConfigItems(config.accounts, config.accountOrder);
  const accounts = orderedAccounts.map((account) => {
    const { id, serviceId, name, icon, url, shortcut } = account;
    const service = serviceMap.get(serviceId || '');
    const backingService = config.services.find((item) => item.id === serviceId) || null;
    const preferred = sanitizeIcon(icon);
    const candidateService = backingService || {
      url,
      name: 'Missing provider',
      id: serviceId || '',
      icon: preferred,
    };
    const candidates = iconCandidatesFor(candidateService, preferred, { includeCachedRemote: false });
    const runtime = accountRuntime.get(id);
    const safeBackingIcon = localIconFor(backingService)
      || sanitizeIcon(backingService?.icon)
      || faviconForUrl(backingService?.url || url)
      || '';
    const accountIcon = candidates[0] || preferred || safeBackingIcon;
    return {
      id,
      serviceId,
      name,
      icon: accountIcon,
      iconCandidates: candidates,
      url,
      shortcut,
      favorite: Boolean(account.favorite),
      group: account.group || '',
      tags: account.tags || [],
      preferences: normalizeAccountPreferences(account),
      temporary: Boolean(account.temporary),
      status: runtime?.lastError ? 'error' : 'ready',
      lastError: runtime?.lastError || '',
      providerMissing: !service,
    };
  });

  return {
    ...base,
    services,
    serviceOrder: services.map((service) => service.id),
    accountOrder: orderedAccounts.map((account) => account.id),
    accounts,
    activeId,
    recentAccountIds: Array.isArray(config.recentAccountIds) ? config.recentAccountIds : [],
  };
}

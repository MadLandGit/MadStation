/** Typed account transfer and workspace backup transformations.
 *
 * The Electron host owns native file dialogs, filesystem reads/writes, IPC
 * authorization, persistence timing, and session teardown. This module owns
 * only the versioned transfer formats and data-only import/restore preparation.
 */

type UnknownRecord = Record<string, unknown>;

export interface TransferProvider extends UnknownRecord {
  id: string;
  name: string;
  url: string;
  icon?: string;
}

export interface TransferAccount extends UnknownRecord {
  id: string;
  serviceId: string;
  name: string;
  url: string;
  icon: string;
  shortcut: string;
  temporary?: boolean;
  preferences?: UnknownRecord;
}

export interface TransferConfig extends UnknownRecord {
  services: TransferProvider[];
  accounts: TransferAccount[];
  serviceOrder?: string[];
  accountOrder?: string[];
  activeId?: string | null;
}

export interface WorkspaceTransferDependencies {
  cleanText(value: unknown, max?: number): string;
  normalizeHttpsUrl(value: unknown): string | null;
  sanitizeIcon(value: unknown): string;
  faviconForUrl(value: unknown): string;
  normalizeProviderMetadata(value: UnknownRecord): TransferProvider;
  normalizeAccountPreferences(value: unknown): UnknownRecord;
  randomId(): string;
  migrateConfig(value: unknown): TransferConfig;
}

export type TransferFailure = { ok: false; error: string };
export type AccountImportSuccess = { ok: true; count: number; config: TransferConfig };
export type AccountImportResult = AccountImportSuccess | TransferFailure;

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function accountExportRecord(account: TransferAccount): TransferAccount {
  return { ...account, temporary: false };
}

export function createWorkspaceTransferController(dependencies: WorkspaceTransferDependencies) {
  const {
    cleanText,
    normalizeHttpsUrl,
    sanitizeIcon,
    faviconForUrl,
    normalizeProviderMetadata,
    normalizeAccountPreferences,
    randomId,
    migrateConfig,
  } = dependencies;

  function createAccountExport(config: TransferConfig, exportedAt: string): UnknownRecord {
    return {
      format: 'mad-station-accounts',
      version: 1,
      exportedAt,
      services: config.services,
      accounts: config.accounts.map(accountExportRecord),
    };
  }

  /**
   * Prepare an import as a new config value. The caller must not commit it until
   * preparation succeeds; existing config/arrays are never mutated in place.
   * Invalid individual rows are skipped as legacy behavior intended, while a
   * malformed transfer envelope is rejected as a whole.
   */
  function prepareAccountImport(rawValue: unknown, currentConfig: TransferConfig): AccountImportResult {
    const raw = asRecord(rawValue);
    if (raw?.format !== 'mad-station-accounts' || !Array.isArray(raw.accounts) || !Array.isArray(raw.services)) {
      return { ok: false, error: 'That file is not a valid Mad Station account export.' };
    }

    const rawServices = raw.services.map(asRecord);
    const rawAccounts = raw.accounts.map(asRecord);
    const services = currentConfig.services.map((service) => ({ ...service }));
    const accounts = currentConfig.accounts.map((account) => ({ ...account }));
    const serviceOrder = [...(Array.isArray(currentConfig.serviceOrder) ? currentConfig.serviceOrder : services.map((service) => service.id))];
    const accountOrder = [...(Array.isArray(currentConfig.accountOrder) ? currentConfig.accountOrder : accounts.map((account) => account.id))];
    const nextConfig: TransferConfig = {
      ...currentConfig,
      services,
      accounts,
      serviceOrder,
      accountOrder,
    };

    const existingNames = new Set(accounts.map((account) => account.name.toLowerCase()));
    const serviceByName = new Map(services.map((service) => [service.name.toLowerCase(), service]));

    for (const incoming of rawServices) {
      if (!incoming) continue;
      const url = normalizeHttpsUrl(incoming.url);
      const name = cleanText(incoming.name);
      if (!url || !name) continue;
      if (serviceByName.has(name.toLowerCase())) continue;

      const service = normalizeProviderMetadata({
        ...incoming,
        id: `imported-${randomId()}`,
        name,
        url,
        icon: sanitizeIcon(incoming.icon) || faviconForUrl(url),
      });
      services.push(service);
      serviceByName.set(name.toLowerCase(), service);
      serviceOrder.push(service.id);
    }

    const importedIds: string[] = [];
    for (const incoming of rawAccounts) {
      if (!incoming) continue;
      const sourceProvider = rawServices.find((service) => service && service.id === incoming.serviceId);
      const sourceProviderName = asString(sourceProvider?.name).toLowerCase();
      const service = (sourceProviderName
        ? services.find((candidate) => candidate.name.toLowerCase() === sourceProviderName)
        : undefined) || services.find((candidate) => candidate.id === incoming.serviceId) || null;
      const url = normalizeHttpsUrl(incoming.url || service?.url);
      const name = cleanText(incoming.name);
      if (!service || !url || !name) continue;

      let finalName = name;
      let suffix = 2;
      while (existingNames.has(finalName.toLowerCase())) {
        finalName = `${name} ${suffix++}`;
      }
      existingNames.add(finalName.toLowerCase());

      const account: TransferAccount = {
        ...incoming,
        id: `${service.id}-${randomId()}`,
        serviceId: service.id,
        name: finalName,
        url,
        icon: sanitizeIcon(incoming.icon) || service.icon || faviconForUrl(url),
        shortcut: '',
        temporary: false,
        preferences: normalizeAccountPreferences(incoming),
      } as TransferAccount;
      accounts.push(account);
      accountOrder.push(account.id);
      importedIds.push(account.id);
    }

    return { ok: true, count: importedIds.length, config: nextConfig };
  }

  function createWorkspaceBackup(config: TransferConfig, appVersion: string, createdAt: string): UnknownRecord {
    return {
      format: 'mad-station-backup',
      version: 1,
      appVersion,
      createdAt,
      config,
    };
  }

  /** Accept the current versioned backup envelope and historical raw-config files. */
  function prepareWorkspaceRestore(rawValue: unknown): TransferConfig {
    const raw = asRecord(rawValue);
    const candidate = raw?.format === 'mad-station-backup' ? raw.config : rawValue;
    return migrateConfig(candidate);
  }

  return {
    createAccountExport,
    prepareAccountImport,
    createWorkspaceBackup,
    prepareWorkspaceRestore,
  };
}

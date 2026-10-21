/** Typed settings command layer. Electron sender/lock checks remain in the main IPC wrapper. */

import {
  DEFAULT_APP_SETTINGS,
  DEFAULT_SECURITY,
  normalizeAppSettings,
  normalizeSecurity,
  type AppSettings,
  type SecuritySettings,
} from './settings.js';
import type { DownloadSettings } from './downloads.js';

export type PersistedSettings = AppSettings & {
  security: SecuritySettings;
  downloads: DownloadSettings;
};

export interface SettingsControllerDependencies {
  getSettings(): PersistedSettings;
  setSettings(settings: PersistedSettings): void;
  getSecurity(): SecuritySettings;
  setSecurity(settings: SecuritySettings): void;
  getDownloads(): DownloadSettings;
  setDownloads(settings: DownloadSettings): void;
  normalizeDownloads(value: unknown): DownloadSettings;
  defaultDownloads: DownloadSettings;
  applyLiveAppSettings(): void;
  applyLiveSecurity(): void;
  broadcastConfig(): unknown;
  isManagedBackgroundUrl(value: unknown): boolean;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Keeps settings transitions independently testable while leaving Electron
 * sender validation, lock checks, dialog access, and persistence orchestration
 * with the existing main process.
 */
export function createSettingsController(dependencies: SettingsControllerDependencies) {
  function setAppSettings(patch: unknown) {
    const patchRecord = isPlainObject(patch) ? patch : {};
    const current = dependencies.getSettings();
    const normalized = normalizeAppSettings({ ...current, ...patchRecord });
    const safeBackgrounds = normalized.customBackgrounds.filter((item) => item.type !== 'local' || dependencies.isManagedBackgroundUrl(item.url));
    const next: PersistedSettings = {
      ...normalizeAppSettings({ ...normalized, customBackgrounds: safeBackgrounds }),
      // These namespaces have dedicated handlers and must not be overwritten
      // by a general application-settings patch.
      security: current.security,
      downloads: current.downloads,
    };
    dependencies.setSettings(next);
    dependencies.applyLiveAppSettings();
    dependencies.broadcastConfig();
    return { ok: true, settings: next };
  }

  function resetSettings() {
    const next: PersistedSettings = {
      ...DEFAULT_APP_SETTINGS,
      security: { ...DEFAULT_SECURITY },
      downloads: { ...dependencies.defaultDownloads },
    };
    dependencies.setSettings(next);
    dependencies.applyLiveAppSettings();
    dependencies.applyLiveSecurity();
    dependencies.broadcastConfig();
    return { ok: true, settings: next };
  }

  function setSecuritySettings(patch: unknown) {
    const patchRecord = isPlainObject(patch) ? patch : {};
    const next = normalizeSecurity({ ...dependencies.getSecurity(), ...patchRecord });
    dependencies.setSecurity(next);
    dependencies.applyLiveSecurity();
    dependencies.broadcastConfig();
    return { ok: true, settings: dependencies.getSettings() };
  }

  function setDownloadSettings(patch: unknown) {
    const patchRecord = isPlainObject(patch) ? patch : {};
    const next = dependencies.normalizeDownloads({ ...dependencies.getDownloads(), ...patchRecord });
    dependencies.setDownloads(next);
    dependencies.broadcastConfig();
    return { ok: true, settings: dependencies.getSettings() };
  }

  return { setAppSettings, resetSettings, setSecuritySettings, setDownloadSettings };
}

import type { DownloadManager, DownloadSettings } from './downloads.js';

export type DownloadAction = 'open' | 'show' | 'cancel' | 'pause' | 'resume' | 'remove' | 'clear-finished' | 'open-folder';
const DOWNLOAD_ACTIONS = new Set<DownloadAction>(['open', 'show', 'cancel', 'pause', 'resume', 'remove', 'clear-finished', 'open-folder']);

export interface DownloadDialogResult {
  canceled: boolean;
  filePaths?: string[];
}

export interface DownloadsControllerDependencies {
  manager: DownloadManager;
  getDownloadSettings(): DownloadSettings;
  setDownloadSettings(settings: DownloadSettings): void;
  getSettingsSnapshot(): unknown;
  normalizeSettings(value: unknown): DownloadSettings;
  chooseDirectory(options: { title: string; defaultPath: string; properties: Array<'openDirectory' | 'createDirectory'> }): Promise<DownloadDialogResult>;
  broadcastConfig(): unknown;
}

/** Typed command layer for downloads IPC. Renderer callers can address entries by ID only. */
export function createDownloadsController(dependencies: DownloadsControllerDependencies) {
  async function chooseFolder() {
    const currentFolder = dependencies.manager.getState().folder;
    const result = await dependencies.chooseDirectory({
      title: 'Choose download folder',
      defaultPath: currentFolder,
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths?.[0]) return { ok: false as const, canceled: true as const };
    const next = dependencies.normalizeSettings({ ...dependencies.getDownloadSettings(), folder: result.filePaths[0] });
    if (!next.folder) return { ok: false as const, error: 'That folder cannot be used.' };
    dependencies.setDownloadSettings(next);
    dependencies.broadcastConfig();
    return { ok: true as const, settings: dependencies.getSettingsSnapshot() };
  }

  function performAction(actionInput: unknown, idInput: unknown) {
    if (typeof actionInput !== 'string' || !DOWNLOAD_ACTIONS.has(actionInput as DownloadAction)) {
      return { ok: false, error: 'Unknown download action.' };
    }
    const action = actionInput as DownloadAction;
    const id = typeof idInput === 'string' ? idInput.slice(0, 80) : '';
    switch (action) {
      case 'open': return dependencies.manager.open(id);
      case 'show': return dependencies.manager.show(id);
      case 'cancel': return dependencies.manager.cancel(id);
      case 'pause': return dependencies.manager.pause(id);
      case 'resume': return dependencies.manager.resume(id);
      case 'remove': return dependencies.manager.remove(id);
      case 'clear-finished': return dependencies.manager.clearFinished();
      case 'open-folder': return dependencies.manager.openFolder();
    }
  }

  function getDownloads() {
    return { ok: true as const, ...dependencies.manager.getState() };
  }

  return { chooseFolder, performAction, getDownloads };
}

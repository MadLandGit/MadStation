import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { ApiResult, ToolbarApi, ToolbarNavigationAction, ToolbarState } from './shared/api-contract';
import { isSafeIpcPayload } from './shared/ipc-validation.js';

function invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
  if (!isSafeIpcPayload(args)) {
    return Promise.reject(new TypeError(`Invalid payload for IPC channel: ${channel}`));
  }
  return ipcRenderer.invoke(channel, ...args) as Promise<T>;
}

function subscribe<T>(channel: string, callback: (data: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, data: T): void => callback(data);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api: ToolbarApi = {
  getState: () => invoke<ToolbarState | { error: string }>('toolbar-get-state'),
  navigate: (action: ToolbarNavigationAction) => invoke<ApiResult>('navigate', action),
  openExternal: () => invoke<ApiResult>('open-external'),
  windowMinimize: () => invoke<ApiResult>('window-minimize'),
  windowToggleMaximize: () => invoke<ApiResult>('window-toggle-maximize'),
  windowClose: () => invoke<ApiResult>('window-close'),
  toggleSidebar: () => invoke<ApiResult>('toggle-sidebar'),
  showSidebar: () => invoke<ApiResult>('set-sidebar-hidden', false),
  onState: (callback) => subscribe('toolbar-state', callback),
  onSidebarState: (callback) => subscribe('sidebar-state', callback),
};

contextBridge.exposeInMainWorld('aiHubToolbar', api);

'use strict';
const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  if (typeof callback !== 'function') return () => {};
  const listener = (_event, payload) => {
    try { callback(payload); } catch { /* Keep inspector rendering isolated from diagnostic callbacks. */ }
  };
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('madStationDebugInspector', Object.freeze({
  onSnapshot: (callback) => subscribe('developer-debug-snapshot', callback),
  onState: (callback) => subscribe('developer-debug-window-state', callback),
  setPinned: (pinned) => ipcRenderer.invoke('developer-debug-window-set-pinned', Boolean(pinned)),
  copyText: (text) => ipcRenderer.invoke('developer-debug-window-copy-text', typeof text === 'string' ? text.slice(0, 100000) : ''),
  clearClickTrace: () => ipcRenderer.invoke('developer-debug-window-clear-click'),
  getDebugSettings: () => ipcRenderer.invoke('developer-debug-window-get-settings'),
  setDebugSettings: (settings) => ipcRenderer.invoke('developer-debug-window-set-settings', settings),
  onSettingsSync: (callback) => subscribe('developer-debug-window-settings-sync', callback),
  searchElements: (payload) => ipcRenderer.invoke('developer-debug-window-search-elements', payload),
  highlightElement: (selector, shadowHosts = []) => ipcRenderer.invoke('developer-debug-window-highlight-element', { selector, shadowHosts }),
  manageHiddenElements: (action, token = '') => ipcRenderer.invoke('developer-debug-window-manage-hidden-elements', { action, token }),
}));

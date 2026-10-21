/* Secure host bridge for Simple's Home v5 design. Keeps all native actions in the main host. */
(function () {
  'use strict';
  const CHANNEL = 'madstation-home-v2';
  const isFramed = window.parent !== window;
  const allowedMemoryActions = new Set(['refresh', 'cleanup', 'details']);
  let ready = false;

  function sendHost(type, detail = {}) {
    if (!isFramed) return false;
    try { window.parent.postMessage({ channel: CHANNEL, type, ...detail }, '*'); return true; }
    catch { return false; }
  }
  window.MadHomeApps?.setLauncher?.((target) => {
    if (typeof target === 'string' && target.length <= 80) sendHost('launch', { target });
  });
  if (window.MadHome) {
    window.MadHome.inApp = isFramed || Boolean(window.MadStationMemoryMonitor);
    window.MadHome.toggleTheme = () => sendHost('toggle-theme');
    window.MadHome.memoryAction = (action) => { if (allowedMemoryActions.has(action)) sendHost('memory-action', { action }); };
  }
  document.getElementById('launcherSettingsBtn')?.addEventListener('click', () => sendHost('open-settings'));

  function applySettings(settings) {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return;
    try { window.applyAppearance?.(settings); }
    catch (error) { console.warn('Could not apply host Appearance to Simple', error); }
  }
  window.addEventListener('message', (event) => {
    if (!isFramed || event.source !== window.parent || event.data?.channel !== CHANNEL) return;
    const message = event.data;
    if (!message || typeof message.type !== 'string') return;
    if (message.type === 'host-ping') {
      if (ready) sendHost('home-ready');
    } else if (message.type === 'appearance-settings') {
      applySettings(message.settings);
    } else if (message.type === 'memory-model' && message.model && typeof message.model === 'object' && !Array.isArray(message.model)) {
      document.dispatchEvent(new CustomEvent('mad:memory-model', { detail: message.model }));
    } else if (message.type === 'stats') {
      window.MadHome?.setStats?.({ accounts: message.accounts, providers: message.providers });
    }
  });
  window.addEventListener('error', () => { if (!ready) sendHost('home-error'); });
  window.addEventListener('unhandledrejection', () => { if (!ready) sendHost('home-error'); });
  function markReady() { ready = true; sendHost('home-ready'); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', markReady, { once: true });
  else queueMicrotask(markReady);
})();

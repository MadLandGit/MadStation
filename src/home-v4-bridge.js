/* Secure bridge for the isolated 3D Parallax Big App homepage. */
(function () {
  'use strict';
  const CHANNEL = 'madstation-home-parallax-big';
  const isFramed = window.parent !== window;
  const allowedMemoryActions = new Set(['refresh', 'cleanup', 'details']);
  let ready = false;

  function sendHost(type, detail = {}) {
    if (!isFramed) return false;
    try { window.parent.postMessage({ channel: CHANNEL, type, ...detail }, '*'); return true; }
    catch { return false; }
  }

  function updateFxColor() {
    const color = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    let rgb = null;
    const hex = color.match(/^#([0-9a-f]{6})$/i);
    if (hex) {
      const value = hex[1];
      rgb = [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)];
    } else {
      const match = color.match(/^rgba?\(\s*(\d+)\D+(\d+)\D+(\d+)/i);
      if (match) rgb = [Number(match[1]), Number(match[2]), Number(match[3])];
    }
    if (rgb) document.body.style.setProperty('--fxc', rgb.join(' '));
  }

  window.MadHomeApps?.setLauncher?.((target) => {
    if (typeof target === 'string' && target.length <= 80) sendHost('launch', { target });
  });
  if (window.MadHome) {
    window.MadHome.inApp = isFramed || Boolean(window.MadStationMemoryMonitor);
    window.MadHome.toggleTheme = () => {
      if (isFramed) { sendHost('toggle-theme'); return; }
      const current = document.body.dataset.theme;
      const next = current === 'light' ? 'dark' : 'light';
      document.body.dataset.theme = next;
      updateFxColor();
    };
    window.MadHome.memoryAction = (action) => {
      if (allowedMemoryActions.has(action)) sendHost('memory-action', { action });
    };
  }

  document.getElementById('launcherSettingsBtn')?.addEventListener('click', () => sendHost('open-settings'));
  window.addEventListener('message', (event) => {
    if (!isFramed || event.source !== window.parent || event.data?.channel !== CHANNEL) return;
    const message = event.data;
    if (!message || typeof message.type !== 'string') return;
    if (message.type === 'host-ping') {
      if (ready) sendHost('home-ready');
    } else if (message.type === 'appearance-settings') {
      window.applyAppearance?.(message.settings);
      updateFxColor();
      window.MadHome?.refreshMotion?.();
    } else if (message.type === 'stats') {
      const accounts = Number(message.accounts);
      const providers = Number(message.providers);
      window.MadHome?.setStats?.({
        accounts: Number.isFinite(accounts) ? Math.max(0, Math.floor(accounts)) : 0,
        providers: Number.isFinite(providers) ? Math.max(0, Math.floor(providers)) : 0,
      });
    } else if (message.type === 'memory-model' && message.model && typeof message.model === 'object' && !Array.isArray(message.model)) {
      document.dispatchEvent(new CustomEvent('mad:memory-model', { detail: message.model }));
    }
  });

  window.addEventListener('error', () => { if (!ready) sendHost('home-error'); });
  window.addEventListener('unhandledrejection', () => { if (!ready) sendHost('home-error'); });
  function markReady() {
    ready = true;
    updateFxColor();
    sendHost('home-ready');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', markReady, { once: true });
  else queueMicrotask(markReady);
})();

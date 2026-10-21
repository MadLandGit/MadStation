/* Secure, narrow bridge between the isolated 3D Parallax Home and the app host. */
(function () {
  'use strict';
  const CHANNEL = 'madstation-home-parallax';
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

  function applySettings(settings) {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return;
    try { window.applyAppearance?.(settings); } catch (error) { console.warn('Could not apply host Appearance settings to 3D Parallax Home', error); }
    updateFxColor();
    window.MadHome?.refreshMotion?.();
  }

  // The tile registry calls this function for every real workspace launch.
  window.MadHomeApps?.setLauncher?.((target) => {
    if (typeof target === 'string' && target.length <= 80) sendHost('launch', { target });
  });

  document.getElementById('launcherSettingsBtn')?.addEventListener('click', () => sendHost('open-settings'));

  if (window.MadHome) {
    window.MadHome.inApp = isFramed || Boolean(window.MadStationMemoryMonitor);
    window.MadHome.toggleTheme = () => {
      if (isFramed) { sendHost('toggle-theme'); return; }
      const current = document.body.dataset.theme;
      const next = current === 'light' ? 'dark' : 'light';
      document.body.dataset.theme = next;
      try { localStorage.setItem('mad-home-v7-theme', next); } catch {}
      updateFxColor();
    };
    window.MadHome.memoryAction = (action) => {
      if (allowedMemoryActions.has(action)) sendHost('memory-action', { action });
    };
  }

  window.addEventListener('message', (event) => {
    if (!isFramed || event.source !== window.parent || event.data?.channel !== CHANNEL) return;
    const message = event.data;
    if (!message || typeof message.type !== 'string') return;
    if (message.type === 'host-ping') {
      if (ready) sendHost('home-ready');
      return;
    }
    if (message.type === 'appearance-settings') {
      applySettings(message.settings);
    } else if (message.type === 'stats') {
      window.MadHome?.setStats?.({ accounts: message.accounts, providers: message.providers });
    } else if (message.type === 'memory-model' && message.model && typeof message.model === 'object' && !Array.isArray(message.model)) {
      document.dispatchEvent(new CustomEvent('mad:memory-model', { detail: message.model }));
    }
  });

  // In the main app, all telemetry is host-fed. Demo values only run when opened standalone.
  document.addEventListener('mad:memory-model', updateFxColor);
  function markReady() {
    ready = true;
    updateFxColor();
    sendHost('home-ready');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', markReady, { once: true });
  else queueMicrotask(markReady);
})();

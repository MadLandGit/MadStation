/* Trusted runtime bridge appended by the theme ZIP importer.
 * ZIP-supplied bridge/preload code is never used. Only narrowly allow-listed commands cross into the host.
 */
(() => {
  'use strict';
  const config = window.MadStationThemeConfig && typeof window.MadStationThemeConfig === 'object' ? window.MadStationThemeConfig : {};
  const CHANNEL = typeof config.channel === 'string' && /^madstation-home-[a-z0-9-]{1,90}$/.test(config.channel) ? config.channel : '';
  const isFramed = window.parent !== window && Boolean(CHANNEL);
  const ALLOWED_TARGETS = new Set(['ai-hub', 'instruction-forge', 'ai-lab', 'video-hub', 'image-hub', 'clipboard']);
  const ALLOWED_MEMORY_ACTIONS = new Set(['refresh', 'cleanup', 'details']);
  const themeModes = new Set(Array.isArray(config.themes) ? config.themes.map((item) => item && typeof item.id === 'string' ? item.id : '').filter((id) => /^(?:legacy|v2|retro|retro-complex|parallax|parallax-big|galaxy|parallax-jungle|claymorphism|glass|custom-[a-z0-9-]{1,64})$/.test(id)) : []);
  const targetAliases = new Map([
    ['ai hub', 'ai-hub'], ['ai-hub', 'ai-hub'], ['hub', 'ai-hub'],
    ['prompt studio', 'instruction-forge'], ['instruction forge', 'instruction-forge'], ['instruction-forge', 'instruction-forge'],
    ['ai playground', 'ai-lab'], ['ai-lab', 'ai-lab'], ['playground', 'ai-lab'],
    ['video hub', 'video-hub'], ['video-hub', 'video-hub'],
    ['image hub', 'image-hub'], ['image-hub', 'image-hub'],
    ['notes', 'clipboard'], ['notes and tasks', 'clipboard'], ['notes & tasks', 'clipboard'], ['clipboard', 'clipboard'],
  ]);
  let ready = false;
  const normalizeTarget = (raw) => {
    if (typeof raw !== 'string') return '';
    const value = raw.trim().toLowerCase().replace(/[_]+/g, '-');
    if (ALLOWED_TARGETS.has(value)) return value;
    const spaced = value.replace(/-/g, ' ').replace(/\s+/g, ' ');
    return targetAliases.get(spaced) || '';
  };
  const sendHost = (type, detail = {}) => {
    if (!isFramed || !type) return false;
    try { window.parent.postMessage({ channel: CHANNEL, type, ...detail }, '*'); return true; }
    catch { return false; }
  };
  const launch = (target) => {
    const safeTarget = normalizeTarget(target);
    return safeTarget ? sendHost('launch', { target: safeTarget }) : false;
  };
  const openSettings = () => sendHost('open-settings');
  const setHomepage = (mode) => themeModes.has(mode) ? sendHost('set-homepage', { mode }) : false;
  const toggleTheme = () => sendHost('toggle-theme');
  const setSeason = (season) => ['spring', 'summer', 'autumn', 'winter'].includes(season) ? sendHost('set-season', { season }) : false;
  const memoryAction = (action) => ALLOWED_MEMORY_ACTIONS.has(action) ? sendHost('memory-action', { action }) : false;
  window.MadStationTheme = Object.freeze({ launch, openSettings, setHomepage, toggleTheme, setSeason, memoryAction });

  // Existing visual renderers expose a launcher registration point. Bind that known hook first.
  try { window.MadHomeApps?.setLauncher?.((target) => { launch(target); }); } catch { /* The delegated bridge below remains available. */ }
  if (window.MadHome && typeof window.MadHome === 'object') {
    window.MadHome.inApp = isFramed;
    window.MadHome.toggleTheme = toggleTheme;
    window.MadHome.memoryAction = memoryAction;
  }

  const appSurfaceSelector = [
    '.tile', '.pl', '.fr', '.open', '.app-tile', '.app-card', '.app-button', '.app-surface',
    '[data-app-id]', '[data-launch-target]', '[data-app]', '[data-ms-action]', '[role="button"]',
  ].join(',');
  const normalizedText = (element) => [
    element?.getAttribute?.('data-app-id'), element?.getAttribute?.('data-launch-target'), element?.getAttribute?.('data-app'),
    element?.getAttribute?.('data-id'), element?.getAttribute?.('aria-label'), element?.getAttribute?.('title'),
    element?.id, element?.textContent,
  ].filter((value) => typeof value === 'string').join(' ').toLowerCase().replace(/\s+/g, ' ').trim();
  const surfaceTarget = (surface) => {
    for (const raw of [surface?.dataset?.appId, surface?.dataset?.launchTarget, surface?.dataset?.app, surface?.dataset?.id]) {
      const target = normalizeTarget(raw);
      if (target) return target;
    }
    const text = normalizedText(surface);
    for (const [label, target] of targetAliases) if (text === label || text.includes(label)) return target;
    return '';
  };
  const hasAction = (element) => element instanceof Element ? element.closest('[data-ms-action]') : null;
  const handleAction = (value, event) => {
    const action = String(value || '').trim();
    let sent = false;
    if (/^launch:[a-z0-9-]+$/i.test(action)) sent = launch(action.slice('launch:'.length));
    else if (['settings', 'open-settings'].includes(action)) sent = openSettings();
    else if (['toggle-theme', 'theme:toggle'].includes(action)) sent = toggleTheme();
    else if (action.startsWith('homepage:')) sent = setHomepage(action.slice('homepage:'.length));
    else if (action.startsWith('season:')) sent = setSeason(action.slice('season:'.length));
    else if (action.startsWith('memory:')) sent = memoryAction(action.slice('memory:'.length));
    if (sent) { event?.preventDefault?.(); event?.stopPropagation?.(); event?.stopImmediatePropagation?.(); }
    return sent;
  };
  document.addEventListener('click', (event) => {
    const rawTarget = event.target;
    if (!(rawTarget instanceof Element)) return;
    // The native Quick Access controller owns its own nested menu and keyboard/focus behavior.
    if (rawTarget.closest('[data-theme-quick-access]')) return;
    const explicit = hasAction(rawTarget);
    if (explicit && handleAction(explicit.getAttribute('data-ms-action'), event)) return;
    const settingsButton = rawTarget.closest('#launcherSettingsBtn, #settingsBtn, [data-ms-settings]');
    if (settingsButton) { openSettings(); event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation(); return; }
    const themeToggle = rawTarget.closest('#themeBtn, [data-ms-action="toggle-theme"], [data-ms-action="theme:toggle"]');
    if (themeToggle) { toggleTheme(); event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation(); return; }
    const surface = rawTarget.closest(appSurfaceSelector);
    if (!surface) return;
    const visibleLabel = normalizedText(surface);
    if (/\bsettings\b|\bappearance\b/.test(visibleLabel)) { openSettings(); event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation(); return; }
    const target = surfaceTarget(surface);
    if (!target) return;
    launch(target);
    event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
  }, true);
  document.addEventListener('keydown', (event) => {
    if (!['Enter', ' '].includes(event.key) || !(event.target instanceof Element)) return;
    const explicit = hasAction(event.target);
    if (explicit) { handleAction(explicit.getAttribute('data-ms-action'), event); return; }
    const surface = event.target.closest(appSurfaceSelector);
    if (surface && surface.getAttribute('role') === 'button' && surfaceTarget(surface)) {
      launch(surfaceTarget(surface)); event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
    }
  }, true);

  function applySettings(settings) {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return;
    try { window.applyAppearance?.(settings); } catch { /* keep the visual theme usable if a setting is unsupported */ }
    if (['dark', 'light', 'system'].includes(settings.theme)) {
      document.body.dataset.theme = settings.theme;
      document.documentElement.dataset.theme = settings.theme;
    }
    window.dispatchEvent(new CustomEvent('madstation:appearance-settings', { detail: settings }));
  }
  window.addEventListener('message', (event) => {
    if (!isFramed || event.source !== window.parent || event.data?.channel !== CHANNEL) return;
    const message = event.data;
    if (!message || typeof message.type !== 'string') return;
    if (message.type === 'host-ping') { if (ready) sendHost('home-ready'); }
    else if (message.type === 'appearance-settings') applySettings(message.settings);
    else if (message.type === 'quick-access-state') window.dispatchEvent(new CustomEvent('madstation:theme-quick-access-state', { detail: message }));
    else if (message.type === 'stats') window.MadHome?.setStats?.({ accounts: message.accounts, providers: message.providers });
    else if (message.type === 'memory-model' && message.model && typeof message.model === 'object' && !Array.isArray(message.model)) document.dispatchEvent(new CustomEvent('mad:memory-model', { detail: message.model }));
  });
  window.addEventListener('error', () => { if (!ready) sendHost('home-error'); });
  window.addEventListener('unhandledrejection', () => { if (!ready) sendHost('home-error'); });
  function markReady() { ready = true; sendHost('home-ready'); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', markReady, { once: true });
  else queueMicrotask(markReady);
})();

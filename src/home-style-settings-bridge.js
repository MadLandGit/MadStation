/* Shared host bridge for every isolated homepage style.
 * Synchronizes Appearance mode/design settings while preserving each launcher’s native accent palette; season state is exclusive to Parallax Jungle.
 */
(() => {
  'use strict';
  const framed = window.parent !== window;
  const validSeasons = new Set(['spring', 'summer', 'autumn', 'winter']);
  const pageChannels = {
    'home-v2.html': 'madstation-home-v2',
    'home-retro.html': 'madstation-home-simple-retro',
    'home-retro-complex.html': 'madstation-home-retro-complex',
    'home-v3.html': 'madstation-home-parallax',
    'home-v4.html': 'madstation-home-parallax-big',
    'home-galaxy.html': 'madstation-home-galaxy',
    'home-parallax-jungle.html': 'madstation-home-parallax-jungle',
    'home-claymorphism.html': 'madstation-home-claymorphism',
    'home-glass.html': 'madstation-home-glass',
    'home-isometric-world.html': 'madstation-home-isometric-world'
  };
  const filename = window.location.pathname.split(/[\\/]/).pop();
  const channel = pageChannels[filename] || '';
  const safeColor = (value) => typeof value === 'string' && value.length > 0 && value.length <= 80 && !/[;{}]/.test(value);

  // Themed process-monitor controls share the same real telemetry refresh action.
  // Capture phase prevents monitor buttons from bubbling into a surrounding app tile.
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-memory-refresh]') : null;
    if (!target || target.disabled) return;
    event.preventDefault();
    event.stopPropagation();
    target.classList.add('is-refreshing');
    target.setAttribute('aria-busy', 'true');
    try { window.MadHome?.memoryAction?.('refresh'); } catch { /* host bridge reports failures independently */ }
    window.setTimeout(() => {
      target.classList.remove('is-refreshing');
      target.removeAttribute('aria-busy');
    }, 520);
  }, true);

  function resolvedTheme(theme) {
    if (theme === 'light' || theme === 'dark') return theme;
    return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }

  function applyHostStyleSettings(settings) {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return;
    const palette = settings.hostPalette && typeof settings.hostPalette === 'object' ? settings.hostPalette : {};
    const preserveNativeAccent = settings.preserveNativeAccent === true;
    const accent = !preserveNativeAccent && safeColor(palette['--accent']) ? palette['--accent'].trim() : '';
    const accentStrong = !preserveNativeAccent && safeColor(palette['--accent-strong']) ? palette['--accent-strong'].trim() : accent;
    if (accent) {
      // Different homepage art directions use different historic token aliases.
      // Set aliases as inline tokens, while leaving multi-colour app categories intact.
      for (const node of [document.documentElement, document.body]) {
        node.style.setProperty('--accent', accent);
        node.style.setProperty('--accent-strong', accentStrong || accent);
        node.style.setProperty('--host-accent', accent);
        node.style.setProperty('--a', accent);
        node.style.setProperty('--ph', accent);
        node.style.setProperty('--cyan', accent);
      }
    }
    if (filename === 'home-parallax-jungle.html') {
      if (validSeasons.has(settings.season) && document.body.dataset.season !== settings.season) {
        document.body.dataset.season = settings.season;
        document.documentElement.dataset.season = settings.season;
        window.MadHome?.setSeason?.(settings.season);
      }
    } else {
      // Clear any stale state from earlier builds so non-Jungle pages never receive seasons.
      delete document.body.dataset.season;
      delete document.documentElement.dataset.season;
    }
    if (['dark', 'light', 'system'].includes(settings.theme)) {
      const theme = settings.theme;
      if (typeof window.applyAppearance === 'function') {
        try { window.applyAppearance({ ...settings, hostPalette: palette }); }
        catch { document.body.dataset.theme = resolvedTheme(theme); }
      } else {
        document.body.dataset.theme = resolvedTheme(theme);
      }
      // Parallax Jungle has a canvas-rendered world in addition to CSS surfaces.
      // Keep its sky, foliage lighting, stars, and fireflies in sync with the host
      // theme while letting its render loop interpolate the transition smoothly.
      if (filename === 'home-parallax-jungle.html') {
        window.MadHome?.setTheme?.(resolvedTheme(theme));
      }
    }
    if (typeof settings.reduceMotion === 'boolean') document.body.classList.toggle('reduce-motion', settings.reduceMotion);
    const isDay = resolvedTheme(settings.theme || document.body.dataset.theme) === 'light';
    const themeButton = document.querySelector('#themeBtn:not([data-theme-quick-trigger])');
    if (themeButton) {
      themeButton.setAttribute('aria-label', isDay ? 'Switch to Night' : 'Switch to Day');
      themeButton.title = isDay ? 'Switch to Night' : 'Switch to Day';
      themeButton.dataset.currentMode = isDay ? 'day' : 'night';
    }
  }

  // Quick Access uses the historical #themeBtn id, but owns its own menu click handler.
  // Only attach the legacy Day/Night shortcut to older buttons that are not Quick Access triggers.
  document.querySelector('#themeBtn:not([data-theme-quick-trigger])')?.addEventListener('click', (event) => {
    if (!framed || !channel) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    try { window.parent.postMessage({ channel, type: 'toggle-theme' }, '*'); } catch { /* standalone fallback owns its own toggle */ }
  }, true);

  window.addEventListener('message', (event) => {
    if (!framed || event.source !== window.parent || event.data?.channel !== channel || event.data?.type !== 'appearance-settings') return;
    applyHostStyleSettings(event.data.settings);
  });
  const initialMode = resolvedTheme(document.body.dataset.theme || 'dark');
  const initialButton = document.querySelector('#themeBtn:not([data-theme-quick-trigger])');
  if (initialButton) {
    initialButton.setAttribute('aria-label', initialMode === 'light' ? 'Switch to Night' : 'Switch to Day');
    initialButton.title = initialMode === 'light' ? 'Switch to Night' : 'Switch to Day';
    initialButton.dataset.currentMode = initialMode === 'light' ? 'day' : 'night';
  }
})();

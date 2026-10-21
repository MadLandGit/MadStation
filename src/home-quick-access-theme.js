/* Theme-native Quick Access, rendered inside each homepage's own header.
 * The frame owns the UI and styling; the parent owns persisted settings and theme switching.
 */
(() => {
  'use strict';
  const root = document.querySelector('[data-theme-quick-access]');
  if (!root) return;
  const trigger = root.querySelector('[data-theme-quick-trigger]');
  const menu = root.querySelector('[data-theme-quick-menu]');
  if (!trigger || !menu) return;

  const config = window.MadStationThemeConfig && typeof window.MadStationThemeConfig === 'object' ? window.MadStationThemeConfig : {};
  const style = document.body.dataset.homeStyle || config.mode || 'simple';
  const channelByStyle = {
    simple: 'madstation-home-v2',
    parallax: 'madstation-home-parallax',
    retro: 'madstation-home-simple-retro',
    'retro-complex': 'madstation-home-retro-complex',
    'parallax-big': 'madstation-home-parallax-big',
    galaxy: 'madstation-home-galaxy',
    'parallax-jungle': 'madstation-home-parallax-jungle',
    claymorphism: 'madstation-home-claymorphism',
    glass: 'madstation-home-glass',
    'isometric-world': 'madstation-home-isometric-world'
  };
  const channel = typeof config.channel === 'string' ? config.channel : (channelByStyle[style] || '');
  const framed = window.parent !== window && Boolean(channel);
  // The original Default homepage is a developer-only diagnostic option, not a user menu item.
  const builtInStyles = [
    { id: 'v2', label: 'Simple' },
    { id: 'retro', label: 'Simple Retro' },
    { id: 'retro-complex', label: 'Retro Complex' },
    { id: 'parallax', label: '3D Parallax' },
    { id: 'parallax-big', label: '3D Parallax Big App' },
    { id: 'galaxy', label: 'Galaxy' },
    { id: 'parallax-jungle', label: 'Parallax Jungle' },
    { id: 'claymorphism', label: 'Claymorphism' },
    { id: 'glass', label: 'Glass' },
    { id: 'isometric-world', label: 'Isometric World' }
  ];
  const validThemeId = (id) => typeof id === 'string' && (/^(?:legacy|v2|retro|retro-complex|parallax|parallax-big|galaxy|parallax-jungle|claymorphism|glass|isometric-world)$/.test(id) || /^custom-[a-z0-9-]{1,64}$/.test(id));
  function normalizeStyles(value) {
    const merged = new Map(builtInStyles.map((item) => [item.id, { ...item }]));
    if (Array.isArray(value)) {
      for (const item of value) {
        if (!item || item.id === 'legacy' || !validThemeId(item.id) || typeof item.label !== 'string') continue;
        const label = item.label.trim().slice(0, 100);
        if (!label) continue;
        merged.set(item.id, { id: item.id, label });
      }
    }
    return [...merged.values()];
  }
  let styles = normalizeStyles(config.themes);
  const state = { activeMode: style === 'simple' ? 'v2' : style, theme: document.body.dataset.theme || 'dark' };

  menu.innerHTML = `
    <div class="mqa-head"><div><span class="mqa-eyebrow">MAD STATION</span><strong>Quick Access</strong></div><button type="button" class="mqa-close" data-qa-close aria-label="Close Quick Access">×</button></div>
    <button class="mqa-mode" type="button" data-qa-action="toggle-theme"><span class="mqa-mode-glyph" aria-hidden="true">☾</span><span class="mqa-mode-copy"><small>LIGHT / DARK</small><strong data-qa-mode-label>Switch to Day</strong></span><span class="mqa-mode-state" aria-hidden="true">↔</span></button>
    <section class="mqa-section mqa-theme-section"><div class="mqa-section-title">Homepage</div><div class="mqa-theme-list" role="radiogroup" aria-label="Choose homepage theme"></div></section>
    <button class="mqa-settings" type="button" data-qa-action="open-settings"><svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M4.9 4.9 7 7M17 17l2.1 2.1M2.5 12h3M18.5 12h3M4.9 19.1 7 17M17 7l2.1-2.1"/></svg><span>Appearance settings</span><span class="mqa-settings-arrow" aria-hidden="true">↗</span></button>`;

  const send = (type, detail = {}) => {
    if (framed) {
      try { window.parent.postMessage({ channel, type, ...detail }, '*'); return true; }
      catch { return false; }
    }
    if (type === 'toggle-theme') {
      const nextTheme = resolvedTheme(state.theme) === 'light' ? 'dark' : 'light';
      state.theme = nextTheme;
      window.dispatchEvent(new CustomEvent('madstation:appearance-theme-mode', { detail: nextTheme }));
      updateUI();
    } else if (type === 'open-settings') document.getElementById('launcherSettingsBtn')?.click();
    return false;
  };
  const themeList = menu.querySelector('.mqa-theme-list');
  function renderThemeOptions() {
    if (!themeList) return;
    themeList.replaceChildren();
    for (const item of styles) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'mqa-theme-option';
      button.dataset.qaStyle = item.id;
      button.setAttribute('aria-pressed', 'false');
      const label = document.createElement('span');
      label.textContent = item.label;
      const check = document.createElement('span');
      check.className = 'mqa-check';
      check.setAttribute('aria-hidden', 'true');
      check.textContent = '✓';
      button.append(label, check);
      themeList.append(button);
    }
  }
  const resolvedTheme = (theme) => theme === 'light' || theme === 'dark' ? theme : (window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  function updateUI() {
    const modeLabel = menu.querySelector('[data-qa-mode-label]');
    const modeGlyph = menu.querySelector('.mqa-mode-glyph');
    const currentTheme = resolvedTheme(state.theme);
    if (modeLabel) modeLabel.textContent = currentTheme === 'light' ? 'Switch to Night' : 'Switch to Day';
    if (modeGlyph) modeGlyph.textContent = currentTheme === 'light' ? '☾' : '☼';
    trigger.title = `Quick Access · ${styles.find((item) => item.id === state.activeMode)?.label || 'Homepage'}`;
    trigger.setAttribute('aria-label', `Quick Access — ${styles.find((item) => item.id === state.activeMode)?.label || 'Homepage'}`);
    menu.querySelectorAll('[data-qa-style]').forEach((button) => button.setAttribute('aria-pressed', button.dataset.qaStyle === state.activeMode ? 'true' : 'false'));
    menu.dataset.colorMode = currentTheme;
  }
  function closeMenu({ focus = false } = {}) {
    menu.hidden = true;
    root.classList.remove('mqa-open-up');
    trigger.setAttribute('aria-expanded', 'false');
    if (focus) trigger.focus();
  }
  function openMenu() {
    menu.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => {
      if (menu.hidden) return;
      const rect = trigger.getBoundingClientRect();
      root.classList.toggle('mqa-open-up', rect.bottom + menu.scrollHeight + 8 > window.innerHeight - 8);
    });
  }
  trigger.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (menu.hidden) openMenu(); else closeMenu();
  });
  menu.addEventListener('click', (event) => {
    event.stopPropagation();
    const close = event.target.closest('[data-qa-close]');
    if (close) { closeMenu({ focus: true }); return; }
    const styleButton = event.target.closest('[data-qa-style]');
    if (styleButton) {
      const mode = styleButton.dataset.qaStyle;
      if (styles.some((item) => item.id === mode)) { closeMenu(); send('set-homepage', { mode }); }
      return;
    }
    const action = event.target.closest('[data-qa-action]')?.dataset.qaAction;
    if (action === 'toggle-theme') send('toggle-theme');
    else if (action === 'open-settings') { closeMenu(); send('open-settings'); }
  });
  document.addEventListener('click', (event) => {
    if (!root.contains(event.target)) closeMenu();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !menu.hidden) closeMenu({ focus: true });
  });
  window.addEventListener('message', (event) => {
    if (!framed || event.source !== window.parent || event.data?.channel !== channel) return;
    const message = event.data;
    if (message.type === 'quick-access-theme-catalog' && Array.isArray(message.themes)) {
      styles = normalizeStyles(message.themes);
      if (!styles.some((item) => item.id === state.activeMode)) state.activeMode = 'v2';
      renderThemeOptions();
      updateUI();
      return;
    }
    if (message.type === 'quick-access-state' || message.type === 'madstation:theme-quick-access-state') {
      if (typeof message.activeMode === 'string') state.activeMode = message.activeMode;
      if (typeof message.theme === 'string') state.theme = message.theme;
      updateUI();
    }
    if (message.type === 'appearance-settings' && message.settings && typeof message.settings === 'object') {
      if (typeof message.settings.theme === 'string') state.theme = message.settings.theme;
      updateUI();
    }
  });
  renderThemeOptions();
  updateUI();
})();

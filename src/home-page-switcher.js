/* Homepage style selection + narrow bridges for isolated launcher layouts. */
(function () {
  'use strict';
  const STORAGE_KEY = 'mad-station-homepage-version-v1';
  const SEASON_STORAGE_KEY = 'mad-station-home-season-v1';
  const DEVELOPER_DEBUG_STORAGE_KEY = 'madstation.developer-debug.v1';
  const DEVELOPER_DEBUG_DEFAULTS = Object.freeze({ enabled: false, outlines: true, containers: false, grid: false, labels: false, overflow: true, hud: true, hoverInspector: false, hitTest: true, boxModel: false, focusable: false, clickTrace: false, pauseAnimations: false, hiddenAudit: true });
  const readDeveloperDebugSettings = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(DEVELOPER_DEBUG_STORAGE_KEY) || '{}');
      const settings = { ...DEVELOPER_DEBUG_DEFAULTS };
      for (const key of Object.keys(settings)) if (typeof saved?.[key] === 'boolean') settings[key] = saved[key];
      // Visual debugging is session-only. Remember selected tools, but never restore an
      // enabled overlay after relaunch where it could obscure the main UI again.
      if (settings.enabled) {
        settings.enabled = false;
        try { localStorage.setItem(DEVELOPER_DEBUG_STORAGE_KEY, JSON.stringify(settings)); } catch { /* The safe in-memory state is sufficient. */ }
      }
      return settings;
    } catch { return { ...DEVELOPER_DEBUG_DEFAULTS }; }
  };
  let latestDeveloperDebugSettings = readDeveloperDebugSettings();
  const VALID_SEASONS = ['spring', 'summer', 'autumn', 'winter'];
  const ALLOWED_TARGETS = new Set(['ai-hub', 'clipboard', 'instruction-forge', 'ai-lab', 'video-hub', 'image-hub']);
  const ALLOWED_MEMORY_ACTIONS = new Set(['refresh', 'cleanup', 'details']);
  const legacyScreen = document.getElementById('launcherScreen');
  const FRAMES = {
    v2: { frame: document.getElementById('launcherV2Screen'), channel: 'madstation-home-v2' },
    retro: { frame: document.getElementById('launcherRetroScreen'), channel: 'madstation-home-simple-retro' },
    'retro-complex': { frame: document.getElementById('launcherRetroComplexScreen'), channel: 'madstation-home-retro-complex' },
    parallax: { frame: document.getElementById('launcherParallaxScreen'), channel: 'madstation-home-parallax' },
    'parallax-big': { frame: document.getElementById('launcherParallaxBigScreen'), channel: 'madstation-home-parallax-big' },
    galaxy: { frame: document.getElementById('launcherGalaxyScreen'), channel: 'madstation-home-galaxy' },
    'parallax-jungle': { frame: document.getElementById('launcherParallaxJungleScreen'), channel: 'madstation-home-parallax-jungle' },
    claymorphism: { frame: document.getElementById('launcherClaymorphismScreen'), channel: 'madstation-home-claymorphism' },
    glass: { frame: document.getElementById('launcherGlassScreen'), channel: 'madstation-home-glass' },
    'isometric-world': { frame: document.getElementById('launcherIsometricWorldScreen'), channel: 'madstation-home-isometric-world' },
  };
  const ready = { v2: false, retro: false, 'retro-complex': false, parallax: false, 'parallax-big': false, galaxy: false, 'parallax-jungle': false, claymorphism: false, glass: false, 'isometric-world': false };
  const importedCustomModes = new Set();
  let importedThemesLoading = true;
  // Only a successfully read catalog can confirm whether a saved custom theme still exists.
  let importedThemeCatalogAvailable = false;
  let latestAppearance = null;
  let latestMemoryModel = null;
  let forcedLegacyForSession = false;
  let readinessTimer = null;
  let pingTimer = null;
  let watchingMode = null;
  let activeTransition = null;
  let pendingStyleSwitchTimer = null;
  let visibleMode = null;
  const transitionCurtain = document.getElementById('homeStyleTransitionCurtain');
  const startupLoadingScreen = document.getElementById('homeStartupLoadingScreen');
  let startupLoadingReleased = false;
  let startupLoadingReleaseTimer = null;
  let curtainReleaseTimer = null;
  let curtainSafetyTimer = null;
  const quickControlsButton = document.getElementById('homeQuickControlsButton');
  const quickControlsMenu = document.getElementById('homeQuickControlsMenu');
  const dayNightButton = document.getElementById('homeDayNightToggle');
  const dayNightLabel = document.getElementById('homeDayNightLabel');
  const quickControlsSummary = document.getElementById('homeQuickAccessLabel');
  const quickControlsDescription = document.getElementById('homeQuickControlsDescription');
  const quickSettingsButton = document.getElementById('homeQuickSettingsButton');
  const READY_TIMEOUT_MS = 5000;
  const READY_PING_INTERVAL_MS = 250;
  const isCustomMode = (value) => typeof value === 'string' && /^custom-[a-z0-9-]{1,64}$/.test(value);
  const validMode = (value) => value === 'legacy' || Object.prototype.hasOwnProperty.call(FRAMES, value);
  function hasPendingSavedCustomTheme() {
    if (importedThemeCatalogAvailable) return false;
    try { return isCustomMode(localStorage.getItem(STORAGE_KEY)); }
    catch { return false; }
  }
  // Default (legacy) remains an internal rescue/developer mode and is deliberately omitted
  // from every user-facing theme picker. Developer Options can still select it via setMode().
  const HOMEPAGE_STYLE_OPTIONS = [
    { id: 'v2', label: 'Simple' },
    { id: 'retro', label: 'Simple Retro' },
    { id: 'retro-complex', label: 'Retro Complex' }, { id: 'parallax', label: '3D Parallax' },
    { id: 'parallax-big', label: '3D Parallax Big App' }, { id: 'galaxy', label: 'Galaxy' },
    { id: 'parallax-jungle', label: 'Parallax Jungle' }, { id: 'claymorphism', label: 'Claymorphism' },
    { id: 'glass', label: 'Glass' },
    { id: 'isometric-world', label: 'Isometric World' },
  ];
  const BASE_HOMEPAGE_STYLE_OPTIONS = HOMEPAGE_STYLE_OPTIONS.map((style) => ({ ...style }));
  const quickAccess = document.getElementById('homeStyleQuickAccess');
  const quickOptions = document.getElementById('homeStyleQuickOptions');
  const activeFrameMode = () => {
    const mode = getMode();
    return mode === 'legacy' ? null : mode;
  };

  function getMode() {
    if (forcedLegacyForSession) return 'legacy';
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (validMode(saved)) return saved;
      const savedIsCustom = isCustomMode(saved);
      // Do not erase a saved custom choice until a successful catalog response can confirm it is missing.
      // While the catalog is loading or temporarily unavailable, render Simple as a safe placeholder only.
      if (savedIsCustom && (!importedThemeCatalogAvailable || importedThemesLoading)) return 'v2';
      // Migrate genuinely invalid/removed persisted homepage choices only after catalog validation.
      if (saved !== null) localStorage.setItem(STORAGE_KEY, 'v2');
      return 'v2';
    } catch { return 'v2'; }
  }
  function clearReadinessWatch() {
    if (readinessTimer !== null) clearTimeout(readinessTimer);
    if (pingTimer !== null) clearTimeout(pingTimer);
    readinessTimer = null;
    pingTimer = null;
    watchingMode = null;
  }
  function pingFrame(mode) {
    const entry = FRAMES[mode];
    try { entry?.frame?.contentWindow?.postMessage({ channel: entry.channel, type: 'host-ping' }, '*'); }
    catch { /* The readiness timeout below recovers from an unavailable frame. */ }
  }
  function recoverToLegacy(reason, failedMode) {
    if (!legacyScreen) return;
    clearReadinessWatch();
    forcedLegacyForSession = true;
    if (failedMode && ready[failedMode] !== undefined) ready[failedMode] = false;
    // Keep the selected mode in persistent storage. Falling back is session-only so a transient
    // iframe/readiness failure cannot silently reset the user's chosen theme on every launch.
    applySelectedHomePage();
    clearTransition();
    visibleMode = 'legacy';
    hideTransitionCurtain();
    window.dispatchEvent(new CustomEvent('madstation:homepage-fallback', { detail: { reason, mode: failedMode || null } }));
  }
  function watchFrameReadiness(mode) {
    if (!FRAMES[mode] || ready[mode] || readinessTimer !== null || getMode() !== mode) return;
    // A saved custom page can temporarily render Simple while its import catalogue loads;
    // do not declare that placeholder broken before we know whether the custom frame exists.
    if (mode === 'v2' && hasPendingSavedCustomTheme()) return;
    const startedAt = Date.now();
    watchingMode = mode;
    const poll = () => {
      if (ready[mode] || getMode() !== mode || (document.body.dataset.workspaceApp || 'launcher') !== 'launcher') {
        clearReadinessWatch();
        return;
      }
      pingFrame(mode);
      if (Date.now() - startedAt >= READY_TIMEOUT_MS) {
        recoverToLegacy('homepage-not-ready', mode);
        return;
      }
      pingTimer = setTimeout(poll, READY_PING_INTERVAL_MS);
    };
    readinessTimer = setTimeout(() => {
      readinessTimer = null;
      poll();
    }, 0);
  }
  function sendToFrame(mode, type, payload = {}) {
    const entry = FRAMES[mode];
    if (!entry?.frame?.contentWindow || !ready[mode]) return false;
    try { entry.frame.contentWindow.postMessage({ channel: entry.channel, type, ...payload }, '*'); return true; }
    catch { return false; }
  }
  function getSeason() {
    try {
      const saved = localStorage.getItem(SEASON_STORAGE_KEY);
      if (VALID_SEASONS.includes(saved)) return saved;
      // Preserve the Jungle's existing season on first launch after this migration.
      const jungleSaved = JSON.parse(localStorage.getItem('mad-home-jungle-season') || 'null');
      if (jungleSaved && Number.isInteger(jungleSaved.k) && jungleSaved.k >= 0 && jungleSaved.k < 4) return VALID_SEASONS[jungleSaved.k];
    } catch { /* Use the original Jungle default below. */ }
    return 'summer';
  }
  function persistSeason(season, { preserveRotation = false } = {}) {
    // Keep season persistence in the trusted host bridge; only Parallax Jungle can request changes.
    if (getMode() !== 'parallax-jungle' || !VALID_SEASONS.includes(season)) return false;
    try {
      const savedRotation = JSON.parse(localStorage.getItem('mad-home-jungle-season') || 'null');
      const rotateMinutes = [1, 5, 10].includes(Number(savedRotation?.rotateMinutes)) ? Number(savedRotation.rotateMinutes) : 5;
      localStorage.setItem(SEASON_STORAGE_KEY, season);
      localStorage.setItem('mad-home-jungle-season', JSON.stringify({
        k: VALID_SEASONS.indexOf(season),
        auto: preserveRotation && savedRotation?.auto !== false,
        rotateMinutes,
      }));
    } catch { /* Keep the current value in memory/UI if storage is unavailable. */ }
    const mode = activeFrameMode();
    if (mode) sendHostState(mode);
    return true;
  }
  function resolvedDayNight() {
    const theme = latestAppearance?.theme || document.body.dataset.theme || 'dark';
    if (theme === 'light') return 'day';
    if (theme === 'dark') return 'night';
    return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'day' : 'night';
  }
  function syncQuickControls() {
    const resolved = resolvedDayNight();
    if (dayNightLabel) dayNightLabel.textContent = resolved === 'day' ? 'Switch to Night' : 'Switch to Day';
    const icon = quickControlsButton?.querySelector('.home-quick-mode-icon');
    if (icon) icon.textContent = resolved === 'day' ? '☾' : '☼';
    if (dayNightButton) dayNightButton.dataset.currentMode = resolved;

    if (quickControlsButton) quickControlsButton.title = 'Change homepage theme or day/night mode';
    if (quickControlsDescription) quickControlsDescription.textContent = 'Choose a theme and day or night mode';
    if (quickControlsSummary) quickControlsSummary.textContent = HOMEPAGE_STYLE_OPTIONS.find((style) => style.id === getMode())?.label || (getMode() === 'legacy' ? 'Developer homepage' : 'Simple');

  }
  function setQuickControlsOpen(open) {
    if (!quickControlsButton || !quickControlsMenu) return;
    quickControlsButton.setAttribute('aria-expanded', open ? 'true' : 'false');
    quickControlsMenu.hidden = !open;
    if (!open) {
      quickAccess?.classList.remove('home-quick-open-up');
      return;
    }
    // Open downward by default; flip upward when the whole compact panel would
    // extend beyond the viewport. This keeps every control reachable without
    // making the menu itself scroll on normal-sized windows.
    requestAnimationFrame(() => {
      if (quickControlsMenu.hidden || !quickAccess) return;
      const trigger = quickAccess.getBoundingClientRect();
      const menuHeight = quickControlsMenu.scrollHeight;
      quickAccess.classList.toggle('home-quick-open-up', trigger.bottom + 8 + menuHeight > window.innerHeight - 8);
    });
  }
  function toggleDayNight() {
    const next = resolvedDayNight() === 'day' ? 'dark' : 'light';
    window.dispatchEvent(new CustomEvent('madstation:appearance-theme-mode', { detail: next }));
  }
  function initializeQuickControls() {
    if (!quickControlsButton || !quickControlsMenu) return;
    quickControlsButton.addEventListener('click', (event) => {
      event.stopPropagation();
      const open = quickControlsMenu.hidden;
      setQuickControlsOpen(open);
    });
    quickControlsMenu.addEventListener('click', (event) => event.stopPropagation());
    dayNightButton?.addEventListener('click', toggleDayNight);
    quickSettingsButton?.addEventListener('click', () => {
      setQuickControlsOpen(false);
      if (typeof openSettings === 'function') void openSettings('appearance', 'global');
      else document.getElementById('launcherSettingsBtn')?.click();
    });
    document.addEventListener('click', (event) => {
      if (!quickControlsMenu.contains(event.target) && event.target !== quickControlsButton && !quickControlsButton.contains(event.target)) setQuickControlsOpen(false);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !quickControlsMenu.hidden) {
        setQuickControlsOpen(false);
        quickControlsButton.focus();
      }
    });
    window.addEventListener('madstation:appearance-settings', (event) => {
      if (event.detail && typeof event.detail === 'object') latestAppearance = event.detail;
      syncQuickControls();
    });
    window.addEventListener('madstation:appearance-theme-mode', syncQuickControls);
    if (getMode() === 'parallax-jungle') persistSeason(getSeason(), { preserveRotation: true });
    syncQuickControls();
  }

  const HOST_PALETTE_PROPERTIES = [
    '--bg', '--sidebar', '--surface', '--surface-2', '--surface-3', '--line',
    '--line-strong', '--text', '--muted', '--muted-2',
    '--danger', '--shadow',
  ];
  function readHostPalette() {
    const style = getComputedStyle(document.documentElement);
    const palette = {};
    for (const property of HOST_PALETTE_PROPERTIES) {
      const value = style.getPropertyValue(property).trim();
      if (value) palette[property] = value;
    }
    return palette;
  }
  function buildAppearanceFallback() {
    const body = document.body;
    const rootStyle = getComputedStyle(document.documentElement);
    return {
      theme: ['dark', 'light', 'system'].includes(body.dataset.theme) ? body.dataset.theme : 'dark',
      density: body.dataset.density || 'comfortable',
      cardSpacing: body.dataset.cardSpacing || 'comfortable',
      borderSpacing: body.dataset.borderSpacing || 'comfortable',
      surfaceStyle: body.dataset.surfaceStyle || 'solid',
      backgroundStyle: body.dataset.backgroundStyle || 'plain',
      cornerStyle: body.dataset.cornerStyle || 'soft',
      buttonCorner: body.dataset.buttonCorner || 'soft',
      buttonBackground: body.dataset.buttonBackground || 'solid',
      borderStyle: body.dataset.borderStyle || 'subtle',
      shadowStyle: body.dataset.shadowStyle || 'soft',
      animateHover: !body.classList.contains('no-hover-animation'),
      reduceMotion: body.classList.contains('reduce-motion'),
      showStatusBar: body.dataset.showStatusBar !== 'false',
    };
  }
  function appearanceForFrame(mode = activeFrameMode()) {
    const settings = { ...(latestAppearance || buildAppearanceFallback()), hostPalette: readHostPalette(), preserveNativeAccent: true };
    // Homepage launchers keep their own palettes. The saved accent belongs only to the developer Default homepage and workspace apps.
    delete settings.accent;
    delete settings.season;
    if (mode === 'parallax-jungle') settings.season = getSeason();
    return settings;
  }
  function sendHostState(mode = activeFrameMode()) {
    if (!mode || !FRAMES[mode]) return;
    const settings = appearanceForFrame(mode);
    sendToFrame(mode, 'appearance-settings', { settings });
    sendToFrame(mode, 'quick-access-state', {
      activeMode: getMode(),
      theme: latestAppearance?.theme || document.body.dataset.theme || 'dark',
    });
    // Every built-in theme's native Quick Access menu receives the current host catalogue.
    // This keeps theme selection and custom-theme updates synchronized across all isolated pages.
    sendToFrame(mode, 'quick-access-theme-catalog', {
      themes: HOMEPAGE_STYLE_OPTIONS.map(({ id, label }) => ({ id, label })),
    });
    // Visual debug settings are mirrored into the active built-in homepage frame.
    // The frame validates this message against its own private channel before applying it.
    sendToFrame(mode, 'developer-debug-settings', { settings: latestDeveloperDebugSettings });
    const count = (id) => Number(document.getElementById(id)?.textContent) || 0;
    sendToFrame(mode, 'stats', { accounts: count('launcherAccountCount'), providers: count('launcherProviderCount') });
    if (latestMemoryModel) sendToFrame(mode, 'memory-model', { model: latestMemoryModel });
  }
  function loadDeferredFrame(entry) {
    const frame = entry?.frame;
    const source = frame?.dataset.homeSrc;
    if (frame && source && !frame.getAttribute('src')) frame.setAttribute('src', source);
  }
  function unloadInactiveFrame(mode, entry) {
    const frame = entry?.frame;
    if (!frame?.dataset.homeUnloadInactive || !frame.getAttribute('src')) return;
    // These animated styles run requestAnimationFrame and CSS animation loops.
    // Destroy inactive documents so they stop consuming renderer resources.
    frame.removeAttribute('src');
    if (ready[mode] !== undefined) ready[mode] = false;
  }
  function screenForMode(mode) {
    return mode === 'legacy' ? legacyScreen : FRAMES[mode]?.frame || null;
  }
  function debugModeIsActive() {
    return Boolean(latestDeveloperDebugSettings?.enabled
      || document.documentElement.classList.contains('ms-dev-debug-enabled'));
  }
  function clearCurtainTimers() {
    if (curtainReleaseTimer !== null) clearTimeout(curtainReleaseTimer);
    if (curtainSafetyTimer !== null) clearTimeout(curtainSafetyTimer);
    curtainReleaseTimer = null;
    curtainSafetyTimer = null;
  }
  function showTransitionCurtain() {
    if (!transitionCurtain) return;
    // Visual inspection must not be hidden behind a dark/blurred veil. Skip the curtain
    // entirely while Debug Mode is enabled so theme changes remain inspectable.
    if (reducedMotionRequested() || debugModeIsActive()) {
      hideTransitionCurtain({ immediate: true });
      return;
    }
    clearCurtainTimers();
    transitionCurtain.hidden = false;
    transitionCurtain.classList.remove('is-revealing');
    // Establish the transparent starting frame before asking the veil to cover the screen.
    void transitionCurtain.offsetWidth;
    transitionCurtain.classList.add('is-covering');
    void transitionCurtain.offsetWidth;
    // A slow or failed iframe must never leave the app blurred indefinitely. Normal
    // readiness/recovery still runs; this is only a visual fail-safe.
    curtainSafetyTimer = setTimeout(() => {
      curtainSafetyTimer = null;
      hideTransitionCurtain({ immediate: true });
    }, 2600);
  }
  function hideTransitionCurtain({ immediate = false } = {}) {
    if (!transitionCurtain) return;
    if (curtainReleaseTimer !== null) clearTimeout(curtainReleaseTimer);
    curtainReleaseTimer = null;
    if (curtainSafetyTimer !== null) clearTimeout(curtainSafetyTimer);
    curtainSafetyTimer = null;
    if (immediate || reducedMotionRequested() || debugModeIsActive()) {
      transitionCurtain.classList.remove('is-covering', 'is-revealing');
      transitionCurtain.hidden = true;
      return;
    }
    transitionCurtain.classList.remove('is-covering');
    transitionCurtain.classList.add('is-revealing');
    curtainReleaseTimer = setTimeout(() => {
      transitionCurtain.classList.remove('is-revealing');
      transitionCurtain.hidden = true;
      curtainReleaseTimer = null;
    }, 520);
  }
  function clearTransition() {
    if (activeTransition?.timer !== null && activeTransition?.timer !== undefined) clearTimeout(activeTransition.timer);
    [activeTransition?.fromScreen, activeTransition?.toScreen].forEach((screen) => {
      screen?.classList.remove('homepage-style-transition-enter', 'homepage-style-transition-exit');
      if (screen) screen.style.zIndex = '';
    });
    activeTransition = null;
  }
  function finishTransitionWhenReady(mode) {
    if (!activeTransition || activeTransition.toMode !== mode || mode !== getMode()) return;
    if (mode !== 'legacy' && FRAMES[mode] && !ready[mode]) return;
    const transition = activeTransition;
    // home-ready can fire through both the message handler and applySelectedHomePage.
    // Keep only one reveal timer alive for each transition.
    if (transition.phase === 'revealing' || transition.phase === 'settling') return;
    transition.phase = 'arming';
    if (transition.timer !== null) clearTimeout(transition.timer);
    transition.timer = setTimeout(() => {
      if (activeTransition !== transition || getMode() !== mode) return;
      transition.phase = 'revealing';
      if (!reducedMotionRequested()) {
        const incoming = transition.toScreen;
        const outgoing = transition.fromScreen;
        incoming?.classList.remove('home-style-transition-enter');
        outgoing?.classList.remove('homepage-style-transition-exit');
        // Restart at the readiness boundary, not during a slow iframe's blank/loading phase.
        if (incoming) void incoming.offsetWidth;
        if (outgoing) void outgoing.offsetWidth;
        incoming?.classList.add('home-style-transition-enter');
        outgoing?.classList.add('homepage-style-transition-exit');
      }
      hideTransitionCurtain();
      transition.phase = 'settling';
      transition.timer = setTimeout(() => {
        if (activeTransition !== transition || getMode() !== mode) return;
        clearTransition();
        visibleMode = mode;
        applySelectedHomePage();
      }, reducedMotionRequested() ? 0 : 640);
    }, reducedMotionRequested() ? 0 : 100);
  }
  function reducedMotionRequested() {
    return document.body.classList.contains('reduce-motion') || Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  }
  function positionQuickAccess(mode = getMode()) {
    if (!quickAccess) return;
    const workspace = document.body.dataset.workspaceApp || 'launcher';
    // Legacy markup is a child of its own topbar. Isolated theme pages now own
    // their Quick Access button and menu in their own HTML/CSS, so the host
    // must not float a duplicate over their iframe or inject placeholder slots.
    const isLegacyHeader = mode === 'legacy' && workspace === 'launcher';
    quickAccess.hidden = !isLegacyHeader;
    quickAccess.dataset.anchor = isLegacyHeader ? 'legacy-header' : 'theme-owned';
    quickAccess.style.removeProperty('left');
    quickAccess.style.removeProperty('top');
    quickAccess.style.removeProperty('right');
    quickAccess.style.removeProperty('bottom');
    quickAccess.style.removeProperty('width');
    quickAccess.style.removeProperty('height');
  }

  function syncQuickAccess(mode = getMode()) {
    if (quickControlsSummary) quickControlsSummary.textContent = HOMEPAGE_STYLE_OPTIONS.find((style) => style.id === mode)?.label || (mode === 'legacy' ? 'Developer homepage' : 'Simple');
    if (quickControlsButton) {
      const label = HOMEPAGE_STYLE_OPTIONS.find((style) => style.id === mode)?.label || (mode === 'legacy' ? 'Developer homepage' : 'Simple');
      quickControlsButton.setAttribute('aria-label', `Quick Access — ${label}`);
      quickControlsButton.title = `Quick Access — ${label}, and day/night mode`;
    }
    positionQuickAccess(mode);
    quickOptions?.querySelectorAll('[data-quick-home-style]').forEach((button) => {
      const active = button.getAttribute('data-quick-home-style') === mode;
      button.setAttribute('aria-checked', active ? 'true' : 'false');
      const check = button.querySelector('.home-style-quick-option-check');
      if (check) check.textContent = active ? '✓' : '';
    });
  }
  function renderQuickStyleOptions() {
    if (!quickOptions) return;
    quickOptions.replaceChildren();
    HOMEPAGE_STYLE_OPTIONS.forEach((style) => {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'home-style-quick-option';
      option.setAttribute('role', 'radio');
      option.setAttribute('data-quick-home-style', style.id);
      const label = document.createElement('span');
      label.className = 'home-style-quick-option-name';
      label.textContent = style.label;
      const check = document.createElement('span');
      check.className = 'home-style-quick-option-check';
      check.setAttribute('aria-hidden', 'true');
      option.append(label, check);
      option.addEventListener('click', () => {
        setMode(style.id);
        setQuickControlsOpen(false);
        quickControlsButton?.focus();
      });
      quickOptions.append(option);
    });
    syncQuickAccess();
  }
  function initializeQuickAccess() {
    if (!quickAccess || !quickOptions) return;
    renderQuickStyleOptions();
    window.addEventListener('madstation:homepage-changed', (event) => syncQuickAccess(event.detail?.mode || getMode()));
    window.addEventListener('madstation:homepage-fallback', () => syncQuickAccess('legacy'));
    window.addEventListener('storage', () => syncQuickAccess());
    syncQuickAccess();
  }
  function releaseStartupLoadingScreen() {
    if (startupLoadingReleased || !startupLoadingScreen) return;
    startupLoadingReleased = true;
    if (startupLoadingReleaseTimer !== null) clearTimeout(startupLoadingReleaseTimer);
    startupLoadingReleaseTimer = null;
    startupLoadingScreen.classList.add('is-releasing');
    startupLoadingReleaseTimer = setTimeout(() => {
      startupLoadingScreen.hidden = true;
      startupLoadingScreen.classList.remove('is-releasing');
      startupLoadingReleaseTimer = null;
    }, reducedMotionRequested() ? 0 : 220);
  }

  function maybeReleaseStartupLoadingScreen() {
    if (startupLoadingReleased || !startupLoadingScreen) return;
    const workspace = document.body.dataset.workspaceApp || 'launcher';
    const settingsScreen = document.getElementById('settingsScreen');
    const lockScreen = document.getElementById('lockScreen');
    // If startup restores a different workspace, or the app is locked, don't hold that UI
    // behind a homepage-specific loader.
    if (workspace !== 'launcher' || (settingsScreen && !settingsScreen.classList.contains('hidden'))
      || (lockScreen && !lockScreen.classList.contains('hidden'))) {
      releaseStartupLoadingScreen();
      return;
    }
    // Wait until imported themes have been resolved before revealing a temporary Simple
    // placeholder for a persisted custom theme. Then wait for the selected iframe's own
    // home-ready handshake rather than merely its DOM load event.
    if (importedThemesLoading && hasPendingSavedCustomTheme()) return;
    const mode = getMode();
    if (mode === 'legacy' || (FRAMES[mode] && ready[mode])) releaseStartupLoadingScreen();
  }

  function applySelectedHomePage(options = {}) {
    if (!legacyScreen) return;
    const workspace = document.body.dataset.workspaceApp || 'launcher';
    const mode = getMode();
    const settingsScreen = document.getElementById('settingsScreen');
    const settingsVisible = Boolean(settingsScreen && !settingsScreen.classList.contains('hidden'));
    // Iframe app-region flags do not reliably become a native drag region for the parent window.
    // Use a wider, reserved host-level strip only on the isolated homepage layouts, never over
    // Settings or the legacy homepage where it would cover real controls.
    document.body.classList.toggle('home-theme-native-drag', workspace === 'launcher' && mode !== 'legacy' && !settingsVisible);
    document.body.dataset.homepageStyle = mode;
    let startTransition = null;
    const fromMode = options && typeof options.transitionFrom === 'string' ? options.transitionFrom : '';
    if (fromMode && fromMode !== mode && workspace === 'launcher' && !forcedLegacyForSession && !reducedMotionRequested()) {
      clearTransition();
      const fromScreen = screenForMode(fromMode);
      const toScreen = screenForMode(mode);
      if (fromScreen && toScreen && fromScreen !== toScreen && !fromScreen.classList.contains('hidden')) {
        startTransition = { fromMode, toMode: mode, fromScreen, toScreen, timer: null };
        activeTransition = startTransition;
      }
    }
    if (activeTransition && (workspace !== 'launcher' || activeTransition.toMode !== mode) && !startTransition) clearTransition();
    const keepTransitionScreens = activeTransition && activeTransition.toMode === mode && workspace === 'launcher';
    const showLegacy = workspace === 'launcher' && mode === 'legacy';
    const keepLegacyForTransition = Boolean(keepTransitionScreens && activeTransition.fromMode === 'legacy');
    legacyScreen.classList.toggle('hidden', !(showLegacy || keepLegacyForTransition));
    Object.entries(FRAMES).forEach(([frameMode, entry]) => {
      const isSelected = workspace === 'launcher' && mode === frameMode;
      const isOutgoingTransition = Boolean(keepTransitionScreens && activeTransition.fromMode === frameMode && mode !== frameMode);
      const show = isSelected || isOutgoingTransition;
      if (show) loadDeferredFrame(entry);
      else unloadInactiveFrame(frameMode, entry);
      entry.frame?.classList.toggle('hidden', !show);
    });
    if (startTransition) {
      startTransition.fromScreen.classList.add('homepage-style-transition-exit');
      startTransition.toScreen.classList.add('homepage-style-transition-enter');
      startTransition.fromScreen.style.zIndex = '36';
      startTransition.toScreen.style.zIndex = '37';
    }
    if (workspace === 'launcher' && FRAMES[mode]) {
      sendHostState(mode);
      watchFrameReadiness(mode);
      finishTransitionWhenReady(mode);
    } else {
      clearReadinessWatch();
      if (mode === 'legacy') finishTransitionWhenReady(mode);
      else if (activeTransition && workspace !== 'launcher') { clearTransition(); hideTransitionCurtain(); }
    }
    syncQuickAccess(mode);
    syncQuickControls();
    if (!activeTransition && workspace === 'launcher') visibleMode = mode;
    maybeReleaseStartupLoadingScreen();
  }
  function setMode(mode) {
    const previous = activeTransition?.fromMode || visibleMode || getMode();
    const next = validMode(mode) ? mode : 'v2';
    if (next === getMode() && !forcedLegacyForSession) return;
    clearReadinessWatch();
    const retryAfterFallback = forcedLegacyForSession && next !== 'legacy';
    forcedLegacyForSession = false;
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* Current session remains usable if storage is blocked. */ }
    if (retryAfterFallback && FRAMES[next]) {
      ready[next] = false;
      const frame = FRAMES[next].frame;
      if (frame?.dataset.homeSrc) frame.setAttribute('src', frame.dataset.homeSrc);
      else if (frame?.getAttribute('src')) frame.src = frame.src;
    }
    if (pendingStyleSwitchTimer !== null) clearTimeout(pendingStyleSwitchTimer);
    if (!reducedMotionRequested() && !debugModeIsActive() && previous !== next && (document.body.dataset.workspaceApp || 'launcher') === 'launcher') {
      showTransitionCurtain();
      // Let the veil fully cover the outgoing page before deferred iframe startup.
      pendingStyleSwitchTimer = setTimeout(() => {
        pendingStyleSwitchTimer = null;
        applySelectedHomePage({ transitionFrom: previous });
      }, 500);
    } else {
      applySelectedHomePage({ transitionFrom: previous });
    }
    syncQuickAccess(next);
    window.dispatchEvent(new CustomEvent('madstation:homepage-changed', { detail: { mode: next } }));
  }

  function wireFrame(mode, entry) {
    if (!entry?.frame || entry.handlersInstalled) return;
    entry.handlersInstalled = true;
    entry.frame.addEventListener('load', () => {
      if (getMode() === mode) { positionQuickAccess(mode); sendHostState(mode); }
    });
    entry.frame.addEventListener('error', () => {
      const activeWorkspace = (document.body.dataset.workspaceApp || 'launcher') === 'launcher';
      if (entry.frame?.getAttribute('src') && activeWorkspace && !ready[mode] && getMode() === mode
        && !(mode === 'v2' && hasPendingSavedCustomTheme())) recoverToLegacy('homepage-load-error', mode);
    });
  }
  Object.entries(FRAMES).forEach(([mode, entry]) => wireFrame(mode, entry));

  function normalizeImportedCatalog(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
    const catalog = payload.catalog && typeof payload.catalog === 'object' ? payload.catalog : payload;
    return catalog && typeof catalog === 'object' && !Array.isArray(catalog) ? catalog : null;
  }
  function importedEntryIsSafe(item) {
    return Boolean(item && typeof item === 'object' && typeof item.mode === 'string'
      && /^custom-[a-z0-9-]{1,64}$/.test(item.mode)
      && typeof item.entryUrl === 'string' && item.entryUrl.startsWith('file:')
      && typeof item.channel === 'string' && /^madstation-home-[a-z0-9-]{1,90}$/.test(item.channel));
  }
  function setThemeFrameSource(entry, url, title, ariaLabel) {
    if (!entry?.frame || typeof url !== 'string' || !url.startsWith('file:')) return;
    entry.frame.removeAttribute('src');
    entry.frame.dataset.homeSrc = url;
    entry.frame.dataset.homeUnloadInactive = 'true';
    if (title) entry.frame.setAttribute('title', title);
    if (ariaLabel) entry.frame.setAttribute('aria-label', ariaLabel);
  }
  function applyImportedThemeCatalog(payload) {
    const catalog = normalizeImportedCatalog(payload);
    // A malformed or failed response is not proof that a saved custom theme was removed.
    if (!catalog) { importedThemesLoading = false; applySelectedHomePage(); return; }
    importedThemeCatalogAvailable = true;
    // Built-in homepage frames are always loaded from their source-controlled files.
    // Imported catalog entries are custom additions only; older override fields are ignored.
    const rawCustomThemes = Array.isArray(catalog.customThemes) ? catalog.customThemes : [];
    const validCustomThemes = rawCustomThemes.filter(importedEntryIsSafe);
    const desiredModes = new Set(validCustomThemes.map((item) => item.mode));
    for (const mode of [...importedCustomModes]) {
      if (desiredModes.has(mode)) continue;
      const entry = FRAMES[mode];
      entry?.frame?.remove();
      delete FRAMES[mode];
      delete ready[mode];
      importedCustomModes.delete(mode);
    }
    const styles = [...BASE_HOMEPAGE_STYLE_OPTIONS];
    for (const item of validCustomThemes) {
      const mode = item.mode;
      let entry = FRAMES[mode];
      if (!entry) {
        const frame = document.createElement('iframe');
        frame.id = `launcherImportedTheme-${mode}`;
        frame.className = 'launcher-screen hidden imported-theme-frame';
        frame.setAttribute('title', `${String(item.title || mode)} Mad Station homepage`);
        frame.setAttribute('aria-label', `${String(item.title || mode)} homepage`);
        frame.setAttribute('loading', 'eager');
        frame.dataset.homeUnloadInactive = 'true';
        const insertionPoint = document.getElementById('homeStyleTransitionCurtain');
        if (insertionPoint?.parentNode) insertionPoint.parentNode.insertBefore(frame, insertionPoint);
        else document.body.append(frame);
        entry = FRAMES[mode] = { frame, channel: item.channel };
        ready[mode] = false;
        importedCustomModes.add(mode);
        wireFrame(mode, entry);
      }
      setThemeFrameSource(entry, item.entryUrl, `${String(item.title || mode)} Mad Station homepage`, `${String(item.title || mode)} homepage`);
      entry.channel = item.channel;
      ready[mode] = false;
      styles.push({ id: mode, label: String(item.title || mode).slice(0, 100), description: String(item.description || 'Imported custom homepage').slice(0, 240) });
    }
    HOMEPAGE_STYLE_OPTIONS.splice(0, HOMEPAGE_STYLE_OPTIONS.length, ...styles);
    importedThemesLoading = false;
    // If a persisted custom selection now exists in the registry, it becomes a valid choice without rewriting storage.
    const saved = (() => { try { return localStorage.getItem(STORAGE_KEY); } catch { return null; } })();
    if (saved && !validMode(saved)) { try { localStorage.setItem(STORAGE_KEY, 'v2'); } catch { /* keep this session usable */ } }
    renderQuickStyleOptions();
    syncQuickControls();
    applySelectedHomePage();
  }
  window.addEventListener('madstation:theme-imported', (event) => applyImportedThemeCatalog(event.detail));
  try {
    const catalogRequest = window.aiHub?.getImportedThemeCatalog?.();
    if (catalogRequest && typeof catalogRequest.then === 'function') {
      catalogRequest.then((result) => {
        if (result?.ok === false) throw new Error(result.error || 'Could not load the installed theme catalogue.');
        applyImportedThemeCatalog(result?.catalog || result);
      }).catch(() => { importedThemesLoading = false; applySelectedHomePage(); });
    } else {
      importedThemesLoading = false;
    }
  } catch { importedThemesLoading = false; }

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (!message || typeof message.type !== 'string' || typeof message.channel !== 'string') return;
    const found = Object.entries(FRAMES).find(([mode, entry]) => entry.frame?.contentWindow && event.source === entry.frame.contentWindow && message.channel === entry.channel);
    if (!found) return;
    const [mode, entry] = found;
    if (message.type === 'developer-debug-emergency-reset') {
      // Accepted only from the exact built-in/custom frame and private channel found above.
      // Reset the host too, otherwise its next state sync could re-enable the broken overlay.
      if (mode !== getMode()) return;
      latestDeveloperDebugSettings = { ...DEVELOPER_DEBUG_DEFAULTS };
      try { localStorage.setItem(DEVELOPER_DEBUG_STORAGE_KEY, JSON.stringify(latestDeveloperDebugSettings)); } catch { /* Reset remains active for this session. */ }
      window.dispatchEvent(new CustomEvent('madstation:developer-debug-settings', { detail: { settings: latestDeveloperDebugSettings } }));
      return;
    }
    if (message.type === 'home-ready') {
      // Ignore a late handshake from a heavy frame that was just unloaded.
      if (!entry.frame?.getAttribute('src')) { ready[mode] = false; return; }
      ready[mode] = true;
      if (watchingMode === mode) clearReadinessWatch();
      if (mode === getMode()) sendHostState(mode);
      applySelectedHomePage();
      finishTransitionWhenReady(mode);
      return;
    }
    if (mode !== getMode()) return;
    if (message.type === 'home-error') {
      const activeWorkspace = (document.body.dataset.workspaceApp || 'launcher') === 'launcher';
      if (entry.frame?.getAttribute('src') && activeWorkspace && !ready[mode]
        && !(mode === 'v2' && hasPendingSavedCustomTheme())) recoverToLegacy('homepage-startup-error', mode);
    } else if (message.type === 'launch') {
      const target = typeof message.target === 'string' ? message.target : '';
      if (!ALLOWED_TARGETS.has(target)) return;
      if (typeof openWorkspaceApp === 'function') void openWorkspaceApp(target);
      else window.MadHomeApps?.launchTarget?.(target);
    } else if (message.type === 'open-settings') {
      if (typeof openSettings === 'function') void openSettings('appearance', 'global');
      else document.getElementById('launcherSettingsBtn')?.click();
    } else if (message.type === 'set-homepage') {
      const requestedMode = typeof message.mode === 'string' ? message.mode : '';
      if (validMode(requestedMode)) setMode(requestedMode);
    } else if (message.type === 'set-season') {
      if (mode === 'parallax-jungle' && typeof message.season === 'string' && VALID_SEASONS.includes(message.season)) persistSeason(message.season, { preserveRotation: message.automatic === true });
    } else if (message.type === 'toggle-theme') {
      const osLight = Boolean(window.matchMedia?.('(prefers-color-scheme: light)').matches);
      const isLight = document.body.dataset.theme === 'light' || (document.body.dataset.theme === 'system' && osLight);
      window.dispatchEvent(new CustomEvent('madstation:appearance-theme-mode', { detail: isLight ? 'dark' : 'light' }));
    } else if (message.type === 'memory-action') {
      if (ALLOWED_MEMORY_ACTIONS.has(message.action)) window.MadStationMemoryMonitor?.requestAction(message.action);
    }
  });

  window.addEventListener('madstation:developer-debug-inspector-command', (event) => {
    const workspace = document.body?.dataset.workspaceApp || 'launcher';
    const settingsScreen = document.getElementById('settingsScreen');
    const settingsVisible = Boolean(settingsScreen && !settingsScreen.classList.contains('hidden'));
    // When a built-in homepage is the visible workspace, route inspector commands into
    // that exact frame. The host runtime intentionally ignores them while yielding.
    if (workspace !== 'launcher' || settingsVisible) return;
    const mode = activeFrameMode();
    if (!mode || !event?.detail || typeof event.detail !== 'object') return;
    sendToFrame(mode, 'developer-debug-inspector-command', { command: event.detail });
  });

  window.addEventListener('madstation:developer-debug-settings', (event) => {
    const candidate = event && event.detail && typeof event.detail === 'object' ? (event.detail.settings || event.detail) : null;
    if (!candidate || typeof candidate !== 'object') return;
    const settings = { ...DEVELOPER_DEBUG_DEFAULTS };
    for (const key of Object.keys(settings)) if (typeof candidate[key] === 'boolean') settings[key] = candidate[key];
    latestDeveloperDebugSettings = settings;
    try { localStorage.setItem(DEVELOPER_DEBUG_STORAGE_KEY, JSON.stringify(settings)); } catch { /* The main renderer can still use session state. */ }
    if (settings.enabled) {
      // If Debug Mode is enabled during an in-flight transition, cancel the curtain and
      // stale transition classes immediately instead of leaving a blurred page behind.
      if (pendingStyleSwitchTimer !== null) clearTimeout(pendingStyleSwitchTimer);
      pendingStyleSwitchTimer = null;
      hideTransitionCurtain({ immediate: true });
      clearTransition();
      applySelectedHomePage();
    }
    const mode = activeFrameMode();
    if (mode) sendToFrame(mode, 'developer-debug-settings', { settings });
  });

  window.addEventListener('madstation:appearance-settings', (event) => {
    if (event.detail && typeof event.detail === 'object') latestAppearance = event.detail;
    syncQuickControls();
    const mode = activeFrameMode();
    if (mode) {
      sendToFrame(mode, 'appearance-settings', { settings: appearanceForFrame(mode) });
      sendToFrame(mode, 'quick-access-state', {
        activeMode: getMode(),
          theme: latestAppearance?.theme || document.body.dataset.theme || 'dark',
      });
    }
  });
  document.addEventListener('mad:memory-model', (event) => {
    if (event.detail && typeof event.detail === 'object') latestMemoryModel = event.detail;
    const mode = activeFrameMode();
    if (mode && latestMemoryModel) sendToFrame(mode, 'memory-model', { model: latestMemoryModel });
  });
  const systemAppearance = window.matchMedia?.('(prefers-color-scheme: light)');
  systemAppearance?.addEventListener?.('change', () => {
    if (document.body.dataset.theme === 'system') {
      const mode = activeFrameMode();
      if (mode) sendToFrame(mode, 'appearance-settings', { settings: appearanceForFrame(mode) });
    }
  });
  document.addEventListener('mad:workspace-view-updated', applySelectedHomePage);
  document.addEventListener('madstation:settings-opening', () => {
    // Remove the widened homepage drag strip before Settings begins painting over the launcher.
    document.body.classList.remove('home-theme-native-drag');
  });
  document.addEventListener('madstation:settings-closed', applySelectedHomePage);
  document.addEventListener('mad:home-apps-built', () => {
    const count = (id) => Number(document.getElementById(id)?.textContent) || 0;
    const mode = activeFrameMode();
    if (mode) sendToFrame(mode, 'stats', { accounts: count('launcherAccountCount'), providers: count('launcherProviderCount') });
  });
  const observedStats = ['launcherAccountCount', 'launcherProviderCount'].map((id) => document.getElementById(id)).filter(Boolean);
  if (typeof MutationObserver === 'function' && observedStats.length) {
    const statsObserver = new MutationObserver(() => {
      const count = (id) => Number(document.getElementById(id)?.textContent) || 0;
      const mode = activeFrameMode();
      if (mode) sendToFrame(mode, 'stats', { accounts: count('launcherAccountCount'), providers: count('launcherProviderCount') });
    });
    observedStats.forEach((node) => statsObserver.observe(node, { childList: true, characterData: true, subtree: true }));
  }
  window.addEventListener('resize', () => positionQuickAccess(), { passive: true });
  initializeQuickAccess();
  initializeQuickControls();
  visibleMode = getMode();
  window.MadStationHomePage = { getMode, setMode, apply: applySelectedHomePage };
  applySelectedHomePage();
})();

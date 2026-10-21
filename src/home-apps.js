// Mad Station — Hub companion registry and layout coordinator
// ---------------------------------------------------------------------------
// Registry, launch routing, responsive sizing, and Home Core integration live
// here. React owns the companion-card and More-apps DOM in home-apps-react.tsx.
(function () {
  'use strict';

  const CONFIG = {
    minCardHeight: 84,
    minTileHeight: 60,
    tileColumns: 2,
    maxTileHeight: 96,
    maxCardHeight: 178,
    maxVisible: Infinity,
    narrowQuery: '(max-width: 940px)',
    narrowMaxVisible: 8,
    paletteSize: 6,
  };

  const FALLBACK_ICON = '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"></rect><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"></rect><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"></rect><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"></rect>';
  const apps = [];
  const els = {};
  let launcher = null;
  let built = false;
  let buildQueued = false;
  let layoutQueued = false;
  let reactRenderer = null;
  let visibleApps = [];
  let rest = [];
  let layoutName = 'cards';
  let panelOpen = false;
  let panelAnchor = null;
  let panelPosition = { left: 12, top: 16, height: 420 };
  let revision = 0;

  function $(selector, root) { return (root || document).querySelector(selector); }

  function normalizeApp(def) {
    if (!def || typeof def !== 'object') throw new Error('MadHomeApps.register: expected an object');
    const id = String(def.id || '').trim();
    if (!/^[a-z0-9][a-z0-9-_]*$/i.test(id)) throw new Error(`MadHomeApps.register: invalid id "${def.id}"`);
    return {
      id,
      name: String(def.name || id),
      description: String(def.description || ''),
      chips: Array.isArray(def.chips) ? def.chips.slice(0, 6) : [],
      iconSvg: typeof def.iconSvg === 'string' ? def.iconSvg : '',
      iconUrl: typeof def.iconUrl === 'string' ? def.iconUrl : '',
      launch: def.launch ? String(def.launch) : id,
      open: typeof def.open === 'function' ? def.open : null,
      hue: Number.isInteger(def.hue) ? def.hue : null,
      order: Number.isFinite(def.order) ? def.order : null,
      enabled: def.enabled !== false,
    };
  }

  function register(def) {
    const app = normalizeApp(def);
    const at = apps.findIndex((item) => item.id === app.id);
    if (at >= 0) apps[at] = app;
    else apps.push(app);
    queueBuild();
    return app;
  }

  function unregister(id) {
    const at = apps.findIndex((item) => item.id === id);
    if (at < 0) return false;
    apps.splice(at, 1);
    queueBuild();
    return true;
  }

  function configure(id, patch = {}) {
    const app = apps.find((item) => item.id === id);
    if (!app || !patch || typeof patch !== 'object') return false;
    if (typeof patch.enabled === 'boolean') app.enabled = patch.enabled;
    if (patch.order === null || Number.isFinite(patch.order)) app.order = patch.order;
    queueBuild();
    return true;
  }

  function sortedApps() {
    return apps
      .map((app, index) => ({ app, index }))
      .sort((a, b) => ((a.app.order ?? 1e6) - (b.app.order ?? 1e6)) || (a.index - b.index))
      .map((entry) => entry.app);
  }

  function launch(id) {
    const app = apps.find((item) => item.id === id);
    if (!app) return;
    closePanel();
    if (app.open) {
      try { app.open(app); }
      catch (error) { console.error('Home app open() failed', error); }
      return;
    }
    if (launcher) launcher(app.launch);
  }

  function publicApp(app, paletteIndex) {
    return {
      id: app.id,
      paletteIndex,
      name: app.name,
      description: app.description,
      chips: app.chips,
      iconSvg: app.iconSvg,
      iconUrl: app.iconUrl,
      hue: app.hue,
      order: app.order,
      enabled: app.enabled,
    };
  }

  function publishView() {
    if (typeof reactRenderer !== 'function') return;
    const shownNames = rest.slice(0, 3).map((app) => app.name).join(', ');
    const orderedApps = sortedApps().filter((app) => app.enabled !== false);
    const paletteIndex = (app) => orderedApps.findIndex((item) => item.id === app.id);
    reactRenderer({
      revision,
      visibleApps: visibleApps.map((app) => publicApp(app, paletteIndex(app))),
      hiddenApps: rest.map((app) => publicApp(app, paletteIndex(app))),
      layoutName,
      appCount: sortedApps().filter((app) => app.enabled !== false).length,
      moreDescription: shownNames + (rest.length > 3 ? '…' : ''),
      moreOpen: panelOpen && rest.length > 0,
      panelPosition: { ...panelPosition },
      paletteSize: CONFIG.paletteSize,
      maxCardHeight: CONFIG.maxCardHeight,
      maxTileHeight: CONFIG.maxTileHeight,
      tileColumns: CONFIG.tileColumns,
    });
  }

  function queueBuild() {
    if (buildQueued) return;
    buildQueued = true;
    Promise.resolve().then(() => {
      buildQueued = false;
      build();
    });
  }

  function refreshLayoutAfterReveal(attempt = 0) {
    const schedule = typeof window.requestAnimationFrame === 'function'
      ? window.requestAnimationFrame.bind(window)
      : (callback) => window.setTimeout(callback, 0);
    schedule(() => {
      if (!els.screen || els.screen.classList.contains('hidden')) return;
      if ((els.tools?.clientHeight || 0) > 0 && (els.stage?.clientHeight || 0) > 0) {
        queueLayout();
        // A second layout pass catches the final geometry after the screen has
        // returned from Settings/Appearance and its CSS has settled.
        schedule(() => { if (!els.screen?.classList.contains('hidden')) queueLayout(); });
        return;
      }
      if (attempt < 6) refreshLayoutAfterReveal(attempt + 1);
      else queueLayout();
    });
  }

  function build() {
    const tools = els.tools = $('#homeApps');
    const stage = els.stage = $('.home-stage');
    const core = els.core = $('.home-core');
    const screen = els.screen = $('#launcherScreen');
    if (!tools || !stage || !core || !screen) return;

    if (!built) {
      built = true;
      if (typeof ResizeObserver === 'function') {
        const observer = new ResizeObserver(() => queueLayout());
        observer.observe(stage);
        observer.observe(tools);
      }
      window.addEventListener('resize', queueLayout);
      window.addEventListener('orientationchange', queueLayout);
      document.addEventListener('madstation:settings-closed', () => refreshLayoutAfterReveal());
      document.addEventListener('mad:workspace-view-updated', () => refreshLayoutAfterReveal());
      document.addEventListener('pointerdown', (event) => {
        if (!panelOpen) return;
        const target = event.target;
        const panel = $('.home-more-panel');
        const more = $('.home-module--more');
        if (panel && !panel.contains(target) && more && !more.contains(target)) closePanel();
      });
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && panelOpen) {
          closePanel();
          event.stopPropagation();
        }
      }, true);
    }

    revision += 1;
    queueLayout();
    document.dispatchEvent(new CustomEvent('mad:home-apps-built'));
  }

  function queueLayout() {
    if (layoutQueued) return;
    layoutQueued = true;
    const schedule = typeof window.requestAnimationFrame === 'function'
      ? window.requestAnimationFrame.bind(window)
      : (callback) => window.setTimeout(callback, 0);
    schedule(() => {
      layoutQueued = false;
      layout();
    });
  }

  function px(value) {
    const number = parseFloat(value);
    return Number.isFinite(number) ? number : 0;
  }

  function positionPanel(anchor) {
    const resolvedAnchor = anchor?.isConnected ? anchor : $('.home-module--more');
    if (!resolvedAnchor) return;
    panelAnchor = resolvedAnchor;
    const box = resolvedAnchor.getBoundingClientRect();
    const panelHeight = Math.min(420, Math.max(120, window.innerHeight - 40));
    const left = Math.min(box.right + 18, window.innerWidth - 330);
    const top = Math.max(16, Math.min(box.top + box.height / 2 - panelHeight / 2, window.innerHeight - panelHeight - 16));
    panelPosition = {
      left: Math.max(12, left),
      top,
      height: panelHeight,
    };
  }

  function layout() {
    const { tools, stage } = els;
    if (!tools || !stage) return;
    const list = sortedApps().filter((app) => app.enabled !== false);
    const narrow = window.matchMedia(CONFIG.narrowQuery).matches;
    const arranging = stage.dataset.homeArranging === 'true';
    const gap = px(getComputedStyle(tools).rowGap) || 12;
    const height = tools.clientHeight;

    layoutName = 'cards';
    let capacity = list.length;
    if (arranging) {
      // In Arrange mode every enabled companion is exposed in the left rail,
      // including entries normally tucked into More Apps. This makes every
      // companion draggable without turning its overflow portal into a second
      // layout surface or allowing it to overlap the core/mini-app zones.
      layoutName = 'cards';
      capacity = list.length;
    } else if (narrow) {
      layoutName = 'stack';
      capacity = Math.min(CONFIG.narrowMaxVisible, CONFIG.maxVisible);
    } else if (height > 0) {
      const rowsCards = Math.max(1, Math.floor((height + gap) / (CONFIG.minCardHeight + gap)));
      if (list.length <= rowsCards) {
        layoutName = 'cards';
      } else {
        layoutName = 'tiles';
        const rowsTiles = Math.max(1, Math.floor((height + gap) / (CONFIG.minTileHeight + gap)));
        capacity = rowsTiles * CONFIG.tileColumns;
      }
      capacity = Math.min(capacity, CONFIG.maxVisible);
    } else {
      // The home screen is hidden. ResizeObserver re-runs layout when it becomes visible.
      return;
    }

    visibleApps = list;
    rest = [];
    if (list.length > capacity) {
      const keep = Math.max(1, capacity - 1);
      visibleApps = list.slice(0, keep);
      rest = list.slice(keep);
    }

    const shown = visibleApps.length + (rest.length ? 1 : 0);
    tools.dataset.layout = layoutName;
    tools.style.setProperty('--cols', String(layoutName === 'tiles' ? CONFIG.tileColumns : 1));
    tools.style.setProperty('--rows', String(layoutName === 'tiles' ? Math.ceil(shown / CONFIG.tileColumns) : shown));
    tools.style.setProperty('--max-card', `${CONFIG.maxCardHeight}px`);
    tools.style.setProperty('--max-tile', `${CONFIG.maxTileHeight}px`);
    const actualGap = Math.max(0, gap);
    const cardHeight = shown > 0 && height > 0
      ? Math.max(CONFIG.minCardHeight, Math.min(CONFIG.maxCardHeight, Math.floor((height - actualGap * Math.max(0, shown - 1)) / shown)))
      : CONFIG.maxCardHeight;
    tools.style.setProperty('--card-row', `${cardHeight}px`);
    stage.dataset.appCount = String(list.length);

    if (!rest.length && panelOpen) {
      panelOpen = false;
      panelAnchor = null;
    }
    if (panelOpen) positionPanel(panelAnchor);
    publishView();
    window.MadHomeCore?.refresh();
  }

  function openPanel(anchor) {
    if (!rest.length || !(anchor instanceof HTMLElement)) return;
    panelOpen = true;
    panelAnchor = anchor;
    positionPanel(anchor);
    publishView();
    window.requestAnimationFrame(() => {
      $('.home-more-item')?.focus({ preventScroll: true });
    });
  }

  function closePanel() {
    if (!panelOpen) return;
    panelOpen = false;
    panelAnchor = null;
    publishView();
  }

  window.MadHomeApps = {
    config: CONFIG,
    register,
    unregister,
    list: () => sortedApps().map(({ id, name, description, order, enabled }) => ({ id, name, description, order, enabled })),
    configure,
    setLauncher(fn) { launcher = typeof fn === 'function' ? fn : null; },
    launchTarget(target) { if (launcher && target) launcher(String(target)); },
    refresh: queueLayout,
    rebuild: queueBuild,
    attachReactRenderer(renderer) {
      if (typeof renderer !== 'function') throw new Error('MadHomeApps.attachReactRenderer: expected a function');
      reactRenderer = renderer;
      queueBuild();
    },
    launch,
    openMore: openPanel,
    closeMore: closePanel,
  };

  window.MadHomeCore?.registerSystem('companions', {
    name: 'Hub companions',
    getLinks: () => {
      const arranging = $('.home-stage')?.dataset?.homeArranging === 'true';
      const selector = arranging
        ? '#homeApps .home-companion-arrange-item:not(.is-off)'
        : '#homeAppsReactMount .home-module:not(.is-off)';
      return [...(document.querySelectorAll(selector) || [])]
        .filter((element) => element.dataset.appId && !element.classList.contains('home-module--more'))
        .map((element) => ({ element, appId: element.dataset.appId, anchor: 'left', grouping: 'single' }));
    },
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', queueBuild);
  else queueBuild();
})();

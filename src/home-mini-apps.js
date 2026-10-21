// Mad Station — Mini app system
// ---------------------------------------------------------------------------
// Registry, preferences, launch routing, and layout coordination stay here.
// React owns only the tile subtree inside #homeMiniApps.
(function () {
  'use strict';

  const apps = [];
  let built = false;
  let queued = false;
  let row = null;
  let reactRenderer = null;
  let revision = 0;

  function $(selector, root) { return (root || document).querySelector(selector); }

  function register(def) {
    if (!def || typeof def !== 'object') throw new Error('MadHomeMiniApps.register: expected an object');
    const id = String(def.id || '').trim();
    if (!/^[a-z0-9][a-z0-9-_]*$/i.test(id)) throw new Error(`MadHomeMiniApps.register: invalid id "${def.id}"`);
    if (!String(def.name || '').trim()) throw new Error(`MadHomeMiniApps.register: missing name for "${id}"`);
    const app = {
      id,
      name: String(def.name).trim(),
      iconSvg: typeof def.iconSvg === 'string' ? def.iconSvg : '',
      launch: String(def.launch || id),
      color: typeof def.color === 'string' && def.color.trim() ? def.color.trim() : '',
      order: Number.isFinite(def.order) ? def.order : null,
      enabled: def.enabled !== false,
    };
    const at = apps.findIndex((item) => item.id === id);
    if (at >= 0) apps[at] = app; else apps.push(app);
    scheduleBuild();
    return app;
  }

  function unregister(id) {
    const at = apps.findIndex((item) => item.id === id);
    if (at >= 0) { apps.splice(at, 1); scheduleBuild(); return true; }
    return false;
  }

  function configure(id, patch = {}) {
    const app = apps.find((item) => item.id === id);
    if (!app || !patch || typeof patch !== 'object') return false;
    if (typeof patch.enabled === 'boolean') app.enabled = patch.enabled;
    if (patch.order === null || Number.isFinite(patch.order)) app.order = patch.order;
    scheduleBuild();
    return true;
  }

  function sortedApps() {
    return apps.map((app, index) => ({ app, index }))
      .sort((a, b) => ((a.app.order ?? 1e6) - (b.app.order ?? 1e6)) || a.index - b.index)
      .map((entry) => entry.app);
  }

  function renderModel() {
    return sortedApps().filter((app) => app.enabled !== false).map((app) => ({
      id: app.id,
      name: app.name,
      iconSvg: app.iconSvg,
      launch: app.launch,
      color: app.color,
      order: app.order,
      enabled: app.enabled,
    }));
  }

  function build() {
    row = row || $('#homeMiniApps');
    if (!row) return;
    const ordered = renderModel();
    row.classList.toggle('is-empty', !ordered.length);
    revision += 1;
    if (!built) {
      built = true;
      if (typeof ResizeObserver === 'function') new ResizeObserver(() => window.MadHomeCore?.refresh()).observe(row);
    }
    if (reactRenderer) reactRenderer({ revision, apps: ordered });
    else document.dispatchEvent(new CustomEvent('mad:home-mini-apps-built'));
    window.MadHomeCore?.refresh();
  }

  function scheduleBuild() {
    if (queued) return;
    queued = true;
    Promise.resolve().then(() => { queued = false; build(); });
  }

  window.MadHomeMiniApps = {
    register,
    unregister,
    list: () => sortedApps().map(({ id, name, launch, color, order, enabled }) => ({ id, name, launch, color, order, enabled })),
    configure,
    refresh: build,
    attachReactRenderer(renderer) {
      if (typeof renderer !== 'function') throw new Error('MadHomeMiniApps.attachReactRenderer: expected a function');
      reactRenderer = renderer;
      build();
    },
  };

  window.MadHomeCore?.registerSystem('mini-apps', {
    name: 'Mini apps',
    getLinks: () => {
      const target = row || $('#homeMiniApps');
      return target ? [...target.querySelectorAll('.home-mini-app-tile:not(.is-off)')]
        .map((element) => ({ element, appId: element.dataset.appId, anchor: 'top', grouping: 'single' })) : [];
    },
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleBuild, { once: true });
  else scheduleBuild();
})();

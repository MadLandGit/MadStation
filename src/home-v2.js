// Mad Station — new Home page engine
// ---------------------------------------------------------------------------
// One small file that owns: the three module registries (companions, quick
// access, widgets), the saved layout, the search palette, Arrange mode, the
// Customize drawer and the live system widgets feed.
//
// Public APIs kept from the old Home so existing code keeps working:
//   window.MadHomeApps / MadHomeMiniApps / MadHomeWidgets  (register, list, configure …)
//   window.MadHomeCustomizer                               (reorder, setSize, addShortcut …)
// Storage key and shape are unchanged: "mad-station-home-modules-v1".
(function () {
  'use strict';

  const KEY = 'mad-station-home-modules-v1';
  const HOST_CHANNEL = 'madstation-home-v2';
  const isFramed = window.parent !== window;
  function sendHost(type, detail = {}) {
    if (!isFramed) return false;
    try { window.parent.postMessage({ channel: HOST_CHANNEL, type, ...detail }, '*'); return true; } catch { return false; }
  }
  let homeReadySent = false;
  // Report initialization failures to the host before they become a blank screen.
  window.addEventListener('error', () => {
    if (isFramed && !homeReadySent) sendHost('home-error');
  });
  window.addEventListener('unhandledrejection', () => {
    if (isFramed && !homeReadySent) sendHost('home-error');
  });
  const SIZES = ['small', 'medium', 'large'];
  const SIZE_LETTER = { small: 'S', medium: 'M', large: 'L' };
  const MAX_VISIBLE = 6;               // companions shown before "More apps" appears
  const ID_RE = /^[a-z0-9][a-z0-9-_]*$/i;
  const HUES = 6;

  const TARGETS = [
    { id: 'ai-hub', label: 'AI Hub' },
    { id: 'clipboard', label: 'Notes & Tasks' },
    { id: 'instruction-forge', label: 'Prompt Studio' },
    { id: 'ai-lab', label: 'AI Playground' },
    { id: 'video-hub', label: 'Video Hub' },
    { id: 'image-hub', label: 'Image Hub' },
  ];
  const TARGET_IDS = new Set(TARGETS.map((t) => t.id));
  const ICONS = {
    'ai-hub': '<circle cx="12" cy="12" r="3"></circle><circle cx="5" cy="6" r="1.4"></circle><circle cx="19" cy="6" r="1.4"></circle><circle cx="12" cy="20" r="1.4"></circle><path d="m9.7 10-3.5-2.8M14.3 10l3.5-2.8M12 15v3.6"></path>',
    clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"></rect><path d="M9 4.5h6v3H9zM8 11h8M8 15h6"></path>',
    'instruction-forge': '<path d="M5 6.5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H10l-4 3v-5.2a2 2 0 0 1-1-1.8z"></path><path d="M8 8.5h7M8 11.5h5"></path>',
    'ai-lab': '<path d="M9 3h6M10 3v5l-4.6 9.1A2 2 0 0 0 7.2 20h9.6a2 2 0 0 0 1.8-2.9L14 8V3"></path><path d="M8 14h8"></path>',
    'video-hub': '<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"></rect><path d="m10 9 5 3-5 3z"></path>',
    'image-hub': '<rect x="3" y="3" width="18" height="18" rx="3"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><path d="m21 15-5-5L5 21"></path>',
    generic: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"></rect><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"></rect><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"></rect><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"></rect>',
  };
  const ICON_ARROW = '<path d="M5 12h14M13 6l6 6-6 6"></path>';
  const ICON_MORE = '<circle cx="5.5" cy="12" r="1.6"></circle><circle cx="12" cy="12" r="1.6"></circle><circle cx="18.5" cy="12" r="1.6"></circle>';
  const ICON_GRIP = '<circle cx="9" cy="6" r="1.2"></circle><circle cx="15" cy="6" r="1.2"></circle><circle cx="9" cy="12" r="1.2"></circle><circle cx="15" cy="12" r="1.2"></circle><circle cx="9" cy="18" r="1.2"></circle><circle cx="15" cy="18" r="1.2"></circle>';

  /* ------------------------------------------------------------------ utils */
  const $ = (selector, root) => (root || document).querySelector(selector);
  const inApp = typeof window.aiHub !== 'undefined' || isFramed;
  const reduceMotion = () => document.body.classList.contains('reduce-motion')
    || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function h(tag, props, ...kids) {
    const node = document.createElement(tag);
    for (const [name, value] of Object.entries(props || {})) {
      if (value == null || value === false) continue;
      if (name === 'class') node.className = value;
      else if (name === 'data') Object.assign(node.dataset, value);
      else if (name === 'vars') for (const [k, v] of Object.entries(value)) node.style.setProperty(k, v);
      else if (name.startsWith('on')) node.addEventListener(name.slice(2), value);
      else node.setAttribute(name, value === true ? '' : String(value));
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return node;
  }

  // Icons are rebuilt from an allow-list so stored/custom markup can never inject script.
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const OK_TAGS = new Set(['path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse']);
  const OK_ATTRS = new Set(['d', 'cx', 'cy', 'r', 'x', 'y', 'width', 'height', 'rx', 'ry', 'x1', 'x2', 'y1', 'y2', 'points']);
  function svgIcon(markup, className) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    if (className) svg.setAttribute('class', className);
    const build = (source) => {
      const doc = new DOMParser().parseFromString(`<svg xmlns="${SVG_NS}">${source}</svg>`, 'image/svg+xml');
      if (doc.querySelector('parsererror')) return false;
      for (const child of doc.documentElement.children) {
        const tag = child.localName.toLowerCase();
        if (!OK_TAGS.has(tag)) continue;
        const node = document.createElementNS(SVG_NS, tag);
        for (const attr of child.attributes) if (OK_ATTRS.has(attr.name) && !/[<>]/.test(attr.value)) node.setAttribute(attr.name, attr.value);
        svg.appendChild(node);
      }
      return true;
    };
    try { if (!build(markup || ICONS.generic)) build(ICONS.generic); } catch { build(ICONS.generic); }
    return svg;
  }

  function iconFor(item, className) {
    if (item.iconUrl) return h('img', { class: className, src: item.iconUrl, alt: '', draggable: 'false' });
    return svgIcon(item.iconSvg, className);
  }

  let toastTimer = null;
  function toast(message) {
    const node = $('#homeToast');
    if (!node) return;
    node.textContent = String(message || '');
    node.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove('is-on'), 2200);
  }

  /* -------------------------------------------------------------- registries */
  let renderQueued = false;
  function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    Promise.resolve().then(() => { renderQueued = false; render(); });
  }

  function createRegistry(normalize) {
    const items = [];
    const sorted = () => items.map((item, index) => ({ item, index }))
      .sort((a, b) => ((a.item.order ?? 1e6) - (b.item.order ?? 1e6)) || a.index - b.index)
      .map((entry) => entry.item);
    return {
      items,
      sorted,
      get: (id) => items.find((item) => item.id === id) || null,
      register(def) {
        const item = normalize(def);
        const at = items.findIndex((x) => x.id === item.id);
        if (at >= 0) items[at] = item; else items.push(item);
        scheduleRender();
        return item;
      },
      unregister(id) {
        const at = items.findIndex((x) => x.id === id);
        if (at < 0) return false;
        items.splice(at, 1);
        scheduleRender();
        return true;
      },
      configure(id, patch) {
        const item = items.find((x) => x.id === id);
        if (!item || !patch || typeof patch !== 'object') return false;
        if (typeof patch.enabled === 'boolean') item.enabled = patch.enabled;
        if (patch.order === null || Number.isFinite(patch.order)) item.order = patch.order;
        if (item.kind === 'widgets' && SIZES.includes(patch.size)) item.size = patch.size;
        scheduleRender();
        return true;
      },
    };
  }

  const checkId = (def, label) => {
    const id = String(def?.id || '').trim();
    if (!ID_RE.test(id)) throw new Error(`${label}: invalid id "${def?.id}"`);
    return id;
  };
  const chipText = (chip) => (typeof chip === 'string' ? chip : String(chip?.html || '').replace(/<[^>]*>/g, '').trim());

  const apps = createRegistry((def) => {
    const id = checkId(def, 'MadHomeApps.register');
    return {
      kind: 'companions', id, name: String(def.name || id), description: String(def.description || ''),
      chips: Array.isArray(def.chips) ? def.chips.slice(0, 6).map(chipText).filter(Boolean) : [],
      iconSvg: typeof def.iconSvg === 'string' ? def.iconSvg : '', iconUrl: typeof def.iconUrl === 'string' ? def.iconUrl : '',
      launch: def.launch ? String(def.launch) : id, open: typeof def.open === 'function' ? def.open : null,
      hue: Number.isInteger(def.hue) ? def.hue : null, order: Number.isFinite(def.order) ? def.order : null, enabled: def.enabled !== false,
    };
  });
  const minis = createRegistry((def) => {
    const id = checkId(def, 'MadHomeMiniApps.register');
    if (!String(def.name || '').trim()) throw new Error(`MadHomeMiniApps.register: missing name for "${id}"`);
    return {
      kind: 'miniApps', id, name: String(def.name).trim(), iconSvg: typeof def.iconSvg === 'string' ? def.iconSvg : '',
      launch: String(def.launch || id), color: typeof def.color === 'string' ? def.color.trim() : '',
      order: Number.isFinite(def.order) ? def.order : null, enabled: def.enabled !== false,
    };
  });
  const widgets = createRegistry((def) => {
    const id = checkId(def, 'MadHomeWidgets.register');
    if (!String(def.title || '').trim()) throw new Error(`MadHomeWidgets.register: missing title for "${id}"`);
    if (typeof def.render !== 'function') throw new Error(`MadHomeWidgets.register: "${id}" needs a render(panel) function`);
    return {
      kind: 'widgets', id, title: String(def.title).trim(), size: SIZES.includes(def.size) ? def.size : 'medium',
      order: Number.isFinite(def.order) ? def.order : null, enabled: def.enabled !== false, render: def.render,
    };
  });
  const REGISTRIES = { companions: apps, miniApps: minis, widgets };

  let launcher = (target) => toast(`Opening ${TARGETS.find((t) => t.id === target)?.label || target}…`);
  function launchTarget(target) {
    if (!target) return;
    if (sendHost('launch', { target: String(target) })) return;
    launcher(String(target));
  }
  function launchApp(id) {
    const app = apps.get(id);
    if (!app) return;
    closeMore();
    if (app.open) { try { app.open(app); } catch (error) { console.error('Home app open() failed', error); } return; }
    launchTarget(app.launch);
  }

  window.MadHomeApps = {
    register: apps.register, unregister: apps.unregister, configure: apps.configure,
    list: () => apps.sorted().map(({ id, name, description, order, enabled }) => ({ id, name, description, order, enabled })),
    setLauncher(fn) { if (typeof fn === 'function') launcher = fn; },
    launchTarget, launch: launchApp, refresh: scheduleRender, rebuild: scheduleRender,
    openMore: (anchor) => openMore(anchor), closeMore: () => closeMore(),
    attachReactRenderer() { /* the new Home renders itself */ },
  };
  window.MadHomeMiniApps = {
    register: minis.register, unregister: minis.unregister, configure: minis.configure,
    list: () => minis.sorted().map(({ id, name, launch, color, order, enabled }) => ({ id, name, launch, color, order, enabled })),
    refresh: scheduleRender, attachReactRenderer() {},
  };
  window.MadHomeWidgets = {
    register: widgets.register, unregister: widgets.unregister, configure: widgets.configure,
    list: () => widgets.sorted().map(({ id, title, size, order, enabled }) => ({ id, title, size, order, enabled })),
    refresh: scheduleRender, attachReactRenderer() {},
  };
  window.MadHomeCore = { refresh() {}, registerSystem() {}, unregisterSystem() {} }; // legacy no-ops (signal lines are gone)

  /* --------------------------------------------------------------- storage */
  let state = { version: 1, modules: {}, customCompanions: [], customMiniApps: [], widgetPositions: {} };
  let defaults = null;

  function normalizePositions(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
    const out = {};
    for (const [id, p] of Object.entries(input).slice(0, 256)) {
      if (!ID_RE.test(id) || !p || typeof p !== 'object') continue;
      const x = Number(p.x); const y = Number(p.y);
      if (Number.isFinite(x) && Number.isFinite(y)) out[id] = { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
    }
    return out;
  }
  function readState() {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) || '{}');
      if (!v || typeof v !== 'object' || Array.isArray(v)) return state;
      return {
        version: 1,
        modules: v.modules && typeof v.modules === 'object' && !Array.isArray(v.modules) ? v.modules : {},
        customCompanions: Array.isArray(v.customCompanions) ? v.customCompanions : [],
        customMiniApps: Array.isArray(v.customMiniApps) ? v.customMiniApps : [],
        widgetPositions: normalizePositions(v.widgetPositions),
      };
    } catch { return state; }
  }
  function writeState() {
    state.modules = {};
    for (const [kind, reg] of Object.entries(REGISTRIES)) {
      state.modules[kind] = {};
      for (const item of reg.sorted()) {
        state.modules[kind][item.id] = {
          enabled: item.enabled !== false,
          order: Number.isFinite(item.order) ? item.order : null,
          ...(kind === 'widgets' ? { size: item.size } : {}),
        };
      }
    }
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage unavailable: this session still works */ }
  }
  function registerCustomEntries() {
    for (const item of state.customCompanions) {
      if (!item || !/^custom-companion-[a-z0-9-]+$/i.test(String(item.id || '')) || !String(item.name || '').trim() || !TARGET_IDS.has(item.launch)) continue;
      apps.register({ id: item.id, name: item.name, description: item.description || 'Custom home shortcut', chips: Array.isArray(item.chips) ? item.chips : ['Custom'], iconSvg: ICONS[item.launch] || ICONS.generic, launch: item.launch, order: Number.isFinite(item.order) ? item.order : null });
    }
    for (const item of state.customMiniApps) {
      if (!item || !/^custom-mini-[a-z0-9-]+$/i.test(String(item.id || '')) || !String(item.name || '').trim() || !TARGET_IDS.has(item.launch)) continue;
      minis.register({ id: item.id, name: item.name, iconSvg: ICONS[item.launch] || ICONS.generic, launch: item.launch, color: item.color || '', order: Number.isFinite(item.order) ? item.order : null });
    }
  }
  function applyStored() {
    for (const [kind, reg] of Object.entries(REGISTRIES)) {
      const prefs = state.modules?.[kind] || {};
      for (const item of reg.items) {
        const pref = prefs[item.id];
        if (!pref) continue;
        const patch = { enabled: pref.enabled !== false };
        if (pref.order === null || Number.isFinite(pref.order)) patch.order = pref.order;
        if (kind === 'widgets' && SIZES.includes(pref.size)) patch.size = pref.size;
        reg.configure(item.id, patch);
      }
    }
  }
  const snapshotDefaults = () => Object.fromEntries(Object.entries(REGISTRIES).map(([kind, reg]) => [kind, reg.sorted().map((i) => ({ id: i.id, enabled: i.enabled !== false, order: i.order, size: i.size }))]));

  /* ------------------------------------------------------------ customizer API */
  const listOf = (kind) => REGISTRIES[kind]?.sorted() || [];
  const KIND_LABEL = { companions: 'Workspace order saved', miniApps: 'Quick access order saved', widgets: 'Widget order saved' };

  function reorder(kind, orderedIds) {
    const reg = REGISTRIES[kind];
    if (!reg || !Array.isArray(orderedIds)) return false;
    const expected = reg.items.map((i) => i.id);
    const requested = orderedIds.map(String);
    if (requested.length !== expected.length || new Set(requested).size !== requested.length) return false;
    if (requested.some((id) => !expected.includes(id))) return false;
    requested.forEach((id, index) => reg.configure(id, { order: (index + 1) * 10 }));
    writeState();
    toast(KIND_LABEL[kind]);
    return true;
  }
  function setEnabled(kind, id, enabled) {
    if (!REGISTRIES[kind] || typeof enabled !== 'boolean') return;
    REGISTRIES[kind].configure(id, { enabled });
    writeState(); toast(enabled ? 'Shown on Home' : 'Hidden from Home');
  }
  function setSize(kind, id, size) {
    if (kind !== 'widgets' || !SIZES.includes(size)) return;
    widgets.configure(id, { size }); writeState(); toast(`Widget size: ${size}`);
  }
  function move(kind, id, delta) {
    if (!REGISTRIES[kind] || ![-1, 1].includes(delta)) return;
    const ids = listOf(kind).map((i) => i.id);
    const from = ids.indexOf(id); const to = from + delta;
    if (from < 0 || to < 0 || to >= ids.length) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    ids.forEach((x, i) => REGISTRIES[kind].configure(x, { order: (i + 1) * 10 }));
    writeState(); toast('Order saved');
  }
  const nextOrder = (kind) => listOf(kind).reduce((max, item, i) => Math.max(max, Number.isFinite(item.order) ? item.order : (i + 1) * 10), 0) + 10;
  function nextId(prefix, list) {
    let n = list.length + 1; const ids = new Set(list.map((x) => x.id));
    while (ids.has(`${prefix}-${n}`)) n += 1;
    return `${prefix}-${n}`;
  }
  function addShortcut(input) {
    const name = String(input?.name || '').trim().slice(0, 42);
    const launch = String(input?.target || '');
    const kind = input?.kind;
    if (!name || !TARGET_IDS.has(launch) || !['companion', 'mini'].includes(kind)) return false;
    if (kind === 'companion') {
      const id = nextId('custom-companion', state.customCompanions);
      const item = { id, name, description: `Quick access to ${TARGETS.find((t) => t.id === launch)?.label || launch}.`, chips: ['Custom'], launch, order: nextOrder('companions') };
      apps.register({ ...item, iconSvg: ICONS[launch] || ICONS.generic });
      state.customCompanions.push(item);
    } else {
      const id = nextId('custom-mini', state.customMiniApps);
      const item = { id, name, launch, color: '', order: nextOrder('miniApps') };
      minis.register({ ...item, iconSvg: ICONS[launch] || ICONS.generic });
      state.customMiniApps.push(item);
    }
    writeState(); toast('Shortcut added');
    return true;
  }
  function removeCustom(kind, id) {
    if (kind === 'companions' && String(id).startsWith('custom-companion-')) {
      apps.unregister(id); state.customCompanions = state.customCompanions.filter((i) => i.id !== id);
    } else if (kind === 'miniApps' && String(id).startsWith('custom-mini-')) {
      minis.unregister(id); state.customMiniApps = state.customMiniApps.filter((i) => i.id !== id);
    } else return;
    writeState(); toast('Shortcut removed');
  }
  function resetDefaults() {
    state.customCompanions.forEach((i) => apps.unregister(i.id));
    state.customMiniApps.forEach((i) => minis.unregister(i.id));
    state.customCompanions = []; state.customMiniApps = []; state.widgetPositions = {};
    for (const [kind, items] of Object.entries(defaults || {})) {
      items.forEach((i) => REGISTRIES[kind].configure(i.id, { enabled: i.enabled, order: Number.isFinite(i.order) ? i.order : null, ...(kind === 'widgets' ? { size: i.size } : {}) }));
    }
    state.modules = {}; writeState(); toast('Default layout restored');
  }

  window.MadHomeCustomizer = {
    open: () => openDrawer(), close: () => closeDrawer(), attachReactRenderer() {},
    setEnabled, move, reorder, setSize, removeCustom, addShortcut, resetDefaults,
    getWidgetPositions: () => JSON.parse(JSON.stringify(state.widgetPositions)),
    setWidgetPositions(p) { state.widgetPositions = normalizePositions(p); writeState(); return true; },
    setWidgetPosition(id, x, y) {
      if (!ID_RE.test(String(id))) return false;
      state.widgetPositions = normalizePositions({ ...state.widgetPositions, [id]: { x, y } }); writeState(); return true;
    },
  };

  /* --------------------------------------------------------------- rendering */
  let arranging = false;
  const widgetCache = new Map();

  const hueOf = (index, pinned) => `var(--h${(((pinned ?? index) % HUES) + HUES) % HUES + 1})`;
  const grip = () => h('span', { class: 'hm-grip', 'aria-hidden': 'true' }, svgIcon(ICON_GRIP));

  function sortableAttrs(id, label) {
    return arranging ? { 'data-sortable': '', tabindex: '0', 'aria-roledescription': 'sortable item', 'aria-label': `${label}. Drag, or use arrow keys to move.` } : {};
  }

  function companionCard(app, index) {
    const node = h('button', {
      class: 'hm-card', type: 'button', title: app.name, data: { id: app.id }, vars: { '--mod': hueOf(index, app.hue) },
      ...sortableAttrs(app.id, app.name),
      onclick: () => { if (!arranging) launchApp(app.id); },
    },
    h('span', { class: 'hm-card-icon' }, iconFor(app)),
    h('span', { class: 'hm-card-body' },
      h('strong', null, app.name),
      h('span', { class: 'hm-card-desc' }, app.description),
      app.chips.length ? h('span', { class: 'hm-chips' }, app.chips.map((c) => h('span', null, c))) : null),
    arranging ? grip() : h('span', { class: 'hm-card-go' }, svgIcon(ICON_ARROW)));
    if (arranging) node.setAttribute('data-sortable', '');
    return node;
  }

  function moreCard(rest) {
    const names = rest.slice(0, 3).map((a) => a.name).join(', ') + (rest.length > 3 ? '…' : '');
    const node = h('button', {
      class: 'hm-card hm-card--more', type: 'button', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', vars: { '--mod': 'var(--muted)' },
      onclick: (event) => { if (moreOpen) closeMore(); else openMore(event.currentTarget); },
    },
    h('span', { class: 'hm-card-icon' }, svgIcon(ICON_MORE)),
    h('span', { class: 'hm-card-body' }, h('strong', null, 'More apps'), h('span', { class: 'hm-card-desc' }, names),
      h('span', { class: 'hm-chips' }, h('span', null, `${rest.length} more`))),
    h('span', { class: 'hm-card-go' }, svgIcon(ICON_ARROW)));
    node.hmRest = rest;
    return node;
  }

  function miniTile(app, index) {
    const node = h('button', {
      class: 'hm-quick-item', type: 'button', title: app.name, data: { id: app.id },
      vars: { '--mod': app.color || hueOf(index + 4) }, ...sortableAttrs(app.id, app.name),
      onclick: () => { if (!arranging) launchTarget(app.launch); },
    }, h('span', { class: 'hm-quick-icon' }, svgIcon(app.iconSvg)), h('span', null, app.name), arranging ? grip() : null);
    return node;
  }

  function widgetShell(widget) {
    let shell = widgetCache.get(widget.id);
    if (!shell) {
      const body = h('div', { class: 'hm-widget-body', data: { widgetPanel: widget.id } });
      const sizeBtn = h('button', { class: 'hm-size-btn', type: 'button', onclick: () => {
        if (!arranging) return;
        const current = widgets.get(widget.id);
        const next = SIZES[(SIZES.indexOf(current.size) + 1) % SIZES.length];
        widgets.configure(widget.id, { size: next }); writeState(); setStatus(`${current.title}: ${next}`);
      } });
      shell = h('section', { class: 'hm-widget', data: { id: widget.id }, 'aria-label': widget.title },
        h('header', { class: 'hm-widget-head' }, h('h3', null, widget.title), sizeBtn, grip()), body);
      try { widget.render(body, { id: widget.id, title: widget.title, size: widget.size }); }
      catch (error) {
        console.error(`Home widget "${widget.id}" failed to render`, error);
        body.replaceChildren(h('p', { class: 'hm-widget-error', role: 'alert' }, 'This widget could not be loaded.'));
      }
      widgetCache.set(widget.id, shell);
    }
    shell.dataset.size = widget.size;
    shell.querySelector('h3').textContent = widget.title;
    const sizeBtn = shell.querySelector('.hm-size-btn');
    sizeBtn.textContent = SIZE_LETTER[widget.size];
    sizeBtn.title = `Size: ${widget.size}. Click to change.`;
    sizeBtn.setAttribute('aria-label', `${widget.title} size: ${widget.size}. Change size`);
    if (arranging) { shell.setAttribute('data-sortable', ''); shell.tabIndex = 0; shell.setAttribute('aria-label', `${widget.title}. Drag, or use arrow keys to move.`); }
    else { shell.removeAttribute('data-sortable'); shell.removeAttribute('tabindex'); shell.setAttribute('aria-label', widget.title); }
    return shell;
  }

  function emptyNote(text, actionLabel, action) {
    return h('div', { class: 'hm-empty' }, h('p', null, text), actionLabel ? h('button', { type: 'button', class: 'hm-link-btn', onclick: action }, actionLabel) : null);
  }

  let lastFocusKey = null;
  function render() {
    const screen = $('#launcherScreen');
    if (!screen) return;
    const active = document.activeElement;
    lastFocusKey = active && screen.contains(active) && active.dataset?.id ? active.dataset.id : null;

    // Companions
    const list = apps.sorted().filter((a) => a.enabled !== false);
    const box = $('#homeApps');
    const limit = arranging ? Infinity : MAX_VISIBLE;
    let visible = list; let rest = [];
    if (list.length > limit) { visible = list.slice(0, limit - 1); rest = list.slice(limit - 1); }
    moreRest = rest;
    box.replaceChildren(...visible.map(companionCard), ...(rest.length ? [moreCard(rest)] : []));
    if (!list.length) box.replaceChildren(emptyNote('No workspaces are shown on Home.', 'Choose workspaces', openDrawer));
    $('#homeAppsCount').textContent = list.length ? `${list.length} ${list.length === 1 ? 'app' : 'apps'}` : '';
    if (!rest.length && moreOpen) closeMore();
    else if (moreOpen) buildMorePanel();

    // Quick access
    const quick = minis.sorted().filter((m) => m.enabled !== false);
    $('#homeMiniApps').replaceChildren(...quick.map(miniTile));
    $('#homeMiniSection').hidden = !quick.length;

    // Widgets
    const shown = widgets.sorted().filter((w) => w.enabled !== false);
    for (const id of [...widgetCache.keys()]) if (!widgets.get(id)) widgetCache.delete(id);
    const wbox = $('#homeWidgets');
    if (shown.length) wbox.replaceChildren(...shown.map(widgetShell));
    else wbox.replaceChildren(emptyNote('No widgets are shown.', 'Choose widgets', openDrawer));

    if (lastFocusKey) {
      const again = screen.querySelector(`[data-id="${CSS.escape(lastFocusKey)}"]`);
      if (again && arranging) again.focus({ preventScroll: true });
    }
    if (drawerOpen) renderDrawer();
    refreshSearch();
  }

  /* ------------------------------------------------------------- More apps */
  let moreOpen = false; let moreRest = []; let moreAnchor = null;
  function buildMorePanel() {
    let panel = $('.hm-more-panel');
    if (!panel) { panel = h('div', { class: 'hm-more-panel', role: 'dialog', 'aria-label': 'More apps' }); $('#launcherScreen').append(panel); }
    panel.replaceChildren(
      h('div', { class: 'hm-more-head' }, h('strong', null, 'More apps'), h('small', null, `${moreRest.length} ${moreRest.length === 1 ? 'app' : 'apps'}`)),
      h('div', { class: 'hm-more-list' }, moreRest.map((app, i) => h('button', {
        class: 'hm-more-item', type: 'button', data: { id: app.id }, vars: { '--mod': hueOf(MAX_VISIBLE - 1 + i, app.hue) }, onclick: () => launchApp(app.id),
      }, h('span', { class: 'hm-card-icon' }, iconFor(app)), h('span', { class: 'hm-more-text' }, h('strong', null, app.name), h('span', null, app.description))))));
    const anchor = moreAnchor?.isConnected ? moreAnchor : $('.hm-card--more');
    if (anchor) {
      const screenBox = $('#launcherScreen').getBoundingClientRect();
      const box = anchor.getBoundingClientRect();
      const width = Math.min(360, screenBox.width - 24);
      panel.style.width = `${width}px`;
      panel.style.left = `${Math.max(12, Math.min(box.left - screenBox.left, screenBox.width - width - 12))}px`;
      const below = box.bottom - screenBox.top + 8;
      panel.style.top = `${below}px`;
      const max = window.innerHeight - box.bottom - 24;
      panel.style.maxHeight = `${Math.max(180, max)}px`;
    }
  }
  function openMore(anchor) {
    if (!moreRest.length || !(anchor instanceof HTMLElement)) return;
    moreOpen = true; moreAnchor = anchor; anchor.setAttribute('aria-expanded', 'true'); buildMorePanel();
    requestAnimationFrame(() => $('.hm-more-item')?.focus({ preventScroll: true }));
  }
  function closeMore() {
    if (!moreOpen) return;
    moreOpen = false; moreAnchor?.setAttribute?.('aria-expanded', 'false'); moreAnchor?.focus?.({ preventScroll: true }); moreAnchor = null;
    $('.hm-more-panel')?.remove();
  }
  document.addEventListener('pointerdown', (event) => {
    if (moreOpen && !event.target.closest('.hm-more-panel, .hm-card--more')) closeMore();
  });

  /* ------------------------------------------------------------------ search */
  let searchHits = []; let searchIndex = 0;
  function searchPool() {
    const hub = { key: 'hub', name: 'AI Hub', desc: 'Every AI account, provider and session', icon: ICONS['ai-hub'], tint: 'var(--accent)', run: () => launchTarget('ai-hub') };
    const cs = apps.sorted().filter((a) => a.enabled !== false).map((a, i) => ({ key: a.id, name: a.name, desc: a.description, chips: a.chips.join(' '), icon: a.iconSvg, tint: hueOf(i, a.hue), run: () => launchApp(a.id) }));
    const ms = minis.sorted().filter((m) => m.enabled !== false).map((m, i) => ({ key: m.id, name: m.name, desc: 'Quick access', icon: m.iconSvg, tint: m.color || hueOf(i + 4), run: () => launchTarget(m.launch) }));
    return [hub, ...cs, ...ms];
  }
  function refreshSearch() {
    const input = $('#homeSearch'); const out = $('#homeSearchResults');
    if (!input || !out || document.activeElement !== input) return;
    const q = input.value.trim().toLowerCase();
    let hits = searchPool();
    if (q) {
      hits = hits.map((x) => {
        const n = x.name.toLowerCase(); const rest = `${x.desc} ${x.chips || ''}`.toLowerCase();
        const score = n.startsWith(q) ? 0 : n.includes(q) ? 1 : rest.includes(q) ? 2 : 9;
        return { x, score };
      }).filter((e) => e.score < 9).sort((a, b) => a.score - b.score).map((e) => e.x);
    }
    searchHits = hits; searchIndex = Math.min(searchIndex, Math.max(0, hits.length - 1));
    out.replaceChildren(...(hits.length ? hits.map((x, i) => h('button', {
      class: 'hm-result', type: 'button', role: 'option', id: `hmResult${i}`, 'aria-selected': String(i === searchIndex), vars: { '--mod': x.tint },
      onpointerdown: (e) => e.preventDefault(), onclick: () => runHit(i),
    }, h('span', { class: 'hm-card-icon' }, svgIcon(x.icon)), h('span', { class: 'hm-more-text' }, h('strong', null, x.name), h('span', null, x.desc)))) : [h('p', { class: 'hm-result-empty' }, `Nothing matches “${input.value.trim()}”.`)]));
    out.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    input.setAttribute('aria-activedescendant', hits.length ? `hmResult${searchIndex}` : '');
  }
  function runHit(i) { const hit = searchHits[i]; if (!hit) return; closeSearch(); hit.run(); }
  function closeSearch(clear = true) {
    const input = $('#homeSearch'); const out = $('#homeSearchResults');
    if (clear && input) input.value = '';
    if (out) out.hidden = true;
    input?.setAttribute('aria-expanded', 'false');
    input?.blur();
  }
  function initSearch() {
    const input = $('#homeSearch'); if (!input) return;
    input.addEventListener('focus', () => { searchIndex = 0; refreshSearch(); });
    input.addEventListener('input', () => { searchIndex = 0; refreshSearch(); });
    input.addEventListener('blur', () => { const out = $('#homeSearchResults'); if (out) out.hidden = true; input.setAttribute('aria-expanded', 'false'); });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (!searchHits.length) return;
        searchIndex = (searchIndex + (event.key === 'ArrowDown' ? 1 : -1) + searchHits.length) % searchHits.length;
        refreshSearch(); $(`#hmResult${searchIndex}`)?.scrollIntoView({ block: 'nearest' });
      } else if (event.key === 'Enter') { event.preventDefault(); runHit(searchIndex); }
      else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeSearch(); }
    });
    document.addEventListener('keydown', (event) => {
      const typing = /^(input|textarea|select)$/i.test(event.target.tagName) || event.target.isContentEditable;
      const screen = $('#launcherScreen');
      if (!screen || screen.classList.contains('hidden') || drawerOpen) return;
      if ((event.key === '/' && !typing) || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k')) {
        event.preventDefault(); input.focus(); input.select();
      }
    });
  }

  /* ------------------------------------------------------------------ Arrange */
  let snapshot = null;
  function setStatus(message) { const s = $('#homeLayoutEditorStatus'); if (s) s.textContent = message; }
  const takeSnapshot = () => Object.fromEntries(Object.entries(REGISTRIES).map(([kind, reg]) => [kind, reg.sorted().map((i) => ({ id: i.id, order: i.order, enabled: i.enabled !== false, size: i.size }))]));

  function enterArrange() {
    if (arranging) return;
    closeMore(); closeDrawer();
    arranging = true; snapshot = takeSnapshot();
    const screen = $('#launcherScreen');
    screen.dataset.arranging = 'true';
    const btn = $('#homeArrangeBtn'); btn.setAttribute('aria-pressed', 'true'); btn.querySelector('span').textContent = 'Done';
    $('#homeLayoutEditorBar').hidden = false;
    setStatus('Changes save on this device.');
    render();
    $('#homeLayoutDoneBtn')?.focus({ preventScroll: true });
  }
  function leaveArrange(restore) {
    if (!arranging) return;
    if (restore && snapshot) {
      for (const [kind, items] of Object.entries(snapshot)) items.forEach((i) => REGISTRIES[kind].configure(i.id, { order: i.order, enabled: i.enabled, ...(kind === 'widgets' ? { size: i.size } : {}) }));
    }
    writeState();
    arranging = false; snapshot = null;
    $('#launcherScreen').removeAttribute('data-arranging');
    const btn = $('#homeArrangeBtn'); btn.setAttribute('aria-pressed', 'false'); btn.querySelector('span').textContent = 'Arrange';
    $('#homeLayoutEditorBar').hidden = true;
    render();
    toast(restore ? 'Changes discarded' : 'Layout saved');
    btn.focus({ preventScroll: true });
  }

  const visibleIds = (container) => [...container.querySelectorAll(':scope > [data-sortable]')].map((n) => n.dataset.id);
  function commitOrder(kind, container) {
    const reg = REGISTRIES[kind]; const ids = visibleIds(container);
    const set = new Set(ids); let k = 0;
    const merged = reg.sorted().map((i) => (set.has(i.id) ? ids[k++] : i.id));
    merged.forEach((id, i) => reg.configure(id, { order: (i + 1) * 10 }));
    writeState();
    setStatus('Order saved on this device.');
  }

  function flip(container, mutate, skip) {
    const kids = [...container.children];
    const first = new Map(kids.map((k) => [k, k.getBoundingClientRect()]));
    mutate();
    if (reduceMotion()) return;
    for (const k of kids) {
      if (k === skip) continue;
      const a = first.get(k); const b = k.getBoundingClientRect();
      const dx = a.left - b.left; const dy = a.top - b.top;
      if (dx || dy) k.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }], { duration: 190, easing: 'cubic-bezier(.2,.7,.2,1)' });
    }
  }

  let drag = null;
  function startDrag(event) {
    const { item } = drag;
    const rect = item.getBoundingClientRect();
    const ghost = item.cloneNode(true);
    ghost.classList.add('hm-ghost');
    Object.assign(ghost.style, { width: `${rect.width}px`, height: `${rect.height}px`, left: '0', top: '0' });
    drag.ghost = ghost; drag.dx = event.clientX - rect.left; drag.dy = event.clientY - rect.top; drag.active = true;
    document.body.append(ghost);
    item.classList.add('is-lifted'); document.body.classList.add('is-dragging');
    try { item.setPointerCapture(drag.id); } catch { /* not capturable */ }
  }
  function reorderFor(event) {
    const { item, container } = drag;
    const target = [...container.children].find((c) => {
      if (c === item || c.dataset.sortable === undefined) return false;
      const r = c.getBoundingClientRect();
      return event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom;
    });
    if (!target) return;
    const r = target.getBoundingClientRect();
    const dx = (event.clientX - (r.left + r.width / 2)) / r.width;
    const dy = (event.clientY - (r.top + r.height / 2)) / r.height;
    const before = Math.abs(dx) > Math.abs(dy) ? dx < 0 : dy < 0;
    if (before ? item.nextElementSibling === target : item.previousElementSibling === target) return;
    flip(container, () => container.insertBefore(item, before ? target : target.nextElementSibling), item);
  }
  function endDrag(cancel) {
    if (!drag) return;
    const { item, container, kind, ghost, active } = drag;
    drag = null;
    if (!active) return;
    ghost.remove(); item.classList.remove('is-lifted'); document.body.classList.remove('is-dragging');
    if (!cancel) commitOrder(kind, container);
  }
  function initArrange() {
    $('#homeArrangeBtn')?.addEventListener('click', () => (arranging ? leaveArrange(false) : enterArrange()));
    $('#homeLayoutDoneBtn')?.addEventListener('click', () => leaveArrange(false));
    $('#homeLayoutCancelBtn')?.addEventListener('click', () => leaveArrange(true));
    document.addEventListener('pointerdown', (event) => {
      if (!arranging || event.button !== 0) return;
      const item = event.target.closest('[data-sortable]');
      if (!item || event.target.closest('.hm-size-btn')) return;
      const container = item.parentElement;
      drag = { item, container, kind: container.dataset.kind, x: event.clientX, y: event.clientY, id: event.pointerId, active: false };
    });
    document.addEventListener('pointermove', (event) => {
      if (!drag) return;
      if (!drag.active) { if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 5) return; startDrag(event); }
      drag.ghost.style.transform = `translate(${event.clientX - drag.dx}px, ${event.clientY - drag.dy}px) scale(1.02)`;
      reorderFor(event);
    });
    document.addEventListener('pointerup', () => endDrag(false));
    document.addEventListener('pointercancel', () => endDrag(true));
    window.addEventListener('blur', () => endDrag(true));
    document.addEventListener('keydown', (event) => {
      if (!arranging) return;
      if (event.key === 'Escape') { event.preventDefault(); if (drag?.active) endDrag(true); else leaveArrange(true); return; }
      const item = event.target.closest?.('[data-sortable]');
      if (!item || !['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      const container = item.parentElement; const kind = container.dataset.kind;
      const ids = visibleIds(container); const from = ids.indexOf(item.dataset.id);
      const to = from + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1);
      if (to < 0 || to >= ids.length) return;
      ids.splice(to, 0, ids.splice(from, 1)[0]);
      const reg = REGISTRIES[kind]; const set = new Set(ids); let k = 0;
      reg.sorted().map((i) => (set.has(i.id) ? ids[k++] : i.id)).forEach((id, i) => reg.configure(id, { order: (i + 1) * 10 }));
      writeState(); setStatus('Order saved on this device.');
    });
  }

  /* --------------------------------------------------------------- Customize */
  let drawerOpen = false;
  const SECTION_TITLES = { companions: 'Workspaces', miniApps: 'Quick access', widgets: 'System widgets' };

  function drawerRow(kind, item, index, total) {
    const name = kind === 'widgets' ? item.title : item.name;
    const custom = (kind === 'companions' && item.id.startsWith('custom-companion-')) || (kind === 'miniApps' && item.id.startsWith('custom-mini-'));
    return h('li', { class: 'hm-row' },
      h('label', { class: 'hm-switch' },
        h('input', { type: 'checkbox', checked: item.enabled !== false ? true : null, 'aria-label': `Show ${name}`, 'data-key': `${kind}:${item.id}:show`, onchange: (e) => { const el = e.currentTarget; setEnabled(kind, item.id, el.checked); } }),
        h('span', { class: 'hm-switch-track', 'aria-hidden': 'true' }),
        h('span', { class: 'hm-row-name' }, name)),
      h('span', { class: 'hm-row-actions' },
        kind === 'widgets' ? h('select', { 'aria-label': `Size for ${name}`, 'data-key': `${kind}:${item.id}:size`, onchange: (e) => setSize('widgets', item.id, e.currentTarget.value) },
          SIZES.map((s) => h('option', { value: s, selected: item.size === s ? true : null }, s))) : null,
        h('button', { type: 'button', 'aria-label': `Move ${name} earlier`, title: 'Move earlier', disabled: index === 0 ? true : null, 'data-key': `${kind}:${item.id}:up`, onclick: () => move(kind, item.id, -1) }, '↑'),
        h('button', { type: 'button', 'aria-label': `Move ${name} later`, title: 'Move later', disabled: index === total - 1 ? true : null, 'data-key': `${kind}:${item.id}:down`, onclick: () => move(kind, item.id, 1) }, '↓'),
        custom ? h('button', { type: 'button', class: 'hm-danger', 'aria-label': `Remove ${name}`, title: 'Remove shortcut', onclick: () => removeCustom(kind, item.id) }, '×') : null));
  }

  function renderDrawer() {
    const panel = $('#homeDrawerPanel'); if (!panel) return;
    const focusKey = document.activeElement?.dataset?.key || null;
    const scroll = $('.hm-drawer-scroll', panel)?.scrollTop || 0;
    const form = h('form', { class: 'hm-add', onsubmit: (event) => {
      event.preventDefault();
      const f = new FormData(event.currentTarget);
      const ok = addShortcut({ kind: String(f.get('kind') || 'companion'), name: String(f.get('name') || '').trim(), target: String(f.get('target') || '') });
      if (ok) { event.currentTarget.reset(); }
      else { toast('Enter a name for the shortcut'); event.currentTarget.elements.name.focus(); }
    } },
    h('label', null, h('span', null, 'Show it as'), h('select', { name: 'kind' }, h('option', { value: 'companion' }, 'Workspace card'), h('option', { value: 'mini' }, 'Quick access button'))),
    h('label', null, h('span', null, 'Name'), h('input', { name: 'name', type: 'text', maxlength: '42', placeholder: 'e.g. Daily notes', autocomplete: 'off' })),
    h('label', null, h('span', null, 'Opens'), h('select', { name: 'target' }, TARGETS.map((t) => h('option', { value: t.id }, t.label)))),
    h('button', { type: 'submit', class: 'hm-btn hm-btn--primary' }, 'Add shortcut'));

    panel.replaceChildren(
      h('header', { class: 'hm-drawer-head' },
        h('div', null, h('h2', { id: 'homeDrawerTitle' }, 'Customize Home'), h('p', null, 'Choose what shows up and in what order.')),
        h('button', { type: 'button', class: 'hm-icon-btn', id: 'homeDrawerClose', 'aria-label': 'Close', onclick: closeDrawer }, svgIcon('<path d="M6 6l12 12M18 6 6 18"></path>'))),
      h('div', { class: 'hm-drawer-scroll' },
        ...Object.keys(REGISTRIES).map((kind) => {
          const items = listOf(kind);
          return h('section', { class: 'hm-drawer-sec' }, h('h3', null, SECTION_TITLES[kind]),
            items.length ? h('ul', { class: 'hm-rows' }, items.map((item, i) => drawerRow(kind, item, i, items.length))) : h('p', { class: 'hm-muted' }, 'Nothing here yet.'));
        }),
        h('section', { class: 'hm-drawer-sec' }, h('h3', null, 'Add a shortcut'), form)),
      h('footer', { class: 'hm-drawer-foot' },
        h('button', { type: 'button', class: 'hm-btn', onclick: resetDefaults }, 'Restore default layout'),
        h('button', { type: 'button', class: 'hm-btn hm-btn--primary', onclick: closeDrawer }, 'Done')));
    const sc = $('.hm-drawer-scroll', panel); if (sc) sc.scrollTop = scroll;
    if (focusKey) panel.querySelector(`[data-key="${CSS.escape(focusKey)}"]`)?.focus({ preventScroll: true });
  }
  function openDrawer() {
    if (drawerOpen) return;
    if (arranging) leaveArrange(false);
    closeMore();
    drawerOpen = true;
    const root = $('#homeDrawer'); root.hidden = false;
    requestAnimationFrame(() => root.classList.add('is-open'));
    renderDrawer();
    $('#homeDrawerClose')?.focus({ preventScroll: true });
    $('#launcherScreen').setAttribute('inert', '');
    root.removeAttribute('inert');
  }
  function closeDrawer() {
    if (!drawerOpen) return;
    drawerOpen = false;
    const root = $('#homeDrawer'); root.classList.remove('is-open');
    $('#launcherScreen').removeAttribute('inert');
    setTimeout(() => { if (!drawerOpen) root.hidden = true; }, reduceMotion() ? 0 : 220);
    $('#homeCustomizeBtn')?.focus({ preventScroll: true });
  }
  function initDrawer() {
    const root = $('#homeDrawer');
    $('#homeCustomizeBtn')?.addEventListener('click', openDrawer);
    $('#homeDrawerScrim')?.addEventListener('click', closeDrawer);
    document.addEventListener('keydown', (event) => {
      if (!drawerOpen) return;
      if (event.key === 'Escape') { event.preventDefault(); closeDrawer(); return; }
      if (event.key !== 'Tab') return;
      if (!root.contains(document.activeElement)) { event.preventDefault(); $('#homeDrawerClose')?.focus(); return; }
      const focusable = [...root.querySelectorAll('button:not([disabled]), input, select, [tabindex="0"]')].filter((n) => n.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
  }

  function countTo(node, value) {
    const target = Number(value) || 0;
    if (!node) return;
    if (reduceMotion()) { node.textContent = String(target); return; }
    const from = Number(node.textContent) || 0; const start = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - start) / 600);
      node.textContent = String(Math.round(from + (target - from) * (1 - Math.pow(1 - k, 3))));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* ----------------------------------------------------- live system feed */
  const memSubs = new Set(); let lastMemory = null;
  function setMemory(model) { lastMemory = model; memSubs.forEach((fn) => { try { fn(model); } catch (e) { console.error(e); } }); }
  document.addEventListener('mad:memory-model', (event) => { if (event.detail) setMemory(event.detail); });

  window.MadHome = {
    h, svgIcon, toast, inApp,
    setMemory,
    onMemory(fn) { memSubs.add(fn); if (lastMemory) fn(lastMemory); return () => memSubs.delete(fn); },
    memoryAction(action) {
      if (!['refresh', 'cleanup', 'details'].includes(action)) return;
      if (isFramed && sendHost('memory-action', { action })) return;
      if (window.MadStationMemoryMonitor?.requestAction) window.MadStationMemoryMonitor.requestAction(action);
      else document.dispatchEvent(new CustomEvent('mad:memory-action', { detail: action }));
    },
    setStats({ accounts, providers } = {}) {
      if (accounts != null) countTo($('#launcherAccountCount'), accounts);
      if (providers != null) countTo($('#launcherProviderCount'), providers);
    },
  };

  // The isolated Home frame receives only narrow, serializable host updates.
  window.addEventListener('message', (event) => {
    if (!isFramed || event.source !== window.parent || event.data?.channel !== HOST_CHANNEL) return;
    const message = event.data;
    if (message.type === 'host-ping') {
      if (homeReadySent) sendHost('home-ready');
      return;
    }
    if (message.type === 'appearance-settings' && message.settings && typeof message.settings === 'object') {
      try { window.applyAppearance?.(message.settings); } catch (error) { console.warn('Could not apply host appearance to Home', error); }
    } else if (message.type === 'memory-model' && message.model && typeof message.model === 'object') {
      document.dispatchEvent(new CustomEvent('mad:memory-model', { detail: message.model }));
    } else if (message.type === 'stats') {
      window.MadHome?.setStats({ accounts: message.accounts, providers: message.providers });
    }
  });

  /* -------------------------------------------------------------------- boot */
  function boot() {
    const screen = $('#launcherScreen');
    if (!screen) return;
    defaults = snapshotDefaults();
    state = readState();
    registerCustomEntries();
    applyStored();
    if (Object.keys(state.modules || {}).length || state.customCompanions.length || state.customMiniApps.length) writeState();
    $('#homeHubBtn')?.addEventListener('click', () => launchTarget('ai-hub'));
    $('#launcherSettingsBtn')?.addEventListener('click', () => {
      if (isFramed) { sendHost('open-settings'); return; }
      if (!inApp) toast('Settings open inside the Mad Station app');
    });
    initSearch(); initArrange(); initDrawer();
    render();
    document.dispatchEvent(new CustomEvent('mad:home-ready'));
    homeReadySent = true;
    sendHost('home-ready');
  }
  // Registry files (home-registry.js) run after this file and before DOMContentLoaded finishes.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => queueMicrotask(boot), { once: true });
  else queueMicrotask(boot);
})();

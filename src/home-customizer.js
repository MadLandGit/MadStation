// Mad Station — User-facing modular home menu manager
// ---------------------------------------------------------------------------
// Core routing: docs/architecture/CORE_SYSTEM.md → Home menu customization.
// Registry entries remain in the companion, mini-app and widget systems. This
// module stores per-user enabled/order/size preferences and user-created launch
// shortcuts without editing the source registries.
(function () {
  'use strict';

  const STORAGE_KEY = 'mad-station-home-modules-v1';
  const TARGETS = [
    { id: 'ai-hub', label: 'AI Hub' },
    { id: 'clipboard', label: 'Notes & Tasks' },
    { id: 'instruction-forge', label: 'Prompt Studio' },
    { id: 'ai-lab', label: 'AI Playground' },
    { id: 'video-hub', label: 'Video Hub' },
    { id: 'image-hub', label: 'Image Hub' },
  ];
  const TARGET_IDS = new Set(TARGETS.map((item) => item.id));
  const ICONS = {
    'ai-hub': '<circle cx="12" cy="12" r="3"></circle><circle cx="5" cy="6" r="1.4"></circle><circle cx="19" cy="6" r="1.4"></circle><path d="m9.7 10-3.5-2.8M14.3 10l3.5-2.8"></path>',
    clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"></rect><path d="M9 4.5h6v3H9zM8 11h8M8 15h6"></path>',
    'instruction-forge': '<path d="M5 6.5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H10l-4 3v-5.2a2 2 0 0 1-1-1.8z"></path><path d="M8 8.5h7M8 11.5h5"></path>',
    'ai-lab': '<path d="M9 3h6M10 3v5l-4.6 9.1A2 2 0 0 0 7.2 20h9.6a2 2 0 0 0 1.8-2.9L14 8V3"></path><path d="M8 14h8"></path>',
    'video-hub': '<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"></rect><path d="m10 9 5 3-5 3z"></path>',
    'image-hub': '<rect x="3" y="3" width="18" height="18" rx="3"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><path d="m21 15-5-5L5 21"></path>',
    generic: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"></rect><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"></rect><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"></rect><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"></rect>',
  };

  const systems = {
    companions: () => window.MadHomeApps,
    miniApps: () => window.MadHomeMiniApps,
    widgets: () => window.MadHomeWidgets,
  };
  let state = { version: 1, modules: {}, customCompanions: [], customMiniApps: [], widgetPositions: {} };
  let defaults = null;
  let isOpen = false;
  let reactRenderer = null;
  let revision = 0;
  let toastMessage = '';
  let toastTimer = null;

  function normalizeWidgetPositions(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
    const result = {};
    for (const [id, position] of Object.entries(input).slice(0, 256)) {
      if (!/^[a-z0-9][a-z0-9-_]*$/i.test(id) || !position || typeof position !== 'object') continue;
      const x = Number(position.x);
      const y = Number(position.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      result[id] = { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
    }
    return result;
  }

  function safeRead() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      if (!value || typeof value !== 'object' || Array.isArray(value)) return state;
      return {
        version: 1,
        modules: value.modules && typeof value.modules === 'object' && !Array.isArray(value.modules) ? value.modules : {},
        customCompanions: Array.isArray(value.customCompanions) ? value.customCompanions : [],
        customMiniApps: Array.isArray(value.customMiniApps) ? value.customMiniApps : [],
        widgetPositions: normalizeWidgetPositions(value.widgetPositions),
      };
    } catch { return state; }
  }

  function safeWrite() {
    state.modules = {};
    for (const [key, getSystem] of Object.entries(systems)) {
      const api = getSystem();
      state.modules[key] = {};
      for (const item of (api?.list?.() || [])) {
        state.modules[key][item.id] = {
          enabled: item.enabled !== false,
          order: Number.isFinite(item.order) ? item.order : null,
          ...(key === 'widgets' ? { size: item.size } : {}),
        };
      }
    }
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* private or full storage: current session still works */ }
  }

  function registerCustomEntries() {
    for (const item of state.customCompanions) {
      if (!item || !/^custom-companion-[a-z0-9-]+$/i.test(String(item.id || '')) || !String(item.name || '').trim() || !TARGET_IDS.has(item.launch)) continue;
      window.MadHomeApps?.register({
        id: item.id, name: item.name, description: item.description || 'Custom home shortcut',
        chips: Array.isArray(item.chips) ? item.chips : ['Custom'], iconSvg: ICONS[item.launch] || ICONS.generic,
        launch: item.launch, order: Number.isFinite(item.order) ? item.order : null,
      });
    }
    for (const item of state.customMiniApps) {
      if (!item || !/^custom-mini-[a-z0-9-]+$/i.test(String(item.id || '')) || !String(item.name || '').trim() || !TARGET_IDS.has(item.launch)) continue;
      window.MadHomeMiniApps?.register({
        id: item.id, name: item.name, iconSvg: ICONS[item.launch] || ICONS.generic,
        launch: item.launch, color: item.color || '', order: Number.isFinite(item.order) ? item.order : null,
      });
    }
  }

  function applyStoredPreferences() {
    for (const [key, getSystem] of Object.entries(systems)) {
      const api = getSystem();
      const preferences = state.modules?.[key] || {};
      for (const item of (api?.list?.() || [])) {
        const pref = preferences[item.id];
        if (!pref) continue;
        const patch = { enabled: pref.enabled !== false };
        if (pref.order === null || Number.isFinite(pref.order)) patch.order = pref.order;
        if (key === 'widgets' && ['small', 'medium', 'large'].includes(pref.size)) patch.size = pref.size;
        api.configure?.(item.id, patch);
      }
    }
  }

  function apiList(kind) {
    return systems[kind]?.()?.list?.() || [];
  }

  function itemName(kind, item) { return kind === 'widgets' ? item.title : item.name; }

  function createModel() {
    const section = (kind, title) => ({
      kind,
      title,
      items: apiList(kind).map((item) => ({
        id: String(item.id),
        name: String(itemName(kind, item) || item.id),
        enabled: item.enabled !== false,
        order: Number.isFinite(item.order) ? item.order : null,
        ...(kind === 'widgets' ? { size: ['small', 'medium', 'large'].includes(item.size) ? item.size : 'medium' } : {}),
      })),
    });
    return {
      revision,
      isOpen,
      toast: toastMessage,
      targets: TARGETS.map((item) => ({ ...item })),
      sections: [
        section('companions', 'Hub companions · Left'),
        section('miniApps', 'Mini apps · Above Hub'),
        section('widgets', 'Widgets · Right'),
      ],
    };
  }

  function publish() {
    revision += 1;
    if (typeof reactRenderer === 'function') reactRenderer(createModel());
    document.dispatchEvent(new CustomEvent('mad:home-customizer-updated', { detail: { revision } }));
  }

  function attachReactRenderer(renderer) {
    if (typeof renderer !== 'function') return;
    reactRenderer = renderer;
    reactRenderer(createModel());
  }

  function setEnabled(kind, id, enabled) {
    if (!Object.prototype.hasOwnProperty.call(systems, kind) || typeof enabled !== 'boolean') return;
    systems[kind]()?.configure?.(id, { enabled });
    safeWrite();
    showToast(enabled ? 'Module enabled' : 'Module hidden');
  }

  function setSize(kind, id, size) {
    if (kind !== 'widgets' || !['small', 'medium', 'large'].includes(size)) return;
    systems.widgets()?.configure?.(id, { size });
    safeWrite();
    showToast('Widget size saved');
  }

  function getWidgetPositions() {
    return Object.fromEntries(Object.entries(normalizeWidgetPositions(state.widgetPositions)).map(([id, pos]) => [id, { ...pos }]));
  }

  function setWidgetPositions(positions) {
    state.widgetPositions = normalizeWidgetPositions(positions);
    safeWrite();
    document.dispatchEvent(new CustomEvent('mad:home-widget-positions-updated'));
    return true;
  }

  function setWidgetPosition(id, x, y) {
    const key = String(id || '');
    const nx = Number(x);
    const ny = Number(y);
    if (!/^[a-z0-9][a-z0-9-_]*$/i.test(key) || !Number.isFinite(nx) || !Number.isFinite(ny)) return false;
    state.widgetPositions = normalizeWidgetPositions({
      ...state.widgetPositions,
      [key]: { x: Math.max(0, Math.min(1, nx)), y: Math.max(0, Math.min(1, ny)) },
    });
    safeWrite();
    return true;
  }

  function move(kind, id, delta) {
    if (!Object.prototype.hasOwnProperty.call(systems, kind) || ![-1, 1].includes(delta)) return;
    const list = apiList(kind);
    const index = list.findIndex((item) => item.id === id);
    const destination = index + delta;
    if (index < 0 || destination < 0 || destination >= list.length) return;
    const [item] = list.splice(index, 1); list.splice(destination, 0, item);
    list.forEach((entry, at) => systems[kind]()?.configure?.(entry.id, { order: (at + 1) * 10 }));
    safeWrite(); showToast('Order saved');
  }

  // Reorder a complete registry within its own placement class. The drag
  // editor deliberately cannot move companions into mini-app/widget zones,
  // nor can it drop widgets on the fixed AI Hub core. Requiring the complete
  // unique ID set avoids accidentally dropping or inventing a module.
  function reorder(kind, orderedIds) {
    if (!Object.prototype.hasOwnProperty.call(systems, kind) || !Array.isArray(orderedIds)) return false;
    const api = systems[kind]();
    if (!api?.list || !api?.configure) return false;
    const current = api.list();
    const expected = current.map((item) => String(item.id));
    const requested = orderedIds.map((id) => String(id));
    if (requested.length !== expected.length || new Set(requested).size !== requested.length) return false;
    const allowed = new Set(expected);
    if (requested.some((id) => !allowed.has(id))) return false;
    if (expected.some((id) => !requested.includes(id))) return false;
    requested.forEach((id, index) => api.configure(id, { order: (index + 1) * 10 }));
    safeWrite();
    showToast(kind === 'miniApps' ? 'Mini-app order saved' : kind === 'widgets' ? 'Widget order saved' : 'Companion order saved');
    return true;
  }

  function nextOrder(kind) {
    const list = apiList(kind);
    return list.reduce((max, item, index) => Math.max(max, Number.isFinite(item.order) ? item.order : (index + 1) * 10), 0) + 10;
  }

  function nextId(prefix, list) {
    let sequence = list.length + 1;
    const ids = new Set(list.map((item) => item.id));
    while (ids.has(`${prefix}-${sequence}`)) sequence += 1;
    return `${prefix}-${sequence}`;
  }

  function addShortcut(input) {
    const name = String(input?.name || '').trim().slice(0, 42);
    const launch = String(input?.target || '');
    const kind = input?.kind;
    if (!name || !TARGET_IDS.has(launch) || !['companion', 'mini'].includes(kind)) return false;
    if (kind === 'companion') {
      const id = nextId('custom-companion', state.customCompanions);
      const item = { id, name, description: `Quick access to ${TARGETS.find((target) => target.id === launch)?.label || launch}.`, chips: ['Custom'], launch, order: nextOrder('companions') };
      window.MadHomeApps?.register({ ...item, iconSvg: ICONS[launch] || ICONS.generic });
      state.customCompanions.push(item);
    } else {
      const id = nextId('custom-mini', state.customMiniApps);
      const item = { id, name, launch, color: '', order: nextOrder('miniApps') };
      window.MadHomeMiniApps?.register({ ...item, iconSvg: ICONS[launch] || ICONS.generic });
      state.customMiniApps.push(item);
    }
    safeWrite();
    showToast('Shortcut added');
    return true;
  }

  function removeCustom(kind, id) {
    if (kind === 'companions' && String(id).startsWith('custom-companion-')) {
      window.MadHomeApps?.unregister(id);
      state.customCompanions = state.customCompanions.filter((item) => item.id !== id);
    } else if (kind === 'miniApps' && String(id).startsWith('custom-mini-')) {
      window.MadHomeMiniApps?.unregister(id);
      state.customMiniApps = state.customMiniApps.filter((item) => item.id !== id);
    } else return;
    safeWrite();
    showToast('Shortcut removed');
  }

  function showToast(message) {
    toastMessage = String(message || '');
    clearTimeout(toastTimer);
    publish();
    toastTimer = setTimeout(() => {
      toastMessage = '';
      publish();
    }, 1800);
  }

  function open() {
    isOpen = true;
    publish();
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    publish();
    document.querySelector('#homeCustomizeBtn')?.focus({ preventScroll: true });
  }

  function resetDefaults() {
    state.customCompanions.forEach((item) => window.MadHomeApps?.unregister(item.id));
    state.customMiniApps.forEach((item) => window.MadHomeMiniApps?.unregister(item.id));
    state.customCompanions = [];
    state.customMiniApps = [];
    state.widgetPositions = {};
    for (const [kind, items] of Object.entries(defaults || {})) {
      const api = systems[kind]();
      items.forEach((item) => api?.configure?.(item.id, {
        enabled: item.enabled !== false,
        order: Number.isFinite(item.order) ? item.order : null,
        ...(kind === 'widgets' ? { size: item.size } : {}),
      }));
    }
    state.modules = {};
    safeWrite(); showToast('Default menu restored');
  }

  function initialize() {
    const button = document.getElementById('homeCustomizeBtn');
    if (!button) return;
    defaults = {
      companions: window.MadHomeApps?.list?.() || [],
      miniApps: window.MadHomeMiniApps?.list?.() || [],
      widgets: window.MadHomeWidgets?.list?.() || [],
    };
    state = safeRead();
    registerCustomEntries();
    applyStoredPreferences();
    button.addEventListener('click', open);
    if (Object.keys(state.modules || {}).length || state.customCompanions.length || state.customMiniApps.length) safeWrite();
    publish();
  }

  window.MadHomeCustomizer = {
    attachReactRenderer,
    close,
    setEnabled,
    move,
    reorder,
    setSize,
    getWidgetPositions,
    setWidgetPositions,
    setWidgetPosition,
    removeCustom,
    addShortcut,
    resetDefaults,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();

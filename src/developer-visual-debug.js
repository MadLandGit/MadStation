/* Mad Station developer visual-debug overlay.
 * Opt-in diagnostics only: it never changes normal rendering when disabled.
 * Supports the renderer document and built-in homepage iframes through a narrow host message.
 */
(() => {
  'use strict';

  const STORAGE_KEY = 'madstation.developer-debug.v1';
  const DEFAULTS = Object.freeze({
    enabled: false,
    outlines: true,
    containers: false,
    grid: false,
    labels: false,
    overflow: true,
    hud: true,
    hoverInspector: false,
    hitTest: true,
    boxModel: false,
    focusable: false,
    clickTrace: false,
    pauseAnimations: false,
    hiddenAudit: true,
  });
  const SETTINGS_KEYS = Object.keys(DEFAULTS);
  const framed = window.parent !== window;
  const filename = String(window.location?.pathname || '').split(/[\\/]/).pop();
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
    'home-isometric-world.html': 'madstation-home-isometric-world',
  };
  const expectedChannel = pageChannels[filename] || '';
  let settings = { ...DEFAULTS };
  let overlay = null;
  let refreshFrame = 0;
  let hoverFrame = 0;
  let observer = null;
  const shadowRootObservers = new Map();
  let resizeTimer = 0;
  let hoveredElement = null;
  let pointerX = Number.NaN;
  let pointerY = Number.NaN;
  let lastClickData = null;
  let lastPageStats = { elements: 0, gridFlex: 0, overflow: 0, hidden: 0, interactive: 0, duplicateIds: 0, fixedSticky: 0 };
  let latestHiddenSamples = [];
  let latestOverflowSamples = [];
  let lastSnapshotPublishAt = 0;
  let pendingSnapshot = null;
  let snapshotPublishTimer = 0;
  let previousOverflowNodes = new Set();
  let previousHiddenNodes = [];
  let latestElementExplorer = null;
  let highlightedElement = null;
  let highlightClearTimer = 0;
  let temporarilyRevealedNodes = [];
  const temporaryRevealOriginalStyles = new Map();
  const debugHiddenElements = new Map();
  let nextDebugHiddenElementId = 0;
  let contextMenu = null;
  let contextMenuTarget = null;
  let contextWorldTarget = null;
  let activeWorldHighlightOwner = null;
  let contextMenuStatus = null;
  let lastContextSelection = null;

  function normalizeSettings(value) {
    const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const result = { ...DEFAULTS };
    for (const key of SETTINGS_KEYS) if (typeof input[key] === 'boolean') result[key] = input[key];
    return result;
  }

  function readSavedSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const saved = raw ? normalizeSettings(JSON.parse(raw)) : { ...DEFAULTS };
      // Safety: persist diagnostic choices, but never boot the app with visual debug
      // overlays already active. A broken overlay must not hide the UI on every launch.
      if (saved.enabled) {
        saved.enabled = false;
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(saved)); } catch { /* Safe startup still applies in memory. */ }
      }
      return saved;
    } catch {
      return { ...DEFAULTS };
    }
  }

  function saveSettings(value) {
    if (framed) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); } catch { /* Settings still apply for this session. */ }
  }

  function syncShadowRootDebugStyles() {
    if (!document.body) return;
    const elements = collectElementsIncludingOpenShadowRoots(document.body);
    const roots = new Set(elements.map((element) => element.shadowRoot).filter(Boolean));
    for (const root of roots) {
      let style = root.querySelector('style[data-ms-dev-debug-shadow-style]');
      const rules = [];
      if (settings.enabled && settings.outlines) {
        rules.push('*:not(style):not(script):not(link):not(meta){outline:1px solid rgba(255,77,109,.55)!important;outline-offset:-1px!important}');
        rules.push(':is(main,header,footer,nav,aside,section,article,form,fieldset,dialog,[role="dialog"],[role="region"],[class*="container"],[class*="panel"],[class*="card"],[class*="grid"],[class*="layout"],[class*="shell"]){outline:1px solid rgba(0,196,255,.85)!important}');
        rules.push(':is(button,input,textarea,select,a,[role="button"],[tabindex]){outline:1px solid rgba(73,255,140,.9)!important}');
      }
      if (settings.enabled && settings.containers) rules.push(':is(main,header,footer,nav,aside,section,article,form,fieldset,dialog,[role="dialog"],[role="region"],[class*="container"],[class*="panel"],[class*="card"],[class*="grid"],[class*="layout"],[class*="shell"]){background-color:rgba(0,196,255,.075)!important;box-shadow:inset 0 0 0 1px rgba(0,196,255,.2)!important}');
      if (settings.enabled && settings.focusable) rules.push(':is(button,a[href],input:not([type="hidden"]),select,textarea,summary,[role="button"],[tabindex]:not([tabindex="-1"])){outline:2px dashed #a6ff00!important;outline-offset:2px!important}');
      if (settings.enabled && settings.overflow) rules.push('[data-ms-dev-debug-overflow]{outline:3px solid #ff1744!important;outline-offset:-3px!important;box-shadow:inset 0 0 0 2px rgba(255,23,68,.3)!important}');
      if (settings.enabled) rules.push(
        '[data-ms-dev-debug-hidden="true"]{display:none!important}',
        '[data-ms-dev-debug-reveal-ancestor="true"]{display:contents!important;visibility:visible!important;opacity:1!important}',
        '[data-ms-dev-debug-revealed="true"]{display:block!important;visibility:visible!important;opacity:1!important;position:fixed!important;top:12px!important;left:12px!important;right:auto!important;bottom:auto!important;width:max-content!important;height:auto!important;max-width:calc(100vw - 24px)!important;max-height:calc(100vh - 24px)!important;overflow:auto!important;z-index:2147483646!important;padding:8px!important;background:#111827!important;color:#ffffff!important;box-shadow:0 0 0 4px #ffd166,0 12px 38px rgba(0,0,0,.72)!important;outline:4px solid #ffd166!important;outline-offset:2px!important;scroll-margin:24px!important}'
      );
      if (settings.enabled) rules.push('[data-ms-dev-debug-hovered="true"]{outline:3px solid #ff00d4!important;outline-offset:-3px!important}', '[data-ms-dev-debug-selected="true"]{outline:4px solid #ffd166!important;outline-offset:3px!important;box-shadow:0 0 0 7px rgba(255,209,102,.32),0 0 26px rgba(255,209,102,.65)!important}');
      if (!rules.length) { style?.remove(); continue; }
      if (!style) { style = document.createElement('style'); style.dataset.msDevDebugShadowStyle = 'true'; style.dataset.msDebugOverlay = 'true'; root.append(style); }
      const nextCss = rules.join('\n');
      if (style.textContent !== nextCss) style.textContent = nextCss;
    }
  }

  function syncShadowRootObservers(elements) {
    const roots = new Set((elements || []).map((element) => element.shadowRoot).filter(Boolean));
    for (const [root, existingObserver] of shadowRootObservers.entries()) {
      if (roots.has(root)) continue;
      existingObserver.disconnect();
      shadowRootObservers.delete(root);
    }
    for (const root of roots) {
      if (shadowRootObservers.has(root)) continue;
      const rootObserver = new MutationObserver((records) => {
        if (!settings.enabled || records.every((record) => isDebugOverlayElement(record.target)
          || (record.target instanceof Element && record.target.matches('style[data-ms-dev-debug-shadow-style]')))) return;
        scheduleRefresh();
      });
      rootObserver.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['id', 'class', 'hidden', 'aria-hidden'] });
      shadowRootObservers.set(root, rootObserver);
    }
  }

  function setRootClasses() {
    const root = document.documentElement;
    if (!root) return;
    root.classList.toggle('ms-dev-debug-enabled', settings.enabled);
    for (const key of SETTINGS_KEYS) {
      if (key === 'enabled') continue;
      root.classList.toggle(`ms-dev-debug-option-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`, settings.enabled && settings[key]);
    }
    syncShadowRootDebugStyles();
    if (filename === 'home-isometric-world.html') {
      try { window.MadStationIsometricDebug?.setDebugMode?.({ enabled: settings.enabled, outlines: settings.outlines, hoverInspector: settings.hoverInspector }); } catch { /* World-canvas diagnostics are optional on non-isometric pages. */ }
    }
    const needsOverlay = settings.labels;
    if (settings.enabled && needsOverlay) ensureOverlay();
    if (!settings.enabled || !needsOverlay) removeOverlay();
    if (settings.enabled) {
      installObserver();
      scheduleRefresh();
    } else {
      closeElementContextMenu();
      disconnectObserver();
      clearOverflowMarks();
      clearHoverMark();
      clearSelectedHighlight();
      lastContextSelection = null;
    }
    if (!framed) syncInspectorWindow();
  }

  function applySettings(value, { persist = false } = {}) {
    const nextSettings = normalizeSettings(value);
    // Hides created by the debug tool are temporary. Turning diagnostics off must
    // always put the page back the way it was, even if a full-page wrapper was hidden.
    if (settings.enabled && !nextSettings.enabled) {
      restoreAllDebugHiddenElements({ publish: false });
      clearSelectedHighlight();
    }
    settings = nextSettings;
    if (persist) saveSettings(settings);
    setRootClasses();
    if (settings.enabled && hoveredElement) updateHoveredTarget(hoveredElement);
    return { ...settings };
  }

  function createNode(tagName, className, text = '') {
    const node = document.createElement(tagName);
    node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function ensureOverlay() {
    if (overlay?.isConnected) return;
    if (!document.body) return;
    overlay = createNode('div', 'ms-dev-debug-layer');
    overlay.dataset.msDebugOverlay = 'true';
    overlay.setAttribute('role', 'presentation');
    // The in-page layer now renders visual labels only. Readable diagnostics live in
    // the independent native Developer Inspector window, never over app content.
    overlay.inert = true;
    overlay.setAttribute('aria-hidden', 'true');
    overlay.style.pointerEvents = 'none';
    document.body.append(overlay);
    refreshHudVisibility();
  }

  function removeOverlay() {
    if (overlay?.isConnected) overlay.remove();
    overlay = null;
  }

  function closeElementContextMenu() {
    if (contextMenu?.isConnected) contextMenu.remove();
    contextMenu = null;
    contextMenuTarget = null;
    contextWorldTarget = null;
    contextMenuStatus = null;
  }

  function hostHudShouldYieldToThemedHomepage() {
    if (framed || !document.body) return false;
    const workspace = document.body.dataset.workspaceApp || 'launcher';
    const homepageStyle = document.body.dataset.homepageStyle || 'legacy';
    const settingsScreen = document.getElementById('settingsScreen');
    const settingsVisible = Boolean(settingsScreen && !settingsScreen.classList.contains('hidden'));
    // The selected homepage iframe has its own inspector. Keep the host's inspector
    // dormant while that page owns the screen, then restore it on Settings/other apps.
    return workspace === 'launcher' && homepageStyle !== 'legacy' && !settingsVisible;
  }

  function refreshHudVisibility() {
    if (!overlay) return;
    const yieldToPageFrame = hostHudShouldYieldToThemedHomepage();
    overlay.dataset.msDebugContextSuppressed = yieldToPageFrame ? 'true' : 'false';
    overlay.classList.toggle('ms-dev-debug-has-labels', settings.enabled && settings.labels);
  }

  function syncInspectorWindow() {
    if (framed) return;
    const api = window.aiHub;
    if (!api) return;
    // Enabling Debug Mode can open the inspector automatically, but disabling visual
    // diagnostics must not close the inspector the user is operating. Keeping that
    // window alive lets them re-enable tools without returning to Settings. The user
    // can close it with its native close button, independently from the overlay state.
    const shouldOpen = settings.enabled && settings.hud;
    if (!shouldOpen) return;
    if (typeof api.developerDebugOpenWindow === 'function') {
      try { Promise.resolve(api.developerDebugOpenWindow.call(api, false)).catch(() => {}); } catch { /* Inspector is optional; visual tools still work. */ }
    }
  }

  function activeHostFrameBinding() {
    const mode = document.body?.dataset.homepageStyle || (() => {
      try { return localStorage.getItem('mad-station-homepage-version-v1') || 'legacy'; } catch { return 'legacy'; }
    })();
    const bindings = {
      v2: { id: 'launcherV2Screen', channel: 'madstation-home-v2' },
      retro: { id: 'launcherRetroScreen', channel: 'madstation-home-simple-retro' },
      'retro-complex': { id: 'launcherRetroComplexScreen', channel: 'madstation-home-retro-complex' },
      parallax: { id: 'launcherParallaxScreen', channel: 'madstation-home-parallax' },
      'parallax-big': { id: 'launcherParallaxBigScreen', channel: 'madstation-home-parallax-big' },
      galaxy: { id: 'launcherGalaxyScreen', channel: 'madstation-home-galaxy' },
      'parallax-jungle': { id: 'launcherParallaxJungleScreen', channel: 'madstation-home-parallax-jungle' },
      claymorphism: { id: 'launcherClaymorphismScreen', channel: 'madstation-home-claymorphism' },
      glass: { id: 'launcherGlassScreen', channel: 'madstation-home-glass' },
      'isometric-world': { id: 'launcherIsometricWorldScreen', channel: 'madstation-home-isometric-world' },
    };
    const binding = bindings[mode];
    return binding ? { ...binding, frame: document.getElementById(binding.id) } : null;
  }

  function publishInspectorSnapshot(snapshot, { fromActiveFrame = false } = {}) {
    if (!settings.enabled || !settings.hud || !snapshot) return;
    if (framed) {
      if (expectedChannel) {
        try { window.parent.postMessage({ channel: expectedChannel, type: 'developer-debug-snapshot', snapshot }, '*'); } catch { /* Visual overlays remain usable without the inspector. */ }
      }
      return;
    }
    if (!fromActiveFrame && hostHudShouldYieldToThemedHomepage()) return;
    const api = window.aiHub;
    if (typeof api?.developerDebugPublishSnapshot !== 'function') return;
    const now = Date.now();
    pendingSnapshot = snapshot;
    if (now - lastSnapshotPublishAt < 90) {
      if (!snapshotPublishTimer) {
        snapshotPublishTimer = window.setTimeout(() => {
          snapshotPublishTimer = 0;
          const next = pendingSnapshot;
          pendingSnapshot = null;
          if (next && settings.enabled && settings.hud) {
            lastSnapshotPublishAt = Date.now();
            try { Promise.resolve(api.developerDebugPublishSnapshot(next)).catch(() => {}); } catch { /* Inspector IPC is best-effort. */ }
          }
        }, 90 - (now - lastSnapshotPublishAt));
      }
      return;
    }
    lastSnapshotPublishAt = now;
    pendingSnapshot = null;
    try { Promise.resolve(api.developerDebugPublishSnapshot(snapshot)).catch(() => {}); } catch { /* Inspector IPC is best-effort. */ }
  }

  function acceptActiveFrameSnapshot(event, message) {
    if (framed || !settings.enabled || !settings.hud || !message || message.type !== 'developer-debug-snapshot') return false;
    const body = document.body;
    if ((body?.dataset.workspaceApp || 'launcher') !== 'launcher') return false;
    const settingsScreen = document.getElementById('settingsScreen');
    if (settingsScreen && !settingsScreen.classList.contains('hidden')) return false;
    const binding = activeHostFrameBinding();
    if (!binding || binding.channel !== message.channel || !binding.frame || binding.frame.contentWindow !== event.source) return false;
    publishInspectorSnapshot(message.snapshot, { fromActiveFrame: true });
    return true;
  }

  function isDebugOverlayElement(node) {
    return Boolean(node && (node === overlay || (node instanceof Element && node.closest('[data-ms-debug-overlay="true"]'))));
  }

  function collectElementsIncludingOpenShadowRoots(root) {
    if (!root || typeof root.querySelectorAll !== 'function') return [];
    const output = [];
    const seen = new Set();
    const pendingRoots = [root];
    for (let index = 0; index < pendingRoots.length; index += 1) {
      const currentRoot = pendingRoots[index];
      let nodes = [];
      try { nodes = Array.from(currentRoot.querySelectorAll('*')); } catch { nodes = []; }
      for (const element of nodes) {
        if (!(element instanceof Element) || seen.has(element)) continue;
        seen.add(element);
        output.push(element);
        // Open shadow roots are real DOM that was missing from the original inspector
        // queries. Closed roots remain intentionally inaccessible by the web platform.
        if (element.shadowRoot) pendingRoots.push(element.shadowRoot);
      }
    }
    return output;
  }

  function visibleElements() {
    if (!document.body) return [];
    // Include non-rendering DOM nodes in counts and audits too. They will naturally
    // have no highlight box, but the Element Explorer can still locate every node.
    return [document.documentElement, ...collectElementsIncludingOpenShadowRoots(document.documentElement || document.body)]
      .filter((element) => element instanceof Element)
      .filter((element) => !isDebugOverlayElement(element));
  }

  function cssDisplay(element) {
    try { return getComputedStyle(element); } catch { return null; }
  }

  function isActuallyHidden(element) {
    if (element.hasAttribute('hidden') || element.getAttribute('aria-hidden') === 'true') return true;
    const style = cssDisplay(element);
    return !style || style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse'
      || Number.parseFloat(style.opacity || '1') === 0 || element.getClientRects().length === 0;
  }

  function debugHiddenElementSnapshot(record) {
    if (record?.worldObject) {
      const api = window.MadStationIsometricDebug;
      const worldObject = api?.getObject?.(record.worldObject.owner) || record.worldObject;
      return {
        tag: 'world-object', kind: 'world-object', id: worldObject.owner || record.worldObject.owner,
        selector: worldObject.selector || record.worldObject.selector,
        label: worldObject.name || record.worldObject.name || 'Isometric World object',
        classes: [], rect: worldObject.rect || { x: 0, y: 0, width: 0, height: 0, right: 0, bottom: 0 },
        parentSelector: 'Isometric World canvas scene', token: record.token, hiddenByDebug: true,
      };
    }
    const element = record?.element;
    if (!(element instanceof Element) || !element.isConnected || isDebugOverlayElement(element)) return null;
    const detail = snapshotElement(element);
    if (!detail) return null;
    return { ...detail, token: record.token, parentSelector: element.parentElement ? cssSelectorFor(element.parentElement) : '(document root)', hiddenByDebug: true };
  }

  function listDebugHiddenElements() {
    const items = [];
    for (const [token, record] of debugHiddenElements) {
      if (record?.worldObject) {
        const api = window.MadStationIsometricDebug;
        if (!api?.getObject?.(record.worldObject.owner)) { debugHiddenElements.delete(token); continue; }
        const item = debugHiddenElementSnapshot(record);
        if (item) items.push(item);
        continue;
      }
      if (!record?.element?.isConnected) {
        try { record?.element?.removeAttribute('data-ms-dev-debug-hidden'); } catch { /* Detached nodes are already out of the page. */ }
        try { record?.element?.removeAttribute('data-ms-dev-debug-hidden-id'); } catch { /* Detached nodes are already out of the page. */ }
        debugHiddenElements.delete(token);
        continue;
      }
      const item = debugHiddenElementSnapshot(record);
      if (item) items.push(item);
    }
    return items.slice(0, 200);
  }

  function hideDebugWorldObject(worldObject) {
    const api = window.MadStationIsometricDebug;
    if (!settings.enabled || !worldObject || typeof worldObject.owner !== 'string' || !api?.hideObject || debugHiddenElements.size >= 200) return false;
    if ([...debugHiddenElements.values()].some((record) => record?.worldObject?.owner === worldObject.owner)) return true;
    if (!api.hideObject(worldObject.owner)) return false;
    const token = `hidden-${++nextDebugHiddenElementId}`;
    debugHiddenElements.set(token, { token, worldObject: { ...worldObject } });
    scheduleHoverHud();
    return true;
  }

  function hideDebugElement(element) {
    if (!settings.enabled || !(element instanceof Element) || isDebugOverlayElement(element)) return false;
    // Hiding the document roots can blank the entire renderer and break its normal
    // recovery affordances. Top-level page containers remain hideable from the menu.
    if (element === document.documentElement || element === document.body) return false;
    if (element.hasAttribute('data-ms-dev-debug-hidden')) return true;
    if (debugHiddenElements.size >= 200) return false;
    const token = `hidden-${++nextDebugHiddenElementId}`;
    element.setAttribute('data-ms-dev-debug-hidden', 'true');
    element.setAttribute('data-ms-dev-debug-hidden-id', token);
    debugHiddenElements.set(token, { token, element });
    scheduleRefresh();
    scheduleHoverHud();
    return true;
  }

  function unhideDebugElement(token) {
    if (typeof token !== 'string' || !token || token.length > 80) return false;
    const record = debugHiddenElements.get(token);
    if (!record) return false;
    if (record.worldObject) {
      try { window.MadStationIsometricDebug?.showObject?.(record.worldObject.owner); } catch { /* World frame can disappear during a theme switch. */ }
    } else {
      try { record.element?.removeAttribute('data-ms-dev-debug-hidden'); } catch { /* The element may have been detached. */ }
      try { record.element?.removeAttribute('data-ms-dev-debug-hidden-id'); } catch { /* The element may have been detached. */ }
    }
    debugHiddenElements.delete(token);
    scheduleRefresh();
    scheduleHoverHud();
    return true;
  }

  function restoreAllDebugHiddenElements({ publish = true } = {}) {
    for (const [token, record] of debugHiddenElements) {
      if (record?.worldObject) {
        try { window.MadStationIsometricDebug?.showObject?.(record.worldObject.owner); } catch { /* The isometric frame may have been unloaded during a theme switch. */ }
      } else {
        try { record.element?.removeAttribute('data-ms-dev-debug-hidden'); } catch { /* A node may have been detached. */ }
        try { record.element?.removeAttribute('data-ms-dev-debug-hidden-id'); } catch { /* A node may have been detached. */ }
      }
      debugHiddenElements.delete(token);
    }
    if (publish) {
      scheduleRefresh();
      scheduleHoverHud();
    }
    return true;
  }

  function clearOverflowMarks() {
    for (const element of previousOverflowNodes) {
      try { element.removeAttribute('data-ms-dev-debug-overflow'); } catch { /* A node may have been detached. */ }
    }
    previousOverflowNodes = new Set();
  }

  function clearHoverMark() {
    if (hoveredElement) {
      hoveredElement.removeAttribute('data-ms-dev-debug-hovered');
      hoveredElement.removeAttribute('data-ms-dev-debug-paused-animation');
    }
    hoveredElement = null;
  }

  function inspectOverflow(elements) {
    clearOverflowMarks();
    let count = 0;
    for (const element of elements) {
      if (isActuallyHidden(element)) continue;
      const horizontal = element.scrollWidth > element.clientWidth + 2;
      const vertical = element.scrollHeight > element.clientHeight + 2;
      let clipped = false;
      if (!horizontal && !vertical && element !== document.body && element !== document.documentElement) {
        const rect = element.getBoundingClientRect();
        clipped = rect.width > 0 && (rect.right < -1 || rect.left > window.innerWidth + 1 || rect.bottom < -1 || rect.top > window.innerHeight + 1);
      }
      if (horizontal || vertical || clipped) {
        element.setAttribute('data-ms-dev-debug-overflow', horizontal && vertical ? 'both' : horizontal ? 'horizontal' : vertical ? 'vertical' : 'outside-viewport');
        previousOverflowNodes.add(element);
        count += 1;
      }
    }
    return count;
  }

  function elementClasses(element) {
    try { return Array.from(element.classList || []).filter((value) => value && !value.startsWith('ms-dev-debug')).slice(0, 4); }
    catch { return []; }
  }

  function describeElement(element) {
    if (!element) return 'Move the pointer over an element to inspect it.';
    const tag = element.tagName.toLowerCase();
    const id = element.id ? `#${element.id}` : '';
    const classes = elementClasses(element).map((value) => `.${value}`).join('');
    const rect = element.getBoundingClientRect();
    const size = `${Math.round(rect.width)}×${Math.round(rect.height)}`;
    return `${tag}${id}${classes} · ${size} · x${Math.round(rect.left)} y${Math.round(rect.top)}`;
  }

  function cssSelectorFor(element) {
    if (!element || !(element instanceof Element)) return '(none)';
    if (element.id) {
      const idSelector = `#${window.CSS?.escape ? CSS.escape(element.id) : element.id.replace(/[^a-zA-Z0-9_-]/g, '\\$&')}`;
      try { if (element.getRootNode().querySelectorAll(idSelector).length === 1) return idSelector; } catch { /* Use a structural selector below. */ }
    }
    const parts = [];
    let current = element;
    while (current && current instanceof Element && current !== document.documentElement && parts.length < 12) {
      let part = current.tagName.toLowerCase();
      const classes = elementClasses(current).slice(0, 2);
      if (classes.length) part += classes.map((value) => `.${window.CSS?.escape ? CSS.escape(value) : value}`).join('');
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter((child) => child.tagName === current.tagName);
        if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
      }
      parts.unshift(part);
      if (current.parentElement?.id) {
        parts.unshift(`#${window.CSS?.escape ? CSS.escape(current.parentElement.id) : current.parentElement.id}`);
        break;
      }
      current = parent;
    }
    return parts.join(' > ');
  }

  function describeElementDetails(element) {
    if (!element) return 'DETAILS  —';
    const style = cssDisplay(element);
    const rect = element.getBoundingClientRect();
    const role = element.getAttribute('role') || '—';
    const type = element.getAttribute('type') || (element instanceof HTMLInputElement ? element.type : '—');
    const aria = element.getAttribute('aria-label') || element.getAttribute('title') || '—';
    const tabIndex = element.hasAttribute('tabindex') ? element.getAttribute('tabindex') : String(element.tabIndex);
    const selector = cssSelectorFor(element);
    const lines = [
      `SELECTOR  ${selector}`,
      `RECT      x${Math.round(rect.left)} y${Math.round(rect.top)} · ${Math.round(rect.width)}×${Math.round(rect.height)}`,
      `LAYOUT    ${style?.display || '—'} · ${style?.position || '—'} · z=${style?.zIndex || 'auto'} · pointer=${style?.pointerEvents || '—'}`,
      `A11Y      role=${role} · type=${type} · tabindex=${tabIndex} · name=${aria}`,
    ];
    if (settings.boxModel) {
      lines.push(`BOX       padding ${style?.paddingTop || '0'} ${style?.paddingRight || '0'} ${style?.paddingBottom || '0'} ${style?.paddingLeft || '0'}`);
      lines.push(`          margin  ${style?.marginTop || '0'} ${style?.marginRight || '0'} ${style?.marginBottom || '0'} ${style?.marginLeft || '0'} · border ${style?.borderTopWidth || '0'}`);
    }
    return lines.join('\n');
  }

  function describeHitTestStack() {
    if (!Number.isFinite(pointerX) || !Number.isFinite(pointerY)) return 'HIT TEST  move pointer over the page';
    let hits = [];
    try { hits = document.elementsFromPoint(pointerX, pointerY); } catch { /* unsupported in older embedded engines */ }
    const descriptions = hits
      .filter((element) => !isDebugOverlayElement(element))
      .slice(0, 3)
      .map((element) => describeElement(element));
    return `HIT TEST  ${descriptions.length ? descriptions.join('  ←  ') : 'no element at pointer'}`;
  }

  function shadowHostSelectors(element) {
    const hosts = [];
    let root = element?.getRootNode?.();
    while (root && root instanceof ShadowRoot && root.host) {
      hosts.push(cssSelectorFor(root.host));
      root = root.host.getRootNode?.();
    }
    return hosts.reverse().slice(0, 12);
  }

  function resolvePageElement(selector, shadowHosts = []) {
    if (typeof selector !== 'string' || !selector || selector.length > 700) return null;
    let root = document;
    if (Array.isArray(shadowHosts)) {
      for (const hostSelector of shadowHosts.slice(0, 12)) {
        let host = null;
        try { host = root.querySelector(String(hostSelector).slice(0, 700)); } catch { return null; }
        if (!host?.shadowRoot) return null;
        root = host.shadowRoot;
      }
    }
    try { return root.querySelector(selector); } catch { return null; }
  }

  function snapshotElement(element) {
    if (!element || !(element instanceof Element)) return null;
    const style = cssDisplay(element);
    const rect = element.getBoundingClientRect();
    const readEdges = (prefix, suffix) => ({
      top: style?.getPropertyValue(`${prefix}-top${suffix}`) || '0px',
      right: style?.getPropertyValue(`${prefix}-right${suffix}`) || '0px',
      bottom: style?.getPropertyValue(`${prefix}-bottom${suffix}`) || '0px',
      left: style?.getPropertyValue(`${prefix}-left${suffix}`) || '0px',
    });
    const ariaLabel = element.getAttribute('aria-label') || element.getAttribute('title') || element.getAttribute('alt') || '';
    let controlText = '';
    if (!ariaLabel && element.matches('button,a,[role="button"],label,summary,option')) {
      try { controlText = String(element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120); } catch { controlText = ''; }
    }
    const rectData = {
      x: Math.round(rect.left), y: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height),
      right: Math.round(rect.right), bottom: Math.round(rect.bottom),
    };
    const border = {
      top: style?.borderTopWidth || '0px', right: style?.borderRightWidth || '0px',
      bottom: style?.borderBottomWidth || '0px', left: style?.borderLeftWidth || '0px',
    };
    return {
      tag: element.tagName.toLowerCase(), id: element.id || '', classes: elementClasses(element), selector: cssSelectorFor(element), shadowHosts: shadowHostSelectors(element),
      label: (ariaLabel || controlText).slice(0, 180), rect: rectData,
      layout: {
        display: style?.display || '—', position: style?.position || 'static', zIndex: style?.zIndex || 'auto',
        pointerEvents: style?.pointerEvents || 'auto', overflowX: style?.overflowX || 'visible', overflowY: style?.overflowY || 'visible',
        opacity: style?.opacity || '1', visibility: style?.visibility || 'visible', cursor: style?.cursor || 'auto',
        flex: style?.flex || '—', flexBasis: style?.flexBasis || '—', flexGrow: style?.flexGrow || '0', flexShrink: style?.flexShrink || '1',
        flexDirection: style?.flexDirection || '—', flexWrap: style?.flexWrap || '—', gridArea: style?.gridArea || '—',
        gridTemplateColumns: style?.gridTemplateColumns || '—', gridTemplateRows: style?.gridTemplateRows || '—', gridColumn: style?.gridColumn || '—', gridRow: style?.gridRow || '—',
        gap: style?.gap || '—', rowGap: style?.rowGap || '—', columnGap: style?.columnGap || '—',
        alignItems: style?.alignItems || '—', alignSelf: style?.alignSelf || '—', justifyContent: style?.justifyContent || '—', justifySelf: style?.justifySelf || '—',
        width: style?.width || '—', height: style?.height || '—', minWidth: style?.minWidth || '—', minHeight: style?.minHeight || '—', maxWidth: style?.maxWidth || '—', maxHeight: style?.maxHeight || '—',
        boxSizing: style?.boxSizing || '—', borderRadius: style?.borderRadius || '—', transform: style?.transform || 'none',
        fontFamily: style?.fontFamily || '—', fontSize: style?.fontSize || '—', fontWeight: style?.fontWeight || '—', lineHeight: style?.lineHeight || '—',
        color: style?.color || '—', backgroundColor: style?.backgroundColor || '—', backgroundImage: style?.backgroundImage || 'none',
        whiteSpace: style?.whiteSpace || '—', overflowWrap: style?.overflowWrap || '—', isolation: style?.isolation || 'auto',
        filter: style?.filter || 'none', backdropFilter: style?.backdropFilter || 'none', animationName: style?.animationName || 'none', animationDuration: style?.animationDuration || '0s',
        transitionProperty: style?.transitionProperty || 'all', transitionDuration: style?.transitionDuration || '0s',
      },
      accessibility: {
        role: element.getAttribute('role') || '—', type: element.getAttribute('type') || (element instanceof HTMLInputElement ? element.type : '—'),
        tabIndex: element.hasAttribute('tabindex') ? element.getAttribute('tabindex') : String(element.tabIndex),
        label: (element.getAttribute('aria-label') || element.getAttribute('title') || '—').slice(0, 180),
        disabled: 'disabled' in element ? Boolean(element.disabled) : null,
        focused: document.activeElement === element,
      },
      boxModel: { padding: readEdges('padding', ''), margin: readEdges('margin', ''), border },
    };
  }

  function hitTestSnapshot() {
    if (!Number.isFinite(pointerX) || !Number.isFinite(pointerY)) return [];
    let hits = [];
    try { hits = document.elementsFromPoint(pointerX, pointerY); } catch { /* unsupported in older embedded engines */ }
    return hits.filter((element) => !isDebugOverlayElement(element)).slice(0, 8).map(snapshotElement).filter(Boolean);
  }

  function currentPageSnapshot() {
    const pageStyle = document.body?.dataset.homepageStyle || '';
    const pageNames = {
      'home-v2.html': 'Simple', 'home-retro.html': 'Simple Retro', 'home-retro-complex.html': 'Retro Complex',
      'home-v3.html': '3D Parallax', 'home-v4.html': '3D Parallax Big App', 'home-galaxy.html': 'Galaxy',
      'home-parallax-jungle.html': 'Parallax Jungle', 'home-claymorphism.html': 'Claymorphism', 'home-glass.html': 'Glass',
      'home-isometric-world.html': 'Isometric World',
    };
    const themeNames = { legacy: 'Default', v2: 'Simple', retro: 'Simple Retro', 'retro-complex': 'Retro Complex', parallax: '3D Parallax', 'parallax-big': '3D Parallax Big App', galaxy: 'Galaxy', 'parallax-jungle': 'Parallax Jungle', claymorphism: 'Claymorphism', glass: 'Glass', 'isometric-world': 'Isometric World' };
    const documentElement = document.documentElement;
    const settingsScreen = document.getElementById('settingsScreen');
    const settingsVisible = Boolean(settingsScreen && !settingsScreen.classList.contains('hidden'));
    const workspace = settingsVisible ? 'settings' : (document.body?.dataset.workspaceApp || (framed ? 'homepage' : 'launcher'));
    const name = settingsVisible ? 'Settings' : (pageNames[filename] || (framed ? 'Homepage theme' : 'Mad Station'));
    return {
      title: document.title || '—', file: filename || 'renderer.html', name,
      workspace, theme: settingsVisible ? 'Settings UI' : (themeNames[pageStyle] || pageStyle || (framed ? (pageNames[filename] || 'Homepage theme') : '—')),
      iframe: framed, viewport: { width: window.innerWidth, height: window.innerHeight }, scroll: { x: Math.round(window.scrollX || 0), y: Math.round(window.scrollY || 0) },
      documentSize: { width: documentElement?.scrollWidth || window.innerWidth, height: documentElement?.scrollHeight || window.innerHeight },
    };
  }

  function nearestInteractiveElement(element) {
    let current = element;
    const interactiveSelector = 'button,a[href],input:not([type="hidden"]),select,textarea,summary,[role="button"],[tabindex]:not([tabindex="-1"])';
    for (let depth = 0; current instanceof Element && depth < 20; depth += 1) {
      if (current.matches(interactiveSelector)) return current;
      if (current.parentElement) current = current.parentElement;
      else {
        const root = current.getRootNode?.();
        current = root instanceof ShadowRoot ? root.host : null;
      }
    }
    return null;
  }

  function elementAncestorChain(element, limit = 12) {
    const chain = [];
    let current = element;
    for (let depth = 0; current instanceof Element && depth < limit; depth += 1) {
      chain.push({ selector: cssSelectorFor(current), tag: current.tagName.toLowerCase(), id: current.id || '', classes: elementClasses(current) });
      if (current.parentElement) current = current.parentElement;
      else {
        const root = current.getRootNode?.();
        current = root instanceof ShadowRoot ? root.host : null;
      }
    }
    return chain;
  }

  function makeAgentReference(element, pointer = {}) {
    const detail = snapshotElement(element);
    if (!detail) return '';
    const page = currentPageSnapshot();
    const parent = element.parentElement;
    const interactive = nearestInteractiveElement(element);
    const viewportX = Number.isFinite(pointer.x) ? Math.round(pointer.x) : detail.rect.x;
    const viewportY = Number.isFinite(pointer.y) ? Math.round(pointer.y) : detail.rect.y;
    const documentX = Math.round(viewportX + (window.scrollX || 0));
    const documentY = Math.round(viewportY + (window.scrollY || 0));
    const classes = detail.classes.length ? detail.classes.map((name) => `.${name}`).join(' ') : '(none)';
    const id = detail.id ? `#${detail.id}` : '(no ID assigned)';
    const accessible = detail.label || detail.accessibility?.label || '(no accessible label)';
    return [
      'MAD STATION — ELEMENT REFERENCE',
      `Page: ${page.name} | workspace=${page.workspace} | theme=${page.theme}`,
      `Element: <${detail.tag}> ${id}`,
      `CSS selector: ${detail.selector}`,
      `Classes: ${classes}`,
      `Accessible label: ${accessible}`,
      `Viewport rect: x=${detail.rect.x}, y=${detail.rect.y}, width=${detail.rect.width}, height=${detail.rect.height}`,
      `Pointer: viewport x=${viewportX}, y=${viewportY}; document x=${documentX}, y=${documentY}`,
      `Parent selector: ${parent ? cssSelectorFor(parent) : '(document root)'}`,
      `Nearest interactive control: ${interactive ? cssSelectorFor(interactive) : '(none)'}`,
      `Layout: display=${detail.layout.display}; position=${detail.layout.position}; z-index=${detail.layout.zIndex}; pointer-events=${detail.layout.pointerEvents}; overflow=${detail.layout.overflowX}/${detail.layout.overflowY}`,
      `Accessibility: role=${detail.accessibility.role}; type=${detail.accessibility.type}; tabindex=${detail.accessibility.tabIndex}; disabled=${detail.accessibility.disabled === null ? 'n/a' : detail.accessibility.disabled}`,
      `Shadow hosts: ${detail.shadowHosts.length ? detail.shadowHosts.join(' -> ') : '(none)'}`,
      'Request: Please inspect this exact element and its surrounding layout without changing unrelated UI.',
    ].join('\n');
  }

  function sanitizeOuterHTML(element) {
    const clone = element.cloneNode(true);
    const fields = [clone, ...Array.from(clone.querySelectorAll?.('input,textarea,select,[contenteditable="true"],[contenteditable=""]') || [])];
    for (const field of fields) {
      if (!(field instanceof Element)) continue;
      if (field.matches('input')) {
        field.removeAttribute('value');
        field.removeAttribute('checked');
        field.removeAttribute('autocomplete');
      } else if (field.matches('textarea')) {
        field.textContent = '';
      } else if (field.matches('select')) {
        field.removeAttribute('value');
        field.querySelectorAll('option').forEach((option) => option.removeAttribute('selected'));
      } else if (field.isContentEditable) {
        field.textContent = '[contenteditable contents omitted]';
      }
    }
    return String(clone.outerHTML || '').slice(0, 8000);
  }

  async function copyDebugText(text) {
    const value = String(text ?? '');
    try {
      if (typeof window.aiHub?.writeSystemClipboard === 'function') {
        const result = await window.aiHub.writeSystemClipboard(value);
        if (result === true || result?.ok === true) return true;
        if (result?.ok === false) throw new Error(result.error || 'Clipboard write failed');
      }
    } catch { /* Try the standard clipboard API next. */ }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return true;
      }
    } catch { /* file:// pages can lack clipboard permission; use a temporary selection. */ }
    let textarea = null;
    try {
      textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.setAttribute('readonly', '');
      textarea.style.cssText = 'position:fixed;left:-10000px;top:0;width:1px;height:1px;opacity:0;';
      document.body.append(textarea);
      textarea.select();
      const copied = Boolean(document.execCommand?.('copy'));
      textarea.remove();
      return copied;
    } catch {
      textarea?.remove();
      return false;
    }
  }

  function clearSelectedHighlight() {
    if (highlightClearTimer) window.clearTimeout(highlightClearTimer);
    highlightClearTimer = 0;
    if (highlightedElement) highlightedElement.removeAttribute('data-ms-dev-debug-selected');
    highlightedElement = null;
    if (activeWorldHighlightOwner) {
      try { window.MadStationIsometricDebug?.setSelectedObject?.(null); } catch { /* Isometric world may have been unloaded. */ }
      activeWorldHighlightOwner = null;
    }
    const hadTemporaryReveals = temporarilyRevealedNodes.length > 0;
    for (const node of temporarilyRevealedNodes) {
      try {
        node.removeAttribute('data-ms-dev-debug-revealed');
        node.removeAttribute('data-ms-dev-debug-reveal-ancestor');
      } catch { /* A node may have been detached while it was highlighted. */ }
    }
    temporarilyRevealedNodes = [];
    for (const [node, properties] of temporaryRevealOriginalStyles) {
      try {
        for (const [property, previous] of properties) {
          if (previous.value) node.style.setProperty(property, previous.value, previous.priority);
          else node.style.removeProperty(property);
        }
      } catch { /* The node may have been detached while it was highlighted. */ }
    }
    temporaryRevealOriginalStyles.clear();
    if (hadTemporaryReveals) {
      syncShadowRootDebugStyles();
      scheduleRefresh();
    }
  }

  function temporarilySetInlineStyles(element, styles) {
    let original = temporaryRevealOriginalStyles.get(element);
    if (!original) {
      original = new Map();
      temporaryRevealOriginalStyles.set(element, original);
    }
    for (const [property, value] of Object.entries(styles)) {
      if (!original.has(property)) original.set(property, {
        value: element.style.getPropertyValue(property),
        priority: element.style.getPropertyPriority(property),
      });
      element.style.setProperty(property, value, 'important');
    }
  }

  function highlightElementDirect(element) {
    if (!(element instanceof Element) || isDebugOverlayElement(element)) return;
    clearSelectedHighlight();
    highlightedElement = element;
    element.setAttribute('data-ms-dev-debug-selected', 'true');
    let current = element;
    let needsReveal = false;
    for (let depth = 0; current instanceof Element && depth < 40; depth += 1) {
      if (isActuallyHidden(current)) {
        needsReveal = true;
        if (current !== element) {
          current.setAttribute('data-ms-dev-debug-reveal-ancestor', 'true');
          temporarilyRevealedNodes.push(current);
          temporarilySetInlineStyles(current, { display: 'contents', visibility: 'visible', opacity: '1' });
        }
      }
      if (current.parentElement) current = current.parentElement;
      else {
        const root = current.getRootNode?.();
        current = root instanceof ShadowRoot ? root.host : null;
      }
    }
    if (needsReveal) {
      // Hidden nodes have no measurable outline. Temporarily surface only the selected
      // node as an anchored debug card and open hidden ancestors as display:contents.
      // All markers are removed automatically after the same short highlight interval.
      element.setAttribute('data-ms-dev-debug-revealed', 'true');
      temporarilyRevealedNodes.push(element);
      temporarilySetInlineStyles(element, {
        display: 'block', visibility: 'visible', opacity: '1', position: 'fixed',
        top: '12px', left: '12px', right: 'auto', bottom: 'auto', width: 'max-content', height: 'auto',
        'max-width': 'calc(100vw - 24px)', 'max-height': 'calc(100vh - 24px)', overflow: 'auto',
        'z-index': '2147483646', padding: '8px', background: '#111827', color: '#ffffff',
        'box-shadow': '0 0 0 4px #ffd166, 0 12px 38px rgba(0, 0, 0, .72)',
        outline: '4px solid #ffd166', 'outline-offset': '2px',
      });
      syncShadowRootDebugStyles();
    } else {
      try { element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' }); } catch { /* Older embedded engine */ }
    }
    highlightClearTimer = window.setTimeout(clearSelectedHighlight, 4200);
    hoveredElement = element;
    scheduleHoverHud();
  }

  function highlightWorldObject(worldObject) {
    const api = window.MadStationIsometricDebug;
    if (!worldObject || typeof worldObject.owner !== 'string' || !api?.setSelectedObject) return false;
    clearSelectedHighlight();
    activeWorldHighlightOwner = worldObject.owner;
    api.setSelectedObject(worldObject.owner);
    highlightClearTimer = window.setTimeout(clearSelectedHighlight, 4200);
    lastContextSelection = worldObjectContextSnapshot(worldObject, pointerX, pointerY);
    scheduleHoverHud();
    return true;
  }

  function worldObjectContextSnapshot(worldObject, x, y) {
    const object = { ...worldObject };
    return {
      tag: 'world-object', kind: 'world-object', id: object.owner || '', selector: object.selector || `world-object:${object.owner || ''}`,
      label: object.name || 'Isometric World object', classes: [], rect: object.rect || { x: Math.round(x || 0), y: Math.round(y || 0), width: 0, height: 0, right: Math.round(x || 0), bottom: Math.round(y || 0) },
      selectedAt: Date.now(), page: currentPageSnapshot(), pointer: { x: Math.round(x || 0), y: Math.round(y || 0), documentX: Math.round((x || 0) + (window.scrollX || 0)), documentY: Math.round((y || 0) + (window.scrollY || 0)) },
      parentSelector: 'Isometric World canvas scene', ancestorChain: [{ selector: '#world', id: 'world' }], nearestInteractive: null,
      agentReference: `Isometric World scene object ${object.name || object.owner || 'unknown'} (${object.owner || ''})`, worldObject: object,
    };
  }

  function contextSelectionSnapshot(element, x, y) {
    const detail = snapshotElement(element);
    if (!detail) return null;
    const parent = element.parentElement;
    const interactive = nearestInteractiveElement(element);
    return {
      ...detail,
      selectedAt: Date.now(),
      page: currentPageSnapshot(),
      pointer: { x: Math.round(x), y: Math.round(y), documentX: Math.round(x + (window.scrollX || 0)), documentY: Math.round(y + (window.scrollY || 0)) },
      parentSelector: parent ? cssSelectorFor(parent) : '(document root)',
      ancestorChain: elementAncestorChain(element),
      nearestInteractive: interactive ? snapshotElement(interactive) : null,
      agentReference: makeAgentReference(element, { x, y }),
    };
  }

  function openElementContextMenu(element, x, y, worldObject = null) {
    if (!settings.enabled || !(element instanceof Element) || isDebugOverlayElement(element) || !document.body) return;
    closeElementContextMenu();
    contextMenuTarget = element;
    contextWorldTarget = worldObject;
    pointerX = x;
    pointerY = y;
    hoveredElement = element;
    lastContextSelection = worldObject ? worldObjectContextSnapshot(worldObject, x, y) : contextSelectionSnapshot(element, x, y);

    const menu = createNode('div', 'ms-dev-debug-context-menu');
    contextMenu = menu;
    menu.dataset.msDebugOverlay = 'true';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Developer element actions');
    menu.tabIndex = -1;

    const header = createNode('div', 'ms-dev-debug-context-head');
    const identity = createNode('div', 'ms-dev-debug-context-identity');
    const tagLine = createNode('strong', 'ms-dev-debug-context-tag');
    const detail = snapshotElement(element);
    const idText = worldObject ? `Canvas scene object · ${worldObject.owner}` : (element.id ? `#${element.id}` : '(no ID assigned)');
    tagLine.textContent = worldObject ? `${worldObject.kind || 'world object'}: ${worldObject.name || worldObject.owner}` : `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}`;
    const identityMeta = createNode('span', 'ms-dev-debug-context-meta', idText);
    const classLine = createNode('span', 'ms-dev-debug-context-classes', worldObject ? '3D object rendered inside #world canvas' : (elementClasses(element).map((name) => `.${name}`).join(' ') || '(no classes)'));
    identity.append(tagLine, identityMeta, classLine);
    const closeButton = createNode('button', 'ms-dev-debug-context-close', '×');
    closeButton.type = 'button'; closeButton.title = 'Close context menu'; closeButton.setAttribute('aria-label', 'Close context menu');
    closeButton.addEventListener('click', closeElementContextMenu);
    header.append(identity, closeButton);
    menu.append(header);

    const selector = worldObject?.selector || cssSelectorFor(element);
    const line = createNode('div', 'ms-dev-debug-context-selector', selector);
    line.title = selector;
    menu.append(line);

    const actions = createNode('div', 'ms-dev-debug-context-actions');
    const addAction = (label, action, { disabled = false, primary = false } = {}) => {
      const button = createNode('button', `ms-dev-debug-context-action${primary ? ' is-primary' : ''}`, label);
      button.type = 'button'; button.setAttribute('role', 'menuitem'); button.disabled = disabled;
      button.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await action();
      });
      actions.append(button);
      return button;
    };
    const setStatus = (message, error = false) => {
      if (!contextMenuStatus) return;
      contextMenuStatus.textContent = message;
      contextMenuStatus.dataset.error = error ? 'true' : 'false';
    };
    const copyAction = (label, textGetter, options = {}) => addAction(label, async () => {
      const copied = await copyDebugText(typeof textGetter === 'function' ? textGetter() : textGetter);
      setStatus(copied ? 'Copied to clipboard.' : 'Copy failed. Try the Element Explorer copy action.', !copied);
    }, options);
    const parent = element.parentElement || (element.getRootNode?.() instanceof ShadowRoot ? element.getRootNode().host : null);
    const interactive = nearestInteractiveElement(element);
    let idAncestor = parent;
    for (let depth = 0; idAncestor instanceof Element && !idAncestor.id && depth < 20; depth += 1) {
      if (idAncestor.parentElement) idAncestor = idAncestor.parentElement;
      else {
        const root = idAncestor.getRootNode?.();
        idAncestor = root instanceof ShadowRoot ? root.host : null;
      }
    }

    if (worldObject) {
      copyAction('Copy world object reference', () => worldObject.agentReference || `Isometric World object ${worldObject.owner}`, { primary: true });
      copyAction('Copy world object details', () => JSON.stringify(worldObject, null, 2));
      addAction('Highlight world object on page', async () => { const ok = highlightWorldObject(worldObject); setStatus(ok ? 'World object highlighted for 4 seconds.' : 'Could not highlight this world object.', !ok); }, { primary: true });
      addAction('Hide world object temporarily', async () => {
        const hidden = hideDebugWorldObject(worldObject);
        setStatus(hidden ? 'World object hidden for this debug session. Restore it in Inspector → Temporarily hidden by Debug Mode.' : 'Could not hide this object or the 200-item limit has been reached.', !hidden);
      }, { primary: true });
      addAction('Inspect canvas element…', async () => { closeElementContextMenu(); openElementContextMenu(element, x, y); });
      addAction('Show selection in Inspector', async () => { lastContextSelection = worldObjectContextSnapshot(worldObject, x, y); scheduleHoverHud(); setStatus('World-object selection sent to the separate Inspector.'); });
    } else {
      copyAction('Copy element ID', () => element.id || '(no ID assigned)', { disabled: !element.id });
      copyAction('Copy CSS selector', () => selector, { primary: true });
      copyAction('Copy agent-ready reference', () => makeAgentReference(element, { x, y }), { primary: true });
      copyAction('Copy nearest ancestor ID', () => idAncestor?.id || '(no ancestor ID assigned)', { disabled: !idAncestor?.id });
      copyAction('Copy parent selector', () => parent ? cssSelectorFor(parent) : '(document root)');
      copyAction('Copy ancestor chain and IDs', () => elementAncestorChain(element).map((node, index) => `${'  '.repeat(index)}${node.selector}${node.id ? `  [id=${node.id}]` : ''}`).join('\n'));
      copyAction('Copy bounding box / coordinates', () => {
        const rect = element.getBoundingClientRect();
        const page = currentPageSnapshot();
        return JSON.stringify({ page: { name: page.name, workspace: page.workspace, theme: page.theme }, pointer: { x: Math.round(x), y: Math.round(y) }, element: { selector, id: element.id || null, rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height), documentX: Math.round(rect.x + window.scrollX), documentY: Math.round(rect.y + window.scrollY) } } }, null, 2);
      });
      copyAction('Copy diagnostic JSON', () => JSON.stringify(contextSelectionSnapshot(element, x, y), null, 2));
      copyAction('Copy sanitized outerHTML', () => sanitizeOuterHTML(element));
      addAction('Highlight element on page', async () => { highlightElementDirect(element); setStatus('Highlighted for 4 seconds.'); });
      addAction('Hide element temporarily', async () => {
        const hidden = hideDebugElement(element);
        setStatus(hidden
          ? 'Hidden for this debug session. Restore it in Inspector → Temporarily hidden by Debug Mode.'
          : 'Cannot hide the document root/body, or the 200-element temporary-hide limit has been reached.', !hidden);
      }, { primary: true, disabled: element === document.documentElement || element === document.body });
      addAction('Show selection in Inspector', async () => { hoveredElement = element; lastContextSelection = contextSelectionSnapshot(element, x, y); scheduleHoverHud(); setStatus('Selection sent to the separate Inspector.'); });
      addAction('Inspect parent element…', async () => { closeElementContextMenu(); if (parent) openElementContextMenu(parent, x, y); }, { disabled: !parent });
      addAction('Inspect nearest interactive control…', async () => { closeElementContextMenu(); if (interactive) openElementContextMenu(interactive, x, y); }, { disabled: !interactive });
    }
    menu.append(actions);
    contextMenuStatus = createNode('div', 'ms-dev-debug-context-status', 'Right-click another element to change selection · Hide is temporary · Shift + right-click opens the app menu.');
    contextMenuStatus.setAttribute('role', 'status');
    menu.append(contextMenuStatus);
    document.body.append(menu);

    const margin = 8;
    const rect = menu.getBoundingClientRect();
    const left = Math.max(margin, Math.min(x, window.innerWidth - rect.width - margin));
    const top = Math.max(margin, Math.min(y, window.innerHeight - rect.height - margin));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.focus({ preventScroll: true });
    scheduleHoverHud();
  }

  function onElementContextMenu(event) {
    if (!settings.enabled) return;
    // Shift+right-click deliberately passes through so app-owned context menus can
    // still be tested while Developer Mode is active.
    if (event.shiftKey) return;
    const eventTarget = event.target instanceof Element ? event.target : null;
    if (eventTarget && isDebugOverlayElement(eventTarget)) {
      if (contextMenu) event.preventDefault();
      return;
    }
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    const target = path.find((node) => node instanceof Element && !isDebugOverlayElement(node)) || eventTarget;
    if (!(target instanceof Element)) return;
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    // Isometric World is mostly a canvas, but its app-name pills are ordinary DOM
    // buttons layered over the scene. Resolve either surface to the same world owner
    // so right-click works on the actual 3D geometry and on its overlaid labels.
    let worldObject = null;
    try {
      const worldApi = window.MadStationIsometricDebug;
      const worldLabel = path.find((node) => node instanceof Element && node.matches?.('.tag3d[data-id]'));
      if (worldLabel?.dataset?.id && worldApi?.getObject) {
        worldObject = worldApi.getObject(`app:${worldLabel.dataset.id}`) || null;
      }
      const worldCanvasInPath = target.id === 'world' || path.some((node) => node instanceof Element && node.id === 'world');
      if (!worldObject && worldCanvasInPath) worldObject = worldApi?.getObjectAt?.(event.clientX, event.clientY) || null;
    } catch { worldObject = null; }
    openElementContextMenu(target, event.clientX, event.clientY, worldObject);
  }

  function onPointerDownDismissContextMenu(event) {
    if (!contextMenu || isDebugOverlayElement(event.target)) return;
    closeElementContextMenu();
  }

  function updateHoverHud() {
    hoverFrame = 0;
    if (!settings.enabled || !settings.hud) return;
    const snapshot = {
      status: 'active', updatedAt: Date.now(), page: currentPageSnapshot(), stats: { ...lastPageStats },
      hovered: snapshotElement(hoveredElement), hitTest: settings.hitTest ? hitTestSnapshot() : [],
      lastClick: settings.clickTrace ? lastClickData : null,
      hiddenSamples: settings.hiddenAudit ? [...latestHiddenSamples] : [],
      overflowSamples: settings.overflow ? [...latestOverflowSamples] : [],
      elementExplorer: latestElementExplorer,
      debugHiddenElements: listDebugHiddenElements(),
      contextSelection: lastContextSelection,
      pointer: Number.isFinite(pointerX) && Number.isFinite(pointerY) ? { x: Math.round(pointerX), y: Math.round(pointerY) } : null,
    };
    publishInspectorSnapshot(snapshot);
  }

  function scheduleHoverHud() {
    if (hoverFrame || !settings.enabled) return;
    hoverFrame = window.requestAnimationFrame(updateHoverHud);
  }

  function explorerSearchText(element) {
    const values = [
      element.tagName, element.id, typeof element.className === 'string' ? element.className : '',
      element.getAttribute('role'), element.getAttribute('type'), element.getAttribute('aria-label'),
      element.getAttribute('title'), element.getAttribute('name'), element.getAttribute('data-testid'),
      element.getAttribute('alt'), element.getAttribute('placeholder'),
    ];
    return values.filter(Boolean).join(' ').toLowerCase();
  }

  function searchDocumentElements(command) {
    const requestId = typeof command.requestId === 'string' ? command.requestId.slice(0, 100) : '';
    const query = typeof command.query === 'string' ? command.query.slice(0, 240).trim().toLowerCase() : '';
    const includeHidden = command.includeHidden === true;
    const offset = Math.max(0, Math.min(10000000, Number.isFinite(command.offset) ? Math.floor(command.offset) : 0));
    const limit = Math.max(1, Math.min(100, Number.isFinite(command.limit) ? Math.floor(command.limit) : 50));
    const pageElements = document.documentElement ? [document.documentElement, ...collectElementsIncludingOpenShadowRoots(document.documentElement)] : [];
    const matched = [];
    for (const element of pageElements) {
      if (!(element instanceof Element) || isDebugOverlayElement(element)) continue;
      if (query && !explorerSearchText(element).includes(query) && !cssSelectorFor(element).toLowerCase().includes(query)) continue;
      if (!includeHidden && isActuallyHidden(element)) continue;
      matched.push(element);
    }
    const results = matched.slice(offset, offset + limit).map((element) => {
      const detail = snapshotElement(element);
      const rect = element.getBoundingClientRect();
      return {
        ...detail,
        hidden: isActuallyHidden(element),
        parentSelector: element.parentElement ? cssSelectorFor(element.parentElement) : '(document root)',
        childCount: element.children?.length || 0,
        scrollSize: { width: element.scrollWidth || 0, height: element.scrollHeight || 0 },
        offsetSize: { width: element.offsetWidth || 0, height: element.offsetHeight || 0 },
        outsideViewport: rect.right < 0 || rect.bottom < 0 || rect.left > window.innerWidth || rect.top > window.innerHeight,
      };
    });
    latestElementExplorer = {
      requestId, query, includeHidden, offset, limit, total: matched.length,
      hasPrevious: offset > 0, hasNext: offset + limit < matched.length, results,
      status: settings.enabled ? 'active' : 'debug-disabled',
    };
    scheduleHoverHud();
  }

  function highlightDocumentElement(selector, shadowHosts = []) {
    if (typeof selector !== 'string' || selector.length > 700) return;
    const element = resolvePageElement(selector, shadowHosts);
    if (!element || isDebugOverlayElement(element)) return;
    highlightElementDirect(element);
  }

  function handleInspectorCommand(command) {
    if (!command || typeof command !== 'object') return;
    if (framed === false && hostHudShouldYieldToThemedHomepage()) return;
    if (command.type === 'search-elements') {
      if (!settings.enabled) {
        latestElementExplorer = { requestId: String(command.requestId || ''), query: String(command.query || ''), includeHidden: command.includeHidden === true, offset: 0, limit: 50, total: 0, hasPrevious: false, hasNext: false, results: [], status: 'debug-disabled' };
        return;
      }
      searchDocumentElements(command);
    } else if (command.type === 'highlight-element') {
      highlightDocumentElement(command.selector, command.shadowHosts);
    } else if (command.type === 'unhide-element') {
      unhideDebugElement(command.token);
    } else if (command.type === 'unhide-all-elements') {
      restoreAllDebugHiddenElements();
    }
  }

  function buildLabels(elements) {
    if (!overlay) return;
    overlay.querySelectorAll('.ms-dev-debug-element-label').forEach((node) => node.remove());
    if (!settings.enabled || !settings.labels) return;
    const candidates = elements.filter((element) => !isActuallyHidden(element))
      .filter((element) => element.id || element.getAttribute('role') || (typeof element.className === 'string' && element.className.trim()))
      .slice(0, 180);
    for (const element of candidates) {
      const rect = element.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) continue;
      const label = createNode('span', 'ms-dev-debug-element-label');
      const id = element.id ? `#${element.id}` : '';
      const classes = typeof element.className === 'string'
        ? element.className.split(/\s+/).filter((value) => value && !value.startsWith('ms-dev-debug')).slice(0, 2).map((value) => `.${value}`).join('')
        : '';
      label.textContent = `${element.tagName.toLowerCase()}${id}${classes}`.slice(0, 96);
      label.title = `${element.tagName.toLowerCase()}${id}${classes}`;
      label.style.left = `${Math.max(0, Math.min(window.innerWidth - 240, rect.left))}px`;
      label.style.top = `${Math.max(0, Math.min(window.innerHeight - 18, rect.top))}px`;
      overlay.append(label);
    }
  }

  function refreshDiagnostics() {
    refreshFrame = 0;
    if (!settings.enabled || !document.body) return;
    if (settings.labels) ensureOverlay();
    else removeOverlay();
    refreshHudVisibility();
    const elements = visibleElements();
    syncShadowRootObservers(elements);
    syncShadowRootDebugStyles();
    const hidden = elements.filter(isActuallyHidden);
    previousHiddenNodes = hidden;
    latestHiddenSamples = hidden.slice(0, 8).map((element) => element.id ? `#${element.id}` : element.tagName.toLowerCase());
    let overflowCount = 0;
    let gridFlexCount = 0;
    let interactiveCount = 0;
    let fixedStickyCount = 0;
    let elementCount = elements.length;
    const idCounts = new Map();
    if (settings.overflow) overflowCount = inspectOverflow(elements);
    else clearOverflowMarks();
    for (const element of elements) {
      const style = cssDisplay(element);
      if (style && (style.display === 'grid' || style.display === 'inline-grid' || style.display === 'flex' || style.display === 'inline-flex')) gridFlexCount += 1;
      if (style && (style.position === 'fixed' || style.position === 'sticky')) fixedStickyCount += 1;
      if (element.matches('button,a[href],input:not([type="hidden"]),select,textarea,summary,[role="button"],[tabindex]:not([tabindex="-1"])')) interactiveCount += 1;
      if (element.id) idCounts.set(element.id, (idCounts.get(element.id) || 0) + 1);
    }
    const duplicateIdCount = [...idCounts.values()].reduce((total, count) => total + (count > 1 ? count : 0), 0);
    latestOverflowSamples = [...previousOverflowNodes].slice(0, 8).map((element) => cssSelectorFor(element));
    lastPageStats = { elements: elementCount, gridFlex: gridFlexCount, overflow: overflowCount, hidden: hidden.length, interactive: interactiveCount, duplicateIds: duplicateIdCount, fixedSticky: fixedStickyCount };
    refreshHudVisibility();
    updateHoverHud();
    buildLabels(elements);
  }

  function scheduleRefresh() {
    if (refreshFrame) return;
    refreshFrame = window.requestAnimationFrame(refreshDiagnostics);
  }

  function installObserver() {
    if (observer || typeof MutationObserver !== 'function' || !document.body) return;
    observer = new MutationObserver((records) => {
      if (!settings.enabled || records.every((record) => isDebugOverlayElement(record.target))) return;
      scheduleRefresh();
    });
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['id', 'class', 'hidden', 'aria-hidden', 'data-workspace-app', 'data-homepage-style'] });
  }

  function disconnectObserver() {
    observer?.disconnect();
    observer = null;
    for (const shadowObserver of shadowRootObservers.values()) shadowObserver.disconnect();
    shadowRootObservers.clear();
    if (refreshFrame) window.cancelAnimationFrame(refreshFrame);
    if (hoverFrame) window.cancelAnimationFrame(hoverFrame);
    refreshFrame = 0;
    hoverFrame = 0;
  }

  function updateHoveredTarget(target) {
    if (!target || isDebugOverlayElement(target)) return;
    if (hoveredElement && hoveredElement !== target) {
      hoveredElement.removeAttribute('data-ms-dev-debug-hovered');
      hoveredElement.removeAttribute('data-ms-dev-debug-paused-animation');
    }
    hoveredElement = target;
    if (settings.hoverInspector && !/^(HTML|BODY)$/.test(target.tagName)) target.setAttribute('data-ms-dev-debug-hovered', 'true');
    else target.removeAttribute('data-ms-dev-debug-hovered');
    // Never freeze every animation on the page: pause only the exact element under
    // the pointer, and automatically resume it when the pointer moves away.
    const animationName = cssDisplay(target)?.animationName;
    if (settings.pauseAnimations && animationName && animationName !== 'none') target.setAttribute('data-ms-dev-debug-paused-animation', 'true');
    else target.removeAttribute('data-ms-dev-debug-paused-animation');
  }

  function onPointerOver(event) {
    if (!settings.enabled) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target || isDebugOverlayElement(target)) return;
    updateHoveredTarget(target);
    pointerX = event.clientX;
    pointerY = event.clientY;
    // Hover inspection updates only the small HUD, not the expensive whole-DOM overflow scan.
    scheduleHoverHud();
  }

  function onPointerMove(event) {
    if (!settings.enabled) return;
    pointerX = event.clientX;
    pointerY = event.clientY;
    const target = event.target instanceof Element ? event.target : null;
    if (target && !isDebugOverlayElement(target)) updateHoveredTarget(target);
    scheduleHoverHud();
  }

  function onClickCapture(event) {
    if (!settings.enabled || !settings.clickTrace) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target || isDebugOverlayElement(target)) return;
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    const actionableAncestor = path.find((node) => node instanceof Element && node !== target && node.matches('button,a,input,select,textarea,[role="button"],[tabindex]'));
    lastClickData = { target: snapshotElement(target), actionableAncestor: actionableAncestor ? snapshotElement(actionableAncestor) : null, trusted: Boolean(event.isTrusted), defaultPrevented: null, timestamp: Date.now() };
    // Read defaultPrevented after the event has bubbled. This observer never cancels or stops the click.
    window.setTimeout(() => {
      if (!settings.enabled || !settings.clickTrace || !lastClickData) return;
      lastClickData = { ...lastClickData, defaultPrevented: Boolean(event.defaultPrevented) };
      scheduleHoverHud();
    }, 0);
    scheduleHoverHud();
  }

  function onResizeOrScroll() {
    if (!settings.enabled) return;
    if (resizeTimer) window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      scheduleRefresh();
    }, 40);
  }

  function emergencyResetDebugMode() {
    const resetSettings = { ...DEFAULTS };
    lastClickData = null;
    applySettings(resetSettings, { persist: !framed });
    if (framed && expectedChannel) {
      // The host validates both the frame's identity and its channel before resetting
      // the parent document and relaying the safe settings to the active homepage.
      try { window.parent.postMessage({ channel: expectedChannel, type: 'developer-debug-emergency-reset' }, '*'); } catch { /* Local reset has already been applied. */ }
    } else {
      window.dispatchEvent(new CustomEvent('madstation:developer-debug-settings', { detail: { settings: resetSettings } }));
    }
  }

  // Global rescue shortcut: Ctrl+Shift+F12 resets all debug settings even when the
  // main page or Settings is visually obscured. It deliberately runs in capture phase.
  window.addEventListener('keydown', (event) => {
    const rescueKey = (event.ctrlKey || event.metaKey) && event.shiftKey && String(event.key).toLowerCase() === 'f12';
    if (!rescueKey) return;
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    emergencyResetDebugMode();
  }, { capture: true });

  window.addEventListener('madstation:developer-debug-inspector-command', (event) => {
    if (framed) return;
    handleInspectorCommand(event?.detail);
  });

  window.addEventListener('madstation:developer-debug-settings', (event) => {
    const detail = event && event.detail && typeof event.detail === 'object' ? event.detail : {};
    applySettings(detail.settings || detail, { persist: !framed });
  });

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (!message || typeof message !== 'object') return;
    if (framed && event.source === window.parent && expectedChannel && message.channel === expectedChannel && message.type === 'developer-debug-settings') {
      applySettings(message.settings, { persist: false });
      return;
    }
    if (framed && event.source === window.parent && expectedChannel && message.channel === expectedChannel && message.type === 'developer-debug-inspector-command') {
      handleInspectorCommand(message.command || message);
      return;
    }
    // Only the active, selected built-in theme iframe can publish inspector data to the
    // native window. This prevents stale/hidden frames from replacing the current hover.
    if (!framed) acceptActiveFrameSnapshot(event, message);
  });

  window.addEventListener('pointerover', onPointerOver, { capture: true, passive: true });
  window.addEventListener('pointermove', onPointerMove, { capture: true, passive: true });
  window.addEventListener('contextmenu', onElementContextMenu, { capture: true });
  window.addEventListener('pointerdown', onPointerDownDismissContextMenu, { capture: true, passive: true });
  window.addEventListener('click', onClickCapture, { capture: true, passive: true });
  window.addEventListener('keydown', (event) => {
    if (contextMenu && event.key === 'Escape') {
      event.preventDefault();
      closeElementContextMenu();
    }
  }, { capture: true });
  window.addEventListener('resize', onResizeOrScroll, { passive: true });
  window.addEventListener('scroll', onResizeOrScroll, { passive: true, capture: true });
  // Keep the host inspector scoped to the visible workspace. Settings class changes
  // are also observed by the existing DOM observer; these lifecycle events cover body
  // workspace/theme changes that aren't class mutations.
  for (const eventName of ['mad:workspace-view-updated', 'madstation:settings-closed']) {
    document.addEventListener(eventName, () => { closeElementContextMenu(); refreshHudVisibility(); scheduleRefresh(); });
  }
  for (const eventName of ['madstation:homepage-changed', 'madstation:homepage-fallback']) {
    window.addEventListener(eventName, () => { closeElementContextMenu(); refreshHudVisibility(); scheduleRefresh(); });
  }
  window.addEventListener('load', () => { if (settings.enabled) scheduleRefresh(); }, { once: true });

  if (!framed) settings = readSavedSettings();
  setRootClasses();
  window.MadStationDeveloperDebug = Object.freeze({
    getSettings: () => ({ ...settings }),
    applySettings: (value) => applySettings(value, { persist: !framed }),
    reset: () => emergencyResetDebugMode(),
    describeElement,
    getInspectorSnapshot: () => ({ status: 'active', updatedAt: Date.now(), page: currentPageSnapshot(), stats: { ...lastPageStats }, hovered: snapshotElement(hoveredElement), hitTest: settings.hitTest ? hitTestSnapshot() : [], lastClick: settings.clickTrace ? lastClickData : null, hiddenSamples: [...latestHiddenSamples], overflowSamples: [...latestOverflowSamples], elementExplorer: latestElementExplorer, debugHiddenElements: listDebugHiddenElements(), contextSelection: lastContextSelection }),
  });
})();

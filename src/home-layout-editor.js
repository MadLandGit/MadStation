// Mad Station — constrained Home drag-and-drop layout editor
// ---------------------------------------------------------------------------
// Placement rules are intentional: companion cards reorder vertically in the
// left rail, the single mini app above AI Hub stays fixed, and widgets move freely
// inside their bounded canvas. The AI Hub core is fixed. The editor never
// reparents React-owned DOM; placement is persisted through the owning registries.
(function () {
  'use strict';

  const KINDS = ['companions', 'miniApps', 'widgets'];
  const API_BY_KIND = {
    companions: () => window.MadHomeApps,
    miniApps: () => window.MadHomeMiniApps,
    widgets: () => window.MadHomeWidgets,
  };
  const ZONE_LABELS = {
    core: 'AI HUB · FIXED',
    widgets: 'WIDGETS · FREE POSITION',
  };

  let screen = null;
  let stage = null;
  let button = null;
  let customizeButton = null;
  let settingsButton = null;
  let bar = null;
  let status = null;
  let snapshot = null;
  let dragging = null;
  let widgetPreview = null;
  let companionArrangeWorkspace = null;
  let companionPointerDrag = null;
  let companionDropTarget = null;
  let zones = [];
  let resizeObserver = null;
  let ignoreClick = null;
  let active = false;
  let suppressWidgetPositionEvents = false;

  function $(selector, root) { return (root || document).querySelector(selector); }
  function all(selector, root) { return [...(root || document).querySelectorAll(selector)]; }

  function registryList(kind) {
    return API_BY_KIND[kind]?.()?.list?.() || [];
  }

  function currentOrder(kind) {
    return registryList(kind).map((item) => String(item.id));
  }

  function orderSnapshot() {
    const widgetCanvas = $('#homeWidgets');
    return {
      orders: Object.fromEntries(KINDS.map((kind) => [kind, currentOrder(kind)])),
      widgetPositions: window.MadHomeCustomizer?.getWidgetPositions?.() || {},
      widgetLayout: widgetCanvas?.dataset.layout || '',
    };
  }

  function itemId(kind, element) {
    if (!element || !kind) return '';
    return String(kind === 'widgets' ? element.dataset.widgetId || '' : element.dataset.appId || '');
  }

  function addWidgetHandles() {
    all('#homeWidgets .home-widget').forEach((widget) => {
      const header = $('.home-widget-heading', widget);
      if (!header || $('.home-layout-widget-handle', header)) return;
      const handle = document.createElement('button');
      handle.className = 'home-layout-widget-handle';
      handle.type = 'button';
      // Layout editing uses Pointer Events, not native HTML drag-and-drop.
      // Native drag suppresses pointer/click delivery and can strand the editor.
      handle.draggable = false;
      handle.dataset.homeLayoutDragHandle = 'widgets';
      handle.setAttribute('aria-label', `Drag ${widget.getAttribute('aria-label') || 'widget'} to reorder`);
      handle.title = 'Drag to reorder this widget';
      handle.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M8 5h.01M16 5h.01M8 12h.01M16 12h.01M8 19h.01M16 19h.01" stroke="currentColor" stroke-width="3" stroke-linecap="round" fill="none"/></svg>';
      header.appendChild(handle);
    });
  }

  function removeWidgetHandles() {
    all('.home-layout-widget-handle').forEach((handle) => handle.remove());
  }

  function setDraggable(enabled) {
    // Companion cards are never dragged in-place. Arrangement uses detached
    // draft rows, so a gesture cannot move or animate React-owned Home cards.
    all('#homeAppsReactMount .home-module[data-app-id]:not(.home-module--more)').forEach((element) => {
      element.draggable = false;
      element.removeAttribute('draggable');
      element.classList.remove('home-layout-draggable', 'is-layout-dragging', 'is-layout-drag-source', 'is-layout-reorder-shifted');
      element.style.removeProperty('--home-layout-shift-x');
      element.style.removeProperty('--home-layout-shift-y');
      if (element.getAttribute('aria-describedby') === 'homeLayoutEditorInstructions') element.removeAttribute('aria-describedby');
      element.removeAttribute('aria-grabbed');
    });
    // The mini-app lane (currently one mini app) is deliberately fixed.
    all('#homeMiniApps .home-mini-app-tile[data-app-id]').forEach((element) => {
      element.draggable = false;
      element.removeAttribute('draggable');
      element.classList.remove('home-layout-draggable', 'is-layout-dragging', 'is-layout-reorder-shifted');
      element.style.removeProperty('--home-layout-shift-x');
      element.style.removeProperty('--home-layout-shift-y');
      if (element.getAttribute('aria-describedby') === 'homeLayoutEditorInstructions') element.removeAttribute('aria-describedby');
      element.removeAttribute('aria-grabbed');
    });
    all('.home-layout-widget-handle').forEach((handle) => {
      handle.draggable = false;
      handle.removeAttribute('draggable');
      handle.tabIndex = enabled ? 0 : -1;
    });
  }

  function zoneRect(kind) {
    const core = $('.home-core');
    const widgetCanvas = $('#homeWidgets');
    const coreRect = core?.getBoundingClientRect();
    if (kind === 'core' && coreRect) {
      return { left: coreRect.left - 6, top: coreRect.top - 6, right: coreRect.right + 6, bottom: coreRect.bottom + 6 };
    }
    if (kind === 'widgets' && widgetCanvas && !widgetCanvas.classList.contains('is-empty')) {
      const rect = widgetCanvas.getBoundingClientRect();
      // Keep the green drop boundary inside the actual launcher window. The
      // desktop widget canvas can reach the right side of the window, but the
      // outline itself must never bleed past the app's inner edge.
      const screenRect = screen?.getBoundingClientRect();
      const inset = 10;
      const minLeft = screenRect ? screenRect.left + inset : inset;
      const minTop = screenRect ? screenRect.top + inset : inset;
      const maxRight = screenRect ? screenRect.right - inset : window.innerWidth - inset;
      const maxBottom = screenRect ? screenRect.bottom - inset : window.innerHeight - inset;
      return {
        left: Math.max(rect.left + 2, minLeft),
        top: Math.max(rect.top + 2, minTop),
        right: Math.min(rect.right - 2, maxRight),
        bottom: Math.min(rect.bottom - 2, maxBottom),
      };
    }
    return null;
  }

  function createZone(kind, stageRect) {
    const rect = zoneRect(kind);
    if (!rect) return null;
    const zone = document.createElement('div');
    zone.className = 'home-layout-zone';
    zone.dataset.homeLayoutZone = kind;
    zone.dataset.kind = kind;
    zone.setAttribute('aria-hidden', 'true');
    zone.style.left = `${rect.left - stageRect.left}px`;
    zone.style.top = `${rect.top - stageRect.top}px`;
    zone.style.width = `${Math.max(30, rect.right - rect.left)}px`;
    zone.style.height = `${Math.max(28, rect.bottom - rect.top)}px`;
    const label = document.createElement('span');
    label.className = 'home-layout-zone-label';
    label.textContent = ZONE_LABELS[kind] || kind;
    zone.appendChild(label);
    stage.appendChild(zone);
    return { kind, rect, element: zone };
  }

  const WIDGET_SIZES = {
    small: { width: 260, height: 150 },
    medium: { width: 300, height: 220 },
    large: { width: 340, height: 280 },
  };
  const WIDGET_GAP = 14;

  function widgetCanvas() { return $('#homeWidgets'); }

  function widgetSize(element) {
    const preset = WIDGET_SIZES[element?.dataset?.size] || WIDGET_SIZES.medium;
    // Position calculations must not infer size from the canvas or a flex-stretched
    // measurement. The saved small/medium/large preset is the size source of truth.
    const canvasWidth = element?.parentElement?.clientWidth || 0;
    const availableWidth = canvasWidth > 0 ? Math.max(1, canvasWidth - 8) : preset.width;
    return { width: Math.max(1, Math.min(preset.width, availableWidth)), height: preset.height };
  }

  function storedWidgetPositions() {
    return window.MadHomeCustomizer?.getWidgetPositions?.() || {};
  }

  function setWidgetCanvasLayout(enabled) {
    const canvas = widgetCanvas();
    if (!canvas) return;
    if (enabled) {
      canvas.dataset.layout = 'free';
      // Free coordinates must use the same widget-only canvas during editing,
      // after Done, and on startup; do not change Home's stage/grid geometry.
      stage?.setAttribute('data-home-widget-canvas-expanded', 'true');
    } else {
      delete canvas.dataset.layout;
      stage?.removeAttribute('data-home-widget-canvas-expanded');
      all('.home-widget[data-widget-id]', canvas).forEach((widget) => {
        widget.style.removeProperty('left');
        widget.style.removeProperty('top');
        widget.style.removeProperty('z-index');
      });
    }
  }

  function clamp01(value) { return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)); }

  function overlaps(left, top, size, placed, gap = WIDGET_GAP) {
    return placed.some((item) => left < item.left + item.width + gap
      && left + size.width + gap > item.left
      && top < item.top + item.height + gap
      && top + size.height + gap > item.top);
  }

  function firstOpenWidgetPosition(size, wanted, canvasWidth, canvasHeight, placed) {
    const maxLeft = Math.max(0, canvasWidth - size.width - 4);
    const maxTop = Math.max(0, canvasHeight - size.height - 4);
    const wantedLeft = Math.max(0, Math.min(maxLeft, wanted.left));
    const wantedTop = Math.max(0, Math.min(maxTop, wanted.top));
    if (!overlaps(wantedLeft, wantedTop, size, placed)) return { left: wantedLeft, top: wantedTop };

    // Keep widgets from covering one another when a saved desktop arrangement is
    // opened in a smaller window. Choose the nearest open snap point.
    const step = 18;
    let best = null;
    let bestDistance = Infinity;
    for (let top = 0; top <= maxTop; top += step) {
      for (let left = 0; left <= maxLeft; left += step) {
        if (overlaps(left, top, size, placed)) continue;
        const distance = (left - wantedLeft) ** 2 + (top - wantedTop) ** 2;
        if (distance < bestDistance) { best = { left, top }; bestDistance = distance; }
      }
    }
    if (best) return best;

    // If the viewport cannot fit another tile, place it below the current rows.
    // The canvas remains scrollable, so the widget can still be reached and moved.
    const top = placed.reduce((bottom, item) => Math.max(bottom, item.top + item.height), 0) + WIDGET_GAP;
    return { left: 0, top };
  }

  function defaultWidgetPositions(canvas, widgets, current) {
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    const result = { ...current };
    let cursorX = 0;
    let cursorY = 0;
    let rowHeight = 0;
    widgets.forEach((widget) => {
      const id = itemId('widgets', widget);
      if (!id || result[id]) return;
      const size = widgetSize(widget);
      const tileWidth = Math.min(size.width, Math.max(1, width - 8));
      if (cursorX > 0 && cursorX + tileWidth > width) {
        cursorX = 0;
        cursorY += rowHeight + WIDGET_GAP;
        rowHeight = 0;
      }
      const maxLeft = Math.max(1, width - tileWidth - 4);
      const maxTop = Math.max(1, height - size.height - 4);
      result[id] = { x: clamp01(cursorX / maxLeft), y: clamp01(cursorY / maxTop) };
      cursorX += tileWidth + WIDGET_GAP;
      rowHeight = Math.max(rowHeight, size.height);
    });
    return result;
  }

  function applyWidgetPositions() {
    const canvas = widgetCanvas();
    if (!canvas || canvas.classList.contains('is-empty') || (!active && canvas.dataset.layout !== 'free')) return;
    const widgets = all('.home-widget[data-widget-id]', canvas);
    if (!widgets.length) return;
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    let positions = storedWidgetPositions();
    const missing = widgets.some((widget) => !positions[itemId('widgets', widget)]);
    if (missing) {
      positions = defaultWidgetPositions(canvas, widgets, positions);
      window.MadHomeCustomizer?.setWidgetPositions?.(positions);
    }

    const placed = [];
    widgets.forEach((widget) => {
      const id = itemId('widgets', widget);
      const size = widgetSize(widget);
      const position = positions[id] || { x: 0, y: 0 };
      const maxLeft = Math.max(0, width - size.width - 4);
      const maxTop = Math.max(0, height - size.height - 4);
      const wanted = { left: clamp01(position.x) * maxLeft, top: clamp01(position.y) * maxTop };
      const open = firstOpenWidgetPosition(size, wanted, width, height, placed);
      widget.style.left = `${Math.round(open.left)}px`;
      widget.style.top = `${Math.round(open.top)}px`;
      widget.style.zIndex = String(placed.length + 1);
      placed.push({ left: open.left, top: open.top, width: size.width, height: size.height });
    });
  }

  function widgetDropPlacement(id, event) {
    const canvas = widgetCanvas();
    const widget = all('.home-widget[data-widget-id]', canvas).find((element) => itemId('widgets', element) === id);
    if (!canvas || !widget) return null;
    const rect = canvas.getBoundingClientRect();
    const size = widgetSize(widget);
    const maxLeft = Math.max(0, canvas.clientWidth - size.width - 4);
    const maxTop = Math.max(0, canvas.clientHeight - size.height - 4);
    const wantedLeft = Math.max(0, Math.min(maxLeft, event.clientX - rect.left + canvas.scrollLeft - (dragging?.offsetX || 0)));
    const wantedTop = Math.max(0, Math.min(maxTop, event.clientY - rect.top + canvas.scrollTop - (dragging?.offsetY || 0)));
    const others = all('.home-widget[data-widget-id]', canvas)
      .filter((element) => element !== widget)
      .map((element) => ({
        left: Number.isFinite(parseFloat(element.style.left)) ? parseFloat(element.style.left) : element.offsetLeft,
        top: Number.isFinite(parseFloat(element.style.top)) ? parseFloat(element.style.top) : element.offsetTop,
        width: widgetSize(element).width,
        height: widgetSize(element).height,
      }));
    const open = firstOpenWidgetPosition(size, { left: wantedLeft, top: wantedTop }, canvas.clientWidth, canvas.clientHeight, others);
    const x = maxLeft > 0 ? clamp01(open.left / maxLeft) : 0;
    const y = maxTop > 0 ? clamp01(open.top / maxTop) : 0;
    return { canvas, widget, size, open, maxLeft, maxTop, x, y };
  }

  function clearWidgetPreview() {
    const hadPreview = Boolean(widgetPreview);
    widgetPreview?.remove();
    widgetPreview = null;
    // Home Core resolves the moving widget to its preview while dragging; redraw
    // immediately when that preview disappears so the line returns to the real tile.
    if (hadPreview) window.MadHomeCore?.refresh();
  }

  function ensureWidgetPreview(sourceWidget) {
    if (widgetPreview?.isConnected) return widgetPreview;
    clearWidgetPreview();
    widgetPreview = sourceWidget.cloneNode(true);
    widgetPreview.classList.remove('is-layout-dragging');
    widgetPreview.classList.add('home-layout-widget-preview');
    widgetPreview.removeAttribute('data-widget-id');
    widgetPreview.removeAttribute('id');
    widgetPreview.removeAttribute('aria-grabbed');
    widgetPreview.setAttribute('aria-hidden', 'true');
    widgetPreview.draggable = false;
    all('[id]', widgetPreview).forEach((element) => element.removeAttribute('id'));
    all('button, a, input, select, textarea, [tabindex]', widgetPreview).forEach((element) => {
      element.setAttribute('tabindex', '-1');
      element.setAttribute('aria-hidden', 'true');
      if ('disabled' in element) element.disabled = true;
    });
    $('.home-layout-widget-handle', widgetPreview)?.remove();
    const badge = document.createElement('span');
    badge.className = 'home-layout-widget-preview-label';
    badge.textContent = 'PREVIEW';
    widgetPreview.appendChild(badge);
    return widgetPreview;
  }

  function updateWidgetPreview(event) {
    if (dragging?.kind !== 'widgets') return;
    const placement = widgetDropPlacement(dragging.id, event);
    if (!placement) return;
    const preview = ensureWidgetPreview(placement.widget);
    if (preview.parentElement !== placement.canvas) placement.canvas.appendChild(preview);
    preview.style.position = 'absolute';
    preview.style.left = `${Math.round(placement.open.left)}px`;
    preview.style.top = `${Math.round(placement.open.top)}px`;
    preview.style.width = `${placement.size.width}px`;
    preview.style.height = `${placement.size.height}px`;
    preview.style.maxWidth = 'none';
    preview.style.maxHeight = 'none';
    preview.style.minWidth = '0';
    preview.style.minHeight = '0';
    preview.style.flex = 'none';
    preview.style.margin = '0';
    preview.style.zIndex = '2147483000';
    preview.style.pointerEvents = 'none';
    // Signal lines use this same element as the connection source while the
    // widget is being dragged, so the wire tracks the visible ghost each frame.
    window.MadHomeCore?.refresh();
  }

  function placeWidgetAtDrop(id, event) {
    const placement = widgetDropPlacement(id, event);
    if (!placement) return false;
    const { x, y } = placement;
    const old = storedWidgetPositions()[id];
    const changed = !old || Math.abs(old.x - x) > 0.01 || Math.abs(old.y - y) > 0.01;
    if (!changed) return false;
    window.MadHomeCustomizer?.setWidgetPosition?.(id, x, y);
    applyWidgetPositions();
    window.requestAnimationFrame?.(drawZones);
    return true;
  }

  function drawZones() {
    if (!active || !stage) return;
    applyWidgetPositions();
    all('.home-layout-zone', stage).forEach((node) => node.remove());
    const stageRect = stage.getBoundingClientRect();
    // Hub companions have a dedicated bounded workspace and release-to-place
    // interaction. Only the fixed core and free-position widget canvas use zones.
    zones = ['core', 'widgets'].map((kind) => createZone(kind, stageRect)).filter(Boolean);
  }

  function zoneAtPoint(x, y) {
    // Re-measure on every move and especially on release. A cached outline can
    // become stale after Appearance returns, the rail scrolls, or responsive
    // layout settles; stale bounds made valid drops look like they were ignored.
    // The fixed AI Hub wins if any zone edges overlap by a few pixels.
    for (const kind of ['core', 'widgets']) {
      const zone = zones.find((candidate) => candidate.kind === kind);
      if (!zone) continue;
      const rect = zoneRect(kind);
      if (!rect || rect.right <= rect.left || rect.bottom <= rect.top) continue;
      zone.rect = rect;
      const stageRect = stage.getBoundingClientRect();
      zone.element.style.left = `${rect.left - stageRect.left}px`;
      zone.element.style.top = `${rect.top - stageRect.top}px`;
      zone.element.style.width = `${Math.max(30, rect.right - rect.left)}px`;
      zone.element.style.height = `${Math.max(28, rect.bottom - rect.top)}px`;
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return zone;
    }
    return null;
  }

  function clearDropHighlights() {
    zones.forEach((zone) => zone.element.classList.remove('is-drop-active', 'is-drop-invalid'));
    all('.is-layout-drop-target', stage).forEach((node) => node.classList.remove('is-layout-drop-target'));
  }

  function updateStatus(message) {
    if (status) status.textContent = message;
  }

  function companionWorkspaceList() {
    return companionArrangeWorkspace?.querySelector('.home-companion-arrange-list') || null;
  }

  function companionWorkspaceItems() {
    return all('.home-companion-arrange-item[data-app-id]', companionWorkspaceList() || document);
  }

  function companionWorkspaceOrder() {
    return companionWorkspaceItems().map((element) => String(element.dataset.appId || '')).filter(Boolean);
  }

  function createCompanionArrangeWorkspace() {
    const tools = $('#homeApps');
    const mount = $('#homeAppsReactMount');
    if (!tools || !mount) return;
    if (!companionArrangeWorkspace || !companionArrangeWorkspace.isConnected) {
      companionArrangeWorkspace = document.createElement('section');
      companionArrangeWorkspace.className = 'home-companion-arrange-workspace';
      companionArrangeWorkspace.setAttribute('aria-label', 'Arrange Hub companions');
      companionArrangeWorkspace.innerHTML = [
        '<span class="home-companion-arrange-title">Hub companions</span>',
        '<div class="home-companion-arrange-help">Drag a row, release it in the new position, then choose Done to save. Cancel discards the draft.</div>',
        '<div class="home-companion-arrange-list" role="list" aria-label="Companion app order"></div>',
      ].join('');
      tools.appendChild(companionArrangeWorkspace);
      companionArrangeWorkspace.addEventListener('pointerdown', onCompanionPointerDown);
      companionArrangeWorkspace.addEventListener('keydown', onCompanionKeyDown);
      window.addEventListener('pointermove', onCompanionPointerMove, true);
      window.addEventListener('pointerup', onCompanionPointerUp, true);
    }
    mount.setAttribute('aria-hidden', 'true');
    mount.dataset.homeCompanionArrangeSource = 'true';
    syncCompanionArrangeWorkspace();
  }

  function syncCompanionArrangeWorkspace() {
    if (!active || !companionArrangeWorkspace?.isConnected || companionPointerDrag) return;
    const list = companionWorkspaceList();
    if (!list) return;
    const sourceCards = all('#homeAppsReactMount .home-module[data-app-id]:not(.home-module--more)');
    const sourceById = new Map(sourceCards.map((card) => [String(card.dataset.appId || ''), card]).filter(([id]) => id));
    const sourceOrder = sourceCards.map((card) => String(card.dataset.appId || '')).filter((id) => sourceById.has(id));
    const existingOrder = companionWorkspaceOrder();
    // Keep the user's unsaved draft order if React refreshes the source tree; new
    // enabled apps are appended in their registry order rather than lost.
    const preferred = existingOrder.filter((id) => sourceById.has(id));
    const seen = new Set(preferred);
    const order = [...preferred, ...sourceOrder.filter((id) => !seen.has(id))];
    const nodes = order.map((id) => {
      const source = sourceById.get(id);
      if (!source) return null;
      const card = source.cloneNode(true);
      card.classList.remove('home-layout-draggable', 'is-layout-dragging', 'is-layout-drag-source', 'is-layout-reorder-shifted', 'is-layout-drop-target');
      card.classList.add('home-companion-arrange-item');
      card.dataset.appId = id;
      // Native HTML dragging is intentionally disabled. It creates a browser-owned
      // pointer-following drag image; this workspace instead moves a row only when
      // the captured pointer is released over a destination.
      card.draggable = false;
      card.setAttribute('draggable', 'false');
      card.setAttribute('role', 'listitem');
      card.setAttribute('aria-label', `Reorder ${source.title || id}`);
      card.removeAttribute('aria-describedby');
      card.removeAttribute('aria-grabbed');
      card.style.removeProperty('--home-layout-shift-x');
      card.style.removeProperty('--home-layout-shift-y');
      card.style.removeProperty('translate');
      card.style.removeProperty('transform');
      card.style.removeProperty('left');
      card.style.removeProperty('top');
      all('[id]', card).forEach((node) => node.removeAttribute('id'));
      const grip = document.createElement('span');
      grip.className = 'home-companion-arrange-grip';
      grip.setAttribute('aria-hidden', 'true');
      grip.innerHTML = '<svg viewBox="0 0 24 24" focusable="false"><circle cx="8" cy="5" r="1.2"></circle><circle cx="16" cy="5" r="1.2"></circle><circle cx="8" cy="12" r="1.2"></circle><circle cx="16" cy="12" r="1.2"></circle><circle cx="8" cy="19" r="1.2"></circle><circle cx="16" cy="19" r="1.2"></circle></svg>';
      $('.home-module-in', card)?.appendChild(grip);
      return card;
    }).filter(Boolean);
    list.replaceChildren(...nodes);
    list.classList.toggle('is-empty', nodes.length === 0);
  }

  function sameOrder(left, right) {
    return left.length === right.length && left.every((id, index) => id === right[index]);
  }

  function currentVisibleCompanionOrder() {
    return registryList('companions').filter((item) => item.enabled !== false).map((item) => String(item.id));
  }

  function updateCompanionDropTarget(position) {
    companionWorkspaceItems().forEach((item) => item.classList.remove('is-companion-drop-target', 'is-companion-drop-after'));
    companionDropTarget = position || null;
    if (!position?.item || position.item === companionPointerDrag?.item) return;
    position.item.classList.add(position.after ? 'is-companion-drop-after' : 'is-companion-drop-target');
  }

  function companionDropPositionAt(x, y) {
    const list = companionWorkspaceList();
    if (!list) return null;
    const listRect = list.getBoundingClientRect();
    if (x < listRect.left || x > listRect.right || y < listRect.top || y > listRect.bottom) return null;
    const moving = companionPointerDrag?.item;
    const items = companionWorkspaceItems().filter((item) => item !== moving);
    for (const item of items) {
      const rect = item.getBoundingClientRect();
      if (y < rect.top + rect.height / 2) return { item, after: false };
    }
    return items.length ? { item: items[items.length - 1], after: true } : { item: null, after: true };
  }

  function onCompanionPointerDown(event) {
    const item = event.target?.closest?.('.home-companion-arrange-item[data-app-id]');
    if (!active || event.button !== 0 || event.isPrimary === false || !item || !companionArrangeWorkspace?.contains(item)) return;
    if (companionPointerDrag) return;
    event.preventDefault();
    const pointerId = Number.isFinite(event.pointerId) ? event.pointerId : 1;
    companionPointerDrag = {
      item,
      pointerId,
      startX: event.clientX,
      startY: event.clientY,
      started: false,
      position: null,
    };
    try { item.setPointerCapture?.(pointerId); } catch (_) { /* fallback window listeners still receive release */ }
    updateStatus(`Moving ${item.title || item.dataset.appId}. Release inside this panel to choose its new position.`);
  }

  function onCompanionPointerMove(event) {
    const drag = companionPointerDrag;
    if (!active || !drag || event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.started && Math.hypot(dx, dy) < 5) return;
    drag.started = true;
    event.preventDefault?.();
    drag.item.classList.add('is-companion-dragging');
    const position = companionDropPositionAt(event.clientX, event.clientY);
    drag.position = position;
    updateCompanionDropTarget(position);
  }

  function releaseCompanionPointer(drag) {
    drag?.item?.classList.remove('is-companion-dragging');
    // Reset state before release because Chromium can deliver lostpointercapture
    // synchronously when releasePointerCapture is called.
    companionPointerDrag = null;
    updateCompanionDropTarget(null);
    try {
      if (drag?.item?.hasPointerCapture?.(drag.pointerId)) drag.item.releasePointerCapture(drag.pointerId);
    } catch (_) { /* pointer may already have been implicitly released */ }
  }

  function onCompanionPointerUp(event) {
    const drag = companionPointerDrag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const position = drag.started ? companionDropPositionAt(event.clientX, event.clientY) : null;
    const list = companionWorkspaceList();
    const validListDrop = position !== null && list?.isConnected;
    if (drag.started && validListDrop && list) {
      if (position.item && position.item !== drag.item) {
        list.insertBefore(drag.item, position.after ? position.item.nextSibling : position.item);
      } else if (!position.item) {
        list.appendChild(drag.item);
      }
      drag.item.focus?.({ preventScroll: true });
      updateStatus('Companion order updated. Choose Done to save it, or Cancel to discard it.');
      window.MadHomeCore?.refresh();
    } else if (drag.started) {
      updateStatus('Move cancelled. Release inside the Hub Companions panel to reposition an app.');
    }
    releaseCompanionPointer(drag);
    if (drag.started && validListDrop) event.preventDefault?.();
  }

  function onCompanionPointerCancel(event) {
    if (!companionPointerDrag || event.pointerId !== companionPointerDrag.pointerId) return;
    releaseCompanionPointer(companionPointerDrag);
    updateStatus('Move cancelled. The companion order was not changed.');
  }

  function onCompanionPointerLostCapture(event) {
    if (!companionPointerDrag || event.pointerId !== companionPointerDrag.pointerId) return;
    releaseCompanionPointer(companionPointerDrag);
    updateStatus('Move cancelled because pointer capture was interrupted. The order was not changed.');
  }

  function onCompanionKeyDown(event) {
    const item = event.target?.closest?.('.home-companion-arrange-item[data-app-id]');
    if (!active || !item || !event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    const list = companionWorkspaceList();
    if (!list || !list.contains(item)) return;
    const sibling = event.key === 'ArrowUp' ? item.previousElementSibling : item.nextElementSibling;
    if (!sibling) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'ArrowUp') list.insertBefore(item, sibling);
    else list.insertBefore(sibling, item);
    updateStatus('Companion order updated. Choose Done to save it, or Cancel to discard it.');
    window.MadHomeCore?.refresh();
    item.focus({ preventScroll: true });
  }

  function commitCompanionWorkspaceOrder() {
    if (!companionArrangeWorkspace?.isConnected) return true;
    const draft = companionWorkspaceOrder();
    const registry = registryList('companions');
    const visibleIds = registry.filter((item) => item.enabled !== false).map((item) => String(item.id));
    const draftSet = new Set(draft);
    if (draft.length !== visibleIds.length || draftSet.size !== draft.length || visibleIds.some((id) => !draftSet.has(id))) return false;
    const visibleSet = new Set(visibleIds);
    let cursor = 0;
    const current = registry.map((item) => String(item.id));
    const next = current.map((id) => visibleSet.has(id) ? draft[cursor++] : id);
    if (sameOrder(current, next)) return true;
    return window.MadHomeCustomizer?.reorder?.('companions', next) === true;
  }

  function destroyCompanionArrangeWorkspace() {
    const unfinished = companionPointerDrag;
    releaseCompanionPointer(unfinished);
    companionArrangeWorkspace?.removeEventListener('pointerdown', onCompanionPointerDown);
    companionArrangeWorkspace?.removeEventListener('keydown', onCompanionKeyDown);
    window.removeEventListener('pointermove', onCompanionPointerMove, true);
    window.removeEventListener('pointerup', onCompanionPointerUp, true);
    companionArrangeWorkspace?.remove();
    companionArrangeWorkspace = null;
    const mount = $('#homeAppsReactMount');
    mount?.removeAttribute('aria-hidden');
    if (mount) delete mount.dataset.homeCompanionArrangeSource;
  }

  const POINTER_DRAG_THRESHOLD = 4;

  function startPointerDrag(event) {
    // The pointer-based editor is intentionally reserved for widgets, which have
    // an explicit handle and a bounded free-position canvas. Companion apps use
    // native drag/drop inside their dedicated workspace instead.
    if (!active || event.button !== 0 || event.isPrimary === false || dragging) return;
    const target = event.target;
    const widgetHandle = target?.closest?.('.home-layout-widget-handle');
    if (!widgetHandle) return;
    const element = widgetHandle.closest('.home-widget[data-widget-id]');
    const kind = 'widgets';
    const id = itemId(kind, element);
    if (!element || !id) return;
    event.preventDefault();

    const rect = element.getBoundingClientRect();
    dragging = {
      kind, id, element, pointerId: event.pointerId, pointerType: event.pointerType || 'mouse',
      startX: event.clientX, startY: event.clientY,
      offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top,
      moved: false, captureElement: element, pointerCaptured: false,
    };
    try {
      if (typeof element.setPointerCapture === 'function' && Number.isFinite(event.pointerId)) {
        element.setPointerCapture(event.pointerId);
        dragging.pointerCaptured = typeof element.hasPointerCapture === 'function'
          ? element.hasPointerCapture(event.pointerId)
          : true;
      }
    } catch (_) {
      dragging.pointerCaptured = false;
    }
    element.classList.add('is-layout-dragging');
    element.setAttribute('aria-grabbed', 'true');
    clearDropHighlights();
    updateStatus(`Grabbed ${element.getAttribute('aria-label') || element.title || id}. Release inside the green widget area to place it.`);
  }

  function clearPreviewForInvalidDrop(zone) {
    clearWidgetPreview();
    clearDropHighlights();
    if (zone?.element) zone.element.classList.add('is-drop-invalid');
    updateStatus(zone?.kind === 'core'
      ? 'AI Hub is fixed. Return the widget to the green area.'
      : 'Widgets can only be placed inside their outlined area.');
  }

  function onPointerMove(event) {
    if (!active || !dragging || event.pointerId !== dragging.pointerId) return;
    const dx = event.clientX - dragging.startX;
    const dy = event.clientY - dragging.startY;
    if (!dragging.moved && Math.hypot(dx, dy) < POINTER_DRAG_THRESHOLD) return;
    dragging.moved = true;
    event.preventDefault();
    const zone = zoneAtPoint(event.clientX, event.clientY);
    clearDropHighlights();
    if (!zone || zone.kind !== 'widgets') {
      clearPreviewForInvalidDrop(zone);
      return;
    }
    zone.element.classList.add('is-drop-active');
    updateWidgetPreview(event);
    updateStatus('Widget preview follows your pointer. Release to save, or release outside the green zone to cancel.');
  }

  function finishPointerDrag(event, cancelled = false) {
    if (!dragging || (event && event.pointerId !== dragging.pointerId)) return;
    const current = dragging;
    if (cancelled || !current.moved) {
      endDrag();
      return;
    }
    const zone = zoneAtPoint(event.clientX, event.clientY);
    if (!zone || zone.kind !== 'widgets') {
      clearPreviewForInvalidDrop(zone);
      endDrag();
      return;
    }
    const moved = placeWidgetAtDrop(current.id, event);
    ignoreClick = { kind: 'widgets', id: current.id, until: Date.now() + 700 };
    updateStatus(moved
      ? 'Widget position saved on this device.'
      : 'That widget is already at that position or no free spot is available.');
    endDrag();
  }

  function onPointerUp(event) {
    if (!dragging || event.pointerId !== dragging.pointerId) return;
    finishPointerDrag(event, false);
  }

  function onMouseUpFallback(event) {
    // Electron/Chromium can occasionally lose PointerEvent release on a native
    // surface boundary. Use mouseup as a final settle path for both editors.
    if (companionPointerDrag && event.button === 0) {
      onCompanionPointerUp({
        pointerId: companionPointerDrag.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        preventDefault() {},
      });
    }
    if (!dragging || dragging.pointerType !== 'mouse') return;
    finishPointerDrag({
      pointerId: dragging.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
    }, false);
  }

  function onPointerCancel(event) {
    if (dragging && event.pointerId === dragging.pointerId) finishPointerDrag(event, true);
    if (companionPointerDrag && event.pointerId === companionPointerDrag.pointerId) onCompanionPointerCancel(event);
  }

  function onLostPointerCapture(event) {
    if (dragging && event.pointerId === dragging.pointerId) {
      // Unexpected widget capture loss cancels the unfinished gesture and clears its preview.
      finishPointerDrag(event, true);
    }
    if (companionPointerDrag && event.pointerId === companionPointerDrag.pointerId) onCompanionPointerLostCapture(event);
  }

  function endDrag() {
    const endedDrag = dragging;
    // Clear gesture state before releasing capture: Chromium may asynchronously
    // emit lostpointercapture as part of normal teardown.
    dragging = null;
    if (endedDrag?.element) {
      endedDrag.element.classList.remove('is-layout-dragging', 'is-layout-drag-source');
      endedDrag.element.removeAttribute('aria-grabbed');
    }
    if (endedDrag?.pointerCaptured && endedDrag.captureElement) {
      try {
        if (typeof endedDrag.captureElement.hasPointerCapture !== 'function'
          || endedDrag.captureElement.hasPointerCapture(endedDrag.pointerId)) {
          endedDrag.captureElement.releasePointerCapture?.(endedDrag.pointerId);
        }
      } catch (_) {
        // Pointer capture may already have been implicitly released by Chromium.
      }
    }
    clearWidgetPreview();
    clearDropHighlights();
    window.MadHomeCore?.refresh();
  }

  function onWindowBlur() {
    const hadWidgetDrag = Boolean(dragging);
    const hadCompanionDrag = Boolean(companionPointerDrag);
    if (hadWidgetDrag) endDrag();
    if (hadCompanionDrag) releaseCompanionPointer(companionPointerDrag);
    if (hadWidgetDrag || hadCompanionDrag) updateStatus('Drag cancelled because the pointer left the app window.');
  }

  function onClickCapture(event) {
    const target = event.target;
    if (ignoreClick) {
      if (Date.now() > ignoreClick.until) {
        ignoreClick = null;
      } else {
        const id = target?.closest?.('.home-widget[data-widget-id]')?.dataset?.widgetId
          || target?.closest?.('.home-mini-app-tile[data-app-id], #homeApps .home-module[data-app-id]')?.dataset?.appId;
        const kind = target?.closest?.('.home-widget[data-widget-id]') ? 'widgets'
          : target?.closest?.('.home-mini-app-tile') ? 'miniApps' : 'companions';
        if (id && id === ignoreClick.id && kind === ignoreClick.kind) {
          event.preventDefault();
          event.stopImmediatePropagation();
          ignoreClick = null;
          return;
        }
      }
    }
    // Arrange is a layout operation, never an app-launch gesture. The fixed top
    // mini app is not draggable and its launch is suppressed until Arrange ends.
    if (active && target?.closest?.('#homeAppsReactMount .home-module[data-app-id], #homeMiniApps .home-mini-app-tile[data-app-id]')) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }

  function enterArrangeMode() {
    if (active || !stage || !window.MadHomeCustomizer?.reorder) return;
    snapshot = orderSnapshot();
    active = true;
    window.MadHomeApps?.closeMore?.();
    if (customizeButton) customizeButton.disabled = true;
    if (settingsButton) settingsButton.disabled = true;
    screen.dataset.homeArranging = 'true';
    stage.dataset.homeArranging = 'true';
    button.setAttribute('aria-pressed', 'true');
    button.classList.add('is-active');
    bar.hidden = false;
    setWidgetCanvasLayout(true);
    addWidgetHandles();
    setDraggable(true);
    stage.classList.add('is-home-arranging');
    createCompanionArrangeWorkspace();
    // Rebuild lets the companion system expose every enabled app before the
    // workspace finalizes its copy of the source cards (including More Apps).
    window.MadHomeApps?.rebuild?.();
    applyWidgetPositions();
    drawZones();
    updateStatus('Drag apps inside the Hub Companions panel. Choose Done to save the new order or Cancel to discard it. The top mini app and AI Hub stay fixed; widgets move inside their green canvas.');
    window.MadHomeCore?.refresh();
  }

  function leaveArrangeMode(restore) {
    if (!active) return;
    // Companion order is a draft owned by the isolated workspace. Commit it once
    // from Done; Cancel never mutates the companion registry in the first place.
    if (!restore && !commitCompanionWorkspaceOrder()) {
      updateStatus('Could not save the companion order because the app list changed. The arrangement is still open; try Done again.');
      return;
    }
    const finishingDrag = dragging;
    dragging = null;
    if (finishingDrag?.element) {
      finishingDrag.element.classList.remove('is-layout-dragging', 'is-layout-drag-source');
      finishingDrag.element.removeAttribute('aria-grabbed');
    }
    if (restore && snapshot) {
      KINDS.forEach((kind) => window.MadHomeCustomizer?.reorder?.(kind, snapshot.orders[kind]));
      suppressWidgetPositionEvents = true;
      window.MadHomeCustomizer?.setWidgetPositions?.(snapshot.widgetPositions);
      suppressWidgetPositionEvents = false;
      if (snapshot.widgetLayout === 'free') {
        setWidgetCanvasLayout(true);
        applyWidgetPositions();
      } else {
        setWidgetCanvasLayout(false);
      }
      updateStatus('Original layout restored.');
    } else if (widgetCanvas()?.dataset.layout === 'free') {
      applyWidgetPositions();
    }
    active = false;
    clearWidgetPreview();
    destroyCompanionArrangeWorkspace();
    screen.removeAttribute('data-home-arranging');
    stage.removeAttribute('data-home-arranging');
    stage.classList.remove('is-home-arranging');
    stage.style.removeProperty('--home-arrange-companion-row');
    window.MadHomeApps?.refresh?.();
    button.setAttribute('aria-pressed', 'false');
    button.classList.remove('is-active');
    if (customizeButton) customizeButton.disabled = false;
    if (settingsButton) settingsButton.disabled = false;
    bar.hidden = true;
    setDraggable(false);
    removeWidgetHandles();
    all('.home-layout-zone', stage).forEach((node) => node.remove());
    zones = [];
    snapshot = null;
    clearDropHighlights();
    window.requestAnimationFrame?.(() => {
      if (widgetCanvas()?.dataset.layout === 'free') applyWidgetPositions();
      window.MadHomeCore?.refresh();
    });
    button.focus({ preventScroll: true });
  }

  function onKeyDown(event) {
    if (!active) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      leaveArrangeMode(true);
    } else if ((event.key === 'Enter' || event.key === ' ') && event.target === button) {
      event.preventDefault();
      leaveArrangeMode(false);
    }
  }

  function refreshForRegistryChange() {
    if (!active) {
      if (widgetCanvas()?.dataset.layout === 'free') applyWidgetPositions();
      return;
    }
    addWidgetHandles();
    setDraggable(true);
    syncCompanionArrangeWorkspace();
    window.requestAnimationFrame?.(() => { applyWidgetPositions(); drawZones(); syncCompanionArrangeWorkspace(); });
  }

  function initialize() {
    screen = $('#launcherScreen');
    stage = $('.home-stage');
    button = $('#homeArrangeBtn');
    customizeButton = $('#homeCustomizeBtn');
    settingsButton = $('#launcherSettingsBtn');
    bar = $('#homeLayoutEditorBar');
    status = $('#homeLayoutEditorStatus');
    if (!screen || !stage || !button || !bar || !status) return;
    // Restore user-arranged widget positions on startup. A saved free-layout must
    // opt into the widget-only extended canvas before positions are materialized.
    if (Object.keys(storedWidgetPositions()).length > 0 && widgetCanvas()) {
      setWidgetCanvasLayout(true);
      window.requestAnimationFrame?.(applyWidgetPositions);
    } else if (widgetCanvas()?.dataset.layout === 'free') {
      stage.setAttribute('data-home-widget-canvas-expanded', 'true');
      window.requestAnimationFrame?.(applyWidgetPositions);
    }
    const instructions = $('.home-layout-editor-copy span');
    if (instructions) instructions.id = 'homeLayoutEditorInstructions';

    button.addEventListener('click', () => active ? leaveArrangeMode(false) : enterArrangeMode());
    // Pointer events move widgets on the free-position canvas and reorder rows
    // inside the independent companion draft panel. Companion rows never follow
    // the pointer visually; they move only on pointer release.
    window.addEventListener('pointerdown', startPointerDrag, true);
    window.addEventListener('pointermove', onPointerMove, true);
    window.addEventListener('pointerup', onPointerUp, true);
    // Secondary mouse-only release path for Electron native-surface edge cases.
    window.addEventListener('mouseup', onMouseUpFallback, true);
    window.addEventListener('pointercancel', onPointerCancel, true);
    window.addEventListener('lostpointercapture', onLostPointerCapture, true);
    window.addEventListener('blur', onWindowBlur);
    $('#homeLayoutDoneBtn')?.addEventListener('click', (event) => {
      event.preventDefault();
      if (active) leaveArrangeMode(false);
    });
    $('#homeLayoutCancelBtn')?.addEventListener('click', (event) => {
      event.preventDefault();
      if (active) leaveArrangeMode(true);
    });
    document.addEventListener('click', onClickCapture, true);
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('madstation:settings-opening', () => { if (active) leaveArrangeMode(true); });
    document.addEventListener('mad:workspace-view-updated', (event) => {
      if (active && event.detail?.app && event.detail.app !== 'launcher') leaveArrangeMode(true);
    });
    document.addEventListener('mad:home-apps-built', refreshForRegistryChange);
    document.addEventListener('mad:home-mini-apps-built', refreshForRegistryChange);
    document.addEventListener('mad:home-widgets-built', refreshForRegistryChange);
    window.addEventListener('resize', () => { if (active || widgetCanvas()?.dataset.layout === 'free') applyWidgetPositions(); drawZones(); });
    window.addEventListener('orientationchange', () => { if (active || widgetCanvas()?.dataset.layout === 'free') applyWidgetPositions(); drawZones(); });
    document.addEventListener('mad:home-widget-positions-updated', () => {
      if (suppressWidgetPositionEvents) return;
      if (active || widgetCanvas()?.dataset.layout === 'free') applyWidgetPositions();
      drawZones();
    });
    if (typeof ResizeObserver === 'function') {
      resizeObserver = new ResizeObserver(() => drawZones());
      resizeObserver.observe(stage);
      ['#homeApps', '#homeMiniApps', '.home-core', '.home-side', '#homeWidgets'].forEach((selector) => {
        const node = $(selector);
        if (node) resizeObserver.observe(node);
      });
    }
  }

  window.MadHomeLayoutEditor = {
    enter: enterArrangeMode,
    done: () => leaveArrangeMode(false),
    cancel: () => leaveArrangeMode(true),
    // Home Core can connect the actual widget to its live drag preview without
    // assigning widget IDs to the cloned preview or confusing layout selectors.
    getWidgetConnectionElement(widget) {
      const id = itemId('widgets', widget);
      return active && dragging?.kind === 'widgets' && dragging.id === id && widgetPreview?.isConnected
        ? widgetPreview
        : widget;
    },
    get active() { return active; },
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();

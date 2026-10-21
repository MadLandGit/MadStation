// Mad Station — Home Core System
// ---------------------------------------------------------------------------
// The one shared coordinator for the independent home-screen systems.
// Each system owns its registry and rendering; Core owns discovery, resize
// coordination, hover/focus highlighting, and the shared animated signal lines.
(function () {
  'use strict';

  const systems = new Map();
  const hotIds = new Set();
  const NARROW_QUERY = '(max-width: 940px)';
  const SVG_NS = 'http://www.w3.org/2000/svg';
  let stage = null;
  let core = null;
  let links = null;
  let queued = false;
  let booted = false;

  function registerSystem(id, adapter) {
    const key = String(id || '').trim();
    if (!/^[a-z][a-z0-9-]*$/i.test(key)) throw new Error(`MadHomeCore.registerSystem: invalid id "${id}"`);
    if (!adapter || typeof adapter !== 'object') throw new Error('MadHomeCore.registerSystem: expected a system adapter');
    systems.set(key, { ...adapter, id: key });
    refresh();
    return systems.get(key);
  }

  function unregisterSystem(id) {
    const removed = systems.delete(String(id || ''));
    if (removed) refresh();
    return removed;
  }

  function listSystems() {
    return [...systems.values()].map((system) => ({ id: system.id, name: String(system.name || system.id) }));
  }

  function getSystem(id) { return systems.get(String(id || '')) || null; }

  function ensureNodes() {
    stage = document.querySelector('.home-stage');
    core = stage?.querySelector('.home-core') || null;
    if (!stage || !core) return false;
    links = stage.querySelector('.home-links');
    if (!links) {
      links = document.createElementNS(SVG_NS, 'svg');
      links.setAttribute('class', 'home-links');
      links.setAttribute('aria-hidden', 'true');
      stage.insertBefore(links, stage.firstChild);
    }
    return true;
  }

  function scheduleRefresh() {
    if (queued) return;
    queued = true;
    const schedule = typeof window.requestAnimationFrame === 'function'
      ? window.requestAnimationFrame.bind(window)
      : (fn) => window.setTimeout(fn, 0);
    schedule(() => { queued = false; drawLinks(); });
  }

  function refresh() { scheduleRefresh(); }

  function svgEl(name, attrs) {
    const node = document.createElementNS(SVG_NS, name);
    Object.entries(attrs || {}).forEach(([key, value]) => node.setAttribute(key, String(value)));
    return node;
  }

  function visibleElement(element) {
    return Boolean(element && element.isConnected && !element.classList.contains('is-off') && element.getClientRects().length);
  }

  function describeConnections() {
    const result = [];
    for (const system of systems.values()) {
      if (typeof system.getLinks !== 'function') continue;
      try {
        const items = system.getLinks() || [];
        for (const item of items) {
          if (!item || !visibleElement(item.element)) continue;
          result.push({
            element: item.element,
            anchor: ['top', 'right', 'bottom'].includes(item.anchor) ? item.anchor : 'left',
            grouping: item.grouping === 'row' ? 'row' : 'single',
            appId: String(item.appId || item.element.dataset.appId || ''),
          });
        }
      } catch (error) {
        console.error(`Home Core could not read links for ${system.id}`, error);
      }
    }
    return result;
  }

  function bounds(element, stageRect) {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left - stageRect.left,
      right: rect.right - stageRect.left,
      top: rect.top - stageRect.top,
      bottom: rect.bottom - stageRect.top,
      centerX: rect.left - stageRect.left + rect.width / 2,
      centerY: rect.top - stageRect.top + rect.height / 2,
    };
  }

  function appendLink({ ids, element, sx, sy, ex, ey, direction }) {
    const dx = Math.max(24, (ex - sx) * 0.55);
    const dy = Math.max(12, (ey - sy) * 0.5);
    const group = svgEl('g', { class: 'home-link-group' });
    group.dataset.appIds = ids.filter(Boolean).join(' ');
    const color = element?.style?.getPropertyValue('--mod') || 'var(--h-a)';
    group.style.setProperty('--mod', color);
    if (direction === 'down') {
      group.appendChild(svgEl('path', { class: 'home-link-path', d: `M${sx} ${sy} C${sx} ${sy + dy} ${ex} ${ey - dy} ${ex} ${ey}` }));
    } else if (direction === 'left') {
      const control = Math.max(24, (sx - ex) * 0.55);
      group.appendChild(svgEl('path', { class: 'home-link-path', d: `M${sx} ${sy} C${sx - control} ${sy} ${ex + control} ${ey} ${ex} ${ey}` }));
    } else {
      group.appendChild(svgEl('path', { class: 'home-link-path', d: `M${sx} ${sy} C${sx + dx} ${sy} ${ex - dx} ${ey} ${ex} ${ey}` }));
    }
    group.appendChild(svgEl('circle', { class: 'home-link-dot home-link-dot--start', cx: sx, cy: sy, r: 3.5 }));
    group.appendChild(svgEl('circle', { class: 'home-link-dot home-link-dot--end', cx: ex, cy: ey, r: 4.5 }));
    if (group.dataset.appIds.split(' ').some((id) => hotIds.has(id))) group.classList.add('is-hot');
    links.appendChild(group);
  }

  function drawLinks() {
    if (!ensureNodes()) return;
    links.replaceChildren();
    if (window.matchMedia(NARROW_QUERY).matches || !stage.clientWidth || !stage.clientHeight) return;
    const stageRect = stage.getBoundingClientRect();
    const coreRect = bounds(core, stageRect);
    const cx = coreRect.centerX;
    const cy = coreRect.centerY;
    const radius = coreRect.right - coreRect.left ? (coreRect.right - coreRect.left) / 2 : core.offsetWidth / 2;
    links.setAttribute('viewBox', `0 0 ${stage.clientWidth} ${stage.clientHeight}`);

    // Read each element's layout geometry once per draw. Calling
    // getBoundingClientRect() from sort comparators forces repeated layout reads.
    const items = describeConnections().map((item) => ({ ...item, box: bounds(item.element, stageRect) }));
    const left = items.filter((item) => item.anchor === 'left')
      .sort((a, b) => a.box.centerY - b.box.centerY);
    const right = items.filter((item) => item.anchor === 'right')
      .sort((a, b) => a.box.centerY - b.box.centerY);
    const rows = [];
    left.forEach((item) => {
      const box = item.box;
      const row = item.grouping === 'row' && rows.find((entry) => Math.abs(entry.top - box.top) < 4);
      if (row) {
        row.items.push(item);
        if (box.left > row.leadBox.left) { row.lead = item; row.leadBox = box; }
      } else {
        rows.push({ top: box.top, items: [item], lead: item, leadBox: box });
      }
    });
    const span = Math.min(1.5, 0.42 * (rows.length - 1));
    rows.forEach((row, index) => {
      const phi = rows.length === 1 ? 0 : -span / 2 + (index * span) / (rows.length - 1);
      const sx = row.leadBox.right;
      const sy = row.leadBox.centerY;
      const ex = cx - radius * Math.cos(phi);
      const ey = cy + radius * Math.sin(phi);
      appendLink({ ids: row.items.map((item) => item.appId), element: row.lead.element, sx, sy, ex, ey, direction: 'right' });
    });

    // Widgets live to the right of AI Hub. Start each wire at the widget's left
    // edge and end on the core's right arc. Since the widget adapter may return
    // the live drag preview, these endpoints follow the user's pointer in Arrange.
    const rightSpan = Math.min(1.25, 0.34 * Math.max(0, right.length - 1));
    right.forEach((item, index) => {
      const box = item.box;
      const phi = right.length <= 1 ? 0 : -rightSpan / 2 + index * rightSpan / (right.length - 1);
      appendLink({
        ids: [item.appId], element: item.element,
        sx: box.left, sy: box.centerY,
        ex: cx + radius * Math.cos(phi), ey: cy + radius * Math.sin(phi),
        direction: 'left',
      });
    });

    const topItems = items.filter((item) => item.anchor === 'top')
      .sort((a, b) => a.box.centerX - b.box.centerX);
    topItems.forEach((item, index) => {
      const box = item.box;
      const theta = (index - (topItems.length - 1) / 2) * 0.32;
      const sx = box.centerX;
      const sy = box.bottom;
      const ex = cx + radius * Math.sin(theta);
      const ey = cy - radius * Math.cos(theta);
      if (ey - sy < 6) return;
      appendLink({ ids: [item.appId], element: item.element, sx, sy, ex, ey, direction: 'down' });
    });
  }

  function cardFromTarget(target) {
    return target?.closest?.('.home-module[data-app-id], .home-mini-app-tile[data-app-id]') || null;
  }

  function setHot(card, on) {
    const id = card?.dataset?.appId;
    if (!id || !links) return;
    if (on) hotIds.add(id); else hotIds.delete(id);
    links.querySelectorAll('.home-link-group').forEach((group) => {
      const ids = (group.dataset.appIds || '').split(' ');
      group.classList.toggle('is-hot', ids.some((itemId) => hotIds.has(itemId)));
    });
  }

  function bindStage() {
    if (!ensureNodes() || booted) return;
    booted = true;
    stage.addEventListener('pointerover', (event) => {
      const card = cardFromTarget(event.target);
      if (card && cardFromTarget(event.relatedTarget) !== card) setHot(card, true);
    });
    stage.addEventListener('pointerout', (event) => {
      const card = cardFromTarget(event.target);
      if (card && cardFromTarget(event.relatedTarget) !== card) setHot(card, false);
    });
    stage.addEventListener('focusin', (event) => setHot(cardFromTarget(event.target), true));
    stage.addEventListener('focusout', (event) => {
      const card = cardFromTarget(event.target);
      if (card && cardFromTarget(event.relatedTarget) !== card) setHot(card, false);
    });
    // React-owned widget shells can be rebuilt without changing the fixed canvas
    // dimensions, so ResizeObserver alone is not enough to refresh signal lines.
    document.addEventListener('mad:home-widgets-built', refresh);
    document.addEventListener('mad:home-widget-positions-updated', refresh);
    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(refresh);
      observer.observe(stage);
      observer.observe(core);
      for (const selector of ['#homeApps', '#homeMiniApps', '#homeWidgets']) {
        const target = document.querySelector(selector);
        if (target) observer.observe(target);
      }
    }
    window.addEventListener('resize', refresh);
    window.addEventListener('orientationchange', refresh);
    refresh();
  }

  window.MadHomeCore = {
    registerSystem,
    unregisterSystem,
    getSystem,
    listSystems,
    refresh,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindStage, { once: true });
  else bindStage();
})();

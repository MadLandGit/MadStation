// Mad Station — Home widget registry and layout coordinator
// ---------------------------------------------------------------------------
// This controller owns widget definitions, settings, and the legacy widget
// render callbacks. React owns the shell DOM under #homeWidgets. Each widget's
// render(panel) callback may populate only its dedicated .home-widget-content
// mount so the established live telemetry pipeline can keep its DOM hooks.
(function () {
  'use strict';

  const widgets = [];
  let stack = null;
  let built = false;
  let reactRenderer = null;
  let revision = 0;

  function $(selector, root) { return (root || document).querySelector(selector); }

  function register(def) {
    if (!def || typeof def !== 'object') throw new Error('MadHomeWidgets.register: expected an object');
    const id = String(def.id || '').trim();
    if (!/^[a-z0-9][a-z0-9-_]*$/i.test(id)) throw new Error(`MadHomeWidgets.register: invalid id "${def.id}"`);
    if (!String(def.title || '').trim()) throw new Error(`MadHomeWidgets.register: missing title for "${id}"`);
    if (typeof def.render !== 'function') throw new Error(`MadHomeWidgets.register: "${id}" needs a render(panel) function`);
    const size = ['small', 'medium', 'large'].includes(def.size) ? def.size : 'medium';
    const widget = {
      id,
      title: String(def.title).trim(),
      size,
      order: Number.isFinite(def.order) ? def.order : null,
      enabled: def.enabled !== false,
      render: def.render,
    };
    const at = widgets.findIndex((item) => item.id === id);
    if (at >= 0) widgets[at] = widget; else widgets.push(widget);
    build();
    return { id: widget.id, title: widget.title, size: widget.size, order: widget.order, enabled: widget.enabled };
  }

  function unregister(id) {
    const at = widgets.findIndex((item) => item.id === id);
    if (at < 0) return false;
    widgets.splice(at, 1);
    build();
    return true;
  }

  function configure(id, patch = {}) {
    const widget = widgets.find((item) => item.id === id);
    if (!widget || !patch || typeof patch !== 'object') return false;
    if (typeof patch.enabled === 'boolean') widget.enabled = patch.enabled;
    if (patch.order === null || Number.isFinite(patch.order)) widget.order = patch.order;
    if (['small', 'medium', 'large'].includes(patch.size)) widget.size = patch.size;
    build();
    return true;
  }

  function sortedWidgets() {
    return widgets.map((widget, index) => ({ widget, index }))
      .sort((a, b) => ((a.widget.order ?? 1e6) - (b.widget.order ?? 1e6)) || a.index - b.index)
      .map((entry) => entry.widget);
  }

  function renderModel() {
    return sortedWidgets().filter((widget) => widget.enabled !== false).map((widget) => ({
      id: widget.id,
      title: widget.title,
      size: widget.size,
      order: widget.order,
    }));
  }

  function build() {
    stack = stack || $('#homeWidgets');
    if (!stack) return;
    const visible = renderModel();
    stack.classList.toggle('is-empty', visible.length === 0);
    revision += 1;
    if (!built) {
      built = true;
      if (typeof ResizeObserver === 'function') {
        new ResizeObserver(() => window.MadHomeCore?.refresh()).observe(stack);
      }
    }
    if (typeof reactRenderer === 'function') reactRenderer({ revision, widgets: visible });
  }

  function mountPanel(id, panel) {
    const widget = widgets.find((item) => item.id === id && item.enabled !== false);
    if (!widget) throw new Error(`MadHomeWidgets.mountPanel: unknown or disabled widget "${id}"`);
    if (!panel || typeof panel.appendChild !== 'function') throw new Error('MadHomeWidgets.mountPanel: expected an HTML panel element');
    try {
      widget.render(panel, { id: widget.id, title: widget.title, size: widget.size, order: widget.order });
    } catch (error) {
      // The panel is a deliberate imperative plugin boundary; clear partial
      // output before React presents its sibling error state.
      panel.replaceChildren?.();
      throw error;
    }
  }

  window.MadHomeWidgets = {
    register,
    unregister,
    list: () => sortedWidgets().map(({ id, title, size, order, enabled }) => ({ id, title, size, order, enabled })),
    configure,
    refresh: build,
    mountPanel,
    attachReactRenderer(renderer) {
      if (typeof renderer !== 'function') throw new Error('MadHomeWidgets.attachReactRenderer: expected a function');
      reactRenderer = renderer;
      build();
    },
  };

  window.MadHomeCore?.registerSystem('widgets', {
    name: 'Widgets',
    getLinks: () => Array.from(document.querySelectorAll('#homeWidgets .home-widget[data-widget-id]'))
      .filter((widget) => !widget.classList.contains('is-off') && !widget.classList.contains('home-layout-widget-preview'))
      .map((widget) => ({
        // During an active drag Home Layout Editor returns the visible ghost;
        // after drop/cancel it returns this real React-owned widget shell.
        element: window.MadHomeLayoutEditor?.getWidgetConnectionElement?.(widget) || widget,
        anchor: 'right',
        grouping: 'single',
        appId: widget.dataset.widgetId,
      })),
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build, { once: true });
  else build();
})();

(() => {
  'use strict';
  const api = window.madStationDebugInspector;
  const byId = (id) => document.getElementById(id);
  let lastSnapshot = null;
  let pinned = true;
  let inspectorTab = 'live';
  let debugSettings = {};
  let lastConfirmedDebugSettings = null;
  let settingsWriteQueue = Promise.resolve();
  let searchSequence = 0;
  let currentExplorerRequest = null;
  let currentExplorerData = null;
  let lastExplorerRenderKey = '';
  let lastHiddenRenderKey = '';
  let lastPageContext = '';
  const fmt = (value, fallback = '—') => value === null || value === undefined || value === '' ? fallback : String(value);
  const setText = (id, value, fallback) => { const node = byId(id); if (node) node.textContent = fmt(value, fallback); };
  const setHidden = (id, hidden) => { const node = byId(id); if (node) node.hidden = Boolean(hidden); };
  const rectText = (rect) => rect ? `x ${Math.round(rect.x)} · y ${Math.round(rect.y)} · ${Math.round(rect.width)} × ${Math.round(rect.height)}` : '—';
  const spacingText = (box) => box ? `T ${box.top} · R ${box.right} · B ${box.bottom} · L ${box.left}` : '—';
  const elementLine = (element) => element ? `${element.selector || element.tag || '(element)'}${element.rect ? ` · ${Math.round(element.rect.width)}×${Math.round(element.rect.height)}` : ''}` : '—';

  function renderHitTest(items) {
    const list = byId('hitTestList');
    if (!list) return;
    list.replaceChildren();
    const stack = Array.isArray(items) ? items.slice(0, 8) : [];
    setHidden('hitTestEmpty', stack.length > 0);
    setHidden('hitTestList', stack.length === 0);
    stack.forEach((item, index) => {
      const row = document.createElement('li');
      row.className = 'hit-item';
      const number = document.createElement('span');
      number.className = 'hit-number';
      number.textContent = String(index + 1).padStart(2, '0');
      const copy = document.createElement('div');
      const selector = document.createElement('div');
      selector.className = 'hit-selector';
      selector.textContent = elementLine(item);
      const meta = document.createElement('div');
      meta.className = 'hit-meta';
      meta.textContent = `z-index ${fmt(item.layout?.zIndex, 'auto')} · pointer-events ${fmt(item.layout?.pointerEvents)} · position ${fmt(item.layout?.position)}`;
      copy.append(selector, meta);
      row.append(number, copy);
      list.append(row);
    });
  }

  function render(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return;
    lastSnapshot = snapshot;
    const page = snapshot.page || {};
    const pageContext = [page.workspace || '', page.name || '', page.theme || '', page.file || ''].join('|');
    if (lastPageContext && pageContext !== lastPageContext) {
      currentExplorerRequest = null;
      currentExplorerData = null;
      lastExplorerRenderKey = '';
    }
    lastPageContext = pageContext;
    const stats = snapshot.stats || {};
    const element = snapshot.hovered || null;
    const layout = element?.layout || {};
    const a11y = element?.accessibility || {};
    const box = element?.boxModel || {};

    setText('pageWorkspace', page.workspace);
    const pageLabels = [page.name, page.theme].filter((value, index, list) => value && list.indexOf(value) === index);
    setText('pageName', pageLabels.join(' · ') || page.file);
    setText('pageViewport', page.viewport ? `${page.viewport.width} × ${page.viewport.height}` : '—');
    setText('pageElements', stats.elements);
    setText('pageGridFlex', stats.gridFlex);
    setText('pageInteractive', stats.interactive);
    setText('pageDuplicateIds', stats.duplicateIds);
    setText('pageFixedSticky', stats.fixedSticky);
    setText('pageOverflowHidden', `${fmt(stats.overflow, '0')} / ${fmt(stats.hidden, '0')}`);
    setText('pageDocumentSize', page.documentSize ? `${page.documentSize.width} × ${page.documentSize.height}` : '—');
    setText('pageScroll', page.scroll ? `x ${Math.round(page.scroll.x)} · y ${Math.round(page.scroll.y)}` : '—');
    setText('pagePointer', snapshot.pointer ? `x ${Math.round(snapshot.pointer.x)} · y ${Math.round(snapshot.pointer.y)}` : 'Outside / unknown');
    setText('pageTitle', `Document title: ${fmt(page.title)}`);
    setText('updatedAt', `Last update: ${snapshot.updatedAt ? new Date(snapshot.updatedAt).toLocaleTimeString() : '—'}`);
    const live = byId('liveStatus');
    if (live) live.className = snapshot.status === 'active' ? 'status-pill status-live' : 'status-pill status-waiting';
    setText('liveStatusText', snapshot.status === 'active' ? 'Live · receiving page data' : fmt(snapshot.statusText, 'Waiting for page data'));
    setText('inspectorStatus', snapshot.status === 'active' ? `Live from ${fmt(page.name, page.file || 'Mad Station')}` : 'Waiting for a page hover');

    setHidden('hoverEmpty', Boolean(element));
    setHidden('hoverContent', !element);
    setHidden('layoutEmpty', Boolean(element));
    setHidden('layoutContent', !element);
    setHidden('a11yEmpty', Boolean(element));
    setHidden('a11yContent', !element);
    const selectorButton = byId('copySelectorButton');
    if (selectorButton) selectorButton.disabled = !element?.selector;
    setText('elementTag', element?.tag);
    setText('elementId', element?.id ? `#${element.id}` : '(no ID)');
    setText('elementSelector', element?.selector);
    setText('elementClasses', Array.isArray(element?.classes) && element.classes.length ? element.classes.join(' · ') : '(no classes)');
    setText('elementLabel', element?.label);
    setText('elementRect', rectText(element?.rect));
    setText('elementDocumentRect', element?.rect ? `scroll x ${Math.round(page.scroll?.x || 0)} · y ${Math.round(page.scroll?.y || 0)} · doc x ${Math.round(element.rect.x + (page.scroll?.x || 0))} · y ${Math.round(element.rect.y + (page.scroll?.y || 0))}` : '—');

    const contextSelection = snapshot.contextSelection || null;
    setHidden('contextSelectionSection', Boolean(contextSelection));
    setText('contextSelectionTag', contextSelection ? `<${contextSelection.tag || 'element'}>` : '—');
    setText('contextSelectionId', contextSelection?.id ? `#${contextSelection.id}` : '(no ID assigned)');
    setText('contextSelectionSelector', contextSelection?.selector);
    setText('contextSelectionPage', contextSelection?.page ? `${contextSelection.page.name} · ${contextSelection.page.workspace} · ${contextSelection.page.theme}` : '—');
    setText('contextSelectionRect', rectText(contextSelection?.rect));
    setText('contextSelectionParent', contextSelection?.parentSelector);
    setText('contextSelectionInteractive', contextSelection?.nearestInteractive?.selector || '(none)');
    setText('contextSelectionCoordinates', contextSelection?.pointer ? `view x ${contextSelection.pointer.x} · y ${contextSelection.pointer.y} / doc x ${contextSelection.pointer.documentX} · y ${contextSelection.pointer.documentY}` : '—');

    setText('styleDisplay', layout.display); setText('stylePosition', layout.position); setText('styleZIndex', layout.zIndex, 'auto');
    setText('stylePointer', layout.pointerEvents); setText('styleOverflow', `${fmt(layout.overflowX)} / ${fmt(layout.overflowY)}`);
    setText('styleOpacity', `${fmt(layout.opacity)} / ${fmt(layout.visibility)}`); setText('styleCursor', layout.cursor);
    setText('styleFlexGrid', `flex ${fmt(layout.flex)} · grid ${fmt(layout.gridArea)}`);
    setText('styleGridTemplates', `${fmt(layout.gridTemplateColumns)} / ${fmt(layout.gridTemplateRows)}`);
    setText('styleGaps', `${fmt(layout.gap)} / ${fmt(layout.rowGap)} / ${fmt(layout.columnGap)}`);
    setText('styleFlexValues', `${fmt(layout.flexBasis)} / ${fmt(layout.flexGrow)} / ${fmt(layout.flexShrink)}`);
    setText('styleDimensions', `${fmt(layout.width)} / ${fmt(layout.height)}`);
    setText('styleMinMax', `min ${fmt(layout.minWidth)} × ${fmt(layout.minHeight)} · max ${fmt(layout.maxWidth)} × ${fmt(layout.maxHeight)}`);
    setText('styleBoxSizing', `${fmt(layout.boxSizing)} / ${fmt(layout.borderRadius)}`);
    setText('styleTransform', `${fmt(layout.transform)} · filter ${fmt(layout.filter)} · backdrop ${fmt(layout.backdropFilter)}`);
    setText('styleBackgroundImage', layout.backgroundImage);
    setText('styleAnimationTransition', `animation ${fmt(layout.animationName)} ${fmt(layout.animationDuration)} · transition ${fmt(layout.transitionProperty)} ${fmt(layout.transitionDuration)}`);
    setText('styleFontFamily', layout.fontFamily); setText('styleFontSizeWeight', `${fmt(layout.fontSize)} / ${fmt(layout.fontWeight)}`);
    setText('styleLineHeight', layout.lineHeight); setText('styleColor', layout.color); setText('styleBackground', layout.backgroundColor);
    setText('styleFlexDirection', layout.flexDirection); setText('styleAlignment', `align ${fmt(layout.alignItems)} · justify ${fmt(layout.justifyContent)}`);
    setText('styleWhiteSpaceIsolation', `${fmt(layout.whiteSpace)} / ${fmt(layout.isolation)}`);
    setText('boxPadding', spacingText(box.padding)); setText('boxMargin', spacingText(box.margin)); setText('boxBorder', spacingText(box.border));
    setText('a11yRole', a11y.role); setText('a11yType', a11y.type); setText('a11yTabIndex', a11y.tabIndex);
    setText('a11yLabel', a11y.label); setText('a11yDisabled', a11y.disabled === null || a11y.disabled === undefined ? '—' : (a11y.disabled ? 'Yes' : 'No'));
    setText('a11yFocused', a11y.focused === null || a11y.focused === undefined ? '—' : (a11y.focused ? 'Yes' : 'No'));
    setText('a11yCursorTarget', layout.pointerEvents === 'none' ? 'Not pointer target' : 'Pointer eligible');

    renderHitTest(snapshot.hitTest);
    const click = snapshot.lastClick;
    setHidden('clickEmpty', Boolean(click)); setHidden('clickContent', !click);
    setText('clickTarget', click?.target?.selector || click?.targetText);
    setText('clickAncestor', click?.actionableAncestor?.selector || '(no actionable ancestor)');
    setText('clickTrusted', click?.trusted === undefined ? '—' : (click.trusted ? 'Yes' : 'No'));
    setText('clickPrevented', click?.defaultPrevented === undefined || click.defaultPrevented === null ? 'Pending / not observed' : (click.defaultPrevented ? 'Yes' : 'No'));
    setText('clickTime', click?.timestamp ? new Date(click.timestamp).toLocaleTimeString() : '—');

    setText('overflowCount', stats.overflow ?? 0); setText('hiddenCount', stats.hidden ?? 0);
    setText('hiddenSamples', Array.isArray(snapshot.hiddenSamples) && snapshot.hiddenSamples.length ? snapshot.hiddenSamples.join('\n') : '(no samples)');
    setText('overflowSamples', Array.isArray(snapshot.overflowSamples) && snapshot.overflowSamples.length ? snapshot.overflowSamples.join('\n') : '(no samples)');
    renderElementExplorer(snapshot.elementExplorer || null);
    renderDebugHiddenElements(snapshot.debugHiddenElements || []);
  }

  function renderDebugHiddenElements(items) {
    const container = byId('debugHiddenElementsList');
    if (!container) return;
    const hiddenItems = Array.isArray(items) ? items.filter((item) => item && typeof item.token === 'string' && item.token).slice(0, 200) : [];
    const renderKey = hiddenItems.map((item) => `${item.token}|${item.selector || ''}|${item.id || ''}`).join('||');
    const unhideAllButton = byId('unhideAllElementsButton');
    if (unhideAllButton) unhideAllButton.disabled = hiddenItems.length === 0;
    setText('debugHiddenElementsSummary', hiddenItems.length
      ? `${hiddenItems.length} element${hiddenItems.length === 1 ? '' : 's'} temporarily hidden${hiddenItems.length >= 200 ? ' · list capped at 200' : ''}`
      : 'No elements hidden by Debug Mode.');
    if (renderKey === lastHiddenRenderKey) return;
    lastHiddenRenderKey = renderKey;
    container.replaceChildren();
    if (!hiddenItems.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'No temporary hides yet. Right-click an element in the app while Debug Mode is enabled.';
      container.append(empty);
      return;
    }
    hiddenItems.forEach((item) => {
      const row = document.createElement('article');
      row.className = 'element-result';
      const main = document.createElement('div');
      main.className = 'element-result-main';
      const title = document.createElement('div');
      title.className = 'element-result-title';
      title.textContent = item.kind === 'world-object'
        ? `World object · ${item.label || item.id || 'Isometric World'}`
        : `${item.tag || 'element'}${item.id ? `#${item.id}` : ''}${Array.isArray(item.classes) && item.classes.length ? ` .${item.classes.join(' .')}` : ''}`;
      const selector = document.createElement('div');
      selector.className = 'element-result-meta';
      selector.textContent = item.kind === 'world-object'
        ? `Scene reference: ${item.selector || item.id || '(unknown)'}`
        : (item.selector || '(no selector)');
      const parent = document.createElement('div');
      parent.className = 'element-result-meta';
      parent.textContent = `Parent: ${item.parentSelector || '—'}${item.label ? ` · Label: ${item.label}` : ''}`;
      const chips = document.createElement('div');
      chips.className = 'element-result-detail';
      const badge = document.createElement('span');
      badge.className = 'is-warning';
      badge.textContent = 'HIDDEN BY DEBUG MODE';
      chips.append(badge);
      main.append(title, selector, parent, chips);
      const actions = document.createElement('div');
      actions.className = 'element-result-actions';
      const unhide = document.createElement('button');
      unhide.className = 'button button-primary';
      unhide.type = 'button';
      unhide.textContent = 'Unhide';
      unhide.dataset.action = 'unhide';
      unhide.dataset.token = item.token;
      actions.append(unhide);
      row.append(main, actions);
      container.append(row);
    });
  }

  const DEBUG_SETTINGS_DEFAULTS = Object.freeze({
    enabled: false, outlines: true, containers: false, grid: false, labels: false,
    overflow: true, hud: true, hoverInspector: false, hitTest: true, boxModel: false,
    focusable: false, clickTrace: false, pauseAnimations: false, hiddenAudit: true,
  });
  const DEBUG_SETTING_GROUPS = [
    { title: 'Core', items: [
      ['enabled', 'Enable Debug Mode', 'Master switch for all diagnostic overlays and inspections. Switch this off to remove all page overlays.'],
      ['hud', 'Live Inspector window and updates', 'Automatically open the separate inspector and stream current page and hovered-element information to it.'],
    ] },
    { title: 'Visual layout', items: [
      ['outlines', 'Outline element boxes', 'Show DOM boundaries, with distinct styles for containers and controls.'],
      ['containers', 'Tint layout containers', 'Highlight sections, cards, grids, forms, and structural wrappers.'],
      ['grid', 'Show 16 px layout grid', 'Overlay a pointer-transparent alignment grid.'],
      ['labels', 'Label elements and IDs', 'Display element tag, ID, and classes on the page.'],
      ['overflow', 'Highlight overflow', 'Mark clipped content and elements outside the viewport.'],
      ['hoverInspector', 'Highlight element under pointer', 'Outline the exact element currently hovered.'],
      ['focusable', 'Highlight keyboard-focusable controls', 'Mark buttons, links, inputs, and keyboard navigation targets.'],
    ] },
    { title: 'Interaction diagnostics', items: [
      ['hitTest', 'Inspect pointer hit-test stack', 'Report the elements underneath the pointer, topmost first.'],
      ['clickTrace', 'Trace the last click', 'Record click target, actionable ancestor, and default-prevented state.'],
      ['pauseAnimations', 'Pause animation under pointer', 'Pause only the animated node under the pointer; menu transitions continue.'],
      ['boxModel', 'Show box model details', 'Expose padding, margin, and border dimensions for inspected elements.'],
      ['hiddenAudit', 'Audit hidden elements', 'Count nodes hidden with CSS, attributes, or lack of rendered geometry.'],
    ] },
  ];
  function normalizedSettings(value) {
    const next = { ...DEBUG_SETTINGS_DEFAULTS };
    if (value && typeof value === 'object') for (const key of Object.keys(next)) if (typeof value[key] === 'boolean') next[key] = value[key];
    return next;
  }
  function setInspectorTab(name) {
    inspectorTab = name;
    for (const button of document.querySelectorAll('[data-inspector-tab]')) {
      const active = button.dataset.inspectorTab === name;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
    }
    for (const [id, tab] of [['tabLivePanel', 'live'], ['tabDebugOptionsPanel', 'options'], ['tabElementExplorerPanel', 'elements'], ['tabVisualLegendPanel', 'legend']]) setHidden(id, tab !== name);
    if (name === 'elements') byId('elementSearchInput')?.focus();
  }
  function setDebugSettingsStatus(message, state = '') {
    setText('debugSettingsStatus', message);
    const node = byId('debugSettingsStatus');
    if (node) node.dataset.state = state;
  }
  function renderDebugSettings() {
    const grid = byId('debugSettingsGrid');
    if (!grid) return;
    grid.replaceChildren();
    const count = Object.keys(debugSettings).filter((key) => debugSettings[key]).length;
    setText('debugSettingsCount', `${count} of ${Object.keys(DEBUG_SETTINGS_DEFAULTS).length} enabled`);
    DEBUG_SETTING_GROUPS.forEach((group) => {
      const heading = document.createElement('h3');
      heading.className = 'debug-setting-group-title';
      heading.textContent = group.title;
      grid.append(heading);
      group.items.forEach(([key, title, description]) => {
        const label = document.createElement('label');
        label.className = `debug-setting${key === 'enabled' ? ' is-master' : ''}`;
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = Boolean(debugSettings[key]);
        input.dataset.setting = key;
        input.disabled = key !== 'enabled' && !debugSettings.enabled;
        const copy = document.createElement('span');
        const strong = document.createElement('strong'); strong.textContent = title;
        const small = document.createElement('small'); small.textContent = description;
        copy.append(strong, small);
        label.append(input, copy);
        grid.append(label);
      });
    });
  }
  async function commitDebugSettings(next) {
    const requestedSettings = normalizedSettings(next);
    debugSettings = requestedSettings;
    renderDebugSettings();
    setDebugSettingsStatus('Applying debug settings…');
    const snapshot = { ...requestedSettings };
    settingsWriteQueue = settingsWriteQueue.then(async () => {
      try {
        if (!api?.setDebugSettings) throw new Error('Inspector settings bridge is unavailable. Rebuild Mad Station from the matching project source.');
        const result = await api.setDebugSettings(snapshot);
        if (!result || result.ok !== true) throw new Error(result?.error || 'Could not apply debug settings.');
        debugSettings = normalizedSettings(result.settings || snapshot);
        lastConfirmedDebugSettings = { ...debugSettings };
        renderDebugSettings();
        if (!debugSettings.enabled) renderDebugHiddenElements([]);
        setDebugSettingsStatus(debugSettings.enabled ? 'Debug Mode is ON · settings sent to Mad Station and the active built-in theme.' : 'Debug Mode is OFF · the inspector stays open so you can enable it again here.');
      } catch (error) {
        // Never leave a checkbox pretending that a failed IPC request succeeded. Try
        // to re-read the source of truth first; if that also fails, restore the last
        // acknowledged settings (or safe defaults before the first successful read).
        let recovered = null;
        try {
          const current = await api?.getDebugSettings?.();
          if (current?.ok === true) recovered = normalizedSettings(current.settings);
        } catch { /* Fall back to the last acknowledged state below. */ }
        debugSettings = recovered || lastConfirmedDebugSettings || normalizedSettings(DEBUG_SETTINGS_DEFAULTS);
        if (recovered) lastConfirmedDebugSettings = { ...recovered };
        renderDebugSettings();
        setDebugSettingsStatus(`Could not apply debug settings: ${error instanceof Error ? error.message : 'unknown IPC error'}. Controls were reverted to the last confirmed state.`, 'error');
      }
    });
    await settingsWriteQueue;
  }
  async function loadDebugSettings() {
    if (!api?.getDebugSettings) { setDebugSettingsStatus('Inspector settings bridge is unavailable. Controls are shown with safe defaults, but changes cannot reach the app until it is rebuilt with the matching inspector preload.', 'error'); return; }
    try {
      const result = await api.getDebugSettings();
      if (!result || result.ok !== true) throw new Error(result?.error || 'Could not read debug settings.');
      debugSettings = normalizedSettings(result.settings);
      lastConfirmedDebugSettings = { ...debugSettings };
      renderDebugSettings();
      setDebugSettingsStatus(debugSettings.enabled ? 'Loaded current settings from Mad Station · Debug Mode ON.' : 'Loaded current settings from Mad Station · Debug Mode OFF.');
    } catch (error) {
      setDebugSettingsStatus(`Could not load saved settings: ${error instanceof Error ? error.message : 'unknown error'}. Controls remain visible with safe defaults.`, 'error');
    }
  }
  function requestElementSearch(offset = 0) {
    if (!api?.searchElements) return;
    const query = String(byId('elementSearchInput')?.value || '').slice(0, 240).trim();
    const includeHidden = Boolean(byId('elementSearchIncludeHidden')?.checked);
    const requestId = `element-search-${Date.now()}-${++searchSequence}`;
    currentExplorerRequest = { requestId, query, includeHidden, offset, limit: 50 };
    currentExplorerData = null;
    lastExplorerRenderKey = '';
    renderElementExplorer(null, true);
    Promise.resolve(api.searchElements({ requestId, query, includeHidden, offset, limit: 50 })).then((result) => {
      if (!result || result.ok !== true) setText('elementSearchSummary', result?.error || 'The page search request failed.');
    }).catch((error) => setText('elementSearchSummary', error instanceof Error ? error.message : 'The page search request failed.'));
  }
  function renderElementExplorer(value, loading = false) {
    const container = byId('elementSearchResults');
    if (!container) return;
    if (value && currentExplorerRequest && value.requestId && value.requestId !== currentExplorerRequest.requestId) return;
    if (value && value.requestId) {
      currentExplorerData = value;
      currentExplorerRequest = { requestId: value.requestId, query: value.query || '', includeHidden: Boolean(value.includeHidden), offset: Number(value.offset) || 0, limit: Number(value.limit) || 50 };
    }
    const data = currentExplorerData;
    const renderKey = data ? `${data.requestId}|${data.offset}|${data.total}|${data.results?.length || 0}|${data.status}` : loading ? `loading|${currentExplorerRequest?.requestId}` : 'empty';
    if (renderKey === lastExplorerRenderKey) return;
    lastExplorerRenderKey = renderKey;
    container.replaceChildren();
    if (loading) {
      const state = document.createElement('div'); state.className = 'empty-state'; state.textContent = 'Searching the entire active document…'; container.append(state);
      setText('elementSearchSummary', 'Search requested. Waiting for the page to respond…');
      setText('elementSearchPage', 'Page —');
      if (byId('elementSearchPrevious')) byId('elementSearchPrevious').disabled = true;
      if (byId('elementSearchNext')) byId('elementSearchNext').disabled = true;
      return;
    }
    if (!data) {
      const state = document.createElement('div'); state.className = 'empty-state'; state.textContent = 'Enter a search term or choose Refresh all to enumerate page elements.'; container.append(state);
      setText('elementSearchSummary', 'Search the current page to list matching elements.');
      setText('elementSearchPage', 'Page —');
      if (byId('elementSearchPrevious')) byId('elementSearchPrevious').disabled = true;
      if (byId('elementSearchNext')) byId('elementSearchNext').disabled = true;
      return;
    }
    if (data.status === 'debug-disabled') {
      const state = document.createElement('div'); state.className = 'empty-state'; state.textContent = 'Enable Debug Mode in the Debug Options tab before searching or highlighting page elements.'; container.append(state);
    } else if (!Array.isArray(data.results) || !data.results.length) {
      const state = document.createElement('div'); state.className = 'empty-state'; state.textContent = 'No matching elements found. Try a tag, ID, class, role, or accessible label.'; container.append(state);
    } else {
      data.results.forEach((item) => {
        const row = document.createElement('article'); row.className = 'element-result';
        const main = document.createElement('div'); main.className = 'element-result-main';
        const title = document.createElement('div'); title.className = 'element-result-title';
        title.textContent = `${item.tag || 'element'}${item.id ? `#${item.id}` : ''}${Array.isArray(item.classes) && item.classes.length ? ` .${item.classes.join(' .')}` : ''}`;
        const selector = document.createElement('div'); selector.className = 'element-result-meta'; selector.textContent = item.selector || '(no selector)';
        const parent = document.createElement('div'); parent.className = 'element-result-meta'; parent.textContent = `Parent: ${item.parentSelector || '—'}${item.label ? ` · Label: ${item.label}` : ''}`;
        const chips = document.createElement('div'); chips.className = 'element-result-detail';
        const details = [
          `${Math.round(item.rect?.width || 0)} × ${Math.round(item.rect?.height || 0)}`,
          `x ${Math.round(item.rect?.x || 0)} · y ${Math.round(item.rect?.y || 0)}`,
          `display ${item.layout?.display || '—'}`,
          `position ${item.layout?.position || '—'}`,
          `z ${item.layout?.zIndex || 'auto'}`,
          `pointer ${item.layout?.pointerEvents || '—'}`,
          `children ${Number(item.childCount) || 0}`,
          `scroll ${Number(item.scrollSize?.width) || 0} × ${Number(item.scrollSize?.height) || 0}`,
          `role ${item.accessibility?.role || '—'}`,
          `gap ${item.layout?.gap || '—'}`,
          `font ${item.layout?.fontSize || '—'} / ${item.layout?.fontWeight || '—'}`,
          `opacity ${item.layout?.opacity || '—'}`,
          `overflow ${item.layout?.overflowX || '—'} / ${item.layout?.overflowY || '—'}`,
          `flex ${item.layout?.flexDirection || '—'} · grid ${item.layout?.gridArea || '—'}`,
        ];
        details.forEach((text) => { const chip = document.createElement('span'); chip.textContent = text; chips.append(chip); });
        if (item.hidden) { const chip = document.createElement('span'); chip.className = 'is-warning'; chip.textContent = 'HIDDEN'; chips.append(chip); }
        if (item.outsideViewport) { const chip = document.createElement('span'); chip.className = 'is-warning'; chip.textContent = 'OUTSIDE VIEWPORT'; chips.append(chip); }
        main.append(title, selector, parent, chips);
        const actions = document.createElement('div'); actions.className = 'element-result-actions';
        const highlight = document.createElement('button'); highlight.className = 'button button-primary'; highlight.type = 'button'; highlight.textContent = item.hidden ? 'Reveal & highlight' : 'Highlight'; highlight.dataset.action = 'highlight'; highlight.dataset.selector = item.selector || ''; highlight.dataset.shadowHosts = JSON.stringify(Array.isArray(item.shadowHosts) ? item.shadowHosts : []);
        const copy = document.createElement('button'); copy.className = 'button button-secondary'; copy.type = 'button'; copy.textContent = 'Copy selector'; copy.dataset.action = 'copy'; copy.dataset.selector = item.selector || '';
        actions.append(highlight, copy); row.append(main, actions); container.append(row);
      });
    }
    const total = Number(data.total) || 0;
    const start = total ? Number(data.offset || 0) + 1 : 0;
    const end = Math.min(total, Number(data.offset || 0) + (Number(data.results?.length) || 0));
    setText('elementSearchSummary', data.status === 'debug-disabled' ? 'Debug Mode is disabled on the inspected page.' : `${total.toLocaleString()} matching element${total === 1 ? '' : 's'} · showing ${start}–${end}${data.includeHidden ? ' · includes hidden nodes' : ' · visible nodes only'}`);
    setText('elementSearchPage', `Page ${Math.floor((Number(data.offset) || 0) / Math.max(1, Number(data.limit) || 50)) + 1} · ${Number(data.results?.length) || 0} shown`);
    if (byId('elementSearchPrevious')) byId('elementSearchPrevious').disabled = !data.hasPrevious;
    if (byId('elementSearchNext')) byId('elementSearchNext').disabled = !data.hasNext;
  }
  byId('debugSettingsGrid')?.addEventListener('change', (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.dataset.setting) return;
    const key = input.dataset.setting;
    if (!Object.hasOwn(DEBUG_SETTINGS_DEFAULTS, key)) return;
    void commitDebugSettings({ ...debugSettings, [key]: input.checked });
  });
  byId('enableDebugModeButton')?.addEventListener('click', () => void commitDebugSettings({ ...debugSettings, enabled: true, hud: true }));
  byId('disableDebugModeButton')?.addEventListener('click', () => void commitDebugSettings({ ...debugSettings, enabled: false }));
  byId('reloadDebugSettingsButton')?.addEventListener('click', () => void loadDebugSettings());
  byId('resetDebugSettingsButton')?.addEventListener('click', () => void commitDebugSettings(DEBUG_SETTINGS_DEFAULTS));
  document.querySelectorAll('[data-inspector-tab]').forEach((button) => button.addEventListener('click', () => setInspectorTab(button.dataset.inspectorTab || 'live')));
  byId('elementSearchForm')?.addEventListener('submit', (event) => { event.preventDefault(); requestElementSearch(0); });
  byId('elementSearchRefreshButton')?.addEventListener('click', () => requestElementSearch(0));
  byId('elementSearchIncludeHidden')?.addEventListener('change', () => requestElementSearch(0));
  byId('elementSearchPrevious')?.addEventListener('click', () => requestElementSearch(Math.max(0, Number(currentExplorerData?.offset || 0) - Number(currentExplorerData?.limit || 50))));
  byId('elementSearchNext')?.addEventListener('click', () => requestElementSearch(Number(currentExplorerData?.offset || 0) + Number(currentExplorerData?.limit || 50)));
  byId('elementSearchResults')?.addEventListener('click', async (event) => {
    const button = event.target instanceof Element ? event.target.closest('button[data-action]') : null;
    if (!button) return;
    const selector = button.dataset.selector || '';
    if (!selector) return;
    if (button.dataset.action === 'highlight') {
      let shadowHosts = [];
      try { shadowHosts = JSON.parse(button.dataset.shadowHosts || '[]'); } catch { shadowHosts = []; }
      const result = await api?.highlightElement?.(selector, shadowHosts);
      if (!result || result.ok !== true) setText('elementSearchSummary', result?.error || 'Could not highlight that element.');
    } else if (button.dataset.action === 'copy') {
      await api?.copyText?.(selector);
    }
  });
  byId('debugHiddenElementsList')?.addEventListener('click', async (event) => {
    const button = event.target instanceof Element ? event.target.closest('button[data-action="unhide"]') : null;
    if (!button) return;
    button.disabled = true;
    const result = await api?.manageHiddenElements?.('unhide', button.dataset.token || '');
    if (!result || result.ok !== true) {
      button.disabled = false;
      setText('debugHiddenElementsSummary', result?.error || 'Could not unhide this element. Check that Debug Mode is enabled.');
    }
  });
  byId('unhideAllElementsButton')?.addEventListener('click', async () => {
    const button = byId('unhideAllElementsButton');
    if (button) button.disabled = true;
    const result = await api?.manageHiddenElements?.('unhide-all');
    if (!result || result.ok !== true) {
      if (button) button.disabled = false;
      setText('debugHiddenElementsSummary', result?.error || 'Could not restore hidden elements. Check that Debug Mode is enabled.');
    }
  });
  // Render usable controls immediately. Previously this grid only rendered after the
  // settings IPC request succeeded, so any startup/bridge error left a blank tab with
  // just the Reset button. The saved values replace these safe defaults when available.
  debugSettings = normalizedSettings(DEBUG_SETTINGS_DEFAULTS);
  renderDebugSettings();
  setDebugSettingsStatus('Controls ready · loading saved settings…');
  void loadDebugSettings();

  byId('copySelectorButton')?.addEventListener('click', async () => {
    const selector = lastSnapshot?.hovered?.selector;
    if (!selector || !api) return;
    await api.copyText(selector);
  });
  byId('copyContextAgentReferenceButton')?.addEventListener('click', async () => {
    const reference = lastSnapshot?.contextSelection?.agentReference;
    if (reference) await api?.copyText?.(reference);
  });
  byId('copyContextJsonButton')?.addEventListener('click', async () => {
    const selection = lastSnapshot?.contextSelection;
    if (selection) await api?.copyText?.(JSON.stringify(selection, null, 2));
  });
  byId('copySnapshotButton')?.addEventListener('click', async () => {
    if (!lastSnapshot || !api) return;
    await api.copyText(JSON.stringify(lastSnapshot, null, 2));
  });
  byId('clearClickButton')?.addEventListener('click', () => api?.clearClickTrace());
  byId('pinButton')?.addEventListener('click', async () => {
    if (!api) return;
    const result = await api.setPinned(!pinned);
    if (result && result.ok) {
      pinned = Boolean(result.pinned);
      const button = byId('pinButton');
      if (button) { button.textContent = pinned ? '📌 Pinned on top' : 'Pin on top'; button.setAttribute('aria-pressed', String(pinned)); }
    }
  });
  setInspectorTab('live');
  api?.onSnapshot(render);
  api?.onSettingsSync((settings) => {
    debugSettings = normalizedSettings(settings);
    lastConfirmedDebugSettings = { ...debugSettings };
    renderDebugSettings();
    if (!debugSettings.enabled) renderDebugHiddenElements([]);
    setDebugSettingsStatus(debugSettings.enabled ? 'Synced with Developer Settings · Debug Mode ON.' : 'Synced with Developer Settings · Debug Mode OFF.');
  });
  api?.onState((state) => {
    if (typeof state?.pinned === 'boolean') pinned = state.pinned;
    const button = byId('pinButton');
    if (button) { button.textContent = pinned ? '📌 Pinned on top' : 'Pin on top'; button.setAttribute('aria-pressed', String(pinned)); }
  });
})();

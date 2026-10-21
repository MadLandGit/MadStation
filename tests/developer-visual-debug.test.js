const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('Developer Options exposes opt-in visual and separate-window diagnostics', () => {
  const panel = read('src/renderer-react/information-security-panels.tsx');
  for (const label of [
    'Enable Debug Mode', 'Outline element boxes', 'Tint layout containers', 'Show 16 px layout grid',
    'Label elements and IDs', 'Highlight overflow', 'Open separate inspector window', 'Highlight element under pointer',
    'Inspect pointer hit-test stack', 'Show box model details', 'Highlight keyboard-focusable controls',
    'Trace the last click', 'Audit hidden elements', 'Pause CSS animations', 'Open Separate Inspector Window',
  ]) assert.ok(panel.includes(label), `Missing Developer Options entry: ${label}`);
  assert.ok(panel.includes('enabled: false'), 'Debug Mode must be disabled by default');
  assert.ok(panel.includes("madstation.developer-debug.v1"), 'Debug configuration should persist under a versioned key');
});

test('visual debug runtime draws only visual labels in the app and keeps diagnostics separate', () => {
  const runtime = read('src/developer-visual-debug.js');
  const css = read('src/developer-visual-debug.css');
  for (const feature of ['outlines', 'containers', 'grid', 'labels', 'overflow', 'hud', 'hoverInspector', 'pauseAnimations', 'hiddenAudit']) {
    assert.ok(runtime.includes(feature), `Runtime is missing setting ${feature}`);
  }
  assert.ok(runtime.includes('data-ms-dev-debug-overflow'));
  assert.ok(runtime.includes('getBoundingClientRect'));
  assert.ok(runtime.includes("api.developerDebugPublishSnapshot"));
  assert.ok(runtime.includes('function snapshotElement(element)'));
  assert.ok(runtime.includes('function hitTestSnapshot()'));
  assert.ok(runtime.includes('function currentPageSnapshot()'));
  assert.ok(runtime.includes('The in-page layer now renders visual labels only'));
  assert.doesNotMatch(runtime, /hud\.append\(hudTitle/);
  assert.match(css, /pointer-events:\s*none\s*!important/);
  assert.match(css, /ms-dev-debug-option-grid/);
  assert.match(css, /ms-dev-debug-option-pause-animations/);
});

test('built-in homepage frames receive settings and send snapshots only through the active parent channel', () => {
  const switcher = read('src/home-page-switcher.js');
  const runtime = read('src/developer-visual-debug.js');
  assert.ok(switcher.includes("sendToFrame(mode, 'developer-debug-settings', { settings: latestDeveloperDebugSettings })"));
  assert.ok(switcher.includes("window.addEventListener('madstation:developer-debug-settings'"));
  assert.ok(runtime.includes("event.source === window.parent"));
  assert.ok(runtime.includes("message.type === 'developer-debug-settings'"));
  assert.ok(runtime.includes("message.type !== 'developer-debug-snapshot'"));
  assert.ok(runtime.includes('binding.frame.contentWindow !== event.source'), 'Frame snapshot sender must match the active frame identity');
  for (const file of [
    'src/home-v2.html', 'src/home-retro.html', 'src/home-retro-complex.html', 'src/home-v3.html',
    'src/home-v4.html', 'src/home-galaxy.html', 'src/home-parallax-jungle.html', 'src/home-claymorphism.html', 'src/home-glass.html', 'src/home-isometric-world.html',
  ]) {
    const html = read(file);
    assert.ok(html.includes('developer-visual-debug.css'), `${file} must load the visual-debug stylesheet`);
    assert.ok(html.includes('developer-visual-debug.js'), `${file} must load the visual-debug runtime`);
  }
});

test('debug runtime, inspector window, and diagnostics styles are included in app and developer-source assets', () => {
  const renderer = read('src/renderer.html');
  const packageJson = JSON.parse(read('package.json'));
  const main = read('src/main.js');
  assert.ok(renderer.includes('developer-visual-debug.css'));
  assert.ok(renderer.includes('developer-visual-debug.js'));
  for (const filename of ['developer-debug-window.html', 'developer-debug-window.css', 'developer-debug-window.js', 'developer-debug-window-preload.js']) {
    assert.ok(fs.existsSync(path.join(root, 'src', filename)), `${filename} should exist`);
    assert.ok(main.includes(`src/${filename}`), `${filename} should be in the Developer file allowlist or path config`);
    assert.ok(packageJson.build.extraResources.some((resource) => resource.from === 'src' && (resource.filter || []).includes(filename)), `${filename} should be included in Developer source resources`);
  }
});

test('separate inspector data includes hovered element, selector, styles, box model, hit-test stack, and click status', () => {
  const runtime = read('src/developer-visual-debug.js');
  const inspector = read('src/developer-debug-window.html');
  const script = read('src/developer-debug-window.js');
  for (const key of ['selector:', 'rect:', 'layout:', 'accessibility:', 'boxModel:']) assert.ok(runtime.includes(key), `Snapshot missing ${key}`);
  for (const section of ['Page overview', 'Element under pointer', 'Layout &amp; box model', 'Accessibility &amp; input', 'Hit-test stack', 'Last click', 'Overflow &amp; hidden nodes']) {
    assert.ok(inspector.includes(section), `Inspector missing readable section: ${section}`);
  }
  for (const id of ['copySelectorButton', 'copySnapshotButton', 'clearClickButton', 'pinButton']) assert.ok(script.includes(id) || inspector.includes(id));
  assert.ok(script.includes('renderHitTest'));
  assert.ok(script.includes('render(snapshot)'));
  assert.ok(script.includes('elementDocumentRect'));
  for (const id of ['pageDocumentSize', 'pageScroll', 'pagePointer', 'styleFontFamily', 'styleFontSizeWeight', 'styleColor', 'styleBackground', 'styleAlignment']) {
    assert.ok(inspector.includes(id), `Readable inspector field ${id} exists`);
    assert.ok(script.includes(id), `Inspector renders ${id}`);
  }
  assert.ok(read('src/developer-visual-debug.js').includes('element.matches(\'button,a,[role=\"button\"],label,summary,option\')'), 'Do not collect arbitrary leaf-node page text');
  assert.ok(read('src/main.js').includes('developerDebugClickClearBefore'), 'Cleared click events must not reappear on the next hover update');
});

test('new native debug window is isolated, resizable, and only accepts messages from its own contents', () => {
  const main = read('src/main.js');
  const preload = read('src/developer-debug-window-preload.js');
  const html = read('src/developer-debug-window.html');
  const appPreload = read('src/preload.ts');
  const contract = read('src/shared/api-contract.ts');
  assert.ok(main.includes('new BrowserWindow({'));
  assert.ok(main.includes('preload: DEVELOPER_DEBUG_WINDOW_PRELOAD'));
  assert.ok(main.includes('isTrustedDeveloperDebugWindowSender(event)'));
  assert.ok(main.includes('function openDeveloperDebugWindow(focusWindow = true)'));
  assert.ok(main.includes('if (focusWindow) inspector.focus()'), 'Automatic sync should be able to show the window without stealing focus');
  assert.ok(read('src/developer-visual-debug.js').includes('api.developerDebugOpenWindow.call(api, false)'), 'Automatic sync opens without forcing focus');
  assert.ok(main.includes("handleDeveloperDebugWindow('developer-debug-window-set-pinned'"));
  assert.ok(main.includes("handleDeveloperDebugWindow('developer-debug-window-copy-text'"));
  assert.ok(main.includes("handle('developer-debug-publish-snapshot'"));
  const panels = read('src/renderer-react/information-security-panels.tsx');
  const renderer = read('src/renderer.js');
  assert.ok(panels.includes("emit('madstation:developer-debug-open-window', {})"), 'React uses the event bridge instead of a privileged API');
  assert.ok(renderer.includes("window.addEventListener('madstation:developer-debug-open-window'"), 'Host receives the inspector-open request through the bridge');
  assert.doesNotMatch(panels, /window\.aiHub\./, 'React must not call preload APIs directly');
  assert.ok(preload.includes("contextBridge.exposeInMainWorld('madStationDebugInspector'"));
  assert.ok(preload.includes("ipcRenderer.on(channel, listener)"));
  assert.ok(html.includes("Content-Security-Policy"));
  for (const method of ['developerDebugOpenWindow', 'developerDebugCloseWindow', 'developerDebugPublishSnapshot']) {
    assert.ok(appPreload.includes(`${method}:`));
    assert.ok(contract.includes(`${method}(`));
  }
});

test('new debug tools remain synchronized with built-in theme frames', () => {
  const panel = read('src/renderer-react/information-security-panels.tsx');
  const switcher = read('src/home-page-switcher.js');
  for (const key of ['hitTest', 'boxModel', 'focusable', 'clickTrace']) {
    assert.ok(panel.includes(`${key}:`), `Settings UI missing ${key}`);
    assert.ok(switcher.includes(`${key}:`), `Homepage bridge missing ${key}`);
    assert.ok(read('src/developer-visual-debug.js').includes(`${key}:`), `Runtime missing ${key}`);
  }
  assert.ok(panel.includes('Page-wide animations and menu state are never frozen'));
});

test('debug mode has an emergency reset and cannot restore enabled overlays after restart', () => {
  const runtime = read('src/developer-visual-debug.js');
  const switcher = read('src/home-page-switcher.js');
  const panel = read('src/renderer-react/information-security-panels.tsx');
  assert.ok(runtime.includes("String(event.key).toLowerCase() === 'f12'"));
  assert.ok(runtime.includes('emergencyResetDebugMode()'));
  assert.ok(runtime.includes('saved.enabled = false'));
  assert.ok(switcher.includes("message.type === 'developer-debug-emergency-reset'"));
  assert.ok(switcher.includes('settings.enabled = false'));
  assert.ok(panel.includes('Ctrl+Shift+F12'));
  assert.match(read('src/developer-visual-debug.css'), /data-ms-dev-debug-paused-animation="true"/);
});

test('inspector window follows Settings/workspace lifecycle without leaving a second in-page HUD', () => {
  const runtime = read('src/developer-visual-debug.js');
  assert.match(runtime, /function hostHudShouldYieldToThemedHomepage\(\)/);
  assert.match(runtime, /function acceptActiveFrameSnapshot\(event, message\)/);
  assert.match(runtime, /function syncInspectorWindow\(\)/);
  assert.match(runtime, /settings\.enabled && settings\.hud/);
  assert.match(runtime, /'mad:workspace-view-updated', 'madstation:settings-closed'/);
  assert.doesNotMatch(runtime, /function onHudPointerDown\(/);
  assert.doesNotMatch(runtime, /createNode\('section', 'ms-dev-debug-hud'/);
});

test('separate inspector exposes debug settings controls and a searchable, pageable element explorer', () => {
  const html = read('src/developer-debug-window.html');
  const script = read('src/developer-debug-window.js');
  const preload = read('src/developer-debug-window-preload.js');
  const main = read('src/main.js');
  const runtime = read('src/developer-visual-debug.js');
  const switcher = read('src/home-page-switcher.js');
  for (const label of ['Live Inspector', 'Debug Options', 'Element Explorer', 'Visual Legend', 'elementSearchInput', 'elementSearchIncludeHidden', 'elementSearchResults', 'debugSettingsGrid', 'enableDebugModeButton', 'disableDebugModeButton', 'reloadDebugSettingsButton', 'resetDebugSettingsButton']) assert.ok(html.includes(label), `Inspector UI missing ${label}`);
  for (const key of ['outlines', 'containers', 'grid', 'labels', 'overflow', 'hud', 'hoverInspector', 'hitTest', 'boxModel', 'focusable', 'clickTrace', 'pauseAnimations', 'hiddenAudit']) assert.ok(script.includes(`['${key}'`) || script.includes(`['${key},`), `Debug Options tab missing ${key}`);
  assert.ok(preload.includes('getDebugSettings')); assert.ok(preload.includes('setDebugSettings')); assert.ok(preload.includes('searchElements')); assert.ok(preload.includes('highlightElement'));
  assert.ok(main.includes('developer-debug-window-search-elements')); assert.ok(main.includes('developer-debug-window-highlight-element'));
  assert.ok(runtime.includes('collectElementsIncludingOpenShadowRoots'));
  assert.ok(runtime.includes('searchDocumentElements'));
  assert.ok(runtime.includes('highlightDocumentElement'));
  assert.ok(runtime.includes('shadowHostSelectors'));
  assert.ok(switcher.includes("sendToFrame(mode, 'developer-debug-inspector-command'"));
});

test('Developer Options has a session-only keep-unlocked preference and explicit close-section semantics', () => {
  const auth = read('src/main/developer-options-auth.js');
  const panel = read('src/renderer-react/information-security-panels.tsx');
  const renderer = read('src/renderer.js');
  const preload = read('src/preload.ts');
  assert.ok(auth.includes('keepUnlockedForSession'));
  assert.ok(auth.includes('function closeSection()'));
  assert.ok(auth.includes('function setKeepUnlockedForSession(enabled)'));
  assert.ok(panel.includes('Keep Developer Options unlocked until Mad Station closes'));
  assert.ok(panel.includes("requestDeveloperSettingsAction('close-section')"));
  assert.ok(renderer.includes("detail.type === 'close-section'"));
  assert.ok(renderer.includes("detail.type === 'keep-unlocked'"));
  assert.ok(preload.includes('closeDeveloperOptionsSection'));
  assert.ok(preload.includes('setDeveloperOptionsKeepUnlockedForSession'));
});


test('inspector renders every debug toggle before settings IPC resolves and explains overlay colors', () => {
  const html = read('src/developer-debug-window.html');
  const script = read('src/developer-debug-window.js');
  const css = read('src/developer-debug-window.css');
  const runtime = read('src/developer-visual-debug.js');
  assert.ok(script.indexOf('renderDebugSettings();') < script.indexOf('void loadDebugSettings();'), 'safe controls should render before asynchronous saved-settings loading');
  assert.ok(script.includes("byId('enableDebugModeButton')?.addEventListener('click'"));
  assert.ok(script.includes("byId('disableDebugModeButton')?.addEventListener('click'"));
  for (const id of ['tabVisualLegendPanel', 'legend-red-outline', 'legend-blue-outline', 'legend-green-outline', 'legend-overflow-red', 'legend-hover-magenta', 'legend-selected-yellow', 'legend-grid-lines']) assert.ok(html.includes(id), `Visual legend missing ${id}`);
  assert.match(css, /\.legend-grid/);
  assert.match(runtime, /const shouldOpen = settings\.enabled && settings\.hud;[\s\S]*?if \(!shouldOpen\) return;/, 'disabling overlays must not close the inspector used to re-enable them');
});

test('separate inspector debug settings use the BaseWindow control renderer, not nonexistent mainWindow.webContents', () => {
  const main = read('src/main.js');
  const inspector = read('src/developer-debug-window.js');
  const handlerStart = main.indexOf("handleDeveloperDebugWindow('developer-debug-window-get-settings'");
  const handlerEnd = main.indexOf("handleDeveloperDebugWindow('developer-debug-window-highlight-element'", handlerStart);
  assert.ok(handlerStart >= 0 && handlerEnd > handlerStart, 'debug settings and element IPC handlers should use the guarded inspector registrar');
  const handlers = main.slice(handlerStart, main.indexOf("// Developer Settings is protected", handlerStart));
  assert.ok(main.includes('function getMainRendererWebContents()'), 'BaseWindow renderer lookup helper should exist');
  assert.match(main, /const contents = controlView\?\.webContents;/, 'settings must target the WebContentsView renderer');
  assert.doesNotMatch(handlers, /mainWindow\.webContents/, 'BaseWindow must not be treated as owning webContents');
  assert.ok(handlers.includes("contents.send('developer-debug-settings-from-inspector'"));
  assert.ok(handlers.includes("contents.send('developer-debug-inspector-command'"));
  assert.ok(main.includes("handle('developer-debug-settings-changed'"), 'main renderer settings changes should be mirrored back to inspector');
  assert.ok(read('src/preload.ts').includes('developerDebugNotifySettingsChanged'));
  assert.ok(read('src/developer-debug-window-preload.js').includes('onSettingsSync'));
  assert.ok(read('src/renderer.js').includes("window.addEventListener('madstation:developer-debug-settings'"));
  assert.ok(inspector.includes('onSettingsSync'), 'inspector should update when the main settings panel changes');
  assert.ok(inspector.includes('lastConfirmedDebugSettings'), 'failed settings writes should revert to confirmed state');
  assert.ok(inspector.includes('Controls were reverted to the last confirmed state'));
});

test('Debug Mode right-click menu identifies any element and provides agent-ready copy actions', () => {
  const runtime = read('src/developer-visual-debug.js');
  const css = read('src/developer-visual-debug.css');
  const inspectorHtml = read('src/developer-debug-window.html');
  const inspectorScript = read('src/developer-debug-window.js');
  for (const feature of [
    "window.addEventListener('contextmenu', onElementContextMenu",
    'if (!settings.enabled) return;',
    'if (event.shiftKey) return;',
    'function openElementContextMenu(element, x, y, worldObject = null)',
    'Copy element ID',
    'Copy CSS selector',
    'Copy agent-ready reference',
    'Copy ancestor chain and IDs',
    'Copy bounding box / coordinates',
    'Copy diagnostic JSON',
    'Copy sanitized outerHTML',
    'Inspect parent element…',
    'Inspect nearest interactive control…',
    'function makeAgentReference(element, pointer = {})',
    'function contextSelectionSnapshot(element, x, y)',
    'contextSelection: lastContextSelection',
  ]) assert.ok(runtime.includes(feature), `Right-click debug menu is missing ${feature}`);
  assert.match(css, /\.ms-dev-debug-context-menu[\s\S]*?pointer-events:\s*auto\s*!important/);
  assert.match(css, /\.ms-dev-debug-context-menu \*/);
  for (const id of ['contextSelectionSection', 'contextSelectionTag', 'contextSelectionId', 'contextSelectionSelector', 'contextSelectionParent', 'copyContextAgentReferenceButton', 'copyContextJsonButton']) {
    assert.ok(inspectorHtml.includes(id), `Inspector right-click selection UI missing ${id}`);
  }
  assert.ok(inspectorScript.includes('snapshot.contextSelection'), 'Inspector should retain the right-click selection when the pointer moves away');
  assert.ok(inspectorScript.includes("byId('copyContextAgentReferenceButton')"));
});

test('Debug Mode can temporarily hide right-clicked elements and restore every hide from the separate Inspector', () => {
  const runtime = read('src/developer-visual-debug.js');
  const css = read('src/developer-visual-debug.css');
  const html = read('src/developer-debug-window.html');
  const script = read('src/developer-debug-window.js');
  const preload = read('src/developer-debug-window-preload.js');
  const main = read('src/main.js');
  assert.ok(runtime.includes("addAction('Hide element temporarily'"));
  assert.ok(runtime.includes('function hideDebugElement(element)'));
  assert.ok(runtime.includes('function unhideDebugElement(token)'));
  assert.ok(runtime.includes('function restoreAllDebugHiddenElements'));
  assert.ok(runtime.includes('data-ms-dev-debug-hidden-id'));
  assert.match(runtime, /if \(settings\.enabled && !nextSettings\.enabled\)[\s\S]*?restoreAllDebugHiddenElements/);
  assert.match(css, /data-ms-dev-debug-hidden="true"[\s\S]*?display:\s*none\s*!important/);
  assert.match(css, /data-ms-dev-debug-revealed="true"[\s\S]*?position:\s*fixed\s*!important/);
  assert.ok(html.includes('Temporarily hidden by Debug Mode'));
  assert.ok(html.includes('id="unhideAllElementsButton"'));
  assert.ok(html.includes('id="debugHiddenElementsList"'));
  assert.match(html, /id="elementSearchIncludeHidden" type="checkbox" checked/);
  assert.ok(script.includes('function renderDebugHiddenElements(items)'));
  assert.ok(script.includes("manageHiddenElements?.('unhide', button.dataset.token || '')"));
  assert.ok(script.includes("manageHiddenElements?.('unhide-all')"));
  assert.ok(preload.includes('manageHiddenElements:'));
  assert.ok(main.includes("handleDeveloperDebugWindow('developer-debug-window-manage-hidden-elements'"));
  assert.ok(main.includes("['unhide', 'unhide-all'].includes(action)"), 'The main process must allowlist hidden-element actions');
  assert.ok(main.includes('debugHiddenElements: debugHiddenValue.slice(0, 200)'), 'Snapshot forwarding must keep the hidden-element list bounded');
});

test('Element Explorer searches all DOM tags and hidden results can be revealed for a short inspection', () => {
  const runtime = read('src/developer-visual-debug.js');
  const html = read('src/developer-debug-window.html');
  const script = read('src/developer-debug-window.js');
  assert.ok(runtime.includes('return [document.documentElement, ...collectElementsIncludingOpenShadowRoots(document.documentElement || document.body)]'));
  assert.ok(runtime.includes("element.setAttribute('data-ms-dev-debug-revealed', 'true')"));
  assert.ok(runtime.includes("current.setAttribute('data-ms-dev-debug-reveal-ancestor', 'true')"));
  assert.ok(runtime.includes('temporarilyRevealedNodes = []'));
  assert.match(script, /item\.hidden \? 'Reveal & highlight' : 'Highlight'/);
  assert.ok(html.includes('including hidden nodes, non-rendering tags, and descendants of open shadow roots'));
  assert.ok(html.includes('Closed shadow roots and isolated third-party pages are not inspectable by design'));
});

test('Isometric World Debug Mode maps canvas coordinates, resolves overlaid labels, and restores scene hides', () => {
  const runtime = read('src/developer-visual-debug.js');
  const world = read('src/home-isometric-world.html');
  const inspector = read('src/developer-debug-window.js');

  assert.ok(runtime.includes("'home-isometric-world.html': 'madstation-home-isometric-world'"), 'isometric frame must accept its private debug channel');
  assert.match(runtime, /'isometric-world':\s*\{ id: 'launcherIsometricWorldScreen', channel: 'madstation-home-isometric-world' \}/,
    'host snapshot routing must recognize the isometric frame');
  assert.match(runtime, /worldLabel = path\.find[\s\S]*?getObject\(`app:\$\{worldLabel\.dataset\.id\}`\)/,
    'right-clicking a floating DOM label should select its 3D building');
  assert.match(runtime, /worldCanvasInPath[\s\S]*?getObjectAt\?\.\(event\.clientX, event\.clientY\)/,
    'right-clicking 3D geometry should use scene picking');
  assert.match(runtime, /if \(record\?\.worldObject\)[\s\S]*?showObject\?\.\(record\.worldObject\.owner\)/,
    'unhide-all and debug cleanup should restore hidden 3D objects');
  assert.match(world, /getBoundingClientRect\(\)[\s\S]*?const x = \(Number\(clientX\) - rect\.left\) \* scaleX[\s\S]*?pickAt\(x, y\)/,
    'scene picking should account for canvas offsets and CSS scaling');
  assert.match(world, /drawDebugWorldOutlines\(\);/,
    'world-space highlights must be drawn on the canvas after scene rendering');
  assert.match(world, /rgba\(0, 244, 255, \.94\)/,
    'object outlines should use a visible high-contrast color');
  assert.match(inspector, /item\.kind === 'world-object'[\s\S]*?Scene reference:/,
    'the separate Inspector should label hidden 3D world objects clearly');
});

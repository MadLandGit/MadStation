const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

function section(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(from, -1, `missing section start ${start}`);
  assert.notEqual(to, -1, `missing section end ${end}`);
  return source.slice(from, to);
}

test('Home has separate Arrange and Customize controls with explicit Done and Cancel actions', () => {
  const html = read('src/renderer.html');
  const editor = read('src/home-layout-editor.js');
  assert.match(html, /id="homeCustomizeBtn"/);
  assert.match(html, /id="homeArrangeBtn"/);
  assert.match(html, /id="homeLayoutEditorBar"/);
  assert.match(html, /id="homeLayoutCancelBtn"/);
  assert.match(html, /id="homeLayoutDoneBtn"/);
  assert.match(html, /Drag companion apps within the Hub Companions panel/);
  assert.match(editor, /\$\('#homeLayoutDoneBtn'\)\?\.addEventListener\('click',[\s\S]*?leaveArrangeMode\(false\)/);
  assert.match(editor, /\$\('#homeLayoutCancelBtn'\)\?\.addEventListener\('click',[\s\S]*?leaveArrangeMode\(true\)/);
});

test('Arrange creates a dedicated Hub Companions workspace with a top-edge title', () => {
  const editor = read('src/home-layout-editor.js');
  const css = read('src/home.css');
  const create = section(editor, 'function createCompanionArrangeWorkspace()', 'function syncCompanionArrangeWorkspace()');
  assert.match(create, /className = 'home-companion-arrange-workspace'/);
  assert.match(create, /home-companion-arrange-title">Hub companions/);
  assert.match(create, /home-companion-arrange-list/);
  assert.match(create, /tools\.appendChild\(companionArrangeWorkspace\)/);
  assert.match(css, /\.home-companion-arrange-title\s*\{[^}]*position: absolute;\s*top: -11px/s);
  assert.match(css, /\.home-stage\[data-home-arranging="true"\] #homeAppsReactMount \{ display: none !important; \}/);
});

test('Companions are copied into an isolated draft; source React cards are never dragged or repositioned', () => {
  const editor = read('src/home-layout-editor.js');
  const sync = section(editor, 'function syncCompanionArrangeWorkspace()', 'function sameOrder(');
  assert.match(sync, /#homeAppsReactMount \.home-module\[data-app-id\]:not\(\.home-module--more\)/);
  assert.match(sync, /source\.cloneNode\(true\)/);
  assert.match(sync, /card\.classList\.add\('home-companion-arrange-item'\)/);
  assert.match(sync, /card\.setAttribute\('draggable', 'false'\)/);
  assert.match(sync, /list\.replaceChildren\(\.\.\.nodes\)/);
  assert.match(sync, /if \(!active \|\| !companionArrangeWorkspace\?\.isConnected \|\| companionPointerDrag\) return/);
  assert.match(editor, /mount\.setAttribute\('aria-hidden', 'true'\)/);
  assert.match(editor, /mount\?\.removeAttribute\('aria-hidden'\)/);
});

test('Companion reorder uses a release-to-place gesture with no native drag image or floating preview', () => {
  const editor = read('src/home-layout-editor.js');
  const css = read('src/home.css');
  assert.match(editor, /let companionPointerDrag = null/);
  assert.match(editor, /function onCompanionPointerDown\(event\)/);
  assert.match(editor, /item\.setPointerCapture\?\.\(pointerId\)/);
  assert.match(editor, /function companionDropPositionAt\(x, y\)/);
  assert.match(editor, /function onCompanionPointerMove\(event\)/);
  assert.match(editor, /drag\.item\.classList\.add\('is-companion-dragging'\)/);
  assert.match(editor, /function onCompanionPointerUp\(event\)/);
  assert.match(editor, /list\.insertBefore\(drag\.item, position\.after \? position\.item\.nextSibling : position\.item\)/);
  assert.match(editor, /function releaseCompanionPointer\(drag\)/);
  assert.doesNotMatch(editor, /addEventListener\('dragstart'|addEventListener\('dragover'|addEventListener\('drop'|setDragImage\(/);
  assert.doesNotMatch(editor, /home-layout-companion-preview|companionPreview|updateCompanionPreview/);
  assert.match(css, /\.home-stage\[data-home-arranging="true"\] \.home-companion-arrange-item\s*\{[^}]*-webkit-user-drag: none;[^}]*touch-action: none;/s);
  assert.match(css, /\.home-stage\[data-home-arranging="true"\] \.home-companion-arrange-item\.is-companion-dragging\s*\{[^}]*opacity: \.35/s);
});

test('Draft order changes only on pointer release and is persisted only by Done', () => {
  const editor = read('src/home-layout-editor.js');
  const drop = section(editor, 'function onCompanionPointerUp(event)', 'function onCompanionPointerCancel(event)');
  const commit = section(editor, 'function commitCompanionWorkspaceOrder()', 'function destroyCompanionArrangeWorkspace()');
  const leave = section(editor, 'function leaveArrangeMode(restore)', 'function onKeyDown(event)');
  assert.match(drop, /const position = drag\.started \? companionDropPositionAt\(event\.clientX, event\.clientY\) : null/);
  assert.match(drop, /list\.insertBefore|list\.appendChild/);
  assert.doesNotMatch(drop, /MadHomeCustomizer\?\.reorder/);
  assert.match(commit, /window\.MadHomeCustomizer\?\.reorder\?\.\('companions', next\)/);
  assert.match(leave, /if \(!restore && !commitCompanionWorkspaceOrder\(\)\)/);
  assert.match(leave, /if \(restore && snapshot\)[\s\S]*?KINDS\.forEach\(\(kind\) => window\.MadHomeCustomizer\?\.reorder\?\.\(kind, snapshot\.orders\[kind\]\)\)/);
});

test('Done, Cancel, and interrupted gestures always clear pointer state before releasing capture', () => {
  const editor = read('src/home-layout-editor.js');
  assert.match(editor, /companionPointerDrag = null;[\s\S]*?releasePointerCapture\(drag\.pointerId\)/);
  assert.match(editor, /function onCompanionPointerCancel\(event\)/);
  assert.match(editor, /function onPointerCancel\(event\)[\s\S]*?onCompanionPointerCancel\(event\)/);
  assert.match(editor, /function onCompanionPointerLostCapture\(event\)/);
  assert.match(editor, /function onLostPointerCapture\(event\)[\s\S]*?onCompanionPointerLostCapture/);
  // Shared lost-capture routing is implemented through the current companion state.
  assert.match(editor, /if \(companionPointerDrag && event\.pointerId === companionPointerDrag\.pointerId\) onCompanionPointerLostCapture\(event\)/);
  assert.match(editor, /function onWindowBlur\(\)[\s\S]*?hadCompanionDrag[\s\S]*?releaseCompanionPointer\(companionPointerDrag\)/);
  assert.match(editor, /if \(companionPointerDrag && event\.button === 0\) \{[\s\S]*?onCompanionPointerUp\(/);
  assert.match(editor, /window\.addEventListener\('mouseup', onMouseUpFallback, true\)/);
});

test('Cancel discards draft companion ordering and restores the full registry snapshot', () => {
  const editor = read('src/home-layout-editor.js');
  const commit = section(editor, 'function commitCompanionWorkspaceOrder()', 'function destroyCompanionArrangeWorkspace()');
  const leave = section(editor, 'function leaveArrangeMode(restore)', 'function onKeyDown(event)');
  assert.match(editor, /function orderSnapshot\(\)[\s\S]*?orders: Object\.fromEntries\(KINDS\.map/);
  assert.match(commit, /const visibleIds = registry\.filter\(\(item\) => item\.enabled !== false\)/);
  assert.match(commit, /visibleIds\.some\(\(id\) => !draftSet\.has\(id\)\)/, 'stale or incomplete draft lists cannot be saved');
  assert.match(commit, /const next = current\.map\(\(id\) => visibleSet\.has\(id\) \? draft\[cursor\+\+\] : id\)/, 'disabled apps keep their registry slots');
  assert.match(leave, /if \(restore && snapshot\)[\s\S]*?snapshot\.widgetPositions/);
  assert.match(leave, /destroyCompanionArrangeWorkspace\(\)/);
});

test('Top mini app and central AI Hub stay fixed; only the widget canvas has a stage drop zone', () => {
  const editor = read('src/home-layout-editor.js');
  const css = read('src/home.css');
  const zones = section(editor, 'function drawZones()', 'function zoneAtPoint(');
  assert.match(editor, /all\('#homeMiniApps \.home-mini-app-tile\[data-app-id\]'\)\.forEach\(\(element\) => \{[\s\S]*?element\.removeAttribute\('draggable'\)/);
  assert.match(zones, /zones = \['core', 'widgets'\]\.map/);
  assert.match(zones, /zones = \['core', 'widgets'\]\.map/);
  assert.doesNotMatch(zones, /zones = \[[^\]]*'miniApps'|zones = \[[^\]]*'companions'/);
  assert.match(editor, /if \(kind === 'core' && coreRect\)/);
  assert.match(css, /\.home-stage\[data-home-arranging="true"\] \.home-core-btn \{ pointer-events: none; cursor: not-allowed; \}/);
  assert.match(read('src/renderer.html'), /top mini app and AI Hub stay fixed/);
});

test('Arrange mode exposes enabled companions and redirects Home Core connectors to the draft rows', () => {
  const apps = read('src/home-apps.js');
  const core = read('src/home-apps.js');
  const editor = read('src/home-layout-editor.js');
  assert.match(apps, /const arranging = stage\.dataset\.homeArranging === 'true'/);
  assert.match(apps, /if \(arranging\)[\s\S]*?capacity = list\.length/);
  assert.match(core, /#homeApps \.home-companion-arrange-item:not\(\.is-off\)/);
  assert.match(core, /#homeAppsReactMount \.home-module:not\(\.is-off\)/);
  assert.match(editor, /window\.MadHomeApps\?\.rebuild\?\.\(\)/);
  assert.match(editor, /document\.addEventListener\('mad:home-apps-built', refreshForRegistryChange\)/);
});

test('Hub Companions workspace uses a bounded, scrollable list with fixed-size rows', () => {
  const css = read('src/home.css');
  assert.match(css, /\.home-companion-arrange-workspace\s*\{[^}]*display: flex;[^}]*flex-direction: column;[^}]*min-height: 0;[^}]*border: 1px dashed/s);
  assert.match(css, /\.home-companion-arrange-list\s*\{[^}]*overflow-y: auto;[^}]*overscroll-behavior: contain/s);
  assert.match(css, /\.home-stage\[data-home-arranging="true"\] \.home-companion-arrange-item\s*\{[^}]*height: var\(--home-arrange-companion-row, 52px\) !important/s);
  assert.match(css, /@media \(max-width: 940px\)[\s\S]*?\.home-companion-arrange-workspace/);
  assert.match(css, /\.home-companion-arrange-list\.is-empty::after\s*\{[^}]*No enabled companion apps/s);
});

test('Widgets retain bounded pointer dragging and their non-interactive visual preview', () => {
  const editor = read('src/home-layout-editor.js');
  const css = read('src/home.css');
  assert.match(editor, /const POINTER_DRAG_THRESHOLD = 4/);
  assert.match(editor, /function widgetDropPlacement\(id, event\)/);
  assert.match(editor, /function ensureWidgetPreview\(sourceWidget\)/);
  assert.match(editor, /function updateWidgetPreview\(event\)/);
  assert.match(editor, /if \(dragging\?\.kind !== 'widgets'\) return/);
  assert.match(editor, /function clearWidgetPreview\(\)/);
  assert.match(editor, /function finishPointerDrag\(event, cancelled = false\)/);
  assert.match(css, /\.home-stage\[data-home-arranging="true"\] \.home-widget-list\[data-layout="free"\] > \.home-layout-widget-preview\s*\{[^}]*pointer-events: none !important;[^}]*border: 2px dashed/s);
});

test('Widget size presets and saved coordinates do not resize the Home stage', () => {
  const editor = read('src/home-layout-editor.js');
  const css = read('src/home.css');
  assert.match(editor, /const WIDGET_SIZES = \{\s*small: \{ width: 260, height: 150 \},\s*medium: \{ width: 300, height: 220 \},\s*large: \{ width: 340, height: 280 \}/s);
  assert.match(editor, /const preset = WIDGET_SIZES\[element\?\.dataset\?\.size\] \|\| WIDGET_SIZES\.medium/);
  assert.match(editor, /Object\.keys\(storedWidgetPositions\(\)\)\.length > 0 && widgetCanvas\(\)/);
  assert.doesNotMatch(css, /\.home-stage\[data-home-arranging="true"\]\s*\{[^}]*width: min\(2200px/s);
  assert.match(css, /\.home-stage\[data-home-widget-canvas-expanded="true"\] #homeWidgets\.home-widget-list\[data-layout="free"\]\s*\{[^}]*position: absolute; left: calc\(50% \+ var\(--core\) \/ 2 \+ var\(--gut\)\)/s);
  assert.match(css, /\.home-stage\s*\{[^}]*grid-template-rows: var\(--core\)/s);
});

test('Home Core follows the draft companion rows while arrangement mode is open', () => {
  const companions = read('src/home-apps.js');
  const core = read('src/home-core-system.js');
  const editor = read('src/home-layout-editor.js');
  assert.match(companions, /anchor: 'left', grouping: 'single'/);
  assert.match(companions, /#homeApps \.home-companion-arrange-item:not\(\.is-off\)/);
  assert.match(core, /const left = items\.filter\(\(item\) => item\.anchor === 'left'\)/);
  assert.match(core, /function drawLinks\(/);
  assert.match(editor, /window\.MadHomeCore\?\.refresh\(\)/);
});

test('Opening Appearance or leaving Home cancels Arrange and returns ownership to React', () => {
  const editor = read('src/home-layout-editor.js');
  assert.match(editor, /document\.addEventListener\('madstation:settings-opening', \(\) => \{ if \(active\) leaveArrangeMode\(true\); \}\)/);
  assert.match(editor, /document\.addEventListener\('mad:workspace-view-updated',[\s\S]*?leaveArrangeMode\(true\)/);
  assert.match(editor, /destroyCompanionArrangeWorkspace\(\)/);
  assert.match(editor, /mount\?\.removeAttribute\('aria-hidden'\)/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Memory monitor React entry is wired into Vite, renderer HTML, canonical tests, and the developer-source package filter', () => {
  const html = read('src/renderer.html');
  const vite = read('vite.config.ts');
  const pkg = JSON.parse(read('package.json'));
  assert.match(vite, /'memory-monitor-react': resolve\(__dirname, 'src\/renderer-react\/memory-monitor\.tsx'\)/);
  assert.match(html, /src="\.\.\/build\/memory-monitor-react\.js"/);
  assert.match(pkg.scripts.test, /tests\/renderer-react-memory-monitor\.test\.js/);
  const sourceFilters = pkg.build.extraResources.filter((resource) => resource.from === 'src').flatMap((resource) => resource.filter || []);
  assert.equal(sourceFilters.filter((entry) => entry === 'renderer-react/memory-monitor.tsx').length, 1);
});

test('RAM monitor React entry avoids unused React DOM type imports under noUnusedLocals', () => {
  const component = read('src/renderer-react/memory-monitor.tsx');
  assert.match(component, /^import \{ createRoot \} from 'react-dom\/client';/m);
  assert.doesNotMatch(component, /\btype Root\b/);
});

test('React owns all seven RAM monitor mounts and renders home/compact/detail views as text and JSX', () => {
  const component = read('src/renderer-react/memory-monitor.tsx');
  for (const mount of ['aiLabRamMonitorMount', 'aiHubRamMonitorMount', 'videoHubRamMonitorMount', 'imageHubRamMonitorMount', 'clipboardRamMonitorMount', 'launcherRamMonitorMount', 'forgeRamMonitorMount']) {
    assert.match(component, new RegExp(mount));
  }
  assert.match(component, /function HomeMonitor/);
  assert.match(component, /mad:home-widgets-built/);
  assert.match(component, /new MutationObserver\(syncRoots\)/);
  assert.match(component, /observer\.observe\(homeWidgets, \{ childList: true, subtree: true \}\)/);
  assert.match(component, /new Map<string, \{ scope: MemoryMonitorScope; host: HTMLElement; root: ReturnType<typeof createRoot> \}>/);
  assert.match(component, /System CPU utilization/);
  assert.match(component, /model\.systemCpuLabel/);
  assert.match(component, /function CompactMonitor/);
  assert.match(component, /function DetailedMonitor/);
  assert.match(component, /model\.processRows\.map/);
  // Preserve the CSS contract used to color the home RAM breakdown segments and legend.
  for (const segment of ['main', 'browser', 'gpu', 'other']) {
    assert.match(component, new RegExp(`data-memory-bar=\"${segment}\"`));
    assert.match(component, new RegExp(`data-seg=\"${segment}\"`));
  }
  assert.doesNotMatch(component, /dangerouslySetInnerHTML|\.innerHTML/);
});

test('Host remains responsible for telemetry calculation and publishes a bounded display-only view model', () => {
  const renderer = read('src/renderer.js');
  const start = renderer.indexOf('function renderMemoryMonitor(snapshot)');
  const end = renderer.indexOf('\nasync function reclaimMemoryFromUi()', start);
  assert.ok(start >= 0 && end > start);
  const body = renderer.slice(start, end);
  for (const field of ['totalLabel', 'compactTotalLabel', 'sessionsLabel', 'processRows', 'sparkLine', 'sparkArea', 'systemCpuPercent', 'systemCpuLabel']) assert.ok(body.includes(field), `expected ${field} in telemetry view model`);
  assert.match(body, /memoryMonitorReactRenderer\(viewModel\)/);
  assert.match(body, /if \(memoryProcessesModalOpen\) renderMemoryProcessTable\(snapshot\)/);
  assert.match(body, /processRows: processList\.slice\(0, 100\)\.map/);
});

test('React actions are closed and checked against current workspace and lock state in the host', () => {
  const renderer = read('src/renderer.js');
  const start = renderer.indexOf('window.MadStationMemoryMonitor = {');
  const end = renderer.indexOf('\nlet memoryProcessTableReactRenderer', start);
  assert.ok(start >= 0 && end > start);
  const body = renderer.slice(start, end);
  assert.match(body, /\['refresh', 'cleanup', 'details'\]\.includes\(action\)/);
  assert.match(body, /!RAM_MONITOR_APPS\.has\(currentApp\)/);
  assert.match(body, /state\.locked/);
  assert.match(body, /refreshMemoryMonitor\(\)/);
  assert.match(body, /reclaimMemoryFromUi\(\)/);
  assert.match(body, /openMemoryProcessesModal\(\)/);
});

test('Startup fallback retains the monitor shell but renders process names with text nodes rather than HTML strings', () => {
  const renderer = read('src/renderer.js');
  const start = renderer.indexOf('function installMemoryMonitors()');
  const end = renderer.indexOf('\nwindow.MadStationMemoryMonitor', start);
  assert.ok(start >= 0 && end > start);
  const installer = renderer.slice(start, end);
  assert.match(installer, /memoryMonitorMarkup\(scope\)/);
  const renderStart = renderer.indexOf('function renderMemoryMonitor(snapshot)');
  const renderEnd = renderer.indexOf('\nasync function reclaimMemoryFromUi()', renderStart);
  const body = renderer.slice(renderStart, renderEnd);
  assert.match(body, /details\.replaceChildren\(\)/);
  assert.match(body, /name\.textContent = process\.name/);
  assert.match(body, /ram\.textContent = process\.ram/);
  assert.doesNotMatch(body, /details\.innerHTML/);
});

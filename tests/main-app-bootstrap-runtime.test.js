const test = require('node:test');
const assert = require('node:assert/strict');
const { registerAppBootstrapRuntime } = require('../build/main/app-bootstrap-runtime.js');

function harness(platform = 'win32', overrides = {}) {
  const calls = [];
  const handlers = new Map();
  let readyResolve;
  let readyReject;
  const app = {
    whenReady: () => new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; }),
    on: (event, callback) => handlers.set(event, callback),
  };
  let mainWindow = null;
  const dependencies = {
    app,
    platform,
    loadConfiguration: () => calls.push('loadConfiguration'),
    cleanupRetiredRuntimeData: () => calls.push('cleanupRetiredRuntimeData'),
    disableApplicationMenu: () => calls.push('disableApplicationMenu'),
    initializeSecurityState: () => calls.push('initializeSecurityState'),
    configureDefaultSessionSecurity: () => calls.push('configureDefaultSessionSecurity'),
    writeStartupDiagnostic: (kind) => calls.push(['diagnostic', kind]),
    createMainWindow: () => { calls.push('createMainWindow'); mainWindow = {}; },
    applyLiveAppSettings: () => calls.push('applyLiveAppSettings'),
    startLockWatchers: () => calls.push('startLockWatchers'),
    warmRemoteIconsAndPush: () => calls.push('warmRemoteIconsAndPush'),
    getMainWindow: () => mainWindow,
    quit: () => calls.push('quit'),
    onStartupError: (error) => calls.push(['startupError', error.message]),
    ...overrides,
  };
  registerAppBootstrapRuntime(dependencies);
  return { calls, handlers, resolveReady: () => readyResolve(), rejectReady: (error) => readyReject(error), setMainWindow: (value) => { mainWindow = value; } };
}

test('app-ready bootstrap keeps config/security setup before the window and live startup after it', async () => {
  const h = harness();
  h.resolveReady();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(h.calls, [
    'loadConfiguration', 'cleanupRetiredRuntimeData', 'disableApplicationMenu', 'initializeSecurityState',
    'configureDefaultSessionSecurity', ['diagnostic', 'app-ready-config-loaded'], 'createMainWindow',
    ['diagnostic', 'main-window-created'], 'applyLiveAppSettings', 'startLockWatchers', 'warmRemoteIconsAndPush',
  ]);
});

test('activate recreates a missing main window and window-all-closed quits only off macOS', async () => {
  const h = harness('win32');
  h.resolveReady();
  await new Promise((resolve) => setImmediate(resolve));
  h.calls.length = 0;
  h.handlers.get('activate')();
  assert.deepEqual(h.calls, []);
  h.setMainWindow(null);
  h.handlers.get('activate')();
  assert.deepEqual(h.calls, ['createMainWindow']);
  h.handlers.get('window-all-closed')();
  assert.equal(h.calls.at(-1), 'quit');
  const mac = harness('darwin');
  mac.handlers.get('window-all-closed')();
  assert.deepEqual(mac.calls, []);
});

test('app-ready failures are forwarded to the existing fatal startup handler', async () => {
  const h = harness();
  h.rejectReady(new Error('startup failed'));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(h.calls, [['startupError', 'startup failed']]);
});

test('bootstrap runtime is wired into main.js and included in the production module list', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.join(__dirname, '..');
  const main = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.match(main, /registerAppBootstrapRuntime\(\{/);
  assert.match(pkg.scripts['build:main-modules'], /src\/main\/app-bootstrap-runtime\.ts/);
  assert.ok(pkg.build.extraResources.some((resource) => resource.from === 'src' && resource.filter.includes('main/app-bootstrap-runtime.ts')));
});

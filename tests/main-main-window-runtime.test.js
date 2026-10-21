const test = require('node:test');
const assert = require('node:assert/strict');
const { createMainWindowRuntime } = require('../build/main/main-window-runtime.js');

function harness(overrides = {}) {
  const calls = [];
  const events = new Map();
  const childEvents = new Map();
  const config = {
    settings: { startMaximized: true, restoreLastAccount: true, security: { contentProtection: true, lockOnMinimize: true } },
    accounts: [{ id: 'first', preferences: {} }, { id: 'startup', preferences: { openOnStartup: true } }],
    activeId: 'first',
    accountOrder: ['first', 'startup'],
  };
  const account = { id: 'startup', preferences: { openOnStartup: true } };
  const controlView = { webContents: { once(_event, callback) { events.set('did-finish-load', callback); }, send(channel, payload) { calls.push(['send', channel, payload]); }, isDestroyed() { return false; } } };
  const window = {
    maximize() { calls.push('maximize'); },
    setContentProtection(value) { calls.push(['contentProtection', value]); },
    on(name, callback) { events.set(name, callback); },
  };
  let mainWindow = null;
  let activeId = null;
  const deps = {
    createWindow: (options) => { calls.push(['createWindow', options]); return window; },
    iconPath: '/app/assets/icon.png',
    getConfig: () => config,
    getSecurity: () => config.settings.security,
    getLocked: () => false,
    getWorkspaceApp: () => 'ai-hub',
    getActiveId: () => activeId,
    setActiveId: (id) => { activeId = id; calls.push(['activeId', id]); },
    getAccount: (id) => config.accounts.find((item) => item.id === id) || null,
    orderedConfigItems: (accounts, order) => [...accounts].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)),
    setMainWindow: (value) => { mainWindow = value; calls.push('setMainWindow'); },
    createControlView: () => calls.push('createControlView'),
    createToolbarView: () => calls.push('createToolbarView'),
    getControlView: () => controlView,
    createAccountView: (value) => calls.push(['createAccountView', value?.id || null]),
    positionViews: () => calls.push('positionViews'),
    lockApp: () => calls.push('lockApp'),
    getChildWindows: () => new Set([{ close() { calls.push('closeChild'); } }]),
    clearWindowReferences: () => { mainWindow = null; calls.push('clearWindowReferences'); },
    clearContentViews: () => calls.push('clearContentViews'),
    safeConfigForRenderer: () => ({ safe: true }),
    writeStartupDiagnostic: (kind) => calls.push(['diagnostic', kind]),
    ...overrides,
  };
  return { deps, calls, events, config, window, controlView, getMainWindow: () => mainWindow, getActiveId: () => activeId };
}

test('main window creates child views after publishing the window and preserves startup selection order', () => {
  const h = harness();
  const result = createMainWindowRuntime(h.deps);
  assert.equal(result, h.window);
  assert.equal(h.getMainWindow(), h.window);
  assert.deepEqual(h.calls.slice(0, 4).map((item) => Array.isArray(item) ? item[0] : item), ['createWindow', 'setMainWindow', 'createControlView', 'createToolbarView']);
  assert.equal(h.getActiveId(), 'startup', 'openOnStartup overrides restored id');
  assert.ok(h.calls.some((item) => Array.isArray(item) && item[0] === 'createAccountView' && item[1] === 'startup'));
  assert.ok(h.calls.includes('maximize'));
  assert.ok(h.calls.some((item) => Array.isArray(item) && item[0] === 'contentProtection' && item[1] === true));
});

test('renderer ready pushes safe config before active account and repositions views', () => {
  const h = harness();
  createMainWindowRuntime(h.deps);
  h.calls.length = 0;
  h.events.get('did-finish-load')();
  assert.deepEqual(h.calls.filter((item) => Array.isArray(item) && item[0] === 'diagnostic'), [['diagnostic', 'control-renderer-loaded']]);
  const sent = h.calls.filter((item) => Array.isArray(item) && item[0] === 'send');
  assert.deepEqual(sent, [['send', 'config', { safe: true }], ['send', 'active-changed', { id: 'startup' }]]);
  assert.equal(h.calls.at(-1), 'positionViews');
});

test('window resize/minimize/close lifecycle delegates layout, lock and cleanup in order', () => {
  const h = harness();
  createMainWindowRuntime(h.deps);
  h.calls.length = 0;
  h.events.get('resize')();
  h.events.get('minimize')();
  h.events.get('closed')();
  assert.deepEqual(h.calls, ['positionViews', 'lockApp', 'closeChild', 'clearWindowReferences', 'clearContentViews']);
  assert.equal(h.getMainWindow(), null);
});

test('locked launch never creates an account view and restored account remains the fallback', () => {
  const h = harness({ getLocked: () => true, getConfig: () => ({ ...harness().config, accounts: [{ id: 'first' }], settings: { restoreLastAccount: true }, activeId: 'first', accountOrder: ['first'] }) });
  createMainWindowRuntime(h.deps);
  assert.equal(h.getActiveId(), 'first');
  assert.equal(h.calls.some((item) => Array.isArray(item) && item[0] === 'createAccountView'), false);
});

test('main window lifecycle module is wired by main.js and included in the production module list', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.join(__dirname, '..');
  const main = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.match(main, /createMainWindowRuntime\(\{/);
  assert.match(pkg.scripts['build:main-modules'], /src\/main\/main-window-runtime\.ts/);
  assert.ok(pkg.build.extraResources.some((resource) => resource.from === 'src' && resource.filter.includes('main/main-window-runtime.ts')));
});

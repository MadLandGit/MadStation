const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { registerVideoHubIpcHandlers } = require('../build/main/video-hub-ipc.js');

function makeRegistrar() {
  const handlers = new Map();
  const handle = (channel, handler, options) => {
    assert.equal(handlers.has(channel), false, `duplicate handler: ${channel}`);
    handlers.set(channel, { handler, options });
  };
  return { handle, handlers };
}

function makeCommands(calls) {
  const names = [
    'getState', 'getNetworkMode', 'setNetworkMode', 'addProvider', 'deleteProvider',
    'addAccount', 'renameAccount', 'deleteAccount', 'resetLogin', 'setActiveAccount',
    'setLayout', 'setSettingsOverlay', 'setNotificationOverlay', 'navigate',
    'openInBrowser', 'suspendBrowsers',
  ];
  return Object.fromEntries(names.map((name) => [name, (...args) => {
    calls.push([name, ...args]);
    return `${name}-result`;
  }]));
}

test('Video Hub IPC module preserves established channel names and registration order', () => {
  const registrar = makeRegistrar();
  registerVideoHubIpcHandlers(registrar.handle, makeCommands([]));
  assert.deepEqual([...registrar.handlers.keys()], [
    'video-hub-get-state', 'video-hub-get-network-mode', 'video-hub-set-network-mode',
    'video-hub-add-provider', 'video-hub-delete-provider', 'video-hub-add-account',
    'video-hub-rename-account', 'video-hub-delete-account', 'video-hub-reset-login',
    'video-hub-set-active-account', 'video-hub-set-layout', 'video-hub-settings-overlay',
    'video-hub-notification-overlay', 'video-hub-navigate', 'video-hub-open-in-browser',
    'video-hub-suspend-browsers',
  ]);
});

test('Video Hub IPC delegates arguments unchanged and retains empty-object defaults', () => {
  const registrar = makeRegistrar();
  const calls = [];
  registerVideoHubIpcHandlers(registrar.handle, makeCommands(calls));
  const invoke = (channel, ...args) => registrar.handlers.get(channel).handler({}, ...args);
  assert.equal(invoke('video-hub-get-state'), 'getState-result');
  assert.equal(invoke('video-hub-get-network-mode'), 'getNetworkMode-result');
  assert.equal(invoke('video-hub-set-network-mode', 'system'), 'setNetworkMode-result');
  assert.equal(invoke('video-hub-add-provider', null), 'addProvider-result');
  assert.equal(invoke('video-hub-delete-provider', 'provider-7'), 'deleteProvider-result');
  assert.equal(invoke('video-hub-add-account', undefined), 'addAccount-result');
  assert.equal(invoke('video-hub-rename-account', 'vh-3', 'Studio'), 'renameAccount-result');
  assert.equal(invoke('video-hub-delete-account', 'vh-3'), 'deleteAccount-result');
  assert.equal(invoke('video-hub-reset-login', 'vh-3'), 'resetLogin-result');
  assert.equal(invoke('video-hub-set-active-account', 'vh-5'), 'setActiveAccount-result');
  assert.equal(invoke('video-hub-set-layout', null), 'setLayout-result');
  assert.equal(invoke('video-hub-settings-overlay', true), 'setSettingsOverlay-result');
  assert.equal(invoke('video-hub-notification-overlay', false), 'setNotificationOverlay-result');
  assert.equal(invoke('video-hub-navigate', 'back'), 'navigate-result');
  assert.equal(invoke('video-hub-open-in-browser'), 'openInBrowser-result');
  assert.equal(invoke('video-hub-suspend-browsers'), 'suspendBrowsers-result');
  assert.deepEqual(calls, [
    ['getState'], ['getNetworkMode'], ['setNetworkMode', 'system'], ['addProvider', {}],
    ['deleteProvider', 'provider-7'], ['addAccount', {}], ['renameAccount', 'vh-3', 'Studio'],
    ['deleteAccount', 'vh-3'], ['resetLogin', 'vh-3'], ['setActiveAccount', 'vh-5'],
    ['setLayout', {}], ['setSettingsOverlay', true], ['setNotificationOverlay', false],
    ['navigate', 'back'], ['openInBrowser'], ['suspendBrowsers'],
  ]);
});

test('Video Hub typed IPC module is wired through the secure main registrar and included in builds', () => {
  const root = path.join(__dirname, '..');
  const main = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const source = fs.readFileSync(path.join(root, 'src', 'main', 'video-hub-ipc.ts'), 'utf8');
  assert.match(main, /registerVideoHubIpcHandlers\(handleForWorkspace\('video-hub',[^\r\n]+, \{/);
  assert.match(main, /require\('\.\.\/build\/main\/video-hub-ipc\.js'\)/);
  assert.match(pkg.scripts['build:main-modules'], /src\/main\/video-hub-ipc\.ts/);
  assert.match(pkg.scripts.test, /tests\/main-video-hub-ipc\.test\.js/);
  const resources = pkg.build.extraResources.find((item) => item.from === 'src');
  assert.ok(resources.filter.includes('main/video-hub-ipc.ts'));
  assert.match(main, /'src\/main\/video-hub-ipc\.ts'/);
  assert.match(source, /import type \{ SecureIpcHandle \} from '\.\/settings-ipc\.js'/);
  assert.match(main, /function handle\(channel, fn, options = \{\}\)/);
});

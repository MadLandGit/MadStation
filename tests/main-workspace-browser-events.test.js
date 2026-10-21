const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const { bindAiHubBrowserEvents, bindForgeBrowserEvents, bindVideoHubBrowserEvents, bindArenaBrowserEvents } = require('../build/main/workspace-browser-events.js');

function makeView() {
  const webContents = new EventEmitter();
  Object.assign(webContents, {
    destroyed: false, loading: false, url: 'https://example.test/chat', title: 'Example',
    isDestroyed() { return this.destroyed; }, isLoading() { return this.loading; },
    getURL() { return this.url; }, getTitle() { return this.title; },
    reload() { this.reloaded = true; }, canGoBack() { return true; }, canGoForward() { return true; },
    goBack() { this.wentBack = true; }, goForward() { this.wentForward = true; },
  });
  return { webContents };
}
function common(calls) {
  return {
    normalizeShortcutFromInput: () => 'CTRL+1',
    handleShortcut: () => { calls.push('shortcut'); return true; },
    handleBrowserKey: () => { calls.push('browser-key'); return false; },
    applyZoom: () => calls.push('zoom'),
  };
}

 test('AI Hub events update account runtime, toolbar and title without exposing other accounts', () => {
  const view = makeView(); const calls = []; const runtime = { pageLoads: 0, lastLoadedAt: 0, lastVisitedAt: 0, currentUrl: '', currentTitle: '', lastError: '', navigations: 0 };
  const titles = []; const notices = [];
  bindAiHubBrowserEvents(view, { id: 'a1', name: 'Account 1', url: 'https://example.test' }, {
    ...common(calls), getRuntime: () => runtime, getActiveAccountId: () => 'a1', isLocked: () => false,
    getControlContents: () => ({ isDestroyed: () => false, send: (_channel, payload) => titles.push(payload) }),
    pushToolbar: () => calls.push('toolbar'), notice: (value) => notices.push(value), now: () => 123,
  });
  view.webContents.emit('did-finish-load');
  view.webContents.emit('did-navigate');
  view.webContents.emit('page-title-updated', {}, 'Changed');
  view.webContents.emit('did-fail-load', {}, -2, 'Network failed', 'https://example.test', true);
  view.webContents.emit('dom-ready');
  assert.equal(runtime.pageLoads, 1); assert.equal(runtime.navigations, 1); assert.equal(runtime.currentTitle, 'Changed');
  assert.equal(runtime.lastError, 'Network failed (https://example.test)'); assert.equal(titles[0].title, 'Changed');
  assert.ok(calls.includes('toolbar')); assert.ok(calls.includes('zoom')); assert.deepEqual(notices, ['Account 1: Network failed']);
});

test('AI Hub listeners suppress title events while locked and ignore aborted main-frame loads', () => {
  const view = makeView(); const titles = []; const notices = [];
  const runtime = { pageLoads: 0, lastLoadedAt: 0, lastVisitedAt: 0, currentUrl: '', currentTitle: '', lastError: '', navigations: 0 };
  bindAiHubBrowserEvents(view, { id: 'a1', name: 'A', url: 'https://example.test' }, {
    ...common([]), getRuntime: () => runtime, getActiveAccountId: () => 'a1', isLocked: () => true,
    getControlContents: () => ({ isDestroyed: () => false, send: (_channel, payload) => titles.push(payload) }),
    pushToolbar: () => {}, notice: (value) => notices.push(value), now: () => 1,
  });
  view.webContents.emit('page-title-updated', {}, 'Secret title');
  view.webContents.emit('did-fail-load', {}, -3, 'Aborted', 'https://example.test', true);
  assert.equal(titles.length, 0); assert.equal(notices.length, 0); assert.equal(runtime.lastError, '');
});

test('Forge event listeners maintain navigation metrics and only notify the selected account', () => {
  const view = makeView(); const calls = []; const notices = [];
  const runtime = { pageLoads: 0, lastLoadedAt: 0, lastVisitedAt: 0, currentUrl: '', currentTitle: '', lastError: '', navigations: 0 };
  bindForgeBrowserEvents(view, { id: 'f1', name: 'Forge Account', url: 'https://example.test' }, {
    ...common(calls), getRuntime: () => runtime, getSelectedAccountId: () => 'f1', pushState: () => calls.push('state'),
    notice: (value) => notices.push(value), now: () => 5,
  });
  view.webContents.emit('did-finish-load'); view.webContents.emit('did-navigate-in-page');
  view.webContents.emit('did-fail-load', {}, -2, 'Offline', 'https://example.test', true);
  assert.equal(runtime.pageLoads, 1); assert.equal(runtime.navigations, 1); assert.equal(runtime.lastError, 'Offline (https://example.test)');
  assert.deepEqual(notices, ['Forge Account: Offline']); assert.ok(calls.includes('state'));
});

test('Video Hub keeps navigation policy, safe failure logs, and emits load transitions for its progress bar', () => {
  const view = makeView(); const warnings = []; const calls = []; const loading = [];
  bindVideoHubBrowserEvents(view, { id: 'v1', name: 'Video', url: 'https://video.test' }, {
    applyZoom: () => calls.push('zoom'), hostOf: (url) => new URL(url).hostname, warn: (message) => warnings.push(message),
    onLoadingChange: (value) => loading.push(value),
  });
  view.webContents.emit('did-start-loading');
  view.webContents.emit('did-stop-loading');
  assert.deepEqual(loading.slice(1), [true, false]);
  const event = { prevented: false, preventDefault() { this.prevented = true; } };
  view.webContents.emit('before-input-event', event, { type: 'keyDown', key: 'r', control: true });
  assert.equal(event.prevented, true); assert.equal(view.webContents.reloaded, true);
  view.webContents.emit('did-fail-load', {}, -2, 'bad <tag>', 'https://video.test/path', true);
  assert.match(warnings[0], /host=video\.test/); assert.doesNotMatch(warnings[0], /<tag>/);
  view.webContents.emit('dom-ready'); assert.deepEqual(calls, ['zoom']);
});

test('Arena applies shared keyboard/zoom listeners and emits browser loading transitions', () => {
  const view = makeView(); const calls = []; const loading = [];
  bindArenaBrowserEvents(view, { ...common(calls), onLoadingChange: (value) => loading.push(value) });
  view.webContents.emit('before-input-event', { preventDefault: () => calls.push('prevent') }, { type: 'keyDown', key: '1' });
  view.webContents.emit('did-start-loading');
  view.webContents.emit('did-stop-loading');
  view.webContents.emit('dom-ready');
  assert.deepEqual(calls, ['shortcut', 'prevent', 'zoom']);
  assert.deepEqual(loading.slice(1), [true, false]);
});

test('main.js delegates all four view families to the shared event module and build resources include it', () => {
  const root = path.join(__dirname, '..');
  const main = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.match(main, /require\('\.\.\/build\/main\/workspace-browser-events\.js'\)/);
  for (const fn of ['bindAiHubBrowserEvents', 'bindForgeBrowserEvents', 'bindVideoHubBrowserEvents', 'bindArenaBrowserEvents']) assert.match(main, new RegExp(`${fn}\\(`));
  assert.match(pkg.scripts['build:main-modules'], /src\/main\/workspace-browser-events\.ts/);
  assert.match(pkg.scripts.test, /tests\/main-workspace-browser-events\.test\.js/);
  assert.match(main, /'src\/main\/workspace-browser-events\.ts'/);
  assert.match(JSON.stringify(pkg.build.extraResources), /main\/workspace-browser-events\.ts/);
});

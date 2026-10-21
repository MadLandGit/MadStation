const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createImageHubBrowserRuntime } = require('../build/main/image-hub-browser-runtime.js');

function harness(overrides = {}) {
  const calls = [];
  const childWindows = new Set();
  const layout = { main: { x: 10, y: 20, width: 800, height: 600 } };
  let browserView = null;
  let workspaceApp = overrides.workspaceApp || 'image-hub';
  let locked = Boolean(overrides.locked);
  const states = [];
  const runtime = createImageHubBrowserRuntime({
    layout,
    childWindows,
    getWorkspaceApp: () => workspaceApp,
    isLocked: () => locked,
    getBrowserView: () => browserView,
    setBrowserView: (view) => { browserView = view; calls.push(['setView', view?.id || null]); },
    createNativeView: (account) => {
      calls.push(['create', account.id]);
      return { id: account.id, webContents: {
        destroyed: false,
        loading: true,
        url: account.url,
        title: account.name,
        isDestroyed() { return this.destroyed; },
        isLoading() { return this.loading; },
        getURL() { return this.url; },
        getTitle() { return this.title; },
        canGoBack: () => true,
        canGoForward: () => false,
        goBack: () => calls.push(['back']),
        goForward: () => calls.push(['forward']),
        reload() { calls.push(['reload']); this.loading = true; },
        stop() { calls.push(['stop']); this.loading = false; },
        async loadURL(url) { calls.push(['load', url]); this.url = url; if (overrides.loadError) throw new Error('network error'); },
        close() { calls.push(['close']); this.destroyed = true; },
      } };
    },
    attachView: (view) => calls.push(['attach', view.id]),
    detachView: (view) => calls.push(['detach', view.id]),
    isWebContentsDestroyed: (view) => view.webContents.isDestroyed(),
    closeWebContents: (view) => view.webContents.close(),
    positionViews: () => calls.push(['position']),
    openExternalSafe: async (url) => { calls.push(['external', url]); return overrides.externalOkay !== false; },
    sendState: (state) => states.push(state),
  });
  return { runtime, calls, states, layout, childWindows, getView: () => browserView, setWorkspaceApp: (value) => { workspaceApp = value; }, setLocked: (value) => { locked = value; } };
}

test('Image Hub opens a validated HTTPS URL in an isolated native-view lifecycle', () => {
  const h = harness();
  const result = h.runtime.openBrowser({ accountId: 'account-bing-create', providerId: 'bing-create', name: 'Bing Image Creator', url: 'https://www.bing.com/images/create' });
  assert.equal(result.ok, true);
  assert.equal(result.hasBrowserView, true);
  assert.equal(h.getView().webContents.getURL(), 'https://www.bing.com/images/create');
  assert.ok(h.calls.some((call) => call[0] === 'attach'));
  assert.ok(h.calls.some((call) => call[0] === 'load'));
});

test('Image Hub browser rejects untrusted payloads and non-HTTPS URLs', () => {
  const h = harness();
  assert.equal(h.runtime.openBrowser(null).ok, false);
  assert.equal(h.runtime.openBrowser({ accountId: 'good-id', providerId: 'provider', name: 'Bad', url: 'http://example.com' }).ok, false);
  assert.equal(h.calls.filter((call) => call[0] === 'create').length, 0);
});

test('Image Hub browser fails closed while locked or outside its workspace', () => {
  const locked = harness({ locked: true });
  assert.equal(locked.runtime.openBrowser({ accountId: 'account-x', providerId: 'tool-x', url: 'https://example.com' }).ok, false);
  const elsewhere = harness({ workspaceApp: 'launcher' });
  assert.equal(elsewhere.runtime.openBrowser({ accountId: 'account-x', providerId: 'tool-x', url: 'https://example.com' }).ok, false);
});

test('Image Hub layout validates bounds and navigation routes through WebContents', async () => {
  const h = harness();
  assert.equal(h.runtime.setBrowserLayout({ main: { x: 1, y: 2, width: 700, height: 500 } }).ok, true);
  assert.deepEqual(h.layout.main, { x: 1, y: 2, width: 700, height: 500 });
  assert.equal(h.runtime.setBrowserLayout({ main: { x: 1, y: 2, width: 0, height: 1 } }).ok, true);
  assert.equal(h.layout.main, null);
  h.runtime.setBrowserLayout({ main: { x: 1, y: 2, width: 700, height: 500 } });
  h.runtime.openBrowser({ accountId: 'account-x', providerId: 'tool-x', name: 'Example', url: 'https://example.com' });
  assert.equal((await h.runtime.navigate('back')).ok, true);
  assert.equal((await h.runtime.navigate('open-external')).ok, true);
  assert.ok(h.calls.some((call) => call[0] === 'back'));
  assert.ok(h.calls.some((call) => call[0] === 'external' && call[1] === 'https://example.com/'));
});

test('Image Hub load failure removes the native view but keeps a retryable error state', () => {
  const h = harness();
  h.runtime.openBrowser({ accountId: 'account-x', providerId: 'tool-x', name: 'Example', url: 'https://example.com' });
  h.runtime.reportFailure('Failed to load page');
  const state = h.runtime.getState();
  assert.equal(state.hasBrowserView, false);
  assert.equal(state.accountId, 'account-x');
  assert.equal(state.error, 'Failed to load page');
  assert.ok(h.calls.some((call) => call[0] === 'detach'));
  assert.ok(h.states.some((snapshot) => snapshot.error === 'Failed to load page'));
});

test('Image Hub runtime is wired through main, preload, layout, build and developer resource allowlist', () => {
  const root = path.join(__dirname, '..');
  const main = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
  const preload = fs.readFileSync(path.join(root, 'src/preload.ts'), 'utf8');
  const contract = fs.readFileSync(path.join(root, 'src/shared/api-contract.ts'), 'utf8');
  const layout = fs.readFileSync(path.join(root, 'src/main/browser-view-layout-runtime.ts'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const renderer = fs.readFileSync(path.join(root, 'src/renderer.js'), 'utf8');
  assert.match(main, /createImageHubBrowserRuntime\(/);
  assert.match(main, /'image-hub-browser-open'/);
  assert.match(main, /getImageHubSession\(runtimeAccount\)/);
  assert.match(main, /'src\/main\/image-hub-browser-runtime\.ts'/);
  assert.match(preload, /imageHubBrowserOpen: \(payload\) => invoke\('image-hub-browser-open', payload\)/);
  assert.match(preload, /onImageHubBrowserState: \(callback\) => subscribe\('image-hub-browser-state', callback\)/);
  assert.match(contract, /imageHubBrowserOpen\(payload: JsonRecord\)/);
  assert.match(layout, /imageHubBrowserView/);
  assert.match(pkg.scripts['build:main-modules'], /src\/main\/image-hub-browser-runtime\.ts/);
  assert.match(pkg.scripts.test, /tests\/main-image-hub-browser-runtime\.test\.js/);
  assert.match(JSON.stringify(pkg.build.extraResources), /main\/image-hub-browser-runtime\.ts/);
  assert.doesNotMatch(renderer, /document\.createElement\(['"]webview['"]\)/, 'Image Hub must not use a disabled <webview> tag');
  assert.match(renderer, /let lastVideoHubBrowserLayoutKey = ''/, 'Video Hub layout cache must be initialized');
  assert.match(renderer, /window\.aiHub\.videoHubSetLayout\(\{ main \}\)/, 'Video Hub must send its measured bounds to the main process');
  assert.match(preload, /onVideoHubBrowserStatus: \(callback\) => subscribe\('video-hub-browser-status', callback\)/);
});

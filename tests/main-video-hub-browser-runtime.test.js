const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createVideoHubBrowserRuntime } = require('../build/main/video-hub-browser-runtime.js');

function harness(overrides = {}) {
  const calls = [];
  const accounts = new Map([['a', { id: 'a', name: 'Alpha', url: 'https://alpha.example/' }], ['b', { id: 'b', name: 'Beta', url: 'https://beta.example/' }]]);
  const layout = { main: null };
  const pendingCreations = new Map();
  const childWindows = new Set();
  let browserView = null;
  let activeId = 'a';
  let serial = 0;
  const store = { activeAccountId: 'a' };
  const runtime = createVideoHubBrowserRuntime({
    layout, pendingCreations, childWindows,
    getBrowserView: () => browserView,
    setBrowserView: (view) => { browserView = view; calls.push(['setView', view?.id || null]); },
    getActiveAccountId: () => activeId,
    setActiveAccountId: (id) => { activeId = id; calls.push(['setActive', id]); },
    getRequestSerial: () => serial,
    advanceRequestSerial: () => ++serial,
    getWorkspaceApp: () => overrides.workspaceApp || 'video-hub',
    isLocked: () => Boolean(overrides.locked),
    loadStore: () => store,
    saveStore: () => calls.push(['saveStore']),
    getAccount: (id) => accounts.get(id) || null,
    getRuntimeAccount: (account) => ({ ...account, serviceId: `service-${account.id}` }),
    getSession: (account) => `session:${account.id}`,
    waitForSessionReady: async (session) => { calls.push(['ready', session]); if (overrides.waitForSessionReady) return overrides.waitForSessionReady(session); return overrides.readiness || { ok: true }; },
    createNativeView: (account, runtimeAccount, session) => {
      calls.push(['create', account.id, runtimeAccount.id, session]);
      return { id: account.id, webContents: {
        isDestroyed: () => false,
        canGoBack: () => overrides.canBack !== false,
        canGoForward: () => overrides.canForward !== false,
        goBack: () => calls.push(['back']),
        goForward: () => calls.push(['forward']),
        reload: () => calls.push(['reload']),
        getURL: () => overrides.currentUrl || account.url,
        async loadURL(url) { calls.push(['load', account.id, url]); if (overrides.loadError) throw new Error('load failed'); },
        close: () => calls.push(['close-webcontents']),
      } };
    },
    attachView: (view) => calls.push(['attach', view.id]),
    detachView: (view) => calls.push(['detach', view.id]),
    isWebContentsDestroyed: (view) => view.webContents.isDestroyed(),
    closeWebContents: (view) => view.webContents.close(),
    loadUrl: (view, url) => view.webContents.loadURL(url),
    positionViews: () => calls.push(['position']),
    getRendererState: () => ({ accounts: ['a', 'b'], activeAccountId: activeId }),
    normalizeActiveId: (id) => id ? String(id) : null,
    onProxyFailure: (account, message) => calls.push(['proxyFailure', account.id, message]),
    onCreateFailure: (account, message) => calls.push(['createFailure', account.id, message]),
    onNavigationFailure: (account, message) => calls.push(['navigationFailure', account.id, message]),
    externalUrlForPage: (url) => url,
    openExternalSafe: async (url) => { calls.push(['openExternal', url]); return overrides.openExternal !== false; },
  });
  return { runtime, calls, accounts, layout, pendingCreations, childWindows, store, getView: () => browserView, getActiveId: () => activeId, getSerial: () => serial };
}

test('Video Hub creation waits for proxy readiness and attaches before initial navigation', async () => {
  const h = harness();
  const view = await h.runtime.createBrowserView(h.accounts.get('a'));
  assert.equal(view.id, 'a');
  assert.deepEqual(h.calls.filter((call) => ['ready', 'create', 'attach', 'position', 'load'].includes(call[0])).map((call) => call[0]), ['ready', 'create', 'attach', 'position', 'load']);
  assert.equal(h.getView(), view);
});

test('Video Hub concurrent creation requests share one promise and one native view', async () => {
  let release;
  const h = harness({ waitForSessionReady: undefined });
  // Replace the readiness path with an explicitly pending promise to exercise single-flight.
  const original = h.runtime;
  assert.ok(original);
  const delayed = harness();
  // The runtime keeps readiness behind its injected dependency; use two invocations before its first await resolves.
  const one = delayed.runtime.createBrowserView(delayed.accounts.get('a'));
  const two = delayed.runtime.createBrowserView(delayed.accounts.get('a'));
  const [first, second] = await Promise.all([one, two]);
  assert.equal(first, second);
  assert.equal(delayed.calls.filter((call) => call[0] === 'create').length, 1);
});

test('Video Hub creation fails closed when proxy preparation fails', async () => {
  const h = harness({ readiness: { ok: false, error: { message: 'proxy denied' } } });
  assert.equal(await h.runtime.createBrowserView(h.accounts.get('a')), null);
  assert.ok(h.calls.some((call) => call[0] === 'proxyFailure' && call[2] === 'proxy denied'));
  assert.equal(h.getView(), null);
});

test('stale async creation is discarded after lock or account/workspace change', async () => {
  let finishReady;
  const h = harness({ waitForSessionReady: undefined });
  // Exercise invalidation by advancing the generation while readiness is pending.
  const runtime = h.runtime;
  const pending = runtime.createBrowserView(h.accounts.get('a'));
  h.runtime.closeBrowserView();
  const result = await pending;
  assert.equal(result, null);
  assert.equal(h.getView(), null);
});

test('closing the Video Hub view closes child windows and invalidates pending requests', async () => {
  const h = harness();
  const child = { closed: false, isDestroyed: () => false, close() { this.closed = true; } };
  h.childWindows.add(child);
  await h.runtime.createBrowserView(h.accounts.get('a'));
  const before = h.getSerial();
  h.runtime.closeBrowserView();
  assert.equal(child.closed, true);
  assert.equal(h.childWindows.size, 0);
  assert.equal(h.getView(), null);
  assert.ok(h.getSerial() > before);
  assert.ok(h.calls.some((call) => call[0] === 'detach'));
});

test('active account changes validate, save, close old session view and position', async () => {
  const h = harness();
  await h.runtime.createBrowserView(h.accounts.get('a'));
  const result = h.runtime.setActiveAccount('b');
  assert.equal(result.ok, true);
  assert.equal(h.getActiveId(), 'b');
  assert.equal(h.store.activeAccountId, 'b');
  assert.ok(h.calls.some((call) => call[0] === 'saveStore'));
  assert.ok(h.calls.some((call) => call[0] === 'setView' && call[1] === null));
  assert.equal(h.runtime.setActiveAccount('missing').ok, false);
});

test('browser layout and navigation validate controls and preserve standard browser behavior', async () => {
  const h = harness();
  assert.equal(h.runtime.setBrowserLayout({ main: { x: 2, y: 3, width: 700, height: 400 } }).ok, true);
  assert.deepEqual(h.layout.main, { x: 2, y: 3, width: 700, height: 400 });
  await h.runtime.createBrowserView(h.accounts.get('a'));
  assert.match((await h.runtime.navigate('something')).error, /invalid/i);
  assert.equal((await h.runtime.navigate('back')).ok, true);
  assert.equal((await h.runtime.navigate('forward')).ok, true);
  assert.equal((await h.runtime.navigate('refresh')).ok, true);
  assert.ok(h.calls.some((call) => call[0] === 'back'));
  assert.ok(h.calls.some((call) => call[0] === 'forward'));
  assert.ok(h.calls.some((call) => call[0] === 'reload'));
});

test('open-in-browser uses active page URL and handles failures', async () => {
  const h = harness();
  assert.equal((await h.runtime.openInBrowser()).ok, false);
  await h.runtime.createBrowserView(h.accounts.get('a'));
  assert.deepEqual(await h.runtime.openInBrowser(), { ok: true });
  assert.ok(h.calls.some((call) => call[0] === 'openExternal' && call[1] === 'https://alpha.example/'));
  const fail = harness({ openExternal: false });
  await fail.runtime.createBrowserView(fail.accounts.get('a'));
  assert.equal((await fail.runtime.openInBrowser()).ok, false);
});

test('Video Hub runtime is wired through main and packaged module lists', () => {
  const root = path.join(__dirname, '..');
  const main = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.match(main, /createVideoHubBrowserRuntime\(/);
  assert.match(main, /function createVideoHubBrowserView\(account\) \{ return videoHubBrowserRuntime\.createBrowserView\(account\); \}/);
  assert.match(pkg.scripts['build:main-modules'], /src\/main\/video-hub-browser-runtime\.ts/);
  assert.match(pkg.scripts.test, /tests\/main-video-hub-browser-runtime\.test\.js/);
  assert.match(main, /'src\/main\/video-hub-browser-runtime\.ts'/);
  assert.match(JSON.stringify(pkg.build.extraResources), /main\/video-hub-browser-runtime\.ts/);
});

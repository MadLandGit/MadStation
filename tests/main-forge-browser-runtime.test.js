const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createForgeBrowserRuntime } = require('../build/main/forge-browser-runtime.js');

function harness(overrides = {}) {
  const calls = [];
  const views = new Map();
  const layout = { main: null };
  const accounts = new Map([['a', { id: 'a', name: 'Alpha', serviceId: 'p1', url: 'https://alpha.example/' }], ['b', { id: 'b', name: 'Beta', serviceId: 'p2', url: 'https://beta.example/' }]]);
  let selected = null;
  const runtimeState = new Map();
  const runtime = createForgeBrowserRuntime({
    views, layout,
    getSelectedAccountId: () => selected,
    setSelectedAccountId: (id) => { selected = id; },
    getAccount: (id) => accounts.get(id) || null,
    getServiceName: (id) => id === 'p1' ? 'Provider One' : 'Provider Two',
    getWorkspaceApp: () => overrides.workspaceApp || 'instruction-forge',
    isLocked: () => Boolean(overrides.locked),
    maxLiveViews: 1,
    getLastVisitedAt: (id) => runtimeState.get(id) || 0,
    setLastVisitedAt: (id, timestamp) => runtimeState.set(id, timestamp),
    now: () => 10,
    createNativeView: (account) => {
      const view = { id: account.id, webContents: {
        isDestroyed: () => false,
        getURL: () => account.url,
        getTitle: () => `${account.name} title`,
        isLoading: () => false,
        focus: () => calls.push(['focus', account.id]),
        reload: () => calls.push(['reload', account.id]),
      } };
      calls.push(['create', account.id]);
      return view;
    },
    loadUrl: (view, url) => calls.push(['load', view.id, url]),
    attachView: (view) => calls.push(['attach', view.id]),
    detachView: (view) => calls.push(['detach', view.id]),
    closeWebContents: (view) => calls.push(['close', view.id]),
    isWebContentsDestroyed: (view) => view.webContents.isDestroyed(),
    positionViews: () => calls.push(['position']),
    notifyState: (state) => calls.push(['notify', state]),
    canGoBack: () => overrides.canBack !== false,
    canGoForward: () => overrides.canForward !== false,
    goBack: (view) => calls.push(['back', view.id]),
    goForward: (view) => calls.push(['forward', view.id]),
  });
  return { runtime, calls, views, layout, accounts, runtimeState, getSelected: () => selected };
}

test('Forge view state reports the selected account and live WebContents metadata', () => {
  const h = harness();
  assert.deepEqual(h.runtime.stateForRenderer(), { ok: true, accountId: null, accountName: '', providerName: '', url: '', title: '', loading: false });
  const result = h.runtime.setBrowserAccount('a');
  assert.equal(result.ok, true);
  assert.equal(h.runtime.stateForRenderer().providerName, 'Provider One');
  assert.equal(h.runtime.stateForRenderer().title, 'Alpha title');
});

test('account selection requires unlocked Instruction Forge and valid account', () => {
  assert.match(harness({ locked: true }).runtime.setBrowserAccount('a').error, /only active/i);
  assert.match(harness({ workspaceApp: 'ai-hub' }).runtime.setBrowserAccount('a').error, /only active/i);
  assert.match(harness().runtime.setBrowserAccount('missing').error, /not found/i);
});

test('Forge browser view attaches before initial navigation and receives focus', () => {
  const h = harness();
  assert.equal(h.runtime.setBrowserAccount('a').ok, true);
  assert.deepEqual(h.calls.filter((call) => ['create', 'load', 'attach', 'focus'].includes(call[0])).map((call) => call[0]), ['create', 'load', 'attach', 'focus']);
  assert.equal(h.runtimeState.get('a'), 10);
});

test('Forge navigation validates requests, handles history boundaries and refreshes renderer state', async () => {
  const h = harness();
  assert.match((await h.runtime.navigateBrowser('back')).error, /choose an ai/i);
  h.runtime.setBrowserAccount('a');
  assert.match((await h.runtime.navigateBrowser('print')).error, /invalid/i);
  const blockedBack = harness({ canBack: false });
  blockedBack.runtime.setBrowserAccount('a');
  assert.match((await blockedBack.runtime.navigateBrowser('back')).error, /no previous/i);
  assert.equal((await h.runtime.navigateBrowser('forward')).ok, true);
  assert.equal((await h.runtime.navigateBrowser('refresh')).ok, true);
  assert.ok(h.calls.some((call) => call[0] === 'reload'));
  assert.ok(h.calls.some((call) => call[0] === 'notify'));
});

test('Forge view pruning keeps selected account and closes least-recent other views', () => {
  const h = harness();
  h.runtime.setBrowserAccount('a');
  h.runtime.setBrowserAccount('b');
  assert.equal(h.views.has('b'), true);
  assert.equal(h.views.has('a'), false);
  assert.ok(h.calls.some((call) => call[0] === 'close' && call[1] === 'a'));
});

test('close, close-all, layout and suspension preserve intended selection lifecycle', () => {
  const h = harness();
  h.runtime.setBrowserAccount('a');
  h.runtime.setBrowserLayout({ main: { x: 0, y: 0, width: 500, height: 300 } });
  assert.deepEqual(h.layout.main, { x: 0, y: 0, width: 500, height: 300 });
  h.runtime.closeBrowserView('a', { clearSelection: true });
  assert.equal(h.getSelected(), null);
  h.runtime.setBrowserAccount('b');
  assert.deepEqual(h.runtime.suspendBrowsers(), { ok: true });
  assert.equal(h.views.size, 0);
  assert.equal(h.getSelected(), 'b');
  assert.equal(h.layout.main, null);
});

test('Forge runtime is wired through main and packaged module lists', () => {
  const root = path.join(__dirname, '..');
  const main = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.match(main, /createForgeBrowserRuntime\(/);
  assert.match(main, /function setForgeBrowserAccount\(id\) \{ return forgeBrowserRuntime\.setBrowserAccount\(id\); \}/);
  assert.match(pkg.scripts['build:main-modules'], /src\/main\/forge-browser-runtime\.ts/);
  assert.match(pkg.scripts.test, /tests\/main-forge-browser-runtime\.test\.js/);
  assert.match(main, /'src\/main\/forge-browser-runtime\.ts'/);
  assert.match(JSON.stringify(pkg.build.extraResources), /main\/forge-browser-runtime\.ts/);
});

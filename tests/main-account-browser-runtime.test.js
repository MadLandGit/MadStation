const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createAccountBrowserRuntime } = require('../build/main/account-browser-runtime.js');

function harness(overrides = {}) {
  const calls = [];
  const views = new Map();
  const runtimes = new Map();
  const accounts = [
    { id: 'a', url: 'https://one.example', preferences: { pageZoom: 90 } },
    { id: 'b', url: 'https://two.example' },
    { id: 'c', url: 'https://three.example' },
  ];
  const config = { accounts, activeId: null, settings: {} };
  let workspaceApp = 'ai-hub';
  let locked = false;
  let activeId = 'a';
  const runtime = createAccountBrowserRuntime({
    views,
    maxLiveViews: 2,
    getWorkspaceApp: () => workspaceApp,
    isLocked: () => locked,
    getAccount: (id) => accounts.find((entry) => entry.id === id) || null,
    getRuntime: (id) => { if (!runtimes.has(id)) runtimes.set(id, {}); return runtimes.get(id); },
    getSession: (account) => ({ partition: account.id }),
    createNativeView: (account, session) => { calls.push(['create', account.id, session.partition]); return { accountId: account.id, webContents: { isDestroyed: () => false, focus: () => calls.push(['focus', account.id]), loadURL: async (url) => calls.push(['load', account.id, url]), close: () => calls.push(['close', account.id]) } }; },
    hardenView: (view, account, session) => calls.push(['harden', view.accountId, account.id, session.partition]),
    bindEvents: (view, account) => calls.push(['bind', view.accountId, account.id]),
    attachView: (view) => calls.push(['attach', view.accountId]),
    detachView: (view) => calls.push(['detach', view.accountId]),
    isWebContentsDestroyed: (view) => view.webContents.isDestroyed(),
    closeWebContents: (view) => view.webContents.close(),
    getConfig: () => config,
    saveConfig: () => { calls.push(['save-config', config.activeId]); return true; },
    getActiveId: () => activeId,
    setActiveId: (id) => { activeId = id; calls.push(['active', id]); },
    cancelDownloads: (id) => calls.push(['cancel-downloads', id]),
    closeForgeBrowserView: (id, options) => calls.push(['close-forge', id, options.clearSelection]),
    removeRuntime: (id) => { calls.push(['remove-runtime', id]); runtimes.delete(id); },
    positionViews: () => calls.push(['position']),
    moveViewToFront: (view) => calls.push(['front', view.accountId]),
    notice: (message) => calls.push(['notice', message]),
    notifyActiveChanged: (id) => calls.push(['active-notice', id]),
    pushToolbar: () => calls.push(['toolbar']),
    now: () => 100,
    warn: (...args) => calls.push(['warn', ...args]),
    ...overrides,
  });
  return { runtime, calls, views, runtimes, accounts, config, set workspaceApp(v) { workspaceApp = v; }, set locked(v) { locked = v; }, get activeId() { return activeId; } };
}

test('account view creation preserves harden/bind/load/attach/register order and is idempotent', () => {
  const h = harness();
  const account = h.accounts[0];
  const first = h.runtime.createView(account);
  const second = h.runtime.createView(account);
  assert.equal(first, second);
  assert.deepEqual(h.calls.map(([kind]) => kind), ['create', 'harden', 'bind', 'load', 'attach']);
  assert.equal(h.views.get('a'), first);
  assert.equal(h.runtimes.get('a').lastVisitedAt, 100);
});

test('account view creation is blocked outside AI Hub unless the explicit temporary-borrow option is used', () => {
  const h = harness();
  h.workspaceApp = 'launcher';
  assert.equal(h.runtime.createView(h.accounts[0]), null);
  assert.equal(h.runtime.createView(h.accounts[0], { allowOutsideWorkspace: true })?.accountId, 'a');
  h.locked = true;
  assert.equal(h.runtime.createView(h.accounts[1]), null);
});

test('pruning keeps the preferred account view and closes inactive views without canceling downloads', () => {
  const h = harness();
  for (const account of h.accounts) h.runtime.createView(account, { allowOutsideWorkspace: true });
  const closed = h.calls.filter(([kind]) => kind === 'detach').map(([, id]) => id);
  assert.deepEqual(closed, ['b']);
  assert.equal(h.views.size, 2);
  assert.ok(!h.calls.some(([kind]) => kind === 'cancel-downloads'));
});

test('activation persists active account, promotes view, lays out and announces state', () => {
  const h = harness();
  h.runtime.createView(h.accounts[0]);
  h.calls.length = 0;
  const result = h.runtime.activateAccount('a');
  assert.deepEqual(result, { ok: true });
  assert.equal(h.config.activeId, 'a');
  assert.deepEqual(h.calls.map(([kind]) => kind), ['active', 'save-config', 'front', 'position', 'focus', 'active-notice', 'toolbar']);
});

test('activation rejects locked, wrong-workspace and unknown-account requests', () => {
  const h = harness();
  h.locked = true;
  assert.deepEqual(h.runtime.activateAccount('a'), { ok: false, error: 'Mad Station is locked.' });
  h.locked = false;
  h.workspaceApp = 'launcher';
  assert.deepEqual(h.runtime.activateAccount('a'), { ok: false, error: 'AI Hub browser is only active inside AI Hub.' });
  h.workspaceApp = 'ai-hub';
  assert.deepEqual(h.runtime.activateAccount('missing'), { ok: false, error: 'Account not found.' });
});

test('removal cancels downloads by default, closes Forge before view, and deletes runtime unless preserved', () => {
  const h = harness();
  const view = h.runtime.createView(h.accounts[0]);
  h.calls.length = 0;
  h.runtime.removeView('a');
  assert.deepEqual(h.calls.map(([kind]) => kind), ['cancel-downloads', 'close-forge', 'detach', 'close', 'remove-runtime']);
  assert.equal(h.views.has('a'), false);
  assert.equal(view.accountId, 'a');
});

test('closing workspace views preserves runtime metadata and never cancels active downloads', () => {
  const h = harness();
  h.runtime.createView(h.accounts[0]);
  h.calls.length = 0;
  h.runtime.closeAllViews();
  assert.equal(h.views.size, 0);
  assert.equal(h.runtimes.has('a'), true);
  assert.ok(h.calls.every(([kind]) => kind !== 'cancel-downloads'));
});

test('account browser runtime is wired to main, build and packaged developer sources', () => {
  const root = path.join(__dirname, '..');
  const main = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.match(main, /createAccountBrowserRuntime/);
  assert.match(main, /function activateAccount\(id\) \{ return accountBrowserRuntime\.activateAccount\(id\); \}/);
  assert.match(main, /function removeAccountView\(id, options = \{\}\) \{ return accountBrowserRuntime\.removeView\(id, options\); \}/);
  assert.match(pkg.scripts['build:main-modules'], /src\/main\/account-browser-runtime\.ts/);
  assert.match(pkg.scripts.test, /tests\/main-account-browser-runtime\.test\.js/);
  assert.match(JSON.stringify(pkg.build.extraResources), /main\/account-browser-runtime\.ts/);
  assert.match(main, /'src\/main\/account-browser-runtime\.ts'/);
});

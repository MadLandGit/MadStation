const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createArenaBrowserRuntime } = require('../build/main/arena-browser-runtime.js');

function makeView(id, calls, options = {}) {
  const wc = {
    isDestroyed: () => Boolean(options.destroyed),
    canGoBack: () => options.canBack !== false,
    canGoForward: () => options.canForward !== false,
    goBack: () => calls.push(['back', id]),
    goForward: () => calls.push(['forward', id]),
    getURL: () => options.url || `https://${id}.example/`,
    async loadURL(url) { calls.push(['load', id, url]); return true; },
    reload: () => calls.push(['reload', id]),
    close: () => calls.push(['close-webcontents', id]),
  };
  return { id, webContents: wc };
}
function harness() {
  const calls = [];
  const accounts = new Map([['left-id', { id: 'left-id', url: 'https://left.example/' }], ['right-id', { id: 'right-id', url: 'https://right.example/' }], ['other-id', { id: 'other-id', url: 'https://other.example/' }]]);
  const views = new Map();
  const models = { left: null, right: null };
  const layout = { left: null, right: null };
  const store = { selected: { left: null, right: null } };
  const runtime = createArenaBrowserRuntime({
    views, models, layout,
    loadStore: () => store,
    saveStore: () => calls.push(['save']),
    getAccount: (id) => accounts.get(id) || null,
    runtimeAccount: (account) => account,
    getSession: (account) => `session:${account.id}`,
    createView: (account, session) => { calls.push(['create', account.id, session]); return makeView(account.id, calls); },
    hardenView: (view, account, session) => calls.push(['harden', account.id, session]),
    bindEvents: (view) => calls.push(['bind', view.id]),
    attachView: (view) => calls.push(['attach', view.id]),
    detachView: (view) => calls.push(['detach', view.id]),
    isWebContentsDestroyed: (view) => view.webContents.isDestroyed(),
    closeWebContents: (view) => view.webContents.close(),
    positionViews: () => calls.push(['position']),
  });
  return { runtime, calls, accounts, views, models, layout, store };
}

test('setting browser models rejects duplicate or unknown selections before changing state', async () => {
  const h = harness();
  assert.equal((await h.runtime.setBrowserModels({ left: 'left-id', right: 'left-id' })).ok, false);
  assert.equal((await h.runtime.setBrowserModels({ left: 'missing', right: 'right-id' })).ok, false);
  assert.deepEqual(h.models, { left: null, right: null });
  assert.equal(h.calls.some((call) => call[0] === 'create'), false);
});

test('selected accounts create hardened views, preserve navigate-before-attach ordering, and save selections', async () => {
  const h = harness();
  const result = await h.runtime.setBrowserModels({ left: 'left-id', right: 'right-id' });
  assert.deepEqual(result, { ok: true, models: { left: 'left-id', right: 'right-id' } });
  assert.equal(h.views.size, 2);
  assert.deepEqual(h.calls.filter((call) => ['create', 'harden', 'bind', 'load', 'attach'].includes(call[0])).map((call) => call[0]), [
    'create', 'harden', 'bind', 'load', 'attach', 'create', 'harden', 'bind', 'load', 'attach',
  ]);
  assert.deepEqual(h.store.selected, { left: 'left-id', right: 'right-id' });
  assert.equal(h.calls.filter((call) => call[0] === 'save').length, 1);
  assert.equal(h.calls.filter((call) => call[0] === 'position').length, 1);
});

test('unchanged browser models do not rewrite the store or recreate views', async () => {
  const h = harness();
  await h.runtime.setBrowserModels({ left: 'left-id', right: 'right-id' });
  h.calls.length = 0;
  await h.runtime.setBrowserModels({ left: 'left-id', right: 'right-id' });
  assert.equal(h.calls.filter((call) => call[0] === 'save').length, 0);
  assert.equal(h.calls.filter((call) => call[0] === 'create').length, 0);
});

test('switching selection closes unselected native views but retains persistent account records', async () => {
  const h = harness();
  await h.runtime.setBrowserModels({ left: 'left-id', right: 'right-id' });
  h.calls.length = 0;
  await h.runtime.setBrowserModels({ left: 'left-id', right: 'other-id' });
  assert.equal(h.views.has('right-id'), false);
  assert.equal(h.accounts.has('right-id'), true);
  assert.deepEqual(h.calls.filter((call) => ['detach', 'close-webcontents'].includes(call[0])), [['detach', 'right-id'], ['close-webcontents', 'right-id']]);
  assert.equal(h.views.has('other-id'), true);
});

test('navigation validates side/action and handles back, forward, and reload URLs', async () => {
  const h = harness();
  await h.runtime.setBrowserModels({ left: 'left-id', right: 'right-id' });
  assert.equal((await h.runtime.navigateBrowser('top', 'back')).ok, false);
  assert.equal((await h.runtime.navigateBrowser('left', 'javascript')).ok, false);
  assert.deepEqual(await h.runtime.navigateBrowser('left', 'back'), { ok: true, side: 'left', action: 'back' });
  assert.deepEqual(await h.runtime.navigateBrowser('right', 'forward'), { ok: true, side: 'right', action: 'forward' });
  assert.deepEqual(await h.runtime.navigateBrowser('left', 'refresh'), { ok: true, side: 'left', action: 'refresh' });
  assert.ok(h.calls.some((call) => call[0] === 'load' && call[1] === 'left-id' && call[2] === 'https://left-id.example/'));
});

test('navigation reports absent page and destroyed view without throwing', async () => {
  const h = harness();
  assert.match((await h.runtime.navigateBrowser('left', 'back')).error, /no browser selected/i);
  await h.runtime.setBrowserModels({ left: 'left-id', right: 'right-id' });
  h.views.set('left-id', makeView('left-id', h.calls, { url: 'about:blank' }));
  assert.match((await h.runtime.navigateBrowser('left', 'refresh')).error, /does not have a page/i);
  h.views.set('right-id', makeView('right-id', h.calls, { destroyed: true }));
  assert.match((await h.runtime.navigateBrowser('right', 'back')).error, /no browser selected/i);
});

test('layout accepts positive rectangles and clears invalid slots without redundant layout passes', () => {
  const h = harness();
  assert.deepEqual(h.runtime.setBrowserLayout({ left: { x: 1, y: 2, width: 500, height: 300 }, right: { x: 0, y: 0, width: 2, height: 20 } }), { ok: true });
  assert.deepEqual(h.layout, { left: { x: 1, y: 2, width: 500, height: 300 }, right: null });
  assert.equal(h.calls.filter((call) => call[0] === 'position').length, 1);
  h.runtime.setBrowserLayout({ left: { x: 1, y: 2, width: 500, height: 300 }, right: null });
  assert.equal(h.calls.filter((call) => call[0] === 'position').length, 1);
});

test('clear bindings and suspend close views and clear the correct selections/layouts', async () => {
  const h = harness();
  await h.runtime.setBrowserModels({ left: 'left-id', right: 'right-id' });
  h.runtime.setBrowserLayout({ left: { x: 0, y: 0, width: 500, height: 300 }, right: { x: 500, y: 0, width: 500, height: 300 } });
  h.runtime.clearBrowserBindings();
  assert.deepEqual(h.models, { left: null, right: null });
  assert.deepEqual(h.layout, { left: null, right: null });
  assert.equal(h.views.size, 0);
  await h.runtime.setBrowserModels({ left: 'left-id', right: 'right-id' });
  assert.deepEqual(h.runtime.suspendBrowsers(), { ok: true });
  assert.deepEqual(h.layout, { left: null, right: null });
  assert.equal(h.views.size, 0);
});

test('Arena browser runtime is wired through host composition and build allowlist', () => {
  const root = path.join(__dirname, '..');
  const main = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.match(main, /createArenaBrowserRuntime\(/);
  assert.match(main, /function setArenaBrowserModels\(models = \{\}\) \{ return arenaBrowserRuntime\.setBrowserModels\(models\); \}/);
  assert.match(pkg.scripts['build:main-modules'], /src\/main\/arena-browser-runtime\.ts/);
  assert.match(pkg.scripts.test, /tests\/main-arena-browser-runtime\.test\.js/);
  assert.match(main, /'src\/main\/arena-browser-runtime\.ts'/);
  assert.match(JSON.stringify(pkg.build.extraResources), /main\/arena-browser-runtime\.ts/);
});

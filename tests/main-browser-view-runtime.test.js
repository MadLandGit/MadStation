const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { closeAccountBrowserViewRuntime } = require('../build/main/browser-view-runtime.js');

function createHarness(overrides = {}) {
  const calls = [];
  const view = { name: 'account-view' };
  const dependencies = {
    getView: (id) => { calls.push(['getView', id]); return view; },
    detachView: (candidate) => { calls.push(['detachView', candidate.name]); },
    isWebContentsDestroyed: (candidate) => { calls.push(['isDestroyed', candidate.name]); return false; },
    closeWebContents: (candidate) => { calls.push(['closeWebContents', candidate.name]); },
    forgetView: (id, candidate) => { calls.push(['forgetView', id, candidate.name]); },
    ...overrides,
  };
  return { calls, view, dependencies };
}

test('runtime adapter detaches, closes and forgets a live account view in order', () => {
  const { calls, dependencies } = createHarness();
  const result = closeAccountBrowserViewRuntime('account-1', dependencies);
  assert.deepEqual(calls, [
    ['getView', 'account-1'],
    ['detachView', 'account-view'],
    ['isDestroyed', 'account-view'],
    ['closeWebContents', 'account-view'],
    ['forgetView', 'account-1', 'account-view'],
  ]);
  assert.deepEqual(result, { status: 'closed', detached: true, closeAttempted: true, failures: [] });
});

test('runtime adapter treats a missing view as a no-op', () => {
  const { calls, dependencies } = createHarness({ getView: (id) => { calls.push(['getView', id]); return undefined; } });
  const result = closeAccountBrowserViewRuntime('missing', dependencies);
  assert.deepEqual(calls, [['getView', 'missing']]);
  assert.deepEqual(result, { status: 'missing', detached: false, closeAttempted: false, failures: [] });
});

test('runtime adapter skips WebContents.close for an already-destroyed view but still detaches and forgets it', () => {
  const { calls, dependencies } = createHarness({ isWebContentsDestroyed: (candidate) => { calls.push(['isDestroyed', candidate.name]); return true; } });
  const result = closeAccountBrowserViewRuntime('account-2', dependencies);
  assert.deepEqual(calls, [
    ['getView', 'account-2'],
    ['detachView', 'account-view'],
    ['isDestroyed', 'account-view'],
    ['forgetView', 'account-2', 'account-view'],
  ]);
  assert.deepEqual(result, { status: 'already-destroyed', detached: true, closeAttempted: false, failures: [] });
});

test('runtime adapter continues closing and forgetting when detachment fails', () => {
  const { calls, dependencies } = createHarness({ detachView: (candidate) => { calls.push(['detachView', candidate.name]); throw new Error('native detach failure'); } });
  const result = closeAccountBrowserViewRuntime('account-3', dependencies);
  assert.deepEqual(calls.map(([step]) => step), ['getView', 'detachView', 'isDestroyed', 'closeWebContents', 'forgetView']);
  assert.deepEqual(result, { status: 'failed', detached: false, closeAttempted: true, failures: ['detach-view'] });
});

test('runtime adapter forgets the view after close failure and does not expose exception text', () => {
  const { calls, dependencies } = createHarness({ closeWebContents: (candidate) => { calls.push(['closeWebContents', candidate.name]); throw new Error('sensitive native detail'); } });
  const result = closeAccountBrowserViewRuntime('account-4', dependencies);
  assert.deepEqual(calls.map(([step]) => step), ['getView', 'detachView', 'isDestroyed', 'closeWebContents', 'forgetView']);
  assert.deepEqual(result, { status: 'failed', detached: true, closeAttempted: true, failures: ['close-web-contents'] });
  assert.doesNotMatch(JSON.stringify(result), /sensitive native detail/);
});

test('runtime adapter attempts close if destroyed-state inspection throws, then performs registry cleanup', () => {
  const { calls, dependencies } = createHarness({ isWebContentsDestroyed: (candidate) => { calls.push(['isDestroyed', candidate.name]); throw new Error('inspection unavailable'); } });
  const result = closeAccountBrowserViewRuntime('account-5', dependencies);
  assert.deepEqual(calls.map(([step]) => step), ['getView', 'detachView', 'isDestroyed', 'closeWebContents', 'forgetView']);
  assert.deepEqual(result, { status: 'failed', detached: true, closeAttempted: true, failures: ['inspect-destroyed-state'] });
});

test('runtime adapter is wired through the Electron host, build list and developer source allowlists', () => {
  const root = path.join(__dirname, '..');
  const main = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.match(main, /require\('\.\.\/build\/main\/browser-view-runtime\.js'\)/);
  assert.match(main, /function removeAccountView\(id, options = \{\}\) \{ return accountBrowserRuntime\.removeView\(id, options\); \}/);
  const accountBrowser = fs.readFileSync(path.join(root, 'src/main/account-browser-runtime.ts'), 'utf8');
  assert.match(accountBrowser, /getView: \(viewId\) => views\.get\(viewId\)/);
  assert.match(accountBrowser, /if \(views\.get\(viewId\) === view\) views\.delete\(viewId\)/);
  assert.match(pkg.scripts['build:main-modules'], /src\/main\/browser-view-runtime\.ts/);
  assert.match(pkg.scripts.test, /tests\/main-browser-view-runtime\.test\.js/);
  assert.match(main, /'src\/main\/browser-view-runtime\.ts'/);
  const developerResources = JSON.stringify(pkg.build.extraResources);
  assert.match(developerResources, /main\/browser-view-runtime\.ts/);
});

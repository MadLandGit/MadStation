const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { closeWorkspaceBrowserViewRuntime } = require('../build/main/workspace-browser-view-runtime.js');

function harness(overrides = {}) {
  const calls = [];
  const view = { id: 'view-1', webContents: { close() { calls.push(['close']); } } };
  const dependencies = {
    getView: (id) => { calls.push(['get', id]); return view; },
    detachView: (candidate) => { calls.push(['detach', candidate.id]); },
    closeWebContents: (candidate) => { calls.push(['close', candidate.id]); },
    forgetView: (id, candidate) => { calls.push(['forget', id, candidate.id]); },
    ...overrides,
  };
  return { calls, view, dependencies };
}

test('workspace view runtime preserves detach, close, registry cleanup order', () => {
  const { calls, dependencies } = harness();
  const result = closeWorkspaceBrowserViewRuntime('forge-account', dependencies);
  assert.deepEqual(calls, [
    ['get', 'forge-account'],
    ['detach', 'view-1'],
    ['close', 'view-1'],
    ['forget', 'forge-account', 'view-1'],
  ]);
  assert.deepEqual(result, { status: 'closed', detached: true, closeAttempted: true, failures: [] });
});

test('workspace view runtime treats missing Arena/Forge entries as a no-op', () => {
  const { calls, dependencies } = harness({ getView: (id) => { calls.push(['get', id]); return undefined; } });
  const result = closeWorkspaceBrowserViewRuntime('stale-account', dependencies);
  assert.deepEqual(calls, [['get', 'stale-account']]);
  assert.deepEqual(result, { status: 'missing', detached: false, closeAttempted: false, failures: [] });
});

test('workspace view runtime keeps closing and forgetting after detachment throws', () => {
  const { calls, dependencies } = harness({ detachView: (view) => { calls.push(['detach', view.id]); throw new Error('native detail should not leak'); } });
  const result = closeWorkspaceBrowserViewRuntime('account-a', dependencies);
  assert.deepEqual(calls.map(([step]) => step), ['get', 'detach', 'close', 'forget']);
  assert.deepEqual(result, { status: 'failed', detached: false, closeAttempted: true, failures: ['detach-view'] });
  assert.doesNotMatch(JSON.stringify(result), /native detail/);
});

test('workspace view runtime forgets a view even when WebContents.close throws', () => {
  const { calls, dependencies } = harness({ closeWebContents: (view) => { calls.push(['close', view.id]); throw new Error('secret close error'); } });
  const result = closeWorkspaceBrowserViewRuntime('account-b', dependencies);
  assert.deepEqual(calls.map(([step]) => step), ['get', 'detach', 'close', 'forget']);
  assert.deepEqual(result, { status: 'failed', detached: true, closeAttempted: true, failures: ['close-web-contents'] });
  assert.doesNotMatch(JSON.stringify(result), /secret close error/);
});

test('workspace view runtime reports registry cleanup failure without skipping prior operations', () => {
  const { calls, dependencies } = harness({ forgetView: (id, view) => { calls.push(['forget', id, view.id]); throw new Error('registry detail'); } });
  const result = closeWorkspaceBrowserViewRuntime('account-c', dependencies);
  assert.deepEqual(calls.map(([step]) => step), ['get', 'detach', 'close', 'forget']);
  assert.deepEqual(result, { status: 'failed', detached: true, closeAttempted: true, failures: ['forget-view'] });
  assert.doesNotMatch(JSON.stringify(result), /registry detail/);
});

test('workspace view runtime continues after multiple cleanup failures and records safe step names only', () => {
  const { calls, dependencies } = harness({
    detachView: (view) => { calls.push(['detach', view.id]); throw new Error('one'); },
    closeWebContents: (view) => { calls.push(['close', view.id]); throw new Error('two'); },
    forgetView: (id, view) => { calls.push(['forget', id, view.id]); throw new Error('three'); },
  });
  const result = closeWorkspaceBrowserViewRuntime('account-d', dependencies);
  assert.deepEqual(calls.map(([step]) => step), ['get', 'detach', 'close', 'forget']);
  assert.deepEqual(result, { status: 'failed', detached: false, closeAttempted: true, failures: ['detach-view', 'close-web-contents', 'forget-view'] });
  assert.doesNotMatch(JSON.stringify(result), /one|two|three/);
});

test('Arena and Forge both delegate only their view close sequence to the shared runtime', () => {
  const root = path.join(__dirname, '..');
  const main = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.match(main, /require\('\.\.\/build\/main\/workspace-browser-view-runtime\.js'\)/);
  const forge = fs.readFileSync(path.join(root, 'src/main/forge-browser-runtime.ts'), 'utf8');
  const arena = fs.readFileSync(path.join(root, 'src/main/arena-browser-runtime.ts'), 'utf8');
  assert.match(main, /function closeForgeBrowserView\(id, options = \{\}\) \{ return forgeBrowserRuntime\.closeBrowserView\(id, options\); \}/);
  assert.match(main, /function closeArenaView\(id\) \{ return arenaBrowserRuntime\.closeView\(id\); \}/);
  assert.match(forge, /closeWorkspaceBrowserViewRuntime\(id, \{/);
  assert.match(arena, /closeWorkspaceBrowserViewRuntime\(id, \{/);
  assert.match(forge, /if \(result\.status === 'missing'\) return;[\s\S]*if \(dependencies\.getSelectedAccountId\(\) === id && options\.clearSelection\)/);
  assert.match(pkg.scripts['build:main-modules'], /src\/main\/workspace-browser-view-runtime\.ts/);
  assert.match(pkg.scripts.test, /tests\/main-workspace-browser-view-runtime\.test\.js/);
  assert.match(main, /'src\/main\/workspace-browser-view-runtime\.ts'/);
  assert.match(JSON.stringify(pkg.build.extraResources), /main\/workspace-browser-view-runtime\.ts/);
});

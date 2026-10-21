const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

function sectionBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing start marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing end marker: ${endMarker}`);
  return source.slice(start, end);
}

function assertInOrder(source, ...needles) {
  let previous = -1;
  for (const needle of needles) {
    const index = source.indexOf(needle, previous + 1);
    assert.notEqual(index, -1, `expected ${JSON.stringify(needle)} after offset ${previous}`);
    assert.ok(index > previous, `${JSON.stringify(needle)} should appear after the previous lifecycle step`);
    previous = index;
  }
}

test('Arena account data wipe delegates to the typed close-before-clear coordinator', () => {
  const runtime = read('src/main/arena-account-data-runtime.ts');
  const store = read('src/main/arena-store-runtime.ts');
  assert.match(main, /require\('\.\.\/build\/main\/arena-account-data-runtime\.js'\)/);
  assert.match(main, /wipeAccountData: \(account\) => wipeArenaAccountDataRuntime\(account, \{/);
  assertInOrder(runtime, 'dependencies.closeView(account.id)', 'dependencies.getSession(account)', 'await session.clearStorageData()', 'await session.clearCache()');
  assert.match(runtime, /sessionStorage is per tab/);
  assert.match(runtime, /failedSteps\.push\('clear-storage'\)/);
  assert.match(runtime, /failedSteps\.push\('clear-cache'\)/);
  assert.doesNotMatch(runtime, /from ['"]electron['"]/);
  assert.match(store, /await dependencies\.wipeAccountData\(account\)/);
});

test('Arena account/provider deletion and login reset await wipes before mutation or view restoration', () => {
  const store = read('src/main/arena-store-runtime.ts');
  const deleteAccount = store.slice(store.indexOf('async function deleteAccount'), store.indexOf('async function deleteProvider'));
  assertInOrder(deleteAccount, 'await dependencies.wipeAccountData(account);', 'current.accounts = current.accounts.filter', 'fixSelection();', 'saveStore();', 'await dependencies.setBrowserModels');
  const deleteProvider = store.slice(store.indexOf('async function deleteProvider'), store.indexOf('async function resetLogin'));
  assertInOrder(deleteProvider, 'await dependencies.wipeAccountData(account)', 'current.accounts = current.accounts.filter', 'current.providers = current.providers.filter', 'saveStore();', 'await dependencies.setBrowserModels');
  const resetLogin = store.slice(store.indexOf('async function resetLogin'), store.indexOf('return { loadStore'));
  assertInOrder(resetLogin, 'await dependencies.wipeAccountData(account);', 'const { left, right } = loadStore().selected;', 'await dependencies.setBrowserModels({ left, right });');
});

test('suspending Instruction Forge closes every view without clearing its selected account', () => {
  const runtime = read('src/main/forge-browser-runtime.ts');
  assert.match(main, /function closeAllForgeBrowserViews\(options = \{\}\) \{ return forgeBrowserRuntime\.closeAllBrowserViews\(options\); \}/);
  const closeAll = runtime.slice(runtime.indexOf('function closeAllBrowserViews'), runtime.indexOf('function setBrowserAccount'));
  assertInOrder(closeAll, 'for (const id of [...views.keys()]) closeBrowserView(id, options);', 'layout.main = null;');
  const suspend = runtime.slice(runtime.indexOf('function suspendBrowsers'), runtime.indexOf('return { stateForRenderer'));
  assertInOrder(suspend, 'closeAllBrowserViews({ clearSelection: false });', 'return { ok: true };');
  assert.doesNotMatch(suspend, /setSelectedAccountId\(null\)/);
  assert.match(main, /handleForWorkspace\('instruction-forge',[^\r\n]+\)\('forge-suspend-browsers', \(\) => suspendForgeBrowsers\(\)\);/);
});

test('leaving Instruction Forge closes its native views before switching the control UI', () => {
  const workspace = sectionBetween(main, 'function setWorkspaceApp(app) {', "handle('set-control-mode'");
  assertInOrder(
    workspace,
    'workspaceApp = next;',
    "if (next !== 'instruction-forge') closeAllForgeBrowserViews({ clearSelection: false });",
    'closeAllAccountViews();',
    "setControlMode('launcher');",
    "controlView.webContents.send('workspace-app', { app: workspaceApp })",
  );
});

test('browser data cleanup contract tests remain part of the package test list and architecture documentation', () => {
  const pkg = JSON.parse(read('package.json'));
  const agents = read('AGENTS.md');
  const architecture = read('docs/architecture/ARCHITECTURE.md');
  assert.match(pkg.scripts.test, /tests\/main-browser-data-cleanup-contract\.test\.js/);
  assert.match(agents, /main-browser-data-cleanup-contract\.test\.js/);
  assert.match(architecture, /arenaWipeAccountData\(\).*suspendForgeBrowsers/s);
  assert.match(pkg.scripts['build:main-modules'], /src\/main\/arena-account-data-runtime\.ts/);
});

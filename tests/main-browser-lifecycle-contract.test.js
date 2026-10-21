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

test('workspace leave closes hidden browser views before switching the control UI', () => {
  const section = sectionBetween(main, 'function setWorkspaceApp(app) {', "handle('set-control-mode'");

  assert.match(section, /workspaceApp = next;/);
  assert.match(section, /if \(next !== 'ai-lab'\) clearArenaBrowserBindings\(\);/);
  assert.match(section, /if \(next !== 'instruction-forge'\) closeAllForgeBrowserViews\(\{ clearSelection: false \}\);/);
  assert.match(section, /if \(next !== 'video-hub'\).*suspendVideoHubBrowsers\(true\);/);

  const forgeBranch = sectionBetween(section, "} else if (next === 'instruction-forge' && !locked) {", "} else {");
  assertInOrder(forgeBranch, 'closeAllAccountViews();', "setControlMode('launcher');");

  const fallbackBranch = sectionBetween(section, "} else {\n    closeAllAccountViews();", "\n  }\n  if (controlView");
  assertInOrder(fallbackBranch, 'closeAllAccountViews();', "setControlMode('launcher');");
  assertInOrder(section, "setControlMode('launcher');", "controlView.webContents.send('workspace-app', { app: workspaceApp })");
});

test('app lock hides native browser renderers before laying out and publishing the lock screen', () => {
  const lock = sectionBetween(main, 'function lockApp(requestedWorkspaceApp = null) {', 'function restoreWorkspaceAfterUnlock() {');
  assertInOrder(
    lock,
    'workspaceApp = normalizeWorkspaceApp(requestedWorkspaceApp);',
    'locked = true;',
    'closeAllAccountViews();',
    'clearArenaBrowserBindings();',
    'closeAllForgeBrowserViews({ clearSelection: false });',
    'suspendVideoHubBrowsers(false);',
    'positionViews();',
    'pushConfig();',
    "controlView.webContents.send('workspace-app', { app: workspaceApp })",
  );

  const unlock = sectionBetween(main, 'function unlockApp() {', '// ---------------------------------------------------------------------------\n// Sessions');
  assertInOrder(unlock, 'locked = false;', 'passwordAttemptLimiter.reset();', 'pushConfig();', 'restoreWorkspaceAfterUnlock();');

  const restore = sectionBetween(main, 'function restoreWorkspaceAfterUnlock() {', '// ---------------------------------------------------------------------------\n// Sessions');
  const aiHubBranch = sectionBetween(restore, "if (workspaceApp === 'ai-hub') {", "if (workspaceApp === 'instruction-forge') {");
  assertInOrder(aiHubBranch, 'positionViews();', "send('workspace-app', { app: workspaceApp })", 'activateAccount(activeId);');
  const forgeBranch = sectionBetween(restore, "if (workspaceApp === 'instruction-forge') {", "if (workspaceApp === 'video-hub') {");
  assertInOrder(forgeBranch, 'positionViews();', "send('workspace-app', { app: workspaceApp })", 'setForgeBrowserAccount(forgeBrowserAccountId);');
  const videoBranch = sectionBetween(restore, "if (workspaceApp === 'video-hub') {", '  closeAllAccountViews();');
  assertInOrder(videoBranch, 'positionViews();', "send('workspace-app', { app: workspaceApp })", 'setVideoHubActiveAccount(selected);');
});

test('temporary AI Lab account-view borrowing is registered before creation and released before teardown', () => {
  const request = read('src/main/account-prompt-runtime.ts');
  assertInOrder(request, 'if (wasWorkspaceScoped && !forgeRequest) dependencies.markBorrowedAccountView(accountId, true);', 'dependencies.createAccountView(account, { allowOutsideWorkspace: true })');
  const unavailable = request.slice(request.indexOf('if (!wc || wc.isDestroyed())'), request.indexOf('const service = dependencies.findService'));
  assertInOrder(unavailable, 'dependencies.markBorrowedAccountView(accountId, false);', 'dependencies.removeAccountView(accountId, { preserveRuntime: true, cancelDownloads: false });');
  const finallyBlock = request.slice(request.lastIndexOf('} finally {'));
  assertInOrder(finallyBlock, 'dependencies.markBorrowedAccountView(accountId, false);', 'dependencies.removeAccountView(accountId, { preserveRuntime: true, cancelDownloads: false });');
  const memoryReclaim = sectionBetween(main, 'async function reclaimUnusedMemory() {', 'const diagnosticsController =');
  assert.match(memoryReclaim, /borrowedIds: aiLabBorrowedAccountViews/);
  const policyTests = read('tests/main-browser-view-policy.test.js');
  assert.match(policyTests, /never closes borrowed views/);
});

test('shutdown cleanup prevents quit, removes temporary accounts and persists state before session cleanup', () => {
  const quit = sectionBetween(main, "app.on('before-quit', async (event) => {", '// ---------------------------------------------------------------------------\n// Views and windows');

  assert.match(quit, /if \(quitCleanupStarted \|\| !config\) return;/);
  assert.match(quit, /if \(!sec\.clearCacheOnExit && !sec\.signOutOnExit && !config\.accounts\.some\(\(a\) => a\.temporary\)\) return;/);
  assertInOrder(
    quit,
    'event.preventDefault();',
    'quitCleanupStarted = true;',
    'await wipeTemporaryAccounts();',
    'saveConfig(config)',
    'runExitCleanup().catch(() => {}).finally(() => app.quit());',
  );

  const exitCleanup = sectionBetween(main, 'async function runExitCleanup() {', "app.on('before-quit'");
  assertInOrder(exitCleanup, 'const work = Promise.allSettled(', 'await Promise.race([work, new Promise((resolve) => setTimeout(resolve, 8000))]);');
});

test('lifecycle contract suite remains in the package test list and coding guidance', () => {
  const pkg = JSON.parse(read('package.json'));
  const agents = read('AGENTS.md');
  assert.match(pkg.scripts.test, /tests\/main-browser-lifecycle-contract\.test\.js/);
  assert.match(agents, /main-browser-lifecycle-contract\.test\.js/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { registerSettingsIpcHandlers } = require('../build/main/settings-ipc.js');
const { registerDownloadsIpcHandlers } = require('../build/main/downloads-ipc.js');

function makeRegistrar() {
  const handlers = new Map();
  const handle = (channel, handler, options) => {
    assert.equal(handlers.has(channel), false, `duplicate handler: ${channel}`);
    handlers.set(channel, { handler, options });
  };
  return { handle, handlers };
}

test('settings IPC module registers the established channels and delegates arguments unchanged', () => {
  const registrar = makeRegistrar();
  const calls = [];
  const controller = {
    setAppSettings: (patch) => { calls.push(['set-app-settings', patch]); return 'app'; },
    resetSettings: () => { calls.push(['reset-settings']); return 'reset'; },
    setSecuritySettings: (patch) => { calls.push(['set-security-settings', patch]); return 'security'; },
    setDownloadSettings: (patch) => { calls.push(['set-download-settings', patch]); return 'downloads'; },
  };

  registerSettingsIpcHandlers(registrar.handle, controller);
  assert.deepEqual([...registrar.handlers.keys()], [
    'set-app-settings', 'reset-settings', 'set-security-settings', 'set-download-settings',
  ]);
  const patch = { theme: 'dark', pageZoom: 110 };
  assert.equal(registrar.handlers.get('set-app-settings').handler({}, patch), 'app');
  assert.equal(registrar.handlers.get('reset-settings').handler({}), 'reset');
  assert.equal(registrar.handlers.get('set-security-settings').handler({}, { lockOnLaunch: true }), 'security');
  assert.equal(registrar.handlers.get('set-download-settings').handler({}, { notifyWhenDone: false }), 'downloads');
  assert.deepEqual(calls, [
    ['set-app-settings', patch], ['reset-settings'],
    ['set-security-settings', { lockOnLaunch: true }],
    ['set-download-settings', { notifyWhenDone: false }],
  ]);
});

test('downloads IPC module registers the established channels and keeps actions ID-based', () => {
  const registrar = makeRegistrar();
  const calls = [];
  const controller = {
    chooseFolder: () => { calls.push(['choose-download-folder']); return 'folder'; },
    getDownloads: () => { calls.push(['get-downloads']); return 'state'; },
    performAction: (action, id) => { calls.push(['download-action', action, id]); return 'action'; },
  };

  registerDownloadsIpcHandlers(registrar.handle, controller);
  assert.deepEqual([...registrar.handlers.keys()], [
    'choose-download-folder', 'get-downloads', 'download-action',
  ]);
  assert.equal(registrar.handlers.get('choose-download-folder').handler({}), 'folder');
  assert.equal(registrar.handlers.get('get-downloads').handler({}), 'state');
  assert.equal(registrar.handlers.get('download-action').handler({}, 'pause', 'download-17'), 'action');
  assert.deepEqual(calls, [
    ['choose-download-folder'], ['get-downloads'], ['download-action', 'pause', 'download-17'],
  ]);
});


test('browser/session IPC groups are bound to their owning workspace', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const main = fs.readFileSync(path.join(__dirname, '..', 'src/main.js'), 'utf8');
  assert.match(main, /function handleForWorkspace\(workspace, message\)/);
  assert.match(main, /registerVideoHubIpcHandlers\(handleForWorkspace\('video-hub'/);
  assert.match(main, /handleForWorkspace\('ai-lab',[^\r\n]+\)\('arena-delete-account'/);
  assert.match(main, /handleForWorkspace\('instruction-forge',[^\r\n]+\)\('forge-set-browser'/);
  assert.match(main, /handleForWorkspace\('ai-lab',[^\r\n]+\)\('ai-lab-request', \(_event, payload\) => aiLabRuntime\.request\(payload\)\)/);
});

test('sensitive model credentials and browser commands are scoped to their owning workspace', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const main = fs.readFileSync(path.join(__dirname, '..', 'src/main.js'), 'utf8');
  assert.match(main, /function handleForWorkspaces\(workspaces, message\)/);
  assert.match(main, /function handleForWorkspace\(workspace, message\)\s*\{\s*return handleForWorkspaces\(\[workspace\], message\)/);
  for (const channel of ['set-ai-lab-api-key', 'clear-ai-lab-api-key', 'get-ai-lab-data', 'save-ai-lab-data', 'ai-lab-request', 'scan-local-models']) {
    assert.match(main, new RegExp(`handleForWorkspace\\('ai-lab',[^\\r\\n]+\\)\\('${channel}'`), `${channel} is AI Lab-only`);
  }
  for (const channel of ['switch-account', 'navigate', 'open-external']) {
    assert.match(main, new RegExp(`handleForWorkspace\\('ai-hub',[^\\r\\n]+\\)\\('${channel}'`), `${channel} is AI Hub-only`);
  }
  assert.match(main, /handleForWorkspaces\(\['ai-lab', 'instruction-forge'\],[^\r\n]+\)\('get-ai-hub-ai-models'/);
});


test('global UI IPC commands reject invalid primitive types instead of coercing them', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const main = fs.readFileSync(path.join(__dirname, '..', 'src/main.js'), 'utf8');
  assert.match(main, /handle\('set-control-mode',[\s\S]*?!isControlMode\(mode\)[\s\S]*?Invalid control mode/);
  assert.match(main, /handle\('write-system-clipboard',[\s\S]*?typeof text !== 'string'[\s\S]*?Clipboard text must be a string[\s\S]*?!isStringWithinLength\(text, 50000\)/);
  assert.match(main, /handle\('set-sidebar-hidden',[\s\S]*?!isBooleanValue\(hidden\)[\s\S]*?Invalid sidebar visibility[\s\S]*?\{ toolbar: true \}/);
});


test('separate Developer Inspector IPC obeys trusted-sender, lock, and bounded-payload checks', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const main = fs.readFileSync(path.join(__dirname, '..', 'src/main.js'), 'utf8');
  const helperStart = main.indexOf('function handleDeveloperDebugWindow(channel, fn)');
  const helperEnd = main.indexOf('const DEVELOPER_DEBUG_SETTING_DEFAULTS', helperStart);
  assert.ok(helperStart >= 0 && helperEnd > helperStart, 'inspector IPC should use a dedicated registration helper');
  const helper = main.slice(helperStart, helperEnd);
  assert.match(helper, /isTrustedDeveloperDebugWindowSender\(event\)/);
  assert.match(helper, /if \(locked\) return \{ ok: false, error: 'Mad Station is locked\.' \}/);
  assert.match(helper, /isSafeIpcPayload\(args\)/);
  assert.match(helper, /await fn\(event, \.\.\.args\)[\s\S]*?if \(locked\)/, 'async inspector operations must re-check lock state before returning');

  const channels = [
    'developer-debug-window-get-settings',
    'developer-debug-window-set-settings',
    'developer-debug-window-search-elements',
    'developer-debug-window-highlight-element',
    'developer-debug-window-set-pinned',
    'developer-debug-window-copy-text',
    'developer-debug-window-clear-click',
  ];
  for (const channel of channels) {
    assert.ok(main.includes(`handleDeveloperDebugWindow('${channel}'`), `${channel} must use the guarded inspector registrar`);
    assert.ok(!main.includes(`ipcMain.handle('${channel}'`), `${channel} must not bypass the guarded registrar`);
  }
});

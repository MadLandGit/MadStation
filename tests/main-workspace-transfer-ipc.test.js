const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { registerWorkspaceTransferIpcHandlers } = require('../build/main/workspace-transfer-ipc.js');

function makeRegistrar() {
  const handlers = new Map();
  const handle = (channel, callback, options) => {
    assert.equal(handlers.has(channel), false, `duplicate handler: ${channel}`);
    handlers.set(channel, { callback, options });
  };
  return { handle, handlers };
}

test('workspace transfer IPC preserves all four channels and delegates to host-owned commands', async () => {
  const registrar = makeRegistrar();
  const calls = [];
  const commands = {
    exportAccounts: () => { calls.push('exportAccounts'); return { ok: true }; },
    importAccounts: async () => { calls.push('importAccounts'); return { ok: true, count: 1 }; },
    backupConfig: () => { calls.push('backupConfig'); return { ok: true }; },
    restoreConfig: async () => { calls.push('restoreConfig'); return { ok: true }; },
  };
  registerWorkspaceTransferIpcHandlers(registrar.handle, commands);
  assert.deepEqual([...registrar.handlers.keys()], ['export-accounts', 'import-accounts', 'backup-config', 'restore-config']);
  assert.deepEqual(registrar.handlers.get('export-accounts').callback({}), { ok: true });
  assert.deepEqual(await registrar.handlers.get('import-accounts').callback({}), { ok: true, count: 1 });
  assert.deepEqual(registrar.handlers.get('backup-config').callback({}), { ok: true });
  assert.deepEqual(await registrar.handlers.get('restore-config').callback({}), { ok: true });
  assert.deepEqual(calls, ['exportAccounts', 'importAccounts', 'backupConfig', 'restoreConfig']);
});

test('workspace transfer registrations use secure host handle and all modules are wired', () => {
  const root = path.join(__dirname, '..');
  const main = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
  const ipc = fs.readFileSync(path.join(root, 'src/main/workspace-transfer-ipc.ts'), 'utf8');
  const controller = fs.readFileSync(path.join(root, 'src/main/workspace-transfer-controller.ts'), 'utf8');
  const files = fs.readFileSync(path.join(root, 'src/main/workspace-transfer-files.ts'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.match(main, /registerWorkspaceTransferIpcHandlers\(handle,/);
  assert.match(main, /await wipeAllSessions\(\)[\s\S]*?config = restored/);
  for (const channel of ['export-accounts', 'import-accounts', 'backup-config', 'restore-config']) {
    assert.match(ipc, new RegExp(`handle\\('${channel}'`));
    assert.doesNotMatch(main, new RegExp(`handle\\('${channel}'`));
  }
  for (const moduleName of ['workspace-transfer-controller.ts', 'workspace-transfer-ipc.ts', 'workspace-transfer-files.ts']) {
    assert.match(pkg.scripts['build:main-modules'], new RegExp(moduleName.replace('.', '\\.')));
    assert.ok(pkg.build.extraResources.find((item) => item.from === 'src').filter.includes(`main/${moduleName}`));
  }
  assert.match(controller, /prepareAccountImport/);
  assert.match(controller, /prepareWorkspaceRestore/);
  assert.match(files, /MAX_WORKSPACE_TRANSFER_BYTES/);
  assert.match(files, /flag: 'wx'/);
});

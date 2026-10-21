const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { registerDiagnosticsIpcHandlers } = require('../build/main/diagnostics-ipc.js');

function makeRegistrar() {
  const handlers = new Map();
  const handle = (channel, handler, options) => {
    assert.equal(handlers.has(channel), false, `duplicate handler: ${channel}`);
    handlers.set(channel, { handler, options });
  };
  return { handle, handlers };
}

test('diagnostics IPC module preserves established channel names and delegates commands', async () => {
  const registrar = makeRegistrar();
  const calls = [];
  const commands = {
    getDiagnostics: () => { calls.push('get'); return { ok: true, data: {} }; },
    checkProviderCompatibility: async () => { calls.push('check'); return { ok: true, providers: [] }; },
    exportDiagnostics: () => { calls.push('export'); return { ok: true }; },
  };
  registerDiagnosticsIpcHandlers(registrar.handle, commands);
  assert.deepEqual([...registrar.handlers.keys()], ['get-diagnostics', 'check-provider-compatibility', 'export-diagnostics']);
  const invoke = (channel) => registrar.handlers.get(channel).handler({});
  assert.deepEqual(invoke('get-diagnostics'), { ok: true, data: {} });
  assert.deepEqual(await invoke('check-provider-compatibility'), { ok: true, providers: [] });
  assert.deepEqual(invoke('export-diagnostics'), { ok: true });
  assert.deepEqual(calls, ['get', 'check', 'export']);
});

test('diagnostics registrations use the secure main handle and are included in the build/package allowlist', () => {
  const root = path.join(__dirname, '..');
  const main = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');
  const source = fs.readFileSync(path.join(root, 'src', 'main', 'diagnostics-ipc.ts'), 'utf8');
  const controller = fs.readFileSync(path.join(root, 'src', 'main', 'diagnostics-controller.ts'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.match(main, /registerDiagnosticsIpcHandlers\(handle, diagnosticsController\)/);
  assert.match(main, /createDiagnosticsController\(/);
  assert.match(main, /writeDiagnosticsJsonAtomically\(/);
  for (const channel of ['get-diagnostics', 'check-provider-compatibility', 'export-diagnostics']) {
    assert.doesNotMatch(main, new RegExp(`handle\\(['"]${channel}`));
    assert.match(source, new RegExp(`handle\\(['"]${channel}`));
  }
  assert.match(pkg.scripts['build:main-modules'], /src\/main\/diagnostics-controller\.ts/);
  assert.match(pkg.scripts['build:main-modules'], /src\/main\/diagnostics-ipc\.ts/);
  assert.match(pkg.scripts.test, /tests\/main-diagnostics-controller\.test\.js/);
  assert.match(pkg.scripts.test, /tests\/main-diagnostics-ipc\.test\.js/);
  const resources = pkg.build.extraResources.find((item) => item.from === 'src');
  assert.ok(resources.filter.includes('main/diagnostics-controller.ts'));
  assert.ok(resources.filter.includes('main/diagnostics-ipc.ts'));
  assert.match(controller, /normalizeDiagnosticsExportPath/);
  assert.match(controller, /redactDiagnosticText/);
  assert.match(controller, /writeFileSync\(temporaryPath, serialized/);
});

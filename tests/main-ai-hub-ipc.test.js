const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { registerAiHubIpcHandlers } = require('../build/main/ai-hub-ipc.js');

function makeRegistrar() {
  const handlers = new Map();
  const handle = (channel, handler, options) => {
    assert.equal(handlers.has(channel), false, `duplicate handler: ${channel}`);
    handlers.set(channel, { handler, options });
  };
  return { handle, handlers };
}

const commandNames = [
  'addService', 'updateService', 'deleteService', 'addAccount', 'updateAccount',
  'renameAccount', 'setAccountShortcut', 'deleteAccount', 'reorderServices',
  'reorderAccounts', 'resetAccount', 'clearAccountCache', 'clearAccountSiteData',
];

function makeCommands(calls) {
  return Object.fromEntries(commandNames.map((name) => [name, (...args) => {
    calls.push([name, ...args]);
    return `${name}-result`;
  }]));
}

const expectedChannels = [
  'add-service', 'update-service', 'delete-service', 'add-account', 'update-account',
  'rename-account', 'set-account-shortcut', 'delete-account', 'reorder-services',
  'reorder-accounts', 'reset-account', 'clear-account-cache', 'clear-account-site-data',
];

test('AI Hub IPC module preserves established channel names and registration order', () => {
  const registrar = makeRegistrar();
  registerAiHubIpcHandlers(registrar.handle, makeCommands([]));
  assert.deepEqual([...registrar.handlers.keys()], expectedChannels);
});

test('AI Hub IPC delegates IDs and payloads unchanged and preserves async results', async () => {
  const registrar = makeRegistrar();
  const calls = [];
  const commands = makeCommands(calls);
  commands.deleteService = async (id) => {
    calls.push(['deleteService', id]);
    return { ok: true, id };
  };
  registerAiHubIpcHandlers(registrar.handle, commands);
  const invoke = (channel, ...args) => registrar.handlers.get(channel).handler({}, ...args);
  const payload = { name: 'Example', url: 'https://example.com' };
  assert.equal(invoke('add-service', payload), 'addService-result');
  assert.equal(invoke('update-service', 'provider-1', payload), 'updateService-result');
  assert.deepEqual(await invoke('delete-service', 'provider-1'), { ok: true, id: 'provider-1' });
  assert.equal(invoke('add-account', payload), 'addAccount-result');
  assert.equal(invoke('update-account', 'account-2', payload), 'updateAccount-result');
  assert.equal(invoke('rename-account', 'account-2', 'New name'), 'renameAccount-result');
  assert.equal(invoke('set-account-shortcut', 'account-2', 'Ctrl+2'), 'setAccountShortcut-result');
  assert.equal(invoke('delete-account', 'account-2'), 'deleteAccount-result');
  assert.equal(invoke('reorder-services', ['provider-1']), 'reorderServices-result');
  assert.equal(invoke('reorder-accounts', ['account-2']), 'reorderAccounts-result');
  assert.equal(invoke('reset-account', 'account-2'), 'resetAccount-result');
  assert.equal(invoke('clear-account-cache', 'account-2'), 'clearAccountCache-result');
  assert.equal(invoke('clear-account-site-data', 'account-2'), 'clearAccountSiteData-result');
  assert.deepEqual(calls, [
    ['addService', payload], ['updateService', 'provider-1', payload], ['deleteService', 'provider-1'],
    ['addAccount', payload], ['updateAccount', 'account-2', payload], ['renameAccount', 'account-2', 'New name'],
    ['setAccountShortcut', 'account-2', 'Ctrl+2'], ['deleteAccount', 'account-2'],
    ['reorderServices', ['provider-1']], ['reorderAccounts', ['account-2']], ['resetAccount', 'account-2'],
    ['clearAccountCache', 'account-2'], ['clearAccountSiteData', 'account-2'],
  ]);
});

test('AI Hub IPC module is wired through secure main handle and packaged build inputs', () => {
  const root = path.join(__dirname, '..');
  const main = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');
  const source = fs.readFileSync(path.join(root, 'src', 'main', 'ai-hub-ipc.ts'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.match(main, /require\('\.\.\/build\/main\/ai-hub-ipc\.js'\)/);
  assert.match(main, /registerAiHubIpcHandlers\(handle, \{/);
  for (const channel of expectedChannels) {
    assert.doesNotMatch(main, new RegExp(`handle\\(['"]${channel}['"]`), `${channel} must register in the typed IPC module`);
    assert.match(source, new RegExp(`handle\\(['"]${channel}['"]`));
  }
  assert.match(pkg.scripts['build:main-modules'], /src\/main\/ai-hub-ipc\.ts/);
  assert.match(pkg.scripts.test, /tests\/main-ai-hub-ipc\.test\.js/);
  const resources = pkg.build.extraResources.find((item) => item.from === 'src');
  assert.ok(resources.filter.includes('main/ai-hub-ipc.ts'));
  assert.match(main, /'src\/main\/ai-hub-ipc\.ts'/);
  assert.match(source, /import type \{ SecureIpcHandle \} from '\.\/settings-ipc\.js'/);
  assert.match(main, /function handle\(channel, fn, options = \{\}\)/);
});

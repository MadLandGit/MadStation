const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createWorkspaceTransferController } = require('../build/main/workspace-transfer-controller.js');

function createController(overrides = {}) {
  let generated = 0;
  const calls = { migrated: [] };
  const controller = createWorkspaceTransferController({
    cleanText: (value, max = 120) => String(value ?? '').trim().slice(0, max),
    normalizeHttpsUrl: (value) => {
      try {
        const url = new URL(String(value ?? '').trim());
        return url.protocol === 'https:' ? url.href : null;
      } catch { return null; }
    },
    sanitizeIcon: (value) => /^https:\/\//i.test(String(value ?? '')) ? String(value) : '',
    faviconForUrl: (value) => `https://icons.example.test/${new URL(value).hostname}.ico`,
    normalizeProviderMetadata: (value) => ({ ...value, category: String(value.category ?? ''), id: String(value.id), name: String(value.name), url: String(value.url) }),
    normalizeAccountPreferences: (value) => ({ imported: true, favorite: Boolean(value?.favorite) }),
    randomId: () => `r${++generated}`,
    migrateConfig: (value) => {
      calls.migrated.push(value);
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Config is not an object.');
      if (!Array.isArray(value.services) || !Array.isArray(value.accounts)) throw new Error('Config is missing collections.');
      return { ...value, services: value.services, accounts: value.accounts };
    },
    ...overrides,
  });
  return { controller, calls };
}

function currentConfig() {
  return {
    version: 13,
    services: [{ id: 'openai', name: 'OpenAI', url: 'https://openai.example/', icon: 'https://openai.example/icon.ico' }],
    accounts: [{ id: 'account-1', serviceId: 'openai', name: 'Primary', url: 'https://openai.example/', icon: '', shortcut: 'Ctrl+1', temporary: true, favorite: true, preferences: {} }],
    serviceOrder: ['openai'],
    accountOrder: ['account-1'],
    activeId: 'account-1',
  };
}

test('account export preserves the established envelope and marks exported accounts non-temporary', () => {
  const { controller } = createController();
  const config = currentConfig();
  const exported = controller.createAccountExport(config, '2026-10-15T10:00:00.000Z');
  assert.equal(exported.format, 'mad-station-accounts');
  assert.equal(exported.version, 1);
  assert.equal(exported.exportedAt, '2026-10-15T10:00:00.000Z');
  assert.equal(exported.services, config.services);
  assert.equal(exported.accounts[0].temporary, false);
  assert.equal(config.accounts[0].temporary, true, 'export must not mutate live config');
});

test('account import creates a new config, merges providers by name, uniquifies account names, and repairs imported rows', () => {
  const { controller } = createController();
  const current = currentConfig();
  const result = controller.prepareAccountImport({
    format: 'mad-station-accounts',
    version: 1,
    services: [
      { id: 'remote-openai', name: 'OpenAI', url: 'https://openai.example/' },
      { id: 'remote-anthropic', name: 'Anthropic', url: 'https://anthropic.example/', category: 'AI' },
      { id: 'bad-provider', name: 'Bad Provider', url: 'javascript:alert(1)' },
      null,
    ],
    accounts: [
      { id: 'old-account-1', serviceId: 'remote-openai', name: 'Primary', url: 'https://openai.example/', favorite: true },
      { id: 'old-account-2', serviceId: 'remote-anthropic', name: 'Claude', url: 'https://anthropic.example/', favorite: false },
      { id: 'bad-account', serviceId: 'remote-openai', name: 'Bad URL', url: 'file:///secret' },
      null,
    ],
  }, current);

  assert.equal(result.ok, true);
  assert.equal(result.count, 2);
  assert.notEqual(result.config, current);
  assert.equal(current.services.length, 1);
  assert.equal(current.accounts.length, 1);
  assert.equal(result.config.services.length, 2);
  assert.deepEqual(result.config.serviceOrder, ['openai', 'imported-r1']);
  assert.deepEqual(result.config.accountOrder, ['account-1', 'openai-r2', 'imported-r1-r3']);
  assert.equal(result.config.accounts[1].name, 'Primary 2');
  assert.equal(result.config.accounts[1].serviceId, 'openai');
  assert.equal(result.config.accounts[1].shortcut, '');
  assert.equal(result.config.accounts[1].temporary, false);
  assert.deepEqual(result.config.accounts[1].preferences, { imported: true, favorite: true });
  assert.equal(result.config.accounts[2].name, 'Claude');
  assert.equal(result.config.accounts[2].serviceId, 'imported-r1');
  assert.equal(result.config.services[1].name, 'Anthropic');
});

test('malformed account import envelope is rejected without returning a candidate config', () => {
  const { controller } = createController();
  const current = currentConfig();
  for (const raw of [null, [], {}, { format: 'wrong', services: [], accounts: [] }, { format: 'mad-station-accounts', services: [], accounts: {} }]) {
    const result = controller.prepareAccountImport(raw, current);
    assert.equal(result.ok, false);
    assert.match(result.error, /not a valid Mad Station account export/);
    assert.equal(current.services.length, 1);
    assert.equal(current.accounts.length, 1);
  }
});

test('workspace backup preserves the versioned envelope and restore accepts backup or historical raw config', () => {
  const { controller, calls } = createController();
  const config = currentConfig();
  const backup = controller.createWorkspaceBackup(config, '1.6.3', '2026-10-15T10:00:00.000Z');
  assert.deepEqual(backup, {
    format: 'mad-station-backup',
    version: 1,
    appVersion: '1.6.3',
    createdAt: '2026-10-15T10:00:00.000Z',
    config,
  });
  const restored = controller.prepareWorkspaceRestore(backup);
  assert.deepEqual(restored, config);
  const legacy = controller.prepareWorkspaceRestore(config);
  assert.deepEqual(legacy, config);
  assert.deepEqual(calls.migrated, [config, config]);
  assert.throws(() => controller.prepareWorkspaceRestore({ format: 'mad-station-backup', config: [] }), /Config is not an object/);
});

test('workspace transfer source wiring is included in build, tests, and developer package allowlist', () => {
  const root = path.join(__dirname, '..');
  const main = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.match(main, /createWorkspaceTransferController\(/);
  assert.match(main, /prepareWorkspaceRestore\(raw\)/);
  assert.match(main, /writeWorkspaceJsonAtomically\(/);
  for (const file of ['workspace-transfer-controller.ts', 'workspace-transfer-ipc.ts', 'workspace-transfer-files.ts']) {
    assert.match(pkg.scripts['build:main-modules'], new RegExp(`src/main/${file.replace('.', '\\.')} `));
    assert.ok(pkg.build.extraResources.find((item) => item.from === 'src').filter.includes(`main/${file}`));
  }
  assert.match(pkg.scripts.test, /tests\/main-workspace-transfer-controller\.test\.js/);
});

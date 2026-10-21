const test = require('node:test');
const assert = require('node:assert/strict');
const { createConfigSchema } = require('../build/main/config-schema.js');
const { normalizeAppSettings, DEFAULT_APP_SETTINGS, DEFAULT_SECURITY } = require('../build/main/settings.js');
const { normalizeDownloadSettings, DEFAULT_DOWNLOAD_SETTINGS } = require('../build/main/downloads.js');

function createSchema(defaultServices = [
  { id: 'sample', name: 'Sample AI', url: 'https://sample.example/', icon: 'https://sample.example/favicon.ico' },
]) {
  let generatedId = 0;
  return createConfigSchema({
    defaultServices,
    configSchemaVersion: 13,
    randomId: () => `generated${++generatedId}`,
    shortcutForIndex: (index) => index < 9 ? `Ctrl+${index + 1}` : '',
    normalizeShortcut: (value) => String(value || '').trim(),
    normalizeLock: (value) => value && typeof value === 'object' && typeof value.hash === 'string' && typeof value.salt === 'string'
      ? { hash: value.hash, salt: value.salt }
      : null,
    zoomChoices: [80, 90, 100, 110, 125, 150],
    defaultAppSettings: DEFAULT_APP_SETTINGS,
    defaultSecurity: DEFAULT_SECURITY,
    defaultDownloadSettings: DEFAULT_DOWNLOAD_SETTINGS,
    normalizeAppSettings,
    normalizeSecurity: (raw) => require('../build/main/settings.js').normalizeSecurity(raw),
    normalizeDownloadSettings,
  });
}

test('default config maintains persisted schema and initializes provider/account order', () => {
  const schema = createSchema();
  const config = schema.makeDefaultConfig();
  assert.equal(config.version, 13);
  assert.deepEqual(config.serviceOrder, ['sample']);
  assert.deepEqual(config.accountOrder, ['sample-1-generated1']);
  assert.equal(config.activeId, 'sample-1-generated1');
  assert.equal(config.accounts[0].shortcut, 'Ctrl+1');
  assert.deepEqual(config.settings.downloads, DEFAULT_DOWNLOAD_SETTINGS);
});

test('config migration repairs providers/accounts and drops malformed URLs and duplicates', () => {
  const schema = createSchema();
  const config = schema.migrateConfig({
    version: 4,
    services: [
      { id: 'sample', name: 'Sample AI', url: 'https://sample.example/', icon: 'javascript:alert(1)' },
      { id: 'bad', name: 'Invalid provider', url: 'file:///secret.txt' },
      { id: 'sample', name: 'Duplicate ID', url: 'https://duplicate.example/' },
    ],
    accounts: [
      { id: 'account1', serviceId: 'sample', name: 'Primary', url: 'https://sample.example/', shortcut: 'Ctrl+1', tags: ['one', 'one'], usage: { secret: true }, dailyUsage: 99 },
      { id: 'account2', serviceId: 'bad', name: 'Invalid URL', url: 'javascript:alert(1)' },
    ],
    serviceOrder: ['sample', 'sample', 'bad'],
    accountOrder: ['account2', 'account1', 'account1'],
    recentAccountIds: ['account2', 'account1', 'missing'],
    activeId: 'account2',
    settings: { theme: 'invalid', security: { allowCamera: false }, downloads: { folder: 'relative-folder' } },
    lock: { hash: 'opaque-hash', salt: 'opaque-salt' },
  });

  assert.equal(config.version, 13);
  assert.equal(config.services.length, 1);
  assert.equal(config.services[0].id, 'sample');
  assert.equal(config.services[0].icon, 'https://sample.example/favicon.ico');
  assert.equal(config.accounts.length, 1);
  assert.equal(config.accounts[0].id, 'account1');
  assert.equal(config.accounts[0].icon, 'https://sample.example/favicon.ico');
  assert.deepEqual(config.accounts[0].tags, ['one']);
  assert.equal('usage' in config.accounts[0], false);
  assert.equal('dailyUsage' in config.accounts[0], false);
  assert.deepEqual(config.serviceOrder, ['sample']);
  assert.deepEqual(config.accountOrder, ['account1']);
  assert.deepEqual(config.recentAccountIds, ['account1']);
  assert.equal(config.activeId, 'account1');
  assert.equal(config.settings.theme, 'dark');
  assert.equal(config.settings.security.allowCamera, false);
  assert.equal(config.settings.downloads.folder, '');
  assert.deepEqual(config.lock, { hash: 'opaque-hash', salt: 'opaque-salt' });
});

test('provider auth-domain allowlists reject public suffixes and malformed wildcard domains', () => {
  const schema = createSchema();
  const config = schema.migrateConfig({
    version: 13,
    services: [{
      id: 'sample', name: 'Sample AI', url: 'https://sample.example/',
      authDomains: ['com', 'co.uk', 'github.io', '*.example.test', 'host..example', 'identity.example.com', 'login.example.co.uk'],
    }],
    accounts: [{ id: 'account1', serviceId: 'sample', name: 'Sample', url: 'https://sample.example/' }],
  });
  assert.deepEqual(config.services[0].authDomains, ['identity.example.com', 'login.example.co.uk']);
});

test('config migration rejects a non-object root and normalizes an invalid lock away', () => {
  const schema = createSchema();
  assert.throws(() => schema.migrateConfig([]), /Config is not an object/);
  const config = schema.migrateConfig({ services: [], accounts: [], lock: { hash: '', salt: 1 } });
  assert.equal('lock' in config, false);
});


test('untouched legacy starter accounts migrate to one account per current curated provider', () => {
  const defaultProviders = require('../src/default-providers.js');
  const legacyIds = new Set(['chatgpt', 'claude', 'deepseek', 'gemini', 'perplexity', 'grok']);
  const legacyServices = defaultProviders.filter((provider) => legacyIds.has(provider.id));
  const legacyAccounts = legacyServices.flatMap((provider) => [1, 2, 3].map((number) => ({
    id: `${provider.id}-legacy-${number}`,
    serviceId: provider.id,
    name: `${provider.name} ${number}`,
    url: provider.url,
    icon: provider.icon,
  })));
  const schema = createSchema(defaultProviders);
  const migrated = schema.migrateConfig({
    version: 3,
    services: legacyServices.map((provider) => ({ ...provider })),
    accounts: legacyAccounts,
    activeId: legacyAccounts[0].id,
  });

  assert.equal(migrated.services.length, defaultProviders.length);
  assert.equal(migrated.accounts.length, defaultProviders.length);
  assert.equal(migrated.accounts[0].id, 'chatgpt-legacy-1');
  assert.equal(migrated.accounts[0].name, 'ChatGPT');
  assert.equal(migrated.accounts.find((account) => account.serviceId === 'character-ai')?.name, 'Character.AI');
  assert.equal(new Set(migrated.accountOrder).size, defaultProviders.length);
});

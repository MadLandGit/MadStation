const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  buildAiHubReadModel,
  orderedConfigItems,
  reorderConfigCollection,
} = require('../build/main/ai-hub-read-model.js');

function makeReadModelDependencies(overrides = {}) {
  const config = {
    services: [
      { id: 'openai', name: 'OpenAI', url: 'https://chatgpt.com/', icon: 'https://saved.example/openai.png' },
      { id: 'claude', name: 'Claude', url: 'https://claude.ai/', icon: '' },
    ],
    accounts: [
      { id: 'account-1', serviceId: 'openai', name: 'Account 1', url: 'https://chatgpt.com/', icon: '', shortcut: 'Ctrl+1', favorite: true, group: 'Work', tags: ['work'], temporary: false, preferences: {} },
      { id: 'orphan-1', serviceId: 'missing', name: 'Orphan', url: 'https://orphan.example/', icon: '', shortcut: '', favorite: false, group: '', tags: [], temporary: false, preferences: {} },
    ],
    serviceOrder: ['claude', 'openai'],
    accountOrder: ['orphan-1', 'account-1'],
    recentAccountIds: ['account-1'],
  };
  const base = { settings: { theme: 'dark' }, locked: false, appVersion: '1.6.3' };
  const dependencies = {
    base,
    locked: false,
    config,
    activeId: 'account-1',
    accountRuntime: new Map([['account-1', { lastError: 'Navigation failed' }]]),
    localIconFor: (service) => service?.id === 'openai' ? 'data:image/png;base64,LOCAL' : '',
    sanitizeIcon: (value) => typeof value === 'string' && (value.startsWith('https:') || value.startsWith('data:image/')) ? value : '',
    faviconForUrl: (value) => typeof value === 'string' ? `https://favicon.example/?url=${encodeURIComponent(value)}` : '',
    iconCandidatesFor: (service, preferred = '', options = {}) => {
      const candidates = [preferred, typeof service.icon === 'string' ? service.icon : '', `https://favicon.example/?url=${encodeURIComponent(String(service.url || ''))}`].filter(Boolean);
      if (options.includeCachedRemote === false) return [...new Set(candidates)];
      return [...new Set(candidates)];
    },
    normalizeAccountPreferences: (account) => ({ favorite: Boolean(account.favorite), normalized: true }),
  };
  return { ...dependencies, ...overrides };
}

test('orderedConfigItems preserves explicit ranks and stable input order for unranked entries', () => {
  const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
  assert.deepEqual(orderedConfigItems(items, ['c', 'a']), [{ id: 'c' }, { id: 'a' }, { id: 'b' }, { id: 'd' }]);
  assert.deepEqual(orderedConfigItems(items, null), items);
});

test('reorderConfigCollection atomically accepts only complete unique IDs from the current order', () => {
  const config = { serviceOrder: ['a', 'b', 'c'], accountOrder: ['one', 'two'] };
  assert.equal(reorderConfigCollection(config, 'serviceOrder', ['c', 'a', 'b']), true);
  assert.deepEqual(config.serviceOrder, ['c', 'a', 'b']);
  for (const invalid of [null, ['a', 'a', 'c'], ['a', 'b'], ['a', 'b', 'unknown'], [1, 'a', 'b']]) {
    const before = [...config.serviceOrder];
    assert.equal(reorderConfigCollection(config, 'serviceOrder', invalid), false);
    assert.deepEqual(config.serviceOrder, before, 'invalid requests must not partially mutate order');
  }
  assert.equal(reorderConfigCollection(config, 'accountOrder', ['two', 'one']), true);
  assert.deepEqual(config.accountOrder, ['two', 'one']);
  assert.equal(reorderConfigCollection({ serviceOrder: undefined }, 'serviceOrder', []), false);
});

test('buildAiHubReadModel preserves provider/account order, safe icon projections, and runtime status', () => {
  const dependencies = makeReadModelDependencies();
  const result = buildAiHubReadModel(dependencies);
  assert.deepEqual(result.services.map((service) => service.id), ['claude', 'openai']);
  assert.deepEqual(result.serviceOrder, ['claude', 'openai']);
  assert.deepEqual(result.accountOrder, ['orphan-1', 'account-1']);
  assert.deepEqual(result.accounts.map((account) => account.id), ['orphan-1', 'account-1']);
  const orphan = result.accounts[0];
  assert.equal(orphan.providerMissing, true);
  assert.equal(orphan.status, 'ready');
  assert.equal(orphan.lastError, '');
  const account = result.accounts[1];
  assert.equal(account.providerMissing, false);
  assert.equal(account.status, 'error');
  assert.equal(account.lastError, 'Navigation failed');
  assert.equal(account.favorite, true);
  assert.deepEqual(account.preferences, { favorite: true, normalized: true });
  assert.equal(account.icon, 'https://saved.example/openai.png', 'preferred provider icon candidates retain the established candidate precedence');
  assert.deepEqual(result.recentAccountIds, ['account-1']);
});

test('buildAiHubReadModel hides providers, accounts, and active account while locked', () => {
  const dependencies = makeReadModelDependencies({ locked: true });
  const result = buildAiHubReadModel(dependencies);
  assert.deepEqual(result, { ...dependencies.base, services: [], accounts: [], activeId: null });
});

test('read model wiring is kept in the typed module and packaged build', () => {
  const root = path.join(__dirname, '..');
  const main = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');
  const source = fs.readFileSync(path.join(root, 'src', 'main', 'ai-hub-read-model.ts'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.match(main, /buildAiHubReadModel, orderedConfigItems, reorderConfigCollection/);
  assert.match(main, /return buildAiHubReadModel\(\{/);
  assert.doesNotMatch(main, /function orderedConfigItems\(/);
  assert.doesNotMatch(main, /function reorderConfigCollection\(/);
  assert.match(source, /export function buildAiHubReadModel/);
  assert.match(source, /export function orderedConfigItems/);
  assert.match(source, /export function reorderConfigCollection/);
  assert.match(pkg.scripts['build:main-modules'], /src\/main\/ai-hub-read-model\.ts/);
  assert.match(pkg.scripts.test, /tests\/main-ai-hub-read-model\.test\.js/);
  assert.match(main, /'src\/main\/ai-hub-read-model\.ts'/);
});

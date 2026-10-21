const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createArenaStoreRuntime } = require('../build/main/arena-store-runtime.js');

function createHarness({ initialFile, wipeAccountData, setBrowserModels } = {}) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'madstation-arena-store-'));
  const file = path.join(folder, 'arena-accounts.json');
  if (initialFile !== undefined) fs.writeFileSync(file, initialFile, 'utf8');
  let id = 0;
  const wiped = [];
  const selected = [];
  const runtime = createArenaStoreRuntime({
    getFilePath: () => file,
    fs,
    defaultProviders: [
      { id: 'provider-a', name: 'Provider A', url: 'https://a.example', icon: 'a.png' },
      { id: 'provider-b', name: 'Provider B', url: 'https://b.example', icon: 'b.png' },
    ],
    cleanId(value) { return typeof value === 'string' ? value.trim().replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 100) : ''; },
    cleanText(value, max = 120) { return String(value ?? '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, max); },
    normalizeHttpsUrl(value) { try { const u = new URL(String(value || '')); return u.protocol === 'https:' && !u.username && !u.password ? u.toString().replace(/\/$/, '') : null; } catch { return null; } },
    sanitizeIcon(value) { return typeof value === 'string' && value.length < 100 ? value.trim() : ''; },
    faviconForUrl(value) { return `favicon:${new URL(value).hostname}`; },
    randomId: () => `id${++id}`,
    isPlainObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); },
    iconCandidatesFor: (provider, preferred) => [preferred || provider.icon],
    wipeAccountData: async (account) => { wiped.push(account.id); if (wipeAccountData) await wipeAccountData(account); },
    setBrowserModels: async (models) => { selected.push(models); if (setBrowserModels) await setBrowserModels(models); },
    now: () => 1234,
  });
  return { runtime, folder, file, wiped, selected, cleanup: () => fs.rmSync(folder, { recursive: true, force: true }) };
}

test('default Arena store has independent provider accounts and distinct left/right selection', () => {
  const h = createHarness();
  try {
    const state = h.runtime.stateForRenderer();
    assert.equal(state.providers.length, 2);
    assert.equal(state.accounts.length, 2);
    assert.ok(state.selected.left);
    assert.ok(state.selected.right);
    assert.notEqual(state.selected.left, state.selected.right);
    assert.ok(state.accounts[0].iconCandidates.length);
    assert.equal(fs.existsSync(h.file), true);
  } finally { h.cleanup(); }
});

test('stored Arena data is normalized, HTTPS-only, de-duplicated, and selection is repaired', () => {
  const input = JSON.stringify({
    providers: [
      { id: 'p1', name: 'Safe', url: 'https://safe.example', icon: '' },
      { id: 'p1', name: 'Duplicate', url: 'https://dup.example' },
      { id: 'bad', name: 'Bad', url: 'http://insecure.example' },
    ],
    accounts: [
      { id: 'a1', providerId: 'p1', name: 'A1', url: 'javascript:alert(1)' },
      { id: 'a1', providerId: 'p1', name: 'Duplicate', url: 'https://safe.example' },
      { id: 'orphan', providerId: 'missing', name: 'Orphan', url: 'https://safe.example' },
    ],
    selected: { left: 'missing', right: 'missing' },
  });
  const h = createHarness({ initialFile: input });
  try {
    const state = h.runtime.stateForRenderer();
    assert.deepEqual(state.providers.map((provider) => provider.id), ['p1']);
    assert.deepEqual(state.accounts.map((account) => account.id), ['a1']);
    assert.equal(state.accounts[0].url, 'https://safe.example');
    assert.equal(state.selected.left, 'a1');
    assert.equal(state.selected.right, null);
  } finally { h.cleanup(); }
});

test('provider and account creation validates input and generates unique account names', () => {
  const h = createHarness();
  try {
    assert.equal(h.runtime.addProvider({ name: 'Bad', url: 'http://bad.example' }).ok, false);
    assert.equal(h.runtime.addProvider({ name: 'Provider A', url: 'https://dup.example' }).ok, false);
    const addedProvider = h.runtime.addProvider({ name: 'Custom', url: 'https://custom.example' });
    assert.equal(addedProvider.ok, true);
    const providerId = addedProvider.provider.id;
    const first = h.runtime.addAccount({ providerId, name: 'Test' });
    const second = h.runtime.addAccount({ providerId, name: 'Test' });
    assert.equal(first.account.name, 'Test');
    assert.equal(second.account.name, 'Test 2');
    assert.equal(h.runtime.addAccount({ providerId: 'missing' }).ok, false);
  } finally { h.cleanup(); }
});

test('rename requires a valid account and non-empty name then persists normalized unique names', () => {
  const h = createHarness();
  try {
    const account = h.runtime.loadStore().accounts[0];
    assert.equal(h.runtime.renameAccount('missing', 'Name').ok, false);
    assert.equal(h.runtime.renameAccount(account.id, '  ').ok, false);
    const renamed = h.runtime.renameAccount(account.id, 'New Name');
    assert.equal(renamed.ok, true);
    assert.equal(h.runtime.getAccount(account.id).name, 'New Name');
    assert.equal(JSON.parse(fs.readFileSync(h.file, 'utf8')).accounts[0].name, 'New Name');
  } finally { h.cleanup(); }
});

test('delete account closes its data before selection is saved and synchronized', async () => {
  const h = createHarness();
  try {
    const account = h.runtime.loadStore().accounts[0];
    const result = await h.runtime.deleteAccount(account.id);
    assert.equal(result.ok, true);
    assert.deepEqual(h.wiped, [account.id]);
    assert.equal(h.runtime.getAccount(account.id), null);
    assert.equal(h.selected.length, 1);
    assert.deepEqual(h.selected[0], result.selected);
    assert.notEqual(result.selected.left, result.selected.right);
  } finally { h.cleanup(); }
});

test('provider delete wipes each linked account before removing provider/accounts', async () => {
  const h = createHarness();
  try {
    const store = h.runtime.loadStore();
    const provider = store.providers[0];
    const owned = store.accounts.filter((account) => account.providerId === provider.id).map((account) => account.id);
    const result = await h.runtime.deleteProvider(provider.id);
    assert.equal(result.ok, true);
    assert.deepEqual(h.wiped, owned);
    assert.equal(h.runtime.getProvider(provider.id), null);
    assert.equal(h.runtime.loadStore().accounts.some((account) => account.providerId === provider.id), false);
    assert.equal(h.selected.length, 1);
  } finally { h.cleanup(); }
});

test('reset login wipes account data but preserves the saved account and selected model pair', async () => {
  const h = createHarness();
  try {
    const store = h.runtime.loadStore();
    const account = store.accounts[0];
    const result = await h.runtime.resetLogin(account.id);
    assert.deepEqual(result, { ok: true });
    assert.deepEqual(h.wiped, [account.id]);
    assert.ok(h.runtime.getAccount(account.id));
    assert.deepEqual(h.selected[0], store.selected);
  } finally { h.cleanup(); }
});

test('source wiring delegates Arena persistence and account mutation to the typed runtime', () => {
  const root = path.join(__dirname, '..');
  const main = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.match(main, /createArenaStoreRuntime/);
  assert.match(main, /arenaStoreRuntime\.deleteAccount\(id\)/);
  assert.match(main, /arenaStoreRuntime\.deleteProvider\(id\)/);
  assert.match(pkg.scripts['build:main-modules'], /src\/main\/arena-store-runtime\.ts/);
  assert.match(pkg.scripts.test, /tests\/main-arena-store-runtime\.test\.js/);
});

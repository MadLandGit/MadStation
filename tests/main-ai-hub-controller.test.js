const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createAiHubController } = require('../build/main/ai-hub-controller.js');
const { cleanText, normalizeHttpsUrl, sanitizeIcon, faviconForUrl } = require('../build/main/input-validation.js');

function normalizeShortcut(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const parts = raw.split('+').map((part) => part.trim()).filter(Boolean);
  const mods = [];
  let key = '';
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower === 'ctrl' || lower === 'control' || lower === 'cmd' || lower === 'command') mods.push('Ctrl');
    else if (lower === 'alt' || lower === 'option') mods.push('Alt');
    else if (lower === 'shift') mods.push('Shift');
    else key = part.length === 1 ? part.toUpperCase() : part;
  }
  return key ? [...new Set(mods), key].join('+') : '';
}

function normalizeProviderMetadata(value) {
  return {
    ...value,
    category: cleanText(value.category, 60),
    description: cleanText(value.description, 240),
    homepageUrl: normalizeHttpsUrl(value.homepageUrl || value.url) || value.url,
    loginUrl: normalizeHttpsUrl(value.loginUrl || '') || '',
    notes: cleanText(value.notes, 500),
    authDomains: [...new Set((Array.isArray(value.authDomains) ? value.authDomains : [])
      .map((entry) => String(entry || '').trim().toLowerCase())
      .filter((entry) => /^[a-z0-9.-]+$/.test(entry)).slice(0, 20))],
  };
}

function normalizeAccountPreferences(value) {
  const raw = value.preferences && typeof value.preferences === 'object' && !Array.isArray(value.preferences) ? value.preferences : {};
  const tags = Array.isArray(value.tags) ? value.tags : String(value.tags || '').split(',');
  return {
    favorite: Boolean(value.favorite),
    group: cleanText(value.group, 60),
    tags: [...new Set(tags.map((entry) => cleanText(entry, 32)).filter(Boolean).slice(0, 12))],
    pageZoom: [75, 80, 90, 100, 110, 125, 150].includes(Number(raw.pageZoom)) ? Number(raw.pageZoom) : 100,
    openOnStartup: Boolean(raw.openOnStartup),
    clearCacheOnExit: typeof raw.clearCacheOnExit === 'boolean' ? raw.clearCacheOnExit : null,
    signOutOnExit: typeof raw.signOutOnExit === 'boolean' ? raw.signOutOnExit : null,
    permissions: {},
  };
}

function makeHarness() {
  const config = {
    services: [{ id: 'openai', name: 'OpenAI', url: 'https://chatgpt.com/', icon: 'https://chatgpt.com/favicon.ico', category: '', description: '', homepageUrl: 'https://chatgpt.com/', loginUrl: '', notes: '', authDomains: [] },
      { id: 'claude', name: 'Claude', url: 'https://claude.ai/', icon: 'https://claude.ai/favicon.ico', category: '', description: '', homepageUrl: 'https://claude.ai/', loginUrl: '', notes: '', authDomains: [] }],
    accounts: [{ id: 'openai-1', serviceId: 'openai', name: 'OpenAI 1', url: 'https://chatgpt.com/', icon: '', shortcut: 'Ctrl+1', favorite: true, group: '', tags: [], temporary: false, preferences: {} }],
    serviceOrder: ['openai', 'claude'],
    accountOrder: ['openai-1'],
    activeId: 'openai-1',
  };
  let nextId = 0;
  const deps = {
    getConfig: () => config,
    getService: (id) => config.services.find((service) => service.id === id) || null,
    getAccount: (id) => config.accounts.find((account) => account.id === id) || null,
    cleanText,
    normalizeHttpsUrl,
    sanitizeIcon,
    faviconForUrl,
    normalizeShortcut,
    normalizeProviderMetadata,
    normalizeAccountPreferences,
    randomId: () => `test-${++nextId}`,
  };
  return { config, controller: createAiHubController(deps) };
}

test('AI Hub provider creation validates HTTPS, normalizes metadata, and appends provider order', () => {
  const { config, controller } = makeHarness();
  assert.deepEqual(controller.addService({ name: 'No TLS', url: 'http://insecure.example' }), {
    ok: false, error: 'Provider name and an HTTPS website URL are required.',
  });
  const added = controller.addService({ name: 'New AI', url: 'https://new.example/path', authDomains: ['NEW.EXAMPLE', 'bad host'] });
  assert.equal(added.ok, true);
  assert.equal(added.service.name, 'New AI');
  assert.deepEqual(added.service.authDomains, ['new.example']);
  assert.deepEqual(config.serviceOrder, ['openai', 'claude', added.service.id]);
  assert.equal(controller.addService({ name: 'new ai', url: 'https://duplicate.example' }).error, 'A provider with that name already exists.');
});

test('AI Hub provider updates reject duplicates and preserve existing account icons while filling missing icons', () => {
  const { config, controller } = makeHarness();
  config.accounts.push({ id: 'openai-2', serviceId: 'openai', name: 'Custom icon', url: 'https://chatgpt.com/', icon: 'data:image/png;base64,AAAA', shortcut: '', favorite: false, group: '', tags: [], preferences: {} });
  assert.deepEqual(controller.updateService('openai', { name: 'Claude', url: 'https://changed.example' }), {
    ok: false, error: 'Another provider already uses that name.',
  });
  const result = controller.updateService('openai', { name: 'OpenAI Updated', url: 'https://changed.example', icon: '' });
  assert.deepEqual(result, { ok: true });
  assert.equal(config.services[0].url, 'https://changed.example/');
  assert.equal(config.accounts[0].icon, 'https://changed.example/favicon.ico');
  assert.equal(config.accounts[1].icon, 'data:image/png;base64,AAAA');
});

test('AI Hub account creation supports compatibility-created providers and rejects duplicate shortcuts', () => {
  const { config, controller } = makeHarness();
  assert.equal(controller.addAccount({ name: 'Bad', serviceId: 'missing', url: 'https://valid.example' }).error,
    'Account name, provider, and an HTTPS URL are required.');
  const added = controller.addAccount({ name: 'New account', serviceName: 'Legacy provider', url: 'https://legacy.example', shortcut: 'ctrl+2', tags: 'one, two' });
  assert.equal(added.ok, true);
  assert.equal(config.services.at(-1).name, 'Legacy provider');
  assert.equal(config.serviceOrder.at(-1), config.services.at(-1).id);
  assert.equal(added.account.shortcut, 'Ctrl+2');
  assert.deepEqual(added.account.tags, ['one', 'two']);
  assert.deepEqual(config.accountOrder, ['openai-1', added.account.id]);
  assert.equal(controller.addAccount({ name: 'Collision', serviceId: 'openai', url: 'https://chatgpt.com/', shortcut: 'CTRL+1' }).error,
    'Shortcut Ctrl+1 is already assigned.');
});

test('AI Hub account updates prepare the patch before session teardown and apply only when requested', () => {
  const { config, controller } = makeHarness();
  const original = { ...config.accounts[0] };
  const plan = controller.prepareUpdateAccount('openai-1', {
    name: 'Renamed', serviceId: 'claude', url: 'https://claude.ai/new', shortcut: 'ctrl+8',
    favorite: true, group: 'Work', tags: 'important, planning', preferences: { pageZoom: 110 },
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.sessionChanged, true);
  assert.deepEqual(config.accounts[0], original, 'preparation must not mutate persisted state before the host tears down the live view');
  assert.equal(plan.patch.name, 'Renamed');
  assert.equal(plan.patch.serviceId, 'claude');
  assert.equal(plan.patch.preferences.pageZoom, 110);
  const account = controller.applyUpdateAccount(plan);
  assert.equal(account.name, 'Renamed');
  assert.equal(account.serviceId, 'claude');
  assert.deepEqual(account.tags, ['important', 'planning']);
  assert.equal(controller.prepareUpdateAccount('missing', {}).error, 'Account not found.');
  assert.equal(controller.prepareUpdateAccount('openai-1', { name: '', serviceId: 'claude', url: 'https://claude.ai/' }).error,
    'Account name, provider, and an HTTPS URL are required.');
});

test('AI Hub rename and shortcut transitions keep established validation/error contracts', () => {
  const { config, controller } = makeHarness();
  assert.deepEqual(controller.renameAccount('missing', 'New'), { ok: false, error: 'A name is required.' });
  assert.deepEqual(controller.renameAccount('openai-1', '   '), { ok: false, error: 'A name is required.' });
  assert.deepEqual(controller.renameAccount('openai-1', 'Updated'), { ok: true });
  assert.equal(config.accounts[0].name, 'Updated');
  assert.deepEqual(controller.setAccountShortcut('missing', 'Ctrl+4'), { ok: false, error: 'Account not found.' });
  assert.deepEqual(controller.setAccountShortcut('openai-1', 'Ctrl+1'), { ok: true });
  const second = controller.addAccount({ name: 'Second', serviceId: 'claude', url: 'https://claude.ai/' }).account;
  assert.deepEqual(controller.setAccountShortcut(second.id, 'Ctrl+1'), {
    ok: false, error: 'Shortcut Ctrl+1 is already assigned to another account.',
  });
});

test('AI Hub controller is wired into main, included in build and developer source allowlist', () => {
  const root = path.join(__dirname, '..');
  const main = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');
  const source = fs.readFileSync(path.join(root, 'src', 'main', 'ai-hub-controller.ts'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.match(main, /require\('\.\.\/build\/main\/ai-hub-controller\.js'\)/);
  assert.match(main, /const aiHubController = createAiHubController/);
  assert.match(main, /aiHubController\.prepareUpdateAccount\(id, payload\)/);
  assert.match(main, /aiHubController\.applyUpdateAccount\(plan\)/);
  assert.match(main, /aiHubController\.setAccountShortcut\(id, shortcut\)/);
  assert.match(pkg.scripts['build:main-modules'], /src\/main\/ai-hub-controller\.ts/);
  assert.match(pkg.scripts.test, /tests\/main-ai-hub-controller\.test\.js/);
  const resources = pkg.build.extraResources.find((item) => item.from === 'src');
  assert.ok(resources.filter.includes('main/ai-hub-controller.ts'));
  assert.match(main, /'src\/main\/ai-hub-controller\.ts'/);
  assert.match(source, /export function createAiHubController/);
});

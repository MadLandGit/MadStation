const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createVideoHubStoreController, VIDEO_HUB_DEFAULT_PROVIDERS } = require('../build/main/video-hub-controller.js');
const { cleanId, cleanText, normalizeHttpsUrl, sanitizeIcon, faviconForUrl } = require('../build/main/input-validation.js');

function makeHarness() {
  let store;
  let saves = 0;
  let saveResult = true;
  let activeAccountId = null;
  let nextId = 0;
  const controller = createVideoHubStoreController({
    getStore: () => store,
    saveStore: () => { saves += 1; return saveResult; },
    randomId: () => `test-${++nextId}`,
    cleanId,
    cleanText,
    normalizeHttpsUrl,
    sanitizeIcon,
    faviconForUrl,
    setActiveAccountId: (id) => { activeAccountId = id; },
  });
  store = controller.defaultStore();
  return {
    controller,
    getStore: () => store,
    getSaves: () => saves,
    setSaveResult: (value) => { saveResult = value; },
    getActiveAccountId: () => activeAccountId,
  };
}

test('Video Hub defaults and legacy-store normalization preserve custom data and merge built-ins', () => {
  const harness = makeHarness();
  const defaults = harness.controller.defaultStore();
  assert.equal(defaults.version, 1);
  assert.equal(defaults.providers.length, VIDEO_HUB_DEFAULT_PROVIDERS.length);
  assert.ok(defaults.providers.every((provider) => provider.builtin && provider.icon.startsWith('https://')));

  const normalized = harness.controller.sanitizeStore({
    providers: [
      { id: 'custom-site', name: 'My Site', url: 'https://video.example/path', note: 'custom', authDomains: ['VIDEO.EXAMPLE', 'invalid host', 'a.example'], icon: 'javascript:bad', builtin: false },
      { id: 'custom-site', name: 'Duplicate', url: 'https://duplicate.example/' },
      { id: 'bad url', name: 'Bad', url: 'http://not-secure.example/' },
    ],
    accounts: [
      { id: 'vh-custom', providerId: 'custom-site', name: 'My account', url: 'http://unsafe.example/', icon: 'javascript:bad' },
      { id: 'vh-custom', providerId: 'custom-site', name: 'Duplicate account' },
      { id: 'vh-orphan', providerId: 'missing-provider', name: 'Orphan' },
    ],
    activeAccountId: 'vh-custom',
  });

  assert.equal(normalized.providers.filter((provider) => provider.id === 'custom-site').length, 1);
  assert.equal(normalized.providers.length, VIDEO_HUB_DEFAULT_PROVIDERS.length + 1);
  const custom = normalized.providers.find((provider) => provider.id === 'custom-site');
  assert.deepEqual(custom.authDomains, ['video.example']);
  assert.ok(custom.icon.startsWith('https://www.google.com/s2/favicons'));
  assert.equal(normalized.accounts.length, 1);
  assert.equal(normalized.accounts[0].url, 'https://video.example/path');
  assert.equal(normalized.accounts[0].icon, custom.icon);
  assert.equal(normalized.activeAccountId, 'vh-custom');
});

test('Video Hub provider creation validates HTTPS, rejects duplicate names, and returns renderer-safe state', () => {
  const harness = makeHarness();
  assert.deepEqual(harness.controller.addProvider({ name: 'Insecure', url: 'http://example.com' }), {
    ok: false, error: 'Enter a site name and a valid HTTPS website URL.',
  });
  assert.deepEqual(harness.controller.addProvider({ name: '   ', url: 'https://example.com' }), {
    ok: false, error: 'Enter a site name and a valid HTTPS website URL.',
  });

  const first = harness.controller.addProvider({ name: 'Studio', url: 'https://video.example/path', icon: 'javascript:bad' });
  assert.equal(first.ok, true);
  assert.equal(first.provider.name, 'Studio');
  assert.equal(first.provider.url, 'https://video.example/path');
  assert.equal(first.provider.note, 'Custom site');
  assert.deepEqual(harness.getStore().providers.at(-1).authDomains, ['video.example']);
  assert.ok(first.provider.icon.startsWith('https://www.google.com/s2/favicons'));
  assert.equal(first.providers.find((provider) => provider.id === first.provider.id).name, 'Studio');
  assert.deepEqual(harness.controller.addProvider({ name: 'studio', url: 'https://other.example' }), {
    ok: false, error: 'A video site with that name already exists.',
  });
  assert.equal(harness.getSaves(), 1);
});

test('Video Hub account transitions enforce provider ownership, uniqueness and active-account preservation', () => {
  const harness = makeHarness();
  assert.deepEqual(harness.controller.addAccount({ providerId: 'missing' }), {
    ok: false, error: 'Choose a video generator first.',
  });

  const provider = harness.controller.addProvider({ name: 'Studio', url: 'https://studio.example/' }).provider;
  const first = harness.controller.addAccount({ providerId: provider.id, name: '  Workspace  ' });
  assert.equal(first.ok, true);
  assert.equal(first.account.name, 'Workspace');
  assert.equal(first.account.url, provider.url);
  assert.equal(first.activeAccountId, first.account.id);
  assert.equal(harness.getActiveAccountId(), first.account.id);

  const second = harness.controller.addAccount({ providerId: provider.id, name: 'workspace' });
  assert.equal(second.account.name, 'workspace 2');
  assert.equal(second.activeAccountId, first.account.id);
  assert.equal(harness.getActiveAccountId(), first.account.id);
  assert.equal(second.accounts.find((account) => account.id === second.account.id).providerName, 'Studio');

  assert.deepEqual(harness.controller.renameAccount('missing', 'Renamed'), {
    ok: false, error: 'Video Hub account not found.',
  });
  assert.deepEqual(harness.controller.renameAccount(first.account.id, '  '), {
    ok: false, error: 'Enter an account label.',
  });
  const renamed = harness.controller.renameAccount(first.account.id, 'WORKSPACE 2');
  assert.equal(renamed.ok, true);
  assert.equal(renamed.accounts.find((account) => account.id === first.account.id).name, 'WORKSPACE 2 2');
});

test('Video Hub store mutations preserve established success contract when persistence reports failure', () => {
  const harness = makeHarness();
  harness.setSaveResult(false);
  const result = harness.controller.addProvider({ name: 'Offline save', url: 'https://offline.example' });
  assert.equal(result.ok, true);
  assert.ok(harness.getStore().providers.some((provider) => provider.name === 'Offline save'));
  assert.equal(harness.getSaves(), 1);
});

test('Video Hub controller is wired into main, compiled, and included in packaged developer source', () => {
  const root = path.join(__dirname, '..');
  const main = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');
  const source = fs.readFileSync(path.join(root, 'src', 'main', 'video-hub-controller.ts'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.match(main, /require\('\.\.\/build\/main\/video-hub-controller\.js'\)/);
  assert.match(main, /videoHubStoreController\.sanitizeStore\(raw\)/);
  assert.match(main, /function videoHubAddProvider\(payload\) \{ return videoHubStoreController\.addProvider\(payload\); \}/);
  assert.match(main, /function videoHubAddAccount\(payload\) \{ return videoHubStoreController\.addAccount\(payload\); \}/);
  assert.match(main, /function videoHubRenameAccount\(id, name\) \{ return videoHubStoreController\.renameAccount\(id, name\); \}/);
  assert.match(pkg.scripts['build:main-modules'], /src\/main\/video-hub-controller\.ts/);
  assert.match(pkg.scripts.test, /tests\/main-video-hub-controller\.test\.js/);
  const resources = pkg.build.extraResources.find((item) => item.from === 'src');
  assert.ok(resources.filter.includes('main/video-hub-controller.ts'));
  assert.match(main, /'src\/main\/video-hub-controller\.ts'/);
  assert.match(source, /export function createVideoHubStoreController/);
});

test('Video Hub auth allowlists use PSL validation and preserve only reviewed built-in cross-domain roots', () => {
  const harness = makeHarness();
  const normalized = harness.controller.sanitizeStore({ providers: [
    { id: 'kling', name: 'Kling', url: 'https://kling.ai/', authDomains: ['kling.ai', 'klingai.com', 'login.attacker.co.uk', 'github.io', 'co.uk'] },
    { id: 'custom-site', name: 'Custom', url: 'https://studio.example/', authDomains: ['studio.example', 'github.io', 'evil.com'] },
  ] });
  assert.deepEqual(normalized.providers.find((provider) => provider.id === 'kling').authDomains, ['kling.ai', 'klingai.com']);
  assert.deepEqual(normalized.providers.find((provider) => provider.id === 'custom-site').authDomains, ['studio.example']);
});

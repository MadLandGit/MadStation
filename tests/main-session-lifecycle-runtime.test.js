const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  createSessionLifecycleRuntime,
  clearSessionDataRuntime,
} = require('../build/main/session-lifecycle-runtime.js');

function harness(overrides = {}) {
  const calls = [];
  const sessions = new Map();
  const configurationCounts = new Map();
  const sessionFor = (partition) => {
    if (!sessions.has(partition)) {
      sessions.set(partition, {
        partition,
        async clearStorageData(options) { calls.push(['clearStorageData', partition, options]); },
        async clearCache() { calls.push(['clearCache', partition]); },
        async clearCodeCaches(options) { calls.push(['clearCodeCaches', partition, options]); },
      });
    }
    return sessions.get(partition);
  };
  const dependencies = {
    fromPartition: (partition, options) => { calls.push(['fromPartition', partition, options]); return sessionFor(partition); },
    cacheEnabled: () => false,
    configureSession: (session, account) => {
      calls.push(['configure', session.partition, account.id]);
      configurationCounts.set(session.partition, (configurationCounts.get(session.partition) || 0) + 1);
    },
    getVideoHubNetworkMode: () => 'system',
    applyVideoHubProxy: async (session, mode) => { calls.push(['proxy', session.partition, mode]); },
    onVideoHubProxyFailure: (account, error) => calls.push(['proxyFailure', account.id, error.message]),
    ...overrides,
  };
  return { calls, sessions, configurationCounts, runtime: createSessionLifecycleRuntime(dependencies) };
}

test('session runtime gives each workspace an isolated persistent partition and applies cache settings', () => {
  const h = harness();
  const account = { id: 'acct-a' };
  const aiHub = h.runtime.getAccountSession(account);
  const arena = h.runtime.getArenaSession(account);
  const video = h.runtime.getVideoHubSession(account);
  const image = h.runtime.getImageHubSession(account);
  assert.equal(aiHub.partition, 'persist:aihub-acct-a');
  assert.equal(arena.partition, 'persist:arena-acct-a');
  assert.equal(video.partition, 'persist:video-hub-acct-a');
  assert.equal(image.partition, 'persist:image-hub-acct-a');
  assert.notEqual(aiHub, arena);
  assert.notEqual(arena, video);
  assert.notEqual(video, image);
  assert.ok(h.calls.filter((call) => call[0] === 'fromPartition').every((call) => call[2].cache === false));
});

test('account and Arena sessions are configured once per native Session instance', () => {
  const h = harness();
  const account = { id: 'acct-b' };
  assert.equal(h.runtime.getAccountSession(account), h.runtime.getAccountSession(account));
  assert.equal(h.runtime.getArenaSession(account), h.runtime.getArenaSession(account));
  assert.equal(h.configurationCounts.get('persist:aihub-acct-b'), 1);
  assert.equal(h.configurationCounts.get('persist:arena-acct-b'), 1);
});

test('Image Hub gets an isolated persistent partition without Video Hub proxy setup', () => {
  const h = harness();
  const account = { id: 'image-e' };
  const a = h.runtime.getImageHubSession(account);
  const b = h.runtime.getImageHubSession(account);
  assert.equal(a, b);
  assert.equal(a.partition, 'persist:image-hub-image-e');
  assert.equal(h.configurationCounts.get(a.partition), 1);
  assert.equal(h.calls.filter((call) => call[0] === 'proxy' && call[1] === a.partition).length, 0);
});

test('Video Hub proxy initialization is single-flight and exposes a fulfilled readiness result', async () => {
  const h = harness();
  const account = { id: 'video-c' };
  const a = h.runtime.getVideoHubSession(account);
  const b = h.runtime.getVideoHubSession(account);
  assert.equal(a, b);
  const ready = await h.runtime.getVideoHubReadiness(a);
  assert.deepEqual(ready, { ok: true });
  assert.equal(h.calls.filter((call) => call[0] === 'configure' && call[1] === a.partition).length, 1);
  assert.equal(h.calls.filter((call) => call[0] === 'proxy' && call[1] === a.partition).length, 1);
});

test('Video Hub proxy failure resolves readiness without an unhandled rejection', async () => {
  const expected = new Error('proxy denied');
  const h = harness({ applyVideoHubProxy: async () => { throw expected; } });
  const account = { id: 'video-d' };
  const sess = h.runtime.getVideoHubSession(account);
  const ready = await h.runtime.getVideoHubReadiness(sess);
  assert.equal(ready.ok, false);
  assert.equal(ready.error, expected);
  assert.ok(h.calls.some((call) => call[0] === 'proxyFailure' && call[1] === account.id && call[2] === expected.message));
});

test('session configuration failures are not cached and can be retried', () => {
  let attempts = 0;
  const h = harness({ configureSession: () => { attempts += 1; if (attempts === 1) throw new Error('temporary'); } });
  const account = { id: 'retry-e' };
  assert.throws(() => h.runtime.getAccountSession(account), /temporary/);
  assert.equal(h.runtime.getAccountSession(account).partition, 'persist:aihub-retry-e');
  assert.equal(attempts, 2);
});

test('full session clearing preserves storage-before-cache ordering', async () => {
  const calls = [];
  const session = {
    async clearStorageData(options) { calls.push(['storage', options]); },
    async clearCache() { calls.push(['cache']); },
  };
  await clearSessionDataRuntime(session, 'all');
  assert.deepEqual(calls, [['storage', undefined], ['cache']]);
});

test('application-cache cleanup clears cache first and tolerates optional code-cache failures', async () => {
  const calls = [];
  const session = {
    async clearStorageData(options) { calls.push(['storage', options]); },
    async clearCache() { calls.push(['cache']); },
    async clearCodeCaches(options) { calls.push(['code', options]); throw new Error('optional code cache'); },
  };
  await clearSessionDataRuntime(session, 'application-cache');
  assert.deepEqual(calls, [
    ['cache'],
    ['code', {}],
    ['storage', { storages: ['cachestorage', 'serviceworkers', 'shadercache'] }],
  ]);
});

test('session lifecycle is wired through main, build, test, and developer source allowlist', () => {
  const root = path.join(__dirname, '..');
  const main = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.match(main, /function sessionFor\(account\) \{ return sessionLifecycleRuntime\.getAccountSession\(account\); \}/);
  assert.match(main, /function arenaSessionFor\(account\) \{\s*return sessionLifecycleRuntime\.getArenaSession\(account\);/);
  assert.match(main, /function videoHubSessionFor\(account\) \{\s*return sessionLifecycleRuntime\.getVideoHubSession\(account\);/);
  assert.match(main, /getImageHubSession\(runtimeAccount\)/);
  assert.match(pkg.scripts['build:main-modules'], /src\/main\/image-hub-browser-runtime\.ts/);
  assert.match(main, /'src\/main\/image-hub-browser-runtime\.ts'/);
  assert.match(pkg.scripts['build:main-modules'], /src\/main\/session-lifecycle-runtime\.ts/);
  assert.match(pkg.scripts.test, /tests\/main-session-lifecycle-runtime\.test\.js/);
  assert.match(main, /'src\/main\/session-lifecycle-runtime\.ts'/);
  assert.match(JSON.stringify(pkg.build.extraResources), /main\/session-lifecycle-runtime\.ts/);
});

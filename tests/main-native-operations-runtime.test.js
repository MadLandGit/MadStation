const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { createNativeOperationsRuntime, parseStableVersion, compareStableVersions } = require('../build/main/native-operations-runtime.js');

function normalizeHttpsUrl(value) {
  try { const parsed = new URL(String(value || '').trim()); return parsed.protocol === 'https:' ? parsed.href : null; } catch { return null; }
}
function harness(overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'madstation-native-ops-'));
  const icons = path.join(root, 'icons');
  const userData = path.join(root, 'user-data');
  const opened = [];
  const shown = [];
  const requests = [];
  const cache = { async cache(url) { requests.push(['cache', url]); return 'cached-icon'; }, clear() { requests.push(['clear']); } };
  const dependencies = {
    path, fs,
    getDeveloperRoot: () => root,
    developerFiles: new Set(['README.md', 'src/main.js']),
    showInFolder: (file) => shown.push(file),
    openPath: async (file) => { opened.push(file); return ''; },
    getUserDataPath: () => userData,
    getIconFolderPath: () => icons,
    chooseIconFile: async () => ({ canceled: true, filePaths: [] }),
    maxIconBytes: 512 * 1024,
    sanitizeIcon: (value) => String(value || '').trim(),
    getRemoteIconCache: () => cache,
    clearLocalIconCache: () => requests.push(['clear-local']),
    pushConfig: () => requests.push(['push-config']),
    warmRemoteIconsAndPush: () => requests.push(['warm-icons']),
    resolvePublicHost: async (hostname) => { requests.push(['resolve', hostname]); return [{ address: '93.184.216.34', family: 4 }]; },
    fetchReleaseFeed: async (url, addresses) => ({ ok: true, status: 200, async json() { requests.push(['feed-json', url, addresses]); return { version: '2.0.0', url: 'https://example.test/release' }; } }),
    getReleaseFeedUrl: () => 'https://example.test/feed.json',
    getCurrentVersion: () => '1.2.0',
    normalizeHttpsUrl,
    createHeadRequest: (_url, addresses) => {
      const emitter = new EventEmitter();
      emitter.setTimeout = (_ms, cb) => { emitter.timeoutCallback = cb; };
      emitter.abort = () => requests.push(['abort']);
      emitter.end = () => { requests.push(['head-end']); if (overrides.headError) emitter.emit('error', new Error('unreachable')); else if (!overrides.headTimeout) emitter.emit('response', { statusCode: 204, statusMessage: 'No Content' }); };
      requests.push(['head-created', addresses]);
      return emitter;
    },
    ...overrides,
  };
  return { runtime: createNativeOperationsRuntime(dependencies), root, icons, userData, opened, shown, requests, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

test('stable version parser compares semantic triples and rejects prerelease or malformed values', () => {
  assert.deepEqual(parseStableVersion(' 1.20.3 '), [1, 20, 3]);
  assert.equal(parseStableVersion('1.2'), null);
  assert.equal(parseStableVersion('1.2.3-beta'), null);
  assert.equal(compareStableVersions('1.9.0', '1.10.0'), -1);
  assert.equal(compareStableVersions('2.0.0', '2.0.0'), 0);
  assert.equal(compareStableVersions('latest', '2.0.0'), null);
});

test('developer files require exact allowlist paths and stay inside the source root', async () => {
  const h = harness();
  try {
    fs.mkdirSync(path.join(h.root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(h.root, 'README.md'), 'ok');
    fs.writeFileSync(path.join(h.root, 'src/main.js'), 'ok');
    assert.equal((await h.runtime.openDeveloperFile('README.md')).ok, true);
    assert.equal((await h.runtime.showDeveloperFileLocation('README.md')).ok, true);
    assert.equal((await h.runtime.openDeveloperFile('../secret.txt')).ok, false);
    assert.equal((await h.runtime.openDeveloperFile(path.join(h.root, 'README.md'))).ok, false);
    assert.equal((await h.runtime.openDeveloperFile('src/unknown.js')).ok, false);
    assert.equal(h.opened.length, 1);
    assert.equal(h.shown.length, 1);
  } finally { h.cleanup(); }
});

test('data and icon folders open via injected shell and icon directory is created', async () => {
  const h = harness();
  try {
    assert.equal((await h.runtime.openDataFolder()).ok, true);
    assert.equal((await h.runtime.openIconFolder()).ok, true);
    assert.equal(fs.existsSync(h.icons), true);
    assert.deepEqual(h.opened, [h.userData, h.icons]);
  } finally { h.cleanup(); }
});

test('refreshing icons clears local and remote caches then pushes config and warms icons', () => {
  const h = harness();
  try {
    assert.deepEqual(h.runtime.refreshIcons(), { ok: true });
    assert.deepEqual(h.requests, [['clear-local'], ['clear'], ['push-config'], ['warm-icons']]);
  } finally { h.cleanup(); }
});

test('only HTTPS remote icons can be cached', async () => {
  const h = harness();
  try {
    assert.equal((await h.runtime.cacheIcon('http://example.test/icon.png')).ok, false);
    assert.deepEqual(await h.runtime.cacheIcon('https://example.test/icon.png'), { ok: true, icon: 'cached-icon' });
    assert.deepEqual(h.requests.filter((call) => call[0] === 'cache'), [['cache', 'https://example.test/icon.png']]);
  } finally { h.cleanup(); }
});

test('icon chooser caps file size and returns data URI for allowed file types', async () => {
  const h = harness({ chooseIconFile: async () => ({ canceled: false, filePaths: [path.join(h.root, 'icon.jpg')] }) });
  try {
    fs.writeFileSync(path.join(h.root, 'icon.jpg'), Buffer.from([1, 2, 3]));
    const result = await h.runtime.chooseIcon();
    assert.deepEqual(result, { ok: true, icon: 'data:image/jpeg;base64,AQID', name: 'icon.jpg' });
  } finally { h.cleanup(); }
});

test('oversize icon files are rejected and canceled dialogs do not access a path', async () => {
  const first = harness({ maxIconBytes: 1, chooseIconFile: async () => ({ canceled: false, filePaths: [path.join(first.root, 'big.png')] }) });
  try {
    fs.writeFileSync(path.join(first.root, 'big.png'), Buffer.from([1, 2]));
    assert.equal((await first.runtime.chooseIcon()).ok, false);
  } finally { first.cleanup(); }
  const second = harness();
  try { assert.deepEqual(await second.runtime.chooseIcon(), { ok: false, canceled: true }); }
  finally { second.cleanup(); }
});

test('provider verification rejects non-HTTPS URLs and returns HEAD status', async () => {
  const h = harness();
  try {
    assert.equal((await h.runtime.verifyProvider('http://example.test')).ok, false);
    assert.deepEqual(await h.runtime.verifyProvider('https://example.test'), { ok: true, statusCode: 204, statusText: 'No Content', url: 'https://example.test/' });
    assert.ok(h.requests.some((call) => call[0] === 'head-end'));
  } finally { h.cleanup(); }
});

test('provider verification reports network and timeout errors without settling twice', async () => {
  const failed = harness({ headError: true });
  try { assert.deepEqual(await failed.runtime.verifyProvider('https://example.test'), { ok: false, error: 'unreachable' }); }
  finally { failed.cleanup(); }
  let request;
  const timed = harness({ createHeadRequest: () => { const emitter = new EventEmitter(); emitter.setTimeout = (_ms, cb) => { emitter.timeoutCallback = cb; }; emitter.abort = () => {}; emitter.end = () => { request = emitter; emitter.timeoutCallback(); }; return emitter; } });
  try { assert.deepEqual(await timed.runtime.verifyProvider('https://example.test'), { ok: false, error: 'The website did not respond within 10 seconds.' }); }
  finally { timed.cleanup(); }
});

test('provider verification aborts redirects instead of probing a second host', async () => {
  const h = harness({ createHeadRequest: () => {
    const emitter = new EventEmitter();
    emitter.setTimeout = (_ms, cb) => { emitter.timeoutCallback = cb; };
    emitter.abort = () => h.requests.push(['abort-redirect']);
    emitter.end = () => { queueMicrotask(() => emitter.emit('redirect', 302, 'GET', 'https://127.0.0.1/admin', {})); };
    return emitter;
  } });
  try {
    const result = await h.runtime.verifyProvider('https://example.test');
    assert.deepEqual(result, { ok: false, error: 'Provider verification redirects are blocked.' });
    assert.ok(h.requests.some((call) => call[0] === 'abort-redirect'));
  } finally { h.cleanup(); }
});

test('provider verification blocks private or reserved DNS results before opening a socket', async () => {
  let requestCount = 0;
  const h = harness({
    resolvePublicHost: async () => { throw new Error('private address'); },
    createHeadRequest: () => { requestCount += 1; throw new Error('must not request'); },
  });
  try {
    const result = await h.runtime.verifyProvider('https://intranet.example/');
    assert.equal(result.ok, false);
    assert.match(result.error, /public internet hosts/i);
    assert.equal(requestCount, 0);
  } finally { h.cleanup(); }
});

test('provider verification passes the validated addresses to the pinned request and blocks 3xx responses', async () => {
  const h = harness({
    createHeadRequest: (_url, addresses) => {
      assert.deepEqual(addresses, [{ address: '93.184.216.34', family: 4 }]);
      const emitter = new EventEmitter();
      emitter.setTimeout = (_ms, cb) => { emitter.timeoutCallback = cb; };
      emitter.abort = () => {};
      emitter.end = () => emitter.emit('response', { statusCode: 302, statusMessage: 'Found' });
      return emitter;
    },
  });
  try {
    const result = await h.runtime.verifyProvider('https://example.test/');
    assert.equal(result.ok, false);
    assert.match(result.error, /redirects are blocked/i);
  } finally { h.cleanup(); }
});

test('update checking requires HTTPS, parses stable versions, and normalizes the release URL', async () => {
  const h = harness();
  try {
    assert.deepEqual(await h.runtime.checkForUpdates(), { ok: true, current: '1.2.0', latest: '2.0.0', updateAvailable: true, url: 'https://example.test/release' });
  } finally { h.cleanup(); }
  const invalid = harness({ getReleaseFeedUrl: () => 'http://example.test/feed' });
  try { assert.deepEqual(await invalid.runtime.checkForUpdates(), { ok: false, error: 'The release feed must use HTTPS.' }); }
  finally { invalid.cleanup(); }
});

test('update feed rejects embedded credentials and malformed HTTPS URLs before fetching', async () => {
  let fetchCount = 0;
  const h = harness({
    getReleaseFeedUrl: () => 'https://user:pass@example.test/feed.json',
    fetchReleaseFeed: async () => { fetchCount += 1; return { ok: true, status: 200, async json() { return { version: '2.0.0' }; } }; },
  });
  try {
    const result = await h.runtime.checkForUpdates();
    assert.deepEqual(result, { ok: false, error: 'The release feed URL is invalid.' });
    assert.equal(fetchCount, 0);
  } finally { h.cleanup(); }
});

test('missing release feed and invalid feed versions return explicit errors', async () => {
  const missing = harness({ getReleaseFeedUrl: () => '' });
  try { assert.equal((await missing.runtime.checkForUpdates()).configured, false); }
  finally { missing.cleanup(); }
  const bad = harness({ fetchReleaseFeed: async () => ({ ok: true, status: 200, async json() { return { version: '2.0.0-beta' }; } }) });
  try { assert.match((await bad.runtime.checkForUpdates()).error, /stable x.y.z/i); }
  finally { bad.cleanup(); }
});

test('native operations wiring remains in the trusted main process and build allowlist', () => {
  const root = path.join(__dirname, '..');
  const main = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  for (const action of ['showDeveloperFileLocation', 'openDeveloperFile', 'openDataFolder', 'openIconFolder', 'refreshIcons', 'cacheIcon', 'chooseIcon', 'verifyProvider', 'checkForUpdates']) assert.match(main, new RegExp(`nativeOperationsRuntime\\.${action}`));
  assert.match(pkg.scripts['build:main-modules'], /src\/main\/native-operations-runtime\.ts/);
  assert.match(pkg.scripts['build:main-modules'], /src\/main\/network-security\.ts/);
  assert.match(pkg.scripts.test, /tests\/main-native-operations-runtime\.test\.js/);
  assert.match(main, /'src\/main\/native-operations-runtime\.ts'/);
  assert.match(main, /'src\/main\/network-security\.ts'/);
  assert.match(JSON.stringify(pkg.build.extraResources), /main\/native-operations-runtime\.ts/);
  assert.match(JSON.stringify(pkg.build.extraResources), /main\/network-security\.ts/);
});

test('update feed blocks private or reserved DNS answers before fetch', async () => {
  let fetchCount = 0;
  const h = harness({
    resolvePublicHost: async () => { throw new Error('private network'); },
    fetchReleaseFeed: async () => { fetchCount += 1; return { ok: true, status: 200, async json() { return { version: '2.0.0' }; } }; },
  });
  try {
    const result = await h.runtime.checkForUpdates();
    assert.equal(result.ok, false);
    assert.match(result.error, /public internet addresses/i);
    assert.equal(fetchCount, 0);
  } finally { h.cleanup(); }
});

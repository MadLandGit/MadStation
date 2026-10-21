const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createIconRuntime } = require('../build/main/icon-runtime.js');

function harness(overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'madstation-icon-runtime-'));
  const iconFolder = path.join(root, 'icons');
  fs.mkdirSync(iconFolder, { recursive: true });
  const cacheCalls = [];
  let cacheRef;
  const cache = {
    get(url) { return cacheCalls.includes(`cached:${url}`) ? 'data:image/png;base64,Y2FjaGVk' : ''; },
    async cacheFirst(candidates) { cacheCalls.push(`warm:${candidates[0]}`); return overrides.warmReturns || ''; },
    async cache(url) { cacheCalls.push(`cache:${url}`); return 'data:image/png;base64,Y2FjaGVk'; },
    clear() { cacheCalls.push('clear'); }, releaseMemory() { cacheCalls.push('release'); }, totalBytes: 16, entries: new Map([['url', 'entry']]),
  };
  const deps = {
    path, fs, getUserDataPath: () => root, iconFolderName: 'icons', remoteCacheFolderName: 'remote-cache',
    iconExtensions: new Set(['.png', '.jpg', '.jpeg', '.webp', '.ico', '.gif']), maxIconFileBytes: 512 * 1024, maxLocalCacheBytes: 16 * 1024 * 1024,
    iconKey: (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9.-]/g, ''),
    hostOf: (value) => { try { return new URL(String(value)).hostname; } catch { return ''; } },
    sanitizeIcon: (value) => { const v = String(value || '').trim(); return /^https:\/\//i.test(v) || /^data:image\//i.test(v) ? v : ''; },
    faviconForUrl: (value) => { try { return `https://${new URL(String(value)).hostname}/favicon.ico`; } catch { return ''; } },
    getConfig: () => ({ services: [{ id: 'provider', name: 'Provider', url: 'https://provider.example', icon: '' }], accounts: [{ serviceId: 'provider', icon: '' }] }),
    remoteIconsEnabled: () => true,
    createRemoteCache(folder) { cacheCalls.push(`create:${folder}`); cacheRef = cache; return cache; },
    pushConfig: () => cacheCalls.push('push-config'),
    ...overrides,
  };
  const runtime = createIconRuntime(deps);
  return { runtime, root, iconFolder, cacheCalls, get cache() { return cacheRef; }, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

test('local icon lookup respects extension/size policy and caches the base64 data URL', () => {
  const h = harness();
  try {
    fs.writeFileSync(path.join(h.iconFolder, 'provider.png'), Buffer.from([1, 2, 3]));
    const first = h.runtime.localIconFor({ id: 'provider', url: 'https://provider.example' });
    const second = h.runtime.localIconFor({ id: 'provider' });
    assert.equal(first, 'data:image/png;base64,AQID');
    assert.equal(second, first);
    assert.deepEqual(h.runtime.localIconCacheStats(), { bytes: 3, entries: 1 });
  } finally { h.cleanup(); }
});

test('candidate list keeps safe HTTPS fallbacks, embedded icon first, and suppresses remote cache lookup when requested', () => {
  const h = harness();
  try {
    const list = h.runtime.iconCandidatesFor({ id: 'provider', url: 'https://provider.example', icon: 'javascript:alert(1)' }, '', { includeCachedRemote: false });
    assert.equal(list[0], 'https://provider.example/favicon.ico');
    assert.ok(list.includes('https://provider.example/favicon.png'));
    const noCache = h.runtime.iconCandidatesFor({ id: 'provider', url: 'https://provider.example' }, '', { includeCachedRemote: false });
    assert.ok(noCache.every((item) => /^data:image\//i.test(item) || /^https:\/\//i.test(item)));
    assert.equal(h.cacheCalls.some((call) => call.startsWith('create:')), false);
  } finally { h.cleanup(); }
});

test('remote icon warming is disabled by preference and only pushes config when the cache changes', async () => {
  const disabled = harness({ remoteIconsEnabled: () => false });
  try { assert.equal(await disabled.runtime.warmRemoteIcons(), false); assert.equal(disabled.cacheCalls.some((call) => call.startsWith('create:')), false); } finally { disabled.cleanup(); }
  const h = harness({ warmReturns: 'data:image/png;base64,eA==' });
  try {
    h.runtime.warmRemoteIconsAndPush();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(h.cacheCalls.filter((call) => call.startsWith('warm:')).length, 1);
    assert.equal(h.cacheCalls.includes('push-config'), true);
  } finally { h.cleanup(); }
});

test('local and remote cache memory can be released without changing persisted config', () => {
  const h = harness();
  try {
    fs.writeFileSync(path.join(h.iconFolder, 'provider.png'), Buffer.from([1, 2, 3]));
    h.runtime.localIconFor({ id: 'provider' });
    h.runtime.clearLocalIconCache();
    assert.deepEqual(h.runtime.localIconCacheStats(), { bytes: 0, entries: 0 });
    h.runtime.releaseRemoteCacheMemory();
    assert.ok(h.cacheCalls.includes('release'));
    assert.equal(h.cacheCalls.includes('push-config'), false);
  } finally { h.cleanup(); }
});

test('icon runtime is wired into main, build command, and both developer source allowlists', () => {
  const pkg = require('../package.json');
  const main = fs.readFileSync('src/main.js', 'utf8');
  assert.match(main, /createIconRuntime/);
  assert.match(main, /iconRuntime\.clearLocalIconCache/);
  assert.match(pkg.scripts['build:main-modules'], /icon-runtime\.ts/);
  assert.ok(pkg.build.extraResources.some((item) => item.from === 'src' && item.filter?.includes('main/icon-runtime.ts')));
  assert.ok(pkg.scripts.test.includes('tests/main-icon-runtime.test.js'));
});

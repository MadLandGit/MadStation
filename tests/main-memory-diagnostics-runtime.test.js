const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createMemoryDiagnosticsRuntime } = require('../build/main/memory-diagnostics-runtime.js');

function makeView(pid) {
  return { webContents: { isDestroyed: () => false, getOSProcessId: () => pid } };
}
function harness(overrides = {}) {
  const views = {
    aiHub: new Map([['acct1', makeView(22)]]),
    arena: new Map([['left', makeView(33)]]),
    forge: new Map([['acct2', makeView(44)]]),
  };
  const config = {
    services: [{ id: 'svc', url: 'https://provider.example', authDomains: ['login.example'] }],
    accounts: [{ id: 'acct1', serviceId: 'svc' }, { id: 'acct2', serviceId: 'svc' }],
    recentAccountIds: ['acct1'],
  };
  const requested = [];
  const deps = {
    getAppMetrics: () => [
      { pid: 11, type: 'Browser', memory: { workingSetSize: 100 } },
      { pid: 22, type: 'Renderer', memory: { workingSetSize: 80 } },
      { pid: 33, type: 'Renderer', memory: { workingSetSize: 60 } },
      { pid: 44, type: 'Renderer', memory: { workingSetSize: 40 } },
      { pid: 55, type: 'Gpu', memory: { workingSetSize: 20 } },
      { pid: 22, type: 'duplicate', memory: { workingSetSize: 999 } },
    ],
    processId: 11,
    getSystemMemoryInfo: () => ({ total: 2000, available: 1000 }),
    views,
    getControlWebContents: () => makeView(66).webContents,
    getToolbarWebContents: () => makeView(77).webContents,
    getAccount: (id) => id === 'acct1' ? { name: 'Work account' } : id === 'acct2' ? { name: 'Video account' } : null,
    getWorkspaceApp: () => 'ai-hub', isLocked: () => false, getActiveId: () => 'acct1',
    getConfig: () => config,
    getArenaBrowserModels: () => ({ left: { id: 'a' }, right: null }),
    getForgeBrowserAccountId: () => 'acct2',
    getAccountRuntime: () => ({ lastError: 'temporary failure' }),
    normalizeHttpsUrl: (value) => { try { const u = new URL(String(value)); return u.protocol === 'https:' ? u.href : null; } catch { return null; } },
    diagnosticError: (value) => String(value || '').replace(/secret/gi, '[redacted]'),
    getSecurity: () => ({ remoteIcons: true, clearCacheOnExit: false, signOutOnExit: false, blockHttp: true }),
    getLocalIconCacheStats: () => ({ bytes: 128, entries: 2 }),
    getRemoteIconCacheStats: () => ({ totalBytes: 256, entries: new Map([['a', 1]]) }),
    getDownloadState: () => ({ active: 2, items: [{}, {}] }),
    getRuntimeInfo: () => ({ version: '1.6.3', electron: '39', chromium: '140', node: '22', platform: 'win32', arch: 'x64', osRelease: '10.0' }),
    resolvePublicHost: async () => [{ address: '93.184.216.34', family: 4 }],
    createHeadRequest: (url, addresses) => {
      requested.push(url);
      const req = new EventEmitter(); req.setTimeout = (_ms, cb) => { req.timeout = cb; }; req.abort = () => {}; req.end = () => queueMicrotask(() => req.emit('response', { statusCode: 204 })); return req;
    },
    now: () => 1234, nowIso: () => '2026-10-16T00:00:00.000Z',
    ...overrides,
  };
  return { runtime: createMemoryDiagnosticsRuntime(deps), deps, views, config, requested };
}

test('memory snapshots deduplicate process IDs and attribute aggregate workspace/browser/UI usage', () => {
  const h = harness();
  const snap = h.runtime.getMemorySnapshot();
  assert.equal(snap.totalKb, 300);
  assert.equal(snap.mainKb, 100);
  assert.equal(snap.aiHubKb, 80);
  assert.equal(snap.arenaKb, 60);
  assert.equal(snap.forgeKb, 40);
  assert.equal(snap.uiKb, 0);
  assert.equal(snap.gpuKb, 20);
  assert.equal(snap.aiHubSessionsExpected, 1);
  assert.equal(snap.aiHubSavedSessions, 2);
  assert.equal(snap.arenaSavedSelections, 1);
  assert.equal(snap.processes.find((p) => p.pid === 22).name, 'AI Hub · Work account');
  assert.equal(snap.processes.filter((p) => p.pid === 22).length, 1);
});

test('session diagnostics express live versus expected workspace views without exposing account data', () => {
  const diag = harness().runtime.collectSessionDiagnostics();
  assert.equal(diag.workspace, 'ai-hub');
  assert.equal(diag.activeAccountPresent, true);
  assert.equal(diag.expectedAiHubViews, 1);
  assert.equal(diag.expectedArenaViews, 0);
  assert.equal(diag.liveForgeViews, 1);
  assert.match(diag.browserPolicy, /bounded per-account browser set/);
  assert.equal(JSON.stringify(diag).includes('Work account'), false);
});

test('diagnostic export contains aggregate metrics, sanitized account errors and explicit privacy flags', async () => {
  const h = harness({ getAccountRuntime: () => ({ lastError: 'secret token failed' }) });
  const data = await h.runtime.collectDiagnostics();
  assert.equal(data.format, 'mad-station-diagnostics');
  assert.equal(data.generatedAt, '2026-10-16T00:00:00.000Z');
  assert.equal(data.providers[0].accountCount, 2);
  assert.equal(data.providers[0].accountErrors[0], '[redacted] token failed');
  assert.equal(data.caches.localIconMemoryBytes, 128);
  assert.equal(data.caches.remoteIconEntries, 1);
  assert.deepEqual(data.downloads, { active: 2, totalListed: 2 });
  assert.equal(data.privacy.includesApiKeys, false);
  assert.equal(data.privacy.includesCookies, false);
  assert.equal(JSON.stringify(data).includes('secret token'), false);
});

test('provider probes only use normalized HTTPS URLs and finish with status/latency results', async () => {
  const h = harness();
  const invalid = await h.runtime.probeProvider({ url: 'http://provider.example' });
  assert.equal(invalid.configuredUrlValid, false);
  assert.equal(h.requested.length, 0);
  const good = await h.runtime.probeProvider({ url: 'https://provider.example' });
  assert.equal(good.configuredUrlValid, true);
  assert.equal(good.reachable, true);
  assert.equal(good.statusCode, 204);
  assert.deepEqual(h.requested, ['https://provider.example/']);
});

test('diagnostics runtime is wired into the main process, package build and source allowlist', () => {
  const fs = require('node:fs'); const pkg = require('../package.json');
  const main = fs.readFileSync('src/main.js', 'utf8');
  const command = pkg.scripts['build:main-modules'];
  assert.match(main, /createMemoryDiagnosticsRuntime/);
  assert.match(main, /memoryDiagnosticsRuntime\.collectDiagnostics/);
  assert.match(command, /memory-diagnostics-runtime\.ts/);
  assert.ok(pkg.build.extraResources.some((item) => item.from === 'src' && item.filter?.includes('main/memory-diagnostics-runtime.ts')));
  assert.ok((pkg.scripts.test || '').includes('tests/main-memory-diagnostics-runtime.test.js'));
});

test('diagnostics provider probes refuse private DNS destinations and do not call transport', async () => {
  let requestCount = 0;
  const h = harness({
    resolvePublicHost: async () => { throw new Error('private host'); },
    createHeadRequest: () => { requestCount += 1; throw new Error('must not request'); },
  });
  const result = await h.runtime.probeProvider({ url: 'https://intranet.example/' });
  assert.equal(result.configuredUrlValid, true);
  assert.equal(result.reachable, false);
  assert.match(result.error, /private, local, or reserved/i);
  assert.equal(requestCount, 0);
});

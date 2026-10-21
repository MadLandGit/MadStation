const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createVideoHubNetworkRuntime } = require('../build/main/video-hub-network-runtime.js');

function makeHarness({ storedMode = 'direct', accounts = [{ id: 'a' }, { id: 'b' }], failOn = null } = {}) {
  const calls = [];
  const sessions = new Map();
  for (const account of accounts) {
    sessions.set(account.id, {
      setProxy: async ({ mode }) => { calls.push(['proxy', account.id, mode]); if (failOn === account.id && mode === 'system') throw new Error('proxy denied'); },
      closeAllConnections: async () => { calls.push(['close-connections', account.id]); },
    });
  }
  let mode = null;
  let settings = { mode: storedMode };
  const runtime = createVideoHubNetworkRuntime({
    readSettings: () => { calls.push(['read-settings']); return settings; },
    writeSettings: (next) => { calls.push(['write-settings', next]); settings = { mode: next }; },
    getAccounts: () => accounts,
    getRuntimeAccount: (account) => account,
    getSession: (account) => sessions.get(account.id),
    waitForSessionReady: async (session) => { calls.push(['ready', [...sessions.values()].indexOf(session)]); return undefined; },
    getMode: () => mode,
    setMode: (next) => { mode = next; calls.push(['mode', next]); },
    reloadActivePage: () => calls.push(['reload']),
  });
  return { runtime, calls, sessions, get settings() { return settings; }, get mode() { return mode; } };
}

test('network runtime loads and normalizes saved mode once', () => {
  const h = makeHarness({ storedMode: 'system' });
  assert.equal(h.runtime.getMode(), 'system');
  assert.equal(h.runtime.getMode(), 'system');
  assert.equal(h.calls.filter(([name]) => name === 'read-settings').length, 1);
});

test('network runtime normalizes unknown saved mode to direct', () => {
  const h = makeHarness({ storedMode: 'other' });
  assert.equal(h.runtime.getMode(), 'direct');
});

test('network runtime applies proxy mode and optionally closes pooled connections', async () => {
  const h = makeHarness();
  const session = h.sessions.get('a');
  await h.runtime.applyProxyToSession(session, 'system', { closeConnections: true });
  assert.deepEqual(h.calls.map((entry) => entry[0]), ['proxy', 'close-connections']);
  assert.deepEqual(h.calls[0], ['proxy', 'a', 'system']);
});

test('network mode updates all unique sessions, persists and reloads the active page', async () => {
  const h = makeHarness();
  const result = await h.runtime.setMode('system');
  assert.deepEqual(result, { ok: true, mode: 'system', changed: true });
  assert.equal(h.calls.filter(([name, , mode]) => name === 'proxy' && mode === 'system').length, 2);
  assert.ok(h.calls.findIndex(([name]) => name === 'write-settings') > h.calls.findIndex(([name]) => name === 'proxy'));
  assert.deepEqual(h.calls.at(-1), ['reload']);
  assert.equal(h.settings.mode, 'system');
});

test('invalid network mode is rejected without touching sessions', async () => {
  const h = makeHarness();
  assert.deepEqual(await h.runtime.setMode('proxy'), { ok: false, error: 'Choose normal network or system proxy.' });
  assert.equal(h.calls.length, 0);
});

test('proxy failure rolls every account back and preserves the original error', async () => {
  const h = makeHarness({ failOn: 'b' });
  const result = await h.runtime.setMode('system');
  assert.deepEqual(result, { ok: false, error: 'Could not apply network mode: proxy denied' });
  assert.equal(h.mode, 'direct');
  assert.equal(h.settings.mode, 'direct');
  assert.ok(h.calls.some(([name, id, mode]) => name === 'proxy' && id === 'a' && mode === 'direct'));
  assert.deepEqual(h.calls.at(-1), ['write-settings', 'direct']);
});

test('Video Hub network runtime is wired into main and packaged module list', () => {
  const root = path.join(__dirname, '..');
  const main = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.match(main, /createVideoHubNetworkRuntime/);
  assert.match(main, /function setVideoHubNetworkMode\(mode\) \{ return videoHubNetworkRuntime\.setMode\(mode\); \}/);
  assert.match(pkg.scripts['build:main-modules'], /src\/main\/video-hub-network-runtime\.ts/);
  assert.match(pkg.scripts.test, /tests\/main-video-hub-network-runtime\.test\.js/);
  assert.match(JSON.stringify(pkg.build.extraResources), /main\/video-hub-network-runtime\.ts/);
  assert.match(main, /'src\/main\/video-hub-network-runtime\.ts'/);
});

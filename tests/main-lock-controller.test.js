const test = require('node:test');
const assert = require('node:assert/strict');
const { createLockController } = require('../build/main/lock-controller.js');

function harness(overrides = {}) {
  let hasPassword = false;
  let locked = false;
  let lock = null;
  let workspaceApp = 'launcher';
  const calls = [];
  const dependencies = {
    normalizePassword: (value) => String(value ?? '').normalize('NFC'),
    hasPassword: () => hasPassword,
    checkPassword: async (value) => value === 'current-pass' ? { ok: true } : { ok: false, error: 'Incorrect password.' },
    createLock: async (password) => ({ salt: 'salt', hash: `hash:${password}` }),
    setLock: (value) => { lock = value; hasPassword = true; calls.push('setLock'); },
    clearLock: () => { lock = null; hasPassword = false; calls.push('clearLock'); },
    broadcastConfig: () => { calls.push('broadcast'); },
    lockApp: (workspace) => { calls.push(['lockApp', workspace]); locked = true; if (workspace) workspaceApp = workspace; },
    getWorkspaceApp: () => workspaceApp,
    isLocked: () => locked,
    unlockApp: () => { calls.push('unlockApp'); locked = false; },
    wipeAllSessions: async () => { calls.push('wipeAllSessions'); },
    ...overrides,
  };
  const controller = createLockController(dependencies);
  return { controller, calls, getLock: () => lock, setLocked: (value) => { locked = value; }, setHasPassword: (value) => { hasPassword = value; } };
}

test('app password validates length and rejects non-record payloads before writes', async () => {
  const h = harness();
  assert.deepEqual(await h.controller.setAppPassword({ next: 'short' }), { ok: false, error: 'Use at least 8 characters.' });
  assert.deepEqual(await h.controller.setAppPassword({ next: 'x'.repeat(257) }), { ok: false, error: 'Password is too long (max 256 characters).' });
  assert.deepEqual(await h.controller.setAppPassword(['password']), { ok: false, error: 'Use at least 8 characters.' });
  assert.deepEqual(h.calls, []);
});

test('setting initial app password persists and broadcasts exactly once', async () => {
  const h = harness();
  assert.deepEqual(await h.controller.setAppPassword({ next: 'long-pass' }), { ok: true });
  assert.deepEqual(h.getLock(), { salt: 'salt', hash: 'hash:long-pass' });
  assert.deepEqual(h.calls, ['setLock', 'broadcast']);
});

test('changing app password requires and validates current password first', async () => {
  const h = harness();
  h.setHasPassword(true);
  assert.deepEqual(await h.controller.setAppPassword({ next: 'replacement-pass', current: 'wrong' }), { ok: false, error: 'Incorrect password.' });
  assert.deepEqual(h.calls, []);
  assert.deepEqual(await h.controller.setAppPassword({ next: 'replacement-pass', current: 'current-pass' }), { ok: true });
  assert.deepEqual(h.calls, ['setLock', 'broadcast']);
});

test('removing an app password requires verification when one exists', async () => {
  const h = harness();
  h.setHasPassword(true);
  assert.deepEqual(await h.controller.removeAppPassword({ current: 'wrong' }), { ok: false, error: 'Incorrect password.' });
  assert.deepEqual(await h.controller.removeAppPassword({ current: 'current-pass' }), { ok: true });
  assert.deepEqual(h.calls, ['clearLock', 'broadcast']);
});

test('lock and unlock commands preserve response and injected side effects', async () => {
  const h = harness();
  assert.deepEqual(h.controller.lockNow('video-hub'), { ok: false, error: 'Set an app lock password first.' });
  h.setHasPassword(true);
  assert.deepEqual(h.controller.lockNow('video-hub'), { ok: true, workspace: 'video-hub' });
  assert.deepEqual(await h.controller.unlock('wrong'), { ok: false, error: 'Incorrect password.' });
  h.setLocked(true);
  assert.deepEqual(await h.controller.unlock('wrong'), { ok: false, error: 'Incorrect password.' });
  assert.deepEqual(await h.controller.unlock('current-pass'), { ok: true });
  assert.deepEqual(h.calls, [['lockApp', 'video-hub'], 'unlockApp']);
});

test('forgot-password reset wipes sessions before deleting lock and unlocking', async () => {
  const h = harness();
  h.setHasPassword(true);
  assert.deepEqual(await h.controller.resetAppLock(), { ok: true });
  assert.deepEqual(h.calls, ['wipeAllSessions', 'clearLock', 'unlockApp', 'broadcast']);
});

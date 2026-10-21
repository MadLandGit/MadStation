const test = require('node:test');
const assert = require('node:assert/strict');
const { registerLockIpcHandlers } = require('../build/main/lock-ipc.js');

test('app-lock IPC registers all five commands through the supplied secure handle wrapper', async () => {
  const handlers = new Map();
  const registrationCalls = [];
  const handle = (channel, callback, options) => { registrationCalls.push({ channel, options }); handlers.set(channel, callback); };
  const calls = [];
  const commands = {
    setAppPassword: (value) => { calls.push(['set', value]); return { ok: true }; },
    removeAppPassword: (value) => { calls.push(['remove', value]); return { ok: true }; },
    lockNow: (value) => { calls.push(['lock', value]); return { ok: true }; },
    unlock: (value) => { calls.push(['unlock', value]); return { ok: true }; },
    resetAppLock: () => { calls.push(['reset']); return { ok: true }; },
  };
  registerLockIpcHandlers(handle, commands);
  assert.deepEqual([...handlers.keys()], ['set-app-password', 'remove-app-password', 'lock-now', 'unlock', 'reset-app-lock']);
  assert.equal(registrationCalls.every((entry) => entry.options === undefined), true);
  assert.deepEqual(await handlers.get('set-app-password')({}, { next: 'new-password' }), { ok: true });
  assert.deepEqual(await handlers.get('remove-app-password')({}, { current: 'old-password' }), { ok: true });
  assert.deepEqual(await handlers.get('lock-now')({}, 'video-hub'), { ok: true });
  assert.deepEqual(await handlers.get('unlock')({}, 'password'), { ok: true });
  assert.deepEqual(await handlers.get('reset-app-lock')({}), { ok: true });
  assert.deepEqual(calls, [
    ['set', { next: 'new-password' }], ['remove', { current: 'old-password' }],
    ['lock', 'video-hub'], ['unlock', 'password'], ['reset'],
  ]);
});


test('main process registers the typed lock commands through the existing secure handle wrapper', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.join(__dirname, '..');
  const main = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.match(main, /require\('\.\.\/build\/main\/lock-controller\.js'\)/);
  assert.match(main, /registerLockIpcHandlers\(handle, lockController\)/);
  assert.doesNotMatch(main, /handle\('set-app-password'/);
  assert.match(packageJson.scripts['build:main-modules'], /src\/main\/lock-controller\.ts/);
  assert.match(packageJson.scripts['build:main-modules'], /src\/main\/lock-ipc\.ts/);
});

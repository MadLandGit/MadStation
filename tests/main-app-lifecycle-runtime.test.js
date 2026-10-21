const test = require('node:test');
const assert = require('node:assert/strict');
const { startLockWatchersRuntime } = require('../build/main/app-lifecycle-runtime.js');

function harness() {
  const timers = [];
  const listeners = new Map();
  const calls = [];
  let locked = false;
  let password = true;
  let security = { lockOnIdle: true, idleMinutes: 5, lockOnSystemLock: true };
  let idle = 300;
  startLockWatchersRuntime({
    scheduleRepeating: (callback, intervalMs) => timers.push({ callback, intervalMs }),
    onPowerEvent: (event, callback) => listeners.set(event, callback),
    isLocked: () => locked,
    hasPassword: () => password,
    getSecurity: () => security,
    getSystemIdleTimeSeconds: () => idle,
    lockApp: () => calls.push('lock'),
  });
  return { timers, listeners, calls, setLocked: (value) => { locked = value; }, setPassword: (value) => { password = value; }, setSecurity: (value) => { security = value; }, setIdle: (value) => { idle = value; } };
}

test('lock watcher registers 15-second polling and both system lifecycle events', () => {
  const h = harness();
  assert.equal(h.timers.length, 1);
  assert.equal(h.timers[0].intervalMs, 15000);
  assert.deepEqual([...h.listeners.keys()], ['lock-screen', 'suspend']);
});

test('idle lock only triggers when unlocked, password-protected, and idle threshold is reached', () => {
  const h = harness();
  h.timers[0].callback();
  assert.deepEqual(h.calls, ['lock']);
  h.calls.length = 0;
  h.setLocked(true);
  h.timers[0].callback();
  h.setLocked(false);
  h.setPassword(false);
  h.timers[0].callback();
  h.setPassword(true);
  h.setIdle(299);
  h.timers[0].callback();
  assert.deepEqual(h.calls, []);
});

test('system lock and suspend obey the live system-lock security setting', () => {
  const h = harness();
  h.listeners.get('lock-screen')();
  h.listeners.get('suspend')();
  assert.deepEqual(h.calls, ['lock', 'lock']);
  h.calls.length = 0;
  h.setSecurity({ lockOnIdle: true, idleMinutes: 5, lockOnSystemLock: false });
  h.listeners.get('lock-screen')();
  h.listeners.get('suspend')();
  assert.deepEqual(h.calls, []);
});

test('main process wires the extracted lock watcher to existing Electron state and packages its source', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.join(__dirname, '..');
  const main = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.match(main, /require\('\.\.\/build\/main\/app-lifecycle-runtime\.js'\)/);
  assert.match(main, /startLockWatchersRuntime\(\{/);
  assert.match(main, /getSystemIdleTimeSeconds: \(\) => powerMonitor\.getSystemIdleTime\(\)/);
  assert.match(packageJson.scripts['build:main-modules'], /src\/main\/app-lifecycle-runtime\.ts/);
  assert.ok(packageJson.build.extraResources.some((resource) => resource.from === 'src' && resource.filter.includes('main/app-lifecycle-runtime.ts')));
});

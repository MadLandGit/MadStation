const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { wipeArenaAccountDataRuntime } = require('../build/main/arena-account-data-runtime.js');

function harness(overrides = {}) {
  const calls = [];
  const account = { id: 'arena-account-1', providerId: 'provider-1', name: 'Personal' };
  const session = {
    async clearStorageData() { calls.push('clear-storage'); },
    async clearCache() { calls.push('clear-cache'); },
  };
  const dependencies = {
    closeView(id) { calls.push(`close-view:${id}`); return { status: 'closed' }; },
    getSession(record) { calls.push(`get-session:${record.id}`); return session; },
    ...overrides,
  };
  return { calls, account, session, dependencies };
}

test('Arena account data runtime closes the view before session lookup, storage and cache cleanup', async () => {
  const { calls, account, dependencies } = harness();
  const result = await wipeArenaAccountDataRuntime(account, dependencies);
  assert.deepEqual(calls, [
    'close-view:arena-account-1',
    'get-session:arena-account-1',
    'clear-storage',
    'clear-cache',
  ]);
  assert.deepEqual(result, { status: 'cleared', failedSteps: [] });
});

test('Arena account data runtime still clears cache when storage cleanup rejects', async () => {
  const { calls, account, dependencies } = harness({
    getSession(record) {
      calls.push(`get-session:${record.id}`);
      return {
        async clearStorageData() { calls.push('clear-storage'); throw new Error('private profile path'); },
        async clearCache() { calls.push('clear-cache'); },
      };
    },
  });
  const result = await wipeArenaAccountDataRuntime(account, dependencies);
  assert.deepEqual(calls, [
    'close-view:arena-account-1',
    'get-session:arena-account-1',
    'clear-storage',
    'clear-cache',
  ]);
  assert.deepEqual(result, { status: 'partial', failedSteps: ['clear-storage'] });
  assert.doesNotMatch(JSON.stringify(result), /private profile path/);
});

test('Arena account data runtime reports cache failures without exposing exception text', async () => {
  const { account, dependencies } = harness({
    getSession() {
      return {
        async clearStorageData() {},
        async clearCache() { throw new Error('secret cache details'); },
      };
    },
  });
  const result = await wipeArenaAccountDataRuntime(account, dependencies);
  assert.deepEqual(result, { status: 'partial', failedSteps: ['clear-cache'] });
  assert.doesNotMatch(JSON.stringify(result), /secret cache details/);
});

test('Arena account data runtime continues cleanup when the native view close reports failure', async () => {
  const { calls, account, dependencies } = harness({
    closeView(id) { calls.push(`close-view:${id}`); return { status: 'failed' }; },
  });
  const result = await wipeArenaAccountDataRuntime(account, dependencies);
  assert.deepEqual(calls, [
    'close-view:arena-account-1',
    'get-session:arena-account-1',
    'clear-storage',
    'clear-cache',
  ]);
  assert.deepEqual(result, { status: 'partial', failedSteps: ['close-view'] });
});

test('Arena account data runtime stops storage operations when session resolution fails', async () => {
  const { calls, account, dependencies } = harness({
    getSession(record) { calls.push(`get-session:${record.id}`); throw new Error('session detail'); },
  });
  const result = await wipeArenaAccountDataRuntime(account, dependencies);
  assert.deepEqual(calls, ['close-view:arena-account-1', 'get-session:arena-account-1']);
  assert.deepEqual(result, { status: 'partial', failedSteps: ['resolve-session'] });
  assert.doesNotMatch(JSON.stringify(result), /session detail/);
});

test('Arena account data runtime catches a thrown close operation and still wipes the session', async () => {
  const { calls, account, dependencies } = harness({
    closeView(id) { calls.push(`close-view:${id}`); throw new Error('native view error'); },
  });
  const result = await wipeArenaAccountDataRuntime(account, dependencies);
  assert.deepEqual(calls, [
    'close-view:arena-account-1',
    'get-session:arena-account-1',
    'clear-storage',
    'clear-cache',
  ]);
  assert.deepEqual(result, { status: 'partial', failedSteps: ['close-view'] });
  assert.doesNotMatch(JSON.stringify(result), /native view error/);
});

test('Arena account data runtime is wired into main build and packaged developer-source allowlists', () => {
  const root = path.join(__dirname, '..');
  const main = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.match(main, /require\('\.\.\/build\/main\/arena-account-data-runtime\.js'\)/);
  assert.match(main, /'src\/main\/arena-account-data-runtime\.ts'/);
  assert.match(packageJson.scripts['build:main-modules'], /src\/main\/arena-account-data-runtime\.ts/);
  assert.match(packageJson.scripts.test, /tests\/main-arena-account-data-runtime\.test\.js/);
  assert.match(JSON.stringify(packageJson.build.extraResources), /main\/arena-account-data-runtime\.ts/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { planViewPrune } = require('../build/main/browser-view-policy.js');
const { applyViewPrunePlan } = require('../build/main/browser-view-pruning-runtime.js');

test('pruning runtime applies policy-selected close IDs in exactly the policy order', () => {
  const viewIds = ['keep', 'older-a', 'recent', 'older-b', 'oldest'];
  const closeIds = planViewPrune({
    viewIds,
    preferredId: 'keep',
    maxLiveViews: 2,
    lastVisitedAt: new Map([['keep', 1], ['older-a', 2], ['recent', 20], ['older-b', 3], ['oldest', 0]]),
  });
  const calls = [];
  const result = applyViewPrunePlan(closeIds, (id) => calls.push(id));
  assert.deepEqual(closeIds, ['older-a', 'older-b', 'oldest']);
  assert.deepEqual(calls, closeIds);
  assert.deepEqual(result, { attemptedIds: closeIds, failedIds: [] });
});

test('pruning runtime keeps attempting planned views after one close operation throws', () => {
  const closeIds = ['first', 'second', 'third', 'fourth'];
  const calls = [];
  const result = applyViewPrunePlan(closeIds, (id) => {
    calls.push(id);
    if (id === 'second') throw new Error('native failure with private details');
  });
  assert.deepEqual(calls, closeIds);
  assert.deepEqual(result, { attemptedIds: closeIds, failedIds: ['second'] });
  assert.doesNotMatch(JSON.stringify(result), /private details/);
});

test('pruning runtime is a no-op for an empty plan', () => {
  let calls = 0;
  const result = applyViewPrunePlan([], () => { calls += 1; });
  assert.equal(calls, 0);
  assert.deepEqual(result, { attemptedIds: [], failedIds: [] });
});

test('account pruning delegates the ordered plan to the runtime adapter and logs only a count', () => {
  const root = path.join(__dirname, '..');
  const main = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const source = fs.readFileSync(path.join(root, 'src', 'main', 'browser-view-pruning-runtime.ts'), 'utf8');
  assert.match(main, /require\('\.\.\/build\/main\/browser-view-pruning-runtime\.js'\)/);
  const accountBrowser = fs.readFileSync(path.join(root, 'src/main/account-browser-runtime.ts'), 'utf8');
  assert.match(main, /function pruneInactiveAccountViews\(preferredId = activeId\) \{ return accountBrowserRuntime\.pruneInactiveViews\(preferredId\); \}/);
  assert.match(accountBrowser, /applyViewPrunePlan\(closeIds, \(id\) => removeView\(id, \{ preserveRuntime: true, cancelDownloads: false \}\)\)/);
  assert.match(accountBrowser, /result\.failedIds\.length > 0/);
  assert.match(accountBrowser, /inactive account views could not be fully removed:', result\.failedIds\.length/);
  assert.match(source, /export function applyViewPrunePlan/);
  assert.match(pkg.scripts['build:main-modules'], /src\/main\/browser-view-pruning-runtime\.ts/);
  assert.match(pkg.scripts.test, /tests\/main-browser-view-pruning-runtime\.test\.js/);
  assert.match(main, /'src\/main\/browser-view-pruning-runtime\.ts'/);
  assert.match(JSON.stringify(pkg.build.extraResources), /main\/browser-view-pruning-runtime\.ts/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { planViewPrune, planAccountViewReclamation } = require('../build/main/browser-view-policy.js');

const timestamps = (entries) => new Map(entries);

test('view pruning does nothing while live view count is within the configured limit', () => {
  assert.deepEqual(planViewPrune({
    viewIds: ['a', 'b', 'c'],
    preferredId: 'b',
    maxLiveViews: 4,
    lastVisitedAt: timestamps([['a', 10], ['b', 20], ['c', 30]]),
  }), []);
});

test('view pruning always retains a live preferred ID and then the most recently visited views', () => {
  const viewIds = ['a', 'b', 'c', 'd', 'e'];
  const closeIds = planViewPrune({
    viewIds,
    preferredId: 'a',
    maxLiveViews: 3,
    lastVisitedAt: timestamps([['a', 1], ['b', 20], ['c', 30], ['d', 40], ['e', 50]]),
  });
  assert.deepEqual(closeIds, ['b', 'c']);
});

test('view pruning preserves insertion order for tied timestamps and close-list ordering', () => {
  const viewIds = ['a', 'b', 'c', 'd', 'e'];
  const closeIds = planViewPrune({
    viewIds,
    preferredId: 'e',
    maxLiveViews: 3,
    lastVisitedAt: timestamps([['a', 5], ['b', 5], ['c', 10], ['d', 10], ['e', 1]]),
  });
  assert.deepEqual(closeIds, ['a', 'b']);
});

test('view pruning handles missing preferred IDs, invalid limits and zero capacity deterministically', () => {
  const lastVisitedAt = timestamps([['a', 1], ['b', 2]]);
  assert.deepEqual(planViewPrune({ viewIds: ['a', 'b'], preferredId: 'missing', maxLiveViews: 1, lastVisitedAt }), ['a']);
  assert.deepEqual(planViewPrune({ viewIds: ['a', 'b'], maxLiveViews: 0, lastVisitedAt }), ['a', 'b']);
  assert.deepEqual(planViewPrune({ viewIds: ['a', 'b'], maxLiveViews: Number.NaN, lastVisitedAt }), ['a', 'b']);
});

test('memory reclamation retains the active view only in unlocked AI Hub and never closes borrowed views', () => {
  const options = {
    viewIds: ['active', 'inactive', 'borrowed'],
    workspaceApp: 'ai-hub',
    locked: false,
    activeId: 'active',
    borrowedIds: new Set(['borrowed']),
  };
  assert.deepEqual(planAccountViewReclamation(options), ['inactive']);
  assert.deepEqual(planAccountViewReclamation({ ...options, locked: true }), ['active', 'inactive']);
  assert.deepEqual(planAccountViewReclamation({ ...options, workspaceApp: 'launcher' }), ['active', 'inactive']);
});

test('browser view policy is wired into account pruning, Forge pruning and memory reclaim', () => {
  const root = path.join(__dirname, '..');
  const main = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');
  const source = fs.readFileSync(path.join(root, 'src', 'main', 'browser-view-policy.ts'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.match(main, /planViewPrune.*browser-view-policy\.js/);
  const accountBrowser = fs.readFileSync(path.join(root, 'src/main/account-browser-runtime.ts'), 'utf8');
  assert.match(main, /function pruneInactiveAccountViews\(preferredId = activeId\) \{ return accountBrowserRuntime\.pruneInactiveViews\(preferredId\); \}/);
  assert.match(accountBrowser, /planViewPrune/);
  assert.match(main, /function pruneForgeBrowserViews\(preferredId = forgeBrowserAccountId\) \{ return forgeBrowserRuntime\.pruneBrowserViews\(preferredId\); \}/);
  assert.match(fs.readFileSync(path.join(root, 'src/main/forge-browser-runtime.ts'), 'utf8'), /planViewPrune/);
  assert.match(main, /async function reclaimUnusedMemory\(\)[\s\S]*reclaimAccountViewsRuntime/);
  assert.match(source, /export function planViewPrune/);
  assert.match(source, /export function planAccountViewReclamation/);
  assert.match(pkg.scripts['build:main-modules'], /src\/main\/browser-view-policy\.ts/);
  assert.match(pkg.scripts.test, /tests\/main-browser-view-policy\.test\.js/);
  assert.match(main, /'src\/main\/browser-view-policy\.ts'/);
});

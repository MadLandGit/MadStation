const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { reclaimAccountViewsRuntime } = require('../build/main/browser-view-reclamation-runtime.js');

function baseOptions(overrides = {}) {
  return {
    viewIds: ['active', 'inactive-a', 'borrowed', 'inactive-b'],
    workspaceApp: 'ai-hub',
    locked: false,
    activeId: 'active',
    borrowedIds: new Set(['borrowed']),
    ...overrides,
  };
}

test('memory reclamation never closes active AI Hub or temporarily borrowed views', () => {
  const calls = [];
  const result = reclaimAccountViewsRuntime(baseOptions(), (id) => calls.push(id));
  assert.deepEqual(result.plannedIds, ['inactive-a', 'inactive-b']);
  assert.deepEqual(calls, ['inactive-a', 'inactive-b']);
  assert.deepEqual(result.failedIds, []);
});

test('memory reclamation may close the active view while locked but still protects borrowed views', () => {
  const calls = [];
  const result = reclaimAccountViewsRuntime(baseOptions({ locked: true }), (id) => calls.push(id));
  assert.deepEqual(result.plannedIds, ['active', 'inactive-a', 'inactive-b']);
  assert.deepEqual(calls, result.plannedIds);
  assert.equal(calls.includes('borrowed'), false);
});

test('memory reclamation follows another workspace policy and never protects a stale active ID', () => {
  const calls = [];
  const result = reclaimAccountViewsRuntime(baseOptions({ workspaceApp: 'launcher', activeId: 'not-live' }), (id) => calls.push(id));
  assert.deepEqual(result.plannedIds, ['active', 'inactive-a', 'inactive-b']);
  assert.deepEqual(calls, result.plannedIds);
});

test('memory reclamation continues after an individual close failure and does not expose exception details', () => {
  const calls = [];
  const result = reclaimAccountViewsRuntime(baseOptions(), (id) => {
    calls.push(id);
    if (id === 'inactive-a') throw new Error('private native error / user profile path');
  });
  assert.deepEqual(calls, ['inactive-a', 'inactive-b']);
  assert.deepEqual(result, {
    plannedIds: ['inactive-a', 'inactive-b'],
    attemptedIds: ['inactive-a', 'inactive-b'],
    failedIds: ['inactive-a'],
  });
  assert.doesNotMatch(JSON.stringify(result), /private native error|user profile path/);
});

test('memory reclamation with no eligible views performs no close operations', () => {
  let calls = 0;
  const result = reclaimAccountViewsRuntime(baseOptions({ viewIds: ['active', 'borrowed'] }), () => { calls += 1; });
  assert.deepEqual(result.plannedIds, []);
  assert.equal(calls, 0);
  assert.deepEqual(result.failedIds, []);
});

test('host wiring, build scripts, developer allowlists and documentation include the reclamation adapter', () => {
  const root = path.join(__dirname, '..');
  const main = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');
  const source = fs.readFileSync(path.join(root, 'src', 'main', 'browser-view-reclamation-runtime.ts'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const architecture = fs.readFileSync(path.join(root, 'docs/architecture/ARCHITECTURE.md'), 'utf8');
  assert.match(main, /require\('\.\.\/build\/main\/browser-view-reclamation-runtime\.js'\)/);
  assert.match(main, /const accountViewReclamation = reclaimAccountViewsRuntime\(/);
  assert.match(main, /closeResult\?\.status === 'failed'/);
  assert.match(main, /failedAccountViewCount: accountViewReclamation\.failedIds\.length/);
  assert.match(source, /export function reclaimAccountViewsRuntime/);
  assert.match(pkg.scripts['build:main-modules'], /src\/main\/browser-view-reclamation-runtime\.ts/);
  assert.match(pkg.scripts.test, /tests\/main-browser-view-reclamation-runtime\.test\.js/);
  assert.match(main, /'src\/main\/browser-view-reclamation-runtime\.ts'/);
  assert.match(JSON.stringify(pkg.build.extraResources), /main\/browser-view-reclamation-runtime\.ts/);
  assert.match(architecture, /browser-view-reclamation-runtime\.ts/);
});

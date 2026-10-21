const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { attachAndRegisterWebContentsViewRuntime } = require('../build/main/web-contents-view-attachment-runtime.js');

function createHarness(overrides = {}) {
  const calls = [];
  const view = { id: 'view-x' };
  const dependencies = {
    initialNavigationTiming: 'before-attach',
    navigate: (candidate) => calls.push(['navigate', candidate.id]),
    attach: (candidate) => calls.push(['attach', candidate.id]),
    register: (candidate) => calls.push(['register', candidate.id]),
    afterRegister: (candidate) => calls.push(['afterRegister', candidate.id]),
    ...overrides,
  };
  return { calls, view, dependencies };
}

test('standard workspaces preserve navigate-before-attach/register order', () => {
  const h = createHarness();
  const result = attachAndRegisterWebContentsViewRuntime(h.view, h.dependencies);
  assert.equal(result, h.view);
  assert.deepEqual(h.calls, [
    ['navigate', 'view-x'], ['attach', 'view-x'], ['register', 'view-x'], ['afterRegister', 'view-x'],
  ]);
});

test('Video Hub preserves attach/register/layout-before-async-navigation order', () => {
  const h = createHarness({ initialNavigationTiming: 'after-register' });
  attachAndRegisterWebContentsViewRuntime(h.view, h.dependencies);
  assert.deepEqual(h.calls, [
    ['attach', 'view-x'], ['register', 'view-x'], ['afterRegister', 'view-x'], ['navigate', 'view-x'],
  ]);
});

test('attachment failure is surfaced without registering an unattached native view', () => {
  const h = createHarness({ attach: () => { h.calls.push(['attach-failed']); throw new Error('native attach failed'); } });
  assert.throws(() => attachAndRegisterWebContentsViewRuntime(h.view, h.dependencies), /native attach failed/);
  assert.deepEqual(h.calls, [['navigate', 'view-x'], ['attach-failed']]);
});

test('AI Hub, Forge, Arena and Video Hub use the shared attachment runtime', () => {
  const root = path.join(__dirname, '..');
  const main = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.match(main, /require\('\.\.\/build\/main\/web-contents-view-attachment-runtime\.js'\)/);
  const owners = ['src/main/account-browser-runtime.ts', 'src/main/arena-browser-runtime.ts', 'src/main/forge-browser-runtime.ts', 'src/main/video-hub-browser-runtime.ts'];
  const ownerSources = owners.map((file) => fs.readFileSync(path.join(root, file), 'utf8'));
  assert.equal([main, ...ownerSources].reduce((sum, source) => sum + (source.match(/attachAndRegisterWebContentsViewRuntime\(view, \{/g) || []).length, 0), 4);
  assert.match(ownerSources[3], /initialNavigationTiming: 'after-register'/);
  assert.match(pkg.scripts['build:main-modules'], /src\/main\/web-contents-view-attachment-runtime\.ts/);
  assert.match(pkg.scripts.test, /tests\/main-web-contents-view-attachment-runtime\.test\.js/);
  assert.match(main, /'src\/main\/web-contents-view-attachment-runtime\.ts'/);
  assert.match(JSON.stringify(pkg.build.extraResources), /main\/web-contents-view-attachment-runtime\.ts/);
});

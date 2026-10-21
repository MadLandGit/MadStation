const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Lock screen React entry is wired through Vite, renderer HTML, canonical tests, and the developer-source package filter', () => {
  const html = read('src/renderer.html');
  const vite = read('vite.config.ts');
  const pkg = JSON.parse(read('package.json'));
  assert.match(vite, /'lock-screen-react': resolve\(__dirname, 'src\/renderer-react\/lock-screen\.tsx'\)/);
  assert.match(html, /id="lockScreenReactMount"/);
  assert.match(html, /src="\.\.\/build\/lock-screen-react\.js"/);
  assert.match(pkg.scripts.test, /tests\/renderer-react-lock-screen\.test\.js/);
  const sourceFilters = pkg.build.extraResources.filter((resource) => resource.from === 'src').flatMap((resource) => resource.filter || []);
  assert.equal(sourceFilters.filter((entry) => entry === 'renderer-react/lock-screen.tsx').length, 1);
});

test('React keeps unlock password local and submits only through a direct bridge', () => {
  const component = read('src/renderer-react/lock-screen.tsx');
  assert.match(component, /useState\(''\)/);
  assert.match(component, /type="password"/);
  assert.match(component, /maxLength=\{256\}/);
  assert.match(component, /MadStationLockScreen\?\.submit\(password\)/);
  assert.doesNotMatch(component, /CustomEvent.*password|dispatchEvent.*password|localStorage|sessionStorage|dangerouslySetInnerHTML|\.innerHTML/);
});

test('Host validates lock state and password bounds before calling the existing unlock API', () => {
  const renderer = read('src/renderer.js');
  const start = renderer.indexOf('window.MadStationLockScreen = {');
  const end = renderer.indexOf("window.addEventListener('madstation:lock-screen-mounted'", start);
  assert.ok(start >= 0 && end > start);
  const bridge = renderer.slice(start, end);
  assert.match(bridge, /if \(!state\.locked\)/);
  assert.match(bridge, /typeof rawPassword !== 'string'/);
  assert.match(bridge, /rawPassword\.length > 256/);
  assert.match(bridge, /window\.aiHub\.unlock\(rawPassword\)/);
  assert.match(bridge, /slice\(0, 400\)/);
});

test('Reset confirmation and trusted reset operation stay in the host, with bounded result messages', () => {
  const renderer = read('src/renderer.js');
  const start = renderer.indexOf('window.MadStationLockScreen = {');
  const end = renderer.indexOf("window.addEventListener('madstation:lock-screen-mounted'", start);
  const bridge = renderer.slice(start, end);
  assert.match(bridge, /async reset\(\)/);
  assert.match(bridge, /window\.confirm\('Reset the app lock/);
  assert.match(bridge, /cancelled: true/);
  assert.match(bridge, /window\.aiHub\.resetAppLock\(\)/);
  assert.match(bridge, /slice\(0, 400\)/);
});

test('Lock-state publication contains only a boolean; React takeover keeps the fallback form hidden until mount', () => {
  const renderer = read('src/renderer.js');
  const start = renderer.indexOf('function publishLockScreenState()');
  const end = renderer.indexOf('\nfunction applyLockUi()', start);
  const publish = renderer.slice(start, end);
  assert.match(publish, /detail: \{ locked: Boolean\(state\.locked\) \}/);
  const eventExpression = publish.match(/new CustomEvent\('madstation:lock-screen-state',[^;]+/);
  assert.ok(eventExpression);
  assert.doesNotMatch(eventExpression[0], /password|credential|secret/i);
  const mountStart = renderer.indexOf("window.addEventListener('madstation:lock-screen-mounted'");
  const mountEnd = renderer.indexOf("$('lockForm').addEventListener('submit'", mountStart);
  const mount = renderer.slice(mountStart, mountEnd);
  assert.match(mount, /legacy\.hidden = true/);
  assert.match(mount, /mount\.hidden = false/);
  assert.match(mount, /publishLockScreenState\(\)/);
});

test('Legacy unlock form remains as a bounded startup fallback', () => {
  const html = read('src/renderer.html');
  assert.match(html, /id="lockForm"/);
  assert.match(html, /id="lockPassword"[^>]*maxlength="256"/);
  assert.match(html, /id="lockScreenReactMount" hidden/);
});

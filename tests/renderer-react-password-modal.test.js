'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('password modal React entry is wired into Vite, HTML, the test list and source allowlists', () => {
  const vite = read('vite.config.ts');
  const html = read('src/renderer.html');
  const pkg = JSON.parse(read('package.json'));
  const main = read('src/main.js');
  assert.match(vite, /'password-modal-react': resolve\(__dirname, 'src\/renderer-react\/password-modal\.tsx'\)/);
  assert.match(html, /src="\.\.\/build\/password-modal-react\.js"/);
  assert.match(html, /id="passwordFormReactMount" hidden/);
  assert.match(html, /id="passwordFormLegacy"/);
  assert.match(pkg.scripts.test, /tests\/renderer-react-password-modal\.test\.js/);
  assert.ok(pkg.build.extraResources.some((resource) => resource.from === 'src' && resource.filter?.includes('renderer-react/password-modal.tsx')));
  assert.match(main, /'src\/renderer-react\/password-modal\.tsx'/);
});

test('password values stay local to the React draft and are sent only through the direct host bridge', () => {
  const component = read('src/renderer-react/password-modal.tsx');
  assert.match(component, /const \[values, setValues\] = useState<PasswordValues>\(EMPTY_VALUES\)/);
  assert.match(component, /window\.MadStationPasswordModal\?\.submit\(\{ current: values\.current, next: values\.next, confirm: values\.confirm \}\)/);
  assert.doesNotMatch(component, /CustomEvent.*password|madstation:password-modal-action|localStorage|sessionStorage/);
  assert.match(component, /maxLength=\{256\}/);
  assert.match(component, /minLength=\{8\}/);
  assert.match(component, /\{snapshot\.error\}/);
  assert.doesNotMatch(component, /dangerouslySetInnerHTML|innerHTML\s*=/);
});

test('renderer validates password payload shape and bounds before using trusted APIs', () => {
  const renderer = read('src/renderer.js');
  const start = renderer.indexOf('async function handlePasswordModalSubmit');
  const end = renderer.indexOf("document.querySelectorAll('[data-sec]')", start);
  const handler = renderer.slice(start, end);
  assert.match(handler, /prototype !== Object\.prototype && prototype !== null/);
  assert.match(handler, /typeof current !== 'string'/);
  assert.match(handler, /current\.length > 256 \|\| next\.length > 256 \|\| confirm\.length > 256/);
  assert.match(handler, /next\.length < 8/);
  assert.match(handler, /next !== confirm/);
  assert.match(handler, /window\.aiHub\.removeAppPassword\(\{ current \}\)/);
  assert.match(handler, /window\.aiHub\.setAppPassword\(\{ current, next \}\)/);
  assert.match(handler, /operationId !== passwordModalOperationId/);
});

test('legacy password form remains available until the React mount handshake', () => {
  const renderer = read('src/renderer.js');
  const html = read('src/renderer.html');
  assert.match(renderer, /madstation:password-modal-mounted/);
  assert.match(renderer, /if \(passwordModalReactMounted\) publishPasswordModal\(true\)/);
  assert.match(renderer, /\$\('passwordFormLegacy'\)\.addEventListener\('submit'/);
  assert.match(html, /id="passwordFormLegacy"/);
  assert.match(html, /id="passwordFormReactMount"/);
});

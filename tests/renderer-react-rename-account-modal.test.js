'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('rename modal React entry is wired into Vite, renderer HTML, package tests and developer source access', () => {
  const vite = read('vite.config.ts');
  const html = read('src/renderer.html');
  const pkg = JSON.parse(read('package.json'));
  const main = read('src/main.js');
  assert.match(vite, /'rename-account-modal-react': resolve\(__dirname, 'src\/renderer-react\/rename-account-modal\.tsx'\)/);
  assert.match(html, /src="\.\.\/build\/rename-account-modal-react\.js"/);
  assert.match(html, /id="renameFormReactMount" hidden/);
  assert.match(html, /id="renameFormLegacy"/);
  assert.match(pkg.scripts.test, /tests\/renderer-react-rename-account-modal\.test\.js/);
  assert.ok(pkg.build.extraResources.some((resource) => resource.from === 'src' && resource.filter?.includes('renderer-react/rename-account-modal.tsx')));
  assert.match(main, /'src\/renderer-react\/rename-account-modal\.tsx'/);
});

test('React form owns controlled presentation and safely renders bounded host errors as text', () => {
  const component = read('src/renderer-react/rename-account-modal.tsx');
  assert.match(component, /value=\{name\}/);
  assert.match(component, /maxLength=\{60\}/);
  assert.match(component, /name: name\.trim\(\)/);
  assert.match(component, /\{snapshot\.error\}/);
  assert.match(component, /error\.length <= 400/);
  assert.match(component, /disabled=\{snapshot\.saving/);
  assert.doesNotMatch(component, /dangerouslySetInnerHTML|innerHTML\s*=/);
});

test('renderer host validates the rename action and preserves the trusted preload mutation', () => {
  const renderer = read('src/renderer.js');
  const handler = renderer.slice(renderer.indexOf('async function handleRenameAccountModalAction'), renderer.indexOf('function managementFormProviders'));
  assert.match(handler, /typeof action\.name !== 'string'/);
  assert.match(handler, /action\.name\.length > 60/);
  assert.match(handler, /state\.accounts\.some\(\(account\) => account\.id === accountId\)/);
  assert.match(handler, /window\.aiHub\.renameAccount\(accountId, name\)/);
  assert.match(handler, /renamingAccountId !== accountId/);
  assert.match(renderer, /madstation:rename-account-modal-mounted/);
  assert.match(renderer, /madstation:rename-account-modal-action/);
});

test('legacy rename form remains as fallback and uses bounded text-only error output', () => {
  const renderer = read('src/renderer.js');
  const html = read('src/renderer.html');
  assert.match(html, /id="renameFormLegacy"/);
  assert.match(html, /id="renameFormReactMount"/);
  assert.match(renderer, /if \(renameModalReactMounted\) publishRenameAccountModal\(true\)/);
  assert.match(renderer, /typeof result\?\.error === 'string' \? result\.error : 'Could not rename account\.'/);
  assert.match(renderer, /\$\('renameError'\)\.textContent =/);
});

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Prompt Studio account tabs and browser status React entry is wired through Vite, HTML, tests and packaging', () => {
  const vite = read('vite.config.ts');
  const html = read('src/renderer.html');
  const main = read('src/main.js');
  const pkg = JSON.parse(read('package.json'));
  assert.match(vite, /instruction-forge-accounts-react': resolve\(__dirname, 'src\/renderer-react\/instruction-forge-accounts\.tsx'\)/);
  assert.match(html, /src="\.\.\/build\/instruction-forge-accounts-react\.js"/);
  assert.match(pkg.scripts.test, /tests\/renderer-react-instruction-forge-accounts\.test\.js/);
  assert.ok(pkg.build.extraResources.find((entry) => entry.to === 'developer-docs/src').filter.includes('renderer-react/instruction-forge-accounts.tsx'));
  assert.match(main, /src\/renderer-react\/instruction-forge-accounts\.tsx/);
});

test('Prompt Studio account tabs and status are safe React text, retaining active/loading state', () => {
  const ui = read('src/renderer-react/instruction-forge-accounts.tsx');
  const renderer = read('src/renderer.js');
  assert.match(ui, /function ForgeAccountTabs\(/);
  assert.match(ui, /function ForgeBrowserStatus\(/);
  assert.match(ui, /account\.active \? ' active' : ''/);
  assert.match(ui, /host\.classList\.toggle\('loading', model\.loading\)/);
  assert.match(ui, /<strong>\{account\.name\}<\/strong>/);
  assert.doesNotMatch(ui, /dangerouslySetInnerHTML|innerHTML\s*=/);
  const tabs = renderer.slice(renderer.indexOf('function renderForgeAccounts()'), renderer.indexOf('function updateForgeBrowserUi('));
  assert.doesNotMatch(tabs, /\.innerHTML\s*=|insertAdjacentHTML\(/);
  assert.match(tabs, /forgeReactAccountsRenderer\(\{/);
  const status = renderer.slice(renderer.indexOf('function updateForgeBrowserUi('), renderer.indexOf('async function selectForgeAccount('));
  assert.doesNotMatch(status, /\.innerHTML\s*=/);
  assert.match(status, /forgeReactStatusRenderer\(statusModel\)/);
  assert.match(status, /text\.textContent = label/);
});

test('Prompt Studio account selection validates the ID and remains owned by the trusted host', () => {
  const renderer = read('src/renderer.js');
  const bridge = renderer.slice(renderer.indexOf('window.MadStationInstructionForgeAccounts = {'), renderer.indexOf('function forgeDisplayIconCandidates'));
  assert.match(bridge, /selectAccount\(id\)[\s\S]*?if \(!forgeAccountForId\(id\)\) return[\s\S]*?selectForgeAccount\(id\)/);
  assert.match(renderer, /async function selectForgeAccount\(accountId[\s\S]*?window\.aiHub\.forgeSetBrowser\(accountId\)/);
  assert.match(renderer, /function forgeDisplayIconCandidates\(account, service\)[\s\S]*?filter\(isImageIcon\)/);
});

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Model Arena management React entry is wired into Vite, HTML, tests and the developer-source package allowlist', () => {
  const vite = read('vite.config.ts');
  const html = read('src/renderer.html');
  const main = read('src/main.js');
  const pkg = JSON.parse(read('package.json'));
  assert.match(vite, /ai-playground-arena-management-react': resolve\(__dirname, 'src\/renderer-react\/ai-playground-arena-management\.tsx'\)/);
  assert.match(html, /src="\.\.\/build\/ai-playground-arena-management-react\.js"/);
  assert.match(pkg.scripts.test, /tests\/renderer-react-arena-management\.test\.js/);
  assert.ok(pkg.build.extraResources.find((entry) => entry.to === 'developer-docs/src').filter.includes('renderer-react/ai-playground-arena-management.tsx'));
  assert.match(main, /src\/renderer-react\/ai-playground-arena-management\.tsx/);
});

test('Model Arena account and scoreboard presentation is React-owned and displays untrusted labels as text', () => {
  const ui = read('src/renderer-react/ai-playground-arena-management.tsx');
  const renderer = read('src/renderer.js');
  assert.match(ui, /function ProviderIcon\(\{ provider \}/, 'ProviderIcon should only declare props it consumes');
  assert.doesNotMatch(ui, /function ProviderIcon\(\{ provider, small = false \}/, 'avoid the unused small prop that triggers TS6133');
  assert.match(ui, /<span className="provider-icon small"><ProviderIcon provider=\{provider\} \/><\/span>/, 'the surrounding wrapper continues to control compact icon sizing');
  assert.match(ui, /function ProviderTiles\(/);
  assert.match(ui, /function ArenaAccountRows\(/);
  assert.match(ui, /function Leaderboard\(/);
  assert.match(ui, /model\.providers\.map\(/);
  assert.match(ui, /model\.accounts\.map\(/);
  assert.match(ui, /rows\.map\(/);
  assert.match(ui, /bridge\.action\('account', account\.id, 'save-rename'/);
  assert.match(renderer, /function renderScoreboard\(\)[\s\S]*?arenaReactScoreboardRenderer\(\{/);
  assert.match(renderer, /function renderArenaAccounts\(\)[\s\S]*?arenaReactAccountsRenderer\(model\)/);
  const oldMarkup = renderer.slice(renderer.indexOf('function renderScoreboard()'), renderer.indexOf('async function arenaAccountAction'));
  assert.doesNotMatch(oldMarkup, /\.innerHTML\s*=|insertAdjacentHTML\(/, 'Arena scoreboard and account rows must no longer be built with HTML strings');
  assert.doesNotMatch(ui, /dangerouslySetInnerHTML|innerHTML\s*=/);
});

test('Model Arena actions route through the renderer host and preserve provider/account identity checks', () => {
  const renderer = read('src/renderer.js');
  const bridge = renderer.slice(renderer.indexOf('window.MadStationArenaManagement = {'), renderer.indexOf('function arenaDisplayIconCandidates'));
  assert.match(bridge, /action === 'filter-provider'[\s\S]*?id !== 'all' && !arenaProviderById\(id\)/);
  assert.match(bridge, /action === 'delete-provider'[\s\S]*?arenaProviderById\(id\)/);
  assert.match(bridge, /action === 'account'[\s\S]*?arenaAccountAction\(operation, id, nextName\)/);
  const accountAction = renderer.slice(renderer.indexOf('async function arenaAccountAction'), renderer.indexOf('async function arenaDeleteProviderAction'));
  assert.match(accountAction, /window\.aiHub\.arenaRenameAccount\(id, name\)/);
  assert.match(accountAction, /window\.aiHub\.arenaResetLogin\(id\)/);
  assert.match(accountAction, /window\.aiHub\.arenaDeleteAccount\(id\)/);
  assert.match(renderer, /function computeArenaBoard\(votes, side\)/);
  assert.match(renderer, /ratePercent: Math\.max\(0, Math\.min\(100/);
});

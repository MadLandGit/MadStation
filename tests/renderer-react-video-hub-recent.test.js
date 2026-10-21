const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Video Hub recent-account chips are included in the Vite build and renderer entry', () => {
  const vite = read('vite.config.ts');
  const html = read('src/renderer.html');
  const pkg = JSON.parse(read('package.json'));
  assert.match(vite, /'video-hub-recent-react': resolve\(__dirname, 'src\/renderer-react\/video-hub-recent\.tsx'\)/);
  assert.match(html, /src="\.\.\/build\/video-hub-recent-react\.js"/);
  assert.match(pkg.scripts.test, /tests\/renderer-react-video-hub-recent\.test\.js/);
  assert.ok(pkg.build.extraResources.some((resource) => resource.from === 'src' && resource.filter?.includes('renderer-react/video-hub-recent.tsx')));
});

test('React recent-account component uses stable IDs, accessible buttons, and text rendering', () => {
  const component = read('src/renderer-react/video-hub-recent.tsx');
  assert.match(component, /createRoot\(host\)/);
  assert.match(component, /key=\{account\.id\}/);
  assert.match(component, /data-video-hub-recent=\{account\.id\}/);
  assert.match(component, /title=\{account\.providerName\}/);
  assert.match(component, /\{account\.name\}/);
  assert.match(component, /type="button"/);
  assert.doesNotMatch(component, /dangerouslySetInnerHTML|\.innerHTML/);
});

test('Video Hub controller publishes recent accounts to React and keeps only a startup fallback', () => {
  const renderer = read('src/renderer.js');
  const helperStart = renderer.indexOf('function getVideoHubRecentItems()');
  const helperEnd = renderer.indexOf('\nfunction renderVideoHubAccounts()', helperStart);
  assert.ok(helperStart >= 0 && helperEnd > helperStart);
  const bridge = renderer.slice(helperStart, helperEnd);
  assert.match(bridge, /videoHubUi\.recent[\s\S]*?filter\(\(account\) => account\.id !== videoHubData\.activeAccountId\)[\s\S]*?slice\(0, 3\)/);
  assert.match(bridge, /videoHubRecentReactRenderer\(\{ items \}\)/);
  assert.match(bridge, /Startup fallback only until the React entry attaches/);
  assert.match(bridge, /window\.MadStationVideoHubRecent =/);
  assert.match(bridge, /attachReactRenderer\(renderer\)[\s\S]*?renderVideoHubRecent\(\)/);
});

test('recent visibility does not depend on asynchronous React child count', () => {
  const renderer = read('src/renderer.js');
  assert.match(renderer, /classList\.toggle\('hidden', !videoHubSettings\.showRecent \|\| Boolean\(query\) \|\| videoHubPinnedOnly \|\| videoHubUi\.provider !== 'all' \|\| getVideoHubRecentItems\(\)\.length === 0\)/);
  const recentBlock = renderer.slice(renderer.indexOf('function renderVideoHubRecent()'), renderer.indexOf('\nfunction renderVideoHubAccounts()', renderer.indexOf('function renderVideoHubRecent()')));
  assert.doesNotMatch(recentBlock, /recent\.children\.length/);
});

test('existing recent-account click delegation remains connected to the native account action', () => {
  const renderer = read('src/renderer.js');
  const clickStart = renderer.indexOf("$('videoHubRecent')?.addEventListener('click'");
  const clickEnd = renderer.indexOf('\n});', clickStart);
  assert.ok(clickStart >= 0 && clickEnd > clickStart);
  const handler = renderer.slice(clickStart, clickEnd);
  assert.match(handler, /event\.target\.closest\('\[data-video-hub-recent\]'\)/);
  assert.match(handler, /videoHubAccountAction\('activate', chip\.dataset\.videoHubRecent\)/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Video Hub provider tiles React entry is included in Vite, HTML, tests, and packaged developer resources', () => {
  const vite = read('vite.config.ts');
  const html = read('src/renderer.html');
  const pkg = JSON.parse(read('package.json'));
  assert.match(vite, /'video-hub-provider-tiles-react': resolve\(__dirname, 'src\/renderer-react\/video-hub-provider-tiles\.tsx'\)/);
  assert.match(html, /src="\.\.\/build\/video-hub-provider-tiles-react\.js"/);
  assert.match(pkg.scripts.test, /tests\/renderer-react-video-hub-provider-tiles\.test\.js/);
  assert.ok(pkg.build.extraResources.some((resource) => resource.from === 'src' && resource.filter?.includes('renderer-react/video-hub-provider-tiles.tsx')));
});

test('Video Hub provider filter tiles use stable React keys and preserve DOM/CSS/event contracts', () => {
  const component = read('src/renderer-react/video-hub-provider-tiles.tsx');
  assert.match(component, /createRoot\(host\)/);
  assert.match(component, /key=\{`\$\{tile\.id\}:\$\{model\.iconGeneration\}`\}/);
  assert.match(component, /className=\{`tile video-hub-provider-filter-tile\$\{selected \? ' selected' : ''\}`\}/);
  assert.match(component, /data-video-hub-provider-filter=\{tile\.id\}/);
  assert.match(component, /iconGeneration: number/);
  assert.match(component, /aria-selected=\{selected\}/);
  assert.match(component, /tile\.iconKind === 'grid' \? <GridIcon \/> : <ProviderIcon tile=\{tile\} \/>/);
  assert.doesNotMatch(component, /dangerouslySetInnerHTML|\.innerHTML/);
});

test('Video Hub controller supplies counts and the saved selected provider to React', () => {
  const renderer = read('src/renderer.js');
  const begin = renderer.indexOf('function renderVideoHubProviderTiles()');
  const end = renderer.indexOf('\nwindow.MadStationVideoHubProviderTiles =', begin);
  const body = renderer.slice(begin, end);
  assert.ok(begin >= 0 && end > begin);
  assert.match(body, /accounts\.forEach\(\(account\) => counts\.set\(account\.providerId/);
  assert.match(body, /selectedProvider: videoHubUi\.provider/);
  assert.match(body, /name: 'All', count: accounts\.length, iconKind: 'grid'/);
  assert.match(body, /videoHubData\.providers\.filter\(\(provider\) => counts\.has\(provider\.id\)\)/);
  assert.match(body, /videoHubIconCandidates\(provider\)\.filter\(isImageIcon\)/);
  assert.match(renderer, /function decorateVideoHub\(\)[\s\S]*?renderVideoHubProviderTiles\(\);/);
});

test('React attachment transfers provider tile children ownership and selection updates use the model bridge', () => {
  const renderer = read('src/renderer.js');
  assert.match(renderer, /window\.MadStationVideoHubProviderTiles = \{[\s\S]*?attachReactRenderer\(renderer\)[\s\S]*?videoHubProviderTilesReactRenderer = renderer;[\s\S]*?renderVideoHubProviderTiles\(\);/);
  assert.match(renderer, /if \(typeof videoHubProviderTilesReactRenderer === 'function'\) \{\s*videoHubProviderTilesReactRenderer\(model\);\s*return;/);
  assert.match(renderer, /if \(typeof videoHubProviderTilesReactRenderer === 'function'\) renderVideoHubProviderTiles\(\);\s*else document\.querySelectorAll\('\[data-video-hub-provider-filter\]'\)/);
  assert.match(renderer, /\$\('videoHubProviderTiles'\)\?\.addEventListener\('click',[\s\S]*?videoHubUi\.provider = tile\.dataset\.videoHubProviderFilter; saveVideoHubUi\(\); applyVideoHubFilters\(\);/);
});

test('Video Hub provider icons retain guarded URL candidates and cache fallback binding', () => {
  const renderer = read('src/renderer.js');
  const component = read('src/renderer-react/video-hub-provider-tiles.tsx');
  assert.match(renderer, /iconCandidates: \[\.\.\.new Set\(\[\.\.\.videoHubIconCandidates\(provider\)\.filter\(isImageIcon\), DEFAULT_ICON_DATA_URL\]\)\]/);
  assert.match(renderer, /bindIconFallbacks\(root\)/);
  assert.match(component, /data-icon-candidates=\{encodeURIComponent\(JSON\.stringify\(candidates\)\)\}/);
  assert.match(component, /referrerPolicy="no-referrer"/);
  assert.match(component, /bridge\.bindIconFallbacks\(host\)/);
});

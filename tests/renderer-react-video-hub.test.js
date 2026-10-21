const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Video Hub quick-start cards React entry is wired into Vite and renderer HTML', () => {
  const vite = read('vite.config.ts');
  const html = read('src/renderer.html');
  const pkg = JSON.parse(read('package.json'));
  assert.match(vite, /'video-hub-sites-react': resolve\(__dirname, 'src\/renderer-react\/video-hub-sites\.tsx'\)/);
  assert.match(html, /src="\.\.\/build\/video-hub-sites-react\.js"/);
  assert.match(pkg.scripts.test, /tests\/renderer-react-video-hub\.test\.js/);
  assert.ok(pkg.build.extraResources.some((resource) => resource.from === 'src' && resource.filter?.includes('renderer-react/video-hub-sites.tsx')));
});

test('Video Hub quick-start cards use React stable provider keys, safe text, and delegated quick-add hooks', () => {
  const component = read('src/renderer-react/video-hub-sites.tsx');
  assert.match(component, /createRoot\(host\)/);
  assert.match(component, /key=\{`\$\{site\.id\}:\$\{model\.iconGeneration\}`\}/);
  assert.match(component, /data-video-hub-site-id=\{site\.id\}/);
  assert.match(component, /data-video-hub-quick-add=\{site\.id\}/);
  assert.match(component, /\{site\.name\}/);
  assert.match(component, /\{site\.note\}/);
  assert.match(component, /site\.count === 1 \? '' : 's'/);
  assert.doesNotMatch(component, /dangerouslySetInnerHTML|\.innerHTML/);
});

test('Video Hub controller publishes a view model and yields the site grid to React after attachment', () => {
  const renderer = read('src/renderer.js');
  const begin = renderer.indexOf('function renderVideoHubSiteGrid()');
  const end = renderer.indexOf('\nwindow.MadStationVideoHubSites =', begin);
  const body = renderer.slice(begin, end);
  assert.ok(begin >= 0 && end > begin);
  assert.match(body, /iconCandidates: \[\.\.\.new Set\(\[\.\.\.videoHubIconCandidates\(provider\)\.filter\(isImageIcon\), DEFAULT_ICON_DATA_URL\]\)\]/);
  assert.match(body, /if \(typeof videoHubSitesReactRenderer === 'function'\) \{[\s\S]*?videoHubSitesReactRenderer\(\{ sites, emptyMessage:[\s\S]*?iconGeneration: videoHubIconSessionGeneration[\s\S]*?return;/);
  assert.match(renderer, /attachReactRenderer\(renderer\)[\s\S]*?videoHubSitesReactRenderer = renderer;[\s\S]*?renderVideoHubSiteGrid\(\);/);
  assert.match(renderer, /\$\('videoHubSiteGrid'\)\?\.addEventListener\('click',[\s\S]*?\[data-video-hub-quick-add\]/);
});

test('Video Hub site icons keep the guarded favicon fallback and cache binder', () => {
  const renderer = read('src/renderer.js');
  const component = read('src/renderer-react/video-hub-sites.tsx');
  assert.match(renderer, /function videoHubIconCandidates\(item\)/);
  assert.match(renderer, /function isImageIcon\(icon\)/);
  assert.match(renderer, /bindIconFallbacks\(root\)/);
  assert.match(component, /data-icon-candidates=\{encodeURIComponent\(JSON\.stringify\(candidates\)\)\}/);
  assert.match(component, /referrerPolicy="no-referrer"/);
  assert.match(component, /bridge\.bindIconFallbacks\(host\)/);
});

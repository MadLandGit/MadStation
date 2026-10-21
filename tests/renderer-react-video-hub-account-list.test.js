const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Video Hub account-list React entry is wired into Vite, renderer HTML, tests, and packaged source guidance', () => {
  const vite = read('vite.config.ts');
  const html = read('src/renderer.html');
  const pkg = JSON.parse(read('package.json'));
  assert.match(vite, /'video-hub-account-list-react': resolve\(__dirname, 'src\/renderer-react\/video-hub-account-list\.tsx'\)/);
  assert.match(html, /src="\.\.\/build\/video-hub-account-list-react\.js"/);
  assert.match(pkg.scripts.test, /tests\/renderer-react-video-hub-account-list\.test\.js/);
  assert.ok(pkg.build.extraResources.some((resource) => resource.from === 'src' && resource.filter?.includes('renderer-react/video-hub-account-list.tsx')));
});

test('Video Hub account list renders account tiles and rename form declaratively with stable keys', () => {
  const component = read('src/renderer-react/video-hub-account-list.tsx');
  assert.match(component, /createRoot\(host\)/);
  assert.match(component, /key=\{`\$\{account\.id\}:\$\{model\.iconGeneration\}`\}/);
  assert.match(component, /data-video-hub-account=\{account\.id\}/);
  assert.match(component, /data-icon-candidates=\{encodeURIComponent\(JSON\.stringify\(candidates\)\)\}/);
  assert.match(component, /data-video-hub-rename=\{account\.id\}/);
  assert.match(component, /video-hub-rename-row--react/);
  assert.match(component, /<span className=\"video-hub-logo\" aria-hidden=\"true\"><AccountIcon account=\{account\} \/><\/span>/);
  assert.match(component, /bridge\.action\('save-rename', account\.id, name\)/);
  assert.match(component, /bridge\.action\('cancel-rename', account\.id\)/);
  assert.match(component, /bridge\.openMenu\(account\.id/);
  assert.ok(component.includes('function AccountTile({ account, model, bridge, popoverVisible, setPopoverId, column, columns }: {'));
  assert.ok(component.includes('  column: number;\n  columns: number;'));
  assert.doesNotMatch(component, /dangerouslySetInnerHTML|\.innerHTML/);
});

test('Video Hub controller hands account-list rendering to React and retains a legacy-only fallback', () => {
  const renderer = read('src/renderer.js');
  const renderBegin = renderer.indexOf('function renderVideoHub()');
  const renderEnd = renderer.indexOf('\nasync function loadVideoHubState()', renderBegin);
  const renderBody = renderer.slice(renderBegin, renderEnd);
  assert.ok(renderBegin >= 0 && renderEnd > renderBegin);
  assert.match(renderBody, /if \(typeof videoHubAccountsReactRenderer !== 'function'\) \{[\s\S]*?accountList\.innerHTML =/);
  assert.match(renderBody, /if \(typeof videoHubAccountsReactRenderer !== 'function'\) restoreIconNodes\(accountList/);

  const bridgeBegin = renderer.indexOf('function renderVideoHubAccounts()');
  const bridgeEnd = renderer.indexOf('\nfunction renderVideoHubProviderTiles()', bridgeBegin);
  const bridgeBody = renderer.slice(bridgeBegin, bridgeEnd);
  assert.ok(bridgeBegin >= 0 && bridgeEnd > bridgeBegin);
  assert.match(bridgeBody, /iconCandidates: \[\.\.\.new Set\(\[\.\.\.videoHubIconCandidates\(account\)\.filter\(isImageIcon\), DEFAULT_ICON_DATA_URL\]\)\]/);
  assert.match(bridgeBody, /query: \(\$\('videoHubSearch'\)\?\.value \|\| ''\)\.trim\(\)\.toLowerCase\(\)/);
  assert.match(bridgeBody, /attachReactRenderer\(renderer\)[\s\S]*?videoHubAccountsReactRenderer = renderer;[\s\S]*?renderVideoHubAccounts\(\)/);
});

test('Video Hub search, provider, pin, rename, and active state are supplied as a model instead of mutating React-owned rows', () => {
  const renderer = read('src/renderer.js');
  const filtersBegin = renderer.indexOf('function applyVideoHubFilters()');
  const filtersEnd = renderer.indexOf('\nfunction applyVideoHubSidebarState()', filtersBegin);
  const filtersBody = renderer.slice(filtersBegin, filtersEnd);
  assert.ok(filtersBegin >= 0 && filtersEnd > filtersBegin);
  assert.match(filtersBody, /if \(typeof videoHubAccountsReactRenderer === 'function'\) \{\s*renderVideoHubAccounts\(\);/);
  assert.match(filtersBody, /getVideoHubFilteredAccounts\(\)\.length > 0/);
  assert.match(filtersBody, /if \(typeof videoHubAccountsReactRenderer === 'function'\) \{[\s\S]*?\} else \{[\s\S]*?row\.classList\.toggle\('hidden', !ok\)/);
  assert.match(renderer, /async function videoHubAccountAction\(action, id, proposedName\)/);
  assert.match(renderer, /typeof proposedName === 'string' \? proposedName : inputName/);
});

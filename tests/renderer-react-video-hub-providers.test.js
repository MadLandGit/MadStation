const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Video Hub provider management React entry is wired into Vite, HTML, tests, and packaged docs', () => {
  const vite = read('vite.config.ts');
  const html = read('src/renderer.html');
  const pkg = JSON.parse(read('package.json'));
  assert.match(vite, /'video-hub-providers-react': resolve\(__dirname, 'src\/renderer-react\/video-hub-providers\.tsx'\)/);
  assert.match(html, /src="\.\.\/build\/video-hub-providers-react\.js"/);
  assert.match(pkg.scripts.test, /tests\/renderer-react-video-hub-providers\.test\.js/);
  assert.ok(pkg.build.extraResources.some((resource) => resource.from === 'src' && resource.filter?.includes('renderer-react/video-hub-providers.tsx')));
});

test('React provider rows preserve existing classes, stable IDs, and safe text rendering', () => {
  const component = read('src/renderer-react/video-hub-providers.tsx');
  assert.match(component, /createRoot\(host\)/);
  assert.match(component, /className="ms-row video-hub-provider-row"/);
  assert.match(component, /data-video-hub-provider-id=\{provider\.id\}/);
  assert.match(component, /key=\{`\$\{provider\.id\}:\$\{model\.iconGeneration\}`\}/);
  assert.match(component, /\{provider\.name\}/);
  assert.match(component, /\{provider\.note \|\| provider\.url\}/);
  assert.doesNotMatch(component, /dangerouslySetInnerHTML|\.innerHTML/);
});

test('built-in providers cannot be removed from the React provider manager', () => {
  const component = read('src/renderer-react/video-hub-providers.tsx');
  assert.match(component, /!provider\.builtin \?\s*\(/);
  assert.match(component, /aria-label=\{`Remove \$\{provider\.name\}`\}/);
  assert.match(component, /bridge\.removeProvider\(provider\.id\)/);
  const renderer = read('src/renderer.js');
  assert.match(renderer, /async function deleteVideoHubProvider\(id\)[\s\S]*?if \(!provider \|\| provider\.builtin\) return;/);
});

test('controller publishes validated icon candidates and hands provider-list ownership to React', () => {
  const renderer = read('src/renderer.js');
  const start = renderer.indexOf('function renderVideoHubProviders()');
  const end = renderer.indexOf('\nwindow.MadStationVideoHubProviders =', start);
  assert.ok(start >= 0 && end > start);
  const body = renderer.slice(start, end);
  assert.match(body, /id: String\(provider\.id\)/);
  assert.match(body, /iconCandidates: \[\.\.\.new Set\(\[\.\.\.videoHubIconCandidates\(provider\)\.filter\(isImageIcon\), DEFAULT_ICON_DATA_URL\]\)\]/);
  assert.match(body, /videoHubProvidersReactRenderer\(\{ providers, iconGeneration: videoHubIconSessionGeneration \}\)/);
  assert.match(renderer, /window\.MadStationVideoHubProviders = \{[\s\S]*?attachReactRenderer\(renderer\)[\s\S]*?renderVideoHubProviders\(\)/);
  assert.match(renderer, /bindIconFallbacks\(root\)/);
});

test('legacy provider-list renderer is only a startup fallback after React claims the root', () => {
  const renderer = read('src/renderer.js');
  assert.match(renderer, /if \(typeof videoHubProvidersReactRenderer === 'function'\) \{\s*renderVideoHubProviders\(\);\s*\} else \{[\s\S]*?providerList\.innerHTML = videoHubData\.providers\.map/);
  assert.match(renderer, /if \(providerList && typeof videoHubProvidersReactRenderer !== 'function'\) restoreIconNodes/);
  assert.match(renderer, /removeProvider\(id\) \{\s*return deleteVideoHubProvider\(id\);/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Image Hub browser toolbar is a single React-owned mount point', () => {
  const html = read('src/renderer.html');
  const vite = read('vite.config.ts');
  const pkg = JSON.parse(read('package.json'));
  const component = read('src/renderer-react/image-hub-workspace-toolbar.tsx');
  assert.match(html, /<div class="ms-browser-toolbar image-hub-browser-toolbar" id="imageHubBrowserToolbar" role="toolbar" aria-label="Image studio browser controls"><\/div>/);
  assert.match(html, /\.\.\/build\/image-hub-workspace-toolbar-react\.js/);
  assert.match(vite, /'image-hub-workspace-toolbar-react': resolve\(__dirname, 'src\/renderer-react\/image-hub-workspace-toolbar\.tsx'\)/);
  assert.ok(pkg.build.extraResources.some((resource) => resource.from === 'src' && resource.filter?.includes('renderer-react/image-hub-workspace-toolbar.tsx')));
  assert.match(pkg.scripts.test, /renderer-react-image-hub-workspace-toolbar\.test\.js/);
  for (const id of ['imageHubBrowserBack', 'imageHubBrowserForward', 'imageHubBrowserReload', 'imageHubActiveIcon', 'imageHubActiveSecurity', 'imageHubActiveSite', 'imageHubActiveLabel', 'imageHubBrowserExternal']) {
    assert.match(component, new RegExp(`id="${id}"`), `${id} remains stable`);
  }
  assert.doesNotMatch(html, /id="imageHubBrowserBack"/, 'static toolbar children were removed');
});

test('React toolbar renders host-provided account, URL parts, loading, and security state safely', () => {
  const component = read('src/renderer-react/image-hub-workspace-toolbar.tsx');
  const renderer = read('src/renderer.js');
  assert.match(component, /<strong>\{model\.siteHost\}<\/strong>/);
  assert.match(component, /\{model\.siteRest\}/);
  assert.match(component, /model\.secure === false \? ' is-insecure' : ''/);
  assert.match(component, /model\.loading \? 'Stop loading' : 'Refresh page'/);
  assert.match(component, /data-icon-candidates=\{encodeURIComponent\(JSON\.stringify\(candidates\)\)\}/);
  assert.match(component, /bridge\.bindIconFallbacks\(root\)/);
  assert.match(renderer, /siteHost: parts\?\.host \|\| ''/);
  assert.match(renderer, /siteRest: parts\?\.rest \|\| ''/);
  assert.match(renderer, /iconCandidates: account \? imageHubSafeIconCandidates\(account\) : \[\]/);
  assert.match(renderer, /window\.addEventListener\('madstation:image-hub-toolbar-mounted', \(\) => imageHubUpdateToolbar\(\)\)/);
});

test('React toolbar actions are allowlisted and external open remains HTTPS-only', () => {
  const component = read('src/renderer-react/image-hub-workspace-toolbar.tsx');
  const renderer = read('src/renderer.js');
  assert.match(component, /'back' \| 'forward' \| 'reload' \| 'open-external'/);
  assert.match(renderer, /!\['back', 'forward', 'reload', 'stop', 'open-external'\]\.includes\(action\) \|\| !imageHubNativeBrowserAvailable/);
  assert.match(renderer, /window\.aiHub\.imageHubBrowserNavigate\(action\)/);
  assert.match(read('src/main/image-hub-browser-runtime.ts'), /parsed\.protocol !== 'https:'/);
  for (const id of ['imageHubBrowserBack', 'imageHubBrowserForward', 'imageHubBrowserReload', 'imageHubBrowserExternal']) {
    assert.doesNotMatch(renderer, new RegExp(`\\$\\('${id}'\\)\\.onclick`), `${id} no longer has a direct legacy click writer`);
  }
});

test('Navigation status refreshes on page navigation, load, failure, and title changes', () => {
  const renderer = read('src/renderer.js');
  const main = read('src/main.js');
  assert.match(renderer, /imageHubCurrentTitle = '';[\s\S]*?imageHubUpdateToolbar\(\)/);
  assert.match(main, /did-start-loading'[\s\S]*imageHubBrowserRuntime\.reportLoading\(true\)/);
  assert.match(main, /did-stop-loading'[\s\S]*imageHubBrowserRuntime\.reportLoading\(false\)/);
  assert.match(main, /did-navigate'[\s\S]*imageHubBrowserRuntime\.reportNavigation\(\)/);
  assert.match(main, /page-title-updated'[\s\S]*imageHubBrowserRuntime\.reportTitle\(\)/);
  assert.match(renderer, /window\.aiHub\.onImageHubBrowserState\(\(snapshot\) =>/);
  assert.match(renderer, /canGoBack: has && imageHubBrowserCanGoBack/);
  assert.match(renderer, /canGoForward: has && imageHubBrowserCanGoForward/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Image Hub discovery React entry is included in Vite, renderer HTML, package tests and developer source allowlist', () => {
  const vite = read('vite.config.ts');
  const html = read('src/renderer.html');
  const pkg = JSON.parse(read('package.json'));
  const main = read('src/main.js');
  assert.match(vite, /'image-hub-discovery-react': resolve\(__dirname, 'src\/renderer-react\/image-hub-discovery\.tsx'\)/);
  assert.match(html, /src="\.\.\/build\/image-hub-discovery-react\.js"/);
  assert.equal([...html.matchAll(/src="\.\.\/build\/image-hub-discovery-react\.js"/g)].length, 1, 'discovery bundle is loaded exactly once');
  assert.match(pkg.scripts.test, /tests\/renderer-react-image-hub-discovery\.test\.js/);
  const sourceRule = pkg.build.extraResources.find((item) => item.from === 'src' && Array.isArray(item.filter));
  assert.ok(sourceRule?.filter.includes('renderer-react/image-hub-discovery.tsx'));
  assert.match(main, /DEVELOPER_FILES = new Set\([\s\S]*?'src\/renderer-react\/image-hub-discovery\.tsx'/);
});

test('Image Hub discovery panel is the single owner of tool cards, category filters and add forms', () => {
  const html = read('src/renderer.html');
  const component = read('src/renderer-react/image-hub-discovery.tsx');
  assert.match(html, /id="imageHubCategoryFiltersReactMount"/);
  assert.match(html, /id="imageHubDiscoveryReactMount"/);
  for (const id of ['imageHubGrid', 'imageHubAddForm', 'imageHubNewProvider', 'imageHubNewName', 'imageHubCustomName', 'imageHubCustomUrl', 'imageHubAddAccountBtn']) {
    assert.doesNotMatch(html, new RegExp(`id="${id}"`));
  }
  assert.match(component, /function CategoryFilters/);
  assert.match(component, /function ToolCard/);
  assert.match(component, /function ImageHubDiscovery/);
  assert.match(component, /data-image-add-account=\{tool\.id\}/);
  assert.match(component, /data-image-fav=\{tool\.id\}/);
  assert.match(component, /data-image-remove=\{tool\.id\}/);
  assert.doesNotMatch(component, /dangerouslySetInnerHTML|\.innerHTML|localStorage|window\.aiHub/);
});

test('Image Hub discovery actions use a bounded typed custom-event contract', () => {
  const component = read('src/renderer-react/image-hub-discovery.tsx');
  const renderer = read('src/renderer.js');
  assert.match(component, /type ImageHubDiscoveryAction =/);
  assert.match(component, /madstation:image-hub-discovery-action/);
  assert.match(renderer, /function imageHubDiscoveryViewModel\(\)/);
  assert.match(renderer, /window\.addEventListener\('madstation:image-hub-discovery-action', imageHubHandleDiscoveryAction\)/);
  assert.match(renderer, /if \(action\.type === 'category'\)[\s\S]*?\['all', 'generate', 'edit', 'upscale'\]\.includes\(action\.category\)/);
  assert.match(renderer, /if \(action\.type === 'add-account'\)[\s\S]*?imageHubProvider\(action\.providerId\)/);
  assert.match(renderer, /if \(action\.type === 'add-custom-tool'\)[\s\S]*?parsed\.protocol !== 'https:'[\s\S]*?parsed\.username \|\| parsed\.password/);
  assert.match(renderer, /if \(action\.type === 'remove-custom-tool'\)[\s\S]*?target\.custom !== true[\s\S]*?window\.confirm\('Remove this custom image tool\?'\)/);
});

test('Image Hub tool view model retains favorites ordering, category/search filtering and account counts', () => {
  const renderer = read('src/renderer.js');
  assert.match(renderer, /function imageHubDiscoveryViewModel\(\)[\s\S]*?imageHubTools\(\)/);
  assert.match(renderer, /imageHubFilter === 'all' \|\| category === imageHubFilter/);
  assert.match(renderer, /\.toLowerCase\(\)\.includes\(query\)/);
  assert.match(renderer, /settings\.favoritesFirst !== false\) filtered\.sort/);
  assert.match(renderer, /accountCount: counts\.get\(tool\.id\) \|\| 0/);
  assert.match(renderer, /imageHubDiscoveryReactRenderer\(imageHubDiscoveryViewModel\(\)\)/);
  assert.doesNotMatch(renderer, /grid\.innerHTML = filtered\.map\(card\)/);
  assert.doesNotMatch(renderer, /\$\('imageHubAddForm'\)\.onsubmit/);
  assert.doesNotMatch(renderer, /\$\('imageHubGrid'\)\.onclick/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Image Hub settings dialog is wired into the renderer bundle and packaged developer sources', () => {
  const html = read('src/renderer.html');
  const vite = read('vite.config.ts');
  const pkg = JSON.parse(read('package.json'));
  const main = read('src/main.js');
  assert.match(html, /id="imageHubSettingsReactMount"/);
  assert.match(html, /src="\.\.\/build\/image-hub-settings-react\.js"/);
  assert.match(vite, /'image-hub-settings-react': resolve\(__dirname, 'src\/renderer-react\/image-hub-settings\.tsx'\)/);
  assert.ok(pkg.build.extraResources.some((resource) => resource.from === 'src' && resource.filter?.includes('renderer-react/image-hub-settings.tsx')));
  assert.match(main, /'src\/renderer-react\/image-hub-settings\.tsx'/);
  assert.match(pkg.scripts.test, /renderer-react-image-hub-settings\.test\.js/);
});

test('React owns the Image Hub settings inputs and emits a bounded settings action', () => {
  const html = read('src/renderer.html');
  const component = read('src/renderer-react/image-hub-settings.tsx');
  assert.doesNotMatch(html, /id="(?:imageHubFavoritesFirst|imageHubAccountView|imageHubConfirmRemove)"/);
  assert.match(component, /checked=\{model\.favoritesFirst\}/);
  assert.match(component, /checked=\{model\.accountView === 'grid'\}/);
  assert.match(component, /checked=\{model\.confirmRemove\}/);
  assert.match(component, /madstation:image-hub-settings-action/);
  assert.match(component, /madstation:image-hub-settings-mounted/);
  assert.doesNotMatch(component, /localStorage|window\.aiHub|dangerouslySetInnerHTML|\.innerHTML/);
});

test('The host remains responsible for persistence, validation, refresh and focus restoration', () => {
  const renderer = read('src/renderer.js');
  assert.match(renderer, /function imageHubCurrentSettings\(\)/);
  assert.match(renderer, /function openImageHubSettings\(\)/);
  assert.match(renderer, /function closeImageHubSettings\(\)/);
  assert.match(renderer, /function commitImageHubSettings\(settings\)[\s\S]*typeof settings\.favoritesFirst !== 'boolean'[\s\S]*imageHubSave\('madstation\.imageHub\.settings\.v1'/);
  assert.match(renderer, /madstation:image-hub-settings-action[\s\S]*action\.type === 'save'[\s\S]*commitImageHubSettings\(action\.settings\)/);
  assert.match(renderer, /syncOverlayMode\(\)/);
});

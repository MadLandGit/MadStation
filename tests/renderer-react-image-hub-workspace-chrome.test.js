const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Image Hub workspace chrome is included in Vite, renderer HTML, and packaged developer sources', () => {
  const html = read('src/renderer.html');
  const vite = read('vite.config.ts');
  const pkg = JSON.parse(read('package.json'));
  assert.match(html, /id="imageHubWorkspaceChromeReactMount"/);
  assert.match(html, /src="\.\.\/build\/image-hub-workspace-chrome-react\.js"/);
  assert.match(vite, /'image-hub-workspace-chrome-react': resolve\(__dirname, 'src\/renderer-react\/image-hub-workspace-chrome\.tsx'\)/);
  assert.ok(pkg.build.extraResources.some((resource) => resource.from === 'src' && resource.filter?.includes('renderer-react/image-hub-workspace-chrome.tsx')));
  assert.match(pkg.scripts.test, /renderer-react-image-hub-workspace-chrome\.test\.js/);
});

test('React owns the Image Hub workspace header and accessible tab controls', () => {
  const html = read('src/renderer.html');
  const component = read('src/renderer-react/image-hub-workspace-chrome.tsx');
  assert.doesNotMatch(html, /<header class="ms-header image-hub-header">/);
  assert.match(component, /<header className="ms-header image-hub-header">/);
  assert.match(component, /id="imageHubSidebarToggle"/);
  assert.match(component, /role="tablist" aria-label="Image Hub sections"/);
  assert.match(component, /aria-selected=\{model\.tab === 'studio'\}/);
  assert.match(component, /aria-selected=\{model\.tab === 'accounts'\}/);
  assert.doesNotMatch(component, /dangerouslySetInnerHTML|\.innerHTML/);
});

test('workspace chrome events are narrow and host-validated; host remains owner of panels/sidebar state', () => {
  const component = read('src/renderer-react/image-hub-workspace-chrome.tsx');
  const renderer = read('src/renderer.js');
  assert.match(component, /type ImageHubWorkspaceChromeAction[\s\S]*select-tab[\s\S]*toggle-sidebar/);
  assert.match(component, /madstation:image-hub-workspace-chrome-action/);
  assert.match(renderer, /function imageHubHandleWorkspaceChromeAction\(event\)[\s\S]*detail\.type === 'select-tab'[\s\S]*detail\.tab === 'studio'[\s\S]*detail\.tab === 'accounts'[\s\S]*detail\.type === 'toggle-sidebar'/);
  assert.match(renderer, /function imageHubSetTab\(tab\)[\s\S]*if \(tab !== 'studio' && tab !== 'accounts'\) return;[\s\S]*data-image-hub-panel/);
  assert.match(renderer, /function imageHubApplySidebar\(\)[\s\S]*classList\.toggle\('is-collapsed', imageHubUi\.collapsed\)/);
  assert.match(renderer, /madstation:image-hub-workspace-chrome-mounted/);
  assert.doesNotMatch(renderer, /document\.querySelectorAll\('\[data-image-hub-tab\]'\)/);
});

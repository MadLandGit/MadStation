const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Image Hub sidebar chrome and brand have React portals wired through Vite, HTML and packaging', () => {
  const html = read('src/renderer.html');
  const vite = read('vite.config.ts');
  const pkg = JSON.parse(read('package.json'));
  const main = read('src/main.js');
  assert.match(html, /id="imageHubSidebarBrandReactMount"/);
  assert.match(html, /id="imageHubSidebarActionsReactMount"/);
  assert.match(html, /id="imageHubSearchReactMount"/);
  assert.match(html, /id="imageHubSidebarListHeadingReactMount"/);
  assert.match(html, /src="\.\.\/build\/image-hub-sidebar-chrome-react\.js"/);
  assert.match(vite, /'image-hub-sidebar-chrome-react': resolve\(__dirname, 'src\/renderer-react\/image-hub-sidebar-chrome\.tsx'\)/);
  assert.ok(pkg.build.extraResources.some((resource) => resource.from === 'src' && resource.filter?.includes('renderer-react/image-hub-sidebar-chrome.tsx')));
  assert.match(main, /'src\/renderer-react\/image-hub-sidebar-chrome\.tsx'/);
});

test('Search, sidebar actions, brand and keyboard affordances are React-owned', () => {
  const html = read('src/renderer.html');
  const component = read('src/renderer-react/image-hub-sidebar-chrome.tsx');
  assert.doesNotMatch(html, /id="imageHub(?:BackBtn|SettingsBtn|NotificationsBtn|HideSidebarBtn|Search|SearchClear|SearchKbd|ListTitle|AccountCount)"/);
  assert.match(component, /function SidebarBrand\(\)/);
  assert.match(component, /id="imageHubBackBtn"/);
  assert.match(component, /id="imageHubSettingsBtn"/);
  assert.match(component, /id="imageHubNotificationsBtn"/);
  assert.match(component, /id="imageHubSearch"/);
  assert.match(component, /open-first-result/);
  assert.match(component, /madstation:image-hub-sidebar-chrome-action/);
  assert.doesNotMatch(component, /localStorage|window\.aiHub|dangerouslySetInnerHTML|\.innerHTML/);
});

test('Host validates sidebar actions and holds application navigation and filtering', () => {
  const renderer = read('src/renderer.js');
  assert.match(renderer, /function imageHubHandleSidebarChromeAction\(event\)/);
  assert.match(renderer, /action\.type === 'search'[\s\S]*imageHubSearchQuery = action\.value\.slice\(0, 200\)/);
  assert.match(renderer, /action\.type === 'settings'[\s\S]*openImageHubSettings\(\)/);
  assert.match(renderer, /action\.type === 'notifications'[\s\S]*openNotifications/);
  assert.match(renderer, /action\.type === 'back'[\s\S]*goToLauncher/);
  assert.match(renderer, /action\.type === 'open-first-result'[\s\S]*#imageHubAccountList/);
  assert.doesNotMatch(renderer, /\$\('imageHubSearch'\)\.onkeydown/);
});

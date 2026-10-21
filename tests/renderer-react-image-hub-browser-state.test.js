const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Image Hub browser state React entry and mount are packaged', () => {
  const html = read('src/renderer.html');
  const vite = read('vite.config.ts');
  const pkg = JSON.parse(read('package.json'));
  const main = read('src/main.js');
  assert.match(html, /id="imageHubBrowserStateReactMount"/);
  assert.match(html, /src="\.\.\/build\/image-hub-browser-state-react\.js"/);
  assert.match(vite, /'image-hub-browser-state-react': resolve\(__dirname, 'src\/renderer-react\/image-hub-browser-state\.tsx'\)/);
  assert.ok(pkg.build.extraResources.some((resource) => resource.from === 'src' && resource.filter?.includes('renderer-react/image-hub-browser-state.tsx')));
  assert.match(main, /'src\/renderer-react\/image-hub-browser-state\.tsx'/);
});

test('React renders empty/loading/error states from a serializable host event and exposes retry only for error', () => {
  const component = read('src/renderer-react/image-hub-browser-state.tsx');
  assert.match(component, /window\.addEventListener\('madstation:image-hub-browser-state', onState\);[\s\S]*window\.dispatchEvent\(new Event\('madstation:image-hub-browser-state-mounted'\)\)/);
  assert.match(component, /madstation:image-hub-browser-state/);
  assert.match(component, /kind === 'ready'.*return null/s);
  assert.match(component, /role=\{error \? 'alert' : 'status'\}/);
  assert.match(component, /madstation:image-hub-browser-state-action/);
  assert.match(component, /type: 'retry'/);
  assert.doesNotMatch(component, /localStorage|window\.aiHub|\.innerHTML|<webview/);
});

test('Host opens Image Hub through the hardened native WebContentsView bridge and publishes state', () => {
  const renderer = read('src/renderer.js');
  assert.match(renderer, /function imageHubSetBrowserState\(kind, title, message\)/);
  assert.match(renderer, /madstation:image-hub-browser-state-mounted/);
  assert.match(renderer, /madstation:image-hub-browser-state-action[\s\S]*type !== 'retry'/);
  assert.match(renderer, /function imageHubSafeHttpsUrl\(raw\)[\s\S]*parsed\.protocol !== 'https:'[\s\S]*parsed\.username \|\| parsed\.password/);
  const main = read('src/main.js');
  const sessionRuntime = read('src/main/session-lifecycle-runtime.ts');
  assert.match(renderer, /function imageHubMountBrowser\(account, rawUrl\)[\s\S]*imageHubSafeHttpsUrl\(String\(rawUrl \|\| ''\)\)[\s\S]*imageHubBrowserOpen/);
  assert.doesNotMatch(renderer, /document\.createElement\(['\"]webview['\"]\)/, 'Image Hub does not use the globally disabled webview tag');
  assert.match(main, /new WebContentsView\(\{ webPreferences: \{ \.\.\.SAFE_WEB_PREFERENCES, session: sess \} \}\)/);
  assert.match(main, /view\.webContents\.on\('did-fail-load'/);
  assert.match(main, /getImageHubSession\(runtimeAccount\)/);
  assert.match(sessionRuntime, /persist:image-hub-\$\{account\.id\}/);
  assert.match(main, /hardenAccountContents\(view\.webContents, runtimeAccount, sess\)/);
});

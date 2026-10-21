const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Video Hub browser placeholder React entry is wired and included in source packaging', () => {
  const html = read('src/renderer.html');
  const vite = read('vite.config.ts');
  const pkg = JSON.parse(read('package.json'));
  assert.match(html, /id="videoHubBrowserStateReactMount"/);
  assert.match(html, /\.\.\/build\/video-hub-browser-state-react\.js/);
  assert.match(vite, /'video-hub-browser-state-react': resolve\(__dirname, 'src\/renderer-react\/video-hub-browser-state\.tsx'\)/);
  assert.ok(pkg.build.extraResources.some((resource) => resource.from === 'src' && resource.filter?.includes('renderer-react/video-hub-browser-state.tsx')));
  assert.match(pkg.scripts.test, /tests\/renderer-react-video-hub-browser-state\.test\.js/);
});

test('React owns the placeholder presentation and accepts only a boolean browser-state field', () => {
  const component = read('src/renderer-react/video-hub-browser-state.tsx');
  assert.match(component, /typeof candidate\.hasActiveAccount !== 'boolean'/);
  assert.match(component, /if \(state\.hasBrowserView\) return null/);
  assert.match(component, /hasBrowserView: candidate\.hasBrowserView === true/);
  assert.match(component, /madstation:video-hub-browser-state-action/);
  assert.match(component, /Try again/);
  assert.match(component, /className=\{`video-hub-browser-placeholder/);
  assert.match(component, /role=\{failed \? 'alert' : 'status'\} aria-live="polite"/);
  assert.doesNotMatch(component, /window\.aiHub|<webview|localStorage|sessionStorage|dangerouslySetInnerHTML|\.innerHTML/);
});

test('Host hides the legacy fallback only after React mount and preserves active-account ownership', () => {
  const renderer = read('src/renderer.js');
  assert.match(renderer, /window\.addEventListener\('madstation:video-hub-browser-state-mounted'[\s\S]*videoHubBrowserStateReactMounted = true[\s\S]*fallback\.hidden = true[\s\S]*publishVideoHubBrowserState\(Boolean\(videoHubAccountForId\(videoHubData\.activeAccountId\)\)\)/);
  assert.match(renderer, /if \(videoHubBrowserStateReactMounted\) publishVideoHubBrowserState\(Boolean\(active\)\);\s*else \$\('videoHubBrowserPlaceholder'\)\?\.classList\.toggle\('hidden', Boolean\(active\)\)/);
  assert.match(renderer, /function publishVideoHubBrowserState\(hasActiveAccount\)[\s\S]*hasActiveAccount: Boolean\(hasActiveAccount\)[\s\S]*hasBrowserView:[\s\S]*error:[\s\S]*loading:/);
  assert.match(renderer, /videoHubBrowserStatus = \{ accountId: payload\.accountId, hasBrowserView: payload\.hasBrowserView/);
});

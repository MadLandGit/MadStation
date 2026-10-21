const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Video Hub workspace chrome is mounted as three React-owned regions', () => {
  const html = read('src/renderer.html');
  const vite = read('vite.config.ts');
  const pkg = JSON.parse(read('package.json'));
  const module = read('src/renderer-react/video-hub-workspace-chrome.tsx');
  for (const id of ['videoHubHeaderReactMount', 'videoHubBrowserToolbarReactMount', 'videoHubStatsReactMount']) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} is a stable React mount point`);
  }
  const toolbarStart = html.indexOf('id="videoHubBrowserToolbarReactMount"');
  const slotStart = html.indexOf('id="videoHubBrowserSlot"');
  assert.ok(toolbarStart >= 0 && slotStart > toolbarStart, 'native WebContentsView slot remains after the React toolbar mount');
  assert.match(vite, /'video-hub-workspace-chrome-react': resolve\(__dirname, 'src\/renderer-react\/video-hub-workspace-chrome\.tsx'\)/);
  assert.match(html, /\.\.\/build\/video-hub-workspace-chrome-react\.js/);
  assert.ok(pkg.build.extraResources.some((resource) => resource.from === 'src' && resource.filter?.includes('renderer-react/video-hub-workspace-chrome.tsx')));
  assert.match(pkg.scripts.test, /renderer-react-video-hub-workspace-chrome\.test\.js/);
  assert.match(module, /createRoot\(headerHost\)/);
  assert.match(module, /createRoot\(toolbarHost\)/);
  assert.match(module, /createRoot\(statsHost\)/);
});

test('React Video Hub header preserves tabs and sidebar state accessibly', () => {
  const component = read('src/renderer-react/video-hub-workspace-chrome.tsx');
  const renderer = read('src/renderer.js');
  assert.match(component, /role="tablist" aria-label="Video Hub sections"/);
  assert.match(component, /data-video-hub-tab="studio"/);
  assert.match(component, /data-video-hub-tab="accounts"/);
  assert.match(component, /aria-selected=\{model\.activeTab === 'studio'\}/);
  assert.match(component, /aria-pressed=\{model\.collapsed\}/);
  assert.match(renderer, /function setVideoHubTab\(tab\)[\s\S]*videoHubActiveTab = tab[\s\S]*renderVideoHubWorkspaceChrome\(\)/);
  assert.match(renderer, /action === 'tab' && \(value === 'studio' \|\| value === 'accounts'\)/, 'host validates tabs before applying them');
  assert.doesNotMatch(renderer, /document\.querySelectorAll\('\[data-video-hub-tab\]'\)\.forEach\(\(button\)/, 'legacy imperative tab listeners are removed');
  assert.doesNotMatch(renderer, /\$\('videoHubSidebarToggle'\)\?\.addEventListener/, 'legacy sidebar-toggle listener is removed');
});

test('React browser toolbar presents host-supplied active account and validates navigation actions', () => {
  const component = read('src/renderer-react/video-hub-workspace-chrome.tsx');
  const renderer = read('src/renderer.js');
  assert.match(component, /data-video-hub-nav=\{action\}/);
  assert.match(component, /disabled=\{!active\}/);
  assert.match(component, /id="videoHubActiveIcon"/);
  assert.match(component, /id="videoHubActiveSite"/);
  assert.match(component, /id="videoHubActiveLabel"/);
  assert.match(component, /id="videoHubOpenExternalBtn"/);
  assert.match(renderer, /action === 'navigate' && \(value === 'back' \|\| value === 'forward' \|\| value === 'refresh'\)/);
  assert.match(renderer, /action === 'open-external' && videoHubAccountForId\(videoHubData\.activeAccountId\)/);
  assert.doesNotMatch(renderer, /document\.querySelectorAll\('\[data-video-hub-nav\]'\)\.forEach\(\(button\)/, 'old direct navigation button listeners are removed');
  assert.doesNotMatch(renderer, /\$\('videoHubOpenExternalBtn'\)\?\.addEventListener/, 'old direct external-open listener is removed');
  assert.match(renderer, /hostname,\n    iconCandidates:/, 'view model exposes hostname rather than the complete account URL');
  assert.match(component, /bridge\.bindIconFallbacks\(root\)/, 'active account logo retains the existing icon fallback behavior');
});

test('Video Hub account and pinned summary counters are React view-model values', () => {
  const component = read('src/renderer-react/video-hub-workspace-chrome.tsx');
  const renderer = read('src/renderer.js');
  assert.match(component, /id="videoHubStatAccounts">\{model\.accountCount\}/);
  assert.match(component, /id="videoHubStatSites">\{model\.providerCount\}/);
  assert.match(component, /id="videoHubStatPinned">\{model\.pinnedCount\}/);
  assert.match(component, /root\.classList\.toggle\('is-loading', model\.loading\)/, 'Video Hub uses the shared progress bar while its active WebContentsView loads');
  assert.match(component, /root\.setAttribute\('aria-busy', String\(model\.loading\)\)/);
  assert.match(renderer, /onVideoHubBrowserLoading\(\(payload\) =>/);
  assert.match(renderer, /loading: Boolean\(activeAccount && videoHubBrowserLoading && videoHubBrowserLoadingAccountId === activeAccount\.id\)/);
  assert.match(renderer, /accountCount: videoHubData\.accounts\.length/);
  assert.match(renderer, /providerCount: videoHubData\.providers\.length/);
  assert.match(renderer, /pinnedCount: videoHubUi\.pinned\.length/);
  assert.doesNotMatch(renderer, /setText\('videoHubStat(?:Accounts|Sites|Pinned)'/, 'legacy stats text writer is removed');
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Video Hub add-account workflow is rendered by React and included in production/developer resources', () => {
  const html = read('src/renderer.html');
  const vite = read('vite.config.ts');
  const pkg = JSON.parse(read('package.json'));
  const resources = pkg.build.extraResources.find((item) => item.to === 'developer-docs/src');
  const component = read('src/renderer-react/video-hub-setup-forms.tsx');
  assert.match(html, /id="videoHubAddAccountReactMount"/);
  assert.match(html, /id="videoHubAddSiteReactMount"/);
  assert.match(html, /build\/video-hub-setup-forms-react\.js/);
  assert.match(vite, /'video-hub-setup-forms-react': resolve\(__dirname, 'src\/renderer-react\/video-hub-setup-forms\.tsx'\)/);
  assert.ok(resources.filter.includes('renderer-react/video-hub-setup-forms.tsx'));
  assert.match(pkg.scripts.test, /tests\/renderer-react-video-hub-setup-forms\.test\.js/);
  for (const id of ['videoHubNewProvider', 'videoHubNewName', 'videoHubAddAccountBtn', 'videoHubNewProviderName', 'videoHubNewProviderUrl', 'videoHubNewProviderIcon', 'videoHubAddProviderForm']) assert.ok(component.includes(`id="${id}"`));
  assert.doesNotMatch(component, /dangerouslySetInnerHTML|\.innerHTML/);
});

test('React add-account form sends only its visible form values across the host bridge', () => {
  const component = read('src/renderer-react/video-hub-setup-forms.tsx');
  const host = read('src/renderer.js');
  assert.match(component, /madstation:video-hub-add-account-action/);
  assert.match(component, /detail: \{ providerId, name: name\.trim\(\) \}/);
  assert.match(component, /madstation:video-hub-add-account-success/);
  assert.match(component, /madstation:video-hub-add-account-select-provider/);
  assert.match(component, /id="videoHubAddSiteReactMount"|getElementById\('videoHubAddSiteReactMount'\)/);
  assert.match(component, /madstation:video-hub-add-provider-action/);
  assert.match(component, /madstation:video-hub-add-site-success/);
  assert.match(host, /window\.MadStationVideoHubAddAccount = \{[\s\S]*?attachReactRenderers\(accountRenderer, siteRenderer\)/);
  assert.match(host, /typeof detail\.providerId !== 'string' \|\| typeof detail\.name !== 'string'/);
  assert.match(host, /videoHubProviderForId\(providerId\)/);
  assert.match(host, /window\.aiHub\.videoHubAddAccount\(\{ providerId, name \}\)/);
  assert.match(host, /window\.aiHub\.videoHubAddProvider\(payload\)/);
  assert.match(host, /typeof detail\.name !== 'string' \|\| typeof detail\.url !== 'string' \|\| typeof detail\.icon !== 'string'/);
});

test('Video Hub provider options use safe text nodes while React owns the primary form presentation', () => {
  const host = read('src/renderer.js');
  const start = host.indexOf('function renderVideoHub()');
  const end = host.indexOf('\nasync function loadVideoHubState()', start);
  assert.ok(start >= 0 && end > start);
  const render = host.slice(start, end);
  assert.match(render, /option\.textContent = String\(provider\.name\)/);
  assert.match(render, /providerSelect\.replaceChildren\(\.\.\.options\)/);
  assert.doesNotMatch(render, /providerSelect\.innerHTML\s*=/);
  assert.match(render, /typeof videoHubAddAccountReactRenderer !== 'function'/);
});

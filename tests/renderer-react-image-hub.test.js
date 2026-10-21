const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Image Hub sidebar React entry is included in renderer HTML and Vite build', () => {
  const vite = read('vite.config.ts');
  const html = read('src/renderer.html');
  const pkg = JSON.parse(read('package.json'));
  assert.match(vite, /'image-hub-sidebar-react': resolve\(__dirname, 'src\/renderer-react\/image-hub-sidebar\.tsx'\)/);
  assert.match(html, /src="\.\.\/build\/image-hub-sidebar-react\.js"/);
  assert.match(pkg.scripts.test, /tests\/renderer-react-image-hub\.test\.js/);
});

test('Image Hub sidebar is React-owned with two roots and stable provider/account keys', () => {
  const component = read('src/renderer-react/image-hub-sidebar.tsx');
  assert.match(component, /createRoot\(providerHost\)/);
  assert.match(component, /createRoot\(accountHost\)/);
  assert.match(component, /key=\{provider\.id\}/);
  assert.match(component, /key=\{account\.id\}/);
  assert.match(component, /data-image-provider-filter=\{provider\.id\}/);
  assert.match(component, /data-image-account=\{account\.id\}/);
  assert.match(component, /aria-current=\{account\.active \? 'true' : 'false'\}/);
  assert.doesNotMatch(component, /dangerouslySetInnerHTML|\.innerHTML/);
});

test('Image Hub controller retains filtering and gives React exclusive ownership after attachment', () => {
  const renderer = read('src/renderer.js');
  const component = read('src/renderer-react/image-hub-sidebar.tsx');
  const renderStart = renderer.indexOf('function imageHubRenderAccounts()');
  const renderEnd = renderer.indexOf('\nfunction imageHubSwitchAccount(', renderStart);
  const renderBody = renderer.slice(renderStart, renderEnd);
  assert.ok(renderStart >= 0 && renderEnd > renderStart);
  assert.match(renderBody, /imageHubProviderFilter !== 'all'/);
  assert.match(renderBody, /imageHubFilter !== 'all'/);
  assert.match(renderBody, /\.toLowerCase\(\)\.includes\(query\)/);
  assert.match(renderBody, /imageHubReactRenderer\(model\);[\s\S]*?imageHubUpdateToolbar\(\);[\s\S]*?return;/);
  assert.match(renderer, /attachReactRenderer\(renderer\)[\s\S]*?imageHubReactRenderer = renderer;[\s\S]*?imageHubRenderAccounts\(\);/);
  assert.match(renderer, /if \(typeof imageHubReactRenderer === 'function'\) \{ imageHubRenderAccounts\(\); return; \}/);
  assert.match(component, /onClick=\{\(\) => bridge\.setProviderFilter\(provider\.id\)\}/);
  assert.match(renderer, /setProviderFilter\(providerId\)[\s\S]*?providerId !== 'all' && !imageHubProvider\(providerId\)[\s\S]*?imageHubProviderFilter = providerId;[\s\S]*?imageHubRenderAccounts\(\);/);
  assert.match(renderer, /\$\('imageHubAccountList'\)\.onclick = \(e\) =>/);
});

test('Image Hub icon candidates continue through the existing guarded fallback/cache path', () => {
  const renderer = read('src/renderer.js');
  const component = read('src/renderer-react/image-hub-sidebar.tsx');
  assert.match(renderer, /function imageHubSafeIconCandidates\(item\)[\s\S]*imageHubIconCandidates\(item\)\.filter\(isImageIcon\)/);
  assert.match(renderer, /function isImageIcon\(icon\)[\s\S]*remoteIcons !== false/);
  assert.match(renderer, /bindIconFallbacks\(root\)/);
  assert.match(component, /data-icon-candidates=\{encodeURIComponent\(JSON\.stringify\(candidates\)\)\}/);
  assert.match(component, /referrerPolicy="no-referrer"/);
  assert.match(component, /bridge\.bindIconFallbacks\(host\)/);
});

test('Image Hub React model keeps list/grid view, count, empty state and active account label', () => {
  const renderer = read('src/renderer.js');
  const component = read('src/renderer-react/image-hub-sidebar.tsx');
  assert.match(renderer, /const accountView = savedView\.accountView === 'grid' \? 'grid' : 'list'/);
  assert.match(renderer, /return \{[\s\S]*?accountView,[\s\S]*?accountCountLabel/);
  assert.match(renderer, /accountCountLabel/);
  assert.match(renderer, /No accounts yet\. Use the Add Account tab to create one\./);
  assert.match(renderer, /No accounts match this filter\./);
  assert.match(component, /model\.emptyMessage/);
  assert.match(component, /className=\{`account-row image-hub-tile\$\{account\.active \? ' active' : ''\}`\}/);
  assert.match(component, /account\.active \? ' · Active account' : ' · Open account'/);
});

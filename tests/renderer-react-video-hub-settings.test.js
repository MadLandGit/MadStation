const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Video Hub settings modal has one React rendering owner and remains part of the production bundle', () => {
  const html = read('src/renderer.html');
  const vite = read('vite.config.ts');
  const pkg = JSON.parse(read('package.json'));
  const view = read('src/renderer-react/video-hub-settings.tsx');
  assert.match(html, /id="videoHubSettingsReactMount"/);
  assert.match(html, /build\/video-hub-settings-react\.js/);
  assert.match(vite, /'video-hub-settings-react': resolve\(__dirname, 'src\/renderer-react\/video-hub-settings\.tsx'\)/);
  assert.ok(pkg.build.extraResources.some((resource) => resource.filter?.includes('renderer-react/video-hub-settings.tsx')));
  assert.doesNotMatch(html, /id="videoHubSettingsOverlay"|id="videoHubSettingDefaultTab"|id="videoHubSettingConfirm"/);
  for (const id of ['videoHubSettingsOverlay', 'videoHubSettingsClose', 'videoHubSettingsCancel', 'videoHubSettingsSave', 'videoHubSettingDefaultTab', 'videoHubSettingAccountView', 'videoHubSettingRecent', 'videoHubSettingCollapsed', 'videoHubSettingConfirm', 'videoHubSettingRecent', 'videoHubSettingCollapsed', 'videoHubSettingNetworkMode']) {
    assert.ok(view.includes(`id="${id}"`), `React view retains the ${id} hook`);
  }
});

test('Video Hub modal settings are staged in React and committed through a validated host action bridge', () => {
  const view = read('src/renderer-react/video-hub-settings.tsx');
  const host = read('src/renderer.js');
  assert.match(view, /emit\(\{ type: 'save', settings: draft \}\)/);
  assert.match(view, /emit\(\{ type: 'close' \}\)/);
  assert.match(view, /onClick=\{\(event\) => \{ if \(event\.target === event\.currentTarget\)/);
  assert.match(view, /event\.key === 'Escape'/);
  assert.match(host, /function commitVideoHubSettings\(candidate\)/);
  assert.match(host, /action\.type === 'save'[\s\S]*commitVideoHubSettings\(action\.settings\)/);
  assert.match(host, /!\['studio', 'accounts'\]\.includes\(input\.defaultTab\)/);
  assert.match(host, /!\['grid', 'list'\]\.includes\(input\.accountView\)/);
  assert.match(host, /!\['direct', 'system'\]\.includes\(input\.networkMode\)/);
  assert.match(host, /typeof input\.confirmDestructive !== 'boolean'/);
  assert.doesNotMatch(host, /videoHubSettingsSave'\)\?\.addEventListener|videoHubSettingsCancel'\)\?\.addEventListener/);
});

test('Video Hub security switches remain host-authorized and synchronize approved state back to React', () => {
  const view = read('src/renderer-react/video-hub-settings.tsx');
  const host = read('src/renderer.js');
  assert.match(view, /type SecurityKey = 'allowCamera'[\s\S]*'blockHttp'/);
  assert.match(view, /emit\(\{ type: 'security-setting', key, value \}\)/);
  assert.match(host, /action\.type === 'security-setting' && securityKeys\.has\(action\.key\) && typeof action\.value === 'boolean'/);
  assert.match(host, /updateSecurity\(\{ \[action\.key\]: action\.value \}\)/);
  assert.match(host, /if \(videoHubSettingsModalOpen\) publishVideoHubSettings\(\)/);
  assert.match(host, /videoHubSettingsOverlay\(true\)/);
  assert.match(host, /videoHubSettingsOverlay\(false\)/);
});

test('Video Hub workspace chrome has no unused settings/notification icon declarations', () => {
  const chrome = read('src/renderer-react/video-hub-workspace-chrome.tsx');
  assert.doesNotMatch(chrome, /function SettingsIcon\(/);
  assert.doesNotMatch(chrome, /function BellIcon\(/);
});

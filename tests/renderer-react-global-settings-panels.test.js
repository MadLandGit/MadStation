import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('global Accessibility, Audio and Startup panels have dedicated React owners', () => {
  const html = read('src/renderer.html');
  const module = read('src/renderer-react/global-settings-panels.tsx');
  for (const id of ['globalSettingsAccessibilityReactMount', 'globalSettingsAudioReactMount', 'globalSettingsStartupReactMount']) {
    assert.match(html, new RegExp(`id="${id}"`));
    assert.match(module, new RegExp(id));
  }
  for (const sourceId of ['accessTextScale', 'audioOutputDevice', 'refreshAudioDevicesBtn', 'testAudioOutputBtn', 'startupWorkspace']) {
    assert.match(module, new RegExp(`id="${sourceId}"`));
    assert.doesNotMatch(html, new RegExp(`id="${sourceId}"`), `${sourceId} should be React-owned, not static HTML`);
  }
  assert.match(module, /function AccessibilityPanel/);
  assert.match(module, /function AudioPanel/);
  assert.match(module, /function StartupPanel/);
  assert.match(module, /data-access=\{key\}/);
  assert.match(module, /data-app=\{key\}/);
});

test('React global settings emit a narrow typed action set and the host validates changes', () => {
  const module = read('src/renderer-react/global-settings-panels.tsx');
  const renderer = read('src/renderer.js');
  assert.match(module, /madstation:global-settings-controls-action/);
  for (const action of ['app-setting', 'accessibility-setting', 'startup-workspace', 'audio-output', 'refresh-audio-devices', 'test-audio-output']) assert.match(module, new RegExp(`type: '${action}'`));
  assert.match(renderer, /madstation:global-settings-controls-action/);
  assert.match(renderer, /\['startMaximized', 'restoreLastAccount', 'launchAtLogin'\]/);
  assert.match(renderer, /\['launcher', 'ai-hub', 'ai-lab', 'clipboard', 'instruction-forge', 'video-hub'\]/);
  assert.match(renderer, /audioOutputDevices\.some\(\(device\) => device\.deviceId === action\.value\)/);
  assert.match(renderer, /publishGlobalSettingsControls\(\)/);
});

test('audio device discovery is model-driven and no longer writes React-owned DOM', () => {
  const renderer = read('src/renderer.js');
  const module = read('src/renderer-react/global-settings-panels.tsx');
  const refresh = renderer.slice(renderer.indexOf('async function refreshAudioDevices'), renderer.indexOf('\nasync function testAudioOutput', renderer.indexOf('async function refreshAudioDevices')));
  assert.match(refresh, /audioOutputDevices = devices\.filter/);
  assert.match(refresh, /publishGlobalSettingsControls\(\)/);
  assert.doesNotMatch(refresh, /getElementById\('audioOutputDevice'\)|populateAudioDeviceSelect/);
  assert.match(module, /snapshot\.audioDevices/);
  assert.match(module, /device\.label/);
});

test('global settings React module is wired into Vite, HTML and developer-source allowlists', () => {
  const vite = read('vite.config.ts');
  const html = read('src/renderer.html');
  const pkg = JSON.parse(read('package.json'));
  const main = read('src/main.js');
  assert.match(vite, /global-settings-panels-react.*global-settings-panels\.tsx/);
  assert.match(html, /\.\.\/build\/global-settings-panels-react\.js/);
  assert.ok(pkg.scripts.test.includes('tests/renderer-react-global-settings-panels.test.js'));
  assert.ok(pkg.build.extraResources.some((item) => item.from === 'src' && item.filter?.includes('renderer-react/global-settings-panels.tsx')));
  assert.match(main, /src\/renderer-react\/global-settings-panels\.tsx/);
});

test('React commits reapply Settings search after the panel DOM updates', () => {
  const module = read('src/renderer-react/global-settings-panels.tsx');
  const renderer = read('src/renderer.js');
  assert.match(module, /useEffect\(\(\) => \{ window\.dispatchEvent\(new Event\('madstation:global-settings-panels-rendered'\)\)/);
  assert.match(renderer, /madstation:global-settings-panels-rendered'[),][\s\S]*if \(settingsQuery\(\)\) filterSettings\(\)/);
});

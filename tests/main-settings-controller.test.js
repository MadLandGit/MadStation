const test = require('node:test');
const assert = require('node:assert/strict');
const { createSettingsController } = require('../build/main/settings-controller.js');
const { DEFAULT_APP_SETTINGS, DEFAULT_SECURITY } = require('../build/main/settings.js');
const { DEFAULT_DOWNLOAD_SETTINGS, normalizeDownloadSettings } = require('../build/main/downloads.js');

function makeHarness() {
  let settings = {
    ...DEFAULT_APP_SETTINGS,
    security: { ...DEFAULT_SECURITY, lockOnLaunch: false },
    downloads: { ...DEFAULT_DOWNLOAD_SETTINGS, askWhereToSave: true, folder: 'C:\\MadStationDownloads', notifyWhenDone: false },
  };
  const calls = { liveApp: 0, liveSecurity: 0, broadcasts: 0 };
  const controller = createSettingsController({
    getSettings: () => settings,
    setSettings: (next) => { settings = next; },
    getSecurity: () => settings.security,
    setSecurity: (next) => { settings.security = next; },
    getDownloads: () => settings.downloads,
    setDownloads: (next) => { settings.downloads = next; },
    normalizeDownloads: normalizeDownloadSettings,
    defaultDownloads: DEFAULT_DOWNLOAD_SETTINGS,
    applyLiveAppSettings: () => { calls.liveApp += 1; },
    applyLiveSecurity: () => { calls.liveSecurity += 1; },
    broadcastConfig: () => { calls.broadcasts += 1; return true; },
    isManagedBackgroundUrl: (value) => typeof value === 'string' && value.startsWith('file:///managed/backgrounds/'),
  });
  return { controller, getSettings: () => settings, calls };
}

test('settings controller normalizes app patches and preserves the dedicated security/download namespaces', () => {
  const harness = makeHarness();
  const result = harness.controller.setAppSettings({ theme: 'invalid', pageZoom: 999, launchAtLogin: true, security: { lockOnLaunch: true }, downloads: { folder: 'X:\\bad' } });
  assert.equal(result.ok, true);
  assert.equal(result.settings.theme, 'dark');
  assert.equal(result.settings.pageZoom, 100);
  assert.equal(result.settings.launchAtLogin, true);
  assert.equal(result.settings.security.lockOnLaunch, false);
  assert.equal(result.settings.downloads.folder, 'C:\\MadStationDownloads');
  assert.deepEqual(harness.calls, { liveApp: 1, liveSecurity: 0, broadcasts: 1 });
});

test('settings controller rejects local background URLs outside the managed host directory', () => {
  const harness = makeHarness();
  const result = harness.controller.setAppSettings({
    customBackgrounds: [
      { id: 'local-a', name: 'Managed', type: 'local', url: 'file:///managed/backgrounds/local-a.png' },
      { id: 'local-b', name: 'Arbitrary file', type: 'local', url: 'file:///Users/person/private.png' },
      { id: 'remote', name: 'Remote', type: 'url', url: 'https://images.example/background.png' },
    ],
    backgroundStyle: 'custom', backgroundId: 'local-b',
  });
  assert.deepEqual(result.settings.customBackgrounds.map((item) => item.id), ['local-a', 'remote']);
  assert.equal(result.settings.backgroundStyle, 'plain');
  assert.equal(result.settings.backgroundId, '');
});

test('settings controller resets app, security, and download settings and applies live updates', () => {
  const harness = makeHarness();
  const result = harness.controller.resetSettings();
  assert.equal(result.ok, true);
  assert.equal(result.settings.theme, DEFAULT_APP_SETTINGS.theme);
  assert.equal(result.settings.security.lockOnLaunch, DEFAULT_SECURITY.lockOnLaunch);
  assert.deepEqual(result.settings.downloads, DEFAULT_DOWNLOAD_SETTINGS);
  assert.deepEqual(harness.calls, { liveApp: 1, liveSecurity: 1, broadcasts: 1 });
});

test('settings controller validates security patches and only applies the security transition', () => {
  const harness = makeHarness();
  const result = harness.controller.setSecuritySettings({ lockOnLaunch: true, idleMinutes: 7, allowCamera: 'yes' });
  assert.equal(result.ok, true);
  assert.equal(result.settings.security.lockOnLaunch, true);
  assert.equal(result.settings.security.idleMinutes, 10);
  assert.equal(result.settings.security.allowCamera, DEFAULT_SECURITY.allowCamera);
  assert.deepEqual(harness.calls, { liveApp: 0, liveSecurity: 1, broadcasts: 1 });
});

test('settings controller normalizes download patches and rejects non-object patches', () => {
  const harness = makeHarness();
  const result = harness.controller.setDownloadSettings({ askWhereToSave: false, folder: '', notifyWhenDone: true, unexpected: 'ignored' });
  assert.equal(result.ok, true);
  assert.equal(result.settings.downloads.askWhereToSave, false);
  assert.equal(result.settings.downloads.notifyWhenDone, true);
  assert.equal('unexpected' in result.settings.downloads, false);
  harness.controller.setDownloadSettings('not-an-object');
  assert.deepEqual(harness.calls, { liveApp: 0, liveSecurity: 0, broadcasts: 2 });
});

test('main settings IPC channels delegate to the typed controller through the existing security wrapper', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.join(__dirname, '..');
  const main = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');
  const source = fs.readFileSync(path.join(root, 'src', 'main', 'settings-controller.ts'), 'utf8');
  assert.match(main, /require\('\.\.\/build\/main\/settings-controller\.js'\)/);
  const registration = fs.readFileSync(path.join(root, 'src', 'main', 'settings-ipc.ts'), 'utf8');
  assert.match(main, /registerSettingsIpcHandlers\(handle, settingsController\)/);
  assert.match(registration, /handle\('set-app-settings', \(_event, patch\) => controller\.setAppSettings\(patch\)\)/);
  assert.match(registration, /handle\('reset-settings', \(\) => controller\.resetSettings\(\)\)/);
  assert.match(registration, /handle\('set-security-settings', \(_event, patch\) => controller\.setSecuritySettings\(patch\)\)/);
  assert.match(registration, /handle\('set-download-settings', \(_event, patch\) => controller\.setDownloadSettings\(patch\)\)/);
  const handleStart = main.indexOf('function handle(channel, fn, options = {})');
  const handleEnd = main.indexOf('\nfunction closeAllAccountViews', handleStart);
  const handleBody = main.slice(handleStart, handleEnd);
  assert.match(handleBody, /isTrustedSender\(event, options\)/);
  assert.match(handleBody, /locked && !ALLOWED_WHILE_LOCKED\.has\(channel\)/);
  assert.match(handleBody, /isSafeIpcPayload\(args\)/);
  assert.match(source, /normalizeSecurity/);
  assert.match(source, /normalizeAppSettings/);
  assert.match(source, /isManagedBackgroundUrl/);
  assert.match(main, /sanitizeManagedBackgroundSettings\(\)/);
  assert.match(main, /loadConfiguration: \(\) => \{ config = loadConfig\(\); sanitizeManagedBackgroundSettings\(\); \}/);
});

test('settings controller is compiled, tested and included in packaged developer source', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.join(__dirname, '..');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.match(pkg.scripts['build:main-modules'], /src\/main\/settings-controller\.ts/);
  assert.match(pkg.scripts['build:main-modules'], /src\/main\/settings-ipc\.ts/);
  assert.ok(pkg.build.extraResources.find((resource) => resource.from === 'src').filter.includes('main/settings-ipc.ts'));
  assert.match(pkg.scripts.test, /tests\/main-settings-controller\.test\.js/);
  const main = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');
  assert.match(main, /'src\/main\/settings-controller\.ts'/, 'developer-file access is explicit and allowlisted');
  const resource = pkg.build.extraResources.find((item) => item.from === 'src' && item.to === 'developer-docs/src');
  assert.ok(resource?.filter.includes('main/settings-controller.ts'));
});

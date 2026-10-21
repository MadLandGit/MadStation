const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_APP_SETTINGS,
  DEFAULT_SECURITY,
  normalizeAppSettings,
  normalizeSecurity,
} = require('../build/main/settings.js');

test('settings normalization applies defaults and rejects unsupported values', () => {
  const result = normalizeAppSettings({ theme: 'not-a-theme', pageZoom: 999, accent: 'url(javascript:alert(1))' });
  assert.equal(result.theme, 'dark');
  assert.equal(result.pageZoom, 100);
  assert.equal(result.accent, 'blue');
  assert.equal(result.startupWorkspace, 'launcher');
});

test('settings normalization preserves legacy button styles and workspace migration', () => {
  const result = normalizeAppSettings({ buttonStyle: 'outline', startupWorkspace: 'test-app', theme: 'light' });
  assert.equal(result.buttonCorner, 'soft');
  assert.equal(result.buttonBackground, 'outline');
  assert.equal(result.startupWorkspace, 'video-hub');
  assert.equal(result.theme, 'light');
});

test('settings normalization validates custom backgrounds and bounds their count', () => {
  const backgrounds = [
    { id: 'valid_1', name: 'Remote background', url: 'https://example.com/image.png', type: 'url' },
    { id: 'invalid with spaces', name: 'Invalid', url: 'https://example.com/a.png', type: 'url' },
    { id: 'bad_protocol', name: 'Unsafe', url: 'javascript:alert(1)', type: 'url' },
  ];
  const result = normalizeAppSettings({ backgroundStyle: 'custom', backgroundId: 'valid_1', customBackgrounds: backgrounds });
  assert.equal(result.customBackgrounds.length, 1);
  assert.equal(result.backgroundStyle, 'custom');
  assert.equal(result.backgroundId, 'valid_1');
  const unmatched = normalizeAppSettings({ backgroundStyle: 'custom', backgroundId: 'missing', customBackgrounds: backgrounds });
  assert.equal(unmatched.backgroundStyle, 'plain');
  assert.equal(unmatched.backgroundId, '');
});

test('settings normalization never mutates nested shared defaults between calls', () => {
  normalizeAppSettings({ accessibility: { textScale: 150 }, audio: { outputDeviceId: 'speaker-1' } });
  const fresh = normalizeAppSettings({});
  assert.equal(fresh.accessibility.textScale, 100);
  assert.equal(fresh.audio.outputDeviceId, 'default');
  assert.equal(DEFAULT_APP_SETTINGS.accessibility.textScale, 100);
  assert.equal(DEFAULT_APP_SETTINGS.audio.outputDeviceId, 'default');
});

test('security settings normalize only supported booleans and idle intervals', () => {
  const result = normalizeSecurity({ lockOnIdle: true, idleMinutes: 7, allowCamera: 'yes', blockDevTools: false });
  assert.equal(result.lockOnIdle, true);
  assert.equal(result.idleMinutes, 10);
  assert.equal(result.allowCamera, DEFAULT_SECURITY.allowCamera);
  assert.equal(result.blockDevTools, false);
});

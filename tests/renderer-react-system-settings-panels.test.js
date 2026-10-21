import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('Lock, Downloads and Data panels have React-owned control roots', () => {
  const html = read('src/renderer.html');
  const module = read('src/renderer-react/system-settings-panels.tsx');
  assert.match(html, /id="lockOptions"/);
  assert.match(html, /id="downloadsSettingsReactMount"/);
  assert.match(html, /id="dataDiagnosticsReactMount"/);
  for (const id of ['setPasswordBtn', 'passwordStatus', 'removePasswordBtn']) assert.match(html, new RegExp(`id="${id}"`), `${id} remains host-owned`);
  for (const id of ['backupBtn', 'restoreBtn', 'exportAccountsBtn', 'importAccountsBtn', 'diagnosticsSummary', 'releaseFeedUrl', 'openDownloadsBtn', 'chooseDownloadFolderBtn']) {
    assert.match(module, new RegExp(`id="${id}"`));
    assert.doesNotMatch(html, new RegExp(`id="${id}"`), `${id} must be rendered by React`);
  }
  assert.doesNotMatch(html.match(/data-panel="downloads"[\s\S]*?data-panel="privacy"/)[0], /data-dl="/);
  assert.doesNotMatch(html.match(/data-panel="lock"[\s\S]*?data-panel="downloads"/)[0], /data-sec="lockOn/);
});

test('Lock settings actions are bounded and still use the existing security settings API', () => {
  const module = read('src/renderer-react/system-settings-panels.tsx');
  const renderer = read('src/renderer.js');
  for (const key of ['lockOnLaunch', 'lockOnSystemLock', 'lockOnMinimize', 'lockOnIdle']) assert.match(module, new RegExp(`'${key}'`));
  assert.match(module, /madstation:security-controls-action/);
  assert.match(renderer, /madstation:security-controls-mounted/);
  assert.match(renderer, /madstation:security-controls-action/);
  assert.match(renderer, /\['lockOnLaunch', 'lockOnSystemLock', 'lockOnMinimize', 'lockOnIdle'\]/);
  assert.match(renderer, /\[1, 5, 10, 30\]\.includes\(action\.value\)/);
  assert.match(renderer, /async function updateSecurity\(patch\)/);
  assert.match(module, /disabled={!hasPassword}/);
});

test('Downloads React panel publishes a view model and validates actions in the host', () => {
  const module = read('src/renderer-react/system-settings-panels.tsx');
  const renderer = read('src/renderer.js');
  assert.match(module, /madstation:downloads-settings-controls-action/);
  assert.match(module, /settings\[key\]/);
  assert.match(renderer, /function publishDownloadsSettingsControls\(\)/);
  assert.match(renderer, /madstation:downloads-settings-controls-mounted/);
  assert.match(renderer, /\['askWhereToSave', 'notifyWhenDone'\]\.includes\(action\.key\)/);
  assert.match(renderer, /window\.aiHub\.chooseDownloadFolder\(\)/);
  assert.match(renderer, /function applyDownloadSettings\(\)\s*\{\s*publishDownloadsSettingsControls\(\);\s*\}/);
  assert.doesNotMatch(renderer, /document\.querySelectorAll\('\[data-dl\]'\)\.forEach\(\(input\) => input\.addEventListener/);
});

test('Data and diagnostics actions remain behind host-owned operations and confirmation', () => {
  const module = read('src/renderer-react/system-settings-panels.tsx');
  const renderer = read('src/renderer.js');
  for (const action of ['open-data-folder', 'backup', 'restore', 'export-accounts', 'import-accounts', 'reset-settings', 'refresh-diagnostics', 'check-providers', 'export-diagnostics', 'check-updates', 'release-feed-url']) assert.match(module, new RegExp(`type: '${action}'`));
  assert.match(renderer, /madstation:data-settings-controls-action/);
  assert.match(renderer, /window\.confirm\('Restore a Mad Station backup/);
  assert.match(renderer, /window\.confirm\('Reset all settings to their defaults/);
  assert.match(renderer, /window\.aiHub\.restoreConfig\(\)/);
  assert.match(renderer, /window\.aiHub\.exportDiagnostics\(\)/);
  assert.match(renderer, /action\.value\.length > 2048/);
  assert.match(renderer, /publishDataDiagnosticsControls\(\)/);
  assert.doesNotMatch(module, /window\.aiHub\./, 'React must not invoke privileged preload APIs directly');
});

test('new system settings module is wired into Vite, renderer HTML, tests and developer resources', () => {
  const vite = read('vite.config.ts');
  const html = read('src/renderer.html');
  const pkg = JSON.parse(read('package.json'));
  const main = read('src/main.js');
  assert.match(vite, /system-settings-panels-react.*system-settings-panels\.tsx/);
  assert.match(html, /\.\.\/build\/system-settings-panels-react\.js/);
  assert.ok(pkg.scripts.test.includes('tests/renderer-react-system-settings-panels.test.js'));
  assert.ok(pkg.build.extraResources.some((item) => item.from === 'src' && item.filter?.includes('renderer-react/system-settings-panels.tsx')));
  assert.match(main, /src\/renderer-react\/system-settings-panels\.tsx/);
});

test('system settings reapply Settings search after React snapshot updates', () => {
  const module = read('src/renderer-react/system-settings-panels.tsx');
  const renderer = read('src/renderer.js');
  assert.match(module, /useEffect\(\(\) => \{\s*if \(renderedEvent\) window\.dispatchEvent\(new Event\('madstation:global-settings-panels-rendered'\)\);\s*\}, \[snapshot, renderedEvent\]\)/);
  assert.match(renderer, /madstation:global-settings-panels-rendered'[),][\s\S]*if \(settingsQuery\(\)\) filterSettings\(\)/);
});

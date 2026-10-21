const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createDownloadsController } = require('../build/main/downloads-controller.js');

function makeHarness() {
  const calls = [];
  let storedSettings = { askWhereToSave: false, folder: 'C:\\Downloads', notifyWhenDone: true };
  const settingsSnapshot = { settings: { downloads: storedSettings } };
  const result = { items: [], active: 2, folder: storedSettings.folder };
  const manager = {
    getState: () => result,
    open: async (id) => { calls.push(['open', id]); return { ok: true }; },
    show: (id) => { calls.push(['show', id]); return { ok: true }; },
    cancel: (id) => { calls.push(['cancel', id]); return { ok: true }; },
    pause: (id) => { calls.push(['pause', id]); return { ok: true }; },
    resume: (id) => { calls.push(['resume', id]); return { ok: true }; },
    remove: (id) => { calls.push(['remove', id]); return { ok: true }; },
    clearFinished: () => { calls.push(['clear-finished']); return { ok: true }; },
    openFolder: async () => { calls.push(['open-folder']); return { ok: true }; },
  };
  const controller = createDownloadsController({
    manager,
    getDownloadSettings: () => storedSettings,
    setDownloadSettings: (next) => { storedSettings = next; settingsSnapshot.settings.downloads = next; },
    getSettingsSnapshot: () => settingsSnapshot,
    normalizeSettings: (raw) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { askWhereToSave: false, folder: '', notifyWhenDone: true };
      return { askWhereToSave: raw.askWhereToSave === true, folder: typeof raw.folder === 'string' && /^([A-Za-z]:\\|\\\\)/.test(raw.folder) ? raw.folder : '', notifyWhenDone: raw.notifyWhenDone !== false };
    },
    chooseDirectory: async (options) => { calls.push(['choose-directory', options.defaultPath]); return { canceled: false, filePaths: ['D:\\Mad Downloads'] }; },
    broadcastConfig: () => { calls.push(['broadcast']); return true; },
  });
  return { controller, calls, manager, getSettings: () => storedSettings };
}

test('downloads controller accepts only known ID-based actions and limits IDs', () => {
  const h = makeHarness();
  h.controller.performAction('open', 'x'.repeat(100));
  assert.deepEqual(h.calls[0], ['open', 'x'.repeat(80)]);
  assert.deepEqual(h.controller.performAction('delete-file-path', 'C:\\secret.exe'), { ok: false, error: 'Unknown download action.' });
  assert.equal(h.calls.length, 1);
});

test('downloads controller delegates each supported command to the manager', async () => {
  const h = makeHarness();
  for (const action of ['show', 'cancel', 'pause', 'resume', 'remove']) h.controller.performAction(action, `id-${action}`);
  h.controller.performAction('clear-finished');
  await h.controller.performAction('open-folder');
  assert.deepEqual(h.calls.map((x) => x[0]), ['show', 'cancel', 'pause', 'resume', 'remove', 'clear-finished', 'open-folder']);
});

test('downloads controller exposes manager state without accepting renderer file paths', () => {
  const h = makeHarness();
  assert.deepEqual(h.controller.getDownloads(), { ok: true, items: [], active: 2, folder: 'C:\\Downloads' });
});

test('download folder selection normalizes persistence and broadcasts the config', async () => {
  const h = makeHarness();
  const result = await h.controller.chooseFolder();
  assert.equal(result.ok, true);
  assert.equal(h.getSettings().folder, 'D:\\Mad Downloads');
  assert.deepEqual(h.calls.map((x) => x[0]), ['choose-directory', 'broadcast']);
});

test('download folder selection preserves state on cancellation and rejects an invalid path', async () => {
  const h = makeHarness();
  h.controller = createDownloadsController({
    manager: h.manager,
    getDownloadSettings: h.getSettings,
    setDownloadSettings: () => assert.fail('must not persist an invalid path'),
    getSettingsSnapshot: () => ({}),
    normalizeSettings: () => ({ askWhereToSave: false, folder: '', notifyWhenDone: true }),
    chooseDirectory: async () => ({ canceled: false, filePaths: ['relative/path'] }),
    broadcastConfig: () => assert.fail('must not broadcast an invalid path'),
  });
  assert.deepEqual(await h.controller.chooseFolder(), { ok: false, error: 'That folder cannot be used.' });
});

test('main process delegates download IPC through the typed controller and existing security wrapper', () => {
  const root = path.join(__dirname, '..');
  const main = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.match(main, /require\('\.\.\/build\/main\/downloads-controller\.js'\)/);
  const registration = fs.readFileSync(path.join(root, 'src/main/downloads-ipc.ts'), 'utf8');
  assert.match(main, /registerDownloadsIpcHandlers\(handle, downloadsController\)/);
  assert.match(registration, /handle\('choose-download-folder', \(\) => controller\.chooseFolder\(\)\)/);
  assert.match(registration, /handle\('get-downloads', \(\) => controller\.getDownloads\(\)\)/);
  assert.match(registration, /handle\('download-action', \(_event, action, id\) => controller\.performAction\(action, id\)\)/);
  assert.match(packageJson.scripts['build:main-modules'], /src\/main\/downloads-controller\.ts/);
  assert.match(packageJson.scripts['build:main-modules'], /src\/main\/downloads-ipc\.ts/);
  assert.ok(packageJson.build.extraResources.find((resource) => resource.from === 'src').filter.includes('main/downloads-ipc.ts'));
});

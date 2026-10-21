const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { fileURLToPath, pathToFileURL } = require('node:url');
const { createBackgroundFilesController, MAX_BACKGROUND_FILE_BYTES } = require('../build/main/background-files.js');

function createController(overrides = {}) {
  const root = overrides.root || fs.mkdtempSync(path.join(os.tmpdir(), 'mad-station-backgrounds-'));
  const dependencies = {
    path,
    fs,
    url: { fileURLToPath, pathToFileURL },
    getStoreDirectory: () => path.join(root, 'backgrounds'),
    createId: () => 'abc123',
    now: () => '2026-10-15T10:00:00.000Z',
    copyFileExclusiveFlag: fs.constants.COPYFILE_EXCL,
    redactError: (_error, fallback) => fallback,
    ...overrides,
  };
  return { root, controller: createBackgroundFilesController(dependencies) };
}

test('background file controller copies supported image files into the managed store and returns the existing DTO', () => {
  const { root, controller } = createController();
  try {
    const source = path.join(root, 'Wallpaper.png');
    fs.writeFileSync(source, Buffer.from('not-a-real-png-but-a-file'));
    const result = controller.addFromPath(source);
    assert.equal(result.ok, true);
    assert.deepEqual(result.background, {
      id: 'local-abc123',
      name: 'Wallpaper',
      type: 'local',
      url: pathToFileURL(path.join(root, 'backgrounds', 'local-abc123.png')).href,
      createdAt: '2026-10-15T10:00:00.000Z',
      mime: 'image/png',
    });
    assert.equal(fs.readFileSync(fileURLToPath(result.background.url), 'utf8'), 'not-a-real-png-but-a-file');
    assert.equal(controller.isManagedFileUrl(result.background.url), true);
    assert.equal(controller.removeStoredFile(result.background.url), true);
    assert.equal(fs.existsSync(path.join(root, 'backgrounds', 'local-abc123.png')), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('invalid, relative and unsupported file paths are rejected before file operations', () => {
  const operations = [];
  const fakeFs = {
    mkdirSync: (...args) => operations.push(['mkdir', ...args]),
    statSync: (...args) => { operations.push(['stat', ...args]); return { isFile: () => true, size: 1 }; },
    copyFileSync: (...args) => operations.push(['copy', ...args]),
    unlinkSync: (...args) => operations.push(['unlink', ...args]),
  };
  const controller = createBackgroundFilesController({
    path,
    fs: fakeFs,
    url: { fileURLToPath, pathToFileURL },
    getStoreDirectory: () => path.join(os.tmpdir(), 'background-store'),
    createId: () => 'abc',
    now: () => '2026-10-15T10:00:00.000Z',
    copyFileExclusiveFlag: 1,
  });
  assert.deepEqual(controller.addFromPath('relative.png'), { ok: false, error: 'Choose a valid image file.' });
  const unsupported = controller.addFromPath(path.join(os.tmpdir(), 'wallpaper.exe'));
  assert.deepEqual(unsupported, { ok: false, error: 'That file type is not supported as a background.' });
  assert.deepEqual(operations, []);
});

test('background file controller rejects non-files and images over 25 MiB before copying', () => {
  const source = path.join(os.tmpdir(), 'large.png');
  const operations = [];
  const makeController = (stat) => createBackgroundFilesController({
    path,
    fs: {
      mkdirSync: (...args) => operations.push(['mkdir', ...args]),
      statSync: (...args) => { operations.push(['stat', ...args]); return stat; },
      copyFileSync: (...args) => operations.push(['copy', ...args]),
      unlinkSync: (...args) => operations.push(['unlink', ...args]),
    },
    url: { fileURLToPath, pathToFileURL },
    getStoreDirectory: () => path.join(os.tmpdir(), 'background-store'),
    createId: () => 'abc',
    now: () => '2026-10-15T10:00:00.000Z',
    copyFileExclusiveFlag: 1,
  });
  assert.deepEqual(makeController({ isFile: () => false, size: 10 }).addFromPath(source), { ok: false, error: 'That selection is not a file.' });
  assert.deepEqual(makeController({ isFile: () => true, size: MAX_BACKGROUND_FILE_BYTES + 1 }).addFromPath(source), { ok: false, error: 'Backgrounds must be 25 MB or smaller.' });
  assert.equal(operations.some(([name]) => name === 'copy' || name === 'mkdir'), false);
});

test('managed-file checks only allow direct children of the background store', () => {
  const { root, controller } = createController();
  try {
    const store = path.join(root, 'backgrounds');
    fs.mkdirSync(store, { recursive: true });
    const managed = path.join(store, 'local-managed_123.png');
    const external = path.join(root, 'outside.png');
    const unrelatedManagedDirectoryFile = path.join(store, 'notes.png');
    const nestedDirectory = path.join(store, 'nested');
    fs.writeFileSync(managed, 'managed');
    fs.writeFileSync(external, 'outside');
    fs.writeFileSync(unrelatedManagedDirectoryFile, 'not a background');
    fs.mkdirSync(nestedDirectory);
    const nested = path.join(nestedDirectory, 'nested.png');
    fs.writeFileSync(nested, 'nested');
    assert.equal(controller.isManagedFileUrl(pathToFileURL(managed).href), true);
    assert.equal(controller.isManagedFileUrl(pathToFileURL(external).href), false);
    assert.equal(controller.isManagedFileUrl(pathToFileURL(unrelatedManagedDirectoryFile).href), false);
    assert.equal(controller.isManagedFileUrl(pathToFileURL(nested).href), false);
    assert.equal(controller.removeStoredFile(pathToFileURL(external).href), false);
    assert.equal(fs.readFileSync(external, 'utf8'), 'outside');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('exclusive-copy collisions never delete a pre-existing managed file and native errors are redacted', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mad-station-background-collision-'));
  const target = path.join(root, 'backgrounds', 'local-abc123.png');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, 'pre-existing');
  const source = path.join(root, 'source.png');
  fs.writeFileSync(source, 'source');
  let unlinkCalls = 0;
  const fakeFs = {
    mkdirSync: fs.mkdirSync,
    statSync: fs.statSync,
    copyFileSync: () => { const error = new Error(`EEXIST: ${target}`); error.code = 'EEXIST'; throw error; },
    unlinkSync: (filePath) => { unlinkCalls += 1; fs.unlinkSync(filePath); },
  };
  const controller = createBackgroundFilesController({
    path,
    fs: fakeFs,
    url: { fileURLToPath, pathToFileURL },
    getStoreDirectory: () => path.join(root, 'backgrounds'),
    createId: () => 'abc123',
    now: () => '2026-10-15T10:00:00.000Z',
    copyFileExclusiveFlag: fs.constants.COPYFILE_EXCL,
    redactError: () => 'Could not add that background.',
  });
  try {
    assert.deepEqual(controller.addFromPath(source), { ok: false, error: 'Could not add that background.' });
    assert.equal(fs.readFileSync(target, 'utf8'), 'pre-existing');
    assert.equal(unlinkCalls, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('managed background URL checks reject a symlink even when its generated filename looks valid', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mad-station-background-symlink-'));
  const store = path.join(root, 'backgrounds');
  fs.mkdirSync(store, { recursive: true });
  const managedLike = path.join(store, 'local-link_123.png');
  fs.writeFileSync(managedLike, 'target content');
  const realLstat = fs.lstatSync.bind(fs);
  const fakeFs = {
    ...fs,
    lstatSync(filePath) {
      if (path.resolve(filePath) === path.resolve(managedLike)) return { isFile: () => false, isSymbolicLink: () => true };
      return realLstat(filePath);
    },
  };
  const controller = createBackgroundFilesController({
    path, fs: fakeFs,
    url: { fileURLToPath, pathToFileURL },
    getStoreDirectory: () => store,
    createId: () => 'unused',
    now: () => '2026-10-16T00:00:00.000Z',
    copyFileExclusiveFlag: fs.constants.COPYFILE_EXCL,
  });
  try {
    assert.equal(controller.isManagedFileUrl(pathToFileURL(managedLike).href), false);
    assert.equal(controller.removeStoredFile(pathToFileURL(managedLike).href), false);
    assert.equal(fs.readFileSync(managedLike, 'utf8'), 'target content');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

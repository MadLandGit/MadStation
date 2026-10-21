const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createAtomicJsonFileStore } = require('../build/main/json-file-store.js');

function makeFileSystem(initial = {}) {
  const files = new Map(Object.entries(initial));
  const fsLike = {
    readFileSync(file, encoding) {
      assert.equal(encoding, 'utf8');
      if (!files.has(file)) throw new Error('ENOENT');
      return files.get(file);
    },
    writeFileSync(file, data, encoding) {
      assert.equal(encoding, 'utf8');
      files.set(file, data);
    },
    renameSync(source, destination) {
      if (!files.has(source)) throw new Error('ENOENT');
      files.set(destination, files.get(source));
      files.delete(source);
    },
  };
  return { fsLike, files };
}

test('atomic JSON store writes via a temporary file and rename', () => {
  const { fsLike, files } = makeFileSystem();
  const store = createAtomicJsonFileStore({ getFilePath: () => '/user-data/video-hub.json', fs: fsLike });
  assert.equal(store.write({ version: 1, activeAccountId: 'a1' }), true);
  assert.equal(files.has('/user-data/video-hub.json.tmp'), false);
  assert.deepEqual(JSON.parse(files.get('/user-data/video-hub.json')), { version: 1, activeAccountId: 'a1' });
});

test('atomic JSON store returns parsed data without owning schema policy', () => {
  const { fsLike } = makeFileSystem({ '/user-data/video-hub.json': '{"version":1,"providers":[]}' });
  const store = createAtomicJsonFileStore({ getFilePath: () => '/user-data/video-hub.json', fs: fsLike });
  assert.deepEqual(store.read(), { ok: true, value: { version: 1, providers: [] } });
});

test('corrupt JSON is quarantined with a timestamp and returned as unreadable', () => {
  const { fsLike, files } = makeFileSystem({ '/user-data/video-hub.json': '{not-json' });
  const store = createAtomicJsonFileStore({ getFilePath: () => '/user-data/video-hub.json', fs: fsLike, now: () => 12345 });
  assert.deepEqual(store.read(), { ok: false, value: null });
  assert.equal(files.has('/user-data/video-hub.json'), false);
  assert.equal(files.get('/user-data/video-hub.json.corrupt-12345'), '{not-json');
});

test('missing JSON file does not create a corrupt quarantine entry', () => {
  const { fsLike, files } = makeFileSystem();
  const store = createAtomicJsonFileStore({ getFilePath: () => '/user-data/missing.json', fs: fsLike, now: () => 12345 });
  assert.deepEqual(store.read(), { ok: false, value: null });
  assert.equal([...files.keys()].some((file) => file.includes('.corrupt-')), false);
});

test('write failures are reported without throwing through the caller', () => {
  const { fsLike } = makeFileSystem();
  fsLike.renameSync = () => { throw new Error('disk unavailable'); };
  const store = createAtomicJsonFileStore({ getFilePath: () => '/user-data/store.json', fs: fsLike });
  assert.equal(store.write({ version: 1 }), false);
});

test('Video Hub persistence primitive is wired, compiled, and included in developer source resources', () => {
  const root = path.join(__dirname, '..');
  const main = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');
  const source = fs.readFileSync(path.join(root, 'src', 'main', 'json-file-store.ts'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const resources = pkg.build.extraResources.find((entry) => entry.to === 'developer-docs/src');
  assert.match(main, /require\('\.\.\/build\/main\/json-file-store\.js'\)/);
  assert.match(main, /const videoHubJsonStore = createAtomicJsonFileStore/);
  assert.match(main, /return videoHubJsonStore\.write\(videoHubStore\)/);
  assert.match(main, /const loaded = videoHubJsonStore\.read\(\)/);
  assert.match(pkg.scripts['build:main-modules'], /src\/main\/json-file-store\.ts/);
  assert.match(pkg.scripts.test, /tests\/main-json-file-store\.test\.js/);
  assert.ok(resources.filter.includes('main/json-file-store.ts'));
  assert.ok(source.includes('export function createAtomicJsonFileStore'));
});

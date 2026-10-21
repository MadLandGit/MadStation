const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createConfigStore } = require('../build/main/config-store.js');

function withStore(callback) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'mad-station-config-store-'));
  const file = path.join(folder, 'config.json');
  const errors = [];
  const warnings = [];
  const defaults = { version: 13, source: 'default' };
  const store = createConfigStore({
    getFilePath: () => file,
    migrateConfig: (value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid config');
      return { ...value, migrated: true };
    },
    makeDefaultConfig: () => ({ ...defaults }),
    logger: {
      warn: (...values) => warnings.push(values),
      error: (...values) => errors.push(values),
    },
    now: () => 12345,
    processId: 67890,
  });
  try {
    callback({ folder, file, store, errors, warnings, defaults });
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
}

test('config store writes atomically and backs up the previous valid JSON', () => {
  withStore(({ file, store, folder }) => {
    assert.equal(store.saveConfig({ version: 1 }), true);
    assert.equal(store.saveConfig({ version: 2 }), true);
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { version: 2 });
    assert.deepEqual(JSON.parse(fs.readFileSync(`${file}.bak`, 'utf8')), { version: 1 });
    assert.deepEqual(fs.readdirSync(folder).sort(), ['config.json', 'config.json.bak']);
  });
});

test('config store migrates and loads the primary config', () => {
  withStore(({ file, store }) => {
    fs.writeFileSync(file, JSON.stringify({ version: 12, accounts: [] }), 'utf8');
    assert.deepEqual(store.loadConfig(), { version: 12, accounts: [], migrated: true });
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { version: 12, accounts: [], migrated: true });
  });
});

test('config store quarantines corrupt primary config and recovers from backup', () => {
  withStore(({ file, folder, store }) => {
    fs.writeFileSync(file, '{not-json', 'utf8');
    fs.writeFileSync(`${file}.bak`, JSON.stringify({ version: 11, accounts: ['recovered'] }), 'utf8');
    assert.deepEqual(store.loadConfig(), { version: 11, accounts: ['recovered'], migrated: true });
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { version: 11, accounts: ['recovered'], migrated: true });
    assert.ok(fs.existsSync(path.join(folder, 'config.corrupt-12345.json')));
    assert.equal(fs.readFileSync(path.join(folder, 'config.corrupt-12345.json'), 'utf8'), '{not-json');
  });
});

test('config store creates default config when no valid primary or backup exists', () => {
  withStore(({ file, store, defaults }) => {
    const config = store.loadConfig();
    assert.deepEqual(config, defaults);
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), defaults);
  });
});

test('config store reports write failures instead of claiming success', () => {
  withStore(({ store, errors, file }) => {
    fs.mkdirSync(file);
    assert.equal(store.saveConfig({ version: 1 }), false);
    assert.equal(errors.length, 1);
    assert.match(String(errors[0][0]), /Could not save config/);
  });
});

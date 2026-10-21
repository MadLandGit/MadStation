const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  MAX_WORKSPACE_TRANSFER_BYTES,
  normalizeWorkspaceJsonPath,
  readWorkspaceJson,
  writeWorkspaceJsonAtomically,
} = require('../build/main/workspace-transfer-files.js');

function dependencies(overrides = {}) {
  return { path, fs, temporarySuffix: () => 'test-123', ...overrides };
}

test('transfer path validation requires an absolute .json path on native and Windows path APIs', () => {
  const valid = path.join(os.tmpdir(), 'Mad-Station-accounts.json');
  assert.equal(normalizeWorkspaceJsonPath(valid, path), path.resolve(valid));
  assert.equal(normalizeWorkspaceJsonPath('C:\\Users\\Some User\\backup.json', path.win32), path.win32.resolve('C:\\Users\\Some User\\backup.json'));
  for (const invalid of [undefined, '', 'relative.json', path.join(os.tmpdir(), 'backup.txt'), path.join(os.tmpdir(), 'nul\0.json'), 'x'.repeat(32768)]) {
    assert.throws(() => normalizeWorkspaceJsonPath(invalid, path));
  }
});

test('workspace JSON writes atomically and cleans up its sibling temporary file', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mad-station-transfer-'));
  try {
    const target = path.join(directory, 'accounts.json');
    writeWorkspaceJsonAtomically(target, { format: 'mad-station-accounts', accounts: [] }, dependencies());
    assert.deepEqual(JSON.parse(fs.readFileSync(target, 'utf8')), { format: 'mad-station-accounts', accounts: [] });
    assert.deepEqual(fs.readdirSync(directory), ['accounts.json']);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('invalid write paths are rejected before filesystem mutations', () => {
  const operations = [];
  const fakeFs = {
    writeFileSync: (...args) => operations.push(['write', ...args]),
    renameSync: (...args) => operations.push(['rename', ...args]),
    existsSync: (...args) => { operations.push(['exists', ...args]); return false; },
    unlinkSync: (...args) => operations.push(['unlink', ...args]),
    statSync: (...args) => { operations.push(['stat', ...args]); return { isFile: () => true, size: 1 }; },
    readFileSync: (...args) => { operations.push(['read', ...args]); return '{}'; },
  };
  assert.throws(() => writeWorkspaceJsonAtomically('relative.json', {}, dependencies({ fs: fakeFs })));
  assert.deepEqual(operations, []);
});

test('JSON reads require a regular file and enforce size limits before parsing', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mad-station-read-transfer-'));
  try {
    const target = path.join(directory, 'backup.json');
    fs.writeFileSync(target, JSON.stringify({ format: 'mad-station-backup' }), 'utf8');
    assert.deepEqual(readWorkspaceJson(target, dependencies()), { format: 'mad-station-backup' });
    assert.throws(() => readWorkspaceJson(target, dependencies({ fs: {
      statSync: () => ({ isFile: () => true, size: MAX_WORKSPACE_TRANSFER_BYTES + 1 }),
      readFileSync: () => { throw new Error('should not read oversized file'); },
      writeFileSync: fs.writeFileSync,
      renameSync: fs.renameSync,
      existsSync: fs.existsSync,
      unlinkSync: fs.unlinkSync,
    } })), /too large/);
    const directoryWithJsonExtension = path.join(directory, 'folder.json');
    fs.mkdirSync(directoryWithJsonExtension);
    assert.throws(() => readWorkspaceJson(directoryWithJsonExtension, dependencies()), /not a file/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('transfer JSON reader rejects invalid JSON', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mad-station-invalid-json-'));
  try {
    const target = path.join(directory, 'invalid.json');
    fs.writeFileSync(target, '{invalid', 'utf8');
    assert.throws(() => readWorkspaceJson(target, dependencies()), SyntaxError);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

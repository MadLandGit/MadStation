const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createAiLabCredentialStore } = require('../build/main/ai-lab-credentials.js');

// Test-only reversible transform stands in for Electron safeStorage; production
// encryption is provided exclusively by Electron's OS-backed safeStorage API.
function createFakeSafeStorage(overrides = {}) {
  const encryptBytes = (value) => Buffer.from(Buffer.from(value).map((byte) => byte ^ 0x5a));
  const decryptBytes = (value) => Buffer.from(Buffer.from(value).map((byte) => byte ^ 0x5a)).toString('utf8');
  return {
    isEncryptionAvailable: () => true,
    getSelectedStorageBackend: () => 'dpapi',
    encryptString: encryptBytes,
    decryptString: decryptBytes,
    ...overrides,
  };
}

function createStore(overrides = {}) {
  const root = overrides.root || fs.mkdtempSync(path.join(os.tmpdir(), 'mad-station-ai-lab-credentials-'));
  const filePath = path.join(root, 'ai-lab-credentials.json');
  let nextSuffix = 'test-123';
  const dependencies = {
    getFilePath: () => filePath,
    path,
    fs,
    safeStorage: createFakeSafeStorage(),
    encodeBase64: (value) => Buffer.from(value).toString('base64'),
    decodeBase64: (value) => Buffer.from(value, 'base64'),
    temporarySuffix: () => nextSuffix,
    ...overrides,
  };
  return { root, filePath, dependencies, controller: createAiLabCredentialStore(dependencies), setSuffix: (value) => { nextSuffix = value; } };
}

test('AI Lab credential store encrypts before writing, preserves envelope shape, and round-trips credentials', async () => {
  const setup = createStore();
  try {
    const secret = 'sk-test-super-secret-abcdef';
    assert.equal(await setup.controller.write({ 'model-1': secret, 'model-2': 'another-secret' }), true);
    const rawText = fs.readFileSync(setup.filePath, 'utf8');
    const envelope = JSON.parse(rawText);
    assert.equal(envelope.format, 'mad-station-secure-credentials');
    assert.equal(envelope.version, 1);
    assert.equal(typeof envelope.data, 'string');
    assert.doesNotMatch(rawText, /sk-test-super-secret-abcdef|another-secret/);
    assert.deepEqual(await setup.controller.read(), { 'model-1': secret, 'model-2': 'another-secret' });
    assert.deepEqual(fs.readdirSync(setup.root), ['ai-lab-credentials.json']);
    if (process.platform !== 'win32') {
      assert.equal(fs.statSync(setup.filePath).mode & 0o777, 0o600);
    }
  } finally {
    fs.rmSync(setup.root, { recursive: true, force: true });
  }
});

test('credential storage prefers async OS APIs when supplied', async () => {
  const calls = [];
  const safeStorage = createFakeSafeStorage({
    encryptStringAsync: async (value) => { calls.push('encrypt-async'); return Buffer.from(value).map((byte) => byte ^ 0x5a); },
    decryptStringAsync: async (value) => { calls.push('decrypt-async'); return Buffer.from(value.map((byte) => byte ^ 0x5a)).toString('utf8'); },
  });
  const setup = createStore({ safeStorage });
  try {
    await setup.controller.write({ model: 'secret' });
    assert.deepEqual(await setup.controller.read(), { model: 'secret' });
    assert.deepEqual(calls, ['encrypt-async', 'decrypt-async']);
  } finally {
    fs.rmSync(setup.root, { recursive: true, force: true });
  }
});

test('credential storage refuses unavailable and basic-text backends before writing', async () => {
  for (const safeStorage of [
    createFakeSafeStorage({ isEncryptionAvailable: () => false }),
    createFakeSafeStorage({ getSelectedStorageBackend: () => 'basic_text' }),
  ]) {
    const setup = createStore({ safeStorage });
    try {
      await assert.rejects(setup.controller.write({ model: 'secret' }), /Secure credential storage is unavailable/);
      assert.equal(fs.existsSync(setup.filePath), false);
      assert.deepEqual(await setup.controller.read(), {});
    } finally {
      fs.rmSync(setup.root, { recursive: true, force: true });
    }
  }
});

test('missing, malformed, and incorrectly shaped credential records read as empty without destructive repair', async () => {
  const setup = createStore();
  try {
    assert.deepEqual(await setup.controller.read(), {});
    fs.writeFileSync(setup.filePath, '{broken-json');
    assert.deepEqual(await setup.controller.read(), {});
    fs.writeFileSync(setup.filePath, JSON.stringify({ format: 'other', data: 'abc' }));
    assert.deepEqual(await setup.controller.read(), {});
    const invalidItems = Buffer.from(JSON.stringify({ items: { model: 123 } })).map((byte) => byte ^ 0x5a);
    fs.writeFileSync(setup.filePath, JSON.stringify({ format: 'mad-station-secure-credentials', version: 1, data: invalidItems.toString('base64') }));
    assert.deepEqual(await setup.controller.read(), {});
    assert.equal(fs.existsSync(setup.filePath), true);
  } finally {
    fs.rmSync(setup.root, { recursive: true, force: true });
  }
});

test('exclusive temp writes do not overwrite or delete a colliding temp file', async () => {
  const setup = createStore();
  const temporary = `${setup.filePath}.tmp-test-123`;
  try {
    fs.writeFileSync(temporary, 'do not remove me');
    await assert.rejects(setup.controller.write({ model: 'secret' }), /already exists|EEXIST/i);
    assert.equal(fs.readFileSync(temporary, 'utf8'), 'do not remove me');
    assert.equal(fs.existsSync(setup.filePath), false);
  } finally {
    fs.rmSync(setup.root, { recursive: true, force: true });
  }
});

test('invalid credential objects and unsafe temp tokens are rejected', async () => {
  const setup = createStore();
  try {
    await assert.rejects(setup.controller.write({ model: 42 }), /Invalid AI Lab credential data/);
    setup.setSuffix('../bad');
    await assert.rejects(setup.controller.write({ model: 'secret' }), /Invalid temporary file token/);
    assert.equal(fs.existsSync(setup.filePath), false);
    assert.deepEqual(fs.readdirSync(setup.root), []);
  } finally {
    fs.rmSync(setup.root, { recursive: true, force: true });
  }
});

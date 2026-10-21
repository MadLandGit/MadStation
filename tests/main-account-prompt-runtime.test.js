const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createAccountPromptRuntime } = require('../build/main/account-prompt-runtime.js');

function createHarness(options = {}) {
  const calls = [];
  const wc = {
    destroyed: false,
    loading: false,
    isDestroyed() { return this.destroyed; },
    isLoading() { return this.loading; },
    getURL() { return 'https://provider.example/chat'; },
    getTitle() { return 'Chat'; },
    async executeJavaScript(script, userGesture) {
      calls.push(['executeJavaScript', script.includes('secret prompt'), userGesture]);
      if (options.executeError) throw new Error('page unavailable');
      return { ok: true, text: 'assistant response' };
    },
  };
  const account = { id: 'account-1', serviceId: 'provider-1', name: 'Account One', url: 'https://provider.example', icon: '', preferences: {} };
  const view = { webContents: wc };
  const runtime = createAccountPromptRuntime({
    getAccount: (id) => id === account.id ? account : null,
    getService: (id) => id === 'provider-1' ? { id, name: 'Provider One' } : null,
    getWorkspaceApp: () => options.workspace || 'ai-lab',
    markBorrowedAccountView: (id, borrowed) => calls.push(['borrowed', id, borrowed]),
    createAccountView: (_account, viewOptions) => { calls.push(['createAccountView', viewOptions]); return options.unavailable ? null : view; },
    createForgeBrowserView: () => { calls.push(['createForgeBrowserView']); return options.unavailable ? null : view; },
    closeForgeBrowserView: (id) => calls.push(['closeForgeBrowserView', id]),
    removeAccountView: (id, cleanupOptions) => calls.push(['removeAccountView', id, cleanupOptions]),
    pushForgeBrowserState: () => calls.push(['pushForgeBrowserState']),
  });
  return { runtime, calls, wc, account };
}

test('AI Lab account request uses the existing authenticated AI Hub view and releases borrowed view afterward', async () => {
  const h = createHarness({ workspace: 'ai-lab' });
  const result = await h.runtime.request('account-1', 'secret prompt');
  assert.equal(result.ok, true);
  assert.equal(result.text, 'assistant response');
  assert.equal(result.accountId, 'account-1');
  assert.ok(h.calls.some((call) => call[0] === 'createAccountView' && call[1].allowOutsideWorkspace === true));
  assert.deepEqual(h.calls.filter((call) => call[0] === 'borrowed').map((call) => call[2]), [true, false]);
  assert.ok(h.calls.some((call) => call[0] === 'removeAccountView'));
  assert.ok(h.calls.some((call) => call[0] === 'executeJavaScript' && call[2] === true));
});

test('Instruction Forge reuses its live view and broadcasts its browser state without removing it', async () => {
  const h = createHarness({ workspace: 'instruction-forge' });
  const result = await h.runtime.request('account-1', 'secret prompt', '', { workspace: 'instruction-forge' });
  assert.equal(result.ok, true);
  assert.ok(h.calls.some((call) => call[0] === 'createForgeBrowserView'));
  assert.ok(h.calls.some((call) => call[0] === 'pushForgeBrowserState'));
  assert.equal(h.calls.some((call) => call[0] === 'removeAccountView'), false);
  assert.equal(h.calls.some((call) => call[0] === 'borrowed'), false);
});

test('request rejects unknown accounts before creating a native view', async () => {
  const h = createHarness();
  const result = await h.runtime.request('missing', 'hello');
  assert.deepEqual(result, { ok: false, error: 'AI Hub account not found.' });
  assert.equal(h.calls.length, 0);
});

test('unavailable session is reported and temporary borrowed state is always cleared', async () => {
  const h = createHarness({ workspace: 'ai-lab', unavailable: true });
  const result = await h.runtime.request('account-1', 'hello');
  assert.deepEqual(result, { ok: false, error: 'AI Hub account session is unavailable.' });
  assert.deepEqual(h.calls.filter((call) => call[0] === 'borrowed').map((call) => call[2]), [true, false]);
  assert.ok(h.calls.some((call) => call[0] === 'removeAccountView'));
});

test('account session prompt requests are denied outside their owning workspace before side effects', async () => {
  const h = createHarness({ workspace: 'clipboard' });
  const result = await h.runtime.request('account-1', 'hello');
  assert.deepEqual(result, { ok: false, error: 'Open AI Lab to use account requests.' });
  assert.equal(h.calls.length, 0);
  const mismatchedForge = createHarness({ workspace: 'ai-lab' });
  const forgeResult = await mismatchedForge.runtime.request('account-1', 'hello', '', { workspace: 'instruction-forge' });
  assert.deepEqual(forgeResult, { ok: false, error: 'Open Instruction Forge to use account requests.' });
  assert.equal(mismatchedForge.calls.length, 0);
});

test('browser execution error is returned safely and workspace-borrowed view cleanup still runs', async () => {
  const h = createHarness({ workspace: 'ai-lab', executeError: true });
  const result = await h.runtime.request('account-1', 'hello');
  assert.deepEqual(result, { ok: false, error: 'page unavailable' });
  assert.ok(h.calls.some((call) => call[0] === 'removeAccountView'));
});

test('main.js delegates authenticated account prompt automation to the typed runtime', () => {
  const root = path.join(__dirname, '..');
  const main = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.match(main, /createAccountPromptRuntime/);
  assert.match(main, /accountPromptRuntime\.request\(accountId, prompt, side, options\)/);
  assert.match(pkg.scripts['build:main-modules'], /src\/main\/account-prompt-runtime\.ts/);
  assert.match(pkg.scripts.test, /tests\/main-account-prompt-runtime\.test\.js/);
});

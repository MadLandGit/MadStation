const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createArenaPromptRuntime } = require('../build/main/arena-prompt-runtime.js');

function makeWebContents(options = {}) {
  const calls = [];
  const wc = {
    isDestroyed: () => Boolean(options.destroyed),
    isLoading: () => false,
    once(event, listener) { calls.push(['once', event]); return this; },
    removeListener(event, listener) { calls.push(['removeListener', event]); return this; },
    async executeJavaScript(script) {
      calls.push(['script', script]);
      if (script.includes('document.activeElement')) return options.remainingText ?? 0;
      if (script.includes('send-button') || script.includes('submit')) return options.clickSend !== false;
      if (script.includes('querySelectorAll')) return { ok: options.editorFound !== false };
      return { ok: true };
    },
    focus() { calls.push(['focus']); },
    insertText(text) { calls.push(['insertText', text]); },
    sendInputEvent(event) { calls.push(['input', event.type, event.keyCode]); },
  };
  return { wc, calls };
}
function harness(options = {}) {
  const left = makeWebContents(options.left || {});
  const right = makeWebContents(options.right || {});
  const views = { left: { webContents: left.wc }, right: { webContents: right.wc } };
  const runtime = createArenaPromptRuntime({
    getWorkspaceApp: () => options.workspaceApp || 'ai-lab',
    getControlMode: () => options.controlMode || 'launcher',
    getViewForSide: (side) => options.missingSide === side ? null : views[side],
    sleep: async () => {},
  });
  return { runtime, views, left, right };
}

test('prompt validation rejects empty text, wrong workspace, and missing selected browsers', async () => {
  const h = harness();
  assert.match((await h.runtime.sendPrompt('  ')).error, /write a question/i);
  const wrong = harness({ workspaceApp: 'notes', controlMode: 'launcher' });
  assert.match((await wrong.runtime.sendPrompt('hello')).error, /open the arena/i);
  const hidden = harness({ workspaceApp: 'ai-lab', controlMode: 'app' });
  assert.match((await hidden.runtime.sendPrompt('hello')).error, /open the arena/i);
  assert.equal(hidden.left.calls.length, 0);
  const missing = harness({ missingSide: 'right' });
  assert.match((await missing.runtime.sendPrompt('hello')).error, /both browsers/i);
});

test('prompt is normalized, typed into both selected browsers, and dispatched using Enter', async () => {
  const h = harness();
  const result = await h.runtime.sendPrompt('  compare these\r\nanswers  ');
  assert.equal(result.ok, true);
  assert.equal(result.left.ok, true);
  assert.equal(result.right.ok, true);
  for (const side of ['left', 'right']) {
    const calls = h[side].calls;
    assert.ok(calls.some((call) => call[0] === 'insertText' && call[1] === 'compare these\nanswers'));
    assert.deepEqual(calls.filter((call) => call[0] === 'input').map((call) => call.slice(1)), [['keyDown', 'Enter'], ['char', '\r'], ['keyUp', 'Enter']]);
  }
});

test('send workflow caps input at 20,000 characters and reports editor lookup failures', async () => {
  const h = harness();
  const result = await h.runtime.sendPrompt('a'.repeat(25_000));
  assert.equal(h.left.calls.find((call) => call[0] === 'insertText')[1].length, 20_000);
  const noEditor = harness({ right: { editorFound: false } });
  const failed = await noEditor.runtime.sendPrompt('question');
  assert.equal(failed.ok, false);
  assert.match(failed.right.error, /could not find the chat box/i);
});

test('send-button fallback is used only when the message remains in the editor', async () => {
  const h = harness({ left: { remainingText: 5, clickSend: true }, right: { remainingText: 5, clickSend: false } });
  const result = await h.runtime.sendPrompt('question');
  assert.equal(result.left.ok, true);
  assert.equal(result.right.ok, false);
  assert.match(result.right.error, /did not send it/i);
});

test('destroyed browsers are rejected before any typing attempt', async () => {
  const h = harness({ left: { destroyed: true } });
  assert.match((await h.runtime.sendPrompt('question')).error, /both browsers/i);
  assert.equal(h.left.calls.some((call) => call[0] === 'insertText'), false);
});

test('Arena prompt runtime is wired through the host and build/test/package lists', () => {
  const root = path.join(__dirname, '..');
  const main = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.match(main, /createArenaPromptRuntime\(/);
  assert.match(main, /function arenaSendPrompt\(rawPrompt\) \{ return arenaPromptRuntime\.sendPrompt\(rawPrompt\); \}/);
  assert.match(pkg.scripts['build:main-modules'], /src\/main\/arena-prompt-runtime\.ts/);
  assert.match(pkg.scripts.test, /tests\/main-arena-prompt-runtime\.test\.js/);
  assert.match(main, /'src\/main\/arena-prompt-runtime\.ts'/);
  assert.match(JSON.stringify(pkg.build.extraResources), /main\/arena-prompt-runtime\.ts/);
});

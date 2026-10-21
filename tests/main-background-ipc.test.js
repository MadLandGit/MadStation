const test = require('node:test');
const assert = require('node:assert/strict');
const { registerBackgroundIpcHandlers } = require('../build/main/background-ipc.js');

function makeRegistrar() {
  const handlers = new Map();
  const handle = (channel, handler, options) => {
    assert.equal(handlers.has(channel), false, `duplicate handler: ${channel}`);
    handlers.set(channel, { handler, options });
  };
  return { handle, handlers };
}

test('background IPC module preserves channel names and delegates command calls', async () => {
  const registrar = makeRegistrar();
  const calls = [];
  registerBackgroundIpcHandlers(registrar.handle, {
    chooseBackgroundFile: () => { calls.push(['choose']); return { ok: true, background: { id: 'local-1' } }; },
    removeBackground: (id) => { calls.push(['remove', id]); return { ok: true, settings: {} }; },
  });
  assert.deepEqual([...registrar.handlers.keys()], ['choose-background-file', 'remove-background']);
  assert.deepEqual(await registrar.handlers.get('choose-background-file').handler({}), { ok: true, background: { id: 'local-1' } });
  assert.deepEqual(await registrar.handlers.get('remove-background').handler({}, 'local-1'), { ok: true, settings: {} });
  assert.deepEqual(calls, [['choose'], ['remove', 'local-1']]);
});

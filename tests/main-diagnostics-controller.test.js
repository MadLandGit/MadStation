const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  redactDiagnosticText,
  diagnosticError,
  summarizeMemoryForDiagnostics,
  normalizeDiagnosticsExportPath,
  writeDiagnosticsJsonAtomically,
  createDiagnosticsController,
} = require('../build/main/diagnostics-controller.js');

function fileDependencies(overrides = {}) {
  return {
    path,
    fs,
    temporarySuffix: () => 'test-123',
    ...overrides,
  };
}

test('diagnostic text redacts URLs, local paths, bearer credentials, and multiline content', () => {
  const input = `Provider failed at https://example.test/path?token=secret for "C:\\Users\\Some Person\\Mad Station\\profile.json"; home /home/alex/private/config.json\nBearer abc.def.ghi api_key=supersecret`;
  const result = redactDiagnosticText(input, 2000);
  assert.doesNotMatch(result, /https:\/\/example\.test/);
  assert.doesNotMatch(result, /Some Person/);
  assert.doesNotMatch(result, /\/home\/alex/);
  assert.doesNotMatch(result, /abc\.def\.ghi/);
  assert.doesNotMatch(result, /supersecret/);
  assert.match(result, /\[redacted-url\]/);
  assert.match(result, /\[redacted-path\]/);
  assert.doesNotMatch(result, /[\r\n]/);
  assert.equal(redactDiagnosticText('abcdefghij', 4), 'abcd');
});

test('diagnosticError uses the generic fallback when an error has no useful message', () => {
  assert.equal(diagnosticError(new Error('Could not read C:\\Users\\A User\\settings.json')), 'Could not read [redacted-path]');
  assert.equal(diagnosticError('', 'Could not export diagnostics.'), 'Could not export diagnostics.');
});

test('memory diagnostic summary returns only normalized numeric aggregates', () => {
  assert.deepEqual(summarizeMemoryForDiagnostics({ totalKb: '100', mainKb: 20, aiHubKb: 3, arenaKb: 4, forgeKb: 5, gpuKb: 'bad' }), {
    appWorkingSetKb: 100,
    mainKb: 20,
    browserKb: 12,
    aiHubKb: 3,
    arenaKb: 4,
    forgeKb: 5,
    gpuKb: 0,
    uiKb: 0,
    systemTotalKb: 0,
    systemAvailableKb: 0,
  });
  assert.equal(summarizeMemoryForDiagnostics(null).appWorkingSetKb, 0);
});

test('diagnostic export path validation requires an absolute .json target', () => {
  const valid = path.join(os.tmpdir(), 'Mad-Station-diagnostics.json');
  assert.equal(normalizeDiagnosticsExportPath(valid, path), path.resolve(valid));
  assert.equal(normalizeDiagnosticsExportPath('C:\\Users\\A User\\diagnostics.json', path.win32), path.win32.resolve('C:\\Users\\A User\\diagnostics.json'));
  for (const invalid of [undefined, '', 'diagnostics.json', path.join(os.tmpdir(), 'diagnostics.txt'), path.join(os.tmpdir(), 'bad\0name.json'), 'x'.repeat(32768)]) {
    assert.throws(() => normalizeDiagnosticsExportPath(invalid, path));
  }
  assert.throws(() => normalizeDiagnosticsExportPath('relative.json', path.win32));
  assert.throws(() => normalizeDiagnosticsExportPath('C:\\Users\\A\\diagnostics.txt', path.win32));
});

test('diagnostics writer atomically writes valid JSON and removes its temp file', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mad-station-diagnostics-'));
  try {
    const target = path.join(directory, 'diagnostics.json');
    writeDiagnosticsJsonAtomically(target, { format: 'mad-station-diagnostics', ok: true }, fileDependencies());
    assert.deepEqual(JSON.parse(fs.readFileSync(target, 'utf8')), { format: 'mad-station-diagnostics', ok: true });
    assert.deepEqual(fs.readdirSync(directory), ['diagnostics.json']);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('invalid diagnostics targets are rejected before any filesystem mutation', () => {
  const operations = [];
  const fakeFs = {
    writeFileSync: (...args) => operations.push(['write', ...args]),
    renameSync: (...args) => operations.push(['rename', ...args]),
    existsSync: (...args) => { operations.push(['exists', ...args]); return false; },
    unlinkSync: (...args) => operations.push(['unlink', ...args]),
  };
  assert.throws(() => writeDiagnosticsJsonAtomically('not-absolute.txt', {}, fileDependencies({ fs: fakeFs })));
  assert.deepEqual(operations, []);
});

test('diagnostics controller sanitizes returned errors, handles cancellation, and never returns the local export path', async () => {
  let optionsSeen;
  let written;
  let collected;
  const controller = createDiagnosticsController({
    collectDiagnostics: async (options) => {
      collected = options;
      if (options.probeProviders && controller.failProbe) throw new Error('Provider failed at https://user:secret@example.test and C:\\Users\\Alice\\profile.json');
      return { providers: [{ host: 'example.test' }] };
    },
    showSaveDialog: async (options) => { optionsSeen = options; return { canceled: false, filePath: path.join(os.tmpdir(), 'private-user-diagnostics.json') }; },
    writeDiagnosticsFile: (filePath, data) => { written = { filePath, data }; },
    defaultFileName: () => 'Mad-Station-diagnostics-2026-10-15.json',
  });
  assert.deepEqual(await controller.getDiagnostics(), { ok: true, data: { providers: [{ host: 'example.test' }] } });
  assert.deepEqual(collected, { probeProviders: false });
  assert.deepEqual(await controller.checkProviderCompatibility(), { ok: true, providers: [{ host: 'example.test' }] });
  const exported = await controller.exportDiagnostics();
  assert.deepEqual(exported, { ok: true });
  assert.equal(written.filePath, path.join(os.tmpdir(), 'private-user-diagnostics.json'));
  assert.deepEqual(optionsSeen.filters, [{ name: 'Diagnostics JSON', extensions: ['json'] }]);
  assert.equal(optionsSeen.defaultPath, 'Mad-Station-diagnostics-2026-10-15.json');
  assert.doesNotMatch(JSON.stringify(exported), /private-user/);

  const cancelled = createDiagnosticsController({
    collectDiagnostics: async () => ({}),
    showSaveDialog: async () => ({ canceled: true }),
    writeDiagnosticsFile: () => assert.fail('must not write after cancellation'),
    defaultFileName: () => 'diagnostics.json',
  });
  assert.deepEqual(await cancelled.exportDiagnostics(), { ok: false, canceled: true });

  controller.failProbe = true;
  const failure = await controller.checkProviderCompatibility();
  assert.equal(failure.ok, false);
  assert.doesNotMatch(failure.error, /https:\/\/|Alice|profile\.json|secret/);
});

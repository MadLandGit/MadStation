const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildThemeDesignPack, discoverThemeDesigns } = require('../build/main/theme-design-export.js');
const { scanThemePackZip, importScannedThemePack, getImportedThemeCatalog, removeImportedTheme, getThemeImportRestartStatus, clearThemeImportRestartStatus } = require('../build/main/theme-pack-import.js');

const sourceRoot = path.join(__dirname, '..', 'src');


function crc32Bytes(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeStoredZip(entries, options = {}) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const [name, value] of Object.entries(entries)) {
    const nameBuffer = Buffer.from(name, 'utf8');
    const content = Buffer.isBuffer(value) ? value : Buffer.from(value, 'utf8');
    const checksum = crc32Bytes(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(content.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, nameBuffer, content);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0314, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(content.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt32LE(offset, 42);
    if (options.symlinkEntries?.includes(name)) central.writeUInt32LE(0xa1ff0000, 38);
    centralParts.push(central, nameBuffer);
    offset += local.length + nameBuffer.length + content.length;
  }
  const localData = Buffer.concat(localParts);
  const centralData = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(entries).length, 8);
  eocd.writeUInt16LE(Object.keys(entries).length, 10);
  eocd.writeUInt32LE(centralData.length, 12);
  eocd.writeUInt32LE(localData.length, 16);
  return Buffer.concat([localData, centralData, eocd]);
}

function makeTempRoot(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeZip(root, zipName, result) {
  const file = path.join(root, zipName);
  fs.writeFileSync(file, result.archive);
  return file;
}

test('built-in theme ZIP imports are custom additions and never replace the canonical source', () => {
  const temporary = makeTempRoot('madstation-theme-pack-import-');
  try {
    const userData = path.join(temporary, 'user-data');
    const themes = discoverThemeDesigns(sourceRoot);
    const originalBuiltin = fs.readFileSync(path.join(sourceRoot, 'home-v2.html'), 'utf8');
    const pack = buildThemeDesignPack(sourceRoot, themes.map((theme) => theme.id));
    const zipPath = writeZip(temporary, 'complete-themes.zip', pack);
    const scan = scanThemePackZip(zipPath, sourceRoot, userData, themes);

    assert.equal(scan.ok, true);
    assert.equal(scan.manifestPresent, true);
    assert.equal(scan.instructionsPresent, true);
    assert.equal(scan.themeCount, themes.length, 'the complete built-in pack reports every theme discovered from source');
    assert.ok(scan.warnings.some((warning) => /always added as separate custom themes/i.test(warning)));
    assert.ok(scan.themes.every((theme) => theme.status === 'current'), 'untouched built-in exports are recognized as matching source');

    const selected = scan.themes.find((theme) => theme.id === 'simple');
    assert.ok(selected, 'the Simple theme is discovered');
    assert.equal(selected.defaultAction, 'add', 'a built-in source export is never offered as a replacement');
    const imported = importScannedThemePack(userData, sourceRoot, scan.scanId, [
      { id: selected.id, action: 'add' },
    ]);
    assert.equal(imported.ok, true);
    assert.equal(imported.installed.length, 1);
    assert.equal(imported.installed[0].mode, 'custom-simple');
    assert.equal(imported.installed[0].kind, 'custom');
    assert.equal(imported.backupCount, 0);

    const installedRoot = path.join(userData, 'theme-imports', 'custom-simple');
    const html = fs.readFileSync(path.join(installedRoot, 'themes', 'home-v2.html'), 'utf8');
    assert.match(html, /theme-live-config\.js/, 'an app-owned per-theme config is injected');
    assert.match(html, /home-quick-access-theme\.js/, 'the trusted Quick Access controller is injected');
    assert.match(html, /theme-live-adapter\.js/, 'the trusted app-feature adapter is injected');
    assert.doesNotMatch(html, /visual-only-guard\.js/, 'the preview-only click blocker is not carried into the live theme');
    assert.ok(fs.existsSync(path.join(installedRoot, 'visual-js', 'theme-live-adapter.js')));
    assert.ok(fs.existsSync(path.join(userData, 'theme-imports', 'THEME_INTEGRATION.md')), 'the integration contract is present in the writable custom-theme area');
    assert.equal(fs.readFileSync(path.join(sourceRoot, 'home-v2.html'), 'utf8'), originalBuiltin, 'ZIP import leaves the built-in source untouched');
    assert.equal(imported.catalog.customThemes.length, 1);
    assert.deepEqual(imported.catalog.customThemes.map((item) => item.mode), ['custom-simple']);

    const rescan = scanThemePackZip(zipPath, sourceRoot, userData, themes);
    assert.equal(rescan.themes.find((theme) => theme.id === 'simple').status, 'current', 'the package fingerprint is tracked separately from built-in selection');
    const reimport = importScannedThemePack(userData, sourceRoot, rescan.scanId, [
      { id: 'simple', action: 'add' },
    ]);
    assert.equal(reimport.backupCount, 1, 'updating an existing custom copy backs up its previous version');
    assert.equal(getImportedThemeCatalog(userData).customThemes.length, 1);
    const rejectedScan = scanThemePackZip(zipPath, sourceRoot, userData, themes);
    assert.throws(() => importScannedThemePack(userData, sourceRoot, rejectedScan.scanId, [
      { id: 'simple', action: 'replace', replaceMode: 'v2' },
    ]), /selected theme action is invalid/i, 'legacy replacement action is rejected');
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('theme ZIP parser rejects traversal directories, symlinks, and local/central header confusion', () => {
  const temporary = makeTempRoot('madstation-theme-zip-structure-');
  try {
    const userData = path.join(temporary, 'user-data');
    const safePage = '<!doctype html><html><head><title>Safe</title></head><body>Safe</body></html>';

    const traversalPath = path.join(temporary, 'traversal-directory.zip');
    fs.writeFileSync(traversalPath, makeStoredZip({ '../escape/': '', 'themes/home-safe.html': safePage }));
    assert.throws(() => scanThemePackZip(traversalPath, sourceRoot, userData), /path traversal/i,
      'directory entries must go through path validation instead of being ignored');

    const symlinkPath = path.join(temporary, 'symlink.zip');
    fs.writeFileSync(symlinkPath, makeStoredZip({
      'themes/home-safe.html': safePage,
      'assets/escape.svg': '../outside.svg',
    }, { symlinkEntries: ['assets/escape.svg'] }));
    assert.throws(() => scanThemePackZip(symlinkPath, sourceRoot, userData), /symbolic-link/i,
      'Unix symlink metadata must not be accepted as an ordinary asset');

    const mismatchedPath = path.join(temporary, 'mismatched-header.zip');
    const mismatched = makeStoredZip({ 'themes/home-safe.html': safePage });
    mismatched[30] = 'X'.charCodeAt(0); // Alter the local name while preserving the central directory name.
    fs.writeFileSync(mismatchedPath, mismatched);
    assert.throws(() => scanThemePackZip(mismatchedPath, sourceRoot, userData), /local and central paths disagree/i,
      'the local data header must describe the same path as the central directory');
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('theme import rejects unquoted remote execution/resource attributes and hardens installed HTML', () => {
  const temporary = makeTempRoot('madstation-theme-import-security-');
  try {
    const userData = path.join(temporary, 'user-data');
    const makePack = (zipName, html) => {
      const zipPath = path.join(temporary, zipName);
      fs.writeFileSync(zipPath, makeStoredZip({ 'themes/home-safe.html': html }));
      return zipPath;
    };

    const remoteScript = makePack('unquoted-script.zip', '<!doctype html><html><head><title>Unsafe</title></head><body><script src=https://attacker.invalid/payload.js></script></body></html>');
    assert.throws(() => scanThemePackZip(remoteScript, sourceRoot, userData), /remote or unsafe resource|missing local JavaScript|external script/i,
      'unquoted script src attributes must not bypass import scanning');

    const remoteImage = makePack('unquoted-image.zip', '<!doctype html><html><head><title>Unsafe</title></head><body><img src=https://attacker.invalid/pixel.png></body></html>');
    assert.throws(() => scanThemePackZip(remoteImage, sourceRoot, userData), /remote or unsafe resource|unsupported embedded resource/i,
      'unquoted media URLs must not bypass the self-contained asset policy');

    const absoluteFile = makePack('absolute-file.zip', '<!doctype html><html><head><title>Unsafe</title></head><body><iframe src=/Users/example/private.html></iframe></body></html>');
    assert.throws(() => scanThemePackZip(absoluteFile, sourceRoot, userData), /remote or unsafe resource/i,
      'rooted filesystem paths must not be accepted as package media');

    const safeMarkup = makePack('safe-markup.zip', '<!doctype html><html><head><title>Safe</title><meta http-equiv=refresh content="0;url=https://attacker.invalid/"></head><body><button onclick=alert(1)>Button</button><a href=javascript:alert(1)>Link</a></body></html>');
    const scan = scanThemePackZip(safeMarkup, sourceRoot, userData);
    const imported = importScannedThemePack(userData, sourceRoot, scan.scanId, [{ id: scan.themes[0].id, action: 'add' }]);
    const installed = path.join(userData, 'theme-imports', imported.installed[0].mode, 'themes', 'home-safe.html');
    const html = fs.readFileSync(installed, 'utf8');
    assert.match(html, /Content-Security-Policy/i, 'every installed custom page receives an app-owned CSP');
    assert.match(html, /connect-src 'none'/, 'custom themes cannot make outbound connections');
    assert.match(html, /frame-src 'none'/, 'custom themes cannot create nested browsing contexts');
    assert.doesNotMatch(html, /http-equiv=refresh/i, 'meta refresh navigation is removed');
    assert.doesNotMatch(html, /\bonclick\s*=/i, 'unquoted event handlers are removed');
    assert.match(html, /href="#" aria-disabled="true"/i, 'unsafe unquoted anchor schemes are made inert');
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('a genuinely new theme is added as a selectable custom theme and its placeholder controls reconnect', () => {
  const temporary = makeTempRoot('madstation-custom-theme-import-');
  try {
    const fixtureSrc = path.join(temporary, 'fixture', 'src');
    const userData = path.join(temporary, 'user-data');
    fs.mkdirSync(fixtureSrc, { recursive: true });
    fs.copyFileSync(path.join(sourceRoot, 'THEME_INTEGRATION.md'), path.join(fixtureSrc, 'THEME_INTEGRATION.md'));
    fs.writeFileSync(path.join(fixtureSrc, 'home-nebula.html'), `<!doctype html>
<html><head><meta charset="utf-8"><title>Nebula Workspace</title><link rel="stylesheet" href="home-nebula.css"></head>
<body><button id="themeBtn">Settings</button><button data-theme-quick-trigger aria-label="Quick Access">Quick Access</button>
<div class="tile" data-app-id="browser">Browser</div></body></html>`);
    fs.writeFileSync(path.join(fixtureSrc, 'home-nebula.css'), 'body{margin:0;background:#101827;color:#fff}button{padding:8px;border-radius:8px}.tile{padding:24px}');

    const found = discoverThemeDesigns(fixtureSrc);
    assert.equal(found.length, 1);
    assert.equal(found[0].id, 'nebula');
    const pack = buildThemeDesignPack(fixtureSrc, ['nebula']);
    const zipPath = writeZip(temporary, 'nebula.zip', pack);
    const scan = scanThemePackZip(zipPath, sourceRoot, userData, discoverThemeDesigns(sourceRoot));
    assert.equal(scan.instructionsPresent, true);
    assert.equal(scan.themes[0].status, 'new');
    assert.equal(scan.themes[0].defaultAction, 'add');

    const result = importScannedThemePack(userData, sourceRoot, scan.scanId, [{ id: 'nebula', action: 'add' }]);
    assert.equal(result.installed[0].kind, 'custom');
    assert.match(result.installed[0].mode, /^custom-nebula/);
    assert.equal(result.catalog.customThemes.length, 1);
    assert.ok(result.catalog.options.some((item) => item.id === result.installed[0].mode && item.custom));

    const importedRoot = path.join(userData, 'theme-imports', result.installed[0].mode);
    const html = fs.readFileSync(path.join(importedRoot, 'themes', 'home-nebula.html'), 'utf8');
    assert.match(html, /id="themeBtn"/, 'theme markup is preserved');
    assert.match(html, /theme-live-adapter\.js/, 'Settings and other placeholder controls receive the app-owned adapter');
    assert.match(html, /home-quick-access-theme\.js/, 'Quick Access functionality is attached to the imported theme');
    assert.ok(fs.existsSync(path.join(importedRoot, 'shared-css', 'home-nebula.css')));
    const config = fs.readFileSync(path.join(importedRoot, 'visual-js', 'theme-live-config.js'), 'utf8');
    assert.match(config, /Nebula Workspace/);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});


test('custom theme identity follows the manifest ID, not a reused source filename', () => {
  const temporary = makeTempRoot('madstation-reused-theme-filename-');
  try {
    const userData = path.join(temporary, 'user-data');
    const guide = fs.readFileSync(path.join(sourceRoot, 'THEME_INTEGRATION.md'), 'utf8');
    const makeThemeZip = (zipName, id, title, marker) => {
      const manifest = {
        format: 'mad-station-theme-pack',
        packageTitle: `${title} pack`,
        integrationContract: 'madstation-theme-api-v1',
        instructionsFile: 'THEME_INTEGRATION.md',
        themes: [{ id, title, description: `${title} test theme`, entry: 'themes/home-v2.html' }],
      };
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body><main data-theme-marker="${marker}">${title}</main></body></html>`;
      const zipPath = path.join(temporary, zipName);
      fs.writeFileSync(zipPath, makeStoredZip({
        'madstation-theme-pack.json': JSON.stringify(manifest),
        'THEME_INTEGRATION.md': guide,
        'themes/home-v2.html': html,
      }));
      return zipPath;
    };

    const potatoZip = makeThemeZip('potato.zip', 'potato', 'Potato', 'potato');
    const potatoScan = scanThemePackZip(potatoZip, sourceRoot, userData, discoverThemeDesigns(sourceRoot));
    assert.equal(potatoScan.themes[0].defaultAction, 'add', 'a custom ID wins over the reused built-in filename');
    const potatoImport = importScannedThemePack(userData, sourceRoot, potatoScan.scanId, [{ id: 'potato', action: 'add' }]);
    assert.equal(potatoImport.installed[0].mode, 'custom-potato');

    const simpleZip = makeThemeZip('simple.zip', 'simple', 'Simple Theme', 'simple');
    const simpleScan = scanThemePackZip(simpleZip, sourceRoot, userData, discoverThemeDesigns(sourceRoot));
    assert.equal(simpleScan.themes[0].defaultAction, 'add', 'a custom theme is offered as Add even when it reuses home-v2.html');
    const simpleImport = importScannedThemePack(userData, sourceRoot, simpleScan.scanId, [{ id: 'simple', action: 'add' }]);
    assert.equal(simpleImport.installed[0].mode, 'custom-simple');
    assert.equal(simpleImport.catalog.customThemes.length, 2, 'both differently identified themes remain installed');

    const registryPath = path.join(userData, 'theme-imports', 'installed-themes.json');
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    assert.deepEqual(registry.themes.filter((item) => item.kind === 'custom').map((item) => item.mode).sort(), ['custom-potato', 'custom-simple']);
    for (const [mode, expected] of [['custom-potato', 'potato'], ['custom-simple', 'simple']]) {
      const html = fs.readFileSync(path.join(userData, 'theme-imports', mode, 'themes', 'home-v2.html'), 'utf8');
      assert.match(html, new RegExp(`data-theme-marker="${expected}"`), `${mode} retains its own page contents`);
    }

    const reimportScan = scanThemePackZip(simpleZip, sourceRoot, userData, discoverThemeDesigns(sourceRoot));
    assert.equal(reimportScan.themes[0].status, 'current', 'the matching custom ID is compared independently of another theme with the same filename');
    assert.equal(reimportScan.themes[0].defaultAction, 'add', 're-importing a custom theme keeps its custom slot as the default target');
    const reimport = importScannedThemePack(userData, sourceRoot, reimportScan.scanId, [{ id: 'simple', action: 'add' }]);
    assert.equal(reimport.installed[0].mode, 'custom-simple', 're-importing the same ID updates the same custom slot');
    assert.equal(reimport.catalog.customThemes.length, 2, 're-import does not create a duplicate custom theme');
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('third-party ZIPs without an instruction file are reported and still receive the default integration contract', () => {
  const temporary = makeTempRoot('madstation-no-instructions-theme-');
  try {
    const userData = path.join(temporary, 'user-data');
    const zipPath = path.join(temporary, 'external-theme.zip');
    fs.writeFileSync(zipPath, makeStoredZip({
      'themes/home-nocturne.html': '<!doctype html><html><head><title>Nocturne</title><style>body{background:#101018;color:#fff}</style></head><body><button id="themeBtn">Appearance</button><button data-theme-quick-trigger>Quick Access</button></body></html>',
    }));
    const scan = scanThemePackZip(zipPath, sourceRoot, userData, discoverThemeDesigns(sourceRoot));
    assert.equal(scan.instructionsPresent, false);
    assert.ok(scan.warnings.some((warning) => /instruction/i.test(warning)), 'the scan warns instead of falsely claiming that instructions exist');
    assert.equal(scan.themes.length, 1);
    assert.equal(scan.themes[0].defaultAction, 'add');

    const result = importScannedThemePack(userData, sourceRoot, scan.scanId, [{ id: scan.themes[0].id, action: 'add' }]);
    assert.equal(result.ok, true);
    assert.equal(result.restartRequired, false, 'theme imports refresh through the live homepage catalogue without requiring a restart');
    assert.equal(result.restartStatus.required, false);
    assert.equal(getThemeImportRestartStatus(userData).required, false, 'ordinary theme imports do not leave a stale restart notice');
    assert.equal(fs.existsSync(path.join(userData, 'theme-imports', 'restart-required.json')), false);
    assert.ok(fs.existsSync(path.join(userData, 'theme-imports', 'THEME_INTEGRATION.md')), 'the shipped contract is present even for external ZIPs that omit it');
    const installedRoot = path.join(userData, 'theme-imports', result.installed[0].mode);
    const html = fs.readFileSync(path.join(installedRoot, 'themes', 'home-nocturne.html'), 'utf8');
    assert.match(html, /theme-live-adapter\.js/);
    assert.match(html, /home-quick-access-theme\.js/);
    clearThemeImportRestartStatus(userData);
    assert.equal(getThemeImportRestartStatus(userData).required, false, 'there is no restart notice to clear for live-applied imports');
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});


test('integration contract ships in the default application package', () => {
  const appPackage = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  assert.ok(fs.existsSync(path.join(sourceRoot, 'THEME_INTEGRATION.md')));
  assert.ok(appPackage.build.files.includes('src/**/*'), 'the instruction source is included in the application payload');
  assert.ok(appPackage.build.extraResources.some((item) => item.from === 'src/THEME_INTEGRATION.md' && item.to === 'developer-docs/THEME_INTEGRATION.md'), 'the instruction is also accessible as a packaged developer reference');
});


test('Settings shows the restart notice only when the app-restart status is explicitly required', () => {
  const ui = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer-react', 'information-security-panels.tsx'), 'utf8');
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  const preload = fs.readFileSync(path.join(__dirname, '..', 'src', 'preload.ts'), 'utf8');
  const styles = fs.readFileSync(path.join(__dirname, '..', 'src', 'styles.css'), 'utf8');
  assert.match(ui, /Restart required to apply theme changes/);
  assert.match(ui, /Restart App Now/);
  assert.match(ui, /restartForThemeChanges/);
  assert.match(ui, /themeRestartStatus\?\.required/, 'the restart card is hidden unless the status says a restart is needed');
  assert.match(ui, /requestDeveloperSettingsAction\('restart-status'\)/);
  assert.match(main, /handleDeveloper\('get-theme-import-restart-status'/);
  assert.match(preload, /getThemeImportRestartStatus: \(\) => invoke\('get-theme-import-restart-status'\)/);
  assert.match(styles, /\.theme-restart-notice/);
  assert.match(ui, /action\(\{ type: 'scan-theme-pack' \}\)/, 'successful imports refresh the export catalogue immediately');
});


test('deleting an imported custom theme removes it from the registry, catalogue, and subsequent package configs', () => {
  const temporary = makeTempRoot('madstation-delete-custom-theme-');
  try {
    const fixtureSrc = path.join(temporary, 'fixture', 'src');
    const userData = path.join(temporary, 'user-data');
    fs.mkdirSync(fixtureSrc, { recursive: true });
    fs.copyFileSync(path.join(sourceRoot, 'THEME_INTEGRATION.md'), path.join(fixtureSrc, 'THEME_INTEGRATION.md'));
    fs.writeFileSync(path.join(fixtureSrc, 'home-nebula.html'), '<!doctype html><html><head><title>Nebula</title></head><body><main>Nebula</main></body></html>');
    const zipPath = writeZip(temporary, 'nebula.zip', buildThemeDesignPack(fixtureSrc, ['nebula']));
    const scan = scanThemePackZip(zipPath, sourceRoot, userData, discoverThemeDesigns(sourceRoot));
    const imported = importScannedThemePack(userData, sourceRoot, scan.scanId, [{ id: 'nebula', action: 'add' }]);
    const mode = imported.installed[0].mode;
    const installedDir = path.join(userData, 'theme-imports', mode);
    assert.equal(fs.existsSync(installedDir), true);
    assert.ok(imported.catalog.options.some((item) => item.id === mode));

    const removed = removeImportedTheme(userData, sourceRoot, mode);
    assert.equal(removed.ok, true);
    assert.deepEqual(removed.removed, { mode, title: 'Nebula', kind: 'custom' });
    assert.equal(removed.catalog.customThemes.some((item) => item.mode === mode), false);
    assert.equal(removed.catalog.options.some((item) => item.id === mode), false);
    assert.equal(fs.existsSync(installedDir), false);
    assert.equal(JSON.parse(fs.readFileSync(path.join(userData, 'theme-imports', 'installed-themes.json'), 'utf8')).themes.some((item) => item.mode === mode), false);
    assert.throws(() => removeImportedTheme(userData, sourceRoot, mode), /no imported installation/i, 'a second delete is safely rejected');
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('legacy override registries are ignored and removed from the active registry without changing built-in sources', () => {
  const temporary = makeTempRoot('madstation-legacy-theme-override-');
  try {
    const userData = path.join(temporary, 'user-data');
    const importRoot = path.join(userData, 'theme-imports');
    const overrideRoot = path.join(importRoot, 'override-v2');
    fs.mkdirSync(path.join(overrideRoot, 'themes'), { recursive: true });
    fs.writeFileSync(path.join(overrideRoot, 'themes', 'home-v2.html'), '<!doctype html><html><head><title>Wrong override</title></head><body><main>Imported replacement must stay inactive</main></body></html>');
    fs.writeFileSync(path.join(importRoot, 'installed-themes.json'), JSON.stringify({ schemaVersion: 1, themes: [{
      mode: 'v2', title: 'Wrong override', description: 'Legacy replacement', filename: 'home-v2.html',
      entryPath: 'themes/home-v2.html', fingerprint: 'f'.repeat(64), kind: 'override', installedAt: new Date().toISOString(),
    }] }, null, 2));
    const originalBuiltin = fs.readFileSync(path.join(sourceRoot, 'home-v2.html'), 'utf8');

    const catalog = getImportedThemeCatalog(userData, sourceRoot);
    assert.equal(catalog.customThemes.length, 0, 'legacy built-in replacements do not appear as selectable imported themes');
    assert.ok(catalog.options.some((item) => item.id === 'v2' && item.label === 'Simple' && item.custom === false), 'the source-controlled built-in remains the only Simple option');
    const normalizedRegistry = JSON.parse(fs.readFileSync(path.join(importRoot, 'installed-themes.json'), 'utf8'));
    assert.deepEqual(normalizedRegistry.themes, [], 'legacy override records are pruned from the active registry');
    assert.equal(fs.existsSync(path.join(overrideRoot, 'themes', 'home-v2.html')), true, 'old files are retained for manual recovery but are no longer active');
    assert.equal(fs.readFileSync(path.join(sourceRoot, 'home-v2.html'), 'utf8'), originalBuiltin, 'the canonical built-in source is unchanged');

    const exported = discoverThemeDesigns(sourceRoot, importRoot);
    assert.equal(exported.filter((theme) => theme.id === 'simple').length, 1, 'the exporter discovers the built-in exactly once from source');
    assert.equal(exported.some((theme) => theme.id === 'v2' || theme.id === 'override-v2'), false, 'legacy overrides are not exported as app themes');
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('theme catalogue refresh reports externally deleted theme files and prunes stale registry entries', () => {
  const temporary = makeTempRoot('madstation-missing-theme-reconcile-');
  try {
    const fixtureSrc = path.join(temporary, 'fixture', 'src');
    const userData = path.join(temporary, 'user-data');
    fs.mkdirSync(fixtureSrc, { recursive: true });
    fs.copyFileSync(path.join(sourceRoot, 'THEME_INTEGRATION.md'), path.join(fixtureSrc, 'THEME_INTEGRATION.md'));
    fs.writeFileSync(path.join(fixtureSrc, 'home-nebula.html'), '<!doctype html><html><head><title>Nebula</title></head><body><main>Nebula</main></body></html>');
    const zipPath = writeZip(temporary, 'nebula.zip', buildThemeDesignPack(fixtureSrc, ['nebula']));
    const scan = scanThemePackZip(zipPath, sourceRoot, userData, discoverThemeDesigns(sourceRoot));
    const imported = importScannedThemePack(userData, sourceRoot, scan.scanId, [{ id: 'nebula', action: 'add' }]);
    const mode = imported.installed[0].mode;
    fs.rmSync(path.join(userData, 'theme-imports', mode), { recursive: true, force: true });

    const refreshed = getImportedThemeCatalog(userData, sourceRoot);
    assert.ok(refreshed.missingThemes.some((item) => item.mode === mode && item.title === 'Nebula'), 'scan reports the missing installed theme by its saved identity');
    assert.equal(refreshed.customThemes.some((item) => item.mode === mode), false, 'deleted files no longer appear as installed');
    const registry = JSON.parse(fs.readFileSync(path.join(userData, 'theme-imports', 'installed-themes.json'), 'utf8'));
    assert.equal(registry.themes.some((item) => item.mode === mode), false, 'the stale registry item is pruned on explicit refresh');
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('main process and preload expose only a theme-ID based imported-theme removal API', () => {
  const main = fs.readFileSync(path.join(sourceRoot, 'main.js'), 'utf8');
  const preload = fs.readFileSync(path.join(sourceRoot, 'preload.ts'), 'utf8');
  const contract = fs.readFileSync(path.join(sourceRoot, 'shared', 'api-contract.ts'), 'utf8');
  assert.match(main, /handleDeveloper\('remove-imported-theme',[\s\S]{0,260}removeImportedTheme\(app\.getPath\('userData'\), __dirname, mode\)/);
  assert.match(preload, /removeImportedTheme: \(mode\) => invoke\('remove-imported-theme', mode\)/);
  assert.match(contract, /removeImportedTheme\(mode: string\): Promise<unknown>/);
});

test('theme importer accepts custom additions only and cannot mutate built-in theme slots', () => {
  const temporary = makeTempRoot('madstation-theme-custom-only-');
  try {
    const userData = path.join(temporary, 'user-data');
    const originalBuiltin = fs.readFileSync(path.join(sourceRoot, 'home-retro-complex.html'), 'utf8');
    const pack = buildThemeDesignPack(sourceRoot, ['retro-complex']);
    const zipPath = writeZip(temporary, 'retro-complex.zip', pack);
    const scan = scanThemePackZip(zipPath, sourceRoot, userData, discoverThemeDesigns(sourceRoot));
    assert.throws(() => importScannedThemePack(userData, sourceRoot, scan.scanId, [
      { id: 'retro-complex', action: 'replace', replaceMode: 'retro-complex' },
    ]), /selected theme action is invalid/i);
    const imported = importScannedThemePack(userData, sourceRoot, scan.scanId, [{ id: 'retro-complex', action: 'add' }]);
    assert.deepEqual(imported.installed.map((item) => ({ mode: item.mode, kind: item.kind })), [{ mode: 'custom-retro-complex', kind: 'custom' }]);
    assert.equal(fs.readFileSync(path.join(sourceRoot, 'home-retro-complex.html'), 'utf8'), originalBuiltin);
    assert.equal(getImportedThemeCatalog(userData).customThemes.length, 1);
    assert.throws(() => removeImportedTheme(userData, sourceRoot, 'retro-complex'), /valid installed theme/i, 'built-in IDs cannot be removed through the imported-theme API');
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('restore-package APIs are absent and the custom-only ZIP importer remains wired through main, preload, and contract', () => {
  const main = fs.readFileSync(path.join(sourceRoot, 'main.js'), 'utf8');
  const preload = fs.readFileSync(path.join(sourceRoot, 'preload.ts'), 'utf8');
  const contract = fs.readFileSync(path.join(sourceRoot, 'shared', 'api-contract.ts'), 'utf8');
  const renderer = fs.readFileSync(path.join(sourceRoot, 'renderer.js'), 'utf8');
  const importer = fs.readFileSync(path.join(sourceRoot, 'main', 'theme-pack-import.ts'), 'utf8');
  assert.doesNotMatch(main, /restore-default-theme-package|restoreDefaultThemePackage/);
  assert.doesNotMatch(preload, /restore-default-theme-package|restoreDefaultThemePackage/);
  assert.doesNotMatch(contract, /restore-default-theme-package|restoreDefaultThemePackage/);
  assert.doesNotMatch(renderer, /developer-theme-reset-result|restore-default-theme-package/);
  assert.doesNotMatch(importer, /export function restoreDefaultThemePackage/);
  assert.match(main, /handleDeveloper\('scan-theme-pack-import', async \(_event, requestedPath\)/);
  assert.match(main, /handleDeveloper\('import-theme-pack', async \(_event, scanId, choices\)/);
  assert.match(preload, /getPathForFile: \(file\) => webUtils\.getPathForFile\(file\)/);
  assert.match(preload, /scanThemePackImport: \(zipPath\) => typeof zipPath === 'string' \? invoke\('scan-theme-pack-import', zipPath\) : invoke\('scan-theme-pack-import'\)/);
  assert.match(contract, /getPathForFile\(file: File\): string/);
  assert.match(renderer, /window\.aiHub\.getPathForFile\(action\.zipFile\)/);
  assert.match(importer, /action: 'add'/);
  assert.match(importer, /Theme ZIP imports can only add separate custom themes/);
});


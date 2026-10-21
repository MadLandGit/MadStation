const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { buildThemeDesignPack, discoverThemeDesigns } = require('../build/main/theme-design-export.js');
const { scanThemePackZip, importScannedThemePack } = require('../build/main/theme-pack-import.js');

const sourceRoot = path.join(__dirname, '..', 'src');
function unzipEntries(zip) {
  const entries = new Map();
  let offset = 0;
  while (offset + 30 < zip.length && zip.readUInt32LE(offset) === 0x04034b50) {
    const compressedSize = zip.readUInt32LE(offset + 18);
    const uncompressedSize = zip.readUInt32LE(offset + 22);
    const nameLength = zip.readUInt16LE(offset + 26);
    const extraLength = zip.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const name = zip.toString('utf8', nameStart, nameStart + nameLength);
    const dataStart = nameStart + nameLength + extraLength;
    const compressed = zip.subarray(dataStart, dataStart + compressedSize);
    const data = zlib.inflateRawSync(compressed);
    assert.equal(data.length, uncompressedSize, `size matches for ${name}`);
    entries.set(name, data.toString('utf8'));
    offset = dataStart + compressedSize;
  }
  return entries;
}

test('theme exporter creates a compact visual-only pack for the selected themes', () => {
  const result = buildThemeDesignPack(sourceRoot, ['simple', 'galaxy', 'parallax-jungle', 'glass']);
  assert.equal(result.themeCount, 4);
  assert.ok(result.fileCount > 10);
  assert.equal(result.archive.readUInt32LE(0), 0x04034b50, 'output starts with a ZIP local file header');
  const files = unzipEntries(result.archive);
  assert.ok(files.has('themes/home-galaxy.html'));
  assert.ok(files.has('themes/home-parallax-jungle.html'));
  assert.ok(files.has('themes/home-glass.html'));
  assert.ok(files.has('themes/home-v2.html'), 'Simple theme is included to validate its refreshed layout CSS');
  assert.ok(!files.has('themes/home-retro.html'), 'unselected themes are omitted');
  assert.ok(![...files.keys()].some((name) => name.startsWith('previews/')), 'no screenshot previews are included');
  assert.match(files.get('themes/home-galaxy.html'), /visual-only-guard\.js/);
  assert.match(files.get('themes/home-galaxy.html'), /shared-css\/home-style-chrome\.css/);
  assert.match(files.get('themes/home-galaxy.html'), /galaxy|planet|orbit/i, 'Galaxy scene markup remains present');
  assert.match(files.get('themes/home-parallax-jungle.html'), /jungle|foliage|season/i, 'Jungle scene markup remains present');
  assert.match(files.get('themes/home-galaxy.html'), /data-theme-quick-trigger[\s\S]*home-quick-access-theme\.js|home-quick-access-theme\.js[\s\S]*data-theme-quick-trigger/i, 'Quick Access markup and controller are both exported');
  assert.ok(files.has('visual-js/home-quick-access-theme.js'), 'Quick Access preview controller is included');
  assert.match(files.get('visual-js/home-quick-access-theme.js'), /data-qa-style|data-qa-accent|data-qa-action/, 'Quick Access menu interactions remain present');
  assert.doesNotMatch(files.get('visual-js/home-quick-access-theme.js'), /window\.parent\.postMessage|ipcRenderer|require\s*\(/, 'Quick Access preview controller cannot message or access the host');
  assert.match(files.get('shared-css/home-v5.css'), /Mad Station layout fit pass/, 'latest Simple-theme layout fixes are exported');
  assert.doesNotMatch(files.get('themes/home-glass.html'), /Mad Station host bridge for the Glass homepage/i);
  for (const filename of ['themes/home-galaxy.html', 'themes/home-parallax-jungle.html', 'themes/home-glass.html']) {
    assert.doesNotMatch(files.get(filename), /window\.parent\.postMessage|window\.aiHub|ipcRenderer|MadHome\.memoryAction/, `${filename} has no host bridge code`);
  }
  const manifest = JSON.parse(files.get('theme-manifest.json'));
  assert.equal(manifest.appFunctionalityIncluded, false);
  assert.equal(manifest.appPlaceholderClickEnabled, false);
  assert.equal(manifest.screenshotPreviewsIncluded, false);
  assert.equal(manifest.windowSizing.defaultWidth, 1450);
  assert.equal(manifest.windowSizing.defaultHeight, 920);
  assert.equal(manifest.windowSizing.minimumWidth, 900);
  assert.match(files.get('AI_START_HERE.md'), /1450 × 920/);
  assert.match(files.get('AI_START_HERE.md'), /must do nothing/);
  assert.match(files.get('AI_START_HERE.md'), /not the authoritative source for a built-in theme/);
  assert.match(files.get('AI_START_HERE.md'), /edit the original project files under src\//);
  assert.match(files.get('AI_START_HERE.md'), /Changing an HTML\/CSS file inside this ZIP alone will not modify the built-in theme/);
  assert.match(files.get('index.html'), /Parallax Jungle/);
  assert.doesNotMatch(files.get('index.html'), /previews\//);
});

test('every discovered built-in theme exports the interactive local-only Quick Access controller', () => {
  const designs = discoverThemeDesigns(sourceRoot);
  assert.equal(designs.length, 10, 'all ten built-in homepage themes are discoverable');
  assert.ok(designs.some((theme) => theme.id === 'isometric-world' && theme.filename === 'home-isometric-world.html'), 'Isometric World is included in the canonical built-in export set');
  const files = unzipEntries(buildThemeDesignPack(sourceRoot, designs.map((theme) => theme.id)).archive);
  const controller = files.get('visual-js/home-quick-access-theme.js');
  assert.ok(controller, 'one shared Quick Access preview controller is exported');
  assert.match(controller, /data-qa-style|data-qa-accent|data-qa-action/, 'controller retains Quick Access interactions');
  assert.doesNotMatch(controller, /window\.parent\.postMessage|ipcRenderer|require\s*\(/, 'controller remains local-only');
  for (const theme of designs) {
    const htmlPath = `themes/${theme.filename}`;
    const html = files.get(htmlPath);
    assert.ok(html, `${htmlPath} is included in the complete theme pack`);
    assert.match(html, /home-quick-access-theme\.js/, `${htmlPath} loads the Quick Access controller`);
    assert.match(html, /data-theme-quick-trigger/, `${htmlPath} keeps the Quick Access trigger markup`);
  }
  assert.match(files.get('shared-css/home-quick-access-theme.css'), /qa-icon-unify|data-qa-icon|quick-access/i, 'shared Quick Access stylesheet is included');
});

test('theme exporter rejects empty, duplicate, and unknown theme selections', () => {
  assert.throws(() => buildThemeDesignPack(sourceRoot, []), /Choose at least one currently discovered theme/);
  assert.throws(() => buildThemeDesignPack(sourceRoot, ['galaxy', 'galaxy']), /duplicate/);
  assert.throws(() => buildThemeDesignPack(sourceRoot, ['made-up-theme']), /no longer available/);
});


test('theme discovery detects added, edited, and removed source themes without a saved snapshot', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'madstation-theme-discovery-'));
  const projectRoot = path.join(temporary, 'project');
  const src = path.join(projectRoot, 'src');
  fs.mkdirSync(src, { recursive: true });
  const pagePath = path.join(src, 'home-custom-nebula.html');
  const cssPath = path.join(src, 'home-custom-nebula.css');
  const scriptPath = path.join(src, 'home-custom-nebula-visual.js');
  const assetPath = path.join(src, 'nebula-texture.svg');
  try {
    assert.deepEqual(discoverThemeDesigns(src), []);
    fs.writeFileSync(assetPath, '<svg xmlns="http://www.w3.org/2000/svg"><circle cx="20" cy="20" r="18" fill="#7236ff"/></svg>');
    fs.writeFileSync(cssPath, '.scene{background-image:url("./nebula-texture.svg");color:#7236ff}');
    fs.writeFileSync(scriptPath, 'document.documentElement.dataset.visualNebula = "active"; const texture = "./nebula-texture.svg";');
    fs.writeFileSync(pagePath, '<!doctype html><html><head><title>Custom Nebula</title><link rel="stylesheet" href="home-custom-nebula.css"></head><body><div class="scene"><button class="app-tile">Image Hub</button></div><script src="home-custom-nebula-visual.js"></script></body></html>');

    const firstScan = discoverThemeDesigns(src);
    assert.equal(firstScan.length, 1);
    assert.equal(firstScan[0].id, 'custom-nebula');
    assert.equal(firstScan[0].title, 'Custom Nebula');
    assert.ok(firstScan[0].dependencyCount >= 3, 'fingerprint includes CSS, the visual script and its referenced texture');
    const firstFingerprint = firstScan[0].fingerprint;

    // Export reads all referenced dependencies at the current source state.
    const firstPack = unzipEntries(buildThemeDesignPack(src, ['custom-nebula']).archive);
    assert.match(firstPack.get('shared-css/home-custom-nebula.css'), /#7236ff/);
    assert.ok(firstPack.has('assets/src/nebula-texture.svg') || [...firstPack.keys()].some((name) => name.endsWith('/nebula-texture.svg')));
    assert.match(firstPack.get('visual-js/home-custom-nebula-visual.js'), /visualNebula/);
    assert.match(firstPack.get('visual-js/home-custom-nebula-visual.js'), /\.\.\/assets\/src\/nebula-texture\.svg/, 'quoted local assets in visual scripts are repointed into the export bundle');
    assert.match(firstPack.get('themes/home-custom-nebula.html'), /Image Hub/);
    assert.match(firstPack.get('themes/home-custom-nebula.html'), /visual-only-guard/);

    fs.writeFileSync(assetPath, '<svg xmlns="http://www.w3.org/2000/svg"><circle cx="20" cy="20" r="18" fill="#00ccff"/></svg>');
    const assetScan = discoverThemeDesigns(src);
    assert.notEqual(assetScan[0].fingerprint, firstFingerprint, 'referenced local asset edits change the fingerprint');
    const assetPack = unzipEntries(buildThemeDesignPack(src, ['custom-nebula']).archive);
    assert.match(assetPack.get([...assetPack.keys()].find((name) => name.endsWith('/nebula-texture.svg'))), /#00ccff/);

    fs.writeFileSync(cssPath, '.scene{background-image:url("./nebula-texture.svg");color:#00ff88}');
    fs.writeFileSync(scriptPath, 'document.documentElement.dataset.visualNebula = "updated"; const texture = "./nebula-texture.svg";');
    const secondScan = discoverThemeDesigns(src);
    assert.notEqual(secondScan[0].fingerprint, assetScan[0].fingerprint, 'CSS and visual JS edits change the fingerprint');
    const changedPack = unzipEntries(buildThemeDesignPack(src, ['custom-nebula']).archive);
    assert.match(changedPack.get('shared-css/home-custom-nebula.css'), /#00ff88/);
    assert.match(changedPack.get('visual-js/home-custom-nebula-visual.js'), /updated/);
    assert.equal(JSON.parse(changedPack.get('theme-manifest.json')).themes[0].sourceFingerprint, secondScan[0].fingerprint);

    fs.unlinkSync(pagePath);
    assert.deepEqual(discoverThemeDesigns(src), [], 'deleted theme pages disappear on the next scan');
    assert.throws(() => buildThemeDesignPack(src, ['custom-nebula']), /no longer available/);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});


test('installed imported themes appear in Theme Design Exporter and export from their installed source files', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'madstation-imported-theme-export-'));
  const fixtureSrc = path.join(temporary, 'fixture-src');
  const userData = path.join(temporary, 'user-data');
  const importedThemesRoot = path.join(userData, 'theme-imports');
  fs.mkdirSync(fixtureSrc, { recursive: true });
  try {
    fs.writeFileSync(path.join(fixtureSrc, 'home-nebula.html'), '<!doctype html><html><head><title>Nebula</title><link rel="stylesheet" href="home-nebula.css"></head><body><main class="nebula">Nebula imported theme</main><button data-theme-quick-trigger>Quick Access</button></body></html>');
    fs.writeFileSync(path.join(fixtureSrc, 'home-nebula.css'), '.nebula{color:#9c7cff;background:#080b22}');
    const starter = buildThemeDesignPack(fixtureSrc, ['nebula']);
    const zipPath = path.join(temporary, 'nebula.zip');
    fs.writeFileSync(zipPath, starter.archive);
    const liveThemes = discoverThemeDesigns(sourceRoot).map(({ id, title, filename, fingerprint }) => ({ id, title, filename, fingerprint }));
    const scan = scanThemePackZip(zipPath, sourceRoot, userData, liveThemes);
    assert.equal(scan.ok, true);
    assert.equal(scan.themes[0].id, 'nebula');
    const installed = importScannedThemePack(userData, sourceRoot, scan.scanId, [{ id: 'nebula', action: 'add' }]);
    assert.equal(installed.ok, true);
    const installedMode = installed.installed[0].mode;

    const options = discoverThemeDesigns(sourceRoot, importedThemesRoot);
    const exportedOption = options.find((theme) => theme.id === installedMode);
    assert.ok(exportedOption, 'a newly imported custom theme is included in the dynamic export scanner');
    assert.equal(exportedOption.title, 'Nebula');
    assert.equal(exportedOption.filename, `home-${installedMode}.html`);

    const files = unzipEntries(buildThemeDesignPack(sourceRoot, [installedMode], importedThemesRoot).archive);
    assert.ok(files.has(`themes/home-${installedMode}.html`), 'the custom page is exported under a stable unique filename');
    assert.match(files.get(`themes/home-${installedMode}.html`), /Nebula imported theme/);
    const cssPath = `shared-css/${installedMode}/home-nebula.css`;
    assert.ok(files.has(cssPath), 'installed theme stylesheet is exported in an isolated namespace');
    assert.match(files.get(cssPath), /#9c7cff/);
    const manifest = JSON.parse(files.get('madstation-theme-pack.json'));
    assert.equal(manifest.themes[0].id, installedMode);
    assert.equal(manifest.themes[0].entry, `themes/home-${installedMode}.html`);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

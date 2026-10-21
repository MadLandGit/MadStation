const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('About, Developer, AI Hub Privacy and Websites panels are React-owned', () => {
  const html = read('src/renderer.html');
  const module = read('src/renderer-react/information-security-panels.tsx');
  for (const id of ['aboutReactMount', 'developerReactMount', 'aiHubPrivacyReactMount', 'aiHubWebsitesReactMount']) {
    assert.match(html, new RegExp(`id="${id}"`));
    assert.match(module, new RegExp(id));
  }
  assert.doesNotMatch(html.match(/data-panel="privacy"[\s\S]*?data-panel="websites"/)[0], /data-sec=/);
  assert.doesNotMatch(html.match(/data-panel="websites"[\s\S]*?data-panel="about"/)[0], /data-sec=/);
  assert.doesNotMatch(html.match(/data-panel="about"[\s\S]*?data-panel="data"/)[0], /providerCountInfo|aboutAccountCount|id="appVersion"/);
  assert.doesNotMatch(html, /data-copy-developer-prompt=|data-developer-location=/);
  assert.doesNotMatch(module, /window\.aiHub\./, 'React must not access privileged preload APIs directly');
});

test('Privacy and website controls use a bounded typed security action set', () => {
  const module = read('src/renderer-react/information-security-panels.tsx');
  const renderer = read('src/renderer.js');
  for (const key of [
    'clearCacheOnExit', 'signOutOnExit', 'disableDiskCache', 'contentProtection', 'spellcheck', 'blockDevTools',
    'blockPopups', 'restrictNavigation', 'allowLoginProviders', 'blockHttp', 'allowCamera', 'allowMicrophone', 'allowNotifications', 'allowFullscreen',
  ]) assert.ok(module.includes(`'${key}'`), `React panel retains ${key}`);
  assert.match(module, /madstation:ai-hub-security-panels-action/);
  assert.match(renderer, /AIHUB_PRIVACY_SECURITY_KEYS = new Set/);
  assert.match(renderer, /!AIHUB_PRIVACY_SECURITY_KEYS\.has\(action\.key\) \|\| typeof action\.value !== 'boolean'/);
  assert.match(renderer, /await updateSecurity\(\{ \[action\.key\]: action\.value \}\)/);
  assert.match(renderer, /madstation:ai-hub-security-panels-mounted/);
  assert.match(renderer, /window\.aiHub\.clearCacheNow\(\)/);
  assert.match(renderer, /madstation:ai-hub-security-panel-result/);
});

test('About counts and version are supplied by the host instead of imperative writes into removed IDs', () => {
  const module = read('src/renderer-react/information-security-panels.tsx');
  const renderer = read('src/renderer.js');
  assert.match(module, /madstation:about-panel-controls/);
  assert.match(module, /snapshot\.providers/);
  assert.match(module, /snapshot\.accounts/);
  assert.match(renderer, /function publishAboutPanelControls\(\)/);
  const packageVersion = JSON.parse(read('package.json')).version;
  assert.match(renderer, new RegExp(`version: state\\.appVersion \\|\\| '${packageVersion.replace(/\\./g, '\\\\.')}', providers: state\\.services\\.length, accounts: state\\.accounts\\.length`), 'About panel host fallback version follows the current package version');
  assert.doesNotMatch(renderer, /\$\('providerCountInfo'\)|\$\('aboutAccountCount'\)|\$\('appVersion'\)/);
});

test('Developer settings hide retired cards and recipes behind the password-gated theme tools', () => {
  const module = read('src/renderer-react/information-security-panels.tsx');
  const renderer = read('src/renderer.js');
  const main = read('src/main.js');
  for (const key of ['project-orientation', 'refactor', 'build-test-diagnose', 'release', 'app-builder', 'register-app', 'design-migration', 'design-page', 'appearance-option']) {
    assert.ok(module.includes(`"key": "${key}"`), `recipe metadata retained: ${key}`);
  }
  assert.match(module, /madstation:developer-panel-action/);
  assert.match(module, /Unlock Developer Options/);
  assert.doesNotMatch(module, /<strong>12345<\/strong>/, 'the temporary password is not disclosed to other users by the login screen');
  assert.match(module, /Developer password/);
  assert.match(module, /requestDeveloperSettingsAction\('change-password'/);
  assert.doesNotMatch(module, /window\.aiHub\./);
  assert.match(module, /themeRestartStatus\?\.required/);
  const visibleDeveloperUi = module.slice(module.indexOf('if (!developerTabActive)'), module.indexOf('const mountConfig'));
  assert.doesNotMatch(visibleDeveloperUi, /DEVELOPER_CONTENT\.groups|Developer Guide Rails|AI Prompt Recipes/);
  assert.match(visibleDeveloperUi, /DEVELOPER_CONTENT\.cards\.filter\(\(card\) => !HIDDEN_DEVELOPER_CARD_TITLES\.has\(card\.title\)\)/, 'retired cards and recipes remain in source data but are excluded from the Developer Settings UI');
  const hiddenTitles = read('src/renderer-react/information-security-panels.tsx');
  for (const title of ['Project files & commands', 'Workspace App Builder', 'Design System', 'Project & File Commands Recipes', 'Workspace App Builder Recipes', 'Design System Recipes']) assert.ok(hiddenTitles.includes(title), `preserves source metadata for ${title}`);
  assert.match(renderer, /DEVELOPER_UI_FILES = new Set/);
  assert.match(renderer, /madstation:developer-settings-action/);
  assert.match(renderer, /window\.aiHub\.changeDeveloperOptionsPassword/);
  assert.match(renderer, /window\.aiHub\.getThemeImportRestartStatus/);
  assert.match(renderer, /window\.aiHub\.restartApp/);
  assert.match(renderer, /Object\.prototype\.hasOwnProperty\.call\(DEVELOPER_PROMPTS, action\.key\)/);
  assert.match(renderer, /window\.aiHub\.showDeveloperFileLocation\(action\.path\)/);
  assert.match(renderer, /window\.aiHub\.writeSystemClipboard\(DEVELOPER_PROMPTS\[action\.key\]\)/);
  assert.match(module, /Theme Design Exporter/);
  assert.match(module, /<h3>Manage Themes<\/h3>/);
  assert.match(module, /removedCount > 0 \|\| \(result\.catalog\.missingThemes \|\| \[\]\)\.length > 0/);
  assert.match(module, /emit\('madstation:theme-imported', result\.catalog\)/);
  assert.match(module, /Refresh themes/);
  assert.match(module, /themeScanSummary/);
  assert.match(module, /removedThemesSinceScan/);
  assert.match(module, /themeManagementCatalog\.missingThemes/);
  assert.match(module, /action\(\{ type: 'remove-imported-theme', mode \}\)/);
  assert.match(renderer, /action\.type === 'remove-imported-theme'/);
  assert.match(main, /handleDeveloper\('remove-imported-theme'/);
  assert.match(module, /1450 × 920 px/);
  assert.match(module, /Scan themes & changes/);
  assert.match(module, /Refreshing theme discovery and fingerprints before export/);
  assert.match(module, /review the refreshed selections, then export again/i);
  assert.match(module, /home-\*\.html/);
  assert.match(module, /theme\.scanStatus === 'changed'/);
  assert.match(renderer, /scan-theme-pack/);
  assert.match(renderer, /export-theme-pack/);
  assert.match(renderer, /madstation:developer-theme-export-result/);
  assert.match(main, /handleDeveloper\('discover-theme-designs'/);
  assert.match(main, /handleDeveloper\('export-theme-design-pack'/);
  assert.match(main, /if \(!developerOptionsAuth\.isUnlocked\(\)\)/, 'Developer actions are guarded in the main process');
  assert.match(read('src/preload.ts'), /discoverThemeDesigns: \(\) => invoke\('discover-theme-designs'\)/);
  assert.match(read('src/preload.ts'), /exportThemeDesignPack: \(themeIds\) => invoke\('export-theme-design-pack', themeIds\)/);
  assert.match(module, /onDrop=\{handleThemeZipDrop\}/);
  assert.match(module, /Built-in themes cannot be replaced by ZIP files/);
  assert.match(module, /Drop a theme ZIP here/);
  assert.doesNotMatch(module, /Restore Default Theme Package|theme-default-package-card/);
  assert.match(module, /Search themes by name or file/);
  assert.doesNotMatch(module, /madstation:developer-theme-reset-result/);
  assert.doesNotMatch(read('src/preload.ts'), /restoreDefaultThemePackage|restore-default-theme-package/);
  const nativeOps = read('src/main/native-operations-runtime.ts');
  assert.match(nativeOps, /dependencies\.developerFiles\.has\(relativeFile\)/);
  assert.match(main, /developerFiles: DEVELOPER_FILES/);
  assert.match(main, /nativeOperationsRuntime\.showDeveloperFileLocation\(relativeFile\)/);
});

test('React-owned panels reapply settings search after their snapshots change', () => {
  const module = read('src/renderer-react/information-security-panels.tsx');
  const renderer = read('src/renderer.js');
  assert.match(module, /madstation:global-settings-panels-rendered/);
  assert.match(renderer, /madstation:global-settings-panels-rendered'[),][\s\S]*if \(settingsQuery\(\)\) filterSettings\(\)/);
  assert.match(renderer, /input\.closest\('#aiHubPrivacyReactMount, #aiHubWebsitesReactMount'\)/);
});

test('information/security React entry is wired into Vite, HTML, packaged developer source, and test list', () => {
  const vite = read('vite.config.ts');
  const html = read('src/renderer.html');
  const pkg = JSON.parse(read('package.json'));
  const main = read('src/main.js');
  assert.match(vite, /information-security-panels-react.*information-security-panels\.tsx/);
  assert.match(html, /\.\.\/build\/information-security-panels-react\.js/);
  assert.ok(pkg.scripts.test.includes('tests/renderer-react-information-security-panels.test.js'));
  assert.ok(pkg.build.extraResources.some((item) => item.from === 'src' && item.filter?.includes('renderer-react/information-security-panels.tsx')));
  assert.match(main, /src\/renderer-react\/information-security-panels\.tsx/);
});

test('Default homepage selection is only exposed in the password-gated Developer panel', () => {
  const module = read('src/renderer-react/information-security-panels.tsx');
  const picker = read('src/renderer-react/appearance-controls.tsx');
  const quickAccess = read('src/home-quick-access-theme.js');
  const panelStart = module.indexOf('function DeveloperPanel()');
  const panelEnd = module.indexOf('const mountConfig', panelStart);
  const panel = module.slice(panelStart, panelEnd);
  assert.match(panel, /if \(!developerTabActive\) return null/);
  assert.match(panel, /if \(!developerAccessUnlocked\) return/);
  assert.match(panel, /Default homepage \(developer only\)/);
  assert.match(panel, /data-developer-default-homepage/);
  assert.match(panel, /activateDeveloperDefaultHomepage/);
  assert.doesNotMatch(picker, /id: 'legacy', label: 'Default'/);
  assert.doesNotMatch(quickAccess, /\{ id: 'legacy', label: 'Default' \}/);
});

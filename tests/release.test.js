const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const src = path.join(root, 'src');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }

test('main process imports the app-lock presence helper from the lock security service', () => {
  const main = read('src/main.js');
  const lockSecurity = read('src/main/lock-security.ts');
  assert.match(main, /const \{ normalizeLock, normalizePassword, hasPassword, createLock, verifyPassword \} = lockSecurity;/);
  assert.match(lockSecurity, /function hasPassword\(\): boolean/);
  assert.match(lockSecurity, /return \{ normalizeLock, normalizePassword, hasPassword, createLock, verifyPassword \};/);
});

test('release packaging keeps a compatible Electron downloader and hash-pins the local sprintf-js security patch', () => {
  assert.match(pkg.scripts.dist, /^electron-builder --publish=never --win nsis$/);
  const workflow = read('.github/workflows/release.yml');
  assert.match(workflow, /run: npm run dist/);
  assert.ok(workflow.includes("if: startsWith(github.ref, 'refs/tags/')"));
  assert.equal(pkg.devDependencies.electron, '44.7.2');
  assert.equal(pkg.devDependencies['electron-builder'], '26.17.0');
  assert.equal(pkg.overrides?.['@electron/get'], undefined, 'Electron Builder 26 uses the Got-based @electron/get v3 API; do not globally force v5');
  assert.equal(pkg.overrides?.['sprintf-js'], 'file:../../vendor/sprintf-js-1.1.4+madstation.1.tgz');
  const lock = JSON.parse(read('package-lock.json'));
  assert.equal(lock.packages['node_modules/@electron/get'].version, '5.1.0', 'Electron 44 uses its own v5 downloader');
  assert.equal(lock.packages['node_modules/app-builder-lib/node_modules/@electron/get'].version, '3.1.0', 'Electron Builder retains its compatible nested downloader');
  const patchedSprintf = lock.packages['node_modules/sprintf-js'];
  assert.equal(patchedSprintf.version, '1.1.4+madstation.1', 'the vulnerable upstream package is replaced by the clearly marked local maintenance patch');
  assert.equal(patchedSprintf.resolved, 'file:vendor/sprintf-js-1.1.4+madstation.1.tgz');
  const archive = fs.readFileSync(path.join(root, 'vendor/sprintf-js-1.1.4+madstation.1.tgz'));
  assert.equal(patchedSprintf.integrity, `sha512-${crypto.createHash('sha512').update(archive).digest('base64')}`, 'local patch tarball must match the npm lockfile integrity');
  assert.equal(lock.packages['node_modules/roarr/node_modules/sprintf-js'], undefined, 'duplicate nested sprintf-js must not be left in the lockfile');
  assert.match(read('vendor/sprintf-js/README.md').replace(/\*\*/g, ''), /not an official upstream release/);
});

test('release version is single-source and consistent', () => {
  const version = fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim();
  assert.equal(pkg.version, '1.6.3');
  assert.equal(pkg.devDependencies.electron, '44.7.2');
  assert.equal(pkg.devDependencies['electron-builder'], '26.17.0');
  assert.equal(version, pkg.version);
  assert.match(read('src/renderer-react/information-security-panels.tsx'), /Stable release/);
  assert.match(read('src/renderer-react/information-security-panels.tsx'), /snapshot\.version \|\| '1\.6\.3'/);
  assert.match(read('src/main.js'), /const APP_VERSION = app\.getVersion\(\);/);
});

test('README release history is ordered and the packaging note is non-release metadata', () => {
  const headings = [...read('README.md').matchAll(/^## (v\d+\.\d+\.\d+[^\n]*)$/gm)].map((m) => m[1]);
  assert.deepEqual(headings, ['v1.6.3 — Isometric World homepage integration', 'v1.6.0 — Migration stabilization and monitor fixes', 'v1.5.4 — Google OAuth handoff fix', 'v1.5.3 — release candidate', 'v1.5.3 release preparation']);
  assert.match(read('README.md'), /## Release packaging note/);
});







test('renderer does not retain handlers for removed utility controls', () => {
  const renderer = read('src/renderer.js');
  for (const retiredHook of ['clipboardAppTitle', 'clipboardAppSubtitle', 'launcherAboutBtn', 'localChatInput', 'localSendBtn', 'sendLocal']) {
    assert.ok(!renderer.includes(retiredHook), `retired hook ${retiredHook} has no orphaned references`);
  }
});

test('no stale release labels remain in active release files', () => {
  const files = [
    'src/main.js', 'src/renderer.html', 'src/toolbar.html',
    'src/appearance.js', 'src/renderer.js', 'src/preload.ts',
    'src/toolbar-react/main.tsx', 'src/toolbar-preload.ts', 'README.md',
    '+ build installer.cmd', '+ install and run.cmd', 'package.json', 'VERSION',
  ];
  const stale = /(?<![0-9])0\.[0-9]+\.[0-9]+|Version\s+[0-9]+/;
  for (const file of files) {
    const text = read(file);
    const normalizedText = text.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '');
    if (file === 'README.md' || file === 'package.json') {
      // Historical release notes are retained; dependency versions may legitimately be 0.x.
      continue;
    }
    assert.equal(stale.test(normalizedText), false, `stale release marker in ${file}`);
  }
});

test('update links open through trusted main-process IPC', () => {
  const main = read('src/main.js');
  const preload = read('src/preload.ts');
  const renderer = read('src/renderer.js');
  assert.match(main, /handle\('open-external-url', async \(_event, url\)/);
  assert.match(main, /const normalized = normalizeHttpsUrl\(url\);/);
  assert.match(main, /await openExternalSafe\(normalized\)/);
  assert.match(preload, /openExternalUrl: \(url\) => invoke\('open-external-url', url\)/);
  assert.doesNotMatch(renderer, /window\.open\(r\.url/);
  assert.match(renderer, /window\.aiHub\.openExternalUrl\(result\.url\)/);
});

test('account sidebar model avoids quadratic indexOf and repeated layout reads', () => {
  const renderer = read('src/renderer.js');
  const component = read('src/renderer-react/account-list.tsx');
  const section = renderer.slice(renderer.indexOf('const accountRank'), renderer.indexOf('// ---- Account options menu'));
  assert.match(section, /const accountRank = new Map\(orderedAccounts\(\)\.map/);
  assert.match(section, /const serviceRank = new Map\(orderedServices\(\)\.map/);
  assert.doesNotMatch(section, /sorted\.indexOf\(account\)/);
  assert.equal((section.match(/root\.getBoundingClientRect\(/g) || []).length, 0);
  assert.equal((section.match(/document\.querySelector\('\.sidebar'\)/g) || []).length, 0);
  assert.match(component, /const serviceMap = useMemo\(\(\) => new Map/);
  assert.match(component, /key=\{account\.id\}/);
  assert.doesNotMatch(component, /props\.accounts\.indexOf\(account\)/);
});
test('remote icon cache is bounded', () => {
  const icon = require(path.join(root, 'build', 'main', 'icon-cache.js'));
  assert.equal(icon.MAX_CACHE_ENTRIES, 128);
  assert.equal(icon.MAX_CACHE_TOTAL_BYTES, 32 * 1024 * 1024);
  const text = read('src/main/icon-cache.ts');
  assert.match(text, /evictIfNeeded\(\)/);
  assert.match(text, /this\.entries\.size > MAX_CACHE_ENTRIES/);
  assert.match(text, /this\.totalBytes > MAX_CACHE_TOTAL_BYTES/);
});

test('settings dropdowns stay above the sticky action bar and are not drag targets', () => {
  const css = read('src/styles.css');
  assert.match(css, /\.clipboard-settings-card \.clipboard-setting-label,\n\.clipboard-settings-card \.clipboard-setting-label select \{[\s\S]*z-index: 3;[\s\S]*app-region: no-drag;/);
  assert.match(css, /\.clipboard-settings-card \.clipboard-settings-actions \{\s*pointer-events: none;\s*\}/);
  assert.match(css, /\.clipboard-settings-card \.clipboard-settings-actions > \* \{\s*pointer-events: auto;\s*\}/);
});

test('main and AI Hub settings rows keep comfortable horizontal text inset', () => {
  const css = read('src/styles.css');
  assert.match(css, /\.settings-panel\[data-settings-scope="global"\] \.card-body \.row,\n\.settings-panel\[data-settings-scope="aihub"\] \.card-body \.row \{ padding-inline: 14px; \}/);
  assert.match(css, /@media \(max-width: 720px\) \{[\s\S]*padding-inline: 12px;[\s\S]*\}/);
  assert.doesNotMatch(css, /\.card-body \.row, \.lock-options \.row \{[^}]*padding: 12px 6px;/);
});

test('narrow Providers card header can wrap without overflow', () => {
  const css = read('src/styles.css');
  assert.match(css, /@media \(max-width: 520px\) \{[\s\S]*\.card-head \{ align-items: flex-start; flex-wrap: wrap; \}/);
  assert.match(css, /\.card-action \{ width: 100%; margin-left: 0;/);
});

test('compatibility-created providers are added to serviceOrder immediately', () => {
  const main = read('src/main.js');
  const controller = read('src/main/ai-hub-controller.ts');
  assert.match(main, /aiHubController\.addAccount\(payload\)/, 'main delegates account creation to the typed controller');
  const start = controller.indexOf("if (!service && serviceName && accountUrl)");
  const section = controller.slice(start, start + 650);
  assert.match(section, /config\.services\.push\(created\);/);
  assert.match(section, /config\.serviceOrder = \[\.\.\.\(config\.serviceOrder \|\| \[\]\), created\.id\];/);
});

test('config save retries transient Windows filesystem failures and cleans temp files', () => {
  const store = read('src/main/config-store.ts');
  assert.match(store, /for \(let attempt = 0; attempt < 3; attempt \+= 1\)/);
  assert.match(store, /\['EPERM', 'EACCES', 'EBUSY'\]/);
  assert.match(store, /finally \{/);
  assert.match(store, /return false;/);
});

test('openExternalSafe reports the real shell result', () => {
  const security = read('src/main/account-session-security.ts');
  const start = security.indexOf('function openExternalSafe(url: string)');
  const section = security.slice(start, security.indexOf('\n  function isGoogleAuthUrl', start));
  assert.match(section, /await dependencies\.openExternal\(parsed\.href\)/);
  assert.doesNotMatch(section, /\.catch\(\(\) => \{\}\);/);
});

test('general appearance settings expose and normalize the expanded visual system', () => {
  const main = read('src/main.js');
  const settings = read('src/main/settings.ts');
  const appearance = read('src/appearance.js');
  const preload = read('src/preload.ts');
  const html = read('src/renderer.html');
  const advancedSettings = read('src/renderer-react/remaining-settings-panels.tsx');
  const css = read('src/styles.css');
  for (const key of ['surfaceStyle','backgroundStyle','cornerStyle','buttonCorner','buttonBackground','borderStyle','shadowStyle','cardSpacing','borderSpacing','showStatusBar','animateHover']) assert.match(main, new RegExp(key));
  assert.match(settings, /'solid', 'glass', 'elevated', 'frosted'/);
  assert.match(settings, /'plain', 'aurora', 'grid', 'spotlight', 'mesh', 'neon', 'parallax', 'dots', 'rings', 'hex', 'waves', 'diagonal', 'circuit', 'constellation', 'tiles'/);
  assert.match(settings, /'soft', 'sharp', 'square', 'ultra'/);
  assert.match(settings, /'soft', 'pill', 'square', 'sharp', 'glass', 'neon'/);
  assert.match(settings, /'solid', 'outline', 'ghost', 'contrast', 'glass', 'neon', 'text'/);
  assert.match(settings, /'subtle', 'balanced', 'strong', 'neon', 'neon2', 'glass', 'none'/);
  assert.match(settings, /'none', 'soft', 'strong', 'neon', 'glass'/);
  assert.doesNotMatch(main, /buttonStyle:\s*'soft'/);
  assert.match(settings, /CUSTOM_ACCENT_RE/);
  assert.match(main, /require\('\.\.\/build\/main\/settings\.js'\)/);
  assert.match(appearance, /getAccentPair/);
  assert.match(appearance, /dataset\.surfaceStyle/);
  assert.match(appearance, /dataset\.cardSpacing/);
  assert.match(appearance, /dataset\.borderSpacing/);
  assert.match(appearance, /dataset\.backgroundStyle/);
  assert.doesNotMatch(appearance, /sidebarWidth|cardDensity/);
  assert.doesNotMatch(html, /data-app-choice=\"sidebarWidth\"/);
  assert.match(advancedSettings, /Card spacing/);
  assert.doesNotMatch(html, /Vignette/);
  assert.doesNotMatch(html, /Rounded/);
  assert.match(advancedSettings, /Visual style/);
  assert.match(advancedSettings, /surfaceStyle: \['solid', 'glass', 'elevated', 'frosted'\]/);
  assert.doesNotMatch(html, /data-app-choice=\"surfaceStyle\"/);
  assert.doesNotMatch(html, /data-app-choice=\"backgroundStyle\"/);
  assert.match(html, /id=\"backgroundLibrary\"/);
  assert.match(html, /id=\"addBackgroundUrlBtn\"/);
  assert.match(html, /id=\"addBackgroundFileBtn\"/);
  assert.match(html, /id=\"backgroundUrlInput\"/);
  assert.match(html, /15 defaults/);
  assert.doesNotMatch(html, /data-value="clean" type="button">Clean<\/button>/);
  const globalAppearance = html.slice(html.indexOf('<div class="settings-panel" data-panel="appearance" data-settings-scope="global">'), html.indexOf('<div class="settings-panel" data-panel="accessibility"'));
  const appearanceCards = [...globalAppearance.matchAll(/<section class="card[^>]*>[\s\S]*?<h3>(.*?)<\/h3>[\s\S]*?<\/section>/g)].map((m) => m[1].replace(/&amp;/g, '&'));
  assert.deepEqual(appearanceCards.slice(0, 4), ['Themes', 'Accent colour', 'Modes', 'Background']);
  assert.doesNotMatch(globalAppearance, /id="accentChoiceSummary"/);
  assert.match(globalAppearance, /class="accent-choice-grid"[\s\S]*id="accentOptions"/);
  assert.match(css, /\.accent-choice-grid\s*\{[\s\S]*display:\s*grid;[\s\S]*grid-template-columns:\s*repeat\(8, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.accent-choice:focus-visible\s*\{[\s\S]*outline:\s*none[\s\S]*box-shadow:/);
  assert.match(css, /@media \(max-width:\s*420px\)[\s\S]*\.accent-choice-grid[\s\S]*repeat\(3, minmax\(44px, 1fr\)\)/);
  assert.match(advancedSettings, /<h3>Behavior &amp; feedback<\/h3>[\s\S]*settingKey="reduceMotion"[\s\S]*settingKey="animateHover"[\s\S]*settingKey="showStatusBar"/);
  assert.match(css, /\.compact-preview-layout\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(0,\s*1fr\)/);
  assert.match(css, /\.compact-preview-layout \.setting-preview\s*\{[\s\S]*width:\s*100%[\s\S]*min-width:\s*0[\s\S]*max-width:\s*none[\s\S]*align-self:\s*stretch[\s\S]*justify-self:\s*stretch/);
  assert.match(css, /homepage-style-preview--parallax-jungle[\s\S]*hp-jungle-portal[\s\S]*linear-gradient/);
  assert.doesNotMatch(css, /homepage-style-preview--neon-cyberpunk|hp-neon-reactor/);
  assert.match(css, /@media \(max-width:\s*520px\)[\s\S]*\.compact-preview-layout[\s\S]*grid-template-columns:\s*1fr/);
  const layoutStart = advancedSettings.indexOf('<h3>Layout &amp; display</h3>');
  const behaviorStart = advancedSettings.indexOf('<h3>Behavior &amp; feedback</h3>');
  const visualStartCheck = advancedSettings.indexOf('<h3>Visual style</h3>');
  assert.ok(layoutStart !== -1 && behaviorStart > layoutStart && visualStartCheck > behaviorStart);
  const layoutBlock = advancedSettings.slice(layoutStart, behaviorStart);
  const visualBlock = advancedSettings.slice(visualStartCheck, visualStartCheck + 5000);
  assert.doesNotMatch(layoutBlock, /reduceMotion/);
  assert.doesNotMatch(visualBlock, /animateHover|showStatusBar/);
  const renderer = read('src/renderer.js');
  assert.equal((renderer.match(/\['aurora', 'Aurora'\]/g) || []).length, 1);
  assert.match(renderer, /const BUILT_IN_BACKGROUNDS = \[/);
  assert.match(renderer, /\['tiles', 'Tiles'\],/);
  assert.match(html, /Custom backgrounds are saved to this workspace/i);
  const visualStart = advancedSettings.indexOf('<h3>Visual style</h3>');
  const visualEnd = advancedSettings.indexOf('</section>', visualStart);
  assert.doesNotMatch(advancedSettings.slice(visualStart, visualEnd), /<h3>Background<\/h3>|data-q="Background/);
  assert.match(settings, /customBackgrounds: \[\]/);
  const backgroundFiles = read('src/main/background-files.ts');
  const backgroundIpc = read('src/main/background-ipc.ts');
  assert.match(main, /registerBackgroundIpcHandlers\(handle, \{/);
  assert.doesNotMatch(main, /handle\(['\"]choose-background-file/);
  assert.doesNotMatch(main, /handle\(['\"]remove-background/);
  assert.match(backgroundIpc, /handle\('choose-background-file'/);
  assert.match(backgroundIpc, /handle\('remove-background'/);
  assert.match(backgroundFiles, /pathToFileURL\(destination\)\.href/);
  assert.match(backgroundFiles, /MAX_BACKGROUND_FILE_BYTES = 25 \* 1024 \* 1024/);
  assert.match(pkg.scripts['build:main-modules'], /src\/main\/background-files\.ts/);
  assert.match(pkg.scripts['build:main-modules'], /src\/main\/background-ipc\.ts/);
  assert.match(pkg.scripts.test, /tests\/main-background-files\.test\.js/);
  assert.match(pkg.scripts.test, /tests\/main-background-ipc\.test\.js/);
  const sourceResources = pkg.build.extraResources.find((item) => item.from === 'src');
  assert.ok(sourceResources.filter.includes('main/background-files.ts'));
  assert.ok(sourceResources.filter.includes('main/background-ipc.ts'));
  assert.match(preload, /chooseBackgroundFile: \(\) => invoke\('choose-background-file'\)/);
  assert.match(preload, /removeBackground: \(id\) => invoke\('remove-background', id\)/);
  assert.match(appearance, /--custom-background-image/);
  assert.match(appearance, /s\.customBackgrounds/);
  assert.match(css, /body\[data-background-style="custom"\]/);
  assert.match(html, /img-src 'self' data: https: file:/);
  assert.doesNotMatch(html, /data-value="bubbles" type="button">Bubbles<\/button>/);
  assert.doesNotMatch(html, /data-value="prism" type="button">Prism<\/button>/);
  assert.doesNotMatch(html, /data-value="orbs" type="button">Orbs<\/button>/);
  assert.doesNotMatch(html, /data-value="radar" type="button">Radar<\/button>/);
  assert.doesNotMatch(html, /data-value="bloom" type="button">Bloom<\/button>/);
  assert.match(appearance, /\['plain','aurora','grid','spotlight','mesh','neon','parallax','dots','rings','hex','waves','diagonal','circuit','constellation','tiles'\]/);
  assert.match(advancedSettings, /'glass'/);
  assert.doesNotMatch(html, /data-value="gradient" type="button">Gradient<\/button>/);
  for (const key of ['buttonCorner', 'buttonBackground', 'cardSpacing', 'borderSpacing']) assert.ok(advancedSettings.includes(`${key}: [`), `React option group retained: ${key}`);
  assert.match(advancedSettings, /Card corner style/);
  assert.match(advancedSettings, /Border spacing/);
  assert.match(advancedSettings, /preview-card-spacing-scene/);
  assert.match(advancedSettings, /preview-border-spacing-scene/);
  assert.match(css, /PATCH: Surface style must control the actual surface treatment/);
  assert.match(css, /540px/);
  assert.match(advancedSettings, /'frosted'/);
  assert.match(appearance, /borderSpacing/);
  assert.match(advancedSettings, /'buttonBackground'/);
  assert.match(advancedSettings, /'neon2'/);
  assert.match(advancedSettings, /'glass'/);
});

test('release metadata consistently identifies Mad Station 1.6.3 while retaining historical release notes', () => {
  assert.equal(fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim(), '1.6.3');
  assert.equal(JSON.parse(read('package-lock.json')).version, '1.6.3');
  assert.match(read('README.md'), /## v1\.6\.0 — Migration stabilization and monitor fixes/);
  assert.match(read('README.md'), /application version is \*\*1\.6\.3\*\*/);
  assert.match(read('docs/security/RELEASE_AUDIT.md'), /Release validation for Mad Station v1\.6\.3/);
  assert.match(read('src/renderer-react/information-security-panels.tsx'), /version-pill ms-chip/);
  assert.match(read('src/renderer-react/information-security-panels.tsx'), /snapshot\.version \|\| '1\.6\.3'/);
  assert.match(read('src/renderer-react/information-security-panels.tsx'), /version-pill ms-chip">v<span>\{version\}<\/span> · Stable release/);
  assert.match(read('src/renderer.js'), /version: state\.appVersion \|\| '1\.6\.3'/);
  assert.match(read('src/main/icon-cache.ts'), /Mad-Station\/1\.6\.3 IconCache/);
  assert.match(read('src/main/network-security.ts'), /Mad-Station\/1\.6\.3 SecurityCheck/);
});

test('legacy JavaScript sources remain syntactically valid', () => {
  const files = [
    'src/main.js', 'src/renderer.js', 'src/appearance.js',
    'src/home-apps.js', 'src/home-app-list.js', 'tests/release.test.js',
  ];
  for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', path.join(root, file)], { encoding: 'utf8' });
    assert.equal(result.status, 0, `${file}: ${result.stderr || result.stdout}`);
  }
});


test('floating quick-access app dock has been removed', () => {
  const main = read('src/main.js');
  const css = read('src/styles.css');
  const preload = read('src/preload.ts');
  assert.doesNotMatch(main, /appDockView|APP_DOCK_FILE|set-app-dock-state|createAppDockView|bringAppDockToFront|app-dock-preload/);
  assert.doesNotMatch(css, /app-dock-(?:panel|trigger|grid|item|popover)/);
  assert.doesNotMatch(preload, /set-app-dock-state|appDock/);
  assert.equal(fs.existsSync(path.join(root, 'src', 'app-dock.html')), false);
  assert.equal(fs.existsSync(path.join(root, 'src', 'app-dock.js')), false);
  assert.equal(fs.existsSync(path.join(root, 'src', 'app-dock-preload.js')), false);
});

test('home screen makes AI Hub the primary app and keeps supporting tools secondary', () => {
  const html = read('src/renderer.html');
  const css = read('src/styles.css');
  assert.match(html, /class="home-core-btn" type="button" data-app-launch="ai-hub"/);
  assert.match(html, /<span class="home-core-kicker">Main app<\/span>/);
  assert.match(html, /class="home-tools" id="homeApps"/);
  // Companion apps are registered by home-app-list.js and rendered by the React-owned Home companion view.
  const list = read('src/home-app-list.js');
  for (const app of ['instruction-forge', 'ai-lab', 'video-hub', 'image-hub']) {
    assert.match(list, new RegExp(`id: '${app}'`));
  }
  // Notes & Tasks is a clickable widget on the Default homepage, independent from companions and mini apps.
  const miniList = read('src/home-mini-list.js');
  const widgetList = read('src/home-widget-list.js');
  assert.doesNotMatch(miniList, /id: 'notes-tasks'/);
  assert.match(widgetList, /id: 'notes-tasks'[\s\S]*title: 'Notes & Tasks'[\s\S]*launchTarget\?\.\('clipboard'\)/);
  assert.doesNotMatch(list, /id: 'notes-tasks'|dock\s*:\s*['"]top['"]/);
  assert.match(html, /id="homeMiniApps"/);
  assert.match(html, /src="\.\.\/build\/home-mini-apps-react\.js"/);
  assert.match(read('src/home.css'), /\.home-mini-apps/);
  assert.match(read('src/home-core-system.js'), /function drawLinks\(/);
  assert.match(widgetList, /mount\.id = 'launcherRamMonitorMount'/);
  assert.match(html, /id="homeWidgets"/);
  assert.match(html, /id="launcherAccountCount"/);
  assert.match(html, /id="launcherProviderCount"/);
  assert.doesNotMatch(list, /launcherClipboardCount/);
  assert.doesNotMatch(html, /class="app-grid"/);
  assert.doesNotMatch(html, /class="launcher-header"/);
  assert.doesNotMatch(html, /class="launcher-hero"/);
  assert.doesNotMatch(css, /\.app-card-featured \{ background: linear-gradient\(145deg/);
});

test('home screen ships its own self-contained stylesheet and obeys the app CSP', () => {
  const html = read('src/renderer.html');
  const css = read('src/home.css');
  assert.match(html, /<link href="home\.css" rel="stylesheet"\/>/);
  const start = html.indexOf('<main class="home-screen" id="launcherScreen"');
  const end = html.indexOf('</main>', start);
  assert.ok(start >= 0 && end > start, 'home screen markup exists');
  // style-src is 'self': inline style attributes would be blocked, so the markup must not use any.
  assert.doesNotMatch(html.slice(start, end), /\sstyle=/);
  assert.doesNotMatch(css, /@import|url\(\s*['"]?https?:/);
  assert.match(css, /\.home-screen \{/);
  assert.match(css, /body\.reduce-motion \.home-screen/);
  assert.match(css, /prefers-reduced-motion/);
  // Home keeps clear of the frameless-window controls on the right of the top bar.
  assert.match(css, /\.home-topbar \{[^}]*padding: 0 148px 0/);
  assert.match(css, /\.home-topbar button \{ -webkit-app-region: no-drag/);
});

test('home RAM telemetry uses the shared monitor pipeline', () => {
  const renderer = read('src/renderer.js');
  assert.match(renderer, /function homeTelemetryMarkup\(\)/);
  assert.match(renderer, /if \(scope === 'home'\) return homeTelemetryMarkup\(\);/);
  assert.match(renderer, /\['launcherRamMonitorMount', 'home'\]/);
  for (const slot of ['ring', 'percent', 'total', 'summary', 'main', 'browser', 'gpu', 'other', 'arena', 'clipboard', 'sessions']) {
    assert.match(renderer, new RegExp(`data-memory-slot="${slot}"`));
  }
  assert.match(renderer, /data-memory-cleanup/);
  assert.match(renderer, /data-memory-refresh/);
  assert.match(renderer, /data-memory-details/);
  assert.match(renderer, /const RAM_HISTORY_MAX = 48;/);
});

test('app UI security boundaries remain enabled', () => {
  const main = read('src/main.js');
  for (const file of ['src/renderer.html', 'src/toolbar.html']) {
    const html = read(file);
    assert.match(html, /Content-Security-Policy/);
    assert.match(html, /default-src 'none'/);
    assert.match(html, /frame-ancestors 'none'/);
  }
  assert.match(main, /sandbox: true/);
  assert.match(main, /contextIsolation: true/);
  assert.match(main, /nodeIntegration: false/);
  assert.match(main, /webviewTag: false/);
  const accountSecurity = read('src/main/account-session-security.ts');
  assert.match(accountSecurity, /setPermissionRequestHandler/);
  assert.match(accountSecurity, /setDevicePermissionHandler\?\.\(\(\) => false\)/);
  assert.match(main, /will-attach-webview/);
  assert.match(accountSecurity, /contents\.setWindowOpenHandler/);
  assert.equal((main.match(/shell\.openExternal\(/g) || []).length, 1, 'external URLs are opened only through the safe wrapper');
});

test('lock service is initialized before config schema consumes normalizeLock', () => {
  const main = read('src/main.js');
  const lockServiceIndex = main.indexOf('const lockSecurity = createLockSecurityService');
  const configSchemaIndex = main.indexOf('const {\n  normalizeProviderMetadata,');
  assert.notEqual(lockServiceIndex, -1);
  assert.notEqual(configSchemaIndex, -1);
  assert.ok(lockServiceIndex < configSchemaIndex, 'normalizeLock must be initialized before the config schema receives it');
  assert.match(main, /let config = null;[\s\S]*?const lockSecurity = createLockSecurityService/);
});

test('migrated app-lock records cannot select arbitrary scrypt cost parameters', () => {
  const lockSecurity = read('src/main/lock-security.ts');
  const main = read('src/main.js');
  assert.match(lockSecurity, /export function normalizeLock\(raw: unknown\)/);
  assert.match(lockSecurity, /salt\.length !== 16 \|\| hash\.length !== 64/);
  assert.match(lockSecurity, /return \{ salt: raw\.salt, hash: raw\.hash, \.\.\.SCRYPT_PARAMS \};/);
  assert.match(lockSecurity, /Buffer\.from\(lock\.salt, 'base64'\), SCRYPT_PARAMS/);
  assert.match(main, /createLockSecurityService/);
});

test('untrusted persisted ids are constrained and safely rendered in React attributes', () => {
  const validation = read('src/main/input-validation.ts');
  const schema = read('src/main/config-schema.ts');
  const lists = read('src/renderer-react/ai-hub-management-lists.tsx');
  const sidebar = read('src/renderer-react/account-list.tsx');
  assert.match(validation, /export function cleanId\(value: unknown, max = 160\)/);
  assert.match(schema, /next\.activeId = repairedAccounts\.some/);
  assert.match(lists, /data-id=\{service\.id\}/);
  assert.match(lists, /data-id=\{account\.id\}/);
  assert.match(lists, /data-shortcut-id=\{account\.id\}/);
  assert.match(lists, /data-clear-shortcut=\{account\.id\}/);
  assert.match(sidebar, /data-account-id=\{account\.id\}/);
  assert.doesNotMatch(lists, /dangerouslySetInnerHTML/);
  assert.doesNotMatch(sidebar, /dangerouslySetInnerHTML/);
});
test('Windows helpers derive their banner from package.json', () => {
  for (const file of ['+ build installer.cmd', '+ install and run.cmd']) {
    const text = read(file);
    const normalizedText = text.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '');
    assert.match(text, /node -p "require\('\.\/package\.json'\)\.version"/);
    assert.match(text, /echo Mad Station v%APP_VERSION%/);
  }
});


test('documented icon formats match the chooser and runtime MIME handling', () => {
  const main = read('src/main.js');
  const html = read('src/renderer.html');
  const remainingSettings = read('src/renderer-react/remaining-settings-panels.tsx');
  assert.match(remainingSettings, /PNG, JPG, WebP, GIF or ICO/);
  assert.match(main, /extensions: \['png', 'jpg', 'jpeg', 'ico', 'webp', 'gif'\]/);
  assert.match(read('src/main/icon-runtime.ts'), /ext === '\.gif' \? 'image\/gif'/);
});

test('workspace-scoped browser lifecycle prevents hidden account renderers', () => {
  const main = read('src/main.js');
  assert.match(main, /function createAccountView\(account, options = \{\}\)/);
  assert.match(read('src/main/account-browser-runtime.ts'), /getWorkspaceApp\(\) !== 'ai-hub' \|\| dependencies\.isLocked\(\)/);
  assert.match(main, /function setWorkspaceApp\(app\)/);
  assert.match(main, /closeAllAccountViews\(\);/);
  assert.match(main, /workspaceApp === 'ai-hub' && !locked/);
  assert.match(main, /closeAllAccountViews\(\);\n  clearArenaBrowserBindings\(\);/);
});

test('manual Lock Now preserves the renderer workspace across unlock', () => {
  const main = read('src/main.js');
  const renderer = read('src/renderer.js');
  const preload = read('src/preload.ts');
  assert.match(main, /function lockApp\(requestedWorkspaceApp = null\)/);
  assert.match(main, /workspaceApp = normalizeWorkspaceApp\(requestedWorkspaceApp\)/);
  assert.match(main, /function restoreWorkspaceAfterUnlock\(\)/);
  assert.match(main, /controlView\.webContents\.send\('workspace-app', \{ app: workspaceApp \}\)/);
  assert.match(main, /controlMode = 'launcher';[\s\S]*send\('control-mode', \{ mode: 'launcher' \}\)/);
  assert.match(renderer, /window\.aiHub\.lockNow\(currentApp\)/);
  assert.match(preload, /lockNow: \(workspace\) => invoke\('lock-now', workspace\)/);
});

test('unlock never recreates an AI Hub browser for a non-AI-Hub workspace', () => {
  const main = read('src/main.js');
  const section = main.slice(main.indexOf('function restoreWorkspaceAfterUnlock()'), main.indexOf('// ---------------------------------------------------------------------------\n// Sessions', main.indexOf('function restoreWorkspaceAfterUnlock()')));
  assert.match(section, /if \(workspaceApp === 'ai-hub'\)/);
  const nonHub = section.slice(section.indexOf("if (workspaceApp === 'ai-hub')"));
  const launcherBranch = nonHub.slice(nonHub.indexOf("closeAllAccountViews();"));
  assert.doesNotMatch(launcherBranch, /activateAccount\(activeId\)/);
  assert.match(launcherBranch, /controlMode = 'launcher'/);
});

test('locked state closes browser renderers without cancelling downloads', () => {
  const main = read('src/main.js');
  const start = main.indexOf('function lockApp(requestedWorkspaceApp = null)');
  const section = main.slice(start, main.indexOf('function restoreWorkspaceAfterUnlock()', start));
  assert.match(section, /closeAllAccountViews\(\);/);
  assert.match(section, /clearArenaBrowserBindings\(\);/);
  assert.doesNotMatch(section, /cancelDownloads/);
});

test('provider authentication domains participate in host validation', () => {
  const sessionSecurity = read('src/main/account-session-security.ts');
  assert.match(sessionSecurity, /Array\.isArray\(service\?\.authDomains\)/);
  assert.match(sessionSecurity, /Array\.isArray\(account\?\.authDomains\)/);
  assert.match(sessionSecurity, /hostname, \.\.\.configured/);
});

test('AI Lab API credentials are OS-protected and absent from lab JSON', () => {
  const main = read('src/main.js');
  const aiLabRuntime = read('src/main/ai-lab-runtime.ts');
  const credentialStore = read('src/main/ai-lab-credentials.ts');
  const preload = read('src/preload.ts');
  const renderer = read('src/renderer.js');
  assert.match(main, /safeStorage/);
  assert.match(main, /createAiLabCredentialStore/);
  assert.match(credentialStore, /mad-station-secure-credentials/);
  assert.match(credentialStore, /getSelectedStorageBackend/);
  assert.match(credentialStore, /flag: 'wx'/);
  assert.match(aiLabRuntime, /delete out\.apiKey/);
  assert.match(aiLabRuntime, /x-goog-api-key/);
  assert.doesNotMatch(aiLabRuntime, /:generateContent\?key=/);
  assert.match(preload, /setAiLabApiKey/);
  assert.match(preload, /clearAiLabApiKey/);
  assert.match(renderer, /apiModelKey/);
});

test('AI Lab data has backup recovery and retrying atomic writes', () => {
  const runtime = read('src/main/ai-lab-runtime.ts');
  assert.match(runtime, /\[file, `\$\{file\}\.bak`\]/);
  assert.match(runtime, /getDataPath\(\)/);
  assert.match(runtime, /\$\{file\}\.corrupt-\$\{now\(\)\}\.json/);
  assert.match(runtime, /for \(let attempt = 0; attempt < 3; attempt \+= 1\)/);
});

test('AI Lab secure-key migration is non-destructive on load and strict on save', () => {
  const runtime = read('src/main/ai-lab-runtime.ts');
  assert.match(runtime, /async function migrateLegacyApiKeys\(data: unknown, options: \{ failOnMigrationError\?\: boolean \} = \{\}\)/);
  assert.match(runtime, /migrationWarning = 'An existing AI Lab API key could not be moved to secure storage/);
  assert.match(runtime, /migrateLegacyApiKeys\(incoming, \{ failOnMigrationError: true \}\)/);
  assert.match(runtime, /return \{ ok: true, data: \{ \.\.\.loaded\.data, models \}, credentialWarning/);
});

test('clipboard history uses IndexedDB with a hard aggregate memory/storage cap', () => {
  const renderer = read('src/renderer.js');
  assert.match(renderer, /indexedDB\.open\(CLIPBOARD_DB_NAME/);
  assert.match(renderer, /MAX_CLIPBOARD_HISTORY_BYTES = 8 \* 1024 \* 1024/);
  assert.match(renderer, /trimClipboardHistory/);
});

test('updater uses semantic stable version comparison', () => {
  const runtime = read('src/main/native-operations-runtime.ts');
  assert.match(runtime, /compareStableVersions/);
  assert.match(runtime, /versionComparison < 0/);
  assert.match(runtime, /stable x\.y\.z/);
});

test('required release assets exist and icon cache is lazy bounded', () => {
  assert.equal(fs.existsSync(path.join(root, 'assets', 'icon.png')), true);
  assert.equal(fs.existsSync(path.join(root, 'assets', 'mad-station-icon-1024.png')), true);
  const main = read('src/main.js');
  const iconRuntime = read('src/main/icon-runtime.ts');
  assert.match(main, /maxLocalCacheBytes: 16 \* 1024 \* 1024/);
  assert.match(iconRuntime, /localCache = \{ files: new Map/);
});


test('external-browser and account-reset paths have no false-success side effects', () => {
  const main = read('src/main.js');
  const sessionSecurity = read('src/main/account-session-security.ts');
  assert.match(sessionSecurity, /\['https:', 'http:'\]\.includes\(parsed\.protocol\)/);
  assert.match(main, /const wasActive = activeId === id;/);
  assert.match(main, /wasActive && workspaceApp === 'ai-hub' && !locked/);
  assert.match(read('src/main/config-store.ts'), /saveConfig\(parsed, \{ createBackup: candidate === file \}\)/);
});

test('development environment pins Node/npm and guards reproducible installs', () => {
  assert.equal(pkg.packageManager, 'npm@10.9.2');
  assert.equal(pkg.engines.node, '22.16.0');
  assert.equal(read('.node-version').trim(), '22.16.0');
  assert.equal(read('.nvmrc').trim(), '22.16.0');
  assert.match(read('.npmrc'), /engine-strict=true/);
  assert.match(read('.npmrc'), /package-lock=true/);
  assert.match(read('.npmrc'), /registry=https:\/\/registry\.npmjs\.org\//);
  assert.equal(pkg.scripts['env:check'], 'node scripts/check-dev-environment.mjs');
  assert.match(pkg.scripts.prebuild, /npm run env:check/);
  assert.match(pkg.scripts.pretypecheck, /npm run env:check/);
  assert.match(pkg.scripts.pretest, /npm run env:check/);
  assert.match(pkg.scripts.predev, /npm run env:check/);
  const environmentCheck = read('scripts/check-dev-environment.mjs');
  assert.match(environmentCheck, /package-lock\.json is missing/);
  assert.match(environmentCheck, /lockfileVersion !== 3/);
  assert.match(environmentCheck, /node_modules\/\.bin/);
  assert.match(environmentCheck, /install-electron/);
  assert.match(read('docs/development/DEVELOPMENT_ENVIRONMENT.md'), /do not hand-author it/i);
  assert.match(read('+ install and run.cmd'), /call npm ci/);
  assert.match(read('+ install and run.cmd'), /if not exist package-lock\.json/);
  assert.doesNotMatch(read('+ install and run.cmd'), /call npm install/);
  assert.match(read('+ build installer.cmd'), /call npm ci/);
  assert.match(read('+ build installer.cmd'), /package-lock\.json is missing/);
  const resources = pkg.build.extraResources.map((resource) => resource.from);
  assert.ok(resources.includes('docs/development/DEVELOPMENT_ENVIRONMENT.md'));
  assert.ok(resources.includes('scripts/check-dev-environment.mjs'));
});

test('release build pins Electron packaging and the React/TypeScript/Vite toolchain', () => {
  assert.equal(pkg.devDependencies.electron, '44.7.2');
  assert.equal(pkg.devDependencies['electron-builder'], '26.17.0');
  assert.equal(pkg.devDependencies.react, '19.2.0');
  assert.equal(pkg.devDependencies.typescript, '5.9.3');
  assert.equal(pkg.devDependencies.vite, '7.3.7');
  assert.equal(pkg.scripts.build, 'npm run typecheck && npm run build:renderer && npm run build:preload && npm run build:main-modules');
});

test('electron-builder packages only production runtime files', () => {
  const files = pkg.build?.files || [];
  assert.deepEqual(files, ['src/**/*', 'assets/**/*', 'build/**/*', 'package.json']);
});


test('migration does not silently reassign an account with a missing provider', () => {
  const main = read('src/main.js');
  const readModel = read('src/main/ai-hub-read-model.ts');
  const schema = read('src/main/config-schema.ts');
  const section = schema.slice(schema.indexOf('const requestedServiceId'), schema.indexOf('next.accounts = repairedAccounts'));
  assert.doesNotMatch(section, /const fallbackService = next\.services\[0\]/);
  assert.match(section, /repairedServices\.find\(\(candidate\) => normalizeHttpsUrl\(candidate\.url\) === normalizeHttpsUrl\(account\.url\)\)/);
  assert.match(section, /const repairedServiceId = service\?\.id \|\| requestedServiceId/);
  assert.match(readModel, /providerMissing: !service/);
  assert.match(main, /buildAiHubReadModel/);
});

test('save failures are surfaced instead of reported as silent success', () => {
  const main = read('src/main.js');
  assert.match(main, /if \(!saved\) notice\('Could not save the workspace\./);
  assert.match(main, /function openExternalSafe\(url\) \{ return accountSessionSecurity\.openExternalSafe\(url\); \}/);
  assert.match(read('src/main/account-session-security.ts'), /Could not open that link in your browser/);
});

test('fresh-install provider catalog has one curated free-tier provider per starter account', () => {
  const providers = require(path.join(src, 'default-providers.js'));
  assert.equal(providers.length, 14);
  assert.equal(new Set(providers.map((p) => p.id)).size, providers.length);
  assert.equal(new Set(providers.map((p) => p.url)).size, providers.length);
  assert.ok(providers.every((p) => p.freeTier === true));
  assert.ok(providers.every((p) => /^https:\/\//i.test(p.url)));
  assert.deepEqual(providers.map((p) => p.name), [
    'ChatGPT', 'Claude', 'Gemini', 'DeepSeek', 'Perplexity', 'Grok',
    'Microsoft Copilot', 'Meta AI', 'Mistral Vibe', 'Qwen', 'Kimi', 'Poe', 'Duck.ai', 'Character.AI',
  ]);
});

test('untouched legacy 3x6 starter configs are upgraded to the curated one-per-provider catalog', () => {
  const main = read('src/main.js');
  const schema = read('src/main/config-schema.ts');
  assert.match(schema, /function migrateLegacyStarterAccounts\(next: ConfigRecord\)/);
  assert.match(schema, /oldAccounts\.length !== legacyIds\.size \* 3/);
  assert.match(schema, /next\.services = services;/);
  assert.match(schema, /next\.accounts = accounts;/);
  assert.match(schema, /account\.name === `\$\{service\.name\} 1`/);
  assert.match(schema, /migrateLegacyStarterAccounts\(next\);/);
  assert.match(read('README.md'), /untouched legacy starter configuration/);
});

test('fresh defaults create exactly one account per provider', () => {
  const main = read('src/main.js');
  const schema = read('src/main/config-schema.ts');
  assert.match(main, /const DEFAULT_SERVICES = require\('\.\/default-providers'\);/);
  assert.match(schema, /const accounts: AccountRecord\[\] = services\.map\(\(service, index\) =>/);
  assert.doesNotMatch(schema, /for \(let i = 1; i <= 3; i \+= 1\)/);
  assert.match(read('README.md'), /one account per curated provider/);
});

test('provider settings expose free-tier state without making free access a hard security dependency', () => {
  const renderer = read('src/renderer.js');
  const component = read('src/renderer-react/ai-hub-management-lists.tsx');
  assert.match(renderer, /freeTier: Boolean\(service\.freeTier\)/, 'host bridge normalizes the setting to a boolean');
  assert.match(component, /service\.freeTier \? 'Free tier' : 'Custom'/);
  assert.match(component, /className="free-badge"/);
});
test('provider and account order is persistent, shared by both sidebar styles, and user-customizable', () => {
  const main = read('src/main.js');
  const aiHubIpc = read('src/main/ai-hub-ipc.ts');
  const schema = read('src/main/config-schema.ts');
  const preload = read('src/preload.ts');
  const renderer = read('src/renderer.js');
  const managementLists = read('src/renderer-react/ai-hub-management-lists.tsx');
  assert.match(schema, /serviceOrder: services\.map\(\(service\) => service\.id\)/);
  assert.match(schema, /accountOrder: accounts\.map\(\(account\) => account\.id\)/);
  assert.match(aiHubIpc, /handle\('reorder-services'/);
  assert.match(aiHubIpc, /handle\('reorder-accounts'/);
  const readModel = read('src/main/ai-hub-read-model.ts');
  assert.match(main, /reorderConfigCollection\(config, 'serviceOrder', ids\)/);
  assert.match(main, /reorderConfigCollection\(config, 'accountOrder', ids\)/);
  assert.match(readModel, /export function orderedConfigItems/);
  assert.match(readModel, /export function reorderConfigCollection/);
  assert.match(readModel, /export function buildAiHubReadModel/);
  assert.match(main, /return buildAiHubReadModel\(\{/);
  assert.match(preload, /reorderServices: \(ids\) => invoke\('reorder-services', ids\)/);
  assert.match(preload, /reorderAccounts: \(ids\) => invoke\('reorder-accounts', ids\)/);
  assert.match(renderer, /function orderedServices\(\)/);
  assert.match(renderer, /function orderedAccounts\(\)/);
  assert.match(renderer, /orderedServices\(\)/);
  assert.match(renderer, /orderedAccounts\(\)/);
  assert.match(renderer, /function bindReorderRows\(root, type\)/, 'provider filter tiles retain their reorder behavior');
  assert.match(managementLists, /draggable\s+data-reorder-type="service"/);
  assert.match(managementLists, /draggable\s+data-reorder-type="account"/);
  assert.match(managementLists, /data-order-action="up"/);
  assert.match(managementLists, /data-order-action="down"/);
  assert.match(managementLists, /data-order-action/);
  assert.match(read('README.md'), /same order is used by both the List and Icon grid sidebar styles/);
});
test('icon rendering always has a bundled default and rebinds after filter-only renders', () => {
  const renderer = read('src/renderer.js');
  const toolbar = read('src/toolbar-react/main.tsx');
  assert.match(renderer, /const DEFAULT_ICON_SVG =/);
  assert.match(renderer, /data-icon-cache-tried/);
  assert.match(renderer, /if \(!list\.includes\(DEFAULT_ICON_DATA_URL\)\) list\.push\(DEFAULT_ICON_DATA_URL\)/);
  assert.match(renderer, /bindIconFallbacks\(tiles\);/);
  assert.match(renderer, /bindIconFallbacks\(root\);/);
  assert.match(renderer, /img\.src = DEFAULT_ICON_DATA_URL/);
  assert.match(toolbar, /function safeIconSource\(state: ToolbarState\)/);
  assert.match(toolbar, /setIconFailed\(true\)/);
  assert.match(toolbar, /tb-icon-default/);
});

test('remote icon candidate serialization keeps cached data at service level, not per account', () => {
  const main = read('src/main.js');
  const iconRuntime = read('src/main/icon-runtime.ts');
  assert.match(iconRuntime, /includeCachedRemote = options\.includeCachedRemote !== false/);
  const readModel = read('src/main/ai-hub-read-model.ts');
  assert.match(readModel, /includeCachedRemote: false/);
  assert.match(readModel, /const backingService = config\.services\.find/);
  assert.match(readModel, /const safeBackingIcon = localIconFor\(backingService\)/);
  assert.match(iconRuntime, /let cachedRemote = ''/);
  assert.match(iconRuntime, /cachedRemote \? \[cachedRemote\] : \[]/);
  assert.match(iconRuntime, /\.\.\.raw/);
});

test('provider filters use the cache-aware icon pipeline and a visible final fallback', () => {
  const renderer = read('src/renderer.js');
  const main = read('src/main.js');
  const preload = read('src/preload.ts');
  assert.match(renderer, /function setProviderFilter\(id\)[\s\S]*renderAccountsSidebar\(\);/);
  assert.match(renderer, /window\.aiHub\.cacheIcon/);
  assert.match(renderer, /const DEFAULT_ICON_DATA_URL =/);
  assert.match(renderer, /img\.src = DEFAULT_ICON_DATA_URL/);
  assert.ok(main.includes("const { createRemoteIconCache } = require('../build/main/icon-cache.js');"));
  assert.match(main, /function getRemoteIconCache\(\)/);
  assert.match(main, /handle\('cache-icon'/);
  assert.ok(preload.includes("cacheIcon: (iconUrl) => invoke('cache-icon', iconUrl)"));
});

test('remote icon cache can reload a previously persisted icon without network access', () => {
  const os = require('node:os');
  const crypto = require('node:crypto');
  const { createRemoteIconCache } = require('../build/main/icon-cache.js');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mad-station-icon-cache-'));
  try {
    const url = 'https://example.com/favicon.ico';
    const bytes = Buffer.from([0, 1, 2, 3, 4]);
    const file = `${crypto.createHash('sha256').update(url).digest('hex')}.ico`;
    fs.writeFileSync(path.join(tmp, file), bytes);
    fs.writeFileSync(path.join(tmp, 'index.json'), JSON.stringify({ [url]: { file, mime: 'image/x-icon' } }));
    const cache = createRemoteIconCache(tmp);
    assert.equal(cache.get(url), `data:image/x-icon;base64,${bytes.toString('base64')}`);
    assert.equal(cache.get('http://example.com/favicon.ico'), '');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('remote icon cache persists successful images on disk and rejects non-HTTPS URLs', () => {
  const cache = read('src/main/icon-cache.ts');
  assert.match(cache, /class RemoteIconCache/);
  assert.match(cache, /fs\.writeFileSync\(tmp, result\.bytes\)/);
  assert.match(cache, /JSON\.stringify\(out, null, 2\)/);
  assert.match(cache, /if \(parsed && typeof parsed === 'object'\)/);
  assert.match(cache, /parsed\.protocol !== 'https:'/);
  assert.match(cache, /MAX_ICON_BYTES = 512 \* 1024/);
});

test('ordering starts in the existing provider/account order and is not reset by appearance changes', () => {
  const main = read('src/main.js');
  const schema = read('src/main/config-schema.ts');
  const renderer = read('src/renderer.js');
  assert.match(schema, /next\.serviceOrder = normalizeOrder\(next\.serviceOrder, repairedServices\)/);
  assert.match(schema, /next\.accountOrder = normalizeOrder\(next\.accountOrder, repairedAccounts\)/);
  assert.match(read('src/main/settings-ipc.ts'), /controller\.resetSettings\(\)/, 'settings reset is routed through the typed IPC registration module');
  assert.match(read('src/main/settings-controller.ts'), /security: \{ \.\.\.DEFAULT_SECURITY \},[\s\S]*downloads: \{ \.\.\.dependencies\.defaultDownloads \}/, 'settings reset keeps independent security and download defaults');
  assert.doesNotMatch(main, /config\.serviceOrder\s*=\s*config\.services\.map/);
  assert.doesNotMatch(main, /config\.accountOrder\s*=\s*config\.accounts\.map/);
  assert.match(read('src/styles.css'), /body\[data-density="compact"\]/);
});

function loadReorderHelpers() {
  const renderer = read('src/renderer.js');
  const grab = (name) => renderer.match(new RegExp(`(?:async )?function ${name}\\([\\s\\S]*?\\n}\\n`))[0];
  const code = ['computeReorder', 'persistOrder', 'bindReorderRows'].map(grab).join('\n');
  return new Function('currentOrderIds', 'window', 'showToast', `${code}; return { computeReorder, bindReorderRows };`);
}

test('computeReorder moves an item before/after a target and ignores no-ops', () => {
  const { computeReorder } = loadReorderHelpers()(() => [], {}, () => {});
  const ids = ['a', 'b', 'c', 'd'];
  assert.deepEqual(computeReorder(ids, 'a', 'c', false), ['b', 'a', 'c', 'd']);
  assert.deepEqual(computeReorder(ids, 'a', 'c', true), ['b', 'c', 'a', 'd']);
  assert.deepEqual(computeReorder(ids, 'd', 'a', false), ['d', 'a', 'b', 'c']);
  assert.deepEqual(computeReorder(ids, 'a', 'd', true), ['b', 'c', 'd', 'a']);
  assert.equal(computeReorder(ids, 'b', 'a', true), null);   // already right after a
  assert.equal(computeReorder(ids, 'b', 'c', false), null);  // already right before c
  assert.equal(computeReorder(ids, 'a', 'a', true), null);
  assert.equal(computeReorder(ids, 'zzz', 'a', true), null);
  assert.equal(computeReorder(ids, 'a', 'zzz', true), null);
  assert.deepEqual(ids, ['a', 'b', 'c', 'd'], 'input must not be mutated');
});

test('bindReorderRows drags a provider tile to a new position and saves the order', async () => {
  const saved = [];
  const window = { aiHub: { reorderServices: async (ids) => { saved.push(ids); return { ok: true }; }, reorderAccounts: async () => ({ ok: true }) } };
  const { bindReorderRows } = loadReorderHelpers()(() => ['chatgpt', 'claude', 'gemini'], window, () => {});
  const makeRow = (id) => {
    const handlers = {}; const classes = new Set();
    return {
      id, handlers, classes,
      dataset: { reorderId: id, reorderType: 'service' },
      classList: { add: (...c) => c.forEach((x) => classes.add(x)), remove: (...c) => c.forEach((x) => classes.delete(x)) },
      addEventListener: (name, fn) => { handlers[name] = fn; },
      contains: () => false,
      getBoundingClientRect: () => ({ left: 0, width: 40, top: 0, height: 40 }),
    };
  };
  const rows = ['chatgpt', 'claude', 'gemini'].map(makeRow);
  const root = {
    dataset: { reorderAxis: 'x' },
    querySelectorAll: (selector) => selector.includes('data-reorder-type') ? rows : rows.filter((r) => r.classes.has('reorder-before') || r.classes.has('reorder-after')),
  };
  bindReorderRows(root, 'service');
  const data = {};
  const dt = { setData: (k, v) => { data[k] = v; }, set effectAllowed(v) {}, set dropEffect(v) {} };
  rows[2].handlers.dragstart({ dataTransfer: dt });
  const over = { clientX: 5, clientY: 0, dataTransfer: dt, preventDefault() {}, relatedTarget: null };
  rows[0].handlers.dragover(over);
  assert.ok(rows[0].classes.has('reorder-before'), 'left half of the target shows a "before" marker');
  await rows[0].handlers.drop({ ...over });
  rows[2].handlers.dragend();
  assert.deepEqual(saved, [['gemini', 'chatgpt', 'claude']]);
  assert.equal(rows[0].classes.size, 0, 'markers are cleared after the drop');
  // dropping on the right half of the last tile moves to the end
  rows[0].handlers.dragstart({ dataTransfer: dt });
  await rows[2].handlers.drop({ clientX: 35, clientY: 0, dataTransfer: dt, preventDefault() {} });
  assert.deepEqual(saved[1], ['chatgpt', 'claude', 'gemini'].filter((x) => x !== 'chatgpt').concat('chatgpt'));
});

test('main sidebar provider tiles are draggable, keyboard-movable and have a move menu', () => {
  const renderer = read('src/renderer.js');
  const css = read('src/styles.css');
  assert.match(renderer, /tile\.draggable = true; tile\.dataset\.reorderType = 'service'; tile\.dataset\.reorderId = service\.id;/);
  assert.match(renderer, /tiles\.dataset\.reorderAxis = 'x';[\s\S]*?bindReorderRows\(tiles, 'service'\);/);
  assert.match(renderer, /function openProviderMenu\(id, x, y\)/);
  assert.match(renderer, /label: 'Move earlier'/);
  assert.match(renderer, /label: 'Move later'/);
  assert.match(renderer, /tile\.addEventListener\('contextmenu'/);
  assert.match(renderer, /event\.ctrlKey \|\| !event\.shiftKey/);
  assert.match(renderer, /draggable="false" src=/, 'icon images must not hijack the drag');
  assert.match(css, /\.tile\.reorder-before::before/);
  assert.match(css, /\.reorder-row\.reorder-after::after/);
});

test('sidebar account cards are draggable and saved through the account order', () => {
  const renderer = read('src/renderer.js');
  const component = read('src/renderer-react/account-list.tsx');
  const css = read('src/styles.css');
  assert.match(component, /draggable\s+data-reorder-type="account"\s+data-reorder-id=\{account\.id\}/);
  assert.match(component, /props\.onReorder\(dragged, account\.id, after\)/);
  assert.match(renderer, /onReorder: async \(dragId, targetId, after\) => \{[\s\S]*?persistOrder\('account', ids\)/);
  assert.match(css, /\.account-row\.reorder-before::before/);
});
test('settings provider rows keep the name block left-aligned next to the drag handle', () => {
  const css = read('src/styles.css');
  assert.match(css, /\.provider-main \{[^}]*flex: 1 1 auto;[^}]*text-align: left;/);
});

test('the Free badge is not stretched by the provider description rules', () => {
  const css = read('src/styles.css');
  assert.doesNotMatch(css, /\.provider-copy span \{/, 'description rules must only target direct child spans');
  assert.match(css, /\.free-badge \{ display: inline-block;/);
});

test('settings tabs are merged and ordered, and every tab has exactly one panel', () => {
  const html = read('src/renderer.html');
  const tabMatches = [...html.matchAll(/class="settings-tab[^"]*" data-tab="(\w+)"[^>]*data-settings-scope="(\w+)"/g)];
  const panelMatches = [...html.matchAll(/class="settings-panel[^"]*" data-panel="(\w+)"[^>]*data-settings-scope="(\w+)"/g)];
  const tabs = tabMatches.map((m) => `${m[2]}:${m[1]}`);
  const panels = panelMatches.map((m) => `${m[2]}:${m[1]}`);
  assert.deepEqual(tabs, ['aihub:providers', 'aihub:accounts', 'aihub:shortcuts', 'aihub:appearance', 'global:appearance', 'global:accessibility', 'global:audio', 'global:startup', 'global:lock', 'global:downloads', 'aihub:privacy', 'aihub:websites', 'global:about', 'global:data', 'global:developer']);
  assert.deepEqual(panels, tabs, 'scoped panel order and tab order must match');
  const nav = html.slice(html.indexOf('<nav class="st-nav-list">'), html.indexOf('</nav>', html.indexOf('<nav class="st-nav-list">')));
  assert.ok(nav.indexOf('data-tab="data"') < nav.indexOf('data-label="developer"'), 'Developer section should follow Data');
  assert.ok(nav.indexOf('data-label="developer"') < nav.indexOf('data-tab="developer"'), 'Developer tab should be grouped under its own section label');
  const css = read('src/styles.css');
  assert.match(css, /\.st-nav-list \[data-label="developer"\]\{order:23\}/, 'Developer section heading should follow Data in the visual nav order');
  assert.match(css, /\.st-nav-list \[data-settings-scope="global"\]\[data-tab="developer"\]\{order:24\}/, 'Developer tab should be the final visual nav item');
  for (const split of ['accounts', 'accessibility', 'startup', 'lock', 'data', 'developer']) assert.ok(tabs.some((tab) => tab.endsWith(`:${split}`)), `${split} should have its own tab`);
  const providers = html.match(/data-panel="providers"[\s\S]*?data-panel="accounts"/)[0];
  assert.match(providers, /id="providerList"/);
  assert.doesNotMatch(providers, /id="settingsAccountList"/);
  const accounts = html.match(/data-panel="accounts"[\s\S]*?data-panel="shortcuts"/)[0];
  assert.match(accounts, /id="settingsAccountList"/);
  assert.doesNotMatch(accounts, /id="providerList"/);
});

test('merged settings tabs keep every control and element id exactly once', () => {
  const html = read('src/renderer.html');
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(ids.filter((id, i) => ids.indexOf(id) !== i), [], 'duplicate ids');
  for (const id of ['providerCountPill', 'accountCountInfo', 'aboutReactMount', 'developerReactMount', 'aiHubPrivacyReactMount', 'aiHubWebsitesReactMount', 'lockOptions', 'passwordStatus', 'themeOptions', 'accentOptions', 'aiHubSidebarAppearanceReactMount', 'accountSafetyReactMount', 'builtInShortcutsReactMount', 'globalAppearanceAdvancedReactMount']) {
    assert.ok(ids.includes(id), `missing #${id}`);
  }
  const globalAppearance = html.match(/data-panel="appearance" data-settings-scope="global"[\s\S]*?data-panel="accessibility"/)[0];
  const aiHubAppearance = html.match(/data-panel="appearance" data-settings-scope="aihub"[\s\S]*?data-panel="appearance" data-settings-scope="global"/)[0];
  const remainingSettings = read('src/renderer-react/remaining-settings-panels.tsx');
  for (const key of ['pageZoom', 'reduceMotion', 'density']) assert.ok(remainingSettings.includes(key), `React settings control retained: ${key}`);
  assert.doesNotMatch(globalAppearance, /data-app-choice=/, 'advanced Appearance controls are React-owned');
  assert.doesNotMatch(aiHubAppearance, /data-app-choice=/, 'AI Hub sidebar density is React-owned');
  const startup = read('src/renderer-react/global-settings-panels.tsx');
  for (const key of ['startMaximized', 'restoreLastAccount', 'launchAtLogin']) assert.match(startup, new RegExp(`data-app=\{key\}.*${key}|${key}.*data-app=\{key\}`, 's'));
  const lock = html.match(/data-panel="lock"[\s\S]*?data-panel="downloads"/)[0];
  const systemSettings = read('src/renderer-react/system-settings-panels.tsx');
  assert.match(lock, /id="lockOptions"/);
  for (const key of ['lockOnLaunch', 'lockOnSystemLock', 'lockOnMinimize', 'lockOnIdle']) assert.match(systemSettings, new RegExp(`'${key}'`));
  assert.match(systemSettings, /data-sec-choice="idleMinutes"/);
  const informationSecurity = read('src/renderer-react/information-security-panels.tsx');
  for (const key of ['clearCacheOnExit', 'contentProtection', 'allowCamera', 'allowNotifications']) assert.match(informationSecurity, new RegExp(`key: '${key}'`));
  assert.doesNotMatch(html.match(/data-panel="privacy"[\s\S]*?data-panel="websites"/)[0], /data-sec=/, 'privacy controls are React-owned');
});

test('old settings tab names still resolve and search hides group labels', () => {
  const renderer = read('src/renderer.js');
  assert.match(renderer, /SETTINGS_TAB_ALIASES = \{ general: 'appearance' \}/);
  assert.match(renderer, /querySelectorAll\('\.panel-head, \.about-hero, \.group-label'\)\.forEach\(\(el\) => el\.classList\.add\('hidden'\)\)/);
  assert.match(renderer, /providerCountPill/);
});


// ---------------------------------------------------------------------------
// Downloads
// ---------------------------------------------------------------------------

const downloads = require('../build/main/downloads.js');

function fakeItem({ filename = 'report.pdf', url = 'https://files.example.com/a?token=secret', total = 100 } = {}) {
  const handlers = { updated: [], done: [] };
  const item = {
    savePath: '', dialogOptions: null, received: 0, total, paused: false, cancelled: false,
    getFilename: () => filename,
    getURL: () => url,
    getTotalBytes: () => item.total,
    getReceivedBytes: () => item.received,
    setSavePath: (p) => { item.savePath = p; },
    getSavePath: () => item.savePath,
    setSaveDialogOptions: (o) => { item.dialogOptions = o; },
    isPaused: () => item.paused,
    canResume: () => true,
    pause: () => { item.paused = true; },
    resume: () => { item.paused = false; },
    cancel: () => { item.cancelled = true; handlers.done.forEach((fn) => fn({}, 'cancelled')); },
    on: (name, fn) => { handlers[name].push(fn); },
    once: (name, fn) => { handlers[name].push(fn); },
    emitUpdated: (state = 'progressing') => handlers.updated.forEach((fn) => fn({}, state)),
    emitDone: (state = 'completed') => handlers.done.forEach((fn) => fn({}, state)),
  };
  return item;
}

function makeManager(overrides = {}) {
  const existing = new Set(overrides.existing || []);
  const opened = [];
  const shown = [];
  const finished = [];
  let settings = { askWhereToSave: false, folder: '', notifyWhenDone: true, ...(overrides.settings || {}) };
  const manager = downloads.createDownloadManager({
    getSettings: () => settings,
    getDefaultFolder: () => path.join(path.sep, 'home', 'user', 'Downloads'),
    getAccountName: (id) => (id === 'acc1' ? 'Work' : ''),
    shell: { openPath: async (p) => { opened.push(p); return ''; }, showItemInFolder: (p) => shown.push(p) },
    onFinished: (entry) => finished.push(entry),
    fsImpl: { existsSync: (p) => existing.has(p), mkdirSync: () => {} },
  });
  return { manager, opened, shown, finished, existing, setSettings: (s) => { settings = { ...settings, ...s }; } };
}

test('download file names are made safe for Windows and cannot escape the folder', () => {
  assert.equal(downloads.sanitizeFileName('report.pdf'), 'report.pdf');
  assert.equal(downloads.sanitizeFileName('..\\..\\evil.txt'), '_.._evil.txt');
  assert.ok(!/[\\/]/.test(downloads.sanitizeFileName('../../etc/passwd')));
  assert.equal(downloads.sanitizeFileName('a<b>c:d"e|f?g*h.txt'), 'a_b_c_d_e_f_g_h.txt');
  assert.equal(downloads.sanitizeFileName('CON.txt'), '_CON.txt');
  assert.equal(downloads.sanitizeFileName('lpt1'), '_lpt1');
  assert.equal(downloads.sanitizeFileName('notes.txt. . '), 'notes.txt');
  assert.equal(downloads.sanitizeFileName('   '), 'download');
  assert.equal(downloads.sanitizeFileName(''), 'download');
  assert.equal(downloads.sanitizeFileName('.hidden'), 'hidden');
  const long = downloads.sanitizeFileName(`${'x'.repeat(400)}.pdf`);
  assert.ok(long.length <= 180 && long.endsWith('.pdf'));
});

test('download settings are validated and unusable folders fall back to the default', () => {
  assert.deepEqual(downloads.normalizeDownloadSettings(undefined), downloads.DEFAULT_DOWNLOAD_SETTINGS);
  assert.deepEqual(downloads.normalizeDownloadSettings('nope'), downloads.DEFAULT_DOWNLOAD_SETTINGS);
  const abs = path.resolve('some', 'folder');
  assert.equal(downloads.normalizeDownloadSettings({ folder: abs }).folder, abs);
  assert.equal(downloads.normalizeDownloadSettings({ folder: 'relative/path' }).folder, '');
  assert.equal(downloads.normalizeDownloadSettings({ folder: `${abs}\0x` }).folder, '');
  assert.equal(downloads.normalizeDownloadSettings({ folder: 42 }).folder, '');
  assert.equal(downloads.normalizeDownloadSettings({ askWhereToSave: 'yes' }).askWhereToSave, false);
  assert.equal(downloads.normalizeDownloadSettings({ askWhereToSave: true }).askWhereToSave, true);
  assert.equal(downloads.normalizeDownloadSettings({ notifyWhenDone: false }).notifyWhenDone, false);
});

test('existing files are never overwritten: a numbered name is chosen instead', () => {
  const dir = path.join(path.sep, 'dl');
  const taken = new Set([path.join(dir, 'a.txt'), path.join(dir, 'a (1).txt')]);
  assert.equal(downloads.uniqueFilePath(dir, 'a.txt', (p) => taken.has(p)), path.join(dir, 'a (2).txt'));
  assert.equal(downloads.uniqueFilePath(dir, 'b.txt', (p) => taken.has(p)), path.join(dir, 'b.txt'));
  assert.equal(downloads.uniqueFilePath(dir, 'noext', (p) => p === path.join(dir, 'noext')), path.join(dir, 'noext (1)'));
});

test('programs and scripts are recognised by extension, case-insensitively', () => {
  for (const name of ['setup.exe', 'RUN.BAT', 'x.ps1', 'a.msi', 'link.lnk', 'macro.docm', 'x.js']) assert.ok(downloads.isProgramFileName(name), name);
  for (const name of ['report.pdf', 'photo.png', 'data.csv', 'page.html', 'noext', 'archive.zip']) assert.ok(!downloads.isProgramFileName(name), name);
});

test('a normal download is saved straight into the default folder with a unique name', () => {
  const dir = path.join(path.sep, 'home', 'user', 'Downloads');
  const { manager, existing } = makeManager({ existing: [path.join(dir, 'report.pdf')] });
  existing.add(path.join(dir, 'report.pdf'));
  const item = fakeItem();
  const entry = manager.handleWillDownload(item, 'acc1');
  assert.equal(item.savePath, path.join(dir, 'report (1).pdf'));
  assert.equal(item.dialogOptions, null, 'no Save As window in the default mode');
  assert.equal(entry.state, 'progressing');
  const state = manager.getState();
  assert.equal(state.active, 1);
  assert.equal(state.items[0].host, 'files.example.com', 'only the host is kept, never the full URL');
  assert.equal(state.items[0].accountName, 'Work');
  assert.ok(!JSON.stringify(state).includes('secret'), 'URL tokens must never reach the UI');
});

test('a custom folder is used, and ask-where-to-save defers to the Save As window', () => {
  const folder = path.resolve('my', 'files');
  const a = makeManager({ settings: { folder } });
  const item = fakeItem({ filename: 'x.zip' });
  a.manager.handleWillDownload(item, 'acc1');
  assert.equal(item.savePath, path.join(folder, 'x.zip'));

  const b = makeManager({ settings: { folder, askWhereToSave: true } });
  const item2 = fakeItem({ filename: 'x.zip' });
  b.manager.handleWillDownload(item2, 'acc1');
  assert.equal(item2.savePath, '', 'the Save As window decides the path');
  assert.equal(item2.dialogOptions.defaultPath, path.join(folder, 'x.zip'));
});

test('programs always show the Save As window and can never be opened from the app', async () => {
  const { manager, opened, existing } = makeManager();
  const item = fakeItem({ filename: 'installer.exe' });
  manager.handleWillDownload(item, 'acc1');
  assert.ok(item.dialogOptions, 'program downloads must ask where to save');
  item.savePath = path.join(path.sep, 'x', 'installer.exe');
  item.received = 100;
  item.emitUpdated();
  item.emitDone('completed');
  existing.add(item.savePath);
  const entry = manager.getState().items[0];
  assert.equal(entry.program, true);
  assert.equal(entry.canOpen, false);
  assert.equal(entry.canShow, true);
  const result = await manager.open(entry.id);
  assert.equal(result.ok, false);
  assert.deepEqual(opened, []);
});

test('the list shows the name the user really saved, and the program check uses the final extension', () => {
  const { manager } = makeManager({ settings: { askWhereToSave: true } });
  const renamedToProgram = fakeItem({ filename: 'notes.txt' });
  manager.handleWillDownload(renamedToProgram, 'acc1');
  renamedToProgram.savePath = path.join(path.sep, 'x', 'tool.exe');
  renamedToProgram.received = 10; renamedToProgram.emitDone('completed');
  let entry = manager.getState().items[0];
  assert.equal(entry.name, 'tool.exe');
  assert.equal(entry.canOpen, false);

  const renamedToSafe = fakeItem({ filename: 'tool.exe' });
  manager.handleWillDownload(renamedToSafe, 'acc1');
  renamedToSafe.savePath = path.join(path.sep, 'x', 'tool.txt');
  renamedToSafe.received = 10; renamedToSafe.emitDone('completed');
  entry = manager.getState().items[0];
  assert.equal(entry.name, 'tool.txt');
  assert.equal(entry.canOpen, true);
});

test('progress, completion, open and show-in-folder work by id and check the file exists', async () => {
  const { manager, opened, shown, finished, existing } = makeManager();
  const item = fakeItem({ filename: 'doc.pdf', total: 200 });
  manager.handleWillDownload(item, 'acc1');
  item.received = 50; item.emitUpdated();
  assert.equal(manager.getState().items[0].received, 50);
  item.received = 200; item.emitDone('completed');
  const entry = manager.getState().items[0];
  assert.equal(entry.state, 'completed');
  assert.equal(manager.getState().active, 0);
  assert.equal(finished.length, 1);
  assert.equal(finished[0].name, 'doc.pdf');

  assert.equal((await manager.open(entry.id)).ok, false, 'a file that is gone is reported, not launched');
  existing.add(item.savePath);
  assert.equal((await manager.open(entry.id)).ok, true);
  assert.deepEqual(opened, [item.savePath]);
  assert.equal(manager.show(entry.id).ok, true);
  assert.deepEqual(shown, [item.savePath]);
  assert.equal((await manager.open('not-an-id')).ok, false);
  assert.equal(manager.show('../../etc/passwd').ok, false);
});

test('cancel, pause, resume and remove behave and finished items can be cleared', () => {
  const { manager } = makeManager();
  const a = fakeItem({ filename: 'a.bin' });
  const b = fakeItem({ filename: 'b.bin' });
  manager.handleWillDownload(a, 'acc1');
  manager.handleWillDownload(b, 'acc1');
  const [second, first] = manager.getState().items;
  assert.equal(manager.pause(first.id).ok, true);
  assert.equal(a.paused, true);
  assert.equal(manager.resume(first.id).ok, true);
  assert.equal(a.paused, false);
  assert.equal(manager.remove(first.id).ok, false, 'a running download cannot be removed from the list');
  assert.equal(manager.cancel(second.id).ok, true);
  assert.equal(b.cancelled, true);
  assert.equal(manager.getState().items.find((e) => e.id === second.id).state, 'cancelled');
  assert.equal(manager.cancel('missing').ok, false);
  manager.clearFinished();
  const left = manager.getState().items;
  assert.equal(left.length, 1);
  assert.equal(left[0].id, first.id);
});

test('dismissing the Save As window leaves no ghost entry; interrupted downloads are reported as failed', () => {
  const { manager, finished } = makeManager({ settings: { askWhereToSave: true } });
  const dismissed = fakeItem({ filename: 'a.txt' });
  manager.handleWillDownload(dismissed, 'acc1');
  dismissed.emitDone('cancelled');
  assert.equal(manager.getState().items.length, 0);

  const broken = fakeItem({ filename: 'b.txt' });
  manager.handleWillDownload(broken, 'acc1');
  broken.savePath = path.join(path.sep, 'x', 'b.txt');
  broken.emitUpdated('interrupted');
  assert.equal(manager.getState().items[0].state, 'interrupted');
  broken.emitDone('interrupted');
  assert.equal(manager.getState().items[0].state, 'failed');
  assert.equal(finished.at(-1).state, 'failed');
});

test('closing an account cancels only that account\'s downloads', () => {
  const { manager } = makeManager();
  const mine = fakeItem({ filename: 'm.bin' });
  const other = fakeItem({ filename: 'o.bin' });
  manager.handleWillDownload(mine, 'acc1');
  manager.handleWillDownload(other, 'acc2');
  manager.cancelForAccount('acc1');
  assert.equal(mine.cancelled, true);
  assert.equal(other.cancelled, false);
});

test('downloads are wired into every account session, settings, IPC and the UI', () => {
  const main = read('src/main.js');
  const schema = read('src/main/config-schema.ts');
  const preload = read('src/preload.ts');
  const html = read('src/renderer.html');
  const renderer = read('src/renderer.js');
  const settingsIpc = read('src/main/settings-ipc.ts');
  const downloadsIpc = read('src/main/downloads-ipc.ts');
  assert.match(read('src/main/account-session-security.ts'), /sess\.on\('will-download'/);
  assert.match(main, /createDownloadManager\(/);
  assert.match(schema, /downloads: normalizeDownloadSettings\(rawSettings\.downloads\)/);
  assert.match(main, /registerSettingsIpcHandlers\(handle, settingsController\)/, 'settings changes are registered through the typed IPC module');
  assert.match(read('src/main/settings-controller.ts'), /security: current\.security,[\s\S]*downloads: current\.downloads/, 'appearance saves must preserve dedicated security/download settings');
  assert.equal((main.match(/shell\.openExternal\(/g) || []).length, 1, 'downloads must not add an external-open path beyond the safe wrapper');
  const registrationSource = `${settingsIpc}\n${downloadsIpc}`;
  for (const channel of ['set-download-settings', 'choose-download-folder', 'get-downloads', 'download-action']) {
    assert.match(registrationSource, new RegExp(`handle\\('${channel}'`));
    assert.match(preload, new RegExp(`invoke\\('${channel}'`));
  }
  assert.match(preload, /onDownloads/);
  for (const id of ['downloadsModal', 'downloadsList', 'downloadsBtn']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  // Downloads settings and row presentation are React-owned; the dialog shell, view model and privileged action handlers remain host-owned.
  assert.match(html, /id="downloadsSettingsReactMount"/);
  const systemSettings = read('src/renderer-react/system-settings-panels.tsx');
  for (const id of ['openDownloadsBtn', 'chooseDownloadFolderBtn', 'downloadFolderLabel', 'resetDownloadFolderBtn', 'openDownloadFolderBtn']) assert.match(systemSettings, new RegExp(`id=\"${id}\"`));
  for (const key of ['askWhereToSave', 'notifyWhenDone']) assert.match(systemSettings, new RegExp(`data-dl={key}`));
  // The app CSP forbids inline style attributes, so the renderer must not generate any.
  assert.doesNotMatch(renderer.match(/function renderDownloads[\s\S]*?\n}\n/)[0].replace(/el\.style\.width[^\n]*/, ''), /style="/);
  assert.match(renderer, /'downloadsModal'\]\.some\(/, 'the dialog must get the full window');
  assert.match(renderer, /closeDownloadsModal\(\); closeCtxMenu\(\)/, 'the downloads dialog closes when the app locks');
});


test('essential workspace management features are wired end-to-end', () => {
  const main = read('src/main.js');
  const aiHubIpc = read('src/main/ai-hub-ipc.ts');
  const preload = read('src/preload.ts');
  const renderer = read('src/renderer.js');
  const html = read('src/renderer.html');
  const managementForms = read('src/renderer-react/ai-hub-management-forms.tsx');
  for (const channel of ['update-account', 'clear-account-cache', 'clear-account-site-data']) {
    assert.ok(aiHubIpc.includes(`handle('${channel}'`));
    assert.ok(preload.includes(`invoke('${channel}'`));
  }
  const workspaceTransferIpc = read('src/main/workspace-transfer-ipc.ts');
  assert.ok(main.includes("handle('verify-provider'"));
  for (const channel of ['backup-config', 'restore-config']) {
    assert.ok(workspaceTransferIpc.includes(`handle('${channel}'`));
    assert.ok(preload.includes(`invoke('${channel}'`));
  }
  assert.match(main, /registerWorkspaceTransferIpcHandlers\(handle,/);
  assert.match(renderer, /Edit account/);
  assert.match(renderer, /Clear cache/);
  assert.match(renderer, /Clear site data/);
  assert.match(renderer, /backupConfig/);
  assert.match(renderer, /restoreConfig/);
  assert.match(renderer, /verifyProvider/);
  assert.match(main, /did-fail-load/);
  assert.match(managementForms, /id="verifyProviderBtn"/);
  assert.match(html, /id="dataDiagnosticsReactMount"/);
  const dataPanels = read('src/renderer-react/system-settings-panels.tsx');
  for (const id of ['backupBtn', 'restoreBtn', 'diagnosticsSummary', 'diagnosticsSessionState', 'diagnosticsProviderStatus']) assert.match(dataPanels, new RegExp(`id=\"${id}\"`));
});


test('high-priority workspace organization features are wired end-to-end', () => {
  const main = read('src/main.js');
  const readModel = read('src/main/ai-hub-read-model.ts');
  const renderer = read('src/renderer.js');
  const html = read('src/renderer.html');
  const managementForms = read('src/renderer-react/ai-hub-management-forms.tsx');
  assert.match(main, /CONFIG_SCHEMA_VERSION = 13/);
  for (const key of ['favorite', 'group', 'tags', 'preferences']) assert.match(readModel, new RegExp(key));
  for (const id of ['orgFavoritesBtn', 'orgGroupFilter']) assert.match(html, new RegExp(`id=\"${id}\"`));
  for (const id of ['accountFavorite', 'accountGroup', 'accountTags', 'accountPageZoom', 'accountOpenStartup', 'accountClearCache', 'accountSignOut', 'accountCamera', 'accountNotifications', 'accountFullscreen', 'providerCategory', 'providerLoginUrl', 'providerHomepageUrl', 'providerDescription', 'providerAuthDomains', 'providerNotes']) assert.match(managementForms, new RegExp(`id=\"${id}\"`));
  assert.doesNotMatch(renderer, /event\.shiftKey && event\.key\.toLowerCase\(\) === 'p'/);
  assert.doesNotMatch(renderer, /openCommandPalette|commandPaletteBtn|commandSearch|commandResults|Ctrl\+Shift\+P/);
  assert.match(renderer, /organizationFilter/);
  assert.match(managementForms, /accountPageZoom/);
  assert.match(managementForms, /providerAuthDomains/);
});


test('remaining roadmap features are wired end-to-end', () => {
  const main = read('src/main.js');
  const preload = read('src/preload.ts');
  const renderer = read('src/renderer.js');
  const html = read('src/renderer.html');
  const workspaceTransferIpc = read('src/main/workspace-transfer-ipc.ts');
  for (const channel of ['export-accounts', 'import-accounts']) {
    assert.match(workspaceTransferIpc, new RegExp(`handle\\('${channel}'`));
    assert.match(preload, new RegExp(`invoke\\('${channel}'`));
  }
  assert.match(main, /registerWorkspaceTransferIpcHandlers\(handle,/);
  assert.match(main, /wipeTemporaryAccounts/);
  assert.match(main, /handle\('check-for-updates'/);
  for (const id of ['notificationsBtn', 'notificationPanel', 'notificationList']) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /id="dataDiagnosticsReactMount"/);
  const systemSettings = read('src/renderer-react/system-settings-panels.tsx');
  for (const id of ['exportAccountsBtn', 'importAccountsBtn', 'releaseFeedUrl']) assert.match(systemSettings, new RegExp(`id="${id}"`));
  assert.match(read('src/renderer-react/global-settings-panels.tsx'), /id="accessTextScale"/);
  assert.match(read('src/renderer-react/ai-hub-management-forms.tsx'), /id="accountTemporary"/);
  assert.match(renderer, /recentAccountIds/);
  assert.match(renderer, /openNotifications/);
  assert.match(renderer, /checkForUpdates/);
  assert.match(renderer, /alwaysShowAccountNames/);
  assert.match(main, /wipeTemporaryAccounts/);
});


test('notification panel anchors below its trigger and stays above the Video Hub browser', () => {
  const main = read('src/main.js');
  const layout = read('src/main/browser-view-layout-runtime.ts');
  const videoHubIpc = read('src/main/video-hub-ipc.ts');
  const preload = read('src/preload.ts');
  const renderer = read('src/renderer.js');
  const styles = read('src/styles.css');
  assert.match(renderer, /function positionNotificationPanel\(\)/);
  assert.match(renderer, /anchor\.getBoundingClientRect\(\)/);
  assert.match(renderer, /panel\.style\.top = `\$\{top \/ scale\}px`/);
  assert.match(renderer, /videoHubNotificationOverlay\(true\)/);
  assert.match(renderer, /videoHubNotificationOverlay\?\.\(false\)/);
  assert.match(preload, /videoHubNotificationOverlay: \(open\) => invoke\('video-hub-notification-overlay'/);
  assert.match(main, /let videoHubNotificationOverlayOpen = false/);
  assert.match(layout, /!state.videoHubSettingsOverlayOpen && !state.videoHubNotificationOverlayOpen/);
  assert.match(videoHubIpc, /handle\('video-hub-notification-overlay'/);
  assert.match(main, /setNotificationOverlay: \(open\) => setVideoHubNotificationOverlayOpen\(open\)/);
  assert.match(styles, /\.floating-panel \{ position: fixed; z-index: 10010;/);
});

test('Model Arena has its own providers and accounts, separate from AI Hub', () => {
  const main = read('src/main.js');
  const renderer = read('src/renderer.js');
  const preload = read('src/preload.ts');
  assert.match(main, /arena-accounts\.json/);
  const store = read('src/main/arena-store-runtime.ts');
  assert.match(store, /function defaultStore\(\)/);
  assert.match(store, /function addAccount\(payloadInput: unknown\)/);
  assert.match(store, /async function deleteAccount\(id/);
  assert.match(main, /handleForWorkspace\('ai-lab',[^\r\n]+\)\('arena-add-account'/);
  assert.match(main, /handleForWorkspace\('ai-lab',[^\r\n]+\)\('arena-get-state'/);
  // Arena sessions are never seeded from AI Hub cookies any more.
  assert.doesNotMatch(main, /seedArenaSessionFromAccount/);
  assert.doesNotMatch(main, /models: config\.accounts\.map\([\s\S]{0,200}arena/i);
  assert.match(preload, /arenaAddAccount/);
  assert.match(renderer, /window\.aiHub\.arenaGetState\(\)/);
  assert.doesNotMatch(renderer, /accounts\.filter\(m => m\?\.provider === 'ai-hub-account'\)[\s\S]{0,80}arenaLeft/);
});

test('Model Arena uses dedicated browser views and persistent sessions per Arena account', () => {
  const main = read('src/main.js');
  const html = read('src/renderer.html');
  const ui = read('src/renderer-react/ai-playground-browser-arenas.tsx');
  assert.match(main, /const arenaContentViews = new Map\(\)/);
  const sessionRuntime = read('src/main/session-lifecycle-runtime.ts');
  assert.match(sessionRuntime, /arena: \(account: SessionPartitionAccount\) => `persist:arena-\$\{account\.id\}`/);
  assert.match(main, /function arenaSessionFor\(account\) \{\s*return sessionLifecycleRuntime\.getArenaSession\(account\);/);
  const browserRuntime = read('src/main/arena-browser-runtime.ts');
  assert.match(main, /function createArenaBrowserView\(record\) \{ return arenaBrowserRuntime\.createBrowserView\(record\); \}/);
  assert.match(main, /function setArenaBrowserModels\(models = \{\}\) \{ return arenaBrowserRuntime\.setBrowserModels\(models\); \}/);
  assert.match(browserRuntime, /function setBrowserModels/);
  assert.match(html, /id="freeAccountArenaReactMount"/);
  assert.match(ui, /id=\{side === 'left' \? 'arenaLeftBrowserSlot' : 'arenaRightBrowserSlot'\}/);
  assert.doesNotMatch(html, /arenaLeftBrowserSlot|arenaRightBrowserSlot/);
});

test('window drag strip stays in the unused top edge and cannot cover app headers', () => {
  const css = read('src/styles.css');
  const match = css.match(/\.window-drag-strip \{([\s\S]*?)\n\}/);
  assert.ok(match, 'window drag strip style exists');
  assert.match(match[1], /height:\s*8px/);
  assert.doesNotMatch(match[1], /height:\s*30px/);
  assert.match(match[1], /-webkit-app-region:\s*drag/);
  const finalStripRule = css.match(/The legacy strip remains as an 8px fallback[\s\S]*?\.window-drag-strip \{([^}]*)\}/);
  assert.ok(finalStripRule, 'the final drag-strip override exists');
  assert.match(finalStripRule[1], /height:\s*8px/, 'the edge strip must not overlap the controls just below it');
});

test('Main home screen shows Mad Station branding with its own mark', () => {
  const html = read('src/renderer.html');
  const css = read('src/home.css');
  assert.match(html, /class="home-topbar"/);
  assert.match(html, /class="home-brand" aria-label="Mad Station"/);
  assert.match(html, /<span class="home-brand-name"><b>Mad<\/b> Station<\/span>/);
  const topbar = html.slice(html.indexOf('<header class="home-topbar"'), html.indexOf('</header>', html.indexOf('<header class="home-topbar"')));
  assert.doesNotMatch(topbar, /assets\/icon\.png/);
  assert.match(css, /\.home-brand-name \{/);
  assert.match(css, /white-space: nowrap/);
  // the UI font stack is a shared design token (design-tokens.css); home uses it
  assert.match(css, /font-family: var\(--ms-font-ui\)/);
  assert.match(read('src/design-tokens.css'), /--ms-font-ui: "Segoe UI Variable Text", "Segoe UI"/);
  assert.match(css, /\.home-bg-word \{/);
});

test('AI Hub launcher entry sets the main-process workspace before switching accounts', () => {
  const renderer = read('src/renderer.js');
  const start = renderer.indexOf("if (appId === 'ai-hub')");
  const section = renderer.slice(start, renderer.indexOf("if (appId === 'clipboard')", start));
  assert.ok(start >= 0);
  assert.match(section, /await window\.aiHub\.setWorkspaceApp\('ai-hub'\)/);
  assert.match(section, /await window\.aiHub\.setControlMode\('app'\)/);
  assert.match(section, /await window\.aiHub\.setWorkspaceApp\('ai-hub'\)/);
  assert.doesNotMatch(section, /window\.aiHub\.switchAccount/);
});

test('Model Arena browsers are shown: the main process is told when AI Lab is open', () => {
  const renderer = read('src/renderer.js');
  const main = read('src/main.js');
  const layout = read('src/main/browser-view-layout-runtime.ts');
  // Regression: opening AI Lab from the launcher never set workspaceApp = ai-lab, so the Arena views stayed hidden.
  assert.match(renderer, /appId === 'ai-lab'\) \{[^}]*setWorkspaceApp\('ai-lab'\)/);
  assert.match(renderer, /async function goToLauncher\(\)[^}]*setWorkspaceApp\('launcher'\)/);
  assert.match(layout, /const arenaActive = !state.locked && state.workspaceApp === 'ai-lab' && state.controlMode === 'launcher'/);
  assert.match(renderer, /await syncArenaBrowsers\(\)/);
});

test('Model Arena sends one question to both browsers by typing it in and pressing Enter', () => {
  const main = read('src/main.js');
  const renderer = read('src/renderer.js');
  const html = read('src/renderer.html');
  const ui = read('src/renderer-react/ai-playground-browser-arenas.tsx');
  const promptRuntime = read('src/main/arena-prompt-runtime.ts');
  assert.match(main, /async function arenaSendPrompt\(rawPrompt\)/);
  assert.match(promptRuntime, /insertText\(prompt\)/);
  assert.match(promptRuntime, /function pressEnter\(wc: ArenaWebContents\)/);
  assert.match(main, /handleForWorkspace\('ai-lab',[^\r\n]+\)\('arena-send-prompt'/);
  assert.match(html, /id="freeAccountArenaReactMount"/);
  assert.match(ui, /id="arenaPrompt"/);
  assert.match(ui, /id="arenaRunBtn"/);
  assert.match(renderer, /window\.aiHub\.arenaSendPrompt\(\{ prompt \}\)/);
  // Answers are read in the browsers themselves, not copied back into the page.
  assert.doesNotMatch(ui, /id="arenaLeftOutput"|id="arenaRightOutput"/);
});

test('Model Arena has an accounts tab, voting, and a leaderboard by model and by account', () => {
  const renderer = read('src/renderer.js');
  const html = read('src/renderer.html');
  assert.match(html, /data-lab-tab="arena-accounts"/);
  assert.match(html, /data-lab-panel="arena-accounts"/);
  assert.match(html, /data-lab-tab="scoreboard">Leaderboard/);
  assert.match(html, /id="leaderboardModels"/);
  assert.match(html, /id="leaderboardAccounts"/);
  assert.match(renderer, /function computeArenaBoard\(votes, side\)/);
  assert.match(renderer, /aiLabData\.arenaVotes/);
  assert.match(renderer, /async function voteArena\(choice\)/);
});

test('Model Arena browsers are zoomed, clipped to the screen, and follow the browser-slot layout', () => {
  const main = read('src/main.js');
  const renderer = read('src/renderer.js');
  const css = read('src/styles.css');
  assert.match(main, /const AI_LAB_BROWSER_ZOOM = 0\.70/);
  assert.match(main, /applyZoom: applyArenaBrowserZoom/);
  assert.match(main, /bindArenaBrowserEvents\(view, \{[\s\S]*applyZoom: applyArenaBrowserZoom/);
  assert.match(renderer, /\$\('aiLabScreen'\)\?\.addEventListener\('scroll', scheduleArenaBrowserLayout/);
  assert.match(renderer, /new ResizeObserver\(\(\) => scheduleArenaBrowserLayout\(\)\)/);
  assert.match(renderer, /Math\.max\(r\.left, clip\.left\)/);
  assert.match(css, /\.arena-browser-slot\{height:clamp\(380px,calc\(100vh - 400px\),1100px\)/);
  assert.match(css, /\.arena-grid\{display:grid;grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/);
});

test('API Model Settings card collapses as one complete card from its top-right control', () => {
  const renderer = read('src/renderer.js');
  const html = read('src/renderer.html');
  const css = read('src/styles.css');
  assert.match(html, /id="apiModelSettingsCard"/);
  assert.match(html, /id="apiModelSettingsCollapseBtn"[^>]*aria-expanded="true"/);
  assert.match(html, /aria-controls="apiModelSettingsContent"/);
  assert.match(html, /id="apiModelSettingsContent"/);
  assert.match(html, /id="apiModelSettingsBody"/);
  assert.match(html, /id="apiModelSaveBtn"[^>]*>Save API model<\/button>/);
  assert.match(renderer, /function toggleApiModelSettings\(\)/);
  assert.match(renderer, /card\.classList\.toggle\('is-collapsed', collapsed\)/);
  assert.match(renderer, /content\.hidden = collapsed/);
  assert.match(renderer, /apiModelSettingsCollapseBtn[^\n]*addEventListener\('click',toggleApiModelSettings\)/);
  assert.match(css, /\.api-model-collapse\{position:absolute;top:9px;right:10px/);
  assert.match(css, /\.api-model-manager\.is-collapsed\{min-height:0;height:42px/);
  assert.match(css, /\.api-model-manager\.is-collapsed \.api-model-settings-content\{display:none\}/);
});

test('Model Arena keeps API models in a separate tab and does not auto-refresh on entry', () => {
  const renderer = read('src/renderer.js');
  const html = read('src/renderer.html');
  assert.match(html, /data-arena-tab="api">API Arena/);
  assert.match(html, /data-arena-panel="api"/);
  assert.match(renderer, /function apiArenaSelection\(\)[\s\S]*?apiArenaUi\.selected/);
  assert.match(renderer, /async function runApiArena\(action = \{\}\)/);
  assert.match(renderer, /madstation:api-arena-action/);
  assert.doesNotMatch(renderer, /await refreshAiLabBrowsers\(false\)/);
});

test('Arena shared instruction and side refresh controls use the requested layout and behavior', () => {
  const html = read('src/renderer.html');
  const ui = read('src/renderer-react/ai-playground-browser-arenas.tsx');
  const css = read('src/styles.css');
  const main = read('src/main.js');
  assert.match(html, /id="freeAccountArenaReactMount"/);
  assert.match(ui, /<span className="field-label">Shared instruction<\/span>[\s\S]*id="arenaPrompt"/);
  assert.doesNotMatch(html, /Ask both chatbots — the question is typed into each browser/);
  assert.match(css, /\[data-arena-panel="free-account"\] \.arena-ask\{[\s\S]*grid-template-columns:minmax\(0,1fr\) 150px/);
  assert.match(css, /\[data-arena-panel="free-account"\] #arenaPrompt\{[\s\S]*height:42px/);
  assert.match(css, /\[data-arena-panel="free-account"\] \.arena-ask \.arena-run\{[\s\S]*height:42px/);
  assert.match(ui, /data-arena-nav=\{`\$\{side\}-\$\{action\}`\}/);
  assert.match(read('src/main/arena-browser-runtime.ts'), /const currentUrl = wc\.getURL\(\);[\s\S]*await wc\.loadURL\(currentUrl\);/);
});

test('Arena result voting uses bottom toasts until a matching battle exists', () => {
  const renderer = read('src/renderer.js');
  assert.match(renderer, /Discover and choose two API models first/);
  assert.match(renderer, /Run an API battle with both models first/);
  assert.match(renderer, /Run a battle with both accounts first/);
  assert.match(renderer, /Run a Local AI battle with both models first/);
  assert.match(renderer, /showToast\(apiArenaUi\.status\)/);
  assert.match(renderer, /showToast\(text\)/);
  const apiVote = renderer.slice(renderer.indexOf('async function voteApiArena(choice)'), renderer.indexOf('async function runApiArena(action = {})'));
  const freeVote = renderer.slice(renderer.indexOf('async function voteArena(choice)'), renderer.indexOf('function computeArenaBoard'));
  assert.doesNotMatch(apiVote, /\$\('apiArenaStatus'\)\.textContent =/);
  assert.doesNotMatch(freeVote, /arenaSetStatus\(text\)/);
});
test('Local AI Arena result controls and shared instruction sizing are wired', () => {
  const renderer = read('src/renderer.js');
  const html = read('src/renderer.html');
  const ui = read('src/renderer-react/ai-playground-browser-arenas.tsx');
  const css = read('src/styles.css');
  assert.match(html, /id="localArenaReactMount"/);
  assert.match(ui, /data-local-vote="tie"/);
  assert.match(ui, /data-local-vote="none"/);
  assert.match(ui, /aria-label="Swap Local AI models"/);
  assert.doesNotMatch(renderer, /function updateLocalArenaVoteButtons\(\)/);
  assert.match(renderer, /localArenaBattle = \{ id: battleId/);
  assert.match(renderer, /function swapLocalArenaSides\(\)/);
  assert.match(renderer, /localArenaBattlePayload\(localArenaBattle\.left\)/);
  assert.match(css, /#localArenaPrompt\{\s*min-height:88px;\s*height:88px;[\s\S]*resize:vertical/);
  assert.match(css, /local-arena-setup \.arena-run\{\s*min-height:88px;\s*height:88px;/);
});

function cssText() { return read('src/styles.css'); }

test('All Model Arena composers share the Free Account wording, button pattern, and Ctrl+Enter send shortcut', () => {
  const html = read('src/renderer.html');
  const renderer = read('src/renderer.js');
  const css = read('src/styles.css');
  const browserArenas = read('src/renderer-react/ai-playground-browser-arenas.tsx');
  assert.match(html, /id="freeAccountArenaReactMount"/);
  assert.match(html, /id="localArenaReactMount"/);
  assert.match(browserArenas, /id="arenaPrompt"[^>]*placeholder="Type one question for both… \(Ctrl\+Enter to send\)"/);
  assert.match(browserArenas, /id="localArenaPrompt"[^>]*placeholder="Type one question for both… \(Ctrl\+Enter to send\)"/);
  assert.match(browserArenas, /id="arenaRunBtn"/);
  assert.match(browserArenas, /id="localArenaRunBtn"/);
  assert.match(browserArenas, /snapshot\.running \? 'Sending…' : 'Ask Both'/);
  assert.match(browserArenas, /snapshot\.running \? 'Running…' : 'Ask Both'/);
  assert.match(browserArenas, /<small>Ctrl \+ Enter<\/small>/);
  const apiArena = read('src/renderer-react/ai-playground-api-arena.tsx');
  assert.match(apiArena, /placeholder="Type one instruction for both API models… \(Ctrl\+Enter to send\)"/);
  assert.match(apiArena, /'Ask Both'\}<[\/]span><small>Ctrl \+ Enter<\/small>/);
  assert.match(renderer, /madstation:local-arena-action/);
  assert.match(browserArenas, /event\.key === 'Enter' && \(event\.ctrlKey \|\| event\.metaKey\)/);
  assert.match(css, /body\[data-workspace-app="ai-lab"\] \.arena-shared-composer,[\s\S]*font-family: inherit;/);
});

test('AI Hub limits retained live browser sessions to four and prunes inactive views', () => {
  const main = read('src/main.js');
  const browserRuntime = read('src/main/account-browser-runtime.ts');
  assert.match(main, /const MAX_LIVE_ACCOUNT_VIEWS = 4/);
  assert.match(main, /function pruneInactiveAccountViews\(preferredId = activeId\) \{ return accountBrowserRuntime\.pruneInactiveViews\(preferredId\); \}/);
  assert.match(browserRuntime, /removeView\(id, \{ preserveRuntime: true, cancelDownloads: false \}\)/);
  assert.match(browserRuntime, /if \(options\.cancelDownloads !== false\) dependencies\.cancelDownloads\(id\)/);
  assert.match(browserRuntime, /afterRegister: \(\) => pruneInactiveViews\(account\.id\)/);
});

test('AI Hub browser views close immediately when leaving the AI Hub workspace', () => {
  const main = read('src/main.js');
  assert.match(main, /function closeAllAccountViews\(\)/);
  assert.match(main, /function setWorkspaceApp\(app\)[\s\S]*if \(next === 'ai-hub' && !locked\)[\s\S]*else \{[\s\S]*closeAllAccountViews\(\)/);
  assert.match(read('src/main/account-browser-runtime.ts'), /for \(const id of \[\.\.\.views\.keys\(\)\]\) removeView\(id, \{ preserveRuntime: true, cancelDownloads: false \}\)/);
});

test('AI Lab temporarily borrowed AI Hub sessions are closed after the request', () => {
  const runtime = read('src/main/account-prompt-runtime.ts');
  assert.match(runtime, /const forgeRequest = options\?\.workspace === 'instruction-forge'/);
  assert.match(runtime, /if \(forgeRequest \? activeWorkspace !== 'instruction-forge' : activeWorkspace !== 'ai-lab'\)/);
  assert.match(runtime, /finally \{[\s\S]*if \(wasWorkspaceScoped\) \{[\s\S]*if \(!forgeRequest\) \{[\s\S]*dependencies\.removeAccountView\(accountId, \{ preserveRuntime: true, cancelDownloads: false \}\)/);
  assert.match(runtime, /if \(forgeRequest\) dependencies\.pushForgeBrowserState\(\)/);
});

test('AI Lab borrowing explicitly opts into a temporary outside-workspace account view', () => {
  const main = read('src/main.js');
  const runtime = read('src/main/account-prompt-runtime.ts');
  assert.match(runtime, /createAccountView\(account, \{ allowOutsideWorkspace: true \}\)/);
  const browserRuntime = read('src/main/account-browser-runtime.ts');
  const activateStart = browserRuntime.indexOf('function activateAccount(id)');
  const activateSection = browserRuntime.slice(activateStart, browserRuntime.indexOf('function closeAllViews', activateStart));
  assert.doesNotMatch(activateSection, /allowOutsideWorkspace/);
});

test('Arena browsers are suspended when AI Lab is not showing the browser-comparison panel', () => {
  const main = read('src/main.js');
  const renderer = read('src/renderer.js');
  const preload = read('src/preload.ts');
  assert.match(main, /function suspendArenaBrowsers\(\)/);
  assert.match(main, /handleForWorkspace\('ai-lab',[^\r\n]+\)\('arena-suspend-browsers', \(\) => suspendArenaBrowsers\(\)\)/);
  assert.match(preload, /arenaSuspendBrowsers: \(\) => invoke\('arena-suspend-browsers'\)/);
  assert.match(renderer, /tab !== 'free-account' .*window\.aiHub\.arenaSuspendBrowsers\(\)/);
  assert.match(renderer, /else window\.aiHub\.arenaSuspendBrowsers\(\)\.catch\(\(\) => \{\}\)/);
});

test('Clipboard has no system capture or polling and only saves explicit pasted clips', () => {
  const renderer = read('src/renderer.js');
  const preload = read('src/preload.ts');
  const main = read('src/main.js');
  const html = read('src/renderer.html');
  const utility = read('src/renderer-react/utility-workspaces.tsx');
  assert.doesNotMatch(renderer, /captureCurrentClipboard|syncClipboardMonitor|clipboardPollTimer|captureSystem|clipboardCaptureStatus|clipboardCaptureLabel/);
  assert.doesNotMatch(preload, /readSystemClipboard|read-system-clipboard/);
  assert.doesNotMatch(main, /handle\('read-system-clipboard'/);
  assert.doesNotMatch(html, /captureClipboardBtn|newClipboardBtn|clipboardCaptureSystem|clipboardCaptureStatus|allowClipboardRead|accountClipboard/);
  assert.match(read('src/main/account-session-security.ts'), /case 'clipboard-read': return false;/);
  assert.match(renderer, /function addClipboardItem\(text, options = \{\}\)/);
  assert.match(utility, /Use Ctrl\+V from anywhere, then save the pasted text as a clip/);
});

test('Clipboard React composer explicitly inserts plain text before Save reads the composer', () => {
  const renderer = read('src/renderer.js');
  const utility = read('src/renderer-react/utility-workspaces.tsx');
  assert.match(utility, /onPaste=\{\(event\) => \{/);
  assert.match(utility, /event\.clipboardData\.getData\('text\/plain'\)/);
  assert.match(utility, /event\.preventDefault\(\)/);
  assert.match(utility, /input\.setSelectionRange\(start \+ text\.length, start \+ text\.length\)/);
  assert.match(renderer, /clipboardPersistQueue = clipboardPersistQueue\.catch\(\(\) => \{\}\)\.then/);
});

test('Clipboard pin and delete controls live in each clip action row, not the card header', () => {
  const renderer = read('src/renderer.js');
  const sourceMarker = "const sourceLabel = 'SAVED';";
  const top = renderer.slice(renderer.indexOf(sourceMarker), renderer.indexOf('<button class="clipboard-snippet"', renderer.indexOf(sourceMarker)));
  const bottom = renderer.slice(renderer.indexOf('<div class="clipboard-item-bottom"'), renderer.indexOf('</article>`;', renderer.indexOf('<div class="clipboard-item-bottom"')));
  assert.doesNotMatch(top, /data-clipboard-pin|data-clipboard-delete/);
  assert.match(bottom, /data-clipboard-pin=/);
  assert.match(bottom, /data-clipboard-delete=/);
  assert.match(bottom, /data-clipboard-edit=/);
});

test('Clipboard items expose individual delete and pin controls, and Clear removes all clips', () => {
  const renderer = read('src/renderer.js');
  const html = read('src/renderer.html');
  const utility = read('src/renderer-react/utility-workspaces.tsx');
  assert.match(renderer, /data-clipboard-pin=/);
  assert.match(renderer, /data-clipboard-delete=/);
  assert.match(renderer, /function toggleClipboardPin\(id\)/);
  assert.match(renderer, /clipboardItems = \[\];/);
  assert.match(utility, /data-clipboard-filter=\{item\.value\}/);
  assert.match(utility, /label=\"Clear all\"|>Clear all<\/button>|Clear all/);
});

test('Clipboard layout keeps cards and actions inside the viewport at narrow widths', () => {
  const css = read('src/styles.css');
  assert.match(css, /\.clipboard-screen,\n\.clipboard-screen \* \{ box-sizing: border-box; \}/);
  assert.match(css, /\.clipboard-screen \{ overflow-x: hidden; \}/);
  assert.match(css, /\.clipboard-item-actions \{ width: min\(100%, 400px\); display: grid; grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/);
  assert.match(css, /@media \(max-width: 520px\) \{/);
  assert.ok(css.includes('.clipboard-item-actions { width: 100%; flex: 0 0 auto; grid-template-columns: repeat(2, minmax(0, 1fr));')); 
});

test('Clipboard section contains Clipboard, Notes, and To-do tabs with local persistence', () => {
  const renderer = read('src/renderer.js');
  const html = read('src/renderer.html');
  const utility = read('src/renderer-react/utility-workspaces.tsx');
  assert.match(utility, /value: 'clipboard', label: 'Clips'/);
  assert.match(utility, /value: 'notes', label: 'Notes'/);
  assert.match(utility, /value: 'todo', label: 'To-do list'/);
  assert.match(utility, /data-utility-tab=\{tab\.value\}/);
  assert.match(html, /id=\"notesTabPanel\"/);
  assert.match(html, /id=\"todoTabPanel\"/);
  assert.match(renderer, /const NOTES_KEY = 'metastation-notes-v1'/);
  assert.match(renderer, /const TODO_KEY = 'metastation-todos-v1'/);
  assert.match(renderer, /function saveNote\(draft = notesComposerDraft\)/);
  assert.match(renderer, /function addTodo\(value = ''\)/);
});

test('RAM monitor mounts immediately and defers the first expensive metrics sample', () => {
  const renderer = read('src/renderer.js');
  assert.match(renderer, /installMemoryMonitors\(\);\n\nfunction syncMemoryMonitor/);
  assert.match(renderer, /requestIdleCallback/);
  assert.match(renderer, /setTimeout\(fn, 0\)/);
  assert.doesNotMatch(renderer, /installMemoryMonitors\(\);\n  if \(!RAM_MONITOR_APPS\.has\(currentApp\)/);
});

test('Shared RAM monitor is installed across Main, AI Hub, Clipboard and AI Lab', () => {
  const main = read('src/main.js');
  const renderer = read('src/renderer.js');
  const html = read('src/renderer.html');
  const preload = read('src/preload.ts');
  assert.match(main, /app\.getAppMetrics\?\.\(\) \|\| \[\]/);
  assert.match(main, /process\.getSystemMemoryInfo\(\)/);
  assert.match(main, /handle\('get-memory-info', \(\) => getMemorySnapshot\(\)\)/);
  assert.match(preload, /getMemoryInfo: \(\) => invoke\('get-memory-info'\)/);
  assert.match(renderer, /function memoryMonitorMarkup\(scope\)/);
  assert.match(renderer, /function installMemoryMonitors\(\)/);
  assert.match(renderer, /function renderMemoryMonitor\(snapshot\)/);
  assert.match(renderer, /function clipboardRetainedBytes\(\)/);
  assert.match(renderer, /setInterval\(refreshMemoryMonitor, 2500\)/);
  assert.match(html, /id="aiLabRamMonitorMount"/);
  assert.match(html, /id="aiHubRamMonitorMount"/);
  assert.match(html, /id="clipboardRamMonitorMount"/);
  assert.match(html, /id="homeWidgets"/);
  assert.match(read('src/home-widget-list.js'), /mount\.id = 'launcherRamMonitorMount'/);
});

test('AI Hub RAM monitor has the full live process details view', () => {
  const main = read('src/main.js');
  const renderer = read('src/renderer.js');
  const html = read('src/renderer.html');
  const css = read('src/styles.css');
  const diagnosticsRuntime = read('src/main/memory-diagnostics-runtime.ts');
  const memoryReact = read('src/renderer-react/memory-process-table.tsx');
  const vite = read('vite.config.ts');
  assert.match(diagnosticsRuntime, /const processes = values\.slice\(\)\.sort\(\(a, b\) => b\.workingSetKb - a\.workingSetKb\)\.map\(mapProcess\);/);
  assert.match(diagnosticsRuntime, /top,\n      processes,/);
  assert.match(diagnosticsRuntime, /Video Capture Service/);
  assert.match(renderer, /function openMemoryProcessesModal\(\)/);
  assert.match(renderer, /function renderMemoryProcessTable\(snapshot = latestMemorySnapshot\)/);
  assert.match(renderer, /data-memory-details/);
  assert.match(renderer, /memoryProcessesModalOpen/);
  assert.match(html, /id=\"memoryProcessesModal\"/);
  assert.match(html, /id=\"memoryProcessesBody\"/);
  assert.match(vite, /memory-process-table-react/);
  assert.match(html, /memory-process-table-react\.js/);
  assert.match(memoryReact, /createRoot\(bodyHost\)/);
  assert.doesNotMatch(memoryReact, /dangerouslySetInnerHTML|\.innerHTML/);
  assert.match(html, /id=\"refreshMemoryProcessesBtn\"/);
  assert.match(css, /\.memory-process-table-wrap/);
  assert.match(css, /\.memory-process-summary/);
});

test('Shared RAM monitor stays compact and reserves an AI Hub sidebar slot', () => {
  const renderer = read('src/renderer.js');
  const html = read('src/renderer.html');
  const css = read('src/styles.css');
  assert.match(renderer, /data-memory-refresh/);
  assert.match(renderer, /liveAiHubSessions/);
  assert.match(html, /class="resource-monitor-mount resource-monitor-mount--sidebar" id="aiHubRamMonitorMount"/);
  assert.match(html, /class="brand-copy brand-copy-aihub-monitor"[\s\S]*id="aiHubRamMonitorMount"/);
  assert.match(css, /\.resource-monitor \{/);
  assert.match(css, /\.resource-monitor--sidebar/);
  assert.match(css, /\.resource-monitor-stats/);
});

test('RAM process summary names the top figure as an app working-set sum', () => {
  const renderer = read('src/renderer.js');
  const html = read('src/renderer.html');
  assert.match(renderer, /label: 'App working set', value: formatRamKb\(snapshot\?\.totalKb\)/);
  assert.match(read('src/renderer-react/memory-process-table.tsx'), /model\.summary\.map\(\(item\) =>/);
  assert.match(html, /Working set is the physical memory currently assigned to each process/);
});


test('remaining diagnostic and memory-safety features are wired through trusted IPC', () => {
  const main = read('src/main.js');
  const preload = read('src/preload.ts');
  const renderer = read('src/renderer.js');
  const html = read('src/renderer.html');
  assert.match(main, /registerDiagnosticsIpcHandlers\(handle, diagnosticsController\)/);
  assert.doesNotMatch(main, /handle\('get-diagnostics'/);
  assert.doesNotMatch(main, /handle\('check-provider-compatibility'/);
  assert.doesNotMatch(main, /handle\('export-diagnostics'/);
  assert.match(main, /handle\('reclaim-memory'/);
  const diagnosticsRuntime = read('src/main/memory-diagnostics-runtime.ts');
  assert.match(diagnosticsRuntime, /includesClipboardContents: false/);
  assert.match(diagnosticsRuntime, /includesApiKeys: false/);
  assert.match(main, /function collectSessionDiagnostics\(/);
  assert.match(preload, /getDiagnostics: \(\) => invoke\('get-diagnostics'\)/);
  assert.match(preload, /exportDiagnostics: \(\) => invoke\('export-diagnostics'\)/);
  assert.match(preload, /reclaimMemory: \(\) => invoke\('reclaim-memory'\)/);
  assert.match(renderer, /data-memory-cleanup/);
  assert.match(renderer, /Memory cleanup complete/);
  assert.match(html, /id="dataDiagnosticsReactMount"/);
  const dataPanels = read('src/renderer-react/system-settings-panels.tsx');
  assert.match(dataPanels, /id="exportDiagnosticsBtn"/);
  assert.match(dataPanels, /id="checkProviderCompatibilityBtn"/);
  assert.match(dataPanels, /id="diagnosticsSessionState"/);
});

test('diagnostic export never includes secret or clipboard payloads', () => {
  const main = read('src/main.js');
  const section = read('src/main/memory-diagnostics-runtime.ts');
  assert.match(section, /includesClipboardContents: false/);
  assert.match(section, /includesApiKeys: false/);
  assert.match(section, /includesCookies: false/);
  assert.match(section, /includesBrowserStorage: false/);
  assert.doesNotMatch(section, /clipboardItems|apiKey|cookies/);
});

test('memory cleanup releases icon cache RAM without deleting the on-disk cache', () => {
  const icon = read('src/main/icon-cache.ts');
  const main = read('src/main.js');
  assert.match(icon, /releaseMemory\(\)/);
  assert.match(icon, /this\.entries\.clear\(\)/);
  assert.match(icon, /this\.ready = false/);
  const start = main.indexOf('async function reclaimUnusedMemory');
  const section = main.slice(start, main.indexOf('const diagnosticsController', start));
  assert.match(section, /removeAccountView\(id, \{ preserveRuntime: true, cancelDownloads: false \}/);
  assert.match(section, /iconRuntime\.releaseRemoteCacheMemory/);
  assert.match(section, /iconRuntime\.clearLocalIconCache/);
  assert.doesNotMatch(section, /clearStorageData|clearAccountEverything/);
});

test('session diagnostics distinguish saved accounts from live browser views', () => {
  const main = read('src/main.js');
  const renderer = read('src/renderer.js');
  const diagnosticsRuntime = read('src/main/memory-diagnostics-runtime.ts');
  assert.match(diagnosticsRuntime, /savedAiHubAccounts: config\.accounts\.length/);
  assert.match(diagnosticsRuntime, /liveAiHubViews: dependencies\.views\.aiHub\.size/);
  assert.match(diagnosticsRuntime, /expectedAiHubViews:/);
  assert.match(renderer, /savedAiHubAccounts/);
  assert.match(renderer, /Hub \$\{snapshot\?\.liveAiHubSessions/);
});

test('AI Hub monitor exposes compact cleanup and full diagnostics actions', () => {
  const renderer = read('src/renderer.js');
  const html = read('src/renderer.html');
  assert.match(renderer, /data-memory-cleanup/);
  assert.match(renderer, /reclaimMemoryFromUi/);
  assert.match(html, /id="aiHubRamMonitorMount"/);
  const systemSettings = read('src/renderer-react/system-settings-panels.tsx');
  assert.match(systemSettings, /id="exportDiagnosticsBtn"/);
  assert.match(systemSettings, /id="checkProviderCompatibilityBtn"/);
});

test('AI Hub preserves imperative icon nodes while migrated Arena views retain keyed icon ownership', () => {
  const renderer = read('src/renderer.js');
  assert.match(renderer, /function captureIconNodes\(root, keyFromImage\)/);
  assert.match(renderer, /function restoreIconNodes\(root, previous, keyFromImage\)/);
  assert.match(renderer, /const previousTileIcons = captureIconNodes\(tiles,/);
  assert.match(renderer, /restoreIconNodes\(tiles, previousTileIcons,/);
  const aiHubAccounts = read('src/renderer-react/account-list.tsx');
  assert.match(aiHubAccounts, /key=\{account\.id\}/);
  assert.match(aiHubAccounts, /function AccountIcon\(/);
  assert.match(renderer, /const previousRecentIcons = captureIconNodes\(recentBox,/);
  assert.match(renderer, /restoreIconNodes\(recentBox, previousRecentIcons,/);
  assert.match(renderer, /iconCachedUrl/);
  const arena = read('src/renderer-react/ai-playground-arena-management.tsx');
  assert.match(arena, /key=\{provider\.id\}/);
  assert.match(arena, /key=\{account\.id\}/);
  assert.match(arena, /data-icon-candidates=\{encodeURIComponent\(JSON\.stringify\(candidates\)\)\}/);
  assert.match(arena, /bridge\.bindIconFallbacks\(host\)/);
  const arenaHost = renderer.slice(renderer.indexOf('function renderArenaAccounts()'), renderer.indexOf('async function arenaAccountAction'));
  assert.doesNotMatch(arenaHost, /captureIconNodes|restoreIconNodes|\.innerHTML\s*=/);
  const browserArenas = read('src/renderer-react/ai-playground-browser-arenas.tsx');
  assert.match(renderer, /function freeArenaViewModel\(\)[\s\S]*?const iconSrc = candidates\.find\(isImageIcon\)[\s\S]*?selected:/);
  assert.match(browserArenas, /account\?\.iconSrc \? <img className="provider-icon-img" src=\{account\.iconSrc\}/);
});

test('Instruction Forge has the human-brief, AI-native instruction, and account-browser workspace', () => {
  const html = read('src/renderer.html');
  const renderer = read('src/renderer.js');
  assert.match(html, /id="instructionScreen"/);
  const forge = html.slice(html.indexOf('id="instructionScreen"'), html.indexOf('id="aiLabScreen"'));
  assert.doesNotMatch(forge, /01 · HUMAN BRIEF/);
  assert.doesNotMatch(forge, /02 · AI-NATIVE INSTRUCTION/);
  assert.doesNotMatch(forge, /03 · ACCOUNT BROWSER/);
  assert.match(forge, /<h2>Explain what you actually mean<\/h2>/);
  assert.match(forge, /<h2>Make the instruction precise<\/h2>/);
  assert.match(forge, /<h2>Each AI account keeps its own browser session<\/h2>/);
  assert.match(html, /id="forgeAccountList"/);
  assert.match(html, /id="forgeBrowserSlot"/);
  assert.doesNotMatch(html, /standalone-forge-grid/);
  assert.match(renderer, /function initInstructionForge\(\)/);
  assert.match(renderer, /Treat names, versions, APIs, commands, and technical terms supplied by the user as hypotheses/);
  assert.match(renderer, /instructionForgeAccountRequest/);
});

test('Instruction Forge account browser fills the remaining page and stays vertically resizable', () => {
  const styles = read('src/styles.css');
  assert.match(styles, /\.forge-app-inner\{max-width:1600px;padding:20px 28px 28px;min-height:100%;height:100%;box-sizing:border-box;display:flex;flex-direction:column;/);
  assert.match(styles, /body\[data-workspace-app=\"instruction-forge\"\] \.instruction-screen\{overflow:hidden;height:100%;min-height:0;\}/);
  assert.match(styles, /\.forge-browser-card\{width:100%;max-width:none;margin:14px 0 0;padding:13px;display:flex;flex:1 1 0;flex-direction:column;min-height:0/);
  assert.match(styles, /\.forge-browser-layout\{display:grid;grid-template-columns:minmax\(220px,230px\) minmax\(0,1fr\);gap:10px;align-items:stretch;min-height:0;flex:1 1 0;\}/);
  assert.match(styles, /\.forge-browser-pane\{display:flex;flex:1 1 auto;flex-direction:column;min-width:0;min-height:0;/);
  assert.match(styles, /\.forge-browser-slot\{position:relative;height:auto;flex:1 1 auto;min-height:480px;max-height:none;resize:vertical/);
  assert.match(styles, /\.forge-browser-slot::after\{content:"↕  drag to resize"/);
  assert.match(styles, /\.forge-account-tab\{width:100%;min-width:0;display:grid;/);
});

test('Instruction Forge owns per-account browser views and closes them when the workspace is left', () => {
  const main = read('src/main.js');
  const layout = read('src/main/browser-view-layout-runtime.ts');
  const preload = read('src/preload.ts');
  assert.match(main, /const forgeContentViews = new Map\(\);/);
  assert.match(main, /const MAX_LIVE_FORGE_BROWSER_VIEWS = 4;/);
  assert.match(main, /sessionFor\(account\)/);
  assert.match(main, /function closeAllForgeBrowserViews/);
  assert.match(main, /if \(next !== 'instruction-forge'\) closeAllForgeBrowserViews/);
  assert.match(main, /else if \(next === 'instruction-forge' && !locked\) \{[\s\S]*closeAllAccountViews\(\);/);
  assert.match(layout, /toolbarView\.setVisible\(!fullScreenUi && state.workspaceApp !== 'instruction-forge'\)/);
  assert.match(main, /handleForWorkspace\('instruction-forge',[^\r\n]+\)\('forge-set-browser'/);
  assert.match(main, /handleForWorkspace\('instruction-forge',[^\r\n]+\)\('forge-set-layout'/);
  assert.match(main, /handleForWorkspace\('instruction-forge',[^\r\n]+\)\('forge-navigate'/);
  assert.match(preload, /forgeSetBrowser: \(id\) => invoke\('forge-set-browser', id\)/);
  assert.match(preload, /instructionForgeAccountRequest: \(payload\) => invoke\('instruction-forge-account-request', payload\)/);
});

test('Forge browsers are included in RAM accounting and diagnostics', () => {
  const main = read('src/main.js');
  const renderer = read('src/renderer.js');
  const toolbarUi = read('src/toolbar-react/main.tsx');
  const layout = read('src/main/browser-view-layout-runtime.ts');
  const styles = read('src/styles.css');
  const diagnosticsRuntime = read('src/main/memory-diagnostics-runtime.ts');
  assert.match(diagnosticsRuntime, /addLabels\(dependencies\.views\.forge, 'forge'\)/);
  assert.match(diagnosticsRuntime, /const forgeKb = sumWorkspace\('forge'\)/);
  assert.match(diagnosticsRuntime, /liveForgeSessions: dependencies\.views\.forge\.size/);
  assert.match(diagnosticsRuntime, /expectedForgeViews: workspaceApp === 'instruction-forge'/);
  assert.match(renderer, /const RAM_MONITOR_APPS = new Set\(\['launcher', 'ai-hub', 'clipboard', 'ai-lab', 'instruction-forge', 'video-hub', 'image-hub'\]\)/);
  assert.match(renderer, /\['forgeRamMonitorMount', 'forge'\]/);
  assert.match(toolbarUi, /tbWindowMinimizeBtn/);
  assert.match(toolbarUi, /tbWindowMaximizeBtn/);
  assert.match(toolbarUi, /tbWindowCloseBtn/);
  assert.match(read('src/toolbar-preload.ts'), /windowMinimize: \(\) => invoke<ApiResult>\('window-minimize'\)/);
  assert.match(layout, /toolbarView\.setBounds\(\{ x: sidebarWidth, y: 0, width: Math\.max\(1, width - sidebarWidth\), height: state\.toolbarHeight \}\)/);
  assert.match(styles, /body\[data-workspace-app=\"ai-hub\"\] > \.window-controls \{ display: none; \}/);
  assert.doesNotMatch(renderer, /Instruction Tool/);
  assert.doesNotMatch(renderer, /Say it like a human\. Forge corrects/);
  assert.match(read('src/renderer.html'), /resource-monitor-mount--forge/);
  assert.match(styles, /resource-monitor-mount--forge \.resource-monitor--compact-page/);

});

test('AI Hub header replaces the title/account count with its compact RAM monitor', () => {
  const html = read('src/renderer.html');
  const brand = html.slice(html.indexOf('<div class="brand">'), html.indexOf('</div>\n<div class="search-wrap">'));
  assert.match(brand, /brand-copy-aihub-monitor/);
  assert.match(brand, /id="aiHubRamMonitorMount"/);
  assert.doesNotMatch(brand, /class="brand-title">AI Hub<\//);
  assert.doesNotMatch(brand, /14 accounts/);
});

test('AI Hub compact header monitor is scoped to AI Hub and does not alter other page monitor rules', () => {
  const styles = read('src/styles.css');
  assert.match(styles, /\.brand-copy-aihub-monitor \.resource-monitor--compact-page/);
  assert.match(styles, /\.brand-copy-aihub-monitor \.compact-ram-ring/);
});

test('AI Hub toolbar window controls remain wired to working main-process window actions', () => {
  const toolbar = read('src/toolbar-react/main.tsx');
  const preload = read('src/toolbar-preload.ts');
  const main = read('src/main.js');
  for (const id of ['tbWindowMinimizeBtn', 'tbWindowMaximizeBtn', 'tbWindowCloseBtn']) assert.match(toolbar, new RegExp(id));
  assert.match(toolbar, /windowMinimize\(\)/);
  assert.match(toolbar, /windowToggleMaximize\(\)/);
  assert.match(toolbar, /windowClose\(\)/);
  assert.match(preload, /windowMinimize: \(\) => invoke<ApiResult>\('window-minimize'\)/);
  assert.match(preload, /windowToggleMaximize: \(\) => invoke<ApiResult>\('window-toggle-maximize'\)/);
  assert.match(preload, /windowClose: \(\) => invoke<ApiResult>\('window-close'\)/);
  assert.match(main, /handle\('window-minimize', \(\) => \{[\s\S]*mainWindow\.minimize\(\)/);
  assert.match(main, /handle\('window-toggle-maximize', \(\) => \{[\s\S]*mainWindow\.isMaximized\(\)/);
  assert.match(main, /handle\('window-close', \(\) => \{[\s\S]*mainWindow\.close\(\)/);
  assert.match(read('src/styles.css'), /\.tb-window-controls \{ pointer-events: auto !important;[\s\S]*?app-region: no-drag !important;/);
});

test('Instruction Forge browser navigation controls use a reliable pointer path and trusted navigation IPC', () => {
  const renderer = read('src/renderer.js');
  const main = read('src/main.js');
  const styles = read('src/styles.css');
  assert.match(renderer, /const handleForgeNavigation = async \(event\) =>/);
  assert.match(renderer, /button\.addEventListener\('pointerdown', handleForgeNavigation\)/);
  assert.match(renderer, /window\.aiHub\.forgeNavigate\(button\.dataset\.forgeNav\)/);
  const forgeRuntime = read('src/main/forge-browser-runtime.ts');
  assert.match(forgeRuntime, /action === 'back'[\s\S]*dependencies\.canGoBack\(view\)[\s\S]*dependencies\.goBack\(view\)/);
  assert.match(forgeRuntime, /action === 'forward'[\s\S]*dependencies\.canGoForward\(view\)[\s\S]*dependencies\.goForward\(view\)/);
  assert.match(forgeRuntime, /view\.webContents\.reload\(\)/);
  assert.match(styles, /body\[data-workspace-app=\"instruction-forge\"\] \.forge-browser-nav-btn\{position:relative;z-index:7;pointer-events:auto;/);
});

test('Instruction Forge browser viewport uses the measured slot directly', () => {
  const layout = read('src/main/browser-view-layout-runtime.ts');
  const start = layout.indexOf('if (forgeActive && id === state.forgeBrowserAccountId && rect)');
  const section = layout.slice(start, start + 550);
  assert.ok(start >= 0, 'Forge layout is owned by the extracted layout runtime');
  assert.match(section, /view\.setBounds\(roundedRect\(rect\)\)/);
  assert.doesNotMatch(section, /sidebarWidth \+ rect\.x|state\.toolbarHeight \+ rect\.y/);
  assert.match(section, /Forge rectangles are measured against the full workspace surface/);
});


test('Instruction Forge keeps keyed account icons stable and refreshes status through its React boundary', () => {
  const source = read('src/renderer.js');
  const ui = read('src/renderer-react/instruction-forge-accounts.tsx');
  assert.match(ui, /key=\{account\.id\}/);
  assert.match(ui, /data-icon-candidates=\{encodeURIComponent\(JSON\.stringify\(candidates\)\)\}/);
  assert.match(ui, /bridge\.bindIconFallbacks\(host\)/);
  assert.match(source, /window\.MadStationInstructionForgeAccounts = \{/);
  assert.match(source, /forgeReactAccountsRenderer\(\{/);
  assert.match(source, /forgeReactStatusRenderer\(statusModel\)/);
  const forgeAccounts = source.slice(source.indexOf('function renderForgeAccounts()'), source.indexOf('function updateForgeBrowserUi('));
  assert.doesNotMatch(forgeAccounts, /captureIconNodes|restoreIconNodes|\.innerHTML\s*=/);
});

test('Instruction Forge keeps account picture selection separate from the browser pane', () => {
  const html = read('src/renderer.html');
  const styles = read('src/styles.css');
  assert.match(html, /forge-browser-layout/);
  assert.match(html, /forge-account-panel/);
  assert.match(html, /forge-browser-pane/);
  assert.match(html, /id="forgeAccountList"/);
  assert.match(html, /id="forgeBrowserSlot"/);
  assert.match(styles, /\.forge-browser-layout\{display:grid;grid-template-columns:minmax\(220px,230px\) minmax\(0,1fr\)/);
  assert.match(styles, /\.forge-browser-pane\{display:flex;flex:1 1 auto;flex-direction:column/);
  assert.match(styles, /\.forge-account-tab-icon\{display:grid;place-items:center;width:34px;height:34px/);
});

test('AI Hub toolbar window controls are authorized by the main-process IPC trust gate', () => {
  const main = read('src/main.js');
  for (const channel of ['window-minimize', 'window-toggle-maximize', 'window-close']) {
    const start = main.indexOf(`handle('${channel}'`);
    assert.ok(start >= 0, `${channel} handler is present`);
    const end = main.indexOf("handle('", start + 8);
    const handler = main.slice(start, end < 0 ? start + 500 : end);
    assert.match(handler, /\{ toolbar: true \}/, `${channel} must permit the AI Hub toolbar sender`);
  }
});



test('Clipboard header is compact and metrics move into a left rail', () => {
  const html = read('src/renderer.html');
  const css = read('src/styles.css');
  const headerStart = html.indexOf('<header class="clipboard-header">');
  const headerEnd = html.indexOf('</header>', headerStart);
  const header = html.slice(headerStart, headerEnd);
  assert.match(header, /id="clipboardBackBtn"/);
  assert.match(header, /class="clipboard-title"[^>]*aria-label="Notes &amp; Tasks"/);
  assert.match(header, /id="clipboardRamMonitorMount"/);
  assert.doesNotMatch(header, /<h1 id="clipboardAppTitle">Clipboard<\/h1>/);
  assert.doesNotMatch(header, /Save reusable text locally/);
  const panel = html.slice(html.indexOf('id="clipboardTabPanel"'), html.indexOf('</section>\n\n<section class="utility-panel" id="notesTabPanel"'));
  assert.match(read('src/renderer-react/utility-workspaces.tsx'), /id="clipboardPinnedLinksCount"/);
  assert.doesNotMatch(panel, /id="clipboardPinnedCount"/);
  assert.doesNotMatch(panel, /id="clipboardLinkCount"/);
  assert.match(css, /grid-template-columns: 150px minmax\(280px, \.78fr\) minmax\(0, 1\.22fr\)/);
  assert.match(css, /\.clipboard-screen \.clipboard-stats \{[\s\S]*flex-direction: column/);
});

test('AI Lab header is compact with app picker, AI Lab icon, and processor monitor only', () => {
  const html = read('src/renderer.html');
  const styles = read('src/styles.css');
  const start = html.indexOf('<header class="ailab-header">');
  const end = html.indexOf('</header>', start);
  assert.ok(start >= 0 && end > start, 'AI Lab header exists');
  const header = html.slice(start, end);
  assert.match(header, /id="aiLabBackBtn"/);
  assert.match(header, /class="ailab-header-icon app-icon app-icon-playground"/);
  assert.match(header, /id="aiLabRamMonitorMount"/);
  assert.doesNotMatch(header, /Compare, refine, and run AI/);
  assert.doesNotMatch(header, /Battle your AI accounts side by side/);
  assert.doesNotMatch(header, /class="ailab-brand"/);
  assert.match(styles, /body\[data-workspace-app="ai-lab"\] \.ailab-header-icon/);
  assert.match(styles, /body\[data-workspace-app="ai-lab"\] \.ailab-header-actions/);
});


test('main home screen keeps the settings button and Mad Station branding', () => {
  const html = read('src/renderer.html');
  const js = read('src/renderer.js');
  const css = read('src/home.css');
  const start = html.indexOf('<header class="home-topbar"');
  const end = html.indexOf('</header>', start);
  assert.ok(start >= 0 && end > start, 'home topbar exists');
  const header = html.slice(start, end);
  assert.doesNotMatch(header, /id="launcherAppPickerBtn"/);
  assert.match(html, /id="launcherSettingsBtn"/);
  assert.match(header, /<b>Mad<\/b> Station/);
  assert.doesNotMatch(header, /<img[^>]+assets\/icon\.png/);
  assert.match(js, /launcherSettingsBtn.*openSettings\('appearance', 'global'\)/);
  assert.match(css, /\.home-topbar \{/);
  assert.match(css, /\.home-settings \{/);
  // The settings button is an icon-only gear docked bottom-left of the home screen.
  assert.doesNotMatch(css, /\.home-settings::after/);
  assert.match(css, /\.home-settings \{[^}]*position: fixed; left:/);
});

test('Instruction Forge, AI Lab, and Clipboard Back arrows are explicitly white', () => {
  const css = fs.readFileSync(path.join(src, 'styles.css'), 'utf8');
  assert.match(css, /#instructionBackBtn[\s\S]*#aiLabBackBtn[\s\S]*#clipboardBackBtn/);
  assert.match(css, /#instructionBackBtn svg[\s\S]*stroke:\s*#fff\s*!important/);
  assert.match(css, /#aiLabBackBtn svg[\s\S]*stroke:\s*#fff\s*!important/);
  assert.match(css, /#clipboardBackBtn svg[\s\S]*stroke:\s*#fff\s*!important/);
});



test('Instruction Forge and AI Lab expose app-specific settings with persistent controls', () => {
  const html = read('src/renderer.html');
  const js = read('src/renderer.js');
  assert.match(html, /id="instructionSettingsBtn"[^>]*aria-label="Prompt Studio settings"/);
  assert.match(html, /id="aiLabSettingsBtn"[^>]*aria-label="AI Playground settings"/);
  assert.match(html, /id="instructionSettingsModal"/);
  assert.match(html, /id="aiLabSettingsModal"/);
  assert.match(html, /id="forgeDefaultModel"/);
  assert.match(html, /id="forgeClearOutput"/);
  assert.match(html, /id="aiLabDefaultTab"/);
  assert.match(html, /id="aiLabDefaultArena"/);
  assert.match(html, /id="aiLabAutoScanLocal"/);
  assert.match(js, /FORGE_SETTINGS_KEY = 'mad-station-instruction-forge-settings-v1'/);
  assert.match(js, /async function saveAiLabSettings\(draft = null\)/);
  assert.match(js, /function handleAiLabSettingsAction\(event\)[\s\S]*?AI_LAB_ALLOWED_TABS\.has\(action\.defaultTab\)[\s\S]*?AI_LAB_ALLOWED_ARENAS\.has\(action\.defaultArena\)[\s\S]*?void saveAiLabSettings/);
  assert.match(js, /aiLabData\.settings\s*=\s*\{\s*\.\.\.AI_LAB_DEFAULTS\.settings/);
});

test('app-specific settings gears are icon-only, grouped with the RAM monitor, and block native browsers while open', () => {
  const html = read('src/renderer.html');
  const js = read('src/renderer.js');
  const css = read('src/styles.css');

  for (const id of ['instructionSettingsBtn', 'aiLabSettingsBtn']) {
    const button = html.match(new RegExp(`<button[^>]*\\bid="${id}"[^>]*>[\\s\\S]*?</button>`));
    assert.ok(button, `${id} should exist`);
    assert.ok(/class="[^"]*icon-only/.test(button[0]), `${id} should be icon-only`);
    assert.equal(button[0].includes('<span>Settings</span>'), false, `${id} should not render a Settings label`);
  }
  const utility = read('src/renderer-react/utility-workspaces.tsx');
  assert.match(utility, /id: 'clipboardSettingsBtn'/);
  assert.match(utility, /className="icon-only clipboard-settings-btn standalone-settings-btn" id=\{setting\.id\}/);
  assert.match(utility, /aria-label=\{setting\.label\}/);

  assert.match(html, /class="forge-header-actions"/);
  assert.match(html, /forgeRamMonitorMount[\s\S]*instructionSettingsBtn/);
  assert.match(css, /\.forge-header-actions[\s\S]*margin-right: 116px/);
  assert.match(css, /\.ailab-header-actions[\s\S]*margin-right: 116px/);
  assert.match(css, /\.clipboard-header-actions[\s\S]*gap: 9px/);
  assert.match(css, /\.standalone-settings-btn[\s\S]*stroke: #fff !important/);

  assert.match(js, /const dialogOpen = \['accountModal', 'providerModal', 'passwordModal', 'renameModal', 'downloadsModal'\]\.some\(/);
  assert.match(js, /\['clipboardSettingsModal', 'instructionSettingsModal', 'aiLabSettingsModal', 'imageHubSettingsOverlay'\]\.some\(/);
  assert.match(js, /clipboardSettingsModal', 'instructionSettingsModal', 'aiLabSettingsModal', 'imageHubSettingsOverlay'\]\.forEach/);
  assert.match(js, /openInstructionSettings\(\)[\s\S]*syncOverlayMode\(\)/);
  assert.match(js, /openAiLabSettings\(\)[\s\S]*syncOverlayMode\(\)/);
  assert.match(js, /openClipboardSettings\(\)[\s\S]*syncOverlayMode\(\)/);
});
test('all standalone app navigation buttons use the Settings-style Back control', () => {
  const html = read('src/renderer.html');
  const ids = ['openLauncherBtn', 'instructionBackBtn', 'aiLabBackBtn', 'clipboardBackBtn'];
  for (const id of ids) {
    const button = html.match(new RegExp(`<button[^>]*\\bid="${id}"[^>]*>[\\s\\S]*?</button>`));
    assert.ok(button, `${id} should exist`);
    assert.ok(/class="[^"]*back-settings/.test(button[0]));
    assert.match(button[0], /title="Back"/);
    assert.match(button[0], /aria-label="Back"/);
    assert.ok(button[0].includes('<path d="M15 5l-7 7 7 7"></path>'));
  }
});


test('unified in-app header utility rail matches the requested order', () => {
  const html = read('src/renderer.html');
  const css = read('src/styles.css');
  assert.match(html, /id="instructionNotificationsBtn"/);
  assert.match(html, /id="aiLabNotificationsBtn"/);
  assert.match(html, /id="clipboardNotificationsBtn"/);
  assert.match(html, /id="settingsBtn"[\s\S]*?id="notificationsBtn"[\s\S]*?id="hideSidebarBtn"/);
  assert.match(css, /body\[data-workspace-app="instruction-forge"\] \.forge-header-actions[\s\S]*?margin-left: 0/);
  assert.match(css, /body\[data-workspace-app="ai-hub"\] \.sidebar > \.brand > #hideSidebarBtn[\s\S]*?margin-left: auto/);
  assert.doesNotMatch(css, /body\[data-workspace-app="launcher"\] .*standalone-notification-btn/);
});


test('Instruction Forge header monitor and controls match the shared app sizing', () => {
  const css = read('src/styles.css');
  assert.match(css, /body\[data-workspace-app="instruction-forge"\] \.resource-monitor-mount--forge \.resource-monitor--compact-page\{\n  width:82px;\n  height:48px;/);
  assert.match(css, /body\[data-workspace-app="instruction-forge"\] \.forge-app-header \.standalone-settings-btn,[\s\S]*?width:36px;[\s\S]*?height:36px;/);
});


test('appearance settings propagate to toolbar and secondary app controls', () => {
  const main = read('src/main.js');
  const css = read('src/styles.css');
  for (const key of ['surfaceStyle','backgroundStyle','cornerStyle','buttonCorner','buttonBackground','borderStyle','shadowStyle','cardSpacing','borderSpacing','animateHover','reduceMotion','showStatusBar']) {
    assert.match(main, new RegExp(`${key}: config\\?\\.settings\\?\\.${key}`));
  }
  assert.match(css, /body\[data-button-background="solid"\] \.icon-only/);
  assert.match(css, /body\[data-button-background="outline"\][\s\S]*?\.tb-btn/);
  assert.match(css, /body\[data-button-background="neon"\][\s\S]*?\.ai-hub-launcher-core/);
  assert.match(css, /body\[data-button-corner="pill"\][\s\S]*?\.forge-run-btn/);
  assert.match(css, /body\[data-corner-style="square"\] \.arena-side/);
  assert.match(css, /body\[data-card-spacing="spacious"\] \.clipboard-workspace/);
  assert.match(css, /body\[data-background-style="constellation"\] \.toolbar-body/);
  assert.match(css, /body\[data-surface-style="frosted"\] \.toolbar-body/);
  assert.match(css, /body\[data-shadow-style="glass"\] \.toolbar/);
  assert.match(css, /\.ai-hub-launcher-core \{ border-radius: 50%; \}/);
});


test('managed downloads share progress state and finalize downloaded application assets', async () => {
  const { createDownloadManager } = require(path.join(root, 'build', 'main', 'downloads.js'));
  const rootDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'mad-managed-'));
  const destination = path.join(rootDir, 'asset.bin');
  const payload = Buffer.from('managed-download-test');
  const events = [];
  let manager;
  const httpsImpl = {
    get(_url, _options, callback) {
      const request = new EventEmitter();
      request.setTimeout = () => request;
      request.destroy = (error) => process.nextTick(() => request.emit('error', error || new Error('destroyed')));
      process.nextTick(() => {
        const response = new EventEmitter();
        response.statusCode = 200;
        response.headers = { 'content-length': String(payload.length) };
        response.resume = () => {};
        callback(response);
        process.nextTick(() => {
          response.emit('data', payload);
          response.emit('end');
        });
      });
      return request;
    },
  };
  try {
    manager = createDownloadManager({
      getDefaultFolder: () => rootDir,
      getSettings: () => ({}),
      shell: { openPath: async () => '', showItemInFolder: () => {} },
      onChange: () => events.push(manager.getState()),
      onFinished: () => {},
      httpsImpl,
    });
    const started = manager.startManagedDownload({
      key: 'model:test',
      name: 'Test managed model asset',
      url: 'https://example.test/model.bin',
      destination,
      finalize: async (partPath) => { await fsp.rename(partPath, destination); return destination; },
    });
    assert.equal(started.ok, true);
    const completed = await started.completion;
    assert.equal(completed.state, 'completed');
    assert.equal(await fsp.readFile(destination, 'utf8'), 'managed-download-test');
    assert.equal(manager.getState().items[0].kind, 'managed');
    assert.match(manager.getState().items[0].displayName, /Test managed model asset/);
    assert.ok(events.length >= 2);
  } finally {
    await fsp.rm(rootDir, { recursive: true, force: true });
  }
});

test('managed downloads use only the selected source and expose byte progress when content-length is missing', async () => {
  const { createDownloadManager } = require(path.join(root, 'build', 'main', 'downloads.js'));
  const rootDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'mad-managed-source-'));
  const destination = path.join(rootDir, 'asset.bin');
  const payload = Buffer.from('selected-source-success');
  const requests = [];
  let manager;
  const httpsImpl = {
    get(url, _options, callback) {
      requests.push(url);
      const request = new EventEmitter();
      request.setTimeout = () => request;
      request.destroy = (error) => process.nextTick(() => request.emit('error', error || new Error('destroyed')));
      process.nextTick(() => {
        const response = new EventEmitter();
        response.statusCode = 200;
        response.headers = {};
        response.resume = () => {};
        callback(response);
        process.nextTick(() => {
          response.emit('data', payload.subarray(0, 8));
          response.emit('data', payload.subarray(8));
          response.emit('end');
        });
      });
      return request;
    },
  };
  try {
    manager = createDownloadManager({
      getDefaultFolder: () => rootDir,
      getSettings: () => ({}),
      shell: { openPath: async () => '', showItemInFolder: () => {} },
      onChange: () => {},
      onFinished: () => {},
      httpsImpl,
    });
    const started = manager.startManagedDownload({
      key: 'model:selected-source',
      name: 'Selected managed model asset',
      sources: [
        { name: 'Chosen source', url: 'https://chosen.example/asset.bin' },
      ],
      destination,
      totalBytes: payload.length,
      finalize: async (partPath) => { await fsp.rename(partPath, destination); return destination; },
    });
    assert.equal(started.ok, true);
    const completed = await started.completion;
    assert.equal(completed.state, 'completed');
    assert.equal(await fsp.readFile(destination, 'utf8'), 'selected-source-success');
    assert.deepEqual(requests, ['https://chosen.example/asset.bin']);
    assert.equal(completed.received, payload.length);
    assert.equal(completed.total, payload.length);
  } finally {
    await fsp.rm(rootDir, { recursive: true, force: true });
  }
});

test('website microphone permission is configurable and remains denied by default', () => {
  const main = read('src/main.js');
  const accountSecurity = read('src/main/account-session-security.ts');
  const schema = read('src/main/config-schema.ts');
  const settings = read('src/main/settings.ts');
  const renderer = read('src/renderer.js');
  const html = read('src/renderer.html');
  const managementForms = read('src/renderer-react/ai-hub-management-forms.tsx');
  const videoHubSettings = read('src/renderer-react/video-hub-settings.tsx');
  assert.match(settings, /allowMicrophone: false/);
  assert.match(schema, /\['camera', 'microphone', 'notifications', 'fullscreen'\]/);
  assert.match(accountSecurity, /const mic = typeof overrides\.microphone === 'boolean' \? overrides\.microphone : sec\.allowMicrophone/);
  assert.match(accountSecurity, /if \(wantsAudio && !mic\) return false;/);
  assert.match(accountSecurity, /if \(wantsVideo && !cam\) return false;/);
  assert.match(videoHubSettings, /key: 'allowMicrophone', title: 'Microphone'/);
  assert.match(videoHubSettings, /data-sec=\{securityKey\}/);
  assert.match(managementForms, /id="accountMicrophone"/);
  assert.match(managementForms, /microphone: toOptionalBoolean\(accountDraft\.microphone\)/);
  assert.match(accountSecurity, /sess\.setPermissionRequestHandler/);
  assert.match(accountSecurity, /hostsOk\(requesting\) && hostsOk\(topUrl\) && \(!details\.embeddingOrigin \|\| hostsOk\(details\.embeddingOrigin\)\) && permissionAllowed/);
  // Mad Station's own renderer must never capture media; website permissions are
  // independently governed by the account's website rules.
  assert.match(main, /defaultSession\.setPermissionRequestHandler\(\(_webContents, _permission, callback\) => callback\(false\)\)/);
});


test('home app system: registry scripts are loaded before the renderer and stay CSP-safe', () => {
  const html = read('src/renderer.html');
  const engine = read('src/home-apps.js');
  const list = read('src/home-app-list.js');
  const order = ['home-apps.js', 'home-app-list.js', 'renderer.js'].map((f) => html.indexOf(`<script src="${f}"></script>`));
  assert.ok(order.every((i) => i >= 0) && order[0] < order[1] && order[1] < order[2], 'scripts load in order');
  assert.ok(html.indexOf('src="../build/home-companions-react.js"') > order[2], 'React view loads after the classic registry and launcher controller');
  assert.match(engine, /window\.MadHomeApps = \{/);
  assert.match(engine, /attachReactRenderer\(renderer\)/);
  assert.doesNotMatch(engine, /function makeCard\(|\.innerHTML\s*=|createElement\('button'\)/);
  assert.match(read('src/renderer-react/home-companions.tsx'), /More apps/);
  assert.match(read('src/renderer-react/home-companions.tsx'), /createPortal\(/);
  assert.doesNotMatch(engine, /setAttribute\('style'|\.cssText|style="/);
  assert.match(list, /MadHomeApps\.register/);
  assert.match(read('src/renderer.js'), /MadHomeApps\?\.setLauncher\(openWorkspaceApp\)/);
});


test('homepage-style previews replace the removed theme preset system in Themes', () => {
  const settings = read('src/main/settings.ts');
  const renderer = read('src/renderer.js');
  const html = read('src/renderer.html');
  const controls = read('src/renderer-react/appearance-controls.tsx');
  assert.match(settings, /theme: 'dark'/);
  assert.doesNotMatch(settings, /themePreset/);
  assert.doesNotMatch(renderer, /THEME_PRESETS|applyThemePreset|themePreset|themeResetBtn|appearance-theme-preset/);
  assert.doesNotMatch(html, /themeResetBtn|homePageVersionSelect|home-page-choice-card|data-theme-preset/);
  assert.match(html, /<h3>Themes<\/h3>[\s\S]*id="homepageStyles"/);
  assert.match(controls, /const HOMEPAGE_STYLES = \[/);
  assert.match(controls, /madstation:homepage-style-select/);
  assert.match(renderer, /window\.MadStationHomePage\?\.setMode\(mode\)/);
  assert.match(settings, /backgroundStyle: 'plain'/);
});

test('pages skin: every workspace page shares the home design through pages.css', () => {
  const html = read('src/renderer.html');
  const css = read('src/pages.css');
  assert.ok(html.indexOf('href="home.css"') >= 0 && html.indexOf('href="home.css"') < html.indexOf('href="pages.css"'), 'pages.css loads after home.css');
  for (const sel of ['.clipboard-screen', '.standalone-app-screen', '.ailab-screen', '.settings-screen', '.sidebar', '.account-btn']) {
    assert.ok(css.includes(sel), `pages.css styles ${sel}`);
  }
  // theme-driven, no hard-coded page background, honours Reduce motion
  assert.match(css, /var\(--accent\)/);
  assert.match(css, /body\.reduce-motion/);
  assert.doesNotMatch(css, /url\(/, 'no external or inline image requests (CSP-safe)');
  // every page header carries the shared brand name
  assert.equal((html.match(/class="page-brand-name"/g) || []).length, 3);
});


test('developer section is the last settings tab, password-protected, and focused on theme tools', () => {
  const html = read('src/renderer.html');
  const tabs = [...html.matchAll(/class="settings-tab[^"]*" data-tab="(\w+)"[^>]*data-settings-scope="(\w+)"/g)].map((m) => `${m[2]}:${m[1]}`);
  assert.equal(tabs.at(-1), 'global:developer');
  const developerReact = read('src/renderer-react/information-security-panels.tsx');
  for (const label of ['Unlock Developer Options', 'Developer password', 'Manage Themes', 'Theme ZIP Importer', 'Theme Design Exporter']) {
    assert.ok(developerReact.includes(label), `${label} is available in the Developer theme-management UI`);
  }
  assert.match(developerReact, /requestDeveloperSettingsAction\('unlock'/);
  assert.match(developerReact, /requestDeveloperSettingsAction\('change-password'/);
  assert.match(developerReact, /madstation:developer-panel-action/);
  const visibleDeveloperUi = developerReact.slice(developerReact.indexOf('if (!developerTabActive)'), developerReact.indexOf('const mountConfig'));
  for (const removedUi of ['Project files & commands', 'Workspace App Builder Recipes', 'Design System Recipes', 'Project & File Commands Recipes', 'Developer Guide Rails', 'design-migration', 'design-page', 'app-builder']) {
    assert.ok(!visibleDeveloperUi.includes(removedUi), `${removedUi} is removed from rendered Developer Settings UI`);
  }
  // Removing the cards must not delete the underlying project resources.
  for (const file of ['docs/design/DESIGN_SYSTEM.md', 'README.md', 'src/design-tokens.css', 'src/design-kit.css', 'docs/design-kit-preview.html', 'src/home-app-list.js', 'AGENTS.md', 'package.json']) {
    assert.ok(fs.existsSync(path.join(root, file)), `${file} remains in the project`);
  }
  const main = read('src/main.js');
  assert.match(main, /handleDeveloper\('show-developer-file-location'/);
  assert.match(main, /nativeOperationsRuntime\.showDeveloperFileLocation/);
  assert.match(read('src/main/native-operations-runtime.ts'), /developerFiles\.has\(relativeFile\)/);
  assert.match(read('src/preload.ts'), /showDeveloperFileLocation/);
});

test('Video Hub is registered and manages separately persisted video-generator accounts', () => {
  const apps = read('src/home-app-list.js');
  const html = read('src/renderer.html');
  const renderer = read('src/renderer.js');
  const main = read('src/main.js');
  const sessionRuntime = read('src/main/session-lifecycle-runtime.ts');
  const videoHubIpc = read('src/main/video-hub-ipc.ts');
  const preload = read('src/preload.ts');
  assert.match(apps, /id: 'video-hub'[\s\S]*name: 'Video Hub'/);
  assert.match(apps, /Higgsfield|AI Video/);
  assert.match(html, /id="videoHubScreen"/);
  assert.match(html, /id="videoHubBackBtn"/);
  assert.match(html, /id="videoHubNewProvider"/);
  assert.match(html, /id="videoHubAddAccountBtn"/);
  assert.match(html, /id="videoHubAddProviderForm"/);
  assert.match(read('src/renderer-react/global-settings-panels.tsx'), /\['video-hub', 'Video Hub'\]/);
  assert.match(renderer, /videoHubScreen'\)\.classList\.toggle\('hidden', currentApp !== 'video-hub'\)/);
  assert.match(renderer, /currentApp === 'video-hub' \? 'Video Hub — Mad Station'/);
  assert.match(renderer, /if \(appId === 'video-hub'\)[\s\S]*setWorkspaceApp\('video-hub'\)[\s\S]*loadVideoHubState\(\)/);
  assert.match(renderer, /onWorkspaceApp\(\(\{ app \}\) => \{[\s\S]*'instruction-forge', 'video-hub'\]\.includes\(app\)/, 'main-process workspace sync must accept Video Hub rather than routing it back to launcher');
  assert.match(renderer, /videoHubBackBtn.*goToLauncher/);
  assert.match(renderer, /addVideoHubAccount\(\)/);
  assert.match(renderer, /videoHubResetLogin\(id\)/);
  assert.match(renderer, /videoHubDeleteAccount\(id\)/);
  assert.match(main, /VALID_WORKSPACE_APPS = new Set\([\s\S]*'video-hub'/);
  assert.match(read('src/main/settings.ts'), /STARTUP_WORKSPACES = \['launcher', 'ai-hub', 'ai-lab', 'clipboard', 'instruction-forge', 'video-hub'\]/);
  assert.match(main, /function videoHubSessionFor\(account\)[\s\S]*sessionLifecycleRuntime\.getVideoHubSession\(account\)/);
  assert.match(sessionRuntime, /videoHub: \(account: SessionPartitionAccount\) => `persist:video-hub-\$\{account\.id\}`/);
  assert.match(main, /function videoHubSetActiveAccount|function setVideoHubActiveAccount\(/);
  assert.match(main, /function videoHubWipeAccountData\(account, \{ reopen = true \} = \{\}\)[\s\S]*clearStorageData[\s\S]*clearCache/);
  assert.match(videoHubIpc, /handle\('video-hub-add-account'/);
  assert.match(videoHubIpc, /handle\('video-hub-reset-login'/);
  assert.match(main, /addAccount: \(payload\) => videoHubAddAccount\(payload\)/);
  assert.match(main, /resetLogin: \(id\) => videoHubResetLogin\(id\)/);
  assert.match(read('src/main/account-session-security.ts'), /hardenAccountContents\(child\.webContents, account, browserSession\)/);
  assert.match(main, /const videoHubChildWindows = new Set\(\)/);
  assert.match(read('src/main/video-hub-browser-runtime.ts'), /for \(const child of \[\.\.\.childWindows\]\)/);
  assert.match(main, /const videoSessionWork = loadVideoHubStore\(\)\.accounts\.map/);
  assert.match(preload, /videoHubAddAccount:.*video-hub-add-account/);
  assert.match(preload, /videoHubResetLogin:.*video-hub-reset-login/);
  assert.doesNotMatch(renderer, /VIDEO_HUB_STATE_KEY|readTestAppState|initTestApp/);
  assert.doesNotMatch(main, /persist:aihub-\$\{account\.id\}[\s\S]{0,200}videoHubSessionFor/);
});

test('Google OAuth is restarted from the provider entry point, not forwarded mid-flow', () => {
  const main = read('src/main.js');
  const accountSecurity = read('src/main/account-session-security.ts');
  assert.doesNotMatch(main, /setChromeLikeUserAgent|setUserAgent\(cleaned\)/);
  assert.match(accountSecurity, /sess\.webRequest\.onErrorOccurred\(\{ urls: \['http:\/\/\*\/\*', 'https:\/\/\*\/\*'\] \}/);
  assert.match(accountSecurity, /Request failed: host=\$\{hostname\} type=\$\{resourceType\} method=\$\{method\} error=\$\{error\}/);
  assert.match(main, /function isGoogleAuthUrl\(rawUrl\)/);
  assert.match(main, /function externalEntryUrlForAccount\(account\)/);
  assert.match(main, /function openGoogleAuthFallback\(account\)/);
  assert.match(accountSecurity, /if \(isGoogleAuthUrl\(details\.url\)\)[\s\S]*?openGoogleAuthFallback\(account\)[\s\S]*?return \{ action: 'deny' \}/);
  assert.match(accountSecurity, /if \(event && event\.isMainFrame === false\) return;[\s\S]*?if \(isGoogleAuthUrl\(target\)\)[\s\S]*?event\.preventDefault\(\)[\s\S]*?openGoogleAuthFallback\(account\)/);
  assert.match(accountSecurity, /Google sign-in must finish in a regular browser/);
  assert.match(accountSecurity, /login will not be copied into Mad Station/);
  assert.match(accountSecurity, /parsed\.href\.length > 2081/);
});

test('Video Hub applies proxy settings before first navigation and closes pooled connections on changes', () => {
  const network = read('src/main/video-hub-network-runtime.ts');
  const browser = read('src/main/video-hub-browser-runtime.ts');
  const sessions = read('src/main/session-lifecycle-runtime.ts');
  assert.match(sessions, /const videoHubReadiness = new WeakMap/);
  assert.match(network, /await session\.setProxy\(\{ mode: mode === 'system' \? 'system' : 'direct' \}\)/);
  assert.match(network, /session\.closeAllConnections\(\)/);
  const ready = browser.indexOf('const readiness = await dependencies.waitForSessionReady(session)');
  const attach = browser.indexOf('attachAndRegisterWebContentsViewRuntime(view, {', ready);
  assert.ok(ready >= 0 && attach > ready, 'proxy readiness precedes attachment and initial navigation');
  assert.match(network, /dependencies\.reloadActivePage\(\)/);
});

test('Video Hub screen follows shared design-kit styling and keeps renderer/main boundary', () => {
  const html = read('src/renderer.html');
  const css = read('src/design-kit.css');
  const main = read('src/main.js');
  assert.match(html, /class="ms-screen hidden" id="videoHubScreen"/);
  assert.match(html, /class="ms-card video-hub-manage-card"/);
  assert.match(html, /class="ms-input" id="videoHubNewName"/);
  assert.match(css.slice(css.indexOf('/* Video Hub:')), /var\(--ms-gap\)/);
  assert.doesNotMatch(css.slice(css.indexOf('/* Video Hub:')), /#[0-9a-f]{3,8}|rgba?\(|hsl\(/i);
  assert.match(main, /function setWorkspaceApp\(app\)[\s\S]*closeAllAccountViews\(\)/);
});

test('Video Hub browser toolbar uses shared components and opens the active site externally', () => {
  const html = read('src/renderer.html');
  const renderer = read('src/renderer.js');
  const preload = read('src/preload.ts');
  const main = read('src/main.js');
  const videoHubIpc = read('src/main/video-hub-ipc.ts');
  const kit = read('src/design-kit.css');
  const chrome = read('src/renderer-react/video-hub-workspace-chrome.tsx');
  const mount = html.indexOf('id="videoHubBrowserToolbarReactMount"');
  const slot = html.indexOf('id="videoHubBrowserSlot"', mount);
  assert.ok(mount >= 0 && slot > mount, 'React toolbar mount precedes the native browser slot');
  assert.ok(chrome.indexOf("data-video-hub-nav={action}") < chrome.indexOf('className="ms-browser-address'), 'back/forward/refresh controls appear before address field');
  assert.ok(chrome.indexOf('className="ms-browser-address video-hub-active-copy"') < chrome.indexOf('id="videoHubOpenExternalBtn"'), 'address field appears before Open in browser');
  for (const action of ['back', 'forward', 'refresh']) assert.ok(chrome.includes(`'${action}'`), `${action} control remains available`);
  assert.match(chrome, /id="videoHubActiveIcon"/);
  assert.match(chrome, /id="videoHubActiveSite"/);
  assert.match(chrome, /id="videoHubActiveLabel"/);
  assert.match(chrome, /Open in browser/);
  assert.doesNotMatch(chrome, /Copy link|Separate session|videoHubCopyUrlBtn|videoHubSessionChip/);
  assert.match(kit, /\.ms-browser-toolbar[\s\S]*var\(--ms-card-border\)/);
  assert.match(kit, /\.ms-browser-address[\s\S]*var\(--ms-r-sm\)/);
  assert.match(read('src/renderer-react/video-hub-workspace-chrome.tsx'), /ms-browser-address-icon/);
  assert.match(renderer, /videoHubOpenInBrowser\(\)/);
  assert.match(preload, /videoHubOpenInBrowser: \(\) => invoke\('video-hub-open-in-browser'\)/);
  assert.match(videoHubIpc, /handle\('video-hub-open-in-browser', \(\) => commands\.openInBrowser\(\)\)/);
  assert.match(main, /openInBrowser: \(\) => videoHubOpenInBrowser\(\)/);
  assert.match(main, /openExternalSafe\(externalUrlForPage\(view\.webContents\.getURL\(\) \|\| account\.url, account\)\)/);
});

test('Video Hub design-system migration keeps DOM hooks and uses kit surfaces', () => {
  const html = read('src/renderer.html');
  const renderer = read('src/renderer.js');
  const css = read('src/design-kit.css');
  const designDoc = read('docs/design/DESIGN_SYSTEM.md');
  const chrome = read('src/renderer-react/video-hub-workspace-chrome.tsx');
  for (const id of [
    'videoHubScreen', 'videoHubBackBtn', 'videoHubAccountCount', 'videoHubNewProvider',
    'videoHubNewName', 'videoHubAddAccountBtn', 'videoHubAccountList', 'videoHubAddProviderForm',
    'videoHubNewProviderName', 'videoHubNewProviderUrl', 'videoHubProviderList', 'videoHubActiveLabel',
    'videoHubActiveSite', 'videoHubBrowserSlot', 'videoHubBrowserPlaceholder'
  ]) assert.ok(html.includes(`id="${id}"`) || chrome.includes(`id="${id}"`), `Video Hub DOM id ${id} must remain stable`);
  for (const hook of ['data-video-hub-nav', 'data-video-hub-action', 'data-video-hub-account', 'data-video-hub-rename', 'data-video-hub-delete-provider']) {
    assert.ok(html.includes(hook) || renderer.includes(hook) || chrome.includes(hook), `Video Hub hook ${hook} must remain stable`);
  }
  assert.match(renderer, /event\.key === 'Enter'[\s\S]*event\.key === 'Escape'/, 'rename keyboard interaction must remain');
  assert.match(renderer, /class="ms-row video-hub-account-row/);
  assert.match(renderer, /class="ms-row video-hub-provider-row/);
  const videoCss = css.slice(css.indexOf('/* Video Hub:'));
  assert.doesNotMatch(videoCss, /\.video-hub-account-row\s*\{[^}]*\b(?:border|background|box-shadow|padding|border-radius)\s*:/s, 'account row surfaces should come from .ms-row');
  assert.match(css, /\.ms-browser-frame[\s\S]*var\(--ms-card-border\)/);
  assert.match(designDoc, /Video Hub-specific CSS is layout-only/);
  assert.match(designDoc, /\.ms-browser-frame/);
  assert.match(html, /class="ms-card video-hub-manage-card"/);
  assert.match(html, /class="ms-card video-hub-browser-panel"/);
  assert.match(designDoc, /glass \+ neon/);
  assert.match(designDoc, /sharp\/square \+ compact/);
});

test('Video Hub mirrors AI Hub: searchable sidebar, site filter, pins, recents, collapsible list', () => {
  const html = read('src/renderer.html');
  const renderer = read('src/renderer.js');
  const css = read('src/design-kit.css');
  const chrome = read('src/renderer-react/video-hub-workspace-chrome.tsx');
  const settings = read('src/renderer-react/video-hub-settings.tsx');
  const sidebar = read('src/renderer-react/video-hub-sidebar-controls.tsx');
  const providerTiles = read('src/renderer-react/video-hub-provider-tiles.tsx');
  for (const id of ['videoHubSearch', 'videoHubProviderTiles', 'videoHubFilterAll', 'videoHubFilterPinned', 'videoHubRecent', 'videoHubNoMatch', 'videoHubWorkspace', 'videoHubSiteGrid', 'videoHubRamMonitorMount', 'videoHubSettingsBtn', 'videoHubNotificationsBtn', 'videoHubNotificationBadge', 'videoHubHideSidebarBtn'])
    assert.ok(html.includes(`id="${id}"`) || chrome.includes(`id="${id}"`) || settings.includes(`id="${id}"`) || sidebar.includes(`id="${id}"`) || providerTiles.includes(`id="${id}"`), `Video Hub sidebar id ${id} must exist in its current rendering owner`);
  for (const id of ['videoHubSidebarToggle', 'videoHubOpenExternalBtn', 'videoHubActiveIcon', 'videoHubStatAccounts'])
    assert.ok(html.includes(`id="${id}"`) || chrome.includes(`id="${id}"`), `React-owned Video Hub id ${id} must exist`);
  assert.match(chrome, /className="ms-tabs video-hub-tabs"/);
  assert.doesNotMatch(html, /videoHubQuickAddBtn/, 'the blue top-right Add account button was removed');
  assert.match(html, /class="back-settings" id="videoHubBackBtn"/);
  assert.match(chrome, /className="ms-brand"/);
  assert.match(html, /class="provider-tiles" id="videoHubProviderTiles"/);
  assert.match(renderer, /\['videoHubRamMonitorMount', 'sidebar'\]/);
  assert.match(renderer, /RAM_MONITOR_APPS = new Set\([^)]*'video-hub'/);
  assert.match(renderer, /videoHubSettingsBtn'\)\?\.addEventListener\('click', openVideoHubSettings/);
  assert.match(html, /id="videoHubSettingsReactMount"/);
  assert.match(settings, /id="videoHubSettingsOverlay"[\s\S]*id="videoHubSettingsSave"/);
  assert.match(html, /build\/video-hub-settings-react\.js/);
  assert.match(renderer, /VIDEO_HUB_SETTINGS_KEY/);
  assert.match(settings, /id="videoHubSettingDefaultTab"/);
  assert.match(renderer, /'videoHubNotificationBadge'/);
  assert.match(renderer, /function decorateVideoHub\(\)/);
  assert.match(renderer, /decorateVideoHub\(\);[\s\S]*bindIconFallbacks\(\$\('videoHubScreen'\)\);[\s\S]*videoHubRefreshPending = false;\n\}/, 'renderVideoHub must decorate the UI, preserve icons, and bind fallback handlers');
  assert.match(renderer, /currentApp === 'video-hub'\) \{ openVideoHubTab\('studio'\)/, 'Ctrl+K focuses Video Hub search');
  assert.doesNotMatch(renderer, /VIDEO_HUB_STATE_KEY/);
  const videoCss = css.slice(css.indexOf('/* Video Hub:'));
  assert.match(videoCss, /\.video-hub-workspace\.is-collapsed/);
  assert.match(videoCss, /\.video-hub-header \{[^}]*app-region: drag/, 'Video Hub top bar must drag the window');
  assert.doesNotMatch(videoCss, /#[0-9a-f]{3,8}\b|rgba?\(|hsl\(|url\(/i);
});


test('Video Hub provider/account icons use AI Hub fallback chains across sidebar and Add Accounts', () => {
  const renderer = read('src/renderer.js');
  assert.match(renderer, /function videoHubIconCandidates\(item\)/);
  assert.match(renderer, /\$\{parsed\.origin\}\/favicon\.ico/, 'try the provider website favicon first');
  assert.match(renderer, /icons\.duckduckgo\.com\/ip3\//, 'try an alternate favicon service');
  assert.match(renderer, /google\.com\/s2\/favicons\?domain_url=/, 'keep Google favicon as a backup');
  assert.match(renderer, /function videoHubIconMarkup\(item, extraClass = ''\)[\s\S]*iconMarkup\(/, 'use AI Hub icon markup and its local terminal fallback');
  assert.match(renderer, /data-video-hub-provider-filter[\s\S]*videoHubIconMarkup\(p\)/, 'provider sidebar uses the fallback system');
  assert.match(renderer, /account-icon">\$\{videoHubIconMarkup\(account\)\}/, 'All Accounts account tiles use the fallback system');
  assert.match(renderer, /video-hub-provider-row[\s\S]*videoHubIconMarkup\(provider\)/, 'provider manager rows use the fallback system');
  assert.match(renderer, /video-hub-site-card[\s\S]*videoHubIconMarkup\(p\)/, 'Add Accounts site cards use the fallback system');
  assert.doesNotMatch(renderer, /onerror="this\.hidden=true"/, 'failed icons must not be hidden without a fallback');
  assert.match(renderer, /bindIconFallbacks\(tiles\)/, 'sidebar icon errors are handled');
  assert.match(renderer, /bindIconFallbacks\(grid\)/, 'Add Accounts card icon errors are handled');
});


test('Video Hub provider and account icons match AI Hub sizing', () => {
  const renderer = read('src/renderer.js');
  const css = read('src/styles.css');
  const compactCss = css.replace(/\s+/g, ' ');
  assert.match(renderer, /video-hub-provider-filter-tile/);
  assert.match(renderer, /aria-label="\$\{escapeHtml\(label\)\} · \$\{count\} account/);
  assert.ok(compactCss.includes('grid-template-columns: repeat(auto-fill, minmax(42px, 42px));'), 'Video Hub uses the same fixed-size provider grid as AI Hub');
  assert.ok(compactCss.includes('#videoHubProviderTiles .tile { position: relative; width: 42px; height: 42px; min-width: 42px; max-width: 42px;'), 'provider filter buttons are fixed at 42 by 42 pixels instead of stretching across the sidebar');
  assert.ok(compactCss.includes('#videoHubProviderTiles .tile-label { display: none; }'), 'provider names should be hidden visually');
  assert.match(compactCss, /#videoHubProviderTiles \.tile-icon \.video-hub-real-icon \{ width: 21px !important; height: 21px !important;/, 'provider filter logos match AI Hub icon sizing');
  assert.ok(css.includes('.video-hub-tile .account-icon .provider-icon-img,'), 'account tile icon size override exists');
  assert.ok(css.includes('width: 26px; height: 26px; object-fit: contain;'), 'account logos match AI Hub icon sizing');
});


test('Video Hub icons load once per visit and retain image nodes during provider/account changes', () => {
  const renderer = read('src/renderer.js');
  assert.match(renderer, /function setVideoHubSessionActive\(active\)[\s\S]*videoHubRefreshPending = active;[\s\S]*videoHubIconCacheRequests = new Map\(\);/);
  assert.match(renderer, /function cacheIconForImage\(img, url\)[\s\S]*videoHubIconCacheRequests\.has\(url\)[\s\S]*window\.aiHub\.cacheIcon\?\.\(url\)/, 'a remote icon URL is only requested once within a Video Hub visit');
  assert.match(renderer, /function updateWorkspaceView\(\) \{\n  setVideoHubSessionActive\(currentApp === 'video-hub'\);/, 'entering/leaving Video Hub starts and ends the icon-load session');
  assert.match(renderer, /previousAccountIcons = videoHubRefreshPending \? new Map\(\) : captureIconNodes\(accountList/, 'account images are only replaced on entry, then reused');
  assert.match(renderer, /previousProviderListIcons = videoHubRefreshPending \|\| !providerList \|\| typeof videoHubProvidersReactRenderer === 'function' \? new Map\(\) : captureIconNodes\(providerList/, 'legacy provider-manager images are reused only before React attaches');
  assert.match(renderer, /if \(providerList && typeof videoHubProvidersReactRenderer !== 'function'\) restoreIconNodes/, 'React-owned provider rows never have old image nodes restored into them');
  assert.match(renderer, /const signature = JSON\.stringify\(\[accounts\.length, \[\.\.\.counts\.entries\(\)\], videoHubData\.providers\.map/, 'provider selection is not part of the tile rebuild signature');
  assert.match(renderer, /restoreIconNodes\(host, previousIcons/, 'startup fallback provider filter icons are reused if tile structure changes');
  assert.match(renderer, /if \(!videoHubRefreshPending && signature === videoHubTileSignature\) return;/, 'startup fallback skips unchanged provider tiles but refreshes once when Video Hub is reopened');
  assert.match(renderer, /if \(typeof videoHubProviderTilesReactRenderer === 'function'\) renderVideoHubProviderTiles\(\);/, 'React-owned provider tile selection updates are published through the model bridge');
  assert.match(renderer, /restoreIconNodes\(grid, previousSiteIcons/, 'legacy startup fallback reuses Add Accounts grid icons');
  assert.match(renderer, /videoHubSitesReactRenderer\(\{ sites, emptyMessage: sites\.length \? '' : 'No video sites available\.', iconGeneration: videoHubIconSessionGeneration \}/, 'React Quick start cards receive a new icon generation on workspace entry');
  assert.match(renderer, /let videoHubIconSessionGeneration = 0;[\s\S]*?if \(active\) videoHubIconSessionGeneration \+= 1;/, 'Video Hub icon generation advances only on workspace entry');
});


test('main process records fatal startup errors without logging account or website data', () => {
  const main = read('src/main.js');
  assert.match(main, /function writeStartupDiagnostic\(kind, details = \{\}\)/);
  assert.match(main, /\[Mad Station startup\] \${kind}/, 'safe startup event names are sent to stdout for the full Diagnose Startup workflow');
  assert.match(main, /startupConsoleEvents = new Set\(\[[\s\S]*'main-module-evaluated'[\s\S]*'control-renderer-loaded'[\s\S]*'toolbar-renderer-load-failed'[\s\S]*\]\)/, 'only allowlisted event names may be emitted to the startup console');
  assert.match(main, /process\.on\('uncaughtException'/);
  assert.match(main, /process\.on\('unhandledRejection'/);
  assert.match(main, /\.replace\(\/https\?:\\\/\\\/\[\^\\s"'`\]\+\/gi, '\[redacted-url\]'\)/);
  assert.match(main, /control-renderer-process-gone/);
  assert.match(main, /toolbar-renderer-process-gone/);
  assert.match(main, /control-renderer-load-failed/);
  const bootstrap = read('src/main/app-bootstrap-runtime.ts');
  assert.match(bootstrap, /dependencies\.writeStartupDiagnostic\('app-ready-config-loaded'\);[\s\S]*dependencies\.createMainWindow\(\);[\s\S]*dependencies\.writeStartupDiagnostic\('main-window-created'\);/, 'startup markers bracket successful app-ready and main-window initialization');
  assert.match(main, /showFatalStartupError\('Mad Station could not start', error\)/);
});

test('single Diagnose Startup launcher runs the full v2 diagnostics workflow and keeps output visible', () => {
  const launcher = read('+ Diagnose Startup.cmd');
  const diagnostics = read('scripts/diagnose-startup.ps1');
  assert.match(launcher, /Diagnose Startup \(full checks\)/i);
  assert.match(launcher, /scripts\\check-diagnose-startup-syntax\.ps1/i);
  assert.match(launcher, /scripts\\diagnose-startup\.ps1/i);
  assert.doesNotMatch(launcher, /-Version2/i, 'the canonical launcher no longer selects a separate diagnostic mode');
  assert.match(diagnostics, /DiagnosticPrefix = 'diagnose-startup-2'/, 'existing timestamped v2 log naming is retained for continuity');
  assert.match(diagnostics, /Mad Station Diagnose Startup \(full checks\)/, 'the PowerShell workflow always runs full checks');
  assert.doesNotMatch(diagnostics, /\$Version2/, 'the PowerShell script must not retain the old dual-mode path');
  assert.match(launcher, /pause/);
  assert.equal(fs.existsSync(path.join(root, '+ Diagnose Startup 2.cmd')), false, 'duplicate v2 launcher should not ship');
  const syntaxCheck = read('scripts/check-diagnose-startup-syntax.ps1');
  assert.match(syntaxCheck, /System\.Management\.Automation\.Language\.Parser\]::ParseFile/);
  assert.match(syntaxCheck, /syntax error at line/);
  assert.match(diagnostics, /npm ci/);
  assert.match(diagnostics, /package-lock\.json is newer than npm's installed-tree marker/);
  assert.match(diagnostics, /Test-InstalledLockMarkerCurrent/);
  assert.match(diagnostics, /rootPackage = lock\.packages\[''\]/, 'PowerShell 5.1 lockfile parsing must preserve the npm v3 root entry');
  assert.match(diagnostics, /delete lock\.packages\[''\]/, 'empty lockfile key must be projected before ConvertFrom-Json');
  assert.match(diagnostics, /Lockfile v3, direct pins, registry integrity, and hash-pinned local sprintf-js security patch are consistent/);
  assert.match(diagnostics, /Arguments @\('run', 'env:check'\)/);
  assert.match(diagnostics, /Arguments @\('run', 'typecheck'\)/);
  assert.match(diagnostics, /Arguments @\('test'\)/);
  assert.match(diagnostics, /Arguments @\('run', 'build'\)/);
  assert.match(diagnostics, /Arguments @\('audit', '--omit=dev', '--json'\)/);
  assert.match(diagnostics, /Arguments @\('audit', '--json'\)/);
  assert.match(diagnostics, /release audit is unverified, not clean/);
  assert.match(diagnostics, /Full dependency audit reports unresolved vulnerabilities; release validation is not clean/);
  assert.match(diagnostics, /Start-Transcript/);
  assert.match(diagnostics, /node_modules\\\.bin\\electron\.cmd/);
  assert.match(diagnostics, /install-electron\.cmd/);
  assert.match(diagnostics, /--no/);
  assert.match(diagnostics, /Application startup confirmation and exit status/);
  assert.match(diagnostics, /Application startup result: \{0\}/);
  assert.match(diagnostics, /AppLaunchOutcome = 'NOT ATTEMPTED'/);
  assert.match(diagnostics, /STARTUP CONFIRMED; main process, window, both renderers, and clean exit verified/);
  assert.match(diagnostics, /STARTUP NOT FULLY CONFIRMED/);
  assert.match(diagnostics, /toolbarRendererGone = \$uniqueEvents -contains 'toolbar-renderer-process-gone'/);
  assert.match(diagnostics, /toolbarRendererGone.*Add-Failure/s);
  assert.match(diagnostics, /toolbar-renderer-loaded/);
  assert.match(diagnostics, /fatal-startup-error/);
  assert.match(diagnostics, /unhandled-rejection/);
  assert.match(diagnostics, /control-renderer-loaded/);
  assert.match(diagnostics, /main-window-created/);
  assert.match(diagnostics, /electron\.exe/);
  assert.match(diagnostics, /startup-diagnostics\.log/);
  assert.match(read('AGENTS.md'), /\+ Diagnose Startup\.cmd/);
  assert.doesNotMatch(read('AGENTS.md'), /\+ Diagnose Startup 2\.cmd/, 'instructions should name only the canonical launcher');
  assert.match(read('AGENTS.md'), /Do not routinely make them paste a series of separate PowerShell commands/);
  assert.match(read('README.md'), /AI coding agents should tell you to run this launcher first/);
  assert.equal(fs.existsSync(path.join(root, 'diagnose-startup.cmd')), false, 'old launcher name should be removed from the current project root');
});


test('static icons and Image Hub active state use DOM APIs rather than HTML parsing', () => {
  const js = read('src/renderer.js');
  assert.match(js, /function createSettingsGearIcon\(\)[\s\S]*?document\.createElementNS\(SVG_NAMESPACE, 'svg'\)[\s\S]*?svg\.append\(circle, path\)/);
  const normalizeGears = js.match(/function normalizeSettingsGears\(\) \{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(normalizeGears, /replaceChildren\(createSettingsGearIcon\(\)\)/);
  assert.doesNotMatch(normalizeGears, /innerHTML/);
  const selection = js.match(/function imageHubUpdateAccountSelection\(\) \{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(selection, /activeBadge\.textContent = 'Active'/);
  assert.doesNotMatch(selection, /insertAdjacentHTML|innerHTML/);
  assert.match(js, /downloadsList'\)\?\.replaceChildren\(\)/);
});




test('Settings exposes a wider safe drag region while preserving controls and other pages', () => {
  const css = read('src/styles.css');
  assert.match(css, /body:has\(#settingsScreen:not\(\.hidden\)\)\s+\.window-drag-strip\s*\{[^}]*left:\s*264px;[^}]*height:\s*34px;/s,
    'Settings uses its empty top gutter as a generous 34px drag target');
  assert.match(css, /@media\s*\(max-width:\s*860px\)[\s\S]*?body:has\(#settingsScreen:not\(\.hidden\)\)\s+\.window-drag-strip\s*\{[^}]*left:\s*76px;/s,
    'the drag target follows the compact Settings sidebar width');
  assert.match(css, /body:has\(#settingsScreen:not\(\.hidden\)\s+\.st-nav\.expanded\)\s+\.window-drag-strip\s*\{[^}]*height:\s*8px;/s,
    'expanded mobile navigation keeps only the safe 8px fallback');
  assert.match(css, /\.window-controls\s*\{[^}]*z-index:\s*10001/s,
    'window controls remain above the drag target');
  assert.match(css, /\.window-drag-strip\s*\{[^}]*-webkit-app-region:\s*drag/s,
    'the strip remains a native Electron drag region');
});

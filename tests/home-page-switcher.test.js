const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('new modular homepage is installed as an isolated alternate screen while the original markup remains', () => {
  const html = read('src/renderer.html');
  assert.match(html, /id="launcherScreen"/);
  const builtInFrames = [
    ['launcherV2Screen', 'home-v2.html'],
    ['launcherParallaxScreen', 'home-v3.html'],
    ['launcherRetroScreen', 'home-retro.html'],
    ['launcherRetroComplexScreen', 'home-retro-complex.html'],
    ['launcherParallaxBigScreen', 'home-v4.html'],
    ['launcherGalaxyScreen', 'home-galaxy.html'],
    ['launcherParallaxJungleScreen', 'home-parallax-jungle.html'],
    ['launcherClaymorphismScreen', 'home-claymorphism.html'],
    ['launcherGlassScreen', 'home-glass.html'],
    ['launcherIsometricWorldScreen', 'home-isometric-world.html'],
  ];
  for (const [id, source] of builtInFrames) {
    const tag = html.match(new RegExp(`<iframe id="${id}"[^>]*>`))?.[0] || '';
    assert.match(tag, new RegExp(`data-home-src="${source.replaceAll('.', '\\.')}"`), `${id} lazily loads its canonical source`);
    assert.match(tag, /data-home-unload-inactive="true"/, `${id} is destroyed when inactive`);
    assert.doesNotMatch(tag, /\ssrc=/, `${id} does not start in the background`);
  }
  const picker = read('src/renderer-react/appearance-controls.tsx');
  assert.match(html, /id="homepageStyles"/);
  assert.doesNotMatch(html, /homePageVersionSelect|home-page-choice-card/);
  assert.match(picker, /madstation:homepage-style-select/);
  for (const [id, label] of [['v2','Simple'],['retro','Simple Retro'],['retro-complex','Retro Complex'],['parallax','3D Parallax'],['parallax-big','3D Parallax Big App'],['galaxy','Galaxy'],['parallax-jungle','Parallax Jungle'],['claymorphism','Claymorphism'],['glass','Glass'],['isometric-world','Isometric World']]) {
    assert.ok(picker.includes(`id: '${id}', label: '${label}'`), `${label} homepage card is defined`);
  }
});

test('startup uses a loading cover until the saved theme is ready, and Default is only selectable in Developer Options', () => {
  const html = read('src/renderer.html');
  const switcher = read('src/home-page-switcher.js');
  const css = read('src/styles.css');
  const appearance = read('src/renderer-react/appearance-controls.tsx');
  const quickTheme = read('src/home-quick-access-theme.js');
  const developer = read('src/renderer-react/information-security-panels.tsx');

  const loadingMarkup = html.match(/<div class="home-startup-loading" id="homeStartupLoadingScreen"[^>]*>/)?.[0] || '';
  assert.ok(loadingMarkup, 'the startup loading screen is present and visible by default');
  assert.doesNotMatch(loadingMarkup, /\shidden(?:\s|>)/, 'the loading cover is shown before startup scripts run');
  assert.ok(html.indexOf('id="homeStartupLoadingScreen"') < html.indexOf('id="appShell"'), 'the loading cover is parsed before the initial Default HTML can be painted');
  assert.match(switcher, /function maybeReleaseStartupLoadingScreen\(\)/);
  assert.match(switcher, /if \(importedThemesLoading && hasPendingSavedCustomTheme\(\)\) return/);
  assert.match(switcher, /if \(mode === 'legacy' \|\| \(FRAMES\[mode\] && ready\[mode\]\)\) releaseStartupLoadingScreen\(\)/);
  assert.match(switcher, /startupLoadingScreen\.classList\.add\('is-releasing'\)/);
  assert.match(css, /\.home-startup-loading\s*\{/);
  assert.match(css, /\.home-startup-loading\[hidden\]\s*\{\s*display:\s*none !important;/);

  assert.doesNotMatch(appearance, /id: 'legacy', label: 'Default'/, 'Default is not a Themes card in Appearance');
  assert.doesNotMatch(switcher, /\{ id: 'legacy', label: 'Default' \}/, 'Default is not part of the host Quick Access theme list');
  assert.doesNotMatch(quickTheme, /\{ id: 'legacy', label: 'Default' \}/, 'Default is not part of theme-native Quick Access');
  assert.match(quickTheme, /item\.id === 'legacy'/, 'stale/legacy catalog payloads cannot re-add Default to a Quick Access menu');
  assert.match(developer, /<h3>Default homepage \(developer only\)<\/h3>/);
  assert.match(developer, /data-developer-default-homepage/);
  assert.match(developer, /emit\('madstation:homepage-style-select', 'legacy'\)/);
  assert.match(switcher, /const validMode = \(value\) => value === 'legacy'/, 'Default remains supported internally for Developer selection and recovery');
  assert.match(switcher, /quickControlsSummary\.textContent = HOMEPAGE_STYLE_OPTIONS\.find\(\(style\) => style\.id === mode\)\?\.label \|\| \(mode === 'legacy' \? 'Developer homepage' : 'Simple'\)/, 'the non-selectable legacy mode is not mislabeled as Simple in the Quick Access summary');
});

test('homepage theme IDs are unique and the Appearance registry matches the runtime frame registry', () => {
  const picker = read('src/renderer-react/appearance-controls.tsx');
  const switcher = read('src/home-page-switcher.js');
  const pickerIds = [...picker.matchAll(/id: '([^']+)', label: '[^']+'/g)].map((match) => match[1]);
  const frameBlock = switcher.match(/const FRAMES = \{([\s\S]*?)\n  \};/);
  assert.ok(frameBlock, 'runtime frame registry exists');
  const frameIds = [...frameBlock[1].matchAll(/^\s{4}(?:'([^']+)'|([a-z0-9-]+)): \{ frame:/gm)].map((match) => match[1] || match[2]);
  const expectedFrameIds = ['v2', 'retro', 'retro-complex', 'parallax', 'parallax-big', 'galaxy', 'parallax-jungle', 'claymorphism', 'glass', 'isometric-world'];
  assert.equal(new Set(pickerIds).size, pickerIds.length, 'picker IDs contain no duplicates');
  assert.deepEqual(frameIds.sort(), expectedFrameIds.sort(), 'runtime contains each built-in theme once');
  assert.ok(expectedFrameIds.every((id) => pickerIds.includes(id)), 'every runtime theme has a matching selectable card');
});

test('imported custom homepage frames fill the viewport instead of using the browser default iframe size', () => {
  const host = read('src/home-page-switcher.js');
  const css = read('src/styles.css');
  assert.match(host, /frame\.className = 'launcher-screen hidden imported-theme-frame'/);
  assert.match(css, /\.launcher-screen\.imported-theme-frame\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0;[^}]*width:\s*100%;[^}]*height:\s*100%;[^}]*border:\s*0;/s);
  assert.match(css, /\.launcher-screen\.imported-theme-frame\.hidden\s*\{[^}]*display:\s*none\s*!important;/s);
});

test('all isolated homepage themes and workspace headers provide safe native drag regions', () => {
  const chrome = read('src/home-style-chrome.css');
  const css = read('src/styles.css');
  const html = read('src/renderer.html');
  const toolbar = read('src/toolbar.html');

  assert.match(chrome, /body\[data-home-style\] :is\(header\.top, header\.bar, header\.topbar, \.top, \.topbar\) \{[\s\S]*?-webkit-app-region: drag;[\s\S]*?app-region: drag;/);
  assert.match(chrome, /body\[data-home-style\] :is\(header\.top, header\.bar, header\.topbar, \.top, \.topbar\) :is\(button, a, input, select, textarea/);
  assert.match(chrome, /body\[data-home-style\] :is\(header\.top, header\.bar, header\.topbar, \.top, \.topbar\)[\s\S]*?app-region: no-drag;/);
  assert.match(chrome, /body\[data-home-style="galaxy"\] \.brand[\s\S]*?app-region: drag;/);
  assert.match(chrome, /body\[data-home-style="galaxy"\] #launcherSettingsBtn,\s*body\[data-home-style="galaxy"\] #themeBtn\s*\{[\s\S]*?app-region: no-drag;/, 'Galaxy Settings and Day/Night controls remain clickable without a search trigger');

  for (const selector of ['.home-topbar', '.video-hub-header', '.image-hub-header', '.ms-header', '.ms-browser-toolbar', '.image-hub-browser-toolbar', '.video-hub-browser-toolbar', '.clipboard-settings-heading', '.standalone-app-header', '.forge-app-header', '.preview-toolbar', '.forge-browser-toolbar', '.sidebar > .brand', '.image-hub-aside > .brand']) {
    assert.ok(css.includes(selector), `${selector} participates in the shared workspace drag contract`);
  }
  assert.match(css, /:is\(button, a, input, select, textarea, summary, \[role="button"\], \[role="link"\], \[tabindex\], \[contenteditable="true"\]\) \{[\s\S]*?app-region: no-drag;/);
  assert.match(css, /body\.home-theme-native-drag > \.window-drag-strip \{ height: 32px; \}/, 'isolated homepage iframes get a wider host-level drag band');
  assert.match(css, /:is\([^)]*\.ms-browser-toolbar[^)]*\) :is\(button, a, input,[\s\S]*?app-region: no-drag;/, 'interactive browser toolbar controls stay usable while blank toolbar space can drag');
  assert.match(css, /\.st-nav-head,[\s\S]*?app-region: drag;/, 'the persistent Settings header can move the frameless window');
  assert.match(css, /\.st-nav-head,[\s\S]*?\) :is\(button, a, input,[\s\S]*?app-region: no-drag;/, 'Settings controls stay clickable inside the draggable heading');

  const mountIndex = html.indexOf('id="homeCustomizerReactMount"');
  const dragIndex = html.indexOf('class="window-drag-strip"');
  assert.ok(mountIndex >= 0 && dragIndex > mountIndex, 'host drag chrome follows the last UI mount');
  assert.match(toolbar, /id="toolbar-root"[\s\S]*class="window-drag-strip"[\s\S]*<\/body>/, 'the native toolbar view has its own edge drag strip');
});

test('homepage setting defaults to the new experience and preserves the developer-only legacy choice', () => {
  const bridge = read('src/home-page-switcher.js');
  assert.match(bridge, /const validMode = \(value\) => value === 'legacy' \|\| Object\.prototype\.hasOwnProperty\.call\(FRAMES, value\)/, 'the active frame registry validates built-in and imported themes dynamically');
  assert.match(bridge, /function applyImportedThemeCatalog\(/, 'imported themes are registered into the live homepage switcher');
  assert.doesNotMatch(bridge, /catalog\.overrides|restoreBuiltinFrame|importedOverrideApplied/, 'imported ZIPs cannot replace built-in runtime frames');
  assert.match(bridge, /importedCustomModes\.add\(mode\)/, 'custom theme IDs are accepted after catalog loading');
  const appearance = read('src/renderer-react/appearance-controls.tsx');
  assert.match(appearance, /typeof item\.entryUrl === 'string' && item\.entryUrl\.startsWith\('file:'\)/, 'Appearance accepts imported custom themes only when their installed file URL is valid');
  assert.match(appearance, /madstation-home-\[a-z0-9-\]\{1,90\}/, 'Appearance uses the runtime channel validation contract');
  assert.match(bridge, /if \(validMode\(saved\)\) return saved/);
  assert.match(bridge, /if \(saved !== null\) localStorage\.setItem\(STORAGE_KEY, 'v2'\)/);
  assert.match(bridge, /importedThemeCatalogAvailable = true/);
  assert.match(bridge, /savedIsCustom && \(!importedThemeCatalogAvailable \|\| importedThemesLoading\)/, 'a temporary catalog failure must not destroy a saved custom-theme choice');
  assert.match(bridge, /function hasPendingSavedCustomTheme\(\)/, 'startup readiness does not time out a placeholder while the saved custom theme catalogue is unavailable');
  assert.match(bridge, /function watchFrameReadiness\(mode\) \{[\s\S]*?mode === 'v2' && hasPendingSavedCustomTheme\(\)/, 'the fallback timer waits for a custom-theme catalogue before declaring the placeholder broken');
  assert.match(bridge, /localStorage\.setItem\(STORAGE_KEY, next\)/);
  assert.match(bridge, /const showLegacy = workspace === 'launcher' && mode === 'legacy'/);
  assert.match(bridge, /workspace === 'launcher' && mode === frameMode/);
  assert.match(bridge, /entry\.frame\?\.classList\.toggle\('hidden', !show\)/);
  assert.match(bridge, /function loadDeferredFrame\(entry\)/, 'heavy homepages load only when selected');
  assert.match(bridge, /function unloadInactiveFrame\(mode, entry\)/, 'inactive animated homepages are unloaded');
  assert.match(bridge, /Ignore a late handshake from a heavy frame that was just unloaded/);
  assert.match(bridge, /madstation-home-parallax/);
  assert.match(bridge, /madstation-home-parallax-big/);
  assert.match(bridge, /madstation-home-galaxy/);
  assert.match(bridge, /madstation-home-parallax-jungle/);
  assert.match(bridge, /madstation-home-claymorphism/);
  assert.match(bridge, /madstation-home-simple-retro/);
});


test('main screen provides a quick homepage-style picker with animated switching', () => {
  const html = read('src/renderer.html');
  const host = read('src/home-page-switcher.js');
  const css = read('src/styles.css');
  assert.match(html, /id="homeStyleQuickAccess"/);
  assert.match(html, /id="homeQuickControlsButton"[^>]*aria-controls="homeQuickControlsMenu"/);
  assert.match(html, /id="homeQuickControlsMenu"[^>]*role="dialog"/);
  assert.match(html, /id="homeStyleQuickOptions"[^>]*role="radiogroup"/);
  assert.doesNotMatch(html, /id="homeStyleQuickButton"|id="homeStyleQuickMenu"/);
  assert.equal((html.match(/id="homeQuickControlsButton"/g) || []).length, 1, 'exactly one quick-access trigger remains');
  assert.match(css, /\.home-style-quick-access\s*\{\s*position:\s*fixed;/, 'the control dock stays above the full-screen homepage iframe');
  assert.match(css, /\.home-style-quick-menu\[hidden\]\s*\{\s*display:\s*none\s*!important;/, 'the combined popover respects its hidden state');
  assert.match(host, /function initializeQuickAccess\(\)/);
  assert.match(host, /data-quick-home-style/);
  assert.match(host, /setMode\(style\.id\)/);
  assert.match(host, /applySelectedHomePage\(\{ transitionFrom: previous \}\)/);
  assert.match(host, /function clearTransition\(\)/);
  assert.match(css, /\.homepage-style-transition-enter/);
  assert.match(css, /@keyframes home-style-screen-enter/);
  assert.match(css, /prefers-reduced-motion:reduce/);
});

test('Simple Home v5 uses a narrow host bridge for app launch, Settings, Appearance and telemetry', () => {
  const home = read('src/home-v5.js');
  const pageBridge = read('src/home-v5-bridge.js');
  const host = read('src/home-page-switcher.js');
  assert.match(home, /mad-home-v5-order/);
  assert.match(home, /mad-home-v5-hidden/);
  assert.match(home, /window\.MadHomeApps = \{ setLauncher/);
  assert.match(home, /if \(!a \|\| a\.extra === 'sys'\) return/);
  assert.match(pageBridge, /const CHANNEL = 'madstation-home-v2'/);
  assert.match(pageBridge, /MadHomeApps\?\.setLauncher\?\.\(\(target\) =>/);
  assert.match(pageBridge, /sendHost\('launch', \{ target \}\)/);
  assert.match(pageBridge, /sendHost\('open-settings'\)/);
  assert.match(pageBridge, /sendHost\('toggle-theme'\)/);
  assert.match(pageBridge, /message\.type === 'appearance-settings'/);
  assert.match(pageBridge, /message\.type === 'memory-model'/);
  assert.match(pageBridge, /message\.type === 'stats'/);
  assert.match(host, /event\.source === entry\.frame\.contentWindow/);
  assert.match(host, /ALLOWED_TARGETS\.has\(target\)/);
  assert.match(host, /ALLOWED_MEMORY_ACTIONS\.has\(message\.action\)/);
});

test('live RAM model and appearance settings are forwarded to the new homepage', () => {
  const host = read('src/home-page-switcher.js');
  const renderer = read('src/renderer.js');
  assert.match(renderer, /new CustomEvent\('mad:memory-model', \{ detail: viewModel \}\)/);
  assert.match(host, /window\.addEventListener\('madstation:appearance-settings'/);
  assert.match(host, /document\.addEventListener\('mad:memory-model'/);
  assert.match(host, /sendToFrame\(mode, 'memory-model', \{ model: latestMemoryModel \}\)/);
  assert.match(host, /sendToFrame\(mode, 'appearance-settings', \{ settings:/);
});

test('resetting settings returns the homepage selector to the new default', () => {
  const renderer = read('src/renderer.js');
  assert.match(renderer, /window\.MadStationHomePage\?\.setMode\('v2'\)/);
});

test('Simple Home v5 handshakes with the host and reports startup failures', () => {
  const host = read('src/home-page-switcher.js');
  const pageBridge = read('src/home-v5-bridge.js');
  assert.match(host, /type: 'host-ping'/);
  assert.match(host, /READY_TIMEOUT_MS = 5000/);
  assert.match(host, /recoverToLegacy\('homepage-not-ready', mode\)/);
  assert.doesNotMatch(host, /localStorage\.setItem\(STORAGE_KEY, 'legacy'\)/, 'readiness failures must not persist the temporary fallback');
  assert.match(host, /selected mode in persistent storage/);
  assert.match(host, /message\.type === 'home-error'/);
  assert.match(pageBridge, /message\.type === 'host-ping'/);
  assert.match(pageBridge, /sendHost\('home-ready'\)/);
  assert.match(pageBridge, /sendHost\('home-error'\)/);
});

test('renderer CSP explicitly permits the local homepage iframe', () => {
  const html = read('src/renderer.html');
  assert.match(html, /frame-src 'self' file:/);
  for (const [id, source] of [
    ['launcherV2Screen', 'home-v2.html'], ['launcherParallaxScreen', 'home-v3.html'],
    ['launcherRetroScreen', 'home-retro.html'], ['launcherRetroComplexScreen', 'home-retro-complex.html'],
    ['launcherParallaxBigScreen', 'home-v4.html'], ['launcherGalaxyScreen', 'home-galaxy.html'],
    ['launcherParallaxJungleScreen', 'home-parallax-jungle.html'], ['launcherClaymorphismScreen', 'home-claymorphism.html'],
    ['launcherGlassScreen', 'home-glass.html'], ['launcherIsometricWorldScreen', 'home-isometric-world.html'],
  ]) {
    const tag = html.match(new RegExp(`<iframe id="${id}"[^>]*>`))?.[0] || '';
    assert.match(tag, new RegExp(`data-home-src="${source.replaceAll('.', '\\.')}"`));
    assert.match(tag, /data-home-unload-inactive="true"/);
    assert.doesNotMatch(tag, /\ssrc=/);
  }
});

test('Galaxy homepage preserves the uploaded space design and bridges into Mad Station', () => {
  const home = read('src/home-galaxy.html');
  const styles = read('src/styles.css');
  assert.match(home, /<title>Galaxy — Mad Station<\/title>/);
  assert.match(home, /#sky/);
  assert.match(home, /const CHANNEL = 'madstation-home-galaxy'/);
  assert.match(home, /inApp: window\.parent !== window \|\| !!window\.MadStationMemoryMonitor/);
  assert.match(home, /sendHost\('launch', \{ target \}\)/);
  assert.match(home, /sendHost\('open-settings'\)/);
  assert.match(home, /message\.type === 'appearance-settings'/);
  assert.match(home, /message\.type === 'memory-model'/);
  assert.match(styles, /#launcherGalaxyScreen\.home-galaxy-frame/);
});

test('Parallax Jungle preserves the supplied layered jungle homepage and bridges into Mad Station', () => {
  const home = read('src/home-parallax-jungle.html');
  const styles = read('src/styles.css');
  assert.match(home, /<title>Parallax Jungle — Mad Station<\/title>/);
  assert.match(home, /const CHANNEL = 'madstation-home-parallax-jungle'/);
  assert.match(home, /function mount\(/);
  assert.match(home, /const TL = \[/);
  assert.match(home, /sendHost\('launch', \{ target \}\)/);
  assert.match(home, /sendHost\('open-settings'\)/);
  assert.match(home, /message\.type === 'appearance-settings'/);
  assert.match(home, /message\.type === 'memory-model'/);
  assert.match(home, /window\.parent !== window \|\| !!window\.MadStationMemoryMonitor/);
  assert.match(home, /window\.MadHome\.setTheme = \(theme\) =>/,
    'Jungle exposes a host-callable day/night setter for its canvas scene');
  assert.match(home, /ntT = th === 'dark' \? 1 : 0/,
    'day/night selection targets the scene lighting state');
  assert.match(home, /nt \+= \(ntT - nt\) \* Math\.min\(1, dt \* 1\.6\)/,
    'the render loop interpolates scene lighting rather than snapping');
  assert.match(home, /window\.MadHome\?\.setTheme\?\.\(resolvedTheme\)/,
    'the original Jungle host bridge forwards resolved Appearance mode');
  assert.match(styles, /#launcherParallaxJungleScreen\.home-parallax-jungle-frame/);
});

test('Claymorphism preserves the supplied clay homepage and integrates with the main-page host', () => {
  const home = read('src/home-claymorphism.html');
  const host = read('src/home-page-switcher.js');
  const styles = read('src/styles.css');
  const packageJson = read('package.json');
  assert.match(home, /<title>Claymorphism — Mad Station<\/title>/);
  assert.match(home, /class="layers" aria-hidden="true"/);
  assert.match(home, /id="mainCard"/);
  assert.match(home, /id="homeApps"/);
  assert.match(home, /const CHANNEL = 'madstation-home-claymorphism'/);
  assert.match(home, /window\.MadHome\.inApp = isFramed \|\| Boolean\(window\.MadStationMemoryMonitor\)/);
  assert.match(home, /sendHost\('launch', \{ target \}\)/);
  assert.match(home, /sendHost\('open-settings'\)/);
  assert.match(home, /sendHost\('toggle-theme'\)/);
  assert.match(home, /message\.type === 'appearance-settings'/);
  assert.match(home, /message\.type === 'memory-model'/);
  assert.match(host, /claymorphism: \{ frame: document\.getElementById\('launcherClaymorphismScreen'\), channel: 'madstation-home-claymorphism' \}/);
  assert.match(host, /Object\.prototype\.hasOwnProperty\.call\(FRAMES, value\)/, 'the current frame registry includes imported custom themes');
  assert.match(styles, /#launcherClaymorphismScreen\.home-claymorphism-frame/);
  assert.match(packageJson, /home-claymorphism\.html/);
});

test('Glass preserves the supplied glassmorphism homepage and integrates with the main-page host', () => {
  const home = read('src/home-glass.html');
  const host = read('src/home-page-switcher.js');
  const styles = read('src/styles.css');
  const packageJson = read('package.json');
  const html = read('src/renderer.html');
  assert.match(home, /<title>Glass — Mad Station<\/title>/);
  assert.match(home, /class="layers" aria-hidden="true"/);
  assert.match(home, /class="glass sys rise"/);
  assert.match(home, /const CHANNEL = 'madstation-home-glass'/);
  assert.match(home, /window\.MadHome\.inApp = isFramed \|\| Boolean\(window\.MadStationMemoryMonitor\)/);
  assert.match(home, /sendHost\('launch', \{ target \}\)/);
  assert.match(home, /sendHost\('open-settings'\)/);
  assert.match(home, /sendHost\('toggle-theme'\)/);
  assert.match(home, /message\.type === 'appearance-settings'/);
  assert.match(home, /message\.type === 'memory-model'/);
  assert.match(host, /glass: \{ frame: document\.getElementById\('launcherGlassScreen'\), channel: 'madstation-home-glass' \}/);
  assert.match(host, /Object\.prototype\.hasOwnProperty\.call\(FRAMES, value\)/, 'valid modes are derived from the live frame registry');
  assert.match(styles, /#launcherGlassScreen\.home-glass-frame/);
  assert.match(packageJson, /home-glass\.html/);
  assert.match(read('src/renderer-react/appearance-controls.tsx'), /id: 'glass', label: 'Glass'/);
});

test('Appearance bridge sends the host surface palette and preserves launcher-native accents', () => {
  const bridge = read('src/home-page-switcher.js');
  const appearance = read('src/appearance.js');
  const tokens = read('src/design-tokens.css');
  for (const property of ['--bg', '--sidebar', '--surface', '--surface-2', '--surface-3', '--line', '--line-strong', '--text', '--muted', '--muted-2', '--danger', '--shadow']) {
    assert.ok(bridge.includes(`'${property}'`), `host bridge forwards ${property}`);
    assert.ok(appearance.includes(`'${property}'`), `Home accepts ${property}`);
  }
  const hostPalette = bridge.match(/const HOST_PALETTE_PROPERTIES = \[(.*?)\]/s)?.[1] || '';
  assert.doesNotMatch(hostPalette, /--accent/, 'the global accent is not included in the palette sent to themed launchers');
  assert.match(bridge, /delete settings\.accent/, 'saved accent is removed before themed launcher settings are posted');
  assert.match(appearance, /allowedPaletteProperties\.push\('--accent', '--accent-strong'\)/, 'the default homepage can still accept the Appearance accent');
  for (const background of ['plain', 'aurora', 'grid', 'spotlight', 'mesh', 'neon', 'parallax', 'dots', 'rings', 'hex', 'waves', 'diagonal', 'circuit', 'constellation', 'tiles', 'custom']) {
    assert.ok(tokens.includes(`body[data-background-style="${background}"]`), `${background} background is mapped for Home`);
  }
  assert.match(bridge, /hostPalette: readHostPalette\(\)/, 'Appearance uses the current host-resolved palette');
  assert.match(appearance, /body\.dataset\.showStatusBar = s\.showStatusBar === false \? 'false' : 'true'/);
  assert.match(appearance, /if \(last && !last\.hostPalette\) apply\(last\)/, 'the host remains authoritative for System mode resolution when embedded');
  assert.match(tokens, /body\[data-show-status-bar="false"\]/);
  const optionValues = {
    'surface-style': ['solid', 'glass', 'elevated', 'frosted'],
    'corner-style': ['soft', 'sharp', 'square', 'ultra'],
    'button-corner': ['soft', 'pill', 'square', 'sharp', 'glass', 'neon'],
    'button-background': ['solid', 'outline', 'ghost', 'contrast', 'glass', 'neon', 'text'],
    'border-style': ['subtle', 'balanced', 'strong', 'neon', 'neon2', 'glass', 'none'],
    'shadow-style': ['none', 'soft', 'strong', 'neon', 'glass'],
    'card-spacing': ['compact', 'comfortable', 'spacious'],
    'border-spacing': ['compact', 'comfortable', 'spacious'],
  };
  for (const [setting, values] of Object.entries(optionValues)) {
    for (const value of values) assert.ok(tokens.includes(`body[data-${setting}="${value}"]`), `${setting}=${value} maps for Home`);
  }
  assert.match(tokens, /body\[data-density="compact"\]/);
  assert.match(tokens, /body\[data-show-status-bar="false"\]/);
  const modern = read('src/home-modern.css');
  assert.match(modern, /\.home\s*\{[^}]*background-size:\s*var\(--ms-home-background-size/s,
    'the v3 skin preserves the selected background image/pattern sizing');
  assert.match(modern, /body\.no-hover-animation/);
  assert.match(modern, /prefers-reduced-motion/);
});

test('Parallax is a built-in background across settings validation, preview, and every homepage style', () => {
  const renderer = read('src/renderer.js');
  const settings = read('src/main/settings.ts');
  const controls = read('src/renderer-react/appearance-controls.tsx');
  const appearance = read('src/appearance.js');
  const styles = read('src/styles.css');
  const home = read('src/home.css');
  const modern = read('src/home-modern.css');
  const v3 = read('src/home-v3.css');
  const tokens = read('src/design-tokens.css');

  for (const [name, source] of Object.entries({ renderer, settings, controls, appearance })) {
    assert.match(source, /parallax/i, `${name} recognizes Parallax`);
  }
  assert.match(controls, /\['plain', 'Plain'\], \['parallax', 'Parallax'\]/, 'Appearance shows Parallax near the top of the labelled background options');
  assert.match(styles, /body\[data-background-style="parallax"\] \.app-shell[\s\S]*background-size:/, 'legacy screens render the shared Parallax backdrop');
  assert.match(styles, /\.background-option-thumb\[data-background-preview="parallax"\]/, 'the library has a Parallax thumbnail');
  assert.match(tokens, /body\[data-background-style="parallax"\][\s\S]*--ms-home-background:/, 'Simple receives the Parallax background via shared tokens');
  assert.match(home, /body\[data-background-style="parallax"\] \.home-bg::before[\s\S]*perspective\(/, 'Default has the perspective floor treatment');
  assert.match(modern, /body\[data-background-style="parallax"\] \.home::after[\s\S]*perspective\(/, 'Simple has the perspective floor treatment');
  assert.match(v3, /\.layers\{position:fixed;inset:0;overflow:hidden;pointer-events:none\}/, 'the 3D Parallax homepage retains its intrinsic depth stack');
  assert.match(read('src/home-v3.html'), /<div class="layers" aria-hidden="true">/, 'the selectable background does not replace the 3D homepage design');
  assert.match(read('src/renderer.html'), /15 defaults/, 'the built-in background count is up to date');
});

test('Simple Parallax background reuses the full 3D depth stack and only activates for the Parallax preset', () => {
  const html = read('src/home-v2.html');
  const css = read('src/home-parallax-background.css');
  const script = read('src/home-parallax-background.js');
  assert.match(html, /id="homeParallaxBackground"[^>]*hidden/);
  assert.match(html, /href="home-parallax-background\.css"/);
  assert.match(html, /src="home-parallax-background\.js"/);
  for (const layer of ['hp-grid3d', 'hp-orb--one', 'hp-ring--one', 'hp-cube--one', 'hp-triangle', 'hp-plus--one']) {
    assert.match(html, new RegExp(layer), `Simple has the 3D Parallax ${layer} background layer`);
  }
  assert.match(css, /body\[data-background-style="parallax"\] #launcherScreen\.home \{ background: transparent !important; \}/);
  assert.match(css, /perspective\(600px\) rotateX\(58deg\)/, 'uses the perspective floor from 3D Parallax');
  assert.match(script, /function isActive\(\) \{ return document\.body\.dataset\.backgroundStyle === 'parallax'; \}/);
  assert.match(script, /prefers-reduced-motion/);
  assert.match(script, /accentRgb\(\)/, 'particle color follows the active accent');
});

test('homepage readiness fallback is session-only and cannot overwrite the saved theme', () => {
  const bridge = read('src/home-page-switcher.js');
  assert.doesNotMatch(bridge, /RECOVERY_MIGRATION_KEY/);
  assert.doesNotMatch(bridge, /localStorage\.setItem\(STORAGE_KEY, 'legacy'\)/, "automatic fallback must not persist Default as the user's selection");
  assert.match(bridge, /forcedLegacyForSession = true/);
  assert.match(bridge, /selected mode in persistent storage/);
});

test('Simple is replaced by the Home v5 equal-app grid without changing the selector value', () => {
  const html = read('src/home-v2.html');
  const css = read('src/home-v5.css');
  const engine = read('src/home-v5.js');
  const pageBridge = read('src/home-v5-bridge.js');
  assert.match(html, /<title>Mad Station — Simple<\/title>/);
  assert.match(html, /href="design-tokens\.css"/);
  assert.match(html, /href="home-v5\.css"/);
  assert.match(html, /href="home-parallax-background\.css"/);
  assert.match(html, /src="appearance\.js"/);
  assert.match(html, /src="home-v5\.js"/);
  assert.match(html, /src="home-v5-bridge\.js"/);
  for (const id of ['launcherScreen', 'homeSearch', 'homeGreeting', 'homeDate', 'homeApps', 'homeCustomizeBtn', 'homeMenu', 'themeBtn', 'launcherSettingsBtn', 'homeToast', 'homeParallaxBackground']) {
    assert.match(html, new RegExp(`id="${id}"`), `Simple preserves ${id}`);
  }
  assert.match(engine, /id=\"launcherAccountCount\"/);
  assert.match(engine, /id=\"launcherProviderCount\"/);
  assert.match(css, /\.grid\s*\{[^}]*display:\s*grid/s, 'Home v5 renders all apps in a responsive grid');
  assert.match(css, /\.home\s*\{[^}]*overflow-y:\s*auto/s, 'the page scrolls naturally when more apps are added');
  assert.match(css, /\.bar\s*\{[^}]*top:\s*32px;[^}]*margin-top:\s*32px/s, 'the bar stays below native window controls with explicit top spacing');
  assert.match(css, /var\(--ms-home-background/);
  assert.match(css, /var\(--ms-home-panel-bg/);
  assert.match(css, /var\(--ms-home-control-bg/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(engine, /mad-home-v5-order/);
  assert.match(engine, /mad-home-v5-hidden/);
  assert.match(engine, /window\.MadHomeApps = \{ setLauncher/);
  assert.match(engine, /id: 'clipboard'/, 'Notes & Tasks remains available as an app tile');
  assert.match(engine, /id: 'system'.*extra: 'sys'/s, 'the system widget remains part of the grid');
  assert.match(pageBridge, /const CHANNEL = 'madstation-home-v2'/, 'Simple keeps the current, stable host channel');
  assert.match(pageBridge, /sendHost\('open-settings'\)/);
  assert.match(pageBridge, /sendHost\('toggle-theme'\)/);
  assert.match(pageBridge, /message\.type === 'appearance-settings'/);
  assert.match(pageBridge, /message\.type === 'memory-model'/);
  assert.match(pageBridge, /message\.type === 'host-ping'/);
});

test('Simple preserves independent app order/visibility and respects shared reduced-motion and background settings', () => {
  const html = read('src/home-v2.html');
  const css = read('src/home-v5.css');
  const engine = read('src/home-v5.js');
  const backgroundCss = read('src/home-parallax-background.css');
  assert.match(engine, /const K_ORDER = 'mad-home-v5-order', K_HIDDEN = 'mad-home-v5-hidden'/);
  assert.match(engine, /save\(K_ORDER, order\(\)\)/);
  assert.match(engine, /save\(K_HIDDEN, \[\.\.\.h\]\)/);
  assert.match(css, /body\[data-background-style\]:not\(\[data-background-style="plain"\]\) \.home/);
  assert.match(css, /body\.no-hover-animation/);
  assert.match(css, /body\.reduce-motion/);
  assert.match(backgroundCss, /body\[data-background-style="parallax"\]/);
  assert.match(html, /href="home-parallax-background\.css"/);
  assert.match(html, /src="home-parallax-background\.js"/);
});


test('removed homepages are absent from the runtime and preview registry', () => {
  const html = read('src/renderer.html');
  const host = read('src/home-page-switcher.js');
  const controls = read('src/renderer-react/appearance-controls.tsx');
  const renderer = read('src/renderer.js');
  for (const token of ['launcherSimpleBigAppScreen', 'launcherNeonCyberpunkScreen', 'home-simple-big-app.html', 'home-neon-cyberpunk.html']) {
    assert.doesNotMatch(html, new RegExp(token));
  }
  for (const token of ['simple-big-app', 'neon-cyberpunk']) {
    assert.doesNotMatch(host, new RegExp(token));
    assert.doesNotMatch(renderer, new RegExp(token));
    assert.doesNotMatch(controls, new RegExp(token));
  }
});


test('main-screen Quick Access provides Day/Night without seasonal controls while accent remains in Appearance settings', () => {
  const html = read('src/renderer.html');
  const host = read('src/home-page-switcher.js');
  const appearance = read('src/appearance.js');
  const renderer = read('src/renderer.js');
  const css = read('src/styles.css');
  assert.match(html, /id="homeQuickControlsButton"/);
  assert.match(html, /id="homeQuickControlsMenu"[\s\S]*id="homeStyleQuickOptions"/);
  assert.match(html, /id="homeDayNightToggle"/);
  assert.match(html, /id="homeQuickSettingsButton"/);
  assert.doesNotMatch(html, /homeSeasonQuickGroup|data-home-season/, 'main-screen Quick Access never renders seasonal controls');
  assert.match(read('src/home-parallax-jungle.html'), /class="season-controls"[\s\S]*id="seas"/, 'season controls remain native to the Parallax Jungle homepage');
  assert.doesNotMatch(html, /data-home-accent|home-quick-accent/, 'Quick Access no longer contains accent controls');
  assert.match(html, /id="accentOptions"[\s\S]*data-accent-choice="blue"/, 'the main Settings Appearance accent picker remains available');
  assert.match(renderer, /madstation:appearance-accent/, 'main Settings still persists accent selections');
  assert.match(host, /const VALID_SEASONS = \['spring', 'summer', 'autumn', 'winter'\]/, 'the host validates season updates coming only from Jungle');
  assert.match(host, /function persistSeason\(season, \{ preserveRotation = false \} = \{\}\)/);
  assert.match(host, /getMode\(\) !== 'parallax-jungle' \|\| !VALID_SEASONS\.includes\(season\)/, 'season persistence is guarded to Parallax Jungle');
  assert.doesNotMatch(host, /homeSeasonQuickGroup|data-home-season/, 'the host Quick Access controller contains no season-control wiring');
  assert.match(host, /if \(mode === 'parallax-jungle'\) settings\.season = getSeason\(\)/, 'only Jungle receives season state');
  const qaStateStart = host.indexOf("sendToFrame(mode, 'quick-access-state'");
  const qaStateEnd = host.indexOf("sendToFrame(mode, 'quick-access-theme-catalog'", qaStateStart);
  assert.doesNotMatch(host.slice(qaStateStart, qaStateEnd), /season:/, 'season state is not sent to shared Quick Access controls');
  assert.match(host, /preserveNativeAccent: true/);
  assert.match(host, /delete settings\.accent/, 'the saved accent is not sent to themed launchers');
  assert.match(appearance, /if \(!preserveNativeAccent\)/, 'native launcher palettes are not overwritten by the global accent');
  assert.match(host, /madstation:appearance-theme-mode/);
  assert.match(host, /window\.dispatchEvent\(new CustomEvent\('madstation:appearance-theme-mode'/, 'theme changes from any homepage reach the main Appearance controller');
  assert.match(host, /openSettings\('appearance', 'global'\)/);
  assert.doesNotMatch(html, /homeSeasonOverlay/, 'no host-level seasonal overlay is rendered');
  assert.doesNotMatch(css, /homeSeasonOverlay|home-season-overlay|home-season-options/, 'legacy host seasonal UI styling is removed');
  assert.match(css, /#homeStyleQuickAccess \{ z-index: 60 !important; \}/);
  assert.match(css, /#homeStyleTransitionCurtain \{ z-index: 70 !important; \}/);
});

test('the global accent is scoped to Default and workspace apps while themed launchers keep native colors', () => {
  const host = read('src/home-page-switcher.js');
  const css = read('src/styles.css');
  const homeCss = read('src/home.css');
  const simpleCss = read('src/home-v5.css');
  const chromeCss = read('src/home-style-chrome.css');
  const bridge = read('src/home-style-settings-bridge.js');
  const appearance = read('src/appearance.js');
  const html = read('src/renderer.html');
  const renderer = read('src/renderer.js');
  const jungle = read('src/home-parallax-jungle.html');

  assert.match(jungle, /id="seas"[^>]*role="group"|id="seas"/, 'Jungle owns its season picker markup');
  assert.doesNotMatch(css, /button\[data-home-season=/, 'host styling contains no Quick Access season buttons');
  assert.match(appearance, /root\.style\.setProperty\(`--accent-preset-\$\{name\}`, palette\[resolved\]\[0\]\)/, 'global accent presets remain owned by Appearance');
  assert.match(html, /id="accentOptions"[\s\S]*data-accent-choice="blue"/, 'main Appearance retains the accent picker');
  assert.match(renderer, /madstation:appearance-accent/, 'main Appearance still updates the global accent');
  assert.doesNotMatch(html, /data-home-accent|home-quick-accent/, 'the launcher Quick Access markup has no accent controls');
  assert.doesNotMatch(css, /home-quick-accent/, 'the launcher Quick Access stylesheet has no accent swatches');
  assert.match(host, /preserveNativeAccent: true/);
  assert.match(host, /delete settings\.accent/, 'accent is removed from themed-homepage appearance messages');
  assert.match(appearance, /if \(!preserveNativeAccent\)/, 'the shared appearance applier preserves each launcher native accent');
  assert.match(bridge, /const preserveNativeAccent = settings\.preserveNativeAccent === true/);
  assert.match(bridge, /!preserveNativeAccent && safeColor\(palette\['--accent'\]\)/, 'the homepage bridge does not override native accent aliases');
  assert.match(host, /option\.append\(label, check\)/, 'theme list uses compact text rows without preview thumbnails');
  assert.doesNotMatch(host, /thumb\.className = `home-style-quick-thumb/, 'theme preview thumbnails are omitted from Quick Access');
  assert.doesNotMatch(css, /home-style-quick-thumb/, 'unused theme preview artwork is removed from Quick Access styling');
  assert.match(css, /\.home-style-quick-menu\.home-quick-controls-menu \{[\s\S]*?width: min\(260px, calc\(100vw - 16px\)\);[\s\S]*?max-height: min\(78vh, 600px\);/, 'Quick Access uses a compact, readable panel with bounded height');
  assert.match(simpleCss, /--v5-accent: var\(--accent,/);
  for (const [name, themeCss] of [['Default', homeCss], ['Simple', simpleCss], ['shared theme chrome', chromeCss]]) {
    assert.doesNotMatch(themeCss, /data-season|data-home-season|home-season-accent|v5-season-|sba-season-/, `${name} no longer has seasonal styling`);
  }
  assert.match(bridge, /if \(filename === 'home-parallax-jungle\.html'\)/, 'only Parallax Jungle can receive season changes');
  assert.match(bridge, /delete document\.body\.dataset\.season/);
  assert.match(host, /if \(mode === 'parallax-jungle' && typeof message\.season === 'string'/, 'season-change messages are accepted only from Jungle');
  assert.doesNotMatch(css, /home-season-drift|home-season-glow|home-season-sun/, 'no host-level seasonal motion or overlays are introduced');
  assert.match(homeCss, /body\[data-background-style="custom"\]/, 'Default still uses the configured Appearance background');

  assert.match(jungle, /button\[data-k="0"\]\{--season-pill:#35a653\}/, 'Jungle Spring quick access remains green');
  assert.match(jungle, /lB: \[87, 190, 94\].*e1: \[76, 184, 76\]/, 'Jungle Spring foliage remains green rather than pink');
});

test('all isolated homepage styles load the shared accent and Day/Night bridge, with season handling scoped to Jungle', () => {
  const pages = [
    ['home-v2.html', 'simple'],
    ['home-retro.html', 'retro'], ['home-retro-complex.html', 'retro-complex'],
    ['home-v3.html', 'parallax'], ['home-v4.html', 'parallax-big'],
    ['home-galaxy.html', 'galaxy'], ['home-parallax-jungle.html', 'parallax-jungle'],
    ['home-claymorphism.html', 'claymorphism'], ['home-glass.html', 'glass'], ['home-isometric-world.html', 'isometric-world'],
  ];
  const sharedBridge = read('src/home-style-settings-bridge.js');
  const sharedChrome = read('src/home-style-chrome.css');
  for (const [page, style] of pages) {
    const html = read(`src/${page}`);
    assert.match(html, new RegExp(`data-home-style="${style}"`), `${style} identifies its own layout`);
    assert.match(html, /home-style-settings-bridge\.js/);
    assert.match(html, /home-style-chrome\.css/);
  }
  assert.match(sharedBridge, /validSeasons = new Set\(\['spring', 'summer', 'autumn', 'winter'\]\)/);
  assert.match(sharedBridge, /if \(filename === 'home-parallax-jungle\.html'\)/);
  assert.match(sharedBridge, /delete document\.body\.dataset\.season/);
  assert.match(sharedBridge, /setProperty\('--host-accent', accent\)/);
  assert.match(sharedBridge, /type: 'toggle-theme'/);
  assert.match(sharedChrome, /#themeBtn:not\(\[data-theme-quick-trigger\]\) \{ display: none !important; visibility: hidden !important; pointer-events: none !important; \}/, 'per-theme Day/Night buttons are hidden in favour of the main-screen quick access');
  assert.doesNotMatch(sharedChrome, /#launcherSettingsBtn \{ position:/, 'the shared chrome styles never overwrite theme-native positioning');
  const galaxy = read('src/home-galaxy.html');
  assert.match(galaxy, /themeButton\.id = 'themeBtn'/, 'Galaxy has an independent Day/Night control');
  assert.match(galaxy, /sun\.id = 'launcherSettingsBtn'/, 'Galaxy Settings remains independent');
});

test('every homepage uses a proper Settings gear and hides its duplicate header Day/Night control', () => {
  const pages = [
    'home-v2.html', 'home-retro.html', 'home-retro-complex.html',
    'home-v3.html', 'home-v4.html', 'home-galaxy.html', 'home-parallax-jungle.html',
    'home-claymorphism.html', 'home-glass.html', 'home-isometric-world.html',
  ];
  const chrome = read('src/home-style-chrome.css');
  const gear = /M19\.4 15a1\.7 1\.7 0 0 0 \.3 1\.9/;
  assert.match(chrome, /#themeBtn:not\(\[data-theme-quick-trigger\]\) \{ display: none !important; visibility: hidden !important; pointer-events: none !important; \}/,
    'the legacy in-page toggle stays hidden and main-screen quick controls remain the only visible Day/Night control');
  for (const page of pages) {
    const html = read(`src/${page}`);
    if (page === 'home-galaxy.html') {
      assert.match(html, new RegExp(`const GEAR = '[^']*${gear.source}`), 'Galaxy creates Settings with a real gear icon');
      assert.match(html, /themeButton\.id = 'themeBtn'/, 'Galaxy retains its legacy Day/Night target for the host Appearance controls');
      continue;
    }
    const button = html.match(/<button\b(?=[^>]*\bid="launcherSettingsBtn")[^>]*>[\s\S]*?<\/button>/)?.[0];
    assert.ok(button, `${page} has a Settings action`);
    if (page === 'home-retro-complex.html') {
      assert.match(button, /analog-settings[\s\S]*settings-dial/, 'Retro Complex uses the analog monitor dial for Settings');
      assert.doesNotMatch(button, />Settings<\/button>/, 'Retro Complex does not put the word Settings in the middle of the dial');
    } else if (button.includes('<svg')) assert.match(button, gear, `${page} uses a gear rather than a sun-like icon`);
    else assert.match(button, />Settings<\/button>/, `${page} keeps its textual Settings action`);
  }
});

test('homepage transition waits for the new frame, restarts the reveal animation, and respects reduced motion', () => {
  const host = read('src/home-page-switcher.js');
  const css = read('src/styles.css');
  assert.match(host, /function showTransitionCurtain\(\)/);
  assert.match(host, /Let the veil fully cover the outgoing page before deferred iframe startup/);
  assert.match(host, /transition\.phase === 'revealing' \|\| transition\.phase === 'settling'/);
  assert.match(host, /Restart at the readiness boundary, not during a slow iframe's blank\/loading phase/);
  assert.match(host, /incoming\?\.classList\.add\('home-style-transition-enter'\)/);
  assert.match(host, /hideTransitionCurtain\(\)/);
  assert.match(host, /reducedMotionRequested\(\) \? 0 : 640/);
  assert.match(css, /\.home-style-transition-curtain\.is-covering/);
  assert.match(css, /body\[data-workspace-app\]:not\(\[data-workspace-app="launcher"\]\) #homeStyleTransitionCurtain/);
});


test('Quick Access is native to each homepage header, uses theme-specific styling, and sends actions to the host', () => {
  const host = read('src/home-page-switcher.js');
  const legacyHtml = read('src/renderer.html');
  const themeCss = read('src/home-quick-access-theme.css');
  const themeScript = read('src/home-quick-access-theme.js');
  const pages = [
    ['home-v2.html', 'simple'], ['home-v3.html', 'parallax'], ['home-retro.html', 'retro'],
    ['home-retro-complex.html', 'retro-complex'], ['home-v4.html', 'parallax-big'],
    ['home-galaxy.html', 'galaxy'], ['home-parallax-jungle.html', 'parallax-jungle'],
    ['home-claymorphism.html', 'claymorphism'], ['home-glass.html', 'glass'], ['home-isometric-world.html', 'isometric-world'],
  ];
  assert.match(legacyHtml, /<div class="home-topbar-actions"[\s\S]*?id="homeStyleQuickAccess"[\s\S]*?id="launcherSettingsBtn"/, 'legacy Quick Access is a real child of the existing topbar action row');
  assert.match(host, /quickAccess\.hidden = !isLegacyHeader/, 'the host no longer floats a duplicate button over theme pages');
  assert.doesNotMatch(host, /headerActionGroup\.insertBefore\(slot, settingsTarget\)/, 'theme pages do not receive injected placeholder slots');
  assert.match(host, /message\.type === 'set-homepage'/, 'theme-local UI can request a validated homepage change');
  assert.doesNotMatch(host, /message\.type === 'set-accent'/, 'Quick Access no longer accepts accent changes');
  assert.match(host, /sendToFrame\(mode, 'quick-access-state'/, 'the host sends homepage and appearance state to the local control');
  assert.doesNotMatch(host.slice(host.indexOf("sendToFrame(mode, 'quick-access-state'"), host.indexOf("sendToFrame(mode, 'quick-access-theme-catalog'")), /accent:/, 'Quick Access state contains no accent selection');
  assert.match(themeScript, /data-theme-quick-access/);
  assert.match(themeScript, /postMessage\(\{ channel, type, \.\.\.detail \}/, 'the page-local control talks to the host through its own validated channel');
  assert.match(themeScript, /data-qa-style/);
  assert.doesNotMatch(themeScript, /data-qa-accent|set-accent|applyPageAccent/, 'theme Quick Access does not expose accent controls');
  assert.doesNotMatch(themeScript, /data-qa-season|set-season|season:/, 'shared Quick Access has no seasonal controls or season-state handling');
  assert.doesNotMatch(themeCss, /mqa-season-option|mqa-seasons/, 'shared Quick Access CSS has no seasonal selectors');
  assert.match(themeCss, /body\[data-home-style="simple"\][\s\S]*?body\[data-home-style="parallax"\][\s\S]*?body\[data-home-style="retro"\]/, 'Simple, Parallax and Retro have distinct native treatments');
  for (const [page, style] of pages) {
    const html = read(`src/${page}`);
    assert.equal((html.match(/data-theme-quick-access/g) || []).length, 1, `${page} has one header-local Quick Access component`);
    assert.match(html, /home-quick-access-theme\.css/);
    assert.match(html, /home-quick-access-theme\.js/);
    assert.match(html, new RegExp(`data-qa-skin="${style}"`));
    assert.match(html, /data-theme-quick-trigger/);
    assert.match(html, /data-theme-quick-menu/);
    if (page !== 'home-galaxy.html') assert.ok(html.indexOf('data-theme-quick-access') < html.indexOf('id="launcherSettingsBtn"'), `${page} puts Quick Access beside Settings in the header/action rail`);
  }
});


test('all isolated homepage Quick Access menus receive the live theme catalogue', () => {
  const host = read('src/home-page-switcher.js');
  const quickAccess = read('src/home-quick-access-theme.js');
  for (const [file, channel] of [
    ['src/home-v2.html', 'home-quick-access-theme.js'],
    ['src/home-retro.html', 'home-quick-access-theme.js'],
    ['src/home-retro-complex.html', 'home-quick-access-theme.js'],
    ['src/home-v3.html', 'home-quick-access-theme.js'],
    ['src/home-v4.html', 'home-quick-access-theme.js'],
    ['src/home-galaxy.html', 'home-quick-access-theme.js'],
    ['src/home-parallax-jungle.html', 'home-quick-access-theme.js'],
    ['src/home-claymorphism.html', 'home-quick-access-theme.js'],
    ['src/home-glass.html', 'home-quick-access-theme.js'],
    ['src/home-isometric-world.html', 'home-quick-access-theme.js'],
  ]) assert.match(read(file), new RegExp(channel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(host, /quick-access-theme-catalog/);
  assert.match(host, /HOMEPAGE_STYLE_OPTIONS\.map\(\(\{ id, label \}\) => \(\{ id, label \}\)\)/);
  assert.match(quickAccess, /function normalizeStyles\(value\)/);
  assert.match(quickAccess, /message\.type === 'quick-access-theme-catalog'/);
  assert.match(quickAccess, /renderThemeOptions\(\)/);
  assert.match(quickAccess, /label\.textContent = item\.label/, 'imported labels are inserted as text, not executable HTML');
});


test('debug mode disables the blur curtain and has a watchdog against a stuck theme transition', () => {
  const host = read('src/home-page-switcher.js');
  const debugCss = read('src/developer-visual-debug.css');
  assert.match(host, /function debugModeIsActive\(\)/);
  assert.match(host, /!debugModeIsActive\(\) && previous !== next/);
  assert.match(host, /curtainSafetyTimer = setTimeout\([\s\S]*?2600\)/);
  assert.match(host, /hideTransitionCurtain\(\{ immediate: true \}\)/);
  assert.match(debugCss, /html\.ms-dev-debug-enabled \.home-style-transition-curtain[\s\S]*?display: none !important/);
  assert.match(debugCss, /html\.ms-dev-debug-enabled \.home-style-transition-enter[\s\S]*?animation: none !important/);
});

test('Galaxy has no theme-local search bar and keeps Quick Access clear of native window controls', () => {
  const quickCss = read('src/home-quick-access-theme.css');
  const topbarCss = read('src/home-topbar-theme.css');
  const chromeCss = read('src/home-style-chrome.css');
  const galaxy = read('src/home-galaxy.html');
  assert.doesNotMatch(galaxy, /cmdk|cmdBtn|id="palette"|id="palInput"|openPal\s*\(/i);
  assert.match(galaxy, /class="madstation-theme-quick-access" data-theme-quick-access data-qa-skin="galaxy"/);
  assert.match(quickCss, /body\[data-home-style="galaxy"\] \.madstation-theme-quick-access\s*\{[^}]*top:\s*var\(--home-window-chrome-height,\s*42px\)\s*!important;[^}]*right:\s*clamp\(14px,3vw,40px\)/);
  assert.doesNotMatch(topbarCss, /body\[data-home-style="galaxy"\][^{]*\.cmdk?/);
  assert.doesNotMatch(chromeCss, /body\[data-home-style="galaxy"\][^{]*\.cmdk?/);
  assert.match(chromeCss, /:root\s*\{\s*--home-window-chrome-height:\s*42px;/);
});

test('3D Parallax app tile hover motion and highlight are intentionally subtle', () => {
  const script = read('src/home-v3.js');
  const css = read('src/home-v3.css');
  assert.match(script, /\(x - \.5\) \* 6 \+ 'deg'/, 'tile tilt is reduced from the previous 14-degree multiplier');
  assert.match(script, /\(\.5 - y\) \* 6 \+ 'deg'/);
  assert.match(script, /\(x - \.5\) \* 1\); t\.style\.setProperty\('--dy', \(y - \.5\) \* 1\)/, 'inner parallax offsets are reduced');
  assert.match(css, /body\[data-home-style="parallax"\] \.tile:hover\s*\{[^}]*34px -24px color-mix\(in srgb, var\(--h\) 17%, transparent\)/);
  assert.match(css, /body\[data-home-style="parallax"\] \.tile:hover::after\s*\{\s*opacity:\s*\.72;/);
  assert.match(css, /body\[data-home-style="parallax"\] \.tile \.ico\s*\{\s*translate:\s*calc\(var\(--dx\) \* 4px\) calc\(var\(--dy\) \* 4px\)/);
});

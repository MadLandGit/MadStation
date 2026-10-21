const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('3D Parallax Big App is an isolated homepage option, preserving all other choices', () => {
  const html = read('src/renderer.html');
  const picker = read('src/renderer-react/appearance-controls.tsx');
  assert.match(html, /id="homepageStyles"/);
  assert.doesNotMatch(html, /homePageVersionSelect|home-page-choice-card/);
  for (const [value, label] of [['v2','Simple'],['retro','Simple Retro'],['retro-complex','Retro Complex'],['parallax','3D Parallax'],['parallax-big','3D Parallax Big App'],['galaxy','Galaxy'],['parallax-jungle','Parallax Jungle'],['claymorphism','Claymorphism'],['glass','Glass'],]) {
    assert.ok(picker.includes(`id: '${value}', label: '${label}'`), `${label} is selectable in Themes`);
  }
  assert.match(html, /id="launcherParallaxBigScreen"[^>]*data-home-src="home-v4\.html"[^>]*data-home-unload-inactive="true"/);
  assert.doesNotMatch(html.match(/<iframe id="launcherParallaxBigScreen"[^>]*>/)?.[0] || '', /\ssrc=/, 'inactive homepage is not loaded eagerly');
  const switcher = read('src/home-page-switcher.js');
  assert.match(switcher, /'parallax-big': \{ frame: document\.getElementById\('launcherParallaxBigScreen'\), channel: 'madstation-home-parallax-big' \}/);
  assert.match(switcher, /Object\.prototype\.hasOwnProperty\.call\(FRAMES, value\)/, 'registered homepage modes remain valid through the centralized frame registry');
  assert.match(switcher, /'parallax-big': false/);
});

test('Big App page uses strict local-only CSP and external token, style, engine, and bridge files', () => {
  const html = read('src/home-v4.html');
  assert.match(html, /script-src 'self'; style-src 'self'/);
  assert.match(read('src/renderer.html'), /frame-src 'self' file:/); // Parent renderer allows only the app's own local frames.
  assert.match(html, /href="design-tokens\.css"/);
  assert.match(html, /href="home-v4\.css"/);
  assert.match(html, /src="appearance\.js"/);
  assert.match(html, /src="home-v4\.js"/);
  assert.match(html, /src="home-v4-bridge\.js"/);
  assert.doesNotMatch(html, /<style\b/i);
  assert.doesNotMatch(html, /<script\s*>/i);
  assert.doesNotMatch(html, /\sstyle=/i);
});

test('Big App interactions stay connected to Mad Station and retain independent v8 layout preferences', () => {
  const engine = read('src/home-v4.js');
  const bridge = read('src/home-v4-bridge.js');
  const host = read('src/home-page-switcher.js');
  for (const id of ['ai-hub', 'instruction-forge', 'ai-lab', 'video-hub', 'image-hub', 'clipboard']) {
    assert.ok(engine.includes(`id: '${id}'`), `home can present ${id}`);
  }
  assert.match(engine, /const K_ORDER = 'mad-home-v8-order', K_HIDDEN = 'mad-home-v8-hidden', K_MAIN = 'mad-home-v8-main'/);
  assert.match(engine, /window\.MadHome\.setMain = setMain/);
  assert.match(engine, /window\.MadHome\.getMain = \(\) => main/);
  assert.match(bridge, /CHANNEL = 'madstation-home-parallax-big'/);
  assert.match(bridge, /window\.MadHomeApps\?\.setLauncher/);
  assert.match(bridge, /sendHost\('launch', \{ target \}\)/);
  assert.match(bridge, /launcherSettingsBtn.*sendHost\('open-settings'\)/s);
  assert.match(bridge, /sendHost\('toggle-theme'\)/);
  assert.match(bridge, /message\.type === 'stats'/);
  assert.match(bridge, /message\.type === 'memory-model'/);
  assert.match(host, /'parallax-big': \{ frame: document\.getElementById\('launcherParallaxBigScreen'\), channel: 'madstation-home-parallax-big' \}/);
  assert.match(host, /ALLOWED_TARGETS\.has\(target\)/);
});

test('Big App consumes shared Appearance palette, background, surface, shape, and motion settings', () => {
  const css = read('src/home-v4.css');
  const engine = read('src/home-v4.js');
  const bridge = read('src/home-v4-bridge.js');
  assert.match(css, /--s1:var\(--ms-home-panel-bg,var\(--surface\)\)/);
  assert.match(css, /--edge:var\(--ms-home-panel-border,var\(--line\)\)/);
  assert.match(css, /background:var\(--ms-home-background,var\(--bg\)\)/);
  assert.match(css, /--c1:var\(--accent\)/);
  assert.match(css, /var\(--ms-home-control-radius/);
  assert.match(css, /var\(--ms-home-primary-bg/);
  assert.match(bridge, /window\.applyAppearance\?\.\(message\.settings\)/);
  assert.match(bridge, /window\.MadHome\?\.refreshMotion\?\.\(\)/);
  assert.match(engine, /function refreshMotion\(\)/);
  assert.match(engine, /if \(document\.hidden \|\| reduce\(\)\) return/);
});


test('Parallax Big App header actions use theme card surfaces and semantic outline icons', () => {
  const chrome = read('src/home-topbar-theme.css');
  const bigApp = chrome.slice(chrome.indexOf('body[data-home-style="parallax-big"] #homeCustomizeBtn,'), chrome.indexOf('/* Jungle\'s selector'));
  assert.match(bigApp, /background: linear-gradient\(165deg, var\(--s1\), color-mix\(in srgb, var\(--s1\) 78%, var\(--bg\)\)\)/);
  assert.match(bigApp, /border: 1px solid var\(--ms-home-panel-border, var\(--edge, var\(--line\)\)\)/);
  assert.match(bigApp, /fill: none;[\s\S]*?stroke: currentColor;[\s\S]*?stroke-width: 1\.8/);
  assert.doesNotMatch(bigApp, /fill: currentColor;\s*stroke: none/);
});

test('Parallax Big App uses a bounded top card with a gap under the native title bar', () => {
  const chrome = read('src/home-style-chrome.css');
  assert.match(chrome, /body\[data-home-style="parallax-big"\] \.top \{[\s\S]*?top: var\(--home-window-chrome-height\) !important;[\s\S]*?margin-top: var\(--home-window-chrome-height\) !important;[\s\S]*?padding-top: 14px !important;[\s\S]*?width: min\(1280px, calc\(100% - 32px\)\);/);
});

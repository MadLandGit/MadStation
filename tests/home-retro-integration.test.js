const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Simple Retro is registered as an isolated homepage without replacing existing styles', () => {
  const html = read('src/renderer.html');
  assert.match(html, /id="launcherRetroScreen"[^>]*data-home-src="home-retro\.html"[^>]*data-home-unload-inactive="true"/);
  assert.doesNotMatch(html.match(/<iframe id="launcherRetroScreen"[^>]*>/)?.[0] || '', /\ssrc=/, 'inactive homepage is not loaded eagerly');
  const switcher = read('src/home-page-switcher.js');
  assert.match(switcher, /retro: \{ frame: document.getElementById\('launcherRetroScreen'\), channel: 'madstation-home-simple-retro' \}/);
  assert.match(switcher, /Object\.prototype\.hasOwnProperty\.call\(FRAMES, value\)/, 'registered homepage modes remain valid through the centralized frame registry');
  assert.match(read('src/styles.css'), /#launcherRetroScreen\.home-retro-frame/);
  const picker = read('src/renderer-react/appearance-controls.tsx');
  for (const [value, label] of [['v2','Simple'],['retro','Simple Retro'],['retro-complex','Retro Complex'],['parallax','3D Parallax'],['parallax-big','3D Parallax Big App'],['galaxy','Galaxy'],['parallax-jungle','Parallax Jungle'],['claymorphism','Claymorphism'],['glass','Glass'],]) {
    assert.ok(picker.includes(`id: '${value}', label: '${label}'`), `${label} appears in Themes`);
  }
});

test('Simple Retro uses the reference design with isolated app storage and secure host routing', () => {
  const html = read('src/home-retro.html');
  const bridge = read('src/home-retro-bridge.js');
  assert.match(html, /body data-ph="accent" data-home-isolated="true"/);
  assert.match(html, /mad-retro-main/);
  assert.match(html, /mad-retro-order/);
  assert.match(html, /<script src="appearance\.js"><\/script>/);
  assert.match(html, /<script src="home-retro-bridge\.js"><\/script>/);
  assert.match(bridge, /const CHANNEL = 'madstation-home-simple-retro'/);
  assert.match(bridge, /window\.MadHomeApps\?\.setLauncher\?\./);
  assert.match(bridge, /sendHost\('launch', \{ target \}\)/);
  assert.match(bridge, /sendHost\('open-settings'\)/);
  assert.match(bridge, /window\.applyAppearance\?\./);
  assert.match(bridge, /applyHostAppearance/);
  assert.match(bridge, /event\.source !== window\.parent/);
  assert.match(bridge, /home-ready/);
  assert.match(html, /id="launcherSettingsBtn"/);
  assert.match(html, /data-ph="accent"/);
  assert.match(html, /background:var\(--ms-home-background,var\(--bg\)\)/, 'Retro uses the shared Appearance background tokens');
  assert.match(html, /body\.style\.colorScheme = effectiveTheme/, 'native controls follow the host Light/Dark/System mode');
});

test('Simple Retro retains app launch, tile-based main selection, telemetry, parallax visuals, and reduced-motion integration', () => {
  const html = read('src/home-retro.html');
  assert.match(html, /function launch\(id\)/);
  assert.match(html, /function setMain\(id\)/);
  assert.match(html, /mad:memory-model/);
  assert.match(html, /function setSys\(m\)/);
  assert.doesNotMatch(html, /id="mainBtn"|id="menu"|buildMenu\(/, 'the redundant header Change Main selector is removed; app tiles remain the main-selection surface');
  assert.match(html, /class="star"|class="tile-star"|Change main app/i, 'app tiles retain a way to choose the main app');
  assert.doesNotMatch(html, /id="phBtn"|Screen:/, 'the legacy phosphor selector is removed; Appearance owns the accent');
  assert.match(html, /PH = accent;/, 'the phosphor visuals follow the shared Appearance accent');
  assert.doesNotMatch(html, /setPh|mad-retro-ph|press T to change screen colour/);
  assert.match(html, /body\.reduce-motion/);
  assert.match(html, /window\.MadRetroAppearance = \{ applyHostAppearance, refreshMotion: startMotion \}/);
});

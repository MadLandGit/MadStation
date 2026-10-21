const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('3D Parallax is a real isolated homepage using local project assets and the shared appearance system', () => {
  const html = read('src/home-v3.html');
  assert.match(html, /data-home-isolated="true"/);
  assert.match(html, /href="design-tokens\.css"/);
  assert.match(html, /href="home-v3\.css"/);
  assert.match(html, /src="appearance\.js"/);
  assert.match(html, /src="home-v3\.js"/);
  assert.match(html, /src="home-v3-bridge\.js"/);
  assert.match(html, /default-src 'none'; script-src 'self'; style-src 'self'/);
  assert.doesNotMatch(html, /<style[ >]|<script>\s*[\s\S]*?window\./, 'the homepage does not need inline scripts/styles');
});

test('3D Parallax app tiles route through the host allowlist and global Settings', () => {
  const home = read('src/home-v3.js');
  const child = read('src/home-v3-bridge.js');
  const host = read('src/home-page-switcher.js');
  for (const target of ['ai-hub', 'instruction-forge', 'ai-lab', 'video-hub', 'image-hub', 'clipboard']) {
    assert.ok(home.includes(`id: '${target}'`), `${target} tile exists`);
    assert.ok(host.includes(`'${target}'`), `${target} is permitted by the host`);
  }
  assert.match(child, /MadHomeApps\?\.setLauncher\?\.\(\(target\) =>/);
  assert.match(child, /sendHost\('launch', \{ target \}\)/);
  assert.match(child, /addEventListener\('click', \(\) => sendHost\('open-settings'\)\)/);
  assert.match(host, /openSettings\('appearance', 'global'\)/);
  assert.match(child, /sendHost\('toggle-theme'\)/, 'the bridge retains the host theme-mode action');
  assert.match(host, /madstation:appearance-theme-mode/);
  const html = read('src/home-v3.html');
  assert.match(html, /id="themeBtn"/, 'the legacy Day/Night target remains available to the host appearance controls');
  assert.match(read('src/home-style-chrome.css'), /#themeBtn:not\(\[data-theme-quick-trigger\]\) \{ display: none !important;/, 'the legacy Day / Night target is hidden while Quick Access owns the visible theme control');
  assert.match(html, /id="launcherSettingsBtn"/, 'Settings remains a separate header action');
  assert.match(html, /href="home-style-chrome\.css"/);
  assert.match(html, /src="home-style-settings-bridge\.js"/);
});

test('3D Parallax receives Appearance, AI Hub counts, and real memory/CPU telemetry instead of demo values in-app', () => {
  const child = read('src/home-v3-bridge.js');
  const home = read('src/home-v3.js');
  const host = read('src/home-page-switcher.js');
  assert.match(child, /message\.type === 'appearance-settings'/);
  assert.match(child, /window\.applyAppearance\?\.\(settings\)/);
  assert.doesNotMatch(child, /refreshMotion\s*=\s*\(\)\s*=>\s*\{\}/, 'the bridge must preserve the parallax motion controller');
  assert.match(child, /message\.type === 'memory-model'/);
  assert.match(child, /message\.type === 'stats'/);
  assert.match(home, /data-stat="accounts"/);
  assert.match(home, /data-stat="providers"/);
  assert.match(home, /if \(!window\.MadHome\.inApp\)/);
  assert.match(host, /hostPalette: readHostPalette\(\)/);
  assert.match(host, /ALLOWED_MEMORY_ACTIONS\.has\(message\.action\)/);
});

test('3D Parallax uses independent saved layout keys and preserves interactive accessibility/motion contracts', () => {
  const home = read('src/home-v3.js');
  const css = read('src/home-v3.css');
  assert.match(home, /mad-home-v7-order/);
  assert.match(home, /mad-home-v7-hidden/);
  assert.match(home, /aria-label.*Enter to open, Alt plus arrow keys to move/);
  assert.match(home, /prefers-reduced-motion/);
  assert.match(css, /var\(--ms-home-background/);
  assert.match(css, /var\(--ms-home-panel-bg/);
  assert.match(css, /var\(--ms-home-panel-border/);
  assert.doesNotMatch(css, /\.cmdk?\s*\{/, 'the removed theme-local search bar has no style rule');
  assert.match(css, /\.chip\{[^}]*height:34px[^}]*border-radius:999px[^}]*background:var\(--glass\)/, 'clock, RAM and CPU use reference capsule chips');
  assert.match(css, /\.icon\{[^}]*width:38px;height:38px[^}]*border-radius:12px[^}]*background:var\(--glass\)/, 'customize and Settings use reference icon buttons');
  assert.match(css, /var\(--ms-home-module-gap/);
  assert.match(css, /body\.reduce-motion/);
  assert.match(css, /body\.no-hover-animation/);
});


test('Parallax and Parallax Big App headers stay clear of native window controls', () => {
  const chrome = read('src/home-style-chrome.css');
  assert.match(chrome, /body\[data-home-style="parallax"\] \.top \{[\s\S]*?top: var\(--home-window-chrome-height\) !important;[\s\S]*?margin-top: var\(--home-window-chrome-height\) !important;/);
  assert.match(chrome, /body\[data-home-style="parallax-big"\] \.top \{[\s\S]*?width: min\(1280px, calc\(100% - 32px\)\);/);
});


test('3D Parallax Live System aligns with the app tiles on desktop without extra gap on stacked layouts', () => {
  const css = read('src/home-v3.css');
  assert.match(css, /body\[data-home-style="parallax"\] \.side\{margin-top:36px\}/, 'the Live System card is offset below the Apps section heading to align with the first app tile');
  assert.match(css, /body\[data-home-style="parallax"\]\[data-border-spacing="compact"\] \.side\{margin-top:30px\}/, 'compact section spacing keeps the card aligned');
  assert.match(css, /body\[data-home-style="parallax"\]\[data-border-spacing="spacious"\] \.side\{margin-top:42px\}/, 'spacious section spacing keeps the card aligned');
  assert.match(css, /@media\(max-width:1060px\)[\s\S]*?body\[data-home-style="parallax"\] \.side\{margin-top:0\}/, 'stacked tablet/mobile layouts do not get an unnecessary top gap');
});

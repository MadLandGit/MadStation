const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const nonJunglePages = [
  ['retro', 'home-retro.html'],
  ['retro-complex', 'home-retro-complex.html'],
  ['parallax', 'home-v3.html'],
  ['parallax-big', 'home-v4.html'],
  ['galaxy', 'home-galaxy.html'],
  ['claymorphism', 'home-claymorphism.html'],
  ['glass', 'home-glass.html'],
];

test('non-Jungle themes keep their shared Appearance and accent bridge but no longer have seasonal styling', () => {
  const bridge = read('src/home-style-settings-bridge.js');
  const chrome = read('src/home-style-chrome.css');
  for (const [style, htmlFile] of nonJunglePages) {
    const html = read(`src/${htmlFile}`);
    assert.match(html, /href="home-style-chrome\.css"/, `${style} still loads shared chrome`);
    assert.match(html, /src="home-style-settings-bridge\.js"/, `${style} still receives Appearance settings`);
  }
  assert.doesNotMatch(chrome, /data-season|home-season-accent|seasonal styling/i, 'shared theme chrome contains no seasonal presentation rules');
  assert.match(bridge, /setProperty\('--host-accent', accent\)/, 'the current global accent still propagates');
  assert.match(bridge, /if \(filename === 'home-parallax-jungle\.html'\)/, 'the bridge scopes season application to Jungle');
  assert.match(bridge, /delete document\.body\.dataset\.season/);
  assert.match(bridge, /delete document\.documentElement\.dataset\.season/);
});

test('season controls exist only on the Parallax Jungle homepage, never in main Quick Access', () => {
  const html = read('src/renderer.html');
  const host = read('src/home-page-switcher.js');
  const jungle = read('src/home-parallax-jungle.html');
  assert.doesNotMatch(html, /homeSeasonQuickGroup|data-home-season/, 'main Quick Access contains no season picker');
  assert.doesNotMatch(host, /homeSeasonQuickGroup|seasonQuickGroup|data-home-season/, 'the host Quick Access controller has no seasonal UI or click handling');
  assert.match(host, /getMode\(\) !== 'parallax-jungle' \|\| !VALID_SEASONS\.includes\(season\)/, 'season persistence is accepted only while Jungle is active');
  assert.match(host, /if \(mode === 'parallax-jungle'\) settings\.season = getSeason\(\)/, 'only the Jungle frame receives season state');
  assert.match(jungle, /class="season-controls"[\s\S]*id="seas"/, 'Jungle owns the seasonal controls');
  const quickStateStart = host.indexOf("sendToFrame(mode, 'quick-access-state'");
  const quickStateEnd = host.indexOf("sendToFrame(mode, 'quick-access-theme-catalog'", quickStateStart);
  assert.doesNotMatch(host.slice(quickStateStart, quickStateEnd), /season:/, 'season state is not part of Quick Access synchronization');
});

test('Parallax Jungle retains its built-in season picker, saved season state, and green Spring treatment', () => {
  const jungle = read('src/home-parallax-jungle.html');
  const bridge = read('src/home-style-settings-bridge.js');
  assert.match(jungle, /K_SEASON = 'mad-home-jungle-season'/);
  assert.match(jungle, /seas\.addEventListener\('click'/);
  assert.match(jungle, /window\.MadHome\.setSeason = \(season\)/);
  assert.match(jungle, /ROTATION_INTERVALS = \[1, 5, 10\]/, 'season rotation supports selectable 1, 5, and 10 minute intervals');
  assert.match(jungle, /intervalSeconds = sv\.rotateMinutes \* 60/, 'rotation interval is measured in minutes rather than rapid continuous cycling');
  assert.match(jungle, /automatic: true/, 'automatic season changes synchronize to the host without disabling rotation');
  assert.match(bridge, /document\.body\.dataset\.season !== settings\.season/, 'the appearance bridge avoids resetting rotation for a season that is already current');
  assert.match(jungle, /button\[data-k="0"\]\{--season-pill:#35a653\}/);
  assert.match(jungle, /lB: \[87, 190, 94\].*e1: \[76, 184, 76\]/);
});

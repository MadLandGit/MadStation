const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('Isometric World is registered as a lazy isolated homepage and Quick Access theme', () => {
  const renderer = read('src/renderer.html');
  assert.match(renderer, /id="launcherIsometricWorldScreen"[^>]*data-home-src="home-isometric-world\.html"[^>]*data-home-unload-inactive="true"/);
  const switcher = read('src/home-page-switcher.js');
  assert.match(switcher, /'isometric-world':\s*\{ frame: document\.getElementById\('launcherIsometricWorldScreen'\), channel: 'madstation-home-isometric-world' \}/);
  assert.match(switcher, /'isometric-world': false/);
  assert.match(switcher, /\{ id: 'isometric-world', label: 'Isometric World' \}/);
  const quick = read('src/home-quick-access-theme.js');
  assert.match(quick, /'isometric-world': 'madstation-home-isometric-world'/);
  assert.match(quick, /id: 'isometric-world', label: 'Isometric World'/);
  assert.match(quick, /isometric-world\)\$\/\.test\(id\)/);
  assert.match(read('src/home-style-settings-bridge.js'), /'home-isometric-world\.html': 'madstation-home-isometric-world'/);
});

test('Isometric World uses app-wide appearance controls and has no imported search UI', () => {
  const html = read('src/home-isometric-world.html');
  assert.match(html, /data-home-style="isometric-world"/);
  assert.match(html, /#rail\s*\{\s*display:\s*none\s*!important\s*\}/, 'duplicate left-side app rail is hidden at every screen size');
  assert.match(html, /data-theme-quick-access/);
  assert.match(html, /data-theme-quick-trigger/);
  assert.match(html, /data-theme-quick-menu/);
  assert.match(html, /<script src="home-isometric-world-bridge\.js"><\/script>/);
  assert.match(html, /<script src="home-style-settings-bridge\.js"><\/script>/);
  assert.match(html, /<script src="home-quick-access-theme\.js"><\/script>/);
  assert.match(html, /MutationObserver\(syncThemeStatus\)/);
  assert.doesNotMatch(html, /id="cmdBtn"|id="palette"|Search apps or run a command|openPal\(|id="palInput"/);
  assert.doesNotMatch(html, /id="themeBtn"[^>]*aria-label="Switch day and night"/);
  const inline = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(inline, 'self-contained world engine inline script exists');
  assert.doesNotThrow(() => new vm.Script(inline[1], { filename: 'home-isometric-world-inline.js' }));
});

test('Isometric World action row stays below the frameless window controls at all widths', () => {
  const html = read('src/home-isometric-world.html');
  assert.match(html, /body\[data-home-style="isometric-world"\]\s*\.tools\s*\{\s*top:\s*var\(--home-window-chrome-height,\s*42px\)\s*!important;?\s*\}/);
  assert.match(read('src/home-style-chrome.css'), /--home-window-chrome-height:\s*42px/);
});

test('Customize building labels, arrangement, and all camera pad controls remain wired', () => {
  const html = read('src/home-isometric-world.html');
  assert.match(html, /data-labels-visible/);
  assert.match(html, /Show building names/);
  assert.match(html, /mad-home-v15-labels-visible/);
  assert.match(html, /labels-hidden/);
  assert.match(html, /id="arrangeBtn"/);
  assert.match(html, /id="arrDone"/);
  assert.match(html, /setArrange\(!arrange\)/);
  assert.match(html, /finishMoveCommit/);
  assert.match(html, /const persist = \(\) =>/);
  for (const id of ['camL', 'camU', 'camR', 'camOut', 'camReset', 'camIn', 'camAuto', 'camD', 'camTop']) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} button exists`);
  }
  for (const id of ['camL', 'camR', 'camU', 'camD', 'camIn', 'camOut']) assert.match(html, new RegExp(`hold\\('#${id}'`), `${id} uses held camera input`);
  assert.match(html, /setPointerCapture/);
  assert.match(html, /lostpointercapture/);
  assert.match(html, /\$\('#camReset'\)\.addEventListener\('click', resetView\)/);
  assert.match(html, /\$\('#camAuto'\)\.addEventListener\('click'/);
  assert.match(html, /\$\('#camTop'\)\.addEventListener\('click'/);
});

test('Isometric World app card close button is above the header hit area for every app', () => {
  const html = read('src/home-isometric-world.html');
  assert.match(html, /\.info\s+\.x\s*\{[^}]*z-index:\s*3\s*!important;[^}]*pointer-events:\s*auto/s,
    'close button remains on top of later-painted card children and receives pointer input');
  assert.match(html, /\.info\s+\.i-top\s*\{\s*padding-right:\s*32px\s*\}/,
    'the app title row reserves space for the close button');
  assert.match(html, /\$\('#infoClose'\)\.addEventListener\('click', deselect\)/,
    'the close button returns to the world');
});

test('Isometric World host bridge has strict channel and app target checks', () => {
  const bridge = read('src/home-isometric-world-bridge.js');
  assert.match(bridge, /madstation-home-isometric-world/);
  assert.match(bridge, /allowedTargets\.has\(target\)/);
  assert.match(bridge, /event\.source !== window\.parent/);
  assert.match(bridge, /message\.type === 'host-ping'/);
});

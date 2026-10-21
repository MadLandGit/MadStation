const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const builtInThemeMonitors = [
  ['Simple', 'src/home-v5.js', 'src/home-v5.css'],
  ['Simple Retro', 'src/home-retro.html', 'src/home-retro.html'],
  ['Retro Complex', 'src/home-retro-complex.html', 'src/home-retro-complex.html'],
  ['3D Parallax', 'src/home-v3.html', 'src/home-v3.css'],
  ['3D Parallax Big App', 'src/home-v4.html', 'src/home-v4.css'],
  ['Glass', 'src/home-glass.html', 'src/home-glass.html'],
  ['Isometric World', 'src/home-isometric-world.html', 'src/home-isometric-world.html'],
  ['Galaxy', 'src/home-galaxy.html', 'src/home-galaxy.html'],
  ['Claymorphism', 'src/home-claymorphism.html', 'src/home-claymorphism.html'],
  ['Parallax Jungle', 'src/home-parallax-jungle.html', 'src/home-parallax-jungle.html'],
];

test('every built-in themed process monitor has an accessible, theme-styled refresh control', () => {
  for (const [theme, htmlFile, styleFile] of builtInThemeMonitors) {
    const html = read(htmlFile);
    const styles = read(styleFile);
    assert.match(html, /data-memory-refresh/, `${theme} has a refresh control`);
    assert.match(html, /aria-label="Refresh process monitor"/, `${theme} control is accessible`);
    assert.match(html, /title="Refresh process monitor"/, `${theme} control has a useful tooltip`);
    assert.match(styles, /\.sys-refresh-btn/, `${theme} defines styling for its refresh control`);
    assert.match(styles, /\.sys-refresh-btn\.is-refreshing svg/, `${theme} includes the refresh feedback animation`);
  }
});

test('Simple includes refresh controls in both full and compact performance widgets', () => {
  const registry = read('src/home-v2-registry.js');
  const styles = read('src/home-v2.css');
  assert.match(registry, /iconButton\('Refresh', ICON_REFRESH, \(\) => memory\('refresh'\)\)/, 'full system monitor retains its working refresh button');
  assert.match(registry, /mini-refresh-btn[\s\S]*?data-memory-refresh/, 'compact system monitor gains a refresh button');
  const simpleGrid = read('src/home-v5.js');
  assert.match(simpleGrid, /class=\"sys-title-row\"[\s\S]*?data-memory-refresh/, 'Simple theme live-system tile gains a refresh button');
  assert.match(simpleGrid, /if \(e\.target\.closest\('\[data-memory-refresh\]'\)\) return;/, 'refresh clicks do not initiate tile dragging');
  assert.match(read('src/home-v5.css'), /\.sys-refresh-btn\.is-refreshing svg/, 'Simple system tile uses its theme-specific button style');
  assert.match(read('src/home-v5.css'), /\.sys-title-row\s*\{[^}]*justify-content:flex-start/, 'Simple refresh button sits by the Live system label, away from the top-right drag grip');
  assert.match(styles, /\.mini-refresh-btn\.is-refreshing svg/, 'compact button has matching feedback');
});

test('shared theme handler routes refresh clicks to the host telemetry action', () => {
  const bridge = read('src/home-style-settings-bridge.js');
  const switcher = read('src/home-page-switcher.js');
  assert.match(bridge, /document\.addEventListener\('click',[\s\S]*?closest\('\[data-memory-refresh\]'\)/);
  assert.match(bridge, /window\.MadHome\?\.memoryAction\?\.\('refresh'\)/);
  assert.match(bridge, /event\.stopPropagation\(\)/);
  assert.match(switcher, /window\.MadStationMemoryMonitor\?\.requestAction\(message\.action\)/, 'refresh is routed to the actual memory telemetry provider');
});


test('Retro Complex process monitor accepts pointer input and refresh button has usable hover/pressed states', () => {
  const html = read('src/home-retro-complex.html');
  assert.match(html, /\.desk-hardware\s*\{[^}]*pointer-events:\s*none/s, 'hardware overlay stays click-through by default');
  assert.match(html, /body\[data-home-style="retro-complex"\] \.desk-hardware \.sys\s*\{[^}]*pointer-events:\s*auto/s, 'the process monitor opts back into pointer input');
  assert.match(html, /body\[data-home-style="retro-complex"\] \.sys-refresh-btn\s*\{[^}]*pointer-events:\s*auto[^}]*cursor:\s*pointer/s, 'refresh button remains targetable and shows a pointer cursor');
  assert.match(html, /body\[data-home-style="retro-complex"\] \.sys-refresh-btn:hover\s*\{/s, 'refresh button has an explicit hover state');
  assert.match(html, /body\[data-home-style="retro-complex"\] \.sys-refresh-btn:active\s*\{/s, 'refresh button has a pressed state');
  assert.match(html, /body\[data-home-style="retro-complex"\] \.sys-refresh-btn:focus-visible\s*\{/s, 'refresh button has a keyboard focus indicator');
  assert.match(html, /class="sys-refresh-btn" type="button" data-memory-refresh/, 'the button retains the shared telemetry refresh hook');
});

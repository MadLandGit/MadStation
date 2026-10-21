const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Galaxy Day keeps the station brand readable over deep space', () => {
  const galaxy = read('src/home-galaxy.html');
  const styles = read('src/styles.css');
  assert.match(galaxy, /body\[data-theme="light"\]\s+\.brand\s*\{\s*color:\s*#f2f6ff/i);
  assert.match(galaxy, /body\[data-theme="light"\]\s+\.brand b\s*\{\s*color:\s*#ffffff/i);
  assert.match(styles, /body:has\(#launcherGalaxyScreen:not\(\.hidden\)\)\s+\.window-controls \.window-control/);
});

test('Glass refresh glyph is white without changing the whole button', () => {
  const glass = read('src/home-glass.html');
  assert.match(glass, /body\[data-home-style="glass"\]\s+\.sys-refresh-btn svg\s*\{\s*stroke:\s*#fff;\s*color:\s*#fff;/);
});

test('Parallax and Big App Day Quick Access buttons use light native-control styling', () => {
  const css = read('src/home-quick-access-theme.css');
  for (const theme of ['parallax', 'parallax-big']) {
    assert.ok(css.includes(`body[data-home-style="${theme}"][data-theme="light"] .madstation-theme-quick-trigger`));
  }
  assert.match(css, /body\[data-home-style="parallax"\]\[data-theme="light"\] \.madstation-theme-quick-trigger,\s*body\[data-home-style="parallax-big"\]\[data-theme="light"\] \.madstation-theme-quick-trigger\s*\{[^}]*background:\s*#fff;/);
  assert.match(css, /--ms-home-control-fg,\s*#687386/);
  assert.match(css, /body\[data-home-style="parallax"\]\[data-theme="light"\] \.madstation-theme-quick-trigger,\s*body\[data-home-style="parallax-big"\]\[data-theme="light"\] \.madstation-theme-quick-trigger \{[^}]*border-color:\s*#d9dee7 !important;/,
    'both Day-mode triggers force a subtle gray border even if shared button tokens are accented');
  assert.match(css, /body\[data-home-style="parallax"\]\[data-theme="light"\] \.madstation-theme-quick-trigger:hover,[\s\S]*?body\[data-home-style="parallax-big"\]\[data-theme="light"\] \.madstation-theme-quick-trigger\[aria-expanded="true"\] \{[^}]*border-color:\s*#d9dee7 !important;/,
    'hover, active, focus, and open states keep the same gray border');
});

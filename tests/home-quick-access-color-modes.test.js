const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const css = read('src/home-quick-access-theme.css');
const js = read('src/home-quick-access-theme.js');

test('Quick Access menu tracks the resolved active Day/Night mode', () => {
  assert.match(js, /menu\.dataset\.colorMode\s*=\s*currentTheme/);
  assert.match(js, /const resolvedTheme\s*=\s*\(theme\)\s*=>\s*theme\s*===\s*'light'\s*\|\|\s*theme\s*===\s*'dark'/);
});

test('Claymorphism Quick Access switches to a dark clay palette in Night mode', () => {
  assert.match(css, /body\[data-home-style="claymorphism"\] \.madstation-theme-quick-menu\[data-color-mode="dark"\]/);
  assert.match(css, /\.madstation-theme-quick-menu\[data-color-mode="dark"\]\s*\{[^}]*background:\s*linear-gradient\(145deg,\s*#30394f/s);
  assert.match(css, /\.madstation-theme-quick-menu\[data-color-mode="dark"\] \.mqa-mode,[\s\S]*?\.madstation-theme-quick-menu\[data-color-mode="dark"\] \.mqa-settings/);
});

test('Day mode has theme-matched light Quick Access surfaces for Jungle, Galaxy, Parallax, Parallax Big, and Simple Retro', () => {
  for (const style of ['parallax-jungle', 'galaxy', 'parallax', 'parallax-big', 'retro']) {
    const selector = `body[data-home-style="${style}"] .madstation-theme-quick-menu[data-color-mode="light"]`;
    assert.ok(css.includes(selector), `missing light-mode Quick Access palette for ${style}`);
  }
  for (const style of ['parallax-jungle', 'galaxy', 'parallax', 'parallax-big', 'retro']) {
    const start = css.indexOf(`body[data-home-style="${style}"] .madstation-theme-quick-menu[data-color-mode="light"]`);
    const block = css.slice(start, css.indexOf('}', start) + 1);
    assert.match(block, /background:/, `${style} light palette should set a light surface`);
    assert.match(block, /color:/, `${style} light palette should set readable text`);
    assert.match(block, /border(?:-color)?:/, `${style} light palette should keep a visible edge`);
  }
});

test('Glass Day mode uses visible borders and defined control surfaces', () => {
  assert.match(css, /body\[data-home-style="glass"\] \.madstation-theme-quick-menu\[data-color-mode="light"\]\s*\{[^}]*border:\s*1px solid rgb\(99 125 158 \/ \.48\)/s);
  assert.match(css, /body\[data-home-style="glass"\] \.madstation-theme-quick-menu\[data-color-mode="light"\] \.mqa-mode,[\s\S]*?\.madstation-theme-quick-menu\[data-color-mode="light"\] \.mqa-settings\s*\{[^}]*border:/s);
  assert.match(css, /body\[data-home-style="glass"\] \.madstation-theme-quick-menu\[data-color-mode="light"\] \.mqa-theme-option\[aria-pressed="true"\]/);
});


test('Day-mode Quick Access mode buttons have breathing room below the header divider', () => {
  for (const style of ['glass', 'parallax-jungle', 'galaxy', 'parallax', 'parallax-big']) {
    const selector = `body[data-home-style="${style}"] .madstation-theme-quick-menu[data-color-mode="light"] .mqa-mode`;
    assert.ok(css.includes(selector), `missing day-mode spacing selector for ${style}`);
  }
  assert.match(css, /body\[data-home-style="glass"\] \.madstation-theme-quick-menu\[data-color-mode="light"\] \.mqa-mode,[\s\S]*?\{\s*margin-top:\s*8px;/);
});

test('Simple Retro day-mode Quick Access trigger follows its light Settings/Customize colors', () => {
  assert.match(css, /body\[data-home-style="retro"\]\[data-theme="light"\] \.madstation-theme-quick-trigger\s*\{[^}]*background:\s*var\(--panel/s);
  assert.match(css, /body\[data-home-style="retro"\]\[data-theme="light"\] \.madstation-theme-quick-trigger:hover[\s\S]*?background:\s*var\(--ph/s);
});

test('3D Parallax and Big App day-mode Quick Access triggers use the native control palette', () => {
  for (const style of ['parallax', 'parallax-big']) {
    const selector = `body[data-home-style="${style}"][data-theme="light"] .madstation-theme-quick-trigger`;
    assert.ok(css.includes(selector), `missing light trigger rule for ${style}`);
  }
  assert.match(css, /body\[data-home-style="parallax"\]\[data-theme="light"\] \.madstation-theme-quick-trigger,\s*body\[data-home-style="parallax-big"\]\[data-theme="light"\] \.madstation-theme-quick-trigger\s*\{[^}]*background:\s*#fff;/);
  assert.match(css, /color:\s*var\(--ms-home-control-fg/);
});

test('3D Parallax Day-mode Quick Access stays white in all interactive states', () => {
  const states = [':hover', ':active', ':focus', ':focus-visible', '[aria-expanded="true"]'];
  for (const style of ['parallax', 'parallax-big']) {
    for (const state of states) {
      assert.ok(
        css.includes(`body[data-home-style="${style}"][data-theme="light"] .madstation-theme-quick-trigger${state}`),
        `missing white day-mode trigger state ${state} for ${style}`,
      );
    }
  }
  assert.match(css, /body\[data-home-style="parallax"\]\[data-theme="light"\] \.madstation-theme-quick-trigger:hover,[\s\S]*?body\[data-home-style="parallax-big"\]\[data-theme="light"\] \.madstation-theme-quick-trigger\[aria-expanded="true"\]\s*\{\s*background:\s*#fff\s*!important;/);
});

test('Glass Day mode makes only the refresh arrow black', () => {
  const glass = read('src/home-glass.html');
  assert.match(glass, /body\[data-home-style="glass"\] \.sys-refresh-btn svg\s*\{\s*stroke:\s*#fff;\s*color:\s*#fff;/);
  assert.match(glass, /body\[data-home-style="glass"\]\[data-theme="light"\] \.sys-refresh-btn svg\s*\{\s*stroke:\s*#111;\s*color:\s*#111;\s*\}/);
  assert.doesNotMatch(glass, /body\[data-home-style="glass"\]\[data-theme="light"\] \.sys-refresh-btn\s*\{/);
});

test('Glass removes only the cursor-following spotlight layer, retaining other interactions', () => {
  const glass = read('src/home-glass.html');
  assert.doesNotMatch(glass, /class="spot"\s+id="spot"/);
  assert.doesNotMatch(glass, /spot\.style\.transform/);
  assert.match(glass, /\.glass:hover::before/);
  assert.match(glass, /window\.addEventListener\('pointermove'/);
});


test('3D Parallax and Big App Night-mode Quick Access triggers match the neutral Settings control', () => {
  const states = ['', ':hover', ':active', ':focus', ':focus-visible', '[aria-expanded="true"]'];
  for (const style of ['parallax', 'parallax-big']) {
    for (const state of states) {
      assert.ok(
        css.includes(`body[data-home-style="${style}"][data-theme="dark"] .madstation-theme-quick-trigger${state}`),
        `missing Night-mode neutral trigger state ${state || 'default'} for ${style}`,
      );
    }
  }
  assert.match(css, /body\[data-home-style="parallax"\]\[data-theme="dark"\] \.madstation-theme-quick-trigger,[\s\S]*?body\[data-home-style="parallax-big"\]\[data-theme="dark"\] \.madstation-theme-quick-trigger\[aria-expanded="true"\]\s*\{[^}]*background:\s*#151515\s*!important;[^}]*border:\s*1px solid #34363a\s*!important;[^}]*box-shadow:\s*none\s*!important;/);
  assert.match(css, /body\[data-home-style="parallax"\]\[data-theme="dark"\] \.madstation-theme-quick-trigger\s*,[\s\S]*?\{\s*border-radius:\s*12px\s*!important;/);
  assert.match(css, /body\[data-home-style="parallax-big"\]\[data-theme="dark"\] \.madstation-theme-quick-trigger\s*,[\s\S]*?\{\s*border-radius:\s*var\(--ms-home-control-radius,\s*12px\)\s*!important;/);
  assert.match(css, /body\[data-home-style="parallax"\]\[data-theme="dark"\] \.madstation-theme-quick-trigger \.madstation-theme-quick-glyph,[\s\S]*?body\[data-home-style="parallax-big"\]\[data-theme="dark"\] \.madstation-theme-quick-trigger \.madstation-theme-quick-glyph\s*\{[^}]*filter:\s*none\s*!important;/);
});

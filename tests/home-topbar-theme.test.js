const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const pages = [
  'src/home-v2.html',
  'src/home-v3.html',
  'src/home-v4.html',
  'src/home-retro.html',
  'src/home-retro-complex.html',
  'src/home-galaxy.html',
  'src/home-parallax-jungle.html',
  'src/home-claymorphism.html',
  'src/home-glass.html', 'src/home-isometric-world.html',
];

test('every isolated homepage loads the theme-aware topbar stylesheet', () => {
  for (const page of pages) {
    assert.match(read(page), /home-topbar-theme\.css/, `${page} should load theme-aware chrome overrides`);
  }
});

test('Customize controls are icon-only and remain accessible', () => {
  for (const page of ['src/home-v2.html']) {
    const html = read(page);
    const button = html.match(/<button\b[^>]*id="homeCustomizeBtn"[^>]*>[\s\S]*?<\/button>/)?.[0];
    assert.ok(button, `${page} should retain its Customize control`);
    assert.doesNotMatch(button, /<span[^>]*>\s*Customize\s*<\/span>/i, `${page} must not show a Customize label`);
    assert.match(button, /aria-label="Customize"/i);
    assert.match(button, /title="Customize"/i);
  }
});

test('Parallax Jungle replaces its duplicate Change Main control with a circular season-rotation control', () => {
  const page = 'src/home-parallax-jungle.html';
  const html = read(page);
  const button = html.match(/<button\b[^>]*id="seasonTimingBtn"[^>]*>[\s\S]*?<\/button>/)?.[0];
  assert.ok(button, `${page} should provide a season timing control`);
  assert.match(button, /class="season-timing-button"/);
  assert.match(button, /aria-label="Season rotation settings"/);
  assert.match(html, /id="seasonTimingMenu"[^>]*role="dialog"/);
  assert.match(html, /id="seasonAutoToggle" type="checkbox" checked/);
  for (const minutes of [1, 5, 10]) assert.match(html, new RegExp(`data-rotate-minutes="${minutes}"`));
  assert.doesNotMatch(html, /id="changeMainBtn"/, 'the duplicate main-app chooser is removed');
});

test('theme stylesheet adapts each theme family instead of applying one generic skin', () => {
  const css = read('src/home-topbar-theme.css');
  for (const style of ['simple', 'parallax', 'parallax-big', 'retro', 'parallax-jungle', 'claymorphism']) {
    assert.ok(css.includes(`data-home-style="${style}"`), `missing theme-specific chrome rules for ${style}`);
  }
  assert.match(css, /:focus-visible/, 'visible keyboard focus remains available for interactive header controls');
  assert.match(read('src/home-quick-access-theme.css'), /body\[data-home-style="galaxy"\] \.madstation-theme-quick-access/, 'Galaxy-specific header styling stays with Quick Access rather than a search bar');
});

test('the six requested homepage themes have no remaining theme-local search-bar skin', () => {
  const css = read('src/home-topbar-theme.css');
  for (const style of ['glass', 'claymorphism', 'parallax-jungle', 'galaxy', 'parallax-big', 'parallax']) {
    assert.doesNotMatch(css, new RegExp(`body\\[data-home-style="${style}"\\][^{]*\\.cmdk?\\b`), `${style} still has a theme-local search style`);
  }
  assert.doesNotMatch(css, /body\[data-home-style="galaxy"\][^{]*#cmdk/);
  assert.match(css, /body\[data-home-style="simple"\] header\.bar > \.search\s*\{[^}]*display:\s*none\s*!important;/s,
    'the existing Simple header layout rule is preserved independently of the six themes');
  assert.match(css, /body\[data-home-style="simple"\] header\.bar\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto/s);
  assert.match(css, /body\[data-home-style="claymorphism"\] \.dock\s*\{[^}]*grid-template-columns:\s*auto minmax\(0, 1fr\)/s);
  assert.match(css, /body\[data-home-style="parallax-jungle"\] \.top\s*\{[^}]*grid-template-columns:\s*auto minmax\(0, 1fr\)/s);
});


test('Simple button controls use their page card surfaces rather than generic blue chrome', () => {
  const css = read('src/home-topbar-theme.css');
  assert.match(css, /data-home-style="simple"\] \.actions #homeCustomizeBtn[\s\S]*?background: linear-gradient\(165deg, var\(--v5-surface\), color-mix\(in srgb, var\(--v5-surface\) 82%, var\(--v5-base-bg\)\)\)/);
});

test('Parallax Big App header actions reuse the center-stage primary action treatment', () => {
  const css = read('src/home-topbar-theme.css');
  const section = css.match(/data-home-style="parallax-big"\] #homeCustomizeBtn,[\s\S]*?\n}\n/);
  assert.ok(section, 'parallax big app toolbar styling exists');
  assert.match(section[0], /var\(--s1/);
  assert.match(section[0], /var\(--ms-home-panel-border/);
  assert.match(section[0], /box-shadow:/);
});

test('Simple Retro removes its redundant header Change Main selector', () => {
  const html = read('src/home-retro.html');
  const css = read('src/home-topbar-theme.css');
  assert.doesNotMatch(html, /id="mainBtn"|id="menu"|buildMenu\(/);
  assert.doesNotMatch(css, /mainBtn\.retro-main-icon/);
});

test('Retro Complex Settings is an analog dial control, not centered text', () => {
  const html = read('src/home-retro-complex.html');
  assert.match(html, /class="chip analog-settings" id="launcherSettingsBtn"/);
  assert.match(html, /class="settings-dial" aria-hidden="true"/);
  assert.doesNotMatch(html, /id="launcherSettingsBtn"[^>]*>Settings</);
});

test('Jungle header repurposes the duplicate leaf control as a round season timing button', () => {
  const jungle = read('src/home-parallax-jungle.html');
  assert.match(jungle, /class="season-timing-button" id="seasonTimingBtn"/);
  assert.match(jungle, /border-radius:50%/);
  assert.match(jungle, /data-rotate-minutes="5"/);
  assert.doesNotMatch(jungle, /id="changeMainBtn"/);
});

test('Claymorphism top buttons do not replay the hidden entrance frame after hover', () => {
  const html = read('src/home-claymorphism.html');
  assert.match(html, /\.icon:hover,\.chgm:hover\{translate:0 -3px;color:var\(--text\);animation:jelly \.65s\}/);
  assert.match(html, /\.dock>\.brand,\.top-r>\*:not\(button\)\{animation:up \.7s backwards\}/);
  assert.doesNotMatch(html, /\.dock>\.brand,\.dock>\.cmd,\.top-r>\*\{animation:up \.7s backwards\}/);
});

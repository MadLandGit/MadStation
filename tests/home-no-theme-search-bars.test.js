const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const themes = [
  { name: '3D Parallax', files: ['src/home-v3.html', 'src/home-v3.js', 'src/home-v3.css'] },
  { name: '3D Parallax Big App', files: ['src/home-v4.html', 'src/home-v4.js', 'src/home-v4.css'] },
  { name: 'Galaxy', files: ['src/home-galaxy.html'] },
  { name: 'Parallax Jungle', files: ['src/home-parallax-jungle.html'] },
  { name: 'Claymorphism', files: ['src/home-claymorphism.html'] },
  { name: 'Glass', files: ['src/home-glass.html'] },
];

const forbidden = [
  ['palette container', /id=["']palette["']/i],
  ['palette search input', /id=["']palInput["']/i],
  ['palette results list', /id=["']palList["']/i],
  ['palette scrim', /id=["']palScrim["']/i],
  ['search-bar trigger', /id=["']cmdBtn["']/i],
  ['Galaxy search trigger', /id=["']cmdk["']/i],
  ['palette controller', /\bopenPal\s*\(|\bdrawPal\s*\(|\brunSel\b/],
  ['palette component styles', /\.pal(?:-[a-z-]+)?\s*\{/i],
  ['command bar styles', /\.cmdk?\s*\{/i],
  ['command-palette hint text', /Search apps or run a command|Search apps and commands|Type an app or a command/i],
  ['palette keyboard shortcut', /e\.key\s*===\s*['"]\/['"]|key\.toLowerCase\(\)\s*===\s*['"]k['"]/i],
  ['palette accessibility wiring', /aria-activedescendant|aria-autocomplete|aria-controls=["']palList/i],
];

test('six built-in homepage themes contain no theme-local search bar or command palette remnants', () => {
  for (const theme of themes) {
    const combined = theme.files.map(read).join('\n');
    for (const [feature, pattern] of forbidden) {
      assert.doesNotMatch(combined, pattern, `${theme.name} still contains ${feature}`);
    }
  }
});

test('removing theme search bars does not remove separate theme controls or global search features', () => {
  const v3 = read('src/home-v3.html');
  const v4 = read('src/home-v4.html');
  const galaxy = read('src/home-galaxy.html');
  const jungle = read('src/home-parallax-jungle.html');
  assert.match(v3, /id="homeCustomizeBtn"/, '3D Parallax customization remains available');
  assert.match(v4, /id="homeCustomizeBtn"/, '3D Parallax Big App customization remains available');
  assert.match(galaxy, /launcherSettingsBtn/, 'Galaxy settings control remains available');
  assert.match(jungle, /data-season-control|setSeason\s*=|Season/i, 'Parallax Jungle seasonal controls remain separate from search');
  assert.match(read('src/renderer.html'), /search/i, 'unrelated host/application search functionality remains untouched');
});

test('shared theme CSS and Appearance previews contain no leftovers for the removed search bars', () => {
  const topbar = read('src/home-topbar-theme.css');
  const chrome = read('src/home-style-chrome.css');
  const preview = read('src/renderer-react/appearance-controls.tsx');
  const previewCss = read('src/styles.css');
  for (const style of ['parallax', 'parallax-big', 'galaxy', 'parallax-jungle', 'claymorphism', 'glass']) {
    assert.doesNotMatch(topbar, new RegExp(`body\\[data-home-style="${style}"\\][^{]*\\.cmdk?\\b`), `${style} has stale search-bar skin in the shared stylesheet`);
  }
  assert.doesNotMatch(chrome, /body\[data-home-style="galaxy"\][^{]*\.cmdk?/);
  assert.doesNotMatch(preview, /hp-para-command|hp-galaxy-search|Search apps or run a command|CTRL K/);
  assert.doesNotMatch(previewCss, /hp-para-command|hp-galaxy-search/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('removed homepage styles are no longer selectable or registered', () => {
  const html = read('src/renderer.html');
  const picker = read('src/renderer-react/appearance-controls.tsx');
  const switcher = read('src/home-page-switcher.js');
  const renderer = read('src/renderer.js');
  const styleBridge = read('src/home-style-settings-bridge.js');
  for (const marker of ['launcherSimpleBigAppScreen', 'launcherNeonCyberpunkScreen', 'home-simple-big-app.html', 'home-neon-cyberpunk.html']) {
    assert.doesNotMatch(html, new RegExp(marker), `${marker} is not embedded in the renderer`);
  }
  for (const marker of ["id: 'simple-big-app'", "id: 'neon-cyberpunk'"]) assert.doesNotMatch(picker, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  for (const marker of ['simple-big-app', 'neon-cyberpunk']) {
    assert.doesNotMatch(switcher, new RegExp(`['\"]${marker}['\"]`), `${marker} is not a valid switcher mode`);
    assert.doesNotMatch(renderer, new RegExp(`['\"]${marker}['\"]`), `${marker} is not allowed by renderer validation`);
  }
  assert.doesNotMatch(styleBridge, /home-simple-big-app|home-neon-cyberpunk/);
  assert.equal(fs.existsSync(path.join(root, 'src/home-simple-big-app.html')), false);
  assert.equal(fs.existsSync(path.join(root, 'src/home-neon-cyberpunk.html')), false);
});

test('previously saved removed homepage values migrate safely to Simple', () => {
  const switcher = read('src/home-page-switcher.js');
  const picker = read('src/renderer-react/appearance-controls.tsx');
  assert.match(switcher, /if \(validMode\(saved\)\) return saved;/);
  assert.match(switcher, /if \(saved !== null\) localStorage\.setItem\(STORAGE_KEY, 'v2'\);/);
  assert.match(switcher, /return 'v2';/);
  assert.match(switcher, /savedIsCustom && \(!importedThemeCatalogAvailable \|\| importedThemesLoading\)/, 'custom selections are not migrated away before a successful catalog validation');
  assert.match(picker, /setCurrent\(saved === 'legacy' \? 'legacy' : nextStyles\.some\(\(style\) => style\.id === saved\) \? saved : 'v2'\)/, 'Appearance preserves the developer-only legacy mode without exposing it as a selectable theme');
});

test('Claymorphism hover effects no longer replay the invisible entrance frame on pointer leave', () => {
  const html = read('src/home-claymorphism.html');
  assert.match(html, /\.icon:hover,\.chgm:hover\{translate:0 -3px;color:var\(--text\);animation:jelly \.65s\}/);
  assert.match(html, /\.dock>\.brand,\.top-r>\*:not\(button\)\{animation:up \.7s backwards\}/);
  assert.doesNotMatch(html, /\.dock>\.brand,\.dock>\.cmd,\.top-r>\*\{animation:up \.7s backwards\}/);
  assert.match(html, /id="launcherSettingsBtn"/);
  assert.match(html, /id="homeCustomizeBtn"/);
});

test('Claymorphism app hover glow follows rounded tile corners', () => {
  const html = read('src/home-claymorphism.html');
  const glowRule = html.match(/\.tile::after\{([^}]+)\}/)?.[1] || '';
  assert.match(glowRule, /border-radius:\s*inherit/, 'the pointer-following glow is clipped to the same rounded shape as each tile');
  assert.match(glowRule, /radial-gradient/, 'the soft accent glow remains in place');
});

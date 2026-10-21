const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('3D Parallax Big App promotes a dragged mini-app dropped on the main card', () => {
  const html = read('src/home-v4.html');
  const js = read('src/home-v4.js');
  const css = read('src/home-v4.css');
  assert.doesNotMatch(html, /id="changeMainBtn"/);
  assert.doesNotMatch(js, /changeMainBtn|name="mainApp"/);
  assert.match(js, /const overMain = \(\) =>/);
  assert.match(js, /mcard\.classList\.toggle\('drop', overMain\(\)\)/);
  assert.match(js, /if \(toMain\) \{ cleanup\(\); setMain\(cur\.t\.dataset\.id\); return; \}/);
  assert.match(css, /\.main\.drop\s*\{/);
  assert.match(html, /Drag a tile onto the main panel to replace it/);
});

test('Claymorphism 2 promotes a dropped mini-app and removes the header chooser setting', () => {
  const html = read('src/home-claymorphism.html');
  assert.doesNotMatch(html, /id="changeMainBtn"|name="mainApp"|data-main="\$\{a\.id\}"/);
  assert.match(html, /const overMain = \(\) =>/);
  assert.match(html, /mcard\.classList\.toggle\('drop', overMain\(\)\)/);
  assert.match(html, /if \(toMain\) \{ cleanup\(\); setMain\(cur\.t\.dataset\.id\); return; \}/);
  assert.match(html, /\.main\.drop\s*\{/);
  assert.match(html, /Drag a tile onto the main panel to replace it/);
});

test('Glass promotes a dropped mini-app and removes the header chooser setting', () => {
  const html = read('src/home-glass.html');
  assert.doesNotMatch(html, /id="changeMainBtn"|name="mainApp"|data-main="\$\{a\.id\}"/);
  assert.match(html, /const overMain = \(\) =>/);
  assert.match(html, /mcard\.classList\.toggle\('drop', overMain\(\)\)/);
  assert.match(html, /if \(toMain\) \{ cleanup\(\); setMain\(cur\.t\.dataset\.id\); return; \}/);
  assert.match(html, /\.main\.drop\s*\{/);
  assert.match(html, /Drag a tile onto the main panel to replace it/);
});

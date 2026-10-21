const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const home = fs.readFileSync(path.join(root, 'src/home-glass.html'), 'utf8');

test('Glass main app icon stays crisp and does not rotate', () => {
  const iconRule = home.match(/\.main \.m-orb > \.ico\s*\{([^}]+)\}/);
  assert.ok(iconRule, 'a dedicated rule targets only the large main-app icon');
  for (const declaration of [
    /animation:\s*none\s*!important/i,
    /transform:\s*none\s*!important/i,
    /rotate:\s*0deg\s*!important/i,
    /translate:\s*0\s+0\s*!important/i,
    /filter:\s*none\s*!important/i,
  ]) assert.match(iconRule[1], declaration);
  const svgRule = home.match(/\.main \.m-orb > \.ico svg\s*\{([^}]+)\}/);
  assert.ok(svgRule, 'the SVG glyph is also protected against inherited animation filters');
  assert.match(svgRule[1], /animation:\s*none\s*!important/i);
  assert.match(svgRule[1], /transform:\s*none\s*!important/i);
  assert.match(home, /\.main \.m-orb\s*\{\s*perspective:\s*none;\s*transform:\s*none;\s*transform-style:\s*flat;/);
});

test('Glass main-app accents follow the selected app rather than the global accent', () => {
  assert.doesNotMatch(home, /\.main\s*\{[^}]*--h:\s*var\(--a\)/);
  for (let n = 1; n <= 6; n++) {
    assert.match(home, new RegExp(`\\[data-h="${n}"\\]\\{--h:var\\(--c${n}\\)\\}`), `app color ${n} is mapped`);
  }
  assert.match(home, /mcard\.dataset\.h\s*=\s*a\.h/, 'the selected main app sets its own color key');
});

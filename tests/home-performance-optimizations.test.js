const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('particle animation checks squared distance before calculating square roots', () => {
  for (const file of ['src/home-v3.js', 'src/home-v4.js', 'src/home-parallax-background.js']) {
    const text = source(file);
    assert.match(text, /const linkRadius = (?:110|104), linkRadiusSq = linkRadius \* linkRadius;/, `${file} caches its link threshold`);
    assert.match(text, /distanceSq = dx \* dx \+ dy \* dy;/, `${file} computes squared distance`);
    assert.match(text, /if \(distanceSq < linkRadiusSq\)\s*\{\s*const distance = Math\.sqrt\(distanceSq\);/, `${file} only computes a square root for linked dots`);
    assert.doesNotMatch(text, /Math\.hypot\(p\.dx - q\.dx, p\.dy - q\.dy\)/, `${file} avoids the old unconditional square root`);
  }
});

test('home connector rendering measures each connected card once per draw', () => {
  const text = source('src/home-core-system.js');
  assert.match(text, /describeConnections\(\)\.map\(\(item\) => \(\{ \.\.\.item, box: bounds\(item\.element, stageRect\) \}\)\)/);
  assert.match(text, /sort\(\(a, b\) => a\.box\.centerY - b\.box\.centerY\)/);
  assert.match(text, /sort\(\(a, b\) => a\.box\.centerX - b\.box\.centerX\)/);
  assert.doesNotMatch(text, /sort\(\(a, b\) => bounds\(a\.element, stageRect\)/);
  assert.equal((text.match(/bounds\(item\.element, stageRect\)/g) || []).length, 1, 'geometry is cached once when connector items are prepared');
});


test('animated theme accents are cached between appearance changes', () => {
  const v3 = source('src/home-v3.js');
  const v4 = source('src/home-v4.js');
  const parallax = source('src/home-parallax-background.js');
  assert.match(v3, /if \(fxColorDirty\) \{[\s\S]*?getComputedStyle\(document\.body\)[\s\S]*?fxColorDirty = false;/);
  assert.match(v4, /if \(fxColorDirty\) \{[\s\S]*?getComputedStyle\(document\.body\)[\s\S]*?fxColorDirty = false;/);
  assert.match(v3, /styleObserver\.observe\(document\.body, \{ attributes: true, attributeFilter: \['class', 'data-theme', 'style'\] \}\)/);
  assert.match(v4, /styleObserver\.observe\(document\.documentElement, \{ attributes: true, attributeFilter: \['class', 'data-theme', 'style'\] \}\)/);
  assert.match(parallax, /if \(accentRgbValue\) return accentRgbValue;/);
  assert.match(parallax, /function sync\(\) \{\s*accentRgbValue = null;/);
});

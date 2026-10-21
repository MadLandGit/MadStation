const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Galaxy exposes an accessible, persisted solar-system speed control with a slower default', () => {
  const html = read('src/home-galaxy.html');
  assert.match(html, /id="orbitSpeedControl"[^>]*aria-label="Solar system animation speed"/);
  assert.match(html, /<label for="orbitSpeedRange">Orbit speed<\/label>/);
  assert.match(html, /id="orbitSpeedRange" type="range" min="0\.10" max="1\.00" step="0\.05" value="0\.35"/);
  assert.match(html, /id="orbitSpeedValue"[^>]*>35%<\/output>/);
  assert.match(html, /K_ORBIT_SPEED = 'mad-home-galaxy-orbit-speed-v1'/);
  assert.match(html, /orbitSpeedRange\?\.addEventListener\('input'/);
  assert.match(html, /localStorage\.setItem\(K_ORBIT_SPEED, orbitSpeed\.toFixed\(2\)\)/);
  assert.match(html, /aria-valuetext.*percent/);
});

test('Galaxy speed control scales planet surfaces, orbital paths, moons, and both suns together', () => {
  const html = read('src/home-galaxy.html');
  assert.match(html, /P\.rot \+= dt \* P\.spin \* 1\.4 \* animationScale/,
    'surface rotation is far slower than the former 14x multiplier and follows the control');
  assert.match(html, /ph\[id\] \+= dt \* orbitSpeed \* slow/,
    'planet orbital movement follows the selected system speed');
  assert.match(html, /m\.a \+= dt \* m\.sp \* orbitSpeed \* slow/,
    'moon orbits use the same speed multiplier as their planets');
  assert.match(html, /orbitTime \+= dt \* orbitSpeed \* slow/,
    'shared orbital clock applies the control to common celestial motion');
  assert.match(html, /a0 = orbitTime \* \(\.5 \+ k \* 1\.6\)/,
    'binary suns move around their shared center at the selected speed');
  assert.match(html, /g\.rotate\(orbitTime \* \.03 \* dir\)/,
    'the individual sun textures spin on the shared, slowed clock');
  assert.match(html, /comet\.th \+= dt \* \.13 \* orbitSpeed \* slow/);
  assert.doesNotMatch(html, /P\.rot \+= dt \* P\.spin \* 14;/,
    'the previous fast surface-spin multiplier is removed');
});


test('Galaxy planet shading receives frame-local animation state explicitly', () => {
  const html = read('src/home-galaxy.html');
  const shadeMatch = html.match(/function shade\(P, L, dt, animationScale\) \{([\s\S]*?)\n  \}/);
  assert.ok(shadeMatch, 'shade accepts an explicit animationScale instead of closing over frame-local variables');
  assert.match(shadeMatch[1], /P\.rot \+= dt \* P\.spin \* 1\.4 \* animationScale/);
  assert.doesNotMatch(shadeMatch[1].replace(/\/\*[\s\S]*?\*\//g, ''), /\b(?:slow|calm)\b/, 'shade must not reference frame-local variables that are out of scope');
  assert.match(html, /shade\(P, \[dx \/ l \* \.9 \/ Lm, dy \/ l \* \.9 \/ Lm, lz \/ Lm\], dt, orbitSpeed \* slow \* \(calm \? \.1 : 1\)\)/,
    'frame passes current speed, hover slowdown, and reduced-motion scaling into planet shading');
});

test('Galaxy Day mode keeps a deep-space backdrop with gently brighter cosmic details', () => {
  const html = read('src/home-galaxy.html');
  assert.match(html, /body\[data-theme=light\]\{--bg:#111b30;/,
    'Day mode should use deep navy rather than a pale or white canvas');
  assert.doesNotMatch(html, /body\[data-theme=light\]\{--bg:#(?:fff(?:fff)?|dfe5f4|eef1fa)\b/i,
    'Day mode must not replace the space background with a light neutral');
  assert.match(html, /body\[data-theme=light\] \.neb\{opacity:\.66;animation:none\}/,
    'Day mode should lift the nebula glow slightly without washing out the space');
  assert.match(html, /light \? '188,207,255' : s\.c/,
    'Day-mode stars should remain bright against the navy background');
  assert.match(html, /rgb = light \? '125,158,245' : '150,178,255'/,
    'orbit and comet accents should be gently brighter in Day mode');
  assert.match(html, /body\[data-theme=light\] \.nm\{color:rgba\(235,241,255,\.94\)/,
    'planet labels should stay readable on the dark cosmic backdrop');
});

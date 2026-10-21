const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const jungle = fs.readFileSync(path.join(__dirname, '..', 'src', 'home-parallax-jungle.html'), 'utf8');

test('Parallax Jungle has no decorative border fronds', () => {
  assert.doesNotMatch(jungle, /const FR\s*=/, 'edge frond definitions should be removed');
  assert.doesNotMatch(jungle, /function frond\s*\(/, 'unused border-frond drawing routine should be removed');
  assert.doesNotMatch(jungle, /FR\.forEach\s*\(/, 'the scene should not render border fronds');
  assert.match(jungle, /decorative vines \(back\)/, 'the hanging vine effect used by the app tiles is intentionally preserved');
});

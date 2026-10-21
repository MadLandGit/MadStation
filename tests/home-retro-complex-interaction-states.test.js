const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Retro Complex main CRT and floppy app tiles have animated hover and pressed states', () => {
  const html = read('src/home-retro-complex.html');
  assert.match(html, /body\[data-home-style="retro-complex"\] \.main\.tilt\s*\{[^}]*transition:[^}]*transform[^}]*translate[^}]*scale/s,
    'the main CRT transition includes tilt, movement, and scale rather than only box-shadow');
  assert.match(html, /body\[data-home-style="retro-complex"\] \.main:hover\s*\{[^}]*scale:\s*1\.004/s,
    'the main CRT gets a perceptible hover response');
  assert.match(html, /body\[data-home-style="retro-complex"\] \.main:active\s*\{[^}]*scale:\s*\.992/s,
    'the main CRT visibly presses down on click');
  assert.match(html, /body\[data-home-style="retro-complex"\] \.desk \.tile\s*\{[^}]*transition:[^}]*box-shadow/s,
    'app floppy tiles animate their hover shadow, lift, and filter');
  assert.match(html, /body\[data-home-style="retro-complex"\] \.desk \.tile:active\s*\{[^}]*scale:\s*\.975/s,
    'app floppy tiles have a distinct pressed state');
  assert.match(html, /body\[data-home-style="retro-complex"\] \.main \.open:active\s*\{[^}]*translate:\s*2px 2px/s,
    'the Open button has tactile click feedback');
  assert.match(html, /body\.no-hover-animation|body\.reduce-motion|prefers-reduced-motion/,
    'existing motion preferences remain supported');
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const jungle = fs.readFileSync(path.join(__dirname, '..', 'src', 'home-parallax-jungle.html'), 'utf8');

test('Parallax Jungle info card uses the selected app palette rather than the global accent', () => {
  assert.match(jungle, /\[data-h="1"\]\{--h:var\(--c1\)\}/);
  assert.match(jungle, /info\.dataset\.h = a\.h/);
  const infoRule = jungle.match(/\.info\{([^}]*)\}/)?.[1] || '';
  assert.doesNotMatch(infoRule, /--h\s*:\s*var\(--a\)/, 'info card must not override its app-specific hue with the global accent');
  assert.match(jungle, /\.mi\{[^}]*background:linear-gradient\(140deg,var\(--h\),color-mix\(in srgb,var\(--h\) 50%,#000\)\)/);
});

test('Parallax Jungle info action displays only the app name while retaining an accessible open label', () => {
  assert.match(jungle, /class="open" id="iOpen" type="button" aria-label="Open \$\{a\.name\}"\>\$\{a\.name\}\$\{svg\(ARROW\)\}/);
  assert.doesNotMatch(jungle, /class="open" id="iOpen" type="button">Open \$\{a\.name\}/);
  assert.doesNotMatch(jungle, /id="iMk"|★ Make main|data-info-main-star/, 'the information panel contains no duplicate main-app control');
});

test('Parallax Jungle app tiles have compact, color-matched star controls for selecting the main app', () => {
  assert.match(jungle, /<button class="fr-star" type="button" data-main-star aria-pressed="false"/, 'each app card renders its own main-app control');
  assert.match(jungle, /\.fr-star\{[^}]*left:4px;bottom:24px/);
  assert.doesNotMatch(jungle.match(/\.fr-star\{([^}]*)\}/)?.[1] || '', /top:/, 'the card star is anchored at the bottom-left');
  assert.match(jungle, /\.fr-star\[aria-pressed="true"\] svg path\{fill:var\(--ff/);
  assert.match(jungle, /star = tile\.querySelector\('\[data-main-star\]'\)/);
  assert.match(jungle, /star\.setAttribute\('aria-pressed', String\(isMain\)\)/);
  assert.match(jungle, /const star = e\.target\.closest\('\[data-main-star\]'\); if \(star\).*?setMain\(star\.closest\('\.fr'\)\.dataset\.id\); return;/s);
});

test('Parallax Jungle keeps app launching separate from star selection', () => {
  assert.match(jungle, /const launcherButton = e\.target\.closest\('\.fr-launch'\), p = launcherButton && launcherButton\.closest\('\.fr'\); if \(p\) \{ AS\[p\.dataset\.id\]\.v \+= \.3; launch\(p\.dataset\.id\); \}/);
  assert.match(jungle, /class="fr-launch" type="button" aria-label="Open \$\{a\.name\}/);
  assert.match(jungle, /classList\.toggle\('main', isMain\)/);
});

test('Parallax Jungle daylight base background is muted enough for white scene labels', () => {
  const lightMode = jungle.match(/body\[data-theme=light\]\{([^}]*)\}/)?.[1] || '';
  assert.match(lightMode, /--bg:#b8cdbd/);
  assert.doesNotMatch(lightMode, /--bg:#cfe3d6/, 'the old bright mint background should not return');
});

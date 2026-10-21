const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (filename) => fs.readFileSync(path.join(__dirname, '..', 'src', filename), 'utf8');

const topbarCases = [
  ['home-v3.html', [
    /<span class="chip" aria-label="Current time" hidden>[\s\S]*?id="clock"/,
    /<span class="chip hide-s" hidden>RAM[\s\S]*?id="chipRam"/,
    /<span class="chip hide-s" hidden>CPU[\s\S]*?id="chipCpu"/,
  ]],
  ['home-v4.html', [
    /<span class="chip" aria-label="Current time" hidden>[\s\S]*?id="clock"/,
    /<span class="chip hide-s" hidden>RAM[\s\S]*?id="chipRam"/,
    /<span class="chip hide-s" hidden>CPU[\s\S]*?id="chipCpu"/,
  ]],
  ['home-claymorphism.html', [
    /<span class="chip" aria-label="Current time" hidden>[\s\S]*?id="clock"/,
    /<span class="chip hide-s" hidden>RAM[\s\S]*?id="chipRam"/,
    /<span class="chip hide-s" hidden>CPU[\s\S]*?id="chipCpu"/,
  ]],
  ['home-glass.html', [
    /<span class="chip" aria-label="Current time" hidden>[\s\S]*?id="clock"/,
    /<span class="chip hide-s" hidden>RAM[\s\S]*?id="chipRam"/,
    /<span class="chip hide-s" hidden>CPU[\s\S]*?id="chipCpu"/,
  ]],
  ['home-parallax-jungle.html', [
    /<span class="chip" aria-label="Current time" hidden>[\s\S]*?id="clock"/,
    /<span class="chip hs" hidden>RAM[\s\S]*?id="chipRam"/,
    /<span class="chip hs" hidden>CPU[\s\S]*?id="chipCpu"/,
  ]],
  ['home-retro.html', [
    /<span class="chip" aria-label="Current time" hidden>[\s\S]*?id="clock"/,
    /<span class="chip hide-s" hidden>MEM[\s\S]*?id="cm"/,
    /<span class="chip hide-s" hidden>CPU[\s\S]*?id="cc"/,
  ]],
];

test('topbar CPU, RAM, and time indicators are hidden in every theme that duplicated them', () => {
  const sharedChrome = read('home-style-chrome.css');
  assert.match(sharedChrome, /header\.top \.chip\[hidden\][\s\S]*?display: none !important/);
  assert.match(sharedChrome, /header\.bar \.chip\[hidden\][\s\S]*?display: none !important/);
  assert.match(sharedChrome, /\.topbar \.status-chip\[hidden\][\s\S]*?display: none !important/);
  for (const [filename, patterns] of topbarCases) {
    const html = read(filename);
    for (const pattern of patterns) assert.match(html, pattern, `${filename} should hide ${pattern}`);
  }
});

test('in-page system monitor remains present and visible after topbar cleanup', () => {
  const required = {
    'home-v3.html': ['id="ramBig"', 'id="cpuBig"', 'Live system'],
    'home-v4.html': ['id="ramBig"', 'id="cpuBig"', 'Live system'],
    'home-claymorphism.html': ['id="ramBig"', 'id="cpuBig"', 'Live system'],
    'home-glass.html': ['id="ramBig"', 'id="cpuBig"', 'Live system'],
    'home-isometric-world.html': ['id="ramBig"', 'id="cpuBig"', 'Live system'],
    'home-parallax-jungle.html': ['id="ramBig"', 'id="cpuBig"', 'Live system', 'id="seas"'],
    'home-retro.html': ['id="ramBig"', 'id="cpuBig"', 'aria-label="Live system"'],
  };
  for (const [filename, tokens] of Object.entries(required)) {
    const html = read(filename);
    for (const token of tokens) assert.ok(html.includes(token), `${filename} should retain ${token}`);
  }
});

test('Galaxy compact system monitor omits clock while other theme time displays remain unchanged', () => {
  const galaxy = read('home-galaxy.html');
  assert.match(galaxy, /class="cons-head"[\s\S]*?Live system[\s\S]*?data-memory-refresh/);
  assert.doesNotMatch(galaxy, /id="clock"|id="procs"|id="scope"/, 'the compact Galaxy monitor does not include clock, process-total text, or graph footer');
  assert.match(read('home-retro-complex.html'), /class="chip" aria-label="Current time"[^>]*>[\s\S]*?id="clock"/);
});

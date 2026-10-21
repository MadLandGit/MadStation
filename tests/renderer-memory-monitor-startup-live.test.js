const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('the initial launcher starts live CPU/RAM telemetry without requiring a refresh click', () => {
  const renderer = read('src/renderer.js');
  const syncStart = renderer.indexOf('function syncMemoryMonitor()');
  const syncEnd = renderer.indexOf('// ---------------------------------------------------------------------------\n// AI Playground', syncStart);
  assert.ok(syncStart >= 0 && syncEnd > syncStart, 'syncMemoryMonitor is defined before workspace app code');
  const syncBlock = renderer.slice(syncStart, syncEnd);
  assert.match(syncBlock, /schedule\(\(\) => refreshMemoryMonitor\(\)\)/, 'a first sample is scheduled immediately');
  assert.match(syncBlock, /setInterval\(refreshMemoryMonitor, 2500\)/, 'CPU and RAM continue to update every 2.5 seconds');
  assert.match(syncBlock, /syncMemoryMonitor\(\);\s*$/, 'startup invokes the sync path while launcher is the initial app');
  assert.match(renderer, /function refreshMemoryMonitor\(\)[\s\S]*?window\.aiHub\.getMemoryInfo\(\)/, 'scheduled samples use the real host memory/CPU telemetry API');
});

test('the live telemetry model continues to broadcast into whichever built-in theme is active', () => {
  const renderer = read('src/renderer.js');
  const switcher = read('src/home-page-switcher.js');
  assert.match(renderer, /document\.dispatchEvent\(new CustomEvent\('mad:memory-model', \{ detail: viewModel \}\)\)/);
  assert.match(switcher, /document\.addEventListener\('mad:memory-model',[\s\S]*?latestMemoryModel = event\.detail[\s\S]*?sendToFrame\(mode, 'memory-model', \{ model: latestMemoryModel \}\)/);
  assert.match(switcher, /if \(latestMemoryModel\) sendToFrame\(mode, 'memory-model', \{ model: latestMemoryModel \}\)/, 'a theme opening after sampling receives the latest reading');
});

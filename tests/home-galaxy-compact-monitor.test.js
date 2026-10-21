const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'home-galaxy.html'), 'utf8');

test('Galaxy live-system card is compact, labeled, and keeps refresh at the top-right', () => {
  assert.match(html, /<section class="pan cons" aria-label="Live system CPU and memory">[\s\S]*?<div class="cons-head"><span>Live system<\/span><button class="sys-refresh-btn"[^>]*data-memory-refresh/);
  assert.match(html, /\.cons\s*\{[^}]*width:min\(330px,100%\)[^}]*padding:10px 14px 12px/s);
  assert.match(html, /\.dial\s*\{[^}]*max-width:122px/s, 'CPU and memory meters are much smaller than their previous 170px size');
  assert.match(html, /\.cons-head \.sys-refresh-btn\s*\{/s, 'refresh is styled in the card header');
  assert.match(html, /function dial\(id, name\)[\s\S]*?aria-label=\"\$\{name\}\"/);
  assert.match(html, /\$\('#dials'\)\.innerHTML = dial\('cpu', 'CPU'\) \+ dial\('ram', 'Memory'\)/, 'both CPU and memory meters remain visible and labeled');
});

test('Galaxy compact monitor removes extra graph, total-memory/process text, and clock without breaking telemetry updates', () => {
  assert.doesNotMatch(html, /id="scope"|id="scC"|id="scR"|id="procs"|id="clock"/);
  assert.doesNotMatch(html, /function scope\(\)|function tick\(\)/, 'unused graph and clock update loops are removed');
  assert.match(html, /document\.addEventListener\('mad:memory-model', \(e\) => setSys\(e\.detail \|\| \{\}\)\)/, 'live telemetry event continues to update the meters');
  assert.match(html, /G\.cpu\.T\.textContent = Math\.round\(cpu\) \+ '%'; G\.ram\.T\.textContent = Math\.round\(ram\) \+ '%';/);
});

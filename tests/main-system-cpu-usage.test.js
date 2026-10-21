const test = require('node:test');
const assert = require('node:assert/strict');
const { createSystemCpuUsageSampler } = require('../src/main/system-cpu-usage.js');

function core(user, nice, sys, idle, irq = 0) { return { times: { user, nice, sys, idle, irq } }; }

test('system CPU sampler waits for a baseline before reporting utilization', () => {
  const sample = createSystemCpuUsageSampler();
  assert.equal(sample([core(10, 0, 10, 80)]), null);
  assert.equal(sample([core(10, 0, 10, 180)]), 0, 'idle and total advances are proportionally the same (0% busy)');
});

test('system CPU sampler reports the busy share across all logical cores', () => {
  const sample = createSystemCpuUsageSampler();
  assert.equal(sample([core(0, 0, 0, 100), core(0, 0, 0, 100)]), null);
  // 80 ms total advance per core, 20 ms idle advance per core => 75% busy.
  assert.equal(sample([core(30, 0, 30, 120), core(30, 0, 30, 120)]), 75);
});

test('system CPU sampler clamps numerical noise and resets after invalid samples or core-count changes', () => {
  const sample = createSystemCpuUsageSampler();
  assert.equal(sample([core(10, 0, 0, 90)]), null);
  assert.equal(sample([]), null);
  assert.equal(sample([core(20, 0, 0, 180)]), null, 'invalid sample resets the baseline');
  assert.equal(sample([core(20, 0, 0, 180), core(1, 0, 0, 9)]), null, 'core-count change resets the baseline');
  assert.equal(sample([core(40, 0, 0, 180), core(21, 0, 0, 19)]), 80);
});

test('system CPU sampler rejects malformed or non-monotonic data safely', () => {
  const sample = createSystemCpuUsageSampler();
  assert.equal(sample([{ times: { user: NaN, nice: 0, sys: 0, idle: 0, irq: 0 } }]), null);
  assert.equal(sample([core(20, 0, 0, 80)]), null);
  assert.equal(sample([core(10, 0, 0, 90)]), null, 'backward counters reset the baseline');
});


test('CPU sampler is wired into memory telemetry and included in developer source resources', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.resolve(__dirname, '..');
  const main = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.match(main, /createSystemCpuUsageSampler\(\)/);
  assert.match(main, /sampleSystemCpuUsagePercent\(os\.cpus\(\)\)/);
  assert.match(main, /return \{ \.\.\.snapshot, systemCpuPercent \};/);
  assert.ok(main.includes("'src/main/system-cpu-usage.js'"), 'developer file allowlist includes the CPU sampler source');
  assert.ok(packageJson.build.extraResources.some((item) => item.from === 'src' && item.filter?.includes('main/system-cpu-usage.js')), 'packaged developer source filter includes the CPU sampler');
});

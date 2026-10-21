const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const { sprintf, vsprintf } = require(path.join(__dirname, '..', 'vendor', 'sprintf-js', 'src', 'sprintf.js'));

test('sprintf-js patch clamps unsafe numeric precisions before Number formatting', () => {
  assert.doesNotThrow(() => sprintf('%.101f', 1));
  assert.match(sprintf('%.101f', 1), /^1\.0{100}$/);
  assert.doesNotThrow(() => sprintf('%.101e', 1));
  assert.doesNotThrow(() => sprintf('%.101g', 1));
  assert.equal(sprintf('%.0g', 123.4), '100');
  assert.match(sprintf('%.999999999999999999999999f', 1), /^1\.0{100}$/);
});

test('sprintf-js patch preserves valid numeric formatting through the supported precision limit', () => {
  assert.equal(sprintf('%.2f', 1.25), '1.25');
  assert.equal(sprintf('%.0f', 1.25), '1');
  assert.match(sprintf('%.100f', 1), /^1\.0{100}$/);
  assert.doesNotThrow(() => sprintf('%.100e', 1));
  assert.doesNotThrow(() => sprintf('%.1g', 1));
  assert.equal(vsprintf('%.2f', [3.5]), '3.50');
});

test('sprintf-js patch preserves zero-precision string truncation and ordinary formats', () => {
  assert.equal(sprintf('%.0s', 'Mad Station'), '');
  assert.equal(sprintf('%s %d', 'version', 2), 'version 2');
  assert.equal(sprintf('%.4s', 'Mad Station'), 'Mad ');
});

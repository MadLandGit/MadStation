const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { isPublicSuffix, PUBLIC_SUFFIX_LIST_VERSION, PUBLIC_SUFFIX_LIST_COMMIT, PUBLIC_SUFFIX_RULE_COUNT, PUBLIC_SUFFIX_RULES } = require('../build/main/public-suffix-list.js');

test('PSL exact, wildcard, exception and PRIVATE rules determine public suffix boundaries', () => {
  for (const suffix of ['com', 'co.uk', 'github.io', 'blogspot.com', 'ck', 'foo.ck']) {
    assert.equal(isPublicSuffix(suffix), true, `${suffix} should be a public suffix`);
  }
  for (const registrable of ['example.com', 'example.co.uk', 'tenant.github.io', 'example.blogspot.com', 'www.ck', 'city.kawasaki.jp']) {
    assert.equal(isPublicSuffix(registrable), false, `${registrable} should not itself be a public suffix`);
  }
});

test('PSL snapshot exports current upstream provenance and a complete ASCII-normalized rule corpus', () => {
  assert.match(PUBLIC_SUFFIX_LIST_VERSION, /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}_UTC$/);
  assert.match(PUBLIC_SUFFIX_LIST_COMMIT, /^[a-f0-9]{40}$/);
  assert.ok(PUBLIC_SUFFIX_RULE_COUNT >= 10000, 'the snapshot should contain the complete current upstream corpus');
  const rules = PUBLIC_SUFFIX_RULES.split('\n');
  assert.equal(rules.length, PUBLIC_SUFFIX_RULE_COUNT);
  assert.equal(new Set(rules).size, rules.length);
  assert.ok(rules.every((rule) => /^[\x00-\x7F]+$/.test(rule)), 'rules must be punycode/ASCII normalized');
});

test('the official data updater is part of the repository and documented refresh path', () => {
  const root = path.resolve(__dirname, '..');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const source = fs.readFileSync(path.join(root, 'src/main/public-suffix-list.ts'), 'utf8');
  const notice = fs.readFileSync(path.join(root, 'docs/licenses/Public-Suffix-List-Notice.md'), 'utf8');
  const version = source.match(/PUBLIC_SUFFIX_LIST_VERSION = '([^']+)'/)?.[1];
  const commit = source.match(/PUBLIC_SUFFIX_LIST_COMMIT = '([^']+)'/)?.[1];
  assert.equal(pkg.scripts['update:psl'], 'node scripts/update-public-suffix-list.mjs');
  assert.match(notice, /npm run update:psl/);
  assert.ok(version, 'source should expose upstream version metadata');
  assert.ok(commit, 'source should expose upstream commit metadata');
  assert.ok(notice.includes(version), 'notice version must match the bundled source');
  assert.ok(notice.includes(commit), 'notice commit must match the bundled source');
});

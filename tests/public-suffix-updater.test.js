const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
let updaterPromise;
async function updater() {
  updaterPromise ||= import('../scripts/update-public-suffix-list.mjs');
  return updaterPromise;
}

const fixture = `// Mozilla Public Suffix List\n// VERSION: 2026-10-07_07-28-19_UTC\n// COMMIT: 3929462652695bad04f0a27afb600974014a3c8b\n// ===BEGIN ICANN DOMAINS===\ncom\nco.uk\n*.ck\n!www.ck\nрф\n// ===END ICANN DOMAINS===\n// ===BEGIN PRIVATE DOMAINS===\ngithub.io\nblogspot.com\n// ===END PRIVATE DOMAINS===\n` + 'x'.repeat(100_000);

test('PSL updater parses both sections, preserves wildcard/exception rules and IDNA-normalizes Unicode', async () => {
  const { parseOfficialPsl } = await updater();
  const parsed = parseOfficialPsl(fixture, { minRules: 1 });
  assert.equal(parsed.version, '2026-10-07_07-28-19_UTC');
  assert.equal(parsed.commit, '3929462652695bad04f0a27afb600974014a3c8b');
  assert.deepEqual(parsed.rules, ['!www.ck', '*.ck', 'blogspot.com', 'co.uk', 'com', 'github.io', 'xn--p1ai'].sort());
});

test('PSL updater rejects missing metadata, incomplete sections and undersized data', async () => {
  const { parseOfficialPsl } = await updater();
  assert.throws(() => parseOfficialPsl('com\n'.repeat(100_000)), /VERSION or COMMIT/i);
  const noPrivate = fixture.replace('// ===BEGIN PRIVATE DOMAINS===', '// PRIVATE REMOVED');
  assert.throws(() => parseOfficialPsl(noPrivate, { minRules: 1 }), /ICANN and PRIVATE/i);
  assert.throws(() => parseOfficialPsl(fixture, { minRules: 9000 }), /too small/i);
});

test('PSL updater renderer emits versioned source and license notices', async () => {
  const { parseOfficialPsl, renderModule, renderNotice, renderThirdPartyNotice, OFFICIAL_PSL_URL } = await updater();
  const parsed = parseOfficialPsl(fixture, { minRules: 1 });
  const source = renderModule(parsed, { minRules: 1 });
  assert.match(source, /PUBLIC_SUFFIX_LIST_VERSION = '2026-10-07_07-28-19_UTC'/);
  assert.match(source, /PUBLIC_SUFFIX_RULE_COUNT = 7/);
  assert.match(source, /github\.io/);
  assert.match(renderNotice(parsed), new RegExp(OFFICIAL_PSL_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(renderThirdPartyNotice(parsed), /Mozilla Public License 2\.0/);
});

test('PSL updater is available as a maintainer command and current upstream provenance is explicit', async () => {
  const packageJson = JSON.parse(read('package.json'));
  const source = read('src/main/public-suffix-list.ts');
  const notice = read('docs/licenses/Public-Suffix-List-Notice.md');
  const version = source.match(/PUBLIC_SUFFIX_LIST_VERSION = '([^']+)'/)?.[1];
  const commit = source.match(/PUBLIC_SUFFIX_LIST_COMMIT = '([^']+)'/)?.[1];
  const ruleCount = Number(source.match(/PUBLIC_SUFFIX_RULE_COUNT = (\d+)/)?.[1]);
  assert.equal(packageJson.scripts['update:psl'], 'node scripts/update-public-suffix-list.mjs');
  assert.match(packageJson.scripts.test, /tests\/public-suffix-updater\.test\.js/);
  assert.match(version || '', /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}_UTC$/);
  assert.match(commit || '', /^[a-f0-9]{40}$/);
  assert.ok(ruleCount >= 10000, 'current upstream corpus should not be the retired local OpenJDK snapshot');
  assert.ok(notice.includes(version), 'notice version must match bundled source');
  assert.ok(notice.includes(commit), 'notice commit must match bundled source');
  assert.match(notice, /npm run update:psl/);
});

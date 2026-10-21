const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

 test('security audit is shipped and available through the Developer file allowlist', () => {
  const audit = read('docs/security/SECURITY_AUDIT.md');
  const main = read('src/main.js');
  const pkg = JSON.parse(read('package.json'));
  assert.match(audit, /independent penetration test/i);
  assert.match(main, /'docs\/security\/SECURITY_AUDIT\.md'/);
  assert.ok(pkg.build.extraResources.some((item) => item.from === 'docs/security/SECURITY_AUDIT.md' && item.to === 'developer-docs/docs/security/SECURITY_AUDIT.md'));
  assert.ok(pkg.scripts.test.includes('tests/security-audit-contract.test.js'));
});

test('IPC security report matches the common trust, lock, payload and workspace gates', () => {
  const main = read('src/main.js');
  assert.match(main, /function isTrustedSender\(/);
  assert.match(main, /if \(!isTrustedSender\(event, options\)\)/);
  assert.match(main, /if \(locked && !ALLOWED_WHILE_LOCKED\.has\(channel\)\)/);
  assert.match(main, /if \(!isSafeIpcPayload\(args\)\)/);
  assert.match(main, /function handleForWorkspace\(workspace, message\)/);
  assert.match(main, /handleForWorkspaces\(\['ai-lab', 'instruction-forge'\]/);
});

test('API credential and network protections remain documented and wired', () => {
  const aiLab = read('src/main/ai-lab-runtime.ts');
  const iconCache = read('src/main/icon-cache.ts');
  const native = read('src/main/native-operations-runtime.ts');
  assert.match(aiLab, /mad-station-bound-ai-key:v1:/);
  assert.match(aiLab, /redirect: 'error'/);
  assert.match(aiLab, /readBoundedResponseText/);
  assert.match(iconCache, /lookup: lookupPublicHost/);
  assert.match(iconCache, /return fetchImage\(next, redirects \+ 1\)/);
  assert.match(native, /Provider verification redirects are blocked/);
  assert.match(native, /The release feed must use HTTPS/);
});

test('account permission checks validate requesting, top-level and embedded origins', () => {
  const security = read('src/main/account-session-security.ts');
  assert.match(security, /if \(!hostsOk\(requesting\)\) return false/);
  assert.match(security, /if \(details\.embeddingOrigin && !hostsOk\(details\.embeddingOrigin\)\) return false/);
  assert.match(security, /callback\(hostsOk\(requesting\) && hostsOk\(topUrl\)/);
});

test('background file ownership rejects generated-name symlink targets and report calls out release gaps', () => {
  const background = read('src/main/background-files.ts');
  const report = read('docs/security/SECURITY_AUDIT.md');
  assert.match(background, /lstatSync/);
  assert.match(background, /isSymbolicLink\(\)/);
  assert.match(report, /No live Electron security test has run/i);
  assert.match(report, /Public Suffix List/i);
});

test('security closure enforces PSL-based auth hosts and public-DNS-pinned main-process probes', () => {
  const validation = read('src/main/input-validation.ts');
  const suffixes = read('src/main/public-suffix-list.ts');
  const network = read('src/main/network-security.ts');
  const native = read('src/main/native-operations-runtime.ts');
  const diagnostics = read('src/main/memory-diagnostics-runtime.ts');
  const main = read('src/main.js');
  assert.match(validation, /isPublicSuffix\(domain\)/);
  assert.match(suffixes, /github\.io/);
  assert.match(network, /createPinnedPublicLookup/);
  assert.match(network, /resolvePublicInternetAddresses/);
  assert.match(native, /dependencies\.resolvePublicHost/);
  assert.match(diagnostics, /dependencies\.resolvePublicHost/);
  assert.match(main, /fetchPinnedHttpsJson\(url, addresses\)/);
  assert.match(main, /createPinnedHttpsRequest\(url, addresses, 'HEAD'\)/);
});


test('PSL licensing and freshness limitations are disclosed and shipped with the app', () => {
  const notice = read('docs/licenses/THIRD_PARTY_NOTICES.md');
  const pslNotice = read('docs/licenses/Public-Suffix-List-Notice.md');
  const audit = read('docs/security/SECURITY_AUDIT.md');
  const main = read('src/main.js');
  const pkg = JSON.parse(read('package.json'));
  assert.match(notice, /Mozilla Public License 2\.0/i);
  assert.match(pslNotice, /2026-10-16_09-29-46_UTC/);
  assert.match(pslNotice, /91b4bd846240a84afb33695d5a51adcbc4cfd9ca/);
  assert.match(pslNotice, /npm run update:psl/);
  assert.match(pslNotice, /before security-sensitive releases/i);
  assert.match(audit, /2026-10-07_07-28-19_UTC/);
  assert.ok(pkg.scripts['update:psl'], 'maintainer updater must be available');
  for (const item of [
    ['docs/licenses/THIRD_PARTY_NOTICES.md', 'developer-docs/docs/licenses/THIRD_PARTY_NOTICES.md'],
    ['docs/licenses/Public-Suffix-List-Notice.md', 'developer-docs/docs/licenses/Public-Suffix-List-Notice.md'],
    ['docs/licenses/MPL-2.0.txt', 'developer-docs/docs/licenses/MPL-2.0.txt'],
  ]) {
    assert.ok(pkg.build.extraResources.some((entry) => entry.from === item[0] && entry.to === item[1]));
    assert.ok(main.includes(`'${item[0]}'`));
  }
});




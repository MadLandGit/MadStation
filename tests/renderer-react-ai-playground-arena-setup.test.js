const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Arena setup React entry is wired through Vite, HTML, package selection, source resources and Developer allowlist', () => {
  const vite = read('vite.config.ts');
  const html = read('src/renderer.html');
  const pkg = JSON.parse(read('package.json'));
  const main = read('src/main.js');
  assert.match(vite, /'ai-playground-arena-setup-react': resolve\(__dirname, 'src\/renderer-react\/ai-playground-arena-setup\.tsx'\)/);
  assert.equal([...html.matchAll(/src="\.\.\/build\/ai-playground-arena-setup-react\.js"/g)].length, 1);
  assert.ok(pkg.scripts.test.includes('tests/renderer-react-ai-playground-arena-setup.test.js'));
  assert.ok(pkg.build.extraResources.some((item) => item.from === 'src' && item.filter?.includes('renderer-react/ai-playground-arena-setup.tsx')));
  assert.match(main, /DEVELOPER_FILES = new Set\([\s\S]*?'src\/renderer-react\/ai-playground-arena-setup\.tsx'/);
});

test('React owns provider and account creation controls with bounded controlled fields and accessible empty state', () => {
  const html = read('src/renderer.html');
  const component = read('src/renderer-react/ai-playground-arena-setup.tsx');
  assert.match(html, /id="arenaSetupLegacy"[\s\S]*?id="arenaSetupReactMount"/);
  assert.match(component, /function ArenaSetupForm\(/);
  for (const text of ['Provider', 'Account name (optional)', "Add a provider that isn't listed", 'Provider name', 'Website (https)', 'Add account', 'Add provider']) {
    assert.ok(component.includes(text), `component should include ${text}`);
  }
  assert.match(component, /maxLength=\{60\}/);
  assert.match(component, /maxLength=\{300\}/);
  assert.match(component, /No providers/);
  assert.match(component, /value=\{providerId\}/);
  assert.doesNotMatch(component, /dangerouslySetInnerHTML|\.innerHTML|localStorage|window\.aiHub|fetch\(/);
});

test('Host publishes an explicit account-setup view model and maintains startup fallback ownership', () => {
  const renderer = read('src/renderer.js');
  const component = read('src/renderer-react/ai-playground-arena-setup.tsx');
  assert.match(renderer, /function arenaSetupViewModel\(\)[\s\S]*?providers: arena\.providers\.map[\s\S]*?selectedProviderId:[\s\S]*?accountResetVersion:[\s\S]*?providerResetVersion:/);
  assert.match(renderer, /function publishArenaSetupForm\(\)[\s\S]*?madstation:arena-setup-state/);
  assert.match(component, /madstation:arena-setup-state/);
  assert.match(component, /madstation:arena-setup-mounted/);
  assert.match(renderer, /window\.addEventListener\('madstation:arena-setup-mounted',[\s\S]*?arenaSetupReactMounted = true[\s\S]*?legacy\.hidden = true[\s\S]*?mount\.hidden = false[\s\S]*?publishArenaSetupForm\(\)/);
  assert.match(renderer, /if \(sel && !arenaSetupReactMounted\)[\s\S]*?sel\.replaceChildren\(\.\.\.options\)/);
});

test('Host bounds and validates React provider/account actions before calling trusted existing APIs', () => {
  const renderer = read('src/renderer.js');
  assert.match(renderer, /function handleArenaSetupAction\(event\)[\s\S]*?action\.type === 'select-provider'[\s\S]*?action\.type === 'add-account'[\s\S]*?action\.type === 'add-provider'/);
  assert.match(renderer, /typeof action\.providerId !== 'string' \|\| action\.providerId\.length > 128/);
  assert.match(renderer, /typeof action\.name !== 'string' \|\| action\.name\.length > 60/);
  assert.match(renderer, /typeof action\.url !== 'string' \|\| action\.url\.length > 300/);
  assert.match(renderer, /!arenaProviderById\(action\.providerId\)/);
  assert.match(renderer, /window\.addEventListener\('madstation:arena-setup-action', handleArenaSetupAction\)/);
  assert.match(renderer, /window\.aiHub\.arenaAddAccount\(\{ providerId, name: rawName \}\)/);
  assert.match(renderer, /window\.aiHub\.arenaAddProvider\(\{ name: rawName, url: rawUrl \}\)/);
});

test('Successful mutations reset only after host API success and keep provider choices synchronized', () => {
  const renderer = read('src/renderer.js');
  assert.match(renderer, /async function arenaAddAccountAction\(draft = null\)[\s\S]*?if \(!applyArenaState\(result\)\) return showToast[\s\S]*?arenaSetupAccountResetVersion \+= 1[\s\S]*?renderArenaAccounts\(\)/);
  assert.match(renderer, /async function arenaAddProviderAction\(draft = null\)[\s\S]*?if \(!applyArenaState\(result\)\) return showToast[\s\S]*?arenaSetupProviderResetVersion \+= 1[\s\S]*?arenaAddAccountProviderId = result\.provider\.id[\s\S]*?renderArenaAccounts\(\)/);
  assert.match(renderer, /arenaProviderById\(preferredProviderId\)\) arenaAddAccountProviderId = preferredProviderId/);
});

test('React sends typed custom-event actions and handles Enter without direct persistence or DOM injection', () => {
  const component = read('src/renderer-react/ai-playground-arena-setup.tsx');
  assert.match(component, /type ArenaSetupAction =/);
  assert.match(component, /madstation:arena-setup-action/);
  assert.match(component, /event\.key === 'Enter'/);
  assert.match(component, /dispatch\(\{ type: 'add-account', providerId, name: accountName \}\)/);
  assert.match(component, /dispatch\(\{ type: 'add-provider', name: providerName, url: providerUrl \}\)/);
  assert.match(component, /Number\.isSafeInteger\(candidate\.accountResetVersion\)/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('AI Hub provider/account create-edit forms are React-owned, built, loaded, tested, and packaged', () => {
  const component = read('src/renderer-react/ai-hub-management-forms.tsx');
  const vite = read('vite.config.ts');
  const html = read('src/renderer.html');
  const pkg = JSON.parse(read('package.json'));
  assert.match(vite, /'ai-hub-management-forms-react': resolve\(__dirname, 'src\/renderer-react\/ai-hub-management-forms\.tsx'\)/);
  assert.match(html, /id="accountFormReactMount"/);
  assert.match(html, /id="providerFormReactMount"/);
  assert.match(html, /src="\.\.\/build\/ai-hub-management-forms-react\.js"/);
  assert.match(component, /createPortal\(<AccountForm/);
  assert.match(component, /createPortal\(<ProviderForm/);
  assert.match(pkg.scripts.test, /tests\/renderer-react-ai-hub-management-forms\.test\.js/);
  assert.ok(pkg.build.extraResources.some((resource) => resource.from === 'src' && resource.filter?.includes('renderer-react/ai-hub-management-forms.tsx')));
});

test('React form state preserves account preference tri-states and provider payload normalization', () => {
  const component = read('src/renderer-react/ai-hub-management-forms.tsx');
  for (const marker of [
    'pageZoom: Number(accountDraft.pageZoom)',
    'clearCacheOnExit: toNullableBoolean(accountDraft.clearCacheOnExit)',
    'signOutOnExit: toNullableBoolean(accountDraft.signOutOnExit)',
    'camera: toOptionalBoolean(accountDraft.camera)',
    'microphone: toOptionalBoolean(accountDraft.microphone)',
    'notifications: toOptionalBoolean(accountDraft.notifications)',
    'fullscreen: toOptionalBoolean(accountDraft.fullscreen)',
    "authDomains: providerDraft.authDomains.split(',').map((value) => value.trim()).filter(Boolean)",
    "shortcut: accountDraft.shortcut === 'Press keys…' ? ''",
    'temporary: accountDraft.temporary',
  ]) assert.ok(component.includes(marker), `missing payload contract: ${marker}`);
  assert.match(component, /function toNullableBoolean\(value: string\): boolean \| null/);
  assert.match(component, /function toOptionalBoolean\(value: string\): boolean \| undefined/);
  assert.doesNotMatch(component, /const toNullableBoolean\s*=|const toOptionalBoolean\s*=/);
  assert.match(component, /onChange=\{onProviderChange\}/);
  assert.match(component, /window\.MadStationAiHubManagementFormsHost\?\.saveAccount/);
  assert.match(component, /window\.MadStationAiHubManagementFormsHost\?\.saveProvider/);
  assert.doesNotMatch(component, /dangerouslySetInnerHTML|\.innerHTML/);
});

test('renderer delegates account/provider draft state and persistence to the typed React form boundary', () => {
  const renderer = read('src/renderer.js');
  const html = read('src/renderer.html');
  assert.match(renderer, /window\.MadStationAiHubManagementFormsHost\s*=\s*\{/);
  assert.match(renderer, /openAccount\(draft, managementFormProviders\(\), forceTemporary\)/);
  assert.match(renderer, /openProvider\(draft\)/);
  assert.match(renderer, /saveAccount\(id, payload\)[\s\S]*?window\.aiHub\.updateAccount\(id, payload\)[\s\S]*?window\.aiHub\.addAccount\(payload\)/);
  assert.match(renderer, /saveProvider\(id, payload\)[\s\S]*?window\.aiHub\.updateService\(id, payload\)[\s\S]*?window\.aiHub\.addService\(payload\)/);
  assert.doesNotMatch(renderer, /\$\('addForm'\)\.addEventListener\('submit'/);
  assert.doesNotMatch(renderer, /\$\('providerForm'\)\.addEventListener\('submit'/);
  assert.doesNotMatch(renderer, /\$\('accountName'\)\.value\s*=/);
  assert.doesNotMatch(renderer, /\$\('providerName'\)\.value\s*=/);
  assert.match(html, /id="accountFormReactMount"><\/div>/);
  assert.match(html, /id="providerFormReactMount"><\/div>/);
});

test('new-account duplication and shortcut recording use the React form controller', () => {
  const renderer = read('src/renderer.js');
  const component = read('src/renderer-react/ai-hub-management-forms.tsx');
  assert.match(renderer, /function duplicateAccount\(id\)[\s\S]*?openAccountModal\('', null, false, \{/);
  assert.match(renderer, /MadStationAiHubManagementForms\?\.setAccountShortcut\(shortcut\)/);
  assert.match(component, /dispatchEvent\(new CustomEvent\('madstation:record-account-shortcut'\)\)/);
  assert.match(renderer, /document\.addEventListener\('madstation:record-account-shortcut'/);
});

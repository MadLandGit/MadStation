const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('AI Hub provider/account/shortcut management lists are built, loaded, tested, and packaged', () => {
  const component = read('src/renderer-react/ai-hub-management-lists.tsx');
  const vite = read('vite.config.ts');
  const html = read('src/renderer.html');
  const pkg = JSON.parse(read('package.json'));
  assert.match(vite, /'ai-hub-management-lists-react': resolve\(__dirname, 'src\/renderer-react\/ai-hub-management-lists\.tsx'\)/);
  assert.match(html, /src="\.\.\/build\/ai-hub-management-lists-react\.js"/);
  assert.match(component, /createRoot\(providerHost\)/);
  assert.match(component, /createRoot\(accountHost\)/);
  assert.match(component, /createRoot\(shortcutHost\)/);
  assert.match(pkg.scripts.test, /tests\/renderer-react-ai-hub-management-lists\.test\.js/);
  assert.ok(pkg.build.extraResources.some((resource) => resource.from === 'src' && resource.filter?.includes('renderer-react/ai-hub-management-lists.tsx')));
});

test('React-owned management rows preserve action, ordering, icon, selection, and keyboard-shortcut contracts', () => {
  const component = read('src/renderer-react/ai-hub-management-lists.tsx');
  for (const marker of [
    'data-reorder-type="service"', 'data-reorder-type="account"',
    'data-order-action="up"', 'data-order-action="down"',
    'data-action="edit-provider"', 'data-action="delete-provider"',
    'data-account-action="shortcut"', 'data-account-action="rename"', 'data-account-action="delete"',
    'data-shortcut-id={account.id}', 'data-clear-shortcut={account.id}',
    'bridge.reorder(', 'bridge.moveOrder(', 'bridge.clearShortcut(',
  ]) assert.ok(component.includes(marker), `missing expected management contract: ${marker}`);
  assert.match(component, /aria-label=\{`Move \$\{service\.name\} up`\}/);
  assert.match(component, /aria-label=\{`Move \$\{account\.name\} up`\}/);
  assert.match(component, /data-icon-candidates=\{encodeURIComponent\(JSON\.stringify\(list\)\)\}/);
  assert.doesNotMatch(component, /dangerouslySetInnerHTML|\.innerHTML/);
});

test('legacy provider/account/shortcut settings list renderer has been removed from renderer.js', () => {
  const renderer = read('src/renderer.js');
  assert.doesNotMatch(renderer, /function renderProviderList\s*\(/);
  assert.doesNotMatch(renderer, /function renderSettingsAccounts\s*\(/);
  assert.match(renderer, /function renderAiHubManagementLists\s*\(/);
  assert.match(renderer, /window\.MadStationAiHubManagementLists\s*=\s*\{/);
  assert.match(renderer, /attachReactRenderer\(renderer\)[\s\S]*?renderAiHubManagementLists\(\)/);
  assert.match(renderer, /function renderShortcuts\(\)\s*\{\s*renderAiHubManagementLists\(\);\s*\}/);
  assert.doesNotMatch(renderer, /Account cards \(legacy startup fallback only\)/);
});

test('management bridge delegates host mutations and rejects malformed reorder requests', () => {
  const renderer = read('src/renderer.js');
  assert.match(renderer, /action\(action, id\)\s*\{[\s\S]*?edit-provider[\s\S]*?delete-provider[\s\S]*?select-account[\s\S]*?rename-account[\s\S]*?delete-account/);
  assert.match(renderer, /if \(\(type !== 'service' && type !== 'account'\) \|\| typeof draggedId !== 'string' \|\| typeof targetId !== 'string' \|\| typeof after !== 'boolean'\) return;/);
  assert.match(renderer, /const ids = computeReorder\(currentOrderIds\(type\), draggedId, targetId, after\);\s*if \(ids\) void persistOrder\(type, ids\);/);
  assert.match(renderer, /root\.textContent = 'Loading accounts…';/);
});

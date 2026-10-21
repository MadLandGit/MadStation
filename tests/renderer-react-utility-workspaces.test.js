const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Clipboard and To-do workspace React entry is wired into Vite, HTML, packaging and regression commands', () => {
  const html = read('src/renderer.html');
  const vite = read('vite.config.ts');
  const pkg = JSON.parse(read('package.json'));
  const main = read('src/main.js');
  assert.match(html, /id="utilityWorkspacesReactRoot"/);
  assert.match(html, /src="\.\.\/build\/utility-workspaces-react\.js"/);
  assert.match(vite, /'utility-workspaces-react': resolve\(__dirname, 'src\/renderer-react\/utility-workspaces\.tsx'\)/);
  assert.ok(pkg.build.extraResources.some((resource) => resource.from === 'src' && resource.filter?.includes('renderer-react/utility-workspaces.tsx')));
  assert.match(main, /'src\/renderer-react\/utility-workspaces\.tsx'/);
  assert.match(pkg.scripts.test, /renderer-react-utility-workspaces\.test\.js/);
});

test('Clipboard composer, summary, search, filter, sort and list toolbar are React-owned', () => {
  const html = read('src/renderer.html');
  const component = read('src/renderer-react/utility-workspaces.tsx');
  assert.match(html, /id="clipboardStatsReactMount"/);
  assert.match(html, /id="utilityTabsReactMount"/);
  assert.match(html, /id="utilitySettingsButtonsReactMount"/);
  assert.match(html, /<div class="clipboard-compose card" id="clipboardComposer">/);
  assert.match(html, /id="clipboardListHeaderReactMount"/);
  assert.match(html, /id="clipboardToolbarReactMount"/);
  for (const name of ['UtilityTabs', 'UtilitySettingsButtons', 'ClipboardComposer', 'ClipboardStats', 'ClipboardListHeader', 'ClipboardToolbar']) assert.match(component, new RegExp(`function ${name}`));
  for (const type of ['draft-change', 'save', 'cancel-edit', 'search-change', 'filter-change', 'sort-change', 'clear-all']) assert.match(component, new RegExp(`type: '${type}'`));
  assert.doesNotMatch(html, /id="(?:clipboardInput|clipboardSearch|clipboardSort|clipboardTotalCount|clipboardPinnedLinksCount|clipboardTodayCount)"/);
});

test('To-do hero, composer, filters and both settings dialogs are React-owned', () => {
  const renderer = read('src/renderer.js');
  const html = read('src/renderer.html');
  const component = read('src/renderer-react/utility-workspaces.tsx');
  assert.match(html, /id="todoHeroReactMount"/);
  assert.match(html, /id="todoComposerReactMount"/);
  assert.match(html, /id="todoToolbarReactMount"/);
  assert.match(html, /<div class="modal hidden feature-settings-modal" id="clipboardSettingsModal"><\/div>/);
  assert.match(html, /<div class="modal hidden feature-settings-modal" id="todoSettingsModal"><\/div>/);
  for (const name of ['TodoHero', 'TodoComposer', 'TodoToolbar', 'ClipboardSettingsDialog', 'TodoSettingsDialog']) assert.match(component, new RegExp(`function ${name}`));
  assert.match(component, /madstation:todo-workspace-action/);
  assert.match(component, /data-utility-tab=\{tab.value\}/);
  assert.match(renderer, /action.type === 'utility-tab-change'/);
  assert.doesNotMatch(html, /id="(?:todoInput|todoCount|todoListMeta|todoMaxItems|todoDefaultSort|todoHideCompleted|todoConfirmDelete)"/);
});

test('UI actions cross a typed-by-contract event bridge; storage and mutations remain host-owned', () => {
  const component = read('src/renderer-react/utility-workspaces.tsx');
  const renderer = read('src/renderer.js');
  assert.match(component, /madstation:clipboard-workspace-action/);
  assert.match(component, /madstation:todo-workspace-action/);
  assert.match(component, /data-utility-tab=\{tab.value\}/);
  assert.match(renderer, /action.type === 'utility-tab-change'/);
  assert.match(component, /interface UtilityWorkspacesController/);
  assert.match(renderer, /function handleClipboardWorkspaceAction\(action\)/);
  assert.match(renderer, /function handleTodoWorkspaceAction\(action\)/);
  assert.match(renderer, /function persistClipboardItems\(\)/);
  assert.match(renderer, /function saveTodos\(\)/);
  assert.match(renderer, /window\.addEventListener\('madstation:clipboard-workspace-action'/);
  assert.match(renderer, /window\.addEventListener\('madstation:todo-workspace-action'/);
  assert.doesNotMatch(component, /localStorage|indexedDB|window\.aiHub|dangerouslySetInnerHTML|\.innerHTML/);
});

test('Clipboard history loads with stored settings and preserves keyboard shortcuts and destructive confirmations', () => {
  const renderer = read('src/renderer.js');
  assert.match(renderer, /loadClipboardSettings\(\);\s*void loadClipboardItems\(\);\s*void loadUtilityData\(\);/);
  assert.match(renderer, /clipboardSettings\.confirmClear && !window\.confirm\('Clear all saved clips\?/);
  assert.match(renderer, /onDelete: \(id\) => \{[\s\S]*clipboardItems = clipboardItems\.filter/);
  assert.match(renderer, /event\.key\.toLowerCase\(\) === 'f'[\s\S]*clipboardSearch/);
  assert.match(renderer, /event\.key\.toLowerCase\(\) === 'n'[\s\S]*clipboardInput/);
  assert.doesNotMatch(renderer, /\$\('(?:clipboardInput|clipboardSearch|clipboardSort|todoInput|todoMaxItems|todoDefaultSort|clipboardMaxItems|clipboardMaxLength)'\)\.(?:value|checked)\s*=/);
});


test('utility settings dialogs preserve staged edits across host model refreshes and restore focus', () => {
  const component = read('src/renderer-react/utility-workspaces.tsx');
  assert.match(component, /Only take a fresh settings snapshot when the dialog opens/);
  assert.match(component, /visible && !wasVisibleRef\.current/);
  assert.match(component, /if \(target\?\.isConnected\) requestAnimationFrame\(\(\) => target\.focus\(\)\)/);
  assert.match(component, /overlay\.addEventListener\('keydown', onKeyDown, true\)/);
});

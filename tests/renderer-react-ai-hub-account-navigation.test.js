'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('AI Hub account navigation React entry is wired through Vite, HTML, tests, and developer-source packaging', () => {
  const vite = read('vite.config.ts');
  const html = read('src/renderer.html');
  const pkg = JSON.parse(read('package.json'));
  assert.match(vite, /'ai-hub-account-navigation-react': resolve\(__dirname, 'src\/renderer-react\/ai-hub-account-navigation\.tsx'\)/);
  assert.match(html, /src="\.\.\/build\/ai-hub-account-navigation-react\.js"/);
  assert.match(html, /id="orgBar"/);
  assert.match(html, /id="recentAccounts"/);
  assert.match(pkg.scripts.test, /tests\/renderer-react-ai-hub-account-navigation\.test\.js/);
  assert.ok(pkg.build.extraResources.some((resource) => resource.from === 'src' && resource.filter?.includes('renderer-react/ai-hub-account-navigation.tsx')));
});

test('React owns provider filter tiles, group/favorite controls, recent chips, and the account-list heading without HTML-string rendering', () => {
  const component = read('src/renderer-react/ai-hub-account-navigation.tsx');
  for (const marker of [
    'data-provider-filter="all"',
    'data-reorder-type="service"',
    'bridge.openProviderMenu(service.id',
    'bridge.moveOrder(service.id',
    'bridge.reorder(dragged, service.id, after)',
    'id="orgAllBtn"',
    'id="orgFavoritesBtn"',
    'id="orgGroupFilter"',
    'data-recent-id={account.id}',
    'titleRoot?.render(model.listTitle)',
  ]) assert.ok(component.includes(marker), `missing account-navigation behavior: ${marker}`);
  assert.match(read('src/renderer.html'), /id="providerTiles" role="tablist"/); // existing accessible tablist container
  assert.match(component, /aria-selected=\{selected\}/);
  assert.match(component, /event\.key === 'ArrowLeft' \? 'up' : 'down'/);
  assert.match(component, /referrerPolicy="no-referrer"/);
  assert.doesNotMatch(component, /dangerouslySetInnerHTML|innerHTML\s*=/);
});

test('trusted renderer bridge bounds account-navigation actions and keeps legacy DOM work as startup fallback only', () => {
  const renderer = read('src/renderer.js');
  const ui = renderer.slice(renderer.indexOf('window.MadStationAiHubAccountNavigation = {'), renderer.indexOf('function renderAccountsSidebarImpl()'));
  assert.match(ui, /id !== 'all' && !state\.services\.some\(\(service\) => service\.id === id\)/);
  assert.match(ui, /state\.services\.some\(\(service\) => service\.id === id\) && Number\.isFinite\(x\) && Number\.isFinite\(y\)/);
  assert.match(ui, /state\.accounts\.some\(\(account\) => account\.id === id\)/);
  assert.match(ui, /computeReorder\(currentOrderIds\('service'\), draggedId, targetId, after\)/);
  assert.match(renderer, /if \(typeof aiHubAccountNavigationReactRenderer === 'function'\) return;/);
  const groupFilterFallback = renderer.slice(renderer.indexOf('function renderOrganizationFilters()'), renderer.indexOf('function renderAccountsSidebar()'));
  assert.match(groupFilterFallback, /option\.textContent = String\(group\)/);
  assert.match(groupFilterFallback, /select\.replaceChildren\(\.\.\.options\)/);
  assert.doesNotMatch(groupFilterFallback, /innerHTML\s*=|insertAdjacentHTML/);
  const sidebar = renderer.slice(renderer.indexOf('function renderAccountsSidebarImpl()'), renderer.indexOf('// ---- Account options menu'));
  assert.match(sidebar, /if \(!navigationReactOwnsUi\)\s*\{/);
  assert.match(sidebar, /renderAiHubAccountNavigation\(\{[\s\S]*?services: modelServices,[\s\S]*?recent: recentModel/);
  assert.match(sidebar, /if \(organizationFilter\.group && !groups\.includes\(organizationFilter\.group\)\)/);
});

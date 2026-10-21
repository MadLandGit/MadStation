'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('context menu React entry is wired into Vite, renderer HTML, the canonical test list and source packaging', () => {
  const vite = read('vite.config.ts');
  const html = read('src/renderer.html');
  const pkg = JSON.parse(read('package.json'));
  const main = read('src/main.js');
  assert.match(vite, /'context-menu-react': resolve\(__dirname, 'src\/renderer-react\/context-menu\.tsx'\)/);
  assert.match(html, /src="\.\.\/build\/context-menu-react\.js"/);
  assert.match(pkg.scripts.test, /tests\/renderer-react-context-menu\.test\.js/);
  assert.ok(pkg.build.extraResources.some((resource) => resource.from === 'src' && resource.filter?.includes('renderer-react/context-menu.tsx')));
  assert.match(main, /'src\/renderer-react\/context-menu\.tsx'/);
});

test('context-menu presentation is React-owned and uses a closed SVG icon vocabulary with text rendering', () => {
  const component = read('src/renderer-react/context-menu.tsx');
  for (const name of ['rename', 'plus', 'keyboard', 'refresh', 'reset', 'trash', 'arrowLeft', 'arrowRight']) {
    assert.match(component, new RegExp(`case '${name}'`));
  }
  assert.match(component, /role="menuitem"/);
  assert.match(component, /role="separator"/);
  assert.match(component, /<span>\{item\.label\}<\/span>/);
  assert.doesNotMatch(component, /dangerouslySetInnerHTML|innerHTML\s*=/);
  assert.match(component, /flushSync\(\(\) => root\?\.render/);
});

test('host bridge retains action closures and bounds menu models and action indices', () => {
  const renderer = read('src/renderer.js');
  const bridge = renderer.slice(renderer.indexOf('window.MadStationContextMenu = {'), renderer.indexOf('function duplicateAccount'));
  assert.match(bridge, /Number\.isInteger\(id\)/);
  assert.match(bridge, /id >= contextMenuActions\.length/);
  assert.match(bridge, /typeof run !== 'function'/);
  const show = renderer.slice(renderer.indexOf('function showCtxMenu('), renderer.indexOf('async function resetAccountLogin'));
  assert.match(show, /items\.slice\(0, 32\)/);
  assert.match(show, /\.slice\(0, 240\)/);
  assert.match(show, /contextMenuIconName\(item\?\.icon\)/);
  assert.match(show, /contextMenuReactRenderer\(contextMenuModel\)/);
});

test('startup fallback accepts only fixed icon constants and writes menu labels as text', () => {
  const renderer = read('src/renderer.js');
  const fallback = renderer.slice(renderer.indexOf('function renderContextMenuFallback('), renderer.indexOf('function closeCtxMenu()'));
  assert.match(fallback, /Object\.values\(ICON\)\.includes\(item\.icon\)/);
  assert.match(fallback, /appendContextMenuIcon\(iconHost, item\.icon\)/);
  assert.match(fallback, /label\.textContent = String\(item\.label \|\| ''\)/);
  assert.doesNotMatch(fallback, /innerHTML|insertAdjacentHTML|escapeHtml\(item\.label\)/);
  assert.match(renderer, /const CONTEXT_MENU_ICON_SHAPES =/);
  assert.match(renderer, /createElementNS\(ns, 'svg'\)/);
});

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const renderer = fs.readFileSync(path.join(root, 'src/renderer.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'src/styles.css'), 'utf8');
const pageStyles = fs.readFileSync(path.join(root, 'src/pages.css'), 'utf8');
const rendererHtml = fs.readFileSync(path.join(root, 'src/renderer.html'), 'utf8');

function sectionBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `expected source section: ${startMarker}`);
  return source.slice(start, end);
}

test('AI Hub sidebar renders before unrelated settings UI', () => {
  const renderBody = sectionBetween(renderer, 'function render() {', '\n}\nfunction hostOfUrl');
  assert.ok(renderBody.indexOf('renderAccountsSidebar();') >= 0);
  assert.ok(renderBody.indexOf('renderAccountsSidebar();') < renderBody.indexOf('applySettings();'));
});

test('AI Hub sidebar rendering catches failures and records visible non-destructive status', () => {
  const sidebar = sectionBetween(renderer, 'function renderAccountsSidebar() {', 'function renderAccountsSidebarImpl() {');
  assert.match(sidebar, /try\s*\{\s*renderAccountsSidebarImpl\(\);/);
  assert.match(sidebar, /catch\s*\(error\)/);
  assert.match(sidebar, /AI Hub sidebar render failed/);
  assert.match(sidebar, /Saved accounts have not been changed/);
  assert.match(styles, /#providerTiles\[data-render-error\]::after,[\s\S]*#accounts\[data-render-error\]::before/);
});

test('incomplete config snapshots retain previous account and provider arrays', () => {
  const normalize = sectionBetween(renderer, 'function normalizeRendererConfigSnapshot(snapshot) {', '\n}\n\nlet startupWorkspaceApplied');
  assert.match(normalize, /services:\s*Array\.isArray\(snapshot\.services\)\s*\?\s*snapshot\.services\.filter\(isRecord\)\s*:\s*state\.services/);
  assert.match(normalize, /accounts:\s*Array\.isArray\(snapshot\.accounts\)\s*\?\s*snapshot\.accounts\.filter\(isRecord\)\s*:\s*state\.accounts/);
  assert.match(normalize, /settings:\s*isRecord\(snapshot\.settings\)\s*\?\s*snapshot\.settings\s*:\s*state\.settings/);
  assert.match(renderer, /Ignored invalid config snapshot; existing renderer state was retained/);
});


test('AI Hub sidebar is hidden outside AI Hub, including launcher themes', () => {
  // The sidebar is a fixed, globally mounted element in shared renderer.html.
  // It must not appear on the launcher or overlap other workspace screens.
  assert.match(rendererHtml, /<aside class="sidebar">/);
  assert.match(renderer, /document\.body\.dataset\.workspaceApp\s*=\s*currentApp/);
  const scopeRule = pageStyles.match(/body:not\(\[data-workspace-app="ai-hub"\]\)\s+\.sidebar\s*\{([^}]*)\}/);
  assert.ok(scopeRule, 'expected an explicit AI Hub-only visibility rule');
  assert.match(scopeRule[1], /display:\s*none\s*!important/);
  assert.match(scopeRule[1], /visibility:\s*hidden\s*!important/);
  assert.match(scopeRule[1], /pointer-events:\s*none\s*!important/);
});

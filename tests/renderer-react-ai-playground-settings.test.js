const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('AI Playground settings React entry is wired through Vite, HTML, tests, and developer source packaging', () => {
  const vite = read('vite.config.ts');
  const html = read('src/renderer.html');
  const pkg = JSON.parse(read('package.json'));
  const main = read('src/main.js');
  assert.match(vite, /'ai-playground-settings-react': resolve\(__dirname, 'src\/renderer-react\/ai-playground-settings\.tsx'\)/);
  assert.equal([...html.matchAll(/src="\.\.\/build\/ai-playground-settings-react\.js"/g)].length, 1);
  assert.ok(pkg.scripts.test.includes('tests/renderer-react-ai-playground-settings.test.js'));
  assert.ok(pkg.build.extraResources.some((item) => item.from === 'src' && item.filter?.includes('renderer-react/ai-playground-settings.tsx')));
  assert.match(main, /DEVELOPER_FILES = new Set\([\s\S]*?'src\/renderer-react\/ai-playground-settings\.tsx'/);
});

test('React owns the AI Playground settings selectors, preference toggles, and Save/Cancel presentation', () => {
  const html = read('src/renderer.html');
  const component = read('src/renderer-react/ai-playground-settings.tsx');
  assert.match(html, /id="aiLabSettingsLegacy"[\s\S]*?id="aiLabSettingsReactMount"/);
  for (const text of ['Default Playground tab', 'Default Arena mode', 'Scan local models when opened', 'Remember Arena account pair', 'Save settings']) {
    assert.ok(component.includes(text), `React component should include ${text}`);
  }
  assert.match(component, /value=\{draft\.defaultTab\}/);
  assert.match(component, /value=\{draft\.defaultArena\}/);
  assert.match(component, /checked=\{draft\.autoScanLocal\}/);
  assert.match(component, /checked=\{draft\.rememberArenaAccounts\}/);
  assert.doesNotMatch(component, /\.innerHTML|localStorage|window\.aiHub|fetch\(/);
});

test('Host view model normalizes stored enums and keeps all persisted state in the host', () => {
  const renderer = read('src/renderer.js');
  assert.match(renderer, /const AI_LAB_ALLOWED_TABS = new Set\(\['model-arena', 'arena-accounts', 'scoreboard'\]\)/);
  assert.match(renderer, /const AI_LAB_ALLOWED_ARENAS = new Set\(\['free-account', 'api', 'local'\]\)/);
  assert.match(renderer, /function aiLabSettingsViewModel\(\)[\s\S]*?AI_LAB_ALLOWED_TABS\.has\(cfg\.defaultTab\)[\s\S]*?AI_LAB_ALLOWED_ARENAS\.has\(cfg\.defaultArena\)[\s\S]*?autoScanLocal: cfg\.autoScanLocal !== false[\s\S]*?rememberArenaAccounts: cfg\.rememberArenaAccounts !== false/);
  assert.match(renderer, /async function saveAiLabSettings\(draft = null\)[\s\S]*?aiLabData\.settings = \{[\s\S]*?const ok = await saveLab\(\)/);
});

test('Host validates enum values and booleans before committing React actions', () => {
  const renderer = read('src/renderer.js');
  assert.match(renderer, /function handleAiLabSettingsAction\(event\)[\s\S]*?typeof action\.defaultTab !== 'string'[\s\S]*?typeof action\.autoScanLocal !== 'boolean'[\s\S]*?AI_LAB_ALLOWED_TABS\.has\(action\.defaultTab\)[\s\S]*?AI_LAB_ALLOWED_ARENAS\.has\(action\.defaultArena\)[\s\S]*?void saveAiLabSettings/);
});

test('React handshake swaps the legacy form only after mount and keeps host overlay lifecycle', () => {
  const renderer = read('src/renderer.js');
  const component = read('src/renderer-react/ai-playground-settings.tsx');
  assert.match(component, /madstation:ai-playground-settings-state/);
  assert.match(component, /madstation:ai-playground-settings-action/);
  assert.match(component, /madstation:ai-playground-settings-mounted/);
  assert.match(renderer, /window\.addEventListener\('madstation:ai-playground-settings-mounted',[\s\S]*?aiLabSettingsReactMounted = true[\s\S]*?legacy\.hidden = true[\s\S]*?mount\.hidden = false[\s\S]*?publishAiLabSettings\(\)/);
  assert.match(renderer, /function closeAiLabSettings\(\) \{ \$\('aiLabSettingsModal'\)\?\.classList\.add\('hidden'\); syncOverlayMode\(\); \}/);
});

test('Fallback retains current settings behavior and React open path republishes latest values', () => {
  const renderer = read('src/renderer.js');
  assert.match(renderer, /function openAiLabSettings\(\)[\s\S]*?if \(aiLabSettingsReactMounted\) publishAiLabSettings\(\);[\s\S]*?aiLabDefaultTab[\s\S]*?aiLabDefaultArena[\s\S]*?syncOverlayMode\(\)/);
  assert.match(renderer, /if \(ok\) \{ closeAiLabSettings\(\); showToast\('AI Playground settings saved\.'\); \}/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Prompt Studio settings React entry is wired in Vite, renderer HTML, tests and source packaging', () => {
  const vite = read('vite.config.ts');
  const html = read('src/renderer.html');
  const pkg = JSON.parse(read('package.json'));
  const main = read('src/main.js');
  assert.match(vite, /'instruction-forge-settings-react': resolve\(__dirname, 'src\/renderer-react\/instruction-forge-settings\.tsx'\)/);
  assert.equal([...html.matchAll(/src="\.\.\/build\/instruction-forge-settings-react\.js"/g)].length, 1);
  assert.ok(pkg.scripts.test.includes('tests/renderer-react-instruction-forge-settings.test.js'));
  assert.ok(pkg.build.extraResources.some((item) => item.from === 'src' && item.filter?.includes('renderer-react/instruction-forge-settings.tsx')));
  assert.match(main, /DEVELOPER_FILES = new Set\([\s\S]*?'src\/renderer-react\/instruction-forge-settings\.tsx'/);
});

test('React owns Prompt Studio default model, three preferences, and modal save/cancel presentation', () => {
  const html = read('src/renderer.html');
  const component = read('src/renderer-react/instruction-forge-settings.tsx');
  assert.match(html, /id="instructionSettingsLegacy"[\s\S]*?id="instructionSettingsReactMount"/);
  for (const text of ['Default AI', 'Clear previous result when generating', 'Copy generated prompt automatically', 'Keep input after generating', 'Save settings']) {
    assert.ok(component.includes(text), `settings component should include ${text}`);
  }
  assert.match(component, /checked=\{draft\.clearOutput\}/);
  assert.match(component, /checked=\{draft\.autoCopyOutput\}/);
  assert.match(component, /checked=\{draft\.keepInput\}/);
  assert.doesNotMatch(component, /\.innerHTML|localStorage|window\.aiHub|fetch\(/);
});

test('Host owns stored settings and exposes only a validated display view model', () => {
  const renderer = read('src/renderer.js');
  assert.match(renderer, /function instructionForgeSettingsViewModel\(\)[\s\S]*?models = labModels\(\)\.map\([\s\S]*?defaultModel, clearOutput:[\s\S]*?autoCopyOutput:[\s\S]*?keepInput:/);
  assert.match(renderer, /function saveForgeSettings\(\) \{ try \{ localStorage\.setItem\(FORGE_SETTINGS_KEY, JSON\.stringify\(forgeSettings\)\)/);
  assert.match(renderer, /function handleInstructionForgeSettingsAction\(event\)[\s\S]*?typeof action\.clearOutput !== 'boolean'[\s\S]*?typeof action\.autoCopyOutput !== 'boolean'[\s\S]*?typeof action\.keepInput !== 'boolean'/);
  assert.match(renderer, /action\.defaultModel && !labModels\(\)\.some\(\(model\) => model\.id === action\.defaultModel\)/);
});

test('Host retains model identity validation and keeps the selected model synchronized with Prompt Studio', () => {
  const renderer = read('src/renderer.js');
  assert.match(renderer, /function saveInstructionSettings\(draft = null\)[\s\S]*?models\.some\(\(model\) => model\.id === requestedModel\)[\s\S]*?saveForgeSettings\(\)/);
  assert.match(renderer, /if \(forgeSettings\.defaultModel\) setForgeComposerModelId\(forgeSettings\.defaultModel\)/);
  assert.match(renderer, /window\.addEventListener\('madstation:instruction-forge-settings-action', handleInstructionForgeSettingsAction\)/);
});

test('The legacy fallback selector creates safe option nodes instead of parsing model labels as HTML', () => {
  const renderer = read('src/renderer.js');
  assert.match(renderer, /if \(forgeSettingsReactMounted\) publishInstructionForgeSettings\(\);/);
  assert.match(renderer, /const option = document\.createElement\('option'\); option\.value = String\(model\.id\); option\.textContent = String\(modelLabel\(model\)\)/);
  assert.match(renderer, /window\.addEventListener\('madstation:instruction-forge-settings-mounted',[\s\S]*?legacy\.hidden = true[\s\S]*?mount\.hidden = false/);
});

test('React settings bridge has a mounted handshake and a credential-free bounded action contract', () => {
  const component = read('src/renderer-react/instruction-forge-settings.tsx');
  const renderer = read('src/renderer.js');
  assert.match(component, /madstation:instruction-forge-settings-state/);
  assert.match(component, /madstation:instruction-forge-settings-action/);
  assert.match(component, /madstation:instruction-forge-settings-mounted/);
  assert.match(renderer, /window\.addEventListener\('madstation:instruction-forge-settings-mounted'/);
  assert.match(renderer, /action\.defaultModel\.length > 256/);
});

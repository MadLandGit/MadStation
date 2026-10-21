const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Prompt Studio composer React entry is wired through Vite, renderer HTML, test selection and source packaging', () => {
  const vite = read('vite.config.ts');
  const html = read('src/renderer.html');
  const pkg = JSON.parse(read('package.json'));
  const main = read('src/main.js');
  assert.match(vite, /'instruction-forge-composer-react': resolve\(__dirname, 'src\/renderer-react\/instruction-forge-composer\.tsx'\)/);
  assert.equal([...html.matchAll(/src="\.\.\/build\/instruction-forge-composer-react\.js"/g)].length, 1);
  assert.match(html, /id="instructionForgeComposerReactMount"[\s\S]*?id="instructionForgeComposerLegacy"/);
  assert.ok(pkg.scripts.test.includes('tests/renderer-react-instruction-forge-composer.test.js'));
  assert.ok(pkg.build.extraResources.some((item) => item.from === 'src' && item.filter?.includes('renderer-react/instruction-forge-composer.tsx')));
  assert.match(main, /DEVELOPER_FILES = new Set\([\s\S]*?'src\/renderer-react\/instruction-forge-composer\.tsx'/);
});

test('React owns the full Prompt Studio input/output/model/run/copy presentation', () => {
  const component = read('src/renderer-react/instruction-forge-composer.tsx');
  for (const text of ['Explain what you actually mean', 'Make the instruction precise', 'Generate prompt', 'Copy', 'forgeInputReact', 'forgeOutputReact', 'forgeModelReact']) {
    assert.ok(component.includes(text), `composer component should include ${text}`);
  }
  assert.match(component, /value=\{draft\.input\}/);
  assert.match(component, /value=\{draft\.output\}/);
  assert.match(component, /value=\{draft\.selectedModel\}/);
  assert.match(component, /disabled=\{draft\.running/);
  assert.doesNotMatch(component, /\.innerHTML|localStorage|window\.aiHub|fetch\(/);
});

test('Host composer view model exposes bounded model labels and drafts, not credentials or provider payloads', () => {
  const renderer = read('src/renderer.js');
  assert.match(renderer, /function instructionForgeComposerViewModel\(\)[\s\S]*?labModels\(\)\.slice\(0, 1000\)[\s\S]*?modelLabel\(model\)[\s\S]*?selectedModel,[\s\S]*?input: String\(forgeComposerInputText[\s\S]*?output: String\(forgeComposerOutputText[\s\S]*?running: Boolean\(forgeRunning\)/);
  assert.match(renderer, /const FORGE_COMPOSER_MAX_INPUT = 100000/);
  assert.match(renderer, /function publishInstructionForgeComposer\(\)[\s\S]*?madstation:instruction-forge-composer-state/);
});

test('Composer action bridge bounds text and model identifiers and keeps generation and clipboard calls in the host', () => {
  const renderer = read('src/renderer.js');
  assert.match(renderer, /madstation:instruction-forge-composer-action/);
  assert.match(renderer, /action\.type === 'input-change'[\s\S]*?typeof action\.value !== 'string' \|\| action\.value\.length > FORGE_COMPOSER_MAX_INPUT/);
  assert.match(renderer, /action\.type === 'model-change'[\s\S]*?setForgeComposerModelId\(action\.value\)[\s\S]*?syncForgeBrowserFromModel\(\)/);
  assert.match(renderer, /action\.type === 'generate'\) \{ void forge\(\); return; \}/);
  assert.match(renderer, /action\.type === 'copy'[\s\S]*?window\.aiHub\.writeSystemClipboard\(output\)/);
  assert.match(renderer, /function forge\(\)[\s\S]*?instructionForgeAccountRequest\(\{ accountId: model\.accountId, prompt \}\)[\s\S]*?labRequest\(model, prompt\)/);
});

test('Model options are created as DOM nodes; model refresh publishes the controlled React selector state', () => {
  const renderer = read('src/renderer.js');
  const populate = renderer.slice(renderer.indexOf('function populateModelSelects()'), renderer.indexOf('function apiArenaSelection()'));
  assert.match(populate, /document\.createElement\('option'\)/);
  assert.match(populate, /option\.textContent = String\(modelLabel\(model\)\)/);
  assert.match(populate, /select\.replaceChildren\(\.\.\.groups\)/);
  assert.match(populate, /publishInstructionForgeComposer\(\)/);
  assert.doesNotMatch(populate, /\.innerHTML/);
});

test('Legacy composer remains as startup fallback until the mount handshake, then React receives fresh state', () => {
  const renderer = read('src/renderer.js');
  const component = read('src/renderer-react/instruction-forge-composer.tsx');
  assert.match(renderer, /madstation:instruction-forge-composer-mounted[\s\S]*?forgeComposerReactMounted = true[\s\S]*?legacy\.hidden = true[\s\S]*?mount\.hidden = false[\s\S]*?publishInstructionForgeComposer\(\)/);
  assert.match(component, /madstation:instruction-forge-composer-state/);
  assert.match(component, /madstation:instruction-forge-composer-action/);
  assert.match(component, /madstation:instruction-forge-composer-mounted/);
});


test('Prompt Studio legacy fallback is forcibly hidden after React takes ownership', () => {
  const css = read('src/pages.css');
  assert.match(css, /#instructionForgeComposerLegacy\[hidden\], #instructionForgeComposerReactMount\[hidden\] \{ display: none !important; \}/);
});

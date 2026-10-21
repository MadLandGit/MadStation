const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('API model settings React entry is wired into Vite, renderer HTML, tests, and both source packaging allowlists', () => {
  const vite = read('vite.config.ts');
  const html = read('src/renderer.html');
  const pkg = JSON.parse(read('package.json'));
  const main = read('src/main.js');
  assert.match(vite, /'ai-playground-api-model-settings-react': resolve\(__dirname, 'src\/renderer-react\/ai-playground-api-model-settings\.tsx'\)/);
  assert.equal([...html.matchAll(/src="\.\.\/build\/ai-playground-api-model-settings-react\.js"/g)].length, 1);
  assert.ok(pkg.scripts.test.includes('tests/renderer-react-ai-playground-api-model-settings.test.js'));
  assert.ok(pkg.build.extraResources.some((item) => item.from === 'src' && item.filter?.includes('renderer-react/ai-playground-api-model-settings.tsx')));
  assert.match(main, /DEVELOPER_FILES = new Set\([\s\S]*?'src\/renderer-react\/ai-playground-api-model-settings\.tsx'/);
});

test('React owns API model settings selection, editable fields, empty state, and clear/save controls', () => {
  const html = read('src/renderer.html');
  const component = read('src/renderer-react/ai-playground-api-model-settings.tsx');
  assert.match(html, /id="apiModelSettingsBody"/);
  assert.match(component, /function ApiModelSettings\(/);
  for (const text of ['API model settings model', 'API model display name', 'API model ID', 'API endpoint', 'API key', 'Clear stored key', 'Save API model', 'No API models configured']) {
    assert.ok(component.includes(text), `React editor should include ${text}`);
  }
  assert.doesNotMatch(component, /dangerouslySetInnerHTML|\.innerHTML|window\.aiHub|localStorage|fetch\(/);
});

test('Host publishes an explicit credential-free model view model and keeps secure key operations in the host', () => {
  const renderer = read('src/renderer.js');
  const component = read('src/renderer-react/ai-playground-api-model-settings.tsx');
  assert.match(renderer, /function apiModelSettingsViewModel\(\)[\s\S]*?apiKeyConfigured: Boolean\(model\.apiKeyConfigured\)[\s\S]*?apiKeyNeedsRebind: Boolean\(model\.apiKeyNeedsRebind\)/);
  const viewModel = renderer.slice(renderer.indexOf('function apiModelSettingsViewModel'), renderer.indexOf('function publishApiModelSettings'));
  assert.doesNotMatch(viewModel, /apiKey\s*:/i, 'raw API keys must not enter the React view model');
  assert.match(renderer, /window\.aiHub\.saveAiLabData\(aiLabData\)/);
  assert.match(renderer, /window\.aiHub\.setAiLabApiKey\(\{ modelId: id, apiKey: key \}\)/);
  assert.match(renderer, /window\.aiHub\.clearAiLabApiKey\(id\)/);
  assert.match(component, /type ApiModelSettingsAction[\s\S]*?save-model[\s\S]*?apiKey: string/);
});

test('Host validates model identity, field types and bounds before dispatching save or clear operations', () => {
  const renderer = read('src/renderer.js');
  assert.match(renderer, /async function handleApiModelSettingsAction\(event\)[\s\S]*?action\.type === 'select-model'[\s\S]*?apiModels\(\)\.some/);
  assert.match(renderer, /action\.name\.length > 120 \|\| action\.endpoint\.length > 2048 \|\| action\.model\.length > 240 \|\| action\.apiKey\.length > 8192/);
  assert.match(renderer, /if \(action\.type === 'clear-key'\)[\s\S]*?apiModels\(\)\.some/);
  assert.ok(renderer.includes('if (!/^https?:\\/\\//i.test(endpoint))'), 'host still checks the endpoint scheme before persistence');
});

test('React-to-host custom events have a mount handshake, state publication and busy-state feedback', () => {
  const renderer = read('src/renderer.js');
  const component = read('src/renderer-react/ai-playground-api-model-settings.tsx');
  assert.match(renderer, /madstation:api-model-settings-mounted/);
  assert.match(renderer, /madstation:api-model-settings-action/);
  assert.match(renderer, /madstation:api-model-settings-state/);
  assert.match(component, /madstation:api-model-settings-mounted/);
  assert.match(component, /madstation:api-model-settings-action/);
  assert.match(component, /madstation:api-model-settings-busy/);
});

test('Fallback editor uses safe DOM option nodes and remains available until the React entry attaches', () => {
  const renderer = read('src/renderer.js');
  assert.match(renderer, /if \(apiModelSettingsReactMounted\) \{ publishApiModelSettings\(\); return; \}/);
  assert.match(renderer, /const option = document\.createElement\('option'\);[\s\S]*?option\.textContent = String\(modelLabel\(model\)\);[\s\S]*?select\.appendChild\(option\)/);
  assert.match(renderer, /window\.addEventListener\('madstation:api-model-settings-mounted', \(\) => \{ apiModelSettingsReactMounted = true; publishApiModelSettings\(\); \}\)/);
});

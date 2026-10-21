const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('API Arena React entry is wired once into Vite, renderer HTML, packaging and Developer source allowlist', () => {
  const vite = read('vite.config.ts');
  const html = read('src/renderer.html');
  const pkg = JSON.parse(read('package.json'));
  const main = read('src/main.js');
  assert.match(vite, /'ai-playground-api-arena-react': resolve\(__dirname, 'src\/renderer-react\/ai-playground-api-arena\.tsx'\)/);
  assert.equal([...html.matchAll(/src="\.\.\/build\/ai-playground-api-arena-react\.js"/g)].length, 1);
  assert.ok(pkg.scripts.test.includes('tests/renderer-react-ai-playground-api-arena.test.js'));
  const sourceRule = pkg.build.extraResources.find((item) => item.from === 'src' && Array.isArray(item.filter));
  assert.ok(sourceRule?.filter.includes('renderer-react/ai-playground-api-arena.tsx'));
  assert.match(main, /DEVELOPER_FILES = new Set\([\s\S]*?'src\/renderer-react\/ai-playground-api-arena\.tsx'/);
});

test('API Arena comparison prompt, selectors, response panes and vote actions have one React owner', () => {
  const html = read('src/renderer.html');
  const renderer = read('src/renderer.js');
  const component = read('src/renderer-react/ai-playground-api-arena.tsx');
  assert.match(html, /id="apiArenaReactMount"/);
  for (const id of ['apiArenaPrompt', 'apiArenaRunBtn', 'apiArenaLeft', 'apiArenaRight', 'apiArenaLeftOutput', 'apiArenaRightOutput', 'apiArenaStatus']) {
    assert.doesNotMatch(html, new RegExp(`id="${id}"`));
    assert.doesNotMatch(renderer, new RegExp(`\\$\\('${id}'\\)`), `legacy host no longer directly reads/writes ${id}`);
  }
  assert.match(component, /function ApiArena\(/);
  assert.match(component, /function ResponseCard\(/);
  assert.match(component, /Recent API comparisons/);
  assert.doesNotMatch(component, /dangerouslySetInnerHTML|\.innerHTML|window\.aiHub|localStorage|fetch\(/);
});

test('API Arena host builds an explicit credential-free view model and validates bounded actions', () => {
  const renderer = read('src/renderer.js');
  const component = read('src/renderer-react/ai-playground-api-arena.tsx');
  assert.match(renderer, /function apiArenaViewModel\(\)[\s\S]*?name: String\(modelLabel\(model\)\)[\s\S]*?apiKeyConfigured: Boolean\(model\.apiKeyConfigured\)/);
  assert.match(renderer, /function apiArenaSelectModel\(side, modelId\)[\s\S]*?\['left', 'right'\]\.includes\(side\)[\s\S]*?apiModels\(\)\.find/);
  assert.match(renderer, /async function handleApiArenaAction\(event\)[\s\S]*?action\.type === 'select-model'[\s\S]*?action\.type === 'run'[\s\S]*?action\.type === 'swap'[\s\S]*?action\.type === 'vote'/);
  assert.match(renderer, /function publishApiArenaViewModel\(\)[\s\S]*?madstation:api-arena-state/);
  assert.match(component, /madstation:api-arena-action/);
});

test('API Arena runs both models independently, exposes busy and per-side failure states, and preserves vote schema', () => {
  const renderer = read('src/renderer.js');
  const component = read('src/renderer-react/ai-playground-api-arena.tsx');
  assert.match(renderer, /async function runApiArena\(action = \{\}\)[\s\S]*?prompt\.length > 20000/);
  assert.match(renderer, /const \[leftResult, rightResult\] = await Promise\.all\(\[request\(left, 'api-left'\), request\(right, 'api-right'\)\]\)/);
  assert.match(renderer, /Request failed\. Check the model endpoint, stored API key, and connection\./);
  assert.match(renderer, /votes\.push\(\{ at: new Date\(\)\.toISOString\(\), prompt:[\s\S]*?choice, left: \{ id: left\.id, name: modelLabel\(left\) \}, right: \{ id: right\.id, name: modelLabel\(right\) \} \}\)/);
  assert.match(component, /snapshot\.running \? 'Running…' : 'Ask Both'/);
  assert.match(component, /snapshot\.results\.left && snapshot\.results\.right/);
  assert.match(component, /disabled=\{!canVote\}/);
});

test('API Arena swaps response sides consistently and shows saved voting history without storing response text', () => {
  const renderer = read('src/renderer.js');
  const component = read('src/renderer-react/ai-playground-api-arena.tsx');
  assert.match(renderer, /function swapApiArenaSides\(\)[\s\S]*?apiArenaUi\.selected = \{ left: apiArenaUi\.selected\.right, right: apiArenaUi\.selected\.left \}[\s\S]*?apiArenaUi\.results = \{ left: apiArenaUi\.results\.right, right: apiArenaUi\.results\.left \}/);
  assert.match(renderer, /history = \(Array\.isArray\(aiLabData\.apiArenaVotes\)[\s\S]*?\.slice\(-8\)\.reverse\(\)/);
  assert.match(component, /dispatch\(\{ type: 'swap' \}\)/);
  assert.match(component, /snapshot\.history\.map/);
  assert.doesNotMatch(renderer.slice(renderer.indexOf('function apiArenaViewModel'), renderer.indexOf('function publishApiArenaViewModel')), /text:.*result|output:.*result/i);
});

test('API Arena Stop waiting invalidates late responses without claiming to abort issued requests', () => {
  const renderer = read('src/renderer.js');
  const component = read('src/renderer-react/ai-playground-api-arena.tsx');
  assert.match(renderer, /let apiArenaRunGeneration = 0/);
  assert.match(renderer, /const runGeneration = \+\+apiArenaRunGeneration/);
  assert.match(renderer, /if \(runGeneration !== apiArenaRunGeneration\) return/);
  assert.match(renderer, /function cancelApiArenaRun\(\)[\s\S]*?apiArenaRunGeneration \+= 1[\s\S]*?Already-sent requests may still finish in the background/);
  assert.match(renderer, /action\.type === 'cancel'[\s\S]*?cancelApiArenaRun\(\)/);
  assert.match(component, /Stop waiting/);
  assert.match(component, /dispatch\(\{ type: 'cancel' \}\)/);
});

test('API Arena response selectors use explicitly typed model and running props', () => {
  const component = read('src/renderer-react/ai-playground-api-arena.tsx');
  assert.match(component, /function ResponseCard\(\{ side, model, result, selected, canVote, choice, models, running \}: \{/);
  assert.match(component, /models\.map\(\(candidate\) => <option value=\{candidate\.id\}/);
});

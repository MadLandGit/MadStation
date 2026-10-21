'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Free Account and Local AI Arena React entries are wired through Vite, HTML, package tests and developer allowlists', () => {
  const vite = read('vite.config.ts');
  const html = read('src/renderer.html');
  const pkg = JSON.parse(read('package.json'));
  const main = read('src/main.js');
  assert.match(vite, /ai-playground-browser-arenas-react[\s\S]*?ai-playground-browser-arenas\.tsx/);
  assert.match(html, /id="freeAccountArenaReactMount"/);
  assert.match(html, /id="localArenaReactMount"/);
  assert.match(html, /\.\.\/build\/ai-playground-browser-arenas-react\.js/);
  assert.match(pkg.scripts.test, /renderer-react-ai-playground-browser-arenas\.test\.js/);
  assert.match(pkg.build.extraResources.find((entry) => entry.to === 'developer-docs/src').filter.join('\n'), /renderer-react\/ai-playground-browser-arenas\.tsx/);
  assert.match(main, /src\/renderer-react\/ai-playground-browser-arenas\.tsx/);
});

test('Free Account Arena composer, browser controls, native view anchors and vote history have one React owner', () => {
  const html = read('src/renderer.html');
  const ui = read('src/renderer-react/ai-playground-browser-arenas.tsx');
  const renderer = read('src/renderer.js');
  assert.doesNotMatch(html, /id="arenaPrompt"|id="arenaLeftBrowserSlot"|id="arenaRightBrowserSlot"|data-arena-nav="left-refresh"/);
  for (const id of ['arenaPrompt', 'arenaRunBtn', 'arenaStatus']) assert.ok(ui.includes(`id="${id}"`), `${id} must be rendered by React`);
  assert.match(ui, /id=\{side === 'left' \? 'arenaLeft' : 'arenaRight'\}/);
  assert.match(ui, /id=\{side === 'left' \? 'arenaLeftBrowserSlot' : 'arenaRightBrowserSlot'\}/);
  assert.match(ui, /Recent account comparisons/);
  for (const actionLabel of ['⇄ Swap sides', '= Tie', 'Neither']) assert.ok(ui.includes(actionLabel), `${actionLabel} action remains available`);
  const styles = read('src/styles.css');
  const freeComposerLayout = styles.match(/\[data-arena-panel=\"free-account\"\] \.arena-ask\{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(freeComposerLayout, /grid-template-columns:minmax\(0,1fr\)/, 'Free Account composer must not retain the legacy narrow second column');
  assert.match(styles, /\[data-arena-panel=\"free-account\"\] \.free-arena-primary-actions\{[\s\S]*?width:100%[\s\S]*?min-width:0/);
  assert.match(styles, /@media\(max-width:1100px\)\{\.free-arena-primary-actions\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)\}/, 'narrow layout keeps swap, tie and neither in one visible row');
  assert.match(ui, /madstation:free-arena-action/);
  assert.match(ui, /window\.aiHub\.onArenaBrowserLoading/);
  assert.match(ui, /arena-browser-toolbar\$\{browserLoading\[side\]\.accountId === account\?\.id && browserLoading\[side\]\.loading \? ' is-loading' : ''\}/);
  assert.match(ui, /aria-busy=\{browserLoading\[side\]\.accountId === account\?\.id && browserLoading\[side\]\.loading\}/);
  assert.match(renderer, /function freeArenaViewModel\(\)[\s\S]*?iconSrc[\s\S]*?selected[\s\S]*?history/);
  assert.match(renderer, /window\.aiHub\.arenaSetLayout\(layout\)/);
  assert.doesNotMatch(renderer, /function renderArenaPickers\(\)|function updateArenaHeads\(\)/);
});

test('Free Account Arena host bridge validates account IDs and preserves native navigation/session ownership', () => {
  const renderer = read('src/renderer.js');
  const free = renderer.slice(renderer.indexOf('function handleFreeArenaAction'), renderer.indexOf('function computeArenaBoard'));
  assert.match(free, /action\.type === 'select-account'[\s\S]*?arenaAccountById\(id\)/);
  assert.match(free, /action\.type === 'navigate'[\s\S]*?window\.aiHub\.arenaNavigate/);
  assert.match(free, /action\.type === 'open-external'[\s\S]*?window\.aiHub\.arenaOpenInBrowser/);
  assert.match(renderer, /function updateArenaBrowserLayout\(\)[\s\S]*?arenaLeftBrowserSlot[\s\S]*?arenaRightBrowserSlot/);
  assert.match(renderer, /window\.addEventListener\('madstation:free-arena-action'/);
  assert.doesNotMatch(free, /apiKey|credential|partition/);
});

test('Local AI Arena renders discovery, model selection, paired results, voting and recent history from an allowlisted snapshot', () => {
  const html = read('src/renderer.html');
  const ui = read('src/renderer-react/ai-playground-browser-arenas.tsx');
  const renderer = read('src/renderer.js');
  assert.doesNotMatch(html, /id="localArenaPrompt"|id="localArenaLeft"|id="localArenaRight"|id="localModelList"/);
  for (const id of ['localArenaPrompt', 'localArenaRunBtn', 'localModelList', 'localArenaStatus']) assert.ok(ui.includes(`id="${id}"`), `${id} must be React-owned`);
  assert.match(ui, /id=\{side === 'left' \? 'localArenaLeft' : 'localArenaRight'\}/);
  assert.match(ui, /Discover Model Servers/);
  assert.match(ui, /Recent Local AI comparisons/);
  assert.match(renderer, /function localArenaViewModel\(\)[\s\S]*?models,[\s\S]*?servers,[\s\S]*?results:[\s\S]*?history/);
  assert.match(renderer, /madstation:local-arena-state/);
});

test('Local AI model snapshots exclude credential fields and request work remains in the host', () => {
  const renderer = read('src/renderer.js');
  const local = renderer.slice(renderer.indexOf('function localArenaViewModel'), renderer.indexOf('function publishLocalArenaViewModel'));
  assert.match(local, /label: String\(modelLabel\(model\)\)/);
  assert.match(local, /model: String\(model\.model \|\| model\.name/);
  assert.doesNotMatch(local, /apiKey|secret|token|password/);
  assert.match(renderer, /async function runLocalArena\(promptValue\)[\s\S]*?labRequest\(\{ \.\.\.model \}, prompt, side\)/);
  assert.match(renderer, /function handleLocalArenaAction\(event\)[\s\S]*?Number\.isInteger\(index\)[\s\S]*?localModels\[index\]\?\.type === 'file'/);
});

test('Local AI stale responses cannot replace a cancelled/replaced run, and saved vote payload remains unchanged', () => {
  const renderer = read('src/renderer.js');
  assert.match(renderer, /let localArenaRunGeneration = 0/);
  assert.match(renderer, /const generation = \+\+localArenaRunGeneration/);
  assert.match(renderer, /if \(generation !== localArenaRunGeneration\) return/);
  assert.match(renderer, /function cancelLocalArenaRun\(\)[\s\S]*?localArenaRunGeneration \+= 1/);
  assert.match(renderer, /aiLabData\.localArenaVotes\.push\(\{ battleId: localArenaBattle\.id, at: new Date\(\)\.toISOString\(\), prompt: localArenaBattle\.prompt\.slice\(0, 1000\), choice, left: localArenaBattlePayload\(localArenaBattle\.left\), right: localArenaBattlePayload\(localArenaBattle\.right\) \}\)/);
  assert.doesNotMatch(renderer, /function renderLocalModels\(\)|function updateLocalArenaVoteButtons\(\)|localArenaLeftOutput'\)\.textContent/);
});

test('Local AI snapshots redact credential-bearing endpoint components before React receives them', () => {
  const renderer = read('src/renderer.js');
  const source = renderer.slice(renderer.indexOf('function safeLocalArenaEndpoint'), renderer.indexOf('function localArenaViewModel'));
  const model = renderer.slice(renderer.indexOf('function localArenaViewModel'), renderer.indexOf('function publishLocalArenaViewModel'));
  assert.match(source, /url\.username = ''/);
  assert.match(source, /url\.password = ''/);
  assert.ok(source.includes('api[_-]?key') && source.includes('client[_-]?secret') && source.includes('authorization'), 'sensitive endpoint query keys are redacted');
  assert.match(model, /endpoint: safeLocalArenaEndpoint\(model\.endpoint\)/);
  assert.match(model, /endpoint: safeLocalArenaEndpoint\(server\?\.endpoint\)/);
  const helper = source.match(/function safeLocalArenaEndpoint\(value\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(helper, 'endpoint sanitizer is a standalone helper');
  const sanitize = new Function('URL', `${helper}; return safeLocalArenaEndpoint;`)(URL);
  assert.equal(sanitize('http://user:pass@127.0.0.1:11434/api?key=hidden&x=1'), 'http://127.0.0.1:11434/api?x=1');
  assert.equal(sanitize('http://127.0.0.1:11434/api?client_secret=hidden&x=1'), 'http://127.0.0.1:11434/api?x=1');
});

test('Local AI control actions cannot change model selection or launch scans while a battle is active', () => {
  const renderer = read('src/renderer.js');
  const ui = read('src/renderer-react/ai-playground-browser-arenas.tsx');
  assert.match(renderer, /if \(\(localArenaRunning \|\| localScanRunning\) && \['scan', 'select-model', 'run', 'swap', 'vote'\]\.includes\(action\.type\)\) return/);
  assert.match(ui, /disabled=\{snapshot\.running \|\| snapshot\.scanning\} onChange=\{\(event\) => dispatchLocal\(\{ type: 'select-model'/);
  assert.match(ui, /disabled=\{snapshot\.scanning \|\| snapshot\.running\} onClick=\{\(\) => dispatchLocal\(\{ type: 'scan' \}\)\}/);
});

test('Free Account actions stay host-validated while native browser views remain in Electron', () => {
  const renderer = read('src/renderer.js');
  const main = read('src/main.js');
  assert.match(renderer, /if \(arenaSending && \['select-account', 'run', 'swap', 'vote', 'navigate', 'open-external'\]\.includes\(action\.type\)\) return/);
  assert.match(renderer, /window\.aiHub\.arenaSetLayout\(layout\)/);
  assert.match(main, /function createArenaBrowserView\(record\)/);
  assert.match(main, /handleForWorkspace\('ai-lab',[^\r\n]+\)\('arena-set-layout'/);
  assert.match(main, /handleForWorkspace\('ai-lab',[^\r\n]+\)\('arena-send-prompt'/);
});

test('Free Account browser address lock uses an SVG-compatible hidden class', () => {
  const ui = read('src/renderer-react/ai-playground-browser-arenas.tsx');
  assert.match(ui, /<svg className="ms-browser-address-lock hidden"[^>]*aria-hidden="true">/);
  assert.doesNotMatch(ui, /<svg[^>]*\shidden(?:=|\s|>)/);
});

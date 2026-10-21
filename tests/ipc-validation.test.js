'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { isSafeIpcPayload } = require('../build/main/ipc-validation.js');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('main-process TypeScript bundles are emitted at the exact paths required by src/main.js', () => {
  const packageJson = JSON.parse(read('package.json'));
  const buildCommand = packageJson.scripts['build:main-modules'];
  assert.match(buildCommand, /--outdir=build\/main --outbase=src\/main/);
  assert.match(buildCommand, /src\/shared\/ipc-validation\.ts[\s\S]*--outdir=build\/main --outbase=src\/shared/);
  for (const moduleName of [
    'settings.js', 'config-schema.js', 'config-store.js', 'lock-security.js',
    'downloads.js', 'icon-cache.js', 'input-validation.js', 'ipc-validation.js',
  ]) {
    assert.ok(fs.existsSync(path.join(root, 'build', 'main', moduleName)), `missing build/main/${moduleName}`);
  }
});

test('IPC payload guard is implemented in strict TypeScript and bundled for main/preload', () => {
  const validator = read('src/shared/ipc-validation.ts');
  const main = read('src/main.js');
  assert.match(validator, /export function isSafeIpcPayload\(value: unknown/);
  assert.match(main, /require\('..\/build\/main\/ipc-validation\.js'\)/);
  assert.match(read('src/preload.ts'), /shared\/ipc-validation\.js/);
  assert.match(read('src/toolbar-preload.ts'), /shared\/ipc-validation\.js/);
});

test('IPC payload guard accepts the JSON-like DTOs used by renderer commands', () => {
  assert.equal(isSafeIpcPayload([]), true);
  assert.equal(isSafeIpcPayload(['account-1', { name: 'Research', order: [2, 1], enabled: true }, null]), true);
  assert.equal(isSafeIpcPayload({ nested: { value: undefined }, count: 0 }), true);
});

test('IPC payload guard rejects functions, symbols, non-finite numbers and class instances', () => {
  assert.equal(isSafeIpcPayload(() => undefined), false);
  assert.equal(isSafeIpcPayload(Symbol('channel')), false);
  assert.equal(isSafeIpcPayload(Number.POSITIVE_INFINITY), false);
  assert.equal(isSafeIpcPayload(new Date()), false);
});

test('IPC payload guard rejects cycles, forbidden prototype keys and overly large values', () => {
  const cycle = {};
  cycle.self = cycle;
  assert.equal(isSafeIpcPayload(cycle), false);
  assert.equal(isSafeIpcPayload(JSON.parse('{"__proto__":{"polluted":true}}')), false);
  assert.equal(isSafeIpcPayload('x'.repeat(20), { maxStringLength: 10 }), false);
  assert.equal(isSafeIpcPayload({ nested: { deeper: true } }, { maxDepth: 1 }), false);
});

test('main IPC validates sender and lock state before accepting bounded DTO payloads', () => {
  const main = read('src/main.js');
  const start = main.indexOf('function handle(channel, fn, options = {})');
  const end = main.indexOf('\n}\n', start) + 2;
  const handler = main.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.ok(handler.indexOf('isTrustedSender(event, options)') < handler.indexOf('isSafeIpcPayload(args)'));
  assert.ok(handler.includes("'Invalid IPC payload.'"));
});

test('sandboxed preload APIs return unsubscribe functions rather than renderer-visible IPC objects', () => {
  const preload = read('src/preload.ts');
  const toolbarPreload = read('src/toolbar-preload.ts');
  for (const source of [preload, toolbarPreload]) {
    assert.match(source, /function subscribe<T>\(/);
    assert.match(source, /return \(\) => ipcRenderer\.removeListener\(channel, listener\)/);
    assert.match(source, /isSafeIpcPayload\(args\)/);
  }
  assert.match(read('src/main.js'), /sandbox: true/);
  assert.match(read('src/main.js'), /nodeIntegration: false/);
  assert.match(read('src/main.js'), /contextIsolation: true/);
});

test('Vite toolbar entry bundles the appearance adapter and keeps its production CSP restrictive', () => {
  const html = read('src/toolbar.html');
  const vite = read('vite.config.ts');
  assert.match(html, /script type="module" src="\.\/appearance\.js"/);
  assert.match(html, /script type="module" src="\.\/toolbar-react\/main\.tsx"/);
  assert.match(html, /default-src 'none'; script-src 'self'; style-src 'self';/);
  assert.match(html, /connect-src 'none'; base-uri 'none'; form-action 'none'/);
  assert.match(vite, /toolbar: resolve\(__dirname, 'src\/toolbar\.html'\)/);
  assert.match(vite, /'accounts-react': resolve\(__dirname, 'src\/renderer-react\/account-list\.tsx'\)/);
  assert.match(vite, /entryFileNames: '\[name\]\.js'/);
  assert.match(vite, /outDir: resolve\(__dirname, 'build'\)/);
  assert.match(vite, /target: 'chrome152'/);
});

test('Electron production entry points load generated preload and toolbar assets', () => {
  const main = read('src/main.js');
  assert.match(main, /TOOLBAR_FILE = path\.resolve\(__dirname, '\.\.\/build\/toolbar\.html'\)/);
  assert.match(main, /PRELOAD_FILE = path\.resolve\(__dirname, '\.\.\/build\/preload\.js'\)/);
  assert.match(main, /TOOLBAR_PRELOAD_FILE = path\.resolve\(__dirname, '\.\.\/build\/toolbar-preload\.js'\)/);
  assert.match(main, /if \(toolbarDevUrl && frame\.url === toolbarDevUrl\) return true/);
});

test('typed preload implementations stay in one-to-one parity with shared API contracts', () => {
  const contract = read('src/shared/api-contract.ts');
  const mainPreload = read('src/preload.ts');
  const toolbarPreload = read('src/toolbar-preload.ts');
  const memberNames = (source, pattern) => [...source.matchAll(pattern)].map((match) => match[1]).sort();
  const aiHubContract = contract.slice(contract.indexOf('export interface AiHubApi {'), contract.indexOf('\n}', contract.indexOf('export interface AiHubApi {')));
  const toolbarContract = contract.slice(contract.indexOf('export interface ToolbarApi {'), contract.indexOf('\n}', contract.indexOf('export interface ToolbarApi {')));
  const aiHubImplementation = mainPreload.slice(mainPreload.indexOf('const api: AiHubApi = {'), mainPreload.indexOf('\n};', mainPreload.indexOf('const api: AiHubApi = {')));
  const toolbarImplementation = toolbarPreload.slice(toolbarPreload.indexOf('const api: ToolbarApi = {'), toolbarPreload.indexOf('\n};', toolbarPreload.indexOf('const api: ToolbarApi = {')));
  assert.deepEqual(memberNames(aiHubImplementation, /^\s{2}([A-Za-z_$][\w$]*)\s*:/gm), memberNames(aiHubContract, /^\s{2}([A-Za-z_$][\w$]*)\s*\(/gm));
  assert.deepEqual(memberNames(toolbarImplementation, /^\s{2}([A-Za-z_$][\w$]*)\s*:/gm), memberNames(toolbarContract, /^\s{2}([A-Za-z_$][\w$]*)\s*\(/gm));
  assert.match(mainPreload, /contextBridge\.exposeInMainWorld\('aiHub', api\)/);
  assert.match(toolbarPreload, /contextBridge\.exposeInMainWorld\('aiHubToolbar', api\)/);
});

test('AI Hub account cards are rendered by the isolated React subtree and keep typed action boundaries', () => {
  const html = read('src/renderer.html');
  const renderer = read('src/renderer.js');
  const component = read('src/renderer-react/account-list.tsx');
  assert.match(html, /type="module" src="\.\.\/build\/accounts-react\.js"/);
  assert.match(renderer, /window\.MadStationAccountList/);
  assert.match(renderer, /madstation:accounts-react-ready/);
  const sidebar = renderer.slice(renderer.indexOf('function renderAccountsSidebarImpl'), renderer.indexOf('// ---- Account options menu'));
  assert.match(sidebar, /if \(reactAccountList\) \{/);
  assert.match(sidebar, /root\.textContent = 'Loading accounts…';/, 'legacy fallback should only provide a brief loading state before React mounts');
  assert.doesNotMatch(sidebar, /root\.innerHTML|createElement\('(?:button|div)'\).*account-row/, 'legacy renderer must not create account cards');
  assert.match(component, /if \(!props\.hasAnyAccounts\)/, 'React subtree should own the no-account empty state too');
  assert.match(component, /export interface AccountListProps/);
  assert.match(component, /key=\{account\.id\}/);
  assert.match(component, /onReorder\(dragged, account\.id, after\)/);
  assert.doesNotMatch(component, /dangerouslySetInnerHTML/);
});

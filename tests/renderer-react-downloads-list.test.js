const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Downloads list React entry is wired into Vite, renderer HTML, canonical tests and developer source packaging', () => {
  const html = read('src/renderer.html');
  const vite = read('vite.config.ts');
  const pkg = JSON.parse(read('package.json'));
  assert.match(vite, /'downloads-list-react': resolve\(__dirname, 'src\/renderer-react\/downloads-list\.tsx'\)/);
  assert.match(html, /src="\.\.\/build\/downloads-list-react\.js"/);
  assert.match(pkg.scripts.test, /tests\/renderer-react-downloads-list\.test\.js/);
  assert.ok(pkg.build.extraResources.some((resource) => resource.from === 'src' && resource.filter?.includes('renderer-react/downloads-list.tsx')));
});

test('Downloads list renders state, metadata, accessible action buttons and safe React text', () => {
  const component = read('src/renderer-react/downloads-list.tsx');
  assert.match(component, /createRoot\(host\)/);
  assert.match(component, /model\.items\.length === 0/);
  assert.match(component, /No downloads yet/);
  assert.match(component, /Files you download from your accounts will appear here\./);
  assert.match(component, /data-state=\{item\.state\}/);
  assert.match(component, /data-kind=\{item\.kind\}/);
  assert.match(component, /title=\{item\.name\}/);
  assert.match(component, /\{item\.name\}/);
  assert.match(component, /\{item\.meta\}/);
  assert.match(component, /data-dl-action=\{action\.action\}/);
  assert.match(component, /data-dl-id=\{item\.id\}/);
  assert.match(component, /aria-hidden="true"/);
  assert.match(component, /type="button"/);
  assert.match(component, /data-pct=\{item\.progress\}/);
  assert.match(component, /element\.style\.width = `\$\{item\.progress\}%`/);
  assert.doesNotMatch(component, /dangerouslySetInnerHTML|\.innerHTML|style=\{\{/);
});

test('Trusted renderer host constructs download view models and preserves available action semantics', () => {
  const renderer = read('src/renderer.js');
  assert.match(renderer, /function getDownloadsViewModel\(items\)[\s\S]*?hasProgress = item\.state === 'progressing' \|\| item\.state === 'interrupted'/);
  assert.match(renderer, /item\.kind === 'managed' && hasProgress[\s\S]*addAction\('cancel', 'Cancel', 'tiny-btn danger'\)/);
  assert.match(renderer, /const resume = item\.paused \|\| item\.state === 'interrupted'[\s\S]*addAction\(resume \? 'resume' : 'pause', resume \? 'Resume' : 'Pause'\)[\s\S]*addAction\('cancel', 'Cancel', 'tiny-btn danger'\)/);
  assert.match(renderer, /if \(item\.canOpen\) addAction\('open', 'Open', 'secondary'\)[\s\S]*if \(item\.canShow\) addAction\('show', 'Show in folder'\)[\s\S]*addAction\('remove', 'Remove'\)/);
  assert.match(renderer, /meta: downloadMeta\(item\)/);
  assert.match(renderer, /downloadsReactRenderer\(model\)/);
  assert.match(renderer, /window\.MadStationDownloads = \{[\s\S]*?attachReactRenderer\(renderer\)[\s\S]*?downloadsReactRenderer = renderer[\s\S]*?renderDownloads\(\)/);
  assert.match(renderer, /\$\('downloadsList'\)\.addEventListener\('click', \(event\) => \{[\s\S]*?button\.dataset\.dlAction[\s\S]*?button\.dataset\.dlId/);
  assert.match(renderer, /\$\('dlClearBtn'\)\.disabled = !items\.some\(\(item\) => item\.state !== 'progressing' && item\.state !== 'interrupted'\)/);
  assert.match(renderer, /list\.querySelectorAll\('\.dl-bar i\[data-pct\]'\)\.forEach\(\(el\) => \{ el\.style\.width = `\$\{el\.dataset\.pct\}%`; \}\)/);
});

test('Downloads dialog shell and host-only actions remain present while React owns list children', () => {
  const html = read('src/renderer.html');
  const renderer = read('src/renderer.js');
  for (const id of ['downloadsModal', 'downloadsList', 'downloadsBtn', 'closeDownloadsModal', 'dlClearBtn', 'dlOpenFolderBtn']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(renderer, /window\.aiHub\.downloadAction\(action, id\)/);
  assert.match(renderer, /\$\('dlClearBtn'\)\.addEventListener\('click', \(\) => runDownloadAction\('clear-finished'\)\)/);
  assert.match(renderer, /\$\('dlOpenFolderBtn'\)\.addEventListener\('click', \(\) => runDownloadAction\('open-folder'\)\)/);
  assert.match(renderer, /The app CSP|Inline style attributes are blocked by the app CSP/);
});

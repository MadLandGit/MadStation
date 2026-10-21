const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Memory process table React entry is wired into Vite, renderer HTML, canonical tests and developer source packaging', () => {
  const html = read('src/renderer.html');
  const vite = read('vite.config.ts');
  const pkg = JSON.parse(read('package.json'));
  assert.match(vite, /'memory-process-table-react': resolve\(__dirname, 'src\/renderer-react\/memory-process-table\.tsx'\)/);
  assert.match(html, /src="\.\.\/build\/memory-process-table-react\.js"/);
  assert.match(pkg.scripts.test, /tests\/renderer-react-memory-process-table\.test\.js/);
  assert.ok(pkg.build.extraResources.some((resource) => resource.from === 'src' && resource.filter?.includes('renderer-react/memory-process-table.tsx')));
});

test('React owns process summary and table rows without HTML string insertion', () => {
  const component = read('src/renderer-react/memory-process-table.tsx');
  assert.match(component, /createRoot\(summaryHost\)/);
  assert.match(component, /createRoot\(bodyHost\)/);
  assert.match(component, /model\.summary\.map/);
  assert.match(component, /processes\.map/);
  assert.match(component, /Process metrics unavailable\./);
  assert.match(component, /process\.name/);
  assert.match(component, /process\.type/);
  assert.match(component, /process\.pid \|\| '—'/);
  assert.doesNotMatch(component, /dangerouslySetInnerHTML|\.innerHTML/);
});

test('Trusted host retains telemetry formatting and only publishes a bounded display model to React', () => {
  const renderer = read('src/renderer.js');
  const start = renderer.indexOf('function renderMemoryProcessTable(snapshot = latestMemorySnapshot)');
  const end = renderer.indexOf('\nfunction openMemoryProcessesModal()', start);
  assert.ok(start >= 0 && end > start);
  const body = renderer.slice(start, end);
  assert.match(body, /formatRamKb\(snapshot\?\.totalKb\)/);
  assert.match(body, /processList\.map\(\(process\) => \(\{/);
  assert.match(body, /memoryProcessTableReactRenderer\(model\)/);
  assert.doesNotMatch(body, /\.innerHTML/);
  assert.match(renderer, /MadStationMemoryProcessTable = \{[\s\S]*?attachReactRenderer\(renderer\)[\s\S]*?renderMemoryProcessTable\(latestMemorySnapshot\)/);
});

test('Process modal shell and host refresh/close controls remain intact', () => {
  const html = read('src/renderer.html');
  const renderer = read('src/renderer.js');
  for (const id of ['memoryProcessesModal', 'memoryProcessSummary', 'memoryProcessesUpdated', 'memoryProcessesBody', 'refreshMemoryProcessesBtn', 'closeMemoryProcessesBtn']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(renderer, /function openMemoryProcessesModal\(\)[\s\S]*?renderMemoryProcessTable\(\);[\s\S]*?refreshMemoryMonitor\(\)/);
  assert.match(renderer, /if \(memoryProcessesModalOpen\) renderMemoryProcessTable\(snapshot\)/);
});

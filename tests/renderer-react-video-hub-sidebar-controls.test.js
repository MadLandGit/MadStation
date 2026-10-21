const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'src/renderer.html'), 'utf8');
const moduleSource = fs.readFileSync(path.join(root, 'src/renderer-react/video-hub-sidebar-controls.tsx'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'src/renderer.js'), 'utf8');
const vite = fs.readFileSync(path.join(root, 'vite.config.ts'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

test('Video Hub sidebar search and filter controls have one React rendering owner', () => {
  assert.match(html, /id="videoHubSidebarControlsReactMount"/);
  assert.doesNotMatch(html, /id="videoHubSearch"/);
  assert.doesNotMatch(html, /id="videoHubFilterAll"/);
  assert.match(moduleSource, /id="videoHubSearch"/);
  assert.match(moduleSource, /id="videoHubFilterAll"/);
  assert.match(moduleSource, /id="videoHubFilterPinned"/);
});

test('Video Hub sidebar controls preserve host filtering behavior through delegated listeners', () => {
  assert.match(renderer, /document\.addEventListener\('input', \(event\) => \{\s*if \(event\.target\?\.id === 'videoHubSearch'\) applyVideoHubFilters\(\);/);
  assert.match(renderer, /document\.addEventListener\('click', \(event\) => \{\s*if \(event\.target\?\.closest\?\.\('#videoHubFilterAll'\)\)/);
  assert.match(renderer, /#videoHubSearchClear/);
});

test('Video Hub sidebar controls are included in renderer and packaged developer source', () => {
  assert.match(vite, /'video-hub-sidebar-controls-react': resolve\(__dirname, 'src\/renderer-react\/video-hub-sidebar-controls\.tsx'\)/);
  assert.match(html, /build\/video-hub-sidebar-controls-react\.js/);
  assert.match(JSON.stringify(pkg.build), /renderer-react\/video-hub-sidebar-controls\.tsx/);
  assert.match(pkg.scripts.test, /renderer-react-video-hub-sidebar-controls\.test\.js/);
});

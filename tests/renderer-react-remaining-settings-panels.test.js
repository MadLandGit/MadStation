import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('remaining Settings controls have single React owners', () => {
  const html = read('src/renderer.html');
  const module = read('src/renderer-react/remaining-settings-panels.tsx');
  for (const id of ['aiHubSidebarAppearanceReactMount', 'accountSafetyReactMount', 'builtInShortcutsReactMount', 'globalAppearanceAdvancedReactMount']) {
    assert.match(html, new RegExp(`id="${id}"`));
    assert.match(module, new RegExp(`'${id}'`));
  }
  for (const removed of ['confirmAccountDeletion', 'openIconFolderBtn', 'refreshIconsBtn']) {
    assert.doesNotMatch(html, new RegExp(`id="${removed}"`), `${removed} should not remain as static HTML`);
  }
  assert.doesNotMatch(html, /data-app-choice=/, 'remaining global appearance and AI Hub density choices are React-owned');
  assert.doesNotMatch(html.match(/data-panel="shortcuts"[\s\S]*?data-panel="appearance"/)[0], /Built-in shortcuts|Ctrl K|Ctrl Shift L/);
  assert.doesNotMatch(module, /window\.aiHub\./, 'React must not call privileged preload APIs directly');
});

test('React preserves the full Appearance option vocabulary and live preview hooks', () => {
  const module = read('src/renderer-react/remaining-settings-panels.tsx');
  for (const key of ['density', 'cardSpacing', 'borderSpacing', 'pageZoom', 'surfaceStyle', 'cornerStyle', 'buttonCorner', 'buttonBackground', 'borderStyle', 'shadowStyle']) assert.ok(module.includes(`${key}: [`), `choices retained: ${key}`);
  for (const key of ['reduceMotion', 'animateHover', 'showStatusBar', 'remoteIcons', 'confirmAccountDeletion']) assert.ok(module.includes(key), `setting retained: ${key}`);
  for (const preview of ['spacing', 'border-spacing', 'zoom', 'surface', 'corner', 'button', 'button-background', 'border', 'shadow']) assert.ok(module.includes(`data-preview="${preview}"`), `preview hook retained: ${preview}`);
  for (const value of ['80, 90, 100, 110, 125, 150', 'solid', 'outline', 'ghost', 'contrast', 'frosted', 'neon2']) assert.ok(module.includes(value), `choice vocabulary retained: ${value}`);
});

test('host validates React setting actions and preserves the existing settings/security APIs', () => {
  const renderer = read('src/renderer.js');
  const module = read('src/renderer-react/remaining-settings-panels.tsx');
  assert.match(module, /madstation:remaining-settings-action/);
  assert.match(renderer, /madstation:remaining-settings-action/);
  assert.match(renderer, /REMAINING_APP_SETTING_CHOICES/);
  assert.match(renderer, /REMAINING_APP_BOOLEAN_KEYS/);
  assert.match(renderer, /await updateAppSettings\(\{ \[action\.key\]: action\.value \}\)/);
  assert.match(renderer, /action\.key === 'remoteIcons' && typeof action\.value === 'boolean'/);
  assert.match(renderer, /await updateSecurity\(\{ remoteIcons: action\.value \}\)/);
  assert.match(renderer, /action\.type === 'open-icon-folder'/);
  assert.match(renderer, /action\.type === 'refresh-icons'/);
  assert.match(renderer, /state\.settings\?\.confirmAccountDeletion !== false/);
  assert.match(renderer, /madstation:appearance-settings/);
  assert.match(module, /madstation:global-settings-panels-rendered/);
  assert.doesNotMatch(renderer, /querySelectorAll\('\[data-app-choice\]'\)/, 'legacy active-class writer is removed');
  assert.doesNotMatch(renderer, /\$\('confirmAccountDeletion'\)/, 'legacy account-safety DOM writer is removed');
});

test('remaining settings module is wired into Vite, HTML, packaging and the normal test list', () => {
  const vite = read('vite.config.ts');
  const html = read('src/renderer.html');
  const pkg = JSON.parse(read('package.json'));
  const main = read('src/main.js');
  const css = read('src/styles.css');
  assert.match(vite, /remaining-settings-panels-react.*remaining-settings-panels\.tsx/);
  assert.match(html, /\.\.\/build\/remaining-settings-panels-react\.js/);
  assert.ok(pkg.scripts.test.includes('tests/renderer-react-remaining-settings-panels.test.js'));
  assert.ok(pkg.build.extraResources.some((item) => item.from === 'src' && item.filter?.includes('renderer-react/remaining-settings-panels.tsx')));
  assert.match(main, /src\/renderer-react\/remaining-settings-panels\.tsx/);
  assert.match(css, /\.remaining-settings-react-root\s*\{\s*display:\s*contents;/);
});

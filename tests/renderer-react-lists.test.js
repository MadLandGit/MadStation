const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

test('Clipboard, Notes and To-do React entry is part of the Vite production build', () => {
  const vite = read('vite.config.ts');
  const html = read('src/renderer.html');
  const packageJson = JSON.parse(read('package.json'));
  assert.match(vite, /'utility-lists-react': resolve\(__dirname, 'src\/renderer-react\/utility-lists\.tsx'\)/);
  assert.match(html, /src="\.\.\/build\/utility-lists-react\.js"/);
  assert.match(packageJson.scripts.test, /tests\/renderer-react-lists\.test\.js/);
});

test('React list bridge takes ownership only after mount announces readiness', () => {
  const component = read('src/renderer-react/utility-lists.tsx');
  const renderer = read('src/renderer.js');
  assert.match(component, /createRoot\(clipboardMount\)/);
  assert.match(component, /createRoot\(notesMount\)/);
  assert.match(component, /createRoot\(todosMount\)/);
  assert.match(component, /madstation:utility-lists-react-ready/);
  assert.match(renderer, /addEventListener\('madstation:utility-lists-react-ready', \(\) => \{ renderClipboard\(\); renderNotes\(\); renderTodos\(\); \}\)/);
  for (const [name, rootId] of [['renderClipboard', 'clipboardItems'], ['renderNotes', 'notesList'], ['renderTodos', 'todoList']]) {
    const start = renderer.indexOf(`function ${name}()`);
    const end = renderer.indexOf('\n}', start) + 2;
    const body = renderer.slice(start, end);
    assert.ok(start >= 0 && end > start, `${name} exists`);
    assert.match(body, /window\.MadStationUtilityLists/);
    assert.match(body, /return;/, `${name} returns after updating React`);
    assert.match(body, new RegExp(`const root = \\$\\('${rootId}'\\)`));
  }
});

test('React Notes cards preserve edit/delete behavior and use stable keys', () => {
  const component = read('src/renderer-react/utility-lists.tsx');
  const renderer = read('src/renderer.js');
  assert.match(component, /props\.items\.map\(\(note\) =>/);
  assert.match(component, /key=\{note\.id\}/);
  assert.match(component, /props\.onEdit\(note\.id\)/);
  assert.match(component, /props\.onDelete\(note\.id\)/);
  assert.match(component, /<NoteBody body=\{note\.body\} \/>/);
  assert.doesNotMatch(component, /dangerouslySetInnerHTML|\.innerHTML/);
  assert.match(renderer, /!notesSettings\.confirmDelete \|\| window\.confirm\('Delete this note\?'\)/);
  assert.match(renderer, /updatedLabel: formatSnippetDate\(note\.updatedAt\)/);
});

test('React To-do rows retain completion state, confirmation, and legacy persistence callbacks', () => {
  const component = read('src/renderer-react/utility-lists.tsx');
  const renderer = read('src/renderer.js');
  assert.match(component, /key=\{todo\.id\}/);
  assert.match(component, /checked=\{todo\.completed\}/);
  assert.match(component, /onChange=\{\(\) => props\.onToggle\(todo\.id\)\}/);
  assert.match(component, /props\.onDelete\(todo\.id\)/);
  assert.match(renderer, /onToggle: \(id\) => toggleTodo\(id\)/);
  assert.match(renderer, /!todoSettings\.confirmDelete \|\| window\.confirm\('Delete this task\?'\)/);
  assert.match(renderer, /function toggleTodo\(id\).*saveTodos\(\); renderTodos\(\);/);
});


test('React Clipboard history preserves copy/edit/pin/delete callbacks and safe text output', () => {
  const component = read('src/renderer-react/utility-lists.tsx');
  const renderer = read('src/renderer.js');
  assert.match(component, /props\.items\.map\(\(item\) =>/);
  assert.match(component, /key=\{item\.id\}/);
  assert.match(component, /props\.onCopy\(item\.id\)/);
  assert.match(component, /props\.onEdit\(item\.id\)/);
  assert.match(component, /props\.onTogglePin\(item\.id\)/);
  assert.match(component, /props\.onDelete\(item\.id\)/);
  assert.match(renderer, /reactLists\.updateClipboard\(\{/);
  assert.match(renderer, /onTogglePin: \(id\) => toggleClipboardPin\(id\)/);
  assert.match(renderer, /function filteredClipboardItems\(\)/);
  assert.match(renderer, /clipboardItems = clipboardItems\.filter\(\(item\) => item\.id !== id\)/);
  assert.doesNotMatch(component, /dangerouslySetInnerHTML|\.innerHTML/);
});

test('React lists render text as React children instead of HTML strings', () => {
  const component = read('src/renderer-react/utility-lists.tsx');
  assert.match(component, /\{line\}/);
  assert.match(component, /\{todo\.text\}/);
  assert.match(component, /\{line\}/);
  assert.match(component, /\{item\.sizeLabel\}/);
  assert.match(component, /\{note\.title\}/);
  assert.doesNotMatch(component, /dangerouslySetInnerHTML/);
});

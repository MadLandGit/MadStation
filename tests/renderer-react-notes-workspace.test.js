const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Notes workspace React entry, controller and packaged sources are wired', () => {
  const html = read('src/renderer.html');
  const vite = read('vite.config.ts');
  const pkg = JSON.parse(read('package.json'));
  const main = read('src/main.js');
  assert.match(html, /id="notesWorkspaceControllerMount"/);
  assert.match(html, /id="notesHeaderReactMount"/);
  assert.match(html, /id="notesComposerReactMount"/);
  assert.match(html, /id="notesListHeaderReactMount"/);
  assert.match(html, /id="notesSettingsReactMount"/);
  assert.match(html, /src="\.\.\/build\/notes-workspace-react\.js"/);
  assert.match(vite, /'notes-workspace-react': resolve\(__dirname, 'src\/renderer-react\/notes-workspace\.tsx'\)/);
  assert.ok(pkg.build.extraResources.some((resource) => resource.from === 'src' && resource.filter?.includes('renderer-react/notes-workspace.tsx')));
  assert.match(main, /'src\/renderer-react\/notes-workspace\.tsx'/);
  assert.match(pkg.scripts.test, /renderer-react-notes-workspace\.test\.js/);
});

test('Notes-specific header, search, composer and settings markup is React-owned', () => {
  const html = read('src/renderer.html');
  const component = read('src/renderer-react/notes-workspace.tsx');
  assert.doesNotMatch(html, /id="(?:notesCount|notesSearch|notesListMeta|noteTitleInput|noteBodyInput|noteCharCount|saveNoteBtn|noteEditorTitle)"/);
  assert.match(component, /function NotesHero/);
  assert.match(component, /function NotesListHeader/);
  assert.match(component, /function NotesComposer/);
  assert.match(component, /function NotesSettingsDialog/);
  assert.match(component, /madstation:notes-header-action/);
  assert.match(component, /madstation:notes-composer-action/);
  assert.match(component, /madstation:notes-settings-action/);
  assert.doesNotMatch(component, /localStorage|window\.aiHub|dangerouslySetInnerHTML|\.innerHTML/);
});

test('Host keeps notes persistence, search, deletion and settings policy authoritative', () => {
  const renderer = read('src/renderer.js');
  assert.match(renderer, /const NOTES_KEY = 'metastation-notes-v1'/);
  assert.match(renderer, /function saveNotes\(\)/);
  assert.match(renderer, /function saveNote\(draft = notesComposerDraft\)/);
  assert.match(renderer, /madstation:notes-composer-action[\s\S]*draft\.body\.slice\(0, 200000\)/);
  assert.match(renderer, /madstation:notes-header-action[\s\S]*notesSearchQuery = action\.value\.slice\(0, 200\)/);
  assert.match(renderer, /function saveNotesSettingsFromUi\(settings\)[\s\S]*saveNotesSettings\(\);[\s\S]*saveNotes\(\);/);
  assert.match(renderer, /onDelete: \(id\) => \{[\s\S]*notesSettings\.confirmDelete/);
  assert.doesNotMatch(renderer, /\$\('noteTitleInput'\)|\$\('noteBodyInput'\)|\$\('notesSearch'\)/);
});

test('Notes settings backdrop and keyboard handling target the outer modal', () => {
  const component = read('src/renderer-react/notes-workspace.tsx');
  assert.match(component, /type KeyboardEvent as ReactKeyboardEvent/);
  assert.match(component, /handleBodyKeyDown\(event: ReactKeyboardEvent<HTMLTextAreaElement>\)/);
  assert.match(component, /const onKeyDown: EventListener = \(nativeEvent\) =>/);
  assert.match(component, /const event = nativeEvent as globalThis\.KeyboardEvent/);
  assert.match(component, /document\.getElementById\('notesSettingsModal'\)/);
  assert.match(component, /event\.target === overlay/);
  assert.match(component, /event\.key === 'Escape'/);
  assert.match(component, /querySelectorAll<HTMLElement>\('button:not\(\[disabled\]\), select:not\(\[disabled\]\)/);
});


test('Notes settings keep focus stable while editing and trap focus in the open dialog', () => {
  const component = read('src/renderer-react/notes-workspace.tsx');
  assert.match(component, /useEffect\(\(\) => \{\s*if \(!model\.visible\) return;\s*document\.getElementById\('notesSettingsModal'\)[\s\S]*?\}, \[model\.visible\]\)/);
  assert.match(component, /document\.activeElement === focusable\[0\] \|\| !overlay\.contains\(document\.activeElement\)/);
  assert.match(component, /document\.activeElement === focusable\[focusable\.length - 1\] \|\| !overlay\.contains\(document\.activeElement\)/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('React Appearance entry owns homepage-style, mode, accent, and background roots', () => {
  const component = read('src/renderer-react/appearance-controls.tsx');
  for (const rootId of ['homepageStyles', 'themeOptions', 'accentOptions', 'backgroundLibrary']) assert.match(component, new RegExp(`\\['${rootId}',`));
  assert.match(read('vite.config.ts'), /appearance-controls-react.*appearance-controls\.tsx/);
  assert.match(read('src/renderer.html'), /build\/appearance-controls-react\.js/);
});

test('Appearance component preserves CSS/data hooks and dispatches controller events instead of mutating its roots', () => {
  const component = read('src/renderer-react/appearance-controls.tsx');
  const renderer = read('src/renderer.js');
  assert.ok(component.includes("className={`homepage-style-card ${active ? 'active' : ''}`}"), 'homepage-style selection retains active styling');
  for (const hook of ['data-homepage-style', 'homepage-style-preview--', 'data-theme-choice', 'data-accent-choice', 'data-background-key', 'data-background-preview', 'data-remove-background', 'aria-pressed']) assert.ok(component.includes(hook), `missing ${hook}`);
  for (const eventName of ['homepage-style-select', 'appearance-theme-mode', 'appearance-accent', 'appearance-custom-accent', 'appearance-background-select', 'appearance-background-remove']) assert.ok(component.includes(`madstation:${eventName}`), `missing event ${eventName}`);
  assert.match(renderer, /madstation:appearance-settings/);
  assert.doesNotMatch(component, /data-theme-preset|appearance-theme-preset|themePreset/);
  assert.doesNotMatch(renderer, /THEME_PRESETS|applyThemePreset|themePreset|appearance-theme-preset/);
  assert.doesNotMatch(renderer, /querySelectorAll\('\[data-theme-choice\]'\)/);
  assert.doesNotMatch(renderer, /querySelectorAll\('\[data-accent-choice\]'\)/);
  assert.doesNotMatch(renderer, /function renderBackgroundLibrary\(\)\s*\{[\s\S]{0,500}innerHTML/);
});


test('homepage previews use distinct mini-scenes based on each homepage implementation', () => {
  const component = read('src/renderer-react/appearance-controls.tsx');
  const styles = read('src/styles.css');
  for (const scene of [
    'hp-legacy-core', 'hp-simple-app-grid', 'hp-retro-terminal',
    'hp-crt-case', 'hp-crt-moon', 'hp-crt-lamp', 'hp-crt-desk-top', 'hp-crt-drive', 'hp-para-grid', 'hp-pbig-stage', 'hp-galaxy-planet-a', 'hp-galaxy-gauges', 'hp-galaxy-gauge',
    'hp-jungle-portal', 'hp-clay-main', 'hp-glass-main', 'hp-iso-scene', 'hp-iso-plaque', 'hp-galaxy-nebula', 'hp-galaxy-spark',
  ]) {
    assert.ok(component.includes(scene), `missing purpose-built ${scene} preview structure`);
    assert.ok(styles.includes(scene), `missing styling for ${scene} preview structure`);
  }
  assert.match(component, /function HomepageStylePreview\(/);
  assert.doesNotMatch(styles, /\.homepage-style-preview--neon-cyberpunk/);
  assert.match(styles, /\.homepage-style-preview--galaxy/);
  assert.match(styles, /\.homepage-style-preview--claymorphism/);
  assert.match(component, /case 'isometric-world':[\s\S]{0,180}hp-iso-atmosphere/);
  for (const detail of ['hp-iso-ground', 'hp-iso-building-hub', 'hp-iso-building-a', 'hp-iso-building-b', 'hp-iso-caption']) {
    assert.ok(component.includes(detail), `missing Isometric World landmark ${detail}`);
    assert.ok(styles.includes(detail), `missing Isometric World landmark styling ${detail}`);
  }
});


test('Retro Complex and Galaxy previews mirror the actual homepage compositions and scale responsively', () => {
  const component = read('src/renderer-react/appearance-controls.tsx');
  const styles = read('src/styles.css');
  assert.match(component, /new ResizeObserver\(updateScale\)/, 'preview art scales when its card width changes');
  assert.match(component, /transform: `scale\(\$\{artScale\}\)`/, 'a measured scale is applied to the fixed artboard');
  assert.doesNotMatch(styles, /scale\(calc\(100cqw \/ 320px\)\)/, 'no browser-specific container division is needed');
  const retro = styles.match(/\/\* RETRO COMPLEX —[\s\S]*?\/\* 3D PARALLAX —/)?.[0] || '';
  assert.match(retro, /#071333[\s\S]*#101c44/, 'Retro Complex uses its night-sky window');
  assert.match(retro, /#f36b87/, 'the CRT terminal keeps its compact pink accent');
  assert.match(retro, /\.hp-crt-desk-top \{[\s\S]*?#b08a58/, 'the tabletop uses the walnut finish');
  assert.match(retro, /\.hp-crt-case \{[\s\S]*?top: 15\.2%;[\s\S]*?height: 63\.8%;/, 'the monitor reaches the tabletop without a stand');
  assert.match(retro, /hp-crt-stand \{ display: none !important; \}/, 'the CRT has no artificial monitor stand');
  const galaxy = styles.match(/\/\* GALAXY —[\s\S]*$/)?.[0] || '';
  assert.match(galaxy, /hp-galaxy-info[\s\S]*inset: auto auto 7% 4%/, 'Galaxy selected-app details sit in the lower-left dock');
  assert.match(galaxy, /hp-galaxy-system[\s\S]*inset: auto 4% 7% auto/, 'Galaxy system metrics sit in the lower-right dock');
  assert.match(galaxy, /conic-gradient\(#59ddc0 0 24%/, 'Galaxy CPU telemetry uses its own circular gauge');
  assert.match(galaxy, /hp-galaxy-nebula/, 'Galaxy uses nebula lighting instead of a tiled star-dot field');
  assert.doesNotMatch(galaxy, /background-image:\s*radial-gradient\(circle,#[0-9a-f]{3,8}/i, 'Galaxy preview has no repeated dot texture');
  assert.match(styles, /\.homepage-style-preview \.hp-iso-scene \{[\s\S]*?width:\s*100%;[\s\S]*?height:\s*100%;/, 'Isometric SVG stays full-card size under Settings SVG icon rules');
  assert.match(styles, /\.homepage-style-preview--isometric-world \.hp-iso-atmosphere/, 'Isometric uses atmospheric lighting behind a full island illustration');
});

test('every built-in theme has a dedicated thumbnail scene and matching preview skin', () => {
  const component = read('src/renderer-react/appearance-controls.tsx');
  const stylesBlock = component.match(/const HOMEPAGE_STYLES = \[([\s\S]*?)\] as const;/)?.[1] || '';
  const ids = [...stylesBlock.matchAll(/\{ id: '([^']+)'/g)].map((match) => match[1]);
  const previewCases = new Set([...component.matchAll(/case '([^']+)':/g)].map((match) => match[1]));
  const css = read('src/styles.css');
  assert.ok(ids.length >= 10, 'the built-in theme list was found');
  for (const id of ids) {
    assert.ok(previewCases.has(id), `${id} should have a purpose-built preview case`);
    assert.ok(css.includes(`homepage-style-preview--${id}`), `${id} should have a dedicated preview skin`);
  }
});

test('custom background previews permit HTTPS and file URLs only', () => {
  const component = read('src/renderer-react/appearance-controls.tsx');
  assert.match(component, /url\.protocol !== 'https:' && url\.protocol !== 'file:'/);
  assert.match(component, /parsed\.protocol !== 'https:' && parsed\.protocol !== 'file:'/);
  assert.match(component, /item\.id\.slice\(0, 120\)/);
});

test('appearance actions are validated and retain existing settings update methods', () => {
  const renderer = read('src/renderer.js');
  assert.match(renderer, /appearance-theme-mode'[\s\S]{0,180}\['dark', 'light', 'system'\]/);
  assert.match(renderer, /appearance-accent'[\s\S]{0,220}\['blue', 'violet', 'pink', 'red', 'orange', 'green', 'teal'\]/);
  assert.match(renderer, /appearance-background-remove'[\s\S]{0,700}removeBackground/);
  assert.match(renderer, /async function addBackgroundFromUrl\(\)/);
  assert.match(renderer, /async function addBackgroundFromComputer\(\)/);
});

test('new Appearance React module is included in packaged developer source', () => {
  const packageJson = JSON.parse(read('package.json'));
  const src = packageJson.build.extraResources.find((item) => item.from === 'src' && item.to === 'developer-docs/src');
  assert.ok(src?.filter.includes('renderer-react/appearance-controls.tsx'));
});


test('Appearance theme cards only select themes; management actions live in Developer Options', () => {
  const component = read('src/renderer-react/appearance-controls.tsx');
  assert.match(component, /data-homepage-style=\{style\.id\}/);
  assert.match(component, /madstation:theme-imported/);
  assert.doesNotMatch(component, /homepage-style-options|Delete theme|Restore original theme|removeImportedTheme/);
  assert.doesNotMatch(read('src/styles.css'), /homepage-style-options/);
  const developer = read('src/renderer-react/information-security-panels.tsx');
  assert.match(developer, /<h3>Manage Themes<\/h3>/);
  assert.match(developer, /Refresh themes/);
  assert.match(developer, /Delete imported/);
  assert.doesNotMatch(developer, /Restore original|Restore Default Theme Package/);
  assert.match(developer, /Built-in themes cannot be replaced by ZIP files/);
});

test('Default homepage is not selectable from Appearance', () => {
  const controls = read('src/renderer-react/appearance-controls.tsx');
  const html = read('src/renderer.html');
  assert.doesNotMatch(controls, /id: 'legacy', label: 'Default'/);
  assert.doesNotMatch(html.match(/data-q="Themes homepage style[^"]*"/)?.[0] || '', /Default/);
  assert.match(controls, /saved === 'legacy'/, 'the hidden choice can still be represented as the current active mode without adding a card');
});

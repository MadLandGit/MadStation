const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

test('Core System is the single entry point for agent routing', () => {
  const coreDoc = read('docs/architecture/CORE_SYSTEM.md');
  const agents = read('AGENTS.md');
  const claude = read('CLAUDE.md');
  assert.match(coreDoc, /single entry point for agents and contributors/i);
  for (const file of [agents, claude]) assert.match(file, /start with \*\*`docs\/architecture\/CORE_SYSTEM\.md`\*\*/i);
  for (const route of ['src/home-app-list.js', 'src/home-mini-list.js', 'src/home-widget-list.js', 'src/home-customizer.js', 'src/home-core-system.js', 'src/renderer.js', 'tests/home-systems.test.js']) {
    assert.ok(coreDoc.includes(route), `Core System routes to ${route}`);
  }
  assert.match(read('src/main.js'), /'docs\/architecture\/CORE_SYSTEM\.md'/, 'developer file browser can open the Core System guide');
  assert.match(read('src/renderer.html'), /id="developerReactMount"/);
  assert.match(read('src/renderer-react/information-security-panels.tsx'), /\"path\": \"docs\/architecture\/CORE_SYSTEM\.md\"/);
  const developerPanel = read('src/renderer-react/information-security-panels.tsx');
  const developerPrompts = read('src/renderer.js');
  assert.match(developerPanel, /DEVELOPER_CONTENT/);
  assert.match(developerPrompts, /for \(const key of Object\.keys\(DEVELOPER_PROMPTS\)\)/);
  assert.match(developerPrompts, /DEVELOPER_PROMPTS\[key\] = `Start with docs\/architecture\/CORE_SYSTEM\.md/);
  assert.doesNotMatch(developerPrompts, /First inspect AGENTS\.md, CLAUDE\.md, README\.md/);
  for (const file of ['docs/archive/design-prototypes/light-solid-square.html', 'docs/archive/design-prototypes/dark-glass-sharp.html']) {
    // Archived prototypes are optional, non-contractual docs; skip when the archive folder isn't shipped.
    if (!fs.existsSync(path.join(root, file))) continue;
    assert.match(read(file), /Start with docs\/architecture\/CORE_SYSTEM\.md/);
    assert.doesNotMatch(read(file), /First inspect AGENTS\.md, CLAUDE\.md, README\.md/);
  }
});

test('Default home hides the System and Hub companions headings without removing their panels', () => {
  const html = read('src/renderer.html');
  const companions = html.match(/<aside class="home-tools" id="homeApps"[\s\S]*?<\/aside>/)?.[0] || '';
  const widgets = html.match(/<aside class="home-side" aria-label="System widgets"[\s\S]*?<\/aside>/)?.[0] || '';
  assert.ok(companions, 'Hub companions panel remains in the default homepage');
  assert.ok(widgets, 'System widgets panel remains in the default homepage');
  assert.doesNotMatch(companions, /class="home-label"/, 'Hub companions title and dot are removed');
  assert.doesNotMatch(widgets, /class="home-label"/, 'System title and dot are removed');
  assert.match(companions, /id="homeAppsReactMount"/, 'Hub companion app mount remains');
  assert.match(widgets, /id="homeWidgets"/, 'System widget mount remains');
});

test('Hub companions remain their own full-card registry', () => {
  const registry = read('src/home-app-list.js');
  const engine = read('src/home-apps.js');
  assert.match(registry, /id: 'instruction-forge'/);
  assert.match(registry, /id: 'ai-lab'/);
  assert.match(registry, /id: 'video-hub'/);
  assert.match(registry, /id: 'image-hub'/);
  assert.doesNotMatch(registry, /id: 'notes-tasks'/, 'Notes & Tasks is not registered as a Hub companion');
  assert.doesNotMatch(registry, /dock\s*:\s*['"]top['"]/, 'companions no longer use a positional dock flag');
  assert.doesNotMatch(engine, /function drawLinks\(/, 'link drawing is centralized in the Core runtime');
  assert.match(engine, /window\.MadHomeCore\?\.registerSystem\('companions'/);
  assert.match(engine, /launchTarget\(target\)/, 'mini apps can route to the same workspace launcher');
});

test('Hub companion cards and the More-apps panel are React-owned without changing registry and layout behavior', () => {
  const engine = read('src/home-apps.js');
  const view = read('src/renderer-react/home-companions.tsx');
  const html = read('src/renderer.html');
  const vite = read('vite.config.ts');
  assert.match(engine, /attachReactRenderer\(renderer\)/);
  assert.match(engine, /function layout\(\)/);
  assert.match(engine, /CONFIG\.minCardHeight/);
  assert.match(engine, /CONFIG\.minTileHeight/);
  assert.match(engine, /window\.MadHomeCore\?\.registerSystem\('companions'/);
  assert.doesNotMatch(engine, /function makeCard\(|\.innerHTML\s*=|createElement\('button'\)/, 'controller no longer builds companion card DOM');
  assert.match(view, /createRoot\(mount\)/);
  assert.match(view, /createPortal\(/);
  assert.match(view, /key=\{app\.id\}/);
  assert.match(view, /onClick=\{\(\) => onLaunch\(app\.id\)\}/);
  assert.match(view, /sanitizeSvgMarkup/);
  assert.match(view, /chipText/);
  assert.doesNotMatch(view, /dangerouslySetInnerHTML=\{\{\s*__html:\s*chip/i, 'stored chip text is never rendered as HTML');
  assert.match(html, /id="homeAppsReactMount"/);
  assert.match(html, /src="\.\.\/build\/home-companions-react\.js"/);
  assert.match(vite, /'home-companions-react': resolve\(__dirname, 'src\/renderer-react\/home-companions\.tsx'\)/);
  assert.match(read('src/home.css'), /\.home-apps-react-root \{ display: contents; \}/);
});

test('Default mini-app registry stays independent and Notes & Tasks is removed from the top shortcut position', () => {
  const registry = read('src/home-mini-list.js');
  const engine = read('src/home-mini-apps.js');
  const markup = read('src/renderer.html');
  assert.doesNotMatch(registry, /id: 'notes-tasks'|name: 'Notes & Tasks'/, 'the Default homepage no longer renders Notes above the AI Hub');
  assert.match(engine, /attachReactRenderer\(renderer\)/);
  assert.match(engine, /window\.MadHomeCore\?\.registerSystem\('mini-apps'/);
  assert.doesNotMatch(engine, /function makeTile\(|createElement\('button'\)|\.innerHTML\s*=/, 'controller no longer constructs mini-app tile DOM');
  assert.match(markup, /id="homeMiniApps"/);
  assert.match(markup, /src="\.\.\/build\/home-mini-apps-react\.js"/);
  const view = read('src/renderer-react/home-mini-apps.tsx');
  const vite = read('vite.config.ts');
  assert.match(vite, /'home-mini-apps-react': resolve\(__dirname, 'src\/renderer-react\/home-mini-apps\.tsx'\)/);
  assert.match(view, /createRoot\(mount\)/);
  assert.match(view, /key=\{app\.id\}/);
  assert.match(view, /--mini-offset/);
  assert.match(view, /onClick=\{\(\) => window\.MadHomeApps\?\.launchTarget\(app\.launch\)\}/);
  assert.match(view, /sanitizeSvgMarkup/);
  const css = read('src/home.css');
  assert.match(css, /\.home-core \{ grid-column: 3; grid-row: 1;/, 'core remains in the center grid cell');
  assert.match(css, /\.home-mini-apps \{ grid-column: 3; grid-row: 1;/, 'mini-app container shares the core grid cell rather than positioning relative to a side column');
  assert.match(css, /\.home-mini-app-tile[\s\S]*?--mini-offset/);
  assert.match(css, /\.home-mini-apps \.home-mini-app-tile \{[^}]*left: calc\(50% \+ var\(--mini-offset, 0px\)\)[^}]*translate: -50% 0;/s,
    'a single mini app is centered on the core axis and multiple tiles center on their symmetric offsets using the individual translate property');
  assert.match(css, /@keyframes home-in[\s\S]*?to \{ opacity: 1; transform: none; \}/,
    'shared entrance animation owns transform, so mini-app centering cannot use transform');
  assert.match(css, /\.home-mini-apps \.home-mini-app-tile \{[^}]*animation: home-mini-app-in /s,
    'mini-app tiles override the shared transform animation to keep centering and hover transforms active');
  assert.match(css, /@keyframes home-mini-app-in \{ from \{ opacity: 0; \} to \{ opacity: 1; \} \}/,
    'mini-app entrance animation affects opacity only, never positioning transforms');
  assert.match(css, /\.home-mini-apps \.home-mini-app-tile:hover \{ transform: translateY\(-4px\); \}/,
    'hover motion only affects the vertical transform and preserves individual horizontal centering');
  assert.match(css, /\.home-mini-apps \.home-mini-app-tile:active \{ transform: translateY\(-4px\) scale\(\.97\); \}/,
    'pressed motion preserves horizontal centering');
  assert.match(css, /@media \(max-width: 940px\)[\s\S]*?\.home-mini-apps \.home-mini-app-tile \{[^}]*translate: none; transform: none; \}[\s\S]*?\.home-mini-apps \.home-mini-app-tile:hover \{ transform: translateY\(-4px\); \}[\s\S]*?\.home-mini-apps \.home-mini-app-tile:active \{ transform: translateY\(-4px\) scale\(\.97\); \}/,
    'responsive flex layout clears desktop centering translation and keeps hover and press motion correct');
  assert.match(engine, /appId: element\.dataset\.appId, anchor: 'top', grouping: 'single'/,
    'each mini app remains registered for a signal line to the core');
});

test('React mini-app tiles preserve Home Core hooks and filter SVG markup', () => {
  const view = read('src/renderer-react/home-mini-apps.tsx');
  const engine = read('src/home-mini-apps.js');
  assert.match(view, /const ALLOWED_SVG_TAGS = new Set/);
  assert.match(view, /const ALLOWED_SVG_ATTRIBUTES = new Set/);
  assert.ok(view.includes(String.raw`/\burl\s*\(/i`), 'SVG sanitizer rejects URL-valued presentation attributes');
  assert.match(view, /data-app-id=\{app\.id\}/);
  assert.match(view, /className="home-module home-mini-app-tile"/);
  assert.match(view, /onPointerMove=\{pointerGlow\}/);
  assert.match(view, /document\.dispatchEvent\(new CustomEvent\('mad:home-mini-apps-built'/);
  assert.match(engine, /getLinks: \(\) =>/);
  assert.match(engine, /querySelectorAll\('.home-mini-app-tile:not\(.is-off\)'\)/);
  assert.doesNotMatch(engine, /\.innerHTML\s*=|function makeTile\(/);
});

test('Live widget shells are React-owned while registry and telemetry panel contracts stay stable', () => {
  const registry = read('src/home-widget-list.js');
  const engine = read('src/home-widgets.js');
  const view = read('src/renderer-react/home-widgets.tsx');
  const html = read('src/renderer.html');
  const vite = read('vite.config.ts');
  const css = read('src/home.css');
  assert.match(registry, /id: 'ram-monitor'/);
  assert.match(registry, /title: 'System performance'/);
  assert.match(registry, /id: 'notes-tasks'/, 'Notes & Tasks is registered in the Default homepage widget rail');
  assert.match(registry, /title: 'Notes & Tasks'/);
  assert.match(registry, /size: 'medium'/);
  assert.match(registry, /order: 15/);
  assert.match(registry, /home-notes-widget-launch/);
  assert.match(registry, /launchTarget\?\.\('clipboard'\)/, 'clicking the Notes widget opens the existing Notes workspace');
  assert.match(registry, /size: 'large'/);
  assert.match(registry, /order: 10/);
  assert.match(registry, /render\(panel\)/);
  assert.match(registry, /mount\.id = 'launcherRamMonitorMount'/, 'the existing RAM monitor mount id is preserved');
  assert.match(engine, /\['small', 'medium', 'large'\]/);
  assert.match(engine, /attachReactRenderer\(renderer\)/);
  assert.match(engine, /mountPanel\(id, panel\)/);
  assert.match(engine, /widget\.render\(panel, \{/);
  assert.doesNotMatch(engine, /function makeShell\(|document\.createElement|innerHTML\s*=|stack\.appendChild/, 'controller no longer creates or moves widget shell DOM');
  assert.match(engine, /registerSystem\('widgets'/);
  assert.match(view, /className="home-widget"/);
  assert.match(view, /data-widget-id=\{widget\.id\}/);
  assert.match(view, /controller\.mountPanel\(widget\.id, panel\)/);
  assert.match(view, /mad:home-widgets-built/);
  assert.match(html, /src="\.\.\/build\/home-widgets-react\.js"/);
  assert.match(vite, /'home-widgets-react': resolve\(__dirname, 'src\/renderer-react\/home-widgets\.tsx'\)/);
  assert.match(css, /\.home-widget-list[^}]*overflow-y: auto/s);
  assert.match(css, /\.home-widget[^}]*var\(--h-card-border\)[^}]*var\(--h-r-card-lg\)[^}]*var\(--h-card-shadow\)/s);
  assert.match(css, /\.home-widget\[data-size="small"\]/);
  assert.match(css, /\.home-widget\[data-size="medium"\]/);
  assert.match(css, /\.home-widget\[data-size="large"\]/);
  assert.match(css, /\.home-widget\[data-widget-id="notes-tasks"\]\[data-size="medium"\]/);
  assert.match(css, /\.home-notes-widget-launch:focus-visible/);
  assert.match(css, /\.home-widget\[data-widget-id="notes-tasks"\]\[data-size="small"\]/,
    'the Notes widget stays usable when the user chooses the compact widget size');
});

test('Home Core owns shared animated lines, highlighting, and responsive coordination', () => {
  const core = read('src/home-core-system.js');
  const html = read('src/renderer.html');
  assert.match(core, /registerSystem/);
  assert.match(core, /function drawLinks\(/);
  assert.match(core, /function setHot\(/);
  assert.match(core, /ResizeObserver/);
  assert.match(core, /NARROW_QUERY/);
  assert.match(core, /home-link-path/);
  const scripts = ['home-core-system.js', 'home-apps.js', 'home-app-list.js', 'home-mini-apps.js', 'home-mini-list.js', 'home-widgets.js', 'home-widget-list.js', 'home-customizer.js', 'home-layout-editor.js', 'renderer.js']
    .map((file) => html.indexOf(`<script src="${file}"></script>`));
  assert.ok(scripts.every((index) => index >= 0), 'all runtime engines, registries, and the renderer load');
  assert.deepEqual([...scripts].sort((a, b) => a - b), scripts, 'Core loads before engines and registries, renderer loads last');
});

test('RAM monitor telemetry hooks and non-launcher monitor mounts remain intact', () => {
  const renderer = read('src/renderer.js');
  const html = read('src/renderer.html');
  const registry = read('src/home-widget-list.js');
  for (const id of ['aiLabRamMonitorMount', 'aiHubRamMonitorMount', 'videoHubRamMonitorMount', 'imageHubRamMonitorMount', 'clipboardRamMonitorMount', 'forgeRamMonitorMount']) {
    assert.ok(html.includes(`id="${id}"`), `existing monitor mount ${id} remains in renderer markup`);
  }
  assert.match(registry, /launcherRamMonitorMount/);
  assert.match(renderer, /\['launcherRamMonitorMount', 'home'\]/);
  assert.match(renderer, /data-memory-monitor/);
  assert.match(renderer, /data-memory-cleanup/);
  assert.match(renderer, /data-memory-refresh/);
  assert.match(renderer, /data-memory-details/);
  assert.match(renderer, /const RAM_HISTORY_MAX = 48/);
});


test('Home menu modules are user-customizable and personal preferences are routed through Core', () => {
  const customizer = read('src/home-customizer.js');
  const companionEngine = read('src/home-apps.js');
  const miniEngine = read('src/home-mini-apps.js');
  const widgetEngine = read('src/home-widgets.js');
  const html = read('src/renderer.html');
  assert.match(html, /id="homeCustomizeBtn"/);
  assert.match(html, /home-customizer\.js/);
  assert.match(customizer, /mad-station-home-modules-v1/);
  assert.match(customizer, /customCompanions/);
  assert.match(customizer, /customMiniApps/);
  assert.match(read('src/renderer-react/home-customizer.tsx'), /Reset defaults/);
  assert.match(customizer, /TARGET_IDS/);
  assert.match(customizer, /attachReactRenderer/);
  assert.match(customizer, /Object\.prototype\.hasOwnProperty\.call\(systems, kind\)/, 'controller validates system names before changing preferences');
  assert.match(companionEngine, /function configure\(id, patch/);
  assert.match(companionEngine, /enabled: def\.enabled !== false/);
  assert.match(miniEngine, /function configure\(id, patch/);
  assert.match(miniEngine, /enabled: def\.enabled !== false/);
  assert.match(widgetEngine, /function configure\(id, patch/);
  assert.match(widgetEngine, /patch\.size/);
});

test('Home customization dialog is React-owned while preferences and actions remain controller-owned', () => {
  const controller = read('src/home-customizer.js');
  const view = read('src/renderer-react/home-customizer.tsx');
  const html = read('src/renderer.html');
  const vite = read('vite.config.ts');
  const packageJson = JSON.parse(read('package.json'));
  assert.match(controller, /window\.MadHomeCustomizer\s*=/);
  assert.match(controller, /attachReactRenderer/);
  assert.match(controller, /mad-station-home-modules-v1/);
  assert.match(controller, /function safeWrite\(\)/);
  assert.match(controller, /function applyStoredPreferences\(\)/);
  assert.doesNotMatch(controller, /function makeModal\(|\.innerHTML\s*=|replaceChildren\(\)/, 'controller does not create or mutate the dialog DOM');
  assert.match(view, /createRoot\(mount\)/);
  assert.match(view, /key=\{item\.id\}/);
  assert.match(view, /data-home-customize-list=\{section\.kind\}/);
  assert.match(view, /bridge\.setEnabled/);
  assert.match(view, /bridge\.move/);
  assert.match(view, /bridge\.setSize/);
  assert.match(view, /bridge\.addShortcut/);
  assert.match(view, /bridge\.resetDefaults/);
  assert.match(view, /event\.key === 'Escape'/);
  assert.match(view, /role="dialog" aria-modal="true"/);
  assert.doesNotMatch(view, /dangerouslySetInnerHTML|\.innerHTML\s*=/);
  assert.match(html, /id="homeCustomizerReactMount"/);
  assert.match(html, /src="\.\.\/build\/home-customizer-react\.js"/);
  assert.match(vite, /'home-customizer-react': resolve\(__dirname, 'src\/renderer-react\/home-customizer\.tsx'\)/);
  const srcResources = packageJson.build.extraResources.find((item) => item.from === 'src');
  assert.ok(srcResources.filter.includes('renderer-react/home-customizer.tsx'));
  assert.match(read('src/home.css'), /\.home-customizer-react-root \{ display: contents; \}/);
});

test('Compact performance widget reuses the shared RAM telemetry stream', () => {
  const registry = read('src/home-widget-list.js');
  const renderer = read('src/renderer.js');
  const css = read('src/home.css');
  assert.match(registry, /id: 'performance-mini'/);
  assert.match(registry, /size: 'small'/);
  assert.match(registry, /dataset\.memoryMonitor = ''/);
  assert.match(registry, /dataset\.memoryScope = 'mini'/);
  assert.match(registry, /data-memory-slot="percent"/);
  assert.match(registry, /data-memory-slot="meter"/);
  assert.match(renderer, /mad:home-widgets-built', installMemoryMonitors/);
  assert.match(css, /\.home-performance-mini-ring/);
  assert.match(css, /\.home-widget\[data-widget-id="ram-monitor"\]\[data-size="small"\]/);
});

test('Agent-facing recipes and bundled developer resources point back to Core System', () => {
  const coreDoc = read('docs/architecture/CORE_SYSTEM.md');
  const design = read('docs/design/DESIGN_SYSTEM.md');
  const packageJson = JSON.parse(read('package.json'));
  for (const recipe of ['Add a companion', 'Add a mini app', 'Add a widget', 'Customize the Home menu']) assert.ok(coreDoc.includes(recipe), `Core System contains the ${recipe} recipe`);
  for (const recipe of ['add a Hub companion', 'add a mini app', 'add a widget']) assert.ok(design.toLowerCase().includes(recipe.toLowerCase()));
  const resourceNames = packageJson.build.extraResources.map((item) => item.from);
  assert.ok(resourceNames.includes('docs/architecture/CORE_SYSTEM.md'));
  assert.ok(resourceNames.includes('docs/design/DESIGN_SYSTEM.md'));
  const sourceResources = packageJson.build.extraResources.find((item) => item.from === 'src');
  for (const file of ['home-core-system.js', 'home-mini-list.js', 'home-widget-list.js', 'home-customizer.js', 'home-layout-editor.js']) assert.ok(sourceResources.filter.includes(file));
  assert.ok(sourceResources.filter.includes('renderer-react/home-mini-apps.tsx'), 'developer resources include the new React mini-app source');
  assert.ok(sourceResources.filter.includes('renderer-react/home-customizer.tsx'), 'developer resources include the React Home customizer source');
  assert.match(packageJson.scripts.test, /tests\/home-systems\.test\.js/);
  assert.match(packageJson.scripts.test, /tests\/home-customizer-controller\.test\.js/);
});

test('Default home puts Settings, Arrange, and Customization in one square icon-only top-right toolbar', () => {
  const html = read('src/renderer.html');
  const css = read('src/home.css');
  const toolbar = html.match(/<div class="home-topbar-actions"[\s\S]*?(?=<\/header>)/)?.[0] || '';
  assert.ok(toolbar, 'the default homepage action toolbar exists');
  const positions = ['launcherSettingsBtn', 'homeArrangeBtn', 'homeCustomizeBtn'].map((id) => toolbar.indexOf(`id="${id}"`));
  assert.ok(positions.every((position) => position >= 0), 'all three actions are in the top toolbar');
  assert.ok(positions[0] < positions[1] && positions[1] < positions[2], 'actions appear in Settings, Arrange, Customization order');
  assert.equal((html.match(/id="launcherSettingsBtn"/g) || []).length, 1, 'Settings has one live button and no leftover corner button');
  for (const id of ['launcherSettingsBtn', 'homeArrangeBtn', 'homeCustomizeBtn']) {
    const button = toolbar.match(new RegExp(`<button[^>]*id="${id}"[\\s\\S]*?<\\/button>`))?.[0] || '';
    assert.ok(button.includes('<svg'), `${id} is represented by an icon`);
    assert.doesNotMatch(button, /<span[^>]*>[^<]+<\/span>/, `${id} has no visible text label`);
  }
  assert.match(css, /\.home-topbar-actions \.home-customize-btn\s*\{[^}]*width: 40px; height: 40px; min-height: 40px/s, 'toolbar buttons use square dimensions');
  assert.match(css, /\.home-topbar-actions \.home-settings\s*\{[^}]*position: relative; left: auto; bottom: auto/s, 'Settings is in normal toolbar flow instead of a fixed corner position');
  assert.match(css, /padding: 0 148px 0 clamp\(20px, 3vw, 40px\)/, 'desktop toolbar reserves a clear lane before the window controls');
  assert.match(css, /\.home-topbar\s*\{ padding-right: 140px; \}/, 'narrow layouts keep the toolbar outside the native window-control lane');
});

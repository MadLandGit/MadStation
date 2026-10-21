const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

const tokens = read('src/design-tokens.css');
const kit = read('src/design-kit.css');
const docs = read('docs/design/DESIGN_SYSTEM.md');
const appearance = read('src/appearance.js');

// Appearance key (appearance.js) -> body data attribute (design-tokens.css)
const APPEARANCE_ATTRS = {
  surfaceStyle: 'surface-style',
  cornerStyle: 'corner-style',
  buttonCorner: 'button-corner',
  buttonBackground: 'button-background',
  borderStyle: 'border-style',
  shadowStyle: 'shadow-style',
  cardSpacing: 'card-spacing',
};

test('design system: tokens and kit load in the right order, before the page skins', () => {
  const html = read('src/renderer.html');
  const order = ['styles.css', 'design-tokens.css', 'design-kit.css', 'home.css', 'pages.css'].map((f) => html.indexOf(`href="${f}"`));
  assert.ok(order.every((i) => i >= 0), 'all five stylesheets are linked');
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'load order is styles → tokens → kit → home → pages');
});

test('Simple loads shared Appearance tokens before the Home v5 stylesheet', () => {
  const html = read('src/home-v2.html');
  const tokensLink = html.indexOf('href="design-tokens.css"');
  const homeLink = html.indexOf('href="home-v5.css"');
  assert.ok(tokensLink >= 0, 'Simple loads shared design tokens');
  assert.ok(homeLink > tokensLink, 'shared tokens load before the Home v5 skin');
  assert.match(html, /<script src="appearance\.js"><\/script>/, 'the shared Appearance mapper is loaded');
  assert.match(html, /<script src="home-v5\.js"><\/script>/, 'the Home v5 controller is loaded');
  assert.match(html, /<script src="home-v5-bridge\.js"><\/script>/, 'the Simple-specific host bridge is loaded');

  const css = stripComments(read('src/home-v5.css'));
  for (const token of [
    '--ms-home-background', '--ms-home-panel-bg', '--ms-home-panel-blur',
    '--ms-home-panel-border', '--ms-home-panel-shadow', '--ms-home-control-bg',
    '--ms-home-control-border', '--ms-home-control-shadow', '--ms-home-module-gap',
    '--ms-home-row-gap', '--ms-r-card-lg', '--ms-r-btn',
  ]) assert.ok(css.includes(`var(${token}`), `Simple consumes ${token}`);
});

test('Simple keeps its Settings action below the native window-control hit area', () => {
  const html = read('src/home-v2.html');
  const homeCss = stripComments(read('src/home-v5.css'));
  const headerRule = homeCss.match(/\.bar\s*\{([^}]*)\}/)?.[1];
  assert.ok(headerRule, 'Simple top bar rule exists');
  assert.match(headerRule, /top:\s*32px/, 'the sticky bar begins below the native titlebar hit area');
  assert.match(headerRule, /margin-top:\s*32px/, 'the top bar reserves space before the page starts');
  assert.match(html, /id="launcherSettingsBtn"/, 'the Settings action remains available');
});

test('homepage styles live in Themes while global appearance tokens remain independent', () => {
  const renderer = read('src/renderer.js');
  const controls = read('src/renderer-react/appearance-controls.tsx');
  const html = read('src/renderer.html');
  const tokenCss = stripComments(tokens);
  const homeCss = stripComments(read('src/home-v5.css'));
  assert.doesNotMatch(renderer, /THEME_PRESETS|applyThemePreset|themePreset|appearance-theme-preset/);
  assert.match(html, /<h3>Themes<\/h3>[\s\S]*id="homepageStyles"/);
  assert.doesNotMatch(html, /home-page-choice-card|homePageVersionSelect|data-theme-preset/);
  for (const [id, label] of [['v2','Simple'],['retro','Simple Retro'],['retro-complex','Retro Complex'],['parallax','3D Parallax'],['parallax-big','3D Parallax Big App'],['galaxy','Galaxy'],['parallax-jungle','Parallax Jungle'],['claymorphism','Claymorphism'],['glass','Glass'],]) {
    assert.ok(controls.includes(`id: '${id}', label: '${label}'`), `homepage style ${label} exists`);
    assert.ok(read('src/styles.css').includes(`.homepage-style-preview--${id}`), `homepage style ${label} has a visual preview`);
  }
  assert.match(controls, /madstation:homepage-style-select/);
  assert.match(renderer, /madstation:homepage-style-select[\s\S]*MadStationHomePage\?\.setMode\(mode\)/);
  for (const background of ['aurora', 'mesh', 'neon', 'parallax']) {
    assert.ok(tokenCss.includes(`body[data-background-style="${background}"]`), `${background} background is token-mapped`);
  }
  for (const value of ['solid', 'elevated', 'glass']) assert.ok(tokenCss.includes(`body[data-surface-style="${value}"]`), `${value} surface is token-mapped`);
  for (const value of ['glass', 'neon']) assert.ok(tokenCss.includes(`body[data-button-background="${value}"]`), `${value} button style is token-mapped`);
  for (const value of ['balanced', 'neon2', 'glass']) assert.ok(tokenCss.includes(`body[data-border-style="${value}"]`), `${value} border style is token-mapped`);
  for (const value of ['strong', 'neon', 'glass']) assert.ok(tokenCss.includes(`body[data-shadow-style="${value}"]`), `${value} shadow style is token-mapped`);
  assert.match(tokenCss, /body\[data-button-corner="neon"\]/);
  assert.match(tokenCss, /body\[data-corner-style="ultra"\]/);
  assert.match(homeCss, /\.home\s*\{[^}]*background:[^}]*var\(--v5-base-bg/s, 'Simple provides a visible default background');
  assert.match(homeCss, /body\[data-background-style\]:not\(\[data-background-style="plain"\]\) \.home\s*\{[^}]*var\(--ms-home-background/s, 'Simple uses the shared selected background');
  assert.match(homeCss, /\.tile\s*\{[^}]*var\(--ms-home-panel-blur/s, 'tiles consume shared surface and blur tokens');
  assert.match(homeCss, /\.btn,\s*\.icon\s*\{[^}]*var\(--ms-home-control-bg/s, 'controls consume shared button tokens');
  assert.match(homeCss, /prefers-reduced-motion/);
  assert.ok(docs.includes('The host bridge forwards the resolved core palette'));
});

test('standalone appearance previews use portable project-relative stylesheets', () => {
  for (const file of ['docs/archive/design-prototypes/light-solid-square.html', 'docs/archive/design-prototypes/dark-glass-sharp.html']) {
    // Archived prototypes are optional, non-contractual docs; skip when the archive folder isn't shipped.
    if (!fs.existsSync(path.join(root, file))) continue;
    const html = read(file);
    assert.doesNotMatch(html, /file:\/\/\/|\/mnt\/data\/|[A-Z]:\\Users\\/i, `${file} has no machine-specific file URLs`);
    const stylesheets = [...html.matchAll(/<link\b[^>]*\bhref=["']([^"']+\.css)["'][^>]*>/gi)].map((match) => match[1]);
    assert.deepEqual(stylesheets, ['../../../src/styles.css', '../../../src/design-tokens.css', '../../../src/design-kit.css', '../../../src/home.css', '../../../src/pages.css']);
    for (const stylesheet of stylesheets) {
      assert.ok(fs.existsSync(path.resolve(path.dirname(path.join(root, file)), stylesheet)), `${file} resolves ${stylesheet}`);
    }
  }
});

test('design system: every Appearance option appearance.js can set has a token rule', () => {
  for (const [key, attr] of Object.entries(APPEARANCE_ATTRS)) {
    const m = appearance.match(new RegExp(`body\\.dataset\\.${key} = \\[([^\\]]*)\\]`));
    assert.ok(m, `appearance.js declares the allowed values for ${key}`);
    const values = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
    assert.ok(values.length >= 3, `${key} has values`);
    for (const value of values) {
      assert.ok(tokens.includes(`body[data-${attr}="${value}"]`), `design-tokens.css maps ${key}="${value}"`);
    }
  }
  assert.ok(tokens.includes('body[data-density="compact"]'), 'density is mapped');
});

test('Video Hub uses the documented Compact Global Bar pattern', () => {
  const html = read('src/renderer.html');
  const styles = stripComments(read('src/styles.css'));
  const kit = stripComments(read('src/design-kit.css'));
  const start = html.indexOf('<div class="brand video-hub-brand">');
  const end = html.indexOf('<div id="videoHubSidebarControlsReactMount"', start);
  assert.ok(start >= 0 && end > start, 'Video Hub compact bar is present above the account search');
  const bar = html.slice(start, end);
  const orderedHooks = [
    'videoHubBackBtn', 'brand-mark brand-mark-ai', 'videoHubRamMonitorMount',
    'videoHubSettingsBtn', 'videoHubNotificationsBtn', 'videoHubHideSidebarBtn'
  ];
  let previous = -1;
  for (const hook of orderedHooks) {
    const index = bar.indexOf(hook);
    assert.ok(index > previous, `${hook} appears in Compact Global Bar order`);
    previous = index;
  }
  assert.doesNotMatch(bar, /brand-title|brand-subtitle|Video Hub<\/span>/, 'compact bar does not duplicate the workspace name or tagline');
  assert.match(styles, /body\[data-workspace-app="video-hub"\] \.video-hub-aside > \.brand > #videoHubHideSidebarBtn/);
  assert.match(styles, /body\[data-workspace-app="video-hub"\] \.video-hub-aside > \.brand > \.brand-mark-ai/);
  assert.match(styles, /--rail-btn:36px/);
  assert.match(styles, /body\[data-workspace-app="video-hub"\] \.video-hub-aside > \.brand\{gap:var\(--rail-gap\) !important;align-items:center\}/);
  assert.match(kit, /\.video-hub-aside > \.brand \{[^}]*min-height: 46px[^}]*var\(--rail-gap, 8px\)[^}]*border-radius: 15px/s);
  assert.match(read('docs/design/DESIGN_SYSTEM.md'), /Compact \/ Video Hub/);
});

test('Video Hub Settings uses a React-owned Compact Feature Settings modal with staged Save/Cancel behavior', () => {
  const html = read('src/renderer.html');
  const js = read('src/renderer.js');
  const module = read('src/renderer-react/video-hub-settings.tsx');
  const vite = read('vite.config.ts');
  const pkg = JSON.parse(read('package.json'));
  const styles = stripComments(read('src/styles.css'));
  const docs = read('docs/design/DESIGN_SYSTEM.md');
  assert.match(html, /id="videoHubSettingsReactMount"/);
  assert.doesNotMatch(html, /id="videoHubSettingsOverlay"|id="videoHubSettingConfirm"/);
  assert.match(html, /build\/video-hub-settings-react\.js/);
  assert.match(vite, /'video-hub-settings-react': resolve\(__dirname, 'src\/renderer-react\/video-hub-settings\.tsx'\)/);
  assert.ok(pkg.build.extraResources.some((resource) => resource.filter?.includes('renderer-react/video-hub-settings.tsx')));
  assert.match(module, /className=\{`modal feature-settings-modal video-hub-settings-modal/);
  assert.match(module, /id="videoHubSettingsCancel"/);
  assert.match(module, /id="videoHubSettingsSave"/);
  assert.match(module, /aria-modal="true"/);
  assert.match(module, /emit\(\{ type: 'save', settings: draft \}\)/);
  assert.match(module, /emit\(\{ type: 'security-setting', key, value \}\)/);
  assert.match(js, /function commitVideoHubSettings\(candidate\)[\s\S]*?saveVideoHubSettings\(\)[\s\S]*?closeVideoHubSettings\(\)/);
  assert.match(js, /madstation:video-hub-settings-action/);
  assert.doesNotMatch(js, /videoHubSettingsCancel'\)\?\.addEventListener/);
  assert.doesNotMatch(js, /videoHubSettingsOverlay'\)\?\.addEventListener\('keydown'/);
  assert.match(js, /event\.key === 'Escape'[\s\S]*closeVideoHubSettings\(\)/);
  assert.match(styles, /\.video-hub-settings-modal \{ z-index: 1200; \}/);
  assert.ok(docs.includes('Video Hub Settings surface uses the shared **Compact Feature Settings** modal pattern'));
  assert.ok(docs.includes('backdrop dismissal discards unsaved changes'));
});

test('design system: AI Hub Browser Controller Bar is the default and excludes window controls', () => {
  const docs = read('docs/design/DESIGN_SYSTEM.md');
  for (const phrase of [
    'Browser Controller Bar — Default AI Hub Pattern',
    '[Show/Hide sidebar] [Back] [Forward] [Reload/Stop]',
    '#tbSidebar', '#tbBack', '#tbForward', '#tbReload', '#tbAddress',
    '#tbIcon', '#tbSecure', '#tbHost', '#tbPath', '#tbAccount', '#tbOpen', '#tbProgress',
    '720px and below', 'does not define window-control appearance or sizing',
    'separate Window Controls system'
  ]) assert.ok(docs.includes(phrase), `browser-controller specification includes ${phrase}`);
  assert.match(docs, /Do not include `#tbWindowMinimizeBtn`, `#tbWindowMaximizeBtn`, `#tbWindowCloseBtn`, `\.tb-window-controls`, or `\.window-control` in this Browser Controller Bar specification/);
});

test('Prompt Studio, both AI Playground browsers, and Video Hub use the shared Browser Controller Bar', () => {
  const html = read('src/renderer.html');
  const renderer = read('src/renderer.js');
  const main = read('src/main.js');
  const preload = read('src/preload.ts');
  const standaloneToolbar = read('src/toolbar-react/main.tsx');
  const imageToolbar = read('src/renderer-react/image-hub-workspace-toolbar.tsx');
  const pages = stripComments(read('src/pages.css'));
  const kit = stripComments(read('src/design-kit.css'));

  const forgeStart = html.indexOf('<div class="ms-browser-toolbar forge-browser-toolbar"');
  const forgeEnd = html.indexOf('</div>', html.indexOf('id="forgeOpenExternalBtn"', forgeStart));
  assert.ok(forgeStart >= 0 && forgeEnd > forgeStart, 'Prompt Studio uses the shared controller row');
  const forge = html.slice(forgeStart, forgeEnd);
  for (const hook of ['data-forge-nav="back"', 'data-forge-nav="forward"', 'data-forge-nav="refresh"', 'id="forgeBrowserUrl"', 'id="forgeBrowserAccountLabel"', 'id="forgeOpenExternalBtn"']) {
    assert.ok(forge.includes(hook), `Prompt Studio keeps ${hook}`);
  }

  const arenaReact = read('src/renderer-react/ai-playground-browser-arenas.tsx');
  assert.match(html, /id="freeAccountArenaReactMount"/);
  assert.match(arenaReact, /arena-side-head ms-browser-toolbar arena-browser-toolbar\$\{browserLoading\[side\]\.accountId === account\?\.id && browserLoading\[side\]\.loading \? ' is-loading' : ''\}/, 'both Arena browser toolbars show the shared progress bar while their own account loads');
  assert.match(arenaReact, /aria-busy=\{browserLoading\[side\]\.accountId === account\?\.id && browserLoading\[side\]\.loading\}/, 'Arena browser loading state is also exposed accessibly');
  assert.match(arenaReact, /id=\{side === 'left' \? 'arenaLeft' : 'arenaRight'\}/);
  assert.match(arenaReact, /data-arena-open-external=\{side\}/);
  assert.match(arenaReact, /data-arena-nav=\{`\$\{side\}-\$\{action\}`\}/);
  for (const action of ['back', 'forward', 'refresh']) assert.ok(arenaReact.includes(`'${action}'`), `React browser controller supports ${action}`);

  const videoChrome = read('src/renderer-react/video-hub-workspace-chrome.tsx');
  assert.match(html, /id="videoHubBrowserToolbarReactMount"/);
  assert.match(videoChrome, /className="ms-browser-toolbar video-hub-browser-toolbar"|videoHubBrowserToolbarReactMount/);
  for (const hook of ['data-video-hub-nav={action}', 'id="videoHubActiveSite"', 'id="videoHubActiveLabel"', 'id="videoHubOpenExternalBtn"']) {
    assert.ok(videoChrome.includes(hook), `React-owned Video Hub toolbar keeps ${hook}`);
  }
  for (const action of ['back', 'forward', 'refresh']) assert.ok(videoChrome.includes(`'${action}'`), `Video Hub keeps ${action} navigation`);

  assert.match(kit, /\.ms-browser-toolbar\s*\{[^}]*height:\s*50px[^}]*padding:\s*0 12px/s, 'shared toolbar geometry is documented in the kit');
  assert.match(kit, /\.ms-browser-tool-btn\s*\{[^}]*34px/s, 'shared navigation controls use 34px hit areas');
  assert.match(kit, /\.ms-browser-tool-btn svg, \.ms-browser-open-external svg\s*\{[^}]*18px/s, 'navigation glyphs use 18px icons');
  assert.match(pages, /\.arena-account-address \.ms-browser-account-select|\.ms-browser-account-select/, 'Arena account selection has its own controller-field styling');
  assert.match(standaloneToolbar, /className=\{`tb-progress\$\{state\?\.loading && canBrowse \? ' active' : ''\}`\}/, 'AI Hub browser keeps its native toolbar progress indicator');
  assert.match(standaloneToolbar, /aria-busy=\{Boolean\(state\?\.loading && canBrowse\)\}/, 'AI Hub exposes its browser loading state accessibly');
  assert.match(renderer, /forgeOpenExternalBtn/);
  assert.match(renderer, /toolbar\.classList\.toggle\('is-loading', Boolean\(forgeBrowserState\.loading\)\)[\s\S]*?toolbar\.setAttribute\('aria-busy', String\(Boolean\(forgeBrowserState\.loading\)\)\)/, 'Prompt Studio exposes loading state to the shared progress bar and assistive technology');
  assert.match(imageToolbar, /root\.classList\.toggle\('is-loading', model\.loading\)/, 'Image Hub toggles the shared progress line from webview loading events');
  assert.match(preload, /onVideoHubBrowserLoading: \(callback\) => subscribe\('video-hub-browser-loading', callback\)/);
  assert.match(preload, /onArenaBrowserLoading: \(callback\) => subscribe\('arena-browser-loading', callback\)/);
  assert.match(main, /send\('video-hub-browser-loading', \{ accountId: account\.id, loading: Boolean\(loading\) \}\)/);
  assert.match(main, /send\('arena-browser-loading', \{ side, accountId, loading: Boolean\(loading\) \}\)/);
  assert.match(renderer, /arenaOpenInBrowser/);
  assert.match(preload, /forgeOpenInBrowser/);
  assert.match(preload, /arenaOpenInBrowser/);
  assert.match(main, /handleForWorkspace\('instruction-forge',[^\r\n]+\)\('forge-open-in-browser'/);
  assert.match(main, /handleForWorkspace\('ai-lab',[^\r\n]+\)\('arena-open-in-browser'/);
  for (const phrase of ['Prompt Studio:', 'AI Playground:', 'Video Hub:', '.arena-account-address', '.ms-browser-toolbar.is-loading']) {
    assert.ok(read('docs/design/DESIGN_SYSTEM.md').includes(phrase), `design system documents ${phrase}`);
  }
});

test('design system: AI Hub Provider & Account Sidebar documents reusable list, grid, icon and recent-account patterns', () => {
  const html = read('src/renderer.html');
  const renderer = read('src/renderer.js');
  const styles = stripComments(read('src/styles.css'));
  const requiredDocs = [
    'AI Hub Provider & Account Sidebar System — Canonical Pattern',
    '[Compact Global Bar] → [Search accounts] → [Provider icon grid]',
    '42 × 42px', '28 × 28px', '21 × 21px', '14 × 14px',
    '64px high', '40 × 40px', '26 × 26px',
    '50px', '32 × 32px', '23 × 23px', '22 × 22px',
    '16 × 16px', 'Always show account names',
    '#providerTiles', '#orgAllBtn', '#orgFavoritesBtn', '#orgGroupFilter',
    '#recentAccounts', 'data-recent-id', '#listTitle', '#accounts', '.accounts-end-add',
    'Changing density changes presentation only', 'Window Controls system'
  ];
  for (const phrase of requiredDocs) assert.ok(docs.includes(phrase), `account-sidebar system documents ${phrase}`);
  for (const hook of ['id="search"', 'id="providerTiles"', 'id="orgAllBtn"', 'id="orgFavoritesBtn"', 'id="orgGroupFilter"', 'id="listTitle"', 'id="accounts"']) {
    assert.ok(html.includes(hook), `AI Hub sidebar retains ${hook}`);
  }
  for (const hook of ["recentBox.id = 'recentAccounts'", 'className = \'recent-accounts\'', 'data-recent-id', 'data-provider-filter']) {
    assert.ok(renderer.includes(hook), `AI Hub sidebar behavior retains ${hook}`);
  }
  assert.ok(read('src/renderer-react/account-list.tsx').includes('data-account-id={account.id}'), 'React account cards own account ids');
  assert.match(styles, /#providerTiles \.tile\s*\{[^}]*width:\s*42px[^}]*height:\s*42px/s, 'provider filter buttons are 42px squares');
  assert.match(styles, /#providerTiles \.tile-icon\s*\{[^}]*width:\s*28px[^}]*height:\s*28px/s, 'provider filter icon holders are 28px squares');
  assert.match(styles, /#providerTiles \.tile-icon \.provider-icon-img\s*\{[^}]*width:\s*21px[^}]*height:\s*21px/s, 'provider logos in filters are 21px');
  assert.match(styles, /\.account-btn\s*\{[^}]*height:\s*64px/s, 'comfortable account rows are 64px tall');
  assert.match(styles, /\.account-icon\s*\{[^}]*width:\s*40px[^}]*height:\s*40px/s, 'comfortable account icon holders are 40px');
  assert.match(styles, /body\[data-density="compact"\] \.accounts\s*\{[^}]*display:\s*grid[^}]*minmax\(50px, 1fr\)/s, 'compact density becomes an icon grid');
  assert.match(styles, /body\[data-density="compact"\] \.account-icon\s*\{[^}]*width:\s*32px[^}]*height:\s*32px/s, 'compact account icon holders are 32px');
  assert.match(styles, /\.recent-item \.provider-icon-img\s*\{[^}]*width:\s*16px[^}]*height:\s*16px/s, 'recent account chips use 16px logos');
});

test('design system: Appearance → value mapping lives only in design-tokens.css', () => {
  const attrs = [...Object.values(APPEARANCE_ATTRS), 'density'].join('|');
  const re = new RegExp(`body\\[data-(?:${attrs})="[^"]+"\\][^{}]*\\{[^}]*--(?:ms|h|p)-[a-z0-9-]+\\s*:`);
  for (const file of ['src/home.css', 'src/pages.css', 'src/design-kit.css']) {
    assert.doesNotMatch(stripComments(read(file)), re, `${file} must not re-declare Appearance tokens`);
  }
});

test('design system: the component kit is token-only (no raw colours, url() or @import)', () => {
  const css = stripComments(kit);
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/, 'no hex colours');
  assert.doesNotMatch(css, /\b(?:rgb|rgba|hsl|hsla)\(/, 'no rgb/hsl literals');
  assert.doesNotMatch(css, /url\(|@import/, 'no url() or @import (strict app CSP)');
});

test('design system: every var(--ms-*) is defined, and the old --p-* prefix is gone', () => {
  const files = ['src/design-tokens.css', 'src/design-kit.css', 'src/home.css', 'src/pages.css', 'src/styles.css'];
  const css = files.map((f) => stripComments(read(f))).join('\n');
  const declared = new Set([...css.matchAll(/(--ms-[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
  const used = new Set([...css.matchAll(/var\((--ms-[a-z0-9-]+)/g)].map((m) => m[1]));
  for (const name of used) assert.ok(declared.has(name), `${name} is used but never defined`);
  for (const f of ['src/home.css', 'src/pages.css', 'src/design-kit.css']) {
    assert.doesNotMatch(stripComments(read(f)), /--p-[a-z]/, `${f} no longer uses the retired --p-* tokens`);
  }
});

test('design system: docs/design/DESIGN_SYSTEM.md documents every token and every kit class', () => {
  const tokenNames = new Set([...stripComments(tokens).matchAll(/(--ms-[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
  assert.ok(tokenNames.size >= 20, 'tokens found');
  for (const name of tokenNames) assert.ok(docs.includes(name), `${name} is missing from docs/design/DESIGN_SYSTEM.md`);
  const classes = new Set([...stripComments(kit).matchAll(/\.(ms-[a-z0-9-]+)/g)].map((m) => m[1]));
  assert.ok(classes.size >= 25, 'kit classes found');
  for (const cls of classes) {
    // modifiers such as .ms-brand-tile--sky are documented in the compact form "--sky|mint|…"
    const modifier = cls.match(/^(ms-brand-tile)--([a-z]+)$/);
    const ok = modifier ? docs.includes(modifier[2]) && docs.includes(modifier[1]) : docs.includes(cls);
    assert.ok(ok, `.${cls} is missing from docs/design/DESIGN_SYSTEM.md`);
  }
});

test('design system documents reusable full and compact settings styles', () => {
  const html = read('src/renderer.html');
  const styles = read('src/styles.css');
  const pages = read('src/pages.css');
  const requiredDocs = [
    'Settings UI patterns — Full Global Settings and Compact Feature Settings',
    'A. Full Global Settings — main-menu pattern',
    'B. Compact Feature Settings — Prompt Studio pattern',
    '264px', '76px', '1040px', '680px', '760px', '560px',
    'Save/Cancel semantics', 'role="dialog"', 'aria-modal="true"',
    '#settingsScreen', '#instructionSettingsModal',
    'Choose the right settings style'
  ];
  for (const phrase of requiredDocs) {
    assert.ok(docs.includes(phrase), `settings design system documents ${phrase}`);
  }
  assert.match(html, /id="settingsScreen"/);
  assert.match(html, /id="instructionSettingsModal"/);
  assert.match(styles, /\.settings-screen\s*\{[^}]*grid-template-columns:\s*264px minmax\(0, 1fr\)/s);
  assert.match(styles, /\.feature-settings-modal \.clipboard-settings-card\s*\{[^}]*width:\s*min\(680px, calc\(100% - 32px\)\)/s);
  assert.match(styles, /@media\s*\(max-width:\s*560px\)/);
  assert.match(pages, /\.settings-screen \.st-nav-label/);
});

test('design system: AI rules files point to docs/design/DESIGN_SYSTEM.md', () => {
  for (const f of ['AGENTS.md', 'CLAUDE.md']) {
    const text = read(f);
    assert.match(text, /DESIGN_SYSTEM\.md/, `${f} references the spec`);
    assert.match(text, /never write raw colours/i, `${f} states the no-raw-values rule`);
  }
});

test('design system: lock screen is migrated to kit classes and keeps its ids', () => {
  const html = read('src/renderer.html');
  const start = html.indexOf('id="lockScreen"');
  const block = html.slice(html.lastIndexOf('<div', start), html.indexOf('</form>', start));
  for (const cls of ['ms-screen', 'ms-card', 'ms-input', 'ms-btn--primary']) assert.ok(block.includes(cls), `lock screen uses ${cls}`);
  for (const id of ['lockForm', 'lockPassword', 'lockError', 'lockSubmit', 'forgotPasswordBtn']) assert.ok(block.includes(`id="${id}"`), `lock screen keeps #${id}`);
  const lockCss = stripComments(read('src/styles.css')).match(/\.lock-screen \{[^}]*\}/)[0];
  assert.match(lockCss, /--ms-screen-z: 300/, 'lock screen stays above everything');
});

test('design system: the style guide page loads the real stylesheets', () => {
  const page = read('docs/design-kit-preview.html');
  for (const f of ['design-tokens.css', 'design-kit.css', 'appearance.js']) assert.ok(page.includes(f), `preview loads ${f}`);
});

test('design system: Developer settings is password-gated and only renders theme-management cards', () => {
  const html = read('src/renderer.html');
  const developer = read('src/renderer-react/information-security-panels.tsx');
  assert.match(html, /data-panel="developer" data-settings-scope="global"><div id="developerReactMount"/);
  for (const cls of ['ms-card', 'ms-card--flat', 'ms-card-head', 'ms-btn', 'ms-chip', 'ms-input', 'developer-access-card', 'developer-password-card', 'theme-manage-card', 'theme-design-import-card', 'theme-design-export-card']) {
    assert.ok(developer.includes(cls), `Developer panel uses .${cls}`);
  }
  for (const label of ['Unlock Developer Options', 'Manage Themes', 'Theme ZIP Importer', 'Theme Design Exporter', 'Change password']) {
    assert.ok(developer.includes(label), `Developer theme tools retain ${label}`);
  }
  assert.doesNotMatch(developer, /Restore Default Theme Package|theme-default-package-card|restore-default-theme-package/);
  const visibleDeveloperUi = developer.slice(developer.indexOf('if (!developerTabActive)'), developer.indexOf('const mountConfig'));
  for (const removedUi of ['Project files & commands', 'Project & File Commands Recipes', 'Workspace App Builder', 'Workspace App Builder Recipes', 'Design System Recipes', 'AI prompt recipes', 'Developer Guide Rails', 'design-migration', 'design-page', 'app-builder']) {
    assert.ok(!visibleDeveloperUi.includes(removedUi), `${removedUi} is no longer rendered in Developer Settings`);
  }
  assert.match(developer, /madstation:developer-panel-action/);
  assert.match(developer, /madstation:developer-settings-action/);
  assert.doesNotMatch(html, /data-copy-developer-prompt=/, 'copy prompt controls are not rendered by the HTML shell');
  assert.doesNotMatch(html, /data-developer-location=/, 'resource links are not rendered by the HTML shell');
});

test('Appearance no longer exposes delete/restore menus for theme cards', () => {
  const appearance = read('src/renderer-react/appearance-controls.tsx');
  assert.match(appearance, /data-homepage-style=\{style\.id\}/);
  assert.doesNotMatch(appearance, /homepage-style-options|removeImportedTheme|Delete theme|Restore original theme/);
  assert.match(read('src/renderer-react/information-security-panels.tsx'), /<h3>Manage Themes<\/h3>/);
});

test('Video Hub account sidebar supports persistent list and icon-grid views from Video Hub Settings', () => {
  const html = read('src/renderer.html');
  const js = read('src/renderer.js');
  const view = read('src/renderer-react/video-hub-settings.tsx');
  const kit = stripComments(read('src/design-kit.css'));
  const docs = read('docs/design/DESIGN_SYSTEM.md');
  assert.match(view, /id="videoHubSettingAccountView"[^>]*>[\s\S]*?<option value="grid">Icon grid<\/option>[\s\S]*?<option value="list">List<\/option>/);
  assert.match(html, /id="videoHubAccountList"[^>]*role="list"/);
  assert.match(js, /VIDEO_HUB_DEFAULT_SETTINGS = \{[^}]*accountView: 'grid'/);
  assert.match(js, /accountView: v\.accountView === 'list' \? 'list' : 'grid'/);
  assert.match(js, /accountView: input\.accountView,/ , 'React submits the staged account view to the host');
  assert.match(js, /accountList\.classList\.toggle\('is-list-view', accountView === 'list'\)/);
  assert.match(kit, /\.video-hub-account-list\.is-list-view \{[^}]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(kit, /\.video-hub-account-list\.is-list-view \.video-hub-account-labels \{[^}]*display: grid/);
  assert.match(docs, /Video Hub account sidebar — List \/ Icon grid presentation/);
  assert.match(docs, /madstation\.videoHub\.settings\.v1\.accountView/);
});

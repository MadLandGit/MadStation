const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createBrowserViewLayoutRuntime } = require('../build/main/browser-view-layout-runtime.js');

function fakeView(name, calls) {
  return {
    name,
    webContents: { name: `${name}-contents` },
    setBounds(bounds) { calls.push([name, 'bounds', bounds]); },
    setVisible(visible) { calls.push([name, 'visible', visible]); },
  };
}

function harness(overrides = {}) {
  const calls = [];
  const control = fakeView('control', calls);
  const toolbar = fakeView('toolbar', calls);
  const account = fakeView('account-a', calls);
  const accountOther = fakeView('account-b', calls);
  let state = {
    sidebarWidth: 368, toolbarHeight: 50, sidebarHidden: false, locked: false,
    controlMode: 'app', workspaceApp: 'ai-hub', activeId: 'a',
    contentViews: new Map([['a', account], ['b', accountOther]]),
    forgeContentViews: new Map(), forgeBrowserLayout: { main: null }, forgeBrowserAccountId: null,
    arenaContentViews: new Map(), arenaBrowserModels: { left: null, right: null },
    arenaBrowserLayout: { left: null, right: null },
    videoHubBrowserView: null, videoHubBrowserLayout: { main: null },
    videoHubSettingsOverlayOpen: false, videoHubNotificationOverlayOpen: false,
    imageHubBrowserView: null, imageHubBrowserLayout: { main: null },
  };
  const deps = {
    getWindowContentBounds: () => ({ width: 1280, height: 900 }),
    getControlView: () => control,
    getToolbarView: () => toolbar,
    getState: () => state,
    applyZoom: (contents) => calls.push(['zoom', contents.name]),
    applyArenaBrowserZoom: (contents) => calls.push(['arenaZoom', contents.name]),
    ...overrides,
  };
  return { calls, control, toolbar, account, accountOther, setState: (next) => { state = next; }, runtime: createBrowserViewLayoutRuntime(deps) };
}

function findCall(calls, name, action) { return calls.find((call) => call[0] === name && call[1] === action); }

test('layout sizes the control/toolbar and positions only the active AI Hub view', () => {
  const h = harness();
  h.runtime.positionViews();
  assert.deepEqual(findCall(h.calls, 'control', 'bounds')[2], { x: 0, y: 0, width: 368, height: 900 });
  assert.deepEqual(findCall(h.calls, 'toolbar', 'bounds')[2], { x: 368, y: 0, width: 912, height: 50 });
  assert.deepEqual(findCall(h.calls, 'account-a', 'bounds')[2], { x: 368, y: 50, width: 912, height: 850 });
  assert.deepEqual(findCall(h.calls, 'account-a', 'visible'), ['account-a', 'visible', true]);
  assert.deepEqual(findCall(h.calls, 'account-b', 'visible'), ['account-b', 'visible', false]);
  assert.ok(h.calls.some((call) => call[0] === 'zoom' && call[1] === 'account-a-contents'));
});

test('full-screen UI keeps a real sidebar bounds but hides the toolbar and browser views', () => {
  const h = harness();
  h.setState({
    sidebarWidth: 368, toolbarHeight: 50, sidebarHidden: true, locked: false,
    controlMode: 'settings', workspaceApp: 'ai-hub', activeId: 'a',
    contentViews: new Map([['a', h.account]]), forgeContentViews: new Map(), forgeBrowserLayout: { main: null }, forgeBrowserAccountId: null,
    arenaContentViews: new Map(), arenaBrowserModels: { left: null, right: null }, arenaBrowserLayout: { left: null, right: null },
    videoHubBrowserView: null, videoHubBrowserLayout: { main: null }, videoHubSettingsOverlayOpen: false, videoHubNotificationOverlayOpen: false, imageHubBrowserView: null, imageHubBrowserLayout: { main: null },
  });
  h.runtime.positionViews();
  assert.deepEqual(findCall(h.calls, 'control', 'bounds')[2], { x: 0, y: 0, width: 1280, height: 900 });
  assert.deepEqual(findCall(h.calls, 'control', 'visible'), ['control', 'visible', true]);
  assert.deepEqual(findCall(h.calls, 'toolbar', 'visible'), ['toolbar', 'visible', false]);
  assert.deepEqual(findCall(h.calls, 'account-a', 'visible'), ['account-a', 'visible', false]);
});

test('Forge and Arena use rounded workspace-provided rectangles without sidebar offsets', () => {
  const forge = harness();
  const forgeView = fakeView('forge', forge.calls);
  forge.setState({
    sidebarWidth: 368, toolbarHeight: 50, sidebarHidden: false, locked: false,
    controlMode: 'launcher', workspaceApp: 'instruction-forge', activeId: null,
    contentViews: new Map(), forgeContentViews: new Map([['forge-a', forgeView]]),
    forgeBrowserLayout: { main: { x: 12.4, y: 42.2, width: 100.2, height: 200.4 } }, forgeBrowserAccountId: 'forge-a',
    arenaContentViews: new Map(), arenaBrowserModels: { left: null, right: null }, arenaBrowserLayout: { left: null, right: null },
    videoHubBrowserView: null, videoHubBrowserLayout: { main: null }, videoHubSettingsOverlayOpen: false, videoHubNotificationOverlayOpen: false, imageHubBrowserView: null, imageHubBrowserLayout: { main: null },
  });
  forge.runtime.positionViews();
  assert.deepEqual(findCall(forge.calls, 'forge', 'bounds')[2], { x: 12, y: 42, width: 100, height: 200 });
  assert.deepEqual(findCall(forge.calls, 'forge', 'visible'), ['forge', 'visible', true]);

  const arena = harness();
  const arenaView = fakeView('arena-left', arena.calls);
  arena.setState({
    sidebarWidth: 368, toolbarHeight: 50, sidebarHidden: false, locked: false,
    controlMode: 'launcher', workspaceApp: 'ai-lab', activeId: null,
    contentViews: new Map(), forgeContentViews: new Map(), forgeBrowserLayout: { main: null }, forgeBrowserAccountId: null,
    arenaContentViews: new Map([['arena-a', arenaView]]), arenaBrowserModels: { left: 'arena-a', right: null },
    arenaBrowserLayout: { left: { x: 1.6, y: 20.5, width: 400, height: 600 }, right: null },
    videoHubBrowserView: null, videoHubBrowserLayout: { main: null }, videoHubSettingsOverlayOpen: false, videoHubNotificationOverlayOpen: false, imageHubBrowserView: null, imageHubBrowserLayout: { main: null },
  });
  arena.runtime.positionViews();
  assert.deepEqual(findCall(arena.calls, 'arena-left', 'bounds')[2], { x: 2, y: 21, width: 400, height: 600 });
  assert.ok(arena.calls.some((call) => call[0] === 'arenaZoom' && call[1] === 'arena-left-contents'));
});

test('Video Hub overlay state suppresses its native browser view', () => {
  const h = harness();
  const video = fakeView('video-hub', h.calls);
  h.setState({
    sidebarWidth: 368, toolbarHeight: 50, sidebarHidden: false, locked: false,
    controlMode: 'launcher', workspaceApp: 'video-hub', activeId: null,
    contentViews: new Map(), forgeContentViews: new Map(), forgeBrowserLayout: { main: null }, forgeBrowserAccountId: null,
    arenaContentViews: new Map(), arenaBrowserModels: { left: null, right: null }, arenaBrowserLayout: { left: null, right: null },
    videoHubBrowserView: video, videoHubBrowserLayout: { main: { x: 10, y: 30, width: 500, height: 400 } },
    videoHubSettingsOverlayOpen: true, videoHubNotificationOverlayOpen: false,
  });
  h.runtime.positionViews();
  assert.deepEqual(findCall(h.calls, 'video-hub', 'visible'), ['video-hub', 'visible', false]);
});

test('layout positions the Image Hub native browser only in the visible Image Hub studio', () => {
  const h = harness();
  const image = fakeView('image-hub', h.calls);
  h.setState({
    sidebarWidth: 368, toolbarHeight: 50, sidebarHidden: false, locked: false,
    controlMode: 'launcher', workspaceApp: 'image-hub', activeId: null,
    contentViews: new Map(), forgeContentViews: new Map(), forgeBrowserLayout: { main: null }, forgeBrowserAccountId: null,
    arenaContentViews: new Map(), arenaBrowserModels: { left: null, right: null }, arenaBrowserLayout: { left: null, right: null },
    videoHubBrowserView: null, videoHubBrowserLayout: { main: null }, videoHubSettingsOverlayOpen: false, videoHubNotificationOverlayOpen: false,
    imageHubBrowserView: image, imageHubBrowserLayout: { main: { x: 400, y: 100, width: 600, height: 700 } },
  });
  h.runtime.positionViews();
  assert.deepEqual(findCall(h.calls, 'image-hub', 'bounds')[2], { x: 400, y: 100, width: 600, height: 700 });
  assert.deepEqual(findCall(h.calls, 'image-hub', 'visible'), ['image-hub', 'visible', true]);
  h.calls.length = 0;
  h.setState({
    sidebarWidth: 368, toolbarHeight: 50, sidebarHidden: false, locked: false,
    controlMode: 'launcher', workspaceApp: 'launcher', activeId: null,
    contentViews: new Map(), forgeContentViews: new Map(), forgeBrowserLayout: { main: null }, forgeBrowserAccountId: null,
    arenaContentViews: new Map(), arenaBrowserModels: { left: null, right: null }, arenaBrowserLayout: { left: null, right: null },
    videoHubBrowserView: null, videoHubBrowserLayout: { main: null }, videoHubSettingsOverlayOpen: false, videoHubNotificationOverlayOpen: false,
    imageHubBrowserView: image, imageHubBrowserLayout: { main: { x: 400, y: 100, width: 600, height: 700 } },
  });
  h.runtime.positionViews();
  assert.deepEqual(findCall(h.calls, 'image-hub', 'visible'), ['image-hub', 'visible', false]);
});

test('browser view layout runtime is wired into the main process and production bundle contract', () => {
  const root = path.join(__dirname, '..');
  const main = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.match(main, /require\('\.\.\/build\/main\/browser-view-layout-runtime\.js'\)/);
  assert.match(main, /function positionViews\(\) \{\s*browserViewLayoutRuntime\.positionViews\(\);/);
  assert.match(pkg.scripts['build:main-modules'], /src\/main\/browser-view-layout-runtime\.ts/);
  assert.match(pkg.scripts.test, /tests\/main-browser-view-layout-runtime\.test\.js/);
  assert.match(main, /'src\/main\/browser-view-layout-runtime\.ts'/);
  assert.match(JSON.stringify(pkg.build.extraResources), /main\/browser-view-layout-runtime\.ts/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/home-customizer.js'), 'utf8');

function createRegistry(initial) {
  const items = initial.map((item) => ({ ...item }));
  return {
    register(item) {
      const at = items.findIndex((entry) => entry.id === item.id);
      if (at >= 0) items[at] = { ...items[at], ...item };
      else items.push({ ...item });
      return item;
    },
    unregister(id) {
      const at = items.findIndex((entry) => entry.id === id);
      if (at < 0) return false;
      items.splice(at, 1);
      return true;
    },
    configure(id, patch = {}) {
      const item = items.find((entry) => entry.id === id);
      if (!item) return false;
      Object.assign(item, patch);
      return true;
    },
    list() {
      return items.map((item) => ({ ...item }));
    },
  };
}

function bootCustomizer() {
  const storage = new Map();
  const buttonHandlers = new Map();
  const documentHandlers = new Map();
  const dispatched = [];
  let focusCount = 0;

  const customizeButton = {
    addEventListener: (type, callback) => buttonHandlers.set(type, callback),
    focus: () => { focusCount += 1; },
  };
  const document = {
    readyState: 'loading',
    addEventListener(type, callback) {
      const handlers = documentHandlers.get(type) || [];
      handlers.push(callback);
      documentHandlers.set(type, handlers);
    },
    dispatchEvent(event) { dispatched.push(event); return true; },
    getElementById(id) { return id === 'homeCustomizeBtn' ? customizeButton : null; },
    querySelector(selector) { return selector === '#homeCustomizeBtn' ? customizeButton : null; },
  };
  const companions = createRegistry([
    { id: 'ai-lab', name: 'AI Playground', enabled: true, order: 20, launch: 'ai-lab' },
    { id: 'video-hub', name: 'Video Hub', enabled: true, order: 30, launch: 'video-hub' },
  ]);
  const miniApps = createRegistry([]);
  const widgets = createRegistry([
    { id: 'ram-monitor', title: 'System performance', enabled: true, order: 10, size: 'large' },
    { id: 'performance-mini', title: 'Performance · Mini', enabled: true, order: 20, size: 'small' },
    { id: 'notes-tasks', title: 'Notes & Tasks', enabled: true, order: 15, size: 'medium' },
  ]);
  const window = { MadHomeApps: companions, MadHomeMiniApps: miniApps, MadHomeWidgets: widgets };
  class CustomEventStub {
    constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
  }
  const context = {
    window,
    document,
    localStorage: {
      getItem: (key) => storage.has(key) ? storage.get(key) : null,
      setItem: (key, value) => storage.set(key, String(value)),
    },
    CustomEvent: CustomEventStub,
    setTimeout: () => 1,
    clearTimeout: () => {},
    console,
  };
  vm.runInNewContext(source, context, { filename: 'home-customizer.js' });
  for (const callback of documentHandlers.get('DOMContentLoaded') || []) callback();

  let latestModel = null;
  const bridge = window.MadHomeCustomizer;
  bridge.attachReactRenderer((model) => { latestModel = model; });

  return {
    bridge,
    get model() { return latestModel; },
    clickCustomize() { buttonHandlers.get('click')?.(); },
    get storedPreferences() { return JSON.parse(storage.get('mad-station-home-modules-v1') || '{}'); },
    get focusCount() { return focusCount; },
    companions,
    miniApps,
    widgets,
    dispatched,
  };
}

test('Home customizer controller publishes a serializable model and opens/closes without taking DOM ownership', () => {
  const app = bootCustomizer();
  assert.equal(app.model.isOpen, false);
  assert.deepEqual(Array.from(app.model.sections, (section) => section.kind), ['companions', 'miniApps', 'widgets']);
  assert.equal(app.model.targets.length, 6);
  app.clickCustomize();
  assert.equal(app.model.isOpen, true);
  app.bridge.close();
  assert.equal(app.model.isOpen, false);
  assert.equal(app.focusCount, 1);
  assert.ok(app.dispatched.some((event) => event.type === 'mad:home-customizer-updated'));
});

test('Home customizer persists visibility, order and widget size changes through registry APIs', () => {
  const app = bootCustomizer();
  app.bridge.setEnabled('companions', 'ai-lab', false);
  assert.equal(app.companions.list().find((item) => item.id === 'ai-lab').enabled, false);
  assert.equal(app.storedPreferences.modules.companions['ai-lab'].enabled, false);

  app.bridge.move('companions', 'video-hub', -1);
  const ordered = app.companions.list().sort((a, b) => a.order - b.order).map((item) => item.id);
  assert.deepEqual(ordered, ['video-hub', 'ai-lab']);

  app.bridge.setSize('widgets', 'performance-mini', 'large');
  assert.equal(app.widgets.list().find((item) => item.id === 'performance-mini').size, 'large');
  assert.equal(app.storedPreferences.modules.widgets['performance-mini'].size, 'large');
  assert.equal(app.model.toast, 'Widget size saved');
});

test('Home customizer adds only allowlisted custom shortcuts and removes them from the right registry', () => {
  const app = bootCustomizer();
  assert.equal(app.bridge.addShortcut({ kind: 'companion', name: '  My Prompt  ', target: 'instruction-forge' }), true);
  assert.equal(app.companions.list().some((item) => item.id === 'custom-companion-1' && item.name === 'My Prompt'), true);
  assert.equal(app.bridge.addShortcut({ kind: 'mini', name: 'Bad target', target: 'https://example.com' }), false);
  assert.equal(app.bridge.addShortcut({ kind: 'admin', name: 'Invalid kind', target: 'ai-hub' }), false);
  app.bridge.removeCustom('companions', 'custom-companion-1');
  assert.equal(app.companions.list().some((item) => item.id === 'custom-companion-1'), false);

  app.bridge.addShortcut({ kind: 'mini', name: 'My Hub', target: 'ai-hub' });
  assert.equal(app.miniApps.list().some((item) => item.id === 'custom-mini-1'), true);
  app.bridge.removeCustom('miniApps', 'custom-mini-1');
  assert.equal(app.miniApps.list().some((item) => item.id === 'custom-mini-1'), false);
});

test('Home customizer ignores invalid registry names and restores built-in defaults', () => {
  const app = bootCustomizer();
  app.bridge.setEnabled('companions', 'ai-lab', false);
  app.bridge.move('companions', 'video-hub', -1);
  app.bridge.addShortcut({ kind: 'companion', name: 'Temporary', target: 'ai-hub' });
  app.bridge.setEnabled('toString', 'ai-lab', false);
  app.bridge.move('widgets', 'ram-monitor', 9);
  app.bridge.resetDefaults();

  assert.equal(app.companions.list().some((item) => item.id.startsWith('custom-companion-')), false);
  assert.equal(app.companions.list().find((item) => item.id === 'ai-lab').enabled, true);
  assert.equal(app.widgets.list().find((item) => item.id === 'ram-monitor').size, 'large');
  assert.equal(app.model.toast, 'Default menu restored');
});


test('Home layout drag reorder persists a complete order and rejects cross-category or incomplete requests', () => {
  const app = bootCustomizer();
  assert.equal(app.bridge.reorder('companions', ['video-hub', 'ai-lab']), true);
  assert.deepEqual(
    app.companions.list().sort((a, b) => a.order - b.order).map((item) => item.id),
    ['video-hub', 'ai-lab'],
  );
  assert.deepEqual(
    Object.keys(app.storedPreferences.modules.companions).sort(),
    ['ai-lab', 'video-hub'],
  );
  assert.equal(app.bridge.reorder('companions', ['video-hub']), false, 'cannot lose items during reorder');
  assert.equal(app.bridge.reorder('companions', ['video-hub', 'video-hub']), false, 'cannot duplicate items');
  assert.equal(app.bridge.reorder('companions', ['notes-tasks', 'ai-lab']), false, 'cannot drag an item from another category');
  assert.equal(app.bridge.reorder('widgets', ['performance-mini', 'ram-monitor', 'notes-tasks']), true);
  assert.deepEqual(
    app.widgets.list().sort((a, b) => a.order - b.order).map((item) => item.id),
    ['performance-mini', 'ram-monitor', 'notes-tasks'],
  );
});

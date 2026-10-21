const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/home-widgets.js'), 'utf8');

function boot() {
  const handlers = new Map();
  const events = [];
  const refreshCalls = [];
  const observed = [];
  const classes = new Set();
  const rootElement = {
    classList: {
      toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); },
      contains(name) { return classes.has(name); },
    },
    querySelectorAll() { return []; },
  };
  const document = {
    readyState: 'complete',
    querySelector(selector) { return selector === '#homeWidgets' ? rootElement : null; },
    addEventListener(type, callback) { handlers.set(type, callback); },
    dispatchEvent(event) { events.push(event); return true; },
  };
  const window = {
    MadHomeCore: {
      registerSystem(name, descriptor) { events.push({ type: 'system-registered', name, descriptor }); },
      refresh() { refreshCalls.push('refresh'); },
    },
  };
  class ResizeObserverStub {
    constructor(callback) { this.callback = callback; }
    observe(element) { observed.push(element); }
  }
  class CustomEventStub {
    constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
  }
  vm.runInNewContext(source, {
    window,
    document,
    ResizeObserver: ResizeObserverStub,
    CustomEvent: CustomEventStub,
    console,
    Number,
    String,
    Promise,
    Map,
    Error,
  }, { filename: 'home-widgets.js' });
  let model;
  window.MadHomeWidgets.attachReactRenderer((next) => { model = next; });
  return {
    window,
    rootElement,
    events,
    refreshCalls,
    observed,
    handlers,
    get model() { return model; },
  };
}

function panelStub() {
  return {
    children: [],
    appendChild(node) { this.children.push(node); return node; },
    replaceChildren() { this.children = []; },
  };
}

test('Home widget controller publishes sorted enabled view models without building shell DOM', () => {
  const app = boot();
  app.window.MadHomeWidgets.register({ id: 'late', title: 'Later panel', order: 20, size: 'small', render() {} });
  app.window.MadHomeWidgets.register({ id: 'early', title: 'Earlier panel', order: 10, size: 'large', render() {} });
  app.window.MadHomeWidgets.register({ id: 'disabled', title: 'Hidden panel', enabled: false, order: 15, render() {} });

  assert.deepEqual(Array.from(app.model.widgets, (item) => item.id), ['early', 'late']);
  assert.equal(app.model.widgets[0].size, 'large');
  assert.equal(app.rootElement.classList.contains('is-empty'), false);
  assert.equal(app.rootElement.querySelectorAll().length, 0, 'controller does not render the React-owned shell');
  assert.equal(app.window.MadHomeWidgets.list().length, 3, 'registry list includes disabled items for the customizer');
});

test('Home widget controller keeps enable, order, and size behavior and preserves render callbacks', () => {
  const app = boot();
  let rendered = 0;
  let renderContext;
  app.window.MadHomeWidgets.register({
    id: 'telemetry', title: 'Telemetry', order: 10, size: 'medium',
    render(panel, widget) { rendered += 1; renderContext = widget; panel.appendChild({ textContent: 'live content' }); },
  });
  const panel = panelStub();
  app.window.MadHomeWidgets.mountPanel('telemetry', panel);
  assert.equal(rendered, 1);
  assert.equal(panel.children[0].textContent, 'live content');
  assert.equal(renderContext.id, 'telemetry');

  assert.equal(app.window.MadHomeWidgets.configure('telemetry', { enabled: false }), true);
  assert.equal(app.model.widgets.length, 0);
  assert.equal(app.rootElement.classList.contains('is-empty'), true);
  assert.throws(() => app.window.MadHomeWidgets.mountPanel('telemetry', panel), /unknown or disabled widget/);

  assert.equal(app.window.MadHomeWidgets.configure('telemetry', { enabled: true, size: 'large', order: 1 }), true);
  assert.equal(app.model.widgets[0].size, 'large');
  assert.equal(app.model.widgets[0].order, 1);
  assert.equal(app.window.MadHomeWidgets.unregister('telemetry'), true);
  assert.equal(app.window.MadHomeWidgets.unregister('telemetry'), false);
});

test('Home widget controller validates definitions and clears partial content when a widget renderer throws', () => {
  const app = boot();
  assert.throws(() => app.window.MadHomeWidgets.register({ id: '../bad', title: 'Bad', render() {} }), /invalid id/);
  assert.throws(() => app.window.MadHomeWidgets.register({ id: 'missing-title', render() {} }), /missing title/);
  assert.throws(() => app.window.MadHomeWidgets.register({ id: 'missing-render', title: 'Missing renderer' }), /needs a render/);
  app.window.MadHomeWidgets.register({ id: 'broken', title: 'Broken', render(panel) { panel.appendChild({}); throw new Error('fixture failure'); } });
  const panel = panelStub();
  assert.throws(() => app.window.MadHomeWidgets.mountPanel('broken', panel), /fixture failure/);
  assert.equal(panel.children.length, 0, 'a failed widget does not leave partial DOM behind');
});

test('Default Notes & Tasks widget renders a launch surface and opens the existing Notes workspace', () => {
  const registrySource = fs.readFileSync(path.join(root, 'src/home-widget-list.js'), 'utf8');
  const miniSource = fs.readFileSync(path.join(root, 'src/home-mini-list.js'), 'utf8');
  const definitions = [];
  const launched = [];
  const listeners = new Map();
  const button = {
    attributes: {},
    type: '',
    className: '',
    title: '',
    innerHTML: '',
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(name, callback) { listeners.set(name, callback); },
  };
  const window = {
    MadHomeWidgets: { register(definition) { definitions.push(definition); } },
    MadHomeApps: { launchTarget(target) { launched.push(target); } },
  };
  const document = { createElement(tag) { assert.equal(tag, 'button'); return button; } };

  vm.runInNewContext(registrySource, { window, document }, { filename: 'home-widget-list.js' });
  const notes = definitions.find((item) => item.id === 'notes-tasks');
  assert.ok(notes, 'Notes & Tasks is registered as a widget');
  assert.equal(notes.title, 'Notes & Tasks');
  assert.equal(notes.size, 'medium');
  assert.equal(notes.order, 15);

  const panel = panelStub();
  notes.render(panel);
  assert.equal(panel.children[0], button);
  assert.equal(button.type, 'button');
  assert.equal(button.className, 'home-notes-widget-launch');
  assert.equal(button.attributes['aria-label'], 'Open Notes and Tasks workspace');
  assert.match(button.innerHTML, /Your notes, checklists, and tasks in one workspace/);
  listeners.get('click')();
  assert.deepEqual(launched, ['clipboard']);
  assert.doesNotMatch(miniSource, /id: 'notes-tasks'/, 'the Default homepage no longer registers Notes in its mini-app rail');
});

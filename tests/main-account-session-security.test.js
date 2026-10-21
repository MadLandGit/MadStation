const test = require('node:test');
const assert = require('node:assert/strict');
const { createAccountSessionSecurity } = require('../build/main/account-session-security.js');

function harness(overrides = {}) {
  const calls = [];
  const sessions = [];
  const childWindows = new Set();
  const videoHubChildWindows = new Set();
  const account = {
    id: 'acct-1',
    serviceId: 'chatgpt',
    url: 'https://chatgpt.com/',
    preferences: { permissions: {} },
  };
  const security = {
    spellcheck: true,
    allowFullscreen: true,
    allowNotifications: false,
    allowMicrophone: false,
    allowCamera: false,
    blockHttp: true,
    blockPopups: true,
    restrictNavigation: true,
    allowLoginProviders: false,
  };
  const dependencies = {
    getSecurity: () => security,
    getService: (id) => id === 'chatgpt' ? { authDomains: ['identity.example'] } : null,
    hostMatches: (host, patterns) => patterns.some((pattern) => host === pattern || host.endsWith(`.${pattern}`)),
    loginProviderHosts: ['accounts.google.com', 'login.microsoftonline.com'],
    safeWebPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
    handleWillDownload: (item, id) => calls.push(['download', item, id]),
    openExternal: async (url) => { calls.push(['openExternal', url]); return true; },
    getPlatform: () => 'linux',
    getSessionForAccount: () => browserSession,
    getChildWindows: () => childWindows,
    getVideoHubChildWindows: () => videoHubChildWindows,
    notice: (message) => calls.push(['notice', message]),
    hostOf: (url) => { try { return new URL(url).hostname; } catch { return 'unknown host'; } },
    warn: (message) => calls.push(['warn', message]),
    ...overrides,
  };
  const browserSession = { tag: 'session' };
  const policy = createAccountSessionSecurity(dependencies);
  return { policy, dependencies, calls, sessions, childWindows, videoHubChildWindows, account, security, browserSession };
}

function fakeSession() {
  const state = { checks: null, requests: null, events: new Map(), beforeRequest: null, errors: null, deviceHandler: null, spellcheck: null };
  return {
    state,
    setSpellCheckerEnabled(value) { state.spellcheck = value; },
    setPermissionCheckHandler(fn) { state.checks = fn; },
    setPermissionRequestHandler(fn) { state.requests = fn; },
    on(name, fn) { state.events.set(name, fn); },
    setDevicePermissionHandler(fn) { state.deviceHandler = fn; },
    webRequest: {
      onBeforeRequest(filter, fn) { state.beforeRequest = { filter, fn }; },
      onErrorOccurred(filter, fn) { state.errors = { filter, fn }; },
    },
  };
}

function fakeContents(url = 'https://chatgpt.com/') {
  const state = { handlers: new Map(), openHandler: null, url };
  return {
    state,
    getURL() { return state.url; },
    setWindowOpenHandler(fn) { state.openHandler = fn; },
    on(name, fn) { state.handlers.set(name, fn); },
  };
}

test('account host allowlist includes the configured service, account overrides, and current URL host', () => {
  const h = harness();
  assert.deepEqual(h.policy.allowedHostsForAccount(h.account), ['chatgpt.com', 'openai.com', 'identity.example']);
  const custom = { id: 'custom', serviceId: 'other', url: 'https://studio.example/path', authDomains: ['login.studio.example'] };
  assert.deepEqual(h.policy.allowedHostsForAccount(custom), ['studio.example', 'login.studio.example']);
  assert.deepEqual(h.policy.allowedHostsForAccount({ id: 'broken', serviceId: 'other', url: 'not a url' }), []);
});

test('permission policy restricts origins and individual media types', () => {
  const h = harness();
  assert.equal(h.policy.permissionAllowed('clipboard-sanitized-write', {}, h.account), true);
  assert.equal(h.policy.permissionAllowed('clipboard-read', {}, h.account), false);
  assert.equal(h.policy.permissionAllowed('notifications', {}, h.account), false);
  assert.equal(h.policy.permissionAllowed('fullscreen', {}, h.account), true);
  assert.equal(h.policy.permissionAllowed('media', { mediaTypes: ['audio'] }, h.account), false);
  h.security.allowMicrophone = true;
  assert.equal(h.policy.permissionAllowed('media', { mediaTypes: ['audio'] }, h.account), true);
  assert.equal(h.policy.permissionAllowed('media', { mediaTypes: ['audio', 'video'] }, h.account), false);
  h.account.preferences.permissions = { microphone: false, notifications: true };
  assert.equal(h.policy.permissionAllowed('media', { mediaTypes: ['audio'] }, h.account), false);
  assert.equal(h.policy.permissionAllowed('notifications', {}, h.account), true);
});

test('configured session validates requesting/top/frame origins and installs network/device guards', () => {
  const h = harness();
  const sess = fakeSession();
  h.policy.configureSession(sess, h.account);
  assert.equal(sess.state.spellcheck, true);
  assert.equal(sess.state.deviceHandler(), false);
  assert.deepEqual(sess.state.beforeRequest.filter, { urls: ['http://*/*'] });
  let httpDecision;
  sess.state.beforeRequest.fn({ resourceType: 'mainFrame' }, (decision) => { httpDecision = decision; });
  assert.deepEqual(httpDecision, { cancel: true });
  sess.state.beforeRequest.fn({ resourceType: 'image' }, (decision) => { httpDecision = decision; });
  assert.deepEqual(httpDecision, { cancel: false });
  assert.equal(sess.state.checks(null, 'fullscreen', 'https://chatgpt.com', { requestingUrl: 'https://chatgpt.com' }), true);
  assert.equal(sess.state.checks(null, 'fullscreen', 'https://evil.example', { requestingUrl: 'https://evil.example' }), false);
  assert.equal(sess.state.checks(null, 'fullscreen', 'https://chatgpt.com', { requestingUrl: 'https://chatgpt.com', embeddingOrigin: 'https://evil.example' }), false);
  let allowed = null;
  sess.state.requests({ getURL: () => 'https://chatgpt.com/' }, 'fullscreen', (value) => { allowed = value; }, { requestingUrl: 'https://chatgpt.com' });
  assert.equal(allowed, true);
  sess.state.requests({ getURL: () => 'https://evil.example/' }, 'fullscreen', (value) => { allowed = value; }, { requestingUrl: 'https://chatgpt.com' });
  assert.equal(allowed, false);
  sess.state.requests({ getURL: () => 'https://chatgpt.com/' }, 'fullscreen', (value) => { allowed = value; }, { requestingUrl: 'https://chatgpt.com', embeddingOrigin: 'https://evil.example' });
  assert.equal(allowed, false, 'permission requests reject an untrusted embedding origin');
  sess.state.events.get('will-download')({}, 'download-item');
  assert.deepEqual(h.calls[0], ['download', 'download-item', 'acct-1']);
});

test('URL policy rejects dangerous schemes, embedded credentials and blocked HTTP', () => {
  const h = harness();
  assert.deepEqual(h.policy.evaluateUrl('bad-url', h.account, true), { allow: false, external: false, reason: 'invalid' });
  assert.equal(h.policy.evaluateUrl('javascript:alert(1)', h.account, true).reason, 'scheme');
  assert.equal(h.policy.evaluateUrl('https://user:pass@chatgpt.com', h.account, true).reason, 'credentials');
  assert.equal(h.policy.evaluateUrl('http://chatgpt.com', h.account, true).reason, 'insecure');
  assert.equal(h.policy.evaluateUrl('about:blank', h.account, true).allow, true);
  assert.equal(h.policy.evaluateUrl('about:config', h.account, true).allow, false);
  assert.deepEqual(h.policy.evaluateUrl('https://chatgpt.com', h.account, true), { allow: true, external: false, reason: 'ok' });
  assert.deepEqual(h.policy.evaluateUrl('https://outside.example', h.account, true), { allow: false, external: true, reason: 'off-site' });
  h.security.restrictNavigation = false;
  assert.equal(h.policy.evaluateUrl('https://outside.example', h.account, false).allow, true);
});

test('hardened contents deny unsafe popups, preserve owner session and ignore subframe navigation', async () => {
  const h = harness();
  const contents = fakeContents();
  h.policy.hardenAccountContents(contents, h.account, h.browserSession);
  const allowed = contents.state.openHandler({ url: 'https://chatgpt.com/help' });
  assert.equal(allowed.action, 'allow');
  assert.equal(allowed.overrideBrowserWindowOptions.session, h.browserSession);
  assert.equal(allowed.overrideBrowserWindowOptions.webPreferences.session, h.browserSession);
  assert.equal(allowed.overrideBrowserWindowOptions.webPreferences.nodeIntegration, false);
  const denied = contents.state.openHandler({ url: 'javascript:alert(1)' });
  assert.deepEqual(denied, { action: 'deny' });

  let prevented = false;
  contents.state.handlers.get('will-navigate')({ isMainFrame: false, url: 'https://outside.example', preventDefault() { prevented = true; } });
  assert.equal(prevented, false, 'subframe login/resource navigations are not redirected');
  contents.state.handlers.get('will-redirect')({ isMainFrame: true, url: 'https://outside.example', preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(h.calls.some((entry) => entry[0] === 'openExternal' && entry[1] === 'https://outside.example/'));
});

test('Google auth popups restart at the account entry point and child windows retain partition ownership', async () => {
  const h = harness();
  const contents = fakeContents();
  h.policy.hardenAccountContents(contents, { ...h.account, isVideoHubAccount: true }, h.browserSession);
  assert.deepEqual(contents.state.openHandler({ url: 'https://accounts.google.com/o/oauth2/auth?state=secret' }), { action: 'deny' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(h.calls.some((entry) => entry[0] === 'openExternal' && entry[1] === 'https://chatgpt.com/'));

  let childClosed;
  const childContents = fakeContents();
  const child = { webContents: childContents, on(event, fn) { if (event === 'closed') childClosed = fn; } };
  contents.state.handlers.get('did-create-window')(child);
  assert.equal(h.childWindows.has(child), true);
  assert.equal(h.videoHubChildWindows.has(child), true);
  assert.equal(childContents.state.openHandler({ url: 'https://chatgpt.com/new' }).overrideBrowserWindowOptions.session, h.browserSession);
  childClosed();
  assert.equal(h.childWindows.has(child), false);
  assert.equal(h.videoHubChildWindows.has(child), false);
});

test('external-open helper rejects non-web schemes, credentials, long Windows URLs and shell errors', async () => {
  const h = harness();
  assert.equal(await h.policy.openExternalSafe('file:///tmp/test'), false);
  assert.equal(await h.policy.openExternalSafe('https://user:pass@example.com'), false);
  assert.equal(await h.policy.openExternalSafe('https://example.com'), true);
  let errorPolicy = createAccountSessionSecurity({ ...h.dependencies, openExternal: async () => { throw new Error('shell error'); } });
  assert.equal(await errorPolicy.openExternalSafe('https://example.com'), false);
  const winPolicy = createAccountSessionSecurity({ ...h.dependencies, getPlatform: () => 'win32' });
  assert.equal(await winPolicy.openExternalSafe(`https://example.com/${'x'.repeat(2100)}`), false);
});

test('security module is built, packaged for developer inspection, and composed into main.js', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.join(__dirname, '..');
  const main = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const moduleSource = fs.readFileSync(path.join(root, 'src/main/account-session-security.ts'), 'utf8');
  assert.match(main, /createAccountSessionSecurity\(\{/);
  assert.match(main, /configureSession\(sess, account\) \{ return accountSessionSecurity\.configureSession\(sess, account\); \}/);
  assert.match(pkg.scripts['build:main-modules'], /src\/main\/account-session-security\.ts/);
  assert.ok(pkg.build.extraResources.some((resource) => resource.from === 'src' && resource.filter.includes('main/account-session-security.ts')));
  assert.match(moduleSource, /permissionAllowed/);
  assert.match(moduleSource, /will-redirect/);
});

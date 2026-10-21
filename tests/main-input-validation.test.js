const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isPlainObject,
  cleanText,
  cleanId,
  normalizeHttpsUrl,
  normalizeAuthDomain,
  sanitizeIcon,
  faviconForUrl,
  iconKey,
  hostOf,
  hostMatches,
} = require('../build/main/input-validation.js');

test('main input helpers preserve conservative text and identifier rules', () => {
  assert.equal(cleanText('  safe\u0000 title\n ', 40), 'safe title');
  assert.equal(cleanText('toolong', 4), 'tool');
  assert.equal(cleanId('account_01'), 'account_01');
  assert.equal(cleanId('../account'), '');
  assert.equal(cleanId('a'.repeat(161)), '');
  assert.equal(isPlainObject({ value: 1 }), true);
  assert.equal(isPlainObject(null), false);
  assert.equal(isPlainObject([]), false);
});

test('HTTPS URL validation rejects unsafe protocols, credentials and oversized input', () => {
  assert.equal(normalizeHttpsUrl('https://example.com/path'), 'https://example.com/path');
  assert.equal(normalizeHttpsUrl('http://example.com'), null);
  assert.equal(normalizeHttpsUrl('javascript:alert(1)'), null);
  assert.equal(normalizeHttpsUrl('https://user:secret@example.com'), null);
  assert.equal(normalizeHttpsUrl(`https://example.com/${'a'.repeat(2048)}`), null);
});

test('icon validation accepts supported embedded images and safe HTTPS, but rejects active content', () => {
  assert.equal(sanitizeIcon('https://example.com/icon.png'), 'https://example.com/icon.png');
  assert.equal(sanitizeIcon('data:image/png;base64,AAAA'), 'data:image/png;base64,AAAA');
  assert.equal(sanitizeIcon('data:image/svg+xml;base64,PHN2Zz4='), '');
  assert.equal(sanitizeIcon('data:image/png;base64,AAAA\nalert(1)'), '');
  assert.equal(sanitizeIcon('file:///C:/secret.png'), '');
});

test('icon identity and host helpers normalize expected values', () => {
  assert.equal(faviconForUrl('https://www.example.com/path'), 'https://www.example.com/favicon.ico');
  assert.equal(faviconForUrl('not a URL'), '');
  assert.equal(iconKey('https://www.Example.com/Some_Icon.png'), 'examplecomsomeiconpng');
  assert.equal(hostOf('https://sub.example.com/path'), 'sub.example.com');
  assert.equal(hostOf('invalid'), 'that site');
  assert.equal(hostMatches('login.example.com', ['example.com']), true);
  assert.equal(hostMatches('notexample.com', ['example.com']), false);
});

test('auth-domain validation uses PSL exact, wildcard, exception, and private-host rules', () => {
  assert.equal(normalizeAuthDomain('com'), null);
  assert.equal(normalizeAuthDomain('co.uk'), null);
  assert.equal(normalizeAuthDomain('github.io'), null);
  assert.equal(normalizeAuthDomain('blogspot.com'), null);
  assert.equal(normalizeAuthDomain('foo.ck'), null); // PSL wildcard *.ck
  assert.equal(normalizeAuthDomain('www.ck', { providerUrl: 'https://app.www.ck/' }), 'www.ck'); // PSL exception !www.ck
  assert.equal(normalizeAuthDomain('city.kawasaki.jp'), 'city.kawasaki.jp'); // PSL exception
  assert.equal(normalizeAuthDomain('identity.example.com'), 'identity.example.com');
  assert.equal(normalizeAuthDomain('example.com'), null); // unrelated broad two-label trust root
  assert.equal(normalizeAuthDomain('example.com', { providerUrl: 'https://app.example.com/' }), 'example.com');
  assert.equal(normalizeAuthDomain('minimaxi.com', { providerUrl: 'https://hailuoai.video/', trustedDomains: ['minimaxi.com'] }), 'minimaxi.com');
  assert.equal(normalizeAuthDomain('*.example.com'), null);
  assert.equal(normalizeAuthDomain('host..example.com'), null);
});


test('global UI IPC primitive validators reject coercion and enforce bounds', () => {
  const validation = require('../build/main/input-validation.js');
  assert.equal(validation.isControlMode('app'), true);
  assert.equal(validation.isControlMode('settings'), true);
  assert.equal(validation.isControlMode('dialog'), true);
  assert.equal(validation.isControlMode('launcher'), true);
  for (const invalid of [null, undefined, 1, false, {}, [], 'App', 'window']) {
    assert.equal(validation.isControlMode(invalid), false, `reject invalid mode ${String(invalid)}`);
  }
  assert.equal(validation.isStringWithinLength('', 50000), true);
  assert.equal(validation.isStringWithinLength('hello', 5), true);
  assert.equal(validation.isStringWithinLength('hello!', 5), false);
  assert.equal(validation.isStringWithinLength(123, 5), false);
  assert.equal(validation.isStringWithinLength('x', -1), false);
  assert.equal(validation.isBooleanValue(true), true);
  assert.equal(validation.isBooleanValue(false), true);
  for (const invalid of [0, 1, 'false', null, undefined, {}, []]) {
    assert.equal(validation.isBooleanValue(invalid), false, `reject non-boolean ${String(invalid)}`);
  }
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  isPublicInternetAddress,
  createPublicInternetLookup,
} = require('../build/main/icon-cache.js');

test('icon fetch resolver rejects local, private, link-local, reserved, and documentation IPv4 ranges', () => {
  for (const address of [
    '0.0.0.1', '10.1.2.3', '100.64.0.1', '127.0.0.1', '169.254.1.1',
    '172.16.0.1', '172.31.255.254', '192.0.0.8', '192.0.2.3', '192.168.1.1',
    '192.88.99.1', '198.18.0.1', '198.51.100.20', '203.0.113.2', '224.0.0.1', '240.0.0.1',
  ]) assert.equal(isPublicInternetAddress(address), false, `${address} should not be considered public`);
  for (const address of ['8.8.8.8', '93.184.216.34', '192.0.1.10', '198.51.99.2']) {
    assert.equal(isPublicInternetAddress(address), true, `${address} should be considered public`);
  }
});

test('icon fetch resolver accepts only globally routable IPv6 and excludes special-use ranges', () => {
  for (const address of ['::1', '::', 'fc00::1', 'fe80::1', 'ff02::1', '2001:db8::1', '2001:2::1', '2002::1', '::ffff:127.0.0.1']) {
    assert.equal(isPublicInternetAddress(address), false, `${address} should not be considered public`);
  }
  assert.equal(isPublicInternetAddress('2606:4700:4700::1111'), true);
  assert.equal(isPublicInternetAddress('2001:4860:4860::8888'), true);
});

test('icon fetch resolver pins only safe DNS answers and rejects a hostname with any private answer', async () => {
  let requestOptions;
  const lookup = createPublicInternetLookup((_hostname, options, callback) => {
    requestOptions = options;
    callback(null, [
      { address: '93.184.216.34', family: 4 },
      { address: '10.0.0.9', family: 4 },
    ]);
  });
  const blocked = await new Promise((resolve) => lookup('icons.example.com', {}, (error, address) => resolve({ error, address })));
  assert.equal(blocked.error.code, 'EACCES');
  assert.equal(blocked.address, undefined);
  assert.equal(requestOptions.all, true);
  assert.equal(requestOptions.verbatim, true);
});

test('icon fetch resolver passes a public resolved address back to the HTTPS request without a second lookup', async () => {
  const lookup = createPublicInternetLookup((_hostname, _options, callback) => callback(null, [
    { address: '93.184.216.34', family: 4 },
  ]));
  const result = await new Promise((resolve) => lookup('icons.example.com', { family: 4 }, (error, address, family) => resolve({ error, address, family })));
  assert.equal(result.error, null);
  assert.equal(result.address, '93.184.216.34');
  assert.equal(result.family, 4);
});

test('icon cache passes the guarded DNS lookup into each HTTPS request and rechecks redirected URLs', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src/main/icon-cache.ts'), 'utf8');
  assert.match(source, /lookup: lookupPublicHost/);
  assert.match(source, /return fetchImage\(next, redirects \+ 1\)/);
  assert.match(source, /export \{ createPublicInternetLookup, isPublicInternetAddress \} from '\.\/network-security\.js'/);
});

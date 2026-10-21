const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isPublicInternetAddress,
  resolvePublicInternetAddresses,
  createPinnedPublicLookup,
  createPublicInternetLookup,
} = require('../build/main/network-security.js');

const publicAddresses = [{ address: '93.184.216.34', family: 4 }, { address: '2606:4700:4700::1111', family: 6 }];

test('public internet address policy rejects private, local, special-use and newly documented IPv6 ranges', () => {
  for (const address of [
    '0.0.0.1', '10.0.0.1', '100.64.0.1', '127.0.0.1', '169.254.1.1', '172.20.0.1',
    '192.0.0.8', '192.0.2.1', '192.168.1.1', '198.18.0.1', '198.51.100.1', '203.0.113.1', '224.0.0.1',
    '::1', 'fc00::1', 'fe80::1', 'ff02::1', '2001:db8::1', '2001:2::1', '2002::1', '3fff::1', '::ffff:7f00:1',
  ]) assert.equal(isPublicInternetAddress(address), false, `${address} must be denied`);
  for (const address of ['8.8.8.8', '93.184.216.34', '2606:4700:4700::1111', '2001:4860:4860::8888']) {
    assert.equal(isPublicInternetAddress(address), true, `${address} should remain public`);
  }
});

test('DNS resolver rejects reserved host labels and any mixed public/private answer set', async () => {
  await assert.rejects(resolvePublicInternetAddresses('service.local', async () => publicAddresses), /public internet hosts/i);
  await assert.rejects(resolvePublicInternetAddresses('service.example.com', async () => [publicAddresses[0], { address: '10.0.0.2', family: 4 }]), /private, local, or reserved/i);
  assert.deepEqual(await resolvePublicInternetAddresses('service.example.com', async () => publicAddresses), publicAddresses);
});

test('pinned lookup only returns validated addresses for the original host and requested family', async () => {
  const lookup = createPinnedPublicLookup(publicAddresses, 'provider.example.com');
  const ipv4 = await new Promise((resolve) => lookup('provider.example.com', { family: 4 }, (error, address, family) => resolve({ error, address, family })));
  assert.deepEqual(ipv4, { error: null, address: '93.184.216.34', family: 4 });
  const wrongHost = await new Promise((resolve) => lookup('attacker.example.com', {}, (error, address) => resolve({ error, address })));
  assert.equal(wrongHost.error.code, 'EACCES');
  const wrongFamily = await new Promise((resolve) => lookup('provider.example.com', { family: 2 }, (error, address) => resolve({ error, address })));
  assert.equal(wrongFamily.error.code, 'EACCES');
});

test('legacy icon lookup now shares the stricter public DNS guard', async () => {
  const lookup = createPublicInternetLookup((_hostname, _options, callback) => callback(null, [
    { address: '93.184.216.34', family: 4 }, { address: '192.168.1.1', family: 4 },
  ]));
  const result = await new Promise((resolve) => lookup('icons.example.com', {}, (error, address) => resolve({ error, address })));
  assert.equal(result.error.code, 'EACCES');
});

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeLock,
  normalizePassword,
  createLockSecurityService,
  createPasswordAttemptLimiter,
} = require('../build/main/lock-security.js');

test('lock normalization validates stored salt/hash sizes and pins scrypt work factors', () => {
  const raw = {
    salt: Buffer.alloc(16, 1).toString('base64'),
    hash: Buffer.alloc(64, 2).toString('base64'),
    N: 2,
    r: 1,
    p: 1,
    keylen: 8,
  };
  assert.deepEqual(normalizeLock(raw), { ...raw, N: 32768, r: 8, p: 1, keylen: 64 });
  assert.equal(normalizeLock({ ...raw, salt: 'short' }), null);
  assert.equal(normalizeLock({ ...raw, hash: 'not base64!!' }), null);
  assert.equal(normalizeLock(null), null);
});

test('password normalization preserves old NFC normalization semantics', () => {
  assert.equal(normalizePassword('e\u0301'), 'é');
  assert.equal(normalizePassword(null), '');
  assert.equal(normalizePassword(123), '123');
});

test('app-lock presence check preserves legacy hash/salt semantics and reads current config lazily', () => {
  let persistedLock = null;
  const service = createLockSecurityService({ getLock: () => persistedLock });
  assert.equal(service.hasPassword(), false);
  persistedLock = { hash: 'stored-hash', salt: 'stored-salt' };
  assert.equal(service.hasPassword(), true);
  persistedLock = { hash: '', salt: 'stored-salt' };
  assert.equal(service.hasPassword(), false);
  persistedLock = ['not-a-lock-record'];
  assert.equal(service.hasPassword(), false);
});

test('lock service hashes and verifies passwords using the fixed scrypt settings', async () => {
  let persistedLock = null;
  const service = createLockSecurityService({ getLock: () => persistedLock });
  assert.equal(await service.verifyPassword('secret'), false);
  persistedLock = await service.createLock('secr\u0065t');
  assert.equal(persistedLock.N, 32768);
  assert.equal(persistedLock.r, 8);
  assert.equal(persistedLock.p, 1);
  assert.equal(persistedLock.keylen, 64);
  assert.equal(await service.verifyPassword('secret'), true);
  assert.equal(await service.verifyPassword('wrong'), false);
});

test('password limiter locks after five failed attempts and increases the retry delay', async () => {
  let clock = 1000;
  let checks = 0;
  const limiter = createPasswordAttemptLimiter({
    now: () => clock,
    verifyPassword: async () => { checks += 1; return false; },
  });

  for (let index = 0; index < 5; index += 1) {
    assert.deepEqual(await limiter.check('incorrect'), { ok: false, error: 'Incorrect password.' });
  }
  assert.deepEqual(await limiter.check('incorrect'), { ok: false, error: 'Too many attempts. Try again in 5s.' });
  assert.equal(checks, 5, 'the verifier is not called during lockout');

  clock += 5000;
  assert.deepEqual(await limiter.check('incorrect'), { ok: false, error: 'Incorrect password.' });
  assert.deepEqual(await limiter.check('incorrect'), { ok: false, error: 'Too many attempts. Try again in 10s.' });
});

test('successful verification resets accumulated failures and lockout state', async () => {
  let clock = 0;
  let valid = false;
  const limiter = createPasswordAttemptLimiter({ now: () => clock, verifyPassword: async () => valid });
  for (let index = 0; index < 5; index += 1) await limiter.check('password');
  assert.match((await limiter.check('password')).error, /Too many attempts/);
  clock = 5000;
  valid = true;
  assert.deepEqual(await limiter.check('password'), { ok: true });
  valid = false;
  assert.deepEqual(await limiter.check('password'), { ok: false, error: 'Incorrect password.' });
});

test('manual successful unlock can reset limiter state', async () => {
  let clock = 0;
  const limiter = createPasswordAttemptLimiter({ now: () => clock, verifyPassword: async () => false });
  for (let index = 0; index < 5; index += 1) await limiter.check('password');
  assert.match((await limiter.check('password')).error, /Too many attempts/);
  limiter.reset();
  assert.deepEqual(await limiter.check('password'), { ok: false, error: 'Incorrect password.' });
});

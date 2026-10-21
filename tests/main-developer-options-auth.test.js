'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createDeveloperOptionsAuth } = require('../src/main/developer-options-auth.js');

function makeSandbox(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'madstation-developer-auth-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const passwordFile = path.join(directory, 'developer-options-password.json');
  const auth = createDeveloperOptionsAuth({ getFilePath: () => passwordFile });
  return { auth, passwordFile };
}

test('Developer Options first use accepts the temporary password and stores only a salted hash', async (t) => {
  const { auth, passwordFile } = makeSandbox(t);
  const initial = auth.status();
  assert.equal(initial.ok, true);
  assert.equal(initial.unlocked, false);
  assert.equal(initial.firstUse, true);
  assert.equal(initial.mustChangePassword, true);
  assert.equal(fs.existsSync(passwordFile), false, 'do not persist an initial password until successful first use');

  const wrong = await auth.unlock('not-the-password');
  assert.equal(wrong.ok, false);
  assert.equal(fs.existsSync(passwordFile), false);

  const unlocked = await auth.unlock('12345');
  assert.equal(unlocked.ok, true);
  assert.equal(unlocked.unlocked, true);
  assert.equal(unlocked.mustChangePassword, true);
  const stored = JSON.parse(fs.readFileSync(passwordFile, 'utf8'));
  assert.equal(stored.mustChangePassword, true);
  assert.equal(Object.hasOwn(stored, 'password'), false);
  assert.equal(fs.readFileSync(passwordFile, 'utf8').includes('12345'), false, 'never store the temporary password in plaintext');
});

test('Developer Options password can be changed and remains locked across process sessions', async (t) => {
  const { auth, passwordFile } = makeSandbox(t);
  assert.equal((await auth.unlock('12345')).ok, true);

  const mismatch = await auth.changePassword({ current: '12345', next: 'new-strong-password', confirm: 'different-password' });
  assert.equal(mismatch.ok, false);
  assert.match(mismatch.error, /do not match/i);
  const tooShort = await auth.changePassword({ current: '12345', next: 'short', confirm: 'short' });
  assert.equal(tooShort.ok, false);
  assert.match(tooShort.error, /at least 8 characters/i);

  const changed = await auth.changePassword({ current: '12345', next: 'new-strong-password', confirm: 'new-strong-password' });
  assert.equal(changed.ok, true);
  assert.equal(changed.status.mustChangePassword, false);
  assert.equal(changed.status.unlocked, true);
  assert.equal(JSON.parse(fs.readFileSync(passwordFile, 'utf8')).mustChangePassword, false);

  auth.lock();
  assert.equal(auth.isUnlocked(), false);
  const restartedSession = createDeveloperOptionsAuth({ getFilePath: () => passwordFile });
  assert.equal(restartedSession.status().unlocked, false);
  assert.equal(restartedSession.status().mustChangePassword, false);
  assert.equal((await restartedSession.unlock('12345')).ok, false);
  assert.equal((await restartedSession.unlock('new-strong-password')).unlocked, true);
});

test('Developer Options protected commands can check session state without exposing passwords', (t) => {
  const { auth } = makeSandbox(t);
  assert.equal(auth.isUnlocked(), false);
  const status = auth.status();
  assert.equal(status.unlocked, false);
  assert.equal(status.firstUse, true);
  assert.equal(Object.hasOwn(status, 'password'), false);
});

test('Developer Options can stay unlocked for the current app session without persisting that choice', async (t) => {
  const { auth, passwordFile } = makeSandbox(t);
  assert.equal(auth.setKeepUnlockedForSession(true).ok, false, 'setting is gated while locked');
  assert.equal((await auth.unlock('12345')).unlocked, true);
  const preference = auth.setKeepUnlockedForSession(true);
  assert.equal(preference.ok, true);
  assert.equal(preference.keepUnlockedForSession, true);
  assert.equal(auth.closeSection().unlocked, true, 'leaving the Developer Settings pane keeps access during this session');
  assert.equal(auth.status().unlocked, true);
  auth.lock();
  assert.equal(auth.status().unlocked, false, 'manual lock always locks immediately');
  assert.equal(auth.status().keepUnlockedForSession, false, 'manual lock disables the session preference');
  const nextProcess = createDeveloperOptionsAuth({ getFilePath: () => passwordFile });
  assert.equal(nextProcess.status().unlocked, false, 'session-unlock choice is never persisted across restarts');
  assert.equal(nextProcess.status().keepUnlockedForSession, false);
});

test('Developer Options close-section still locks when the session preference is disabled', async (t) => {
  const { auth } = makeSandbox(t);
  assert.equal((await auth.unlock('12345')).unlocked, true);
  const status = auth.closeSection();
  assert.equal(status.unlocked, false);
  assert.equal(status.keepUnlockedForSession, false);
});

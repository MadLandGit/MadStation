'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_PASSWORD = '12345';
const SCRYPT = Object.freeze({ N: 32768, r: 8, p: 1, keylen: 64 });
const MAX_PASSWORD_LENGTH = 256;
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

function normalizePassword(value) {
  return typeof value === 'string' ? value.normalize('NFC') : '';
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeStoredRecord(value) {
  if (!isRecord(value) || value.version !== 1 || typeof value.salt !== 'string' || typeof value.hash !== 'string' || typeof value.mustChangePassword !== 'boolean') return null;
  if (!BASE64_RE.test(value.salt) || !BASE64_RE.test(value.hash)) return null;
  const salt = Buffer.from(value.salt, 'base64');
  const hash = Buffer.from(value.hash, 'base64');
  if (salt.length !== 16 || hash.length !== SCRYPT.keylen) return null;
  return { version: 1, salt: value.salt, hash: value.hash, mustChangePassword: value.mustChangePassword };
}

function scryptAsync(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, SCRYPT.keylen, {
      N: SCRYPT.N,
      r: SCRYPT.r,
      p: SCRYPT.p,
      maxmem: 128 * 1024 * 1024,
    }, (error, result) => error ? reject(error) : resolve(result));
  });
}

/**
 * Password gate for the Developer Settings surface.
 * The starter password is written as a salted scrypt hash only when the user
 * first tries to unlock it. The unlocked flag exists only in this main-process
 * instance and is never persisted across app restarts.
 */
function createDeveloperOptionsAuth(dependencies = {}) {
  const getFilePath = dependencies.getFilePath;
  const fileSystem = dependencies.fs || fs;
  const now = typeof dependencies.now === 'function' ? dependencies.now : Date.now;
  const initialPassword = normalizePassword(dependencies.initialPassword || DEFAULT_PASSWORD);
  let record = null;
  let loadAttempted = false;
  let unlocked = false;
  // This preference exists only in memory; it is never persisted across app restarts.
  let keepUnlockedForSession = false;
  let failedAttempts = 0;
  let lockoutUntil = 0;

  function filePath() {
    if (typeof getFilePath !== 'function') throw new Error('Developer password storage is unavailable.');
    const value = getFilePath();
    if (typeof value !== 'string' || !value) throw new Error('Developer password storage is unavailable.');
    return value;
  }

  function saveRecord(next) {
    const destination = filePath();
    const directory = path.dirname(destination);
    fileSystem.mkdirSync(directory, { recursive: true });
    const temporary = `${destination}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
    try {
      fileSystem.writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      fileSystem.renameSync(temporary, destination);
    } catch (error) {
      try { fileSystem.rmSync(temporary, { force: true }); } catch { /* preserve original error */ }
      throw error;
    }
    record = next;
    loadAttempted = true;
  }

  function readRecord() {
    if (loadAttempted) return record;
    try {
      const raw = JSON.parse(fileSystem.readFileSync(filePath(), 'utf8'));
      const normalized = normalizeStoredRecord(raw);
      if (!normalized) throw new Error('Developer password data is invalid. Restore or remove developer-options-password.json to use the initial password again.');
      record = normalized;
      loadAttempted = true;
      return record;
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        record = null;
        loadAttempted = false;
        return null;
      }
      loadAttempted = false;
      if (error instanceof SyntaxError) throw new Error('Developer password data is invalid. Restore or remove developer-options-password.json to use the initial password again.');
      throw error;
    }
  }

  async function createRecord(password, mustChangePassword) {
    const salt = crypto.randomBytes(16);
    const hash = await scryptAsync(password, salt);
    return { version: 1, salt: salt.toString('base64'), hash: hash.toString('base64'), mustChangePassword };
  }

  async function verify(password) {
    const stored = readRecord();
    if (!stored) return false;
    const salt = Buffer.from(stored.salt, 'base64');
    const expected = Buffer.from(stored.hash, 'base64');
    const actual = await scryptAsync(normalizePassword(password), salt);
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  }

  function checkRateLimit() {
    const remaining = lockoutUntil - now();
    if (remaining > 0) return { ok: false, error: `Too many attempts. Try again in ${Math.ceil(remaining / 1000)} seconds.` };
    return null;
  }

  function recordFailedAttempt() {
    failedAttempts += 1;
    if (failedAttempts >= 5) lockoutUntil = now() + Math.min(300000, 5000 * (2 ** (failedAttempts - 5)));
  }

  function clearFailedAttempts() {
    failedAttempts = 0;
    lockoutUntil = 0;
  }

  function status() {
    const current = readRecord();
    const limited = checkRateLimit();
    return {
      ok: true,
      unlocked,
      keepUnlockedForSession,
      mustChangePassword: current ? current.mustChangePassword : true,
      firstUse: !current,
      ...(limited ? { lockoutMessage: limited.error } : {}),
    };
  }

  async function unlock(password) {
    const limited = checkRateLimit();
    if (limited) return limited;
    const supplied = normalizePassword(password);
    if (!supplied || supplied.length > MAX_PASSWORD_LENGTH) return { ok: false, error: 'Enter a valid Developer Options password.' };
    try {
      let current = readRecord();
      if (!current) {
        if (supplied !== initialPassword) {
          recordFailedAttempt();
          return { ok: false, error: 'Incorrect password. On first use, enter the temporary starter password configured for this installation.' };
        }
        current = await createRecord(initialPassword, true);
        saveRecord(current);
      }
      const accepted = await verify(supplied);
      if (!accepted) {
        recordFailedAttempt();
        return { ok: false, error: 'Incorrect password.' };
      }
      clearFailedAttempts();
      unlocked = true;
      return status();
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Could not unlock Developer Options.' };
    }
  }

  function setKeepUnlockedForSession(enabled) {
    if (!unlocked) return { ok: false, error: 'Unlock Developer Options before changing this session preference.' };
    if (typeof enabled !== 'boolean') return { ok: false, error: 'Choose whether to keep Developer Options unlocked for this session.' };
    keepUnlockedForSession = enabled;
    return status();
  }

  function closeSection() {
    if (!keepUnlockedForSession) unlocked = false;
    return status();
  }

  function lock() {
    unlocked = false;
    keepUnlockedForSession = false;
    return status();
  }

  async function changePassword(payload) {
    if (!unlocked) return { ok: false, error: 'Unlock Developer Options before changing its password.' };
    if (!isRecord(payload)) return { ok: false, error: 'Enter the current password and a new password.' };
    const currentPassword = normalizePassword(payload.current);
    const nextPassword = normalizePassword(payload.next);
    const confirmPassword = normalizePassword(payload.confirm);
    if (nextPassword.length < 8) return { ok: false, error: 'Use at least 8 characters for the new password.' };
    if (nextPassword.length > MAX_PASSWORD_LENGTH) return { ok: false, error: 'The new password is too long (maximum 256 characters).' };
    if (nextPassword !== confirmPassword) return { ok: false, error: 'The new password and confirmation do not match.' };
    if (nextPassword === currentPassword) return { ok: false, error: 'Choose a new password that differs from the current password.' };
    const limited = checkRateLimit();
    if (limited) return limited;
    try {
      if (!(await verify(currentPassword))) {
        recordFailedAttempt();
        return { ok: false, error: 'The current password is incorrect.' };
      }
      clearFailedAttempts();
      const nextRecord = await createRecord(nextPassword, false);
      saveRecord(nextRecord);
      unlocked = true;
      return { ok: true, status: status() };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Could not change the Developer Options password.' };
    }
  }

  return { status, unlock, lock, closeSection, setKeepUnlockedForSession, changePassword, isUnlocked: () => unlocked };
}

module.exports = { createDeveloperOptionsAuth, normalizeStoredRecord };

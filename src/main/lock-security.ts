/** App-lock password storage and brute-force throttling, isolated from Electron lifecycle code. */
import * as crypto from 'node:crypto';
import { isPlainObject } from './input-validation.js';

export interface ScryptLockRecord {
  salt: string;
  hash: string;
  N: number;
  r: number;
  p: number;
  keylen: number;
}

export type PasswordCheckResult =
  | { ok: true }
  | { ok: false; error: string };

export interface LockSecurityDependencies {
  getLock(): unknown;
}

export interface PasswordAttemptLimiterDependencies {
  verifyPassword(password: unknown): Promise<boolean>;
  now?: () => number;
}

const SCRYPT_PARAMS = Object.freeze({ N: 32768, r: 8, p: 1, keylen: 64 });
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

export function normalizePassword(value: unknown): string {
  return String(value ?? '').normalize('NFC');
}

export function normalizeLock(raw: unknown): ScryptLockRecord | null {
  if (!isPlainObject(raw) || typeof raw.hash !== 'string' || typeof raw.salt !== 'string') return null;
  if (!BASE64_PATTERN.test(raw.salt) || !BASE64_PATTERN.test(raw.hash)) return null;
  try {
    const salt = Buffer.from(raw.salt, 'base64');
    const hash = Buffer.from(raw.hash, 'base64');
    if (salt.length !== 16 || hash.length !== 64) return null;
  } catch {
    return null;
  }
  // Never trust editable config fields to select arbitrary-cost scrypt work.
  return { salt: raw.salt, hash: raw.hash, ...SCRYPT_PARAMS };
}

function scryptAsync(password: string, salt: Buffer, params: typeof SCRYPT_PARAMS): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      password,
      salt,
      params.keylen,
      { N: params.N, r: params.r, p: params.p, maxmem: 128 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
}

export function createLockSecurityService(dependencies: LockSecurityDependencies) {
  /** Match the legacy app-lock presence check; config migration validates the stored record. */
  function hasPassword(): boolean {
    const raw = dependencies.getLock();
    return isPlainObject(raw) && Boolean(raw.hash && raw.salt);
  }

  async function createLock(password: unknown): Promise<ScryptLockRecord> {
    const salt = crypto.randomBytes(16);
    const key = await scryptAsync(normalizePassword(password), salt, SCRYPT_PARAMS);
    return { salt: salt.toString('base64'), hash: key.toString('base64'), ...SCRYPT_PARAMS };
  }

  async function verifyPassword(password: unknown): Promise<boolean> {
    const lock = normalizeLock(dependencies.getLock());
    if (!lock) return false;
    // Use fixed parameters from this module, not the persisted parameter fields.
    const expected = Buffer.from(lock.hash, 'base64');
    const actual = await scryptAsync(normalizePassword(password), Buffer.from(lock.salt, 'base64'), SCRYPT_PARAMS);
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  }

  return { normalizeLock, normalizePassword, hasPassword, createLock, verifyPassword };
}

/** Five free attempts, then exponentially increasing delays capped at five minutes. */
export function createPasswordAttemptLimiter(dependencies: PasswordAttemptLimiterDependencies) {
  const now = dependencies.now || Date.now;
  let failedAttempts = 0;
  let lockoutUntil = 0;

  async function check(password: unknown): Promise<PasswordCheckResult> {
    if (now() < lockoutUntil) {
      const seconds = Math.ceil((lockoutUntil - now()) / 1000);
      return { ok: false, error: `Too many attempts. Try again in ${seconds}s.` };
    }

    const ok = await dependencies.verifyPassword(password);
    if (!ok) {
      failedAttempts += 1;
      if (failedAttempts >= 5) {
        lockoutUntil = now() + Math.min(300000, 5000 * 2 ** (failedAttempts - 5));
      }
      return { ok: false, error: 'Incorrect password.' };
    }

    failedAttempts = 0;
    lockoutUntil = 0;
    return { ok: true };
  }

  function reset(): void {
    failedAttempts = 0;
    lockoutUntil = 0;
  }

  return { check, reset };
}

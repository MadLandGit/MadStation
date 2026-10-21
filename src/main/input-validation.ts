/** Shared, typed input-normalization helpers for trusted main-process workflows.
 * These helpers are not IPC authorization: handlers must still enforce sender,
 * lock, ownership, allowed-domain and operation-specific rules.
 */

import { isPublicSuffix } from './public-suffix-list.js';

export type PlainRecord = Record<string, unknown>;


export const CONTROL_MODES = ['app', 'settings', 'dialog', 'launcher'] as const;
export type ControlMode = typeof CONTROL_MODES[number];

/** Validate renderer-controlled mode selectors without coercing unknown values. */
export function isControlMode(value: unknown): value is ControlMode {
  return typeof value === 'string' && (CONTROL_MODES as readonly string[]).includes(value);
}

/** Check a primitive string's bound before passing it to a native operation. */
export function isStringWithinLength(value: unknown, maxLength: number): value is string {
  return Number.isSafeInteger(maxLength) && maxLength >= 0 && typeof value === 'string' && value.length <= maxLength;
}

/** Validate booleans at IPC boundaries rather than applying truthiness conversion. */
export function isBooleanValue(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

/** Matches the existing app's accepted JSON-like object convention. */
export function isPlainObject(value: unknown): value is PlainRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function cleanText(value: unknown, max = 60): string {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
}

export function cleanId(value: unknown, max = 160): string {
  const id = String(value ?? '').trim();
  return /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id) && id.length <= max ? id : '';
}

export interface AuthDomainOptions {
  /** Provider entry URL. Its own host and parents are legitimate provider roots. */
  providerUrl?: unknown;
  /** Small, source-controlled extra roots for a built-in provider. */
  trustedDomains?: readonly string[];
}

/**
 * Normalize an auth host before it can broaden an account's navigation,
 * popup, redirect, or permission allowlist. Public suffixes (including PSL
 * PRIVATE rules such as github.io) are never accepted as trust roots.
 * For custom cross-provider auth roots, require a concrete subdomain such as
 * accounts.google.com instead of a broad two-label parent. The provider's own
 * registered root remains usable when it is its URL host or an actual parent
 * of that host.
 */
export function normalizeAuthDomain(value: unknown, options: AuthDomainOptions = {}): string | null {
  if (typeof value !== 'string') return null;
  const domain = value.trim().toLowerCase().replace(/\.$/, '');
  if (!domain || domain.length > 253 || domain.includes('*') || domain.includes('..')) return null;
  const labels = domain.split('.');
  if (labels.length < 2 || labels.some((label) => !label || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) return null;
  if (isPublicSuffix(domain)) return null;

  const trusted = new Set((options.trustedDomains || []).map((entry) => String(entry).trim().toLowerCase().replace(/\.$/, '')));
  if (trusted.has(domain)) return domain;

  let providerHost = '';
  try { providerHost = new URL(String(options.providerUrl || '')).hostname.toLowerCase(); } catch { /* no provider URL context */ }
  const ownProviderRoot = Boolean(providerHost && (providerHost === domain || providerHost.endsWith(`.${domain}`)));
  if (labels.length < 3 && !ownProviderRoot) return null;
  return domain;
}

/** Accept HTTPS URLs only; reject credentials and malformed/overlong inputs. */
export function normalizeHttpsUrl(value: unknown): string | null {
  try {
    const raw = String(value || '').trim();
    if (!raw || raw.length > 2048) return null;
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:') return null;
    if (parsed.username || parsed.password || !parsed.hostname) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

/** Icons are HTTPS image URLs or tightly bounded embedded raster images. */
export function sanitizeIcon(value: unknown): string {
  const icon = String(value || '').trim();
  if (!icon) return '';
  if (/^data:image\//i.test(icon)) {
    const validImageData = /^data:image\/(png|jpeg|webp|x-icon|vnd\.microsoft\.icon|gif);base64,[A-Za-z0-9+/=]+$/i.test(icon);
    return validImageData && icon.length <= 720000 ? icon : '';
  }
  return normalizeHttpsUrl(icon) || '';
}

export function faviconForUrl(value: unknown): string {
  try {
    return `${new URL(String(value)).origin}/favicon.ico`;
  } catch {
    return '';
  }
}

export function iconKey(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .replace(/https?:\/\//g, '')
    .replace(/^www\./, '')
    .replace(/[^a-z0-9]+/g, '');
}

export function hostOf(value: unknown): string {
  try {
    return new URL(String(value)).hostname;
  } catch {
    return 'that site';
  }
}

export function hostMatches(hostname: unknown, allowedHosts: readonly string[]): boolean {
  const host = String(hostname || '').toLowerCase();
  return allowedHosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

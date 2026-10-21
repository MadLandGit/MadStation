/** Public-network-only DNS and HTTPS transport helpers for main-process probes.
 * User-triggered provider verification and update-feed checks must not become
 * an SSRF proxy into loopback, RFC1918, link-local, reserved, or private LANs.
 * DNS answers are validated as a set and pinned into the subsequent request to
 * prevent the request from performing a second, potentially rebinding lookup.
 */
import * as dns from 'node:dns';
import * as https from 'node:https';
import type { ClientRequest } from 'node:http';
import * as net from 'node:net';

export interface ResolvedPublicAddress {
  address: string;
  family: number;
}

export interface DnsLookupOptions {
  all?: boolean;
  family?: number;
  hints?: number;
}

type LookupCallback = (...args: any[]) => void;
type LookupAll = (
  hostname: string,
  options: { all: true; family: number; hints: number; verbatim: true },
  callback: (error: NodeJS.ErrnoException | null, addresses: ResolvedPublicAddress[]) => void,
) => unknown;

function ipv4Octets(address: string): number[] | null {
  if (net.isIP(address) !== 4) return null;
  const octets = address.split('.').map(Number);
  return octets.length === 4 && octets.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) ? octets : null;
}

/**
 * Conservative global-unicast check. This is intentionally stricter than
 * "not RFC1918": special-purpose, documentation, multicast, transition and
 * reserved ranges are not accepted as destinations for main-process probes.
 */
export function isPublicInternetAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) {
    const octets = ipv4Octets(address);
    if (!octets) return false;
    const [a, b, c] = octets;
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && ((b === 0 && (c === 0 || c === 2)) || b === 168)) return false;
    if (a === 192 && b === 88 && c === 99) return false;
    if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return false;
    if (a === 203 && b === 0 && c === 113) return false;
    if (a === 192 && b === 31 && c === 196) return false;
    if (a === 192 && b === 52 && c === 193) return false;
    if (a === 192 && b === 175 && c === 48) return false;
    if (a === 255 && b === 255 && c === 255) return false;
    if (a === 240) return false;
    return true;
  }
  if (family !== 6 || address.includes('.')) return false;
  const value = address.toLowerCase().split('%')[0];
  const halves = value.split('::');
  if (halves.length > 2) return false;
  const left = halves[0] ? halves[0].split(':').filter(Boolean) : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':').filter(Boolean) : [];
  const zeroCount = 8 - left.length - right.length;
  if (zeroCount < 0 || (halves.length === 1 && zeroCount !== 0)) return false;
  const groups = [...left, ...Array(zeroCount).fill('0'), ...right].map((part) => Number.parseInt(part, 16));
  if (groups.length !== 8 || groups.some((part) => !Number.isInteger(part) || part < 0 || part > 0xffff)) return false;
  const first = groups[0];
  const second = groups[1];
  // Only global-unicast 2000::/3. Exclude 6to4 and special-use/documentation ranges.
  if (first < 0x2000 || first > 0x3fff || first === 0x2002 || first === 0x3fff) return false;
  if (first === 0x2001 && (second <= 0x01ff || second === 0x0db8)) return false;
  return true;
}

function normalizeDnsHostname(hostname: string): string {
  return String(hostname || '').trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
}

function isReservedHostname(hostname: string): boolean {
  const value = normalizeDnsHostname(hostname);
  if (!value || value.length > 253) return true;
  if (net.isIP(value)) return false;
  if (!value.includes('.')) return true;
  if (value === 'localhost' || /\.(localhost|local|internal|test|invalid|example|onion)$/.test(value)) return true;
  return false;
}

export async function resolvePublicInternetAddresses(
  hostname: string,
  lookup: (host: string, options: { all: true; verbatim: true }) => Promise<ResolvedPublicAddress[]> = dns.promises.lookup as unknown as (host: string, options: { all: true; verbatim: true }) => Promise<ResolvedPublicAddress[]>,
): Promise<ResolvedPublicAddress[]> {
  const normalized = normalizeDnsHostname(hostname);
  if (isReservedHostname(normalized)) throw new Error('Only public internet hosts can be checked.');
  const answers = await lookup(normalized, { all: true, verbatim: true });
  if (!Array.isArray(answers) || answers.length === 0 || answers.some((item) => !item || !isPublicInternetAddress(item.address))) {
    throw new Error('The host resolves to a private, local, or reserved network address.');
  }
  return [...new Map(answers.map((item) => [`${item.family}:${item.address}`, { address: item.address, family: item.family }])).values()];
}

/** A lookup function pinned to previously approved answers for one host. */
export function createPinnedPublicLookup(addresses: readonly ResolvedPublicAddress[], expectedHostname?: string) {
  const safe = addresses.filter((entry) => entry && isPublicInternetAddress(entry.address));
  const expected = expectedHostname ? normalizeDnsHostname(expectedHostname) : '';
  return (hostname: string, rawOptions: unknown, callback: LookupCallback): void => {
    const requested = normalizeDnsHostname(hostname);
    if (!safe.length || safe.length !== addresses.length || (expected && requested !== expected)) {
      const denied = new Error('The HTTPS request attempted to use an unapproved destination.') as NodeJS.ErrnoException;
      denied.code = 'EACCES';
      callback(denied);
      return;
    }
    const options: DnsLookupOptions = typeof rawOptions === 'number'
      ? { family: rawOptions, all: false }
      : rawOptions && typeof rawOptions === 'object' ? rawOptions as DnsLookupOptions : {};
    const selected = options.family ? safe.filter((entry) => entry.family === options.family) : [...safe];
    if (!selected.length) {
      const denied = new Error('No approved address exists for the requested address family.') as NodeJS.ErrnoException;
      denied.code = 'EACCES';
      callback(denied);
      return;
    }
    if (options.all) callback(null, selected);
    else callback(null, selected[0].address, selected[0].family);
  };
}

export function createPublicInternetLookup(resolve: LookupAll = dns.lookup as unknown as LookupAll) {
  return function guardedLookup(hostname: string, rawOptions: unknown, callback: LookupCallback): void {
    const options: DnsLookupOptions = typeof rawOptions === 'number'
      ? { family: rawOptions, all: false }
      : rawOptions && typeof rawOptions === 'object' ? rawOptions as DnsLookupOptions : {};
    const normalized = normalizeDnsHostname(hostname);
    if (isReservedHostname(normalized)) {
      const denied = new Error('Only public internet hosts can be fetched.') as NodeJS.ErrnoException;
      denied.code = 'EACCES';
      callback(denied);
      return;
    }
    resolve(normalized, {
      all: true,
      family: options.family || 0,
      hints: options.hints || 0,
      verbatim: true,
    }, (error, addresses) => {
      if (error) { callback(error); return; }
      if (!addresses.length || addresses.some((entry) => !isPublicInternetAddress(entry.address))) {
        const denied = new Error('Host resolved to a non-public network address.') as NodeJS.ErrnoException;
        denied.code = 'EACCES';
        callback(denied);
        return;
      }
      if (options.all) callback(null, addresses);
      else callback(null, addresses[0].address, addresses[0].family);
    });
  };
}

/** Create a Node HTTPS request that uses only the approved resolved addresses. */
export function createPinnedHttpsRequest(
  url: string,
  addresses: readonly ResolvedPublicAddress[],
  method: 'HEAD' | 'GET',
): ClientRequest {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !parsed.hostname) throw new Error('Only valid HTTPS URLs can be requested.');
  const lookup = createPinnedPublicLookup(addresses, parsed.hostname);
  return https.request(parsed, {
    method,
    timeout: 10_000,
    headers: { Accept: method === 'GET' ? 'application/json' : '*/*', 'User-Agent': 'Mad-Station/1.6.3 SecurityCheck' },
    lookup: lookup as typeof dns.lookup,
  });
}

export async function fetchPinnedHttpsJson(
  url: string,
  addresses: readonly ResolvedPublicAddress[],
  maxBytes = 2 * 1024 * 1024,
): Promise<{ ok: boolean; status: number; json(): Promise<unknown> }> {
  return await new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => { if (settled) return; settled = true; fn(); };
    let request: ClientRequest;
    try { request = createPinnedHttpsRequest(url, addresses, 'GET'); }
    catch (error) { reject(error); return; }
    request.on('response', (response) => {
      const status = response.statusCode || 0;
      if (status >= 300 && status < 400) {
        response.resume();
        finish(() => resolve({ ok: false, status, async json() { throw new Error('Redirect responses are not accepted.'); } }));
        return;
      }
      const declaredSize = Number(response.headers['content-length'] || 0);
      if (declaredSize > maxBytes) {
        response.resume();
        request.destroy(new Error('Release feed exceeds the size limit.'));
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxBytes) request.destroy(new Error('Release feed exceeds the size limit.'));
        else chunks.push(chunk);
      });
      response.on('end', () => {
        if (size > maxBytes) return;
        finish(() => resolve({
          ok: status >= 200 && status < 300,
          status,
          async json() { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown; },
        }));
      });
      response.on('error', (error) => finish(() => reject(error)));
    });
    request.on('timeout', () => request.destroy(new Error('Release feed timed out.')));
    request.on('error', (error) => finish(() => reject(error)));
    request.end();
  });
}

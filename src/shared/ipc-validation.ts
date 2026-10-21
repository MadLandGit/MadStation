/** Generic structural guard for untrusted renderer → main IPC arguments.
 * Channel-specific handlers must still validate IDs, URLs, enums, authorization,
 * ownership, and business rules. This is deliberately a bounded plain-data check.
 */
export interface IpcPayloadLimits {
  maxNodes?: number;
  maxDepth?: number;
  maxStringLength?: number;
}

const MAX_STRING_LENGTH = 2_000_000;
const MAX_ARRAY_LENGTH = 10_000;
const MAX_OBJECT_KEYS = 2_000;
const MAX_NODES = 50_000;
const MAX_DEPTH = 16;
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

/** Returns whether a value is a bounded, plain-data payload safe to pass over IPC. */
export function isSafeIpcPayload(value: unknown, limits: IpcPayloadLimits = {}): boolean {
  const maxNodes = limits.maxNodes ?? MAX_NODES;
  const maxDepth = limits.maxDepth ?? MAX_DEPTH;
  const maxStringLength = limits.maxStringLength ?? MAX_STRING_LENGTH;
  const seen = new WeakSet<object>();
  let nodes = 0;

  function visit(item: unknown, depth: number): boolean {
    nodes += 1;
    if (nodes > maxNodes || depth > maxDepth) return false;
    if (item === null || item === undefined || typeof item === 'boolean') return true;
    if (typeof item === 'string') return item.length <= maxStringLength;
    if (typeof item === 'number') return Number.isFinite(item);
    if (typeof item !== 'object') return false;
    if (seen.has(item)) return false;
    seen.add(item);

    try {
      if (Array.isArray(item)) {
        if (item.length > MAX_ARRAY_LENGTH) return false;
        return item.every((entry: unknown) => visit(entry, depth + 1));
      }

      const prototype = Object.getPrototypeOf(item);
      if (prototype !== Object.prototype && prototype !== null) return false;
      const entries = Object.entries(item as Record<string, unknown>);
      if (entries.length > MAX_OBJECT_KEYS) return false;
      return entries.every(([key, entry]) => !FORBIDDEN_KEYS.has(key)
        && key.length <= 256
        && visit(entry, depth + 1));
    } finally {
      seen.delete(item);
    }
  }

  try {
    return visit(value, 0);
  } catch {
    // Proxies/getters and unusual objects are not accepted as plain IPC DTOs.
    return false;
  }
}

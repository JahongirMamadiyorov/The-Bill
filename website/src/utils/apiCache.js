/**
 * Lightweight module-level TTL cache for API responses.
 *
 * Data lives in memory for the lifetime of the browser tab.
 * Each entry stores the payload and the timestamp it was written.
 * Reads still within the TTL window are returned instantly;
 * anything older (or absent) falls through to the supplied fetcher.
 *
 * Usage:
 *   import { withCache, invalidate, invalidateAll } from '../../utils/apiCache';
 *
 *   // Fetch (or return cached):
 *   const items = await withCache('menu:items', 15 * 60 * 1000, () => menuAPI.getItems());
 *
 *   // Bust after a mutation so other pages get fresh data next mount:
 *   invalidateAll('menu:');      // bust every key starting with "menu:"
 *   invalidate('tables:all');    // bust one specific key
 */

const _store = new Map(); // key → { data, ts }

/**
 * Return cached data for `key` if still within `ttlMs`, otherwise call
 * `fetcher`, store the result, and return it.
 *
 * @param {string}   key    - Unique cache key
 * @param {number}   ttlMs  - Time-to-live in milliseconds
 * @param {Function} fetcher - Async function that returns fresh data
 */
export async function withCache(key, ttlMs, fetcher) {
  const now   = Date.now();
  const entry = _store.get(key);
  if (entry && now - entry.ts < ttlMs) return entry.data;
  const data = await fetcher();
  _store.set(key, { data, ts: now });
  return data;
}

/** Force-expire one key (e.g. after a targeted mutation). */
export function invalidate(key) {
  _store.delete(key);
}

/** Force-expire all keys that start with `prefix` (e.g. 'menu:'). */
export function invalidateAll(prefix) {
  for (const key of _store.keys()) {
    if (key.startsWith(prefix)) _store.delete(key);
  }
}

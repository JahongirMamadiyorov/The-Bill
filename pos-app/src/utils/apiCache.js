// Verbatim port of website/src/utils/apiCache.js — a lightweight, in-memory
// TTL cache some Admin pages use to avoid redundant GET calls between
// mounts/screens (e.g. tablesAPI.getAll cached for a few seconds so jumping
// Tables -> Orders -> Tables doesn't refetch instantly). Logic untouched.
const _store = new Map(); // key -> { data, ts }

export async function withCache(key, ttlMs, fetcher) {
  const now = Date.now();
  const entry = _store.get(key);
  if (entry && now - entry.ts < ttlMs) return entry.data;
  const data = await fetcher();
  _store.set(key, { data, ts: now });
  return data;
}

export function invalidate(key) {
  _store.delete(key);
}

export function invalidateAll(prefix) {
  for (const key of _store.keys()) {
    if (key.startsWith(prefix)) _store.delete(key);
  }
}

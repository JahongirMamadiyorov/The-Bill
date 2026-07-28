// ─────────────────────────────────────────────────────────────────────────────
// Small localStorage-backed cache for screens that read live from the backend
// via apiGet (History, Receivables) rather than local PowerSync data. If a
// refresh fails (backend unreachable), these screens show the last-known data
// with a visible "how stale is this" badge instead of going blank or just
// showing a toast that's easy to miss.
//
// NOT for Menu/Orders/Tables — those already have their own always-fresh,
// offline-capable local PowerSync data and don't need this at all.
// ─────────────────────────────────────────────────────────────────────────────

import { t, tt } from './i18n.js';

export function loadCached(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.savedAt !== 'number') return null;
    return parsed; // { data, savedAt }
  } catch { return null; }
}

export function saveCached(key, data) {
  try { localStorage.setItem(key, JSON.stringify({ data, savedAt: Date.now() })); } catch {}
}

// `lang` ('UZ'/'EN') is optional — omitted, this returns the English form.
export function timeAgo(ms, lang) {
  if (!ms) return '';
  const mins = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (mins < 1) return t('just now', lang);
  if (mins < 60) return tt(lang, '{m}m ago', '{m} daq. oldin', { m: mins });
  const h = Math.floor(mins / 60);
  return tt(lang, '{h}h {m}m ago', '{h}s {m}daq. oldin', { h, m: mins % 60 });
}

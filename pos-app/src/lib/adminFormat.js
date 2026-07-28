// Shared formatting helpers for the Admin panel — ported verbatim from
// website/src/hooks/useApi.js's `money`/`fmtDate`/`fmtDateTime`/`todayStr`
// exports (logic untouched, just pulled into their own file since pos-app's
// Admin screens import them directly rather than through a `useApi()` hook).
// Every Admin screen ported from the website should import from here instead
// of re-deriving its own copy.

export const money = (v) => {
  const n = Math.round(Number(v) || 0);
  const neg = n < 0;
  const s = Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return (neg ? '-' : '') + s + " so'm";
};

export const fmtDate = (d) => {
  if (!d) return '';
  const dt = typeof d === 'string' ? new Date(d) : d;
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// Same as fmtDate but with the clock time appended — display only.
export const fmtDateTime = (d) => {
  if (!d) return '';
  const dt = typeof d === 'string' ? new Date(d) : d;
  const hh = String(dt.getHours()).padStart(2, '0');
  const mi = String(dt.getMinutes()).padStart(2, '0');
  return `${fmtDate(dt)}  ${hh}:${mi}`;
};

export const todayStr = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

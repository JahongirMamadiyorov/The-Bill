import { useState, useCallback } from 'react';

export function useApi() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const call = useCallback(async (apiFn, ...args) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFn(...args);
      return res;
    } catch (err) {
      const msg = err?.error || err?.message || 'Unknown error';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, call, setError };
}

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

// Same as fmtDate but with the clock time appended — for display only (logs,
// stock movement timelines, etc). fmtDate stays date-only because it's also
// used for date-range string comparisons (e.g. `fmtDate(x) < range.from`)
// where adding a time component would break the comparison.
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

export const periodParams = (from, to) => ({ start: from, end: to });

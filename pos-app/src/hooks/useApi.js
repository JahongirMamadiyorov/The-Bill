// Verbatim port of website/src/hooks/useApi.js — the `useApi()` loading/error
// wrapper hook that most Admin pages call as `const { call } = useApi();` to
// wrap every API call (`call(tablesAPI.getAll)`, `call(tablesAPI.update, id,
// payload)`, etc.) with shared loading/error state, plus the `money`/`fmtDate`/
// `fmtDateTime`/`todayStr` formatters. Logic untouched — same file shape as
// the website so ported pages' `import { useApi, money } from '../../hooks/
// useApi'`-style imports need only a relative-path adjustment, not a rewrite.
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

// Re-exported from lib/adminFormat.js so screens can import everything from
// this one module, exactly like they do on the website — see that file for
// the actual implementations (kept there since a couple of non-useApi
// screens/utils also need them without pulling in the useApi hook).
export { money, fmtDate, fmtDateTime, todayStr } from '../lib/adminFormat.js';

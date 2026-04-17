import { useEffect, useRef, useCallback } from 'react';

/**
 * usePolling — runs `fetchFn` immediately on mount, then every `intervalMs`.
 * Background ticks are "silent" (no loading spinner) so the UI doesn't flicker.
 * Cleans up the interval on unmount.
 *
 * @param {Function} fetchFn   - stable callback (wrap in useCallback)
 * @param {number}   intervalMs - polling interval in ms (default 1000)
 */
export function usePolling(fetchFn, intervalMs = 1000) {
  const timerRef = useRef(null);

  const start = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(fetchFn, intervalMs);
  }, [fetchFn, intervalMs]);

  useEffect(() => {
    fetchFn();          // immediate first load
    start();            // then start ticker
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchFn, start]);
}

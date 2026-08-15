// ─────────────────────────────────────────────────────────────────────────────
// useSyncGate — one place that answers "can I trust what the local database is
// telling me right now?"
//
// WHY THIS EXISTS (2026-08-15)
// Every POS screen reads its rows straight out of local SQLite:
//     psGetAll(`SELECT * FROM orders WHERE status IN (...)`)
// and renders the result with total confidence. Until now `hasSynced` was read
// in exactly ONE place in the whole renderer — the topbar badge — so no screen
// had any idea whether those rows were current.
//
// That is fine while the terminal is running. It is NOT fine at startup. A POS
// that was switched off overnight still holds yesterday's snapshot in SQLite,
// and PowerSync needs time to catch up (this restaurant has ~26k order_items).
// During that window the Orders screen showed a complete, confident, WRONG list:
// missing every order the waiters had taken on their phones while it was off,
// and still listing orders that had since been paid and closed. No spinner, no
// warning. Reported from the field as "the POS gave a wrong order list".
//
// ── The distinction this hook draws ─────────────────────────────────────────
// "Not connected" and "never synced" are completely different situations and
// must not be treated the same way:
//
//   hasSynced === false  → the local copy has NEVER been reconciled this
//                          session. Anything in it may be arbitrarily stale.
//                          Screens should show a syncing state, NOT the rows.
//
//   hasSynced === true,  → the local copy WAS current as of lastSyncedAt and is
//   connected === false    now running offline. This is normal, supported,
//                          local-first operation — Uzbek restaurants lose their
//                          connection routinely and the cashier must keep
//                          working. Show the data, just say it's offline.
//
// Blocking the screen in the second case would break offline service, which is
// the entire point of the local-first design. Only the first case gates.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';

// Matches PosShell's badge poll so the screen body and the topbar can never
// disagree about the connection state, which would look like a bug to staff.
const POLL_MS = 5000;

export default function useSyncGate() {
  const [state, setState] = useState({
    connected: false,
    hasSynced: false,
    lastSyncedAt: null,
    // `checked` guards the very first paint: before the first psStatus() call
    // returns we know nothing, and defaulting to "not synced" would flash a
    // syncing screen on every navigation for a terminal that is perfectly fine.
    checked: false,
  });

  useEffect(() => {
    let alive = true;

    const check = async () => {
      try {
        const s = await window.electronAPI.psStatus();
        if (!alive) return;
        setState({
          connected:    !!s?.connected,
          hasSynced:    !!s?.hasSynced,
          lastSyncedAt: s?.lastSyncedAt || null,
          checked:      true,
        });
      } catch {
        // An IPC failure tells us nothing about the sync state, so DON'T claim
        // "not synced" — that would gate a working screen. Mark it checked and
        // leave the last known values in place.
        if (!alive) return;
        setState((prev) => ({ ...prev, checked: true }));
      }
    };

    check();
    const timer = setInterval(check, POLL_MS);
    return () => { alive = false; clearInterval(timer); };
  }, []);

  return {
    ...state,
    // Show the syncing state instead of the rows. Deliberately requires
    // `checked` so a terminal never flashes this during its own first paint.
    gated:   state.checked && !state.hasSynced,
    // Data is trustworthy but the link is down — banner, not a block.
    offline: state.checked && state.hasSynced && !state.connected,
  };
}

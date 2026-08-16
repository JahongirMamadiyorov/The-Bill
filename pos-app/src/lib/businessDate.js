// ─────────────────────────────────────────────────────────────────────────────
// businessDate — the calendar date as the RESTAURANT sees it.
//
// WHY THIS EXISTS (2026-08-17)
// Both HistoryScreen and ProfileScreen carried their own copy of:
//
//     function isoDate(d) { return d.toISOString().slice(0, 10); }
//
// `toISOString()` converts to UTC first. Uzbekistan is UTC+5, so between local
// midnight and 05:00 the UTC date is still YESTERDAY, and every one of those
// screens asked the backend for the wrong day.
//
// This is not theoretical. Order #1 at The Bill Premium was taken at 02:46 on
// 2026-08-17 Tashkent time — 21:46 on 2026-08-16 in UTC. Paid, 153,000 so'm,
// sitting safely in the database. The cashier opened History, the screen sent
// `from=2026-08-16&to=2026-08-16`, and the order vanished: "No orders in this
// range", today's sales 0. The owner reported it as a LOST ORDER.
//
// The backend resolves these date parameters in Asia/Tashkent (see
// backend/src/config/db.js — the session timezone was set there in August after
// the same class of bug mis-attributed 62 orders' revenue). So the server was
// right and the client was wrong; they simply disagreed for the five hours after
// midnight. For a restaurant that serves until 2-3am, that is every late order,
// every night.
//
// Using the LOCAL date components is correct precisely because the terminal's
// clock is set to the restaurant's own timezone — the same clock the staff read
// off the wall, and the same day the backend will resolve the query in.
//
// NOTE ON "BUSINESS DAY": this returns the CALENDAR day. Some restaurants treat
// a night that runs past midnight as still belonging to the previous day, so a
// 02:00 sale would count under the day before. That is a policy decision, not a
// bug, and it is NOT implemented here — if it is ever wanted it belongs in this
// one function (subtract the cutoff hour before reading the date), so every
// screen changes together.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Local calendar date as `YYYY-MM-DD`.
 * Never use `toISOString().slice(0, 10)` for this — that is the UTC date.
 */
export function isoDate(d = new Date()) {
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return '';
  const y  = date.getFullYear();
  const m  = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** Today, local. */
export const todayIso = () => isoDate(new Date());

/** `n` days before today, local. Handles month/year rollover via the Date API. */
export function daysAgoIso(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDate(d);
}

// ─────────────────────────────────────────────────────────────────────────────
// Working hours → which BUSINESS DAY a moment belongs to
//
// A restaurant's day does not necessarily end at midnight. Open 18:00 and close
// 03:00 and the sales taken at 02:00 are part of THAT NIGHT's takings, not the
// new calendar date's — ask any owner counting the till at the end of a shift.
// Splitting one service across two dates is what made today's sales read 0
// while a paid order sat in the database.
//
// Schedule shape (restaurant_settings.working_hours):
//   { "mon": { "closed": false, "open": "09:00", "close": "00:00" }, ... }
//
// close "00:00" ends the day exactly at midnight — which is also how a 24-hour
// restaurant is set up (open 00:00, close 00:00) and is the behaviour of every
// screen before this feature existed. An EMPTY schedule means the same thing, so
// a restaurant that never fills this in sees no change whatsoever.
// ─────────────────────────────────────────────────────────────────────────────

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']; // Date#getDay() order

/** "HH:MM" → minutes since midnight. Returns null if malformed. */
function toMinutes(hhmm) {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(hhmm || ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** The schedule entry for the weekday `d` falls on, or null. */
function entryFor(schedule, d) {
  if (!schedule || typeof schedule !== 'object') return null;
  return schedule[DAY_KEYS[d.getDay()]] || null;
}

/**
 * Does this day's service run past midnight?
 * Only when a close time is set, is not "00:00" (which means "ends at
 * midnight"), and lands at or before the opening time.
 */
function crossesMidnight(entry) {
  if (!entry || entry.closed) return false;
  const open = toMinutes(entry.open), close = toMinutes(entry.close);
  if (open === null || close === null) return false;
  if (close === 0) return false;          // 00:00 = ends at midnight, never extends
  return close <= open;
}

/**
 * The business day (YYYY-MM-DD) that `date` belongs to, given the schedule.
 *
 * The only case that shifts the answer: `date` falls in the small hours AND the
 * PREVIOUS day's service was still running — then it belongs to the previous
 * day. Everything else is the plain calendar date, so with no schedule, an
 * empty schedule, or 00:00 closes this is identical to isoDate().
 */
export function businessDayFor(date, schedule) {
  const d = date instanceof Date ? new Date(date) : new Date(date);
  if (Number.isNaN(d.getTime())) return '';

  const prev = new Date(d);
  prev.setDate(prev.getDate() - 1);
  const prevEntry = entryFor(schedule, prev);
  if (!crossesMidnight(prevEntry)) return isoDate(d);

  const nowMin = d.getHours() * 60 + d.getMinutes();
  // Strictly BEFORE the close: a sale exactly at closing time belongs to the
  // night that is ending, so `<` would be wrong here... except that a till is
  // closed AT that minute, so treat the boundary minute as still the old day.
  if (nowMin <= toMinutes(prevEntry.close)) return isoDate(prev);
  return isoDate(d);
}

/** Today's business day. */
export const businessToday = (schedule) => businessDayFor(new Date(), schedule);

/**
 * Is the restaurant open right now?
 * Returns { open: boolean, known: boolean } — `known` is false when there is no
 * usable schedule, so callers can stay silent rather than claim "closed" about a
 * restaurant that simply never configured its hours.
 */
export function isOpenNow(schedule, now = new Date()) {
  if (!schedule || typeof schedule !== 'object' || Object.keys(schedule).length === 0) {
    return { open: true, known: false };
  }
  const nowMin = now.getHours() * 60 + now.getMinutes();

  // Still inside YESTERDAY's late-running service?
  const prev = new Date(now);
  prev.setDate(prev.getDate() - 1);
  const prevEntry = entryFor(schedule, prev);
  if (crossesMidnight(prevEntry) && nowMin <= toMinutes(prevEntry.close)) {
    return { open: true, known: true };
  }

  const entry = entryFor(schedule, now);
  if (!entry) return { open: true, known: false };
  if (entry.closed) return { open: false, known: true };

  const open = toMinutes(entry.open), close = toMinutes(entry.close);
  if (open === null || close === null) return { open: true, known: false };

  // 24h (open == close, e.g. 00:00/00:00) counts as always open.
  if (open === close) return { open: true, known: true };
  if (crossesMidnight(entry)) return { open: nowMin >= open, known: true };
  return { open: nowMin >= open && nowMin < close, known: true };
}

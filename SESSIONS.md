# SESSIONS

Chronological log — one entry per session, newest at the bottom. Each entry should say what was
actually done, not just discussed, and note anything left half-finished.

---

## 2026-07-06

**Render backend recovery.** Original Render backend was fully suspended (free-tier 750
instance-hour cap exceeded, likely from the WS keep-alive ping in `server.js` preventing the
15-min idle spin-down). Diagnosed the cause, set up a new Render web service on a new account
(free tier, kept intentionally). Hit and fixed a Root Directory misconfiguration (the
`the-bill-backend` GitHub repo's root is already the backend code, not nested under
`restaurant-app/backend`). Live at `https://the-bill-backend-pego.onrender.com` (plain
`the-bill-backend` name was unavailable — old suspended service still holds it).

**URL migration.** Updated every hardcoded reference to the old backend URL across website,
RestaurantApp, electron-app, and print-agent (10 files total). Website env var was also
overridden by a stale value directly in Vercel's dashboard Environment Variables (separate
from the repo's `.env.production`) — found and fixed that too, then confirmed via the actual
deployed JS bundle that the new URL was baked in correctly.

**CORS bug.** Login was failing after the migration — traced to `CORS_ORIGIN` on Render having
a trailing slash that didn't exact-match the browser's Origin header. Fixed, confirmed login
works on the live site.

**Electron/print-agent notes.** Confirmed `electron-updater` in the current `electron-app` is
genuinely wired up (checks for updates on launch, auto-downloads, installs on quit) — publishing
a new release to GitHub on `the-bill-backend`... (repo: `jahongirmamadiyorov/the-bill-website`,
per `package.json` `publish` config) would auto-update existing installs, no manual reinstall
needed per machine.

**New Windows POS app — planning only, no code written.** Long planning conversation covering:
researched Tauri vs Electron and PowerSync/ElectricSQL for offline-first sync (2026 data);
researched how 1C, R-Keeper, and iiko are actually architected as reference points; agreed on
Electron + PowerSync + local-first printing as the direction; agreed on scope (Admin, Owner,
Cashier, Kitchen, plus a new touch-first Waitress mode for monoblocks); discovered `new_cashier`
(`NewCashierPOS.jsx`) already exists as a usable head start, and that `new_waiter` exists only
as a role option in `AdminStaff.jsx` with no page/backend behind it yet; designed the PIN-based
quick account-switch flow for shared monoblock terminals (separate 6-digit PIN, not the phone
password). **User said "not yet" to starting the PIN/username implementation** — this is
planned but explicitly not started.

**This session also created the AI knowledge-base structure** (RULES.md, MEMORY.md, STATUS.md,
this file) per the user's request, with the process rule that any AI must read all four before
starting work, and must write back to SESSIONS/STATUS/MEMORY after finishing.

**Phase 0 scaffolding (started, not finished).** Created `pos-app/` — new standalone
Electron+Vite+React app. Built: frameless/no-menu main window, single-instance lock,
electron-store session storage, preload context bridge, a working Login screen wired to the
real `POST /api/auth/login` on the live backend (called from the main process, not the
renderer — same trust boundary as the existing print-agent), and placeholder role-routed
screens for admin/owner, cashier, `new_cashier` (`/pos`), kitchen, and `new_waiter` (`/waiter`).

Backend: added `GET /api/auth/powersync-token` (mints a short-lived HS256 JWT for PowerSync's
custom-auth flow), documented the three new env vars needed in `.env.example`.

Supabase: created `powersync_role` (replication) and a `powersync` publication scoped to
the tables needed by Cashier/Waitress/Kitchen first (see STATUS.md for the full list).

**Could not verify by running it** — `npm install` for an Electron project doesn't complete
within this sandbox's 45-second per-command limit (Electron's binary download is too large),
and background processes don't survive between tool calls in this sandbox, so multi-call
polling isn't possible either. The code was written carefully and reviewed by re-reading, but
is genuinely untested. **Next session/user action: run `npm install` in `pos-app/` on a real
machine and report back what happens** — do not assume it works without that confirmation.

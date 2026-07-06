# MEMORY

Long-term facts and context worth knowing before working on this project. Unlike SESSIONS.md
(a chronological log) and STATUS.md (current snapshot), this file holds things that stay true
across many future sessions. Update it when something here goes stale.

## Product context

- The Bill is a restaurant management system: website (React/Vite on Vercel), a phone app
  (React Native, Waitress role), a Windows kitchen print-agent (Electron), and — in planning —
  a new standalone Windows POS app (Electron) covering Admin, Owner, Cashier, Kitchen, and a
  touch-first Waitress mode for shared monoblock terminals.
- Original pitch vs. iiko (the main competitor product referenced throughout planning): a
  waitress can take orders from her phone with no POS terminal needed — see
  `iiko_program_overview_chat.docx` in the project root for the full original feature-by-role
  breakdown (Owner/Admin/Waitress + accounting module). That doc is the source of truth for
  the intended full feature set — read it before assuming a feature doesn't exist yet.
- Researched how 1C, R-Keeper, and iiko are actually built (2026): all three use some version of
  "local machine/network handles real-time operations, cloud handles reporting/multi-location
  sync" — this directly informed the PowerSync + local-first printing decision. iiko specifically
  uses RabbitMQ + ASP.NET and has a "Front" mode where a kiosk talks to hardware without going
  through a central server first.

## Key decisions and why

- Electron over Tauri for the new POS app: Tauri is lighter (30-50MB vs 200-300MB idle RAM,
  smaller installer) and would be fine since we're Windows-only, but Electron was chosen because
  the team already has working Electron code (the print-agent) and the project already has a lot
  of new ground to cover (offline sync, touch UI, PIN auth) — one less unknown.
- PowerSync over ElectricSQL/DIY caching: PowerSync is the more production-stable option evaluated
  in 2026 for a Postgres-backed app wanting offline-first without inventing sync/conflict logic
  from scratch. Free Cloud tier (2GB/month, 50 connections) should comfortably cover one
  restaurant; self-hosted Open Edition is the $0-forever fallback if needed later.
- Printing latency root cause: the "WebSocket is too slow" complaint traced back to the print
  signal routing through Render (cloud round-trip) instead of staying on the restaurant's local
  network. The fix is architectural (local-first trigger), not just "pick a faster library."
- `new_cashier` role/`NewCashierPOS.jsx` already exists and is a genuine head start for the new
  app's Cashier screen — full-screen, touch-built, already wired to a `/pos` route. Reuse it
  rather than redesigning from scratch.
- `new_waiter` role already exists as a role-picker option in `AdminStaff.jsx` (added by the
  project owner) but has no route/page/backend support yet — it needs to be built from scratch,
  including the PIN-based quick-switch login flow.

## Supabase / infra facts (see also RULES.md §2-3)

- Supabase project: "The-Bill", ref `uubfvjcwrumfijjqtjjb`, region ap-northeast-1, Postgres 17.
- There is a second, unrelated Supabase project "Mount Everest" in the same org — do not confuse
  the two when running Supabase MCP tool calls; always double check project_id.
- Supabase advisors flagged ~35 public tables with RLS disabled (ERROR level) as of 2026-07-06.
  Status: unresolved, needs an explicit decision from the project owner on whether this is
  intentional (Express backend uses a service-role key and enforces access control at the app
  layer) before "fixing" it blindly.
- `public.users` columns as of 2026-07-06: id, restaurant_id, name, email, phone, password_hash,
  role, is_active, salary, salary_type, shift_start, shift_end, kitchen_station,
  commission_rate, created_at, updated_at. No `pin_hash` or dedicated `username` column yet —
  both need to be added for the New Waiter PIN flow.
- CLAUDE.md says Render backend is "paid" — as of the 2026-07-06 migration this was found to
  actually be free tier (confirmed via the 750-hour suspension behavior, which only exists on
  free). This conflict has not been resolved with the project owner — treat CLAUDE.md's "paid"
  claim as unverified until confirmed.

## Sandbox / tooling limitations (for future AI sessions)

- This AI's shell sandbox caps every command at 45 seconds, and background/disowned processes
  do **not** survive between separate tool calls (confirmed 2026-07-06: a backgrounded
  `npm install` for the Electron project vanished entirely by the next call, with an empty log
  and no process). Do not attempt multi-call polling of a long-running background job — it
  will not work. For anything that plausibly exceeds ~40s (installing Electron, building
  native modules, etc.), tell the user to run it on their own machine and report back, rather
  than repeatedly retrying in-sandbox.

## PowerSync setup facts (Phase 0, 2026-07-06)

- Backend does **not** use Supabase Auth (no `auth.users` involvement) — it has its own
  `public.users` table + custom JWT via `jsonwebtoken`. This means PowerSync must be configured
  with **Custom Authentication** (HS256 shared secret, Client Auth tab in the PowerSync
  Dashboard), not the "Use Supabase Auth" checkbox that most PowerSync+Supabase tutorials show.
- New backend endpoint `GET /api/auth/powersync-token` mints the HS256 JWT PowerSync needs
  (`sub`=user id, `aud`=PowerSync instance URL, 60 min expiry, `kid` header). Needs
  `POWERSYNC_URL` / `POWERSYNC_JWT_SECRET` / `POWERSYNC_KID` set on Render to work — not set as
  of 2026-07-06, blocked on the user creating a PowerSync Cloud account.
- Supabase-side: `powersync_role` (REPLICATION, BYPASSRLS, password generated 2026-07-06 —
  see the applied migration `powersync_setup` in the Supabase project for the value, not
  duplicated here) and a `powersync` publication scoped to a specific table list (not `FOR ALL
  TABLES`, deliberately — PowerSync's own docs warn `FOR ALL TABLES` can spike memory/
  replication delay, and it's tighter security to only replicate what's needed). Extend with
  `ALTER PUBLICATION powersync ADD TABLE <name>` as later phases need more tables — do not
  recreate the publication from scratch.

## Working style notes for this user (jahongir)

- Prefers concise, direct answers — avoid over-explaining or restating what's already been said.
- Wants things verified against real, current state (dashboards, code, DB) rather than
  assumptions — this is also codified as RULES.md rule 5 ("work smart, do not guess").
- Comfortable making architecture decisions once trade-offs are explained plainly and concretely
  in plain language (avoid unexplained jargon); prefers a single clear recommendation over a long
  menu of options when a direct question is asked.

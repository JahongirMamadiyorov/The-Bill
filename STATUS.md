# STATUS

Current snapshot of what's done and what's next. This file gets overwritten/updated in place
each session — for history of how we got here, see SESSIONS.md.

Last updated: 2026-07-06 (Phase 0 started)

## Done

- Render backend migrated to a new account after the old one was suspended (free-tier
  750-hour cap exceeded). Live at `https://the-bill-backend-pego.onrender.com`.
- Root Directory misconfiguration on Render fixed (the `the-bill-backend` GitHub repo's root
  already is the backend code — no `restaurant-app/backend` subpath).
- All hardcoded references to the old `the-bill-backend.onrender.com` URL updated across:
  website (`.env.production`, `.env.local.example`, `vite.config.js`, `useKitchenPrint.js`),
  `RestaurantApp/src/api/client.js`, `electron-app/printer.js` + `setup.html`,
  `print-agent/config.json` + `install.ps1`, and a doc comment in the backend's `server.js`.
- CORS bug fixed: `CORS_ORIGIN` on Render had a trailing slash (`.../` vs the browser's
  origin header with no trailing slash) — exact-match CORS was silently failing. Fixed and
  confirmed login works end-to-end on the live website.
- Confirmed `electron-updater` in the current `electron-app` is fully wired (not a dead
  dependency) — publishes to GitHub Releases on `jahongirmamadiyorov/the-bill-website`.
- Full plan agreed for the new standalone Windows POS app (Electron, PowerSync, local-first
  printing) — see MEMORY.md for the decisions and RULES.md §4 for the architecture rules.
- Decided: Waitress role (`new_waiter`) is in scope for the new app, monoblock/touch-first,
  with PIN-based quick account-switching (separate 6-digit PIN, distinct from phone
  login/password).
- Confirmed in code: `new_cashier` (`NewCashierPOS.jsx`) already exists and is usable as a
  head start; `new_waiter` exists only as a role-picker option in `AdminStaff.jsx`, no
  page/route/backend support yet.
- This AI knowledge-base structure itself (RULES.md, MEMORY.md, STATUS.md, SESSIONS.md).

## In progress

- **Phase 0 scaffolding started (2026-07-06).** New folder `pos-app/` created: Electron main
  process (frameless window, no app menu, single-instance lock, electron-store session
  storage), preload.js context bridge, Vite+React renderer with a working Login screen and
  role-based placeholder routing (admin/owner -> `/admin`, `new_cashier` -> `/pos`, cashier ->
  `/cashier`, kitchen -> `/kitchen`, `new_waiter` -> `/waiter`). Login calls the real
  `POST /api/auth/login` on the live Render backend from the main process (same trust boundary
  pattern as `electron-app/printer.js`).
- Backend: added `GET /api/auth/powersync-token` in `restaurant-app/backend/src/routes/auth.js`
  — mints a short-lived HS256 JWT for PowerSync's Custom Authentication flow (requires an
  existing valid app JWT). Added `POWERSYNC_URL` / `POWERSYNC_JWT_SECRET` / `POWERSYNC_KID` to
  `.env.example` (not yet set on Render — see Not Yet Started below).
- Supabase: created `powersync_role` (REPLICATION, BYPASSRLS) and a `powersync` publication
  scoped to the tables needed first (restaurants, users, restaurant_tables, table_sections,
  menu_items, categories, menu_item_ingredients, custom_stations, orders, order_items,
  customers, notifications, waitress_permissions, restaurant_settings). Finance/inventory/audit
  tables intentionally left out for now — extend later with `ALTER PUBLICATION powersync ADD
  TABLE <name>` when Admin/Owner phases need them.
- **Verified working (2026-07-06):** user ran it on their own Windows machine — `npm install`,
  `npm run dev:renderer` + `npm run dev`, logged in with a real account against the live Render
  backend, and it correctly routed to the Admin/Owner placeholder screen. The login -> role
  routing loop is confirmed end-to-end, not just reviewed code.
  Two Windows-specific bugs were found and fixed along the way: (1) PowerShell blocks scripts by
  default — fixed by the user running `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy
  RemoteSigned`, not a code issue; (2) the `start`/`dev` npm scripts used bash-only syntax
  (`unset VAR;` and inline `VAR=value cmd`), which fails on Windows — fixed in `package.json` by
  removing `unset` (unnecessary given `main.js`'s own `ELECTRON_RUN_AS_NODE` guard) and switching
  to the `cross-env` package for `NODE_ENV`. Lesson: always write cross-platform-safe npm
  scripts for this project, since the primary dev machine is Windows, not Mac/Linux.

## Not yet started (next steps, in rough order)

0. **User action required before Phase 0 is fully done:** run `npm install` in `pos-app/`
   locally and confirm `npm run dev:renderer` + `npm run dev` actually launch the app and reach
   the login screen. Sign up for PowerSync Cloud, create an instance, connect it to Supabase
   using the `powersync_role` credentials (ask this AI for the password — it's in the applied
   migration, not repeated in plaintext here), configure Client Auth with an HS256 shared
   secret (this AI has one ready to give you), then set `POWERSYNC_URL` / `POWERSYNC_JWT_SECRET`
   / `POWERSYNC_KID` on Render to match. Write the Sync Streams/Rules once connected (draft can
   be prepared from the schema already gathered).
1. New Waiter PIN login — backend: add `pin_hash` (and a dedicated login `username` if one
   doesn't already exist) to `users`, add a PIN-login endpoint with failed-attempt lockout.
   Frontend: extend `AdminStaff.jsx`'s add/edit form to collect username + PIN when role is
   `new_waiter` (and possibly `new_cashier`). **User explicitly said "not yet" to starting this
   — do not begin until asked.**
2. Phase 0 of the new Windows app: scaffold the Electron+React shell, wire login against the
   existing Express API, enable Supabase Postgres logical replication, set up PowerSync Cloud
   + Sync Rules.
3. Phase 1: port `NewCashierPOS.jsx` into the new app, swap its data layer to PowerSync local
   reads + queued writes, verify offline order creation/payment/printing.
4. Phase 1b: design and build New Waiter's touch-first screens from scratch (tables,
   order-taking, send-to-kitchen at minimum) plus the PIN account-picker UI.
5. Phase 2: Kitchen ticket display, local-triggered printing.
6. Phase 3: Admin screens (menu, inventory, suppliers, waitress permission toggles).
7. Phase 4: Owner screens (dashboards, P&L, staff, loyalty/CRM).
8. Phase 5: packaging (electron-builder installer, auto-update, real monoblock hardware
   testing, staged rollout).

## Open questions / unresolved

- Render plan: CLAUDE.md says "paid," actual behavior during the 2026-07-06 incident matched
  free tier. Not reconciled with the project owner yet.
- Which GitHub repo actually covers `electron-app` + `print-agent`? Not confirmed — user said
  they'd handle the git pushes themselves and didn't answer this specific mapping.
- Supabase RLS disabled on ~35 public tables — flagged, not decided whether intentional.
- `RestaurantApp/src/api/client.js` has `USE_LOCAL_BACKEND = true` — dev builds point at
  localhost, not the new Render URL. Not addressed.
- Whether `new_cashier` also needs the PIN quick-switch flow (same shared-terminal reasoning as
  `new_waiter`) or only ever has one login — not yet asked.

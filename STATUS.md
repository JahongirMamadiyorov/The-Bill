# STATUS

Current snapshot of what's done and what's next. This file gets overwritten/updated in place
each session — for history of how we got here, see SESSIONS.md.

Last updated: 2026-07-08 (backend stock-deduction bug fixed, needs deploy + test)

## Done

- Render backend migrated to a new account after the old one was suspended (free-tier
  750-hour cap exceeded). Live at `https://the-bill-backend-pego.onrender.com`.
- All hardcoded references to the old backend URL updated across website, RestaurantApp,
  electron-app, print-agent. CORS trailing-slash bug fixed; login confirmed working end to
  end on the live website.
- Confirmed `electron-updater` in the existing `electron-app` is fully wired (publishes to
  GitHub Releases on `jahongirmamadiyorov/the-bill-website`).
- Full plan agreed for the new standalone Windows POS app — Electron, PowerSync for
  offline-first data, local-first printing (no cloud round-trip for the print signal). See
  MEMORY.md for the decisions and RULES.md §4 for the architecture rules. Scope: Admin, Owner,
  Cashier (`new_cashier`, reusing existing `NewCashierPOS.jsx`), Kitchen, and a new touch-first
  Waitress mode (`new_waiter`) with PIN-based quick account-switching on shared monoblocks —
  `new_waiter` exists only as a role-picker option in `AdminStaff.jsx` today, no page/backend
  behind it yet.
- **Phase 0 complete and verified working on the user's real machine**, not just written:
  `pos-app/` — Electron+Vite+React app, frameless/no-menu window, login wired to the real
  backend, role-based routing, and full PowerSync offline-first sync connected, synced, and
  queried successfully (confirmed via a live status panel showing "connected" / "initial sync
  complete: yes" / real restaurant name / real menu item count).
  - Backend: `GET /api/auth/powersync-token` mints a short-lived HS256 JWT for PowerSync,
    including `restaurant_id`/`role` as custom claims (see MEMORY.md — needed because
    PowerSync doesn't support `column = (subquery)` in Sync Streams).
  - Supabase: `powersync_role` + a `powersync` publication scoped to the tables needed first
    (see RULES.md §4 for the list; finance/inventory/audit tables intentionally excluded for
    now, extend later with `ALTER PUBLICATION`).
  - PowerSync Cloud: project "the-bill-pos", Development instance connected to Supabase,
    Client Auth (HS256) configured, Sync Streams deployed and working.
  - `pos-app/powersync/schema.js` + `connector.js`: local schema verified column-by-column
    against the real Postgres schema (not guessed); `fetchCredentials()` is real;
    `uploadData()` is a **deliberate stub** (drains the queue without forwarding — no
    write-producing UI exists yet). **Must be replaced with real per-table forwarding to the
    existing Express routes before Phase 1 ships** — not a generic bypass of business logic.
  - Along the way: fixed a security issue (the `users` Sync Streams query was `SELECT *`,
    which would have replicated `password_hash` to every terminal — narrowed to an explicit
    column list), and several environment bugs — see SESSIONS.md 2026-07-06 for the full list
    (Windows/bash script incompatibilities, wrong `better-sqlite3` version guess, Electron 28
    bundling too-old a Node.js for PowerSync's dependencies, `@powersync/node` being a
    pure-ESM package incompatible with plain `require()`).
- This AI knowledge-base structure itself (RULES.md, MEMORY.md, STATUS.md, SESSIONS.md).
- **Phase 1: Cashier — written, NOT yet verified by running it** (same caveat as early Phase 0:
  this sandbox can't run a full Electron+PowerSync app to completion). Needs `npm install` on
  the user's real machine (adds the new `lucide-react` dependency) and a real login as a
  `new_cashier` user to confirm it actually works. What was built:
  - `pos-app/src/pages/Cashier.jsx` — ported from `website/src/pages/new-cashier/NewCashierPOS.jsx`,
    same design/colors. Menu, categories, tables, and active orders now read from the local
    PowerSync database (works offline) instead of REST. Fire/Charge still call the backend
    directly over HTTPS (`window.electronAPI.ordersCreate` / `ordersPay`) — **online required**
    for those two actions specifically (see "Key decision" below).
  - `pos-app/src/lib/case.js` — new snake_case → camelCase translation layer for local
    PowerSync rows (RULES.md rule 3). Local SQLite has no camelCase layer the way REST
    responses do; booleans also arrive as 0/1 integers, not `true`/`false` — this file fixes
    both, with an explicit list of known boolean columns (cross-check `schema.js` if a new one
    is added and it misbehaves).
  - `pos-app/main.js` — added `submitOrderWrite()` + `orders:create` / `orders:pay` IPC
    handlers. These call the Express API directly (same trust boundary as `auth:login`), NOT
    PowerSync's write queue — order creation/payment has real server-side business logic (tax,
    daily numbering, stock deduction, kitchen notifications/printing) that has to stay
    centralized, not be duplicated client-side.
  - **Key decision (2026-07-07, project owner):** Phase 1 requires the backend to be reachable
    for Fire/Charge ("Option A" — simple, safe, ships fast). Offline queuing for these two
    actions ("Option B") was explicitly requested as a *future* addition, not built now.
    `submitOrderWrite()` in `main.js` is written as the single funnel every order write goes
    through specifically so Option B can be added later in one place (check connectivity,
    queue to a local outbox table if offline, replay on reconnect) without a rewrite. Don't
    add direct backend calls for order writes anywhere else — always route through it.
  - `powersync/connector.js`'s `uploadData()` stays a stub — it's for PowerSync's own write
    queue, which Phase 1 deliberately does NOT use for orders (see decision above). Leave as
    documented unless a future phase actually needs PowerSync-native writes for something else.

- **Bug fixed, not yet deployed/tested:** ingredient stock wasn't being deducted when items were
  added to or edited on an existing order (only new-order creation deducted stock). Fixed in
  `restaurant-app/backend/src/routes/orders.js` (`POST /:id/items` and `PUT /:id`) — see
  SESSIONS.md 2026-07-08 for the full explanation, including a round-2 revision: `PUT /:id` now
  diffs old vs. new item quantities per menu item and only touches/logs stock for what actually
  changed (added / removed / quantity edited), instead of refunding+re-deducting everything on
  every edit (which was logging "Edited" even for items that hadn't changed). **Needs: push to
  `the-bill-backend`, let Render redeploy, then actually add/edit items on an existing order and
  confirm the ingredient's stock count in Admin → Inventory goes down by the right amount**
  (and doesn't double-deduct on a second edit, and unchanged items don't get a spurious "Edited"
  entry).
- **Inventory UI updated to match** (not yet deployed/tested): Stock Output and Stock Overview
  now show a colored "Order / Added / Removed / Edited" badge next to auto-generated reasons,
  plus clock time (not just date) on every movement timestamp. Files:
  `website/src/hooks/useApi.js` (`fmtDateTime`), `website/src/pages/admin/AdminInventory.jsx`
  (`autoOrderReasonBadge`). **Needs: push to `the-bill-website`, let Vercel redeploy, then
  visually confirm on the real site** — only verified via the Read tool / esbuild parse check
  from this sandbox, never rendered in a browser.
- **Sandbox note:** this session hit a false-alarm file "corruption" caused by a stale bash-mount
  view of `orders.js` — the real file (as seen by Read/Edit, i.e. what's actually on disk) was
  fine throughout. See MEMORY.md "Mount lag" section. Not a data-loss risk, just wasted time —
  worth knowing if a future session sees a similarly confusing syntax error on this file.
- **2026-07-16: Audited the ingredient/stock math after the user reported real-data mismatches**
  (Shashlik Qiyma: 66→11 but Output tab showed "58 consumption"; Shashlik Mol Go'sht: 30→10 but
  showed "22 out"). Root cause: correct — the Stock Output tab only showed OUT/WASTE/ADJUST/
  SHRINKAGE, not the `type='IN'` refunds the backend legitimately logs when an order edit
  removes/reduces an item (those lived only on Stock Overview), so "start − Output total" never
  matched live stock whenever any order got edited down. **Fixed, needs push/deploy + visual
  confirm:** `website/src/pages/admin/AdminInventory.jsx` now includes those order-refund IN
  rows directly in the Output tab's per-item breakdown (green "+", "Removed"/"Edited" badges
  already existed via `autoOrderReasonBadge`), and each item's headline number is now the NET
  amount (gross out − returns) so it reconciles with live stock at a glance. Real deliveries
  (non-order IN movements) are unaffected — still Overview-only.
- **Found during the same audit, NOT yet fixed** (see MEMORY.md "Inventory ingredient math" for
  full detail — needs a decision from the project owner on priority/approach):
  1. The phone app (`RestaurantApp`) has two inventory screens on two different, inconsistent
     backend APIs — `WarehouseScreen.js` (`/api/warehouse`, correct) and `AdminInventory.js`
     (`/api/inventory`, legacy — silently changes `quantity_in_stock` with no movement log, and
     zeroes it if the edit form omits quantity). Any use of the old screen corrupts the number
     everyone else sees, invisibly.
  2. `orders.js`'s `PUT /:id/pay` fallback "already deducted" check
     (`stock_movements.reason LIKE 'Auto: Order #<num>%'`) has no `restaurant_id` or date scope,
     so it can false-match an unrelated order (order numbers reset daily per restaurant) and
     wrongly skip a real deduction.

## Not yet started (next steps, in rough order)

1. **New Waiter PIN login** — backend: add `pin_hash` (+ dedicated `username`) to `users`, add
   a PIN-login endpoint with failed-attempt lockout. Frontend: extend `AdminStaff.jsx`'s
   add/edit form to collect username + PIN when role is `new_waiter` (possibly `new_cashier`
   too). **User explicitly said "not yet" — do not begin until asked.**
2. **Phase 1: Cashier — verify it actually works (round 2).** Run `npm install` + `npm run dev`
   in `pos-app/` on the real machine, log in as a `new_cashier` user (not plain `cashier` — that
   role still shows the old placeholder on purpose), confirm:
   - Menu/categories show up from local sync; weighed items (unit = kg/l/g/ml) open the type-an-
     amount modal instead of a +/- stepper, and show "amount / unit" in the badge and cart.
   - Tapping the table field opens a full card-grid table picker (color-coded by status), not a
     dropdown; selecting a table returns to the menu with it set.
   - **Fire** (not Charge) an order and confirm it shows up under the Orders tab within a few
     seconds (auto-polls every 4s now). If it still doesn't show after Firing specifically,
     that's a real bug — report it with what was in the cart.
   - Charge an order — it will NOT show under Orders (that's correct, paid orders belong in
     History/Bills, not built yet) — but confirm it doesn't error and the website's own
     Orders/Kitchen view reflects the payment.
   Report back anything that breaks — do not assume it works without running it.
3. **Phase 1b: New Waiter.** Design and build touch-first screens from scratch (tables,
   order-taking, send-to-kitchen at minimum) plus the PIN account-picker UI.
4. **Phase 2: Kitchen.** Ticket display, local-triggered printing (no cloud round-trip).
5. **Phase 3: Admin.** Menu, inventory, suppliers, waitress permission toggles.
6. **Phase 4: Owner.** Dashboards, P&L, staff, loyalty/CRM.
7. **Phase 5: Packaging.** electron-builder installer, auto-update, real monoblock hardware
   testing, staged rollout.

## Open questions / unresolved

- Render plan: CLAUDE.md says "paid," actual behavior during the 2026-07-06 incident matched
  free tier. Not reconciled with the project owner yet.
- Which GitHub repo actually covers `electron-app` + `print-agent`? Not confirmed.
- Supabase RLS disabled on ~35 public tables — flagged, not decided whether intentional.
- `RestaurantApp/src/api/client.js` has `USE_LOCAL_BACKEND = true` — dev builds point at
  localhost, not the new Render URL. Not addressed.
- Whether `new_cashier` also needs the PIN quick-switch flow (same shared-terminal reasoning as
  `new_waiter`) or only ever has one login — not yet asked.
- `pos-app`'s Electron version (`^33.0.0`) is intentionally newer than the existing
  `electron-app`'s (`28.3.3`) — don't "align" them without checking PowerSync's Node version
  requirements still hold.

# STATUS

Current snapshot of what's done and what's next. This file gets overwritten/updated in place
each session — for history of how we got here, see SESSIONS.md.

Last updated: 2026-07-27 (design-parity round 2 fixes + new "add items to an existing order
from Menu" feature — CONFIRMED WORKING on the real machine after an app restart.)

## New feature: add-to-existing-order from Menu (built 2026-07-27, confirmed working)

Tapping an occupied table on Menu while building a cart shows a green "Adding to
Order #X" banner immediately (not just at Fire), splits the cart into "Already In This
Order" (read-only, muted) vs "Adding Now" (interactive) sections, shows combined
Already/Adding/Tax/New Order Total in the Totals block, hides the Charge button (Fire-only —
payment still happens later from Orders/Tables), and stays on the Menu tab after firing.
Fire calls the new `orders:addItems`/`ordersAddItems` IPC → `POST /api/orders/:id/items`
(append-only, backend recomputes totals from ALL items) instead of `orders:create` — kept
deliberately separate from `orders:update` (`PUT /:id`, which replaces the whole item list).
Files: `main.js`, `preload.js`, `MenuScreen.jsx`. **User confirmed working 2026-07-27** after
restarting the full Electron app (see the "preload/main.js changes need a full restart" note
in MEMORY.md — that was the only blocker, first attempt silently failed with no error/loading
because the running app was still on the pre-edit preload bundle).

## POS Terminal redesign — all 8 steps built (approved 2026-07-26)

The project owner built a full design in Claude Design (their separate design tool) and
approved rebuilding the `new_cashier` `/pos` screens to match it. Design source of truth:
`pos-app/POS Terminal Design System/design_handoff_pos_terminal/` (README.md has all
tokens; screenshots/ has all 14 states). 6 screens (Menu, Orders, Tables, History,
Receivables, Profile) + 5 modals. NO "Bills" screen. Old teal `src/pages/Cashier.jsx`
kept as reference but no longer routed — new code lives in `pos-app/src/pages/pos/`.

Was paused mid-Step-7 at the user's request ("stop the job and leave a log"), then resumed and
finished steps 7 and 8 in the next session. Full detail in SESSIONS.md 2026-07-26 entries.

All 8 screens exist and are wired to real backend data (esbuild-parse-verified every file,
**NOT yet run on the real machine — that is the very next thing to do, before shipping or
building anything further on top of this**):
- **Step 1 shell:** `tokens.js`, `useSettings.js`, `PosShell.jsx` (264↔88px sidebar, UZ/EN,
  topbar), `index.html` (Plus Jakarta Sans). Backend: `settings.js` ALLOWED_ROLES fix (was
  403-ing new_cashier/new_waiter). `main.js`/`preload.js`: new read-only `api:get`/`apiGet` IPC.
- **Step 2 Menu** (`MenuScreen.jsx`): categories, product grid, cart w/ category-grouped
  steppers, floor-plan table picker, weighed-item modal, Fire.
- **Step 3 Payment modal** (`PaymentModal.jsx`): Cash/Card/QR/Loan, change calc, discount,
  split 2/3/4 ways, loan fields, success view. Payload matches `PUT /orders/:id/pay` exactly.
- **Step 4 Orders** (`OrdersScreen.jsx`): filter pills, cards, detail panel, full edit mode
  (steppers/remove/change type/change table, Discard/Done) via new `orders:update`/
  `ordersUpdate` IPC → `PUT /orders/:id`.
- **Step 5 Tables** (`TablesScreen.jsx`): zone pills from `restaurant_tables.section`, status
  legend, cards w/ waiter·elapsed·total, "Open in Orders" jump.
- **Step 6 History + refund** (`HistoryScreen.jsx` + new backend `POST /orders/:id/refund`):
  stat cards, date chips incl. custom calendar range, orders table, detail modal, refund
  dialog. New `orders` columns `refunded_at`/`refund_reason`/`refunded_by` (auto-migrated,
  does NOT touch `status`). History reads via `apiGet('/api/orders?...')`, not local
  PowerSync (needs joined data, not offline-critical).
- **Step 7 Receivables** (`ReceivablesScreen.jsx`): 3 stat cards (computed client-side from
  `GET /api/loans`, not a separate stats call — Total Outstanding/Overdue/Customers with
  Balance), All/Active/Paid/Overdue filter chips, loans table, Loan Details modal (pulls order
  items via `apiGet('/api/orders/:id')`), Collect Payment modal → `loansPay` (`PATCH
  /api/loans/:id/pay`). "Remind" button uses a new `loans:remind`/`loansRemind` IPC →
  `POST /api/loans/notify-overdue` (notifies ALL overdue loans restaurant-wide, not per-row —
  that's what the backend endpoint does, there's no single-loan reminder route).
- **Step 8 Profile** (`ProfileScreen.jsx`): header card (avatar, name, On Shift/Off Shift pill,
  role), Shift Info card with a real Clock In **or** Clock Out button depending on
  `GET /api/shifts/active` (new `shifts:clockIn`/`shifts:clockOut` IPC → the existing
  `POST /api/shifts/clock-in`/`clock-out`), Personal Details card (phone/email/hire date from
  the session user), 3 stat cards (orders handled/sales/avg serve time today, computed from
  `GET /api/orders?waitress_id=...&status=paid&from=today&to=today`). **Deliberately omits**
  the design's Break/Employee ID fields and Edit Profile/Change Password buttons — checked
  `schema.sql` and there's no break-tracking column, no employee-ID field, and no
  change-password endpoint; showing fake fields with no real data behind them was rejected in
  favor of building them for real later if wanted (see MEMORY.md).

**Next step: run it.** Nothing beyond esbuild parse-checks and `node --check` on the touched
backend files has verified any of this. Before building anything further (Kitchen, Admin,
Owner, New Waiter phases) or considering this shippable:
1. `npm install` in `pos-app` if not done recently, then the two-terminal dev flow
   (`npm run dev:renderer` then `npm run dev`), log in as a `new_cashier` user.
2. Push the backend changes (`settings.js` ALLOWED_ROLES, new `orders.js` refund endpoint +
   refund columns) to `the-bill-backend` / Render — none of this session's backend work is
   live yet, so Refund/Receivables/Profile screens will error against the current deployed
   backend until it's pushed.
3. Click through all 8 screens for real: Menu → Fire/Charge, Orders → edit mode (does stock
   actually adjust correctly on save?), Tables, History → try a refund on a real paid order,
   Receivables → collect a loan payment, Profile → clock in/out.
4. Report back anything broken — this was built screen-by-screen from the design spec and the
   existing backend contracts, but has real integration risk (local PowerSync field names,
   IPC wiring, money math) that only a real run will surface.

**ROOT CAUSE FOUND (2026-07-26): PowerSync Cloud is not connected to Supabase.** Real-machine
test surfaced: new orders don't show in the Orders screen, occupied tables don't show occupied
in Tables/the table picker — both fine on the website (reads Postgres directly). Queried
Supabase directly (`execute_sql`, worked this time — permission from the 2026-07-16 audit
session was apparently temporary/session-scoped, not a lasting restriction): the `powersync`
publication correctly includes `orders`/`restaurant_tables`/everything else, `powersync_role`
is valid with replication privilege and no expiry — but **`pg_replication_slots` is completely
empty, zero rows**. PowerSync Cloud has no active logical-replication connection to this
database at all, so nothing has been streaming to ANY local POS terminal (old design or new —
this is not a code bug, it would affect both identically). Not fixable from this side — no API
access to the PowerSync Cloud dashboard (separate service, no key configured). **Handed to the
user to check PowerSync Cloud's "the-bill-pos" Development instance connection status and
reconnect it.** Added a live sync status badge to the POS topbar (`PosShell.jsx` — green
"Synced" / amber "Syncing…" / red "Offline", click to re-check `psStatus()`) so this is
diagnosable from the app itself going forward, instead of only discoverable via a DB query.
**RESOLVED — user reconnected PowerSync, confirmed orders/tables now sync correctly.**

**Real-machine design-parity pass (2026-07-26, same session).** User sent live screenshots of
Menu/Orders/Payment modal/Tables; compared pixel-by-pixel against
`design_handoff_pos_terminal`. Fixed: (1) Tables screen's right panel now matches design —
Print/Edit/Charge instead of a placeholder "Open in Orders" button; Edit jumps to Orders
pre-selected + already in edit mode via a new cross-screen `openOrder()` handoff in
`PosShell.jsx`; Charge opens `PaymentModal` right on Tables. (2) Orders detail panel's table
name was silently falling back to generic "Dine In" when the lookup failed and never showed
table+type together — this was the reported "table names not showing" bug, now always renders
`TableName · Dine In · Xm ago`. (3) Root-caused 2 of 8 real menu-item photos rendering as
broken-image icons: `pos-app/index.html` CSP had no `img-src`, silently blocking the Render
backend domain photos are actually served from — added
`img-src 'self' data: https://the-bill-backend-pego.onrender.com;`. **User said the photo
content itself is being handled on their end — no further image work needed, but this CSP fix
stays since it was blocking photos structurally, not a content issue.** (4) Orders screen's
order-card meta line (table/type + time) rendered pressed together with no visible gap at
actual card width — switched from `justify-content: space-between` to an explicit ` · `
separator, matching the pattern Tables' card chip already uses successfully.
**Not yet re-tested on the real machine — waiting on user confirmation.**

**Follow-up fix, same day**: the cross-screen "Edit jumps to Orders" handoff from the round
above had a real bug — items got wiped to 0 when jumping into edit mode. Root cause: the
handoff's `useEffect` fired `startEdit()` as soon as `orders` (fetched first) contained the
order, but `itemsByOrd` (fetched in the same `load()` call, after an `await`) hadn't populated
yet for that render, so edit state started from an empty items array. **User also said
explicitly: editing must stay on the Tables screen, not navigate to Orders at all** ("I must
stay at the tables page and edit it all from there") — overriding the design README's literal
"Edit jumps to Orders in edit mode" text. Removed the `openOrder`/`pendingOrder` handoff
entirely (`PosShell.jsx`, `OrdersScreen.jsx`) and gave `TablesScreen.jsx` its own full in-place
edit mode instead — mirrors Orders' edit UI (category-filtered add-items grid replaces the
table grid while editing, right-panel items gain steppers/remove, Discard/Done replace
Print/Edit) but table and order type stay fixed to the tapped table (no floor-plan re-picker,
since you're already editing from a specific table). This also structurally eliminates the
race condition — Tables reads its own already-loaded `itemsByOrd`/`menuItems` directly, no
cross-screen timing involved. **Not yet re-tested on the real machine.**

**Second follow-up, same day**: the same "items/table vanish on Edit" symptom then showed up
on Orders' own native Edit button (no cross-screen jump involved at all). Root cause was
self-inflicted: when `startEdit` was given an `(ord = selected)` parameter earlier (for the
now-removed cross-screen handoff), the button was still wired as `onClick={startEdit}` —
React's onClick always passes the DOM event as the first argument, so `ord` silently became
that event object instead of falling back to `selected` (the default only applies when the
argument is literally `undefined`, and an event object is truthy). `event.id`/`event.tableId`
are undefined, so items came from `itemsByOrd[undefined]` (empty) and table from
`tableById[undefined]` (null) — exactly the blank-out the user saw. Reverted `startEdit` in
`OrdersScreen.jsx` to take no parameter (reads `selected` directly again), with a comment
explaining the footgun so it doesn't get reintroduced. Audited every other `onClick={fnName}`
site across `pos-app/src/pages/pos/*.jsx` for the same pattern — nothing else affected.
**Not yet re-tested on the real machine.**

**Third follow-up, same day**: user wanted Tables' in-place edit mode to work exactly like
Orders' edit mode, including order type switching and "Change on floor plan" table
re-assignment — the earlier in-place edit only carried items, with table/type fixed to the
tapped table. Added `editType`/`editTable`/`pickTable` state to `TablesScreen.jsx`, the same
ORDER TYPE pill row + "Change on floor plan" button + floor-plan picker view as Orders' edit
mode (ported verbatim), and `saveEdit` now sends `editType`/`editTable.id` instead of the
fixed values. After a successful save the screen follows the order to its new table (or
deselects if it left the floor for takeout/delivery, since Tables is table-centric).
`startEdit` again takes no parameter (same footgun avoided as the Orders fix above).
**Not yet re-tested on the real machine.**

Standing rules for this rebuild (don't relitigate): DB/API names stay
`waitress_id`/`waitress_permissions`/role string `'waitress'` — only the UI *label* says
"Waiter". Money mirrors the backend exactly (subtotal + tax − discount); service charge is
DISPLAY-ONLY everywhere in this codebase (backend never adds it to `total_amount`) — flagged
to the owner as an open question, not decided, don't silently change it either direction.

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

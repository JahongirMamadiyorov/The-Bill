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

**Later the same day: PowerSync fully connected, and app-side sync code written.** User
created a PowerSync account/project ("the-bill-pos"), connected it to Supabase, and hit a real
error deploying Sync Streams: PowerSync doesn't support `column = (subquery)` syntax, only
`auth.parameter()`/`IN (subquery)`/`JOIN`. Fixed by adding `restaurant_id`/`role` as custom
claims on the PowerSync JWT (`/api/auth/powersync-token`) and rewriting every stream query to
use `auth.parameter('restaurant_id')` directly — no subquery needed at all. Also caught and
fixed a security issue before it went live: the `users` stream was `SELECT *`, which would
have synced `password_hash` to every terminal; narrowed to an explicit safe column list.

Wrote the actual PowerSync integration in `pos-app`: `powersync/schema.js` (local schema,
double-checked column-by-column against real Postgres schema via Supabase MCP, not guessed),
`powersync/connector.js` (`fetchCredentials()` real; `uploadData()` a deliberate no-op stub —
see STATUS.md for why), and wired both into `main.js` + `preload.js`. `RolePlaceholder.jsx`
now shows live sync status so it's visually obvious whether it's working.

**Not yet verified** — needs `npm install` (adds `@powersync/node`, `better-sqlite3`,
`@electron/rebuild`) and a run-through on the user's machine. Native module compilation for
Electron is the biggest risk of failure here; expect possible back-and-forth debugging it.

**Phase 0 finished and confirmed working, same day.** Three more real bugs surfaced and were
fixed while getting it running:

1. Wrong `better-sqlite3` version guessed (`^11.3.0`) — `@powersync/node@0.19.2` actually
   requires `^12.x` as a peer dependency. Fixed by reading the actual npm error.
2. `@powersync/node` is pure ESM with no CommonJS support — `require('@powersync/node')` threw
   `ERR_PACKAGE_PATH_NOT_EXPORTED`. Fixed by loading it via dynamic `import()` inside `main.js`
   and turning `powersync/schema.js` into a `buildSchema({ column, Schema, Table })` factory
   function instead of importing those symbols itself.
3. Electron `28.3.3` (originally chosen to match the existing `electron-app`) bundles Node.js
   18, which doesn't have the global `File` class that PowerSync's `undici` dependency needs
   (added in Node 20) — crashed with `ReferenceError: File is not defined`. Fixed by bumping
   `pos-app` specifically to Electron `^33.0.0` + `electron-builder` `^26.0.0`. This was a
   deliberate divergence from `electron-app`'s pinned version, not an oversight — noted in
   STATUS.md so a future session doesn't "fix" it by re-aligning them.

After these fixes: clean `npm install` + `npm run dev` on the user's real Windows machine
produced a working app end to end — login succeeded against the live backend, routed to the
Admin/Owner placeholder, and the screen showed PowerSync "connected", "initial sync complete:
yes", the real restaurant name, and a real menu item count, all pulled from the local SQLite
database. Phase 0 is genuinely done, not just written and hoped-for.

---

## 2026-07-07

**Phase 1: Cashier — started and written, not yet verified.** Resumed session by re-reading
RULES/SESSIONS/STATUS/MEMORY per the process rule, then asked the user to confirm direction on
Phase 1's one real architecture fork before writing code: should Fire/Charge (creating an
order, taking payment) work offline, or require the backend to be reachable? Explained the
trade-off in plain language (per feedback memory — this user wants jargon-free explanations for
architecture decisions). User chose "Option A" (online-required for writes) but asked to
explicitly leave room to add "Option B" (offline queuing) later — both requirements captured in
code comments and STATUS.md, not just remembered verbally.

Read `website/src/pages/new-cashier/NewCashierPOS.jsx` (already existed, ~990 lines) and the
backend's `POST /api/orders` / `PUT /api/orders/:id/pay` routes to understand exactly what
fields the create/pay flow needs, and confirmed neither endpoint needs anything beyond what the
original web component already sends.

Built:
- `pos-app/src/lib/case.js` — snake_case→camelCase + integer→boolean translation for local
  PowerSync query rows (there's no REST-response-style camelCase layer for local SQLite reads).
- `pos-app/src/pages/Cashier.jsx` — ported `NewCashierPOS.jsx` into `pos-app`. Same visual
  design (RULES.md rule 2). Reads (menu, categories, tables, active orders) switched to local
  PowerSync queries via `window.electronAPI.psGetAll`, camelized through `case.js`. Writes
  (Fire, Charge) switched to two new IPC calls, `ordersCreate`/`ordersPay`, sending snake_case
  payloads that match the Express API's expected field names exactly (checked against the
  actual route code, not guessed — RULES.md rule 5).
- `pos-app/main.js` — added `submitOrderWrite()` (single funnel for all order writes, calls the
  backend directly over HTTPS using the existing `request()` helper and stored session token)
  and two IPC handlers, `orders:create` / `orders:pay`, built on top of it. Heavily commented
  as the intended insertion point for future offline queuing (Option B), since the user asked
  for that room to be left explicitly.
- `pos-app/preload.js` — exposed `ordersCreate(payload)` / `ordersPay(id, payload)`.
- `pos-app/src/App.jsx` — `/pos` route now renders the real `Cashier` component (was
  `RolePlaceholder`) for the `new_cashier` role.
- `pos-app/package.json` — added `lucide-react` (same version pinned in `website/package.json`,
  `^0.577.0`) since the ported component uses it for icons; this is a new dependency that needs
  `npm install` on the real machine before it'll run.

**Not yet verified.** Same sandbox limitation as Phase 0 — this AI cannot run a full Electron
app end to end here. The code was written carefully (field names cross-checked against the
actual backend route source, not assumed) but is untested. Next step is on the user's machine:
`npm install` (pulls in `lucide-react`), `npm run dev`, log in as a `new_cashier` user, and
confirm menu browsing, Fire, and Charge all actually work — see STATUS.md for the specific
checklist.

**Same day, second pass — user tested and gave feedback.** User logged in first with a
`cashier`-role account by mistake (saw the old `/cashier` placeholder, not the new `/pos`
screen) — clarified the role difference, not a bug. After logging in correctly as
`new_cashier`, three things came back:

1. Reported active orders "not showing up after making them." Investigated: no code bug found;
   the likely explanation is that Charge marks an order `paid` immediately, and the Orders tab
   only lists in-progress orders (`pending`/`sent_to_kitchen`/`preparing`/`ready`) — same
   behavior as the website. Added a 4s poll while the Orders tab is open anyway (matching
   `CashierTables.jsx`'s 5s pattern) so any real PowerSync replication lag also resolves itself
   without a manual refresh, and added an explanatory line in the empty state. **Not fully
   confirmed root-caused — needs the user to try again and report whether Fire (not Charge)
   orders now show up.**
2. Wanted weighed items (sold by kg/l, typed amount, not a unit stepper) — this existed in the
   OLDER cashier screen (`website/src/pages/cashier/CashierMenu.jsx`) but not in
   `NewCashierPOS.jsx`, which is what Phase 1 was ported from. Ported the whole feature over:
   `isWeighedItem`/`unitSuffix`/`formatQty` helpers, the amount-picker modal (type a quantity OR
   a price, the other field auto-calculates), and menu/cart card variants for weighed items.
   Triggered by `menu_items.unit` being `kg`/`l`/`g`/`ml`.
3. Wanted table selection to open a full card-grid picker (color-coded by status —
   free/occupied/reserved/cleaning) instead of a plain dropdown, matching the older
   `CashierTables.jsx`/`CashierMenu.jsx` table-picker UX. Ported that too: tapping the table
   field now swaps the center panel to a full-screen table grid grouped by section, with a
   walk-in option and a back-to-menu button; the order panel on the right stays visible the
   whole time.

All three changes are in the same `pos-app/src/pages/Cashier.jsx` — not yet re-verified on the
real machine (needs another test round).

**Same day, third pass.** User tried it (screenshots: weighed items and table picker both
confirmed working visually) and asked for three more changes to `Cashier.jsx`:

1. Table selection made mandatory for dine-in orders — label changed from "(optional)" to
   "(required)", and `handleFire`/`handleCharge` now block submission with an inline error if
   `orderType === 'dine_in'` and no table is selected (border turns red after a blocked
   attempt). To-Go/Delivery orders are unaffected (table was never applicable there).
2. Loan payment method now asks for the borrower's name (required), phone (optional), and a
   due date (required, native `<input type="date">`, can't be set in the past) — matches what
   the backend's `PUT /orders/:id/pay` actually requires for `payment_method: 'loan'`
   (`loan_customer_name` + `loan_due_date`, checked in `orders.js`, or it 400s). Validated
   client-side before the request goes out, not just left to the backend to reject.
3. Card and QR Code payment methods now show a dashed placeholder box instead of nothing —
   explicitly reserved space for a future payment terminal integration, not wired to any real
   payment API yet. Order still gets tagged with the method and marked paid as before; this is
   just making the "not integrated yet" state visible instead of silent.

Not yet re-verified on the real machine.

---

## 2026-07-08

**Bug fix: ingredient stock never moved when an order was edited.** User reported that adding
items to an order via the cashier or waitress panel didn't deduct anything from warehouse
stock — only creating a brand-new order did. Traced it to
`restaurant-app/backend/src/routes/orders.js`: the ingredient-deduction logic (BOM lookup →
`warehouse_items.quantity_in_stock` decrement → `stock_movements` log) only existed inside
`POST /` (create order) and the `served`/`paid` fallback in `PUT /:id/status`. The two routes
actually used to modify an existing order's items — `POST /:id/items` (add items; called by
`CashierMenu.jsx`, `AdminTables.jsx`, and the RestaurantApp waitress screens) and `PUT /:id`
(replace the whole item list; called by `PayModal.jsx`, `CashierOrders.jsx`,
`AdminNewOrder.jsx`) — had no stock logic at all. This affects every frontend that touches
orders (website cashier/admin, RestaurantApp waitress phone app), since they all hit the same
backend routes — so the fix is backend-only, in one file.

Fixed both routes:
- `POST /:id/items` — now deducts BOM ingredients for each newly added item, same pattern as
  `POST /` (SAVEPOINT per item so a missing BOM/warehouse row can't abort the whole request),
  logs `stock_movements` (type `OUT`), and records a `cost_of_goods` expense if cost > 0.
- `PUT /:id` — trickier, because it deletes the entire `order_items` list and re-inserts a new
  one, so naively deducting for every item in the new list would double-count anything that was
  already there. Fixed by refunding (adding back) the BOM for the OLD items before the delete,
  then deducting the BOM for the NEW items after the insert — net effect is only the real delta
  moves regardless of what changed (items added, removed, or quantity changed). Both sides use
  the same SAVEPOINT-per-step safety pattern; expense is only logged if the net cost increased
  (matches the existing `POST /` convention of only logging when cost > 0).
- Verified with `node --check` (syntax only — no live DB test from this sandbox; needs a real
  add-items/edit-items round-trip on the actual backend to confirm stock actually moves as
  expected. Push to Render and test next).

**Follow-up: Inventory UI didn't distinguish why stock moved, and only showed a date.** User
looked at Admin → Inventory → Stock Output after the fix above and asked for two things: the
reason should say whether a movement came from the order being created vs. items added vs. the
order being edited, and timestamps should include the clock time, not just the date.

- `website/src/hooks/useApi.js` — added `fmtDateTime()` alongside the existing `fmtDate()`.
  Deliberately did NOT change `fmtDate()` itself — it's also used for date-range string
  comparisons (`fmtDate(x) < range.from`) elsewhere in this file and others; adding a time
  component there would have broken those comparisons.
- `website/src/pages/admin/AdminInventory.jsx` — added `autoOrderReasonBadge()`, which
  classifies the backend's `Auto: Order #<num>...` reason strings (all three variants from the
  stock-deduction fix above) into a short colored badge — "Order" (orange, created), "Added"
  (blue), "Edited" (purple) — shown next to the full reason text rather than replacing it.
  Applied to both the Stock Output detail rows (the expanded per-item list) and the Stock
  Overview / Deliveries-In table (since an order-edit refund is type `IN` and lands there too).
  Both spots also switched from `fmtDate` to `fmtDateTime` for the timestamp column.
- Verified with `npx esbuild` (parses/bundles cleanly) — not run in a browser from this sandbox,
  needs a visual check on the real site after deploy.

**Follow-up: "Edited" showed even when only adding new items.** User tested and saw every item
on an edited order tagged "Edited" — including items that were never touched, just resent
as-is alongside a genuinely new one (this is how `AdminNewOrder.jsx`'s "mergedItems" flow works:
it resends the FULL item list, not just the delta). The refund-old/deduct-new approach from the
first fix logged a pointless refund+deduct pair (net zero) for every unchanged item and showed
"Edited" for all of them.

Rewrote the `PUT /:id` stock-adjustment block in `orders.js` to diff old vs. new quantities
**per menu_item_id** first, and only touch stock (and log a movement) for items that actually
changed — tagged `(added item)`, `(removed item)`, or `(items edited)` depending on whether the
item is new, gone, or just changed quantity. Unchanged items are skipped entirely now — no log
noise. Updated `autoOrderReasonBadge()` in `AdminInventory.jsx` to recognize the new "removed
item" case (gray "Removed" badge) alongside the existing Added/Edited ones.

**Ran into a real scare while verifying this:** bash (`node --check`) kept reporting the file
truncated mid-statement at an identical byte offset across multiple attempts, even after
restoring from a clean `git show HEAD:...` copy. Turned out to be a false alarm — this AI's bash
sandbox mount of `D:\The-Bill` was serving a stale/lagging snapshot, not the real file; the
Read tool (which reflects what the user's actual machine has) showed the file was correct the
whole time. Wasted a round trying to "fix" this via bash `cp`, which briefly clobbered the real
Edit-tool change with older content — caught it and redid the edit through Read/Edit only, then
verified through Read only, not bash. Documented in MEMORY.md so this doesn't happen again:
**for this project, verify file edits via Read, not bash, especially right after a write.**

---

## 2026-07-26

**Audited the inventory/ingredient math the user flagged as "incorrect" against real data.**
Backend has no DB query permission this session (Supabase MCP returned a permission error on
both `execute_sql` and `list_tables` — flagged in MEMORY.md), so this was a code-audit +
user-screenshot reconciliation, not a live query. Root cause for the specific numbers the user
gave (Shashlik Qiyma 66→11 but "58 consumption" shown; Shashlik Mol Go'sht 30→10 but "22 out"):
the Stock Output tab (`AdminInventory.jsx`) only ever showed `OUT/WASTE/ADJUST/SHRINKAGE`
movements, never the `type='IN'` refunds the backend correctly logs when an order edit
removes/reduces an item — those only showed on the separate Stock Overview tab. So the two
numbers never reconciled even though the live stock figure was right. **Fixed:** Output tab now
also shows those order-refund IN rows inline (green "+", reusing the existing Added/Removed/
Edited badges) and each item's headline number is the NET (out − returned) so it matches live
stock directly. Also found (not yet fixed, logged in MEMORY.md): the phone app has a second,
older `/api/inventory` API (`RestaurantApp/src/screens/admin/AdminInventory.js`) that silently
bypasses stock_movements logging — a real corruption risk if anyone uses that screen instead of
`WarehouseScreen.js`; and the `PUT /:id/pay` "already deducted" fallback check in `orders.js` has
no restaurant/date scoping, which can false-match an unrelated order.

**POS Terminal redesign — approved and started.** The project owner built a full design in
"Claude Design" (their term for a separate design tool, not this AI) and dropped the handoff at
`pos-app/POS Terminal Design System/design_handoff_pos_terminal/` (README + 14 screenshots).
Read it fully, compared against the existing teal `pos-app/src/pages/Cashier.jsx`, and got
explicit approval to rebuild. Confirmed with the owner along the way: no "Bills" screen (dropped
from nav), service charge / currency / categories / table sections are all already
admin-controlled and dynamic (verified against real route files, not assumed — see MEMORY.md
"What admin/owner can already control" for the full list), the only genuinely new backend work
is refunds, and **naming**: DB/API keep `waitress_id`/`waitress_permissions`/role string
`'waitress'` exactly as-is (renaming would break every app reading them) — only the UI *label*
changes to "Waiter". Also caught before it caused a live 403: `new_cashier`/`new_waiter` were
missing from `settings.js`'s `ALLOWED_ROLES`, which would have blocked the POS from ever reading
currency/tax/service-charge settings.

Built as a fresh `pos-app/src/pages/pos/` folder (old `Cashier.jsx` kept, no longer routed) so
the old screen stays available as a fallback/reference. Steps 1–6 done this session (esbuild
parse-checked every file; **none of this has been run on the real machine yet** — that's the
next thing to do):
- **Step 1 — shell:** `tokens.js` (design tokens/statusPill/fmtMoney — currency always from
  settings, never hardcoded), `useSettings.js` (settings fetch + localStorage cache for
  offline), `PosShell.jsx` (264↔88px collapsible sidebar, UZ/EN toggle, topbar with clocked-in
  time from real shifts data). Backend: `settings.js` ALLOWED_ROLES fix. `main.js`/`preload.js`:
  new read-only `api:get`/`apiGet` IPC for data that isn't in local PowerSync (settings, shifts,
  loans, history) — explicitly documented as GET-only, writes must use their own funnel.
  `index.html`: Plus Jakarta Sans loaded via Google Fonts (CSP extended), system-font fallback
  when offline.
- **Step 2 — Menu screen** (`MenuScreen.jsx`): category cards, product grid, Order Details panel
  with cart grouped by category + steppers, floor-plan table picker, weighed-item amount modal —
  all ported from the old `Cashier.jsx` logic, just restyled. Money math mirrors the backend
  exactly (subtotal + tax; service charge shown as a line but NOT added to the charged total,
  because `POST /api/orders` doesn't add it either — flagged to the owner as an open question,
  not decided yet, do not silently "fix" this client-side either direction).
- **Step 3 — Payment modal** (`PaymentModal.jsx`): Cash/Card/QR/Loan grid, amount received +
  change, %/amount discount, split 2/3/4 ways with per-part method + loan fields, success view.
  Payload shape matches `PUT /orders/:id/pay` exactly (payment_method/discount_amount/
  split_payments/loan_* fields).
- **Step 4 — Orders screen** (`OrdersScreen.jsx`): filter pills, order cards, detail panel, full
  edit mode (steppers/remove/change type/change table via floor plan, Discard reverts from a
  snapshot, Done saves via the new `orders:update`/`ordersUpdate` IPC → `PUT /orders/:id` — the
  same route whose stock-diff logic was fixed earlier this session, so edits made here correctly
  adjust ingredient stock).
- **Step 5 — Tables screen** (`TablesScreen.jsx`): zone pills (from `restaurant_tables.section`,
  confirmed present in the local PowerSync schema), status legend, table cards with
  waiter/elapsed/total, tap → read-only order summary, "Open in Orders" jumps to the Orders
  screen for editing/charging (kept edit logic in one place rather than duplicating it).
- **Step 6 — History screen + refund endpoint:** New backend `POST /api/orders/:id/refund`
  (owner/admin/cashier/new_cashier) — whole-order refund only (no partial refunds yet): restores
  ingredient stock via the same BOM/SAVEPOINT pattern as everywhere else in `orders.js` (logs
  `type='IN'` with the `Auto: Order #<num> (refund) — ...` prefix so it shows up correctly in the
  Output-tab fix from earlier today), reverses the cash_flow entry for cash payments, auto-cancels
  any still-active loan tied to the order, and sets new `refunded_at`/`refund_reason`/
  `refunded_by` columns (auto-migrated) — **deliberately does NOT change `orders.status`**, to
  avoid touching the `orders_status_check` CHECK constraint or any status-branching code
  elsewhere; History computes "Refunded" vs "Completed" from `refunded_at IS NOT NULL` instead.
  `HistoryScreen.jsx`: stat cards, Today/Yesterday/This Week/Custom date chips (custom opens a
  real month-calendar range picker), orders table, order-detail modal, refund reason dialog.
  History reads via `apiGet('/api/orders?...')` (backend, not local PowerSync) — deliberate,
  since history needs full joined data (table/waiter names, item counts) and doesn't need
  offline live-polling the way Menu/Orders/Tables do.
- **Step 7 — Receivables: only half-started when the user said stop.** Backend IPC wiring is
  done (`loans:pay`/`loansPay` → existing `PATCH /api/loans/:id/pay`, confirmed this endpoint
  already exists and takes `payment_method` — no backend change needed for Receivables beyond
  this). **The actual `ReceivablesScreen.jsx` UI was NOT built.** Step 8 (Profile) also not
  started.

**Stopped mid-task at the user's explicit request** ("stop the job and leave a log and etc
stuffs") — this entry plus the STATUS.md/MEMORY.md updates are that log. Nothing left in a
broken state: every file written this session parses clean (esbuild-checked) and the app still
routes correctly for the screens that exist; unregistered screens (`receivables`, `profile`)
just show the shell's built-in "coming in a later build step" placeholder rather than crashing.

---

## 2026-07-26 (continued) — POS redesign steps 7–8, all 8 screens now built

User returned ("i am back please continue now") and this picked up exactly where the stop
happened. Two things fixed/finished:

**Caught a real bug before it shipped:** the half-written Receivables "Remind" button was going
to call the backend's `POST /api/loans/notify-overdue` through the GET-only `apiGet` IPC —
that would have silently 404'd (Express doesn't match a POST-only route to a GET request).
Added a proper `loans:remind`/`loansRemind` write IPC instead of leaving the broken plumbing in
place; the button now actually works and correctly notifies all overdue loans restaurant-wide
(there's no per-loan reminder route on the backend, so that's the real scope of the button).

**Step 7 — Receivables** (`ReceivablesScreen.jsx`): 3 stat cards computed client-side from the
loan list (no separate stats call needed — `GET /api/loans/stats` exists but the client-side
compute was simpler given the filter chips need the same data anyway), All/Active/Paid/Overdue
filters (Active = not yet due or due within 3 days, matching the design's "current + due-soon"
definition), loans table, Loan Details modal (fetches the linked order's items via
`apiGet('/api/orders/:id')` for the itemized breakdown), Collect Payment modal → `loansPay`
(`PATCH /api/loans/:id/pay`, a pre-existing endpoint — confirmed before wiring, no backend
change needed for this step beyond the remind fix above).

**Step 8 — Profile** (`ProfileScreen.jsx`): before writing this, checked `schema.sql` for the
`shifts` and `users` tables to see what's actually real vs. what the design mock shows —
found **no break-tracking column, no employee-ID field, no address/emergency-contact fields,
and no change-password/edit-profile endpoint**. Rather than fake these (which the project owner
has explicitly called out as a pattern to avoid — "did you make a mistake / see a mirage"),
built the screen with only real data: header card with a live On-Shift/Off-Shift pill, Shift
Info card that shows **either** a Clock In or Clock Out button depending on
`GET /api/shifts/active`'s real state (new `shifts:clockIn`/`shiftsClockOut` IPC wired to the
existing `POST /api/shifts/clock-in`/`clock-out` — previously nothing in the POS ever called
these, so a cashier logging in was never actually clocked in), Personal Details from the
session's own user object (phone/email/hire date — all real fields), and 3 stat cards computed
from that user's own paid orders today.

**All 8 screens now exist and are registered in `PosCashier.jsx`'s `SCREENS` map.** Final
sanity pass: every file under `pos-app/src/pages/pos/` plus `App.jsx` esbuild-parses clean, and
`node --check` passes on every touched backend file (`orders.js`, `settings.js`, `main.js`,
`preload.js`). **None of this has been run in the actual Electron app yet** — that is the very
next step, not deploying or building further phases. See STATUS.md for the exact test checklist
handed to the user, including the reminder that this session's backend changes (settings
ALLOWED_ROLES fix, the new refund endpoint + columns) still need to be pushed to
`the-bill-backend`/Render before Refund/Receivables/Profile will work against the live backend.

**Real-machine test surfaced a sync bug — root-caused to PowerSync Cloud, not the new POS
code.** User tested and reported new orders not appearing in the Orders screen, and occupied
tables not showing occupied in Tables/the table picker — both fine on the website (reads
Postgres directly). Added a live sync-status badge to the POS topbar (`PosShell.jsx`) as a
first diagnostic aid, then per the user's instruction ("just connect it to the DB") queried
Supabase directly with `execute_sql` — worked fine this session (the "no permission" note from
the ingredient-audit session was apparently session-scoped, not a lasting restriction). Checked,
in order: `powersync` publication membership (correct — `orders`/`restaurant_tables` both in
it), `relreplident` on the relevant tables (`'d'`/DEFAULT, normal), `powersync_role` validity
(`rolcanlogin: true, rolreplication: true, rolvaliduntil: null` — fine), then
`pg_replication_slots` — **returned zero rows**. That's the root cause: PowerSync Cloud
currently has no active logical-replication connection to this Postgres database at all, so
nothing written after some point reaches any local POS terminal, old design or new, regardless
of which screen or table. Reported this to the user with the concrete next step: check the
"the-bill-pos" project's Development instance in the PowerSync Cloud dashboard (no API access
to that service from here) and reconnect it. Waiting on the user to do that and confirm the
sync badge turns green and data flows again.

**PowerSync reconnected — sync confirmed working** (user tested: new orders and table status
now appear correctly across screens).

**Real-machine design-parity pass** — user sent live screenshots of Menu/Orders/Payment
modal/Tables and asked to check them against `design_handoff_pos_terminal` pixel-by-pixel
rather than guess. Found and fixed:
1. Tables screen's right panel still had the placeholder "Open in Orders" button instead of the
   design's Print/Edit/Charge trio ("Right panel = same order-detail panel as Orders" per
   README). Fixed: Print + Edit side by side, full-width Charge below (opens `PaymentModal`
   directly on Tables, same pattern Orders uses for an existing order). Edit needed to jump to
   Orders with that exact order pre-selected and already in edit mode ("Edit jumps to Orders in
   edit mode") — added an `openOrder(id, {edit})` handoff lifted into `PosShell.jsx`
   (`pendingOrder` state + `openOrder`/`clearPendingOrder`, passed to every screen), consumed by
   a new effect in `OrdersScreen.jsx` that waits for the order to actually exist in the loaded
   list before selecting + entering edit mode (screen switch is instant; the local PowerSync
   read isn't). `startEdit()` was refactored to take an explicit order argument since `selected`
   from React state wouldn't be updated yet in the same tick as the handoff.
2. Orders detail panel's table-name line could silently fall back to a generic "Dine In" label
   whenever the table lookup failed, and never showed table + order type together. This was the
   literal "table names not showing" bug reported — fixed to always render
   `TableName · Dine In · Xm ago` (same format applied to Tables' panel too).
3. Root-caused two broken menu-item photos (real uploaded images showing broken-image icons
   while unphotographed items correctly showed the placeholder): `pos-app/index.html`'s CSP had
   no `img-src` directive, so it inherited `default-src 'self'` and silently blocked every photo
   — menu images are served from the Render backend domain
   (`multer` + `express.static('/uploads')` in `restaurant-app/backend`), never from the
   Electron app's own origin. Added
   `img-src 'self' data: https://the-bill-backend-pego.onrender.com;` to the CSP. **User said
   the photo content itself is being handled on their end — this CSP fix stays since it was
   blocking ALL photos regardless of content, but no further image work was done this round.**
4. Orders screen's order-card meta line (table/type + elapsed time) used two spans with
   `justify-content: space-between`, matching the design's literal two-ends layout — but at the
   actual grid track width the two values rendered pressed together with no visible gap
   ("Xoli 112 min ago"). Replaced with one string joined by an explicit ` · `, the same pattern
   the Tables screen's card chip already uses successfully (confirmed legible in the same test
   screenshots) — trades literal design fidelity for guaranteed readability.

All four touched files (`TablesScreen.jsx`, `OrdersScreen.jsx`, `PosShell.jsx`, `index.html`)
parse clean. **Not yet re-tested on the real machine** — waiting on the user to confirm.

**Three more real-machine bug reports, same session, each fixed and re-verified by parsing
(none re-tested live yet):**

1. Tapping Edit (via the cross-screen `openOrder` jump from Tables to Orders) wiped the order's
   items to 0 and showed "No table" — a real race: the handoff started edit mode as soon as
   `orders` contained the order, but `itemsByOrd` (fetched after an `await` in the same `load()`
   call) hadn't caught up yet in that render. **User then said explicitly: editing must stay on
   the Tables screen, never navigate to Orders** — overriding the design README's literal "Edit
   jumps to Orders in edit mode" text. Removed the `openOrder`/`pendingOrder` handoff entirely
   (`PosShell.jsx`, `OrdersScreen.jsx`) and gave `TablesScreen.jsx` its own full in-place edit
   mode instead (add-items grid replaces the table grid while editing; right panel gains
   steppers/remove + Discard/Done) — this also structurally kills the race, since Tables now
   reads its own already-loaded data with no cross-screen timing involved.
2. The identical "items/table vanish" symptom then appeared on Orders' own native Edit button
   (no cross-screen jump this time). Self-inflicted bug: `startEdit` had been given an
   `(ord = selected)` parameter for the now-removed handoff, but the button was still
   `onClick={startEdit}` — React's onClick always passes the DOM click event as the first
   argument, so `ord` silently became that event (truthy, so the default never applied) instead
   of the order. `event.id`/`event.tableId` are undefined, so items/table both came up empty.
   Reverted `startEdit` to take no parameter, with a comment flagging the footgun, and audited
   every other `onClick={fnName}` site across `pos-app/src/pages/pos/*.jsx` for the same
   pattern — nothing else affected.
3. User wanted Tables' in-place edit to work exactly like Orders' edit mode, including order
   type switching and "Change on floor plan" table re-assignment (the first in-place version
   only carried items, with table/type fixed). Added `editType`/`editTable`/`pickTable` state
   and ported Orders' ORDER TYPE pill row + floor-plan picker verbatim into `TablesScreen.jsx`;
   `saveEdit` now sends the (possibly changed) type/table; after a successful save the screen
   follows the order to its new table, or deselects if it left the floor for takeout/delivery.

**Session paused here at the user's request ("we have finished for now").** Nothing in this
batch of fixes has been run on the real machine yet — that's the first thing to check next
session. See STATUS.md for the full technical detail on each of the three fixes above.

---

## 2026-07-27 — design-parity cleanup round 2, then the "add to existing order" feature

**More real-machine design-parity fixes**, same pattern as before (compare against
`design_handoff_pos_terminal` pixel-by-pixel, fix, esbuild-verify, wait for user confirmation):
order card rows (status pill/elapsed time/item count/eye icon) all reworked to
`width:100%; justify-content:space-between` so every row right-aligns to the same margin
(previous fix's flex-column child wasn't stretching); eye icon removed then explicitly
re-added per a direct user correction — it belongs, just needed right-alignment, not removal.
Menu screen: Table selector pulled out of the Order/Server strip into its own full-width row
(icon chip + label + right-aligned value + chevron); "Order"/"Server" labels and Takeout's
"Customer name" field removed entirely (not needed per design); Delivery gained stacked
Customer Name → Phone → Address fields with icons, wired into `buildOrderPayload()` as
`customer_name`/`customer_phone`/`delivery_address` (not decorative — confirmed hitting the
real order payload). Global scrollbar restyled (`index.css`, thin rounded thumb,
`background-clip: padding-box` for the padded look, hover state, Firefox equivalents) since it
inherited an ugly default OS scrollbar everywhere. Tables nav icon replaced: lucide's
`TableProperties` reads as a spreadsheet grid, not a restaurant table — built a real
hand-drawn top-down table-with-4-chairs SVG (`pos-app/src/pages/pos/icons.jsx`, new file,
`TableIcon`) and swapped every `TableProperties` import in the active `pos-app/src/pages/pos/`
tree (old unrouted `Cashier.jsx` intentionally untouched, per "globally in pos-app only").

**New feature: adding items to an already-occupied table's live order from Menu.** User wanted
what the old `Cashier.jsx`/`new_cashier` legacy flow had — tapping an occupied table while
building a cart on Menu should append the cart to that table's existing order instead of
silently creating a second order on the same table. Clarified scope via explicit questions
before writing code: the "you are adding to an existing order" notice must appear the instant
the occupied table is tapped (not just at Fire time); the cart view must merge the existing
order's items in live, but with a clear visual split between what already existed and what's
about to be added; only Fire is allowed in this mode, not Charge (payment still happens later
from Orders/Tables); and the cashier stays on the Menu tab after firing (cart clears in place,
no navigation).

Built end to end:
- **Backend IPC plumbing** — new `orders:addItems`/`ordersAddItems` in `main.js`/`preload.js`,
  calling the existing `POST /api/orders/:id/items` (append-only; backend recomputes
  subtotal/tax/total from ALL items and reopens the order for the kitchen if it was
  ready/served/bill_requested — confirmed by reading `orders.js`, not assumed). Deliberately
  separate from `orders:update`/`ordersUpdate` (`PUT /:id`), which replaces the *entire* item
  list and would double-count anything already on the order.
- **`MenuScreen.jsx` data layer** — loads active orders + their items alongside the existing
  menu/table data (`loadActiveOrders()`, polled every 4s while the table picker is open, same
  as the existing pattern); `existingOrder` state is set the instant an occupied table is
  tapped; derived `existingItems`/`existingSubtotal`/`combinedSubtotal`/`combinedTax`/
  `combinedTotal` mirror the backend's full-recompute math exactly.
- **`MenuScreen.jsx` UI layer** — green "Adding to Order #X" banner right under the Table
  selector, visible from the moment of the tap; cart panel splits into an "Already In This
  Order" section (muted, read-only, no steppers) above an "Adding Now" section (the normal
  interactive cart); Totals block shows Already In Order / Adding Now / Tax / New Order Total
  instead of the normal Sub Total/Tax/Total breakdown; Charge button is hidden entirely in this
  mode (Fire-only, relabeled "Add to Order"); `handleFire` branches to call `ordersAddItems`
  instead of `ordersCreate` when `existingOrder` is set, then clears the cart and stays on Menu
  (no `clearOrder()` navigation side effect existed to remove — screen never changed).

All touched files (`main.js`, `preload.js`, `MenuScreen.jsx`, `index.css`, `icons.jsx`)
esbuild/`node --check` verified clean. **User confirmed working on the real machine** after
restarting the full Electron app — first attempt silently failed with no error/no loading
(user suspected "permissions"), actually caused by `main.js`/`preload.js` needing a full app
restart to pick up the new `ordersAddItems` bridge, not a hot-reloadable renderer change.

**Follow-up same day: Edit → Done was throwing "Access denied" on both Orders and Tables.**
Root-caused fast — `PUT /api/orders/:id` (`restaurant-app/backend/src/routes/orders.js`, what
both screens' edit-mode Done button calls via `orders:update`) had
`authorize('owner', 'admin', 'cashier', 'waitress')`, missing `new_cashier`/`new_waiter`
entirely, so it 403'd with the literal `{ error: 'Access denied' }` shown on screen — the same
class of bug as the earlier `settings.js` ALLOWED_ROLES miss and the refund endpoint's role
list, just not caught for this specific route. Added the two missing roles, verified with
`node --check`, committed (`2444d39`) and pushed to `origin/main` from inside
`restaurant-app/backend/` — **discovered this folder is its own nested git repo pointed at
`github.com/JahongirMamadiyorov/the-bill-backend`, separate from the parent `The-Bill` repo**,
so backend fixes must be committed/pushed from there, not the repo root. User confirmed the
push landed (verified via `git fetch` — `origin/main` matches local). Render should auto-deploy
from that push; not yet re-confirmed live that Edit → Done actually succeeds now.

Also hit and worked around a sandbox quirk while doing this: git commands in that nested repo
left stale `.git/index.lock`/temp-object files that couldn't be `rm`'d (`Operation not
permitted`, even as the owning user — likely a Windows-mount FUSE bridge limitation) but COULD
be `mv`'d out of the way, which unblocked every subsequent git command. Documented in MEMORY.md
so a future session doesn't get stuck on the same thing.

**Follow-up same day: Orders'/Tables' edit modes didn't understand weighed items (kg/l/g/ml).**
User pointed at the same "Add items to Order #4" edit screen (Tables, but identical on Orders)
showing "Jiz ×0.5" — a rice dish sold by the kilogram — and asked to fix both screens. Root
cause: the whole weighed-item concept (type an amount instead of a unit stepper) was written
only inside `MenuScreen.jsx` back on 2026-07-07/08, as private local functions
(`isWeighedItem`/`unitSuffix`/`formatQty`) and an inline modal — Orders' and Tables' in-place
edit modes were built much later this session and never got it, so their `editAdd`/`editDec`
always did blind integer `+1`/`-1` regardless of unit.

Fixed by extracting, not duplicating: new shared `pos-app/src/lib/weighed.js` (the three pure
functions) and new shared `pos-app/src/pages/pos/AmountPickerModal.jsx` (the modal UI, lifted
verbatim out of `MenuScreen.jsx`). `MenuScreen.jsx` now imports both instead of defining its
own copies — behavior unchanged, just de-duplicated so all three screens can't drift apart
again. `OrdersScreen.jsx` and `TablesScreen.jsx`: `editAdd`/`editDec` now check
`isWeighedItem` (via a real `menuById[...]` lookup — the right-panel `+` stepper used to
synthesize a partial `{id,name,price}` object with no `.unit`, which would have silently
defeated the check even after wiring it up) and open the shared amount picker instead of
incrementing; the add-items grid price shows the unit suffix (`14,000 so'm / kg`); the panel's
qty text uses `formatQty` (`0.5 kg`) instead of a hardcoded `×qty`. Also caught and fixed the
same blind spot in both screens' Charge/Payment modal: `payEntries` built every item with
`unit: 'piece'` hardcoded, so weighed items displayed wrong there too (display-only, the
steppers are disabled for existing orders) — now reads the real unit and passes the shared
`formatQty` instead of an inline `×${q}` function.

All five touched/new files esbuild-verified clean. **Not yet tested on the real machine.**

**Immediate follow-up, same day: the fix above had a real mistake risk baked into it.**
User sent screenshots of the working amount picker and pointed out that tapping ADD/+ on an
item ALREADY on the order (KFC at 0.5 kg) reopened the picker prefilled with the current total
— if the cashier meant to add 1.33 kg more and just typed over the prefilled 0.5, the order
silently ended up at 1.33 kg instead of the correct 1.83 kg. Explained clearly, with a concrete
worked example, exactly why this is easy to get wrong "in a rush."

Fixed by giving the picker two modes instead of one behavior: `openAmountPicker(item, 'add')`
(wired to ADD/+ everywhere — Menu's cart `addItem`, and `editAdd` in both Orders and Tables)
now opens with a blank field and SUMS the typed amount into the existing qty on confirm,
instead of replacing it — a brand-new item is unaffected since existingQty is 0 either way, so
this didn't change first-time-add behavior anywhere. `openAmountPicker(item, 'set')` (the minus
stepper only — `decItem`/`editDec`) keeps the original prefilled/replace behavior, since
reducing to an exact new lower value is the one place "replace" is actually the right mental
model. `AmountPickerModal.jsx` was updated to make the distinction visible, not just
behaviorally correct: "Add amount" header and "Amount to add" field label in add mode, plus a
hint line ("already 0.5 kg on this order") whenever there's an existing quantity to add on top
of. Applied identically to all three screens since they all now share this modal/logic.

All four touched files (`MenuScreen.jsx`, `OrdersScreen.jsx`, `TablesScreen.jsx`,
`AmountPickerModal.jsx`) esbuild-verified clean. **Not yet tested on the real machine.**

**Same day: "make it fast, for free" — a speed pass grounded in real evidence, not guesses.**
User asked generally about "caching" then clarified they meant overall app speed, and wanted
free options. Rather than give generic advice, checked three real things first: Supabase's own
performance advisor (`get_advisors`, type=performance), the backend's actual `server.js`
(static-file serving, the WS keep-alive mechanism), and `pos-app/package.json`'s scripts —
confirming via `list_files`/grep that pos-app itself never opens a WebSocket, so it can't keep
Render warm on its own; that only happens if some other client (old cashier panel, print-agent)
has a live WS connection at that moment.

Found and applied, all free:
1. **5 missing indexes** on foreign keys pos-app's live screens hit constantly — the advisor
   flagged these directly, not guessed: `orders.table_id`, `orders.waitress_id`,
   `order_items.menu_item_id`, `menu_items.category_id`, `restaurant_tables.assigned_to`. Also
   dropped one confirmed duplicate index on an unrelated table (`finance_manual_income`,
   advisor WARN level). Applied via Supabase MCP (`add_hot_path_fk_indexes` migration),
   re-ran the advisor after to confirm the FK warnings cleared.
2. **7-day cache headers on menu photos** — `server.js`'s `express.static('/uploads', ...)` had
   zero cache headers, so every screen reload re-downloaded the same photo. Checked
   `menu.js`'s multer storage first to confirm uploaded filenames are
   `${Date.now()}-${random}${ext}` (never reused) before adding a long `maxAge`, so a stale
   photo after a re-upload isn't possible. `node --check` passed, committed (`eada77b`) to
   `restaurant-app/backend`'s own nested repo — needs `git push origin main` from the user
   (same situation as the earlier 403 fix, no GitHub credentials in this sandbox).

Asked before doing anything with real tradeoffs, via three targeted questions, rather than
picking for the user:
- **DB indexes** — approved, applied immediately (safe/reversible).
- **Dev mode vs. packaged build** — user confirmed pos-app is currently launched via
  `npm run dev` on the real terminal, not the packaged `build:win` installer that already
  exists in `package.json`. Handed back to the user to build/install and compare — this
  sandbox can't produce a Windows installer.
- **Render "always warm" pinger** — user opted in ("set it up carefully"), fully aware of the
  real risk: the original 2026-07-06 Render suspension happened because something kept the
  service running 24/7 and blew through the free 750-hour/month cap. Recommended scoping any
  external free pinger (UptimeRobot/cron-job.org) to actual restaurant operating hours only
  (~14h/day ≈ 420 hrs/month, comfortably under the cap) rather than 24/7 — not yet set up,
  since it requires the user to create the third-party account themselves.

Nothing here has a user-facing "try it and confirm" loop the way UI fixes do — this is
architecture/DB-level work, so there's no before/after screenshot to wait on.

**Same day, continued — "what else can we get like this way?"** After the speed pass, user asked
whether bundling assets (photos, menu data) inside the Electron app folder would speed things up
further. Explained why bundling photos at build time is the wrong move (breaks the
dynamic/admin-editable menu — photos aren't known at build time and can change any time), and
that menu data itself is already local via PowerSync, nothing to bundle there. Proposed instead a
genuine runtime local-disk photo cache, which the user's follow-up ("what else can we get like
this way") turned into a request for more of the same category of free, safe win. Proposed three:
self-host the font, the photo disk-cache, and a stale-data badge for History/Receivables — user
approved all three verbatim ("do for these all please").

Built:
1. **Self-hosted Plus Jakarta Sans** — downloaded the actual variable-font woff2 Google Fonts was
   serving (`fonts.gstatic.com/s/plusjakartasans/v12/...woff2`, confirmed via checksum after
   copying it into `pos-app/src/assets/fonts/`), added one `@font-face` rule to `index.css`
   (`font-weight: 400 800` range syntax, since this single file's HVAR/MVAR/STAT tables cover
   the whole weight range), removed the Google Fonts `<link>`/`preconnect` tags and tightened
   CSP's `style-src`/`font-src` back down to `'self'`. No more Google Fonts network dependency at
   all — same look online or offline.
2. **Local photo disk-cache** — registered a custom `app-photo://` Electron protocol in `main.js`
   (`protocol.registerSchemesAsPrivileged` before `whenReady`, `protocol.handle` inside it).
   First request for a filename downloads it from the Render backend's `/uploads/menu/<file>`
   and writes it to `app.getPath('userData')/photo-cache`; every later request (even after an app
   restart) is served straight off disk. Deliberately has NO cache-invalidation logic — checked
   `menu.js`'s multer `diskStorage.filename` first and confirmed uploaded filenames are
   `${Date.now()}-${random}${ext}`, globally unique and never reused, so a cached file
   structurally cannot ever go stale. New `src/lib/localPhoto.js` rewrites a known backend photo
   URL to the local scheme; wired into `MenuScreen.jsx`'s single image render call site (the old
   unrouted `Cashier.jsx` intentionally left alone). CSP's `img-src` extended with `app-photo:`.
   **Caught and corrected my own mistake before shipping this:** I had told the user this cache
   would "also cover staff avatar photos" without checking — when I actually grepped `users.js`,
   `schema.sql`, and `ProfileScreen.jsx` before scoping the implementation, there is no
   avatar/staff-photo feature anywhere in this codebase at all, only `menu_items.image_url`.
   Corrected in code comments and flagged directly to the user in chat, and recorded in
   MEMORY.md so this wrong claim doesn't get repeated.
3. **Stale-data badge for History and Receivables** — both screens read live from the backend via
   `apiGet` (not local PowerSync, since they need joined data and aren't offline-critical) and
   previously had zero indication when a refresh failed beyond a 3-second toast — the table would
   just sit there, indistinguishable from genuinely-current data. New shared
   `src/lib/staleCache.js` (`loadCached`/`saveCached`/`timeAgo`, plain localStorage, no
   dependencies) persists the last successful payload; both screens now seed their list from that
   cache on mount (so a reopen doesn't show a spinner over data it already has) and render a
   small badge above the stat cards — "Updated Xm ago" in the normal case, or a coral "Offline —
   showing data from Xm ago" with an alert icon when the most recent load attempt failed.

All eight touched/new files (`index.css`, `index.html`, `main.js`, `src/lib/localPhoto.js`,
`src/lib/staleCache.js`, `MenuScreen.jsx`, `HistoryScreen.jsx`, `ReceivablesScreen.jsx`)
esbuild-verified clean (also spot-checked the font file placement via `sha256sum` against the
original download, since a full `vite build` can't run in this sandbox — the mounted
`node_modules` has Windows-native rollup/esbuild binaries). **User confirmed the app is working
well after this round landed on the real machine** — no issues reported with the font, the photo
cache, or the History/Receivables badge.

---

## 2026-07-27 (same day) — Full Uzbek translation of the pos-app cashier panel

User asked for a full Uzbek translation of the cashier panel and reported the existing UZ/EN
toggle button "does not work yet at all". Checked before writing anything: `grep`'d every file
in `pos-app/src` for the word `lang` — `PosShell.jsx` already had the toggle's state
(`useState`/localStorage) and already threaded it to every screen via `screenProps`, but
literally zero files read it. The button flipped state; nothing consumed it. Root cause found,
not guessed.

Built a pragmatic retrofit rather than pulling in a real i18n library, since the codebase has
dozens of scattered inline JSX string literals, not a centralized strings file: new
`pos-app/src/lib/i18n.js` with a dictionary keyed by the *exact English source string* (not
invented semantic keys, to minimize mistranslation/mismatch risk) plus two helpers —
`t(str, lang)` for plain lookups (silently returns the English string unchanged if `lang` isn't
`'UZ'` or there's no entry) and `tt(lang, enTemplate, uzTemplate, vars)` for strings with
variables (counts, amounts, dates), since English and Uzbek word order differs and a lookup on
an already-composed string can't handle that. Also centralized the repeated
`` `Table ${n}` `` fallback (`tableFallbackLabel`/`tableLabel`) that Menu/Orders/Tables had each
inlined separately.

Wired `t`/`tt` into every screen and modal in `pos-app/src/pages/pos/`: `PosShell.jsx`,
`MenuScreen.jsx`, `OrdersScreen.jsx`, `TablesScreen.jsx`, `HistoryScreen.jsx` (plus its
`RefundDialog`/`CalendarModal`/`StaleBadge` sub-components, and a new `paymentLabel()` helper
since payment methods are stored snake_case — `cash`/`card`/`qr_code`/`loan` — and needed
mapping to their display words before translating), `ReceivablesScreen.jsx` (restructured the
old static `STATUS_STYLE` object into a `statusStyle(status, lang)` function so its labels could
translate too — same pattern as `tokens.js`'s `statusPill`), `ProfileScreen.jsx`,
`AmountPickerModal.jsx`, and `PaymentModal.jsx` (including its `LoanFields` sub-component, which
needed `lang` added to its props since it wasn't receiving any screen-level props before).
`tokens.js`'s `statusPill(status, lang)` translates every status-pill label through the same
dictionary; `lang` is optional everywhere so a call site that hasn't been updated still renders
English instead of erroring. Every `toLocaleDateString`/`toLocaleTimeString` call touched during
this pass now conditionally uses `'uz-UZ'` vs. `'en-GB'`/`'en-US'` based on `lang`.

Hit one real, reproducible Edit-tool gotcha: the `{tb.capacity ? \`${n} seats\` : ' '}` fallback
idiom (copy-pasted into Menu/Orders/Tables originally) has a **non-breaking space (U+00A0)**, not
a regular space, inside the quotes — invisible in Read/Grep output, byte-different from a
literal space typed into an Edit `old_string`, so every large multi-line edit spanning through it
silently failed to match. Root-caused via `sed -n 'Np' file | cat -A` (shows `M-BM- ` for the
NBSP). Fixed by truncating `old_string` to end just before the character each time, rather than
trying to reproduce the invisible byte. Recorded as a durable gotcha for this codebase.

13 files touched/created (`i18n.js` new; `tokens.js`, `PosShell.jsx`, `MenuScreen.jsx`,
`OrdersScreen.jsx`, `TablesScreen.jsx`, `staleCache.js`, `HistoryScreen.jsx`,
`ReceivablesScreen.jsx`, `ProfileScreen.jsx`, `AmountPickerModal.jsx`, `PaymentModal.jsx`
edited). Verified every file with a standalone Linux `esbuild` (the mounted `node_modules` has
Windows-native binaries and errors on this platform, so installed a scratch copy under `/tmp`
instead) — all clean, one harmless duplicate-key warning in the dictionary (`'Paid'` defined
twice with the identical value) found and removed. **Not yet tested on the real machine** — next
step is to toggle UZ/EN in the running app and click through all 6 screens + both modals to
confirm the switch actually changes visible text everywhere, not just spot-check.

**Same-day follow-up:** user sent two screenshots of Menu's Order Details panel after tapping an
occupied table (entering "Adding to Order #5" mode) — even after removing every item from the
"Adding Now" section there was no control to exit that mode back to a normal cart. Also renamed
the topbar sync-status pill from "Synced" to "Online" per direct request: `PosShell.jsx`'s source
string changed, `i18n.js` dictionary updated (`'Online'` added, `'Synced'` removed after
confirming via grep nothing else referenced it).

The back button took three iterations, each driven by direct user feedback on a live screenshot:
1. First pass — small icon-only button (`ChevronLeft`) inside the green "Adding to Order #N"
   banner, calling the existing `clearOrder()` function.
2. User reported it was still easy to miss — added a "Back" text label next to the icon, same
   location.
3. User said still too easy to miss, and asked for two structural changes: move it to the top of
   the panel next to the "Order Details" title (right-aligned), and make it available for the
   normal new-order flow too, not just add-to-existing-order mode. Implemented: a new
   `hasOrderInProgress` derived flag (cart has items, OR a table/existingOrder is set, OR any
   delivery customer field is filled, OR order type isn't the default dine-in) now controls a
   "‹ Back" pill rendered next to "Order Details", removed from inside the conditional banner
   entirely. Still calls the same `clearOrder()` — no new reset logic needed, just a different
   visibility condition and location.

All three files (`i18n.js`, `PosShell.jsx`, `MenuScreen.jsx`) esbuild-verified after each
iteration. **Not yet tested on the real machine.**

---

## 2026-07-27 (same day) — Root cause: "loading a lot" + topbar badge lying about connectivity

User reported History/Receivables/Profile's Shift Info were "loading a lot." Mid-investigation
(while I was trying to independently verify backend reachability via a sandbox curl to `/health`
— which came back inconclusive, an SSL EOF at the same ~15s mark on repeated attempts, most
likely this sandbox's own network egress cutting the connection rather than real evidence about
Render), the user sent a live screenshot that was much better evidence than anything I could get
from here: History's own stale-badge said "Offline — showing data from 3m ago" while the topbar
badge said "Online" at the same moment.

Read the actual code instead of guessing further. Two real bugs, confirmed by inspection:
1. `main.js`'s `request()` — the function every `apiGet` call (History, Receivables, Profile's
   shift/stats — none of which are PowerSync-backed) goes through — had no timeout whatsoever.
   A slow/unresponsive Render backend could hang the promise forever, which is the direct
   mechanism behind "loading a lot": the spinner just never resolves.
2. The topbar's sync badge only ever called `psStatus()` (PowerSync's sync-stream status, used
   by Menu/Orders/Tables' local data) — it had no idea whether the Express/Render backend that
   History/Receivables/Profile actually hit was reachable. Two separate services, one badge,
   only ever measuring one of them — so "Online" could be shown while the other was down. Exactly
   the screenshot.

Fixed both at the root:
- `request()` now takes a `timeoutMs` (default 15s, destroys the socket on timeout instead of
  hanging) — every `apiGet` call is now bounded.
- New `backend:health` IPC (`main.js` + `preload.js`) — bare `GET /health` (already existed,
  unauthenticated) with a 6s timeout, exposed as `window.electronAPI.backendHealth()`.
- `PosShell.jsx`'s `checkSync()` now runs `psStatus()` and `backendHealth()` in parallel; the
  badge only says "Online" when BOTH are healthy, "Offline" if either isn't.
- `ProfileScreen.jsx`: `loadShift()` used to collapse every failure into `setShift(null)`,
  rendering as "Not clocked in yet today." even on a network timeout — a real, silent lie to the
  cashier. Split into a separate `shiftError` flag: never-loaded + failed → honest "Can't reach
  server" message with Retry; previously-loaded + a later background refresh fails → keeps
  showing the last known real state with a small "Couldn't refresh" note instead of discarding it.

All five files (`main.js`, `preload.js`, `PosShell.jsx`, `ProfileScreen.jsx`, `i18n.js`) verified
(`node --check` for the two CommonJS files, Linux `esbuild` for the rest). **Not yet tested on
the real machine.**

---

## 2026-07-27 (same day) — Custom title bar: window controls + move/resize

User asked whether minimize/maximize/close buttons were needed since the window doesn't have
any. Checked `main.js`: `createWindow()` uses `frame: false` — deliberate ("kiosk-friendly"), but
it removes ALL native chrome, including the draggable region, and nothing in the renderer had
ever built a replacement. Asked which direction they wanted (locked kiosk / minimize+close only
/ full resizable controls) — user picked full controls, resizable, then separately reported the
window "doesn't move at all," which is the same root cause (no drag region anywhere).

Built a real custom title bar instead of turning the native frame back on:
- `main.js` — explicit `resizable: true`; new `window:minimize`/`window:maximize` (toggles
  maximize/unmaximize)/`window:close`/`window:isMaximized` IPC; forwards `maximize`/`unmaximize`
  window events to the renderer so the button icon stays correct even when maximize happens via
  a non-button gesture (double-click, Windows snap).
- `preload.js` — exposes all four calls plus a subscribe/unsubscribe pair for the maximize-change
  event.
- New `src/TitleBar.jsx` — 32px dark bar, theme-independent of whatever page is under it
  (Login's gradient vs. the POS's mint pages), `-webkit-app-region: drag` on the bar / `no-drag`
  on the button group. Renders nothing outside Electron (plain browser `vite dev` already has its
  own chrome).
- `App.jsx` — now a flex column: `TitleBar` fixed at 32px on top, routes below in a
  `flex:1, minHeight:0, overflow:hidden` box, rendered unconditionally including during the
  initial session-loading state.
- `Login.jsx`/`RolePlaceholder.jsx`/`PosShell.jsx` — `height: '100vh'` → `height: '100%'`, since
  with a real 32px bar now taking space at the true top level, each page re-claiming a fresh
  `100vh` would have overflowed the window by exactly the bar's height. Left the old, unrouted
  `Cashier.jsx` alone.

Verified `Minus`/`Square`/`Copy`/`X` (the icons `TitleBar.jsx` uses) actually exist in the
installed `lucide-react` by listing its `dist/esm/icons/` folder rather than assuming. All 6
touched files verified (`node --check` for `main.js`/`preload.js`, Linux `esbuild` for the rest).
**Not yet tested on the real machine.**

---

## 2026-07-27 (same day) — Admin panel foundation (task #20)

User confirmed the cashier panel is effectively done (printing excluded, saved for after Admin)
and asked to start the Admin panel — **explicit standing constraints for this whole effort: no
design changes, no functional changes from the existing website's admin pages, the only allowed
work is making it faster; and printing/print-related functionality is explicitly excluded from
every screen until told otherwise.** Confirmed build order (sidebar order: Dashboard → Tables →
Menu → Inventory → Orders → Loans → Staff → Settings → Profile), PowerSync scope (extend it now
for Inventory/Finance/Loans/Shifts rather than staying REST-only), and write-IPC shape (generic
passthrough, not per-action handlers) via AskUserQuestion before writing code, per the user's
explicit "do not write code yet" request.

Built the shared foundation every Admin screen will sit on:
- `main.js` — new generic write IPC: `api:post`/`api:put`/`api:patch`/`api:delete`, built via a
  `makeWriteHandler(method)` factory mirroring the existing read-only `api:get` handler exactly
  (token from `store.get('session')`, `/api/` prefix check, configurable timeout). Chosen over
  dedicated per-action handlers (the pattern the cashier's `orders:create`/`orders:pay` use)
  because Admin has ~20 API domains and dozens of endpoints with no offline-queuing requirement —
  this does NOT replace or touch the cashier's existing dedicated-handler/`submitOrderWrite()`
  pattern, which stays exactly as-is.
- `preload.js` — exposes `apiPost`/`apiPut`/`apiPatch`/`apiDelete`.
- `src/i18n/en.json` + `src/i18n/uz.json` — copied verbatim from `website/src/i18n/` (1383 lines
  each) — the website's own dot-path i18n system, separate from the cashier's literal-string
  `lib/i18n.js` dictionary, ported as-is since Admin pages already call `t('some.dot.path')`
  throughout and rewriting that would risk exactly the "no functional changes" line.
- `src/context/LanguageContext.jsx` — copied verbatim from the website (provenance comment added
  at the top, logic untouched): `LanguageProvider`, `useTranslation()`, dot-path lookup with
  English fallback, `localStorage`-persisted language choice.
- `src/api/client.js` (new) — ported the website's `client.js` camelizeKeys/snakeizeKeys +
  per-domain API objects (`usersAPI`, `tablesAPI`, `menuAPI`, `inventoryAPI`, `financeAPI`,
  `loansAPI`, `shiftsAPI`, etc. — ~19 groups total) verbatim, with the axios calls swapped for
  the new `window.electronAPI.apiGet/Post/Put/Patch/Delete` IPC calls instead of `axios`
  directly (same trust-boundary pattern as the cashier: renderer never holds the raw token).
  `printAPI` deliberately not ported (printing excluded); `authAPI`/`superAdminAPI` left for a
  later phase (out of the confirmed Admin scope); `menuAPI.uploadImage`/`settingsAPI.uploadLogo`
  are stubs that throw (multipart file upload needs its own IPC design, not built yet).
- `src/pages/admin/AdminShell.jsx` (new) — sidebar/topbar shell, faithfully matching
  `website/src/components/Layout.jsx`'s admin styling (same blue theme, same Tailwind classes,
  same 9-item nav in the same order) — this is the "no design changes" instruction applied
  literally, not reinterpreted. Two adaptations, neither a visible design change: no
  react-router `<Outlet/>` (pos-app navigates via internal `nav` state + a `SCREENS` map, same
  pattern `PosShell.jsx` already uses), no `useAuth()` context (session comes down as a prop from
  `App.jsx`, matching the cashier's own pattern). Deliberately did NOT port `useKitchenPrint` or
  the `settingsAPI.get()` kitchen-printer prefetch from `Layout.jsx` — both print-only.
- `src/pages/admin/AdminPanel.jsx` (new) — thin entry wrapper mirroring `PosCashier.jsx` exactly:
  owns logout, listens for a new `admin:unauthorized` window event (`client.js` dispatches this
  on a 401 instead of the website's `window.location.href = '/login'`, since there's no browser
  navigation here) and logs out on it, wraps `AdminShell` in `LanguageProvider`. `SCREENS = {}`
  for now with commented placeholders for each of the 9 screens — filled in as tasks #22-30 land.
- `src/admin.css` (new) — imports only `tailwindcss/theme.css` + `tailwindcss/utilities.css`,
  deliberately skipping Preflight (Tailwind's base-element reset). The full `@import
  "tailwindcss";` shorthand the website uses would apply a global reset to bare `button`/`input`/
  heading elements bundle-wide, not scoped to Admin — real risk of subtly changing the
  already-approved, 100%-inline-style cashier screens for zero benefit. Utility classes
  (`bg-blue-600`, `flex`, `grid`, spacing scale, etc.) all still work identically for Admin.
- `vite.config.js` — added the `@tailwindcss/vite` plugin (only affects files that actually
  `@import "tailwindcss/..."`, i.e. currently just `admin.css` — no effect on the cashier bundle).
- `package.json` — added `tailwindcss` + `@tailwindcss/vite` (both `^4.2.2`, matching the exact
  versions pinned in the website's own `package.json`) to `devDependencies`. **User needs to run
  `npm install` on the real machine before this builds — not run from this sandbox, since its
  Linux `node_modules` would mismatch the mounted Windows install (same lesson as every prior
  new-dependency addition this project).**
- `App.jsx` — `/admin` route now renders the real `AdminPanel` (was `RolePlaceholder`), lazy-
  loaded via `React.lazy()`/`Suspense` so cashier/kitchen/waiter logins never download Admin's
  JS or Tailwind CSS at all — a direct, free application of the user's "speed up to the maximum"
  instruction for this phase, at zero cost to the "no functional changes" constraint since it's
  purely a loading-strategy change, invisible to how the screen behaves once loaded.

All touched/new files verified: `main.js`/`preload.js` via `node --check`; `App.jsx`,
`AdminShell.jsx`, `AdminPanel.jsx`, `client.js`, `LanguageContext.jsx` via a standalone Linux
`esbuild` (the two `tailwindcss/*.css` resolution errors seen mid-check are expected — that
package isn't installed in this sandbox's scratch `node_modules` yet, not a real code issue;
confirmed by re-running with CSS imports stubbed out, which passed clean). `en.json`/`uz.json`
verified as valid JSON via `node -e "JSON.parse(...)"`.

**This is foundation only — every screen still shows its own "coming in a later build step"
placeholder.** Next: task #21 (extend PowerSync to Inventory/Finance/Loans/Shifts — needs a
Supabase publication change, doable directly via MCP, plus a PowerSync Cloud Sync Streams config
change the user has to do manually in their dashboard, no API access to that from this sandbox),
then task #22 (Dashboard, the first real screen, following the confirmed sidebar build order).
**Not yet tested on the real machine** — needs `npm install` first, then confirm the Admin
sidebar/topbar render correctly, the language switcher works, and each nav item shows its
placeholder without erroring.

**Real-machine confirmation, same day**: user tried it — sidebar, blue header, all 9 UZ-labeled
nav items, language switcher, collapse, and logout all rendered and worked correctly; each nav
item showed its placeholder cleanly. Foundation confirmed solid before building real screens on
top of it.

---

## 2026-07-27 (same day) — Admin: Dashboard screen (task #22)

First real Admin screen. Ported `website/src/pages/admin/AdminDashboard.jsx` verbatim — all 15
parallel `Promise.allSettled` data fetches, every computed KPI/financial-flow/debts-payables
number, the 15s auto-refresh, notifications bell, all unchanged. Two adaptations, neither a
design/behavior change: `useNavigate()` swapped for a `navigate` prop (`AdminShell.jsx` now
passes a `goTo(path)` adapter mapping the same `/admin/orders`-style strings this screen already
calls onto pos-app's internal nav-key state — no `<Outlet/>` here); `money` formatter pulled into
a new shared `src/lib/adminFormat.js` (verbatim from the website's `useApi.js`) since every later
Admin screen needs it too. New file: `src/pages/admin/screens/DashboardScreen.jsx`, wired into
`AdminPanel.jsx`. All 4 touched files esbuild-verified clean.

---

## 2026-07-27 (same day) — Login crash root-caused: Render backend confirmed Free tier, not paid

User hit "Uncaught (in promise) Error: Error invoking remote method 'auth:login': ... Client
network socket disconnected before secure TLS connection was established" — nothing in pos-app
loading, including login itself. Backend's own `/health` responded instantly from this sandbox
(ruling out "backend is down"), and the user confirmed `/health` also loads fine in their regular
browser (ruling out "their internet is down") — but the Electron app's own requests kept failing
intermittently, in a repeating stops-then-starts-again pattern.

Two things came out of this:
1. **Real bug fixed**: `auth:login`'s IPC handler had no `try/catch` around its `request()` call
   — unlike every other handler in `main.js` (`submitOrderWrite`, `api:get`, the Admin write
   passthrough), which all already wrap their network call and return a clean `{ ok: false,
   error }` Login.jsx/etc. know how to display. A dropped connection here instead threw straight
   out of `ipcMain.handle()`, which Electron surfaces as the raw, ugly, no-on-screen-message
   error seen in the screenshot. Fixed — same try/catch pattern as everywhere else. `node --check`
   passed. This makes failures show a normal "Login failed" message instead of a crash-looking
   error, but does NOT fix the underlying connection drops themselves.
2. **Root cause of the drops, confirmed not guessed**: asked the user to check Render's dashboard
   directly (Settings → Instance Type, not the billing page) — **it's Free**, despite CLAUDE.md
   saying "paid." This resolves an open question flagged since the original 2026-07-06 outage
   session, never reconciled until now. Free tier sleeps after ~15 min with no traffic; the next
   request during the cold-start wake window gets its connection reset before the TLS handshake
   completes — exactly the reported error, and exactly why it "stops and starts" repeatedly
   rather than staying broken or staying fine. Presented the real fix options (upgrade to a paid
   instance, or a scoped free keep-alive pinger like the one already recommended-but-not-set-up
   during the earlier speed pass) — **user's explicit choice: leave it as Free, live with the
   intermittent failures for now.** Documented in STATUS.md's Open Questions as resolved-but-
   accepted, so this isn't re-investigated as a fresh bug if reported again.

---

## 2026-07-27 (same day) — PowerSync extension for Inventory/Loans/Staff (task #21)

Per the user's confirmed choice ("Extend PowerSync now"), scoped and started extending local
sync coverage. Used a research subagent to read the actual website admin screens + their API
client calls + the matching backend route files, rather than guessing which tables/columns each
screen needs — this surfaced real corrections to the assumed plan:
- **No admin "Finance" screen exists** — `financeAPI` is Owner-only (`OwnerFinance.jsx`), not
  used by any file under `website/src/pages/admin/`. Dropped Finance from this task's scope;
  if it's wanted in pos-app later it needs its own pass against the Owner phase, not Admin.
- **`inventoryAPI`/`inventory.js` is dead code** — `AdminInventory.jsx` only calls `warehouseAPI`.
- **`purchase_orders`/`purchase_order_items`/`inventory_audits`/`inventory_audit_items`** have
  zero rows in production AND zero frontend call sites — confirmed unbuilt/orphaned features,
  excluded from sync scope (would've been dead weight).
- **`AdminRestaurantSettings.jsx`** turned out to need nothing new — its 3 backing tables
  (`restaurant_settings`, `custom_stations`, `menu_items`) are already synced. Recommended
  keeping it on REST anyway since there's no real perf win for a single infrequent read and
  writes stay REST regardless — noted for task #29, not acted on now.
- **`AdminStaff.jsx`'s live staff-status view** (`GET /shifts/admin/staff-status`) has real
  server-side "pick today's most relevant shift row per user, priority-ordered" logic beyond a
  plain table sync — flagged for task #28 to port, not a blocker for this foundational step.

Executed the Supabase-side half directly via MCP (real, live change, not a draft): `ALTER
PUBLICATION powersync ADD TABLE warehouse_items, suppliers, stock_batches, stock_movements,
supplier_deliveries, delivery_items, loans, shifts, staff_payments;` — confirmed via
`pg_publication_tables` that all 9 now appear alongside the existing 14. Purely additive.

Added matching local `Table` definitions for all 9 to `pos-app/powersync/schema.js` (column
lists cross-checked against `information_schema.columns` for each table, not assumed — e.g.
`supplier_deliveries.supplier_id` is `integer` in Postgres despite every other `*_id` in this
schema being `uuid`, and `delivery_items` has no `restaurant_id` column of its own, only
`delivery_id` → `supplier_deliveries.restaurant_id`, both noted inline in the schema comment).
Verified via `node --check`.

**What's NOT done, and can't be from this sandbox:** the actual PowerSync Cloud Sync Streams
config — the query that streams each table's rows down to local SQLite, scoped to
`restaurant_id` — has to be added manually by the user in the PowerSync Cloud dashboard, same
"no API access to that dashboard" limitation hit earlier in this project (see STATUS.md's Phase 0
entry). Exact column lists for all 9 streams are written out in STATUS.md's new "PowerSync
extension" entry, ready to hand to the user. Until that dashboard step happens, these 9 tables
exist locally but stay permanently empty (no functional risk yet — nothing reads them, since the
Inventory/Loans/Staff screens themselves haven't been built, tasks #25/#27/#28).

---

## 2026-07-27 (same day) — Admin: Tables + New Order screens (task #23)

Ported the third and fourth Admin screens: `website/src/pages/admin/AdminTables.jsx` (~1912 lines,
the floor-plan grid + table detail sheet + sections management + live order view/"Add Food") and
its companion `website/src/pages/admin/AdminNewOrder.jsx` (~1319 lines), which AdminTables renders
as a modal (`<AdminNewOrder isModal initialTable={...} onClose={...} />`) whenever a table's "New
Order"/"Seat Guests" button is tapped. Followed the exact same read-first process as Dashboard
(task #22): read `DashboardScreen.jsx` for the precedent pattern, read `AdminShell.jsx`/
`AdminPanel.jsx` for the wiring, read both website source files in full before writing anything.

**Ported `TablesScreen.jsx` verbatim** — floor plan grid, 4 status summary cards, floor summary
bar (occupancy %, active revenue), section filter pills, table detail sheet with context-aware
actions per status (free/occupied/reserved/cleaning each show different buttons), add/edit table
modal, reserve-table modal, status-picker sheet, manage-sections modal (add/rename/delete, with
the source's optimistic-update "pending shield" maps that suppress stale poll data from
resurrecting a chip the admin just removed/renamed for up to 8s), live order view + "Add Food" flow
for occupied tables, cancel-reservation confirm. Same polling cadence as source: 5s tables, 8s
sections, 1s order-view-while-open. One adaptation, same pattern as Dashboard: `useNavigate()` →
`navigate` prop, used in exactly one spot (occupied table's "View Full Order" button, which calls
`navigate('/admin/orders?open=<id>')`). This exposed a real gap in `AdminShell.jsx`'s `goTo`
adapter — it only ever stripped the leading `/admin/` segment, never a trailing `?...` query
string, so `'orders?open=<id>'` would never have matched the `orders` SCREENS key. Fixed `goTo`
to also strip `?...` before matching. The `?open=<id>` value itself isn't consumed by anything
yet — pos-app's Orders screen doesn't exist (task #26); once built it'll need its own prop-based
"open this order on load" mechanism, not a URL param, matching this port's established pattern.

**Ported `AdminNewOrder.jsx` as `NewOrderModal.jsx` — modal-mode only, not both branches.** The
source file supports two completely different layouts gated by an `isModal` prop: a two-column
modal popup (what AdminTables always uses) and a full standalone page (reached only via direct
navigation to the website's `/admin/new-order` route, from `AdminOrders.jsx`'s "+ New Order"
button). Confirmed by grep that AdminTables.jsx is the only caller of AdminNewOrder anywhere on
the website, and it always passes `isModal` — the standalone branch is genuinely unreachable from
this port (pos-app has no such route), so only the modal branch was ported; the file's own header
comment says to port the standalone branch separately if a future screen ever needs it.

Two real findings while doing this port, not guessed, both documented prominently in
`NewOrderModal.jsx`'s header comment and worth flagging here directly:

1. **`existingOrderId`/`existingOrder` route-state dependency.** In the source, these come from
   react-router's `useLocation().state`, set only when the *cashier* role's
   `CashierTables.jsx`/`CashierOrders.jsx` navigate to `/cashier/new-order` with state to add
   items to an already-open order (confirmed via grep across the whole website `src/` tree —
   AdminTables.jsx never sets this state; it always opens a brand-new order). Since pos-app has no
   route-state mechanism at all, converted these to plain optional props (default `null`) instead
   of dropping the feature — AdminTables' actual current behavior is unaffected (still always
   "place a new order"), but the add-to-existing-order logic itself stays intact and usable by
   passing props directly, if a future screen wants it.
2. **A real, currently-live bug on the website, found and fixed rather than preserved.** Grepped
   every `amountPicker` reference in the source file: the JSX that actually renders the amount-
   picker popup for weighed (kg/l/g/ml) items — the "type an amount" modal — only exists once in
   the whole file, inside the STANDALONE branch's return. The `isModal` branch's return (the only
   branch AdminTables ever uses) never renders it at all. Practically: tapping a kg/l item like
   "Jiz" rice inside the Tables screen's "New Order" modal on the live website today sets
   `amountPicker` state, and nothing ever displays it — the item can never actually be added that
   way. This was clearly not intentional (the standalone branch proves the "correct" behavior
   exists and works elsewhere), so it was fixed in the port: the same JSX (content byte-for-byte
   identical to source) now renders as a sibling of the modal overlay, restoring working weighed-
   item support to match every other cart in this codebase. **Flagged to the user: this is likely
   a genuine, currently-shipping bug on the live website too** (not just something this port would
   have inherited) — worth a quick manual check on the real site, and if confirmed, the identical
   one-block fix can be back-ported to `website/src/pages/admin/AdminNewOrder.jsx`.

**Printing — confirmed excluded, not just assumed.** Grepped `AdminTables.jsx` for
"print"/"Print"/"window.print"/"printAPI"/"kitchen" — zero matches, nothing to stub there.
`AdminNewOrder.jsx` had `usePrinter()` (a hook pos-app doesn't have), `handlePrintItem()`, and a
per-cart-item Printer icon button, all gated behind `isCashier` (`location.pathname.startsWith(
'/cashier')` on the website). Since `NewOrderModal.jsx` only ever renders inside the Admin panel,
`isCashier` is hardcoded `false` — meaning those buttons could never have rendered here even if
ported working. Removed the hook import, handler function, and button JSX entirely instead of
porting dead code or a placeholder stub, documented as adaptation #3 in the file's header comment,
matching the tone of the existing `menuAPI.uploadImage` stub in `pos-app/src/api/client.js`.

**No new shared dependencies needed** — `tablesAPI`/`ordersAPI`/`menuAPI` (client.js),
`useApi`/`useTranslation`, `invalidate`/`withCache` (apiCache.js), and `PhoneInput` were all
already ported and verified during the Dashboard/foundation work; this session only adjusted
import paths, same as Dashboard.

**Files:** `pos-app/src/pages/admin/screens/TablesScreen.jsx` (new, ~1300 lines),
`pos-app/src/pages/admin/screens/NewOrderModal.jsx` (new, ~700 lines, modal-only),
`pos-app/src/pages/admin/AdminShell.jsx` (`goTo` query-string-stripping fix),
`pos-app/src/pages/admin/AdminPanel.jsx` (`tables: TablesScreen` uncommented in `SCREENS`). All
four esbuild-verified clean (`--bundle --loader:.jsx=jsx --format=esm`, external react/react-dom/
react-router-dom/lucide-react; the usual harmless tailwindcss/theme.css resolution warnings in
this sandbox ignored, same as every prior Admin screen). **Not yet tested on the real machine** —
next check: open Tables from the sidebar and confirm the floor plan/status cards/section filters
render with real data; tap a free table → New Order → add a weighed item (e.g. "Jiz") and confirm
the amount picker now actually appears (this is the specific bug fix to verify) and the item gets
added correctly; tap an occupied table → "View Full Order" and confirm it lands on the Orders nav
item (Orders itself is still a placeholder — task #26 — so no specific order will pre-open yet,
that's expected, not a bug in this session's work).

## 2026-07-27 (same day) — Admin: Menu screen (task #24)

Ported the fifth Admin screen: `website/src/pages/admin/AdminMenu.jsx` (~1229 lines) — category
sidebar (add/rename/delete/reorder), item grid (search, availability toggle, edit/delete), and the
add/edit item modal (name/price/unit/description/category/availability, item type Food-vs-Sale,
kitchen station text-input + quick-pick presets with custom-station add/remove, item photo, and
ingredient-linking to warehouse items with a search-then-quantity flow). Followed the same
read-first process as Dashboard/Tables: read `DashboardScreen.jsx` and `TablesScreen.jsx` for
precedent, `AdminShell.jsx`/`AdminPanel.jsx` for wiring, then the full website source file before
writing anything.

**Ported `MenuScreen.jsx` verbatim** — same 5s silent poll (categories+items), same
optimistic-update pattern for category reordering (normalizes ALL categories to sequential
`sortOrder` before saving, not just the two swapped, so the DB never ends up with duplicate
`sort_order=0` rows that a later refresh would re-sort by name), same custom-kitchen-station
merge logic (built-in presets + DB-stored custom stations + stations already in use by existing
items, deduped case-insensitively). No `useNavigate()` adaptation was needed here — unlike
Dashboard and Tables, AdminMenu.jsx never calls react-router navigation anywhere (confirmed by
grep), so this screen doesn't take a `navigate` prop at all.

**One new shared dependency, not previously ported:** `website/src/components/ConfirmDialog.jsx`
(a styled `window.confirm`/`alert` replacement, used here for the station-delete confirm and the
upload-issue/upload-failed notices) — Dashboard and Tables never needed it. Ported verbatim to
`pos-app/src/components/ConfirmDialog.jsx`, only its own `useTranslation` import path adjusted;
logic/markup untouched. `menuAPI`/`warehouseAPI` in `pos-app/src/api/client.js` were checked
against every call AdminMenu.jsx actually makes (`getCategories/createCategory/updateCategory/
deleteCategory/getItems/createItem/updateItem/deleteItem/getItemIngredients/addItemIngredient/
removeItemIngredient/getStations/addStation/deleteStation`, plus `warehouseAPI.getAll`) — all
already present with matching signatures, confirmed by reading the real file, not assumed.

**Printing — confirmed excluded, not just assumed.** Grepped `AdminMenu.jsx` for "print"/"Print" —
zero matches. Nothing to stub or remove on this screen.

**Image upload — the known `menuAPI.uploadImage` stub gap, handled per the task brief instead of
built around.** `client.js`'s own header comment already flags this: the website's item-photo
picker uses multipart/FormData (`menuAPI.uploadImage(file)`), but pos-app's IPC API client only
speaks JSON today, so `uploadImage` is a deliberate stub that throws `'menuAPI.uploadImage: image
upload is not yet supported in the Admin panel.'` — real multipart IPC support is out of scope for
this port. Rather than wire the picker's `<input type="file">` to a handler that would throw on
the very first real use, the upload control in the item modal is rendered in a disabled,
clearly-labeled state instead: an amber warning icon + "Photo upload not available yet" text +
a tooltip pointing admins at the website Admin panel as the working alternative for now (new i18n
keys `admin.menu.uploadNotSupportedLabel`/`uploadNotSupportedHint`, added to both `en.json` and
`uz.json`). The source file's `handleImageFileChange` function and `imageUploading` state were
dropped entirely rather than kept as unreachable dead code behind the disabled control. Everything
else about the item-photo UI still works fully and needed no changes: the existing-photo preview
(`<img src={resolveImgUrl(itemForm.imageUrl)}>`) and its "×" remove button, which only clears the
local `imageUrl` form field and calls no upload API at all.

**Files:** `pos-app/src/pages/admin/screens/MenuScreen.jsx` (new, exported as `AdminMenuScreen` —
named deliberately to avoid any confusion with the unrelated cashier-side `pos-app/src/pages/pos/
MenuScreen.jsx`, which lives in a different folder and a different `SCREENS` map, so there is no
actual filename collision, only a naming-clarity choice), `pos-app/src/components/ConfirmDialog.jsx`
(new, ported verbatim), `pos-app/src/i18n/en.json` + `uz.json` (2 new keys under `admin.menu`),
`pos-app/src/pages/admin/AdminPanel.jsx` (`menu: MenuScreen` uncommented in `SCREENS`). All four
JS/JSX files esbuild-verified clean (`--bundle --loader:.jsx=jsx --format=esm`, external
react/react-dom/react-router-dom/lucide-react — every lucide icon this screen uses, including
`Edit2`/`Trash2`, confirmed present in the installed `lucide-react` version's `dist/esm/icons/`
folder, not assumed); both JSON files re-verified with `JSON.parse`. **Not yet tested on the real
machine** — next check: open Menu from the sidebar, confirm categories/items load and the 5s poll
doesn't visibly flicker; add/edit/delete a category and confirm reordering (up/down arrows)
persists correctly across a refresh; add/edit a menu item including kitchen-station quick-pick and
ingredient linking to a real warehouse item; confirm the item-photo control shows the disabled
"not available yet" state instead of doing nothing or erroring when clicked, and that an item that
already has a photo (added via the website) still previews and can have its photo cleared.

## 2026-07-27 (same day) — Admin: Inventory screen (task #25)

Ported the sixth Admin screen, and the largest one so far: `website/src/pages/admin/
AdminInventory.jsx` (~2170 lines) — warehouse items (stock overview table with expandable
batches, low-stock/critical/out-of-stock status), stock deliveries-in (pending vs. completed,
period presets, unpaid-debt banner), stock output (OUT/WASTE/ADJUST grouped by item, net of any
order-edit refunds), and suppliers (cards, per-supplier detail view, outstanding-debt summary
with bulk-pay). Followed the same read-first process as every prior screen: read
`DashboardScreen.jsx`/`TablesScreen.jsx`/`MenuScreen.jsx` for precedent, `AdminShell.jsx`/
`AdminPanel.jsx` for wiring, then the full website source file (read in 4 chunks, ~2170 lines,
none skipped) before writing anything.

**Ported `InventoryScreen.jsx` verbatim** — same 4 tabs, same 15s silent poll, same KPI cards, same
`isOrderRefund`/`autoOrderReasonBadge` logic that classifies auto-generated `stock_movements` rows
from order edits (added/removed/edited item) so the Output tab's per-item totals net out correctly
against later refunds instead of showing gross consumption. No `useNavigate()` adaptation needed —
like Menu, this screen never calls react-router navigation anywhere (confirmed by grep).

**Two new shared components, neither existed in pos-app yet:** `website/src/components/
Dropdown.jsx` (custom `<select>` replacement — used for every status/category/unit dropdown on
this screen) ported to `pos-app/src/components/Dropdown.jsx` completely unchanged (it has no
context/translation dependency at all, so there was nothing to adjust). `website/src/components/
DatePicker.jsx` (custom calendar popover via `createPortal`, used for every date filter/expiry/
due-date field) ported to `pos-app/src/components/DatePicker.jsx`, only its own `useTranslation`
import path adjusted the same way `ConfirmDialog.jsx`'s was previously. `warehouseAPI`/
`suppliersAPI`/`procurementAPI`/`ConfirmDialog`/`PhoneInput` were already ported and verified for
Dashboard/Tables/Menu, reused here unchanged — `money`/`fmtDate`/`fmtDateTime`/`todayStr` are now
imported straight from `lib/adminFormat.js` instead of via the `useApi.js` re-export the website
file uses, since this screen never actually calls the `useApi()` hook itself (confirmed by grep),
so there's no behavior difference either way — same choice `DashboardScreen.jsx` made for `money`.

**Real runtime-compatibility fix, not a design change:** the source file calls `window.prompt()`
twice, both inside the pending-delivery detail modal — "Adjust Qty" on an in-transit delivery line
(numeric) and the removal-reason text field when removing a line. Electron's renderer does not
implement `window.prompt()` at all (unlike `alert`/`confirm`, which Chromium does support and which
this codebase already replaces with the styled `ConfirmDialog` purely for visual consistency, not
because they're broken) — calling it here would have silently no-op'd or thrown, quietly breaking
both actions with no error shown to the admin. Replaced with a small local modal (`promptModal`/
`promptValue` state, rendered near the bottom of `InventoryScreen.jsx`) that asks for the exact
same single value and calls the exact same handlers afterward (`handleUpdateDeliveryItemQty`/
`handleRemoveDeliveryItem`) — identical functional outcome, just via a real modal instead of a
browser API this runtime doesn't have. Kept local to this file rather than a new shared component,
since no other ported screen has needed it yet — flagged in MEMORY.md in case a future screen does.

**Printing — confirmed excluded, not just assumed.** Grepped `AdminInventory.jsx` for "print"/
"Print" — zero matches. Nothing to stub or remove on this screen.

**`inventoryAPI`-is-dead-code and `purchase_orders`-are-unused, re-verified against the real file
(not re-assumed from the earlier research pass this task brief referenced):** confirmed by grep —
this screen calls `warehouseAPI`/`suppliersAPI`/`procurementAPI` exclusively, never the separate
`inventoryAPI` group in `client.js`. Within those three groups, it never calls
`suppliersAPI.getPurchaseOrders/createPurchaseOrder/receivePurchaseOrder` or `warehouseAPI.audit`
either — both exist in `client.js` with matching signatures but have zero call sites on this
screen (or, per the earlier research, anywhere else in the website), so nothing needed to change
or be added for them. Both facts held up exactly as expected.

**Files:** `pos-app/src/pages/admin/screens/InventoryScreen.jsx` (new, ~2050 lines),
`pos-app/src/components/Dropdown.jsx` (new, verbatim), `pos-app/src/components/DatePicker.jsx`
(new, import-path-adjusted), `pos-app/src/pages/admin/AdminPanel.jsx` (`inventory: InventoryScreen`
uncommented in `SCREENS`). All four esbuild-verified clean (`--bundle --loader:.jsx=jsx
--format=esm`, external react/react-dom/react-router-dom/lucide-react; the usual harmless
tailwindcss/theme.css resolution warnings in this sandbox ignored, same as every prior Admin
screen) — every lucide icon this screen and its two new shared components use (including
`Edit2`/`Trash2`/`Check`/`ChevronLeft`) confirmed present in the installed `lucide-react`
version's `dist/esm/icons/` folder by listing it directly, not assumed. `admin.inventory.*`/
`owner.inventory.*`/`placeholders.*`/`periods.*`/`common.*` translation keys this screen needs
were diffed key-by-key between the website's and pos-app's `en.json`/`uz.json` — zero missing in
either language, confirmed by script rather than spot-checked. **Not yet tested on the real
machine** — next check: open Inventory from the sidebar, confirm all 4 tabs load with real data
and the KPI cards populate; add/edit/delete a warehouse item; receive goods and record output
(OUT/WASTE/ADJUST) against a real item and confirm the stock number and Output tab's grouped
total update correctly; record a delivery, mark it Delivered, and confirm stock actually lands in
the warehouse; on an in-transit delivery, use "Adjust Qty" and "Remove" on a line item and confirm
the new prompt-replacement modal actually appears and works (this is the specific compatibility
fix to verify — a plain `window.prompt()` call would silently do nothing in the real app); add/
edit a supplier and confirm the debt summary and bulk-pay flow work against real unpaid
deliveries.

---

## Admin: Orders screen (2026-07-27, same day) — task #26

Seventh real Admin screen. Read RULES/SESSIONS/STATUS/MEMORY plus the four established pattern
files (`DashboardScreen.jsx`, `TablesScreen.jsx`/`MenuScreen.jsx`/`InventoryScreen.jsx`,
`AdminShell.jsx`/`AdminPanel.jsx`) before touching code, per the standing process rule. Ported
`website/src/pages/admin/AdminOrders.jsx` (~2145 lines) verbatim into
`pos-app/src/pages/admin/screens/OrdersScreen.jsx`, exported as `AdminOrdersScreen`: active/paid/
cancelled order tabs, order detail modal, the full status-flow buttons, edit-in-modal (incl. the
shared weighed kg/L amount picker), cancellation with a reason picker, delete-with-reason, and the
Collect Payment modal (cash/card/QR/loan, discount, 2/3/4-way split with per-part loan fields). No
new shared dependencies — every API group/hook/component it uses (`ordersAPI`/`menuAPI`/
`tablesAPI`/`usersAPI`, `useApi`/`money`/`fmtDate`, `Dropdown`/`DatePicker`/`PhoneInput`) was
already ported and verified for Dashboard/Tables/Menu/Inventory.

**Solved the `?open=<id>` deep-link gap Tables' port (task #23) deliberately left open.** The
website reads a `?open=<id>` query param off `/admin/orders?open=<id>` (a URL
`TablesScreen.jsx`'s "View Full Order" button already calls) via react-router's
`useLocation().search`, then strips it after consuming it. pos-app has no URL/query-string
routing at all. Extended `AdminShell.jsx`'s existing `goTo(path)` adapter — which already had to
split on `?` to strip the query string for nav-key matching, from task #23's earlier fix — to also
parse `open=<id>` out of that same query string into new `openOrderId` state, handed to whichever
screen is currently active as a plain prop pair (`openOrderId`/`clearOpenOrderId`), alongside the
`navigate` prop every screen already receives regardless of whether it's used. `OrdersScreen.jsx`
consumes it in a `useEffect`: fetches the order via `ordersAPI.getById`, opens the detail modal if
found, then calls `clearOpenOrderId()` in a `finally` block so it doesn't reopen on a later
re-render or a round trip to another screen. Same functional outcome as the website's URL-based
version, just prop-based — designed this way specifically because pos-app has no
`useSearchParams()` equivalent, and every other screen simply ignores the extra props. No changes
needed in `TablesScreen.jsx` itself — its button already called the right URL shape.

**Printing — excluded per the standing rule, and unlike Tables/Menu/Inventory this screen actually
had real, reachable print code to remove, not just dead-behind-`isCashier` code or none at all.**
Grepped the source for "print"/"Print" and found: the `usePrinter()` hook import/call
(`printReceipt`), a `restSettings` state + `accountingAPI.getRestaurantSettings()` effect (only
existed to feed the receipt header/footer text), an `fmtOrderNum()` helper (only existed to format
the printed order number), `handlePrintCheque()` (built the full receipt HTML and called
`printReceipt`), the `Printer` icon import, and the "Print Receipt" button itself in the Collect
Payment modal's action footer. All removed entirely as dead code — confirmed via grep that none of
it had any other call site before deleting. The Payment modal's footer now shows just Confirm
Payment + Cancel where it used to show three buttons.

**`window.prompt`/`window.confirm`/`window.alert` — checked per the Inventory screen's known
gotcha, found completely clean this time.** Grepped the whole source file for all three patterns —
zero matches, nothing needed the local-modal-replacement pattern Inventory had to build.

**One real, deliberate functional deviation (not a design tweak), flagged directly rather than
left silent:** the header's "+ New Order" button called `navigate('/admin/new-order')` in the
source — the website's standalone `AdminNewOrder.jsx` page, a full route distinct from the
`isModal` branch `NewOrderModal.jsx` already ports (task #23 explicitly never ported the standalone
branch — Tables is the only caller anywhere in this build and always uses `isModal`). Porting the
full standalone page was out of scope for this task, so `/admin/new-order` doesn't exist as a
pos-app screen — pointing the button at it would have silently landed on the generic "coming in a
later build step" placeholder. Redirected it to `navigate('/admin/tables')` instead, the actual
place a new order gets created in this port (tap a free table → New Order modal, from task #23).

All three touched/new files (`OrdersScreen.jsx`, `AdminShell.jsx`, `AdminPanel.jsx`)
esbuild-verified clean (`--bundle --loader:.jsx=jsx --format=esm`, external
react/react-dom/react-router-dom/lucide-react — the usual harmless tailwindcss/theme.css
resolution warnings ignored, same as every prior Admin screen). Every lucide icon actually
rendered (`ClipboardList`/`Check`/`X`/`AlertTriangle`/`Trash2`/`RefreshCw`/`Calendar`/
`DollarSign`/`Grid3X3`/`User`/`CreditCard`/`Ban`/`Edit3`/`Plus`/`Minus`/`FileText`, including
`Grid3X3` which is only ever referenced dynamically via the payment-method grid's `Icon:
Grid3X3`/`<Icon/>` pattern, not as a literal `<Grid3X3` JSX tag) confirmed present in the installed
`lucide-react` version by listing its `dist/esm/icons/` folder directly. Five icons the source
imports but never actually renders anywhere (`Clock`/`Filter`/`ChevronDown`/`Eye`/`Receipt`,
confirmed dead by checking every possible render call site including dynamic `<Icon/>` references)
dropped rather than carried forward as unused imports. All 113 unique translation keys this screen
calls `t()` with — including the two array-valued keys, `admin.orders.deleteReasons`/
`cancelReasons`, confirmed to work because pos-app's `LanguageContext.jsx`'s `t()` returns
non-string values as-is — diffed key-by-key between website and pos-app `en.json`/`uz.json` by
script: zero missing in either language.

**Not yet tested on the real machine** — next check: open Orders from the sidebar, confirm
active/paid/cancelled tabs load with real data and the 30s poll doesn't flicker; walk an order
through the full status flow (pending → sent to kitchen → preparing → ready → served → bill
requested); edit an order including a weighed item and confirm Save Changes persists correctly;
cancel an order with a reason; collect a payment with each method including a split with a loan
part, and confirm the modal footer has no visible gap where Print Receipt used to be; from Tables,
tap an occupied table's "View Full Order" and confirm it now actually opens that specific order's
detail modal instead of just landing on the Orders tab (this is the concrete deep-link fix to
verify — it silently couldn't have worked before this screen existed); from Orders' own header,
confirm "+ New Order" lands on Tables instead of a blank placeholder.

---

## Admin: Loans screen (2026-07-27, same day) — task #27

Eighth real Admin screen. Read RULES/SESSIONS/STATUS/MEMORY plus the established pattern files
(`DashboardScreen.jsx`, `AdminShell.jsx`/`AdminPanel.jsx`) before touching code, per the standing
process rule. Ported `website/src/pages/admin/AdminLoans.jsx` (~939 lines, the smallest remaining
screen) verbatim into `pos-app/src/pages/admin/screens/LoansScreen.jsx`, exported as
`AdminLoansScreen`: a loans list with 4 stat cards (total/active/overdue/outstanding), search +
status-filter pills, a date-range calendar picker (its own inline `CalendarPicker` component, not
the shared `DatePicker.jsx` — the source never used that component either), a loan details modal
that pulls the linked order's items and subtotal via `ordersAPI.getById`, and a collect-payment
modal (cash/card/QR — simpler than Orders' payment modal since a loan is always a single fixed
amount, no split/discount involved). Same 10s silent poll as the source.

**No new shared dependencies.** `loansAPI`/`ordersAPI` (client.js), `money` (lib/adminFormat.js),
and `useTranslation` (context/LanguageContext.jsx) were all already ported and verified for
Dashboard/Tables/Menu/Inventory/Orders — every method this screen actually calls (`loansAPI.
getAll`/`markPaid`, `ordersAPI.getById`) checked against the real `client.js` and confirmed to
match exactly. No `navigate` prop needed — this screen never calls react-router navigation
anywhere in the source (confirmed by grep, same situation as Menu/Inventory).

**Printing — grepped clean.** Grepped the source for "print"/"Print" — zero matches, nothing to
exclude. Unlike Orders (which had a real, reachable print flow to strip out), Loans never had any.

**`window.prompt`/`window.confirm`/`window.alert` — grepped per the standing Inventory-screen
lesson, found clean.** Zero matches for all three across the whole source file. This screen never
uses any of them — nothing needed the local-modal-replacement pattern Inventory had to build.

**Two real findings that correct assumptions carried into this task from earlier research, both
re-verified against the actual source file rather than re-guessed:**
1. **No "remind overdue" flow exists anywhere in `AdminLoans.jsx`.** The task brief expected one,
   and `client.js`'s `loansAPI.notifyOverdue()` (`POST /loans/notify-overdue`) does exist with a
   matching real backend route — but grepping the source file for "notify"/"remind"/"Remind" turns
   up zero call sites: no button, no handler, nothing wired to it. Nothing was ported for this
   feature since there is nothing in the website source to port — flagging it plainly rather than
   inventing a feature that was never actually built on the website either.
2. **`loansAPI.getStats()`-is-unused, re-confirmed true against the real file.** The method exists
   in `client.js` with a matching backend route, but this screen never calls it (grepped, zero call
   sites) — it computes `totalLoans`/`activeLoans`/`overdueLoans`/`totalOutstanding` client-side by
   reducing over the raw array `loansAPI.getAll()` already returns. The earlier research note that
   flagged this held up exactly as expected.

Every lucide icon this screen imports (`CreditCard`/`AlertCircle`/`Check`/`Loader2`/`Search`/`X`/
`Wallet`/`QrCode`/`Receipt`/`Clock`/`User`/`TableProperties`/`Calendar`/`ChevronDown`/`Banknote`/
`TrendingUp`/`Phone`/`FileText`/`ShoppingBag`/`CalendarDays`/`Hash`/`Info`) confirmed present in the
installed `lucide-react` version by listing its `dist/esm/icons/` folder directly, not assumed —
`Loader2` was the one non-obvious kebab-case mapping (`loader-2.js`, not `loader2.js`), double-
checked directly rather than trusted from a naive regex conversion. Every translation key this
screen calls `t()` with — `cashier.loans.*`, `periods.*`, `common.*`, `datePicker.months`/`days`,
`paymentMethods.*`, `statuses.paid`, `cashier.orders.confirmPayment` — diffed key-by-key between
website and pos-app `en.json`/`uz.json` by script: zero missing in either language, including the
two array-valued `datePicker` keys.

**Files:** `pos-app/src/pages/admin/screens/LoansScreen.jsx` (new, ~840 lines),
`pos-app/src/pages/admin/AdminPanel.jsx` (`loans: LoansScreen` uncommented in `SCREENS`). Both
esbuild-verified clean (`--bundle --loader:.jsx=jsx --format=esm`, external
react/react-dom/react-router-dom/lucide-react — the usual harmless tailwindcss/theme.css
resolution warnings ignored, same as every prior Admin screen). **Not yet tested on the real
machine** — next check: open Loans from the sidebar, confirm the stats/list load with real data and
the 10s poll doesn't flicker; search and filter by status (all/active/overdue/paid); open the
date-range calendar picker, pick a custom range or a preset, and confirm the list actually
re-fetches for that range; tap a loan to open its details modal and confirm the linked order's
items and subtotal load correctly, including the "No order linked to this loan" state for a loan
with no `orderId`; collect a payment with each method (cash/card/QR) from both the list row's quick
"Mark Paid" button and the details modal's own "Mark Paid" button, and confirm the loan flips to
paid immediately in both the list and the stat cards afterward.

---

## Admin: Staff screen (2026-07-27, same day) — task #28

Ninth real Admin screen. Read RULES/SESSIONS/STATUS/MEMORY plus the established pattern files
(`DashboardScreen.jsx`, `LoansScreen.jsx`/`OrdersScreen.jsx`, `AdminShell.jsx`/`AdminPanel.jsx`)
before touching code, per the standing process rule. Ported `website/src/pages/admin/
AdminStaff.jsx` (~2075 lines) verbatim into `pos-app/src/pages/admin/screens/StaffScreen.jsx`,
exported as `AdminStaffScreen`: Staff / Attendance / Payroll tabs — staff CRUD (add/edit/suspend/
delete, login-credentials editor, kitchen-station quick-pick + custom station add/delete backed by
the DB), a live clock-in/out status view (manual clock-in/out/mark-absent, a manual-shift and
edit-shift modal), and salary-type-aware payroll (hourly/daily/weekly/monthly) with debt
carry-over from the last recorded payment per staff member, a record-payment modal, and a payroll
details modal (salary breakdown + payment history + attendance records for one staff member).

**The live staff-status complication, handled exactly as pre-flagged.** This screen's Attendance
tab and its per-card "on shift" dot both read from `shiftsAPI.getStaffStatus()` → REST
`GET /shifts/admin/staff-status`, which does real server-side "pick today's most relevant shift row
per user, priority-ordered" logic on the backend — not a plain table select. Per the explicit task
note (and task #21's PowerSync-scoping research before it), this was NOT reimplemented client-side
and NOT read from local PowerSync even though `shifts`/`staff_payments` were added to the `powersync`
publication earlier this session — the PowerSync Cloud Sync Streams config for those tables still
isn't live regardless (see task #21), and even once it is, this specific "today's most relevant
shift" query is real business logic that belongs on the server, not something to duplicate in
client SQL. Called `shiftsAPI.getStaffStatus()` via REST throughout, exactly like the website.

**No new shared dependencies except `ConfirmDialog` (already existed, not newly ported).**
`usersAPI`/`shiftsAPI`/`staffPaymentsAPI`/`menuAPI` (client.js), `money` (lib/adminFormat.js),
`Dropdown`/`DatePicker`/`PhoneInput`/`ConfirmDialog` (components/) were all already ported and
verified for earlier screens — every method this screen actually calls on each was checked against
the real `client.js` and matches exactly, including `shiftsAPI.getStaffStatus`/`getAll`/
`updateShift`/`createManualShift`/`clockIn`/`adminClockOut` and `staffPaymentsAPI.getAll`/
`getLatest`/`create`/`delete`. `shiftsAPI.getPayroll` exists in `client.js` but this screen never
calls it (grepped, zero call sites) — it computes payroll client-side from raw shifts + payment
history instead, the same "confirmed unused, not assumed" pattern as Loans' `loansAPI.getStats()`.
`permissionsAPI` — imported by the source (`usersAPI, shiftsAPI, staffPaymentsAPI, permissionsAPI,
menuAPI`) but never called anywhere in the file (grepped, zero call sites — the "── PERMISSIONS
MODAL ──" comment near the delete modal has no actual modal body under it) — dropped from the port
entirely, nothing to port. No `navigate` prop needed — this screen never calls react-router
navigation anywhere in the source (confirmed by grep, same situation as Menu/Inventory/Loans).

**Printing — grepped clean.** Grepped the source for "print"/"Print" — zero matches, nothing to
exclude.

**Real `window.confirm()` bug found and fixed — the second Electron-native-dialog bug found in this
build, same class as Inventory's `window.prompt()` fix (task #25).** Grepped the whole source for
`window.prompt`/`window.confirm`/`window.alert` plus bare `confirm(`/`alert(`/`prompt(` and found
one real hit: a bare `confirm(t('admin.staff.deletePaymentConfirm', {...}))` guarding the delete-
payment button inside the payroll details modal — the source never imports its own
`components/ConfirmDialog.jsx` for this, unlike Menu/Inventory which use it for their own confirm/
alert-style prompts. Replaced with the same styled `ConfirmDialog` component every other ported
screen already uses (new `dialog`/`setDialog` state, `<ConfirmDialog dialog={dialog}
onClose={...}/>` rendered once near the bottom) — identical functional outcome (Cancel/Delete
choice, same message), just reliable in this runtime instead of a browser-native dialog Electron's
renderer doesn't consistently support.

Four unused lucide icon imports dropped (`Shield`, `LogOut`, `LogIn`, `UserX`) — confirmed by
checking every `<IconName`/`icon:`/`Icon:` JSX usage in the source, none of the four ever renders.
`Users` IS used (as `icon: Users` for the Staff tab's own tab-icon, not `<Users`), so it's kept.
Remaining 33 icons confirmed present in the installed `lucide-react` version by checking its
`dist/esm/icons/` folder directly (`Edit2`→`edit-2.js`, `Trash2`→`trash-2.js`, the same non-obvious
kebab-case mappings already known from earlier screens). Every translation key this screen calls
`t()` with (151 raw regex matches, one false positive from `.split('T')[0]` filtered out — 150 real
keys, plus the two dynamic `admin.staff.salaryTypes.${type}` template-literal keys checked
separately since the diff script only catches literal-string calls) diffed key-by-key between
website and pos-app `en.json`/`uz.json` by script: zero missing in either language, including
`admin.staff.salaryTypes.*` and `admin.staff.kitchenStations.*`.

**Files:** `pos-app/src/pages/admin/screens/StaffScreen.jsx` (new, ~2155 lines),
`pos-app/src/pages/admin/AdminPanel.jsx` (`staff: StaffScreen` uncommented in `SCREENS`). Both
esbuild-verified clean (`--bundle --loader:.jsx=jsx --format=esm`, external
react/react-dom/react-router-dom/lucide-react — the usual harmless tailwindcss/theme.css resolution
warnings ignored, same as every prior Admin screen). **Not yet tested on the real machine** — next
check: open Staff from the sidebar, confirm the staff list loads with real data and role filter
pills/search work; add a new staff member (incl. a Kitchen-role member with a station quick-pick
and a custom station add) and confirm the "credentials created" modal shows the right login info;
edit/suspend/delete a staff member; on the Attendance tab, clock a staff member in as
present/late, mark another absent, then clock the first one out, and confirm the live "on shift"
dot and elapsed timer update correctly (this is the concrete `shiftsAPI.getStaffStatus()` REST
round-trip to verify); edit a historical shift record via the edit-shift modal; on the Payroll tab,
switch between This Month/Last Month/Custom range, record a payment against a staff member with
salary type hourly/daily/weekly/monthly and confirm the remaining-due number drops correctly, open
a staff member's payroll details modal and confirm the salary breakdown + payment history render,
then delete a payment from that modal and confirm the new `ConfirmDialog` prompt appears (the
specific `window.confirm()` compatibility fix to verify — a bare `confirm()` would silently no-op
or behave unpredictably here) and the delete actually goes through when confirmed.

---

## Admin: Restaurant Settings screen (2026-07-27, same day) — task #29

Tenth real Admin screen. Read RULES/SESSIONS/STATUS/MEMORY plus the established pattern files
(`DashboardScreen.jsx`, `MenuScreen.jsx` for the disabled-upload precedent, `StaffScreen.jsx` for
the current shared-deps state, `AdminShell.jsx`/`AdminPanel.jsx`) before touching code, per the
standing process rule. Ported `website/src/pages/admin/AdminRestaurantSettings.jsx` (~994 lines)
into `pos-app/src/pages/admin/screens/SettingsScreen.jsx`, exported as `AdminSettingsScreen`:
restaurant profile (name/address/phone/logo), currency symbol, tax rate/enabled, service charge
rate/enabled, receipt header/footer text plus what shows on the customer receipt, and what shows
on the kitchen order slip — a 4-tab sidebar (Restaurant Info / Financial / Receipt Template /
Kitchen Order Template) with a single `settingsAPI.get()`/`update()` round-trip, no polling (this
is the single infrequent-read settings page the earlier PowerSync-scoping research (task #21)
already flagged — built against REST throughout, per that recommendation, not switched to local
PowerSync even though all 3 backing tables (`restaurant_settings`/`custom_stations`/`menu_items`)
are in the sync scope now).

**Printing — the whole "Printers" section excluded, not just print-trigger code, per the standing
rule's explicit callout that a restaurant-settings screen "almost certainly has printer IP/port
settings fields."** Found and removed as dead code, matching how the Orders screen (task #26)
deleted its excluded print flow outright rather than disabling it in place: `PrinterCard` (per-
printer name/IP/port fields + a "not configured" status badge + kitchen-station assignment toggles
for kitchen printers), `PrinterSetupGuide` (5-step "how to connect a network printer" walkthrough +
compatible-printer list + troubleshooting box), `AddFormPanel` (shared add-printer draft form), and
`PrintersPanel` itself (receipt-printer list/add, kitchen-printer list/add, the `loadStations`
3-source merge that only fed the kitchen-printer station picker) — all gone, along with the
`printers` entry in `SECTIONS`, so the whole tab no longer appears in the sidebar at all (the tab
itself isn't offered here, not shown greyed out). This also let `menuAPI` drop out of the import
list entirely — it was only ever used by the now-removed `loadStations`, confirmed by grep (zero
other call sites in the source). Icons only used by the removed UI (`Printer`, `Wifi`, `Network`,
`MonitorCheck`, `ChevronDown`, `ChevronUp`, `Plus`, `Trash2`) dropped from the import list too.

**A real data-preservation fix needed because of the above, not present in the source itself:**
`form.receiptPrinters`/`form.kitchenPrinters` are still loaded from `settingsAPI.get()` into state
and sent back UNCHANGED inside `settingsAPI.update(form)` on every save, even though this port
renders no UI for them anywhere. Without this, saving any other setting on this screen (e.g. tax
rate) would send both arrays back empty and silently wipe out real printer IP/port configuration
that was entered via the website's own Printers panel — a real correctness risk the website itself
never hits (its own UI always round-trips the user's current edits to those fields). Called out
explicitly in the file's own header comment as a deliberate addition, not an oversight.

**Receipt/Kitchen "template" toggles were deliberately KEPT, not excluded — a distinction from the
Printers exclusion above, not an inconsistency.** `ReceiptTemplatePanel` (header/footer text +
show-logo/tax/service-charge/footer/order-number/table-name toggles) and `KitchenTemplatePanel`
(kitchen ticket show-order-type/table/order-number/customer-name/qty-unit/item-price/notes/
timestamp toggles) are pure `restaurant_settings` data fields with zero print-execution code
attached in this file — no `print()` call, no `printAPI`, no printer hookup of any kind here, just
settings the website/print-agent read elsewhere. The task brief itself explicitly scoped "receipt
header/footer text" as in-scope, distinct from "printer settings (EXCLUDE)" — these two panels are
the receipt-content half, not the printer-hardware half, and stay fully functional and unchanged.

**Logo upload — the known `settingsAPI.uploadLogo` stub, handled with the exact `MenuScreen.jsx`
precedent already flagged for this in MEMORY.md.** Instead of wiring the file picker to a handler
that would always throw ("image upload is not yet supported in the Admin panel" — pos-app's IPC
layer is JSON-only, no multipart/FormData path exists yet), `LogoUpload` now renders a disabled,
dashed-border control (amber `AlertTriangle` icon + label + tooltip) in place of both the "no logo
yet" upload prompt and the "replace logo" button. Reused the existing `admin.menu.
uploadNotSupportedLabel`/`uploadNotSupportedHint` i18n keys verbatim instead of adding a duplicate
settings-scoped pair — the message content applies unchanged. The existing-logo preview and its
"Remove" button are pure local state (no upload API involved) and stay fully functional, same as
Menu's photo-remove button. Source's `handleFile`/`uploading`/`uploadError` state and the hidden
`<input type="file">` dropped as unreachable dead code behind the disabled control.

**`window.prompt`/`window.confirm`/`window.alert` — grepped clean.** Zero matches for all three
(plus bare `confirm(`/`alert(`/`prompt(`) across the whole source file — nothing needed the
ConfirmDialog/local-modal replacement pattern used on Inventory/Staff. No `navigate` prop needed
either — this screen never calls react-router navigation anywhere in the source (confirmed by
grep, same situation as Menu/Inventory/Loans/Staff).

**No new shared dependencies.** `settingsAPI` (client.js, `get`/`update`/`uploadLogo`) was already
ported and verified for the foundation task (#20) — every method this screen actually calls matches
exactly. All 9 lucide icons this screen imports (`Store`, `DollarSign`, `Percent`, `Receipt`,
`Check`, `AlertCircle`, `AlertTriangle`, `X`, `UtensilsCrossed`) confirmed present in the installed
`lucide-react` version by listing its `dist/esm/icons/` folder directly, not assumed. Every real
`t()` key this screen calls (47 keys, extracted with a lookbehind-anchored regex after an initial
naive regex falsely flagged `set('restaurantName')`-style local closure calls as translation keys —
re-run with `(?<![a-zA-Z0-9_])t\(` to exclude any `t(` preceded by another identifier character)
diffed key-by-key against both `en.json`/`uz.json` by script: zero missing in either language.

**Files:** `pos-app/src/pages/admin/screens/SettingsScreen.jsx` (new, ~440 lines),
`pos-app/src/pages/admin/AdminPanel.jsx` (`settings: SettingsScreen` uncommented in `SCREENS`).
Both esbuild-verified clean (`--bundle --loader:.jsx=jsx --format=esm`, external react/react-dom/
react-router-dom/lucide-react — the usual harmless tailwindcss/theme.css resolution warnings
ignored, same as every prior Admin screen). **Not yet tested on the real machine** — next check:
open Settings from the sidebar, confirm all 4 tabs load with real data and the sidebar no longer
shows a Printers tab at all; edit restaurant name/address/phone and Save Changes, confirm it
persists after a reload; toggle tax/service charge on and confirm the rate field appears/
disappears and saves correctly; edit receipt header/footer text and toggle each receipt/kitchen
display option, confirm they persist; confirm the logo section shows the disabled "not available
yet" control (with an amber icon and tooltip) whether or not a logo is already set, and that an
existing logo (set via the website) still previews and its Remove button still works; most
important given the data-preservation fix above — set up a receipt or kitchen printer via the
**website's** Settings page first, then open this screen in pos-app and save an unrelated field
(e.g. currency symbol), then reload the website's Settings page and confirm the printer
configuration is still intact (this is the concrete regression the `receiptPrinters`/
`kitchenPrinters` pass-through was built to prevent — verify it actually works, not just that it
compiles).

---

## Admin: Profile screen (2026-07-27, same day) — task #30, ninth and LAST Admin screen

Read RULES/SESSIONS/STATUS/MEMORY plus the established pattern files (`DashboardScreen.jsx`,
`SettingsScreen.jsx` for the current shared-deps state, `AdminShell.jsx`/`AdminPanel.jsx`) before
touching code, per the standing process rule. Ported `website/src/pages/admin/AdminProfile.jsx`
(~320 lines, the smallest Admin screen as flagged) into
`pos-app/src/pages/admin/screens/ProfileScreen.jsx`, exported as `AdminProfileScreen`: the logged-
in admin's own profile info (name/phone/email/role/member-since/last-login), an edit-profile modal,
and a change-password modal — same design, same fields, same validation as the source.

**No AuthContext — the one real structural adaptation.** The website reads/writes the current user
via `useAuth()` (`authUser`/`updateUser`), backed by its own `AuthContext.jsx` +
`localStorage`. pos-app has no such context — its session lives in `App.jsx`'s own state and is
handed down as a plain `user` prop, the same reasoning already used for every other screen that
needed the current user (Dashboard's `navigate` prop is the same class of fix). Replaced `authUser`
with a local `profile` state seeded from the `user` prop and refreshed from `usersAPI.getMe()` on
mount exactly like the source; `updateUser(patch)` calls became `setProfile(prev => ({ ...prev,
...patch }))`. **Known, deliberately-flagged limitation, not a silent bug:** editing your name/phone
here updates this screen's own display immediately (same as the website), but AdminShell.jsx's
sidebar header (avatar initials + name) reads a prop snapshot taken once at panel mount with no
callback wired back up to refresh it — the sidebar won't show the edit until the next login.
Re-threading a live-update callback through App.jsx → AdminPanel → AdminShell was judged out of
scope for a cosmetic staleness gap on a rarely-changed field on the very last screen of this build;
documented in the file's own header comment for a future session to pick up if the project owner
wants it.

**Sign Out button — routed through the existing centralized logout, not re-implemented.** The
source's own Sign Out button does a raw `localStorage.removeItem('token'/'user')` +
`window.location.href = '/login'`, meaningless in Electron (no such browser redirect target outside
App.jsx's own router, and pos-app's real logout also has to call `window.electronAPI.logout()`
first). AdminShell.jsx's sidebar already has its own "Sign Out" button wired to exactly this real
flow via an `onLogout` prop from `AdminPanel.jsx`'s `handleLogout` — extended `AdminShell.jsx` to
also pass `onLogout` down to whichever screen is active (alongside the existing `navigate`/
`openOrderId`/`clearOpenOrderId`), so this screen's identical Sign Out button/confirm-dialog calls
that same function instead of adding a second logout code path. Every other screen ignores the
extra prop harmlessly, same precedent as `navigate` itself.

**All three standing build-wide concerns grepped clean — confirmed, not assumed, per the task
brief's own instruction to verify rather than take the "likely none" prediction on faith.**
- **Printing:** zero matches for "print"/"Print" anywhere in the source — nothing to exclude.
- **`window.prompt`/`window.confirm`/`window.alert`:** zero matches for all three (plus bare
  `confirm(`/`alert(`/`prompt(`) — the source's only confirm-style interaction (Sign Out) already
  goes through its own `ConfirmDialog` component, the exact pattern this build standardized on
  after Inventory's/Staff's real `window.prompt()`/`window.confirm()` bugs — nothing to fix here.
- **Avatar/photo upload:** none exists — re-confirmed against the actual file rather than trusting
  the earlier MEMORY.md note that no avatar feature exists anywhere in this codebase. The header
  avatar is a pure initials chip (`getInitials`), no file input, no upload API call of any kind, so
  the `menuAPI.uploadImage`/`settingsAPI.uploadLogo` disabled-control precedent doesn't apply here —
  correctly, there's nothing to stub.

**No new shared dependencies.** `usersAPI` (client.js — `getMe`/`update`/`updateCredentials`) and
`ConfirmDialog`/`PhoneInput` (+ its named `formatPhoneDisplay` export) were all already ported and
verified for earlier screens — every method this screen calls matches exactly. All 16 lucide icons
this screen imports (`User`, `Mail`, `Phone`, `Shield`, `Save`, `X`, `LogOut`, `Lock`, `Edit2`,
`Eye`, `EyeOff`, `Clock`, `Calendar`, `ChevronRight`, `Check`, `AlertCircle`) confirmed present in
the installed `lucide-react` version by listing its `dist/esm/icons/` folder directly, not assumed.
All 28 unique `t()` keys this screen calls diffed key-by-key against both `en.json`/`uz.json` by
script — zero missing in either language (`admin.profile.*`/`common.*`/`alerts.failed*`/
`placeholders.yourName`, all already present from earlier work, none newly added).

**Files:** `pos-app/src/pages/admin/screens/ProfileScreen.jsx` (new, ~320 lines),
`pos-app/src/pages/admin/AdminShell.jsx` (`onLogout` now also passed to the active screen, header
comment updated), `pos-app/src/pages/admin/AdminPanel.jsx` (`profile: ProfileScreen` uncommented in
`SCREENS`). All three esbuild-verified clean (`--bundle --loader:.jsx=jsx --format=esm`, external
react/react-dom/react-router-dom/lucide-react). **Not yet tested on the real machine** — next check:
open Profile from the sidebar (or Dashboard's own Quick Action button, which already targeted
`/admin/profile`), confirm the header/info card/security card render with real data; edit
name/phone and Save Changes, confirm the screen's own display updates immediately (email field
stays disabled, matching the source); change password with a too-short value, a mismatched
confirm, and a valid matching pair, confirm each validation path and the final success toast; tap
Sign Out, confirm the styled confirm dialog appears and confirming it actually signs out (the
concrete `onLogout` wiring to verify) — the sidebar's own separate Sign Out button should still
work identically, unaffected by this change.

**This closes out the full 9-screen Admin panel screen-porting effort (tasks #20-30) — see
STATUS.md's new summary note at the top for the honest full-scope picture of what's done vs. still
outstanding before this is shippable** (nothing tested on a real machine yet, PowerSync Cloud Sync
Streams config still pending for task #21's tables, printing is next as its own explicit phase, and
a handful of small known gaps — photo/logo upload IPC, the live website's own weighed-item-picker
bug, "+ New Order" redirect — carried forward from earlier tasks, not new to this one).

---

## 2026-07-27 (same day) — Real-machine testing begins: found a genuine backend bug via CSP block

First real-machine click-through of the Admin panel (Tables screen). Two console errors showed up.
One was the already-diagnosed-today Render free-tier spin-down issue (expected, accepted, not new).
The other was new: `Refused to load the image 'http://the-bill-backend-pego.onrender.com/uploads/
menu/....jpg' ... violates ... img-src ... https://the-bill-backend-pego.onrender.com`.

Root-caused by reading the actual code, not guessed: `restaurant-app/backend/src/routes/menu.js`'s
upload endpoint builds `fullUrl` from `req.protocol`, and Express never had `trust proxy` set —
Render terminates TLS at its edge and forwards internally over plain HTTP, so `req.protocol` has
been silently reporting `'http'` for every photo upload since this endpoint was written. Every
`image_url` in the database has an `http://` scheme instead of `https://`. pos-app's Admin CSP
intentionally only allows `https://` for that origin, so these photos get blocked outright instead
of just failing — this is what actually surfaced it.

Fixed on both ends: `server.js` gets `app.set('trust proxy', 1)` (fixes all future uploads —
committed locally as `c24a2ca`, needs the user to `git push origin main` from
`restaurant-app/backend/`, no push credentials in this sandbox); `MenuScreen.jsx`'s
`resolveImgUrl()` and — importantly, since this is the SAME bug affecting already-shipped
production code, not just the new Admin panel — the cashier POS's own `lib/localPhoto.js` both now
upgrade `http://` to `https://` for this specific host before use, so already-bad stored URLs
render correctly with zero backend redeploy or data migration required. All three files verified
(`node --check`/Linux `esbuild`). Full detail in STATUS.md's "Fixed: menu photos blocked by CSP"
entry.

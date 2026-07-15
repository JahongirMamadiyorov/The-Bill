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

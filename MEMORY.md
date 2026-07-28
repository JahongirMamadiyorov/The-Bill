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
- **This session's Supabase MCP connection had NO permission to run `execute_sql` or
  `list_tables`** ("You do not have permission to perform this action") — unclear if this is a
  scoped/read-restricted key or a temporary issue. Don't assume DB query access is available;
  verify with a cheap call first, and fall back to code-audit + asking the user to read screenshots
  of real data if it's unavailable (as happened 2026-07-16, see "Inventory ingredient math" below).
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

## PowerSync Sync Streams gotchas (learned 2026-07-06)

- `column = (SELECT ... )` scalar subqueries are **not supported** in Sync Streams queries,
  even though PowerSync's own docs casually mention "subqueries are supported" — in practice
  only `IN (SELECT ...)`, `JOIN`, and direct `auth.parameter()`/`auth.user_id()` comparisons
  work reliably. If a Sync Streams query needs to derive a value from another table based on
  the logged-in user (e.g. "this user's restaurant_id"), the clean fix is to put that value
  directly into the PowerSync JWT as a custom claim (minted in the backend token endpoint) and
  reference it via `auth.parameter('claim_name')` — not to subquery for it.
- Never `SELECT *` a table containing credential columns (`password_hash`, `pin_hash`, etc.)
  in a Sync Streams query — always use an explicit column list. This almost shipped a bug
  where every POS terminal would have synced everyone's password hashes locally.

## Electron + PowerSync compatibility notes (learned 2026-07-06)

- `@powersync/node` is a pure-ESM package (no CommonJS `require` support at all — its
  `package.json` has `"type": "module"` and an `exports` map with only `import`/`module-sync`
  conditions). `pos-app`'s `main.js` is otherwise CommonJS; the fix is loading it via dynamic
  `import()` inside an async function, not top-level `require()`. Any other ESM-only package
  added to this project's Electron main process will hit the same issue.
- `@powersync/node`'s dependencies (`undici`) need Node.js 20+ (specifically the global `File`
  class, added in Node 20). Electron bundles its own Node version per release — Electron 28
  ships Node 18, which breaks this. `pos-app` intentionally pins Electron `^33.0.0` (not
  matching the older `electron-app`'s `28.3.3`) specifically for this reason.
- `better-sqlite3`'s required major version is dictated by whichever `@powersync/node` version
  is installed (peer dependency) — check the actual npm error/package.json rather than
  guessing a version number.

## Phase 1 Cashier decisions (2026-07-07)

- Order writes (Fire/Charge) call the backend directly over HTTPS from the Electron main
  process — not through PowerSync's write queue — because order creation/payment has real
  server-side logic (tax, daily numbering, stock deduction, notifications, kitchen printing)
  that must stay centralized. See RULES.md §4 for the full rule; `submitOrderWrite()` in
  `pos-app/main.js` is the single funnel this goes through.
- Explicitly online-required for those two actions in Phase 1 ("Option A"), but the user wants
  offline queuing for them added later ("Option B") — the funnel-function structure exists
  specifically so that's a later one-place change, not a rewrite. Don't quietly build B without
  being asked, and don't build something that forecloses it either.
- `pos-app/src/lib/case.js` is the reusable snake_case→camelCase + boolean-coercion layer for
  local PowerSync reads — every future screen (Kitchen, Admin, Owner, New Waiter) that reads
  local data should use it rather than re-solving the same translation problem.

## Ingredient stock deduction — where it lives (fixed 2026-07-08, audited 2026-07-16)

- `warehouse_items.quantity_in_stock` is deducted via BOM (`menu_item_ingredients`) lookup in
  THREE separate places in `restaurant-app/backend/src/routes/orders.js`: `POST /` (create),
  `POST /:id/items` (add items), and `PUT /:id` (replace items — diffs old vs. new quantity per
  menu_item_id, deducts only what increased, refunds (type IN) only what decreased). There's
  also a fallback in `PUT /:id/pay` for orders that somehow never got deducted at creation.
- This logic is NOT centralized — it's duplicated per-route. **Any new endpoint that creates,
  adds, removes, or replaces order items must also handle stock deduction/refund explicitly, or
  it will silently under/over-count inventory.**
- The reason-prefix trick (`Auto: Order #<num>...`) used by the `PUT /:id/pay` fallback to
  detect "was this order's stock already deducted" is fragile — it matches on string prefix via
  `stock_movements WHERE reason LIKE 'Auto: Order #<num>%'` with **no `restaurant_id` or date
  scoping at all**. Since `daily_number` resets to 1 each day per restaurant, "Order #5" recurs
  constantly across days and across different restaurants (this is multi-tenant). This means the
  fallback can find a false-positive match from a completely unrelated order and wrongly skip a
  real deduction — a real, not-yet-fixed correctness bug, low-frequency but real. **Not fixed
  yet as of 2026-07-16** — needs the check scoped to `restaurant_id=$X AND created_at::date =
  order's created_at::date` (or better, a proper boolean flag on the order, e.g.
  `stock_deducted_at`, instead of string matching).

## Inventory ingredient math — audit findings (2026-07-16)

User reported real-data mismatches, e.g. Shashlik Qiyma: started at 66, Stock Output tab showed
"58 consumption", but live stock showed 11 (expected 66-58=8, not 11 — looked like 3 phantom
units). Same pattern on Shashlik Mol Go'sht (30 start, "22 out" shown, stock=10, expected 8, off
by 2. Investigated without direct DB query access (Supabase MCP had no permission this session —
see above) — root-caused entirely from code + the user's screenshots:

- **Most likely explanation, NOT a bug**: `website/src/pages/admin/AdminInventory.jsx`'s "Stock
  Output" tab (`outMovements`, line ~252) only includes movements where
  `type IN ('OUT','WASTE','ADJUST','SHRINKAGE')` — it deliberately excludes `type='IN'`. But the
  round-2 `PUT /:id` diff fix (see above) legitimately logs `type='IN'` refund movements when an
  order edit *reduces* or *removes* a menu item's quantity (reason contains "removed item" or
  "items edited"). Those refunds ARE real stock increases and DO update `quantity_in_stock`
  correctly — they just show up on the separate "Stock Overview" tab (`inMovements`, `type='IN'`),
  not on "Stock Output". So manually computing "start − total shown on Output tab" will look wrong
  by exactly the sum of any such refunds, even though the live `quantity_in_stock` number itself is
  correct. The gap sizes the user reported (3 for Qiyma, 2 for Mol Go'sht) are small and very
  plausible as a handful of order-edit refunds. **Told the user to check the Stock Overview / IN
  tab for these two items, filtered to "removed item"/"items edited" reasons, to confirm the IN
  total matches the gap exactly** — not yet confirmed as of writing.
- **If that does NOT reconcile**, the next suspects (found during this audit, not yet ruled in/out):
  1. `RestaurantApp` (phone app)'s `screens/admin/AdminInventory.js` uses a **different, older
     backend API** (`inventoryAPI` → `/api/inventory/*` in `backend/src/routes/inventory.js`)
     than the website and the phone app's own `WarehouseScreen.js` (`warehouseAPI` →
     `/api/warehouse/*`). Both write to the same `warehouse_items.quantity_in_stock` column, but
     `/api/inventory`'s `PUT /:id` **overwrites `quantity_in_stock` directly with no
     `stock_movements` log at all**, defaults quantity to `0` if the request body omits it, and
     its `/waste` and `/record-waste` endpoints decrement stock but never touch `stock_batches`
     (batch/master total desync) and never log a `stock_movements` row either (only an `expenses`
     row). If restaurant staff use the phone app's (old) "Inventory" screen instead of "Warehouse",
     edits/waste there are **silently invisible** in the website's Output/Overview tabs while still
     changing the number everyone sees. This is a real, confirmed-by-code landmine — not fixed.
  2. `orders.js`'s `PUT /:id/status` has an undocumented "PRO WOS: AUTO-DEPLETION ENGINE" block
     (added by some prior process, not previously in this memory file) that deducts
     `stock_batches.quantity_remaining` (FIFO) every time an order's status becomes `served` OR
     `paid` — with no "already done" guard. Since orders normally pass through both statuses as
     separate calls, this double-depletes the *batch-level* numbers (not `quantity_in_stock`
     itself) — would show up as batches running out faster than the master count implies, and as
     wrong expiry-alert quantities. Not fixed.
- **Standing architecture problem, regardless of which of the above is the actual cause**: there
  are effectively three code paths that mutate `warehouse_items.quantity_in_stock`
  (`orders.js`'s multiple deduction sites, `warehouse.js`, and `inventory.js`), maintaining
  `stock_movements` and `stock_batches` with different (and in `inventory.js`'s case, incomplete)
  rigor. **Long-term fix worth proposing to the project owner: retire `/api/inventory` entirely,
  point the phone app's `AdminInventory.js` at `warehouseAPI` like `WarehouseScreen.js` already
  does, and centralize all stock mutation through one function** — same lesson as the "not
  centralized" note above, now with a second confirmed real-world instance of the risk.

## Mount lag between bash and Read/Write/Edit (discovered 2026-07-08)

- This AI has TWO separate views of the same `D:\The-Bill` folder: the file tools
  (Read/Write/Edit, Windows paths like `D:\The-Bill\...`) and the bash sandbox (Linux paths
  like `/sessions/.../mnt/The-Bill/...`). These can be out of sync with each other — a write
  made via one can appear "truncated" or stale when immediately checked via the other.
  Confirmed by direct evidence: an Edit-tool change to `orders.js` was verified complete and
  correct via `Read`, but `node --check` in bash on the "same" file reported a truncation at a
  suspiciously identical byte offset across multiple attempts — the bash mount was serving a
  stale snapshot, not real corruption.
- **Lesson: for files edited via Read/Write/Edit, verify them via Read — not via bash
  (`node --check`, `cat`, etc.) — especially right after a write.** If bash and Read/Edit
  disagree about a file's contents, trust Read/Edit; that's the view that matches what the
  user's actual machine (and any deploy pipeline reading from the real disk) will see.
- Do not "fix" an apparent bash-side corruption by copying content back over the file (e.g. via
  `cp`/`git show HEAD:... > file`) without first confirming via Read that the file is actually
  broken — doing so risks clobbering a real, already-correct Edit-tool change with stale
  content, which is what happened here (had to redo the same edit a second time after a bash
  `cp` overwrote it).

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
- Uses a separate tool he calls "Claude Design" to produce high-fidelity design handoffs (HTML
  prototype + README with exact design tokens + numbered screenshots) that he then drops into
  the project folder and asks this AI to implement pixel-for-pixel. Treat these as authoritative
  specs, not inspiration — read the whole README before writing any code.
- Explicitly checks this AI's claims against the real code before accepting them ("make sure you
  did not make any mistakes") — has caught real errors this way (e.g. wrong assumption that
  service charge / currency / clock-in needed new backend work, when they already existed). Any
  claim about "what's missing" or "what needs to be built" should be verified by reading the
  actual route/schema files first, not stated from a design doc's absence of mention.
- Will interrupt mid-task with "stop the job and leave a log" — when this happens, stop
  immediately (don't finish the in-flight file first if it's not already safe), verify nothing
  is left syntactically broken, and write the SESSIONS/STATUS/MEMORY update before responding.

## POS Terminal redesign (started 2026-07-26) — key facts for resuming

- Design handoff lives at `pos-app/POS Terminal Design System/design_handoff_pos_terminal/`
  (README.md + 14 screenshots) — re-read the README before touching any screen in this rebuild,
  it has the exact color/spacing/shadow tokens already extracted into `pos-app/src/pages/pos/
  tokens.js`. Don't re-derive tokens from screenshots; use `tokens.js`.
- New code lives entirely under `pos-app/src/pages/pos/` — one file per screen/modal, registered
  in `PosCashier.jsx`'s `SCREENS` map. The old `pos-app/src/pages/Cashier.jsx` (teal design) is
  kept but no longer routed — don't delete it until the redesign is fully verified working.
- **Naming rule (explicit, do not "fix"):** the design's "Server"/"Waiter" language is
  UI-display-only. Every DB column, API field, and role string keeps its original name —
  `orders.waitress_id`, `waitress_permissions` table, role string `'waitress'` in the
  `users` CHECK constraint. Renaming any of these breaks every other app reading them.
- **What admin/owner already control (verified against real route files, 2026-07-26 — do not
  reassume these need new backend work without re-checking):**
  - Currency symbol, tax rate/enabled, service charge rate/enabled, receipt/kitchen printer
    lists and per-line toggles — all via `restaurant_settings` / `GET,PUT /api/settings`.
  - Menu categories and kitchen stations — fully dynamic CRUD via `menu.js`
    (`/api/menu/categories`, `/api/menu/stations`), not fixed lists.
  - Table zones/sections — dynamic via `table_sections` table + `tables.js` `/sections`
    endpoints, not hardcoded "Main Hall/Patio/Bar".
  - Clock-in/out, manual attendance, payroll — fully built in `shifts.js`
    (`POST /api/shifts/clock-in`, `/clock-out`, `GET /active`, `/mine`, `/payroll`, etc.).
  - Loans list/stats/pay — `loans.js` (`GET /`, `GET /stats`, `PATCH /:id/pay`).
  - **The only genuinely new backend work for this whole redesign was refunds** — no refund
    endpoint existed before `POST /api/orders/:id/refund` was added this session.
- **`settings.js` `ALLOWED_ROLES` did not include `new_cashier`/`new_waiter`** before this
  session — the POS would have gotten 403 on every settings read. Fixed; if a future POS screen
  needs a different backend route that's role-gated to old roles only (`cashier`, `waitress`,
  etc.), check whether `new_cashier`/`new_waiter` need adding there too — this class of bug is
  easy to miss because the route "looks" like it should just work.
- **`api:get`/`apiGet` IPC pattern** (`main.js`/`preload.js`): a generic **read-only** passthrough
  to the backend for data that isn't in the local PowerSync schema (settings, shifts, loans,
  order history with joins). Explicitly GET-only by validation in the handler — every write
  still needs its own named IPC handler through `submitOrderWrite()` (or a dedicated one that
  calls it), same offline-queuing-insertion-point reasoning as the original Fire/Charge funnel.
  Don't repurpose `apiGet` for writes even for "simple" ones.
- **Refunds don't change `orders.status`** — a paid, refunded order stays `status='paid'` with
  `refunded_at`/`refund_reason`/`refunded_by` set instead. This was a deliberate choice to avoid
  touching the `orders_status_check` CHECK constraint (which would need a migration + auditing
  every place that branches on `status`) — anywhere that needs to distinguish a refunded order
  should check `refunded_at IS NOT NULL`, not add `'refunded'` to status comparisons.
- **Open question, not decided — do not resolve either direction without asking:** service
  charge is shown everywhere (receipts, this POS) but the backend has never added it into
  `orders.total_amount` (verified in `orders.js` POST / and PUT /:id — only tax is added to the
  charged total). Flagged to the owner; if they want it actually charged, the backend order-total
  math needs to change first, then the POS just re-reads the corrected total — don't add it
  client-side as a workaround.
- **Supabase MCP `execute_sql`/`list_tables` access is not reliably available every session** —
  denied with "You do not have permission" during the ingredient-math audit session, but worked
  fine in the very next session (used to diagnose the PowerSync replication-slot issue below).
  Treat it as "try it, don't assume it'll work" rather than permanently on or off.
- **PowerSync Cloud can silently stop replicating — check `pg_replication_slots` first when POS
  data isn't syncing.** Confirmed 2026-07-26: new orders/table-status changes visible on the
  website (direct Postgres) but never arriving in the Electron POS app, across old design and
  new redesign alike. Publication membership, `relreplident`, and `powersync_role` validity were
  all fine — the actual cause was `pg_replication_slots` returning zero rows, meaning PowerSync
  Cloud had no active connection to Postgres at all. This is diagnosable in one query
  (`SELECT * FROM pg_replication_slots;` via Supabase MCP) and is NOT fixable from this side —
  no API access to the PowerSync Cloud dashboard exists in this environment. The fix lives in
  PowerSync Cloud's dashboard (the "the-bill-pos" project's Development instance) — the user has
  to check/reconnect it there. A live sync-status badge now exists in the POS topbar
  (`PosShell.jsx`) so this class of issue is visible from inside the app going forward instead
  of requiring a DB query to notice.
- **All 8 screens are now built** (finished 2026-07-26, same session as the start, after a
  user-requested pause/resume in the middle). Nothing has been run in the real app yet — do not
  treat this as "done," treat it as "ready for its first real test." If a future session is asked
  to keep building on top of this (Kitchen/Admin/Owner/New Waiter phases, or further POS
  polish), check STATUS.md first for whether the real-machine test happened and what broke.
- **Pattern to keep applying:** before adding any UI element from a design mock, check whether
  real data backs it (grep the actual schema/route, don't infer from the mock alone). This
  session skipped the design's Break/Employee-ID/Edit-Profile fields on the Profile screen for
  exactly this reason — schema.sql has no columns for them. The user has explicitly flagged
  fabricated/assumed fields as "mistakes" and "mirages" before; the standing rule is to omit a
  field rather than fake it, and say so in a code comment.
- **Standing UX rule, overrides the design README where they conflict: editing an order on the
  Tables screen must stay entirely in-place — never navigate to the Orders screen.** The design
  handoff's own text says "Edit jumps to Orders in edit mode," and an early implementation did
  exactly that via a cross-screen handoff — the user explicitly rejected it ("I must stay at the
  tables page and edit it all from there"). `TablesScreen.jsx` now has its own full edit mode
  (items + order type + "Change on floor plan" table picker, mirroring Orders' edit UI). Do not
  "fix" this back toward the design doc's literal wording in a future session.
- **React footgun, bit us twice in one session: never bind `onClick={fn}` when `fn` has a
  default parameter you're relying on.** `onClick` always passes the DOM event as the first
  argument, so `(arg = someState) => ...` silently receives that event instead — the default
  only applies to a literal `undefined`, and an event object is truthy. This produced a
  "selected item's fields are all blank" bug (`OrdersScreen.jsx`'s `startEdit`) that looked like
  a data-loading race at first glance but was actually this. If a handler needs an argument,
  either give it no parameter and read from closed-over state instead, or wrap the call site
  explicitly: `onClick={() => fn(theRealArg)}`.
- **Tables icon must look like an actual restaurant table (top-down, table+4 chairs), never
  lucide's `TableProperties`** (that one reads as a spreadsheet grid and was explicitly called
  out as wrong). Fixed with a hand-built SVG in `pos-app/src/pages/pos/icons.jsx` (`TableIcon`).
  This only applies inside the active `pos-app/src/pages/pos/` redesign — the old unrouted
  `Cashier.jsx` was deliberately left untouched ("globally in pos-app only").
- **Add-to-existing-order feature (built 2026-07-27): tapping an occupied table from Menu while
  building a cart appends to that table's live order instead of creating a second order on the
  same table.** This mirrors a feature the old `new_cashier`/`Cashier.jsx` flow already had.
  Confirmed requirements from the user directly (do not relitigate without asking again): (1)
  the "adding to existing order" notice shows the instant the table is tapped, not just at Fire;
  (2) the cart view merges the existing order's items in live but keeps them visually distinct
  (read-only "Already In This Order" section) from what's newly being added ("Adding Now"); (3)
  only Fire is allowed in this mode, never Charge — payment still happens later from
  Orders/Tables; (4) the cashier stays on the Menu tab after firing, cart just clears. Backend
  call is the new `orders:addItems`/`ordersAddItems` IPC → `POST /api/orders/:id/items`
  (append-only, backend recomputes totals from ALL items) — deliberately NOT `orders:update`
  (`PUT /:id`), which replaces the whole item list and would double-count existing items.
  **Confirmed working on the real machine 2026-07-27.**
- **Editing `main.js`/`preload.js` requires a full Electron app restart to take effect, not
  just a renderer hot-reload — silent failure symptom to recognize: a button looks normal
  (not greyed out/disabled), click does nothing, no error banner, no loading spinner.** This
  happens because `window.electronAPI.xxx` doesn't exist yet on the still-running old preload
  bundle, so calling it throws a synchronous `TypeError` before the loading state can even
  flush, and with no `.catch` on the click handler the error only surfaces in the DevTools
  console, not the UI. Hit this exact symptom right after adding `ordersAddItems` — user
  suspected "permissions," but the actual fix was fully quitting and restarting `npm run dev`
  (not just `dev:renderer`). Check for this first whenever a *newly added* IPC call silently
  no-ops right after it was wired up, before investigating auth/role permissions.
- **Recurring bug class: backend routes missing `new_cashier`/`new_waiter` in their
  `authorize(...)` role list, left over from before those roles existed.** Hit three times now:
  `settings.js` (fixed 2026-07-26, would have blocked reading currency/tax settings), the refund
  endpoint (built correctly from the start 2026-07-26), and `PUT /api/orders/:id` (fixed
  2026-07-27 — this is what both Orders' and Tables' edit-mode "Done" button calls via
  `orders:update`; every save 403'd with the literal `{ error: 'Access denied' }` shown in the
  UI). **If a pos-app action ever shows "Access denied," grep the target route's
  `authorize('...')` call in `restaurant-app/backend/src/routes/*.js` first** — check
  `middleware/auth.js`'s `authorize` for the exact mechanism (`403` if `!roles.includes(req.user.role)`).
  Known-checked-clean so far: `orders.js` `PUT /:id`, `POST /:id/items`, `POST /:id/refund`,
  `settings.js`. Not yet checked: `PUT /:id/loan/pay` and `tables.js` `PUT /:id` (both still
  missing `new_cashier`/`new_waiter` as of 2026-07-27, but pos-app doesn't call either route
  today — grep pos-app before "fixing" these preemptively, don't assume they need it).
- **`restaurant-app/backend/` is its own nested git repo** (`github.com/JahongirMamadiyorov/the-bill-backend`),
  separate from the parent `The-Bill` repo's own `origin`
  (`github.com/JahongirMamadiyorov/The-Bill`). Backend fixes must be committed and pushed from
  inside `restaurant-app/backend/`, not the repo root — `git push` from the root pushes the
  wrong repo and does nothing for Render (which deploys from `the-bill-backend`).
- **This sandbox's mount of `D:\The-Bill` cannot `rm`/unlink certain git-internal files
  (`.git/index.lock`, temp objects under `.git/objects/**/tmp_obj_*`) — fails with `Operation
  not permitted` even though `ls -la` shows the current user as owner.** Confirmed this is a
  mount quirk, not a real permissions problem: `mv`-ing the same file to a different name in the
  same directory succeeds every time. Workaround when a git command fails with "Unable to
  create '.../index.lock': File exists" or similar: `mv .git/index.lock .git/index.lock.bak`
  (any destination name works), then retry. Also had no git identity configured in this sandbox
  the first time it needed to commit here — set locally (not `--global`) with
  `git config user.name "Jahongir"` / `git config user.email "m.jahongir2205@gmail.com"`. No
  GitHub push credentials exist in this sandbox either — `git push` will fail with "could not
  read Username for 'https://github.com'"; hand the push back to the user rather than trying to
  authenticate.
- **Weighed-item logic (`isWeighedItem`/`unitSuffix`/`formatQty`, and the type-an-amount modal)
  now lives in shared files, not per-screen copies — `pos-app/src/lib/weighed.js` and
  `pos-app/src/pages/pos/AmountPickerModal.jsx`.** It originally existed only inside
  `MenuScreen.jsx` (built 2026-07-07/08); when Orders'/Tables' in-place edit modes were built
  later, they never got it, so editing a kg/l/g/ml item there silently rounded to whole units
  via blind `+1`/`-1` — fixed 2026-07-27 by extracting instead of copy-pasting a third time.
  **If any screen ever adds its own "add item to a list" interaction, wire it through these
  shared files, not a new local `isWeighedItem`/modal** — that's exactly how this bug happened.
  Also: when checking `isWeighedItem(x)`, `x` must be the real `menu_items` row (has `.unit`) —
  a couple of call sites used to synthesize a partial `{id, name, price}` object (e.g. a
  stepper button building its own object instead of looking the item up in `menuById`), which
  silently defeats the check since `.unit` comes back `undefined` → treated as `'piece'`.
- **The amount picker for weighed items (kg/l/g/ml) has two distinct modes — don't collapse
  them back into one "prefill with current, replace on confirm" behavior.** `mode: 'add'`
  (wired to every ADD button and every `+` stepper) opens BLANK and SUMS the typed amount onto
  whatever qty already exists; `mode: 'set'` (wired only to the `-`/minus stepper) prefills with
  the current qty and REPLACES it on confirm. This distinction exists because of a real,
  reported mistake: with only "replace" semantics, tapping ADD/+ on an item already at 0.5 kg
  reopened the field prefilled with `0.5`, and a cashier typing "1.33" meaning "add 1.33 more"
  silently overwrote the order to `1.33 kg` instead of the correct `1.83 kg`. If a future screen
  wires up its own ADD/+ for a weighed item, it MUST use `'add'` mode, not `'set'` — `'set'`
  reproduces the exact bug that was just fixed.
- **pos-app never opens its own WebSocket connection to the backend.** Only the old
  cashier-panel/print-agent side uses `server.js`'s WS (`/ws`, 30s keep-alive ping for
  real-time kitchen print push). This matters for speed reasoning: whether Render is "warm"
  (no cold start) when pos-app makes a write (Fire/Charge/Save/addItems) depends entirely on
  whether some OTHER client happens to be connected via WS at that moment — pos-app itself
  can't be blamed or credited either way.
- **Do not casually recommend "just keep Render always-on" without flagging the 750-hour risk
  it already caused once.** The original 2026-07-06 Render suspension happened because
  something (very likely the WS keep-alive traffic) kept the free-tier service running 24/7,
  which uses up the ENTIRE monthly 750-hour free allowance (a 31-day month is 744 hours — right
  at the edge) and got the account suspended, requiring a full migration to a new account/URL.
  If asked to set up a keep-alive pinger again, scope it to actual operating hours (e.g. ~14h/
  day ≈ 420 hrs/month) rather than 24/7, and say why.
- **There is no staff/avatar photo feature anywhere in this codebase — only `menu_items.image_url`
  exists.** Checked directly (grepped `restaurant-app/backend/src/routes/users.js`, `schema.sql`,
  and `pos-app/src/pages/pos/ProfileScreen.jsx`) after almost stating the opposite unverified —
  staff are shown via initials chips only (see Profile screen). Don't assume an avatar-upload
  path exists or extend the photo-cache/upload logic to "cover" it without re-checking; this was
  a real caught mistake, not a design choice.
- **Local photo disk-cache for menu-item images (built 2026-07-27)** — custom `app-photo://`
  Electron protocol (`main.js`, registered via `protocol.registerSchemesAsPrivileged` before
  `whenReady`/`protocol.handle` inside it), backed by `app.getPath('userData')/photo-cache`.
  Deliberately has no invalidation logic: `menu.js`'s multer `diskStorage.filename` produces
  `${Date.now()}-${random}${ext}`, so a cached file can never go stale — a re-uploaded photo gets
  a brand-new filename, never overwrites the old cached one. `src/lib/localPhoto.js` rewrites a
  known `/uploads/menu/<file>` URL to the local scheme; only wired into `MenuScreen.jsx` so far
  (the one place pos-app renders a menu photo — old unrouted `Cashier.jsx` untouched, same rule
  as elsewhere). If a future screen ever renders a menu-item photo, route it through
  `localPhotoSrc()` too rather than hitting the backend URL directly.
- **Plus Jakarta Sans is self-hosted, not loaded from Google Fonts (changed 2026-07-27).** One
  variable-font woff2 (`pos-app/src/assets/fonts/PlusJakartaSans-Variable.woff2`, weights 400-800
  via its own HVAR/MVAR/STAT tables) + one `@font-face` rule in `index.css`. No more
  `fonts.googleapis.com`/`fonts.gstatic.com` in the CSP or `index.html` — don't re-add a Google
  Fonts link if a future design pass wants a font tweak; add another local file/weight instead.
- **History and Receivables now show a "last updated"/stale badge (built 2026-07-27)**, backed by
  shared `pos-app/src/lib/staleCache.js` (`loadCached`/`saveCached`/`timeAgo`, plain
  localStorage). Both screens seed their list from cache on mount and flip the badge to a coral
  "Offline — showing data from Xm ago" state if the most recent `apiGet` refresh failed, instead
  of silently leaving stale data on screen with no indication. If a future screen gets the same
  "reads live from the backend, no offline signal" gap, reuse this helper rather than rebuilding it.
- **`pos-app/src/components/ConfirmDialog.jsx` now exists (ported verbatim 2026-07-27, for the
  Admin Menu screen's station-delete confirm + upload notices)** — a styled `window.confirm`/
  `alert` replacement, `setDialog({title, message, type, confirmLabel, onConfirm})` +
  `<ConfirmDialog dialog={dialog} onClose={...}/>`. Dashboard/Tables never needed it; any future
  Admin screen ported from the website that used the website's `components/ConfirmDialog.jsx`
  should reuse this one, not re-port it.
- **Established UI pattern for the `menuAPI.uploadImage`/`settingsAPI.uploadLogo` stubs (both
  throw "not yet supported" — see `client.js`'s header comment, real multipart/FormData IPC was
  never built): don't wire the picker to a handler that will throw on first use.** Render the
  upload control disabled instead, with an amber warning icon + short label + a tooltip pointing
  at the website Admin panel as the working alternative — see `MenuScreen.jsx`'s item-photo
  control (`admin.menu.uploadNotSupportedLabel`/`uploadNotSupportedHint` in en.json/uz.json) for
  the reference implementation. `AdminSettings`'s logo upload (task #29, not built yet) will hit
  the identical gap via `settingsAPI.uploadLogo` — reuse this same disabled-control pattern rather
  than re-deciding it. Existing-image preview + "remove" (pure local state, no upload call) stay
  fully functional either way — only the actual file-picker/upload action needs disabling.
- **`pos-app/src/components/Dropdown.jsx` and `pos-app/src/components/DatePicker.jsx` now exist
  (ported verbatim 2026-07-27, for the Admin Inventory screen's status/category/unit dropdowns and
  its date filters/expiry/due-date fields)** — custom `<select>`/`<input type="date">` replacements
  matching the website's own design exactly. Dropdown has no dependencies at all; DatePicker uses
  `createPortal` and only needed its `useTranslation` import path adjusted. Any future Admin screen
  ported from the website that used either of these should reuse these copies, not re-port them —
  same practice as `ConfirmDialog.jsx` before them.
- **Electron's renderer does not implement `window.prompt()` at all** (unlike `alert`/`confirm`,
  which Chromium does support, and which this codebase already replaces with the styled
  `ConfirmDialog` purely for visual-consistency reasons, not because they're broken). Discovered
  porting the Admin Inventory screen (2026-07-27): the website's `AdminInventory.jsx` calls
  `window.prompt()` twice (adjust a pending delivery line's quantity; ask for a removal reason) —
  calling it as-is in pos-app would silently no-op or throw. Fixed with a small local `promptModal`/
  `promptValue` state pattern inside `InventoryScreen.jsx` (a lightweight modal asking for the same
  single value, then calling the same handler) — kept local since nothing else has needed it yet.
  **If a future ported screen also uses `window.prompt()`, reuse this same local-modal pattern
  (or promote it to a shared component if a second screen needs it) — do not port a raw
  `prompt()` call through, it will silently break in the real app.**
- **Bare `window.confirm()` calls also get replaced in this port, same as `window.prompt()` — the
  build brief for this Admin work treats all three (`prompt`/`confirm`/`alert`) as "not reliably
  implemented" in Electron's renderer and requires grepping every ported screen for them,
  regardless of the more nuanced note above about Chromium technically supporting `confirm`/
  `alert`.** Found one real instance porting the Admin Staff screen (2026-07-27): the website's
  `AdminStaff.jsx` has a bare `confirm(t('admin.staff.deletePaymentConfirm', {...}))` guarding the
  delete-payment button in the payroll details modal, with no import of the website's own
  `components/ConfirmDialog.jsx` at all (unlike Menu/Inventory, which already use `ConfirmDialog`
  for their own confirm/alert-style prompts). Fixed in `StaffScreen.jsx` by routing it through the
  already-shared `ConfirmDialog` component instead (new local `dialog`/`setDialog` state) — same
  pattern Menu/Inventory already established for confirm/alert-style dialogs, just applied here
  because this specific source screen happened to use the raw browser API instead. **If a future
  ported screen has a bare `confirm(...)`/`alert(...)` call not already going through
  `ConfirmDialog`, replace it the same way — don't leave the raw browser call in, even though it
  may often still work.**
- **`pos-app/src/pages/admin/screens/StaffScreen.jsx` now exists (ported 2026-07-27, exported as
  `AdminStaffScreen`)** — Staff/Attendance/Payroll tabs, staff CRUD, live clock-in/out status,
  shift history, and salary-type-aware payroll with debt carry-over. Its live "on shift" status
  reads `shiftsAPI.getStaffStatus()` via REST (`GET /shifts/admin/staff-status`) throughout,
  deliberately not switched to local PowerSync even though `shifts`/`staff_payments` are now in
  the `powersync` publication (task #21) — that endpoint's "pick today's most relevant shift row
  per user" logic is real server-side business logic, not a plain table read, and the PowerSync
  Cloud Sync Streams config for those tables isn't live yet regardless. `permissionsAPI` is
  imported by the website's `AdminStaff.jsx` but has zero call sites there (confirmed by grep) —
  not ported, nothing to port; if a future screen needs actual waitress-permission toggles, it
  isn't this one.
- **Cross-screen deep-link pattern for the Admin panel, established 2026-07-27 (Orders screen,
  task #26) — reuse this, don't reinvent it.** The website passes state between admin pages via
  URL query strings read with react-router's `useLocation()`/`useSearchParams()` (e.g.
  `/admin/orders?open=<id>`, set by `AdminTables.jsx`'s "View Full Order" button). pos-app has no
  URL/query-string routing at all — `AdminShell.jsx`'s `goTo(path)` adapter (which every ported
  screen calls via its `navigate` prop) now parses any trailing `?key=value` query string off the
  path itself and stores values it recognizes in its own state (currently just `openOrderId`, for
  `?open=<id>`), then passes them down to whichever screen is active as plain extra props
  (`openOrderId`/`clearOpenOrderId`) alongside `navigate`. The receiving screen consumes the value
  in a `useEffect` and calls the paired `clear*()` function afterward so it doesn't re-trigger on
  a later re-render or a round trip through another screen. If a future ported Admin screen also
  needs to receive a query-string-style parameter from another screen's `navigate()` call, extend
  `goTo()`'s existing parsing (don't add a second, parallel mechanism) and follow the same
  prop-pair-plus-clear-callback shape.
- **`pos-app/src/pages/admin/screens/OrdersScreen.jsx` now exists (ported 2026-07-27, exported as
  `AdminOrdersScreen`)** — order list/tabs, detail modal, status flow, edit-in-modal, cancel/
  delete, and the Collect Payment modal (cash/card/QR/loan, discount, split). This was the first
  Admin screen ported so far where the source had real, reachable print code to actually remove
  (`usePrinter()`, `printReceipt`, `handlePrintCheque()`, a `restSettings`/`accountingAPI.
  getRestaurantSettings()` effect that only fed it, an `fmtOrderNum()` helper, the `Printer` icon,
  and a "Print Receipt" button in the payment modal's footer) — Dashboard/Tables/Menu/Inventory
  either had none or had it already dead-behind-`isCashier` from an earlier port. If a future
  screen (Loans, Staff, Settings) also has a working print button, expect to remove a similarly
  full set (hook + helper + button), not just a button.
- **A source `navigate()` target can point at a website page that was never ported into pos-app —
  check before wiring it through blindly.** `AdminOrders.jsx`'s "+ New Order" button called
  `navigate('/admin/new-order')`, the website's standalone `AdminNewOrder.jsx` route — but only
  that file's `isModal` branch was ever ported (as `NewOrderModal.jsx`, task #23, since
  `AdminTables.jsx` is its only caller and always uses modal mode). Redirected the button to
  `navigate('/admin/tables')` instead (the actual place a new order gets created in this build)
  rather than leaving it pointed at a screen key with no `SCREENS` entry, which would have
  silently landed on the generic "coming in a later build step" placeholder. If a future ported
  screen's button targets another website route, check whether that target was actually ported
  into pos-app's `SCREENS` map before wiring the `navigate()` call through unchanged.
- **`pos-app/src/pages/admin/screens/LoansScreen.jsx` now exists (ported 2026-07-27, exported as
  `AdminLoansScreen`)** — loans list/stats/search/status-filter, a date-range calendar picker (its
  own inline component, not the shared `DatePicker.jsx`), a loan details modal (pulls the linked
  order's items via `ordersAPI.getById`), and a collect-payment modal (cash/card/QR). No new
  shared deps needed at all — `loansAPI`/`ordersAPI`/`money`/`useTranslation` were already covered.
  **There is no "remind overdue" feature anywhere in the website's `AdminLoans.jsx`** — despite
  `client.js`'s `loansAPI.notifyOverdue()` existing with a real matching backend route, the source
  file has zero call sites for it (no button, no handler). Don't assume this feature exists or try
  to "restore" it in a future pass without an explicit request — it was never built on the website
  either, this isn't a porting gap. `loansAPI.getStats()` is the same story — exists in `client.js`,
  unused by the actual screen (which computes its own totals client-side from `getAll()`).
- **`pos-app/src/pages/admin/screens/SettingsScreen.jsx` now exists (ported 2026-07-27, exported as
  `AdminSettingsScreen`)** — Restaurant Info/Financial/Receipt Template/Kitchen Order Template tabs
  over a single `settingsAPI.get()`/`update()` round-trip, built against REST per task #21's
  standing recommendation (no polling, no local-PowerSync read attempted). The whole "Printers" tab
  (receipt/kitchen printer IP/port fields, station assignment, the connect-a-printer guide, add-
  printer forms) was removed entirely as dead code — the specific "printer IP/port settings fields"
  a restaurant-settings screen was expected to have, per the standing printing-exclusion rule.
- **New reusable pattern from that exclusion, worth applying to any future screen that drops a
  whole settings section's UI while the section's fields still live in the same save payload as
  everything else: keep the excluded fields in local state, loaded and round-tripped UNCHANGED on
  save, even with zero UI to view/edit them.** `SettingsScreen.jsx`'s `receiptPrinters`/
  `kitchenPrinters` arrays are the concrete instance — without this, saving any unrelated field on
  that screen (e.g. currency symbol) would silently send both arrays back empty and wipe out real
  printer config entered via the website, since `PUT /settings` takes the whole form object, not a
  per-field patch. This risk only exists because a whole editable section was dropped from a
  shared-payload save endpoint — it does not apply to screens that just remove a single print
  button/call (Orders, task #26) since those never had a save-the-whole-object endpoint to begin
  with. If a future ported screen drops an entire section's UI for the printing exclusion (or any
  other reason) while other fields on the same screen still get saved via one combined
  create/update call, check whether the dropped section's own fields need this same "keep in state,
  never edit, always resend" treatment before assuming removal is safe.
- **`settingsAPI.uploadLogo` gap resolved the same way `menuAPI.uploadImage` was (see the entry
  below) — confirms the disabled-control pattern generalizes cleanly to a second, unrelated upload
  stub.** Reused the exact `admin.menu.uploadNotSupportedLabel`/`uploadNotSupportedHint` i18n keys
  rather than adding a settings-scoped duplicate pair, since the message ("not available yet, use
  the website Admin panel") reads correctly for any upload control in this app, not just Menu's
  item photos. If a third upload stub ever surfaces, prefer reusing these same generic keys again
  before adding a new pair, unless the wording genuinely needs to differ for that specific field.
- **`pos-app/src/pages/admin/screens/ProfileScreen.jsx` now exists (ported 2026-07-27, exported as
  `AdminProfileScreen`)** — the admin's own profile info, edit-profile modal, and change-password
  modal. **This was the 9th and last Admin screen — the full sidebar screen-porting effort (tasks
  #20-30) is now functionally complete end-to-end**, though nothing has been tested on a real
  machine yet for any of the 9 (see STATUS.md's "Admin panel build complete — summary" section for
  the full outstanding-work picture: real-machine testing, task #21's still-pending PowerSync Cloud
  Sync Streams config, printing as the next explicit phase, and a few small carried-forward gaps).
  No AuthContext in pos-app, so this screen's `authUser`/`updateUser` (website's `useAuth()`) became
  a local `profile` state seeded from the `user` prop + `usersAPI.getMe()` on mount — same "use the
  already-passed-down user prop" fix as every other screen needing the current user. One new prop
  threaded through `AdminShell.jsx`: `onLogout` is now passed to every active screen (not just the
  sidebar's own Sign Out button), since this is the first screen with its own in-screen Sign Out
  action needing the same centralized logout flow. Known, deliberately-flagged (not silent)
  limitation: editing your name/phone here doesn't live-update the sidebar's own name/avatar until
  next login, since there's no callback wired back up through `App.jsx` for it — judged out of scope
  for a cosmetic staleness gap on the very last screen; re-verified there is still no avatar/photo
  upload feature anywhere in this codebase (confirmed again directly against the real file, not
  assumed from the earlier note two entries below).
- **Task #31 (converting Admin screens' REST reads to local PowerSync), progress so far:**
  Tables (2026-07-28, first), Loans (2026-07-28, second), Menu (2026-07-28, third), Orders
  (2026-07-28, fourth), Inventory (2026-07-28, fifth), and Staff (2026-07-28, sixth) are done — see
  STATUS.md's own sections for each for the exact per-read reasoning. Remaining: Dashboard,
  Settings, Profile. Standing rules for every remaining screen, established by these six
  conversions — don't relitigate, just follow:
  (1) only reads change, every write stays on REST unchanged; (2) verify each REST endpoint's
  actual query (joins, computed columns) against the real backend route file before writing local
  SQL, don't guess; (3) if a REST read does something a local SQLite query genuinely can't
  replicate faithfully (Tables hit two such cases — a computed order-total subquery and a
  two-source section merge — both still handled fine locally in the end, just called out
  explicitly), leave that one read on REST and say so rather than approximate it; (4) camelize
  every local result via `case.js`'s `camelizeRow`/`camelizeRows`, checking `BOOL_FIELDS` for any
  boolean columns the screen touches; (5) no `restaurant_id` filter needed on local queries —
  already confirmed project-wide via `auth.js`'s `powersync-token` endpoint; (6) verify with the
  Linux esbuild scratch install (`/tmp/esbuildcheck`) after every file change. **None of this has
  been tested on a real machine yet for Tables, Loans, Menu, Orders, Inventory, or Staff** — that's
  the next concrete step before continuing further screens, not a formality.
  - **Menu-specific findings worth carrying forward:** a REST read can hide a genuinely non-trivial
    query behind an innocuous-looking API call from a *different* route file than the screen's own
    (Menu's ingredient-search picker calls `warehouseAPI.getAll()`, which lives in `warehouse.js`,
    not `menu.js` — its real route does a supplier LEFT JOIN plus a per-row N+1 `stock_batches`
    fetch; neither was needed here since this screen only reads `id`/`name`/`unit` off each row,
    but check the *actual* file the API call hits, not just the screen's most obvious route file).
    Also: when a screen's writes already re-fetch the same list afterward (Menu's category/item/
    ingredient saves all did this), pull the converted read into its own named `fetchX()` helper
    function rather than inlining the query at the call site — that way the write's post-save
    refetch (a read, not a write) can reuse the same converted function instead of leaving a
    second, parallel REST call sitting next to the newly-converted one. `isAvailable` was
    double-checked against `BOOL_FIELDS` per the task brief's explicit flag and confirmed already
    present/correct (added when `case.js` was first built) — not a bug, but worth the explicit
    verification since this screen's whole availability-toggle UI depends on it.
  - **Orders-specific findings worth carrying forward (biggest/richest screen converted so far):**
    Postgres `LEFT JOIN LATERAL ... ORDER BY created_at DESC LIMIT 1` (picking "the latest row per
    group" — here, the most recent `loans` row per order) has no direct SQLite equivalent, but
    replicates cleanly with a `ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY created_at DESC)`
    window function filtered to `rn=1` in the outer query — better-sqlite3 (PowerSync's local
    engine) supports SQLite window functions, confirmed working via the esbuild+later real-query
    shape, no separate workaround needed. Also: a REST list route can join several tables
    (`restaurant_tables`/`users` twice/an item-count subquery) where the screen only actually reads
    ONE of the joined columns off the row itself (`table_name`, here) and gets everything else
    (waitress name, item counts) from a *separate* local lookup/computation instead — always grep
    every way a field is read (`order.xxx` AND `orderRowVariable.xxx` for every differently-named
    variable holding an order, e.g. `selectedOrder`/`paymentOrder`/`cancelTarget`/list items) before
    assuming a joined column is actually consumed; three of four joins here (`waitress_name`,
    `collected_by_name`, `item_count`) turned out to be dead weight once actually checked. Nested
    response objects (the detail route's own `loanDetails: {...}` sub-object, distinct from the list
    route's flattened `loan_status`/`loan_customer_name`/etc. columns) must be replicated as their
    own nested object too, not just flattened to match the list shape — the component code reads
    both shapes with an explicit fallback chain (`ld?.customerName || selectedOrder.loanCustomerName`)
    and silently loses the "prefer the fresher nested detail" behavior if only the flat columns are
    provided.
  - **Inventory-specific findings worth carrying forward (largest screen converted so far, ~2170
    source lines):** a computed/aggregated REST read isn't automatically "must stay on REST" — it
    depends on WHERE the aggregation happens. `procurementAPI.getDeliveriesDebt()`'s
    `SUM(total)`/`COUNT(*)` aggregate happens entirely in SQL with no app-side logic, so it
    converted cleanly to a local aggregate query; `procurementAPI.getSuggestedOrders()` also starts
    with a SQL aggregate but then does real grouping/rounding/cost-estimation in a JS `.reduce()` on
    the backend (`{supplier, items[]}[]`, `Math.ceil()`-rounded suggested quantities, computed
    `estimated_cost`) — that one stayed on REST. Always check whether the route does anything AFTER
    the SQL query, not just whether the query itself has a `SUM`/`COUNT`/`JOIN`. Also: a read fetched
    into state can be completely dead in the UI (`suggestedOrders` here is fetched every load but
    never rendered anywhere in the JSX, confirmed by grep) — leaving a dead read on REST during a
    reads-only conversion is fine and shouldn't be "fixed" by either converting or removing it,
    since neither is in scope for this task. Also confirmed a second real instance of the
    "N+1 sub-fetch dead weight in one screen, genuinely needed in another" pattern Menu already
    established: `warehouseAPI.getAll()`'s per-row `stock_batches` N+1 was dead weight for Menu's
    ingredient picker (only `id`/`name`/`unit` read) but genuinely needed here (Inventory's Stock
    Overview tab reads `item.batches[].quantityRemaining`/`.expiryDate`/`.receivedAt` for the
    nearest-expiry badge and expandable batch list) — same API call, same route, different screens,
    different answer; always grep the CONSUMING screen, never assume a prior screen's dead-weight
    verdict carries over. SQLite has no `NULLS LAST` — emulated with `ORDER BY expiry_date IS NULL,
    expiry_date ASC` (sorts real dates first, nulls last), a reusable trick for any future screen
    needing the same "nulls sort last" ordering Postgres gives for free.
  - **Staff-specific findings worth carrying forward:** confirmed the task brief's own prediction
    that a screen's "live status" view is a real REST-only case — `shiftsAPI.getStaffStatus()`
    (GET /shifts/admin/staff-status) does a `DISTINCT ON (user_id)` priority pick (active shift >
    completed > absence) plus a derived three-way status the raw row never has — left on REST,
    not force-converted. New SQLite ordering fact, opposite of Inventory's: a plain `ORDER BY x
    DESC` needs NO `NULLS LAST` trick at all — SQLite already sorts NULL as the smallest value, so
    descending order puts NULLs last on its own (only ASC needs the explicit `x IS NULL, x ASC`
    workaround Inventory used). Postgres's `EXTRACT(EPOCH FROM (a - b))/3600` (elapsed hours
    between two timestamps) translates to SQLite as `(julianday(a) - julianday(b)) * 24` — reusable
    for any future screen computing elapsed-time/duration columns locally. Also re-confirmed the
    "grep the CONSUMING screen before trusting a join is needed" rule yet again: `shiftsAPI.getAll`
    and `staffPaymentsAPI.getAll`'s real routes each join `users` for a name column
    (`u.name`/`staff_name`), but this screen already has the full staff list loaded separately and
    always looks names up via `staff.find()` — both joins were dead weight here specifically. Found
    (not converted, out of explicit task scope): `menuAPI.getStations()` hits `custom_stations`, a
    table that's already fully synced and would convert with zero difficulty — flagged as a
    legitimate candidate for a future pass rather than a table this task was scoped to.
- **Confirmed real, applied free performance wins (2026-07-27), don't redo/re-suggest these:**
  5 missing FK indexes added (`orders.table_id`, `orders.waitress_id`,
  `order_items.menu_item_id`, `menu_items.category_id`, `restaurant_tables.assigned_to`) plus
  one duplicate index dropped (`finance_manual_income`), applied via Supabase migration
  `add_hot_path_fk_indexes`; 7-day `Cache-Control` on menu photo serving
  (`restaurant-app/backend/src/server.js`, safe because upload filenames are timestamp+random
  and never reused). Still open, not yet acted on further: pos-app was confirmed running via
  `npm run dev` (not the packaged `build:win` installer) as of 2026-07-27 — worth checking
  again if speed comes up; a Render keep-alive pinger was discussed and approved in principle
  but not yet actually set up (needs the user to create a free UptimeRobot/cron-job.org
  account, can't be done from this sandbox).
- **Task #31 is now COMPLETE (2026-07-28) — all 9 Admin screens evaluated for local-PowerSync-read
  conversion.** 7 of 9 got at least one real conversion (Tables, Loans, Menu, Orders, Inventory,
  Staff, Dashboard); Restaurant Settings stayed entirely on REST (see below); Profile got exactly
  one small real conversion. Every write across all 9 screens stays on REST unchanged — PowerSync's
  write queue was never used anywhere in this task, per RULES.md §4.
  - **`pos-app/src/pages/admin/screens/DashboardScreen.jsx`** — ten reads converted (tables,
    low-stock, warehouse-all, warehouse-movements-with-date-filter, deliveries-debt+fallback,
    staff-payments, loan-stats, notifications, best-sellers, today's-orders). Needed `user` added
    to its props for the notifications read (id-scoped) — `AdminShell.jsx` already passes `user` to
    every active screen (same mechanism as `onLogout`), no AdminShell change needed. Four reads
    stay on REST as genuine business logic (admin-daily-summary, staff-status, payroll) or a real
    sync gap (`accounting.getCashFlow` — `cash_flow` table isn't in `pos-app/powersync/schema.js`
    at all). One (`reportsAPI.getDashboard()`) deliberately left un-converted despite being simple,
    since it's a redundant fallback-only read behind an already-REST primary source.
  - **`pos-app/src/pages/admin/screens/SettingsScreen.jsx`** — re-verified and confirmed to stay
    on REST: `GET /api/settings` auto-INSERTs a default `restaurant_settings` row if none exists
    and returns it — a local-only SELECT can't replicate that self-healing insert. Combined with
    being a genuine one-time-per-visit read (no polling), left untouched.
  - **`pos-app/src/pages/admin/screens/ProfileScreen.jsx`** — converted: `usersAPI.getMe()` (GET
    `/api/users/me`, a plain single-row `users` lookup by current-user-id, explicit column list, no
    joins) → local `SELECT ... FROM users WHERE id = ?` using the `user` prop's id. Checked the
    cashier-side `pos-app/src/pages/pos/ProfileScreen.jsx` first for precedent — it never calls
    `usersAPI.getMe()` at all (reads shifts/orders via REST-only `apiGet`), so nothing to reuse.
  - **New portable SQL pattern from this session**: Postgres's `FILTER (WHERE ...)` aggregate
    modifier (used by `loans.js`'s `/stats` route) has no reliable SQLite equivalent across all
    builds — replicate with `SUM(CASE WHEN cond THEN val ELSE 0 END)` inside the aggregate instead,
    same result, fully portable. Add this to the existing SQLite-equivalents list (LATERAL/DISTINCT
    ON → ROW_NUMBER() OVER PARTITION BY; NULLS LAST → ORDER BY x IS NULL, x; EXTRACT(EPOCH...)/3600
    → julianday() arithmetic).
  - **Still outstanding, same as every prior task #31 session**: none of these conversions —
    across any of the 9 screens — have been tested on the real machine yet. This is the single
    most important next step before task #31 can be considered shippable.

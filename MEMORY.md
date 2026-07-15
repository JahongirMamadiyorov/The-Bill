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

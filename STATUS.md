# STATUS

Current snapshot of what's done and what's next. This file gets overwritten/updated in place
each session — for history of how we got here, see SESSIONS.md.

## 2026-08-02 (LATEST): receipt/cheque printing BUILT — needs a real printer test

Customer receipt printing is complete in code and user-visible for the first time. **Not yet
tested on hardware** — that is the single next step.

- **Prints over the LAN from the terminal**, not via the backend's `POST /api/print/receipt`
  (which is how the website does it, round-tripping every receipt through Render). Layout is a
  faithful port of that route's `buildEscPos()` so pos-app and website receipts look identical.
- **Seven triggers wired:** cart Print, auto-print after payment (new `receipt_auto_print`
  setting, default true), POS Orders + Tables Print buttons, History reprint (works for refunded
  orders too), Admin Collect Payment (button restored + auto-print), and per-item **send to
  kitchen** / **print cheque** on each cart line.
- **Double-print prevention:** `sentQty` tracks what was sent to the kitchen individually; Fire
  prints only the remainder, and only the delta for partially-sent items. Only printing is
  deduplicated — the order write always sends the full cart.
- **Files:** migration `add_receipt_auto_print_setting`, `routes/settings.js` (4 whitelist
  edits), `printEngine.js`, `main.js`, `preload.js`, `useSettings.js`, new `src/lib/receipt.js`,
  `pos/MenuScreen|OrdersScreen|TablesScreen|HistoryScreen`, `admin/screens/OrdersScreen|
  SettingsScreen`, `lib/i18n.js`, `i18n/en.json`, `i18n/uz.json`.
- **Known quirk, replicated deliberately:** tax and service charge appear on the receipt but are
  NOT added to the total (the website computes `total = order − discount`, and MenuScreen already
  labels service "not charged"). Changing it needs a payment-logic decision first, not a receipt
  change.

**Test list:** all seven triggers; a dish sent individually must NOT reprint on Fire; auto-print
must respect the toggle; Uzbek strings must read correctly. A TCP listener on port 9100 works if
no printer is free.

## 2026-08-02 (earlier): RLS/anon data exposure found and closed

Asked "what is RLS?" — checking the real state turned the year-old advisor warning into a
confirmed live exposure. All 37 public tables had RLS off while `anon`/`authenticated` held
SELECT/INSERT/UPDATE/DELETE/TRUNCATE on every one, with PostgREST live. Because the anon key is
public by design, anyone holding it could read/modify/delete every row over HTTPS, including
`users.password_hash`. The standing "the backend enforces access at the app layer" assumption was
wrong — PostgREST never goes through the app.

**Closed** by migration `close_anon_exposure_enable_rls_all_public_tables`: anon/authenticated
grants revoked (plus default privileges, so new tables can't regain them) and RLS enabled on all
37 tables, deny-by-default. Verified safe BEFORE applying via `pg_stat_activity`: `postgres`
(backend) and `powersync_role` both bypass RLS; only `authenticator` (PostgREST → anon) does not.
Verified after: 37/37 RLS on, 0 anon grants, `postgres` still sees all data.

**NEEDS CONFIRMING IN THE APP:** log in and use the POS/Admin normally to confirm nothing broke.
DB-level checks all pass, but `web_fetch` was returning cached responses so HTTP-level
verification was not trustworthy from here.

**If the backend is ever moved to a DB role without `rolbypassrls`, RLS with zero policies will
block it entirely** — policies must be written first.

## 2026-08-01: PowerSync WORKING — S2305 resolved, data leak fixed and verified

**Both problems are closed and confirmed on a real machine.** The Do'stlar 2 terminal — the
restaurant that had never once synced — now works.

- **S2305 RESOLVED.** Two independent causes, peeled back in order: (1) three sync-rules queries
  reached `restaurant_id` via INNER JOIN, which PowerSync compiles into real parameter queries
  (3,433 rows for this restaurant) — fixed by denormalizing `restaurant_id` onto `order_items`,
  `delivery_items`, `menu_item_ingredients` (migration + backfill + index + trigger); (2) the
  actual final blocker, a PowerSync SERVICE regression (`powersync-service#611`, since 2026-04-21)
  that counts DATA ROWS as parameter results for `auto_subscribe` streams with no CTE — fixed by
  the one-row CTE workaround now deployed. **Cause (1) was a prerequisite for (2)**, since #611
  re-triggers on CTEs referenced inside nested subqueries.
- **Cross-restaurant data leak FIXED AND VERIFIED.** Root cause was two code bugs, not the cloned
  disk image previously guessed: `auth:logout` called `disconnect()` instead of
  `disconnectAndClear()`, and `App.jsx`'s `handleLogout` never reached the main process at all.
  Confirmed live: the affected terminal logged `local-data-cleared`, reported `Last synced: Never`
  and showed an empty Menu — stale data genuinely gone.
- **Sync rules are now versioned** at `pos-app/powersync/sync-rules.yaml` (previously dashboard-
  only). The dashboard is still what runs — keep both in sync by hand.

**MUST CHECK NEXT SESSION:** `local-data-cleared` must NOT fire on a clean launch with no logout.
If it does, the `psOwner` marker isn't persisting and every terminal re-downloads everything on
every start. This could not be tested until sync succeeded once, which only just happened.

**Offered, not built:** retry-with-backoff in `request()` for transient TLS/cold-start login
failures; `electronLanguages: ["en-US"]` to cut ~40MB of unused Chromium locales; scoping synced
orders by age (26,000 order_items per terminal is heavy — performance, not a limit).

**Still untested from earlier sessions:** Printers tab in Admin Settings, the 7 kitchen print call
sites, Login screen show/hide + language toggle.

## 2026-08-01 (earlier): S2305 is a PowerSync SERVICE regression; leak fix confirmed working

- **DONE + VERIFIED ON A REAL MACHINE — the cross-restaurant data leak.** A Do'stlar 2 terminal
  logged `local-data-cleared`, reported `Last synced: Never` and showed an empty Menu — the
  previous day's stale data was genuinely wiped. The 2026-07-30 incident is closed: root cause
  found (logout never cleared local data; `handleLogout` never even reached the main process),
  fixed, and confirmed live.
- **OPEN — S2305, and it is NOT our sync rules.** It survived the denormalization migration AND
  the rules deploy. Cause found by research: `powersync-ja/powersync-service#611` — since the
  **2026-04-21** system update, a stream with `auto_subscribe: true` and **no `with:` block**
  counts TOTAL DATA ROWS as parameter query results (cap 1000). Our stream is that shape;
  this restaurant has ~26,000 `order_items`. Proof it's the regression: every query now filters
  `restaurant_id` directly with zero joins/subqueries and the count still exceeded 1000.
  **Workaround written and handed over: `pos-app/powersync/sync-rules.yaml`** — a one-row CTE
  (`with: restaurant_scope_ids`) plus `WHERE restaurant_id IN restaurant_scope_ids` everywhere.
  **REMAINING: user pastes that file into the PowerSync dashboard, validates, deploys.**
  Note the 2026-07-31 migration was a prerequisite, not a detour — issue #611 says referencing the
  CTE inside a nested subquery re-triggers the bug, so the workaround would not have applied
  cleanly to the old JOIN-based queries.
- **Clarification worth keeping:** the 1000 limit is on BUCKETS per user, not on syncable rows.
  Splitting orders into batches cannot fix it — that creates more buckets, not fewer.
- **Sync rules are now versioned in the repo** (`pos-app/powersync/sync-rules.yaml`). They used to
  exist only in the dashboard. The dashboard is still what runs — keep both in sync by hand.
- **Transient, not a bug:** "Client network socket disconnected before secure TLS connection was
  established" at the login screen is Render free-tier cold start (backend confirmed healthy via
  a direct `/health` fetch). `request()` has a 15s timeout and no retry, so one dropped handshake
  = a hard login failure. Offered retry-with-backoff; not yet built.
- **Watch after the next deploy:** `local-data-cleared` fired 3x in one session, each "no
  ownership marker". Consistent with logging out between attempts (logout deletes it by design),
  but after a normal launch with no logout it must NOT fire again — otherwise every terminal
  re-downloads everything on every start. Undiagnosable until sync completes once.

## 2026-07-31: PowerSync failure diagnosed — sync-rules limit + the real
## cross-restaurant root cause

The badge's new event log produced the actual error in one rebuild:
`[PSYNC_S2305] Too many parameter query results (limit of 1000)`.

- **DB FIXED, sync-rules deploy pending — S2305.** Root-caused from the real YAML: three of the
  ~23 stream queries reached `restaurant_id` via an INNER JOIN to a parent, and PowerSync compiles
  each such join into a parameter query capped at 1000 rows. `order_items` JOIN `orders` returned
  **3,433** for Do'stlar 2 (vs 62 on the dev machine — a data-volume failure, never machine-
  specific, and the dev machine can never reproduce it). `delivery_items` and
  `menu_item_ingredients` had the identical shape and would have broken at 1,000 too.
  **Fix applied to production Supabase** (migration `denormalize_restaurant_id_for_powersync_s2305`):
  `restaurant_id` added + backfilled + indexed on all three, with a BEFORE INSERT/UPDATE trigger
  per table so no backend insert path can miss it (backend code unchanged by design). Verified:
  0 NULLs, 0 parent mismatches.
  **REMAINING: the user must paste the three rewritten queries into the PowerSync dashboard and
  deploy** — each becomes a plain `WHERE restaurant_id = auth.parameter('restaurant_id')`, keeping
  the synthetic `menu_item_id || ':' || ingredient_id as id` for the composite-key table.
- **FIXED — the 2026-07-30 cross-restaurant leak, root cause finally confirmed.** It was two code
  bugs, not the cloned disk image MEMORY.md had guessed: (1) `auth:logout` called `disconnect()`
  instead of `disconnectAndClear()`, so the local SQLite kept every synced row forever, and every
  screen reads locally since task #31; (2) `App.jsx`'s `handleLogout` never called the logout IPC
  at all, so in-app logouts left the session in electron-store too. Proof: an affected machine's
  dump reported `Last synced` from the PREVIOUS DAY on a "fresh" install.
  Fix: new `psOwner` marker + `ensureLocalDataBelongsToCurrentUser()` before every connect
  (missing marker counts as a mismatch, so existing machines get flushed once), `auth:logout` now
  clears, and `handleLogout` awaits the IPC on every path.
  Files: `main.js`, `powersync/connector.js`, `src/App.jsx`, `src/pages/pos/PosShell.jsx`,
  `src/lib/i18n.js`.

**Next step, in this order:** (1) deploy the rewritten sync rules in the PowerSync dashboard —
the database side is already done, so they will validate; (2) rebuild the app; (3) verify on a
real machine: the badge should reach green Online on a Do'stlar 2 terminal (it never could
before), then log out and confirm the local DB is emptied, log in as a different restaurant on
the same machine and confirm no trace of the previous one, and confirm the one-off re-sync fires
on the first launch after this update.

## 2026-07-31: packaging CLOSED — zip build verified working on a real machine

**The Windows packaging saga is over.** All five fixes from the 2026-07-29/30 sessions were
rebuilt and tested: the zip build launches, the topbar shows green **Online** (which requires
PowerSync connected AND synced AND backend reachable — so the native sync extension genuinely
loads now), the Cashier Menu renders real data from local PowerSync SQLite, and the "Continue
as {user} / Not you? Log out" resume screen works. The pre-build worry about spawning an ESM
worker from inside `app.asar` did not materialize.

- **Still open, permanently:** the NSIS installer crash (`nsis7z.dll`, 0xC0000005). Researched
  to a dead end 2026-07-30 — known unfixed electron-builder bug. **Distribute the `.zip`.**
- **New this session:** the topbar badge is now self-diagnosing. Clicking it opens a panel
  breaking "Offline" into its three real checks (PowerSync connected · Local data synced ·
  Backend reachable), showing the actual error string `main.js` now retains (`psLastError` —
  previously console-only, i.e. invisible on a packaged app), last-synced/last-checked times,
  a Re-check button, and a Copy details button producing a pasteable plain-text dump. This
  exists so the *other restaurants'* machines can be diagnosed remotely, which was impossible
  during the 2026-07-30 incident. The Online/Offline decision itself is unchanged.
  Files: `main.js`, `src/pages/pos/PosShell.jsx`, `src/lib/i18n.js` (12 new UZ strings).
  All verified (`node --check`, esbuild, i18n duplicate-key check, lucide icon existence).

**Next step:** rebuild, click the pill, confirm the three rows / Copy details / Uzbek reading.
Then the actually valuable test — get the new zip onto a machine that shows Offline and read
which leg the panel says is failing. Note Render is free tier (~50s cold start), so a healthy
machine legitimately shows Offline for the first minute after launch; the panel now makes that
distinguishable from a real failure.

Still untested from earlier sessions (unchanged): Printers tab in Admin Settings, the 7 kitchen
print call sites, Login screen show/hide + language toggle.

## 2026-07-29: first Windows packaging attempt — two real bugs found, one still open

User built the first-ever packaged Windows installer (`npm run build:win`) and hit a real,
reproducible crash: `The Bill POS Setup 0.1.0.exe` crashes every single time with
`STATUS_ACCESS_VIOLATION` (`0xC0000005`) in `nsis7z.dll` (electron-builder's bundled NSIS 7z
plugin), confirmed via Event Viewer — same DLL version/timestamp, same fault offset, across
multiple rebuilds (cache cleared, `compression: "store"` added). Ruled out via direct testing:
antivirus real-time protection off (still crashed), a different machine/account (still crashed),
missing VC++ redistributables (already present). **Root cause of the NSIS crash itself is still
unresolved** — it now looks like a genuine incompatibility between this environment and the
specific `nsis7z.dll` build electron-builder bundles, not a corrupted download or a config
mistake on our end.

**Two separate, real bugs found and fixed while chasing this, both unrelated to the NSIS crash:**

1. **The packaged app itself was broken independent of the installer** — testing the raw
   unpacked folder directly (bypassing the installer entirely) surfaced `Error: Cannot find
   module './powersync/schema'` at startup. Root cause: `package.json`'s `build.files` array is
   an explicit allowlist of what electron-builder copies into the packaged app, and it never
   included the `powersync/` directory (`schema.js`/`connector.js`, real files `main.js`
   requires) — only `main.js`, `preload.js`, `dist/**/*`, `build/**/*`, `node_modules/**/*`. This
   never mattered in dev (`npm run dev` reads files straight off disk, no allowlist involved) and
   apparently was never caught because this is the first time the app was ever packaged at all.
   **Fixed:** added `"powersync/**/*"` to the `files` array.
   - **Same bug, round 2:** after rebuilding with that fix, both the zip and the installer got
     one step further and then crashed with `Error: Cannot find module './printEngine'` —
     `printEngine.js` (the kitchen print engine, `main.js` line 31) is a root-level file, same
     situation as `powersync/`, also missing from `files`. Fixed by adding `"printEngine.js"`
     explicitly. **This time the entire dependency graph was traced by hand** (every relative
     `require()` in `main.js`, `preload.js`, `printEngine.js`, `powersync/schema.js`,
     `powersync/connector.js`, plus every `path.join(__dirname, ...)` file read) to rule out a
     third round of this — nothing else local is missing from `files` as of this fix.
   - **Round 3, a different bug class:** with both module-not-found bugs fixed, the packaged app
     (zip) now actually launches and renders the full UI — but the topbar shows "Offline" and
     Orders shows "Failed to load orders" despite real internet access. Root cause (confirmed
     against electron-builder's own troubleshooting docs, not guessed): `asar: true` is set with
     no `asarUnpack` at all, and `better-sqlite3` (PowerSync's local SQLite storage engine —
     confirmed the actual native `.node` binary exists at
     `node_modules/better-sqlite3/build/Release/better_sqlite3.node`) is a native module. Native
     `.node` binaries cannot be loaded from inside an asar archive — this silently breaks
     PowerSync's local database entirely (topbar's "Online" pill requires PowerSync connected
     AND synced AND backend reachable — see `PosShell.jsx` — so PowerSync alone failing is enough
     to show "Offline" even with a live backend/internet connection; Orders'/Menu's "Failed to
     load orders/menu data" is their local PowerSync read throwing). **Fixed:** added
     `"asarUnpack": ["node_modules/better-sqlite3/**"]`.
   - **Round 4, same bug, a second native binary:** after rebuilding, still Offline / still
     failing to load local data. Found the real remaining cause by actually inspecting
     `node_modules` rather than assuming one native module was the whole story:
     `@powersync/node` ships its OWN native SQLite extension (`node_modules/@powersync/node/lib/
     powersync_x64.dll` etc., one per platform/arch — this is PowerSync's Rust-compiled
     "powersync-sqlite-core" loadable extension, separate from better-sqlite3). It's loaded via
     SQLite's native `sqlite3_load_extension` C API using a real filesystem path — asar's virtual
     filesystem doesn't work for that either, same underlying problem as better-sqlite3, just a
     second, different package. **Fixed:** added `"node_modules/@powersync/node/**"` to
     `asarUnpack` alongside better-sqlite3. Also did a full sweep of every `.dll`/`.node` file
     across all of `node_modules` to check for a third one — the rest (rollup/tailwindcss/
     lightningcss `.node` files, electron's own bundled `.dll`s) are Vite build-toolchain or
     Electron's own runtime, not something our packaged app's own code loads, so nothing else
     needs unpacking. Not yet rebuilt/tested.
   - **Round 5, the real remaining cause — asarUnpack alone wasn't enough.** After rebuilding
     with round 4's fix, still Offline, but now with NO thrown error (progress — the crash
     itself was gone). User ran the packaged exe from a PowerShell terminal per request (needed
     because a double-clicked packaged app has no attached console — `main.js`'s own
     `console.error('[powersync] connect failed', ...)` was invisible until this), which
     surfaced the real error for the first time:
     `SqliteError: The specified module could not be found` at `Database.loadExtension`, called
     from `@powersync/node`'s own `BetterSqliteWorker.js` → `SqliteWorker.js`. Root cause,
     confirmed by reading `@powersync/node`'s actual source in `node_modules`: its default
     worker computes the path to its native sync extension (`powersync_x64.dll`) via
     `import.meta.url` relative to ITS OWN location — correct in dev, but once running from
     inside `app.asar`, that computed string literally contains `.asar` and points at a virtual
     path. `loadExtension()` is a native call (better-sqlite3's C++ addon calling Windows
     `LoadLibrary` directly) that bypasses Electron's asar-aware `fs` shim entirely, so it fails
     even though the REAL file already exists on disk at the parallel `app.asar.unpacked`
     location thanks to round 4's `asarUnpack` fix. Confirmed better-sqlite3 itself was NOT the
     problem (it loads fine — the crash is specifically at the `loadExtension()` call, one line
     later). Cross-checked against PowerSync's own official Electron demo
     (`powersync-ja/powersync-js/demos/example-electron-node`) and their Node SDK docs
     (`database.openWorker` override, documented for a different use case — custom SQLite
     ciphers — but the same mechanism applies here) to confirm this is the sanctioned way to fix
     it, not a guess. **Fixed:** new `pos-app/powersyncWorker.mjs` (a custom worker replacing
     the library's default one) plus `main.js`'s `getPowerSync()` now computes the correct real
     path itself (`app.isPackaged` ? `process.resourcesPath/app.asar.unpacked/node_modules/
     @powersync/node/lib/<file>` : the plain dev `node_modules` path) and hands it to the custom
     worker via `workerData` (a JS function can't cross the `worker_threads` boundary, only
     data can). Added `powersyncWorker.mjs` to `package.json`'s `files` allowlist too. All
     changes syntax-verified (`node --check`, JSON-validated). Not yet rebuilt/tested.
   - **Cross-restaurant data-visibility incident, same day.** User distributed the built
     package to other test restaurants. Reports: some machines showed "Offline" permanently
     despite real internet, AND — more seriously — showed the user's OWN restaurant's menu/
     cashier panel on a machine before anyone had logged in. Investigated the backend's
     `/api/auth/powersync-token` route (`restaurant-app/backend/src/routes/auth.js`) directly —
     confirmed it correctly scopes the PowerSync JWT's `restaurant_id` claim to
     `req.user.restaurant_id` (the actually-authenticated user), not hardcoded — rules out a
     backend multi-tenant leak. Confirmed `electron-store`'s actual source
     (`node_modules/electron-store/index.js`) always defaults to `app.getPath('userData')`, a
     genuinely OS-per-user path — rules out the session file being bundled inside the
     distributed package (also confirmed by hand: no stray `.db`/session file found inside the
     extracted app folder on an affected machine). **Root cause of WHY a saved session was
     present on a supposedly-fresh machine could not be confirmed** (most likely explanation:
     a cloned machine/disk image or reused device carried over the developer's own
     `%APPDATA%\The Bill POS` folder — operational, not a code bug — but this was never
     directly verified). Given the user could not get further diagnostic access, shipped a
     defensive mitigation instead of leaving it unaddressed: **`App.jsx` now shows an explicit
     "Continue as {user} / Not you? Log out" confirmation screen** every time the app launches
     with a session restored from disk (a fresh login never needs to reconfirm — see
     `resumeConfirmed` state). This does not explain or fix how a foreign session could end up
     on a machine — it makes it impossible for that to go unnoticed/silently continue. New i18n
     keys added (`en.json`/`uz.json` not touched — reuses `lib/i18n.js` directly, same reasoning
     as `Login.jsx`, since neither role-scoped i18n system is mounted at this point either).
     `App.jsx`/`lib/i18n.js` esbuild-verified clean (via a Linux-native `esbuild@0.24.0` through
     `npx`, since the project's own installed `esbuild` binary is Windows-only and can't run in
     this sandbox). **Not yet tested on a real machine.**
   - **Also investigated, separately: the still-open NSIS installer crash (`nsis7z.dll`,
     0xC0000005).** Researched properly rather than guessing further — this is a known,
     long-standing, never-fixed electron-builder/NSIS bug (old-style plugin DLLs like
     `System.dll`/`nsis7z.dll` crashing from fragile raw-stack-based plugin calling conventions,
     reported since 2017: electron-builder issues #1475/#2518/#2751/#3545/#7921). Ruled out the
     other known electron-builder NSIS bug (>2GB installers get silently malformed, #8399) — our
     installer is only ~90MB, zip ~350MB, nowhere near that threshold. No confirmed fix exists
     anywhere for the nsis7z crash itself; the `zip` target remains the practical workaround.
2. **Added a `zip` Windows target alongside `nsis`** in `build.win.target` — produces a plain zip
   of the packaged app with zero NSIS involvement, guaranteed to sidestep the `nsis7z.dll` crash
   entirely (no installer UX — no shortcuts, manual extract-and-run — but immediately testable
   while the NSIS mystery stays open).

**Next step:** rebuild, then test the new `.zip` target first (should now actually launch, since
the missing-`powersync`-files bug — the thing that made even the raw unpacked folder fail — is
fixed). If the app runs correctly from the zip, that confirms the packaging itself is sound and
isolates the remaining problem entirely to the NSIS installer wrapper. Remaining options for the
NSIS crash specifically, not yet tried: pin a different `electron-builder` version (currently
`^26.0.0`, resolved to `26.15.3`) and rebuild, since the crashing DLL is bundled by electron-
builder itself, not something in this project's own code.

## 2026-07-29 (earlier): Login screen — password show/hide + language toggle

User flagged the Login screen (screenshot) as needing a password-visibility toggle and a
language switcher — it had neither. Root cause for why it was missed until now: `Login.jsx` was
written back in Phase 0 (the very first thing built in this project) and never touched again —
it predates both of the app's two translation systems (Admin's context-based `LanguageContext.jsx`,
Cashier's `lib/i18n.js` + PosShell's `lang` state) and has always been 100% hardcoded English with
no i18n wiring of any kind, unlike every screen built since.

Real design wrinkle worth knowing: Login runs before any role is known, so neither existing i18n
system is mounted yet (`LanguageContext.jsx`'s Provider only wraps `AdminPanel.jsx`; PosShell's
`lang` state only exists inside the Cashier shell). Rather than inventing a third system, Login
now reuses `lib/i18n.js`'s existing `t(str, lang)` dictionary directly (added the ~9 new strings
it needed) with its own local `lang` state — and on every toggle, writes BOTH `pos.lang` ('EN'/
'UZ', PosShell's key) and `lang` ('en'/'uz', lowercase, Admin's key) to localStorage, so whichever
language is picked at login carries into whichever shell the user lands in next, rather than
surprising them with a different language after signing in. `initialLang()` reads whichever key
already has a value from a previous session, defaulting to 'UZ' if neither is set.

Added: a UZ/EN pill toggle (top-right of the login card, same segmented-pill visual style as
PosShell's own sidebar toggle) and a password show/hide eye icon (lucide-react `Eye`/`EyeOff`,
already a dependency) inside the password field.

`Login.jsx` and `lib/i18n.js` esbuild-verified clean. **Not yet tested on a real machine** — next
check is opening the login screen, confirming the eye icon toggles visibility correctly, toggling
UZ/EN and confirming the labels/placeholder text switch, and confirming the chosen language is
still in effect after logging in (both on the Cashier POS and the Admin panel).

## 2026-07-29 (earlier): fixed untranslated strings user found live (Orders history table, Staff modal)

User caught several English strings leaking through on the Uzbek UI via two screenshots (Admin
Orders' paid-orders table/payment badges, Admin Staff's add-staff modal role/salary-type
buttons). Root cause in every case: a value was rendered directly (or via `.replace('_',' ')`/
title-casing) instead of through `t()` — these aren't missing i18n keys so much as call sites
that were never wired up in the first place, likely because payment-method/role/salary-type
values look like plain English words and are easy to miss versus an obviously-untranslated
label. Fixed all found instances, not just the two shown:

- **`OrdersScreen.jsx`** — new `paymentMethodLabel(method, t)` helper (mirrors the pattern
  `LoansScreen.jsx`'s `PAY_METHODS` already used correctly) replaces six separate raw renders:
  the paid-orders table's payment badge, the split-payment breakdown's per-part label, the order
  detail panel's payment-method line, the split-payment method-picker chips (previously a
  hardcoded `{key:'qr_code', label:'QR'}`-style array), and the payment form's method display
  fallback. Also fixed `{itemCount} items` → `{itemCount} {t('common.items')}` in the same table
  (the column header already said `t('common.items')` = "ta"; the row values didn't match).
- **`StaffScreen.jsx`** — `roleLabel(r)` used to always return a raw English title-case
  regardless of language (`new_cashier` → "New Cashier" even in Uzbek) since it algorithmically
  transforms the role key rather than translating it; changed to `roleLabel(r, t)`, looking up
  `roles.<key>` first and only falling back to the title-case transform if a key is somehow
  missing. `roles.new_cashier`/`roles.new_waiter` didn't exist in either `en.json`/`uz.json` (the
  other four roles did) — added both. Also fixed the salary-type pill buttons (`Hourly`/`Daily`/
  `Weekly`/`Monthly`, previously `st.charAt(0).toUpperCase()...`) to reuse the
  `admin.staff.salaryTypes.*` keys already correctly used two lines away for the rate label, plus
  two more raw `salaryType` renders in the "new staff created" success card and the staff list
  card.
- **`InventoryScreen.jsx`** — supplier delivery-debt payment method buttons (`PAYMENT_METHODS =
  ['Cash','Bank Transfer',...]`) were rendering the raw Title-Case array value. Fixed the
  *display* only via a new `paymentMethodDisplay()` lookup — deliberately did NOT change the
  array's own values, since those are the actual persisted `method` field on real payment
  records; translating the stored value itself would be a data-model change, not a translation
  fix.

All 5 touched files (`OrdersScreen.jsx`, `StaffScreen.jsx`, `InventoryScreen.jsx`, `en.json`,
`uz.json`) esbuild/JSON-verified clean. Not yet re-confirmed live in Uzbek on the real machine —
next check is exactly the two screens the user screenshotted, switched to UZ.

## 2026-07-29 (earlier): Printers tab restored in Admin Settings

Task #46 done. The Printers tab (`pos-app/src/pages/admin/screens/SettingsScreen.jsx`) — deleted
as dead code during the original port (task #29) because printing was out of scope at the time —
is now restored, since a full kitchen-ticket print engine exists (tasks #41-45) and the ONE
missing piece was a UI to actually enter/edit a printer's IP from inside pos-app (previously only
possible via the old website's Settings page).

**Faithful restoration, ported from `website/src/pages/admin/AdminRestaurantSettings.jsx`** — same
fields, same layout, same behavior, no redesign: `PrinterCard` (name/IP/port + connection-status
badge + kitchen-station toggle buttons, station toggles only shown for kitchen printers),
`AddFormPanel` (shared draft-entry form for adding a receipt or kitchen printer — kept as a
top-level component per the source's own comment, since defining it inside `PrintersPanel` would
make React remount it every keystroke and drop input focus), `PrinterSetupGuide` (collapsible
5-step walkthrough + compatible-printer list + troubleshooting box), and `PrintersPanel` itself
(receipt-printer list/add-form, a divider, then kitchen-printer list/add-form — stacked
vertically, matching the source's real layout). `printers` is back in `SECTIONS` in its original
position (between `finance` and `receipt`, matching the website's own order) with the `Printer`
icon. All 8 previously-dropped icons restored (`Printer`, `Wifi`, `Network`, `MonitorCheck`,
`ChevronDown`, `ChevronUp`, `Plus`, `Trash2`) — each verified by grep to have a real call site in
the restored code before adding it back, none re-added blindly.

**Save path: no parallel mechanism.** `PrintersPanel` reads/writes `form.kitchenPrinters`/
`form.receiptPrinters` through the exact same `form`/`set`/`handleSave` flow every other tab on
this screen already uses (`set('kitchenPrinters')([...])`, then one shared
`settingsAPI.update(form)` call on Save) — confirmed by direct review, not assumed.

**One deliberate improvement, matching this project's established task #31 precedent:** the
source's `loadStations` (feeding the kitchen-printer station picker) fetches its 3 merge sources
via REST (`menuAPI.getStations()` + `menuAPI.getItems()`). This port fetches the same 3 sources
locally via PowerSync instead, reusing `MenuScreen.jsx`'s own already-converted station-read
pattern: `SELECT name FROM custom_stations ORDER BY created_at` (verbatim reuse) +
`SELECT DISTINCT kitchen_station FROM menu_items WHERE kitchen_station IS NOT NULL AND
kitchen_station <> ''` (replaces `menuAPI.getItems()` — only distinct non-empty station names
were ever read off an item), merged with the same hardcoded preset list using the identical
case-insensitive, first-occurrence-wins logic as the source. Safe because both `menu_items` and
`custom_stations` are fully-synced PowerSync tables (already read locally elsewhere in this app)
and this is a pure read with zero server-side business logic — unlike the outer `GET/PUT
/api/settings` round-trip itself, which correctly stays on REST (per the existing, unchanged
task #31 conclusion: the route's self-healing default-row auto-INSERT can't be replicated by a
local SELECT). This deviation only replaces the ONE inner call feeding the station picker.
`menuAPI` is NOT re-imported — its only potential remaining use is fully covered by the two local
reads above.

**i18n: no new keys needed.** All `settings.printers.*` keys (and `settings.sections.printers`)
already existed, complete, in both `pos-app/src/i18n/en.json` and `uz.json` — they were carried
over verbatim when the i18n dictionaries were first built (task #4) even though the Printers tab
itself wasn't rendered at the time. Verified directly against `website/src/i18n/en.json`/`uz.json`
to confirm wording matches; no drift found.

Header comment in `SettingsScreen.jsx` was appended to (not rewritten) per RULES.md §0 — the
original "PRINTING — entirely excluded" items 1-2 are kept for history with a new dated addendum
explaining the restoration and superseding them.

Esbuild-verified clean via the Linux scratch install (`--bundle --loader:.jsx=jsx --format=esm`,
external react/react-dom/react-router-dom/lucide-react) — 43.5kb output, zero errors.

**Not yet tested on a real machine — this is the single most important next step.** Nothing here
could be verified beyond syntax/import-resolution (esbuild) and manual code review; no live
Electron runtime, no real PowerSync-synced `menu_items`/`custom_stations` data, and no actual
kitchen printer were available in this session. Next session should: open Settings → Printers on
the real app, confirm the station picker populates with real synced stations (presets + any
menu-item stations + any custom stations), add a kitchen printer with a real (or at least
reachable) IP, Save, reload the screen and confirm it reads back correctly (round-trips through
`settingsAPI.update`/`.get()`), and confirm `useSettings().kitchenPrinters` on the Cashier POS and
other Admin screens picks up the newly-entered printer without needing anything else touched —
then actually fire an order and confirm a real ticket prints to that printer's station.

## 2026-07-29 (later): kitchen print calls wired into all real order-item write paths

Following the new LAN print engine (`pos-app/printEngine.js`, `preload.js`'s `printKitchenTicket`,
`useSettings.js`'s `kitchenPrinters`/`kitchenShow` — all built earlier the same day, tasks #41-43),
this pass wires the actual print CALLS into every screen that creates or edits order items. **7
real call sites found and wired, across 6 files** (task brief estimated "6 spots across 4 files" —
the extra one is Admin Tables' own separate `handleAddFoodToOrder`, a genuinely distinct code path
from `NewOrderModal.jsx`'s create flow, both real and independently reachable; see below).

**Cashier POS (`pos-app/src/pages/pos/`):**
- `MenuScreen.jsx` `handleFire` — two spots in one function: (1) brand-new order via
  `ordersCreate` → print the full cart; (2) add-to-existing-order via `ordersAddItems` → print only
  the cart being fired (the existing order's own items already printed when originally fired).
  Cart items are `{item, qty}` where `item` is the full local `menu_items` row (camelized) — used
  `item.name`/`item.unit`/`item.kitchenStation` directly, matched printEngine.js's expected shape
  with no surprises. `res.data` from both IPC calls is the RAW backend order row (snake_case,
  `daily_number` etc.) — confirmed `main.js`'s `request()` does no camelization on the way back (no
  REST-response translation layer for pos-app's own IPC writes, unlike `client.js`'s `unwrap()`),
  so `dailyNumber` is read as `res.data?.daily_number`, not `res.data?.dailyNumber`.
- `OrdersScreen.jsx` `saveEdit` and `TablesScreen.jsx` `saveEdit` — edit-save diff logic. `orders:update`
  (`PUT /:id`) has zero backend print trigger (confirmed by grep — only `POST /` and `POST /:id/items`
  in `orders.js` call `sendKitchenPrintJobs`/`broadcast`), so 100% of the print signal for an edit-save
  comes from these two client-side diffs. OrdersScreen.jsx already had an explicit `snapshot.items`
  state (built in `startEdit`, used for its own Discard button) — reused directly as "old" quantities.
  TablesScreen.jsx has NO such explicit snapshot (its own `startEdit` never built one) — reused
  `itemsByOrd[selOrder.id]` instead, which stays frozen at the pre-edit state for the whole edit
  session since both screens already pause polling while editing (`if (!editing) load()`) — this is
  the screen's own existing "original vs current" mechanism, not a new parallel one. Diff logic (same
  in both): `delta = newQty - (oldQty || 0)`, print only where `delta > 0` (brand-new item or a
  genuine quantity increase), with `quantity` set to the DELTA, never the full new quantity — a
  decreased/removed/unchanged item never reprints.

**Admin (`pos-app/src/pages/admin/`) — real gap found and fixed: settings weren't plumbed in at
all.** `AdminShell.jsx` never called `useSettings()` — added it (same hook the Cashier POS's
`PosShell.jsx` already uses) and now passes `settings` down to every active screen exactly like
`user`/`onLogout` already are (same "shared data as a prop" convention this file already
established, no new plumbing pattern invented).
- `NewOrderModal.jsx` (`handlePlaceOrder`'s create branch, the only branch AdminTables.jsx actually
  uses — its `existingOrderId` branch is confirmed dead code, never invoked with a real id) — prints
  the full cart after `ordersAPI.create(...)` succeeds. Added `settings` prop.
- `admin/screens/TablesScreen.jsx` `handleAddFoodToOrder` — its OWN separate in-place add-items flow
  (does NOT go through `NewOrderModal.jsx` at all) — prints only the items just added after
  `ordersAPI.addItems(...)` succeeds. Added `settings` prop, threaded into `<NewOrderModal
  settings={settings} />` too.
- `admin/screens/OrdersScreen.jsx` `saveEditedOrder` — same diff requirement as the Cashier screens.
  `editingOrder.items` (the pristine order object `openEditModal` was called with) serves as "old" —
  confirmed `editFormData.items` is a separately-mapped copy, so none of the edit modal's add/
  remove/qty handlers ever mutate `editingOrder.items` itself, making it a reliable frozen snapshot
  with no new state needed. `editFormData` has no `orderType` field at all (this admin edit modal
  can change table/waitress/guests/items/notes but NOT order type) — used `editingOrder.orderType`
  unchanged for the print order object. Added `settings` prop.

**Real correctness bug found and fixed before it could ship: Admin's two order-creating/item-adding
writes would have double-printed every ticket.** `NewOrderModal.jsx`'s create call and Admin
`TablesScreen.jsx`'s `handleAddFoodToOrder` both go through the GENERIC REST client
(`ordersAPI.create`/`ordersAPI.addItems` → `api:post` IPC passthrough) — NOT the Cashier POS's
dedicated `orders:create`/`orders:addItems` IPC handlers in `main.js`, which are the ONLY place
`client_prints_locally: true` gets auto-injected. Without that flag, the backend would ALSO run its
own broadcast/`sendKitchenPrintJobs` for these two admin-triggered writes (exactly as it always has,
pre-dating this whole feature) — meaning every admin-created order or admin-added item would print
TWICE once our new client-side print call was added on top. Fixed two ways: (1) `NewOrderModal.jsx`
now sends `clientPrintsLocally: true` directly in the object passed to `ordersAPI.create(...)` —
`client.js`'s `snakeizeKeys` converts it to `client_prints_locally` correctly (verified: `toSnake`
only touches uppercase letters, so an already-lowercase key would pass through unchanged, and this
one converts as expected); (2) `client.js`'s `ordersAPI.addItems(id, items, extra)` got a new,
backward-compatible optional third parameter (merged into the POST body) since its old signature
`(id, items)` had no way to smuggle the flag through — Admin `TablesScreen.jsx` now calls
`ordersAPI.addItems(tableOrder.id, items, { clientPrintsLocally: true })`. Neither change touches
the order-write logic itself, only ensures the existing "don't double-print" signal actually reaches
the backend from these two call sites the way it already does for the Cashier POS's dedicated IPC
methods. `PUT /:id` (`ordersAPI.update`, used by both edit-save flows and NewOrderModal's dead
`existingOrderId` branch) needs no such flag — confirmed zero print-trigger code exists on that
route at all, so there's no double-print risk there regardless of transport.

**Error/warning UI — reused each screen's own existing pattern, invented nothing new:**
- Cashier `pos/` screens: existing `showToast(msg, false)` toast.
- Admin `OrdersScreen.jsx`: existing `useApi()` `error`/`setError` (a fixed bottom-right red toast
  already used for other failures) — added `setError` to the destructure (it existed on the hook,
  just wasn't pulled out before).
- Admin `NewOrderModal.jsx`: reused its own existing inline `error`/`setError` box (already rendered
  in the cart panel) — on a real print failure, the modal now stays open (instead of auto-closing)
  so the warning is actually visible; the user closes it manually. Order creation itself is
  unaffected either way — this only delays when the MODAL closes, never the write.
- Admin `TablesScreen.jsx`: this file had NO existing toast/notification mechanism at all outside a
  full-page blocking load-error state (wrong for a transient print warning) — added one small
  `addFoodPrintWarning` string state, rendered as a small inline red banner using the exact same
  visual language already used elsewhere in this same file (red-50/red-600/`AlertTriangle`, e.g. its
  own delete-confirm dialog), not a new component or pattern. Same "stay open on failure" treatment
  as NewOrderModal.

**Every print call:** built strictly from state the screen already has in memory (no extra fetch),
wrapped in try/catch (never throws, never affects the write that already succeeded), called only
AFTER the write's own success is confirmed, silent on success, warns only when
`result.failed?.length > 0` (an actually-configured printer that failed to respond) — never for the
"nothing configured yet" case, which `printKitchenTicket` already returns `{ok:false}` for silently
by design.

**All 8 changed files esbuild-verified clean** (`--bundle --loader:.jsx=jsx --format=esm`, external
react/react-dom/react-router-dom/lucide-react): `pos/MenuScreen.jsx`, `pos/OrdersScreen.jsx`,
`pos/TablesScreen.jsx`, `admin/AdminShell.jsx`, `api/client.js`, `admin/screens/NewOrderModal.jsx`,
`admin/screens/TablesScreen.jsx`, `admin/screens/OrdersScreen.jsx`.

**Every order-write call itself (`ordersCreate`/`ordersAddItems`/`ordersUpdate` in the Cashier POS,
`ordersAPI.create`/`addItems`/`update` in Admin) is untouched in shape and logic** — confirmed by
direct grep/diff review — except the two deliberate, documented `clientPrintsLocally: true`
additions described above, which are a required part of making printing itself work correctly
without duplicating tickets, not a change to the orders themselves.

**Not yet tested on a real machine with an actual printer — this is the single most important next
step before this feature can be trusted.** Nothing in this pass could be verified beyond
syntax/import-resolution (esbuild) and manual code review; no live kitchen printer, no real
PowerSync-synced order data, and no actual Electron runtime were available in this session. Next
session should: configure at least one real (or emulated ESC/POS-over-TCP) kitchen printer in
Restaurant Settings via the website, then exercise all 7 spots on the real app — Fire a new dine-in/
takeout/delivery order from Menu, add to an occupied table's order from Menu, edit-save on both
Orders and Tables (verify a removed/decreased item does NOT reprint), place a new order from Admin
Tables' "+ New Order", add food to an occupied table from Admin Tables' own Add Food sheet, and
edit-save from Admin Orders — confirm one ticket per station per action (no duplicates), correct
item/qty/notes on the ticket, and that a deliberately-unreachable printer IP shows the new warning
UI without needing a printer to exist for the day-to-day empty-config case.

## 2026-07-29: real-machine testing confirmed, both Dashboard console issues resolved

Task #31 (Admin → local PowerSync reads) is now **fully done and verified** — user confirmed all
9 converted screens work correctly on the real machine ("I have checked all looks right"). The
original goal (Admin panel should genuinely be faster than the old Electron app, not just in
theory) is now actually delivered, not just built.

Both issues found during that testing pass are resolved:

- **Key-prop warning** (`DashboardScreen.jsx`) — fixed. Root cause: `GET
  /shifts/admin/staff-status` never returns a plain `id` field (only `user_id`/`shift_id`,
  aliased to dodge an ambiguous-column SQL error), so `staff.id` was always `undefined`. Now
  keyed on `staff.userId`. Unrelated to this project's PowerSync work — a pre-existing bug that
  just surfaced now.
- **Image CSP errors** — turned out to be misdiagnosed last session (attributed to Dashboard,
  which renders no images at all; the console errors were residual from an earlier MenuScreen
  view in the same SPA session). Real location: `MenuScreen.jsx`'s `resolveImgUrl()`. Checked
  live before touching anything — the `-pego` backend 404s on these files (different Render
  account/disk, never had them) and the old pre-migration backend 503s (dead/suspended service,
  per the 2026-07-06 migration). The photos are genuinely gone, not just misrouted — no code fix
  restores them. Found 14 affected menu items (not just the 2 in the screenshot) via a direct DB
  query, gave the user the choice of clearing the stale URLs vs. manual re-upload; user chose to
  clear. Ran the `UPDATE ... SET image_url = NULL` directly via Supabase MCP, confirmed 14 rows
  affected. Those items now show the normal placeholder; a fresh upload for any of them will
  overwrite `image_url` with a working `-pego` URL with no further fix needed.

No open items from task #31 remain. Next work is whatever the user brings next session.

---

## Task #31 COMPLETE (2026-07-28): Dashboard, Restaurant Settings, Profile — final three screens evaluated

All 9 Admin screens have now been individually evaluated for task #31 (Tables, Loans, Menu,
Orders, Inventory, Staff done in earlier sessions today; this pass covers the final three).
**Every write in all three files below is completely untouched — only reads changed.**

**Dashboard (`pos-app/src/pages/admin/screens/DashboardScreen.jsx`)** — the richest of the three,
15 parallel reads per 15s poll. Verified every single one against the real backend route files
(`reports.js`, `tables.js`, `warehouse.js`, `shifts.js`, `loans.js`, `notifications.js`,
`accounting.js`, `staff-payments.js`, `procurement.js`) rather than assuming from the task brief's
"likely mostly aggregates" guess. **Ten converted to local PowerSync reads:**
1. `tablesAPI.getAll()` → plain `SELECT * FROM restaurant_tables` — this screen doesn't even read
   the real route's `order_total`/`waitress_name` joins (dead weight, grepped clean).
2. `warehouseAPI.getLowStock()` → direct 1:1 port, the real route has no joins to begin with.
3. `warehouseAPI.getAll()` → plain `SELECT * FROM warehouse_items`, supplier join + batches N+1
   dropped (dead weight — only `quantityInStock`/`costPerUnit` read).
4. `warehouseAPI.getMovements({from,to})` → local query WITH the date filter replicated (unlike
   Inventory's own `fetchMovements`, this call site always passes today's range) — kept the real
   route's `wi.cost_per_unit` join (a discovered pre-existing backend quirk: this route reads the
   warehouse item's CURRENT cost, not the movement's own point-in-time `stock_movements.cost_per_unit`
   — replicated faithfully, not "fixed").
5. `procurementAPI.getDeliveriesDebt()` + its own `getDeliveries()` fallback → reused verbatim from
   InventoryScreen.jsx's already-verified local queries.
6. `staffPaymentsAPI.getAll({from,to})` → reused verbatim from StaffScreen.jsx's already-verified
   local query.
7. `loansAPI.getStats()` → local aggregate (`CASE WHEN` in place of Postgres's `FILTER (WHERE...)`
   for SQLite portability) — same active/paid/overdue counts+totals, one query, no joins.
8. `notificationsAPI.getAll()` → plain `SELECT * FROM notifications WHERE user_id = ? ORDER BY
   created_at DESC LIMIT 50` — needed the current user's id, so `user` was added to this screen's
   props (AdminShell.jsx already passes `user` to every screen, same as `onLogout` — no
   AdminShell change needed).
9. `reportsAPI.getBestSellers({from,to})` → local `GROUP BY/SUM/ORDER BY DESC/LIMIT 20` aggregate.
   Judgment call, documented in the file's own header comment: this is technically a "top-N
   ranking" query (the exact pattern the task brief flagged as risky), but it turned out to be a
   single straightforward SQL aggregate with zero server-side post-processing (`res.json(result.rows)`
   directly, no percentage/share math done backend-side) — same precedent as Inventory's
   `LIMIT 500` movements query and Staff's `ROW_NUMBER()` latest-per-group query, both already
   converted. Converted on that basis.
10. `ordersAPI.getAll({from,to})` (feeding `activeOrders`) → plain `SELECT status, order_type FROM
    orders WHERE created_at BETWEEN ? AND ?` — the real route's massive join set (tables/users×2/
    item-count/loans LATERAL) is entirely dead weight here (only `.status`/`.orderType` ever read).

**Four left on REST, each independently verified as real business logic or a genuine sync gap:**
- `reportsAPI.getAdminDailySummary()` (primary KPI source) — genuine multi-step server computation
  (per-waitress staff performance joins, a 3-query financial-flow breakdown, an hourly sales-trend
  chart, goods-sold grouped by category).
- `shiftsAPI.getStaffStatus()` — same "live staff status" real business logic already established
  on REST for Staff (DISTINCT ON priority-CASE pick mapped onto a derived status).
- `shiftsAPI.getPayroll({from,to})` — genuine multi-step business logic: salary-type CASE branching
  (monthly/hourly/daily/weekly, four different formulas) plus a correlated commission subquery.
- `accountingAPI.getCashFlow({from,to})` — genuine sync gap, not a business-logic call: `cash_flow`
  is NOT one of the tables in `pos-app/powersync/schema.js` at all (verified directly). Also
  discovered in passing: the real route completely ignores the `{from,to}` params this screen
  passes (always scopes to `CURRENT_DATE`/`LIMIT 100` server-side) — not fixed, out of scope.

**One deliberately NOT converted despite being simple** — `reportsAPI.getDashboard()`
(`simpleDash`, a pre-existing "reliable revenue/orders fallback"). Its three sub-aggregates are
individually about as simple as several converted above, but every field this screen reads from it
is only used behind a `||` fallback AFTER the (REST-staying) primary source, so converting just the
fallback buys no real resilience — if the backend is unreachable, both fail together. Also, faithful
replication would need a separate `paid_at`-scoped query distinct from item 10's `created_at`-scoped
one. Documented explicitly in the file's header comment rather than silently left alone.

Boolean check: `notifications.is_read` (→ `isRead`) already in `case.js`'s `BOOL_FIELDS` — verified,
needed for the unread-count logic.

**Restaurant Settings (`pos-app/src/pages/admin/screens/SettingsScreen.jsx`)** — NOT converted, left
entirely on REST. Re-verified against the real route (`restaurant-app/backend/src/routes/settings.js`)
rather than trusting the pre-existing "task #21 recommendation" comment unread: `GET /api/settings`
is a single plain `SELECT * FROM restaurant_settings WHERE restaurant_id = $1`, BUT the route also
auto-INSERTs a default row if none exists and returns that — a local-only `psGet` cannot replicate
that self-healing INSERT (a rare edge case, but a genuine faithfulness gap, not just "low value").
Combined with this being a true one-time-per-visit read (no polling anywhere in the file, confirmed
by grep), left untouched. Added an explicit re-verification addendum to the file's own header
comment; no code changes.

**Profile (`pos-app/src/pages/admin/screens/ProfileScreen.jsx`)** — CONVERTED. Checked the
cashier-side `pos-app/src/pages/pos/ProfileScreen.jsx` first for precedent (task #19) — it reads via
REST-only `apiGet` and never calls `usersAPI.getMe()` at all, so no existing local-read pattern to
reuse; this was a fresh conversion. Verified `GET /api/users/me` first: a single-row lookup by the
current user's own id from the JWT, explicit column list (already excludes `password_hash`), no
joins, no aggregation — exactly the "trivial, clearly synced single-row lookup" the task brief
predicted. Every selected column exists on the local `users` table — converted to `SELECT id, name,
email, phone, role, salary, salary_type, shift_start, shift_end, is_active, kitchen_station,
commission_rate, created_at FROM users WHERE id = ?` using the `user` prop's id (AdminShell.jsx
already passes `user` to every screen). Same "silently fall back to cached data" try/catch shape as
before. `users.is_active` (→ `isActive`) already in `BOOL_FIELDS`, though not actually rendered on
this screen. `users.last_login` doesn't exist as a column in Postgres OR locally — the REST route
never selected it either, so the `profile.lastLogin || profile.last_login || new Date()` fallback
already resolved to `new Date()` before this conversion too — unchanged behavior. Writes
(`usersAPI.update`/`updateCredentials`) untouched, import kept for them.

All three files esbuild-verified clean (`--bundle --loader:.jsx=jsx --format=esm`, external
react/react-dom/react-router-dom/lucide-react). **Not yet tested on the real machine** — next
check for Dashboard: open it and confirm every KPI card/table grid/low-stock list/warehouse-today
card/staff-payroll-owed figure/loans-outstanding figure/notification bell all show the same numbers
as before, and that the 15s auto-poll doesn't flicker or error (watch DevTools console for any
`fetchLocal*` rejection — these now surface the same way a failed REST call would); Settings/Profile
need no functional re-test since Settings has zero code changes and Profile's converted read has an
identical shape to the untouched REST call it replaced, but still worth a visual open-and-check.

### Task #31 wrap-up — all 9 Admin screens now evaluated, summary of the full set

Task #31 ("convert Admin screens to local PowerSync reads, speed pass") is complete. Final
breakdown of all 9 screens:

- **Real conversions (7 of 9):** Tables, Loans, Menu, Orders, Inventory, Staff, Dashboard — each had
  at least one read converted from REST to a local PowerSync query, verified read-by-read against
  the real backend route files (never assumed). Orders and Inventory were the largest/richest
  conversions; Dashboard (this session) converted the most individual reads (ten) of any single
  screen, since it's a KPI-aggregator screen touching nearly every table in the app.
- **Zero conversions, both deliberately (2 of 9):** Restaurant Settings (single infrequent read with
  a real self-healing auto-insert side effect a local read can't replicate) and — from earlier
  sessions — none of the other 7 ended up with zero conversions, though several screens (Staff,
  Inventory, Dashboard) each kept multiple individual reads on REST alongside their converted ones
  where the read involved genuine server-side business logic (live staff status, payroll
  calculation, reorder-suggestion logic, admin-daily-summary's staff-performance/financial-flow
  breakdown).
- **Profile** ended up with exactly one read, converted (single-user lookup by id, no aggregation) —
  the smallest possible conversion, but a real one.
- **Consistent findings across the whole task:** a REST route that LOOKS like a plain select often
  hides a dead-weight JOIN added for a column this specific screen never reads (verified by grep
  every time, not assumed) — Menu, Orders, Loans, Inventory, Staff, and Dashboard all hit this
  independently. Conversely, a route that looks like "just an aggregate" sometimes hides real
  post-query business logic in JS (Inventory's suggested-orders grouping, Dashboard's payroll/
  admin-daily-summary) — those stayed on REST. SQLite equivalents were needed for several Postgres-
  only constructs: `LATERAL`/`DISTINCT ON` → `ROW_NUMBER() OVER (PARTITION BY ...)`, `NULLS LAST` →
  `ORDER BY x IS NULL, x`, `FILTER (WHERE ...)` → `CASE WHEN ... END` inside `SUM`/`COUNT`,
  `EXTRACT(EPOCH FROM ...)/3600` → `(julianday(a) - julianday(b)) * 24`.
- **Every write across all 9 screens stays on REST, unchanged, no exceptions** — PowerSync's local
  write-queue mechanism was never used anywhere in this whole task, per the standing project rule
  (RULES.md §4) that writes with real server-side business logic must stay centralized through the
  Express API.
- **Still outstanding, same as every prior task #31 session:** none of these conversions have been
  tested on the real machine yet. This needs a full pass through all 9 screens, following each
  screen's own "next check" list in this file, before the task can be considered shippable — esbuild
  passing only confirms syntax/imports resolve, not that any query actually returns correct data
  against a real synced local SQLite file.

## Task #31, sixth screen done (2026-07-28): Staff screen converted to local PowerSync reads

`pos-app/src/pages/admin/screens/StaffScreen.jsx` is the sixth of the 9 Admin screens converted
(after Tables, Loans, Menu, Orders, Inventory) — same pattern, same standing rules (writes
untouched, camelizeRow/camelizeRows on every local result, no restaurant_id filter needed).
Remaining: Dashboard, Settings, Profile.

**Three reads converted, all verified against the real backend route files first**
(`restaurant-app/backend/src/routes/users.js`, `shifts.js`, `staff-payments.js`):
1. `fetchUsers()` (was `usersAPI.getAll()`, GET /api/users) — real route is a plain explicit-
   column-list `SELECT` (already excludes `password_hash`) filtered to `restaurant_id`, no joins,
   no business logic. Local `users` table already has every one of those columns — direct 1:1 port.
2. `fetchShifts({from,to})` (was `shiftsAPI.getAll({from,to})`, GET /api/shifts) — shared by
   `fetchPeriodShifts` (Attendance tab) and `fetchPayrollData` (Payroll tab). Real route's `LEFT
   JOIN users` (name/role) and computed `earnings` column are both dead weight — grepped clean,
   this screen always looks up staff name/role via `staff.find()` off the separately-fetched
   `staff` array, and "earnings" has zero read call sites (only an unrelated code comment). The
   `hours_worked` computed column IS replicated faithfully: Postgres's `EXTRACT(EPOCH FROM
   ...)/3600` becomes SQLite's `(julianday(a) - julianday(b)) * 24`. `COALESCE(shift_date,
   clock_in::date)` becomes `COALESCE(shift_date, substr(clock_in,1,10))`. No `user_id` filter is
   ever passed by this admin-only screen, so that branch (and the `waitress`-role self-scope
   branch) aren't replicated. SQLite sorts NULL as the smallest value, so plain `DESC` ordering
   already puts NULLs last with no extra `IS NULL` trick needed (unlike Inventory's ASC case).
3. `fetchLatestPayments()`/`fetchStaffPayments({from,to})` (was `staffPaymentsAPI.getLatest()` GET
   /api/staff-payments/latest, and `staffPaymentsAPI.getAll({from,to})` GET /api/staff-payments) —
   `getLatest`'s Postgres-only `DISTINCT ON (user_id)` ("latest row per group") replicated via a
   `ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY payment_date DESC, created_at DESC)` window
   filtered to rn=1, same technique as Orders' "latest loan per order". `getAll`'s `LEFT JOIN
   users` for `staff_name` is dead weight — grepped clean, payment rows are always read via
   amount/paymentDate/paymentMethod/note/userId, never `staffName`. Neither call site passes a
   `user_id` filter (only `from`/`to`).

**Left on REST, deliberately: `shiftsAPI.getStaffStatus()`** (GET /shifts/admin/staff-status),
backing `fetchTodayStatus` — the "live staff status" screen the task brief predicted would need
to stay server-side, confirmed by reading the real route. It does genuine business logic beyond a
plain read: a `DISTINCT ON (user_id)` subquery picks each user's single most relevant shift row
for TODAY via a priority CASE (active/clocked-in beats completed beats absence), then the outer
query maps that onto a derived three-way status the raw row never had (`present`/`late` from the
real DB status when clocked in, `absent` when an explicit absence record exists with no clock-in,
or a synthetic `off` when there's no record at all today). Not a faithful SQL-only read — stays
on REST per the standing rule.

**Also found and deliberately left on REST, out of scope for this task:** `menuAPI.getStations()`
(GET /api/menu/stations, backing `fetchCustomStations`) is a plain filtered `SELECT name FROM
custom_stations` with no joins/business logic — it would convert cleanly the same way `fetchUsers`
did, and `custom_stations` is itself a fully synced table. Not converted because the task brief
explicitly scoped this conversion to the users/shifts/staff_payments tables only — flagged as a
legitimate candidate for a future pass, not silently skipped.

**Boolean-column check: no fix needed.** `users.is_active` was already in `case.js`'s
`BOOL_FIELDS` (`isActive`) before this session — verified directly, needed since this screen does
strict `m.isActive === false` comparisons throughout (staff cards, `handleToggleStatus`). `shifts`
and `staff_payments` have no boolean columns at all (checked `powersync/schema.js` directly).

**Write path completely untouched** — every one of `handleSaveStaff`/`handleDeleteStaff`/
`handleUpdateCredentials`/`handleToggleStatus`/`handleClockIn`/`handleClockOut`/
`handleMarkAbsent`/`handleManualClockIn`/`handleManualShift`/`handleEditShift`/
`handleRecordPayment`/`handleDeletePayment` and the custom-station add/delete buttons still call
their REST write via `usersAPI`/`shiftsAPI`/`staffPaymentsAPI`/`menuAPI` exactly as before
(verified by direct comparison against the pre-edit file — only each read/refetch call site was
touched). `shiftsAPI.getStaffStatus`/`menuAPI.getStations` both kept (deliberately left on REST,
see above); all four API-group imports still have real remaining call sites, none became unused.

Esbuild-verified clean (`--bundle --loader:.jsx=jsx --format=esm`, external
react/react-dom/react-router-dom/lucide-react). **Not yet tested on the real machine** — next
check: open Staff from the sidebar, confirm the staff list/role counts/search all load with the
same data as before; open Attendance and confirm today's per-staff cards and the historical shifts
table both render (live on-shift status badge should still come from the REST `getStaffStatus`
call, unaffected); switch the day picker back/forward and confirm the shift list refilters; open
Payroll, confirm the summary banner and per-staff payroll cards compute the same gross/net/paid/
remaining numbers as before (this is the most complex client-side math on this screen — give it a
careful before/after comparison, especially for hourly-salary staff whose `hoursWorked` now comes
from the new SQLite `julianday()` expression instead of Postgres's `EXTRACT(EPOCH ...)`); open a
staff member's payroll details modal and confirm the payments list splits into settled/current
correctly; run each write path (add/edit/delete staff, update login credentials, clock in/out/mark
absent, manual shift create/edit, record/delete a payment, add/delete a custom kitchen station) and
confirm all still work exactly as before (untouched REST paths).

## Task #31, fifth screen done (2026-07-28): Inventory screen converted to local PowerSync reads

`pos-app/src/pages/admin/screens/InventoryScreen.jsx` is the fifth of the 9 Admin screens
converted (after Tables, Loans, Menu, Orders) — same pattern, same standing rules (writes
untouched, camelizeRow/camelizeRows on every local result, no restaurant_id filter needed).
Remaining: Dashboard, Staff, Settings, Profile.

**Six reads converted, all verified against the real backend route files first**
(`restaurant-app/backend/src/routes/warehouse.js`, `suppliers.js`, `procurement.js`), each pulled
into its own `fetchX()` helper so writes' own post-save/lookup refetches (reads, not writes) reuse
the same converted query instead of hitting REST a second time:
1. `fetchWarehouseItems()` (was `warehouseAPI.getAll()`, GET /api/warehouse) — real route:
   `warehouse_items` LEFT JOIN `suppliers` for `supplier_name`, plus a per-row N+1 fetch of
   `stock_batches` (quantity_remaining > 0), attached as `row.batches`. The `supplier_name` join is
   dead weight (grepped clean — zero `supplierName`/`supplier_name` reads off an item row), same as
   MenuScreen.jsx's own `fetchWarehouseItems` precedent — NOT replicated. UNLIKE Menu's ingredient
   picker, though, `item.batches` genuinely IS read here (Stock Overview tab's nearest-expiry badge
   and per-item expandable batch list — `quantityRemaining`/`expiryDate`/`receivedAt`), so the N+1
   batches sub-fetch WAS replicated as one extra query keyed on the fetched item ids instead of N
   separate ones. SQLite has no `NULLS LAST` — emulated with `ORDER BY expiry_date IS NULL,
   expiry_date ASC`, matching Postgres's `ORDER BY expiry_date ASC NULLS LAST`. Also reused by two
   write handlers (`handleCreateDelivery`/`handleChangeDeliveryStatus`) that look up an existing
   item by name before creating a duplicate — that lookup is itself a read, so it was converted too.
2. `fetchSuppliers()` (was `suppliersAPI.getAll()`, GET /api/suppliers) — plain `SELECT * FROM
   suppliers ORDER BY name`, direct 1:1 port, no joins.
3. `fetchMovements()` (was `warehouseAPI.getMovements({})`, GET /api/warehouse/movements) — this
   screen's only call site always passes an empty params object, so none of the route's optional
   `from`/`to`/`type` filters ever apply (all date/type filtering is client-side in this screen's
   own `filteredInMoves`/`filteredOutMoves` useMemos). Real route: `stock_movements` INNER JOIN
   `warehouse_items` (name/unit/cost_per_unit) LEFT JOIN `users` (`recorded_by`), `ORDER BY
   created_at DESC LIMIT 500`. The `recorded_by` join is dead weight (grepped clean — zero reads) —
   NOT replicated; the INNER JOIN and `LIMIT 500` were kept faithfully.
4. `fetchDeliveries()` (was `procurementAPI.getDeliveries()`, GET /api/procurement/deliveries) —
   real route LEFT JOINs a `delivery_items` count subquery for `item_count`; grepped clean (zero
   `itemCount`/`item_count` reads — this screen's delivery cards never show a line-item count) —
   NOT replicated, so this is a plain `SELECT * FROM supplier_deliveries ORDER BY timestamp DESC,
   created_at DESC`.
5. `fetchDeliveriesDebt()` (was `procurementAPI.getDeliveriesDebt()`, GET
   /api/procurement/deliveries/debt) — a real aggregate (`SUM(total)`/`COUNT(*)` over unpaid
   Delivered/Partial deliveries), faithfully replicated as one local aggregate query.
6. `fetchDeliveryDetail(id)` (was `procurementAPI.getDelivery(id)`, GET
   /api/procurement/deliveries/:id) — single delivery row + its `delivery_items` ordered by id,
   direct 1:1 port. Reused by `openDeliveryDetail` and by both delivery-item write handlers'
   (`handleRemoveDeliveryItem`/`handleUpdateDeliveryItemQty`) own post-save refresh.

**Left on REST, deliberately: `procurementAPI.getSuggestedOrders()`** (GET
/api/procurement/suggested-order). Unlike every other read here, the real route does genuine
server-side business logic beyond a plain join/aggregate — it computes a per-item
`suggested_order_qty` (`min_stock_level*1.5 - quantity_in_stock`), then groups the flat row list
into a nested `{supplier, items[]}[]` structure via a JS `.reduce()`, rounding quantities up and
computing an `estimated_cost` per item. This is real reorder-suggestion business logic, not a
faithful SQL-only read, so per the standing rule it stays on REST. Also flagged: grepped the whole
file for `suggestedOrders` and confirmed it's fetched into state but never actually rendered
anywhere in this screen's JSX today — already dead in the UI, so leaving it on REST has zero
functional effect either way (removing an unused fetch was judged out of scope for a reads-only
conversion task).

**Boolean-column check: no fix needed.** `warehouse_items`/`suppliers`/`stock_batches`/
`stock_movements`/`supplier_deliveries`/`delivery_items` have no boolean columns at all except
`delivery_items.removed` (checked `powersync/schema.js` directly). `item.removed` is read with
truthy/falsy checks only (`item.removed ? ... : ...`, `!item.removed`) — never a strict
`=== false`/`!== false` comparison — so the raw 0/1 integer PowerSync returns behaves identically to
a real boolean here. No `BOOL_FIELDS` addition needed.

**Write path completely untouched** — every one of `handleAddItem`/`handleEditItem`/
`handleDeleteItem`/`handleReceive`/`handleRecordOutput`/`handleSaveSupplier`/
`handleDeleteSupplier`/`handleCreateDelivery`/`handlePayDelivery`/`handleChangeDeliveryStatus`/
`handleDeleteDelivery`/`handleRemoveDeliveryItem`/`handleUpdateDeliveryItemQty` still calls its REST
write via `warehouseAPI`/`suppliersAPI`/`procurementAPI` exactly as before (verified by direct
comparison against the pre-edit file — only each read/refetch call site was touched, never the
mutating call itself). The existing `window.prompt()`-replacement local modal (`promptModal`/
`promptValue`) is untouched — this conversion never touched that code path.

Esbuild-verified clean (`--bundle --loader:.jsx=jsx --format=esm`, external
react/react-dom/react-router-dom/lucide-react). **Not yet tested on the real machine** — next
check: open Inventory from the sidebar, confirm all four tabs (Stock Overview, Deliveries In,
Stock Output, Suppliers) load with the same data/counts as before and the 15s silent poll doesn't
flicker; expand an item row and confirm its stock-batches list (quantity/expiry/received date) and
the nearest-expiry badge both render correctly, including the NULLS-LAST ordering (items with a
null-expiry batch should still show batches with real expiry dates first); confirm the unpaid-debt
banner total matches reality; open a delivery's detail modal and confirm its line items (qty/unit/
price/expiry/removed-reason) render, then exercise the qty-adjust and remove-item prompts (the
local-modal `window.prompt()` replacement) and confirm the detail view refreshes correctly
afterward; run each write path (add/edit/delete item, receive/consume/adjust stock, add/edit/delete
supplier, create/pay/change-status/delete a delivery) and confirm all still work exactly as before
(untouched REST paths) — this is the largest screen converted so far, so give it a thorough pass.

## Task #31, fourth screen done (2026-07-28): Orders screen converted to local PowerSync reads

`pos-app/src/pages/admin/screens/OrdersScreen.jsx` is the fourth of the 9 Admin screens converted
(after Tables, Loans, Menu) — same pattern, same standing rules (writes untouched, camelizeRow/
camelizeRows on every local result, no restaurant_id filter needed). This was the biggest/richest
screen converted so far — order list needs table name + latest loan info, order detail needs a
nested loanDetails object, and a 3-source support-data fetch feeds the edit modal's dropdowns.
Remaining: Dashboard, Inventory, Staff, Settings, Profile.

**Three reads converted, all verified against the real backend route file first**
(`restaurant-app/backend/src/routes/orders.js`):
1. `fetchOrdersWithItems(statuses, {from,to})` (was `ordersAPI.getAll({status,from,to,
   include_items:'true'})`, GET /api/orders) — backs fetchActiveOrders/fetchPaidOrders/
   fetchCancelledOrders. Real route: `SELECT o.*, t.table_number, t.name AS table_name, u.name AS
   waitress_name, c.name AS collected_by_name, COALESCE(ic.cnt,0) AS item_count` plus a `LEFT JOIN
   LATERAL` picking the latest `loans` row per order (`loan_status`/`loan_paid_at`/`loan_due_date`/
   `loan_customer_name`/`loan_customer_phone`/`loan_amount`/`loan_notes`). Grepped the whole file for
   every way an order row's fields get read and dropped `table_number`/`waitress_name`/
   `collected_by_name`/`item_count` as dead weight (zero references off an order row — table/
   waitress display always goes through `getTableNumber`/`getWaitressName`, which look up
   `allTables`/`allWaitresses` from fetchSupportData, not the order row; item counts are always
   computed client-side from the `items` array). `table_name` (t.name) IS replicated —
   `paymentOrder.tableName`/`cancelTarget.tableName` both read it directly. The `loan_*` flat
   columns ARE replicated too — `order.loanStatus`/`loanCustomerName`/`loanCustomerPhone`/
   `loanDueDate`/`loanAmount`/`loanNotes` are all read directly off list rows. SQLite has no
   `LATERAL` join — replicated the "latest loan per order" pick with a `ROW_NUMBER() OVER
   (PARTITION BY order_id ORDER BY created_at DESC)` window filtered to `rn=1`, same semantics as
   the Postgres LATERAL's own `ORDER BY created_at DESC LIMIT 1`. The route's optional filters this
   screen's three call sites actually send (`status` always, `from`/`to` only for Paid) are
   replicated; ones it never sends (`order_type`, `table_id`, `paid_by`, `waitress_id`, the
   waitress-role self-scoping branch which only applies to role `waitress`, never `admin`) are not.
   `include_items=true`'s own batch items query (`order_items LEFT JOIN menu_items`) is replicated
   as a second query keyed on the fetched order ids.
2. `fetchOrderDetail(orderId)` (was `ordersAPI.getById(id)`, GET /api/orders/:id) — used by both the
   "refresh full details when the detail modal opens" effect and the `openOrderId` deep-link effect.
   Same dropped joins as above (table_number/waitress_name/collected_by_name), same kept `table_name`.
   The route's own `loanDetails` nested object (a separate `loans` lookup) IS replicated as its own
   nested object, since the detail modal reads `selectedOrder.loanDetails?.xxx` with a fallback to
   the flat `loanXxx` fields the list fetch already provides — matching the real response shape.
3. `fetchSupportData()` (was `tablesAPI.getAll()` + `usersAPI.getAll()` + `menuAPI.getItems()`, GET
   /api/tables, /api/users, /api/menu/items) — feeds the edit modal's table/waitress dropdowns and
   the add-items menu search. `tables.js`'s own `waitress_name`/`order_total` join dropped (grepped
   clean — only `table.id`/`name`/`tableNumber` ever read), same precedent as TablesScreen.jsx's own
   `fetchTables`. `users.js`'s route already excludes `password_hash` via an explicit column list
   and applies no role filter — replicated as a plain `SELECT *` (local `users` table has no
   credential columns synced anyway). `menu.js`'s `category_name` join kept only for its `ORDER BY
   c.sort_order, m.sort_order, m.name` (grepped clean — zero `categoryName` references), same
   precedent as MenuScreen.jsx's own `fetchItems`.

**Boolean-column check: already correct, no fix needed.** `order_items.is_free`/`item_ready` are
both already listed in `case.js`'s `BOOL_FIELDS` (`isFree`/`itemReady`) — verified directly.
Neither is actually read anywhere in this screen (grepped clean), so this was a non-issue in
practice, but the coercion is correct either way. `orders`/`loans`/`restaurant_tables` have no
boolean columns at all (checked `powersync/schema.js`).

**Write path completely untouched** — `handleStatusChange`/`handleDelete`/`handleCancelOrder`/
`saveEditedOrder`/`processPayment` still call `ordersAPI.updateStatus`/`delete`/`cancel`/`update`/
`pay` over REST exactly as before (verified by direct comparison against the pre-edit file — only
each read call site was touched). The `openOrderId`/`clearOpenOrderId` deep-link prop mechanism
itself (AdminShell.jsx's `goTo()` parsing) is untouched — only the data fetch it triggers
(`fetchOrderDetail`) was converted. `menuAPI`/`tablesAPI`/`usersAPI` imports dropped entirely (each
had exactly one call site, inside `fetchSupportData`, now gone, grepped clean); `ordersAPI` kept
for its five remaining writes.

Esbuild-verified clean (`--bundle --loader:.jsx=jsx --format=esm`, external
react/react-dom/react-router-dom/lucide-react). **Not yet tested on the real machine** — next
check: open Orders from the sidebar, confirm active/paid/cancelled tabs all load with the same
data/counts as before; open an order's detail modal and confirm table name, items, totals, and (for
a loan-paid order) the loan borrower section all render correctly; use the Tables screen's "View
Full Order" button to confirm the `?open=<id>` deep link still auto-opens the right order and
doesn't reopen on a later re-render; switch the Paid tab's date range and confirm it actually
refilters; open the Edit Order modal and confirm the table/waitress dropdowns and the add-items
menu search all populate; run each write path (status advance, edit+save, cancel, delete, and the
Collect Payment modal incl. split/discount/loan) and confirm all five still work exactly as before
(untouched REST paths) — this is the biggest screen converted so far, so give it the most thorough
pass of the four.

## Task #31, third screen done (2026-07-28): Menu screen converted to local PowerSync reads

`pos-app/src/pages/admin/screens/MenuScreen.jsx` is the third of the 9 Admin screens converted
(after Tables, Loans) — same pattern, same standing rules (writes untouched, camelizeRows on
every local result, no restaurant_id filter needed). Remaining: Dashboard, Inventory, Orders,
Staff, Settings, Profile.

**Four reads converted, all verified against the real backend route files first**
(`restaurant-app/backend/src/routes/menu.js`, `warehouse.js`), each pulled into its own small
`fetchX()` helper so writes' own post-save refetches (reads, not writes) reuse the same converted
query instead of hitting REST a second time:
1. `fetchCategories()` (was `menuAPI.getCategories()`) — plain `SELECT * FROM categories ORDER BY
   sort_order, name`, matching the real route exactly (no filter params ever passed by this
   screen).
2. `fetchItems()` (was `menuAPI.getItems()`) — `menu_items` LEFT JOIN `categories`, matching the
   real route's own join. The joined `category_name` column is deliberately NOT selected (grepped
   the whole file for `categoryName`/`category_name` — zero data references, this screen looks up
   the category object itself via `categories.find(...)` instead); the join is kept only for its
   `ORDER BY c.sort_order`, same precedent as TablesScreen.jsx's `fetchMenuForAddFood`.
3. `fetchItemIngredients(itemId)` (was `menuAPI.getItemIngredients(id)`) — `menu_item_ingredients`
   JOIN `warehouse_items` for ingredient name/unit, matching the real route's own join; its
   `JOIN menu_items m` (there purely for that route's own restaurant-ownership check) is dropped
   since no restaurant_id filter is needed locally either way. Used both when opening the edit-item
   modal and to refresh the list after the unchanged REST add/remove-ingredient writes.
4. `fetchWarehouseItems()` (was `warehouseAPI.getAll()`, powering the ingredient-search picker) —
   the real route is NOT a plain select: it LEFT JOINs `suppliers` for `supplier_name` and does a
   per-row N+1 fetch of `stock_batches` (quantity_remaining > 0), attached as `row.batches`.
   Grepped this whole file and confirmed only `wi.id`/`wi.name`/`wi.unit` are ever read off each
   row — never `supplierName`/`batches` — so neither the supplier join nor the batches sub-fetch
   was replicated; both are dead weight for this screen specifically. `warehouseAPI` import
   dropped entirely (this was its only call site, grepped clean).

**`is_available`/`BOOL_FIELDS` check: already correct, no fix needed.** `isAvailable` was already
present in `case.js`'s `BOOL_FIELDS` set before this session — verified directly, not assumed —
so the availability toggle's `item.isAvailable !== false`/`!== false` strict-equality logic gets a
real boolean from every local read, same as it did from REST.

**Write path completely untouched** — every one of `handleSaveCategory`/`handleDeleteCategory`/
`handleSaveItem`/`handleDeleteItem`/`handleAddIngredient`/`handleRemoveIngredient`/
`addStationPreset`/`removeStationPreset`/`moveCategory`/`toggleAvailability` still calls its REST
write via `menuAPI` exactly as before (verified by direct comparison against the pre-edit file —
only each write's own post-save *refetch* call was swapped for the new local helper, the write
call itself was never touched). Photo/logo upload's disabled-control precedent is also untouched —
this conversion never touched that code path.

Esbuild-verified clean (`--bundle --loader:.jsx=jsx --format=esm`, external
react/react-dom/react-router-dom/lucide-react). **Not yet tested on the real machine** — next
check: open Menu from the sidebar, confirm categories/items load with the same counts/order as
before and the 5s silent poll doesn't flicker; open an item's edit modal and confirm the
ingredient list and the ingredient-search picker (warehouse items) both populate correctly; add/
remove an ingredient and confirm the list refreshes without a page reload; toggle an item's
availability and confirm the badge/icon flip instantly (the concrete `BOOL_FIELDS` check to
verify); add/edit/delete a category and an item, confirm both persist and the list re-sorts
correctly; add and delete a custom kitchen station via the item modal's quick-pick. See
SESSIONS.md's 2026-07-28 entry for the full per-read reasoning.

## Task #31, second screen done (2026-07-28): Loans screen converted to local PowerSync reads

`pos-app/src/pages/admin/screens/LoansScreen.jsx` is the second of the 9 Admin screens converted
(after Tables) — same pattern, same standing rules (writes untouched, camelizeRows on every local
result, no restaurant_id filter needed). Remaining: Dashboard, Menu, Inventory, Orders, Staff,
Settings, Profile.

**Two reads converted, both verified against the real route files first, not guessed**
(`restaurant-app/backend/src/routes/loans.js`, `orders.js`): `fetchLoans()` (was `loansAPI.
getAll({from,to})`, GET /api/loans) — now a local `SELECT l.* + o.daily_number + t.name AS
table_name FROM loans LEFT JOIN orders LEFT JOIN restaurant_tables`, matching the real route's
own join. Deliberately dropped that route's `order_type`/`order_customer_name` columns (grepped
the whole file for `orderType`/`order_type`/`orderCustomerName` — zero matches, dead weight for
this screen) and its optional `status` query param (this screen never sends one — status filtering
is entirely client-side in the `filtered` useMemo, matching the real call site). `daily_number`/
`table_name` ARE kept since the list cards read `loan.dailyNumber`/`loan.tableName`. Date-range
filtering (`period.from`/`period.to`) replicated as `DATE(l.created_at) >= ? AND DATE(l.created_at)
<= ?`, matching the backend's `DATE(l.created_at) >= $n::date` casts. Second read:
`LoanDetailsModal`'s order-items fetch (was `ordersAPI.getById(loan.orderId)`, GET /api/orders/:id)
— grepped the whole file for every `order.`/`order?.` usage and found exactly one,
`order?.items || order?.orderItems` (the itemized breakdown/subtotal) — so rather than replicate
the full order row (table_number/waitress_name/collected_by_name/loanDetails joins this screen
never reads), only the real route's items sub-query was ported: `order_items` LEFT JOIN
`menu_items` for name/unit, same fallback pattern (`COALESCE(...,'Unknown item'/'piece')`) as
TablesScreen.jsx's own `fetchTableOrder`. `ordersAPI` import dropped entirely (its one call site
is gone, grepped clean). No computed-subquery or two-source-merge case here unlike Tables — both
reads were plain joins, faithfully replicable in full.

**Write path completely untouched** — `handleMarkPaid` still calls `loansAPI.markPaid` (`PATCH
/api/loans/:id/pay`) over REST exactly as before, verified by direct comparison against the
pre-edit file (that code block was never touched by any edit this session).

**No boolean columns involved** — checked `case.js`'s `BOOL_FIELDS` list and the `loans` table in
`powersync/schema.js`; the `loans` table has no boolean columns at all, so no coercion gotcha here
(unlike screens touching `is_active`/`is_available`-style fields).

Esbuild-verified clean (`--bundle --loader:.jsx=jsx --format=esm`, external
react/react-dom/react-router-dom/lucide-react). **Not yet tested on the real machine** — next
check: open Loans from the sidebar, confirm the list/stats load with real data and the 10s poll
doesn't flicker; switch date-range presets/custom range and confirm the list actually refilters;
open a loan's details modal and confirm the linked order's itemized breakdown + subtotal render
correctly (and that a loan with no `orderId` still shows "No order linked" instead of erroring);
collect a payment (any method) and confirm it still works exactly as before (untouched REST path).
See SESSIONS.md's 2026-07-28 entry for the full per-read reasoning.

## Task #31, first screen done (2026-07-28): Tables screen converted to local PowerSync reads

`pos-app/src/pages/admin/screens/TablesScreen.jsx` is the first of the 9 Admin screens to have its
REST reads swapped for local PowerSync reads — this sets the conversion pattern for the remaining 8
(Dashboard, Menu, Inventory, Orders, Loans, Staff, Settings, Profile still to go). **Writes are
completely untouched** — every one of `handleSave`/`handleDelete`/`handleSaveReservation`/
`handleSeatGuests`/`handleCancelReservation`/`handleMarkFree`/`handleApplyStatus`/
`handleAddSection`/`handleDeleteSection`/`handleRenameSection`/`handleAddFoodToOrder` still calls
its REST write via `tablesAPI`/`ordersAPI` exactly as before, verified by direct comparison against
the pre-edit file (none of those code blocks were touched by any edit this session).

**Five reads converted, all faithful to the real backend route's own SQL** (verified against
`restaurant-app/backend/src/routes/tables.js`, `orders.js`, `menu.js` before writing any query, not
guessed): `fetchTables()` (now a local `SELECT rt.* + a scalar order_total subquery over
orders/order_items`, matching `GET /api/tables`'s own computed column — deliberately dropped that
route's `waitress_name` join since grep confirmed nothing in this screen reads a per-table
`waitressName`/`waitress_name`); `fetchSections()` (two local `SELECT`s — `table_sections` +
`DISTINCT restaurant_tables.section` — feeding the exact same client-side `Set`-merge/optimistic-
shield logic the screen already had, matching `GET /api/tables/sections`'s own two-source union);
`fetchTableOrder(tableId)` (local `orders` + `users` join for the active order, `ORDER BY
created_at DESC LIMIT 1` instead of fetching an array and indexing `[0]`, plus a local `order_items`
+ `menu_items` join for item name/unit — matches `GET /api/orders?table_id=&status=` then `GET
/api/orders/:id`, dropping only the `table_number`/`paid_by`/`loanDetails` parts nothing in this
screen reads); the duplicate inline order-id lookup inside the "View Full Order" button's `onClick`
(same conversion, just the `id` column); and `fetchMenuForAddFood()` (local `categories` +
`menu_items` joined only for matching `ORDER BY`, confirmed via `menu.js` that neither REST call
this screen makes passes any filtering query param). Every local result is run through
`camelizeRow`/`camelizeRows` (`pos-app/src/lib/case.js`) before use, so component code needed zero
changes. No local query needs an explicit `restaurant_id` filter — confirmed (not assumed) via
`restaurant-app/backend/src/routes/auth.js`'s `GET /api/auth/powersync-token`, which mints the
PowerSync JWT with a `restaurant_id` custom claim specifically so the Sync Streams config can scope
every table server-side via `auth.parameter('restaurant_id')` before a row ever reaches the local
SQLite file. `menuAPI` import dropped (unused after conversion, grepped clean);
`tablesAPI`/`ordersAPI` both kept for their remaining write calls.

Esbuild-verified clean. **Not yet tested on the real machine — this is the very first local-read
conversion in the whole build, so it also doubles as the first real test of whether PowerSync
actually has synced, queryable data for these 5 tables in practice, not just "sync config deployed
successfully."** Next check: open Tables, confirm the grid/section chips/detail-sheet/View-Full-
Order sheet/Add-Food sheet all show the same data they did over REST; if anything renders empty
where REST would have shown real rows, treat that as a PowerSync sync-state issue first (per the
task #21 completion note below) before suspecting these queries. See SESSIONS.md's 2026-07-28 entry
for the full per-read reasoning.

Last updated: 2026-07-27 (task #21 now fully COMPLETE — PowerSync Cloud Sync Streams deployed by
the user for the 9 extended tables. Hit and fixed a real gap along the way: the Sync Streams
validator rejected all 9 with "permission denied"/"table could not be found in the source
schema" — root cause confirmed via `information_schema.role_table_grants`: adding a table to the
`powersync` publication is necessary but not sufficient, `powersync_role` also needs an explicit
`GRANT SELECT` on each table, which the original task #21 work never did (only `orders`/`users`
had it, from Phase 0 setup). Fixed via `GRANT SELECT ON warehouse_items, suppliers, stock_batches,
stock_movements, supplier_deliveries, delivery_items, loans, shifts, staff_payments TO
powersync_role;` — confirmed via the same information_schema query that all 9 now have it.
Streams validated and deployed successfully after that. **Task #31 (converting Admin screens'
REST reads to local PowerSync queries) can now proceed for real** — nothing else is blocking it.
Next session: confirm the pos-app's local SQLite is actually receiving rows for these 9 tables
(e.g. via a quick `powersync:getAll` count check) before starting the screen-by-screen
conversion, since "deployed successfully" confirms the config is valid, not yet that data has
actually landed locally. Before that: User compared the Admin panel's real-world loading
speed against the old Electron app and correctly called out that it feels the same — because it
currently IS the same. Honest finding, not previously stated this plainly: **all 9 ported Admin
screens still read entirely over REST** (client.js → IPC → Render), zero of them use local
PowerSync. The promised 2-3x speed win requires two more things neither of which is done yet: (1)
the user finishing the PowerSync Cloud Sync Streams dashboard config for task #21's 9 newly-
published tables, (2) then converting each screen's REST reads to local PowerSync queries where
the backing table is actually synced — that conversion work was never started, it was out of
scope for the "port verbatim first" phase. **User explicitly deferred this to next session** — see
new task #31. Start there next time, beginning with Tables (its data — restaurant_tables/orders —
is already fully synced today, so it can convert without waiting on the dashboard step). Earlier
this same session: real-machine testing of the Admin panel began, and found and fixed
a real backend bug: menu photo URLs saved as `http://` instead of `https://` behind Render's proxy,
silently blocked by the Admin panel's CSP. See "Fixed: menu photos blocked by CSP" below — this is
a genuine backend fix (committed, needs the user to `git push`), not just an Admin-panel-only
change, and also affects the already-shipped cashier POS's photo cache. Before that: Admin: Profile
screen built (task #30) — ninth and LAST real Admin
screen (~320 lines, the smallest of all 9): the logged-in admin's own profile info, an edit-profile
modal, and a change-password modal over `usersAPI.getMe()`/`update()`/`updateCredentials()`. This
completes the full 9-screen Admin panel screen-porting effort (tasks #20-30) — see "Admin panel
build complete — summary" below for the honest full-scope picture of what's done vs. still
outstanding before this is shippable. No AuthContext in pos-app, so `authUser`/`updateUser` became
a local `profile` state seeded from the `user` prop and refreshed via `usersAPI.getMe()` on mount,
same as every other screen's "use the already-passed-down user prop" adaptation — one flagged,
deliberate limitation: the sidebar's own name/avatar won't reflect an edit made here until next
login, since there's no callback wired back up through App.jsx for it (judged out of scope for a
cosmetic staleness gap on the last screen). The Sign Out button was rewired to call the same
`onLogout` the sidebar's own Sign Out button already uses (a new prop AdminShell.jsx now passes to
every screen) instead of the source's raw `localStorage`+`window.location.href`, which has no
Electron equivalent. Printing, `window.prompt/confirm/alert`, and avatar/photo upload all grepped
clean — confirmed, not assumed. No new shared deps. See "Admin: Profile screen" below for full
detail.
Before that: Admin: Restaurant Settings screen built (task #29) — tenth real Admin
screen (~440 lines, the smallest so far): a 4-tab settings form (Restaurant Info, Financial,
Receipt Template, Kitchen Order Template) over a single `settingsAPI.get()`/`update()` round-trip,
no polling — built against REST throughout per the earlier PowerSync-scoping research (task #21)
that recommended keeping this screen on REST even though its 3 backing tables are all in the sync
scope now. The whole "Printers" tab (receipt/kitchen printer name/IP/port fields, kitchen-station
assignment, the 5-step connect-a-printer guide, add-printer forms) was excluded entirely — removed
as dead code, not stubbed, since it's genuine printer hardware config, the specific thing the
standing rule calls out for a restaurant-settings screen. A real data-preservation fix was needed
because of that: `receiptPrinters`/`kitchenPrinters` are still loaded and round-tripped unchanged
on every save so an unrelated edit (e.g. currency symbol) can't silently wipe out printer config set
via the website. Receipt/Kitchen "template" toggles (what shows on a printed receipt/kitchen
ticket) were deliberately kept — pure settings data with no print-execution code attached, distinct
from the printer-hardware exclusion. Logo upload hit the known `settingsAPI.uploadLogo` stub,
handled with the Menu screen's disabled-control precedent. `window.prompt/confirm/alert` grepped
clean. No new shared deps. See "Admin: Restaurant Settings screen" below for full detail.
Before that: Admin: Staff screen built (task #28) — ninth real Admin screen (~2155
source lines): Staff/Attendance/Payroll tabs — staff CRUD incl. login-credentials editor and
kitchen-station quick-pick, a live clock-in/out status view (calls REST `shiftsAPI.
getStaffStatus()` exactly like the website, per the standing note that its "today's most relevant
shift" logic is real server-side business logic, not reimplemented client-side or read from local
PowerSync even though `shifts`/`staff_payments` are in the `powersync` publication now), and
salary-type-aware payroll (hourly/daily/weekly/monthly) with debt carry-over, a record-payment
modal, and a payroll details modal. No new shared deps beyond the already-existing `ConfirmDialog`
— `usersAPI`/`shiftsAPI`/`staffPaymentsAPI`/`menuAPI`/`money`/`Dropdown`/`DatePicker`/`PhoneInput`
were already ported and verified for earlier screens; `permissionsAPI` (imported but never called
in the source) dropped entirely. Printing grepped clean — zero matches. Real `window.confirm()` bug
found and fixed (second Electron-native-dialog bug in this build, after Inventory's `window.
prompt()`): one bare `confirm(...)` guarding the delete-payment button in the payroll details
modal, replaced with the shared styled `ConfirmDialog`. Four unused lucide icons dropped (`Shield`/
`LogOut`/`LogIn`/`UserX`). See "Admin: Staff screen" below for full detail.
Before that: Admin: Loans screen built (task #27) — eighth real Admin screen (~939
source lines, the smallest so far): customer loans list with stats/search/status-filter and a
date-range calendar picker, a loan details modal (pulls the linked order's items via
`ordersAPI.getById`), and a collect-payment modal (cash/card/QR). No new shared deps — `loansAPI`/
`ordersAPI`/`money`/`useTranslation` were already ported and verified for earlier screens; this
screen doesn't use `Dropdown`/`DatePicker`/`PhoneInput`/`ConfirmDialog` at all (has its own inline
calendar picker) and never calls `navigate`. Printing and `window.prompt/confirm/alert` both
grepped clean — zero matches, nothing to exclude or fix. Two real findings that correct the task
brief's assumptions, both re-verified against the actual source, not re-guessed: there is no
"remind overdue" flow anywhere in this screen — `client.js`'s `loansAPI.notifyOverdue()` exists but
has zero call sites in `AdminLoans.jsx`, nothing was ported for it; `loansAPI.getStats()` is
confirmed genuinely unused too — this screen computes total/active/overdue/outstanding client-side
from the raw `loansAPI.getAll()` array instead. See "Admin: Loans screen" below for full detail.
Before that: Admin: Orders screen built (task #26) — seventh real Admin screen
(~2145 source lines): active/paid/cancelled order tabs, order detail modal, status-flow buttons,
edit-in-modal (incl. the shared weighed-item amount picker), cancellation, and the Collect Payment
modal (cash/card/QR/loan, discount, split-bill). No new shared deps — everything it calls
(`ordersAPI`/`menuAPI`/`tablesAPI`/`usersAPI`, `useApi`/`money`/`fmtDate`, `Dropdown`/`DatePicker`/
`PhoneInput`) was already ported and verified for earlier screens. Solved the real `?open=<id>`
deep-link gap Tables (task #23) left behind: `AdminShell.jsx`'s `goTo` now parses a trailing
`open=<id>` query param into `openOrderId` state, handed to the active screen as a prop pair
(`openOrderId`/`clearOpenOrderId`) alongside `navigate` — OrdersScreen consumes it in a `useEffect`
(fetch + open the detail modal, then clear it) the same way the website consumed
`useLocation().search`. Printing excluded per the standing rule — grepped the source for
"print"/"Print" and found a real, non-trivial set this time (`usePrinter()` hook, `printReceipt`
call, `handlePrintCheque()`, the `restSettings`/`accountingAPI.getRestaurantSettings()` effect that
only fed it, the `fmtOrderNum()` helper, and the "Print Receipt" button in the Collect Payment
modal) — all removed as dead code, not stubbed. No `window.prompt`/`confirm`/`alert` found — grepped
clean, nothing to fix (unlike Inventory's `window.prompt()` bug). One real, deliberate functional
deviation, not a pure design tweak: the header's "+ New Order" button called
`navigate('/admin/new-order')` in the source, a full standalone page whose `AdminNewOrder.jsx`
branch was never ported into pos-app (Tables' port, task #23, only ported the `isModal` branch,
since Tables is the only caller and always uses it) — redirected the button to `navigate('/admin/
tables')` instead, the actual place a new order gets created in this build. See "Admin: Orders
screen" below for full detail. Before that: Admin: Inventory screen built (task #25) — sixth real
Admin screen, and
the largest one so far (~2170 source lines). Two new shared deps ported: `Dropdown.jsx` (unchanged)
and `DatePicker.jsx` (import-path adjusted). One real runtime-compatibility fix (not a design
change): the source's two `window.prompt()` calls replaced with a small local modal, since
Electron's renderer doesn't implement `window.prompt()` at all — see "Admin: Inventory screen"
below. Before that: Admin: Menu screen built (task #24) — fifth real Admin screen. New
shared dep ported: `ConfirmDialog.jsx`. Real, deliberate deviation from pure verbatim: the item-
photo upload control is shown disabled with an explanatory tooltip instead of wired to the known
`menuAPI.uploadImage` stub, which would throw on first real use — see "Admin: Menu screen" below.
Before that: Admin: Tables + New Order screens built (task #23) — second real Admin screen after
Dashboard. Found and fixed a real pre-existing bug in the website's AdminNewOrder.jsx along the
way: its modal mode never rendered the amount-picker for weighed/kg-l items at all — see
"Admin: Tables + New Order screens" below. Before that: Admin panel build started — foundation
only so far (task #20): generic write IPC, ported website i18n + API client + LanguageContext, new
AdminShell/AdminPanel with Preflight-free Tailwind, lazy-loaded `/admin` route. Standing rule for
all Admin work: no design/functional changes from the website, speed-only improvements allowed,
printing excluded until told otherwise. Before that: design-parity round 2 fixes + new "add items
to an existing order from Menu" feature —
CONFIRMED WORKING. Fixed and deployed a 403 bug blocking Edit → Done on Orders/Tables — CONFIRMED
WORKING. Fixed weighed items in Orders'/Tables' edit modes twice over (not understood at all,
then ADD/+ asking for the wrong thing — see entries below). Did a free speed pass: DB indexes +
image cache headers applied, dev-vs-packaged-build and a Render keep-alive pinger handed back to
the user — see below. Follow-up round on the same theme: self-hosted the font, added a local
photo disk-cache, and a stale-data badge for History/Receivables — see "Offline/robustness pass"
below. Then: full UZ translation of the whole cashier panel + fixed the UZ/EN toggle, which
previously changed state but translated nothing — see "Full Uzbek translation" below.)

## Admin panel build complete — summary (2026-07-27, same day)

All 9 sidebar screens of the pos-app Admin panel port are now built: Dashboard (#22), Tables +
New Order (#23), Menu (#24), Inventory (#25), Orders (#26), Loans (#27), Staff (#28), Restaurant
Settings (#29), and Profile (#30, this session). This is a real milestone — every screen the
website's Admin sidebar has, pos-app's Admin sidebar now has too, each ported verbatim from the
corresponding website page under the standing "no design/functional changes, speed-only
improvements allowed" rule. **It is functionally complete end-to-end, not "shippable" yet** —
here's the honest full-scope picture of what's still outstanding, pulled from the actual task
entries below, not re-guessed:

(a) **Nothing has been tested on a real machine for ANY of the 9 screens.** Every single task
entry below ends with its own "Not yet tested on the real machine — next check: ..." list. This is
the single most important next step before this can be considered shippable — esbuild passing only
confirms the JS/JSX is syntactically valid and every import resolves, not that any screen actually
renders correctly, that any REST call succeeds against the live backend, or that any write persists
correctly. A full pass through all 9 screens on the real Electron app, following each task's own
"next check" list, needs to happen before anything else.

(b) **The PowerSync Cloud Sync Streams dashboard config for Inventory/Loans/Staff's 9 extended
tables (task #21) is still a pending manual step for the user.** `warehouse_items`, `suppliers`,
`stock_batches`, `stock_movements`, `supplier_deliveries`, `delivery_items`, `loans`, `shifts`,
`staff_payments` were all added to the `powersync` publication and to `pos-app/powersync/schema.js`
this build session, but the actual Sync Streams query config (one stream per table, scoped to
`restaurant_id`) has to be added by hand in the PowerSync Cloud dashboard's "the-bill-pos" project —
no API access to that dashboard exists from this sandbox. See task #21's own STATUS.md section
above for the exact column lists to use per table. Every screen that reads these 9 tables (Inventory,
Loans, Staff) is built against REST regardless, by design, so this doesn't block using them today —
it only blocks ever moving those reads to local PowerSync for speed later.

(c) **Printing/print-related functionality was deliberately excluded from all 9 screens, per the
standing rule for this whole build phase, and is explicitly the next major phase once the user says
to start it.** Where the source actually had working print code, it was removed as dead code, not
stubbed (Orders' `usePrinter()`/`printReceipt`/`handlePrintCheque()`/"Print Receipt" button;
Settings' entire "Printers" tab — printer IP/port fields, the connect-a-printer guide, add-printer
forms). Where a screen had none, that was confirmed by grep, not assumed (Dashboard, Tables, Menu,
Inventory, Loans, Staff, Profile). This build phase's whole architecture (PowerSync + REST writes)
was never meant to include real printer-hardware wiring — that's a distinct, larger piece of work
(local ESC-POS socket printing, per RULES.md §4) waiting on an explicit go-ahead.

(d) **A handful of small known gaps carried across screens, none of them new to this task:**
  - **Photo/logo upload isn't wired to real IPC yet** (Menu's item photo, Settings' restaurant
    logo) — `menuAPI.uploadImage`/`settingsAPI.uploadLogo` both throw "not yet supported" by design
    (pos-app's IPC layer is JSON-only, no multipart/FormData path exists). Both screens show a
    disabled control with an explanatory tooltip instead of a broken upload button. Real multipart
    IPC support would need to be built before either upload actually works from pos-app.
  - **The website's own `AdminNewOrder.jsx` has a real pre-existing bug** (found porting Tables,
    task #23): its modal-mode branch never rendered the amount-picker for weighed/kg-l items at
    all, so a cashier can never actually add a weighed item (e.g. "Jiz" rice) from the website's
    Admin → Tables → New Order flow today. Fixed in the port (`NewOrderModal.jsx`), but **not yet
    back-ported to the live website** — the same one-block JSX fix needs to land in
    `website/src/pages/admin/AdminNewOrder.jsx` for the website itself to stop having this bug.
  - **"+ New Order" in the Orders screen redirects to Tables, not a standalone new-order page.**
    The website's Orders page calls `navigate('/admin/new-order')`, a full standalone route whose
    page was never ported into pos-app (only the modal-mode branch Tables already uses was ported,
    task #23) — pos-app's Orders screen redirects that button to Tables instead (task #26), the
    actual place a new order gets created in this build, rather than landing on a blank
    placeholder screen.

## Fixed: menu photos blocked by CSP — real backend bug, not an Admin-panel-only issue (2026-07-27)

First real-machine testing of the Admin panel (Tables screen) surfaced two console errors:
1. Repeated `Failed to fetch tables: ... Client network socket disconnected before secure TLS
   connection was established` — this is the ALREADY-DOCUMENTED, ALREADY-ACCEPTED Render free-tier
   spin-down issue from earlier today (see the "RESOLVED" open-questions entry near the bottom of
   this file) — not a new bug, expected to keep happening since the user chose to leave Render on
   Free for now.
2. `Refused to load the image 'http://the-bill-backend-pego.onrender.com/uploads/menu/....jpg'
   because it violates the following Content Security Policy directive: "img-src 'self' data:
   app-photo: https://the-bill-backend-pego.onrender.com".` — **this one is a real, previously-
   unknown bug**, root-caused by reading the actual backend code, not guessed:
   `restaurant-app/backend/src/routes/menu.js`'s upload endpoint builds the photo's `fullUrl` as
   `` `${req.protocol}://${req.get('host')}${relativePath}` ``. Render terminates TLS at its own
   edge and forwards to this Node process over plain HTTP internally (passing the real scheme via
   an `X-Forwarded-Proto` header) — Express ignores that header unless `app.set('trust proxy', 1)`
   is set, which it never was. So `req.protocol` has been reporting `'http'` for every upload,
   meaning every stored `image_url` in the database is `http://...` instead of `https://...`.
   pos-app's Admin panel CSP deliberately only allows `https://` for this origin (`img-src ...
   https://the-bill-backend-pego.onrender.com`) — so every menu item photo with a bad stored URL
   gets silently blocked by the browser instead of just failing to load. This would also affect
   the website's own `<img>` tags via ordinary browser mixed-content blocking (not independently
   confirmed live, but the same bad data underlies both).

**Fixed on both ends:**
- `restaurant-app/backend/src/server.js` — added `app.set('trust proxy', 1)` right after `express()`
  init, with a comment explaining why. Fixes every NEW upload going forward. Committed locally
  (`c24a2ca`) to the backend's own nested repo — **no GitHub push credentials in this sandbox, same
  as every prior backend fix this project — needs `git push origin main` from
  `restaurant-app/backend/` on the user's machine, then Render auto-deploys from there.**
- Existing rows already saved with the bad `http://` URL are NOT retroactively fixed by the above
  (it only affects future uploads) — handled client-side instead, immediately, no backend deploy
  or data migration needed: `pos-app/src/pages/admin/screens/MenuScreen.jsx`'s `resolveImgUrl()`
  now also upgrades `http://the-bill-backend-pego.onrender.com` → `https://` (same host/path, just
  the scheme) before rendering. **Also fixed the identical latent bug in the already-shipped
  cashier POS**: `pos-app/src/lib/localPhoto.js`'s `localPhotoSrc()` only ever recognized the
  `https://` prefix when deciding whether to route a photo through the local disk cache — any
  bad `http://` stored URL would have silently fallen through unchanged and hit the exact same CSP
  block there too. Now checks both prefixes before extracting the filename; the `app-photo://`
  scheme it returns carries no protocol at all, so this has zero effect on the caching behavior
  either way, just fixes which URLs get recognized as "ours."

All three touched files verified: `node --check` for `server.js`, Linux `esbuild` for
`MenuScreen.jsx`/`localPhoto.js`. **Not yet re-tested on the real machine** — next check: once the
backend fix is pushed and deployed, confirm existing menu photos with bad URLs now render in both
the Admin Menu screen and the cashier's Menu screen (the client-side fix should make this work
immediately, even before the push/deploy); re-upload a fresh photo afterward and confirm its new
`image_url` is `https://` from the start.

## Admin: Profile screen (2026-07-27, same day) — task #30

Ninth and LAST real Admin screen, and the smallest of all 9 — ported verbatim from `website/src/
pages/admin/AdminProfile.jsx` (~320 lines) into `pos-app/src/pages/admin/screens/ProfileScreen.jsx`
(~320 lines), exported as `AdminProfileScreen`: the logged-in admin's own profile info card (name/
phone/email/role/member-since/last-login), a Security card with a change-password action, a Sign
Out button, an edit-profile modal, and a change-password modal — all over `usersAPI.getMe()`/
`update()`/`updateCredentials()`, no polling.

**No AuthContext in pos-app — the one real structural adaptation, same class of fix as every other
screen that needed the current user.** The website reads/writes the logged-in user via `useAuth()`
(`authUser`/`updateUser`, backed by its own `AuthContext.jsx` + `localStorage`); pos-app has no such
context, just a plain `user` prop handed down from `App.jsx`'s session state through
`AdminPanel.jsx`/`AdminShell.jsx`. Replaced `authUser` with a local `profile` state seeded from the
`user` prop and refreshed from `usersAPI.getMe()` on mount, exactly matching the source's own
"fetch fresh, fall back to cached on failure" behavior; `updateUser(patch)` calls became
`setProfile(prev => ({ ...prev, ...patch }))`.

**Known, deliberately-flagged limitation, not a silent bug.** Editing your name/phone updates this
screen's own display immediately (identical to the website), but `AdminShell.jsx`'s sidebar header
(avatar initials + name) reads a `user` prop snapshot taken once when the Admin panel mounted, with
no callback wired back up to refresh it — so the sidebar itself won't reflect the edit until the
next login. The website doesn't have this gap since its `AuthContext` is one shared source of truth
for both the profile page and its own layout. Re-threading a live-update callback through
`App.jsx` → `AdminPanel.jsx` → `AdminShell.jsx` was judged out of scope for a cosmetic staleness gap
on a rarely-changed field, on the very last screen of this build — flagged clearly in the file's own
header comment for a future session to pick up if the project owner wants the sidebar to update
live.

**Sign Out button routed through the existing centralized logout, not re-implemented as a second
code path.** The source's Sign Out button does its own `localStorage.removeItem('token'/'user')` +
`window.location.href = '/login'` — a raw browser redirect that has no equivalent in Electron (no
such URL to navigate to outside `App.jsx`'s own router, and pos-app's real logout also has to call
`window.electronAPI.logout()` first). `AdminShell.jsx`'s sidebar already has its own "Sign Out"
button wired to exactly that real flow via an `onLogout` prop from `AdminPanel.jsx`'s
`handleLogout` — extended `AdminShell.jsx` to also pass `onLogout` down to whichever screen is
active (alongside the existing `navigate`/`openOrderId`/`clearOpenOrderId`), so this screen's
identical Sign Out button/confirm-dialog now calls that same function. Every other screen ignores
the extra prop harmlessly, same precedent as `navigate` itself being passed to screens that never
call it.

**All three standing build-wide concerns grepped clean — verified against the real file, not taken
on the task brief's own "likely none" prediction.**
- **Printing:** zero matches for "print"/"Print" anywhere in the source — nothing to exclude.
- **`window.prompt`/`window.confirm`/`window.alert`:** zero matches for all three (plus bare
  `confirm(`/`alert(`/`prompt(`) — the source's only confirm-style interaction (Sign Out) already
  goes through its own `ConfirmDialog` component, the same pattern this build standardized on after
  Inventory's/Staff's real bugs — nothing needed fixing here.
- **Avatar/photo upload:** re-confirmed none exists, rather than trusting the earlier MEMORY.md
  note verbatim. The header avatar is a pure initials chip (`getInitials`), no file input, no
  upload API call anywhere in the file — the `menuAPI.uploadImage`/`settingsAPI.uploadLogo`
  disabled-control precedent doesn't apply here because there's genuinely nothing to stub.

**No new shared dependencies.** `usersAPI` (client.js — `getMe`/`update`/`updateCredentials`) and
`ConfirmDialog`/`PhoneInput` (+ its named `formatPhoneDisplay` export) were all already ported and
verified for earlier screens — every method this screen calls matches exactly. All 16 lucide icons
this screen imports (`User`, `Mail`, `Phone`, `Shield`, `Save`, `X`, `LogOut`, `Lock`, `Edit2`,
`Eye`, `EyeOff`, `Clock`, `Calendar`, `ChevronRight`, `Check`, `AlertCircle`) confirmed present in
the installed `lucide-react` version by listing its `dist/esm/icons/` folder directly, not assumed.
All 28 unique `t()` keys this screen calls diffed key-by-key against both `en.json`/`uz.json` by
script — zero missing in either language, all already present from earlier work (`admin.profile.*`/
`common.*`/`alerts.failed*`/`placeholders.yourName`), nothing new added.

**Files:** `pos-app/src/pages/admin/screens/ProfileScreen.jsx` (new, ~320 lines),
`pos-app/src/pages/admin/AdminShell.jsx` (`onLogout` now also passed to the active screen, header
comment updated), `pos-app/src/pages/admin/AdminPanel.jsx` (`profile: ProfileScreen` uncommented in
`SCREENS`). All three esbuild-verified clean (`--bundle --loader:.jsx=jsx --format=esm`, external
react/react-dom/react-router-dom/lucide-react). **Not yet tested on the real machine** — next check:
open Profile from the sidebar (or Dashboard's own Quick Action button, which already targeted
`/admin/profile` since task #22) and confirm the header/info card/security card render with real
data; edit name/phone and Save Changes, confirm the screen's own display updates immediately (email
field stays disabled, matching the source); change password with a too-short value, a mismatched
confirm, and a valid matching pair, and confirm each validation path plus the final success toast;
tap Sign Out, confirm the styled confirm dialog appears, and confirm confirming it actually signs
out (the concrete `onLogout` wiring to verify) — the sidebar's own separate Sign Out button should
still work identically, unaffected by this change.

## Admin: Restaurant Settings screen (2026-07-27, same day) — task #29

Tenth real Admin screen, and the smallest one so far — ported from `website/src/pages/admin/
AdminRestaurantSettings.jsx` (~994 lines) into `pos-app/src/pages/admin/screens/SettingsScreen.jsx`
(~440 lines), exported as `AdminSettingsScreen`: a 4-tab sidebar form — Restaurant Info (name/
address/phone/logo), Financial (currency symbol, tax rate/enabled, service charge rate/enabled),
Receipt Template (header/footer text + what shows on the customer receipt), and Kitchen Order
Template (what shows on the kitchen order slip) — all over a single `settingsAPI.get()`/`update()`
round-trip, no polling. Built against REST throughout, per the recommendation already on record
from task #21's PowerSync-scoping research: all 3 backing tables (`restaurant_settings`/
`custom_stations`/`menu_items`) are in the local sync scope now, but this is a single infrequent-
read settings page and writes must stay REST regardless, so no local-PowerSync read was attempted.

**Printing — the whole "Printers" tab excluded entirely, not just print-trigger code, per the
standing rule's own callout that a restaurant-settings screen "almost certainly has printer IP/
port settings fields."** Every printer-related piece found and individually accounted for:
1. **Receipt printer cards** — name, IP, port fields per printer, a "not configured" status badge.
2. **Kitchen printer cards** — same name/IP/port fields, plus per-printer kitchen-station
   assignment toggles (which stations route to which printer).
3. **`PrinterSetupGuide`** — the collapsible 5-step "how to connect a network printer" walkthrough,
   a compatible-printer list (Epson TM-T20/TM-T88, Xprinter, Star TSP100, etc.), and a
   troubleshooting box.
4. **`AddFormPanel`** — the shared add-printer draft form (name/IP/port + station picker for
   kitchen printers) used by both the receipt- and kitchen-printer "add" flows.
5. **`PrintersPanel` itself** and its `loadStations()` (a 3-source merge of preset station names +
   stations already used by menu items + custom DB stations, existing only to populate the
   kitchen-printer station picker).
All five removed entirely as dead code (matching how the Orders screen, task #26, deleted its
excluded print flow outright rather than disabling it in place) — including the `printers` entry
in `SECTIONS`, so the tab itself no longer appears in the sidebar at all, not shown greyed out.
This let `menuAPI` drop out of the import list completely — grepped the source and confirmed its
only call sites (`getStations`/`getItems`) were both inside the now-removed `loadStations`. Icons
that only served the removed UI (`Printer`, `Wifi`, `Network`, `MonitorCheck`, `ChevronDown`,
`ChevronUp`, `Plus`, `Trash2`) dropped from the import list too.

**A real data-preservation fix this exclusion required, not present in the website's own code.**
`form.receiptPrinters`/`form.kitchenPrinters` are still loaded from `settingsAPI.get()` into state
and sent back completely UNCHANGED inside `settingsAPI.update(form)` on every save, even though
this port renders no UI for either array anywhere. Without this, saving any unrelated setting here
(e.g. just the currency symbol) would send both arrays back as empty lists and silently wipe out
real printer IP/port configuration entered via the website's own Printers panel — a genuine
correctness risk the website itself never hits, since its own UI always round-trips the user's
current edits to those same fields. Documented explicitly in the file's own header comment as a
deliberate addition made specifically because of the printer-UI removal, not an oversight.

**Receipt/Kitchen "template" toggles were deliberately KEPT — a distinction from the printer
exclusion above, not an inconsistency.** `ReceiptTemplatePanel` (receipt header/footer text plus
show-logo/tax/service-charge/footer/order-number/table-name toggles) and `KitchenTemplatePanel`
(kitchen ticket show-order-type/table-name/order-number/customer-name/qty-unit/item-price/notes/
timestamp toggles) are pure `restaurant_settings` data fields with zero print-execution code
attached anywhere in this file — no `print()` call, no `printAPI`, no printer hookup of any kind —
they just configure content the website/print-agent read elsewhere. The task brief for this screen
explicitly scoped "receipt header/footer text" as in-scope, distinct from "printer settings
(EXCLUDE)" — these two panels are the receipt-content half, not the printer-hardware half, and
were ported unchanged and stay fully functional.

**Logo upload — the known `settingsAPI.uploadLogo` stub, handled with the exact `MenuScreen.jsx`
precedent flagged for this in MEMORY.md ahead of time.** Rather than wire the file picker to a
handler that would always throw ("image upload is not yet supported in the Admin panel" — pos-
app's IPC layer is JSON-only, no multipart/FormData path exists yet), `LogoUpload` now renders a
disabled, dashed-border control (amber `AlertTriangle` icon + label + tooltip) in place of both the
"no logo yet" upload prompt and the "replace logo" action — reusing the existing `admin.menu.
uploadNotSupportedLabel`/`uploadNotSupportedHint` i18n keys verbatim rather than adding a duplicate
settings-scoped pair, since the message content applies unchanged. The existing-logo preview and
its "Remove" button are pure local state (no upload API involved) and stay fully functional, same
as Menu's photo-remove button. Source's `handleFile`/`uploading`/`uploadError` state and the hidden
`<input type="file">` dropped as unreachable dead code behind the disabled control.

**`window.prompt`/`window.confirm`/`window.alert` — grepped clean.** Zero matches for all three
(plus bare `confirm(`/`alert(`/`prompt(`) across the whole source file — nothing needed the
ConfirmDialog/local-modal replacement pattern Inventory/Staff needed. No `navigate` prop needed
either — this screen never calls react-router navigation anywhere in the source (confirmed by
grep, same situation as Menu/Inventory/Loans/Staff).

**No new shared dependencies.** `settingsAPI` (client.js — `get`/`update`/`uploadLogo`) was already
ported and verified for the foundation task (#20); every method this screen actually calls matches
exactly. All 9 lucide icons this screen imports (`Store`, `DollarSign`, `Percent`, `Receipt`,
`Check`, `AlertCircle`, `AlertTriangle`, `X`, `UtensilsCrossed`) confirmed present in the installed
`lucide-react` version by listing its `dist/esm/icons/` folder directly, not assumed. Every real
`t()` key this screen calls (47 keys) diffed key-by-key against both `en.json`/`uz.json` by
script — zero missing in either language. (First diff-script pass over-counted due to a naive regex
matching `set('restaurantName')`-style local closure calls as if they were `t(...)` calls; re-run
with a lookbehind-anchored pattern excluding any `t(` preceded by another identifier character,
which correctly narrowed it to the 47 real translation keys.)

**Files:** `pos-app/src/pages/admin/screens/SettingsScreen.jsx` (new, ~440 lines),
`pos-app/src/pages/admin/AdminPanel.jsx` (`settings: SettingsScreen` uncommented in `SCREENS`).
Both esbuild-verified clean (`--bundle --loader:.jsx=jsx --format=esm`, external react/react-dom/
react-router-dom/lucide-react — the usual harmless tailwindcss/theme.css resolution warnings
ignored, same as every prior Admin screen). **Not yet tested on the real machine** — next check:
open Settings from the sidebar, confirm all 4 tabs load with real data and the sidebar shows no
Printers tab at all; edit restaurant name/address/phone and Save Changes, confirm it persists
after a reload; toggle tax/service charge on and confirm the rate field appears/disappears and
saves correctly; edit receipt header/footer text and toggle each receipt/kitchen display option,
confirm they persist; confirm the logo section shows the disabled "not available yet" control
(amber icon + tooltip) whether or not a logo is already set, and that an existing logo (set via the
website) still previews and its Remove button still works; most important given the data-
preservation fix above — set up a receipt or kitchen printer via the **website's** Settings page
first, open this screen in pos-app, save an unrelated field (e.g. currency symbol), then reload
the website's Settings page and confirm the printer configuration is still intact (the concrete
regression the `receiptPrinters`/`kitchenPrinters` pass-through exists to prevent — verify it
actually works, not just that it compiles).

## Admin: Staff screen (2026-07-27, same day) — task #28

Ninth real Admin screen — ported verbatim from `website/src/pages/admin/AdminStaff.jsx` (~2075
lines) into `pos-app/src/pages/admin/screens/StaffScreen.jsx` (~2155 lines), exported as
`AdminStaffScreen`. Three tabs: **Staff** (staff CRUD — add/edit/suspend/delete, login-credentials
editor, kitchen-station text input + quick-pick presets with custom-station add/delete backed by
the DB), **Attendance** (a live per-day clock-in/out status view — manual clock-in as present/late,
mark-absent, clock-out, plus a manual-shift and edit-shift modal, and a historical shifts table),
and **Payroll** (salary-type-aware computation — hourly/daily/weekly/monthly — with debt carry-over
from each staff member's last recorded payment, a record-payment modal, a collapsible attendance +
payroll summary banner, and a payroll details modal with salary breakdown/payment history/
attendance records per staff member). Same 1s live-timer tick + 10s background refresh as the
source.

**The live staff-status complication, handled exactly per the pre-flagged note (task #21's own
flag, and this task's own brief).** The Attendance tab's per-card "on shift" dot and the Staff
tab's own small status dot both read from `shiftsAPI.getStaffStatus()` → REST `GET /shifts/admin/
staff-status`, which does real server-side "pick today's most relevant shift row per user,
priority-ordered (active > completed > absence)" logic on the backend — not a plain table select.
This was **not** reimplemented client-side and **not** read from local PowerSync, even though
`shifts`/`staff_payments` were added to the `powersync` publication earlier this session (task
#21) — the PowerSync Cloud Sync Streams config for those tables still isn't live regardless (a
separate, still-open blocker — see task #21's own section above), and even once it is, this
specific "today's most relevant shift" priority-pick is real business logic that belongs on the
server, not something to duplicate in client SQL. Called `shiftsAPI.getStaffStatus()` via REST
throughout, exactly like the website does — built against REST from the start, per the explicit
instruction not to "optimize" this into a local-PowerSync read prematurely.

**No new shared dependencies — `ConfirmDialog` was reused, not re-ported.** `usersAPI`/
`shiftsAPI`/`staffPaymentsAPI`/`menuAPI` (client.js), `money` (lib/adminFormat.js), `Dropdown`/
`DatePicker`/`PhoneInput`/`ConfirmDialog` (components/) were all already ported and verified for
earlier screens — every method this screen actually calls on each was checked against the real
`client.js` and matches exactly, including `shiftsAPI.getStaffStatus`/`getAll`/`updateShift`/
`createManualShift`/`clockIn`/`adminClockOut` and `staffPaymentsAPI.getAll`/`getLatest`/`create`/
`delete`. `shiftsAPI.getPayroll` exists in `client.js` but this screen never calls it (grepped,
zero call sites) — it computes payroll client-side from raw shifts + payment history instead, the
same "confirmed unused, not assumed" pattern as Loans' `loansAPI.getStats()`. `permissionsAPI` —
imported by the source (`usersAPI, shiftsAPI, staffPaymentsAPI, permissionsAPI, menuAPI`) but never
called anywhere in the file (grepped, zero call sites — the source's own "── PERMISSIONS MODAL ──"
comment near the delete modal has no actual modal body under it) — dropped from the port entirely,
nothing to port. No `navigate` prop needed — this screen never calls react-router navigation
anywhere in the source (confirmed by grep, same situation as Menu/Inventory/Loans).

**Printing — grepped clean.** Grepped the source for "print"/"Print" — zero matches, nothing to
exclude.

**Real `window.confirm()` bug found and fixed — the second Electron-native-dialog bug found in
this build, same class of issue as Inventory's `window.prompt()` fix (task #25).** Grepped the
whole source for `window.prompt`/`window.confirm`/`window.alert` plus bare `confirm(`/`alert(`/
`prompt(` and found one real hit: a bare `confirm(t('admin.staff.deletePaymentConfirm', {...}))`
guarding the delete-payment button inside the payroll details modal — the source never imports its
own `components/ConfirmDialog.jsx` for this, unlike Menu/Inventory which already use it for their
own confirm/alert-style prompts. Replaced with the same styled `ConfirmDialog` component every
other ported screen already uses (new `dialog`/`setDialog` state, `<ConfirmDialog dialog={dialog}
onClose={...}/>` rendered once near the bottom) — identical functional outcome (Cancel/Delete
choice, same message), just reliable in this runtime instead of a browser-native dialog Electron's
renderer doesn't consistently support.

Four unused lucide icon imports dropped (`Shield`, `LogOut`, `LogIn`, `UserX`) — confirmed by
checking every `<IconName`/`icon:`/`Icon:` JSX usage in the source, none of the four ever renders.
`Users` IS used (as `icon: Users` for the Staff tab's own tab-icon, not `<Users`), so it's kept.
Remaining 33 icons confirmed present in the installed `lucide-react` version by checking its
`dist/esm/icons/` folder directly (`Edit2`→`edit-2.js`, `Trash2`→`trash-2.js`, the same
non-obvious kebab-case mappings already known from earlier screens). Every translation key this
screen calls `t()` with (150 real keys via script diff, plus the two dynamic
`admin.staff.salaryTypes.${type}` template-literal keys checked separately since a literal-string
regex diff can't catch those) diffed key-by-key between website and pos-app `en.json`/`uz.json`:
zero missing in either language, including `admin.staff.salaryTypes.*` and `admin.staff.
kitchenStations.*`.

**Files:** `pos-app/src/pages/admin/screens/StaffScreen.jsx` (new, ~2155 lines),
`pos-app/src/pages/admin/AdminPanel.jsx` (`staff: StaffScreen` uncommented in `SCREENS`). Both
esbuild-verified clean (`--bundle --loader:.jsx=jsx --format=esm`, external
react/react-dom/react-router-dom/lucide-react — the usual harmless tailwindcss/theme.css resolution
warnings ignored, same as every prior Admin screen). **Not yet tested on the real machine** — next
check: open Staff from the sidebar, confirm the staff list loads with real data and role filter
pills/search work; add a new staff member (incl. a Kitchen-role member with a station quick-pick
and a custom station add) and confirm the "credentials created" modal shows the right login info;
edit/suspend/delete a staff member; on the Attendance tab, clock a staff member in as present/late,
mark another absent, then clock the first one out, and confirm the live "on shift" dot and elapsed
timer update correctly (this is the concrete `shiftsAPI.getStaffStatus()` REST round-trip to
verify); edit a historical shift record via the edit-shift modal; on the Payroll tab, switch
between This Month/Last Month/Custom range, record a payment against staff with each salary type
(hourly/daily/weekly/monthly) and confirm the remaining-due number drops correctly; open a staff
member's payroll details modal, confirm the salary breakdown + payment history render, then delete
a payment from that modal and confirm the new `ConfirmDialog` prompt appears (the specific
`window.confirm()` compatibility fix to verify) and the delete goes through when confirmed.

## Admin: Loans screen (2026-07-27, same day) — task #27

Eighth real Admin screen, and the smallest one so far — ported verbatim from `website/src/pages/
admin/AdminLoans.jsx` (~939 lines): a loans list with 4 stat cards (total/active/overdue/
outstanding), search + status-filter pills, a date-range calendar picker (10s silent poll while
open period is whatever the picker last set, defaulting to all-time), a loan details modal (pulls
the linked order's items and computes their subtotal via `ordersAPI.getById`), and a collect-
payment modal (cash/card/QR, no split, no discount — much simpler than Orders' payment modal since
a loan is always a single fixed amount). Exported as `AdminLoansScreen`, matching the
`AdminOrdersScreen`/`AdminMenuScreen` naming convention from earlier screens.

**No new shared dependencies.** `loansAPI`/`ordersAPI` (client.js), `money` (lib/adminFormat.js),
and `useTranslation` (context/LanguageContext.jsx) were all already ported and verified for
Dashboard/Tables/Menu/Inventory/Orders — every method this screen actually calls
(`loansAPI.getAll`/`markPaid`, `ordersAPI.getById`) was checked against the real `client.js` and
matches exactly. This screen doesn't use `Dropdown`/`DatePicker`/`PhoneInput`/`ConfirmDialog` at
all — it has its own inline `CalendarPicker` component (byte-for-byte ported, not swapped for the
shared `DatePicker.jsx`, since the source never used that component either) — and never calls
`navigate` anywhere (confirmed by grep, same situation as Menu/Inventory), so no `navigate` prop is
taken.

**Printing — grepped clean.** Grepped the source for "print"/"Print" — zero matches, nothing to
exclude.

**`window.prompt`/`window.confirm`/`window.alert` — grepped clean.** Zero matches for all three.
This screen never uses any of them, unlike Inventory's two real `window.prompt()` bugs — nothing
needed the local-modal-replacement pattern here.

**Two real findings that correct assumptions from the task brief, both re-verified against the
actual file rather than re-guessed:**
1. **There is no "remind overdue" flow anywhere in `AdminLoans.jsx`.** `client.js`'s `loansAPI.
   notifyOverdue()` (`POST /loans/notify-overdue`) exists and matches a real backend route, but
   grepping the source file for "notify"/"remind"/"Remind" turns up zero call sites — no button,
   no handler, nothing. The task brief expected a remind-overdue flow to exist on this screen; it
   doesn't. Nothing was ported for it since there's nothing in the source to port.
2. **`loansAPI.getStats()`-is-unused, confirmed true.** `client.js` has the method and it matches
   a real backend route, but this screen never calls it — grepped, zero call sites. It computes
   its own `totalLoans`/`activeLoans`/`overdueLoans`/`totalOutstanding` client-side by reducing
   over the raw array from `loansAPI.getAll()` instead. The earlier research note held up exactly
   as expected.

**Files:** `pos-app/src/pages/admin/screens/LoansScreen.jsx` (new, ~840 lines),
`pos-app/src/pages/admin/AdminPanel.jsx` (`loans: LoansScreen` uncommented in `SCREENS`). Both
esbuild-verified clean (`--bundle --loader:.jsx=jsx --format=esm`, external
react/react-dom/react-router-dom/lucide-react — the usual harmless tailwindcss/theme.css
resolution warnings ignored, same as every prior Admin screen); every lucide icon used
(`CreditCard`/`AlertCircle`/`Check`/`Loader2`/`Search`/`X`/`Wallet`/`QrCode`/`Receipt`/`Clock`/
`User`/`TableProperties`/`Calendar`/`ChevronDown`/`Banknote`/`TrendingUp`/`Phone`/`FileText`/
`ShoppingBag`/`CalendarDays`/`Hash`/`Info`) confirmed present in the installed `lucide-react`
version by listing its `dist/esm/icons/` folder directly, not assumed (`Loader2` → `loader-2.js`
was the one non-obvious kebab-case mapping, double-checked). All 50-ish unique translation keys
this screen calls `t()` with (`cashier.loans.*`, `periods.*`, `common.*`, `datePicker.*`,
`paymentMethods.*`, `statuses.paid`, `cashier.orders.confirmPayment`) diffed key-by-key between
website and pos-app `en.json`/`uz.json` by script — zero missing in either language, including the
two array-valued keys (`datePicker.months`/`datePicker.days`). **Not yet tested on the real
machine** — next check: open Loans from the sidebar, confirm the stats/list load with real data and
the 10s poll doesn't flicker; search and filter by status; open the date-range calendar picker and
confirm a custom range actually re-fetches; tap a loan to open its details modal and confirm the
linked order's items and subtotal load correctly (and that a loan with no `orderId` shows "No order
linked" instead of erroring); collect a payment with each method (cash/card/QR) from both the list
row's quick "Mark Paid" button and the details modal's own button, and confirm the loan flips to
paid in both the list and the stats immediately after.

## Admin: Orders screen (2026-07-27, same day) — task #26

Seventh real Admin screen, ported verbatim from `website/src/pages/admin/AdminOrders.jsx` (~2145
lines): active/paid/cancelled order tabs with status badges and elapsed-time cards, order detail
modal (items, payment/loan breakdown incl. split-payment parts, timestamps), status-flow buttons
(pending → sent to kitchen → preparing → ready → served → bill requested), edit-in-modal (table/
waitress/guest count, item steppers incl. the weighed kg/L amount picker, add-items search, notes),
cancellation with a reason picker, delete-with-reason, and the Collect Payment modal (cash/card/QR/
loan methods, cash change, %/fixed discount, 2/3/4-way split with per-part method + loan fields).
Same 30s active-order poll as the source. Exported as `AdminOrdersScreen` (matching the
`AdminMenuScreen`/`AdminOrdersScreen` naming pattern from Menu's port) to avoid any confusion with
the unrelated cashier-side `pos-app/src/pages/pos/OrdersScreen.jsx` — different folder, no actual
filename collision.

**No new shared dependencies.** `ordersAPI`/`menuAPI`/`tablesAPI`/`usersAPI` (client.js),
`useApi`/`money`/`fmtDate` (hooks/useApi.js, re-exporting lib/adminFormat.js), and
`Dropdown`/`DatePicker`/`PhoneInput` (components/) were all already ported and verified for
Dashboard/Tables/Menu/Inventory — every method this screen actually calls on each was checked
against the real `client.js` and matches exactly. `accountingAPI` (source only imports it for
`getRestaurantSettings()`, feeding the now-removed print flow) was dropped — no other call site.

**The `?open=<id>` deep-link gap, left open since Tables' port (task #23), solved.** The website
reads `?open=<id>` off `/admin/orders?open=<id>` (the URL TablesScreen.jsx's "View Full Order"
button already calls, since task #23) via react-router's `useLocation().search`, fetches that order,
opens the detail modal, then strips the param with `navigate(pathname, {replace:true})`. pos-app has
no URL/query-string routing at all. Solved by extending `AdminShell.jsx`'s existing `goTo(path)`
adapter (which already had to split on `?` to strip the query string for nav-key matching) to also
parse an `open=<id>` value out of that query string into new `openOrderId` state, passed down to
whichever screen is currently active as a plain prop pair: `openOrderId` and `clearOpenOrderId`
(alongside the existing `navigate` prop, which every screen already receives whether it uses it or
not). `OrdersScreen.jsx` consumes `openOrderId` in a `useEffect` — fetches the order via
`ordersAPI.getById`, opens the detail modal if found, then calls `clearOpenOrderId()` in a `finally`
so a later re-render or a trip to another screen and back doesn't reopen the same order again. Same
functional outcome as the website's URL-based version, just prop-based — every other screen ignores
the extra props harmlessly. `AdminShell.jsx`'s own header comment and `goTo`'s inline comment both
document the reasoning; `TablesScreen.jsx` itself needed no changes — its "View Full Order" button
already called the right URL shape since task #23.

**"+ New Order" button — one real, deliberate functional deviation.** The source's header button
calls `navigate('/admin/new-order')`, the website's standalone `AdminNewOrder.jsx` page (a full
route, distinct from the `isModal` branch `NewOrderModal.jsx` already ports). That standalone branch
was explicitly never ported (see `NewOrderModal.jsx`'s own header comment from task #23) — Tables is
the only caller anywhere in this build and always passes `isModal`. Porting the full standalone page
was out of scope for this task, so `/admin/new-order` doesn't exist as a pos-app screen; pointing the
button at it would have silently landed on the "coming in a later build step" placeholder instead of
doing anything useful. Redirected it to `navigate('/admin/tables')` instead — the actual place a new
order gets created in this port (tap a free table → New Order modal, from task #23). Flagged clearly
in the file's own header comment rather than left silent, since this is a genuine behavior change,
not a pure visual one.

**Printing — excluded per the standing rule, and this screen actually had real print code to strip**
(unlike Tables/Menu/Inventory, which had none or only dead-behind-`isCashier` code). Grepped the
source for "print"/"Print" first and found: the `usePrinter()` hook import/call (`printReceipt`),
the `restSettings` state + its `accountingAPI.getRestaurantSettings()` effect (only existed to feed
the receipt header/footer text into the print), the `fmtOrderNum()` helper (only existed to format
the printed order number), `handlePrintCheque()` (built the full receipt HTML string and called
`printReceipt`), the `Printer` icon import, and the "Print Receipt" button itself in the Collect
Payment modal's action footer (between Confirm Payment and Cancel). All removed entirely as dead
code once printing was excluded — none of it had any other call site, confirmed by grep before
deleting each piece. The Payment modal's action footer now shows just Confirm Payment + Cancel.

**`window.prompt`/`window.confirm`/`window.alert` — checked per the standing Inventory-screen
lesson, found clean.** Grepped the whole source file for all three — zero matches. Unlike Inventory
(which had two real, silently-broken `window.prompt()` calls), this screen never uses any of them;
nothing needed the local-modal-replacement pattern here.

**Files:** `pos-app/src/pages/admin/screens/OrdersScreen.jsx` (new, ~2005 lines),
`pos-app/src/pages/admin/AdminShell.jsx` (`goTo` extended to parse+store `openOrderId`, new prop
pair passed to the active screen, header comment updated), `pos-app/src/pages/admin/AdminPanel.jsx`
(`orders: OrdersScreen` uncommented in `SCREENS`). All three esbuild-verified clean; every lucide
icon actually rendered (`ClipboardList`/`Check`/`X`/`AlertTriangle`/`Trash2`/`RefreshCw`/`Calendar`/
`DollarSign`/`Grid3X3`/`User`/`CreditCard`/`Ban`/`Edit3`/`Plus`/`Minus`/`FileText` — confirmed by
checking every `<IconName` JSX usage plus the payment-method grid's dynamic `<Icon/>` reference,
`Icon: Grid3X3`) confirmed present in the installed `lucide-react` version by listing its
`dist/esm/icons/` folder directly; five icons the source imports but never actually renders
(`Clock`/`Filter`/`ChevronDown`/`Eye`/`Receipt`) dropped as dead imports rather than carried forward.
Every `admin.orders.*`/`admin.newOrder.*`/`cashier.orders.*`/`common.*`/`paymentMethods.*`/
`periods.*`/`placeholders.*`/`roles.*`/`statuses.*`/`owner.sales.*` translation key this screen needs
(113 unique keys total) diffed key-by-key between website and pos-app `en.json`/`uz.json` by script —
zero missing in either language, including the two array-valued keys (`deleteReasons`/
`cancelReasons`), confirmed pos-app's `LanguageContext.jsx`'s `t()` returns non-string values as-is
so `.map()` on them works unchanged. **Not yet tested on the real machine** — next check: open Orders
from the sidebar, confirm active/paid/cancelled tabs load with real data and the 30s poll doesn't
flicker; walk an order through the full status flow; edit an order (incl. a weighed item) and confirm
Save Changes persists; cancel an order with a reason; collect a payment with each method incl. a
2/3-way split with a loan part, and confirm the modal has no visible gap where the Print Receipt
button used to be; from Tables, tap an occupied table → "View Full Order" and confirm it now actually
lands on that specific order's detail modal (was previously just the Orders tab, since this screen
didn't exist to consume the deep link); from Orders' own header, tap "+ New Order" and confirm it
lands on Tables (not a blank placeholder).

## Admin: Inventory screen (2026-07-27, same day) — task #25

Sixth real Admin screen, and the largest one so far — ported verbatim from `website/src/pages/
admin/AdminInventory.jsx` (~2170 lines): warehouse items (stock table with expandable batches,
low/critical/out-of-stock status), deliveries-in (pending vs. completed, period presets, unpaid-
debt banner), stock output (OUT/WASTE/ADJUST grouped by item, netted against any order-edit
refunds via the existing `isOrderRefund`/`autoOrderReasonBadge` logic), and suppliers (cards,
per-supplier detail, outstanding-debt summary with bulk-pay). Same 15s silent poll and 4 tabs as
the source. No `navigate` prop needed — like Menu, this screen never calls react-router navigation
anywhere (confirmed by grep).

**Two new shared dependencies:** `website/src/components/Dropdown.jsx` (custom `<select>`
replacement) ported to `pos-app/src/components/Dropdown.jsx` completely unchanged — no context/
translation dependency at all. `website/src/components/DatePicker.jsx` (calendar popover via
`createPortal`) ported to `pos-app/src/components/DatePicker.jsx`, only its `useTranslation` import
path adjusted, same as `ConfirmDialog.jsx` before it. `warehouseAPI`/`suppliersAPI`/
`procurementAPI`/`ConfirmDialog`/`PhoneInput` were already ported and verified for Dashboard/
Tables/Menu, reused unchanged.

**Printing:** grepped `AdminInventory.jsx` for "print"/"Print" — zero matches, nothing to exclude.

**Real runtime-compatibility fix, not a design change — the `window.prompt()` gap.** The source
calls `window.prompt()` twice, both inside the pending-delivery detail modal (adjust a line's
quantity; ask for a removal reason). Electron's renderer does not implement `window.prompt()` at
all — unlike `alert`/`confirm`, which Chromium does support (this codebase already replaces those
with the styled `ConfirmDialog` purely for visual consistency, not because they're broken). Calling
the real `window.prompt()` here would have silently no-op'd or thrown, quietly breaking both
actions. Replaced with a small local modal (`promptModal`/`promptValue` state in
`InventoryScreen.jsx`) that asks for the same single value and calls the same handlers afterward —
identical functional outcome. Kept local to this file, not a new shared component, since nothing
else has needed it yet (see MEMORY.md).

**`inventoryAPI`-is-dead-code / `purchase_orders`-are-unused facts, re-verified against the real
file:** confirmed by grep — this screen calls `warehouseAPI`/`suppliersAPI`/`procurementAPI`
exclusively, never `inventoryAPI`; never calls `suppliersAPI.getPurchaseOrders/
createPurchaseOrder/receivePurchaseOrder` or `warehouseAPI.audit` either, despite those existing
in `client.js` with matching signatures. Both held up exactly as expected.

**Files:** `pos-app/src/pages/admin/screens/InventoryScreen.jsx` (new, ~2050 lines),
`pos-app/src/components/Dropdown.jsx` (new), `pos-app/src/components/DatePicker.jsx` (new),
`pos-app/src/pages/admin/AdminPanel.jsx` (`inventory: InventoryScreen` uncommented in `SCREENS`).
All four esbuild-verified clean; every lucide icon used (incl. `Edit2`/`Trash2`/`Check`/
`ChevronLeft`) confirmed present in the installed `lucide-react` version by listing its
`dist/esm/icons/` folder directly; every `admin.inventory.*`/`owner.inventory.*`/`placeholders.*`/
`periods.*`/`common.*` translation key this screen needs diffed key-by-key between website and
pos-app `en.json`/`uz.json` by script — zero missing in either language. **Not yet tested on the
real machine** — next check: open Inventory from the sidebar, confirm all 4 tabs load with real
data; add/edit/delete a warehouse item; receive goods and record output against a real item and
confirm the stock number and Output tab's grouped total update correctly; record a delivery, mark
it Delivered, confirm stock lands in the warehouse; on an in-transit delivery, use "Adjust Qty" and
"Remove" on a line and confirm the new prompt-replacement modal actually appears and works (the
specific compatibility fix to verify — a real `window.prompt()` would silently do nothing here);
add/edit a supplier and confirm the debt summary and bulk-pay flow work against real unpaid
deliveries.

## Admin: Menu screen (2026-07-27, same day) — task #24

Fifth real Admin screen, ported verbatim from `website/src/pages/admin/AdminMenu.jsx` (~1229
lines) — category sidebar (add/rename/delete + up/down reorder with full-list `sortOrder`
normalization so the DB never ends up with duplicate `sort_order=0` rows), item grid (search,
availability toggle, edit/delete), and the add/edit item modal (name/price/unit/description/
category/availability, Food-vs-Sale item type, kitchen station text input + quick-pick presets
with custom-station add/remove backed by the DB, item photo, and ingredient-linking to warehouse
items via a search-then-quantity flow). Same 5s silent poll (categories+items) as the source. No
`navigate` prop needed — unlike Dashboard/Tables, AdminMenu.jsx never calls react-router
navigation anywhere (confirmed by grep).

**New shared dependency:** `website/src/components/ConfirmDialog.jsx` (styled confirm/alert
replacement, used here for the station-delete confirm + upload-issue notices) — ported verbatim
to `pos-app/src/components/ConfirmDialog.jsx`, only its `useTranslation` import path adjusted.
`menuAPI`/`warehouseAPI` in `client.js` were checked against every method AdminMenu.jsx actually
calls — all already present with matching signatures.

**Printing:** grepped AdminMenu.jsx for "print"/"Print" — zero matches, nothing to exclude.

**Image upload — the known `menuAPI.uploadImage` stub gap, handled deliberately.** The stub
throws `'... image upload is not yet supported ...'` (pos-app's IPC client is JSON-only, the
website's picker needs multipart/FormData — real support is out of scope for this port). Instead
of wiring a control that would throw on first use, the item-photo upload control now renders
disabled with an amber warning icon + "Photo upload not available yet" + a tooltip pointing at the
website Admin panel as the working alternative (new i18n keys under `admin.menu.
uploadNotSupportedLabel`/`uploadNotSupportedHint`, both `en.json`/`uz.json`). The source's
`handleImageFileChange`/`imageUploading` were dropped as unreachable dead code. The existing-photo
preview and its "×" remove button (pure local-state, no upload API involved) still work fully.

**Files:** `pos-app/src/pages/admin/screens/MenuScreen.jsx` (new, exported as `AdminMenuScreen` to
avoid any confusion with the unrelated `pos-app/src/pages/pos/MenuScreen.jsx` cashier screen — no
actual filename collision, different folders/SCREENS maps, just a naming-clarity choice),
`pos-app/src/components/ConfirmDialog.jsx` (new), `pos-app/src/i18n/en.json`+`uz.json` (2 new
keys), `pos-app/src/pages/admin/AdminPanel.jsx` (`menu: MenuScreen` uncommented in `SCREENS`). All
esbuild-verified clean (every lucide icon used, including `Edit2`/`Trash2`, confirmed present in
the installed `lucide-react` version, not assumed); JSON files re-verified with `JSON.parse`.
**Not yet tested on the real machine** — next check: categories/items load and poll without
flicker; category reorder persists across a refresh; add/edit an item incl. kitchen-station
quick-pick and ingredient linking to a real warehouse item; confirm the photo control shows the
disabled "not available yet" state cleanly, and that an item with an existing photo (added via the
website) still previews/clears correctly.

## Admin: Tables + New Order screens (2026-07-27, same day) — task #23

Second real Admin screen, ported verbatim from `website/src/pages/admin/AdminTables.jsx` (~1912
lines) plus its modal-only companion `website/src/pages/admin/AdminNewOrder.jsx` (~1319 lines,
invoked by AdminTables as `<AdminNewOrder isModal .../>` whenever a table's "New Order"/"Seat
Guests" button is tapped, or a table is marked occupied via the status picker). Floor plan grid,
status summary cards, floor summary bar, section filter pills, table detail sheet (context-aware
actions per status), add/edit table modal, reserve-table modal, status-picker sheet, manage-
sections modal (add/rename/delete with optimistic-update shielding against poll races), the live
order view + "Add Food" flow for occupied tables, and cancel-reservation confirm — all unchanged
from the website, including the 5s table poll, 8s section poll, and 1s order-view poll.

**Adaptations, same pattern as Dashboard (task #22):** `useNavigate()` → `navigate` prop (used in
exactly one place — the occupied-table sheet's "View Full Order" button, which calls
`navigate('/admin/orders?open=<id>')`). This surfaced a real gap in `AdminShell.jsx`'s `goTo`
adapter: it only stripped the leading `/admin/` segment, not a trailing `?...` query string, so
`orders?open=<id>` would never have matched the `orders` SCREENS key at all. Fixed `goTo` to also
`.split('?')[0]` — the `?open=<id>` value itself isn't consumed by anything yet since pos-app's
Orders screen doesn't exist (task #26); once built it'll need its own prop-based way to accept
"open this order on load," not a URL param.

**AdminNewOrder.jsx ported as `NewOrderModal.jsx`, modal-mode only** (see that file's own header
comment for the full reasoning): AdminTables.jsx is the only caller anywhere in this port and
always renders it with `isModal` — the source file's OTHER branch (a full standalone page at the
website's `/admin/new-order` route) is unreachable from here and wasn't ported. Two real findings
while porting it, both called out prominently in the file's own header comment:

1. **`existingOrderId`/`existingOrder`** used to come from react-router's `useLocation().state`
   (set only by the *cashier* role's CashierTables.jsx/CashierOrders.jsx navigating with route
   state to add items to an already-open order — confirmed by grep, AdminTables.jsx never sets
   this state). pos-app has no route-state mechanism at all, so these became plain optional props
   (default `null`) instead — behavior for what AdminTables actually does is unchanged (always
   "place a new order"), and the add-to-existing-order logic itself is preserved unchanged in case
   a future screen wants to pass these props directly.
2. **Real pre-existing bug found and fixed, not preserved:** the source file's amount-picker modal
   JSX (the "type an amount" popup for weighed kg/l/g/ml items) is only rendered inside the
   STANDALONE branch's return — never inside the `isModal` branch's return, confirmed by grepping
   every `amountPicker` reference in the source (the `{amountPicker && (...)}` block appears
   exactly once, after the standalone branch's own `<TablePickerModal/>`). Since AdminTables only
   ever uses the modal branch, tapping a weighed item in the Tables screen's "New Order" modal on
   the **live website today** sets `amountPicker` state but nothing renders it — the picker
   silently never appears and a weighed item (e.g. "Jiz" rice, sold by the kg) can never actually
   be added that way. Fixed in the port by rendering that same JSX (content byte-for-byte
   unchanged) as a sibling of the modal overlay, so it now works the same way weighed items already
   work everywhere else in this codebase (Menu/Orders/Tables' cashier screens). Flagging this to
   the user directly: **the website itself likely has this same bug live right now** — worth a
   quick manual confirm and, if real, the identical one-block fix ported back to
   `website/src/pages/admin/AdminNewOrder.jsx`.

**Printing — excluded per standing rule, confirmed and stubbed:** AdminTables.jsx itself has zero
print-related code (grepped, no matches). AdminNewOrder.jsx had `usePrinter()` (a hook that doesn't
exist in pos-app), a `handlePrintItem()` function, and a per-cart-item Printer icon button — all
gated behind `isCashier` (only true for `/cashier`-prefixed routes). Since this port only ever
renders inside the Admin panel, `isCashier` is hardcoded `false` in `NewOrderModal.jsx`, meaning
those buttons could never have rendered here anyway even on the website — removed the hook import,
handler, and button entirely rather than carrying dead print code forward, documented in the file's
header comment as adaptation #3.

**Files:** `pos-app/src/pages/admin/screens/TablesScreen.jsx` (new),
`pos-app/src/pages/admin/screens/NewOrderModal.jsx` (new), `pos-app/src/pages/admin/AdminShell.jsx`
(`goTo` query-string fix), `pos-app/src/pages/admin/AdminPanel.jsx` (`tables` uncommented in
`SCREENS`). No new shared deps needed — `tablesAPI`/`ordersAPI`/`menuAPI`/`useApi`/
`useTranslation`/`invalidate`/`withCache`/`PhoneInput` were all already ported and verified for
Dashboard or foundation work. All 4 files esbuild-verified clean. **Not yet tested on the real
machine** — next check: open Tables from the sidebar, confirm the floor plan/status cards/section
filters render with real data, tap a free table → New Order → add a weighed item (e.g. "Jiz") and
confirm the amount picker now actually appears and the item gets added, tap an occupied table →
View Full Order and confirm it lands on the Orders nav item (Orders screen itself is still a
placeholder — task #26 — so it won't show the specific order yet, that's expected).

## Fixed: Admin buttons had an unwanted bold native border (2026-07-27, same day)

User's screenshot of the live Dashboard showed the Quick Action pills with a bold border/box
around them that isn't in the website's design — root cause: skipping Tailwind Preflight in
`admin.css` (deliberate, see that file's own comment — protects the cashier's inline-style
screens from a global reset) also means native browser `<button>`/`<input>`/`<select>`/
`<textarea>` chrome (border, background, font) never gets zeroed out, so it shows through under
Tailwind's utility classes. Every ported website admin page assumes Preflight already happened.
Fixed with a small scoped reset in `admin.css`, written with `:where(.admin-panel) button, ...`
specifically so it carries the same near-zero specificity as Tailwind's own Preflight (`:where()`
adds none) — utility classes still win regardless of source order, and it has zero effect outside
the Admin panel's own subtree. `AdminShell.jsx`'s root div now carries the `admin-panel` class
this scope hooks onto. Both files esbuild/CSS-syntax verified. This same fix now protects every
future ported screen (Tables, Menu, Inventory, etc. all have native form buttons/inputs) from the
identical bug — **fixed once, not screen-by-screen.**

## Admin: Dashboard screen (2026-07-27, same day) — task #22

First real Admin screen, ported verbatim from `website/src/pages/admin/AdminDashboard.jsx` — all
15 parallel data fetches (`Promise.allSettled` across reports/orders/warehouse/shifts/tables/
loans/notifications/staff-payments/accounting/procurement), every computed KPI/financial-flow/
debts-payables number, the 15s auto-refresh, and the notifications bell all unchanged. Two
adaptations, neither a design/behavior change: `useNavigate()` (react-router) swapped for a
`navigate` prop — `AdminShell.jsx` now passes down a `goTo(path)` adapter that maps the same
`/admin/orders`-style path strings this screen already calls onto pos-app's internal nav-key
state (no `<Outlet/>` here, same reasoning as `AdminShell.jsx`'s existing header comment); `money`
formatter pulled into a new shared `src/lib/adminFormat.js` (verbatim from the website's
`useApi.js`) since every remaining Admin screen will need it too, not just Dashboard. File:
`src/pages/admin/screens/DashboardScreen.jsx`, wired into `AdminPanel.jsx`'s `SCREENS` map.

All 4 touched/new files esbuild-verified clean. **Not yet tested on the real machine** — next
check: confirm the Dashboard renders with real numbers (not stuck loading), the 6 KPI cards and
table-status grid populate, and the 6 Quick Action buttons actually jump to their target screens
(most of which are still placeholders until later tasks — that's expected, not a bug).

## PowerSync extension for Inventory/Loans/Staff (2026-07-27, same day) — task #21

Scoped via a research subagent reading the website's actual admin screens + API client + backend
routes (not guessed) which of Inventory/Finance/Loans/Staff needs new synced tables. Real
findings that changed the plan: **there is no admin "Finance" screen** — `financeAPI`
(`finance_expenses`/`finance_loans`/etc.) is Owner-only, out of this project's current Admin
scope, so Finance sync was dropped from this task. `inventoryAPI` (backend `inventory.js`) is
dead code — `AdminInventory.jsx` uses `warehouseAPI` exclusively. `purchase_orders`/
`purchase_order_items`/`inventory_audits`/`inventory_audit_items` have zero rows in production
and zero frontend call sites — confirmed unbuilt/orphaned, excluded from sync scope.
`AdminRestaurantSettings.jsx`'s 3 backing tables (`restaurant_settings`, `custom_stations`,
`menu_items`) are already fully synced — no new sync needed there, and no real win from moving it
off REST (single infrequent read, writes stay REST-only regardless), so it stays as-is.

**Done (this sandbox, via Supabase MCP):**
- `ALTER PUBLICATION powersync ADD TABLE` for the 9 tables Inventory/Loans/Staff actually need:
  `warehouse_items`, `suppliers`, `stock_batches`, `stock_movements`, `supplier_deliveries`,
  `delivery_items`, `loans`, `shifts`, `staff_payments`. Confirmed via `pg_publication_tables`.
  Purely additive — no existing table's replication touched.
- `pos-app/powersync/schema.js` — added local `Table` defs for all 9 (column lists mirror what
  each Admin screen actually reads, per the subagent's cross-reference against
  `warehouse.js`/`suppliers.js`/`procurement.js`/`loans.js`/`shifts.js`/`staff-payments.js`).
  Verified via `node --check`.

**NOT done — needs the user, no API access to this from the sandbox:** the actual PowerSync
Cloud Sync Streams config (the query that streams each table's rows down, scoped to
`restaurant_id`) has to be added manually in the "the-bill-pos" project's dashboard, same
limitation as every prior PowerSync Cloud change this project has hit. Add one stream per table
below, in the same syntax/pattern your existing streams already use (they're all `restaurant_id
= token_parameters.restaurant_id`-scoped), with these exact columns:

- `warehouse_items`: id, restaurant_id, name, category, sku_code, unit, purchase_unit,
  quantity_in_stock, min_stock_level, low_stock_alert, cost_per_unit, supplier_id, created_at,
  updated_at
- `suppliers`: id, restaurant_id, name, phone, email, address, contact_name, payment_terms,
  category, created_at
- `stock_batches`: id, restaurant_id, item_id, quantity_remaining, cost_price, expiry_date,
  received_at
- `stock_movements`: id, restaurant_id, item_id, type, quantity, user_id, reason, notes,
  cost_per_unit, created_at
- `supplier_deliveries`: id, restaurant_id, supplier_name, supplier_id, total, status,
  payment_status, notes, timestamp, paid_at, payment_method, payment_note, payment_due_date,
  created_at, updated_at
- `delivery_items`: id, delivery_id, item_name, qty, unit, unit_price, expiry_date, removed,
  remove_reason, created_at (scope via a join to `supplier_deliveries.restaurant_id` — this
  table has no `restaurant_id` column of its own)
- `loans`: id, restaurant_id, order_id, customer_name, customer_phone, due_date, amount, status,
  paid_at, payment_method, notes, created_at, updated_at
- `shifts`: id, restaurant_id, user_id, clock_in, clock_out, hourly_rate, scheduled_start_time,
  status, note, shift_date, created_at
- `staff_payments`: id, restaurant_id, user_id, amount, payment_method, payment_date, note,
  recorded_by, created_at, updated_at

Until that dashboard step is done, these 9 tables exist locally but stay empty — no functional
risk (nothing reads them yet, since tasks #25/#27/#28 haven't built the actual screens), but it's
the blocking dependency for those three screens reading from local PowerSync instead of REST.
Also flagged: `AdminStaff.jsx`'s live "staff status" view (`GET /shifts/admin/staff-status`) has
real server-side priority-pick logic (today's most relevant shift row per user) beyond a plain
table sync — needs porting to client SQL/JS when task #28 is built, not just a raw table sync;
full detail on this and everything above is in SESSIONS.md.

## Admin panel foundation (2026-07-27, same day) — task #20

Started the Admin panel per explicit standing rules: **no design changes, no functional changes
from the existing website's admin pages** — the only allowed improvement is speed — and
**printing/print-related functionality is excluded from every screen** until the user says
otherwise. Build order confirmed as the sidebar's own order (Dashboard → Tables → Menu →
Inventory → Orders → Loans → Staff → Settings → Profile).

Built the shared foundation, no screens yet:
- `main.js`/`preload.js` — new generic write IPC (`api:post/put/patch/delete`, one factory
  function mirroring the existing `api:get` handler) for Admin's ~20 API domains — separate from
  and does not touch the cashier's dedicated-handler/`submitOrderWrite()` write pattern.
- `src/i18n/en.json`/`uz.json`, `src/context/LanguageContext.jsx` — copied verbatim from the
  website (its own dot-path `t()` system, distinct from the cashier's `lib/i18n.js`).
- `src/api/client.js` (new) — website's `client.js` ported verbatim (camelize/snakeize + ~19 API
  groups), IPC-routed instead of axios. `printAPI` excluded; upload endpoints stubbed (not built
  yet, need their own IPC design).
- `src/pages/admin/AdminShell.jsx` + `AdminPanel.jsx` (new) — sidebar/topbar shell matching
  `website/src/components/Layout.jsx` exactly, `PosCashier.jsx`-style entry wrapper. Deliberately
  skips `useKitchenPrint`/printer prefetch (print-only).
- `src/admin.css` (new) + `vite.config.js` — Tailwind v4 utilities-only import (no Preflight, to
  avoid any risk to the cashier's inline-style screens), scoped to just this one file.
- `package.json` — added `tailwindcss`/`@tailwindcss/vite` `^4.2.2` to devDependencies —
  **needs `npm install` on the real machine, not run from this sandbox.**
- `App.jsx` — `/admin` now renders the real `AdminPanel`, lazy-loaded (`React.lazy`/`Suspense`)
  so other roles never load Admin's JS/CSS at all.

All new/changed files verified (`node --check` for the two CommonJS files, Linux `esbuild` for
the rest, `JSON.parse` for the two dictionaries). **Confirmed working on the real machine
(2026-07-27)** — sidebar, blue header, all 9 nav items with correct UZ labels/icons, UZ/EN
switcher, collapse, logout all render correctly; each nav item shows its placeholder cleanly.
Every nav item still shows a placeholder — no real screen built yet. Full detail in SESSIONS.md.

## "Change Table" button redesign (2026-07-27, same day)

Title bar confirmed working after the restart. Small follow-up: the plain text link
"Change on floor plan" in Orders'/Tables' edit-mode table row (identical code in both, ported
verbatim originally) redesigned into a real button — green-tinted pill, `ArrowLeftRight` icon,
hover state, renamed to "Change Table" per direct request. Same change applied identically to
both `OrdersScreen.jsx` and `TablesScreen.jsx` to keep them in sync (as they've been kept
throughout this rebuild). `i18n.js`'s `'Change on floor plan'` dictionary key replaced with
`'Change Table'` (Uzbek: "Stolni o'zgartirish") — grepped first to confirm no other call site
still referenced the old key. All three files esbuild-verified clean. **Not yet tested on the
real machine.**

## Title bar follow-up: redesign + a likely dev-mode gotcha explained (2026-07-27, same day)

User reported the new title bar's buttons were visible but did nothing when clicked, and asked
if that's because they're still on dev mode — plus asked for a redesign: white instead of the
dark bar, and drop the "The Bill" label since the app name is already shown in the sidebar.

**Redesign, done:** `TitleBar.jsx` background changed from dark navy to white with a subtle
1px bottom border (`#EEF1F1`, matches the rest of the app's hairline borders) to separate it
from the page below without a hard color break; the "The Bill" label removed entirely (comment
left explaining why — every page under it already shows its own branding). Icon color changed
from light-gray-on-dark to muted-gray-on-white (`#7C8792`), hover states now light gray for
minimize/maximize and coral for close, matching the coral used for destructive actions
elsewhere in this codebase (Discard buttons, etc.).

**Buttons not responding — likely cause, not yet confirmed on the real machine:** `window:
minimize/maximize/close` live in `main.js`, and `windowMinimize`/etc. are exposed via
`preload.js` — unlike renderer-side React/Vite changes, which hot-reload live, **main-process
and preload script changes require a full Electron restart to take effect**, not just Vite's
HMR reloading the page. If the app was only kept running with Vite hot-reloading the UI while
`main.js`/`preload.js` changed underneath it, `window.electronAPI.windowMinimize` etc. would
still be `undefined` in the running process — and since every call site uses optional chaining
(`window.electronAPI?.windowMinimize?.()`), a missing method fails completely silently instead
of throwing, which matches "I see them but once I touch they do not work" exactly. Also added a
defensive `-webkit-app-region: no-drag` directly on each button element (not just its wrapper) —
harmless either way, but a known category of Chromium bug is a click being swallowed as "start
dragging the window" instead of reaching the element, and this is the standard extra-safety fix
for it. **Told the user to fully quit and restart the Electron app (not just reload the window)
and test again** — if buttons still don't respond after a real restart, that would point at the
Chromium drag-region bug instead and need a different fix.

`TitleBar.jsx` re-verified via Linux `esbuild` after the redesign. **Not yet confirmed working on
the real machine.**

## Custom title bar — window controls + move/resize (2026-07-27, same day)

User asked whether minimize/maximize/close buttons were needed, since the window has none —
confirmed why: `main.js`'s `createWindow()` uses `frame: false` ("kiosk-friendly: no native
menu/frame chrome"), which removes ALL native title-bar chrome, including the draggable region.
Asked the user which direction they wanted (kiosk-locked with no controls at all, minimal
minimize+close only, or full controls with a resizable window) — chose **full controls,
resizable**. Mid-answer the user also reported the window "does not move at all," which is the
same root cause: no draggable region exists anywhere without a title bar.

Built a custom title bar rather than turning the native frame back on (which would reintroduce
OS-styled chrome clashing with the app's own design):
- `main.js`: `resizable: true` made explicit; new `window:minimize`/`window:maximize` (toggles
  maximize/unmaximize)/`window:close`/`window:isMaximized` IPC handlers; `maximize`/`unmaximize`
  window events forwarded to the renderer (`window:maximized-changed`) so the custom button's
  icon stays in sync even when the window is maximized via a non-button gesture (double-click
  the bar, Windows snap, etc.) — the bar's own `onDoubleClick` also calls `windowMaximize()`,
  matching standard title-bar behavior.
- `preload.js`: exposes all four plus `onWindowMaximizedChange` (subscribe/unsubscribe pair).
- New `src/TitleBar.jsx` — slim 32px dark bar (`#1E2433`, independent of any page's own theme
  since it's global — sits above Login's purple gradient AND the mint POS pages equally),
  `-webkit-app-region: drag` on the bar itself and `no-drag` on the button group so the buttons
  stay clickable. Renders nothing if `window.electronAPI` doesn't exist (e.g. plain `vite dev` in
  a browser tab during UI iteration — a real browser already has its own chrome there).
- `App.jsx`: now wraps the whole route tree in a flex column — `TitleBar` (fixed 32px) on top,
  routes in a `flex: 1, minHeight: 0, overflow: hidden` box below — rendered unconditionally
  (even during the initial session-loading state) so the window is always movable/closable, not
  just once logged in.
- Every page that used to claim `height: '100vh'` for itself (`Login.jsx`, `RolePlaceholder.jsx`,
  `PosShell.jsx`) changed to `height: '100%'` — with the title bar now taking 32px at the real
  top level, a fresh `100vh` on each page would have measured the FULL viewport again and
  overflowed the window by exactly the title bar's height. `Cashier.jsx` (old, unrouted — see
  RULES/MEMORY) intentionally left untouched.

All 6 touched files verified: `main.js`/`preload.js` via `node --check`, the four `.jsx` files
via a standalone Linux `esbuild` (icons used — `Minus`/`Square`/`Copy`/`X` — confirmed present in
the installed `lucide-react` version by listing its `dist/esm/icons/` folder, not assumed).
**Not yet tested on the real machine** — next check: confirm the window can actually be dragged
by the new bar, minimize/maximize/close all work, double-clicking the bar toggles maximize, and
none of the four pages (Login, the 3 RolePlaceholders, PosShell) show a cut-off bottom edge or an
unwanted scrollbar now that they fill `100%` of the space below the bar instead of a fresh
`100vh`.

## Root-caused and fixed: "loading a lot" on History/Receivables/Profile + a real topbar bug (2026-07-27, same day)

User reported History, Receivables, and Profile's Shift Info were "loading a lot," then — mid-
investigation — sent a live screenshot showing History's own stale-data badge saying "Offline —
showing data from 3m ago" while the topbar badge said "Online" at the same moment. That
screenshot was the real diagnostic: it proved two different, disconnected signals.

**Root cause, confirmed by reading the code (not guessed):**
1. `main.js`'s `request()` (the function every `apiGet` call goes through — used by History,
   Receivables, and Profile's Shift Info/stats, none of which are PowerSync-backed) had **no
   timeout at all**. If the Render backend was slow or unresponsive, the request could hang
   indefinitely with zero feedback beyond a perpetual spinner — this is the literal mechanism
   behind "loading a lot."
2. The topbar's sync badge (`PosShell.jsx`) only ever checked `psStatus()` — PowerSync's own sync
   stream, used by Menu/Orders/Tables. It never checked whether the Express/Render backend itself
   (what History/Receivables/Profile actually depend on) was reachable. So the badge could
   legitimately say "Online" while the backend those three screens hit was down or slow — exactly
   what the screenshot showed. Two genuinely separate services, one badge, and it was only ever
   measuring one of them.

(Tried to independently verify current backend reachability via a sandbox `curl` to `/health` —
inconclusive: every attempt died at the same ~15s mark with an SSL EOF, which looks like this
sandbox's own network egress cutting the connection rather than real evidence about Render's
state. Not used as a basis for any conclusion — the user's own screenshot was the real evidence.)

**Fixes:**
- `main.js`: `request()` now takes a `timeoutMs` (default 15s) and destroys the socket on timeout
  instead of hanging forever — every `apiGet` call now fails within a bounded time instead of
  potentially never resolving.
- `main.js` + `preload.js`: new `backend:health` IPC — a bare `GET /health` (already existed,
  unauthenticated, in `server.js`) with a short 6s timeout, exposed as
  `window.electronAPI.backendHealth()`.
- `PosShell.jsx`: `checkSync()` now calls `psStatus()` AND `backendHealth()` in parallel; the
  topbar badge only says "Online" when PowerSync is connected+synced **and** the backend
  responds — "Offline" if either is down. Fixes the exact contradiction from the screenshot.
- `ProfileScreen.jsx`: `loadShift()` used to collapse every failure (including a timeout) into
  `setShift(null)`, which silently rendered as "Not clocked in yet today." — indistinguishable
  from a real off-shift state. Split this into a separate `shiftError` flag: if the shift has
  never loaded successfully and the latest attempt failed, shows an honest "Can't reach server —
  shift status unknown" message with a Retry button instead of guessing; if a previously-loaded
  real shift state exists and a later background refresh fails, keeps showing that last-known
  state with a small "Couldn't refresh — showing last known status" note, rather than discarding
  a known-good state over a transient blip.

All five touched files (`main.js`, `preload.js`, `PosShell.jsx`, `ProfileScreen.jsx`, `i18n.js`)
verified — `main.js`/`preload.js` via `node --check`, the rest via a standalone Linux `esbuild`.
**Not yet tested on the real machine** — next check: force a backend outage (or just watch it
happen naturally) and confirm (1) the topbar badge actually flips to Offline instead of staying
stuck on Online, (2) History/Receivables/Profile's spinners resolve within ~15s instead of
hanging, and (3) Profile's Shift Info shows the new "Can't reach server" message instead of a
false "Not clocked in."

## Small follow-ups after the translation pass (2026-07-27, same day)

User reported two things from live screenshots of Menu's Order Details panel: (1) once an
occupied table is tapped and Menu enters "Adding to Order #N" mode, there was no way back out of
it — confirmed from the screenshots that even after removing every item from the "Adding Now"
section, the green banner and the mode stayed stuck with no exit control; (2) the sync-status
pill in the topbar should say "Online" instead of "Synced".

Fixed both. `PosShell.jsx`'s sync pill source string changed from `'Synced'` to `'Online'`
(`i18n.js` dictionary updated to match, `'Synced'` key removed after confirming via grep nothing
else referenced it).

The back button went through two revisions after user feedback that it was too easy to miss.
First attempt put a small icon-only button inside the green "Adding to Order #N" banner — user
said still hard to spot even with a "Back" text label added. Moved it per explicit direction:
now a "‹ Back" pill sits at the top of the Order Details panel, right-aligned next to the "Order
Details" title itself (not tucked inside the conditional banner), and — also per explicit
request — it's no longer scoped to add-to-existing-order mode only. New `hasOrderInProgress`
derived flag (`cartEntries.length > 0 || selTable || existingOrder || custName/Phone/Addr ||
orderType !== 'dine_in'`) controls its visibility, so it shows for ANY in-progress order (a
plain new dine-in/takeout/delivery order too, not just the add-to-existing-order case) and stays
hidden on a genuinely blank cart. Clicking it calls the existing `clearOrder()` function (already
used for post-Fire cleanup — reused, not reinvented): clears cart, `selTable`, `existingOrder`,
customer fields, resets order type to dine-in, closes the table picker. All three touched files
(`i18n.js`, `PosShell.jsx`, `MenuScreen.jsx`) esbuild-verified clean. **Not yet tested on the
real machine** — next check: confirm the Back pill appears next to "Order Details" as soon as
anything is added to the cart or a table/order-type is picked, and disappears again once cleared.

## Full Uzbek translation of the pos-app cashier panel (2026-07-27)

User asked for a full Uzbek translation of the new cashier panel and reported the existing
UZ/EN toggle button "does not work yet at all". Root cause, confirmed via grep before writing
any code: `PosShell.jsx` already had the toggle's `lang` state (`useState` + localStorage
persistence, `screenProps = { ..., lang }` threaded to every screen) — but **zero files in
`pos-app/src` actually read `lang`**. The button changed state; nothing consumed it.

Fix: new `pos-app/src/lib/i18n.js` — a translation dictionary keyed by the *exact English
source string* (not invented semantic keys), so wiring a screen up is "wrap the literal in
`t(str, lang)`" rather than a structural refactor. Two helpers: `t(str, lang)` (plain lookup,
silently falls back to English if `lang !== 'UZ'` or no dictionary entry exists) and
`tt(lang, enTemplate, uzTemplate, vars)` (for strings with variables — counts, amounts, dates —
since UZ/EN word order differs and a lookup on a pre-composed string can't handle that).
`tableFallbackLabel`/`tableLabel` centralize the repeated `` `Table ${n}` `` fallback used
across Menu/Orders/Tables. `tokens.js`'s `statusPill(status, lang)` and (new)
`ReceivablesScreen.jsx`'s `statusStyle(status, lang)` both translate their pill labels through
the same dictionary; `lang` is optional everywhere so any call site not yet passing it still
renders in English rather than throwing.

Every screen/modal in `pos-app/src/pages/pos/` now imports `t`/`tt` and translates its
user-facing strings: `PosShell.jsx` (nav, search placeholders, sync status, staff chip),
`MenuScreen.jsx`, `OrdersScreen.jsx`, `TablesScreen.jsx`, `HistoryScreen.jsx` (incl.
`RefundDialog`/`CalendarModal`/`StaleBadge` sub-components and a new `paymentLabel()` helper for
the snake_case `cash`/`card`/`qr_code`/`loan` payment-method values), `ReceivablesScreen.jsx`
(incl. its own `StaleBadge`), `ProfileScreen.jsx`, `AmountPickerModal.jsx`, and
`PaymentModal.jsx` (incl. the `LoanFields` sub-component, which needed `lang` added to its
props since it didn't receive any screen props before). All locale-aware
`toLocaleDateString`/`toLocaleTimeString` calls touched during this pass now switch between
`'uz-UZ'` and `'en-GB'`/`'en-US'` based on `lang`, so month/weekday names localize too.

13 files touched/created in total (`i18n.js` new; `tokens.js`, `PosShell.jsx`, `MenuScreen.jsx`,
`OrdersScreen.jsx`, `TablesScreen.jsx`, `staleCache.js`, `HistoryScreen.jsx`,
`ReceivablesScreen.jsx`, `ProfileScreen.jsx`, `AmountPickerModal.jsx`, `PaymentModal.jsx`
edited) — all esbuild-verified clean (one harmless duplicate-key warning in the dictionary
found and fixed, no functional bug). **Not yet tested on the real machine** — next check: open
pos-app, toggle UZ/EN from the sidebar, and click through all 6 screens + Payment/Amount-picker
modals to confirm every visible label actually switches language, not just the labels called
out above.

## Offline/robustness pass (2026-07-27, same day as the speed pass)

User asked "what else can we get like this way" after the DB/cache-header speed pass — three
more free, safe wins, all built and esbuild-verified (**not yet run on the real machine**):

- **Self-hosted Plus Jakarta Sans** — `pos-app/src/assets/fonts/PlusJakartaSans-Variable.woff2`
  (single variable-font file, weights 400-800 confirmed via its HVAR/MVAR/STAT tables),
  `@font-face` added to `src/index.css`, Google Fonts `<link>`s + `preconnect`s removed from
  `index.html`, CSP's `style-src`/`font-src` no longer need `fonts.googleapis.com`/
  `fonts.gstatic.com`. Removes an external network dependency entirely — same font renders
  online or fully offline, no flash-of-fallback-font.
- **Local photo disk-cache** — new `app-photo://` custom Electron protocol (`main.js`,
  registered before `app.whenReady()`), backed by a cache directory under
  `app.getPath('userData')/photo-cache`. First request for a menu-item photo downloads it once
  and saves to disk; every later request (any screen, any session) is served straight from disk,
  no network round-trip. Safe with zero invalidation logic because uploaded filenames
  (`${Date.now()}-${random}${ext}`, `restaurant-app/backend/src/routes/menu.js`) are never
  reused — a cached file can never go stale. `src/lib/localPhoto.js` rewrites a menu photo URL
  to `app-photo://<filename>`; wired into `MenuScreen.jsx`'s image tag only (the old unrouted
  `Cashier.jsx` deliberately left alone, same "globally in pos-app only" rule as before). CSP's
  `img-src` extended to allow `app-photo:`. **Correction to an earlier claim in this same
  conversation: I said this cache would also cover staff avatar photos — checked
  `users.js`/`schema.sql`/`ProfileScreen.jsx` before actually building it and found that's wrong.
  There is no avatar/staff-photo feature anywhere in this codebase — only `menu_items.image_url`
  exists.** Staff are shown via initials chips only. See MEMORY.md.
- **Stale-data badge on History and Receivables** — both screens read live from the backend
  (`apiGet`, not local PowerSync — see their own top-of-file comments for why) with no offline
  fallback before now: a failed refresh just showed a toast and an empty/stuck table. New shared
  `src/lib/staleCache.js` (`loadCached`/`saveCached`/`timeAgo`, plain localStorage) persists the
  last successful load; both screens now initialize their list from that cache on mount (skips
  the spinner if there's already something to show) and display a small badge — "Updated Xm ago"
  normally, or a coral "Offline — showing data from Xm ago" if the most recent refresh attempt
  failed — instead of silently showing possibly-stale data with no indication.

All six touched/new files (`index.css`, `index.html`, `main.js`, `src/lib/localPhoto.js`,
`src/lib/staleCache.js`, `MenuScreen.jsx`, `HistoryScreen.jsx`, `ReceivablesScreen.jsx`)
esbuild/syntax-verified, **and confirmed working on the user's real machine (2026-07-27)** — no
regressions reported after the font/photo-cache/stale-badge changes went live in the running app.

## Speed pass — free wins (2026-07-27)

User asked what could be done to make pos-app faster for free. Checked real evidence instead
of guessing (Supabase's own performance advisor, the actual server.js/package.json), then did
what was confirmed safe and asked before anything with tradeoffs:

- **Added 5 missing indexes** on the foreign keys pos-app hits constantly — flagged by
  Supabase's performance advisor, not guessed: `orders.table_id`, `orders.waitress_id`,
  `order_items.menu_item_id`, `menu_items.category_id`, `restaurant_tables.assigned_to`.
  Also dropped one confirmed duplicate index on `finance_manual_income` (advisor WARN level,
  unrelated table, pure write overhead). Applied directly via Supabase MCP
  (`add_hot_path_fk_indexes` migration) — re-ran the advisor after, confirmed the FK warnings
  are gone (the 5 new indexes now show as "unused" only because they're brand new, not an
  error).
- **Added 7-day cache headers to menu photo serving** — `restaurant-app/backend/src/server.js`,
  `express.static('/uploads', ...)` had zero cache headers, so every screen re-downloaded the
  same photo. Verified uploaded filenames are `${Date.now()}-${random}${ext}` (never reused,
  `menu.js` multer storage) before adding a long `maxAge`, so this can't ever serve a stale
  photo after a re-upload. `node --check` passed, committed (`eada77b`) to
  `restaurant-app/backend`'s own repo (same nested-repo situation as the earlier 403 fix — see
  MEMORY.md) — **needs `git push origin main` from the user, same as before, no GitHub push
  credentials in this sandbox.**
- **pos-app is currently run via `npm run dev` on the real terminal** (confirmed by the user,
  not assumed) — dev mode has real overhead (unminified, dev-server) vs. the packaged build
  path that already exists (`npm run build:win` → NSIS installer via electron-builder). Handed
  back to the user to build/install and compare — this AI's sandbox can't produce a Windows
  installer.
- **Render "always warm" pinger — user opted in ("set it up carefully")**, given the real risk:
  the original 2026-07-06 Render suspension happened because something kept the service running
  24/7 and blew through the free 750-hour/month cap. Recommended (not yet set up — needs the
  user to create the free third-party account, this AI can't sign up on their behalf): a free
  external monitor (UptimeRobot / cron-job.org) hitting `/health`, but scoped to actual
  restaurant operating hours only (e.g. ~14h/day ≈ 420 hrs/month, comfortably under the 750h
  cap) rather than 24/7 — pos-app itself never opens a WebSocket, so it doesn't keep Render warm
  on its own; only another connected client's WS keep-alive (30s ping, `server.js`) does that,
  and only while something stays connected.

**Not yet re-tested for actual before/after speed** — this is architecture-level/DB-level work,
no user-visible confirmation loop the way UI fixes get.

## Bug fix: ADD/+ on a weighed item asked for the wrong thing (replace vs. add)

Follow-up to the weighed-item fix directly below this entry. Once the amount picker existed,
tapping ADD/+ on an item ALREADY on the order (e.g. KFC already at 0.5 kg) reopened the picker
prefilled with the current total (`0.5`) — if the cashier meant "add 1.33 more" and just typed
over it, the order ended up at `1.33 kg` instead of the correct `1.83 kg`. Real mistake risk in
a rush, reported directly by the user with a screenshot.

Fixed in all three screens (`MenuScreen.jsx`, `OrdersScreen.jsx`, `TablesScreen.jsx`) by giving
`openAmountPicker`/`confirmAmountPicker` a `mode`: `'add'` (ADD button / + stepper) now opens
with a BLANK field and, on confirm, SUMS the typed amount with whatever qty is already there
(`existingQty + typed`) instead of replacing it — a brand-new item still works identically
since existingQty is 0 either way. `'set'` (the minus stepper — a correction/reduction) keeps
the old prefilled-with-current/replace behavior, since that's the one place typing an exact new
lower value is the actual intent. `AmountPickerModal.jsx` shows contextual copy in add mode:
header "Add amount", field label "Amount to add", and a hint line "already 0.5 kg on this
order" when there's an existing qty, so the field's meaning is visually unambiguous, not just
correct under the hood. All four touched files esbuild-verified clean. **Not yet tested on the
real machine** — next check: on an order that already has a weighed item, tap ADD/+ again,
confirm the field is blank (not prefilled with the old total), type an amount, and confirm the
new total is old + typed, not just typed.

## Bug fix: Orders/Tables edit mode didn't understand weighed items (kg/l/g/ml)

Both screens' in-place edit mode (add-items grid + right-panel steppers) only ever did blind
integer `qty + 1` / `qty - 1` — fine for piece-counted items, wrong for anything sold by
kg/l/g/ml (e.g. "Jiz" rice, sold as `0.5 kg`): tapping the stepper on those would silently
round to whole units instead of opening the type-an-amount picker Menu's cart already has.
This logic (`isWeighedItem`/`unitSuffix`/`formatQty`) previously only existed as private
functions inside `MenuScreen.jsx`. Extracted to shared `pos-app/src/lib/weighed.js` and a new
shared `pos-app/src/pages/pos/AmountPickerModal.jsx` (the modal UI, previously duplicated
inline in Menu only); `MenuScreen.jsx` now imports both instead of defining its own copies
(behavior unchanged, just de-duplicated). `OrdersScreen.jsx` and `TablesScreen.jsx` edit modes
now: open the amount picker instead of incrementing when `editAdd`/`editDec` hits a weighed
item (looked up via `menuById` so the check has the real `.unit`, not a partial `{id,name,price}`
object like the stepper button used to pass), show the unit suffix on the add-items grid price
(`14,000 so'm / kg`), and format the panel's qty text as `0.5 kg` instead of `×0.5`. Also fixed
the Charge/Payment modal on both screens, which built `payEntries` with `unit: 'piece'`
hardcoded (so weighed items always displayed as `×qty` there too, read-only display bug, no
functional impact since those steppers are disabled for existing orders) — now reads the real
unit via `menuById` and passes the shared `formatQty` instead of a hardcoded `×${q}` function.
All 5 touched/new files (`weighed.js`, `AmountPickerModal.jsx`, `MenuScreen.jsx`,
`OrdersScreen.jsx`, `TablesScreen.jsx`) esbuild-verified clean. **Not yet tested on the real
machine** — next check: edit an order containing a weighed item (e.g. add/adjust "Jiz" from
Tables or Orders edit mode), confirm the amount picker opens instead of a blind +1, and that
Charge afterward shows the right unit.

## Bug fix: Edit → Done was 403ing on Orders and Tables (fixed + deployed 2026-07-27)

`PUT /api/orders/:id` (`restaurant-app/backend/src/routes/orders.js`, the route both Orders'
and Tables' edit-mode "Done" button call via `orders:update`/`ordersUpdate`) only had
`authorize('owner', 'admin', 'cashier', 'waitress')` — missing `new_cashier`/`new_waiter`, the
roles pos-app actually logs in as. Every save threw the literal `403 { error: 'Access denied' }`
shown on screen. Added the two missing roles, committed (`2444d39`) and pushed to
`the-bill-backend`'s `origin/main` (confirmed via `git fetch` — matches local), Render should
auto-deploy from there. **User confirmed the push landed; not yet re-confirmed that Edit → Done
now succeeds live** — check this first if it's reported again.

Note for future sessions: `restaurant-app/backend/` is its OWN nested git repo
(`github.com/JahongirMamadiyorov/the-bill-backend`), separate from the parent `The-Bill` repo's
`origin` (`github.com/JahongirMamadiyorov/The-Bill`) — commit/push backend fixes from inside
`restaurant-app/backend/`, not the repo root. Also: this sandbox's mount of `D:\The-Bill` can't
`rm` a stale `.git/index.lock`/temp-object files (`Operation not permitted` even as the owning
user) but CAN `mv`/rename them out of the way — use `mv .git/index.lock .git/index.lock.bak`
(any name) as the workaround if a git command fails with "Unable to create index.lock".

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

- **RESOLVED (2026-07-27): Render is genuinely on the Free instance type** — user confirmed
  directly in the Render dashboard (Settings → Instance Type), contradicting CLAUDE.md's "paid"
  note. This is the confirmed root cause of intermittent login/request failures reported the same
  day ("Client network socket disconnected before secure TLS connection was established") —
  classic free-tier sleep-after-~15min-idle + dropped connections during the cold-start wake
  window, not a code bug. **User's explicit decision: leave it as Free for now, no pinger, no
  upgrade** — so this will keep happening (first request after ~15 min idle fails, retry
  succeeds) until the user revisits it. Don't re-diagnose this as a new bug if reported again;
  point back to this entry. CLAUDE.md's "paid plan" line is now known to be inaccurate — flagged
  to the user, not silently edited (that file is theirs to maintain).
- Which GitHub repo actually covers `electron-app` + `print-agent`? Not confirmed.
- Supabase RLS disabled on ~35 public tables — flagged, not decided whether intentional.
- `RestaurantApp/src/api/client.js` has `USE_LOCAL_BACKEND = true` — dev builds point at
  localhost, not the new Render URL. Not addressed.
- Whether `new_cashier` also needs the PIN quick-switch flow (same shared-terminal reasoning as
  `new_waiter`) or only ever has one login — not yet asked.
- `pos-app`'s Electron version (`^33.0.0`) is intentionally newer than the existing
  `electron-app`'s (`28.3.3`) — don't "align" them without checking PowerSync's Node version
  requirements still hold.

# RULES

This file is the source of truth for how any AI (Claude or otherwise) must operate in this
project. It is only ever added to, never silently changed — see Rule 0 below.

## 0. Meta-rules (process)

- Before doing anything else in this project, an AI must read, in this order: RULES.md (this
  file) → SESSIONS.md → STATUS.md → MEMORY.md. Only after reading all four should it read code
  or start work.
- After finishing work in a session, the AI must:
  - Append an entry to SESSIONS.md describing what was done in that session.
  - Update STATUS.md to reflect the current done/next state.
  - Add anything worth remembering long-term to MEMORY.md.
- When the user asks to add or change a rule, the AI must write that new/changed rule into this
  file (RULES.md), not just remember it verbally or apply it silently.
- Do not delete or rewrite past rules to make room for new ones — append, and mark old rules as
  superseded if a new rule replaces them, so the history of "why" is never lost.

## 1. Design & code rules (from project owner)

1. Do not use emoji — use icons only.
2. Use good design with a colour palette consistent between the website and the app(s).
3. Check for CamelCase / snake_case mismatches between the website and the app(s) — the backend
   (Postgres/Express) tends toward snake_case, the frontends toward camelCase; verify the
   translation layer is correct at every boundary rather than assuming it matches.
4. Always plan and ask clarifying questions before starting non-trivial work — do not guess.
5. Work smart, do not guess — verify against the actual code/data/dashboard state rather than
   assuming.

## 1a. Debugging/fix-process rule (added 2026-07-30, after the Windows packaging saga)

- When troubleshooting a crash/bug that has already had one unsuccessful fix attempt, **present
  ranked options and get the user's explicit choice before trying another speculative fix** —
  do not just try the next idea unilaterally. This was said explicitly and firmly by the project
  owner mid-session ("Stop doing things yourself Claude, tell me options to fix it first then I
  will choose what needs to be done!") after an unprompted `compression: "store"` change didn't
  fix the NSIS installer crash. Applies for the rest of this project, not just that incident.
- Before proposing a fix for a packaging/runtime crash, get the REAL error first — a double-
  clicked packaged Electron app has no attached console, so `console.error`/`console.log` from
  the main process is invisible until the app is launched from a terminal
  (`& "path\to\App.exe"` in PowerShell) or DevTools is opened in the renderer (`Ctrl+Shift+I`,
  works even in a production build unless explicitly disabled). Guessing at a second fix before
  getting this is how the 2026-07-30 session burned through 5 rounds of near-misses — each real
  error message pointed at a different, previously-invisible bug.

## 2. Infrastructure facts

- Database: Supabase, paid plan. Project "The-Bill", ref `uubfvjcwrumfijjqtjjb`, region
  ap-northeast-1. See CLAUDE.md for the database password — do not duplicate secrets across
  multiple files.
- Backend: Node/Express, hosted on Render. Runs on Render's **free** tier (CONFIRMED 2026-07-27 by
  the project owner directly in the Render dashboard, Settings > Instance Type — CLAUDE.md updated
  same day to match). Free tier = 750 instance-hours/month cap and spins down after 15 min idle
  (~50s+ cold start on next request); a request landing mid-wake can drop before the TLS handshake
  completes (see SESSIONS.md 2026-07-27 "Login crash root-caused" entry).
- Live backend URL: `https://the-bill-backend-pego.onrender.com` (changed from the original
  `the-bill-backend.onrender.com` after the original Render account was suspended for exceeding
  the free-tier hour cap — see SESSIONS.md 2026-07-06 entry for the full story).

## 3. Repo/deploy structure

- `website/` → GitHub repo `the-bill-website` → deploys to Vercel (project `the-bill-website`).
- `restaurant-app/backend/` → GitHub repo `the-bill-backend` (repo root = backend code, not
  nested) → deploys to Render (service `the-bill-backend`, live at the `-pego` URL above).
- `RestaurantApp/` → React Native phone app (Waitress role today).
- `electron-app/` + `print-agent/` → existing Windows kitchen print agent (background/tray app,
  not the full POS app being planned).
- Whichever repo covers `electron-app`/`print-agent` was left unconfirmed as of 2026-07-06 — ask
  before assuming.

## 4. New Windows POS app — architecture rules

- New app is a **separate, standalone Electron app** — not an extension of the existing
  `electron-app` print-agent.
- Shell: Electron (not Tauri) — decided in favour of reusing existing team knowledge.
- Data layer: PowerSync (Cloud, free tier) bridging Supabase Postgres → local SQLite per
  machine, for offline-first reads. Writes still go through the existing Express API (queued
  locally when offline) so business logic/validation stays centralized.
- Printing: trigger print jobs from local synced-data changes / directly from the
  order-creating terminal over LAN, not from a cloud WebSocket round-trip through Render.
  Printers must be network/ESC-POS capable (raw socket, port 9100 default) with a fixed IP —
  USB-only printers are out of scope without an adapter.
- No native Electron application menu (File/Edit/View/...) on any screen — disable it
  (`Menu.setApplicationMenu(null)`), kiosk/frameless style on POS terminals.
- Roles in scope: Admin, Owner, Cashier (`new_cashier`, reusing `NewCashierPOS.jsx`), Kitchen,
  and Waitress (`new_waiter`, touch-first, PIN quick-switch — built from scratch, does not exist
  in code yet as of 2026-07-06 beyond the role name itself).
- `new_waiter` PIN login: separate 6-digit PIN credential (bcrypt-hashed, new `pin_hash` column
  on `users`), distinct from the phone app's email/password. Terminal is trusted/paired once
  per restaurant; PIN only selects which staff member is using an already-trusted device — it is
  not meant to be a standalone internet-facing credential. Must include failed-attempt lockout
  (PIN space is only 1,000,000 combinations).
- Writes with real server-side business logic (order creation/payment, and anything similar in
  later phases — stock adjustments, refunds, etc.) go straight to the existing Express API over
  HTTPS from the Electron main process, NOT through PowerSync's write queue. Decided 2026-07-07
  for Phase 1 Cashier: PowerSync's local-write/upload mechanism is for simple offline-editable
  data, not multi-step server logic (tax calc, daily numbering, stock deduction, notifications,
  printing) that must stay centralized. Route every such write through one funnel function (see
  `submitOrderWrite()` in `pos-app/main.js`) rather than scattering direct calls, so offline
  queuing (see next rule) can be added in one place later instead of a rewrite.
- Offline-write policy, decided 2026-07-07: Phase 1 (and by default, later phases) require the
  backend to be reachable for writes with real business logic — no offline queuing yet. This was
  an explicit choice ("Option A") over queuing writes locally while offline ("Option B") because
  B risks double-numbering/stock drift if built quickly. **The project owner wants B added
  later** — code must leave room for it (see funnel-function rule above), not foreclose it.
- Local PowerSync SQLite reads have no camelCase translation layer the way REST responses do
  (see `website/src/api/client.js`'s interceptor) — column names come back exactly as in
  Postgres (snake_case), and booleans as 0/1 integers, not `true`/`false`. Every screen reading
  local PowerSync data must run rows through a camelize+boolean-coercion helper first (see
  `pos-app/src/lib/case.js`) — this is the concrete instance of rule 3 (camelCase/snake_case
  checks) for this app.

## 1b. "Required means required" (added 2026-08-09, at the project owner's explicit instruction)

- **When the project owner states that something IS REQUIRED, do it. Do not offer options, do not
  propose alternatives, do not ask which approach is preferred, do not argue the scope.** Stated
  verbatim by the owner: *"When I tell you something is required, do it. Without any options, do
  it."*
- This SUPERSEDES rule 1.4 ("always plan and ask") and rule 1a (present ranked options) **for the
  specific case where the owner has already said something is required**. Those rules still apply
  when the owner is asking a question, requesting a recommendation, or where the requirement
  itself is genuinely ambiguous.
- Clarifying questions remain allowed ONLY where the instruction cannot be executed without an
  answer (e.g. a missing file path or credential). They must not be used to re-litigate whether
  the work should happen or how big it should be.
- **"It will take a long time" is not a reason to narrow the scope.** The owner explicitly
  anticipated that a full audit could take a long time and asked for it anyway. Do the whole job:
  every file, every layer, not a representative sample.

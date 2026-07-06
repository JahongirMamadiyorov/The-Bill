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

## 2. Infrastructure facts

- Database: Supabase, paid plan. Project "The-Bill", ref `uubfvjcwrumfijjqtjjb`, region
  ap-northeast-1. See CLAUDE.md for the database password — do not duplicate secrets across
  multiple files.
- Backend: Node/Express, hosted on Render. As of 2026-07-03 this runs on Render's **free** tier
  (not paid — CLAUDE.md says paid, which is out of date; confirm with the project owner which is
  correct going forward). Free tier = 750 instance-hours/month cap and spins down after 15 min
  idle (~50s+ cold start on next request).
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

# Handoff: The Bill — Restaurant POS Terminal

## Overview
A full point-of-sale terminal UI for a restaurant ("The Bill — Restaurant management system"). Six screens behind a persistent sidebar: Menu (order building), Orders (live order cards + editing), Tables (floor plan), History (closed orders + refunds), Receivables (customer loans/debts), and Profile (staff account). Includes modals for payment processing, order details, refunds, loan collection, and a date-range picker.

## About the Design Files
The files in this bundle are **design references created in HTML** — a working prototype showing intended look and behavior, not production code to copy directly. Your task is to **recreate this design in the target codebase's existing environment** (React, Vue, native, etc.) using its established patterns and libraries. If no environment exists yet, choose an appropriate framework (the prototype's interaction model maps naturally to any component framework with local state).

`POS Terminal.dc.html` contains the entire design: an HTML template (inline styles, one `<x-dc>` block) plus a single state class at the bottom of the file (`class Component`) that holds all interaction logic and mock data. Read the class first — it documents every state variable, handler, and dataset. `image-slot.js` is a drag-and-drop image placeholder used for food photos/avatars; replace with real `<img>` elements in production.

## Fidelity
**High-fidelity.** Colors, typography, spacing, radii, and interactions are final. Recreate pixel-perfectly. The design canvas is fixed **1920×1080** and scale-to-fit (transform: scale) — in production, build it responsive-fluid for desktop/large-tablet landscape instead of scaling a fixed canvas.

## Design Tokens
Colors:
- Page background (mint): `#EAF6EF`
- Surface/card: `#FFFFFF`
- Primary green: `#23B26E` (hover `#1C9C5E`)
- Green tint bg: `#E4F7EC`; green text on tint: `#1C9C5E`
- Ink (primary text): `#1E2433`
- Muted text: `#7C8792`; faint text/labels: `#B0B8BF`
- Hairline borders: `#EEF1F1` / `#F0F2F1`; row hover: `#F7F9F8`; icon-chip bg: `#F5F7F6`
- Danger/coral: `#E14F45` on `#FDEBEA`
- Warning/amber: `#B7791E` on `#FFF3DC`
- Info/blue: `#2A5FD1` on `#E8F0FE`
- Neutral status: `#6B7280` on `#F1F3F5`
- Fire button orange: `#F2872F`
- Card shadow: `0 12px 32px rgba(20,45,35,0.06)`; modal shadow: `0 30px 70px rgba(20,45,35,0.25)`

Typography: **Plus Jakarta Sans** (Google Fonts), weights 400–800.
- Section headers 18px/800 · card titles 14–16px/700–800 · body 13–13.5px/600–700 · labels 10–11.5px/700 uppercase, letter-spacing .03–.05em · stat values 25px/800 · totals 19px/800.

Shape & spacing: cards radius 18–22px, buttons 10–14px, pills 999px; page padding 24px; grid/card gaps 16–20px; sidebar 264px (88px collapsed); right detail panels 372px; status pills `padding 4-5px 10-13px`.

Semantic status colors: green = available/served/completed/paid/current · coral = occupied/overdue/refunded · amber = reserved/preparing/due-soon/active-loan · blue = needs-bill/ready-to-serve · gray = cancelled/paid-archived.

## Screens

### Shell (all screens)
- Sidebar (white rounded card): logo mark (green square, first letter of restaurant name) + "The Bill" / "Restaurant management system"; nav items Menu, Orders, Tables, History, Receivables, Profile (active = green tint bg + green text); bottom: UZ/EN language segmented toggle (globe icon; visual only), Collapse (toggles 264→88px icon-only sidebar, chevrons rotate), Logout (coral).
- Top bar: search field (placeholder changes per screen) or "My Profile" title; right side staff chip (photo, name "Kassir Jahongir", "Clocked in at 06:33 AM") + notification bell with green dot.

### 1. Menu
Category label + pagination arrows; 6 category cards (Bar selected: green border/tint; Food, Wine, Soup, Pizzas, Fish) with line icons; product grid 4-col (photo, name, green price, full-width green ADD button with plus icon). Right panel **Order Details** (372px): customer block (Emily Carter, date/time, phone, initials chip), 5 icon chips (settings/transfer/print/dollar/tag), order-type pills (Dine In active), Order/Table/Server strip, items grouped by course pill (Salad/Food/Desert) each with −/qty/+ stepper (floor 1), totals (Sub Total/Discount/Service Charge/Tax/Total $32.60), Print + Fire buttons, green **Charge** button → Process Payment modal.

### 2. Orders
Filter pills (All Orders/Dine In/Takeout/Curbside/Delivery — visual) + "6 active orders". 3-col tappable order cards: order #, status pill, place · time, waiter (initials chip + name), items count, total, eye button. Tap = select (green 2px border) and populate right panel: order #, status, meta line, waiter row, itemized list, Sub Total/Tax & Fees/Total, Print/Edit, Charge.
**Edit mode** (Edit button): panel items gain −/+/remove(×, coral); Order Type pill switcher; Table row becomes a "Change on floor plan" button; main area swaps to the **add-items menu** (category filter pills All/Bar/Food/Wine/Soup/Pizzas/Fish + product cards with ADD) or the **floor plan picker** (tap table to assign). Print becomes coral **Discard** (reverts items/type/table from a snapshot); Edit becomes **Done**. All totals and the order card recalc live.

### 3. Tables
Zone pills (Main Hall active, Patio, Bar, Private Room — visual) + status legend. 4-col table cards: table #, seats, status pill, detail strip (server · elapsed · total, or reservation). Right panel = same order-detail panel as Orders (selected order); Edit jumps to Orders in edit mode.

### 4. History
4 stat cards (Today's Sales $2,340.50 · Orders Completed 86 · Avg Ticket $27.20 · Refunds 2 · $45.00). Date chips Today/Yesterday/This Week + **Custom → date-range picker modal** (From/To boxes, month calendar with range highlight + prev/next month, quick ranges Today/This Week/This Month/Last Month, Apply puts "YYYY-MM-DD → YYYY-MM-DD" on the chip). Table columns: Date & Time, Order, Table, WAITERS, Items, Total, Payment, Status. Rows tappable → **Order detail modal**: header (receipt icon, order # + status, date), Table/Waiter tiles, Name/Qty/Amount items table + subtotal, right rail Payment Method card + Summary (Subtotal, Service & Tax, Total Paid), **Process Refund** (only for Completed) → refund reason dialog (radio: Customer Complaint/Wrong Order/Duplicate Payment/Other; Confirm marks the row Refunded), Close.

### 5. Receivables (customer loans)
3 stat cards (Total Outstanding $1,240.00 · Overdue $380.00 in coral · Customers with Balance 14). Filter chips **All/Active/Paid/Overdue** (Active = current + due-soon; Paid = collected this session). Table: customer (initials chip), phone, owed (color-coded), last charge, due, status pill, Record Payment (green outline) + Remind. Row tap → **Loan Details modal**: status banner (ACTIVE amber / OVERDUE coral / PAID green, amount + due date), tiles (Customer/Phone/Order#/Table/Taken On/Due or Paid On), order items with qty × unit descriptions + subtotal, "Paid Via" banner when settled, Close + **Mark Paid**. Record Payment / Mark Paid → **Collect Loan Payment modal**: info tiles + right rail payment method (Cash/Card/QR with green check), Total to collect, Confirm Payment (marks loan Paid everywhere), Cancel.

### 6. Profile
Header card: avatar, name + "On Shift" pill, "Front Desk Cashier · Employee ID EMP-0231", Edit Profile / Change Password. Shift Info card (Clocked In 06:33 AM, Shift Length, Break, coral-outline Clock Out). Personal Details card (phone/email/address/emergency/hire date with icons). 3 stat cards (Orders Handled 42 · Sales $1,180.00 · Avg Serve Time 6m 10s).

### Process Payment modal (from any Charge button)
Two columns. Left: Order Items with −/qty/+ steppers (shared state with the cart), Subtotal/Service Charge/Tax/Total. Right: Payment Method 2×2 grid (Cash/Card/QR Code/Loan, selectable), Amount Received, Change to give back, Apply Discount (%/$ toggle + range field), Split Bill 2/3/4 ways → per-part cards (amount = total/n, Paid checkbox, per-part Cash/Card/QR/Loan), **Loan** selection reveals amber warning ("Order will be marked paid. Debt tracked until customer returns.") + Customer Name/Phone/Expected Return Date fields, Notes, **Confirm Payment · $total** → success view (green check, "Payment Confirmed", amount, Done), Cancel.

## State Management (from the prototype class — mirror these)
`activeNav`, `collapsed`, `lang`; cart `itemQty` {salad,main,dessert}; payment modal: `showPayment`, `paymentMethod`, `splitWays`, `splitPartMethod{}`, `splitPartPaid{}`, `paymentConfirmed`; orders: `selectedOrder`, `editingOrder`, `editSnapshot` (items+meta snapshot for Discard), `orderItems{orderId:[{name,qty,unit}]}`, `orderMeta{orderId:{type,table}}`, `editCategory`, `showTablePicker`; history: `selectedHistory`, `showRefund`, `refundReason`, `refundedOrders{}`, `histFilter`, date picker (`calYear/calMonth/calFrom/calTo/calPicking`, `customLabel`); receivables: `recvFilter`, `selectedLoan`, `showCollect`, `collectMethod`, `paidLoans{name:{via,on}}`. Totals are always derived: subtotal = Σ unit×qty; order total = subtotal + fixed per-order fees.

## Interactions & Motion
Sidebar width transition .18s ease; nav/pill color transitions .15s; button hovers darken green to `#1C9C5E`, row hovers `#F7F9F8`. Modals: centered over `rgba(20,35,28,0.45)` backdrop, no entrance animation required (fade ≤150ms acceptable). Hit targets ≥ 34px; all list rows/cards are tappable with cursor:pointer.

## Assets
No external images — food photos and avatars are user-droppable placeholders (`image-slot.js`); use real product/staff photos in production. All icons are inline stroke SVGs (24×24 viewBox, stroke-width 1.7–1.8, round caps) drawn in the file — copy the paths or substitute a matching line-icon set (Lucide-style).

## Files
- `POS Terminal.dc.html` — the complete design: markup (inline styles) + `class Component` with all state, handlers, and mock datasets (menu catalog with categories, orders, tables, history, receivables).
- `image-slot.js` — image placeholder web component (design-time only).
- `screenshots/` — captured states:
  01 Menu · 02 Process Payment modal · 03 Orders · 04 Orders edit mode (add-items menu) · 05 Floor-plan table picker · 06 Tables · 07 History · 08 History order detail modal · 09 Refund reason dialog · 10 Date-range picker · 11 Receivables · 12 Loan Details modal · 13 Collect Loan Payment modal · 14 Profile.

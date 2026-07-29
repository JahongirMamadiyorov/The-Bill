import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from '../../../context/LanguageContext.jsx';
import { money } from '../../../lib/adminFormat.js';
import {
  reportsAPI,
  shiftsAPI,
  notificationsAPI,
  accountingAPI,
} from '../../../api/client.js';
import { camelizeRow, camelizeRows } from '../../../lib/case.js';
import {
  LayoutDashboard,
  DollarSign,
  ShoppingCart,
  Users,
  Grid3X3,
  AlertTriangle,
  Clock,
  TrendingUp,
  RefreshCw,
  Package,
  Bell,
  X,
  CheckCircle,
  Briefcase,
  User,
  Utensils,
  Truck,
  ShoppingBag,
  Flame,
  Archive,
  TrendingDown,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Ported verbatim from website/src/pages/admin/AdminDashboard.jsx (same
// design, same data, same computations — "no design/functional changes"
// rule for this whole Admin build) with exactly one structural adaptation:
// `useNavigate()` (react-router) replaced with a `navigate` prop, since
// pos-app has no <Outlet/>/URL routing — AdminShell.jsx passes down a `goTo`
// adapter that maps the same '/admin/orders'-style paths this file already
// calls onto its internal nav-key state. No other logic touched.
//
// Printing not involved anywhere on this screen — nothing excluded here.
//
// ── 2026-07-28: reads converted to local PowerSync, ninth/last screen of
// task #31 (after Tables/Loans/Menu/Orders/Inventory/Staff) — see
// OrdersScreen.jsx's own header comment for the general pattern
// (psGetAll/psGet + camelizeRow/camelizeRows, no restaurant_id filter needed
// since the local DB is already scoped to one restaurant). `user` was added
// to this screen's props (AdminShell.jsx already passes it to every screen,
// same as ProfileScreen.jsx — no AdminShell change needed) since the
// notifications read needs the current user's id. Writes are completely
// untouched: `notificationsAPI.markRead`/`markAllRead` still call REST
// exactly as before.
//
// This screen fires FIFTEEN parallel reads every 15s poll — each evaluated
// independently against the real backend route file
// (restaurant-app/backend/src/routes/reports.js, tables.js, warehouse.js,
// shifts.js, loans.js, notifications.js, accounting.js, staff-payments.js,
// procurement.js), never assumed:
//
// CONVERTED to local reads (ten), each a plain select or a faithful
// single-query aggregate with zero app-side post-processing beyond what this
// screen already did client-side:
// 1. `tablesAPI.getAll()` → local `SELECT * FROM restaurant_tables ORDER BY
//    table_number`. The real route's own `waitress_name` join AND its
//    computed `order_total` subquery are BOTH dead weight here — grepped
//    this whole file and found zero reads of `table.waitressName`/
//    `table.orderTotal` (this screen only reads `.id`/`.status`/
//    `.tableNumber` for the occupancy grid/counts) — neither replicated.
// 2. `warehouseAPI.getLowStock()` → local `SELECT id, name, unit,
//    quantity_in_stock, min_stock_level, cost_per_unit FROM warehouse_items
//    WHERE quantity_in_stock <= min_stock_level ORDER BY quantity_in_stock
//    ASC`, a direct 1:1 port of the real route (no joins to begin with).
// 3. `warehouseAPI.getAll()` → local `SELECT * FROM warehouse_items ORDER BY
//    name`. The real route's `supplier_name` join AND its per-row N+1
//    `stock_batches` sub-fetch are both dead weight — this screen only reads
//    `.quantityInStock`/`.quantity`/`.costPerUnit` off each row for the
//    warehouse total-value calc, same dead-weight verdict Menu/Inventory
//    already reached for this exact route, re-confirmed by grep here too.
// 4. `warehouseAPI.getMovements({from,to})` → local query joining
//    `warehouse_items` (kept — see below) filtered by
//    `date(sm.created_at) BETWEEN date(?) AND date(?)`, matching the real
//    route's own `sm.created_at::date >= from AND <= to`. Unlike Inventory's
//    own `fetchMovements` (which never applies this filter, since Inventory's
//    call site always passes `{}`), THIS call site always passes today's
//    range, so the date filter had to be replicated, not dropped. The real
//    route's `recorded_by` (users) join is dead weight (grepped clean) — NOT
//    replicated. The `wi.cost_per_unit` join IS kept — this screen reads
//    `.costPerUnit` off each movement row, and a direct read of the real
//    route confirms it actually selects the warehouse item's CURRENT
//    `cost_per_unit`, not the movement's own point-in-time
//    `stock_movements.cost_per_unit` column (which exists and is used
//    elsewhere, e.g. receive/consume) — a pre-existing backend quirk, not
//    something to "fix" here; replicated faithfully as-is.
// 5. `procurementAPI.getDeliveriesDebt()` (+ its own client-side fallback,
//    `procurementAPI.getDeliveries()`, called only if the first returns 0) →
//    both reused verbatim from InventoryScreen.jsx's already-verified
//    `fetchDeliveriesDebt`/`fetchDeliveries` local queries (plain SUM/COUNT
//    aggregate; plain `supplier_deliveries` select with its `item_count`
//    join dropped as dead weight — see that file's own header comment for
//    the full reasoning, unchanged here).
// 6. `staffPaymentsAPI.getAll({from,to})` → reused verbatim from
//    StaffScreen.jsx's already-verified `fetchStaffPayments` local query
//    (its `staff_name` join dropped as dead weight — this screen only reads
//    `.amount` off each payment row for the month-to-date total).
// 7. `loansAPI.getStats()` → local aggregate,
//    `SUM(CASE WHEN status='active' THEN 1/amount ELSE 0 END)`-style
//    (SQLite doesn't reliably support Postgres's `FILTER (WHERE ...)`
//    syntax across all builds, so `CASE WHEN` is used instead — same result,
//    portable), matching the real route's own
//    `COUNT(*)/SUM(amount) FILTER (WHERE status=...)` counts exactly. A
//    single aggregate query, zero joins, zero app-side post-processing —
//    faithfully replicable in full.
// 8. `notificationsAPI.getAll()` → local `SELECT * FROM notifications WHERE
//    user_id = ? ORDER BY created_at DESC LIMIT 50`, matching the real
//    route exactly (it already scopes to `req.user.id`, no restaurant_id
//    filter needed locally per the standing rule). Needs the current user's
//    id — the one new prop this screen needed (`user`, see above).
// 9. `reportsAPI.getBestSellers({from,to})` → local
//    `GROUP BY m.name, c.name ORDER BY total_sold DESC LIMIT 20` aggregate
//    (order_items JOIN menu_items JOIN orders, LEFT JOIN categories kept
//    ONLY for the real route's own `GROUP BY ... c.name` grouping key, not
//    displayed — same "join kept only for grouping/ordering fidelity"
//    precedent Menu/Orders already established). This is a top-N query
//    (ORDER BY DESC LIMIT), not a period-comparison or ranked-with-business-
//    logic query — no percentage/share calculation happens server-side
//    (this screen already computes `percentage` client-side from the
//    returned array, unchanged); SQLite supports GROUP BY/ORDER BY/LIMIT
//    identically to Postgres, and nothing happens after the SQL query on the
//    backend (`res.json(result.rows)` directly) — same precedent as
//    Inventory's `LIMIT 500` movements query and Staff's `ROW_NUMBER()`
//    latest-per-group query, both already converted. Kept the real route's
//    `LIMIT 20` (this screen only displays the top 5, but the un-shown rows
//    6-20 affect the `maxSales` bar-percentage calculation, so all 20 must
//    be fetched, not just 5).
// 10. `ordersAPI.getAll({from,to})` (the "fetch ALL orders today, filter
//     client-side" call feeding `activeOrders`) → local
//     `SELECT status, order_type FROM orders WHERE created_at >= ? AND
//     created_at <= ?`. The real route's own massive join set
//     (restaurant_tables/users×2/item-count subquery/loans LATERAL) is
//     entirely dead weight here — grepped this whole file and confirmed only
//     `.status` and `.orderType`/`.type` are ever read off an order row in
//     this screen (the active-order breakdown counts and the raw count
//     fallback) — nothing else. `orders`/`order_items`/`menu_items`/
//     `categories`/`restaurant_tables`/`warehouse_items`/`suppliers`/
//     `stock_batches`/`stock_movements`/`supplier_deliveries`/`loans`/
//     `staff_payments`/`notifications` are all fully synced tables.
//
// LEFT ON REST, deliberately (four), each verified as real business logic or
// a genuine sync gap, not assumed:
// - `reportsAPI.getAdminDailySummary()` (dashboardData, the PRIMARY data
//   source for most KPIs) — genuine multi-step server-side computation well
//   beyond a plain SUM/COUNT: per-waitress staff-performance rows (JOIN
//   shifts+orders, GROUPed per user), a financialFlow object assembled from
//   THREE separate aggregate queries plus an outflowBreakdown structure, an
//   hourly `dailySalesTrend` chart (`date_trunc('hour', paid_at)` grouping
//   over the last 24h), and goods-sold grouped by item+category. Stays on
//   REST exactly as before.
// - `shiftsAPI.getStaffStatus()` — same "live staff status" real business
//   logic already established and left on REST for StaffScreen.jsx (a
//   `DISTINCT ON (user_id)` priority-CASE pick mapped onto a derived
//   present/late/absent/off status the raw row never has). Unchanged here.
// - `shiftsAPI.getPayroll({from,to})` (month-to-date payroll, feeding
//   `payrollOwed`) — genuine multi-step business logic: a `CASE` branching
//   on `salary_type` (monthly/hourly/daily/weekly, each a different formula)
//   PLUS a correlated subquery computing waitress commission from paid
//   dine-in orders in the period. This is "multi-step aggregation beyond a
//   single plain SUM/COUNT/AVG" per the standing rule — stays on REST.
// - `accountingAPI.getCashFlow({from,to})` — genuine sync gap, not a
//   business-logic call: `cash_flow` is NOT one of the tables in
//   `pos-app/powersync/schema.js` at all (verified directly, not assumed —
//   it was never added to the `powersync` publication), so there is no local
//   table to query regardless of how simple the route's own SQL is. Also
//   discovered in passing (not fixed, out of scope for a reads-only
//   conversion): the real route completely ignores the `{from,to}` query
//   params this screen passes — `cash_in`/`cash_out` are always scoped to
//   `CURRENT_DATE` server-side and `entries` is always `LIMIT 100` with no
//   date filter at all.
//
// NOT converted, deliberately left exactly as-is (one): `reportsAPI.
// getDashboard()` (`simpleDash`, described in this file's own pre-existing
// comment as a "reliable revenue/orders fallback"). Verified its own route —
// three simple aggregates (today's paid-order COUNT/SUM via Postgres FILTER,
// table free/occupied counts, a 30-day best-sellers top-5) — technically
// each one is individually about as simple as the ones converted above.
// Left on REST anyway for two concrete reasons, not just "it's a fallback so
// skip it": (1) every field this screen actually reads from it
// (`todayRevenue`/`todayOrders`/`activeOrders`) is only ever used behind a
// `||` fallback AFTER `dashboardData` (admin-daily-summary, itself staying on
// REST per above) — if the backend/network is unreachable, BOTH the primary
// and this fallback are REST calls that fail together, so converting only
// the fallback buys no real resilience or speed; (2) faithfully replicating
// it would require a SEPARATE `paid_at`-scoped query distinct from the
// `created_at`-scoped local query built for item 10 above (today's sales are
// counted by payment date, not creation date) — real added complexity for a
// value that's structurally redundant with data this screen gets elsewhere
// (its table counts already come from item 1's tableStats client-side
// derivation; its best-sellers subset duplicates item 9 above). Documented
// here explicitly rather than silently left unconverted.
//
// Boolean-column check: `notifications.is_read` (→ `isRead`) is already in
// case.js's `BOOL_FIELDS` — verified directly, needed since this screen's
// unread-count logic (`n.isRead`) depends on a real boolean, not a 0/1
// integer. `restaurant_tables`/`warehouse_items`/`stock_movements`/
// `supplier_deliveries`/`staff_payments`/`loans`/`order_items` (status/
// order_type only selected) have no boolean columns touched by this screen's
// queries.
//
// `tablesAPI`/`warehouseAPI`/`ordersAPI`/`loansAPI`/`staffPaymentsAPI`/
// `procurementAPI` imports dropped entirely — each had exactly one call site
// here, now converted, grepped clean. `reportsAPI` (getAdminDailySummary/
// getDashboard/getBestSellers — first two kept, third dropped),
// `shiftsAPI` (getStaffStatus/getPayroll, both kept), `notificationsAPI`
// (markRead/markAllRead writes kept, getAll read dropped), and
// `accountingAPI` (getCashFlow kept) are all still imported for their
// remaining REST call sites.
// ─────────────────────────────────────────────────────────────────────────────

export default function DashboardScreen({ navigate, user }) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [expandedLowStock, setExpandedLowStock] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notificationsRead, setNotificationsRead] = useState(false);

  // Data state
  const [dashboardData, setDashboardData] = useState(null);
  const [simpleDash, setSimpleDash] = useState(null); // from /reports/dashboard — reliable revenue/orders/tables
  const [tables, setTables] = useState([]);
  const [lowStockItems, setLowStockItems] = useState([]);
  const [activeOrders, setActiveOrders] = useState([]);
  const [staffStatus, setStaffStatus] = useState([]);
  const [bestSellers, setBestSellers] = useState([]);
  const [payrollData, setPayrollData] = useState(null);
  const [paymentsData, setPaymentsData] = useState([]);
  const [loansData, setLoansData] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [cashFlowData, setCashFlowData] = useState({ inflow: 0, outflow: 0 });
  const [allWarehouseItems, setAllWarehouseItems] = useState([]);
  const [warehouseMovements, setWarehouseMovements] = useState([]);
  const [supplierDebt, setSupplierDebt] = useState(0);

  // Calculate today's date range
  const getTodayRange = () => {
    const today = new Date();
    const from = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
    const to = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);
    return { from: from.toISOString(), to: to.toISOString() };
  };

  // Month-to-date range (1st of month → today) — used for payroll & payments
  const getMonthRange = () => {
    const today = new Date();
    const monthStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
    const todayStr   = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })();
    return { from: monthStart, to: todayStr };
  };

  // ── Local PowerSync reads, replacing REST calls — see this file's own
  // header comment (2026-07-28 conversion note) for the full per-read
  // reasoning against the real backend route files. Each wrapped in its own
  // try/catch (logs then rethrows) so a failure surfaces as a 'rejected'
  // Promise.allSettled entry, same as a failed REST call did before.

  // Was `tablesAPI.getAll()` — waitress_name join + order_total subquery both dead weight here.
  const fetchLocalTables = useCallback(async () => {
    try {
      const rows = await window.electronAPI.psGetAll(`SELECT * FROM restaurant_tables ORDER BY table_number`);
      return camelizeRows(rows);
    } catch (err) { console.error('Failed to fetch local tables:', err); throw err; }
  }, []);

  // Was `warehouseAPI.getLowStock()` — direct 1:1 port, no joins in the real route.
  const fetchLocalLowStock = useCallback(async () => {
    try {
      const rows = await window.electronAPI.psGetAll(`
        SELECT id, name, unit, quantity_in_stock, min_stock_level, cost_per_unit
        FROM warehouse_items
        WHERE quantity_in_stock <= min_stock_level
        ORDER BY quantity_in_stock ASC
      `);
      return camelizeRows(rows);
    } catch (err) { console.error('Failed to fetch local low stock:', err); throw err; }
  }, []);

  // Was `warehouseAPI.getAll()` — supplier join + batches N+1 sub-fetch both dead weight here.
  const fetchLocalWarehouseItems = useCallback(async () => {
    try {
      const rows = await window.electronAPI.psGetAll(`SELECT * FROM warehouse_items ORDER BY name`);
      return camelizeRows(rows);
    } catch (err) { console.error('Failed to fetch local warehouse items:', err); throw err; }
  }, []);

  // Was `warehouseAPI.getMovements({from,to})` — unlike Inventory's own fetchMovements (which
  // never filters by date), this screen's call site always passes today's range, so the real
  // route's `sm.created_at::date >= from AND <= to` filter had to be replicated, not dropped.
  // `wi.cost_per_unit` join kept (faithful to the real route, which reads the item's CURRENT
  // cost, not the movement's own point-in-time `sm.cost_per_unit`); `recorded_by` join dropped
  // as dead weight (grepped clean).
  const fetchLocalMovements = useCallback(async (from, to) => {
    try {
      const rows = await window.electronAPI.psGetAll(`
        SELECT sm.id, sm.type, sm.quantity, sm.reason, sm.created_at,
               wi.id AS item_id, wi.name AS item_name, wi.unit, wi.cost_per_unit
        FROM stock_movements sm
        JOIN warehouse_items wi ON sm.item_id = wi.id
        WHERE date(sm.created_at) >= date(?) AND date(sm.created_at) <= date(?)
        ORDER BY sm.created_at DESC
        LIMIT 500
      `, [from, to]);
      return camelizeRows(rows);
    } catch (err) { console.error('Failed to fetch local warehouse movements:', err); throw err; }
  }, []);

  // Was `procurementAPI.getDeliveriesDebt()` — reused verbatim from InventoryScreen.jsx's
  // already-verified local aggregate (plain SUM/COUNT, no joins).
  const fetchLocalDeliveriesDebt = useCallback(async () => {
    try {
      const row = await window.electronAPI.psGet(`
        SELECT COALESCE(SUM(total), 0) AS total_debt, COUNT(*) AS count
        FROM supplier_deliveries
        WHERE payment_status != 'paid' AND status IN ('Delivered', 'Partial')
      `);
      return row ? camelizeRow(row) : { totalDebt: 0, count: 0 };
    } catch (err) { console.error('Failed to fetch local deliveries debt:', err); throw err; }
  }, []);

  // Was `procurementAPI.getDeliveries()` (the debt-fallback path) — reused verbatim from
  // InventoryScreen.jsx's already-verified local query (item_count join dropped as dead weight).
  const fetchLocalDeliveries = useCallback(async () => {
    try {
      const rows = await window.electronAPI.psGetAll(`SELECT * FROM supplier_deliveries ORDER BY timestamp DESC, created_at DESC`);
      return camelizeRows(rows);
    } catch (err) { console.error('Failed to fetch local deliveries:', err); throw err; }
  }, []);

  // Was `staffPaymentsAPI.getAll({from,to})` — reused verbatim from StaffScreen.jsx's
  // already-verified local query (staff_name join dropped as dead weight).
  const fetchLocalStaffPayments = useCallback(async (from, to) => {
    try {
      let sql = `SELECT * FROM staff_payments`;
      const conditions = [];
      const params = [];
      if (from) { conditions.push(`payment_date >= ?`); params.push(from); }
      if (to)   { conditions.push(`payment_date <= ?`); params.push(to); }
      if (conditions.length) sql += ` WHERE ` + conditions.join(' AND ');
      sql += ` ORDER BY payment_date DESC, created_at DESC`;
      const rows = await window.electronAPI.psGetAll(sql, params);
      return camelizeRows(rows);
    } catch (err) { console.error('Failed to fetch local staff payments:', err); throw err; }
  }, []);

  // Was `loansAPI.getStats()` — `CASE WHEN` used instead of Postgres's `FILTER (WHERE ...)`
  // for portability across SQLite builds; same active/paid/overdue counts+totals, one query,
  // no joins, no app-side post-processing.
  const fetchLocalLoanStats = useCallback(async () => {
    try {
      const row = await window.electronAPI.psGet(`
        SELECT
          SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) AS active_count,
          COALESCE(SUM(CASE WHEN status='active' THEN amount ELSE 0 END), 0) AS active_total,
          SUM(CASE WHEN status='paid' THEN 1 ELSE 0 END) AS paid_count,
          COALESCE(SUM(CASE WHEN status='paid' THEN amount ELSE 0 END), 0) AS paid_total,
          SUM(CASE WHEN status='active' AND due_date < date('now') THEN 1 ELSE 0 END) AS overdue_count,
          COALESCE(SUM(CASE WHEN status='active' AND due_date < date('now') THEN amount ELSE 0 END), 0) AS overdue_total
        FROM loans
      `);
      return row ? camelizeRow(row) : null;
    } catch (err) { console.error('Failed to fetch local loan stats:', err); throw err; }
  }, []);

  // Was `notificationsAPI.getAll()` — matches the real route's own `WHERE user_id=$1 ... LIMIT
  // 50` exactly (it already scopes to the logged-in user, no restaurant_id filter needed
  // locally per the standing rule). Needs the current user's id, hence the new `user` prop.
  const fetchLocalNotifications = useCallback(async () => {
    try {
      if (!user?.id) return [];
      const rows = await window.electronAPI.psGetAll(`
        SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50
      `, [user.id]);
      return camelizeRows(rows);
    } catch (err) { console.error('Failed to fetch local notifications:', err); throw err; }
  }, [user?.id]);

  // Was `reportsAPI.getBestSellers({from,to})` — GROUP BY/SUM/ORDER BY DESC/LIMIT 20, a
  // faithful top-N aggregate with zero app-side post-processing on the backend (categories
  // join kept only for the real route's own grouping key, not displayed).
  const fetchLocalBestSellers = useCallback(async (from, to) => {
    try {
      const rows = await window.electronAPI.psGetAll(`
        SELECT m.name AS name, SUM(oi.quantity) AS total_sold,
               ROUND(SUM(oi.quantity * oi.unit_price), 2) AS total_revenue
        FROM order_items oi
        JOIN menu_items m ON oi.menu_item_id = m.id
        LEFT JOIN categories c ON m.category_id = c.id
        JOIN orders o ON oi.order_id = o.id
        WHERE o.status = 'paid' AND date(o.paid_at) >= date(?) AND date(o.paid_at) <= date(?)
        GROUP BY m.name, c.name
        ORDER BY total_sold DESC
        LIMIT 20
      `, [from, to]);
      return camelizeRows(rows);
    } catch (err) { console.error('Failed to fetch local best sellers:', err); throw err; }
  }, []);

  // Was `ordersAPI.getAll({from,to})` (feeds `activeOrders`) — only `.status`/`.orderType` are
  // ever read off an order row on this screen (grepped clean), so the real route's massive join
  // set (tables/users×2/item-count/loans LATERAL) is entirely dead weight — not replicated.
  const fetchLocalOrdersToday = useCallback(async (from, to) => {
    try {
      const rows = await window.electronAPI.psGetAll(`
        SELECT status, order_type FROM orders WHERE created_at >= ? AND created_at <= ?
      `, [from, to]);
      return camelizeRows(rows);
    } catch (err) { console.error('Failed to fetch local orders:', err); throw err; }
  }, []);

  // Fetch all dashboard data
  const fetchDashboardData = useCallback(async () => {
    try {
      const { from, to } = getTodayRange();
      const { from: monthFrom, to: monthTo } = getMonthRange();

      const results = await Promise.allSettled([
        reportsAPI.getAdminDailySummary(),            // 0 — stays REST, real business logic (see header comment)
        fetchLocalTables(),                            // 1 — was tablesAPI.getAll()
        fetchLocalLowStock(),                          // 2 — was warehouseAPI.getLowStock()
        fetchLocalOrdersToday(from, to),                // 3 — was ordersAPI.getAll({from,to}) — fetch ALL orders today, filter client-side
        shiftsAPI.getStaffStatus(),                    // 4 — stays REST, real business logic (see header comment)
        fetchLocalBestSellers(from, to),                // 5 — was reportsAPI.getBestSellers({from,to})
        shiftsAPI.getPayroll({ from: monthFrom, to: monthTo }),       // 6 — stays REST, real business logic (see header comment) — month-to-date payroll
        fetchLocalStaffPayments(monthFrom, monthTo),    // 7 — was staffPaymentsAPI.getAll({from,to}) — month-to-date payments
        fetchLocalLoanStats(),                          // 8 — was loansAPI.getStats()
        fetchLocalNotifications(),                      // 9 — was notificationsAPI.getAll()
        accountingAPI.getCashFlow({ from, to }),       // 10 — stays REST, cash_flow table not in local PowerSync schema (see header comment)
        fetchLocalWarehouseItems(),                     // 11 — was warehouseAPI.getAll()
        fetchLocalMovements(from, to),                   // 12 — was warehouseAPI.getMovements({from,to})
        reportsAPI.getDashboard(),                     // 13 — stays REST, redundant fallback-only (see header comment) — reliable revenue/orders fallback
        fetchLocalDeliveriesDebt(),                     // 14 — was procurementAPI.getDeliveriesDebt() — unpaid supplier debt from DB
      ]);

      // Handle summary (admin-daily-summary)
      if (results[0].status === 'fulfilled' && results[0].value) {
        setDashboardData(results[0].value);
      }

      // Handle simple dashboard (reliable revenue, orders, table counts)
      if (results[13]?.status === 'fulfilled' && results[13].value) {
        setSimpleDash(results[13].value);
      }

      // Handle supplier debt from DB — try dedicated endpoint, then fallback to full deliveries list
      let debtResolved = 0;
      if (results[14]?.status === 'fulfilled' && results[14].value) {
        const debtVal = results[14].value;
        // The interceptor camelizes keys, so totalDebt is the primary key
        debtResolved = parseFloat(debtVal.totalDebt ?? debtVal.total_debt ?? 0) || 0;
      }
      if (debtResolved === 0) {
        // Fallback: compute from full deliveries list (handles case where debt endpoint
        // returned 0 because data hadn't been synced yet from mobile app)
        try {
          const delivs = await fetchLocalDeliveries(); // was procurementAPI.getDeliveries()
          const arr = Array.isArray(delivs) ? delivs : [];
          debtResolved = arr
            .filter(d => {
              const ps = (d.paymentStatus || d.payment_status || '').toLowerCase();
              const st = d.status || '';
              return ps !== 'paid' && ['Delivered', 'Partial'].includes(st);
            })
            .reduce((s, d) => s + (parseFloat(d.total) || 0), 0);
        } catch (_) {}
      }
      setSupplierDebt(debtResolved);

      // Handle tables
      if (results[1].status === 'fulfilled' && Array.isArray(results[1].value)) {
        setTables(results[1].value);
      }

      // Handle low stock
      if (results[2].status === 'fulfilled' && Array.isArray(results[2].value)) {
        setLowStockItems(results[2].value);
      }

      // Handle active orders — filter out paid/cancelled client-side
      if (results[3].status === 'fulfilled' && Array.isArray(results[3].value)) {
        const active = results[3].value.filter(
          o => !['paid', 'cancelled'].includes((o.status || '').toLowerCase())
        );
        setActiveOrders(active);
      }

      // Handle staff status — filter to only currently clocked-in staff (present / late)
      if (results[4].status === 'fulfilled' && Array.isArray(results[4].value)) {
        const activeStaff = results[4].value.filter(
          s => s.clockIn && !s.clockOut && ['present', 'late'].includes((s.status || '').toLowerCase())
        );
        setStaffStatus(activeStaff);
      }

      // Handle best sellers
      if (results[5].status === 'fulfilled' && Array.isArray(results[5].value)) {
        setBestSellers(results[5].value);
      }

      // Handle payroll
      if (results[6].status === 'fulfilled' && results[6].value) {
        setPayrollData(results[6].value);
      }

      // Handle payments
      if (results[7].status === 'fulfilled' && Array.isArray(results[7].value)) {
        setPaymentsData(results[7].value);
      }

      // Handle loans
      if (results[8].status === 'fulfilled' && results[8].value) {
        setLoansData(results[8].value);
      }

      // Handle notifications
      if (results[9].status === 'fulfilled' && Array.isArray(results[9].value)) {
        setNotifications(results[9].value);
        const unread = results[9].value.filter((n) => !n.isRead).length;
        setUnreadCount(unread);
      }

      // Handle cash flow
      if (results[10].status === 'fulfilled' && results[10].value) {
        const entries = results[10].value.entries || results[10].value || [];
        const arr = Array.isArray(entries) ? entries : [];
        const inflow = arr.filter(e => e.type === 'in').reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
        const outflow = arr.filter(e => e.type === 'out').reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
        setCashFlowData({ inflow, outflow, entries: arr });
      }

      // Handle all warehouse items
      if (results[11].status === 'fulfilled' && Array.isArray(results[11].value)) {
        setAllWarehouseItems(results[11].value);
      }

      // Handle warehouse movements
      if (results[12].status === 'fulfilled' && Array.isArray(results[12].value)) {
        setWarehouseMovements(results[12].value);
      }

      setCurrentDate(new Date());
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    // fetchLocalNotifications is the only one of the new local-read helpers that closes over a
    // prop (`user`) rather than being a stable module-level reference like the REST calls it
    // replaced — listed explicitly so this callback doesn't capture a stale user id.
  }, [fetchLocalTables, fetchLocalLowStock, fetchLocalOrdersToday, fetchLocalBestSellers,
      fetchLocalStaffPayments, fetchLocalLoanStats, fetchLocalNotifications,
      fetchLocalWarehouseItems, fetchLocalMovements, fetchLocalDeliveriesDebt, fetchLocalDeliveries]);

  // Initial fetch
  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Auto-refresh every 15 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setRefreshing(true);
      fetchDashboardData();
    }, 15000);

    return () => clearInterval(interval);
  }, [fetchDashboardData]);

  // Format date
  const formatDate = (date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  // Format elapsed time
  const formatElapsedTime = (startTime) => {
    if (!startTime) return t('common.noData');
    const elapsed = Math.floor((new Date() - new Date(startTime)) / 60000);
    if (elapsed < 1) return t('time.justNow');
    if (elapsed < 60) return t('time.minAgo', { count: elapsed });
    const hours = Math.floor(elapsed / 60);
    return t('time.hoursAgo', { h: hours, m: elapsed % 60 });
  };

  // Get role badge color
  const getRoleBadgeColor = (role) => {
    switch (role?.toLowerCase()) {
      case 'waitress':
        return 'bg-green-100 text-green-800';
      case 'kitchen':
        return 'bg-orange-100 text-orange-800';
      case 'cashier':
        return 'bg-cyan-100 text-cyan-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Get table status color
  const getTableStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'free':
      case 'available':
        return 'bg-green-500 hover:bg-green-600';
      case 'occupied':
        return 'bg-red-500 hover:bg-red-600';
      case 'reserved':
        return 'bg-blue-500 hover:bg-blue-600';
      case 'cleaning':
        return 'bg-gray-500 hover:bg-gray-600';
      default:
        return 'bg-gray-400 hover:bg-gray-500';
    }
  };

  // Calculate table occupancy
  const tableStats = {
    free: tables.filter((t) => t.status?.toLowerCase() === 'free' || t.status?.toLowerCase() === 'available').length,
    occupied: tables.filter((t) => t.status?.toLowerCase() === 'occupied').length,
    reserved: tables.filter((t) => t.status?.toLowerCase() === 'reserved').length,
    cleaning: tables.filter((t) => t.status?.toLowerCase() === 'cleaning').length,
  };

  // Financial Flow — use admin-daily-summary data (same source as the app)
  // financialFlow.inflow is an array of {paymentMethod, amount} rows (today's paid orders by method)
  const todayInflow = (() => {
    const rows = dashboardData?.financialFlow?.inflow;
    if (Array.isArray(rows) && rows.length > 0)
      return rows.reduce((s, r) => s + parseFloat(r.amount || 0), 0);
    // fallback: simpleDash todayRevenue (from /reports/dashboard)
    return simpleDash?.todayRevenue || 0;
  })();
  // Outflow = expenses + staff payments + delivery payments (from summary) + goods consumed (inventory cost)
  const todayOutflow = (dashboardData?.financialFlow?.outflow || 0);
  const outflowBreakdown = dashboardData?.financialFlow?.outflowBreakdown;
  const deliveryPaymentsToday = outflowBreakdown?.deliveryPayments || 0;
  const salariesToday = outflowBreakdown?.salaries || 0;
  const expensesOnly = outflowBreakdown?.expenses || 0;

  // Employee payroll — backend returns array of rows with grossPay (from gross_pay column)
  const monthGrossPay = Array.isArray(payrollData)
    ? payrollData.reduce((s, r) => s + parseFloat(r.grossPay || r.gross_pay || 0), 0)
    : (payrollData?.totalGross || payrollData?.totalOwed || 0);
  const totalPaymentsMade = Array.isArray(paymentsData)
    ? paymentsData.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0)
    : 0;
  const payrollOwed = Math.max(0, monthGrossPay - totalPaymentsMade);

  // Calculate debts & payables
  const calculateDebtsPayables = () => {
    return {
      employeePayrollOwed: payrollOwed,
      customerLoansOutstanding: loansData?.totalOutstanding || loansData?.activeTotal || 0,
      supplierDebt: supplierDebt,
    };
  };

  const debtsPayables = calculateDebtsPayables();

  // Active orders breakdown by type
  const orderBreakdown = {
    dineIn: activeOrders.filter(o => (o.orderType || o.type || '').toLowerCase().replace('-','_') === 'dine_in').length,
    toGo: activeOrders.filter(o => (o.orderType || o.type || '').toLowerCase().replace('-','_') === 'to_go').length,
    delivery: activeOrders.filter(o => (o.orderType || o.type || '').toLowerCase() === 'delivery').length,
  };

  // Warehouse today stats — prefer values from admin-daily-summary (correct DB queries)
  // Fallback to local calculation with corrected field names (quantityInStock after camelization)
  const warehouseTotalValue =
    dashboardData?.warehouse?.currentStatus?.totalValue ??
    allWarehouseItems.reduce((s, i) => {
      return s + (parseFloat(i.quantityInStock || i.quantity || 0) * parseFloat(i.costPerUnit || 0));
    }, 0);
  const warehouseGoodsArrived =
    dashboardData?.warehouse?.goodsArrived ??
    warehouseMovements
      .filter(m => ['in', 'receive'].includes((m.movementType || m.type || '').toLowerCase()))
      .reduce((s, m) => s + (parseFloat(m.totalCost || 0) || parseFloat(m.quantity || 0) * parseFloat(m.costPerUnit || 0)), 0);
  const warehouseGoodsConsumed =
    dashboardData?.warehouse?.goodsConsumed ??
    warehouseMovements
      .filter(m => ['out', 'waste', 'consume'].includes((m.movementType || m.type || '').toLowerCase()))
      .reduce((s, m) => s + (parseFloat(m.totalCost || 0) || parseFloat(m.quantity || 0) * parseFloat(m.costPerUnit || 0)), 0);

  // Total outflow = cash expenses/staff payments + inventory goods consumed (matches app logic)
  const totalOutflow = todayOutflow + warehouseGoodsConsumed;

  // Mark notification as read
  const handleMarkNotificationRead = (id) => {
    notificationsAPI.markRead(id).catch((err) => console.error('Failed to mark notification read:', err));
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
    setUnreadCount(Math.max(0, unreadCount - 1));
  };

  // Mark all notifications as read
  const handleMarkAllRead = () => {
    notificationsAPI.markAllRead().catch((err) => console.error('Failed to mark all read:', err));
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setNotificationsRead(true);
    setUnreadCount(0);
  };

  // Loading skeleton
  const SkeletonCard = () => (
    <div className="bg-white rounded-lg shadow p-6 animate-pulse">
      <div className="h-4 bg-gray-200 rounded w-24 mb-2"></div>
      <div className="h-8 bg-gray-200 rounded w-32"></div>
    </div>
  );

  if (loading) {
    return (
      <div className="h-full overflow-auto bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <div className="h-8 bg-gray-200 rounded w-64 animate-pulse"></div>
          </div>
          <div className="grid grid-cols-6 gap-4 mb-8">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
          <div className="grid grid-cols-3 gap-8">
            <div className="col-span-2">
              <div className="bg-white rounded-lg shadow p-6 h-96 animate-pulse"></div>
            </div>
            <div>
              <div className="bg-white rounded-lg shadow p-6 h-96 animate-pulse"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-blue-600 rounded-lg p-2">
                <LayoutDashboard className="text-white" size={24} />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{t('admin.dashboard.title')}</h1>
                <p className="text-sm text-gray-500">{formatDate(currentDate)}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => {
                  setRefreshing(true);
                  fetchDashboardData();
                }}
                disabled={refreshing}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-all"
              >
                <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
                <span className="text-sm font-medium">{t('common.refresh')}</span>
              </button>

              {/* Notifications Bell */}
              <div className="relative">
                <button
                  onClick={() => setShowNotifications(!showNotifications)}
                  className="relative p-2 text-gray-600 hover:text-blue-600 transition-colors"
                >
                  <Bell size={20} />
                  {unreadCount > 0 && (
                    <span className="absolute top-0 right-0 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white transform translate-x-1/2 -translate-y-1/2 bg-red-600 rounded-full">
                      {unreadCount}
                    </span>
                  )}
                </button>

                {/* Notifications Panel */}
                {showNotifications && (
                  <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-xl z-50 border border-gray-200">
                    <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                      <h3 className="font-semibold text-gray-900">{t('admin.dashboard.notifications')}</h3>
                      <button
                        onClick={() => setShowNotifications(false)}
                        className="p-1 hover:bg-gray-100 rounded"
                      >
                        <X size={18} />
                      </button>
                    </div>
                    <div className="max-h-96 overflow-y-auto">
                      {Array.isArray(notifications) && notifications.length > 0 ? (
                        <>
                          {notifications.map((notif) => (
                            <div
                              key={notif.id}
                              className={`px-4 py-3 border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors ${
                                !notif.isRead ? 'bg-blue-50' : ''
                              }`}
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <p className="text-sm font-medium text-gray-900">{notif.title || t('common.notification', 'Notification')}</p>
                                  <p className="text-xs text-gray-600 mt-1">{notif.message || ''}</p>
                                  <p className="text-xs text-gray-400 mt-1">
                                    {formatElapsedTime(notif.createdAt)}
                                  </p>
                                </div>
                                {!notif.isRead && (
                                  <button
                                    onClick={() => handleMarkNotificationRead(notif.id)}
                                    className="ml-2 p-1 hover:bg-white rounded"
                                  >
                                    <CheckCircle size={16} className="text-green-600" />
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </>
                      ) : (
                        <div className="px-4 py-8 text-center">
                          <p className="text-sm text-gray-500">{t('admin.dashboard.noNotifications')}</p>
                        </div>
                      )}
                    </div>
                    {Array.isArray(notifications) && notifications.length > 0 && (
                      <div className="px-4 py-2 border-t border-gray-200 bg-gray-50">
                        <button
                          onClick={handleMarkAllRead}
                          className="text-xs font-medium text-blue-600 hover:text-blue-700"
                        >
                          {t('admin.dashboard.markAllRead')}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 py-8">

        {/* Row 1: Quick Actions — horizontal stretched */}
        <div className="bg-white rounded-lg shadow p-4 mb-8">
          <div className="grid grid-cols-6 gap-3">
            <button
              onClick={() => navigate('/admin/orders')}
              className="flex items-center justify-center gap-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg py-2.5 px-4 font-medium text-sm transition-colors w-full"
            >
              <ShoppingCart size={16} />
              {t('nav.orders')}
            </button>
            <button
              onClick={() => navigate('/admin/inventory')}
              className="flex items-center justify-center gap-2 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg py-2.5 px-4 font-medium text-sm transition-colors w-full"
            >
              <Package size={16} />
              {t('nav.inventory')}
            </button>
            <button
              onClick={() => navigate('/admin/staff')}
              className="flex items-center justify-center gap-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg py-2.5 px-4 font-medium text-sm transition-colors w-full"
            >
              <Users size={16} />
              {t('nav.staff')}
            </button>
            <button
              onClick={() => navigate('/admin/tables')}
              className="flex items-center justify-center gap-2 bg-orange-50 hover:bg-orange-100 text-orange-700 rounded-lg py-2.5 px-4 font-medium text-sm transition-colors w-full"
            >
              <Grid3X3 size={16} />
              {t('nav.tables')}
            </button>
            <button
              onClick={() => navigate('/admin/menu')}
              className="flex items-center justify-center gap-2 bg-green-50 hover:bg-green-100 text-green-700 rounded-lg py-2.5 px-4 font-medium text-sm transition-colors w-full"
            >
              <Utensils size={16} />
              {t('nav.menu')}
            </button>
            <button
              onClick={() => navigate('/admin/profile')}
              className="flex items-center justify-center gap-2 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg py-2.5 px-4 font-medium text-sm transition-colors w-full"
            >
              <User size={16} />
              {t('nav.profile')}
            </button>
          </div>
        </div>

        {/* Row 2: KPI Cards */}
        <div className="grid grid-cols-6 gap-4 mb-8">
          {/* Today's Revenue */}
          <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-gray-600">{t('admin.dashboard.todaysRevenue')}</span>
              <div className="bg-blue-100 rounded-lg p-2">
                <DollarSign size={20} className="text-blue-600" />
              </div>
            </div>
            <div className="text-2xl font-bold text-gray-900">{money(simpleDash?.todayRevenue || dashboardData?.salesOverview || 0)}</div>
            <p className="text-xs text-gray-500 mt-2">{t('admin.dashboard.totalSalesToday')}</p>
          </div>

          {/* Today's Orders */}
          <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-gray-600">{t('admin.dashboard.todaysOrders')}</span>
              <div className="bg-green-100 rounded-lg p-2">
                <ShoppingCart size={20} className="text-green-600" />
              </div>
            </div>
            <div className="text-2xl font-bold text-gray-900">{simpleDash?.todayOrders || dashboardData?.todayOrders || 0}</div>
            <p className="text-xs text-gray-500 mt-2">{t('admin.dashboard.ordersPlaced')}</p>
          </div>

          {/* Active Orders */}
          <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-gray-600">{t('admin.dashboard.activeOrders')}</span>
              <div className="bg-purple-100 rounded-lg p-2">
                <Clock size={20} className="text-purple-600" />
              </div>
            </div>
            <div className="text-2xl font-bold text-gray-900">{simpleDash?.activeOrders ?? dashboardData?.totalActiveOrders ?? activeOrders.length}</div>
            <p className="text-xs text-gray-500 mt-2">{t('admin.dashboard.beingPrepared')}</p>
          </div>

          {/* Table Occupancy */}
          <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-gray-600">{t('admin.dashboard.tableOccupancy')}</span>
              <div className="bg-orange-100 rounded-lg p-2">
                <Grid3X3 size={20} className="text-orange-600" />
              </div>
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {tableStats.occupied}/{tables.length || 0}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {tables.length > 0
                ? t('admin.dashboard.percentOccupied', { percent: Math.round((tableStats.occupied / tables.length) * 100) })
                : t('common.noData')}
            </p>
          </div>

          {/* Staff On Shift */}
          <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-gray-600">{t('admin.dashboard.staffOnShift')}</span>
              <div className="bg-indigo-100 rounded-lg p-2">
                <Users size={20} className="text-indigo-600" />
              </div>
            </div>
            <div className="text-2xl font-bold text-gray-900">{staffStatus.length || 0}</div>
            <p className="text-xs text-gray-500 mt-2">{t('admin.dashboard.teamMembers')}</p>
          </div>

          {/* Low Stock Alerts */}
          <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-gray-600">{t('admin.dashboard.lowStock')}</span>
              <div className="bg-red-100 rounded-lg p-2">
                <AlertTriangle size={20} className="text-red-600" />
              </div>
            </div>
            <div className="text-2xl font-bold text-gray-900">{lowStockItems.length || 0}</div>
            <p className="text-xs text-gray-500 mt-2">{t('admin.dashboard.itemsBelowThreshold')}</p>
          </div>
        </div>

        {/* Table Status Grid */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('admin.dashboard.tableStatus')}</h2>
          <div className="mb-4 flex gap-6 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-green-500 rounded"></div>
              <span className="text-gray-600">{t('statuses.free')}: {tableStats.free}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-red-500 rounded"></div>
              <span className="text-gray-600">{t('statuses.occupied')}: {tableStats.occupied}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-blue-500 rounded"></div>
              <span className="text-gray-600">{t('statuses.reserved')}: {tableStats.reserved}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-gray-500 rounded"></div>
              <span className="text-gray-600">{t('statuses.cleaning')}: {tableStats.cleaning}</span>
            </div>
          </div>
          <div className="grid grid-cols-12 gap-2">
            {Array.isArray(tables) && tables.length > 0 ? (
              tables.map((table) => (
                <button
                  key={table.id}
                  className={`p-3 rounded-lg text-white font-semibold text-sm transition-all ${getTableStatusColor(
                    table.status
                  )}`}
                >
                  {table.tableNumber || table.number || 'T'}
                </button>
              ))
            ) : (
              <p className="text-gray-500">{t('admin.dashboard.noTablesAvailable')}</p>
            )}
          </div>
        </div>

        {/* Row 4: Active Orders Breakdown + Financial Flow + Debts & Payables (3 equal cols) */}
        <div className="grid grid-cols-3 gap-8 mb-8">
          {/* Active Orders Breakdown */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingCart size={20} className="text-blue-600" />
                <h2 className="text-lg font-semibold text-gray-900">{t('admin.dashboard.activeOrdersBreakdown')}</h2>
              </div>
              <span className="text-sm text-gray-500">{activeOrders.length} {t('common.total').toLowerCase()}</span>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-100 rounded-lg p-2"><Utensils size={18} className="text-blue-600" /></div>
                  <span className="text-sm font-medium text-gray-700">{t('orderTypes.dineIn')}</span>
                </div>
                <span className="text-2xl font-bold text-blue-600">{orderBreakdown.dineIn}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="bg-orange-100 rounded-lg p-2"><ShoppingBag size={18} className="text-orange-600" /></div>
                  <span className="text-sm font-medium text-gray-700">{t('orderTypes.toGo')}</span>
                </div>
                <span className="text-2xl font-bold text-orange-600">{orderBreakdown.toGo}</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <div className="flex items-center gap-3">
                  <div className="bg-green-100 rounded-lg p-2"><Truck size={18} className="text-green-600" /></div>
                  <span className="text-sm font-medium text-gray-700">{t('orderTypes.delivery')}</span>
                </div>
                <span className="text-2xl font-bold text-green-600">{orderBreakdown.delivery}</span>
              </div>
            </div>
          </div>

          {/* Financial Flow Today */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <DollarSign size={20} className="text-blue-600" />
                <h2 className="text-lg font-semibold text-gray-900">{t('admin.dashboard.financialFlowToday')}</h2>
              </div>
              <span className={`text-sm font-semibold ${todayInflow - totalOutflow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {todayInflow - totalOutflow >= 0 ? '+' : ''}{money(todayInflow - totalOutflow)} {t('common.net').toLowerCase()}
              </span>
            </div>
            <div className="p-6 space-y-4">
              <div className="border-l-4 border-green-500 pl-4 py-2">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp size={16} className="text-green-600" />
                  <span className="text-sm text-gray-600">{t('admin.dashboard.cashInflow')}</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">{money(todayInflow)}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {todayInflow === 0 ? t('admin.dashboard.noPaymentsYet') : `${(dashboardData?.financialFlow?.inflow || []).length} ${t('admin.dashboard.paymentMethods')}`}
                </p>
              </div>
              <div className="border-l-4 border-red-500 pl-4 py-2">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingDown size={16} className="text-red-600" />
                  <span className="text-sm text-gray-600">{t('admin.dashboard.outflow')}</span>
                </div>
                <p className="text-2xl font-bold text-red-600">{money(totalOutflow)}</p>
                {totalOutflow === 0 ? (
                  <p className="text-xs text-gray-400 mt-1">{t('admin.dashboard.noOutflowYet')}</p>
                ) : (
                  <div className="text-xs text-gray-500 mt-1 space-y-0.5">
                    {expensesOnly > 0 && <div className="flex justify-between"><span>{t('admin.dashboard.expenses')}</span><span className="text-red-600 font-medium">{money(expensesOnly)}</span></div>}
                    {salariesToday > 0 && <div className="flex justify-between"><span>{t('admin.dashboard.salaries')}</span><span className="text-red-600 font-medium">{money(salariesToday)}</span></div>}
                    {deliveryPaymentsToday > 0 && <div className="flex justify-between"><span>{t('admin.dashboard.supplierPayments')}</span><span className="text-red-600 font-medium">{money(deliveryPaymentsToday)}</span></div>}
                    {warehouseGoodsConsumed > 0 && <div className="flex justify-between"><span>{t('admin.dashboard.inventory')}</span><span className="text-red-600 font-medium">{money(warehouseGoodsConsumed)}</span></div>}
                  </div>
                )}
              </div>
              <div className="border-t border-gray-200 pt-3 flex items-center justify-between">
                <span className="text-sm text-gray-600 font-medium">{t('common.net')}</span>
                <span className={`text-lg font-bold ${todayInflow - totalOutflow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {todayInflow - totalOutflow >= 0 ? '+' : ''}{money(todayInflow - totalOutflow)}
                </span>
              </div>
            </div>
          </div>

          {/* Debts & Payables */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Briefcase size={20} className="text-blue-600" />
                <h2 className="text-lg font-semibold text-gray-900">{t('admin.dashboard.debtsPayables')}</h2>
              </div>
              <span className="text-sm text-gray-500">{t('admin.dashboard.thisMonth')}</span>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 font-medium">{t('admin.dashboard.employeePayrollOwed')}</p>
                  <p className="text-xs text-gray-400">{t('admin.dashboard.earned')} {money(monthGrossPay)} · {t('admin.dashboard.paidAmount')} {money(totalPaymentsMade)}</p>
                </div>
                <p className="text-xl font-bold text-red-500">{money(debtsPayables.employeePayrollOwed)}</p>
              </div>
              <div className="border-t border-gray-200 pt-3 flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 font-medium">{t('admin.dashboard.supplierDebt')}</p>
                  <p className="text-xs text-gray-400">{t('admin.dashboard.unpaidDeliveredGoods')}</p>
                </div>
                <p className="text-xl font-bold text-red-500">{money(debtsPayables.supplierDebt)}</p>
              </div>
              <div className="border-t border-gray-200 pt-3 flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 font-medium">{t('admin.dashboard.customerOutstandingLoans')}</p>
                  <p className="text-xs text-gray-400">{loansData?.activeCount || 0} {t('admin.dashboard.activeLoans')}</p>
                </div>
                <p className={`text-xl font-bold ${debtsPayables.customerLoansOutstanding > 0 ? 'text-orange-500' : 'text-gray-400'}`}>
                  {debtsPayables.customerLoansOutstanding > 0 ? money(debtsPayables.customerLoansOutstanding) : t('admin.dashboard.noneLabel')}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Row 5: Low Stock Alerts + Warehouse Today */}
        <div className="grid grid-cols-3 gap-8 mb-8 items-start">
          {/* Low Stock Alerts */}
          <div className="col-span-2 h-full">
            <div className="bg-white rounded-lg shadow overflow-hidden h-full flex flex-col">
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={20} className="text-red-600" />
                  <h2 className="text-lg font-semibold text-gray-900">{t('admin.dashboard.lowStockAlerts')}</h2>
                </div>
                <button
                  onClick={() => setExpandedLowStock(!expandedLowStock)}
                  className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                >
                  {expandedLowStock ? t('admin.dashboard.collapse') : t('admin.dashboard.expand')}
                </button>
              </div>
              <div className="p-6 flex-1">
                {Array.isArray(lowStockItems) && lowStockItems.length > 0 ? (
                  <div className="space-y-3">
                    {(expandedLowStock ? lowStockItems : lowStockItems.slice(0, 5)).map((item) => (
                      <div key={item.id} className="bg-red-50 border border-red-200 rounded-lg p-4">
                        <div className="flex items-start gap-3">
                          <div className="bg-red-100 rounded-lg p-1.5 flex-shrink-0">
                            <Package size={16} className="text-red-600" />
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-900">{item.name || t('common.unknownItem', 'Unknown Item')}</p>
                            <div className="flex items-center justify-between mt-2">
                              <span className="text-xs text-red-600 font-semibold">{item.quantityInStock ?? item.quantity ?? 0} {t('admin.dashboard.left')}</span>
                              <span className="text-xs text-red-500">{t('admin.dashboard.min')}: {item.minStockLevel ?? item.minThreshold ?? t('common.noData')}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    {!expandedLowStock && lowStockItems.length > 5 && (
                      <p className="text-xs text-gray-500 text-center">{t('admin.dashboard.moreItems', { count: lowStockItems.length - 5 })}</p>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full">
                    <Package size={32} className="text-gray-300 mb-2" />
                    <p className="text-sm text-gray-500">{t('admin.dashboard.allItemsWellStocked')}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Warehouse Today */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Archive size={20} className="text-blue-600" />
                <h2 className="text-lg font-semibold text-gray-900">{t('admin.dashboard.warehouseToday')}</h2>
              </div>
              <span className="text-sm text-gray-500">{allWarehouseItems.length || 0} {t('admin.dashboard.itemsInStock')}</span>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-green-50 rounded-lg p-4 text-center">
                  <Archive size={24} className="text-green-600 mx-auto mb-2" />
                  <p className="text-xl font-bold text-green-600">{money(warehouseGoodsArrived)}</p>
                  <p className="text-xs text-gray-500 mt-1">{t('admin.dashboard.goodsArrived')}</p>
                </div>
                <div className="bg-orange-50 rounded-lg p-4 text-center">
                  <Flame size={24} className="text-orange-500 mx-auto mb-2" />
                  <p className="text-xl font-bold text-orange-500">{money(warehouseGoodsConsumed)}</p>
                  <p className="text-xs text-gray-500 mt-1">{t('admin.dashboard.goodsConsumed')}</p>
                </div>
              </div>
              <div className="border-t border-gray-200 pt-3 flex items-center justify-between">
                <span className="text-sm text-gray-500">{t('admin.dashboard.totalStockValue')}</span>
                <span className="text-sm font-bold text-gray-900">{money(warehouseTotalValue)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Row 6: Staff On Shift + Top Sellers */}
        <div className="grid grid-cols-3 gap-8 mb-8">
          {/* Staff On Shift */}
          <div className="col-span-2">
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-2">
                <Users size={20} className="text-blue-600" />
                <h2 className="text-lg font-semibold text-gray-900">{t('admin.dashboard.staffOnShiftSection')}</h2>
              </div>
              <div className="p-6">
                {Array.isArray(staffStatus) && staffStatus.length > 0 ? (
                  <div className="space-y-3">
                    {staffStatus.map((staff) => (
                      // `staff.id` doesn't exist — the backend route (GET /shifts/admin/staff-status)
                      // only returns `user_id`/`shift_id` (aliased to dodge an ambiguous-column error
                      // from its join), camelized to `userId`/`shiftId` by the REST client. `staff.id`
                      // was always `undefined` for every row, which is what triggered React's
                      // "each child in a list should have a unique key" warning — every row shared the
                      // same undefined key. `userId` is unique per row (one row per staff member).
                      <div key={staff.userId} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                              <User size={20} className="text-gray-600" />
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">{staff.name || t('common.noData')}</p>
                              <p className="text-xs text-gray-600">{staff.role || t('common.na', 'N/A')}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${getRoleBadgeColor(staff.role)} mb-1`}>
                              {staff.role || t('roles.staff', 'Staff')}
                            </span>
                            <p className="text-sm font-semibold text-gray-900">{staff.hoursWorkedToday || 0}h {t('admin.dashboard.hWorked')}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Users size={40} className="text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500">{t('admin.dashboard.noStaffOnShift')}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Top Sellers */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-2">
              <TrendingUp size={20} className="text-blue-600" />
              <h2 className="text-lg font-semibold text-gray-900">{t('admin.dashboard.topSellers')}</h2>
            </div>
            <div className="p-6">
              {Array.isArray(bestSellers) && bestSellers.length > 0 ? (
                <div className="space-y-4">
                  {bestSellers.slice(0, 5).map((item, index) => {
                    const maxSales = Math.max(...bestSellers.map((i) => i.totalSold || i.quantity || i.sales || 0));
                    const quantity = item.totalSold || item.quantity || item.sales || 0;
                    const percentage = maxSales > 0 ? (quantity / maxSales) * 100 : 0;
                    return (
                      <div key={item.id || index}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-gray-900">{item.name || t('common.unknown', 'Unknown')}</span>
                          <span className="text-sm font-semibold text-blue-600">{quantity} {t('admin.dashboard.sold')}</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div className="bg-blue-600 h-2 rounded-full transition-all duration-300" style={{ width: `${percentage}%` }}></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8">
                  <TrendingUp size={32} className="text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-500">{t('admin.dashboard.noSalesData')}</p>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

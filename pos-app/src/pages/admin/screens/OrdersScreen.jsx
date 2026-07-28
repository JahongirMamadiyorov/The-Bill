import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from '../../../context/LanguageContext.jsx';
import { useApi, money, fmtDate } from '../../../hooks/useApi.js';
import { ordersAPI } from '../../../api/client.js';
import Dropdown from '../../../components/Dropdown.jsx';
import DatePicker from '../../../components/DatePicker.jsx';
import PhoneInput, { formatPhoneDisplay } from '../../../components/PhoneInput.jsx';
import { camelizeRow, camelizeRows } from '../../../lib/case.js';
import { ClipboardList, Check, X, AlertTriangle, Trash2, RefreshCw, Calendar, DollarSign, Grid3X3, User, CreditCard, Ban, Edit3, Plus, Minus, FileText } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Ported verbatim from website/src/pages/admin/AdminOrders.jsx (~2145 lines) —
// order list/filters (active/paid/cancelled tabs), order detail view, status
// changes, edit-in-modal, refunds/cancellation, and the Collect Payment modal
// (cash/card/QR/loan, discount, split-bill) — same design, same data, same
// computations ("no design/functional changes" rule for this whole Admin
// build), with the following adaptations:
//
// 1. `useNavigate()`/`useLocation()` (react-router) replaced with a
//    `navigate` prop (same pattern as every prior screen) plus two new props,
//    `openOrderId`/`clearOpenOrderId`, that together replace the website's
//    `useLocation().search` + `navigate(pathname, {replace:true})` handling
//    of `/admin/orders?open=<id>` (the deep link TablesScreen.jsx's "View
//    Full Order" button uses). pos-app has no react-router
//    useSearchParams()/URL query strings at all, so AdminShell.jsx's `goTo()`
//    adapter now parses a `?open=<id>` suffix off the path itself (it already
//    had to split on `?` to strip it for nav-key matching — see AdminShell's
//    own comment) and stores the id in a small piece of state, handed to
//    whichever screen is active as the `openOrderId` prop. This screen
//    consumes it in a `useEffect` below — fetch the order, open the detail
//    modal, then call `clearOpenOrderId()` so navigating away and back (or a
//    future re-render) doesn't reopen the same order a second time. Same
//    functional outcome as the website, just prop-based instead of
//    URL-based.
//
// 2. Imports adjusted for pos-app's file layout (screens/ is one level deeper
//    than website's pages/admin/) — ordersAPI/menuAPI/tablesAPI/usersAPI/
//    useApi/money/fmtDate/Dropdown/DatePicker/PhoneInput were already ported
//    and verified for Dashboard/Tables/Menu/Inventory, reused here unchanged
//    at the time of this initial port (2026-07-27). `menuAPI`/`tablesAPI`/
//    `usersAPI` were later dropped entirely by the 2026-07-28 local-
//    PowerSync conversion below, once their one remaining call site
//    (`fetchSupportData`) was converted — see that conversion's own note
//    further down for why. `accountingAPI` (source only imports it for
//    `getRestaurantSettings()`, used solely by the removed print flow — see
//    #4 below) is dropped, it has no other call site in this file.
//
// 3. The header's "+ New Order" button called `navigate('/admin/new-order')`
//    in the source — the website's standalone AdminNewOrder.jsx page (full
//    route, distinct from its `isModal` branch). That standalone branch was
//    never ported into pos-app: TablesScreen.jsx's port (task #23) only ever
//    renders `AdminNewOrder.jsx`'s modal branch as `NewOrderModal.jsx`, since
//    Tables is the only caller anywhere in this build and always passes
//    `isModal` — see that file's own header comment. Porting the standalone
//    page is out of scope for this task, so `/admin/new-order` doesn't exist
//    as a screen here; pointing this button at it would silently land on the
//    "coming in a later build step" placeholder. Redirected it to
//    `navigate('/admin/tables')` instead — the actual place a new order gets
//    created in this port (tap a free table → New Order modal). This is a
//    real, deliberate functional deviation (not a pure design tweak),
//    flagged here and in STATUS.md/SESSIONS.md rather than left silent.
//
// 4. Printing excluded per the standing rule for this whole Admin build.
//    Removed entirely (not stubbed as a disabled control, since none of it
//    is reachable UI beyond the one button below): the `usePrinter()` hook
//    import/call, the `restSettings` state + its `accountingAPI.
//    getRestaurantSettings()` effect (only existed to feed the receipt
//    header/footer text), the `fmtOrderNum()` helper (only existed to format
//    the printed order number), `handlePrintCheque()` (built the receipt
//    HTML and called `printReceipt()`), the `Printer` icon import, and the
//    "Print Receipt" button in the Collect Payment modal's action footer
//    (which now shows just Confirm Payment + Cancel). Grepped the whole
//    source file for "print"/"Print" first to confirm this was the complete
//    set — it was.
//
// 5. Checked for `window.prompt()`/`window.confirm()`/`window.alert()` (the
//    Inventory screen found two real `window.prompt()` calls that would have
//    silently broken — see InventoryScreen.jsx/MEMORY.md) — grepped this
//    source file and found zero matches of any of the three. Nothing to fix
//    here.
//
// 6. Dropped two lucide icon imports the source itself never actually
//    renders (`Clock`, `Filter`, `ChevronDown`, `Eye`, `Receipt` — confirmed
//    by checking every `<IconName` JSX usage plus dynamic `<Icon/>`
//    references like the payment-method grid's `Icon: Grid3X3`; those five
//    have zero render call sites anywhere in the source, dead imports left
//    over from earlier edits). Every icon actually used (`ClipboardList`,
//    `Check`, `X`, `AlertTriangle`, `Trash2`, `RefreshCw`, `Calendar`,
//    `DollarSign`, `Grid3X3`, `User`, `CreditCard`, `Ban`, `Edit3`, `Plus`,
//    `Minus`, `FileText`) confirmed present in the installed `lucide-react`
//    version by listing its `dist/esm/icons/` folder directly.
//
// ── 2026-07-28: reads converted to local PowerSync, fourth screen after
// Tables/Loans/Menu (task #31) — see TablesScreen.jsx's own header comment
// for the general pattern (psGetAll/psGet + camelizeRow/camelizeRows, no
// restaurant_id filter needed since the local DB is already scoped to one
// restaurant). This is the biggest/richest screen converted so far — every
// read verified against the real backend route file first
// (restaurant-app/backend/src/routes/orders.js), never assumed. Writes are
// completely untouched: `ordersAPI.updateStatus`/`delete`/`cancel`/`update`/
// `pay` (handleStatusChange, handleDelete, handleCancelOrder,
// saveEditedOrder, processPayment) all still call REST exactly as before —
// PowerSync's write queue is never used in this project. The `openOrderId`/
// `clearOpenOrderId` deep-link mechanism itself (adaptation #1 above) is also
// untouched — only the data FETCH it triggers was converted, same as the
// modal-refresh effect below it.
//
// Two reads converted, both non-trivial joins, plus one 3-source support
// read:
// 1. `fetchOrdersWithItems(statuses, {from,to})` — was
//    `ordersAPI.getAll({status, from, to, include_items:'true'})` (GET
//    /api/orders), backing fetchActiveOrders/fetchPaidOrders/
//    fetchCancelledOrders. The real route selects `o.*` plus
//    `t.table_number`/`t.name AS table_name` (restaurant_tables),
//    `u.name AS waitress_name` (users, via waitress_id), `c.name AS
//    collected_by_name` (users, via paid_by), `COALESCE(ic.cnt,0) AS
//    item_count` (a grouped order_items subquery), and — via `LEFT JOIN
//    LATERAL` — the latest `loans` row per order aliased to `loan_status`/
//    `loan_paid_at`/`loan_due_date`/`loan_customer_name`/
//    `loan_customer_phone`/`loan_amount`/`loan_notes`. Grepped this whole
//    file for every way an order row's fields get read (as opposed to the
//    unrelated `allTables`/`allWaitresses` lookups `getTableNumber`/
//    `getWaitressName` use) and found zero references to `table_number`,
//    `waitressName`/`waitress_name`, `collectedByName`/`collected_by_name`,
//    or `itemCount`/`item_count` off an order row — item counts are always
//    computed client-side from the `items` array instead. All four are
//    dropped as dead weight. `table_name` (t.name) IS replicated —
//    `paymentOrder.tableName`/`cancelTarget.tableName` both read it directly
//    off an order row. The `loan_*` flat columns ARE replicated too —
//    `order.loanStatus`/`loanCustomerName`/`loanCustomerPhone`/
//    `loanDueDate`/`loanAmount`/`loanNotes` are all read directly (Paid
//    Orders tab's loan badge, the detail modal's loan-borrower section).
//    SQLite has no `LATERAL` join; the "pick the latest loan row per order"
//    semantics are replicated with a `ROW_NUMBER() OVER (PARTITION BY
//    order_id ORDER BY created_at DESC)` window filtered to `rn=1` — same
//    result as the Postgres LATERAL's own `ORDER BY created_at DESC LIMIT 1`.
//    The route's optional filters this screen's three call sites actually
//    send (`status` always, `from`/`to` only for the Paid tab) are
//    replicated; the ones it never sends (`order_type`, `table_id`,
//    `paid_by`, `waitress_id`, and the waitress-role self-scoping branch,
//    which only applies to the `waitress` role, never `admin`) are not.
//    `include_items=true`'s own second batch query (`order_items LEFT JOIN
//    menu_items` for name/unit fallback) is replicated as a second query
//    keyed on the fetched order ids, same pattern as every prior screen's
//    item lookups. `orders`/`restaurant_tables`/`order_items`/`menu_items`/
//    `loans` are all fully synced tables.
// 2. `fetchOrderDetail(orderId)` — was `ordersAPI.getById(id)` (GET
//    /api/orders/:id), used both by the "refresh full details when the
//    detail modal opens" effect and the `openOrderId` deep-link effect. The
//    real route's own extra joins (`table_number`/`waitress_name`/
//    `collected_by_name`) are dropped for the same grepped-clean reasons as
//    above; `table_name` is kept for the same reason too. The route's own
//    `loanDetails` nested object (a separate `loans` lookup — customer_name/
//    customer_phone/due_date/amount/status/paid_at/notes — attached as
//    `{...order, items, loanDetails}`) IS replicated as its own nested
//    object, since the detail modal reads `selectedOrder.loanDetails?.xxx`
//    with a fallback to the flat `loanXxx` fields the list fetch above
//    already provides — matching the real response shape exactly, not just
//    the fields.
// 3. `fetchSupportData()` — was `tablesAPI.getAll()` + `usersAPI.getAll()` +
//    `menuAPI.getItems()` (GET /api/tables, /api/users, /api/menu/items),
//    feeding the edit-modal's table/waitress dropdowns and the add-items
//    menu search. `tables.js`'s own route joins `users` for `waitress_name`
//    and a computed `order_total` subquery — grepped this file for
//    `table.waitressName`/`table.orderTotal` and found zero references (only
//    `table.id`/`table.name`/`table.tableNumber` are ever read), so neither
//    is replicated — same precedent as TablesScreen.jsx's own `fetchTables`
//    dropping the identical dead-weight join. `users.js`'s route already
//    excludes `password_hash` via an explicit column list and applies no
//    role filter (matching this screen's parameterless `usersAPI.getAll()`
//    call) — replicated as a plain `SELECT *` (the local `users` table has
//    no credential columns synced anyway, per powersync/schema.js).
//    `menu.js`'s `GET /items` LEFT JOINs `categories` only for
//    `category_name` (grepped clean — zero `categoryName`/`category_name`
//    references) and its own `ORDER BY c.sort_order, m.sort_order, m.name` —
//    the join is kept ONLY for that ordering, same precedent as
//    MenuScreen.jsx's own `fetchItems`. No `category_id`/`available_only`
//    filter needed either — this screen's call site never passes either
//    param. `restaurant_tables`/`users`/`menu_items`/`categories` are all
//    fully synced tables.
//
// Boolean-column check: `order_items.is_free`/`item_ready` are both already
// listed in case.js's `BOOL_FIELDS` (`isFree`/`itemReady`) — verified
// directly, not assumed. Neither is actually read anywhere in this screen
// (grepped clean), so this is a non-issue in practice, but the coercion is
// correct either way. The `orders`/`loans`/`restaurant_tables` tables
// themselves have no boolean columns at all (checked powersync/schema.js) —
// nothing else to verify.
//
// `menuAPI`/`tablesAPI`/`usersAPI` imports dropped entirely — each had
// exactly one call site (inside `fetchSupportData`), now gone, grepped
// clean. `ordersAPI` is kept for its five remaining writes.
// ─────────────────────────────────────────────────────────────────────────────

const statusColors = {
  pending: { bg: 'bg-gray-100', text: 'text-gray-700', badge: 'bg-gray-500' },
  sent_to_kitchen: { bg: 'bg-orange-100', text: 'text-orange-700', badge: 'bg-orange-500' },
  preparing: { bg: 'bg-amber-100', text: 'text-amber-700', badge: 'bg-amber-500' },
  ready: { bg: 'bg-green-100', text: 'text-green-700', badge: 'bg-green-500' },
  served: { bg: 'bg-blue-100', text: 'text-blue-700', badge: 'bg-blue-500' },
  bill_requested: { bg: 'bg-purple-100', text: 'text-purple-700', badge: 'bg-purple-500' },
  paid: { bg: 'bg-indigo-100', text: 'text-indigo-700', badge: 'bg-indigo-500' },
  cancelled: { bg: 'bg-red-100', text: 'text-red-700', badge: 'bg-red-500' },
};

// statusLabels resolved via t() inside the component
const getStatusLabels = (t) => ({
  pending: t('admin.orders.statusLabels.pending'),
  sent_to_kitchen: t('statuses.sentToKitchen'),
  preparing: t('admin.orders.statusLabels.preparing'),
  ready: t('admin.orders.statusLabels.ready'),
  served: t('admin.orders.statusLabels.served'),
  bill_requested: t('admin.orders.statusLabels.bill_requested'),
  paid: t('admin.orders.statusLabels.paid'),
  cancelled: t('statuses.cancelled'),
});

const statusFlow = {
  pending: 'sent_to_kitchen',
  sent_to_kitchen: 'preparing',
  preparing: 'ready',
  ready: 'served',
  served: 'bill_requested',
  bill_requested: null,
};

const getNextStatusLabel = (t) => ({
  pending: t('admin.orders.sendToKitchen'),
  sent_to_kitchen: t('admin.orders.nextStatusLabels.confirmed'),
  preparing: t('admin.orders.nextStatusLabels.preparing'),
  ready: t('admin.orders.nextStatusLabels.ready'),
  served: t('admin.orders.nextStatusLabels.served'),
  bill_requested: null,
});

// deleteReasons and cancelReasons loaded from i18n

export default function AdminOrdersScreen({ navigate, openOrderId, clearOpenOrderId }) {
  const { t } = useTranslation();
  const { call, loading, error } = useApi();
  const [activeOrders, setActiveOrders] = useState([]);
  const [paidOrders, setPaidOrders] = useState([]);
  const [cancelledOrders, setCancelledOrders] = useState([]);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [tab, setTab] = useState('active');
  const [dateFrom, setDateFrom] = useState((() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })());
  const [dateTo, setDateTo] = useState((() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })());
  const [periodPreset, setPeriodPreset] = useState('today');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [deleteId, setDeleteId] = useState(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelOtherText, setCancelOtherText] = useState('');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [modalOpenKey, setModalOpenKey] = useState(0);

  const openOrderModal = useCallback((order) => {
    setSelectedOrder(order);
    setModalOpenKey(k => k + 1);
  }, []);

  // Local PowerSync read, replacing REST `ordersAPI.getById(id)` — see this
  // file's own header comment (item 2 of the 2026-07-28 conversion note) for
  // the full join-by-join reasoning against the real GET /api/orders/:id
  // route.
  const fetchOrderDetail = useCallback(async (orderId) => {
    const orderRow = await window.electronAPI.psGet(`
      SELECT o.*, t.name AS table_name
      FROM orders o
      LEFT JOIN restaurant_tables t ON o.table_id = t.id
      WHERE o.id = ?
    `, [orderId]);
    if (!orderRow) return null;
    const itemRows = await window.electronAPI.psGetAll(`
      SELECT oi.*, COALESCE(m.name, 'Unknown item') AS name, COALESCE(m.unit, 'piece') AS unit
      FROM order_items oi
      LEFT JOIN menu_items m ON oi.menu_item_id = m.id
      WHERE oi.order_id = ?
    `, [orderId]);
    const loanRow = await window.electronAPI.psGet(`
      SELECT customer_name, customer_phone, due_date, amount, status, paid_at, notes
      FROM loans WHERE order_id = ? ORDER BY created_at DESC LIMIT 1
    `, [orderId]);
    const full = camelizeRow(orderRow);
    full.items = camelizeRows(itemRows);
    full.loanDetails = loanRow ? camelizeRow(loanRow) : null;
    return full;
  }, []);

  // Always fetch fresh full order details (including latest loan status) when modal opens
  useEffect(() => {
    if (!selectedOrder?.id) return;
    fetchOrderDetail(selectedOrder.id)
      .then(full => { if (full) setSelectedOrder(prev => prev?.id === full.id ? { ...prev, ...full } : prev); })
      .catch(() => {});
  }, [selectedOrder?.id, modalOpenKey]); // eslint-disable-line

  // Auto-open an order if AdminShell passed an `openOrderId` prop (parsed by
  // its `goTo()` out of a `/admin/orders?open=<id>` path — see this file's
  // own header comment, adaptation #1, for the full reasoning).
  useEffect(() => {
    if (!openOrderId) return;
    fetchOrderDetail(openOrderId)
      .then(full => {
        if (full?.id) openOrderModal(full);
      })
      .catch(() => {})
      .finally(() => {
        // Strip it from AdminShell's state so it isn't reopened again later.
        clearOpenOrderId && clearOpenOrderId();
      });
  }, [openOrderId]); // eslint-disable-line

  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(Date.now());

  // Edit modal state
  const [editingOrder, setEditingOrder] = useState(null);
  const [editFormData, setEditFormData] = useState({
    tableId: null,
    waitressId: null,
    items: [],
    notes: '',
  });
  const [allTables, setAllTables] = useState([]);
  const [allWaitresses, setAllWaitresses] = useState([]);
  const [allMenuItems, setAllMenuItems] = useState([]);
  const [searchMenuQuery, setSearchMenuQuery] = useState('');
  // Amount picker for kg/L items in edit modal: { idx: number|null, item, draft }
  const [amountPicker, setAmountPicker] = useState(null);

  // ── Unit helpers (shared with Edit Order modal) ─────────────────────────
  const isWeighedUnit = (unit) => {
    const u = String(unit || 'piece').toLowerCase();
    return u === 'kg' || u === 'l' || u === 'g' || u === 'ml';
  };
  const unitSuffix = (unit) => {
    const u = String(unit || 'piece').toLowerCase();
    return u === 'piece' ? '' : u;
  };
  const formatItemQty = (item) => {
    const n = Number(item?.quantity) || 0;
    if (isWeighedUnit(item?.unit)) {
      const trimmed = Number.isInteger(n) ? String(n) : parseFloat(n.toFixed(3)).toString();
      return `${trimmed} ${unitSuffix(item?.unit)}`;
    }
    return String(Math.round(n) || 1);
  };

  // Payment modal state
  const [paymentOrder, setPaymentOrder] = useState(null);
  const [paymentFormData, setPaymentFormData] = useState({
    paymentMethod: 'cash',
    amount: 0,
    discount: 0,
    discountType: 'percentage', // 'percentage' | 'fixed'
    amountReceived: 0,
    splitWays: null, // 2 | 3 | 4 | null
    loanName: '',
    loanPhone: '',
    loanDueDate: '',
    notes: '',
  });
  const [splitParts, setSplitParts] = useState([]);

  // Period preset helper
  const applyPeriod = useCallback((preset) => {
    setPeriodPreset(preset);
    const today = new Date();
    const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const todayStr = fmt(today);
    if (preset === 'today') {
      setDateFrom(todayStr);
      setDateTo(todayStr);
    } else if (preset === 'yesterday') {
      const y = new Date(today); y.setDate(y.getDate() - 1);
      const yStr = fmt(y);
      setDateFrom(yStr);
      setDateTo(yStr);
    } else if (preset === '7days') {
      const d = new Date(today); d.setDate(d.getDate() - 6);
      setDateFrom(fmt(d));
      setDateTo(todayStr);
    } else if (preset === '30days') {
      const d = new Date(today); d.setDate(d.getDate() - 29);
      setDateFrom(fmt(d));
      setDateTo(todayStr);
    } else if (preset === 'this_month') {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      setDateFrom(fmt(first));
      setDateTo(todayStr);
    }
    // 'custom' — don't change dates, user picks manually
  }, []);

  // Local PowerSync read, replacing REST `ordersAPI.getAll({status, from, to,
  // include_items:'true'})` — see this file's own header comment (item 1 of
  // the 2026-07-28 conversion note) for the full join-by-join reasoning
  // against the real GET /api/orders route. Shared by
  // fetchActiveOrders/fetchPaidOrders/fetchCancelledOrders below so each just
  // supplies its own status list + optional date range.
  const fetchOrdersWithItems = useCallback(async (statuses, { from, to } = {}) => {
    let sql = `
      SELECT o.*,
             t.name AS table_name,
             l.status         AS loan_status,
             l.paid_at        AS loan_paid_at,
             l.due_date       AS loan_due_date,
             l.customer_name  AS loan_customer_name,
             l.customer_phone AS loan_customer_phone,
             l.amount         AS loan_amount,
             l.notes          AS loan_notes
      FROM orders o
      LEFT JOIN restaurant_tables t ON o.table_id = t.id
      LEFT JOIN (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY created_at DESC) AS rn
        FROM loans
      ) l ON l.order_id = o.id AND l.rn = 1
      WHERE o.status IN (${statuses.map(() => '?').join(',')})
    `;
    const params = [...statuses];
    if (from) { sql += ` AND DATE(o.created_at) >= ?`; params.push(from); }
    if (to)   { sql += ` AND DATE(o.created_at) <= ?`; params.push(to); }
    sql += ` ORDER BY o.created_at DESC`;

    const rows = camelizeRows(await window.electronAPI.psGetAll(sql, params));
    if (rows.length > 0) {
      const ids = rows.map(o => o.id);
      const itemRows = camelizeRows(await window.electronAPI.psGetAll(`
        SELECT oi.*, COALESCE(m.name, 'Unknown item') AS name, COALESCE(m.unit, 'piece') AS unit
        FROM order_items oi
        LEFT JOIN menu_items m ON oi.menu_item_id = m.id
        WHERE oi.order_id IN (${ids.map(() => '?').join(',')})
      `, ids));
      const itemMap = {};
      for (const it of itemRows) {
        (itemMap[it.orderId] || (itemMap[it.orderId] = [])).push(it);
      }
      for (const o of rows) o.items = itemMap[o.id] || [];
    }
    return rows;
  }, []);

  const fetchActiveOrders = useCallback(async () => {
    try {
      const rows = await fetchOrdersWithItems(
        ['pending', 'sent_to_kitchen', 'preparing', 'ready', 'served', 'bill_requested']
      );
      setActiveOrders(prev => {
        const prevJson = JSON.stringify(prev);
        const nextJson = JSON.stringify(rows);
        return prevJson === nextJson ? prev : rows;
      });
    } catch (err) {
      console.error('Failed to fetch active orders:', err);
    }
  }, [fetchOrdersWithItems]);

  const fetchPaidOrders = useCallback(async () => {
    try {
      const rows = await fetchOrdersWithItems(['paid'], { from: dateFrom, to: dateTo });
      setPaidOrders(prev => {
        const prevJson = JSON.stringify(prev);
        const nextJson = JSON.stringify(rows);
        return prevJson === nextJson ? prev : rows;
      });
    } catch (err) {
      console.error('Failed to fetch paid orders:', err);
    }
  }, [fetchOrdersWithItems, dateFrom, dateTo]);

  const fetchCancelledOrders = useCallback(async () => {
    try {
      const rows = await fetchOrdersWithItems(['cancelled']);
      setCancelledOrders(prev => {
        const prevJson = JSON.stringify(prev);
        const nextJson = JSON.stringify(rows);
        return prevJson === nextJson ? prev : rows;
      });
    } catch (err) {
      console.error('Failed to fetch cancelled orders:', err);
    }
  }, [fetchOrdersWithItems]);

  // Local PowerSync read, replacing REST `tablesAPI.getAll()` +
  // `usersAPI.getAll()` + `menuAPI.getItems()` — see this file's own header
  // comment (item 3 of the 2026-07-28 conversion note) for the full
  // reasoning against the real GET /api/tables, /api/users, /api/menu/items
  // routes.
  const fetchSupportData = useCallback(async () => {
    try {
      const [tableRows, userRows, itemRows] = await Promise.all([
        window.electronAPI.psGetAll(`SELECT * FROM restaurant_tables ORDER BY table_number`),
        window.electronAPI.psGetAll(`SELECT * FROM users ORDER BY created_at DESC`),
        window.electronAPI.psGetAll(`
          SELECT m.*
          FROM menu_items m
          LEFT JOIN categories c ON m.category_id = c.id
          ORDER BY c.sort_order, m.sort_order, m.name
        `),
      ]);
      setAllTables(camelizeRows(tableRows));
      setAllWaitresses(camelizeRows(userRows));
      setAllMenuItems(camelizeRows(itemRows));
    } catch (err) {
      console.error('Failed to fetch support data:', err);
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchActiveOrders(), fetchSupportData()]).finally(() => setInitialLoaded(true));
    const interval = setInterval(() => {
      fetchActiveOrders();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchActiveOrders, fetchSupportData]);

  useEffect(() => {
    if (tab === 'paid') {
      fetchPaidOrders();
    }
  }, [tab, fetchPaidOrders]);

  useEffect(() => {
    if (tab === 'cancelled') {
      fetchCancelledOrders();
    }
  }, [tab, fetchCancelledOrders]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      if (tab === 'active') {
        await fetchActiveOrders();
      } else if (tab === 'paid') {
        await fetchPaidOrders();
      } else if (tab === 'cancelled') {
        await fetchCancelledOrders();
      }
    } finally {
      setRefreshing(false);
      setLastRefresh(Date.now());
    }
  };

  const handleStatusChange = async (orderId, newStatus) => {
    try {
      await call(ordersAPI.updateStatus, orderId, newStatus);
      await fetchActiveOrders();
    } catch (err) {
      console.error('Failed to update order status:', err);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await call(ordersAPI.delete, deleteId);
      setActiveOrders(activeOrders.filter(o => o.id !== deleteId));
      setPaidOrders(paidOrders.filter(o => o.id !== deleteId));
      setCancelledOrders(cancelledOrders.filter(o => o.id !== deleteId));
      setDeleteId(null);
      setDeleteReason('');
    } catch (err) {
      console.error('Failed to delete order:', err);
    }
  };

  const handleCancelOrder = async () => {
    if (!cancelTarget) return;
    const reason = cancelReason === 'Other' ? cancelOtherText.trim() : cancelReason;
    if (!reason) return;
    try {
      await call(ordersAPI.cancel, cancelTarget.id, reason);
      setActiveOrders(activeOrders.filter(o => o.id !== cancelTarget.id));
      setCancelTarget(null);
      setCancelReason('');
      setCancelOtherText('');
      fetchCancelledOrders();
    } catch (err) {
      console.error('Failed to cancel order:', err);
    }
  };

  const getElapsedTime = (createdAt) => {
    const now = new Date();
    const created = new Date(createdAt);
    const diffMs = now - created;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return t('admin.orders.nowLabel');
    if (diffMins < 60) return t('admin.orders.minAgo', { m: diffMins });
    const diffHours = Math.floor(diffMins / 60);
    return t('admin.orders.hoursAgo', { h: diffHours });
  };

  const displayItems = (items, maxItems = 3) => {
    if (!Array.isArray(items)) return [];
    return items.slice(0, maxItems);
  };

  const getItemsRemaining = (items, maxItems = 3) => {
    if (!Array.isArray(items)) return 0;
    return Math.max(0, items.length - maxItems);
  };

  const countOrdersByStatus = (orders) => {
    const counts = {};
    if (Array.isArray(orders)) {
      orders.forEach(o => {
        counts[o.status] = (counts[o.status] || 0) + 1;
      });
    }
    return counts;
  };

  const getWaitressName = (waitressId) => {
    const waitress = allWaitresses.find(w => w.id === waitressId);
    return waitress ? waitress.name : waitressId || t('admin.orders.na');
  };

  const getTableNumber = (tableId) => {
    const table = allTables.find(t => t.id === tableId);
    if (!table) return tableId || t('admin.orders.na');
    // Prefer custom name (e.g. "Xovli 1"), fall back to numbered label
    return table.name || `${t('admin.orders.tablePrefix')} ${table.tableNumber}`;
  };

  const openEditModal = (order) => {
    setEditingOrder(order);
    setEditFormData({
      tableId: order.tableId,
      waitressId: order.waitressId,
      guestCount: Number(order.guestCount) || 1,
      items: (order.items || []).map(item => ({
        id: item.id,
        menuItemId: item.menuItemId || item.id,
        name: item.name || item.itemName,
        unitPrice: Number(item.unitPrice) || 0,
        quantity: Number(item.quantity) || 1,
        unit: String(item.unit || 'piece').toLowerCase(),
      })),
      notes: order.notes || '',
    });
    setSearchMenuQuery('');
    setAmountPicker(null);
  };

  const saveEditedOrder = async () => {
    if (!editingOrder) return;
    try {
      await call(ordersAPI.update, editingOrder.id, {
        tableId: editFormData.tableId,
        waitressId: editFormData.waitressId,
        guestCount: editFormData.guestCount,
        items: editFormData.items,
        notes: editFormData.notes,
      });
      setEditingOrder(null);
      await fetchActiveOrders();
    } catch (err) {
      console.error('Failed to update order:', err);
    }
  };

  const updateItemQuantity = (idx, delta) => {
    const item = editFormData.items[idx];
    if (!item) return;
    // For weighed items (kg/L), tapping +/- opens the amount picker so the
    // user can enter a precise amount instead of incrementing by 1.
    if (isWeighedUnit(item.unit)) {
      const unitPrice = Number(item.price || item.unitPrice || 0);
      const seedQty   = item.quantity ? String(item.quantity) : '';
      const seedPrice = item.quantity && unitPrice > 0
        ? String(Math.round(Number(item.quantity) * unitPrice))
        : '';
      setAmountPicker({ idx, item, draft: seedQty, priceDraft: seedPrice });
      return;
    }
    const updatedItems = editFormData.items.map((it, i) =>
      i === idx ? { ...it, quantity: Math.max(1, (Number(it.quantity) || 1) + delta) } : it
    );
    setEditFormData({ ...editFormData, items: updatedItems });
  };

  const removeItem = (idx) => {
    const updatedItems = editFormData.items.filter((_, i) => i !== idx);
    setEditFormData({ ...editFormData, items: updatedItems });
  };

  const addMenuItemToOrder = (menuItem) => {
    // Weighed items (kg/L) open the amount picker instead of adding qty=1
    if (isWeighedUnit(menuItem.unit)) {
      setAmountPicker({ idx: null, item: menuItem, draft: '', priceDraft: '' });
      return;
    }
    const existsIdx = editFormData.items.findIndex(
      item => item.menuItemId === menuItem.id || item.id === menuItem.id
    );
    if (existsIdx >= 0) {
      updateItemQuantity(existsIdx, 1);
    } else {
      setEditFormData({
        ...editFormData,
        items: [
          ...editFormData.items,
          {
            id: menuItem.id,
            menuItemId: menuItem.id,
            name: menuItem.name,
            unitPrice: Number(menuItem.price) || 0,
            quantity: 1,
            unit: String(menuItem.unit || 'piece').toLowerCase(),
          },
        ],
      });
    }
    setSearchMenuQuery('');
  };

  // Confirm amount entered in the kg/L picker
  const confirmAmountPicker = () => {
    if (!amountPicker) return;
    const raw = String(amountPicker.draft || '').replace(',', '.').trim();
    const amt = parseFloat(raw);
    if (!isFinite(amt) || amt <= 0) { setAmountPicker(null); return; }
    const rounded = Math.round(amt * 1000) / 1000; // 3 dp max
    const { idx, item } = amountPicker;
    if (idx != null) {
      // Update existing item's quantity
      setEditFormData(f => ({
        ...f,
        items: f.items.map((it, i) => i === idx ? { ...it, quantity: rounded } : it),
      }));
    } else {
      // Add new weighed item (or update existing with same menu_item_id)
      const existsIdx = editFormData.items.findIndex(
        it => it.menuItemId === item.id || it.id === item.id
      );
      if (existsIdx >= 0) {
        setEditFormData(f => ({
          ...f,
          items: f.items.map((it, i) => i === existsIdx ? { ...it, quantity: rounded } : it),
        }));
      } else {
        setEditFormData(f => ({
          ...f,
          items: [...f.items, {
            id: item.id,
            menuItemId: item.id,
            name: item.name,
            unitPrice: Number(item.price) || 0,
            quantity: rounded,
            unit: String(item.unit || 'piece').toLowerCase(),
          }],
        }));
      }
    }
    setAmountPicker(null);
    setSearchMenuQuery('');
  };

  // Bidirectional kg ↔ price helpers for the amount picker
  const onAmountQtyChange = (v) => {
    const unit = Number(amountPicker?.item?.price || amountPicker?.item?.unitPrice || 0);
    const qty  = parseFloat(String(v || '').replace(',', '.')) || 0;
    const priceCalc = Math.round(qty * unit);
    setAmountPicker(p => p ? {
      ...p,
      draft: v,
      priceDraft: qty > 0 && unit > 0 ? String(priceCalc) : '',
    } : p);
  };
  const onAmountPriceChange = (v) => {
    const unit  = Number(amountPicker?.item?.price || amountPicker?.item?.unitPrice || 0);
    const price = parseFloat(String(v || '').replace(',', '.')) || 0;
    const qty   = unit > 0 ? Math.round((price / unit) * 1000) / 1000 : 0;
    setAmountPicker(p => p ? {
      ...p,
      priceDraft: v,
      draft: price > 0 && unit > 0 ? String(qty) : '',
    } : p);
  };

  const getFilteredMenuItems = () => {
    return allMenuItems.filter(item =>
      item.name.toLowerCase().includes(searchMenuQuery.toLowerCase())
    );
  };

  const openPaymentModal = (order) => {
    setPaymentOrder(order);
    setSplitParts([]);
    setPaymentFormData({
      paymentMethod: 'cash',
      amount: order.totalAmount || 0,
      discount: 0,
      discountType: 'percentage',
      amountReceived: order.totalAmount || 0,
      splitWays: null,
      loanName: '',
      loanPhone: '',
      loanDueDate: '',
      notes: '',
    });
  };

  // Re-initialize split parts when splitWays or order changes
  useEffect(() => {
    if (!paymentFormData.splitWays || !paymentOrder) {
      setSplitParts([]);
      return;
    }
    const total = paymentOrder.totalAmount || 0;
    const discAmt = paymentFormData.discountType === 'percentage'
      ? Math.min(total, (total * (paymentFormData.discount || 0)) / 100)
      : Math.min(total, paymentFormData.discount || 0);
    const totalAfter = Math.max(0, total - discAmt);
    const n = paymentFormData.splitWays;
    const base = Math.floor(totalAfter / n);
    const rem = totalAfter - base * n;
    setSplitParts(Array.from({ length: n }, (_, i) => ({
      amount: String(i === n - 1 ? base + rem : base),
      method: 'cash',
      confirmed: false,
      loanName: '',
      loanPhone: '',
      loanDueDate: '',
    })));
  }, [paymentFormData.splitWays, paymentOrder]); // eslint-disable-line

  const getDiscountAmount = (pf, total) => {
    if (!pf.discount || pf.discount <= 0) return 0;
    if (pf.discountType === 'percentage') {
      return Math.min(total, (total * pf.discount) / 100);
    }
    return Math.min(total, pf.discount);
  };

  const getTotalAfterDiscount = (pf) => {
    const total = paymentOrder?.totalAmount || 0;
    return Math.max(0, total - getDiscountAmount(pf, total));
  };

  const getChangeAmount = (pf) => {
    const total = getTotalAfterDiscount(pf);
    return Math.max(0, (parseFloat(pf.amountReceived) || 0) - total);
  };

  const processPayment = async () => {
    if (!paymentOrder) return;
    const finalAmount = getTotalAfterDiscount(paymentFormData);
    const discountAmt = getDiscountAmount(paymentFormData, paymentOrder.totalAmount || 0);

    const payload = {
      discountAmount: discountAmt,
      notes: paymentFormData.notes || null,
    };

    if (paymentFormData.splitWays && splitParts.length > 0) {
      payload.paymentMethod = 'split';
      payload.splitPayments = splitParts.map(p => ({
        method: p.method,
        amount: parseFloat(p.amount) || 0,
        ...(p.method === 'loan' ? {
          loanCustomerName: p.loanName || null,
          loanCustomerPhone: p.loanPhone || null,
          loanDueDate: p.loanDueDate || null,
        } : {}),
      }));
    } else if (paymentFormData.paymentMethod === 'loan') {
      payload.paymentMethod = 'loan';
      payload.loanCustomerName = paymentFormData.loanName;
      payload.loanCustomerPhone = paymentFormData.loanPhone;
      payload.loanDueDate = paymentFormData.loanDueDate || null;
    } else {
      payload.paymentMethod = paymentFormData.paymentMethod;
      payload.amount = finalAmount;
    }

    try {
      await call(ordersAPI.pay, paymentOrder.id, payload);
      setPaymentOrder(null);
      setSplitParts([]);
      await fetchActiveOrders();
      await fetchPaidOrders();
    } catch (err) {
      console.error('Failed to process payment:', err);
    }
  };

  const activeStatusCounts = countOrdersByStatus(activeOrders);
  const filteredPaidOrders = paymentFilter === 'all'
    ? paidOrders
    : paidOrders.filter(o => (o.paymentMethod || 'cash') === paymentFilter);
  const totalRevenue = Array.isArray(filteredPaidOrders) ? filteredPaidOrders.reduce((sum, o) => sum + (parseFloat(o.totalAmount) || 0), 0) : 0;

  // Get unique payment methods for filter buttons
  const paymentMethods = [...new Set(paidOrders.map(o => o.paymentMethod || 'cash'))];

  if (!initialLoaded) {
    return (
      <div className="p-8 text-center">
        <div className="text-gray-600">{t("common.loading")}</div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <ClipboardList className="text-blue-600" size={28} />
              </div>
              <h1 className="text-3xl font-bold text-gray-900">{t("admin.orders.title")}</h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                // Source navigated to a standalone '/admin/new-order' page —
                // not ported here (see this file's header comment, adaptation
                // #3). Redirected to Tables, where a new order actually gets
                // created in this build (tap a free table → New Order modal).
                onClick={() => navigate('/admin/tables')}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
              >
                <Plus size={18} />
                {t("admin.orders.newOrder")}
              </button>
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
              >
                <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
                {t("common.refresh")}
              </button>
            </div>
          </div>

          {/* Status Badges */}
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-lg">
              <span className="text-sm font-medium text-gray-600">{t("statuses.pending")}:</span>
              <span className="text-lg font-bold text-gray-900">{activeStatusCounts.pending || 0}</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-orange-100 rounded-lg">
              <span className="text-sm font-medium text-orange-600">{t("statuses.sentToKitchen")}:</span>
              <span className="text-lg font-bold text-orange-900">{(activeStatusCounts.sent_to_kitchen || 0) + (activeStatusCounts.preparing || 0)}</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-green-100 rounded-lg">
              <span className="text-sm font-medium text-green-600">{t("statuses.ready")}:</span>
              <span className="text-lg font-bold text-green-900">{activeStatusCounts.ready || 0}</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-blue-100 rounded-lg">
              <span className="text-sm font-medium text-blue-600">{t("statuses.served")}:</span>
              <span className="text-lg font-bold text-blue-900">{activeStatusCounts.served || 0}</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-purple-100 rounded-lg">
              <span className="text-sm font-medium text-purple-600">{t("statuses.billRequested")}:</span>
              <span className="text-lg font-bold text-purple-900">{activeStatusCounts.bill_requested || 0}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="flex gap-2 mb-8 border-b border-gray-200">
          {[
            { id: 'active', label: t('admin.orders.activeOrders'), icon: ClipboardList },
            { id: 'paid', label: t('admin.orders.paidOrders'), icon: CreditCard },
            { id: 'cancelled', label: t('admin.orders.cancelledOrders'), icon: Ban },
          ].map((tabDef) => {
            const Icon = tabDef.icon;
            return (
              <button
                key={tabDef.id}
                onClick={() => setTab(tabDef.id)}
                className={`flex items-center gap-2 px-6 py-3 font-medium transition border-b-2 ${
                  tab === tabDef.id
                    ? 'text-blue-600 border-blue-600'
                    : 'text-gray-600 border-transparent hover:text-gray-900'
                }`}
              >
                <Icon size={20} />
                {tabDef.label}
              </button>
            );
          })}
        </div>

        {/* Active Orders Tab */}
        {tab === 'active' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeOrders.map((order) => (
                <div
                  key={order.id}
                  onClick={() => openOrderModal(order)}
                  className="bg-white rounded-xl border border-gray-200 hover:shadow-md transition overflow-hidden cursor-pointer"
                >
                  {/* Row 1: Order number + status + time */}
                  <div className="px-4 pt-4 pb-2 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-bold text-gray-900">#{order.dailyNumber || '—'}</span>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${statusColors[order.status]?.bg || 'bg-gray-100'} ${statusColors[order.status]?.text || 'text-gray-700'}`}>
                        {getStatusLabels(t)[order.status] || order.status}
                      </span>
                    </div>
                    <span className="text-xs text-gray-400">{getElapsedTime(order.createdAt)}</span>
                  </div>

                  {/* Row 2: Table + Waitress */}
                  <div className="px-4 pb-3 flex items-center gap-1.5 text-sm text-gray-600">
                    <span className="font-semibold text-gray-800">{t('admin.orders.tablePrefix')} {getTableNumber(order.tableId)}</span>
                    <span className="text-gray-300">·</span>
                    <span>{getWaitressName(order.waitressId)}</span>
                  </div>

                  {/* Row 3: Items count + Total + Action icons */}
                  <div className="px-4 pb-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs font-semibold">
                        {Math.round((order.items || []).reduce((s, i) => s + (Number(i.quantity) || 1), 0))} {t('common.items')}
                      </span>
                      <span className="text-base font-bold text-green-600">{money(order.totalAmount || 0)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={(e) => { e.stopPropagation(); openEditModal(order); }}
                        className="p-2 rounded-lg text-blue-600 hover:bg-blue-50 transition" title={t('common.edit', 'Edit')}>
                        <Edit3 size={16} />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); setCancelTarget(order); }}
                        className="p-2 rounded-lg text-red-400 hover:bg-red-50 transition" title={t('orders.cancelOrder', 'Cancel Order')}>
                        <Ban size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Status action button */}
                  {(statusFlow[order.status] || order.status === 'served' || order.status === 'bill_requested') && (
                    <div className="px-4 pb-4 flex gap-2" onClick={(e) => e.stopPropagation()}>
                      {statusFlow[order.status] && (
                        <button
                          onClick={() => handleStatusChange(order.id, statusFlow[order.status])}
                          className="flex-1 px-3 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition flex items-center justify-center gap-2 text-sm"
                        >
                          <Check size={14} />
                          {getNextStatusLabel(t)[order.status]}
                        </button>
                      )}
                      {(order.status === 'served' || order.status === 'bill_requested') && (
                        <button
                          onClick={() => openPaymentModal(order)}
                          className="flex-1 px-3 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition flex items-center justify-center gap-2 text-sm"
                        >
                          <CreditCard size={14} />
                          {t("common.paid")}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {activeOrders.length === 0 && (
              <div className="text-center py-12 bg-white rounded-lg shadow">
                <ClipboardList size={40} className="text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600 font-medium">{t("admin.orders.noOrdersFound")}</p>
              </div>
            )}
          </div>
        )}

        {/* Paid Orders Tab */}
        {tab === 'paid' && (
          <div className="space-y-5">
            {/* ── Filter Bar (same style as Inventory Stock Output) ── */}
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">{t("common.from")}</label>
                <DatePicker value={dateFrom} onChange={(v) => { setPeriodPreset('custom'); setDateFrom(v); }} placeholder={t('placeholders.startDate', 'Start date')} size="sm" className="w-[150px]" />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">{t("common.to")}</label>
                <DatePicker value={dateTo} onChange={(v) => { setPeriodPreset('custom'); setDateTo(v); }} placeholder={t('placeholders.endDate', 'End date')} size="sm" className="w-[150px]" />
              </div>
              <div className="flex gap-1.5 items-center pb-[1px]">
                {[
                  { id: 'today', label: t('periods.today') },
                  { id: 'yesterday', label: t('periods.yesterday') },
                  { id: '7days', label: t('periods.last7days') },
                  { id: '30days', label: t('periods.last30days') },
                  { id: 'this_month', label: t('periods.thisMonth') },
                ].map(p => (
                  <button key={p.id} onClick={() => applyPeriod(p.id)}
                    className={`px-2.5 py-2 rounded-lg text-[11px] font-semibold transition-colors ${
                      periodPreset === p.id ? 'bg-blue-100 text-blue-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                    }`}>
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="ml-auto">
                <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">{t("cashier.orders.paymentMethod")}</label>
                <Dropdown
                  value={paymentFilter}
                  onChange={(v) => setPaymentFilter(v)}
                  options={[
                    { value: 'all', label: t('admin.orders.allMethods') },
                    { value: 'cash', label: t('paymentMethods.cash') },
                    { value: 'card', label: t('paymentMethods.card') },
                    { value: 'online', label: t('paymentMethods.online') },
                    { value: 'split', label: t('admin.orders.splitLabel') },
                    { value: 'qr_code', label: t('paymentMethods.qrCode') },
                    { value: 'loan', label: t('paymentMethods.loan') },
                  ]}
                  size="sm"
                  className="w-[150px]"
                />
              </div>
            </div>

            {/* Revenue Summary Cards */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">{t("owner.sales.totalRevenue")}</p>
                <p className="text-2xl font-bold text-blue-600">{money(totalRevenue)}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">{t('admin.orders.title')}</p>
                <p className="text-2xl font-bold text-gray-900">{filteredPaidOrders.length}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">{t("owner.sales.avgOrderValue")}</p>
                <p className="text-2xl font-bold text-gray-900">{money(filteredPaidOrders.length > 0 ? totalRevenue / filteredPaidOrders.length : 0)}</p>
              </div>
            </div>

            {/* Paid Orders Table */}
            <div className="bg-white rounded-xl shadow-md overflow-hidden border border-gray-200">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-5 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">{t('common.order')}</th>
                      <th className="px-5 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">{t('admin.tables.title')}</th>
                      <th className="px-5 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">{t('common.items')}</th>
                      <th className="px-5 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">{t('common.total')}</th>
                      <th className="px-5 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">{t('cashier.orders.paymentMethod')}</th>
                      <th className="px-5 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">{t('roles.waitress')}</th>
                      <th className="px-5 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">{t('admin.tables.time')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredPaidOrders.map((order) => {
                      const items = Array.isArray(order.items) ? order.items : [];
                      const itemCount = Math.round(items.reduce((s, i) => s + (Number(i.quantity) || 1), 0));
                      const isLoan = order.paymentMethod === 'loan';
                      const loanPaid = order.loanStatus === 'paid';
                      return (
                        <tr
                          key={order.id}
                          onClick={() => openOrderModal(order)}
                          className={`transition cursor-pointer ${isLoan && !loanPaid ? 'bg-amber-50 hover:bg-amber-100' : 'hover:bg-blue-50'}`}
                        >
                          <td className="px-5 py-3.5">
                            <span className="text-sm font-bold text-gray-900">#{order.dailyNumber || '—'}</span>
                          </td>
                          <td className="px-5 py-3.5 text-sm text-gray-600">
                            {order.tableId ? `${t('admin.orders.tablePrefix')} ${getTableNumber(order.tableId)}` : <span className="text-gray-400">--</span>}
                          </td>
                          <td className="px-5 py-3.5">
                            <span className="text-sm text-gray-600">{itemCount} items</span>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className="text-sm font-bold text-green-600">{money(order.totalAmount || 0)}</span>
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex flex-col gap-1">
                              <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-semibold capitalize ${
                                order.paymentMethod === 'cash'   ? 'bg-green-100 text-green-700' :
                                order.paymentMethod === 'card'   ? 'bg-blue-100 text-blue-700' :
                                order.paymentMethod === 'split'  ? 'bg-purple-100 text-purple-700' :
                                order.paymentMethod === 'qr_code'? 'bg-cyan-100 text-cyan-700' :
                                isLoan                           ? 'bg-amber-100 text-amber-700' :
                                'bg-gray-100 text-gray-700'
                              }`}>{(order.paymentMethod || 'cash').replace('_', ' ')}</span>
                              {/* Loan repayment status */}
                              {isLoan && (
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold ${
                                  loanPaid ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                }`}>
                                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${loanPaid ? 'bg-green-500' : 'bg-red-500'}`} />
                                  {loanPaid ? t('common.paid') : t('common.unpaid')}
                                </span>
                              )}
                              {/* Loan customer name */}
                              {isLoan && order.loanCustomerName && (
                                <span className="text-xs text-amber-700 font-medium truncate max-w-[120px]">
                                  {order.loanCustomerName}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-sm text-gray-600">{getWaitressName(order.waitressId)}</td>
                          <td className="px-5 py-3.5 text-sm text-gray-400">{fmtDate(order.paidAt || order.updatedAt)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {filteredPaidOrders.length === 0 && (
              <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
                <CreditCard size={40} className="text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">{t('admin.orders.noOrdersFound')}</p>
              </div>
            )}
          </div>
        )}

        {/* Cancelled Orders Tab */}
        {tab === 'cancelled' && (
          <div className="bg-white rounded-lg shadow-md overflow-hidden border border-gray-200">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gradient-to-r from-red-50 to-red-100 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">{t('common.order')}</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">{t('admin.orders.tablePrefix')}</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">{t('admin.orders.items')}</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">{t('admin.orders.total')}</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">{t('admin.orders.cancellationReason')}</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">{t('admin.orders.date')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {cancelledOrders.map((order) => (
                    <tr key={order.id} className="hover:bg-red-50 transition">
                      <td className="px-6 py-4 text-sm font-semibold text-gray-900">#{order.dailyNumber || '—'}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{t('admin.orders.tablePrefix')} {getTableNumber(order.tableId)}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{t('admin.orders.itemsCount', { count: Array.isArray(order.items) ? order.items.length : 0 })}</td>
                      <td className="px-6 py-4 text-sm font-bold text-gray-900">{money(order.totalAmount || 0)}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{order.cancellationReason || t('common.noData')}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{fmtDate(order.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {cancelledOrders.length === 0 && (
              <div className="text-center py-12">
                <Ban size={40} className="text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600 font-medium">{t('admin.orders.noOrdersFound')}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Order Detail Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedOrder(null)}>
          <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="sticky top-0 bg-gradient-to-r from-blue-50 to-blue-100 border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Order #{selectedOrder.dailyNumber || '—'}</h2>
                <p className="text-xs text-gray-400 mt-0.5 font-mono">{selectedOrder.id?.slice(0, 12)}…</p>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="p-2 hover:bg-white rounded-lg transition"
              >
                <X size={24} className="text-gray-600" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6">
              {/* Order Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="text-xs font-semibold text-gray-600 mb-1">{t('common.status')}</div>
                  <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${statusColors[selectedOrder.status]?.bg || 'bg-gray-100'} ${statusColors[selectedOrder.status]?.text || 'text-gray-700'}`}>
                    {getStatusLabels(t)[selectedOrder.status] || selectedOrder.status}
                  </span>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="text-xs font-semibold text-gray-600 mb-1">{t('admin.newOrder.table')}</div>
                  <div className="text-lg font-bold text-gray-900">{getTableNumber(selectedOrder.tableId)}</div>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="text-xs font-semibold text-gray-600 mb-1">{t('roles.waitress')}</div>
                  <div className="text-lg font-bold text-gray-900">{getWaitressName(selectedOrder.waitressId)}</div>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="text-xs font-semibold text-gray-600 mb-1">{t('admin.newOrder.title')}</div>
                  <div className="text-lg font-bold text-gray-900">{selectedOrder.orderType || 'Dine-in'}</div>
                </div>
              </div>

              {/* Cancellation Reason */}
              {selectedOrder.status === 'cancelled' && (
                <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
                  <Ban size={20} className="text-red-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="text-sm font-bold text-red-700">{t('admin.orders.cancelledOrders')}</div>
                    <div className="text-sm text-red-600 mt-0.5">{selectedOrder.cancellationReason || t('common.noData')}</div>
                  </div>
                </div>
              )}

              {/* Items List */}
              <div>
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <ClipboardList size={18} />
                  {t('common.items')}
                </h3>
                <div className="space-y-2 bg-gray-50 rounded-lg p-4">
                  {Array.isArray(selectedOrder.items) && selectedOrder.items.length > 0 ? (
                    <table className="w-full text-sm">
                      <thead className="border-b border-gray-200 mb-2">
                        <tr>
                          <th className="text-left text-xs font-semibold text-gray-600 pb-2">{t('common.name')}</th>
                          <th className="text-center text-xs font-semibold text-gray-600 pb-2">Qty</th>
                          <th className="text-right text-xs font-semibold text-gray-600 pb-2">Unit Price</th>
                          <th className="text-right text-xs font-semibold text-gray-600 pb-2">{t('common.subtotal')}</th>
                        </tr>
                      </thead>
                      <tbody className="space-y-1">
                        {selectedOrder.items.map((item, idx) => (
                          <tr key={idx} className="border-b border-gray-200 last:border-0">
                            <td className="py-2 text-gray-900 font-medium">{item.name}</td>
                            <td className="py-2 text-center text-gray-600">{item.quantity}</td>
                            <td className="py-2 text-right text-gray-600">{money(item.unitPrice || 0)}</td>
                            <td className="py-2 text-right text-gray-900 font-semibold">{money((item.unitPrice || 0) * (item.quantity || 1))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="text-gray-600 text-sm">{t('common.noResults')}</p>
                  )}
                </div>
              </div>

              {/* Total */}
              <div className="border-t border-gray-200 pt-4">
                <div className="flex justify-between items-center p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <span className="font-semibold text-gray-900">{t('common.total')}</span>
                  <span className="text-3xl font-bold text-blue-600">{money(selectedOrder.totalAmount || 0)}</span>
                </div>
              </div>

              {/* Payment Info */}
              {selectedOrder.paymentMethod && (
                <div className="space-y-2">
                  {/* Split breakdown */}
                  {selectedOrder.paymentMethod === 'split' && Array.isArray(selectedOrder.splitPayments) && selectedOrder.splitPayments.length > 0 ? (
                    <div className="rounded-lg border border-gray-200 overflow-hidden">
                      <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border-b border-gray-200">
                        <CreditCard size={16} className="text-blue-600" />
                        <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">{t('cashier.orders.splitBill')}</span>
                      </div>
                      {selectedOrder.splitPayments.map((sp, i) => {
                        const methodLabel = { cash: 'Cash', card: 'Card', qr_code: 'QR Code', loan: 'Loan' }[sp.method] || sp.method;
                        const methodColor = { cash: 'text-green-700 bg-green-100', card: 'text-blue-700 bg-blue-100', qr_code: 'text-purple-700 bg-purple-100', loan: 'text-amber-700 bg-amber-100' }[sp.method] || 'text-gray-700 bg-gray-100';
                        return (
                          <div key={i} className="px-4 py-3 border-b border-gray-100 last:border-0">
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-gray-700">Part {i + 1}</span>
                                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${methodColor}`}>{methodLabel}</span>
                              </div>
                              <span className="text-sm font-bold text-gray-900">{money(sp.amount || 0)}</span>
                            </div>
                            {sp.method === 'loan' && (sp.loan_customer_name || sp.loanCustomerName) && (
                              <div className="mt-1.5 pl-1 text-xs text-amber-700 space-y-1">
                                <div className="flex items-center gap-1.5">
                                  <User size={11} className="text-amber-500 flex-shrink-0" />
                                  <span className="font-semibold">{sp.loan_customer_name || sp.loanCustomerName}</span>
                                </div>
                                {(sp.loan_customer_phone || sp.loanCustomerPhone) && (
                                  <div className="flex items-center gap-1.5">
                                    <span className="w-2.5 flex-shrink-0 font-bold">☎</span>
                                    <span>{formatPhoneDisplay(sp.loan_customer_phone || sp.loanCustomerPhone)}</span>
                                  </div>
                                )}
                                {(sp.loan_due_date || sp.loanDueDate) && (
                                  <div className="flex items-center gap-1.5">
                                    <Calendar size={11} className="text-amber-500 flex-shrink-0" />
                                    <span>Due: <span className="font-semibold">{sp.loan_due_date || sp.loanDueDate}</span></span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-gray-200 overflow-hidden">
                      {/* Method row */}
                      <div className="p-4 bg-gray-50 flex items-center gap-3">
                        <CreditCard size={20} className={selectedOrder.paymentMethod === 'loan' ? 'text-amber-500' : 'text-blue-600'} />
                        <div>
                          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('cashier.orders.paymentMethod')}</div>
                          <div className={`font-bold text-sm capitalize mt-0.5 ${selectedOrder.paymentMethod === 'loan' ? 'text-amber-700' : 'text-gray-900'}`}>
                            {selectedOrder.paymentMethod?.replace('_', ' ')}
                          </div>
                        </div>
                      </div>

                      {/* Loan taker details + repayment status */}
                      {selectedOrder.paymentMethod === 'loan' && (() => {
                        const ld    = selectedOrder.loanDetails;
                        const name  = ld?.customerName  || ld?.customer_name  || selectedOrder.loanCustomerName;
                        const phone = ld?.customerPhone || ld?.customer_phone || selectedOrder.loanCustomerPhone;
                        const due   = ld?.dueDate       || ld?.due_date       || selectedOrder.loanDueDate;
                        const amt   = ld?.amount        || selectedOrder.loanAmount;
                        // Loan repayment status — prefer loanDetails.status, fall back to order-level loanStatus
                        const loanStatus = ld?.status || selectedOrder.loanStatus;
                        const loanPaid   = loanStatus === 'paid';
                        const paidAt     = ld?.paidAt || ld?.paid_at || selectedOrder.loanPaidAt;
                        const loanNotes  = ld?.notes || selectedOrder.loanNotes;
                        return (
                          <div className="border-t border-gray-100">
                            {/* Repayment status banner */}
                            <div className={`flex items-center justify-between px-4 py-2.5 ${loanPaid ? 'bg-green-50' : 'bg-red-50'}`}>
                              <div className="flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${loanPaid ? 'bg-green-500' : 'bg-red-500'}`} />
                                <span className={`text-sm font-bold ${loanPaid ? 'text-green-700' : 'text-red-700'}`}>
                                  {loanPaid ? t('common.paid') : t('common.unpaid')}
                                </span>
                              </div>
                              {loanPaid && paidAt && (
                                <span className="text-xs text-green-600">{fmtDate(paidAt)}</span>
                              )}
                              {!loanPaid && due && (
                                <span className={`text-xs font-semibold ${new Date(due) < new Date() ? 'text-red-600' : 'text-amber-600'}`}>
                                  Due {due}{new Date(due) < new Date() ? ' — OVERDUE' : ''}
                                </span>
                              )}
                            </div>
                            {/* Borrower info */}
                            {(name || phone || amt) && (
                              <div className="px-4 py-3 bg-amber-50 space-y-1.5">
                                <div className="text-xs font-bold text-amber-700 uppercase tracking-wider">{t('paymentMethods.loan')}</div>
                                {name && (
                                  <div className="flex items-center gap-2 text-sm text-gray-800">
                                    <User size={13} className="text-amber-500 flex-shrink-0" />
                                    <span className="font-semibold">{name}</span>
                                  </div>
                                )}
                                {phone && (
                                  <div className="flex items-center gap-2 text-sm text-gray-700">
                                    <Calendar size={13} className="text-amber-400 flex-shrink-0 opacity-0" />
                                    <span>{formatPhoneDisplay(phone)}</span>
                                  </div>
                                )}
                                {due && (
                                  <div className="flex items-center gap-2 text-sm text-gray-700">
                                    <Calendar size={13} className="text-amber-500 flex-shrink-0" />
                                    <span>Due: <span className="font-semibold">{due}</span></span>
                                  </div>
                                )}
                                {amt && (
                                  <div className="flex items-center gap-2 text-sm text-gray-700">
                                    <DollarSign size={13} className="text-amber-500 flex-shrink-0" />
                                    <span className="font-semibold text-amber-800">{money(amt)}</span>
                                  </div>
                                )}
                                {loanNotes && (
                                  <div className="flex items-center gap-2 text-sm text-gray-600 mt-1 pt-1.5 border-t border-amber-200">
                                    <FileText size={13} className="text-amber-500 flex-shrink-0" />
                                    <span className="italic">{loanNotes}</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              )}

              {/* Timestamps */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="p-3 bg-gray-50 rounded-lg">
                  <div className="text-xs font-semibold text-gray-600 mb-1">{t('common.date')}</div>
                  <div className="text-gray-900 font-medium">{fmtDate(selectedOrder.createdAt)}</div>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <div className="text-xs font-semibold text-gray-600 mb-1">{t('common.date')}</div>
                  <div className="text-gray-900 font-medium">{fmtDate(selectedOrder.updatedAt)}</div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                {selectedOrder.status !== 'paid' && selectedOrder.status !== 'cancelled' && (
                  <button
                    onClick={() => { setSelectedOrder(null); setTimeout(() => setCancelTarget(selectedOrder), 200); }}
                    className="flex-1 px-4 py-2 bg-red-50 text-red-600 font-semibold rounded-lg hover:bg-red-100 transition flex items-center justify-center gap-2"
                  >
                    <Ban size={16} />
                    {t('admin.orders.cancelOrder')}
                  </button>
                )}
                <button
                  onClick={() => setSelectedOrder(null)}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-900 font-semibold rounded-lg hover:bg-gray-300 transition"
                >
                  {t('common.close')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Order Modal */}
      {editingOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setEditingOrder(null)}>
          <div className="bg-gray-50 rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Header — sticky */}
            <div className="flex items-center justify-between px-6 py-4 bg-white rounded-t-2xl border-b border-gray-200">
              <button onClick={() => setEditingOrder(null)} className="p-2 hover:bg-gray-100 rounded-xl transition">
                <X size={22} className="text-gray-500" />
              </button>
              <h2 className="text-lg font-bold text-gray-900">Edit Order #{editingOrder.dailyNumber || '—'}</h2>
              <button onClick={saveEditedOrder}
                className="px-6 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 transition">
                Save Changes
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">

              {/* Section: Order Info */}
              <p className="text-xs font-bold text-blue-600 tracking-wider uppercase">{t('common.details')}</p>

              {/* Table + Waitress side by side */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{t('admin.newOrder.table')}</label>
                  <Dropdown
                    value={editFormData.tableId || ''}
                    onChange={(value) => setEditFormData({ ...editFormData, tableId: value || null })}
                    options={[
                      { value: '', label: t('common.select') },
                      ...allTables.map(table => ({ value: table.id, label: table.name || `${t('admin.orders.tablePrefix')} ${table.tableNumber}` }))
                    ]}
                    size="sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{t('roles.waitress')}</label>
                  <Dropdown
                    value={editFormData.waitressId || ''}
                    onChange={(value) => setEditFormData({ ...editFormData, waitressId: value || null })}
                    options={[
                      { value: '', label: 'Unassigned' },
                      ...allWaitresses.map(w => ({ value: w.id, label: w.name }))
                    ]}
                    size="sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{t('admin.newOrder.guests')}</label>
                  <div className="flex items-center bg-white rounded-xl border border-gray-200 overflow-hidden h-[38px]">
                    <button onClick={() => setEditFormData(f => ({ ...f, guestCount: Math.max(1, (f.guestCount || 1) - 1) }))}
                      className="px-4 h-full text-blue-600 hover:bg-blue-50 transition">
                      <Minus size={16} />
                    </button>
                    <span className="flex-1 text-center text-base font-bold text-gray-900">{editFormData.guestCount || 1}</span>
                    <button onClick={() => setEditFormData(f => ({ ...f, guestCount: (f.guestCount || 1) + 1 }))}
                      className="px-4 h-full text-blue-600 hover:bg-blue-50 transition">
                      <Plus size={16} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Section: Order Items */}
              <p className="text-xs font-bold text-blue-600 tracking-wider uppercase pt-1">{t('common.items')}</p>

              {editFormData.items.length > 0 ? (
                <div className="space-y-2">
                  {editFormData.items.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 text-sm truncate">{item.name}</p>
                        <p className="text-xs text-blue-600 font-medium">{money(item.unitPrice || 0)}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => updateItemQuantity(idx, -1)}
                          className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 transition">
                          <Minus size={14} />
                        </button>
                        <span className={`${isWeighedUnit(item.unit) ? 'min-w-[4rem] px-2' : 'w-8'} text-center text-sm font-bold text-gray-900`}>{formatItemQty(item)}</span>
                        <button onClick={() => updateItemQuantity(idx, 1)}
                          className="w-8 h-8 flex items-center justify-center rounded-full bg-blue-100 text-blue-600 hover:bg-blue-200 transition">
                          <Plus size={14} />
                        </button>
                        <button onClick={() => removeItem(idx)}
                          className="w-8 h-8 flex items-center justify-center rounded-full bg-red-100 text-red-500 hover:bg-red-200 transition ml-1">
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400 py-2">{t('common.noResults')}</p>
              )}

              {/* Section: Add Items */}
              <p className="text-xs font-bold text-blue-600 tracking-wider uppercase pt-2">{t('admin.orders.addItemsToOrder')}</p>

              <div className="relative">
                <input
                  type="text"
                  placeholder={t("admin.menu.searchPlaceholder")}
                  value={searchMenuQuery}
                  onChange={(e) => setSearchMenuQuery(e.target.value)}
                  className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto">
                {getFilteredMenuItems().length > 0 ? (
                  getFilteredMenuItems().map(item => (
                    <div key={item.id} className="flex items-center justify-between bg-white rounded-xl border border-gray-200 px-4 py-3">
                      <div>
                        <p className="font-semibold text-gray-900 text-sm">{item.name}</p>
                        <p className="text-xs text-blue-600 font-medium">
                          {money(item.price || 0)}
                          {isWeighedUnit(item.unit) ? ` / ${unitSuffix(item.unit)}` : ''}
                        </p>
                      </div>
                      <button onClick={() => addMenuItemToOrder(item)}
                        className="w-9 h-9 flex items-center justify-center rounded-full bg-blue-100 text-blue-600 hover:bg-blue-200 transition">
                        <Plus size={18} />
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-gray-400 py-2">{t('common.noResults')}</p>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{t('common.notes')}</label>
                <textarea
                  value={editFormData.notes}
                  onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
                  placeholder={t('placeholders.orderNotes', 'Add order notes...')}
                  className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  rows="2"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Amount Picker Modal (kg/L items in Edit Order) ── */}
      {amountPicker && (
        <div
          className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4"
          onClick={() => setAmountPicker(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">
                  {t('admin.newOrder.enterAmount', 'Enter amount')}
                </p>
                <p className="text-base font-bold text-gray-900">
                  {amountPicker.item.name}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {Number(amountPicker.item.price || amountPicker.item.unitPrice || 0).toLocaleString()} so'm / {unitSuffix(amountPicker.item.unit)}
                </p>
              </div>
              <button
                onClick={() => setAmountPicker(null)}
                className="p-1 rounded-lg hover:bg-gray-100"
              >
                <X size={18} className="text-gray-500" />
              </button>
            </div>

            {/* Amount (kg / l) input */}
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
              {t('admin.newOrder.amount', 'Amount')}
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.001"
                min="0"
                inputMode="decimal"
                autoFocus
                value={amountPicker.draft}
                onChange={(e) => onAmountQtyChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') confirmAmountPicker();
                  if (e.key === 'Escape') setAmountPicker(null);
                }}
                placeholder="0.000"
                className="w-full px-4 py-3 pr-14 border border-gray-300 rounded-xl text-2xl font-bold text-gray-900 focus:outline-none focus:border-blue-500"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 font-semibold text-lg">
                {unitSuffix(amountPicker.item.unit)}
              </span>
            </div>

            {/* Quick presets */}
            <div className="flex gap-2 mt-3">
              {['0.25', '0.5', '1', '1.5', '2'].map(p => (
                <button
                  key={p}
                  onClick={() => onAmountQtyChange(p)}
                  className="flex-1 px-2 py-2 rounded-lg text-sm font-semibold bg-gray-100 hover:bg-gray-200 text-gray-700"
                >
                  {p}
                </button>
              ))}
            </div>

            {/* Price (so'm) input — bidirectional with amount */}
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mt-4 mb-1">
              {t('admin.newOrder.price', 'Price')}
            </label>
            <div className="relative">
              <input
                type="number"
                step="1"
                min="0"
                inputMode="numeric"
                value={amountPicker.priceDraft || ''}
                onChange={(e) => onAmountPriceChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') confirmAmountPicker();
                  if (e.key === 'Escape') setAmountPicker(null);
                }}
                placeholder="0"
                className="w-full px-4 py-3 pr-14 border border-gray-300 rounded-xl text-2xl font-bold text-gray-900 focus:outline-none focus:border-blue-500"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 font-semibold text-lg">
                so'm
              </span>
            </div>

            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setAmountPicker(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-700 font-semibold hover:bg-gray-50"
              >
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                onClick={confirmAmountPicker}
                className="flex-1 py-2.5 rounded-xl text-white font-semibold bg-blue-600 hover:bg-blue-700"
              >
                {amountPicker.idx != null ? t('common.save', 'Save') : t('common.add', 'Add')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Collect Payment Modal ── */}
      {paymentOrder && (() => {
        const pf          = paymentFormData;
        const orderTotal  = paymentOrder.totalAmount || 0;
        const discountAmt = getDiscountAmount(pf, orderTotal);
        const totalToPay  = getTotalAfterDiscount(pf);
        const change      = getChangeAmount(pf);
        const orderItems  = Array.isArray(paymentOrder.items) ? paymentOrder.items : [];

        const METHODS = [
          { key: 'cash',    label: t('paymentMethods.cash'),    Icon: DollarSign },
          { key: 'card',    label: t('paymentMethods.card'),    Icon: CreditCard },
          { key: 'qr_code', label: t('paymentMethods.qrCode'), Icon: Grid3X3   },
          { key: 'loan',    label: t('paymentMethods.loan'),    Icon: User       },
        ];

        return (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setPaymentOrder(null)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col overflow-hidden" style={{ height: '85vh' }} onClick={e => e.stopPropagation()}>

              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                    <CreditCard size={20} className="text-blue-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">{t('cashier.orders.processPayment')}</h2>
                    <p className="text-sm text-gray-500">
                      Order #{paymentOrder.dailyNumber || '—'}
                      {paymentOrder.tableName ? ` · ${paymentOrder.tableName}` : paymentOrder.tableId ? ` · ${t('admin.orders.tablePrefix')} ${getTableNumber(paymentOrder.tableId)}` : ''}
                      {paymentOrder.waitressId ? ` · ${getWaitressName(paymentOrder.waitressId)}` : ''}
                    </p>
                  </div>
                </div>
                <button onClick={() => setPaymentOrder(null)} className="p-2 hover:bg-gray-100 rounded-lg transition">
                  <X size={20} className="text-gray-500" />
                </button>
              </div>

              {/* Three-column body */}
              <div className="flex flex-1 overflow-hidden">

                {/* LEFT — Payment Method & Options */}
                <div className="flex-1 overflow-y-auto p-6 space-y-5">

                  {/* Payment Method */}
                  <div>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">{t('cashier.orders.paymentMethod')}</p>
                    <div className="grid grid-cols-4 gap-3">
                      {METHODS.map(({ key, label, Icon }) => (
                        <button
                          key={key}
                          onClick={() => setPaymentFormData({ ...pf, paymentMethod: key })}
                          className={`flex flex-col items-center gap-2 py-4 rounded-xl border-2 transition-all ${
                            pf.paymentMethod === key
                              ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-sm'
                              : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:border-gray-300'
                          }`}
                        >
                          <Icon size={24} />
                          <span className="text-sm font-semibold">{label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Amount Received (Cash only) */}
                  {pf.paymentMethod === 'cash' && (
                    <div>
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{t('cashier.orders.amountReceived')}</p>
                      <input
                        type="number"
                        min="0"
                        step="1000"
                        value={pf.amountReceived || ''}
                        onChange={e => setPaymentFormData({ ...pf, amountReceived: parseFloat(e.target.value) || 0 })}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-lg font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <div className={`mt-2 rounded-xl px-4 py-3 flex items-center justify-between ${change > 0 ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-gray-200'}`}>
                        <span className={`text-sm font-medium ${change > 0 ? 'text-green-600' : 'text-gray-400'}`}>{t('cashier.orders.changeToGive')}</span>
                        <span className={`text-xl font-bold ${change > 0 ? 'text-green-600' : 'text-gray-500'}`}>{money(change)}</span>
                      </div>
                    </div>
                  )}

                  {/* Discount & Split in a row */}
                  <div className="grid grid-cols-2 gap-5">
                    {/* Discount */}
                    <div>
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{t('cashier.orders.applyDiscount')}</p>
                      <div className="flex gap-2 mb-2">
                        {['percentage', 'fixed'].map(dt => (
                          <button
                            key={dt}
                            onClick={() => setPaymentFormData({ ...pf, discountType: dt, discount: 0 })}
                            className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${
                              pf.discountType === dt
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                            }`}
                          >
                            {dt === 'percentage' ? '%' : "So'm"}
                          </button>
                        ))}
                      </div>
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          max={pf.discountType === 'percentage' ? 100 : orderTotal}
                          step={pf.discountType === 'percentage' ? 1 : 1000}
                          value={pf.discount || ''}
                          onChange={e => setPaymentFormData({ ...pf, discount: parseFloat(e.target.value) || 0 })}
                          placeholder={pf.discountType === 'percentage' ? '0 — 100' : '0'}
                          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium pointer-events-none">
                          {pf.discountType === 'percentage' ? '%' : "so'm"}
                        </span>
                      </div>
                      {discountAmt > 0 && (
                        <p className="text-xs text-green-600 font-semibold mt-1.5">-{money(discountAmt)}</p>
                      )}
                    </div>

                    {/* Split Bill */}
                    <div>
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{t('cashier.orders.splitBill')}</p>
                      <div className="flex gap-2 mb-2">
                        {[2, 3, 4].map(n => (
                          <button
                            key={n}
                            onClick={() => setPaymentFormData({ ...pf, splitWays: pf.splitWays === n ? null : n })}
                            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold border-2 transition-all ${
                              pf.splitWays === n
                                ? 'border-blue-600 bg-blue-50 text-blue-700'
                                : 'border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100'
                            }`}
                          >
                            {n} ways
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Split Parts (full width) */}
                  {pf.splitWays && splitParts.length > 0 && (
                    <div>
                      <div className="grid grid-cols-2 gap-3">
                        {splitParts.map((part, idx) => (
                          <div key={idx} className={`rounded-xl border-2 p-3 transition-all ${part.confirmed ? 'border-green-400 bg-green-50' : 'border-gray-200 bg-gray-50'}`}>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-bold text-gray-700">Part {idx + 1}</span>
                              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={part.confirmed}
                                  onChange={e => {
                                    const updated = [...splitParts];
                                    updated[idx] = { ...updated[idx], confirmed: e.target.checked };
                                    setSplitParts(updated);
                                  }}
                                  className="w-4 h-4 accent-green-500"
                                />
                                <span className={`text-xs font-semibold ${part.confirmed ? 'text-green-600' : 'text-gray-400'}`}>Paid</span>
                              </label>
                            </div>
                            <div className="relative mb-2">
                              <input
                                type="number"
                                min="0"
                                step="1000"
                                value={part.amount}
                                onChange={e => {
                                  const updated = [...splitParts];
                                  updated[idx] = { ...updated[idx], amount: e.target.value };
                                  setSplitParts(updated);
                                }}
                                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 pr-14"
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none">so'm</span>
                            </div>
                            <div className="flex gap-1.5">
                              {[
                                { key: 'cash', label: 'Cash' },
                                { key: 'card', label: 'Card' },
                                { key: 'qr_code', label: 'QR' },
                                { key: 'loan', label: 'Loan' },
                              ].map(({ key, label }) => (
                                <button
                                  key={key}
                                  onClick={() => {
                                    const updated = [...splitParts];
                                    updated[idx] = { ...updated[idx], method: key };
                                    setSplitParts(updated);
                                  }}
                                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                                    part.method === key
                                      ? 'bg-blue-600 text-white border-blue-600'
                                      : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-100'
                                  }`}
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                            {part.method === 'loan' && (
                              <div className="mt-2 space-y-2 pt-2 border-t border-amber-200">
                                <input
                                  type="text"
                                  value={part.loanName}
                                  onChange={e => { const u=[...splitParts]; u[idx]={...u[idx],loanName:e.target.value}; setSplitParts(u); }}
                                  placeholder={t('placeholders.customerName', 'Customer name')}
                                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-amber-400"
                                />
                                <PhoneInput
                                  value={part.loanPhone}
                                  onChange={e => { const u=[...splitParts]; u[idx]={...u[idx],loanPhone:e}; setSplitParts(u); }}
                                  label="Phone number"
                                  size="sm"
                                />
                                <DatePicker
                                  value={part.loanDueDate}
                                  onChange={v => { const u=[...splitParts]; u[idx]={...u[idx],loanDueDate:v}; setSplitParts(u); }}
                                  size="sm"
                                />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      {(() => {
                        const splitTotal = splitParts.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
                        const isValid = Math.abs(splitTotal - totalToPay) < 1;
                        return (
                          <div className="flex items-center justify-between mt-3 px-1">
                            <span className="text-xs font-bold text-gray-400 uppercase">{t('common.total')}</span>
                            <span className={`text-sm font-bold ${isValid ? 'text-green-600' : 'text-red-500'}`}>
                              {money(splitTotal)} / {money(totalToPay)}
                            </span>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* Loan Fields */}
                  {pf.paymentMethod === 'loan' && !pf.splitWays && (
                    <div className="space-y-3">
                      <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                        <AlertTriangle size={16} className="text-amber-500 mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-amber-700 font-medium">Order marked paid. Debt tracked until customer returns.</p>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{t('cashier.orders.customerName')}</p>
                          <input type="text" value={pf.loanName} onChange={e => setPaymentFormData({ ...pf, loanName: e.target.value })} placeholder={t('placeholders.nameDots', 'Name...')} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{t('common.phone')}</p>
                          <PhoneInput value={pf.loanPhone} onChange={v => setPaymentFormData({ ...pf, loanPhone: v })} size="md" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{t('cashier.orders.expectedReturn')}</p>
                          <DatePicker value={pf.loanDueDate} onChange={v => setPaymentFormData({ ...pf, loanDueDate: v })} size="sm" />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  <div>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{t('common.notes')}</p>
                    <textarea
                      value={pf.notes}
                      onChange={e => setPaymentFormData({ ...pf, notes: e.target.value })}
                      placeholder={t('placeholders.paymentNotes', 'Add payment notes...')}
                      rows={2}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    />
                  </div>
                </div>

                {/* RIGHT — Order Summary & Actions */}
                <div className="w-[320px] flex flex-col bg-gray-50 flex-shrink-0 border-l border-gray-200">
                  <div className="flex-1 overflow-y-auto p-5 space-y-4">

                    {/* Order Items */}
                    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">{t('common.items')}</p>
                        <span className="text-xs font-semibold text-blue-600">{Math.round(orderItems.reduce((s, i) => s + (Number(i.quantity) || 1), 0))} {t('common.items')}</span>
                      </div>
                      <div className="divide-y divide-gray-50">
                        {orderItems.length === 0 ? (
                          <p className="text-sm text-gray-400 text-center py-4">{t('common.noResults')}</p>
                        ) : orderItems.map((item, idx) => (
                          <div key={idx} className="px-4 py-2.5 flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{item.name || item.itemName || 'Item'}</p>
                              <p className="text-xs text-gray-400">{money(item.unitPrice || item.unit_price || item.price || 0)} x {item.quantity || 1}</p>
                            </div>
                            <span className="text-sm font-semibold text-gray-900 ml-3">{money((item.unitPrice || item.unit_price || item.price || 0) * (item.quantity || 1))}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Totals */}
                    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-500">{t('common.subtotal')}</span>
                        <span className="text-sm font-semibold text-gray-900">{money(orderTotal)}</span>
                      </div>
                      {discountAmt > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-green-600">{t('common.discount')}</span>
                          <span className="text-sm font-semibold text-green-600">-{money(discountAmt)}</span>
                        </div>
                      )}
                      <div className="border-t border-gray-200 pt-3 flex items-center justify-between">
                        <span className="text-base font-bold text-gray-900">{t('common.total')}</span>
                        <span className="text-2xl font-bold text-blue-600">{money(totalToPay)}</span>
                      </div>
                    </div>

                    {/* Method indicator */}
                    <div className="bg-white rounded-xl p-4 border border-gray-200 flex items-center gap-3">
                      {(() => { const m = METHODS.find(m => m.key === pf.paymentMethod); return m ? <m.Icon size={20} className="text-blue-600" /> : null; })()}
                      <div className="flex-1">
                        <span className="text-sm font-bold text-gray-900 capitalize">{pf.paymentMethod?.replace('_', ' ') || 'Cash'}</span>
                        {pf.splitWays && <span className="text-xs text-gray-400 ml-2">· Split {pf.splitWays} ways</span>}
                      </div>
                    </div>

                    {/* Cash change */}
                    {pf.paymentMethod === 'cash' && change > 0 && (
                      <div className="bg-green-50 rounded-xl p-4 border border-green-200 flex items-center justify-between">
                        <span className="text-sm font-medium text-green-700">{t('cashier.orders.change')}</span>
                        <span className="text-xl font-bold text-green-700">{money(change)}</span>
                      </div>
                    )}
                  </div>

                  {/* Actions footer — the source's "Print Receipt" button (between
                      Confirm Payment and Cancel) is removed here, per the standing
                      print-exclusion rule — see this file's header comment,
                      adaptation #4. */}
                  <div className="p-4 border-t border-gray-200 space-y-2 flex-shrink-0 bg-white">
                    <button
                      onClick={processPayment}
                      className="w-full flex items-center justify-center gap-2 px-5 py-3.5 bg-gray-900 text-white font-bold text-sm rounded-xl hover:bg-gray-800 transition-colors"
                    >
                      <Check size={18} className="text-green-400" />
                      {t('cashier.orders.confirmPayment')} · {money(totalToPay)}
                    </button>
                    <button
                      onClick={() => setPaymentOrder(null)}
                      className="w-full py-2 text-gray-400 font-medium text-sm hover:text-gray-600 transition-colors"
                    >
                      {t('common.cancel')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Delete Confirmation Modal */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-2xl max-w-md w-full">
            {/* Modal Header */}
            <div className="bg-red-50 border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertTriangle className="text-red-600" size={24} />
                <h2 className="text-lg font-bold text-gray-900">{t('common.delete')}</h2>
              </div>
              <button
                onClick={() => {
                  setDeleteId(null);
                  setDeleteReason('');
                }}
                className="p-2 hover:bg-white rounded-lg transition"
              >
                <X size={20} className="text-gray-600" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-4">
              <p className="text-gray-600">Are you sure you want to delete order #{deleteId}? This action cannot be undone.</p>

              {/* Reason Dropdown */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">{t('common.description')}</label>
                <Dropdown
                  value={deleteReason}
                  onChange={(value) => setDeleteReason(value)}
                  options={[
                    { value: '', label: t('admin.orders.selectReason') },
                    ...t('admin.orders.deleteReasons').map((reason) => ({
                      value: reason,
                      label: reason
                    }))
                  ]}
                  size="sm"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 mt-6">
                <button
                  onClick={handleDelete}
                  className="flex-1 px-4 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition flex items-center justify-center gap-2"
                >
                  <Trash2 size={18} />
                  {t('common.delete')}
                </button>
                <button
                  onClick={() => {
                    setDeleteId(null);
                    setDeleteReason('');
                  }}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-900 font-semibold rounded-lg hover:bg-gray-300 transition"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Reason Modal */}
      {cancelTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
            {/* Header */}
            <div className="bg-orange-50 border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <div className="flex items-center gap-3">
                <Ban className="text-orange-600" size={24} />
                <div>
                  <h2 className="text-lg font-bold text-gray-900">{t("admin.orders.cancelOrder")}</h2>
                  <p className="text-xs text-gray-500">#{cancelTarget.dailyNumber || '—'} · {cancelTarget.tableName || 'Walk-in'}</p>
                </div>
              </div>
              <button
                onClick={() => { setCancelTarget(null); setCancelReason(''); setCancelOtherText(''); }}
                className="p-2 hover:bg-white rounded-lg transition"
              >
                <X size={20} className="text-gray-600" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600">Please select a reason for cancelling this order:</p>

              <div className="space-y-2">
                {t('admin.orders.cancelReasons').map((r) => (
                  <button
                    key={r}
                    onClick={() => setCancelReason(r)}
                    className={`w-full text-left px-4 py-3 rounded-xl border transition flex items-center gap-3 ${
                      cancelReason === r
                        ? 'border-orange-400 bg-orange-50 text-orange-700'
                        : 'border-gray-200 hover:border-gray-300 text-gray-700'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      cancelReason === r ? 'border-orange-500' : 'border-gray-300'
                    }`}>
                      {cancelReason === r && <div className="w-2 h-2 rounded-full bg-orange-500" />}
                    </div>
                    <span className="text-sm font-medium">{r}</span>
                  </button>
                ))}
              </div>

              {cancelReason === 'Other' && (
                <textarea
                  value={cancelOtherText}
                  onChange={(e) => setCancelOtherText(e.target.value)}
                  placeholder={t('placeholders.describeReason', 'Describe the reason…')}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm resize-none h-20 focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400"
                />
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleCancelOrder}
                  disabled={!cancelReason || (cancelReason === 'Other' && !cancelOtherText.trim())}
                  className="flex-1 px-4 py-2.5 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Ban size={16} />
                  Cancel Order
                </button>
                <button
                  onClick={() => { setCancelTarget(null); setCancelReason(''); setCancelOtherText(''); }}
                  className="flex-1 px-4 py-2.5 bg-gray-200 text-gray-900 font-semibold rounded-lg hover:bg-gray-300 transition"
                >
                  Go Back
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="fixed bottom-6 right-6 bg-red-600 text-white px-6 py-4 rounded-lg shadow-lg flex items-center gap-3 z-50">
          <AlertTriangle size={20} />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

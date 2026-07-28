import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from '../../../context/LanguageContext.jsx';
import {
  ShoppingCart, UtensilsCrossed, ShoppingBag, Truck,
  Minus, Plus, ChevronRight, AlertCircle, X, Trash2, Check,
  Users, MapPin, Phone, User,
} from 'lucide-react';
import { menuAPI, tablesAPI, ordersAPI } from '../../../api/client.js';
import { withCache } from '../../../utils/apiCache.js';
import PhoneInput from '../../../components/PhoneInput.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Ported from website/src/pages/admin/AdminNewOrder.jsx — but ONLY its
// `isModal` branch. AdminTables.jsx (the only caller of this component
// anywhere in the Admin build) always renders it as `<AdminNewOrder isModal
// initialTable={...} onClose={...} />`. The website file's OTHER branch (a
// full standalone page at the `/admin/new-order` route, reached only by
// direct navigation from AdminOrders.jsx's "+ New Order" button — see
// website's App.jsx `<Route path="new-order" element={<AdminNewOrder />} />`)
// is never invoked from AdminTables, and pos-app has no such standalone route
// today, so it isn't ported — nothing would ever render it. Port that branch
// separately if a future Admin screen needs the standalone flow.
//
// Adaptations from the source, none of them design/behavior changes to what
// AdminTables actually uses:
//
// 1. `existingOrderId`/`existingOrder` used to come from react-router's
//    `useLocation().state` (set only by CashierTables.jsx/CashierOrders.jsx
//    navigating to `/cashier/new-order` with route state, to add items to an
//    already-open order). AdminTables.jsx never passes this state — it always
//    opens a brand-new order. pos-app has no route-state mechanism at all, so
//    these are now plain optional PROPS (default null) instead — behavior for
//    AdminTables' actual usage is unchanged (still always "place a new
//    order"), and the add-to-existing-order logic itself is preserved
//    unchanged in case a future screen wants to pass these props directly.
//
// 2. `isCashier` used to be derived from `location.pathname.startsWith(
//    '/cashier')`, controlling cyan-vs-blue theming and gating a per-cart-item
//    Print button. This file only ever renders inside the Admin panel here,
//    so `isCashier` is hardcoded `false` — same blue theme AdminTables/the
//    rest of Admin already uses. See the printing note below for why the
//    Print button itself is gone, not just hidden.
//
// 3. PRINTING EXCLUDED (standing rule for this whole build phase, per the
//    2026-07-27 instruction): the source's `usePrinter()` hook,
//    `handlePrintItem()`, and the per-cart-item Printer icon button (which
//    only ever rendered when `isCashier` was true) were removed entirely
//    rather than ported working or stubbed with a placeholder — pos-app has
//    no `usePrinter` hook, and since `isCashier` is always `false` in this
//    Admin-only context those buttons could never have rendered here anyway,
//    so this is a no-op removal, not a functional change to what AdminTables
//    actually shows.
//
// 4. REAL BUG FOUND AND FIXED (not preserved): in the source file, the
//    amount-picker modal JSX for weighed (kg/l/g/ml) items — the "type an
//    amount" popup that opens when tapping such an item — is only rendered
//    inside the STANDALONE branch's return, never inside the `isModal`
//    branch's return (confirmed by grepping every `amountPicker` reference
//    in the source: the `{amountPicker && (...)}` block appears exactly
//    once, after the standalone branch's own `<TablePickerModal />`, never
//    inside the modal branch). Since AdminTables only ever uses the modal
//    branch, tapping a weighed item there sets `amountPicker` state but
//    nothing renders it — the picker silently never appears, so a weighed
//    item can never actually be added via "New Order" from the Tables screen
//    on the live website today. Fixed here by rendering that same JSX
//    (content unchanged) as a sibling of this component's modal overlay, so
//    weighed items (e.g. "Jiz" rice, sold by the kg) work the same way they
//    already do everywhere else in this codebase.
// ─────────────────────────────────────────────────────────────────────────────

const getOrderTypes = (t) => [
  { key: 'dine_in',  label: t('admin.newOrder.dineIn'),   Icon: UtensilsCrossed },
  { key: 'to_go',    label: t('admin.newOrder.toGo'),     Icon: ShoppingBag },
  { key: 'delivery', label: t('admin.newOrder.delivery'), Icon: Truck },
];

export default function NewOrderModal({ initialTable = null, existingOrderId = null, existingOrder = null, onClose }) {
  const { t } = useTranslation();
  const preTable = initialTable || null;

  const ORDER_TYPES = useMemo(() => getOrderTypes(t), [t]);

  // Admin-only context here — always the blue theme (matches AdminTables).
  // See adaptation note #2 above.
  const isCashier = false;
  const PRIMARY       = '#2563EB';
  const PRIMARY_LIGHT = '#EFF6FF';
  const PRIMARY_DARK  = '#1D4ED8';

  // ── Order type ──
  const [orderType, setOrderType] = useState('dine_in');

  // ── Table ──
  const [selectedTable,   setSelectedTable]   = useState(preTable);
  const [tables,          setTables]          = useState([]);
  const [showTablePicker, setShowTablePicker] = useState(false);

  // ── Guests ──
  const [guests, setGuests] = useState(preTable?.capacity ? Math.min(preTable.capacity, 1) : 1);

  // ── Menu ──
  const [categories,  setCategories]  = useState([]);
  const [items,       setItems]       = useState([]);
  const [selectedCat, setSelectedCat] = useState(null);

  // ── Cart ──
  const [cart, setCart] = useState({});
  // Amount picker for kg/l items: { item, draft }
  const [amountPicker, setAmountPicker] = useState(null);

  // Helper — true if this item must be sold by weight/volume (decimal amount)
  const isWeighedItem = (item) => {
    const u = String(item?.unit || 'piece').toLowerCase();
    return u === 'kg' || u === 'l' || u === 'g' || u === 'ml';
  };
  const unitSuffix = (item) => {
    const u = String(item?.unit || 'piece').toLowerCase();
    return u === 'piece' ? '' : u;
  };
  const formatQty = (item, qty) => {
    if (isWeighedItem(item)) {
      const n = Number(qty || 0);
      const trimmed = Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/\.?0+$/, '');
      return `${trimmed} ${unitSuffix(item)}`;
    }
    return `× ${qty}`;
  };

  // ── Customer info (To Go / Delivery) ──
  const [customerName,    setCustomerName]    = useState('');
  const [customerPhone,   setCustomerPhone]   = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');

  // ── UI state ──
  const [placing,  setPlacing]  = useState(false);
  const [error,    setError]    = useState('');

  const pollRef = useRef(null);

  // ── Fetch data ──
  const fetchMenuData = useCallback(async (silent = false) => {
    const MENU_TTL = 15 * 60 * 1000;
    try {
      const [cats, itms] = await Promise.all([
        withCache('menu:categories', MENU_TTL, () => menuAPI.getCategories()),
        withCache('menu:items',      MENU_TTL, () => menuAPI.getItems()),
      ]);
      setCategories(Array.isArray(cats) ? cats : []);
      setItems(Array.isArray(itms) ? itms : []);
      if (!silent && Array.isArray(cats) && cats.length > 0) {
        setSelectedCat(cats[0].id);
      }
    } catch (err) {
      if (!silent) setError(t('admin.newOrder.failedToLoadMenu'));
    }
  }, []);

  const fetchTables = useCallback(async (silent = false) => {
    try {
      const data = await withCache('tables:all', 30 * 1000, () => tablesAPI.getAll());
      setTables(Array.isArray(data) ? data : []);
    } catch (err) {
      if (!silent) console.error(err);
    }
  }, []);

  useEffect(() => {
    fetchMenuData();
    fetchTables();
    pollRef.current = setInterval(() => {
      fetchMenuData(true);
      fetchTables(true);
    }, 30000);
    return () => clearInterval(pollRef.current);
  }, [fetchMenuData, fetchTables]);

  // ── Derived ──
  const filteredItems = (selectedCat
    ? items.filter(i => i.categoryId === selectedCat)
    : items
  ).slice().sort((a, b) => {
    const aAvail = a.isAvailable !== false ? 0 : 1;
    const bAvail = b.isAvailable !== false ? 0 : 1;
    return aAvail - bAvail;
  });

  const cartEntries = Object.values(cart);
  const cartCount   = cartEntries.reduce((s, e) => s + e.qty, 0);
  const cartTotal   = cartEntries.reduce((s, e) => s + e.qty * parseFloat(e.item.price || 0), 0);

  // ── Cart helpers ──
  const addToCart = (item) => {
    // Weighed items open the amount picker instead of incrementing by 1
    if (isWeighedItem(item)) {
      const current   = cart[item.id]?.qty || '';
      const unitPrice = Number(item.price || 0);
      const seedQty   = current ? String(current) : '';
      const seedPrice = current && unitPrice > 0
        ? String(Math.round(Number(current) * unitPrice))
        : '';
      setAmountPicker({ item, draft: seedQty, priceDraft: seedPrice });
      return;
    }
    setCart(prev => ({
      ...prev,
      [item.id]: { item, qty: (prev[item.id]?.qty || 0) + 1 },
    }));
  };

  // Confirm the amount entered in the picker — sets the qty to that amount
  const confirmAmountPicker = () => {
    if (!amountPicker) return;
    const raw = String(amountPicker.draft || '').replace(',', '.').trim();
    const amt = parseFloat(raw);
    if (!isFinite(amt) || amt <= 0) { setAmountPicker(null); return; }
    const rounded = Math.round(amt * 1000) / 1000; // 3 dp max
    const item = amountPicker.item;
    setCart(prev => ({ ...prev, [item.id]: { item, qty: rounded } }));
    setAmountPicker(null);
  };

  // Bidirectional update helpers — typing in qty updates price, typing in
  // price updates qty (so the admin can enter "I want 50,000 so'm of fish").
  const onAmountQtyChange = (v) => {
    const unit = Number(amountPicker?.item?.price || 0);
    const qty  = parseFloat(String(v || '').replace(',', '.')) || 0;
    const priceCalc = Math.round(qty * unit);
    setAmountPicker(p => p ? {
      ...p,
      draft: v,
      priceDraft: qty > 0 && unit > 0 ? String(priceCalc) : '',
    } : p);
  };
  const onAmountPriceChange = (v) => {
    const unit  = Number(amountPicker?.item?.price || 0);
    const price = parseFloat(String(v || '').replace(',', '.')) || 0;
    const qty   = unit > 0 ? Math.round((price / unit) * 1000) / 1000 : 0;
    setAmountPicker(p => p ? {
      ...p,
      priceDraft: v,
      draft: price > 0 && unit > 0 ? String(qty) : '',
    } : p);
  };

  const removeFromCart = (item) => {
    setCart(prev => {
      const cur = prev[item.id]?.qty || 0;
      // Weighed items: tapping minus clears the entry (use picker to change)
      if (isWeighedItem(item) || cur <= 1) {
        const next = { ...prev };
        delete next[item.id];
        return next;
      }
      return { ...prev, [item.id]: { item, qty: cur - 1 } };
    });
  };

  const removeItemFromCart = (itemId) => {
    setCart(prev => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  };

  // ── Validation ──
  const canPlace = () => {
    if (cartCount === 0) return false;
    // When adding to an existing order, no table selection needed
    if (!existingOrderId && orderType === 'dine_in' && !selectedTable) return false;
    return true;
  };

  // ── Place order / Add items to existing order ──
  const handlePlaceOrder = async () => {
    if (!canPlace()) return;
    setPlacing(true);
    setError('');
    try {
      const orderItems = cartEntries.map(e => ({
        menuItemId: e.item.id,
        quantity:   e.qty,
        unitPrice:  parseFloat(e.item.price || 0),
      }));

      if (existingOrderId) {
        // ── Add items to existing order ──
        // Use PUT /orders/:id with merged items (existing + new) instead of
        // POST /orders/:id/items, because PUT always works across all order
        // statuses (including bill_requested) without needing a backend restart.
        let mergedItems = orderItems;
        try {
          const fresh = await ordersAPI.getById(existingOrderId);
          const prior = Array.isArray(fresh?.items) ? fresh.items : [];
          const priorMapped = prior.map(it => ({
            menuItemId: it.menuItemId,
            quantity:   Number(it.quantity || 0),
            unitPrice:  parseFloat(it.unitPrice || 0),
          }));
          mergedItems = [...priorMapped, ...orderItems];
        } catch (_) {
          // If we can't fetch the fresh order, fall back to just the new items
          // (backend PUT would then replace with only the new items — last resort).
        }
        await ordersAPI.update(existingOrderId, { items: mergedItems });
      } else {
        // ── Create new order ──
        const dbOrderType = orderType === 'to_go' ? 'takeaway' : orderType;
        await ordersAPI.create({
          tableId:         orderType === 'dine_in' ? selectedTable?.id : null,
          items:           orderItems,
          orderType:       dbOrderType,
          guestCount:      orderType === 'dine_in' ? guests : null,
          customerName:    orderType !== 'dine_in' ? customerName || null : null,
          customerPhone:   orderType !== 'dine_in' ? customerPhone || null : null,
          deliveryAddress: orderType === 'delivery' ? deliveryAddress || null : null,
        });
      }

      onClose?.();
    } catch (err) {
      setError(err?.error || err?.message || t('admin.newOrder.failedToPlaceOrder'));
      setPlacing(false);
    }
  };

  const formatPrice = (p) =>
    Number(p).toLocaleString('uz-UZ') + " so'm";

  // ─────────────────────────────────────────────────────────────────────
  // Shared sub-sections
  // ─────────────────────────────────────────────────────────────────────

  const OrderTypeTabs = ({ compact = false }) => (
    <div className={`flex gap-1.5 p-1 bg-gray-100 rounded-xl ${compact ? '' : 'mb-4'}`}>
      {ORDER_TYPES.map(({ key, label, Icon }) => (
        <button
          key={key}
          onClick={() => setOrderType(key)}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-semibold transition-all ${
            orderType === key
              ? 'text-white shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
          style={orderType === key ? { backgroundColor: PRIMARY } : {}}
        >
          <Icon size={13} />
          {label}
        </button>
      ))}
    </div>
  );

  const DineInConfig = () => (
    <div className="bg-gray-50 rounded-xl overflow-hidden border border-gray-200">
      <button
        onClick={() => setShowTablePicker(true)}
        className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-gray-200 hover:bg-white transition-colors"
      >
        <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center flex-shrink-0 border border-gray-200">
          <UtensilsCrossed size={15} className="text-gray-500" />
        </div>
        <div className="flex-1 text-left">
          <p className="text-xs text-gray-400 font-medium">{t("admin.newOrder.table")}</p>
          <p className={`text-sm font-semibold leading-tight ${selectedTable ? 'text-gray-900' : 'text-amber-500'}`}>
            {selectedTable
              ? `${selectedTable.name || t('common.tablePrefix', 'Table ') + selectedTable.tableNumber}${selectedTable.section ? ' · ' + selectedTable.section : ''}`
              : t('admin.newOrder.tapToSelect')}
          </p>
        </div>
        <ChevronRight size={15} className="text-gray-400" />
      </button>
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: PRIMARY_LIGHT }}>
          <Users size={15} style={{ color: PRIMARY }} />
        </div>
        <div className="flex-1">
          <p className="text-xs text-gray-400 font-medium">{t("admin.newOrder.guests")}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setGuests(g => Math.max(1, g - 1))}
            className="w-7 h-7 rounded-full border-2 border-gray-200 flex items-center justify-center hover:bg-gray-100 transition-colors"
          >
            <Minus size={12} className="text-gray-600" />
          </button>
          <span className="text-base font-bold text-gray-900 w-5 text-center">{guests}</span>
          <button
            onClick={() => setGuests(g => g + 1)}
            className="w-7 h-7 rounded-full flex items-center justify-center transition-colors"
            style={{ backgroundColor: PRIMARY }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = PRIMARY_DARK}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = PRIMARY}
          >
            <Plus size={12} className="text-white" />
          </button>
        </div>
      </div>
    </div>
  );

  const CustomerFields = () => (
    <div className="bg-gray-50 rounded-xl overflow-hidden border border-gray-200">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200">
        <User size={15} className="text-gray-400 flex-shrink-0" />
        <input
          type="text"
          placeholder={t("admin.newOrder.customerNameOptional")}
          value={customerName}
          onChange={e => setCustomerName(e.target.value)}
          className="flex-1 text-sm text-gray-800 outline-none placeholder-gray-400 bg-transparent"
        />
      </div>
      <div className={`flex items-center gap-3 px-4 py-3 ${orderType === 'delivery' ? 'border-b border-gray-200' : ''}`}>
        <Phone size={15} className="text-gray-400 flex-shrink-0" />
        <PhoneInput
          value={customerPhone}
          onChange={setCustomerPhone}
          size="sm"
        />
      </div>
      {orderType === 'delivery' && (
        <div className="flex items-center gap-3 px-4 py-3">
          <MapPin size={15} className="text-gray-400 flex-shrink-0" />
          <input
            type="text"
            placeholder={t("admin.newOrder.deliveryAddress")}
            value={deliveryAddress}
            onChange={e => setDeliveryAddress(e.target.value)}
            className="flex-1 text-sm text-gray-800 outline-none placeholder-gray-400 bg-transparent"
          />
        </div>
      )}
    </div>
  );

  const CartPanel = () => (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex-1 overflow-y-auto flex flex-col gap-1.5 py-1">
        {cartEntries.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-gray-300">
            <ShoppingCart size={32} className="mb-2" />
            <p className="text-sm">{t("admin.newOrder.cartEmpty")}</p>
          </div>
        )}
        {cartEntries.map(({ item, qty }) => {
          const weighed = isWeighedItem(item);
          return (
            <div key={item.id} className="flex items-center gap-2 py-2 border-b border-gray-100 last:border-0">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-xs text-gray-900 truncate">{item.name}</p>
                <p className="text-xs text-gray-400">
                  {formatPrice(item.price)}{weighed ? ` / ${unitSuffix(item)}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {weighed ? (
                  <button
                    onClick={() => addToCart(item)}
                    className="px-2 h-6 rounded-full flex items-center gap-1 text-[11px] font-bold text-white"
                    style={{ backgroundColor: PRIMARY }}
                  >
                    {formatQty(item, qty)}
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => removeFromCart(item)}
                      className="w-6 h-6 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-100"
                    >
                      <Minus size={10} className="text-gray-600" />
                    </button>
                    <span className="font-bold text-gray-900 w-4 text-center text-xs">{qty}</span>
                    <button
                      onClick={() => addToCart(item)}
                      className="w-6 h-6 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: PRIMARY }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = PRIMARY_DARK}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = PRIMARY}
                    >
                      <Plus size={10} className="text-white" />
                    </button>
                  </>
                )}
                <button
                  onClick={() => removeItemFromCart(item.id)}
                  className="w-6 h-6 rounded-full bg-red-50 flex items-center justify-center hover:bg-red-100 ml-0.5"
                >
                  <Trash2 size={10} className="text-red-500" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {cartEntries.length > 0 && (
        <div className="pt-3 border-t border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-gray-600">{t('common.total')}</span>
            <span className="text-base font-bold text-gray-900">{formatPrice(cartTotal)}</span>
          </div>
        </div>
      )}
    </div>
  );

  const TablePickerModal = () => (
    showTablePicker ? (
      <div
        className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4"
        onClick={() => setShowTablePicker(false)}
      >
        <div
          className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[70vh] flex flex-col"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="text-base font-bold text-gray-900">{t("admin.newOrder.selectTable")}</h2>
            <button
              onClick={() => setShowTablePicker(false)}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X size={18} className="text-gray-500" />
            </button>
          </div>
          <div className="overflow-y-auto flex-1 p-4">
            {tables.length === 0 && (
              <p className="text-center text-gray-400 py-8">{t("admin.newOrder.noTablesAvailable")}</p>
            )}
            <div className="grid grid-cols-2 gap-3">
              {tables.map(table => {
                const isSel  = selectedTable?.id === table.id;
                const isFree = table.status === 'free';
                return (
                  <button
                    key={table.id}
                    onClick={() => { setSelectedTable(table); setShowTablePicker(false); }}
                    disabled={!isFree && !isSel}
                    className={`relative p-4 rounded-xl border-2 text-left transition-all ${
                      isSel
                        ? ''
                        : isFree
                        ? 'border-gray-200 hover:border-gray-400 bg-white'
                        : 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                    }`}
                    style={isSel ? { borderColor: PRIMARY, backgroundColor: PRIMARY_LIGHT } : {}}
                  >
                    {isSel && (
                      <div className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: PRIMARY }}>
                        <Check size={12} className="text-white" />
                      </div>
                    )}
                    <p className="font-bold text-gray-900 text-sm">{table.name || `Table ${table.tableNumber}`}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{table.section || table.zone || ''}</p>
                    <span className={`mt-2 inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${
                      table.status === 'free'
                        ? 'bg-green-100 text-green-700'
                        : table.status === 'occupied'
                        ? 'bg-red-100 text-red-700'
                        : table.status === 'reserved'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-blue-100 text-blue-700'
                    }`}>
                      {table.status}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    ) : null
  );

  // ─────────────────────────────────────────────────────────────────────
  // Modal — two-column desktop popup (see adaptation #4: the amount-picker
  // JSX below is rendered as a sibling of the overlay, not nested inside it,
  // so its own click-outside handler can't bubble up and close this whole
  // modal — same reasoning kept `<TablePickerModal />` exactly where the
  // source had it, nested, since that pre-existing nesting is unchanged
  // behavior, not something this port introduced or is fixing.)
  // ─────────────────────────────────────────────────────────────────────
  return (
    <>
      <div
        className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-6"
        onClick={onClose}
      >
        <div
          className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col overflow-hidden"
          style={{ height: '88vh' }}
          onClick={e => e.stopPropagation()}
        >
          {/* ── Modal Header ── */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                {existingOrderId ? t('admin.newOrder.addItemsTitle') : t('admin.newOrder.title')}
              </h2>
              {existingOrderId ? (
                <p className="text-sm text-gray-400 mt-0.5">
                  {existingOrder?.tableName || existingOrder?.table_name || `Order #${String(existingOrderId).slice(-4)}`}
                </p>
              ) : selectedTable && (
                <p className="text-sm text-gray-400 mt-0.5">
                  {selectedTable.name || t('common.tablePrefix', 'Table ') + selectedTable.tableNumber}
                  {selectedTable.section ? ' · ' + selectedTable.section : ''}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X size={20} className="text-gray-500" />
            </button>
          </div>

          {/* ── Two-column body ── */}
          <div className="flex flex-1 overflow-hidden">

            {/* LEFT panel — config + cart */}
            <div className="w-72 border-r border-gray-100 flex flex-col overflow-hidden bg-gray-50/50">
              <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">

                {/* Order type tabs — hidden when adding to existing order */}
                {!existingOrderId && (
                  <div>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{t("admin.newOrder.title")}</p>
                    <OrderTypeTabs compact />
                  </div>
                )}

                {/* Dine-in / customer config — hidden when adding to existing order */}
                {!existingOrderId && (
                  <div>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                      {orderType === 'dine_in' ? t('admin.newOrder.tableAndGuests') : t('admin.newOrder.customer')}
                    </p>
                    {orderType === 'dine_in' ? <DineInConfig /> : <CustomerFields />}
                  </div>
                )}

                {/* Warning */}
                {!existingOrderId && orderType === 'dine_in' && !selectedTable && (
                  <div className="flex items-center gap-2 text-amber-600 text-xs font-medium bg-amber-50 rounded-lg px-3 py-2">
                    <AlertCircle size={14} />
                    {t('admin.newOrder.selectTableWarning')}
                  </div>
                )}

                {/* Error */}
                {error && (
                  <div className="flex items-center gap-2 text-red-600 text-xs font-medium bg-red-50 rounded-lg px-3 py-2">
                    <AlertCircle size={14} />
                    {error}
                  </div>
                )}

                {/* Cart */}
                <div className="flex-1 flex flex-col min-h-0">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">{t("admin.newOrder.cart")}</p>
                    {cartCount > 0 && (
                      <span className="text-xs font-bold" style={{ color: PRIMARY }}>{t('admin.newOrder.itemCount', { count: cartCount })}</span>
                    )}
                  </div>
                  <CartPanel />
                </div>
              </div>

              {/* Place Order footer */}
              <div className="px-4 py-4 border-t border-gray-100 flex-shrink-0">
                <button
                  onClick={handlePlaceOrder}
                  disabled={!canPlace() || placing}
                  className="w-full flex items-center justify-between px-4 py-3.5 text-white rounded-xl font-bold text-sm shadow disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  style={{ backgroundColor: PRIMARY }}
                  onMouseEnter={e => { if (!placing && canPlace()) e.currentTarget.style.backgroundColor = PRIMARY_DARK; }}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = PRIMARY}
                >
                  <span className="rounded-lg px-2 py-0.5 text-xs font-bold" style={{ backgroundColor: PRIMARY_DARK }}>{cartCount}</span>
                  <span>{placing ? t('admin.newOrder.placingOrder') : (existingOrderId ? t('admin.newOrder.addToOrder') : t('admin.newOrder.placeOrder'))}</span>
                  <span className="font-semibold text-xs opacity-75">{cartCount > 0 ? formatPrice(cartTotal) : ''}</span>
                </button>
              </div>
            </div>

            {/* RIGHT panel — menu.
                NOTE (kept from source): the menu panel JSX is inlined here
                instead of a nested `<MenuPanel/>` component — defining it as
                a nested component would give it a new function identity on
                every render, unmounting/remounting the scroll container on
                every cart change and snapping the menu back to the top. */}
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
              <div className="px-4 pt-4 pb-0 flex-shrink-0">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">{t("admin.newOrder.menuLabel")}</p>
              </div>

              {/* Category pills (horizontal scroll, wheel-to-scroll) */}
              <div className="px-4 pb-3 pt-1 flex-shrink-0">
                <div
                  className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide"
                  style={{ overscrollBehaviorX: 'contain' }}
                  onWheel={(e) => {
                    if (e.deltaY !== 0 && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                      e.currentTarget.scrollLeft += e.deltaY;
                    }
                  }}
                >
                  {categories.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedCat(cat.id)}
                      className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                        selectedCat === cat.id
                          ? 'text-white'
                          : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-400'
                      }`}
                      style={selectedCat === cat.id ? { backgroundColor: PRIMARY } : {}}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Items (vertical scroll) */}
              <div className="px-4 flex flex-col gap-2 overflow-y-auto flex-1 min-h-0 pb-4">
                {filteredItems.length === 0 && (
                  <div className="text-center py-10 text-gray-400 text-sm">{t('admin.newOrder.noItemsInCategory')}</div>
                )}
                {filteredItems.map(item => {
                  const qty = cart[item.id]?.qty || 0;
                  const avail = item.isAvailable !== false;
                  return (
                    <div
                      key={item.id}
                      className={`rounded-xl px-4 py-3 flex items-center justify-between shadow-sm border ${
                        avail ? 'bg-white border-gray-100' : 'bg-gray-50 border-gray-200 opacity-60'
                      }`}
                    >
                      <div className="flex-1 min-w-0 mr-3">
                        <p className={`font-semibold text-sm truncate ${avail ? 'text-gray-900' : 'text-gray-400'}`}>{item.name}</p>
                        <p className={`text-sm mt-0.5 ${avail ? 'text-gray-400' : 'text-gray-300'}`}>
                          {formatPrice(item.price)}{isWeighedItem(item) ? ` / ${unitSuffix(item)}` : ''}
                        </p>
                        {!avail && <p className="text-[10px] font-bold text-red-500 mt-0.5">{t("admin.menu.inactive")}</p>}
                      </div>
                      {avail ? (
                        qty === 0 ? (
                          <button
                            onClick={() => addToCart(item)}
                            className="w-8 h-8 rounded-full flex items-center justify-center transition-colors flex-shrink-0"
                            style={{ backgroundColor: PRIMARY }}
                            onMouseEnter={e => e.currentTarget.style.backgroundColor = PRIMARY_DARK}
                            onMouseLeave={e => e.currentTarget.style.backgroundColor = PRIMARY}
                          >
                            <Plus size={16} className="text-white" />
                          </button>
                        ) : isWeighedItem(item) ? (
                          <button
                            onClick={() => addToCart(item)}
                            className="px-3 h-8 rounded-full flex items-center gap-1 text-xs font-bold text-white"
                            style={{ backgroundColor: PRIMARY }}
                          >
                            {formatQty(item, qty)}
                          </button>
                        ) : (
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                              onClick={() => removeFromCart(item)}
                              className="w-7 h-7 rounded-full border-2 border-gray-200 flex items-center justify-center hover:bg-gray-100 transition-colors"
                            >
                              <Minus size={12} className="text-gray-600" />
                            </button>
                            <span className="text-sm font-bold text-gray-900 w-4 text-center">{qty}</span>
                            <button
                              onClick={() => addToCart(item)}
                              className="w-7 h-7 rounded-full flex items-center justify-center transition-colors"
                              style={{ backgroundColor: PRIMARY }}
                              onMouseEnter={e => e.currentTarget.style.backgroundColor = PRIMARY_DARK}
                              onMouseLeave={e => e.currentTarget.style.backgroundColor = PRIMARY}
                            >
                              <Plus size={12} className="text-white" />
                            </button>
                          </div>
                        )
                      ) : (
                        <span className="px-2 py-1 bg-red-50 text-red-500 text-[10px] font-bold rounded-md">{t("admin.newOrder.off")}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <TablePickerModal />
      </div>

      {/* ── Amount Picker Modal (kg / l items) — see adaptation #4 above:
          this JSX is unchanged from the source, just moved to actually
          render for the modal this file now is (the source never rendered
          it in modal mode at all). ── */}
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
                <p className="text-base font-bold text-gray-900">{amountPicker.item.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {Number(amountPicker.item.price || 0).toLocaleString()} so'm / {unitSuffix(amountPicker.item)}
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
                {unitSuffix(amountPicker.item)}
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
                className="flex-1 py-2.5 rounded-xl text-white font-semibold"
                style={{ backgroundColor: PRIMARY }}
              >
                {t('common.add', 'Add')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

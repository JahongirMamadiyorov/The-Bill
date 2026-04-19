import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from '../../context/LanguageContext';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  ArrowLeft, ShoppingCart, UtensilsCrossed, ShoppingBag, Truck,
  Minus, Plus, ChevronRight, AlertCircle, X, Trash2, Check,
  Users, MapPin, Phone, User,
} from 'lucide-react';
import { menuAPI, tablesAPI, ordersAPI } from '../../api/client';
import PhoneInput from '../../components/PhoneInput';

const getOrderTypes = (t) => [
  { key: 'dine_in',  label: t('admin.newOrder.dineIn'),   Icon: UtensilsCrossed },
  { key: 'to_go',    label: t('admin.newOrder.toGo'),     Icon: ShoppingBag },
  { key: 'delivery', label: t('admin.newOrder.delivery'), Icon: Truck },
];

export default function AdminNewOrder({ isModal = false, initialTable = null, onClose = null }) {
  const navigate  = useNavigate();
  const { t } = useTranslation();
  const location  = useLocation();
  const preTable  = initialTable || location.state?.table || null;

  // Build ORDER_TYPES inside component so it has access to t()
  const ORDER_TYPES = useMemo(() => getOrderTypes(t), [t]);

  // ── "Add items to existing order" mode ──
  const existingOrderId = location.state?.existingOrderId || null;
  const existingOrder   = location.state?.existingOrder   || null;

  // ── Role-aware color (cashier=cyan, admin/waitress=blue) ──
  const isCashier = location.pathname.startsWith('/cashier');
  const PRIMARY   = isCashier ? '#0891B2' : '#2563EB';
  const PRIMARY_LIGHT = isCashier ? '#E0F2FE' : '#EFF6FF';
  const PRIMARY_DARK  = isCashier ? '#0E7490' : '#1D4ED8';

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

  // ── Customer info (To Go / Delivery) ──
  const [customerName,    setCustomerName]    = useState('');
  const [customerPhone,   setCustomerPhone]   = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');

  // ── UI state ──
  const [placing,  setPlacing]  = useState(false);
  const [error,    setError]    = useState('');
  const [showCart, setShowCart] = useState(false); // only used in standalone mode

  const pollRef = useRef(null);

  // ── Fetch data ──
  const fetchMenuData = useCallback(async (silent = false) => {
    try {
      const [cats, itms] = await Promise.all([
        menuAPI.getCategories(),
        menuAPI.getItems(),
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
      const data = await tablesAPI.getAll();
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
    setCart(prev => ({
      ...prev,
      [item.id]: { item, qty: (prev[item.id]?.qty || 0) + 1 },
    }));
  };

  const removeFromCart = (item) => {
    setCart(prev => {
      const cur = prev[item.id]?.qty || 0;
      if (cur <= 1) {
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
        await ordersAPI.addItems(existingOrderId, orderItems);
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

      if (isModal && onClose) {
        onClose();
      } else {
        const path = window.location.pathname;
        if (path.startsWith('/cashier'))  navigate('/cashier');
        else if (path.startsWith('/waitress')) navigate('/waitress/orders');
        else navigate('/admin/orders');
      }
    } catch (err) {
      setError(err?.error || err?.message || t('admin.newOrder.failedToPlaceOrder'));
      setPlacing(false);
    }
  };

  const formatPrice = (p) =>
    Number(p).toLocaleString('uz-UZ') + " so'm";

  const freeTables = tables.filter(t => t.status === 'free' || t.id === selectedTable?.id);

  // ─────────────────────────────────────────────────────────────────────
  // Shared sub-sections (used by both layouts)
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
        {cartEntries.map(({ item, qty }) => (
          <div key={item.id} className="flex items-center gap-2 py-2 border-b border-gray-100 last:border-0">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-xs text-gray-900 truncate">{item.name}</p>
              <p className="text-xs text-gray-400">{formatPrice(item.price)}</p>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
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
              <button
                onClick={() => removeItemFromCart(item.id)}
                className="w-6 h-6 rounded-full bg-red-50 flex items-center justify-center hover:bg-red-100 ml-0.5"
              >
                <Trash2 size={10} className="text-red-500" />
              </button>
            </div>
          </div>
        ))}
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

  const MenuPanel = ({ fullHeight = false }) => (
    <div className={`flex flex-col ${fullHeight ? 'h-full' : ''}`}>
      {/* Category pills */}
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
      {/* Items */}
      <div className={`px-4 flex flex-col gap-2 ${fullHeight ? 'overflow-y-auto flex-1 pb-4' : 'pb-32'}`}>
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
                <p className={`text-sm mt-0.5 ${avail ? 'text-gray-400' : 'text-gray-300'}`}>{formatPrice(item.price)}</p>
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
  // MODAL MODE — two-column desktop popup
  // ─────────────────────────────────────────────────────────────────────
  if (isModal) {
    return (
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

            {/* RIGHT panel — menu */}
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="px-4 pt-4 pb-0 flex-shrink-0">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">{t("admin.newOrder.menuLabel")}</p>
              </div>
              <MenuPanel fullHeight />
            </div>
          </div>
        </div>

        <TablePickerModal />
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  // STANDALONE PAGE MODE — Desktop-friendly two-column layout
  // ─────────────────────────────────────────────────────────────────────
  return (
    <div className="h-[calc(100vh-0px)] flex flex-col bg-gray-50 overflow-hidden">

      {/* ── Header ── */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft size={20} className="text-gray-700" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {existingOrderId ? t('admin.newOrder.addItemsTitle') : t('admin.newOrder.title')}
            </h1>
            {existingOrderId ? (
              <p className="text-sm text-gray-500">
                {existingOrder?.tableName || existingOrder?.table_name || `Order #${String(existingOrderId).slice(-4)}`}
              </p>
            ) : selectedTable && (
              <p className="text-sm text-gray-500">
                {selectedTable.name || t('common.tablePrefix', 'Table ') + selectedTable.tableNumber}
                {selectedTable.section ? ' · ' + selectedTable.section : ''}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {cartCount > 0 && (
            <span className="text-sm font-semibold text-gray-500">
              {t('admin.newOrder.itemCount', { count: cartCount })} · {formatPrice(cartTotal)}
            </span>
          )}
        </div>
      </div>

      {/* ── Two-column body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ══════════════════════ LEFT — Menu ══════════════════════ */}
        <div className="flex-1 flex flex-col overflow-hidden border-r border-gray-200">
          {/* Category tabs */}
          <div className="bg-white px-6 py-4 border-b border-gray-100 flex-shrink-0">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">{t("admin.newOrder.menuLabel")}</p>
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
                  className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                    selectedCat === cat.id
                      ? 'text-white shadow-sm'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                  style={selectedCat === cat.id ? { backgroundColor: PRIMARY } : {}}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>
          {/* Items grid */}
          <div className="flex-1 overflow-y-auto p-6">
            {filteredItems.length === 0 && (
              <div className="text-center py-16 text-gray-400 text-sm">{t('admin.newOrder.noItemsInCategory')}</div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {filteredItems.map(item => {
                const qty = cart[item.id]?.qty || 0;
                const avail = item.isAvailable !== false;
                return (
                  <div
                    key={item.id}
                    className={`rounded-xl px-4 py-3.5 flex items-center justify-between border transition-all ${
                      qty > 0
                        ? 'shadow-sm'
                        : avail
                        ? 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-sm'
                        : 'bg-gray-50 border-gray-200 opacity-50'
                    }`}
                    style={qty > 0 ? { backgroundColor: PRIMARY_LIGHT, borderColor: PRIMARY + '66' } : {}}
                  >
                    <div className="flex-1 min-w-0 mr-3">
                      <p className={`font-semibold text-sm truncate ${avail ? 'text-gray-900' : 'text-gray-400'}`}>{item.name}</p>
                      <p className={`text-sm mt-0.5 ${avail ? 'text-gray-500' : 'text-gray-300'}`}>{formatPrice(item.price)}</p>
                      {!avail && <p className="text-xs font-bold text-red-500 mt-0.5">{t("admin.menu.inactive")}</p>}
                    </div>
                    {avail ? (
                      qty === 0 ? (
                        <button
                          onClick={() => addToCart(item)}
                          className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors flex-shrink-0"
                          style={{ backgroundColor: PRIMARY }}
                          onMouseEnter={e => e.currentTarget.style.backgroundColor = PRIMARY_DARK}
                          onMouseLeave={e => e.currentTarget.style.backgroundColor = PRIMARY}
                        >
                          <Plus size={18} className="text-white" />
                        </button>
                      ) : (
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            onClick={() => removeFromCart(item)}
                            className="w-8 h-8 rounded-lg border-2 border-gray-200 flex items-center justify-center hover:bg-gray-100 transition-colors bg-white"
                          >
                            <Minus size={14} className="text-gray-600" />
                          </button>
                          <span className="text-sm font-bold text-gray-900 w-5 text-center">{qty}</span>
                          <button
                            onClick={() => addToCart(item)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                            style={{ backgroundColor: PRIMARY }}
                            onMouseEnter={e => e.currentTarget.style.backgroundColor = PRIMARY_DARK}
                            onMouseLeave={e => e.currentTarget.style.backgroundColor = PRIMARY}
                          >
                            <Plus size={14} className="text-white" />
                          </button>
                        </div>
                      )
                    ) : (
                      <span className="px-2 py-1 bg-red-50 text-red-500 text-xs font-bold rounded-md">{t("admin.newOrder.off")}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ══════════════════════ RIGHT — Config + Cart ══════════════════════ */}
        <div className="w-[380px] flex flex-col bg-white overflow-hidden flex-shrink-0">
          <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-5">

            {/* Order type — hidden when adding to existing order */}
            {!existingOrderId && (
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{t("admin.newOrder.title")}</p>
              <div className="flex gap-1.5 p-1 bg-gray-100 rounded-xl">
                {ORDER_TYPES.map(({ key, label, Icon }) => (
                  <button
                    key={key}
                    onClick={() => setOrderType(key)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg text-sm font-semibold transition-all ${
                      orderType === key
                        ? 'text-white shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                    style={orderType === key ? { backgroundColor: PRIMARY } : {}}
                  >
                    <Icon size={15} />
                    {label}
                  </button>
                ))}
              </div>
            </div>
            )}

            {/* Dine-In config / Customer fields — hidden when adding to existing order */}
            {!existingOrderId && (
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                {orderType === 'dine_in' ? t('admin.newOrder.tableAndGuests') : t('admin.newOrder.customer')}
              </p>
              {orderType === 'dine_in' ? (
                <div className="bg-gray-50 rounded-xl overflow-hidden border border-gray-200">
                  <button
                    onClick={() => setShowTablePicker(true)}
                    className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-gray-200 hover:bg-white transition-colors"
                  >
                    <div className="w-9 h-9 bg-white rounded-lg flex items-center justify-center flex-shrink-0 border border-gray-200">
                      <UtensilsCrossed size={16} className="text-gray-500" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-xs text-gray-400 font-medium">{t("admin.newOrder.table")}</p>
                      <p className={`text-sm font-semibold leading-tight ${selectedTable ? 'text-gray-900' : 'text-amber-500'}`}>
                        {selectedTable
                          ? `${selectedTable.name || t('common.tablePrefix', 'Table ') + selectedTable.tableNumber}${selectedTable.section ? ' · ' + selectedTable.section : ''}`
                          : t('admin.newOrder.clickToSelect')}
                      </p>
                    </div>
                    <ChevronRight size={16} className="text-gray-400" />
                  </button>
                  <div className="flex items-center gap-3 px-4 py-3.5">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: PRIMARY_LIGHT }}>
                      <Users size={16} style={{ color: PRIMARY }} />
                    </div>
                    <span className="flex-1 text-sm font-medium text-gray-600">{t("admin.newOrder.guests")}</span>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setGuests(g => Math.max(1, g - 1))}
                        className="w-8 h-8 rounded-lg border-2 border-gray-200 flex items-center justify-center hover:bg-gray-100 transition-colors"
                      >
                        <Minus size={14} className="text-gray-600" />
                      </button>
                      <span className="text-base font-bold text-gray-900 w-6 text-center">{guests}</span>
                      <button
                        onClick={() => setGuests(g => g + 1)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                        style={{ backgroundColor: PRIMARY }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = PRIMARY_DARK}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = PRIMARY}
                      >
                        <Plus size={14} className="text-white" />
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-gray-50 rounded-xl overflow-hidden border border-gray-200">
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200">
                    <User size={16} className="text-gray-400 flex-shrink-0" />
                    <input
                      type="text"
                      placeholder={t("admin.newOrder.customerNameOptional")}
                      value={customerName}
                      onChange={e => setCustomerName(e.target.value)}
                      className="flex-1 text-sm text-gray-800 outline-none placeholder-gray-400 bg-transparent"
                    />
                  </div>
                  <div className={`flex items-center gap-3 px-4 py-3 ${orderType === 'delivery' ? 'border-b border-gray-200' : ''}`}>
                    <Phone size={16} className="text-gray-400 flex-shrink-0" />
                    <PhoneInput
                      value={customerPhone}
                      onChange={setCustomerPhone}
                      size="sm"
                    />
                  </div>
                  {orderType === 'delivery' && (
                    <div className="flex items-center gap-3 px-4 py-3">
                      <MapPin size={16} className="text-gray-400 flex-shrink-0" />
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
              )}
            </div>
            )}

            {/* Warning — hidden when adding to existing order */}
            {!existingOrderId && orderType === 'dine_in' && !selectedTable && (
              <div className="flex items-center gap-2 text-amber-600 text-sm font-medium bg-amber-50 rounded-lg px-3 py-2.5">
                <AlertCircle size={15} />
                {t('admin.newOrder.selectTableWarningLong')}
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 text-red-600 text-sm font-medium bg-red-50 rounded-lg px-3 py-2.5">
                <AlertCircle size={15} />
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

              {cartEntries.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-gray-300 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                  <ShoppingCart size={32} className="mb-2" />
                  <p className="text-sm">{t('admin.newOrder.addItemsFromMenu')}</p>
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  {cartEntries.map(({ item, qty }) => (
                    <div key={item.id} className="flex items-center gap-3 py-2.5 px-3 bg-gray-50 rounded-lg border border-gray-100">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-gray-900 truncate">{item.name}</p>
                        <p className="text-xs text-gray-400">{formatPrice(item.price)} {t('common.each')}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => removeFromCart(item)}
                          className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-100 bg-white"
                        >
                          <Minus size={12} className="text-gray-600" />
                        </button>
                        <span className="font-bold text-gray-900 w-5 text-center text-sm">{qty}</span>
                        <button
                          onClick={() => addToCart(item)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center"
                          style={{ backgroundColor: PRIMARY }}
                          onMouseEnter={e => e.currentTarget.style.backgroundColor = PRIMARY_DARK}
                          onMouseLeave={e => e.currentTarget.style.backgroundColor = PRIMARY}
                        >
                          <Plus size={12} className="text-white" />
                        </button>
                        <button
                          onClick={() => removeItemFromCart(item.id)}
                          className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center hover:bg-red-100 ml-0.5"
                        >
                          <Trash2 size={12} className="text-red-500" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {/* Subtotal in cart area */}
                  <div className="flex items-center justify-between pt-3 mt-2 border-t border-gray-200">
                    <span className="text-sm font-semibold text-gray-600">{t('common.total')}</span>
                    <span className="text-lg font-bold text-gray-900">{formatPrice(cartTotal)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Place Order footer */}
          <div className="px-5 py-4 border-t border-gray-200 flex-shrink-0 bg-gray-50">
            <button
              onClick={handlePlaceOrder}
              disabled={!canPlace() || placing}
              className="w-full flex items-center justify-center gap-3 px-5 py-3.5 text-white rounded-xl font-bold text-sm shadow-sm disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              style={{ backgroundColor: PRIMARY }}
              onMouseEnter={e => { if (!placing && canPlace()) e.currentTarget.style.backgroundColor = PRIMARY_DARK; }}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = PRIMARY}
            >
              {placing ? (
                <span>{existingOrderId ? t('admin.newOrder.addingItems') : t('admin.newOrder.placingOrder')}</span>
              ) : (
                <>
                  <Check size={18} />
                  <span>{existingOrderId ? t('admin.newOrder.addToOrder') : t('admin.newOrder.placeOrder')}</span>
                  {cartCount > 0 && <span className="opacity-75 ml-1">· {formatPrice(cartTotal)}</span>}
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── Table Picker Modal ── */}
      <TablePickerModal />
    </div>
  );
}

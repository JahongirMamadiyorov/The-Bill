import { useState, useEffect } from 'react';
import {
  X, CreditCard, Banknote, Grid3X3, User,
  Plus, Minus, Check, Loader2, Printer, AlertTriangle,
} from 'lucide-react';
import { ordersAPI, menuAPI } from '../api/client';
import { usePrinter } from '../hooks/usePrinter';
import { useTranslation } from '../context/LanguageContext';
import DatePicker from './DatePicker';
import PhoneInput from './PhoneInput';

// ─── Constants ────────────────────────────────────────────────────────────────
const C = '#0891B2'; // Cashier cyan — keep in lock-step with CashierOrders

// ─── Helpers ──────────────────────────────────────────────────────────────────
const money = (n) => Number(n || 0).toLocaleString('uz-UZ') + " so'm";

const fmtOrderNum = (o) => {
  if (o?.dailyNumber) return `#${o.dailyNumber}`;
  const id = String(o?.id || '');
  return id.length >= 4 ? `#${id.slice(-4)}` : `#${id}`;
};

const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  return `${String(dt.getDate()).padStart(2,'0')}.${String(dt.getMonth()+1).padStart(2,'0')}.${dt.getFullYear()} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
};

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

/**
 * Self-contained Process-Payment modal.
 * Props:
 *  - isOpen:      boolean
 *  - order:       order object (can be a summary — items will be fetched if missing)
 *  - onClose:     fn()
 *  - onPaid:      fn({ order, payment })
 *  - taxSettings, restSettings (optional — used for receipt)
 */
export default function PayModal({ isOpen, order, onClose, onPaid, taxSettings, restSettings }) {
  const { t } = useTranslation();

  // ── Full order (with items) ───────────────────────────────────────────────
  const [full, setFull] = useState(null);

  // ── Payment form ──────────────────────────────────────────────────────────
  const [payForm, setPayForm] = useState({
    paymentMethod: 'cash',
    discount: 0,
    discountType: 'percentage',
    discReason: '',
    amountReceived: 0,
    splitWays: null,
    loanName: '', loanPhone: '', loanDueDate: '',
    notes: '',
  });
  const [splitParts, setSplitParts] = useState([]);
  const [paying,     setPaying]     = useState(false);
  const [err,        setErr]        = useState('');

  // ── Printer ───────────────────────────────────────────────────────────────
  const { printReceipt, printing: isPrinting, printerIp, setPrinterIp } = usePrinter();
  const [showPrinterCfg,  setShowPrinterCfg]  = useState(false);
  const [printerIpDraft,  setPrinterIpDraft]  = useState('');

  // ── Inline edit ───────────────────────────────────────────────────────────
  const [editFormData,    setEditFormData]    = useState({ guestCount: 1, items: [], notes: '' });
  const [allMenuItems,    setAllMenuItems]    = useState([]);
  const [menuLoaded,      setMenuLoaded]      = useState(false);
  const [searchMenuQuery, setSearchMenuQuery] = useState('');
  const [amountPicker,    setAmountPicker]    = useState(null);

  // ── Fetch full order on open ──────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen || !order?.id) return;
    let cancelled = false;
    const hasItems = Array.isArray(order.items || order.orderItems) &&
                     (order.items?.length || order.orderItems?.length);
    if (hasItems) {
      setFull(order);
      return;
    }
    ordersAPI.getById(order.id)
      .then(d => { if (!cancelled) setFull(d); })
      .catch(() => { if (!cancelled) setFull(order); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, order?.id]);

  // ── Seed edit state when full loads ───────────────────────────────────────
  useEffect(() => {
    if (!isOpen || !full) return;
    setEditFormData({
      guestCount: Number(full.guestCount) || 1,
      items: (full.items || full.orderItems || []).map(it => ({
        id:         it.id,
        menuItemId: it.menuItemId || it.id,
        name:       it.name || it.itemName || it.menuItemName,
        unitPrice:  Number(it.unitPrice || it.price) || 0,
        quantity:   Number(it.quantity || it.qty) || 1,
        unit:       String(it.unit || 'piece').toLowerCase(),
      })),
      notes: full.notes || '',
    });
    setSearchMenuQuery('');
    setAmountPicker(null);
    setErr('');
  }, [isOpen, full?.id]);

  // ── Load menu list once when modal opens ──────────────────────────────────
  useEffect(() => {
    if (!isOpen || menuLoaded) return;
    let cancelled = false;
    menuAPI.getItems()
      .then(rows => { if (!cancelled) setAllMenuItems(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (!cancelled) setAllMenuItems([]); })
      .finally(() => { if (!cancelled) setMenuLoaded(true); });
    return () => { cancelled = true; };
  }, [isOpen, menuLoaded]);

  // ── Reset on close ────────────────────────────────────────────────────────
  useEffect(() => {
    if (isOpen) return;
    setFull(null);
    setPayForm({
      paymentMethod: 'cash', discount: 0, discountType: 'percentage',
      discReason: '', amountReceived: 0, splitWays: null,
      loanName: '', loanPhone: '', loanDueDate: '', notes: '',
    });
    setSplitParts([]);
    setAmountPicker(null);
    setSearchMenuQuery('');
    setErr('');
    setShowPrinterCfg(false);
  }, [isOpen]);

  // ── Derived totals (from editFormData — the live editable list) ───────────
  const orderItems = editFormData.items || [];
  const modalOrderTotal = orderItems.reduce(
    (s, x) => s + (Number(x.unitPrice) || Number(x.price) || 0) *
                   (Number(x.quantity)  || Number(x.qty)   || 1),
    0
  );
  const getDiscountAmt = (pf) => {
    if (!pf.discount || pf.discount <= 0) return 0;
    return pf.discountType === 'percentage'
      ? Math.min(modalOrderTotal, (modalOrderTotal * pf.discount) / 100)
      : Math.min(modalOrderTotal, pf.discount);
  };
  const getTotalToPay = (pf) => Math.max(0, modalOrderTotal - getDiscountAmt(pf));
  const getChange     = (pf) => Math.max(0, (parseFloat(pf.amountReceived) || 0) - getTotalToPay(pf));

  const pf          = payForm;
  const discountAmt = getDiscountAmt(pf);
  const totalToPay  = getTotalToPay(pf);
  const chg         = getChange(pf);

  // ── Split re-init whenever splitWays changes ──────────────────────────────
  useEffect(() => {
    if (!pf.splitWays) { setSplitParts([]); return; }
    const total = totalToPay;
    const n = pf.splitWays;
    const base = Math.floor(total / n);
    const rem = total - base * n;
    setSplitParts(Array.from({ length: n }, (_, i) => ({
      amount: String(i === n - 1 ? base + rem : base),
      method: 'cash', confirmed: false,
      loanName: '', loanPhone: '', loanDueDate: '',
    })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pf.splitWays]);

  // ── Auto-fill amountReceived whenever totals recompute ────────────────────
  useEffect(() => {
    if (!isOpen) return;
    setPayForm(prev => ({ ...prev, amountReceived: String(totalToPay) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isOpen,
    // depend on the items shape so adding/removing/changing qty refreshes
    JSON.stringify(orderItems.map(i => [i.menuItemId || i.id, i.quantity, i.unitPrice])),
    pf.discount,
    pf.discountType,
  ]);

  // ── Inline edit helpers ───────────────────────────────────────────────────
  const updateItemQuantity = (idx, delta) => {
    const it = editFormData.items[idx];
    if (!it) return;
    if (isWeighedUnit(it.unit)) {
      const unitPrice = Number(it.unitPrice || 0);
      const seedQty   = it.quantity ? String(it.quantity) : '';
      const seedPrice = it.quantity && unitPrice > 0 ? String(Math.round(Number(it.quantity) * unitPrice)) : '';
      setAmountPicker({ idx, item: { ...it, price: unitPrice }, draft: seedQty, priceDraft: seedPrice });
      return;
    }
    setEditFormData(f => ({
      ...f,
      items: f.items.map((x, i) => i === idx ? { ...x, quantity: Math.max(1, (Number(x.quantity) || 1) + delta) } : x),
    }));
  };

  const removeItem = (idx) => {
    setEditFormData(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
  };

  const addMenuItemToOrder = (menuItem) => {
    if (isWeighedUnit(menuItem.unit)) {
      setAmountPicker({ idx: null, item: menuItem, draft: '', priceDraft: '' });
      return;
    }
    const existsIdx = editFormData.items.findIndex(x => x.menuItemId === menuItem.id || x.id === menuItem.id);
    if (existsIdx >= 0) {
      updateItemQuantity(existsIdx, 1);
    } else {
      setEditFormData(f => ({
        ...f,
        items: [...f.items, {
          id: menuItem.id,
          menuItemId: menuItem.id,
          name: menuItem.name,
          unitPrice: Number(menuItem.price) || 0,
          quantity: 1,
          unit: String(menuItem.unit || 'piece').toLowerCase(),
        }],
      }));
    }
    setSearchMenuQuery('');
  };

  const onAmountQtyChange = (v) => {
    const unit = Number(amountPicker?.item?.price || amountPicker?.item?.unitPrice || 0);
    const qty  = parseFloat(String(v || '').replace(',', '.')) || 0;
    const priceCalc = Math.round(qty * unit);
    setAmountPicker(p => p ? { ...p, draft: v, priceDraft: qty > 0 && unit > 0 ? String(priceCalc) : '' } : p);
  };
  const onAmountPriceChange = (v) => {
    const unit  = Number(amountPicker?.item?.price || amountPicker?.item?.unitPrice || 0);
    const price = parseFloat(String(v || '').replace(',', '.')) || 0;
    const qty   = unit > 0 ? Math.round((price / unit) * 1000) / 1000 : 0;
    setAmountPicker(p => p ? { ...p, priceDraft: v, draft: price > 0 && unit > 0 ? String(qty) : '' } : p);
  };
  const confirmAmountPicker = () => {
    if (!amountPicker) return;
    const raw = String(amountPicker.draft || '').replace(',', '.').trim();
    const amt = parseFloat(raw);
    if (!isFinite(amt) || amt <= 0) { setAmountPicker(null); return; }
    const rounded = Math.round(amt * 1000) / 1000;
    const { idx, item } = amountPicker;
    if (idx != null) {
      setEditFormData(f => ({
        ...f,
        items: f.items.map((x, i) => i === idx ? { ...x, quantity: rounded } : x),
      }));
    } else {
      const existsIdx = editFormData.items.findIndex(x => x.menuItemId === item.id || x.id === item.id);
      if (existsIdx >= 0) {
        setEditFormData(f => ({
          ...f,
          items: f.items.map((x, i) => i === existsIdx ? { ...x, quantity: rounded } : x),
        }));
      } else {
        setEditFormData(f => ({
          ...f,
          items: [...f.items, {
            id: item.id,
            menuItemId: item.id,
            name: item.name,
            unitPrice: Number(item.price || item.unitPrice) || 0,
            quantity: rounded,
            unit: String(item.unit || 'piece').toLowerCase(),
          }],
        }));
      }
    }
    setAmountPicker(null);
    setSearchMenuQuery('');
  };

  const getFilteredMenuItems = () =>
    allMenuItems.filter(it => (it.name || '').toLowerCase().includes(searchMenuQuery.toLowerCase()));

  // ── Display name (table for dine-in, customer for to-go/delivery) ─────────
  const srcForName = full || order || {};
  const ot = srcForName.orderType;
  const isToGo = ot === 'to_go' || ot === 'takeaway';
  const isDeli = ot === 'delivery';
  const dname = isToGo || isDeli
    ? (srcForName.customerName || t('cashier.orders.walkIn'))
    : (srcForName.tableName || t('cashier.orders.walkIn'));

  // ── Print receipt ─────────────────────────────────────────────────────────
  const handlePrintCheck = () => {
    const restaurantName = restSettings?.restaurantName || t('common.brandRestaurant', 'The Bill Restaurant');
    const receiptInner = `
      <div class="center">
        <div class="rest-name">${restaurantName}</div>
        <div class="gray">${fmtOrderNum(order)} &nbsp;·&nbsp; ${dname}</div>
        <div class="gray">${fmtDate(new Date())}</div>
      </div>
      <div class="dashed"></div>
      ${orderItems.map(it => {
        const p = it.unitPrice || it.price || 0;
        const q = parseFloat(it.quantity ?? it.qty) || 1;
        const u = String(it.unit || 'piece').toLowerCase();
        const weighed = u === 'kg' || u === 'l' || u === 'g' || u === 'ml';
        const qtyLabel = weighed
          ? `${Number.isInteger(q) ? q : parseFloat(q.toFixed(3))} ${u}`
          : `× ${q}`;
        return `<div class="row"><span class="row-label">${it.name || it.menuItemName || '—'} ${qtyLabel}</span><span>${money(p * q)}</span></div>`;
      }).join('')}
      <div class="dashed"></div>
      <div class="row"><span>${t('common.subtotal')}</span><span>${money(modalOrderTotal)}</span></div>
      ${discountAmt > 0 ? `<div class="row green"><span>${t('common.discount')}${pf.discReason ? ` (${pf.discReason})` : ''}</span><span>−${money(discountAmt)}</span></div>` : ''}
      <div class="dashed"></div>
      <div class="row total-row"><span>${t('cashier.orders.receiptTotal')}</span><span>${money(totalToPay)}</span></div>
      <div class="dashed"></div>
      <div class="row"><span>${t('cashier.orders.method')}</span><span>${(pf.paymentMethod || 'cash').replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</span></div>
      ${pf.paymentMethod === 'cash' && chg > 0 ? `<div class="row"><span>${t('cashier.orders.change')}</span><span>${money(chg)}</span></div>` : ''}
      <div class="dashed"></div>
      <div class="center footer">${restSettings?.receiptHeader || t('cashier.orders.thankYou')}</div>`;
    printReceipt({
      restaurantName,
      orderNum: fmtOrderNum(order),
      tableName: dname,
      dateTime: fmtDate(new Date()),
      items: orderItems.map(it => ({
        name: it.name || it.menuItemName || '—',
        qty: parseFloat(it.quantity ?? it.qty) || 1,
        unit: String(it.unit || 'piece').toLowerCase(),
        total: money((it.unitPrice || it.price || 0) * (parseFloat(it.quantity ?? it.qty) || 1)),
      })),
      subtotal: money(modalOrderTotal),
      discountReason: pf.discReason || undefined,
      discount: discountAmt > 0 ? `-${money(discountAmt)}` : undefined,
      total: money(totalToPay),
      method: (pf.paymentMethod || 'cash').replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase()),
      change: chg > 0 ? money(chg) : undefined,
      footer: restSettings?.receiptHeader || t('cashier.orders.thankYou'),
      browserHtml: receiptInner,
    });
  };

  // ── Confirm payment ───────────────────────────────────────────────────────
  const handlePayConfirm = async () => {
    setPaying(true);
    setErr('');
    try {
      // Persist inline edits first (items / guests / notes) so the paid order
      // reflects the cashier's fixes.
      if (order?.id) {
        try {
          await ordersAPI.update(order.id, {
            guestCount: editFormData.guestCount,
            items: editFormData.items,
            notes: editFormData.notes,
          });
        } catch {
          // If update fails, abort — don't take payment on stale items
          throw new Error(t('cashier.orders.couldNotLoadOrder'));
        }
      }

      const discAmt  = getDiscountAmt(pf);
      const payTotal = getTotalToPay(pf);
      const payload  = { discountAmount: discAmt, notes: pf.notes || null };

      if (pf.splitWays && splitParts.length > 0) {
        payload.paymentMethod = 'split';
        payload.splitPayments = splitParts.map(p => ({
          method: p.method,
          amount: parseFloat(p.amount) || 0,
          ...(p.method === 'loan'
            ? { loanCustomerName: p.loanName, loanCustomerPhone: p.loanPhone, loanDueDate: p.loanDueDate }
            : {}),
        }));
      } else if (pf.paymentMethod === 'loan') {
        payload.paymentMethod     = 'loan';
        payload.loanCustomerName  = pf.loanName;
        payload.loanCustomerPhone = pf.loanPhone;
        payload.loanDueDate       = pf.loanDueDate || null;
      } else {
        payload.paymentMethod = pf.paymentMethod;
        payload.amount        = payTotal;
      }

      await ordersAPI.pay(order.id, payload);
      onPaid && onPaid({
        order: { ...(full || order) },
        payment: { method: pf.paymentMethod, total: payTotal, discount: discAmt },
      });
      onClose && onClose();
    } catch (e) {
      setErr(e?.error || e?.message || t('cashier.orders.paymentFailed'));
    } finally {
      setPaying(false);
    }
  };

  if (!isOpen) return null;

  const PMETHODS = [
    { key: 'cash',    label: t('paymentMethods.cash'),    Icon: Banknote   },
    { key: 'card',    label: t('paymentMethods.card'),    Icon: CreditCard },
    { key: 'qr_code', label: t('paymentMethods.qrCode'),  Icon: Grid3X3    },
    { key: 'loan',    label: t('paymentMethods.loan'),    Icon: User       },
  ];

  return (
    <>
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
        onClick={onClose}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl flex flex-col overflow-hidden"
          style={{ height: '90vh' }}
          onClick={e => e.stopPropagation()}>

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: C + '1A' }}>
                <CreditCard className="w-5 h-5" style={{ color: C }} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">{t('cashier.orders.processPayment')}</h2>
                <p className="text-sm text-gray-500">{fmtOrderNum(order)} · {dname}</p>
              </div>
            </div>
            <button onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Two-column body */}
          <div className="flex flex-1 overflow-hidden">

            {/* LEFT — Order Items (editable) + Totals */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50">

              {/* Guests */}
              <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">{t('admin.newOrder.guests')}</p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setEditFormData(f => ({ ...f, guestCount: Math.max(1, (Number(f.guestCount) || 1) - 1) }))}
                    className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition"
                  >
                    <Minus className="w-4 h-4 text-gray-600" />
                  </button>
                  <span className="min-w-[2rem] text-center text-base font-bold text-gray-900">{editFormData.guestCount || 1}</span>
                  <button
                    onClick={() => setEditFormData(f => ({ ...f, guestCount: (Number(f.guestCount) || 1) + 1 }))}
                    className="w-8 h-8 rounded-lg border flex items-center justify-center transition"
                    style={{ borderColor: C, color: C }}
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Order Items (editable) */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">{t('cashier.orders.orderItems')}</p>
                  <span className="text-xs font-semibold" style={{ color: C }}>
                    {Math.round(orderItems.reduce((s, i) => s + (Number(i.quantity) || Number(i.qty) || 1), 0))} {t('common.items')}
                  </span>
                </div>
                <div className="divide-y divide-gray-50">
                  {orderItems.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-6">{t('common.noResults')}</p>
                  ) : orderItems.map((item, idx) => (
                    <div key={idx} className="px-4 py-2.5 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{item.name || item.menuItemName || t('cashier.orders.item')}</p>
                        <p className="text-xs text-gray-400">
                          {money(item.unitPrice || item.price || 0)}{isWeighedUnit(item.unit) ? ` / ${unitSuffix(item.unit)}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          onClick={() => updateItemQuantity(idx, -1)}
                          className="w-7 h-7 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center hover:bg-gray-200 transition">
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className={`${isWeighedUnit(item.unit) ? 'min-w-[3.5rem] px-1' : 'w-8'} text-center text-xs font-bold text-gray-900`}>
                          {formatItemQty(item)}
                        </span>
                        <button
                          onClick={() => updateItemQuantity(idx, 1)}
                          className="w-7 h-7 rounded-full flex items-center justify-center transition"
                          style={{ backgroundColor: `${C}1A`, color: C }}>
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => removeItem(idx)}
                          className="w-7 h-7 rounded-full bg-red-100 text-red-500 flex items-center justify-center hover:bg-red-200 transition ml-1">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <span className="text-sm font-semibold text-gray-900 min-w-[5.5rem] text-right">
                        {money((Number(item.unitPrice) || Number(item.price) || 0) * (Number(item.quantity) || Number(item.qty) || 1))}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Add menu items */}
              <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: C }}>
                  {t('admin.orders.addItemsToOrder', 'Add items to order')}
                </p>
                <input
                  type="text"
                  value={searchMenuQuery}
                  onChange={(e) => setSearchMenuQuery(e.target.value)}
                  placeholder={t('admin.menu.searchPlaceholder')}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2"
                  style={{ '--tw-ring-color': C }}
                />
                <div className="max-h-56 overflow-y-auto space-y-2">
                  {!menuLoaded ? (
                    <div className="py-4 flex items-center justify-center">
                      <Loader2 className="w-4 h-4 animate-spin" style={{ color: C }} />
                    </div>
                  ) : getFilteredMenuItems().length > 0 ? (
                    getFilteredMenuItems().slice(0, 30).map(it => (
                      <div key={it.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{it.name}</p>
                          <p className="text-xs font-medium" style={{ color: C }}>
                            {money(Number(it.price) || 0)}{isWeighedUnit(it.unit) ? ` / ${unitSuffix(it.unit)}` : ''}
                          </p>
                        </div>
                        <button onClick={() => addMenuItemToOrder(it)}
                          className="w-8 h-8 flex items-center justify-center rounded-full transition flex-shrink-0"
                          style={{ backgroundColor: `${C}1A`, color: C }}>
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="py-4 text-center text-sm text-gray-400">{t('common.noResults')}</p>
                  )}
                </div>
              </div>

              {/* Totals */}
              <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">{t('common.subtotal')}</span>
                  <span className="text-sm font-semibold text-gray-900">{money(modalOrderTotal)}</span>
                </div>
                {discountAmt > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-green-600">
                      {t('common.discount')}{pf.discReason ? ` · ${pf.discReason}` : ''}
                    </span>
                    <span className="text-sm font-semibold text-green-600">-{money(discountAmt)}</span>
                  </div>
                )}
                <div className="border-t border-gray-200 pt-3 flex items-center justify-between">
                  <span className="text-base font-bold text-gray-900">{t('common.total')}</span>
                  <span className="text-2xl font-bold" style={{ color: C }}>{money(totalToPay)}</span>
                </div>
              </div>
            </div>

            {/* RIGHT — Payment inputs + Actions footer */}
            <div className="w-[420px] flex flex-col bg-white flex-shrink-0 border-l border-gray-200">
              <div className="flex-1 overflow-y-auto p-5 space-y-5">

                {/* Payment Method */}
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">{t('cashier.orders.paymentMethod')}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {PMETHODS.map(({ key, label, Icon }) => (
                      <button
                        key={key}
                        onClick={() => setPayForm({ ...pf, paymentMethod: key })}
                        className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 transition-all ${
                          pf.paymentMethod === key
                            ? 'border-cyan-600 bg-cyan-50 text-cyan-700 shadow-sm'
                            : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:border-gray-300'
                        }`}
                      >
                        <Icon className="w-5 h-5" />
                        <span className="text-xs font-semibold">{label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Amount Received — Cash only */}
                {pf.paymentMethod === 'cash' && (
                  <div>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{t('cashier.orders.amountReceived')}</p>
                    <input
                      type="number" min="0" step="1000"
                      value={pf.amountReceived || ''}
                      onChange={e => setPayForm({ ...pf, amountReceived: parseFloat(e.target.value) || 0 })}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-lg font-bold focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                    <div className={`mt-2 rounded-xl px-4 py-3 flex items-center justify-between ${chg > 0 ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-gray-200'}`}>
                      <span className={`text-sm font-medium ${chg > 0 ? 'text-green-600' : 'text-gray-400'}`}>{t('cashier.orders.changeToGive')}</span>
                      <span className={`text-xl font-bold ${chg > 0 ? 'text-green-600' : 'text-gray-500'}`}>{money(chg)}</span>
                    </div>
                  </div>
                )}

                {/* Discount */}
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{t('cashier.orders.applyDiscount')}</p>
                  <div className="flex gap-2 mb-2">
                    {['percentage', 'fixed'].map(tp => (
                      <button key={tp}
                        onClick={() => setPayForm({ ...pf, discountType: tp, discount: 0 })}
                        className="flex-1 py-2 rounded-lg text-sm font-bold transition-all"
                        style={{
                          backgroundColor: pf.discountType === tp ? C : '#F3F4F6',
                          color: pf.discountType === tp ? '#fff' : '#6B7280',
                        }}
                      >
                        {tp === 'percentage' ? '%' : "So'm"}
                      </button>
                    ))}
                  </div>
                  <div className="relative">
                    <input
                      type="number" min="0"
                      max={pf.discountType === 'percentage' ? 100 : modalOrderTotal}
                      step={pf.discountType === 'percentage' ? 1 : 1000}
                      value={pf.discount || ''}
                      onChange={e => setPayForm({ ...pf, discount: parseFloat(e.target.value) || 0 })}
                      placeholder={pf.discountType === 'percentage' ? '0 — 100' : '0'}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium pointer-events-none">
                      {pf.discountType === 'percentage' ? '%' : "so'm"}
                    </span>
                  </div>
                  {discountAmt > 0 && (
                    <div className="mt-1.5 space-y-1.5">
                      <p className="text-xs text-green-600 font-semibold">-{money(discountAmt)}</p>
                      <select
                        value={pf.discReason || ''}
                        onChange={e => setPayForm({ ...pf, discReason: e.target.value })}
                        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 text-gray-700"
                      >
                        <option value="">{t('cashier.orders.selectReason')}</option>
                        {(t('cashier.orders.discountReasons') || []).map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                  )}
                </div>

                {/* Split Bill */}
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{t('cashier.orders.splitBill')}</p>
                  <div className="flex gap-2">
                    {[2, 3, 4].map(n => (
                      <button key={n}
                        onClick={() => setPayForm({ ...pf, splitWays: pf.splitWays === n ? null : n })}
                        className="flex-1 py-2.5 rounded-lg text-sm font-semibold border-2 transition-all"
                        style={{
                          borderColor: pf.splitWays === n ? C : '#E5E7EB',
                          backgroundColor: pf.splitWays === n ? C + '1A' : '#F9FAFB',
                          color: pf.splitWays === n ? C : '#6B7280',
                        }}
                      >
                        {n} {t('cashier.orders.ways')}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Split Parts */}
                {pf.splitWays && splitParts.length > 0 && (
                  <div>
                    <div className="space-y-3">
                      {splitParts.map((part, idx) => (
                        <div key={idx}
                          className={`rounded-xl border-2 p-3 transition-all ${part.confirmed ? 'border-green-400 bg-green-50' : 'border-gray-200 bg-gray-50'}`}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-bold text-gray-700">{t('cashier.orders.part')} {idx + 1}</span>
                            <label className="flex items-center gap-1.5 cursor-pointer select-none">
                              <input type="checkbox" checked={part.confirmed}
                                onChange={e => {
                                  const u = [...splitParts];
                                  u[idx] = { ...u[idx], confirmed: e.target.checked };
                                  setSplitParts(u);
                                }}
                                className="w-4 h-4 accent-green-500"
                              />
                              <span className={`text-xs font-semibold ${part.confirmed ? 'text-green-600' : 'text-gray-400'}`}>{t('common.paid')}</span>
                            </label>
                          </div>
                          <div className="relative mb-2">
                            <input type="number" min="0" step="1000"
                              value={part.amount}
                              onChange={e => {
                                const u = [...splitParts];
                                u[idx] = { ...u[idx], amount: e.target.value };
                                setSplitParts(u);
                              }}
                              className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold focus:outline-none pr-14"
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
                              <button key={key}
                                onClick={() => {
                                  const u = [...splitParts];
                                  u[idx] = { ...u[idx], method: key };
                                  setSplitParts(u);
                                }}
                                className="flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-all"
                                style={{
                                  backgroundColor: part.method === key ? C : '#fff',
                                  color: part.method === key ? '#fff' : '#6B7280',
                                  borderColor: part.method === key ? C : '#E5E7EB',
                                }}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                          {part.method === 'loan' && (
                            <div className="mt-2 space-y-2 pt-2 border-t border-amber-200">
                              <input type="text"
                                value={part.loanName}
                                onChange={e => { const u=[...splitParts]; u[idx]={...u[idx],loanName:e.target.value}; setSplitParts(u); }}
                                placeholder={t('cashier.orders.customerName')}
                                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs focus:outline-none"
                              />
                              <PhoneInput
                                value={part.loanPhone}
                                onChange={v => { const u=[...splitParts]; u[idx]={...u[idx],loanPhone:v}; setSplitParts(u); }}
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
                          <span className="text-xs font-bold text-gray-400 uppercase">{t('cashier.orders.splitBill')} {t('common.total')}</span>
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
                      <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-amber-700 font-medium">{t('cashier.orders.loanNotice')}</p>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{t('cashier.orders.customerName')}</p>
                        <input type="text" value={pf.loanName}
                          onChange={e => setPayForm({ ...pf, loanName: e.target.value })}
                          placeholder={t('cashier.orders.namePlaceholder')}
                          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{t('common.phone')}</p>
                        <PhoneInput value={pf.loanPhone} onChange={v => setPayForm({ ...pf, loanPhone: v })} size="md" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{t('cashier.orders.expectedReturn')}</p>
                        <DatePicker value={pf.loanDueDate} onChange={v => setPayForm({ ...pf, loanDueDate: v })} size="sm" />
                      </div>
                    </div>
                  </div>
                )}

                {/* Notes */}
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{t('common.notes')}</p>
                  <textarea
                    value={pf.notes}
                    onChange={e => setPayForm({ ...pf, notes: e.target.value })}
                    placeholder={t('cashier.orders.addPaymentNotes')}
                    rows={2}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none resize-none"
                  />
                </div>

                {err && (
                  <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm font-medium">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />{err}
                  </div>
                )}
              </div>

              {/* Actions footer */}
              <div className="p-4 border-t border-gray-200 space-y-2 flex-shrink-0 bg-gray-50">
                {/* Print Check */}
                <button
                  onClick={handlePrintCheck}
                  disabled={isPrinting}
                  className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm transition border-2 disabled:opacity-50 bg-white"
                  style={{ borderColor: '#E5E7EB', color: '#374151' }}
                >
                  {isPrinting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                  {isPrinting ? t('common.processing') : t('cashier.orders.printReceipt')}
                </button>

                {/* Printer IP config */}
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs flex items-center gap-1.5" style={{ color: '#9CA3AF' }}>
                    <Printer className="w-3 h-3" />
                    {printerIp
                      ? <span style={{ color: '#374151', fontWeight: 500 }}>{printerIp}</span>
                      : <span>{t('cashier.orders.noPrinterIp')}</span>}
                  </span>
                  <button
                    onClick={() => { setShowPrinterCfg(v => !v); setPrinterIpDraft(printerIp); }}
                    className="text-xs font-semibold hover:underline"
                    style={{ color: C }}
                  >
                    {showPrinterCfg ? t('common.cancel') : (printerIp ? t('common.edit') : t('common.settings'))}
                  </button>
                </div>
                {showPrinterCfg && (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={printerIpDraft}
                      onChange={e => setPrinterIpDraft(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { setPrinterIp(printerIpDraft.trim()); setShowPrinterCfg(false); } }}
                      placeholder={t('placeholders.ipAddress', '192.168.1.100')}
                      className="flex-1 px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2"
                      style={{ '--tw-ring-color': C }}
                      autoFocus
                    />
                    <button
                      onClick={() => { setPrinterIp(printerIpDraft.trim()); setShowPrinterCfg(false); }}
                      className="px-4 py-2 text-xs font-bold text-white rounded-lg"
                      style={{ backgroundColor: C }}
                    >
                      {t('common.save')}
                    </button>
                  </div>
                )}

                <button
                  onClick={handlePayConfirm}
                  disabled={paying || orderItems.length === 0}
                  className="w-full flex items-center justify-center gap-2 px-5 py-3.5 text-white font-bold text-sm rounded-xl transition-colors disabled:opacity-50"
                  style={{ backgroundColor: '#1F2937' }}
                >
                  {paying
                    ? <Loader2 className="w-5 h-5 animate-spin" />
                    : <Check className="w-4 h-4 text-green-400" />}
                  {' '}{t('cashier.orders.confirmPayment')} · {money(totalToPay)}
                </button>
                <button
                  onClick={onClose}
                  className="w-full py-2 text-gray-400 font-medium text-sm hover:text-gray-600 transition-colors"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Amount Picker Modal (kg/L) */}
      {amountPicker && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4" onClick={() => setAmountPicker(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">
                  {t('admin.newOrder.enterAmount', 'Enter amount')}
                </p>
                <p className="text-base font-bold text-gray-900">{amountPicker.item.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {Number(amountPicker.item.price || amountPicker.item.unitPrice || 0).toLocaleString()} so&apos;m / {unitSuffix(amountPicker.item.unit)}
                </p>
              </div>
              <button onClick={() => setAmountPicker(null)} className="p-1 rounded-lg hover:bg-gray-100">
                <X size={18} className="text-gray-500" />
              </button>
            </div>

            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
              {t('admin.newOrder.amount', 'Amount')}
            </label>
            <div className="relative">
              <input
                type="number" step="0.001" min="0" inputMode="decimal" autoFocus
                value={amountPicker.draft}
                onChange={(e) => onAmountQtyChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') confirmAmountPicker();
                  if (e.key === 'Escape') setAmountPicker(null);
                }}
                placeholder="0.000"
                className="w-full px-4 py-3 pr-14 border border-gray-300 rounded-xl text-2xl font-bold text-gray-900 focus:outline-none"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 font-semibold text-lg">
                {unitSuffix(amountPicker.item.unit)}
              </span>
            </div>

            <div className="flex gap-2 mt-3">
              {['0.25', '0.5', '1', '1.5', '2'].map(p => (
                <button key={p} onClick={() => onAmountQtyChange(p)}
                  className="flex-1 px-2 py-2 rounded-lg text-sm font-semibold bg-gray-100 hover:bg-gray-200 text-gray-700">
                  {p}
                </button>
              ))}
            </div>

            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mt-4 mb-1">
              {t('admin.newOrder.price', 'Price')}
            </label>
            <div className="relative">
              <input
                type="number" step="1" min="0" inputMode="numeric"
                value={amountPicker.priceDraft || ''}
                onChange={(e) => onAmountPriceChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') confirmAmountPicker();
                  if (e.key === 'Escape') setAmountPicker(null);
                }}
                placeholder="0"
                className="w-full px-4 py-3 pr-14 border border-gray-300 rounded-xl text-2xl font-bold text-gray-900 focus:outline-none"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 font-semibold text-lg">so&apos;m</span>
            </div>

            <div className="flex gap-2 mt-4">
              <button onClick={() => setAmountPicker(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-700 font-semibold hover:bg-gray-50">
                {t('common.cancel', 'Cancel')}
              </button>
              <button onClick={confirmAmountPicker}
                className="flex-1 py-2.5 rounded-xl text-white font-semibold"
                style={{ backgroundColor: C }}>
                {amountPicker.idx != null ? t('common.save', 'Save') : t('common.add', 'Add')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

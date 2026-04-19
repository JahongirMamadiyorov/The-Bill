import { useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslation } from '../../context/LanguageContext';
import { money, fmtDate, todayStr } from '../../hooks/useApi';
import { warehouseAPI, suppliersAPI, procurementAPI } from '../../api/client';
import ConfirmDialog from '../../components/ConfirmDialog';
import Dropdown from '../../components/Dropdown';
import DatePicker from '../../components/DatePicker';
import PhoneInput, { formatPhoneDisplay } from '../../components/PhoneInput';
import {
  Plus, X, Package, AlertTriangle, ArrowDownToLine, ArrowUpFromLine,
  Edit2, Trash2, Search, RefreshCw, Phone, Mail, MapPin,
  ChevronDown, ChevronUp, ChevronRight, Calendar, Clock, TrendingDown, TrendingUp,
  Layers, Filter, DollarSign, Truck, ShoppingCart, ClipboardList,
  AlertCircle, CheckCircle, Box, ArrowLeft, FileText,
} from 'lucide-react';

/* ── Helpers ────────────────────────────────────────────────────────────────── */
const toNum   = (v) => parseFloat(v) || 0;
const fmtNum  = (v) => toNum(v).toFixed(1);
const UNITS   = ['kg', 'g', 'liter', 'ml', 'piece', 'portion', 'box', 'bottle', 'pack', 'bag', 'tray'];
const CATEGORIES = ['Food & Ingredients', 'Beverages', 'Cleaning', 'Packaging', 'Other'];
const IN_REASONS  = ['Purchase', 'Supplier Delivery', 'Transfer', 'Return', 'Donation', 'Correction'];
const OUT_REASONS = ['Kitchen Use', 'Transfer', 'Cleaning', 'Staff Meal', 'Sample'];
const WASTE_REASONS = ['Expired', 'Spoilage', 'Broken', 'Damaged', 'Quality Issue'];
const ADJUST_REASONS = ['Overcount', 'Undercount', 'Spillage', 'Audit Correction', 'Theft', 'Breakage'];
const getOutputTypes = (t) => [
  { value: 'OUT', label: t('admin.inventory.outputTypes.out'), color: 'bg-orange-100 text-orange-700 border-orange-200' },
  { value: 'WASTE', label: t('admin.inventory.outputTypes.waste'), color: 'bg-red-100 text-red-700 border-red-200' },
  { value: 'ADJUST', label: t('admin.inventory.outputTypes.adjust'), color: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
];
function getReasonsForType(type) {
  if (type === 'WASTE') return WASTE_REASONS;
  if (type === 'ADJUST') return ADJUST_REASONS;
  return OUT_REASONS;
}

const DELIVERY_STATUSES = ['Ordered', 'In Transit', 'Partial', 'Delivered', 'Cancelled'];
const DELIVERY_STATUS_COLORS = {
  'Ordered':    'bg-purple-100 text-purple-800',
  'In Transit': 'bg-blue-100 text-blue-800',
  'Partial':    'bg-orange-100 text-orange-800',
  'Delivered':  'bg-green-100 text-green-800',
  'Cancelled':  'bg-red-100 text-red-800',
};
const REASON_COLORS = {
  'Kitchen Use': 'bg-blue-100 text-blue-800',
  'Waste':       'bg-red-100 text-red-800',
  'Spoilage':    'bg-orange-100 text-orange-800',
  'Transfer':    'bg-purple-100 text-purple-800',
  'Cleaning':    'bg-gray-100 text-gray-800',
  'Purchase':    'bg-green-100 text-green-800',
  'Return':      'bg-indigo-100 text-indigo-800',
  'Donation':    'bg-cyan-100 text-cyan-800',
  'Goods Arrival': 'bg-green-100 text-green-800',
};
const TYPE_COLORS = {
  'IN':        'bg-green-100 text-green-800',
  'OUT':       'bg-orange-100 text-orange-800',
  'WASTE':     'bg-red-100 text-red-800',
  'ADJUST':    'bg-indigo-100 text-indigo-800',
  'SHRINKAGE': 'bg-red-100 text-red-800',
};

function getStatus(qty, min, t) {
  const q = toNum(qty), m = toNum(min);
  if (q <= 0) return { label: t ? t('admin.inventory.outOfStock') : 'Out of Stock', color: 'bg-red-50 text-red-600 border border-red-200', dot: 'bg-red-500', bar: 'bg-red-500', ring: 'ring-red-200', iconColor: 'text-red-500', cardBorder: 'border-red-200', cardBg: 'bg-red-50/30' };
  if (q <= m * 0.5) return { label: t ? t('admin.inventory.critical') : 'Critical', color: 'bg-orange-50 text-orange-600 border border-orange-200', dot: 'bg-orange-500', bar: 'bg-orange-500', ring: 'ring-orange-200', iconColor: 'text-orange-500', cardBorder: 'border-orange-200', cardBg: 'bg-orange-50/30' };
  if (q <= m) return { label: t ? t('admin.inventory.lowStock') : 'Low Stock', color: 'bg-amber-50 text-amber-600 border border-amber-200', dot: 'bg-amber-500', bar: 'bg-amber-400', ring: 'ring-amber-200', iconColor: 'text-amber-500', cardBorder: 'border-amber-200', cardBg: 'bg-amber-50/20' };
  return { label: t ? t('admin.inventory.inStock') : 'In Stock', color: 'bg-emerald-50 text-emerald-600 border border-emerald-200', dot: 'bg-emerald-500', bar: 'bg-emerald-500', ring: 'ring-emerald-200', iconColor: 'text-emerald-500', cardBorder: 'border-gray-100', cardBg: 'bg-white' };
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr) - Date.now()) / 86400000);
}

/* ── Date Range Presets ─────────────────────────────────────────────────────── */
function getDateRange(preset) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(today.getTime() + 86399999);
  switch (preset) {
    case 'today': return { from: fmtDate(today), to: fmtDate(today) };
    case '7d': return { from: fmtDate(new Date(today.getTime() - 6 * 86400000)), to: fmtDate(today) };
    case '30d': return { from: fmtDate(new Date(today.getTime() - 29 * 86400000)), to: fmtDate(today) };
    case 'month': return { from: fmtDate(new Date(now.getFullYear(), now.getMonth(), 1)), to: fmtDate(today) };
    default: return { from: '', to: '' };
  }
}

/* ══════════════════════════════════════════════════════════════════════════════ */
export default function AdminInventory() {
  const { t } = useTranslation();
  /* ── Data ──────────────────────────────────────────────────────────────────── */
  const [items, setItems]               = useState([]);
  const [suppliers, setSuppliers]       = useState([]);
  const [suggestedOrders, setSuggested] = useState([]);
  const [movements, setMovements]       = useState([]);
  const [deliveries, setDeliveries]     = useState([]);
  const [debtTotal, setDebtTotal]       = useState(0);
  const [loading, setLoading]           = useState(true);

  /* ── UI ────────────────────────────────────────────────────────────────────── */
  const [activeTab, setActiveTab]       = useState('overview');
  const [searchTerm, setSearchTerm]     = useState('');
  const [filterType, setFilterType]     = useState('all');
  const [filterCat, setFilterCat]       = useState('all');
  const [expandedItem, setExpandedItem] = useState(null);
  const [dialog, setDialog]             = useState(null);
  const [toast, setToast]               = useState('');
  const [newCatName, setNewCatName]     = useState('');

  /* ── Delivery/Output date filters ──────────────────────────────────────────── */
  const [delivDateRange, setDelivDateRange] = useState({ from: '', to: '' });
  const [outputDateRange, setOutputDateRange] = useState({ from: '', to: '' });
  const [delivPreset, setDelivPreset] = useState('');
  const [outputPreset, setOutputPreset] = useState('');
  const [outputTypeFilter, setOutputTypeFilter] = useState('');

  /* ── Modals ────────────────────────────────────────────────────────────────── */
  const [modal, setModal] = useState(null); // 'add-item' | 'edit-item' | 'receive' | 'consume' | 'adjust' | 'add-supplier' | 'delivery'

  /* ── Forms ─────────────────────────────────────────────────────────────────── */
  const emptyItemForm     = { name: '', category: '', unit: 'kg', quantity: 0, minStockLevel: '', costPerUnit: '', supplierId: '', expiryDate: '' };
  const emptyReceiveForm  = { itemId: '', quantity: '', reason: 'Purchase', expiryDate: '', costPerUnit: '', supplierId: '', deliveryDate: '' };
  const emptyOutputForm   = { itemId: '', quantity: '', reason: 'Kitchen Use', type: 'OUT', date: '', search: '' };
  const emptySupplierForm = { id: '', name: '', contactName: '', phone: '', email: '', address: '', paymentTerms: '', category: '' };
  const emptyDelivForm    = { supplierId: '', supplierName: '', status: 'Delivered', paymentStatus: 'unpaid', paymentDueDate: '', notes: '', items: [{ itemName: '', qty: '', unit: 'kg', unitPrice: '', expiryDate: '' }] };

  const [itemForm, setItemForm]         = useState(emptyItemForm);
  const [editItemId, setEditItemId]     = useState(null);
  const [receiveForm, setReceiveForm]   = useState(emptyReceiveForm);
  const [outputForm, setOutputForm]     = useState(emptyOutputForm);
  const [supplierForm, setSupplierForm] = useState(emptySupplierForm);
  const [delivForm, setDelivForm]       = useState(emptyDelivForm);
  const [paymentForm, setPaymentForm]   = useState({ deliveryId: '', supplierName: '', amount: 0, method: 'Cash', note: '', date: '', step: 'form' }); // step: 'form' | 'confirm'
  const [delivDetail, setDelivDetail] = useState(null); // holds full delivery with items for detail view
  const [delivDetailLoading, setDelivDetailLoading] = useState(false);
  const [supplierDetail, setSupplierDetail] = useState(null); // supplier detail view
  const [expandedDebtSupplier, setExpandedDebtSupplier] = useState(null); // expanded debt section
  const [pendingStatusChange, setPendingStatusChange] = useState(null); // { delivId, newStatus } — awaiting confirm
  const PAYMENT_METHODS = ['Cash', 'Bank Transfer', 'Card', 'Mobile Payment', 'Check', 'Other'];

  /* ── Toast ─────────────────────────────────────────────────────────────────── */
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  /* ── Load data ─────────────────────────────────────────────────────────────── */
  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [allItems, allSuppliers, allMovements, suggested, allDeliveries, debt] = await Promise.allSettled([
        warehouseAPI.getAll(),
        suppliersAPI.getAll(),
        warehouseAPI.getMovements({}),
        procurementAPI.getSuggestedOrders(),
        procurementAPI.getDeliveries(),
        procurementAPI.getDeliveriesDebt(),
      ]);
      if (allItems.status === 'fulfilled') setItems(Array.isArray(allItems.value) ? allItems.value : []);
      if (allSuppliers.status === 'fulfilled') setSuppliers(Array.isArray(allSuppliers.value) ? allSuppliers.value : []);
      if (allMovements.status === 'fulfilled') setMovements(Array.isArray(allMovements.value) ? allMovements.value : []);
      if (suggested.status === 'fulfilled') setSuggested(Array.isArray(suggested.value) ? suggested.value : []);
      if (allDeliveries.status === 'fulfilled') setDeliveries(Array.isArray(allDeliveries.value) ? allDeliveries.value : []);
      if (debt.status === 'fulfilled') setDebtTotal(toNum(debt.value?.total ?? debt.value?.totalDebt ?? 0));
    } catch (err) {
      if (!silent) showToast(t('admin.inventory.failedToLoad'));
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const t = setInterval(() => loadData(true), 15000);
    return () => clearInterval(t);
  }, [loadData]);

  /* ── Derived ───────────────────────────────────────────────────────────────── */
  // User-managed categories: merge defaults + any used by items
  const [userCategories, setUserCategories] = useState(CATEGORIES);
  const allCategories = useMemo(() => {
    const cats = new Set(userCategories);
    items.forEach(i => { if (i.category) cats.add(i.category); });
    return [...cats];
  }, [items, userCategories]);

  const addCategory = () => {
    const name = newCatName.trim();
    if (!name) return;
    if (allCategories.includes(name)) { showToast(t('admin.inventory.categoryExists')); return; }
    setUserCategories(prev => [...prev, name]);
    setNewCatName('');
    showToast(t('admin.inventory.categoryAdded', { name }));
  };

  const removeCategory = (cat) => {
    const usedCount = items.filter(i => i.category === cat).length;
    if (usedCount > 0) {
      setDialog({ title: t('admin.inventory.categoryInUse'), message: t('admin.inventory.categoryInUseMsg', { count: usedCount }), type: 'warning' });
      return;
    }
    setUserCategories(prev => prev.filter(c => c !== cat));
    if (filterCat === cat) setFilterCat('all');
    showToast(t('admin.inventory.categoryRemoved', { name: cat }));
  };

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const q = toNum(item.quantityInStock);
      const m = toNum(item.minStockLevel);
      const matchesSearch = (item.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.category || '').toLowerCase().includes(searchTerm.toLowerCase());
      if (!matchesSearch) return false;
      if (filterCat !== 'all' && item.category !== filterCat) return false;
      if (filterType === 'low') return q > 0 && q <= m;
      if (filterType === 'out') return q <= 0;
      if (filterType === 'critical') return q > 0 && q <= m * 0.5;
      return true;
    }).sort((a, b) => {
      const aQ = toNum(a.quantityInStock), aM = toNum(a.minStockLevel);
      const bQ = toNum(b.quantityInStock), bM = toNum(b.minStockLevel);
      const rank = (q, m) => q <= 0 ? 0 : q <= m * 0.5 ? 1 : q <= m ? 2 : 3;
      return rank(aQ, aM) - rank(bQ, bM);
    });
  }, [items, searchTerm, filterType, filterCat]);

  const totalValue = useMemo(() => items.reduce((s, i) => s + toNum(i.quantityInStock) * toNum(i.costPerUnit), 0), [items]);
  const lowStockCount = useMemo(() => items.filter(i => toNum(i.quantityInStock) > 0 && toNum(i.quantityInStock) <= toNum(i.minStockLevel)).length, [items]);
  const outOfStockCount = useMemo(() => items.filter(i => toNum(i.quantityInStock) <= 0).length, [items]);

  /* ── Movement filters ──────────────────────────────────────────────────────── */
  const inMovements = useMemo(() => movements.filter(m => m.type === 'IN'), [movements]);
  const outMovements = useMemo(() => movements.filter(m => m.type === 'OUT' || m.type === 'WASTE' || m.type === 'ADJUST' || m.type === 'SHRINKAGE'), [movements]);

  const filteredInMoves = useMemo(() => inMovements.filter(m => {
    if (delivDateRange.from && fmtDate(m.createdAt) < delivDateRange.from) return false;
    if (delivDateRange.to && fmtDate(m.createdAt) > delivDateRange.to) return false;
    return true;
  }), [inMovements, delivDateRange]);

  const filteredOutMoves = useMemo(() => outMovements.filter(m => {
    if (outputDateRange.from && fmtDate(m.createdAt) < outputDateRange.from) return false;
    if (outputDateRange.to && fmtDate(m.createdAt) > outputDateRange.to) return false;
    if (outputTypeFilter && m.type !== outputTypeFilter) return false;
    return true;
  }), [outMovements, outputDateRange, outputTypeFilter]);

  /* ── CRUD Handlers ─────────────────────────────────────────────────────────── */
  const handleAddItem = async () => {
    if (!itemForm.name || !itemForm.category || !itemForm.unit) {
      showToast(t('admin.inventory.fillRequired')); return;
    }
    try {
      await warehouseAPI.create({
        name: itemForm.name, category: itemForm.category, unit: itemForm.unit,
        minStockLevel: parseInt(itemForm.minStockLevel) || 5,
        costPerUnit: parseFloat(itemForm.costPerUnit) || 0,
        supplierId: itemForm.supplierId || null,
      });
      showToast(t('admin.inventory.itemAdded')); setModal(null); setItemForm(emptyItemForm); loadData();
    } catch (err) { showToast(t('common.error') + ': ' + (err?.error || err?.message || '')); }
  };

  const handleEditItem = async () => {
    if (!itemForm.name || !itemForm.category || !itemForm.unit) {
      showToast(t('admin.inventory.fillRequired')); return;
    }
    try {
      await warehouseAPI.update(editItemId, {
        name: itemForm.name, category: itemForm.category, unit: itemForm.unit,
        minStockLevel: parseInt(itemForm.minStockLevel) || 5,
        costPerUnit: parseFloat(itemForm.costPerUnit) || 0,
        supplierId: itemForm.supplierId || null,
      });
      showToast(t('admin.inventory.itemUpdated')); setModal(null); loadData();
    } catch (err) { showToast(t('common.error')); }
  };

  const handleDeleteItem = async (item) => {
    try {
      await warehouseAPI.delete(item.id);
      showToast(t('admin.inventory.itemDeleted')); loadData();
    } catch (err) { showToast(t('common.error')); }
  };

  const handleReceive = async () => {
    if (!receiveForm.itemId || !receiveForm.quantity) {
      showToast(t('admin.inventory.selectItemAndQty')); return;
    }
    try {
      await warehouseAPI.receive({
        itemId: receiveForm.itemId,
        quantity: parseFloat(receiveForm.quantity),
        reason: receiveForm.reason,
        expiryDate: receiveForm.expiryDate || null,
        costPerUnit: receiveForm.costPerUnit ? parseFloat(receiveForm.costPerUnit) : undefined,
      });
      showToast(t('admin.inventory.goodsReceived')); setModal(null); setReceiveForm(emptyReceiveForm); loadData();
    } catch (err) { showToast(t('common.error') + ': ' + (err?.error || err?.message || '')); }
  };

  const handleRecordOutput = async () => {
    if (!outputForm.itemId || !outputForm.quantity) {
      showToast(t('admin.inventory.selectItemAndQty')); return;
    }
    if (!outputForm.reason) { showToast(t('admin.inventory.selectReason')); return; }
    try {
      if (outputForm.type === 'OUT') {
        await warehouseAPI.consume({
          itemId: outputForm.itemId,
          quantity: parseFloat(outputForm.quantity),
          reason: outputForm.reason,
        });
      } else {
        const isWaste = outputForm.type === 'WASTE';
        await warehouseAPI.adjust(outputForm.itemId, {
          quantity: parseFloat(outputForm.quantity),
          reason: outputForm.reason,
          isWaste,
        });
      }
      showToast(t('admin.inventory.outputRecorded')); setModal(null); setOutputForm(emptyOutputForm); loadData();
    } catch (err) { showToast(t('common.error') + ': ' + (err?.error || err?.message || '')); }
  };

  const handleSaveSupplier = async () => {
    if (!supplierForm.name || !supplierForm.phone) {
      showToast(t('admin.inventory.namePhoneRequired')); return;
    }
    try {
      if (supplierForm.id) {
        await suppliersAPI.update(supplierForm.id, supplierForm);
        showToast(t('admin.inventory.supplierUpdated'));
      } else {
        await suppliersAPI.create(supplierForm);
        showToast(t('admin.inventory.supplierAdded'));
      }
      setModal(null); setSupplierForm(emptySupplierForm); loadData();
    } catch (err) { showToast(t('common.error')); }
  };

  const handleDeleteSupplier = async (supplier) => {
    try {
      await suppliersAPI.delete(supplier.id);
      showToast(t('admin.inventory.supplierDeleted')); loadData();
    } catch (err) { showToast(t('common.error')); }
  };

  const handleCreateDelivery = async () => {
    if (!delivForm.supplierName) { showToast(t('admin.inventory.fillRequired')); return; }
    const validItems = delivForm.items.filter(i => i.itemName && i.qty);
    if (validItems.length === 0) { showToast(t('admin.inventory.addItem')); return; }
    const total = validItems.reduce((s, i) => s + toNum(i.qty) * toNum(i.unitPrice), 0);
    // 1) Save delivery record
    try {
      await procurementAPI.createDelivery({
        id: `deliv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        supplierId: delivForm.supplierId ? Number(delivForm.supplierId) : null,
        supplierName: delivForm.supplierName,
        status: delivForm.status,
        paymentStatus: delivForm.paymentStatus,
        paymentDueDate: delivForm.paymentDueDate || null,
        notes: delivForm.notes || '',
        total,
        timestamp: todayStr(),
        items: validItems.map(i => ({
          itemName: i.itemName,
          qty: toNum(i.qty),
          unit: i.unit || 'kg',
          unitPrice: toNum(i.unitPrice),
          expiryDate: i.expiryDate || null,
        })),
      });
    } catch (err) {
      console.error('Save delivery API error:', err);
      showToast(t('common.error') + ': ' + (err?.error || err?.message || ''));
      return;
    }
    // 2) Only receive stock into inventory if status is Delivered or Partial
    const autoCreated = [];
    const isStockStatus = ['Delivered', 'Partial'].includes(delivForm.status);
    if (isStockStatus) {
      let currentItems = items;
      try { const fresh = await warehouseAPI.getAll(); if (Array.isArray(fresh)) currentItems = fresh; } catch (_) {}
      for (const line of validItems) {
        const qty = toNum(line.qty);
        if (qty <= 0) continue;
        let warehouseItem = currentItems.find(it => it.name && it.name.toLowerCase() === line.itemName.toLowerCase());
        if (!warehouseItem) {
          try {
            warehouseItem = await warehouseAPI.create({
              name: line.itemName, category: 'Other', unit: line.unit || 'piece',
              minStockLevel: 5, costPerUnit: toNum(line.unitPrice) || 0,
              supplierId: delivForm.supplierId ? Number(delivForm.supplierId) : null,
            });
            autoCreated.push(line.itemName);
          } catch (_) { continue; }
        }
        if (warehouseItem && warehouseItem.id) {
          try {
            await warehouseAPI.receive({
              itemId: warehouseItem.id,
              quantity: qty,
              reason: `Delivery from ${delivForm.supplierName}${delivForm.notes ? ' — ' + delivForm.notes : ''}`,
              costPerUnit: toNum(line.unitPrice) || undefined,
              expiryDate: line.expiryDate || undefined,
            });
          } catch (e) { console.error('Failed to receive stock for', line.itemName, e); }
        }
      }
    }
    const msg = isStockStatus
      ? (autoCreated.length ? t('admin.inventory.deliveryRecordedStock') + '. ' + t('admin.inventory.newItems') + ': ' + autoCreated.join(', ') : t('admin.inventory.deliveryRecordedStock'))
      : t('admin.inventory.deliveryRecorded');
    showToast(msg); setModal(null); setDelivForm(emptyDelivForm); loadData();
  };

  const openDeliveryDetail = async (d) => {
    setDelivDetailLoading(true);
    setDelivDetail({ ...d, items: [] });
    setModal('delivery-detail');
    try {
      const full = await procurementAPI.getDelivery(d.id);
      setDelivDetail(full);
    } catch (err) {
      setDelivDetail({ ...d, items: [] });
    }
    setDelivDetailLoading(false);
  };

  const openPayDelivery = (d) => {
    setPaymentForm({ deliveryId: d.id, supplierName: d.supplierName, amount: toNum(d.total), method: 'Cash', note: '', date: todayStr(), step: 'form', bulk: false, deliveries: null });
    setModal('pay-delivery');
  };
  const openPayBulk = (deliveries, supplierName) => {
    const total = deliveries.reduce((sum, d) => sum + toNum(d.total), 0);
    setPaymentForm({ deliveryId: null, supplierName, amount: total, method: 'Cash', note: '', date: todayStr(), step: 'form', bulk: true, deliveries });
    setModal('pay-delivery');
  };
  const handlePayDelivery = async () => {
    try {
      const paidAt = paymentForm.date ? new Date(paymentForm.date + 'T12:00:00').toISOString() : null;
      if (paymentForm.bulk && paymentForm.deliveries) {
        for (const d of paymentForm.deliveries) {
          await procurementAPI.payDelivery(d.id, { paymentMethod: paymentForm.method, paymentNote: paymentForm.note, paidAt });
        }
        showToast(t('admin.inventory.markedAsPaid'));
      } else {
        await procurementAPI.payDelivery(paymentForm.deliveryId, { paymentMethod: paymentForm.method, paymentNote: paymentForm.note, paidAt });
        showToast(t('admin.inventory.markedAsPaid'));
      }
      setModal(null); loadData();
    } catch (err) { showToast(t('common.error')); }
  };

  const handleChangeDeliveryStatus = async (delivId, newStatus) => {
    try {
      await procurementAPI.updateDeliveryStatus(delivId, newStatus);
      // If status changed to Delivered/Partial, receive items into stock
      if (['Delivered', 'Partial'].includes(newStatus) && delivDetail?.items?.length) {
        let currentItems = items;
        try { const fresh = await warehouseAPI.getAll(); if (Array.isArray(fresh)) currentItems = fresh; } catch (_) {}
        for (const line of delivDetail.items) {
          if (line.removed) continue;
          const qty = toNum(line.qty);
          if (qty <= 0) continue;
          let warehouseItem = currentItems.find(it => it.name && it.name.toLowerCase() === line.itemName.toLowerCase());
          if (!warehouseItem) {
            try {
              warehouseItem = await warehouseAPI.create({
                name: line.itemName, category: 'Other', unit: line.unit || 'piece',
                minStockLevel: 5, costPerUnit: toNum(line.unitPrice) || 0,
              });
            } catch (_) { continue; }
          }
          if (warehouseItem?.id) {
            try {
              await warehouseAPI.receive({
                itemId: warehouseItem.id,
                quantity: qty,
                reason: `Delivery from ${delivDetail.supplierName || ''}`,
                costPerUnit: toNum(line.unitPrice) || undefined,
                expiryDate: line.expiryDate || undefined,
              });
            } catch (_) {}
          }
        }
      }
      showToast(t('admin.inventory.statusUpdated')); setModal(null); setDelivDetail(null); loadData();
    } catch (err) { showToast(t('common.error') + ': ' + (err?.error || err?.message || '')); }
  };

  const handleDeleteDelivery = async (id) => {
    try {
      await procurementAPI.deleteDelivery(id);
      showToast(t('admin.inventory.deliveryDeleted')); loadData();
    } catch (err) { showToast(t('common.error')); }
  };

  const handleRemoveDeliveryItem = async (lineItemId, reason) => {
    try {
      await procurementAPI.removeDeliveryItem(lineItemId, reason);
      // Refresh detail
      if (delivDetail) {
        const full = await procurementAPI.getDelivery(delivDetail.id);
        setDelivDetail(full);
      }
      showToast(t('admin.inventory.itemDeleted')); loadData();
    } catch (err) { showToast(t('common.error')); }
  };

  const handleUpdateDeliveryItemQty = async (lineItemId, newQty) => {
    try {
      await procurementAPI.updateDeliveryItemQty(lineItemId, newQty);
      if (delivDetail) {
        const full = await procurementAPI.getDelivery(delivDetail.id);
        setDelivDetail(full);
      }
      showToast(t('admin.inventory.itemUpdated')); loadData();
    } catch (err) { showToast(t('common.error')); }
  };

  /* ── Quick open helpers ────────────────────────────────────────────────────── */
  const openReceiveFor = (item) => {
    setReceiveForm({ ...emptyReceiveForm, itemId: item.id, costPerUnit: item.costPerUnit || '', supplierId: item.supplierId || '', deliveryDate: todayStr() });
    setModal('receive');
  };
  const openOutputFor = (item, type = 'OUT') => {
    setOutputForm({ ...emptyOutputForm, itemId: item.id, type });
    setModal('output');
  };
  const openEditItem = (item) => {
    setEditItemId(item.id);
    setItemForm({
      name: item.name, category: item.category, unit: item.unit,
      quantity: item.quantityInStock, minStockLevel: item.minStockLevel,
      costPerUnit: item.costPerUnit, supplierId: item.supplierId || '',
      expiryDate: item.expiryDate || '',
    });
    setModal('edit-item');
  };
  const confirmDeleteItem = (item) => {
    setDialog({
      title: t('admin.inventory.deleteItem'),
      message: t('admin.inventory.deleteDeliveryConfirm', { supplier: item.name }),
      type: 'danger',
      confirmLabel: t('common.delete'),
      onConfirm: () => { setDialog(null); handleDeleteItem(item); },
    });
  };
  const confirmDeleteSupplier = (supplier) => {
    setDialog({
      title: t('admin.inventory.deleteSupplier'),
      message: t('admin.inventory.deleteDeliveryConfirm', { supplier: supplier.name }),
      type: 'danger',
      confirmLabel: t('common.delete'),
      onConfirm: () => { setDialog(null); handleDeleteSupplier(supplier); },
    });
  };

  /* ── Delivery line item helpers ─────────────────────────────────────────────── */
  const addDelivLine = () => setDelivForm(f => ({ ...f, items: [...f.items, { itemName: '', qty: '', unit: 'kg', unitPrice: '', expiryDate: '' }] }));
  const removeDelivLine = (idx) => setDelivForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
  const updateDelivLine = (idx, field, val) => setDelivForm(f => ({
    ...f, items: f.items.map((line, i) => i === idx ? { ...line, [field]: val } : line),
  }));

  /* ── TABS ──────────────────────────────────────────────────────────────────── */
  const TABS = [
    { id: 'overview',   label: t('admin.inventory.stockOverview'),  Icon: Package },
    { id: 'deliveries', label: t('admin.inventory.deliveriesIn'), Icon: Truck },
    { id: 'output',     label: t('admin.inventory.stockOutput'),    Icon: ArrowUpFromLine },
    { id: 'suppliers',  label: t('admin.inventory.suppliers'),        Icon: ShoppingCart },
  ];

  /* ════════════════════════════════════════════════════════════════════════════ */
  /*                                 RENDER                                     */
  /* ════════════════════════════════════════════════════════════════════════════ */
  return (
    <div className="h-full overflow-auto bg-gray-50">
      {/* ── HEADER ─────────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
              <Package className="w-7 h-7 text-blue-600" />
              {t("admin.inventory.title")}
            </h1>
            <p className="text-sm text-gray-500 mt-1">{t("admin.inventory.stockOverview")}</p>
          </div>
          <button
            onClick={() => loadData()}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 font-medium text-sm transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {t('common.refresh')}
          </button>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
          <div className="bg-white rounded-2xl p-4 border border-gray-100 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{t("owner.inventory.totalItems")}</p>
                <p className="text-3xl font-black text-gray-900 mt-1">{items.length}</p>
              </div>
              <div className="w-11 h-11 bg-blue-50 rounded-2xl flex items-center justify-center">
                <Box className="w-5 h-5 text-blue-500" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl p-4 border border-gray-100 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{t('admin.inventory.lowStock')}</p>
                <p className={`text-3xl font-black mt-1 ${lowStockCount > 0 ? 'text-amber-500' : 'text-gray-900'}`}>{lowStockCount}</p>
              </div>
              <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${lowStockCount > 0 ? 'bg-amber-50' : 'bg-gray-50'}`}>
                <AlertTriangle className={`w-5 h-5 ${lowStockCount > 0 ? 'text-amber-500' : 'text-gray-300'}`} />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl p-4 border border-gray-100 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{t('admin.inventory.outOfStock')}</p>
                <p className={`text-3xl font-black mt-1 ${outOfStockCount > 0 ? 'text-red-500' : 'text-gray-900'}`}>{outOfStockCount}</p>
              </div>
              <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${outOfStockCount > 0 ? 'bg-red-50' : 'bg-gray-50'}`}>
                <AlertCircle className={`w-5 h-5 ${outOfStockCount > 0 ? 'text-red-500' : 'text-gray-300'}`} />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl p-4 border border-gray-100 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{t("common.total")}</p>
                <p className="text-2xl font-black text-gray-900 mt-1">{money(totalValue)}</p>
              </div>
              <div className="w-11 h-11 bg-emerald-50 rounded-2xl flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-emerald-500" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── TAB BAR ────────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-6">
        <div className="flex gap-1">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-5 py-3.5 font-medium text-sm border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <tab.Icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6">

        {/* ══════════════════════ TAB 1: STOCK OVERVIEW ══════════════════════════ */}
        {activeTab === 'overview' && (
          <div className="space-y-5">
            {/* Toolbar: Search → + Add → Status → Category → Manage Categories */}
            <div className="flex items-center gap-2.5">
              {/* 1. Search */}
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300 w-4 h-4" />
                <input type="text" placeholder={t('admin.inventory.searchPlaceholder')} value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-8 py-2.5 border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm placeholder:text-gray-300" />
                {searchTerm && <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"><X className="w-4 h-4" /></button>}
              </div>
              {/* 2. Add New Item */}
              <button onClick={() => { setItemForm(emptyItemForm); setEditItemId(null); setModal('add-item'); }}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-semibold text-sm shadow-sm whitespace-nowrap transition-colors">
                <Plus className="w-4 h-4" />{t('admin.inventory.addNewItem')}
              </button>
              {/* 3. Status filter */}
              <Dropdown value={filterType} onChange={setFilterType}
                options={[{ value: 'all', label: t('common.all') }, { value: 'low', label: t('admin.inventory.lowStock') }, { value: 'critical', label: t('admin.inventory.critical') }, { value: 'out', label: t('admin.inventory.outOfStock') }]}
                className="w-[150px]" />
              {/* 4. Category filter */}
              <Dropdown value={filterCat} onChange={setFilterCat}
                options={[{ value: 'all', label: t('admin.inventory.allCategories') }, ...allCategories.map(c => ({ value: c, label: c }))]}
                className="w-[170px]" />
              {/* 5. Manage Categories */}
              <button onClick={() => setModal('manage-categories')}
                className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 rounded-xl bg-white hover:bg-gray-50 text-gray-500 hover:text-gray-700 font-medium text-sm transition-colors whitespace-nowrap">
                <Layers className="w-4 h-4" />{t('common.settings')}
              </button>
            </div>

            {/* Inventory Table */}
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="px-5 py-3.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{t('common.name')}</th>
                      <th className="px-5 py-3.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{t('common.category')}</th>
                      <th className="px-5 py-3.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{t('admin.inventory.inStock')}</th>
                      <th className="px-5 py-3.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{t('admin.inventory.lowStock')}</th>
                      <th className="px-5 py-3.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{t('admin.inventory.costPerUnit')}</th>
                      <th className="px-5 py-3.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{t('common.total')}</th>
                      <th className="px-5 py-3.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{t('common.status')}</th>
                      <th className="px-5 py-3.5 text-right text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{t('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.length > 0 ? filteredItems.map((item, idx) => {
                      const status = getStatus(item.quantityInStock, item.minStockLevel, t);
                      const pct = toNum(item.minStockLevel) > 0 ? Math.min((toNum(item.quantityInStock) / toNum(item.minStockLevel)) * 100, 100) : 100;
                      const expanded = expandedItem === item.id;
                      const nearestExpiry = item.batches?.filter(b => b.expiryDate).sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate))[0];
                      const daysToExpiry = nearestExpiry ? daysUntil(nearestExpiry.expiryDate) : null;
                      return (
                        <tr key={item.id} className={`transition-colors hover:bg-gray-50/60 ${idx !== filteredItems.length - 1 ? 'border-b border-gray-50' : ''} ${expanded ? 'bg-blue-50/30' : ''}`}>
                          <td className="px-5 py-3.5">
                            <button onClick={() => setExpandedItem(expanded ? null : item.id)} className="text-left group">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-gray-900 text-sm group-hover:text-blue-600 transition-colors">{item.name}</span>
                                {item.batches?.length > 0 && (
                                  expanded ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-500" />
                                )}
                              </div>
                              <span className="text-xs text-gray-400">{item.unit}</span>
                              {daysToExpiry !== null && daysToExpiry <= 14 && (
                                <span className={`ml-2 text-[11px] font-semibold ${daysToExpiry <= 3 ? 'text-red-500' : 'text-orange-500'}`}>
                                  {daysToExpiry <= 0 ? t('admin.inventory.expired') : t('admin.inventory.daysToExpiry', { days: daysToExpiry })}
                                </span>
                              )}
                            </button>
                            {expanded && item.batches?.length > 0 && (
                              <div className="mt-2 ml-1 space-y-1">
                                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{t('admin.inventory.stockBatches')}</p>
                                {item.batches.map((b, i) => {
                                  const d = daysUntil(b.expiryDate);
                                  return (
                                    <div key={b.id || i} className="flex items-center gap-3 text-xs bg-white rounded-lg px-3 py-1.5 border border-gray-100">
                                      <span className="font-medium text-gray-700">{fmtNum(b.quantityRemaining)} {item.unit}</span>
                                      {b.expiryDate ? (
                                        <span className={`${d !== null && d <= 3 ? 'text-red-600 font-semibold' : d !== null && d <= 14 ? 'text-orange-600' : 'text-gray-500'}`}>
                                          {t('admin.inventory.expiry')}: {fmtDate(b.expiryDate)} {d !== null && d <= 14 && `(${d <= 0 ? t('admin.inventory.expired') : d + 'd'})`}
                                        </span>
                                      ) : <span className="text-gray-400">{t('admin.inventory.noExpiry')}</span>}
                                      <span className="text-gray-400">{t('admin.inventory.received')}: {fmtDate(b.receivedAt)}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </td>
                          <td className="px-5 py-3.5">
                            <span className="inline-flex px-2.5 py-1 bg-gray-50 text-gray-600 text-xs font-medium rounded-lg">{item.category}</span>
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="space-y-1.5">
                              <span className="text-sm font-bold text-gray-900">{fmtNum(item.quantityInStock)} <span className="text-xs font-normal text-gray-400">{item.unit}</span></span>
                              <div className="w-28 bg-gray-100 rounded-full h-1.5">
                                <div className={`h-1.5 rounded-full transition-all duration-500 ${status.bar}`} style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-sm text-gray-500">{toNum(item.minStockLevel)} {item.unit}</td>
                          <td className="px-5 py-3.5 text-sm font-medium text-gray-800">{money(item.costPerUnit)}</td>
                          <td className="px-5 py-3.5 text-sm font-semibold text-gray-800">{money(toNum(item.quantityInStock) * toNum(item.costPerUnit))}</td>
                          <td className="px-5 py-3.5">
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap ${status.color}`}>
                              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${status.dot}`} />
                              {status.label}
                            </span>
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex justify-end gap-1.5 flex-wrap">
                              <button onClick={() => openReceiveFor(item)} className="px-2.5 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg text-xs font-medium hover:bg-emerald-100 border border-emerald-100 transition-colors">{t('admin.inventory.goodsArrival')}</button>
                              <button onClick={() => openOutputFor(item)} className="px-2.5 py-1.5 bg-orange-50 text-orange-600 rounded-lg text-xs font-medium hover:bg-orange-100 border border-orange-100 transition-colors">{t('admin.inventory.outputTypes.out')}</button>
                              <button onClick={() => openOutputFor(item, 'ADJUST')} className="px-2.5 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-medium hover:bg-indigo-100 border border-indigo-100 transition-colors">{t('admin.inventory.outputTypes.adjust')}</button>
                              <button onClick={() => openEditItem(item)} className="px-2.5 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-xs font-medium hover:bg-blue-100 border border-blue-100 transition-colors">{t('common.edit')}</button>
                              <button onClick={() => confirmDeleteItem(item)} className="px-2.5 py-1.5 bg-red-50 text-red-500 rounded-lg text-xs font-medium hover:bg-red-100 border border-red-100 transition-colors">{t('common.delete')}</button>
                            </div>
                          </td>
                        </tr>
                      );
                    }) : (
                      <tr><td colSpan="8" className="px-6 py-16 text-center">
                        <div className="w-14 h-14 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                          <Package className="w-7 h-7 text-gray-300" />
                        </div>
                        <p className="text-gray-500 font-semibold text-sm">{t('common.noResults')}</p>
                        <p className="text-gray-400 text-xs mt-1">{t('common.noResults')}</p>
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════ TAB 2: DELIVERIES (IN) ════════════════════════ */}
        {activeTab === 'deliveries' && (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-3">
              <button onClick={() => { setReceiveForm(emptyReceiveForm); setModal('receive'); }}
                className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-xl hover:bg-green-700 font-medium text-sm shadow-sm">
                <ArrowDownToLine className="w-4 h-4" />{t('admin.inventory.goodsArrival')}
              </button>
              <button onClick={() => { setDelivForm(emptyDelivForm); setModal('delivery'); }}
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-medium text-sm shadow-sm">
                <Truck className="w-4 h-4" />{t('admin.inventory.deliveryRecorded')}
              </button>
              {debtTotal > 0 && (
                <div className="flex items-center gap-2 px-4 py-2.5 bg-red-50 text-red-700 rounded-xl border border-red-200 text-sm font-semibold ml-auto">
                  <AlertTriangle className="w-4 h-4" /> {t('admin.inventory.unpaidDebt')}: {money(debtTotal)}
                </div>
              )}
            </div>

            {/* Date presets */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide mr-2">{t('admin.inventory.period')}:</span>
                {[{ id: 'today', label: t('periods.today') }, { id: '7d', label: t('periods.last7days') }, { id: '30d', label: t('periods.last30days') }, { id: 'month', label: t('periods.thisMonth') }].map(p => (
                  <button key={p.id} onClick={() => { setDelivPreset(p.id); setDelivDateRange(getDateRange(p.id)); }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${delivPreset === p.id ? 'bg-blue-100 text-blue-700 border border-blue-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-transparent'}`}>
                    {p.label}
                  </button>
                ))}
                <button onClick={() => { setDelivPreset(''); setDelivDateRange({ from: '', to: '' }); }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:text-gray-700">{t('common.clear')}</button>
                <div className="flex gap-2 ml-auto items-center">
                  <DatePicker value={delivDateRange.from} onChange={v => { setDelivPreset(''); setDelivDateRange(r => ({ ...r, from: v })); }} placeholder={t('common.from')} size="sm" className="w-[140px]" />
                  <span className="text-gray-400 text-xs">{t('common.to').toLowerCase()}</span>
                  <DatePicker value={delivDateRange.to} onChange={v => { setDelivPreset(''); setDelivDateRange(r => ({ ...r, to: v })); }} placeholder={t('common.to')} size="sm" className="w-[140px]" />
                </div>
              </div>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white rounded-xl p-5 border border-gray-200">
                <p className="text-xs font-semibold text-gray-500 uppercase">{t('common.total')}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{filteredInMoves.length}</p>
              </div>
              <div className="bg-white rounded-xl p-5 border border-gray-200">
                <p className="text-xs font-semibold text-gray-500 uppercase">{t('common.total')}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{fmtNum(filteredInMoves.reduce((s, m) => s + toNum(m.quantity), 0))}</p>
              </div>
              <div className="bg-white rounded-xl p-5 border border-gray-200">
                <p className="text-xs font-semibold text-gray-500 uppercase">{t('common.total')}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{money(filteredInMoves.reduce((s, m) => s + toNum(m.quantity) * toNum(m.costPerUnit), 0))}</p>
              </div>
            </div>

            {/* In-Transit / Ordered Deliveries — shown first */}
            {(() => {
              const pendingDeliveries = deliveries.filter(d => ['Ordered', 'In Transit'].includes(d.status));
              return pendingDeliveries.length > 0 && (
                <div className="bg-white rounded-xl border border-blue-200 overflow-hidden shadow-sm">
                  <div className="px-5 py-3 bg-blue-50 border-b border-blue-200 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-blue-800 flex items-center gap-2">
                      <Truck className="w-4 h-4" />{t('statuses.pending')}
                    </h3>
                    <span className="text-xs text-blue-600 font-medium">{pendingDeliveries.length} {t('admin.inventory.active')}</span>
                  </div>
                  <div className="divide-y divide-blue-50">
                    {pendingDeliveries.map(d => (
                      <div key={d.id} onClick={() => openDeliveryDetail(d)} className="px-5 py-3.5 flex items-center gap-4 hover:bg-blue-50/30 cursor-pointer transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm text-gray-900 truncate">{d.supplierName}</span>
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${DELIVERY_STATUS_COLORS[d.status] || 'bg-gray-100 text-gray-700'}`}>{d.status}</span>
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${d.paymentStatus === 'paid' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                              {d.paymentStatus === 'paid' ? t('common.paid') : t('common.unpaid')}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                            <span>{fmtDate(d.timestamp || d.createdAt)}</span>
                            {d.total > 0 && <span className="font-semibold text-gray-700">{money(d.total)}</span>}
                          </div>
                        </div>
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Completed Deliveries (Delivered / Partial only) — filtered by period */}
            {(() => {
              const completedDeliveries = deliveries.filter(d => {
                if (!['Delivered', 'Partial'].includes(d.status)) return false;
                const date = fmtDate(d.timestamp || d.createdAt);
                if (delivDateRange.from && date < delivDateRange.from) return false;
                if (delivDateRange.to && date > delivDateRange.to) return false;
                return true;
              });
              return completedDeliveries.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                  <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-700">{t('common.done')}</h3>
                    <span className="text-xs text-gray-500">{completedDeliveries.length} {t('admin.inventory.deliveries')}</span>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {completedDeliveries.map(d => (
                      <div key={d.id} onClick={() => openDeliveryDetail(d)} className="px-5 py-3.5 flex items-center gap-4 hover:bg-gray-50 cursor-pointer transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm text-gray-900 truncate">{d.supplierName}</span>
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${DELIVERY_STATUS_COLORS[d.status] || 'bg-gray-100 text-gray-700'}`}>{d.status}</span>
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${d.paymentStatus === 'paid' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                              {d.paymentStatus === 'paid' ? t('common.paid') : t('common.unpaid')}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                            <span>{fmtDate(d.timestamp || d.createdAt)}</span>
                            {d.total > 0 && <span className="font-semibold text-gray-700">{money(d.total)}</span>}
                          </div>
                          {/* Due date indicator for unpaid deliveries */}
                          {d.paymentStatus !== 'paid' && d.paymentDueDate && (() => {
                            const now = new Date(); now.setHours(0,0,0,0);
                            const due = new Date(d.paymentDueDate + (d.paymentDueDate.includes('T') ? '' : 'T00:00:00')); due.setHours(0,0,0,0);
                            const diffDays = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
                            const isOverdue = diffDays < 0;
                            const isDueSoon = diffDays >= 0 && diffDays <= 3;
                            return (
                              <div className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-xs font-semibold ${isOverdue ? 'bg-red-100 text-red-700' : isDueSoon ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                                {isOverdue ? <AlertCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                                {isOverdue ? t('admin.inventory.overdue', { days: Math.abs(diffDays) }) : diffDays === 0 ? t('admin.inventory.dueToday') : t('admin.inventory.dueIn', { days: diffDays })}
                              </div>
                            );
                          })()}
                          {d.paymentStatus === 'paid' && d.paidAt && <div className="text-xs text-gray-400 mt-0.5">{t('admin.inventory.paidOn', { date: fmtDate(d.paidAt) })}</div>}
                        </div>
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Stock Movements (IN) */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
              <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
                <h3 className="text-sm font-semibold text-gray-700">{t('admin.inventory.stockOverview')}</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase">{t('common.date')}</th>
                      <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase">{t('admin.inventory.item')}</th>
                      <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase">{t('admin.inventory.qty')}</th>
                      <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase">{t('admin.inventory.cost')}</th>
                      <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase">{t('admin.inventory.reason')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filteredInMoves.length > 0 ? filteredInMoves.map(m => (
                      <tr key={m.id} className="hover:bg-gray-50">
                        <td className="px-5 py-2.5 text-xs text-gray-600">{fmtDate(m.createdAt)}</td>
                        <td className="px-5 py-2.5 text-sm font-medium text-gray-900">{m.itemName}</td>
                        <td className="px-5 py-2.5 text-sm font-bold text-green-700">+{m.quantity}</td>
                        <td className="px-5 py-2.5 text-xs text-gray-600">{money(toNum(m.quantity) * toNum(m.costPerUnit))}</td>
                        <td className="px-5 py-2.5"><span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${REASON_COLORS[m.reason] || 'bg-gray-100 text-gray-700'}`}>{m.reason}</span></td>
                      </tr>
                    )) : (
                      <tr><td colSpan="5" className="px-6 py-8 text-center text-gray-400 text-sm">{t('common.noResults')}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════ TAB 3: STOCK OUTPUT ═══════════════════════════ */}
        {activeTab === 'output' && (
          <div className="space-y-5">
            {/* Filters bar */}
            <div className="flex flex-wrap gap-3 items-end">
              <button onClick={() => { setOutputForm(emptyOutputForm); setModal('output'); }}
                className="flex items-center gap-2 px-4 py-[9px] bg-orange-500 text-white rounded-xl hover:bg-orange-600 font-medium text-sm shadow-sm">
                <ArrowUpFromLine className="w-4 h-4" />{t('admin.inventory.stockOutput')}
              </button>
              <div>
                <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">{t('common.from')}</label>
                <DatePicker value={outputDateRange.from} onChange={v => { setOutputPreset(''); setOutputDateRange(r => ({ ...r, from: v })); }} placeholder={t('common.from')} size="sm" className="w-[150px]" />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">{t('common.to')}</label>
                <DatePicker value={outputDateRange.to} onChange={v => { setOutputPreset(''); setOutputDateRange(r => ({ ...r, to: v })); }} placeholder={t('common.to')} size="sm" className="w-[150px]" />
              </div>
              <div className="flex gap-1.5 items-center pb-[1px]">
                {[{ id: 'today', label: t('periods.today') }, { id: '7d', label: t('periods.last7days') }, { id: '30d', label: t('periods.last30days') }, { id: 'month', label: t('periods.thisMonth') }].map(p => (
                  <button key={p.id} onClick={() => { setOutputPreset(p.id); setOutputDateRange(getDateRange(p.id)); }}
                    className={`px-2.5 py-2 rounded-lg text-[11px] font-semibold transition-colors ${outputPreset === p.id ? 'bg-orange-100 text-orange-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}>
                    {p.label}
                  </button>
                ))}
                {(outputDateRange.from || outputDateRange.to) && (
                  <button onClick={() => { setOutputPreset(''); setOutputDateRange({ from: '', to: '' }); }}
                    className="px-2 py-2 rounded-lg text-[11px] font-semibold text-gray-400 hover:text-red-500">{t('common.clear')}</button>
                )}
              </div>
              <div className="ml-auto">
                <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">{t('admin.inventory.type')}</label>
                <Dropdown value={outputTypeFilter} onChange={v => setOutputTypeFilter(v)}
                  options={[{ value: '', label: t('common.all') }, { value: 'OUT', label: t('admin.inventory.outputTypes.out') }, { value: 'WASTE', label: t('admin.inventory.outputTypes.waste') }, { value: 'ADJUST', label: t('admin.inventory.outputTypes.adjust') }, { value: 'SHRINKAGE', label: t('admin.inventory.outputTypes.shrinkage') }]}
                  size="sm" className="w-[150px]" />
              </div>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white rounded-xl p-5 border border-gray-200">
                <div className="flex items-center gap-2">
                  <TrendingDown className="w-4 h-4 text-orange-500" />
                  <p className="text-xs font-semibold text-gray-500 uppercase">{t('admin.inventory.outputTypes.out')}</p>
                </div>
                <p className="text-2xl font-bold text-gray-900 mt-1">{fmtNum(filteredOutMoves.filter(m => m.type === 'OUT').reduce((s, m) => s + toNum(m.quantity), 0))}</p>
                <p className="text-xs text-gray-500 mt-0.5">{money(filteredOutMoves.filter(m => m.type === 'OUT').reduce((s, m) => s + toNum(m.quantity) * toNum(m.costPerUnit), 0))}</p>
              </div>
              <div className="bg-white rounded-xl p-5 border border-gray-200">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                  <p className="text-xs font-semibold text-gray-500 uppercase">{t('admin.inventory.outputTypes.waste')}</p>
                </div>
                <p className="text-2xl font-bold text-gray-900 mt-1">{fmtNum(filteredOutMoves.filter(m => m.type === 'WASTE' || m.type === 'SHRINKAGE').reduce((s, m) => s + toNum(m.quantity), 0))}</p>
                <p className="text-xs text-gray-500 mt-0.5">{money(filteredOutMoves.filter(m => m.type === 'WASTE' || m.type === 'SHRINKAGE').reduce((s, m) => s + toNum(m.quantity) * toNum(m.costPerUnit), 0))}</p>
              </div>
              <div className="bg-white rounded-xl p-5 border border-gray-200">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-gray-500" />
                  <p className="text-xs font-semibold text-gray-500 uppercase">{t('admin.inventory.totalCost')}</p>
                </div>
                <p className="text-2xl font-bold text-gray-900 mt-1">{money(filteredOutMoves.reduce((s, m) => s + toNum(m.quantity) * toNum(m.costPerUnit), 0))}</p>
              </div>
            </div>

            {/* Output Table */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase">{t('common.date')}</th>
                      <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase">{t('admin.inventory.item')}</th>
                      <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase">{t('admin.inventory.qty')}</th>
                      <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase">{t('admin.inventory.type')}</th>
                      <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase">{t('admin.inventory.reason')}</th>
                      <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase">{t('admin.inventory.cost')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filteredOutMoves.length > 0 ? filteredOutMoves.map(m => (
                      <tr key={m.id} className="hover:bg-gray-50">
                        <td className="px-5 py-2.5 text-xs text-gray-600">{fmtDate(m.createdAt)}</td>
                        <td className="px-5 py-2.5 text-sm font-medium text-gray-900">{m.itemName}</td>
                        <td className="px-5 py-2.5 text-sm font-bold text-red-600">-{m.quantity}</td>
                        <td className="px-5 py-2.5"><span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${TYPE_COLORS[m.type] || 'bg-gray-100 text-gray-700'}`}>{m.type}</span></td>
                        <td className="px-5 py-2.5"><span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${REASON_COLORS[m.reason] || 'bg-gray-100 text-gray-700'}`}>{m.reason}</span></td>
                        <td className="px-5 py-2.5 text-xs text-gray-600">{money(toNum(m.quantity) * toNum(m.costPerUnit))}</td>
                      </tr>
                    )) : (
                      <tr><td colSpan="6" className="px-6 py-8 text-center text-gray-400 text-sm">{t('common.noResults')}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════ TAB 4: SUPPLIERS ══════════════════════════════ */}
        {activeTab === 'suppliers' && !supplierDetail && (
          <div className="space-y-5">
            <div className="flex gap-3">
              <button onClick={() => { setSupplierForm(emptySupplierForm); setModal('add-supplier'); }}
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-medium text-sm shadow-sm">
                <Plus className="w-4 h-4" />{t('common.add')}
              </button>
            </div>

            {/* Outstanding Debt Summary — expandable per supplier */}
            {(() => {
              const unpaidDeliveries = deliveries.filter(d => d.paymentStatus !== 'paid' && ['Delivered', 'Partial'].includes(d.status));
              const totalDebt = unpaidDeliveries.reduce((s, d) => s + toNum(d.total), 0);
              const debtBySupplier = {};
              unpaidDeliveries.forEach(d => {
                const key = d.supplierName || 'Unknown';
                if (!debtBySupplier[key]) debtBySupplier[key] = { name: key, total: 0, count: 0, deliveries: [] };
                debtBySupplier[key].total += toNum(d.total);
                debtBySupplier[key].count += 1;
                debtBySupplier[key].deliveries.push(d);
              });
              return totalDebt > 0 && (
                <div className="bg-red-50 rounded-xl border border-red-200 p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-red-800 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" />{t('common.unpaid')}
                    </h3>
                    <span className="text-lg font-bold text-red-700">{money(totalDebt)}</span>
                  </div>
                  <div className="space-y-2">
                    {Object.values(debtBySupplier).sort((a, b) => b.total - a.total).map(s => {
                      const isExp = expandedDebtSupplier === s.name;
                      return (
                        <div key={s.name} className="bg-white rounded-xl border border-red-100 overflow-hidden">
                          <button onClick={() => setExpandedDebtSupplier(isExp ? null : s.name)}
                            className="w-full flex items-center justify-between p-3 hover:bg-red-50 transition-colors">
                            <div className="text-left">
                              <p className="font-semibold text-sm text-gray-900">{s.name}</p>
                              <p className="text-xs text-gray-500">{s.count} {t('admin.inventory.unpaidDeliveries').toLowerCase()}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-red-700">{money(s.total)}</span>
                              {isExp ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                            </div>
                          </button>
                          {isExp && (
                            <div className="border-t border-red-100">
                              {s.deliveries.map(d => (
                                <div key={d.id} className="flex items-center justify-between px-4 py-3 border-b border-red-50 last:border-0">
                                  <div>
                                    <p className="text-sm font-medium text-gray-900">{money(d.total)}</p>
                                    <p className="text-xs text-gray-500">{fmtDate(d.timestamp || d.createdAt)}</p>
                                    <span className={`inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${d.status === 'Delivered' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{d.status}</span>
                                  </div>
                                  <button onClick={() => openPayDelivery({ ...d, supplierName: s.name })}
                                    className="px-4 py-2 bg-green-600 text-white rounded-lg text-xs font-bold hover:bg-green-700">{t('admin.inventory.pay')}</button>
                                </div>
                              ))}
                              <div className="p-3">
                                <button onClick={() => openPayBulk(s.deliveries, s.name)}
                                  className="w-full py-2.5 bg-green-600 text-white rounded-lg text-sm font-bold hover:bg-green-700 transition-colors">
                                  {t('admin.inventory.payAll')} ({money(s.total)})
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Supplier Cards — click opens detail */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {suppliers.length > 0 ? suppliers.map(s => {
                const unpaidDelivs = deliveries.filter(d => d.paymentStatus !== 'paid' && ['Delivered', 'Partial'].includes(d.status) && (d.supplierName === s.name || d.supplierId === s.id));
                const supplierDebt = unpaidDelivs.reduce((sum, d) => sum + toNum(d.total), 0);
                const allDelivs = deliveries.filter(d => d.supplierName === s.name || d.supplierId === s.id);
                return (
                  <div key={s.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow cursor-pointer" onClick={() => setSupplierDetail(s)}>
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="text-base font-bold text-gray-900">{s.name}</h3>
                        {s.contactName && <p className="text-sm text-gray-500">{s.contactName}</p>}
                      </div>
                      <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                        <button onClick={() => { setSupplierForm({ id: s.id, name: s.name, contactName: s.contactName || '', phone: s.phone || '', email: s.email || '', address: s.address || '', paymentTerms: s.paymentTerms || '', category: s.category || '' }); setModal('add-supplier'); }}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => confirmDeleteSupplier(s)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="text-sm space-y-1">
                      {s.phone && <p className="text-gray-600">{formatPhoneDisplay(s.phone)}</p>}
                      {s.category && <span className="inline-block px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md text-xs font-medium">{s.category}</span>}
                      {supplierDebt > 0 && <p className="text-red-600 font-bold mt-2">{t('admin.inventory.owes')}: {money(supplierDebt)}</p>}
                    </div>
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500">
                      <span>{allDelivs.length} {t('admin.inventory.orders')}</span>
                      <ChevronRight className="w-4 h-4" />
                    </div>
                  </div>
                );
              }) : (
                <div className="col-span-full bg-white rounded-xl border border-gray-200 p-12 text-center">
                  <ShoppingCart className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 font-medium">{t('common.noResults')}</p>
                  <p className="text-gray-400 text-sm mt-1">{t('common.noResults')}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Supplier Detail View ── */}
        {activeTab === 'suppliers' && supplierDetail && (() => {
          const s = supplierDetail;
          const allDelivs = deliveries.filter(d => d.supplierName === s.name || d.supplierId === s.id)
            .sort((a, b) => (b.timestamp || b.createdAt || '').localeCompare(a.timestamp || a.createdAt || ''));
          const unpaidDelivs = allDelivs.filter(d => d.paymentStatus !== 'paid' && ['Delivered', 'Partial'].includes(d.status));
          const supplierDebt = unpaidDelivs.reduce((sum, d) => sum + toNum(d.total), 0);
          const totalSpent = allDelivs.reduce((sum, d) => sum + toNum(d.total), 0);
          return (
            <div className="space-y-5">
              <button onClick={() => setSupplierDetail(null)} className="flex items-center gap-2 text-blue-600 font-semibold text-sm hover:text-blue-700">
                <ArrowLeft className="w-4 h-4" />{t('admin.inventory.suppliers')}
              </button>

              {/* Info card */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">{s.name}</h2>
                    {s.contactName && <p className="text-gray-500 mt-1">{s.contactName}</p>}
                    {s.category && <span className="inline-block mt-2 px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs font-semibold">{s.category}</span>}
                  </div>
                  <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                    <button onClick={() => { setSupplierForm({ id: s.id, name: s.name, contactName: s.contactName || '', phone: s.phone || '', email: s.email || '', address: s.address || '', paymentTerms: s.paymentTerms || '', category: s.category || '' }); setModal('add-supplier'); }}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"><Edit2 className="w-4 h-4" /></button>
                    <button onClick={() => confirmDeleteSupplier(s)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4 text-sm">
                  {s.phone && <div className="flex items-center gap-2 text-gray-600"><Phone className="w-4 h-4 text-gray-400" />{s.phone}</div>}
                  {s.email && <div className="flex items-center gap-2 text-gray-600"><Mail className="w-4 h-4 text-gray-400" />{s.email}</div>}
                  {s.address && <div className="flex items-center gap-2 text-gray-600"><MapPin className="w-4 h-4 text-gray-400" />{s.address}</div>}
                  {s.paymentTerms && <div className="flex items-center gap-2 text-gray-600"><FileText className="w-4 h-4 text-gray-400" />{t('admin.inventory.terms')}: {s.paymentTerms}</div>}
                </div>
                {/* Stats */}
                <div className="grid grid-cols-3 gap-4 mt-5">
                  <div className="bg-green-50 rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold text-green-700">{allDelivs.length}</p>
                    <p className="text-xs font-medium text-green-600 mt-1">{t('common.total')}</p>
                  </div>
                  <div className={`${supplierDebt > 0 ? 'bg-red-50' : 'bg-green-50'} rounded-xl p-4 text-center`}>
                    <p className={`text-2xl font-bold ${supplierDebt > 0 ? 'text-red-700' : 'text-green-700'}`}>{money(supplierDebt)}</p>
                    <p className={`text-xs font-medium ${supplierDebt > 0 ? 'text-red-600' : 'text-green-600'} mt-1`}>{t('common.unpaid')}</p>
                  </div>
                  <div className="bg-blue-50 rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold text-blue-700">{money(totalSpent)}</p>
                    <p className="text-xs font-medium text-blue-600 mt-1">{t('common.total')}</p>
                  </div>
                </div>
              </div>

              {/* Unpaid deliveries */}
              {unpaidDelivs.length > 0 && (
                <div className="bg-white rounded-xl border border-red-200 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-red-800">{t('admin.inventory.unpaidDeliveries')} ({unpaidDelivs.length})</h3>
                    <button onClick={() => openPayBulk(unpaidDelivs, s.name)}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg text-xs font-bold hover:bg-green-700">{t('admin.inventory.payAll')} ({money(supplierDebt)})</button>
                  </div>
                  <div className="space-y-2">
                    {unpaidDelivs.map(d => (
                      <div key={d.id} className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                        <div>
                          <p className="font-semibold text-sm text-gray-900">{money(d.total)}</p>
                          <p className="text-xs text-gray-500">{fmtDate(d.timestamp || d.createdAt)}</p>
                          <span className={`inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${d.status === 'Delivered' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{d.status}</span>
                        </div>
                        <button onClick={() => openPayDelivery({ ...d, supplierName: s.name })}
                          className="px-4 py-2 bg-green-600 text-white rounded-lg text-xs font-bold hover:bg-green-700">Pay</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* All deliveries */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="text-sm font-bold text-gray-900 mb-4">{t('admin.inventory.allDeliveries')} ({allDelivs.length})</h3>
                {allDelivs.length > 0 ? (
                  <div className="space-y-2">
                    {allDelivs.map(d => {
                      const isPaid = d.paymentStatus === 'paid';
                      return (
                        <div key={d.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-gray-500">{fmtDate(d.timestamp || d.createdAt)}</span>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${d.status === 'Delivered' ? 'bg-green-100 text-green-700' : d.status === 'Partial' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>{d.status}</span>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${isPaid ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{isPaid ? t('common.paid') : t('common.unpaid')}</span>
                          </div>
                          <span className={`font-bold text-sm ${isPaid ? 'text-gray-700' : 'text-red-600'}`}>{money(d.total)}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : <p className="text-gray-500 text-sm text-center py-4">{t('common.noResults')}</p>}
              </div>
            </div>
          );
        })()}
      </div>

      {/* ════════════════════════════ MODALS ════════════════════════════════════ */}

      {/* ── Add/Edit Item Modal ────────────────────────────────────────────────── */}
      {(modal === 'add-item' || modal === 'edit-item') && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                {modal === 'edit-item' ? <Edit2 className="w-5 h-5 text-blue-600" /> : <Plus className="w-5 h-5 text-blue-600" />}
                {modal === 'edit-item' ? t('admin.inventory.editItem') : t('admin.inventory.addNewItem')}
              </h2>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">{t('common.name')} *</label>
                <input type="text" value={itemForm.name} onChange={e => setItemForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" placeholder={t('placeholders.egFlour', 'e.g. Flour')} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">{t('common.category')} *</label>
                  <Dropdown value={itemForm.category} onChange={v => setItemForm(f => ({ ...f, category: v }))}
                    options={[{ value: '', label: t('common.select') }, ...allCategories.map(c => ({ value: c, label: c }))]} size="sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">{t('admin.inventory.unit')} *</label>
                  <Dropdown value={itemForm.unit} onChange={v => setItemForm(f => ({ ...f, unit: v }))}
                    options={UNITS} size="sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">{t('admin.inventory.lowStock')}</label>
                  <input type="number" value={itemForm.minStockLevel} onChange={e => setItemForm(f => ({ ...f, minStockLevel: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder={t('placeholders.number5', '5')} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">{t('admin.inventory.costPerUnit')}</label>
                  <input type="number" step="0.01" value={itemForm.costPerUnit} onChange={e => setItemForm(f => ({ ...f, costPerUnit: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder={t('placeholders.zero', '0')} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">{t('admin.inventory.suppliers')}</label>
                <Dropdown value={itemForm.supplierId} onChange={v => setItemForm(f => ({ ...f, supplierId: v }))}
                  options={[{ value: '', label: t('admin.inventory.noSupplier') }, ...suppliers.map(s => ({ value: s.id, label: s.name }))]} size="sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">{t('common.date')}</label>
                <DatePicker value={itemForm.expiryDate || ''} onChange={v => setItemForm(f => ({ ...f, expiryDate: v }))} size="sm" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setModal(null)} className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 font-medium text-sm">{t("common.cancel")}</button>
              <button onClick={modal === 'edit-item' ? handleEditItem : handleAddItem}
                className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-medium text-sm">
                {modal === 'edit-item' ? t('common.saveChanges') : t('admin.inventory.addNewItem')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Receive Goods Modal ───────────────────────────────────────────────── */}
      {modal === 'receive' && (() => {
        const selItem = items.find(i => String(i.id) === String(receiveForm.itemId));
        return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <ArrowDownToLine className="w-5 h-5 text-green-600" />{t('admin.inventory.goodsArrival')}
              </h2>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              {/* Item — read-only, shows which item was selected */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">{t('admin.inventory.item')}</label>
                <div className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 text-gray-800 font-medium">
                  {selItem ? `${selItem.name} (${fmtNum(selItem.quantityInStock)} ${selItem.unit})` : t('admin.inventory.noItemSelected')}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">{t('admin.inventory.quantity')} *</label>
                  <input type="number" min="0.1" step="0.1" value={receiveForm.quantity} onChange={e => setReceiveForm(f => ({ ...f, quantity: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder={t('placeholders.zero', '0')} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">{t('admin.inventory.pricePerUnit', { unit: selItem?.unit || t('admin.inventory.unit') })}</label>
                  <input type="number" step="0.01" value={receiveForm.costPerUnit} onChange={e => setReceiveForm(f => ({ ...f, costPerUnit: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder={t('placeholders.zero', '0')} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">{t('admin.inventory.reason')}</label>
                <div className="flex flex-wrap gap-2">
                  {IN_REASONS.map(r => (
                    <button key={r} onClick={() => setReceiveForm(f => ({ ...f, reason: r }))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${receiveForm.reason === r ? 'bg-green-100 text-green-800 border-green-300' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'}`}>
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">{t('admin.inventory.supplier')}</label>
                <Dropdown value={receiveForm.supplierId} onChange={v => setReceiveForm(f => ({ ...f, supplierId: v }))}
                  options={[{ value: '', label: t('admin.inventory.noSupplier') }, ...suppliers.map(s => ({ value: s.id, label: s.name }))]} size="sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">{t('admin.inventory.expiryDate')}</label>
                  <DatePicker value={receiveForm.expiryDate} onChange={v => setReceiveForm(f => ({ ...f, expiryDate: v }))} size="sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">{t('admin.inventory.deliveryDate')}</label>
                  <DatePicker value={receiveForm.deliveryDate} onChange={v => setReceiveForm(f => ({ ...f, deliveryDate: v }))} size="sm" />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setModal(null)} className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 font-medium text-sm">{t("common.cancel")}</button>
              <button onClick={handleReceive} className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-xl hover:bg-green-700 font-medium text-sm">{t('admin.inventory.receive')}</button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* ── Record Output Modal (unified) ───────────────────────────────────── */}
      {modal === 'output' && (() => {
        const selItem = items.find(i => String(i.id) === String(outputForm.itemId));
        const searchResults = outputForm.search
          ? items.filter(i => i.name.toLowerCase().includes(outputForm.search.toLowerCase()))
          : items;
        const reasons = getReasonsForType(outputForm.type);
        return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <ArrowUpFromLine className="w-5 h-5 text-orange-600" /> {t('admin.inventory.recordOutput')}
              </h2>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              {/* Item search */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">{t('admin.inventory.item')} *</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input type="text" value={outputForm.search} onChange={e => setOutputForm(f => ({ ...f, search: e.target.value }))}
                    className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={t('admin.inventory.searchItems')} />
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2 max-h-[120px] overflow-y-auto">
                  {searchResults.map(i => (
                    <button key={i.id} onClick={() => setOutputForm(f => ({ ...f, itemId: i.id, search: '' }))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${String(outputForm.itemId) === String(i.id) ? 'bg-blue-100 text-blue-800 border-blue-300' : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'}`}>
                      {i.name} <span className="text-gray-400 ml-1">({fmtNum(i.quantityInStock)} {i.unit})</span>
                    </button>
                  ))}
                </div>
              </div>
              {/* Quantity + Date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">{t('admin.inventory.quantity')} *</label>
                  <input type="number" min="0.1" step="0.1" value={outputForm.quantity} onChange={e => setOutputForm(f => ({ ...f, quantity: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="0" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">{t('common.date')}</label>
                  <DatePicker value={outputForm.date} onChange={v => setOutputForm(f => ({ ...f, date: v }))} placeholder={t('common.today')} size="sm" />
                </div>
              </div>
              {/* Type */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">{t('admin.inventory.type')} *</label>
                <div className="flex gap-2">
                  {getOutputTypes(t).map(ot => (
                    <button key={ot.value} onClick={() => setOutputForm(f => ({ ...f, type: ot.value, reason: getReasonsForType(ot.value)[0] }))}
                      className={`flex-1 px-3 py-2.5 rounded-xl text-xs font-semibold border-2 transition-colors text-center ${outputForm.type === ot.value ? ot.color + ' border-current' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'}`}>
                      {ot.label}
                    </button>
                  ))}
                </div>
              </div>
              {/* Reason */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">{t('admin.inventory.reason')} *</label>
                <div className="flex flex-wrap gap-2">
                  {reasons.map(r => (
                    <button key={r} onClick={() => setOutputForm(f => ({ ...f, reason: r }))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${outputForm.reason === r ? 'bg-blue-100 text-blue-800 border-blue-300' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'}`}>
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setModal(null)} className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 font-medium text-sm">{t("common.cancel")}</button>
              <button onClick={handleRecordOutput} className="flex-1 px-4 py-2.5 bg-orange-500 text-white rounded-xl hover:bg-orange-600 font-medium text-sm">{t('admin.inventory.recordOutput')}</button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* ── Add/Edit Supplier Modal ───────────────────────────────────────────── */}
      {modal === 'add-supplier' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-blue-600" />
                {supplierForm.id ? t('admin.inventory.editSupplier') : t('admin.inventory.addSupplier')}
              </h2>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">{t('admin.inventory.companyName')} *</label>
                <input type="text" value={supplierForm.name} onChange={e => setSupplierForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">{t('admin.inventory.contactPerson')}</label>
                <input type="text" value={supplierForm.contactName} onChange={e => setSupplierForm(f => ({ ...f, contactName: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <PhoneInput
                    label={t('common.phone') + ' *'}
                    value={supplierForm.phone}
                    onChange={phone => setSupplierForm(f => ({ ...f, phone }))}
                    size="md"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">{t('common.email')}</label>
                  <input type="email" value={supplierForm.email} onChange={e => setSupplierForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">{t('admin.inventory.address')}</label>
                <input type="text" value={supplierForm.address} onChange={e => setSupplierForm(f => ({ ...f, address: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Category</label>
                <div className="flex flex-wrap gap-2">
                  {['Food & Ingredients', 'Beverages', 'Cleaning', 'Packaging', 'Other'].map(cat => (
                    <button key={cat} onClick={() => setSupplierForm(f => ({ ...f, category: cat }))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${supplierForm.category === cat ? 'bg-blue-100 text-blue-800 border-blue-300' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'}`}>
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">{t('admin.inventory.paymentTerms')}</label>
                <input type="text" value={supplierForm.paymentTerms} onChange={e => setSupplierForm(f => ({ ...f, paymentTerms: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder={t('admin.inventory.paymentTermsPlaceholder')} />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setModal(null)} className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 font-medium text-sm">{t("common.cancel")}</button>
              <button onClick={handleSaveSupplier} className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-medium text-sm">
                {supplierForm.id ? t('admin.inventory.updateSupplier') : t('admin.inventory.addSupplier')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delivery Detail Modal ──────────────────────────────────────────────── */}
      {modal === 'delivery-detail' && delivDetail && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => { setModal(null); setDelivDetail(null); }}>
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="sticky top-0 bg-white rounded-t-2xl px-6 pt-5 pb-4 border-b border-gray-100 z-10">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2.5">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${['Delivered','Partial'].includes(delivDetail.status) ? 'bg-green-100' : 'bg-blue-100'}`}>
                      <Truck className={`w-5 h-5 ${['Delivered','Partial'].includes(delivDetail.status) ? 'text-green-600' : 'text-blue-600'}`} />
                    </div>
                    {delivDetail.supplierName}
                  </h2>
                  <div className="flex items-center gap-2 mt-1.5 ml-[46px]">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${DELIVERY_STATUS_COLORS[delivDetail.status] || 'bg-gray-100 text-gray-700'}`}>{delivDetail.status}</span>
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${delivDetail.paymentStatus === 'paid' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {delivDetail.paymentStatus === 'paid' ? t('common.paid') : t('common.unpaid')}
                    </span>
                    <span className="text-xs text-gray-500">{fmtDate(delivDetail.timestamp || delivDetail.createdAt)}</span>
                    <span className="text-sm font-bold text-gray-900">{money(delivDetail.total)}</span>
                  </div>
                </div>
                <button onClick={() => { setModal(null); setDelivDetail(null); }} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
              </div>
            </div>

            <div className="px-6 py-5 space-y-5">
              {/* Status Change Section */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">
                  <Truck className="w-3.5 h-3.5" /> {t('admin.inventory.changeStatus')}
                </label>
                <div className="flex flex-wrap gap-2">
                  {DELIVERY_STATUSES.map(s => (
                    <button key={s} onClick={() => setPendingStatusChange({ delivId: delivDetail.id, newStatus: s })}
                      disabled={s === delivDetail.status}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${s === delivDetail.status ? 'bg-blue-100 text-blue-700 border-blue-300 cursor-default' : pendingStatusChange?.newStatus === s ? 'bg-amber-100 text-amber-700 border-amber-400 ring-2 ring-amber-300' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 hover:border-gray-300'}`}>
                      {s}
                    </button>
                  ))}
                </div>
                {pendingStatusChange && (
                  <div className="mt-2 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                    <span className="text-xs text-amber-700 flex-1">{t('admin.inventory.changeTo')} <strong>{pendingStatusChange.newStatus}</strong>?</span>
                    <button onClick={() => { handleChangeDeliveryStatus(pendingStatusChange.delivId, pendingStatusChange.newStatus); setPendingStatusChange(null); }}
                      className="px-3 py-1 rounded-lg bg-green-600 text-white text-xs font-semibold hover:bg-green-700">{t('common.confirm')}</button>
                    <button onClick={() => setPendingStatusChange(null)}
                      className="px-3 py-1 rounded-lg bg-gray-200 text-gray-600 text-xs font-semibold hover:bg-gray-300">{t("common.cancel")}</button>
                  </div>
                )}
              </div>

              {/* Notes */}
              {delivDetail.notes && (
                <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                  <span className="text-xs font-semibold text-gray-500">{t('admin.inventory.deliveryDetailNotes')}:</span>
                  <p className="text-sm text-gray-700 mt-0.5">{delivDetail.notes}</p>
                </div>
              )}

              {/* Line Items */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">
                  <Package className="w-3.5 h-3.5" /> {t('admin.inventory.deliveryItems')}
                </label>
                {delivDetailLoading ? (
                  <div className="text-center py-6 text-gray-400 text-sm">{t('admin.inventory.loadingItems')}</div>
                ) : delivDetail.items && delivDetail.items.length > 0 ? (
                  <div className="space-y-2">
                    {delivDetail.items.map(item => {
                      const isInTransit = ['Ordered', 'In Transit'].includes(delivDetail.status);
                      return (
                        <div key={item.id} className={`flex items-center gap-3 p-3 rounded-xl border ${item.removed ? 'bg-red-50/50 border-red-200 opacity-60' : 'bg-gray-50 border-gray-100'}`}>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`text-sm font-semibold ${item.removed ? 'line-through text-red-400' : 'text-gray-900'}`}>{item.itemName}</span>
                              {item.removed && <span className="text-xs text-red-500 font-medium">{t('admin.inventory.remove')}{item.removeReason ? `: ${item.removeReason}` : ''}</span>}
                            </div>
                            <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                              <span>{item.qty} {item.unit}</span>
                              {item.unitPrice > 0 && <span>{money(item.unitPrice)}/unit</span>}
                              {item.expiryDate && <span>{t('admin.inventory.expiry')}: {fmtDate(item.expiryDate)}</span>}
                              <span className="font-semibold text-gray-700">{money(toNum(item.qty) * toNum(item.unitPrice))}</span>
                            </div>
                          </div>
                          {isInTransit && !item.removed && (
                            <div className="flex gap-1.5">
                              <button onClick={() => {
                                const newQty = prompt(`Adjust quantity for ${item.itemName} (current: ${item.qty}):`, item.qty);
                                if (newQty !== null && !isNaN(parseFloat(newQty)) && parseFloat(newQty) >= 0) {
                                  handleUpdateDeliveryItemQty(item.id, parseFloat(newQty));
                                }
                              }} className="px-2 py-1 bg-amber-50 text-amber-700 rounded-lg text-xs font-medium hover:bg-amber-100 border border-amber-200">
                                {t('admin.inventory.adjustQty')}
                              </button>
                              <button onClick={() => {
                                const reason = prompt(`Reason for removing ${item.itemName}? (e.g., Damaged, Wrong item)`);
                                if (reason !== null) handleRemoveDeliveryItem(item.id, reason);
                              }} className="px-2 py-1 bg-red-50 text-red-700 rounded-lg text-xs font-medium hover:bg-red-100 border border-red-200">
                                {t('admin.inventory.remove')}
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-6 text-gray-400 text-sm border border-dashed border-gray-200 rounded-xl">{t('admin.inventory.noItemsRecorded')}</div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-white rounded-b-2xl px-6 py-4 border-t border-gray-100 flex gap-3">
              {delivDetail.paymentStatus !== 'paid' && ['Delivered', 'Partial'].includes(delivDetail.status) && (
                <button onClick={() => { setModal(null); openPayDelivery(delivDetail); }}
                  className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-xl hover:bg-green-700 font-medium text-sm shadow-sm flex items-center justify-center gap-2">
                  <DollarSign className="w-4 h-4" /> {t('admin.inventory.markPaid')}
                </button>
              )}
              <button onClick={() => {
                setDialog({ title: t('admin.inventory.deleteDelivery'), message: t('admin.inventory.deleteDeliveryConfirm', { supplier: delivDetail.supplierName }), type: 'danger', confirmLabel: t('common.delete'),
                  onConfirm: () => { setDialog(null); setModal(null); setDelivDetail(null); handleDeleteDelivery(delivDetail.id); }
                });
              }} className="flex-1 px-4 py-2.5 border border-red-200 text-red-700 rounded-xl hover:bg-red-50 font-medium text-sm flex items-center justify-center gap-2">
                <Trash2 className="w-4 h-4" /> {t('common.delete')}
              </button>
              <button onClick={() => { setModal(null); setDelivDetail(null); }}
                className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 font-medium text-sm">{t('common.close')}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Record Delivery Modal ─────────────────────────────────────────────── */}
      {modal === 'delivery' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="sticky top-0 bg-white rounded-t-2xl px-6 pt-5 pb-4 border-b border-gray-100 z-10">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2.5">
                  <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center">
                    <Truck className="w-5 h-5 text-blue-600" />
                  </div>
                  {t('admin.inventory.recordDelivery')}
                </h2>
                <button onClick={() => setModal(null)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"><X className="w-5 h-5" /></button>
              </div>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Row 1: Supplier + Status */}
              <div className="grid grid-cols-[1fr_140px] gap-4">
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 mb-1.5">
                    <ShoppingCart className="w-3.5 h-3.5" /> {t('admin.inventory.supplier')} *
                  </label>
                  <Dropdown value={delivForm.supplierId} onChange={v => {
                    const s = suppliers.find(s => String(s.id) === String(v));
                    setDelivForm(f => ({ ...f, supplierId: v, supplierName: s?.name || f.supplierName }));
                  }} options={[{ value: '', label: t('admin.inventory.selectSupplier') }, ...suppliers.map(s => ({ value: s.id, label: s.name }))]} size="sm" />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 mb-1.5">
                    <Truck className="w-3.5 h-3.5" /> {t('common.status')}
                  </label>
                  <Dropdown value={delivForm.status} onChange={v => setDelivForm(f => ({ ...f, status: v }))}
                    options={DELIVERY_STATUSES} size="sm" />
                </div>
              </div>

              {/* Row 2: Payment + Due Date + Notes */}
              <div className={`grid gap-4 ${delivForm.paymentStatus === 'unpaid' ? 'grid-cols-3' : 'grid-cols-2'}`}>
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 mb-1.5">
                    <DollarSign className="w-3.5 h-3.5" /> {t('admin.inventory.payment')}
                  </label>
                  <div className="flex gap-1.5">
                    <button onClick={() => setDelivForm(f => ({ ...f, paymentStatus: 'unpaid' }))}
                      className={`flex-1 flex items-center justify-center gap-1 px-2 py-2 rounded-xl text-xs font-semibold border transition-colors ${delivForm.paymentStatus === 'unpaid' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}>
                      <Clock className="w-3 h-3" /> {t('common.unpaid')}
                    </button>
                    <button onClick={() => setDelivForm(f => ({ ...f, paymentStatus: 'paid' }))}
                      className={`flex-1 flex items-center justify-center gap-1 px-2 py-2 rounded-xl text-xs font-semibold border transition-colors ${delivForm.paymentStatus === 'paid' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}>
                      <CheckCircle className="w-3 h-3" /> {t('common.paid')}
                    </button>
                  </div>
                </div>
                {delivForm.paymentStatus === 'unpaid' && (
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 mb-1.5">
                      <Calendar className="w-3.5 h-3.5" /> {t('admin.inventory.dueDate')}
                    </label>
                    <DatePicker value={delivForm.paymentDueDate} onChange={v => setDelivForm(f => ({ ...f, paymentDueDate: v }))} placeholder={t('placeholders.setDueDate', 'Set due date')} size="sm" />
                  </div>
                )}
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 mb-1.5">
                    <ClipboardList className="w-3.5 h-3.5" /> {t('admin.inventory.deliveryDetailNotes')}
                  </label>
                  <input type="text" value={delivForm.notes} onChange={e => setDelivForm(f => ({ ...f, notes: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder={t('placeholders.optionalNotes', 'Optional notes...')} />
                </div>
              </div>

              {/* Line Items */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    <Package className="w-3.5 h-3.5" /> {t('admin.inventory.deliveryItems')}
                  </label>
                  <button onClick={addDelivLine} className="flex items-center gap-1 text-xs text-blue-600 font-semibold hover:text-blue-700 px-2.5 py-1 rounded-lg hover:bg-blue-50 transition-colors">
                    <Plus className="w-3.5 h-3.5" /> {t('admin.inventory.addItem')}
                  </button>
                </div>

                {/* Column headers */}
                <div className="grid grid-cols-[1fr_70px_80px_110px_130px_28px] gap-2 mb-1.5 px-1">
                  <span className="text-[10px] font-semibold text-gray-400 uppercase">{t('common.name')}</span>
                  <span className="text-[10px] font-semibold text-gray-400 uppercase">{t('admin.inventory.qty')}</span>
                  <span className="text-[10px] font-semibold text-gray-400 uppercase">{t('admin.inventory.unit')}</span>
                  <span className="text-[10px] font-semibold text-gray-400 uppercase">{t('admin.inventory.price')}</span>
                  <span className="text-[10px] font-semibold text-gray-400 uppercase">{t('admin.inventory.expiry')}</span>
                  <span></span>
                </div>

                <div className="space-y-2">
                  {delivForm.items.map((line, idx) => (
                    <div key={idx} className="grid grid-cols-[1fr_70px_80px_110px_130px_28px] gap-2 items-center bg-gray-50 rounded-xl p-2 border border-gray-100">
                      {/* Item name with autocomplete */}
                      <div className="relative">
                        <input type="text" placeholder={t('placeholders.itemName', 'Item name')} value={line.itemName}
                          onChange={e => updateDelivLine(idx, 'itemName', e.target.value)}
                          onFocus={() => updateDelivLine(idx, '_focused', true)}
                          onBlur={() => setTimeout(() => updateDelivLine(idx, '_focused', false), 150)}
                          className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
                        {line._focused && line.itemName && (() => {
                          const q = line.itemName.toLowerCase();
                          const matches = items.filter(it => it.name && it.name.toLowerCase().includes(q) && it.name.toLowerCase() !== q);
                          return matches.length > 0 ? (
                            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-32 overflow-y-auto">
                              {matches.slice(0, 5).map(it => (
                                <button key={it.id} type="button"
                                  onMouseDown={(e) => { e.preventDefault(); updateDelivLine(idx, 'itemName', it.name); updateDelivLine(idx, '_focused', false); if (it.unit) updateDelivLine(idx, 'unit', it.unit); if (it.costPerUnit) updateDelivLine(idx, 'unitPrice', it.costPerUnit); }}
                                  className="w-full px-3 py-2 text-left text-sm hover:bg-blue-50 flex items-center gap-2 border-b border-gray-50 last:border-0">
                                  <Package className="w-3 h-3 text-gray-400" />
                                  <span className="font-medium text-gray-800">{it.name}</span>
                                  {it.unit && <span className="text-xs text-gray-400 ml-auto">{it.unit}</span>}
                                </button>
                              ))}
                            </div>
                          ) : null;
                        })()}
                      </div>
                      <input type="number" placeholder={t('placeholders.qty', 'Qty')} value={line.qty} onChange={e => updateDelivLine(idx, 'qty', e.target.value)}
                        className="px-2 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
                      <Dropdown value={line.unit} onChange={v => updateDelivLine(idx, 'unit', v)}
                        options={UNITS} size="sm" />
                      <input type="number" placeholder={t('placeholders.price', 'Price')} value={line.unitPrice} onChange={e => updateDelivLine(idx, 'unitPrice', e.target.value)}
                        className="px-2 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
                      <DatePicker value={line.expiryDate} onChange={v => updateDelivLine(idx, 'expiryDate', v)} placeholder={t('placeholders.expiry', 'Expiry')} size="sm" />
                      {delivForm.items.length > 1 ? (
                        <button onClick={() => removeDelivLine(idx)} className="w-7 h-7 flex items-center justify-center rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors">
                          <X className="w-4 h-4" />
                        </button>
                      ) : <div className="w-7" />}
                    </div>
                  ))}
                </div>

                {/* Total */}
                <div className="mt-3 flex items-center justify-end gap-3 px-2">
                  <span className="text-xs font-semibold text-gray-500 uppercase">{t('common.total')}</span>
                  <span className="text-base font-bold text-gray-900">
                    {money(delivForm.items.reduce((s, l) => s + toNum(l.qty) * toNum(l.unitPrice), 0))}
                  </span>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-white rounded-b-2xl px-6 py-4 border-t border-gray-100 flex gap-3">
              <button onClick={() => setModal(null)} className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 font-medium text-sm transition-colors">{t("common.cancel")}</button>
              <button onClick={handleCreateDelivery} className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-medium text-sm shadow-sm transition-colors flex items-center justify-center gap-2">
                <CheckCircle className="w-4 h-4" /> {t('admin.inventory.saveDelivery')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Pay Delivery Modal ──────────────────────────────────────────────── */}
      {modal === 'pay-delivery' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            {paymentForm.step === 'form' ? (
              <>
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-green-600" /> {t('admin.inventory.recordPayment')}
                  </h2>
                  <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                </div>
                <div className="bg-gray-50 rounded-xl p-4 mb-4 border border-gray-200">
                  <p className="text-sm text-gray-500">{t('admin.inventory.supplier')}</p>
                  <p className="text-base font-bold text-gray-900">{paymentForm.supplierName}</p>
                  <p className="text-sm text-gray-500 mt-1">{t('common.total')}</p>
                  <p className="text-xl font-bold text-green-700">{money(paymentForm.amount)}</p>
                  {paymentForm.bulk && <p className="text-xs text-gray-500 mt-1">{paymentForm.deliveries?.length} {t('admin.inventory.deliveries')}</p>}
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t('admin.inventory.paymentMethod')} *</label>
                    <div className="flex flex-wrap gap-2">
                      {PAYMENT_METHODS.map(m => (
                        <button key={m} onClick={() => setPaymentForm(f => ({ ...f, method: m }))}
                          className={`px-3 py-2 rounded-xl text-sm font-medium border transition-colors ${paymentForm.method === m ? 'bg-green-50 text-green-700 border-green-300' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t('admin.inventory.paymentDate')} *</label>
                    <DatePicker value={paymentForm.date} onChange={v => setPaymentForm(f => ({ ...f, date: v }))} size="sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t('admin.inventory.invoiceCheque')}</label>
                    <input type="text" value={paymentForm.note} onChange={e => setPaymentForm(f => ({ ...f, note: e.target.value }))}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      placeholder={t('admin.inventory.invoicePlaceholder')} />
                  </div>
                </div>
                <div className="flex gap-3 mt-5">
                  <button onClick={() => setModal(null)} className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 font-medium text-sm">{t("common.cancel")}</button>
                  <button onClick={() => setPaymentForm(f => ({ ...f, step: 'confirm' }))}
                    className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-xl hover:bg-green-700 font-medium text-sm">
                    {t('admin.inventory.continue')}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="text-center mb-5">
                  <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                    <DollarSign className="w-7 h-7 text-green-600" />
                  </div>
                  <h2 className="text-lg font-bold text-gray-900">{t('admin.inventory.confirmPayment')}</h2>
                  <p className="text-sm text-gray-500 mt-1">{t('admin.inventory.confirmPaymentQuestion')}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-4 mb-4 border border-gray-200 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">{t('admin.inventory.supplier')}</span>
                    <span className="font-semibold text-gray-900">{paymentForm.supplierName}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">{t('common.total')}</span>
                    <span className="font-bold text-green-700">{money(paymentForm.amount)}</span>
                  </div>
                  {paymentForm.bulk && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">{t('admin.inventory.deliveries')}</span>
                      <span className="font-semibold text-gray-900">{paymentForm.deliveries?.length}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">{t('admin.inventory.paymentMethod')}</span>
                    <span className="font-semibold text-gray-900">{paymentForm.method}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">{t('common.date')}</span>
                    <span className="font-semibold text-gray-900">{paymentForm.date}</span>
                  </div>
                  {paymentForm.note && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">{t('admin.inventory.invoiceCheque')}</span>
                      <span className="font-semibold text-gray-900">{paymentForm.note}</span>
                    </div>
                  )}
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setPaymentForm(f => ({ ...f, step: 'form' }))}
                    className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 font-medium text-sm">
                    {t('admin.inventory.noGoBack')}
                  </button>
                  <button onClick={handlePayDelivery}
                    className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-xl hover:bg-green-700 font-medium text-sm">
                    {t('admin.inventory.yesPaymentMade')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Manage Categories Modal ──────────────────────────────────────────── */}
      {modal === 'manage-categories' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Filter className="w-5 h-5 text-blue-600" /> {t('admin.inventory.manageCategories')}
              </h2>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>

            {/* Add new category */}
            <div className="mb-5">
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t('admin.inventory.addCategory')}</label>
              <div className="flex gap-2">
                <input type="text" value={newCatName} onChange={e => setNewCatName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addCategory(); }}
                  placeholder={t('placeholders.egCategory', 'e.g. Spices, Dairy...')}
                  className="flex-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <button onClick={addCategory}
                  className="px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-semibold text-sm transition-colors">
                  {t('common.add')}
                </button>
              </div>
            </div>

            {/* Current categories list */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-2">{t('admin.inventory.allCategories')}</label>
              {allCategories.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">{t('common.noResults')}</p>
              ) : (
                <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                  {allCategories.map(cat => {
                    const count = items.filter(i => i.category === cat).length;
                    return (
                      <div key={cat} className="flex items-center gap-3 px-3 py-2.5 bg-gray-50 rounded-xl group hover:bg-gray-100 transition-colors">
                        <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm shrink-0">
                          {cat[0]?.toUpperCase()}
                        </div>
                        <span className="flex-1 text-sm font-medium text-gray-900">{cat}</span>
                        <span className="text-xs text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full font-medium">
                          {count} item{count !== 1 ? 's' : ''}
                        </span>
                        <button onClick={() => removeCategory(cat)}
                          className="text-xs font-semibold text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded-lg transition-colors opacity-0 group-hover:opacity-100">
                          {t('admin.inventory.removeCategory')}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              {allCategories.length > 0 && (
                <p className="text-xs text-gray-400 mt-3">Items must be reassigned before a category can be removed.</p>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog dialog={dialog} onClose={() => setDialog(null)} />

      {/* ── Toast ─────────────────────────────────────────────────────────────── */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[60] flex items-center gap-2 bg-gray-900 text-white px-5 py-3 rounded-xl shadow-lg text-sm font-medium animate-[fadeIn_0.2s_ease-in]">
          <CheckCircle className="w-4 h-4 text-green-400" />
          {toast}
        </div>
      )}
    </div>
  );
}

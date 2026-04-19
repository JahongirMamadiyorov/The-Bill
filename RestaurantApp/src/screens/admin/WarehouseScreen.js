/**
 * WarehouseScreen.js  —  Full Inventory Management for Admin
 *
 * New in this version:
 *  1. Date Range Picker on Deliveries + Stock Output tabs
 *  2. Auto Kitchen Output — watches orders, deducts ingredients from recipes
 *  3. Kitchen Usage Analytics — tappable drill-down with bar charts & breakdowns
 *  4. Seed data: 5 recipes, 10 simulated kitchen outputs
 *
 * Tabs: Inventory | Deliveries | Stock Output | Suppliers
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, FlatList, TouchableOpacity, TextInput,
  StyleSheet, Modal, ActivityIndicator, KeyboardAvoidingView,
  Platform, RefreshControl, Animated, StatusBar, Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { warehouseAPI, suppliersAPI, procurementAPI } from '../../api/client';
import { colors, spacing, radius, shadow, typography, topInset } from '../../utils/theme';
import ConfirmDialog from '../../components/ConfirmDialog';
import { useTranslation } from '../../context/LanguageContext';

// ─── NEW COLOR PALETTE ────────────────────────────────────────────────────────
const C = {
  primary:      '#2563EB',
  primaryLight: '#EFF6FF',
  success:      '#16A34A',
  successLight: '#F0FDF4',
  warning:      '#D97706',
  warningLight: '#FFFBEB',
  danger:       '#DC2626',
  dangerLight:  '#FEF2F2',
  neutralDark:  '#111827',
  neutralMid:   '#6B7280',
  neutralLight: '#F9FAFB',
  card:         '#FFFFFF',
  border:       '#E5E7EB',
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const toNum  = (v) => parseFloat(v) || 0;
const fmtNum = (v) => parseFloat(v).toFixed(1);
const money  = (v) => new Intl.NumberFormat('uz-UZ').format(Math.round(toNum(v))) + " so'm";
// Uses LOCAL date (not UTC) so stored dates always match the device's calendar day.
// Using .toISOString() would return the UTC date, which can be one day off in UTC+ timezones
// and cause deliveries to fall outside "Today" / "This Month" filters.
const todayStr = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// Format delivery dates — handles raw ISO timestamps like "2026-03-12T19:00:00.000Z"
// and plain date strings like "2026-03-12", always returning LOCAL "YYYY-MM-DD"
function fmtDelivDate(str) {
  if (!str) return '';
  const d = new Date(str);
  if (isNaN(d.getTime())) return str;
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  return Math.floor((new Date(dateStr) - Date.now()) / 86400000);
}
function stockStatus(item) {
  const qty = toNum(item.quantity_in_stock);
  const min = toNum(item.min_stock_level ?? item.low_stock_alert ?? item.min_quantity ?? 0);
  if (qty <= 0) return 'critical';
  if (qty <= min) return 'low';
  return 'ok';
}
function parseDate(str) {
  if (!str) return null;
  // YYYY-MM-DD strings are parsed as UTC midnight by default, which shifts
  // the date backwards in UTC+ timezones and breaks "Today" filtering.
  // Parse date-only strings as LOCAL midnight instead.
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [y, mo, day] = str.split('-').map(Number);
    return new Date(y, mo - 1, day);
  }
  const d = new Date(str);
  return isNaN(d) ? null : d;
}
function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const STATUS_COLOR = { ok: '#22c55e', low: '#f59e0b', critical: '#ef4444' };
const STATUS_BG    = { ok: '#dcfce7', low: '#fef9c3', critical: '#fee2e2' };
const INV_CAT_PALETTE = [
  { bg: '#fff7ed', text: '#c2410c' },
  { bg: '#eff6ff', text: '#1d4ed8' },
  { bg: '#f5f3ff', text: '#6d28d9' },
  { bg: '#f0fdfa', text: '#0f766e' },
  { bg: '#fef9c3', text: '#a16207' },
  { bg: '#fce7f3', text: '#be185d' },
  { bg: '#dcfce7', text: '#15803d' },
  { bg: '#f8fafc', text: '#475569' },
];
function invCatColor(catName, categories) {
  const idx = categories ? categories.indexOf(catName) : -1;
  if (idx === -1) return INV_CAT_PALETTE[INV_CAT_PALETTE.length - 1];
  return INV_CAT_PALETTE[idx % INV_CAT_PALETTE.length];
}
const REASON_COLORS = {
  'Kitchen Use': { bg: '#eff6ff', text: '#1d4ed8' },
  'Waste':       { bg: '#fee2e2', text: '#dc2626' },
  'Spoilage':    { bg: '#fff7ed', text: '#c2410c' },
  'Transfer':    { bg: '#f5f3ff', text: '#7c3aed' },
  'Auto':        { bg: '#dcfce7', text: '#15803d' },
  'Expired':     { bg: '#fee2e2', text: '#dc2626' },
  'Cleaning':    { bg: '#f0fdf4', text: '#166534' },
  'Breakage':    { bg: '#fef3c7', text: '#92400e' },
  'Staff Meal':  { bg: '#ede9fe', text: '#5b21b6' },
  'Sample':      { bg: '#e0f2fe', text: '#0369a1' },
  'Broken':      { bg: '#fef3c7', text: '#92400e' },
  'Damaged':     { bg: '#fef3c7', text: '#92400e' },
  'Spillage':    { bg: '#fff7ed', text: '#c2410c' },
  'Overcount':   { bg: '#e0e7ff', text: '#4338ca' },
  'Undercount':  { bg: '#e0e7ff', text: '#4338ca' },
  'Theft':       { bg: '#fee2e2', text: '#991b1b' },
};
const TYPE_COLORS = {
  'OUT':       { bg: '#fee2e2', text: '#dc2626' },
  'WASTE':     { bg: '#fef3c7', text: '#b45309' },
  'ADJUST':    { bg: '#e0e7ff', text: '#4338ca' },
  'SHRINKAGE': { bg: '#fce7f3', text: '#be185d' },
};

const DELIVERY_STATUSES = ['Ordered', 'In Transit', 'Partial', 'Delivered', 'Cancelled'];
const DELIVERY_STATUS_COLORS = {
  'Ordered':    { bg: '#f5f3ff', text: '#6d28d9' },
  'In Transit': { bg: '#eff6ff', text: '#1d4ed8' },
  'Partial':    { bg: '#fff7ed', text: '#c2410c' },
  'Delivered':  { bg: '#dcfce7', text: '#15803d' },
  'Cancelled':  { bg: '#fee2e2', text: '#dc2626' },
};

const INV_CAT_KEY           = '@the_bill_inv_categories';
const DELIVERY_STORAGE_KEY  = '@the_bill_delivery_history';
const DEFAULT_INV_CATEGORIES = ['Food & Ingredients', 'Beverages', 'Cleaning', 'Packaging', 'Other'];
const UNITS         = ['kg', 'g', 'liter', 'ml', 'piece', 'portion', 'box', 'bottle', 'pack', 'bag', 'tray'];
const DELIVERY_UNITS = UNITS; // same list, referenced separately for clarity
const OUTPUT_REASONS = ['Kitchen Use', 'Waste', 'Spoilage', 'Expired', 'Transfer', 'Cleaning', 'Breakage', 'Staff Meal', 'Sample'];
const RECEIVE_REASONS = ['Purchase', 'Supplier Delivery', 'Transfer', 'Return', 'Donation', 'Correction'];
const ADJUST_REASONS = ['Expired', 'Broken', 'Damaged', 'Spillage', 'Audit Correction', 'Theft', 'Quality Issue', 'Overcount', 'Undercount'];

// ─── TRANSLATION HELPERS ──────────────────────────────────────────────────────
// Map internal string IDs to translation keys so UI labels are localised while
// internal logic (filters, state, API payloads) keeps using the English IDs.
const DELIVERY_STATUS_I18N = {
  'Ordered':    'warehouse.deliveryStatus.ordered',
  'In Transit': 'warehouse.deliveryStatus.inTransit',
  'Partial':    'warehouse.deliveryStatus.partial',
  'Delivered':  'warehouse.deliveryStatus.delivered',
  'Cancelled':  'warehouse.deliveryStatus.cancelled',
};
function deliveryStatusLabel(status, t) {
  const key = DELIVERY_STATUS_I18N[status];
  return key ? t(key, status) : status;
}

const INV_CAT_I18N = {
  'Food & Ingredients': 'warehouse.categoriesNamed.foodIngredients',
  'Beverages':          'warehouse.categoriesNamed.beverages',
  'Cleaning':           'warehouse.categoriesNamed.cleaning',
  'Packaging':          'warehouse.categoriesNamed.packaging',
  'Other':              'warehouse.categoriesNamed.other',
};
function invCategoryLabel(cat, t) {
  const key = INV_CAT_I18N[cat];
  return key ? t(key, cat) : cat;
}

const OUTPUT_REASON_I18N = {
  'Kitchen Use': 'warehouse.outputReasons.kitchenUse',
  'Waste':       'warehouse.outputReasons.waste',
  'Spoilage':    'warehouse.outputReasons.spoilage',
  'Expired':     'warehouse.outputReasons.expired',
  'Transfer':    'warehouse.outputReasons.transfer',
  'Cleaning':    'warehouse.outputReasons.cleaning',
  'Breakage':    'warehouse.outputReasons.breakage',
  'Staff Meal':  'warehouse.outputReasons.staffMeal',
  'Sample':      'warehouse.outputReasons.sample',
};
function outputReasonLabel(reason, t) {
  const key = OUTPUT_REASON_I18N[reason];
  return key ? t(key, reason) : reason;
}

const PAY_METHOD_I18N = {
  'Cash':           'warehouse.paymentMethodsList.cash',
  'Bank Transfer':  'warehouse.paymentMethodsList.bankTransfer',
  'Card':           'warehouse.paymentMethodsList.card',
  'Mobile Payment': 'warehouse.paymentMethodsList.mobilePayment',
  'Check':          'warehouse.paymentMethodsList.check',
  'Other':          'warehouse.paymentMethodsList.other',
};
function payMethodLabel(method, t) {
  const key = PAY_METHOD_I18N[method];
  return key ? t(key, method) : method;
}

// ─── SEED DATA ────────────────────────────────────────────────────────────────
// Recipes: menuItemName → [ { ingredientName, qty, unit } ]
const SEED_RECIPES = {
  'Burger':     [{ ing: 'Beef Patty',  qty: 0.2, unit: 'kg' }, { ing: 'Burger Bun', qty: 1, unit: 'piece' }, { ing: 'Sauce',      qty: 0.02, unit: 'kg' }],
  'Pizza':      [{ ing: 'Flour',       qty: 0.3, unit: 'kg' }, { ing: 'Tomato',     qty: 0.15, unit: 'kg' }, { ing: 'Cheese',     qty: 0.1, unit: 'kg'  }, { ing: 'Olive Oil', qty: 0.02, unit: 'liter' }],
  'Caesar Salad':[{ ing: 'Lettuce',   qty: 0.2, unit: 'kg' }, { ing: 'Sauce',      qty: 0.03, unit: 'kg' }, { ing: 'Cheese',     qty: 0.05, unit: 'kg' }],
  'Green Tea':  [{ ing: 'Tea Leaves',  qty: 0.005, unit: 'kg' }],
  'Fresh Juice':[{ ing: 'Orange',      qty: 0.4, unit: 'kg' }, { ing: 'Sugar',      qty: 0.02, unit: 'kg' }],
};

// Simulated past kitchen output entries (last 30 days)
function makeSeedOutputs() {
  const now = Date.now();
  const day = 86400000;
  return [
    { id: 'seed-1',  itemName: 'Beef Patty',  qty: 2.4,  reason: 'Kitchen Use', date: isoDate(new Date(now - 1*day)), note: 'Auto: Order #42 — 12x Burger',     isAuto: true, menuItem: 'Burger',      orderRef: 42  },
    { id: 'seed-2',  itemName: 'Burger Bun',  qty: 12,   reason: 'Kitchen Use', date: isoDate(new Date(now - 1*day)), note: 'Auto: Order #42 — 12x Burger',     isAuto: true, menuItem: 'Burger',      orderRef: 42  },
    { id: 'seed-3',  itemName: 'Flour',        qty: 1.5,  reason: 'Kitchen Use', date: isoDate(new Date(now - 2*day)), note: 'Auto: Order #38 — 5x Pizza',       isAuto: true, menuItem: 'Pizza',       orderRef: 38  },
    { id: 'seed-4',  itemName: 'Cheese',       qty: 0.8,  reason: 'Kitchen Use', date: isoDate(new Date(now - 2*day)), note: 'Auto: Order #38 — 5x Pizza + 3x Caesar Salad', isAuto: true, menuItem: 'Pizza', orderRef: 38  },
    { id: 'seed-5',  itemName: 'Lettuce',      qty: 0.6,  reason: 'Kitchen Use', date: isoDate(new Date(now - 3*day)), note: 'Auto: Order #35 — 3x Caesar Salad', isAuto: true, menuItem: 'Caesar Salad', orderRef: 35 },
    { id: 'seed-6',  itemName: 'Tea Leaves',   qty: 0.05, reason: 'Kitchen Use', date: isoDate(new Date(now - 4*day)), note: 'Auto: Order #31 — 10x Green Tea',   isAuto: true, menuItem: 'Green Tea',   orderRef: 31  },
    { id: 'seed-7',  itemName: 'Orange',        qty: 2.0,  reason: 'Kitchen Use', date: isoDate(new Date(now - 5*day)), note: 'Auto: Order #28 — 5x Fresh Juice',  isAuto: true, menuItem: 'Fresh Juice', orderRef: 28  },
    { id: 'seed-8',  itemName: 'Beef Patty',   qty: 1.6,  reason: 'Kitchen Use', date: isoDate(new Date(now - 7*day)), note: 'Auto: Order #21 — 8x Burger',      isAuto: true, menuItem: 'Burger',      orderRef: 21  },
    { id: 'seed-9',  itemName: 'Tomato',        qty: 0.9,  reason: 'Kitchen Use', date: isoDate(new Date(now - 10*day)), note: 'Auto: Order #15 — 6x Pizza',     isAuto: true, menuItem: 'Pizza',       orderRef: 15  },
    { id: 'seed-10', itemName: 'Sauce',         qty: 0.3,  reason: 'Kitchen Use', date: isoDate(new Date(now - 12*day)), note: 'Auto: Order #12 — 10x Burger',   isAuto: true, menuItem: 'Burger',      orderRef: 12  },
  ];
}

// ─── DATE RANGE HELPERS ───────────────────────────────────────────────────────
const DATE_RANGES = ['Today', 'Last 7 Days', 'Last 30 Days', 'This Month', 'Last Month', 'Custom'];

function getDateRange(label, customFrom, customTo) {
  const now  = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (label) {
    case 'Today':
      return { from: today, to: new Date(today.getTime() + 86399999) };
    case 'Last 7 Days':
      return { from: new Date(today.getTime() - 6 * 86400000), to: new Date(today.getTime() + 86399999) };
    case 'Last 30 Days':
      return { from: new Date(today.getTime() - 29 * 86400000), to: new Date(today.getTime() + 86399999) };
    case 'This Month':
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59) };
    case 'Last Month': {
      const m = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
      const y = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
      return { from: new Date(y, m, 1), to: new Date(y, m + 1, 0, 23, 59, 59) };
    }
    case 'Custom': {
      const from = parseDate(customFrom);
      const to   = parseDate(customTo);
      return {
        from: from || today,
        to:   to   ? new Date(to.getTime() + 86399999) : new Date(today.getTime() + 86399999),
      };
    }
    default:
      return { from: new Date(today.getTime() - 29 * 86400000), to: new Date(today.getTime() + 86399999) };
  }
}

function inRange(dateStr, from, to) {
  const d = parseDate(dateStr);
  if (!d) return false;
  return d >= from && d <= to;
}

// ─── RANGE CALENDAR PICKER MODAL ─────────────────────────────────────────────
const WH_MONTHS  = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const WH_DAY_HDR = ['Mo','Tu','We','Th','Fr','Sa','Su'];
// Compute fresh each time (not stale module-level constants)
function getWhToday() { return new Date(); }
function getWhTodayStr() { return isoDate(new Date()); }
function whFmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function whGetMonday(d) {
  const date = new Date(d); date.setDate(date.getDate() - (date.getDay() + 6) % 7); return date;
}

function RangePickerModal({ visible, onClose, from, to, onChange }) {
  const { t } = useTranslation();
  const wh_today    = getWhToday();
  const wh_todayStr = getWhTodayStr();
  const [viewYear,  setViewYear]  = useState(wh_today.getFullYear());
  const [viewMonth, setViewMonth] = useState(wh_today.getMonth());
  const [tempFrom,  setTempFrom]  = useState(from || wh_todayStr);
  const [tempTo,    setTempTo]    = useState(to   || wh_todayStr);
  const [step,      setStep]      = useState('from');

  useEffect(() => {
    if (visible) {
      const todayS = getWhTodayStr();
      setTempFrom(from || todayS);
      setTempTo(to     || todayS);
      setStep('from');
      const d = new Date((from || todayS) + 'T00:00:00');
      setViewYear(d.getFullYear()); setViewMonth(d.getMonth());
    }
  }, [visible]);

  const prevMonth = () => { if (viewMonth===0){setViewMonth(11);setViewYear(y=>y-1);}else setViewMonth(m=>m-1); };
  const nextMonth = () => { if (viewMonth===11){setViewMonth(0);setViewYear(y=>y+1);}else setViewMonth(m=>m+1); };

  const handleDay = (ds) => {
    if (step === 'from') { setTempFrom(ds); setTempTo(ds); setStep('to'); }
    else {
      if (ds < tempFrom) { setTempTo(tempFrom); setTempFrom(ds); }
      else setTempTo(ds);
      setStep('from');
    }
  };

  const setPreset = (f, t) => {
    setTempFrom(f); setTempTo(t); setStep('from');
    const d = new Date(f + 'T00:00:00');
    setViewYear(d.getFullYear()); setViewMonth(d.getMonth());
  };

  const firstDow  = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;
  const daysInMon = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMon; d++) cells.push(whFmtDate(new Date(viewYear, viewMonth, d)));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i+7));

  const presets = [
    { label: 'Today',      f: wh_todayStr, t: wh_todayStr },
    { label: 'This Week',  f: whFmtDate(whGetMonday(wh_today)), t: wh_todayStr },
    { label: 'This Month', f: whFmtDate(new Date(wh_today.getFullYear(), wh_today.getMonth(), 1)), t: wh_todayStr },
    { label: 'Last Month', f: whFmtDate(new Date(wh_today.getFullYear(), wh_today.getMonth()-1, 1)), t: whFmtDate(new Date(wh_today.getFullYear(), wh_today.getMonth(), 0)) },
  ];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose} statusBarTranslucent>
      <View style={rp.overlay}>
        <View style={rp.sheet}>
          {/* Header */}
          <View style={rp.header}>
            <MaterialIcons name="calendar-today" size={20} color={C.primary} />
            <Text style={rp.headerTitle}>{t('warehouse.sections.selectPeriod', 'Select Period')}</Text>
            <TouchableOpacity onPress={onClose} style={{ marginLeft: 'auto' }}>
              <MaterialIcons name="close" size={22} color={C.neutralMid} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
            {/* FROM / TO pills */}
            <View style={{ flexDirection: 'row', marginBottom: 12 }}>
              <TouchableOpacity onPress={() => setStep('from')} style={[rp.pill, step==='from' && rp.pillActive]}>
                <Text style={rp.pillLbl}>FROM</Text>
                <Text style={rp.pillVal}>{tempFrom}</Text>
              </TouchableOpacity>
              <View style={{ width: 24, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: C.neutralMid, fontSize: 18 }}>→</Text>
              </View>
              <TouchableOpacity onPress={() => setStep('to')} style={[rp.pill, step==='to' && rp.pillActive]}>
                <Text style={rp.pillLbl}>TO</Text>
                <Text style={rp.pillVal}>{tempTo}</Text>
              </TouchableOpacity>
            </View>
            {/* Hint */}
            <Text style={rp.hint}>{step === 'from' ? 'Tap a date to set start' : 'Tap a date to set end'}</Text>
            {/* Month nav */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <TouchableOpacity onPress={prevMonth} style={rp.arrowBtn}><Text style={rp.arrowTxt}>‹</Text></TouchableOpacity>
              <Text style={{ fontSize: 17, fontWeight: '800', color: C.neutralDark }}>{WH_MONTHS[viewMonth]} {viewYear}</Text>
              <TouchableOpacity onPress={nextMonth} style={rp.arrowBtn}><Text style={rp.arrowTxt}>›</Text></TouchableOpacity>
            </View>
            {/* Day headers */}
            <View style={{ flexDirection: 'row', marginBottom: 4 }}>
              {WH_DAY_HDR.map(d => (
                <View key={d} style={{ flex: 1, alignItems: 'center', paddingVertical: 4 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: C.neutralMid }}>{d}</Text>
                </View>
              ))}
            </View>
            {/* Calendar grid */}
            {weeks.map((week, wi) => (
              <View key={wi} style={{ flexDirection: 'row' }}>
                {week.map((ds, di) => {
                  if (!ds) return <View key={`e${di}`} style={{ flex: 1, aspectRatio: 1 }} />;
                  const isFrom  = ds === tempFrom;
                  const isTo    = ds === tempTo && tempFrom !== tempTo;
                  const inRng   = ds > tempFrom && ds < tempTo;
                  const isTodDs = ds === wh_todayStr;
                  const bg = (isFrom||isTo) ? C.primary : inRng ? C.primaryLight : 'transparent';
                  const txCol = (isFrom||isTo) ? '#fff' : inRng ? C.primary : isTodDs ? C.primary : C.neutralDark;
                  const fw = (isFrom||isTo||isTodDs) ? '800' : '400';
                  return (
                    <TouchableOpacity
                      key={ds}
                      style={{ flex:1, aspectRatio:1, alignItems:'center', justifyContent:'center', backgroundColor: bg, borderRadius: (isFrom||isTo) ? 9 : 0 }}
                      onPress={() => handleDay(ds)} activeOpacity={0.7}
                    >
                      <Text style={{ fontSize: 13, fontWeight: fw, color: txCol }}>
                        {parseInt(ds.split('-')[2], 10)}
                      </Text>
                      {isTodDs && !isFrom && !isTo && (
                        <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: C.primary, marginTop: 1 }} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
            {/* Presets */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
              {presets.map(p => (
                <TouchableOpacity key={p.label} style={rp.presetBtn} onPress={() => setPreset(p.f, p.t)}>
                  <Text style={rp.presetTxt}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {/* Apply */}
            <TouchableOpacity
              style={rp.applyBtn}
              onPress={() => { onChange(tempFrom, tempTo); onClose(); }}
            >
              <Text style={rp.applyTxt}>
                Apply: {tempFrom === tempTo ? tempFrom : `${tempFrom} → ${tempTo}`}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const rp = StyleSheet.create({
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet:       { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%' },
  header:      { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  headerTitle: { fontSize: 16, fontWeight: '800', color: C.neutralDark },
  pill:        { flex: 1, borderWidth: 2, borderColor: C.border, borderRadius: 12, padding: 10, backgroundColor: C.neutralLight },
  pillActive:  { borderColor: C.primary, backgroundColor: C.primaryLight },
  pillLbl:     { fontSize: 10, color: C.neutralMid, fontWeight: '700', marginBottom: 2 },
  pillVal:     { fontSize: 14, fontWeight: '800', color: C.neutralDark },
  hint:        { textAlign: 'center', color: C.neutralMid, fontSize: 12, marginBottom: 14 },
  arrowBtn:    { width: 36, height: 36, borderRadius: 10, backgroundColor: C.neutralLight, alignItems: 'center', justifyContent: 'center' },
  arrowTxt:    { fontSize: 24, color: C.primary, fontWeight: '700', lineHeight: 28 },
  presetBtn:   { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: C.border, backgroundColor: C.neutralLight },
  presetTxt:   { fontSize: 12, fontWeight: '600', color: C.neutralDark },
  applyBtn:    { marginTop: 16, backgroundColor: C.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  applyTxt:    { color: '#fff', fontWeight: '800', fontSize: 14 },
});

// ─── DATE RANGE PICKER COMPONENT ─────────────────────────────────────────────
function DateRangePicker({ range, setRange, customFrom, setCustomFrom, customTo, setCustomTo }) {
  const [rangeOpen, setRangeOpen] = useState(false);
  const isToday = range === 'Today';
  const isPeriod = range === 'Custom';
  const hasDateRange = customFrom && customTo;
  const dateLabel = hasDateRange
    ? (customFrom === customTo ? customFrom : `${customFrom}  →  ${customTo}`)
    : 'Select dates';

  return (
    <View style={dp.wrap}>
      <View style={dp.row}>
        {/* Today button */}
        <TouchableOpacity
          style={[dp.todayBtn, isToday && dp.todayBtnActive]}
          onPress={() => setRange('Today')}
          activeOpacity={0.7}
        >
          <MaterialIcons name="today" size={16} color={isToday ? '#fff' : C.neutralDark} />
          <Text style={[dp.todayTxt, isToday && dp.todayTxtActive]}>Today</Text>
        </TouchableOpacity>

        {/* Period button — always visible, opens calendar */}
        <TouchableOpacity
          style={[dp.periodBtn, isPeriod && dp.periodBtnActive]}
          onPress={() => { setRange('Custom'); setRangeOpen(true); }}
          activeOpacity={0.7}
        >
          <MaterialIcons name="date-range" size={16} color={isPeriod ? '#fff' : C.neutralDark} />
          <Text style={[dp.periodTxt, isPeriod && dp.periodTxtActive]} numberOfLines={1}>
            {isPeriod && hasDateRange ? dateLabel : 'Period'}
          </Text>
          <MaterialIcons name="arrow-drop-down" size={18} color={isPeriod ? '#fff' : C.neutralMid} />
        </TouchableOpacity>
      </View>

      <RangePickerModal
        visible={rangeOpen}
        onClose={() => setRangeOpen(false)}
        from={customFrom}
        to={customTo}
        onChange={(f, t) => { setCustomFrom(f); setCustomTo(t); }}
      />
    </View>
  );
}

const dp = StyleSheet.create({
  wrap:            { backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border },
  row:             { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, gap: 10 },
  todayBtn:        { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, backgroundColor: colors.background, borderWidth: 1.5, borderColor: C.border },
  todayBtnActive:  { backgroundColor: C.primary, borderColor: C.primary },
  todayTxt:        { fontSize: 13, fontWeight: '700', color: C.neutralDark },
  todayTxtActive:  { color: '#fff' },
  periodBtn:       { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: colors.background, borderWidth: 1.5, borderColor: C.border },
  periodBtnActive: { backgroundColor: C.primary, borderColor: C.primary },
  periodTxt:       { flex: 1, fontSize: 13, fontWeight: '700', color: C.neutralDark },
  periodTxtActive: { color: '#fff' },
});

// ─── BOTTOM SHEET ─────────────────────────────────────────────────────────────
function Sheet({ visible, onClose, title, children, tall }) {
  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TouchableOpacity style={styles.overlayBg} activeOpacity={1} onPress={onClose} />
        <View style={[styles.sheet, tall && styles.sheetTall]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.sheetClose}>
              <MaterialIcons name="close" size={18} color={C.neutralMid} />
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {children}
            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Field({ label, children }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}
function TInput({ value, onChangeText, placeholder, keyboardType, multiline }) {
  return (
    <TextInput
      style={[styles.tInput, multiline && { height: 72, textAlignVertical: 'top' }]}
      value={value} onChangeText={onChangeText} placeholder={placeholder}
      placeholderTextColor={colors.textMuted} keyboardType={keyboardType || 'default'} multiline={multiline}
    />
  );
}
function PickerRow({ options, value, onSelect, labels }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
      {options.map((opt, idx) => (
        <TouchableOpacity key={opt} style={[styles.pickerPill, value === opt && styles.pickerPillActive]} onPress={() => onSelect(opt)}>
          <Text style={[styles.pickerPillText, value === opt && styles.pickerPillTextActive]}>{labels ? (labels[idx] ?? opt) : opt}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}
function SaveBtn({ onPress, label = 'Save', loading }) {
  return (
    <TouchableOpacity style={styles.saveBtn} onPress={onPress} disabled={loading}>
      {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>{label}</Text>}
    </TouchableOpacity>
  );
}
function CancelBtn({ onPress }) {
  return (
    <TouchableOpacity style={styles.cancelBtn} onPress={onPress}>
      <Text style={styles.cancelBtnText}>Cancel</Text>
    </TouchableOpacity>
  );
}

// ─── CALENDAR DATE PICKER ─────────────────────────────────────────────────────
const CAL_MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const CAL_DAYS   = ['Su','Mo','Tu','We','Th','Fr','Sa'];

function DatePickerModal({ visible, onClose, onSelect, value }) {
  const today = new Date();
  const [viewYear,  setViewYear]  = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  useEffect(() => {
    if (visible) {
      const d = value ? new Date(value + 'T00:00:00') : new Date();
      if (!isNaN(d)) { setViewYear(d.getFullYear()); setViewMonth(d.getMonth()); }
    }
  }, [visible]);

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  }
  function selectDay(day) {
    const m = String(viewMonth + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    onSelect(`${viewYear}-${m}-${d}`);
    onClose();
  }

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDay    = new Date(viewYear, viewMonth, 1).getDay();
  const cells = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  const selParts = value ? value.split('-').map(Number) : null;
  const isSelected = d => d && selParts && selParts[0] === viewYear && selParts[1] === viewMonth + 1 && selParts[2] === d;
  const isToday    = d => d && today.getFullYear() === viewYear && today.getMonth() === viewMonth && today.getDate() === d;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={cal.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={cal.card}>
          {/* Month / Year header */}
          <View style={cal.header}>
            <TouchableOpacity onPress={prevMonth} style={cal.navBtn}>
              <MaterialIcons name="chevron-left" size={22} color={C.neutralDark} />
            </TouchableOpacity>
            <Text style={cal.monthYear}>{CAL_MONTHS[viewMonth]} {viewYear}</Text>
            <TouchableOpacity onPress={nextMonth} style={cal.navBtn}>
              <MaterialIcons name="chevron-right" size={22} color={C.neutralDark} />
            </TouchableOpacity>
          </View>
          {/* Day-of-week labels */}
          <View style={cal.weekRow}>
            {CAL_DAYS.map(d => <Text key={d} style={cal.dayName}>{d}</Text>)}
          </View>
          {/* Calendar grid */}
          <View style={cal.grid}>
            {cells.map((day, idx) => (
              <TouchableOpacity
                key={idx}
                style={[cal.cell, isSelected(day) && cal.cellSel, isToday(day) && !isSelected(day) && cal.cellToday]}
                onPress={() => day && selectDay(day)}
                disabled={!day}
                activeOpacity={day ? 0.7 : 1}
              >
                {day ? (
                  <Text style={[cal.cellTxt, isSelected(day) && cal.cellTxtSel, isToday(day) && !isSelected(day) && cal.cellTxtToday]}>
                    {day}
                  </Text>
                ) : null}
              </TouchableOpacity>
            ))}
          </View>
          {/* Actions */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 14, gap: 8 }}>
            <TouchableOpacity style={cal.clearBtn} onPress={() => { onSelect(''); onClose(); }}>
              <Text style={cal.clearTxt}>Clear</Text>
            </TouchableOpacity>
            <TouchableOpacity style={cal.todayBtn} onPress={() => {
              const m = String(today.getMonth() + 1).padStart(2, '0');
              const d = String(today.getDate()).padStart(2, '0');
              onSelect(`${today.getFullYear()}-${m}-${d}`);
              onClose();
            }}>
              <Text style={cal.todayTxt}>Today</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// Tappable date field that opens the DatePickerModal
function DateField({ value, onChange, placeholder = 'Select expiry date', label }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {label && <Text style={styles.fieldLabel}>{label}</Text>}
      <TouchableOpacity
        style={[styles.tInput, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 }]}
        onPress={() => setOpen(true)}
        activeOpacity={0.75}
      >
        <Text style={{ fontSize: 14, color: value ? C.neutralDark : colors.textMuted, flex: 1 }}>
          {value || placeholder}
        </Text>
        {value
          ? <TouchableOpacity onPress={() => onChange('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <MaterialIcons name="close" size={16} color={C.neutralMid} />
            </TouchableOpacity>
          : <MaterialIcons name="calendar-today" size={16} color={C.primary} />
        }
      </TouchableOpacity>
      <DatePickerModal visible={open} onClose={() => setOpen(false)} onSelect={onChange} value={value} />
    </>
  );
}

const cal = StyleSheet.create({
  backdrop:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 },
  card:       { backgroundColor: '#fff', borderRadius: 20, padding: 18, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 12 },
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  navBtn:     { width: 36, height: 36, justifyContent: 'center', alignItems: 'center', borderRadius: 10, backgroundColor: C.neutralLight },
  monthYear:  { fontSize: 16, fontWeight: '800', color: C.neutralDark },
  weekRow:    { flexDirection: 'row', marginBottom: 6 },
  dayName:    { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', color: C.neutralMid },
  grid:       { flexDirection: 'row', flexWrap: 'wrap' },
  cell:       { width: `${100 / 7}%`, aspectRatio: 1, justifyContent: 'center', alignItems: 'center', borderRadius: 100 },
  cellSel:    { backgroundColor: C.primary },
  cellToday:  { backgroundColor: C.primaryLight },
  cellTxt:    { fontSize: 13, color: C.neutralDark, fontWeight: '500' },
  cellTxtSel: { color: '#fff', fontWeight: '800' },
  cellTxtToday: { color: C.primary, fontWeight: '800' },
  clearBtn:   { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  clearTxt:   { fontSize: 13, fontWeight: '700', color: C.neutralMid },
  todayBtn:   { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: C.primary, alignItems: 'center' },
  todayTxt:   { fontSize: 13, fontWeight: '700', color: '#fff' },
});

// ─── STATUS BANNER ────────────────────────────────────────────────────────────
function StatusBanner({ items, lowStockAlertNames }) {
  const { t } = useTranslation();
  const outCount = items.filter(i => stockStatus(i) === 'critical').length;
  const lowCount = items.filter(i => stockStatus(i) === 'low').length;
  const alertCount = lowStockAlertNames?.length || 0;

  let bg, text, icon;
  if (outCount > 0) {
    bg = C.danger;
    icon = 'warning';
    text = `${outCount} item${outCount>1?'s':''} out of stock`;
  } else if (alertCount > 0) {
    bg = C.danger;
    icon = 'notifications';
    text = `Low stock alert: ${lowStockAlertNames.join(', ')}`;
  } else if (lowCount > 0) {
    bg = C.warning;
    icon = null;
    text = `${lowCount} item${lowCount>1?'s':''} running low`;
  } else {
    bg = C.success;
    icon = null;
    text = t('warehouse.empty.allStockHealthy', 'All stock levels healthy');
  }

  return (
    <View style={[styles.banner, { backgroundColor: bg }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {icon && <MaterialIcons name={icon} size={18} color="#FFFFFF" />}
        <Text style={styles.bannerText}>{text}</Text>
      </View>
    </View>
  );
}

// ─── KITCHEN ANALYTICS SHEET ──────────────────────────────────────────────────
function KitchenAnalyticsSheet({ visible, onClose, entry, allOutputs, items, rangeLabel }) {
  const { t } = useTranslation();
  if (!entry) return null;
  const ingName = entry.itemName;
  const item    = items.find(i => i.name.toLowerCase() === ingName.toLowerCase());
  const costPer = item ? toNum(item.cost_per_unit) : 0;

  // All kitchen use entries for this ingredient in full history
  const relEntries = allOutputs.filter(o => o.itemName === ingName && o.reason === 'Kitchen Use');
  const totalQty   = relEntries.reduce((s, o) => s + toNum(o.qty), 0);
  const totalCost  = totalQty * costPer;

  // Kitchen spend of all items
  const kitchenTotal = allOutputs
    .filter(o => o.reason === 'Kitchen Use')
    .reduce((s, o) => {
      const it = items.find(x => x.name.toLowerCase() === o.itemName.toLowerCase());
      return s + toNum(o.qty) * (it ? toNum(it.cost_per_unit) : 0);
    }, 0);
  const pct = kitchenTotal > 0 ? ((totalCost / kitchenTotal) * 100).toFixed(1) : '0';

  // By day
  const byDay = {};
  relEntries.forEach(o => {
    byDay[o.date] = (byDay[o.date] || 0) + toNum(o.qty);
  });
  const days = Object.entries(byDay).sort((a, b) => a[0].localeCompare(b[0]));
  const maxQty = days.length ? Math.max(...days.map(d => d[1])) : 1;

  // Which menu items consumed this most
  const byMenu = {};
  relEntries.forEach(o => {
    if (o.menuItem) byMenu[o.menuItem] = (byMenu[o.menuItem] || 0) + toNum(o.qty);
  });
  const menuBreakdown = Object.entries(byMenu).sort((a, b) => b[1] - a[1]);

  return (
    <Sheet visible={visible} onClose={onClose} title={`Analytics — ${ingName}`} tall>
      {/* Header stats */}
      <View style={an.statsRow}>
        <View style={an.statBox}>
          <Text style={an.statVal}>{fmtNum(totalQty)}</Text>
          <Text style={an.statLbl}>Total Used</Text>
        </View>
        <View style={an.statBox}>
          <Text style={an.statVal}>{money(totalCost)}</Text>
          <Text style={an.statLbl}>Total Value</Text>
        </View>
        <View style={an.statBox}>
          <Text style={an.statVal}>{pct}%</Text>
          <Text style={an.statLbl}>Of Kitchen Spend</Text>
        </View>
      </View>

      {/* Usage by day bar chart */}
      <View style={an.section}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <MaterialIcons name="bar-chart" size={16} color={C.neutralDark} />
          <Text style={an.sectionTitle}>Usage by Day ({rangeLabel})</Text>
        </View>
        {days.length === 0
          ? <Text style={an.empty}>No data in selected period</Text>
          : days.map(([date, qty]) => (
            <View key={date} style={an.barRow}>
              <Text style={an.barDate}>{date.slice(5)}</Text>
              <View style={an.barTrack}>
                <View style={[an.bar, { width: `${Math.max(4, (qty / maxQty) * 100)}%` }]} />
              </View>
              <Text style={an.barQty}>{fmtNum(qty)}</Text>
              <Text style={an.barMoney}>{money(qty * costPer)}</Text>
            </View>
          ))
        }
      </View>

      {/* Menu breakdown */}
      {menuBreakdown.length > 0 && (
        <View style={an.section}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <MaterialIcons name="restaurant" size={16} color={C.neutralDark} />
            <Text style={an.sectionTitle}>{t('warehouse.sections.consumedByMenuItem', 'Consumed By Menu Item')}</Text>
          </View>
          {menuBreakdown.map(([menu, qty]) => (
            <View key={menu} style={an.menuRow}>
              <Text style={an.menuName}>{menu}</Text>
              <Text style={an.menuQty}>{fmtNum(qty)} {item?.unit || ''}</Text>
              <Text style={an.menuCost}>{money(qty * costPer)}</Text>
            </View>
          ))}
        </View>
      )}
    </Sheet>
  );
}

const an = StyleSheet.create({
  statsRow:    { flexDirection: 'row', marginHorizontal: 16, marginTop: 16, marginBottom: 8, gap: 8 },
  statBox:     { flex: 1, backgroundColor: colors.background, borderRadius: 12, padding: 12, alignItems: 'center' },
  statVal:     { fontSize: 14, fontWeight: '900', color: C.neutralDark, textAlign: 'center' },
  statLbl:     { fontSize: 10, color: C.neutralMid, marginTop: 3, textAlign: 'center', fontWeight: '600' },
  section:     { marginHorizontal: 16, marginTop: 16 },
  sectionTitle:{ fontSize: 13, fontWeight: '800', color: C.neutralDark },
  empty:       { fontSize: 12, color: C.neutralMid, fontStyle: 'italic' },
  barRow:      { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  barDate:     { fontSize: 11, color: C.neutralMid, width: 36, fontWeight: '600' },
  barTrack:    { flex: 1, height: 18, backgroundColor: colors.background, borderRadius: 9, overflow: 'hidden' },
  bar:         { height: '100%', backgroundColor: C.primary, borderRadius: 9 },
  barQty:      { fontSize: 11, color: C.neutralDark, fontWeight: '700', width: 40, textAlign: 'right' },
  barMoney:    { fontSize: 10, color: C.neutralMid, width: 72, textAlign: 'right' },
  menuRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.background, gap: 8 },
  menuName:    { flex: 1, fontSize: 13, fontWeight: '700', color: C.neutralDark },
  menuQty:     { fontSize: 12, color: C.neutralMid, width: 60, textAlign: 'right' },
  menuCost:    { fontSize: 12, fontWeight: '700', color: C.primary, width: 90, textAlign: 'right' },
});

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 1 — INVENTORY
// ═══════════════════════════════════════════════════════════════════════════════
function InventoryTab({ items, onRefresh, refreshing, categories, setCategories, suppliers, onDeliveryCreated, setDialog }) {
  const { t } = useTranslation();
  const [search, setSearch]       = useState('');
  const [filter, setFilter]       = useState('All');
  const [itemSheet, setItemSheet] = useState(false);
  const [editing, setEditing]     = useState(null);
  const [form, setForm]           = useState({ name: '', category: '', unit: 'kg', quantity_in_stock: '', min_stock_level: '', cost_per_unit: '', expiry_date: '' });
  const [saving, setSaving]       = useState(false);
  const [receiveSheet, setReceiveSheet] = useState(false);
  // Batches detail sheet
  const [batchesSheet,   setBatchesSheet]   = useState(false);
  const [batchesItem,    setBatchesItem]    = useState(null);
  const [batchesData,    setBatchesData]    = useState([]);
  const [batchesLoading, setBatchesLoading] = useState(false);
  const [receiveItem, setReceiveItem]   = useState(null);
  const [receiveForm, setReceiveForm]   = useState({ quantity: '', cost_per_unit: '', supplier_id: '', supplier_name: '', expiry_date: '', delivery_date: '', reason: 'Purchase' });
  const [receiveSaving, setReceiveSaving] = useState(false);
  // Consume sheet
  const [consumeSheet, setConsumeSheet]     = useState(false);
  const [consumeItem, setConsumeItem]       = useState(null);
  const [consumeForm, setConsumeForm]       = useState({ quantity: '', reason: 'Kitchen Use' });
  const [consumeSaving, setConsumeSaving]   = useState(false);
  // Adjust sheet
  const [adjustSheet, setAdjustSheet]       = useState(false);
  const [adjustItem, setAdjustItem]         = useState(null);
  const [adjustForm, setAdjustForm]         = useState({ quantity: '', reason: '', is_waste: false });
  const [adjustSaving, setAdjustSaving]     = useState(false);
  const [catSheet, setCatSheet]     = useState(false);
  const [newCatName, setNewCatName] = useState('');

  const fi = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const ri = (k, v) => setReceiveForm(p => ({ ...p, [k]: v }));

  const filterOptions = ['All', 'Low Stock', ...categories];
  const filterLabel = (f) => {
    if (f === 'All')        return t('warehouse.filters.all', 'All');
    if (f === 'Low Stock')  return t('warehouse.filters.lowStock', 'Low Stock');
    return invCategoryLabel(f, t);
  };

  const displayed = items.filter(item => {
    const matchSearch = item.name.toLowerCase().includes(search.toLowerCase());
    const st = stockStatus(item);
    let matchFilter;
    if (filter === 'All')       matchFilter = true;
    else if (filter === 'Low Stock') matchFilter = (st === 'low' || st === 'critical');
    else                        matchFilter = (item.category || '') === filter;
    return matchSearch && matchFilter;
  });

  const lowCount = items.filter(i => stockStatus(i) === 'low').length;
  const outCount = items.filter(i => stockStatus(i) === 'critical').length;

  function openAdd() {
    setEditing(null);
    setForm({ name: '', category: categories[0] || '', unit: 'kg', quantity_in_stock: '', min_stock_level: '', cost_per_unit: '', expiry_date: '', supplier_id: '', supplier_name: '' });
    setItemSheet(true);
  }
  function openEdit(item) {
    setEditing(item);
    const sup = suppliers?.find(s => String(s.id) === String(item.supplier_id));
    setForm({ name: item.name, category: item.category || categories[0] || '', unit: item.unit || 'kg', quantity_in_stock: String(toNum(item.quantity_in_stock)), min_stock_level: String(toNum(item.min_stock_level ?? item.low_stock_alert ?? 0)), cost_per_unit: String(toNum(item.cost_per_unit)), expiry_date: item.expiry_date || '', supplier_id: item.supplier_id || '', supplier_name: sup?.name || '' });
    setItemSheet(true);
  }
  async function openBatches(item) {
    setBatchesItem(item);
    setBatchesSheet(true);
    setBatchesLoading(true);
    setBatchesData([]);
    try {
      const res = await warehouseAPI.getBatches(item.id);
      setBatchesData(res.data || []);
    } catch { setBatchesData([]); }
    setBatchesLoading(false);
  }
  function openReceive(item) {
    setReceiveItem(item);
    const firstSupplier = suppliers?.[0];
    setReceiveForm({
      quantity:      '',
      cost_per_unit: item.cost_per_unit ? String(toNum(item.cost_per_unit)) : '',
      supplier_id:   firstSupplier?.id   || '',
      supplier_name: firstSupplier?.name || '',
      expiry_date:   '',
      delivery_date: todayStr(),
      reason:        'Purchase',
    });
    setReceiveSheet(true);
  }

  function openConsume(item) {
    setConsumeItem(item);
    setConsumeForm({ quantity: '', reason: 'Kitchen Use' });
    setConsumeSheet(true);
  }
  function openAdjust(item) {
    setAdjustItem(item);
    setAdjustForm({ quantity: '', reason: '', is_waste: false });
    setAdjustSheet(true);
  }

  async function handleConsume() {
    if (!consumeForm.quantity || toNum(consumeForm.quantity) <= 0) {
      setDialog({ title: 'Required', message: 'Enter a valid quantity', type: 'warning' });
      return;
    }
    if (toNum(consumeForm.quantity) > toNum(consumeItem.quantity_in_stock)) {
      setDialog({ title: 'Insufficient Stock', message: `Only ${fmtNum(consumeItem.quantity_in_stock)} ${consumeItem.unit} available`, type: 'warning' });
      return;
    }
    setConsumeSaving(true);
    try {
      await warehouseAPI.consume({
        item_id:  consumeItem.id,
        quantity: toNum(consumeForm.quantity),
        reason:   consumeForm.reason || 'Kitchen Use',
      });
      setConsumeSheet(false);
      onRefresh();
    } catch (e) {
      setDialog({ title: 'Error', message: e.response?.data?.error || e.message, type: 'error' });
    }
    setConsumeSaving(false);
  }

  async function handleAdjust() {
    if (!adjustForm.quantity || toNum(adjustForm.quantity) <= 0) {
      setDialog({ title: 'Required', message: 'Enter a valid quantity', type: 'warning' });
      return;
    }
    if (!adjustForm.reason.trim()) {
      setDialog({ title: 'Required', message: 'Please provide a reason', type: 'warning' });
      return;
    }
    setAdjustSaving(true);
    try {
      await warehouseAPI.adjust(adjustItem.id, {
        quantity:  toNum(adjustForm.quantity),
        reason:    adjustForm.reason.trim(),
        is_waste:  adjustForm.is_waste,
      });
      setAdjustSheet(false);
      onRefresh();
    } catch (e) {
      setDialog({ title: 'Error', message: e.response?.data?.error || e.message, type: 'error' });
    }
    setAdjustSaving(false);
  }

  async function saveItem() {
    if (!form.name.trim()) {
      setDialog({ title: 'Required', message: 'Item name is required', type: 'warning' });
      return;
    }
    setSaving(true);
    const payload = { name: form.name.trim(), category: form.category, unit: form.unit, min_stock_level: toNum(form.min_stock_level), cost_per_unit: toNum(form.cost_per_unit), supplier_id: form.supplier_id || null };
    try {
      if (editing) {
        // Update item metadata (name, category, unit, cost, threshold)
        await warehouseAPI.update(editing.id, payload);
        // Handle stock quantity change via FIFO so batches stay in sync
        const prevQty = toNum(editing.quantity_in_stock);
        const newQty  = toNum(form.quantity_in_stock);
        const delta   = newQty - prevQty;
        if (delta > 0) {
          await warehouseAPI.receive({
            item_id:     editing.id,
            quantity:    delta,
            reason:      'Stock correction',
            expiry_date: form.expiry_date || undefined,
          });
        } else if (delta < 0) {
          await warehouseAPI.consume({ item_id: editing.id, quantity: Math.abs(delta), reason: 'Stock correction' });
        }
      } else {
        const res = await warehouseAPI.create(payload);
        const newId = res.data?.id;
        if (newId && toNum(form.quantity_in_stock) > 0) {
          await warehouseAPI.receive({
            item_id:     newId,
            quantity:    toNum(form.quantity_in_stock),
            reason:      'Initial stock',
            expiry_date: form.expiry_date || undefined,
          });
        }
      }
      setItemSheet(false);
      onRefresh();
    } catch (e) { setDialog({ title: 'Error', message: e.response?.data?.error || e.message, type: 'error' }); }
    setSaving(false);
  }

  async function deleteItem(item) {
    setDialog({
      title: 'Delete Item',
      message: `Remove "${item.name}"?`,
      type: 'danger',
      confirmLabel: 'Delete',
      onConfirm: async () => {
        setDialog(null);
        try { await warehouseAPI.delete(item.id); onRefresh(); }
        catch (e) { setDialog({ title: 'Error', message: e.response?.data?.error || 'Delete failed', type: 'error' }); }
      },
    });
  }

  async function receiveStock() {
    if (!receiveForm.quantity || toNum(receiveForm.quantity) <= 0) {
      setDialog({ title: 'Required', message: 'Enter a valid quantity', type: 'warning' });
      return;
    }
    setReceiveSaving(true);
    try {
      const qty  = toNum(receiveForm.quantity);
      const cost = toNum(receiveForm.cost_per_unit);
      await warehouseAPI.receive({
        item_id:       receiveItem.id,
        quantity:      qty,
        expiry_date:   receiveForm.expiry_date || undefined,
        cost_per_unit: cost > 0 ? cost : undefined,
        reason:        receiveForm.reason || 'Goods Arrival',
      });

      // Create a delivery history entry so it appears in the Deliveries tab
      if (onDeliveryCreated) {
        const unitPrice = cost > 0 ? cost : toNum(receiveItem.cost_per_unit);
        const today = todayStr();
        const entry = {
          id:           Date.now(),
          supplierId:   receiveForm.supplier_id   || '',
          supplierName: receiveForm.supplier_name || 'No supplier',
          date:         today,
          invoice:      '',
          lines:        [{ itemName: receiveItem.name, qty, unitPrice }],
          total:        qty * unitPrice,
          status:       'Delivered',
          notes:        receiveForm.reason || 'Goods Arrival',
          timestamp:    today,
        };
        onDeliveryCreated(prev => [entry, ...prev]);
      }

      setReceiveSheet(false);
      onRefresh();
    } catch (e) { setDialog({ title: 'Error', message: e.response?.data?.error || e.message, type: 'error' }); }
    setReceiveSaving(false);
  }

  function addCategory() {
    const name = newCatName.trim();
    if (!name) return;
    if (categories.includes(name)) {
      setDialog({ title: 'Exists', message: 'This category already exists', type: 'warning' });
      return;
    }
    setCategories([...categories, name]);
    setNewCatName('');
  }

  function removeCategory(cat) {
    const usedCount = items.filter(i => i.category === cat).length;
    if (usedCount > 0) {
      setDialog({ title: 'In Use', message: `${usedCount} item${usedCount > 1 ? 's' : ''} use this category. Reassign them first.`, type: 'warning' });
      return;
    }
    setCategories(categories.filter(c => c !== cat));
    if (filter === cat) setFilter('All');
  }

  return (
    <View style={{ flex: 1 }}>
      {/* Stat pills — Low Stock + Out of Stock only */}
      <View style={styles.statPillRow}>
        <View style={[styles.statPill, { backgroundColor: C.warningLight }]}>
          <Text style={[styles.statPillNum, { color: C.warning }]}>{lowCount}</Text>
          <Text style={[styles.statPillLabel, { color: C.warning }]}>{t('warehouse.filters.lowStock', 'Low Stock')}</Text>
        </View>
        <View style={[styles.statPill, { backgroundColor: C.dangerLight }]}>
          <Text style={[styles.statPillNum, { color: C.danger }]}>{outCount}</Text>
          <Text style={[styles.statPillLabel, { color: C.danger }]}>{t('warehouse.filters.outOfStock', 'Out of Stock')}</Text>
        </View>
      </View>

      {/* Filter chips + gear button */}
      <View style={styles.filterRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.filterScroll, { flex: 1 }]} contentContainerStyle={{ gap: 8, paddingHorizontal: spacing.md }}>
          {filterOptions.map(f => (
            <TouchableOpacity key={f} style={[styles.filterChip, filter === f && styles.filterChipActive]} onPress={() => setFilter(f)}>
              <Text style={[styles.filterChipText, filter === f && styles.filterChipTextActive]}>{filterLabel(f)}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TouchableOpacity onPress={() => { setNewCatName(''); setCatSheet(true); }} style={styles.filterGear}>
          <MaterialIcons name="settings" size={20} color={C.neutralMid} />
        </TouchableOpacity>
      </View>

      <View style={styles.searchWrap}>
        <MaterialIcons name="search" size={18} color={C.neutralMid} style={{ marginRight: 6 }} />
        <TextInput style={styles.searchInput} value={search} onChangeText={setSearch} placeholder={t('warehouse.searchItems','Search items...')} placeholderTextColor={colors.textMuted} />
        {search !== '' && <TouchableOpacity onPress={() => setSearch('')}><MaterialIcons name="close" size={18} color={C.neutralMid} /></TouchableOpacity>}
      </View>
      <TouchableOpacity style={styles.addBtn} onPress={openAdd}><Text style={styles.addBtnText}>+ {t('warehouse.addItem','Add Inventory Item')}</Text></TouchableOpacity>
      <FlatList
        data={displayed} keyExtractor={i => String(i.id)} contentContainerStyle={styles.listPad} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.admin} />}
        ListEmptyComponent={<View style={styles.emptyWrap}><MaterialIcons name="inventory-2" size={48} color={C.border} style={{ marginBottom: 8 }} /><Text style={styles.emptyText}>{t('warehouse.empty.noItems', 'No items found')}</Text></View>}
        renderItem={({ item }) => {
          const st = stockStatus(item);
          const catCol = invCatColor(item.category, categories);
          return (
            <View style={styles.itemCard}>
              <View style={styles.itemCardTop}>
                <View style={[styles.statusDot, { backgroundColor: STATUS_COLOR[st] }]} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                    {item.category ? (
                      <View style={[styles.catBadge, { backgroundColor: catCol.bg }]}>
                        <Text style={[styles.catBadgeText, { color: catCol.text }]}>{invCategoryLabel(item.category, t)}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.itemSub}>{fmtNum(item.quantity_in_stock)} {item.unit}  ·  Min: {toNum(item.min_stock_level ?? item.low_stock_alert ?? 0)} {item.unit}{item.cost_per_unit ? `  ·  ${money(item.cost_per_unit)}/${item.unit}` : ''}</Text>
                </View>
                {/* Batches icon — compact, top-right */}
                <TouchableOpacity style={styles.iconBtnGhost} onPress={() => openBatches(item)}>
                  <MaterialIcons name="layers" size={16} color={C.primary} />
                </TouchableOpacity>
              </View>
              {/* Action buttons row — matching website: Receive, Consume, Adjust, Edit, Delete */}
              <View style={actBtn.row}>
                <TouchableOpacity style={[actBtn.btn, actBtn.btnReceive]} onPress={() => openReceive(item)}>
                  <MaterialIcons name="add-circle-outline" size={14} color="#15803d" />
                  <Text style={[actBtn.btnText, { color: '#15803d' }]}>{t('warehouse.actions.receive', 'Receive')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[actBtn.btn, actBtn.btnConsume]} onPress={() => openConsume(item)}>
                  <MaterialIcons name="remove-circle-outline" size={14} color="#c2410c" />
                  <Text style={[actBtn.btnText, { color: '#c2410c' }]}>{t('warehouse.actions.consume', 'Consume')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[actBtn.btn, actBtn.btnAdjust]} onPress={() => openAdjust(item)}>
                  <MaterialIcons name="sync" size={14} color="#4f46e5" />
                  <Text style={[actBtn.btnText, { color: '#4f46e5' }]}>{t('warehouse.actions.adjust', 'Adjust')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[actBtn.btn, actBtn.btnEdit]} onPress={() => openEdit(item)}>
                  <MaterialIcons name="edit" size={14} color="#1d4ed8" />
                  <Text style={[actBtn.btnText, { color: '#1d4ed8' }]}>{t('warehouse.actions.edit', 'Edit')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[actBtn.btn, actBtn.btnDelete]} onPress={() => deleteItem(item)}>
                  <MaterialIcons name="delete-outline" size={14} color="#dc2626" />
                  <Text style={[actBtn.btnText, { color: '#dc2626' }]}>{t('warehouse.actions.delete', 'Delete')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
      />

      {/* Add / Edit item sheet */}
      <Sheet visible={itemSheet} onClose={() => setItemSheet(false)} title={editing ? t('warehouse.editItem','Edit Item') : t('warehouse.addItem','Add Inventory Item')} tall>
        <Field label={t('warehouse.itemName','Item Name')}><TInput value={form.name} onChangeText={v => fi('name', v)} placeholder={t('warehouse.egChickenBreast','e.g. Chicken Breast')} /></Field>
        <Field label={t('warehouse.category','Category')}>
          <PickerRow options={categories.length ? categories : ['Other']} value={form.category} onSelect={v => fi('category', v)} />
        </Field>
        <Field label={t('warehouse.unitRequired','Unit *')}><PickerRow options={UNITS} value={form.unit} onSelect={v => fi('unit', v)} /></Field>
        <Field label="Min Stock Level"><TInput value={form.min_stock_level} onChangeText={v => fi('min_stock_level', v)} placeholder="5" keyboardType="decimal-pad" /></Field>
        <Field label={t('warehouse.pricePerUnit',"Price per Unit (so'm)")}><TInput value={form.cost_per_unit} onChangeText={v => fi('cost_per_unit', v)} placeholder={t('warehouse.zero','0')} keyboardType="decimal-pad" /></Field>
        <Field label={t('warehouse.supplierOptional','Supplier (optional)')}>
          <PickerRow
            options={['No supplier', ...(suppliers || []).map(s => s.name)]}
            value={form.supplier_name || 'No supplier'}
            onSelect={v => {
              const s = (suppliers || []).find(x => x.name === v);
              fi('supplier_name', v === 'No supplier' ? '' : v);
              fi('supplier_id',   s?.id || '');
            }}
          />
        </Field>
        <View style={styles.field}>
          <DateField
            label={t('warehouse.expiryDateOptional','EXPIRY DATE (OPTIONAL)')}
            value={form.expiry_date}
            onChange={v => fi('expiry_date', v)}
          />
        </View>
        <View style={{ gap: 8, marginTop: 8 }}><SaveBtn onPress={saveItem} loading={saving} /><CancelBtn onPress={() => setItemSheet(false)} /></View>
      </Sheet>

      {/* Receive stock sheet */}
      <Sheet visible={receiveSheet} onClose={() => setReceiveSheet(false)} title={`${t('warehouse.receiveStock','Receive Stock')} — ${receiveItem?.name || ''}`} tall>
        <Field label={`${t('warehouse.quantityUnit','Quantity (unit)').replace('unit', receiveItem?.unit || 'unit')}`}>
          <TInput value={receiveForm.quantity} onChangeText={v => ri('quantity', v)} placeholder={t('warehouse.eg50','e.g. 50')} keyboardType="decimal-pad" />
        </Field>
        <Field label={`Price per ${receiveItem?.unit || 'unit'} (so'm)`}>
          <TInput value={receiveForm.cost_per_unit} onChangeText={v => ri('cost_per_unit', v)} placeholder={receiveItem?.cost_per_unit ? String(toNum(receiveItem.cost_per_unit)) : t('warehouse.zero','0')} keyboardType="decimal-pad" />
        </Field>
        <Field label={t('warehouse.reason','Reason')}>
          <PickerRow options={RECEIVE_REASONS} value={receiveForm.reason} onSelect={v => ri('reason', v)} />
        </Field>
        {suppliers && suppliers.length > 0 && (
          <Field label={t('warehouse.supplier','Supplier')}>
            <PickerRow
              options={['No supplier', ...suppliers.map(s => s.name)]}
              value={receiveForm.supplier_name || 'No supplier'}
              onSelect={v => {
                const s = suppliers.find(x => x.name === v);
                ri('supplier_name', v === 'No supplier' ? '' : v);
                ri('supplier_id',   s?.id || '');
              }}
            />
          </Field>
        )}
        <View style={styles.field}>
          <DateField label={t('warehouse.expiryDateOptional','EXPIRY DATE (OPTIONAL)')} value={receiveForm.expiry_date} onChange={v => ri('expiry_date', v)} />
        </View>
        <View style={styles.field}>
          <DateField label="DELIVERY DATE" value={receiveForm.delivery_date} onChange={v => ri('delivery_date', v)} placeholder={t('warehouse.tapPickDate','Tap to pick date')} />
        </View>
        <View style={{ gap: 8, marginTop: 8 }}>
          <SaveBtn onPress={receiveStock} label={t('warehouse.confirmReceipt','Confirm Receipt')} loading={receiveSaving} />
          <CancelBtn onPress={() => setReceiveSheet(false)} />
        </View>
      </Sheet>

      {/* Stock Batches detail sheet (FIFO order — soonest expiry first) */}
      <Sheet visible={batchesSheet} onClose={() => setBatchesSheet(false)} title={`${t('warehouse.batches','Batches')} — ${batchesItem?.name || ''}`} tall>
        <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 }}>
          <Text style={{ fontSize: 12, color: C.neutralMid, marginBottom: 12 }}>
            Batches are shown in FIFO order (soonest expiry used first).
          </Text>
          {batchesLoading ? (
            <ActivityIndicator size="small" color={C.primary} style={{ marginTop: 24 }} />
          ) : batchesData.length === 0 ? (
            <View style={{ alignItems: 'center', paddingTop: 32 }}>
              <MaterialIcons name="layers" size={40} color={C.border} />
              <Text style={{ color: C.neutralMid, marginTop: 8, fontSize: 13 }}>{t('warehouse.empty.noStockBatches', 'No stock batches found')}</Text>
            </View>
          ) : (
            batchesData.map((batch, idx) => {
              const days = batch.days_remaining != null ? parseInt(batch.days_remaining, 10) : null;
              const expired = days !== null && days <= 0;
              const critical = days !== null && days > 0 && days <= 7;
              const warning  = days !== null && days > 7 && days <= 14;
              const dotColor = expired ? C.danger : critical ? C.danger : warning ? C.warning : C.success;
              const bgColor  = expired ? '#FEF2F2' : critical ? '#FEF2F2' : warning ? '#FFFBEB' : '#F0FDF4';
              const expiryLabel = !batch.expiry_date ? 'No expiry date' :
                expired ? `Expired ${Math.abs(days)} day${Math.abs(days) !== 1 ? 's' : ''} ago` :
                days === 0 ? 'Expires today!' :
                `Expires in ${days} day${days !== 1 ? 's' : ''}`;
              return (
                <View key={batch.id} style={[bt.row, { backgroundColor: bgColor }]}>
                  <View style={[bt.rankBadge, { backgroundColor: dotColor }]}>
                    <Text style={bt.rankNum}>#{idx + 1}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={bt.qty}>
                      {parseFloat(batch.quantity_remaining).toFixed(2)} {batchesItem?.unit}
                    </Text>
                    <Text style={[bt.expiry, { color: expired || critical ? C.danger : warning ? C.warning : C.success }]}>
                      {expiryLabel}
                    </Text>
                    {batch.expiry_date && (
                      <Text style={bt.date}>{batch.expiry_date.slice(0, 10)}</Text>
                    )}
                  </View>
                  {(expired || critical || warning) && (
                    <MaterialIcons
                      name={expired ? 'error' : 'warning'}
                      size={20}
                      color={expired || critical ? C.danger : C.warning}
                    />
                  )}
                </View>
              );
            })
          )}
        </View>
      </Sheet>

      {/* Consume stock sheet */}
      <Sheet visible={consumeSheet} onClose={() => setConsumeSheet(false)} title={`${t('warehouse.recordOutput','Record Output')} — ${consumeItem?.name || ''}`}>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Available: {consumeItem ? `${fmtNum(consumeItem.quantity_in_stock)} ${consumeItem.unit}` : ''}</Text>
        </View>
        <Field label={`Quantity (${consumeItem?.unit || 'unit'})`}>
          <TInput value={consumeForm.quantity} onChangeText={v => setConsumeForm(p => ({ ...p, quantity: v }))} placeholder={t('warehouse.eg5','e.g. 5')} keyboardType="decimal-pad" />
        </Field>
        <Field label={t('warehouse.reason','Reason')}>
          <PickerRow options={OUTPUT_REASONS} value={consumeForm.reason} onSelect={v => setConsumeForm(p => ({ ...p, reason: v }))} labels={OUTPUT_REASONS.map(r => outputReasonLabel(r, t))} />
        </Field>
        <View style={{ gap: 8, marginTop: 8 }}>
          <SaveBtn onPress={handleConsume} label={t('warehouse.recordOutput','Record Output')} loading={consumeSaving} />
          <CancelBtn onPress={() => setConsumeSheet(false)} />
        </View>
      </Sheet>

      {/* Adjust stock sheet */}
      <Sheet visible={adjustSheet} onClose={() => setAdjustSheet(false)} title={`${t('warehouse.adjustStock','Adjust Stock')} — ${adjustItem?.name || ''}`} tall>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Current Stock: {adjustItem ? `${fmtNum(adjustItem.quantity_in_stock)} ${adjustItem.unit}` : ''}</Text>
        </View>
        <Field label={t('warehouse.quantityRemove','Quantity to Remove')}>
          <TInput value={adjustForm.quantity} onChangeText={v => setAdjustForm(p => ({ ...p, quantity: v }))} placeholder={t('warehouse.eg2','e.g. 2')} keyboardType="decimal-pad" />
        </Field>
        <Field label={t('warehouse.reasonRequired','Reason *')}>
          <PickerRow options={ADJUST_REASONS} value={adjustForm.reason} onSelect={v => setAdjustForm(p => ({ ...p, reason: v }))} />
        </Field>
        <TouchableOpacity
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: spacing.lg, marginBottom: spacing.md, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, backgroundColor: adjustForm.is_waste ? '#FEF2F2' : colors.background, borderWidth: 1.5, borderColor: adjustForm.is_waste ? C.danger : C.border }}
          onPress={() => setAdjustForm(p => ({ ...p, is_waste: !p.is_waste }))}
          activeOpacity={0.7}
        >
          <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: adjustForm.is_waste ? C.danger : C.border, backgroundColor: adjustForm.is_waste ? C.danger : 'transparent', justifyContent: 'center', alignItems: 'center' }}>
            {adjustForm.is_waste && <MaterialIcons name="check" size={14} color="#fff" />}
          </View>
          <Text style={{ fontSize: 14, color: adjustForm.is_waste ? C.danger : C.neutralDark, fontWeight: '600' }}>Mark as waste (logs expense)</Text>
        </TouchableOpacity>
        <View style={{ gap: 8, marginTop: 8 }}>
          <SaveBtn onPress={handleAdjust} label={t('warehouse.adjustStock','Adjust Stock')} loading={adjustSaving} />
          <CancelBtn onPress={() => setAdjustSheet(false)} />
        </View>
      </Sheet>

      {/* Category management sheet */}
      <Sheet visible={catSheet} onClose={() => { setCatSheet(false); setNewCatName(''); }} title={t('warehouse.manageCategories','Manage Categories')} tall>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Add New Category</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
            <TextInput
              style={[styles.tInput, { flex: 1 }]}
              value={newCatName}
              onChangeText={setNewCatName}
              placeholder={t('warehouse.egBeverages','e.g. Beverages')}
              placeholderTextColor={colors.textMuted}
              returnKeyType="done"
              onSubmitEditing={addCategory}
            />
            <TouchableOpacity onPress={addCategory} style={[styles.addLineBtn, { width: 56 }]}>
              <Text style={styles.addLineBtnText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Current Categories</Text>
          {categories.length === 0
            ? <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 8 }}>No categories yet.</Text>
            : categories.map(cat => {
                const count  = items.filter(i => i.category === cat).length;
                const col    = invCatColor(cat, categories);
                return (
                  <View key={cat} style={cat_st.row}>
                    <View style={[cat_st.dot, { backgroundColor: col.bg }]}>
                      <Text style={[cat_st.dotTxt, { color: col.text }]}>{cat[0]?.toUpperCase()}</Text>
                    </View>
                    <Text style={cat_st.name}>{cat}</Text>
                    <Text style={cat_st.count}>{count} item{count !== 1 ? 's' : ''}</Text>
                    <TouchableOpacity style={cat_st.removeBtn} onPress={() => removeCategory(cat)}>
                      <Text style={cat_st.removeBtnTxt}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                );
              })
          }
          {categories.length > 0 && (
            <Text style={cat_st.hint}>Items must be reassigned before a category can be removed.</Text>
          )}
        </View>
      </Sheet>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 2 — DELIVERIES
// ═══════════════════════════════════════════════════════════════════════════════
// history + setHistory are lifted to WarehouseScreen so state survives tab switches.
function DeliveriesTab({ items, suppliers, history, setHistory, onRefresh, refreshing, setDialog }) {
  const { t } = useTranslation();
  const [sheet, setSheet]                 = useState(false);
  const [saving, setSaving]               = useState(false);
  const [range, setRange]                 = useState('Today');
  const [customFrom, setCustomFrom]       = useState('');
  const [customTo, setCustomTo]           = useState('');
  const [editingDelivery, setEditingDelivery] = useState(null);

  const today = todayStr();
  const blankForm = () => ({
    supplierId:    suppliers[0]?.id   || '',
    supplierName:  suppliers[0]?.name || '',
    date:          today,
    invoice:       '',
    lines:         [],
    status:        'Delivered',   // default — stock updates immediately
    notes:         '',
    paymentStatus: 'unpaid',      // default: supplier not yet paid
    paymentDueDate: '',           // optional: when payment is due
  });
  const [form, setForm]           = useState(blankForm());
  const [lineItem,   setLineItem]   = useState('');
  const [lineQty,    setLineQty]    = useState('');
  const [lineUnit,   setLineUnit]   = useState('kg');
  const [unitPickerOpen, setUnitPickerOpen] = useState(false);
  const [linePrice,  setLinePrice]  = useState('');
  const [lineExpiry, setLineExpiry] = useState('');

  // Pending deliveries (Ordered / In Transit) — shown at top
  const pendingHistory = history.filter(d => ['Ordered', 'In Transit'].includes(d.status));
  // Completed deliveries (Delivered / Partial / Cancelled)
  const completedHistory = history.filter(d => !['Ordered', 'In Transit'].includes(d.status));
  const { from, to } = getDateRange(range, customFrom, customTo);
  const filtered    = completedHistory.filter(d => inRange(fmtDelivDate(d.date), from, to));
  const periodTotal = filtered.reduce((s, d) => s + toNum(d.total), 0);
  const periodItems = filtered.reduce((s, d) => s + (d.itemCount || d.lines.length || 0), 0);

  function closeSheet() { setSheet(false); setEditingDelivery(null); }

  // Payment flow state
  const [paySheet, setPaySheet] = useState(false);
  const [payStep, setPayStep]   = useState('form'); // 'form' | 'confirm'
  const [payTarget, setPayTarget] = useState(null);
  const [payMethod, setPayMethod] = useState('Cash');
  const [payNote, setPayNote]     = useState('');
  const [payDate, setPayDate]     = useState(todayStr());
  const [payDatePickerOpen, setPayDatePickerOpen] = useState(false);
  const [payDatePickerDate, setPayDatePickerDate] = useState(new Date());
  const PAY_METHODS = ['Cash', 'Bank Transfer', 'Card', 'Mobile Payment', 'Check', 'Other'];

  // Delivery detail sheet state
  const [detailSheet, setDetailSheet] = useState(false);
  const [detailDelivery, setDetailDelivery] = useState(null);
  const [detailItems, setDetailItems] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // Stock receipts (IN movements) — reload when history changes (new delivery added)
  const [stockReceipts, setStockReceipts] = useState([]);
  const loadReceipts = useCallback(async () => {
    try {
      const res = await warehouseAPI.getMovements({ type: 'IN', limit: 50 });
      const data = res?.data || res;
      if (Array.isArray(data)) setStockReceipts(data);
      else if (Array.isArray(data?.movements)) setStockReceipts(data.movements);
    } catch (_) {}
  }, []);
  useEffect(() => { loadReceipts(); }, [history.length]);
  // Also reload receipts after a short delay when history changes (covers race with warehouseAPI.receive)
  useEffect(() => {
    const timer = setTimeout(() => { loadReceipts(); }, 1500);
    return () => clearTimeout(timer);
  }, [history]);

  // Filter stock receipts by period (from/to are Date objects in local timezone)
  const filteredReceipts = stockReceipts.filter(m => {
    const raw = m.created_at || m.createdAt || '';
    if (!raw) return false;
    // Parse the full timestamp so timezone is respected, then compare as local date
    const ts = new Date(raw);
    if (isNaN(ts)) return false;
    // Convert to local midnight for date-only comparison
    const d = new Date(ts.getFullYear(), ts.getMonth(), ts.getDate());
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });

  function openPayDelivery(d) {
    setPayTarget(d);
    setPayMethod('Cash');
    setPayNote('');
    setPayDate(todayStr());
    setPayStep('form');
    setPaySheet(true);
  }

  async function openDeliveryDetail(d) {
    setDetailDelivery(d);
    setDetailItems([]);
    setDetailLoading(true);
    setDetailSheet(true);
    try {
      const full = await procurementAPI.getDelivery(String(d.id));
      if (full?.data?.items) {
        setDetailItems(full.data.items.map(it => ({
          id: it.id,
          itemName: it.item_name,
          qty: parseFloat(it.qty),
          unit: it.unit,
          unitPrice: parseFloat(it.unit_price),
          expiryDate: it.expiry_date ? it.expiry_date.split('T')[0] : '',
          removed: it.removed,
          removeReason: it.remove_reason || '',
        })));
      } else if (full?.items) {
        setDetailItems(full.items.map(it => ({
          id: it.id,
          itemName: it.item_name || it.itemName,
          qty: parseFloat(it.qty),
          unit: it.unit,
          unitPrice: parseFloat(it.unit_price || it.unitPrice || 0),
          expiryDate: it.expiry_date || it.expiryDate ? (it.expiry_date || it.expiryDate).split('T')[0] : '',
          removed: it.removed,
          removeReason: it.remove_reason || it.removeReason || '',
        })));
      }
    } catch (err) {
      console.log('Failed to fetch delivery detail:', err);
    }
    setDetailLoading(false);
  }

  async function confirmPayDelivery() {
    if (!payTarget) return;
    const d = payTarget;
    setPaySheet(false);
    // Optimistic local update
    setHistory(prev => {
      const updated = prev.map(item =>
        item.id === d.id
          ? { ...item, paymentStatus: 'paid', paidAt: payDate ? new Date(payDate + 'T12:00:00').toISOString() : new Date().toISOString(), paymentMethod: payMethod, paymentNote: payNote }
          : item
      );
      AsyncStorage.setItem(DELIVERY_STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
    try {
      await procurementAPI.payDelivery(String(d.id), { payment_method: payMethod, payment_note: payNote, paid_at: payDate ? new Date(payDate + 'T12:00:00').toISOString() : null });
    } catch (err) {
      // API failed — revert local state back to unpaid
      Alert.alert(t('alerts.paymentError','Payment Error'), t('alerts.couldNotSavePayment','Could not save payment to server. Please try again.'));
      setHistory(prev => {
        const reverted = prev.map(item =>
          item.id === d.id
            ? { ...item, paymentStatus: 'unpaid', paidAt: '', paymentMethod: '', paymentNote: '' }
            : item
        );
        AsyncStorage.setItem(DELIVERY_STORAGE_KEY, JSON.stringify(reverted)).catch(() => {});
        return reverted;
      });
    }
  }

  async function handleChangeStatus(delivId, newStatus) {
    try {
      await procurementAPI.updateDeliveryStatus(String(delivId), newStatus);
      // If changed to Delivered/Partial, receive items into stock
      if (['Delivered', 'Partial'].includes(newStatus)) {
        for (const line of detailItems) {
          if (line.removed || line.qty <= 0) continue;
          let match = items.find(i => i.name && i.name.toLowerCase() === line.itemName.toLowerCase());
          if (!match) {
            try {
              const res = await warehouseAPI.create({
                name: line.itemName, category: 'Other', unit: line.unit || 'piece',
                min_stock_level: 5, cost_per_unit: toNum(line.unitPrice),
              });
              match = res.data || res;
            } catch (_) { continue; }
          }
          if (match?.id) {
            try {
              await warehouseAPI.receive({
                item_id: match.id, quantity: line.qty,
                reason: `Delivery from ${detailDelivery?.supplierName || ''}`,
                expiry_date: line.expiryDate || undefined,
              });
            } catch (_) {}
          }
        }
      }
      Alert.alert(t('alerts.success','Success'), t('alerts.statusChanged','Status changed to {status}').replace('{status}', newStatus));
      setDetailSheet(false);
      onRefresh();
      // Reload stock receipts after status change (stock may have been received)
      setTimeout(() => { loadReceipts(); }, 800);
    } catch (err) {
      Alert.alert(t('alerts.error','Error'), t('alerts.failedUpdateStatus','Failed to update status'));
    }
  }

  function openNew() {
    setEditingDelivery(null);
    const f = blankForm();
    if (suppliers.length) { f.supplierId = suppliers[0].id; f.supplierName = suppliers[0].name; }
    setForm(f); setLineItem(''); setLineQty(''); setLineUnit('kg'); setLinePrice(''); setLineExpiry('');
    setSheet(true);
  }

  function openEditDelivery(d) {
    setEditingDelivery(d);
    setForm({
      supplierId:     d.supplierId     || '',
      supplierName:   d.supplierName   || '',
      date:           d.date           || today,
      invoice:        d.invoice        || '',
      lines:          d.lines          ? [...d.lines] : [],
      status:         d.status         || 'Delivered',
      notes:          d.notes          || '',
      paymentStatus:  d.paymentStatus  || 'unpaid',
      paymentDueDate: d.paymentDueDate || '',
    });
    setLineItem(''); setLineQty(''); setLineUnit('kg'); setLinePrice(''); setLineExpiry('');
    setSheet(true);
  }

  function addLine() {
    if (!lineItem.trim() || toNum(lineQty) <= 0) return;
    setForm(p => ({ ...p, lines: [...p.lines, { itemName: lineItem.trim(), qty: toNum(lineQty), unit: lineUnit || 'piece', unitPrice: toNum(linePrice), expiry_date: lineExpiry.trim() || '' }] }));
    setLineItem(''); setLineQty(''); setLineUnit('kg'); setLinePrice(''); setLineExpiry('');
  }
  function removeLine(i) { setForm(p => ({ ...p, lines: p.lines.filter((_, idx) => idx !== i) })); }

  async function handleRemoveItem(lineItemId, itemName) {
    Alert.prompt ? Alert.prompt('Remove Reason', `Why remove ${itemName}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async (reason) => {
        try {
          await procurementAPI.removeDeliveryItem(lineItemId, reason || 'Damaged');
          setDetailItems(prev => prev.map(it => it.id === lineItemId ? { ...it, removed: true, removeReason: reason || 'Damaged' } : it));
          onRefresh();
        } catch (_) { Alert.alert(t('alerts.error','Error'), t('alerts.failedRemoveItem','Failed to remove item')); }
      }},
    ]) : (async () => {
      try {
        await procurementAPI.removeDeliveryItem(lineItemId, 'Damaged');
        setDetailItems(prev => prev.map(it => it.id === lineItemId ? { ...it, removed: true, removeReason: 'Damaged' } : it));
        onRefresh();
      } catch (_) { Alert.alert(t('alerts.error','Error'), t('alerts.failedRemoveItem','Failed to remove item')); }
    })();
  }

  async function handleAdjustQty(lineItemId, itemName, currentQty) {
    Alert.prompt ? Alert.prompt('Adjust Quantity', `New quantity for ${itemName} (current: ${currentQty}):`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Update', onPress: async (newQty) => {
        const q = parseFloat(newQty);
        if (isNaN(q) || q < 0) return;
        try {
          await procurementAPI.updateDeliveryItemQty(lineItemId, q);
          setDetailItems(prev => prev.map(it => it.id === lineItemId ? { ...it, qty: q } : it));
          onRefresh();
        } catch (_) { Alert.alert(t('alerts.error','Error'), t('alerts.failedUpdateQuantity','Failed to update quantity')); }
      }},
    ], 'plain-text', String(currentQty)) : (async () => {
      try {
        await procurementAPI.updateDeliveryItemQty(lineItemId, currentQty);
        onRefresh();
      } catch (_) { Alert.alert(t('alerts.error','Error'), t('alerts.failedUpdateQuantity','Failed to update quantity')); }
    })();
  }

  async function saveDelivery() {
    if (!form.lines.length) {
      setDialog({ title: 'Required', message: 'Add at least one item', type: 'warning' });
      return;
    }
    setSaving(true);
    try {
      const stockStatuses  = ['Delivered', 'Partial'];
      const isStockStatus  = stockStatuses.includes(form.status);
      const wasStockStatus = editingDelivery ? stockStatuses.includes(editingDelivery.status) : false;

      const apiErrors   = [];
      const autoCreated = [];

      // Helper: find a warehouse item by name (case-insensitive) or auto-create it
      async function findOrCreate(itemName, unitPrice) {
        let match = items.find(i => i.name != null && i.name.toLowerCase() === itemName.toLowerCase());
        if (!match) {
          try {
            const res = await warehouseAPI.create({
              name:            itemName.trim(),
              category:        'Other',
              unit:            'piece',
              min_stock_level: 0,
              cost_per_unit:   toNum(unitPrice),
            });
            match = res.data;
            autoCreated.push(itemName);
          } catch {
            apiErrors.push(itemName);
            return null;
          }
        }
        return match;
      }

      const ref = `Delivery from ${form.supplierName} — ${form.invoice || 'no invoice'}`;

      if (!editingDelivery && isStockStatus) {
        // ── CASE 1: New delivery marked as Delivered/Partial → add all stock ──
        for (const line of form.lines) {
          const match = await findOrCreate(line.itemName, line.unitPrice);
          if (match?.id) {
            try { await warehouseAPI.receive({ item_id: match.id, quantity: line.qty, reason: ref, expiry_date: line.expiry_date || undefined }); }
            catch { apiErrors.push(line.itemName); }
          }
        }

      } else if (editingDelivery && !wasStockStatus && isStockStatus) {
        // ── CASE 2: Transitioning from non-stock status → stock status ──
        // (e.g. "In Transit" → "Delivered") → add all current lines
        for (const line of form.lines) {
          const match = await findOrCreate(line.itemName, line.unitPrice);
          if (match?.id) {
            try { await warehouseAPI.receive({ item_id: match.id, quantity: line.qty, reason: ref, expiry_date: line.expiry_date || undefined }); }
            catch { apiErrors.push(line.itemName); }
          }
        }

      } else if (editingDelivery && wasStockStatus && isStockStatus) {
        // ── CASE 3: Editing an already-delivered delivery ──
        // Reconcile delta: removed/reduced items → consume; added/increased items → receive.
        const oldMap = {};
        (editingDelivery.lines || []).forEach(l => {
          oldMap[l.itemName.toLowerCase()] = { name: l.itemName, qty: toNum(l.qty), unitPrice: toNum(l.unitPrice) };
        });
        const newMap = {};
        form.lines.forEach(l => {
          newMap[l.itemName.toLowerCase()] = { name: l.itemName, qty: toNum(l.qty), unitPrice: toNum(l.unitPrice) };
        });

        // Items removed or quantity reduced → consume the difference back into inventory
        for (const [key, old] of Object.entries(oldMap)) {
          const delta = old.qty - (newMap[key]?.qty ?? 0);
          if (delta > 0) {
            const match = items.find(i => i.name != null && i.name.toLowerCase() === key);
            if (match?.id) {
              try { await warehouseAPI.consume({ item_id: match.id, quantity: delta, reason: `Delivery edit — removed/reduced: ${old.name}` }); }
              catch { apiErrors.push(old.name); }
            }
          }
        }

        // Items added or quantity increased → receive the difference
        for (const [key, nw] of Object.entries(newMap)) {
          const delta = nw.qty - (oldMap[key]?.qty ?? 0);
          if (delta > 0) {
            const match = await findOrCreate(nw.name, nw.unitPrice);
            if (match?.id) {
              try { await warehouseAPI.receive({ item_id: match.id, quantity: delta, reason: `Delivery edit — added/increased: ${nw.name}`, expiry_date: nw.expiry_date || undefined }); }
              catch { apiErrors.push(nw.name); }
            }
          }
        }

      } else if (editingDelivery && wasStockStatus && !isStockStatus) {
        // ── CASE 4: Reverting a delivered order back to non-stock status ──
        // Consume back all items that were previously stocked
        for (const line of (editingDelivery.lines || [])) {
          const match = items.find(i => i.name != null && i.name.toLowerCase() === line.itemName.toLowerCase());
          if (match?.id) {
            try { await warehouseAPI.consume({ item_id: match.id, quantity: toNum(line.qty), reason: `Delivery reverted to "${form.status}": ${line.itemName}` }); }
            catch { apiErrors.push(line.itemName); }
          }
        }
      }

      const total = form.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
      const delivId = editingDelivery ? String(editingDelivery.id) : String(Date.now());

      if (editingDelivery) {
        setHistory(prev => prev.map(d =>
          d.id === editingDelivery.id
            ? { ...form, id: d.id, total, timestamp: d.timestamp || today }
            : d
        ));
      } else {
        setHistory(prev => [{ ...form, id: delivId, total, timestamp: today, itemCount: form.lines.length }, ...prev]);
      }

      // Sync to database
      try {
        await procurementAPI.createDelivery({
          id:               delivId,
          supplier_name:    form.supplierName || '',
          supplier_id:      form.supplierId   || null,
          total:            total,
          status:           form.status       || 'Delivered',
          payment_status:   form.paymentStatus || 'unpaid',
          notes:            form.notes        || '',
          timestamp:        form.date         || today,
          payment_due_date: form.paymentDueDate || null,
          items: form.lines.map(l => ({
            item_name: l.itemName,
            qty: toNum(l.qty),
            unit: l.unit || 'kg',
            unit_price: toNum(l.unitPrice),
            expiry_date: l.expiry_date || null,
          })),
        });
      } catch (syncErr) {
        apiErrors.push('Server sync failed — delivery saved locally only');
      }

      setSaving(false);
      closeSheet();
      onRefresh?.();
      // Reload stock receipts after a short delay to ensure movements are saved
      setTimeout(() => { loadReceipts(); }, 800);

      const msgs = [editingDelivery ? 'Delivery updated.' : 'Delivery recorded.'];
      if (autoCreated.length) msgs.push(`New inventory items auto-created: ${autoCreated.join(', ')}.`);
      if (apiErrors.length)   msgs.push(`Stock adjustment failed for: ${apiErrors.join(', ')}.`);
      if (!isStockStatus)     msgs.push(`Status is "${form.status}" — stock will update when changed to Delivered or Partial.`);
      setDialog({ title: apiErrors.length ? 'Partial Save' : 'Saved', message: msgs.join('\n\n'), type: apiErrors.length ? 'warning' : 'success' });

    } catch (e) {
      setSaving(false);
      setDialog({ title: 'Error', message: e?.message || 'Failed to save delivery. Please try again.', type: 'error' });
    }
  }

  const delivTotal = form.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);

  return (
    <View style={{ flex: 1 }}>
      <DateRangePicker range={range} setRange={setRange} customFrom={customFrom} setCustomFrom={setCustomFrom} customTo={customTo} setCustomTo={setCustomTo} />

      <TouchableOpacity style={[styles.addBtn, { margin: spacing.md }]} onPress={openNew}>
        <Text style={styles.addBtnText}>+ Record Delivery</Text>
      </TouchableOpacity>

      {/* Pending deliveries (Ordered / In Transit) */}
      {pendingHistory.length > 0 && (
        <View style={{ marginHorizontal: spacing.md, marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <MaterialIcons name="local-shipping" size={18} color="#1d4ed8" />
            <Text style={{ fontSize: 14, fontWeight: '800', color: '#1e3a5f', flex: 1 }}>{t('warehouse.sections.pendingDeliveries', 'Pending Deliveries')}</Text>
            <View style={{ backgroundColor: '#DBEAFE', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#1d4ed8' }}>{pendingHistory.length} active</Text>
            </View>
          </View>
          {pendingHistory.map(d => {
            const sc = DELIVERY_STATUS_COLORS[d.status] || DELIVERY_STATUS_COLORS['In Transit'];
            return (
              <TouchableOpacity key={String(d.id)} activeOpacity={0.7} onPress={() => openDeliveryDetail(d)}
                style={[styles.histCard, { borderLeftWidth: 3, borderLeftColor: sc.text }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.histTitle}>{d.supplierName || 'Unknown Supplier'}</Text>
                    <Text style={styles.histSub}>{fmtDelivDate(d.date)}  ·  {d.lines?.length || 0} item{(d.lines?.length || 0) !== 1 ? 's' : ''}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.histAmount}>{money(d.total)}</Text>
                    <View style={{ backgroundColor: sc.bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, marginTop: 4 }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: sc.text }}>{deliveryStatusLabel(d.status, t)}</Text>
                    </View>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 6 }}>
                  <MaterialIcons name="chevron-right" size={20} color="#94a3b8" />
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Period summary */}
      <View style={styles.periodSummary}>
        <Text style={styles.periodLabel}>Showing: {range}</Text>
        <View style={styles.periodStats}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <MaterialIcons name="local-offer" size={14} color={C.neutralMid} />
            <Text style={styles.periodStat}>{filtered.length} deliveries</Text>
          </View>
          <Text style={[styles.periodStat, { color: colors.admin, fontWeight: '800' }]}>Total: {money(periodTotal)}</Text>
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={d => String(d.id)}
        contentContainerStyle={[styles.listPad, { paddingTop: 0 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.admin} />}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <MaterialIcons name="local-shipping" size={48} color={C.border} style={{ marginBottom: 8 }} />
            <Text style={styles.emptyText}>{t('warehouse.empty.noDeliveries', 'No deliveries in this period')}</Text>
          </View>
        }
        renderItem={({ item: d }) => {
          const sc = DELIVERY_STATUS_COLORS[d.status] || DELIVERY_STATUS_COLORS['In Transit'];
          return (
            <TouchableOpacity activeOpacity={0.7} onPress={() => openDeliveryDetail(d)} style={styles.histCard}>
              {/* Top row: supplier + total */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.histTitle}>{d.supplierName || 'Unknown Supplier'}</Text>
                  <Text style={styles.histSub}>{fmtDelivDate(d.date)}  ·  {d.invoice || 'No invoice'}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.histAmount}>{money(d.total)}</Text>
                </View>
              </View>

              {/* Status badge + payment badge + Pay button */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={[styles.catBadge, { backgroundColor: sc.bg, paddingHorizontal: 10, paddingVertical: 4 }]}>
                    <Text style={[styles.catBadgeText, { color: sc.text, fontSize: 11 }]}>{deliveryStatusLabel(d.status || 'Delivered', t)}</Text>
                  </View>
                  <View style={[styles.catBadge, {
                    backgroundColor: d.paymentStatus === 'paid' ? '#dcfce7' : '#fee2e2',
                    paddingHorizontal: 8, paddingVertical: 4,
                  }]}>
                    <Text style={[styles.catBadgeText, {
                      color: d.paymentStatus === 'paid' ? '#15803d' : '#dc2626', fontSize: 11,
                    }]}>
                      {d.paymentStatus === 'paid' ? `✓ ${t('warehouse.paymentStatus.paid', 'Paid')}` : t('warehouse.paymentStatus.unpaid', 'Unpaid')}
                    </Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {d.paymentStatus !== 'paid' && ['Delivered', 'Partial'].includes(d.status) && (
                    <TouchableOpacity
                      onPress={(e) => { e.stopPropagation && e.stopPropagation(); openPayDelivery(d); }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: '#dcfce7', borderWidth: 1, borderColor: '#bbf7d0' }}
                    >
                      <MaterialIcons name="payments" size={13} color="#15803d" />
                      <Text style={{ fontSize: 12, color: '#15803d', fontWeight: '700' }}>Pay</Text>
                    </TouchableOpacity>
                  )}
                  <MaterialIcons name="chevron-right" size={20} color={C.neutralMid} />
                </View>
              </View>

              {/* Due date indicator for unpaid deliveries */}
              {d.paymentStatus !== 'paid' && d.paymentDueDate && (() => {
                const now = new Date(); now.setHours(0,0,0,0);
                const due = new Date(d.paymentDueDate + 'T00:00:00'); due.setHours(0,0,0,0);
                const diffDays = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
                const isOverdue = diffDays < 0;
                const isDueSoon = diffDays >= 0 && diffDays <= 3;
                return (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6,
                    backgroundColor: isOverdue ? '#fef2f2' : isDueSoon ? '#fffbeb' : '#f0fdf4',
                    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, alignSelf: 'flex-start',
                    borderWidth: 1, borderColor: isOverdue ? '#fecaca' : isDueSoon ? '#fde68a' : '#bbf7d0',
                  }}>
                    <MaterialIcons name={isOverdue ? 'error' : 'schedule'} size={13}
                      color={isOverdue ? '#dc2626' : isDueSoon ? '#d97706' : '#16a34a'} />
                    <Text style={{ fontSize: 11, fontWeight: '700',
                      color: isOverdue ? '#dc2626' : isDueSoon ? '#d97706' : '#16a34a',
                    }}>
                      {isOverdue ? `Overdue by ${Math.abs(diffDays)} day${Math.abs(diffDays) !== 1 ? 's' : ''}` :
                       diffDays === 0 ? 'Due today' :
                       `Due in ${diffDays} day${diffDays !== 1 ? 's' : ''}`}
                    </Text>
                  </View>
                );
              })()}

              {/* Payment details (for paid) */}
              {d.paymentStatus === 'paid' && d.paidAt && (
                <Text style={{ fontSize: 10, color: C.neutralMid, marginTop: 4 }}>Paid {fmtDelivDate(d.paidAt)}</Text>
              )}
            </TouchableOpacity>
          );
        }}
        ListFooterComponent={
          <View style={{ marginTop: 16, marginBottom: 20 }}>
            <View style={{ backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e5e7eb', overflow: 'hidden' }}>
              <View style={{ backgroundColor: '#f9fafb', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#374151' }}>Stock Receipts (Movement Log)</Text>
              </View>
              {/* Table header */}
              <View style={{ flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#f9fafb', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' }}>
                <Text style={{ flex: 2, fontSize: 10, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase' }}>Item</Text>
                <Text style={{ flex: 1, fontSize: 10, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', textAlign: 'center' }}>Qty</Text>
                <Text style={{ flex: 1.5, fontSize: 10, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', textAlign: 'right' }}>Cost</Text>
              </View>
              {filteredReceipts.length > 0 ? filteredReceipts.map(m => {
                const name = m.item_name || m.itemName || '';
                const qty = parseFloat(m.quantity) || 0;
                const cost = qty * (parseFloat(m.cost_per_unit || m.costPerUnit) || 0);
                const reason = m.reason || '';
                const _ts = new Date(m.created_at || m.createdAt || '');
                const date = isNaN(_ts) ? '' : `${_ts.getFullYear()}-${String(_ts.getMonth()+1).padStart(2,'0')}-${String(_ts.getDate()).padStart(2,'0')}`;
                return (
                  <View key={m.id} style={{ paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={{ flex: 2 }}>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: '#111827' }}>{name}</Text>
                        <Text style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>{date}</Text>
                      </View>
                      <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: '#15803d', textAlign: 'center' }}>+{qty}</Text>
                      <Text style={{ flex: 1.5, fontSize: 12, fontWeight: '600', color: '#374151', textAlign: 'right' }}>{money(cost)}</Text>
                    </View>
                    {reason ? <Text style={{ fontSize: 10, color: '#6b7280', marginTop: 4 }} numberOfLines={1}>{reason}</Text> : null}
                  </View>
                );
              }) : (
                <View style={{ padding: 20, alignItems: 'center' }}>
                  <Text style={{ fontSize: 12, color: '#9ca3af' }}>{t('warehouse.empty.noReceipts', 'No receipts in this period')}</Text>
                </View>
              )}
            </View>
          </View>
        }
      />

      {/* Add / Edit sheet */}
      <Sheet visible={sheet} onClose={closeSheet} title={editingDelivery ? t('warehouse.editDelivery','Edit Delivery') : t('warehouse.recordDelivery','Record Delivery')} tall>
        <Field label={t('warehouse.fields.supplier', 'Supplier')}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
            {suppliers.map(s => (
              <TouchableOpacity key={s.id} style={[styles.pickerPill, form.supplierId === s.id && styles.pickerPillActive]} onPress={() => setForm(p => ({ ...p, supplierId: s.id, supplierName: s.name }))}>
                <Text style={[styles.pickerPillText, form.supplierId === s.id && styles.pickerPillTextActive]}>{s.name}</Text>
              </TouchableOpacity>
            ))}
            {suppliers.length === 0 && <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>No suppliers yet. Add one in the Suppliers tab.</Text>}
          </ScrollView>
        </Field>

        <View style={{ flexDirection: 'row', gap: 10, marginHorizontal: spacing.lg, marginBottom: spacing.md }}>
          <View style={{ flex: 1 }}>
            <DateField label="Date" value={form.date} onChange={v => setForm(p => ({ ...p, date: v || todayStr() }))} placeholder={t('warehouse.tapPickDate','Tap to pick date')} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>Invoice #</Text>
            <TInput value={form.invoice} onChangeText={v => setForm(p => ({ ...p, invoice: v }))} placeholder={t('warehouse.invoiceNumber','INV-001')} />
          </View>
        </View>

        {/* Delivery status — lets users track in-transit orders */}
        <Field label={t('warehouse.fields.deliveryStatus', 'Delivery Status')}>
          <PickerRow options={DELIVERY_STATUSES} value={form.status} onSelect={v => setForm(p => ({ ...p, status: v }))} labels={DELIVERY_STATUSES.map(s => deliveryStatusLabel(s, t))} />
        </Field>

        {/* Payment status — compact toggle buttons */}
        <View style={{ marginHorizontal: spacing.lg, marginBottom: spacing.md }}>
          <Text style={[styles.fieldLabel, { marginBottom: 6 }]}>Payment Status</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              onPress={() => setForm(p => ({ ...p, paymentStatus: 'unpaid' }))}
              activeOpacity={0.8}
              style={{
                flex: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12,
                backgroundColor: form.paymentStatus === 'unpaid' ? '#FEF2F2' : C.neutralLight,
                borderWidth: 1.5,
                borderColor: form.paymentStatus === 'unpaid' ? C.danger : C.border,
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              <MaterialIcons name="schedule" size={18} color={form.paymentStatus === 'unpaid' ? C.danger : C.neutralMid} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: form.paymentStatus === 'unpaid' ? C.danger : C.neutralMid }}>{t('warehouse.paymentStatus.unpaid', 'Unpaid')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setForm(p => ({ ...p, paymentStatus: 'paid' }))}
              activeOpacity={0.8}
              style={{
                flex: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12,
                backgroundColor: form.paymentStatus === 'paid' ? '#F0FDF4' : C.neutralLight,
                borderWidth: 1.5,
                borderColor: form.paymentStatus === 'paid' ? C.success : C.border,
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              <MaterialIcons name="check-circle" size={18} color={form.paymentStatus === 'paid' ? C.success : C.neutralMid} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: form.paymentStatus === 'paid' ? C.success : C.neutralMid }}>{t('warehouse.paymentStatus.paid', 'Paid')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Payment Due Date — only visible when unpaid */}
        {form.paymentStatus === 'unpaid' && (
          <View style={{ marginHorizontal: spacing.lg, marginBottom: spacing.md }}>
            <DateField
              label="Payment Due Date (optional)"
              value={form.paymentDueDate}
              onChange={v => setForm(p => ({ ...p, paymentDueDate: v || '' }))}
              placeholder={t('warehouse.tapSetDueDate','Tap to set due date')}
            />
          </View>
        )}

        <Field label={t('warehouse.fields.notesOptional', 'Notes (optional)')}>
          <TInput value={form.notes} onChangeText={v => setForm(p => ({ ...p, notes: v }))} placeholder={t('warehouse.egPartialShipment','e.g. Partial shipment, driver called…')} multiline />
        </Field>

        <Field label={t('warehouse.fields.items', 'Items')}>
          {/* Item name with autocomplete */}
          <View style={{ marginBottom: 8 }}>
            <TextInput
              style={[styles.tInput, { fontSize: 14 }]}
              value={lineItem}
              onChangeText={setLineItem}
              placeholder={t('warehouse.searchOrTypeItem','Search or type item name...')}
              placeholderTextColor={colors.textMuted}
            />
            {lineItem.length > 0 && (() => {
              const q = lineItem.toLowerCase();
              const matches = items.filter(it => it.name && it.name.toLowerCase().includes(q) && it.name.toLowerCase() !== q);
              return matches.length > 0 ? (
                <View style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: C.border, borderRadius: 10, marginTop: 4, overflow: 'hidden' }}>
                  {matches.slice(0, 5).map(it => (
                    <TouchableOpacity
                      key={it.id}
                      style={{ paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', flexDirection: 'row', alignItems: 'center', gap: 8 }}
                      onPress={() => {
                        setLineItem(it.name);
                        if (it.unit) setLineUnit(it.unit);
                        if (it.costPerUnit || it.cost_per_unit) setLinePrice(String(it.costPerUnit || it.cost_per_unit));
                      }}
                    >
                      <MaterialIcons name="inventory-2" size={14} color={C.primary} />
                      <Text style={{ fontSize: 13, fontWeight: '600', color: C.neutralDark, flex: 1 }}>{it.name}</Text>
                      {it.unit && <Text style={{ fontSize: 11, color: C.neutralMid }}>{it.unit}</Text>}
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null;
            })()}
          </View>

          {/* Qty, Unit dropdown, Price, Add button */}
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <TextInput style={[styles.tInput, { flex: 1 }]} value={lineQty} onChangeText={setLineQty} placeholder={t('warehouse.qty','Qty')} keyboardType="decimal-pad" placeholderTextColor={colors.textMuted} />
            {/* Unit dropdown — tap to show list */}
            <TouchableOpacity
              onPress={() => setUnitPickerOpen(true)}
              style={{
                flex: 1, paddingHorizontal: 10, paddingVertical: 11,
                backgroundColor: '#EFF6FF', borderRadius: 10, borderWidth: 1, borderColor: '#BFDBFE',
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#1d4ed8' }}>{lineUnit}</Text>
              <MaterialIcons name="arrow-drop-down" size={18} color="#1d4ed8" />
            </TouchableOpacity>
            <TextInput style={[styles.tInput, { flex: 1 }]} value={linePrice} onChangeText={setLinePrice} placeholder={t('warehouse.price','Price')} keyboardType="decimal-pad" placeholderTextColor={colors.textMuted} />
            <TouchableOpacity style={[styles.addLineBtn, { width: 42, height: 42 }]} onPress={addLine}><Text style={styles.addLineBtnText}>+</Text></TouchableOpacity>
          </View>

          {/* Expiry date */}
          <View style={{ marginTop: 8 }}>
            <DateField value={lineExpiry} onChange={setLineExpiry} placeholder={t('warehouse.expiryDateOptionalShort','Expiry date (optional)')} />
          </View>
        </Field>

        {form.lines.length > 0 && (
          <View style={styles.linesBox}>
            {form.lines.map((l, i) => (
              <View key={i} style={styles.lineRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.lineRowName} numberOfLines={1}>{l.itemName}</Text>
                  {l.expiry_date ? <Text style={{ fontSize: 10, color: C.warning, marginTop: 1 }}>Exp: {l.expiry_date}</Text> : null}
                </View>
                <Text style={styles.lineRowQty}>×{l.qty} {l.unit || ''}</Text>
                <Text style={styles.lineRowPrice}>{money(l.unitPrice)}</Text>
                <Text style={styles.lineRowSub}>{money(l.qty * l.unitPrice)}</Text>
                <TouchableOpacity onPress={() => removeLine(i)}><MaterialIcons name="close" size={18} color={C.danger} /></TouchableOpacity>
              </View>
            ))}
            <View style={[styles.lineRow, { borderTopWidth: 1, borderTopColor: colors.border, marginTop: 4, paddingTop: 8 }]}>
              <Text style={{ flex: 1, fontWeight: '700', color: colors.textDark }}>Total</Text>
              <Text style={{ fontWeight: '800', color: colors.admin }}>{money(delivTotal)}</Text>
            </View>
          </View>
        )}

        <View style={{ gap: 8, marginTop: 8 }}>
          <SaveBtn onPress={saveDelivery} label={editingDelivery ? 'Update Delivery' : 'Save Delivery'} loading={saving} />
          <CancelBtn onPress={closeSheet} />
        </View>
      </Sheet>

      {/* Unit Picker Modal */}
      <Modal visible={unitPickerOpen} transparent animationType="fade" onRequestClose={() => setUnitPickerOpen(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }} activeOpacity={1} onPress={() => setUnitPickerOpen(false)}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 30 }}>
            <View style={{ alignItems: 'center', paddingVertical: 12 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB' }} />
            </View>
            <Text style={{ fontSize: 15, fontWeight: '800', color: C.neutralDark, textAlign: 'center', marginBottom: 12 }}>{t('warehouse.fields.measurementUnit', 'Measurement Unit')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16 }}>
              {DELIVERY_UNITS.map(u => (
                <TouchableOpacity
                  key={u}
                  onPress={() => { setLineUnit(u); setUnitPickerOpen(false); }}
                  style={{
                    paddingHorizontal: 16, paddingVertical: 10,
                    borderRadius: 10, borderWidth: 1.5,
                    backgroundColor: lineUnit === u ? '#EFF6FF' : '#F9FAFB',
                    borderColor: lineUnit === u ? '#3B82F6' : '#E5E7EB',
                    minWidth: 60, alignItems: 'center',
                  }}
                >
                  <Text style={{
                    fontSize: 14, fontWeight: lineUnit === u ? '700' : '500',
                    color: lineUnit === u ? '#1d4ed8' : C.neutralDark,
                  }}>{u}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Payment Sheet */}
      <Sheet visible={paySheet} onClose={() => setPaySheet(false)} title={payStep === 'form' ? t('warehouse.sections.recordPayment', 'Record Payment') : t('warehouse.sections.confirmPayment', 'Confirm Payment')}>
        {payTarget && payStep === 'form' && (
          <>
            {/* Delivery summary */}
            <View style={{ backgroundColor: '#F9FAFB', borderRadius: 12, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: C.border }}>
              <Text style={{ fontSize: 11, color: C.neutralMid }}>Supplier</Text>
              <Text style={{ fontSize: 15, fontWeight: '800', color: C.neutralDark }}>{payTarget.supplierName}</Text>
              <Text style={{ fontSize: 11, color: C.neutralMid, marginTop: 6 }}>Amount</Text>
              <Text style={{ fontSize: 20, fontWeight: '800', color: C.success }}>{money(payTarget.total)}</Text>
            </View>
            {/* Payment method */}
            <Field label="Payment Method *">
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {PAY_METHODS.map(m => {
                  const active = payMethod === m;
                  return (
                    <TouchableOpacity key={m} onPress={() => setPayMethod(m)}
                      style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 2, borderColor: active ? C.success : C.border, backgroundColor: active ? '#F0FDF4' : C.neutralLight }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: active ? '#15803d' : C.neutralMid }}>{payMethodLabel(m, t)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </Field>
            {/* Payment Date */}
            <Field label="Payment Date *">
              <TouchableOpacity
                onPress={() => {
                  const parts = payDate.split('-');
                  const d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
                  setPayDatePickerDate(d);
                  setPayDatePickerOpen(true);
                }}
                style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.neutralLight, borderRadius: 12, borderWidth: 2, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 12 }}>
                <MaterialIcons name="event" size={20} color={C.admin} style={{ marginRight: 8 }} />
                <Text style={{ fontSize: 14, fontWeight: '700', color: C.neutralDark }}>{payDate || 'Select date'}</Text>
              </TouchableOpacity>
            </Field>
            {/* Invoice / Cheque */}
            <Field label="Invoice / Cheque (optional)">
              <TInput value={payNote} onChangeText={setPayNote} placeholder={t('warehouse.egInvoice','e.g. INV-2026-0042')} />
            </Field>
            <View style={{ gap: 8, marginTop: 8 }}>
              <SaveBtn onPress={() => setPayStep('confirm')} label="Continue" />
              <CancelBtn onPress={() => setPaySheet(false)} />
            </View>
          </>
        )}
        {payTarget && payStep === 'confirm' && (
          <>
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#F0FDF4', justifyContent: 'center', alignItems: 'center', marginBottom: 10 }}>
                <MaterialIcons name="check-circle" size={32} color={C.success} />
              </View>
              <Text style={{ fontSize: 16, fontWeight: '800', color: C.neutralDark }}>{t('warehouse.sections.confirmPayment', 'Confirm Payment')}</Text>
              <Text style={{ fontSize: 12, color: C.neutralMid, marginTop: 4 }}>Has this payment been made?</Text>
            </View>
            <View style={{ backgroundColor: '#F9FAFB', borderRadius: 12, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: C.border, gap: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 12, color: C.neutralMid }}>Supplier</Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: C.neutralDark }}>{payTarget.supplierName}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 12, color: C.neutralMid }}>Amount</Text>
                <Text style={{ fontSize: 13, fontWeight: '800', color: C.success }}>{money(payTarget.total)}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 12, color: C.neutralMid }}>Method</Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: C.neutralDark }}>{payMethod}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 12, color: C.neutralMid }}>Payment Date</Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: C.neutralDark }}>{payDate}</Text>
              </View>
              {payNote ? (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 12, color: C.neutralMid }}>Invoice/Cheque</Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: C.neutralDark }}>{payNote}</Text>
                </View>
              ) : null}
            </View>
            <View style={{ gap: 8 }}>
              <SaveBtn onPress={confirmPayDelivery} label="Yes, Payment Made" />
              <CancelBtn onPress={() => setPayStep('form')} label="No, Go Back" />
            </View>
          </>
        )}
      </Sheet>

      {/* Payment Date Picker Modal */}
      <Modal visible={payDatePickerOpen} animationType="slide" transparent onRequestClose={() => setPayDatePickerOpen(false)} statusBarTranslucent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, width: '90%', maxWidth: 360, padding: 16 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: C.neutralDark }}>Payment Date</Text>
              <TouchableOpacity onPress={() => setPayDatePickerOpen(false)}>
                <MaterialIcons name="close" size={22} color={C.neutralMid} />
              </TouchableOpacity>
            </View>
            {(() => {
              const vd = payDatePickerDate;
              const vy = vd.getFullYear();
              const vm = vd.getMonth();
              const firstDow = (new Date(vy, vm, 1).getDay() + 6) % 7;
              const dim = new Date(vy, vm + 1, 0).getDate();
              const cells = [];
              for (let i = 0; i < firstDow; i++) cells.push(null);
              for (let d = 1; d <= dim; d++) cells.push(d);
              while (cells.length % 7 !== 0) cells.push(null);
              const weeks = [];
              for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
              const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
              const selParts = payDate ? payDate.split('-') : [];
              const selY = selParts[0] ? +selParts[0] : null;
              const selM = selParts[1] ? +selParts[1] - 1 : null;
              const selD = selParts[2] ? +selParts[2] : null;
              return (
                <>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <TouchableOpacity onPress={() => setPayDatePickerDate(new Date(vy, vm - 1, 1))}>
                      <MaterialIcons name="chevron-left" size={28} color={C.neutralDark} />
                    </TouchableOpacity>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: C.neutralDark }}>{months[vm]} {vy}</Text>
                    <TouchableOpacity onPress={() => setPayDatePickerDate(new Date(vy, vm + 1, 1))}>
                      <MaterialIcons name="chevron-right" size={28} color={C.neutralDark} />
                    </TouchableOpacity>
                  </View>
                  <View style={{ flexDirection: 'row', marginBottom: 4 }}>
                    {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(d => (
                      <View key={d} style={{ flex: 1, alignItems: 'center' }}>
                        <Text style={{ fontSize: 11, color: C.neutralMid, fontWeight: '600' }}>{d}</Text>
                      </View>
                    ))}
                  </View>
                  {weeks.map((week, wi) => (
                    <View key={wi} style={{ flexDirection: 'row', marginBottom: 2 }}>
                      {week.map((day, di) => {
                        if (!day) return <View key={di} style={{ flex: 1, height: 36 }} />;
                        const isSel = vy === selY && vm === selM && day === selD;
                        return (
                          <TouchableOpacity key={di} onPress={() => {
                            const ds = `${vy}-${String(vm + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                            setPayDate(ds);
                            setPayDatePickerOpen(false);
                          }} style={{ flex: 1, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', backgroundColor: isSel ? C.success : 'transparent' }}>
                            <Text style={{ fontSize: 13, fontWeight: isSel ? '800' : '500', color: isSel ? '#fff' : C.neutralDark }}>{day}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ))}
                </>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* ── Delivery Detail Sheet ──────────────────────────────────── */}
      <Modal visible={detailSheet} transparent animationType="slide" onRequestClose={() => setDetailSheet(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%', paddingBottom: 30 }}>
            {/* Header */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: '#111827' }}>{detailDelivery?.supplierName || ''}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  {detailDelivery && (() => {
                    const sc = DELIVERY_STATUS_COLORS[detailDelivery.status] || DELIVERY_STATUS_COLORS['In Transit'];
                    return (
                      <View style={[styles.catBadge, { backgroundColor: sc.bg, paddingHorizontal: 8, paddingVertical: 3 }]}>
                        <Text style={[styles.catBadgeText, { color: sc.text, fontSize: 11 }]}>{deliveryStatusLabel(detailDelivery.status, t)}</Text>
                      </View>
                    );
                  })()}
                  <Text style={{ fontSize: 15, fontWeight: '800', color: '#111827' }}>{money(detailDelivery?.total || 0)}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setDetailSheet(false)} style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' }}>
                <MaterialIcons name="close" size={18} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ paddingHorizontal: 20 }} showsVerticalScrollIndicator={false}>
              {/* Change Status */}
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#6b7280', marginTop: 16, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Change Status</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {['Ordered', 'In Transit', 'Partial', 'Delivered', 'Cancelled'].map(s => (
                  <TouchableOpacity key={s} disabled={s === detailDelivery?.status}
                    onPress={() => {
                      Alert.alert(
                        'Change Status',
                        `Change status from "${detailDelivery?.status}" to "${s}"?`,
                        [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Confirm', onPress: () => handleChangeStatus(detailDelivery?.id, s) },
                        ]
                      );
                    }}
                    style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5,
                      backgroundColor: s === detailDelivery?.status ? '#eff6ff' : '#f9fafb',
                      borderColor: s === detailDelivery?.status ? '#3b82f6' : '#e5e7eb',
                    }}>
                    <Text style={{ fontSize: 12, fontWeight: '700',
                      color: s === detailDelivery?.status ? '#3b82f6' : '#6b7280',
                    }}>{deliveryStatusLabel(s, t)}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Items */}
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#6b7280', marginTop: 20, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Delivery Items
              </Text>
              {detailLoading ? (
                <ActivityIndicator size="small" color={C.primary} style={{ marginVertical: 20 }} />
              ) : detailItems.length > 0 ? (
                detailItems.map(item => {
                  const isInTransit = ['Ordered', 'In Transit'].includes(detailDelivery?.status);
                  return (
                    <View key={item.id} style={{ backgroundColor: item.removed ? '#fef2f2' : '#f9fafb', borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: item.removed ? '#fecaca' : '#e5e7eb', opacity: item.removed ? 0.6 : 1 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, fontWeight: '700', color: item.removed ? '#dc2626' : '#111827', textDecorationLine: item.removed ? 'line-through' : 'none' }}>{item.itemName}</Text>
                          <View style={{ flexDirection: 'row', gap: 12, marginTop: 3 }}>
                            <Text style={{ fontSize: 12, color: '#6b7280' }}>{item.qty} {item.unit}</Text>
                            {item.unitPrice > 0 && <Text style={{ fontSize: 12, color: '#6b7280' }}>{money(item.unitPrice)}/unit</Text>}
                            <Text style={{ fontSize: 12, fontWeight: '700', color: '#111827' }}>{money(item.qty * item.unitPrice)}</Text>
                          </View>
                          {item.removed && <Text style={{ fontSize: 11, color: '#dc2626', marginTop: 2 }}>Removed: {item.removeReason}</Text>}
                        </View>
                        {isInTransit && !item.removed && (
                          <View style={{ flexDirection: 'row', gap: 6 }}>
                            <TouchableOpacity onPress={() => handleAdjustQty(item.id, item.itemName, item.qty)}
                              style={{ paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a' }}>
                              <Text style={{ fontSize: 11, fontWeight: '700', color: '#d97706' }}>Adjust</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => handleRemoveItem(item.id, item.itemName)}
                              style={{ paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca' }}>
                              <Text style={{ fontSize: 11, fontWeight: '700', color: '#dc2626' }}>Remove</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })
              ) : (
                <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                  <MaterialIcons name="inventory-2" size={32} color="#d1d5db" />
                  <Text style={{ fontSize: 13, color: '#9ca3af', marginTop: 6 }}>{t('warehouse.empty.noItemsRecorded', 'No items recorded')}</Text>
                </View>
              )}

              {/* Footer actions */}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 16, marginBottom: 20 }}>
                {detailDelivery?.paymentStatus !== 'paid' && ['Delivered', 'Partial'].includes(detailDelivery?.status) && (
                  <TouchableOpacity onPress={() => { setDetailSheet(false); setTimeout(() => openPayDelivery(detailDelivery), 300); }}
                    style={{ flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: '#16a34a', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}>
                    <MaterialIcons name="payments" size={16} color="#fff" />
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>Mark Paid</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => setDetailSheet(false)}
                  style={{ flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: '#f1f5f9', alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0' }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#6b7280' }}>Close</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 3 — STOCK OUTPUT (with kitchen analytics)
// ═══════════════════════════════════════════════════════════════════════════════
function StockOutputTab({ items, onRefresh, setDialog }) {
  const { t } = useTranslation();
  const [movements,     setMovements]     = useState([]);
  const [movLoading,    setMovLoading]    = useState(false);
  const [movRefreshing, setMovRefreshing] = useState(false);
  const [sheet, setSheet]           = useState(false);
  const [saving, setSaving]         = useState(false);
  const [range, setRange]           = useState('Today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo]     = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [rangePickerOpen, setRangePickerOpen] = useState(false);
  const [analyticsEntry, setAnalyticsEntry] = useState(null);

  const today = todayStr();
  const APP_OUT_REASONS   = ['Kitchen Use', 'Transfer', 'Cleaning', 'Staff Meal', 'Sample'];
  const APP_WASTE_REASONS = ['Expired', 'Spoilage', 'Broken', 'Damaged', 'Quality Issue'];
  const APP_ADJ_REASONS   = ['Overcount', 'Undercount', 'Spillage', 'Audit Correction', 'Theft', 'Breakage'];
  const APP_TYPES = [
    { value: 'OUT', label: 'Consumption' },
    { value: 'WASTE', label: 'Waste' },
    { value: 'ADJUST', label: 'Adjustment' },
  ];
  function appReasonsFor(type) {
    if (type === 'WASTE') return APP_WASTE_REASONS;
    if (type === 'ADJUST') return APP_ADJ_REASONS;
    return APP_OUT_REASONS;
  }
  const blankForm = () => ({ itemId: '', itemName: '', qty: '', reason: 'Kitchen Use', type: 'OUT', date: today, search: '' });
  const [form, setForm] = useState(blankForm());
  const fi = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // Collapse/expand state
  const [summaryOpen,    setSummaryOpen]    = useState(true);
  const [collapsedGroups, setCollapsedGroups] = useState(new Set());
  function toggleGroup(name) {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }

  // Load movements from backend on mount and after changes
  const loadMovements = useCallback(async (isPullRefresh = false) => {
    if (isPullRefresh) setMovRefreshing(true);
    else setMovLoading(true);
    try {
      const res = await warehouseAPI.getMovements({});
      // Filter to only output-related movement types (OUT, WASTE, ADJUST, SHRINKAGE)
      const all = res.data || [];
      setMovements(all.filter(m => ['OUT', 'WASTE', 'ADJUST', 'SHRINKAGE'].includes(m.type)));
    } catch { /* silent */ }
    finally { setMovLoading(false); setMovRefreshing(false); }
  }, []);

  useEffect(() => { loadMovements(); }, [loadMovements]);

  // Normalise backend movements into the same shape as the old local entries
  const allOutputs = movements.map(m => ({
    id:           m.id,
    itemId:       m.item_id,
    itemName:     m.item_name,
    qty:          parseFloat(m.quantity),
    costPerUnit:  parseFloat(m.cost_per_unit || 0),
    type:         m.type,
    reason:       m.reason?.startsWith('Auto:') ? 'Kitchen Use' : (m.reason || 'Manual'),
    date:         m.created_at ? (() => { const d = new Date(m.created_at); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })() : today,
    note:         m.reason || '',
    isAuto:       !!(m.reason?.startsWith('Auto:')),
    unit:         m.unit,
  }));

  const { from, to } = getDateRange(range, customFrom, customTo);
  const filtered = allOutputs.filter(o => {
    if (!inRange(o.date, from, to)) return false;
    if (typeFilter && o.type !== typeFilter) return false;
    return true;
  });

  const periodQty   = filtered.reduce((s, o) => s + toNum(o.qty), 0);
  // Use cost_per_unit from the movement itself (captured at movement time) — reliable even if price changes later
  const periodCost  = filtered.reduce((s, o) => {
    const unitCost = toNum(o.costPerUnit) || toNum((items.find(x => x.name.toLowerCase() === o.itemName.toLowerCase()))?.cost_per_unit);
    return s + toNum(o.qty) * unitCost;
  }, 0);

  // Kitchen usage summary for the period
  const kitchenFiltered = filtered.filter(o => o.reason === 'Kitchen Use');
  const ingMap = {};
  kitchenFiltered.forEach(o => {
    const unitCost = toNum(o.costPerUnit) || toNum((items.find(x => x.name.toLowerCase() === o.itemName.toLowerCase()))?.cost_per_unit);
    const cost = toNum(o.qty) * unitCost;
    if (!ingMap[o.itemName]) ingMap[o.itemName] = { name: o.itemName, qty: 0, cost: 0, count: 0 };
    ingMap[o.itemName].qty   += toNum(o.qty);
    ingMap[o.itemName].cost  += cost;
    ingMap[o.itemName].count += 1;
  });
  const top5 = Object.values(ingMap).sort((a, b) => b.cost - a.cost).slice(0, 5);
  const kitchenTotal = Object.values(ingMap).reduce((s, v) => s + v.cost, 0);

  // ── Group auto movements by menu item ────────────────────────────────────
  function extractMenuItem(note) {
    // "Auto: Order #1 — 2x baliq"  →  "baliq"
    const m = note?.match(/—\s*\d+x\s+(.+)$/);
    return m ? m[1].trim() : 'Other';
  }
  const autoFiltered   = filtered.filter(o => o.isAuto);
  const manualFiltered = filtered.filter(o => !o.isAuto);

  const menuGroupMap = {};
  autoFiltered.forEach(o => {
    const menuItem = extractMenuItem(o.note);
    if (!menuGroupMap[menuItem]) menuGroupMap[menuItem] = { menuItem, ingredients: {}, orderNums: new Set(), totalCost: 0 };
    const g = menuGroupMap[menuItem];
    const orderMatch = o.note?.match(/Order #(\S+)/);
    if (orderMatch) g.orderNums.add(orderMatch[1]);
    if (!g.ingredients[o.itemName]) {
      const uc = toNum(o.costPerUnit) || toNum(items.find(x => x.name.toLowerCase() === o.itemName.toLowerCase())?.cost_per_unit);
      g.ingredients[o.itemName] = { name: o.itemName, qty: 0, unit: o.unit || '', cost: 0, unitCost: uc };
    }
    const uc = g.ingredients[o.itemName].unitCost;
    g.ingredients[o.itemName].qty  += toNum(o.qty);
    g.ingredients[o.itemName].cost += toNum(o.qty) * uc;
    g.totalCost += toNum(o.qty) * uc;
  });
  const menuGroups = Object.values(menuGroupMap).sort((a, b) => b.totalCost - a.totalCost);

  async function saveOutput() {
    if (!form.itemId || toNum(form.qty) <= 0) {
      setDialog({ title: 'Required', message: 'Select an item and enter a valid quantity', type: 'warning' });
      return;
    }
    if (!form.reason) { setDialog({ title: 'Required', message: 'Select a reason', type: 'warning' }); return; }
    setSaving(true);
    try {
      if (form.type === 'OUT') {
        await warehouseAPI.consume({ item_id: form.itemId, quantity: toNum(form.qty), reason: form.reason });
      } else {
        await warehouseAPI.adjust(form.itemId, { quantity: toNum(form.qty), reason: form.reason, is_waste: form.type === 'WASTE' });
      }
      setSheet(false);
      onRefresh();
      loadMovements(); // reload from backend to pick up the new movement
    } catch (e) { setDialog({ title: 'Error', message: e.response?.data?.error || e.message, type: 'error' }); }
    setSaving(false);
  }


  const OUTPUT_TYPES = [
    { value: '', label: 'All' },
    { value: 'OUT', label: 'Consumption' },
    { value: 'WASTE', label: 'Waste' },
    { value: 'ADJUST', label: 'Adjust' },
    { value: 'SHRINKAGE', label: 'Shrinkage' },
  ];

  // Build display label for date range
  const rangeLabel = range === 'Custom'
    ? (customFrom && customTo
      ? (customFrom === customTo ? customFrom : `${customFrom} → ${customTo}`)
      : 'Select dates')
    : range;

  // ── Statistics breakdown by type ──
  const wasteFiltered  = filtered.filter(o => o.type === 'WASTE');
  const adjustFiltered = filtered.filter(o => o.type === 'ADJUST');
  const outFiltered    = filtered.filter(o => o.type === 'OUT');
  const shrinkFiltered = filtered.filter(o => o.type === 'SHRINKAGE');

  const calcCost = (arr) => arr.reduce((s, o) => {
    const uc = toNum(o.costPerUnit) || toNum(items.find(x => x.name.toLowerCase() === o.itemName.toLowerCase())?.cost_per_unit);
    return s + toNum(o.qty) * uc;
  }, 0);
  const outCost    = calcCost(outFiltered);
  const wasteCost  = calcCost(wasteFiltered);
  const adjustCost = calcCost(adjustFiltered);
  const shrinkCost = calcCost(shrinkFiltered);

  return (
    <View style={{ flex: 1 }}>
      <RangePickerModal
        visible={rangePickerOpen}
        onClose={() => setRangePickerOpen(false)}
        from={customFrom || getWhTodayStr()}
        to={customTo || getWhTodayStr()}
        onChange={(f, t) => { setCustomFrom(f); setCustomTo(t); setRange('Custom'); }}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={
          <RefreshControl
            refreshing={movRefreshing}
            onRefresh={() => loadMovements(true)}
            tintColor={C.primary}
          />
        }
      >

        {/* ── 1. Record Output button (at top) ── */}
        <TouchableOpacity
          style={{ backgroundColor: C.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginHorizontal: 14, marginTop: 14, ...shadow.sm }}
          onPress={() => { setForm(blankForm()); setSheet(true); }}
          activeOpacity={0.8}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <MaterialIcons name="add-circle-outline" size={20} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>{t('warehouse.recordOutput', 'Record Output')}</Text>
          </View>
        </TouchableOpacity>

        {/* ── 2. Today + Choose Period buttons (side by side) ── */}
        <View style={{ flexDirection: 'row', gap: 10, marginHorizontal: 14, marginTop: 12 }}>
          <TouchableOpacity
            style={{
              flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
              backgroundColor: range === 'Today' ? C.primary : C.card,
              borderRadius: 12, paddingVertical: 12,
              borderWidth: 1.5, borderColor: range === 'Today' ? C.primary : C.border,
              ...shadow.sm,
            }}
            onPress={() => { setRange('Today'); setCustomFrom(''); setCustomTo(''); }}
            activeOpacity={0.8}
          >
            <MaterialIcons name="today" size={18} color={range === 'Today' ? '#fff' : C.primary} />
            <Text style={{ fontSize: 14, fontWeight: '700', color: range === 'Today' ? '#fff' : C.neutralDark }}>{t('warehouse.outputTab.today', 'Today')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={{
              flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
              backgroundColor: range === 'Custom' ? C.primary : C.card,
              borderRadius: 12, paddingVertical: 12,
              borderWidth: 1.5, borderColor: range === 'Custom' ? C.primary : C.border,
              ...shadow.sm,
            }}
            onPress={() => setRangePickerOpen(true)}
            activeOpacity={0.8}
          >
            <MaterialIcons name="date-range" size={18} color={range === 'Custom' ? '#fff' : C.primary} />
            <Text style={{ fontSize: 14, fontWeight: '700', color: range === 'Custom' ? '#fff' : C.neutralDark }} numberOfLines={1}>
              {range === 'Custom' && customFrom ? (customFrom === customTo ? customFrom : `${customFrom.slice(5)} — ${customTo.slice(5)}`) : 'Choose Period'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── 3. Type filter pills ── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 14, paddingTop: 12 }}>
          {OUTPUT_TYPES.map(ot => {
            const active = typeFilter === ot.value;
            const tc = ot.value ? (TYPE_COLORS[ot.value] || { bg: '#f1f5f9', text: '#475569' }) : null;
            return (
              <TouchableOpacity
                key={ot.value}
                style={{
                  paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
                  backgroundColor: active ? (tc ? tc.bg : C.primary) : C.card,
                  borderWidth: 1.5,
                  borderColor: active ? (tc ? tc.text : C.primary) : C.border,
                }}
                onPress={() => setTypeFilter(ot.value)}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: active ? (tc ? tc.text : '#fff') : C.neutralMid }}>{ot.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* ── 4. Statistics cards ── */}
        <View style={{ marginHorizontal: 14, marginTop: 14 }}>
          {/* Main stats row */}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1, backgroundColor: C.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.border, ...shadow.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center' }}>
                  <MaterialIcons name="receipt-long" size={16} color={C.primary} />
                </View>
                <Text style={{ fontSize: 11, fontWeight: '600', color: C.neutralMid }}>{t('warehouse.outputTab.entries', 'Entries')}</Text>
              </View>
              <Text style={{ fontSize: 22, fontWeight: '800', color: C.neutralDark }}>{filtered.length}</Text>
              <Text style={{ fontSize: 11, color: C.neutralMid, marginTop: 2 }}>Qty: {fmtNum(periodQty)}</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: C.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#fee2e2', ...shadow.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: '#FEF2F2', justifyContent: 'center', alignItems: 'center' }}>
                  <MaterialIcons name="trending-down" size={16} color={C.danger} />
                </View>
                <Text style={{ fontSize: 11, fontWeight: '600', color: C.neutralMid }}>{t('warehouse.outputTab.totalCost', 'Total Cost')}</Text>
              </View>
              <Text style={{ fontSize: 18, fontWeight: '800', color: C.danger }} numberOfLines={1} adjustsFontSizeToFit>{money(periodCost)}</Text>
            </View>
          </View>

          {/* Breakdown row */}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            {[
              { label: 'Used',    count: outFiltered.length,    cost: outCost,    icon: 'restaurant', color: '#dc2626', bg: '#fee2e2' },
              { label: 'Waste',   count: wasteFiltered.length,  cost: wasteCost,  icon: 'delete-outline', color: '#b45309', bg: '#fef3c7' },
              { label: 'Adjust',  count: adjustFiltered.length, cost: adjustCost, icon: 'tune', color: '#4338ca', bg: '#e0e7ff' },
              ...(shrinkFiltered.length > 0 ? [{ label: 'Shrink', count: shrinkFiltered.length, cost: shrinkCost, icon: 'compress', color: '#be185d', bg: '#fce7f3' }] : []),
            ].map(s => (
              <View key={s.label} style={{ flex: 1, backgroundColor: C.card, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 8, alignItems: 'center', borderWidth: 1, borderColor: C.border }}>
                <View style={{ width: 24, height: 24, borderRadius: 7, backgroundColor: s.bg, justifyContent: 'center', alignItems: 'center', marginBottom: 6 }}>
                  <MaterialIcons name={s.icon} size={14} color={s.color} />
                </View>
                <Text style={{ fontSize: 14, fontWeight: '800', color: C.neutralDark }}>{s.count}</Text>
                <Text style={{ fontSize: 9, fontWeight: '600', color: C.neutralMid, marginTop: 1 }}>{s.label}</Text>
                {s.cost > 0 && <Text style={{ fontSize: 9, fontWeight: '700', color: s.color, marginTop: 2 }} numberOfLines={1}>{money(s.cost)}</Text>}
              </View>
            ))}
          </View>
        </View>

        {/* ── 5. Kitchen Usage Summary (collapsible) ── */}
        {top5.length > 0 && (
          <View style={ku.wrap}>
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
              onPress={() => setSummaryOpen(o => !o)}
              activeOpacity={0.7}
            >
              <MaterialIcons name="precision-manufacturing" size={16} color={C.neutralDark} />
              <Text style={[ku.title, { flex: 1 }]}>Kitchen Usage — {range}</Text>
              <MaterialIcons
                name={summaryOpen ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
                size={22}
                color={C.neutralMid}
              />
            </TouchableOpacity>

            {summaryOpen && (
              <>
                <Text style={[ku.totalLine, { marginTop: 8 }]}>
                  Total kitchen spend: <Text style={{ color: colors.admin, fontWeight: '800' }}>{money(kitchenTotal)}</Text>
                </Text>
                {top5.map((ing, i) => (
                  <TouchableOpacity
                    key={ing.name}
                    style={ku.row}
                    onPress={() => setAnalyticsEntry({ itemName: ing.name })}
                    activeOpacity={0.75}
                  >
                    <View style={ku.rank}><Text style={ku.rankTxt}>#{i + 1}</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={ku.ingName}>{ing.name}</Text>
                      <Text style={ku.ingSub}>{fmtNum(ing.qty)} used  ·  {ing.count} order{ing.count !== 1 ? 's' : ''}</Text>
                    </View>
                    <Text style={ku.ingCost}>{money(ing.cost)}</Text>
                    <Text style={ku.chevron}>›</Text>
                  </TouchableOpacity>
                ))}
              </>
            )}
          </View>
        )}

        {filtered.length === 0 ? (
          <View style={styles.emptyWrap}>
            <MaterialIcons name="trending-down" size={48} color={C.border} style={{ marginBottom: 8 }} />
            <Text style={styles.emptyText}>{t('warehouse.empty.noOutputs', 'No outputs in this period')}</Text>
          </View>
        ) : (
          <>
            {/* ── Kitchen use — grouped by menu item (each collapsible) ── */}
            {menuGroups.length > 0 && (
              <View style={{ marginHorizontal: spacing.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, marginBottom: 8 }}>
                  <MaterialIcons name="restaurant" size={14} color={C.neutralMid} />
                  <Text style={{ fontSize: 11, fontWeight: '800', color: C.neutralMid, textTransform: 'uppercase' }}>
                    Kitchen Use — by Menu Item
                  </Text>
                </View>
                {menuGroups.map(group => {
                  const isCollapsed = collapsedGroups.has(group.menuItem);
                  return (
                    <View key={group.menuItem} style={[styles.histCard, { marginBottom: spacing.sm }]}>
                      {/* Tappable header — collapses/expands ingredients */}
                      <TouchableOpacity
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
                        onPress={() => toggleGroup(group.menuItem)}
                        activeOpacity={0.7}
                      >
                        <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: C.primaryLight, justifyContent: 'center', alignItems: 'center' }}>
                          <MaterialIcons name="restaurant-menu" size={16} color={C.primary} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.histTitle, { fontSize: 15 }]}>{group.menuItem}</Text>
                          <Text style={styles.histSub}>{group.orderNums.size} order{group.orderNums.size !== 1 ? 's' : ''}  ·  {money(group.totalCost)}</Text>
                        </View>
                        <MaterialIcons
                          name={isCollapsed ? 'keyboard-arrow-down' : 'keyboard-arrow-up'}
                          size={22}
                          color={C.neutralMid}
                        />
                      </TouchableOpacity>

                      {/* Ingredients list — hidden when collapsed */}
                      {!isCollapsed && (
                        <View style={{ marginTop: 10 }}>
                          {Object.values(group.ingredients).map(ing => (
                            <View key={ing.name} style={og.ingRow}>
                              <View style={og.dot} />
                              <Text style={og.ingName}>{ing.name}</Text>
                              <Text style={og.ingQty}>−{fmtNum(ing.qty)} {ing.unit}</Text>
                              {ing.cost > 0 && <Text style={og.ingCost}>{money(ing.cost)}</Text>}
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}

            {/* ── Manual / waste / other outputs ── */}
            {manualFiltered.length > 0 && (
              <View style={{ marginHorizontal: spacing.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, marginBottom: 8 }}>
                  <MaterialIcons name="edit-note" size={14} color={C.neutralMid} />
                  <Text style={{ fontSize: 11, fontWeight: '800', color: C.neutralMid, textTransform: 'uppercase' }}>
                    Manual Records
                  </Text>
                </View>
                {manualFiltered.map(o => {
                  const rc = REASON_COLORS[o.reason] || { bg: '#f8fafc', text: '#475569' };
                  const tc = TYPE_COLORS[o.type] || { bg: '#f1f5f9', text: '#475569' };
                  const unitCost = toNum(o.costPerUnit) || toNum(items.find(x => x.name.toLowerCase() === o.itemName.toLowerCase())?.cost_per_unit);
                  const costVal  = toNum(o.qty) * unitCost;
                  return (
                    <View key={o.id} style={[styles.histCard, { marginBottom: spacing.sm }]}>
                      {/* Row 1: Item name + qty */}
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={styles.histTitle}>{o.itemName}</Text>
                        <Text style={[styles.histAmount, { color: C.danger }]}>−{fmtNum(o.qty)} {o.unit || ''}</Text>
                      </View>
                      {/* Row 2: Date + cost */}
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                        <Text style={styles.histSub}>{o.date}</Text>
                        {costVal > 0 && <Text style={[styles.histSub, { color: C.danger, fontWeight: '700' }]}>{money(costVal)}</Text>}
                      </View>
                      {/* Row 3: Type badge + Reason badge */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                        <View style={[styles.catBadge, { backgroundColor: tc.bg }]}>
                          <Text style={[styles.catBadgeText, { color: tc.text, fontWeight: '800' }]}>{o.type}</Text>
                        </View>
                        <View style={[styles.catBadge, { backgroundColor: rc.bg }]}>
                          <Text style={[styles.catBadgeText, { color: rc.text }]}>{outputReasonLabel(o.reason, t)}</Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Manual output sheet */}
      <Sheet visible={sheet} onClose={() => setSheet(false)} title={t('warehouse.recordOutput','Record Output')} tall>
        {/* Search */}
        <Field label="Item *">
          <TInput value={form.search} onChangeText={v => fi('search', v)} placeholder={t('warehouse.searchItems','Search items...')} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
            {(form.search ? items.filter(i => i.name.toLowerCase().includes(form.search.toLowerCase())) : items).map(i => (
              <TouchableOpacity key={i.id} style={[styles.pickerPill, form.itemId === i.id && styles.pickerPillActive]} onPress={() => setForm(p => ({ ...p, itemId: i.id, itemName: i.name, search: '' }))}>
                <Text style={[styles.pickerPillText, form.itemId === i.id && styles.pickerPillTextActive]}>{i.name} ({fmtNum(i.quantity_in_stock)} {i.unit})</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Field>
        {/* Quantity + Date */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}><Field label="Quantity *"><TInput value={form.qty} onChangeText={v => fi('qty', v)} placeholder={t('warehouse.zero','0')} keyboardType="decimal-pad" /></Field></View>
          <View style={{ flex: 1 }}><Field label="Date"><DateField value={form.date} onChange={v => fi('date', v)} placeholder={t('warehouse.selectDate','Select date')} /></Field></View>
        </View>
        {/* Type */}
        <Field label="Type *">
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {APP_TYPES.map(typ => {
              const active = form.type === typ.value;
              const bg = active ? (typ.value === 'OUT' ? '#fff7ed' : typ.value === 'WASTE' ? '#fef2f2' : '#eef2ff') : C.neutralLight;
              const tx = active ? (typ.value === 'OUT' ? '#c2410c' : typ.value === 'WASTE' ? '#dc2626' : '#4338ca') : C.neutralMid;
              const bd = active ? tx : C.border;
              return (
                <TouchableOpacity key={typ.value} onPress={() => { fi('type', typ.value); fi('reason', appReasonsFor(typ.value)[0]); }}
                  style={{ flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 2, borderColor: bd, backgroundColor: bg, alignItems: 'center' }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: tx }}>{typ.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Field>
        {/* Reason */}
        <Field label="Reason *"><PickerRow options={appReasonsFor(form.type)} value={form.reason} onSelect={v => fi('reason', v)} labels={appReasonsFor(form.type).map(r => outputReasonLabel(r, t))} /></Field>
        <View style={{ gap: 8, marginTop: 8 }}><SaveBtn onPress={saveOutput} label={t('warehouse.recordOutput', 'Record Output')} loading={saving} /><CancelBtn onPress={() => setSheet(false)} /></View>
      </Sheet>

      {/* Analytics drill-down */}
      <KitchenAnalyticsSheet
        visible={!!analyticsEntry}
        onClose={() => setAnalyticsEntry(null)}
        entry={analyticsEntry}
        allOutputs={allOutputs}
        items={items}
        rangeLabel={range}
      />
    </View>
  );
}

const ku = StyleSheet.create({
  wrap:     { margin: spacing.md, backgroundColor: C.card, borderRadius: 14, padding: 14, ...shadow.sm },
  title:    { fontSize: 13, fontWeight: '800', color: C.neutralDark, marginBottom: 6 },
  totalLine:{ fontSize: 12, color: C.neutralMid, marginBottom: 10 },
  row:      { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: colors.background },
  rank:     { width: 26, height: 26, borderRadius: 13, backgroundColor: C.primaryLight, justifyContent: 'center', alignItems: 'center' },
  rankTxt:  { fontSize: 11, fontWeight: '800', color: C.primary },
  ingName:  { fontSize: 13, fontWeight: '700', color: C.neutralDark },
  ingSub:   { fontSize: 11, color: C.neutralMid, marginTop: 1 },
  ingCost:  { fontSize: 13, fontWeight: '800', color: C.primary },
  chevron:  { fontSize: 18, color: C.neutralMid },
});

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 4 — SUPPLIERS
// ═══════════════════════════════════════════════════════════════════════════════
function SuppliersTab({ suppliers, setSuppliers, categories, history, setHistory, setDialog, onRefresh }) {
  const { t } = useTranslation();
  const [sheet, setSheet]   = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving]   = useState(false);
  const [detailSupplier, setDetailSupplier] = useState(null); // supplier detail page
  const [expandedDebt, setExpandedDebt] = useState(null); // expanded debt supplier key
  // Payment form states
  const [paySheet, setPaySheet] = useState(false);
  const [payStep, setPayStep]   = useState('form'); // 'form' | 'confirm'
  const [payTarget, setPayTarget] = useState(null); // single delivery or { bulk: true, deliveries: [...], supplierName, total }
  const [payMethod, setPayMethod] = useState('Cash');
  const [payNote, setPayNote]     = useState('');
  const [payDate, setPayDate]     = useState(todayStr());
  const [payDatePickerOpen, setPayDatePickerOpen] = useState(false);
  const [payDatePickerDate, setPayDatePickerDate] = useState(new Date());
  const PAY_METHODS = ['Cash', 'Bank Transfer', 'Card', 'Mobile Payment', 'Check', 'Other'];
  const blank = { name: '', category: categories[0] || '', phone: '', email: '', address: '', contactName: '', paymentTerms: '' };
  const [form, setForm] = useState(blank);
  const fi = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // Compute unpaid delivery debt per supplier from delivery history
  const supplierDebts = {};
  const supplierUnpaidDeliveries = {};
  const now = new Date(); now.setHours(0,0,0,0);
  (history || []).forEach(d => {
    if (d.paymentStatus !== 'paid' && ['Delivered', 'Partial'].includes(d.status)) {
      const key = d.supplierId || d.supplierName;
      if (key) {
        supplierDebts[key] = (supplierDebts[key] || 0) + toNum(d.total);
        if (!supplierUnpaidDeliveries[key]) supplierUnpaidDeliveries[key] = [];
        supplierUnpaidDeliveries[key].push(d);
      }
    }
  });

  // Helper: compute due status for a delivery
  function getDueInfo(d) {
    if (!d.paymentDueDate) return null;
    const due = new Date(d.paymentDueDate + 'T00:00:00'); due.setHours(0,0,0,0);
    const diffDays = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
    return { diffDays, isOverdue: diffDays < 0, isDueSoon: diffDays >= 0 && diffDays <= 3 };
  }

  // Get worst due status per supplier (for card display)
  function getWorstDue(supplierKey) {
    const delivs = supplierUnpaidDeliveries[supplierKey] || [];
    let worstOverdue = 0;
    let soonest = Infinity;
    for (const d of delivs) {
      const info = getDueInfo(d);
      if (!info) continue;
      if (info.isOverdue && Math.abs(info.diffDays) > worstOverdue) worstOverdue = Math.abs(info.diffDays);
      if (!info.isOverdue && info.diffDays < soonest) soonest = info.diffDays;
    }
    if (worstOverdue > 0) return { type: 'overdue', days: worstOverdue };
    if (soonest <= 3 && soonest !== Infinity) return { type: 'soon', days: soonest };
    if (soonest !== Infinity) return { type: 'ok', days: soonest };
    return null;
  }

  function openAdd() { setEditing(null); setForm({ ...blank, category: categories[0] || '' }); setSheet(true); }
  function openEdit(s) {
    setEditing(s);
    setForm({
      name: s.name, category: s.category || categories[0] || '',
      phone: s.phone || '', email: s.email || '', address: s.address || '',
      contactName: s.contact_name || s.contactName || '',
      paymentTerms: s.payment_terms || s.paymentTerms || '',
    });
    setSheet(true);
  }

  async function save() {
    if (!form.name.trim()) {
      setDialog({ title: 'Required', message: 'Supplier name is required', type: 'warning' });
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(), phone: form.phone, email: form.email, address: form.address,
      contact_name: form.contactName || '', payment_terms: form.paymentTerms || '', category: form.category || '',
    };
    try {
      if (editing) {
        const res = await suppliersAPI.update(editing.id, payload);
        setSuppliers(prev => prev.map(s => s.id === editing.id ? { ...s, ...res.data, category: form.category } : s));
      } else {
        const res = await suppliersAPI.create(payload);
        setSuppliers(prev => [...prev, { ...res.data, category: form.category }]);
      }
      setSheet(false);
    } catch (e) { setDialog({ title: 'Error', message: e.response?.data?.error || e.message, type: 'error' }); }
    setSaving(false);
  }

  // Open payment form for a single delivery
  function openPaySingle(d) {
    setPayTarget(d);
    setPayMethod('Cash');
    setPayNote('');
    setPayDate(todayStr());
    setPayStep('form');
    setPaySheet(true);
  }

  // Open payment form for bulk (Pay All)
  function openPayBulk(deliveries, supplierName) {
    const total = deliveries.reduce((sum, d) => sum + toNum(d.total), 0);
    setPayTarget({ bulk: true, deliveries, supplierName, total });
    setPayMethod('Cash');
    setPayNote('');
    setPayDate(todayStr());
    setPayStep('form');
    setPaySheet(true);
  }

  // Confirm and execute payment
  async function confirmPayment() {
    if (!payTarget) return;
    setPaySheet(false);
    const paidAt = payDate ? new Date(payDate + 'T12:00:00').toISOString() : new Date().toISOString();
    try {
      if (payTarget.bulk) {
        for (const d of payTarget.deliveries) {
          await procurementAPI.payDelivery(String(d.id), { payment_method: payMethod, payment_note: payNote, paid_at: paidAt });
        }
        const ids = new Set(payTarget.deliveries.map(d => d.id));
        setHistory(prev => {
          const updated = prev.map(item => ids.has(item.id) ? { ...item, paymentStatus: 'paid', paidAt, paymentMethod: payMethod, paymentNote: payNote } : item);
          AsyncStorage.setItem(DELIVERY_STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
          return updated;
        });
        Alert.alert(t('alerts.success','Success'), t('alerts.paidDeliveries','Paid {count} deliveries').replace('{count}', payTarget.deliveries.length));
      } else {
        await procurementAPI.payDelivery(String(payTarget.id), { payment_method: payMethod, payment_note: payNote, paid_at: paidAt });
        setHistory(prev => {
          const updated = prev.map(item => item.id === payTarget.id ? { ...item, paymentStatus: 'paid', paidAt, paymentMethod: payMethod, paymentNote: payNote } : item);
          AsyncStorage.setItem(DELIVERY_STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
          return updated;
        });
        Alert.alert(t('alerts.success','Success'), t('alerts.deliveryPaid','Delivery marked as paid'));
      }
    } catch (err) {
      Alert.alert(t('alerts.error','Error'), t('alerts.paymentFailedRetry','Payment failed. Please try again.'));
    }
  }

  // Get all deliveries for a specific supplier
  function getSupplierDeliveries(s) {
    return (history || []).filter(d =>
      (d.supplierId && String(d.supplierId) === String(s.id)) || (d.supplierName && d.supplierName === s.name)
    ).sort((a, b) => (b.date || b.timestamp || '').localeCompare(a.date || a.timestamp || ''));
  }

  async function del(s) {
    setDialog({
      title: 'Delete Supplier',
      message: `Remove "${s.name}"?`,
      type: 'danger',
      confirmLabel: 'Delete',
      onConfirm: async () => {
        setDialog(null);
        try { await suppliersAPI.delete(s.id); setSuppliers(prev => prev.filter(x => x.id !== s.id)); }
        catch (e) { setDialog({ title: 'Error', message: e.response?.data?.error || 'Delete failed', type: 'error' }); }
      },
    });
  }

  // Total outstanding debt
  const totalDebt = Object.values(supplierDebts).reduce((s, v) => s + v, 0);

  // ── Supplier Detail Page ──
  if (detailSupplier) {
    const s = detailSupplier;
    const cc = invCatColor(s.category, categories);
    const debtKey = s.id || s.name;
    const debt = supplierDebts[debtKey] || supplierDebts[s.name] || 0;
    const allDelivs = getSupplierDeliveries(s);
    const unpaidDelivs = (supplierUnpaidDeliveries[debtKey] || supplierUnpaidDeliveries[s.name] || []);
    const contactName = s.contact_name || s.contactName || '';
    const payTerms = s.payment_terms || s.paymentTerms || '';

    return (
      <View style={{ flex: 1 }}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
          {/* Back button */}
          <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: spacing.md }} onPress={() => setDetailSupplier(null)}>
            <MaterialIcons name="arrow-back" size={20} color={C.primary} />
            <Text style={{ fontSize: 14, fontWeight: '700', color: C.primary }}>{t('warehouse.sections.allSuppliers', 'All Suppliers')}</Text>
          </TouchableOpacity>

          {/* Supplier Info Card */}
          <View style={{ marginHorizontal: spacing.md, backgroundColor: C.card, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: C.border, marginBottom: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View style={[styles.supAvatar, { backgroundColor: cc.bg, width: 52, height: 52, borderRadius: 14 }]}>
                <Text style={[styles.supAvatarText, { color: cc.text, fontSize: 22 }]}>{s.name[0]?.toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: C.neutralDark }}>{s.name}</Text>
                {contactName ? <Text style={{ fontSize: 13, color: C.neutralMid, marginTop: 2 }}>{contactName}</Text> : null}
                {s.category ? <View style={{ backgroundColor: cc.bg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, alignSelf: 'flex-start', marginTop: 4 }}><Text style={{ fontSize: 10, fontWeight: '700', color: cc.text }}>{s.category}</Text></View> : null}
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity style={styles.iconBtnGhost} onPress={() => openEdit(s)}><MaterialIcons name="edit" size={16} color={C.primary} /></TouchableOpacity>
                <TouchableOpacity style={styles.iconBtnDanger} onPress={() => del(s)}><MaterialIcons name="delete" size={16} color={C.danger} /></TouchableOpacity>
              </View>
            </View>

            {/* Contact details */}
            <View style={{ marginTop: 16, gap: 8 }}>
              {s.phone ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><MaterialIcons name="phone" size={16} color={C.neutralMid} /><Text style={{ fontSize: 13, color: C.neutralDark }}>{s.phone}</Text></View> : null}
              {s.email ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><MaterialIcons name="email" size={16} color={C.neutralMid} /><Text style={{ fontSize: 13, color: C.neutralDark }}>{s.email}</Text></View> : null}
              {s.address ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><MaterialIcons name="location-on" size={16} color={C.neutralMid} /><Text style={{ fontSize: 13, color: C.neutralDark }}>{s.address}</Text></View> : null}
              {payTerms ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><MaterialIcons name="receipt" size={16} color={C.neutralMid} /><Text style={{ fontSize: 13, color: C.neutralDark }}>Terms: {payTerms}</Text></View> : null}
            </View>

            {/* Stats row */}
            <View style={{ flexDirection: 'row', marginTop: 16, gap: 10 }}>
              <View style={{ flex: 1, backgroundColor: '#f0fdf4', borderRadius: 12, padding: 12, alignItems: 'center' }}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: '#15803d' }}>{allDelivs.length}</Text>
                <Text style={{ fontSize: 10, fontWeight: '600', color: '#16a34a', marginTop: 2 }}>Total Orders</Text>
              </View>
              <View style={{ flex: 1, backgroundColor: debt > 0 ? '#fef2f2' : '#f0fdf4', borderRadius: 12, padding: 12, alignItems: 'center' }}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: debt > 0 ? C.danger : '#15803d' }}>{money(debt)}</Text>
                <Text style={{ fontSize: 10, fontWeight: '600', color: debt > 0 ? '#dc2626' : '#16a34a', marginTop: 2 }}>Outstanding</Text>
              </View>
              <View style={{ flex: 1, backgroundColor: '#eff6ff', borderRadius: 12, padding: 12, alignItems: 'center' }}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: '#1d4ed8' }}>{money(allDelivs.reduce((s, d) => s + toNum(d.total), 0))}</Text>
                <Text style={{ fontSize: 10, fontWeight: '600', color: '#2563eb', marginTop: 2 }}>Total Spent</Text>
              </View>
            </View>
          </View>

          {/* Unpaid Deliveries Section */}
          {unpaidDelivs.length > 0 && (
            <View style={{ marginHorizontal: spacing.md, marginBottom: spacing.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: '#991b1b' }}>{t('warehouse.sections.unpaidDeliveries', 'Unpaid Deliveries')} ({unpaidDelivs.length})</Text>
                <TouchableOpacity
                  style={{ backgroundColor: '#15803d', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10 }}
                  onPress={() => openPayBulk(unpaidDelivs, s.name)}
                >
                  <Text style={{ fontSize: 12, fontWeight: '800', color: '#fff' }}>Pay All</Text>
                </TouchableOpacity>
              </View>
              {unpaidDelivs.map(d => (
                <View key={d.id} style={{ backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#fecaca' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827' }}>{money(d.total)}</Text>
                      <Text style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{fmtDelivDate(d.date)}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                        <View style={{ backgroundColor: DELIVERY_STATUS_COLORS[d.status]?.bg || '#e5e7eb', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                          <Text style={{ fontSize: 10, fontWeight: '700', color: DELIVERY_STATUS_COLORS[d.status]?.text || '#374151' }}>{deliveryStatusLabel(d.status, t)}</Text>
                        </View>
                        {d.notes ? <Text style={{ fontSize: 10, color: '#9ca3af' }} numberOfLines={1}>{d.notes}</Text> : null}
                      </View>
                    </View>
                    <TouchableOpacity
                      style={{ backgroundColor: '#15803d', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 }}
                      onPress={() => openPaySingle(d)}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '800', color: '#fff' }}>Pay</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* All Delivery History */}
          <View style={{ marginHorizontal: spacing.md, marginBottom: spacing.md }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: C.neutralDark, marginBottom: 10 }}>{t('warehouse.sections.allDeliveries', 'All Deliveries')} ({allDelivs.length})</Text>
            {allDelivs.length > 0 ? allDelivs.map(d => {
              const isPaid = d.paymentStatus === 'paid';
              const sc = DELIVERY_STATUS_COLORS[d.status] || DELIVERY_STATUS_COLORS['In Transit'];
              return (
                <View key={d.id} style={{ backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 6, borderWidth: 1, borderColor: '#e5e7eb' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151' }}>{fmtDelivDate(d.date)}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                        <View style={{ backgroundColor: sc.bg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                          <Text style={{ fontSize: 9, fontWeight: '700', color: sc.text }}>{deliveryStatusLabel(d.status, t)}</Text>
                        </View>
                        <View style={{ backgroundColor: isPaid ? '#dcfce7' : '#fee2e2', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                          <Text style={{ fontSize: 9, fontWeight: '700', color: isPaid ? '#15803d' : '#dc2626' }}>{isPaid ? t('warehouse.paymentStatus.paid', 'Paid') : t('warehouse.paymentStatus.unpaid', 'Unpaid')}</Text>
                        </View>
                      </View>
                    </View>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: isPaid ? '#374151' : C.danger }}>{money(d.total)}</Text>
                  </View>
                </View>
              );
            }) : (
              <View style={{ backgroundColor: '#f9fafb', borderRadius: 12, padding: 20, alignItems: 'center' }}>
                <Text style={{ fontSize: 13, color: C.neutralMid }}>{t('warehouse.empty.noDeliveriesYet', 'No deliveries yet')}</Text>
              </View>
            )}
          </View>
        </ScrollView>

        <Sheet visible={sheet} onClose={() => setSheet(false)} title="Edit Supplier">
          <Field label="Company Name"><TInput value={form.name} onChangeText={v => fi('name', v)} placeholder={t('warehouse.egFreshFarm','e.g. FreshFarm Co.')} /></Field>
          <Field label="Contact Person"><TInput value={form.contactName} onChangeText={v => fi('contactName', v)} placeholder={t('warehouse.egJohn','e.g. John')} /></Field>
          <Field label="Category"><PickerRow options={categories.length ? categories : ['Other']} value={form.category} onSelect={v => fi('category', v)} /></Field>
          <Field label="Phone"><TInput value={form.phone} onChangeText={v => fi('phone', v)} placeholder={t('warehouse.egPhone','+998 90 123 4567')} keyboardType="phone-pad" /></Field>
          <Field label="Email"><TInput value={form.email} onChangeText={v => fi('email', v)} placeholder={t('warehouse.egSupplierEmail','supplier@example.com')} keyboardType="email-address" /></Field>
          <Field label="Address (optional)"><TInput value={form.address} onChangeText={v => fi('address', v)} placeholder={t('warehouse.egAddress','Street, City...')} /></Field>
          <Field label="Payment Terms"><TInput value={form.paymentTerms} onChangeText={v => fi('paymentTerms', v)} placeholder={t('warehouse.egTerms','e.g. Net 30, COD')} /></Field>
          <View style={{ gap: 8, marginTop: 8 }}><SaveBtn onPress={save} loading={saving} /><CancelBtn onPress={() => setSheet(false)} /></View>
        </Sheet>
      </View>
    );
  }

  // ── Main Suppliers List ──
  return (
    <View style={{ flex: 1 }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Add Supplier button */}
        <TouchableOpacity style={[styles.addBtn, { margin: spacing.md }]} onPress={openAdd}><Text style={styles.addBtnText}>+ Add Supplier</Text></TouchableOpacity>

        {/* Outstanding Debt Summary — with expandable unpaid deliveries per supplier */}
        {totalDebt > 0 && (
          <View style={{ marginHorizontal: spacing.md, marginBottom: spacing.md, backgroundColor: '#FEF2F2', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#FECACA' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <MaterialIcons name="warning" size={18} color={C.danger} />
                <Text style={{ fontSize: 14, fontWeight: '800', color: '#7f1d1d' }}>Outstanding Debt</Text>
              </View>
              <Text style={{ fontSize: 16, fontWeight: '800', color: C.danger }}>{money(totalDebt)}</Text>
            </View>
            {Object.entries(supplierDebts).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([key, amt]) => {
              const supplierName = suppliers.find(s => String(s.id) === String(key))?.name || key;
              const unpaidList = supplierUnpaidDeliveries[key] || [];
              const isExpanded = expandedDebt === key;
              return (
                <View key={key} style={{ backgroundColor: '#fff', borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: '#FECACA', overflow: 'hidden' }}>
                  {/* Supplier debt header — tap to expand */}
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', padding: 12 }}
                    onPress={() => setExpandedDebt(isExpanded ? null : key)}
                    activeOpacity={0.7}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: C.neutralDark }}>{supplierName}</Text>
                      <Text style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>{unpaidList.length} unpaid deliver{unpaidList.length !== 1 ? 'ies' : 'y'}</Text>
                    </View>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: C.danger, marginRight: 8 }}>{money(amt)}</Text>
                    <MaterialIcons name={isExpanded ? 'expand-less' : 'expand-more'} size={20} color={C.neutralMid} />
                  </TouchableOpacity>

                  {/* Expanded: individual unpaid deliveries with Pay button */}
                  {isExpanded && (
                    <View style={{ borderTopWidth: 1, borderTopColor: '#fecaca' }}>
                      {unpaidList.map(d => (
                        <View key={d.id} style={{ flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: '#fef2f2' }}>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 12, fontWeight: '600', color: '#111827' }}>{fmtDelivDate(d.date)} — {money(d.total)}</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                              <View style={{ backgroundColor: DELIVERY_STATUS_COLORS[d.status]?.bg || '#e5e7eb', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                                <Text style={{ fontSize: 9, fontWeight: '700', color: DELIVERY_STATUS_COLORS[d.status]?.text || '#374151' }}>{deliveryStatusLabel(d.status, t)}</Text>
                              </View>
                              {d.notes ? <Text style={{ fontSize: 10, color: '#9ca3af' }} numberOfLines={1}>{d.notes}</Text> : null}
                            </View>
                          </View>
                          <TouchableOpacity
                            style={{ backgroundColor: '#15803d', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 }}
                            onPress={() => openPaySingle(d)}
                          >
                            <Text style={{ fontSize: 11, fontWeight: '800', color: '#fff' }}>Pay</Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                      {/* Pay All button */}
                      <TouchableOpacity
                        style={{ backgroundColor: '#15803d', margin: 12, paddingVertical: 10, borderRadius: 10, alignItems: 'center' }}
                        onPress={() => openPayBulk(unpaidList, supplierName)}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '800', color: '#fff' }}>Pay All ({money(amt)})</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* Supplier Cards — tap opens detail page */}
        {suppliers.length > 0 ? suppliers.map(s => {
          const cc = invCatColor(s.category, categories);
          const debtKey = s.id || s.name;
          const debt = supplierDebts[debtKey] || supplierDebts[s.name] || 0;
          const allDelivs = getSupplierDeliveries(s);
          return (
            <TouchableOpacity
              key={s.id}
              style={[styles.itemCard, { marginHorizontal: spacing.md, marginBottom: spacing.sm }]}
              onPress={() => setDetailSupplier(s)}
              activeOpacity={0.7}
            >
              <View style={styles.itemCardTop}>
                <View style={[styles.supAvatar, { backgroundColor: cc.bg }]}><Text style={[styles.supAvatarText, { color: cc.text }]}>{s.name[0]?.toUpperCase()}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{s.name}</Text>
                  <Text style={styles.itemSub}>{s.phone || '—'}{s.category ? '  ·  ' + s.category : ''}</Text>
                  {debt > 0 && (
                    <Text style={{ fontSize: 11, color: C.danger, fontWeight: '700', marginTop: 3 }}>Owes: {money(debt)}</Text>
                  )}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{ fontSize: 11, color: C.neutralMid }}>{allDelivs.length} orders</Text>
                  <MaterialIcons name="chevron-right" size={20} color={C.neutralMid} />
                </View>
              </View>
            </TouchableOpacity>
          );
        }) : (
          <View style={[styles.emptyWrap, { marginHorizontal: spacing.md }]}>
            <MaterialIcons name="factory" size={48} color={C.border} style={{ marginBottom: 8 }} />
            <Text style={styles.emptyText}>{t('warehouse.empty.noSuppliers', 'No suppliers yet')}</Text>
          </View>
        )}
      </ScrollView>
      <Sheet visible={sheet} onClose={() => setSheet(false)} title={editing ? 'Edit Supplier' : 'Add Supplier'}>
        <Field label="Company Name"><TInput value={form.name} onChangeText={v => fi('name', v)} placeholder={t('warehouse.egFreshFarm','e.g. FreshFarm Co.')} /></Field>
        <Field label="Contact Person"><TInput value={form.contactName} onChangeText={v => fi('contactName', v)} placeholder={t('warehouse.egJohn','e.g. John')} /></Field>
        <Field label="Category"><PickerRow options={categories.length ? categories : ['Other']} value={form.category} onSelect={v => fi('category', v)} /></Field>
        <Field label="Phone"><TInput value={form.phone} onChangeText={v => fi('phone', v)} placeholder={t('warehouse.egPhone','+998 90 123 4567')} keyboardType="phone-pad" /></Field>
        <Field label="Email"><TInput value={form.email} onChangeText={v => fi('email', v)} placeholder={t('warehouse.egSupplierEmail','supplier@example.com')} keyboardType="email-address" /></Field>
        <Field label="Address (optional)"><TInput value={form.address} onChangeText={v => fi('address', v)} placeholder={t('warehouse.egAddress','Street, City...')} /></Field>
        <Field label="Payment Terms"><TInput value={form.paymentTerms} onChangeText={v => fi('paymentTerms', v)} placeholder={t('warehouse.egTerms','e.g. Net 30, COD')} /></Field>
        <View style={{ gap: 8, marginTop: 8 }}><SaveBtn onPress={save} loading={saving} /><CancelBtn onPress={() => setSheet(false)} /></View>
      </Sheet>

      {/* ── Payment Sheet ─────────────────────────────────────────────── */}
      <Sheet visible={paySheet} onClose={() => setPaySheet(false)} title={payStep === 'form' ? t('warehouse.sections.recordPayment', 'Record Payment') : t('warehouse.sections.confirmPayment', 'Confirm Payment')}>
        {payTarget && payStep === 'form' && (
          <>
            <View style={{ backgroundColor: '#F9FAFB', borderRadius: 12, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: C.border }}>
              <Text style={{ fontSize: 11, color: C.neutralMid }}>Supplier</Text>
              <Text style={{ fontSize: 15, fontWeight: '800', color: C.neutralDark }}>{payTarget.supplierName || payTarget.supplier_name || ''}</Text>
              <Text style={{ fontSize: 11, color: C.neutralMid, marginTop: 6 }}>Amount</Text>
              <Text style={{ fontSize: 20, fontWeight: '800', color: C.success }}>{money(payTarget.total)}</Text>
              {payTarget.bulk && <Text style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>{payTarget.deliveries.length} deliveries</Text>}
            </View>
            <Field label="Payment Method *">
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {PAY_METHODS.map(m => {
                  const active = payMethod === m;
                  return (
                    <TouchableOpacity key={m} onPress={() => setPayMethod(m)}
                      style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 2, borderColor: active ? C.success : C.border, backgroundColor: active ? '#F0FDF4' : C.neutralLight }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: active ? '#15803d' : C.neutralMid }}>{payMethodLabel(m, t)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </Field>
            <Field label="Payment Date *">
              <TouchableOpacity
                onPress={() => {
                  const parts = payDate.split('-');
                  const d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
                  setPayDatePickerDate(d);
                  setPayDatePickerOpen(true);
                }}
                style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.neutralLight, borderRadius: 12, borderWidth: 2, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 12 }}>
                <MaterialIcons name="event" size={20} color={C.admin} style={{ marginRight: 8 }} />
                <Text style={{ fontSize: 14, fontWeight: '700', color: C.neutralDark }}>{payDate || 'Select date'}</Text>
              </TouchableOpacity>
            </Field>
            <Field label="Invoice / Cheque (optional)">
              <TInput value={payNote} onChangeText={setPayNote} placeholder={t('warehouse.egInvoice','e.g. INV-2026-0042')} />
            </Field>
            <View style={{ gap: 8, marginTop: 8 }}>
              <SaveBtn onPress={() => setPayStep('confirm')} label="Continue" />
              <CancelBtn onPress={() => setPaySheet(false)} />
            </View>
          </>
        )}
        {payTarget && payStep === 'confirm' && (
          <>
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#F0FDF4', justifyContent: 'center', alignItems: 'center', marginBottom: 10 }}>
                <MaterialIcons name="check-circle" size={32} color={C.success} />
              </View>
              <Text style={{ fontSize: 16, fontWeight: '800', color: C.neutralDark }}>{t('warehouse.sections.confirmPayment', 'Confirm Payment')}</Text>
              <Text style={{ fontSize: 12, color: C.neutralMid, marginTop: 4 }}>Has this payment been made?</Text>
            </View>
            <View style={{ backgroundColor: '#F9FAFB', borderRadius: 12, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: C.border, gap: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 12, color: C.neutralMid }}>Supplier</Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: C.neutralDark }}>{payTarget.supplierName || payTarget.supplier_name || ''}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 12, color: C.neutralMid }}>Amount</Text>
                <Text style={{ fontSize: 13, fontWeight: '800', color: C.success }}>{money(payTarget.total)}</Text>
              </View>
              {payTarget.bulk && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 12, color: C.neutralMid }}>Deliveries</Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: C.neutralDark }}>{payTarget.deliveries.length}</Text>
                </View>
              )}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 12, color: C.neutralMid }}>Method</Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: C.neutralDark }}>{payMethod}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 12, color: C.neutralMid }}>Payment Date</Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: C.neutralDark }}>{payDate}</Text>
              </View>
              {payNote ? (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 12, color: C.neutralMid }}>Invoice/Cheque</Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: C.neutralDark }}>{payNote}</Text>
                </View>
              ) : null}
            </View>
            <View style={{ gap: 8 }}>
              <SaveBtn onPress={confirmPayment} label="Yes, Payment Made" />
              <CancelBtn onPress={() => setPayStep('form')} label="No, Go Back" />
            </View>
          </>
        )}
      </Sheet>

      {/* ── Payment Date Picker Modal ─────────────────────────────────── */}
      <Modal visible={payDatePickerOpen} animationType="slide" transparent onRequestClose={() => setPayDatePickerOpen(false)} statusBarTranslucent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, width: '90%', maxWidth: 360, padding: 16 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: C.neutralDark }}>Payment Date</Text>
              <TouchableOpacity onPress={() => setPayDatePickerOpen(false)}>
                <MaterialIcons name="close" size={22} color={C.neutralMid} />
              </TouchableOpacity>
            </View>
            {(() => {
              const vd = payDatePickerDate;
              const vy = vd.getFullYear();
              const vm = vd.getMonth();
              const firstDow = (new Date(vy, vm, 1).getDay() + 6) % 7;
              const dim = new Date(vy, vm + 1, 0).getDate();
              const cells = [];
              for (let i = 0; i < firstDow; i++) cells.push(null);
              for (let d = 1; d <= dim; d++) cells.push(d);
              while (cells.length % 7 !== 0) cells.push(null);
              const weeks = [];
              for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
              const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
              const selParts = payDate ? payDate.split('-') : [];
              const selY = selParts[0] ? +selParts[0] : null;
              const selM = selParts[1] ? +selParts[1] - 1 : null;
              const selD = selParts[2] ? +selParts[2] : null;
              return (
                <>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <TouchableOpacity onPress={() => setPayDatePickerDate(new Date(vy, vm - 1, 1))}>
                      <MaterialIcons name="chevron-left" size={28} color={C.neutralDark} />
                    </TouchableOpacity>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: C.neutralDark }}>{months[vm]} {vy}</Text>
                    <TouchableOpacity onPress={() => setPayDatePickerDate(new Date(vy, vm + 1, 1))}>
                      <MaterialIcons name="chevron-right" size={28} color={C.neutralDark} />
                    </TouchableOpacity>
                  </View>
                  <View style={{ flexDirection: 'row', marginBottom: 4 }}>
                    {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(d => (
                      <View key={d} style={{ flex: 1, alignItems: 'center' }}>
                        <Text style={{ fontSize: 11, color: C.neutralMid, fontWeight: '600' }}>{d}</Text>
                      </View>
                    ))}
                  </View>
                  {weeks.map((week, wi) => (
                    <View key={wi} style={{ flexDirection: 'row', marginBottom: 2 }}>
                      {week.map((day, di) => {
                        if (!day) return <View key={di} style={{ flex: 1, height: 38 }} />;
                        const isSel = selY === vy && selM === vm && selD === day;
                        return (
                          <TouchableOpacity key={di} onPress={() => {
                            const mm = String(vm + 1).padStart(2, '0');
                            const dd = String(day).padStart(2, '0');
                            setPayDate(`${vy}-${mm}-${dd}`);
                            setPayDatePickerOpen(false);
                          }} style={{ flex: 1, height: 38, justifyContent: 'center', alignItems: 'center', borderRadius: 19, backgroundColor: isSel ? C.admin : 'transparent' }}>
                            <Text style={{ fontSize: 14, fontWeight: isSel ? '700' : '400', color: isSel ? '#fff' : C.neutralDark }}>{day}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ))}
                </>
              );
            })()}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN SCREEN
// ═══════════════════════════════════════════════════════════════════════════════
export default function WarehouseScreen() {
  const { t } = useTranslation();
  const [items,           setItems]           = useState([]);
  const [suppliers,       setSuppliers]       = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [refreshing,      setRefreshing]      = useState(false);
  const [tab,             setTab]             = useState('inventory');
  const [lowAlertNames,   setLowAlertNames]   = useState([]);
  // Delivery history — lifted from DeliveriesTab so it survives tab switches,
  // and persisted to AsyncStorage so it survives full app restarts.
  const [deliveryHistory, setDeliveryHistory] = useState([]);
  // Inventory categories — user-managed, persisted to AsyncStorage.
  const [invCategories, setInvCategories] = useState(DEFAULT_INV_CATEGORIES);
  const [dialog, setDialog] = useState(null);

  // Load persisted data once on mount — prefer DB data, fall back to AsyncStorage
  useEffect(() => {
    // Try to load deliveries from DB first, fall back to AsyncStorage
    Promise.allSettled([
      procurementAPI.getDeliveries(),
      AsyncStorage.getItem(DELIVERY_STORAGE_KEY),
    ]).then(([dbRes, localRes]) => {
      const dbHasData = dbRes.status === 'fulfilled' && Array.isArray(dbRes.value?.data) && dbRes.value.data.length > 0;
      let localRows = [];
      if (localRes.status === 'fulfilled' && localRes.value) {
        try { localRows = JSON.parse(localRes.value) || []; } catch (_) {}
      }

      if (dbHasData) {
        // DB has data — map snake_case fields to camelCase for local usage
        const dbRows = dbRes.value.data.map(r => ({
          id:            r.id,
          supplierName:  r.supplier_name || '',
          supplierId:    r.supplier_id   || '',
          date:          r.timestamp     || '',
          total:         parseFloat(r.total) || 0,
          status:        r.status        || 'Delivered',
          paymentStatus: r.payment_status || 'unpaid',
          paymentMethod:  r.payment_method   || '',
          paymentNote:    r.payment_note    || '',
          paidAt:         r.paid_at         || '',
          paymentDueDate: r.payment_due_date ? r.payment_due_date.split('T')[0] : '',
          notes:          r.notes           || '',
          lines:          [],  // detail lines not loaded in list — kept as empty
          itemCount:      parseInt(r.item_count, 10) || 0,
          timestamp:      r.timestamp       || '',
        }));
        setDeliveryHistory(dbRows);
        // Also update AsyncStorage with DB data for offline use
        AsyncStorage.setItem(DELIVERY_STORAGE_KEY, JSON.stringify(dbRows)).catch(() => {});
      } else if (localRows.length > 0) {
        // DB is empty but AsyncStorage has data — display locally and migrate to DB via bulk-sync
        setDeliveryHistory(localRows);
        procurementAPI.bulkSyncDeliveries(localRows).catch(() => {});
      }
    }).catch(() => {});

    AsyncStorage.getItem(INV_CAT_KEY)
      .then(raw => {
        if (raw) {
          try { setInvCategories(JSON.parse(raw)); } catch (_) {}
        }
      })
      .catch(() => {});
  }, []);

  // Wrapper: update state AND write to AsyncStorage atomically
  const persistDeliveryHistory = useCallback((updater) => {
    setDeliveryHistory(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      AsyncStorage.setItem(DELIVERY_STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  // Wrapper: persist inventory categories to AsyncStorage
  const persistInvCategories = useCallback((next) => {
    setInvCategories(next);
    AsyncStorage.setItem(INV_CAT_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    try {
      const [itemsRes, supRes] = await Promise.allSettled([warehouseAPI.getAll(), suppliersAPI.getAll()]);
      if (itemsRes.status === 'fulfilled') setItems(itemsRes.value.data || []);
      if (supRes.status === 'fulfilled')   setSuppliers(supRes.value.data || []);
      // Fire expiry check in background — creates admin notifications if batches expire within 14 days
      warehouseAPI.checkExpiryAlerts().catch(() => {});
    } catch (_) {}
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  const refresh = useCallback(() => { setRefreshing(true); load(); }, [load]);

  // Reload inventory items whenever the user switches to the inventory tab
  // so that stock quantities are always fresh after an order is paid.
  useEffect(() => {
    if (tab === 'inventory') { load(); }
  }, [tab]);

  // ── Check low stock after refresh ──────────────────────────────────────
  useEffect(() => {
    const alerts = items
      .filter(i => toNum(i.quantity_in_stock) <= toNum(i.min_stock_level ?? i.low_stock_alert ?? 0) && toNum(i.min_stock_level ?? i.low_stock_alert ?? 0) > 0)
      .map(i => i.name);
    setLowAlertNames(alerts);
  }, [items]);

  const TABS = [
    { id: 'inventory',  label: t('warehouse.tabs.inventory',  'Inventory'),  icon: 'inventory-2' },
    { id: 'deliveries', label: t('warehouse.tabs.deliveries', 'Deliveries'), icon: 'local-shipping' },
    { id: 'outputs',    label: t('warehouse.tabs.output',     'Output'),     icon: 'trending-down' },
    { id: 'suppliers',  label: t('warehouse.tabs.suppliers',  'Suppliers'),  icon: 'factory' },
  ];

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={colors.admin} /></View>;
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />
      <View style={styles.header}><Text style={styles.headerTitle}>Inventory</Text></View>
      <StatusBanner items={items} lowStockAlertNames={lowAlertNames} />
      <View style={styles.innerTabBar}>
        {TABS.map(tb => (
          <TouchableOpacity key={tb.id} style={[styles.innerTab, tab === tb.id && styles.innerTabActive]} onPress={() => setTab(tb.id)}>
            <MaterialIcons name={tb.icon} size={18} color={tab === tb.id ? C.primary : C.neutralMid} />
            <Text style={[styles.innerTabLabel, tab === tb.id && styles.innerTabLabelActive]}>{tb.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {tab === 'inventory'  && <InventoryTab items={items} onRefresh={refresh} refreshing={refreshing} categories={invCategories} setCategories={persistInvCategories} suppliers={suppliers} onDeliveryCreated={persistDeliveryHistory} setDialog={setDialog} />}
      {tab === 'deliveries' && <DeliveriesTab items={items} suppliers={suppliers} history={deliveryHistory} setHistory={persistDeliveryHistory} onRefresh={refresh} refreshing={refreshing} setDialog={setDialog} />}
      {tab === 'outputs'    && <StockOutputTab items={items} onRefresh={refresh} setDialog={setDialog} />}
      {tab === 'suppliers'  && <SuppliersTab suppliers={suppliers} setSuppliers={setSuppliers} categories={invCategories} history={deliveryHistory} setHistory={persistDeliveryHistory} setDialog={setDialog} onRefresh={refresh} />}
      <ConfirmDialog dialog={dialog} onClose={() => setDialog(null)} />
    </View>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: colors.background },
  center:     { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header:     { paddingHorizontal: spacing.md, paddingTop: topInset + 12, paddingBottom: spacing.sm, backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border },
  headerTitle:{ fontSize: typography.xl, fontWeight: '800', color: C.neutralDark },
  banner:     { paddingHorizontal: spacing.md, paddingVertical: 8 },
  bannerText: { color: C.card, fontWeight: '700', fontSize: typography.xs },
  innerTabBar:{ flexDirection: 'row', backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border },
  innerTab:   { flex: 1, alignItems: 'center', paddingVertical: 8, borderBottomWidth: 2, borderBottomColor: 'transparent', gap: 4 },
  innerTabActive: { borderBottomColor: C.primary },
  innerTabLabel:  { fontSize: 9, fontWeight: '600', color: C.neutralMid },
  innerTabLabelActive: { color: C.primary },
  statPillRow:{ flexDirection: 'row', gap: spacing.sm, margin: spacing.md },
  statPill:   { flex: 1, borderRadius: radius.md, padding: 10, alignItems: 'center' },
  statPillNum:{ fontSize: typography.xl, fontWeight: '800' },
  statPillLabel: { fontSize: 10, fontWeight: '600', marginTop: 2 },
  filterRow:      { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xs },
  filterScroll:   { paddingVertical: spacing.xs },
  filterGear:     { paddingHorizontal: 12, paddingVertical: 6, justifyContent: 'center', alignItems: 'center' },
  filterChip:     { paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.full, backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  filterChipActive:   { backgroundColor: C.primary, borderColor: C.primary },
  filterChipText:     { fontSize: typography.xs, fontWeight: '600', color: C.neutralMid },
  filterChipTextActive: { color: C.card },
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: radius.md, marginHorizontal: spacing.md, marginTop: spacing.sm, paddingHorizontal: spacing.md },
  searchInput:{ flex: 1, paddingVertical: 10, fontSize: typography.sm, color: C.neutralDark },
  addBtn:     { backgroundColor: C.primary, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center', marginHorizontal: spacing.md, marginTop: spacing.sm, ...shadow.sm },
  addBtnText: { color: C.card, fontWeight: '700', fontSize: typography.sm },
  listPad:    { paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: 120 },
  itemCard:   { backgroundColor: C.card, borderRadius: radius.md, marginBottom: spacing.sm, ...shadow.sm, overflow: 'hidden' },
  itemCardTop:{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md },
  statusDot:  { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  itemName:   { fontSize: typography.sm, fontWeight: '700', color: C.neutralDark },
  itemSub:    { fontSize: typography.xs, color: C.neutralMid, marginTop: 3 },
  catBadge:   { borderRadius: radius.sm, paddingHorizontal: 7, paddingVertical: 2 },
  catBadgeText:{ fontSize: 10, fontWeight: '700' },
  itemActions:{ flexDirection: 'row', gap: 6, alignItems: 'center' },
  iconBtn:    { width: 30, height: 30, borderRadius: 15, backgroundColor: C.primary, justifyContent: 'center', alignItems: 'center' },
  iconBtnGhost:{ width: 28, height: 28, borderRadius: 8, backgroundColor: colors.background, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center' },
  iconBtnDanger:    { width: 28, height: 28, borderRadius: 8, backgroundColor: C.dangerLight, justifyContent: 'center', alignItems: 'center' },
  histCard:   { backgroundColor: C.card, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, ...shadow.sm },
  histTitle:  { fontSize: typography.sm, fontWeight: '700', color: C.neutralDark },
  histSub:    { fontSize: typography.xs, color: C.neutralMid, marginTop: 2 },
  histAmount: { fontSize: typography.md, fontWeight: '800', color: C.primary },
  lineTag:    { backgroundColor: colors.background, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 3 },
  lineTagText:{ fontSize: 10, color: C.neutralMid, fontWeight: '500' },
  supAvatar:  { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  supAvatarText: { fontSize: 18, fontWeight: '800' },
  emptyWrap:  { alignItems: 'center', paddingVertical: 48 },
  emptyText:  { fontSize: typography.sm, color: C.neutralMid, fontWeight: '500' },
  overlay:    { flex: 1, justifyContent: 'flex-end' },
  overlayBg:  { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet:      { backgroundColor: C.card, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, maxHeight: '75%' },
  sheetTall:  { maxHeight: '92%' },
  sheetHandle:{ width: 40, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: 'center', marginTop: 10 },
  sheetHeader:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: C.border },
  sheetTitle: { fontSize: typography.md, fontWeight: '800', color: C.neutralDark },
  sheetClose: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' },
  field:      { marginHorizontal: spacing.lg, marginBottom: spacing.md },
  fieldLabel: { fontSize: 10, fontWeight: '700', color: C.neutralMid, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 6 },
  tInput:     { backgroundColor: colors.background, borderRadius: radius.md, borderWidth: 1, borderColor: C.border, paddingHorizontal: spacing.md, paddingVertical: 11, fontSize: typography.sm, color: C.neutralDark },
  pickerPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.full, backgroundColor: colors.background, borderWidth: 1, borderColor: C.border, marginRight: 8 },
  pickerPillActive:   { backgroundColor: C.primary, borderColor: C.primary },
  pickerPillText:     { fontSize: typography.xs, fontWeight: '600', color: C.neutralMid },
  pickerPillTextActive:{ color: C.card },
  saveBtn:    { backgroundColor: C.primary, borderRadius: radius.md, padding: 14, alignItems: 'center', marginHorizontal: spacing.lg },
  saveBtnText:{ color: C.card, fontWeight: '800', fontSize: typography.sm },
  cancelBtn:  { backgroundColor: colors.background, borderRadius: radius.md, borderWidth: 1, borderColor: C.border, padding: 14, alignItems: 'center', marginHorizontal: spacing.lg },
  cancelBtnText: { color: C.neutralMid, fontWeight: '600', fontSize: typography.sm },
  lineInputRow: { flexDirection: 'row', gap: 6, marginTop: 4, alignItems: 'center' },
  addLineBtn: { width: 40, height: 44, borderRadius: radius.md, backgroundColor: C.primary, justifyContent: 'center', alignItems: 'center' },
  addLineBtnText: { color: C.card, fontSize: 22, fontWeight: '400', lineHeight: 26 },
  linesBox:   { marginHorizontal: spacing.lg, backgroundColor: colors.background, borderRadius: radius.md, borderWidth: 1, borderColor: C.border, padding: spacing.md, marginBottom: spacing.md },
  lineRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  lineRowName:{ flex: 2, fontSize: typography.xs, fontWeight: '600', color: C.neutralDark },
  lineRowQty: { fontSize: typography.xs, color: C.neutralMid, minWidth: 30 },
  lineRowPrice:{ fontSize: typography.xs, color: C.neutralMid, minWidth: 60 },
  lineRowSub: { fontSize: typography.xs, fontWeight: '700', color: C.primary, minWidth: 70 },
  periodSummary: { marginHorizontal: spacing.md, marginVertical: 8, backgroundColor: C.card, borderRadius: 10, padding: 10, ...shadow.sm },
  periodLabel:   { fontSize: 11, fontWeight: '700', color: C.neutralMid, marginBottom: 6 },
  periodStats:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  periodStat:    { fontSize: 12, color: C.neutralMid, fontWeight: '600' },
});

// Output grouped ingredient row styles
const og = StyleSheet.create({
  ingRow:  { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderTopWidth: 1, borderTopColor: C.neutralLight, gap: 8 },
  dot:     { width: 7, height: 7, borderRadius: 4, backgroundColor: C.primary, flexShrink: 0 },
  ingName: { flex: 1, fontSize: 13, fontWeight: '600', color: C.neutralDark },
  ingQty:  { fontSize: 13, fontWeight: '700', color: C.danger, minWidth: 80, textAlign: 'right' },
  ingCost: { fontSize: 11, color: C.neutralMid, minWidth: 80, textAlign: 'right' },
});

// Batch detail row styles
const bt = StyleSheet.create({
  row:       { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 10, marginBottom: 8 },
  rankBadge: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  rankNum:   { fontSize: 10, fontWeight: '900', color: '#fff' },
  qty:       { fontSize: 15, fontWeight: '800', color: C.neutralDark },
  expiry:    { fontSize: 12, fontWeight: '700', marginTop: 2 },
  date:      { fontSize: 10, color: C.neutralMid, marginTop: 1 },
});

// Per-item action button styles (matching website: Receive, Consume, Adjust, Edit, Delete)
const actBtn = StyleSheet.create({
  row:        { flexDirection: 'row', gap: 5, paddingHorizontal: spacing.md, paddingBottom: 12, paddingTop: 2 },
  btn:        { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, paddingVertical: 7, borderRadius: 7, borderWidth: 1 },
  btnText:    { fontSize: 10, fontWeight: '700' },
  btnReceive: { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  btnConsume: { backgroundColor: '#fff7ed', borderColor: '#fed7aa' },
  btnAdjust:  { backgroundColor: '#eef2ff', borderColor: '#c7d2fe' },
  btnEdit:    { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' },
  btnDelete:  { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
});

// Category management list styles
const cat_st = StyleSheet.create({
  row:          { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.background },
  dot:          { width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  dotTxt:       { fontSize: 14, fontWeight: '800' },
  name:         { flex: 1, fontSize: 14, fontWeight: '600', color: C.neutralDark },
  count:        { fontSize: 12, color: C.neutralMid },
  removeBtn:    { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, backgroundColor: C.dangerLight },
  removeBtnTxt: { fontSize: 12, fontWeight: '700', color: C.danger },
  hint:         { fontSize: 11, color: C.neutralMid, fontStyle: 'italic', marginTop: 10, lineHeight: 16 },
});

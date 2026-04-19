/**
 * AdminTables.js — Full Tables Management for Admin Panel
 * UI redesigned: modern stat cards, refined zone chips, clean table cards,
 * gear icon moved to header, Table Detail screen on card tap.
 * All data logic / API calls / status-update logic unchanged.
 */
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, ScrollView, FlatList, TouchableOpacity, TextInput,
  StyleSheet, Modal, ActivityIndicator, KeyboardAvoidingView,
  Platform, RefreshControl, TouchableWithoutFeedback, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { tablesAPI, usersAPI, ordersAPI, menuAPI } from '../../api/client';
import { useTranslation } from '../../context/LanguageContext';
import { colors, spacing, radius, shadow, typography, topInset } from '../../utils/theme';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import ConfirmDialog from '../../components/ConfirmDialog';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const DEFAULT_SECTIONS = ['Indoor', 'Outdoor', 'Terrace'];
const STATUSES         = ['free', 'occupied', 'reserved', 'cleaning'];

const STATUS_META = {
  free:     { label: 'Free',     color: '#16a34a', bg: '#dcfce7', border: '#86efac', accent: '#16a34a' },
  occupied: { label: 'Occupied', color: '#dc2626', bg: '#fee2e2', border: '#fca5a5', accent: '#dc2626' },
  reserved: { label: 'Reserved', color: '#2563eb', bg: '#dbeafe', border: '#93c5fd', accent: '#2563eb' },
  cleaning: { label: 'Cleaning', color: '#d97706', bg: '#fef9c3', border: '#fde68a', accent: '#d97706' },
};

const PALETTE = [
  { bg: '#e0e7ff', text: '#4338ca' },
  { bg: '#dcfce7', text: '#15803d' },
  { bg: '#f3e8ff', text: '#7e22ce' },
  { bg: '#ffedd5', text: '#c2410c' },
  { bg: '#ccfbf1', text: '#0f766e' },
  { bg: '#fee2e2', text: '#b91c1c' },
  { bg: '#fef9c3', text: '#a16207' },
  { bg: '#e0f2fe', text: '#0369a1' },
];

function secColor(sec, list) {
  const i = list.indexOf(sec);
  return PALETTE[i >= 0 ? i % PALETTE.length : 0];
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function elapsed(ms) {
  if (!ms || ms <= 0) return '00:00:00';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map(n => String(n).padStart(2, '0')).join(':');
}

function money(v) {
  return new Intl.NumberFormat('uz-UZ').format(Math.round(Number(v) || 0)) + " so'm";
}

// Formats reservation date/time cleanly — handles both "HH:MM" and ISO strings
function fmtResTime(table) {
  const date = table.reservation_date ? String(table.reservation_date).split('T')[0] : null;
  const time = table.reservation_time;
  if (!date && !time) return '';
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const todayStr = new Date().toISOString().split('T')[0];

  // Plain "HH:MM" time
  if (time && /^\d{1,2}:\d{2}$/.test(String(time).trim())) {
    if (!date || date === todayStr) return `Today · ${time}`;
    try {
      const d = new Date(date + 'T00:00:00');
      return `${MONTHS[d.getMonth()]} ${d.getDate()} · ${time}`;
    } catch (_) { return `${date} · ${time}`; }
  }

  // ISO timestamp (e.g. "2026-03-10T19:00:00.000Z")
  const raw = time || table.reservation_date || '';
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw;
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    if (d.toDateString() === new Date().toDateString()) return `Today · ${h}:${m}`;
    return `${MONTHS[d.getMonth()]} ${d.getDate()} · ${h}:${m}`;
  } catch (_) { return raw; }
}

// ─── SHEET (bottom modal) ─────────────────────────────────────────────────────
function Sheet({ visible, onClose, title, children }) {
  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent>
      <KeyboardAvoidingView style={S.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={S.overlayBg} />
        </TouchableWithoutFeedback>
        <View style={S.sheet}>
          <View style={S.sheetHandle} />
          <View style={S.sheetHead}>
            <Text style={S.sheetTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={S.sheetX}>
              <MaterialIcons name="close" size={16} color="#64748b" />
            </TouchableOpacity>
          </View>
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 48 }}
          >
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Field({ label, children }) {
  return (
    <View style={S.field}>
      <Text style={S.fieldLbl}>{label}</Text>
      {children}
    </View>
  );
}

function TInput(props) {
  return (
    <TextInput
      style={S.input}
      placeholderTextColor={colors.textMuted}
      {...props}
    />
  );
}

// ─── PhoneField with +998 country code ──────────────────────────────────────
function PhoneField({ value, onChange }) {
  function handleChange(raw) {
    const digits = raw.replace(/\D/g, '');
    const local = digits.startsWith('998') ? digits.slice(3) : digits;
    const d = local.slice(0, 9);
    let out = '+998';
    if (d.length > 0) out += ' ' + d.slice(0, 2);
    if (d.length > 2) out += ' ' + d.slice(2, 5);
    if (d.length > 5) out += ' ' + d.slice(5, 7);
    if (d.length > 7) out += ' ' + d.slice(7, 9);
    onChange(out);
  }
  const displayLocal = (() => {
    const digits = (value || '').replace(/\D/g, '');
    const local = digits.startsWith('998') ? digits.slice(3) : digits;
    const d = local.slice(0, 9);
    let out = '';
    if (d.length > 0) out += d.slice(0, 2);
    if (d.length > 2) out += ' ' + d.slice(2, 5);
    if (d.length > 5) out += ' ' + d.slice(5, 7);
    if (d.length > 7) out += ' ' + d.slice(7, 9);
    return out;
  })();
  return (
    <View style={[S.input, { flexDirection: 'row', alignItems: 'center', padding: 0, overflow: 'hidden' }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 13, backgroundColor: '#F1F5F9', borderRightWidth: 1, borderRightColor: '#E2E8F0', gap: 6 }}>
        <Text style={{ fontSize: 16 }}>🇺🇿</Text>
        <Text style={{ fontSize: 13, fontWeight: '700', color: '#374151' }}>+998</Text>
      </View>
      <TextInput
        style={{ flex: 1, paddingHorizontal: 12, paddingVertical: 13, fontSize: 15, color: '#0f172a' }}
        value={displayLocal}
        onChangeText={handleChange}
        placeholder="90 123 45 67"
        placeholderTextColor="#cbd5e1"
        keyboardType="phone-pad"
        maxLength={13}
      />
    </View>
  );
}

function Pills({ options, value, onSelect, sections }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {options.map(opt => {
          const active = value === opt;
          const c = sections ? secColor(opt, sections) : null;
          return (
            <TouchableOpacity
              key={opt}
              onPress={() => onSelect(opt)}
              style={[S.pill, active && (c ? { backgroundColor: c.bg, borderColor: c.text } : S.pillOn)]}
            >
              <Text style={[S.pillTxt, active && (c ? { color: c.text } : S.pillTxtOn)]}>
                {opt}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );
}

// ─── CALENDAR PICKER ──────────────────────────────────────────────────────────
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_NAMES   = ['Su','Mo','Tu','We','Th','Fr','Sa'];

function CalendarPicker({ value, onChange }) {
  const today = new Date();
  const parseVal = (v) => {
    if (!v) return { y: today.getFullYear(), m: today.getMonth() };
    const d = new Date(v + 'T00:00:00');
    if (isNaN(d.getTime())) return { y: today.getFullYear(), m: today.getMonth() };
    return { y: d.getFullYear(), m: d.getMonth() };
  };
  const [viewYear,  setViewYear]  = useState(() => parseVal(value).y);
  const [viewMonth, setViewMonth] = useState(() => parseVal(value).m);

  useEffect(() => {
    const p = parseVal(value);
    setViewYear(p.y);
    setViewMonth(p.m);
  }, [value]);

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDay    = new Date(viewYear, viewMonth, 1).getDay();
  const todayStr    = today.toISOString().split('T')[0];

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const rows = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  }

  return (
    <View style={CS.cal}>
      {/* Month navigation header */}
      <View style={CS.calHeader}>
        <TouchableOpacity onPress={prevMonth} style={CS.calNav} activeOpacity={0.7}>
          <MaterialIcons name="chevron-left" size={22} color="#374151" />
        </TouchableOpacity>
        <Text style={CS.calMonthTitle}>{MONTH_NAMES[viewMonth]} {viewYear}</Text>
        <TouchableOpacity onPress={nextMonth} style={CS.calNav} activeOpacity={0.7}>
          <MaterialIcons name="chevron-right" size={22} color="#374151" />
        </TouchableOpacity>
      </View>
      {/* Day-of-week labels */}
      <View style={CS.calRow}>
        {DAY_NAMES.map(d => (
          <View key={d} style={CS.calDayCell}>
            <Text style={CS.calDayName}>{d}</Text>
          </View>
        ))}
      </View>
      {/* Calendar grid */}
      {rows.map((row, ri) => (
        <View key={ri} style={CS.calRow}>
          {row.map((day, ci) => {
            if (!day) return <View key={ci} style={CS.calDayCell} />;
            const mm = String(viewMonth + 1).padStart(2, '0');
            const dd = String(day).padStart(2, '0');
            const dateStr    = `${viewYear}-${mm}-${dd}`;
            const isSelected = dateStr === value;
            const isToday    = dateStr === todayStr;
            return (
              <TouchableOpacity
                key={ci}
                style={[CS.calDayCell, isSelected && CS.calSelected, isToday && !isSelected && CS.calToday]}
                onPress={() => onChange(dateStr)}
                activeOpacity={0.7}
              >
                <Text style={[CS.calDayTxt, isSelected && CS.calSelectedTxt, isToday && !isSelected && CS.calTodayTxt]}>
                  {day}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// ─── HORIZONTAL TIME PICKER ───────────────────────────────────────────────────
function TimePicker({ value, onChange }) {
  const slots = [];
  for (let h = 0; h <= 23; h++) {
    for (const m of [0, 30]) {
      slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  const flatRef = useRef(null);

  useEffect(() => {
    if (!value || !flatRef.current) return;
    const idx = slots.indexOf(value);
    if (idx >= 0) {
      setTimeout(() => {
        flatRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
      }, 150);
    }
  }, [value]);

  return (
    <FlatList
      ref={flatRef}
      data={slots}
      horizontal
      keyExtractor={item => item}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 2, paddingVertical: 4 }}
      getItemLayout={(_, i) => ({ length: 72, offset: 72 * i, index: i })}
      onScrollToIndexFailed={() => {}}
      renderItem={({ item }) => {
        const active = item === value;
        return (
          <TouchableOpacity
            onPress={() => onChange(item)}
            style={[CS.timeSlot, active && CS.timeSlotActive]}
            activeOpacity={0.7}
          >
            <Text style={[CS.timeSlotTxt, active && CS.timeSlotActiveTxt]}>{item}</Text>
          </TouchableOpacity>
        );
      }}
    />
  );
}

function Btn({ label, onPress, loading, danger, outline }) {
  return (
    <TouchableOpacity
      style={[S.btn, danger && S.btnDanger, outline && S.btnOutline]}
      onPress={onPress}
      disabled={loading}
      activeOpacity={0.8}
    >
      {loading
        ? <ActivityIndicator color={outline ? colors.textMuted : '#fff'} />
        : <Text style={[S.btnTxt, outline && S.btnTxtOutline]}>{label}</Text>}
    </TouchableOpacity>
  );
}

// ─── TABLE DETAIL MODAL ───────────────────────────────────────────────────────
function TableDetailModal({ table, tick, sections, visible, onClose, onStatus, onEdit, onDelete, onQuickFree, onNewOrder, onSeatGuests }) {
  const [orderView,     setOrderView]     = useState(false);
  const [tableOrders,   setTableOrders]   = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  // Add Food state
  const [addFoodView,   setAddFoodView]   = useState(false);
  const [allMenuItems,  setAllMenuItems]  = useState([]);
  const [menuCategories,setMenuCategories]= useState([]);
  const [addFoodCat,    setAddFoodCat]    = useState(null);
  const [addFoodCart,   setAddFoodCart]   = useState({});
  const [addFoodSaving, setAddFoodSaving] = useState(false);

  // Reset sub-view whenever the sheet closes
  function handleClose() {
    setOrderView(false);
    setAddFoodView(false);
    setTableOrders([]);
    setAddFoodCart({});
    onClose();
  }

  async function openOrderView() {
    setOrderView(true);
    setOrdersLoading(true);
    try {
      const res = await ordersAPI.getByTable(table.id, true);
      const all = res.data || [];
      const active = all.filter(o => !['paid', 'cancelled'].includes(o.status));
      setTableOrders(active);
    } catch { setTableOrders([]); }
    setOrdersLoading(false);
  }

  async function openAddFood() {
    setAddFoodView(true);
    setAddFoodCart({});
    try {
      const [cats, items] = await Promise.all([menuAPI.getCategories(), menuAPI.getItems()]);
      const catsData = cats.data || [];
      const itemsData = items.data || [];
      setMenuCategories(catsData);
      setAllMenuItems(itemsData);
      if (catsData.length > 0) setAddFoodCat(catsData[0].id);
    } catch { setAllMenuItems([]); setMenuCategories([]); }
  }

  const addFoodCartTotal = Object.entries(addFoodCart).reduce((s, [id, qty]) => {
    const item = allMenuItems.find(i => i.id === id || i.id === parseInt(id));
    return s + (item ? (item.price || 0) * qty : 0);
  }, 0);

  const addFoodCartCount = Object.values(addFoodCart).reduce((s, q) => s + q, 0);

  async function handleAddFoodToOrder() {
    const activeOrder = tableOrders[0];
    if (!activeOrder) return;
    const items = Object.entries(addFoodCart)
      .filter(([, qty]) => qty > 0)
      .map(([id, quantity]) => ({ menuItemId: id, quantity }));
    if (items.length === 0) return;
    setAddFoodSaving(true);
    try {
      await ordersAPI.addItems(activeOrder.id, items);
      setAddFoodView(false);
      setAddFoodCart({});
      // Refresh order view
      openOrderView();
    } catch (e) {
      setDialog({ title: 'Error', message: 'Failed to add items to order.', type: 'error' });
    }
    setAddFoodSaving(false);
  }

  const filteredMenuItems = addFoodCat
    ? allMenuItems.filter(i => (i.category_id || i.categoryId) === addFoodCat || (i.category_id || i.categoryId) === parseInt(addFoodCat))
    : allMenuItems;

  // Safe early exit — component only mounts when table is set (see detailTable state)
  if (!table) return null;

  const meta   = STATUS_META[table.status] || STATUS_META.free;
  const sc     = secColor(table.section || 'Indoor', sections);
  const timeMs = table.status === 'occupied' && table.opened_at
    ? tick - new Date(table.opened_at).getTime() : 0;
  const name   = table.name || `Table ${table.table_number}`;

  return (
    <Sheet
      visible={visible}
      onClose={handleClose}
      title={orderView ? `Orders — ${name}` : name}
    >
      {addFoodView ? (
        /* ── ADD FOOD VIEW ── */
        <>
          <TouchableOpacity
            onPress={() => { setAddFoodView(false); setAddFoodCart({}); }}
            style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 4, paddingBottom: 8, gap: 6 }}
          >
            <MaterialIcons name="arrow-back" size={18} color="#475569" />
            <Text style={{ fontSize: 13, color: '#475569', fontWeight: '700' }}>Back to Orders</Text>
          </TouchableOpacity>

          {/* Category pills */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingHorizontal: 20, marginBottom: 8 }} contentContainerStyle={{ gap: 8, paddingRight: 20 }}>
            {menuCategories.map(cat => (
              <TouchableOpacity
                key={cat.id}
                onPress={() => setAddFoodCat(cat.id)}
                style={{
                  paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999,
                  backgroundColor: addFoodCat === cat.id ? colors.admin : '#f1f5f9',
                  borderWidth: 1.5,
                  borderColor: addFoodCat === cat.id ? colors.admin : '#e2e8f0',
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: addFoodCat === cat.id ? '#fff' : '#475569' }}>{cat.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Menu items */}
          <ScrollView style={{ flex: 1, paddingHorizontal: 20 }} contentContainerStyle={{ paddingBottom: 100 }}>
            {filteredMenuItems.map(item => {
              const qty = addFoodCart[item.id] || 0;
              return (
                <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#0f172a' }}>{item.name}</Text>
                    <Text style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{money(item.price || 0)}</Text>
                  </View>
                  {qty === 0 ? (
                    <TouchableOpacity
                      onPress={() => setAddFoodCart({ ...addFoodCart, [item.id]: 1 })}
                      style={{ width: 34, height: 34, borderRadius: 999, backgroundColor: colors.admin, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <MaterialIcons name="add" size={20} color="#fff" />
                    </TouchableOpacity>
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <TouchableOpacity
                        onPress={() => {
                          const newQty = qty - 1;
                          if (newQty <= 0) {
                            const c = { ...addFoodCart }; delete c[item.id]; setAddFoodCart(c);
                          } else {
                            setAddFoodCart({ ...addFoodCart, [item.id]: newQty });
                          }
                        }}
                        style={{ width: 30, height: 30, borderRadius: 999, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <MaterialIcons name="remove" size={16} color="#334155" />
                      </TouchableOpacity>
                      <Text style={{ fontSize: 15, fontWeight: '800', color: '#0f172a', minWidth: 20, textAlign: 'center' }}>{qty}</Text>
                      <TouchableOpacity
                        onPress={() => setAddFoodCart({ ...addFoodCart, [item.id]: qty + 1 })}
                        style={{ width: 30, height: 30, borderRadius: 999, backgroundColor: colors.admin, alignItems: 'center', justifyContent: 'center' }}
                      >
                        <MaterialIcons name="add" size={16} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>

          {/* Sticky Add to Order bar */}
          {addFoodCartCount > 0 && (
            <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e2e8f0' }}>
              <TouchableOpacity
                onPress={handleAddFoodToOrder}
                disabled={addFoodSaving}
                style={{ backgroundColor: '#0f172a', borderRadius: 14, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18 }}
              >
                <View style={{ backgroundColor: '#fff2', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>{addFoodCartCount}</Text>
                </View>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>{addFoodSaving ? 'Adding…' : 'Add to Order'}</Text>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{money(addFoodCartTotal)}</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      ) : orderView ? (
        /* ── ORDER VIEW ── */
        <>
          <TouchableOpacity
            onPress={() => setOrderView(false)}
            style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 4, paddingBottom: 8, gap: 6 }}
          >
            <MaterialIcons name="arrow-back" size={18} color="#475569" />
            <Text style={{ fontSize: 13, color: '#475569', fontWeight: '700' }}>Back to Table</Text>
          </TouchableOpacity>
          {ordersLoading ? (
          <View style={{ alignItems: 'center', padding: 40 }}>
            <ActivityIndicator size="large" color={colors.admin} />
            <Text style={{ marginTop: 12, color: '#94a3b8', fontSize: 14 }}>Loading orders…</Text>
          </View>
        ) : tableOrders.length === 0 ? (
          <View style={{ alignItems: 'center', padding: 40 }}>
            <MaterialIcons name="receipt-long" size={48} color="#e2e8f0" />
            <Text style={{ marginTop: 12, color: '#64748b', fontSize: 15, fontWeight: '700' }}>No orders found</Text>
            <Text style={{ color: '#94a3b8', fontSize: 13, marginTop: 4 }}>No active or recent orders for this table</Text>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 20, paddingBottom: 24 }}>
            {tableOrders.map(order => {
              const isPaid = order.status === 'paid';
              const sm = {
                pending:   { color: '#f59e0b', bg: '#fef9c3', label: 'Pending' },
                confirmed: { color: '#3b82f6', bg: '#dbeafe', label: 'Confirmed' },
                preparing: { color: '#8b5cf6', bg: '#ede9fe', label: 'Preparing' },
                ready:     { color: '#10b981', bg: '#d1fae5', label: 'Ready' },
                served:    { color: '#6366f1', bg: '#e0e7ff', label: 'Served' },
                paid:      { color: '#16a34a', bg: '#dcfce7', label: 'Paid' },
                cancelled: { color: '#dc2626', bg: '#fee2e2', label: 'Cancelled' },
              }[order.status] || { color: '#94a3b8', bg: '#f1f5f9', label: order.status };
              return (
                <View key={order.id} style={{ backgroundColor: '#fff', borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: isPaid ? '#bbf7d0' : '#e2e8f0', overflow: 'hidden' }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, paddingBottom: 10 }}>
                    <View>
                      <Text style={{ fontSize: 15, fontWeight: '800', color: '#0f172a' }}>
                        #{(order.daily_number || order.id?.slice(0, 6) || '—').toString().toUpperCase()}
                      </Text>
                      <Text style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                        {order.waitress_name ? `👤 ${order.waitress_name}` : 'No waiter assigned'}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: sm.bg }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: sm.color }}>{sm.label}</Text>
                      </View>
                      <Text style={{ fontSize: 14, fontWeight: '800', color: '#0f172a' }}>
                        {money(order.total_amount || 0)}
                      </Text>
                    </View>
                  </View>
                  {(order.items || []).length > 0 && (
                    <View style={{ borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingHorizontal: 14, paddingVertical: 10 }}>
                      {(order.items || []).map((item, idx) => (
                        <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
                          <Text style={{ fontSize: 13, color: '#334155', flex: 1 }}>
                            <Text style={{ fontWeight: '700' }}>{item.quantity}×</Text> {item.name || item.menu_item_name || '—'}
                          </Text>
                          <Text style={{ fontSize: 13, color: '#64748b', fontWeight: '600' }}>
                            {money((item.price || item.unit_price || 0) * item.quantity)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                  {(order.notes || order.special_instructions) ? (
                    <View style={{ borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingHorizontal: 14, paddingVertical: 8 }}>
                      <Text style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic' }}>
                        📝 {order.notes || order.special_instructions}
                      </Text>
                    </View>
                  ) : null}
                </View>
              );
            })}

            {/* Add Food button */}
            <TouchableOpacity
              onPress={openAddFood}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4, paddingVertical: 14, borderRadius: 14, backgroundColor: '#0f172a' }}
            >
              <MaterialIcons name="add-circle-outline" size={18} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>Add Food</Text>
            </TouchableOpacity>
          </View>
        )}
        </>
      ) : (
        /* ── TABLE DETAIL VIEW ── */
        <>
      {/* ── Status + zone header ── */}
      <View style={S.detHdr}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <View style={[S.detZoneChip, { backgroundColor: sc.bg }]}>
            <Text style={[S.detZoneTxt, { color: sc.text }]}>{table.section || 'Indoor'}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <MaterialIcons name="chair" size={14} color="#64748b" />
            <Text style={S.detSeats}>{table.capacity || 4} seats</Text>
          </View>
        </View>
        <View style={[S.detStatusBadge, { backgroundColor: meta.bg }]}>
          <View style={[S.detStatusDot, { backgroundColor: meta.color }]} />
          <Text style={[S.detStatusTxt, { color: meta.color }]}>{meta.label}</Text>
        </View>
      </View>

      <View style={[S.detAccentBar, { backgroundColor: meta.accent }]} />

      {/* ── FREE ── */}
      {table.status === 'free' && (
        <View style={S.detBody}>
          <View style={S.detInfoCard}>
            <MaterialIcons name="check-circle" size={40} color="#16a34a" />
            <Text style={S.detBigLabel}>Available</Text>
            <Text style={S.detBigSub}>Ready to seat guests</Text>
          </View>
          <View style={S.detBtnRow}>
            <TouchableOpacity style={[S.detActionBtn, S.detActionBtnPrimary]} onPress={() => { handleClose(); onNewOrder && onNewOrder(table); }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <MaterialIcons name="edit-note" size={16} color="#fff" />
                <Text style={S.detActionBtnPrimaryTxt}>New Order</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={[S.detActionBtn, S.detActionBtnOutline]} onPress={() => { handleClose(); onStatus(table); }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <MaterialIcons name="tune" size={16} color="#334155" />
                <Text style={S.detActionBtnOutlineTxt}>Status</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── OCCUPIED ── */}
      {table.status === 'occupied' && (
        <View style={S.detBody}>
          {/* Timer + amount hero row */}
          <View style={S.detHeroRow}>
            <View style={S.detHeroBlock}>
              <Text style={S.detHeroVal}>⏱ {elapsed(timeMs)}</Text>
              <Text style={S.detHeroLbl}>Time Elapsed</Text>
            </View>
            {Number(table.order_total) > 0 && (
              <View style={[S.detHeroBlock, { borderLeftWidth: 1, borderLeftColor: '#f1f5f9' }]}>
                <Text style={[S.detHeroVal, { color: '#0f172a' }]}>{money(table.order_total)}</Text>
                <Text style={S.detHeroLbl}>Order Total</Text>
              </View>
            )}
          </View>
          {/* Info grid */}
          <View style={S.detInfoCard}>
            {[
              table.waitress_name && ['Waiter',   table.waitress_name, 'person'],
              table.guests_count  && ['Guests',   `${table.guests_count} guests`, 'group'],
              table.order_status  && ['Status',   table.order_status, 'assignment'],
            ].filter(Boolean).map(([k, v, icon]) => (
              <View key={k} style={S.detRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <MaterialIcons name={icon} size={14} color="#64748b" />
                  <Text style={S.detRowKey}>{k}</Text>
                </View>
                <Text style={S.detRowVal}>{v}</Text>
              </View>
            ))}
          </View>
          <View style={S.detBtnRow}>
            <TouchableOpacity style={[S.detActionBtn, S.detActionBtnPrimary]} onPress={openOrderView}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <MaterialIcons name="assignment" size={16} color="#fff" />
                <Text style={S.detActionBtnPrimaryTxt}>View Full Order</Text>
              </View>
            </TouchableOpacity>
          </View>
          <View style={[S.detBtnRow, { marginTop: 0 }]}>
            <TouchableOpacity style={[S.detActionBtn, S.detActionBtnOutline, { flex: 1 }]} onPress={() => { handleClose(); onStatus(table); }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <MaterialIcons name="settings" size={16} color="#334155" />
                <Text style={S.detActionBtnOutlineTxt}>Change Status</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={[S.detActionBtn, { flex: 1, backgroundColor: '#dcfce7', marginLeft: 8 }]} onPress={() => { handleClose(); onQuickFree(table); }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <MaterialIcons name="check" size={16} color="#16a34a" />
                <Text style={[S.detActionBtnPrimaryTxt, { color: '#16a34a' }]}>Free Table</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── RESERVED ── */}
      {table.status === 'reserved' && (
        <View style={S.detBody}>
          <View style={S.detInfoCard}>
            {[
              table.reservation_guest && ['Guest',  table.reservation_guest, 'person'],
              table.reservation_phone && ['Phone',  table.reservation_phone, 'phone'],
              fmtResTime(table)       && ['Time',   fmtResTime(table), 'calendar-today'],
              table.guests_count      && ['Guests', `${table.guests_count} guests`, 'group'],
            ].filter(Boolean).map(([k, v, icon]) => (
              <View key={k} style={S.detRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <MaterialIcons name={icon} size={14} color="#64748b" />
                  <Text style={S.detRowKey}>{k}</Text>
                </View>
                <Text style={S.detRowVal}>{v}</Text>
              </View>
            ))}
          </View>
          <View style={S.detBtnRow}>
            <TouchableOpacity style={[S.detActionBtn, S.detActionBtnPrimary]} onPress={() => { handleClose(); onSeatGuests && onSeatGuests(table); }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <MaterialIcons name="group" size={16} color="#fff" />
                <Text style={S.detActionBtnPrimaryTxt}>Seat Guests</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={[S.detActionBtn, { backgroundColor: '#fee2e2' }]} onPress={() => { handleClose(); onQuickFree(table); }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <MaterialIcons name="close" size={16} color="#dc2626" />
                <Text style={[S.detActionBtnPrimaryTxt, { color: '#dc2626' }]}>Cancel Reservation</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── CLEANING ── */}
      {table.status === 'cleaning' && (
        <View style={S.detBody}>
          <View style={S.detInfoCard}>
            <MaterialIcons name="cleaning-services" size={40} color="#d97706" />
            <Text style={S.detBigLabel}>Being Cleaned</Text>
            <Text style={S.detBigSub}>Table is currently being cleaned</Text>
          </View>
          <View style={S.detBtnRow}>
            <TouchableOpacity style={[S.detActionBtn, S.detActionBtnPrimary]} onPress={() => { handleClose(); onQuickFree(table); }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <MaterialIcons name="check" size={16} color="#fff" />
                <Text style={S.detActionBtnPrimaryTxt}>Mark as Clean</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      )}

        {/* ── Footer actions (always shown) ── */}
        <View style={[S.detFooter]}>
          <TouchableOpacity style={S.detFooterBtn} onPress={() => { handleClose(); onEdit(table); }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <MaterialIcons name="edit" size={16} color="#475569" />
              <Text style={S.detFooterBtnTxt}>Edit Table</Text>
            </View>
          </TouchableOpacity>
          <View style={{ width: 1, backgroundColor: '#e2e8f0' }} />
          <TouchableOpacity style={S.detFooterBtn} onPress={() => { handleClose(); onDelete(table); }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <MaterialIcons name="delete" size={16} color="#dc2626" />
              <Text style={[S.detFooterBtnTxt, { color: '#dc2626' }]}>Delete</Text>
            </View>
          </TouchableOpacity>
        </View>
      </>
      )}
    </Sheet>
  );
}

// ─── TABLE CARD ───────────────────────────────────────────────────────────────
function TableCard({ table, tick, sections, onPress, onEdit, onStatus, onDelete }) {
  const meta   = STATUS_META[table.status] || STATUS_META.free;
  const sc     = secColor(table.section || 'Indoor', sections);
  const timeMs = table.status === 'occupied' && table.opened_at
    ? tick - new Date(table.opened_at).getTime() : 0;

  const cardBg = {
    free:     '#f0fdf4',
    occupied: '#fff5f5',
    reserved: '#eff6ff',
    cleaning: '#fffbeb',
  }[table.status] || '#f8fafc';

  return (
    <TouchableOpacity
      style={[S.card, { backgroundColor: cardBg, borderColor: meta.color + '50' }]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {/* Status dot — top right */}
      <View style={[S.tableStatusDot, { backgroundColor: meta.color }]} />

      {/* ── Centered content — flex: 1 fills space between top and footer ── */}
      <View style={S.cardCenter}>

        {/* Section chip */}
        <View style={[S.secTag, { backgroundColor: sc.bg, marginBottom: 5 }]}>
          <Text style={[S.secTagTxt, { color: sc.text }]}>{table.section || 'Indoor'}</Text>
        </View>

        {/* Icon */}
        <MaterialIcons name="table-restaurant" size={24} color={meta.color} />

        {/* Table name */}
        <Text style={S.cardName} numberOfLines={1}>
          {table.name || `Table ${table.table_number}`}
        </Text>

        {/* Status body — fixed 44px height so all cards stay same size */}
        <View style={{ height: 44, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
          {table.status === 'free' && (
            <View style={S.freeRow}>
              <MaterialIcons name="chair" size={11} color="#475569" />
              <Text style={S.seatsChip}>{table.capacity || 4}</Text>
              <Text style={S.availTxt}> · Free</Text>
            </View>
          )}

          {table.status === 'occupied' && (
            <View style={{ alignItems: 'center' }}>
              <Text style={S.occVal}>{elapsed(timeMs)}</Text>
              {Number(table.order_total) > 0 && (
                <Text style={[S.occRowTxt, { fontSize: 10, textAlign: 'center' }]} numberOfLines={1}>
                  {money(table.order_total)}
                </Text>
              )}
            </View>
          )}

          {table.status === 'reserved' && (
            <View style={{ alignItems: 'center' }}>
              {table.reservation_guest ? (
                <Text style={[S.resName, { textAlign: 'center', fontSize: 11 }]} numberOfLines={1}>
                  {table.reservation_guest}
                </Text>
              ) : null}
              {fmtResTime(table) ? (
                <Text style={[S.resSub, { textAlign: 'center' }]} numberOfLines={1}>{fmtResTime(table)}</Text>
              ) : null}
            </View>
          )}

          {table.status === 'cleaning' && (
            <Text style={[S.cleanTxt, { textAlign: 'center' }]}>Cleaning...</Text>
          )}
        </View>
      </View>

      {/* ── Footer action buttons ── */}
      <View style={S.cardFooter}>
        <TouchableOpacity
          style={S.iconBtn}
          onPress={() => onEdit(table)}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <MaterialIcons name="settings" size={14} color="#475569" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[S.iconBtn, S.iconBtnDanger]}
          onPress={() => onDelete(table)}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <MaterialIcons name="delete" size={14} color="#dc2626" />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN SCREEN
// ═══════════════════════════════════════════════════════════════════════════════
export default function AdminTables({ navigation }) {
  const { t } = useTranslation();
  const [tables,    setTables]    = useState([]);
  const [waiters,   setWaiters]   = useState([]);
  const [sections,  setSections]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [refreshing,setRefreshing]= useState(false);
  const [activeTab, setActiveTab] = useState('All');
  const [dialog,    setDialog]    = useState(null);

  const [tick,      setTick]      = useState(Date.now());

  // Pending-write shields: map of lowercase section name -> expiry timestamp.
  // These protect the optimistic UI from a 5 s syncTables response that would
  // briefly resurrect a just-deleted chip or hide a just-added one before the
  // backend has persisted the write.
  const pendingSecDeletesRef = useRef(new Map());
  const pendingSecAddsRef    = useRef(new Map());
  const SEC_PENDING_TTL_MS   = 8000;

  // Apply the shields to a server sections snapshot, returning the list to
  // hand to setSections(). Exported as a function so both load() and
  // syncTables() go through it.
  const reconcileSections = useCallback((serverList) => {
    const now = Date.now();
    for (const m of [pendingSecDeletesRef.current, pendingSecAddsRef.current]) {
      for (const [k, exp] of m) if (exp < now) m.delete(k);
    }
    const seen = new Set();
    const merged = [];
    for (const name of serverList || []) {
      const lc = String(name).toLowerCase();
      if (pendingSecDeletesRef.current.has(lc)) continue;
      if (seen.has(lc)) continue;
      seen.add(lc);
      merged.push(name);
    }
    for (const [lc] of pendingSecAddsRef.current) {
      if (!seen.has(lc)) {
        merged.push(lc);
        seen.add(lc);
      }
    }
    return merged;
  }, []);

  // detail modal — two-state open: table is set first (mounts the component with
  // visible=false), then detailVisible transitions to true one frame later.
  // This is required on Android Fabric/Bridgeless where a Modal created for the
  // first time already visible never shows.  The split also ensures the component
  // is fully unmounted (no invisible touch-blocking overlay) when closed.
  const [detailTable,   setDetailTable]   = useState(null);
  const [detailVisible, setDetailVisible] = useState(false);

  // sheets
  const [addSheet,    setAddSheet]    = useState(false);
  const [editSheet,   setEditSheet]   = useState(null);
  const [statusSheet, setStatusSheet] = useState(null);
  const [deleteSheet, setDeleteSheet] = useState(null);
  const [secSheet,    setSecSheet]    = useState(false);

  // form
  const blank = (secs) => ({ name: '', seats: '4', section: secs[0] || 'Indoor' });
  const [form,   setForm]   = useState(blank(DEFAULT_SECTIONS));
  const [saving, setSaving] = useState(false);
  const fi = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // status form
  const [newStatus, setNewStatus] = useState('free');
  const [occGuests, setOccGuests] = useState('2');
  const [occWaiter, setOccWaiter] = useState(null);
  const [resGuest,  setResGuest]  = useState('');
  const [resPhone,  setResPhone]  = useState('');
  const [resDate,   setResDate]   = useState('');
  const [resTime,   setResTime]   = useState('');

  // section mgmt
  const [newSecName, setNewSecName] = useState('');

  // ── tick (UI timer for occupied duration) ───────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // ── load ────────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      const [tRes, uRes, sRes] = await Promise.allSettled([
        tablesAPI.getAll(),
        usersAPI.getAll(),
        tablesAPI.getSections(),
      ]);
      if (tRes.status === 'fulfilled') {
        const rows = tRes.value.data || [];
        setTables(rows);
      }
      if (uRes.status === 'fulfilled') {
        const all   = uRes.value.data || [];
        const staff = all.filter(u => u.role === 'waitress' || u.role === 'waiter');
        setWaiters(staff.length ? staff : all);
      }
      if (sRes.status === 'fulfilled') {
        // Trust the backend completely — whatever it returns is the source of
        // truth (including custom sections like "Karvat" or "VIP" added from
        // the website). Only fall back to defaults if the API itself failed.
        const secs = sRes.value.data;
        setSections(Array.isArray(secs) ? reconcileSections(secs) : DEFAULT_SECTIONS);
      } else {
        // API failed — fall back to defaults so the app still works
        setSections(DEFAULT_SECTIONS);
      }
    } catch (_) {}
    setLoading(false);
    setRefreshing(false);
  }, [reconcileSections]);

  // ── silent poll every 5 s — keeps tables in sync with DB & website ──────────
  const syncTables = useCallback(async () => {
    try {
      const [tRes, sRes] = await Promise.allSettled([
        tablesAPI.getAll(),
        tablesAPI.getSections(),
      ]);
      if (tRes.status === 'fulfilled') {
        const rows = tRes.value.data || [];
        setTables(rows);
      }
      if (sRes.status === 'fulfilled') {
        // Always honour the backend list — including additions ("Karvat") and
        // deletions made on the website. Previously we only updated when the
        // list was non-empty, which froze custom sections out of the app.
        // Filter through pending-write shields so optimistic adds/deletes
        // aren't snapped back during the brief window before the backend
        // reflects the change.
        const secs = sRes.value.data;
        if (Array.isArray(secs)) setSections(reconcileSections(secs));
      }
    } catch (_) {}
  }, [reconcileSections]);

  useEffect(() => { load(); }, [load]);

  // auto-sync: poll every 5 seconds so changes made on website show up here
  useEffect(() => {
    const iv = setInterval(syncTables, 5000);
    return () => clearInterval(iv);
  }, [syncTables]);

  // ── derived ─────────────────────────────────────────────────────────────────
  const filtered = activeTab === 'All'
    ? tables
    : tables.filter(t => (t.section || sections[0]) === activeTab);

  // Pad to a multiple of 3 so the last row always has exactly 3 equal-width cards
  const gridData = useMemo(() => {
    const rem = filtered.length % 3;
    if (rem === 0) return filtered;
    const fillers = Array.from({ length: 3 - rem }, (_, i) => ({ id: `__filler_${i}`, _filler: true }));
    return [...filtered, ...fillers];
  }, [filtered]);

  const cntFree     = tables.filter(t => t.status === 'free').length;
  const cntOccupied = tables.filter(t => t.status === 'occupied').length;
  const cntReserved = tables.filter(t => t.status === 'reserved').length;
  const cntCleaning = tables.filter(t => t.status === 'cleaning').length;
  const occupancy   = tables.length ? Math.round(cntOccupied / tables.length * 100) : 0;
  const activeValue = tables.reduce((s, t) => s + (Number(t.order_total) || 0), 0);

  // ── add table ───────────────────────────────────────────────────────────────
  async function addTable() {
    if (!form.name.trim()) { setDialog({ title: 'Required', message: 'Enter a table name', type: 'warning' }); return; }
    setSaving(true);
    try {
      await tablesAPI.create({
        capacity: parseInt(form.seats) || 4,
        name:     form.name.trim(),
        section:  form.section,
      });
      setAddSheet(false);
      setForm(blank(sections));
      load();
    } catch (e) {
      setDialog({ title: 'Error', message: e?.response?.data?.error || 'Failed to add table', type: 'error' });
    }
    setSaving(false);
  }

  // ── edit table ──────────────────────────────────────────────────────────────
  function openEdit(t) {
    setForm({
      name:    t.name || `Table ${t.table_number}`,
      seats:   String(t.capacity || 4),
      section: t.section || sections[0] || 'Indoor',
    });
    setEditSheet(t);
  }

  async function saveEdit() {
    if (!form.name.trim()) { setDialog({ title: 'Required', message: 'Enter a table name', type: 'warning' }); return; }
    setSaving(true);
    try {
      await tablesAPI.update(editSheet.id, {
        name:     form.name.trim(),
        capacity: parseInt(form.seats) || 4,
        section:  form.section,
      });
      setEditSheet(null);
      load();
    } catch (e) {
      setDialog({ title: 'Error', message: e?.response?.data?.error || 'Failed to save', type: 'error' });
    }
    setSaving(false);
  }

  // ── delete ──────────────────────────────────────────────────────────────────
  function openDelete(t) {
    setDeleteSheet({ table: t, blocked: t.status === 'occupied' || t.status === 'reserved' });
  }

  async function confirmDelete() {
    setSaving(true);
    try {
      await tablesAPI.delete(deleteSheet.table.id);
      setDeleteSheet(null);
      load();
    } catch (e) {
      setDialog({ title: 'Error', message: e?.response?.data?.error || 'Delete failed', type: 'error' });
    }
    setSaving(false);
  }

  // ── status ──────────────────────────────────────────────────────────────────
  function openStatus(t) {
    setNewStatus(t.status || 'free');
    setOccGuests(String(t.guests_count || 2));
    setOccWaiter(t.assigned_to || waiters[0]?.id || null);
    setResGuest(t.reservation_guest || '');
    setResPhone(t.reservation_phone || '');

    // Parse date — strip time portion from ISO strings (e.g. "2026-03-10T19:00:00.000Z" → "2026-03-10")
    const rawDate = t.reservation_date || '';
    const cleanDate = rawDate ? String(rawDate).split('T')[0] : '';
    setResDate(cleanDate);

    // Parse time — if it's an ISO string, extract HH:MM; otherwise keep as-is
    const rawTime = t.reservation_time || '';
    let cleanTime = rawTime;
    if (rawTime && String(rawTime).includes('T')) {
      try {
        const d = new Date(rawTime);
        if (!isNaN(d.getTime())) {
          cleanTime = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        }
      } catch (_) {}
    }
    setResTime(cleanTime);

    setStatusSheet(t);
  }

  async function applyStatus() {
    setSaving(true);
    const appliedTable  = statusSheet;
    const appliedStatus = newStatus;
    try {
      if (newStatus === 'free') {
        await tablesAPI.close(statusSheet.id);
      } else if (newStatus === 'occupied') {
        await tablesAPI.open(statusSheet.id, {
          guests_count: parseInt(occGuests) || 1,
          assigned_to:  occWaiter,
        });
      } else {
        await tablesAPI.update(statusSheet.id, {
          status:            newStatus,
          reservation_guest: newStatus === 'reserved' ? resGuest : null,
          reservation_phone: newStatus === 'reserved' ? resPhone : null,
          reservation_date:  newStatus === 'reserved' ? resDate  : null,
          reservation_time:  newStatus === 'reserved' ? resTime  : null,
        });
      }
      setStatusSheet(null);
      load();
      // After marking as occupied, go straight to new order (same as website)
      if (appliedStatus === 'occupied') {
        navigation.navigate('CashierWalkin', { prefillTable: appliedTable });
      }
    } catch (e) {
      setDialog({ title: 'Error', message: e?.response?.data?.error || 'Failed to update status', type: 'error' });
    }
    setSaving(false);
  }

  // ── quick free (used by Detail modal buttons: Free Table, Mark as Clean, Cancel Reservation)
  async function quickFree(t) {
    try {
      await tablesAPI.close(t.id);
      load();
    } catch (e) {
      setDialog({ title: 'Error', message: e?.response?.data?.error || 'Failed to update table', type: 'error' });
    }
  }

  async function seatGuestsFromReservation(table) {
    try {
      await tablesAPI.open(table.id, {
        guests_count: table.guests_count || 1,
        assigned_to:  table.assigned_to  || null,
      });
      load();
      navigation.navigate('CashierWalkin', { prefillTable: table });
    } catch (e) {
      setDialog({ title: 'Error', message: e?.response?.data?.error || 'Failed to seat guests', type: 'error' });
    }
  }

  // ── sections ────────────────────────────────────────────────────────────────
  function addSection() {
    const name = newSecName.trim();
    if (!name) { setDialog({ title: 'Required', message: 'Enter section name', type: 'warning' }); return; }
    if (sections.map(s => s.toLowerCase()).includes(name.toLowerCase())) {
      setDialog({ title: 'Exists', message: 'Section already exists', type: 'warning' }); return;
    }
    const lc = name.toLowerCase();
    // Optimistic update — instant UI
    setSections(prev => [...prev, name]);
    setNewSecName('');
    // Shield against the syncTables poll briefly hiding the chip before the
    // server has acknowledged the add.
    pendingSecAddsRef.current.set(lc, Date.now() + SEC_PENDING_TTL_MS);
    tablesAPI.addSection(name)
      .then(() => { pendingSecAddsRef.current.delete(lc); })
      .catch(() => { pendingSecAddsRef.current.delete(lc); });
  }

  function removeSection(sec) {
    const count = tables.filter(t => (t.section || '').toLowerCase() === sec.toLowerCase()).length;
    if (count > 0) {
      setDialog({ title: 'Cannot Remove', message: `"${sec}" has ${count} table(s). Move them first.`, type: 'warning' });
      return;
    }
    const lc = sec.toLowerCase();
    // Optimistic update — instant UI
    setSections(prev => prev.filter(s => s.toLowerCase() !== lc));
    if (activeTab === sec) setActiveTab('All');
    // Shield the syncTables poll for SEC_PENDING_TTL_MS so the chip doesn't
    // pop back the next time we fetch /sections before the DELETE persists.
    pendingSecDeletesRef.current.set(lc, Date.now() + SEC_PENDING_TTL_MS);
    tablesAPI.deleteSection(sec)
      .then(() => {
        // Backend confirmed — keep the shield until TTL anyway, in case the
        // GET endpoint's UNION with restaurant_tables briefly resurrects via
        // a stale cached row. The shield expires on its own.
      })
      .catch(() => {
        // Persist failed — drop the shield so the next poll restores truth.
        pendingSecDeletesRef.current.delete(lc);
      });
  }

  // ── loading ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={S.center}>
        <ActivityIndicator size="large" color={colors.admin} />
      </View>
    );
  }

  const tabs = ['All', ...sections];

  // ── stat cards config ────────────────────────────────────────────────────────
  const statCards = [
    { lbl: 'Free',     n: cntFree,     col: '#16a34a', lightCol: '#86efac', bg: '#f0fdf4', border: '#bbf7d0', icon: 'check-circle',   sub: `${tables.length ? Math.round(cntFree / tables.length * 100) : 0}% of tables` },
    { lbl: 'Occupied', n: cntOccupied, col: '#dc2626', lightCol: '#fca5a5', bg: '#fff1f2', border: '#fecaca', icon: 'error',           sub: `${occupancy}% occupancy` },
    { lbl: 'Reserved', n: cntReserved, col: '#2563eb', lightCol: '#93c5fd', bg: '#eff6ff', border: '#bfdbfe', icon: 'event-available', sub: 'upcoming guests' },
    { lbl: 'Cleaning', n: cntCleaning, col: '#d97706', lightCol: '#fcd34d', bg: '#fffbeb', border: '#fde68a', icon: 'auto-fix-high',   sub: 'being prepared' },
  ];

  return (
    <SafeAreaView style={S.root} edges={['bottom']}>

      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />
      {/* ── Header ── */}
      <View style={S.header}>
        <View>
          <Text style={S.headerTitle}>{t('nav.tables')}</Text>
          <Text style={S.headerSub}>{tables.length} tables · {cntOccupied} occupied</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {/* Gear moved here from tab bar */}
          <TouchableOpacity style={S.headerIconBtn} onPress={() => setSecSheet(true)}>
            <MaterialIcons name="settings" size={20} color="#475569" />
          </TouchableOpacity>
          <View style={S.avatar}>
            <Text style={S.avatarTxt}>A</Text>
          </View>
        </View>
      </View>

      {/* ── Grid (stat cards + floor summary + tabs scroll with list) ── */}
      <FlatList
        data={gridData}
        keyExtractor={t => String(t.id)}
        numColumns={3}
        columnWrapperStyle={S.row}
        contentContainerStyle={S.gridContent}
        showsVerticalScrollIndicator={false}
        extraData={tick}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={colors.admin}
          />
        }
        ListHeaderComponent={
          <>
            {/* ── Stat Cards (2 × 2 grid) ── */}
            <View style={S.statGrid}>
              {statCards.map(({ lbl, n, col, lightCol, bg, border, icon, sub }) => (
                <View key={lbl} style={[S.statCard2, { backgroundColor: bg, borderColor: border }]}>
                  <View style={[S.statIconBadge, { backgroundColor: col }]}>
                    <MaterialIcons name={icon} size={13} color="#fff" />
                  </View>
                  <View style={S.statCardBody}>
                    <Text style={[S.statCardLbl, { color: col }]}>{lbl.toUpperCase()}</Text>
                    <Text style={[S.statCardNum, { color: col }]}>{n}</Text>
                    <Text style={[S.statCardSub, { color: lightCol }]}>{sub}</Text>
                  </View>
                  <View style={S.statWatermark} pointerEvents="none">
                    <MaterialIcons name={icon} size={32} color={lightCol} style={{ opacity: 0.32 }} />
                  </View>
                </View>
              ))}
            </View>

            {/* ── Floor Summary ── */}
            <View style={S.floorSummary}>
              <View style={S.floorSummaryRow}>
                <View style={S.floorSummaryLabel}>
                  <MaterialIcons name="bar-chart" size={11} color="#94a3b8" />
                  <Text style={S.floorSummaryLabelTxt}>{t('admin.tables.floorSummary').toUpperCase()}</Text>
                </View>
                <View style={S.floorStatRow}>
                  <View style={S.floorStat}>
                    <Text style={S.floorStatNum}>{tables.length}</Text>
                    <Text style={S.floorStatLbl}>Tables</Text>
                  </View>
                  <View style={S.floorStatDivider} />
                  <View style={S.floorStat}>
                    <Text style={[S.floorStatNum, { color: '#dc2626' }]}>{occupancy}%</Text>
                    <Text style={S.floorStatLbl}>Occupied</Text>
                  </View>
                  <View style={S.floorStatDivider} />
                  <View style={S.floorStat}>
                    <Text style={[S.floorStatNum, { color: '#16a34a' }]}>
                      {activeValue >= 1000000
                        ? (activeValue / 1000000).toFixed(1) + 'M'
                        : activeValue >= 1000
                        ? (activeValue / 1000).toFixed(0) + 'K'
                        : Math.round(activeValue).toString()}
                    </Text>
                    <Text style={S.floorStatLbl}>so'm Active</Text>
                  </View>
                </View>
              </View>
              <View style={S.floorBarTrack}>
                <View style={[S.floorBarFill, { width: `${Math.min(occupancy, 100)}%` }]} />
              </View>
              <View style={S.floorLegend}>
                {[
                  { dot: '#16a34a', lbl: `${cntFree} free` },
                  { dot: '#dc2626', lbl: `${cntOccupied} occupied` },
                  { dot: '#2563eb', lbl: `${cntReserved} reserved` },
                ].map(({ dot, lbl }) => (
                  <View key={lbl} style={S.floorLegendItem}>
                    <View style={[S.floorLegendDot, { backgroundColor: dot }]} />
                    <Text style={S.floorLegendTxt}>{lbl}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* ── Zone Filter Chips ── */}
            <View style={S.tabBar}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={S.tabScroll}
              >
                {tabs.map(t => (
                  <TouchableOpacity
                    key={t}
                    style={[S.tab, activeTab === t && S.tabActive]}
                    onPress={() => setActiveTab(t)}
                  >
                    <Text style={[S.tabTxt, activeTab === t && S.tabTxtActive]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </>
        }
        ListEmptyComponent={
          <View style={S.empty}>
            <MaterialIcons name="chair" size={44} color="#e5e7eb" />
            <Text style={S.emptyTxt}>{t('admin.tables.noTablesYet')}</Text>
            <Text style={S.emptySub}>{t('admin.tables.createFirstTable')}</Text>
          </View>
        }
        renderItem={({ item }) => {
          if (item._filler) return <View style={{ flex: 1, marginBottom: 8 }} />;
          return (
            <TableCard
              table={item}
              tick={tick}
              sections={sections}
              onPress={() => {
                setDetailTable(item);
                setTimeout(() => setDetailVisible(true), 20);
              }}
              onEdit={openEdit}
              onStatus={openStatus}
              onDelete={openDelete}
            />
          );
        }}
      />

      {/* ── FAB ── */}
      <TouchableOpacity
        style={S.fab}
        activeOpacity={0.85}
        onPress={() => { setForm(blank(sections)); setAddSheet(true); }}
      >
        <Text style={S.fabTxt}>+</Text>
      </TouchableOpacity>

      {/* ══════════════ TABLE DETAIL MODAL ══════════════ */}
      <TableDetailModal
        table={detailTable}
        tick={tick}
        sections={sections}
        visible={detailVisible}
        onClose={() => {
          setDetailVisible(false);              // start slide-out animation
          setTimeout(() => setDetailTable(null), 350); // unmount after animation
        }}
        onStatus={openStatus}
        onEdit={openEdit}
        onDelete={openDelete}
        onQuickFree={quickFree}
        onNewOrder={(table) => navigation.navigate('CashierWalkin', { prefillTable: table })}
        onSeatGuests={seatGuestsFromReservation}
      />

      {/* ══════════════ SHEETS ══════════════ */}

      {/* Add Table */}
      <Sheet visible={addSheet} onClose={() => setAddSheet(false)} title={t('admin.tables.addNewTable')}>
        <Field label={t('admin.tables.tableName')}>
          <TInput
            value={form.name}
            onChangeText={v => fi('name', v)}
            placeholder={t('admin.tables.tableNamePlaceholder')}
          />
        </Field>
        <Field label={t('admin.tables.numberOfSeats')}>
          <TInput
            value={form.seats}
            onChangeText={v => fi('seats', v)}
            placeholder="4"
            keyboardType="number-pad"
          />
        </Field>
        <Field label={t('admin.tables.section')}>
          <Pills options={sections} value={form.section} onSelect={v => fi('section', v)} sections={sections} />
        </Field>
        <View style={S.btnRow}>
          <Btn label={t('admin.tables.addTable')} onPress={addTable} loading={saving} />
          <Btn label={t('common.cancel')} onPress={() => setAddSheet(false)} outline />
        </View>
      </Sheet>

      {/* Edit Table */}
      <Sheet
        visible={!!editSheet}
        onClose={() => setEditSheet(null)}
        title={`Edit — ${editSheet?.name || `Table ${editSheet?.table_number}`}`}
      >
        <Field label={t('admin.tables.tableName')}>
          <TInput value={form.name} onChangeText={v => fi('name', v)} placeholder={t('admin.tables.tableNamePlaceholder')} />
        </Field>
        <Field label={t('admin.tables.numberOfSeats')}>
          <TInput value={form.seats} onChangeText={v => fi('seats', v)} placeholder="4" keyboardType="number-pad" />
        </Field>
        <Field label={t('admin.tables.section')}>
          <Pills options={sections} value={form.section} onSelect={v => fi('section', v)} sections={sections} />
        </Field>
        <View style={S.btnRow}>
          <Btn label={t('common.saveChanges')} onPress={saveEdit} loading={saving} />
          <Btn label={t('common.cancel')} onPress={() => setEditSheet(null)} outline />
        </View>
      </Sheet>

      {/* Status Sheet */}
      <Sheet
        visible={!!statusSheet}
        onClose={() => setStatusSheet(null)}
        title={`Status — ${statusSheet?.name || `Table ${statusSheet?.table_number}`}`}
      >
        <Field label={t('admin.tables.selectStatus')}>
          <View style={S.statusGrid}>
            {STATUSES.map(s => {
              const m = STATUS_META[s];
              const active = newStatus === s;
              return (
                <TouchableOpacity
                  key={s}
                  style={[S.statusOpt, active && { backgroundColor: m.bg, borderColor: m.color }]}
                  onPress={() => setNewStatus(s)}
                >
                  <View style={[S.statusDot2, { backgroundColor: m.color }]} />
                  <Text style={[S.statusOptTxt, active && { color: m.color }]}>{m.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Field>

        {newStatus === 'occupied' && (
          <View style={S.extra}>
            <Field label="Number of Guests">
              <TInput value={occGuests} onChangeText={setOccGuests} placeholder="2" keyboardType="number-pad" />
            </Field>
            <Field label="Assign Waiter">
              {waiters.length === 0
                ? <Text style={S.noStaff}>No waiters found</Text>
                : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {waiters.map(w => (
                        <TouchableOpacity
                          key={w.id}
                          style={[S.pill, occWaiter === w.id && S.pillOn]}
                          onPress={() => setOccWaiter(w.id)}
                        >
                          <Text style={[S.pillTxt, occWaiter === w.id && S.pillTxtOn]}>{w.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                )}
            </Field>
          </View>
        )}

        {newStatus === 'reserved' && (
          <View style={S.extra}>
            <Field label={t('admin.tables.guestName')}>
              <TInput value={resGuest} onChangeText={setResGuest} placeholder={t('admin.tables.guestNamePlaceholder')} />
            </Field>
            <Field label="Phone">
              <PhoneField value={resPhone} onChange={setResPhone} />
            </Field>
            <Field label="Date">
              <CalendarPicker value={resDate} onChange={setResDate} />
            </Field>
            <Field label="Time">
              <TimePicker value={resTime} onChange={setResTime} />
            </Field>
          </View>
        )}

        <View style={S.btnRow}>
          <Btn label="Apply Status" onPress={applyStatus} loading={saving} />
          <Btn label="Cancel" onPress={() => setStatusSheet(null)} outline />
        </View>
      </Sheet>

      {/* Delete Sheet */}
      <Sheet visible={!!deleteSheet} onClose={() => setDeleteSheet(null)} title={t('admin.tables.deleteTable')}>
        <View style={S.deleteBox}>
          {deleteSheet?.blocked ? (
            <>
              <MaterialIcons name="warning" size={48} color="#d97706" />
              <Text style={S.deleteTitle}>Cannot Delete</Text>
              <Text style={S.deleteSub}>
                "{deleteSheet.table.name}" is {deleteSheet.table.status?.toUpperCase()}.{'\n'}
                Change status to Free first.
              </Text>
              <View style={S.btnRow}>
                <Btn label="OK" onPress={() => setDeleteSheet(null)} outline />
              </View>
            </>
          ) : (
            <>
              <MaterialIcons name="delete" size={48} color="#dc2626" />
              <Text style={S.deleteTitle}>
                Delete "{deleteSheet?.table.name}"?
              </Text>
              <Text style={S.deleteSub}>{t('common.actionCannotBeUndone')}</Text>
              <View style={S.btnRow}>
                <Btn label="Yes, Delete" onPress={confirmDelete} loading={saving} danger />
                <Btn label="Cancel" onPress={() => setDeleteSheet(null)} outline />
              </View>
            </>
          )}
        </View>
      </Sheet>

      {/* Manage Sections Sheet */}
      <Sheet
        visible={secSheet}
        onClose={() => { setSecSheet(false); setNewSecName(''); }}
        title={t('admin.tables.manageSections')}
      >
        <Field label={t('admin.tables.addNewSection')}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TextInput
              style={[S.input, { flex: 1 }]}
              value={newSecName}
              onChangeText={setNewSecName}
              placeholder={t('admin.tables.newSectionPlaceholder')}
              placeholderTextColor={colors.textMuted}
              returnKeyType="done"
              onSubmitEditing={addSection}
            />
            <TouchableOpacity style={S.addSecBtn} onPress={addSection}>
              <Text style={S.addSecBtnTxt}>{t('common.add')}</Text>
            </TouchableOpacity>
          </View>
        </Field>

        <Field label={t('admin.tables.sections')}>
          {sections.map(sec => {
            const c     = secColor(sec, sections);
            const count = tables.filter(t => (t.section || '') === sec).length;
            return (
              <View key={sec} style={[S.secRow, { borderLeftColor: c.text }]}>
                <View style={[S.secDot, { backgroundColor: c.bg }]}>
                  <Text style={[S.secDotTxt, { color: c.text }]}>{sec[0].toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={S.secRowName}>{sec}</Text>
                  <Text style={S.secRowCount}>{count} table{count !== 1 ? 's' : ''}</Text>
                </View>
                <TouchableOpacity
                  style={[S.removeBtn, count > 0 && { opacity: 0.3 }]}
                  onPress={() => removeSection(sec)}
                >
                  <MaterialIcons name="close" size={14} color="#dc2626" />
                </TouchableOpacity>
              </View>
            );
          })}
        </Field>

        <Text style={S.secHint}>Sections with tables cannot be removed.</Text>

        <View style={S.btnRow}>
          <Btn label="Done" onPress={() => { setSecSheet(false); setNewSecName(''); }} outline />
        </View>
      </Sheet>

      <ConfirmDialog dialog={dialog} onClose={() => setDialog(null)} />

    </SafeAreaView>
  );
}

// ─── STYLES ──────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#f1f5f9' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f1f5f9' },

  // ── Header ──
  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 20, paddingTop: topInset + 14, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  headerTitle:  { fontSize: 24, fontWeight: '900', color: '#0f172a' },
  headerSub:    { fontSize: 12, color: '#94a3b8', marginTop: 1, fontWeight: '500' },
  headerIconBtn:{ width: 38, height: 38, borderRadius: 10, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0' },
  headerIconTxt:{ fontSize: 17, color: '#475569' },
  avatar:       { width: 38, height: 38, borderRadius: 19, backgroundColor: '#dbeafe', justifyContent: 'center', alignItems: 'center' },
  avatarTxt:    { fontSize: 15, fontWeight: '800', color: '#3b82f6' },

  // ── Stat Cards Row ──
  // ── Stat cards (new 2×2 grid) ───────────────────────────────────────────────
  statGrid:      { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: '#fff', paddingHorizontal: 8, paddingTop: 7, paddingBottom: 4, gap: 5 },
  statCard2:     { width: '47.5%', borderRadius: 10, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 7, overflow: 'hidden', position: 'relative' },
  statIconBadge: { width: 24, height: 24, borderRadius: 6, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  statCardBody:  { flex: 1 },
  statCardLbl:   { fontSize: 7, fontWeight: '800', letterSpacing: 0.4 },
  statCardNum:   { fontSize: 15, fontWeight: '900', lineHeight: 18, marginTop: 1 },
  statCardSub:   { fontSize: 7, fontWeight: '600', marginTop: 1 },
  statWatermark: { position: 'absolute', right: -4, bottom: -4 },

  // ── Floor summary ──────────────────────────────────────────────────────────
  floorSummary:        { backgroundColor: '#f8fafc', paddingHorizontal: 12, paddingTop: 6, paddingBottom: 5 },
  floorSummaryRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 },
  floorSummaryLabel:   { flexDirection: 'row', alignItems: 'center', gap: 3 },
  floorSummaryLabelTxt:{ fontSize: 8, fontWeight: '800', color: '#94a3b8', letterSpacing: 0.6 },
  floorStatRow:        { flexDirection: 'row', alignItems: 'center', gap: 8 },
  floorStat:           { alignItems: 'center' },
  floorStatNum:        { fontSize: 13, fontWeight: '900', color: '#334155' },
  floorStatLbl:        { fontSize: 7, color: '#94a3b8', fontWeight: '600', marginTop: 1 },
  floorStatDivider:    { width: 1, height: 18, backgroundColor: '#e2e8f0' },
  floorBarTrack:       { height: 4, backgroundColor: '#e2e8f0', borderRadius: 99, overflow: 'hidden', marginBottom: 5 },
  floorBarFill:        { height: '100%', borderRadius: 99, backgroundColor: '#ef4444' },
  floorLegend:         { flexDirection: 'row', gap: 10 },
  floorLegendItem:     { flexDirection: 'row', alignItems: 'center', gap: 3 },
  floorLegendDot:      { width: 5, height: 5, borderRadius: 99 },
  floorLegendTxt:      { fontSize: 8, color: '#64748b', fontWeight: '600' },

  // ── Zone Chips / Tab Bar ──
  tabBar:       { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  tabScroll:    { paddingHorizontal: 14, paddingVertical: 10, gap: 8, alignItems: 'center' },
  tab:          { paddingHorizontal: 18, paddingVertical: 7, borderRadius: 999, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0' },
  tabActive:    { backgroundColor: colors.admin, borderColor: colors.admin },
  tabTxt:       { fontSize: 12, fontWeight: '600', color: '#94a3b8' },
  tabTxtActive: { color: '#fff', fontWeight: '700' },

  // ── Grid ──
  row:         { gap: 8, paddingHorizontal: 10 },
  gridContent: { paddingTop: 10, paddingBottom: 110 },

  // ── Card ──
  card:     {
    flex: 1,
    height: 172,
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 8,
    borderWidth: 1.5,
    borderColor: 'transparent',
    position: 'relative',
    ...shadow.md,
  },

  // Status dot top-right
  tableStatusDot: { position: 'absolute', top: 7, right: 7, width: 9, height: 9, borderRadius: 5, zIndex: 1 },

  // Centered content area
  cardCenter: { flex: 1, alignItems: 'center', paddingHorizontal: 6, paddingTop: 10, paddingBottom: 2, width: '100%' },
  cardName:   { fontSize: 12, fontWeight: '800', color: '#0f172a', textAlign: 'center', marginTop: 5 },

  // Section chip
  secTag:    { alignSelf: 'center', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  secTagTxt: { fontSize: 8, fontWeight: '700' },

  // Free state
  freeRow:  { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  seatsChip:{ fontSize: 10, color: '#475569', fontWeight: '700' },
  availTxt: { fontSize: 10, color: '#16a34a', fontWeight: '600' },

  // Occupied state
  occVal:    { fontSize: 13, fontWeight: '900', color: '#dc2626', marginTop: 3 },
  occRowTxt: { fontSize: 11, color: '#64748b', fontWeight: '600', marginTop: 1 },

  // Reserved state
  resName: { fontSize: 11, fontWeight: '700', color: '#0f172a', marginTop: 3 },
  resSub:  { fontSize: 10, color: '#64748b', marginTop: 1 },

  // Cleaning state
  cleanTxt: { fontSize: 11, color: '#d97706', fontWeight: '600', marginTop: 3 },

  // Card footer icon buttons
  cardFooter:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, paddingBottom: 8, paddingTop: 2, gap: 6 },
  iconBtn:      { width: 26, height: 26, borderRadius: 8, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center' },
  iconBtnDanger:{ backgroundColor: '#fff1f2' },

  // ── Empty ──
  empty:     { alignItems: 'center', paddingTop: 60 },
  emptyIcon: { fontSize: 44, marginBottom: 10 },
  emptyTxt:  { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  emptySub:  { fontSize: 13, color: '#94a3b8', marginTop: 4 },

  // ── FAB ──
  fab:    { position: 'absolute', bottom: 28, right: 20, width: 58, height: 58, borderRadius: 29, backgroundColor: colors.admin, justifyContent: 'center', alignItems: 'center', elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8 },
  fabTxt: { color: '#fff', fontSize: 34, fontWeight: '300', lineHeight: 38, includeFontPadding: false, textAlignVertical: 'center' },

  // ── Sheet ──
  overlay:   { flex: 1, justifyContent: 'flex-end' },
  overlayBg: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet:     { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%' },
  sheetHandle:{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#e2e8f0', alignSelf: 'center', marginTop: 10 },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  sheetTitle:{ fontSize: 16, fontWeight: '800', color: '#0f172a' },
  sheetX:    { width: 30, height: 30, borderRadius: 15, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center' },
  sheetXText:{ fontSize: 13, color: '#64748b', fontWeight: '700' },

  // ── Table Detail Modal ──
  detHdr:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  detZoneChip:    { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  detZoneTxt:     { fontSize: 11, fontWeight: '700' },
  detSeats:       { fontSize: 12, color: '#64748b', fontWeight: '600' },
  detStatusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  detStatusDot:   { width: 7, height: 7, borderRadius: 4 },
  detStatusTxt:   { fontSize: 12, fontWeight: '800' },
  detAccentBar:   { height: 3, marginHorizontal: 20, borderRadius: 2, marginBottom: 16 },
  detBody:        { paddingHorizontal: 20, gap: 12 },
  detInfoCard:    { backgroundColor: '#f8fafc', borderRadius: 16, padding: 16, gap: 10, alignItems: 'center' },
  detBigIcon:     { fontSize: 40, marginBottom: 4 },
  detBigLabel:    { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  detBigSub:      { fontSize: 13, color: '#94a3b8' },
  detHeroRow:     { flexDirection: 'row', backgroundColor: '#f8fafc', borderRadius: 16, overflow: 'hidden' },
  detHeroBlock:   { flex: 1, alignItems: 'center', paddingVertical: 16 },
  detHeroVal:     { fontSize: 18, fontWeight: '900', color: '#dc2626' },
  detHeroLbl:     { fontSize: 10, color: '#94a3b8', fontWeight: '600', marginTop: 4 },
  detRow:         { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
  detRowKey:      { fontSize: 13, color: '#64748b', fontWeight: '600' },
  detRowVal:      { fontSize: 13, color: '#0f172a', fontWeight: '700' },
  detBtnRow:      { flexDirection: 'row', gap: 10, marginTop: 4 },
  detActionBtn:   { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  detActionBtnPrimary:    { backgroundColor: colors.admin },
  detActionBtnPrimaryTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  detActionBtnOutline:    { backgroundColor: '#f8fafc', borderWidth: 1.5, borderColor: '#e2e8f0' },
  detActionBtnOutlineTxt: { color: '#334155', fontWeight: '700', fontSize: 14 },
  detFooter:      { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#f1f5f9', marginTop: 20 },
  detFooterBtn:   { flex: 1, paddingVertical: 14, alignItems: 'center' },
  detFooterBtnTxt:{ fontSize: 13, fontWeight: '700', color: '#475569' },

  // ── Field ──
  field:    { marginHorizontal: 20, marginBottom: 16 },
  fieldLbl: { fontSize: 10, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  input:    { backgroundColor: '#f8fafc', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', paddingHorizontal: 14, paddingVertical: 13, fontSize: 14, color: '#0f172a' },

  // ── Pills ──
  pill:      { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0' },
  pillOn:    { backgroundColor: colors.admin, borderColor: colors.admin },
  pillTxt:   { fontSize: 13, fontWeight: '600', color: '#64748b' },
  pillTxtOn: { color: '#fff' },

  // ── Status grid (in sheet) ──
  statusGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  statusOpt:    { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: '#e2e8f0', backgroundColor: '#f8fafc', width: '47%' },
  statusDot2:   { width: 9, height: 9, borderRadius: 5 },
  statusOptTxt: { fontSize: 12, fontWeight: '700', color: '#94a3b8' },

  extra:   { borderTopWidth: 1, borderTopColor: '#f1f5f9', marginTop: 8, paddingTop: 12 },
  noStaff: { fontSize: 13, color: '#94a3b8', marginTop: 6 },

  // ── Buttons ──
  btnRow:       { gap: 10, marginHorizontal: 20, marginTop: 8 },
  btn:          { backgroundColor: colors.admin, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  btnDanger:    { backgroundColor: '#dc2626' },
  btnOutline:   { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0' },
  btnTxt:       { color: '#fff', fontWeight: '800', fontSize: 14 },
  btnTxtOutline:{ color: '#64748b', fontWeight: '600', fontSize: 14 },

  // ── Delete Sheet ──
  deleteBox:   { alignItems: 'center', paddingHorizontal: 20, paddingTop: 10, gap: 8 },
  deleteIcon:  { fontSize: 48 },
  deleteTitle: { fontSize: 17, fontWeight: '800', color: '#0f172a', textAlign: 'center' },
  deleteSub:   { fontSize: 13, color: '#94a3b8', textAlign: 'center', lineHeight: 20 },

  // ── Section management ──
  addSecBtn:    { backgroundColor: colors.admin, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 13 },
  addSecBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  secRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#f8fafc', borderRadius: 12, padding: 10, marginBottom: 8, borderLeftWidth: 3 },
  secDot:       { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  secDotTxt:    { fontSize: 14, fontWeight: '900' },
  secRowName:   { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  secRowCount:  { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  removeBtn:    { width: 30, height: 30, borderRadius: 15, backgroundColor: '#fee2e2', justifyContent: 'center', alignItems: 'center' },
  removeBtnTxt: { fontSize: 12, color: '#dc2626', fontWeight: '800' },
  secHint:      { marginHorizontal: 20, fontSize: 11, color: '#94a3b8', fontStyle: 'italic', marginBottom: 8 },
});

// ─── CALENDAR + TIME PICKER STYLES ───────────────────────────────────────────
const CS = StyleSheet.create({
  // Calendar container
  cal:           { backgroundColor: '#f8fafc', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden', marginBottom: 4 },
  calHeader:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 8, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  calNav:        { width: 34, height: 34, borderRadius: 17, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center' },
  calMonthTitle: { fontSize: 14, fontWeight: '800', color: '#0f172a' },

  // Day rows
  calRow:        { flexDirection: 'row' },
  calDayCell:    { flex: 1, aspectRatio: 1, justifyContent: 'center', alignItems: 'center', margin: 1 },
  calDayName:    { fontSize: 9, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase' },
  calDayTxt:     { fontSize: 13, fontWeight: '500', color: '#374151' },

  // Selected day
  calSelected:    { backgroundColor: '#3b82f6', borderRadius: 999 },
  calSelectedTxt: { color: '#fff', fontWeight: '800' },

  // Today (unselected)
  calToday:    { borderWidth: 1.5, borderColor: '#3b82f6', borderRadius: 999 },
  calTodayTxt: { color: '#3b82f6', fontWeight: '800' },

  // Time slot
  timeSlot:         { width: 68, height: 40, marginRight: 6, borderRadius: 10, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0', justifyContent: 'center', alignItems: 'center' },
  timeSlotActive:   { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  timeSlotTxt:      { fontSize: 13, fontWeight: '600', color: '#475569' },
  timeSlotActiveTxt:{ color: '#fff', fontWeight: '800' },
});

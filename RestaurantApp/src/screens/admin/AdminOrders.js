/**
 * AdminOrders.js  —  Orders management with Edit & Delete
 *
 * Two tabs:
 *   Current Orders — pending + preparing + ready + served
 *   Paid Orders    — paid only
 *
 * Features:
 *   • Swipe-left on any card to reveal Edit (blue) + Delete (red) buttons
 *   • Long-press any card for a native-style action sheet
 *   • Delete with bottom-sheet confirmation
 *     – Paid orders require a mandatory reason before delete
 *   • Edit Current Orders — full-screen slide-up modal
 *     · Table, Waitress, Guests, Items (+/−/remove), Add Items (search), Notes, live total
 *     · Non-dismissable kitchen warning when status is Preparing/Ready
 *   • Edit Paid Orders — bottom-sheet modal
 *     · Payment Method, Waitress, Table, Internal Notes only
 *     · Items shown read-only
 *   • Toast notifications at top of screen (success/warning/error, 3 s auto-dismiss)
 *   • All existing features preserved (status advance, payment sheet, date filter)
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, FlatList, TouchableOpacity, TextInput,
  StyleSheet, Modal, ActivityIndicator, RefreshControl,
  KeyboardAvoidingView, Platform, Animated, PanResponder,
  LayoutAnimation, UIManager, StatusBar, Alert,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { ordersAPI, menuAPI, tablesAPI, usersAPI } from '../../api/client';
import { colors, spacing, radius, shadow, typography, topInset } from '../../utils/theme';
import { useTranslation } from '../../context/LanguageContext';
import ConfirmDialog from '../../components/ConfirmDialog';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const ACTIVE_STATUSES   = ['pending', 'sent_to_kitchen', 'preparing', 'ready', 'served', 'bill_requested'];
const NEXT_STATUS       = { pending: 'sent_to_kitchen', sent_to_kitchen: 'preparing', preparing: 'ready', ready: 'served', served: 'paid' };
const PAYMENT_METHODS   = ['Cash', 'Card', 'Online'];
const DELETE_REASONS    = ['Duplicate Entry', 'Wrong Table', 'Test Order', 'Other'];
const CANCEL_REASONS    = ['Customer Left', 'Customer Changed Mind', 'Kitchen Issue', 'Wrong Order', 'Long Wait Time', 'Other'];
const DISC_REASONS      = ['Manager Approved', 'Loyalty Customer', 'Complaint Resolution', 'Other'];
const ACTION_WIDTH      = 148; // px revealed on swipe

const getStatusMeta = (t) => ({
  pending:         { label: t('statuses.pending'),        bg: '#f1f5f9', text: '#475569', dot: '#94a3b8' },
  sent_to_kitchen: { label: t('statuses.sentToKitchen'),  bg: '#fff7ed', text: '#c2410c', dot: '#f97316' },
  preparing:       { label: t('statuses.preparing'),      bg: '#fff7ed', text: '#c2410c', dot: '#f97316' },
  ready:           { label: t('statuses.ready'),          bg: '#dcfce7', text: '#15803d', dot: '#22c55e' },
  served:          { label: t('statuses.served'),         bg: '#eff6ff', text: '#1d4ed8', dot: '#3b82f6' },
  bill_requested:  { label: t('statuses.billRequested'),  bg: '#fef9c3', text: '#a16207', dot: '#eab308' },
  paid:            { label: t('statuses.paid'),           bg: '#f0fdfa', text: '#0f766e', dot: '#14b8a6' },
  cancelled:       { label: t('statuses.cancelled'),      bg: '#fee2e2', text: '#dc2626', dot: '#ef4444' },
});

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const money   = (v) => new Intl.NumberFormat('uz-UZ').format(Math.round(Number(v) || 0)) + " so'm";
const shortId = (order) => {
  if (order.daily_number) return `#${order.daily_number}`;
  if (order.order_number) return `#${order.order_number}`;
  return `#${(order.id || '').replace(/-/g, '').slice(-4).toUpperCase()}`;
};

function timeAgo(dateStr, t) {
  if (!dateStr) return '';
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 60000);
  if (diff < 1)    return t ? t('adminExtra.justNow') : 'Just now';
  if (diff < 60)   return `${diff}${t ? t('adminExtra.minAgo') : 'm ago'}`;
  if (diff < 1440) return `${Math.floor(diff / 60)}${t ? t('adminExtra.hAgo') : 'h ago'}`;
  return new Date(dateStr).toLocaleDateString();
}
function timeOnly(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ─── DATE RANGE HELPERS ───────────────────────────────────────────────────────
const getDatePresets = (t) => [
  { id: 'Today',      label: t('periods.today') },
  { id: '7 Days',     label: t('periods.last7days') },
  { id: '30 Days',    label: t('periods.last30days') },
  { id: 'This Month', label: t('periods.thisMonth') },
  { id: 'Custom',     label: t('periods.custom') },
];

function getPresetRange(preset, customFrom, customTo) {
  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end   = new Date(today.getTime() + 86399999);
  switch (preset) {
    case 'Today':      return { from: today, to: end };
    case '7 Days':     return { from: new Date(today - 6 * 86400000), to: end };
    case '30 Days':    return { from: new Date(today - 29 * 86400000), to: end };
    case 'This Month': return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59) };
    case 'Custom': {
      const f = customFrom ? new Date(customFrom) : today;
      const t = customTo   ? new Date(new Date(customTo).getTime() + 86399999) : end;
      return { from: f, to: t };
    }
    default: return { from: new Date(today - 29 * 86400000), to: end };
  }
}
function inDateRange(dateStr, from, to) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return d >= from && d <= to;
}

// ─── PhoneField with +998 country code ──────────────────────────────────────
function PhoneField({ label, value, onChange }) {
  const { t } = useTranslation();
  const resolvedLabel = label ?? t('phoneField.defaultLabel', 'PHONE NUMBER');
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
    <View style={{ marginBottom: 16, width: '100%', alignSelf: 'stretch' }}>
      <Text style={pay.fieldLabel}>{resolvedLabel.toUpperCase()}</Text>
      <View style={[pay.input, { flexDirection: 'row', alignItems: 'center', padding: 0, overflow: 'hidden', minHeight: 48, width: '100%' }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 13, backgroundColor: '#F1F5F9', borderRightWidth: 1, borderRightColor: '#E2E8F0', gap: 6, alignSelf: 'stretch' }}>
          <Text style={{ fontSize: 16 }}>🇺🇿</Text>
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#374151' }}>+998</Text>
        </View>
        <TextInput
          style={{ flex: 1, paddingHorizontal: 12, paddingVertical: 13, fontSize: 15, color: '#0f172a', minHeight: 48 }}
          value={displayLocal}
          onChangeText={handleChange}
          placeholder={t('placeholders.phoneLocal', '90 123 45 67')}
          placeholderTextColor="#cbd5e1"
          keyboardType="phone-pad"
          maxLength={13}
        />
      </View>
    </View>
  );
}

// ─── TOAST ────────────────────────────────────────────────────────────────────
const TOAST_BG = { success: '#10b981', warning: '#f59e0b', error: '#ef4444' };

function ToastItem({ toast, onDone }) {
  const opacity   = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-12)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity,    { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start();
    const t = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity,    { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: -8, duration: 300, useNativeDriver: true }),
      ]).start(() => onDone());
    }, 2700);
    return () => clearTimeout(t);
  }, []);

  return (
    <Animated.View style={[tst.item, { backgroundColor: TOAST_BG[toast.type] || '#10b981', opacity, transform: [{ translateY }] }]}>
      <Text style={tst.text}>{toast.message}</Text>
    </Animated.View>
  );
}
const tst = StyleSheet.create({
  item: { borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 8, ...shadow.md },
  text: { color: '#fff', fontWeight: '700', fontSize: 14 },
});

// ─── RANGE CALENDAR PICKER MODAL ─────────────────────────────────────────────
const AO_MONTHS  = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const AO_DAY_HDR = ['Mo','Tu','We','Th','Fr','Sa','Su'];
const ao_today   = new Date();
const ao_todayStr = `${ao_today.getFullYear()}-${String(ao_today.getMonth()+1).padStart(2,'0')}-${String(ao_today.getDate()).padStart(2,'0')}`;
function aoFmt(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function aoMonday(d) { const x=new Date(d); x.setDate(x.getDate()-(x.getDay()+6)%7); return x; }

function AOCalendarModal({ visible, onClose, from, to, onChange }) {
  const [viewYear,  setViewYear]  = useState(ao_today.getFullYear());
  const [viewMonth, setViewMonth] = useState(ao_today.getMonth());
  const [tempFrom,  setTempFrom]  = useState(from || ao_todayStr);
  const [tempTo,    setTempTo]    = useState(to   || ao_todayStr);
  const [step,      setStep]      = useState('from');

  useEffect(() => {
    if (visible) {
      setTempFrom(from || ao_todayStr); setTempTo(to || ao_todayStr); setStep('from');
      const d = new Date((from || ao_todayStr) + 'T00:00:00');
      setViewYear(d.getFullYear()); setViewMonth(d.getMonth());
    }
  }, [visible]);

  const prevMonth = () => { if (viewMonth===0){setViewMonth(11);setViewYear(y=>y-1);}else setViewMonth(m=>m-1); };
  const nextMonth = () => { if (viewMonth===11){setViewMonth(0);setViewYear(y=>y+1);}else setViewMonth(m=>m+1); };

  const handleDay = (ds) => {
    if (step==='from') { setTempFrom(ds); setTempTo(ds); setStep('to'); }
    else { if (ds<tempFrom){setTempTo(tempFrom);setTempFrom(ds);}else setTempTo(ds); setStep('from'); }
  };

  const setPreset = (f, t) => {
    setTempFrom(f); setTempTo(t); setStep('from');
    const d = new Date(f+'T00:00:00'); setViewYear(d.getFullYear()); setViewMonth(d.getMonth());
  };

  const firstDow  = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;
  const daysInMon = new Date(viewYear, viewMonth+1, 0).getDate();
  const cells = [];
  for (let i=0;i<firstDow;i++) cells.push(null);
  for (let d=1;d<=daysInMon;d++) cells.push(aoFmt(new Date(viewYear,viewMonth,d)));
  while (cells.length%7!==0) cells.push(null);
  const weeks=[]; for (let i=0;i<cells.length;i+=7) weeks.push(cells.slice(i,i+7));

  const P = colors.admin;
  const PL = '#EFF6FF';
  const presets = [
    { label: 'Today',      f: ao_todayStr, t: ao_todayStr },
    { label: 'This Week',  f: aoFmt(aoMonday(ao_today)), t: ao_todayStr },
    { label: 'This Month', f: aoFmt(new Date(ao_today.getFullYear(),ao_today.getMonth(),1)), t: ao_todayStr },
    { label: 'Last Month', f: aoFmt(new Date(ao_today.getFullYear(),ao_today.getMonth()-1,1)), t: aoFmt(new Date(ao_today.getFullYear(),ao_today.getMonth(),0)) },
  ];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.45)', justifyContent:'flex-end' }}>
        <View style={{ backgroundColor:'#fff', borderTopLeftRadius:24, borderTopRightRadius:24, maxHeight:'92%' }}>
          <View style={{ flexDirection:'row', alignItems:'center', gap:8, padding:16, borderBottomWidth:1, borderBottomColor:'#e2e8f0' }}>
            <MaterialIcons name="calendar-today" size={20} color={P} />
            <Text style={{ fontSize:16, fontWeight:'800', color:'#0f172a' }}>Select Period</Text>
            <TouchableOpacity onPress={onClose} style={{ marginLeft:'auto' }}>
              <MaterialIcons name="close" size={22} color="#64748b" />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding:16, paddingBottom:40 }}>
            <View style={{ flexDirection:'row', marginBottom:12 }}>
              <TouchableOpacity onPress={()=>setStep('from')} style={{ flex:1, borderWidth:2, borderColor:step==='from'?P:'#e2e8f0', borderRadius:12, padding:10, backgroundColor:step==='from'?PL:'#f8fafc' }}>
                <Text style={{ fontSize:10, color:'#94a3b8', fontWeight:'700', marginBottom:2 }}>FROM</Text>
                <Text style={{ fontSize:14, fontWeight:'800', color:'#0f172a' }}>{tempFrom}</Text>
              </TouchableOpacity>
              <View style={{ width:24, alignItems:'center', justifyContent:'center' }}>
                <Text style={{ color:'#94a3b8', fontSize:18 }}>→</Text>
              </View>
              <TouchableOpacity onPress={()=>setStep('to')} style={{ flex:1, borderWidth:2, borderColor:step==='to'?P:'#e2e8f0', borderRadius:12, padding:10, backgroundColor:step==='to'?PL:'#f8fafc' }}>
                <Text style={{ fontSize:10, color:'#94a3b8', fontWeight:'700', marginBottom:2 }}>TO</Text>
                <Text style={{ fontSize:14, fontWeight:'800', color:'#0f172a' }}>{tempTo}</Text>
              </TouchableOpacity>
            </View>
            <Text style={{ textAlign:'center', color:'#94a3b8', fontSize:12, marginBottom:14 }}>
              {step==='from' ? 'Tap a date to set start' : 'Tap a date to set end'}
            </Text>
            <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
              <TouchableOpacity onPress={prevMonth} style={{ width:36, height:36, borderRadius:10, backgroundColor:'#f1f5f9', alignItems:'center', justifyContent:'center' }}>
                <Text style={{ fontSize:24, color:P, fontWeight:'700', lineHeight:28 }}>‹</Text>
              </TouchableOpacity>
              <Text style={{ fontSize:17, fontWeight:'800', color:'#0f172a' }}>{AO_MONTHS[viewMonth]} {viewYear}</Text>
              <TouchableOpacity onPress={nextMonth} style={{ width:36, height:36, borderRadius:10, backgroundColor:'#f1f5f9', alignItems:'center', justifyContent:'center' }}>
                <Text style={{ fontSize:24, color:P, fontWeight:'700', lineHeight:28 }}>›</Text>
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection:'row', marginBottom:4 }}>
              {AO_DAY_HDR.map(d=><View key={d} style={{flex:1,alignItems:'center',paddingVertical:4}}><Text style={{fontSize:12,fontWeight:'700',color:'#94a3b8'}}>{d}</Text></View>)}
            </View>
            {weeks.map((week,wi)=>(
              <View key={wi} style={{ flexDirection:'row' }}>
                {week.map((ds,di)=>{
                  if (!ds) return <View key={`e${di}`} style={{flex:1,aspectRatio:1}} />;
                  const isFrom=ds===tempFrom, isTo=ds===tempTo&&tempFrom!==tempTo, inRng=ds>tempFrom&&ds<tempTo, isTod=ds===ao_todayStr;
                  const bg=(isFrom||isTo)?P:inRng?PL:'transparent';
                  const txCol=(isFrom||isTo)?'#fff':inRng?P:isTod?P:'#0f172a';
                  return (
                    <TouchableOpacity key={ds} style={{flex:1,aspectRatio:1,alignItems:'center',justifyContent:'center',backgroundColor:bg,borderRadius:(isFrom||isTo)?9:0}} onPress={()=>handleDay(ds)} activeOpacity={0.7}>
                      <Text style={{fontSize:13,fontWeight:(isFrom||isTo||isTod)?'800':'400',color:txCol}}>{parseInt(ds.split('-')[2],10)}</Text>
                      {isTod&&!isFrom&&!isTo&&<View style={{width:4,height:4,borderRadius:2,backgroundColor:P,marginTop:1}}/>}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
            <View style={{ flexDirection:'row', flexWrap:'wrap', gap:8, marginTop:16 }}>
              {presets.map(p=>(
                <TouchableOpacity key={p.label} style={{ paddingHorizontal:14, paddingVertical:8, borderRadius:999, borderWidth:1, borderColor:'#e2e8f0', backgroundColor:'#f8fafc' }} onPress={()=>setPreset(p.f,p.t)}>
                  <Text style={{ fontSize:12, fontWeight:'600', color:'#0f172a' }}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={{ marginTop:16, backgroundColor:P, borderRadius:14, paddingVertical:14, alignItems:'center' }} onPress={()=>{onChange(tempFrom,tempTo);onClose();}}>
              <Text style={{ color:'#fff', fontWeight:'800', fontSize:14 }}>
                Apply: {tempFrom===tempTo ? tempFrom : `${tempFrom} → ${tempTo}`}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── DATE PICKER (Paid tab) ───────────────────────────────────────────────────
function PaidDatePicker({ preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, filteredOrders }) {
  const { t } = useTranslation();
  const [calOpen, setCalOpen] = useState(false);
  const totalRevenue = filteredOrders.reduce((s, o) => s + Number(o.total_amount || 0), 0);
  return (
    <View style={dp.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={dp.chipRow}>
        {getDatePresets(t).map(p => (
          <TouchableOpacity key={p.id} style={[dp.chip, preset === p.id && dp.chipActive]}
            onPress={() => { setPreset(p.id); if (p.id === 'Custom') setCalOpen(true); }}>
            <Text style={[dp.chipText, preset === p.id && dp.chipTextActive]}>{p.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {preset === 'Custom' && (
        <TouchableOpacity style={dp.customRow} onPress={() => setCalOpen(true)} activeOpacity={0.8}>
          <MaterialIcons name="calendar-today" size={14} color={colors.admin} />
          <Text style={{ flex:1, fontSize:13, fontWeight:'700', color:'#0f172a', marginLeft:6 }}>
            {customFrom && customTo
              ? customFrom === customTo ? customFrom : `${customFrom}  →  ${customTo}`
              : t('adminExtra.tapToSelectRange')}
          </Text>
          <MaterialIcons name="edit-calendar" size={16} color={colors.admin} />
        </TouchableOpacity>
      )}
      <AOCalendarModal
        visible={calOpen}
        onClose={() => setCalOpen(false)}
        from={customFrom}
        to={customTo}
        onChange={(f, t) => { setCustomFrom(f); setCustomTo(t); }}
      />
      <View style={dp.summaryRow}>
        <Text style={dp.summaryLabel}>{t('adminExtra.showingLabel')}: <Text style={dp.summaryBold}>{preset}</Text></Text>
        <View style={dp.summaryRight}>
          <Text style={dp.summaryCount}>{filteredOrders.length} {t('adminExtra.ordersLabel')}</Text>
          <Text style={dp.summaryDot}>·</Text>
          <Text style={dp.summaryRevenue}>{money(totalRevenue)}</Text>
        </View>
      </View>
    </View>
  );
}
const dp = StyleSheet.create({
  wrap:           { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  chipRow:        { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 8, gap: 7 },
  chip:           { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 99, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0' },
  chipActive:     { backgroundColor: colors.admin, borderColor: colors.admin },
  chipText:       { fontSize: 12, fontWeight: '600', color: '#64748b' },
  chipTextActive: { color: '#fff' },
  customRow:      { flexDirection:'row', alignItems:'center', marginHorizontal:12, marginBottom:10, paddingHorizontal:14, paddingVertical:12, borderRadius:12, borderWidth:1.5, borderColor:colors.admin, backgroundColor:'#EFF6FF' },
  summaryRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingBottom: 10, paddingTop: 2 },
  summaryLabel:   { fontSize: 12, color: '#64748b' },
  summaryBold:    { fontWeight: '700', color: '#0f172a' },
  summaryRight:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  summaryCount:   { fontSize: 12, fontWeight: '600', color: '#475569' },
  summaryDot:     { fontSize: 12, color: '#cbd5e1' },
  summaryRevenue: { fontSize: 13, fontWeight: '800', color: colors.admin },
});

// ─── STATUS BADGE ─────────────────────────────────────────────────────────────
function StatusBadge({ status, size = 'sm' }) {
  const { t } = useTranslation();
  const SM = getStatusMeta(t);
  const meta = SM[status] || SM.pending;
  return (
    <View style={[bdg.wrap, { backgroundColor: meta.bg }, size === 'lg' && bdg.wrapLg]}>
      <View style={[bdg.dot, { backgroundColor: meta.dot }]} />
      <Text style={[bdg.text, { color: meta.text }, size === 'lg' && bdg.textLg]}>{meta.label}</Text>
    </View>
  );
}
const bdg = StyleSheet.create({
  wrap:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 99 },
  wrapLg: { paddingHorizontal: 12, paddingVertical: 6 },
  dot:    { width: 6, height: 6, borderRadius: 3, marginRight: 5 },
  text:   { fontSize: 10, fontWeight: '700' },
  textLg: { fontSize: 13 },
});

// ─── SWIPEABLE ORDER CARD ─────────────────────────────────────────────────────
function SwipeableOrderCard({ order, onPress, onEdit, onDelete, onLongPress, hideActions = false }) {
  const { t } = useTranslation();
  const translateX = useRef(new Animated.Value(0)).current;
  const currentX   = useRef(0);           // settled position: 0 or -ACTION_WIDTH
  const isOpen     = useRef(false);

  const waiter     = order.waitress_name || order.waiter_name || t('adminExtra.staffLabel');
  const tableLabel = order.table_name || (order.table_number ? `${t('adminExtra.table')} ${order.table_number}` : t('adminExtra.walkIn'));
  const itemCount  = order.item_count || (order.items?.length ?? 0);

  const snapTo = useCallback((toValue) => {
    Animated.spring(translateX, { toValue, useNativeDriver: true, tension: 80, friction: 12 }).start();
    currentX.current = toValue;
    isOpen.current   = toValue !== 0;
  }, [translateX]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) =>
        !hideActions && Math.abs(gs.dx) > Math.abs(gs.dy) + 4 && Math.abs(gs.dx) > 8,

      onPanResponderMove: (_, gs) => {
        if (hideActions) return;
        const next = Math.max(-ACTION_WIDTH, Math.min(0, currentX.current + gs.dx));
        translateX.setValue(next);
      },

      onPanResponderRelease: (_, gs) => {
        if (hideActions) return;
        const projected = currentX.current + gs.dx;
        if (projected < -ACTION_WIDTH / 3 || gs.vx < -0.3) {
          snapTo(-ACTION_WIDTH);
        } else {
          snapTo(0);
        }
      },

      onPanResponderTerminate: () => snapTo(currentX.current),
    })
  ).current;

  const handlePress = () => {
    if (isOpen.current) { snapTo(0); return; }
    onPress();
  };

  return (
    <View style={sw.container}>
      {/* ── Action strip (behind card) ── */}
      {!hideActions && (
        <View style={sw.strip}>
          <TouchableOpacity
            style={sw.editBtn}
            onPress={() => { snapTo(0); onEdit(); }}
            hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
          >
            <MaterialIcons name="edit" size={20} color="#fff" />
            <Text style={sw.stripLabel}>{t('common.edit')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={sw.deleteBtn}
            onPress={() => { snapTo(0); onDelete(); }}
            hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
          >
            <MaterialIcons name="delete" size={20} color="#fff" />
            <Text style={sw.stripLabel}>{t('common.delete')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Animated card face ── */}
      <Animated.View style={[sw.card, { transform: [{ translateX }] }]} {...panResponder.panHandlers}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={handlePress}
          onLongPress={hideActions ? undefined : onLongPress}
          delayLongPress={500}
          style={{ flexDirection: 'row' }}
        >
          <View style={[sw.stripe, { backgroundColor: (getStatusMeta(t)[order.status] || getStatusMeta(t).pending).dot }]} />
          <View style={sw.body}>
            <View style={sw.row1}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={sw.orderNum}>{shortId(order)}</Text>
                <StatusBadge status={order.status} />
              </View>
              <Text style={sw.time}>{timeAgo(order.created_at, t)}</Text>
            </View>
            <View style={sw.row2}>
              <Text style={sw.tableLabel}>{tableLabel}</Text>
              <Text style={sw.dot}>·</Text>
              <Text style={sw.waiter}>{waiter}</Text>
              {order.status === 'paid' && order.collected_by_name && (
                <>
                  <Text style={sw.dot}>·</Text>
                  <MaterialIcons name="person-outline" size={12} color="#0f766e" />
                  <Text style={[sw.waiter, { color: '#0f766e' }]}>{order.collected_by_name}</Text>
                </>
              )}
            </View>
            {order.status === 'cancelled' && order.cancellation_reason ? (
              <View style={sw.cancelReasonRow}>
                <MaterialIcons name="info-outline" size={12} color="#dc2626" />
                <Text style={sw.cancelReasonText} numberOfLines={1}>{order.cancellation_reason}</Text>
              </View>
            ) : null}
            {order.status === 'paid' && order.payment_method === 'loan' ? (
              <View style={[sw.loanStatusRow, { backgroundColor: order.loan_status === 'paid' ? '#dcfce7' : '#fef3c7' }]}>
                <MaterialIcons
                  name={order.loan_status === 'paid' ? 'check-circle' : 'error-outline'}
                  size={12}
                  color={order.loan_status === 'paid' ? '#16a34a' : '#d97706'}
                />
                <Text style={[sw.loanStatusText, { color: order.loan_status === 'paid' ? '#15803d' : '#92400e' }]}>
                  {order.loan_status === 'paid' ? 'Debt repaid' : 'Debt not yet repaid'}
                </Text>
              </View>
            ) : null}
            <View style={sw.row3}>
              <View style={sw.metaChip}>
                <Text style={sw.metaText}>{itemCount === 1 ? t('admin.orders.oneItem') : t('admin.orders.itemsCount', { count: itemCount })}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={sw.total}>{money(order.total_amount)}</Text>
                {!hideActions && (
                  <>
                    <TouchableOpacity
                      style={sw.inlineEdit}
                      onPress={(e) => { e.stopPropagation?.(); snapTo(0); onEdit(); }}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <MaterialIcons name="edit" size={14} color="#1d4ed8" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={sw.inlineDel}
                      onPress={(e) => { e.stopPropagation?.(); snapTo(0); onDelete(); }}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <MaterialIcons name="delete" size={14} color="#dc2626" />
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>
          </View>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}
const sw = StyleSheet.create({
  container:  { position: 'relative', marginBottom: 10 },
  strip:      { position: 'absolute', right: 0, top: 0, bottom: 0, width: ACTION_WIDTH, flexDirection: 'row', borderRadius: 14, overflow: 'hidden' },
  editBtn:    { flex: 1, backgroundColor: '#3b82f6', justifyContent: 'center', alignItems: 'center', gap: 3 },
  deleteBtn:  { flex: 1, backgroundColor: '#ef4444', justifyContent: 'center', alignItems: 'center', gap: 3 },
  stripIcon:  { fontSize: 20 },
  stripLabel: { fontSize: 11, fontWeight: '700', color: '#fff' },
  card:       { backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden', ...shadow.sm },
  stripe:     { width: 4 },
  body:       { flex: 1, padding: 12, gap: 5 },
  row1:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  orderNum:   { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  time:       { fontSize: 11, color: '#94a3b8', fontWeight: '500' },
  row2:       { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  tableLabel: { fontSize: 12, fontWeight: '700', color: '#334155' },
  dot:        { fontSize: 12, color: '#cbd5e1' },
  waiter:     { fontSize: 12, color: '#64748b' },
  cancelReasonRow: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#fef2f2', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginTop: 2 },
  cancelReasonText: { fontSize: 11, fontWeight: '600', color: '#dc2626', flex: 1 },
  loanStatusRow:  { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginTop: 2 },
  loanStatusText: { fontSize: 11, fontWeight: '600' },
  row3:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  metaChip:    { paddingHorizontal: 8, paddingVertical: 3, backgroundColor: '#f1f5f9', borderRadius: 6 },
  metaText:    { fontSize: 11, fontWeight: '600', color: '#475569' },
  total:       { fontSize: 15, fontWeight: '800', color: colors.admin },
  // Always-visible inline action buttons
  inlineEdit:  { width: 28, height: 28, borderRadius: 8, backgroundColor: '#dbeafe', justifyContent: 'center', alignItems: 'center' },
  inlineEditTxt:{ fontSize: 14, color: '#1d4ed8', fontWeight: '700' },
  inlineDel:   { width: 28, height: 28, borderRadius: 8, backgroundColor: '#fee2e2', justifyContent: 'center', alignItems: 'center' },
  inlineDelTxt:{ fontSize: 14 },
});

// ─── ACTION SHEET ─────────────────────────────────────────────────────────────
function ActionSheetModal({ order, onClose, onEdit, onDelete }) {
  const { t } = useTranslation();
  if (!order) return null;
  return (
    <Modal visible animationType="slide" transparent statusBarTranslucent onRequestClose={onClose}>
      <View style={ash.overlay}>
        <TouchableOpacity style={ash.bg} activeOpacity={1} onPress={onClose} />
        <View style={ash.sheet}>
          <View style={ash.handle} />
          <Text style={ash.orderRef}>{shortId(order)}</Text>

          <TouchableOpacity style={ash.option} onPress={() => { onClose(); onEdit(); }}>
            <View style={[ash.iconWrap, { backgroundColor: '#eff6ff' }]}><MaterialIcons name="edit" size={20} color="#2563EB" /></View>
            <Text style={ash.optionText}>{t('adminExtra.editOrderTitle')}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={ash.option} onPress={() => { onClose(); onDelete(); }}>
            <View style={[ash.iconWrap, { backgroundColor: '#fef2f2' }]}><MaterialIcons name="delete" size={20} color="#DC2626" /></View>
            <Text style={[ash.optionText, { color: '#dc2626' }]}>{t('adminExtra.deleteOrderTitle')}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={ash.cancelRow} onPress={onClose}>
            <Text style={ash.cancelText}>{t('common.cancel')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
const ash = StyleSheet.create({
  overlay:    { flex: 1, justifyContent: 'flex-end' },
  bg:         { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet:      { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 36 },
  handle:     { width: 40, height: 4, borderRadius: 2, backgroundColor: '#e2e8f0', alignSelf: 'center', marginTop: 10, marginBottom: 8 },
  orderRef:   { fontSize: 12, color: '#94a3b8', textAlign: 'center', marginBottom: 12 },
  option:     { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#f8fafc', minHeight: 60 },
  iconWrap:   { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  optionIcon: { fontSize: 20 },
  optionText: { fontSize: 16, fontWeight: '600', color: '#0f172a' },
  cancelRow:  { marginTop: 8, alignItems: 'center', paddingVertical: 14 },
  cancelText: { fontSize: 16, fontWeight: '700', color: colors.admin },
});

// ─── DELETE CONFIRM ───────────────────────────────────────────────────────────
function DeleteConfirmModal({ order, onClose, onConfirm }) {
  const { t } = useTranslation();
  const [reason,    setReason]    = useState('');
  const [otherText, setOtherText] = useState('');
  const [deleting,  setDeleting]  = useState(false);

  if (!order) return null;
  const isPaid     = order.status === 'paid';
  const canConfirm = !isPaid || (reason && (reason !== 'Other' || otherText.trim().length > 0));

  async function doDelete() {
    setDeleting(true);
    await onConfirm(reason === 'Other' ? otherText.trim() : reason);
    setDeleting(false);
  }

  return (
    <Modal visible animationType="slide" transparent statusBarTranslucent onRequestClose={onClose}>
      <View style={dc.overlay}>
        <TouchableOpacity style={dc.bg} activeOpacity={1} onPress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={dc.sheetWrap}>
          <View style={dc.sheet}>
            <View style={dc.handle} />

            <View style={dc.header}>
              <Text style={dc.title}>{t('adminExtra.deleteOrderTitle')}</Text>
              <TouchableOpacity onPress={onClose} style={dc.closeXBtn}>
                <MaterialIcons name="close" size={20} color="#475569" />
              </TouchableOpacity>
            </View>

            {/* Summary */}
            <View style={dc.summaryBox}>
              {[
                [t('common.order'), shortId(order)],
                [t('adminExtra.table'), order.table_name || (order.table_number ? `${t('adminExtra.table')} ${order.table_number}` : t('adminExtra.walkIn'))],
                [t('common.total'), money(order.total_amount)],
              ].map(([k, v], i, arr) => (
                <View key={k} style={[dc.summaryRow, i < arr.length - 1 && dc.summaryBorder]}>
                  <Text style={dc.summaryKey}>{k}</Text>
                  <Text style={[dc.summaryVal, k === t('common.total') && { color: colors.admin, fontWeight: '800' }]}>{v}</Text>
                </View>
              ))}
            </View>

            {/* Reason — paid orders only */}
            {isPaid && (
              <View style={dc.reasonSection}>
                <Text style={dc.reasonTitle}>
                  {t('adminExtra.reasonForDeletion')} <Text style={{ color: '#ef4444' }}>*</Text>
                </Text>
                {DELETE_REASONS.map(r => (
                  <TouchableOpacity
                    key={r}
                    style={[dc.reasonOption, reason === r && dc.reasonActive]}
                    onPress={() => setReason(r)}
                    activeOpacity={0.7}
                  >
                    <View style={[dc.radio, reason === r && dc.radioFilled]}>
                      {reason === r && <View style={dc.radioDot} />}
                    </View>
                    <Text style={[dc.reasonText, reason === r && dc.reasonTextActive]}>{r}</Text>
                  </TouchableOpacity>
                ))}
                {reason === 'Other' && (
                  <TextInput
                    style={dc.otherInput}
                    value={otherText}
                    onChangeText={setOtherText}
                    placeholder={t('adminExtra.describeReason')}
                    placeholderTextColor="#94a3b8"
                    multiline
                  />
                )}
              </View>
            )}

            <View style={dc.btnRow}>
              <TouchableOpacity style={dc.cancelBtn} onPress={onClose}>
                <Text style={dc.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[dc.deleteBtn, !canConfirm && { opacity: 0.38 }]}
                onPress={doDelete}
                disabled={!canConfirm || deleting}
              >
                {deleting
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={dc.deleteBtnText}>Delete</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
const dc = StyleSheet.create({
  overlay:       { flex: 1, justifyContent: 'flex-end' },
  bg:            { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheetWrap:     { justifyContent: 'flex-end' },
  sheet:         { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 36 },
  handle:        { width: 40, height: 4, borderRadius: 2, backgroundColor: '#e2e8f0', alignSelf: 'center', marginTop: 10, marginBottom: 12 },
  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 12 },
  title:         { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  closeXBtn:     { width: 32, height: 32, justifyContent: 'center', alignItems: 'center' },
  closeX:        { fontSize: 18, color: '#94a3b8' },
  summaryBox:    { marginHorizontal: 16, backgroundColor: '#f8fafc', borderRadius: 14, paddingHorizontal: 14, marginBottom: 14 },
  summaryRow:    { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 11 },
  summaryBorder: { borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  summaryKey:    { fontSize: 13, color: '#64748b' },
  summaryVal:    { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  reasonSection: { paddingHorizontal: 16, marginBottom: 16 },
  reasonTitle:   { fontSize: 13, fontWeight: '700', color: '#0f172a', marginBottom: 10 },
  reasonOption:  { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 8, minHeight: 46 },
  reasonActive:  { borderColor: '#ef4444', backgroundColor: '#fff5f5' },
  radio:         { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#cbd5e1', justifyContent: 'center', alignItems: 'center' },
  radioFilled:   { borderColor: '#ef4444' },
  radioDot:      { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ef4444' },
  reasonText:    { fontSize: 14, color: '#334155', fontWeight: '500' },
  reasonTextActive: { color: '#dc2626', fontWeight: '700' },
  otherInput:    { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 12, fontSize: 14, color: '#0f172a', minHeight: 60, textAlignVertical: 'top', marginTop: 4 },
  btnRow:        { flexDirection: 'row', paddingHorizontal: 16, gap: 10 },
  cancelBtn:     { flex: 1, paddingVertical: 15, borderRadius: 14, backgroundColor: '#f1f5f9', alignItems: 'center', minHeight: 52 },
  cancelBtnText: { fontSize: 15, fontWeight: '700', color: '#475569' },
  deleteBtn:     { flex: 1, paddingVertical: 15, borderRadius: 14, backgroundColor: '#ef4444', alignItems: 'center', minHeight: 52 },
  deleteBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});

// ─── CANCEL REASON MODAL ─────────────────────────────────────────────────────────
function CancelReasonModal({ order, onClose, onConfirm }) {
  const { t } = useTranslation();
  const [reason, setReason]       = useState('');
  const [otherText, setOtherText] = useState('');
  const [cancelling, setCancelling] = useState(false);

  if (!order) return null;

  const canConfirm = reason && (reason !== 'Other' || otherText.trim().length > 0);

  async function doCancel() {
    setCancelling(true);
    const finalReason = reason === 'Other' ? otherText.trim() : reason;
    await onConfirm(finalReason);
    setCancelling(false);
  }

  return (
    <Modal visible animationType="slide" transparent statusBarTranslucent onRequestClose={onClose}>
      <View style={cr.overlay}>
        <TouchableOpacity style={cr.bg} activeOpacity={1} onPress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={cr.sheetWrap}>
          <View style={cr.sheet}>
            <View style={cr.handle} />

            <View style={cr.header}>
              <Text style={cr.title}>Cancel Order</Text>
              <TouchableOpacity onPress={onClose} style={cr.closeXBtn}>
                <MaterialIcons name="close" size={20} color="#475569" />
              </TouchableOpacity>
            </View>

            {/* Summary */}
            <View style={cr.summaryBox}>
              {[
                ['Order', shortId(order)],
                ['Table', order.table_name || (order.table_number ? `Table ${order.table_number}` : 'Walk-in')],
                ['Total', money(order.total_amount)],
              ].map(([k, v], i, arr) => (
                <View key={k} style={[cr.summaryRow, i < arr.length - 1 && cr.summaryBorder]}>
                  <Text style={cr.summaryKey}>{k}</Text>
                  <Text style={[cr.summaryVal, k === 'Total' && { color: colors.admin, fontWeight: '800' }]}>{v}</Text>
                </View>
              ))}
            </View>

            {/* Reason selection */}
            <View style={cr.reasonSection}>
              <Text style={cr.reasonTitle}>
                {t('ordersExtra.reasonForCancellation','Reason for cancellation')} <Text style={{ color: '#ef4444' }}>*</Text>
              </Text>
              {CANCEL_REASONS.map(r => (
                <TouchableOpacity
                  key={r}
                  style={[cr.reasonOption, reason === r && cr.reasonActive]}
                  onPress={() => setReason(r)}
                  activeOpacity={0.7}
                >
                  <View style={[cr.radio, reason === r && cr.radioFilled]}>
                    {reason === r && <View style={cr.radioDot} />}
                  </View>
                  <Text style={[cr.reasonText, reason === r && cr.reasonTextActive]}>{r}</Text>
                </TouchableOpacity>
              ))}
              {reason === 'Other' && (
                <TextInput
                  style={cr.otherInput}
                  value={otherText}
                  onChangeText={setOtherText}
                  placeholder={t('placeholders.describeReason','Describe the reason…')}
                  placeholderTextColor="#94a3b8"
                  multiline
                />
              )}
            </View>

            <View style={cr.btnRow}>
              <TouchableOpacity style={cr.cancelBtn} onPress={onClose}>
                <Text style={cr.cancelBtnText}>{t('ordersExtra.goBack','Go Back')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[cr.confirmBtn, !canConfirm && { opacity: 0.38 }]}
                onPress={doCancel}
                disabled={!canConfirm || cancelling}
              >
                {cancelling
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={cr.confirmBtnText}>{t('ordersExtra.cancelOrderShort','Cancel Order')}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
const cr = StyleSheet.create({
  overlay:       { flex: 1, justifyContent: 'flex-end' },
  bg:            { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheetWrap:     { justifyContent: 'flex-end' },
  sheet:         { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 36 },
  handle:        { width: 40, height: 4, borderRadius: 2, backgroundColor: '#e2e8f0', alignSelf: 'center', marginTop: 10, marginBottom: 12 },
  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 12 },
  title:         { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  closeXBtn:     { width: 32, height: 32, justifyContent: 'center', alignItems: 'center' },
  summaryBox:    { marginHorizontal: 16, backgroundColor: '#f8fafc', borderRadius: 14, paddingHorizontal: 14, marginBottom: 14 },
  summaryRow:    { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 11 },
  summaryBorder: { borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  summaryKey:    { fontSize: 13, color: '#64748b' },
  summaryVal:    { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  reasonSection: { paddingHorizontal: 16, marginBottom: 16 },
  reasonTitle:   { fontSize: 13, fontWeight: '700', color: '#0f172a', marginBottom: 10 },
  reasonOption:  { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 8, minHeight: 46 },
  reasonActive:  { borderColor: '#f97316', backgroundColor: '#fff7ed' },
  radio:         { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#cbd5e1', justifyContent: 'center', alignItems: 'center' },
  radioFilled:   { borderColor: '#f97316' },
  radioDot:      { width: 8, height: 8, borderRadius: 4, backgroundColor: '#f97316' },
  reasonText:    { fontSize: 14, color: '#334155', fontWeight: '500' },
  reasonTextActive: { color: '#ea580c', fontWeight: '700' },
  otherInput:    { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 12, fontSize: 14, color: '#0f172a', minHeight: 60, textAlignVertical: 'top', marginTop: 4 },
  btnRow:        { flexDirection: 'row', paddingHorizontal: 16, gap: 10 },
  cancelBtn:     { flex: 1, paddingVertical: 15, borderRadius: 14, backgroundColor: '#f1f5f9', alignItems: 'center', minHeight: 52 },
  cancelBtnText: { fontSize: 15, fontWeight: '700', color: '#475569' },
  confirmBtn:    { flex: 1, paddingVertical: 15, borderRadius: 14, backgroundColor: '#ef4444', alignItems: 'center', minHeight: 52 },
  confirmBtnText:{ fontSize: 15, fontWeight: '700', color: '#fff' },
});

// ─── SHARED PICKER STYLES ─────────────────────────────────────────────────────
const pkr = StyleSheet.create({
  overlay:    { flex: 1, justifyContent: 'flex-end' },
  bg:         { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet:      { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '60%', paddingBottom: 36 },
  handle:     { width: 40, height: 4, borderRadius: 2, backgroundColor: '#e2e8f0', alignSelf: 'center', marginTop: 10, marginBottom: 8 },
  title:      { fontSize: 16, fontWeight: '800', color: '#0f172a', textAlign: 'center', paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', marginHorizontal: 16 },
  option:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#f8fafc', minHeight: 52 },
  optionText: { fontSize: 15, color: '#0f172a', fontWeight: '500' },
  check:      { fontSize: 16, color: colors.admin, fontWeight: '800' },
});

// ─── INLINE FIELD ROW (used in Edit modals) ───────────────────────────────────
function FieldLabel({ children }) {
  return <Text style={fld.label}>{children}</Text>;
}
function SelectRow({ value, placeholder, onPress }) {
  return (
    <TouchableOpacity style={fld.row} onPress={onPress} activeOpacity={0.7}>
      <Text style={value ? fld.value : fld.placeholder} numberOfLines={1}>{value || placeholder}</Text>
      <Text style={fld.chevron}>›</Text>
    </TouchableOpacity>
  );
}
const fld = StyleSheet.create({
  label:       { fontSize: 11, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6, marginTop: 16 },
  row:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f8fafc', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', paddingHorizontal: 14, paddingVertical: 13, minHeight: 48 },
  value:       { fontSize: 14, color: '#0f172a', fontWeight: '500', flex: 1 },
  placeholder: { fontSize: 14, color: '#94a3b8', flex: 1 },
  chevron:     { fontSize: 22, color: '#94a3b8', marginLeft: 4 },
});

// ─── EDIT CURRENT ORDER (full-screen) ─────────────────────────────────────────
function EditCurrentOrderModal({ order, onClose, onSaved, showToast }) {
  const { t } = useTranslation();
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);

  const [tableId,      setTableId]      = useState('');
  const [tableName,    setTableName]    = useState('');
  const [waitressId,   setWaitressId]   = useState('');
  const [waitressName, setWaitressName] = useState('');
  const [guestCount,   setGuestCount]   = useState(1);
  const [notes,        setNotes]        = useState('');
  const [items,        setItems]        = useState([]);

  const [tables,     setTables]     = useState([]);
  const [staff,      setStaff]      = useState([]);
  const [menuItems,  setMenuItems]  = useState([]);
  const [menuSearch, setMenuSearch] = useState('');

  const [showTablePicker,    setShowTablePicker]    = useState(false);
  const [showWaitressPicker, setShowWaitressPicker] = useState(false);

  const isKitchenBusy = ['preparing', 'ready'].includes(order?.status);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      ordersAPI.getById(order.id),
      tablesAPI.getAll(),
      usersAPI.getAll(),
      menuAPI.getItems(),
    ]).then(([oRes, tRes, sRes, mRes]) => {
      if (!mounted) return;
      const o = oRes.data;
      setTableId(o.table_id || '');
      setTableName(o.table_name || (o.table_number ? `Table ${o.table_number}` : ''));
      setWaitressId(o.waitress_id || o.user_id || '');
      setWaitressName(o.waitress_name || o.waiter_name || '');
      setGuestCount(Number(o.guest_count) || 1);
      setNotes(o.notes || '');
      // NOTE: use the order_items row id (i.id) as the LOCAL unique key to avoid
      // collisions when two order_items rows share the same menu_item_id.
      // Keep menu_item_id separately so handleSave can submit the correct FK.
      setItems((o.items || []).map(i => ({
        id:           i.id || i.item_id || i.menu_item_id,
        menu_item_id: i.menu_item_id || i.item_id || i.id,
        name:         i.item_name || i.name,
        price:        Number(i.unit_price || i.price || 0),
        quantity:     Number(i.quantity || 1),
      })));
      setTables(tRes.data || []);
      setStaff(sRes.data || []);
      setMenuItems(mRes.data || []);
      setLoading(false);
    }).catch(() => {
      if (!mounted) return;
      showToast(t('adminExtra.failedLoadOrder'), 'error');
      setLoading(false);
    });
    return () => { mounted = false; };
  }, [order?.id]);

  const liveTotal = items.reduce((s, i) => s + i.price * i.quantity, 0);

  function addMenuItem(mi) {
    const miId = mi.id || mi.menu_item_id;
    setItems(prev => {
      // Match on menu_item_id so the same menu item increments qty instead of duplicating.
      const ex = prev.find(i => i.menu_item_id === miId);
      if (ex) return prev.map(i => i.menu_item_id === miId ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, {
        id:           `new_${miId}_${Date.now()}`,
        menu_item_id: miId,
        name:         mi.name || mi.item_name,
        price:        Number(mi.price || mi.unit_price || 0),
        quantity:     1,
      }];
    });
  }
  function changeQty(id, delta) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, quantity: Math.max(1, i.quantity + delta) } : i));
  }
  function removeItem(id) {
    if (items.length <= 1) { showToast(t('adminExtra.atLeast1Item'), 'error'); return; }
    setItems(prev => prev.filter(i => i.id !== id));
  }

  async function handleSave() {
    if (!tableId && !tableName) { showToast(t('adminExtra.pleaseSelectTable'), 'error'); return; }
    if (items.length === 0)     { showToast(t('adminExtra.atLeast1Item'), 'error'); return; }
    setSaving(true);
    try {
      await ordersAPI.update(order.id, {
        table_id:    tableId    || undefined,
        waitress_id: waitressId || undefined,
        guest_count: guestCount,
        notes:       notes      || undefined,
        // Send menu_item_id explicitly so removed items actually drop from the
        // server (backend does DELETE + INSERT of the provided items list).
        items:       items.map(i => ({ menu_item_id: i.menu_item_id || i.id, quantity: i.quantity })),
      });
      showToast(`Order ${shortId(order)} updated`, 'success');
      onSaved();
      onClose();
    } catch (e) {
      showToast(e.response?.data?.error || t('adminExtra.failedSaveChanges'), 'error');
    }
    setSaving(false);
  }

  const filteredMenu = menuItems.filter(m =>
    (m.name || m.item_name || '').toLowerCase().includes(menuSearch.toLowerCase())
  );

  return (
    <>
      <Modal visible animationType="slide" statusBarTranslucent onRequestClose={onClose}>
        <View style={ec.container}>
          {/* Header */}
          <View style={ec.header}>
            <TouchableOpacity onPress={onClose} style={ec.headerBtn}>
              <MaterialIcons name="close" size={20} color="#475569" />
            </TouchableOpacity>
            <Text style={ec.title} numberOfLines={1}>{`${t('admin.editOrder.editOrderTitle','Edit Order')} ${shortId(order)}`}</Text>
            <TouchableOpacity style={ec.saveBtn} onPress={handleSave} disabled={saving}>
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={ec.saveBtnText}>{t('common.save','Save')}</Text>}
            </TouchableOpacity>
          </View>

          {/* Kitchen warning */}
          {isKitchenBusy && (
            <View style={ec.kitchenWarn}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <MaterialIcons name="warning" size={16} color="#c2410c" style={{ marginRight: 8, marginTop: 1 }} />
                <Text style={ec.kitchenWarnText}>
                  {t('adminExtra.kitchenWarning')}
                </Text>
              </View>
            </View>
          )}

          {loading
            ? <View style={ec.loadWrap}><ActivityIndicator size="large" color={colors.admin} /></View>
            : (
              <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <ScrollView style={{ flex: 1 }} contentContainerStyle={ec.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

                  {/* ── Order Info ── */}
                  <Text style={ec.sectionTitle}>{t('adminExtra.orderInfo')}</Text>

                  <FieldLabel>{t('adminExtra.table')}</FieldLabel>
                  <SelectRow value={tableName} placeholder={t('adminExtra.selectTablePlaceholder')} onPress={() => setShowTablePicker(true)} />

                  <FieldLabel>{t('adminExtra.waitressLabel')}</FieldLabel>
                  <SelectRow value={waitressName} placeholder={t('adminExtra.selectWaitressPlaceholder')} onPress={() => setShowWaitressPicker(true)} />

                  <FieldLabel>{t('adminExtra.numberOfGuests')}</FieldLabel>
                  <View style={ec.qtyRow}>
                    <TouchableOpacity style={ec.qtyBtn} onPress={() => setGuestCount(g => Math.max(1, g - 1))}>
                      <Text style={ec.qtyBtnText}>−</Text>
                    </TouchableOpacity>
                    <Text style={ec.qtyNum}>{guestCount}</Text>
                    <TouchableOpacity style={ec.qtyBtn} onPress={() => setGuestCount(g => g + 1)}>
                      <Text style={ec.qtyBtnText}>+</Text>
                    </TouchableOpacity>
                  </View>

                  {/* ── Order Items ── */}
                  <Text style={ec.sectionTitle}>{t('adminExtra.orderItems')}</Text>
                  {items.map(it => (
                    <View key={it.id} style={ec.itemRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={ec.itemName} numberOfLines={1}>{it.name}</Text>
                        <Text style={ec.itemPrice}>{money(it.price)}</Text>
                      </View>
                      <View style={ec.itemControls}>
                        <TouchableOpacity style={ec.ctrlBtn} onPress={() => changeQty(it.id, -1)}>
                          <Text style={ec.ctrlBtnText}>−</Text>
                        </TouchableOpacity>
                        <Text style={ec.itemQty}>{it.quantity}</Text>
                        <TouchableOpacity style={ec.ctrlBtn} onPress={() => changeQty(it.id, 1)}>
                          <Text style={ec.ctrlBtnText}>+</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={ec.removeBtn} onPress={() => removeItem(it.id)}>
                          <MaterialIcons name="close" size={16} color="#dc2626" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}

                  {/* ── Add Items ── */}
                  <Text style={ec.sectionTitle}>{t('adminExtra.addItemsLabel')}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', paddingLeft: 12, marginBottom: 10 }}>
                    <MaterialIcons name="search" size={18} color="#94a3b8" style={{ marginRight: 6 }} />
                    <TextInput
                      style={{ flex: 1, paddingHorizontal: 6, paddingVertical: 12, fontSize: 14, color: '#0f172a' }}
                      value={menuSearch}
                      onChangeText={setMenuSearch}
                      placeholder={t('adminExtra.searchMenu')}
                      placeholderTextColor="#94a3b8"
                      clearButtonMode="while-editing"
                    />
                  </View>
                  {filteredMenu.map(mi => (
                    <TouchableOpacity key={mi.id} style={ec.menuRow} onPress={() => addMenuItem(mi)}>
                      <View style={{ flex: 1 }}>
                        <Text style={ec.menuName}>{mi.name || mi.item_name}</Text>
                        <Text style={ec.menuPrice}>{money(mi.price || mi.unit_price || 0)}</Text>
                      </View>
                      <View style={ec.addBtn}><Text style={ec.addBtnText}>+</Text></View>
                    </TouchableOpacity>
                  ))}

                  {/* ── Notes ── */}
                  <Text style={ec.sectionTitle}>{t('common.notes','Notes')}</Text>
                  <TextInput
                    style={ec.notesInput}
                    value={notes}
                    onChangeText={setNotes}
                    placeholder={t('placeholders.specialInstructions',"Special instructions…")}
                    placeholderTextColor="#94a3b8"
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                  />

                  {/* ── Live Total ── */}
                  <View style={ec.totalBox}>
                    <Text style={ec.totalLabel}>{t('common.total','Total')}</Text>
                    <Text style={ec.totalVal}>{money(liveTotal)}</Text>
                  </View>

                  <View style={{ height: 48 }} />
                </ScrollView>
              </KeyboardAvoidingView>
            )}
        </View>

        {/* Table picker */}
        {showTablePicker && (
          <Modal visible animationType="slide" transparent statusBarTranslucent onRequestClose={() => setShowTablePicker(false)}>
            <View style={pkr.overlay}>
              <TouchableOpacity style={pkr.bg} activeOpacity={1} onPress={() => setShowTablePicker(false)} />
              <View style={pkr.sheet}>
                <View style={pkr.handle} />
                <Text style={pkr.title}>{t('admin.newOrder.selectTable','Select Table')}</Text>
                <ScrollView>
                  {tables.map(tb => {
                    const name = tb.name || (tb.table_number ? `Table ${tb.table_number}` : `Table ${tb.id}`);
                    return (
                      <TouchableOpacity key={tb.id} style={pkr.option} onPress={() => { setTableId(tb.id); setTableName(name); setShowTablePicker(false); }}>
                        <Text style={pkr.optionText}>{name}</Text>
                        {tableId === tb.id && <MaterialIcons name="check" size={18} color="#16A34A" />}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            </View>
          </Modal>
        )}

        {/* Waitress picker */}
        {showWaitressPicker && (
          <Modal visible animationType="slide" transparent statusBarTranslucent onRequestClose={() => setShowWaitressPicker(false)}>
            <View style={pkr.overlay}>
              <TouchableOpacity style={pkr.bg} activeOpacity={1} onPress={() => setShowWaitressPicker(false)} />
              <View style={pkr.sheet}>
                <View style={pkr.handle} />
                <Text style={pkr.title}>{t('placeholders.selectWaitress','Select Waitress')}</Text>
                <ScrollView>
                  {staff.map(s => {
                    const name = s.full_name || s.name || s.email;
                    return (
                      <TouchableOpacity key={s.id} style={pkr.option} onPress={() => { setWaitressId(s.id); setWaitressName(name); setShowWaitressPicker(false); }}>
                        <Text style={pkr.optionText}>{name}</Text>
                        {waitressId === s.id && <MaterialIcons name="check" size={18} color="#16A34A" />}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            </View>
          </Modal>
        )}
      </Modal>
    </>
  );
}
const ec = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#f8fafc' },
  header:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: topInset + 12, paddingBottom: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  headerBtn:       { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center' },
  headerBtnText:   { fontSize: 16, color: '#475569', fontWeight: '700' },
  title:           { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '800', color: '#0f172a', marginHorizontal: 8 },
  saveBtn:         { backgroundColor: colors.admin, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 9, minHeight: 44, justifyContent: 'center' },
  saveBtnText:     { color: '#fff', fontWeight: '800', fontSize: 14 },
  kitchenWarn:     { backgroundColor: '#fff7ed', borderBottomWidth: 1, borderBottomColor: '#fed7aa', paddingHorizontal: 16, paddingVertical: 11 },
  kitchenWarnText: { fontSize: 13, color: '#c2410c', fontWeight: '500', lineHeight: 18 },
  loadWrap:        { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll:          { paddingHorizontal: 16, paddingTop: 8 },
  sectionTitle:    { fontSize: 11, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 24, marginBottom: 2 },
  qtyRow:          { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden' },
  qtyBtn:          { width: 52, height: 48, justifyContent: 'center', alignItems: 'center' },
  qtyBtnText:      { fontSize: 22, color: colors.admin, fontWeight: '700' },
  qtyNum:          { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '800', color: '#0f172a' },
  itemRow:         { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 8, ...shadow.sm, gap: 10 },
  itemName:        { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  itemPrice:       { fontSize: 12, color: colors.admin, marginTop: 2 },
  itemControls:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ctrlBtn:         { width: 36, height: 36, borderRadius: 18, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center' },
  ctrlBtnText:     { fontSize: 18, color: '#475569', fontWeight: '700', lineHeight: 22 },
  itemQty:         { minWidth: 28, textAlign: 'center', fontSize: 15, fontWeight: '800', color: '#0f172a' },
  removeBtn:       { width: 36, height: 36, borderRadius: 18, backgroundColor: '#fef2f2', justifyContent: 'center', alignItems: 'center', marginLeft: 4 },
  removeBtnText:   { fontSize: 14, color: '#ef4444', fontWeight: '700' },
  searchInput:     { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: '#0f172a', marginBottom: 10 },
  menuRow:         { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 8, ...shadow.sm, gap: 10 },
  menuName:        { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  menuPrice:       { fontSize: 12, color: colors.admin, marginTop: 2 },
  addBtn:          { width: 36, height: 36, borderRadius: 18, backgroundColor: '#eff6ff', justifyContent: 'center', alignItems: 'center' },
  addBtnText:      { fontSize: 22, color: colors.admin, fontWeight: '700', lineHeight: 28 },
  notesInput:      { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: '#0f172a', minHeight: 80 },
  totalBox:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#eff6ff', borderRadius: 14, padding: 16, marginTop: 20 },
  totalLabel:      { fontSize: 14, fontWeight: '700', color: '#1d4ed8' },
  totalVal:        { fontSize: 20, fontWeight: '900', color: colors.admin },
});

// ─── EDIT PAID ORDER (bottom sheet) ──────────────────────────────────────────
function EditPaidOrderModal({ order, onClose, onSaved, showToast }) {
  const { t } = useTranslation();
  const [saving,  setSaving]  = useState(false);
  const [loading, setLoading] = useState(true);

  const [tableId,      setTableId]      = useState('');
  const [tableName,    setTableName]    = useState('');
  const [waitressId,   setWaitressId]   = useState('');
  const [waitressName, setWaitressName] = useState('');
  const [payMethod,    setPayMethod]    = useState('Cash');
  const [notes,        setNotes]        = useState('');
  const [readonlyItems, setReadonlyItems] = useState([]);
  const [orderTotal,   setOrderTotal]   = useState(0);

  const [tables,  setTables]  = useState([]);
  const [staff,   setStaff]   = useState([]);

  const [showTablePicker,    setShowTablePicker]    = useState(false);
  const [showWaitressPicker, setShowWaitressPicker] = useState(false);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      ordersAPI.getById(order.id),
      tablesAPI.getAll(),
      usersAPI.getAll(),
    ]).then(([oRes, tRes, sRes]) => {
      if (!mounted) return;
      const o = oRes.data;
      setTableId(o.table_id || '');
      setTableName(o.table_name || (o.table_number ? `Table ${o.table_number}` : ''));
      setWaitressId(o.waitress_id || o.user_id || '');
      setWaitressName(o.waitress_name || o.waiter_name || '');
      const pm = o.payment_method || 'cash';
      setPayMethod(pm.charAt(0).toUpperCase() + pm.slice(1));
      setNotes(o.notes || '');
      setReadonlyItems(o.items || []);
      setOrderTotal(Number(o.total_amount) || 0);
      setTables(tRes.data || []);
      setStaff(sRes.data || []);
      setLoading(false);
    }).catch(() => {
      if (!mounted) return;
      setLoading(false);
    });
    return () => { mounted = false; };
  }, [order?.id]);

  async function handleSave() {
    setSaving(true);
    try {
      await ordersAPI.update(order.id, {
        table_id:       tableId    || undefined,
        waitress_id:    waitressId || undefined,
        payment_method: payMethod.toLowerCase(),
        notes:          notes      || undefined,
      });
      showToast(`Order ${shortId(order)} updated`, 'success');
      onSaved();
      onClose();
    } catch (e) {
      showToast(e.response?.data?.error || t('adminExtra.failedSaveChanges'), 'error');
    }
    setSaving(false);
  }

  return (
    <>
      <Modal visible animationType="slide" transparent statusBarTranslucent onRequestClose={onClose}>
        <View style={ep.overlay}>
          <TouchableOpacity style={ep.bg} activeOpacity={1} onPress={onClose} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={ep.sheetWrap}>
            <View style={ep.sheet}>
              <View style={ep.handle} />

              {/* Header */}
              <View style={ep.header}>
                <TouchableOpacity onPress={onClose} style={ep.closeBtn}>
                  <MaterialIcons name="close" size={20} color="#475569" />
                </TouchableOpacity>
                <Text style={ep.title} numberOfLines={1}>{`${t('admin.editOrder.editPaidOrder','Edit Paid Order')} ${shortId(order)}`}</Text>
                <TouchableOpacity style={ep.saveBtn} onPress={handleSave} disabled={saving}>
                  {saving
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={ep.saveBtnText}>{t('common.save','Save')}</Text>}
                </TouchableOpacity>
              </View>

              {/* Warning */}
              <View style={ep.warning}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                  <MaterialIcons name="warning" size={16} color="#c2410c" style={{ marginRight: 8, marginTop: 1 }} />
                  <Text style={ep.warningText}>
                    This order is paid. Only administrative details can be changed.
                  </Text>
                </View>
              </View>

              {loading
                ? <View style={ep.loadWrap}><ActivityIndicator color={colors.admin} /></View>
                : (
                  <ScrollView style={{ maxHeight: '70%' }} contentContainerStyle={ep.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

                    {/* Payment Method */}
                    <FieldLabel>Payment Method</FieldLabel>
                    <View style={ep.methodRow}>
                      {PAYMENT_METHODS.map(m => (
                        <TouchableOpacity
                          key={m}
                          style={[ep.methodPill, payMethod === m && ep.methodPillActive]}
                          onPress={() => setPayMethod(m)}
                        >
                          <Text style={[ep.methodText, payMethod === m && ep.methodTextActive]}>{m}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <FieldLabel>Assigned Waitress</FieldLabel>
                    <SelectRow value={waitressName} placeholder={t('placeholders.selectWaitress','Select waitress')} onPress={() => setShowWaitressPicker(true)} />

                    <FieldLabel>{t('adminExtra.table','Table')}</FieldLabel>
                    <SelectRow value={tableName} placeholder={t('placeholders.selectTable','Select table')} onPress={() => setShowTablePicker(true)} />

                    <FieldLabel>Internal Notes</FieldLabel>
                    <TextInput
                      style={ep.notesInput}
                      value={notes}
                      onChangeText={setNotes}
                      placeholder={t('placeholders.internalNotes','Internal notes…')}
                      placeholderTextColor="#94a3b8"
                      multiline
                      numberOfLines={2}
                      textAlignVertical="top"
                    />

                    {/* Read-only items */}
                    <FieldLabel>Order Items (Read-only)</FieldLabel>
                    {readonlyItems.map((it, idx) => (
                      <View key={idx} style={ep.readonlyRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={ep.readonlyName}>{it.item_name || it.name}</Text>
                          <Text style={ep.readonlyQty}>×{it.quantity}</Text>
                        </View>
                        <Text style={ep.readonlyTotal}>{money(Number(it.unit_price || it.price || 0) * Number(it.quantity || 1))}</Text>
                      </View>
                    ))}

                    <View style={ep.totalBox}>
                      <Text style={ep.totalLabel}>Total</Text>
                      <Text style={ep.totalVal}>{money(orderTotal || Number(order.total_amount))}</Text>
                    </View>

                    <View style={{ height: 24 }} />
                  </ScrollView>
                )}
            </View>
          </KeyboardAvoidingView>
        </View>

        {/* Table picker */}
        {showTablePicker && (
          <Modal visible animationType="slide" transparent statusBarTranslucent onRequestClose={() => setShowTablePicker(false)}>
            <View style={pkr.overlay}>
              <TouchableOpacity style={pkr.bg} activeOpacity={1} onPress={() => setShowTablePicker(false)} />
              <View style={pkr.sheet}>
                <View style={pkr.handle} />
                <Text style={pkr.title}>{t('admin.newOrder.selectTable','Select Table')}</Text>
                <ScrollView>
                  {tables.map(tb => {
                    const name = tb.name || (tb.table_number ? `Table ${tb.table_number}` : `Table ${tb.id}`);
                    return (
                      <TouchableOpacity key={tb.id} style={pkr.option} onPress={() => { setTableId(tb.id); setTableName(name); setShowTablePicker(false); }}>
                        <Text style={pkr.optionText}>{name}</Text>
                        {tableId === tb.id && <MaterialIcons name="check" size={18} color="#16A34A" />}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            </View>
          </Modal>
        )}

        {/* Waitress picker */}
        {showWaitressPicker && (
          <Modal visible animationType="slide" transparent statusBarTranslucent onRequestClose={() => setShowWaitressPicker(false)}>
            <View style={pkr.overlay}>
              <TouchableOpacity style={pkr.bg} activeOpacity={1} onPress={() => setShowWaitressPicker(false)} />
              <View style={pkr.sheet}>
                <View style={pkr.handle} />
                <Text style={pkr.title}>{t('placeholders.selectWaitress','Select Waitress')}</Text>
                <ScrollView>
                  {staff.map(s => {
                    const name = s.full_name || s.name || s.email;
                    return (
                      <TouchableOpacity key={s.id} style={pkr.option} onPress={() => { setWaitressId(s.id); setWaitressName(name); setShowWaitressPicker(false); }}>
                        <Text style={pkr.optionText}>{name}</Text>
                        {waitressId === s.id && <MaterialIcons name="check" size={18} color="#16A34A" />}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            </View>
          </Modal>
        )}
      </Modal>
    </>
  );
}
const ep = StyleSheet.create({
  overlay:         { flex: 1, justifyContent: 'flex-end' },
  bg:              { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheetWrap:       { justifyContent: 'flex-end' },
  sheet:           { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  handle:          { width: 40, height: 4, borderRadius: 2, backgroundColor: '#e2e8f0', alignSelf: 'center', marginTop: 10, marginBottom: 8 },
  header:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  closeBtn:        { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center' },
  closeX:          { fontSize: 16, color: '#475569', fontWeight: '700' },
  title:           { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '800', color: '#0f172a', marginHorizontal: 6 },
  saveBtn:         { backgroundColor: colors.admin, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 8, minHeight: 44, justifyContent: 'center' },
  saveBtnText:     { color: '#fff', fontWeight: '800', fontSize: 13 },
  warning:         { backgroundColor: '#fff7ed', borderBottomWidth: 1, borderBottomColor: '#fed7aa', paddingHorizontal: 16, paddingVertical: 10 },
  warningText:     { fontSize: 12, color: '#c2410c', fontWeight: '500', lineHeight: 17 },
  loadWrap:        { padding: 40, alignItems: 'center' },
  scroll:          { paddingHorizontal: 16, paddingTop: 4 },
  methodRow:       { flexDirection: 'row', gap: 8 },
  methodPill:      { flex: 1, paddingVertical: 11, borderRadius: 12, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center', minHeight: 44 },
  methodPillActive:{ backgroundColor: colors.admin, borderColor: colors.admin },
  methodText:      { fontSize: 13, fontWeight: '600', color: '#64748b' },
  methodTextActive:{ color: '#fff' },
  notesInput:      { backgroundColor: '#f8fafc', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: '#0f172a', minHeight: 60 },
  readonlyRow:     { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 6 },
  readonlyName:    { fontSize: 13, fontWeight: '600', color: '#334155' },
  readonlyQty:     { fontSize: 11, color: '#94a3b8', marginTop: 1 },
  readonlyTotal:   { fontSize: 13, fontWeight: '700', color: '#475569' },
  totalBox:        { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#eff6ff', borderRadius: 12, padding: 14, marginTop: 14 },
  totalLabel:      { fontSize: 14, fontWeight: '700', color: '#1d4ed8' },
  totalVal:        { fontSize: 18, fontWeight: '900', color: colors.admin },
});

// ─── LOAN DATE PICKER ────────────────────────────────────────────────────────
const LOAN_MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const LOAN_DAY_HDRS    = ['Mo','Tu','We','Th','Fr','Sa','Su'];

function LoanDatePickerSheet({ current, onSelect, onClose }) {
  const todayObj = new Date();
  const [viewYear,  setViewYear]  = useState(todayObj.getFullYear());
  const [viewMonth, setViewMonth] = useState(todayObj.getMonth());

  const fmtDs = (d) => {
    const dd = String(d.getDate()).padStart(2,'0');
    const mm = String(d.getMonth()+1).padStart(2,'0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  };
  const todayStr = fmtDs(todayObj);

  const prevMonth = () => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y-1); } else setViewMonth(m => m-1); };
  const nextMonth = () => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y+1); } else setViewMonth(m => m+1); };

  const firstDow  = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;
  const daysInMon = new Date(viewYear, viewMonth+1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMon; d++) cells.push(fmtDs(new Date(viewYear, viewMonth, d)));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i+7));

  return (
    <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 8 }}>
        <MaterialIcons name="calendar-today" size={18} color={colors.admin} />
        <Text style={{ fontSize: 16, fontWeight: '800', color: '#0f172a', marginLeft: 4 }}>Select Due Date</Text>
        <TouchableOpacity onPress={onClose} style={{ marginLeft: 'auto' }}>
          <MaterialIcons name="close" size={20} color="#94a3b8" />
        </TouchableOpacity>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <TouchableOpacity onPress={prevMonth} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 24, color: colors.admin, fontWeight: '700', lineHeight: 28 }}>‹</Text></TouchableOpacity>
        <Text style={{ fontSize: 15, fontWeight: '800', color: '#0f172a' }}>{LOAN_MONTH_NAMES[viewMonth]} {viewYear}</Text>
        <TouchableOpacity onPress={nextMonth} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 24, color: colors.admin, fontWeight: '700', lineHeight: 28 }}>›</Text></TouchableOpacity>
      </View>
      <View style={{ flexDirection: 'row', marginBottom: 4 }}>
        {LOAN_DAY_HDRS.map(d => (
          <View key={d} style={{ flex: 1, alignItems: 'center', paddingVertical: 4 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#94a3b8' }}>{d}</Text>
          </View>
        ))}
      </View>
      {weeks.map((week, wi) => (
        <View key={wi} style={{ flexDirection: 'row' }}>
          {week.map((ds, di) => {
            if (!ds) return <View key={`e${di}`} style={{ flex: 1, aspectRatio: 1 }} />;
            const isSel  = ds === current;
            const isPast = ds < todayStr;
            const isToday = ds === todayStr;
            const bg = isSel ? colors.admin : 'transparent';
            const tc = isSel ? '#fff' : isPast ? '#e2e8f0' : isToday ? colors.admin : '#0f172a';
            return (
              <TouchableOpacity
                key={ds} disabled={isPast}
                style={{ flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: bg, borderRadius: isSel ? 9 : 0 }}
                onPress={() => onSelect(ds)} activeOpacity={0.7}
              >
                <Text style={{ fontSize: 13, fontWeight: isSel || isToday ? '800' : '400', color: tc }}>
                  {parseInt(ds.split('-')[2], 10)}
                </Text>
                {isToday && !isSel && <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: colors.admin, marginTop: 1 }} />}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// ─── PAYMENT SHEET ────────────────────────────────────────────────────────────
function PaymentSheet({ visible, order, onClose, onPaid }) {
  const { t } = useTranslation();
  const [method,      setMethod]      = useState('Cash');
  const [cashIn,      setCashIn]      = useState('');
  const [cardOk,      setCardOk]      = useState(false);
  const [qrOk,        setQrOk]        = useState(false);
  const [discType,    setDiscType]    = useState('Percentage');
  const [discVal,     setDiscVal]     = useState('');
  const [discReason,  setDiscReason]  = useState(DISC_REASONS[0]);
  const [showReasons, setShowReasons] = useState(false);
  const [paying,      setPaying]      = useState(false);
  const [splitCount,  setSplitCount]  = useState(null);
  const [splitParts,  setSplitParts]  = useState([]);
  const [loanName,    setLoanName]    = useState('');
  const [loanPhone,   setLoanPhone]   = useState('');
  const [loanDueDate, setLoanDueDate] = useState('');
  const [showLoanCal, setShowLoanCal] = useState(false);

  // Reset state each time modal opens
  useEffect(() => {
    if (visible) {
      setMethod('Cash'); setCashIn(''); setCardOk(false); setQrOk(false);
      setDiscType('Percentage'); setDiscVal(''); setDiscReason(DISC_REASONS[0]);
      setShowReasons(false); setSplitCount(null); setSplitParts([]);
      setLoanName(''); setLoanPhone(''); setLoanDueDate(''); setShowLoanCal(false);
      setPaying(false);
    }
  }, [visible]);

  if (!order) return null;

  const baseTotal = parseFloat(order.total_amount) || 0;
  const discAmt   = discVal
    ? (discType === 'Percentage'
      ? Math.round(baseTotal * Math.min(parseFloat(discVal) || 0, 100) / 100)
      : Math.min(parseFloat(discVal) || 0, baseTotal))
    : 0;
  const total     = Math.max(0, baseTotal - discAmt);
  const cashRcv   = parseInt(cashIn) || 0;
  const change    = Math.max(0, cashRcv - total);

  // Split initialization
  useEffect(() => {
    if (!splitCount) { setSplitParts([]); return; }
    if (total === 0) { setSplitParts([]); return; }
    const base = Math.floor(total / splitCount);
    const rem  = total - base * splitCount;
    setSplitParts(Array.from({ length: splitCount }).map((_, i) => ({
      amount: String(base + (i === 0 ? rem : 0)), method: 'Cash', confirmed: false,
      loanName: '', loanPhone: '', loanDueDate: '',
    })));
  }, [splitCount, total]);

  // Auto-fill cash amount
  useEffect(() => {
    if (visible && method === 'Cash' && !cashIn && total > 0) setCashIn(String(total));
  }, [visible, method, total]);

  const splitTotal = splitParts.reduce((s, p) => s + (parseInt(p.amount) || 0), 0);
  const canPay = splitCount
    ? (splitTotal === total && splitParts.every(p =>
        p.confirmed && (p.method !== 'Loan' || (p.loanName.trim().length > 0 && p.loanDueDate.length > 0))
      ))
    : (method === 'Cash'    ? cashRcv >= total
    :  method === 'Card'    ? cardOk
    :  method === 'QR Code' ? qrOk
    :  method === 'Loan'    ? (loanName.trim().length > 0 && loanPhone.trim().length > 0 && loanDueDate.length > 0)
    : false);

  const resetMethod = (m) => {
    setMethod(m); setCardOk(false); setQrOk(false);
    setSplitCount(null); setLoanName(''); setLoanPhone(''); setLoanDueDate('');
  };

  async function confirmPay() {
    setPaying(true);
    try {
      const payload = {
        payment_method: splitCount ? 'split' : method.toLowerCase().replace(' ', '_'),
        discount_amount: discAmt,
        discount_reason: discAmt > 0 ? discReason : null,
        ...(method === 'Loan' ? {
          loan_customer_name:  loanName.trim(),
          loan_customer_phone: loanPhone.trim(),
          loan_due_date:       loanDueDate,
        } : {}),
      };
      if (splitCount) {
        payload.split_payments = splitParts.map(sp => ({
          method: ({ 'Cash': 'cash', 'Card': 'card', 'QR Code': 'qr_code', 'Loan': 'loan' }[sp.method] || sp.method.toLowerCase()),
          amount: parseInt(sp.amount) || 0,
          ...(sp.method === 'Loan' ? {
            loan_customer_name:  sp.loanName.trim(),
            loan_customer_phone: sp.loanPhone.trim(),
            loan_due_date:       sp.loanDueDate,
          } : {}),
        }));
      }
      await ordersAPI.pay(order.id, payload);
      onPaid();
    } catch (e) { Alert.alert(t('alerts.paymentFailed','Payment failed'), e.response?.data?.error || e.message); }
    setPaying(false);
  }

  const PAY_METHODS = [
    { id: 'Cash',    icon: 'payments'              },
    { id: 'Card',    icon: 'credit-card'            },
    { id: 'QR Code', icon: 'qr-code'               },
    { id: 'Loan',    icon: 'account-balance-wallet' },
  ];

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent>
      <KeyboardAvoidingView style={pay.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TouchableOpacity style={pay.bg} activeOpacity={1} onPress={onClose} />
        <View style={pay.sheet}>
          <View style={pay.handle} />
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
            <MaterialIcons name="credit-card" size={20} color="#0f172a" style={{ marginRight: 8 }} />
            <Text style={pay.title}>Collect Payment</Text>
            <TouchableOpacity onPress={onClose} style={{ marginLeft: 'auto' }}>
              <MaterialIcons name="close" size={22} color="#94a3b8" />
            </TouchableOpacity>
          </View>
          <Text style={pay.orderRef}>
            {shortId(order)}  ·  {order.table_name || (order.table_number ? `Table ${order.table_number}` : (order.customer_name || 'Walk-in'))}
          </Text>

          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: '80%' }} keyboardShouldPersistTaps="handled">
            {/* Order total */}
            <View style={pay.lineRow}><Text style={pay.lineLabel}>Order Total</Text><Text style={pay.lineVal}>{money(baseTotal)}</Text></View>

            {/* Discount */}
            <Text style={pay.fieldLabel}>Discount (Optional)</Text>
            <View style={pay.discRow}>
              {['Percentage', 'Fixed'].map(t => (
                <TouchableOpacity key={t} style={[pay.discToggle, discType === t && pay.discToggleActive]}
                  onPress={() => { setDiscType(t); setDiscVal(''); }}>
                  <Text style={[pay.discToggleTxt, discType === t && pay.discToggleTxtActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput style={[pay.input, { marginBottom: 6 }]} value={discVal} onChangeText={setDiscVal}
              placeholder={discType === 'Percentage' ? '0 — 100 %' : "0 so'm"} placeholderTextColor="#94a3b8" keyboardType="decimal-pad" />
            {discVal ? (
              <TouchableOpacity style={pay.reasonPicker} onPress={() => setShowReasons(true)}>
                <Text style={pay.reasonTxt}>{discReason}</Text>
                <MaterialIcons name="expand-more" size={18} color="#94a3b8" />
              </TouchableOpacity>
            ) : null}
            {discAmt > 0 && (
              <View style={[pay.lineRow, { marginTop: 4 }]}>
                <Text style={[pay.lineLabel, { color: '#16a34a' }]}>Discount</Text>
                <Text style={[pay.lineVal, { color: '#16a34a' }]}>− {money(discAmt)}</Text>
              </View>
            )}

            {/* Total */}
            <View style={[pay.lineRow, pay.totalDivider]}>
              <Text style={pay.totalLabel}>Total to Collect</Text>
              <Text style={pay.totalVal}>{money(total)}</Text>
            </View>

            {/* Payment method selector */}
            <Text style={pay.fieldLabel}>Payment Method</Text>
            <View style={pay.methodRow}>
              {PAY_METHODS.map(({ id, icon }) => (
                <TouchableOpacity key={id}
                  style={[pay.methodPill, method === id && pay.methodPillActive]}
                  onPress={() => resetMethod(id)}>
                  <MaterialIcons name={icon} size={20} color={method === id ? colors.admin : '#94a3b8'} />
                  <Text style={[pay.methodText, method === id && pay.methodTextActive]}>{id}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Cash */}
            {method === 'Cash' && (
              <View style={{ marginBottom: 8 }}>
                <Text style={pay.fieldLabel}>Amount Received</Text>
                <TextInput style={pay.input} keyboardType="numeric" value={cashIn} onChangeText={setCashIn}
                  placeholder="0" placeholderTextColor="#94a3b8" />
                {cashRcv >= total && cashRcv > 0 && (
                  <View style={pay.changeBox}>
                    <Text style={pay.changeLbl}>Change to give back</Text>
                    <Text style={pay.changeAmt}>{money(change)}</Text>
                  </View>
                )}
              </View>
            )}

            {/* Card */}
            {method === 'Card' && (
              <TouchableOpacity style={[pay.checkRow, cardOk && pay.checkRowOk]} onPress={() => setCardOk(!cardOk)}>
                <View style={[pay.checkbox, cardOk && pay.checkboxOk]}>
                  {cardOk && <MaterialIcons name="check" size={13} color="#fff" />}
                </View>
                <Text style={pay.checkLbl}>Card payment confirmed on terminal</Text>
              </TouchableOpacity>
            )}

            {/* QR Code */}
            {method === 'QR Code' && (
              <View style={{ marginBottom: 8 }}>
                <View style={pay.qrBox}>
                  <MaterialIcons name="qr-code" size={48} color="#e2e8f0" />
                  <Text style={pay.qrLbl}>Customer scans to pay</Text>
                </View>
                <TouchableOpacity style={[pay.checkRow, qrOk && pay.checkRowOk]} onPress={() => setQrOk(!qrOk)}>
                  <View style={[pay.checkbox, qrOk && pay.checkboxOk]}>
                    {qrOk && <MaterialIcons name="check" size={13} color="#fff" />}
                  </View>
                  <Text style={pay.checkLbl}>QR payment confirmed</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Loan */}
            {method === 'Loan' && (
              <View style={{ gap: 8, marginBottom: 8 }}>
                <View style={pay.loanNotice}>
                  <MaterialIcons name="info-outline" size={15} color="#D97706" />
                  <Text style={pay.loanNoticeTxt}>Order marked paid. Debt tracked until customer returns.</Text>
                </View>
                <Text style={pay.fieldLabel}>{t('common.customerName','Customer Name')}</Text>
                <TextInput style={pay.input} placeholder={t('placeholders.fullName','Full name')} placeholderTextColor="#94a3b8" value={loanName} onChangeText={setLoanName} />
                <PhoneField label={t('phoneField.label','Phone Number')} value={loanPhone} onChange={setLoanPhone} />
                <Text style={pay.fieldLabel}>Expected Return Date</Text>
                <TouchableOpacity style={[pay.input, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                  onPress={() => setShowLoanCal(true)} activeOpacity={0.8}>
                  <Text style={{ fontSize: 14, color: loanDueDate ? '#0f172a' : '#94a3b8' }}>{loanDueDate || 'Select date'}</Text>
                  <MaterialIcons name="calendar-today" size={18} color="#94a3b8" />
                </TouchableOpacity>
              </View>
            )}

            {/* Split */}
            <Text style={pay.fieldLabel}>Split Bill (Optional)</Text>
            <View style={pay.splitRow}>
              {[2, 3, 4].map(n => (
                <TouchableOpacity key={n} style={[pay.splitBtn, splitCount === n && pay.splitBtnActive]}
                  onPress={() => setSplitCount(splitCount === n ? null : n)}>
                  <Text style={[pay.splitLbl, splitCount === n && pay.splitLblActive]}>{n} ways</Text>
                </TouchableOpacity>
              ))}
            </View>
            {splitCount && (
              <View style={{ marginTop: 10, gap: 8 }}>
                {splitParts.map((sp, i) => (
                  <View key={i} style={pay.splitPart}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={pay.splitPartLbl}>Part {i + 1}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', paddingHorizontal: 8, width: 140 }}>
                        <TextInput style={{ flex: 1, paddingVertical: 6, fontSize: 14, fontWeight: '700', color: '#0f172a', textAlign: 'right' }}
                          keyboardType="numeric" value={sp.amount}
                          onChangeText={v => { const c = [...splitParts]; c[i].amount = v; setSplitParts(c); }} />
                        <Text style={{ fontSize: 12, color: '#94a3b8', marginLeft: 4 }}>so'm</Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 6 }}>
                      {['Cash','Card','QR Code','Loan'].map(m => (
                        <TouchableOpacity key={m} style={[pay.splitM, sp.method === m && pay.splitMActive]}
                          onPress={() => { const c = [...splitParts]; c[i].method = m; setSplitParts(c); }}>
                          <Text style={[pay.splitMTxt, sp.method === m && pay.splitMTxtActive]}>{m}</Text>
                        </TouchableOpacity>
                      ))}
                      <View style={{ flex: 1 }} />
                      <TouchableOpacity style={[pay.splitCheck, sp.confirmed && pay.splitCheckOk]}
                        onPress={() => { const c = [...splitParts]; c[i].confirmed = !c[i].confirmed; setSplitParts(c); }}>
                        <View style={[pay.splitCheckBox, sp.confirmed && { backgroundColor: '#16a34a', borderColor: '#16a34a' }]}>
                          {sp.confirmed && <MaterialIcons name="check" size={10} color="#fff" />}
                        </View>
                        <Text style={{ fontSize: 11, fontWeight: '600', color: '#0f172a' }}>Paid</Text>
                      </TouchableOpacity>
                    </View>
                    {/* Inline loan fields for this part */}
                    {sp.method === 'Loan' && (
                      <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: '#fde68a', paddingTop: 8, gap: 6 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: '#fffbeb', borderRadius: 8, padding: 8 }}>
                          <MaterialIcons name="info-outline" size={14} color="#d97706" style={{ marginTop: 1 }} />
                          <Text style={{ fontSize: 11, color: '#92400e', fontWeight: '600', flex: 1 }}>Debt tracked until customer returns.</Text>
                        </View>
                        <TextInput
                          style={{ backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', paddingHorizontal: 10, paddingVertical: 8, fontSize: 12, color: '#0f172a' }}
                          placeholder="Customer name *"
                          placeholderTextColor="#94a3b8"
                          value={sp.loanName}
                          onChangeText={v => { const c = [...splitParts]; c[i].loanName = v; setSplitParts(c); }}
                        />
                        <View style={{ backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', flexDirection: 'row', alignItems: 'center', padding: 0, overflow: 'hidden' }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 6, backgroundColor: '#F1F5F9', borderRightWidth: 1, borderRightColor: '#E2E8F0', gap: 4 }}>
                            <Text style={{ fontSize: 14 }}>🇺🇿</Text>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: '#374151' }}>+998</Text>
                          </View>
                          <TextInput
                            style={{ flex: 1, paddingHorizontal: 10, paddingVertical: 8, fontSize: 12, color: '#0f172a' }}
                            placeholder={t('placeholders.phoneLocal', '90 123 45 67')}
                            placeholderTextColor="#94a3b8"
                            keyboardType="phone-pad"
                            value={(() => {
                              const digits = (sp.loanPhone || '').replace(/\D/g, '');
                              const local = digits.startsWith('998') ? digits.slice(3) : digits;
                              const d = local.slice(0, 9);
                              let out = '';
                              if (d.length > 0) out += d.slice(0, 2);
                              if (d.length > 2) out += ' ' + d.slice(2, 5);
                              if (d.length > 5) out += ' ' + d.slice(5, 7);
                              if (d.length > 7) out += ' ' + d.slice(7, 9);
                              return out;
                            })()}
                            onChangeText={v => {
                              const digits = v.replace(/\D/g, '');
                              const local = digits.startsWith('998') ? digits.slice(3) : digits;
                              const d = local.slice(0, 9);
                              let out = '+998';
                              if (d.length > 0) out += ' ' + d.slice(0, 2);
                              if (d.length > 2) out += ' ' + d.slice(2, 5);
                              if (d.length > 5) out += ' ' + d.slice(5, 7);
                              if (d.length > 7) out += ' ' + d.slice(7, 9);
                              const c = [...splitParts];
                              c[i].loanPhone = out;
                              setSplitParts(c);
                            }}
                            maxLength={13}
                          />
                        </View>
                        <TouchableOpacity
                          onPress={() => { const c = [...splitParts]; c[i]._showCal = true; setSplitParts(c); }}
                          style={{ backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}
                        >
                          <MaterialIcons name="calendar-today" size={14} color="#64748b" />
                          <Text style={{ fontSize: 12, color: sp.loanDueDate ? '#0f172a' : '#94a3b8' }}>
                            {sp.loanDueDate || 'Expected return date *'}
                          </Text>
                        </TouchableOpacity>
                        {sp._showCal && (
                          <LoanDatePickerSheet
                            current={sp.loanDueDate}
                            onSelect={d => { const c = [...splitParts]; c[i].loanDueDate = d; c[i]._showCal = false; setSplitParts(c); }}
                            onClose={() => { const c = [...splitParts]; c[i]._showCal = false; setSplitParts(c); }}
                          />
                        )}
                      </View>
                    )}
                  </View>
                ))}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 }}>
                  <Text style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase' }}>Split Validation</Text>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: splitTotal === total ? '#16a34a' : '#dc2626' }}>
                    {money(splitTotal)} / {money(total)}
                  </Text>
                </View>
              </View>
            )}

            <View style={{ height: 12 }} />
          </ScrollView>

          {/* Confirm button */}
          <TouchableOpacity style={[pay.confirmBtn, (!canPay || paying) && pay.confirmBtnDisabled]}
            onPress={confirmPay} disabled={!canPay || paying}>
            {paying ? <ActivityIndicator color="#fff" /> : (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <MaterialIcons name="check" size={18} color="#fff" style={{ marginRight: 6 }} />
                <Text style={pay.confirmBtnText}>Confirm Payment  •  {money(total)}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={pay.cancelBtn} onPress={onClose}>
            <Text style={pay.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Loan calendar modal */}
      <Modal visible={showLoanCal} transparent animationType="slide" onRequestClose={() => setShowLoanCal(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} onPress={() => setShowLoanCal(false)} />
        <LoanDatePickerSheet
          current={loanDueDate}
          onSelect={(ds) => { setLoanDueDate(ds); setShowLoanCal(false); }}
          onClose={() => setShowLoanCal(false)}
        />
      </Modal>

      {/* Reason picker modal */}
      <Modal visible={showReasons} transparent animationType="slide" onRequestClose={() => setShowReasons(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} onPress={() => setShowReasons(false)} />
        <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#0f172a', marginBottom: 14 }}>Select Reason</Text>
          {DISC_REASONS.map(r => (
            <TouchableOpacity key={r} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}
              onPress={() => { setDiscReason(r); setShowReasons(false); }}>
              <Text style={{ fontSize: 14, color: discReason === r ? colors.admin : '#0f172a', fontWeight: discReason === r ? '700' : '400' }}>{r}</Text>
              {discReason === r && <MaterialIcons name="check" size={18} color={colors.admin} />}
            </TouchableOpacity>
          ))}
        </View>
      </Modal>
    </Modal>
  );
}
const pay = StyleSheet.create({
  overlay:          { flex: 1, justifyContent: 'flex-end' },
  bg:               { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet:            { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36, maxHeight: '92%' },
  handle:           { width: 40, height: 4, borderRadius: 2, backgroundColor: '#e2e8f0', alignSelf: 'center', marginBottom: 16 },
  title:            { fontSize: 20, fontWeight: '800', color: '#0f172a', marginBottom: 2 },
  orderRef:         { fontSize: 12, color: '#64748b', marginBottom: 12 },
  lineRow:          { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  lineLabel:        { fontSize: 14, color: '#64748b' },
  lineVal:          { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  totalDivider:     { borderTopWidth: 1, borderTopColor: '#f1f5f9', marginTop: 8, paddingTop: 10, marginBottom: 10 },
  totalLabel:       { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  totalVal:         { fontSize: 18, fontWeight: '800', color: colors.admin },
  fieldLabel:       { fontSize: 11, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.7, marginTop: 10, marginBottom: 6 },
  input:            { backgroundColor: '#f8fafc', borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', padding: 12, fontSize: 14, color: '#0f172a' },
  discRow:          { flexDirection: 'row', gap: 8, marginBottom: 8 },
  discToggle:       { flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: '#f1f5f9', alignItems: 'center' },
  discToggleActive: { backgroundColor: colors.admin },
  discToggleTxt:    { fontSize: 12, fontWeight: '600', color: '#64748b' },
  discToggleTxtActive: { color: '#fff' },
  reasonPicker:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, marginBottom: 6 },
  reasonTxt:        { fontSize: 13, color: '#0f172a' },
  methodRow:        { flexDirection: 'row', gap: 7, marginBottom: 8, flexWrap: 'nowrap' },
  methodPill:       { flex: 1, paddingVertical: 9, borderRadius: 10, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center', gap: 3 },
  methodPillActive: { backgroundColor: '#eff6ff', borderColor: colors.admin },
  methodText:       { fontSize: 11, fontWeight: '600', color: '#64748b' },
  methodTextActive: { color: colors.admin },
  changeBox:        { marginTop: 8, backgroundColor: '#f0fdf4', borderRadius: 10, padding: 12, alignItems: 'center' },
  changeLbl:        { fontSize: 11, color: '#16a34a' },
  changeAmt:        { fontSize: 26, fontWeight: '800', color: '#16a34a', marginTop: 2 },
  checkRow:         { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 10, borderWidth: 2, borderColor: '#e2e8f0', marginBottom: 8 },
  checkRowOk:       { borderColor: '#16a34a', backgroundColor: '#f0fdf4' },
  checkbox:         { width: 20, height: 20, borderRadius: 4, borderWidth: 2, borderColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' },
  checkboxOk:       { backgroundColor: '#16a34a', borderColor: '#16a34a' },
  checkLbl:         { flex: 1, fontSize: 13, color: '#0f172a' },
  qrBox:            { borderWidth: 2, borderStyle: 'dashed', borderColor: '#e2e8f0', borderRadius: 10, height: 100, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  qrLbl:            { fontSize: 12, color: '#94a3b8', marginTop: 6 },
  loanNotice:       { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: '#fffbeb', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#fde68a' },
  loanNoticeTxt:    { flex: 1, fontSize: 12, color: '#92400e', lineHeight: 17 },
  splitRow:         { flexDirection: 'row', gap: 8, marginBottom: 8 },
  splitBtn:         { flex: 1, paddingVertical: 9, borderRadius: 10, backgroundColor: '#f1f5f9', alignItems: 'center' },
  splitBtnActive:   { backgroundColor: colors.admin },
  splitLbl:         { fontSize: 12, fontWeight: '600', color: '#64748b' },
  splitLblActive:   { color: '#fff' },
  splitPart:        { backgroundColor: '#f8fafc', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  splitPartLbl:     { fontSize: 12, fontWeight: '700', color: '#64748b', textTransform: 'uppercase' },
  splitM:           { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0' },
  splitMActive:     { backgroundColor: '#eff6ff', borderColor: colors.admin },
  splitMTxt:        { fontSize: 11, color: '#64748b', fontWeight: '600' },
  splitMTxtActive:  { color: colors.admin },
  splitCheck:       { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0' },
  splitCheckOk:     { borderColor: '#16a34a', backgroundColor: '#f0fdf4' },
  splitCheckBox:    { width: 15, height: 15, borderRadius: 3, borderWidth: 1.5, borderColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' },
  confirmBtn:       { backgroundColor: '#0f172a', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 14, marginBottom: 10 },
  confirmBtnDisabled: { backgroundColor: '#94a3b8' },
  confirmBtnText:   { color: '#fff', fontWeight: '800', fontSize: 15 },
  cancelBtn:        { alignItems: 'center', paddingVertical: 10 },
  cancelText:       { color: '#94a3b8', fontWeight: '600' },
});

// ─── ORDER DETAIL SHEET ───────────────────────────────────────────────────────
function OrderDetailSheet({ order, onClose, onRefresh, onEdit, onCancel }) {
  const { t } = useTranslation();
  const [detail,    setDetail]    = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [advancing, setAdvancing] = useState(false);
  const [payVisible,setPayVisible]= useState(false);
  const [cancelling,setCancelling]= useState(false);

  useEffect(() => {
    if (!order) return;
    setLoading(true);
    setDetail(null);
    ordersAPI.getById(order.id)
      .then(r => setDetail(r.data))
      .catch(() => setDetail(order))
      .finally(() => setLoading(false));
  }, [order?.id]);

  if (!order) return null;
  const current    = detail || order;
  const items      = current.items || [];
  const waiter     = current.waitress_name || current.waiter_name || 'Staff';
  const tableLabel = current.table_name || (current.table_number ? `Table ${current.table_number}` : 'Walk-in');
  const nextStatus = NEXT_STATUS[current.status];
  const canCancel  = ['pending', 'sent_to_kitchen', 'preparing'].includes(current.status);
  const isPaid     = current.status === 'paid';
  const guests     = current.guests || current.guest_count || 0;
  const notes      = current.notes || current.special_instructions || '';

  // Status timeline steps
  const STEPS = ['pending', 'sent_to_kitchen', 'preparing', 'ready', 'served', 'paid'];
  const SHORT = { pending: 'Pending', sent_to_kitchen: 'Kitchen', preparing: 'Prep', ready: 'Ready', served: 'Served', paid: 'Paid' };
  const currentStepIdx = STEPS.indexOf(current.status);

  const subtotal = items.reduce((s, i) => s + (Number(i.unit_price || i.price || 0) * Number(i.quantity || 1)), 0);

  async function advance() {
    if (!nextStatus) return;
    if (nextStatus === 'paid') { setPayVisible(true); return; }
    setAdvancing(true);
    try {
      await ordersAPI.updateStatus(order.id, nextStatus);
      const r = await ordersAPI.getById(order.id);
      setDetail(r.data);
      onRefresh();
    } catch (e) { Alert.alert(t('alerts.error','Error'), e.response?.data?.error || e.message); }
    setAdvancing(false);
  }

  async function cancel() {
    onCancel(order);
  }


  return (
    <Modal visible animationType="slide" transparent statusBarTranslucent>
      <View style={det.overlay}>
        <TouchableOpacity style={det.bg} activeOpacity={1} onPress={onClose} />
        <View style={det.sheet}>
          <View style={det.handle} />

          {/* ── Header: order ID + status ── */}
          <View style={det.header}>
            <View style={{ flex: 1 }}>
              <Text style={det.orderNum}>{shortId(order)}</Text>
              <Text style={det.orderTime}>
                {timeOnly(current.created_at)}  {'\u00b7'}  {timeAgo(current.created_at, t)}
              </Text>
            </View>
            <StatusBadge status={current.status} size="lg" />
          </View>

          {/* ── Key info strip: Table | Waitress | Guests | Payment ── */}
          <View style={det.infoStrip}>
            <View style={det.infoCell}>
              <Text style={det.infoCellLbl}>{t('admin.tables.tableName')}</Text>
              <Text style={det.infoCellVal}>{tableLabel}</Text>
            </View>
            <View style={det.infoDivider} />
            <View style={det.infoCell}>
              <Text style={det.infoCellLbl}>{t('admin.tables.waiter')}</Text>
              <Text style={det.infoCellVal} numberOfLines={1}>{waiter}</Text>
            </View>
            <View style={det.infoDivider} />
            <View style={det.infoCell}>
              <Text style={det.infoCellLbl}>{t('admin.newOrder.guests')}</Text>
              <Text style={det.infoCellVal}>{guests > 0 ? guests : '—'}</Text>
            </View>
            {isPaid && current.payment_method ? (
              <>
                <View style={det.infoDivider} />
                <View style={det.infoCell}>
                  <Text style={det.infoCellLbl}>{t('cashier.orders.paymentMethod')}</Text>
                  <Text style={det.infoCellVal}>
                    {current.payment_method.charAt(0).toUpperCase() + current.payment_method.slice(1)}
                  </Text>
                </View>
              </>
            ) : null}
          </View>

          {/* ── Status timeline ── */}
          <View style={det.timeline}>
            {STEPS.map((step, idx) => {
              const SM_ = getStatusMeta(t);
              const meta      = SM_[step] || SM_.pending;
              const isReached = idx <= currentStepIdx;
              const isCurrent = idx === currentStepIdx;
              return (
                <React.Fragment key={step}>
                  <View style={det.tlStep}>
                    <View style={[
                      det.tlDot,
                      isReached && { backgroundColor: meta.dot },
                      isCurrent && det.tlDotCurrent,
                    ]}>
                      {isCurrent && <View style={[det.tlDotInner, { backgroundColor: meta.dot }]} />}
                    </View>
                    <Text style={[det.tlLabel, isCurrent && { color: meta.text, fontWeight: '800' }]}>
                      {SHORT[step]}
                    </Text>
                  </View>
                  {idx < STEPS.length - 1 && (
                    <View style={[det.tlLine, idx < currentStepIdx && { backgroundColor: '#22c55e' }]} />
                  )}
                </React.Fragment>
              );
            })}
          </View>

          {/* ── Cancellation Reason banner ── */}
          {current.status === 'cancelled' && (
            <View style={det.cancelBanner}>
              <MaterialIcons name="block" size={18} color="#dc2626" />
              <View style={{ flex: 1 }}>
                <Text style={det.cancelBannerTitle}>{t('admin.orders.cancelOrder')}</Text>
                <Text style={det.cancelBannerReason}>{current.cancellation_reason || 'No reason specified'}</Text>
              </View>
            </View>
          )}

          {loading ? (
            <View style={det.loadWrap}><ActivityIndicator color={colors.admin} size="large" /></View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>

              {/* ── Items ── */}
              <Text style={det.sectionLabel}>{t('cashier.orders.orderItems')}</Text>
              {items.length === 0 ? (
                <Text style={det.emptyItems}>No item details available</Text>
              ) : items.map((item, idx) => {
                const unitPrice = Number(item.unit_price || item.price || 0);
                const qty       = Number(item.quantity || 1);
                const lineTotal = unitPrice * qty;
                return (
                  <View key={idx} style={det.itemRow}>
                    <View style={det.itemQtyBadge}>
                      <Text style={det.itemQtyText}>{qty}×</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={det.itemName}>{item.item_name || item.name}</Text>
                      {item.notes ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                          <MaterialIcons name="assignment" size={14} color="#64748b" style={{ marginRight: 4 }} />
                          <Text style={det.itemNote}>{item.notes}</Text>
                        </View>
                      ) : null}
                      <Text style={det.itemUnit}>{money(unitPrice)} {t('common.each')}</Text>
                    </View>
                    <Text style={det.itemPrice}>{money(lineTotal)}</Text>
                  </View>
                );
              })}

              {/* ── Order notes ── */}
              {!!notes && (
                <>
                  <Text style={det.sectionLabel}>{t('common.notes')}</Text>
                  <View style={det.notesBox}>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                      <MaterialIcons name="assignment" size={16} color="#475569" style={{ marginRight: 8, marginTop: 2 }} />
                      <Text style={det.notesTxt}>{notes}</Text>
                    </View>
                  </View>
                </>
              )}

              {/* ── Totals ── */}
              <View style={det.totalsBox}>
                {subtotal > 0 && Math.round(subtotal) !== Math.round(Number(current.total_amount)) && (
                  <View style={det.totalRow}>
                    <Text style={det.totalLabel}>{t('common.subtotal')}</Text>
                    <Text style={det.totalVal}>{money(subtotal)}</Text>
                  </View>
                )}
                {Number(current.tax_amount) > 0 && (
                  <View style={det.totalRow}>
                    <Text style={det.totalLabel}>Tax</Text>
                    <Text style={det.totalVal}>{money(current.tax_amount)}</Text>
                  </View>
                )}
                {Number(current.discount_amount) > 0 && (
                  <View style={det.totalRow}>
                    <Text style={[det.totalLabel, { color: '#dc2626' }]}>{t('common.discount')}</Text>
                    <Text style={[det.totalVal, { color: '#dc2626' }]}>− {money(current.discount_amount)}</Text>
                  </View>
                )}
                <View style={[det.totalRow, det.grandRow]}>
                  <Text style={det.grandLabel}>{t('common.total')}</Text>
                  <Text style={det.grandVal}>{money(current.total_amount)}</Text>
                </View>
                {isPaid && (
                  <>
                    {/* Split payment breakdown */}
                    {current.payment_method === 'split' && Array.isArray(current.split_payments) && current.split_payments.length > 0 ? (
                      <View style={{ marginTop: 8, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden' }}>
                        <View style={{ backgroundColor: '#f8fafc', paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 6, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' }}>
                          <MaterialIcons name="call-split" size={14} color="#3b82f6" />
                          <Text style={{ fontSize: 11, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>Split Payment Breakdown</Text>
                        </View>
                        {current.split_payments.map((sp, i) => {
                          const methodLabel = { cash: 'Cash', card: 'Card', qr_code: 'QR Code', loan: 'Loan' }[sp.method] || sp.method;
                          const methodColor = { cash: '#16a34a', card: '#2563eb', qr_code: '#7c3aed', loan: '#d97706' }[sp.method] || '#64748b';
                          const methodBg = { cash: '#dcfce7', card: '#dbeafe', qr_code: '#ede9fe', loan: '#fef3c7' }[sp.method] || '#f1f5f9';
                          return (
                            <View key={i} style={{ paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: i < current.split_payments.length - 1 ? 1 : 0, borderBottomColor: '#f1f5f9' }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#0f172a' }}>Part {i + 1}</Text>
                                  <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: methodBg }}>
                                    <Text style={{ fontSize: 11, fontWeight: '700', color: methodColor }}>{methodLabel}</Text>
                                  </View>
                                </View>
                                <Text style={{ fontSize: 13, fontWeight: '800', color: '#0f172a' }}>{money(sp.amount || 0)}</Text>
                              </View>
                              {sp.method === 'loan' && (sp.loan_customer_name) && (
                                <View style={{ marginTop: 6, paddingLeft: 4, gap: 4 }}>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <MaterialIcons name="person-outline" size={13} color="#92400e" />
                                    <Text style={{ fontSize: 11, color: '#92400e', fontWeight: '600' }}>{sp.loan_customer_name}</Text>
                                  </View>
                                  {sp.loan_customer_phone ? (
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                      <MaterialIcons name="phone" size={13} color="#92400e" />
                                      <Text style={{ fontSize: 11, color: '#92400e' }}>{sp.loan_customer_phone}</Text>
                                    </View>
                                  ) : null}
                                  {sp.loan_due_date ? (
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                      <MaterialIcons name="event" size={13} color="#92400e" />
                                      <Text style={{ fontSize: 11, color: '#92400e' }}>Due: {sp.loan_due_date}</Text>
                                    </View>
                                  ) : null}
                                </View>
                              )}
                            </View>
                          );
                        })}
                      </View>
                    ) : (
                      <>
                        <View style={det.paidRow}>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <MaterialIcons name="check" size={16} color="#16A34A" style={{ marginRight: 6 }} />
                            <Text style={det.paidRowTxt}>
                              Paid {current.payment_method
                                ? `via ${current.payment_method.charAt(0).toUpperCase() + current.payment_method.slice(1)}`
                                : ''}
                            </Text>
                          </View>
                          {current.paid_at
                            ? <Text style={det.paidRowTxt}>{timeOnly(current.paid_at)}</Text>
                            : null}
                        </View>

                        {/* ── Loan repayment status card (no record fallback) ── */}
                        {current.payment_method === 'loan' && !current.loanDetails && (
                          <View style={{ marginTop: 8, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: '#fecaca' }}>
                            <View style={{ backgroundColor: '#fef2f2', paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <MaterialIcons name="error-outline" size={18} color="#dc2626" />
                              <Text style={{ fontSize: 13, fontWeight: '700', color: '#dc2626', flex: 1 }}>Debt not yet repaid</Text>
                            </View>
                          </View>
                        )}

                        {/* ── Loan repayment status card ── */}
                        {current.payment_method === 'loan' && current.loanDetails && (() => {
                          const ld = current.loanDetails;
                          const loanPaid = ld.status === 'paid';
                          const isOverdue = !loanPaid && ld.due_date && new Date(ld.due_date) < new Date();
                          return (
                            <View style={{ marginTop: 8, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: loanPaid ? '#bbf7d0' : '#fecaca' }}>
                              {/* Status row */}
                              <View style={{ backgroundColor: loanPaid ? '#f0fdf4' : '#fef2f2', paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <MaterialIcons name={loanPaid ? 'check-circle' : 'error-outline'} size={18} color={loanPaid ? '#16a34a' : '#dc2626'} />
                                <Text style={{ fontSize: 14, fontWeight: '700', color: loanPaid ? '#15803d' : '#dc2626', flex: 1 }}>
                                  {loanPaid ? 'Debt repaid' : isOverdue ? 'Debt not yet repaid — OVERDUE' : 'Debt not yet repaid'}
                                </Text>
                                {loanPaid && ld.paid_at ? (
                                  <Text style={{ fontSize: 11, color: '#16a34a' }}>{timeOnly(ld.paid_at)}</Text>
                                ) : null}
                              </View>
                              {/* Borrower details */}
                              <View style={{ backgroundColor: '#fffbeb', paddingHorizontal: 12, paddingVertical: 10, gap: 6 }}>
                                {ld.customer_name ? (
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                    <MaterialIcons name="person-outline" size={14} color="#92400e" />
                                    <Text style={{ fontSize: 13, color: '#92400e', fontWeight: '600' }}>{ld.customer_name}</Text>
                                  </View>
                                ) : null}
                                {ld.customer_phone ? (
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                    <MaterialIcons name="phone" size={14} color="#92400e" />
                                    <Text style={{ fontSize: 13, color: '#92400e' }}>{ld.customer_phone}</Text>
                                  </View>
                                ) : null}
                                {ld.due_date ? (
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                    <MaterialIcons name="event" size={14} color={isOverdue ? '#dc2626' : '#92400e'} />
                                    <Text style={{ fontSize: 13, color: isOverdue ? '#dc2626' : '#92400e' }}>
                                      {'Due: ' + ld.due_date.split('T')[0]}
                                    </Text>
                                  </View>
                                ) : null}
                                {ld.amount ? (
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                    <MaterialIcons name="account-balance-wallet" size={14} color="#92400e" />
                                    <Text style={{ fontSize: 13, color: '#92400e', fontWeight: '600' }}>{money(ld.amount)}</Text>
                                  </View>
                                ) : null}
                                {ld.notes ? (
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#fde68a' }}>
                                    <MaterialIcons name="notes" size={14} color="#92400e" />
                                    <Text style={{ fontSize: 12, color: '#92400e', fontStyle: 'italic', flex: 1 }}>{ld.notes}</Text>
                                  </View>
                                ) : null}
                              </View>
                            </View>
                          );
                        })()}
                      </>
                    )}
                    {current.collected_by_name && (
                      <View style={[det.paidRow, { marginTop: 4 }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <MaterialIcons name="person-outline" size={14} color="#0f766e" style={{ marginRight: 5 }} />
                          <Text style={[det.paidRowTxt, { color: '#0f766e' }]}>Collected by {current.collected_by_name}</Text>
                        </View>
                      </View>
                    )}
                  </>
                )}
              </View>

              <View style={{ height: 24 }} />
            </ScrollView>
          )}

          {/* ── Action buttons ── */}
          {!loading && (
            <View style={det.actions}>
              <TouchableOpacity style={det.closeBtn} onPress={onClose}>
                <Text style={det.closeBtnTxt}>{t('common.close')}</Text>
              </TouchableOpacity>

              {/* Edit — hide for paid & cancelled */}
              {current.status !== 'cancelled' && current.status !== 'paid' && (
                <TouchableOpacity style={det.editBtn} onPress={() => { onClose(); setTimeout(() => onEdit && onEdit(current), 300); }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                    <MaterialIcons name="edit" size={16} color="#2563EB" style={{ marginRight: 6 }} />
                    <Text style={det.editBtnTxt}>{t('common.edit')}</Text>
                  </View>
                </TouchableOpacity>
              )}

              {/* Cancel order */}
              {canCancel && (
                <TouchableOpacity style={det.cancelOrderBtn} onPress={cancel} disabled={cancelling}>
                  {cancelling
                    ? <ActivityIndicator color="#dc2626" size="small" />
                    : (
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                        <MaterialIcons name="block" size={16} color="#dc2626" style={{ marginRight: 6 }} />
                        <Text style={det.cancelOrderTxt}>{t('common.cancel')}</Text>
                      </View>
                    )}
                </TouchableOpacity>
              )}

              {/* Advance / Pay */}
              {nextStatus && (
                <TouchableOpacity
                  style={[det.advanceBtn, nextStatus === 'paid' && det.payBtn]}
                  onPress={advance}
                  disabled={advancing}
                >
                  {advancing
                    ? <ActivityIndicator color="#fff" />
                    : (
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                        {nextStatus === 'paid' ? (
                          <>
                            <MaterialIcons name="credit-card" size={16} color="#fff" style={{ marginRight: 6 }} />
                            <Text style={det.advanceBtnTxt}>Collect Payment</Text>
                          </>
                        ) : (
                          <Text style={det.advanceBtnTxt}>→ {getStatusMeta(t)[nextStatus]?.label || nextStatus}</Text>
                        )}
                      </View>
                    )}
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </View>

      <PaymentSheet
        visible={payVisible}
        order={current}
        onClose={() => setPayVisible(false)}
        onPaid={() => { setPayVisible(false); onRefresh(); onClose(); }}
      />
    </Modal>
  );
}
const det = StyleSheet.create({
  overlay:  { flex: 1, justifyContent: 'flex-end' },
  bg:       { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet:    { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, height: '84%', paddingBottom: 16 },
  handle:   { width: 40, height: 4, borderRadius: 2, backgroundColor: '#e2e8f0', alignSelf: 'center', marginTop: 10, marginBottom: 12 },

  // Header
  header:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  orderNum:  { fontSize: 22, fontWeight: '900', color: '#0f172a' },
  orderTime: { fontSize: 12, color: '#94a3b8', marginTop: 3 },

  // Info strip
  infoStrip:    { flexDirection: 'row', backgroundColor: '#f8fafc', borderBottomWidth: 1, borderBottomColor: '#f1f5f9', paddingVertical: 14, paddingHorizontal: 8 },
  infoCell:     { flex: 1, alignItems: 'center' },
  infoDivider:  { width: 1, backgroundColor: '#e2e8f0', marginVertical: 2 },
  infoCellLbl:  { fontSize: 10, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  infoCellVal:  { fontSize: 13, fontWeight: '800', color: '#0f172a' },

  // Status timeline
  timeline:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  tlStep:       { alignItems: 'center', gap: 5 },
  tlDot:        { width: 14, height: 14, borderRadius: 7, backgroundColor: '#e2e8f0', justifyContent: 'center', alignItems: 'center' },
  tlDotCurrent: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff', borderWidth: 2.5, borderColor: '#64748b' },
  tlDotInner:   { width: 9, height: 9, borderRadius: 4.5 },
  tlLabel:      { fontSize: 9, fontWeight: '600', color: '#cbd5e1', textAlign: 'center', maxWidth: 42 },
  tlLine:       { flex: 1, height: 2, backgroundColor: '#e2e8f0', marginBottom: 14, marginHorizontal: 2 },

  loadWrap:     { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 48 },

  // Section label
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.7, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 8 },
  emptyItems:   { textAlign: 'center', color: '#94a3b8', padding: 24, fontSize: 14 },

  // Item rows
  itemRow:      { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 12, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#f8fafc', gap: 10 },
  itemQtyBadge: { backgroundColor: '#eff6ff', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, minWidth: 38, alignItems: 'center' },
  itemQtyText:  { fontSize: 13, fontWeight: '800', color: colors.admin },
  itemName:     { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  itemNote:     { fontSize: 11, color: '#f59e0b', marginTop: 2 },
  itemUnit:     { fontSize: 11, color: '#94a3b8', marginTop: 1 },
  itemPrice:    { fontSize: 14, fontWeight: '700', color: '#0f172a', minWidth: 90, textAlign: 'right' },

  // Notes
  notesBox:  { marginHorizontal: 16, marginBottom: 4, backgroundColor: '#fffbeb', borderRadius: 10, padding: 13, borderLeftWidth: 3, borderLeftColor: '#f59e0b' },
  notesTxt:  { fontSize: 13, color: '#78350f', lineHeight: 20 },

  // Totals
  totalsBox:  { margin: 16, backgroundColor: '#f8fafc', borderRadius: 14, padding: 14 },
  totalRow:   { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  totalLabel: { fontSize: 13, color: '#64748b' },
  totalVal:   { fontSize: 13, fontWeight: '600', color: '#0f172a' },
  grandRow:   { borderTopWidth: 1, borderTopColor: '#e2e8f0', marginTop: 8, paddingTop: 10 },
  grandLabel: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  grandVal:   { fontSize: 19, fontWeight: '900', color: colors.admin },
  paidRow:    { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#e2e8f0' },
  paidRowTxt: { fontSize: 12, color: '#0f766e', fontWeight: '700' },

  // Action buttons
  actions:        { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 14, paddingTop: 12, gap: 8, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  closeBtn:       { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center', minHeight: 46, justifyContent: 'center' },
  closeBtnTxt:    { color: '#64748b', fontWeight: '600', fontSize: 13 },
  editBtn:        { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, backgroundColor: '#eff6ff', alignItems: 'center', minHeight: 46, justifyContent: 'center' },
  editBtnTxt:     { color: '#3b82f6', fontWeight: '700', fontSize: 13 },
  cancelOrderBtn: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, backgroundColor: '#fff0f0', alignItems: 'center', minHeight: 46, justifyContent: 'center' },
  cancelOrderTxt: { color: '#dc2626', fontWeight: '700', fontSize: 13 },
  cancelBanner:      { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginBottom: 8, padding: 12, backgroundColor: '#fef2f2', borderRadius: 12, borderWidth: 1, borderColor: '#fecaca' },
  cancelBannerTitle: { fontSize: 13, fontWeight: '800', color: '#dc2626' },
  cancelBannerReason:{ fontSize: 12, color: '#7f1d1d', marginTop: 2 },
  advanceBtn:     { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: colors.admin, alignItems: 'center', minHeight: 46, justifyContent: 'center' },
  payBtn:         { backgroundColor: '#0f172a' },
  advanceBtnTxt:  { color: '#fff', fontWeight: '800', fontSize: 13 },
});

// ─── EMPTY STATE ──────────────────────────────────────────────────────────────
function EmptyState({ tab }) {
  const { t } = useTranslation();
  const icon = tab === 'current' ? 'restaurant' : tab === 'paid' ? 'receipt-long' : 'block';
  const title = t('admin.orders.noOrdersFound');
  const hint = '';
  return (
    <View style={st.emptyWrap}>
      <MaterialIcons name={icon} size={48} color="#E5E7EB" />
      <Text style={st.emptyTitle}>{title}</Text>
      {hint ? <Text style={st.emptyHint}>{hint}</Text> : null}
    </View>
  );
}

// ─── MAIN SCREEN ──────────────────────────────────────────────────────────────
export default function AdminOrders({ navigation }) {
  const { t } = useTranslation();
  const [orders,      setOrders]      = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [tab,         setTab]         = useState('current');
  const [selected,    setSelected]    = useState(null);  // for detail sheet
  const [dialog,      setDialog]      = useState(null);

  // Edit / Delete state
  const [actionSheetOrder, setActionSheetOrder] = useState(null);
  const [deleteTarget,     setDeleteTarget]     = useState(null);
  const [editTarget,       setEditTarget]       = useState(null);
  const [cancelReasonTarget, setCancelReasonTarget] = useState(null);

  // Toasts
  const [toasts, setToasts] = useState([]);

  // Paid tab date range
  const [drPreset,     setDrPreset]     = useState('30 Days');
  const [drCustomFrom, setDrCustomFrom] = useState('');
  const [drCustomTo,   setDrCustomTo]   = useState('');

  // Cancelled orders
  const [cancelledOrders, setCancelledOrders] = useState([]);

  // Enable LayoutAnimation on Android
  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await ordersAPI.getAll();
      setOrders(res.data || []);
    } catch (_) {}
    // Fetch cancelled orders separately
    try {
      const cancelledRes = await ordersAPI.getAll({ status: 'cancelled', include_items: 'true' });
      setCancelledOrders(cancelledRes.data || []);
    } catch (_) {}
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const pollTimer = setInterval(load, 5000);
    return () => clearInterval(pollTimer);
  }, [load]);

  // ── Toast helper ──
  const showToast = useCallback((message, type = 'success') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // ── Delete handler ──
  const handleDelete = useCallback(async (deleteReason) => {
    if (!deleteTarget) return;
    const order = deleteTarget;
    try {
      if (order.status === 'paid') {
        await ordersAPI.delete(order.id, { reason: deleteReason });
      } else {
        await ordersAPI.cancel(order.id, deleteReason);
      }
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setOrders(prev => prev.filter(o => o.id !== order.id));
      showToast(`Order ${shortId(order)} deleted successfully`, 'success');
      setDeleteTarget(null);
    } catch (e) {
      showToast(e.response?.data?.error || 'Failed to delete order', 'error');
    }
  }, [deleteTarget, showToast]);

  // ── Cancel handler (with reason) ──
  const handleCancelWithReason = useCallback(async (reason) => {
    if (!cancelReasonTarget) return;
    const order = cancelReasonTarget;
    try {
      await ordersAPI.cancel(order.id, reason);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setOrders(prev => prev.filter(o => o.id !== order.id));
      showToast(`Order ${shortId(order)} cancelled`, 'success');
      setCancelReasonTarget(null);
      load(); // reload to refresh cancelled list
    } catch (e) {
      showToast(e.response?.data?.error || 'Failed to cancel order', 'error');
    }
  }, [cancelReasonTarget, showToast, load]);

  const currentOrders = orders.filter(o => ACTIVE_STATUSES.includes(o.status));
  const allPaidOrders = orders.filter(o => o.status === 'paid');
  const { from: drFrom, to: drTo } = getPresetRange(drPreset, drCustomFrom, drCustomTo);
  const paidOrders = allPaidOrders.filter(o => inDateRange(o.paid_at || o.updated_at || o.created_at, drFrom, drTo));
  const displayed  = tab === 'current' ? currentOrders : tab === 'paid' ? paidOrders : cancelledOrders;

  if (loading) {
    return <View style={st.center}><ActivityIndicator size="large" color={colors.admin} /></View>;
  }

  return (
    <View style={st.container}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />
      {/* ── Header ── */}
      <View style={st.header}>
        <Text style={st.headerTitle}>{t('admin.orders.title')}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={st.headerBadge}>
            <View style={[st.liveDot, { backgroundColor: '#22c55e' }]} />
            <Text style={st.liveText}>Live</Text>
          </View>
          <TouchableOpacity
            style={st.newOrderBtn}
            onPress={() => navigation.navigate('CashierWalkin')}
          >
            <MaterialIcons name="add" size={16} color="#fff" />
            <Text style={st.newOrderTxt}>{t('admin.orders.newOrder')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Tab Bar ── */}
      <View style={st.tabBar}>
        {[
          { id: 'current',   label: t('admin.orders.activeOrders'),    count: currentOrders.length },
          { id: 'paid',      label: t('admin.orders.paidOrders'),       count: paidOrders.length },
          { id: 'cancelled', label: t('admin.orders.cancelledOrders'),  count: cancelledOrders.length },
        ].map(tb => (
          <TouchableOpacity
            key={tb.id}
            style={[st.tabBtn, tab === tb.id && st.tabBtnActive]}
            onPress={() => setTab(tb.id)}
          >
            <Text
              style={[st.tabLabel, tab === tb.id && st.tabLabelActive]}
              numberOfLines={1}
              ellipsizeMode="tail"
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {tb.label}
            </Text>
            {tb.count > 0 && (
              <View style={[st.tabCount, tab === tb.id && st.tabCountActive]}>
                <Text style={[st.tabCountText, tab === tb.id && st.tabCountTextActive]}>{tb.count}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Current: status summary strip ── */}
      {tab === 'current' && currentOrders.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.summaryScroll} contentContainerStyle={st.summaryContent}>
          {['pending', 'sent_to_kitchen', 'preparing', 'ready', 'served', 'bill_requested'].map(s => {
            const cnt  = currentOrders.filter(o => o.status === s).length;
            if (cnt === 0) return null;
            const meta = getStatusMeta(t)[s];
            return (
              <View key={s} style={[st.summaryChip, { backgroundColor: meta.bg }]}>
                <View style={[st.summaryDot, { backgroundColor: meta.dot }]} />
                <Text style={[st.summaryLabel, { color: meta.text }]}>{meta.label}</Text>
                <Text style={[st.summaryCount, { color: meta.text }]}>{cnt}</Text>
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* ── Paid: date range picker ── */}
      {tab === 'paid' && (
        <PaidDatePicker
          preset={drPreset}     setPreset={setDrPreset}
          customFrom={drCustomFrom} setCustomFrom={setDrCustomFrom}
          customTo={drCustomTo}   setCustomTo={setDrCustomTo}
          filteredOrders={paidOrders}
        />
      )}

      {/* ── Order List ── */}
      <FlatList
        data={displayed}
        keyExtractor={o => o.id}
        contentContainerStyle={st.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.admin} />}
        ListEmptyComponent={<EmptyState tab={tab} />}
        renderItem={({ item: order }) => (
          <SwipeableOrderCard
            order={order}
            onPress={() => setSelected(order)}
            onEdit={() => setEditTarget(order)}
            onDelete={() => {
              if (order.status === 'paid') {
                setDeleteTarget(order);
              } else {
                setCancelReasonTarget(order);
              }
            }}
            onLongPress={() => setActionSheetOrder(order)}
            hideActions={order.status === 'paid' || order.status === 'cancelled'}
          />
        )}
      />

      {/* ── Detail Sheet ── */}
      {selected && (
        <OrderDetailSheet
          order={selected}
          onClose={() => setSelected(null)}
          onRefresh={load}
          onEdit={(ord) => { setSelected(null); setTimeout(() => setEditTarget(ord), 350); }}
          onCancel={(ord) => { setSelected(null); setTimeout(() => setCancelReasonTarget(ord), 350); }}
        />
      )}

      {/* ── Action Sheet (long-press) ── */}
      <ActionSheetModal
        order={actionSheetOrder}
        onClose={() => setActionSheetOrder(null)}
        onEdit={() => setEditTarget(actionSheetOrder)}
        onDelete={() => {
          if (actionSheetOrder?.status === 'paid') {
            setDeleteTarget(actionSheetOrder);
          } else {
            setCancelReasonTarget(actionSheetOrder);
          }
        }}
      />

      {/* ── Delete Confirm ── */}
      <DeleteConfirmModal
        order={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />

      {/* ── Cancel Reason Modal ── */}
      <CancelReasonModal
        order={cancelReasonTarget}
        onClose={() => setCancelReasonTarget(null)}
        onConfirm={handleCancelWithReason}
      />

      {/* ── Edit Modal ── */}
      {editTarget && (
        editTarget.status === 'paid'
          ? <EditPaidOrderModal
              order={editTarget}
              onClose={() => setEditTarget(null)}
              onSaved={load}
              showToast={showToast}
            />
          : <EditCurrentOrderModal
              order={editTarget}
              onClose={() => setEditTarget(null)}
              onSaved={load}
              showToast={showToast}
            />
      )}

      {/* ── Toast Rack ── */}
      <View style={st.toastRack} pointerEvents="none">
        {toasts.map(ts => (
          <ToastItem key={ts.id} toast={ts} onDone={() => dismissToast(ts.id)} />
        ))}
      </View>

      <ConfirmDialog dialog={dialog} onClose={() => setDialog(null)} />
    </View>
  );
}

// ─── SCREEN STYLES ────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  center:    { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: topInset + 12, paddingBottom: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  headerTitle:  { fontSize: 24, fontWeight: '900', color: '#0f172a' },
  headerBadge:  { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#dcfce7', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99 },
  newOrderBtn:  { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.admin, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99 },
  newOrderTxt:  { fontSize: 12, fontWeight: '700', color: '#fff' },
  liveDot:      { width: 7, height: 7, borderRadius: 3.5 },
  liveText:     { fontSize: 11, fontWeight: '700', color: '#15803d' },

  tabBar:           { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  tabBtn:           { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 13, paddingHorizontal: 4, borderBottomWidth: 3, borderBottomColor: 'transparent' },
  tabBtnActive:     { borderBottomColor: colors.admin },
  tabLabel:         { fontSize: 12, fontWeight: '600', color: '#64748b', flexShrink: 1 },
  tabLabelActive:   { color: colors.admin, fontWeight: '800' },
  tabCount:         { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 99, backgroundColor: '#f1f5f9', minWidth: 20, alignItems: 'center' },
  tabCountActive:   { backgroundColor: colors.admin + '22' },
  tabCountText:     { fontSize: 11, fontWeight: '700', color: '#64748b' },
  tabCountTextActive: { color: colors.admin },

  summaryScroll:  { maxHeight: 44, backgroundColor: '#fff' },
  summaryContent: { paddingHorizontal: 16, paddingVertical: 8, gap: 8, alignItems: 'center' },
  summaryChip:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99, gap: 5 },
  summaryDot:     { width: 6, height: 6, borderRadius: 3 },
  summaryLabel:   { fontSize: 11, fontWeight: '600' },
  summaryCount:   { fontSize: 11, fontWeight: '800' },

  list: { padding: 12, paddingBottom: 120 },

  emptyWrap:  { alignItems: 'center', paddingVertical: 72 },
  emptyIcon:  { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#334155', marginBottom: 6 },
  emptyHint:  { fontSize: 13, color: '#94a3b8' },

  toastRack: { position: 'absolute', top: topInset + 16, left: 16, right: 16, zIndex: 9999, alignItems: 'stretch' },
});

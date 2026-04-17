import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Modal, FlatList, ActivityIndicator, Animated, StatusBar,
} from 'react-native';
import ConfirmDialog from '../../components/ConfirmDialog';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useAuth } from '../../context/AuthContext';
import { ordersAPI, menuAPI, notificationsAPI, accountingAPI } from '../../api/client';
import { colors, spacing, radius, shadow, typography, topInset } from '../../utils/theme';

// ── Constants ──────────────────────────────────────────────────────────────────
const DISC_REASONS = ['Manager Approved', 'Loyalty Customer', 'Complaint Resolution', 'Other'];

const fmt = (n) =>
  Number(n || 0).toLocaleString('uz-UZ') + " so'm";

// Show daily order number: #1, #2 … reset each day
const fmtOrderNum = (order) => {
  if (order?.daily_number) return `#${order.daily_number}`;
  // Fallback: last 4 chars of UUID (only if daily_number not yet available)
  const id = String(order?.id || '');
  return id.length >= 4 ? `#${id.slice(-4)}` : `#${id}`;
};

const elapsed = (iso) => {
  const diff = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (diff < 1)  return 'just now';
  if (diff < 60) return `${diff}m ago`;
  return `${Math.floor(diff / 60)}h ${diff % 60}m ago`;
};

const timeStr = (d) => {
  const date = d ? new Date(d) : new Date();
  return `${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
};

const dateTimeStr = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getDate().toString().padStart(2,'0')}.${(d.getMonth()+1).toString().padStart(2,'0')}.${d.getFullYear()}  ${timeStr(d)}`;
};

// ── Small reusable pieces ─────────────────────────────────────────────────────
function Badge({ label, bg, text }) {
  return (
    <View style={[S.badge, { backgroundColor: bg }]}>
      <Text style={[S.badgeTxt, { color: text }]}>{label}</Text>
    </View>
  );
}

function StatCard({ label, value, sub, color, icon }) {
  return (
    <View style={[S.statCard, color && { borderTopWidth: 3, borderTopColor: color }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Text style={S.statLabel}>{label}</Text>
        {icon && (
          <View style={{ width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: color ? color + '1A' : '#F3F4F6' }}>
            <MaterialIcons name={icon} size={15} color={color || colors.neutralMid} />
          </View>
        )}
      </View>
      <Text style={[S.statVal, color && { color }]}>{value}</Text>
      {sub ? <Text style={S.statSub}>{sub}</Text> : null}
    </View>
  );
}

function SectionHeader({ title }) {
  return <Text style={S.sectionHeader}>{title}</Text>;
}

// ─── PhoneField with +998 country code ──────────────────────────────────────
function PhoneField({ label = 'PHONE NUMBER', value, onChange }) {
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
    <View style={{ marginBottom: 16 }}>
      <Text style={S.inputLabel}>{label.toUpperCase()}</Text>
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
    </View>
  );
}

// ── Bill Request Toast ────────────────────────────────────────────────────────
function BillToast({ message, visible }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-20)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(opacity,     { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(translateY,  { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(opacity,     { toValue: 0, duration: 250, useNativeDriver: true }),
        Animated.timing(translateY,  { toValue: -20, duration: 250, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  if (!message) return null;

  return (
    <Animated.View style={[S.billToast, { opacity, transform: [{ translateY }] }]}>
      <MaterialIcons name="notifications-active" size={18} color="#fff" style={{ marginRight: 8 }} />
      <Text style={S.billToastTxt}>{message}</Text>
    </Animated.View>
  );
}

// ── Loan Due-Date Picker (single-date, bottom sheet) ──────────────────────────
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

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y-1); }
    else setViewMonth(m => m-1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y+1); }
    else setViewMonth(m => m+1);
  };

  const firstDow  = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;
  const daysInMon = new Date(viewYear, viewMonth+1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMon; d++) cells.push(fmtDs(new Date(viewYear, viewMonth, d)));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i+7));

  return (
    <View style={LD.sheet}>
      <View style={LD.header}>
        <MaterialIcons name="calendar-today" size={18} color="#0891B2" />
        <Text style={LD.title}>Select Due Date</Text>
        <TouchableOpacity onPress={onClose} style={{ marginLeft: 'auto' }}>
          <MaterialIcons name="close" size={20} color={colors.neutralMid} />
        </TouchableOpacity>
      </View>
      <View style={LD.navRow}>
        <TouchableOpacity onPress={prevMonth} style={LD.arrow}><Text style={LD.arrowTxt}>‹</Text></TouchableOpacity>
        <Text style={LD.monthTitle}>{LOAN_MONTH_NAMES[viewMonth]} {viewYear}</Text>
        <TouchableOpacity onPress={nextMonth} style={LD.arrow}><Text style={LD.arrowTxt}>›</Text></TouchableOpacity>
      </View>
      <View style={{ flexDirection: 'row', marginBottom: 4 }}>
        {LOAN_DAY_HDRS.map(d => (
          <View key={d} style={{ flex: 1, alignItems: 'center', paddingVertical: 4 }}>
            <Text style={LD.dayHdr}>{d}</Text>
          </View>
        ))}
      </View>
      {weeks.map((week, wi) => (
        <View key={wi} style={{ flexDirection: 'row' }}>
          {week.map((ds, di) => {
            if (!ds) return <View key={`e${di}`} style={{ flex:1, aspectRatio:1 }}/>;
            const isSelected = ds === current;
            const isPast     = ds < todayStr;
            const isToday    = ds === todayStr;
            const bg = isSelected ? '#0891B2' : 'transparent';
            const txtColor = isSelected ? '#fff' : isPast ? colors.border : isToday ? '#0891B2' : colors.textDark;
            return (
              <TouchableOpacity
                key={ds}
                disabled={isPast}
                style={{ flex:1, aspectRatio:1, alignItems:'center', justifyContent:'center', backgroundColor: bg, borderRadius: isSelected ? 9 : 0 }}
                onPress={() => onSelect(ds)}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize:13, fontWeight: isSelected || isToday ? '800' : '400', color: txtColor }}>
                  {parseInt(ds.split('-')[2], 10)}
                </Text>
                {isToday && !isSelected && (
                  <View style={{ width:4, height:4, borderRadius:2, backgroundColor: '#0891B2', marginTop:1 }}/>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const LD = StyleSheet.create({
  sheet:      { backgroundColor: colors.white, borderTopLeftRadius:20, borderTopRightRadius:20, padding: spacing.xl, paddingBottom: 32 },
  header:     { flexDirection:'row', alignItems:'center', marginBottom: spacing.md, gap: spacing.xs },
  title:      { fontSize:16, fontWeight:'800', color: colors.textDark, marginLeft:4 },
  navRow:     { flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom: spacing.sm },
  arrow:      { width:36, height:36, alignItems:'center', justifyContent:'center' },
  arrowTxt:   { fontSize:24, color: '#0891B2', fontWeight:'700', lineHeight:28 },
  monthTitle: { fontSize:15, fontWeight:'800', color: colors.textDark },
  dayHdr:     { fontSize:11, fontWeight:'700', color: colors.neutralMid },
});

// ── Order Details & Payment Screen ─────────────────────────────────────────────
function OrderDetailsScreen({ order, onBack, onPaid, user, navigation, taxSettings, restSettings, setDialog }) {
  const [fullOrder, setFullOrder]       = useState(null);
  const [loadingOrder, setLoadingOrder] = useState(true);

  const [isPaying, setIsPaying]       = useState(false);
  const [method, setMethod]           = useState('Cash');
  const [cashIn, setCashIn]           = useState('');
  const [cardOk, setCardOk]           = useState(false);
  const [qrOk,   setQrOk]             = useState(false);
  const [discType, setDiscType]       = useState('Percentage');
  const [discVal, setDiscVal]         = useState('');
  const [discReason, setDiscReason]   = useState(DISC_REASONS[0]);
  const [showReasons, setShowReasons] = useState(false);
  const [loadingPay, setLoadingPay]   = useState(false);
  const [splitCount, setSplitCount]   = useState(null);
  const [splitParts, setSplitParts]   = useState([]);
  // Loan-specific state
  const [loanName,       setLoanName]       = useState('');
  const [loanPhone,      setLoanPhone]      = useState('');
  const [loanDueDate,    setLoanDueDate]    = useState('');
  const [showLoanCal,    setShowLoanCal]    = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await ordersAPI.getById(order.id);
        setFullOrder(res.data);
      } catch {
        setDialog({ title: 'Error', message: 'Could not load order details', type: 'error' });
        setTimeout(() => onBack(), 500);
      } finally {
        setLoadingOrder(false);
      }
    })();
  }, [order.id]);

  // ── Live tax/service from admin settings ─────────────────────────────────
  // tax_rate in DB is stored as percentage (e.g. 12 = 12%), and tax_enabled controls whether it applies
  const taxRate  = (taxSettings?.tax_enabled && taxSettings?.tax_rate > 0)
    ? (taxSettings.tax_rate / 100)
    : 0;
  const svcRate  = (restSettings?.service_charge_enabled && restSettings?.service_charge_rate > 0)
    ? (parseFloat(restSettings.service_charge_rate) / 100)
    : 0;

  const items  = fullOrder?.items || fullOrder?.order_items || [];
  const rawSub = items.reduce(
    (s, x) => s + (x.unit_price || x.price || 0) * (x.quantity || x.qty || 1), 0
  );

  const discAmt = discVal
    ? (discType === 'Percentage'
      ? Math.round(rawSub * Math.min(parseFloat(discVal) || 0, 100) / 100)
      : Math.min(parseInt(discVal) || 0, rawSub))
    : 0;

  const afterDisc = rawSub - discAmt;
  const tax       = Math.round(afterDisc * taxRate);
  const svc       = Math.round(afterDisc * svcRate);
  const total     = afterDisc + tax + svc;
  const cashRcv   = parseInt(cashIn) || 0;
  const change    = Math.max(0, cashRcv - total);

  // Tax/service label helpers
  const taxLabel = taxRate > 0
    ? `Tax (${Math.round(taxRate * 100)}%)`
    : 'Tax';
  const svcLabel = svcRate > 0
    ? `Service (${Math.round(svcRate * 100)}%)`
    : 'Service';

  // Split initialization when count or total changes
  useEffect(() => {
    if (splitCount) {
      if (total === 0) { setSplitParts([]); return; }
      const baseAmt = Math.floor(total / splitCount);
      const rem = total - (baseAmt * splitCount);
      setSplitParts(
        Array.from({ length: splitCount }).map((_, i) => ({
          amount: String(baseAmt + (i === 0 ? rem : 0)),
          method: 'Cash',
          confirmed: false,
        }))
      );
    } else {
      setSplitParts([]);
    }
  }, [splitCount, total]);

  // Auto-populate cash
  useEffect(() => {
    if (isPaying && method === 'Cash' && !cashIn && total > 0) {
      setCashIn(String(total));
    }
  }, [isPaying, method, total]);

  if (loadingOrder) {
    return (
      <View style={[S.flex, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#0891B2" />
      </View>
    );
  }

  const splitTotal = splitParts.reduce((s, p) => s + (parseInt(p.amount) || 0), 0);
  const canPay = splitCount
    ? (splitTotal === total && splitParts.every(p => p.confirmed))
    : (method === 'Cash'    ? cashRcv >= total
    :  method === 'Card'    ? cardOk
    :  method === 'QR Code' ? qrOk
    :  method === 'Loan'    ? (loanName.trim().length > 0 && loanPhone.trim().length > 0 && loanDueDate.length > 0)
    : false);

  const confirmPay = async () => {
    setLoadingPay(true);
    try {
      const payload = {
        payment_method: splitCount ? 'split' : method.toLowerCase().replace(' ', '_'),
        discount_amount: discAmt,
        discount_reason: discAmt > 0 ? discReason : null,
        notes: discAmt > 0 ? `Discount: ${discReason}` : undefined,
        // Loan fields (ignored by server when method is not 'loan')
        ...(method === 'Loan' ? {
          loan_customer_name:  loanName.trim(),
          loan_customer_phone: loanPhone.trim(),
          loan_due_date:       loanDueDate,
        } : {}),
      };
      if (splitCount) {
        payload.split_payments = splitParts.map(sp => ({
          method: sp.method.toLowerCase(),
          amount: parseInt(sp.amount) || 0,
        }));
      }
      await ordersAPI.pay(order.id, payload);
      // Pass fullOrder (with items) so the receipt has all the data
      onPaid({
        order: { ...fullOrder, daily_number: order.daily_number },
        payment: {
          method: splitCount ? 'Split' : method,
          discount: discAmt,
          discReason: discAmt > 0 ? discReason : null,
          change,
          subtotal: rawSub,
          tax,
          svc,
          total,
        },
      });
    } catch (e) {
      setDialog({ title: 'Error', message: e?.response?.data?.error || 'Payment failed', type: 'error' });
    } finally {
      setLoadingPay(false);
    }
  };

  const METHODS = [
    { id: 'Cash',    icon: 'payments'                  },
    { id: 'Card',    icon: 'credit-card'               },
    { id: 'QR Code', icon: 'qr-code'                   },
    { id: 'Loan',    icon: 'account-balance-wallet'    },
  ];

  return (
    <View style={S.flex}>
      {/* Header */}
      <View style={S.pHeader}>
        <TouchableOpacity onPress={() => isPaying ? setIsPaying(false) : onBack()} style={S.backBtn} hitSlop={12}>
          <MaterialIcons name="arrow-back" size={22} color={colors.textDark} />
        </TouchableOpacity>
        <View style={S.flex}>
          <Text style={S.pHeaderSub}>{isPaying ? 'Process Payment' : 'Order Details'}</Text>
          <Text style={S.pHeaderTitle}>{order.table_name || order.customer_name || 'Walk-in'}</Text>
        </View>
      </View>

      <ScrollView style={S.flex} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 110 }}>

        {/* Items Card — order details view */}
        {!isPaying && (
          <View style={S.card}>
            <SectionHeader title="Order Items" />
            {/* Partial-ready banner */}
            {(() => {
              const rCount = items.filter(i => i.item_ready).length;
              const tCount = items.length;
              if (rCount > 0 && rCount < tCount && order.status !== 'ready') {
                return (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFF7ED', borderRadius: 10, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: '#F97316' }}>
                    <MaterialIcons name="local-fire-department" size={16} color="#C2410C" />
                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#C2410C' }}>
                      Prep in progress — {rCount}/{tCount} items kitchen-ready
                    </Text>
                  </View>
                );
              }
              return null;
            })()}
            {items.map((item, i) => {
              const price   = item.unit_price || item.price || 0;
              const qty     = item.quantity   || item.qty   || 1;
              const isDone  = !!item.item_ready;
              return (
                <View key={i} style={[S.itemRow, isDone && { backgroundColor: '#F0FDF4', borderRadius: 8, paddingHorizontal: 6 }]}>
                  <Text style={[S.itemName, isDone && { color: '#16A34A' }]} numberOfLines={1}>{item.name || item.menu_item_name}</Text>
                  <Text style={S.itemQty}>×{qty}</Text>
                  {isDone && <MaterialIcons name="check-circle" size={14} color="#16A34A" style={{ marginRight: 4 }} />}
                  <Text style={S.itemAmt}>{fmt(price * qty)}</Text>
                </View>
              );
            })}
            {items.length === 0 && (
              <Text style={{ color: colors.neutralMid, fontSize: 13, paddingVertical: 10 }}>No items in this order.</Text>
            )}

            <View style={S.divider} />
            <View style={S.totRow}><Text style={S.totLbl}>Subtotal</Text><Text style={S.totVal}>{fmt(rawSub)}</Text></View>
            {taxRate > 0
              ? <View style={S.totRow}><Text style={S.totLbl}>{taxLabel}</Text><Text style={S.totVal}>{fmt(tax)}</Text></View>
              : <View style={S.totRow}><Text style={S.totLbl}>{taxLabel}</Text><Text style={[S.totVal, { color: colors.neutralMid }]}>0 so'm</Text></View>
            }
            {svcRate > 0
              ? <View style={S.totRow}><Text style={S.totLbl}>{svcLabel}</Text><Text style={S.totVal}>{fmt(svc)}</Text></View>
              : <View style={S.totRow}><Text style={S.totLbl}>{svcLabel}</Text><Text style={[S.totVal, { color: colors.neutralMid }]}>0 so'm</Text></View>
            }
            <View style={[S.totRow, S.totRowBold]}>
              <Text style={S.grandLbl}>Total</Text>
              <Text style={S.grandAmt}>{fmt(total)}</Text>
            </View>
          </View>
        )}

        {isPaying && (
          <>
            <View style={S.card}>
              <View style={S.totRow}><Text style={S.totLbl}>Subtotal</Text><Text style={S.totVal}>{fmt(rawSub)}</Text></View>
              {tax > 0 && <View style={S.totRow}><Text style={S.totLbl}>{taxLabel}</Text><Text style={S.totVal}>{fmt(tax)}</Text></View>}
              {svc > 0 && <View style={S.totRow}><Text style={S.totLbl}>{svcLabel}</Text><Text style={S.totVal}>{fmt(svc)}</Text></View>}
              {discAmt > 0 && (
                <View style={S.totRow}><Text style={[S.totLbl, { color: colors.success }]}>Discount</Text><Text style={[S.totVal, { color: colors.success }]}>−{fmt(discAmt)}</Text></View>
              )}
              <View style={[S.totRow, S.totRowBold]}>
                <Text style={S.grandLbl}>Total to Pay</Text>
                <Text style={S.grandAmt}>{fmt(total)}</Text>
              </View>
            </View>

            {/* Payment Method */}
            <View style={[S.card, { marginTop: spacing.md }]}>
              <SectionHeader title="Payment Method" />
              <View style={S.methodRow}>
                {METHODS.map(({ id, icon }) => (
                  <TouchableOpacity
                    key={id}
                    style={[S.methodBtn, method === id && S.methodBtnActive]}
                    onPress={() => { setMethod(id); setCardOk(false); setQrOk(false); setSplitCount(null); setLoanName(''); setLoanPhone(''); setLoanDueDate(''); }}
                  >
                    <MaterialIcons name={icon} size={24} color={method === id ? '#0891B2' : colors.neutralMid} />
                    <Text style={[S.methodLbl, method === id && S.methodLblActive]}>{id}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {method === 'Cash' && (
                <View style={{ marginTop: spacing.md }}>
                  <Text style={S.inputLabel}>Amount received</Text>
                  <TextInput
                    style={S.input}
                    keyboardType="numeric"
                    placeholder="0"
                    value={cashIn}
                    onChangeText={setCashIn}
                    placeholderTextColor={colors.neutralMid}
                  />
                  {cashRcv >= total && cashRcv > 0 && (
                    <View style={S.changeBox}>
                      <Text style={S.changeLbl}>Change to give back</Text>
                      <Text style={S.changeAmt}>{fmt(change)}</Text>
                    </View>
                  )}
                </View>
              )}

              {method === 'Card' && (
                <TouchableOpacity style={[S.checkRow, cardOk && S.checkRowOk]} onPress={() => setCardOk(!cardOk)}>
                  <View style={[S.checkbox, cardOk && S.checkboxOk]}>
                    {cardOk && <MaterialIcons name="check" size={13} color="#fff" />}
                  </View>
                  <Text style={S.checkLbl}>Card payment confirmed on terminal</Text>
                </TouchableOpacity>
              )}

              {method === 'QR Code' && (
                <View style={{ marginTop: spacing.md }}>
                  <View style={S.qrBox}>
                    <MaterialIcons name="qr-code" size={48} color={colors.border} />
                    <Text style={S.qrLbl}>Customer scans to pay</Text>
                  </View>
                  <TouchableOpacity style={[S.checkRow, qrOk && S.checkRowOk]} onPress={() => setQrOk(!qrOk)}>
                    <View style={[S.checkbox, qrOk && S.checkboxOk]}>
                      {qrOk && <MaterialIcons name="check" size={13} color="#fff" />}
                    </View>
                    <Text style={S.checkLbl}>QR payment confirmed</Text>
                  </TouchableOpacity>
                </View>
              )}

              {method === 'Loan' && (
                <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
                  <View style={S.loanNotice}>
                    <MaterialIcons name="info-outline" size={15} color="#D97706" />
                    <Text style={S.loanNoticeTxt}>Order will be marked paid. Debt tracked until customer returns.</Text>
                  </View>
                  <Text style={S.inputLabel}>Customer Name</Text>
                  <TextInput
                    style={S.input}
                    placeholder="Full name"
                    placeholderTextColor={colors.neutralMid}
                    value={loanName}
                    onChangeText={setLoanName}
                  />
                  <PhoneField label="Phone Number" value={loanPhone} onChange={setLoanPhone} />
                  <Text style={S.inputLabel}>Expected Return Date</Text>
                  <TouchableOpacity
                    style={[S.input, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                    onPress={() => setShowLoanCal(true)}
                    activeOpacity={0.8}
                  >
                    <Text style={{ fontSize: 14, color: loanDueDate ? colors.textDark : colors.neutralMid }}>
                      {loanDueDate || 'Select date'}
                    </Text>
                    <MaterialIcons name="calendar-today" size={18} color={colors.neutralMid} />
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Loan due-date picker */}
            <Modal visible={showLoanCal} transparent animationType="slide" onRequestClose={() => setShowLoanCal(false)}>
              <TouchableOpacity style={S.modalMask} onPress={() => setShowLoanCal(false)} />
              <LoanDatePickerSheet
                current={loanDueDate}
                onSelect={(ds) => { setLoanDueDate(ds); setShowLoanCal(false); }}
                onClose={() => setShowLoanCal(false)}
              />
            </Modal>

            {/* Discount */}
            <View style={[S.card, { marginTop: spacing.md }]}>
              <SectionHeader title="Apply Discount (Optional)" />
              <View style={S.toggleRow}>
                {['Percentage', 'Fixed Amount'].map(t => (
                  <TouchableOpacity key={t} style={[S.toggleBtn, discType === t && S.toggleBtnActive]} onPress={() => { setDiscType(t); setDiscVal(''); }}>
                    <Text style={[S.toggleLbl, discType === t && S.toggleLblActive]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                style={[S.input, { marginTop: spacing.sm }]}
                keyboardType="numeric"
                placeholder={discType === 'Percentage' ? '0 %' : "0 so'm"}
                value={discVal}
                onChangeText={setDiscVal}
                placeholderTextColor={colors.neutralMid}
              />
              {discVal ? (
                <TouchableOpacity style={[S.reasonPicker, { marginTop: spacing.sm }]} onPress={() => setShowReasons(true)}>
                  <Text style={S.reasonTxt}>{discReason}</Text>
                  <MaterialIcons name="expand-more" size={18} color={colors.neutralMid} />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Split Bill */}
            <View style={[S.card, { marginTop: spacing.md }]}>
              <SectionHeader title="Split Bill (Optional)" />
              <View style={S.splitRow}>
                {[2, 3, 4].map(n => (
                  <TouchableOpacity
                    key={n}
                    style={[S.splitBtn, splitCount === n && S.splitBtnActive]}
                    onPress={() => setSplitCount(n)}
                  >
                    <Text style={[S.splitLbl, splitCount === n && S.splitLblActive]}>{n} ways</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {splitCount && (
                <View style={{ marginTop: spacing.md, gap: spacing.md }}>
                  {splitParts.map((sp, i) => (
                    <View key={i} style={S.splitPartContainer}>
                      <View style={S.splitPartHeader}>
                        <Text style={S.splitPartLbl}>Part {i + 1}</Text>
                        <View style={S.splitInputWrap}>
                          <TextInput
                            style={S.splitInput}
                            keyboardType="numeric"
                            value={sp.amount}
                            onChangeText={v => {
                              const c = [...splitParts];
                              c[i].amount = v;
                              setSplitParts(c);
                            }}
                          />
                          <Text style={S.splitInputSuffix}>so'm</Text>
                        </View>
                      </View>
                      <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center', marginTop: spacing.sm }}>
                        {METHODS.map(m => (
                          <TouchableOpacity
                            key={m.id}
                            style={[S.splitMethodBtn, sp.method === m.id && S.splitMethodBtnActive]}
                            onPress={() => {
                              const c = [...splitParts];
                              c[i].method = m.id;
                              setSplitParts(c);
                            }}
                          >
                            <Text style={[S.splitMethodTxt, sp.method === m.id && S.splitMethodTxtActive]}>{m.id}</Text>
                          </TouchableOpacity>
                        ))}
                        <View style={{ flex: 1 }} />
                        <TouchableOpacity
                          style={[S.splitCheckRow, sp.confirmed && S.splitCheckRowOk]}
                          onPress={() => {
                            const c = [...splitParts];
                            c[i].confirmed = !c[i].confirmed;
                            setSplitParts(c);
                          }}
                        >
                          <View style={[S.splitCheckbox, sp.confirmed && S.checkboxOk]}>
                            {sp.confirmed && <MaterialIcons name="check" size={12} color="#fff" />}
                          </View>
                          <Text style={S.splitCheckLbl}>Paid</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                  <View style={S.splitSumRow}>
                    <Text style={S.splitSumLbl}>Split Validation</Text>
                    <Text style={[S.splitSumAmt, splitTotal === total ? { color: colors.success } : { color: colors.error }]}>
                      {fmt(splitTotal)} / {fmt(total)}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>

      {/* Footer */}
      <View style={S.payFooter}>
        {!isPaying ? (
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <TouchableOpacity
              style={[S.kitchenBtn, { flex: 1, paddingVertical: 15 }]}
              onPress={() => { onBack(); navigation.navigate('CashierWalkin', { order: fullOrder }); }}
            >
              <MaterialIcons name="add" size={20} color={colors.textDark} />
              <Text style={[S.kitchenBtnTxt, { fontSize: 14 }]}>Add Items</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[S.payBtn, { flex: 1.5 }]} onPress={() => setIsPaying(true)}>
              <Text style={S.payBtnTxt}>Proceed to Payment</Text>
              <MaterialIcons name="chevron-right" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <TouchableOpacity
              style={[S.kitchenBtn, { paddingHorizontal: 20, paddingVertical: 15 }]}
              onPress={() => setDialog({ title: 'Printing', message: 'Check sent to printer', type: 'info' })}
            >
              <MaterialIcons name="print" size={22} color={colors.textDark} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[S.payBtn, !canPay && S.payBtnDisabled, { flex: 1 }]}
              disabled={!canPay || loadingPay}
              onPress={confirmPay}
            >
              {loadingPay
                ? <ActivityIndicator color="#fff" />
                : <Text style={S.payBtnTxt}>Confirm Payment — {fmt(total)}</Text>
              }
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Reason Picker Modal */}
      <Modal visible={showReasons} transparent animationType="slide" onRequestClose={() => setShowReasons(false)}>
        <TouchableOpacity style={S.modalMask} onPress={() => setShowReasons(false)} />
        <View style={S.bottomSheet}>
          <Text style={S.sheetTitle}>Select Reason</Text>
          {DISC_REASONS.map(r => (
            <TouchableOpacity key={r} style={S.reasonOption} onPress={() => { setDiscReason(r); setShowReasons(false); }}>
              <Text style={[S.reasonOptionTxt, discReason === r && { color: '#0891B2', fontWeight: '700' }]}>{r}</Text>
              {discReason === r && <MaterialIcons name="check" size={18} color="#0891B2" />}
            </TouchableOpacity>
          ))}
        </View>
      </Modal>
    </View>
  );
}

// ── Orders Tab ─────────────────────────────────────────────────────────────────
export default function CashierOrders({ navigation, route }) {
  const { user } = useAuth();
  const [orders, setOrders]               = useState([]);
  const [loading, setLoading]             = useState(true);
  const [refreshing, setRefreshing]       = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [receiptOrder, setReceiptOrder]   = useState(null);
  const [receiptPayment, setReceiptPayment] = useState(null);
  const [showReceipt, setShowReceipt]     = useState(false);
  const [todayStats, setTodayStats]       = useState({ count: 0, revenue: 0 });
  const [activeTab, setActiveTab]         = useState('Restaurant Orders');
  const [billToast, setBillToast]         = useState(null);   // toast message string | null
  const [dialog, setDialog]               = useState(null);
  const prevBillIds = useRef(new Set());                       // track known bill_requested IDs
  const toastTimer  = useRef(null);                            // auto-hide timer

  // ── Detect new bill requests during polling ───────────────────────────────
  useEffect(() => {
    const requested = orders.filter(o => o.status === 'bill_requested');
    const newOnes   = requested.filter(o => !prevBillIds.current.has(o.id));

    if (newOnes.length > 0 && prevBillIds.current.size > 0) {
      // Show toast for the first newly arrived bill request
      const o = newOnes[0];
      const label = o.table_name || o.customer_name || `Order ${fmtOrderNum(o)}`;
      const extra = newOnes.length > 1 ? ` (+${newOnes.length - 1} more)` : '';
      if (toastTimer.current) clearTimeout(toastTimer.current);
      setBillToast(`${label} requested the bill!${extra}`);
      toastTimer.current = setTimeout(() => setBillToast(null), 4500);
    }

    prevBillIds.current = new Set(requested.map(o => o.id));
  }, [orders]);

  // ── Fetch admin settings (tax + restaurant) ──────────────────────────────
  const [taxSettings,  setTaxSettings]  = useState({ tax_rate: 0, tax_enabled: false });
  const [restSettings, setRestSettings] = useState({
    restaurant_name: 'The Bill Restaurant',
    receipt_header: 'Thank you for dining with us!',
    service_charge_rate: 0,
    service_charge_enabled: false,
  });

  const fetchSettings = useCallback(async () => {
    try {
      const [taxRes, restRes] = await Promise.all([
        accountingAPI.getTaxSettings(),
        accountingAPI.getRestaurantSettings(),
      ]);
      if (taxRes?.data)  setTaxSettings(taxRes.data);
      if (restRes?.data) setRestSettings(restRes.data);
    } catch { /* silent — use defaults */ }
  }, []);

  const fetchOrders = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await ordersAPI.getAll({ status: 'pending,sent_to_kitchen,preparing,ready,served,bill_requested' });
      const data = (res.data || []).filter(o =>
        ['pending', 'sent_to_kitchen', 'preparing', 'ready', 'served', 'bill_requested'].includes(o.status)
      );
      setOrders(data);
    } catch { /* silent */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const res   = await ordersAPI.getAll({ status: 'paid' });
      const today = new Date().toDateString();
      const paid  = (res.data || []).filter(o => new Date(o.paid_at || o.updated_at).toDateString() === today);
      const rev   = paid.reduce((s, o) => s + (parseFloat(o.total_amount) || 0), 0);
      setTodayStats({ count: paid.length, revenue: rev });
    } catch {}
  }, []);

  useEffect(() => {
    fetchSettings();
    fetchOrders();
    fetchStats();
    const iv = setInterval(() => { fetchOrders(true); fetchStats(); }, 5000);
    return () => clearInterval(iv);
  }, [fetchSettings, fetchOrders, fetchStats]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchOrders(true);
      fetchStats();
    });
    return unsubscribe;
  }, [navigation, fetchOrders, fetchStats]);

  // ── Auto-open payment sheet when coming from "Skip — Pay Now" ─────────────
  useEffect(() => {
    const openId = route?.params?.openPayForOrderId;
    if (!openId) return;
    // Clear the param so it doesn't re-trigger on next focus
    navigation.setParams({ openPayForOrderId: undefined });
    // Wait for orders to load, then find and open the order
    const tryOpen = async () => {
      try {
        const res = await ordersAPI.getById(openId);
        if (res?.data) setSelectedOrder(res.data);
      } catch { /* silently ignore */ }
    };
    tryOpen();
  }, [route?.params?.openPayForOrderId]);

  const handlePaid = async ({ order, payment }) => {
    setSelectedOrder(null);
    setReceiptOrder(order);
    setReceiptPayment(payment);
    setShowReceipt(true);
    await fetchOrders(true);
    await fetchStats();
  };

  if (selectedOrder) {
    return (
      <OrderDetailsScreen
        order={selectedOrder}
        onBack={() => setSelectedOrder(null)}
        onPaid={handlePaid}
        user={user}
        navigation={navigation}
        taxSettings={taxSettings}
        restSettings={restSettings}
        setDialog={setDialog}
      />
    );
  }

  // Count bill_requested for notification dot
  const requestedCount = orders.filter(o => o.status === 'bill_requested').length;

  // Filter logic
  const filteredOrders = orders.filter(o => {
    if (activeTab === 'Restaurant Orders') return o.order_type === 'dine_in' || (!o.order_type);
    if (activeTab === 'Requested')  return o.status === 'bill_requested';
    if (activeTab === 'Delivery')   return o.order_type === 'delivery';
    if (activeTab === 'To Go')      return o.order_type === 'to_go' || o.order_type === 'takeaway';
    return true;
  });

  const getStatusBadge = (status) => {
    switch (status) {
      case 'bill_requested':
        return <Badge label="Bill Requested 🔔" bg="#FDF4FF" text="#7C3AED" />;
      case 'ready': case 'served':
        return <Badge label="Awaiting Payment" bg="#FFFBEB" text="#D97706" />;
      case 'preparing': case 'sent_to_kitchen':
        return <Badge label="Preparing" bg="#EFF6FF" text="#2563EB" />;
      default:
        return <Badge label="Pending" bg="#F3F4F6" text="#4B5563" />;
    }
  };

  const renderOrder = ({ item: order }) => {
    const grand      = parseFloat(order.total_amount) || 0;
    const count      = parseInt(order.item_count) || 0;
    const isToGo     = order.order_type === 'to_go' || order.order_type === 'takeaway';
    const isDelivery = order.order_type === 'delivery';
    const typeLabel  = isDelivery ? 'Delivery' : isToGo ? 'To Go' : 'Dine-In';
    const typeColor  = isDelivery ? '#8B5CF6'  : isToGo  ? '#10B981' : colors.neutralMid;

    // Partial-ready detection
    const cardItems   = order.items || [];
    const cardReady   = cardItems.filter(i => i.item_ready).length;
    const cardPartial = cardReady > 0 && cardReady < cardItems.length && order.status !== 'ready';

    return (
      <View style={[S.orderCard, cardPartial && { borderLeftWidth: 3, borderLeftColor: '#F97316' }]}>
        <TouchableOpacity style={{ padding: spacing.lg }} onPress={() => setSelectedOrder(order)} activeOpacity={0.75}>
          <View style={S.orderCardTop}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Text style={S.orderNum}>{fmtOrderNum(order)}</Text>
                <Badge label={typeLabel} bg={typeColor + '1A'} text={typeColor} />
                {cardPartial && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#FFF7ED', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                    <MaterialIcons name="local-fire-department" size={11} color="#C2410C" />
                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#C2410C' }}>{cardReady}/{cardItems.length}</Text>
                  </View>
                )}
              </View>
              <Text style={S.orderTable}>{isDelivery || isToGo ? (order.customer_name || 'Walk-in') : (order.table_name || 'Walk-in')}</Text>
            </View>
            <View>{getStatusBadge(order.status)}</View>
          </View>
          <View style={S.orderMetaGroup}>
            <View style={S.metaPill}><MaterialIcons name="shopping-bag" size={14} color={colors.neutralMid} /><Text style={S.metaPillTxt}>{count} items</Text></View>
            <View style={S.metaPill}><MaterialIcons name={isDelivery || isToGo ? 'phone' : 'person-outline'} size={14} color={colors.neutralMid} /><Text style={S.metaPillTxt}>{isDelivery || isToGo ? (order.customer_phone || 'No phone') : (order.waitress_name || 'Counter')}</Text></View>
            <View style={S.metaPill}><MaterialIcons name="schedule" size={14} color={colors.neutralMid} /><Text style={S.metaPillTxt}>{elapsed(order.created_at)}</Text></View>
          </View>
          {isDelivery && order.delivery_address && (
            <Text style={S.deliveryAddress}>{order.delivery_address}</Text>
          )}
          <View style={S.pricingRow}>
            <Text style={S.pricingLbl}>Total</Text>
            <Text style={S.pricingVal}>{fmt(grand)}</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={S.addItemsFooterBtn} onPress={() => navigation.navigate('CashierWalkin', { order })}>
          <MaterialIcons name="add" size={18} color="#0891B2" />
          <Text style={S.addItemsFooterTxt}>Add Items</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={S.flex}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />
      {/* Stat row */}
      <View style={S.statsRow}>
        <StatCard label="Pending"    value={orders.length}         color={colors.warning} icon="pending-actions" />
        <StatCard label="Done Today" value={todayStats.count}      color={colors.success} icon="check-circle" />
        <StatCard label="Revenue"    value={`${Math.round(todayStats.revenue / 1000)}K`} sub="so'm" color="#0891B2" icon="trending-up" />
      </View>

      {/* Tabs Filter — horizontal scrollable */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={S.tabsRow}
        style={{ flexGrow: 0 }}
      >
        {['All Active', 'Restaurant Orders', 'Requested', 'To Go', 'Delivery'].map(tab => (
          <TouchableOpacity key={tab} style={[S.tabChip, activeTab === tab && S.tabChipActive]} onPress={() => setActiveTab(tab)}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={[S.tabTxt, activeTab === tab && S.tabTxtActive]}>{tab}</Text>
              {tab === 'Requested' && requestedCount > 0 && (
                <View style={[S.tabDot, activeTab === tab && S.tabDotActive]}>
                  <Text style={S.tabDotTxt}>{requestedCount}</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Walk-in button */}
      <View style={S.walkinRow}>
        <TouchableOpacity style={S.walkinBtn} onPress={() => navigation.navigate('CashierWalkin')}>
          <MaterialIcons name="add-circle-outline" size={18} color="#fff" />
          <Text style={S.walkinTxt}>New Order</Text>
        </TouchableOpacity>
      </View>

      {loading
        ? <ActivityIndicator style={{ flex: 1 }} size="large" color="#0891B2" />
        : (
          <FlatList
            data={filteredOrders}
            keyExtractor={o => String(o.id)}
            renderItem={renderOrder}
            contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 24 }}
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchOrders(); fetchStats(); }}
            ListEmptyComponent={
              <View style={S.empty}>
                <MaterialIcons name={activeTab === 'Requested' ? 'receipt-long' : 'inbox'} size={44} color={colors.border} />
                <Text style={S.emptyTxt}>
                  {activeTab === 'Restaurant Orders' ? 'No dine-in orders'            :
                   activeTab === 'Requested'        ? 'No bill requests yet'         :
                   activeTab === 'Delivery'         ? 'No active delivery orders'    :
                   activeTab === 'To Go'            ? 'No to-go orders'              :
                   'No active orders'}
                </Text>
              </View>
            }
          />
        )
      }

      {/* ── Bill Request Toast ─────────────────────────────────────────────── */}
      <BillToast message={billToast} visible={!!billToast} />

      {/* ── Receipt Modal ──────────────────────────────────────────────────── */}
      <Modal visible={showReceipt} transparent animationType="slide" onRequestClose={() => setShowReceipt(false)}>
        <TouchableOpacity style={S.modalMask} onPress={() => setShowReceipt(false)} />
        {receiptOrder && receiptPayment && (
          <View style={[S.bottomSheet, { maxHeight: '90%' }]}>
            <Text style={S.sheetTitle}>Receipt Preview</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Restaurant header */}
              <View style={S.receiptHeader}>
                <Text style={S.receiptRest}>{restSettings.restaurant_name || 'The Bill Restaurant'}</Text>
                <Text style={S.receiptSub}>
                  Order {fmtOrderNum(receiptOrder)} • {receiptOrder.table_name || receiptOrder.customer_name || 'Walk-in'}
                </Text>
                <Text style={S.receiptDate}>{dateTimeStr(new Date().toISOString())}</Text>
              </View>

              {/* Items */}
              {(receiptOrder.items || receiptOrder.order_items || []).map((item, i) => {
                const p = item.unit_price || item.price || 0;
                const q = item.quantity   || item.qty   || 1;
                return (
                  <View key={i} style={S.itemRow}>
                    <Text style={S.itemName}>{item.name || item.menu_item_name || '—'}</Text>
                    <Text style={S.itemQty}>×{q}</Text>
                    <Text style={S.itemAmt}>{fmt(p * q)}</Text>
                  </View>
                );
              })}

              <View style={S.divider} />

              {/* Totals */}
              <View style={S.totRow}><Text style={S.totLbl}>Subtotal</Text><Text style={S.totVal}>{fmt(receiptPayment.subtotal)}</Text></View>
              {receiptPayment.tax > 0 && (
                <View style={S.totRow}><Text style={S.totLbl}>Tax ({taxSettings.tax_enabled ? `${taxSettings.tax_rate}%` : '0%'})</Text><Text style={S.totVal}>{fmt(receiptPayment.tax)}</Text></View>
              )}
              {receiptPayment.svc > 0 && (
                <View style={S.totRow}><Text style={S.totLbl}>Service ({Math.round((restSettings.service_charge_rate || 0) * 100) / 100}%)</Text><Text style={S.totVal}>{fmt(receiptPayment.svc)}</Text></View>
              )}
              {receiptPayment.discount > 0 && (
                <View style={S.totRow}>
                  <Text style={[S.totLbl, { color: colors.success }]}>Discount{receiptPayment.discReason ? ` (${receiptPayment.discReason})` : ''}</Text>
                  <Text style={[S.totVal, { color: colors.success }]}>−{fmt(receiptPayment.discount)}</Text>
                </View>
              )}
              <View style={[S.totRow, { paddingTop: 4, borderTopWidth: 1, borderTopColor: colors.border, marginTop: 4 }]}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: colors.textDark }}>Total</Text>
                <Text style={{ fontSize: 15, fontWeight: '800', color: '#0891B2' }}>{fmt(receiptPayment.total)}</Text>
              </View>

              <View style={S.divider} />

              {receiptPayment.change > 0 && (
                <View style={S.totRow}><Text style={[S.totLbl, { color: '#0891B2' }]}>Change</Text><Text style={[S.totVal, { color: '#0891B2' }]}>{fmt(receiptPayment.change)}</Text></View>
              )}
              <View style={S.totRow}><Text style={S.totLbl}>Method</Text><Text style={S.totVal}>{receiptPayment.method}</Text></View>
              <View style={S.totRow}><Text style={S.totLbl}>Cashier</Text><Text style={S.totVal}>{user?.name || 'Cashier'}</Text></View>

              <Text style={S.receiptThank}>{restSettings.receipt_header || 'Thank you for dining with us!'}</Text>
            </ScrollView>
            <View style={S.receiptBtns}>
              <TouchableOpacity style={S.receiptSkip} onPress={() => setShowReceipt(false)}>
                <Text style={S.receiptSkipTxt}>Skip</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={S.receiptPrint}
                onPress={() => { setShowReceipt(false); setDialog({ title: 'Printed', message: 'Receipt sent to printer', type: 'info' }); }}
              >
                <MaterialIcons name="print" size={16} color="#fff" />
                <Text style={S.receiptPrintTxt}>Print Receipt</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </Modal>
      <ConfirmDialog dialog={dialog} onClose={() => setDialog(null)} />
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  flex:            { flex: 1 },
  statsRow:        { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: topInset + spacing.sm, paddingBottom: spacing.md, backgroundColor: '#F0F9FF' },
  statCard:        { flex: 1, backgroundColor: colors.white, borderRadius: radius.card, padding: spacing.md, ...shadow.card, overflow: 'hidden' },
  statLabel:       { fontSize: 10, color: colors.neutralMid, fontWeight: '600', marginBottom: 2 },
  statVal:         { fontSize: 18, fontWeight: '800', color: colors.textDark },
  statSub:         { fontSize: 9,  color: colors.neutralMid },
  walkinRow:       { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, paddingTop: spacing.xs },
  walkinBtn:       { backgroundColor: '#0891B2', borderRadius: radius.btn, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: 13, shadowColor: '#0891B2', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 4 },
  walkinTxt:       { color: '#fff', fontWeight: '700', fontSize: 14 },
  tabsRow:         { flexDirection: 'row', paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.sm, paddingTop: spacing.sm },
  tabChip:         { paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.full, backgroundColor: colors.neutralLight },
  tabChipActive:   { backgroundColor: '#0891B2', shadowColor: '#0891B2', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 3 },
  tabTxt:          { fontSize: 13, fontWeight: '600', color: colors.neutralMid },
  tabTxtActive:    { color: '#fff' },
  tabDot:          { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#EF4444', marginLeft: 5, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  tabDotActive:    { backgroundColor: 'rgba(255,255,255,0.25)' },
  tabDotTxt:       { fontSize: 10, fontWeight: '800', color: '#fff', lineHeight: 13 },
  orderCard:       { backgroundColor: colors.white, borderRadius: radius.card, ...shadow.md, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  orderCardTop:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.md },
  orderNum:        { fontSize: 16, fontWeight: '800', color: colors.textDark, letterSpacing: 0.5 },
  orderTable:      { fontSize: 14, fontWeight: '600', color: colors.neutralMid },
  orderMetaGroup:  { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.sm },
  metaPill:        { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaPillTxt:     { fontSize: 12, color: colors.neutralMid, fontWeight: '500' },
  deliveryAddress: { fontSize: 12, color: colors.neutralMid, marginBottom: spacing.sm, fontStyle: 'italic' },
  pricingRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  pricingLbl:      { fontSize: 13, color: colors.neutralMid, fontWeight: '600', textTransform: 'uppercase' },
  pricingVal:      { fontSize: 18, fontWeight: '900', color: '#0891B2' },
  addItemsFooterBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#E0F2FE', paddingVertical: 14 },
  addItemsFooterTxt: { color: '#0891B2', fontWeight: '800', fontSize: 14 },
  badge:           { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.full },
  badgeTxt:        { fontSize: 11, fontWeight: '700' },
  empty:           { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  emptyTxt:        { fontSize: 14, color: colors.neutralMid, marginTop: spacing.md },
  sectionHeader:   { fontSize: 11, fontWeight: '700', color: colors.neutralMid, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: spacing.sm },
  card:            { backgroundColor: colors.white, borderRadius: radius.card, padding: spacing.lg, ...shadow.card },
  itemRow:         { flexDirection: 'row', alignItems: 'center', paddingVertical: 5 },
  itemName:        { flex: 1, fontSize: 13, color: colors.textDark },
  itemQty:         { fontSize: 12, color: colors.neutralMid, marginHorizontal: spacing.sm },
  itemAmt:         { fontSize: 13, fontWeight: '600', color: colors.textDark },
  divider:         { borderTopWidth: 1, borderStyle: 'dashed', borderColor: colors.border, marginVertical: spacing.sm },
  totRow:          { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  totLbl:          { fontSize: 12, color: colors.neutralMid },
  totVal:          { fontSize: 12, color: colors.textDark, fontWeight: '500' },
  totRowBold:      { paddingTop: spacing.sm, borderTopWidth: 1, borderColor: colors.border, marginTop: spacing.xs },
  grandLbl:        { fontSize: 16, fontWeight: '800', color: colors.textDark },
  grandAmt:        { fontSize: 20, fontWeight: '800', color: '#0891B2' },
  pHeader:         { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn:         { padding: spacing.xs },
  pHeaderSub:      { fontSize: 11, color: colors.neutralMid },
  pHeaderTitle:    { fontSize: 16, fontWeight: '800', color: colors.textDark },
  methodRow:       { flexDirection: 'row', gap: spacing.sm },
  methodBtn:       { flex: 1, alignItems: 'center', paddingVertical: spacing.md, borderRadius: radius.md, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.neutralLight },
  methodBtnActive: { borderColor: '#0891B2', backgroundColor: '#E0F2FE' },
  methodLbl:       { fontSize: 11, fontWeight: '600', color: colors.neutralMid, marginTop: 4 },
  methodLblActive: { color: '#0891B2' },
  inputLabel:      { fontSize: 12, color: colors.neutralMid, fontWeight: '600', marginBottom: spacing.xs },
  input:           { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 11, fontSize: 14, color: colors.textDark, backgroundColor: colors.white },
  changeBox:       { marginTop: spacing.sm, backgroundColor: '#F0FDF4', borderRadius: radius.md, padding: spacing.md, alignItems: 'center' },
  changeLbl:       { fontSize: 11, color: colors.success },
  changeAmt:       { fontSize: 26, fontWeight: '800', color: colors.success, marginTop: 2 },
  checkRow:        { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, borderWidth: 2, borderColor: colors.border, marginTop: spacing.sm },
  checkRowOk:      { borderColor: colors.success, backgroundColor: '#F0FDF4' },
  checkbox:        { width: 20, height: 20, borderRadius: 4, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  checkboxOk:      { backgroundColor: colors.success, borderColor: colors.success },
  checkLbl:        { flex: 1, fontSize: 13, color: colors.textDark },
  qrBox:           { borderWidth: 2, borderStyle: 'dashed', borderColor: colors.border, borderRadius: radius.md, height: 120, alignItems: 'center', justifyContent: 'center' },
  qrLbl:           { fontSize: 12, color: colors.neutralMid, marginTop: spacing.xs },
  toggleRow:       { flexDirection: 'row', gap: spacing.sm },
  toggleBtn:       { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.md, backgroundColor: colors.neutralLight, alignItems: 'center' },
  toggleBtnActive: { backgroundColor: '#0891B2' },
  toggleLbl:       { fontSize: 12, fontWeight: '600', color: colors.neutralMid },
  toggleLblActive: { color: '#fff' },
  reasonPicker:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  reasonTxt:       { fontSize: 13, color: colors.textDark },
  splitRow:        { flexDirection: 'row', gap: spacing.sm },
  splitBtn:        { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.md, backgroundColor: colors.neutralLight, alignItems: 'center' },
  splitBtnActive:  { backgroundColor: '#0891B2' },
  splitLbl:        { fontSize: 12, fontWeight: '600', color: colors.neutralMid },
  splitLblActive:  { color: '#fff' },
  splitPartContainer: { backgroundColor: colors.neutralLight, borderRadius: radius.card, padding: spacing.md },
  splitPartHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  splitPartLbl:       { fontSize: 13, color: colors.neutralMid, fontWeight: '700', textTransform: 'uppercase' },
  splitInputWrap:     { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.sm, width: 150 },
  splitInput:         { flex: 1, paddingVertical: 8, fontSize: 14, fontWeight: '700', color: colors.textDark, textAlign: 'right' },
  splitInputSuffix:   { fontSize: 12, color: colors.neutralMid, marginLeft: 4 },
  splitMethodBtn:     { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.btn, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  splitMethodBtnActive: { backgroundColor: '#E0F2FE', borderColor: '#0891B2' },
  splitMethodTxt:     { fontSize: 12, color: colors.neutralMid, fontWeight: '600' },
  splitMethodTxtActive: { color: '#0891B2' },
  splitSumRow:        { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs, paddingHorizontal: spacing.sm },
  splitSumLbl:        { fontSize: 11, color: colors.neutralMid, textTransform: 'uppercase' },
  splitSumAmt:        { fontSize: 13, fontWeight: '800' },
  splitCheckRow:      { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  splitCheckRowOk:    { borderColor: colors.success, backgroundColor: '#F0FDF4' },
  splitCheckbox:      { width: 16, height: 16, borderRadius: 3, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  splitCheckLbl:      { fontSize: 12, fontWeight: '600', color: colors.textDark },
  payFooter:       { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: 24 },
  payBtn:          { flex: 1, backgroundColor: '#0891B2', borderRadius: radius.btn, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 15, shadowColor: '#0891B2', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 5, elevation: 4 },
  kitchenBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.neutralLight, borderRadius: radius.btn },
  kitchenBtnTxt:   { color: colors.textDark, fontWeight: '800' },
  payBtnDisabled:  { backgroundColor: colors.border },
  payBtnTxt:       { color: '#fff', fontWeight: '800', fontSize: 14 },
  modalMask:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  bottomSheet:     { backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.xl },
  sheetTitle:      { fontSize: 16, fontWeight: '700', color: colors.textDark, marginBottom: spacing.lg },
  reasonOption:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  reasonOptionTxt: { fontSize: 14, color: colors.textDark },
  receiptHeader:   { alignItems: 'center', paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: spacing.md },
  receiptRest:     { fontSize: 16, fontWeight: '800', color: colors.textDark },
  receiptSub:      { fontSize: 12, color: colors.neutralMid, marginTop: 2 },
  receiptDate:     { fontSize: 11, color: colors.neutralMid },
  receiptThank:    { textAlign: 'center', fontSize: 12, color: colors.neutralMid, fontStyle: 'italic', marginTop: spacing.md, paddingBottom: spacing.md },
  receiptBtns:     { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  receiptSkip:     { flex: 1, paddingVertical: 13, backgroundColor: colors.neutralLight, borderRadius: radius.btn, alignItems: 'center' },
  receiptSkipTxt:  { fontWeight: '700', color: colors.neutralMid },
  receiptPrint:    { flex: 2, paddingVertical: 13, backgroundColor: '#0891B2', borderRadius: radius.btn, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  receiptPrintTxt: { fontWeight: '700', color: '#fff' },
  // Loan form
  loanNotice:      { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: '#FFFBEB', borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: '#FDE68A' },
  loanNoticeTxt:   { flex: 1, fontSize: 12, color: '#92400E', lineHeight: 17 },
  // Bill request toast
  billToast: {
    position: 'absolute',
    top: 8,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0891B2',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    shadowColor: '#0891B2',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
    zIndex: 9999,
  },
  billToastTxt: { flex: 1, color: '#fff', fontWeight: '700', fontSize: 14 },
});

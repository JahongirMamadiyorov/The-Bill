// ════════════════════════════════════════════════════════════════════════════
// CashierTables — Tables overview for cashier
// Shows all tables, lets cashier open any table to view order, add items,
// process payment, or start a new walk-in order.
// ════════════════════════════════════════════════════════════════════════════
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Modal, ScrollView, ActivityIndicator, RefreshControl,
  TextInput, Animated, StatusBar, SectionList,
} from 'react-native';
import ConfirmDialog from '../../components/ConfirmDialog';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { tablesAPI, menuAPI, ordersAPI } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from '../../context/LanguageContext';
import { colors, spacing, radius, shadow, topInset } from '../../utils/theme';

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n) => Number(n || 0).toLocaleString('uz-UZ') + " so'm";

const elapsed = (iso) => {
  if (!iso) return '';
  const m = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
};

const METHOD_MAP = {
  'Cash': 'cash', 'Card': 'card', 'QR Code': 'qr_code', 'Loan': 'loan', 'Split': 'split',
};

// ── Table status config ────────────────────────────────────────────────────────
const getTableStatus = (tFn) => {
  const t = typeof tFn === 'function' ? tFn : ((_, fb) => fb || '');
  return {
    free:     { color: '#16A34A', bg: '#F0FDF4', label: t('statuses.free',     'Free'),     icon: 'check-circle-outline' },
    occupied: { color: '#D97706', bg: '#FFFBEB', label: t('statuses.occupied', 'Occupied'), icon: 'people-outline'        },
    reserved: { color: '#7C3AED', bg: '#F5F3FF', label: t('statuses.reserved', 'Reserved'), icon: 'event-note'            },
    cleaning: { color: '#0891B2', bg: '#ECFEFF', label: t('statuses.cleaning', 'Cleaning'), icon: 'cleaning-services'     },
    closed:   { color: '#DC2626', bg: '#FEF2F2', label: t('statuses.closed',   'Closed'),   icon: 'block'                 },
  };
};

// ── Mini Table Card ────────────────────────────────────────────────────────────
function TableCard({ table, onPress, t: tProp }) {
  const { t: tHook } = useTranslation();
  const t = tProp || tHook || ((_, fb) => fb || '');
  const TABLE_STATUS = getTableStatus(t);
  const cfg    = TABLE_STATUS[table.status] || TABLE_STATUS.free;
  const hasOrder = table.status === 'occupied';
  return (
    <TouchableOpacity style={[S.tableCard, { borderColor: cfg.color + '60' }]} onPress={onPress} activeOpacity={0.8}>
      <View style={[S.tableTop, { backgroundColor: cfg.bg }]}>
        <MaterialIcons name={cfg.icon} size={20} color={cfg.color} />
        <Text style={[S.tableNum, { color: cfg.color }]}>
          {table.name || `T${table.table_number}`}
        </Text>
        {table.order?.status === 'bill_requested' && (
          <View style={S.billDot} />
        )}
      </View>
      <View style={S.tableBottom}>
        <Text style={[S.tableStatus, { color: cfg.color }]}>{cfg.label}</Text>
        {hasOrder && table.order ? (
          <>
            <Text style={S.tableAmt}>{fmt(table.order.total_amount)}</Text>
            <Text style={S.tableElapsed}>{elapsed(table.order.created_at)}</Text>
          </>
        ) : (
          <Text style={S.tableSub}>{table.capacity || '—'} {t('cashier.tables.seats')}</Text>
        )}
      </View>
    </TouchableOpacity>
  );
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
    <View style={{ marginBottom: 12 }}>
      <Text style={S.input}>{label.toUpperCase()}</Text>
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

// ── Loan Due-Date Picker (calendar bottom sheet) ──────────────────────────────
function LoanDatePickerSheet({ current, onSelect, onClose, t }) {
  const todayObj = new Date();
  const [viewYear,  setViewYear]  = useState(todayObj.getFullYear());
  const [viewMonth, setViewMonth] = useState(todayObj.getMonth());

  const fmtDs = (d) => {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  };
  const todayStr = fmtDs(todayObj);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const firstDow  = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;
  const daysInMon = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMon; d++) cells.push(fmtDs(new Date(viewYear, viewMonth, d)));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const monthsShort = (() => {
    const m = t('datePicker.monthsShort');
    return Array.isArray(m) ? m : ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  })();
  const dayHdrs = (() => {
    const d = t('datePicker.days');
    return Array.isArray(d) ? d : ['Mo','Tu','We','Th','Fr','Sa','Su'];
  })();

  return (
    <View style={LD.sheet}>
      <View style={LD.header}>
        <MaterialIcons name="calendar-today" size={18} color="#0891B2" />
        <Text style={LD.title}>{t('cashier.orders.selectDueDate', 'Select due date')}</Text>
        <TouchableOpacity onPress={onClose} style={{ marginLeft: 'auto' }}>
          <MaterialIcons name="close" size={20} color={colors.neutralMid} />
        </TouchableOpacity>
      </View>
      <View style={LD.navRow}>
        <TouchableOpacity onPress={prevMonth} style={LD.arrow}><Text style={LD.arrowTxt}>‹</Text></TouchableOpacity>
        <Text style={LD.monthTitle}>{monthsShort[viewMonth]} {viewYear}</Text>
        <TouchableOpacity onPress={nextMonth} style={LD.arrow}><Text style={LD.arrowTxt}>›</Text></TouchableOpacity>
      </View>
      <View style={{ flexDirection: 'row', marginBottom: 4 }}>
        {dayHdrs.map((d, i) => (
          <View key={`${d}-${i}`} style={{ flex: 1, alignItems: 'center', paddingVertical: 4 }}>
            <Text style={LD.dayHdr}>{d}</Text>
          </View>
        ))}
      </View>
      {weeks.map((week, wi) => (
        <View key={wi} style={{ flexDirection: 'row' }}>
          {week.map((ds, di) => {
            if (!ds) return <View key={`e${di}`} style={{ flex: 1, aspectRatio: 1 }} />;
            const isSelected = ds === current;
            const isPast     = ds < todayStr;
            const isToday    = ds === todayStr;
            const bg = isSelected ? '#0891B2' : 'transparent';
            const txtColor = isSelected ? '#fff' : isPast ? colors.border : isToday ? '#0891B2' : colors.textDark;
            return (
              <TouchableOpacity
                key={ds}
                disabled={isPast}
                style={{ flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: bg, borderRadius: isSelected ? 9 : 0 }}
                onPress={() => onSelect(ds)}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 13, fontWeight: isSelected || isToday ? '800' : '400', color: txtColor }}>
                  {parseInt(ds.split('-')[2], 10)}
                </Text>
                {isToday && !isSelected && (
                  <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: '#0891B2', marginTop: 1 }} />
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
  sheet:      { backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.xl, paddingBottom: 32 },
  header:     { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md, gap: spacing.xs },
  title:      { fontSize: 16, fontWeight: '800', color: colors.textDark, marginLeft: 4 },
  navRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  arrow:      { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  arrowTxt:   { fontSize: 24, color: '#0891B2', fontWeight: '700', lineHeight: 28 },
  monthTitle: { fontSize: 15, fontWeight: '800', color: colors.textDark },
  dayHdr:     { fontSize: 11, fontWeight: '700', color: colors.neutralMid },
});

// ── Payment Sheet ─────────────────────────────────────────────────────────────
const getPayMethods = (t) => [
  { id: 'Cash',    label: t('paymentMethods.cash') },
  { id: 'Card',    label: t('paymentMethods.card') },
  { id: 'QR Code', label: t('paymentMethods.qrCode') },
  { id: 'Loan',    label: t('paymentMethods.loan') },
];

function PaymentSheet({ order, visible, onClose, onPaid, setDialog, t }) {
  const [method,     setMethod]     = useState('Cash');
  const [cashGiven,  setCashGiven]  = useState('');
  const [cardOk,     setCardOk]     = useState(false);
  const [qrOk,       setQrOk]       = useState(false);
  const [loanName,   setLoanName]   = useState('');
  const [loanPhone,  setLoanPhone]  = useState('');
  const [loanDue,    setLoanDue]    = useState('');
  const [discMode,   setDiscMode]   = useState('percent'); // 'percent' | 'som'
  const [discValue,  setDiscValue]  = useState('');
  const [splitWays,  setSplitWays]  = useState(null);      // null | 2 | 3 | 4
  const [splitParts, setSplitParts] = useState([]);        // [{amount, method, paid, loanName, loanPhone, loanDueDate}]
  const [notes,      setNotes]      = useState('');
  const [paying,     setPaying]     = useState(false);
  const [showLoanCal,    setShowLoanCal]    = useState(false);   // main loan due date picker
  const [splitCalIndex,  setSplitCalIndex]  = useState(null);    // null | index of split part being edited

  const orderItems = Array.isArray(order?.items) ? order.items : [];
  const itemsCount = orderItems.reduce((s, it) => s + (parseFloat(it.quantity) || 0), 0);

  const total   = parseFloat(order?.total_amount || 0);
  const disc    = discMode === 'percent'
    ? Math.min(total, (total * Math.min(parseFloat(discValue) || 0, 100)) / 100)
    : Math.min(total, Math.max(0, parseFloat(discValue) || 0));
  const toPay   = Math.max(0, total - disc);
  const change  = Math.max(0, (parseFloat(cashGiven) || 0) - toPay);
  const perPart = splitWays ? Math.ceil(toPay / splitWays) : 0;
  const splitTotal = splitParts.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);

  useEffect(() => {
    if (visible) {
      setMethod('Cash'); setCashGiven(''); setCardOk(false); setQrOk(false);
      setLoanName(''); setLoanPhone(''); setLoanDue('');
      setDiscMode('percent'); setDiscValue(''); setSplitWays(null);
      setSplitParts([]);
      setNotes(''); setPaying(false);
      setShowLoanCal(false); setSplitCalIndex(null);
    }
  }, [visible]);

  // Initialize split parts when user picks a split count
  useEffect(() => {
    if (splitWays && splitWays > 0) {
      const each = Math.ceil(toPay / splitWays);
      setSplitParts(Array.from({ length: splitWays }, () => ({
        amount: String(each),
        method: 'cash',
        paid: false,
        loanName: '',
        loanPhone: '',
        loanDueDate: '',
      })));
    } else {
      setSplitParts([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [splitWays]);

  const updatePart = (i, field, value) => {
    setSplitParts(prev => prev.map((p, idx) => idx === i ? { ...p, [field]: value } : p));
  };

  const canPay = () => {
    if (method === 'Cash')    return (parseFloat(cashGiven) || 0) >= toPay;
    if (method === 'Card')    return cardOk;
    if (method === 'QR Code') return qrOk;
    if (method === 'Loan')    return loanName.trim().length > 0 && loanDue.length >= 8;
    return false;
  };

  const handlePay = async () => {
    if (!canPay()) return;
    setPaying(true);
    try {
      const payload = {
        payment_method:  METHOD_MAP[method] || method.toLowerCase(),
        discount_amount: disc > 0 ? disc : 0,
      };
      if (notes.trim()) payload.notes = notes.trim();
      if (method === 'Loan') {
        payload.loan_customer_name  = loanName;
        payload.loan_customer_phone = loanPhone;
        payload.loan_due_date       = loanDue;
      }
      await ordersAPI.pay(order.id, payload);
      onPaid();
    } catch (e) {
      setDialog({ title: t('common.error'), message: e?.response?.data?.error || t('cashier.tables.paymentFailed'), type: 'error' });
    } finally { setPaying(false); }
  };

  const activeMethod = getPayMethods(t).find(m => m.id === method);

  if (!order) return null;
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={S.payModal} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={S.payHeader}>
          <View style={S.payHeaderIcon}>
            <MaterialIcons name="credit-card" size={22} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={S.payHeaderTitle}>{t('cashier.tables.collectPayment')}</Text>
            <Text style={S.payHeaderSub}>
              {order?.order_number ? `#${order.order_number} · ` : ''}{order.table_name || order.customer_name || t('cashier.orders.walkIn')}
            </Text>
          </View>
          <TouchableOpacity style={S.payHeaderClose} onPress={onClose}>
            <MaterialIcons name="close" size={24} color={colors.neutralMid} />
          </TouchableOpacity>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>

          {/* Payment method cards */}
          <Text style={S.secLbl}>{t('cashier.tables.paymentMethod')}</Text>
          <View style={S.pmGrid}>
            {getPayMethods(t).map(m => {
              const on = method === m.id;
              const iconName = m.id === 'Cash' ? 'payments' : m.id === 'Card' ? 'credit-card' : m.id === 'QR Code' ? 'qr-code-2' : 'account-balance-wallet';
              return (
                <TouchableOpacity key={m.id} style={[S.pmCard, on && S.pmCardActive]} onPress={() => setMethod(m.id)}>
                  <MaterialIcons name={iconName} size={22} color={on ? colors.primary : colors.neutralMid} />
                  <Text style={[S.pmCardTxt, on && S.pmCardTxtActive]}>{m.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Amount received (cash) */}
          {method === 'Cash' && (
            <View style={{ marginTop: spacing.lg }}>
              <Text style={S.secLbl}>{t('cashier.orders.amountReceived', 'Amount received')}</Text>
              <TextInput
                style={S.amtInput}
                placeholder={String(Math.round(toPay))}
                placeholderTextColor={colors.neutralMid}
                keyboardType="numeric"
                value={cashGiven}
                onChangeText={setCashGiven}
              />
              <View style={[S.amtChangePill, change > 0 ? S.amtChangeOn : S.amtChangeIdle]}>
                <Text style={[S.amtChangeLbl, { color: change > 0 ? '#16A34A' : colors.neutralMid }]}>
                  {t('cashier.orders.changeToGive', 'Change to give')}
                </Text>
                <Text style={[S.amtChangeVal, { color: change > 0 ? '#16A34A' : colors.neutralMid }]}>{fmt(change)}</Text>
              </View>
            </View>
          )}

          {/* Discount + Split row */}
          <View style={[S.twoCol, { marginTop: spacing.lg }]}>
            <View style={S.col}>
              <Text style={S.secLbl}>{t('cashier.orders.applyDiscount', 'Apply discount')}</Text>
              <View style={S.modeTabs}>
                {['percent', 'som'].map(mode => (
                  <TouchableOpacity
                    key={mode}
                    style={[S.modeTab, discMode === mode && S.modeTabActive]}
                    onPress={() => { setDiscMode(mode); setDiscValue(''); }}
                  >
                    <Text style={[S.modeTabTxt, discMode === mode && S.modeTabTxtActive]}>
                      {mode === 'percent' ? '%' : "So'm"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={S.inputWrap}>
                <TextInput
                  style={S.inputInner}
                  placeholder={discMode === 'percent' ? '0 — 100' : '0'}
                  placeholderTextColor={colors.neutralMid}
                  keyboardType="numeric"
                  value={discValue}
                  onChangeText={setDiscValue}
                />
                <Text style={S.inputSuffix}>{discMode === 'percent' ? '%' : "so'm"}</Text>
              </View>
              {disc > 0 && <Text style={S.discApplied}>-{fmt(disc)}</Text>}
            </View>
            <View style={S.col}>
              <Text style={S.secLbl}>{t('cashier.orders.splitBill', 'Split bill')}</Text>
              <View style={S.splitRow}>
                {[2, 3, 4].map(n => {
                  const on = splitWays === n;
                  return (
                    <TouchableOpacity
                      key={n}
                      style={[S.splitBtn, on && S.splitBtnActive]}
                      onPress={() => setSplitWays(on ? null : n)}
                    >
                      <Text style={[S.splitBtnTxt, on && S.splitBtnTxtActive]}>{n}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>
          {splitWays && splitParts.length > 0 && (
            <View style={S.splitParts}>
              {splitParts.map((part, i) => {
                const partMethods = [
                  { key: 'cash',    label: t('paymentMethods.cash',   'Cash'),  icon: 'payments' },
                  { key: 'card',    label: t('paymentMethods.card',   'Card'),  icon: 'credit-card' },
                  { key: 'qr_code', label: t('paymentMethods.qrCode', 'QR'),    icon: 'qr-code-2' },
                  { key: 'loan',    label: t('paymentMethods.loan',   'Loan'),  icon: 'account-balance-wallet' },
                ];
                return (
                  <View key={i} style={S.splitPartCard}>
                    {/* Header: Part N + paid checkbox */}
                    <View style={S.splitPartHeader}>
                      <Text style={S.splitPartLbl}>{t('cashier.orders.part', 'Part')} {i + 1}</Text>
                      <TouchableOpacity
                        style={S.splitPaidRow}
                        activeOpacity={0.7}
                        onPress={() => updatePart(i, 'paid', !part.paid)}
                      >
                        <View style={[S.splitPaidBox, part.paid && S.splitPaidBoxOn]}>
                          {part.paid && <MaterialIcons name="check" size={11} color="#fff" />}
                        </View>
                        <Text style={[S.splitPaidLbl, part.paid && { color: colors.success }]}>
                          {t('cashier.orders.paid', 'Paid')}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {/* Amount input */}
                    <View style={[S.inputWrap, { marginBottom: 8 }]}>
                      <TextInput
                        style={S.inputInner}
                        keyboardType="numeric"
                        value={part.amount}
                        onChangeText={v => updatePart(i, 'amount', v.replace(/[^0-9.]/g, ''))}
                        placeholder={String(perPart)}
                        placeholderTextColor={colors.neutralMid}
                      />
                      <Text style={S.inputSuffix}>so'm</Text>
                    </View>

                    {/* Per-part method buttons */}
                    <View style={S.splitMethodRow}>
                      {partMethods.map(pm => {
                        const on = part.method === pm.key;
                        return (
                          <TouchableOpacity
                            key={pm.key}
                            style={[S.splitMethodBtn, on && S.splitMethodBtnActive]}
                            onPress={() => updatePart(i, 'method', pm.key)}
                          >
                            <MaterialIcons name={pm.icon} size={14} color={on ? '#fff' : colors.neutralMid} />
                            <Text style={[S.splitMethodTxt, on && S.splitMethodTxtActive]}>{pm.label}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {/* Conditional loan fields */}
                    {part.method === 'loan' && (
                      <View style={S.splitLoanWrap}>
                        <TextInput
                          style={S.splitLoanInput}
                          placeholder={t('placeholders.customerNameReq', 'Customer name *')}
                          placeholderTextColor={colors.neutralMid}
                          value={part.loanName}
                          onChangeText={v => updatePart(i, 'loanName', v)}
                        />
                        <TextInput
                          style={S.splitLoanInput}
                          placeholder={t('common.phone', 'Phone')}
                          placeholderTextColor={colors.neutralMid}
                          keyboardType="phone-pad"
                          value={part.loanPhone}
                          onChangeText={v => updatePart(i, 'loanPhone', v)}
                        />
                        <TouchableOpacity
                          style={[S.splitLoanInput, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                          onPress={() => setSplitCalIndex(i)}
                          activeOpacity={0.8}
                        >
                          <Text style={{ fontSize: 13, color: part.loanDueDate ? colors.textDark : colors.neutralMid }}>
                            {part.loanDueDate || t('cashier.orders.selectDueDate', 'Select due date')}
                          </Text>
                          <MaterialIcons name="calendar-today" size={16} color={colors.neutralMid} />
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              })}

              {/* Split totals validation */}
              <View style={[S.splitTotalsRow, Math.abs(splitTotal - toPay) > 1 && S.splitTotalsErr]}>
                <Text style={S.splitTotalsLbl}>
                  {t('cashier.orders.splitTotal', 'Split total')}: <Text style={S.splitTotalsVal}>{fmt(splitTotal)}</Text>
                </Text>
                <Text style={S.splitTotalsLbl}>
                  {t('common.total', 'Total')}: <Text style={S.splitTotalsVal}>{fmt(toPay)}</Text>
                </Text>
              </View>
            </View>
          )}

          {/* Card confirm */}
          {method === 'Card' && (
            <TouchableOpacity style={[S.confirmRow, cardOk && S.confirmRowOk, { marginTop: spacing.lg }]} onPress={() => setCardOk(!cardOk)}>
              <View style={[S.checkbox, cardOk && S.checkboxOk]}>
                {cardOk && <MaterialIcons name="check" size={13} color="#fff" />}
              </View>
              <Text style={S.confirmLbl}>{t('cashier.tables.paymentConfirmedOnTerminal', 'Payment confirmed on terminal')}</Text>
            </TouchableOpacity>
          )}

          {/* QR confirm */}
          {method === 'QR Code' && (
            <View style={{ marginTop: spacing.lg }}>
              <View style={S.qrBox}>
                <MaterialIcons name="qr-code-2" size={64} color={colors.border} />
                <Text style={S.qrLbl}>{t('cashier.tables.customerScansToPay', 'Customer scans to pay')}</Text>
              </View>
              <TouchableOpacity style={[S.confirmRow, qrOk && S.confirmRowOk]} onPress={() => setQrOk(!qrOk)}>
                <View style={[S.checkbox, qrOk && S.checkboxOk]}>
                  {qrOk && <MaterialIcons name="check" size={13} color="#fff" />}
                </View>
                <Text style={S.confirmLbl}>{t('cashier.tables.qrPaymentConfirmed', 'QR payment confirmed')}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Loan fields */}
          {method === 'Loan' && (
            <View style={{ marginTop: spacing.lg }}>
              <View style={S.loanBanner}>
                <MaterialIcons name="warning-amber" size={16} color="#92400E" />
                <Text style={S.loanBannerTxt}>{t('cashier.orders.loanNotice', 'Loan records the debt. Money is collected later.')}</Text>
              </View>
              <TextInput style={S.input} placeholder={t('placeholders.customerNameReq', 'Customer name *')} placeholderTextColor={colors.neutralMid} value={loanName} onChangeText={setLoanName} />
              <PhoneField label={t('common.phone', 'Phone number')} value={loanPhone} onChange={setLoanPhone} />
              <TouchableOpacity
                style={[S.input, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm }]}
                onPress={() => setShowLoanCal(true)}
                activeOpacity={0.8}
              >
                <Text style={{ fontSize: 14, color: loanDue ? colors.textDark : colors.neutralMid }}>
                  {loanDue || t('cashier.orders.selectDueDate', 'Select due date')}
                </Text>
                <MaterialIcons name="calendar-today" size={18} color={colors.neutralMid} />
              </TouchableOpacity>
            </View>
          )}

          {/* Order summary */}
          <View style={[S.summaryCard, { marginTop: spacing.lg }]}>
            <View style={S.summaryHeader}>
              <Text style={S.summaryHeaderLbl}>{t('cashier.orders.orderItems', 'Order items')}</Text>
              <Text style={S.summaryHeaderCount}>{Math.round(itemsCount)} {t('common.items', 'items')}</Text>
            </View>
            {orderItems.length === 0 ? (
              <Text style={S.summaryEmpty}>{t('common.noResults', '—')}</Text>
            ) : orderItems.map((it, i) => {
              const p = parseFloat(it.unit_price || it.price || 0);
              const q = parseFloat(it.quantity) || 1;
              return (
                <View key={i} style={[S.summaryItem, i < orderItems.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.neutralLight }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={S.summaryItemName} numberOfLines={1}>{it.name || it.menu_item_name || '—'}</Text>
                    <Text style={S.summaryItemQty}>{fmt(p)} × {q}</Text>
                  </View>
                  <Text style={S.summaryItemPrice}>{fmt(p * q)}</Text>
                </View>
              );
            })}
            <View style={S.summaryTotals}>
              <View style={S.summaryTotalRow}>
                <Text style={S.summaryTotalLbl}>{t('common.subtotal', 'Subtotal')}</Text>
                <Text style={S.summaryTotalVal}>{fmt(total)}</Text>
              </View>
              {disc > 0 && (
                <View style={S.summaryTotalRow}>
                  <Text style={[S.summaryTotalLbl, S.summaryDisc]}>{t('common.discount', 'Discount')}</Text>
                  <Text style={[S.summaryTotalVal, S.summaryDisc]}>-{fmt(disc)}</Text>
                </View>
              )}
              <View style={[S.summaryTotalRow, S.summaryGrandRow]}>
                <Text style={S.summaryGrandLbl}>{t('common.total', 'Total')}</Text>
                <Text style={S.summaryGrandVal}>{fmt(toPay)}</Text>
              </View>
            </View>
          </View>

          {/* Method indicator */}
          <View style={S.methodIndicator}>
            <MaterialIcons
              name={method === 'Cash' ? 'payments' : method === 'Card' ? 'credit-card' : method === 'QR Code' ? 'qr-code-2' : 'account-balance-wallet'}
              size={18}
              color={colors.primary}
            />
            <Text style={S.methodIndicatorTxt}>{activeMethod?.label}</Text>
            {splitWays ? <Text style={S.methodIndicatorSub}> · {splitWays} {t('cashier.orders.ways', 'ways')}</Text> : null}
          </View>

          {/* Notes */}
          <View style={{ marginTop: spacing.lg }}>
            <Text style={S.secLbl}>{t('common.notes', 'Notes')}</Text>
            <TextInput
              style={S.notesInput}
              placeholder={t('cashier.orders.addPaymentNotes', 'Add payment notes…')}
              placeholderTextColor={colors.neutralMid}
              value={notes}
              onChangeText={setNotes}
              multiline
            />
          </View>

        </ScrollView>

        {/* Footer */}
        <View style={S.payFooter}>
          <TouchableOpacity
            style={[S.payCta, (!canPay() || paying) && { opacity: 0.5 }]}
            onPress={handlePay}
            disabled={!canPay() || paying}
          >
            {paying
              ? <ActivityIndicator color="#fff" />
              : <>
                  <MaterialIcons name="check-circle" size={20} color="#4ADE80" />
                  <Text style={S.payCtaTxt}>{t('cashier.orders.confirmPayment', 'Confirm payment')} · {fmt(toPay)}</Text>
                </>
            }
          </TouchableOpacity>
          <TouchableOpacity style={S.payCancel} onPress={onClose}>
            <Text style={S.payCancelTxt}>{t('common.cancel', 'Cancel')}</Text>
          </TouchableOpacity>
        </View>

        {/* Main loan due-date picker */}
        <Modal visible={showLoanCal} transparent animationType="slide" onRequestClose={() => setShowLoanCal(false)}>
          <TouchableOpacity style={S.calMask} activeOpacity={1} onPress={() => setShowLoanCal(false)} />
          <LoanDatePickerSheet
            current={loanDue}
            onSelect={(ds) => { setLoanDue(ds); setShowLoanCal(false); }}
            onClose={() => setShowLoanCal(false)}
            t={t}
          />
        </Modal>

        {/* Per-part split loan due-date picker */}
        <Modal visible={splitCalIndex !== null} transparent animationType="slide" onRequestClose={() => setSplitCalIndex(null)}>
          <TouchableOpacity style={S.calMask} activeOpacity={1} onPress={() => setSplitCalIndex(null)} />
          {splitCalIndex !== null && (
            <LoanDatePickerSheet
              current={splitParts[splitCalIndex]?.loanDueDate || ''}
              onSelect={(ds) => { updatePart(splitCalIndex, 'loanDueDate', ds); setSplitCalIndex(null); }}
              onClose={() => setSplitCalIndex(null)}
              t={t}
            />
          )}
        </Modal>
      </SafeAreaView>
    </Modal>
  );
}

// ── Table Detail Modal ─────────────────────────────────────────────────────────
function TableDetail({ table, order, onClose, onAddItems, onPaid, onNewOrder, navigation, setDialog }) {
  const { t } = useTranslation();
  const [showPay, setShowPay] = useState(false);
  const [fullOrder, setFullOrder] = useState(null);

  // Fetch full order (with items) when this detail opens for a table that has an order.
  // The summary order from the tables list does NOT include items, so we need to fetch.
  useEffect(() => {
    let cancelled = false;
    if (order?.id) {
      ordersAPI.getById(order.id)
        .then(res => { if (!cancelled) setFullOrder(res.data || null); })
        .catch(() => { /* keep summary */ });
    } else {
      setFullOrder(null);
    }
    return () => { cancelled = true; };
  }, [order?.id]);

  const orderForUI = fullOrder || order;

  const handlePaid = () => {
    setShowPay(false);
    onPaid();
  };

  if (!table) return null;

  const hasOrder     = !!orderForUI;
  const billRequested = orderForUI?.status === 'bill_requested';
  const isPaid       = orderForUI?.status === 'paid';
  const canPay       = hasOrder && !isPaid;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={S.mask} activeOpacity={1} onPress={onClose} />
      <View style={S.detailSheet}>
        <View style={S.sheetHandle} />

        {/* Header */}
        <View style={S.detailHeader}>
          <View>
            <Text style={S.detailTitle}>{table.name || `Table ${table.table_number}`}</Text>
            {table.capacity ? <Text style={S.detailSub}>{table.capacity} seats</Text> : null}
          </View>
          <TouchableOpacity style={S.closeBtn} onPress={onClose}>
            <MaterialIcons name="close" size={20} color={colors.neutralMid} />
          </TouchableOpacity>
        </View>

        {billRequested && (
          <View style={S.billBanner}>
            <MaterialIcons name="receipt-long" size={16} color="#7C3AED" />
            <Text style={S.billBannerTxt}>{t('cashier.tables.billRequestedByWaitress', 'Bill requested by waitress')}</Text>
          </View>
        )}

        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 24 }}>
          {hasOrder ? (
            <>
              {/* Order summary */}
              <View style={S.orderSummary}>
                <View style={S.summaryRow}>
                  <Text style={S.summaryLbl}>{t('cashier.tables.order', 'Order')}</Text>
                  <Text style={S.summaryVal}>
                    {orderForUI.daily_number ? `#${orderForUI.daily_number}` : orderForUI.id?.slice(-6)}
                  </Text>
                </View>
                <View style={S.summaryRow}>
                  <Text style={S.summaryLbl}>{t('cashier.tables.guests', 'Guests')}</Text>
                  <Text style={S.summaryVal}>{orderForUI.guest_count || '—'}</Text>
                </View>
                <View style={S.summaryRow}>
                  <Text style={S.summaryLbl}>{t('cashier.tables.waiter', 'Waiter')}</Text>
                  <Text style={S.summaryVal}>{orderForUI.waitress_name || 'Cashier'}</Text>
                </View>
                <View style={S.summaryRow}>
                  <Text style={S.summaryLbl}>{t('cashier.tables.time', 'Time')}</Text>
                  <Text style={S.summaryVal}>{elapsed(orderForUI.created_at)}</Text>
                </View>
              </View>

              {/* Items */}
              <Text style={S.sectionLabel}>{t('cashier.tables.orderItems', 'ORDER ITEMS')}</Text>
              {(orderForUI.items || []).map((item, i) => (
                <View key={i} style={S.itemRow}>
                  <Text style={S.itemName}>{item.name || item.menu_item_name || '—'}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={S.itemQty}>×{item.quantity}</Text>
                    <Text style={S.itemPrice}>{fmt((item.unit_price || 0) * item.quantity)}</Text>
                  </View>
                </View>
              ))}

              {/* Total */}
              <View style={S.totalRow}>
                <Text style={S.totalLbl}>{t('cashier.tables.total', 'Total')}</Text>
                <Text style={S.totalAmt}>{fmt(orderForUI.total_amount)}</Text>
              </View>

              {/* Actions */}
              <View style={S.actionBtns}>
                {canPay && (
                  <TouchableOpacity
                    style={S.payNowBtn}
                    onPress={() => {
                      onClose();
                      navigation.navigate('CashierOrders', {
                        openPayForOrderId: orderForUI.id,
                        autoPay: true,
                      });
                    }}
                  >
                    <MaterialIcons name="payments" size={18} color="#fff" />
                    <Text style={S.payNowTxt}>{t('cashier.tables.collectPayment', 'Collect Payment')}</Text>
                  </TouchableOpacity>
                )}
                {!isPaid && (
                  <TouchableOpacity
                    style={S.addItemsBtn}
                    onPress={() => { onClose(); onAddItems(table, orderForUI); }}
                  >
                    <MaterialIcons name="add" size={18} color={colors.primary} />
                    <Text style={S.addItemsTxt}>{t('cashier.tables.addItems', 'Add Items')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </>
          ) : table.status === 'reserved' ? (
            /* Reserved table — show reservation details */
            <View style={S.reservedWrap}>
              {/* Banner */}
              <View style={S.reservedBanner}>
                <MaterialIcons name="event-note" size={22} color="#7C3AED" />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={S.reservedBannerTitle}>{t('cashier.tables.tableReserved', 'Table Reserved')}</Text>
                  <Text style={S.reservedBannerSub}>{t('cashier.tables.upcomingReservation', 'Upcoming reservation')}</Text>
                </View>
              </View>

              {/* Info rows */}
              {[
                { icon: 'person', label: 'Guest Name', value: table.reservationGuest || 'Not specified' },
                { icon: 'people', label: 'Party Size', value: table.capacity ? `${table.capacity} seats` : '—' },
                { icon: 'schedule', label: 'Reserved For', value: (() => {
                  const rt = table.reservationTime;
                  if (!rt) return '—';
                  const d = new Date(rt);
                  if (isNaN(d.getTime())) return rt;
                  return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}  ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
                })() },
                ...(table.reservationPhone ? [{ icon: 'phone', label: 'Phone', value: table.reservationPhone }] : []),
              ].map(({ icon, label, value }) => (
                <View key={label} style={S.reservedRow}>
                  <View style={S.reservedRowIcon}>
                    <MaterialIcons name={icon} size={16} color="#7C3AED" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={S.reservedRowLabel}>{label}</Text>
                    <Text style={S.reservedRowValue}>{value}</Text>
                  </View>
                </View>
              ))}

              {/* Start order button */}
              <TouchableOpacity
                style={S.newOrderBtn}
                onPress={() => { onClose(); onNewOrder(table); }}
              >
                <MaterialIcons name="add-circle-outline" size={18} color="#fff" />
                <Text style={S.newOrderTxt}>Party Arrived — Start Order</Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* No active order — free table */
            <View style={S.noOrderWrap}>
              <MaterialIcons name="table-restaurant" size={48} color={colors.border} />
              <Text style={S.noOrderTxt}>{t('cashier.tables.noActiveOrder', 'No active order')}</Text>
              <Text style={S.noOrderSub}>{t('cashier.tables.startNewOrder', 'Start a new order for this table')}</Text>
              <TouchableOpacity
                style={S.newOrderBtn}
                onPress={() => { onClose(); onNewOrder(table); }}
              >
                <MaterialIcons name="add-circle-outline" size={18} color="#fff" />
                <Text style={S.newOrderTxt}>{t('nav.newOrder', 'New Order')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </View>

      <PaymentSheet
        order={orderForUI}
        visible={showPay}
        onClose={() => setShowPay(false)}
        onPaid={handlePaid}
        setDialog={setDialog}
        t={t}
      />
    </Modal>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN SCREEN
// ══════════════════════════════════════════════════════════════════════════════
export default function CashierTables({ navigation }) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [tables,     setTables]     = useState([]);
  const [orders,     setOrders]     = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selTable,   setSelTable]   = useState(null);
  const [menuCats,   setMenuCats]   = useState([]);
  const [menuItems,  setMenuItems]  = useState([]);
  const [dialog,     setDialog]     = useState(null);

  // ── Fetch tables + active orders ─────────────────────────────────────────
  const fetchAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [tRes, oRes] = await Promise.all([
        tablesAPI.getAll(),
        ordersAPI.getAll({ status: 'pending,sent_to_kitchen,preparing,ready,served,bill_requested' }),
      ]);
      const tableList = tRes.data || [];
      const orderList = oRes.data || [];
      // Attach the most recent active order to each table
      const enriched = tableList.map(t => ({
        ...t,
        order: orderList
          .filter(o => o.table_id === t.id)
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] || null,
      }));
      setTables(enriched);
      setOrders(orderList);
    } catch { /* silent */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  // ── Fetch menu (lazy, once) ───────────────────────────────────────────────
  const fetchMenu = useCallback(async () => {
    if (menuCats.length > 0) return;
    try {
      const [cRes, iRes] = await Promise.all([menuAPI.getCategories(), menuAPI.getItems()]);
      setMenuCats(cRes.data || []);
      setMenuItems(iRes.data || []);
    } catch { /* silent */ }
  }, [menuCats.length]);

  useEffect(() => { fetchAll(); fetchMenu(); }, []);

  useEffect(() => {
    const iv = setInterval(() => fetchAll(true), 5000);
    return () => clearInterval(iv);
  }, [fetchAll]);

  // ── Navigate to CashierWalkin to add items or create new order ────────────
  const handleAddItems = useCallback((table, order) => {
    navigation.navigate('CashierWalkin', { order });
  }, [navigation]);

  const handleNewOrder = useCallback((table) => {
    navigation.navigate('CashierWalkin', { prefillTable: table });
  }, [navigation]);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const occupied     = tables.filter(t => t.status === 'occupied').length;
  const billReqCount = tables.filter(t => t.order?.status === 'bill_requested').length;
  const free         = tables.filter(t => t.status === 'free').length;

  // Group tables by section for section-based rendering
  const sectionedData = useMemo(() => {
    const sectionMap = {};
    tables.forEach(t => {
      const key = (t.section || 'Main Floor').trim();
      if (!sectionMap[key]) sectionMap[key] = [];
      sectionMap[key].push(t);
    });
    return Object.entries(sectionMap).map(([title, data]) => {
      // group into rows of 3
      const rows = [];
      for (let i = 0; i < data.length; i += 3) {
        const row = data.slice(i, i + 3);
        while (row.length < 3) row.push({ id: `__filler_${title}_${i}_${row.length}`, _filler: true });
        rows.push({ id: `row_${title}_${i}`, items: row });
      }
      return { title, data: rows };
    });
  }, [tables]);

  const selectedTableOrder = selTable
    ? tables.find(t => t.id === selTable.id)?.order || null
    : null;

  if (loading) {
    return (
      <View style={S.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={S.page}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />
      {/* Header */}
      <View style={S.header}>
        <View>
          <Text style={S.headerTitle}>{t('nav.tables', 'Tables')}</Text>
          <Text style={S.headerSub}>
            {occupied} occupied · {free} free
            {billReqCount > 0 ? ` · ${billReqCount} awaiting payment` : ''}
          </Text>
        </View>
        <TouchableOpacity style={S.walkinBtn} onPress={() => navigation.navigate('CashierWalkin')}>
          <MaterialIcons name="add" size={18} color="#fff" />
          <Text style={S.walkinTxt}>Walk-in</Text>
        </TouchableOpacity>
      </View>

      {/* Stats strip */}
      <View style={S.statsStrip}>
        {[
          { label: 'Occupied',     val: occupied,     color: '#D97706', bg: '#FFFBEB' },
          { label: 'Free',         val: free,         color: '#16A34A', bg: '#F0FDF4' },
          { label: 'Bill Req.',    val: billReqCount, color: '#7C3AED', bg: '#F5F3FF' },
        ].map(s => (
          <View key={s.label} style={[S.statPill, { backgroundColor: s.bg }]}>
            <Text style={[S.statNum, { color: s.color }]}>{s.val}</Text>
            <Text style={[S.statLbl, { color: s.color }]}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Table grid — grouped by section */}
      <SectionList
        sections={sectionedData}
        keyExtractor={row => String(row.id)}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ padding: spacing.md, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchAll(); }} tintColor={colors.primary} />
        }
        renderSectionHeader={({ section }) => (
          <View style={S.sectionHeaderRow}>
            <View style={S.sectionHeaderLine} />
            <View style={S.sectionHeaderBadge}>
              <MaterialIcons name="place" size={12} color="#0891B2" style={{ marginRight: 4 }} />
              <Text style={S.sectionHeaderText}>{section.title.toUpperCase()}</Text>
            </View>
            <View style={S.sectionHeaderLine} />
          </View>
        )}
        renderItem={({ item: row }) => (
          <View style={S.tableRow}>
            {row.items.map(table =>
              table._filler
                ? <View key={table.id} style={{ flex: 1 }} />
                : <TableCard key={table.id} table={table} t={t} onPress={() => setSelTable(table)} />
            )}
          </View>
        )}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        ListEmptyComponent={
          <View style={S.center}>
            <MaterialIcons name="table-restaurant" size={48} color={colors.border} />
            <Text style={{ color: colors.neutralMid, marginTop: 12, fontSize: 15 }}>{t('cashier.walkin.noTablesFound', 'No tables found')}</Text>
          </View>
        }
      />

      {/* Table detail modal */}
      {selTable && (
        <TableDetail
          table={selTable}
          order={selectedTableOrder}
          onClose={() => setSelTable(null)}
          onAddItems={handleAddItems}
          onNewOrder={handleNewOrder}
          onPaid={() => { setSelTable(null); fetchAll(true); }}
          navigation={navigation}
          setDialog={setDialog}
        />
      )}
      <ConfirmDialog dialog={dialog} onClose={() => setDialog(null)} />
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  page:      { flex: 1, backgroundColor: colors.background },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },

  // Header
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.sm, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitle: { fontSize: 20, fontWeight: '800', color: colors.textDark },
  headerSub:   { fontSize: 12, color: colors.neutralMid, marginTop: 2 },
  walkinBtn:   { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.full },
  walkinTxt:   { color: '#fff', fontWeight: '700', fontSize: 13 },

  // Section headers
  sectionHeaderRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm, marginTop: spacing.sm },
  sectionHeaderLine:  { flex: 1, height: 1, backgroundColor: '#E5E7EB' },
  sectionHeaderBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BAE6FD', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, marginHorizontal: 8 },
  sectionHeaderText:  { fontSize: 11, fontWeight: '700', color: '#0891B2', letterSpacing: 0.8 },
  tableRow:           { flexDirection: 'row', gap: spacing.sm, marginBottom: 0 },

  // Stats strip
  statsStrip:  { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  statPill:    { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: radius.lg },
  statNum:     { fontSize: 18, fontWeight: '800' },
  statLbl:     { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 1 },

  // Table card
  tableCard:   { flex: 1, height: 128, backgroundColor: colors.white, borderRadius: radius.lg, overflow: 'hidden', ...shadow.card, borderWidth: 1.5 },
  tableTop:    { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.sm, gap: 3, position: 'relative' },
  tableNum:    { fontSize: 15, fontWeight: '800' },
  billDot:     { position: 'absolute', top: 6, right: 6, width: 8, height: 8, borderRadius: 4, backgroundColor: '#7C3AED' },
  tableBottom: { padding: spacing.sm, alignItems: 'center' },
  tableStatus: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
  tableAmt:    { fontSize: 12, fontWeight: '700', color: colors.textDark, marginTop: 2 },
  tableElapsed:{ fontSize: 10, color: colors.neutralMid },
  tableSub:    { fontSize: 10, color: colors.neutralMid },

  // Modal base
  mask:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', alignSelf: 'center', marginBottom: 16 },
  sectionLabel:{ fontSize: 11, fontWeight: '700', color: colors.neutralMid, letterSpacing: 0.5, marginBottom: 8 },

  // Detail sheet
  detailSheet:  { backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, maxHeight: '88%' },
  detailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.md },
  detailTitle:  { fontSize: 20, fontWeight: '800', color: colors.textDark },
  detailSub:    { fontSize: 13, color: colors.neutralMid, marginTop: 2 },
  closeBtn:     { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  billBanner:   { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F5F3FF', borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: '#DDD6FE' },
  billBannerTxt:{ color: '#7C3AED', fontWeight: '700', fontSize: 13, flex: 1 },
  orderSummary: { backgroundColor: colors.background, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md },
  summaryRow:   { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: colors.border },
  summaryLbl:   { fontSize: 13, color: colors.neutralMid },
  summaryVal:   { fontSize: 13, fontWeight: '700', color: colors.textDark },
  itemRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  itemName:     { flex: 1, fontSize: 14, color: colors.textDark, fontWeight: '500' },
  itemQty:      { fontSize: 13, color: colors.neutralMid },
  itemPrice:    { fontSize: 13, fontWeight: '700', color: colors.textDark, minWidth: 70, textAlign: 'right' },
  totalRow:     { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.md, marginTop: 4 },
  totalLbl:     { fontSize: 16, fontWeight: '700', color: colors.textDark },
  totalAmt:     { fontSize: 20, fontWeight: '800', color: colors.primary },
  actionBtns:   { gap: spacing.sm, marginTop: spacing.sm },
  payNowBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, borderRadius: radius.btn, paddingVertical: 14 },
  payNowTxt:    { color: '#fff', fontWeight: '800', fontSize: 15 },
  addItemsBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: radius.btn, paddingVertical: 12, borderWidth: 2, borderColor: colors.primary, backgroundColor: colors.primaryLight },
  addItemsTxt:  { color: colors.primary, fontWeight: '700', fontSize: 14 },
  noOrderWrap:  { alignItems: 'center', paddingVertical: 40 },
  noOrderTxt:   { fontSize: 17, fontWeight: '700', color: colors.textDark, marginTop: 12 },
  noOrderSub:   { fontSize: 13, color: colors.neutralMid, marginTop: 4 },
  newOrderBtn:  { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 14, borderRadius: radius.btn, marginTop: spacing.lg, justifyContent: 'center' },
  newOrderTxt:  { color: '#fff', fontWeight: '700', fontSize: 14 },

  // Reserved table styles
  reservedWrap:        { paddingBottom: 8 },
  reservedBanner:      { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F3FF', borderWidth: 2, borderColor: '#DDD6FE', borderRadius: 14, padding: 14, marginBottom: 16 },
  reservedBannerTitle: { fontSize: 15, fontWeight: '800', color: '#7C3AED' },
  reservedBannerSub:   { fontSize: 12, color: '#7C3AED', opacity: 0.7, marginTop: 1 },
  reservedRow:         { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderRadius: 12, borderWidth: 1, borderColor: '#F3F4F6', padding: 12, marginBottom: 10 },
  reservedRowIcon:     { width: 32, height: 32, borderRadius: 8, backgroundColor: '#EDE9FE', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  reservedRowLabel:    { fontSize: 10, fontWeight: '600', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5 },
  reservedRowValue:    { fontSize: 14, fontWeight: '700', color: '#111827', marginTop: 2 },

  // Payment sheet
  paySheet:     { backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, maxHeight: '90%' },
  sheetTitle:   { fontSize: 18, fontWeight: '800', color: colors.textDark, marginBottom: 2 },
  sheetSub:     { fontSize: 13, color: colors.neutralMid, marginBottom: spacing.lg },
  discRow:      { flexDirection: 'row', gap: spacing.sm, marginBottom: 8 },
  discBtn:      { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.background },
  discBtnActive:{ backgroundColor: colors.primary, borderColor: colors.primary },
  discTxt:      { fontSize: 13, fontWeight: '700', color: colors.neutralMid },
  discSummary:  { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: colors.primaryLight, borderRadius: radius.md, padding: spacing.md, marginBottom: 4 },
  discSummaryTxt:{ fontSize: 13, color: colors.primary, fontWeight: '600' },
  methodRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  methodBtn:    { flex: 1, minWidth: 70, alignItems: 'center', paddingVertical: 12, borderRadius: radius.md, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.background, gap: 4 },
  methodBtnActive:{ backgroundColor: colors.primary, borderColor: colors.primary },
  methodTxt:    { fontSize: 11, fontWeight: '700', color: colors.neutralMid },
  input:        { backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.md, fontSize: 14, borderWidth: 1.5, borderColor: colors.border, marginBottom: spacing.sm },
  changeBox:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F0FDF4', borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  changeLbl:    { fontSize: 14, color: '#16A34A', fontWeight: '600' },
  changeAmt:    { fontSize: 16, fontWeight: '800', color: '#16A34A' },
  confirmRow:   { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, borderWidth: 2, borderColor: colors.border, marginBottom: spacing.sm },
  confirmRowOk: { borderColor: colors.success, backgroundColor: '#F0FDF4' },
  checkbox:     { width: 20, height: 20, borderRadius: 4, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  checkboxOk:   { backgroundColor: colors.success, borderColor: colors.success },
  confirmLbl:   { flex: 1, fontSize: 13, color: colors.textDark },
  qrBox:        { borderWidth: 2, borderStyle: 'dashed', borderColor: colors.border, borderRadius: radius.md, height: 110, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  qrLbl:        { fontSize: 12, color: colors.neutralMid, marginTop: 4 },
  loanBanner:   { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: '#FFFBEB', borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: '#FDE68A' },
  loanBannerTxt:{ flex: 1, fontSize: 12, color: '#92400E' },
  payFooter:    { padding: spacing.lg, paddingBottom: spacing.md, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.border },
  payBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, borderRadius: radius.btn, paddingVertical: 15 },
  payBtnDisabled:{ backgroundColor: colors.border },
  payBtnTxt:    { color: '#fff', fontWeight: '800', fontSize: 15 },

  // ── Redesigned PaymentSheet (matches website style) ──────────────────────────
  payModal:         { flex: 1, backgroundColor: colors.background },
  payHeader:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border },
  payHeaderIcon:    { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md },
  payHeaderTitle:   { fontSize: 16, fontWeight: '800', color: colors.textDark },
  payHeaderSub:     { fontSize: 12, color: colors.neutralMid, marginTop: 2 },
  payHeaderClose:   { padding: 6, borderRadius: radius.sm },

  secLbl:           { fontSize: 11, fontWeight: '800', color: colors.neutralMid, letterSpacing: 0.8, marginBottom: 8, textTransform: 'uppercase' },

  pmGrid:           { flexDirection: 'row', gap: 8 },
  pmCard:           { flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: radius.md, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.white, gap: 6 },
  pmCardActive:     { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  pmCardTxt:        { fontSize: 12, fontWeight: '700', color: colors.neutralMid },
  pmCardTxtActive:  { color: colors.primary },

  amtInput:         { paddingHorizontal: spacing.md, paddingVertical: 14, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, fontSize: 18, fontWeight: '800', color: colors.textDark },
  amtChangePill:    { marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: 12, borderRadius: radius.md, borderWidth: 1 },
  amtChangeIdle:    { backgroundColor: colors.neutralLight, borderColor: colors.border },
  amtChangeOn:      { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' },
  amtChangeLbl:     { fontSize: 12, fontWeight: '600' },
  amtChangeVal:     { fontSize: 18, fontWeight: '800' },

  twoCol:           { flexDirection: 'row', gap: 12 },
  col:              { flex: 1 },

  modeTabs:         { flexDirection: 'row', gap: 6, marginBottom: 8 },
  modeTab:          { flex: 1, paddingVertical: 10, borderRadius: radius.sm, backgroundColor: colors.neutralLight, alignItems: 'center' },
  modeTabActive:    { backgroundColor: colors.primary },
  modeTabTxt:       { fontSize: 13, fontWeight: '800', color: colors.neutralMid },
  modeTabTxtActive: { color: '#fff' },

  inputWrap:        { position: 'relative' },
  inputInner:       { paddingLeft: spacing.md, paddingRight: 40, paddingVertical: 12, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, fontSize: 14, color: colors.textDark },
  inputSuffix:      { position: 'absolute', right: 12, top: 13, fontSize: 12, color: colors.neutralMid, fontWeight: '600' },
  discApplied:     { marginTop: 6, fontSize: 12, fontWeight: '700', color: colors.success },

  splitRow:         { flexDirection: 'row', gap: 6 },
  splitBtn:         { flex: 1, paddingVertical: 11, borderRadius: radius.sm, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.neutralLight, alignItems: 'center' },
  splitBtnActive:   { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  splitBtnTxt:      { fontSize: 13, fontWeight: '800', color: colors.neutralMid },
  splitBtnTxtActive:{ color: colors.primary },

  splitParts:       { marginTop: 10, gap: 8 },
  splitPart:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: 10, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm },
  splitPartLbl:     { fontSize: 13, fontWeight: '800', color: colors.textDark },
  splitPartVal:     { fontSize: 14, fontWeight: '800', color: colors.primary },

  // Per-part full picker
  splitPartCard:    { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 10 },
  splitPartHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  splitPaidRow:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.sm, backgroundColor: colors.neutralLight },
  splitPaidBox:     { width: 16, height: 16, borderRadius: 4, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white },
  splitPaidBoxOn:   { backgroundColor: colors.success, borderColor: colors.success },
  splitPaidLbl:     { fontSize: 11, fontWeight: '700', color: colors.neutralMid },
  splitMethodRow:   { flexDirection: 'row', gap: 4 },
  splitMethodBtn:   { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, borderRadius: radius.sm, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.white },
  splitMethodBtnActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  splitMethodTxt:   { fontSize: 11, fontWeight: '700', color: colors.neutralMid },
  splitMethodTxtActive: { color: '#fff' },
  splitLoanWrap:    { marginTop: 8, gap: 6 },
  splitLoanInput:   { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 13, color: colors.textDark },

  splitTotalsRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: 10, backgroundColor: colors.neutralLight, borderRadius: radius.sm, marginTop: 4 },
  splitTotalsErr:   { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA' },
  splitTotalsLbl:   { fontSize: 12, fontWeight: '600', color: colors.neutralMid },
  splitTotalsVal:   { fontWeight: '800', color: colors.textDark },

  summaryCard:      { backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  summaryHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.neutralLight },
  summaryHeaderLbl: { fontSize: 11, fontWeight: '800', color: colors.neutralMid, letterSpacing: 0.8 },
  summaryHeaderCount:{ fontSize: 12, fontWeight: '700', color: colors.primary },
  summaryEmpty:     { fontSize: 13, color: colors.neutralMid, textAlign: 'center', paddingVertical: 16 },
  summaryItem:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: 10 },
  summaryItemName:  { fontSize: 13, fontWeight: '600', color: colors.textDark },
  summaryItemQty:   { fontSize: 11, color: colors.neutralMid, marginTop: 2 },
  summaryItemPrice: { fontSize: 13, fontWeight: '700', color: colors.textDark, marginLeft: 12 },
  summaryTotals:    { paddingHorizontal: spacing.md, paddingVertical: spacing.md, gap: 8, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: '#FAFBFC' },
  summaryTotalRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryTotalLbl:  { fontSize: 13, color: colors.neutralMid },
  summaryTotalVal:  { fontSize: 13, fontWeight: '700', color: colors.textDark },
  summaryGrandRow:  { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 },
  summaryGrandLbl:  { fontSize: 14, fontWeight: '800', color: colors.textDark },
  summaryGrandVal:  { fontSize: 22, fontWeight: '900', color: colors.primary },
  summaryDisc:      { color: colors.success },

  methodIndicator:  { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: spacing.md, paddingVertical: 12, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  methodIndicatorTxt:{ fontSize: 13, fontWeight: '800', color: colors.textDark },
  methodIndicatorSub:{ fontSize: 12, color: colors.neutralMid },

  notesInput:       { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontSize: 14, color: colors.textDark, minHeight: 70, textAlignVertical: 'top' },

  payCta:           { backgroundColor: colors.textDark, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 15, borderRadius: radius.btn },
  payCtaTxt:        { color: '#fff', fontWeight: '800', fontSize: 15 },
  payCancel:        { alignItems: 'center', paddingVertical: 12, marginTop: 4 },
  payCancelTxt:     { color: colors.neutralMid, fontWeight: '600', fontSize: 14 },

  calMask:          { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
});

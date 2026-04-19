import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Modal, TextInput, ActivityIndicator, FlatList, StatusBar,
} from 'react-native';
import ConfirmDialog from '../../components/ConfirmDialog';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from '../../context/LanguageContext';
import { ordersAPI } from '../../api/client';
import { colors, spacing, radius, shadow, topInset } from '../../utils/theme';

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmt = (n) => Number(parseFloat(n) || 0).toLocaleString('uz-UZ') + " so'm";

const fmtOrderNum = (order) => {
  if (order?.daily_number) return `#${order.daily_number}`;
  const id = String(order?.id || '');
  return id.length >= 4 ? `#${id.slice(-4)}` : `#${id}`;
};

const dateTimeStr = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getDate().toString().padStart(2,'0')}.${(d.getMonth()+1).toString().padStart(2,'0')}.${d.getFullYear()}  ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
};

const fmtDate = (d) => {
  const dd = String(d.getDate()).padStart(2,'0');
  const mm = String(d.getMonth()+1).padStart(2,'0');
  return `${d.getFullYear()}-${mm}-${dd}`;
};

const today = new Date();
const TODAY_STR   = fmtDate(today);

const getMonday = (d) => {
  const date = new Date(d);
  date.setDate(date.getDate() - (date.getDay() + 6) % 7);
  return date;
};

const METHOD_ICONS  = { cash: 'payments', card: 'credit-card', 'qr code': 'qr-code', qr: 'qr-code' };

// ── Calendar Date Picker ───────────────────────────────────────────────────────
function CalendarPicker({ visible, onClose, period, onChange, t }) {
  const MONTH_NAMES = t('datePicker.months');
  const DAY_HDRS    = t('datePicker.days');
  const [viewYear,  setViewYear]  = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [tempFrom,  setTempFrom]  = useState(period.from);
  const [tempTo,    setTempTo]    = useState(period.to);
  const [step,      setStep]      = useState('from');

  useEffect(() => {
    if (visible) {
      setTempFrom(period.from);
      setTempTo(period.to);
      setStep('from');
      const d = new Date(period.from);
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
    }
  }, [visible]);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const handleDay = (ds) => {
    if (step === 'from') { setTempFrom(ds); setTempTo(ds); setStep('to'); }
    else {
      if (ds < tempFrom) { setTempTo(tempFrom); setTempFrom(ds); }
      else setTempTo(ds);
      setStep('from');
    }
  };

  const setPreset = (from, to) => {
    setTempFrom(from); setTempTo(to); setStep('from');
    const d = new Date(from);
    setViewYear(d.getFullYear()); setViewMonth(d.getMonth());
  };

  const firstDow  = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;
  const daysInMon = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMon; d++) cells.push(fmtDate(new Date(viewYear, viewMonth, d)));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const presets = [
    { label: t('cashier.history.today'),      from: TODAY_STR, to: TODAY_STR },
    { label: t('cashier.history.thisWeek'),  from: fmtDate(getMonday(today)), to: TODAY_STR },
    { label: t('cashier.history.thisMonth'), from: fmtDate(new Date(today.getFullYear(), today.getMonth(), 1)), to: TODAY_STR },
    { label: t('cashier.history.lastMonth'), from: fmtDate(new Date(today.getFullYear(), today.getMonth()-1, 1)), to: fmtDate(new Date(today.getFullYear(), today.getMonth(), 0)) },
  ];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={C.overlay}>
        <View style={C.sheet}>
          <View style={C.header}>
            <MaterialIcons name="calendar-today" size={20} color={colors.primary} />
            <Text style={C.headerTitle}>{t('cashier.history.selectPeriod')}</Text>
            <TouchableOpacity onPress={onClose} style={{ marginLeft: 'auto' }}>
              <MaterialIcons name="close" size={22} color={colors.neutralMid} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}>
            <View style={{ flexDirection: 'row', marginBottom: 12 }}>
              <TouchableOpacity onPress={() => setStep('from')} style={[C.pill, step === 'from' && C.pillActive]}>
                <Text style={C.pillLbl}>{t('cashier.history.from')}</Text>
                <Text style={C.pillVal}>{tempFrom}</Text>
              </TouchableOpacity>
              <View style={{ width: 24, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: colors.neutralMid, fontSize: 18 }}>→</Text>
              </View>
              <TouchableOpacity onPress={() => setStep('to')} style={[C.pill, step === 'to' && C.pillActive]}>
                <Text style={C.pillLbl}>{t('cashier.history.to')}</Text>
                <Text style={C.pillVal}>{tempTo}</Text>
              </TouchableOpacity>
            </View>
            <Text style={C.hint}>{step === 'from' ? t('cashier.history.tapDateStart') : t('cashier.history.tapDateEnd')}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <TouchableOpacity onPress={prevMonth} style={C.arrowBtn}><Text style={C.arrowTxt}>‹</Text></TouchableOpacity>
              <Text style={C.monthTitle}>{MONTH_NAMES[viewMonth]} {viewYear}</Text>
              <TouchableOpacity onPress={nextMonth} style={C.arrowBtn}><Text style={C.arrowTxt}>›</Text></TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row', marginBottom: 4 }}>
              {DAY_HDRS.map(d => (
                <View key={d} style={{ flex: 1, alignItems: 'center', paddingVertical: 4 }}>
                  <Text style={C.dayHdr}>{d}</Text>
                </View>
              ))}
            </View>
            {weeks.map((week, wi) => (
              <View key={wi} style={{ flexDirection: 'row' }}>
                {week.map((ds, di) => {
                  if (!ds) return <View key={`e${di}`} style={{ flex: 1, aspectRatio: 1 }} />;
                  const isFrom    = ds === tempFrom;
                  const isTo      = ds === tempTo && tempFrom !== tempTo;
                  const inRange   = ds > tempFrom && ds < tempTo;
                  const isTodayDs = ds === TODAY_STR;
                  const bg = (isFrom || isTo) ? colors.primary : inRange ? colors.primaryLight : 'transparent';
                  const txCol = (isFrom || isTo) ? '#fff' : inRange ? colors.primary : isTodayDs ? colors.primary : colors.textDark;
                  const fw = (isFrom || isTo || isTodayDs) ? '800' : '400';
                  const br = (isFrom || isTo) ? 9 : inRange ? 0 : 0;
                  return (
                    <TouchableOpacity
                      key={ds}
                      style={{ flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: bg, borderRadius: br }}
                      onPress={() => handleDay(ds)} activeOpacity={0.7}
                    >
                      <Text style={{ fontSize: 13, fontWeight: fw, color: txCol }}>
                        {parseInt(ds.split('-')[2], 10)}
                      </Text>
                      {isTodayDs && !isFrom && !isTo && (
                        <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: colors.primary, marginTop: 1 }} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
            <View style={C.presets}>
              {presets.map(p => (
                <TouchableOpacity key={p.label} style={C.presetBtn} onPress={() => setPreset(p.from, p.to)}>
                  <Text style={C.presetTxt}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={C.applyBtn}
              onPress={() => { onChange({ from: tempFrom, to: tempTo }); onClose(); }}
            >
              <Text style={C.applyTxt}>
                {t('cashier.history.apply')}: {tempFrom === tempTo ? tempFrom : `${tempFrom} → ${tempTo}`}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ── Filter Sheet ───────────────────────────────────────────────────────────────
function FilterSheet({ visible, onClose, filters, onChange, waitressOptions, tableOptions, t }) {
  const [local, setLocal] = useState(filters);

  useEffect(() => {
    if (visible) setLocal(filters);
  }, [visible]);

  const set = (key, val) => setLocal(prev => ({ ...prev, [key]: prev[key] === val ? '' : val }));
  const setTable = (val) => setLocal(prev => ({ ...prev, table: val }));
  const clearAll = () => setLocal({ waitress: '', table: '', method: '', status: '' });

  const METHODS = [
    { id: 'cash',    label: t('paymentMethods.cash'),    icon: 'payments'    },
    { id: 'card',    label: t('paymentMethods.card'),    icon: 'credit-card' },
    { id: 'qr',      label: 'QR',      icon: 'qr-code'     },
  ];
  const STATUSES = [
    { id: 'paid',     label: t('common.paid')     },
    { id: 'refunded', label: t('cashier.history.refunded') },
  ];

  const activeCount = Object.values(local).filter(Boolean).length;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={S.mask} onPress={onClose} activeOpacity={1} />
      <View style={[S.sheet, { maxHeight: '90%' }]}>
        {/* Header */}
        <View style={FS.header}>
          <Text style={FS.title}>{t('cashier.history.filters')}</Text>
          {activeCount > 0 && (
            <TouchableOpacity onPress={clearAll} style={FS.clearBtn}>
              <Text style={FS.clearTxt}>{t('cashier.history.clearAll')}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={onClose} style={{ marginLeft: 'auto' }}>
            <MaterialIcons name="close" size={22} color={colors.neutralMid} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 32 }}>
          {/* Payment Method */}
          <Text style={FS.sectionLbl}>{t('cashier.orders.paymentMethod')}</Text>
          <View style={FS.chipRow}>
            {METHODS.map(m => (
              <TouchableOpacity
                key={m.id}
                style={[FS.chip, local.method === m.id && FS.chipActive]}
                onPress={() => set('method', m.id)}
              >
                <MaterialIcons name={m.icon} size={14} color={local.method === m.id ? '#fff' : colors.neutralMid} />
                <Text style={[FS.chipTxt, local.method === m.id && FS.chipTxtActive]}>{m.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Status */}
          <Text style={[FS.sectionLbl, { marginTop: spacing.md }]}>{t('cashier.history.status')}</Text>
          <View style={FS.chipRow}>
            {STATUSES.map(s => (
              <TouchableOpacity
                key={s.id}
                style={[FS.chip, local.status === s.id && FS.chipActive]}
                onPress={() => set('status', s.id)}
              >
                <Text style={[FS.chipTxt, local.status === s.id && FS.chipTxtActive]}>{s.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Waitress */}
          {waitressOptions.length > 0 && (
            <>
              <Text style={[FS.sectionLbl, { marginTop: spacing.md }]}>{t('cashier.history.waitress')}</Text>
              <View style={FS.chipRow}>
                {waitressOptions.map(name => (
                  <TouchableOpacity
                    key={name}
                    style={[FS.chip, local.waitress === name && FS.chipActive]}
                    onPress={() => set('waitress', name)}
                  >
                    <Text style={[FS.chipTxt, local.waitress === name && FS.chipTxtActive]} numberOfLines={1}>{name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {/* Table */}
          {tableOptions.length > 0 && (
            <>
              <Text style={[FS.sectionLbl, { marginTop: spacing.md }]}>{t('cashier.history.table')}</Text>
              <View style={FS.chipRow}>
                {tableOptions.map(name => (
                  <TouchableOpacity
                    key={name}
                    style={[FS.chip, local.table === name && FS.chipActive]}
                    onPress={() => set('table', name)}
                  >
                    <Text style={[FS.chipTxt, local.table === name && FS.chipTxtActive]} numberOfLines={1}>{name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
        </ScrollView>

        {/* Apply */}
        <View style={{ padding: spacing.lg, paddingTop: 0 }}>
          <TouchableOpacity
            style={FS.applyBtn}
            onPress={() => { onChange(local); onClose(); }}
          >
            <Text style={FS.applyTxt}>
              {activeCount > 0 ? `${t('cashier.history.apply')} ${activeCount}` : t('cashier.history.apply')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── Order Detail Sheet ─────────────────────────────────────────────────────────
function OrderDetailSheet({ visible, order, onClose, onRefund, t }) {
  const [fullOrder, setFullOrder] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible && order) {
      setFullOrder(null);
      setLoading(true);
      ordersAPI.getById(order.id)
        .then(res => setFullOrder(res.data))
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [visible, order?.id]);

  if (!order) return null;

  const items = fullOrder?.items || [];
  const subtotal = items.reduce((s, x) => s + (parseFloat(x.unit_price || x.price) || 0) * (x.quantity || x.qty || 1), 0);
  const tax      = parseFloat(fullOrder?.tax_amount || order?.tax_amount) || 0;
  const disc     = parseFloat(fullOrder?.discount_amount ?? fullOrder?.discount ?? order?.discount_amount ?? order?.discount) || 0;
  const total    = parseFloat(fullOrder?.total_amount || order?.total_amount) || 0;

  const isRefunded = order.status === 'cancelled' || order.status === 'refunded';
  const waitressName = fullOrder?.waitress_name || order?.waitress_name || '—';
  const methodKey = (order.payment_method || 'cash').toLowerCase();
  const methodIcon = METHOD_ICONS[methodKey] || 'payments';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={S.mask} onPress={onClose} activeOpacity={1} />
      <View style={[S.sheet, { maxHeight: '88%' }]}>
        {/* Sheet header */}
        <View style={OD.header}>
          <View>
            <Text style={OD.orderNum}>{fmtOrderNum(order)}</Text>
            <Text style={OD.dateTime}>{dateTimeStr(order.paid_at || order.updated_at)}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <View style={[OD.badge, isRefunded ? OD.badgeRefund : OD.badgePaid]}>
              <Text style={[OD.badgeTxt, { color: isRefunded ? '#DC2626' : '#16A34A' }]}>
                {isRefunded ? t('cashier.history.refunded') : t('common.paid')}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <MaterialIcons name="close" size={22} color={colors.neutralMid} />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 32 }}>
          {/* Info row */}
          <View style={OD.infoCard}>
            <View style={OD.infoRow}>
              <View style={OD.infoItem}>
                <MaterialIcons name="table-restaurant" size={16} color={colors.neutralMid} />
                <View>
                  <Text style={OD.infoLbl}>{t('cashier.history.table')}</Text>
                  <Text style={OD.infoVal}>{order.table_name || t('cashier.orders.walkIn')}</Text>
                </View>
              </View>
              <View style={OD.infoItem}>
                <MaterialIcons name="person" size={16} color={colors.neutralMid} />
                <View>
                  <Text style={OD.infoLbl}>{t('cashier.history.waitress')}</Text>
                  <Text style={OD.infoVal}>{waitressName}</Text>
                </View>
              </View>
            </View>
            <View style={[OD.infoRow, { marginTop: spacing.sm }]}>
              <View style={OD.infoItem}>
                <MaterialIcons name={methodIcon} size={16} color={colors.neutralMid} />
                <View>
                  <Text style={OD.infoLbl}>{t('cashier.history.payment')}</Text>
                  <Text style={OD.infoVal} style={{ textTransform: 'capitalize' }}>
                    {order.payment_method || '—'}
                  </Text>
                </View>
              </View>
              {order.customer_name ? (
                <View style={OD.infoItem}>
                  <MaterialIcons name="person-outline" size={16} color={colors.neutralMid} />
                  <View>
                    <Text style={OD.infoLbl}>{t('cashier.history.customer')}</Text>
                    <Text style={OD.infoVal}>{order.customer_name}</Text>
                  </View>
                </View>
              ) : null}
            </View>
          </View>

          {/* Items */}
          <Text style={OD.secHead}>{t('cashier.orders.orderItems')}</Text>
          {loading ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
          ) : items.length === 0 ? (
            <Text style={{ color: colors.neutralMid, fontSize: 13, paddingVertical: 8 }}>{t('cashier.orders.noItemsFound')}</Text>
          ) : (
            <View style={OD.itemsCard}>
              {items.map((item, i) => {
                const price = parseFloat(item.unit_price || item.price) || 0;
                const qty   = item.quantity || item.qty || 1;
                const name  = item.name || item.menu_item_name || item.item_name || '—';
                return (
                  <View key={i} style={[OD.itemRow, i < items.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
                    <Text style={OD.itemName} numberOfLines={2}>{name}</Text>
                    <Text style={OD.itemQty}>×{qty}</Text>
                    <Text style={OD.itemAmt}>{fmt(price * qty)}</Text>
                  </View>
                );
              })}
            </View>
          )}

          {/* Totals */}
          <View style={OD.totalsCard}>
            <View style={OD.totRow}>
              <Text style={OD.totLbl}>{t('common.subtotal')}</Text>
              <Text style={OD.totVal}>{fmt(subtotal || total)}</Text>
            </View>
            {tax > 0 && (
              <View style={OD.totRow}>
                <Text style={OD.totLbl}>{t('cashier.orders.tax')}</Text>
                <Text style={OD.totVal}>{fmt(tax)}</Text>
              </View>
            )}
            {disc > 0 && (
              <View style={OD.totRow}>
                <Text style={[OD.totLbl, { color: colors.success }]}>{t('common.discount')}</Text>
                <Text style={[OD.totVal, { color: colors.success }]}>−{fmt(disc)}</Text>
              </View>
            )}
            <View style={[OD.totRow, OD.totRowBold]}>
              <Text style={OD.grandLbl}>{t('cashier.history.totalPaid')}</Text>
              <Text style={OD.grandAmt}>{fmt(total)}</Text>
            </View>
          </View>

          {/* Refund button */}
          {!isRefunded && (
            <TouchableOpacity
              style={OD.refundBtn}
              onPress={() => { onClose(); onRefund(order); }}
            >
              <MaterialIcons name="refresh" size={18} color={colors.danger} />
              <Text style={OD.refundTxt}>{t('cashier.history.processRefund')}</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── CashierHistory ─────────────────────────────────────────────────────────────
export default function CashierHistory() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const REFUND_REASONS = t('cashier.history.refundReasons');

  const defaultPeriod = {
    from: fmtDate(new Date(today.getFullYear(), today.getMonth(), today.getDate())),
    to:   TODAY_STR,
  };
  const [period,    setPeriod]    = useState(defaultPeriod);
  const [calOpen,   setCalOpen]   = useState(false);
  const [allPaid,   setAllPaid]   = useState([]);
  const [loading,   setLoading]   = useState(true);

  // Filter state
  const [filters,    setFilters]    = useState({ waitress: '', table: '', method: '', status: '' });
  const [filterOpen, setFilterOpen] = useState(false);

  // Detail sheet state
  const [detailOrder, setDetailOrder] = useState(null);
  const [detailOpen,  setDetailOpen]  = useState(false);

  // Refund state
  const [refundTarget,     setRefundTarget]     = useState(null);
  const [refundAmt,        setRefundAmt]        = useState('');
  const [refundReason,     setRefundReason]     = useState(REFUND_REASONS[0]);
  const [refunding,        setRefunding]        = useState(false);
  const [showReasonPicker, setShowReasonPicker] = useState(false);
  const [dialog,           setDialog]           = useState(null);

  const loadPaid = useCallback(async () => {
    try {
      const res = await ordersAPI.getAll({ status: 'paid,cancelled', from: period.from, to: period.to });
      setAllPaid(res.data || []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [period]);

  useEffect(() => { setLoading(true); loadPaid(); }, [loadPaid]);

  // Extract unique filter options from loaded data
  const waitressOptions = useMemo(() => {
    const names = [...new Set(allPaid.map(o => o.waitress_name).filter(Boolean))];
    return names.sort();
  }, [allPaid]);

  const tableOptions = useMemo(() => {
    const names = [...new Set(allPaid.map(o => o.table_name).filter(Boolean))];
    return names.sort();
  }, [allPaid]);

  // Apply filters
  const filtered = useMemo(() => {
    return allPaid.filter(o => {
      if (filters.waitress && o.waitress_name !== filters.waitress) return false;
      if (filters.table    && o.table_name !== filters.table) return false;
      if (filters.method) {
        const m = (o.payment_method || '').toLowerCase();
        if (filters.method === 'cash' && m !== 'cash') return false;
        if (filters.method === 'card' && m !== 'card') return false;
        if (filters.method === 'qr'   && !['qr','qr code'].includes(m)) return false;
      }
      if (filters.status) {
        const isRef = o.status === 'cancelled' || o.status === 'refunded';
        if (filters.status === 'paid'     && isRef)  return false;
        if (filters.status === 'refunded' && !isRef) return false;
      }
      return true;
    });
  }, [allPaid, filters]);

  const notRefunded  = filtered.filter(o => o.status !== 'refunded' && o.status !== 'cancelled');
  const totalRev     = notRefunded.reduce((s, o) => s + (parseFloat(o.total_amount) || 0), 0);
  const byCash       = notRefunded.filter(o => (o.payment_method||'').toLowerCase() === 'cash').reduce((s,o)=>s+(parseFloat(o.total_amount)||0),0);
  const byCard       = notRefunded.filter(o => (o.payment_method||'').toLowerCase() === 'card').reduce((s,o)=>s+(parseFloat(o.total_amount)||0),0);
  const byQr         = notRefunded.filter(o => ['qr code','qr'].includes((o.payment_method||'').toLowerCase())).reduce((s,o)=>s+(parseFloat(o.total_amount)||0),0);
  const totalDisc    = notRefunded.reduce((s, o) => s + (parseFloat(o.discount_amount ?? o.discount) || 0), 0);

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  const periodLabel = period.from === period.to ? period.from : `${period.from} → ${period.to}`;

  const openDetail = (order) => {
    setDetailOrder(order);
    setDetailOpen(true);
  };

  const openRefund = (order) => {
    setRefundTarget(order);
    setRefundAmt(String(order.total_amount || ''));
    setRefundReason(REFUND_REASONS[0]);
  };

  const confirmRefund = async () => {
    setRefunding(true);
    try {
      await ordersAPI.updateStatus(refundTarget.id, 'cancelled');
      setDialog({ title: t('cashier.history.refundProcessed'), message: t('cashier.history.adminNotified'), type: 'success' });
      setRefundTarget(null);
      loadPaid();
    } catch (e) {
      setDialog({ title: t('common.error'), message: e?.response?.data?.error || t('cashier.history.refundFailed'), type: 'error' });
    } finally { setRefunding(false); }
  };

  const FILTER_LABELS = {
    waitress: v => v,
    table:    v => `${t('cashier.history.table')}: ${v}`,
    method:   v => v === 'qr' ? t('paymentMethods.qrCode') : v.charAt(0).toUpperCase() + v.slice(1),
    status:   v => v.charAt(0).toUpperCase() + v.slice(1),
  };

  if (loading) return <ActivityIndicator style={{ flex: 1 }} size="large" color={colors.primary} />;

  return (
    <View style={{ flex: 1 }}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />
      <ScrollView style={S.page} contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingTop: topInset + spacing.sm, paddingBottom: 24, gap: spacing.md }}>

        {/* ── Period bar + filter button ─────────────────────────────────── */}
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <TouchableOpacity style={[S.periodBar, { flex: 1 }]} onPress={() => setCalOpen(true)} activeOpacity={0.85}>
            <MaterialIcons name="calendar-today" size={18} color={colors.primary} style={{ marginRight: 8 }} />
            <Text style={S.periodTxt} numberOfLines={1}>{periodLabel}</Text>
            <MaterialIcons name="keyboard-arrow-down" size={20} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity style={S.filterBtn} onPress={() => setFilterOpen(true)} activeOpacity={0.85}>
            <MaterialIcons name="tune" size={20} color={activeFilterCount > 0 ? colors.primary : colors.neutralMid} />
            {activeFilterCount > 0 && (
              <View style={S.filterBadge}>
                <Text style={S.filterBadgeTxt}>{activeFilterCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* ── Active filter chips ─────────────────────────────────────────── */}
        {activeFilterCount > 0 && (
          <View style={S.chipRow}>
            {Object.entries(filters).filter(([,v]) => v).map(([key, val]) => (
              <TouchableOpacity
                key={key}
                style={S.activeChip}
                onPress={() => setFilters(prev => ({ ...prev, [key]: '' }))}
              >
                <Text style={S.activeChipTxt}>{FILTER_LABELS[key]?.(val) ?? val}</Text>
                <MaterialIcons name="close" size={12} color={colors.primary} />
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => setFilters({ waitress: '', table: '', method: '', status: '' })}>
              <Text style={S.clearAllTxt}>{t('cashier.history.clearAll')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Summary cards ─────────────────────────────────────────────── */}
        <View style={S.summaryGrid}>
          <View style={S.summaryCard}>
            <Text style={S.summaryLbl}>{t('cashier.history.transactions')}</Text>
            <Text style={S.summaryVal}>{notRefunded.length}</Text>
          </View>
          <View style={S.summaryCard}>
            <Text style={S.summaryLbl}>{t('cashier.history.totalRevenue')}</Text>
            <Text style={[S.summaryVal, { color: colors.primary }]}>{fmt(totalRev)}</Text>
          </View>
        </View>

        {/* ── By method ─────────────────────────────────────────────────── */}
        <View style={S.methodCard}>
          <Text style={S.secHead}>{t('cashier.history.byPaymentMethod')}</Text>
          <View style={S.methodRow}>
            <View style={S.methodItem}>
              <MaterialIcons name="payments"    size={14} color={colors.neutralMid}/>
              <Text style={S.methodLbl}>{t('paymentMethods.cash')}</Text>
              <Text style={S.methodVal}>{fmt(byCash)}</Text>
            </View>
            <View style={S.methodItem}>
              <MaterialIcons name="credit-card" size={14} color={colors.neutralMid}/>
              <Text style={S.methodLbl}>{t('paymentMethods.card')}</Text>
              <Text style={S.methodVal}>{fmt(byCard)}</Text>
            </View>
            <View style={S.methodItem}>
              <MaterialIcons name="qr-code"     size={14} color={colors.neutralMid}/>
              <Text style={S.methodLbl}>QR</Text>
              <Text style={S.methodVal}>{fmt(byQr)}</Text>
            </View>
          </View>
          {totalDisc > 0 && (
            <Text style={S.discRow}>{t('cashier.history.totalDiscounts')}: <Text style={{ color: colors.warning, fontWeight: '700' }}>{fmt(totalDisc)}</Text></Text>
          )}
        </View>

        {/* ── Transactions list ──────────────────────────────────────────── */}
        <Text style={S.secHead}>
          {t('cashier.history.transactions')}
          {activeFilterCount > 0 ? ` (${filtered.length})` : ''}
        </Text>
        {filtered.length === 0 && (
          <View style={S.empty}>
            <MaterialIcons name="history" size={36} color={colors.border}/>
            <Text style={S.emptyTxt}>
              {activeFilterCount > 0 ? t('cashier.history.noTransactionsFilter') : t('cashier.history.noTransactionsPeriod')}
            </Text>
          </View>
        )}
        {filtered.map(order => {
          const methodKey  = (order.payment_method || 'cash').toLowerCase();
          const icon       = METHOD_ICONS[methodKey] || 'payments';
          const isRefunded = order.status === 'cancelled' || order.status === 'refunded';
          return (
            <TouchableOpacity
              key={order.id}
              style={S.txCard}
              onPress={() => openDetail(order)}
              activeOpacity={0.85}
            >
              <View style={S.txTop}>
                <View style={S.txLeft}>
                  <View style={S.txIcon}><MaterialIcons name={icon} size={16} color={colors.neutralMid}/></View>
                  <View>
                    <Text style={S.txId}>{fmtOrderNum(order)}</Text>
                    <Text style={S.txTable}>{order.table_name || t('cashier.orders.walkIn')}</Text>
                  </View>
                </View>
                <View style={S.txRight}>
                  <Text style={S.txAmt}>{fmt(order.total_amount)}</Text>
                  <View style={[S.txBadge, isRefunded ? S.txBadgeRefund : S.txBadgePaid]}>
                    <Text style={[S.txBadgeTxt, isRefunded ? { color: '#DC2626' } : { color: '#16A34A' }]}>
                      {isRefunded ? t('cashier.history.refunded') : t('common.paid')}
                    </Text>
                  </View>
                </View>
              </View>
              <View style={S.txBot}>
                <Text style={S.txDate}>{dateTimeStr(order.paid_at || order.updated_at)}</Text>
                {order.waitress_name ? <Text style={S.txWaitress}>{order.waitress_name}</Text> : null}
                <MaterialIcons name="chevron-right" size={16} color={colors.border} style={{ marginLeft: 'auto' }} />
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── Calendar picker ─────────────────────────────────────────────── */}
      <CalendarPicker
        visible={calOpen}
        onClose={() => setCalOpen(false)}
        period={period}
        onChange={(p) => { setPeriod(p); setCalOpen(false); }}
        t={t}
      />

      {/* ── Filter sheet ─────────────────────────────────────────────────── */}
      <FilterSheet
        visible={filterOpen}
        onClose={() => setFilterOpen(false)}
        filters={filters}
        onChange={(f) => setFilters(f)}
        waitressOptions={waitressOptions}
        tableOptions={tableOptions}
        t={t}
      />

      {/* ── Order detail sheet ────────────────────────────────────────────── */}
      <OrderDetailSheet
        visible={detailOpen}
        order={detailOrder}
        onClose={() => setDetailOpen(false)}
        onRefund={(o) => openRefund(o)}
        t={t}
      />

      {/* ── Refund sheet ─────────────────────────────────────────────────── */}
      <Modal visible={!!refundTarget} transparent animationType="slide" onRequestClose={() => setRefundTarget(null)}>
        <TouchableOpacity style={S.mask} onPress={() => setRefundTarget(null)} />
        <View style={S.sheet}>
          <Text style={S.sheetTitle}>{t('cashier.history.refund')} — {fmtOrderNum(refundTarget)}</Text>
          {refundTarget && (
            <>
              <View style={S.refundInfo}>
                <View style={S.infoRow}><Text style={S.infoLbl}>{t('cashier.history.table')}</Text><Text style={S.infoVal}>{refundTarget.table_name || t('cashier.orders.walkIn')}</Text></View>
                <View style={S.infoRow}><Text style={S.infoLbl}>{t('common.paid')}</Text><Text style={S.infoVal}>{fmt(refundTarget.total_amount)}</Text></View>
                <View style={S.infoRow}><Text style={S.infoLbl}>{t('cashier.orders.method')}</Text><Text style={S.infoVal}>{refundTarget.payment_method || '—'}</Text></View>
              </View>
              <Text style={S.inputLabel}>{t('cashier.history.refundAmount')}</Text>
              <TextInput style={S.input} keyboardType="numeric" value={refundAmt} onChangeText={setRefundAmt} />
              <Text style={[S.inputLabel, { marginTop: spacing.md }]}>{t('cashier.history.reason')}</Text>
              <TouchableOpacity style={S.reasonPicker} onPress={() => setShowReasonPicker(true)}>
                <Text style={S.reasonVal}>{refundReason}</Text>
                <MaterialIcons name="expand-more" size={18} color={colors.neutralMid}/>
              </TouchableOpacity>
              <TouchableOpacity style={[S.refundConfirmBtn, refunding && { opacity: 0.6 }]} onPress={confirmRefund} disabled={refunding}>
                {refunding ? <ActivityIndicator color="#fff"/> : <Text style={S.refundConfirmTxt}>{t('cashier.history.confirmRefund')}</Text>}
              </TouchableOpacity>
            </>
          )}
        </View>
      </Modal>

      {/* ── Reason picker ────────────────────────────────────────────────── */}
      <Modal visible={showReasonPicker} transparent animationType="slide" onRequestClose={() => setShowReasonPicker(false)}>
        <TouchableOpacity style={S.mask} onPress={() => setShowReasonPicker(false)}/>
        <View style={S.sheet}>
          <Text style={S.sheetTitle}>{t('cashier.orders.selectReason')}</Text>
          {REFUND_REASONS.map(r => (
            <TouchableOpacity key={r} style={S.reasonOpt} onPress={() => { setRefundReason(r); setShowReasonPicker(false); }}>
              <Text style={[S.reasonOptTxt, refundReason === r && { color: colors.primary, fontWeight: '700' }]}>{r}</Text>
              {refundReason === r && <MaterialIcons name="check" size={18} color={colors.primary}/>}
            </TouchableOpacity>
          ))}
        </View>
      </Modal>
      <ConfirmDialog dialog={dialog} onClose={() => setDialog(null)} />
    </View>
  );
}

// ── Main Styles ─────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  page:          { flex: 1, backgroundColor: colors.background },
  periodBar:     { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, paddingHorizontal: spacing.lg, ...shadow.card, borderWidth: 1.5, borderColor: colors.primary + '40' },
  periodTxt:     { flex: 1, fontSize: 14, fontWeight: '700', color: colors.textDark },
  filterBtn:     { width: 48, height: 48, backgroundColor: colors.white, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', ...shadow.card },
  filterBadge:   { position: 'absolute', top: 6, right: 6, width: 16, height: 16, borderRadius: 8, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  filterBadgeTxt:{ fontSize: 9, fontWeight: '800', color: '#fff' },
  // Filter chips
  chipRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, alignItems: 'center' },
  activeChip:    { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primaryLight || '#EEF2FF', borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 5, borderWidth: 1, borderColor: colors.primary + '50' },
  activeChipTxt: { fontSize: 12, color: colors.primary, fontWeight: '600' },
  clearAllTxt:   { fontSize: 12, color: colors.neutralMid, fontWeight: '600', paddingHorizontal: 4 },
  // Summary
  summaryGrid:   { flexDirection: 'row', gap: spacing.sm },
  summaryCard:   { flex: 1, backgroundColor: colors.white, borderRadius: radius.card, padding: spacing.md, ...shadow.card },
  summaryLbl:    { fontSize: 11, color: colors.neutralMid, fontWeight: '600', marginBottom: 2 },
  summaryVal:    { fontSize: 16, fontWeight: '800', color: colors.textDark },
  methodCard:    { backgroundColor: colors.white, borderRadius: radius.card, padding: spacing.md, ...shadow.card },
  secHead:       { fontSize: 11, fontWeight: '700', color: colors.neutralMid, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: spacing.sm },
  methodRow:     { flexDirection: 'row', gap: spacing.lg },
  methodItem:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  methodLbl:     { fontSize: 11, color: colors.neutralMid },
  methodVal:     { fontSize: 12, color: colors.textDark, fontWeight: '700' },
  discRow:       { fontSize: 11, color: colors.neutralMid, marginTop: spacing.xs },
  // Transaction cards
  txCard:        { backgroundColor: colors.white, borderRadius: radius.card, padding: spacing.md, ...shadow.card },
  txTop:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  txLeft:        { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  txIcon:        { width: 34, height: 34, borderRadius: radius.md, backgroundColor: colors.neutralLight, alignItems: 'center', justifyContent: 'center' },
  txId:          { fontSize: 14, fontWeight: '700', color: colors.textDark },
  txTable:       { fontSize: 11, color: colors.neutralMid },
  txRight:       { alignItems: 'flex-end' },
  txAmt:         { fontSize: 14, fontWeight: '800', color: colors.textDark },
  txBadge:       { marginTop: 2, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.full },
  txBadgePaid:   { backgroundColor: '#F0FDF4' },
  txBadgeRefund: { backgroundColor: '#FEF2F2' },
  txBadgeTxt:    { fontSize: 10, fontWeight: '700' },
  txBot:         { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  txDate:        { fontSize: 11, color: colors.neutralMid },
  txWaitress:    { fontSize: 11, color: colors.neutralMid, marginLeft: spacing.sm },
  empty:         { alignItems: 'center', paddingVertical: 32 },
  emptyTxt:      { fontSize: 13, color: colors.neutralMid, marginTop: spacing.sm },
  // Bottom sheets
  mask:          { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet:         { backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.xl },
  sheetTitle:    { fontSize: 16, fontWeight: '700', color: colors.textDark, marginBottom: spacing.lg },
  refundInfo:    { backgroundColor: colors.neutralLight, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  infoRow:       { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  infoLbl:       { fontSize: 13, color: colors.neutralMid },
  infoVal:       { fontSize: 13, fontWeight: '600', color: colors.textDark },
  inputLabel:    { fontSize: 12, color: colors.neutralMid, fontWeight: '600', marginBottom: spacing.xs },
  input:         { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 11, fontSize: 14, color: colors.textDark },
  reasonPicker:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md },
  reasonVal:     { fontSize: 13, color: colors.textDark },
  refundConfirmBtn: { marginTop: spacing.lg, backgroundColor: colors.danger, borderRadius: radius.btn, paddingVertical: 15, alignItems: 'center' },
  refundConfirmTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  reasonOpt:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  reasonOptTxt:  { fontSize: 14, color: colors.textDark },
});

// ── Filter Sheet Styles ─────────────────────────────────────────────────────────
const FS = StyleSheet.create({
  header:     { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  title:      { fontSize: 17, fontWeight: '800', color: colors.textDark },
  clearBtn:   { marginLeft: spacing.md, paddingHorizontal: spacing.sm, paddingVertical: 4, backgroundColor: colors.neutralLight, borderRadius: radius.full },
  clearTxt:   { fontSize: 12, color: colors.neutralMid, fontWeight: '600' },
  sectionLbl: { fontSize: 11, fontWeight: '700', color: colors.neutralMid, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: spacing.sm },
  chipRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip:       { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.white },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  chipTxt:    { fontSize: 13, color: colors.textDark, fontWeight: '600' },
  chipTxtActive: { color: '#fff' },
  applyBtn:   { backgroundColor: colors.primary, borderRadius: radius.btn, paddingVertical: 14, alignItems: 'center' },
  applyTxt:   { color: '#fff', fontWeight: '800', fontSize: 15 },
});

// ── Order Detail Styles ─────────────────────────────────────────────────────────
const OD = StyleSheet.create({
  header:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  orderNum:   { fontSize: 20, fontWeight: '800', color: colors.textDark },
  dateTime:   { fontSize: 12, color: colors.neutralMid, marginTop: 2 },
  badge:      { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full },
  badgePaid:  { backgroundColor: '#F0FDF4' },
  badgeRefund:{ backgroundColor: '#FEF2F2' },
  badgeTxt:   { fontSize: 11, fontWeight: '700' },
  infoCard:   { backgroundColor: colors.neutralLight || '#F9FAFB', borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md, marginBottom: spacing.md },
  infoRow:    { flexDirection: 'row', gap: spacing.lg },
  infoItem:   { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
  infoLbl:    { fontSize: 10, color: colors.neutralMid, fontWeight: '600', textTransform: 'uppercase' },
  infoVal:    { fontSize: 13, fontWeight: '700', color: colors.textDark },
  secHead:    { fontSize: 11, fontWeight: '700', color: colors.neutralMid, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: spacing.sm },
  itemsCard:  { backgroundColor: colors.white, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md, overflow: 'hidden' },
  itemRow:    { flexDirection: 'row', alignItems: 'center', padding: spacing.md },
  itemName:   { flex: 1, fontSize: 13, color: colors.textDark, fontWeight: '500' },
  itemQty:    { fontSize: 13, color: colors.neutralMid, marginHorizontal: spacing.sm },
  itemAmt:    { fontSize: 13, fontWeight: '700', color: colors.textDark },
  totalsCard: { backgroundColor: colors.neutralLight || '#F9FAFB', borderRadius: radius.card, padding: spacing.md, marginBottom: spacing.md },
  totRow:     { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  totLbl:     { fontSize: 13, color: colors.neutralMid },
  totVal:     { fontSize: 13, fontWeight: '600', color: colors.textDark },
  totRowBold: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: 6, paddingTop: 10 },
  grandLbl:   { fontSize: 15, fontWeight: '800', color: colors.textDark },
  grandAmt:   { fontSize: 15, fontWeight: '800', color: colors.primary },
  refundBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderWidth: 1.5, borderColor: colors.danger, borderRadius: radius.btn, paddingVertical: 12, marginTop: spacing.sm },
  refundTxt:  { fontSize: 14, fontWeight: '700', color: colors.danger },
});

// ── Calendar styles ────────────────────────────────────────────────────────────
const C = StyleSheet.create({
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet:       { backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%' },
  header:      { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitle: { fontSize: 17, fontWeight: '800', color: colors.textDark, marginLeft: 8 },
  pill:        { flex: 1, backgroundColor: colors.background || '#F9FAFB', borderRadius: radius.md, padding: spacing.md, borderWidth: 2, borderColor: colors.border },
  pillActive:  { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  pillLbl:     { fontSize: 10, color: colors.neutralMid, fontWeight: '700', marginBottom: 2 },
  pillVal:     { fontSize: 14, fontWeight: '800', color: colors.textDark },
  hint:        { textAlign: 'center', color: colors.neutralMid, fontSize: 12, marginBottom: 14 },
  arrowBtn:    { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  arrowTxt:    { fontSize: 24, color: colors.primary, fontWeight: '700', lineHeight: 28 },
  monthTitle:  { fontSize: 17, fontWeight: '800', color: colors.textDark },
  dayHdr:      { fontSize: 12, fontWeight: '700', color: colors.neutralMid },
  presets:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: spacing.lg, marginBottom: spacing.md },
  presetBtn:   { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.primary },
  presetTxt:   { color: colors.primary, fontWeight: '700', fontSize: 13 },
  applyBtn:    { backgroundColor: colors.primary, borderRadius: radius.lg, paddingVertical: 14, alignItems: 'center', marginTop: spacing.sm },
  applyTxt:    { color: colors.white, fontWeight: '700', fontSize: 15 },
});

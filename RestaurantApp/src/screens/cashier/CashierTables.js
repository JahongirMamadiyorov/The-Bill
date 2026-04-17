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
const TABLE_STATUS = {
  free:     { color: '#16A34A', bg: '#F0FDF4', label: 'Free',     icon: 'check-circle-outline' },
  occupied: { color: '#D97706', bg: '#FFFBEB', label: 'Occupied', icon: 'people-outline'        },
  reserved: { color: '#7C3AED', bg: '#F5F3FF', label: 'Reserved', icon: 'event-note'            },
  cleaning: { color: '#0891B2', bg: '#ECFEFF', label: 'Cleaning', icon: 'cleaning-services'     },
  closed:   { color: '#DC2626', bg: '#FEF2F2', label: 'Closed',   icon: 'block'                 },
};

// ── Mini Table Card ────────────────────────────────────────────────────────────
function TableCard({ table, onPress }) {
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
          <Text style={S.tableSub}>{table.capacity || '—'} seats</Text>
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

// ── Payment Sheet ─────────────────────────────────────────────────────────────
const PAY_METHODS = ['Cash', 'Card', 'QR Code', 'Loan'];

function PaymentSheet({ order, visible, onClose, onPaid, setDialog }) {
  const [method,     setMethod]     = useState('Cash');
  const [cashGiven,  setCashGiven]  = useState('');
  const [cardOk,     setCardOk]     = useState(false);
  const [qrOk,       setQrOk]       = useState(false);
  const [loanName,   setLoanName]   = useState('');
  const [loanPhone,  setLoanPhone]  = useState('');
  const [loanDue,    setLoanDue]    = useState('');
  const [discPct,    setDiscPct]    = useState('0');
  const [paying,     setPaying]     = useState(false);

  const total    = parseFloat(order?.total_amount || 0);
  const disc     = Math.min(total, (total * Math.min(parseFloat(discPct) || 0, 100)) / 100);
  const toPay    = Math.max(0, total - disc);
  const change   = Math.max(0, (parseFloat(cashGiven) || 0) - toPay);

  useEffect(() => {
    if (visible) {
      setMethod('Cash'); setCashGiven(''); setCardOk(false); setQrOk(false);
      setLoanName(''); setLoanPhone(''); setLoanDue(''); setDiscPct('0'); setPaying(false);
    }
  }, [visible]);

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
      if (method === 'Loan') {
        payload.loan_customer_name  = loanName;
        payload.loan_customer_phone = loanPhone;
        payload.loan_due_date       = loanDue;
      }
      await ordersAPI.pay(order.id, payload);
      onPaid();
    } catch (e) {
      setDialog({ title: 'Error', message: e?.response?.data?.error || 'Payment failed', type: 'error' });
    } finally { setPaying(false); }
  };

  if (!order) return null;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={S.mask} activeOpacity={1} onPress={onClose} />
      <View style={S.paySheet}>
        <View style={S.sheetHandle} />
        <Text style={S.sheetTitle}>Collect Payment</Text>
        <Text style={S.sheetSub}>
          {order.table_name || order.customer_name || 'Walk-in'} · {fmt(total)}
        </Text>

        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Discount */}
          <Text style={S.sectionLabel}>DISCOUNT (%)</Text>
          <View style={S.discRow}>
            {[0, 5, 10, 15, 20].map(p => (
              <TouchableOpacity
                key={p}
                style={[S.discBtn, discPct === String(p) && S.discBtnActive]}
                onPress={() => setDiscPct(String(p))}
              >
                <Text style={[S.discTxt, discPct === String(p) && { color: '#fff' }]}>{p}%</Text>
              </TouchableOpacity>
            ))}
          </View>
          {disc > 0 && (
            <View style={S.discSummary}>
              <Text style={S.discSummaryTxt}>Discount: -{fmt(disc)}</Text>
              <Text style={[S.discSummaryTxt, { fontWeight: '800', color: colors.primary }]}>Total: {fmt(toPay)}</Text>
            </View>
          )}

          {/* Payment method */}
          <Text style={[S.sectionLabel, { marginTop: 16 }]}>PAYMENT METHOD</Text>
          <View style={S.methodRow}>
            {PAY_METHODS.map(m => (
              <TouchableOpacity key={m} style={[S.methodBtn, method === m && S.methodBtnActive]} onPress={() => setMethod(m)}>
                <MaterialIcons
                  name={m === 'Cash' ? 'payments' : m === 'Card' ? 'credit-card' : m === 'QR Code' ? 'qr-code-2' : 'account-balance-wallet'}
                  size={20}
                  color={method === m ? '#fff' : colors.neutralMid}
                />
                <Text style={[S.methodTxt, method === m && { color: '#fff' }]}>{m}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Cash */}
          {method === 'Cash' && (
            <>
              <TextInput
                style={S.input}
                placeholder={`Amount given (min ${fmt(toPay)})`}
                keyboardType="numeric"
                value={cashGiven}
                onChangeText={setCashGiven}
              />
              {(parseFloat(cashGiven) || 0) >= toPay && (
                <View style={S.changeBox}>
                  <Text style={S.changeLbl}>Change</Text>
                  <Text style={S.changeAmt}>{fmt(change)}</Text>
                </View>
              )}
            </>
          )}

          {/* Card */}
          {method === 'Card' && (
            <TouchableOpacity style={[S.confirmRow, cardOk && S.confirmRowOk]} onPress={() => setCardOk(!cardOk)}>
              <View style={[S.checkbox, cardOk && S.checkboxOk]}>
                {cardOk && <MaterialIcons name="check" size={13} color="#fff" />}
              </View>
              <Text style={S.confirmLbl}>Payment confirmed on terminal</Text>
            </TouchableOpacity>
          )}

          {/* QR Code */}
          {method === 'QR Code' && (
            <>
              <View style={S.qrBox}>
                <MaterialIcons name="qr-code-2" size={64} color={colors.border} />
                <Text style={S.qrLbl}>Customer scans to pay</Text>
              </View>
              <TouchableOpacity style={[S.confirmRow, qrOk && S.confirmRowOk]} onPress={() => setQrOk(!qrOk)}>
                <View style={[S.checkbox, qrOk && S.checkboxOk]}>
                  {qrOk && <MaterialIcons name="check" size={13} color="#fff" />}
                </View>
                <Text style={S.confirmLbl}>QR payment confirmed</Text>
              </TouchableOpacity>
            </>
          )}

          {/* Loan */}
          {method === 'Loan' && (
            <>
              <View style={S.loanBanner}>
                <MaterialIcons name="warning-amber" size={16} color="#92400E" />
                <Text style={S.loanBannerTxt}>Loan records the debt. Money is collected later.</Text>
              </View>
              <TextInput style={S.input} placeholder="Customer name *" value={loanName} onChangeText={setLoanName} />
              <PhoneField label="Phone Number" value={loanPhone} onChange={setLoanPhone} />
              <TextInput style={S.input} placeholder="Due date (YYYY-MM-DD) *" value={loanDue} onChangeText={setLoanDue} />
            </>
          )}

          <View style={{ height: 120 }} />
        </ScrollView>

        {/* Footer */}
        <View style={S.payFooter}>
          <TouchableOpacity
            style={[S.payBtn, (!canPay() || paying) && S.payBtnDisabled]}
            onPress={handlePay}
            disabled={!canPay() || paying}
          >
            {paying
              ? <ActivityIndicator color="#fff" />
              : <>
                  <MaterialIcons name="check-circle" size={20} color="#fff" />
                  <Text style={S.payBtnTxt}>Confirm Payment — {fmt(toPay)}</Text>
                </>
            }
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── Table Detail Modal ─────────────────────────────────────────────────────────
function TableDetail({ table, order, onClose, onAddItems, onPaid, onNewOrder, navigation, setDialog }) {
  const [showPay, setShowPay] = useState(false);

  const handlePaid = () => {
    setShowPay(false);
    onPaid();
  };

  if (!table) return null;

  const hasOrder     = !!order;
  const billRequested = order?.status === 'bill_requested';
  const isPaid       = order?.status === 'paid';
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
            <Text style={S.billBannerTxt}>Bill requested by waitress</Text>
          </View>
        )}

        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 24 }}>
          {hasOrder ? (
            <>
              {/* Order summary */}
              <View style={S.orderSummary}>
                <View style={S.summaryRow}>
                  <Text style={S.summaryLbl}>Order</Text>
                  <Text style={S.summaryVal}>
                    {order.daily_number ? `#${order.daily_number}` : order.id?.slice(-6)}
                  </Text>
                </View>
                <View style={S.summaryRow}>
                  <Text style={S.summaryLbl}>Guests</Text>
                  <Text style={S.summaryVal}>{order.guest_count || '—'}</Text>
                </View>
                <View style={S.summaryRow}>
                  <Text style={S.summaryLbl}>Waiter</Text>
                  <Text style={S.summaryVal}>{order.waitress_name || 'Cashier'}</Text>
                </View>
                <View style={S.summaryRow}>
                  <Text style={S.summaryLbl}>Time</Text>
                  <Text style={S.summaryVal}>{elapsed(order.created_at)}</Text>
                </View>
              </View>

              {/* Items */}
              <Text style={S.sectionLabel}>ORDER ITEMS</Text>
              {(order.items || []).map((item, i) => (
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
                <Text style={S.totalLbl}>Total</Text>
                <Text style={S.totalAmt}>{fmt(order.total_amount)}</Text>
              </View>

              {/* Actions */}
              <View style={S.actionBtns}>
                {canPay && (
                  <TouchableOpacity style={S.payNowBtn} onPress={() => setShowPay(true)}>
                    <MaterialIcons name="payments" size={18} color="#fff" />
                    <Text style={S.payNowTxt}>Collect Payment</Text>
                  </TouchableOpacity>
                )}
                {!isPaid && (
                  <TouchableOpacity
                    style={S.addItemsBtn}
                    onPress={() => { onClose(); onAddItems(table, order); }}
                  >
                    <MaterialIcons name="add" size={18} color={colors.primary} />
                    <Text style={S.addItemsTxt}>Add Items</Text>
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
                  <Text style={S.reservedBannerTitle}>Table Reserved</Text>
                  <Text style={S.reservedBannerSub}>Upcoming reservation</Text>
                </View>
              </View>

              {/* Info rows */}
              {[
                { icon: 'person', label: 'Guest Name', value: table.reservationGuest || 'Not specified' },
                { icon: 'people', label: 'Party Size', value: table.capacity ? `${table.capacity} seats` : '—' },
                { icon: 'schedule', label: 'Reserved For', value: (() => {
                  const t = table.reservationTime;
                  if (!t) return '—';
                  const d = new Date(t);
                  if (isNaN(d.getTime())) return t;
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
              <Text style={S.noOrderTxt}>No active order</Text>
              <Text style={S.noOrderSub}>Start a new order for this table</Text>
              <TouchableOpacity
                style={S.newOrderBtn}
                onPress={() => { onClose(); onNewOrder(table); }}
              >
                <MaterialIcons name="add-circle-outline" size={18} color="#fff" />
                <Text style={S.newOrderTxt}>New Order</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </View>

      <PaymentSheet
        order={order}
        visible={showPay}
        onClose={() => setShowPay(false)}
        onPaid={handlePaid}
        setDialog={setDialog}
      />
    </Modal>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN SCREEN
// ══════════════════════════════════════════════════════════════════════════════
export default function CashierTables({ navigation }) {
  const { user } = useAuth();
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
          <Text style={S.headerTitle}>Tables</Text>
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
                : <TableCard key={table.id} table={table} onPress={() => setSelTable(table)} />
            )}
          </View>
        )}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        ListEmptyComponent={
          <View style={S.center}>
            <MaterialIcons name="table-restaurant" size={48} color={colors.border} />
            <Text style={{ color: colors.neutralMid, marginTop: 12, fontSize: 15 }}>No tables found</Text>
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
  payFooter:    { position: 'absolute', bottom: 0, left: 0, right: 0, padding: spacing.lg, paddingBottom: 32, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.border },
  payBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, borderRadius: radius.btn, paddingVertical: 15 },
  payBtnDisabled:{ backgroundColor: colors.border },
  payBtnTxt:    { color: '#fff', fontWeight: '800', fontSize: 15 },
});

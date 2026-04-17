// ════════════════════════════════════════════════════════════════════════════
// WaitressActiveOrders — Orders tab
// Shows all orders assigned to this waitress, with a detail modal
// ════════════════════════════════════════════════════════════════════════════
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  Modal, ScrollView, ActivityIndicator,
  RefreshControl, SafeAreaView, StatusBar,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { ordersAPI } from '../../api/client';
import { colors, spacing, radius, shadow, typography, topInset } from '../../utils/theme';
import ConfirmDialog from '../../components/ConfirmDialog';

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtMoney = (n) => Math.round(n || 0).toLocaleString('uz-UZ') + ' so\'m';

const fmtTime = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
};

const fmtElapsed = (iso) => {
  if (!iso) return '—';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1)  return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60); const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
};

const isToday = (iso) => {
  const d = new Date(iso);
  const now = new Date();
  return d.toDateString() === now.toDateString();
};

// ── Status config ─────────────────────────────────────────────────────────────
const ORDER_STATUS = {
  pending:         { label: 'Pending',        color: '#D97706', bg: '#FEF3C7', icon: 'schedule' },
  sent_to_kitchen: { label: 'In Kitchen',     color: '#2563EB', bg: '#DBEAFE', icon: 'restaurant' },
  preparing:       { label: 'Preparing',      color: '#7C3AED', bg: '#F5F3FF', icon: 'local-fire-department' },
  ready:           { label: 'Ready!',         color: '#16A34A', bg: '#DCFCE7', icon: 'check-circle' },
  served:          { label: 'Served',         color: '#059669', bg: '#D1FAE5', icon: 'done-all' },
  bill_requested:  { label: 'Bill Requested', color: '#7C3AED', bg: '#F5F3FF', icon: 'receipt-long' },
  paid:            { label: 'Paid',           color: '#16A34A', bg: '#DCFCE7', icon: 'payments' },
  cancelled:       { label: 'Cancelled',      color: '#DC2626', bg: '#FEE2E2', icon: 'cancel' },
};

function StatusBadge({ status }) {
  const cfg = ORDER_STATUS[status] || { label: status, color: colors.textMuted, bg: colors.background, icon: 'info' };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: cfg.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full, gap: 4 }}>
      <MaterialIcons name={cfg.icon} size={12} color={cfg.color} />
      <Text style={{ color: cfg.color, fontWeight: '700', fontSize: 11 }}>{cfg.label}</Text>
    </View>
  );
}

// ── Filter tabs ───────────────────────────────────────────────────────────────
const FILTERS = [
  { key: 'active',        label: 'Active' },
  { key: 'bill_requested',label: 'Bill Req.' },
  { key: 'completed',     label: 'Done Today' },
];

// ── Order detail modal ────────────────────────────────────────────────────────
function OrderDetailModal({ visible, order, onClose, onMarkServed, onRequestBill }) {
  const [requestingBill, setRequestingBill] = useState(false);
  const [localOrder, setLocalOrder] = useState(null);
  const [dialog, setDialog] = useState(null);

  useEffect(() => { if (order) setLocalOrder(order); }, [order]);

  if (!localOrder) return null;

  const isBillReq = localOrder.status === 'bill_requested';
  const isPaid    = localOrder.status === 'paid';
  const isLocked  = isBillReq || isPaid;

  const handleBill = () => {
    setDialog({
      title: 'Request Bill?',
      message: `Table ${localOrder.table_number || '?'}\nTotal: ${fmtMoney(localOrder.total_amount)}`,
      type: 'info',
      confirmLabel: 'Request Bill',
      onConfirm: async () => {
        setDialog(null);
        setRequestingBill(true);
        try {
          await onRequestBill(localOrder.id);
          setLocalOrder(prev => ({ ...prev, status: 'bill_requested' }));
        } catch (e) {
          setDialog({ title: 'Error', message: e?.response?.data?.error || 'Failed to request bill', type: 'error' });
        } finally { setRequestingBill(false); }
      },
    });
  };

  const handleItemServed = async (itemId) => {
    try {
      await onMarkServed(localOrder.id, itemId);
      setLocalOrder(prev => ({
        ...prev,
        items: (prev.items || []).map(it => it.id === itemId ? { ...it, served_at: new Date().toISOString() } : it),
      }));
    } catch (e) {
      setDialog({ title: 'Error', message: e?.response?.data?.error || 'Failed to mark as served', type: 'error' });
    }
  };

  const itemStatus = (item) => {
    if (item.served_at)    return { label: 'Served',    color: '#7C3AED', bg: '#F5F3FF' };
    if (item.item_ready)   return { label: 'Ready ✓',  color: '#16A34A', bg: '#DCFCE7' };
    if (localOrder.status === 'ready') return { label: 'Ready', color: '#16A34A', bg: '#DCFCE7' };
    if (['preparing','sent_to_kitchen'].includes(localOrder.status))
                           return { label: 'Cooking',  color: '#2563EB', bg: '#DBEAFE' };
    return                        { label: 'Pending',  color: '#D97706', bg: '#FEF3C7' };
  };

  // Partial-ready: some items are kitchen-ready but not all
  const allItems     = localOrder.items || [];
  const readyItems   = allItems.filter(i => i.item_ready);
  const isPartial    = readyItems.length > 0 && readyItems.length < allItems.length
                       && localOrder.status !== 'ready';

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        {/* Header */}
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose} style={styles.modalClose}>
            <MaterialIcons name="arrow-back" size={22} color={colors.textDark} />
          </TouchableOpacity>
          <View style={{ alignItems: 'center' }}>
            <Text style={styles.modalTitle}>Table {localOrder.table_number || '?'}</Text>
            <Text style={styles.modalSub}>{fmtTime(localOrder.created_at)} · {localOrder.guest_count ? `${localOrder.guest_count} guests` : ''}</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>

        {/* Bill requested banner */}
        {isBillReq && (
          <View style={styles.billBanner}>
            <MaterialIcons name="receipt-long" size={18} color="#7C3AED" />
            <Text style={styles.billBannerTxt}>Bill requested — awaiting cashier</Text>
          </View>
        )}
        {localOrder.status === 'ready' && !isBillReq && (
          <View style={[styles.billBanner, { backgroundColor: '#DCFCE7', borderColor: '#16A34A' }]}>
            <MaterialIcons name="check-circle" size={18} color="#16A34A" />
            <Text style={[styles.billBannerTxt, { color: '#16A34A' }]}>Ready to serve!</Text>
          </View>
        )}
        {isPartial && !isBillReq && localOrder.status !== 'ready' && (
          <View style={[styles.billBanner, { backgroundColor: '#FFF7ED', borderColor: '#F97316' }]}>
            <MaterialIcons name="local-fire-department" size={18} color="#C2410C" />
            <Text style={[styles.billBannerTxt, { color: '#C2410C' }]}>
              Prep in progress — {readyItems.length}/{allItems.length} items ready
            </Text>
          </View>
        )}

        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}>
          {/* Order summary */}
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Status</Text>
              <StatusBadge status={localOrder.status} />
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Time</Text>
              <Text style={styles.summaryVal}>{fmtElapsed(localOrder.created_at)}</Text>
            </View>
            {localOrder.guest_count ? (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Guests</Text>
                <Text style={styles.summaryVal}>{localOrder.guest_count}</Text>
              </View>
            ) : null}
          </View>

          {/* Items */}
          <Text style={styles.sectionLabel}>ITEMS</Text>
          {(localOrder.items || []).length === 0 && (
            <Text style={{ color: colors.textMuted, paddingVertical: 20, textAlign: 'center' }}>No items</Text>
          )}
          {(localOrder.items || []).map(item => {
            const ist = itemStatus(item);
            return (
              <View key={item.id} style={styles.orderItemRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{item.name || item.item_name}</Text>
                  <Text style={styles.itemPrice}>×{item.quantity}  {fmtMoney((item.unit_price || 0) * item.quantity)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <View style={{ backgroundColor: ist.bg, borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Text style={{ color: ist.color, fontWeight: '700', fontSize: 11 }}>{ist.label}</Text>
                  </View>
                  {!item.served_at && !isLocked && (
                    <TouchableOpacity onPress={() => handleItemServed(item.id)} style={styles.serveBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <MaterialIcons name="check" size={13} color="#16A34A" />
                      <Text style={{ fontSize: 11, color: '#16A34A', fontWeight: '600' }}>Serve</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })}

          {/* Total */}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalAmt}>{fmtMoney(localOrder.total_amount)}</Text>
          </View>

          {/* Notes */}
          {localOrder.notes ? (
            <View style={styles.notesBox}>
              <MaterialIcons name="notes" size={14} color={colors.textMuted} style={{ marginRight: 6 }} />
              <Text style={{ color: colors.textMuted, fontSize: 13, flex: 1 }}>{localOrder.notes}</Text>
            </View>
          ) : null}
        </ScrollView>

        {/* Footer */}
        {!isLocked && !isPaid && (
          <View style={styles.modalFooter}>
            <TouchableOpacity
              onPress={handleBill}
              disabled={requestingBill}
              style={[styles.billBtn, requestingBill && { opacity: 0.7 }]}
              activeOpacity={0.85}
            >
              {requestingBill
                ? <ActivityIndicator size="small" color="#fff" />
                : <>
                    <MaterialIcons name="receipt-long" size={18} color="#fff" style={{ marginRight: 8 }} />
                    <Text style={styles.billBtnTxt}>Request Bill</Text>
                  </>
              }
            </TouchableOpacity>
          </View>
        )}
        <ConfirmDialog dialog={dialog} onClose={() => setDialog(null)} />
      </SafeAreaView>
    </Modal>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN SCREEN
// ══════════════════════════════════════════════════════════════════════════════
export default function WaitressActiveOrders() {
  const [orders,     setOrders]     = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter,     setFilter]     = useState('active');
  const [selOrder,   setSelOrder]   = useState(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailOrder, setDetailOrder] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [dialog, setDialog] = useState(null);

  const loadOrders = useCallback(async () => {
    try {
      const res = await ordersAPI.getMyOrders();
      setOrders(Array.isArray(res.data) ? res.data : []);
    } catch {
      // silent fail on poll
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
    const iv = setInterval(loadOrders, 5000);
    return () => clearInterval(iv);
  }, [loadOrders]);

  // ── Open detail ────────────────────────────────────────────────────────────
  const openDetail = useCallback(async (order) => {
    setDetailOrder(null);
    setDetailVisible(true);
    setDetailLoading(true);
    try {
      const res = await ordersAPI.getById(order.id);
      setDetailOrder(res.data);
    } catch (e) {
      setDetailVisible(false);
      setDialog({ title: 'Error', message: e?.response?.data?.error || 'Failed to load order details', type: 'error' });
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const handleMarkServed = useCallback(async (orderId, itemId) => {
    await ordersAPI.markItemServed(orderId, itemId);
  }, []);

  const handleRequestBill = useCallback(async (orderId) => {
    await ordersAPI.requestBill(orderId);
    await loadOrders();
  }, [loadOrders]);

  // ── Filter orders ──────────────────────────────────────────────────────────
  const ACTIVE_STATUSES = ['pending', 'sent_to_kitchen', 'preparing', 'ready', 'served'];

  const filtered = orders.filter(o => {
    if (filter === 'active')         return ACTIVE_STATUSES.includes(o.status);
    if (filter === 'bill_requested') return o.status === 'bill_requested';
    if (filter === 'completed')      return o.status === 'paid'; // backend already limits to today
    return true;
  });

  // ── Stats ──────────────────────────────────────────────────────────────────
  const activeCount = orders.filter(o => ACTIVE_STATUSES.includes(o.status) || o.status === 'bill_requested').length;
  const billCount   = orders.filter(o => o.status === 'bill_requested').length;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Orders</Text>
        <View style={styles.headerChips}>
          {activeCount > 0 && (
            <View style={[styles.chip, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
              <Text style={styles.chipTxt}>{activeCount} active</Text>
            </View>
          )}
          {billCount > 0 && (
            <View style={[styles.chip, { backgroundColor: '#7C3AED' }]}>
              <MaterialIcons name="receipt-long" size={12} color="#fff" style={{ marginRight: 4 }} />
              <Text style={styles.chipTxt}>{billCount} bill req.</Text>
            </View>
          )}
        </View>
      </View>

      {/* Filter tabs */}
      <View style={styles.filterBar}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f.key}
            onPress={() => setFilter(f.key)}
            style={[styles.filterTab, filter === f.key && styles.filterTabActive]}
          >
            <Text style={[styles.filterTabTxt, filter === f.key && styles.filterTabTxtActive]}>{f.label}</Text>
            {f.key === 'bill_requested' && billCount > 0 && (
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#7C3AED', marginLeft: 4 }} />
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Orders list */}
      <FlatList
        data={filtered}
        keyExtractor={o => String(o.id)}
        contentContainerStyle={{ padding: spacing.md, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadOrders(); }} tintColor={colors.primary} />}
        renderItem={({ item }) => {
          const cfg = ORDER_STATUS[item.status] || { label: item.status, color: colors.textMuted, bg: colors.background, icon: 'info' };
          // Partial-ready detection for list card
          const cardItems   = item.items || [];
          const cardReady   = cardItems.filter(i => i.item_ready).length;
          const cardPartial = cardReady > 0 && cardReady < cardItems.length && item.status !== 'ready';
          return (
            <TouchableOpacity
              onPress={() => openDetail(item)}
              activeOpacity={0.85}
              style={[styles.orderCard, item.status === 'ready' && styles.orderCardReady, item.status === 'bill_requested' && styles.orderCardBill, cardPartial && styles.orderCardPartial]}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <Text style={styles.orderTable}>
                      {item.table_name || (item.table_number ? `Table ${item.table_number}` : item.customer_name || 'Walk-in')}
                    </Text>
                    <StatusBadge status={item.status} />
                    {cardPartial && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#FFF7ED', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <MaterialIcons name="local-fire-department" size={11} color="#C2410C" />
                        <Text style={{ fontSize: 10, fontWeight: '700', color: '#C2410C' }}>{cardReady}/{cardItems.length}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.orderMeta}>
                    {item.item_count || 0} items · {fmtElapsed(item.created_at)}
                    {item.guest_count ? ` · ${item.guest_count} guests` : ''}
                    {item.waitress_name ? ` · ${item.waitress_name}` : ''}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.orderTotal}>{fmtMoney(item.total_amount)}</Text>
                  <MaterialIcons name="chevron-right" size={20} color={colors.textMuted} style={{ marginTop: 4 }} />
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <MaterialIcons name="receipt-long" size={48} color={colors.border} />
            <Text style={styles.emptyTxt}>
              {filter === 'active'         ? 'No active orders' :
               filter === 'bill_requested' ? 'No pending bills' :
               'No completed orders today'}
            </Text>
            <Text style={styles.emptySubTxt}>
              {filter === 'active' ? 'Start an order from the Tables tab' : ''}
            </Text>
          </View>
        }
      />

      {/* Detail modal */}
      {detailLoading
        ? (
          <Modal visible={detailLoading} transparent>
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.3)' }}>
              <View style={{ backgroundColor: colors.white, borderRadius: radius.xl, padding: spacing.xxl }}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            </View>
          </Modal>
        )
        : (
          <OrderDetailModal
            visible={detailVisible && !!detailOrder}
            order={detailOrder}
            onClose={() => { setDetailVisible(false); setDetailOrder(null); loadOrders(); }}
            onMarkServed={handleMarkServed}
            onRequestBill={handleRequestBill}
          />
        )
      }

      <ConfirmDialog dialog={dialog} onClose={() => setDialog(null)} />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center:    { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header:       { backgroundColor: colors.primary, paddingTop: topInset + 8, paddingBottom: spacing.lg, paddingHorizontal: spacing.lg },
  headerTitle:  { color: colors.white, fontSize: 26, fontWeight: '800', marginBottom: spacing.sm },
  headerChips:  { flexDirection: 'row', gap: spacing.sm },
  chip:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.full },
  chipTxt:      { color: colors.white, fontSize: 12, fontWeight: '600' },

  filterBar:        { flexDirection: 'row', backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border },
  filterTab:        { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.md },
  filterTabActive:  { borderBottomWidth: 2.5, borderBottomColor: colors.primary },
  filterTabTxt:     { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  filterTabTxtActive: { color: colors.primary },

  orderCard:      { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.sm, ...shadow.card, borderLeftWidth: 4, borderLeftColor: colors.border },
  orderCardReady:   { borderLeftColor: '#16A34A' },
  orderCardBill:    { borderLeftColor: '#7C3AED' },
  orderCardPartial: { borderLeftColor: '#F97316' },
  orderTable:     { fontSize: 16, fontWeight: '800', color: colors.textDark },
  orderMeta:      { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  orderTotal:     { fontSize: 15, fontWeight: '800', color: colors.primary },

  empty:      { alignItems: 'center', paddingTop: 80 },
  emptyTxt:   { fontSize: 16, fontWeight: '700', color: colors.textMuted, marginTop: 12 },
  emptySubTxt:{ fontSize: 13, color: colors.textMuted, textAlign: 'center', marginTop: 6 },

  // Detail modal
  modalHeader:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.md, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalClose:    { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  modalTitle:    { fontSize: 17, fontWeight: '800', color: colors.textDark },
  modalSub:      { fontSize: 12, color: colors.textMuted, marginTop: 2, textAlign: 'center' },
  billBanner:    { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F5F3FF', borderColor: '#7C3AED', borderWidth: 1, margin: spacing.lg, borderRadius: radius.md, padding: spacing.md },
  billBannerTxt: { color: '#7C3AED', fontWeight: '700', fontSize: 14, flex: 1 },
  summaryCard:   { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.lg, ...shadow.card },
  summaryRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  summaryLabel:  { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
  summaryVal:    { fontSize: 13, fontWeight: '700', color: colors.textDark },
  sectionLabel:  { fontSize: 11, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.8, marginBottom: spacing.sm },
  orderItemRow:  { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, ...shadow.card },
  itemName:      { fontSize: 14, fontWeight: '700', color: colors.textDark, marginBottom: 3 },
  itemPrice:     { fontSize: 12, color: colors.textMuted },
  serveBtn:      { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#DCFCE7', paddingHorizontal: 7, paddingVertical: 3, borderRadius: radius.full },
  totalRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border, marginTop: spacing.sm },
  totalLabel:    { fontSize: 16, fontWeight: '700', color: colors.textDark },
  totalAmt:      { fontSize: 20, fontWeight: '800', color: colors.primary },
  notesBox:      { flexDirection: 'row', backgroundColor: colors.background, padding: spacing.md, borderRadius: radius.md, marginTop: spacing.sm },
  modalFooter:   { paddingHorizontal: spacing.lg, paddingVertical: spacing.lg, paddingBottom: 28, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.white },
  billBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#7C3AED', borderRadius: radius.btn, paddingVertical: spacing.lg },
  billBtnTxt:    { color: colors.white, fontWeight: '800', fontSize: 16 },
});

// ════════════════════════════════════════════════════════════════════════════
// WaitressTables — main working screen
// ════════════════════════════════════════════════════════════════════════════
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  ScrollView, Modal, ActivityIndicator,
  RefreshControl, Dimensions, TextInput, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useNavigation } from '@react-navigation/native';
import { tablesAPI, menuAPI, ordersAPI, notificationsAPI } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { colors, spacing, radius, shadow, typography, topInset } from '../../utils/theme';
import ConfirmDialog from '../../components/ConfirmDialog';

const { width: SW } = Dimensions.get('window');
const CARD_W = (SW - spacing.md * 4) / 3;

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmtMoney = (n) => Math.round(n || 0).toLocaleString('uz-UZ') + ' so\'m';

const isStaleOrder = (openedAt) => {
  if (!openedAt) return false;
  return (Date.now() - new Date(openedAt).getTime()) >= 24 * 60 * 60 * 1000;
};

const fmtElapsed = (openedAt) => {
  if (!openedAt) return '';
  const mins = Math.floor((Date.now() - new Date(openedAt).getTime()) / 60000);
  if (mins < 1)  return 'Just opened';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
};

// ── Status config ────────────────────────────────────────────────────────────
const ST = {
  free:     { label: 'FREE',     color: '#16A34A', bg: '#DCFCE7', icon: 'check-circle' },
  occupied: { label: 'OCCUPIED', color: '#DC2626', bg: '#FEE2E2', icon: 'people' },
  reserved: { label: 'RESERVED', color: '#2563EB', bg: '#DBEAFE', icon: 'event' },
  cleaning: { label: 'CLEANING', color: '#D97706', bg: '#FEF3C7', icon: 'cleaning-services' },
};

// ── Reusable mini-components ─────────────────────────────────────────────────
function Badge({ label, color, bg, small }) {
  return (
    <View style={{ backgroundColor: bg, borderRadius: radius.full, paddingHorizontal: small ? 6 : 8, paddingVertical: small ? 2 : 3 }}>
      <Text style={{ color, fontWeight: '700', fontSize: small ? 10 : 11 }}>{label}</Text>
    </View>
  );
}

function Btn({ label, icon, onPress, color = colors.primary, outline = false, disabled = false, small = false }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
      style={[
        styles.btn,
        small && styles.btnSm,
        outline
          ? { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: disabled ? colors.border : color }
          : { backgroundColor: disabled ? colors.border : color },
      ]}
    >
      {icon && <MaterialIcons name={icon} size={small ? 14 : 16} color={outline ? (disabled ? colors.textMuted : color) : '#fff'} style={{ marginRight: 4 }} />}
      <Text style={[styles.btnTxt, small && { fontSize: 12 }, outline && { color: disabled ? colors.textMuted : color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── Table card ───────────────────────────────────────────────────────────────
// NOTE: No ownership checks here — all waitresses can access all tables freely.
function TableCard({ table, onPress }) {
  const st        = ST[table.status] || ST.free;
  const isBillReq = table.status === 'occupied' && table.bill_requested;
  const elapsed   = fmtElapsed(table.opened_at);
  const stale     = table.status === 'occupied' && isStaleOrder(table.opened_at);

  const cardBg = {
    free:     '#f0fdf4',
    occupied: '#fff5f5',
    reserved: '#eff6ff',
    cleaning: '#fffbeb',
  }[table.status] || '#f8f8f8';

  return (
    <TouchableOpacity
      onPress={() => onPress(table)}
      activeOpacity={0.82}
      style={[styles.tableCard, { backgroundColor: cardBg, borderColor: st.color + '55' }]}
    >
      {/* Status dot — top right */}
      <View style={[styles.tableStatusDot, { backgroundColor: st.color }]} />

      {/* Bill requested badge — top left */}
      {isBillReq && (
        <View style={styles.billDot}>
          <Text style={styles.billDotTxt}>BILL</Text>
        </View>
      )}

      {/* Stale warning — top left (when no bill badge) */}
      {stale && !isBillReq && (
        <View style={[styles.billDot, { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }]}>
          <MaterialIcons name="warning-amber" size={9} color="#92400E" />
        </View>
      )}

      {/* Icon */}
      <MaterialIcons name="table-restaurant" size={26} color={st.color} style={{ marginBottom: 5 }} />

      {/* Table name */}
      <Text style={styles.tableNum} numberOfLines={1}>
        {table.table_number || table.name}
      </Text>

      {/* Status-specific detail */}
      {table.status === 'free' && (
        <Text style={[styles.tableDetail, { color: '#16A34A' }]}>
          {table.capacity ? `${table.capacity} seats` : 'Open'}
        </Text>
      )}
      {table.status === 'occupied' && (
        <>
          {elapsed ? (
            <Text style={[styles.tableDetail, { color: '#D97706', fontWeight: '700' }]}>{elapsed}</Text>
          ) : null}
          {table.order_total > 0 ? (
            <Text style={[styles.tableDetail, { color: '#0f172a', fontWeight: '700', fontSize: 10 }]}>
              {fmtMoney(table.order_total)}
            </Text>
          ) : null}
        </>
      )}
      {table.status === 'reserved' && (
        <Text style={[styles.tableDetail, { color: '#2563EB' }]}>Reserved</Text>
      )}
      {table.status === 'cleaning' && (
        <Text style={[styles.tableDetail, { color: '#D97706' }]}>Cleaning</Text>
      )}
    </TouchableOpacity>
  );
}

// ── Guest count picker ───────────────────────────────────────────────────────
function GuestCountModal({ visible, table, onConfirm, onClose }) {
  const [count, setCount] = useState(2);
  useEffect(() => { if (visible) setCount(2); }, [visible]);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.sheetHandle} />
        <Text style={styles.sheetTitle}>Table {table?.table_number || table?.name}</Text>
        <Text style={styles.sheetSub}>How many guests?</Text>
        <View style={styles.guestRow}>
          <TouchableOpacity onPress={() => setCount(c => Math.max(1, c - 1))} style={styles.guestBtn}>
            <MaterialIcons name="remove" size={24} color={colors.primary} />
          </TouchableOpacity>
          <Text style={styles.guestCount}>{count}</Text>
          <TouchableOpacity onPress={() => setCount(c => Math.min(20, c + 1))} style={styles.guestBtn}>
            <MaterialIcons name="add" size={24} color={colors.primary} />
          </TouchableOpacity>
        </View>
        <Text style={{ color: colors.textMuted, textAlign: 'center', marginBottom: spacing.xl, fontSize: 13 }}>
          Select number of guests (1–20)
        </Text>
        <Btn label="Continue to Order" icon="arrow-forward" onPress={() => onConfirm(count)} />
      </View>
    </Modal>
  );
}

// ── Menu order modal (create new OR add items) ───────────────────────────────
function MenuOrderModal({ visible, table, guestCount, mode, existingOrder, categories, menuItems, onSend, onClose }) {
  const [selCat,      setSelCat]      = useState(null);
  const [cart,        setCart]        = useState([]);
  const [sending,     setSending]     = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [dialog,      setDialog]      = useState(null);
  const catRef    = useRef(null);
  const searchRef = useRef(null);

  useEffect(() => {
    if (visible) {
      setCart([]);
      setSearchQuery('');
      setSelCat(categories[0]?.id || null);
    }
  }, [visible, categories]);

  const filteredItems = (() => {
    const q = searchQuery.trim().toLowerCase();
    let items = selCat ? menuItems.filter(i => i.category_id === selCat) : menuItems;
    if (q) items = items.filter(i => i.name.toLowerCase().includes(q));
    return items;
  })();

  const cartTotal = cart.reduce((s, c) => s + c.price * c.quantity, 0);
  const cartCount = cart.reduce((s, c) => s + c.quantity, 0);

  const addToCart = (item) => {
    setCart(prev => {
      const idx = prev.findIndex(c => c.menu_item_id === item.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [...prev, { menu_item_id: item.id, name: item.name, price: parseFloat(item.price), quantity: 1 }];
    });
  };
  const removeFromCart = (itemId) => {
    setCart(prev => {
      const idx = prev.findIndex(c => c.menu_item_id === itemId);
      if (idx < 0) return prev;
      const next = [...prev];
      if (next[idx].quantity > 1) { next[idx] = { ...next[idx], quantity: next[idx].quantity - 1 }; }
      else next.splice(idx, 1);
      return next;
    });
  };
  const getQty = (itemId) => cart.find(c => c.menu_item_id === itemId)?.quantity || 0;

  const handleSend = async () => {
    if (cart.length === 0) {
      setDialog({ title: 'Empty Cart', message: 'Add at least one item.', type: 'warning' });
      return;
    }
    setSending(true);
    try {
      await onSend(cart);
      onClose();
    } catch (e) {
      setDialog({ title: 'Error', message: e.response?.data?.error || e.message || 'Failed to send order', type: 'error' });
    } finally { setSending(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        {/* Header */}
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose} style={styles.modalClose}>
            <MaterialIcons name="arrow-back" size={22} color={colors.textDark} />
          </TouchableOpacity>
          <View>
            <Text style={styles.modalTitle}>
              {mode === 'add' ? 'Add More Items' : `Table ${table?.table_number || table?.name}`}
            </Text>
            {mode === 'new' && <Text style={styles.modalSub}>{guestCount} guest{guestCount !== 1 ? 's' : ''}</Text>}
          </View>
          <View style={{ width: 36 }} />
        </View>

        {/* Search bar */}
        <View style={styles.searchBarWrap}>
          <View style={styles.searchBar}>
            <MaterialIcons name="search" size={20} color={colors.textMuted} style={{ marginRight: 6 }} />
            <TextInput
              ref={searchRef}
              style={styles.searchInput}
              placeholder="Search menu items…"
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              returnKeyType="search"
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <MaterialIcons name="cancel" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Category tabs */}
        <View style={styles.catBarWrap}>
          <ScrollView
            ref={catRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.catBar}
          >
            <TouchableOpacity
              onPress={() => setSelCat(null)}
              style={[styles.catChip, !selCat && styles.catChipActive]}
            >
              <Text style={[styles.catChipTxt, !selCat && styles.catChipTxtActive]}>All</Text>
            </TouchableOpacity>
            {categories.map(cat => (
              <TouchableOpacity
                key={cat.id}
                onPress={() => setSelCat(cat.id)}
                style={[styles.catChip, selCat === cat.id && styles.catChipActive]}
              >
                <Text style={[styles.catChipTxt, selCat === cat.id && styles.catChipTxtActive]}>{cat.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Items grid */}
        <FlatList
          data={filteredItems}
          keyExtractor={i => String(i.id)}
          numColumns={2}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: spacing.md, paddingBottom: 140 }}
          columnWrapperStyle={{ gap: spacing.sm }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          renderItem={({ item }) => {
            const qty = getQty(item.id);
            return (
              <TouchableOpacity
                style={[styles.menuItem, qty > 0 && styles.menuItemSelected]}
                onPress={() => addToCart(item)}
                activeOpacity={0.85}
              >
                {/* Item initial avatar */}
                <View style={[styles.menuItemAvatar, { backgroundColor: colors.primaryLight }]}>
                  <Text style={{ fontSize: 20, fontWeight: '800', color: colors.primary }}>
                    {item.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.menuItemName} numberOfLines={2}>{item.name}</Text>
                <Text style={styles.menuItemPrice}>{fmtMoney(item.price)}</Text>
                {qty > 0 && (
                  <View style={styles.qtyRow}>
                    <TouchableOpacity onPress={() => removeFromCart(item.id)} style={styles.qtyBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <MaterialIcons name="remove" size={16} color={colors.primary} />
                    </TouchableOpacity>
                    <Text style={styles.qtyNum}>{qty}</Text>
                    <TouchableOpacity onPress={() => addToCart(item)} style={styles.qtyBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <MaterialIcons name="add" size={16} color={colors.primary} />
                    </TouchableOpacity>
                  </View>
                )}
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={{ paddingTop: 60, alignItems: 'center' }}>
              <MaterialIcons name={searchQuery ? 'search-off' : 'restaurant-menu'} size={36} color={colors.border} />
              <Text style={{ color: colors.textMuted, marginTop: 10, fontSize: 14 }}>
                {searchQuery ? `No results for "${searchQuery}"` : 'No items in this category'}
              </Text>
            </View>
          }
        />

        {/* Cart footer — slides in when items added */}
        {cartCount > 0 && (
          <View style={styles.cartFooter}>
            <View>
              <Text style={styles.cartItems}>{cartCount} item{cartCount !== 1 ? 's' : ''}</Text>
              <Text style={styles.cartTotal}>{fmtMoney(cartTotal)}</Text>
            </View>
            <TouchableOpacity
              onPress={handleSend}
              disabled={sending}
              style={[styles.sendBtn, sending && { opacity: 0.7 }]}
              activeOpacity={0.85}
            >
              {sending
                ? <ActivityIndicator size="small" color="#fff" />
                : <>
                    <MaterialIcons name="send" size={18} color="#fff" style={{ marginRight: 6 }} />
                    <Text style={styles.sendBtnTxt}>{mode === 'add' ? 'Add Items' : 'Send Order'}</Text>
                  </>}
            </TouchableOpacity>
          </View>
        )}

        <ConfirmDialog dialog={dialog} onClose={() => setDialog(null)} />
      </SafeAreaView>
    </Modal>
  );
}

// ── Active order modal ───────────────────────────────────────────────────────
function ActiveOrderModal({ visible, table, order, onClose, onAddItems, onRequestBill, onMarkServed, reloading }) {
  if (!order) return null;
  const isBillReq = order.status === 'bill_requested';
  const isPaid    = order.status === 'paid';
  const isLocked  = isBillReq || isPaid;
  const [requestingBill, setRequestingBill] = useState(false);
  const [dialog, setDialog] = useState(null);

  const handleRequestBill = () => {
    setDialog({
      title: 'Request Bill?',
      message: `Table ${table?.table_number || table?.name}\nTotal: ${fmtMoney(order.total_amount)}\n\nSend bill request to cashier?`,
      type: 'info',
      confirmLabel: 'Request Bill',
      onConfirm: async () => {
        setDialog(null);
        setRequestingBill(true);
        try { await onRequestBill(); }
        finally { setRequestingBill(false); }
      },
    });
  };

  const itemStatus = (item) => {
    if (item.served_at)            return { label: 'Served',    color: '#7C3AED', bg: '#F5F3FF' };
    if (order.status === 'ready')  return { label: 'Ready',     color: '#16A34A', bg: '#DCFCE7' };
    if (order.status === 'preparing' || order.status === 'sent_to_kitchen')
                                   return { label: 'Preparing', color: '#2563EB', bg: '#DBEAFE' };
    return                                { label: 'Pending',   color: '#D97706', bg: '#FEF3C7' };
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        {/* Header */}
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose} style={styles.modalClose}>
            <MaterialIcons name="arrow-back" size={22} color={colors.textDark} />
          </TouchableOpacity>
          <View>
            <Text style={styles.modalTitle}>Table {table?.table_number || table?.name}</Text>
            <Text style={styles.modalSub}>
              {order.guest_count ? `${order.guest_count} guests · ` : ''}
              {fmtElapsed(table?.opened_at) || fmtElapsed(order.created_at)}
            </Text>
          </View>
          <View style={{ width: 36 }} />
        </View>

        {/* Bill / status banner */}
        {isBillReq && (
          <View style={styles.billBanner}>
            <MaterialIcons name="receipt-long" size={18} color="#7C3AED" />
            <Text style={styles.billBannerTxt}>Bill requested — awaiting admin</Text>
          </View>
        )}
        {order.status === 'ready' && !isBillReq && (
          <View style={[styles.billBanner, { backgroundColor: '#DCFCE7', borderColor: '#16A34A' }]}>
            <MaterialIcons name="check-circle" size={18} color="#16A34A" />
            <Text style={[styles.billBannerTxt, { color: '#16A34A' }]}>Order is ready to serve!</Text>
          </View>
        )}

        {/* Items list */}
        {reloading
          ? <ActivityIndicator style={{ flex: 1 }} size="large" color={colors.primary} />
          : (
            <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}>
              <Text style={styles.sectionLabel}>ORDER ITEMS</Text>
              {(order.items || []).length === 0 && (
                <Text style={{ color: colors.textMuted, textAlign: 'center', paddingVertical: 40 }}>No items</Text>
              )}
              {(order.items || []).map(item => {
                const ist = itemStatus(item);
                return (
                  <View key={item.id} style={styles.orderItemRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.orderItemName}>{item.name || item.item_name}</Text>
                      <Text style={styles.orderItemPrice}>×{item.quantity}  {fmtMoney((item.unit_price || item.custom_price || 0) * item.quantity)}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <Badge label={ist.label} color={ist.color} bg={ist.bg} small />
                      {!item.served_at && !isLocked && (
                        <TouchableOpacity
                          onPress={() => onMarkServed(item.id)}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          style={styles.serveBtn}
                        >
                          <MaterialIcons name="check" size={13} color="#16A34A" />
                          <Text style={{ fontSize: 11, color: '#16A34A', fontWeight: '600' }}>Served</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })}

              {/* Total */}
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalAmt}>{fmtMoney(order.total_amount)}</Text>
              </View>

              {/* Notes */}
              {order.notes ? (
                <View style={styles.notesBox}>
                  <MaterialIcons name="notes" size={14} color={colors.textMuted} style={{ marginRight: 6 }} />
                  <Text style={{ color: colors.textMuted, fontSize: 13, flex: 1 }}>{order.notes}</Text>
                </View>
              ) : null}
            </ScrollView>
          )
        }

        {/* Footer actions */}
        {!isLocked && !isPaid && (
          <View style={styles.modalFooter}>
            <View style={{ flex: 1, marginRight: spacing.sm }}>
              <Btn label="Add Items" icon="add" onPress={onAddItems} outline color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Btn label="Request Bill" icon="receipt-long" onPress={handleRequestBill} disabled={requestingBill} color="#7C3AED" />
            </View>
          </View>
        )}

        <ConfirmDialog dialog={dialog} onClose={() => setDialog(null)} />
      </SafeAreaView>
    </Modal>
  );
}

// ── Reservation info modal ───────────────────────────────────────────────────
function ReservationModal({ visible, table, onSeatGuests, onClose }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.sheetHandle} />
        <Text style={styles.sheetTitle}>Table {table?.table_number || table?.name}</Text>
        <View style={{ backgroundColor: '#DBEAFE', borderRadius: radius.md, padding: spacing.lg, marginBottom: spacing.xl }}>
          <Text style={{ color: '#1D4ED8', fontWeight: '700', fontSize: 15 }}>Reserved</Text>
          <Text style={{ color: '#1D4ED8', fontSize: 13, marginTop: 4 }}>{table?.capacity} seat table</Text>
        </View>
        <Btn label="Seat Guests" icon="people" onPress={() => { onSeatGuests(table); onClose(); }} />
        <View style={{ height: spacing.sm }} />
        <Btn label="Cancel" icon="close" onPress={onClose} outline color={colors.textMuted} />
      </View>
    </Modal>
  );
}

// ── Cleaning modal ────────────────────────────────────────────────────────────
function CleaningModal({ visible, table, onMarkClean, onClose }) {
  const [marking, setMarking] = useState(false);
  const handleMarkClean = async () => {
    setMarking(true);
    try { await onMarkClean(); }
    finally { setMarking(false); }
  };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.sheetHandle} />
        <Text style={styles.sheetTitle}>Table {table?.table_number || table?.name}</Text>
        {/* Status info */}
        <View style={{ backgroundColor: '#FEF3C7', borderRadius: radius.md, padding: spacing.lg, marginBottom: spacing.xl, flexDirection: 'row', alignItems: 'center' }}>
          <MaterialIcons name="cleaning-services" size={22} color="#D97706" style={{ marginRight: spacing.md }} />
          <View>
            <Text style={{ color: '#92400E', fontWeight: '700', fontSize: 15 }}>Being Cleaned</Text>
            <Text style={{ color: '#92400E', fontSize: 13, marginTop: 3 }}>Mark as clean to make it available</Text>
          </View>
        </View>
        <Btn
          label={marking ? 'Marking clean…' : 'Mark as Clean'}
          icon="check-circle"
          onPress={handleMarkClean}
          disabled={marking}
          color="#16A34A"
        />
        <View style={{ height: spacing.sm }} />
        <Btn label="Close" icon="close" onPress={onClose} outline color={colors.textMuted} />
      </View>
    </Modal>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN SCREEN
// ══════════════════════════════════════════════════════════════════════════════
export default function WaitressTables() {
  const { user }       = useAuth();
  const navigation     = useNavigation();

  // Tables data
  const [tables,      setTables]      = useState([]);
  const [filter,      setFilter]      = useState('all');
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);

  // Notification unread count
  const [unreadCount, setUnreadCount] = useState(0);

  // Menu data (loaded lazily once)
  const [categories, setCategories] = useState([]);
  const [menuItems,  setMenuItems]  = useState([]);
  const [menuLoaded, setMenuLoaded] = useState(false);

  // Flow phase: 'idle' | 'guest_count' | 'order' | 'active_order' | 'reservation'
  const [phase,       setPhase]      = useState('idle');
  const [flowTable,   setFlowTable]  = useState(null);
  const [guestCount,  setGuestCount] = useState(2);
  const [flowOrder,   setFlowOrder]  = useState(null);
  const [orderMode,   setOrderMode]  = useState('new'); // 'new' | 'add'
  const [orderReload, setOrderReload]= useState(false);
  const [dialog,      setDialog]     = useState(null);

  // ── Load tables ──────────────────────────────────────────────────────────
  const loadTables = useCallback(async () => {
    try {
      const res = await tablesAPI.getAll();
      setTables(Array.isArray(res.data) ? res.data : []);
    } catch {
      // silently fail on poll; show error only on first load
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadTables();
    const iv = setInterval(loadTables, 5000);
    return () => clearInterval(iv);
  }, [loadTables]);

  // ── Poll notification unread count ───────────────────────────────────────
  const loadUnread = useCallback(async () => {
    try {
      const res = await notificationsAPI.getAll();
      const count = (res.data || []).filter(n => !n.is_read).length;
      setUnreadCount(count);
    } catch {
      // silent fail
    }
  }, []);

  useEffect(() => {
    loadUnread();
    const iv = setInterval(loadUnread, 5000);
    return () => clearInterval(iv);
  }, [loadUnread]);

  // ── Load menu data (once) ────────────────────────────────────────────────
  const loadMenu = useCallback(async () => {
    if (menuLoaded) return;
    try {
      const [cRes, iRes] = await Promise.all([menuAPI.getCategories(), menuAPI.getItems()]);
      setCategories(cRes.data || []);
      setMenuItems((iRes.data || []).filter(i => i.is_available !== false));
      setMenuLoaded(true);
    } catch {
      setDialog({ title: 'Error', message: 'Failed to load menu. Check your connection.', type: 'error' });
    }
  }, [menuLoaded]);

  // ── Table tap handler ────────────────────────────────────────────────────
  const handleTablePress = useCallback(async (table) => {
    if (table.status === 'free') {
      setFlowTable(table);
      setPhase('guest_count');
    } else if (table.status === 'occupied') {
      // Any waitress can access any occupied table — no ownership restriction
      // Load active order for this table
      try {
        setFlowTable(table);
        setFlowOrder(null);
        setPhase('active_order');
        setOrderReload(true);
        const res = await ordersAPI.getByTable(table.id);
        const activeOrders = (res.data || []).filter(o => !['paid', 'cancelled'].includes(o.status));
        if (activeOrders.length === 0) {
          // No order found — open new order flow instead
          setPhase('idle');
          setDialog({
            title: `Table ${table.table_number || table.name}`,
            message: 'No active order found. Start a new order?',
            type: 'info',
            confirmLabel: 'New Order',
            onConfirm: () => {
              setDialog(null);
              setFlowTable(table);
              setPhase('guest_count');
            },
          });
          return;
        }
        // Get full order with items
        const orderRes = await ordersAPI.getById(activeOrders[0].id);
        setFlowOrder(orderRes.data);
      } catch (e) {
        setPhase('idle');
        setDialog({ title: 'Error', message: e?.response?.data?.error || 'Failed to load order.', type: 'error' });
      } finally {
        setOrderReload(false);
      }
    } else if (table.status === 'reserved') {
      setFlowTable(table);
      setPhase('reservation');
    } else if (table.status === 'cleaning') {
      setFlowTable(table);
      setPhase('cleaning');
    }
  }, [user?.id]);

  // ── Confirm guest count → open menu ─────────────────────────────────────
  const handleGuestConfirm = useCallback(async (count) => {
    setGuestCount(count);
    setOrderMode('new');
    await loadMenu();
    setPhase('order');
  }, [loadMenu]);

  // ── Send new order ───────────────────────────────────────────────────────
  const handleSendOrder = useCallback(async (cart) => {
    // 1. Open table with guest count
    await tablesAPI.open(flowTable.id, { guests_count: guestCount });
    // 2. Create order
    await ordersAPI.create({
      table_id: flowTable.id,
      items: cart.map(c => ({ menu_item_id: c.menu_item_id, quantity: c.quantity, unit_price: c.price })),
    });
    // Optimistic: reload tables
    loadTables();
  }, [flowTable, guestCount, loadTables]);

  // ── Add items to existing order ──────────────────────────────────────────
  const handleAddItems = useCallback(async (cart) => {
    if (!flowOrder) return;
    const res = await ordersAPI.addItems(flowOrder.id, cart.map(c => ({ menu_item_id: c.menu_item_id, quantity: c.quantity, unit_price: c.price })));
    setFlowOrder(res.data);
    loadTables();
    // Re-open active order modal
    setPhase('active_order');
  }, [flowOrder, loadTables]);

  // ── Open "add items" menu from active order ──────────────────────────────
  const handleOpenAddItems = useCallback(async () => {
    setOrderMode('add');
    await loadMenu();
    setPhase('order');
  }, [loadMenu]);

  // ── Request bill ─────────────────────────────────────────────────────────
  const handleRequestBill = useCallback(async () => {
    if (!flowOrder) return;
    try {
      await ordersAPI.requestBill(flowOrder.id);
      // Refresh order
      const res = await ordersAPI.getById(flowOrder.id);
      setFlowOrder(res.data);
      loadTables();
    } catch (e) {
      setDialog({ title: 'Error', message: e?.response?.data?.error || 'Failed to request bill. Please try again.', type: 'error' });
    }
  }, [flowOrder, loadTables]);

  // ── Mark item served ─────────────────────────────────────────────────────
  const handleMarkServed = useCallback(async (itemId) => {
    if (!flowOrder) return;
    try {
      await ordersAPI.markItemServed(flowOrder.id, itemId);
      // Update local order state optimistically
      setFlowOrder(prev => ({
        ...prev,
        items: (prev.items || []).map(it => it.id === itemId ? { ...it, served_at: new Date().toISOString() } : it),
      }));
    } catch (e) {
      setDialog({ title: 'Error', message: e?.response?.data?.error || 'Failed to mark item as served.', type: 'error' });
    }
  }, [flowOrder]);

  // ── Seat guests from reservation ─────────────────────────────────────────
  const handleSeatGuests = useCallback((table) => {
    setFlowTable(table);
    setPhase('guest_count');
  }, []);

  // ── Mark cleaning table as clean (free) ──────────────────────────────────
  const handleMarkClean = useCallback(async () => {
    if (!flowTable) return;
    await tablesAPI.update(flowTable.id, { status: 'free' });
    setPhase('idle');
    setFlowTable(null);
    loadTables();
  }, [flowTable, loadTables]);

  // ── Filtered tables ──────────────────────────────────────────────────────
  const filtered = filter === 'all' ? tables : tables.filter(t => t.status === filter);

  // Pad to multiple of 3 so last row always has equal-width cards
  const gridData = useMemo(() => {
    const rem = filtered.length % 3;
    if (rem === 0) return filtered;
    const fillers = Array.from({ length: 3 - rem }, (_, i) => ({ id: `__filler_${i}`, _filler: true }));
    return [...filtered, ...fillers];
  }, [filtered]);

  // ── Stats ────────────────────────────────────────────────────────────────
  const freeCount     = tables.filter(t => t.status === 'free').length;
  const occupiedCount = tables.filter(t => t.status === 'occupied').length;
  const reservedCount = tables.filter(t => t.status === 'reserved').length;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ color: colors.textMuted, marginTop: 12 }}>Loading tables…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={styles.headerGreeting}>
              Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, {(user?.name || '').split(' ')[0]}
            </Text>
            <Text style={styles.headerTitle}>Tables</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {/* Notification bell */}
            <TouchableOpacity
              onPress={() => navigation.navigate('Notifications')}
              style={styles.headerIconBtn}
            >
              <MaterialIcons name="notifications" size={22} color={colors.white} />
              {unreadCount > 0 && (
                <View style={styles.notifBadge}>
                  <Text style={styles.notifBadgeTxt}>{unreadCount > 9 ? '9+' : String(unreadCount)}</Text>
                </View>
              )}
            </TouchableOpacity>
            {/* Refresh */}
            <TouchableOpacity onPress={() => { setRefreshing(true); loadTables(); }} style={styles.headerIconBtn}>
              <MaterialIcons name="refresh" size={22} color={colors.white} />
            </TouchableOpacity>
          </View>
        </View>
        {/* Summary chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: spacing.md }}>
          <View style={styles.chip}><View style={[styles.chipDot, { backgroundColor: '#16A34A' }]} /><Text style={styles.chipTxt}>{freeCount} Free</Text></View>
          <View style={styles.chip}><View style={[styles.chipDot, { backgroundColor: '#DC2626' }]} /><Text style={styles.chipTxt}>{occupiedCount} Occupied</Text></View>
          {reservedCount > 0 && <View style={styles.chip}><View style={[styles.chipDot, { backgroundColor: '#2563EB' }]} /><Text style={styles.chipTxt}>{reservedCount} Reserved</Text></View>}
        </ScrollView>
      </View>

      {/* ── Filter chips ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterBar}
        style={{ flexGrow: 0 }}
      >
        {['all', 'free', 'occupied', 'reserved', 'cleaning'].map(f => (
          <TouchableOpacity
            key={f}
            onPress={() => setFilter(f)}
            style={[styles.filterChip, filter === f && styles.filterChipActive]}
          >
            <Text style={[styles.filterChipTxt, filter === f && styles.filterChipTxtActive]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ── Table grid ── */}
      <FlatList
        style={{ flex: 1 }}
        data={gridData}
        keyExtractor={t => String(t.id)}
        numColumns={3}
        contentContainerStyle={styles.grid}
        columnWrapperStyle={{ gap: 8, paddingHorizontal: spacing.sm, marginBottom: 8 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadTables(); }} tintColor={colors.primary} />}
        renderItem={({ item }) => {
          if (item._filler) return <View style={{ flex: 1 }} />;
          return <TableCard table={item} onPress={handleTablePress} />;
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <MaterialIcons name="table-restaurant" size={48} color={colors.border} />
            <Text style={styles.emptyTxt}>No tables found</Text>
            <Text style={styles.emptySubTxt}>
              {filter !== 'all' ? `No ${filter} tables right now` : 'Tables will appear once added by admin'}
            </Text>
          </View>
        }
      />

      {/* ── Modals ── */}
      <GuestCountModal
        visible={phase === 'guest_count'}
        table={flowTable}
        onConfirm={handleGuestConfirm}
        onClose={() => setPhase('idle')}
      />

      <MenuOrderModal
        visible={phase === 'order'}
        table={flowTable}
        guestCount={guestCount}
        mode={orderMode}
        existingOrder={flowOrder}
        categories={categories}
        menuItems={menuItems}
        onSend={orderMode === 'add' ? handleAddItems : handleSendOrder}
        onClose={() => setPhase(orderMode === 'add' ? 'active_order' : 'idle')}
      />

      <ActiveOrderModal
        visible={phase === 'active_order'}
        table={flowTable}
        order={flowOrder}
        reloading={orderReload}
        onClose={() => { setPhase('idle'); setFlowOrder(null); loadTables(); }}
        onAddItems={handleOpenAddItems}
        onRequestBill={handleRequestBill}
        onMarkServed={handleMarkServed}
      />

      <ReservationModal
        visible={phase === 'reservation'}
        table={flowTable}
        onSeatGuests={handleSeatGuests}
        onClose={() => setPhase('idle')}
      />

      <CleaningModal
        visible={phase === 'cleaning'}
        table={flowTable}
        onMarkClean={handleMarkClean}
        onClose={() => { setPhase('idle'); setFlowTable(null); }}
      />

      <ConfirmDialog dialog={dialog} onClose={() => setDialog(null)} />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center:    { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },

  // Header
  header:         { backgroundColor: colors.primary, paddingTop: topInset + 8, paddingBottom: spacing.xl, paddingHorizontal: spacing.lg },
  headerGreeting: { color: 'rgba(255,255,255,0.75)', fontSize: 13, marginBottom: 2 },
  headerTitle:    { color: colors.white, fontSize: 26, fontWeight: '800' },
  headerIconBtn:  { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  notifBadge:     { position: 'absolute', top: -2, right: -2, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  notifBadgeTxt:  { color: '#fff', fontSize: 9, fontWeight: '800' },
  chip:           { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.full, marginRight: 8 },
  chipDot:        { width: 7, height: 7, borderRadius: 4, marginRight: 5 },
  chipTxt:        { color: colors.white, fontSize: 12, fontWeight: '600' },

  // Filter bar
  filterBar:           { paddingHorizontal: spacing.lg, paddingVertical: 10, gap: spacing.sm },
  filterChip:          { height: 32, paddingHorizontal: 14, borderRadius: 16, backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  filterChipActive:    { backgroundColor: colors.primary, borderColor: colors.primary },
  filterChipTxt:       { fontSize: 13, fontWeight: '600', color: colors.textMuted, lineHeight: 16 },
  filterChipTxtActive: { color: colors.white },

  // Table grid
  grid:           { paddingTop: spacing.sm, paddingBottom: spacing.xl },
  tableCard:      {
    flex: 1,
    height: 128,
    backgroundColor: '#f8f8f8',
    borderRadius: radius.lg,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
    position: 'relative',
    overflow: 'hidden',
    ...shadow.card,
  },
  tableStatusDot: { position: 'absolute', top: 7, right: 7, width: 9, height: 9, borderRadius: 5 },
  billDot:        { position: 'absolute', top: 6, left: 6, backgroundColor: '#F5F3FF', borderWidth: 1, borderColor: '#DDD6FE', borderRadius: 5, paddingHorizontal: 4, paddingVertical: 2 },
  billDotTxt:     { fontSize: 8, fontWeight: '800', color: '#7C3AED' },
  tableNum:       { fontSize: 13, fontWeight: '800', color: colors.textDark, textAlign: 'center' },
  tableDetail:    { fontSize: 11, color: colors.textMuted, textAlign: 'center', marginTop: 2 },
  staleBadge:     { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF3C7', paddingHorizontal: 7, paddingVertical: 3, borderRadius: radius.full, alignSelf: 'flex-start', marginTop: 5 },
  staleTxt:       { fontSize: 10, fontWeight: '700', color: '#92400E' },

  // Empty
  empty:      { alignItems: 'center', paddingTop: 80 },
  emptyTxt:   { fontSize: 16, fontWeight: '700', color: colors.textMuted, marginTop: 12 },
  emptySubTxt:{ fontSize: 13, color: colors.textMuted, textAlign: 'center', marginTop: 6 },

  // Shared button
  btn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, borderRadius: radius.btn, paddingVertical: spacing.lg, paddingHorizontal: spacing.xl },
  btnSm:  { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
  btnTxt: { color: colors.white, fontWeight: '700', fontSize: 15 },

  // Bottom sheet (guest count + reservation)
  backdrop:   { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet:      { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.xl, paddingBottom: 36 },
  sheetHandle:{ width: 40, height: 4, backgroundColor: colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: spacing.lg },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: colors.textDark, textAlign: 'center', marginBottom: 4 },
  sheetSub:   { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.xl },

  // Guest picker
  guestRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg },
  guestBtn:   { width: 52, height: 52, borderRadius: 26, borderWidth: 2, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  guestCount: { fontSize: 48, fontWeight: '800', color: colors.textDark, marginHorizontal: spacing.xxl, minWidth: 70, textAlign: 'center' },

  // Modal
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.md, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalClose:  { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  modalTitle:  { fontSize: 17, fontWeight: '800', color: colors.textDark, textAlign: 'center' },
  modalSub:    { fontSize: 12, color: colors.textMuted, textAlign: 'center', marginTop: 2 },

  // Search bar
  searchBarWrap: { backgroundColor: colors.white, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border, flexShrink: 0 },
  searchBar:     { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background, borderRadius: radius.full, paddingHorizontal: spacing.md, height: 40, borderWidth: 1, borderColor: colors.border },
  searchInput:   { flex: 1, fontSize: 14, color: colors.textDark, paddingVertical: 0 },

  // Category tabs
  catBarWrap:  { backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border, flexShrink: 0 },
  catBar:      { paddingHorizontal: spacing.md, paddingVertical: 8, gap: spacing.sm, alignItems: 'center' },
  catChip:     { paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.full, backgroundColor: colors.background, borderWidth: 1.5, borderColor: colors.border, alignSelf: 'flex-start' },
  catChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  catChipTxt:  { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  catChipTxtActive: { color: colors.white },

  // Menu items
  menuItem:         { flex: 1, backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, ...shadow.card, minHeight: 120, alignItems: 'center' },
  menuItemSelected: { borderWidth: 2, borderColor: colors.primary },
  menuItemAvatar:   { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  menuItemName:     { fontSize: 13, fontWeight: '700', color: colors.textDark, textAlign: 'center', marginBottom: 4 },
  menuItemPrice:    { fontSize: 12, fontWeight: '600', color: colors.primary, textAlign: 'center' },
  qtyRow:           { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm, backgroundColor: colors.primaryLight, borderRadius: radius.full, paddingHorizontal: 4 },
  qtyBtn:           { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  qtyNum:           { fontSize: 14, fontWeight: '800', color: colors.primary, minWidth: 22, textAlign: 'center' },

  // Cart footer
  cartFooter: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.white, paddingHorizontal: spacing.lg, paddingVertical: spacing.lg, paddingBottom: 28, borderTopWidth: 1, borderTopColor: colors.border, ...shadow.lg },
  cartItems:  { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
  cartTotal:  { fontSize: 17, fontWeight: '800', color: colors.textDark },
  sendBtn:    { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primary, paddingVertical: spacing.md, paddingHorizontal: spacing.xl, borderRadius: radius.btn },
  sendBtnTxt: { color: colors.white, fontWeight: '800', fontSize: 15 },

  // Active order modal
  billBanner:    { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F5F3FF', borderColor: '#7C3AED', borderWidth: 1, margin: spacing.lg, borderRadius: radius.md, padding: spacing.md },
  billBannerTxt: { color: '#7C3AED', fontWeight: '700', fontSize: 14, flex: 1 },
  sectionLabel:  { fontSize: 11, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.8, marginBottom: spacing.md },
  orderItemRow:  { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, ...shadow.card },
  orderItemName: { fontSize: 14, fontWeight: '700', color: colors.textDark, marginBottom: 3 },
  orderItemPrice:{ fontSize: 12, color: colors.textMuted },
  serveBtn:      { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#DCFCE7', paddingHorizontal: 7, paddingVertical: 3, borderRadius: radius.full },
  totalRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border, marginTop: spacing.sm },
  totalLabel:    { fontSize: 16, fontWeight: '700', color: colors.textDark },
  totalAmt:      { fontSize: 20, fontWeight: '800', color: colors.primary },
  notesBox:      { flexDirection: 'row', backgroundColor: colors.background, padding: spacing.md, borderRadius: radius.md, marginTop: spacing.sm },
  modalFooter:   { flexDirection: 'row', paddingHorizontal: spacing.lg, paddingVertical: spacing.lg, paddingBottom: 28, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.white },
});

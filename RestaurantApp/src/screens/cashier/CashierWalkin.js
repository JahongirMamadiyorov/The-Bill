import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, TextInput, Modal, FlatList, StatusBar,
} from 'react-native';
import ConfirmDialog from '../../components/ConfirmDialog';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useAuth } from '../../context/AuthContext';
import { menuAPI, ordersAPI, tablesAPI } from '../../api/client';
import { colors, spacing, radius, shadow, topInset } from '../../utils/theme';

const fmt = (n) => Number(n || 0).toLocaleString('uz-UZ') + " so'm";

const ORDER_TYPES = [
  { id: 'dine_in',  label: 'Dine-In',  icon: 'restaurant' },
  { id: 'to_go',    label: 'To Go',    icon: 'takeout-dining' },
  { id: 'delivery', label: 'Delivery', icon: 'local-shipping' },
];

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
      <Text style={S.lbl}>{label.toUpperCase()}</Text>
      <View style={[S.inp, { flexDirection: 'row', alignItems: 'center', padding: 0, overflow: 'hidden' }]}>
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

/* ─── Table status colour ─────────────────────────────────── */
const tableStatusColor = (status) => {
  if (status === 'occupied') return '#FF6B6B';
  if (status === 'reserved') return '#FFB347';
  return '#4CAF50'; // available
};

export default function CashierWalkin({ navigation, route }) {
  const { user } = useAuth();
  const editModeOrder  = route?.params?.order        || null;
  const prefillTable   = route?.params?.prefillTable || null;

  /* ── menu / cart ── */
  const [menuItems,   setMenuItems]   = useState([]);
  const [categories,  setCategories]  = useState([]);
  const [activeCat,   setActiveCat]   = useState(null);
  const [cart,        setCart]        = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [sending,     setSending]     = useState(false);
  const [dialog,      setDialog]      = useState(null);

  /* ── tables ── */
  const [tables,          setTables]          = useState([]);
  const [selectedTableId, setSelectedTableId] = useState(prefillTable?.id || null);
  const [showTableSheet,  setShowTableSheet]  = useState(false);

  /* ── guests ── */
  const [guestCount, setGuestCount] = useState(1);

  /* ── order type + to-go / delivery fields ── */
  const [orderType,        setOrderType]        = useState('dine_in');
  const [customerName,     setCustomerName]     = useState('');
  const [customerPhone,    setCustomerPhone]    = useState('');
  const [deliveryAddress,  setDeliveryAddress]  = useState('');

  /* ── load data ── */
  useEffect(() => {
    (async () => {
      try {
        const [catRes, itemRes, tableRes] = await Promise.all([
          menuAPI.getCategories(),
          menuAPI.getItems(),
          tablesAPI.getAll(),
        ]);
        const cats   = catRes.data   || [];
        const items  = itemRes.data  || [];
        const tbls   = tableRes.data || [];
        setCategories(cats);
        setMenuItems(items);
        setTables(tbls);
        if (cats.length) setActiveCat(cats[0].id);
      } catch {
        setDialog({ title: 'Error', message: 'Could not load menu', type: 'error' });
      } finally { setLoading(false); }
    })();
  }, []);

  /* ── cart helpers ── */
  const addItem    = (item) => setCart(c => {
    const ex = c.find(x => x.id === item.id);
    return ex ? c.map(x => x.id === item.id ? { ...x, qty: x.qty + 1 } : x) : [...c, { ...item, qty: 1 }];
  });
  const removeItem = (id) => setCart(c =>
    c.flatMap(x => x.id === id ? (x.qty > 1 ? [{ ...x, qty: x.qty - 1 }] : []) : [x])
  );

  const subtotal     = cart.reduce((s, x) => s + (x.price || 0) * x.qty, 0);
  const visibleItems = menuItems
    .filter(m => m.category_id === activeCat || (activeCat && String(m.category_id) === String(activeCat)))
    .sort((a, b) => {
      const aAvail = a.is_available !== false ? 0 : 1;
      const bAvail = b.is_available !== false ? 0 : 1;
      return aAvail - bAvail;
    });

  const selectedTable = tables.find(t => t.id === selectedTableId);

  /* ── build payload ── */
  const buildPayload = (notes) => {
    // 'to_go' maps to 'takeaway' for DB compatibility (same meaning)
    const dbOrderType = orderType === 'to_go' ? 'takeaway' : orderType;
    const payload = {
      order_type: dbOrderType,
      items:      cart.map(x => ({ menu_item_id: x.id, quantity: x.qty })),
      notes,
    };
    if (orderType === 'dine_in') {
      payload.table_id    = selectedTableId;
      payload.guest_count = guestCount;
    } else {
      payload.customer_name  = customerName;
      payload.customer_phone = customerPhone;
      if (orderType === 'delivery') {
        payload.delivery_address = deliveryAddress;
        payload.delivery_status  = 'pending';
      }
    }
    return payload;
  };

  /* ── submit ── */
  const processOrder = async (isDirectPay) => {
    if (!cart.length) return;

    if (!editModeOrder) {
      if (orderType === 'dine_in' && !selectedTableId) {
        setDialog({ title: 'Table Required', message: 'Please select a table before placing the order.', type: 'warning' });
        return;
      }
      if (orderType !== 'dine_in' && !customerName.trim()) {
        setDialog({ title: 'Required', message: `Customer name is required for ${orderType === 'to_go' ? 'To Go' : 'Delivery'} orders.`, type: 'warning' });
        return;
      }
      if (orderType === 'delivery' && !deliveryAddress.trim()) {
        setDialog({ title: 'Required', message: 'Delivery address is required.', type: 'warning' });
        return;
      }
    }

    setSending(true);
    try {
      if (editModeOrder) {
        await ordersAPI.addItems(editModeOrder.id, cart.map(x => ({ menu_item_id: x.id, quantity: x.qty })));
        setDialog({ title: 'Added', message: 'Items appended to order successfully', type: 'success' });
      } else {
        const noteStr =
          orderType === 'to_go'    ? `To Go${customerName ? ` — ${customerName}` : ''}` :
          orderType === 'delivery' ? `Delivery — ${customerName}${deliveryAddress ? ` — ${deliveryAddress}` : ''}` :
          isDirectPay ? 'Dine-in — direct payment' : 'Dine-in order';
        const res = await ordersAPI.create(buildPayload(noteStr));
        const newOrderId = res?.data?.id;
        if (isDirectPay && newOrderId) {
          // Navigate back to Orders tab and immediately open payment sheet
          navigation.navigate('CashierTabs', {
            screen: 'Orders',
            params: { openPayForOrderId: newOrderId },
          });
        } else {
          setDialog({ title: 'Created', message: 'Order sent to kitchen!', type: 'success' });
          setTimeout(() => navigation.goBack(), 500);
        }
        return; // skip the goBack() below
      }
      navigation.goBack();
    } catch (e) {
      setDialog({ title: 'Error', message: e?.response?.data?.error || 'Failed to process order', type: 'error' });
    } finally { setSending(false); }
  };

  /* ─────────────────────────────── TABLE PICKER SHEET ─────── */
  const TablePickerSheet = () => (
    <Modal
      visible={showTableSheet}
      transparent
      animationType="slide"
      onRequestClose={() => setShowTableSheet(false)}
    >
      <TouchableOpacity style={S.overlay} activeOpacity={1} onPress={() => setShowTableSheet(false)} />
      <View style={S.sheet}>
        <View style={S.sheetHandle} />
        <Text style={S.sheetTitle}>Select Table</Text>
        <Text style={S.sheetSub}>Tap a table to assign this order</Text>

        {/* Legend */}
        <View style={S.legend}>
          {[['#4CAF50','Available'],['#FF6B6B','Occupied'],['#FFB347','Reserved']].map(([c,l]) => (
            <View key={l} style={S.legendItem}>
              <View style={[S.legendDot, { backgroundColor: c }]} />
              <Text style={S.legendTxt}>{l}</Text>
            </View>
          ))}
        </View>

        <FlatList
          data={tables}
          keyExtractor={t => String(t.id)}
          numColumns={3}
          contentContainerStyle={S.tableGrid}
          renderItem={({ item: t }) => {
            const isSelected = selectedTableId === t.id;
            const isOccupied = t.status === 'occupied';
            const statusColor = tableStatusColor(t.status);
            return (
              <TouchableOpacity
                style={[
                  S.tableCard,
                  isSelected && S.tableCardSelected,
                  isOccupied && S.tableCardOccupied,
                ]}
                onPress={() => {
                  if (isOccupied) {
                    setDialog({ title: 'Table Occupied', message: `Table ${t.name || t.number} already has an active order. Select a different table.`, type: 'warning' });
                    return;
                  }
                  setSelectedTableId(t.id);
                  setShowTableSheet(false);
                }}
              >
                <View style={[S.tableStatusDot, { backgroundColor: statusColor }]} />
                <MaterialIcons
                  name="table-restaurant"
                  size={24}
                  color={isSelected ? '#fff' : isOccupied ? '#ccc' : colors.textDark}
                />
                <Text style={[S.tableNum, isSelected && { color: '#fff' }, isOccupied && { color: '#aaa' }]}>
                  {t.name || `T-${t.number || t.id}`}
                </Text>
                {t.capacity && (
                  <Text style={[S.tableCap, isSelected && { color: 'rgba(255,255,255,0.8)' }]}>
                    {t.capacity} seats
                  </Text>
                )}
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={S.noTables}>
              <MaterialIcons name="table-restaurant" size={36} color={colors.border} />
              <Text style={S.noTablesTxt}>No tables found</Text>
            </View>
          }
        />
      </View>
    </Modal>
  );

  /* ─────────────────────────────── RENDER ──────────────────── */
  if (loading) return <ActivityIndicator style={{ flex: 1 }} size="large" color={colors.primary} />;

  return (
    <View style={S.page}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />
      <TablePickerSheet />

      {/* Header */}
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.backBtn} hitSlop={12}>
          <MaterialIcons name="arrow-back" size={22} color={colors.textDark} />
        </TouchableOpacity>
        <Text style={S.headerTitle}>
          {editModeOrder ? `Add to #${editModeOrder.id}` : 'New Order'}
        </Text>
        <View style={S.cartBadge}>
          <Text style={S.cartBadgeTxt}>{cart.reduce((s, x) => s + x.qty, 0)}</Text>
        </View>
      </View>

      <ScrollView style={S.flex} contentContainerStyle={{ paddingBottom: 160 }}>

        {/* ── Order setup (new orders only) ── */}
        {!editModeOrder && (
          <View style={S.setupSection}>

            {/* Order type tabs */}
            <View style={S.typeRow}>
              {ORDER_TYPES.map(t => (
                <TouchableOpacity
                  key={t.id}
                  style={[S.typeBtn, orderType === t.id && S.typeBtnActive]}
                  onPress={() => {
                    setOrderType(t.id);
                    setSelectedTableId(null);
                    setCustomerName('');
                    setCustomerPhone('');
                    setDeliveryAddress('');
                  }}
                >
                  <MaterialIcons name={t.icon} size={17} color={orderType === t.id ? '#fff' : colors.neutralMid} />
                  <Text style={[S.typeTxt, orderType === t.id && S.typeTxtActive]}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* ── Dine-In: table + guests ── */}
            {orderType === 'dine_in' && (
              <View style={S.setupRow}>
                {/* Table selector */}
                <TouchableOpacity
                  style={[S.setupCard, !selectedTableId && S.setupCardRequired]}
                  onPress={() => setShowTableSheet(true)}
                >
                  <View style={S.setupCardIcon}>
                    <MaterialIcons name="table-restaurant" size={22} color={selectedTableId ? colors.primary : colors.neutralMid} />
                  </View>
                  <View style={S.flex}>
                    <Text style={S.setupCardLbl}>Table</Text>
                    <Text style={[S.setupCardVal, !selectedTableId && S.setupCardPlaceholder]}>
                      {selectedTable ? (selectedTable.name || `Table ${selectedTable.number || selectedTable.id}`) : 'Tap to select'}
                    </Text>
                  </View>
                  {selectedTableId
                    ? <TouchableOpacity hitSlop={8} onPress={() => setSelectedTableId(null)}><MaterialIcons name="close" size={18} color={colors.neutralMid} /></TouchableOpacity>
                    : <MaterialIcons name="chevron-right" size={20} color={colors.neutralMid} />}
                </TouchableOpacity>

                {/* Guest count */}
                <View style={S.setupCard}>
                  <View style={S.setupCardIcon}>
                    <MaterialIcons name="people" size={22} color={colors.primary} />
                  </View>
                  <View style={S.flex}>
                    <Text style={S.setupCardLbl}>Guests</Text>
                    <View style={S.guestRow}>
                      <TouchableOpacity style={S.guestBtn} onPress={() => setGuestCount(g => Math.max(1, g - 1))}>
                        <MaterialIcons name="remove" size={16} color={colors.textDark} />
                      </TouchableOpacity>
                      <Text style={S.guestCount}>{guestCount}</Text>
                      <TouchableOpacity style={[S.guestBtn, S.guestBtnPlus]} onPress={() => setGuestCount(g => g + 1)}>
                        <MaterialIcons name="add" size={16} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                {/* Validation hint */}
                {!selectedTableId && (
                  <View style={S.hintRow}>
                    <MaterialIcons name="info-outline" size={14} color="#FF9800" />
                    <Text style={S.hintTxt}>Select a table to enable placing the order</Text>
                  </View>
                )}
              </View>
            )}

            {/* ── To Go / Delivery: customer fields ── */}
            {orderType !== 'dine_in' && (
              <View style={S.formGrid}>
                <View style={S.formRow}>
                  <View style={S.flex}>
                    <Text style={S.lbl}>Customer Name *</Text>
                    <TextInput style={S.inp} value={customerName} onChangeText={setCustomerName} placeholder="E.g. Ali" />
                  </View>
                  <PhoneField label="Phone" value={customerPhone} onChange={setCustomerPhone} />
                </View>
                {orderType === 'delivery' && (
                  <View style={{ marginTop: spacing.sm }}>
                    <Text style={S.lbl}>Delivery Address *</Text>
                    <TextInput style={[S.inp, { height: 60 }]} value={deliveryAddress} onChangeText={setDeliveryAddress} placeholder="Street, Apt, etc." multiline />
                  </View>
                )}
              </View>
            )}

          </View>
        )}

        {/* Category tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={S.catScroll}
          contentContainerStyle={S.catContent}
        >
          {categories.map(cat => (
            <TouchableOpacity
              key={cat.id}
              style={[S.catPill, activeCat === cat.id && S.catPillActive]}
              onPress={() => setActiveCat(cat.id)}
            >
              <Text style={[S.catLbl, activeCat === cat.id && S.catLblActive]}>{cat.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Menu items */}
        <View style={{ padding: spacing.lg, gap: spacing.sm }}>
          {visibleItems.length === 0 && (
            <View style={S.empty}>
              <MaterialIcons name="menu-book" size={36} color={colors.border} />
              <Text style={S.emptyTxt}>No items</Text>
            </View>
          )}
          {visibleItems.map(item => {
            const inCart = cart.find(x => x.id === item.id);
            const avail = item.is_available !== false;
            return (
              <View key={item.id} style={[S.menuItem, !avail && { opacity: 0.45, backgroundColor: '#f3f4f6' }]}>
                <View style={S.flex}>
                  <Text style={[S.itemName, !avail && { color: '#9ca3af' }]}>{item.name}</Text>
                  <Text style={[S.itemPrice, !avail && { color: '#9ca3af' }]}>{fmt(item.price)}</Text>
                  {!avail && <Text style={{ fontSize: 10, color: '#dc2626', fontWeight: '700', marginTop: 2 }}>Inactive</Text>}
                </View>
                {avail ? (
                  inCart ? (
                    <View style={S.qtyRow}>
                      <TouchableOpacity style={S.qtyBtn} onPress={() => removeItem(item.id)}>
                        <MaterialIcons name="remove" size={16} color={colors.textDark} />
                      </TouchableOpacity>
                      <Text style={S.qtyVal}>{inCart.qty}</Text>
                      <TouchableOpacity style={[S.qtyBtn, S.qtyBtnBlue]} onPress={() => addItem(item)}>
                        <MaterialIcons name="add" size={16} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity style={[S.qtyBtn, S.qtyBtnBlue]} onPress={() => addItem(item)}>
                      <MaterialIcons name="add" size={16} color="#fff" />
                    </TouchableOpacity>
                  )
                ) : (
                  <View style={{ paddingHorizontal: 8, paddingVertical: 4, backgroundColor: '#fee2e2', borderRadius: 6 }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#dc2626' }}>OFF</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>

      {/* Footer CTA */}
      {cart.length > 0 && (
        <View style={S.footer}>
          {selectedTable && (
            <View style={S.footerMeta}>
              <MaterialIcons name="table-restaurant" size={14} color={colors.neutralMid} />
              <Text style={S.footerMetaTxt}>
                {selectedTable.name || `Table ${selectedTable.number || selectedTable.id}`}
              </Text>
              <MaterialIcons name="people" size={14} color={colors.neutralMid} style={{ marginLeft: 10 }} />
              <Text style={S.footerMetaTxt}>{guestCount} guest{guestCount !== 1 ? 's' : ''}</Text>
            </View>
          )}
          <View style={S.totalRow}>
            <Text style={S.totalLbl}>Total</Text>
            <Text style={S.totalVal}>{fmt(subtotal)}</Text>
          </View>
          <View style={S.footerBtns}>
            <TouchableOpacity
              style={[S.kitchenBtn, (orderType === 'dine_in' && !selectedTableId && !editModeOrder) && S.btnDisabled]}
              onPress={() => processOrder(false)}
              disabled={sending || (orderType === 'dine_in' && !selectedTableId && !editModeOrder)}
            >
              {sending
                ? <ActivityIndicator color={colors.textDark} />
                : <Text style={S.kitchenBtnTxt}>{editModeOrder ? 'Append Items' : 'Send to Kitchen'}</Text>
              }
            </TouchableOpacity>
            {!editModeOrder && (
              <TouchableOpacity
                style={[S.payBtn, (orderType === 'dine_in' && !selectedTableId) && S.btnDisabled]}
                onPress={() => processOrder(true)}
                disabled={sending || (orderType === 'dine_in' && !selectedTableId)}
              >
                <Text style={S.payBtnTxt}>Skip — Pay Now</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
      <ConfirmDialog dialog={dialog} onClose={() => setDialog(null)} />
    </View>
  );
}

/* ─── Styles ──────────────────────────────────────────────── */
const S = StyleSheet.create({
  flex:         { flex: 1 },
  page:         { flex: 1, backgroundColor: colors.background },

  /* Header */
  header:       { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: topInset + spacing.sm, paddingBottom: spacing.md, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn:      { padding: spacing.xs },
  headerTitle:  { flex: 1, fontSize: 16, fontWeight: '800', color: colors.textDark },
  cartBadge:    { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  cartBadgeTxt: { fontSize: 12, fontWeight: '800', color: '#fff' },

  /* Setup section */
  setupSection:      { backgroundColor: colors.white, padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  typeRow:           { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  typeBtn:           { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 10, borderRadius: radius.md, backgroundColor: colors.neutralLight },
  typeBtnActive:     { backgroundColor: colors.primary },
  typeTxt:           { fontSize: 12, fontWeight: '600', color: colors.neutralMid },
  typeTxtActive:     { color: '#fff' },
  formGrid:          { gap: spacing.sm },
  formRow:           { flexDirection: 'row', gap: spacing.md },
  lbl:               { fontSize: 11, fontWeight: '600', color: colors.neutralMid, marginBottom: 4 },
  inp:               { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 8, fontSize: 14, color: colors.textDark, backgroundColor: '#fcfcfc' },
  setupRow:          { gap: spacing.sm },
  setupCard:         { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: '#f8f8f8', borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  setupCardRequired: { borderColor: '#FF9800', borderStyle: 'dashed' },
  setupCardIcon:     { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', ...shadow.card },
  setupCardLbl:      { fontSize: 11, fontWeight: '600', color: colors.neutralMid, marginBottom: 2 },
  setupCardVal:      { fontSize: 14, fontWeight: '700', color: colors.textDark },
  setupCardPlaceholder: { color: colors.neutralMid, fontWeight: '500' },

  /* Guest counter */
  guestRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
  guestBtn:     { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.neutralLight, alignItems: 'center', justifyContent: 'center' },
  guestBtnPlus: { backgroundColor: colors.primary },
  guestCount:   { fontSize: 16, fontWeight: '800', color: colors.textDark, minWidth: 24, textAlign: 'center' },

  /* Hint */
  hintRow:  { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: spacing.sm },
  hintTxt:  { fontSize: 11, color: '#FF9800', fontWeight: '500', flex: 1 },

  /* Table picker modal */
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet:      { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '75%', paddingBottom: 32 },
  sheetHandle:{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  sheetTitle: { fontSize: 17, fontWeight: '800', color: colors.textDark, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  sheetSub:   { fontSize: 12, color: colors.neutralMid, paddingHorizontal: spacing.lg, marginBottom: spacing.md },

  legend:       { flexDirection: 'row', gap: spacing.lg, paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  legendItem:   { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot:    { width: 9, height: 9, borderRadius: 5 },
  legendTxt:    { fontSize: 11, color: colors.neutralMid },

  tableGrid:    { paddingHorizontal: spacing.md, paddingBottom: spacing.lg },
  tableCard:    {
    flex: 1, margin: 6, aspectRatio: 1,
    backgroundColor: '#f5f5f5', borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'transparent',
    position: 'relative',
    paddingVertical: 10,
  },
  tableCardSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  tableCardOccupied: { backgroundColor: '#fafafa', opacity: 0.6 },
  tableStatusDot:    { position: 'absolute', top: 6, right: 6, width: 8, height: 8, borderRadius: 4 },
  tableNum:          { fontSize: 13, fontWeight: '700', color: colors.textDark, marginTop: 4 },
  tableCap:          { fontSize: 10, color: colors.neutralMid, marginTop: 1 },
  noTables:          { alignItems: 'center', paddingVertical: 40 },
  noTablesTxt:       { fontSize: 13, color: colors.neutralMid, marginTop: spacing.sm },

  /* Category tabs */
  catScroll:    { backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border },
  catContent:   { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: spacing.sm },
  catPill:      { paddingHorizontal: spacing.md, paddingVertical: 7, borderRadius: radius.full, backgroundColor: colors.neutralLight },
  catPillActive:{ backgroundColor: colors.primary },
  catLbl:       { fontSize: 12, fontWeight: '600', color: colors.neutralMid },
  catLblActive: { color: '#fff' },

  /* Menu items */
  menuItem:   { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderRadius: radius.card, padding: spacing.md, ...shadow.card },
  itemName:   { fontSize: 14, fontWeight: '600', color: colors.textDark },
  itemPrice:  { fontSize: 12, color: colors.neutralMid, marginTop: 2 },
  qtyRow:     { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  qtyBtn:     { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.neutralLight, alignItems: 'center', justifyContent: 'center' },
  qtyBtnBlue: { backgroundColor: colors.primary },
  qtyVal:     { fontSize: 14, fontWeight: '700', color: colors.textDark, minWidth: 20, textAlign: 'center' },
  empty:      { alignItems: 'center', paddingVertical: 40 },
  emptyTxt:   { fontSize: 13, color: colors.neutralMid, marginTop: spacing.sm },

  /* Footer */
  footer:        { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.border, padding: spacing.lg },
  footerMeta:    { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
  footerMetaTxt: { fontSize: 12, color: colors.neutralMid, fontWeight: '500' },
  totalRow:      { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  totalLbl:      { fontSize: 14, fontWeight: '700', color: colors.textDark },
  totalVal:      { fontSize: 16, fontWeight: '800', color: colors.primary },
  footerBtns:    { flexDirection: 'row', gap: spacing.sm },
  kitchenBtn:    { flex: 1, backgroundColor: colors.neutralLight, borderRadius: radius.btn, paddingVertical: 13, alignItems: 'center' },
  kitchenBtnTxt: { fontWeight: '700', color: colors.textDark, fontSize: 13 },
  payBtn:        { flex: 1, backgroundColor: colors.primary, borderRadius: radius.btn, paddingVertical: 13, alignItems: 'center' },
  payBtnTxt:     { fontWeight: '700', color: '#fff', fontSize: 13 },
  btnDisabled:   { opacity: 0.4 },
});

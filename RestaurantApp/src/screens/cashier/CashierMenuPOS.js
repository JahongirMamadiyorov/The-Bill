import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, ScrollView,
  StyleSheet, StatusBar, ActivityIndicator, Alert,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useWindowDimensions } from 'react-native';
import { colors, topInset, spacing, radius, shadow } from '../../utils/theme';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from '../../context/LanguageContext';
import api from '../../api/client';

// ─── Design tokens ────────────────────────────────────────────────────────────
const C   = '#0891B2';   // Cashier cyan
const CL  = '#E0F2FE';   // Cyan light
const WH  = '#FFFFFF';
const BG  = '#F0F9FF';
const BD  = '#E5E7EB';
const TXT = '#111827';
const MUT = '#6B7280';
const GR  = '#16A34A';
const RD  = '#DC2626';
const AMB = '#D97706';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const money = (n) => Number(n || 0).toLocaleString('uz-UZ') + " so'm";

const catMIcon = (name = '') => {
  const n = name.toLowerCase();
  if (n.includes('bar') || n.includes('wine') || n.includes('drink') || n.includes('alcohol')) return 'local-bar';
  if (n.includes('pizza'))                                                                       return 'local-pizza';
  if (n.includes('fish') || n.includes('seafood'))                                              return 'set-meal';
  if (n.includes('coffee') || n.includes('tea') || n.includes('kafe'))                         return 'local-cafe';
  if (n.includes('dessert') || n.includes('cake') || n.includes('ice'))                        return 'cake';
  if (n.includes('grill') || n.includes('kebab') || n.includes('bbq'))                         return 'outdoor-grill';
  if (n.includes('salad') || n.includes('veg'))                                                 return 'eco';
  if (n.includes('special') || n.includes('chef'))                                              return 'star';
  return 'restaurant';
};

// ─── Payment Methods ──────────────────────────────────────────────────────────
const PAY_METHODS = [
  { id: 'Cash',    icon: 'payments',               label: 'Cash' },
  { id: 'Card',    icon: 'credit-card',             label: 'Card' },
  { id: 'QR Code', icon: 'qr-code-scanner',         label: 'QR'   },
  { id: 'Loan',    icon: 'account-balance-wallet',  label: 'Loan' },
];

const ORDER_TYPES = [
  { key: 'dine_in',  icon: 'restaurant',     label: 'Dine In'  },
  { key: 'to_go',    icon: 'shopping-bag',   label: 'To Go'    },
  { key: 'delivery', icon: 'delivery-dining',label: 'Delivery' },
];

// ─────────────────────────────────────────────────────────────────────────────
export default function CashierMenuPOS() {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const { t } = useTranslation();

  // Portrait tab switch
  const [activeTab, setActiveTab] = useState('menu'); // 'menu' | 'order'

  // ── Data ──────────────────────────────────────────────────────────────────
  const [categories, setCategories] = useState([]);
  const [items,      setItems]      = useState([]);
  const [tables,     setTables]     = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // ── Menu state ────────────────────────────────────────────────────────────
  const [selectedCat, setSelectedCat] = useState(null);
  const [search,      setSearch]      = useState('');
  const searchRef = useRef(null);

  // ── Order state ───────────────────────────────────────────────────────────
  const [cart,       setCart]       = useState({});
  const [orderType,  setOrderType]  = useState('dine_in');
  const [selTable,   setSelTable]   = useState(null);
  const [showTables, setShowTables] = useState(false);
  const [discount,   setDiscount]   = useState('');
  const [discPct,    setDiscPct]    = useState(false);
  const [custName,   setCustName]   = useState('');
  const [custAddr,   setCustAddr]   = useState('');

  // ── Payment state ─────────────────────────────────────────────────────────
  const [payMethod,  setPayMethod]  = useState('Cash');
  const [cashIn,     setCashIn]     = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState('');

  // ── Load data ─────────────────────────────────────────────────────────────
  useEffect(() => { loadData(); }, []);

  const loadData = async (quiet = false) => {
    quiet ? setRefreshing(true) : setLoading(true);
    try {
      const [cats, menuItems, tbls] = await Promise.all([
        api.get('/menu/categories'),
        api.get('/menu/items'),
        api.get('/tables'),
      ]);
      setCategories(Array.isArray(cats) ? cats : []);
      setItems(Array.isArray(menuItems) ? menuItems.filter(i => i.isAvailable !== false) : []);
      setTables(Array.isArray(tbls) ? tbls : []);
    } catch {
      Alert.alert('Error', 'Failed to load menu data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // ── Computed ──────────────────────────────────────────────────────────────
  const filteredItems = useMemo(() => {
    let list = items;
    if (selectedCat) list = list.filter(i => i.categoryId === selectedCat);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(i => (i.name || '').toLowerCase().includes(q));
    }
    return list;
  }, [items, selectedCat, search]);

  const cartEntries = useMemo(() => Object.values(cart), [cart]);
  const cartCount   = useMemo(() => cartEntries.reduce((s, e) => s + e.qty, 0), [cartEntries]);

  const subtotal = useMemo(() =>
    cartEntries.reduce((s, e) => s + Number(e.item.price || 0) * e.qty, 0),
    [cartEntries]);

  const discAmt = useMemo(() => {
    const d = parseFloat(discount) || 0;
    if (!d) return 0;
    return discPct ? Math.round(subtotal * d / 100) : Math.min(d, subtotal);
  }, [discount, discPct, subtotal]);

  const total  = Math.max(0, subtotal - discAmt);
  const change = Math.max(0, (parseFloat(cashIn) || 0) - total);

  // ── Cart actions ──────────────────────────────────────────────────────────
  const addItem = useCallback((item) =>
    setCart(p => ({ ...p, [item.id]: { item, qty: (p[item.id]?.qty || 0) + 1 } })), []);

  const decItem = useCallback((id) =>
    setCart(p => {
      if (!p[id]) return p;
      if (p[id].qty <= 1) { const n = { ...p }; delete n[id]; return n; }
      return { ...p, [id]: { ...p[id], qty: p[id].qty - 1 } };
    }), []);

  const delItem = useCallback((id) =>
    setCart(p => { const n = { ...p }; delete n[id]; return n; }), []);

  const clearCart = () => {
    setCart({}); setDiscount(''); setDiscPct(false);
    setSelTable(null); setOrderType('dine_in');
    setCashIn(''); setCustName(''); setCustAddr(''); setError('');
  };

  // ── Fire — send to kitchen ────────────────────────────────────────────────
  const handleFire = async () => {
    if (!cartEntries.length) return;
    setSubmitting(true); setError('');
    try {
      await api.post('/orders', {
        orderType,
        tableId: selTable?.id || null,
        items:   cartEntries.map(e => ({ menuItemId: e.item.id, quantity: e.qty })),
        ...(custName && { customerName: custName }),
        ...(custAddr && { deliveryAddress: custAddr }),
      });
      clearCart();
      Alert.alert('Sent', 'Order sent to kitchen!');
    } catch (e) {
      setError(e?.message || 'Failed to send order');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Charge — create + pay ─────────────────────────────────────────────────
  const handleCharge = async () => {
    if (!cartEntries.length) return;
    setSubmitting(true); setError('');
    try {
      const res = await api.post('/orders', {
        orderType,
        tableId: selTable?.id || null,
        items:   cartEntries.map(e => ({ menuItemId: e.item.id, quantity: e.qty })),
        ...(custName && { customerName: custName }),
        ...(custAddr && { deliveryAddress: custAddr }),
      });
      const orderId = res?.id || res?.order?.id;
      await api.put(`/orders/${orderId}/pay`, {
        paymentMethod:  payMethod,
        discountAmount: discAmt,
        totalPaid:      total,
      });
      clearCart();
      Alert.alert('Paid', 'Payment complete!');
    } catch (e) {
      setError(e?.message || 'Payment failed');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Column count for items grid ───────────────────────────────────────────
  const numCols = isLandscape
    ? (width >= 1024 ? 4 : 3)
    : (width >= 600 ? 3 : 2);

  // ─────────────────────────────────────────────────────────────────────────
  // MENU PANEL
  // ─────────────────────────────────────────────────────────────────────────
  const MenuPanel = () => (
    <View style={s.menuPanel}>
      {/* Search bar */}
      <View style={s.searchRow}>
        <View style={s.searchBox}>
          <MaterialIcons name="search" size={18} color={MUT} />
          <TextInput
            ref={searchRef}
            value={search}
            onChangeText={setSearch}
            placeholder="Search menu..."
            placeholderTextColor={MUT}
            style={s.searchInput}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')}>
              <MaterialIcons name="close" size={16} color={MUT} />
            </TouchableOpacity>
          ) : null}
        </View>
        <TouchableOpacity onPress={() => loadData(true)} style={s.refreshBtn}>
          {refreshing
            ? <ActivityIndicator size="small" color={C} />
            : <MaterialIcons name="refresh" size={20} color={MUT} />}
        </TouchableOpacity>
      </View>

      {/* Categories */}
      <View style={s.catsWrapper}>
        <FlatList
          data={[{ id: null, name: 'All' }, ...categories]}
          keyExtractor={i => String(i.id)}
          renderItem={({ item: cat }) => {
            const active = selectedCat === cat.id;
            return (
              <TouchableOpacity
                onPress={() => setSelectedCat(active && cat.id !== null ? null : cat.id)}
                style={[s.catChip, active && { backgroundColor: C, borderColor: C }]}
                activeOpacity={0.7}
              >
                <MaterialIcons
                  name={cat.id === null ? 'grid-view' : catMIcon(cat.name)}
                  size={18}
                  color={active ? WH : MUT}
                />
                <Text style={[s.catChipLabel, active && { color: WH }]} numberOfLines={1}>
                  {cat.name}
                </Text>
              </TouchableOpacity>
            );
          }}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: spacing.md, gap: 8 }}
        />
      </View>

      {/* Section heading */}
      <Text style={s.sectionHeading}>
        {search
          ? `${filteredItems.length} result${filteredItems.length !== 1 ? 's' : ''}`
          : selectedCat
            ? (categories.find(c => c.id === selectedCat)?.name || 'Category')
            : 'All Items'}
      </Text>

      {/* Items grid */}
      {filteredItems.length === 0 ? (
        <View style={s.emptyState}>
          <MaterialIcons name="restaurant" size={44} color={BD} />
          <Text style={s.emptyTxt}>No items found</Text>
        </View>
      ) : (
        <FlatList
          key={numCols}
          data={filteredItems}
          keyExtractor={i => String(i.id)}
          renderItem={({ item }) => {
            const qty  = cart[item.id]?.qty || 0;
            const panelW = isLandscape ? width - 300 : width;
            const cardW  = (panelW - spacing.lg * (numCols + 1)) / numCols;
            return (
              <View style={[s.menuCard, { width: cardW }]}>
                <View style={s.menuCardImg}>
                  <MaterialIcons name="restaurant" size={28} color={BD} />
                  {qty > 0 && (
                    <View style={s.qtyBadge}>
                      <Text style={s.qtyBadgeTxt}>{qty}</Text>
                    </View>
                  )}
                </View>
                <View style={s.menuCardBody}>
                  <Text style={s.menuCardName} numberOfLines={2}>{item.name}</Text>
                  <Text style={s.menuCardPrice}>{money(item.price)}</Text>
                  {qty === 0 ? (
                    <TouchableOpacity onPress={() => addItem(item)} style={s.addBtn} activeOpacity={0.8}>
                      <MaterialIcons name="add" size={14} color={WH} />
                      <Text style={s.addBtnTxt}>ADD</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={s.qtyRow}>
                      <TouchableOpacity onPress={() => decItem(item.id)} style={s.qtyBtn} activeOpacity={0.7}>
                        <MaterialIcons name="remove" size={14} color={C} />
                      </TouchableOpacity>
                      <Text style={s.qtyNum}>{qty}</Text>
                      <TouchableOpacity onPress={() => addItem(item)} style={[s.qtyBtn, { backgroundColor: C, borderColor: C }]} activeOpacity={0.7}>
                        <MaterialIcons name="add" size={14} color={WH} />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
            );
          }}
          numColumns={numCols}
          contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}
          columnWrapperStyle={numCols > 1 ? { gap: spacing.sm } : undefined}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // ORDER PANEL
  // ─────────────────────────────────────────────────────────────────────────
  const OrderPanel = () => (
    <View style={s.orderPanel}>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* Header */}
        <View style={s.orderHeader}>
          <Text style={s.orderTitle}>Order Details</Text>
          {cartEntries.length > 0 && (
            <TouchableOpacity onPress={clearCart}>
              <Text style={{ fontSize: 12, color: RD, fontWeight: '600' }}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Order type tabs */}
        <View style={s.orderTypeRow}>
          {ORDER_TYPES.map(({ key, icon, label }) => {
            const active = orderType === key;
            return (
              <TouchableOpacity key={key} onPress={() => setOrderType(key)}
                style={[s.orderTypeBtn, active && { borderColor: C, backgroundColor: CL }]}
                activeOpacity={0.7}>
                <MaterialIcons name={icon} size={15} color={active ? C : MUT} />
                <Text style={[s.orderTypeTxt, active && { color: C, fontWeight: '700' }]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Table selector */}
        {orderType === 'dine_in' && (
          <View style={{ paddingHorizontal: spacing.md, marginBottom: spacing.sm }}>
            <TouchableOpacity onPress={() => setShowTables(p => !p)} style={s.tableBtn}>
              <MaterialIcons name="table-restaurant" size={16} color={selTable ? C : MUT} />
              <Text style={[s.tableBtnTxt, selTable && { color: TXT }]} numberOfLines={1}>
                {selTable
                  ? `Table ${selTable.tableNumber || selTable.name || selTable.id?.slice(-4)}`
                  : 'Select table (optional)...'}
              </Text>
              <MaterialIcons name={showTables ? 'expand-less' : 'expand-more'} size={18} color={MUT} />
            </TouchableOpacity>
            {showTables && (
              <View style={s.tableDropdown}>
                <TouchableOpacity onPress={() => { setSelTable(null); setShowTables(false); }} style={s.tableOption}>
                  <Text style={{ fontSize: 13, color: MUT }}>No table (walk-in)</Text>
                </TouchableOpacity>
                {tables.map(t => (
                  <TouchableOpacity key={t.id} onPress={() => { setSelTable(t); setShowTables(false); }}
                    style={[s.tableOption, selTable?.id === t.id && { backgroundColor: CL }]}>
                    <Text style={[{ fontSize: 13, color: TXT }, selTable?.id === t.id && { color: C, fontWeight: '600' }]}>
                      Table {t.tableNumber || t.name || t.id?.slice(-4)}
                    </Text>
                    <Text style={{ fontSize: 11, color: MUT }}>{t.status || ''}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Customer info */}
        {orderType !== 'dine_in' && (
          <View style={{ paddingHorizontal: spacing.md, gap: spacing.sm, marginBottom: spacing.sm }}>
            <TextInput value={custName} onChangeText={setCustName}
              placeholder="Customer name..."
              placeholderTextColor={MUT}
              style={s.input} />
            {orderType === 'delivery' && (
              <TextInput value={custAddr} onChangeText={setCustAddr}
                placeholder="Delivery address..."
                placeholderTextColor={MUT}
                style={s.input} />
            )}
          </View>
        )}

        {/* Cart items */}
        <View style={{ paddingHorizontal: spacing.md }}>
          {cartEntries.length === 0 ? (
            <View style={s.cartEmpty}>
              <MaterialIcons name="shopping-bag" size={36} color={BD} />
              <Text style={{ fontSize: 14, color: MUT, marginTop: 8 }}>Cart is empty</Text>
            </View>
          ) : (
            cartEntries.map(({ item, qty }) => (
              <View key={item.id} style={s.cartRow}>
                <View style={s.cartQtyRow}>
                  <TouchableOpacity onPress={() => decItem(item.id)} style={s.cartQtyBtn}>
                    <MaterialIcons name="remove" size={12} color={MUT} />
                  </TouchableOpacity>
                  <Text style={s.cartQtyNum}>{qty}</Text>
                  <TouchableOpacity onPress={() => addItem(item)} style={[s.cartQtyBtn, { borderColor: C, backgroundColor: C }]}>
                    <MaterialIcons name="add" size={12} color={WH} />
                  </TouchableOpacity>
                </View>
                <Text style={s.cartItemName} numberOfLines={1}>{item.name}</Text>
                <Text style={s.cartItemPrice}>{money(item.price * qty)}</Text>
                <TouchableOpacity onPress={() => delItem(item.id)} style={{ padding: 4 }}>
                  <MaterialIcons name="delete-outline" size={16} color={RD} />
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        {/* Totals */}
        {cartEntries.length > 0 && (
          <View style={s.totalsSection}>
            {/* Discount */}
            <View style={s.discountRow}>
              <View style={s.discountInput}>
                <TextInput
                  value={discount}
                  onChangeText={setDiscount}
                  placeholder="Discount..."
                  placeholderTextColor={MUT}
                  keyboardType="numeric"
                  style={{ flex: 1, fontSize: 13, color: TXT, padding: 0 }}
                />
              </View>
              <TouchableOpacity onPress={() => setDiscPct(p => !p)} style={s.discTypeBtn}>
                <MaterialIcons name={discPct ? 'percent' : 'tag'} size={15} color={discPct ? C : MUT} />
              </TouchableOpacity>
            </View>

            {/* Subtotal */}
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>Sub Total</Text>
              <Text style={s.totalVal}>{money(subtotal)}</Text>
            </View>

            {discAmt > 0 && (
              <View style={s.totalRow}>
                <Text style={[s.totalLabel, { color: RD }]}>Discount {discPct ? `(${discount}%)` : ''}</Text>
                <Text style={[s.totalVal, { color: RD }]}>- {money(discAmt)}</Text>
              </View>
            )}

            <View style={[s.totalRow, { borderTopWidth: 1.5, borderTopColor: BD, paddingTop: spacing.sm, marginTop: 2 }]}>
              <Text style={[s.totalLabel, { fontSize: 15, fontWeight: '700', color: TXT }]}>Total</Text>
              <Text style={[s.totalVal, { fontSize: 15, fontWeight: '700', color: C }]}>{money(total)}</Text>
            </View>

            {/* Payment methods */}
            <View style={s.payRow}>
              {PAY_METHODS.map(({ id, icon, label }) => {
                const active = payMethod === id;
                return (
                  <TouchableOpacity key={id} onPress={() => setPayMethod(id)}
                    style={[s.payBtn, active && { borderColor: C, backgroundColor: CL }]}
                    activeOpacity={0.7}>
                    <MaterialIcons name={icon} size={15} color={active ? C : MUT} />
                    <Text style={[s.payBtnTxt, active && { color: C, fontWeight: '700' }]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Cash received */}
            {payMethod === 'Cash' && (
              <View style={{ marginBottom: spacing.sm }}>
                <TextInput
                  value={cashIn}
                  onChangeText={setCashIn}
                  placeholder="Cash received..."
                  placeholderTextColor={MUT}
                  keyboardType="numeric"
                  style={s.input}
                />
                {parseFloat(cashIn) > 0 && (
                  <View style={[s.totalRow, { marginTop: spacing.xs }]}>
                    <Text style={[s.totalLabel, { color: GR, fontWeight: '600' }]}>Change</Text>
                    <Text style={[s.totalVal, { color: GR, fontWeight: '700' }]}>{money(change)}</Text>
                  </View>
                )}
              </View>
            )}

            {/* Error */}
            {!!error && (
              <View style={s.errorBox}>
                <MaterialIcons name="error-outline" size={14} color={RD} />
                <Text style={s.errorTxt}>{error}</Text>
              </View>
            )}

            {/* Fire + Print row */}
            <View style={s.actionRow}>
              <TouchableOpacity onPress={handleFire} disabled={submitting} style={s.fireBtn} activeOpacity={0.8}>
                <MaterialIcons name="whatshot" size={16} color={AMB} />
                <Text style={s.fireBtnTxt}>Fire</Text>
              </TouchableOpacity>
              <TouchableOpacity disabled={submitting} style={s.printBtn} activeOpacity={0.8}>
                <MaterialIcons name="print" size={18} color={MUT} />
              </TouchableOpacity>
            </View>

            {/* Charge button */}
            <TouchableOpacity
              onPress={handleCharge}
              disabled={submitting || !cartEntries.length}
              style={[s.chargeBtn, (submitting || !cartEntries.length) && { backgroundColor: '#9CA3AF' }]}
              activeOpacity={0.85}
            >
              {submitting
                ? <ActivityIndicator size="small" color={WH} />
                : <MaterialIcons name="check-circle" size={18} color={WH} />}
              <Text style={s.chargeBtnTxt}>Charge {money(total)}</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // LOADING
  // ─────────────────────────────────────────────────────────────────────────
  if (loading) return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: BG }}>
      <StatusBar barStyle="dark-content" />
      <ActivityIndicator size="large" color={C} />
    </View>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // MAIN LAYOUT
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar barStyle="dark-content" />

      {/* ── Screen header ─────────────────────────────────────────────────── */}
      <View style={[s.topBar, { paddingTop: topInset + 4 }]}>
        <View style={s.logoBox}>
          <MaterialIcons name="point-of-sale" size={18} color={WH} />
        </View>
        <View style={{ marginLeft: 10 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: TXT }}>Quick Order</Text>
          <Text style={{ fontSize: 11, color: MUT }}>Select items and charge</Text>
        </View>
        {cartCount > 0 && (
          <View style={s.cartSummary}>
            <MaterialIcons name="shopping-cart" size={16} color={C} />
            <Text style={s.cartSummaryTxt}>{cartCount} item{cartCount !== 1 ? 's' : ''}</Text>
          </View>
        )}
      </View>

      {/* ── Main content ──────────────────────────────────────────────────── */}
      {isLandscape ? (
        // LANDSCAPE: side-by-side
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <MenuPanel />
          <OrderPanel />
        </View>
      ) : (
        // PORTRAIT: tab switcher
        <View style={{ flex: 1 }}>
          {activeTab === 'menu' ? <MenuPanel /> : <OrderPanel />}

          <View style={s.portraitTabs}>
            <TouchableOpacity
              style={[s.portraitTab, activeTab === 'menu' && s.portraitTabActive]}
              onPress={() => setActiveTab('menu')}
              activeOpacity={0.8}
            >
              <MaterialIcons name="grid-view" size={20} color={activeTab === 'menu' ? C : MUT} />
              <Text style={[s.portraitTabTxt, activeTab === 'menu' && { color: C }]}>Menu</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.portraitTab, activeTab === 'order' && s.portraitTabActive]}
              onPress={() => setActiveTab('order')}
              activeOpacity={0.8}
            >
              <View style={{ position: 'relative' }}>
                <MaterialIcons name="shopping-cart" size={20} color={activeTab === 'order' ? C : MUT} />
                {cartCount > 0 && (
                  <View style={s.cartCountBadge}>
                    <Text style={s.cartCountTxt}>{cartCount}</Text>
                  </View>
                )}
              </View>
              <Text style={[s.portraitTabTxt, activeTab === 'order' && { color: C }]}>
                Order{cartCount > 0 ? ` (${cartCount})` : ''}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  // ── Top bar ────────────────────────────────────────────────────────────────
  topBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingBottom: 10,
    backgroundColor: WH, borderBottomWidth: 1, borderBottomColor: BD,
  },
  logoBox: {
    width: 32, height: 32, borderRadius: 8, backgroundColor: C,
    alignItems: 'center', justifyContent: 'center',
  },
  cartSummary: {
    marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: CL, borderRadius: 20, borderWidth: 1, borderColor: C + '40',
  },
  cartSummaryTxt: { fontSize: 12, fontWeight: '700', color: C },

  // ── Menu panel ─────────────────────────────────────────────────────────────
  menuPanel: { flex: 1, backgroundColor: BG },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: WH, borderBottomWidth: 1, borderBottomColor: BD,
  },
  searchBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#F9FAFB', borderRadius: 8, borderWidth: 1, borderColor: BD,
    paddingHorizontal: 10, paddingVertical: 8,
  },
  searchInput: { flex: 1, fontSize: 13, color: TXT, padding: 0 },
  refreshBtn: {
    width: 36, height: 36, borderRadius: 8, borderWidth: 1, borderColor: BD,
    backgroundColor: WH, alignItems: 'center', justifyContent: 'center',
  },

  // ── Categories ─────────────────────────────────────────────────────────────
  catsWrapper: {
    backgroundColor: WH, borderBottomWidth: 1, borderBottomColor: BD,
    paddingVertical: spacing.sm,
  },
  catChip: {
    flexDirection: 'column', alignItems: 'center', gap: 3,
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 10, borderWidth: 1.5, borderColor: BD,
    backgroundColor: WH, minWidth: 68,
  },
  catChipLabel: { fontSize: 10, fontWeight: '600', color: TXT, maxWidth: 64 },
  sectionHeading: {
    fontSize: 14, fontWeight: '700', color: TXT,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyTxt:   { fontSize: 15, color: MUT, marginTop: 10 },

  // ── Menu item card ─────────────────────────────────────────────────────────
  menuCard: {
    backgroundColor: WH, borderRadius: 12, overflow: 'hidden',
    borderWidth: 1, borderColor: BD, ...shadow.sm,
  },
  menuCardImg: {
    height: 100, backgroundColor: '#F3F4F6',
    alignItems: 'center', justifyContent: 'center',
  },
  qtyBadge: {
    position: 'absolute', top: 7, right: 7,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: C, alignItems: 'center', justifyContent: 'center',
  },
  qtyBadgeTxt:  { fontSize: 11, fontWeight: '700', color: WH },
  menuCardBody: { padding: 9, gap: 3 },
  menuCardName: { fontSize: 11, fontWeight: '600', color: TXT, lineHeight: 15 },
  menuCardPrice:{ fontSize: 11, fontWeight: '700', color: C },
  addBtn: {
    marginTop: 6, paddingVertical: 7, borderRadius: 7,
    backgroundColor: C, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  addBtnTxt: { fontSize: 11, fontWeight: '700', color: WH },
  qtyRow: {
    marginTop: 6, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', backgroundColor: CL, borderRadius: 7, padding: 3,
  },
  qtyBtn: {
    width: 26, height: 26, borderRadius: 6,
    borderWidth: 1, borderColor: BD, backgroundColor: WH,
    alignItems: 'center', justifyContent: 'center',
  },
  qtyNum: { fontSize: 13, fontWeight: '700', color: C },

  // ── Order panel ────────────────────────────────────────────────────────────
  orderPanel: {
    width: 300, backgroundColor: WH,
    borderLeftWidth: 1, borderLeftColor: BD,
  },
  orderHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: BD,
  },
  orderTitle:   { fontSize: 15, fontWeight: '700', color: TXT },
  orderTypeRow: {
    flexDirection: 'row', gap: 6,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  orderTypeBtn: {
    flex: 1, paddingVertical: 7, borderRadius: 8,
    borderWidth: 1.5, borderColor: BD, backgroundColor: WH,
    alignItems: 'center', gap: 3,
  },
  orderTypeTxt: { fontSize: 10, fontWeight: '500', color: MUT },

  // ── Table selector ─────────────────────────────────────────────────────────
  tableBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    padding: 9, borderRadius: 8, borderWidth: 1, borderColor: BD,
    backgroundColor: '#F9FAFB',
  },
  tableBtnTxt: { flex: 1, fontSize: 13, color: MUT },
  tableDropdown: {
    marginTop: 4, borderWidth: 1, borderColor: BD, borderRadius: 8,
    backgroundColor: WH, overflow: 'hidden', ...shadow.md,
  },
  tableOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 10, borderBottomWidth: 1, borderBottomColor: BD,
  },

  // ── Input ──────────────────────────────────────────────────────────────────
  input: {
    padding: 9, borderRadius: 8, borderWidth: 1, borderColor: BD,
    backgroundColor: '#F9FAFB', fontSize: 13, color: TXT,
  },

  // ── Cart ───────────────────────────────────────────────────────────────────
  cartEmpty: { alignItems: 'center', paddingVertical: 40 },
  cartRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  cartQtyRow:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cartQtyBtn: {
    width: 22, height: 22, borderRadius: 5,
    borderWidth: 1, borderColor: BD, backgroundColor: WH,
    alignItems: 'center', justifyContent: 'center',
  },
  cartQtyNum:    { fontSize: 13, fontWeight: '700', color: TXT, minWidth: 16, textAlign: 'center' },
  cartItemName:  { flex: 1, fontSize: 12, color: TXT },
  cartItemPrice: { fontSize: 12, fontWeight: '600', color: TXT },

  // ── Totals section ─────────────────────────────────────────────────────────
  totalsSection: {
    padding: spacing.md, gap: spacing.sm,
    borderTopWidth: 1, borderTopColor: BD, marginTop: spacing.sm,
  },
  discountRow: {
    flexDirection: 'row', borderWidth: 1, borderColor: BD,
    borderRadius: 8, overflow: 'hidden',
  },
  discountInput: { flex: 1, paddingHorizontal: 10, paddingVertical: 8 },
  discTypeBtn: {
    paddingHorizontal: 12, borderLeftWidth: 1, borderLeftColor: BD,
    backgroundColor: '#F9FAFB', alignItems: 'center', justifyContent: 'center',
  },
  totalRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel:{ fontSize: 13, color: MUT },
  totalVal:  { fontSize: 13, fontWeight: '600', color: TXT },

  // ── Payment methods ────────────────────────────────────────────────────────
  payRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  payBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingVertical: 7, paddingHorizontal: 10,
    borderRadius: 8, borderWidth: 1.5, borderColor: BD, backgroundColor: WH,
  },
  payBtnTxt: { fontSize: 12, color: MUT },

  // ── Error ──────────────────────────────────────────────────────────────────
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    padding: 9, borderRadius: 7, backgroundColor: '#FEF2F2',
  },
  errorTxt: { fontSize: 12, color: RD, flex: 1 },

  // ── Action buttons ─────────────────────────────────────────────────────────
  actionRow: { flexDirection: 'row', gap: 8 },
  fireBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 11, borderRadius: 10, borderWidth: 1.5, borderColor: BD, backgroundColor: WH,
  },
  fireBtnTxt: { fontSize: 13, fontWeight: '600', color: AMB },
  printBtn: {
    paddingVertical: 11, paddingHorizontal: 14, borderRadius: 10,
    borderWidth: 1.5, borderColor: BD, backgroundColor: WH,
    alignItems: 'center', justifyContent: 'center',
  },
  chargeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, borderRadius: 10, backgroundColor: C,
  },
  chargeBtnTxt: { fontSize: 14, fontWeight: '700', color: WH },

  // ── Portrait tab bar ───────────────────────────────────────────────────────
  portraitTabs: {
    flexDirection: 'row', backgroundColor: WH,
    borderTopWidth: 1, borderTopColor: BD,
  },
  portraitTab: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, gap: 3,
  },
  portraitTabActive:{ borderTopWidth: 2, borderTopColor: C },
  portraitTabTxt:   { fontSize: 11, fontWeight: '600', color: MUT },

  // ── Cart count badge ───────────────────────────────────────────────────────
  cartCountBadge: {
    position: 'absolute', top: -5, right: -7,
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: RD, alignItems: 'center', justifyContent: 'center',
  },
  cartCountTxt: { fontSize: 9, fontWeight: '700', color: WH },
});

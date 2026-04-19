// ════════════════════════════════════════════════════════════════════════════
// WaitressMenu — browse + add items to orders
// ════════════════════════════════════════════════════════════════════════════
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, RefreshControl, TextInput,
  Dimensions, Modal, StatusBar, Image,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { menuAPI, tablesAPI, ordersAPI } from '../../api/client';
import { colors, spacing, radius, shadow, topInset } from '../../utils/theme';
import ConfirmDialog from '../../components/ConfirmDialog';
import { useTranslation } from '../../context/LanguageContext';

const { width: SW } = Dimensions.get('window');

const fmtMoney = (n) => Math.round(n || 0).toLocaleString('uz-UZ') + ' so\'m';

const IMG_BASE = 'http://10.0.2.2:3000';

// Resolve image URLs for Android emulator — localhost/127.0.0.1 can't be reached
const resolveImgUrl = (url) => {
  if (!url) return null;
  return url
    .replace('http://localhost:', 'http://10.0.2.2:')
    .replace('http://127.0.0.1:', 'http://10.0.2.2:')
    .replace(/^\/uploads/, IMG_BASE + '/uploads');
};

// ── Table status config ───────────────────────────────────────────────────────
const ST = {
  free:     { color: '#16A34A', bg: '#DCFCE7', icon: 'check-circle',      label: 'Free'     },
  occupied: { color: '#DC2626', bg: '#FEE2E2', icon: 'people',            label: 'Occupied' },
  reserved: { color: '#2563EB', bg: '#DBEAFE', icon: 'event',             label: 'Reserved' },
  cleaning: { color: '#D97706', bg: '#FEF3C7', icon: 'cleaning-services', label: 'Cleaning' },
};

// ════════════════════════════════════════════════════════════════════════════
// Sub-components
// ════════════════════════════════════════════════════════════════════════════

// ── Menu item card ────────────────────────────────────────────────────────────
function MenuItemCard({ item, qty, onAdd, onRemove, onDetail }) {
  const { t } = useTranslation();
  const avail = item.is_available !== false;
  const imgUri = resolveImgUrl(item.image_url);
  const selected = qty > 0;

  return (
    <TouchableOpacity
      onPress={() => avail && onAdd(item)}
      onLongPress={() => onDetail(item)}
      activeOpacity={0.88}
      style={[styles.menuCard, selected && styles.menuCardSelected, !avail && styles.menuCardUnavail]}
    >
      {/* Image or letter avatar — full width at top */}
      {imgUri ? (
        <Image source={{ uri: imgUri }} style={styles.menuImg} resizeMode="contain" />
      ) : (
        <View style={[styles.menuAvatarWrap]}>
          <View style={[styles.menuAvatar, {
            backgroundColor: selected ? colors.primary : avail ? colors.primaryLight : '#F3F4F6',
          }]}>
            <Text style={{ fontSize: 28, fontWeight: '800', color: selected ? colors.white : avail ? colors.primary : colors.textMuted }}>
              {item.name.charAt(0).toUpperCase()}
            </Text>
          </View>
        </View>
      )}

      {/* Card body */}
      <View style={styles.menuCardBody}>
        <Text style={[styles.menuName, !avail && { color: colors.textMuted }]} numberOfLines={2}>
          {item.name}
        </Text>
        <Text style={[styles.menuPrice, !avail && { color: colors.textMuted }]}>
          {fmtMoney(item.price)}
        </Text>

        {/* Qty controls or add hint */}
        {qty > 0 ? (
          <View style={styles.qtyRow}>
            <TouchableOpacity onPress={() => onRemove(item.id)} style={styles.qtyBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <MaterialIcons name="remove" size={15} color={colors.primary} />
            </TouchableOpacity>
            <Text style={styles.qtyNum}>{qty}</Text>
            <TouchableOpacity onPress={() => onAdd(item)} style={styles.qtyBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <MaterialIcons name="add" size={15} color={colors.primary} />
            </TouchableOpacity>
          </View>
        ) : avail ? (
          <View style={styles.addHint}>
            <MaterialIcons name="add-circle-outline" size={15} color={colors.primary} />
            <Text style={styles.addHintTxt}>{t('waitress.menu.tapToAdd', 'Tap to add')}</Text>
          </View>
        ) : null}
      </View>

      {/* Unavailable overlay */}
      {!avail && (
        <View style={styles.unavailOverlay}>
          <Text style={styles.unavailOverlayTxt}>{t('waitress.menu.unavailable', 'Unavailable')}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ── Item detail bottom sheet ──────────────────────────────────────────────────
function ItemSheet({ item, qty, onAdd, onRemove, onClose }) {
  const { t } = useTranslation();
  if (!item) return null;
  const avail = item.is_available !== false;
  return (
    <View style={styles.itemSheet}>
      <View style={styles.sheetHandle} />
      {item.image_url ? (
        <Image
          source={{ uri: resolveImgUrl(item.image_url) }}
          style={styles.itemImgLg}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.itemAvatarLg, { backgroundColor: avail ? (qty > 0 ? colors.primary : colors.primaryLight) : '#F3F4F6' }]}>
          <Text style={{ fontSize: 38, fontWeight: '800', color: avail ? (qty > 0 ? colors.white : colors.primary) : colors.textMuted }}>
            {item.name.charAt(0).toUpperCase()}
          </Text>
        </View>
      )}
      <Text style={styles.itemSheetName}>{item.name}</Text>
      <Text style={styles.itemSheetPrice}>{fmtMoney(item.price)}</Text>
      {item.category_name && (
        <View style={styles.itemCatBadge}>
          <MaterialIcons name="category" size={12} color={colors.primary} style={{ marginRight: 4 }} />
          <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '600' }}>{item.category_name}</Text>
        </View>
      )}
      {item.description ? (
        <Text style={styles.itemDesc}>{item.description}</Text>
      ) : null}
      {!avail ? (
        <View style={styles.unavailBadge}>
          <MaterialIcons name="block" size={14} color="#DC2626" style={{ marginRight: 4 }} />
          <Text style={{ color: '#DC2626', fontWeight: '700', fontSize: 13 }}>{t('waitress.menu.currentlyUnavailable', 'Currently unavailable')}</Text>
        </View>
      ) : qty > 0 ? (
        <View style={styles.sheetQtyRow}>
          <TouchableOpacity onPress={() => onRemove(item.id)} style={styles.sheetQtyBtn}>
            <MaterialIcons name="remove" size={20} color={colors.primary} />
          </TouchableOpacity>
          <Text style={styles.sheetQtyNum}>{qty}</Text>
          <TouchableOpacity onPress={() => onAdd(item)} style={styles.sheetQtyBtn}>
            <MaterialIcons name="add" size={20} color={colors.primary} />
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity onPress={() => { onAdd(item); onClose(); }} style={styles.addToCartBtn}>
          <MaterialIcons name="add-shopping-cart" size={18} color={colors.white} style={{ marginRight: 8 }} />
          <Text style={styles.addToCartTxt}>{t('waitress.menu.addToCart', 'Add to Cart')}</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
        <MaterialIcons name="close" size={18} color={colors.textMuted} />
        <Text style={{ color: colors.textMuted, fontWeight: '600', marginLeft: 6, fontSize: 14 }}>{t('common.close', 'Close')}</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Table picker modal ────────────────────────────────────────────────────────
function TablePickerModal({ visible, onSelect, onClose }) {
  const { t } = useTranslation();
  const [tables,      setTables]      = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [tableSearch, setTableSearch] = useState('');

  useEffect(() => {
    if (!visible) { setTableSearch(''); return; }
    setLoading(true);
    tablesAPI.getAll()
      .then(r => setTables(Array.isArray(r.data) ? r.data : []))
      .catch(() => setTables([]))
      .finally(() => setLoading(false));
  }, [visible]);

  // Free + occupied only, filtered by search
  const shown = tables
    .filter(tb => tb.status === 'free' || tb.status === 'occupied')
    .filter(tb => {
      const q = tableSearch.trim().toLowerCase();
      if (!q) return true;
      const name = String(tb.table_number || tb.name || '').toLowerCase();
      return name.includes(q);
    });

  // Translate status labels
  const statusLabel = (status) => {
    switch (status) {
      case 'free':     return t('waitress.tables.free', 'FREE');
      case 'occupied': return t('waitress.tables.occupied', 'OCCUPIED');
      case 'reserved': return t('waitress.tables.reserved', 'RESERVED');
      case 'cleaning': return t('waitress.tables.cleaning', 'CLEANING');
      default:         return ST[status]?.label || '';
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={styles.pickerSheet}>
        <View style={styles.sheetHandle} />
        <Text style={styles.pickerTitle}>{t('cashier.walkin.selectTable', 'Select Table')}</Text>
        <Text style={styles.pickerSub}>{t('waitress.menu.pickTableToSend', 'Pick a table to send your order to')}</Text>

        {/* Search bar */}
        <View style={styles.tableSearchRow}>
          <MaterialIcons name="search" size={18} color={colors.textMuted} style={{ marginRight: 6 }} />
          <TextInput
            style={styles.tableSearchInput}
            placeholder={t('placeholders.searchTableNumber','Search by table number…')}
            placeholderTextColor={colors.textMuted}
            value={tableSearch}
            onChangeText={setTableSearch}
            returnKeyType="search"
            autoCorrect={false}
          />
          {tableSearch.length > 0 && (
            <TouchableOpacity onPress={() => setTableSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <MaterialIcons name="cancel" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: 32 }} />
        ) : shown.length === 0 ? (
          <View style={{ alignItems: 'center', marginVertical: 32 }}>
            <MaterialIcons name={tableSearch ? 'search-off' : 'table-restaurant'} size={32} color={colors.border} />
            <Text style={{ color: colors.textMuted, marginTop: 8, fontSize: 14 }}>
              {tableSearch
                ? t('waitress.menu.noTablesMatching', 'No tables matching "{q}"').replace('{q}', tableSearch)
                : t('waitress.menu.noAvailableTables', 'No available tables')}
            </Text>
          </View>
        ) : (
          <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ paddingBottom: 16 }}>
            {shown.map(table => {
              const st = ST[table.status] || ST.free;
              return (
                <TouchableOpacity
                  key={table.id}
                  onPress={() => onSelect(table)}
                  activeOpacity={0.8}
                  style={styles.tableRow}
                >
                  <View style={[styles.tableIconWrap, { backgroundColor: st.bg }]}>
                    <MaterialIcons name={st.icon} size={20} color={st.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.tableRowName}>
                      {t('cashier.walkin.table', 'Table')} {table.table_number || table.name}
                    </Text>
                    <Text style={[styles.tableRowStatus, { color: st.color }]}>
                      {statusLabel(table.status)}{table.status === 'occupied' && table.order_total > 0 ? ` · ${fmtMoney(table.order_total)}` : ''}
                    </Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={22} color={colors.border} />
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

// ── Guest count sheet ─────────────────────────────────────────────────────────
function GuestCountSheet({ visible, table, onConfirm, onClose }) {
  const { t } = useTranslation();
  const [count, setCount] = useState(2);
  useEffect(() => { if (visible) setCount(2); }, [visible]);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={styles.pickerSheet}>
        <View style={styles.sheetHandle} />
        <Text style={styles.pickerTitle}>{t('cashier.walkin.table', 'Table')} {table?.table_number || table?.name}</Text>
        <Text style={styles.pickerSub}>{t('waitress.menu.howManyGuests', 'How many guests?')}</Text>
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
          {t('waitress.menu.selectGuestRange', 'Select number of guests (1–20)')}
        </Text>
        <TouchableOpacity onPress={() => onConfirm(count)} style={styles.addToCartBtn}>
          <MaterialIcons name="send" size={18} color={colors.white} style={{ marginRight: 8 }} />
          <Text style={styles.addToCartTxt}>{t('waitress.menu.sendOrderBtn', 'Send Order')}</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN SCREEN
// ════════════════════════════════════════════════════════════════════════════
export default function WaitressMenu() {
  const { t } = useTranslation();
  const [categories, setCategories] = useState([]);
  const [menuItems,  setMenuItems]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selCat,     setSelCat]     = useState(null);
  const [selItem,    setSelItem]    = useState(null);
  const [search,     setSearch]     = useState('');

  // Cart
  const [cart, setCart] = useState([]);

  // Table picker flow
  const [showTablePicker, setShowTablePicker] = useState(false);
  const [showGuestSheet,  setShowGuestSheet]  = useState(false);
  const [targetTable,     setTargetTable]     = useState(null);
  const [sending,         setSending]         = useState(false);

  // Dialog state
  const [dialog, setDialog] = useState(null);

  // ── Load menu ─────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      const [cRes, iRes] = await Promise.all([menuAPI.getCategories(), menuAPI.getItems()]);
      setCategories(cRes.data || []);
      setMenuItems(iRes.data  || []);
    } catch { /* silent */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Cart helpers ──────────────────────────────────────────────────────────
  const addToCart = useCallback((item) => {
    setCart(prev => {
      const idx = prev.findIndex(c => c.menu_item_id === item.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [...prev, { menu_item_id: item.id, name: item.name, price: parseFloat(item.price), quantity: 1 }];
    });
  }, []);

  const removeFromCart = useCallback((itemId) => {
    setCart(prev => {
      const idx = prev.findIndex(c => c.menu_item_id === itemId);
      if (idx < 0) return prev;
      const next = [...prev];
      if (next[idx].quantity > 1) next[idx] = { ...next[idx], quantity: next[idx].quantity - 1 };
      else next.splice(idx, 1);
      return next;
    });
  }, []);

  const getQty = useCallback((itemId) => cart.find(c => c.menu_item_id === itemId)?.quantity || 0, [cart]);

  const cartCount = cart.reduce((s, c) => s + c.quantity, 0);
  const cartTotal = cart.reduce((s, c) => s + c.price * c.quantity, 0);

  // ── Table select ─────────────────────────────────────────────────────────
  const handleTableSelect = useCallback(async (table) => {
    setShowTablePicker(false);
    setTargetTable(table);

    if (table.status === 'free') {
      // Need guest count first
      setShowGuestSheet(true);
    } else if (table.status === 'occupied') {
      // Find active order on that table → add items
      setSending(true);
      try {
        const res = await ordersAPI.getByTable(table.id);
        const active = (res.data || []).filter(o => !['paid', 'cancelled'].includes(o.status));
        if (active.length === 0) {
          // No active order → treat as free table
          setSending(false);
          setShowGuestSheet(true);
          return;
        }
        await ordersAPI.addItems(active[0].id, cart.map(c => ({ menu_item_id: c.menu_item_id, quantity: c.quantity, unit_price: c.price })));
        setCart([]);
        setDialog({
          title: t('waitress.menu.orderSent', 'Order Sent!'),
          message: t('waitress.menu.itemsAddedToTable', '{count} item(s) added to Table {table}.')
            .replace('{count}', String(cartCount))
            .replace('{table}', String(table.table_number || table.name)),
          type: 'success',
        });
      } catch (e) {
        setDialog({
          title: t('common.error', 'Error'),
          message: e?.response?.data?.error || t('waitress.menu.failedToSendOrder', 'Failed to send order. Please try again.'),
          type: 'error',
        });
      } finally {
        setSending(false);
        setTargetTable(null);
      }
    }
  }, [cart, cartCount]);

  const handleGuestConfirm = useCallback(async (guestCount) => {
    setShowGuestSheet(false);
    if (!targetTable) return;
    setSending(true);
    try {
      await tablesAPI.open(targetTable.id, { guests_count: guestCount });
      await ordersAPI.create({
        table_id: targetTable.id,
        items: cart.map(c => ({ menu_item_id: c.menu_item_id, quantity: c.quantity, unit_price: c.price })),
      });
      setCart([]);
      setDialog({
        title: t('waitress.menu.orderSent', 'Order Sent!'),
        message: t('waitress.menu.newOrderCreatedFor', 'New order created for Table {table} ({count} guest(s)).')
          .replace('{table}', String(targetTable.table_number || targetTable.name))
          .replace('{count}', String(guestCount)),
        type: 'success',
      });
    } catch (e) {
      setDialog({
        title: t('common.error', 'Error'),
        message: e?.response?.data?.error || t('waitress.menu.failedToCreateOrder', 'Failed to create order. Please try again.'),
        type: 'error',
      });
    } finally {
      setSending(false);
      setTargetTable(null);
    }
  }, [targetTable, cart]);

  // ── Filtered items ────────────────────────────────────────────────────────
  const filtered = menuItems.filter(i => {
    const inCat    = !selCat || String(i.category_id) === String(selCat);
    const inSearch = !search.trim() || i.name.toLowerCase().includes(search.toLowerCase());
    return inCat && inSearch;
  });

  const availCount     = menuItems.filter(i => i.is_available !== false).length;
  const totalCatCount  = categories.length;
  const catCount = (catId) => menuItems.filter(i => String(i.category_id) === String(catId)).length;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ color: colors.textMuted, marginTop: 12 }}>{t('waitress.menu.loadingMenu', 'Loading menu…')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('waitress.menu.title', 'Menu')}</Text>
        <Text style={styles.headerSub}>
          {t('waitress.menu.itemsAcrossCategories', '{items} items across {cats} categories')
            .replace('{items}', String(availCount))
            .replace('{cats}', String(totalCatCount))}
        </Text>
        <View style={styles.searchRow}>
          <MaterialIcons name="search" size={18} color={colors.textMuted} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder={t('placeholders.searchDishes','Search dishes…')}
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
            autoCorrect={false}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <MaterialIcons name="close" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Category chips ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.catBar}
        style={{ flexGrow: 0 }}
      >
        <TouchableOpacity
          onPress={() => setSelCat(null)}
          style={[styles.catChip, !selCat && styles.catChipActive]}
        >
          <Text style={[styles.catTxt, !selCat && styles.catTxtActive]}>{t('common.all', 'All')}</Text>
          <View style={[styles.catBadge, !selCat && styles.catBadgeActive]}>
            <Text style={[styles.catBadgeTxt, !selCat && styles.catBadgeTxtActive]}>{menuItems.length}</Text>
          </View>
        </TouchableOpacity>
        {categories.map(cat => (
          <TouchableOpacity
            key={cat.id}
            onPress={() => setSelCat(cat.id)}
            style={[styles.catChip, selCat === cat.id && styles.catChipActive]}
          >
            <Text style={[styles.catTxt, selCat === cat.id && styles.catTxtActive]}>{cat.name}</Text>
            <View style={[styles.catBadge, selCat === cat.id && styles.catBadgeActive]}>
              <Text style={[styles.catBadgeTxt, selCat === cat.id && styles.catBadgeTxtActive]}>{catCount(cat.id)}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ── Cart summary bar (visible when items in cart) ── */}
      {cartCount > 0 && (
        <View style={styles.cartSummaryBar}>
          <View style={styles.cartSummaryLeft}>
            <View style={styles.cartCountBadge}>
              <Text style={styles.cartCountTxt}>{cartCount}</Text>
            </View>
            <View>
              <Text style={styles.cartSummaryItems}>
                {t('waitress.menu.itemsInCart', '{count} item(s) in cart').replace('{count}', String(cartCount))}
              </Text>
              <Text style={styles.cartSummaryTotal}>{fmtMoney(cartTotal)}</Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={() => setCart([])}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            style={{ marginRight: spacing.sm }}
          >
            <MaterialIcons name="delete-outline" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      )}

      {/* ── Items grid ── */}
      <FlatList
        style={{ flex: 1 }}
        data={filtered}
        keyExtractor={i => String(i.id)}
        numColumns={2}
        contentContainerStyle={{ padding: spacing.md, paddingBottom: cartCount > 0 ? 100 : 40 }}
        columnWrapperStyle={{ gap: spacing.md, marginBottom: spacing.md }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={colors.primary}
          />
        }
        renderItem={({ item }) => (
          <MenuItemCard
            item={item}
            qty={getQty(item.id)}
            onAdd={addToCart}
            onRemove={removeFromCart}
            onDetail={setSelItem}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <MaterialIcons name={search ? 'search-off' : 'menu-book'} size={48} color={colors.border} />
            <Text style={styles.emptyTxt}>
              {search
                ? t('waitress.menu.noResultsFor', 'No results for "{q}"').replace('{q}', search)
                : t('waitress.menu.noItemsFound', 'No items found')}
            </Text>
          </View>
        }
      />

      {/* ── Floating "Send to Table" button ── */}
      {cartCount > 0 && (
        <View style={styles.floatBar}>
          <View>
            <Text style={styles.floatBarItems}>
              {t('waitress.menu.itemsCount', '{count} item(s)').replace('{count}', String(cartCount))}
            </Text>
            <Text style={styles.floatBarTotal}>{fmtMoney(cartTotal)}</Text>
          </View>
          <TouchableOpacity
            onPress={() => setShowTablePicker(true)}
            disabled={sending}
            style={[styles.sendTableBtn, sending && { opacity: 0.7 }]}
            activeOpacity={0.85}
          >
            {sending
              ? <ActivityIndicator size="small" color={colors.white} />
              : <>
                  <MaterialIcons name="table-restaurant" size={18} color={colors.white} style={{ marginRight: 6 }} />
                  <Text style={styles.sendTableTxt}>{t('waitress.menu.sendToTable', 'Send to Table')}</Text>
                </>
            }
          </TouchableOpacity>
        </View>
      )}

      {/* ── Item detail sheet ── */}
      {selItem && (
        <>
          <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setSelItem(null)} />
          <ItemSheet
            item={selItem}
            qty={getQty(selItem.id)}
            onAdd={addToCart}
            onRemove={removeFromCart}
            onClose={() => setSelItem(null)}
          />
        </>
      )}

      {/* ── Table picker modal ── */}
      <TablePickerModal
        visible={showTablePicker}
        onSelect={handleTableSelect}
        onClose={() => setShowTablePicker(false)}
      />

      {/* ── Guest count sheet ── */}
      <GuestCountSheet
        visible={showGuestSheet}
        table={targetTable}
        onConfirm={handleGuestConfirm}
        onClose={() => { setShowGuestSheet(false); setTargetTable(null); }}
      />

      <ConfirmDialog dialog={dialog} onClose={() => setDialog(null)} />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center:    { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Header
  header:      { backgroundColor: colors.primary, paddingTop: topInset + 8, paddingBottom: spacing.md, paddingHorizontal: spacing.lg },
  headerTitle: { color: colors.white, fontSize: 26, fontWeight: '800', marginBottom: 2 },
  headerSub:   { color: 'rgba(255,255,255,0.75)', fontSize: 13, marginBottom: spacing.md },
  searchRow:   { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 8, marginBottom: 4 },
  searchInput: { flex: 1, fontSize: 14, color: colors.textDark, padding: 0 },

  // Category chips
  catBar:            { paddingHorizontal: spacing.md, paddingVertical: 10, gap: spacing.sm, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border },
  catChip:           { flexDirection: 'row', alignItems: 'center', height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: colors.background, borderWidth: 1.5, borderColor: colors.border, gap: 5 },
  catChipActive:     { backgroundColor: colors.primary, borderColor: colors.primary },
  catTxt:            { fontSize: 12, fontWeight: '600', color: colors.textMuted, lineHeight: 16 },
  catTxtActive:      { color: colors.white },
  catBadge:          { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  catBadgeActive:    { backgroundColor: 'rgba(255,255,255,0.3)' },
  catBadgeTxt:       { fontSize: 10, fontWeight: '700', color: colors.textMuted },
  catBadgeTxtActive: { color: colors.white },

  // Cart summary bar (below category chips)
  cartSummaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.primary + '33',
  },
  cartSummaryLeft:  { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cartCountBadge:   { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  cartCountTxt:     { color: colors.white, fontSize: 13, fontWeight: '800' },
  cartSummaryItems: { fontSize: 12, fontWeight: '600', color: colors.primary },
  cartSummaryTotal: { fontSize: 14, fontWeight: '800', color: colors.primary },

  // Menu grid card
  menuCard:         { width: (SW - spacing.md * 3) / 2, backgroundColor: colors.white, borderRadius: radius.lg, ...shadow.card, overflow: 'hidden', borderWidth: 1.5, borderColor: 'transparent' },
  menuCardSelected: { borderColor: colors.primary, backgroundColor: '#F0F7FF' },
  menuCardUnavail:  { opacity: 0.7 },
  menuAvatarWrap:   { alignItems: 'center', paddingTop: spacing.md, paddingBottom: 2 },
  menuAvatar:       { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  menuImg:          { width: '100%', height: 120, backgroundColor: '#F1F5F9' },
  menuCardBody:     { paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, alignItems: 'center' },
  menuName:         { fontSize: 13, fontWeight: '700', color: colors.textDark, textAlign: 'center', marginBottom: 3 },
  menuPrice:        { fontSize: 13, fontWeight: '800', color: colors.primary, textAlign: 'center' },
  addHint:          { flexDirection: 'row', alignItems: 'center', marginTop: 5, gap: 3 },
  addHintTxt:       { fontSize: 11, color: colors.primary, fontWeight: '600' },

  // Qty row on card
  qtyRow:  { flexDirection: 'row', alignItems: 'center', marginTop: 8, backgroundColor: colors.primaryLight, borderRadius: radius.full, paddingHorizontal: 4 },
  qtyBtn:  { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  qtyNum:  { fontSize: 14, fontWeight: '800', color: colors.primary, minWidth: 20, textAlign: 'center' },

  // Unavailable overlay on card
  unavailOverlay:    { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.7)', alignItems: 'center', justifyContent: 'center', borderRadius: radius.lg },
  unavailOverlayTxt: { fontSize: 11, fontWeight: '700', color: '#DC2626', textTransform: 'uppercase', letterSpacing: 0.5 },

  // Empty state
  empty:    { alignItems: 'center', paddingTop: 80 },
  emptyTxt: { fontSize: 15, fontWeight: '700', color: colors.textMuted, marginTop: 12, textAlign: 'center' },

  // Floating "Send to Table" bar
  floatBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.white,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    paddingBottom: 28,
    borderTopWidth: 1, borderTopColor: colors.border,
    ...shadow.lg,
  },
  floatBarItems:  { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
  floatBarTotal:  { fontSize: 17, fontWeight: '800', color: colors.textDark },
  sendTableBtn:   { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primary, paddingVertical: spacing.md, paddingHorizontal: spacing.xl, borderRadius: radius.btn },
  sendTableTxt:   { color: colors.white, fontWeight: '800', fontSize: 15 },

  // Shared backdrop
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 10 },

  // Item detail sheet
  itemSheet:     { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: spacing.xl, paddingBottom: 36, alignItems: 'center', zIndex: 11 },
  sheetHandle:   { width: 40, height: 4, backgroundColor: colors.border, borderRadius: 2, marginBottom: spacing.lg },
  itemAvatarLg:  { width: 84, height: 84, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg },
  itemImgLg:     { width: 84, height: 84, borderRadius: 26, marginBottom: spacing.lg },
  itemSheetName: { fontSize: 22, fontWeight: '800', color: colors.textDark, textAlign: 'center', marginBottom: 6 },
  itemSheetPrice:{ fontSize: 20, fontWeight: '800', color: colors.primary, marginBottom: spacing.md },
  itemCatBadge:  { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primaryLight, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.full, marginBottom: spacing.md },
  itemDesc:      { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 21, marginBottom: spacing.lg },
  unavailBadge:  { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEE2E2', paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.md, marginBottom: spacing.lg },
  closeBtn:      { flexDirection: 'row', alignItems: 'center', marginTop: spacing.lg, paddingVertical: spacing.md, paddingHorizontal: spacing.xl, borderRadius: radius.btn, borderWidth: 1.5, borderColor: colors.border },

  // Qty row in detail sheet
  sheetQtyRow: { flexDirection: 'row', alignItems: 'center', marginVertical: spacing.lg, backgroundColor: colors.primaryLight, borderRadius: radius.full, paddingHorizontal: spacing.sm },
  sheetQtyBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  sheetQtyNum: { fontSize: 22, fontWeight: '800', color: colors.primary, minWidth: 36, textAlign: 'center' },

  // Add to cart button
  addToCartBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primary, paddingVertical: spacing.md, paddingHorizontal: spacing.xxl, borderRadius: radius.btn, marginTop: spacing.sm },
  addToCartTxt: { color: colors.white, fontWeight: '800', fontSize: 15 },

  // Table picker sheet
  pickerSheet:    { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: spacing.xl, paddingBottom: 36, zIndex: 11, maxHeight: '80%' },
  pickerTitle:    { fontSize: 20, fontWeight: '800', color: colors.textDark, textAlign: 'center', marginBottom: 4 },
  pickerSub:      { fontSize: 13, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.md },
  tableSearchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background, borderRadius: radius.full, paddingHorizontal: spacing.md, height: 40, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md },
  tableSearchInput:{ flex: 1, fontSize: 14, color: colors.textDark, paddingVertical: 0 },
  tableRow:       { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm },
  tableIconWrap:  { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md },
  tableRowName:   { fontSize: 15, fontWeight: '700', color: colors.textDark },
  tableRowStatus: { fontSize: 12, fontWeight: '600', marginTop: 2 },

  // Guest count sheet
  guestRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg },
  guestBtn:   { width: 52, height: 52, borderRadius: 26, borderWidth: 2, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  guestCount: { fontSize: 48, fontWeight: '800', color: colors.textDark, marginHorizontal: spacing.xxl, minWidth: 70, textAlign: 'center' },
});

// ════════════════════════════════════════════════════════════════════════════
// WaitressMenu — browse + add items to orders
// ════════════════════════════════════════════════════════════════════════════
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, RefreshControl, TextInput,
  Modal, StatusBar, Image, Animated,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { menuAPI, tablesAPI, ordersAPI } from '../../api/client';
import { colors, spacing, radius, shadow, topInset, useLayout } from '../../utils/theme';
import ConfirmDialog from '../../components/ConfirmDialog';
import OrderReviewSheet from '../../components/OrderReviewSheet';
import CategoryPicker from '../../components/CategoryPicker';
import { useTranslation } from '../../context/LanguageContext';
import { tableLabel } from '../../utils/tableLabel';
import useSheetSwipe from '../../components/useSheetSwipe';


const fmtMoney = (n) => Math.round(n || 0).toLocaleString('uz-UZ') + ' so\'m';

// ── Unit helpers (kg / l weighed items) ─────────────────────────────────────
const isWeighedItem = (item) => {
  const u = String(item?.unit || 'piece').toLowerCase();
  return u === 'kg' || u === 'l' || u === 'g' || u === 'ml';
};
const unitSuffix = (item) => {
  const u = String(item?.unit || 'piece').toLowerCase();
  return u === 'piece' ? '' : u;
};
const formatQtyLabel = (item, qty) => {
  if (isWeighedItem(item)) {
    const n = Number(qty || 0);
    const trimmed = Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/\.?0+$/, '');
    return `${trimmed} ${unitSuffix(item)}`;
  }
  return String(qty);
};

// Pad a grid's data so the final row is always full.
//
// FlatList lays each row out with the cards at flex: 1, so a last row holding
// two items in a three-column grid gives each of them HALF the screen — they
// render visibly larger than every card above, which is what made the bottom of
// the menu look broken. Appending invisible placeholders keeps the geometry
// honest. Keys are prefixed so they can never collide with a real item id.
function padGrid(rows, cols) {
  if (!Array.isArray(rows) || cols < 2) return rows;
  const remainder = rows.length % cols;
  if (remainder === 0) return rows;
  const ghosts = Array.from({ length: cols - remainder }, (_, i) => ({
    id: `__ghost_${i}`, __ghost: true,
  }));
  return [...rows, ...ghosts];
}

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
// `compact` = 3-or-more column grid. The card shrinks its avatar, image and
// type so three fit legibly across a phone instead of two oversized ones.
function MenuItemCard({ item, qty, onAdd, onRemove, onDetail, compact }) {
  const { t } = useTranslation();
  const avail = item.is_available !== false;
  const imgUri = resolveImgUrl(item.image_url);
  const selected = qty > 0;
  const weighed = isWeighedItem(item);

  return (
    <TouchableOpacity
      onPress={() => avail && onAdd(item)}
      onLongPress={() => onDetail(item)}
      activeOpacity={0.88}
      style={[styles.menuCard, selected && styles.menuCardSelected, !avail && styles.menuCardUnavail]}
    >
      {/* Image or letter avatar — full width at top */}
      {imgUri ? (
        <Image source={{ uri: imgUri }} style={[styles.menuImg, compact && { height: 84 }]} resizeMode="contain" />
      ) : (
        <View style={[styles.menuAvatarWrap]}>
          <View style={[styles.menuAvatar, compact && { width: 46, height: 46, borderRadius: 14 }, {
            backgroundColor: selected ? colors.primary : avail ? colors.primaryLight : '#F3F4F6',
          }]}>
            <Text style={{ fontSize: compact ? 20 : 28, fontWeight: '800', color: selected ? colors.white : avail ? colors.primary : colors.textMuted }}>
              {item.name.charAt(0).toUpperCase()}
            </Text>
          </View>
        </View>
      )}

      {/* Card body.
          Every text here is pinned to a single line and allowed to shrink
          rather than wrap. At three columns a card is ~105dp wide, and
          "1,212,112 so'm" or "140,000 so'm / kg" wrapped onto two and three
          lines, which is what made the grid look ragged — every card ended up
          a different height and the prices broke mid-number. */}
      <View style={styles.menuCardBody}>
        <Text
          style={[styles.menuName, compact && styles.menuNameCompact, !avail && { color: colors.textMuted }]}
          numberOfLines={2}
        >
          {item.name}
        </Text>

        <Text
          style={[styles.menuPrice, compact && styles.menuPriceCompact, !avail && { color: colors.textMuted }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
        >
          {fmtMoney(item.price)}{weighed ? ` /${unitSuffix(item)}` : ''}
        </Text>

        {/* Qty controls, or a compact add affordance.
            The old "Tap to add" label wrapped to two lines in every card and
            said nothing the card itself doesn't — the whole card is the button.
            At three columns it becomes a single + glyph; the roomier two-column
            tablet layout keeps the words. */}
        {qty > 0 ? (
          <View style={styles.qtyRow}>
            <TouchableOpacity onPress={() => onRemove(item.id)} style={styles.qtyBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <MaterialIcons name={weighed ? 'delete-outline' : 'remove'} size={15} color={colors.primary} />
            </TouchableOpacity>
            <Text style={styles.qtyNum} numberOfLines={1}>{formatQtyLabel(item, qty)}</Text>
            <TouchableOpacity onPress={() => onAdd(item)} style={styles.qtyBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <MaterialIcons name={weighed ? 'edit' : 'add'} size={15} color={colors.primary} />
            </TouchableOpacity>
          </View>
        ) : avail ? (
          compact ? (
            <View style={styles.addDot}>
              <MaterialIcons name="add" size={16} color={colors.primary} />
            </View>
          ) : (
            <View style={styles.addHint}>
              <MaterialIcons name="add-circle-outline" size={15} color={colors.primary} />
              <Text style={styles.addHintTxt} numberOfLines={1}>{t('waitress.menu.tapToAdd', 'Tap to add')}</Text>
            </View>
          )
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
      <Text style={styles.itemSheetPrice}>
        {fmtMoney(item.price)}{isWeighedItem(item) ? ` / ${unitSuffix(item)}` : ''}
      </Text>
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
            <MaterialIcons name={isWeighedItem(item) ? 'delete-outline' : 'remove'} size={20} color={colors.primary} />
          </TouchableOpacity>
          <Text style={styles.sheetQtyNum}>{formatQtyLabel(item, qty)}</Text>
          <TouchableOpacity onPress={() => onAdd(item)} style={styles.sheetQtyBtn}>
            <MaterialIcons name={isWeighedItem(item) ? 'edit' : 'add'} size={20} color={colors.primary} />
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
  const swipe = useSheetSwipe(onClose);
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
      const name = `${tb.name ?? ''} ${tb.table_number ?? ''}`.toLowerCase();
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
      <Animated.View style={[styles.pickerSheet, swipe.style]}>
        <View {...swipe.panHandlers}>
            <View style={styles.sheetHandle} />
        <Text style={styles.pickerTitle}>{t('cashier.walkin.selectTable', 'Select Table')}</Text>
          </View>
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
                      {tableLabel(table, t)}
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
      </Animated.View>
    </Modal>
  );
}



// ════════════════════════════════════════════════════════════════════════════
// MAIN SCREEN
// ════════════════════════════════════════════════════════════════════════════
export default function WaitressMenu() {
  const { t }       = useTranslation();
  const { width }   = useLayout();       // reactive — updates on rotation
  // 3 columns on phones, 4 on tablets (owner, 2026-08-17). Two columns made the
  // cards enormous and forced a waiter to scroll through a short menu on a small
  // screen — picking a dish should be one glance, not a hunt.
  //
  // Keyed on WIDTH, not orientation. The previous cols(2, 4) gave 2 in portrait
  // and 4 in landscape, so a tablet held upright showed the same giant cards as
  // a phone, and a phone turned sideways showed four cramped ones. 600dp is the
  // standard Android tablet breakpoint (the sw600dp resource qualifier).
  const numCols     = width >= 600 ? 4 : 3;
  const [categories, setCategories] = useState([]);
  const [menuItems,  setMenuItems]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selCat,     setSelCat]     = useState(null);
  const [selItem,    setSelItem]    = useState(null);
  const [search,     setSearch]     = useState('');

  // Cart
  const [cart, setCart] = useState([]);

  // Amount picker modal (kg / l weighed items)
  const [amountPicker, setAmountPicker] = useState(null); // { item, value }

  // Table picker flow
  const [showTablePicker, setShowTablePicker] = useState(false);
  // Guest-count sheet replaced by the order review sheet (2026-08-17, owner):
  // the waiter is no longer asked how many guests, and instead confirms the
  // food list before it reaches the kitchen.
  const [showReview,      setShowReview]      = useState(false);
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
    // Weighed items (kg / l / g / ml) → open picker so waitress types the amount
    if (isWeighedItem(item)) {
      setCart(prev => {
        const existing  = prev.find(c => c.menu_item_id === item.id);
        const unitPrice = parseFloat(item.price) || 0;
        const seedQty   = existing ? String(existing.quantity) : '';
        const seedPrice = existing && unitPrice > 0
          ? String(Math.round(existing.quantity * unitPrice))
          : '';
        setAmountPicker({ item, value: seedQty, priceValue: seedPrice });
        return prev;
      });
      return;
    }
    setCart(prev => {
      const idx = prev.findIndex(c => c.menu_item_id === item.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [...prev, { menu_item_id: item.id, name: item.name, price: parseFloat(item.price), quantity: 1, unit: item.unit || 'piece' }];
    });
  }, []);

  const removeFromCart = useCallback((itemId) => {
    setCart(prev => {
      const idx = prev.findIndex(c => c.menu_item_id === itemId);
      if (idx < 0) return prev;
      const next = [...prev];
      const entry = next[idx];
      // Weighed items: a single tap removes the line entirely
      if (isWeighedItem(entry)) { next.splice(idx, 1); return next; }
      if (next[idx].quantity > 1) next[idx] = { ...next[idx], quantity: next[idx].quantity - 1 };
      else next.splice(idx, 1);
      return next;
    });
  }, []);

  const confirmAmountPicker = useCallback(() => {
    setAmountPicker(prev => {
      if (!prev) return null;
      const raw = String(prev.value || '').replace(',', '.').trim();
      const n = parseFloat(raw);
      if (!isFinite(n) || n <= 0) return null;
      const item = prev.item;
      setCart(cur => {
        const idx = cur.findIndex(c => c.menu_item_id === item.id);
        const entry = { menu_item_id: item.id, name: item.name, price: parseFloat(item.price), quantity: n, unit: item.unit || 'piece' };
        if (idx >= 0) {
          const next = [...cur]; next[idx] = entry; return next;
        }
        return [...cur, entry];
      });
      return null;
    });
  }, []);

  const getQty = useCallback((itemId) => cart.find(c => c.menu_item_id === itemId)?.quantity || 0, [cart]);

  const cartCount = cart.reduce((s, c) => s + c.quantity, 0);
  const cartTotal = cart.reduce((s, c) => s + c.price * c.quantity, 0);

  // ── Table select ─────────────────────────────────────────────────────────
  // ── Table select ─────────────────────────────────────────────────────────
  // Picking a table no longer sends anything. It records the target and opens
  // the review sheet — for BOTH a free table and an occupied one.
  //
  // Previously the occupied branch did all its work right here, so adding to an
  // existing order skipped the review entirely: choose a table and the food was
  // already in the kitchen (reported 2026-08-17). The whole point of the review
  // is that it is the last step before the kitchen, so it cannot be conditional
  // on which kind of table was picked.
  const handleTableSelect = useCallback((table) => {
    setShowTablePicker(false);
    setTargetTable(table);
    setShowReview(true);
  }, []);

  // ── Confirm from the review sheet → actually send ────────────────────────
  // Branches on what the table turns out to hold, NOT on its cached status:
  // `status === 'occupied'` can be stale, and a table that lost its order would
  // otherwise fail to take a new one. Looking for a live order and falling back
  // to creating one covers both without the waiter needing to know which.
  const handleConfirmSend = useCallback(async () => {
    if (!targetTable) return;
    setSending(true);
    try {
      const newItems = cart.map(c => ({
        menu_item_id: c.menu_item_id,
        quantity:     c.quantity,
        unit_price:   c.price,
      }));

      let active = null;
      if (targetTable.status === 'occupied') {
        try {
          const res = await ordersAPI.getByTable(targetTable.id);
          active = (res.data || []).filter(o => !['paid', 'cancelled'].includes(o.status))[0] || null;
        } catch (_) { /* treat as no active order */ }
      }

      if (!active) {
        // guests_count is 1 because the waiter is no longer asked — the field
        // remains in the API for Admin/POS, which can still set a real number.
        await tablesAPI.open(targetTable.id, { guests_count: 1 });
        await ordersAPI.create({ table_id: targetTable.id, items: newItems });
        setDialog({
          title: t('waitress.menu.orderSent', 'Order Sent!'),
          message: t('waitress.menu.newOrderCreated', 'New order created for {table}.')
            .replace('{table}', tableLabel(targetTable, t)),
          type: 'success',
        });
      } else {
        // PUT with the merged list (existing + new) rather than POST /items:
        // PUT succeeds on a bill_requested order regardless of which backend
        // version is deployed, so Add Items keeps working during a rollout.
        let merged = newItems;
        try {
          const fresh = await ordersAPI.getById(active.id);
          const prior = Array.isArray(fresh?.data?.items) ? fresh.data.items : [];
          merged = [
            ...prior.map(it => ({
              menu_item_id: it.menu_item_id,
              quantity:     Number(it.quantity || 0),
              unit_price:   parseFloat(it.unit_price || 0),
            })),
            ...newItems,
          ];
        } catch (_) { /* fall back to just the new items */ }
        await ordersAPI.update(active.id, { items: merged });
        setDialog({
          title: t('waitress.menu.orderSent', 'Order Sent!'),
          message: t('waitress.menu.itemsAddedToTable', '{count} item(s) added to Table {table}.')
            .replace('{count}', String(cartCount))
            .replace('{table}', tableLabel(targetTable, t)),
          type: 'success',
        });
      }

      setCart([]);
    } catch (e) {
      setDialog({
        title: t('common.error', 'Error'),
        message: e?.response?.data?.error || t('waitress.menu.failedToSendOrder', 'Failed to send order. Please try again.'),
        type: 'error',
      });
    } finally {
      setSending(false);
      setShowReview(false);
      setTargetTable(null);
    }
  }, [targetTable, cart, cartCount, t]);

  // ── Filtered items ────────────────────────────────────────────────────────
  const filtered = menuItems.filter(i => {
    const inCat    = !selCat || String(i.category_id) === String(selCat);
    const inSearch = !search.trim() || i.name.toLowerCase().includes(search.toLowerCase());
    return inCat && inSearch;
  });

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
      {/* ── Header — search only ──
          The "Menu" title and the "N items across N categories" line were
          removed 2026-08-19 (owner): the waiter already knows which tab they
          are on from the bottom bar, and the counts were decoration that cost
          ~55px of every screen. That space goes to dishes instead. */}
      <View style={styles.header}>
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

      {/* ── Category picker (shared with WaitressTables — see CategoryPicker.js) ── */}
      <CategoryPicker
        categories={categories}
        items={menuItems}
        value={selCat}
        onChange={setSelCat}
      />

      {/* Cart summary strip removed 2026-08-19 (owner) — it duplicated the
          count and total already shown in the bottom bar, and pushed the grid
          down by ~48px exactly when the waiter has the most to look at. Its
          clear-cart button was NOT dropped; it moved into the bottom bar. */}

      {/* ── Items grid ── */}
      <FlatList
        style={{ flex: 1 }}
        data={padGrid(filtered, numCols)}
        keyExtractor={i => String(i.id)}
        numColumns={numCols}
        contentContainerStyle={{ padding: spacing.md, paddingBottom: cartCount > 0 ? 78 : 24 }}
        columnWrapperStyle={{ gap: spacing.md, marginBottom: spacing.md }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={colors.primary}
          />
        }
        renderItem={({ item }) => (
          item.__ghost ? <View style={styles.menuCardGhost} /> :
          <MenuItemCard
            item={item}
            qty={getQty(item.id)}
            onAdd={addToCart}
            onRemove={removeFromCart}
            onDetail={setSelItem}
            compact={numCols >= 3}
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

      {/* ── Floating "Send to Table" bar ── */}
      {cartCount > 0 && (
        <View style={styles.floatBar}>
          <View style={{ flexShrink: 1 }}>
            <Text style={styles.floatBarItems}>
              {t('waitress.menu.itemsCount', '{count} item(s)').replace('{count}', String(cartCount))}
            </Text>
            <Text style={styles.floatBarTotal} numberOfLines={1}>{fmtMoney(cartTotal)}</Text>
          </View>
          {/* Clear cart — rehomed here when the summary strip was removed.
              Kept visually quiet (outline icon, no fill) so it can never be
              mistaken for the send action sitting next to it. */}
          <TouchableOpacity
            onPress={() => setCart([])}
            style={styles.clearCartBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MaterialIcons name="delete-outline" size={20} color={colors.textMuted} />
          </TouchableOpacity>
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

      {/* ── Review before it reaches the kitchen ── */}
      <OrderReviewSheet
        visible={showReview}
        items={cart}
        tableName={targetTable ? tableLabel(targetTable, t) : ''}
        sending={sending}
        // "Add to order" vs "Send to kitchen" — the waiter should be able to
        // tell from the button which of the two is about to happen.
        mode={targetTable?.status === 'occupied' ? 'add' : 'new'}
        onConfirm={handleConfirmSend}
        onClose={() => { setShowReview(false); setTargetTable(null); }}
      />

      <ConfirmDialog dialog={dialog} onClose={() => setDialog(null)} />

      {/* ── Amount picker modal (kg / l weighed items) ────────────────── */}
      <Modal
        visible={!!amountPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setAmountPicker(null)}
      >
        <View style={styles.amtPickerBackdrop}>
          <View style={styles.amtPickerCard}>
            <Text style={styles.amtPickerTitle} numberOfLines={1}>{amountPicker?.item?.name || ''}</Text>
            <Text style={styles.amtPickerSub}>
              {fmtMoney(amountPicker?.item?.price || 0)} / {unitSuffix(amountPicker?.item)}
            </Text>

            <Text style={styles.amtPickerFieldLbl}>{t('common.amount', 'Amount')}</Text>
            <View style={styles.amtPickerInputWrap}>
              <TextInput
                value={amountPicker?.value || ''}
                onChangeText={(v) => {
                  const cleaned = v.replace(',', '.');
                  const unit    = parseFloat(amountPicker?.item?.price || 0) || 0;
                  const qty     = parseFloat(cleaned) || 0;
                  const price   = Math.round(qty * unit);
                  setAmountPicker(p => p ? {
                    ...p,
                    value: cleaned,
                    priceValue: qty > 0 && unit > 0 ? String(price) : '',
                  } : p);
                }}
                placeholder="0.000"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
                autoFocus
                style={styles.amtPickerInput}
                selectionColor={colors.primary}
              />
              <Text style={styles.amtPickerUnit}>{unitSuffix(amountPicker?.item)}</Text>
            </View>

            {/* Quick presets */}
            <View style={styles.amtPickerPresetsRow}>
              {[0.25, 0.5, 1, 1.5, 2].map(p => (
                <TouchableOpacity
                  key={p}
                  onPress={() => {
                    const unit  = parseFloat(amountPicker?.item?.price || 0) || 0;
                    const price = Math.round(p * unit);
                    setAmountPicker(prev => prev ? {
                      ...prev,
                      value: String(p),
                      priceValue: unit > 0 ? String(price) : '',
                    } : prev);
                  }}
                  style={styles.amtPickerPresetBtn}
                >
                  <Text style={styles.amtPickerPresetTxt}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Price input (bidirectional) */}
            <Text style={styles.amtPickerFieldLbl}>{t('common.price', 'Price')}</Text>
            <View style={[styles.amtPickerInputWrap, { marginBottom: spacing.lg }]}>
              <TextInput
                value={amountPicker?.priceValue || ''}
                onChangeText={(v) => {
                  const cleaned = v.replace(',', '.').replace(/[^0-9.]/g, '');
                  const unit    = parseFloat(amountPicker?.item?.price || 0) || 0;
                  const price   = parseFloat(cleaned) || 0;
                  const qty     = unit > 0 ? Math.round((price / unit) * 1000) / 1000 : 0;
                  setAmountPicker(p => p ? {
                    ...p,
                    priceValue: cleaned,
                    value: price > 0 && unit > 0 ? String(qty) : '',
                  } : p);
                }}
                placeholder="0"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
                style={styles.amtPickerInput}
                selectionColor={colors.primary}
              />
              <Text style={styles.amtPickerUnit}>{t('common.currency', "so'm")}</Text>
            </View>

            <View style={styles.amtPickerBtnRow}>
              <TouchableOpacity onPress={() => setAmountPicker(null)} style={[styles.amtPickerBtn, styles.amtPickerBtnGhost]}>
                <Text style={styles.amtPickerBtnGhostTxt}>{t('common.cancel', 'Cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmAmountPicker} style={[styles.amtPickerBtn, styles.amtPickerBtnPrimary]}>
                <Text style={styles.amtPickerBtnPrimaryTxt}>{t('common.add', 'Add')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center:    { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Header
  // Search-only header. Title/subtitle removed 2026-08-19 — with them gone the
  // vertical padding comes down too, or the bar just holds empty blue space.
  header:      { backgroundColor: colors.primary, paddingTop: topInset + 6, paddingBottom: 10, paddingHorizontal: spacing.lg },
  searchRow:   { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 8 },
  searchInput: { flex: 1, fontSize: 14, color: colors.textDark, padding: 0 },

  // Category chips
  // Category chip styles removed 2026-08-19 — the chip row was replaced by the
  // shared CategoryPicker sheet, which carries its own styles.

  // Cart summary bar (below category chips)
  // Cart summary strip styles removed 2026-08-19 — the strip itself is gone.

  // Menu grid card
  // minHeight keeps every card in a row the same height even when one name
  // runs to two lines and its neighbour to one — without it the grid stepped.
  menuCard:         { flex: 1, minHeight: 132, backgroundColor: colors.white, borderRadius: radius.lg, ...shadow.card, overflow: 'hidden', borderWidth: 1.5, borderColor: 'transparent' },
  // Invisible filler for the last row (see padGrid) so two leftover items don't
  // stretch to half the screen each.
  menuCardGhost:    { flex: 1, minHeight: 132, backgroundColor: 'transparent' },
  menuCardSelected: { borderColor: colors.primary, backgroundColor: '#F0F7FF' },
  menuCardUnavail:  { opacity: 0.7 },
  menuAvatarWrap:   { alignItems: 'center', paddingTop: spacing.md, paddingBottom: 2 },
  menuAvatar:       { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  menuImg:          { width: '100%', height: 120, backgroundColor: '#F1F5F9' },
  menuCardBody:     { paddingHorizontal: 6, paddingVertical: spacing.sm, alignItems: 'center', flex: 1, justifyContent: 'center' },
  menuName:         { fontSize: 13, fontWeight: '700', color: colors.textDark, textAlign: 'center', marginBottom: 3 },
  menuPrice:        { fontSize: 13, fontWeight: '800', color: colors.primary, textAlign: 'center' },
  addHint:          { flexDirection: 'row', alignItems: 'center', marginTop: 5, gap: 3 },
  addHintTxt:       { fontSize: 11, color: colors.primary, fontWeight: '600' },
  menuNameCompact:  { fontSize: 12, lineHeight: 15, marginBottom: 2 },
  menuPriceCompact: { fontSize: 12 },
  addDot:           { marginTop: 4, width: 24, height: 24, borderRadius: 12, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },

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
  // Compacted 2026-08-19 (owner). Was paddingVertical 16 + paddingBottom 28,
  // which reserved a gesture-bar gap this screen does not need — the tab bar
  // sits below it and already covers that inset. ~34px returned to the grid.
  floatBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: spacing.sm,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    paddingBottom: 10,
    borderTopWidth: 1, borderTopColor: colors.border,
    ...shadow.lg,
  },
  floatBarItems:  { fontSize: 11, color: colors.textMuted, fontWeight: '600' },
  floatBarTotal:  { fontSize: 15, fontWeight: '800', color: colors.textDark },
  clearCartBtn:   { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, marginLeft: 'auto' },
  sendTableBtn:   { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primary, paddingVertical: 10, paddingHorizontal: spacing.lg, borderRadius: radius.btn },
  sendTableTxt:   { color: colors.white, fontWeight: '800', fontSize: 14 },

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

  // Amount picker modal (kg / l weighed items)
  amtPickerBackdrop:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  amtPickerCard:        { width: '100%', maxWidth: 360, backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, ...shadow.lg },
  amtPickerTitle:       { fontSize: 18, fontWeight: '800', color: colors.textDark, marginBottom: 4 },
  amtPickerSub:         { fontSize: 13, color: colors.textMuted, marginBottom: spacing.lg },
  amtPickerFieldLbl:    { fontSize: 11, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.5, marginBottom: 4, textTransform: 'uppercase' },
  amtPickerInputWrap:   { flexDirection: 'row', alignItems: 'center', borderWidth: 2, borderColor: colors.primary, borderRadius: radius.md, paddingHorizontal: spacing.md, marginBottom: spacing.md, backgroundColor: '#F9FAFB' },
  amtPickerInput:       { flex: 1, fontSize: 28, fontWeight: '800', color: colors.textDark, paddingVertical: spacing.md },
  amtPickerUnit:        { fontSize: 16, fontWeight: '700', color: colors.primary, marginLeft: spacing.sm },
  amtPickerPresetsRow:  { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  amtPickerPresetBtn:   { flex: 1, backgroundColor: colors.primaryLight, paddingVertical: 10, borderRadius: radius.sm, alignItems: 'center' },
  amtPickerPresetTxt:   { color: colors.primary, fontWeight: '700', fontSize: 13 },
  amtPickerTotalRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: spacing.lg },
  amtPickerTotalLbl:    { fontSize: 14, fontWeight: '700', color: colors.textMuted },
  amtPickerTotalVal:    { fontSize: 18, fontWeight: '800', color: colors.primary },
  amtPickerBtnRow:      { flexDirection: 'row', gap: spacing.sm },
  amtPickerBtn:         { flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: 'center' },
  amtPickerBtnGhost:    { backgroundColor: '#F3F4F6' },
  amtPickerBtnGhostTxt: { color: colors.textDark, fontWeight: '700', fontSize: 14 },
  amtPickerBtnPrimary:  { backgroundColor: colors.primary },
  amtPickerBtnPrimaryTxt: { color: colors.white, fontWeight: '800', fontSize: 14 },
});

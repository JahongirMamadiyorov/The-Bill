import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
import {
  View, Text, ScrollView, FlatList, Pressable, Modal,
  StyleSheet, RefreshControl, ActivityIndicator, Platform, StatusBar,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { warehouseAPI, suppliersAPI } from '../../api/client';
import OwnerPageHeader from '../../components/OwnerPageHeader';
import { useTranslation } from '../../context/LanguageContext';

// ─── constants ───────────────────────────────────────────────────────────────
const P   = '#7C3AED';
const PL  = '#F5F3FF';
const money = v => {
  const n = Math.round(Number(v) || 0);
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + " so'm";
};

const CAT_COLORS = [
  '#7C3AED','#0891B2','#EA580C','#16A34A',
  '#D97706','#DB2777','#059669','#2563EB',
];

const stockStatus = item => {
  const q = parseFloat(item.quantity_in_stock || 0);
  const m = parseFloat(item.min_stock_level || 0);
  if (q <= m)       return { label: 'Low',  color: '#DC2626', bg: '#FEF2F2' };
  if (q <= m * 1.5) return { label: 'OK',   color: '#D97706', bg: '#FFFBEB' };
  return               { label: 'Good', color: '#16A34A', bg: '#F0FDF4' };
};

const topPad = Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 44;

// ─── small components ─────────────────────────────────────────────────────────
const SectionHeader = memo(function SectionHeader({ icon, title, sub }) {
  return (
    <View style={s.sectionHeader}>
      <View style={s.sectionIconBox}>
        <MaterialIcons name={icon} size={15} color={P} />
      </View>
      <Text style={s.sectionTitle}>{title}</Text>
      {sub ? <Text style={s.sectionSub}>{sub}</Text> : null}
    </View>
  );
});

// ─── Supplier Detail Modal ────────────────────────────────────────────────────
// movements have no supplier_id — we link via items (warehouse_items.supplier_id)
function SupplierDetail({ supplier, items, movements, onClose }) {
  if (!supplier) return null;

  // item_ids that belong to this supplier
  const supplierItemIds = useMemo(
    () => new Set(items.filter(i => i.supplier_id === supplier.id).map(i => i.id)),
    [items, supplier]
  );

  // All IN movements for items from this supplier
  const myMovements = useMemo(() =>
    movements
      .filter(m => m.type === 'IN' && supplierItemIds.has(m.item_id))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    [movements, supplierItemIds]
  );

  // Items we buy from this supplier
  const suppliedItems = useMemo(() => {
    const map = {};
    myMovements.forEach(m => {
      const key = m.item_name || String(m.item_id);
      if (!map[key]) map[key] = { name: key, qty: 0, cost: 0, count: 0 };
      map[key].qty   += parseFloat(m.quantity || 0);
      map[key].cost  += parseFloat(m.quantity || 0) * parseFloat(m.cost_per_unit || 0);
      map[key].count += 1;
    });
    return Object.values(map).sort((a, b) => b.cost - a.cost);
  }, [myMovements]);

  const totalPurchased = useMemo(
    () => myMovements.reduce(
      (sum, m) => sum + parseFloat(m.quantity || 0) * parseFloat(m.cost_per_unit || 0),
      0
    ),
    [myMovements]
  );

  // Recent deliveries (last 5 receive movements)
  const recentDeliveries = myMovements.slice(0, 6);

  return (
    <Modal visible={true} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

        {/* Purple top bar — paddingTop covers status bar area */}
        <View style={s.detailTopBar}>
          <Pressable onPress={onClose} style={({ pressed }) => [s.detailBack, pressed && { opacity: 0.6 }]}>
            <MaterialIcons name="arrow-back" size={22} color="#fff" />
          </Pressable>
          <Text style={s.detailTopTitle}>Supplier Profile</Text>
          <View style={{ width: 44 }} />
        </View>

        {/* Hero */}
        <View style={s.detailHero}>
          <View style={s.detailAvatar}>
            <Text style={s.detailAvatarLetter}>{(supplier.name || '?')[0].toUpperCase()}</Text>
          </View>
          <Text style={s.detailName}>{supplier.name}</Text>
          <View style={s.detailContacts}>
            {supplier.phone ? (
              <View style={s.detailContactRow}>
                <MaterialIcons name="phone" size={13} color="rgba(255,255,255,0.75)" />
                <Text style={s.detailContactText}>{supplier.phone}</Text>
              </View>
            ) : null}
            {supplier.email ? (
              <View style={s.detailContactRow}>
                <MaterialIcons name="email" size={13} color="rgba(255,255,255,0.75)" />
                <Text style={s.detailContactText}>{supplier.email}</Text>
              </View>
            ) : null}
            {supplier.address ? (
              <View style={s.detailContactRow}>
                <MaterialIcons name="location-on" size={13} color="rgba(255,255,255,0.75)" />
                <Text style={s.detailContactText}>{supplier.address}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

          {/* Quick stats */}
          <View style={s.statRow}>
            <View style={s.statCard}>
              <MaterialIcons name="local-shipping" size={22} color="#10B981" />
              <Text style={s.statVal}>{myMovements.length}</Text>
              <Text style={s.statLbl}>Deliveries</Text>
            </View>
            <View style={s.statCard}>
              <MaterialIcons name="inventory-2" size={22} color="#F59E0B" />
              <Text style={s.statVal}>{suppliedItems.length}</Text>
              <Text style={s.statLbl}>Items</Text>
            </View>
            <View style={s.statCard}>
              <MaterialIcons name="payments" size={22} color={P} />
              <Text style={[s.statVal, { fontSize: 12 }]}>{totalPurchased > 0 ? money(totalPurchased) : '—'}</Text>
              <Text style={s.statLbl}>Total Bought</Text>
            </View>
          </View>

          {/* Items supplied */}
          <View style={s.card}>
            <SectionHeader icon="inventory-2" title="Items We Buy From Them" sub={`${suppliedItems.length} products`} />
            {suppliedItems.length === 0 ? (
              <View style={s.emptyCard}>
                <MaterialIcons name="inventory" size={32} color="#E5E7EB" />
                <Text style={s.emptyCardText}>No purchase history found</Text>
              </View>
            ) : (
              suppliedItems.map((item, i) => (
                <View key={item.name} style={[s.infoRow, i > 0 && { borderTopWidth: 1, borderTopColor: '#F3F4F6' }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.infoLabel}>{item.name}</Text>
                    <Text style={{ fontSize: 11, color: '#9CA3AF', marginTop: 1 }}>{item.count} orders · {item.qty.toFixed(1)} units total</Text>
                  </View>
                  {item.cost > 0 ? (
                    <Text style={[s.infoValue, { color: '#10B981' }]}>{money(item.cost)}</Text>
                  ) : null}
                </View>
              ))
            )}
          </View>

          {/* Recent deliveries */}
          <View style={s.card}>
            <SectionHeader icon="local-shipping" title="Recent Deliveries" sub={recentDeliveries.length > 0 ? 'latest first' : ''} />
            {recentDeliveries.length === 0 ? (
              <View style={s.emptyCard}>
                <MaterialIcons name="local-shipping" size={32} color="#E5E7EB" />
                <Text style={s.emptyCardText}>No deliveries recorded</Text>
              </View>
            ) : (
              recentDeliveries.map((m, i) => {
                const cost = parseFloat(m.quantity || 0) * parseFloat(m.cost_per_unit || 0);
                const date = m.created_at ? new Date(m.created_at).toLocaleDateString('uz-UZ') : '—';
                return (
                  <View key={String(m.id ?? i)} style={[s.deliveryRow, i > 0 && { borderTopWidth: 1, borderTopColor: '#F3F4F6' }]}>
                    <View style={s.deliveryDotCol}>
                      <View style={s.deliveryDot} />
                      {i < recentDeliveries.length - 1 ? <View style={s.deliveryLine} /> : null}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.deliveryItem}>{m.item_name || '—'}</Text>
                      <Text style={s.deliveryMeta}>{m.quantity} {m.unit || ''} · {date}</Text>
                      {m.note ? <Text style={s.deliveryNote}>{m.note}</Text> : null}
                    </View>
                    {cost > 0 ? <Text style={s.deliveryCost}>{money(cost)}</Text> : null}
                  </View>
                );
              })
            )}
          </View>

          {/* Total summary */}
          {totalPurchased > 0 && (
            <View style={s.card}>
              <SectionHeader icon="summarize" title="Purchase Summary" />
              <View style={s.infoRow}>
                <Text style={s.infoLabel}>Total Purchased (all time)</Text>
                <Text style={[s.infoValue, { color: '#10B981', fontWeight: '800' }]}>{money(totalPurchased)}</Text>
              </View>
              <View style={s.infoRow}>
                <Text style={s.infoLabel}>Total Deliveries</Text>
                <Text style={s.infoValue}>{myMovements.length}</Text>
              </View>
              <View style={s.infoRow}>
                <Text style={s.infoLabel}>Unique Items</Text>
                <Text style={s.infoValue}>{suppliedItems.length}</Text>
              </View>
            </View>
          )}

        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── main screen ──────────────────────────────────────────────────────────────
export default function OwnerInventory() {
  const { t } = useTranslation();
  const [activeTab,  setActiveTab]  = useState('Warehouse');

  // warehouse
  const [items,      setItems]      = useState([]);
  const [movements,  setMovements]  = useState([]);
  const [wLoading,   setWLoading]   = useState(true);
  const [wRefresh,   setWRefresh]   = useState(false);
  const [wError,     setWError]     = useState('');

  // suppliers
  const [suppliers,  setSuppliers]  = useState([]);
  const [sLoading,   setSLoading]   = useState(false);
  const [sRefresh,   setSRefresh]   = useState(false);
  const [sError,     setSError]     = useState('');

  // supplier detail
  const [selSupplier, setSelSupplier] = useState(null);

  // ── fetchers ────────────────────────────────────────────────────
  const fetchWarehouse = useCallback(async () => {
    try {
      setWError('');
      const [itemsRes, movRes] = await Promise.all([
        warehouseAPI.getAll(),
        warehouseAPI.getMovements({}),
      ]);
      setItems(Array.isArray(itemsRes.data) ? itemsRes.data : []);
      setMovements(Array.isArray(movRes.data) ? movRes.data : []);
    } catch {
      setWError('Failed to load warehouse data');
    } finally {
      setWLoading(false);
      setWRefresh(false);
    }
  }, []);

  const fetchSuppliers = useCallback(async () => {
    try {
      setSError('');
      setSLoading(true);
      const res = await suppliersAPI.getAll();
      setSuppliers(Array.isArray(res.data) ? res.data : []);
    } catch {
      setSError('Failed to load suppliers');
    } finally {
      setSLoading(false);
      setSRefresh(false);
    }
  }, []);

  useEffect(() => { fetchWarehouse(); }, []);
  useEffect(() => { if (activeTab === 'Suppliers') fetchSuppliers(); }, [activeTab]);

  const onWRefresh = useCallback(() => { setWRefresh(true); fetchWarehouse(); }, [fetchWarehouse]);
  const onSRefresh = useCallback(() => { setSRefresh(true); fetchSuppliers(); }, [fetchSuppliers]);

  // ── warehouse derived data ───────────────────────────────────────
  const totalValue = useMemo(
    () => items.reduce((sum, i) => sum + (parseFloat(i.quantity_in_stock || 0) * parseFloat(i.cost_per_unit || 0)), 0),
    [items]
  );

  const lowItems = useMemo(
    () => items.filter(i => parseFloat(i.quantity_in_stock || 0) <= parseFloat(i.min_stock_level || 0)),
    [items]
  );

  const stockCounts = useMemo(() => {
    let good = 0, ok = 0, low = 0;
    items.forEach(i => {
      const st = stockStatus(i);
      if (st.label === 'Good') good++;
      else if (st.label === 'OK') ok++;
      else low++;
    });
    return { good, ok, low };
  }, [items]);

  const byCategory = useMemo(() => {
    const map = {};
    items.forEach(i => {
      const cat = i.category || 'Uncategorized';
      if (!map[cat]) map[cat] = { name: cat, count: 0, value: 0, low: 0 };
      map[cat].count++;
      map[cat].value += parseFloat(i.quantity_in_stock || 0) * parseFloat(i.cost_per_unit || 0);
      if (parseFloat(i.quantity_in_stock || 0) <= parseFloat(i.min_stock_level || 0)) map[cat].low++;
    });
    return Object.values(map).sort((a, b) => b.value - a.value);
  }, [items]);

  const recentMovements = useMemo(
    () => [...movements]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 8),
    [movements]
  );

  // ── warehouse tab ────────────────────────────────────────────────
  const renderWarehouse = () => (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={wRefresh} onRefresh={onWRefresh} tintColor={P} />}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero value cards */}
      <View style={s.heroRow}>
        <View style={[s.heroCard, { backgroundColor: PL, borderTopColor: P }]}>
          <MaterialIcons name="account-balance-wallet" size={22} color={P} />
          <Text style={[s.heroVal, { color: P }]}>{money(totalValue)}</Text>
          <Text style={s.heroLbl}>{t('owner.inventory.totalStockValue')}</Text>
        </View>
      </View>

      <View style={s.miniRow}>
        <View style={[s.miniCard, { borderTopColor: '#10B981' }]}>
          <Text style={[s.miniVal, { color: '#10B981' }]}>{items.length}</Text>
          <Text style={s.miniLbl}>{t('owner.inventory.totalItems')}</Text>
        </View>
        <View style={[s.miniCard, { borderTopColor: lowItems.length > 0 ? '#DC2626' : '#10B981' }]}>
          <Text style={[s.miniVal, { color: lowItems.length > 0 ? '#DC2626' : '#10B981' }]}>{lowItems.length}</Text>
          <Text style={s.miniLbl}>{t('owner.inventory.lowStock')}</Text>
        </View>
        <View style={[s.miniCard, { borderTopColor: '#F59E0B' }]}>
          <Text style={[s.miniVal, { color: '#374151' }]}>{byCategory.length}</Text>
          <Text style={s.miniLbl}>{t('owner.inventory.categories')}</Text>
        </View>
        <View style={[s.miniCard, { borderTopColor: P }]}>
          <Text style={[s.miniVal, { color: '#374151' }]}>{movements.length}</Text>
          <Text style={s.miniLbl}>{t('owner.inventory.movements')}</Text>
        </View>
      </View>

      {/* Stock health bar */}
      <View style={s.card}>
        <SectionHeader icon="health-and-safety" title="Stock Health" />
        <View style={s.healthBarOuter}>
          {stockCounts.good > 0 && (
            <View style={[s.healthBarSeg, { flex: stockCounts.good, backgroundColor: '#10B981' }]} />
          )}
          {stockCounts.ok > 0 && (
            <View style={[s.healthBarSeg, { flex: stockCounts.ok, backgroundColor: '#F59E0B' }]} />
          )}
          {stockCounts.low > 0 && (
            <View style={[s.healthBarSeg, { flex: stockCounts.low, backgroundColor: '#DC2626' }]} />
          )}
        </View>
        <View style={s.healthLegend}>
          <View style={s.legendItem}>
            <View style={[s.legendDot, { backgroundColor: '#10B981' }]} />
            <Text style={s.legendText}>Good  {stockCounts.good}</Text>
          </View>
          <View style={s.legendItem}>
            <View style={[s.legendDot, { backgroundColor: '#F59E0B' }]} />
            <Text style={s.legendText}>OK  {stockCounts.ok}</Text>
          </View>
          <View style={s.legendItem}>
            <View style={[s.legendDot, { backgroundColor: '#DC2626' }]} />
            <Text style={s.legendText}>Low  {stockCounts.low}</Text>
          </View>
        </View>
      </View>

      {/* Low stock alerts */}
      {lowItems.length > 0 && (
        <View style={[s.card, { borderLeftWidth: 4, borderLeftColor: '#DC2626' }]}>
          <SectionHeader icon="warning" title="Low Stock Alerts" sub={`${lowItems.length} items need restocking`} />
          {lowItems.map((item, i) => (
            <View key={String(item.id)} style={[s.alertRow, i > 0 && { borderTopWidth: 1, borderTopColor: '#FEF2F2' }]}>
              <View style={{ flex: 1 }}>
                <Text style={s.alertName}>{item.name}</Text>
                <Text style={s.alertMeta}>{item.category}  ·  Min: {item.min_stock_level} {item.unit}</Text>
              </View>
              <View style={s.alertBadge}>
                <Text style={s.alertQty}>{item.quantity_in_stock} {item.unit}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Category breakdown */}
      {byCategory.length > 0 && (
        <View style={s.card}>
          <SectionHeader icon="category" title="Category Breakdown" sub={`${byCategory.length} categories`} />
          {byCategory.map((cat, i) => {
            const maxVal = byCategory[0].value || 1;
            const pct = maxVal > 0 ? (cat.value / maxVal) * 100 : 0;
            const color = CAT_COLORS[i % CAT_COLORS.length];
            return (
              <View key={cat.name} style={[s.catRow, i > 0 && { marginTop: 10 }]}>
                <View style={s.catTop}>
                  <View style={[s.catDot, { backgroundColor: color }]} />
                  <Text style={s.catName}>{cat.name}</Text>
                  <View style={{ flex: 1 }} />
                  <Text style={s.catCount}>{cat.count} items</Text>
                  {cat.low > 0 && (
                    <View style={s.catLowBadge}>
                      <Text style={s.catLowText}>{cat.low} low</Text>
                    </View>
                  )}
                  {cat.value > 0 && <Text style={s.catValue}>{money(cat.value)}</Text>}
                </View>
                <View style={s.catBarBg}>
                  <View style={[s.catBarFill, { width: pct + '%', backgroundColor: color }]} />
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Recent movements */}
      {recentMovements.length > 0 && (
        <View style={s.card}>
          <SectionHeader icon="swap-vert" title="Recent Stock Movements" sub="latest 8" />
          {recentMovements.map((m, i) => {
            const typeColors = {
              IN:         { icon: 'add-circle',    color: '#10B981', label: 'Received',  sign: '+' },
              OUT:        { icon: 'remove-circle', color: '#F59E0B', label: 'Consumed',  sign: '-' },
              WASTE:      { icon: 'delete',        color: '#DC2626', label: 'Waste',     sign: '-' },
              ADJUST:     { icon: 'tune',          color: P,         label: 'Adjusted',  sign: '±' },
              SHRINKAGE:  { icon: 'trending-down', color: '#DC2626', label: 'Shrinkage', sign: '-' },
            };
            const tc = typeColors[m.type] || { icon: 'swap-horiz', color: '#6B7280', label: m.type, sign: '' };
            const date = m.created_at ? new Date(m.created_at).toLocaleDateString('uz-UZ') : '—';
            return (
              <View key={String(m.id ?? i)} style={[s.movRow, i > 0 && { borderTopWidth: 1, borderTopColor: '#F9FAFB' }]}>
                <View style={[s.movIcon, { backgroundColor: tc.color + '18' }]}>
                  <MaterialIcons name={tc.icon} size={16} color={tc.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.movItem}>{m.item_name || '—'}</Text>
                  <Text style={s.movMeta}>{tc.label}  ·  {date}</Text>
                </View>
                <Text style={[s.movQty, { color: tc.color }]}>
                  {tc.sign}{m.quantity} {m.unit || ''}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );

  // ── suppliers tab ────────────────────────────────────────────────
  const renderSupplierCard = useCallback(({ item: sup }) => {
    // Link via items: find item_ids belonging to this supplier, then filter IN movements
    const supItemIds = new Set(items.filter(i => i.supplier_id === sup.id).map(i => i.id));
    const deliveries = movements.filter(m => m.type === 'IN' && supItemIds.has(m.item_id));
    const totalSpent = deliveries.reduce(
      (sum, m) => sum + parseFloat(m.quantity || 0) * parseFloat(m.cost_per_unit || 0),
      0
    );

    return (
      <Pressable
        style={({ pressed }) => [s.supplierCard, pressed && { opacity: 0.75 }]}
        onPress={() => setSelSupplier(sup)}
      >
        <View style={s.supplierCardInner}>
          <View style={s.supAvatar}>
            <Text style={s.supAvatarLetter}>{(sup.name || '?')[0].toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.supName}>{sup.name}</Text>
            {sup.phone ? (
              <View style={s.supContact}>
                <MaterialIcons name="phone" size={12} color="#9CA3AF" />
                <Text style={s.supContactText}>{sup.phone}</Text>
              </View>
            ) : null}
            {sup.email ? (
              <View style={s.supContact}>
                <MaterialIcons name="email" size={12} color="#9CA3AF" />
                <Text style={s.supContactText}>{sup.email}</Text>
              </View>
            ) : null}
            {sup.address ? (
              <View style={s.supContact}>
                <MaterialIcons name="location-on" size={12} color="#9CA3AF" />
                <Text style={s.supContactText}>{sup.address}</Text>
              </View>
            ) : null}
          </View>
          <View style={s.supRight}>
            {deliveries.length > 0 ? (
              <>
                <Text style={s.supDeliveries}>{deliveries.length}</Text>
                <Text style={s.supDeliveriesLbl}>deliveries</Text>
                {totalSpent > 0 && <Text style={s.supSpent}>{money(totalSpent)}</Text>}
              </>
            ) : (
              <Text style={s.supNoData}>No orders</Text>
            )}
            <MaterialIcons name="chevron-right" size={18} color="#D1D5DB" style={{ marginTop: 6 }} />
          </View>
        </View>
      </Pressable>
    );
  }, [movements, items]);

  const renderSuppliers = () => (
    <FlatList
      data={suppliers}
      keyExtractor={item => String(item.id)}
      renderItem={renderSupplierCard}
      refreshControl={<RefreshControl refreshing={sRefresh} onRefresh={onSRefresh} tintColor={P} />}
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      initialNumToRender={10}
      windowSize={5}
      ListHeaderComponent={
        <View style={s.supHeader}>
          <MaterialIcons name="storefront" size={20} color={P} />
          <Text style={s.supHeaderText}>{suppliers.length} Active Suppliers</Text>
        </View>
      }
      ListEmptyComponent={
        <View style={s.emptyState}>
          <MaterialIcons name="local-shipping" size={52} color="#D1D5DB" />
          <Text style={s.emptyText}>No suppliers added yet</Text>
        </View>
      }
      ListFooterComponent={<View style={{ height: 16 }} />}
    />
  );

  // ── loading state ────────────────────────────────────────────────
  if (wLoading && activeTab === 'Warehouse') {
    return (
      <View style={s.container}>
        <HeaderContent activeTab={activeTab} setActiveTab={setActiveTab} />
        <View style={s.loader}>
          <ActivityIndicator size="large" color={P} />
        </View>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <View style={s.header}>
        <HeaderContent activeTab={activeTab} setActiveTab={setActiveTab} />
      </View>

      {wError && activeTab === 'Warehouse' ? <ErrorBanner msg={wError} /> : null}
      {sError && activeTab === 'Suppliers' ? <ErrorBanner msg={sError} /> : null}

      {activeTab === 'Warehouse' && renderWarehouse()}
      {activeTab === 'Suppliers' && (
        sLoading
          ? <View style={s.loader}><ActivityIndicator size="large" color={P} /></View>
          : renderSuppliers()
      )}

      {selSupplier ? (
        <SupplierDetail
          supplier={selSupplier}
          items={items}
          movements={movements}
          onClose={() => setSelSupplier(null)}
        />
      ) : null}
    </View>
  );
}

// ─── tiny helper components (outside main to avoid re-creation) ───────────────
function HeaderContent({ activeTab, setActiveTab }) {
  return (
    <OwnerPageHeader icon="inventory" title="Inventory" subtitle="Warehouse & suppliers">
      <View style={s.tabSwitcher}>
        <Pressable
          style={[s.tabBtn, activeTab === 'Warehouse' && s.tabBtnActive]}
          onPress={() => setActiveTab('Warehouse')}
        >
          <Text style={[s.tabBtnText, activeTab === 'Warehouse' && s.tabBtnTextActive]}>Warehouse</Text>
        </Pressable>
        <Pressable
          style={[s.tabBtn, activeTab === 'Suppliers' && s.tabBtnActive]}
          onPress={() => setActiveTab('Suppliers')}
        >
          <Text style={[s.tabBtnText, activeTab === 'Suppliers' && s.tabBtnTextActive]}>Suppliers</Text>
        </Pressable>
      </View>
    </OwnerPageHeader>
  );
}

function ErrorBanner({ msg }) {
  return (
    <View style={s.errorBanner}>
      <MaterialIcons name="error-outline" size={18} color="#DC2626" />
      <Text style={s.errorText}>{msg}</Text>
    </View>
  );
}

// ─── styles ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },

  tabSwitcher: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.15)',
    marginHorizontal: 16,
  },
  tabBtn: {
    flex: 1,
    paddingBottom: 12,
    alignItems: 'center',
  },
  tabBtnActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#FFF',
  },
  tabBtnText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '500',
  },
  tabBtnTextActive: {
    color: '#FFF',
    fontWeight: '700',
  },

  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorBanner: {
    flexDirection: 'row',
    backgroundColor: '#FEF2F2',
    borderLeftWidth: 4,
    borderLeftColor: '#DC2626',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  errorText: { fontSize: 13, color: '#DC2626', marginLeft: 8, flex: 1 },

  // warehouse
  heroRow: { marginBottom: 10 },
  heroCard: {
    borderRadius: 14,
    padding: 16,
    borderTopWidth: 4,
    alignItems: 'center',
    backgroundColor: PL,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
    elevation: 2,
  },
  heroVal: {
    fontSize: 22,
    fontWeight: '800',
    marginTop: 6,
  },
  heroLbl: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
    fontWeight: '600',
  },
  miniRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  miniCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 10,
    borderTopWidth: 3,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  miniVal: { fontSize: 18, fontWeight: '800', color: '#111827' },
  miniLbl: { fontSize: 10, color: '#9CA3AF', marginTop: 2, fontWeight: '600', textTransform: 'uppercase' },

  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    gap: 8,
  },
  sectionIconBox: {
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: PL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: '#111827', flex: 1 },
  sectionSub: { fontSize: 11, color: '#9CA3AF', fontWeight: '500' },

  // health bar
  healthBarOuter: {
    height: 12,
    borderRadius: 6,
    flexDirection: 'row',
    overflow: 'hidden',
    marginBottom: 10,
  },
  healthBarSeg: { height: 12 },
  healthLegend: { flexDirection: 'row', gap: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 12, color: '#6B7280', fontWeight: '600' },

  // low stock alerts
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  alertName: { fontSize: 13, fontWeight: '700', color: '#DC2626' },
  alertMeta: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  alertBadge: {
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginLeft: 10,
  },
  alertQty: { fontSize: 12, fontWeight: '700', color: '#DC2626' },

  // category
  catRow: { },
  catTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 6 },
  catDot: { width: 10, height: 10, borderRadius: 5 },
  catName: { fontSize: 13, fontWeight: '700', color: '#111827' },
  catCount: { fontSize: 11, color: '#9CA3AF' },
  catLowBadge: {
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  catLowText: { fontSize: 10, color: '#DC2626', fontWeight: '700' },
  catValue: { fontSize: 12, fontWeight: '700', color: '#10B981' },
  catBarBg: { height: 6, backgroundColor: '#F3F4F6', borderRadius: 3, overflow: 'hidden' },
  catBarFill: { height: 6, borderRadius: 3 },

  // movements
  movRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 10,
  },
  movIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  movItem: { fontSize: 13, fontWeight: '700', color: '#111827' },
  movMeta: { fontSize: 11, color: '#9CA3AF', marginTop: 1 },
  movQty: { fontSize: 13, fontWeight: '700' },

  // suppliers list
  supHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PL,
    padding: 14,
    borderRadius: 12,
    marginBottom: 14,
    gap: 10,
  },
  supHeaderText: { fontSize: 14, fontWeight: '700', color: P },
  supplierCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
    elevation: 2,
  },
  supplierCardInner: {
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  supAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: P,
    alignItems: 'center',
    justifyContent: 'center',
  },
  supAvatarLetter: { fontSize: 20, fontWeight: '800', color: '#fff' },
  supName: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 4 },
  supContact: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  supContactText: { fontSize: 12, color: '#6B7280' },
  supRight: { alignItems: 'flex-end' },
  supDeliveries: { fontSize: 18, fontWeight: '800', color: P },
  supDeliveriesLbl: { fontSize: 10, color: '#9CA3AF', fontWeight: '600', textTransform: 'uppercase' },
  supSpent: { fontSize: 11, fontWeight: '700', color: '#10B981', marginTop: 2 },
  supNoData: { fontSize: 11, color: '#9CA3AF' },

  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 14, color: '#9CA3AF', marginTop: 12 },

  // supplier detail modal
  detailTopBar: {
    backgroundColor: P,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: topPad + 12,
    paddingBottom: 12,
  },
  detailBack: {
    width: 44, height: 44,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 22,
  },
  detailTopTitle: {
    flex: 1, textAlign: 'center',
    fontSize: 17, fontWeight: '800', color: '#fff',
  },
  detailHero: {
    backgroundColor: P,
    alignItems: 'center',
    paddingTop: 4,
    paddingBottom: 24,
    paddingHorizontal: 16,
  },
  detailAvatar: {
    width: 80, height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 10,
  },
  detailAvatarLetter: { fontSize: 32, fontWeight: '800', color: '#fff' },
  detailName: { fontSize: 22, fontWeight: '800', color: '#fff', marginBottom: 8 },
  detailContacts: { gap: 4, alignItems: 'center' },
  detailContactRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  detailContactText: { fontSize: 12, color: 'rgba(255,255,255,0.8)' },

  statRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 14,
    alignItems: 'center',
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
    elevation: 2,
  },
  statVal: { fontSize: 18, fontWeight: '800', color: '#111827', marginTop: 6 },
  statLbl: { fontSize: 10, color: '#9CA3AF', fontWeight: '600', marginTop: 2, textTransform: 'uppercase' },

  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  infoLabel: { fontSize: 13, color: '#6B7280', fontWeight: '500', flex: 1 },
  infoValue: { fontSize: 14, fontWeight: '700', color: '#111827' },

  emptyCard: { alignItems: 'center', paddingVertical: 20, gap: 8 },
  emptyCardText: { fontSize: 13, color: '#9CA3AF' },

  deliveryRow: { flexDirection: 'row', paddingVertical: 10, gap: 10 },
  deliveryDotCol: { width: 16, alignItems: 'center', paddingTop: 4 },
  deliveryDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: P },
  deliveryLine: { flex: 1, width: 2, backgroundColor: '#E5E7EB', marginTop: 3 },
  deliveryItem: { fontSize: 13, fontWeight: '700', color: '#111827' },
  deliveryMeta: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  deliveryNote: { fontSize: 11, color: '#6B7280', marginTop: 2, fontStyle: 'italic' },
  deliveryCost: { fontSize: 13, fontWeight: '700', color: '#10B981', alignSelf: 'center' },
});

import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Alert, RefreshControl, Modal, ScrollView } from 'react-native';
import { ordersAPI, menuAPI, tablesAPI } from '../../api/client';

const STATUS_COLORS = {
  pending: '#F39C12', sent_to_kitchen: '#8E44AD',
  preparing: '#2980B9', ready: '#27AE60', served: '#95A5A6'
};

export default function WaitressActiveOrders() {
  const [orders, setOrders]         = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [orderModal, setOrderModal] = useState(false);
  const [tables, setTables]         = useState([]);
  const [menuItems, setMenuItems]   = useState([]);
  const [selectedTable, setSelectedTable] = useState(null);
  const [cart, setCart]             = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [detailModal, setDetailModal] = useState(false);

  const load = async () => {
    try { const res = await ordersAPI.getAll(); setOrders(res.data.filter(o => !['paid','cancelled'].includes(o.status))); }
    catch { Alert.alert('Error', 'Failed to load orders'); }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, []);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const openNewOrder = async () => {
    try {
      const [tablesRes, menuRes] = await Promise.all([tablesAPI.getAll(), menuAPI.getItems({ available_only: 'true' })]);
      setTables(tablesRes.data.filter(t => t.status === 'occupied'));
      setMenuItems(menuRes.data);
      setCart([]);
      setSelectedTable(null);
      setOrderModal(true);
    } catch { Alert.alert('Error', 'Failed to load data'); }
  };

  const addToCart = (item) => {
    setCart(prev => {
      const existing = prev.find(c => c.menu_item_id === item.id);
      if (existing) return prev.map(c => c.menu_item_id === item.id ? { ...c, quantity: c.quantity + 1 } : c);
      return [...prev, { menu_item_id: item.id, name: item.name, unit_price: item.price, quantity: 1, is_free: false }];
    });
  };

  const removeFromCart = (id) => setCart(prev => prev.filter(c => c.menu_item_id !== id));

  const submitOrder = async () => {
    if (!selectedTable || cart.length === 0) return Alert.alert('Error', 'Select a table and add items');
    try {
      await ordersAPI.create({ table_id: selectedTable.id, items: cart });
      setOrderModal(false);
      load();
      Alert.alert('Success', 'Order sent to kitchen!');
    } catch { Alert.alert('Error', 'Failed to place order'); }
  };

  const viewOrder = async (order) => {
    try {
      const res = await ordersAPI.getById(order.id);
      setSelectedOrder(res.data);
      setDetailModal(true);
    } catch { Alert.alert('Error', 'Failed to load order details'); }
  };

  const payOrder = (order) => Alert.alert('Payment', `Collect $${parseFloat(order.total_amount).toFixed(2)}`, [
    { text: 'Cash', onPress: async () => { await ordersAPI.pay(order.id, { payment_method: 'cash' }); load(); } },
    { text: 'Card', onPress: async () => { await ordersAPI.pay(order.id, { payment_method: 'card' }); load(); } },
    { text: 'Cancel' }
  ]);

  const cartTotal = cart.reduce((sum, i) => sum + (i.unit_price * i.quantity), 0);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>📋 Active Orders</Text>
        <TouchableOpacity style={styles.newOrderBtn} onPress={openNewOrder}>
          <Text style={styles.newOrderBtnText}>+ New Order</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={orders}
        keyExtractor={o => o.id}
        contentContainerStyle={{ padding: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.orderCard} onPress={() => viewOrder(item)}>
            <View style={styles.orderTop}>
              <Text style={styles.tableNum}>Table {item.table_number}</Text>
              <View style={[styles.badge, { backgroundColor: (STATUS_COLORS[item.status] || '#888') + '25' }]}>
                <Text style={[styles.badgeText, { color: STATUS_COLORS[item.status] || '#888' }]}>
                  {item.status.replace('_', ' ')}
                </Text>
              </View>
            </View>
            <Text style={styles.total}>${parseFloat(item.total_amount).toFixed(2)}</Text>
            {item.status === 'ready' && (
              <TouchableOpacity style={styles.payBtn} onPress={() => payOrder(item)}>
                <Text style={styles.payBtnText}>💳 Collect Payment</Text>
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        )}
      />

      {/* New Order Modal */}
      <Modal visible={orderModal} animationType="slide" presentationStyle="fullScreen">
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>New Order</Text>
            <TouchableOpacity onPress={() => setOrderModal(false)}><Text style={styles.closeBtn}>✕</Text></TouchableOpacity>
          </View>

          <Text style={styles.sectionTitle}>Select Table</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tableRow}>
            {tables.map(t => (
              <TouchableOpacity key={t.id} style={[styles.tableBtn, selectedTable?.id === t.id && styles.tableBtnActive]} onPress={() => setSelectedTable(t)}>
                <Text style={[styles.tableBtnText, selectedTable?.id === t.id && styles.tableBtnTextActive]}>Table {t.table_number}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={styles.sectionTitle}>Menu Items</Text>
          <FlatList
            data={menuItems}
            keyExtractor={i => i.id}
            numColumns={2}
            style={styles.menuList}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.menuItem} onPress={() => addToCart(item)}>
                <Text style={styles.menuItemName}>{item.name}</Text>
                <Text style={styles.menuItemPrice}>${item.price}</Text>
              </TouchableOpacity>
            )}
          />

          {cart.length > 0 && (
            <View style={styles.cartPanel}>
              <Text style={styles.cartTitle}>Cart ({cart.length} items)</Text>
              {cart.map(c => (
                <View key={c.menu_item_id} style={styles.cartItem}>
                  <Text style={styles.cartItemName}>{c.name} x{c.quantity}</Text>
                  <Text style={styles.cartItemPrice}>${(c.unit_price * c.quantity).toFixed(2)}</Text>
                  <TouchableOpacity onPress={() => removeFromCart(c.menu_item_id)}><Text style={styles.removeBtn}>✕</Text></TouchableOpacity>
                </View>
              ))}
              <View style={styles.cartTotal}>
                <Text style={styles.cartTotalLabel}>Total:</Text>
                <Text style={styles.cartTotalValue}>${cartTotal.toFixed(2)}</Text>
              </View>
              <TouchableOpacity style={styles.submitBtn} onPress={submitOrder}>
                <Text style={styles.submitBtnText}>🍳 Send to Kitchen</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>

      {/* Order Detail Modal */}
      <Modal visible={detailModal} animationType="slide" presentationStyle="pageSheet">
        {selectedOrder && (
          <View style={styles.detailModal}>
            <Text style={styles.modalTitle}>Order — Table {selectedOrder.table_number}</Text>
            <Text style={styles.detailStatus}>Status: {selectedOrder.status?.replace('_', ' ')}</Text>
            {selectedOrder.items?.map((item, i) => (
              <View key={i} style={styles.detailItem}>
                <Text style={styles.detailItemName}>{item.item_name}</Text>
                <Text style={styles.detailItemQty}>x{item.quantity}</Text>
                <Text style={styles.detailItemPrice}>${(item.unit_price * item.quantity).toFixed(2)}</Text>
              </View>
            ))}
            <View style={styles.detailTotal}>
              <Text style={styles.detailTotalLabel}>Total:</Text>
              <Text style={styles.detailTotalValue}>${parseFloat(selectedOrder.total_amount).toFixed(2)}</Text>
            </View>
            <TouchableOpacity style={styles.closeDetailBtn} onPress={() => setDetailModal(false)}>
              <Text style={styles.closeDetailBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container:          { flex: 1, backgroundColor: '#F4F6F8' },
  header:             { backgroundColor: '#27AE60', padding: 20, paddingTop: 50, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerText:         { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  newOrderBtn:        { backgroundColor: 'rgba(255,255,255,0.25)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  newOrderBtnText:    { color: '#fff', fontWeight: 'bold' },
  orderCard:          { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8, elevation: 2 },
  orderTop:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  tableNum:           { fontSize: 18, fontWeight: 'bold', color: '#333' },
  badge:              { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  badgeText:          { fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  total:              { fontSize: 20, fontWeight: 'bold', color: '#333', marginBottom: 8 },
  payBtn:             { backgroundColor: '#EAFAF1', padding: 10, borderRadius: 8, alignItems: 'center' },
  payBtnText:         { color: '#27AE60', fontWeight: 'bold' },
  modal:              { flex: 1, backgroundColor: '#F4F6F8' },
  modalHeader:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#27AE60', padding: 20, paddingTop: 50 },
  modalTitle:         { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  closeBtn:           { color: '#fff', fontSize: 20 },
  sectionTitle:       { fontSize: 14, fontWeight: '700', color: '#555', padding: 12, paddingBottom: 8 },
  tableRow:           { paddingLeft: 12, marginBottom: 8, maxHeight: 50 },
  tableBtn:           { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#DDD', marginRight: 8, backgroundColor: '#fff' },
  tableBtnActive:     { backgroundColor: '#27AE60', borderColor: '#27AE60' },
  tableBtnText:       { color: '#666' },
  tableBtnTextActive: { color: '#fff', fontWeight: 'bold' },
  menuList:           { flex: 1, paddingHorizontal: 6 },
  menuItem:           { flex: 1, margin: 6, backgroundColor: '#fff', borderRadius: 10, padding: 14, elevation: 1 },
  menuItemName:       { fontWeight: '600', color: '#333', fontSize: 14 },
  menuItemPrice:      { color: '#27AE60', fontWeight: 'bold', marginTop: 4 },
  cartPanel:          { backgroundColor: '#fff', padding: 14, elevation: 8, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  cartTitle:          { fontWeight: 'bold', fontSize: 15, marginBottom: 10, color: '#333' },
  cartItem:           { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  cartItemName:       { flex: 1, color: '#333' },
  cartItemPrice:      { fontWeight: 'bold', color: '#333', marginRight: 10 },
  removeBtn:          { color: '#E74C3C', fontWeight: 'bold', fontSize: 16 },
  cartTotal:          { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#EEE', paddingTop: 10, marginTop: 6 },
  cartTotalLabel:     { fontWeight: 'bold', color: '#333' },
  cartTotalValue:     { fontWeight: 'bold', fontSize: 18, color: '#27AE60' },
  submitBtn:          { backgroundColor: '#27AE60', padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 10 },
  submitBtnText:      { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  detailModal:        { flex: 1, padding: 24, paddingTop: 50 },
  detailStatus:       { color: '#888', marginBottom: 16, textTransform: 'capitalize' },
  detailItem:         { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  detailItemName:     { flex: 1, color: '#333' },
  detailItemQty:      { color: '#888', marginRight: 10 },
  detailItemPrice:    { fontWeight: 'bold', color: '#333' },
  detailTotal:        { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16, paddingTop: 10, borderTopWidth: 2, borderTopColor: '#EEE' },
  detailTotalLabel:   { fontWeight: 'bold', fontSize: 16 },
  detailTotalValue:   { fontWeight: 'bold', fontSize: 20, color: '#27AE60' },
  closeDetailBtn:     { backgroundColor: '#27AE60', padding: 16, borderRadius: 10, alignItems: 'center', marginTop: 20 },
  closeDetailBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});

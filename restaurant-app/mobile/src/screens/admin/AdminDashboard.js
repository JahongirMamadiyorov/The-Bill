import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, Alert, TouchableOpacity } from 'react-native';
import { reportsAPI, inventoryAPI } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const [dashboard, setDashboard] = useState(null);
  const [lowStock, setLowStock]   = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const [dRes, lRes] = await Promise.all([
        reportsAPI.getDashboard(),
        inventoryAPI.getLowStock(),
      ]);
      setDashboard(dRes.data);
      setLowStock(lRes.data);
    } catch { Alert.alert('Error', 'Failed to load data'); }
  };

  useEffect(() => { load(); }, []);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };
  const fmt = v => `$${parseFloat(v || 0).toFixed(2)}`;

  return (
    <ScrollView style={styles.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hello, {user?.name} 👋</Text>
          <Text style={styles.role}>Admin Panel</Text>
        </View>
        <TouchableOpacity onPress={() => Alert.alert('Logout', 'Sure?', [{ text: 'Cancel' }, { text: 'Logout', onPress: logout, style: 'destructive' }])}>
          <Text style={styles.logoutBtn}>Logout</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.statsRow}>
        <View style={[styles.stat, { backgroundColor: '#EBF5FB' }]}>
          <Text style={styles.statVal}>{dashboard?.today?.orders || 0}</Text>
          <Text style={styles.statLbl}>Today's Orders</Text>
        </View>
        <View style={[styles.stat, { backgroundColor: '#EAFAF1' }]}>
          <Text style={styles.statVal}>{fmt(dashboard?.today?.revenue)}</Text>
          <Text style={styles.statLbl}>Today's Revenue</Text>
        </View>
      </View>

      {lowStock.length > 0 && (
        <View style={styles.alertBox}>
          <Text style={styles.alertTitle}>⚠️ Low Stock Alert ({lowStock.length} items)</Text>
          {lowStock.map((item, i) => (
            <Text key={i} style={styles.alertItem}>• {item.name} — {item.quantity_in_stock} {item.unit} left</Text>
          ))}
        </View>
      )}

      <Text style={styles.sectionTitle}>Table Status</Text>
      <View style={styles.tableGrid}>
        {dashboard?.table_status?.map(t => (
          <View key={t.status} style={[styles.tableStatCard, { backgroundColor: t.status === 'occupied' ? '#FDECEA' : '#EAFAF1' }]}>
            <Text style={styles.tableCount}>{t.count}</Text>
            <Text style={styles.tableStatus}>{t.status}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#F4F6F8' },
  header:       { backgroundColor: '#2980B9', padding: 20, paddingTop: 50, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  greeting:     { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  role:         { color: 'rgba(255,255,255,0.8)', fontSize: 13 },
  logoutBtn:    { color: '#fff', fontSize: 13, textDecorationLine: 'underline' },
  statsRow:     { flexDirection: 'row', padding: 12, gap: 10 },
  stat:         { flex: 1, borderRadius: 12, padding: 16, alignItems: 'center' },
  statVal:      { fontSize: 22, fontWeight: 'bold', color: '#333' },
  statLbl:      { fontSize: 12, color: '#888', marginTop: 4 },
  alertBox:     { backgroundColor: '#FFF3CD', margin: 12, borderRadius: 12, padding: 14, borderLeftWidth: 4, borderLeftColor: '#F0AD4E' },
  alertTitle:   { fontWeight: 'bold', color: '#856404', marginBottom: 8 },
  alertItem:    { color: '#856404', marginBottom: 4, fontSize: 13 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#333', paddingHorizontal: 16, marginTop: 10, marginBottom: 8 },
  tableGrid:    { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, gap: 8 },
  tableStatCard:{ width: '47%', borderRadius: 10, padding: 14, alignItems: 'center' },
  tableCount:   { fontSize: 24, fontWeight: 'bold', color: '#333' },
  tableStatus:  { fontSize: 12, color: '#666', textTransform: 'capitalize', marginTop: 4 },
});

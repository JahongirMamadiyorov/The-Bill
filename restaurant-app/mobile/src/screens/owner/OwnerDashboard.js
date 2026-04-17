import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { reportsAPI } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

const StatCard = ({ label, value, color, icon }) => (
  <View style={[styles.card, { borderLeftColor: color }]}>
    <Text style={styles.cardIcon}>{icon}</Text>
    <Text style={styles.cardValue}>{value}</Text>
    <Text style={styles.cardLabel}>{label}</Text>
  </View>
);

export default function OwnerDashboard() {
  const { user, logout } = useAuth();
  const [data, setData]         = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    try {
      const res = await reportsAPI.getDashboard();
      setData(res.data);
    } catch (err) {
      Alert.alert('Error', 'Failed to load dashboard');
    }
  };

  useEffect(() => { fetchData(); }, []);

  const onRefresh = async () => { setRefreshing(true); await fetchData(); setRefreshing(false); };

  const fmt = (v) => `$${parseFloat(v || 0).toFixed(2)}`;

  return (
    <ScrollView style={styles.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hello, {user?.name} 👋</Text>
          <Text style={styles.role}>Owner Dashboard</Text>
        </View>
        <TouchableOpacity onPress={() => Alert.alert('Logout', 'Are you sure?', [
          { text: 'Cancel' }, { text: 'Logout', onPress: logout, style: 'destructive' }
        ])}>
          <Text style={styles.logoutBtn}>Logout</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.section}>Today</Text>
      <View style={styles.row}>
        <StatCard label="Revenue" value={fmt(data?.today?.revenue)} color="#E74C3C" icon="💰" />
        <StatCard label="Orders"  value={data?.today?.orders || '0'} color="#3498DB" icon="📋" />
      </View>

      <Text style={styles.section}>This Month</Text>
      <View style={styles.row}>
        <StatCard label="Revenue" value={fmt(data?.this_month?.revenue)} color="#2ECC71" icon="📈" />
        <StatCard label="Orders"  value={data?.this_month?.orders || '0'} color="#9B59B6" icon="🧾" />
      </View>

      <Text style={styles.section}>Tables</Text>
      <View style={styles.tableStatusRow}>
        {data?.table_status?.map(t => (
          <View key={t.status} style={[styles.tableStatus, { backgroundColor: t.status === 'occupied' ? '#FDECEA' : '#EAF7EA' }]}>
            <Text style={styles.tableStatusCount}>{t.count}</Text>
            <Text style={styles.tableStatusLabel}>{t.status}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.section}>Top Items (Last 30 Days)</Text>
      {data?.top_items?.map((item, i) => (
        <View key={i} style={styles.topItem}>
          <Text style={styles.topItemRank}>#{i + 1}</Text>
          <Text style={styles.topItemName}>{item.name}</Text>
          <Text style={styles.topItemValue}>{item.qty_sold} sold · {fmt(item.revenue)}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:         { flex: 1, backgroundColor: '#F4F6F8' },
  header:            { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#E74C3C', padding: 20, paddingTop: 50 },
  greeting:          { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  role:              { color: 'rgba(255,255,255,0.8)', fontSize: 13 },
  logoutBtn:         { color: '#fff', fontSize: 13, textDecorationLine: 'underline' },
  section:           { fontSize: 15, fontWeight: '700', color: '#333', paddingHorizontal: 16, marginTop: 20, marginBottom: 8 },
  row:               { flexDirection: 'row', paddingHorizontal: 12, gap: 10 },
  card:              { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 16, borderLeftWidth: 4, elevation: 2 },
  cardIcon:          { fontSize: 24, marginBottom: 6 },
  cardValue:         { fontSize: 22, fontWeight: 'bold', color: '#1A1A1A' },
  cardLabel:         { fontSize: 12, color: '#888', marginTop: 2 },
  tableStatusRow:    { flexDirection: 'row', paddingHorizontal: 12, gap: 8 },
  tableStatus:       { flex: 1, borderRadius: 10, padding: 12, alignItems: 'center' },
  tableStatusCount:  { fontSize: 22, fontWeight: 'bold', color: '#333' },
  tableStatusLabel:  { fontSize: 11, color: '#666', textTransform: 'capitalize' },
  topItem:           { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', marginHorizontal: 12, marginBottom: 6, borderRadius: 10, padding: 14, elevation: 1 },
  topItemRank:       { fontSize: 14, fontWeight: 'bold', color: '#E74C3C', width: 28 },
  topItemName:       { flex: 1, fontSize: 14, color: '#333' },
  topItemValue:      { fontSize: 12, color: '#888' },
});

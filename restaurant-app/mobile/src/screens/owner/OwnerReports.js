import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { reportsAPI } from '../../api/client';

export default function OwnerReports() {
  const [bestSellers, setBestSellers]   = useState([]);
  const [performance, setPerformance]   = useState([]);
  const [tab, setTab]                   = useState('bestsellers');

  useEffect(() => {
    (async () => {
      try {
        const [bsRes, perfRes] = await Promise.all([
          reportsAPI.getBestSellers({ limit: 10 }),
          reportsAPI.getWaitressPerformance(),
        ]);
        setBestSellers(bsRes.data);
        setPerformance(perfRes.data);
      } catch { Alert.alert('Error', 'Failed to load reports'); }
    })();
  }, []);

  const fmt = v => `$${parseFloat(v || 0).toFixed(2)}`;

  return (
    <View style={styles.container}>
      <View style={styles.header}><Text style={styles.headerText}>📊 Reports</Text></View>
      <View style={styles.tabs}>
        {[['bestsellers', 'Best Sellers'], ['performance', 'Waitress Performance']].map(([k, l]) => (
          <TouchableOpacity key={k} style={[styles.tab, tab === k && styles.activeTab]} onPress={() => setTab(k)}>
            <Text style={[styles.tabText, tab === k && styles.activeTabText]}>{l}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <ScrollView style={styles.content}>
        {tab === 'bestsellers' && bestSellers.map((item, i) => (
          <View key={i} style={styles.row}>
            <Text style={styles.rank}>#{i + 1}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.cat}>{item.category}</Text>
            </View>
            <View style={styles.stats}>
              <Text style={styles.qty}>{item.qty_sold} sold</Text>
              <Text style={styles.revenue}>{fmt(item.revenue)}</Text>
            </View>
          </View>
        ))}
        {tab === 'performance' && performance.map((w, i) => (
          <View key={i} style={styles.row}>
            <Text style={styles.rank}>#{i + 1}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{w.name}</Text>
              <Text style={styles.cat}>{w.orders_served} orders · avg {fmt(w.avg_order_value)}</Text>
            </View>
            <Text style={styles.revenue}>{fmt(w.revenue_generated)}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:     { flex: 1, backgroundColor: '#F4F6F8' },
  header:        { backgroundColor: '#E74C3C', padding: 20, paddingTop: 50 },
  headerText:    { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  tabs:          { flexDirection: 'row', backgroundColor: '#fff', elevation: 2 },
  tab:           { flex: 1, padding: 14, alignItems: 'center' },
  activeTab:     { borderBottomWidth: 2, borderBottomColor: '#E74C3C' },
  tabText:       { color: '#888', fontWeight: '600', fontSize: 12 },
  activeTabText: { color: '#E74C3C' },
  content:       { padding: 12 },
  row:           { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 8, elevation: 1 },
  rank:          { fontWeight: 'bold', color: '#E74C3C', width: 28, fontSize: 14 },
  name:          { fontWeight: '600', color: '#333' },
  cat:           { color: '#888', fontSize: 12 },
  stats:         { alignItems: 'flex-end' },
  qty:           { color: '#888', fontSize: 12 },
  revenue:       { fontWeight: 'bold', color: '#27AE60' },
});

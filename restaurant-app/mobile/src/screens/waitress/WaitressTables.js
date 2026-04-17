import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Alert, RefreshControl } from 'react-native';
import { tablesAPI } from '../../api/client';
import { useNavigation } from '@react-navigation/native';

const STATUS_COLOR = { free: '#EAFAF1', occupied: '#FDECEA', reserved: '#FEF9E7', closed: '#F2F3F4' };
const STATUS_TEXT  = { free: '#27AE60', occupied: '#E74C3C', reserved: '#F39C12', closed: '#888' };

export default function WaitressTables() {
  const [tables, setTables]         = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const navigation = useNavigation();

  const load = async () => {
    try { const res = await tablesAPI.getAll(); setTables(res.data); }
    catch { Alert.alert('Error', 'Failed to load tables'); }
  };

  useEffect(() => { load(); const interval = setInterval(load, 30000); return () => clearInterval(interval); }, []);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const openTable = (table) => {
    if (table.status === 'free') {
      Alert.alert('Open Table', `Open Table ${table.table_number}?`, [
        { text: 'Cancel' },
        { text: 'Open', onPress: async () => { await tablesAPI.open(table.id); load(); } }
      ]);
    } else if (table.status === 'occupied') {
      navigation.navigate('Orders', { table });
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}><Text style={styles.headerText}>🪑 My Tables</Text></View>
      <FlatList
        data={tables}
        keyExtractor={t => t.id}
        numColumns={2}
        contentContainerStyle={{ padding: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item }) => (
          <TouchableOpacity style={[styles.tableCard, { backgroundColor: STATUS_COLOR[item.status] }]} onPress={() => openTable(item)}>
            <Text style={styles.tableNum}>{item.table_number}</Text>
            <Text style={[styles.tableStatus, { color: STATUS_TEXT[item.status] }]}>{item.status.toUpperCase()}</Text>
            {item.waitress_name && <Text style={styles.waitressName}>{item.waitress_name}</Text>}
            <Text style={styles.capacity}>👤 {item.capacity}</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#F4F6F8' },
  header:       { backgroundColor: '#27AE60', padding: 20, paddingTop: 50 },
  headerText:   { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  tableCard:    { flex: 1, margin: 6, borderRadius: 14, padding: 18, alignItems: 'center', elevation: 2, minHeight: 110 },
  tableNum:     { fontSize: 32, fontWeight: 'bold', color: '#333' },
  tableStatus:  { fontSize: 12, fontWeight: '700', marginTop: 4 },
  waitressName: { fontSize: 11, color: '#888', marginTop: 4 },
  capacity:     { fontSize: 12, color: '#666', marginTop: 6 },
});

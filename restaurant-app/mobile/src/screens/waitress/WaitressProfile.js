import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { shiftsAPI, ordersAPI } from '../../api/client';

export default function WaitressProfile() {
  const { user, logout } = useAuth();
  const [clocked, setClocked] = useState(false);
  const [todayOrders, setTodayOrders] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await ordersAPI.getAll({ status: 'paid' });
        setTodayOrders(res.data);
      } catch {}
    })();
  }, []);

  const clockIn = async () => {
    try { await shiftsAPI.clockIn(0); setClocked(true); Alert.alert('Clocked In', 'Shift started!'); }
    catch { Alert.alert('Error', 'Failed to clock in'); }
  };

  const clockOut = async () => {
    Alert.alert('Clock Out', 'End your shift?', [
      { text: 'Cancel' },
      { text: 'Clock Out', onPress: async () => {
        try { await shiftsAPI.clockOut(); setClocked(false); Alert.alert('Clocked Out', 'Shift ended'); }
        catch { Alert.alert('Error', 'Failed to clock out'); }
      }}
    ]);
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.avatar}>👤</Text>
        <Text style={styles.name}>{user?.name}</Text>
        <Text style={styles.role}>WAITRESS</Text>
        <Text style={styles.email}>{user?.email}</Text>
      </View>

      <View style={styles.shiftCard}>
        <Text style={styles.shiftTitle}>Shift</Text>
        <TouchableOpacity style={[styles.shiftBtn, { backgroundColor: clocked ? '#E74C3C' : '#27AE60' }]} onPress={clocked ? clockOut : clockIn}>
          <Text style={styles.shiftBtnText}>{clocked ? '⏹ Clock Out' : '▶️ Clock In'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.statsCard}>
        <Text style={styles.statsTitle}>Today's Performance</Text>
        <Text style={styles.statItem}>Orders served: <Text style={styles.statValue}>{todayOrders.length}</Text></Text>
        <Text style={styles.statItem}>Total collected: <Text style={styles.statValue}>${todayOrders.reduce((s, o) => s + parseFloat(o.total_amount), 0).toFixed(2)}</Text></Text>
      </View>

      <TouchableOpacity style={styles.logoutBtn} onPress={() => Alert.alert('Logout', 'End session?', [
        { text: 'Cancel' }, { text: 'Logout', style: 'destructive', onPress: logout }
      ])}>
        <Text style={styles.logoutText}>🚪 Logout</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#F4F6F8' },
  header:      { backgroundColor: '#27AE60', padding: 30, paddingTop: 60, alignItems: 'center' },
  avatar:      { fontSize: 56, marginBottom: 10 },
  name:        { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  role:        { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '700', marginTop: 4 },
  email:       { color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 4 },
  shiftCard:   { backgroundColor: '#fff', margin: 16, borderRadius: 14, padding: 20, elevation: 2 },
  shiftTitle:  { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 12 },
  shiftBtn:    { padding: 16, borderRadius: 10, alignItems: 'center' },
  shiftBtnText:{ color: '#fff', fontWeight: 'bold', fontSize: 16 },
  statsCard:   { backgroundColor: '#fff', marginHorizontal: 16, borderRadius: 14, padding: 20, elevation: 2 },
  statsTitle:  { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 12 },
  statItem:    { color: '#888', fontSize: 14, marginBottom: 6 },
  statValue:   { color: '#333', fontWeight: 'bold' },
  logoutBtn:   { margin: 16, backgroundColor: '#fff', padding: 16, borderRadius: 12, alignItems: 'center', elevation: 1 },
  logoutText:  { color: '#E74C3C', fontWeight: 'bold', fontSize: 15 },
});

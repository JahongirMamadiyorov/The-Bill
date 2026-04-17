import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Alert, RefreshControl } from 'react-native';
import { notificationsAPI } from '../../api/client';

export default function WaitressNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [refreshing, setRefreshing]       = useState(false);

  const load = async () => {
    try { const res = await notificationsAPI.getAll(); setNotifications(res.data); }
    catch { Alert.alert('Error', 'Failed to load notifications'); }
  };

  useEffect(() => { load(); const i = setInterval(load, 30000); return () => clearInterval(i); }, []);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const markRead = async (id) => {
    await notificationsAPI.markRead(id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  };

  const markAll = async () => { await notificationsAPI.markAllRead(); load(); };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>🔔 Notifications</Text>
        <TouchableOpacity onPress={markAll}><Text style={styles.markAll}>Mark all read</Text></TouchableOpacity>
      </View>
      <FlatList
        data={notifications}
        keyExtractor={n => n.id}
        contentContainerStyle={{ padding: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item }) => (
          <TouchableOpacity style={[styles.card, !item.is_read && styles.unread]} onPress={() => markRead(item.id)}>
            {!item.is_read && <View style={styles.dot} />}
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{item.title}</Text>
              {item.body && <Text style={styles.body}>{item.body}</Text>}
              <Text style={styles.time}>{new Date(item.created_at).toLocaleString()}</Text>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No notifications</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6F8' },
  header:    { backgroundColor: '#27AE60', padding: 20, paddingTop: 50, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerText:{ color: '#fff', fontSize: 20, fontWeight: 'bold' },
  markAll:   { color: 'rgba(255,255,255,0.8)', fontSize: 13 },
  card:      { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8, elevation: 1 },
  unread:    { borderLeftWidth: 3, borderLeftColor: '#27AE60' },
  dot:       { width: 8, height: 8, borderRadius: 4, backgroundColor: '#27AE60', marginRight: 10, marginTop: 5 },
  title:     { fontWeight: 'bold', color: '#333', fontSize: 14 },
  body:      { color: '#666', fontSize: 13, marginTop: 2 },
  time:      { color: '#AAA', fontSize: 11, marginTop: 4 },
  empty:     { textAlign: 'center', color: '#AAA', marginTop: 40 },
});

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native';
import { useAuth } from '../../context/AuthContext';

export default function OwnerSettings() {
  const { user, logout } = useAuth();
  return (
    <View style={styles.container}>
      <View style={styles.header}><Text style={styles.headerText}>⚙️ Settings</Text></View>
      <ScrollView style={{ padding: 16 }}>
        <View style={styles.profileCard}>
          <Text style={styles.avatar}>👤</Text>
          <Text style={styles.profileName}>{user?.name}</Text>
          <Text style={styles.profileEmail}>{user?.email}</Text>
          <Text style={styles.profileRole}>OWNER</Text>
        </View>
        <TouchableOpacity style={styles.menuItem}>
          <Text style={styles.menuItemText}>🏦 Tax Settings</Text>
          <Text style={styles.arrow}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuItem}>
          <Text style={styles.menuItemText}>🔔 Notifications</Text>
          <Text style={styles.arrow}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuItem}>
          <Text style={styles.menuItemText}>🏪 Restaurant Info</Text>
          <Text style={styles.arrow}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.menuItem, styles.logout]} onPress={() =>
          Alert.alert('Logout', 'Are you sure?', [{ text: 'Cancel' }, { text: 'Logout', style: 'destructive', onPress: logout }])
        }>
          <Text style={[styles.menuItemText, { color: '#E74C3C' }]}>🚪 Logout</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#F4F6F8' },
  header:       { backgroundColor: '#E74C3C', padding: 20, paddingTop: 50 },
  headerText:   { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  profileCard:  { backgroundColor: '#fff', borderRadius: 14, padding: 24, alignItems: 'center', marginBottom: 20, elevation: 2 },
  avatar:       { fontSize: 48, marginBottom: 8 },
  profileName:  { fontSize: 20, fontWeight: 'bold', color: '#333' },
  profileEmail: { color: '#888', marginTop: 4 },
  profileRole:  { color: '#E74C3C', fontWeight: '700', marginTop: 6, fontSize: 12 },
  menuItem:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, padding: 16, marginBottom: 8, elevation: 1 },
  menuItemText: { fontSize: 15, color: '#333' },
  arrow:        { fontSize: 20, color: '#CCC' },
  logout:       { marginTop: 8 },
});

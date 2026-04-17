import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Alert, Modal, TextInput, Switch } from 'react-native';
import { usersAPI } from '../../api/client';

const PERMISSIONS = [
  { key: 'can_create_orders',        label: 'Create orders' },
  { key: 'can_modify_orders',        label: 'Modify orders' },
  { key: 'can_cancel_orders',        label: 'Cancel orders' },
  { key: 'can_delete_order_items',   label: 'Delete items from order' },
  { key: 'can_add_free_items',       label: 'Add free items' },
  { key: 'can_apply_discounts',      label: 'Apply discounts' },
  { key: 'can_set_custom_price',     label: 'Set custom price' },
  { key: 'can_process_payments',     label: 'Process payments' },
  { key: 'can_split_bills',          label: 'Split bills' },
  { key: 'can_issue_refunds',        label: 'Issue refunds' },
  { key: 'can_open_close_table',     label: 'Open/close tables' },
  { key: 'can_transfer_table',       label: 'Transfer tables' },
  { key: 'can_merge_tables',         label: 'Merge tables' },
  { key: 'can_see_other_tables',     label: 'See other waitress tables' },
  { key: 'can_see_sales_numbers',    label: 'See sales numbers' },
  { key: 'can_see_customer_history', label: 'See customer history' },
];

export default function OwnerStaff() {
  const [users, setUsers]           = useState([]);
  const [selected, setSelected]     = useState(null);
  const [permissions, setPermissions] = useState({});
  const [permModal, setPermModal]   = useState(false);
  const [addModal, setAddModal]     = useState(false);
  const [form, setForm]             = useState({ name: '', email: '', password: '', phone: '', role: 'waitress' });

  useEffect(() => { loadUsers(); }, []);

  const loadUsers = async () => {
    try { const res = await usersAPI.getAll(); setUsers(res.data); }
    catch { Alert.alert('Error', 'Failed to load staff'); }
  };

  const openPermissions = async (user) => {
    setSelected(user);
    try {
      const res = await usersAPI.getPermissions(user.id);
      setPermissions(res.data);
      setPermModal(true);
    } catch { Alert.alert('Error', 'Failed to load permissions'); }
  };

  const savePermissions = async () => {
    try {
      await usersAPI.updatePermissions(selected.id, permissions);
      Alert.alert('Saved', 'Permissions updated');
      setPermModal(false);
    } catch { Alert.alert('Error', 'Failed to save'); }
  };

  const createUser = async () => {
    if (!form.name || !form.email || !form.password) return Alert.alert('Error', 'Name, email and password required');
    try {
      await usersAPI.create(form);
      setAddModal(false);
      setForm({ name: '', email: '', password: '', phone: '', role: 'waitress' });
      loadUsers();
    } catch (err) { Alert.alert('Error', err.response?.data?.error || 'Failed to create user'); }
  };

  const deactivate = (id) => Alert.alert('Deactivate', 'Deactivate this user?', [
    { text: 'Cancel' },
    { text: 'Deactivate', style: 'destructive', onPress: async () => { await usersAPI.delete(id); loadUsers(); } }
  ]);

  const roleColor = { owner: '#E74C3C', admin: '#2980B9', waitress: '#27AE60' };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>👥 Staff</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setAddModal(true)}>
          <Text style={styles.addBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={users}
        keyExtractor={u => u.id}
        contentContainerStyle={{ padding: 12 }}
        renderItem={({ item }) => (
          <View style={styles.userCard}>
            <View style={[styles.roleDot, { backgroundColor: roleColor[item.role] || '#888' }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.userName}>{item.name}</Text>
              <Text style={styles.userEmail}>{item.email}</Text>
              <Text style={[styles.roleTag, { color: roleColor[item.role] }]}>{item.role.toUpperCase()}</Text>
            </View>
            <View style={styles.actions}>
              {item.role === 'waitress' && (
                <TouchableOpacity style={styles.permBtn} onPress={() => openPermissions(item)}>
                  <Text style={styles.permBtnText}>Permissions</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => deactivate(item.id)}>
                <Text style={styles.deactivateText}>Deactivate</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />

      {/* Permissions Modal */}
      <Modal visible={permModal} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>Permissions — {selected?.name}</Text>
          <FlatList
            data={PERMISSIONS}
            keyExtractor={p => p.key}
            renderItem={({ item }) => (
              <View style={styles.permRow}>
                <Text style={styles.permLabel}>{item.label}</Text>
                <Switch
                  value={!!permissions[item.key]}
                  onValueChange={v => setPermissions(prev => ({ ...prev, [item.key]: v }))}
                  trackColor={{ true: '#27AE60' }}
                />
              </View>
            )}
          />
          <TouchableOpacity style={styles.saveBtn} onPress={savePermissions}><Text style={styles.saveBtnText}>Save Permissions</Text></TouchableOpacity>
          <TouchableOpacity style={styles.cancelBtn} onPress={() => setPermModal(false)}><Text style={styles.cancelBtnText}>Cancel</Text></TouchableOpacity>
        </View>
      </Modal>

      {/* Add User Modal */}
      <Modal visible={addModal} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>Add Staff Member</Text>
          <TextInput style={styles.input} placeholder="Full Name" value={form.name} onChangeText={v => setForm({...form, name: v})} />
          <TextInput style={styles.input} placeholder="Email" keyboardType="email-address" autoCapitalize="none" value={form.email} onChangeText={v => setForm({...form, email: v})} />
          <TextInput style={styles.input} placeholder="Password" secureTextEntry value={form.password} onChangeText={v => setForm({...form, password: v})} />
          <TextInput style={styles.input} placeholder="Phone (optional)" value={form.phone} onChangeText={v => setForm({...form, phone: v})} />
          <View style={styles.roleRow}>
            {['waitress', 'admin', 'owner'].map(r => (
              <TouchableOpacity key={r} style={[styles.roleBtn, form.role === r && styles.roleBtnActive]} onPress={() => setForm({...form, role: r})}>
                <Text style={[styles.roleBtnText, form.role === r && styles.roleBtnTextActive]}>{r}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={styles.saveBtn} onPress={createUser}><Text style={styles.saveBtnText}>Create</Text></TouchableOpacity>
          <TouchableOpacity style={styles.cancelBtn} onPress={() => setAddModal(false)}><Text style={styles.cancelBtnText}>Cancel</Text></TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#F4F6F8' },
  header:          { backgroundColor: '#E74C3C', padding: 20, paddingTop: 50, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerText:      { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  addBtn:          { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  addBtnText:      { color: '#fff', fontWeight: 'bold' },
  userCard:        { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8, elevation: 1 },
  roleDot:         { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  userName:        { fontWeight: 'bold', fontSize: 15, color: '#333' },
  userEmail:       { color: '#888', fontSize: 12 },
  roleTag:         { fontSize: 11, fontWeight: '700', marginTop: 2 },
  actions:         { alignItems: 'flex-end', gap: 6 },
  permBtn:         { backgroundColor: '#EBF5FB', padding: 8, borderRadius: 8 },
  permBtnText:     { color: '#2980B9', fontSize: 12, fontWeight: '600' },
  deactivateText:  { color: '#E74C3C', fontSize: 12 },
  modal:           { flex: 1, padding: 24, paddingTop: 50 },
  modalTitle:      { fontSize: 20, fontWeight: 'bold', marginBottom: 16 },
  permRow:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  permLabel:       { color: '#333', flex: 1, fontSize: 14 },
  saveBtn:         { backgroundColor: '#E74C3C', padding: 16, borderRadius: 10, alignItems: 'center', marginTop: 16 },
  saveBtnText:     { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  cancelBtn:       { padding: 14, alignItems: 'center' },
  cancelBtnText:   { color: '#888' },
  input:           { borderWidth: 1, borderColor: '#DDD', borderRadius: 10, padding: 14, marginBottom: 12, fontSize: 15 },
  roleRow:         { flexDirection: 'row', gap: 8, marginBottom: 14 },
  roleBtn:         { flex: 1, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#DDD', alignItems: 'center' },
  roleBtnActive:   { backgroundColor: '#E74C3C', borderColor: '#E74C3C' },
  roleBtnText:     { color: '#888', textTransform: 'capitalize' },
  roleBtnTextActive: { color: '#fff', fontWeight: 'bold' },
});

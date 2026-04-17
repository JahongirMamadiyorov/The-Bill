import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Alert, Modal, TextInput } from 'react-native';
import { inventoryAPI } from '../../api/client';

export default function AdminInventory() {
  const [items, setItems]   = useState([]);
  const [modal, setModal]   = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm]     = useState({ name: '', unit: '', quantity_in_stock: '', low_stock_alert: '', cost_per_unit: '' });

  useEffect(() => { load(); }, []);
  const load = async () => {
    try { const res = await inventoryAPI.getAll(); setItems(res.data); }
    catch { Alert.alert('Error', 'Failed to load inventory'); }
  };

  const openAdd  = () => { setEditing(null); setForm({ name: '', unit: '', quantity_in_stock: '', low_stock_alert: '', cost_per_unit: '' }); setModal(true); };
  const openEdit = (item) => { setEditing(item); setForm({ ...item, quantity_in_stock: String(item.quantity_in_stock), low_stock_alert: String(item.low_stock_alert), cost_per_unit: String(item.cost_per_unit) }); setModal(true); };

  const save = async () => {
    if (!form.name || !form.quantity_in_stock) return Alert.alert('Error', 'Name and quantity required');
    const payload = { ...form, quantity_in_stock: parseFloat(form.quantity_in_stock), low_stock_alert: parseFloat(form.low_stock_alert || 5), cost_per_unit: parseFloat(form.cost_per_unit || 0) };
    try {
      if (editing) await inventoryAPI.update(editing.id, payload);
      else         await inventoryAPI.create(payload);
      setModal(false); load();
    } catch { Alert.alert('Error', 'Failed to save'); }
  };

  const isLow = (item) => item.quantity_in_stock <= item.low_stock_alert;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>📦 Inventory</Text>
        <TouchableOpacity style={styles.addBtn} onPress={openAdd}><Text style={styles.addBtnText}>+ Add</Text></TouchableOpacity>
      </View>
      <FlatList
        data={items}
        keyExtractor={i => i.id}
        contentContainerStyle={{ padding: 12 }}
        renderItem={({ item }) => (
          <TouchableOpacity style={[styles.card, isLow(item) && styles.cardLow]} onPress={() => openEdit(item)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.unit}>{item.unit}</Text>
            </View>
            <View style={styles.right}>
              <Text style={[styles.qty, isLow(item) && styles.qtyLow]}>{item.quantity_in_stock} {item.unit}</Text>
              {isLow(item) && <Text style={styles.lowBadge}>⚠️ Low</Text>}
              <Text style={styles.cost}>${item.cost_per_unit}/unit</Text>
            </View>
          </TouchableOpacity>
        )}
      />

      <Modal visible={modal} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>{editing ? 'Edit Ingredient' : 'New Ingredient'}</Text>
          <TextInput style={styles.input} placeholder="Name" value={form.name} onChangeText={v => setForm({...form, name: v})} />
          <TextInput style={styles.input} placeholder="Unit (kg, L, pcs...)" value={form.unit} onChangeText={v => setForm({...form, unit: v})} />
          <TextInput style={styles.input} placeholder="Quantity in stock" keyboardType="numeric" value={form.quantity_in_stock} onChangeText={v => setForm({...form, quantity_in_stock: v})} />
          <TextInput style={styles.input} placeholder="Low stock alert threshold" keyboardType="numeric" value={form.low_stock_alert} onChangeText={v => setForm({...form, low_stock_alert: v})} />
          <TextInput style={styles.input} placeholder="Cost per unit ($)" keyboardType="numeric" value={form.cost_per_unit} onChangeText={v => setForm({...form, cost_per_unit: v})} />
          <TouchableOpacity style={styles.saveBtn} onPress={save}><Text style={styles.saveBtnText}>Save</Text></TouchableOpacity>
          <TouchableOpacity style={styles.cancelBtn} onPress={() => setModal(false)}><Text style={styles.cancelBtnText}>Cancel</Text></TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#F4F6F8' },
  header:     { backgroundColor: '#2980B9', padding: 20, paddingTop: 50, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerText: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  addBtn:     { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  addBtnText: { color: '#fff', fontWeight: 'bold' },
  card:       { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8, elevation: 1 },
  cardLow:    { borderLeftWidth: 4, borderLeftColor: '#E74C3C' },
  name:       { fontWeight: 'bold', color: '#333', fontSize: 15 },
  unit:       { color: '#888', fontSize: 12 },
  right:      { alignItems: 'flex-end' },
  qty:        { fontWeight: 'bold', color: '#333', fontSize: 16 },
  qtyLow:     { color: '#E74C3C' },
  lowBadge:   { fontSize: 11, color: '#E74C3C', fontWeight: '600' },
  cost:       { color: '#888', fontSize: 11 },
  modal:      { flex: 1, padding: 24, paddingTop: 50 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 16 },
  input:      { borderWidth: 1, borderColor: '#DDD', borderRadius: 10, padding: 14, marginBottom: 12, fontSize: 15 },
  saveBtn:    { backgroundColor: '#2980B9', padding: 16, borderRadius: 10, alignItems: 'center', marginTop: 6 },
  saveBtnText:{ color: '#fff', fontWeight: 'bold', fontSize: 16 },
  cancelBtn:  { padding: 14, alignItems: 'center' },
  cancelBtnText: { color: '#888' },
});

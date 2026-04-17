import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Alert, Modal, TextInput, Switch } from 'react-native';
import { menuAPI } from '../../api/client';

export default function AdminMenu() {
  const [items, setItems]           = useState([]);
  const [categories, setCategories] = useState([]);
  const [modal, setModal]           = useState(false);
  const [editing, setEditing]       = useState(null);
  const [form, setForm]             = useState({ name: '', description: '', price: '', category_id: '', is_available: true });

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    try {
      const [iRes, cRes] = await Promise.all([menuAPI.getItems(), menuAPI.getCategories()]);
      setItems(iRes.data);
      setCategories(cRes.data);
    } catch { Alert.alert('Error', 'Failed to load menu'); }
  };

  const openAdd = () => { setEditing(null); setForm({ name: '', description: '', price: '', category_id: '', is_available: true }); setModal(true); };
  const openEdit = (item) => { setEditing(item); setForm({ ...item, price: String(item.price) }); setModal(true); };

  const save = async () => {
    if (!form.name || !form.price) return Alert.alert('Error', 'Name and price required');
    try {
      if (editing) await menuAPI.updateItem(editing.id, { ...form, price: parseFloat(form.price) });
      else         await menuAPI.createItem({ ...form, price: parseFloat(form.price) });
      setModal(false);
      loadAll();
    } catch { Alert.alert('Error', 'Failed to save item'); }
  };

  const deleteItem = (id) => Alert.alert('Delete', 'Delete this menu item?', [
    { text: 'Cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => { await menuAPI.deleteItem(id); loadAll(); } }
  ]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>🍽 Menu</Text>
        <TouchableOpacity style={styles.addBtn} onPress={openAdd}><Text style={styles.addBtnText}>+ Add Item</Text></TouchableOpacity>
      </View>

      <FlatList
        data={items}
        keyExtractor={i => i.id}
        contentContainerStyle={{ padding: 12 }}
        renderItem={({ item }) => (
          <View style={styles.itemCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={styles.itemCat}>{item.category_name}</Text>
              <Text style={styles.itemDesc} numberOfLines={1}>{item.description}</Text>
            </View>
            <View style={styles.itemRight}>
              <Text style={styles.itemPrice}>${item.price}</Text>
              <View style={[styles.badge, { backgroundColor: item.is_available ? '#EAFAF1' : '#FDECEA' }]}>
                <Text style={[styles.badgeText, { color: item.is_available ? '#27AE60' : '#E74C3C' }]}>
                  {item.is_available ? 'Available' : 'Unavailable'}
                </Text>
              </View>
              <View style={styles.itemActions}>
                <TouchableOpacity onPress={() => openEdit(item)}><Text style={styles.editText}>Edit</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => deleteItem(item.id)}><Text style={styles.deleteText}>Delete</Text></TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      />

      <Modal visible={modal} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>{editing ? 'Edit Item' : 'New Menu Item'}</Text>
          <TextInput style={styles.input} placeholder="Item name" value={form.name} onChangeText={v => setForm({...form, name: v})} />
          <TextInput style={styles.input} placeholder="Description" multiline value={form.description} onChangeText={v => setForm({...form, description: v})} />
          <TextInput style={styles.input} placeholder="Price" keyboardType="numeric" value={form.price} onChangeText={v => setForm({...form, price: v})} />
          <Text style={styles.label}>Category</Text>
          <View style={styles.catList}>
            {categories.map(c => (
              <TouchableOpacity key={c.id} style={[styles.catBtn, form.category_id === c.id && styles.catBtnActive]} onPress={() => setForm({...form, category_id: c.id})}>
                <Text style={[styles.catBtnText, form.category_id === c.id && styles.catBtnTextActive]}>{c.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.switchRow}>
            <Text style={styles.label}>Available on menu</Text>
            <Switch value={form.is_available} onValueChange={v => setForm({...form, is_available: v})} trackColor={{ true: '#27AE60' }} />
          </View>
          <TouchableOpacity style={styles.saveBtn} onPress={save}><Text style={styles.saveBtnText}>Save</Text></TouchableOpacity>
          <TouchableOpacity style={styles.cancelBtn} onPress={() => setModal(false)}><Text style={styles.cancelBtnText}>Cancel</Text></TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#F4F6F8' },
  header:          { backgroundColor: '#2980B9', padding: 20, paddingTop: 50, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerText:      { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  addBtn:          { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  addBtnText:      { color: '#fff', fontWeight: 'bold' },
  itemCard:        { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8, elevation: 1 },
  itemName:        { fontWeight: 'bold', fontSize: 15, color: '#333' },
  itemCat:         { color: '#2980B9', fontSize: 12, marginTop: 2 },
  itemDesc:        { color: '#888', fontSize: 12, marginTop: 2 },
  itemRight:       { alignItems: 'flex-end', gap: 4 },
  itemPrice:       { fontWeight: 'bold', fontSize: 16, color: '#333' },
  badge:           { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText:       { fontSize: 11, fontWeight: '600' },
  itemActions:     { flexDirection: 'row', gap: 10, marginTop: 4 },
  editText:        { color: '#2980B9', fontSize: 12 },
  deleteText:      { color: '#E74C3C', fontSize: 12 },
  modal:           { flex: 1, padding: 24, paddingTop: 50 },
  modalTitle:      { fontSize: 20, fontWeight: 'bold', marginBottom: 16 },
  input:           { borderWidth: 1, borderColor: '#DDD', borderRadius: 10, padding: 14, marginBottom: 12, fontSize: 15 },
  label:           { fontSize: 13, color: '#888', marginBottom: 6 },
  catList:         { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  catBtn:          { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#DDD' },
  catBtnActive:    { backgroundColor: '#2980B9', borderColor: '#2980B9' },
  catBtnText:      { color: '#888', fontSize: 13 },
  catBtnTextActive:{ color: '#fff', fontWeight: 'bold' },
  switchRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  saveBtn:         { backgroundColor: '#2980B9', padding: 16, borderRadius: 10, alignItems: 'center', marginTop: 6 },
  saveBtnText:     { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  cancelBtn:       { padding: 14, alignItems: 'center' },
  cancelBtnText:   { color: '#888' },
});

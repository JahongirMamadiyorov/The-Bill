import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Modal, ActivityIndicator,
  KeyboardAvoidingView, Platform, RefreshControl,
} from 'react-native';
import { inventoryAPI } from '../../api/client';
import { colors, spacing, radius, shadow, typography } from '../../utils/theme';
import ConfirmDialog from '../../components/ConfirmDialog';

function Field({ label, value, onChangeText, keyboardType = 'default', placeholder }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
      />
    </View>
  );
}

export default function AdminInventory() {
  const [items,      setItems]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter,     setFilter]     = useState('all');   // 'all' | 'low'
  const [modal,      setModal]      = useState(false);
  const [wasteModal, setWasteModal] = useState(false);
  const [editing,    setEditing]    = useState(null);
  const [dialog, setDialog] = useState(null);

  const emptyForm = { name: '', quantity: '', unit: '', min_quantity: '', cost_per_unit: '' };
  const [form, setForm] = useState(emptyForm);

  const [wasteForm, setWasteForm] = useState({ quantity: '', reason: '' });

  const load = useCallback(async () => {
    try {
      const res = await inventoryAPI.getAll();
      setItems(res.data || []);
    } catch (_) {}
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const displayed = filter === 'low'
    ? items.filter(i => Number(i.quantity) <= Number(i.min_quantity))
    : items;

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setModal(true);
  }
  function openEdit(item) {
    setEditing(item);
    setForm({
      name: item.name,
      quantity: String(item.quantity),
      unit: item.unit,
      min_quantity: String(item.min_quantity),
      cost_per_unit: String(item.cost_per_unit || ''),
    });
    setModal(true);
  }
  function openWaste(item) {
    setEditing(item);
    setWasteForm({ quantity: '', reason: '' });
    setWasteModal(true);
  }

  async function save() {
    if (!form.name || !form.quantity || !form.unit) {
      setDialog({ title: 'Required', message: 'Name, quantity, and unit are required.', type: 'warning' });
      return;
    }
    try {
      const payload = {
        name: form.name,
        quantity: parseFloat(form.quantity),
        unit: form.unit,
        min_quantity: parseFloat(form.min_quantity) || 0,
        cost_per_unit: parseFloat(form.cost_per_unit) || 0,
      };
      if (editing) {
        await inventoryAPI.update(editing.id, payload);
      } else {
        await inventoryAPI.create(payload);
      }
      setModal(false);
      load();
    } catch (e) {
      setDialog({ title: 'Error', message: e.response?.data?.message || 'Save failed', type: 'error' });
    }
  }

  async function recordWaste() {
    if (!wasteForm.quantity) return;
    try {
      await inventoryAPI.recordWaste(editing.id, {
        quantity: parseFloat(wasteForm.quantity),
        reason: wasteForm.reason,
      });
      setWasteModal(false);
      load();
    } catch (e) {
      setDialog({ title: 'Error', message: e.response?.data?.message || 'Failed to record waste', type: 'error' });
    }
  }

  async function deleteItem(id) {
    setDialog({
      title: 'Delete Ingredient',
      message: 'Remove this ingredient?',
      type: 'danger',
      confirmLabel: 'Delete',
      onConfirm: async () => {
        setDialog(null);
        try { await inventoryAPI.delete(id); load(); }
        catch (_) { setDialog({ title: 'Error', message: 'Delete failed', type: 'error' }); }
      },
    });
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={colors.admin} /></View>;
  }

  const lowCount = items.filter(i => Number(i.quantity) <= Number(i.min_quantity)).length;

  return (
    <View style={styles.container}>
      {/* Filter bar */}
      <View style={styles.filterBar}>
        <TouchableOpacity
          style={[styles.filterPill, filter === 'all' && styles.filterPillActive]}
          onPress={() => setFilter('all')}
        >
          <Text style={[styles.filterText, filter === 'all' && styles.filterTextActive]}>
            All ({items.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterPill, filter === 'low' && styles.filterPillLow]}
          onPress={() => setFilter('low')}
        >
          <Text style={[styles.filterText, filter === 'low' && styles.filterTextLow]}>
            Low Stock ({lowCount})
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.admin} />}
      >
        {displayed.map(item => {
          const isLow = Number(item.quantity) <= Number(item.min_quantity);
          return (
            <View key={item.id} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.cardLeft}>
                  <View style={[styles.statusBar, { backgroundColor: isLow ? colors.error : colors.success }]} />
                  <View>
                    <Text style={styles.itemName}>{item.name}</Text>
                    <Text style={[styles.itemQty, isLow && { color: colors.error }]}>
                      {item.quantity} {item.unit}
                      {isLow ? '  ·  LOW' : ''}
                    </Text>
                  </View>
                </View>
                <View style={styles.cardRight}>
                  {item.cost_per_unit ? (
                    <Text style={styles.itemCost}>${Number(item.cost_per_unit).toFixed(2)}/{item.unit}</Text>
                  ) : null}
                  <Text style={styles.minQty}>Min: {item.min_quantity} {item.unit}</Text>
                </View>
              </View>
              <View style={styles.cardActions}>
                <TouchableOpacity style={styles.actionBtn} onPress={() => openEdit(item)}>
                  <Text style={styles.actionBtnText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionBtn, styles.wasteBtn]} onPress={() => openWaste(item)}>
                  <Text style={[styles.actionBtnText, { color: colors.warning }]}>Waste</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionBtn, styles.delBtnInline]} onPress={() => deleteItem(item.id)}>
                  <Text style={[styles.actionBtnText, { color: colors.error }]}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
        <View style={{ height: 80 }} />
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={openNew}>
        <Text style={styles.fabText}>+ Add Ingredient</Text>
      </TouchableOpacity>

      {/* ─── Item Modal ─── */}
      <Modal visible={modal} animationType="slide" transparent>
        <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.sheet}>
            <Text style={styles.modalTitle}>{editing ? 'Edit Ingredient' : 'New Ingredient'}</Text>
            <ScrollView>
              <Field label="Name *"          value={form.name}          onChangeText={v => setForm(f => ({ ...f, name: v }))}          placeholder="e.g. Tomato" />
              <Field label="Quantity *"       value={form.quantity}      onChangeText={v => setForm(f => ({ ...f, quantity: v }))}      placeholder="0" keyboardType="decimal-pad" />
              <Field label="Unit *"           value={form.unit}          onChangeText={v => setForm(f => ({ ...f, unit: v }))}          placeholder="kg, litre, pcs..." />
              <Field label="Min Quantity"     value={form.min_quantity}  onChangeText={v => setForm(f => ({ ...f, min_quantity: v }))}  placeholder="Low-stock threshold" keyboardType="decimal-pad" />
              <Field label="Cost per Unit"    value={form.cost_per_unit} onChangeText={v => setForm(f => ({ ...f, cost_per_unit: v }))} placeholder="0.00" keyboardType="decimal-pad" />
            </ScrollView>
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.btnCancel} onPress={() => setModal(false)}>
                <Text style={styles.btnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnSave} onPress={save}>
                <Text style={styles.btnSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ─── Waste Modal ─── */}
      <Modal visible={wasteModal} animationType="slide" transparent>
        <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.sheet}>
            <Text style={styles.modalTitle}>Record Waste — {editing?.name}</Text>
            <Field label="Quantity *" value={wasteForm.quantity} onChangeText={v => setWasteForm(f => ({ ...f, quantity: v }))} keyboardType="decimal-pad" placeholder={`Amount in ${editing?.unit || 'unit'}`} />
            <Field label="Reason"     value={wasteForm.reason}   onChangeText={v => setWasteForm(f => ({ ...f, reason: v }))}   placeholder="Spoiled, dropped, etc." />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.btnCancel} onPress={() => setWasteModal(false)}>
                <Text style={styles.btnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnSave, { backgroundColor: colors.warning }]} onPress={recordWaste}>
                <Text style={styles.btnSaveText}>Record</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <ConfirmDialog dialog={dialog} onClose={() => setDialog(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center:    { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list:      { padding: spacing.md },

  filterBar: { flexDirection: 'row', backgroundColor: colors.white, padding: spacing.sm, gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  filterPill:       { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.full, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  filterPillActive: { backgroundColor: colors.admin, borderColor: colors.admin },
  filterPillLow:    { backgroundColor: colors.error, borderColor: colors.error },
  filterText:       { fontSize: typography.sm, color: colors.textMuted, fontWeight: '500' },
  filterTextActive: { color: colors.white },
  filterTextLow:    { color: colors.white },

  card:       { backgroundColor: colors.white, borderRadius: radius.md, marginBottom: spacing.sm, overflow: 'hidden', ...shadow.sm },
  cardTop:    { flexDirection: 'row', padding: spacing.md },
  cardLeft:   { flex: 1, flexDirection: 'row', gap: spacing.sm },
  statusBar:  { width: 4, borderRadius: 2, alignSelf: 'stretch' },
  itemName:   { fontSize: typography.sm, fontWeight: '700', color: colors.textDark },
  itemQty:    { fontSize: typography.xs, color: colors.textMuted, marginTop: 2, fontWeight: '600' },
  cardRight:  { alignItems: 'flex-end' },
  itemCost:   { fontSize: typography.xs, color: colors.textDark, fontWeight: '600' },
  minQty:     { fontSize: typography.xs, color: colors.textMuted, marginTop: 2 },
  cardActions:{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.border },
  actionBtn:       { flex: 1, paddingVertical: 10, alignItems: 'center', borderRightWidth: 1, borderRightColor: colors.border },
  actionBtnText:   { fontSize: typography.xs, fontWeight: '600', color: colors.admin },
  wasteBtn:        { },
  delBtnInline:    { borderRightWidth: 0 },

  fab:     { position: 'absolute', bottom: spacing.lg, right: spacing.lg, backgroundColor: colors.admin, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.full, ...shadow.md },
  fabText: { color: colors.white, fontWeight: '700', fontSize: typography.sm },

  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet:      { backgroundColor: colors.white, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, maxHeight: '85%' },
  modalTitle: { fontSize: typography.lg, fontWeight: '700', color: colors.textDark, marginBottom: spacing.md },
  modalBtns:  { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  btnCancel:  { flex: 1, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  btnCancelText: { color: colors.textMuted, fontWeight: '600' },
  btnSave:    { flex: 1, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.admin, alignItems: 'center' },
  btnSaveText: { color: colors.white, fontWeight: '700' },

  field:      { marginBottom: spacing.md },
  fieldLabel: { fontSize: typography.xs, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },
  input:      { backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.md, fontSize: typography.sm, color: colors.textDark, borderWidth: 1, borderColor: colors.border },
});

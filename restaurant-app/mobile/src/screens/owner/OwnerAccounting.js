import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, TextInput, Modal } from 'react-native';
import { accountingAPI } from '../../api/client';

export default function OwnerAccounting() {
  const [pnl, setPnl]           = useState(null);
  const [sales, setSales]       = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [tab, setTab]           = useState('pnl');
  const [modal, setModal]       = useState(false);
  const [form, setForm]         = useState({ category: '', description: '', amount: '', expense_date: new Date().toISOString().split('T')[0] });

  const loadData = async () => {
    try {
      const [pnlRes, salesRes, expRes] = await Promise.all([
        accountingAPI.getPnL(),
        accountingAPI.getSales({ period: 'daily' }),
        accountingAPI.getExpenses(),
      ]);
      setPnl(pnlRes.data);
      setSales(salesRes.data);
      setExpenses(expRes.data);
    } catch { Alert.alert('Error', 'Failed to load accounting data'); }
  };

  useEffect(() => { loadData(); }, []);

  const addExpense = async () => {
    if (!form.category || !form.amount) return Alert.alert('Error', 'Category and amount required');
    try {
      await accountingAPI.addExpense({ ...form, amount: parseFloat(form.amount) });
      setModal(false);
      setForm({ category: '', description: '', amount: '', expense_date: new Date().toISOString().split('T')[0] });
      loadData();
    } catch { Alert.alert('Error', 'Failed to add expense'); }
  };

  const fmt = (v) => `$${parseFloat(v || 0).toFixed(2)}`;
  const pnlColor = parseFloat(pnl?.profit || 0) >= 0 ? '#27AE60' : '#E74C3C';

  return (
    <View style={styles.container}>
      <View style={styles.header}><Text style={styles.headerText}>💰 Accounting</Text></View>
      <View style={styles.tabs}>
        {['pnl', 'sales', 'expenses'].map(t => (
          <TouchableOpacity key={t} style={[styles.tab, tab === t && styles.activeTab]} onPress={() => setTab(t)}>
            <Text style={[styles.tabText, tab === t && styles.activeTabText]}>{t === 'pnl' ? 'P&L' : t.charAt(0).toUpperCase() + t.slice(1)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.content}>
        {tab === 'pnl' && pnl && (
          <View>
            <Text style={styles.period}>{pnl.period.from} → {pnl.period.to}</Text>
            <View style={styles.pnlRow}>
              <View style={[styles.pnlCard, { borderLeftColor: '#27AE60' }]}>
                <Text style={styles.pnlLabel}>Revenue</Text>
                <Text style={styles.pnlValue}>{fmt(pnl.revenue)}</Text>
              </View>
              <View style={[styles.pnlCard, { borderLeftColor: '#E74C3C' }]}>
                <Text style={styles.pnlLabel}>Expenses</Text>
                <Text style={styles.pnlValue}>{fmt(pnl.expenses)}</Text>
              </View>
            </View>
            <View style={[styles.profitCard, { borderColor: pnlColor }]}>
              <Text style={styles.profitLabel}>Net Profit / Loss</Text>
              <Text style={[styles.profitValue, { color: pnlColor }]}>{fmt(pnl.profit)}</Text>
              <Text style={[styles.profitMargin, { color: pnlColor }]}>Margin: {pnl.margin}</Text>
            </View>
            <Text style={styles.subTitle}>Expenses by Category</Text>
            {pnl.expenses_by_category?.map((cat, i) => (
              <View key={i} style={styles.catRow}>
                <Text style={styles.catName}>{cat.category}</Text>
                <Text style={styles.catTotal}>{fmt(cat.total)}</Text>
              </View>
            ))}
          </View>
        )}

        {tab === 'sales' && (
          <View>
            {sales.map((s, i) => (
              <View key={i} style={styles.salesRow}>
                <Text style={styles.salesPeriod}>{s.period}</Text>
                <Text style={styles.salesOrders}>{s.order_count} orders</Text>
                <Text style={styles.salesRevenue}>{fmt(s.revenue)}</Text>
              </View>
            ))}
          </View>
        )}

        {tab === 'expenses' && (
          <View>
            <TouchableOpacity style={styles.addBtn} onPress={() => setModal(true)}>
              <Text style={styles.addBtnText}>+ Add Expense</Text>
            </TouchableOpacity>
            {expenses.map((e, i) => (
              <View key={i} style={styles.expenseRow}>
                <View>
                  <Text style={styles.expenseCat}>{e.category}</Text>
                  <Text style={styles.expenseDesc}>{e.description}</Text>
                  <Text style={styles.expenseDate}>{e.expense_date}</Text>
                </View>
                <Text style={styles.expenseAmount}>{fmt(e.amount)}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal visible={modal} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>Add Expense</Text>
          <TextInput style={styles.input} placeholder="Category (e.g. rent, salary)" value={form.category} onChangeText={v => setForm({...form, category: v})} />
          <TextInput style={styles.input} placeholder="Description" value={form.description} onChangeText={v => setForm({...form, description: v})} />
          <TextInput style={styles.input} placeholder="Amount" keyboardType="numeric" value={form.amount} onChangeText={v => setForm({...form, amount: v})} />
          <TextInput style={styles.input} placeholder="Date (YYYY-MM-DD)" value={form.expense_date} onChangeText={v => setForm({...form, expense_date: v})} />
          <TouchableOpacity style={styles.saveBtn} onPress={addExpense}><Text style={styles.saveBtnText}>Save</Text></TouchableOpacity>
          <TouchableOpacity style={styles.cancelBtn} onPress={() => setModal(false)}><Text style={styles.cancelBtnText}>Cancel</Text></TouchableOpacity>
        </View>
      </Modal>
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
  tabText:       { color: '#888', fontWeight: '600' },
  activeTabText: { color: '#E74C3C' },
  content:       { flex: 1, padding: 14 },
  period:        { textAlign: 'center', color: '#888', marginBottom: 12 },
  pnlRow:        { flexDirection: 'row', gap: 10, marginBottom: 12 },
  pnlCard:       { flex: 1, backgroundColor: '#fff', borderRadius: 10, padding: 14, borderLeftWidth: 4, elevation: 2 },
  pnlLabel:      { fontSize: 12, color: '#888' },
  pnlValue:      { fontSize: 20, fontWeight: 'bold', color: '#333', marginTop: 4 },
  profitCard:    { backgroundColor: '#fff', borderRadius: 10, padding: 18, borderWidth: 2, elevation: 2, alignItems: 'center', marginBottom: 14 },
  profitLabel:   { fontSize: 14, color: '#888' },
  profitValue:   { fontSize: 32, fontWeight: 'bold', marginTop: 4 },
  profitMargin:  { fontSize: 14, marginTop: 4 },
  subTitle:      { fontSize: 15, fontWeight: '700', color: '#333', marginVertical: 10 },
  catRow:        { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#fff', padding: 12, borderRadius: 8, marginBottom: 6, elevation: 1 },
  catName:       { color: '#333', textTransform: 'capitalize' },
  catTotal:      { fontWeight: 'bold', color: '#333' },
  salesRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', padding: 12, borderRadius: 8, marginBottom: 6, elevation: 1 },
  salesPeriod:   { color: '#555', flex: 1 },
  salesOrders:   { color: '#888', fontSize: 12 },
  salesRevenue:  { fontWeight: 'bold', color: '#27AE60' },
  addBtn:        { backgroundColor: '#E74C3C', padding: 14, borderRadius: 10, alignItems: 'center', marginBottom: 12 },
  addBtnText:    { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  expenseRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', padding: 14, borderRadius: 10, marginBottom: 8, elevation: 1 },
  expenseCat:    { fontWeight: 'bold', color: '#333', textTransform: 'capitalize' },
  expenseDesc:   { color: '#888', fontSize: 12 },
  expenseDate:   { color: '#aaa', fontSize: 11 },
  expenseAmount: { fontWeight: 'bold', color: '#E74C3C', fontSize: 16 },
  modal:         { flex: 1, padding: 24, paddingTop: 50 },
  modalTitle:    { fontSize: 22, fontWeight: 'bold', marginBottom: 20 },
  input:         { borderWidth: 1, borderColor: '#DDD', borderRadius: 10, padding: 14, marginBottom: 12, fontSize: 15 },
  saveBtn:       { backgroundColor: '#E74C3C', padding: 16, borderRadius: 10, alignItems: 'center', marginTop: 6 },
  saveBtnText:   { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  cancelBtn:     { padding: 16, alignItems: 'center', marginTop: 4 },
  cancelBtnText: { color: '#888', fontSize: 15 },
});

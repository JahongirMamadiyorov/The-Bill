import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, FlatList, TouchableOpacity, TextInput,
  StyleSheet, Modal, Alert, ActivityIndicator, Switch,
  KeyboardAvoidingView, Platform, RefreshControl, SafeAreaView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { usersAPI } from '../../api/client';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const ROLES = ['waitress', 'kitchen', 'admin', 'manager', 'cashier'];

const ROLE_COLORS = {
  waitress: { bg: '#e0f2fe', text: '#0369a1' },
  kitchen:  { bg: '#fff7ed', text: '#c2410c' },
  admin:    { bg: '#e0e7ff', text: '#4338ca' },
  manager:  { bg: '#dcfce7', text: '#15803d' },
  cashier:  { bg: '#f5f3ff', text: '#6d28d9' },
};
function roleColor(r) {
  return ROLE_COLORS[r] || { bg: '#f1f5f9', text: '#475569' };
}

const PERMISSIONS = [
  { key: 'can_create_orders',        label: 'Create orders' },
  { key: 'can_modify_orders',        label: 'Modify orders' },
  { key: 'can_cancel_orders',        label: 'Cancel orders' },
  { key: 'can_delete_order_items',   label: 'Delete items' },
  { key: 'can_add_free_items',       label: 'Add free items' },
  { key: 'can_apply_discounts',      label: 'Apply discounts' },
  { key: 'can_set_custom_price',     label: 'Custom price' },
  { key: 'can_process_payments',     label: 'Process payments' },
  { key: 'can_split_bills',          label: 'Split bills' },
  { key: 'can_issue_refunds',        label: 'Issue refunds' },
  { key: 'can_open_close_table',     label: 'Open/close tables' },
  { key: 'can_transfer_table',       label: 'Transfer tables' },
  { key: 'can_merge_tables',         label: 'Merge tables' },
  { key: 'can_see_other_tables',     label: 'See other tables' },
  { key: 'can_see_sales_numbers',    label: 'See sales numbers' },
  { key: 'can_see_customer_history', label: 'Customer history' },
];

// ─── SMALL HELPERS ────────────────────────────────────────────────────────────
function TInput({ value, onChangeText, placeholder, secureTextEntry, keyboardType }) {
  return (
    <TextInput
      style={S.input}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#94a3b8"
      secureTextEntry={secureTextEntry}
      keyboardType={keyboardType || 'default'}
      autoCapitalize="none"
      autoCorrect={false}
    />
  );
}

function SectionHeader({ emoji, title, color }) {
  return (
    <View style={[S.sectionHeader, { borderLeftColor: color }]}>
      <Text style={S.sectionHeaderTxt}>{emoji}  {title}</Text>
    </View>
  );
}

// ─── STAFF CARD ───────────────────────────────────────────────────────────────
function StaffCard({ user, onEdit, onDelete, onPerms }) {
  const rc = roleColor(user.role);
  return (
    <TouchableOpacity style={S.card} onPress={() => onEdit(user)} activeOpacity={0.85}>
      <View style={S.cardLeft}>
        <View style={[S.avatar, { backgroundColor: rc.bg }]}>
          <Text style={[S.avatarTxt, { color: rc.text }]}>
            {user.name?.charAt(0).toUpperCase() || '?'}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={S.userName}>{user.name}</Text>
          <Text style={S.userEmail} numberOfLines={1}>{user.email}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 3 }}>
            {user.phone ? <Text style={S.userMeta}>📞 {user.phone}</Text> : null}
            {user.shift_start && user.shift_end
              ? <Text style={S.userMeta}>🕐 {user.shift_start} – {user.shift_end}</Text>
              : null}
            {user.salary
              ? <Text style={S.userMeta}>💰 {Number(user.salary).toLocaleString()} so'm</Text>
              : null}
          </View>
        </View>
      </View>
      <View style={S.cardRight}>
        <View style={[S.rolePill, { backgroundColor: rc.bg }]}>
          <Text style={[S.roleTxt, { color: rc.text }]}>{user.role?.toUpperCase()}</Text>
        </View>
        <View style={S.cardBtns}>
          {user.role === 'waitress' && (
            <TouchableOpacity
              style={S.iconBtn}
              onPress={e => { e.stopPropagation?.(); onPerms(user); }}
            >
              <Text style={S.iconBtnTxt}>🔑</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[S.iconBtn, { backgroundColor: '#fee2e2' }]}
            onPress={e => { e.stopPropagation?.(); onDelete(user); }}
          >
            <Text style={S.iconBtnTxt}>🗑</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// FULL-SCREEN EDIT MODAL — two independent sections
// ═══════════════════════════════════════════════════════════════════════════════
function EditStaffScreen({ user, onClose, onSaved }) {
  const rc = roleColor(user.role);

  // — Info form state ─────────────────────────────────────
  const [infoForm, setInfoForm] = useState({
    name:        user.name        || '',
    role:        user.role        || 'waitress',
    phone:       user.phone       || '',
    salary:      user.salary      ? String(user.salary) : '',
    shift_start: user.shift_start || '',
    shift_end:   user.shift_end   || '',
  });
  const [infoSaving, setInfoSaving] = useState(false);
  const iof = (k, v) => setInfoForm(p => ({ ...p, [k]: v }));

  // — Login form state ────────────────────────────────────
  const [loginForm, setLoginForm] = useState({
    email:        user.email || '',
    new_password: '',
  });
  const [loginSaving, setLoginSaving] = useState(false);
  const lgf = (k, v) => setLoginForm(p => ({ ...p, [k]: v }));

  // — Save Info ───────────────────────────────────────────
  async function saveInfo() {
    if (!infoForm.name.trim()) return Alert.alert('Required', 'Name cannot be empty.');
    setInfoSaving(true);
    try {
      const payload = {
        name:        infoForm.name.trim(),
        role:        infoForm.role,
        phone:       infoForm.phone.trim()       || null,
        salary:      infoForm.salary             ? parseFloat(infoForm.salary) : null,
        shift_start: infoForm.shift_start.trim() || null,
        shift_end:   infoForm.shift_end.trim()   || null,
        is_active:   user.is_active              ?? true,
      };
      await usersAPI.update(user.id, payload);
      onSaved({ ...user, ...payload });
      Alert.alert('Saved ✓', 'Employee information updated.');
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Could not save information.');
    }
    setInfoSaving(false);
  }

  // — Save Login ──────────────────────────────────────────
  async function saveLogin() {
    if (!loginForm.email.trim()) return Alert.alert('Required', 'Email cannot be empty.');
    setLoginSaving(true);
    try {
      const payload = { email: loginForm.email.trim() };
      if (loginForm.new_password.trim()) payload.password = loginForm.new_password.trim();
      await usersAPI.updateCredentials(user.id, payload);
      onSaved({ ...user, email: payload.email });
      setLoginForm(p => ({ ...p, new_password: '' }));
      Alert.alert('Saved ✓', 'Login credentials updated.');
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Could not save credentials.');
    }
    setLoginSaving(false);
  }

  return (
    <Modal visible animationType="slide" statusBarTranslucent>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#f1f5f9' }}>
        {/* Header */}
        <View style={S.editHeader}>
          <TouchableOpacity onPress={onClose} style={S.backBtn}>
            <Text style={S.backBtnTxt}>← Back</Text>
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={S.editHeaderName}>{user.name}</Text>
            <View style={[S.rolePill, { backgroundColor: rc.bg, marginTop: 2 }]}>
              <Text style={[S.roleTxt, { color: rc.text }]}>{user.role?.toUpperCase()}</Text>
            </View>
          </View>
          <View style={{ width: 70 }} />
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
          >

            {/* ─────────────────────────────────────────────
                SECTION 1 — EMPLOYEE INFORMATION
            ───────────────────────────────────────────── */}
            <SectionHeader emoji="👤" title="Employee Information" color="#2980B9" />
            <View style={S.sectionBox}>

              <Text style={S.fieldLabel}>Full Name *</Text>
              <TInput
                value={infoForm.name}
                onChangeText={v => iof('name', v)}
                placeholder="Full name"
              />

              <Text style={[S.fieldLabel, { marginTop: 14 }]}>Role</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                style={{ marginBottom: 4 }}
              >
                <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 4 }}>
                  {ROLES.map(r => {
                    const c = roleColor(r);
                    const active = infoForm.role === r;
                    return (
                      <TouchableOpacity
                        key={r}
                        style={[S.roleChip, active && { backgroundColor: c.bg, borderColor: c.text }]}
                        onPress={() => iof('role', r)}
                      >
                        <Text style={[S.roleChipTxt, active && { color: c.text, fontWeight: '700' }]}>
                          {r.charAt(0).toUpperCase() + r.slice(1)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>

              <View style={{ flexDirection: 'row', gap: 12, marginTop: 14 }}>
                <View style={{ flex: 1 }}>
                  <Text style={S.fieldLabel}>Shift Start</Text>
                  <TInput
                    value={infoForm.shift_start}
                    onChangeText={v => iof('shift_start', v)}
                    placeholder="09:00"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={S.fieldLabel}>Shift End</Text>
                  <TInput
                    value={infoForm.shift_end}
                    onChangeText={v => iof('shift_end', v)}
                    placeholder="18:00"
                  />
                </View>
              </View>

              <Text style={[S.fieldLabel, { marginTop: 14 }]}>Phone Number</Text>
              <TInput
                value={infoForm.phone}
                onChangeText={v => iof('phone', v)}
                placeholder="+998 90 123 4567"
                keyboardType="phone-pad"
              />

              <Text style={[S.fieldLabel, { marginTop: 14 }]}>Monthly Salary (so'm)</Text>
              <TInput
                value={infoForm.salary}
                onChangeText={v => iof('salary', v)}
                placeholder="e.g. 3 000 000"
                keyboardType="decimal-pad"
              />

              <TouchableOpacity
                style={[S.saveBtn, { backgroundColor: '#2980B9' }]}
                onPress={saveInfo}
                disabled={infoSaving}
              >
                {infoSaving
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={S.saveBtnTxt}>Save Information</Text>}
              </TouchableOpacity>
            </View>

            {/* ─────────────────────────────────────────────
                SECTION 2 — LOGIN CREDENTIALS
            ───────────────────────────────────────────── */}
            <SectionHeader emoji="🔐" title="Login Credentials" color="#4f46e5" />
            <View style={S.sectionBox}>

              <View style={S.loginNote}>
                <Text style={S.loginNoteTxt}>
                  These details are used to sign in to the app. Leave Password blank to keep it unchanged.
                </Text>
              </View>

              <Text style={S.fieldLabel}>Email *</Text>
              <TInput
                value={loginForm.email}
                onChangeText={v => lgf('email', v)}
                placeholder="Email address"
                keyboardType="email-address"
              />

              <Text style={[S.fieldLabel, { marginTop: 14 }]}>New Password</Text>
              <TInput
                value={loginForm.new_password}
                onChangeText={v => lgf('new_password', v)}
                placeholder="Leave blank to keep current password"
                secureTextEntry
              />

              <TouchableOpacity
                style={[S.saveBtn, { backgroundColor: '#4f46e5' }]}
                onPress={saveLogin}
                disabled={loginSaving}
              >
                {loginSaving
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={S.saveBtnTxt}>Save Login</Text>}
              </TouchableOpacity>
            </View>

          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PERMISSIONS FULL-SCREEN MODAL
// ═══════════════════════════════════════════════════════════════════════════════
function PermissionsScreen({ user, onClose }) {
  const [perms,   setPerms]   = useState({});
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);

  React.useEffect(() => {
    usersAPI.getPermissions(user.id)
      .then(res => setPerms(res.data || {}))
      .catch(() => {
        const d = {};
        PERMISSIONS.forEach(p => { d[p.key] = false; });
        setPerms(d);
      })
      .finally(() => setLoading(false));
  }, [user.id]);

  async function save() {
    setSaving(true);
    try {
      await usersAPI.updatePermissions(user.id, perms);
      Alert.alert('Saved ✓', 'Permissions updated.');
      onClose();
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Could not save.');
    }
    setSaving(false);
  }

  return (
    <Modal visible animationType="slide" statusBarTranslucent>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#f1f5f9' }}>
        <View style={S.editHeader}>
          <TouchableOpacity onPress={onClose} style={S.backBtn}>
            <Text style={S.backBtnTxt}>← Back</Text>
          </TouchableOpacity>
          <Text style={[S.editHeaderName, { flex: 1, textAlign: 'center' }]}>
            🔑 Permissions — {user.name}
          </Text>
          <View style={{ width: 70 }} />
        </View>

        {loading
          ? <View style={S.center}><ActivityIndicator size="large" color="#2980B9" /></View>
          : (
            <>
              <View style={{ flexDirection: 'row', gap: 10, padding: 12 }}>
                <TouchableOpacity
                  style={[S.permActionBtn, { backgroundColor: '#ebf5fb' }]}
                  onPress={() => { const a = {}; PERMISSIONS.forEach(p => { a[p.key] = true; }); setPerms(a); }}
                >
                  <Text style={[S.permActionTxt, { color: '#2980B9' }]}>✅ Grant All</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[S.permActionBtn, { backgroundColor: '#fee2e2' }]}
                  onPress={() => { const a = {}; PERMISSIONS.forEach(p => { a[p.key] = false; }); setPerms(a); }}
                >
                  <Text style={[S.permActionTxt, { color: '#dc2626' }]}>🚫 Revoke All</Text>
                </TouchableOpacity>
              </View>
              <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
                {PERMISSIONS.map(perm => (
                  <View key={perm.key} style={S.permRow}>
                    <Text style={S.permLabel}>{perm.label}</Text>
                    <Switch
                      value={!!perms[perm.key]}
                      onValueChange={v => setPerms(p => ({ ...p, [perm.key]: v }))}
                      trackColor={{ false: '#e2e8f0', true: '#2980B9' }}
                      thumbColor="#fff"
                    />
                  </View>
                ))}
                <View style={{ padding: 16 }}>
                  <TouchableOpacity style={[S.saveBtn, { backgroundColor: '#2980B9' }]} onPress={save} disabled={saving}>
                    {saving
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={S.saveBtnTxt}>Save Permissions</Text>}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </>
          )}
      </SafeAreaView>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN SCREEN
// ═══════════════════════════════════════════════════════════════════════════════
export default function AdminStaff() {
  const [staff,      setStaff]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab,        setTab]        = useState('waitress');

  // Which staff member is open in each modal
  const [editingUser, setEditingUser] = useState(null);
  const [permsUser,   setPermsUser]   = useState(null);

  // Add waitress modal state
  const [addModal, setAddModal] = useState(false);
  const [addForm,  setAddForm]  = useState({ name: '', email: '', password: '' });
  const [adding,   setAdding]   = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await usersAPI.getAll();
      setStaff(res.data || []);
    } catch (_) {}
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const displayed = tab === 'waitress'
    ? staff.filter(u => u.role === 'waitress')
    : staff;

  const stats = {
    total:    staff.length,
    waitress: staff.filter(u => u.role === 'waitress').length,
    kitchen:  staff.filter(u => u.role === 'kitchen').length,
    admin:    staff.filter(u => u.role === 'admin').length,
  };

  async function addWaitress() {
    if (!addForm.name || !addForm.email || !addForm.password)
      return Alert.alert('Required', 'Name, email and password are all required.');
    setAdding(true);
    try {
      await usersAPI.create({ ...addForm, role: 'waitress' });
      setAddModal(false);
      setAddForm({ name: '', email: '', password: '' });
      load();
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Could not create staff member.');
    }
    setAdding(false);
  }

  function confirmDelete(user) {
    Alert.alert(
      'Remove Staff Member',
      `Are you sure you want to remove ${user.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: async () => {
            try {
              await usersAPI.delete(user.id);
              setStaff(prev => prev.filter(u => u.id !== user.id));
            } catch (_) {
              Alert.alert('Error', 'Could not remove staff member.');
            }
          },
        },
      ]
    );
  }

  // Called by EditStaffScreen when either section saves successfully
  function handleSaved(updatedUser) {
    setStaff(prev => prev.map(u => u.id === updatedUser.id ? updatedUser : u));
    // keep the edit screen open with fresh data so the user can continue editing
    setEditingUser(updatedUser);
  }

  if (loading) {
    return <View style={S.center}><ActivityIndicator size="large" color="#2980B9" /></View>;
  }

  return (
    <View style={S.container}>

      {/* Tab bar */}
      <View style={S.topBar}>
        {[['waitress', 'Waitresses'], ['all', 'All Staff']].map(([key, label]) => (
          <TouchableOpacity
            key={key}
            style={[S.topTab, tab === key && S.topTabActive]}
            onPress={() => setTab(key)}
          >
            <Text style={[S.topTabTxt, tab === key && S.topTabTxtActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Stats row */}
      <View style={S.statsRow}>
        {[
          { label: 'Waitress', count: stats.waitress, bg: '#e0f2fe', color: '#0369a1' },
          { label: 'Kitchen',  count: stats.kitchen,  bg: '#fff7ed', color: '#c2410c' },
          { label: 'Admin',    count: stats.admin,    bg: '#e0e7ff', color: '#4338ca' },
          { label: 'Total',    count: stats.total,    bg: '#f1f5f9', color: '#475569' },
        ].map(s => (
          <View key={s.label} style={[S.statPill, { backgroundColor: s.bg }]}>
            <Text style={[S.statNum, { color: s.color }]}>{s.count}</Text>
            <Text style={[S.statLbl, { color: s.color }]}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Staff list */}
      <FlatList
        data={displayed}
        keyExtractor={u => u.id}
        contentContainerStyle={S.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor="#2980B9"
          />
        }
        ListEmptyComponent={
          <View style={S.empty}>
            <Text style={S.emptyIcon}>👤</Text>
            <Text style={S.emptyTxt}>No staff in this category</Text>
          </View>
        }
        ListFooterComponent={<View style={{ height: 100 }} />}
        renderItem={({ item }) => (
          <StaffCard
            user={item}
            onEdit={setEditingUser}
            onDelete={confirmDelete}
            onPerms={setPermsUser}
          />
        )}
      />

      {/* FAB */}
      {tab === 'waitress' && (
        <TouchableOpacity
          style={S.fab}
          onPress={() => { setAddForm({ name: '', email: '', password: '' }); setAddModal(true); }}
        >
          <Text style={S.fabTxt}>+ Add Waitress</Text>
        </TouchableOpacity>
      )}

      {/* Add Waitress modal (keep as a small sheet) */}
      <Modal visible={addModal} animationType="slide" transparent statusBarTranslucent>
        <View style={S.overlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setAddModal(false)} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={S.sheet}>
              <View style={S.sheetHandle} />
              <View style={S.sheetHead}>
                <Text style={S.sheetTitle}>Add Waitress</Text>
                <TouchableOpacity onPress={() => setAddModal(false)} style={S.sheetX}>
                  <Text style={S.sheetXTxt}>✕</Text>
                </TouchableOpacity>
              </View>
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
                <Text style={S.fieldLabel}>Full Name *</Text>
                <TextInput style={[S.input, { marginBottom: 14 }]} value={addForm.name} onChangeText={v => setAddForm(p => ({ ...p, name: v }))} placeholder="Jane Smith" placeholderTextColor="#94a3b8" autoCorrect={false} />
                <Text style={S.fieldLabel}>Email *</Text>
                <TextInput style={[S.input, { marginBottom: 14 }]} value={addForm.email} onChangeText={v => setAddForm(p => ({ ...p, email: v }))} placeholder="jane@restaurant.com" placeholderTextColor="#94a3b8" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
                <Text style={S.fieldLabel}>Password *</Text>
                <TextInput style={[S.input, { marginBottom: 20 }]} value={addForm.password} onChangeText={v => setAddForm(p => ({ ...p, password: v }))} placeholder="Min 6 characters" placeholderTextColor="#94a3b8" secureTextEntry autoCapitalize="none" autoCorrect={false} />
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity style={S.btnCancel} onPress={() => setAddModal(false)}>
                    <Text style={S.btnCancelTxt}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[S.saveBtn, { flex: 1 }]} onPress={addWaitress} disabled={adding}>
                    {adding ? <ActivityIndicator color="#fff" size="small" /> : <Text style={S.saveBtnTxt}>Create</Text>}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Full-screen edit (two sections) */}
      {editingUser && (
        <EditStaffScreen
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSaved={handleSaved}
        />
      )}

      {/* Full-screen permissions */}
      {permsUser && (
        <PermissionsScreen
          user={permsUser}
          onClose={() => setPermsUser(null)}
        />
      )}

    </View>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  center:    { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list:      { padding: 16, paddingTop: 8 },

  topBar:          { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  topTab:          { flex: 1, paddingVertical: 14, alignItems: 'center' },
  topTabActive:    { borderBottomWidth: 2.5, borderBottomColor: '#2980B9' },
  topTabTxt:       { fontSize: 13, fontWeight: '600', color: '#94a3b8' },
  topTabTxtActive: { color: '#2980B9', fontWeight: '700' },

  statsRow: { flexDirection: 'row', gap: 8, padding: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  statPill: { flex: 1, borderRadius: 10, padding: 10, alignItems: 'center' },
  statNum:  { fontSize: 18, fontWeight: '900' },
  statLbl:  { fontSize: 10, fontWeight: '600', marginTop: 1 },

  card:      { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'flex-start', gap: 10, elevation: 1, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  cardLeft:  { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  avatar:    { width: 46, height: 46, borderRadius: 23, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  avatarTxt: { fontSize: 20, fontWeight: '900' },
  userName:  { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  userEmail: { fontSize: 11, color: '#94a3b8', marginTop: 1 },
  userMeta:  { fontSize: 11, color: '#64748b', fontWeight: '500' },
  cardRight: { alignItems: 'flex-end', gap: 8 },
  rolePill:  { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  roleTxt:   { fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
  cardBtns:  { flexDirection: 'row', gap: 6 },
  iconBtn:   { width: 32, height: 32, borderRadius: 8, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center' },
  iconBtnTxt:{ fontSize: 14 },

  empty:    { alignItems: 'center', paddingTop: 60 },
  emptyIcon:{ fontSize: 40, marginBottom: 10 },
  emptyTxt: { fontSize: 14, color: '#94a3b8', fontWeight: '500' },

  fab:    { position: 'absolute', bottom: 24, right: 20, backgroundColor: '#2980B9', paddingHorizontal: 22, paddingVertical: 14, borderRadius: 999, elevation: 4, shadowColor: '#2980B9', shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  fabTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },

  // Edit screen header
  editHeader: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  backBtn:    { paddingVertical: 6, paddingRight: 12, minWidth: 70 },
  backBtnTxt: { color: '#2980B9', fontWeight: '700', fontSize: 14 },
  editHeaderName: { fontSize: 15, fontWeight: '800', color: '#0f172a' },

  // Section headers
  sectionHeader:    { flexDirection: 'row', alignItems: 'center', borderLeftWidth: 4, paddingLeft: 10, marginBottom: 12, marginTop: 8 },
  sectionHeaderTxt: { fontSize: 15, fontWeight: '800', color: '#0f172a' },

  // Section box
  sectionBox: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 20, elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },

  fieldLabel: { fontSize: 10, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },
  input:      { backgroundColor: '#f8fafc', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', paddingHorizontal: 14, paddingVertical: 13, fontSize: 14, color: '#0f172a' },

  roleChip:    { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: '#f1f5f9', borderWidth: 1.5, borderColor: '#e2e8f0' },
  roleChipTxt: { fontSize: 13, fontWeight: '600', color: '#64748b' },

  loginNote:    { backgroundColor: '#eff6ff', borderRadius: 10, padding: 12, marginBottom: 14 },
  loginNoteTxt: { fontSize: 12, color: '#1d4ed8', lineHeight: 17 },

  saveBtn:    { marginTop: 18, padding: 15, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  saveBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },

  // Add sheet
  overlay:    { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet:      { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  sheetHandle:{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#e2e8f0', alignSelf: 'center', marginTop: 10 },
  sheetHead:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  sheetX:     { width: 30, height: 30, borderRadius: 15, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center' },
  sheetXTxt:  { fontSize: 13, color: '#64748b', fontWeight: '700' },

  btnCancel:    { flex: 1, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center', backgroundColor: '#f8fafc' },
  btnCancelTxt: { color: '#64748b', fontWeight: '600', fontSize: 14 },

  permActions:   { flexDirection: 'row', gap: 10, padding: 12 },
  permActionBtn: { flex: 1, padding: 10, borderRadius: 10, alignItems: 'center' },
  permActionTxt: { fontSize: 12, fontWeight: '700' },
  permRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, marginHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  permLabel:     { fontSize: 14, color: '#0f172a', fontWeight: '500', flex: 1 },
});

// ════════════════════════════════════════════════════════════════════════════
// WaitressProfile — profile + quick stats + account info + logout
// ════════════════════════════════════════════════════════════════════════════
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, RefreshControl,
  Modal, TextInput, KeyboardAvoidingView, Platform, StatusBar,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { ordersAPI, usersAPI, staffPaymentsAPI } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { colors, spacing, radius, shadow, topInset } from '../../utils/theme';
import ConfirmDialog from '../../components/ConfirmDialog';

const fmtMoney = (n) => Math.round(n || 0).toLocaleString('uz-UZ') + ' so\'m';

const isToday = (iso) => {
  if (!iso) return false;
  return new Date(iso).toDateString() === new Date().toDateString();
};

// ── Quick stat tile ───────────────────────────────────────────────────────────
function QuickStat({ icon, label, value, color = colors.primary, bg = colors.primaryLight }) {
  return (
    <View style={[styles.quickStat, { borderTopColor: color }]}>
      <View style={[styles.quickIcon, { backgroundColor: bg }]}>
        <MaterialIcons name={icon} size={18} color={color} />
      </View>
      <Text
        style={[styles.quickVal, { color }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.5}
      >
        {value}
      </Text>
      <Text style={styles.quickLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

// ── Role badge ────────────────────────────────────────────────────────────────
function RoleBadge({ role }) {
  const cfg = {
    waitress: { label: 'Waitress', color: '#059669', bg: '#D1FAE5' },
    admin:    { label: 'Admin',    color: '#2563EB', bg: '#DBEAFE' },
    owner:    { label: 'Owner',    color: '#7C3AED', bg: '#F5F3FF' },
    cashier:  { label: 'Cashier', color: '#D97706', bg: '#FEF3C7' },
    kitchen:  { label: 'Kitchen', color: '#EA580C', bg: '#FFEDD5' },
    bar:      { label: 'Bar',     color: '#7C3AED', bg: '#F5F3FF' },
  }[role?.toLowerCase()] || { label: role || 'Staff', color: colors.textMuted, bg: colors.background };
  return (
    <View style={{ backgroundColor: cfg.bg, paddingHorizontal: 12, paddingVertical: 4, borderRadius: radius.full }}>
      <Text style={{ color: cfg.color, fontWeight: '700', fontSize: 13 }}>{cfg.label}</Text>
    </View>
  );
}

// ── Phone formatter helpers ───────────────────────────────────────────────────
function formatWpPhone(raw) {
  const digits = raw.replace(/\D/g, '');
  const local = digits.startsWith('998') ? digits.slice(3) : digits;
  const d = local.slice(0, 9);
  let out = '+998';
  if (d.length > 0) out += ' ' + d.slice(0, 2);
  if (d.length > 2) out += ' ' + d.slice(2, 5);
  if (d.length > 5) out += ' ' + d.slice(5, 7);
  if (d.length > 7) out += ' ' + d.slice(7, 9);
  return out;
}
function wpLocalDisplay(stored) {
  const digits = (stored || '').replace(/\D/g, '');
  const local = digits.startsWith('998') ? digits.slice(3) : digits;
  const d = local.slice(0, 9);
  let out = '';
  if (d.length > 0) out += d.slice(0, 2);
  if (d.length > 2) out += ' ' + d.slice(2, 5);
  if (d.length > 5) out += ' ' + d.slice(5, 7);
  if (d.length > 7) out += ' ' + d.slice(7, 9);
  return out;
}

// ── Edit Profile modal ────────────────────────────────────────────────────────
function EditProfileModal({ visible, user, onClose, onSaved }) {
  const [name,  setName]  = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [dialog, setDialog] = useState(null);

  useEffect(() => {
    if (visible) {
      setName(user?.name  || '');
      setPhone(user?.phone || '');
    }
  }, [visible, user]);

  const save = async () => {
    if (!name.trim()) {
      setDialog({ title: 'Required', message: 'Name cannot be empty.', type: 'warning' });
      return;
    }
    setSaving(true);
    try {
      await usersAPI.update(user.id, { name: name.trim(), phone: phone.trim() });
      onSaved({ name: name.trim(), phone: phone.trim() });
      onClose();
    } catch (e) {
      setDialog({ title: 'Error', message: e?.response?.data?.error || 'Failed to update profile.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.editModal}>
          <View style={styles.editModalHeader}>
            <Text style={styles.editModalTitle}>Edit Profile</Text>
            <TouchableOpacity onPress={onClose}>
              <MaterialIcons name="close" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <Text style={styles.fieldLabel}>Full Name</Text>
          <TextInput
            style={styles.textInput}
            value={name}
            onChangeText={setName}
            placeholder="Your full name"
            placeholderTextColor={colors.textMuted}
          />

          <Text style={styles.fieldLabel}>Phone Number</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background, borderRadius: 10, borderWidth: 1.5, borderColor: colors.border, overflow: 'hidden', marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 13, backgroundColor: '#F1F5F9', borderRightWidth: 1, borderRightColor: '#E5E7EB', gap: 6 }}>
              <Text style={{ fontSize: 16 }}>🇺🇿</Text>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#374151' }}>+998</Text>
            </View>
            <TextInput
              style={{ flex: 1, paddingHorizontal: 12, paddingVertical: 13, fontSize: 15, color: colors.textDark }}
              value={wpLocalDisplay(phone)}
              onChangeText={raw => setPhone(formatWpPhone(raw))}
              placeholder="90 123 45 67"
              placeholderTextColor={colors.textMuted}
              keyboardType="phone-pad"
              maxLength={13}
            />
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={save}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator size="small" color={colors.white} />
              : <Text style={styles.saveBtnTxt}>Save Changes</Text>
            }
          </TouchableOpacity>

          <ConfirmDialog dialog={dialog} onClose={() => setDialog(null)} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN SCREEN
// ════════════════════════════════════════════════════════════════════════════
export default function WaitressProfile({ navigation }) {
  const { user: authUser, logout, updateUser } = useAuth();
  const [user, setUser] = useState(authUser);
  const [orders,      setOrders]      = useState([]);
  const [monthShifts, setMonthShifts] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editOpen,   setEditOpen]   = useState(false);
  const [dialog, setDialog] = useState(null);

  const load = useCallback(async () => {
    try {
      const now = new Date();
      const monthFrom = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
      const monthTo   = now.toISOString().split('T')[0];
      const [allRes, mineRes, payRes] = await Promise.all([
        ordersAPI.getAll(),
        ordersAPI.getMyOrders(),
        staffPaymentsAPI.getMine({ from: monthFrom, to: monthTo }),
      ]);
      const all  = Array.isArray(allRes.data)  ? allRes.data  : [];
      const mine = Array.isArray(mineRes.data) ? mineRes.data : [];
      const merged = [...all, ...mine.filter(o => !all.find(a => a.id === o.id))];
      setOrders(merged);
      setMonthShifts(Array.isArray(payRes.data) ? payRes.data : []);
    } catch { /* silent */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Keep local user in sync with auth context
  useEffect(() => { setUser(authUser); }, [authUser]);

  // ── Today's computed stats ──────────────────────────────────────────────
  const todayPaid   = orders.filter(o => o.status === 'paid' && isToday(o.created_at));
  const todayActive = orders.filter(o => !['paid', 'cancelled'].includes(o.status) && isToday(o.created_at));
  const tablesActive   = new Set(todayActive.map(o => o.table_id)).size;
  const ordersComplete = todayPaid.length;
  // Earned this month = sum of salary payments recorded by admin
  const monthEarned = monthShifts.reduce((s, p) => s + parseFloat(p.amount || 0), 0);

  const handleLogout = () => {
    setDialog({
      title: 'Sign Out',
      message: 'Are you sure you want to sign out?',
      type: 'danger',
      confirmLabel: 'Sign Out',
      onConfirm: () => {
        setDialog(null);
        logout();
      },
    });
  };

  const handleProfileSaved = (updates) => {
    const updated = { ...user, ...updates };
    setUser(updated);
    if (typeof updateUser === 'function') updateUser(updated);
  };

  const initials = (user?.name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : 'Unknown';

  const visibleEmail = user?.email && !user.email.endsWith('@staff.local') ? user.email : null;

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  return (
    <>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: 60 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={colors.primary}
          />
        }
      >
        {/* ── Profile header ─────────────────────────────────────────────── */}
        <View style={styles.profileHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarTxt}>{initials}</Text>
          </View>
          <Text style={styles.name}>{user?.name || 'Staff'}</Text>
          <RoleBadge role={user?.role} />
          {visibleEmail && <Text style={styles.email}>{visibleEmail}</Text>}
          <Text style={styles.date}>{today}</Text>
        </View>

        {/* ── Quick stats row ────────────────────────────────────────────── */}
        <View style={styles.quickRow}>
          <QuickStat icon="table-restaurant" label="Active Tables" value={tablesActive}   color="#D97706" bg="#FEF3C7" />
          <View style={styles.quickDivider} />
          <QuickStat icon="check-circle"     label="Completed"     value={ordersComplete} color="#16A34A" bg="#DCFCE7" />
          <View style={styles.quickDivider} />
          <QuickStat icon="payments"         label="Earned (month)" value={fmtMoney(monthEarned)} color={colors.primary} bg={colors.primaryLight} />
        </View>

        {/* ── View Full Performance button ───────────────────────────────── */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.perfBtn}
            onPress={() => navigation.navigate('Performance')}
            activeOpacity={0.85}
          >
            <MaterialIcons name="bar-chart" size={20} color={colors.white} style={{ marginRight: 8 }} />
            <Text style={styles.perfBtnTxt}>View Full Performance</Text>
            <MaterialIcons name="chevron-right" size={20} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        </View>

        {/* ── Account Info ───────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account Info</Text>
          <View style={styles.infoCard}>
            <InfoRow icon="person"      label="Full Name"    value={user?.name  || '—'} />
            <InfoRow icon="badge"       label="Username"     value={user?.username || user?.name || '—'} />
            {user?.phone && <InfoRow icon="phone" label="Phone" value={user.phone} />}
            <InfoRow icon="work"        label="Role"         value={user?.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : '—'} />
            <InfoRow icon="calendar-today" label="Member Since" value={memberSince} last />
          </View>

          <TouchableOpacity style={styles.editBtn} onPress={() => setEditOpen(true)} activeOpacity={0.85}>
            <MaterialIcons name="edit" size={16} color={colors.primary} style={{ marginRight: 6 }} />
            <Text style={styles.editBtnTxt}>Edit Profile</Text>
          </TouchableOpacity>
        </View>

        {/* ── Sign out ───────────────────────────────────────────────────── */}
        <View style={[styles.section, { marginTop: spacing.sm }]}>
          <TouchableOpacity onPress={handleLogout} style={styles.signOutBtn} activeOpacity={0.85}>
            <MaterialIcons name="logout" size={20} color="#DC2626" style={{ marginRight: 10 }} />
            <Text style={styles.signOutTxt}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        <Text style={{ textAlign: 'center', color: colors.textMuted, fontSize: 11, marginTop: spacing.xl }}>
          Restaurant App v1.0 · Waitress Panel
        </Text>
      </ScrollView>

      <EditProfileModal
        visible={editOpen}
        user={user}
        onClose={() => setEditOpen(false)}
        onSaved={handleProfileSaved}
      />

      <ConfirmDialog dialog={dialog} onClose={() => setDialog(null)} />
    </>
  );
}

// ── Info row helper ───────────────────────────────────────────────────────────
function InfoRow({ icon, label, value, last }) {
  return (
    <View style={[styles.infoRow, last && { borderBottomWidth: 0 }]}>
      <View style={styles.infoIcon}>
        <MaterialIcons name={icon} size={16} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoVal}>{value}</Text>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center:    { flex: 1, justifyContent: 'center', alignItems: 'center' },

  profileHeader: {
    backgroundColor: colors.primary,
    paddingTop: topInset + 16, paddingBottom: 36,
    alignItems: 'center', paddingHorizontal: spacing.xl,
  },
  avatar:    { width: 84, height: 84, borderRadius: 42, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg, borderWidth: 3, borderColor: 'rgba(255,255,255,0.5)' },
  avatarTxt: { fontSize: 32, fontWeight: '800', color: colors.white },
  name:      { fontSize: 22, fontWeight: '800', color: colors.white, marginBottom: spacing.sm },
  email:     { color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 6 },
  date:      { color: 'rgba(255,255,255,0.65)', fontSize: 12, marginTop: 8 },

  // Quick stats
  quickRow: {
    flexDirection: 'row', backgroundColor: colors.white,
    marginHorizontal: spacing.lg, marginTop: -18,
    borderRadius: radius.lg, ...shadow.card, overflow: 'hidden',
  },
  quickStat:    { flex: 1, alignItems: 'center', paddingVertical: spacing.lg, paddingTop: spacing.md, borderTopWidth: 3, paddingHorizontal: 4, overflow: 'hidden' },
  quickIcon:    { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  quickVal:     { fontSize: 18, fontWeight: '800', marginBottom: 2, width: '100%', textAlign: 'center' },
  quickLabel:   { fontSize: 10, color: colors.textMuted, fontWeight: '600', textAlign: 'center', width: '100%' },
  quickDivider: { width: 1, backgroundColor: colors.border, marginVertical: spacing.md },

  // Performance button
  section:  { marginHorizontal: spacing.lg, marginTop: spacing.lg },
  perfBtn:  { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primary, borderRadius: radius.lg, paddingVertical: 14, paddingHorizontal: spacing.lg, ...shadow.card },
  perfBtnTxt: { flex: 1, color: colors.white, fontWeight: '700', fontSize: 15 },

  // Section
  sectionTitle: { fontSize: 11, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: spacing.md },

  // Info card
  infoCard: { backgroundColor: colors.white, borderRadius: radius.lg, ...shadow.card, overflow: 'hidden', marginBottom: spacing.md },
  infoRow:  { flexDirection: 'row', alignItems: 'center', padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  infoIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md },
  infoLabel:{ fontSize: 11, color: colors.textMuted, fontWeight: '600', marginBottom: 2 },
  infoVal:  { fontSize: 14, fontWeight: '700', color: colors.textDark },

  // Edit button
  editBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white, borderRadius: radius.lg, paddingVertical: 12, borderWidth: 1.5, borderColor: colors.primary, ...shadow.card },
  editBtnTxt: { color: colors.primary, fontWeight: '700', fontSize: 14 },

  // Sign out
  signOutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white, borderRadius: radius.lg, paddingVertical: spacing.lg, borderWidth: 1.5, borderColor: '#FEE2E2', ...shadow.card },
  signOutTxt: { fontSize: 16, fontWeight: '700', color: '#DC2626' },

  // Edit Profile modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  editModal:    { backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.xl, paddingBottom: 40 },
  editModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xl },
  editModalTitle:  { fontSize: 18, fontWeight: '800', color: colors.textDark },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: colors.textMuted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  textInput:  { backgroundColor: colors.background, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: 15, color: colors.textDark, marginBottom: spacing.lg },
  saveBtn:    { backgroundColor: colors.primary, borderRadius: radius.lg, paddingVertical: 14, alignItems: 'center', marginTop: spacing.sm },
  saveBtnTxt: { color: colors.white, fontWeight: '700', fontSize: 15 },
});

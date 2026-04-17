import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, Modal,
  StyleSheet, Platform, StatusBar, ActivityIndicator, RefreshControl,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useAuth } from '../../context/AuthContext';
import { usersAPI } from '../../api/client';
import { colors, spacing, radius, shadow, typography, topInset } from '../../utils/theme';

// ─── Helpers ────────────────────────────────────────────────────────────────
function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch (_) { return '—'; }
}
function fmtDateTime(iso) {
  try {
    const d = new Date(iso);
    return (
      d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) +
      ' · ' +
      d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    );
  } catch (_) { return '—'; }
}

const AVATAR_COLORS = [
  '#2563eb', '#7c3aed', '#dc2626', '#059669',
  '#d97706', '#0891b2', '#db2777', '#0f172a',
];

// ─── SectionHeader ──────────────────────────────────────────────────────────
function SectionHeader({ title }) {
  return (
    <View style={S.secHead}>
      <Text style={S.secHeadText}>{title.toUpperCase()}</Text>
    </View>
  );
}

// ─── InfoRow ────────────────────────────────────────────────────────────────
function InfoRow({ iconBg, iconName, label, value, onPress, readOnly }) {
  return (
    <TouchableOpacity
      style={S.row}
      onPress={readOnly ? undefined : onPress}
      activeOpacity={readOnly ? 1 : 0.65}
      disabled={readOnly}
    >
      <View style={[S.iconBox, { backgroundColor: iconBg }]}>
        <MaterialIcons name={iconName} size={18} color="#64748b" />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={S.rowLbl}>{label}</Text>
        <Text style={S.rowVal} numberOfLines={1}>{value || '—'}</Text>
      </View>
      {!readOnly && <Text style={S.chev}>›</Text>}
    </TouchableOpacity>
  );
}

// ─── TapRow ─────────────────────────────────────────────────────────────────
function TapRow({ iconBg, iconName, label, sub, onPress }) {
  return (
    <TouchableOpacity style={S.row} onPress={onPress} activeOpacity={0.65}>
      <View style={[S.iconBox, { backgroundColor: iconBg }]}>
        <MaterialIcons name={iconName} size={18} color="#64748b" />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={S.rowVal} numberOfLines={1}>{label}</Text>
        {sub ? <Text style={S.rowLbl} numberOfLines={1}>{sub}</Text> : null}
      </View>
      <Text style={S.chev}>›</Text>
    </TouchableOpacity>
  );
}

// ─── BottomSheet ────────────────────────────────────────────────────────────
function BottomSheet({ visible, onClose, title, children }) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={{ flex: 1 }}>
        <TouchableOpacity style={S.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={S.sheet}>
          <View style={S.sheetHandle} />
          <View style={S.sheetHeader}>
            <Text style={S.sheetTitle}>{title}</Text>
            <TouchableOpacity style={S.sheetClose} onPress={onClose} activeOpacity={0.7}>
              <MaterialIcons name="close" size={14} color="#64748b" />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={S.sheetContent} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── PhoneField with +998 country code ──────────────────────────────────────
function PhoneField({ label = 'PHONE NUMBER', value, onChange }) {
  function handleChange(raw) {
    const digits = raw.replace(/\D/g, '');
    const local = digits.startsWith('998') ? digits.slice(3) : digits;
    const d = local.slice(0, 9);
    let out = '+998';
    if (d.length > 0) out += ' ' + d.slice(0, 2);
    if (d.length > 2) out += ' ' + d.slice(2, 5);
    if (d.length > 5) out += ' ' + d.slice(5, 7);
    if (d.length > 7) out += ' ' + d.slice(7, 9);
    onChange(out);
  }
  const displayLocal = (() => {
    const digits = (value || '').replace(/\D/g, '');
    const local = digits.startsWith('998') ? digits.slice(3) : digits;
    const d = local.slice(0, 9);
    let out = '';
    if (d.length > 0) out += d.slice(0, 2);
    if (d.length > 2) out += ' ' + d.slice(2, 5);
    if (d.length > 5) out += ' ' + d.slice(5, 7);
    if (d.length > 7) out += ' ' + d.slice(7, 9);
    return out;
  })();
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={S.fieldLabel}>{label.toUpperCase()}</Text>
      <View style={[S.input, { flexDirection: 'row', alignItems: 'center', padding: 0, overflow: 'hidden' }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 13, backgroundColor: '#F1F5F9', borderRightWidth: 1, borderRightColor: '#E2E8F0', gap: 6 }}>
          <Text style={{ fontSize: 16 }}>🇺🇿</Text>
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#374151' }}>+998</Text>
        </View>
        <TextInput
          style={{ flex: 1, paddingHorizontal: 12, paddingVertical: 13, fontSize: 15, color: '#0f172a' }}
          value={displayLocal}
          onChangeText={handleChange}
          placeholder="90 123 45 67"
          placeholderTextColor="#cbd5e1"
          keyboardType="phone-pad"
          maxLength={13}
        />
      </View>
    </View>
  );
}

// ─── Field ──────────────────────────────────────────────────────────────────
function Field({ label, value, onChange, secure, placeholder, keyboardType, editable = true }) {
  const [show, setShow] = useState(false);
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={S.fieldLabel}>{label.toUpperCase()}</Text>
      <View>
        <TextInput
          style={[S.input, secure && { paddingRight: 44 }, !editable && { backgroundColor: '#f1f5f9', color: '#94a3b8' }]}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor="#cbd5e1"
          secureTextEntry={secure && !show}
          keyboardType={keyboardType || 'default'}
          autoCorrect={false}
          autoCapitalize={secure ? 'none' : 'words'}
          editable={editable}
        />
        {secure ? (
          <TouchableOpacity style={S.showHide} onPress={() => setShow(s => !s)}>
            <MaterialIcons name={show ? 'visibility-off' : 'visibility'} size={18} color="#94a3b8" />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

// ─── SaveBtn ────────────────────────────────────────────────────────────────
function SaveBtn({ label = 'Save Changes', onPress, danger, loading }) {
  return (
    <TouchableOpacity
      style={[S.saveBtn, danger && { backgroundColor: '#dc2626' }, loading && { opacity: 0.7 }]}
      onPress={loading ? null : onPress}
      activeOpacity={0.8}
      disabled={loading}
    >
      {loading ? (
        <ActivityIndicator size="small" color="#fff" />
      ) : (
        <Text style={S.saveBtnTxt}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

// ─── ErrMsg ─────────────────────────────────────────────────────────────────
function ErrMsg({ msg }) {
  if (!msg) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
      <MaterialIcons name="warning" size={14} color="#dc2626" style={{ marginRight: 6 }} />
      <Text style={S.errMsg}>{msg}</Text>
    </View>
  );
}

// ─── Toast ──────────────────────────────────────────────────────────────────
function Toast({ msg, visible }) {
  if (!visible) return null;
  return (
    <View style={S.toast} pointerEvents="none">
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <MaterialIcons name="check-circle" size={14} color="#fff" style={{ marginRight: 6 }} />
        <Text style={S.toastTxt}>{msg}</Text>
      </View>
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════════════════
export default function AdminProfile() {
  const { user, logout, updateUser } = useAuth();

  // ── Loading / Refresh
  const [saving, setSaving] = useState(false);

  // ── Avatar color (device-specific)
  const [avatarColor, setAvatarColor] = useState(colors.admin);

  // ── Active sheet
  const [sheet, setSheet] = useState(null);

  // ── Forms
  const [editForm, setEditForm] = useState({ name: '', phone: '', email: '' });
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [pwError, setPwError] = useState('');

  // ── Toast
  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimer = useRef(null);

  function showToast(msg = 'Changes saved') {
    clearTimeout(toastTimer.current);
    setToastMsg(msg);
    setToastVisible(true);
    toastTimer.current = setTimeout(() => setToastVisible(false), 2200);
  }

  // Load avatar color + fresh profile from backend on mount
  React.useEffect(() => {
    (async () => {
      try {
        const c = await AsyncStorage.getItem('@admin_avatar_color');
        if (c) setAvatarColor(c);
      } catch (_) {}
      // Fetch fresh user data from backend so edits from the other platform are reflected
      try {
        const res = await usersAPI.getMe();
        const fresh = res?.data || res;
        if (fresh && fresh.id) await updateUser(fresh);
      } catch (_) { /* silently fall back to cached data */ }
    })();
  }, []);

  const openSheet = s => setSheet(s);
  const closeSheet = () => setSheet(null);

  // ── Profile handlers (API-connected) ──────────────────────────────────────
  function openEditProfile() {
    setEditForm({
      name: user?.name || '',
      phone: user?.phone || '',
      email: user?.email || '',
    });
    setPwError('');
    openSheet('editProfile');
  }

  async function saveProfile() {
    if (!editForm.name.trim()) return;
    try {
      setSaving(true);
      await usersAPI.update(user.id, {
        name: editForm.name,
        phone: editForm.phone,
      });
      await updateUser({ name: editForm.name, phone: editForm.phone });
      closeSheet();
      showToast('Profile updated');
    } catch (e) {
      setPwError(e?.response?.data?.error || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  }

  // ── Password handlers (API-connected) ─────────────────────────────────────
  function openChangePassword() {
    setPwForm({ current: '', next: '', confirm: '' });
    setPwError('');
    openSheet('changePassword');
  }

  async function savePassword() {
    setPwError('');
    if (pwForm.next.length < 6) return setPwError('New password must be at least 6 characters');
    if (pwForm.next !== pwForm.confirm) return setPwError('Passwords do not match');
    try {
      setSaving(true);
      await usersAPI.updateCredentials(user.id, {
        password: pwForm.next,
        confirm_password: pwForm.confirm,
      });
      setPwForm({ current: '', next: '', confirm: '' });
      closeSheet();
      showToast('Password changed');
    } catch (e) {
      setPwError(e?.response?.data?.error || 'Failed to change password');
    } finally {
      setSaving(false);
    }
  }

  function doSignOut() { closeSheet(); logout(); }

  const initials = (user?.name || 'AD')
    .split(' ')
    .map(w => w[0] || '')
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <View style={S.root}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>

        {/* ════ HEADER ════ */}
        <View style={S.header}>
          <View style={{ alignItems: 'center', paddingBottom: spacing.xl }}>
            <TouchableOpacity
              style={[S.avatar, { backgroundColor: avatarColor }]}
              onPress={() => openSheet('colorPicker')}
              activeOpacity={0.85}
            >
              <Text style={S.avatarTxt}>{initials}</Text>
              <View style={S.avatarCam}>
                <MaterialIcons name="photo-camera" size={11} color="#475569" />
              </View>
            </TouchableOpacity>
            <Text style={S.headerName}>{user?.name || 'Admin'}</Text>
            <View style={S.headerBadges}>
              <View style={S.adminBadge}>
                <Text style={S.adminBadgeTxt}>ADMIN</Text>
              </View>
              <View style={S.onlineWrap}>
                <View style={S.onlineDot} />
                <Text style={S.onlineTxt}>Online</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ════ PROFILE INFO ════ */}
        <SectionHeader title="Profile Info" />
        <View style={S.card}>
          <InfoRow iconName="person" iconBg="#eff6ff" label="Full Name" value={user?.name} onPress={openEditProfile} />
          <InfoRow iconName="phone" iconBg="#f0fdf4" label="Phone Number" value={user?.phone} onPress={openEditProfile} />
          <InfoRow iconName="email" iconBg="#fdf4ff" label="Email" value={user?.email} readOnly />
          <InfoRow iconName="military-tech" iconBg="#f8fafc" label="Role" value="Administrator" readOnly />
          <InfoRow iconName="calendar-today" iconBg="#f8fafc" label="Member Since" value={fmtDate(user?.created_at)} readOnly />
          <InfoRow iconName="schedule" iconBg="#f8fafc" label="Last Login" value={fmtDateTime(user?.last_login || new Date())} readOnly />
        </View>
        <TouchableOpacity style={S.editProfileBtn} onPress={openEditProfile} activeOpacity={0.8}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
            <MaterialIcons name="edit" size={16} color="#fff" style={{ marginRight: 6 }} />
            <Text style={S.editProfileBtnTxt}>Edit Profile</Text>
          </View>
        </TouchableOpacity>

        {/* ════ SECURITY ════ */}
        <SectionHeader title="Security" />
        <View style={S.card}>
          <TapRow iconName="lock" iconBg="#fff7ed" label="Change Password" sub="Update your login password" onPress={openChangePassword} />
        </View>

        {/* ════ SIGN OUT ════ */}
        <TouchableOpacity style={S.signOutBtn} onPress={() => openSheet('signOut')} activeOpacity={0.8}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
            <MaterialIcons name="logout" size={16} color="#dc2626" style={{ marginRight: 6 }} />
            <Text style={S.signOutTxt}>Sign Out</Text>
          </View>
        </TouchableOpacity>

      </ScrollView>

      {/* ════ BOTTOM SHEETS ════ */}

      {/* Edit Profile */}
      <BottomSheet visible={sheet === 'editProfile'} onClose={closeSheet} title="Edit Profile">
        <Field label="Full Name" value={editForm.name} onChange={v => setEditForm(f => ({ ...f, name: v }))} placeholder="Your full name" />
        <PhoneField value={editForm.phone} onChange={v => setEditForm(f => ({ ...f, phone: v }))} />
        <Field label="Email" value={editForm.email} editable={false} placeholder="Email (read-only)" />
        <ErrMsg msg={pwError} />
        <SaveBtn label="Save Profile" onPress={saveProfile} loading={saving} />
      </BottomSheet>

      {/* Change Password */}
      <BottomSheet visible={sheet === 'changePassword'} onClose={closeSheet} title="Change Password">
        <Field label="New Password" value={pwForm.next} onChange={v => setPwForm(f => ({ ...f, next: v }))} placeholder="Min 6 characters" secure />
        <Field label="Confirm Password" value={pwForm.confirm} onChange={v => setPwForm(f => ({ ...f, confirm: v }))} placeholder="Repeat new password" secure />
        <ErrMsg msg={pwError} />
        <SaveBtn label="Change Password" onPress={savePassword} loading={saving} />
      </BottomSheet>

      {/* Avatar Color Picker */}
      <BottomSheet visible={sheet === 'colorPicker'} onClose={closeSheet} title="Choose Avatar Color">
        <View style={S.colorGrid}>
          {AVATAR_COLORS.map(c => (
            <TouchableOpacity
              key={c}
              style={[S.colorCircle, { backgroundColor: c }, avatarColor === c && S.colorCircleActive]}
              onPress={async () => {
                setAvatarColor(c);
                closeSheet();
                showToast('Avatar updated');
                try { await AsyncStorage.setItem('@admin_avatar_color', c); } catch (_) {}
              }}
              activeOpacity={0.8}
            >
              {avatarColor === c ? <MaterialIcons name="check" size={20} color="#fff" /> : null}
            </TouchableOpacity>
          ))}
        </View>
        <Text style={S.colorHint}>Tap a color to apply</Text>
      </BottomSheet>

      {/* Sign Out Confirmation */}
      <BottomSheet visible={sheet === 'signOut'} onClose={closeSheet} title="Sign Out">
        <View style={{ alignItems: 'center', paddingVertical: 8 }}>
          <View style={S.signOutIcon}>
            <MaterialIcons name="logout" size={32} color="#dc2626" />
          </View>
          <Text style={S.signOutConfTitle}>Are you sure?</Text>
          <Text style={S.signOutConfSub}>You will be signed out of your admin account.</Text>
          <SaveBtn label="Sign Out" onPress={doSignOut} danger />
          <TouchableOpacity style={S.cancelBtn} onPress={closeSheet} activeOpacity={0.7}>
            <Text style={S.cancelBtnTxt}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </BottomSheet>

      <Toast msg={toastMsg} visible={toastVisible} />
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────
const S = StyleSheet.create({

  root: { flex: 1, backgroundColor: '#f1f5f9' },

  // ── Header
  header: {
    backgroundColor: '#1e3a8a',
    paddingTop: topInset,
  },
  avatar: {
    width: 84, height: 84, borderRadius: 42,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 12, borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.35)',
    ...shadow.md,
  },
  avatarTxt: { fontSize: 30, fontWeight: '900', color: '#fff' },
  avatarCam: {
    position: 'absolute', bottom: 0, right: 0,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#1e3a8a',
  },
  headerName: { fontSize: 22, fontWeight: '800', color: '#fff', textAlign: 'center' },
  headerBadges: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 10 },
  adminBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10, paddingVertical: 3,
    borderRadius: 20,
  },
  adminBadgeTxt: { fontSize: 11, fontWeight: '800', color: '#fff', letterSpacing: 1 },
  onlineWrap: { flexDirection: 'row', alignItems: 'center' },
  onlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#4ade80', marginRight: 4 },
  onlineTxt: { fontSize: 12, color: '#93c5fd' },

  // ── Section header
  secHead: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 6 },
  secHeadText: { fontSize: 11, fontWeight: '800', color: '#94a3b8', letterSpacing: 1.2 },

  // ── Card
  card: {
    marginHorizontal: 12,
    backgroundColor: '#fff',
    borderRadius: radius.lg,
    ...shadow.sm,
    overflow: 'hidden',
  },

  // ── Row
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  iconBox: {
    width: 34, height: 34, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 12,
  },
  rowLbl: { fontSize: 10, fontWeight: '700', color: '#94a3b8', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 2 },
  rowVal: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  chev: { fontSize: 22, color: '#cbd5e1', fontWeight: '300' },

  // ── Edit Profile button
  editProfileBtn: {
    marginHorizontal: 12, marginTop: 10,
    backgroundColor: colors.admin,
    borderRadius: radius.lg,
    paddingVertical: 12,
    alignItems: 'center',
    ...shadow.sm,
  },
  editProfileBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // ── Sign-out
  signOutBtn: {
    marginHorizontal: 12, marginTop: 20,
    borderWidth: 1.5, borderColor: '#fca5a5',
    borderRadius: radius.lg,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  signOutTxt: { color: '#dc2626', fontWeight: '700', fontSize: 14 },
  signOutIcon: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: '#fee2e2',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },
  signOutConfTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a', marginBottom: 4 },
  signOutConfSub: { fontSize: 13, color: '#64748b', textAlign: 'center', marginBottom: 20 },
  cancelBtn: { marginTop: 10, paddingVertical: 10 },
  cancelBtnTxt: { fontSize: 14, fontWeight: '600', color: '#64748b' },

  // ── BottomSheet
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
  },
  sheetHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: '#d1d5db',
    alignSelf: 'center', marginTop: 10, marginBottom: 2,
  },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  sheetTitle: { fontSize: 17, fontWeight: '800', color: '#0f172a' },
  sheetClose: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#f1f5f9',
    alignItems: 'center', justifyContent: 'center',
  },
  sheetContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },

  // ── Form fields
  fieldLabel: { fontSize: 10, fontWeight: '800', color: '#64748b', letterSpacing: 0.8, marginBottom: 6 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1, borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 15, color: '#0f172a',
  },
  showHide: {
    position: 'absolute', right: 12, top: 0, bottom: 0,
    justifyContent: 'center',
  },

  // ── Save button
  saveBtn: {
    backgroundColor: colors.admin,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
    ...shadow.sm,
  },
  saveBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },

  // ── Misc
  errMsg: { color: '#dc2626', fontSize: 12, fontWeight: '600' },

  // ── Color picker
  colorGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    justifyContent: 'center', gap: 14,
    paddingVertical: 8,
  },
  colorCircle: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
  },
  colorCircleActive: { borderWidth: 3, borderColor: '#fff', ...shadow.md },
  colorHint: { textAlign: 'center', fontSize: 12, color: '#94a3b8', marginTop: 10 },

  // ── Toast
  toast: {
    position: 'absolute', bottom: 30,
    left: 0, right: 0, alignItems: 'center',
    zIndex: 999,
  },
  toastTxt: { fontSize: 13, fontWeight: '700', color: '#fff' },
});

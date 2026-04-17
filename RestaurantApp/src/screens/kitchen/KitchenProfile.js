/**
 * KitchenProfile.js — Profile screen for kitchen staff
 * Shows: name, role, station, account info.
 * Light theme matching admin/cashier panels.
 */

import React from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, StatusBar, Platform,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useAuth } from '../../context/AuthContext';
import { topInset } from '../../utils/theme';

// ─── Design tokens (matches light theme) ─────────────────────────────────────
const C = {
  bg:          '#F9FAFB',
  card:        '#FFFFFF',
  border:      '#E5E7EB',
  primary:     '#2563EB',
  primaryLight:'#EFF6FF',
  success:     '#16A34A',
  successLight:'#F0FDF4',
  warning:     '#D97706',
  warningLight:'#FFFBEB',
  danger:      '#DC2626',
  dangerLight: '#FEF2F2',
  textDark:    '#111827',
  textMid:     '#374151',
  textMuted:   '#6B7280',
  white:       '#FFFFFF',
};

const STATION_STYLES = {
  salad:   { bg: '#F0FDF4', text: '#16A34A', icon: 'eco',                    label: 'Salad' },
  grill:   { bg: '#FFF7ED', text: '#EA580C', icon: 'outdoor-grill',          label: 'Grill' },
  bar:     { bg: '#EFF6FF', text: '#2563EB', icon: 'local-bar',              label: 'Bar' },
  pastry:  { bg: '#FDF4FF', text: '#A21CAF', icon: 'cake',                   label: 'Pastry' },
  cold:    { bg: '#ECFEFF', text: '#0891B2', icon: 'ac-unit',                label: 'Cold' },
  hot:     { bg: '#FEF2F2', text: '#DC2626', icon: 'local-fire-department',  label: 'Hot' },
  default: { bg: '#F3F4F6', text: '#6B7280', icon: 'restaurant',             label: 'General' },
};

function getStationStyle(station) {
  if (!station) return null;
  const key = station.toLowerCase();
  return STATION_STYLES[key] || { ...STATION_STYLES.default, label: station };
}

function ROLE_LABEL(role) {
  switch (role) {
    case 'kitchen':  return 'Kitchen Staff';
    case 'admin':    return 'Administrator';
    case 'owner':    return 'Owner';
    default:         return role ? role.charAt(0).toUpperCase() + role.slice(1) : 'Staff';
  }
}

// Avatar with initials
function Avatar({ name, size = 80 }) {
  const initials = (name || 'K')
    .split(' ')
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase();
  return (
    <View style={[avStyle.wrap, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[avStyle.txt, { fontSize: size * 0.36 }]}>{initials}</Text>
    </View>
  );
}
const avStyle = StyleSheet.create({
  wrap: { backgroundColor: C.primary, justifyContent: 'center', alignItems: 'center' },
  txt:  { color: C.white, fontWeight: '800' },
});

// Row item
function InfoRow({ icon, iconBg, label, value }) {
  return (
    <View style={st.infoRow}>
      <View style={[st.infoIcon, { backgroundColor: iconBg || C.primaryLight }]}>
        <MaterialIcons name={icon} size={18} color={iconBg ? C.white : C.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={st.infoLabel}>{label}</Text>
        <Text style={st.infoValue}>{value || '—'}</Text>
      </View>
    </View>
  );
}

export default function KitchenProfile({ navigation }) {
  const { user, logout } = useAuth();
  const stationSt = getStationStyle(user?.kitchen_station);

  return (
    <View style={st.container}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />

      {/* Header */}
      <View style={st.header}>
        <TouchableOpacity style={st.backBtn} onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={20} color={C.textDark} />
        </TouchableOpacity>
        <Text style={st.headerTitle}>My Profile</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={st.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Avatar + name card */}
        <View style={st.avatarCard}>
          <Avatar name={user?.name} size={80} />
          <Text style={st.userName}>{user?.name || 'Kitchen Staff'}</Text>
          <Text style={st.userRole}>{ROLE_LABEL(user?.role)}</Text>

          {/* Station badge */}
          {user?.kitchen_station ? (
            <View style={[st.stationBadge, { backgroundColor: stationSt?.bg || '#F3F4F6' }]}>
              <MaterialIcons
                name={stationSt?.icon || 'restaurant'}
                size={16}
                color={stationSt?.text || C.textMuted}
              />
              <Text style={[st.stationBadgeTxt, { color: stationSt?.text || C.textMuted }]}>
                {stationSt?.label || user.kitchen_station} Station
              </Text>
            </View>
          ) : (
            <View style={[st.stationBadge, { backgroundColor: C.primaryLight }]}>
              <MaterialIcons name="restaurant" size={16} color={C.primary} />
              <Text style={[st.stationBadgeTxt, { color: C.primary }]}>All Stations</Text>
            </View>
          )}
        </View>

        {/* Account details */}
        <View style={st.section}>
          <Text style={st.sectionTitle}>ACCOUNT DETAILS</Text>
          <View style={st.card}>
            <InfoRow
              icon="person"
              iconBg={null}
              label="Full name"
              value={user?.name}
            />
            <View style={st.rowDivider} />
            <InfoRow
              icon="email"
              iconBg={null}
              label="Email"
              value={user?.email}
            />
            {user?.phone ? (
              <>
                <View style={st.rowDivider} />
                <InfoRow
                  icon="phone"
                  iconBg={null}
                  label="Phone"
                  value={user.phone}
                />
              </>
            ) : null}
          </View>
        </View>

        {/* Station info */}
        <View style={st.section}>
          <Text style={st.sectionTitle}>KITCHEN STATION</Text>
          <View style={st.card}>
            {user?.kitchen_station ? (
              <View style={st.stationDetailRow}>
                <View style={[st.stationIconBig, { backgroundColor: stationSt?.bg || '#F3F4F6' }]}>
                  <MaterialIcons
                    name={stationSt?.icon || 'restaurant'}
                    size={28}
                    color={stationSt?.text || C.textMuted}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={st.stationName}>
                    {stationSt?.label || user.kitchen_station}
                  </Text>
                  <Text style={st.stationDesc}>
                    You only see orders relevant to your station.
                    Items assigned to other stations are hidden.
                  </Text>
                </View>
              </View>
            ) : (
              <View style={st.stationDetailRow}>
                <View style={[st.stationIconBig, { backgroundColor: C.primaryLight }]}>
                  <MaterialIcons name="restaurant" size={28} color={C.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={st.stationName}>All Stations</Text>
                  <Text style={st.stationDesc}>
                    You see all incoming orders regardless of station.
                    Contact your admin to assign a specific station.
                  </Text>
                </View>
              </View>
            )}
          </View>
        </View>

        {/* Logout */}
        <View style={st.section}>
          <TouchableOpacity style={st.logoutBtn} onPress={logout} activeOpacity={0.8}>
            <MaterialIcons name="logout" size={20} color={C.danger} />
            <Text style={st.logoutTxt}>Log Out</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  container:      { flex: 1, backgroundColor: C.bg },

  header:         {
    paddingTop: topInset + 12,
    paddingBottom: 12, paddingHorizontal: 16,
    backgroundColor: C.card,
    flexDirection: 'row', alignItems: 'center',
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  backBtn:        {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: C.bg, borderWidth: 1, borderColor: C.border,
    justifyContent: 'center', alignItems: 'center',
  },
  headerTitle:    { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: C.textDark },

  scrollContent:  { padding: 16, paddingBottom: 40 },

  avatarCard:     {
    backgroundColor: C.card, borderRadius: 16,
    padding: 24, alignItems: 'center', marginBottom: 16,
    borderWidth: 1, borderColor: C.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  userName:       { fontSize: 22, fontWeight: '800', color: C.textDark, marginTop: 14, marginBottom: 4 },
  userRole:       { fontSize: 14, color: C.textMuted, marginBottom: 12 },
  stationBadge:   {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
  },
  stationBadgeTxt:{ fontSize: 13, fontWeight: '700' },

  section:        { marginBottom: 16 },
  sectionTitle:   {
    fontSize: 11, fontWeight: '700', color: C.textMuted,
    letterSpacing: 0.8, marginBottom: 8, paddingLeft: 4,
  },
  card:           {
    backgroundColor: C.card, borderRadius: 14,
    borderWidth: 1, borderColor: C.border, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  infoRow:        { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  infoIcon:       { width: 38, height: 38, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  infoLabel:      { fontSize: 11, color: C.textMuted, fontWeight: '600', marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
  infoValue:      { fontSize: 15, fontWeight: '600', color: C.textDark },
  rowDivider:     { height: 1, backgroundColor: C.border, marginLeft: 68 },

  stationDetailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, padding: 16 },
  stationIconBig: {
    width: 56, height: 56, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center',
  },
  stationName:    { fontSize: 17, fontWeight: '800', color: C.textDark, marginBottom: 6 },
  stationDesc:    { fontSize: 13, color: C.textMuted, lineHeight: 19 },

  logoutBtn:      {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 16, backgroundColor: C.dangerLight,
    borderRadius: 14, borderWidth: 1, borderColor: C.danger + '40',
  },
  logoutTxt:      { fontSize: 16, fontWeight: '700', color: C.danger },
});

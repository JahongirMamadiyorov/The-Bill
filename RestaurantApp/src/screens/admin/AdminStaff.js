import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  Modal, StyleSheet, Platform, KeyboardAvoidingView, ActivityIndicator, StatusBar, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { usersAPI, shiftsAPI, staffPaymentsAPI, menuAPI } from '../../api/client';
import { topInset } from '../../utils/theme';
import { useTranslation } from '../../context/LanguageContext';
import ConfirmDialog from '../../components/ConfirmDialog';
import TimePicker from '../../components/TimePicker';

// ══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════════════════════
const ROLES = ['Waitress', 'Kitchen', 'Cashier', 'Cleaner'];
const SALARY_TYPES = ['Hourly', 'Daily', 'Weekly', 'Monthly'];
const PAY_METHODS = ['Cash', 'Bank Transfer', 'Card'];

const ROLE_COLORS = {
  Waitress: { bg: '#DBEAFE', text: '#1E40AF' },
  Kitchen: { bg: '#FFEDD5', text: '#9A3412' },
  Cashier: { bg: '#DCFCE7', text: '#166534' },
  Cleaner: { bg: '#F1F5F9', text: '#475569' },
};

// ── Display-label helpers (keep internal IDs; translate display text only) ──
function roleLabel(role, t) {
  if (!t) return role;
  const map = {
    Waitress: 'roles.waitress',
    Kitchen: 'roles.kitchen',
    Cashier: 'roles.cashier',
    Cleaner: 'roles.cleaner',
    Admin: 'roles.admin',
    Owner: 'roles.owner',
  };
  const key = map[role];
  return key ? t(key, role) : role;
}

function salaryTypeLabel(type, t) {
  if (!t) return type;
  const map = {
    Hourly: 'admin.staff.salaryTypes.hourly',
    Daily: 'admin.staff.salaryTypes.daily',
    Weekly: 'admin.staff.salaryTypes.weekly',
    Monthly: 'admin.staff.salaryTypes.monthly',
  };
  const key = map[type];
  return key ? t(key, type) : type;
}

function payMethodLabel(method, t) {
  if (!t) return method;
  const map = {
    'Cash': 'admin.staff.paymentMethodsList.cash',
    'Bank Transfer': 'admin.staff.paymentMethodsList.bankTransfer',
    'Card': 'admin.staff.paymentMethodsList.card',
  };
  const key = map[method];
  return key ? t(key, method) : method;
}

const C = {
  primary: '#2563EB',
  primaryLight: '#EFF6FF',
  success: '#16A34A',
  successLight: '#F0FDF4',
  warning: '#D97706',
  warningLight: '#FFFBEB',
  danger: '#DC2626',
  dangerLight: '#FEF2F2',
  neutralDark: '#111827',
  neutralMid: '#6B7280',
  neutralLight: '#F9FAFB',
  card: '#FFFFFF',
  border: '#E5E7EB',
  bg: '#FFFFFF',
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_HDRS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

// ══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════════
const today = new Date();

const fmtDate = (d) => {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${yyyy}-${mm}-${dd}`;
};

const TODAY_STR = fmtDate(today);

const fmtMoney = (n) =>
  isNaN(Number(n)) ? "0 so'm" : `${Math.round(Number(n)).toLocaleString('ru-RU')} so'm`;

const nowTime = () => {
  const n = new Date();
  return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
};

const minutesBetween = (a, b) => {
  if (!a || !b) return 0;
  const [ah, am] = a.split(':').map(Number);
  const [bh, bm] = b.split(':').map(Number);
  return (bh * 60 + bm) - (ah * 60 + am);
};

const getMonday = (d) => {
  const date = new Date(d);
  date.setDate(date.getDate() - (date.getDay() + 6) % 7);
  return date;
};

// Returns the date string for the day immediately after dateStr (YYYY-MM-DD)
const nextDay = (dateStr) => {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  return fmtDate(d);
};

// Single source of truth for today's date string — always call fresh, never cache
const getToday = () => fmtDate(new Date());

// Format a Date object → HH:MM string
const formatTime = (d) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

// Format minutes → "Xh Ym" display string
const fmtDuration = (totalMins) => {
  if (!totalMins || totalMins <= 0) return '0m';
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
};

// ══════════════════════════════════════════════════════════════════════════════
// API DATA NORMALIZERS
// ══════════════════════════════════════════════════════════════════════════════

// Map a users-API row → UI staff object
const normalizeUser = (u) => ({
  id: String(u.id),
  name: u.name || '',
  email: u.email || '',
  phone: u.phone || '',
  // API role is lowercase ('waitress') → capitalize for UI ('Waitress')
  role: u.role ? u.role.charAt(0).toUpperCase() + u.role.slice(1) : 'Staff',
  shiftStart: u.shift_start || '09:00',
  shiftEnd: u.shift_end || '18:00',
  // Read salary_type from DB (stored lowercase: 'monthly', 'daily', 'weekly', 'hourly')
  // Capitalize for UI. Fall back to 'Monthly' only if column is missing (old DB rows).
  salaryType: u.salary_type
    ? u.salary_type.charAt(0).toUpperCase() + u.salary_type.slice(1)
    : 'Monthly',
  rate: parseFloat(u.salary) || 0,
  status: u.is_active ? 'Active' : 'Suspended',
});

// Map a shifts-API row → UI attendance record
const normalizeShift = (s) => {
  const clockInDt = s.clock_in ? new Date(s.clock_in) : null;
  const clockOutDt = s.clock_out ? new Date(s.clock_out) : null;

  // Prefer explicit shift_date; fall back to clock_in date; fall back to today
  const dateStr = s.shift_date
    ? String(s.shift_date).split('T')[0]
    : clockInDt ? fmtDate(clockInDt) : TODAY_STR;

  const toHHMM = (dt) => dt
    ? `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`
    : null;

  // Calculate late minutes when status is 'late'
  let lateMin = 0;
  if (s.status === 'late' && s.scheduled_start_time && clockInDt) {
    const scheduled = new Date(s.scheduled_start_time);
    lateMin = Math.max(0, Math.round((clockInDt - scheduled) / 60000));
  }

  // Map API statuses → UI statuses
  let uiStatus = 'Present';
  if (s.status === 'late') uiStatus = 'Late';
  if (s.status === 'absent') uiStatus = 'Absent';
  if (s.status === 'excused') uiStatus = 'Excused';

  return {
    id: String(s.id),
    staffId: String(s.user_id),
    date: dateStr,
    status: uiStatus,
    clockIn: toHHMM(clockInDt),
    clockOut: toHHMM(clockOutDt),
    lateMin,
    hoursWorked: parseFloat(s.hours_worked) || 0,
    note: s.note || null,
  };
};

// ══════════════════════════════════════════════════════════════════════════════
// PAYROLL CALCULATOR
// ══════════════════════════════════════════════════════════════════════════════

// Config defaults (no DB config table yet → use these)
const WORKING_DAYS_PER_WEEK = 6;   // Mon–Sat
// Late penalty removed — no longer applied

// Count Mon–Sat (working) days in the calendar month that contains dateStr
const workingDaysInMonth = (dateStr) => {
  const d = new Date(dateStr);
  const year = d.getFullYear();
  const month = d.getMonth();
  const daysInMon = new Date(year, month + 1, 0).getDate();
  let count = 0;
  for (let day = 1; day <= daysInMon; day++) {
    if (new Date(year, month, day).getDay() !== 0) count++; // skip Sunday only
  }
  return count; // typically 26–27
};

// Count Mon–Sat (working) days in a date range (same logic as website)
const workingDaysInRange = (from, to) => {
  let count = 0;
  const d = new Date(from + 'T00:00:00');
  const end = new Date(to + 'T00:00:00');
  while (d <= end) {
    if (d.getDay() !== 0) count++; // 0 = Sunday
    d.setDate(d.getDate() + 1);
  }
  return count || 1;
};

// For monthly salary spanning multiple months, calculate gross pay per-month then sum.
// Each month: (monthly salary / working days in that month) × days worked in that month.
const monthlyGrossForRecords = (salary, records) => {
  // Group present/late records by YYYY-MM
  const byMonth = {};
  records.forEach(r => {
    const ym = (r.date || '').slice(0, 7); // "YYYY-MM"
    if (ym) byMonth[ym] = (byMonth[ym] || 0) + 1;
  });
  let total = 0;
  for (const ym of Object.keys(byMonth)) {
    const wDays = workingDaysInMonth(ym + '-01');
    total += (salary / wDays) * byMonth[ym];
  }
  return total;
};

const calcPayroll = (member, attendance, from, to, config = {}) => {
  const _workingDaysPerWeek = config.workingDaysPerWeek ?? WORKING_DAYS_PER_WEEK;

  // All attendance records for this member in the selected period.
  // Use string comparison (YYYY-MM-DD) to avoid timezone issues with Date objects.
  const recs = attendance.filter(r => {
    if (r.staffId !== member.id) return false;
    return r.date >= from && r.date <= to;
  });

  // Split by status — keep present and late separate for display
  const onlyPresentRecs = recs.filter(r => r.status === 'Present');
  const lateRecs = recs.filter(r => r.status === 'Late');
  const absentRecs = recs.filter(r => r.status === 'Absent');
  const excusedRecs = recs.filter(r => r.status === 'Excused');

  // "Worked" records = present + late (both count toward salary)
  const workedRecs = recs.filter(r => r.status === 'Present' || r.status === 'Late');

  // Total hours: use stored hoursWorked field (same source as website).
  // Fall back to clock-in/out computation only when hoursWorked is unavailable.
  let totalHours = 0;
  for (const r of workedRecs) {
    if (r.hoursWorked > 0) {
      totalHours += r.hoursWorked;
    } else {
      const mins = minutesBetween(r.clockIn, r.clockOut);
      if (mins > 0) totalHours += mins / 60;
    }
  }
  totalHours = Math.round(totalHours * 10) / 10;

  const presentDays = onlyPresentRecs.length;  // on-time only (for display)
  const lateDays = lateRecs.length;
  const absentDays = absentRecs.length;
  const excusedDays = excusedRecs.length;
  const daysWorked = workedRecs.length;         // present + late (for salary calc)

  // ── Salary type calculations ──────────────────────────────────────────────
  let base = 0;
  let dailyRate = 0;
  let workingDays = 0; // used for Weekly/Monthly breakdown display

  switch (member.salaryType) {
    case 'Hourly':
      // Pay = hourly rate × total hours worked
      base = member.rate * totalHours;
      break;

    case 'Daily':
      // Pay = daily rate × days worked (present + late)
      dailyRate = member.rate;
      base = member.rate * daysWorked;
      break;

    case 'Weekly':
      // Pay = (weekly salary ÷ working days/week) × days worked
      workingDays = _workingDaysPerWeek;
      dailyRate = member.rate / workingDays;
      base = dailyRate * daysWorked;
      break;

    case 'Monthly':
      // For multi-month ranges (debt carry-over), calculate per-month then sum.
      // Each month: (monthly salary / working days in that month) × days worked.
      workingDays = workingDaysInMonth(to); // for display — shows the current month's working days
      base = monthlyGrossForRecords(member.rate, workedRecs);
      dailyRate = workingDays > 0 ? member.rate / workingDays : 0;
      break;

    default:
      base = 0;
  }

  const net = Math.max(0, base);

  return {
    presentDays,
    absentDays,
    excusedDays,
    lateDays,
    daysWorked,
    totalHours,
    dailyRate: Math.round(dailyRate * 10) / 10,
    workingDays,
    base: Math.round(base),
    penalty: 0,
    net: Math.round(net),
    records: recs,
  };
};

// ══════════════════════════════════════════════════════════════════════════════
// BASE UI COMPONENTS
// ══════════════════════════════════════════════════════════════════════════════
function RoleBadge({ role, small }) {
  const { t } = useTranslation();
  const c = ROLE_COLORS[role] || { bg: '#F1F5F9', text: '#475569' };
  return (
    <View style={{ backgroundColor: c.bg, borderRadius: 6, paddingHorizontal: small ? 6 : 8, paddingVertical: small ? 2 : 4 }}>
      <Text style={{ color: c.text, fontSize: small ? 10 : 12, fontWeight: '700' }}>{roleLabel(role, t)}</Text>
    </View>
  );
}

function Divider({ mt = 0, mb = 0 }) {
  return <View style={{ height: 1, backgroundColor: C.border, marginTop: mt, marginBottom: mb }} />;
}

function Field({ label, value, onChange, placeholder, keyType, secure, disabled }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={st.label}>{label}</Text>
      <TextInput
        style={[st.input, disabled && { backgroundColor: '#F1F5F9', color: C.textMuted }]}
        value={value} onChangeText={onChange}
        placeholder={placeholder || ''} placeholderTextColor={C.textMuted}
        keyboardType={keyType || 'default'} secureTextEntry={!!secure} editable={!disabled}
      />
    </View>
  );
}

// ─── PHONE FIELD with +998 country code prefix ────────────────────────────────
function PhoneField({ label = 'Phone *', value, onChange }) {
  // Strip everything to just the local 9 digits, then reformat on display
  function handleChange(raw) {
    // Accept full formatted string → extract only digits after +998
    const digits = raw.replace(/\D/g, '');
    // If they typed with 998 prefix, strip it; otherwise use as local
    const local = digits.startsWith('998') ? digits.slice(3) : digits;
    const d = local.slice(0, 9);
    // Build formatted: +998 XX XXX XX XX
    let out = '+998';
    if (d.length > 0) out += ' ' + d.slice(0, 2);
    if (d.length > 2) out += ' ' + d.slice(2, 5);
    if (d.length > 5) out += ' ' + d.slice(5, 7);
    if (d.length > 7) out += ' ' + d.slice(7, 9);
    onChange(out);
  }

  // Derive display value from stored value
  function displayValue(stored) {
    if (!stored) return '';
    const digits = stored.replace(/\D/g, '');
    const local = digits.startsWith('998') ? digits.slice(3) : digits;
    const d = local.slice(0, 9);
    let out = '+998';
    if (d.length > 0) out += ' ' + d.slice(0, 2);
    if (d.length > 2) out += ' ' + d.slice(2, 5);
    if (d.length > 5) out += ' ' + d.slice(5, 7);
    if (d.length > 7) out += ' ' + d.slice(7, 9);
    return out;
  }

  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={st.label}>{label}</Text>
      <View style={[st.input, { flexDirection: 'row', alignItems: 'center', padding: 0, overflow: 'hidden' }]}>
        {/* Country code badge */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12, backgroundColor: '#F1F5F9', borderRightWidth: 1, borderRightColor: '#E5E7EB', gap: 6 }}>
          <Text style={{ fontSize: 16 }}>🇺🇿</Text>
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#374151' }}>+998</Text>
        </View>
        {/* Number input — only the local part */}
        <TextInput
          style={{ flex: 1, paddingHorizontal: 12, paddingVertical: 12, fontSize: 14, color: '#111827' }}
          value={(() => {
            const digits = (value || '').replace(/\D/g, '');
            const local = digits.startsWith('998') ? digits.slice(3) : digits;
            const d = local.slice(0, 9);
            let out = '';
            if (d.length > 0) out += d.slice(0, 2);
            if (d.length > 2) out += ' ' + d.slice(2, 5);
            if (d.length > 5) out += ' ' + d.slice(5, 7);
            if (d.length > 7) out += ' ' + d.slice(7, 9);
            return out;
          })()}
          onChangeText={handleChange}
          placeholder="90 123 45 67"
          placeholderTextColor={C.textMuted}
          keyboardType="phone-pad"
          maxLength={13}
        />
      </View>
    </View>
  );
}

// ─── PASSWORD FIELD with show/hide toggle ─────────────────────────────────────
function PasswordField({ label = 'Password', value, onChange, placeholder = 'Set login password' }) {
  const [show, setShow] = useState(false);
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={st.label}>{label}</Text>
      <View style={[st.input, { flexDirection: 'row', alignItems: 'center', padding: 0, overflow: 'hidden' }]}>
        <TextInput
          style={{ flex: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: '#111827' }}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={C.textMuted}
          secureTextEntry={!show}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TouchableOpacity onPress={() => setShow(s => !s)} style={{ paddingHorizontal: 12, paddingVertical: 12 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <MaterialIcons name={show ? 'visibility-off' : 'visibility'} size={20} color={show ? C.primary : C.textMuted} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── SINGLE DATE CALENDAR PICKER ─────────────────────────────────────────────
const AS_MONTHS  = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const AS_DAYS    = ['Su','Mo','Tu','We','Th','Fr','Sa'];
function DatePickerModalAS({ visible, onClose, onSelect, value }) {
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  useEffect(() => {
    if (visible) {
      const d = value ? new Date(value + 'T00:00:00') : now;
      if (!isNaN(d)) { setViewYear(d.getFullYear()); setViewMonth(d.getMonth()); }
    }
  }, [visible]);
  const prevMonth = () => { if (viewMonth===0){setViewYear(y=>y-1);setViewMonth(11);}else setViewMonth(m=>m-1); };
  const nextMonth = () => { if (viewMonth===11){setViewYear(y=>y+1);setViewMonth(0);}else setViewMonth(m=>m+1); };
  function selectDay(day) {
    const m = String(viewMonth+1).padStart(2,'0'), d = String(day).padStart(2,'0');
    onSelect(`${viewYear}-${m}-${d}`); onClose();
  }
  const daysInMonth = new Date(viewYear, viewMonth+1, 0).getDate();
  const firstDay    = new Date(viewYear, viewMonth, 1).getDay();
  const cells = [...Array(firstDay).fill(null), ...Array.from({length:daysInMonth},(_,i)=>i+1)];
  while (cells.length%7!==0) cells.push(null);
  const selParts = value ? value.split('-').map(Number) : null;
  const isSelected = d => d && selParts && selParts[0]===viewYear && selParts[1]===viewMonth+1 && selParts[2]===d;
  const isToday    = d => d && now.getFullYear()===viewYear && now.getMonth()===viewMonth && now.getDate()===d;
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.45)', justifyContent:'center', padding:24 }}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={{ backgroundColor:'#fff', borderRadius:20, padding:18, shadowColor:'#000', shadowOffset:{width:0,height:8}, shadowOpacity:0.15, shadowRadius:20, elevation:12 }}>
          <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
            <TouchableOpacity onPress={prevMonth} style={{ width:36, height:36, borderRadius:10, backgroundColor:'#F9FAFB', justifyContent:'center', alignItems:'center' }}>
              <MaterialIcons name="chevron-left" size={22} color="#111827" />
            </TouchableOpacity>
            <Text style={{ fontSize:16, fontWeight:'800', color:'#111827' }}>{AS_MONTHS[viewMonth]} {viewYear}</Text>
            <TouchableOpacity onPress={nextMonth} style={{ width:36, height:36, borderRadius:10, backgroundColor:'#F9FAFB', justifyContent:'center', alignItems:'center' }}>
              <MaterialIcons name="chevron-right" size={22} color="#111827" />
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection:'row', marginBottom:6 }}>
            {AS_DAYS.map(d=><Text key={d} style={{ flex:1, textAlign:'center', fontSize:11, fontWeight:'700', color:'#6B7280' }}>{d}</Text>)}
          </View>
          <View style={{ flexDirection:'row', flexWrap:'wrap' }}>
            {cells.map((day,idx)=>(
              <TouchableOpacity
                key={idx}
                style={{ width:`${100/7}%`, aspectRatio:1, justifyContent:'center', alignItems:'center', borderRadius:100,
                  backgroundColor: isSelected(day)?C.primary: isToday(day)?'#EFF6FF':'transparent' }}
                onPress={()=>day&&selectDay(day)} disabled={!day} activeOpacity={day?0.7:1}
              >
                {day ? <Text style={{ fontSize:13, fontWeight:isSelected(day)||isToday(day)?'800':'500',
                  color: isSelected(day)?'#fff': isToday(day)?C.primary:'#111827' }}>{day}</Text> : null}
              </TouchableOpacity>
            ))}
          </View>
          <View style={{ flexDirection:'row', gap:8, marginTop:14 }}>
            <TouchableOpacity style={{ flex:1, paddingVertical:10, borderRadius:10, borderWidth:1, borderColor:'#E5E7EB', alignItems:'center' }} onPress={onClose}>
              <Text style={{ fontSize:13, fontWeight:'700', color:'#6B7280' }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ flex:1, paddingVertical:10, borderRadius:10, backgroundColor:C.primary, alignItems:'center' }} onPress={()=>{ const m=String(now.getMonth()+1).padStart(2,'0'); const d=String(now.getDate()).padStart(2,'0'); onSelect(`${now.getFullYear()}-${m}-${d}`); onClose(); }}>
              <Text style={{ fontSize:13, fontWeight:'700', color:'#fff' }}>Today</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function DateFieldAS({ label, value, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ marginBottom: 14 }}>
      {label && <Text style={st.label}>{label}</Text>}
      <TouchableOpacity
        style={[st.input, { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingVertical:12 }]}
        onPress={() => setOpen(true)} activeOpacity={0.75}
      >
        <Text style={{ fontSize:14, color: value ? '#111827' : C.textMuted, flex:1 }}>
          {value || 'Tap to pick date'}
        </Text>
        {value
          ? <TouchableOpacity onPress={() => onChange('')} hitSlop={{top:8,bottom:8,left:8,right:8}}>
              <MaterialIcons name="close" size={16} color="#6B7280" />
            </TouchableOpacity>
          : <MaterialIcons name="calendar-today" size={16} color={C.primary} />
        }
      </TouchableOpacity>
      <DatePickerModalAS visible={open} onClose={()=>setOpen(false)} onSelect={onChange} value={value} />
    </View>
  );
}

function ChipRow({ label, options, selected, onSelect }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={st.label}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 4 }}>
        {options.map((opt, i) => (
          <TouchableOpacity
            key={opt} onPress={() => onSelect(opt)}
            style={[st.chip, selected === opt && st.chipOn, i < options.length - 1 && { marginRight: 8 }]}
          >
            <Text style={[st.chipTxt, selected === opt && st.chipTxtOn]}>{opt}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

function FullModal({ visible, onClose, title, children }) {
  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
        <View style={st.modalHeader}>
          <TouchableOpacity onPress={onClose} style={{ width: 70 }}>
            <Text style={{ fontSize: 15, color: C.primary, fontWeight: '700' }}>← Back</Text>
          </TouchableOpacity>
          <Text style={st.modalTitle}>{title}</Text>
          <View style={{ width: 70 }} />
        </View>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          {children}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// CALENDAR DATE PICKER
// ══════════════════════════════════════════════════════════════════════════════
function CalendarPicker({ visible, onClose, period, onChange, singleDay = false }) {
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [tempFrom, setTempFrom] = useState(period.from);
  const [tempTo, setTempTo] = useState(period.to);
  const [step, setStep] = useState('from');

  React.useEffect(() => {
    if (visible) {
      setTempFrom(period.from);
      setTempTo(period.to);
      setStep('from');
      const d = new Date(period.from);
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
    }
  }, [visible]);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const handleDay = (ds) => {
    if (singleDay) {
      // Single-day mode: tap a date and immediately apply
      onChange({ from: ds, to: ds });
      onClose();
      return;
    }
    if (step === 'from') {
      setTempFrom(ds); setTempTo(ds); setStep('to');
    } else {
      if (ds < tempFrom) { setTempTo(tempFrom); setTempFrom(ds); }
      else setTempTo(ds);
      setStep('from');
    }
  };

  const setPreset = (from, to) => {
    setTempFrom(from); setTempTo(to); setStep('from');
    const d = new Date(from);
    setViewYear(d.getFullYear()); setViewMonth(d.getMonth());
  };

  // Build grid cells for current view month
  const firstDow = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7; // Mon=0
  const daysInMon = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMon; d++) {
    cells.push(fmtDate(new Date(viewYear, viewMonth, d)));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const presets = [
    { label: 'Today', from: TODAY_STR, to: TODAY_STR },
    { label: 'This Week', from: fmtDate(getMonday(today)), to: TODAY_STR },
    { label: 'This Month', from: fmtDate(new Date(today.getFullYear(), today.getMonth(), 1)), to: TODAY_STR },
    { label: 'Last Month', from: fmtDate(new Date(today.getFullYear(), today.getMonth() - 1, 1)), to: fmtDate(new Date(today.getFullYear(), today.getMonth(), 0)) },
  ];

  const applyLabel = tempFrom === tempTo ? tempFrom : `${tempFrom} → ${tempTo}`;
  const selectedDay = singleDay ? tempFrom : null;

  return (
    <FullModal visible={visible} onClose={onClose} title={<View style={{ flexDirection: 'row', alignItems: 'center' }}><MaterialIcons name="calendar-today" size={20} color={C.primary} style={{ marginRight: 6 }} /><Text>{singleDay ? 'Select Date' : 'Select Period'}</Text></View>}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>

        {/* FROM / TO pills — only for range mode */}
        {!singleDay && (
          <View style={{ flexDirection: 'row', marginBottom: 12 }}>
            <TouchableOpacity
              onPress={() => setStep('from')}
              style={[st.periodPill, step === 'from' && st.periodPillActive]}
            >
              <Text style={{ fontSize: 10, color: C.textMuted, fontWeight: '700', marginBottom: 2 }}>FROM</Text>
              <Text style={{ fontSize: 14, fontWeight: '800', color: C.textDark }}>{tempFrom}</Text>
            </TouchableOpacity>
            <View style={{ width: 24, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: C.textMuted, fontSize: 18 }}>→</Text>
            </View>
            <TouchableOpacity
              onPress={() => setStep('to')}
              style={[st.periodPill, step === 'to' && st.periodPillActive]}
            >
              <Text style={{ fontSize: 10, color: C.textMuted, fontWeight: '700', marginBottom: 2 }}>TO</Text>
              <Text style={{ fontSize: 14, fontWeight: '800', color: C.textDark }}>{tempTo}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Selected date display — only for single-day mode */}
        {singleDay && (
          <View style={{ alignItems: 'center', marginBottom: 14 }}>
            <Text style={{ fontSize: 12, color: C.textMuted, marginBottom: 4 }}>Tap a date to select</Text>
          </View>
        )}

        {/* Hint — only for range mode */}
        {!singleDay && (
          <Text style={{ textAlign: 'center', color: C.textMuted, fontSize: 12, marginBottom: 14 }}>
            {step === 'from' ? <View style={{ flexDirection: 'row', alignItems: 'center' }}><MaterialIcons name='circle' size={6} color={C.textMuted} style={{ marginRight: 4 }} /><Text>Tap a date to set start</Text></View> : <View style={{ flexDirection: 'row', alignItems: 'center' }}><MaterialIcons name='circle' size={6} color={C.textMuted} style={{ marginRight: 4 }} /><Text>Tap a date to set end</Text></View>}
          </Text>
        )}

        {/* Month nav */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <TouchableOpacity onPress={prevMonth} style={st.arrowBtn}>
            <Text style={{ fontSize: 24, color: C.primary, fontWeight: '700', lineHeight: 28 }}>‹</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 17, fontWeight: '800', color: C.textDark }}>
            {MONTH_NAMES[viewMonth]} {viewYear}
          </Text>
          <TouchableOpacity onPress={nextMonth} style={st.arrowBtn}>
            <Text style={{ fontSize: 24, color: C.primary, fontWeight: '700', lineHeight: 28 }}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Day-of-week headers */}
        <View style={{ flexDirection: 'row', marginBottom: 4 }}>
          {DAY_HDRS.map(d => (
            <View key={d} style={{ flex: 1, alignItems: 'center', paddingVertical: 4 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: C.textMuted }}>{d}</Text>
            </View>
          ))}
        </View>

        {/* Calendar grid */}
        {weeks.map((week, wi) => (
          <View key={wi} style={{ flexDirection: 'row' }}>
            {week.map((ds, di) => {
              if (!ds) return <View key={`e${di}`} style={{ flex: 1, aspectRatio: 1 }} />;

              const isTodayDs = ds === TODAY_STR;

              if (singleDay) {
                const isSel = ds === selectedDay;
                return (
                  <TouchableOpacity
                    key={ds}
                    style={{ flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: isSel ? C.primary : 'transparent', borderRadius: 9 }}
                    onPress={() => handleDay(ds)} activeOpacity={0.7}
                  >
                    <Text style={{ fontSize: 13, fontWeight: (isSel || isTodayDs) ? '800' : '400', color: isSel ? '#fff' : isTodayDs ? C.primary : C.textDark }}>
                      {parseInt(ds.split('-')[2], 10)}
                    </Text>
                    {isTodayDs && !isSel && (
                      <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: C.primary, position: 'absolute', bottom: 4 }} />
                    )}
                  </TouchableOpacity>
                );
              }

              const isFrom = ds === tempFrom;
              const isTo = ds === tempTo && tempFrom !== tempTo;
              const inRange = ds > tempFrom && ds < tempTo;
              const isSingle = ds === tempFrom && tempFrom === tempTo;

              const bg = (isFrom || isTo) ? C.primary : inRange ? '#DBEAFE' : 'transparent';
              const txCol = (isFrom || isTo) ? '#fff' : inRange ? C.primary : isTodayDs ? C.primary : C.textDark;
              const fw = (isFrom || isTo || isSingle || isTodayDs) ? '800' : '400';

              // border radius: round outer ends of range
              const roundLeft = isFrom || (inRange && di === 0 && wi > 0);
              const roundRight = isTo || (inRange && di === 6);
              const br = isFrom || isTo || isSingle ? 9
                : inRange ? (roundLeft || roundRight ? 9 : 0) : 0;

              return (
                <TouchableOpacity
                  key={ds}
                  style={{ flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: bg, borderRadius: br }}
                  onPress={() => handleDay(ds)} activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 13, fontWeight: fw, color: txCol }}>
                    {parseInt(ds.split('-')[2], 10)}
                  </Text>
                  {isTodayDs && !isFrom && !isTo && (
                    <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: C.primary, position: 'absolute', bottom: 4 }} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}

        {/* Preset shortcuts — only for range mode */}
        {!singleDay && (
          <View style={{ marginTop: 18 }}>
            <Text style={[st.label, { marginBottom: 8 }]}>Quick Select</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {presets.map((p, i) => (
                <TouchableOpacity
                  key={p.label}
                  style={[st.presetBtn, { marginRight: i % 2 === 0 ? 8 : 0, marginBottom: 8 }]}
                  onPress={() => setPreset(p.from, p.to)}
                >
                  <Text style={st.presetTxt}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Apply — only for range mode */}
        {!singleDay && (
          <TouchableOpacity style={st.btnPrimary} onPress={() => { onChange({ from: tempFrom, to: tempTo }); onClose(); }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}><MaterialIcons name="check" size={18} color="#fff" style={{ marginRight: 4 }} /><Text style={st.btnPrimaryTxt}>Apply  ·  {applyLabel}</Text></View>
          </TouchableOpacity>
        )}

      </ScrollView>
    </FullModal>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PAYROLL PERIOD BAR — quick presets + custom range
// ══════════════════════════════════════════════════════════════════════════════
function PayrollPeriodBar({ period, onPeriodChange, onOpenCalendar }) {
  const { t } = useTranslation();
  const now = new Date();
  const thisMonthFrom = fmtDate(new Date(now.getFullYear(), now.getMonth(), 1));
  const thisMonthTo = TODAY_STR;
  const lastMonthFrom = fmtDate(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  const lastMonthTo = fmtDate(lastMonthEnd);

  // Detect which preset is active
  const isThisMonth = period.from === thisMonthFrom && period.to === thisMonthTo;
  const isLastMonth = period.from === lastMonthFrom && period.to === lastMonthTo;
  const isCustom = !isThisMonth && !isLastMonth;

  const presets = [
    { key: 'lastMonth', label: t('periods.lastMonth', 'Last Month'), from: lastMonthFrom, to: lastMonthTo },
    { key: 'thisMonth', label: t('periods.thisMonth', 'This Month'), from: thisMonthFrom, to: thisMonthTo },
  ];

  return (
    <View style={{ backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.border, paddingVertical: 10, paddingHorizontal: 12 }}>
      {/* Preset buttons row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {presets.map(p => {
          const active = (p.key === 'thisMonth' && isThisMonth) || (p.key === 'lastMonth' && isLastMonth);
          return (
            <TouchableOpacity key={p.key} onPress={() => onPeriodChange({ from: p.from, to: p.to })}
              style={{ flex: 1, backgroundColor: active ? C.primary : C.cardBg, borderRadius: 10, paddingVertical: 8, alignItems: 'center' }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: active ? '#fff' : C.textDark }}>{p.label}</Text>
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity onPress={onOpenCalendar}
          style={{ flex: 1, backgroundColor: isCustom ? C.primary : C.cardBg, borderRadius: 10, paddingVertical: 8, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 4 }}>
          <MaterialIcons name="date-range" size={14} color={isCustom ? '#fff' : C.textDark} />
          <Text style={{ fontSize: 12, fontWeight: '700', color: isCustom ? '#fff' : C.textDark }}>{t('periods.custom', 'Custom')}</Text>
        </TouchableOpacity>
      </View>
      {/* Current range label */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 6, gap: 6 }}>
        <MaterialIcons name="calendar-today" size={13} color={C.textMuted} />
        <Text style={{ fontSize: 12, fontWeight: '600', color: C.textMid }}>
          {period.from}  →  {period.to}
        </Text>
      </View>
    </View>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SUMMARY PANEL
// ══════════════════════════════════════════════════════════════════════════════
function SummaryPanel({ staff, attendance, payCalcs, period, allPayments = [], paymentDataByUser = {}, initialOpen = false }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(initialOpen);

  const daysInPer = Math.max(1, Math.round((new Date(period.to) - new Date(period.from)) / 86400000) + 1);

  const attRows = useMemo(() => staff.map(m => {
    // Use string comparison for dates (avoids timezone bugs)
    const recs = attendance.filter(r => {
      if (r.staffId !== m.id) return false;
      return r.date >= period.from && r.date <= period.to;
    });
    const present = recs.filter(r => r.status === 'Present' || r.status === 'Late').length;
    const absent = recs.filter(r => r.status === 'Absent').length;
    const late = recs.filter(r => r.lateMin > 0).length;
    const hours = recs.filter(r => r.status === 'Present' || r.status === 'Late')
      .reduce((s, r) => s + (r.hoursWorked > 0 ? r.hoursWorked : minutesBetween(r.clockIn, r.clockOut) / 60), 0);
    const rate = Math.round((present / daysInPer) * 100);
    return { m, present, absent, late, hours: Math.round(hours * 10) / 10, rate };
  }), [staff, attendance, period]);

  // Period-based remaining: full period earnings vs in-period payments.
  // Fixes overpayments made on the last payment date not registering.
  // Note: payCalcs prop receives fullPayCalcs from the parent.
  const payRows = useMemo(() => staff.map(m => {
    const fullNet = payCalcs[m.id]?.net || 0; // period-based earnings (from fullPayCalcs)
    const ef = paymentDataByUser[m.id]?.effectiveFrom;
    const paidDisplay = paymentDataByUser[m.id]?.paidInDisplayPeriod || 0; // period-based paid
    let due;
    if (ef && ef > period.to) {
      due = 0; // fully settled past this period
    } else {
      due = Math.max(0, fullNet - paidDisplay);
    }
    return { m, net: fullNet, paid: paidDisplay, due };
  }), [staff, payCalcs, paymentDataByUser, period]);

  const totalOwed = payRows.reduce((s, r) => s + r.net, 0);
  const totalPaid = payRows.reduce((s, r) => s + r.paid, 0);
  const totalDue = payRows.reduce((s, r) => s + r.due, 0);

  const periodLabel = period.from === period.to
    ? period.from
    : `${period.from} → ${period.to}  (${daysInPer}d)`;

  return (
    <View style={st.summaryCard}>
      {/* ── Header: always visible ── */}
      <TouchableOpacity onPress={() => setOpen(o => !o)} style={st.summaryHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}><MaterialIcons name="bar-chart" size={18} color={C.textDark} style={{ marginRight: 6 }} /><Text style={st.summaryTitle}>{t('admin.staff.summary.periodSummary', 'Period Summary')}</Text></View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {/* When collapsed, show a quick Due/Paid-off indicator */}
          {!open && totalOwed > 0 && (
            <Text style={{
              fontSize: 12, fontWeight: '700', marginRight: 10,
              color: totalDue > 0 ? C.danger : C.success
            }}>
              {totalDue > 0 ? `Due: ${fmtMoney(totalDue)}` : <View style={{ flexDirection: 'row', alignItems: 'center' }}><MaterialIcons name="check" size={14} color={C.success} style={{ marginRight: 2 }} /><Text>All Paid</Text></View>}
            </Text>
          )}
          <Text style={{ color: C.primary, fontWeight: '700', fontSize: 13 }}>
            {open ? '▲ Hide' : '▼ Show'}
          </Text>
        </View>
      </TouchableOpacity>

      {open && (
        <>
          <Text style={{ color: C.textMuted, fontSize: 12, marginBottom: 12 }}>{periodLabel}</Text>

          {/* ── Attendance Summary (unchanged) ── */}
          <Text style={st.summarySection}>{t('admin.staff.summary.attendance', 'Attendance')}</Text>
          <View style={{ flexDirection: 'row', marginBottom: 4 }}>
            {[
              t('admin.staff.summary.name', 'Name'),
              t('admin.staff.present', 'Present'),
              t('admin.staff.late', 'Late'),
              t('admin.staff.absent', 'Absent'),
              t('admin.staff.summary.hours', 'Hours'),
              t('admin.staff.summary.rate', 'Rate'),
            ].map((h, i) => (
              <Text key={h} style={[st.summaryColHdr, { flex: i === 0 ? 2 : 1, textAlign: i === 0 ? 'left' : 'center' }]}>{h}</Text>
            ))}
          </View>
          <Divider mb={4} />
          {attRows.map(r => (
            <View key={r.m.id} style={st.summaryRow}>
              <Text style={[st.summaryCell, { flex: 2, fontWeight: '700', color: C.textDark }]} numberOfLines={1}>
                {r.m.name.split(' ')[0]}
              </Text>
              <Text style={[st.summaryCell, { color: C.success, flex: 1, textAlign: 'center' }]}>{r.present}</Text>
              <Text style={[st.summaryCell, { color: C.warning, flex: 1, textAlign: 'center' }]}>{r.late}</Text>
              <Text style={[st.summaryCell, { color: C.danger, flex: 1, textAlign: 'center' }]}>{r.absent}</Text>
              <Text style={[st.summaryCell, { color: C.primary, flex: 1, textAlign: 'center' }]}>{r.hours}h</Text>
              <Text style={[st.summaryCell, { color: C.textMid, flex: 1, textAlign: 'center' }]}>{r.rate}%</Text>
            </View>
          ))}
          {(() => {
            const totPresent = attRows.reduce((s, r) => s + r.present, 0);
            const totPossible = attRows.reduce((s, r) => s + daysInPer, 0);
            const overallRate = totPossible > 0 ? Math.round((totPresent / totPossible) * 100) : 0;
            return (
              <View style={[st.summaryRow, { backgroundColor: '#F0F9FF', borderRadius: 8, paddingHorizontal: 8, marginTop: 4 }]}>
                <Text style={[st.summaryCell, { flex: 2, fontWeight: '800', color: C.textDark }]}>{t('admin.staff.summary.teamAvg', 'Team Avg')}</Text>
                <Text style={{ flex: 4, textAlign: 'right', fontSize: 11, fontWeight: '800', color: C.primary }}>
                  {t('admin.staff.summary.attendancePct', '{pct}% attendance').replace('{pct}', overallRate)}
                </Text>
              </View>
            );
          })()}

          {/* ── Payroll Summary ── */}
          <Text style={[st.summarySection, { marginTop: 16 }]}>{t('admin.staff.summary.payroll', 'Payroll')}</Text>

          {payRows.map(r => (
            <View key={r.m.id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border }}>
              {/* Line 1: name + net */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: C.textDark }} numberOfLines={1}>{r.m.name}</Text>
                <Text style={{ fontSize: 12, fontWeight: '800', color: C.textDark }}>{t('admin.staff.summary.net', 'Net')}: {fmtMoney(r.net)}</Text>
              </View>
              {/* Line 2: role badge + paid | due */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <RoleBadge role={r.m.role} small />
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ fontSize: 11, color: C.success, fontWeight: '700' }}>{t('admin.staff.summary.paid', 'Paid')}: {fmtMoney(r.paid)}</Text>
                  <Text style={{ fontSize: 11, color: C.textMuted, marginHorizontal: 5 }}>|</Text>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: r.due > 0 ? C.danger : C.success }}>
                    {t('admin.staff.summary.due', 'Due')}: {fmtMoney(r.due)}
                  </Text>
                </View>
              </View>
            </View>
          ))}

          {/* Grand Total block */}
          <View style={{ backgroundColor: '#F8FAFC', borderRadius: 10, padding: 12, marginTop: 10 }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: C.textDark, marginBottom: 8 }}>{t('admin.staff.summary.grandTotal', 'Grand Total')}</Text>
            {[
              [`${t('admin.staff.summary.totalOwed', 'Total Owed')}:`, fmtMoney(totalOwed), C.textDark],
              [`${t('admin.staff.summary.totalPaid', 'Total Paid')}:`, fmtMoney(totalPaid), C.success],
              [`${t('admin.staff.summary.totalDue', 'Total Due')}:`, fmtMoney(totalDue), totalDue > 0 ? C.danger : C.success],
            ].map(([lbl, val, col]) => (
              <View key={lbl} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={{ fontSize: 13, color: C.textMuted }}>{lbl}</Text>
                <Text style={{ fontSize: 13, fontWeight: '800', color: col }}>{val}</Text>
              </View>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ADD / EDIT STAFF MODAL
// ══════════════════════════════════════════════════════════════════════════════
const BLANK = {
  name: '', role: 'Waitress', phone: '', email: '', password: '',
  shiftStart: '09:00', shiftEnd: '18:00', salaryType: 'Monthly', rate: '',
  kitchen_station: null,
};

// Kitchen station quick-pick presets (any can also be renamed via text input)
const KITCHEN_STATION_PRESETS = [
  { id: 'salad',  icon: 'eco',                   label: 'Salad',   color: '#16A34A', bg: '#F0FDF4' },
  { id: 'grill',  icon: 'outdoor-grill',          label: 'Grill',   color: '#EA580C', bg: '#FFF7ED' },
  { id: 'bar',    icon: 'local-bar',              label: 'Bar',     color: '#2563EB', bg: '#EFF6FF' },
  { id: 'pastry', icon: 'cake',                   label: 'Pastry',  color: '#A21CAF', bg: '#FDF4FF' },
  { id: 'cold',   icon: 'ac-unit',                label: 'Cold',    color: '#0891B2', bg: '#ECFEFF' },
  { id: 'hot',    icon: 'local-fire-department',  label: 'Hot',     color: '#DC2626', bg: '#FEF2F2' },
];

const CUSTOM_PRESETS_KEY = '@kitchen_station_custom_presets';

function StaffFormModal({ visible, onClose, onSave, initial, mode }) {
  const { t } = useTranslation();
  const [form, setForm] = useState(BLANK);
  const [customPresets, setCustomPresets] = useState([]);
  const [dialog, setDialog] = useState(null);

  React.useEffect(() => {
    if (visible) setForm(initial
      ? { ...BLANK, ...initial, rate: String(initial.rate || ''), kitchen_station: initial.kitchen_station || null }
      : BLANK
    );
  }, [visible]);

  // Load custom presets from DB on mount (shared with menu page & website)
  const loadCustomStations = React.useCallback(async () => {
    try {
      const res = await menuAPI.getStations();
      const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
      setCustomPresets(list.map(s => {
        const name = typeof s === 'string' ? s : s.name || s;
        return { id: name, label: name, icon: 'label', color: '#6366F1', bg: '#EEF2FF', custom: true };
      }));
    } catch (_) {
      // Fallback to AsyncStorage if API fails
      try {
        const json = await AsyncStorage.getItem(CUSTOM_PRESETS_KEY);
        if (json) setCustomPresets(JSON.parse(json));
      } catch (_e) {}
    }
  }, []);

  React.useEffect(() => { loadCustomStations(); }, []);

  // All presets = hardcoded defaults + custom ones saved by user
  const allPresets = [
    ...KITCHEN_STATION_PRESETS,
    ...customPresets,
  ];

  // Add current text-input value to the quick-pick list (saves to DB)
  const addToQuickPicks = async () => {
    const val = (form.kitchen_station || '').trim();
    if (!val) return;
    if (KITCHEN_STATION_PRESETS.some(p => p.id.toLowerCase() === val.toLowerCase())) return;
    if (customPresets.some(p => p.id.toLowerCase() === val.toLowerCase())) return;
    try {
      await menuAPI.addStation(val);
      await loadCustomStations();
    } catch (_) {
      // Fallback: add locally
      const newPreset = { id: val, label: val, icon: 'label', color: '#6366F1', bg: '#EEF2FF', custom: true };
      const updated = [...customPresets, newPreset];
      setCustomPresets(updated);
      try { await AsyncStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(updated)); } catch (_e) {}
    }
  };

  // Remove a custom preset chip (deletes from DB) — with confirmation
  const removeCustomPreset = (id) => {
    const station = customPresets.find(p => p.id === id);
    setDialog({
      title: 'Delete Station',
      message: `Delete "${station?.label || id}"? This will remove it from the quick pick list.`,
      type: 'danger',
      confirmLabel: 'Delete',
      onConfirm: async () => {
        try {
          await menuAPI.deleteStation(id);
          await loadCustomStations();
        } catch (e) {
          const msg = e?.response?.data?.error || 'Cannot delete station';
          setDialog({ title: 'Error', message: msg, type: 'warning' });
        }
      },
    });
  };

  // Whether the current typed value is already in any preset (so we show/hide + button)
  const currentVal = (form.kitchen_station || '').trim();
  const alreadyPreset = allPresets.some(p => p.id.toLowerCase() === currentVal.toLowerCase());
  const canAddToQuickPick = currentVal.length > 0 && !alreadyPreset;

  const set = (k) => (v) => setForm(p => ({ ...p, [k]: v }));
  const save = () => {
    if (!form.name.trim()) { setDialog({ title: 'Required', message: 'Name is required.', type: 'warning' }); return; }
    if (!form.phone.trim()) { setDialog({ title: 'Required', message: 'Phone is required.', type: 'warning' }); return; }
    if (mode === 'add' && !form.password.trim()) { setDialog({ title: 'Required', message: 'Please set a login password for this staff member.', type: 'warning' }); return; }
    const r = Number(form.rate);
    if (!form.rate || isNaN(r) || r <= 0) { setDialog({ title: 'Required', message: 'Enter a valid rate.', type: 'warning' }); return; }
    onSave({ ...form, rate: r }); onClose();
  };

  return (
    <FullModal visible={visible} onClose={onClose} title={mode === 'add' ? <View style={{ flexDirection: 'row', alignItems: 'center' }}><MaterialIcons name='add' size={20} color='#fff' style={{ marginRight: 6 }} /><Text>{t('admin.staff.addNewStaff')}</Text></View> : <View style={{ flexDirection: 'row', alignItems: 'center' }}><MaterialIcons name='edit' size={20} color='#fff' style={{ marginRight: 6 }} /><Text>{t('admin.staff.editStaffInfo')}</Text></View>}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Field label="Full Name *" value={form.name} onChange={set('name')} placeholder="e.g. Aisha Karimova" />
        <ChipRow label="Role *" options={ROLES} selected={form.role} onSelect={(v) => {
          set('role')(v);
          // Reset station when role changes away from kitchen
          if (v !== 'Kitchen') set('kitchen_station')(null);
        }} />

        {/* Kitchen station picker — only for Kitchen role */}
        {form.role === 'Kitchen' && (
          <View style={{ marginBottom: 14 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: C.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Kitchen Station
            </Text>

            {/* Editable station name input */}
            <View style={{
              flexDirection: 'row', alignItems: 'center',
              backgroundColor: '#F9FAFB', borderRadius: 12, borderWidth: 1.5,
              borderColor: form.kitchen_station ? '#2563EB' : '#E5E7EB',
              paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10, gap: 8,
            }}>
              <MaterialIcons name="edit" size={16} color={form.kitchen_station ? '#2563EB' : '#94A3B8'} />
              <TextInput
                style={{ flex: 1, fontSize: 14, fontWeight: '600', color: '#111827', padding: 0 }}
                value={form.kitchen_station || ''}
                onChangeText={v => set('kitchen_station')(v.trim().length > 0 ? v : null)}
                placeholder="Type station name (or pick below)"
                placeholderTextColor="#94A3B8"
                returnKeyType="done"
              />
              {form.kitchen_station ? (
                <TouchableOpacity onPress={() => set('kitchen_station')(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <MaterialIcons name="close" size={16} color="#94A3B8" />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Quick-pick preset chips */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={{ fontSize: 10, color: '#94A3B8', fontWeight: '600' }}>QUICK PICK:</Text>
              {canAddToQuickPick && (
                <TouchableOpacity
                  onPress={addToQuickPicks}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 4,
                    backgroundColor: '#EEF2FF', borderRadius: 12,
                    paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: '#A5B4FC',
                  }}
                  activeOpacity={0.75}
                >
                  <MaterialIcons name="add" size={13} color="#6366F1" />
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#6366F1' }}>
                    Add "{currentVal}"
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: 8, paddingBottom: 4 }}>
                {allPresets.map(ks => {
                  const active = (form.kitchen_station || '').toLowerCase() === ks.id.toLowerCase();
                  return (
                    <TouchableOpacity
                      key={ks.id}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 5,
                        paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5,
                        borderColor: active ? ks.color : '#E5E7EB',
                        backgroundColor: active ? ks.bg : '#F9FAFB',
                      }}
                      onPress={() => set('kitchen_station')(active ? null : ks.id)}
                      activeOpacity={0.75}
                    >
                      <MaterialIcons name={ks.icon} size={14} color={active ? ks.color : '#94A3B8'} />
                      <Text style={{ fontSize: 12, fontWeight: '700', color: active ? ks.color : '#6B7280' }}>
                        {ks.label}
                      </Text>
                      {/* Delete button only on custom chips */}
                      {ks.custom && (
                        <TouchableOpacity
                          onPress={() => removeCustomPreset(ks.id)}
                          hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                        >
                          <MaterialIcons name="close" size={12} color={active ? ks.color : '#94A3B8'} />
                        </TouchableOpacity>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            <Text style={{ fontSize: 11, color: '#6B7280', marginTop: 8 }}>
              {form.kitchen_station
                ? `Station: "${form.kitchen_station}" — only sees matching orders`
                : 'No station — sees all kitchen orders'}
            </Text>
          </View>
        )}

        <PhoneField value={form.phone} onChange={set('phone')} />
        {mode === 'add' && <>
          <Field label="Email (login)" value={form.email} onChange={set('email')} placeholder="staff@example.com" keyType="email-address" />
          <PasswordField value={form.password} onChange={set('password')} />
        </>}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <TimePicker label="Shift Start" value={form.shiftStart} onChange={set('shiftStart')} placeholder="09:00" />
          </View>
          <View style={{ flex: 1 }}>
            <TimePicker label="Shift End" value={form.shiftEnd} onChange={set('shiftEnd')} placeholder="18:00" />
          </View>
        </View>
        <ChipRow label="Salary Type *" options={SALARY_TYPES} selected={form.salaryType} onSelect={set('salaryType')} />
        <Field label={`Rate (so'm) · ${form.salaryType}`} value={form.rate} onChange={set('rate')} placeholder="e.g. 1500000" keyType="numeric" />
        <TouchableOpacity style={st.btnPrimary} onPress={save}>
          <Text style={st.btnPrimaryTxt}>{mode === 'add' ? t('admin.staff.addNewStaff') : t('common.saveChanges')}</Text>
        </TouchableOpacity>
      </ScrollView>
      <ConfirmDialog dialog={dialog} onClose={() => setDialog(null)} />
    </FullModal>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// EDIT LOGIN MODAL
// ══════════════════════════════════════════════════════════════════════════════
function EditLoginModal({ visible, onClose, member, onSave }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  React.useEffect(() => {
    if (visible && member) { setEmail(member.email || ''); setPassword(''); setConfirmPassword(''); setError(''); }
  }, [visible]);
  const save = () => {
    if (!email && !password) { setError('Provide email or new password'); return; }
    if (password && password !== confirmPassword) { setError('New passwords do not match'); return; }
    if (password && password.length < 3) { setError('Password must be at least 3 characters'); return; }
    setError('');
    onSave({
      email,
      ...(password ? { password } : {}),
      ...(confirmPassword ? { confirm_password: confirmPassword } : {}),
    });
    onClose();
  };
  const match = password && confirmPassword && password === confirmPassword;
  const mismatch = password && confirmPassword && password !== confirmPassword;
  return (
    <FullModal visible={visible} onClose={onClose} title={<View style={{ flexDirection: 'row', alignItems: 'center' }}><MaterialIcons name="lock" size={20} color="#fff" style={{ marginRight: 6 }} /><Text>Edit Login Credentials</Text></View>}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Field label="Email" value={email} onChange={setEmail} placeholder="staff@example.com" keyType="email-address" />
        <PasswordField label={t('labels.newPasswordOptional', 'New Password (optional)')} value={password} onChange={setPassword} placeholder={t('placeholders.leaveBlankKeepCurrent', 'Leave blank to keep current')} />
        <PasswordField label="Confirm New Password" value={confirmPassword} onChange={setConfirmPassword} placeholder="Re-enter new password" />
        {mismatch && <Text style={{ color: '#EF4444', fontSize: 12, marginBottom: 8 }}>Passwords do not match</Text>}
        {match && <Text style={{ color: '#22C55E', fontSize: 12, marginBottom: 8 }}>Passwords match</Text>}
        {error ? <Text style={{ color: '#EF4444', fontSize: 12, marginBottom: 8 }}>{error}</Text> : null}
        <TouchableOpacity style={[st.btnPrimary, { backgroundColor: '#7C3AED', opacity: mismatch ? 0.5 : 1 }]} onPress={save} disabled={!!mismatch}>
          <Text style={st.btnPrimaryTxt}>Save Credentials</Text>
        </TouchableOpacity>
      </ScrollView>
    </FullModal>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// STAFF PROFILE MODAL
// ══════════════════════════════════════════════════════════════════════════════
function StaffProfileModal({ visible, onClose, member, onEdit, onEditLogin, onDelete, onToggleStatus }) {
  const [dialog, setDialog] = useState(null);
  if (!member) return null;
  const susp = member.status === 'Suspended';
  return (
    <FullModal visible={visible} onClose={onClose} title={<View style={{ flexDirection: 'row', alignItems: 'center' }}><MaterialIcons name="person" size={20} color="#fff" style={{ marginRight: 6 }} /><Text>Staff Profile</Text></View>}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        <View style={{ alignItems: 'center', marginBottom: 20 }}>
          <View style={[st.avatarLg, { backgroundColor: ROLE_COLORS[member.role]?.bg || '#F1F5F9' }]}>
            <Text style={[st.avatarLgTxt, { color: ROLE_COLORS[member.role]?.text || '#475569' }]}>{member.name.charAt(0)}</Text>
          </View>
          <Text style={{ fontSize: 20, fontWeight: '800', color: C.textDark, marginTop: 10 }}>{member.name}</Text>
          <View style={{ flexDirection: 'row', marginTop: 8 }}>
            <RoleBadge role={member.role} />
            <View style={{ width: 8 }} />
            <View style={{ backgroundColor: susp ? '#FEF3C7' : '#DCFCE7', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
              <Text style={{ color: susp ? '#92400E' : '#166534', fontSize: 12, fontWeight: '700' }}>
                {susp ? <View style={{ flexDirection: 'row', alignItems: 'center' }}><MaterialIcons name='pause' size={14} color={C.warning} style={{ marginRight: 4 }} /><Text>Suspended</Text></View> : <View style={{ flexDirection: 'row', alignItems: 'center' }}><MaterialIcons name='check' size={14} color={C.success} style={{ marginRight: 4 }} /><Text>Active</Text></View>}
              </Text>
            </View>
          </View>
        </View>
        <View style={st.infoCard}>
          {[
            { key: 'phone',  icon: 'phone',        label: 'Phone',  value: member.phone },
            { key: 'email',  icon: 'email',         label: 'Login Email',  value: member.email || '—' },
            { key: 'shift',  icon: 'schedule',      label: 'Shift',  value: `${member.shiftStart} – ${member.shiftEnd}` },
            ...(!['Admin', 'Owner', 'admin', 'owner'].includes(member.role) ? [{ key: 'salary', icon: 'attach-money',  label: 'Salary', value: `${fmtMoney(member.rate)} / ${member.salaryType}` }] : []),
          ].map(({ key, icon, label, value }) => (
            <View key={key} style={st.infoRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', minWidth: 60 }}>
                <MaterialIcons name={icon} size={14} color={C.primary} style={{ marginRight: 4 }} />
                <Text style={st.infoKey}>{label}</Text>
              </View>
              <Text style={st.infoVal}>{value}</Text>
            </View>
          ))}
        </View>
        {!['Admin', 'Owner', 'admin', 'owner'].includes(member.role) && (<>
        <TouchableOpacity style={st.btnPrimary} onPress={() => { onEdit(member); onClose(); }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}><MaterialIcons name="edit" size={16} color="#fff" style={{ marginRight: 4 }} /><Text style={st.btnPrimaryTxt}>Edit Info</Text></View>
        </TouchableOpacity>
        <TouchableOpacity style={[st.btnOutline, { marginTop: 10 }]} onPress={() => { onEditLogin(member); onClose(); }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}><MaterialIcons name="lock" size={16} color="#7C3AED" style={{ marginRight: 4 }} /><Text style={[st.btnOutlineTxt, { color: '#7C3AED' }]}>Edit Login</Text></View>
        </TouchableOpacity>
        <TouchableOpacity style={[st.btnOutline, { marginTop: 10, borderColor: susp ? C.success : C.warning }]} onPress={() => { onToggleStatus(member); onClose(); }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}><MaterialIcons name={susp ? 'play-arrow' : 'pause'} size={16} color={susp ? C.success : C.warning} style={{ marginRight: 4 }} /><Text style={[st.btnOutlineTxt, { color: susp ? C.success : C.warning }]}>{susp ? 'Reactivate' : 'Suspend'}</Text></View>
        </TouchableOpacity>
        <TouchableOpacity
          style={[st.btnOutline, { marginTop: 10, borderColor: C.danger }]}
          onPress={() => setDialog({
            title: 'Delete Staff',
            message: `Remove ${member.name}?`,
            type: 'danger',
            confirmLabel: 'Delete',
            onConfirm: () => { setDialog(null); onDelete(member.id); onClose(); }
          })}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}><MaterialIcons name="delete" size={16} color={C.danger} style={{ marginRight: 4 }} /><Text style={[st.btnOutlineTxt, { color: C.danger }]}>Delete</Text></View>
        </TouchableOpacity>
        </>)}
      </ScrollView>
      <ConfirmDialog dialog={dialog} onClose={() => setDialog(null)} />
    </FullModal>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ATTENDANCE EDIT MODAL — admin manually sets status / times / note
// ══════════════════════════════════════════════════════════════════════════════
const ATT_STATUSES = ['Present', 'Late', 'Absent', 'Excused'];
const STATUS_COLORS = {
  Present: { bg: '#DCFCE7', text: '#166534' },
  Late: { bg: '#FFF7ED', text: '#9A3412' },
  Absent: { bg: '#FEE2E2', text: '#991B1B' },
  Excused: { bg: '#EDE9FE', text: '#5B21B6' },
};

function AttendanceEditModal({ visible, onClose, member, defaultDate, existingRecord, onSave }) {
  const [date, setDate] = useState(TODAY_STR);
  const [status, setStatus] = useState('Present');
  const [clockIn, setClockIn] = useState('09:00');
  const [clockOut, setClkOut] = useState('18:00');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [dialog, setDialog] = useState(null);

  React.useEffect(() => {
    if (visible) {
      setDate(defaultDate || TODAY_STR);
      if (existingRecord) {
        setStatus(existingRecord.status || 'Present');
        setClockIn(existingRecord.clockIn || '09:00');
        setClkOut(existingRecord.clockOut || '18:00');
        setNote(existingRecord.note || '');
      } else {
        setStatus('Present');
        setClockIn(member?.shiftStart || '09:00');
        setClkOut(member?.shiftEnd || '18:00');
        setNote('');
      }
    }
  }, [visible]);

  const needsTime = (status === 'Present' || status === 'Late');

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        date,
        status: status.toLowerCase(),
        clock_in: needsTime ? clockIn : null,
        clock_out: needsTime ? clockOut : null,
        note: note.trim() || null,
      }, existingRecord?.id);
      onClose();
    } catch (e) {
      setDialog({ title: 'Error', message: e.response?.data?.error || e.message, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (!member) return null;
  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.border }}>
          <TouchableOpacity onPress={onClose} style={{ width: 70 }}>
            <Text style={{ fontSize: 15, color: C.primary, fontWeight: '700' }}>← Back</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 16, fontWeight: '800', color: C.textDark }}>Edit Attendance</Text>
          <View style={{ width: 70 }} />
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
            {/* Staff info row */}
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.white, borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: C.border }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#DBEAFE', justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
                <Text style={{ fontSize: 17, fontWeight: '800', color: C.primary }}>{member.name[0]}</Text>
              </View>
              <View>
                <Text style={{ fontSize: 15, fontWeight: '800', color: C.textDark }}>{member.name}</Text>
                <Text style={{ fontSize: 12, color: C.textMuted }}>{date}{existingRecord ? ` · ${existingRecord.status}` : ''}</Text>
              </View>
            </View>

            {/* Date */}
            <DateFieldAS label="Date" value={date} onChange={setDate} />

            {/* Status chips */}
            <Text style={st.label}>Status</Text>
            <View style={{ flexDirection: 'row', marginBottom: 14 }}>
              {ATT_STATUSES.map(s => {
                const col = STATUS_COLORS[s];
                const on = status === s;
                return (
                  <TouchableOpacity
                    key={s}
                    onPress={() => setStatus(s)}
                    style={{
                      flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 10, marginRight: s !== 'Excused' ? 6 : 0,
                      backgroundColor: on ? col.bg : '#F1F5F9',
                      borderWidth: 1.5, borderColor: on ? col.text : C.border,
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '700', color: on ? col.text : C.textMid }}>{s}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Times — only for Present/Late */}
            {needsTime && (
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
                <View style={{ flex: 1 }}>
                  <TimePicker label="Clock-In" value={clockIn} onChange={setClockIn} placeholder="09:00" />
                </View>
                <View style={{ flex: 1 }}>
                  <TimePicker label="Clock-Out" value={clockOut} onChange={setClkOut} placeholder="18:00" />
                </View>
              </View>
            )}

            {/* Note */}
            <Text style={st.label}>Note (optional)</Text>
            <TextInput
              style={[st.input, { minHeight: 56, textAlignVertical: 'top', marginBottom: 20 }]}
              value={note} onChangeText={setNote}
              placeholder="e.g. Doctor's appointment, adjusted hours..."
              placeholderTextColor={C.textMuted} multiline
            />

            {/* Save */}
            <TouchableOpacity
              style={[st.btnPrimary, saving && { opacity: 0.6 }]}
              onPress={handleSave} disabled={saving}
            >
              <Text style={st.btnPrimaryTxt}>
                {saving ? 'Saving…' : <View style={{ flexDirection: 'row', alignItems: 'center' }}><MaterialIcons name='check' size={14} color='#fff' style={{ marginRight: 4 }} /><Text style={{ color: '#fff', fontWeight: '700' }}>{existingRecord ? 'Update Record' : 'Create Record'}</Text></View>}
              </Text>
            </TouchableOpacity>
            <ConfirmDialog dialog={dialog} onClose={() => setDialog(null)} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ATTENDANCE HISTORY MODAL
// ══════════════════════════════════════════════════════════════════════════════
function AttHistoryModal({ visible, onClose, member, attendance }) {
  if (!member) return null;
  const recs = [...attendance].filter(r => r.staffId === member.id).sort((a, b) => b.date.localeCompare(a.date));
  return (
    <FullModal visible={visible} onClose={onClose} title={<View style={{ flexDirection: 'row', alignItems: 'center' }}><MaterialIcons name="assignment" size={20} color="#fff" style={{ marginRight: 6 }} /><Text>{member.name}</Text></View>}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {recs.length === 0
          ? <Text style={{ color: C.textMuted, textAlign: 'center', marginTop: 40 }}>No attendance records</Text>
          : recs.map(r => {
            const col = STATUS_COLORS[r.status] || STATUS_COLORS.Present;
            const icon = r.status === 'Present' ? <MaterialIcons name='check' size={14} color={C.success} /> : r.status === 'Late' ? <MaterialIcons name='warning' size={14} color={C.warning} /> : r.status === 'Excused' ? <MaterialIcons name='circle' size={8} color={C.textMuted} /> : <MaterialIcons name='close' size={14} color={C.danger} />;
            return (
              <View key={r.id} style={[st.card, { marginBottom: 8, padding: 12 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '700', color: C.textDark, fontSize: 14 }}>{r.date}</Text>
                    {(r.status === 'Present' || r.status === 'Late') && (
                      <Text style={{ color: C.textMid, fontSize: 12, marginTop: 2 }}>
                        {r.clockIn} → {r.clockOut || 'No clock-out'}
                        {r.lateMin > 0 ? <View style={{ flexDirection: 'row', alignItems: 'center' }}><MaterialIcons name='warning' size={12} color={C.warning} style={{ marginRight: 2 }} /><Text>+{r.lateMin}min late</Text></View> : ''}
                      </Text>
                    )}
                    {r.note && <Text style={{ color: C.textMuted, fontSize: 11, marginTop: 3, fontStyle: 'italic' }}>"{r.note}"</Text>}
                  </View>
                  <View style={{ backgroundColor: col.bg, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
                    <Text style={{ color: col.text, fontWeight: '700', fontSize: 12 }}>{icon} {r.status}</Text>
                  </View>
                </View>
              </View>
            );
          })
        }
      </ScrollView>
    </FullModal>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PAY NOW MODAL
// ══════════════════════════════════════════════════════════════════════════════
function PayNowModal({ visible, onClose, member, calc, paidAlready = 0, periodFrom, periodTo, onPay }) {
  const { t } = useTranslation();
  const [method, setMethod] = useState('Cash');
  if (!member || !calc) return null;
  const amountDue = Math.max(0, calc.net - paidAlready);
  return (
    <FullModal visible={visible} onClose={onClose} title={<View style={{ flexDirection: 'row', alignItems: 'center' }}><MaterialIcons name="payments" size={20} color="#fff" style={{ marginRight: 6 }} /><Text>{t('admin.staff.payNow', 'Pay Now')}</Text></View>}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        <View style={st.infoCard}>
          <Text style={{ textAlign: 'center', fontWeight: '800', color: C.textDark, fontSize: 16, marginBottom: 4 }}>{member.name}</Text>
          <Text style={{ textAlign: 'center', color: C.textMuted, fontSize: 13, marginBottom: 4 }}>
            {periodFrom} → {periodTo}
          </Text>
          <Text style={{ textAlign: 'center', color: C.textMuted, fontSize: 13, marginBottom: 12 }}>
            {calc.daysWorked} days worked  ·  {calc.lateDays} late
          </Text>
          <Divider mb={10} />
          <View style={st.infoRow}>
            <Text style={st.infoKey}>{t('admin.staff.payrollDetails.netPay', 'Net Pay')}</Text>
            <Text style={st.infoVal}>{fmtMoney(calc.net)}</Text>
          </View>
          {paidAlready > 0 && (
            <View style={st.infoRow}>
              <Text style={st.infoKey}>Already Paid</Text>
              <Text style={[st.infoVal, { color: C.success }]}>- {fmtMoney(paidAlready)}</Text>
            </View>
          )}
          <Divider mt={8} mb={8} />
          <View style={st.infoRow}>
            <Text style={{ fontWeight: '800', color: C.textDark }}>Amount Due</Text>
            <Text style={{ fontWeight: '800', color: C.primary, fontSize: 18 }}>{fmtMoney(amountDue)}</Text>
          </View>
        </View>
        <ChipRow label="Payment Method" options={PAY_METHODS} selected={method} onSelect={setMethod} />
        <TouchableOpacity style={[st.btnPrimary, amountDue <= 0 && { opacity: 0.5 }]} onPress={() => { if (amountDue > 0) { onPay(member, method); onClose(); } }} disabled={amountDue <= 0}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}><MaterialIcons name="check" size={16} color="#fff" style={{ marginRight: 4 }} /><Text style={st.btnPrimaryTxt}>Confirm · {fmtMoney(amountDue)}</Text></View>
        </TouchableOpacity>
      </ScrollView>
    </FullModal>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PAYMENT FORM MODAL (Add / Edit a payment record)
// ══════════════════════════════════════════════════════════════════════════════
const PAY_METHOD_OPTIONS = ['cash', 'bank_transfer', 'check', 'other'];
const PAY_METHOD_LABELS = { cash: 'Cash', bank_transfer: 'Bank Transfer', check: 'Check', other: 'Other' };

function PaymentFormModal({ visible, onClose, payment, memberId, onSave }) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [date, setDate] = useState(TODAY_STR);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [dialog, setDialog] = useState(null);

  React.useEffect(() => {
    if (visible) {
      if (payment) {
        setAmount(String(payment.amount || ''));
        setMethod(payment.payment_method || 'cash');
        setDate(payment.payment_date ? String(payment.payment_date).split('T')[0] : TODAY_STR);
        setNote(payment.note || '');
      } else {
        setAmount(''); setMethod('cash'); setDate(TODAY_STR); setNote('');
      }
    }
  }, [visible]);

  const handleSave = async () => {
    const amt = Number(amount);
    if (!amount || isNaN(amt) || amt <= 0) { setDialog({ title: 'Error', message: 'Enter a valid amount.', type: 'error' }); return; }
    setSaving(true);
    try {
      await onSave({ amount: amt, payment_method: method, payment_date: date, note: note.trim() || null, user_id: memberId }, payment?.id);
      onClose();
    } catch (e) {
      setDialog({ title: 'Error', message: e.response?.data?.error || e.message, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.white }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border }}>
          <TouchableOpacity onPress={onClose} style={{ width: 70 }}>
            <Text style={{ fontSize: 15, color: C.primary, fontWeight: '700' }}>← Back</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 16, fontWeight: '800', color: C.textDark }}>{payment ? t('admin.staff.editPayment', 'Edit Payment') : t('admin.staff.addPayment', 'Add Payment')}</Text>
          <View style={{ width: 70 }} />
        </View>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
            <Field label="Amount (so'm) *" value={amount} onChange={setAmount} keyType="numeric" placeholder="e.g. 1500000" />
            <Text style={st.label}>Payment Method</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 4, marginBottom: 14 }}>
              {PAY_METHOD_OPTIONS.map((opt, i) => (
                <TouchableOpacity
                  key={opt} onPress={() => setMethod(opt)}
                  style={[st.chip, method === opt && st.chipOn, i < PAY_METHOD_OPTIONS.length - 1 && { marginRight: 8 }]}
                >
                  <Text style={[st.chipTxt, method === opt && st.chipTxtOn]}>{PAY_METHOD_LABELS[opt]}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <DateFieldAS label="Date" value={date} onChange={setDate} />
            <Text style={st.label}>Note (optional)</Text>
            <TextInput
              style={[st.input, { minHeight: 50, textAlignVertical: 'top', marginBottom: 16 }]}
              value={note} onChangeText={setNote}
              placeholder="e.g. Monthly salary, bonus..."
              placeholderTextColor={C.textMuted} multiline
            />
            <TouchableOpacity style={[st.btnPrimary, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
              <Text style={st.btnPrimaryTxt}>{saving ? 'Saving…' : <View style={{ flexDirection: 'row', alignItems: 'center' }}><MaterialIcons name='check' size={14} color='#fff' style={{ marginRight: 4 }} /><Text style={{ color: '#fff' }}>{payment ? 'Update Payment' : 'Add Payment'}</Text></View>}</Text>
            </TouchableOpacity>
            <ConfirmDialog dialog={dialog} onClose={() => setDialog(null)} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PAYROLL DETAILS MODAL
// ══════════════════════════════════════════════════════════════════════════════
function PayrollDetailsModal({ visible, onClose, member, calc, cardCalc, paidInPeriod = 0, effectiveFrom, period, payments, onAddPayment, onEditPayment, onDeletePayment }) {
  const { t } = useTranslation();
  const [dialog, setDialog] = useState(null);
  if (!member || !calc) return null;

  // calc = fullPayCalcs (current period — always has data for display)
  // cardCalc = payCalcs (debt-based — for remaining tracking)
  const c = calc;
  const debt = cardCalc || calc;

  // Split payments into two visual groups (effectiveFrom used only for display grouping):
  //   settledPayments — before effectiveFrom (already settled, shown greyed out)
  //   currentPayments — from effectiveFrom onwards (active period payments)
  const ef = effectiveFrom || period.from;
  let currentPayments, settledPayments;
  if (effectiveFrom && effectiveFrom > period.to) {
    // Fully settled for this period — all in-period payments are "current"
    currentPayments = payments.filter(p => {
      const pd = String(p.payment_date).split('T')[0];
      return pd >= period.from && pd <= period.to;
    });
    settledPayments = payments.filter(p => {
      const pd = String(p.payment_date).split('T')[0];
      return pd < period.from;
    });
  } else {
    currentPayments = payments.filter(p => {
      const pd = String(p.payment_date).split('T')[0];
      return pd >= ef;
    });
    settledPayments = payments.filter(p => {
      const pd = String(p.payment_date).split('T')[0];
      return pd >= period.from && pd < ef;
    });
  }

  // Period-based remaining: all in-period payments vs full period earnings.
  // Fixes overpayments on last-payment-date not registering as credit.
  const allPeriodPaid = payments.filter(p => {
    const pd = String(p.payment_date).split('T')[0];
    return pd >= period.from && pd <= period.to;
  }).reduce((s, p) => s + parseFloat(p.amount || 0), 0);
  const totalPaid = allPeriodPaid;
  const remaining = (effectiveFrom && effectiveFrom > period.to)
    ? 0
    : Math.max(0, calc.net - allPeriodPaid);

  return (
    <FullModal visible={visible} onClose={onClose} title={<View style={{ flexDirection: 'row', alignItems: 'center' }}><MaterialIcons name="bar-chart" size={20} color="#fff" style={{ marginRight: 6 }} /><Text>{t('admin.staff.payrollDetails.title', 'Payroll Details')}</Text></View>}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        <Text style={{ fontSize: 20, fontWeight: '800', color: C.textDark, marginBottom: 2 }}>{member.name}</Text>
        <Text style={{ color: C.textMuted, fontSize: 13, marginBottom: 16 }}>{period.from} → {period.to}</Text>

        {/* ── Formula Breakdown ── */}
        <View style={st.infoCard}>
          {/* Salary-type-specific formula rows */}
          {member.salaryType === 'Hourly' && [
            [t('admin.staff.payrollDetails.salaryType', 'Salary Type'), t('admin.staff.payrollDetails.hourly', 'Hourly')],
            [t('admin.staff.payrollDetails.hourlyRate', 'Hourly Rate'), `${fmtMoney(member.rate)} / hr`],
            [t('admin.staff.payrollDetails.hoursWorked', 'Hours Worked'), `${c.totalHours} hrs`],
          ].map(([k, v]) => (
            <View key={k} style={st.infoRow}>
              <Text style={st.infoKey}>{k}</Text>
              <Text style={st.infoVal}>{v}</Text>
            </View>
          ))}

          {member.salaryType === 'Daily' && [
            [t('admin.staff.payrollDetails.salaryType', 'Salary Type'), t('admin.staff.payrollDetails.daily', 'Daily')],
            [t('admin.staff.payrollDetails.dailyRate', 'Daily Rate'), `${fmtMoney(member.rate)} / day`],
            [t('admin.staff.payrollDetails.daysPresent', 'Days Present'), String(c.daysWorked)],
          ].map(([k, v]) => (
            <View key={k} style={st.infoRow}>
              <Text style={st.infoKey}>{k}</Text>
              <Text style={st.infoVal}>{v}</Text>
            </View>
          ))}

          {member.salaryType === 'Weekly' && [
            [t('admin.staff.payrollDetails.salaryType', 'Salary Type'), t('admin.staff.payrollDetails.weekly', 'Weekly')],
            [t('admin.staff.payrollDetails.weeklySalary', 'Weekly Salary'), fmtMoney(member.rate)],
            ['Working Days / Week', `${c.workingDays} days`],
            [t('admin.staff.payrollDetails.dailyRate', 'Daily Rate'), `${fmtMoney(c.dailyRate)} / day`],
            [t('admin.staff.payrollDetails.daysPresent', 'Days Present'), String(c.daysWorked)],
          ].map(([k, v]) => (
            <View key={k} style={st.infoRow}>
              <Text style={st.infoKey}>{k}</Text>
              <Text style={st.infoVal}>{v}</Text>
            </View>
          ))}

          {member.salaryType === 'Monthly' && [
            [t('admin.staff.payrollDetails.salaryType', 'Salary Type'), t('admin.staff.payrollDetails.monthly', 'Monthly')],
            [t('admin.staff.payrollDetails.monthlySalary', 'Monthly Salary'), fmtMoney(member.rate)],
            ['Working Days / Month', `${c.workingDays} days`],
            [t('admin.staff.payrollDetails.dailyRate', 'Daily Rate'), `${fmtMoney(c.dailyRate)} / day`],
            [t('admin.staff.payrollDetails.daysPresent', 'Days Present'), String(c.daysWorked)],
          ].map(([k, v]) => (
            <View key={k} style={st.infoRow}>
              <Text style={st.infoKey}>{k}</Text>
              <Text style={st.infoVal}>{v}</Text>
            </View>
          ))}

          {/* Attendance stats row */}
          <View style={{ flexDirection: 'row', marginTop: 6, marginBottom: 2 }}>
            {[
              [t('admin.staff.present', 'Present'), String(c.presentDays), C.success],
              [t('admin.staff.absent', 'Absent'), String(c.absentDays), C.danger],
              [t('admin.staff.late', 'Late'), String(c.lateDays), C.warning],
              [t('admin.staff.excused', 'Excused'), String(c.excusedDays), '#7C3AED'],
            ].map(([lbl, val, col], i, arr) => (
              <View key={lbl} style={{ flex: 1, alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 8, paddingVertical: 6, marginRight: i < arr.length - 1 ? 6 : 0 }}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: col }}>{val}</Text>
                <Text style={{ fontSize: 10, color: C.textMuted, fontWeight: '600' }}>{lbl}</Text>
              </View>
            ))}
          </View>

          <Divider mt={10} mb={8} />

          {/* Calculation result */}
          <View style={st.infoRow}>
            <Text style={st.infoKey}>{t('admin.staff.payrollDetails.basePay', 'Base Pay')}</Text>
            <Text style={st.infoVal}>{fmtMoney(c.base)}</Text>
          </View>

          <Divider mt={4} mb={8} />
          <View style={st.infoRow}>
            <Text style={{ fontWeight: '800', color: C.textDark, fontSize: 14 }}>{t('admin.staff.payrollDetails.netPay', 'Net Pay')}</Text>
            <Text style={{ fontWeight: '800', fontSize: 20, color: C.primary }}>
              {fmtMoney(c.net)}
            </Text>
          </View>
        </View>

        {/* ── Payments Made ── */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}><MaterialIcons name="payments" size={16} color={C.textDark} style={{ marginRight: 6 }} /><Text style={[st.sectionTitle, { marginTop: 0, marginBottom: 0 }]}>{t('admin.staff.payrollDetails.paymentsMade', 'Payments Made')}</Text></View>
          <TouchableOpacity
            style={{ backgroundColor: '#DCFCE7', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }}
            onPress={onAddPayment}
          >
            <Text style={{ color: C.success, fontWeight: '700', fontSize: 13 }}>{t('admin.staff.payrollDetails.addPayment', '+ Add')}</Text>
          </TouchableOpacity>
        </View>

        {/* Previously settled payments (before effectiveFrom) — shown greyed out */}
        {settledPayments.length > 0 && (
          <View style={{ marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
              <MaterialIcons name="check-circle" size={13} color={C.success} style={{ marginRight: 4 }} />
              <Text style={{ fontSize: 11, fontWeight: '700', color: C.success }}>Already settled</Text>
            </View>
            {settledPayments.map(p => (
              <View key={p.id} style={[st.card, { padding: 12, marginBottom: 6, opacity: 0.6, backgroundColor: '#F8FAFC' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: C.textMid }}>{fmtMoney(p.amount)}</Text>
                    <Text style={{ fontSize: 11, color: C.textMuted, marginTop: 1 }}>
                      {String(p.payment_date).split('T')[0]}  ·  {PAY_METHOD_LABELS[p.payment_method] || p.payment_method}
                    </Text>
                    {p.note && <Text style={{ fontSize: 11, color: C.textMuted, fontStyle: 'italic', marginTop: 1 }}>"{p.note}"</Text>}
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Current period payments (from effectiveFrom) — count toward remaining */}
        {currentPayments.length === 0 && settledPayments.length === 0 ? (
          <Text style={{ color: C.textMuted, fontSize: 13, marginBottom: 12 }}>{t('admin.staff.payrollDetails.noPayments', 'No payments recorded yet.')}</Text>
        ) : currentPayments.length === 0 ? (
          <Text style={{ color: C.textMuted, fontSize: 13, marginBottom: 12 }}>No new payments for this period.</Text>
        ) : (
          currentPayments.map(p => (
            <View key={p.id} style={[st.card, { padding: 12, marginBottom: 8 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: C.primary }}>{fmtMoney(p.amount)}</Text>
                  <Text style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
                    {String(p.payment_date).split('T')[0]}  ·  {PAY_METHOD_LABELS[p.payment_method] || p.payment_method}
                  </Text>
                  {p.note && <Text style={{ fontSize: 11, color: C.textMuted, fontStyle: 'italic', marginTop: 2 }}>"{p.note}"</Text>}
                </View>
                <TouchableOpacity
                  onPress={() => onEditPayment(p)}
                  style={{ backgroundColor: '#EFF6FF', borderRadius: 7, paddingHorizontal: 10, paddingVertical: 6, marginLeft: 8 }}
                >
                  <Text style={{ color: C.primary, fontWeight: '700', fontSize: 12 }}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setDialog({
                    title: 'Delete Payment',
                    message: `Remove ${fmtMoney(p.amount)} payment?`,
                    type: 'danger',
                    confirmLabel: 'Delete',
                    onConfirm: () => { setDialog(null); onDeletePayment(p.id); }
                  })}
                  style={{ backgroundColor: '#FEE2E2', borderRadius: 7, paddingHorizontal: 10, paddingVertical: 6, marginLeft: 6 }}
                >
                  <Text style={{ color: C.danger, fontWeight: '700', fontSize: 12 }}>Del</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}

        {/* Total paid / remaining strip */}
        <View style={{ backgroundColor: remaining <= 0 && (totalPaid > 0 || (effectiveFrom && effectiveFrom > period.to)) ? '#F0FDF4' : '#FFFBEB', borderRadius: 10, padding: 12, marginBottom: 4 }}>
          <View style={st.infoRow}>
            <Text style={{ fontWeight: '800', color: C.textDark }}>Total Paid</Text>
            <Text style={{ fontWeight: '800', color: C.success, fontSize: 16 }}>{fmtMoney(totalPaid)}</Text>
          </View>
          <View style={st.infoRow}>
            <Text style={{ color: C.textMuted, fontSize: 12 }}>Remaining</Text>
            <Text style={{ fontWeight: '700', color: remaining > 0 ? C.warning : C.success, fontSize: 13 }}>
              {fmtMoney(remaining)}
            </Text>
          </View>
          {remaining <= 0 && (totalPaid > 0 || (effectiveFrom && effectiveFrom > period.to)) && (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 4 }}>
              <MaterialIcons name="check-circle" size={14} color={C.success} style={{ marginRight: 4 }} />
              <Text style={{ color: C.success, fontWeight: '700', fontSize: 12 }}>Fully Paid</Text>
            </View>
          )}
        </View>

        {/* Attendance Records */}
        <Text style={st.sectionTitle}>{t('admin.staff.payrollDetails.attendanceRecords', 'Attendance Records')}</Text>
        {c.records.length === 0
          ? <Text style={{ color: C.textMuted }}>{t('admin.staff.payrollDetails.noRecords', 'No records in this period.')}</Text>
          : [...c.records].sort((a, b) => b.date.localeCompare(a.date)).map(r => {
            const col = STATUS_COLORS[r.status] || STATUS_COLORS.Present;
            const icon = r.status === 'Present' ? <MaterialIcons name='check' size={14} color={C.success} /> : r.status === 'Late' ? <MaterialIcons name='warning' size={14} color={C.warning} /> : r.status === 'Excused' ? <MaterialIcons name='circle' size={8} color={C.textMuted} /> : <MaterialIcons name='close' size={14} color={C.danger} />;
            return (
              <View key={r.id} style={[st.card, { marginBottom: 8, padding: 12 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '700', color: C.textDark, fontSize: 13 }}>{r.date}</Text>
                    {(r.status === 'Present' || r.status === 'Late') && (
                      <Text style={{ color: C.textMid, fontSize: 12 }}>
                        {r.clockIn} → {r.clockOut || '—'}{r.lateMin > 0 ? <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 4 }}><MaterialIcons name='warning' size={12} color={C.warning} style={{ marginRight: 2 }} /><Text>+{r.lateMin}min</Text></View> : ''}
                      </Text>
                    )}
                    {r.note && <Text style={{ fontSize: 11, color: C.textMuted, fontStyle: 'italic', marginTop: 2 }}>"{r.note}"</Text>}
                  </View>
                  <View style={{ backgroundColor: col.bg, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
                    <Text style={{ color: col.text, fontWeight: '700', fontSize: 12 }}>{icon} {r.status}</Text>
                  </View>
                </View>
              </View>
            );
          })
        }
      </ScrollView>
      <ConfirmDialog dialog={dialog} onClose={() => setDialog(null)} />
    </FullModal>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// STAFF CARD (Members tab)
// ══════════════════════════════════════════════════════════════════════════════
function StaffCard({ member, onPress }) {
  const susp = member.status === 'Suspended';
  return (
    <TouchableOpacity style={[st.card, susp && { opacity: 0.65 }]} onPress={onPress} activeOpacity={0.75}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={[st.avatar, { backgroundColor: ROLE_COLORS[member.role]?.bg || '#F1F5F9' }]}>
          <Text style={[st.avatarTxt, { color: ROLE_COLORS[member.role]?.text || '#475569' }]}>{member.name.charAt(0)}</Text>
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={st.cardName}>{member.name}</Text>
          <View style={{ flexDirection: 'row', marginTop: 4 }}>
            <RoleBadge role={member.role} small />
            {susp && (
              <View style={{ backgroundColor: '#FEF3C7', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2, marginLeft: 6 }}>
                <Text style={{ color: '#92400E', fontSize: 10, fontWeight: '700' }}>SUSPENDED</Text>
              </View>
            )}
          </View>
          <Text style={st.cardSub}>{member.phone}  ·  {member.shiftStart}–{member.shiftEnd}</Text>
        </View>
        {!['Admin', 'Owner', 'admin', 'owner'].includes(member.role) && (
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: C.primary }}>{fmtMoney(member.rate)}</Text>
          <Text style={{ fontSize: 11, color: C.textMuted }}>/{member.salaryType}</Text>
        </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ATTENDANCE CARD (Attendance tab) — shows today clock + period stats
//
// todayAtt  : local optimistic record { status, clockInMs, clockOutMs,
//             minutesLate, totalMinutes } — updated instantly on every action
// tick      : ever-incrementing int (1/s) that forces the live-timer to refresh
// ══════════════════════════════════════════════════════════════════════════════
function AttCard({ member, attendance, period, todayAtt, tick, onClockIn, onClockInLate, onClockOut, onMarkAbsent, onEditAtt }) {
  const { t } = useTranslation();
  const susp = member.status === 'Suspended';
  const isAdminRole = ['Admin', 'Owner', 'Manager'].includes(member.role);
  const isViewingToday = period.from === TODAY_STR;

  // ── For past dates, derive status from attendance records ──────────────
  // NOTE: We match only by staffId (not date) because the `attendance` array
  // is already filtered by the API for the selected date.  Matching by date
  // can fail when the emulator/device timezone differs from the server's,
  // causing normalizeShift to compute a date string that doesn't match attDate.
  const dayRec = !isViewingToday
    ? attendance.find(r => r.staffId === member.id)
    : null;

  // ── Today's state from local todayAttendance (always up-to-date immediately) ──
  let status, clockInMs, clockOutMs, minutesLate, clockInHHMM, clockOutHHMM, liveMins;

  if (isViewingToday) {
    status = todayAtt?.status || 'out';
    clockInMs = todayAtt?.clockInMs || null;
    clockOutMs = todayAtt?.clockOutMs || null;
    minutesLate = todayAtt?.minutesLate || 0;
    clockInHHMM = clockInMs ? formatTime(new Date(clockInMs)) : null;
    clockOutHHMM = clockOutMs ? formatTime(new Date(clockOutMs)) : null;
    liveMins = status === 'in' && clockInMs
      ? Math.max(0, Math.floor((Date.now() - clockInMs) / 60000))
      : status === 'done'
        ? (todayAtt?.totalMinutes || (clockInMs && clockOutMs
          ? Math.round((clockOutMs - clockInMs) / 60000) : 0))
        : 0;
  } else if (dayRec) {
    // Past date — derive from the attendance record
    const recStatus = (dayRec.status || '').toLowerCase();
    if (recStatus === 'absent') {
      status = 'absent';
    } else if (dayRec.clockOut) {
      status = 'done';
    } else if (dayRec.clockIn) {
      status = 'done'; // past day with clock-in but no clock-out — treat as done
    } else {
      status = 'out';
    }
    clockInMs = dayRec.clockIn ? new Date(dayRec.clockIn).getTime() : null;
    clockOutMs = dayRec.clockOut ? new Date(dayRec.clockOut).getTime() : null;
    minutesLate = dayRec.lateMin || 0;
    clockInHHMM = dayRec.clockIn ? dayRec.clockIn.split('T').pop()?.slice(0, 5) || formatTime(new Date(dayRec.clockIn)) : null;
    clockOutHHMM = dayRec.clockOut ? dayRec.clockOut.split('T').pop()?.slice(0, 5) || formatTime(new Date(dayRec.clockOut)) : null;
    liveMins = clockInMs && clockOutMs ? Math.round((clockOutMs - clockInMs) / 60000) : 0;
  } else {
    // Past date, no record
    status = 'no_record';
    clockInMs = null; clockOutMs = null; minutesLate = 0;
    clockInHHMM = null; clockOutHHMM = null; liveMins = 0;
  }

  // ── Period stats from API attendance array ──────────────────────────────
  // For single-day view: attendance array is already filtered by the API, so just match staffId.
  // For multi-day ranges (payroll): filter by date range.
  const isSingleDay = period.from === period.to;
  const periodRecs = isSingleDay
    ? attendance.filter(r => r.staffId === member.id)
    : (() => {
        const fromD = new Date(period.from);
        const toD = new Date(period.to);
        return attendance.filter(r => {
          if (r.staffId !== member.id) return false;
          const d = new Date(r.date);
          return d >= fromD && d <= toD;
        });
      })();
  const pPresent = periodRecs.filter(r => r.status === 'Present' || r.status === 'Late').length;
  const pAbsent = periodRecs.filter(r => r.status === 'Absent').length;
  const pLate = periodRecs.filter(r => r.lateMin > 0).length;
  const pHours = periodRecs.filter(r => r.status === 'Present' || r.status === 'Late')
    .reduce((s, r) => s + minutesBetween(r.clockIn, r.clockOut) / 60, 0);

  // Suppress tick warning — used only to trigger re-render for live timer
  void tick;

  return (
    <View style={[st.card, susp && { opacity: 0.5 }]}>
      {/* Member header */}
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={[st.avatar, { backgroundColor: ROLE_COLORS[member.role]?.bg || '#F1F5F9' }]}>
          <Text style={[st.avatarTxt, { color: ROLE_COLORS[member.role]?.text || '#475569' }]}>{member.name.charAt(0)}</Text>
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={st.cardName}>{member.name}</Text>
          <RoleBadge role={member.role} small />
        </View>
        <TouchableOpacity
          onPress={() => onEditAtt(member, period.from === period.to ? period.from : getToday())}
          style={{ padding: 6 }}
        >
          <MaterialIcons name="edit" size={18} color={C.primary} />
        </TouchableOpacity>
      </View>

      <Divider mt={10} mb={10} />

      {/* Today's clock section — exactly one mutually-exclusive state at a time */}
      {susp ? (
        /* ── Suspended ── */
        <Text style={{ textAlign: 'center', color: C.textMuted, fontSize: 13 }}>Suspended — no tracking</Text>

      ) : isAdminRole ? (
        /* ── Admin / Owner / Manager — no attendance tracking ── */
        <Text style={{ textAlign: 'center', color: C.textMuted, fontSize: 12 }}>No attendance tracking for this role</Text>

      ) : status === 'no_record' ? (
        /* ── Past date with no record ── */
        <View style={{ alignItems: 'center', paddingVertical: 8 }}>
          <View style={{ backgroundColor: '#F1F5F9', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 7 }}>
            <Text style={{ color: C.textMuted, fontWeight: '600', fontSize: 13 }}>No record</Text>
          </View>
        </View>

      ) : status === 'absent' ? (
        /* ── Marked absent — badge only ── */
        <View style={{ alignItems: 'center', paddingVertical: 4 }}>
          <View style={{ backgroundColor: '#FEE2E2', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 7 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}><MaterialIcons name="block" size={14} color={C.danger} style={{ marginRight: 4 }} /><Text style={{ color: C.danger, fontWeight: '800', fontSize: 13, letterSpacing: 0.5 }}>ABSENT</Text></View>
          </View>
        </View>

      ) : status === 'done' ? (
        /* ── Shift complete — in/out times + total hours ── */
        <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 11, color: C.textMuted, fontWeight: '600', marginBottom: 3 }}>Clocked In</Text>
            <Text style={{ fontSize: 16, fontWeight: '800', color: C.textDark }}>{clockInHHMM || '—'}</Text>
            {minutesLate > 0 && <Text style={{ color: C.warning, fontSize: 10, fontWeight: '600', marginTop: 2 }}>+{minutesLate}min late</Text>}
          </View>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 11, color: C.textMuted, fontWeight: '600', marginBottom: 3 }}>Clocked Out</Text>
            <Text style={{ fontSize: 16, fontWeight: '800', color: C.textDark }}>{clockOutHHMM || '—'}</Text>
          </View>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 11, color: C.textMuted, fontWeight: '600', marginBottom: 3 }}>Total</Text>
            <View style={{ backgroundColor: '#DCFCE7', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}><MaterialIcons name="check" size={13} color={C.success} style={{ marginRight: 2 }} /><Text style={{ fontSize: 13, fontWeight: '800', color: C.success }}>{fmtDuration(liveMins)}</Text></View>
            </View>
          </View>
        </View>

      ) : status === 'in' ? (
        /* ── Currently clocked in — live timer + Clock Out button ── */
        <View style={{ flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' }}>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 11, color: C.textMuted, fontWeight: '600', marginBottom: 3 }}>Clocked In</Text>
            <Text style={{ fontSize: 16, fontWeight: '800', color: C.textDark }}>{clockInHHMM || '—'}</Text>
            {minutesLate > 0
              ? <Text style={{ color: C.warning, fontSize: 10, fontWeight: '600', marginTop: 2 }}>+{minutesLate}min late</Text>
              : <Text style={{ color: C.success, fontSize: 10, fontWeight: '600', marginTop: 2 }}>On time</Text>
            }
          </View>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 11, color: C.textMuted, fontWeight: '600', marginBottom: 3 }}>Duration</Text>
            <View style={{ backgroundColor: '#EFF6FF', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: C.primary }}>{fmtDuration(liveMins)}</Text>
            </View>
          </View>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 11, color: C.textMuted, fontWeight: '600', marginBottom: 3 }}>Action</Text>
            <TouchableOpacity
              style={{ backgroundColor: '#FEE2E2', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8 }}
              onPress={() => onClockOut(member)}
            >
              <Text style={{ color: C.danger, fontWeight: '700', fontSize: 12 }}>Clock Out</Text>
            </TouchableOpacity>
          </View>
        </View>

      ) : isViewingToday ? (
        /* ── Not started today — Clock In | Late | Absent ── */
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: '#DCFCE7', borderRadius: 8, paddingVertical: 8, alignItems: 'center' }}
            onPress={() => onClockIn(member)}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <MaterialIcons name="check" size={13} color={C.success} style={{ marginRight: 4 }} />
              <Text style={{ color: C.success, fontWeight: '700', fontSize: 13 }}>{t('admin.staff.clockIn', 'Clock In')}</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: '#FEF3C7', borderRadius: 8, paddingVertical: 8, alignItems: 'center' }}
            onPress={() => onClockInLate(member)}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <MaterialIcons name="schedule" size={13} color={C.warning} style={{ marginRight: 4 }} />
              <Text style={{ color: C.warning, fontWeight: '700', fontSize: 13 }}>{t('admin.staff.late', 'Late')}</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: '#FEE2E2', borderRadius: 8, paddingVertical: 8, alignItems: 'center' }}
            onPress={() => onMarkAbsent(member)}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <MaterialIcons name="close" size={13} color={C.danger} style={{ marginRight: 4 }} />
              <Text style={{ color: C.danger, fontWeight: '700', fontSize: 13 }}>{t('admin.staff.absent', 'Absent')}</Text>
            </View>
          </TouchableOpacity>
        </View>
      ) : (
        /* ── Past date, no record ── */
        <View style={{ alignItems: 'center', paddingVertical: 8 }}>
          <View style={{ backgroundColor: '#F1F5F9', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 7 }}>
            <Text style={{ color: C.textMuted, fontWeight: '600', fontSize: 13 }}>No record</Text>
          </View>
        </View>
      )}

      {/* Period stats strip */}
      {periodRecs.length > 0 && (
        <View style={st.periodStrip}>
          {isSingleDay
            ? <Text style={st.periodStripTxt}>
              {period.from}  ·  {pPresent ? `Present${pLate ? ' (+' + pLate + ' late)' : ''}` : pAbsent ? 'Absent' : 'No record'}
            </Text>
            : (
              <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
                {[
                  [`${pPresent}d`, t('admin.staff.present', 'Present'), C.success],
                  [`${pAbsent}d`, t('admin.staff.absent', 'Absent'), C.danger],
                  [`${pLate}d`, t('admin.staff.late', 'Late'), C.warning],
                  [`${Math.round(pHours)}h`, t('admin.staff.summary.hours', 'Hours'), C.primary],
                ].map(([val, lbl, col]) => (
                  <View key={lbl} style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: col }}>{val}</Text>
                    <Text style={{ fontSize: 9, color: C.textMuted, fontWeight: '600' }}>{lbl}</Text>
                  </View>
                ))}
              </View>
            )
          }
        </View>
      )}
    </View>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PAYROLL CARD
// ══════════════════════════════════════════════════════════════════════════════
function PayrollCard({ member, calc, debtCalc, effectiveFrom, periodFrom, periodTo, paidInPeriod = 0, paidInDisplayPeriod = 0, onPayNow, onDetails }) {
  const { t } = useTranslation();
  // calc = fullPayCalcs (current period — always has data for display)
  // debtCalc = payCalcs (effectiveFrom-based — kept for display grouping only)
  //
  // Remaining uses period-based formula: full period earnings vs in-period payments.
  // This fixes overpayments made on the last payment date not registering as credit.
  let remaining, isFullyPaid;
  if (effectiveFrom > periodTo) {
    // Employee's last payment covers past this period — fully settled
    remaining = 0;
    isFullyPaid = calc.net > 0;
  } else {
    remaining = Math.max(0, calc.net - paidInDisplayPeriod);
    isFullyPaid = paidInDisplayPeriod >= calc.net && calc.net > 0;
  }
  return (
    <View style={st.card}>
      {/* Header: Avatar + Name/Role | Net Pay */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
        <View style={[st.avatar, { backgroundColor: ROLE_COLORS[member.role]?.bg || '#F1F5F9' }]}>
          <Text style={[st.avatarTxt, { color: ROLE_COLORS[member.role]?.text || '#475569' }]}>{member.name.charAt(0)}</Text>
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={st.cardName}>{member.name}</Text>
          <RoleBadge role={member.role} small />
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: C.textDark }}>{fmtMoney(calc.net)}</Text>
          <Text style={{ fontSize: 10, color: C.textMuted }}>net pay</Text>
        </View>
      </View>

      {/* Stats row: Present | Absent | Late | Hours */}
      <View style={{ flexDirection: 'row', marginBottom: 12 }}>
        {[[t('admin.staff.present', 'Present'), String(calc.presentDays), C.success], [t('admin.staff.absent', 'Absent'), String(calc.absentDays), C.danger], [t('admin.staff.late', 'Late'), String(calc.lateDays), C.warning], [t('admin.staff.summary.hours', 'Hours'), `${calc.totalHours}`, C.primary]].map(([l, v, col]) => (
          <View key={l} style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 10, color: C.textMuted, fontWeight: '600', marginBottom: 2 }}>{l}</Text>
            <Text style={{ fontSize: 14, fontWeight: '800', color: col }}>{v}</Text>
          </View>
        ))}
      </View>

      {/* Status strip */}
      {calc.net > 0 && (
        <View style={{ backgroundColor: isFullyPaid ? '#F0FDF4' : '#FEFCE8', borderRadius: 8, paddingVertical: 7, paddingHorizontal: 12, marginBottom: 12, alignItems: 'center' }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: isFullyPaid ? '#15803D' : '#A16207' }}>
            {isFullyPaid ? 'FULLY PAID' : `REMAINING: ${fmtMoney(remaining)}`}
          </Text>
        </View>
      )}

      {/* Action buttons */}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: isFullyPaid ? '#F1F5F9' : '#F0FDF4', borderRadius: 8, paddingVertical: 9, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' }}
          onPress={onPayNow}
        >
          <MaterialIcons name="payments" size={13} color={isFullyPaid ? C.textMuted : '#15803D'} style={{ marginRight: 4 }} />
          <Text style={{ color: isFullyPaid ? C.textMuted : '#15803D', fontWeight: '700', fontSize: 12 }}>{t('admin.staff.payNow', 'Pay Now')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: '#EFF6FF', borderRadius: 8, paddingVertical: 9, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' }}
          onPress={onDetails}
        >
          <MaterialIcons name="bar-chart" size={13} color={C.primary} style={{ marginRight: 4 }} />
          <Text style={{ color: C.primary, fontWeight: '700', fontSize: 12 }}>{t('admin.staff.details', 'Details')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════
export default function AdminStaff() {
  const { t } = useTranslation();
  const [tab, setTab] = useState('members');
  const [staff, setStaff] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [selMember, setSelMember] = useState(null);
  const [dialog, setDialog] = useState(null);

  // ── Attendance date (single day) ────────────────────────────────────────
  const [attDate, setAttDate] = useState(TODAY_STR);
  const [showAttCalendar, setShowAttCalendar] = useState(false);

  // ── Payroll period state ───────────────────────────────────────────────
  const [period, setPeriod] = useState({
    from: fmtDate(new Date(today.getFullYear(), today.getMonth(), 1)),
    to: TODAY_STR,
  });
  const [showCalendar, setShowCalendar] = useState(false);

  // ── Local today-attendance map for instant optimistic UI updates ──────────
  // Shape: { [staffId]: { status:'in'|'out'|'absent'|'done',
  //                       clockInMs: number|null, clockOutMs: number|null,
  //                       minutesLate: number, totalMinutes: number } }
  const [todayAttendance, setTodayAttendance] = useState({});

  // ── AsyncStorage key for today's attendance (date-keyed so old days auto-expire) ──
  const todayAttKey = '@todayAtt_' + getToday();

  // ── Persist today-attendance to AsyncStorage whenever it changes ──────────
  // Call this after every meaningful setTodayAttendance so the state survives
  // app restarts, Metro hot reloads, and any component remounts.
  const saveTodayAtt = useCallback((next) => {
    AsyncStorage.setItem('@todayAtt_' + getToday(), JSON.stringify(next)).catch(() => {});
  }, []);

  // ── Restore persisted today-attendance on mount (before API seed) ─────────
  // This ensures the clocked-in state is visible immediately on app start,
  // before the API finishes loading. The one-shot seed below will later merge
  // in confirmed API records on top of this restored state.
  useEffect(() => {
    AsyncStorage.getItem(todayAttKey)
      .then(json => {
        if (!json) return;
        const stored = JSON.parse(json);
        if (stored && typeof stored === 'object' && Object.keys(stored).length > 0) {
          setTodayAttendance(prev =>
            Object.keys(prev).length === 0 ? stored : prev
          );
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // only on mount

  // Increments every second — passed as prop to AttCard to drive live timers
  const [tick, setTick] = useState(0);

  const [payrollConfig] = useState({ workingDaysPerWeek: WORKING_DAYS_PER_WEEK });

  // ── Initialization guards (useRef = NOT state, never causes re-renders) ────
  // todayAttSeeded: set to true after the first post-load seed so the
  //   attendance-sync effect never overwrites todayAttendance again.
  const todayAttSeeded = React.useRef(false);
  // lastResetDate: stores the date string of the last daily reset so we never
  //   clear todayAttendance twice on the same calendar day.
  const lastResetDate = React.useRef('');

  // payments state
  const [payments, setPayments] = useState([]);
  const [allPayments, setAllPayments] = useState([]); // all staff payments in current period
  const [lastPaymentRows, setLastPaymentRows] = useState([]); // latest payment per employee (all-time)
  const [payrollAttendance, setPayrollAttendance] = useState([]); // extended attendance for payroll (may reach back before period.from)
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null); // null = add new

  // attendance edit state
  const [showAttEdit, setShowAttEdit] = useState(false);
  const [attEditMember, setAttEditMember] = useState(null);
  const [attEditDate, setAttEditDate] = useState(TODAY_STR);

  // modals
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showPayNow, setShowPayNow] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  // ── API loaders ───────────────────────────────────────────────────────────
  const loadStaff = useCallback(async () => {
    try {
      const res = await usersAPI.getAll();
      setStaff((res.data || []).map(normalizeUser));
    } catch (e) {
      console.error('loadStaff:', e.message);
    }
  }, []);

  const loadAttendance = useCallback(async (from, to) => {
    try {
      const res = await shiftsAPI.getAll({ from, to });
      setAttendance((res.data || []).map(normalizeShift));
    } catch (e) {
      console.error('loadAttendance:', e.message);
    }
  }, []);

  // Load extended attendance for payroll — reaches back to earliest effectiveFrom
  const loadPayrollAttendance = useCallback(async (from, to) => {
    try {
      const res = await shiftsAPI.getAll({ from, to });
      setPayrollAttendance((res.data || []).map(normalizeShift));
    } catch (e) {
      console.error('loadPayrollAttendance:', e.message);
    }
  }, []);

  const loadPayments = useCallback(async (userId) => {
    if (!userId) return;
    try {
      // Load ALL payments for this user (no date filter) so the PayrollDetailsModal
      // shows every payment regardless of which period is selected
      const res = await staffPaymentsAPI.getAll({ user_id: userId });
      setPayments(res.data || []);
    } catch (e) {
      console.error('loadPayments:', e.message);
      setPayments([]);
    }
  }, []);

  // Loads ALL staff payments for the period (no user_id filter) — used to
  // compute per-card paid/remaining totals on the Payroll tab.
  const loadAllPayments = useCallback(async (from, to) => {
    try {
      const res = await staffPaymentsAPI.getAll({ from, to });
      setAllPayments(res.data || []);
    } catch (e) {
      console.error('loadAllPayments:', e.message);
      setAllPayments([]);
    }
  }, []);

  // Loads the single most-recent payment per employee (all-time, no date filter).
  // Drives per-employee period auto-reset: new period starts the day after last payment.
  const loadLatestPayments = useCallback(async () => {
    try {
      const res = await staffPaymentsAPI.getLatest();
      setLastPaymentRows(res.data || []);
    } catch (e) {
      console.error('loadLatestPayments:', e.message);
      setLastPaymentRows([]);
    }
  }, []);

  // Initial load
  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadStaff(), loadAttendance(attDate, attDate), loadLatestPayments()]);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pull-to-refresh handler
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadStaff(), loadAttendance(attDate, attDate), loadLatestPayments()]);
    } catch (_) {}
    setRefreshing(false);
  }, [attDate, loadStaff, loadAttendance, loadLatestPayments]);

  // Reload attendance whenever attDate changes (attendance tab uses single day)
  useEffect(() => {
    loadAttendance(attDate, attDate);
  }, [attDate, loadAttendance]);

  // Seed todayAttendance from API data — runs at most ONCE per calendar day.
  //
  // WHY a ref-guarded one-shot instead of syncing on every attendance reload:
  //   After every clockIn/clockOut the component calls loadAttendance(), which
  //   updates `attendance` state.  A naive useEffect([attendance]) would fire
  //   after every reload and overwrite the just-applied optimistic update,
  //   causing the 1-second revert bug (optimistic update visible → API returns
  //   → effect fires → state stomped back to API snapshot).
  //
  //   The fix: seed exactly once (after the initial page load), then never
  //   touch todayAttendance from here again.  All subsequent changes come
  //   exclusively from the clockIn / clockOut / markAbsent handlers.
  useEffect(() => {
    const todayStr = getToday();

    // ── Daily reset ────────────────────────────────────────────────────────
    // If the calendar date has changed since the last reset, clear today's
    // attendance so the new day starts fresh and re-seeding is allowed.
    if (lastResetDate.current && lastResetDate.current !== todayStr) {
      lastResetDate.current = todayStr;
      todayAttSeeded.current = false;      // allow one new seed for today
      setTodayAttendance({});
      return; // don't seed yet — wait for the next attendance reload
    }

    // ── One-shot seed ──────────────────────────────────────────────────────
    // Already seeded today → do nothing; let optimistic updates own the state
    if (todayAttSeeded.current) return;

    // Wait until the initial loading spinner is gone before seeding.
    // This ensures we seed from real data, not an empty interim array.
    if (loading) return;

    // Mark as seeded immediately to prevent any concurrent/queued effect
    // invocation from running the seed block a second time.
    todayAttSeeded.current = true;
    lastResetDate.current = todayStr;

    // Build initial todayAttendance snapshot from today's API records
    const initial = {};
    attendance.forEach(r => {
      if (r.date !== todayStr) return;
      let clockInMs = null, clockOutMs = null;
      if (r.clockIn) {
        const [h, m] = r.clockIn.split(':').map(Number);
        const d = new Date(); d.setHours(h, m, 0, 0);
        clockInMs = d.getTime();
      }
      if (r.clockOut) {
        const [h, m] = r.clockOut.split(':').map(Number);
        const d = new Date(); d.setHours(h, m, 0, 0);
        clockOutMs = d.getTime();
      }
      const status = (r.status === 'Absent' || r.status === 'Excused') ? 'absent'
        : r.clockOut ? 'done'
          : r.clockIn ? 'in'
            : 'out';
      if (status !== 'out') {
        initial[r.staffId] = {
          status,
          clockInMs,
          clockOutMs,
          minutesLate: r.lateMin || 0,
          totalMinutes: clockInMs && clockOutMs
            ? Math.round((clockOutMs - clockInMs) / 60000) : 0,
        };
      }
    });
    // Merge-write: apply every API record on top of the existing local state
    // instead of replacing the whole object.  This preserves any in-flight
    // optimistic updates for OTHER staff members that haven't been confirmed
    // by the server yet (e.g. a concurrent clockIn still awaiting its response).
    setTodayAttendance(prev => {
      const next = { ...prev };
      Object.keys(initial).forEach(id => {
        next[id] = initial[id]; // API record wins for confirmed staff
      });
      // Persist the API-confirmed state so it survives app restarts
      AsyncStorage.setItem('@todayAtt_' + todayStr, JSON.stringify(next)).catch(() => {});
      return next;
    });
    // attendance in deps so this fires when the initial load completes;
    // loading in deps so it fires again once loading flips to false.
    // The todayAttSeeded ref prevents any re-run from doing anything harmful.
  }, [attendance, loading]);

  // Live 1-second tick — drives the running-timer display in every AttCard
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const filtered = (search
    ? staff.filter(m => m.name.toLowerCase().includes(search.toLowerCase()) || m.role.toLowerCase().includes(search.toLowerCase()))
    : staff
  ).sort((a, b) => {
    const bottomRoles = ['Admin', 'Owner', 'admin', 'owner'];
    const aBottom = bottomRoles.includes(a.role) ? 1 : 0;
    const bBottom = bottomRoles.includes(b.role) ? 1 : 0;
    return aBottom - bBottom;
  });

  // Per-employee payment data:
  //   effectiveFrom  — day after their last ever payment, or a lookback date for never-paid staff
  //   paidInPeriod   — sum of payments made ON/AFTER effectiveFrom (i.e. in the new period)
  //   lastPaidDate   — raw date of most recent payment (for display)
  const paymentDataByUser = useMemo(() => {
    // Build last-payment-date map from the all-time snapshot
    const lastPaidMap = {};
    lastPaymentRows.forEach(r => {
      lastPaidMap[r.user_id] = r.payment_date ? String(r.payment_date).split('T')[0] : null;
    });

    // For staff who have NEVER been paid, reach back 6 months to capture unpaid debt.
    // This ensures debt from previous months is always visible.
    const lookbackDate = (() => {
      const d = new Date();
      d.setMonth(d.getMonth() - 6);
      d.setDate(1); // start of the month 6 months ago
      return fmtDate(d);
    })();

    const out = {};
    staff.forEach(m => {
      const lastPaidDate = lastPaidMap[m.id] || null;

      let effectiveFrom;
      if (lastPaidDate) {
        // Day after last payment — reaches back to capture unpaid work since then
        effectiveFrom = nextDay(lastPaidDate);
      } else {
        // Never paid — reach back to capture all unpaid historical work
        effectiveFrom = lookbackDate < period.from ? lookbackDate : period.from;
      }

      // Only count payments made in the NEW effective window (not the already-settled one)
      const paidInPeriod = allPayments
        .filter(p => String(p.user_id) === m.id && String(p.payment_date).split('T')[0] >= effectiveFrom)
        .reduce((s, p) => s + parseFloat(p.amount || 0), 0);

      // Period-based: payments whose payment_date falls within the selected period
      const paidInDisplayPeriod = allPayments
        .filter(p => {
          if (String(p.user_id) !== m.id) return false;
          const pd = String(p.payment_date).split('T')[0];
          return pd >= period.from && pd <= period.to;
        })
        .reduce((s, p) => s + parseFloat(p.amount || 0), 0);

      out[m.id] = { effectiveFrom, paidInPeriod, paidInDisplayPeriod, lastPaidDate };
    });
    return out;
  }, [staff, lastPaymentRows, allPayments, period]);

  // Merge regular attendance with extended payroll attendance (for debt carry-over).
  // De-duplicate by record id to avoid double-counting.
  const mergedAttendance = useMemo(() => {
    if (!payrollAttendance.length) return attendance;
    const seen = new Set();
    const merged = [];
    [...attendance, ...payrollAttendance].forEach(r => {
      const key = r.id || `${r.staffId}-${r.date}`;
      if (!seen.has(key)) { seen.add(key); merged.push(r); }
    });
    return merged;
  }, [attendance, payrollAttendance]);

  // PayrollCard / PayNowModal: uses the effective (post-payment) period per employee
  // Uses mergedAttendance so it can reach back to unpaid periods before period.from.
  const payCalcs = useMemo(() => {
    const out = {};
    staff.forEach(m => {
      const ef = paymentDataByUser[m.id]?.effectiveFrom || period.from;
      out[m.id] = calcPayroll(m, mergedAttendance, ef, period.to, payrollConfig);
    });
    return out;
  }, [staff, mergedAttendance, period, paymentDataByUser, payrollConfig]);

  // PayrollDetailsModal: always uses the full calendar period so audit shows
  // every attendance record and the total earned — regardless of payments made.
  // Uses mergedAttendance (not just attendance) so it has full period data.
  const fullPayCalcs = useMemo(() => {
    const out = {};
    staff.forEach(m => { out[m.id] = calcPayroll(m, mergedAttendance, period.from, period.to, payrollConfig); });
    return out;
  }, [staff, mergedAttendance, period, payrollConfig]);

  // Attendance stats — adapts to selected date.
  // When viewing today: uses todayAttendance (instant optimistic updates).
  // When viewing a past date: uses the attendance array from the API.
  const attStats = useMemo(() => {
    const trackable = staff.filter(m =>
      !['Admin', 'Owner', 'Manager'].includes(m.role) && m.status !== 'Suspended'
    );
    const isViewingToday = attDate === TODAY_STR;
    let present = 0, absent = 0, late = 0;

    if (isViewingToday) {
      trackable.forEach(m => {
        const att = todayAttendance[m.id];
        if (att?.status === 'in' || att?.status === 'done') {
          present++;
          if ((att.minutesLate || 0) > 0) late++;
        } else if (att?.status === 'absent') {
          absent++;
        }
      });
    } else {
      // Past date — derive from attendance array (already filtered by API for attDate)
      trackable.forEach(m => {
        const rec = attendance.find(r => r.staffId === m.id);
        if (rec) {
          const recSt = (rec.status || '').toLowerCase();
          if (recSt === 'absent') {
            absent++;
          } else {
            present++;
            if (rec.lateMin > 0) late++;
          }
        }
      });
    }

    return { present, absent, late, total: trackable.length };
  }, [staff, todayAttendance, attDate, attendance]);

  // Reload all-staff payment totals + latest-payment anchors whenever
  // the payroll tab is shown or the period changes.
  // Load payments from 6 months back to cover debt carry-over window.
  useEffect(() => {
    if (tab === 'payroll') {
      const d = new Date();
      d.setMonth(d.getMonth() - 6);
      d.setDate(1);
      const extFrom = fmtDate(d) < period.from ? fmtDate(d) : period.from;
      loadAllPayments(extFrom, period.to);
      loadLatestPayments();
    }
  }, [tab, period, loadAllPayments, loadLatestPayments]);

  // When on payroll tab, load extended attendance reaching back to earliest
  // effectiveFrom so unpaid work from previous months shows as debt.
  // Also accounts for never-paid staff by using a 6-month lookback.
  useEffect(() => {
    if (tab !== 'payroll' || !staff.length) return;
    // Find earliest effectiveFrom across all staff
    const lastPaidMap = {};
    lastPaymentRows.forEach(r => {
      lastPaidMap[r.user_id] = r.payment_date ? String(r.payment_date).split('T')[0] : null;
    });

    // 6-month lookback for never-paid staff
    const lookbackDate = (() => {
      const d = new Date();
      d.setMonth(d.getMonth() - 6);
      d.setDate(1);
      return fmtDate(d);
    })();

    let earliest = period.from;
    staff.forEach(m => {
      const lp = lastPaidMap[m.id];
      if (lp) {
        const dayAfter = nextDay(lp);
        if (dayAfter < earliest) earliest = dayAfter;
      } else {
        // Never paid — use lookback date
        if (lookbackDate < earliest) earliest = lookbackDate;
      }
    });
    // Only load extended range if we need to go back before period.from
    if (earliest < period.from) {
      loadPayrollAttendance(earliest, period.to);
    } else {
      setPayrollAttendance([]); // no extended data needed
    }
  }, [tab, lastPaymentRows, staff, period, loadPayrollAttendance]);

  // ── handlers ──────────────────────────────────────────────────────────────
  const addStaff = async (d) => {
    try {
      // 1. Create the user account (name, email, password, phone, role)
      const loginEmail = d.email || `${Date.now()}@staff.local`;
      const createRes = await usersAPI.create({
        name: d.name,
        email: loginEmail,
        password: d.password,
        phone: d.phone,
        role: d.role.toLowerCase(),
      });
      // 2. Update salary + shift times — must include name/phone/role too
      //    because the PUT route overwrites all columns (no partial update).
      const newId = createRes.data?.id;
      if (newId) {
        await usersAPI.update(newId, {
          name: d.name,
          phone: d.phone,
          role: d.role.toLowerCase(),
          salary: d.rate,
          salary_type: d.salaryType.toLowerCase(),
          shift_start: d.shiftStart,
          shift_end: d.shiftEnd,
          kitchen_station: d.role.toLowerCase() === 'kitchen' ? (d.kitchen_station || null) : null,
        });
      }
      await loadStaff();
      // Show the login credentials to the admin so they can share them with the new staff member
      setDialog({
        title: 'Staff Added',
        message: `${d.name} has been added.\n\nShare these login credentials:\n\n📱 Phone: ${d.phone}\n${d.email ? `📧 Email: ${d.email}\n` : `📧 Login email: ${loginEmail}\n`}🔑 Password: ${d.password}`,
        type: 'success'
      });
    } catch (e) {
      setDialog({ title: 'Error', message: e.response?.data?.error || e.message, type: 'error' });
    }
  };

  const editInfo = async (d) => {
    try {
      await usersAPI.update(selMember.id, {
        name: d.name,
        phone: d.phone,
        role: d.role.toLowerCase(),
        is_active: d.status !== 'Suspended',
        salary: d.rate,
        salary_type: d.salaryType.toLowerCase(),
        shift_start: d.shiftStart,
        shift_end: d.shiftEnd,
        kitchen_station: d.role.toLowerCase() === 'kitchen' ? (d.kitchen_station || null) : null,
      });
      await loadStaff();
    } catch (e) {
      setDialog({ title: 'Error', message: e.response?.data?.error || e.message, type: 'error' });
    }
  };

  const editLogin = async (d) => {
    try {
      await usersAPI.updateCredentials(selMember.id, {
        ...(d.email ? { email: d.email } : {}),
        ...(d.password ? { password: d.password } : {}),
        ...(d.confirm_password ? { confirm_password: d.confirm_password } : {}),
      });
      await loadStaff();
    } catch (e) {
      setDialog({ title: 'Error', message: e.response?.data?.error || e.message, type: 'error' });
    }
  };

  const deleteStaff = async (id) => {
    try {
      await usersAPI.delete(id);
      await loadStaff();
    } catch (e) {
      setDialog({ title: 'Error', message: e.response?.data?.error || e.message, type: 'error' });
    }
  };

  const toggleStatus = async (member) => {
    try {
      await usersAPI.update(member.id, {
        is_active: member.status === 'Suspended',
      });
      await loadStaff();
    } catch (e) {
      setDialog({ title: 'Error', message: e.response?.data?.error || e.message, type: 'error' });
    }
  };

  const clockIn = async (member, forceStatus) => {
    const nowMs = Date.now();
    const currentTodayStr = getToday();

    // Guard: if already clocked in per local state, do nothing (prevents double-tap)
    const existing = todayAttendance[member.id];
    if (existing?.status === 'in' || existing?.status === 'done') return;

    // Compute lateness vs scheduled shift start (overridden if forceStatus='late')
    let minutesLate = 0;
    if (forceStatus === 'late') {
      minutesLate = 1; // mark as late regardless
    } else if (member.shiftStart) {
      const [sh, sm] = member.shiftStart.split(':').map(Number);
      const now = new Date(nowMs);
      minutesLate = Math.max(0, now.getHours() * 60 + now.getMinutes() - (sh * 60 + sm));
    }

    // ── INSTANT optimistic update — button flips to Clock Out immediately ──
    setTodayAttendance(prev => {
      const next = { ...prev, [member.id]: { status: 'in', clockInMs: nowMs, clockOutMs: null, minutesLate, totalMinutes: 0 } };
      saveTodayAtt(next);
      return next;
    });

    try {
      const scheduled = member.shiftStart
        ? `${currentTodayStr}T${member.shiftStart}:00`
        : undefined;
      await shiftsAPI.clockIn({
        user_id: member.id,
        hourly_rate: member.rate,
        scheduled_start_time: scheduled,
        ...(forceStatus && { status: forceStatus }),
      });
      // Reload through today so the confirmed record enters attendance state
      const freshToday = getToday();
      const reloadTo = attDate < freshToday ? freshToday : attDate;
      await loadAttendance(attDate, reloadTo);
    } catch (e) {
      const msg = e.response?.data?.error || e.message || '';

      if (msg.toLowerCase().includes('already clocked in')) {
        // ── Staff is ALREADY clocked in on the server ──────────────────────
        todayAttSeeded.current = false;
        const freshToday = getToday();
        const reloadTo = attDate < freshToday ? freshToday : attDate;
        await loadAttendance(attDate, reloadTo);
      } else {
        // ── Genuine error — revert optimistic update and show alert ─────────
        setTodayAttendance(prev => {
          const next = { ...prev };
          if (!existing) delete next[member.id];
          else next[member.id] = existing;
          return next;
        });
        setDialog({ title: 'Clock-In Error', message: msg, type: 'error' });
      }
    }
  };

  // Clock in as LATE — forces status='late' on the backend
  const clockInLate = (member) => clockIn(member, 'late');

  const clockOut = async (member) => {
    const nowMs = Date.now();
    const prevRec = todayAttendance[member.id];
    const totalMinutes = prevRec?.clockInMs
      ? Math.round((nowMs - prevRec.clockInMs) / 60000) : 0;

    // ── INSTANT optimistic update — timer stops, DONE badge shows ──
    setTodayAttendance(prev => {
      const next = { ...prev, [member.id]: { ...prev[member.id], status: 'done', clockOutMs: nowMs, totalMinutes } };
      saveTodayAtt(next);
      return next;
    });

    try {
      await shiftsAPI.adminClockOut(member.id);
      const freshToday = getToday();
      const reloadTo = attDate < freshToday ? freshToday : attDate;
      await loadAttendance(attDate, reloadTo);
    } catch (e) {
      // Revert optimistic update on API error
      setTodayAttendance(prev => ({
        ...prev,
        [member.id]: prevRec || {},
      }));
      setDialog({ title: 'Clock-Out Error', message: e.response?.data?.error || e.message, type: 'error' });
    }
  };

  const markAbsent = (member) => {
    setDialog({
      title: 'Mark Absent',
      message: `Mark ${member.name} as absent today?`,
      type: 'danger',
      confirmLabel: 'Mark Absent',
      onConfirm: async () => {
        setDialog(null);
        const prevRec = todayAttendance[member.id];

        // ── INSTANT optimistic update — ABSENT badge shows immediately ──
        setTodayAttendance(prev => {
          const next = { ...prev, [member.id]: { status: 'absent', clockInMs: null, clockOutMs: null, minutesLate: 0, totalMinutes: 0 } };
          saveTodayAtt(next);
          return next;
        });

        const currentTodayStr = getToday();
        try {
          await shiftsAPI.createManualShift({
            user_id: member.id,
            date: currentTodayStr,
            status: 'absent',
            clock_in: null,
            clock_out: null,
            note: 'Marked absent by admin',
          });
        } catch (e) {
          if (e.response?.status === 409 && e.response?.data?.existing_id) {
            await shiftsAPI.updateShift(e.response.data.existing_id, {
              status: 'absent',
              note: 'Marked absent by admin',
            });
          } else {
            // Revert optimistic update on API error
            setTodayAttendance(prev => ({
              ...prev,
              [member.id]: prevRec || {},
            }));
            setDialog({ title: 'Error', message: e.response?.data?.error || e.message, type: 'error' });
            return;
          }
        }
        const freshToday = getToday();
        const reloadTo = attDate < freshToday ? freshToday : attDate;
        await loadAttendance(attDate, reloadTo);
      }
    });
  };

  // Map PayNowModal display labels → valid DB payment_method values
  const PAY_METHOD_DB = {
    'Cash': 'cash',
    'Bank Transfer': 'bank_transfer',
    'Card': 'other',
    'Check': 'check',
  };

  const payNow = async (member, method) => {
    const calc = fullPayCalcs[member.id]; // period-based earnings
    if (!calc) return;
    const paidAlready = paymentDataByUser[member.id]?.paidInDisplayPeriod || 0; // period-based paid
    const amountDue = Math.max(0, calc.net - paidAlready);
    if (amountDue <= 0) return;
    const effectiveFrom = paymentDataByUser[member.id]?.effectiveFrom || period.from;
    try {
      await staffPaymentsAPI.create({
        user_id: member.id,
        amount: amountDue,
        payment_method: PAY_METHOD_DB[method] || 'cash',
        payment_date: TODAY_STR,
        note: `Payroll ${effectiveFrom} – ${period.to}`,
      });
      // Refresh: per-member Details list, all-staff period totals, and latest-payment anchors
      // Extend loadAllPayments back 6 months to keep debt data intact
      const ext = new Date(); ext.setMonth(ext.getMonth() - 6); ext.setDate(1);
      const extFrom = fmtDate(ext) < period.from ? fmtDate(ext) : period.from;
      await Promise.all([
        loadPayments(member.id),
        loadAllPayments(extFrom, period.to),
        loadLatestPayments(),
      ]);
      setDialog({ title: 'Payment Confirmed', message: `${fmtMoney(amountDue)} paid to ${member.name} via ${method}`, type: 'success' });
    } catch (e) {
      setDialog({ title: 'Payment Error', message: e.response?.data?.error || e.message, type: 'error' });
    }
  };

  // ── Attendance edit handler ───────────────────────────────────────────────
  const saveAttendance = async (formData, existingId) => {
    // existingId = shift record ID if editing; undefined/null = create new
    if (existingId) {
      await shiftsAPI.updateShift(existingId, {
        status: formData.status,
        clock_in: formData.clock_in,
        clock_out: formData.clock_out,
        note: formData.note,
        date: formData.date,
      });
    } else {
      try {
        await shiftsAPI.createManualShift({
          user_id: attEditMember.id,
          date: formData.date,
          status: formData.status,
          clock_in: formData.clock_in,
          clock_out: formData.clock_out,
          note: formData.note,
        });
      } catch (e) {
        // 409 = record already exists for that date → update it instead
        if (e.response?.status === 409 && e.response?.data?.existing_id) {
          await shiftsAPI.updateShift(e.response.data.existing_id, {
            status: formData.status,
            clock_in: formData.clock_in,
            clock_out: formData.clock_out,
            note: formData.note,
          });
        } else {
          throw e;
        }
      }
    }
    await loadAttendance(attDate, attDate);
  };

  // ── Payment CRUD handlers ─────────────────────────────────────────────────
  const savePayment = async (data, existingId) => {
    if (existingId) {
      await staffPaymentsAPI.update(existingId, data);
    } else {
      await staffPaymentsAPI.create(data);
    }
    await loadPayments(selMember?.id);
  };

  const deletePayment = async (id) => {
    try {
      await staffPaymentsAPI.delete(id);
      await loadPayments(selMember?.id);
    } catch (e) {
      setDialog({ title: 'Error', message: e.response?.data?.error || e.message, type: 'error' });
    }
  };

  // ── Loading screen ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg }}>
        <ActivityIndicator size="large" color={C.primary} />
        <Text style={{ color: C.textMuted, marginTop: 14, fontSize: 14 }}>{t('admin.staff.loadingStaff')}</Text>
      </View>
    );
  }

  const TABS = [
    { key: 'members',    icon: 'group',          label: t('admin.staff.staffList') },
    { key: 'attendance', icon: 'calendar-today', label: t('admin.staff.attendanceShifts') },
    { key: 'payroll',    icon: 'payments',       label: t('admin.staff.payrollPayments') },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />

      {/* ── Header ── */}
      <View style={st.header}>
        <Text style={st.headerTitle}>{t('admin.staff.title')}</Text>
        <Text style={st.headerSub}>
          {t('admin.staff.activeTotalSummary', {
            active: staff.filter(m => m.status === 'Active').length,
            total: staff.length,
          })}
        </Text>
      </View>

      {/* ── Tab bar ── */}
      <View style={st.tabBar}>
        {TABS.map(tb => (
          <TouchableOpacity key={tb.key} style={[st.tab, tab === tb.key && st.tabActive]} onPress={() => setTab(tb.key)}>
            <MaterialIcons
              name={tb.icon}
              size={16}
              color={tab === tb.key ? C.primary : C.textMid}
              style={{ marginRight: 4 }}
            />
            <Text
              style={[st.tabTxt, tab === tb.key && st.tabTxtActive]}
              numberOfLines={1}
              ellipsizeMode="tail"
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {tb.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ══════════ MEMBERS TAB ══════════ */}
      {tab === 'members' && (
        <View style={{ flex: 1 }}>
          <View style={st.filterBar}>
            <TextInput
              style={st.searchInput}
              value={search} onChangeText={setSearch}
              placeholder={t('admin.staff.searchPlaceholder')}
              placeholderTextColor={C.textMuted}
            />
          </View>
          <ScrollView
            contentContainerStyle={{ padding: 12, paddingBottom: 90 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} colors={[C.primary]} />}
          >
            {filtered.length === 0
              ? <Text style={{ color: C.textMuted, textAlign: 'center', marginTop: 50 }}>{t('common.noResults')}</Text>
              : filtered.map(m => (
                <StaffCard key={m.id} member={m} onPress={() => { setSelMember(m); setShowProfile(true); }} />
              ))
            }
          </ScrollView>
          <TouchableOpacity style={st.fab} onPress={() => setShowAdd(true)}>
            <Text style={{ color: '#fff', fontSize: 30, lineHeight: 32 }}>+</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ══════════ ATTENDANCE TAB ══════════ */}
      {tab === 'attendance' && (
        <View style={{ flex: 1 }}>
          {/* Day chooser bar */}
          <View style={{ backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.border, paddingVertical: 10, paddingHorizontal: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              {/* Previous day */}
              <TouchableOpacity onPress={() => { const d = new Date(attDate); d.setDate(d.getDate() - 1); setAttDate(fmtDate(d)); }} style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: C.cardBg, alignItems: 'center', justifyContent: 'center' }}>
                <MaterialIcons name="chevron-left" size={22} color={C.textDark} />
              </TouchableOpacity>

              {/* Date display + calendar tap */}
              <TouchableOpacity onPress={() => setShowAttCalendar(true)} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.cardBg, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7, gap: 8 }}>
                <MaterialIcons name="calendar-today" size={16} color={C.primary} />
                <Text style={{ fontSize: 14, fontWeight: '700', color: C.textDark }}>
                  {(() => {
                    const d = new Date(attDate + 'T00:00:00');
                    const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
                    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                    return `${dayNames[d.getDay()]}, ${monthNames[d.getMonth()]} ${d.getDate()}`;
                  })()}
                </Text>
                <MaterialIcons name="keyboard-arrow-down" size={18} color={C.textMuted} />
              </TouchableOpacity>

              {/* Next day */}
              <TouchableOpacity onPress={() => { const d = new Date(attDate); d.setDate(d.getDate() + 1); if (fmtDate(d) <= TODAY_STR) setAttDate(fmtDate(d)); }} style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: fmtDate((() => { const d = new Date(attDate); d.setDate(d.getDate() + 1); return d; })()) <= TODAY_STR ? C.cardBg : '#f3f4f6', alignItems: 'center', justifyContent: 'center', opacity: fmtDate((() => { const d = new Date(attDate); d.setDate(d.getDate() + 1); return d; })()) <= TODAY_STR ? 1 : 0.35 }}>
                <MaterialIcons name="chevron-right" size={22} color={C.textDark} />
              </TouchableOpacity>

              {/* Today button — always visible */}
              <TouchableOpacity onPress={() => setAttDate(TODAY_STR)} style={{ backgroundColor: attDate === TODAY_STR ? C.primary : '#DBEAFE', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7, marginLeft: 2 }}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: attDate === TODAY_STR ? '#fff' : C.primary }}>Today</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Live today stats strip ── */}
          <View style={{ flexDirection: 'row', backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.border, paddingVertical: 8, paddingHorizontal: 16 }}>
            {[
              [attStats.present, 'Present', C.success],
              [attStats.absent, 'Absent', C.danger],
              [attStats.late, 'Late', C.warning],
              [attStats.total - attStats.present - attStats.absent, 'Not In', C.textMuted],
            ].map(([val, lbl, col]) => (
              <View key={lbl} style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: col }}>{val}</Text>
                <Text style={{ fontSize: 10, color: C.textMuted, fontWeight: '600', marginTop: 1 }}>{lbl}</Text>
              </View>
            ))}
          </View>

          <ScrollView
            contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} colors={[C.primary]} />}
          >
            {staff.filter(m => !['Admin', 'Owner', 'admin', 'owner'].includes(m.role)).map(m => (
              <AttCard
                key={m.id}
                member={m}
                attendance={attendance}
                period={{ from: attDate, to: attDate }}
                todayAtt={todayAttendance[m.id]}
                tick={tick}
                onClockIn={clockIn}
                onClockInLate={clockInLate}
                onClockOut={clockOut}
                onMarkAbsent={markAbsent}
                onEditAtt={(mem, dateStr) => {
                  setAttEditMember(mem);
                  setAttEditDate(dateStr);
                  setShowAttEdit(true);
                }}
              />
            ))}
          </ScrollView>
        </View>
      )}

      {/* ══════════ PAYROLL TAB ══════════ */}
      {tab === 'payroll' && (
        <View style={{ flex: 1 }}>
          <PayrollPeriodBar period={period} onPeriodChange={setPeriod} onOpenCalendar={() => setShowCalendar(true)} />
          <ScrollView
            contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} colors={[C.primary]} />}
          >
            {/* Period Summary at the TOP — collapsed shows Grand Total Due */}
            <SummaryPanel
              staff={staff.filter(m => !['Admin', 'Owner', 'admin', 'owner'].includes(m.role))}
              attendance={mergedAttendance}
              payCalcs={fullPayCalcs}
              period={period}
              allPayments={allPayments}
              paymentDataByUser={paymentDataByUser}
              initialOpen={true}
            />
            {staff.filter(m => !['Admin', 'Owner', 'admin', 'owner'].includes(m.role)).map(m => (
              <PayrollCard
                key={m.id}
                member={m}
                calc={fullPayCalcs[m.id]}
                debtCalc={payCalcs[m.id]}
                effectiveFrom={paymentDataByUser[m.id]?.effectiveFrom || period.from}
                periodFrom={period.from}
                periodTo={period.to}
                paidInPeriod={paymentDataByUser[m.id]?.paidInPeriod || 0}
                paidInDisplayPeriod={paymentDataByUser[m.id]?.paidInDisplayPeriod || 0}
                onPayNow={() => { setSelMember(m); setShowPayNow(true); }}
                onDetails={() => {
                  setSelMember(m);
                  setPayments([]);
                  loadPayments(m.id);
                  setShowDetails(true);
                }}
              />
            ))}
          </ScrollView>
        </View>
      )}

      {/* ══════════ MODALS ══════════ */}
      {/* Single-day calendar for attendance */}
      <CalendarPicker
        visible={showAttCalendar}
        onClose={() => setShowAttCalendar(false)}
        period={{ from: attDate, to: attDate }}
        singleDay
        onChange={(p) => {
          setAttDate(p.from);
          setShowAttCalendar(false);
        }}
      />
      {/* Period range calendar for payroll */}
      <CalendarPicker
        visible={showCalendar}
        onClose={() => setShowCalendar(false)}
        period={period}
        onChange={(p) => {
          setPeriod(p);
          setShowCalendar(false);
        }}
      />
      <StaffFormModal visible={showAdd} onClose={() => setShowAdd(false)} onSave={addStaff} mode="add" />
      <StaffFormModal visible={showEdit} onClose={() => { setShowEdit(false); setSelMember(null); }} onSave={editInfo} initial={selMember} mode="edit" />
      <EditLoginModal visible={showLogin} onClose={() => { setShowLogin(false); setSelMember(null); }} member={selMember} onSave={editLogin} />
      <StaffProfileModal
        visible={showProfile} onClose={() => setShowProfile(false)} member={selMember}
        onEdit={(m) => { setSelMember(m); setShowEdit(true); }}
        onEditLogin={(m) => { setSelMember(m); setShowLogin(true); }}
        onDelete={deleteStaff} onToggleStatus={toggleStatus}
      />
      <AttHistoryModal visible={showHistory} onClose={() => setShowHistory(false)} member={selMember} attendance={attendance} />

      {/* Attendance Edit Modal */}
      <AttendanceEditModal
        visible={showAttEdit}
        onClose={() => setShowAttEdit(false)}
        member={attEditMember}
        defaultDate={attEditDate}
        existingRecord={
          attEditMember
            ? attendance.find(r => r.staffId === attEditMember.id) || null
            : null
        }
        onSave={saveAttendance}
      />

      <PayNowModal
        visible={showPayNow} onClose={() => setShowPayNow(false)}
        member={selMember} calc={selMember ? fullPayCalcs[selMember.id] : null}
        paidAlready={selMember ? (paymentDataByUser[selMember.id]?.paidInDisplayPeriod || 0) : 0}
        periodFrom={period.from}
        periodTo={period.to}
        onPay={payNow}
      />
      <PayrollDetailsModal
        visible={showDetails}
        onClose={() => { setShowDetails(false); }}
        member={selMember}
        calc={selMember ? fullPayCalcs[selMember.id] : null}
        cardCalc={selMember ? payCalcs[selMember.id] : null}
        paidInPeriod={selMember ? (paymentDataByUser[selMember.id]?.paidInPeriod || 0) : 0}
        effectiveFrom={selMember ? (paymentDataByUser[selMember.id]?.effectiveFrom || period.from) : period.from}
        period={period}
        payments={payments}
        onAddPayment={() => { setEditingPayment(null); setShowPaymentForm(true); }}
        onEditPayment={(p) => { setEditingPayment(p); setShowPaymentForm(true); }}
        onDeletePayment={deletePayment}
      />

      {/* Payment Form Modal */}
      <PaymentFormModal
        visible={showPaymentForm}
        onClose={() => setShowPaymentForm(false)}
        payment={editingPayment}
        memberId={selMember?.id}
        onSave={savePayment}
      />

      <ConfirmDialog dialog={dialog} onClose={() => setDialog(null)} />
    </View>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// STYLES
// ══════════════════════════════════════════════════════════════════════════════
const st = StyleSheet.create({
  // Header — topInset pushes content below the translucent status bar
  header: { backgroundColor: C.white, paddingHorizontal: 16, paddingTop: topInset + 8, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  headerTitle: { fontSize: 22, fontWeight: '800', color: C.textDark },
  headerSub: { fontSize: 12, color: C.textMuted, marginTop: 2 },

  // Tabs
  tabBar: { flexDirection: 'row', backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.border },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, paddingHorizontal: 4 },
  tabActive: { borderBottomWidth: 2.5, borderBottomColor: C.primary },
  tabTxt: { fontSize: 12, fontWeight: '600', color: C.textMuted, flexShrink: 1 },
  tabTxtActive: { color: C.primary, fontWeight: '800' },

  // Filter / period bar
  filterBar: { backgroundColor: C.white, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  searchInput: { backgroundColor: '#F1F5F9', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9, fontSize: 14, color: C.textDark },
  periodBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F5F9', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  todayBtn: { marginLeft: 8, backgroundColor: C.primary, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9 },

  // Calendar
  periodPill: { flex: 1, borderRadius: 10, padding: 10, alignItems: 'center', backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: C.border },
  periodPillActive: { backgroundColor: '#EFF6FF', borderWidth: 2, borderColor: C.primary },
  arrowBtn: { padding: 10 },
  presetBtn: { flex: 1, backgroundColor: '#F1F5F9', borderRadius: 8, paddingVertical: 8, alignItems: 'center', minWidth: '45%' },
  presetTxt: { color: C.textMid, fontWeight: '700', fontSize: 12 },

  // Card
  card: { backgroundColor: C.white, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.border },
  cardName: { fontSize: 15, fontWeight: '800', color: C.textDark },
  cardSub: { fontSize: 12, color: C.textMuted, marginTop: 3 },

  // Avatar
  avatar: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  avatarTxt: { fontSize: 18, fontWeight: '800' },
  avatarLg: { width: 72, height: 72, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  avatarLgTxt: { fontSize: 30, fontWeight: '800' },

  // Period strip inside att card
  periodStrip: { backgroundColor: '#F8FAFC', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10, marginTop: 10 },
  periodStripTxt: { fontSize: 12, color: C.textMid, fontWeight: '600', textAlign: 'center' },

  // FAB
  fab: { position: 'absolute', right: 20, bottom: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: C.primary, justifyContent: 'center', alignItems: 'center', shadowColor: C.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 8 },

  // Modal header
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.white, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  modalTitle: { fontSize: 16, fontWeight: '800', color: C.textDark, flex: 1, textAlign: 'center' },

  // Form
  label: { fontSize: 13, fontWeight: '700', color: C.textMid, marginBottom: 6 },
  input: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: C.textDark },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: C.border },
  chipOn: { backgroundColor: '#EFF6FF', borderColor: C.primary },
  chipTxt: { fontSize: 13, fontWeight: '600', color: C.textMid },
  chipTxtOn: { color: C.primary, fontWeight: '700' },

  // Buttons
  btnPrimary: { backgroundColor: C.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  btnPrimaryTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  btnOutline: { borderWidth: 1.5, borderColor: C.primary, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  btnOutlineTxt: { color: C.primary, fontWeight: '700', fontSize: 14 },

  // Info card / rows
  infoCard: { backgroundColor: '#F8FAFC', borderRadius: 12, padding: 14, marginBottom: 12 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  infoKey: { fontSize: 13, color: C.textMuted },
  infoVal: { fontSize: 13, fontWeight: '700', color: C.textDark },

  // Summary panel
  summaryCard: { backgroundColor: C.white, borderRadius: 14, padding: 14, marginBottom: 10, marginTop: 4, borderWidth: 1, borderColor: C.border },
  summaryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  summaryTitle: { fontSize: 15, fontWeight: '800', color: C.textDark },
  summarySection: { fontSize: 13, fontWeight: '800', color: C.textDark, marginBottom: 6, marginTop: 4 },
  summaryColHdr: { fontSize: 10, fontWeight: '700', color: C.textMuted, paddingVertical: 2 },
  summaryRow: { flexDirection: 'row', paddingVertical: 5, borderTopWidth: 1, borderTopColor: C.border },
  summaryCell: { fontSize: 11, color: C.textDark, fontWeight: '600' },

  // Section title
  sectionTitle: { fontSize: 15, fontWeight: '800', color: C.textDark, marginTop: 18, marginBottom: 8 },
});

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Pressable,
  Modal, TextInput, StyleSheet, ActivityIndicator, RefreshControl,
  FlatList, Platform, StatusBar,
} from 'react-native';
import { colors, spacing, radius, shadow, typography, topInset } from '../../utils/theme';
import { shiftsAPI, usersAPI } from '../../api/client';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import ConfirmDialog from '../../components/ConfirmDialog';
import TimePicker from '../../components/TimePicker';

// ─── Constants ───────────────────────────────────────────────
const LATE_PENALTY = 5000; // so'm per late day
const BLUE = colors.admin;

// ─── Seed salary config (merged with API data) ───────────────
const SEED_SALARY = {
  default_waitress: { salaryType: 'monthly', monthlyRate: 1500000, shiftStart: '10:00', shiftEnd: '20:00' },
  default_kitchen: { salaryType: 'monthly', monthlyRate: 1500000, shiftStart: '08:00', shiftEnd: '18:00' },
  default_cashier: { salaryType: 'monthly', monthlyRate: 1500000, shiftStart: '09:00', shiftEnd: '20:00' },
  default_cleaner: { salaryType: 'daily', dailyRate: 80000, shiftStart: '07:00', shiftEnd: '12:00' },
};

// ─── Auth / Credential Utilities ─────────────────────────────

// Simple deterministic hash — not cryptographic, just obscures stored passwords.
// Uses a djb2-style algorithm then btoa-encodes the result.
function hashPass(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
  return btoa(String(h >>> 0));
}

// Mask phone: +998901234567 → "+998 90 *** ** 67"
function maskPhone(phone) {
  const d = (phone || '').replace(/\D/g, '');
  if (d.length < 11) return phone || '—';
  const cc = d.slice(0, 3);   // 998
  const op = d.slice(3, 5);   // 90
  const end = d.slice(-2);     // last 2
  return `+${cc} ${op} *** ** ${end}`;
}

// Auto-format Uzbek phone as user types (digits → +998 XX XXX XX XX)
function formatUzPhone(raw) {
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

function stripPhone(formatted) {
  const d = (formatted || '').replace(/\D/g, '');
  return d ? '+' + d : '';
}

/*
 ─── SEED CREDENTIALS (developer reference) ─────────────────
 These are the default login credentials for seeded staff.
 In production, each staff member must set their own password.

 Admin (Owner):  +998 90 000 00 01  /  admin1234
 Malika (Waitress):  +998 90 123 45 62  /  malika1234
 Dilnoza (Waitress): +998 90 123 45 63  /  dilnoza1234
 Bobur (Kitchen):    +998 90 123 45 64  /  bobur1234
 Jasur (Kitchen):    +998 90 123 45 65  /  jasur1234
 Nodira (Cashier):   +998 90 123 45 66  /  nodira1234
 ────────────────────────────────────────────────────────────
*/

// ─── Helpers ─────────────────────────────────────────────────
const fmt = (n) => new Intl.NumberFormat('uz-UZ').format(Math.round(n || 0)) + " so'm";

const fmtTime = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const fmtDur = (fromIso, toIso) => {
  if (!fromIso) return '—';
  const ms = new Date(toIso || Date.now()) - new Date(fromIso);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
};

const fmtDate = (iso) => {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};

const calcPayroll = (staff, history) => {
  const cfg = staff._cfg || {};
  const latePenalty = (staff.lateDays || 0) * LATE_PENALTY;
  const bonusTotal = (staff.bonuses || []).reduce((s, b) => s + (b.amount || 0), 0);
  const shifts = history || [];

  if (cfg.salaryType === 'monthly') {
    const base = cfg.monthlyRate || cfg.monthlySalary || 0;
    return { base, latePenalty, bonusTotal, net: base - latePenalty + bonusTotal, type: 'monthly' };
  }

  if (cfg.salaryType === 'hourly') {
    const totalHours = shifts.reduce((s, h) => s + parseFloat(h.hours_worked || 0), 0);
    const base = totalHours * (cfg.hourlyRate || 0);
    return { base, totalHours: Math.round(totalHours * 10) / 10, latePenalty, bonusTotal, net: base - latePenalty + bonusTotal, type: 'hourly' };
  }

  if (cfg.salaryType === 'daily') {
    // Count distinct calendar days the staff was present or late (clocked in)
    const daysWorked = new Set(
      shifts
        .filter(h => h.clock_in && (h.status === 'present' || h.status === 'late'))
        .map(h => new Date(h.clock_in).toDateString())
    ).size;
    const base = daysWorked * (cfg.dailyRate || 0);
    return { base, daysWorked, latePenalty, bonusTotal, net: base - latePenalty + bonusTotal, type: 'daily' };
  }

  if (cfg.salaryType === 'weekly') {
    // Group days present by ISO week number; a week counts if >= 5 days present
    const daysByWeek = {};
    shifts
      .filter(h => h.clock_in && (h.status === 'present' || h.status === 'late'))
      .forEach(h => {
        const d = new Date(h.clock_in);
        // ISO week key: year-weekNumber
        const jan1 = new Date(d.getFullYear(), 0, 1);
        const weekNum = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
        const key = `${d.getFullYear()}-${weekNum}`;
        daysByWeek[key] = (daysByWeek[key] || new Set());
        daysByWeek[key].add(d.toDateString());
      });
    const fullWeeks = Object.values(daysByWeek).filter(days => days.size >= 5).length;
    const base = fullWeeks * (cfg.weeklyRate || 0);
    return { base, fullWeeks, latePenalty, bonusTotal, net: base - latePenalty + bonusTotal, type: 'weekly' };
  }

  // Fallback
  return { base: 0, latePenalty, bonusTotal, net: bonusTotal - latePenalty, type: cfg.salaryType || 'unknown' };
};

const statusColor = (st) => {
  if (st === 'present') return '#10B981';
  if (st === 'late') return '#F59E0B';
  if (st === 'absent') return '#EF4444';
  return '#CBD5E1'; // not clocked in
};

const statusLabel = (staff) => {
  if (staff.status === 'late') return 'LATE';
  if (staff.status === 'present') return 'ON TIME';
  if (staff.status === 'absent') return 'ABSENT';
  if (staff.clock_in && !staff.clock_out) return 'CLOCKED IN';
  return 'NOT IN';
};

// ─── Bottom Sheet Wrapper ─────────────────────────────────────
function Sheet({ visible, onClose, children, title }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={sh.overlay} onPress={onClose}>
        <Pressable style={sh.sheet} onPress={() => { }}>
          <View style={sh.handle} />
          {title ? <Text style={sh.sheetTitle}>{title}</Text> : null}
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Summary Row ──────────────────────────────────────────────
function SummaryRow({ staff, now }) {
  // Present = clocked in (active or completed) regardless of on-time/late
  const present = staff.filter(s =>
    (s.status === 'present' || s.status === 'late') ||
    (!!s.clock_in && !s.clock_out && s.status !== 'absent')
  ).length;
  const late   = staff.filter(s => s.status === 'late').length;
  const absent = staff.filter(s => s.status === 'absent').length;
  // Total hours worked today across all clocked-in staff
  const nowMs = (now || new Date()).getTime();
  const totalHrs = staff.reduce((sum, s) => {
    if (!s.clock_in) return sum;
    const end = s.clock_out ? new Date(s.clock_out).getTime() : nowMs;
    return sum + (end - new Date(s.clock_in).getTime()) / 3_600_000;
  }, 0);
  const chips = [
    { label: 'Present', val: present, col: '#10B981' },
    { label: 'Late',    val: late,    col: '#F59E0B' },
    { label: 'Absent',  val: absent,  col: '#EF4444' },
    { label: 'Hours',   val: `${Math.round(totalHrs)}h`, col: BLUE },
  ];
  return (
    <View style={sr.row}>
      {chips.map(c => (
        <View key={c.label} style={[sr.chip, { borderColor: c.col + '40', backgroundColor: c.col + '12' }]}>
          <Text style={[sr.val, { color: c.col }]}>{c.val}</Text>
          <Text style={sr.lbl}>{c.label}</Text>
        </View>
      ))}
    </View>
  );
}

// ─── Attendance Card ──────────────────────────────────────────
function AttCard({ item, cred, now, onCheckIn, onCheckInLate, onCheckOut, onMarkAbsent, onLongPress, processing }) {
  // Derive the four mutually-exclusive states
  const isAdmin     = (item.role || '').toLowerCase() === 'admin';
  const isSuspended = cred?.status === 'suspended';
  const isAbsent    = item.status === 'absent';
  const isDone      = !!item.clock_in && !!item.clock_out;
  const isClockedIn = !!item.clock_in && !item.clock_out && !isAbsent;
  const notStarted  = !item.clock_in && !isAbsent;

  const cfg = item._cfg || {};
  const dot = isSuspended
    ? '#94a3b8'
    : statusColor(item.status || (isClockedIn ? 'present' : null));

  return (
    <Pressable
      style={({ pressed }) => [ac.card, pressed && { opacity: 0.9 }, isSuspended && ac.cardSuspended]}
      onLongPress={() => onLongPress(item)}
      delayLongPress={500}
    >
      {/* Left: status dot + info */}
      <View style={ac.left}>
        <View style={[ac.dot, { backgroundColor: dot }]} />
        <View style={{ flex: 1 }}>
          <View style={ac.nameRow}>
            <Text style={ac.name}>{item.name}</Text>
            {isSuspended ? (
              <View style={ac.suspendedBadge}>
                <Text style={ac.suspendedTxt}>SUSPENDED</Text>
              </View>
            ) : (
              <View style={[ac.badge, { backgroundColor: dot + '20' }]}>
                <Text style={[ac.badgeText, { color: dot }]}>{statusLabel(item)}</Text>
              </View>
            )}
          </View>
          <Text style={ac.role}>{item.role?.toUpperCase()}</Text>
          {cred?.phone ? (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <MaterialIcons name="smartphone" size={12} color="#94a3b8" style={{ marginRight: 4 }} />
              <Text style={ac.phone}>{maskPhone(cred.phone)}</Text>
            </View>
          ) : null}
          {cfg.shiftStart ? (
            <Text style={ac.shift}>⏰ {cfg.shiftStart} – {cfg.shiftEnd}</Text>
          ) : null}
          {/* Live timer while clocked in */}
          {!isSuspended && isClockedIn ? (
            <Text style={ac.detail}>
              In {fmtTime(item.clock_in)}  ·  {fmtDur(item.clock_in, now.toISOString())}
            </Text>
          ) : !isSuspended && isDone ? (
            <Text style={ac.detail}>
              {fmtTime(item.clock_in)} → {fmtTime(item.clock_out)}  ·  {fmtDur(item.clock_in, item.clock_out)}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Right: exactly one state at a time */}
      <View style={ac.right}>
        {isSuspended ? (
          /* ── Suspended ── */
          <View style={[ac.btn, { backgroundColor: '#f1f5f9' }]}>
            <Text style={[ac.btnTxt, { color: '#94a3b8', fontSize: 10 }]}>SUSP.</Text>
          </View>

        ) : processing === item.user_id ? (
          /* ── Loading spinner ── */
          <ActivityIndicator color={BLUE} />

        ) : isAdmin ? (
          /* ── Admin — no attendance tracking ── */
          null

        ) : isAbsent ? (
          /* ── Already marked absent today ── */
          <View style={ac.btnAbsent}>
            <Text style={ac.btnAbsentTxt}>ABSENT</Text>
          </View>

        ) : isDone ? (
          /* ── Shift complete — show DONE + hours ── */
          <View style={ac.btnDone}>
            <Text style={ac.btnDoneTxt}>DONE</Text>
            <Text style={ac.btnDoneSub}>{fmtDur(item.clock_in, item.clock_out)}</Text>
          </View>

        ) : isClockedIn ? (
          /* ── Currently clocked in — Clock Out only ── */
          <TouchableOpacity style={[ac.btn, ac.btnOut]} onPress={() => onCheckOut(item)}>
            <Text style={ac.btnTxt}>Clock Out</Text>
          </TouchableOpacity>

        ) : notStarted ? (
          /* ── Not started today — Clock In | Late | Absent ── */
          <View style={ac.actionStack}>
            <TouchableOpacity style={[ac.btn, ac.btnIn]} onPress={() => onCheckIn(item)}>
              <Text style={ac.btnTxt}>Clock In</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[ac.btn, ac.btnLate]} onPress={() => onCheckInLate(item)}>
              <Text style={ac.btnTxt}>Late</Text>
            </TouchableOpacity>
            <TouchableOpacity style={ac.btnAbsentSmall} onPress={() => onMarkAbsent(item)}>
              <Text style={ac.btnAbsentSmallTxt}>Absent</Text>
            </TouchableOpacity>
          </View>

        ) : null}
      </View>
    </Pressable>
  );
}

// ─── History Modal ─────────────────────────────────────────────
function HistoryModal({ visible, onClose, staff, history, loadingHistory }) {
  const [range, setRange] = useState('today');
  if (!staff) return null;

  const ranges = [
    { key: 'today', label: 'Today' },
    { key: 'week', label: 'Week' },
    { key: 'month', label: 'Month' },
  ];

  const now = new Date();
  const filtered = (history || []).filter(h => {
    const d = new Date(h.clock_in);
    if (range === 'today') {
      return d.toDateString() === now.toDateString();
    }
    if (range === 'week') {
      const wAgo = new Date(now); wAgo.setDate(now.getDate() - 7);
      return d >= wAgo;
    }
    return true; // month = all
  });

  const totalHours = filtered.reduce((s, h) => s + parseFloat(h.hours_worked || 0), 0);
  const lateDays = filtered.filter(h => h.status === 'late').length;
  const presentDays = filtered.filter(h => h.status === 'present').length;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={sh.overlay} onPress={onClose}>
        <Pressable style={[sh.sheet, { height: '80%' }]} onPress={() => { }}>
          <View style={sh.handle} />
          <View style={hm.header}>
            <View>
              <Text style={hm.name}>{staff.name}</Text>
              <Text style={hm.role}>{staff.role?.toUpperCase()}</Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <MaterialIcons name="close" size={22} color="#94a3b8" />
            </TouchableOpacity>
          </View>

          {/* Range tabs */}
          <View style={hm.tabs}>
            {ranges.map(r => (
              <TouchableOpacity
                key={r.key}
                style={[hm.tab, range === r.key && hm.tabActive]}
                onPress={() => setRange(r.key)}
              >
                <Text style={[hm.tabTxt, range === r.key && hm.tabTxtActive]}>{r.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Summary chips */}
          <View style={hm.summary}>
            <View style={hm.sumChip}>
              <Text style={hm.sumVal}>{Math.round(totalHours * 10) / 10}h</Text>
              <Text style={hm.sumLbl}>Hours</Text>
            </View>
            <View style={hm.sumChip}>
              <Text style={[hm.sumVal, { color: '#10B981' }]}>{presentDays}</Text>
              <Text style={hm.sumLbl}>On Time</Text>
            </View>
            <View style={hm.sumChip}>
              <Text style={[hm.sumVal, { color: '#F59E0B' }]}>{lateDays}</Text>
              <Text style={hm.sumLbl}>Late</Text>
            </View>
          </View>

          {/* Records */}
          {loadingHistory ? (
            <ActivityIndicator color={BLUE} style={{ marginTop: 20 }} />
          ) : filtered.length === 0 ? (
            <Text style={hm.empty}>No records for this period</Text>
          ) : (
            <ScrollView style={{ flex: 1, paddingHorizontal: spacing.lg }}>
              {filtered.map((h, i) => (
                <View key={i} style={hm.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={hm.rowDate}>{fmtDate(h.clock_in)}</Text>
                    <Text style={hm.rowTime}>
                      {fmtTime(h.clock_in)} → {h.clock_out ? fmtTime(h.clock_out) : 'Active'}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={hm.rowHours}>{parseFloat(h.hours_worked || 0).toFixed(1)}h</Text>
                    <View style={[hm.rowBadge, { backgroundColor: statusColor(h.status) + '20' }]}>
                      <Text style={[hm.rowBadgeTxt, { color: statusColor(h.status) }]}>
                        {h.status || 'present'}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Long-press Action Sheet ───────────────────────────────────
function LongPressSheet({ visible, onClose, staff, onEdit, onResetPassword, onDelete }) {
  if (!staff) return null;
  const actions = [
    { label: 'Edit Staff Info',       icon: 'edit',    color: '#0f172a', onPress: () => { onClose(); onEdit(staff); } },
    { label: 'Edit Login & Password', icon: 'lock',    color: BLUE,     onPress: () => { onClose(); onResetPassword(staff); } },
    { label: 'Remove Staff Member',   icon: 'delete',  color: '#EF4444',onPress: () => { onClose(); onDelete(staff); } },
  ];
  return (
    <Sheet visible={visible} onClose={onClose}>
      <Text style={sh.sheetTitle}>{staff.name}</Text>
      <Text style={[sh.sheetSub, { marginBottom: spacing.lg }]}>
        {staff.role}
      </Text>
      {actions.map((a, i) => (
        <TouchableOpacity key={i} style={[lp.row, { flexDirection: 'row', alignItems: 'center' }]} onPress={a.onPress}>
          <MaterialIcons name={a.icon} size={18} color={a.color} style={{ marginRight: 10 }} />
          <Text style={[lp.rowTxt, { color: a.color }]}>{a.label}</Text>
        </TouchableOpacity>
      ))}
      <TouchableOpacity style={lp.cancel} onPress={onClose}>
        <Text style={lp.cancelTxt}>Cancel</Text>
      </TouchableOpacity>
    </Sheet>
  );
}

// ─── Edit Login & Password Sheet ─────────────────────────────
function EditLoginSheet({ visible, onClose, staff, onSaved }) {
  const [login, setLogin] = useState('');
  const [pass, setPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [dialog, setDialog] = useState(null);

  useEffect(() => {
    if (visible && staff) {
      setLogin(staff.email || '');
      setPass('');
      setErr('');
    }
  }, [visible, staff]);

  if (!staff) return null;

  const handleSave = async () => {
    if (!login.trim()) return setErr('Login (email) is required.');
    setSaving(true);
    try {
      const payload = { email: login.trim() };
      if (pass.trim()) {
        if (pass.trim().length < 6) { setSaving(false); return setErr('Password must be at least 6 characters.'); }
        payload.password = pass.trim();
      }
      await usersAPI.updateCredentials(staff.user_id, payload);
      onSaved({ ...staff, email: payload.email });
      setDialog({ title: 'Saved', message: 'Login credentials updated successfully.', type: 'success' });
      onClose();
    } catch (e) {
      setErr(e?.response?.data?.error || 'Could not update credentials.');
    }
    setSaving(false);
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Edit Login & Password">
      <Text style={[sh.sheetSub, { marginBottom: spacing.lg }]}>{staff.name}</Text>

      {!!err && <View style={el.errBox}><Text style={el.errTxt}>{err}</Text></View>}

      <Text style={el.label}>Email (Login)*</Text>
      <TextInput
        style={el.input}
        value={login}
        onChangeText={v => { setErr(''); setLogin(v); }}
        placeholder="staff@email.com"
        placeholderTextColor="#94a3b8"
        keyboardType="email-address"
        autoCapitalize="none"
      />

      <Text style={el.label}>New Password <Text style={el.optional}>(leave blank to keep current)</Text></Text>
      <View style={el.pwRow}>
        <TextInput
          style={[el.input, { flex: 1, marginBottom: 0 }]}
          value={pass}
          onChangeText={v => { setErr(''); setPass(v); }}
          secureTextEntry={!showPass}
          placeholder="Min. 6 characters"
          placeholderTextColor="#94a3b8"
        />
        <TouchableOpacity style={el.eyeBtn} onPress={() => setShowPass(v => !v)}>
          <Text style={el.eyeTxt}>{showPass ? 'Hide' : 'Show'}</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={el.saveBtn} onPress={handleSave} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={el.saveBtnTxt}>Save Login & Password</Text>}
      </TouchableOpacity>
      <View style={{ height: spacing.xl }} />
      <ConfirmDialog dialog={dialog} onClose={() => setDialog(null)} />
    </Sheet>
  );
}

// ─── Edit Staff Info Sheet ────────────────────────────────────
const STAFF_ROLES = ['waitress', 'kitchen', 'admin', 'manager', 'cashier'];
const SALARY_TYPES = ['monthly', 'hourly', 'daily', 'weekly'];

function EditStaffSheet({ visible, onClose, staff, onSaved }) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('waitress');
  const [salaryType, setSalaryType] = useState('monthly');
  const [salary, setSalary] = useState('');
  const [shiftStart, setShiftStart] = useState('');
  const [shiftEnd, setShiftEnd] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [dialog, setDialog] = useState(null);

  useEffect(() => {
    if (visible && staff) {
      setName(staff.name || '');
      setRole(staff.role || 'waitress');
      // salary from backend field or local config
      const cfg = staff._cfg || {};
      const savedSalary = staff.salary
        ? String(staff.salary)
        : String(cfg.monthlyRate || cfg.hourlyRate || cfg.dailyRate || cfg.weeklyRate || '');
      setSalary(savedSalary);
      setSalaryType(cfg.salaryType || 'monthly');
      setShiftStart(staff.shift_start || cfg.shiftStart || '');
      setShiftEnd(staff.shift_end || cfg.shiftEnd || '');
      setErr('');
    }
  }, [visible, staff]);

  if (!staff) return null;

  const handleSave = async () => {
    if (!name.trim()) return setErr('Name is required.');
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        role,
        salary: parseFloat(salary) || null,
        shift_start: shiftStart.trim() || null,
        shift_end: shiftEnd.trim() || null,
        is_active: true,
      };
      const res = await usersAPI.update(staff.user_id, payload);
      onSaved(res.data);
      setDialog({ title: 'Saved', message: 'Staff information updated.', type: 'success' });
      onClose();
    } catch (e) {
      setErr(e?.response?.data?.error || 'Could not save changes.');
    }
    setSaving(false);
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Edit Staff Info">
      <ScrollView style={{ maxHeight: 560 }} showsVerticalScrollIndicator={false}>

        {!!err && <View style={es.errBox}><Text style={es.errTxt}>{err}</Text></View>}

        <Text style={es.label}>Full Name *</Text>
        <TextInput
          style={es.input}
          value={name}
          onChangeText={v => { setErr(''); setName(v); }}
          placeholder="e.g. Aziz Karimov"
          placeholderTextColor="#94a3b8"
        />

        <Text style={es.label}>Role</Text>
        <View style={es.pillRow}>
          {STAFF_ROLES.map(r => (
            <TouchableOpacity key={r} style={[es.pill, role === r && es.pillActive]} onPress={() => setRole(r)}>
              <Text style={[es.pillTxt, role === r && es.pillTxtActive]}>
                {r.charAt(0).toUpperCase() + r.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={[es.rowTwo, { gap: 8 }]}>
          <View style={{ flex: 1 }}>
            <TimePicker label="Shift Start" value={shiftStart} onChange={setShiftStart} placeholder="09:00" />
          </View>
          <View style={{ flex: 1 }}>
            <TimePicker label="Shift End" value={shiftEnd} onChange={setShiftEnd} placeholder="18:00" />
          </View>
        </View>

        <Text style={es.label}>Salary Type</Text>
        <View style={es.pillRow}>
          {SALARY_TYPES.map(t => (
            <TouchableOpacity key={t} style={[es.pill, salaryType === t && es.pillActive]} onPress={() => setSalaryType(t)}>
              <Text style={[es.pillTxt, salaryType === t && es.pillTxtActive]}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={es.label}>
          {salaryType === 'monthly' ? "Monthly Salary (so'm)" :
            salaryType === 'hourly' ? "Hourly Rate (so'm)" :
              salaryType === 'daily' ? "Daily Rate (so'm)" :
                "Weekly Rate (so'm)"}
        </Text>
        <TextInput
          style={es.input}
          value={salary}
          onChangeText={setSalary}
          placeholder="e.g. 1500000"
          placeholderTextColor="#94a3b8"
          keyboardType="numeric"
        />

        <TouchableOpacity style={es.saveBtn} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={es.saveBtnTxt}>Save Changes</Text>}
        </TouchableOpacity>
        <View style={{ height: spacing.xl }} />
      </ScrollView>
      <ConfirmDialog dialog={dialog} onClose={() => setDialog(null)} />
    </Sheet>
  );
}

// ─── Payroll Summary Scroll ───────────────────────────────────
function PayrollSummaryScroll({ staff, histories }) {
  const payrolls = staff.map(s => calcPayroll(s, histories[s.user_id] || []));
  const totalPay = payrolls.reduce((s, p) => s + p.net, 0);
  const totalHours = payrolls.filter(p => p.type === 'hourly').reduce((s, p) => s + (p.totalHours || 0), 0);
  const pending = staff.filter(s => !s.paidThisMonth).length;
  const paidAmt = staff.filter(s => s.paidThisMonth)
    .reduce((s, x) => s + calcPayroll(x, histories[x.user_id] || []).net, 0);

  const cards = [
    { label: 'Total Payroll', val: fmt(totalPay), col: BLUE, bg: '#eff6ff' },
    { label: 'Hours Worked', val: `${Math.round(totalHours)}h`, col: '#059669', bg: '#f0fdf4' },
    { label: 'Pending', val: `${pending} staff`, col: '#F59E0B', bg: '#fffbeb' },
    { label: 'Paid This Month', val: fmt(paidAmt), col: '#8B5CF6', bg: '#f5f3ff' },
  ];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={ps.scroll} contentContainerStyle={ps.content}>
      {cards.map(c => (
        <View key={c.label} style={[ps.card, { backgroundColor: c.bg, borderColor: c.col + '30' }]}>
          <Text style={[ps.val, { color: c.col }]}>{c.val}</Text>
          <Text style={ps.lbl}>{c.label}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

// ─── Payroll Card ─────────────────────────────────────────────
function PayrollCard({ staff, history, onPayNow, onDetails }) {
  const p = calcPayroll(staff, history || []);
  const cfg = staff._cfg || {};
  const isPaid = staff.paidThisMonth;
  const dot = statusColor(staff.status);

  return (
    <View style={pc.card}>
      <View style={pc.top}>
        <View style={[pc.dot, { backgroundColor: dot }]} />
        <View style={{ flex: 1 }}>
          <Text style={pc.name}>{staff.name}</Text>
          <Text style={pc.role}>{staff.role?.toUpperCase()}  ·  {
            cfg.salaryType === 'hourly' ? `${fmt(cfg.hourlyRate || 0)}/hr` :
              cfg.salaryType === 'daily' ? `${fmt(cfg.dailyRate || 0)}/day` :
                cfg.salaryType === 'weekly' ? `${fmt(cfg.weeklyRate || 0)}/wk` :
                  'Monthly'
          }</Text>
        </View>
        <View style={[pc.badge, isPaid ? pc.paidBadge : pc.pendingBadge]}>
          <Text style={[pc.badgeTxt, { color: isPaid ? '#059669' : '#F59E0B' }]}>{isPaid ? 'Paid' : 'Pending'}</Text>
        </View>
      </View>

      <View style={pc.amounts}>
        <View style={pc.amtCol}>
          <Text style={pc.amtLbl}>Base</Text>
          <Text style={pc.amtVal}>{fmt(p.base)}</Text>
        </View>
        {p.latePenalty > 0 && (
          <View style={pc.amtCol}>
            <Text style={pc.amtLbl}>Late Deduct</Text>
            <Text style={[pc.amtVal, { color: '#EF4444' }]}>-{fmt(p.latePenalty)}</Text>
          </View>
        )}
        {p.bonusTotal > 0 && (
          <View style={pc.amtCol}>
            <Text style={pc.amtLbl}>Bonus</Text>
            <Text style={[pc.amtVal, { color: '#10B981' }]}>+{fmt(p.bonusTotal)}</Text>
          </View>
        )}
        <View style={pc.amtCol}>
          <Text style={pc.amtLbl}>Net Pay</Text>
          <Text style={[pc.amtVal, pc.netVal]}>{fmt(p.net)}</Text>
        </View>
      </View>

      <View style={pc.actions}>
        <TouchableOpacity style={pc.detailsBtn} onPress={() => onDetails(staff)}>
          <Text style={pc.detailsBtnTxt}>Details</Text>
        </TouchableOpacity>
        {!isPaid && (
          <TouchableOpacity style={pc.payBtn} onPress={() => onPayNow(staff)}>
            <Text style={pc.payBtnTxt}>Pay Now</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const RATE_CONFIG = {
  Hourly: { field: 'hourlyRate', label: "Hourly Rate (so'm)", placeholder: '15,000' },
  Daily: { field: 'dailyRate', label: "Daily Rate (so'm)", placeholder: '80,000' },
  Weekly: { field: 'weeklyRate', label: "Weekly Rate (so'm)", placeholder: '400,000' },
  Monthly: { field: 'monthlyRate', label: "Monthly Salary (so'm)", placeholder: '1,500,000' },
};

// ─── Pay Now Sheet ────────────────────────────────────────────
function PayNowSheet({ visible, onClose, staff, history, onConfirm }) {
  const [method, setMethod] = useState('Cash');
  if (!staff) return null;
  const p = calcPayroll(staff, history || []);
  const methods = ['Cash', 'Bank Transfer', 'Card'];

  return (
    <Sheet visible={visible} onClose={onClose} title="Confirm Payment">
      <Text style={pn.staffName}>{staff.name}</Text>
      <Text style={pn.staffRole}>{staff.role}</Text>

      <View style={pn.amountBox}>
        <Text style={pn.amtLbl}>Net Amount to Pay</Text>
        <Text style={pn.amtVal}>{fmt(p.net)}</Text>
      </View>

      <Text style={pn.methodLbl}>Payment Method</Text>
      <View style={pn.methodRow}>
        {methods.map(m => (
          <TouchableOpacity key={m} style={[pn.methodBtn, method === m && pn.methodBtnActive]} onPress={() => setMethod(m)}>
            <Text style={[pn.methodBtnTxt, method === m && pn.methodBtnTxtActive]}>{m}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={pn.confirmBtn} onPress={() => { onConfirm(staff, method); onClose(); }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
          <MaterialIcons name="check" size={16} color="#fff" style={{ marginRight: 6 }} />
          <Text style={pn.confirmBtnTxt}>Confirm Payment  {fmt(p.net)}</Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity style={pn.cancelBtn} onPress={onClose}>
        <Text style={pn.cancelBtnTxt}>Cancel</Text>
      </TouchableOpacity>
      <View style={{ height: spacing.lg }} />
    </Sheet>
  );
}

// ─── Payroll Detail Modal ─────────────────────────────────────
function PayrollDetailModal({ visible, onClose, staff, history, onAddBonus }) {
  const [bonusAmt, setBonusAmt] = useState('');
  const [bonusNote, setBonusNote] = useState('');
  const [showBonusForm, setShowBonusForm] = useState(false);
  const [dialog, setDialog] = useState(null);
  if (!staff) return null;

  const p = calcPayroll(staff, history || []);
  const cfg = staff._cfg || {};

  const handleAddBonus = () => {
    const amt = parseInt(bonusAmt, 10);
    if (!amt || amt <= 0) { setDialog({ title: 'Error', message: 'Enter a valid amount', type: 'error' }); return; }
    onAddBonus(staff.user_id, { amount: amt, note: bonusNote, date: new Date().toISOString() });
    setBonusAmt(''); setBonusNote(''); setShowBonusForm(false);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={sh.overlay} onPress={onClose}>
        <Pressable style={[sh.sheet, { height: '90%' }]} onPress={() => { }}>
          <View style={sh.handle} />
          <View style={pd.header}>
            <View>
              <Text style={pd.name}>{staff.name}</Text>
              <Text style={pd.role}>{staff.role?.toUpperCase()}</Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <MaterialIcons name="close" size={22} color="#94a3b8" />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1, paddingHorizontal: spacing.lg }} showsVerticalScrollIndicator={false}>

            {/* Base salary */}
            <View style={pd.section}>
              <Text style={pd.sectionTitle}>Base Salary</Text>
              {cfg.salaryType === 'monthly' && (
                <View style={pd.row}>
                  <Text style={pd.rowLbl}>Monthly Fixed</Text>
                  <Text style={[pd.rowVal, { fontWeight: '800' }]}>{fmt(cfg.monthlyRate || cfg.monthlySalary || 0)}</Text>
                </View>
              )}
              {cfg.salaryType === 'hourly' && (
                <>
                  <View style={pd.row}>
                    <Text style={pd.rowLbl}>Rate</Text>
                    <Text style={pd.rowVal}>{fmt(cfg.hourlyRate || 0)}/hr</Text>
                  </View>
                  <View style={pd.row}>
                    <Text style={pd.rowLbl}>Hours Worked</Text>
                    <Text style={pd.rowVal}>{p.totalHours || 0}h</Text>
                  </View>
                  <View style={pd.row}>
                    <Text style={pd.rowLbl}>Base Total</Text>
                    <Text style={[pd.rowVal, { fontWeight: '800' }]}>{fmt(p.base)}</Text>
                  </View>
                </>
              )}
              {cfg.salaryType === 'daily' && (
                <>
                  <View style={pd.row}>
                    <Text style={pd.rowLbl}>Daily Rate</Text>
                    <Text style={pd.rowVal}>{fmt(cfg.dailyRate || 0)}/day</Text>
                  </View>
                  <View style={pd.row}>
                    <Text style={pd.rowLbl}>Days Present</Text>
                    <Text style={pd.rowVal}>{p.daysWorked || 0} days</Text>
                  </View>
                  <View style={pd.row}>
                    <Text style={pd.rowLbl}>Base Total</Text>
                    <Text style={[pd.rowVal, { fontWeight: '800' }]}>{fmt(p.base)}</Text>
                  </View>
                </>
              )}
              {cfg.salaryType === 'weekly' && (
                <>
                  <View style={pd.row}>
                    <Text style={pd.rowLbl}>Weekly Rate</Text>
                    <Text style={pd.rowVal}>{fmt(cfg.weeklyRate || 0)}/wk</Text>
                  </View>
                  <View style={pd.row}>
                    <Text style={pd.rowLbl}>Full Weeks (≥5 days)</Text>
                    <Text style={pd.rowVal}>{p.fullWeeks || 0} weeks</Text>
                  </View>
                  <View style={pd.row}>
                    <Text style={pd.rowLbl}>Base Total</Text>
                    <Text style={[pd.rowVal, { fontWeight: '800' }]}>{fmt(p.base)}</Text>
                  </View>
                </>
              )}
            </View>

            {/* Deductions */}
            <View style={pd.section}>
              <Text style={pd.sectionTitle}>Deductions</Text>
              <View style={pd.row}>
                <Text style={pd.rowLbl}>Late Days ({staff.lateDays || 0} × {fmt(LATE_PENALTY)})</Text>
                <Text style={[pd.rowVal, { color: '#EF4444' }]}>-{fmt(p.latePenalty)}</Text>
              </View>
            </View>

            {/* Bonuses */}
            <View style={pd.section}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
                <Text style={pd.sectionTitle}>Bonuses</Text>
                <TouchableOpacity onPress={() => setShowBonusForm(v => !v)}>
                  <Text style={{ color: BLUE, fontWeight: '700', fontSize: typography.sm }}>+ Add Bonus</Text>
                </TouchableOpacity>
              </View>
              {(staff.bonuses || []).length === 0 && !showBonusForm ? (
                <Text style={pd.empty}>No bonuses this month</Text>
              ) : (
                (staff.bonuses || []).map((b, i) => (
                  <View key={i} style={pd.row}>
                    <Text style={pd.rowLbl}>{b.note || 'Bonus'} · {fmtDate(b.date)}</Text>
                    <Text style={[pd.rowVal, { color: '#10B981' }]}>+{fmt(b.amount)}</Text>
                  </View>
                ))
              )}
              {showBonusForm && (
                <View style={pd.bonusForm}>
                  <TextInput
                    style={pd.bonusInput}
                    value={bonusAmt}
                    onChangeText={setBonusAmt}
                    placeholder="Amount (so'm)"
                    placeholderTextColor="#94a3b8"
                    keyboardType="numeric"
                  />
                  <TextInput
                    style={pd.bonusInput}
                    value={bonusNote}
                    onChangeText={setBonusNote}
                    placeholder="Note (optional)"
                    placeholderTextColor="#94a3b8"
                  />
                  <TouchableOpacity style={pd.bonusBtn} onPress={handleAddBonus}>
                    <Text style={pd.bonusBtnTxt}>Add Bonus</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Net */}
            <View style={[pd.section, pd.netSection]}>
              <Text style={pd.sectionTitle}>Net Pay</Text>
              <Text style={pd.netAmount}>{fmt(p.net)}</Text>
            </View>

            {/* Daily Breakdown */}
            {(history || []).length > 0 && (
              <View style={pd.section}>
                <Text style={pd.sectionTitle}>Daily Breakdown</Text>
                {history.slice(0, 10).map((h, i) => (
                  <View key={i} style={pd.row}>
                    <View style={{ flex: 1 }}>
                      <Text style={pd.rowLbl}>{fmtDate(h.clock_in)}</Text>
                      <Text style={{ fontSize: typography.xs, color: '#94a3b8' }}>
                        {fmtTime(h.clock_in)} – {h.clock_out ? fmtTime(h.clock_out) : 'Active'}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={pd.rowVal}>{parseFloat(h.hours_worked || 0).toFixed(1)}h</Text>
                      {cfg.salaryType === 'hourly' && (
                        <Text style={{ fontSize: typography.xs, color: '#94a3b8' }}>
                          {fmt(parseFloat(h.hours_worked || 0) * (cfg.hourlyRate || 0))}
                        </Text>
                      )}
                      {cfg.salaryType === 'daily' && (h.status === 'present' || h.status === 'late') && (
                        <Text style={{ fontSize: typography.xs, color: '#94a3b8' }}>
                          {fmt(cfg.dailyRate || 0)}
                        </Text>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            )}

            <View style={{ height: spacing.xxl }} />
          </ScrollView>
          <ConfirmDialog dialog={dialog} onClose={() => setDialog(null)} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Export Modal ─────────────────────────────────────────────
function ExportModal({ visible, onClose, staff, histories }) {
  const [dialog, setDialog] = useState(null);
  const month = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const payrolls = staff.map(s => ({ ...s, p: calcPayroll(s, histories[s.user_id] || []) }));
  const total = payrolls.reduce((s, x) => s + x.p.net, 0);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={sh.overlay} onPress={onClose}>
        <Pressable style={[sh.sheet, { height: '75%' }]} onPress={() => { }}>
          <View style={sh.handle} />
          <Text style={sh.sheetTitle}>Export Payroll — {month}</Text>
          <ScrollView style={{ flex: 1, paddingHorizontal: spacing.lg }}>
            {payrolls.map((s, i) => (
              <View key={i} style={ex.row}>
                <View style={{ flex: 1 }}>
                  <Text style={ex.name}>{s.name}</Text>
                  <Text style={ex.role}>{s.role}</Text>
                </View>
                <Text style={ex.amt}>{fmt(s.p.net)}</Text>
              </View>
            ))}
            <View style={ex.totalRow}>
              <Text style={ex.totalLbl}>Total</Text>
              <Text style={ex.totalVal}>{fmt(total)}</Text>
            </View>
          </ScrollView>
          <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }}>
            <TouchableOpacity style={ex.exportBtn} onPress={() => { setDialog({ title: 'Exported', message: `Payroll summary for ${month} saved.`, type: 'success' }); onClose(); }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                <MaterialIcons name="upload" size={16} color="#fff" style={{ marginRight: 6 }} />
                <Text style={ex.exportBtnTxt}>Export Summary</Text>
              </View>
            </TouchableOpacity>
          </View>
          <ConfirmDialog dialog={dialog} onClose={() => setDialog(null)} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Check-In Sheet ───────────────────────────────────────────
function CheckInSheet({ visible, onClose, staff, onConfirm }) {
  const [time, setTime] = useState('');
  if (!staff) return null;
  const cfg = staff._cfg || {};

  return (
    <Sheet visible={visible} onClose={onClose} title={`Check In: ${staff.name}`}>
      <Text style={sh.sheetSub}>Scheduled: {cfg.shiftStart || '—'}  ·  {LATE_PENALTY.toLocaleString()} so'm late penalty</Text>
      <Text style={[sh.sheetSub, { marginBottom: spacing.md }]}>Leave empty to use current time.</Text>
      <TextInput
        style={ci.input}
        value={time}
        onChangeText={setTime}
        placeholder={`Scheduled start e.g. ${cfg.shiftStart || '09:00'}`}
        placeholderTextColor="#94a3b8"
        keyboardType="numbers-and-punctuation"
      />
      <TouchableOpacity style={ci.btn} onPress={() => { onConfirm(staff, time); onClose(); }}>
        <Text style={ci.btnTxt}>Confirm Check In</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[ci.btn, { backgroundColor: '#f1f5f9', marginTop: spacing.sm }]} onPress={onClose}>
        <Text style={[ci.btnTxt, { color: colors.textDark }]}>Cancel</Text>
      </TouchableOpacity>
      <View style={{ height: spacing.lg }} />
    </Sheet>
  );
}

// ════════════════════════════════════════════════════════
//  Date helpers (pure, outside component)
// ════════════════════════════════════════════════════════
const todayStr = () => new Date().toISOString().split('T')[0];
const firstOfMonthStr = () => { const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0]; };

// ════════════════════════════════════════════════════════
//  MAIN SCREEN
// ════════════════════════════════════════════════════════
export default function StaffAttendanceScreen() {
  // ── All useState hooks first (order must never change) ──
  const [tab, setTab] = useState('attendance');
  const [staff, setStaff] = useState([]);
  const [histories, setHistories] = useState({});
  const [salaryConfig, setSalaryConfig] = useState({});
  const [paidStatus, setPaidStatus] = useState({});
  const [bonusData, setBonusData] = useState({});
  const [lateDays, setLateDays] = useState({});
  const [credentials, setCredentials] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processing, setProcessing] = useState(null);
  const [now, setNow] = useState(new Date());
  const [payrollFrom, setPayrollFrom] = useState(firstOfMonthStr());
  const [payrollTo, setPayrollTo] = useState(todayStr());
  const [payrollData, setPayrollData] = useState([]);
  const [payrollLoading, setPayrollLoading] = useState(false);
  const [editLoginTarget, setEditLoginTarget] = useState(null);
  const [checkInTarget, setCheckInTarget] = useState(null);
  const [lpTarget, setLpTarget] = useState(null);
  const [historyTarget, setHistoryTarget] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [editInfoTarget, setEditInfoTarget] = useState(null);
  const [payNowTarget, setPayNowTarget] = useState(null);
  const [detailTarget, setDetailTarget] = useState(null);
  const [showExport, setShowExport] = useState(false);
  const [dialog, setDialog] = useState(null);
  // Attendance date filter
  const [attFrom, setAttFrom] = useState(todayStr());
  const [attTo, setAttTo] = useState(todayStr());
  const [attFiltered, setAttFiltered] = useState(null); // null = show live status
  const [attLoading, setAttLoading] = useState(false);

  // ── useCallback hooks (after all useState) ──
  const loadPayroll = useCallback(async (from, to) => {
    setPayrollLoading(true);
    try {
      const res = await shiftsAPI.getPayroll({ from, to });
      setPayrollData(res.data || []);
    } catch (_) { setPayrollData([]); }
    setPayrollLoading(false);
  }, []);

  const loadAttendance = useCallback(async (from, to) => {
    if (!from || !to) return;
    setAttLoading(true);
    try {
      const res = await shiftsAPI.getAll({ from, to });
      setAttFiltered(res.data || []);
    } catch (_) { setAttFiltered([]); }
    setAttLoading(false);
  }, []);

  // Live clock every 30s
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  // Daily reset — detect midnight date change and reload fresh data
  const [currentDateStr, setCurrentDateStr] = useState(todayStr);
  useEffect(() => {
    const check = () => {
      const d = todayStr();
      if (d !== currentDateStr) {
        setCurrentDateStr(d);
        // New day: reload staff status from server (server resets shifts daily)
        // and clear any locally-tracked absent/filtered state
        setAttFiltered(null);
        load();
      }
    };
    const t = setInterval(check, 60000); // check every minute
    return () => clearInterval(t);
  }, [currentDateStr, load]);

  // Reload payroll when tab opens or date range changes
  useEffect(() => {
    if (tab === 'payroll') loadPayroll(payrollFrom, payrollTo);
  }, [tab, payrollFrom, payrollTo, loadPayroll]);

  // Default salary config per role
  const getDefaultCfg = (role) => {
    const r = (role || '').toLowerCase();
    if (r.includes('kitchen')) return { ...SEED_SALARY.default_kitchen };
    if (r.includes('cashier')) return { ...SEED_SALARY.default_cashier };
    if (r.includes('cleaner')) return { ...SEED_SALARY.default_cleaner };
    return { ...SEED_SALARY.default_waitress };
  };

  const load = useCallback(async () => {
    try {
      const res = await shiftsAPI.getStaffStatus();
      const raw = res.data || [];
      setStaff(raw);

      // Build salary config from backend data (persists across refreshes)
      setSalaryConfig(prev => {
        const next = { ...prev };
        raw.forEach(s => {
          const def = getDefaultCfg(s.role);
          const backendType = s.salary_type || s.salaryType || null;
          const backendSalary = s.salary != null ? parseFloat(s.salary) : null;
          const rateKey =
            backendType === 'hourly' ? 'hourlyRate' :
              backendType === 'daily' ? 'dailyRate' :
                backendType === 'weekly' ? 'weeklyRate' : 'monthlyRate';

          // Always prefer backend values so edits survive refresh
          next[s.user_id] = {
            ...def,
            ...(next[s.user_id] || {}), // keep any in-memory tweaks
            ...(backendType && { salaryType: backendType }),
            ...(backendSalary != null && { [rateKey]: backendSalary }),
            ...(s.shift_start && { shiftStart: s.shift_start }),
            ...(s.shift_end && { shiftEnd: s.shift_end }),
          };
        });
        return next;
      });

      // Init late days from shift status
      setLateDays(prev => {
        const next = { ...prev };
        raw.forEach(s => {
          if (next[s.user_id] === undefined) next[s.user_id] = s.status === 'late' ? 1 : 0;
        });
        return next;
      });
    } catch (err) {
      console.error('StaffAttendance load error:', err?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Load history for a staff member
  const loadHistory = async (userId) => {
    if (histories[userId]) return; // cached
    setLoadingHistory(true);
    try {
      const from = new Date(); from.setDate(1); // start of month
      const res = await shiftsAPI.getAll({ user_id: userId, from: from.toISOString() });
      setHistories(h => ({ ...h, [userId]: res.data || [] }));
    } catch (err) {
      setHistories(h => ({ ...h, [userId]: [] }));
    } finally {
      setLoadingHistory(false);
    }
  };

  // Load payroll histories for all staff (lazy)
  const loadPayrollHistories = async () => {
    const from = new Date(); from.setDate(1);
    for (const s of staff) {
      if (!histories[s.user_id]) {
        try {
          const res = await shiftsAPI.getAll({ user_id: s.user_id, from: from.toISOString() });
          setHistories(h => ({ ...h, [s.user_id]: res.data || [] }));
        } catch (_) { }
      }
    }
  };

  useEffect(() => {
    if (tab === 'payroll' && staff.length > 0) loadPayrollHistories();
  }, [tab, staff]);

  // Augment staff with config and bonus data
  const augmented = staff.map(s => ({
    ...s,
    _cfg: salaryConfig[s.user_id] || getDefaultCfg(s.role),
    _cred: credentials[s.user_id] || null,
    bonuses: bonusData[s.user_id] || [],
    lateDays: lateDays[s.user_id] || 0,
    paidThisMonth: paidStatus[s.user_id] || false,
  }));

  // ── Actions ──────────────────────────────────────────
  const handleCheckIn = async (staffMember, scheduledTime, forceStatus) => {
    setProcessing(staffMember.user_id);
    try {
      let scheduled_start_time = null;
      if (scheduledTime) {
        const [h, m] = scheduledTime.split(':');
        if (h && m) {
          const d = new Date();
          d.setHours(parseInt(h, 10), parseInt(m, 10), 0, 0);
          scheduled_start_time = d.toISOString();
        }
      }
      await shiftsAPI.clockIn({
        user_id: staffMember.user_id,
        scheduled_start_time,
        ...(forceStatus && { status: forceStatus }),
      });
      await load();
    } catch (err) {
      setDialog({ title: 'Error', message: err?.response?.data?.error || 'Failed to check in', type: 'error' });
    } finally {
      setProcessing(null);
    }
  };

  // Clock in as LATE — bypasses the time modal, forces status='late'
  const handleCheckInLate = (staffMember) => {
    handleCheckIn(staffMember, null, 'late');
  };

  const handleCheckOut = async (staffMember) => {
    setDialog({
      title: 'Check Out',
      message: `Check out ${staffMember.name}?`,
      type: 'info',
      confirmLabel: 'Check Out',
      onConfirm: async () => {
        setDialog(null);
        setProcessing(staffMember.user_id);
        try {
          await shiftsAPI.adminClockOut(staffMember.user_id);
          await load(); // refresh attendance status
          // Reload shift history for this user so payroll recalculates
          try {
            const from = new Date(); from.setDate(1);
            const res = await shiftsAPI.getAll({ user_id: staffMember.user_id, from: from.toISOString() });
            setHistories(h => ({ ...h, [staffMember.user_id]: res.data || [] }));
          } catch (_) { }
          // Also reload payroll if user is on payroll tab
          if (tab === 'payroll') loadPayroll(payrollFrom, payrollTo);
        } catch (err) {
          setDialog({ title: 'Error', message: err?.response?.data?.error || 'Failed to check out', type: 'error' });
        } finally {
          setProcessing(null);
        }
      }
    });
  };

  const handleMarkAbsent = (staffMember) => {
    setDialog({
      title: 'Mark Absent',
      message: `Mark ${staffMember.name} absent today?`,
      type: 'danger',
      confirmLabel: 'Mark Absent',
      onConfirm: () => {
        setDialog(null);
        setStaff(prev => prev.map(s =>
          s.user_id === staffMember.user_id ? { ...s, status: 'absent' } : s
        ));
        setLateDays(prev => ({ ...prev, [staffMember.user_id]: (prev[staffMember.user_id] || 0) }));
      }
    });
  };

  const handleViewHistory = async (staffMember) => {
    setHistoryTarget(staffMember);
    await loadHistory(staffMember.user_id);
  };

  const handleSaveStaffInfo = (updatedUser) => {
    // Update local staff list with new data from backend response
    setStaff(prev => prev.map(s =>
      (s.user_id === updatedUser.id || s.user_id === updatedUser.user_id)
        ? {
          ...s,
          name: updatedUser.name,
          role: updatedUser.role,
          salary: updatedUser.salary,
          salary_type: updatedUser.salary_type,
          shift_start: updatedUser.shift_start,
          shift_end: updatedUser.shift_end,
        }
        : s
    ));
    // Sync local salary config with the saved values so UI is immediately correct
    const uid = updatedUser.id || updatedUser.user_id;
    const salType = updatedUser.salary_type || 'monthly';
    const rateKey =
      salType === 'hourly' ? 'hourlyRate' :
        salType === 'daily' ? 'dailyRate' :
          salType === 'weekly' ? 'weeklyRate' : 'monthlyRate';
    setSalaryConfig(prev => ({
      ...prev,
      [uid]: {
        ...(prev[uid] || getDefaultCfg(updatedUser.role)),
        salaryType: salType,
        [rateKey]: parseFloat(updatedUser.salary) || 0,
        shiftStart: updatedUser.shift_start || '',
        shiftEnd: updatedUser.shift_end || '',
      },
    }));
  };

  const handleSaveLogin = (updatedUser) => {
    // Update the email in local staff state
    setStaff(prev => prev.map(s =>
      (s.user_id === updatedUser.id || s.user_id === updatedUser.user_id)
        ? { ...s, email: updatedUser.email }
        : s
    ));
  };

  const handleSuspend = (staffMember) => {
    setDialog({
      title: 'Suspend Account',
      message: `Suspend ${staffMember.name}? They will not be able to log in.`,
      type: 'warning',
      confirmLabel: 'Suspend',
      onConfirm: () => {
        setDialog(null);
        setCredentials(prev => ({
          ...prev,
          [staffMember.user_id]: { ...(prev[staffMember.user_id] || {}), status: 'suspended' },
        }));
      }
    });
  };

  const handleReactivate = (staffMember) => {
    setDialog({
      title: 'Reactivate Account',
      message: `Reactivate ${staffMember.name}'s account?`,
      type: 'info',
      confirmLabel: 'Reactivate',
      onConfirm: () => {
        setDialog(null);
        setCredentials(prev => ({
          ...prev,
          [staffMember.user_id]: { ...(prev[staffMember.user_id] || {}), status: 'active' },
        }));
      }
    });
  };

  const handleDeleteStaff = (staffMember) => {
    setDialog({
      title: 'Remove Staff Member',
      message: `Are you sure you want to permanently remove ${staffMember.name}? This cannot be undone.`,
      type: 'danger',
      confirmLabel: 'Remove',
      onConfirm: async () => {
        setDialog(null);
        try {
          await usersAPI.delete(staffMember.user_id);
          setStaff(prev => prev.filter(s => s.user_id !== staffMember.user_id));
        } catch (err) {
          setDialog({ title: 'Error', message: err?.response?.data?.error || 'Could not remove staff member.', type: 'error' });
        }
      }
    });
  };

  const handlePayNow = (staffMember, method) => {
    setDialog({
      title: 'Payment Confirmed',
      message: `${staffMember.name} has been paid via ${method}.`,
      type: 'success',
      onConfirm: () => {
        setDialog(null);
        setPaidStatus(prev => ({ ...prev, [staffMember.user_id]: true }));
      }
    });
  };

  const handleAddBonus = (userId, bonus) => {
    setBonusData(prev => ({
      ...prev,
      [userId]: [...(prev[userId] || []), bonus],
    }));
  };

  // ── Render ────────────────────────────────────────────
  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={BLUE} />
        <Text style={s.loadingTxt}>Loading staff…</Text>
      </View>
    );
  }

  return (
    <View style={s.container}>

      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>Staff</Text>
          <Text style={s.headerSub}>{'Attendance & Payroll'}</Text>
        </View>
        {tab === 'payroll' && (
          <TouchableOpacity style={s.exportBtn} onPress={() => setShowExport(true)}>
            <Text style={s.exportBtnTxt}>Export</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Tabs */}
      <View style={s.tabBar}>
        {[['attendance', 'Attendance', 'person'], ['payroll', 'Payroll', 'payments']].map(([key, lbl, icon]) => (
          <TouchableOpacity
            key={key}
            style={[s.tabBtn, tab === key && s.tabBtnActive]}
            onPress={() => setTab(key)}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <MaterialIcons name={icon} size={14} color={tab === key ? colors.admin : colors.textMuted} style={{ marginRight: 4 }} />
              <Text style={[s.tabBtnTxt, tab === key && s.tabBtnTxtActive]}>{lbl}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      {tab === 'attendance' ? (
        <>
          {/* Date Range Filter */}
          <View style={pr.rangeBar}>
            <View style={pr.rangeField}>
              <Text style={pr.rangeLabel}>From</Text>
              <TextInput
                style={pr.rangeInput}
                value={attFrom}
                onChangeText={setAttFrom}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#94a3b8"
                keyboardType="numbers-and-punctuation"
              />
            </View>
            <Text style={pr.rangeSep}>→</Text>
            <View style={pr.rangeField}>
              <Text style={pr.rangeLabel}>To</Text>
              <TextInput
                style={pr.rangeInput}
                value={attTo}
                onChangeText={setAttTo}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#94a3b8"
                keyboardType="numbers-and-punctuation"
              />
            </View>
            <TouchableOpacity style={pr.applyBtn} onPress={() => loadAttendance(attFrom, attTo)}>
              <Text style={pr.applyTxt}>Filter</Text>
            </TouchableOpacity>
          </View>

          {/* Quick presets */}
          <View style={[pr.presets, { paddingHorizontal: spacing.lg }]}>
            {[
              { label: 'Today', from: todayStr(), to: todayStr() },
              { label: 'This Week', from: (() => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d.toISOString().split('T')[0]; })(), to: todayStr() },
              { label: 'This Month', from: firstOfMonthStr(), to: todayStr() },
            ].map(p => (
              <TouchableOpacity key={p.label} style={pr.preset} onPress={() => { setAttFrom(p.from); setAttTo(p.to); loadAttendance(p.from, p.to); }}>
                <Text style={pr.presetTxt}>{p.label}</Text>
              </TouchableOpacity>
            ))}
            {attFiltered !== null && (
              <TouchableOpacity style={[pr.preset, { borderColor: '#EF4444' }]} onPress={() => setAttFiltered(null)}>
                <Text style={[pr.presetTxt, { color: '#EF4444' }]}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>

          <SummaryRow staff={augmented} now={now} />
          <ScrollView
            style={s.list}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); setAttFiltered(null); }} tintColor={BLUE} />}
          >
            {attLoading ? (
              <ActivityIndicator color={BLUE} style={{ marginTop: 40 }} />
            ) : attFiltered !== null ? (
              // Filtered view: group shifts by user
              (() => {
                const byUser = {};
                (attFiltered || []).forEach(sh => {
                  const uid = sh.user_id;
                  if (!byUser[uid]) byUser[uid] = { name: sh.name, role: sh.role, shifts: [] };
                  byUser[uid].shifts.push(sh);
                });
                const entries = Object.entries(byUser);
                if (entries.length === 0) return <Text style={{ textAlign: 'center', color: colors.textMuted, marginTop: 40 }}>No shifts in this period</Text>;
                return entries.map(([uid, data]) => (
                  <View key={uid} style={[ac.card, { flexDirection: 'column' }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm }}>
                      <Text style={[ac.name, { flex: 1 }]}>{data.name}</Text>
                      <Text style={{ fontSize: 11, color: BLUE, fontWeight: '700' }}>{data.shifts.length} shifts</Text>
                    </View>
                    <Text style={ac.role}>{data.role?.toUpperCase()}</Text>
                    {data.shifts.slice(0, 5).map((sh, i) => {
                      const hrs = parseFloat(sh.hours_worked || 0).toFixed(1);
                      return (
                        <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderTopWidth: i === 0 ? 1 : 0, borderTopColor: '#f1f5f9', marginTop: i === 0 ? spacing.sm : 0 }}>
                          <Text style={{ fontSize: typography.xs, color: colors.textMuted }}>{fmtDate(sh.clock_in)}  {fmtTime(sh.clock_in)} – {sh.clock_out ? fmtTime(sh.clock_out) : 'Active'}</Text>
                          <Text style={{ fontSize: typography.xs, fontWeight: '700', color: colors.textDark }}>{hrs}h</Text>
                        </View>
                      );
                    })}
                  </View>
                ));
              })()
            ) : (
              augmented.map(item => (
                <AttCard
                  key={item.user_id}
                  item={item}
                  cred={credentials[item.user_id] || null}
                  now={now}
                  processing={processing}
                  onCheckIn={(st) => setCheckInTarget(st)}
                  onCheckInLate={handleCheckInLate}
                  onCheckOut={handleCheckOut}
                  onMarkAbsent={handleMarkAbsent}
                  onLongPress={(st) => setLpTarget(st)}
                />
              ))
            )}
            <View style={{ height: 80 }} />
          </ScrollView>
        </>
      ) : (
        <ScrollView
          style={s.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); loadPayroll(payrollFrom, payrollTo); }} tintColor={BLUE} />}
        >
          {/* Date Range Picker */}
          <View style={pr.rangeBar}>
            <View style={pr.rangeField}>
              <Text style={pr.rangeLabel}>From</Text>
              <TextInput
                style={pr.rangeInput}
                value={payrollFrom}
                onChangeText={setPayrollFrom}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#94a3b8"
                keyboardType="numbers-and-punctuation"
              />
            </View>
            <Text style={pr.rangeSep}>→</Text>
            <View style={pr.rangeField}>
              <Text style={pr.rangeLabel}>To</Text>
              <TextInput
                style={pr.rangeInput}
                value={payrollTo}
                onChangeText={setPayrollTo}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#94a3b8"
                keyboardType="numbers-and-punctuation"
              />
            </View>
            <TouchableOpacity style={pr.applyBtn} onPress={() => loadPayroll(payrollFrom, payrollTo)}>
              <Text style={pr.applyTxt}>Apply</Text>
            </TouchableOpacity>
          </View>

          {/* Quick presets */}
          <View style={pr.presets}>
            {[
              { label: 'This Month', from: firstOfMonthStr(), to: todayStr() },
              { label: 'Last 7 Days', from: (() => { const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().split('T')[0]; })(), to: todayStr() },
              { label: 'Last 30 Days', from: (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split('T')[0]; })(), to: todayStr() },
            ].map(p => (
              <TouchableOpacity key={p.label} style={pr.preset} onPress={() => { setPayrollFrom(p.from); setPayrollTo(p.to); loadPayroll(p.from, p.to); }}>
                <Text style={pr.presetTxt}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {payrollLoading ? (
            <ActivityIndicator color={BLUE} style={{ marginTop: 40 }} />
          ) : payrollData.length === 0 ? (
            <>
              <PayrollSummaryScroll staff={augmented} histories={histories} />
              {augmented.map(item => (
                <PayrollCard
                  key={item.user_id}
                  staff={item}
                  history={histories[item.user_id] || []}
                  onPayNow={(st) => setPayNowTarget(st)}
                  onDetails={(st) => setDetailTarget(st)}
                />
              ))}
            </>
          ) : (
            <>
              {/* Payroll summary total */}
              <View style={pr.totalCard}>
                <Text style={pr.totalLbl}>Total Payroll ({payrollFrom} → {payrollTo})</Text>
                <Text style={pr.totalAmt}>{fmt(payrollData.reduce((s, r) => s + parseFloat(r.gross_pay || 0), 0))}</Text>
              </View>

              {payrollData.map((row, i) => (
                <View key={i} style={pr.card}>
                  <View style={pr.cardTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={pr.name}>{row.name}</Text>
                      <Text style={pr.role}>{row.role?.toUpperCase()}</Text>
                    </View>
                    <Text style={pr.netPay}>{fmt(parseFloat(row.gross_pay || 0))}</Text>
                  </View>
                  <View style={pr.cardMeta}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <MaterialIcons name="schedule" size={12} color="#94a3b8" style={{ marginRight: 3 }} />
                      <Text style={pr.metaTxt}>{parseFloat(row.total_hours || 0).toFixed(1)}h worked</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <MaterialIcons name="assignment" size={12} color="#94a3b8" style={{ marginRight: 3 }} />
                      <Text style={pr.metaTxt}>{row.shift_count} shifts</Text>
                    </View>
                  </View>
                </View>
              ))}
            </>
          )}
          <View style={{ height: 80 }} />
        </ScrollView>
      )}

      {/* ── Modals ── */}
      <CheckInSheet
        visible={!!checkInTarget}
        staff={checkInTarget}
        onClose={() => setCheckInTarget(null)}
        onConfirm={handleCheckIn}
      />

      <LongPressSheet
        visible={!!lpTarget}
        staff={lpTarget}
        onClose={() => setLpTarget(null)}
        onEdit={(st) => { setLpTarget(null); setEditInfoTarget(st); }}
        onResetPassword={(st) => { setLpTarget(null); setEditLoginTarget(st); }}
        onDelete={handleDeleteStaff}
      />

      <EditStaffSheet
        visible={!!editInfoTarget}
        staff={editInfoTarget ? augmented.find(s => s.user_id === editInfoTarget.user_id) || editInfoTarget : null}
        onClose={() => setEditInfoTarget(null)}
        onSaved={handleSaveStaffInfo}
      />

      <EditLoginSheet
        visible={!!editLoginTarget}
        staff={editLoginTarget}
        onClose={() => setEditLoginTarget(null)}
        onSaved={handleSaveLogin}
      />

      <HistoryModal
        visible={!!historyTarget}
        staff={historyTarget ? augmented.find(s => s.user_id === historyTarget.user_id) : null}
        history={historyTarget ? histories[historyTarget.user_id] : []}
        loadingHistory={loadingHistory}
        onClose={() => setHistoryTarget(null)}
      />

      <PayNowSheet
        visible={!!payNowTarget}
        staff={payNowTarget}
        history={payNowTarget ? histories[payNowTarget.user_id] : []}
        onClose={() => setPayNowTarget(null)}
        onConfirm={handlePayNow}
      />

      <PayrollDetailModal
        visible={!!detailTarget}
        staff={detailTarget}
        history={detailTarget ? histories[detailTarget.user_id] : []}
        onClose={() => setDetailTarget(null)}
        onAddBonus={handleAddBonus}
      />

      <ExportModal
        visible={showExport}
        onClose={() => setShowExport(false)}
        staff={augmented}
        histories={histories}
      />

      <ConfirmDialog dialog={dialog} onClose={() => setDialog(null)} />
    </View>
  );
}

// ════════════════════════════════════════════════════════
//  STYLES
// ════════════════════════════════════════════════════════

// Shared sheet styles
const sh = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: spacing.lg, paddingTop: spacing.md, maxHeight: '92%' },
  handle: { width: 40, height: 4, backgroundColor: '#E2E8F0', borderRadius: 2, alignSelf: 'center', marginBottom: spacing.md },
  sheetTitle: { fontSize: typography.lg, fontWeight: '800', color: colors.textDark, marginBottom: 4 },
  sheetSub: { fontSize: typography.sm, color: colors.textMuted },
});

// Main screen
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingTxt: { marginTop: spacing.md, color: colors.textMuted, fontSize: typography.sm },
  header: { backgroundColor: BLUE, paddingHorizontal: spacing.xl, paddingTop: topInset + 16, paddingBottom: spacing.lg, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  headerTitle: { fontSize: typography.xxl, fontWeight: '900', color: '#fff' },
  headerSub: { fontSize: typography.sm, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  exportBtn: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.md },
  exportBtnTxt: { color: '#fff', fontWeight: '700', fontSize: typography.sm },
  tabBar: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: colors.border },
  tabBtn: { flex: 1, paddingVertical: 13, alignItems: 'center' },
  tabBtnActive: { borderBottomWidth: 2.5, borderBottomColor: BLUE },
  tabBtnTxt: { fontSize: typography.sm, color: colors.textMuted, fontWeight: '600' },
  tabBtnTxtActive: { color: BLUE, fontWeight: '800' },
  list: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  fab: { position: 'absolute', bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: BLUE, justifyContent: 'center', alignItems: 'center', ...shadow.lg },
  fabTxt: { color: '#fff', fontSize: 28, fontWeight: '300', lineHeight: 32 },
});

// Summary row
const sr = StyleSheet.create({
  row: { flexDirection: 'row', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: colors.border, gap: spacing.sm },
  chip: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 1 },
  val: { fontSize: typography.lg, fontWeight: '900' },
  lbl: { fontSize: 10, color: colors.textMuted, fontWeight: '600', marginTop: 2 },
});

// Attendance card
const ac = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, flexDirection: 'row', alignItems: 'center', ...shadow.sm },
  cardSuspended: { backgroundColor: '#fafafa', opacity: 0.75 },
  left: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  dot: { width: 12, height: 12, borderRadius: 6, marginTop: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  name: { fontSize: typography.md, fontWeight: '800', color: colors.textDark },
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.full },
  badgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  suspendedBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.full, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA' },
  suspendedTxt: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5, color: '#DC2626' },
  role: { fontSize: 10, color: BLUE, fontWeight: '700', letterSpacing: 0.8, marginTop: 2 },
  phone: { fontSize: typography.xs, color: colors.textMuted, marginTop: 2, letterSpacing: 0.3 },
  shift: { fontSize: typography.xs, color: '#64748b', marginTop: 3 },
  detail: { fontSize: typography.xs, color: colors.textMuted, marginTop: 2 },
  right: { marginLeft: spacing.md },
  btn: { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.md, minWidth: 64, alignItems: 'center' },
  btnIn:   { backgroundColor: '#10B981' },
  btnLate: { backgroundColor: '#F59E0B', marginTop: 6 },
  btnOut:  { backgroundColor: '#EF4444' },
  btnTxt: { color: '#fff', fontWeight: '800', fontSize: typography.sm },
  // Absent badge (read-only — no tap)
  btnAbsent: {
    backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA',
    borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 8,
    minWidth: 64, alignItems: 'center',
  },
  btnAbsentTxt: { color: '#EF4444', fontWeight: '800', fontSize: 11, letterSpacing: 0.5 },
  // Done badge with sub-label showing hours
  btnDone: {
    backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#BBF7D0',
    borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 6,
    minWidth: 64, alignItems: 'center',
  },
  btnDoneTxt: { color: '#059669', fontWeight: '800', fontSize: 11, letterSpacing: 0.5 },
  btnDoneSub: { color: '#059669', fontWeight: '600', fontSize: 10, marginTop: 2 },
  // Stack for "not started" state: Clock In on top, Absent below
  actionStack: { alignItems: 'center' },
  // Small Absent tap button (below Clock In)
  btnAbsentSmall: {
    marginTop: 6, paddingHorizontal: spacing.md, paddingVertical: 5,
    borderRadius: radius.md, borderWidth: 1, borderColor: '#FECACA',
    backgroundColor: '#FEF2F2', minWidth: 64, alignItems: 'center',
  },
  btnAbsentSmallTxt: { color: '#EF4444', fontWeight: '700', fontSize: 11 },
});

// History modal
const hm = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  name: { fontSize: typography.lg, fontWeight: '800', color: colors.textDark },
  role: { fontSize: 10, color: BLUE, fontWeight: '700', letterSpacing: 0.8, marginTop: 2 },
  tabs: { flexDirection: 'row', paddingHorizontal: spacing.lg, gap: spacing.sm, marginBottom: spacing.md },
  tab: { flex: 1, paddingVertical: 8, borderRadius: radius.md, backgroundColor: '#f1f5f9', alignItems: 'center' },
  tabActive: { backgroundColor: BLUE },
  tabTxt: { fontSize: typography.sm, color: colors.textMuted, fontWeight: '600' },
  tabTxtActive: { color: '#fff', fontWeight: '800' },
  summary: { flexDirection: 'row', paddingHorizontal: spacing.lg, gap: spacing.sm, marginBottom: spacing.md },
  sumChip: { flex: 1, backgroundColor: '#f8fafc', borderRadius: radius.md, padding: spacing.sm, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  sumVal: { fontSize: typography.lg, fontWeight: '900', color: colors.textDark },
  sumLbl: { fontSize: 10, color: colors.textMuted, fontWeight: '600', marginTop: 2 },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 32, fontSize: typography.sm },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  rowDate: { fontSize: typography.sm, fontWeight: '700', color: colors.textDark },
  rowTime: { fontSize: typography.xs, color: colors.textMuted, marginTop: 2 },
  rowHours: { fontSize: typography.sm, fontWeight: '800', color: colors.textDark },
  rowBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.full, marginTop: 3 },
  rowBadgeTxt: { fontSize: 10, fontWeight: '700' },
});

// Long-press sheet
const lp = StyleSheet.create({
  row: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  rowTxt: { fontSize: typography.md, fontWeight: '600' },
  cancel: { marginTop: spacing.md, paddingVertical: 14, alignItems: 'center', backgroundColor: '#f1f5f9', borderRadius: radius.md, marginBottom: spacing.sm },
  cancelTxt: { fontSize: typography.md, fontWeight: '700', color: colors.textMuted },
});

// Add staff sheet
const as = StyleSheet.create({
  label: { fontSize: typography.sm, fontWeight: '700', color: colors.textDark, marginBottom: spacing.xs, marginTop: spacing.md },
  optional: { fontWeight: '400', color: colors.textMuted },
  input: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontSize: typography.md, color: colors.textDark },
  row2: { flexDirection: 'row' },
  // pill selectors (roles + salary types)
  pillRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', marginBottom: spacing.xs },
  pill: { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.full, backgroundColor: '#f1f5f9', borderWidth: 1.5, borderColor: '#e2e8f0' },
  pillActive: { backgroundColor: BLUE + '15', borderColor: BLUE },
  pillTxt: { fontSize: typography.sm, color: colors.textMuted, fontWeight: '600' },
  pillTxtActive: { color: BLUE, fontWeight: '800' },
  pillSuspend: { backgroundColor: '#FEF2F2', borderColor: '#EF4444' },
  pillTxtSuspend: { color: '#EF4444', fontWeight: '800' },
  // credentials section
  credSection: { marginTop: spacing.xl, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
  credTitle: { fontSize: typography.sm, fontWeight: '800', color: BLUE, textTransform: 'uppercase', letterSpacing: 0.8 },
  credHint: { fontSize: typography.xs, color: colors.textMuted, marginTop: spacing.sm, lineHeight: 17 },
  errBox: { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', borderRadius: radius.md, padding: spacing.sm, marginBottom: spacing.sm },
  errTxt: { color: '#DC2626', fontSize: typography.xs, fontWeight: '600' },
  pwRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  eyeBtn: { paddingHorizontal: spacing.md, paddingVertical: 14, backgroundColor: '#f8fafc', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  eyeTxt: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  maskedPhoneRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f8fafc', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.xs },
  maskedPhoneTxt: { fontSize: typography.md, color: colors.textDark, fontWeight: '600', letterSpacing: 1 },
  changePhoneBtn: { backgroundColor: BLUE + '15', paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.md },
  changePhonetTxt: { color: BLUE, fontWeight: '700', fontSize: typography.xs },
  saveBtn: { backgroundColor: BLUE, borderRadius: radius.md, padding: spacing.md, alignItems: 'center', marginTop: spacing.lg },
  saveBtnTxt: { color: '#fff', fontWeight: '800', fontSize: typography.md },
});

// Reset password sheet
const rp = StyleSheet.create({
  err: { color: '#DC2626', fontSize: typography.xs, fontWeight: '600', marginBottom: spacing.sm, backgroundColor: '#FEF2F2', padding: spacing.sm, borderRadius: radius.md },
  label: { fontSize: typography.sm, fontWeight: '700', color: colors.textDark, marginBottom: spacing.xs, marginTop: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  input: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontSize: typography.md, color: colors.textDark },
  eye: { paddingHorizontal: spacing.md, paddingVertical: 14, backgroundColor: '#f8fafc', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  eyeTxt: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  btn: { backgroundColor: BLUE, borderRadius: radius.md, padding: spacing.md, alignItems: 'center', marginTop: spacing.lg },
  btnTxt: { color: '#fff', fontWeight: '800', fontSize: typography.md },
});

// Payroll summary
const ps = StyleSheet.create({
  scroll: { flexGrow: 0, marginBottom: spacing.md },
  content: { paddingRight: spacing.lg, gap: spacing.sm },
  card: { width: 140, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1 },
  val: { fontSize: typography.md, fontWeight: '900', marginBottom: 2 },
  lbl: { fontSize: 11, color: colors.textMuted, fontWeight: '600' },
});

// Payroll card
const pc = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, ...shadow.sm },
  top: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm, gap: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
  name: { fontSize: typography.md, fontWeight: '800', color: colors.textDark },
  role: { fontSize: 10, color: colors.textMuted, fontWeight: '600', marginTop: 1 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full },
  paidBadge: { backgroundColor: '#f0fdf4' },
  pendingBadge: { backgroundColor: '#fffbeb' },
  badgeTxt: { fontSize: 11, fontWeight: '700' },
  amounts: { flexDirection: 'row', backgroundColor: '#f8fafc', borderRadius: radius.md, padding: spacing.sm, gap: spacing.sm, marginBottom: spacing.sm, flexWrap: 'wrap' },
  amtCol: { alignItems: 'center', flex: 1, minWidth: 70 },
  amtLbl: { fontSize: 10, color: colors.textMuted, fontWeight: '600', marginBottom: 2 },
  amtVal: { fontSize: typography.sm, fontWeight: '700', color: colors.textDark },
  netVal: { color: BLUE, fontWeight: '900', fontSize: typography.md },
  actions: { flexDirection: 'row', gap: spacing.sm },
  detailsBtn: { flex: 1, paddingVertical: 9, borderRadius: radius.md, backgroundColor: '#f1f5f9', alignItems: 'center' },
  detailsBtnTxt: { fontSize: typography.sm, fontWeight: '700', color: colors.textDark },
  payBtn: { flex: 2, paddingVertical: 9, borderRadius: radius.md, backgroundColor: BLUE, alignItems: 'center' },
  payBtnTxt: { fontSize: typography.sm, fontWeight: '800', color: '#fff' },
});

// Pay now sheet
const pn = StyleSheet.create({
  staffName: { fontSize: typography.lg, fontWeight: '800', color: colors.textDark },
  staffRole: { fontSize: typography.sm, color: colors.textMuted, marginBottom: spacing.md },
  amountBox: { backgroundColor: '#eff6ff', borderRadius: radius.lg, padding: spacing.lg, alignItems: 'center', marginBottom: spacing.lg },
  amtLbl: { fontSize: typography.sm, color: '#3B82F6', fontWeight: '600', marginBottom: spacing.xs },
  amtVal: { fontSize: 28, fontWeight: '900', color: BLUE },
  methodLbl: { fontSize: typography.sm, fontWeight: '700', color: colors.textDark, marginBottom: spacing.sm },
  methodRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  methodBtn: { flex: 1, paddingVertical: 10, borderRadius: radius.md, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  methodBtnActive: { backgroundColor: BLUE + '12', borderColor: BLUE },
  methodBtnTxt: { fontSize: typography.xs, fontWeight: '600', color: colors.textMuted },
  methodBtnTxtActive: { color: BLUE, fontWeight: '800' },
  confirmBtn: { backgroundColor: BLUE, borderRadius: radius.md, padding: spacing.md, alignItems: 'center' },
  confirmBtnTxt: { color: '#fff', fontWeight: '800', fontSize: typography.md },
  cancelBtn: { marginTop: spacing.sm, padding: spacing.md, alignItems: 'center' },
  cancelBtnTxt: { color: colors.textMuted, fontWeight: '600' },
});

// Payroll detail modal
const pd = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  name: { fontSize: typography.lg, fontWeight: '800', color: colors.textDark },
  role: { fontSize: 10, color: BLUE, fontWeight: '700', letterSpacing: 0.8, marginTop: 2 },
  section: { marginBottom: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  sectionTitle: { fontSize: typography.sm, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 5 },
  rowLbl: { fontSize: typography.sm, color: colors.textMuted, flex: 1 },
  rowVal: { fontSize: typography.sm, fontWeight: '700', color: colors.textDark },
  netSection: { backgroundColor: '#eff6ff', borderRadius: radius.md, padding: spacing.md, borderBottomWidth: 0 },
  netAmount: { fontSize: 28, fontWeight: '900', color: BLUE, marginTop: 4 },
  empty: { fontSize: typography.sm, color: colors.textMuted, fontStyle: 'italic' },
  bonusForm: { backgroundColor: '#f8fafc', borderRadius: radius.md, padding: spacing.md, marginTop: spacing.sm, gap: spacing.sm },
  bonusInput: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontSize: typography.sm, color: colors.textDark },
  bonusBtn: { backgroundColor: '#10B981', borderRadius: radius.md, padding: spacing.sm, alignItems: 'center' },
  bonusBtnTxt: { color: '#fff', fontWeight: '700', fontSize: typography.sm },
});

// Export modal
const ex = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  name: { fontSize: typography.sm, fontWeight: '700', color: colors.textDark },
  role: { fontSize: 10, color: colors.textMuted, marginTop: 2 },
  amt: { fontSize: typography.sm, fontWeight: '800', color: colors.textDark },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.md },
  totalLbl: { fontSize: typography.md, fontWeight: '800', color: colors.textDark },
  totalVal: { fontSize: typography.md, fontWeight: '900', color: BLUE },
  exportBtn: { backgroundColor: BLUE, borderRadius: radius.md, padding: spacing.md, alignItems: 'center' },
  exportBtnTxt: { color: '#fff', fontWeight: '800', fontSize: typography.md },
});

// Edit staff info sheet
const es = StyleSheet.create({
  label: { fontSize: typography.sm, fontWeight: '700', color: colors.textDark, marginBottom: spacing.xs, marginTop: spacing.md },
  input: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontSize: typography.md, color: colors.textDark },
  pillRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', marginBottom: spacing.xs },
  pill: { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.full, backgroundColor: '#f1f5f9', borderWidth: 1.5, borderColor: '#e2e8f0' },
  pillActive: { backgroundColor: BLUE + '15', borderColor: BLUE },
  pillTxt: { fontSize: typography.sm, color: colors.textMuted, fontWeight: '600' },
  pillTxtActive: { color: BLUE, fontWeight: '800' },
  rowTwo: { flexDirection: 'row' },
  errBox: { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', borderRadius: radius.md, padding: spacing.sm, marginBottom: spacing.sm },
  errTxt: { color: '#DC2626', fontSize: typography.xs, fontWeight: '600' },
  saveBtn: { backgroundColor: BLUE, borderRadius: radius.md, padding: spacing.md, alignItems: 'center', marginTop: spacing.lg },
  saveBtnTxt: { color: '#fff', fontWeight: '800', fontSize: typography.md },
});

// Edit login sheet
const el = StyleSheet.create({
  label: { fontSize: typography.sm, fontWeight: '700', color: colors.textDark, marginBottom: spacing.xs, marginTop: spacing.md },
  optional: { fontWeight: '400', color: colors.textMuted },
  input: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontSize: typography.md, color: colors.textDark },
  pwRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  eyeBtn: { paddingHorizontal: spacing.md, paddingVertical: 14, backgroundColor: '#f8fafc', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  eyeTxt: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  errBox: { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', borderRadius: radius.md, padding: spacing.sm, marginBottom: spacing.sm },
  errTxt: { color: '#DC2626', fontSize: typography.xs, fontWeight: '600' },
  saveBtn: { backgroundColor: BLUE, borderRadius: radius.md, padding: spacing.md, alignItems: 'center', marginTop: spacing.lg },
  saveBtnTxt: { color: '#fff', fontWeight: '800', fontSize: typography.md },
});

// Payroll range bar
const pr = StyleSheet.create({
  rangeBar: { backgroundColor: '#fff', borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, ...shadow.sm },
  rangeField: { flex: 1 },
  rangeLabel: { fontSize: 10, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', marginBottom: 4 },
  rangeInput: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, fontSize: 13, color: colors.textDark, textAlign: 'center' },
  rangeSep: { fontSize: 16, color: colors.textMuted, fontWeight: '700', paddingBottom: 8 },
  applyBtn: { backgroundColor: BLUE, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10 },
  applyTxt: { color: '#fff', fontWeight: '800', fontSize: typography.sm },
  presets: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  preset: { flex: 1, backgroundColor: '#fff', borderRadius: radius.md, paddingVertical: 8, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  presetTxt: { fontSize: 11, color: BLUE, fontWeight: '700' },
  totalCard: { backgroundColor: '#eff6ff', borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md, alignItems: 'center' },
  totalLbl: { fontSize: typography.xs, color: '#3B82F6', fontWeight: '600', marginBottom: 4 },
  totalAmt: { fontSize: 26, fontWeight: '900', color: BLUE },
  card: { backgroundColor: '#fff', borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, ...shadow.sm },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xs },
  name: { fontSize: typography.md, fontWeight: '800', color: colors.textDark },
  role: { fontSize: 10, color: BLUE, fontWeight: '700', letterSpacing: 0.8, marginTop: 2 },
  netPay: { fontSize: typography.lg, fontWeight: '900', color: BLUE },
  cardMeta: { flexDirection: 'row', gap: spacing.lg },
  metaTxt: { fontSize: typography.xs, color: colors.textMuted, fontWeight: '600' },
});

// Check in sheet
const ci = StyleSheet.create({
  input: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontSize: typography.md, color: colors.textDark, marginTop: spacing.md, marginBottom: spacing.md },
  btn: { backgroundColor: BLUE, borderRadius: radius.md, padding: spacing.md, alignItems: 'center' },
  btnTxt: { color: '#fff', fontWeight: '800', fontSize: typography.md },
});


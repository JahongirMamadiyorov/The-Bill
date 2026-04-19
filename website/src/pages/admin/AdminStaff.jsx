import { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from '../../context/LanguageContext';
import { money } from '../../hooks/useApi';
import { usersAPI, shiftsAPI, staffPaymentsAPI, permissionsAPI, menuAPI } from '../../api/client';
import Dropdown from '../../components/Dropdown';
import DatePicker from '../../components/DatePicker';
import PhoneInput, { formatPhoneDisplay } from '../../components/PhoneInput';
import {
  Plus, Edit2, Trash2, X, Users, Shield, Key, Search, RefreshCw, AlertTriangle,
  Check, XCircle, AlertCircle, CheckCircle, Clock, LogOut, LogIn, DollarSign,
  ChevronDown, ChevronLeft, ChevronRight, Eye, EyeOff, Calendar, Play, Square, UserX, Timer, FileText,
  CreditCard, Banknote, ChevronUp, Salad, Flame, Wine, Cake, Snowflake, Thermometer
} from 'lucide-react';

// ── HELPERS ─────────────────────────────────────────────────────────────────
const fmtDate = (d) => {
  if (!d) return '';
  const dt = typeof d === 'string' ? new Date(d) : d;
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
};
const getToday = () => fmtDate(new Date());
const getMonthStart = () => { const d = new Date(); d.setDate(1); return fmtDate(d); };
const nextDay = (dateStr) => { const d = new Date(dateStr); d.setDate(d.getDate() + 1); return fmtDate(d); };

const fmtTime = (iso) => {
  if (!iso) return '-';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
};

const elapsedStr = (from) => {
  if (!from) return '';
  const ms = Date.now() - new Date(from).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  return `${h}h ${mins % 60}m`;
};

// Late penalty removed — no longer applied

const ROLES = ['waitress', 'kitchen', 'cashier', 'cleaner'];
const SALARY_TYPES = ['hourly', 'daily', 'weekly', 'monthly'];

const getKitchenStations = (t) => [
  { id: 'salad',  label: t('admin.staff.kitchenStations.salad'),  Icon: Salad,       color: '#16A34A', bg: '#F0FDF4' },
  { id: 'grill',  label: t('admin.staff.kitchenStations.grill'),  Icon: Flame,       color: '#EA580C', bg: '#FFF7ED' },
  { id: 'bar',    label: t('admin.staff.kitchenStations.bar'),    Icon: Wine,        color: '#2563EB', bg: '#EFF6FF' },
  { id: 'pastry', label: t('admin.staff.kitchenStations.pastry'), Icon: Cake,        color: '#A21CAF', bg: '#FDF4FF' },
  { id: 'cold',   label: t('admin.staff.kitchenStations.cold'),   Icon: Snowflake,   color: '#0891B2', bg: '#ECFEFF' },
  { id: 'hot',    label: t('admin.staff.kitchenStations.hot'),    Icon: Thermometer, color: '#DC2626', bg: '#FEF2F2' },
];

// Working days in a date range (Mon-Sat, excl Sunday)
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

// Working days (Mon-Sat) in the calendar month containing dateStr
const workingDaysInMonth = (dateStr) => {
  const d = new Date(dateStr + 'T00:00:00');
  const year = d.getFullYear();
  const month = d.getMonth();
  const daysInMon = new Date(year, month + 1, 0).getDate();
  let count = 0;
  for (let day = 1; day <= daysInMon; day++) {
    if (new Date(year, month, day).getDay() !== 0) count++;
  }
  return count || 1;
};

// For monthly salary spanning multiple months, calculate gross pay per-month then sum.
// Each month: (monthly salary / working days in that month) × days worked in that month.
const monthlyGrossForShifts = (salary, shifts, getDateFn) => {
  // Group shifts by YYYY-MM
  const byMonth = {};
  shifts.forEach(s => {
    const d = getDateFn(s);
    const ym = d.slice(0, 7); // "YYYY-MM"
    byMonth[ym] = (byMonth[ym] || 0) + 1;
  });
  let total = 0;
  for (const ym of Object.keys(byMonth)) {
    const wDays = workingDaysInMonth(ym + '-01');
    total += (salary / wDays) * byMonth[ym];
  }
  return total;
};

const ROLE_COLORS = {
  waitress: { bg: 'bg-sky-50', text: 'text-sky-700', avatar: 'bg-sky-600', dot: '#0284c7' },
  kitchen:  { bg: 'bg-sky-50', text: 'text-sky-700', avatar: 'bg-sky-700', dot: '#0369a1' },
  cashier:  { bg: 'bg-sky-50', text: 'text-sky-700', avatar: 'bg-sky-600', dot: '#0284c7' },
  admin:    { bg: 'bg-sky-50', text: 'text-sky-700', avatar: 'bg-sky-800', dot: '#075985' },
  owner:    { bg: 'bg-sky-50', text: 'text-sky-700', avatar: 'bg-sky-900', dot: '#0c4a6e' },
  cleaner:  { bg: 'bg-sky-50', text: 'text-sky-700', avatar: 'bg-sky-500', dot: '#0ea5e9' },
};
const getRoleColors = (role) => ROLE_COLORS[role] || ROLE_COLORS.waitress;

const TRACKABLE_ROLES = ['waitress', 'kitchen', 'cashier', 'cleaner'];

// ── SHARED STYLES ─────────────────────────────────────────────────────────────
const inputCls = "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent";
const labelCls = "block text-xs font-medium text-gray-600 mb-1";
const btnPrimary = "flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700";
const btnCancel = "flex-1 px-4 py-2.5 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50";

// ── MODAL (outside component to avoid re-mount on every state change) ─────────
const Modal = ({ open, onClose, title, children, wide }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-auto">
      <div className={`bg-white rounded-2xl shadow-2xl ${wide ? 'max-w-2xl' : 'max-w-lg'} w-full p-6 my-4 max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
const AdminStaff = () => {
  const { t } = useTranslation();
  const [toast, setToast] = useState(null);
  const [activeTab, setActiveTab] = useState('staff');
  const tickRef = useRef(0);

  const showError = (msg) => { setToast({ type: 'error', message: msg }); setTimeout(() => setToast(null), 4000); };
  const showSuccess = (msg) => { setToast({ type: 'success', message: msg }); setTimeout(() => setToast(null), 3000); };

  // ── SHARED STATE ──────────────────────────────────────────────────────────
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // ── STAFF TAB STATE ───────────────────────────────────────────────────────
  const [selectedRole, setSelectedRole] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddEditModal, setShowAddEditModal] = useState(false);
  const [showCredentialsModal, setShowCredentialsModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showNewStaffModal, setShowNewStaffModal] = useState(false);
  const [newStaffInfo, setNewStaffInfo] = useState(null);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', role: 'waitress', salary: '', salaryType: 'monthly', shiftStart: '09:00', shiftEnd: '18:00', password: '', kitchenStation: '' });
  const [customStations, setCustomStations] = useState([]);
  const [stationToDelete, setStationToDelete] = useState(null);
  const [credentialsData, setCredentialsData] = useState({ email: '', newPassword: '', confirmPassword: '' });
  const [showPasswords, setShowPasswords] = useState({ new: false, confirm: false });

  // ── ATTENDANCE TAB STATE ──────────────────────────────────────────────────
  const [attDate, setAttDate] = useState(getToday);
  const [todayStatus, setTodayStatus] = useState({}); // keyed by user id
  const [periodShifts, setPeriodShifts] = useState([]);
  const [attLoading, setAttLoading] = useState(false);
  const [showManualClockInModal, setShowManualClockInModal] = useState(false);
  const [showManualShiftModal, setShowManualShiftModal] = useState(false);
  const [showEditShiftModal, setShowEditShiftModal] = useState(false);
  const [editShiftData, setEditShiftData] = useState({ id: null, userId: '', date: '', status: 'present', clockIn: '', clockOut: '', note: '' });
  const [manualClockData, setManualClockData] = useState({ staffId: '', time: '' });
  const [manualShiftData, setManualShiftData] = useState({ staffId: '', date: '', clockIn: '', clockOut: '', status: 'present' });

  // ── PAYROLL TAB STATE ─────────────────────────────────────────────────────
  const [payrollPeriod, setPayrollPeriod] = useState('thisMonth');
  const [payrollDateFrom, setPayrollDateFrom] = useState(getMonthStart);
  const [payrollDateTo, setPayrollDateTo] = useState(getToday);
  const [payrollShifts, setPayrollShifts] = useState([]);
  const [latestPayments, setLatestPayments] = useState([]);
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [payrollLoading, setPayrollLoading] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [payTarget, setPayTarget] = useState(null);
  const [paymentFormData, setPaymentFormData] = useState({ amount: '', method: 'Cash', note: '', date: '' });
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [detailsTarget, setDetailsTarget] = useState(null);
  const [showSummary, setShowSummary] = useState(false);
  // ═══════════════════════════════════════════════════════════════════════════
  // DATA FETCHING
  // ═══════════════════════════════════════════════════════════════════════════

  const fetchStaff = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const data = await usersAPI.getAll();
      setStaff(Array.isArray(data) ? data : []);
    } catch (_) {
      if (!silent) showError(t('common.error'));
      setStaff([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const fetchTodayStatus = useCallback(async () => {
    try {
      const data = await shiftsAPI.getStaffStatus();
      if (data && typeof data === 'object') {
        // data can be { [userId]: { onShift, clockIn, ... } } or an array
        if (Array.isArray(data)) {
          const map = {};
          data.forEach(s => { if (s.userId || s.id) map[s.userId || s.id] = s; });
          setTodayStatus(map);
        } else {
          setTodayStatus(data);
        }
      }
    } catch (_) {}
  }, []);

  const fetchPeriodShifts = useCallback(async () => {
    try {
      setAttLoading(true);
      const shifts = await shiftsAPI.getAll({ from: attDate, to: attDate });
      setPeriodShifts(Array.isArray(shifts) ? shifts : []);
    } catch (_) {
      setPeriodShifts([]);
    } finally {
      setAttLoading(false);
    }
  }, [attDate]);

  // Initial load
  const fetchCustomStations = useCallback(async () => {
    try {
      const res = await menuAPI.getStations();
      const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
      setCustomStations(list.map(s => {
        const name = typeof s === 'string' ? s : s.name || s;
        return { id: name.toLowerCase(), label: name, Icon: null, color: '#6b7280', bg: '#f3f4f6' };
      }));
    } catch (_) {}
  }, []);

  useEffect(() => {
    fetchStaff();
    fetchTodayStatus();
    fetchCustomStations();
  }, [fetchStaff, fetchTodayStatus, fetchCustomStations]);

  // Tick for live timer + periodic refresh
  useEffect(() => {
    const t = setInterval(() => {
      tickRef.current += 1;
      // Re-render for timers
      setTodayStatus(prev => ({ ...prev }));
      // Refresh data every 10 seconds
      if (tickRef.current % 10 === 0) {
        fetchStaff(true);
        fetchTodayStatus();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [fetchStaff, fetchTodayStatus]);

  // Attendance tab data
  useEffect(() => {
    if (activeTab === 'attendance') fetchPeriodShifts();
  }, [activeTab, attDate, fetchPeriodShifts]);

  // Payroll tab data
  const fetchPayrollData = useCallback(async () => {
    try {
      setPayrollLoading(true);
      let from = payrollDateFrom, to = payrollDateTo;
      if (payrollPeriod === 'thisMonth') { from = getMonthStart(); to = getToday(); }
      else if (payrollPeriod === 'lastMonth') {
        const d = new Date(); d.setMonth(d.getMonth() - 1); d.setDate(1);
        from = fmtDate(d);
        const e = new Date(); e.setDate(0);
        to = fmtDate(e);
      }
      setPayrollDateFrom(from);
      setPayrollDateTo(to);

      // First load latest payments to find earliest unpaid date
      const latestRes = await staffPaymentsAPI.getLatest();
      const latestArr = Array.isArray(latestRes) ? latestRes : [];
      setLatestPayments(latestArr);

      // Compute earliest effectiveFrom across all staff for debt carry-over.
      // For never-paid staff, use 6-month lookback to capture unpaid historical work.
      const lookbackD = new Date();
      lookbackD.setMonth(lookbackD.getMonth() - 6);
      lookbackD.setDate(1);
      const lookbackDate = fmtDate(lookbackD);
      let earliestFrom = lookbackDate < from ? lookbackDate : from;
      latestArr.forEach(r => {
        const lpDate = r.paymentDate || r.payment_date;
        if (lpDate) {
          const dayAfter = nextDay(String(lpDate).split('T')[0]);
          if (dayAfter < earliestFrom) earliestFrom = dayAfter;
        }
      });

      const [shiftsRes, paymentsRes] = await Promise.allSettled([
        shiftsAPI.getAll({ from: earliestFrom, to }),
        staffPaymentsAPI.getAll({ from: earliestFrom, to }),
      ]);
      setPayrollShifts(shiftsRes.status === 'fulfilled' && Array.isArray(shiftsRes.value) ? shiftsRes.value : []);
      setPaymentHistory(paymentsRes.status === 'fulfilled' && Array.isArray(paymentsRes.value) ? paymentsRes.value : []);
    } catch (_) {} finally { setPayrollLoading(false); }
  }, [payrollPeriod, payrollDateFrom, payrollDateTo]);

  useEffect(() => {
    if (activeTab === 'payroll') fetchPayrollData();
  }, [activeTab, payrollPeriod]);

  // ═══════════════════════════════════════════════════════════════════════════
  // STAFF TAB HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════

  const filteredStaff = staff.filter(s => {
    const matchesRole = selectedRole === 'All' || s.role === selectedRole;
    const q = searchTerm.toLowerCase();
    const matchesSearch = s.name?.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q);
    return matchesRole && matchesSearch;
  }).sort((a, b) => {
    const bottomRoles = ['admin', 'owner'];
    const aBottom = bottomRoles.includes(a.role) ? 1 : 0;
    const bBottom = bottomRoles.includes(b.role) ? 1 : 0;
    return aBottom - bBottom;
  });

  const roleCounts = {
    All: staff.length,
    waitress: staff.filter(s => s.role === 'waitress').length,
    kitchen: staff.filter(s => s.role === 'kitchen').length,
    cashier: staff.filter(s => s.role === 'cashier').length,
  };

  const handleAddStaff = () => {
    setSelectedStaff(null);
    setFormData({ name: '', email: '', phone: '', role: 'waitress', salary: '', salaryType: 'monthly', shiftStart: '09:00', shiftEnd: '18:00', password: '', kitchenStation: '' });
    setShowAddEditModal(true);
  };

  const handleEditStaff = (m) => {
    setSelectedStaff(m);
    setFormData({
      name: m.name || '', email: m.email || '', phone: m.phone || '', role: m.role || 'waitress',
      salary: m.salary || '', salaryType: m.salaryType || m.salary_type || 'monthly',
      shiftStart: m.shiftStart || m.shift_start || '09:00', shiftEnd: m.shiftEnd || m.shift_end || '18:00',
      password: '', kitchenStation: m.kitchenStation || m.kitchen_station || '',
    });
    setShowAddEditModal(true);
  };

  const handleSaveStaff = async () => {
    if (!formData.name) return showError(t('admin.staff.nameRequired'));
    if (!formData.phone) return showError(t('admin.staff.phoneRequired'));
    const rate = parseFloat(formData.salary);
    if (!formData.salary || isNaN(rate) || rate <= 0) return showError(t('admin.staff.validSalary'));
    try {
      const body = {
        name: formData.name, email: formData.email || formData.name.toLowerCase().replace(/\s+/g,''), phone: formData.phone, role: formData.role,
        salary: rate, salaryType: formData.salaryType,
        shiftStart: formData.shiftStart, shiftEnd: formData.shiftEnd,
        kitchenStation: formData.role === 'kitchen' ? (formData.kitchenStation || null) : null,
      };
      if (selectedStaff) {
        await usersAPI.update(selectedStaff.id, body);
        showSuccess(t('admin.staff.staffUpdated'));
        setShowAddEditModal(false);
        fetchStaff();
      } else {
        if (!formData.password) return showError(t('admin.staff.passwordRequired'));
        const loginEmail = formData.email || formData.name.toLowerCase().replace(/\s+/g, '') + '@staff.local';
        // Step 1: create the account (name, email, phone, role, password)
        const created = await usersAPI.create({
          name: formData.name,
          email: loginEmail,
          phone: formData.phone,
          role: formData.role,
          password: formData.password,
        });
        // Step 2: apply salary + shift via PUT (guaranteed to save — same path as Edit)
        const newId = created?.id || created?.data?.id;
        if (newId) {
          await usersAPI.update(newId, {
            salary: rate,
            salaryType: formData.salaryType,
            shiftStart: formData.shiftStart,
            shiftEnd: formData.shiftEnd,
            kitchenStation: formData.role === 'kitchen' ? (formData.kitchenStation || null) : null,
          });
        }
        setShowAddEditModal(false);
        fetchStaff();
        setNewStaffInfo({
          name: formData.name,
          phone: formData.phone,
          email: loginEmail,
          password: formData.password,
          role: formData.role,
          salary: rate,
          salaryType: formData.salaryType,
          shiftStart: formData.shiftStart,
          shiftEnd: formData.shiftEnd,
        });
        setShowNewStaffModal(true);
      }
    } catch (e) { showError(e.message || t('common.error')); }
  };

  const handleDeleteStaff = async () => {
    try {
      await usersAPI.delete(selectedStaff.id);
      showSuccess(t('admin.staff.staffRemoved'));
      setShowDeleteModal(false);
      fetchStaff();
    } catch (_) { showError(t('common.error')); }
  };

  const handleUpdateCredentials = async () => {
    if (!credentialsData.email && !credentialsData.newPassword) return showError(t('common.error'));
    if (credentialsData.newPassword && credentialsData.newPassword !== credentialsData.confirmPassword) {
      return showError(t('admin.profile.passwordsDoNotMatch'));
    }
    if (credentialsData.newPassword && credentialsData.newPassword.length < 3) {
      return showError(t('admin.profile.min6Characters'));
    }
    try {
      const body = {};
      if (credentialsData.email) body.email = credentialsData.email;
      if (credentialsData.newPassword) body.password = credentialsData.newPassword;
      if (credentialsData.confirmPassword) body.confirmPassword = credentialsData.confirmPassword;
      await usersAPI.updateCredentials(selectedStaff.id, body);
      showSuccess(t('admin.staff.credentialsUpdated'));
      setShowCredentialsModal(false);
      setCredentialsData({ email: '', newPassword: '', confirmPassword: '' });
      fetchStaff();
    } catch (e) { showError(e?.response?.data?.error || t('common.error')); }
  };

  const handleToggleStatus = async (m) => {
    try {
      const newActive = m.isActive === false;
      await usersAPI.update(m.id, { isActive: newActive });
      showSuccess(newActive ? t('admin.staff.staffReactivated') : t('admin.staff.staffSuspended'));
      fetchStaff();
    } catch (e) { showError(e?.response?.data?.error || t('common.error')); }
  };


  // ═══════════════════════════════════════════════════════════════════════════
  // ATTENDANCE TAB HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════

  const handleClockIn = async (userId, status = 'present') => {
    try {
      await shiftsAPI.clockIn({ userId, status });
      showSuccess(status === 'late' ? t('admin.staff.clockedInAsLate') : t('admin.staff.clockedIn'));
      fetchTodayStatus();
      if (activeTab === 'attendance') fetchPeriodShifts();
    } catch (e) { showError(e.message || t('common.error')); }
  };

  const handleClockOut = async (userId) => {
    try {
      await shiftsAPI.adminClockOut(userId);
      showSuccess(t('admin.staff.clockedOut'));
      fetchTodayStatus();
      if (activeTab === 'attendance') fetchPeriodShifts();
    } catch (e) { showError(e.message || t('common.error')); }
  };

  const handleMarkAbsent = async (userId) => {
    try {
      await shiftsAPI.createManualShift({ userId, date: getToday(), status: 'absent' });
      showSuccess(t('admin.staff.markedAbsent'));
      fetchTodayStatus();
      if (activeTab === 'attendance') fetchPeriodShifts();
    } catch (e) { showError(e.message || t('common.error')); }
  };

  const handleManualClockIn = async () => {
    if (!manualClockData.staffId || !manualClockData.time) return showError(t('admin.staff.selectStaff'));
    try {
      await shiftsAPI.clockIn({ userId: manualClockData.staffId, clockInTime: manualClockData.time });
      showSuccess(t('admin.staff.clockedIn'));
      setShowManualClockInModal(false);
      setManualClockData({ staffId: '', time: '' });
      fetchTodayStatus();
      fetchPeriodShifts();
    } catch (_) { showError(t('common.error')); }
  };

  const handleManualShift = async () => {
    if (!manualShiftData.staffId || !manualShiftData.date) return showError(t('common.required'));
    try {
      const body = {
        userId: manualShiftData.staffId,
        date: manualShiftData.date,
        status: manualShiftData.status || 'present',
      };
      if (manualShiftData.clockIn) body.clockIn = manualShiftData.clockIn;
      if (manualShiftData.clockOut) body.clockOut = manualShiftData.clockOut;
      await shiftsAPI.createManualShift(body);
      showSuccess(t('admin.staff.staffUpdated'));
      setShowManualShiftModal(false);
      setManualShiftData({ staffId: '', date: '', clockIn: '', clockOut: '', status: 'present' });
      fetchPeriodShifts();
      fetchTodayStatus();
    } catch (_) { showError(t('common.error')); }
  };

  const handleEditShift = async () => {
    const needsTime = editShiftData.status === 'present' || editShiftData.status === 'late';
    try {
      const body = {
        status: editShiftData.status,
        note: editShiftData.note || '',
      };
      if (needsTime && editShiftData.clockIn) body.clockIn = editShiftData.clockIn;
      if (needsTime && editShiftData.clockOut) body.clockOut = editShiftData.clockOut;
      if (!needsTime) { body.clockIn = null; body.clockOut = null; }

      if (editShiftData.id) {
        // Update existing record — always send date to prevent timezone drift
        body.date = editShiftData.date || attDate;
        await shiftsAPI.updateShift(editShiftData.id, body);
        showSuccess(t('admin.staff.staffUpdated'));
      } else {
        // Create new record
        try {
          await shiftsAPI.createManualShift({
            userId: editShiftData.userId,
            date: editShiftData.date || attDate,
            ...body,
          });
          showSuccess(t('admin.staff.staffUpdated'));
        } catch (e) {
          // 409 = record already exists → update instead
          if (e.response?.status === 409 && e.response?.data?.existing_id) {
            body.date = editShiftData.date || attDate;
            await shiftsAPI.updateShift(e.response.data.existing_id, body);
            showSuccess(t('admin.staff.attendanceUpdated'));
          } else { throw e; }
        }
      }
      setShowEditShiftModal(false);
      fetchPeriodShifts();
      fetchTodayStatus();
    } catch (_) { showError(t('common.error')); }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // PAYROLL TAB HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════

  const computePayroll = useCallback(() => {
    const from = payrollDateFrom, to = payrollDateTo;

    // Build per-employee effectiveFrom from latestPayments (for debt carry-over)
    const lastPaidMap = {};
    latestPayments.forEach(r => {
      const uid = String(r.userId || r.user_id);
      const lpDate = r.paymentDate || r.payment_date;
      lastPaidMap[uid] = lpDate ? String(lpDate).split('T')[0] : null;
    });

    // For never-paid staff, reach back 6 months to capture all unpaid debt
    const lookbackDate = (() => {
      const d = new Date();
      d.setMonth(d.getMonth() - 6);
      d.setDate(1);
      return fmtDate(d);
    })();

    return staff.map(m => {
      // effectiveFrom: day after last payment, or lookback date for never-paid staff
      let effectiveFrom;
      const lp = lastPaidMap[String(m.id)];
      if (lp) {
        effectiveFrom = nextDay(lp);
      } else {
        // Never paid — reach back to capture unpaid historical work
        effectiveFrom = lookbackDate < from ? lookbackDate : from;
      }

      const salary = parseFloat(m.salary) || 0;
      const type = (m.salaryType || m.salary_type || 'monthly').toLowerCase();
      const getShiftDate = s => (s.shiftDate || s.shift_date || s.clockIn || s.clock_in || '').split('T')[0];

      // ── Period-based data (always shows current period — for card display) ──
      const periodShifts = payrollShifts.filter(s => {
        if ((s.userId || s.user_id) !== m.id) return false;
        const d = getShiftDate(s);
        return d >= from && d <= to;
      });
      const presentDays = periodShifts.filter(s => ['present', t('admin.staff.present')].includes(s.status)).length;
      const lateDays = periodShifts.filter(s => ['late', t('admin.staff.late')].includes(s.status)).length;
      const absentDays = periodShifts.filter(s => ['absent', t('admin.staff.absent')].includes(s.status)).length;
      const totalHours = periodShifts.reduce((sum, s) => sum + (parseFloat(s.hoursWorked || s.hours_worked || 0)), 0);
      const daysWorked = presentDays + lateDays;

      let grossPay = 0;
      if (type === 'hourly') grossPay = salary * totalHours;
      else if (type === 'daily') grossPay = salary * daysWorked;
      else if (type === 'weekly') grossPay = (salary / 6) * daysWorked;
      else {
        const workedShifts = periodShifts.filter(s => ['present', 'Present', 'late', 'Late'].includes(s.status));
        grossPay = monthlyGrossForShifts(salary, workedShifts, getShiftDate);
      }
      const netPay = Math.max(0, grossPay);

      // ── Debt-based data (effectiveFrom — for PAID/REMAINING tracking) ──
      const debtShifts = payrollShifts.filter(s => {
        if ((s.userId || s.user_id) !== m.id) return false;
        const d = getShiftDate(s);
        return d >= effectiveFrom && d <= to;
      });
      let debtGross = 0;
      if (type === 'hourly') debtGross = salary * debtShifts.reduce((sum, s) => sum + (parseFloat(s.hoursWorked || s.hours_worked || 0)), 0);
      else if (type === 'daily') debtGross = salary * debtShifts.filter(s => ['present', 'Present', 'late', 'Late'].includes(s.status)).length;
      else if (type === 'weekly') debtGross = (salary / 6) * debtShifts.filter(s => ['present', 'Present', 'late', 'Late'].includes(s.status)).length;
      else {
        const workedShifts = debtShifts.filter(s => ['present', 'Present', 'late', 'Late'].includes(s.status));
        debtGross = monthlyGrossForShifts(salary, workedShifts, getShiftDate);
      }
      const debtNetPay = Math.max(0, debtGross);

      // Debt-based payments: from effectiveFrom onwards (kept for display grouping)
      const debtPaidArr = paymentHistory.filter(p => {
        if ((p.userId || p.user_id) !== m.id) return false;
        const pd = (p.paymentDate || p.payment_date || '').split('T')[0];
        return pd >= effectiveFrom;
      });
      const debtTotalPaid = debtPaidArr.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);

      // Period-based payments: all payments whose date falls within [from, to]
      // Used for remaining so overpayments on last-payment-date are counted correctly.
      const periodPaidArr = paymentHistory.filter(p => {
        if ((p.userId || p.user_id) !== m.id) return false;
        const pd = (p.paymentDate || p.payment_date || '').split('T')[0];
        return pd >= from && pd <= to;
      });
      const periodTotalPaid = periodPaidArr.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);

      // Remaining: simple period-based formula — fixes overpayments not registering.
      // effectiveFrom > to means employee was paid past this period → fully settled.
      let remaining;
      if (effectiveFrom > to) {
        remaining = 0;
      } else {
        remaining = Math.max(0, netPay - periodTotalPaid);
      }
      const totalPaid = periodTotalPaid;

      // All payments for this user in the fetched history (for the details modal)
      const allUserPayments = paymentHistory.filter(p => (p.userId || p.user_id) == m.id);

      const wDays = workingDaysInRange(from, to);
      return {
        ...m, presentDays, lateDays, absentDays, totalHours, daysWorked,
        grossPay, penalty: 0, netPay, debtNetPay, totalPaid, remaining,
        shifts: periodShifts, debtShifts, payments: allUserPayments,
        salaryType: type, baseSalary: salary,
        workingDays: type === 'monthly' ? workingDaysInMonth(from) : wDays,
        effectiveFrom,
      };
    }).filter(m => TRACKABLE_ROLES.includes(m.role) || m.grossPay > 0 || m.debtNetPay > 0 || m.totalPaid > 0);
  }, [staff, payrollShifts, paymentHistory, latestPayments, payrollDateFrom, payrollDateTo]);

  const handlePayNow = (record) => {
    setPayTarget(record);
    const due = Math.max(0, record.netPay - record.totalPaid);
    setPaymentFormData({ amount: String(due.toFixed(0)), method: 'Cash', note: '', date: getToday() });
    setShowPaymentModal(true);
  };

  const handleRecordPayment = async () => {
    if (!payTarget || !paymentFormData.amount) return showError(t('common.required'));
    try {
      await staffPaymentsAPI.create({
        userId: payTarget.id,
        amount: parseFloat(paymentFormData.amount),
        paymentMethod: paymentFormData.method,
        note: paymentFormData.note,
        paymentDate: paymentFormData.date || getToday(),
      });
      showSuccess(t('admin.staff.paymentRecorded'));
      setShowPaymentModal(false);
      fetchPayrollData();
    } catch (_) { showError(t('common.error')); }
  };

  const handleDeletePayment = async (id) => {
    try {
      await staffPaymentsAPI.delete(id);
      showSuccess(t('common.delete'));
      fetchPayrollData();
    } catch (_) { showError(t('common.error')); }
  };

  const handleShowDetails = (record) => {
    setDetailsTarget(record);
    setShowDetailsModal(true);
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // TOAST
  // ═══════════════════════════════════════════════════════════════════════════
  const Toast = () => {
    if (!toast) return null;
    return (
      <div className={`fixed top-4 right-4 px-5 py-3 rounded-xl text-white shadow-lg z-[60] flex items-center gap-2 text-sm font-medium ${toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>
        {toast.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
        {toast.message}
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // STAFF TAB
  // ═══════════════════════════════════════════════════════════════════════════
  const StaffTab = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("admin.staff.title")}</h1>
          <p className="text-gray-500 text-sm mt-0.5">{staff.length}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setRefreshing(true); fetchStaff().then(() => { fetchTodayStatus(); setRefreshing(false); }); }}
            disabled={refreshing}
            className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 flex items-center gap-1.5">
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />{t('common.refresh')}
          </button>
          <button onClick={handleAddStaff} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-1.5">
            <Plus size={16} />{t('admin.staff.addNewStaff')}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {['All', 'waitress', 'kitchen', 'cashier'].map(role => (
          <button key={role} onClick={() => setSelectedRole(role)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${selectedRole === role ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {role === 'All' ? t('common.all') : role.charAt(0).toUpperCase() + role.slice(1)} ({roleCounts[role] || 0})
          </button>
        ))}
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-3 text-gray-400" />
        <input type="text" placeholder={t("admin.staff.searchPlaceholder")} value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">{t('common.loading')}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredStaff.length > 0 ? filteredStaff.map(m => {
            const c = getRoleColors(m.role);
            const isOnShift = todayStatus[m.id]?.onShift || todayStatus[m.id]?.clockIn;
            return (
              <div key={m.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start gap-3 mb-3">
                  <div className={`w-11 h-11 rounded-full ${c.avatar} flex items-center justify-center text-white font-bold text-lg shrink-0`}>
                    {(m.name || '?')[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate">{m.name}</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${c.bg} ${c.text}`}>{m.role}</span>
                      <span className={`w-2 h-2 rounded-full ${isOnShift ? 'bg-green-500' : 'bg-gray-300'}`}></span>
                      {m.isActive === false && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-50 text-red-500">{t('admin.staff.suspended')}</span>}
                    </div>
                  </div>
                </div>
                <div className="space-y-1 text-xs text-gray-500 mb-4">
                  <p>{t('common.email')}: <span className="text-gray-700">{m.email}</span></p>
                  {m.phone && <p>{t('common.phone')}: <span className="text-gray-700">{formatPhoneDisplay(m.phone)}</span></p>}
                  {(m.salary > 0) && (
                    <p>{t('common.amount')}: <span className="text-gray-700 font-medium">{money(m.salary)} / {m.salaryType || m.salary_type || 'monthly'}</span></p>
                  )}
                  {(m.shiftStart || m.shift_start) && (
                    <p>{t('admin.staff.shift')}: <span className="text-gray-700">{m.shiftStart || m.shift_start} - {m.shiftEnd || m.shift_end}</span></p>
                  )}
                  {m.role === 'kitchen' && (m.kitchenStation || m.kitchen_station) && (
                    <p>{t('admin.staff.station')}: <span className="text-gray-700 font-medium">{m.kitchenStation || m.kitchen_station}</span></p>
                  )}
                </div>
                {!['owner', 'admin'].includes(m.role) && (
                <div className="flex gap-1.5 flex-wrap">
                  <button onClick={() => handleEditStaff(m)} className="flex-1 min-w-[60px] px-2 py-1.5 border border-gray-300 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-50 flex items-center justify-center gap-1">
                    <Edit2 size={12} />{t('common.edit')}
                  </button>
                  <button onClick={() => { setSelectedStaff(m); setCredentialsData({ email: m.email || '', newPassword: '', confirmPassword: '' }); setShowPasswords({ new: false, confirm: false }); setShowCredentialsModal(true); }}
                    className="flex-1 min-w-[60px] px-2 py-1.5 border border-gray-300 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-50 flex items-center justify-center gap-1">
                    <Key size={12} /> {t('admin.staff.login')}
                  </button>

                  <button onClick={() => handleToggleStatus(m)}
                    className={`flex-1 min-w-[60px] px-2 py-1.5 rounded-lg text-xs font-medium flex items-center justify-center gap-1 ${
                      m.isActive === false ? 'border border-green-300 text-green-700 hover:bg-green-50' : 'border border-gray-300 text-gray-500 hover:bg-gray-50'
                    }`}>
                    {m.isActive === false ? <><Play size={12} />{t('common.active')}</> : <><Square size={12} />{t('common.inactive')}</>}
                  </button>
                  <button onClick={() => { setSelectedStaff(m); setShowDeleteModal(true); }}
                    className="flex-1 min-w-[60px] px-2 py-1.5 border border-red-200 text-red-500 rounded-lg text-xs font-medium hover:bg-red-50 flex items-center justify-center gap-1">
                    <Trash2 size={12} />{t('common.delete')}
                  </button>
                </div>
                )}
              </div>
            );
          }) : (
            <div className="col-span-full text-center py-16 text-gray-400">{t('common.noResults')}</div>
          )}
        </div>
      )}
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // ATTENDANCE TAB
  // ═══════════════════════════════════════════════════════════════════════════
  const AttendanceTab = () => {
    const trackable = staff.filter(m => TRACKABLE_ROLES.includes(m.role));
    const today = getToday();
    const isToday = attDate === today;

    // Build status map from shifts loaded for the selected day
    const statusMap = {};
    trackable.forEach(m => {
      const shift = periodShifts.find(s => (s.userId || s.user_id) === m.id);
      const live = todayStatus[m.id];
      if (shift) {
        statusMap[m.id] = {
          status: (shift.status || '').toLowerCase(),
          clockIn: shift.clockIn || shift.clock_in,
          clockOut: shift.clockOut || shift.clock_out,
          hoursWorked: shift.hoursWorked || shift.hours_worked,
          shiftId: shift.id,
          lateMinutes: shift.lateMinutes || shift.late_minutes || 0,
        };
      } else if (isToday && (live?.onShift || live?.clockIn)) {
        statusMap[m.id] = {
          status: live.status === 'late' ? 'late' : 'present',
          clockIn: live.clockIn || live.clock_in,
          clockOut: null,
          lateMinutes: live.lateMinutes || 0,
        };
      }
    });

    const presentCount = Object.values(statusMap).filter(s => s.status === 'present' && s.clockIn).length;
    const lateCount = Object.values(statusMap).filter(s => s.status === 'late').length;
    const absentCount = Object.values(statusMap).filter(s => s.status === 'absent').length;
    const notInCount = trackable.length - Object.keys(statusMap).length;

    // Period stats for each staff member
    const periodStatsFor = (userId) => {
      const shifts = periodShifts.filter(s => (s.userId || s.user_id) === userId);
      return {
        present: shifts.filter(s => ['present', 'Present'].includes(s.status)).length,
        late: shifts.filter(s => ['late', 'Late'].includes(s.status)).length,
        absent: shifts.filter(s => ['absent', 'Absent'].includes(s.status)).length,
        hours: shifts.reduce((sum, s) => sum + (parseFloat(s.hoursWorked || s.hours_worked || 0)), 0),
      };
    };

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-2xl font-bold text-gray-900">{t('admin.staff.attendanceShifts')}</h1>
        </div>

        {/* Day chooser */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Previous day */}
          <button onClick={() => { const d = new Date(attDate); d.setDate(d.getDate() - 1); setAttDate(fmtDate(d)); }}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-100 hover:bg-gray-200 transition-colors">
            <ChevronLeft className="w-4 h-4 text-gray-600" />
          </button>

          {/* Date display + picker */}
          <DatePicker value={attDate} onChange={v => setAttDate(v)} size="sm" className="w-[180px]" />

          {/* Next day */}
          <button onClick={() => { const d = new Date(attDate); d.setDate(d.getDate() + 1); if (fmtDate(d) <= getToday()) setAttDate(fmtDate(d)); }}
            disabled={attDate >= getToday()}
            className={`w-9 h-9 flex items-center justify-center rounded-xl transition-colors ${attDate >= getToday() ? 'bg-gray-50 opacity-40 cursor-not-allowed' : 'bg-gray-100 hover:bg-gray-200'}`}>
            <ChevronRight className="w-4 h-4 text-gray-600" />
          </button>

          {/* Today button — always visible */}
          <button onClick={() => setAttDate(getToday())}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors ${attDate === getToday() ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'}`}>{t('common.today')}</button>
        </div>

        {/* Today stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{t('admin.staff.present')}</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{presentCount}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{t('admin.staff.late')}</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{lateCount}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{t('admin.staff.absent')}</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{absentCount}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{t('common.inactive')}</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{notInCount}</p>
          </div>
        </div>

        {/* Per-staff attendance cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {trackable.map(m => {
            const c = getRoleColors(m.role);
            const info = statusMap[m.id];
            const ps = periodStatsFor(m.id);

            const isAbsent = info?.status === 'absent';
            const isClockedIn = info?.clockIn && !info?.clockOut && !isAbsent;
            const isDone = info?.clockIn && info?.clockOut && !isAbsent;
            const isNotIn = !info;

            return (
              <div key={m.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {/* Header */}
                <div className="p-4 pb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full ${c.avatar} flex items-center justify-center text-white font-bold`}>
                      {(m.name || '?')[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 text-sm truncate">{m.name}</h3>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${c.bg} ${c.text}`}>{m.role}</span>
                    </div>
                    {info?.shiftId && (
                      <button onClick={() => {
                        setEditShiftData({
                          id: info.shiftId, userId: m.id, date: today,
                          status: info.status, clockIn: fmtTime(info.clockIn), clockOut: fmtTime(info.clockOut), note: '',
                        });
                        setShowEditShiftModal(true);
                      }} className="text-blue-500 hover:text-blue-700">
                        <Edit2 size={15} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Status body */}
                <div className="px-4 pb-3">
                  {isAbsent && (
                    <div className="bg-red-50 rounded-lg px-3 py-2 text-center">
                      <span className="text-red-600 font-bold text-xs uppercase tracking-wider">{t('admin.staff.absent')}</span>
                    </div>
                  )}

                  {isClockedIn && (
                    <div className="bg-green-50 rounded-lg px-3 py-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">{t('admin.staff.in')}: <strong className="text-gray-900">{fmtTime(info.clockIn)}</strong></span>
                        <span className="text-green-600 font-semibold flex items-center gap-1">
                          <Timer size={13} /> {elapsedStr(info.clockIn)}
                        </span>
                      </div>
                      {info.lateMinutes > 0 && (
                        <p className="text-[11px] text-yellow-600 mt-1">{t('admin.staff.lateMins', { mins: info.lateMinutes })}</p>
                      )}
                    </div>
                  )}

                  {isDone && (
                    <div className="bg-blue-50 rounded-lg px-3 py-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">{t('admin.staff.in')}: <strong>{fmtTime(info.clockIn)}</strong></span>
                        <span className="text-gray-600">{t('admin.staff.out')}: <strong>{fmtTime(info.clockOut)}</strong></span>
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-[11px] text-green-600 font-medium">{t('admin.staff.hoursWorked', { hours: parseFloat(info.hoursWorked || 0).toFixed(1) })}</span>
                        {info.lateMinutes > 0 && <span className="text-[11px] text-yellow-600">{t('admin.staff.lateMins', { mins: info.lateMinutes })}</span>}
                      </div>
                    </div>
                  )}
                </div>

                {/* Period stats strip */}
                <div className="px-4 pb-2 flex gap-4 text-[11px] text-gray-400">
                  <span><span className="text-gray-700 font-semibold">{ps.present}</span>{t('admin.staff.present')}</span>
                  <span><span className="text-gray-700 font-semibold">{ps.absent}</span>{t('admin.staff.absent')}</span>
                  <span><span className="text-gray-700 font-semibold">{ps.late}</span>{t('admin.staff.late')}</span>
                  <span><span className="text-gray-700 font-semibold">{ps.hours.toFixed(1)}</span>h</span>
                </div>

                {/* Action buttons — only show for today */}
                <div className="p-3 pt-2 border-t border-gray-100">
                  {isToday && isNotIn && (
                    <div className="flex gap-2">
                      <button onClick={() => handleClockIn(m.id, 'present')}
                        className="flex-1 py-2 bg-green-50 text-green-700 rounded-lg text-xs font-semibold hover:bg-green-100 flex items-center justify-center gap-1">
                        <Check size={13} />{t('admin.staff.clockedIn')}
                      </button>
                      <button onClick={() => handleClockIn(m.id, 'late')}
                        className="flex-1 py-2 bg-yellow-50 text-yellow-700 rounded-lg text-xs font-semibold hover:bg-yellow-100 flex items-center justify-center gap-1">
                        <Clock size={13} />{t('admin.staff.late')}
                      </button>
                      <button onClick={() => handleMarkAbsent(m.id)}
                        className="flex-1 py-2 bg-red-50 text-red-700 rounded-lg text-xs font-semibold hover:bg-red-100 flex items-center justify-center gap-1">
                        <XCircle size={13} />{t('admin.staff.absent')}
                      </button>
                    </div>
                  )}

                  {isToday && isClockedIn && (
                    <button onClick={() => handleClockOut(m.id)}
                      className="w-full py-2 bg-red-50 text-red-600 rounded-lg text-xs font-semibold hover:bg-red-100 flex items-center justify-center gap-1">
                      <Square size={13} />{t('admin.staff.clockedOut')}
                    </button>
                  )}

                  {!isToday && isNotIn && (
                    <p className="text-center text-[11px] text-gray-400 py-1">{t('common.noData')}</p>
                  )}

                  {(isDone || isAbsent) && (
                    <p className="text-center text-[11px] text-gray-400 py-1">{t('common.done')}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Historical shifts table */}
        {!attLoading && periodShifts.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mt-4">
            <div className="px-5 py-3 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900 text-sm">{t('admin.staff.attendanceShifts')} ({periodShifts.length})</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">{t('common.name')}</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">{t('common.date')}</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">{t('admin.staff.in')}</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">{t('admin.staff.out')}</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">{t('admin.staff.hours')}</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">{t('common.status')}</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {periodShifts.map(rec => {
                    const m = staff.find(s => s.id === (rec.userId || rec.user_id));
                    const rc = m ? getRoleColors(m.role) : {};
                    const st = (rec.status || '').toLowerCase();
                    return (
                      <tr key={rec.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 text-gray-900 font-medium">{m?.name || '?'}</td>
                        <td className="px-4 py-2.5 text-gray-600">{rec.date || (rec.clockIn ? fmtDate(new Date(rec.clockIn)) : '-')}</td>
                        <td className="px-4 py-2.5 text-gray-600">{fmtTime(rec.clockIn || rec.clock_in)}</td>
                        <td className="px-4 py-2.5 text-gray-600">{fmtTime(rec.clockOut || rec.clock_out)}</td>
                        <td className="px-4 py-2.5 text-gray-900 font-medium">{parseFloat(rec.hoursWorked || rec.hours_worked || 0).toFixed(1)}h</td>
                        <td className="px-4 py-2.5">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                            st === 'present' ? 'bg-green-100 text-green-700' :
                            st === 'late' ? 'bg-yellow-100 text-yellow-700' :
                            st === 'absent' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
                          }`}>{rec.status}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex gap-2">
                            {!(rec.clockOut || rec.clock_out) && (rec.clockIn || rec.clock_in) && (
                              <button onClick={() => handleClockOut(rec.userId || rec.user_id)}
                                className="text-blue-600 hover:text-blue-800 text-xs font-medium">{t('admin.staff.clockedOut')}</button>
                            )}
                            <button onClick={() => {
                              setEditShiftData({
                                id: rec.id, userId: rec.userId || rec.user_id, date: rec.date || fmtDate(new Date(rec.clockIn)),
                                status: st, clockIn: fmtTime(rec.clockIn || rec.clock_in), clockOut: fmtTime(rec.clockOut || rec.clock_out), note: rec.note || '',
                              });
                              setShowEditShiftModal(true);
                            }} className="text-gray-500 hover:text-gray-700 text-xs font-medium">{t('common.edit')}</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Non-trackable staff note */}
        {staff.filter(m => !TRACKABLE_ROLES.includes(m.role)).length > 0 && (
          <p className="text-xs text-gray-400 italic">
            {t('admin.staff.ownerAdminExcluded')}
          </p>
        )}
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // PAYROLL TAB
  // ═══════════════════════════════════════════════════════════════════════════
  const PayrollTab = () => {
    const records = computePayroll();
    const totalDue = records.reduce((s, r) => s + Math.max(0, r.remaining), 0);
    const totalPaidAll = records.reduce((s, r) => s + r.totalPaid, 0);

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-2xl font-bold text-gray-900">{t('admin.staff.payrollPayments')}</h1>
        </div>

        {/* Period selector */}
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">{t('periods.custom')}</label>
            <Dropdown value={payrollPeriod} onChange={v => setPayrollPeriod(v)} options={[
              { value: 'thisMonth', label: t('periods.thisMonth') }, { value: 'lastMonth', label: t('periods.lastMonth') }, { value: 'custom', label: t('periods.custom') },
            ]} />
          </div>
          {payrollPeriod === 'custom' && (
            <>
              <div>
                <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">{t('common.from')}</label>
                <DatePicker value={payrollDateFrom} onChange={v => setPayrollDateFrom(v)} size="sm" className="w-[140px]" />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">{t('common.to')}</label>
                <DatePicker value={payrollDateTo} onChange={v => setPayrollDateTo(v)} size="sm" className="w-[140px]" />
              </div>
            </>
          )}
          <button onClick={fetchPayrollData}
            className="px-3 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-200 flex items-center gap-1.5">
            <RefreshCw size={14} /> {t('common.refresh')}
          </button>
        </div>

        {/* Summary banner */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <button onClick={() => setShowSummary(!showSummary)} className="w-full flex items-center justify-between">
            <span className="font-semibold text-gray-900 text-sm flex items-center gap-2">
              <FileText size={15} />{t('common.summary')}
            </span>
            <div className="flex items-center gap-4 text-sm">
              <span className="text-gray-900 font-semibold">{t('admin.staff.due')}: {money(totalDue)}</span>
              {showSummary ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </div>
          </button>
          {showSummary && (() => {
            const daysInPer = Math.max(1, Math.round((new Date(payrollDateTo) - new Date(payrollDateFrom)) / 86400000) + 1);
            const attRows = records.map(r => {
              const present = r.shifts ? r.shifts.filter(s => ['present','Present'].includes(s.status)).length : r.presentDays || 0;
              const absent = r.shifts ? r.shifts.filter(s => ['absent','Absent'].includes(s.status)).length : r.absentDays || 0;
              const late = r.shifts ? r.shifts.filter(s => ['late','Late'].includes(s.status)).length : r.lateDays || 0;
              const hours = r.totalHours || 0;
              const rate = daysInPer > 0 ? Math.round((present / daysInPer) * 100) : 0;
              return { ...r, present, absent, late, hours: Math.round(hours * 10) / 10, rate };
            });
            const totPresent = attRows.reduce((s, r) => s + r.present, 0);
            const totPossible = attRows.length * daysInPer;
            const overallRate = totPossible > 0 ? Math.round((totPresent / totPossible) * 100) : 0;

            return (
            <div className="mt-4 pt-3 border-t border-gray-100 space-y-5">

              {/* ── Attendance Section ── */}
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold mb-3">{t('admin.staff.attendanceShifts')}</p>
                <div className="overflow-hidden rounded-lg border border-gray-100">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-left">
                        <th className="px-3 py-2 text-xs font-semibold text-gray-400">{t('common.name')}</th>
                        <th className="px-3 py-2 text-xs font-semibold text-center text-gray-500">{t('admin.staff.present')}</th>
                        <th className="px-3 py-2 text-xs font-semibold text-center text-gray-500">{t('admin.staff.late')}</th>
                        <th className="px-3 py-2 text-xs font-semibold text-center text-gray-500">{t('admin.staff.absent')}</th>
                        <th className="px-3 py-2 text-xs font-semibold text-center text-gray-500">{t('admin.staff.hours')}</th>
                        <th className="px-3 py-2 text-xs font-semibold text-center text-gray-500">{t('admin.staff.rate')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {attRows.map(r => (
                        <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-3 py-2 font-semibold text-gray-900">{r.name}</td>
                          <td className="px-3 py-2 text-center font-semibold text-gray-700">{r.present}</td>
                          <td className="px-3 py-2 text-center font-semibold text-gray-700">{r.late}</td>
                          <td className="px-3 py-2 text-center font-semibold text-gray-700">{r.absent}</td>
                          <td className="px-3 py-2 text-center font-semibold text-gray-700">{r.hours}h</td>
                          <td className="px-3 py-2 text-center text-gray-500">{r.rate}%</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50">
                        <td className="px-3 py-2 font-bold text-gray-900 text-xs" colSpan={5}>{t('common.total')}</td>
                        <td className="px-3 py-2 text-center font-bold text-gray-700 text-xs">{overallRate}%</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* ── Payroll Section ── */}
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold mb-3">{t('admin.staff.payrollPayments')}</p>
                <div className="space-y-2">
                  {records.map(r => {
                    const c = getRoleColors(r.role);
                    return (
                      <div key={r.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-900 text-sm">{r.name}</span>
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-gray-100 text-gray-600">{r.role}</span>
                        </div>
                        <div className="flex items-center gap-4 text-xs">
                          <span className="text-gray-900 font-semibold">{t('admin.staff.netLabel')}: {money(r.netPay)}</span>
                          <span className="text-gray-600 font-semibold">{t('admin.staff.paidLabel')}: {money(r.totalPaid)}</span>
                          <span className={`font-semibold ${r.remaining > 0 ? 'text-gray-900' : 'text-gray-400'}`}>
                            {t('admin.staff.due')}: {money(Math.max(0, r.remaining))}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── Grand Total ── */}
              {(() => {
                const totalNet = records.reduce((s, r) => s + r.netPay, 0);
                return (
                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                  <p className="font-bold text-gray-900 text-sm mb-2">{t('common.total')}</p>
                  <div className="flex justify-between text-sm"><span className="text-gray-500">{t('common.total')}</span><span className="font-bold text-gray-900">{money(totalNet)}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-gray-500">{t('common.paid')}</span><span className="font-bold text-green-600">{money(totalPaidAll)}</span></div>
                  <div className="flex justify-between text-sm border-t border-gray-200 pt-2 mt-1"><span className="text-gray-700 font-semibold">{t('common.unpaid')}</span><span className={`font-bold ${totalDue > 0 ? 'text-amber-600' : 'text-green-600'}`}>{money(totalDue)}</span></div>
                </div>
                );
              })()}
            </div>
            );
          })()}
        </div>

        {/* Per-staff payroll cards */}
        {payrollLoading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">{t('common.loading')}</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {records.map(r => {
              const c = getRoleColors(r.role);
              return (
                <div key={r.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full ${c.avatar} flex items-center justify-center text-white font-bold`}>
                          {(r.name || '?')[0].toUpperCase()}
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900 text-sm">{r.name}</h3>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${c.bg} ${c.text}`}>{r.role}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-gray-900">{money(r.netPay)}</p>
                        <p className="text-[10px] text-gray-400">{t('common.net')}</p>
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="flex gap-3 text-center text-[11px] mb-3">
                      <div className="flex-1">
                        <p className="text-gray-400">{t('admin.staff.present')}</p>
                        <p className="text-gray-800 font-bold">{r.presentDays}</p>
                      </div>
                      <div className="flex-1">
                        <p className="text-gray-400">{t('admin.staff.absent')}</p>
                        <p className="text-gray-800 font-bold">{r.absentDays}</p>
                      </div>
                      <div className="flex-1">
                        <p className="text-gray-400">{t('admin.staff.late')}</p>
                        <p className="text-gray-800 font-bold">{r.lateDays}</p>
                      </div>
                      <div className="flex-1">
                        <p className="text-gray-400">{t('admin.staff.hours')}</p>
                        <p className="text-gray-800 font-bold">{r.totalHours.toFixed(1)}</p>
                      </div>
                    </div>

                    {/* Paid / Remaining strip */}
                    {r.netPay > 0 && (() => {
                      const fullySettled = r.remaining <= 0 && (r.totalPaid > 0 || r.effectiveFrom > payrollDateTo);
                      return (
                        <div className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-center mb-3 ${fullySettled ? 'bg-green-50 text-green-700' : r.remaining > 0 ? 'bg-amber-50 text-amber-700' : 'bg-gray-50 text-gray-500'}`}>
                          {fullySettled ? t('common.paid') : r.remaining > 0 ? `${t('admin.staff.remaining')}: ${money(r.remaining)}` : t('common.noData')}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Actions */}
                  <div className="p-3 pt-0 flex gap-2">
                    <button onClick={() => handlePayNow(r)}
                      disabled={r.remaining <= 0}
                      className={`flex-1 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 ${
                        r.remaining > 0 ? 'border border-gray-300 text-gray-700 hover:bg-gray-50' : 'bg-gray-50 text-gray-400 cursor-not-allowed'
                      }`}>
                      <Banknote size={13} />{t('admin.staff.recordPayment')}
                    </button>
                    <button onClick={() => handleShowDetails(r)}
                      className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-50 flex items-center justify-center gap-1">
                      <FileText size={13} />{t('common.details')}
                    </button>
                  </div>
                </div>
              );
            })}
            {records.length === 0 && (
              <div className="col-span-full text-center py-16 text-gray-400">{t('common.noResults')}</div>
            )}
          </div>
        )}

      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // MODALS
  // ═══════════════════════════════════════════════════════════════════════════

  // (Modal, inputCls, labelCls, btnPrimary, btnCancel defined outside component)

  return (
    <div className="h-full overflow-auto bg-gray-50">
      <Toast />

      {/* Tab navigation */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex gap-8">
            {[
              { id: 'staff', label: t('admin.staff.staffList'), icon: Users },
              { id: 'attendance', label: t('admin.staff.attendanceShifts'), icon: Clock },
              { id: 'payroll', label: t('admin.staff.payrollPayments'), icon: DollarSign },
            ].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`px-1 py-4 font-medium text-sm border-b-2 transition-colors flex items-center gap-2 ${
                  activeTab === tab.id ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                <tab.icon size={16} /> {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'staff' && StaffTab()}
        {activeTab === 'attendance' && AttendanceTab()}
        {activeTab === 'payroll' && PayrollTab()}
      </div>

      {/* ── ADD/EDIT STAFF MODAL ─────────────────────────────────────────── */}
      <Modal open={showAddEditModal} onClose={() => setShowAddEditModal(false)} title={selectedStaff ? t('admin.staff.editStaffInfo') : t('admin.staff.addNewStaff')}>
        <div className="space-y-4">
          {/* Full Name */}
          <div>
            <label className={labelCls}>{t('admin.profile.fullName')} *</label>
            <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className={inputCls} placeholder={t('placeholders.egStaffName', 'e.g. Aisha Karimova')} />
          </div>

          {/* Role — pill buttons */}
          <div>
            <label className={labelCls}>{t('common.role')} *</label>
            <div className="flex gap-2 flex-wrap">
              {ROLES.map(r => (
                <button key={r} type="button" onClick={() => { setFormData({ ...formData, role: r, ...(r !== 'kitchen' ? { kitchenStation: '' } : {}) }); }}
                  className={`px-4 py-2 rounded-full text-sm font-medium border transition-all ${
                    formData.role === r
                      ? 'bg-blue-50 border-blue-500 text-blue-700'
                      : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}>
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Kitchen Station — only for Kitchen role */}
          {formData.role === 'kitchen' && (() => {
            const kitchenStations = getKitchenStations(t);
            const allStations = [...kitchenStations, ...customStations];
            const typed = (formData.kitchenStation || '').trim();
            const alreadyPreset = allStations.some(s => s.id.toLowerCase() === typed.toLowerCase());
            const canAdd = typed.length > 0 && !alreadyPreset;
            return (
              <div>
                <label className={labelCls}>{t('admin.menu.kitchenStation')}</label>
                <div className="relative">
                  <input type="text" value={formData.kitchenStation}
                    onChange={e => setFormData({ ...formData, kitchenStation: e.target.value })}
                    className={inputCls} placeholder={t('admin.staff.stationPlaceholder')} />
                  {formData.kitchenStation && (
                    <button type="button" onClick={() => setFormData({ ...formData, kitchenStation: '' })}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      <X size={16} />
                    </button>
                  )}
                </div>
                <div className="flex items-center justify-between mt-1.5 mb-2">
                  <p className="text-xs text-gray-400 uppercase tracking-wide">{t('admin.menu.quickPick')}:</p>
                  {canAdd && (
                    <button type="button" onClick={async () => {
                      try {
                        await menuAPI.addStation(typed);
                        await fetchCustomStations();
                      } catch (e) { showError(e?.response?.data?.error || t('common.error')); }
                    }}
                      className="px-2.5 py-1 rounded-full text-xs font-medium border border-blue-400 text-blue-600 hover:bg-blue-50 flex items-center gap-1">
                      <Plus size={12} /> {t('common.add')} &quot;{typed}&quot;
                    </button>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap">
                  {kitchenStations.map(ks => {
                    const active = formData.kitchenStation?.toLowerCase() === ks.id.toLowerCase();
                    return (
                      <button key={ks.id} type="button"
                        onClick={() => setFormData({ ...formData, kitchenStation: active ? '' : ks.id })}
                        className="px-3 py-1.5 rounded-full text-sm font-medium border transition-all flex items-center gap-1.5"
                        style={active ? { background: ks.bg, borderColor: ks.color, color: ks.color } : { background: '#fff', borderColor: '#e5e7eb', color: '#6b7280' }}>
                        <ks.Icon size={14} /> {ks.label}
                      </button>
                    );
                  })}
                  {customStations.map(cs => {
                    const active = formData.kitchenStation?.toLowerCase() === cs.id.toLowerCase();
                    return (
                      <button key={cs.id} type="button"
                        onClick={() => setFormData({ ...formData, kitchenStation: active ? '' : cs.id })}
                        className="pl-3 pr-2 py-1.5 rounded-full text-sm font-medium border transition-all flex items-center gap-1.5"
                        style={active ? { background: '#EFF6FF', borderColor: '#3B82F6', color: '#2563EB' } : { background: '#fff', borderColor: '#e5e7eb', color: '#6b7280' }}>
                        {cs.label}
                        <span
                          role="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setStationToDelete(cs);
                          }}
                          className="w-5 h-5 rounded-full flex items-center justify-center hover:bg-gray-200"
                          style={active ? { background: '#DBEAFE' } : {}}>
                          <X size={11} />
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  {formData.kitchenStation ? t('admin.staff.stationHint', { station: formData.kitchenStation }) : t('admin.staff.noStationHint')}
                </p>
              </div>
            );
          })()}

          {/* Phone */}
          <div>
            <label className={labelCls}>{t('common.phone')} *</label>
            <PhoneInput
              value={formData.phone}
              onChange={phone => setFormData({ ...formData, phone })}
              placeholder={t('placeholders.phoneShort', '12 345 67 89')}
            />
          </div>

          {/* Email — only on add */}
          {!selectedStaff && (
            <div>
              <label className={labelCls}>{t('common.email')}</label>
              <input type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} className={inputCls} placeholder={t('placeholders.email', 'email')} />
            </div>
          )}

          {/* Password — only on add */}
          {!selectedStaff && (
            <div>
              <label className={labelCls}>{t('common.password')} *</label>
              <input type="password" value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} className={inputCls} placeholder={t('admin.staff.setLoginPassword')} />
            </div>
          )}

          {/* Shift Start / End */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{t('admin.staff.shiftStart')}</label>
              <input type="time" value={formData.shiftStart} onChange={e => setFormData({ ...formData, shiftStart: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{t('admin.staff.shiftEnd')}</label>
              <input type="time" value={formData.shiftEnd} onChange={e => setFormData({ ...formData, shiftEnd: e.target.value })} className={inputCls} />
            </div>
          </div>

          {/* Salary Type — pill buttons */}
          <div>
            <label className={labelCls}>{t('common.amount')} *</label>
            <div className="flex gap-2 flex-wrap">
              {SALARY_TYPES.map(st => (
                <button key={st} type="button" onClick={() => setFormData({ ...formData, salaryType: st })}
                  className={`px-4 py-2 rounded-full text-sm font-medium border transition-all ${
                    formData.salaryType === st
                      ? 'bg-blue-50 border-blue-500 text-blue-700'
                      : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}>
                  {st.charAt(0).toUpperCase() + st.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Rate — dynamic label */}
          <div>
            <label className={labelCls}>{t('admin.staff.rate')} (so'm) · {t(`admin.staff.salaryTypes.${formData.salaryType}`)}</label>
            <input type="number" value={formData.salary} onChange={e => setFormData({ ...formData, salary: e.target.value })} className={inputCls} placeholder={t('placeholders.zero', '0')} />
          </div>
        </div>

        {/* Save button full width like app */}
        <button onClick={handleSaveStaff}
          className="w-full mt-5 px-4 py-3 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors">
          {selectedStaff ? t('common.saveChanges') : t('admin.staff.addNewStaff')}
        </button>
      </Modal>

      {/* ── CREDENTIALS MODAL ────────────────────────────────────────────── */}
      <Modal open={showCredentialsModal && !!selectedStaff} onClose={() => setShowCredentialsModal(false)} title={t("admin.staff.editLoginCredentials")}>
        <div className="space-y-3">
          {/* Email */}
          <div>
            <label className={labelCls}>{t('common.email')}</label>
            <input type="email" value={credentialsData.email}
              onChange={e => setCredentialsData({ ...credentialsData, email: e.target.value })}
              className={inputCls} placeholder={t('placeholders.staffEmail', 'staff@example.com')} />
          </div>

          {/* New Password */}
          <div>
            <label className={labelCls}>{t('admin.staff.enterNewPassword')}</label>
            <div className="relative">
              <input type={showPasswords.new ? 'text' : 'password'} value={credentialsData.newPassword}
                onChange={e => setCredentialsData({ ...credentialsData, newPassword: e.target.value })}
                className={inputCls + ' pr-10'} placeholder={t('admin.staff.enterNewPassword')} />
              <button type="button" onClick={() => setShowPasswords(p => ({ ...p, new: !p.new }))}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showPasswords.new ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Confirm New Password */}
          <div>
            <label className={labelCls}>{t('admin.staff.reEnterPassword')}</label>
            <div className="relative">
              <input type={showPasswords.confirm ? 'text' : 'password'} value={credentialsData.confirmPassword}
                onChange={e => setCredentialsData({ ...credentialsData, confirmPassword: e.target.value })}
                className={`${inputCls} pr-10 ${credentialsData.confirmPassword && credentialsData.newPassword !== credentialsData.confirmPassword ? 'border-red-400 focus:ring-red-400' : ''}`}
                placeholder={t('admin.staff.reEnterPassword')} />
              <button type="button" onClick={() => setShowPasswords(p => ({ ...p, confirm: !p.confirm }))}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showPasswords.confirm ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {credentialsData.confirmPassword && credentialsData.newPassword !== credentialsData.confirmPassword && (
              <p className="text-xs text-red-500 mt-1">{t('admin.profile.passwordsDoNotMatch')}</p>
            )}
            {credentialsData.confirmPassword && credentialsData.newPassword === credentialsData.confirmPassword && credentialsData.newPassword && (
              <p className="text-xs text-green-500 mt-1 flex items-center gap-1"><Check size={12} /> {t('common.done')}</p>
            )}
          </div>
        </div>

        <button onClick={handleUpdateCredentials}
          className="w-full mt-5 px-4 py-3 bg-purple-500 text-white rounded-xl text-sm font-semibold hover:bg-purple-600 transition-colors disabled:opacity-50"
          disabled={credentialsData.newPassword && credentialsData.newPassword !== credentialsData.confirmPassword}>
          {t('common.saveChanges')}
        </button>
      </Modal>

      {/* ── PERMISSIONS MODAL ────────────────────────────────────────────── */}
      {/* ── DELETE MODAL ─────────────────────────────────────────────────── */}
      <Modal open={showDeleteModal && !!selectedStaff} onClose={() => setShowDeleteModal(false)} title={t("admin.staff.deleteStaff")}>
        <div className="flex items-center gap-3 p-4 bg-red-50 rounded-xl mb-4">
          <AlertTriangle size={22} className="text-red-500 shrink-0" />
          <div>
            <p className="font-semibold text-gray-900">{t('admin.staff.deleteConfirmName', { name: selectedStaff?.name })}</p>
            <p className="text-xs text-gray-500">{t('common.actionCannotBeUndone')}</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setShowDeleteModal(false)} className={btnCancel}>{t("common.cancel")}</button>
          <button onClick={handleDeleteStaff} className="flex-1 px-4 py-2.5 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600">{t('common.delete')}</button>
        </div>
      </Modal>

      {/* ── NEW STAFF CREATED — CREDENTIALS ──────────────────────────── */}
      <Modal open={showNewStaffModal && !!newStaffInfo} onClose={() => setShowNewStaffModal(false)} title={t("admin.staff.addNewStaff")}>
        {newStaffInfo && (
          <div>
            <div className="flex items-center gap-3 p-4 bg-green-50 rounded-xl mb-5">
              <CheckCircle size={22} className="text-green-600 shrink-0" />
              <div>
                <p className="font-semibold text-gray-900">{newStaffInfo.name} {t('admin.staff.hasBeenAdded')}</p>
                <p className="text-xs text-gray-500">{t('admin.staff.shareCredentials')}</p>
              </div>
            </div>
            <div className="space-y-3 mb-5">
              <div className="flex justify-between py-2.5 px-3 bg-gray-50 rounded-lg">
                <span className="text-xs text-gray-500 font-medium">{t('common.name')}</span>
                <span className="text-sm font-semibold text-gray-900">{newStaffInfo.name}</span>
              </div>
              <div className="flex justify-between py-2.5 px-3 bg-gray-50 rounded-lg">
                <span className="text-xs text-gray-500 font-medium">{t('common.role')}</span>
                <span className="text-sm font-semibold text-gray-900 capitalize">{newStaffInfo.role}</span>
              </div>
              <div className="flex justify-between py-2.5 px-3 bg-gray-50 rounded-lg">
                <span className="text-xs text-gray-500 font-medium">{t('common.amount')}</span>
                <span className="text-sm font-semibold text-gray-900">{money(newStaffInfo.salary)} / {newStaffInfo.salaryType}</span>
              </div>
              <div className="flex justify-between py-2.5 px-3 bg-gray-50 rounded-lg">
                <span className="text-xs text-gray-500 font-medium">{t('admin.staff.shift')}</span>
                <span className="text-sm font-semibold text-gray-900">{newStaffInfo.shiftStart} – {newStaffInfo.shiftEnd}</span>
              </div>
              <div className="h-px bg-gray-200 my-1" />
              <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                <p className="text-xs font-semibold text-blue-700 mb-2">{t('admin.staff.editLoginCredentials')}</p>
                <div className="flex justify-between py-1.5">
                  <span className="text-xs text-gray-500">{t('common.phone')} / {t('common.email')}</span>
                  <span className="text-sm font-mono text-gray-900">{newStaffInfo.phone || newStaffInfo.email}</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-xs text-gray-500">{t('common.password')}</span>
                  <span className="text-sm font-mono font-bold text-gray-900">{newStaffInfo.password}</span>
                </div>
              </div>
            </div>
            <button onClick={() => setShowNewStaffModal(false)} className="w-full px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
              {t('common.done')}
            </button>
          </div>
        )}
      </Modal>

      {/* ── DELETE STATION CONFIRM ─────────────────────────────────────── */}
      <Modal open={!!stationToDelete} onClose={() => setStationToDelete(null)} title={t("common.delete")}>
        <div className="flex items-center gap-3 p-4 bg-red-50 rounded-xl mb-4">
          <AlertTriangle size={22} className="text-red-500 shrink-0" />
          <div>
            <p className="font-semibold text-gray-900">{t('admin.staff.deleteConfirmName', { name: stationToDelete?.label })}</p>
            <p className="text-xs text-gray-500">{t('admin.staff.deleteStationHint')}</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setStationToDelete(null)} className={btnCancel}>{t("common.cancel")}</button>
          <button onClick={async () => {
            const cs = stationToDelete;
            setStationToDelete(null);
            try {
              await menuAPI.deleteStation(cs.label);
              await fetchCustomStations();
              if (formData.kitchenStation?.toLowerCase() === cs.id.toLowerCase()) {
                setFormData({ ...formData, kitchenStation: '' });
              }
              showSuccess(t('admin.staff.stationDeleted'));
            } catch (err) {
              showError(err?.response?.data?.error || t('admin.staff.cannotDeleteStation'));
            }
          }} className="flex-1 px-4 py-2.5 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600">{t('common.delete')}</button>
        </div>
      </Modal>

      {/* ── EDIT ATTENDANCE MODAL ────────────────────────────────────────── */}
      <Modal open={showEditShiftModal} onClose={() => setShowEditShiftModal(false)} title={t("admin.staff.attendanceShifts")}>
        {(() => {
          const memberName = staff.find(s => s.id === editShiftData.userId)?.name;
          const needsTime = editShiftData.status === 'present' || editShiftData.status === 'late';
          const statuses = [
            { value: 'present', label: t('admin.staff.present'), color: 'bg-green-50 border-green-400 text-green-700' },
            { value: 'late', label: t('admin.staff.late'), color: 'bg-yellow-50 border-yellow-400 text-yellow-700' },
            { value: 'absent', label: t('admin.staff.absent'), color: 'bg-red-50 border-red-400 text-red-700' },
            { value: 'excused', label: t('admin.staff.excused'), color: 'bg-purple-50 border-purple-400 text-purple-700' },
          ];
          return (
            <div className="space-y-5">
              {/* Staff name + date info */}
              <div className="bg-gray-50 rounded-xl p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm">
                  {(memberName || '?')[0].toUpperCase()}
                </div>
                <div>
                  <p className="font-bold text-gray-900">{memberName}</p>
                  <p className="text-xs text-gray-500">{editShiftData.date || attDate}</p>
                </div>
              </div>

              {/* Date */}
              <div>
                <label className={labelCls}>{t('common.date')}</label>
                <DatePicker value={editShiftData.date || attDate} onChange={v => setEditShiftData({ ...editShiftData, date: v })} size="sm" />
              </div>

              {/* Status chips */}
              <div>
                <label className={labelCls}>{t('common.status')}</label>
                <div className="flex gap-2">
                  {statuses.map(s => (
                    <button key={s.value} onClick={() => setEditShiftData({ ...editShiftData, status: s.value })}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${
                        editShiftData.status === s.value ? s.color : 'bg-gray-50 border-gray-200 text-gray-400'
                      }`}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Clock times — only for Present/Late */}
              {needsTime && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>{t('admin.staff.clockInLabel')}</label>
                    <input type="time" value={editShiftData.clockIn} onChange={e => setEditShiftData({ ...editShiftData, clockIn: e.target.value })} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>{t('admin.staff.clockOutLabel')}</label>
                    <input type="time" value={editShiftData.clockOut} onChange={e => setEditShiftData({ ...editShiftData, clockOut: e.target.value })} className={inputCls} />
                  </div>
                </div>
              )}

              {/* Note */}
              <div>
                <label className={labelCls}>{t('common.notes')}</label>
                <textarea value={editShiftData.note} onChange={e => setEditShiftData({ ...editShiftData, note: e.target.value })}
                  className={inputCls + ' min-h-[60px] resize-none'} placeholder={t('placeholders.egPosition', 'e.g. Doctor')} rows={2} />
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-1">
                <button onClick={() => setShowEditShiftModal(false)} className={btnCancel}>{t("common.cancel")}</button>
                <button onClick={handleEditShift} className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 flex items-center justify-center gap-1.5 transition-colors">
                  <Check size={15} /> {editShiftData.id ? t('admin.staff.updateRecord') : t('admin.staff.createRecord')}
                </button>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* ── PAY NOW MODAL ────────────────────────────────────────────────── */}
      <Modal open={showPaymentModal} onClose={() => setShowPaymentModal(false)} title={payTarget ? `${t('admin.staff.recordPayment')} - ${payTarget.name}` : t('admin.staff.recordPayment')}>
        <div className="space-y-3">
          {!payTarget && (
            <div><label className={labelCls}>{t('admin.staff.staffMember')}</label>
              <Dropdown value="" onChange={v => {
                const m = staff.find(s => String(s.id) === String(v));
                if (m) setPayTarget(m);
              }} options={[{ value: '', label: t('admin.staff.selectStaff') }, ...staff.map(s => ({ value: s.id, label: s.name }))]} /></div>
          )}
          {payTarget && (
            <div className="bg-blue-50 rounded-lg p-3 text-sm">
              <p className="text-gray-600">{t('admin.staff.netPay')}: <strong className="text-gray-900">{money(payTarget.netPay || 0)}</strong></p>
              {payTarget.remaining !== undefined && (
                <p className="text-gray-600">{t('admin.staff.remaining')}: <strong className={payTarget.remaining > 0 ? 'text-red-600' : 'text-green-600'}>{money(payTarget.remaining)}</strong></p>
              )}
            </div>
          )}
          <div><label className={labelCls}>{t('common.amount')}</label><input type="number" value={paymentFormData.amount} onChange={e => setPaymentFormData({ ...paymentFormData, amount: e.target.value })} className={inputCls} placeholder="0" /></div>
          <div><label className={labelCls}>{t('cashier.orders.paymentMethod')}</label>
            <Dropdown value={paymentFormData.method} onChange={v => setPaymentFormData({ ...paymentFormData, method: v })}
              options={[{ value: 'Cash', label: t('paymentMethods.cash') }, { value: 'Bank Transfer', label: t('paymentMethods.bankTransfer') }, { value: 'Card', label: t('paymentMethods.card') }, { value: 'Check', label: t('paymentMethods.check') }]} /></div>
          <div><label className={labelCls}>{t('admin.staff.note')}</label><input type="text" value={paymentFormData.note} onChange={e => setPaymentFormData({ ...paymentFormData, note: e.target.value })} className={inputCls} placeholder={t('admin.staff.optional')} /></div>
          <div><label className={labelCls}>{t('common.date')}</label><DatePicker value={paymentFormData.date} onChange={v => setPaymentFormData({ ...paymentFormData, date: v })} size="sm" /></div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={() => setShowPaymentModal(false)} className={btnCancel}>{t("common.cancel")}</button>
          <button onClick={handleRecordPayment} className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">{t('admin.staff.recordPayment')}</button>
        </div>
      </Modal>

      {/* ── DETAILS MODAL ────────────────────────────────────────────────── */}
      <Modal open={showDetailsModal && !!detailsTarget} onClose={() => setShowDetailsModal(false)} title={t('admin.staff.payrollDetails')} wide>
        {detailsTarget && (() => {
          const r = detailsTarget;
          const excusedDays = r.shifts ? r.shifts.filter(s => ['excused','Excused'].includes(s.status)).length : 0;
          return (
            <div className="space-y-5">
              {/* ── Header Card with Name + Net Pay ── */}
              <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl p-5 text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-bold">{r.name}</h3>
                    <p className="text-blue-200 text-sm mt-0.5">{t(`admin.staff.salaryTypes.${r.salaryType || 'monthly'}`)} {t('admin.staff.salaryLabel')} -- {payrollDateFrom} to {payrollDateTo}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-blue-200 text-xs font-medium">{t('admin.staff.netPayHeader')}</p>
                    <p className="text-2xl font-extrabold">{money(r.netPay)}</p>
                  </div>
                </div>

                {/* Attendance badges inline */}
                <div className="flex gap-3 mt-4">
                  <div className="flex items-center gap-1.5 bg-white/15 rounded-lg px-3 py-1.5">
                    <Check size={13} className="text-green-300" />
                    <span className="text-sm font-semibold">{r.presentDays}</span>
                    <span className="text-blue-200 text-xs">{t('admin.staff.present')}</span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-white/15 rounded-lg px-3 py-1.5">
                    <XCircle size={13} className="text-red-300" />
                    <span className="text-sm font-semibold">{r.absentDays}</span>
                    <span className="text-blue-200 text-xs">{t('admin.staff.absent')}</span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-white/15 rounded-lg px-3 py-1.5">
                    <Clock size={13} className="text-yellow-300" />
                    <span className="text-sm font-semibold">{r.lateDays}</span>
                    <span className="text-blue-200 text-xs">{t('admin.staff.late')}</span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-white/15 rounded-lg px-3 py-1.5">
                    <AlertCircle size={13} className="text-purple-300" />
                    <span className="text-sm font-semibold">{excusedDays}</span>
                    <span className="text-blue-200 text-xs">{t('admin.staff.excused')}</span>
                  </div>
                </div>
              </div>

              {/* ── Two-column layout: Salary + Payments ── */}
              <div className="grid grid-cols-2 gap-4">
                {/* Left: Salary Breakdown */}
                <div className="border border-gray-200 rounded-xl p-4">
                  <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <DollarSign size={13} /> {t('admin.staff.salaryBreakdown')}
                  </h4>
                  <div className="space-y-2.5 text-sm">
                    {r.salaryType === 'hourly' && (<>
                      <div className="flex justify-between"><span className="text-gray-500">{t('admin.staff.hourlyRate')}</span><span className="font-medium text-gray-900">{money(r.baseSalary)} / hr</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">{t('admin.staff.hoursWorkedLabel')}</span><span className="font-medium text-gray-900">{r.totalHours.toFixed(1)} hrs</span></div>
                    </>)}
                    {r.salaryType === 'daily' && (<>
                      <div className="flex justify-between"><span className="text-gray-500">{t('admin.staff.dailyRate')}</span><span className="font-medium text-gray-900">{money(r.baseSalary)} / day</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">{t('admin.staff.daysPresent')}</span><span className="font-medium text-gray-900">{r.daysWorked}</span></div>
                    </>)}
                    {r.salaryType === 'weekly' && (<>
                      <div className="flex justify-between"><span className="text-gray-500">{t('admin.staff.weeklySalary')}</span><span className="font-medium text-gray-900">{money(r.baseSalary)}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">{t('admin.staff.dailyRate')}</span><span className="font-medium text-gray-900">{money(Math.round(r.baseSalary / 6))} / day</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">{t('admin.staff.daysPresent')}</span><span className="font-medium text-gray-900">{r.daysWorked}</span></div>
                    </>)}
                    {r.salaryType === 'monthly' && (<>
                      <div className="flex justify-between"><span className="text-gray-500">{t('admin.staff.monthlySalary')}</span><span className="font-medium text-gray-900">{money(r.baseSalary)}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">{t('admin.staff.workingDays')}</span><span className="font-medium text-gray-900">{r.workingDays} days</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">{t('admin.staff.dailyRate')}</span><span className="font-medium text-gray-900">{money(Math.round(r.baseSalary / r.workingDays))} / day</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">{t('admin.staff.daysPresent')}</span><span className="font-medium text-gray-900">{r.daysWorked}</span></div>
                    </>)}
                    <div className="border-t border-gray-100 pt-2 mt-1">
                      <div className="flex justify-between font-semibold">
                        <span className="text-gray-700">{t('admin.staff.basePay')}</span>
                        <span className="text-gray-900">{money(r.grossPay)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right: Payments */}
                <div className="border border-gray-200 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                      <CreditCard size={13} /> {t('admin.staff.payments')}
                    </h4>
                    <button onClick={() => {
                      setPayTarget(r);
                      setPaymentFormData({ amount: String(Math.max(0, r.remaining).toFixed(0)), method: 'Cash', note: '', date: getToday() });
                      setShowDetailsModal(false);
                      setShowPaymentModal(true);
                    }} className="flex items-center gap-1 px-2.5 py-1 bg-green-50 text-green-600 rounded-lg text-xs font-semibold hover:bg-green-100 transition-colors">
                      <Plus size={12} /> {t('common.add')}
                    </button>
                  </div>

                  {(!r.payments || r.payments.length === 0) ? (
                    <div className="flex flex-col items-center justify-center py-6 text-gray-300">
                      <Banknote size={28} className="mb-2" />
                      <p className="text-sm">{t('admin.staff.noPaymentsYet')}</p>
                    </div>
                  ) : (() => {
                    const ef = r.effectiveFrom || payrollDateFrom;
                    const settledPmts = r.payments.filter(p => {
                      const pd = (p.paymentDate || p.payment_date || '').split('T')[0];
                      return pd >= payrollDateFrom && pd < ef;
                    });
                    const currentPmts = r.payments.filter(p => {
                      const pd = (p.paymentDate || p.payment_date || '').split('T')[0];
                      return r.effectiveFrom > payrollDateTo
                        ? pd >= payrollDateFrom && pd <= payrollDateTo
                        : pd >= ef;
                    });
                    const renderPayment = (p, isSettled) => (
                      <div key={p.id} className={`group rounded-lg px-3 py-2.5 flex items-center transition-colors ${isSettled ? 'bg-gray-50 opacity-60' : 'bg-gray-50 hover:bg-gray-100'}`}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-3 flex-shrink-0 ${isSettled ? 'bg-green-50' : 'bg-blue-100'}`}>
                          <Banknote size={14} className={isSettled ? 'text-green-500' : 'text-blue-600'} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className={`font-bold text-sm ${isSettled ? 'text-gray-500' : 'text-blue-600'}`}>{money(p.amount)}</span>
                          {isSettled && <span className="ml-1.5 text-[10px] font-semibold text-green-600 bg-green-50 px-1.5 py-0.5 rounded">{t('admin.staff.settled')}</span>}
                          <p className="text-xs text-gray-400 truncate">
                            {(p.paymentDate || p.payment_date || '').split('T')[0]} · {p.paymentMethod || p.payment_method || t('payment.cash', 'Cash')}
                          </p>
                          {(p.note || p.notes) && <p className="text-xs text-gray-400 italic truncate">"{p.note || p.notes}"</p>}
                        </div>
                        {!isSettled && (
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                            <button onClick={() => {
                              setPayTarget(r);
                              setPaymentFormData({
                                amount: String(parseFloat(p.amount) || 0),
                                method: p.paymentMethod || p.payment_method || t('payment.cash', 'Cash'),
                                note: p.note || '',
                                date: (p.paymentDate || p.payment_date || '').split('T')[0] || getToday(),
                              });
                              setShowDetailsModal(false);
                              setShowPaymentModal(true);
                            }} className="p-1.5 bg-blue-100 text-blue-600 rounded-md hover:bg-blue-200 transition-colors" title={t('common.edit')}>
                              <Edit2 size={12} />
                            </button>
                            <button onClick={() => {
                              if (confirm(t('admin.staff.deletePaymentConfirm', { amount: money(p.amount) }))) {
                                handleDeletePayment(p.id || p.paymentId);
                                setShowDetailsModal(false);
                              }
                            }} className="p-1.5 bg-red-100 text-red-600 rounded-md hover:bg-red-200 transition-colors" title={t('common.delete')}>
                              <Trash2 size={12} />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                    return (
                    <div className="space-y-2">
                      {settledPmts.map(p => renderPayment(p, true))}
                      {currentPmts.length === 0 && settledPmts.length > 0 && (
                        <p className="text-xs text-gray-400 text-center py-1">{t('admin.staff.noNewPayments')}</p>
                      )}
                      {currentPmts.map(p => renderPayment(p, false))}
                    </div>
                    );
                  })()}

                  {/* Total Paid / Remaining summary */}
                  {(() => {
                    // Period-based: all payments within [from, to] vs full period earnings.
                    // This ensures overpayments on the last payment date are counted correctly.
                    const displayTotal = r.payments.filter(p => {
                      const pd = (p.paymentDate || p.payment_date || '').split('T')[0];
                      return pd >= payrollDateFrom && pd <= payrollDateTo;
                    }).reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
                    const displayRemaining = r.effectiveFrom > payrollDateTo
                      ? 0
                      : Math.max(0, r.netPay - displayTotal);
                    return (
                      <div className={`rounded-lg p-3 mt-3 text-sm ${displayRemaining <= 0 && displayTotal > 0 ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-gray-200'}`}>
                        <div className="flex justify-between items-center">
                          <span className="text-gray-500 text-xs font-medium">{t('admin.staff.totalPaid')}</span>
                          <span className="font-bold text-green-600">{money(displayTotal)}</span>
                        </div>
                        <div className="flex justify-between items-center mt-1">
                          <span className="text-gray-500 text-xs font-medium">{t('admin.staff.remaining')}</span>
                          <span className={`font-bold ${displayRemaining > 0 ? 'text-orange-500' : 'text-green-600'}`}>{money(Math.max(0, displayRemaining))}</span>
                        </div>
                        {displayRemaining <= 0 && displayTotal > 0 && (
                          <div className="flex items-center justify-center gap-1 mt-2 text-green-600 text-xs font-semibold">
                            <CheckCircle size={13} /> {t('admin.staff.fullyPaid')}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* ── Attendance Records ── */}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                  <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Calendar size={13} /> {t('admin.staff.attendanceRecords')}
                  </h4>
                </div>
                {(!r.shifts || r.shifts.length === 0) ? (
                  <div className="flex flex-col items-center justify-center py-8 text-gray-300">
                    <Calendar size={28} className="mb-2" />
                    <p className="text-sm">{t('admin.staff.noRecordsInPeriod')}</p>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-left">
                        <th className="px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase">{t('common.date')}</th>
                        <th className="px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase">{t('admin.staff.clockInLabel')}</th>
                        <th className="px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase">{t('admin.staff.clockOutLabel')}</th>
                        <th className="px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase">{t('admin.staff.hours')}</th>
                        <th className="px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase">{t('common.status')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {r.shifts.map((s, i) => {
                        const statusLower = (s.status||'').toLowerCase();
                        const statusStyles = statusLower === 'present' ? 'bg-green-50 text-green-700 border border-green-200'
                          : statusLower === 'late' ? 'bg-yellow-50 text-yellow-700 border border-yellow-200'
                          : statusLower === 'excused' ? 'bg-purple-50 text-purple-700 border border-purple-200'
                          : 'bg-red-50 text-red-700 border border-red-200';
                        return (
                          <tr key={i} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-2.5 font-medium text-gray-900">{(s.shiftDate || s.shift_date || s.clockIn || s.clock_in || '').split('T')[0] || '-'}</td>
                            <td className="px-4 py-2.5 text-gray-600">{fmtTime(s.clockIn || s.clock_in) || '-'}</td>
                            <td className="px-4 py-2.5 text-gray-600">{fmtTime(s.clockOut || s.clock_out) || '-'}</td>
                            <td className="px-4 py-2.5 font-medium text-gray-900">{parseFloat(s.hoursWorked || s.hours_worked || 0).toFixed(1)}h</td>
                            <td className="px-4 py-2.5">
                              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${statusStyles}`}>{s.status}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Close button */}
              <div className="flex justify-end pt-1">
                <button onClick={() => setShowDetailsModal(false)} className="px-5 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors">
                  {t('common.close')}
                </button>
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
};

export default AdminStaff;

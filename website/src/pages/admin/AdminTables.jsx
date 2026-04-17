import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import AdminNewOrder from './AdminNewOrder';
import PhoneInput, { formatPhoneDisplay } from '../../components/PhoneInput';
import { useApi } from '../../hooks/useApi';
import { tablesAPI, ordersAPI, menuAPI } from '../../api/client';
import {
  Plus, Minus, Trash2, X, Grid3X3, Users, AlertTriangle, RefreshCw,
  Settings, CheckCircle2, Clock, AlertCircle, Sparkles, ClipboardList,
  CalendarCheck, ChevronRight, User, Phone, Calendar, UserCheck,
  XCircle, Timer, Receipt, UtensilsCrossed, ArrowLeft,
} from 'lucide-react';

// ─── Status config ────────────────────────────────────────────────────────────
// Colors aligned with mobile app: free=green, occupied=red, reserved=blue, cleaning=amber
const STATUS = {
  free: {
    border:    'border-l-4 border-green-500',
    badge:     'bg-green-100 text-green-700',
    dot:       'bg-green-500',
    dotText:   'text-green-500',
    label:     'Free',
    title:     'Available',
    subtitle:  'Ready to seat guests',
    icon:      CheckCircle2,
    iconColor: 'text-green-500',
    barColor:  'bg-green-500',
    cardBg:    'bg-green-50/30',
  },
  occupied: {
    border:    'border-l-4 border-red-500',
    badge:     'bg-red-100 text-red-700',
    dot:       'bg-red-500',
    dotText:   'text-red-600',
    label:     'Occupied',
    title:     'Occupied',
    subtitle:  'Currently in use',
    icon:      AlertCircle,
    iconColor: 'text-red-500',
    barColor:  'bg-red-500',
    cardBg:    'bg-red-50/30',
  },
  reserved: {
    border:    'border-l-4 border-blue-500',
    badge:     'bg-blue-100 text-blue-700',
    dot:       'bg-blue-500',
    dotText:   'text-blue-600',
    label:     'Reserved',
    title:     'Reserved',
    subtitle:  'Reservation is active',
    icon:      CalendarCheck,
    iconColor: 'text-blue-500',
    barColor:  'bg-blue-500',
    cardBg:    'bg-blue-50/30',
  },
  cleaning: {
    border:    'border-l-4 border-amber-500',
    badge:     'bg-amber-100 text-amber-700',
    dot:       'bg-amber-400',
    dotText:   'text-amber-600',
    label:     'Cleaning',
    title:     'Cleaning',
    subtitle:  'Being prepared for next guests',
    icon:      Sparkles,
    iconColor: 'text-amber-500',
    barColor:  'bg-amber-500',
    cardBg:    'bg-amber-50/30',
  },
};

// ─── Section helpers ──────────────────────────────────────────────────────────
const sectionBadgeColor = (sec) => {
  const k = (sec || '').toLowerCase();
  if (k === 'indoor')  return 'bg-purple-100 text-purple-700';
  if (k === 'outdoor') return 'bg-emerald-100 text-emerald-700';
  if (k === 'terrace') return 'bg-sky-100 text-sky-700';
  return 'bg-gray-100 text-gray-600';
};

const sectionBarColor = (sec) => {
  const k = (sec || '').toLowerCase();
  if (k === 'indoor')  return 'bg-purple-500';
  if (k === 'outdoor') return 'bg-emerald-500';
  if (k === 'terrace') return 'bg-sky-500';
  return 'bg-gray-400';
};

const sectionInitialBg = (sec) => {
  const k = (sec || '').toLowerCase();
  if (k === 'indoor')  return 'bg-purple-100 text-purple-700';
  if (k === 'outdoor') return 'bg-emerald-100 text-emerald-700';
  if (k === 'terrace') return 'bg-sky-100 text-sky-700';
  return 'bg-gray-200 text-gray-600';
};

const DEFAULT_SECTIONS = ['Indoor', 'Outdoor', 'Terrace'];

const getSection = (table) => {
  const raw = (table.zone || table.section || '').trim();
  if (!raw) return '';
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
};

const getStatusCfg = (status) => STATUS[status] || STATUS.free;

const getTableName = (table) =>
  table.name || (table.tableNumber ? `Table ${table.tableNumber}` : 'Table');

// ─── Component ────────────────────────────────────────────────────────────────
export default function AdminTables() {

  const { call }   = useApi();

  const [tables,          setTables]          = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [error,           setError]           = useState(null);
  const [activeFilter,    setActiveFilter]    = useState('all');
  const [allSections,     setAllSections]     = useState(DEFAULT_SECTIONS);
  const [newSectionInput, setNewSectionInput] = useState('');

  // modals / sheets
  const [modal,           setModal]           = useState(null); // 'add'|'edit'|'sections'|'reserve'
  const [selectedTable,   setSelectedTable]   = useState(null); // detail sheet
  const [statusTable,     setStatusTable]     = useState(null); // status picker
  const [pendingStatus,   setPendingStatus]   = useState(null);
  const [newOrderTable,   setNewOrderTable]   = useState(null); // new order modal
  const [editingTableId,  setEditingTableId]  = useState(null);
  const [deleteId,        setDeleteId]        = useState(null);

  // forms
  const [form, setForm] = useState({
    tableName: '', section: 'Indoor', capacity: '4',
  });
  const [reserveForm, setReserveForm] = useState({
    reservationGuest: '', reservationPhone: '', reservationTime: '',
  });
  const [validationErrors, setValidationErrors] = useState({});
  const [saving, setSaving] = useState(false);

  // order view state (for occupied tables)
  const [tableOrder,        setTableOrder]        = useState(null);
  const [tableOrderLoading, setTableOrderLoading] = useState(false);
  const [orderViewOpen,     setOrderViewOpen]     = useState(false);
  const [addFoodOpen,       setAddFoodOpen]       = useState(false);
  const [menuCategories,    setMenuCategories]    = useState([]);
  const [menuItems,         setMenuItems]         = useState([]);
  const [addFoodCat,        setAddFoodCat]        = useState(null);
  const [addFoodCart,       setAddFoodCart]       = useState({});
  const [addFoodSaving,     setAddFoodSaving]     = useState(false);

  // polling ref
  const pollRef = useRef(null);

  // tick state — increments every second to keep elapsed timers live
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // ── Data fetch ──────────────────────────────────────────────────────────────
  const fetchSections = useCallback(async () => {
    try {
      const data = await call(tablesAPI.getSections);
      if (Array.isArray(data)) setAllSections(data);
    } catch (_) {}
  }, [call]);

  const fetchTables = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await call(tablesAPI.getAll);
      const arr = Array.isArray(data) ? data : [];
      setTables(arr);
      // keep selectedTable in sync with latest data
      setSelectedTable(prev => {
        if (!prev) return null;
        return arr.find(t => t.id === prev.id) || null;
      });
      setError(null);
    } catch (err) {
      console.error('Failed to fetch tables:', err);
      if (!silent) setError('Failed to load tables');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [call]);

  useEffect(() => {
    fetchTables();
    fetchSections();
    // poll every 1 second to stay in sync
    pollRef.current = setInterval(() => fetchTables(true), 1000);
    return () => clearInterval(pollRef.current);
  }, [fetchTables, fetchSections]);

  // ── Fetch active order for a table ──────────────────────────────────────────
  const fetchTableOrder = useCallback(async (tableId, silent = false) => {
    if (!silent) setTableOrderLoading(true);
    try {
      const data = await ordersAPI.getAll({
        tableId,
        status: 'pending,sent_to_kitchen,preparing,ready,bill_requested',
      });
      const orders = Array.isArray(data) ? data : (Array.isArray(data?.orders) ? data.orders : []);
      const active = orders[0] || null;
      if (active) {
        // Fetch full order with items
        const full = await ordersAPI.getById(active.id);
        setTableOrder(full || active);
      } else {
        setTableOrder(null);
      }
    } catch (err) {
      if (!silent) console.error('Failed to fetch order:', err);
    } finally {
      if (!silent) setTableOrderLoading(false);
    }
  }, []);

  const fetchMenuForAddFood = useCallback(async () => {
    try {
      const [cats, itms] = await Promise.all([menuAPI.getCategories(), menuAPI.getItems()]);
      setMenuCategories(Array.isArray(cats) ? cats : []);
      setMenuItems(Array.isArray(itms) ? itms : []);
      if (Array.isArray(cats) && cats.length > 0) setAddFoodCat(cats[0].id);
    } catch (err) {
      console.error('Failed to fetch menu:', err);
    }
  }, []);

  // ── When selectedTable changes, fetch its order if occupied ─────────────────
  useEffect(() => {
    if (selectedTable?.status === 'occupied') {
      setTableOrder(null);
      fetchTableOrder(selectedTable.id);
    } else {
      setTableOrder(null);
    }
    // Reset view states when sheet closes or table changes
    setOrderViewOpen(false);
    setAddFoodOpen(false);
    setAddFoodCart({});
  }, [selectedTable?.id, selectedTable?.status, fetchTableOrder]);

  // ── Poll the active order every 1s while order view is open ─────────────────
  useEffect(() => {
    if (!orderViewOpen || !selectedTable?.id) return;
    const t = setInterval(() => fetchTableOrder(selectedTable.id, true), 1000);
    return () => clearInterval(t);
  }, [orderViewOpen, selectedTable?.id, fetchTableOrder]);

  // ── Elapsed time helper ───────────────────────────────────────────────────
  const getElapsed = (openedAt) => {
    if (!openedAt) return '00:00:00';
    const diffSec = Math.floor((Date.now() - new Date(openedAt).getTime()) / 1000);
    const h = Math.floor(diffSec / 3600);
    const m = Math.floor((diffSec % 3600) / 60);
    const s = diffSec % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const formatPrice = (p) => Number(p || 0).toLocaleString('uz-UZ') + " so'm";

  // ── Add food to order ────────────────────────────────────────────────────────
  const handleAddFoodToOrder = async () => {
    if (!tableOrder?.id || Object.keys(addFoodCart).length === 0) return;
    setAddFoodSaving(true);
    try {
      const items = Object.values(addFoodCart).map(({ item, qty }) => ({
        menuItemId: item.id,
        quantity:   qty,
        unitPrice:  parseFloat(item.price || 0),
      }));
      await ordersAPI.addItems(tableOrder.id, items);
      await fetchTableOrder(selectedTable.id, true);
      setAddFoodCart({});
      setAddFoodOpen(false);
    } catch (err) {
      console.error('Failed to add items:', err);
    } finally {
      setAddFoodSaving(false);
    }
  };

  const summary = useMemo(() => {
    const free     = tables.filter(t => t.status === 'free').length;
    const occupied = tables.filter(t => t.status === 'occupied').length;
    const reserved = tables.filter(t => t.status === 'reserved').length;
    const cleaning = tables.filter(t => t.status === 'cleaning').length;
    const total    = tables.length;
    const occupancy = total ? Math.round(occupied / total * 100) : 0;
    const activeValue = tables.reduce((s, t) => s + (Number(t.orderTotal || t.order_total) || 0), 0);
    return { free, occupied, reserved, cleaning, total, occupancy, activeValue };
  }, [tables]);

  const filteredTables = activeFilter === 'all'
    ? tables
    : tables.filter(t => getSection(t).toLowerCase() === activeFilter.toLowerCase());

  // ── Validation ──────────────────────────────────────────────────────────────
  const validateForm = () => {
    const errors = {};
    if (!form.tableName.trim()) errors.tableName = 'Table name is required';
    if (!form.section)          errors.section   = 'Section is required';
    if (!form.capacity || isNaN(form.capacity) || parseInt(form.capacity) < 1)
      errors.capacity = 'Number of seats must be a valid number';
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // ── Modal helpers ────────────────────────────────────────────────────────────
  const openAddModal = () => {
    setValidationErrors({});
    setForm({ tableName: '', section: 'Indoor', capacity: '4' });
    setEditingTableId(null);
    setModal('add');
  };

  const openEditModal = (table) => {
    setSelectedTable(null);
    setValidationErrors({});
    const sec = getSection(table);
    setForm({
      tableName: getTableName(table),
      section:   sec || 'Indoor',
      capacity:  String(table.capacity || 4),
    });
    setEditingTableId(table.id);
    setModal('edit');
  };

  const openReserveModal = (table) => {
    setSelectedTable(null);
    setReserveForm({
      reservationGuest: table.reservationGuest || '',
      reservationPhone: table.reservationPhone || '',
      reservationTime:  table.reservationTime  || '',
    });
    setModal('reserve');
    // store which table we're reserving
    setEditingTableId(table.id);
  };

  const closeModal = () => {
    setModal(null);
    setEditingTableId(null);
    setValidationErrors({});
  };

  // ── Save table (create/edit) ─────────────────────────────────────────────────
  const handleSave = async () => {
    if (!validateForm()) return;
    setSaving(true);
    try {
      const numericMatch = form.tableName.trim().match(/\d+/);
      if (modal === 'add') {
        const payload = {
          name:        form.tableName.trim(),
          tableNumber: numericMatch ? parseInt(numericMatch[0], 10) : undefined,
          zone:        form.section,
          section:     form.section,
          capacity:    parseInt(form.capacity, 10),
        };
        await call(tablesAPI.create, payload);
      } else if (editingTableId) {
        // Spread the current table so the full PUT doesn't wipe runtime fields
        // like status, openedAt, reservationGuest, reservationPhone, reservationTime.
        // Only the fields the admin actually edited are overwritten.
        const currentTable = tables.find(t => t.id === editingTableId) || {};
        const payload = {
          ...currentTable,
          name:        form.tableName.trim(),
          tableNumber: numericMatch ? parseInt(numericMatch[0], 10) : undefined,
          zone:        form.section,
          section:     form.section,
          capacity:    parseInt(form.capacity, 10),
        };
        await call(tablesAPI.update, editingTableId, payload);
      }
      await fetchTables(true);
      closeModal();
    } catch (err) {
      console.error('Failed to save table:', err);
    } finally {
      setSaving(false);
    }
  };

  // ── Reserve table ────────────────────────────────────────────────────────────
  const handleSaveReservation = async () => {
    if (!editingTableId) return;
    setSaving(true);
    try {
      await call(tablesAPI.update, editingTableId, {
        status:           'reserved',
        reservationGuest: reserveForm.reservationGuest.trim() || null,
        reservationPhone: reserveForm.reservationPhone.trim() || null,
        reservationTime:  reserveForm.reservationTime         || null,
      });
      await fetchTables(true);
      closeModal();
    } catch (err) {
      console.error('Failed to reserve table:', err);
    } finally {
      setSaving(false);
    }
  };

  // ── Seat guests (reserved → occupied) ───────────────────────────────────────
  const handleSeatGuests = async (table) => {
    try {
      await call(tablesAPI.update, table.id, {
        status:           'occupied',
        reservationGuest: null,
        reservationPhone: null,
        reservationTime:  null,
      });
      await fetchTables(true);
      // Open new order modal for this table
      setNewOrderTable(table);
    } catch (err) {
      console.error('Failed to seat guests:', err);
    }
  };

  // ── Cancel reservation ───────────────────────────────────────────────────────
  const handleCancelReservation = async (table) => {
    try {
      await call(tablesAPI.update, table.id, {
        status:           'free',
        reservationGuest: null,
        reservationPhone: null,
        reservationTime:  null,
      });
      await fetchTables(true);
    } catch (err) {
      console.error('Failed to cancel reservation:', err);
    }
  };

  // ── Mark free (from occupied/cleaning) ───────────────────────────────────────
  const handleMarkFree = async (table) => {
    try {
      await call(tablesAPI.update, table.id, { status: 'free' });
      await fetchTables(true);
    } catch (err) {
      console.error('Failed to mark table free:', err);
    }
  };

  // ── Apply status (from status picker) ───────────────────────────────────────
  const handleApplyStatus = async () => {
    if (!statusTable || !pendingStatus) return;

    // If reserving, open the reservation form instead of applying directly
    if (pendingStatus === 'reserved') {
      const t = statusTable;
      setStatusTable(null);
      setPendingStatus(null);
      setEditingTableId(t.id);
      setReserveForm({
        reservationGuest: t.reservationGuest || '',
        reservationPhone: t.reservationPhone || '',
        reservationTime:  t.reservationTime  || '',
      });
      setModal('reserve');
      return;
    }

    setSaving(true);
    const tableRef = statusTable;
    const statusRef = pendingStatus;
    try {
      const extra = { reservationGuest: null, reservationPhone: null, reservationTime: null };
      await call(tablesAPI.update, statusTable.id, { status: pendingStatus, ...extra });
      await fetchTables(true);
      setStatusTable(null);
      setPendingStatus(null);
      // If marked occupied, open new order modal for this table
      if (statusRef === 'occupied') {
        setNewOrderTable(tableRef);
      }
    } catch (err) {
      console.error('Failed to update status:', err);
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ───────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await call(tablesAPI.delete, deleteId);
      setTables(prev => prev.filter(t => t.id !== deleteId));
      setDeleteId(null);
      setSelectedTable(null);
    } catch (err) {
      console.error('Failed to delete table:', err);
    }
  };

  // ── Manage sections ──────────────────────────────────────────────────────────
  const handleAddSection = () => {
    const name = newSectionInput.trim();
    if (!name) return;
    if (allSections.map(s => s.toLowerCase()).includes(name.toLowerCase())) return;
    // Optimistic update — instant UI response
    setAllSections(prev => [...prev, name]);
    setNewSectionInput('');
    // Persist to backend in the background
    call(tablesAPI.addSection, name).catch(() => {});
  };

  const handleDeleteSection = (sec) => {
    const count = tables.filter(t => getSection(t).toLowerCase() === sec.toLowerCase()).length;
    if (count > 0) return;
    // Optimistic update — instant UI response
    setAllSections(prev => prev.filter(s => s !== sec));
    if (activeFilter.toLowerCase() === sec.toLowerCase()) setActiveFilter('all');
    // Persist to backend in the background
    call(tablesAPI.deleteSection, sec).catch(() => {});
  };

  // ── Loading / error ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <RefreshCw size={32} className="text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600 font-medium">Loading tables...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md text-center">
          <AlertTriangle size={24} className="text-red-600 mx-auto mb-4" />
          <p className="text-red-700 font-medium">{error}</p>
          <button onClick={() => fetchTables()} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">
            Retry
          </button>
        </div>
      </div>
    );
  }

  const tableCount = tables.length;

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="h-full overflow-auto bg-gray-50">

      {/* ── Header ── */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-100 rounded-lg">
                <Grid3X3 size={24} className="text-blue-600" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Table Management</h1>
                <p className="text-gray-600 text-sm mt-1">
                  {tableCount} total {tableCount === 1 ? 'table' : 'tables'} in system
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => fetchTables(true)}
                className="p-2.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
                title="Refresh"
              >
                <RefreshCw size={18} />
              </button>
              <button
                onClick={() => setModal('sections')}
                className="inline-flex items-center gap-2 px-4 py-3 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition-colors"
              >
                <Settings size={18} />
                Sections
              </button>
              <button
                onClick={openAddModal}
                className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-md"
              >
                <Plus size={20} />
                Add Table
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Status Summary Cards ── */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Free */}
            <div className="relative overflow-hidden bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl border border-green-100 px-5 py-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-green-500 flex items-center justify-center flex-shrink-0 shadow-sm">
                <CheckCircle2 size={22} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-green-600 uppercase tracking-wider">Free</p>
                <p className="text-3xl font-black text-green-700 leading-none mt-0.5">{summary.free}</p>
                <p className="text-xs text-green-500 mt-1">{summary.total ? Math.round(summary.free / summary.total * 100) : 0}% of tables</p>
              </div>
              <div className="absolute right-3 bottom-3 text-green-100">
                <CheckCircle2 size={48} />
              </div>
            </div>

            {/* Occupied */}
            <div className="relative overflow-hidden bg-gradient-to-br from-red-50 to-rose-50 rounded-2xl border border-red-100 px-5 py-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-red-500 flex items-center justify-center flex-shrink-0 shadow-sm">
                <AlertCircle size={22} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-red-600 uppercase tracking-wider">Occupied</p>
                <p className="text-3xl font-black text-red-700 leading-none mt-0.5">{summary.occupied}</p>
                <p className="text-xs text-red-400 mt-1">{summary.occupancy}% occupancy</p>
              </div>
              <div className="absolute right-3 bottom-3 text-red-100">
                <AlertCircle size={48} />
              </div>
            </div>

            {/* Reserved */}
            <div className="relative overflow-hidden bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl border border-blue-100 px-5 py-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-500 flex items-center justify-center flex-shrink-0 shadow-sm">
                <CalendarCheck size={22} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider">Reserved</p>
                <p className="text-3xl font-black text-blue-700 leading-none mt-0.5">{summary.reserved}</p>
                <p className="text-xs text-blue-400 mt-1">upcoming guests</p>
              </div>
              <div className="absolute right-3 bottom-3 text-blue-100">
                <CalendarCheck size={48} />
              </div>
            </div>

            {/* Cleaning */}
            <div className="relative overflow-hidden bg-gradient-to-br from-amber-50 to-yellow-50 rounded-2xl border border-amber-100 px-5 py-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-amber-400 flex items-center justify-center flex-shrink-0 shadow-sm">
                <Sparkles size={22} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider">Cleaning</p>
                <p className="text-3xl font-black text-amber-700 leading-none mt-0.5">{summary.cleaning}</p>
                <p className="text-xs text-amber-400 mt-1">being prepared</p>
              </div>
              <div className="absolute right-3 bottom-3 text-amber-100">
                <Sparkles size={48} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Floor Summary ── */}
      <div className="bg-gray-50 border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center gap-6 flex-wrap">
            {/* Label */}
            <div className="flex items-center gap-2 text-gray-500 flex-shrink-0">
              <UtensilsCrossed size={15} className="text-gray-400" />
              <span className="text-xs font-bold uppercase tracking-wider">Floor Summary</span>
            </div>
            {/* Divider */}
            <div className="hidden md:block w-px h-6 bg-gray-200" />
            {/* Total tables */}
            <div className="flex items-center gap-2">
              <span className="text-lg font-black text-gray-800">{summary.total}</span>
              <span className="text-xs text-gray-400 font-medium">Total Tables</span>
            </div>
            {/* Occupancy bar */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-lg font-black text-red-600">{summary.occupancy}%</span>
                <span className="text-xs text-gray-400 font-medium">Occupied</span>
              </div>
              <div className="w-28 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-green-400 to-red-500 rounded-full transition-all duration-500"
                  style={{ width: `${summary.occupancy}%` }}
                />
              </div>
            </div>
            {/* Divider */}
            <div className="hidden md:block w-px h-6 bg-gray-200" />
            {/* Active revenue */}
            <div className="flex items-center gap-2">
              <Receipt size={14} className="text-green-500" />
              <span className="text-lg font-black text-green-700">
                {summary.activeValue >= 1000000
                  ? (summary.activeValue / 1000000).toFixed(1) + 'M'
                  : summary.activeValue >= 1000
                  ? (summary.activeValue / 1000).toFixed(0) + 'K'
                  : Math.round(summary.activeValue).toLocaleString('uz-UZ')}
              </span>
              <span className="text-xs text-gray-400 font-medium">so'm active</span>
            </div>
            {/* Divider */}
            <div className="hidden md:block w-px h-6 bg-gray-200" />
            {/* Status mini legend */}
            <div className="flex items-center gap-3 ml-auto">
              {[
                { dot: 'bg-green-500', label: `${summary.free} free` },
                { dot: 'bg-red-500',   label: `${summary.occupied} occupied` },
                { dot: 'bg-blue-500',  label: `${summary.reserved} reserved` },
              ].map(({ dot, label }) => (
                <div key={label} className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${dot} flex-shrink-0`} />
                  <span className="text-xs text-gray-500 font-medium whitespace-nowrap">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Main Content ── */}
      <div className="max-w-7xl mx-auto px-6 py-8">

        {/* Filter tabs */}
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          {['all', ...allSections].map((f) => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                activeFilter === f
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {f === 'all' ? 'All' : f}
            </button>
          ))}
          {activeFilter !== 'all' && (
            <span className="text-sm text-gray-500 ml-1">
              {filteredTables.length} {filteredTables.length === 1 ? 'table' : 'tables'}
            </span>
          )}
        </div>

        {/* Tables grid */}
        {tableCount === 0 ? (
          <div className="text-center py-16 bg-white rounded-lg border border-gray-200">
            <Grid3X3 size={48} className="text-gray-300 mx-auto mb-4" />
            <p className="text-gray-600 font-medium mb-4">No tables yet</p>
            <button onClick={openAddModal} className="inline-flex items-center gap-2 px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
              <Plus size={18} /> Create your first table
            </button>
          </div>
        ) : filteredTables.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-lg border border-gray-200">
            <Grid3X3 size={48} className="text-gray-300 mx-auto mb-4" />
            <p className="text-gray-600 font-medium">No {activeFilter} tables found</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
            {filteredTables.map((table) => {
              const section = getSection(table);
              const cfg     = getStatusCfg(table.status);
              const name    = getTableName(table);

              return (
                <div
                  key={table.id}
                  onClick={() => setSelectedTable(table)}
                  className={`bg-white rounded-xl shadow-md hover:shadow-lg transition-all duration-200 hover:scale-105 cursor-pointer flex flex-col ${cfg.border}`}
                  style={{ height: 220 }}
                >
                  {/* Section badge */}
                  <div className="px-3 pt-3 flex-shrink-0">
                    {section ? (
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${sectionBadgeColor(section)}`}>
                        {section}
                      </span>
                    ) : <div className="h-5" />}
                  </div>

                  {/* Table name */}
                  <div className="px-3 pb-2 pt-1 border-b border-gray-100 flex-shrink-0">
                    <h3 className="text-xl font-bold text-gray-900 text-center truncate">{name}</h3>
                  </div>

                  {/* Info body — fills remaining space */}
                  <div className="px-3 pt-2 pb-1 flex-1 flex flex-col gap-1.5 overflow-hidden">
                    {/* Capacity */}
                    <div className="flex items-center gap-1.5 text-xs">
                      <Users size={12} className="text-gray-400 flex-shrink-0" />
                      <span className="text-gray-700 font-medium">
                        {table.capacity} {table.capacity === 1 ? 'person' : 'people'}
                      </span>
                    </div>
                    {/* Reservation guest */}
                    {table.status === 'reserved' && table.reservationGuest && (
                      <div className="flex items-center gap-1.5 text-xs text-blue-600">
                        <User size={11} className="flex-shrink-0" />
                        <span className="truncate font-medium">{table.reservationGuest}</span>
                      </div>
                    )}
                    {/* Reservation time */}
                    {table.status === 'reserved' && table.reservationTime && (
                      <div className="flex items-center gap-1.5 text-xs text-blue-600">
                        <Clock size={11} className="flex-shrink-0" />
                        <span className="truncate">{table.reservationTime}</span>
                      </div>
                    )}
                    {/* Occupied elapsed timer */}
                    {table.status === 'occupied' && table.openedAt && (
                      <div className="flex items-center gap-1.5 text-xs text-red-600 font-mono font-bold">
                        <Timer size={11} className="flex-shrink-0" />
                        <span>{getElapsed(table.openedAt)}</span>
                      </div>
                    )}
                    {/* Status badge — pushed to bottom */}
                    <div className="mt-auto pt-1">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.badge}`}>
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
                        {cfg.label}
                      </span>
                    </div>
                  </div>

                  {/* Footer: edit + delete */}
                  <div className="px-3 py-2 border-t border-gray-100 flex gap-2 flex-shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); openEditModal(table); }}
                      className="flex-1 flex items-center justify-center py-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                      title="Edit table"
                    >
                      <Settings size={14} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteId(table.id); }}
                      className="flex-1 flex items-center justify-center py-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                      title="Delete table"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════
          TABLE DETAIL SHEET
      ════════════════════════════════════════════════ */}
      {selectedTable && (() => {
        const table = selectedTable;
        const cfg   = getStatusCfg(table.status);
        const section = getSection(table);
        const name    = getTableName(table);
        const StatusIcon = cfg.icon;
        const isReserved  = table.status === 'reserved';
        const isOccupied  = table.status === 'occupied';
        const isCleaning  = table.status === 'cleaning';
        const isFree      = table.status === 'free';

        return (
          <div
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
            onClick={() => setSelectedTable(null)}
          >
            <div
              className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${cfg.dot}`} />
                  <h2 className="text-xl font-bold text-gray-900">{name}</h2>
                  {section && (
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${sectionBadgeColor(section)}`}>
                      {section}
                    </span>
                  )}
                </div>
                <button onClick={() => setSelectedTable(null)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                  <X size={20} className="text-gray-500" />
                </button>
              </div>

              {/* Status + capacity bar */}
              <div className="px-6 py-4 flex items-center gap-4 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <StatusIcon size={16} className={cfg.iconColor} />
                  <span className={`text-sm font-semibold ${cfg.dotText}`}>{cfg.label}</span>
                </div>
                <div className="flex items-center gap-1.5 text-sm text-gray-500">
                  <Users size={14} className="text-gray-400" />
                  <span>{table.capacity} seats</span>
                </div>
                <div className="ml-auto flex-1 max-w-32">
                  <div className={`h-1.5 w-full rounded-full ${cfg.barColor}`} />
                </div>
              </div>

              {/* ── Reserved: show reservation details ── */}
              {isReserved && (
                <div className="mx-6 mb-4 bg-blue-50 rounded-xl divide-y divide-blue-100 border border-blue-100">
                  {[
                    { icon: User,     label: 'Guest', value: table.reservationGuest || '—' },
                    { icon: Phone,    label: 'Phone', value: formatPhoneDisplay(table.reservationPhone) || '—' },
                    { icon: Calendar, label: 'Time',  value: table.reservationTime  || '—' },
                  ].map(({ icon: Icon, label, value }) => (
                    <div key={label} className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-2 text-gray-500 text-sm">
                        <Icon size={15} />
                        <span>{label}</span>
                      </div>
                      <span className="text-gray-800 font-semibold text-sm">{value}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* ── Occupied: live stats box ── */}
              {isOccupied && (
                <div className="mx-6 mb-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-center">
                      <div className="flex items-center justify-center gap-1.5 mb-1">
                        <Timer size={14} className="text-red-500" />
                        <p className="text-xs font-semibold text-red-400 uppercase tracking-wide">Time Elapsed</p>
                      </div>
                      <p className="text-xl font-bold text-red-600 font-mono">
                        {getElapsed(table.openedAt)}
                      </p>
                    </div>
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center">
                      <div className="flex items-center justify-center gap-1.5 mb-1">
                        <Receipt size={14} className="text-gray-400" />
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Order Total</p>
                      </div>
                      <p className="text-base font-bold text-gray-900">
                        {tableOrderLoading ? '...' : tableOrder ? formatPrice(tableOrder.totalAmount) : '—'}
                      </p>
                    </div>
                  </div>
                  {tableOrder?.waitressName && (
                    <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <User size={14} />
                        <span>Waiter</span>
                      </div>
                      <span className="text-sm font-bold text-gray-800">{tableOrder.waitressName}</span>
                    </div>
                  )}
                </div>
              )}

              {/* ── Free / Cleaning: status state box ── */}
              {!isReserved && !isOccupied && (
                <div className="mx-6 mb-4 bg-gray-50 rounded-xl p-5 flex flex-col items-center">
                  <StatusIcon size={38} className={`${cfg.iconColor} mb-2`} />
                  <p className="text-lg font-bold text-gray-900 mb-0.5">{cfg.title}</p>
                  <p className="text-sm text-gray-500">{cfg.subtitle}</p>
                </div>
              )}

              {/* ── Action buttons (context-aware) ── */}
              <div className="px-6 pb-6 flex flex-col gap-2">
                {isFree && (
                  <div className="flex gap-3">
                    <button
                      onClick={() => { const t = table; setSelectedTable(null); setNewOrderTable(t); }}
                      className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors"
                    >
                      <ClipboardList size={18} />
                      New Order
                    </button>
                    <button
                      onClick={() => { setSelectedTable(null); setStatusTable(table); setPendingStatus(table.status || 'free'); }}
                      className="flex-1 flex items-center justify-center gap-2 py-3.5 border-2 border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors"
                    >
                      <Settings size={18} />
                      Status
                    </button>
                  </div>
                )}

                {isReserved && (
                  <div className="flex gap-3">
                    <button
                      onClick={() => { handleSeatGuests(table); setSelectedTable(null); }}
                      className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors"
                    >
                      <UserCheck size={18} />
                      Seat Guests
                    </button>
                    <button
                      onClick={() => { handleCancelReservation(table); setSelectedTable(null); }}
                      className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-red-50 border-2 border-red-200 text-red-600 font-semibold rounded-xl hover:bg-red-100 transition-colors"
                    >
                      <XCircle size={18} />
                      Cancel Reservation
                    </button>
                  </div>
                )}

                {isOccupied && (
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => { fetchMenuForAddFood(); setOrderViewOpen(true); }}
                      className="w-full flex items-center justify-center gap-2 py-3.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors"
                    >
                      <ClipboardList size={18} />
                      View Full Order
                    </button>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setStatusTable(table); setPendingStatus(table.status || 'occupied'); }}
                        className="flex-1 flex items-center justify-center gap-2 py-3 border-2 border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors text-sm"
                      >
                        <Settings size={16} />
                        Change Status
                      </button>
                      <button
                        onClick={() => { handleMarkFree(table); setSelectedTable(null); }}
                        className="flex-1 flex items-center justify-center gap-2 py-3 bg-green-50 border-2 border-green-300 text-green-700 font-semibold rounded-xl hover:bg-green-100 transition-colors text-sm"
                      >
                        <CheckCircle2 size={16} />
                        Free Table
                      </button>
                    </div>
                  </div>
                )}

                {isCleaning && (
                  <button
                    onClick={() => { handleMarkFree(table); setSelectedTable(null); }}
                    className="w-full flex items-center justify-center gap-2 py-3.5 bg-green-600 text-white font-semibold rounded-xl hover:bg-green-700 transition-colors"
                  >
                    <CheckCircle2 size={18} />
                    Mark as Free
                  </button>
                )}

                {/* Edit + Delete */}
                <div className="mt-1 border border-gray-200 rounded-xl overflow-hidden">
                  <button
                    onClick={() => openEditModal(table)}
                    className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors border-b border-gray-200"
                  >
                    <div className="flex items-center gap-3 text-gray-700 font-medium text-sm">
                      <Settings size={16} className="text-gray-400" />
                      Edit Table
                    </div>
                    <ChevronRight size={16} className="text-gray-400" />
                  </button>
                  <button
                    onClick={() => { setDeleteId(table.id); setSelectedTable(null); }}
                    className="w-full flex items-center justify-between px-5 py-4 hover:bg-red-50 transition-colors"
                  >
                    <div className="flex items-center gap-3 text-red-600 font-medium text-sm">
                      <Trash2 size={16} className="text-red-400" />
                      Delete
                    </div>
                    <ChevronRight size={16} className="text-red-300" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ════════════════════════════════════════════════
          ADD / EDIT MODAL
      ════════════════════════════════════════════════ */}
      {(modal === 'add' || modal === 'edit') && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">
                {modal === 'add' ? 'Add New Table' : 'Edit Table'}
              </h2>
              <button onClick={closeModal} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                <X size={20} className="text-gray-600" />
              </button>
            </div>

            <div className="px-6 py-6 space-y-5">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Table Name</label>
                <input
                  type="text"
                  value={form.tableName}
                  onChange={(e) => setForm({ ...form, tableName: e.target.value })}
                  className={`w-full px-4 py-3 border rounded-xl bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-600 ${validationErrors.tableName ? 'border-red-400' : 'border-gray-200'}`}
                  placeholder="e.g. Table 9, Garden A, VIP 1..."
                />
                {validationErrors.tableName && <p className="text-red-600 text-sm mt-1">{validationErrors.tableName}</p>}
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Number of Seats</label>
                <input
                  type="number"
                  min="1"
                  value={form.capacity}
                  onChange={(e) => setForm({ ...form, capacity: e.target.value })}
                  className={`w-full px-4 py-3 border rounded-xl bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-600 ${validationErrors.capacity ? 'border-red-400' : 'border-gray-200'}`}
                  placeholder="4"
                />
                {validationErrors.capacity && <p className="text-red-600 text-sm mt-1">{validationErrors.capacity}</p>}
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Section</label>
                <div className="flex flex-wrap gap-2">
                  {allSections.map((s) => (
                    <button key={s} type="button" onClick={() => setForm({ ...form, section: s })}
                      className={`px-4 py-2 rounded-full text-sm font-semibold border-2 transition-colors ${
                        form.section === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                      }`}
                    >{s}</button>
                  ))}
                </div>
              </div>

            </div>

            <div className="flex flex-col gap-2 px-6 pb-6">
              <button onClick={handleSave} disabled={saving}
                className="w-full py-3.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-60"
              >
                {saving ? 'Saving...' : modal === 'add' ? 'Add Table' : 'Save Changes'}
              </button>
              <button onClick={closeModal}
                className="w-full py-3.5 text-gray-600 font-semibold border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════
          RESERVE TABLE MODAL
      ════════════════════════════════════════════════ */}
      {modal === 'reserve' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">Reserve Table</h2>
              <button onClick={closeModal} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                <X size={20} className="text-gray-600" />
              </button>
            </div>

            <div className="px-6 py-6 space-y-5">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Guest Name</label>
                <div className="relative">
                  <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={reserveForm.reservationGuest}
                    onChange={(e) => setReserveForm({ ...reserveForm, reservationGuest: e.target.value })}
                    className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    placeholder="Guest name"
                  />
                </div>
              </div>

              <div>
                <PhoneInput
                  value={reserveForm.reservationPhone}
                  onChange={(value) => setReserveForm({ ...reserveForm, reservationPhone: value })}
                  label="Phone"
                  size="md"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Reservation Time</label>
                <div className="relative">
                  <Clock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="time"
                    value={reserveForm.reservationTime}
                    onChange={(e) => setReserveForm({ ...reserveForm, reservationTime: e.target.value })}
                    className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 px-6 pb-6">
              <button onClick={handleSaveReservation} disabled={saving}
                className="w-full py-3.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-60"
              >
                {saving ? 'Saving...' : 'Reserve Table'}
              </button>
              <button onClick={closeModal}
                className="w-full py-3.5 text-gray-600 font-semibold border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════
          STATUS PICKER SHEET
      ════════════════════════════════════════════════ */}
      {statusTable && (() => {
        const name = getTableName(statusTable);
        const opts = [
          { key: 'free',     label: 'Free',     dot: 'bg-green-500', sel: 'border-green-500 bg-green-50 text-green-700' },
          { key: 'occupied', label: 'Occupied', dot: 'bg-red-500',   sel: 'border-red-500 bg-red-50 text-red-700'     },
          { key: 'reserved', label: 'Reserved', dot: 'bg-blue-500',  sel: 'border-blue-500 bg-blue-50 text-blue-700'  },
          { key: 'cleaning', label: 'Cleaning', dot: 'bg-amber-400', sel: 'border-amber-400 bg-amber-50 text-amber-700' },
        ];

        return (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => { setStatusTable(null); setPendingStatus(null); }}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Change Status</h2>
                  <p className="text-sm text-gray-500 mt-0.5">{name}</p>
                </div>
                <button onClick={() => { setStatusTable(null); setPendingStatus(null); }} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                  <X size={20} className="text-gray-500" />
                </button>
              </div>
              <div className="px-6 py-5">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Select Status</p>
                <div className="grid grid-cols-2 gap-2.5">
                  {opts.map(({ key, label, dot, sel }) => (
                    <button key={key} onClick={() => setPendingStatus(key)}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 font-semibold transition-all text-sm ${
                        pendingStatus === key ? sel : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dot}`} />
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="px-6 pb-6 flex gap-3">
                <button onClick={() => { setStatusTable(null); setPendingStatus(null); }}
                  className="flex-1 py-3 text-gray-600 font-semibold border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors text-sm"
                >
                  Cancel
                </button>
                <button onClick={handleApplyStatus} disabled={saving}
                  className="flex-1 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-60 text-sm"
                >
                  {saving ? 'Applying...' : 'Apply'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ════════════════════════════════════════════════
          NEW ORDER MODAL
      ════════════════════════════════════════════════ */}
      {newOrderTable && (
        <AdminNewOrder
          isModal
          initialTable={newOrderTable}
          onClose={() => setNewOrderTable(null)}
        />
      )}

      {/* ════════════════════════════════════════════════
          MANAGE SECTIONS MODAL
      ════════════════════════════════════════════════ */}
      {modal === 'sections' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">Manage Sections</h2>
              <button onClick={closeModal} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                <X size={20} className="text-gray-600" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-5">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Add New Section</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newSectionInput}
                    onChange={(e) => setNewSectionInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddSection()}
                    className="flex-1 px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    placeholder="e.g. Rooftop, Garden..."
                  />
                  <button onClick={handleAddSection} className="px-5 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors">
                    Add
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Sections</label>
                <div className="space-y-2">
                  {allSections.map((sec) => {
                    const count = tables.filter(t => getSection(t).toLowerCase() === sec.toLowerCase()).length;
                    const canDelete = count === 0;
                    return (
                      <div key={sec} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                        <div className={`w-1 self-stretch rounded-full ${sectionBarColor(sec)}`} />
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold ${sectionInitialBg(sec)}`}>
                          {sec.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1">
                          <p className="font-semibold text-gray-800 text-sm">{sec}</p>
                          <p className="text-xs text-gray-500">{count} {count === 1 ? 'table' : 'tables'}</p>
                        </div>
                        <button
                          onClick={() => handleDeleteSection(sec)}
                          disabled={!canDelete}
                          className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
                            canDelete ? 'bg-red-100 hover:bg-red-200 text-red-500' : 'bg-gray-100 text-gray-300 cursor-not-allowed'
                          }`}
                          title={canDelete ? 'Remove section' : 'Cannot remove — section has tables'}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-gray-400 mt-3 italic">Sections with tables cannot be removed.</p>
              </div>
            </div>
            <div className="px-6 pb-6">
              <button onClick={closeModal} className="w-full py-3.5 text-gray-600 font-semibold border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════
          VIEW FULL ORDER SHEET
      ════════════════════════════════════════════════ */}
      {orderViewOpen && selectedTable && (
        <div className="fixed inset-0 bg-black/60 flex items-end justify-center z-[60] p-4">
          <div className="bg-white rounded-t-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-gray-100">
              <button
                onClick={() => setOrderViewOpen(false)}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <ArrowLeft size={18} className="text-gray-600" />
              </button>
              <div className="flex-1">
                <h2 className="text-lg font-bold text-gray-900">
                  {getTableName(selectedTable)}
                  {tableOrder?.dailyNumber ? ` — Order #${tableOrder.dailyNumber}` : ''}
                </h2>
                {tableOrder && (
                  <p className="text-xs text-gray-400">
                    {(tableOrder.items || tableOrder.orderItems || []).length} items
                    &nbsp;·&nbsp; Total: {formatPrice(tableOrder.totalAmount)}
                  </p>
                )}
              </div>
              <button
                onClick={() => { setOrderViewOpen(false); setAddFoodOpen(false); }}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X size={18} className="text-gray-500" />
              </button>
            </div>

            {/* Items list */}
            <div className="flex-1 overflow-y-auto px-5 py-3">
              {tableOrderLoading && !tableOrder && (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw size={22} className="animate-spin text-blue-500" />
                </div>
              )}
              {!tableOrderLoading && !tableOrder && (
                <div className="text-center py-12 text-gray-400">
                  <Receipt size={36} className="mx-auto mb-3 opacity-30" />
                  <p className="font-medium">No active order found</p>
                  <p className="text-sm mt-1">Start a new order from the table card</p>
                </div>
              )}
              {tableOrder && (() => {
                const items = tableOrder.items || tableOrder.orderItems || [];
                return (
                  <div className="space-y-2">
                    {items.length === 0 && (
                      <p className="text-center text-gray-400 py-8 text-sm">No items yet</p>
                    )}
                    {items.map((item, idx) => (
                      <div
                        key={item.id || idx}
                        className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3 border border-gray-100"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm text-gray-900 truncate">
                            {item.name || item.menuItemName || item.itemName || 'Item'}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {formatPrice(item.unitPrice || item.price)} × {item.quantity}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="font-bold text-sm text-gray-800">
                            {formatPrice((parseFloat(item.unitPrice || item.price || 0)) * (item.quantity || 1))}
                          </p>
                          {item.status && (
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                              item.status === 'ready'   ? 'bg-green-100 text-green-700' :
                              item.status === 'served'  ? 'bg-gray-100 text-gray-500'  :
                              'bg-amber-100 text-amber-700'
                            }`}>
                              {item.status}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>

            {/* Total + Add Food */}
            {tableOrder && (
              <div className="border-t border-gray-100 px-5 pt-3 pb-6">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-gray-500">Total</span>
                  <span className="text-lg font-bold text-gray-900">{formatPrice(tableOrder.totalAmount)}</span>
                </div>
                <button
                  onClick={() => { setAddFoodOpen(true); fetchMenuForAddFood(); }}
                  className="w-full flex items-center justify-center gap-2 py-3.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors"
                >
                  <Plus size={18} />
                  Add Food
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════
          ADD FOOD SHEET
      ════════════════════════════════════════════════ */}
      {addFoodOpen && orderViewOpen && selectedTable && (
        <div className="fixed inset-0 bg-black/60 flex items-end justify-center z-[70] p-4">
          <div className="bg-white rounded-t-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-gray-100">
              <button
                onClick={() => { setAddFoodOpen(false); setAddFoodCart({}); }}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <ArrowLeft size={18} className="text-gray-600" />
              </button>
              <h2 className="flex-1 text-lg font-bold text-gray-900">Add Food</h2>
              {Object.keys(addFoodCart).length > 0 && (
                <span className="bg-blue-600 text-white text-xs font-bold px-2.5 py-1 rounded-full">
                  {Object.values(addFoodCart).reduce((s, e) => s + e.qty, 0)} items
                </span>
              )}
            </div>

            {/* Category pills */}
            <div className="px-4 pt-3 pb-2">
              <div className="flex gap-2 overflow-x-auto pb-1">
                {menuCategories.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setAddFoodCat(cat.id)}
                    className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-all ${
                      addFoodCat === cat.id
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Items */}
            <div className="flex-1 overflow-y-auto px-4 py-2">
              <div className="space-y-2">
                {menuItems
                  .filter(item => !addFoodCat || item.categoryId === addFoodCat)
                  .map(item => {
                    const qty = addFoodCart[item.id]?.qty || 0;
                    return (
                      <div key={item.id} className="flex items-center gap-3 bg-white border border-gray-100 rounded-xl px-4 py-3 shadow-sm">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm text-gray-900 truncate">{item.name}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{formatPrice(item.price)}</p>
                        </div>
                        {qty === 0 ? (
                          <button
                            onClick={() => setAddFoodCart(prev => ({
                              ...prev,
                              [item.id]: { item, qty: 1 },
                            }))}
                            className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center hover:bg-blue-700 flex-shrink-0"
                          >
                            <Plus size={16} className="text-white" />
                          </button>
                        ) : (
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                              onClick={() => setAddFoodCart(prev => {
                                const cur = prev[item.id]?.qty || 0;
                                if (cur <= 1) { const n = { ...prev }; delete n[item.id]; return n; }
                                return { ...prev, [item.id]: { item, qty: cur - 1 } };
                              })}
                              className="w-7 h-7 rounded-full border-2 border-gray-200 flex items-center justify-center hover:bg-gray-100"
                            >
                              <Minus size={13} className="text-gray-600" />
                            </button>
                            <span className="font-bold text-gray-900 w-5 text-center text-sm">{qty}</span>
                            <button
                              onClick={() => setAddFoodCart(prev => ({
                                ...prev,
                                [item.id]: { item, qty: (prev[item.id]?.qty || 0) + 1 },
                              }))}
                              className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center hover:bg-blue-700"
                            >
                              <Plus size={13} className="text-white" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Add to Order button */}
            <div className="border-t border-gray-100 px-4 pb-6 pt-3">
              <button
                onClick={handleAddFoodToOrder}
                disabled={Object.keys(addFoodCart).length === 0 || addFoodSaving}
                className="w-full flex items-center justify-between px-5 py-4 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <span className="bg-blue-500 rounded-lg px-2.5 py-1 text-sm">
                  {Object.values(addFoodCart).reduce((s, e) => s + e.qty, 0)}
                </span>
                <span>{addFoodSaving ? 'Adding...' : 'Add to Order'}</span>
                <span className="text-blue-200 text-sm font-semibold">
                  {formatPrice(Object.values(addFoodCart).reduce((s, e) => s + e.qty * parseFloat(e.item.price || 0), 0))}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════
          DELETE CONFIRM
      ════════════════════════════════════════════════ */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <AlertTriangle size={20} className="text-red-600" />
              </div>
              <h2 className="text-lg font-bold text-gray-900">Delete Table</h2>
            </div>
            <div className="px-6 py-6">
              <p className="text-gray-700 font-medium mb-2">Are you sure you want to delete this table?</p>
              <p className="text-gray-600 text-sm">This action cannot be undone.</p>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
              <button onClick={() => setDeleteId(null)} className="flex-1 px-4 py-2.5 text-gray-700 font-medium border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors">
                Cancel
              </button>
              <button onClick={handleDelete} className="flex-1 px-4 py-2.5 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors">
                Delete Table
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

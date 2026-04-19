import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../../context/LanguageContext';
import { money } from '../../hooks/useApi';
import {
  reportsAPI,
  ordersAPI,
  warehouseAPI,
  shiftsAPI,
  tablesAPI,
  loansAPI,
  notificationsAPI,
  staffPaymentsAPI,
  accountingAPI,
  procurementAPI,
} from '../../api/client';
import {
  LayoutDashboard,
  DollarSign,
  ShoppingCart,
  Users,
  Grid3X3,
  AlertTriangle,
  Clock,
  TrendingUp,
  RefreshCw,
  Package,
  ArrowRight,
  Bell,
  X,
  CheckCircle,
  CreditCard,
  Briefcase,
  User,
  LogOut,
  Utensils,
  Truck,
  ShoppingBag,
  Flame,
  Archive,
  TrendingDown,
} from 'lucide-react';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [expandedLowStock, setExpandedLowStock] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notificationsRead, setNotificationsRead] = useState(false);

  // Data state
  const [dashboardData, setDashboardData] = useState(null);
  const [simpleDash, setSimpleDash] = useState(null); // from /reports/dashboard — reliable revenue/orders/tables
  const [tables, setTables] = useState([]);
  const [lowStockItems, setLowStockItems] = useState([]);
  const [activeOrders, setActiveOrders] = useState([]);
  const [staffStatus, setStaffStatus] = useState([]);
  const [bestSellers, setBestSellers] = useState([]);
  const [payrollData, setPayrollData] = useState(null);
  const [paymentsData, setPaymentsData] = useState([]);
  const [loansData, setLoansData] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [cashFlowData, setCashFlowData] = useState({ inflow: 0, outflow: 0 });
  const [allWarehouseItems, setAllWarehouseItems] = useState([]);
  const [warehouseMovements, setWarehouseMovements] = useState([]);
  const [supplierDebt, setSupplierDebt] = useState(0);

  // Calculate today's date range
  const getTodayRange = () => {
    const today = new Date();
    const from = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
    const to = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);
    return { from: from.toISOString(), to: to.toISOString() };
  };

  // Month-to-date range (1st of month → today) — used for payroll & payments
  const getMonthRange = () => {
    const today = new Date();
    const monthStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
    const todayStr   = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })();
    return { from: monthStart, to: todayStr };
  };

  // Fetch all dashboard data
  const fetchDashboardData = useCallback(async () => {
    try {
      const { from, to } = getTodayRange();
      const { from: monthFrom, to: monthTo } = getMonthRange();

      const results = await Promise.allSettled([
        reportsAPI.getAdminDailySummary(),            // 0
        tablesAPI.getAll(),                            // 1
        warehouseAPI.getLowStock(),                    // 2
        ordersAPI.getAll({ from, to }),                // 3 — fetch ALL orders today, filter client-side
        shiftsAPI.getStaffStatus(),                    // 4
        reportsAPI.getBestSellers({ from, to }),       // 5
        shiftsAPI.getPayroll({ from: monthFrom, to: monthTo }),       // 6 — month-to-date payroll
        staffPaymentsAPI.getAll({ from: monthFrom, to: monthTo }),    // 7 — month-to-date payments
        loansAPI.getStats(),                           // 8
        notificationsAPI.getAll(),                     // 9
        accountingAPI.getCashFlow({ from, to }),       // 10
        warehouseAPI.getAll(),                         // 11
        warehouseAPI.getMovements({ from, to }),       // 12
        reportsAPI.getDashboard(),                     // 13 — reliable revenue/orders fallback
        procurementAPI.getDeliveriesDebt(),            // 14 — unpaid supplier debt from DB
      ]);

      // Handle summary (admin-daily-summary)
      if (results[0].status === 'fulfilled' && results[0].value) {
        setDashboardData(results[0].value);
      }

      // Handle simple dashboard (reliable revenue, orders, table counts)
      if (results[13]?.status === 'fulfilled' && results[13].value) {
        setSimpleDash(results[13].value);
      }

      // Handle supplier debt from DB — try dedicated endpoint, then fallback to full deliveries list
      let debtResolved = 0;
      if (results[14]?.status === 'fulfilled' && results[14].value) {
        const debtVal = results[14].value;
        // The interceptor camelizes keys, so totalDebt is the primary key
        debtResolved = parseFloat(debtVal.totalDebt ?? debtVal.total_debt ?? 0) || 0;
      }
      if (debtResolved === 0) {
        // Fallback: compute from full deliveries list (handles case where debt endpoint
        // returned 0 because data hadn't been synced yet from mobile app)
        try {
          const delivs = await procurementAPI.getDeliveries();
          const arr = Array.isArray(delivs) ? delivs : [];
          debtResolved = arr
            .filter(d => {
              const ps = (d.paymentStatus || d.payment_status || '').toLowerCase();
              const st = d.status || '';
              return ps !== 'paid' && ['Delivered', 'Partial'].includes(st);
            })
            .reduce((s, d) => s + (parseFloat(d.total) || 0), 0);
        } catch (_) {}
      }
      setSupplierDebt(debtResolved);

      // Handle tables
      if (results[1].status === 'fulfilled' && Array.isArray(results[1].value)) {
        setTables(results[1].value);
      }

      // Handle low stock
      if (results[2].status === 'fulfilled' && Array.isArray(results[2].value)) {
        setLowStockItems(results[2].value);
      }

      // Handle active orders — filter out paid/cancelled client-side
      if (results[3].status === 'fulfilled' && Array.isArray(results[3].value)) {
        const active = results[3].value.filter(
          o => !['paid', 'cancelled'].includes((o.status || '').toLowerCase())
        );
        setActiveOrders(active);
      }

      // Handle staff status
      if (results[4].status === 'fulfilled' && Array.isArray(results[4].value)) {
        setStaffStatus(results[4].value);
      }

      // Handle best sellers
      if (results[5].status === 'fulfilled' && Array.isArray(results[5].value)) {
        setBestSellers(results[5].value);
      }

      // Handle payroll
      if (results[6].status === 'fulfilled' && results[6].value) {
        setPayrollData(results[6].value);
      }

      // Handle payments
      if (results[7].status === 'fulfilled' && Array.isArray(results[7].value)) {
        setPaymentsData(results[7].value);
      }

      // Handle loans
      if (results[8].status === 'fulfilled' && results[8].value) {
        setLoansData(results[8].value);
      }

      // Handle notifications
      if (results[9].status === 'fulfilled' && Array.isArray(results[9].value)) {
        setNotifications(results[9].value);
        const unread = results[9].value.filter((n) => !n.isRead).length;
        setUnreadCount(unread);
      }

      // Handle cash flow
      if (results[10].status === 'fulfilled' && results[10].value) {
        const entries = results[10].value.entries || results[10].value || [];
        const arr = Array.isArray(entries) ? entries : [];
        const inflow = arr.filter(e => e.type === 'in').reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
        const outflow = arr.filter(e => e.type === 'out').reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
        setCashFlowData({ inflow, outflow, entries: arr });
      }

      // Handle all warehouse items
      if (results[11].status === 'fulfilled' && Array.isArray(results[11].value)) {
        setAllWarehouseItems(results[11].value);
      }

      // Handle warehouse movements
      if (results[12].status === 'fulfilled' && Array.isArray(results[12].value)) {
        setWarehouseMovements(results[12].value);
      }

      setCurrentDate(new Date());
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Auto-refresh every 15 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setRefreshing(true);
      fetchDashboardData();
    }, 15000);

    return () => clearInterval(interval);
  }, [fetchDashboardData]);

  // Format date
  const formatDate = (date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  // Format elapsed time
  const formatElapsedTime = (startTime) => {
    if (!startTime) return t('common.noData');
    const elapsed = Math.floor((new Date() - new Date(startTime)) / 60000);
    if (elapsed < 1) return t('time.justNow');
    if (elapsed < 60) return t('time.minAgo', { count: elapsed });
    const hours = Math.floor(elapsed / 60);
    return t('time.hoursAgo', { h: hours, m: elapsed % 60 });
  };

  // Get role badge color
  const getRoleBadgeColor = (role) => {
    switch (role?.toLowerCase()) {
      case 'waitress':
        return 'bg-green-100 text-green-800';
      case 'kitchen':
        return 'bg-orange-100 text-orange-800';
      case 'cashier':
        return 'bg-cyan-100 text-cyan-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Get table status color
  const getTableStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'free':
      case 'available':
        return 'bg-green-500 hover:bg-green-600';
      case 'occupied':
        return 'bg-red-500 hover:bg-red-600';
      case 'reserved':
        return 'bg-blue-500 hover:bg-blue-600';
      case 'cleaning':
        return 'bg-gray-500 hover:bg-gray-600';
      default:
        return 'bg-gray-400 hover:bg-gray-500';
    }
  };

  // Calculate table occupancy
  const tableStats = {
    free: tables.filter((t) => t.status?.toLowerCase() === 'free' || t.status?.toLowerCase() === 'available').length,
    occupied: tables.filter((t) => t.status?.toLowerCase() === 'occupied').length,
    reserved: tables.filter((t) => t.status?.toLowerCase() === 'reserved').length,
    cleaning: tables.filter((t) => t.status?.toLowerCase() === 'cleaning').length,
  };

  // Financial Flow — use admin-daily-summary data (same source as the app)
  // financialFlow.inflow is an array of {paymentMethod, amount} rows (today's paid orders by method)
  const todayInflow = (() => {
    const rows = dashboardData?.financialFlow?.inflow;
    if (Array.isArray(rows) && rows.length > 0)
      return rows.reduce((s, r) => s + parseFloat(r.amount || 0), 0);
    // fallback: simpleDash todayRevenue (from /reports/dashboard)
    return simpleDash?.todayRevenue || 0;
  })();
  // Outflow = expenses + staff payments + delivery payments (from summary) + goods consumed (inventory cost)
  const todayOutflow = (dashboardData?.financialFlow?.outflow || 0);
  const outflowBreakdown = dashboardData?.financialFlow?.outflowBreakdown;
  const deliveryPaymentsToday = outflowBreakdown?.deliveryPayments || 0;
  const salariesToday = outflowBreakdown?.salaries || 0;
  const expensesOnly = outflowBreakdown?.expenses || 0;

  // Employee payroll — backend returns array of rows with grossPay (from gross_pay column)
  const monthGrossPay = Array.isArray(payrollData)
    ? payrollData.reduce((s, r) => s + parseFloat(r.grossPay || r.gross_pay || 0), 0)
    : (payrollData?.totalGross || payrollData?.totalOwed || 0);
  const totalPaymentsMade = Array.isArray(paymentsData)
    ? paymentsData.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0)
    : 0;
  const payrollOwed = Math.max(0, monthGrossPay - totalPaymentsMade);

  // Calculate debts & payables
  const calculateDebtsPayables = () => {
    return {
      employeePayrollOwed: payrollOwed,
      customerLoansOutstanding: loansData?.totalOutstanding || loansData?.activeTotal || 0,
      supplierDebt: supplierDebt,
    };
  };

  const debtsPayables = calculateDebtsPayables();

  // Active orders breakdown by type
  const orderBreakdown = {
    dineIn: activeOrders.filter(o => (o.orderType || o.type || '').toLowerCase().replace('-','_') === 'dine_in').length,
    toGo: activeOrders.filter(o => (o.orderType || o.type || '').toLowerCase().replace('-','_') === 'to_go').length,
    delivery: activeOrders.filter(o => (o.orderType || o.type || '').toLowerCase() === 'delivery').length,
  };

  // Warehouse today stats — prefer values from admin-daily-summary (correct DB queries)
  // Fallback to local calculation with corrected field names (quantityInStock after camelization)
  const warehouseTotalValue =
    dashboardData?.warehouse?.currentStatus?.totalValue ??
    allWarehouseItems.reduce((s, i) => {
      return s + (parseFloat(i.quantityInStock || i.quantity || 0) * parseFloat(i.costPerUnit || 0));
    }, 0);
  const warehouseGoodsArrived =
    dashboardData?.warehouse?.goodsArrived ??
    warehouseMovements
      .filter(m => ['in', 'receive'].includes((m.movementType || m.type || '').toLowerCase()))
      .reduce((s, m) => s + (parseFloat(m.totalCost || 0) || parseFloat(m.quantity || 0) * parseFloat(m.costPerUnit || 0)), 0);
  const warehouseGoodsConsumed =
    dashboardData?.warehouse?.goodsConsumed ??
    warehouseMovements
      .filter(m => ['out', 'waste', 'consume'].includes((m.movementType || m.type || '').toLowerCase()))
      .reduce((s, m) => s + (parseFloat(m.totalCost || 0) || parseFloat(m.quantity || 0) * parseFloat(m.costPerUnit || 0)), 0);

  // Total outflow = cash expenses/staff payments + inventory goods consumed (matches app logic)
  const totalOutflow = todayOutflow + warehouseGoodsConsumed;

  // Mark notification as read
  const handleMarkNotificationRead = (id) => {
    notificationsAPI.markRead(id).catch((err) => console.error('Failed to mark notification read:', err));
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
    setUnreadCount(Math.max(0, unreadCount - 1));
  };

  // Mark all notifications as read
  const handleMarkAllRead = () => {
    notificationsAPI.markAllRead().catch((err) => console.error('Failed to mark all read:', err));
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setNotificationsRead(true);
    setUnreadCount(0);
  };

  // Loading skeleton
  const SkeletonCard = () => (
    <div className="bg-white rounded-lg shadow p-6 animate-pulse">
      <div className="h-4 bg-gray-200 rounded w-24 mb-2"></div>
      <div className="h-8 bg-gray-200 rounded w-32"></div>
    </div>
  );

  if (loading) {
    return (
      <div className="h-full overflow-auto bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <div className="h-8 bg-gray-200 rounded w-64 animate-pulse"></div>
          </div>
          <div className="grid grid-cols-6 gap-4 mb-8">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
          <div className="grid grid-cols-3 gap-8">
            <div className="col-span-2">
              <div className="bg-white rounded-lg shadow p-6 h-96 animate-pulse"></div>
            </div>
            <div>
              <div className="bg-white rounded-lg shadow p-6 h-96 animate-pulse"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-blue-600 rounded-lg p-2">
                <LayoutDashboard className="text-white" size={24} />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{t('admin.dashboard.title')}</h1>
                <p className="text-sm text-gray-500">{formatDate(currentDate)}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => {
                  setRefreshing(true);
                  fetchDashboardData();
                }}
                disabled={refreshing}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-all"
              >
                <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
                <span className="text-sm font-medium">{t('common.refresh')}</span>
              </button>

              {/* Notifications Bell */}
              <div className="relative">
                <button
                  onClick={() => setShowNotifications(!showNotifications)}
                  className="relative p-2 text-gray-600 hover:text-blue-600 transition-colors"
                >
                  <Bell size={20} />
                  {unreadCount > 0 && (
                    <span className="absolute top-0 right-0 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white transform translate-x-1/2 -translate-y-1/2 bg-red-600 rounded-full">
                      {unreadCount}
                    </span>
                  )}
                </button>

                {/* Notifications Panel */}
                {showNotifications && (
                  <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-xl z-50 border border-gray-200">
                    <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                      <h3 className="font-semibold text-gray-900">{t('admin.dashboard.notifications')}</h3>
                      <button
                        onClick={() => setShowNotifications(false)}
                        className="p-1 hover:bg-gray-100 rounded"
                      >
                        <X size={18} />
                      </button>
                    </div>
                    <div className="max-h-96 overflow-y-auto">
                      {Array.isArray(notifications) && notifications.length > 0 ? (
                        <>
                          {notifications.map((notif) => (
                            <div
                              key={notif.id}
                              className={`px-4 py-3 border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors ${
                                !notif.isRead ? 'bg-blue-50' : ''
                              }`}
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <p className="text-sm font-medium text-gray-900">{notif.title || t('common.notification', 'Notification')}</p>
                                  <p className="text-xs text-gray-600 mt-1">{notif.message || ''}</p>
                                  <p className="text-xs text-gray-400 mt-1">
                                    {formatElapsedTime(notif.createdAt)}
                                  </p>
                                </div>
                                {!notif.isRead && (
                                  <button
                                    onClick={() => handleMarkNotificationRead(notif.id)}
                                    className="ml-2 p-1 hover:bg-white rounded"
                                  >
                                    <CheckCircle size={16} className="text-green-600" />
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </>
                      ) : (
                        <div className="px-4 py-8 text-center">
                          <p className="text-sm text-gray-500">{t('admin.dashboard.noNotifications')}</p>
                        </div>
                      )}
                    </div>
                    {Array.isArray(notifications) && notifications.length > 0 && (
                      <div className="px-4 py-2 border-t border-gray-200 bg-gray-50">
                        <button
                          onClick={handleMarkAllRead}
                          className="text-xs font-medium text-blue-600 hover:text-blue-700"
                        >
                          {t('admin.dashboard.markAllRead')}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 py-8">

        {/* Row 1: Quick Actions — horizontal stretched */}
        <div className="bg-white rounded-lg shadow p-4 mb-8">
          <div className="grid grid-cols-6 gap-3">
            <button
              onClick={() => navigate('/admin/orders')}
              className="flex items-center justify-center gap-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg py-2.5 px-4 font-medium text-sm transition-colors w-full"
            >
              <ShoppingCart size={16} />
              {t('nav.orders')}
            </button>
            <button
              onClick={() => navigate('/admin/inventory')}
              className="flex items-center justify-center gap-2 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg py-2.5 px-4 font-medium text-sm transition-colors w-full"
            >
              <Package size={16} />
              {t('nav.inventory')}
            </button>
            <button
              onClick={() => navigate('/admin/staff')}
              className="flex items-center justify-center gap-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg py-2.5 px-4 font-medium text-sm transition-colors w-full"
            >
              <Users size={16} />
              {t('nav.staff')}
            </button>
            <button
              onClick={() => navigate('/admin/tables')}
              className="flex items-center justify-center gap-2 bg-orange-50 hover:bg-orange-100 text-orange-700 rounded-lg py-2.5 px-4 font-medium text-sm transition-colors w-full"
            >
              <Grid3X3 size={16} />
              {t('nav.tables')}
            </button>
            <button
              onClick={() => navigate('/admin/menu')}
              className="flex items-center justify-center gap-2 bg-green-50 hover:bg-green-100 text-green-700 rounded-lg py-2.5 px-4 font-medium text-sm transition-colors w-full"
            >
              <Utensils size={16} />
              {t('nav.menu')}
            </button>
            <button
              onClick={() => navigate('/admin/profile')}
              className="flex items-center justify-center gap-2 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg py-2.5 px-4 font-medium text-sm transition-colors w-full"
            >
              <User size={16} />
              {t('nav.profile')}
            </button>
          </div>
        </div>

        {/* Row 2: KPI Cards */}
        <div className="grid grid-cols-6 gap-4 mb-8">
          {/* Today's Revenue */}
          <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-gray-600">{t('admin.dashboard.todaysRevenue')}</span>
              <div className="bg-blue-100 rounded-lg p-2">
                <DollarSign size={20} className="text-blue-600" />
              </div>
            </div>
            <div className="text-2xl font-bold text-gray-900">{money(simpleDash?.todayRevenue || dashboardData?.salesOverview || 0)}</div>
            <p className="text-xs text-gray-500 mt-2">{t('admin.dashboard.totalSalesToday')}</p>
          </div>

          {/* Today's Orders */}
          <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-gray-600">{t('admin.dashboard.todaysOrders')}</span>
              <div className="bg-green-100 rounded-lg p-2">
                <ShoppingCart size={20} className="text-green-600" />
              </div>
            </div>
            <div className="text-2xl font-bold text-gray-900">{simpleDash?.todayOrders || dashboardData?.todayOrders || 0}</div>
            <p className="text-xs text-gray-500 mt-2">{t('admin.dashboard.ordersPlaced')}</p>
          </div>

          {/* Active Orders */}
          <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-gray-600">{t('admin.dashboard.activeOrders')}</span>
              <div className="bg-purple-100 rounded-lg p-2">
                <Clock size={20} className="text-purple-600" />
              </div>
            </div>
            <div className="text-2xl font-bold text-gray-900">{simpleDash?.activeOrders ?? dashboardData?.totalActiveOrders ?? activeOrders.length}</div>
            <p className="text-xs text-gray-500 mt-2">{t('admin.dashboard.beingPrepared')}</p>
          </div>

          {/* Table Occupancy */}
          <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-gray-600">{t('admin.dashboard.tableOccupancy')}</span>
              <div className="bg-orange-100 rounded-lg p-2">
                <Grid3X3 size={20} className="text-orange-600" />
              </div>
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {tableStats.occupied}/{tables.length || 0}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {tables.length > 0
                ? t('admin.dashboard.percentOccupied', { percent: Math.round((tableStats.occupied / tables.length) * 100) })
                : t('common.noData')}
            </p>
          </div>

          {/* Staff On Shift */}
          <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-gray-600">{t('admin.dashboard.staffOnShift')}</span>
              <div className="bg-indigo-100 rounded-lg p-2">
                <Users size={20} className="text-indigo-600" />
              </div>
            </div>
            <div className="text-2xl font-bold text-gray-900">{staffStatus.length || 0}</div>
            <p className="text-xs text-gray-500 mt-2">{t('admin.dashboard.teamMembers')}</p>
          </div>

          {/* Low Stock Alerts */}
          <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-gray-600">{t('admin.dashboard.lowStock')}</span>
              <div className="bg-red-100 rounded-lg p-2">
                <AlertTriangle size={20} className="text-red-600" />
              </div>
            </div>
            <div className="text-2xl font-bold text-gray-900">{lowStockItems.length || 0}</div>
            <p className="text-xs text-gray-500 mt-2">{t('admin.dashboard.itemsBelowThreshold')}</p>
          </div>
        </div>

        {/* Table Status Grid */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('admin.dashboard.tableStatus')}</h2>
          <div className="mb-4 flex gap-6 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-green-500 rounded"></div>
              <span className="text-gray-600">{t('statuses.free')}: {tableStats.free}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-red-500 rounded"></div>
              <span className="text-gray-600">{t('statuses.occupied')}: {tableStats.occupied}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-blue-500 rounded"></div>
              <span className="text-gray-600">{t('statuses.reserved')}: {tableStats.reserved}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-gray-500 rounded"></div>
              <span className="text-gray-600">{t('statuses.cleaning')}: {tableStats.cleaning}</span>
            </div>
          </div>
          <div className="grid grid-cols-12 gap-2">
            {Array.isArray(tables) && tables.length > 0 ? (
              tables.map((table) => (
                <button
                  key={table.id}
                  className={`p-3 rounded-lg text-white font-semibold text-sm transition-all ${getTableStatusColor(
                    table.status
                  )}`}
                >
                  {table.tableNumber || table.number || 'T'}
                </button>
              ))
            ) : (
              <p className="text-gray-500">{t('admin.dashboard.noTablesAvailable')}</p>
            )}
          </div>
        </div>

        {/* Row 4: Active Orders Breakdown + Financial Flow + Debts & Payables (3 equal cols) */}
        <div className="grid grid-cols-3 gap-8 mb-8">
          {/* Active Orders Breakdown */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingCart size={20} className="text-blue-600" />
                <h2 className="text-lg font-semibold text-gray-900">{t('admin.dashboard.activeOrdersBreakdown')}</h2>
              </div>
              <span className="text-sm text-gray-500">{activeOrders.length} {t('common.total').toLowerCase()}</span>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-100 rounded-lg p-2"><Utensils size={18} className="text-blue-600" /></div>
                  <span className="text-sm font-medium text-gray-700">{t('orderTypes.dineIn')}</span>
                </div>
                <span className="text-2xl font-bold text-blue-600">{orderBreakdown.dineIn}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="bg-orange-100 rounded-lg p-2"><ShoppingBag size={18} className="text-orange-600" /></div>
                  <span className="text-sm font-medium text-gray-700">{t('orderTypes.toGo')}</span>
                </div>
                <span className="text-2xl font-bold text-orange-600">{orderBreakdown.toGo}</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <div className="flex items-center gap-3">
                  <div className="bg-green-100 rounded-lg p-2"><Truck size={18} className="text-green-600" /></div>
                  <span className="text-sm font-medium text-gray-700">{t('orderTypes.delivery')}</span>
                </div>
                <span className="text-2xl font-bold text-green-600">{orderBreakdown.delivery}</span>
              </div>
            </div>
          </div>

          {/* Financial Flow Today */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <DollarSign size={20} className="text-blue-600" />
                <h2 className="text-lg font-semibold text-gray-900">{t('admin.dashboard.financialFlowToday')}</h2>
              </div>
              <span className={`text-sm font-semibold ${todayInflow - totalOutflow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {todayInflow - totalOutflow >= 0 ? '+' : ''}{money(todayInflow - totalOutflow)} {t('common.net').toLowerCase()}
              </span>
            </div>
            <div className="p-6 space-y-4">
              <div className="border-l-4 border-green-500 pl-4 py-2">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp size={16} className="text-green-600" />
                  <span className="text-sm text-gray-600">{t('admin.dashboard.cashInflow')}</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">{money(todayInflow)}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {todayInflow === 0 ? t('admin.dashboard.noPaymentsYet') : `${(dashboardData?.financialFlow?.inflow || []).length} ${t('admin.dashboard.paymentMethods')}`}
                </p>
              </div>
              <div className="border-l-4 border-red-500 pl-4 py-2">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingDown size={16} className="text-red-600" />
                  <span className="text-sm text-gray-600">{t('admin.dashboard.outflow')}</span>
                </div>
                <p className="text-2xl font-bold text-red-600">{money(totalOutflow)}</p>
                {totalOutflow === 0 ? (
                  <p className="text-xs text-gray-400 mt-1">{t('admin.dashboard.noOutflowYet')}</p>
                ) : (
                  <div className="text-xs text-gray-500 mt-1 space-y-0.5">
                    {expensesOnly > 0 && <div className="flex justify-between"><span>{t('admin.dashboard.expenses')}</span><span className="text-red-600 font-medium">{money(expensesOnly)}</span></div>}
                    {salariesToday > 0 && <div className="flex justify-between"><span>{t('admin.dashboard.salaries')}</span><span className="text-red-600 font-medium">{money(salariesToday)}</span></div>}
                    {deliveryPaymentsToday > 0 && <div className="flex justify-between"><span>{t('admin.dashboard.supplierPayments')}</span><span className="text-red-600 font-medium">{money(deliveryPaymentsToday)}</span></div>}
                    {warehouseGoodsConsumed > 0 && <div className="flex justify-between"><span>{t('admin.dashboard.inventory')}</span><span className="text-red-600 font-medium">{money(warehouseGoodsConsumed)}</span></div>}
                  </div>
                )}
              </div>
              <div className="border-t border-gray-200 pt-3 flex items-center justify-between">
                <span className="text-sm text-gray-600 font-medium">{t('common.net')}</span>
                <span className={`text-lg font-bold ${todayInflow - totalOutflow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {todayInflow - totalOutflow >= 0 ? '+' : ''}{money(todayInflow - totalOutflow)}
                </span>
              </div>
            </div>
          </div>

          {/* Debts & Payables */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Briefcase size={20} className="text-blue-600" />
                <h2 className="text-lg font-semibold text-gray-900">{t('admin.dashboard.debtsPayables')}</h2>
              </div>
              <span className="text-sm text-gray-500">{t('admin.dashboard.thisMonth')}</span>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 font-medium">{t('admin.dashboard.employeePayrollOwed')}</p>
                  <p className="text-xs text-gray-400">{t('admin.dashboard.earned')} {money(monthGrossPay)} · {t('admin.dashboard.paidAmount')} {money(totalPaymentsMade)}</p>
                </div>
                <p className="text-xl font-bold text-red-500">{money(debtsPayables.employeePayrollOwed)}</p>
              </div>
              <div className="border-t border-gray-200 pt-3 flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 font-medium">{t('admin.dashboard.supplierDebt')}</p>
                  <p className="text-xs text-gray-400">{t('admin.dashboard.unpaidDeliveredGoods')}</p>
                </div>
                <p className="text-xl font-bold text-red-500">{money(debtsPayables.supplierDebt)}</p>
              </div>
              <div className="border-t border-gray-200 pt-3 flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 font-medium">{t('admin.dashboard.customerOutstandingLoans')}</p>
                  <p className="text-xs text-gray-400">{loansData?.activeCount || 0} {t('admin.dashboard.activeLoans')}</p>
                </div>
                <p className={`text-xl font-bold ${debtsPayables.customerLoansOutstanding > 0 ? 'text-orange-500' : 'text-gray-400'}`}>
                  {debtsPayables.customerLoansOutstanding > 0 ? money(debtsPayables.customerLoansOutstanding) : t('admin.dashboard.noneLabel')}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Row 5: Low Stock Alerts + Warehouse Today */}
        <div className="grid grid-cols-3 gap-8 mb-8 items-start">
          {/* Low Stock Alerts */}
          <div className="col-span-2 h-full">
            <div className="bg-white rounded-lg shadow overflow-hidden h-full flex flex-col">
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={20} className="text-red-600" />
                  <h2 className="text-lg font-semibold text-gray-900">{t('admin.dashboard.lowStockAlerts')}</h2>
                </div>
                <button
                  onClick={() => setExpandedLowStock(!expandedLowStock)}
                  className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                >
                  {expandedLowStock ? t('admin.dashboard.collapse') : t('admin.dashboard.expand')}
                </button>
              </div>
              <div className="p-6 flex-1">
                {Array.isArray(lowStockItems) && lowStockItems.length > 0 ? (
                  <div className="space-y-3">
                    {(expandedLowStock ? lowStockItems : lowStockItems.slice(0, 5)).map((item) => (
                      <div key={item.id} className="bg-red-50 border border-red-200 rounded-lg p-4">
                        <div className="flex items-start gap-3">
                          <div className="bg-red-100 rounded-lg p-1.5 flex-shrink-0">
                            <Package size={16} className="text-red-600" />
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-900">{item.name || t('common.unknownItem', 'Unknown Item')}</p>
                            <div className="flex items-center justify-between mt-2">
                              <span className="text-xs text-red-600 font-semibold">{item.quantityInStock ?? item.quantity ?? 0} {t('admin.dashboard.left')}</span>
                              <span className="text-xs text-red-500">{t('admin.dashboard.min')}: {item.minStockLevel ?? item.minThreshold ?? t('common.noData')}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    {!expandedLowStock && lowStockItems.length > 5 && (
                      <p className="text-xs text-gray-500 text-center">{t('admin.dashboard.moreItems', { count: lowStockItems.length - 5 })}</p>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full">
                    <Package size={32} className="text-gray-300 mb-2" />
                    <p className="text-sm text-gray-500">{t('admin.dashboard.allItemsWellStocked')}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Warehouse Today */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Archive size={20} className="text-blue-600" />
                <h2 className="text-lg font-semibold text-gray-900">{t('admin.dashboard.warehouseToday')}</h2>
              </div>
              <span className="text-sm text-gray-500">{allWarehouseItems.length || 0} {t('admin.dashboard.itemsInStock')}</span>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-green-50 rounded-lg p-4 text-center">
                  <Archive size={24} className="text-green-600 mx-auto mb-2" />
                  <p className="text-xl font-bold text-green-600">{money(warehouseGoodsArrived)}</p>
                  <p className="text-xs text-gray-500 mt-1">{t('admin.dashboard.goodsArrived')}</p>
                </div>
                <div className="bg-orange-50 rounded-lg p-4 text-center">
                  <Flame size={24} className="text-orange-500 mx-auto mb-2" />
                  <p className="text-xl font-bold text-orange-500">{money(warehouseGoodsConsumed)}</p>
                  <p className="text-xs text-gray-500 mt-1">{t('admin.dashboard.goodsConsumed')}</p>
                </div>
              </div>
              <div className="border-t border-gray-200 pt-3 flex items-center justify-between">
                <span className="text-sm text-gray-500">{t('admin.dashboard.totalStockValue')}</span>
                <span className="text-sm font-bold text-gray-900">{money(warehouseTotalValue)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Row 6: Staff On Shift + Top Sellers */}
        <div className="grid grid-cols-3 gap-8 mb-8">
          {/* Staff On Shift */}
          <div className="col-span-2">
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-2">
                <Users size={20} className="text-blue-600" />
                <h2 className="text-lg font-semibold text-gray-900">{t('admin.dashboard.staffOnShiftSection')}</h2>
              </div>
              <div className="p-6">
                {Array.isArray(staffStatus) && staffStatus.length > 0 ? (
                  <div className="space-y-3">
                    {staffStatus.map((staff) => (
                      <div key={staff.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                              <User size={20} className="text-gray-600" />
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">{staff.name || t('common.noData')}</p>
                              <p className="text-xs text-gray-600">{staff.role || t('common.na', 'N/A')}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${getRoleBadgeColor(staff.role)} mb-1`}>
                              {staff.role || t('roles.staff', 'Staff')}
                            </span>
                            <p className="text-sm font-semibold text-gray-900">{staff.hoursWorkedToday || 0}h {t('admin.dashboard.hWorked')}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Users size={40} className="text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500">{t('admin.dashboard.noStaffOnShift')}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Top Sellers */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-2">
              <TrendingUp size={20} className="text-blue-600" />
              <h2 className="text-lg font-semibold text-gray-900">{t('admin.dashboard.topSellers')}</h2>
            </div>
            <div className="p-6">
              {Array.isArray(bestSellers) && bestSellers.length > 0 ? (
                <div className="space-y-4">
                  {bestSellers.slice(0, 5).map((item, index) => {
                    const maxSales = Math.max(...bestSellers.map((i) => i.totalSold || i.quantity || i.sales || 0));
                    const quantity = item.totalSold || item.quantity || item.sales || 0;
                    const percentage = maxSales > 0 ? (quantity / maxSales) * 100 : 0;
                    return (
                      <div key={item.id || index}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-gray-900">{item.name || t('common.unknown', 'Unknown')}</span>
                          <span className="text-sm font-semibold text-blue-600">{quantity} {t('admin.dashboard.sold')}</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div className="bg-blue-600 h-2 rounded-full transition-all duration-300" style={{ width: `${percentage}%` }}></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8">
                  <TrendingUp size={32} className="text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-500">{t('admin.dashboard.noSalesData')}</p>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

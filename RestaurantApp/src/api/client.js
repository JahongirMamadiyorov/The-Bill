import axios from 'axios';
import { Platform, NativeModules } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Backend URL resolution ──────────────────────────────────────────────────
// The app and the website both talk to the SAME hosted backend so sections,
// tables, orders, etc. stay in sync across every client via the shared
// Supabase DB. This also avoids any JWT_SECRET / schema drift between
// environments.
//
// To develop against a local Express server instead of production, set
// USE_LOCAL_BACKEND = true below and start the backend with `npm run dev`.
// Then the base URL becomes:
//   iOS simulator      → http://localhost:3000/api
//   Android emulator   → http://10.0.2.2:3000/api  (host machine alias)
//   Real device        → http://<Metro host>:3000/api
const PROD_API_URL      = 'https://the-bill-backend.onrender.com/api';
const USE_LOCAL_BACKEND = false;

function resolveLocalApiUrl() {
  let host = 'localhost';
  try {
    const scriptURL = NativeModules?.SourceCode?.scriptURL || '';
    const m = scriptURL.match(/https?:\/\/([^/:]+)/);
    if (m && m[1] && m[1] !== 'localhost') host = m[1];
  } catch (_) { /* fall through */ }
  if (Platform.OS === 'android' && (host === 'localhost' || host === '127.0.0.1')) {
    host = '10.0.2.2';
  }
  return `http://${host}:3000/api`;
}

const API_BASE_URL = (__DEV__ && USE_LOCAL_BACKEND) ? resolveLocalApiUrl() : PROD_API_URL;

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token to every request
api.interceptors.request.use(async (config) => {
  try {
    const token = await AsyncStorage.getItem('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  } catch (_) { }
  return config;
});

// ─── Auth ───────────────────────────────────────────────────────────
export const authAPI = {
  // `identifier` can be an email address, phone number, or username
  login: (identifier, password) => api.post('/auth/login', { identifier, password }),
  register: (data) => api.post('/auth/register', data),
};

// ─── Users / Staff ──────────────────────────────────────────────────
export const usersAPI = {
  getAll:            () => api.get('/users'),
  getMe:             () => api.get('/users/me'),
  create:            (data) => api.post('/users', data),
  update:            (id, data) => api.put(`/users/${id}`, data),
  updateCredentials: (id, data) => api.put(`/users/${id}/credentials`, data),
  delete:            (id) => api.delete(`/users/${id}`),
};

// ─── Permissions ────────────────────────────────────────────────────
export const permissionsAPI = {
  get: (userId) => api.get(`/permissions/${userId}`),
  update: (userId, data) => api.put(`/permissions/${userId}`, data),
};

// ─── Tables ─────────────────────────────────────────────────────────
export const tablesAPI = {
  getAll: () => api.get('/tables'),
  create: (data) => api.post('/tables', data),
  update: (id, data) => api.put(`/tables/${id}`, data),
  delete: (id) => api.delete(`/tables/${id}`),
  open: (id, data) => api.put(`/tables/${id}/open`, data || {}),
  close: (id) => api.put(`/tables/${id}/close`),
  transfer: (id, data) => api.put(`/tables/${id}/transfer`, data),
  getSections: () => api.get('/tables/sections'),
  addSection: (name) => api.post('/tables/sections', { name }),
  deleteSection: (name) => api.delete(`/tables/sections/${encodeURIComponent(name)}`),
};

// ─── Menu ───────────────────────────────────────────────────────────
export const menuAPI = {
  getCategories: () => api.get('/menu/categories'),
  createCategory: (data) => api.post('/menu/categories', data),
  updateCategory: (id, data) => api.put(`/menu/categories/${id}`, data),
  deleteCategory: (id) => api.delete(`/menu/categories/${id}`),
  getItems: () => api.get('/menu/items'),
  createItem: (data) => api.post('/menu/items', data),
  updateItem: (id, data) => api.put(`/menu/items/${id}`, data),
  deleteItem: (id) => api.delete(`/menu/items/${id}`),
  // Ingredient links
  getItemIngredients: (itemId) => api.get(`/menu/items/${itemId}/warehouse_items`),
  addItemIngredient: (itemId, data) => api.post(`/menu/items/${itemId}/warehouse_items`, data),
  removeItemIngredient: (itemId, ingId) => api.delete(`/menu/items/${itemId}/warehouse_items/${ingId}`),
  // Image upload — sends multipart/form-data, returns { url }
  uploadImage: (fileUri, fileName, fileType) => {
    const formData = new FormData();
    formData.append('image', { uri: fileUri, name: fileName || 'image.jpg', type: fileType || 'image/jpeg' });
    return api.post('/menu/upload-image', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 30000,
    });
  },
  // Custom stations — shared between app and website via backend DB
  getStations:   ()     => api.get('/menu/stations'),
  addStation:    (name) => api.post('/menu/stations', { name }),
  deleteStation: (name) => api.delete(`/menu/stations/${encodeURIComponent(name)}`),
};

// ─── Orders ─────────────────────────────────────────────────────────
export const ordersAPI = {
  getAll:           (params)       => api.get('/orders', { params }),
  getMyOrders:      ()             => api.get('/orders/mine'),
  getByTable:       (tableId, includeItems = false) => api.get('/orders', { params: { table_id: tableId, ...(includeItems ? { include_items: 'true' } : {}) } }),
  getById:          (id)           => api.get(`/orders/${id}`),
  create:           (data)         => api.post('/orders', data),
  update:           (id, data)     => api.put(`/orders/${id}`, data),
  updateStatus:     (id, status)   => api.put(`/orders/${id}/status`, { status }),
  pay:              (id, data)     => api.put(`/orders/${id}/pay`, data),
  markLoanPaid:     (id)           => api.put(`/orders/${id}/loan/pay`),
  cancel:           (id, reason)   => api.put(`/orders/${id}/status`, { status: 'cancelled', cancellation_reason: reason }),
  delete:           (id, data)     => api.delete(`/orders/${id}`, { data }),
  // Waitress-specific
  addItems:         (id, items)    => api.post(`/orders/${id}/items`, { items }),
  markItemServed:   (id, itemId)   => api.put(`/orders/${id}/items/${itemId}/serve`, {}),
  requestBill:      (id)           => api.put(`/orders/${id}/status`, { status: 'bill_requested' }),
};

// ─── Suppliers ──────────────────────────────────────────────────────────
export const suppliersAPI = {
  getAll: () => api.get('/suppliers'),
  create: (data) => api.post('/suppliers', data),
  update: (id, data) => api.put(`/suppliers/${id}`, data),
  delete: (id) => api.delete(`/suppliers/${id}`),
};

// ─── Inventory (Legacy) ────────────────────────────────────────────────
export const inventoryAPI = {
  getAll: () => api.get('/inventory'),
  getLowStock: () => api.get('/inventory/low-stock'),
  create: (data) => api.post('/inventory', data),
  update: (id, data) => api.put(`/inventory/${id}`, data),
  delete: (id) => api.delete(`/inventory/${id}`),
  recordWaste: (id, data) => api.post(`/inventory/${id}/waste`, data),
};

// ─── Warehouse ──────────────────────────────────────────────────────
export const warehouseAPI = {
  getAll: () => api.get('/warehouse'),
  getLowStock: () => api.get('/warehouse/low-stock'),
  create: (data) => api.post('/warehouse', data),
  update: (id, data) => api.put(`/warehouse/${id}`, data),
  delete: (id) => api.delete(`/warehouse/${id}`),
  receive: (data) => api.post('/warehouse/receive', data),
  consume: (data) => api.post('/warehouse/consume', data),
  adjust: (id, data) => api.post(`/warehouse/${id}/adjust`, data),
  audit: (data) => api.post('/warehouse/audit', data),
  getMovements: (params) => api.get('/warehouse/movements', { params }),
  checkExpiryAlerts: () => api.get('/warehouse/expiry-alerts'),
  getBatches: (itemId) => api.get(`/warehouse/batches/${itemId}`),
};

// ─── Procurement ────────────────────────────────────────────────────
export const procurementAPI = {
  getSuggestedOrders: () => api.get('/procurement/suggested-order'),
  // Supplier deliveries
  getDeliveries: () => api.get('/procurement/deliveries'),
  getDelivery: (id) => api.get(`/procurement/deliveries/${id}`),
  getDeliveriesDebt: () => api.get('/procurement/deliveries/debt'),
  createDelivery: (data) => api.post('/procurement/deliveries', data),
  bulkSyncDeliveries: (arr) => api.post('/procurement/deliveries/bulk-sync', arr),
  updateDeliveryStatus: (id, status) => api.patch(`/procurement/deliveries/${id}/status`, { status }),
  payDelivery: (id, data) => api.patch(`/procurement/deliveries/${id}/pay`, data || {}),
  deleteDelivery: (id) => api.delete(`/procurement/deliveries/${id}`),
  // Delivery line items
  removeDeliveryItem: (itemId, remove_reason) => api.patch(`/procurement/delivery-items/${itemId}/remove`, { remove_reason }),
  updateDeliveryItemQty: (itemId, qty) => api.patch(`/procurement/delivery-items/${itemId}/update-qty`, { qty }),
};

// ─── Accounting ─────────────────────────────────────────────────────
export const accountingAPI = {
  getPnl: (params) => api.get('/accounting/pnl', { params }),
  getSales: (params) => api.get('/accounting/sales', { params }),
  getSalesDailyTrend: (params) => api.get('/accounting/sales/daily-trend', { params }),
  getSalesHourly: (params) => api.get('/accounting/sales/hourly', { params }),
  getSalesByType: (params) => api.get('/accounting/sales/by-type', { params }),
  getSalesComparison: (params) => api.get('/accounting/sales/comparison', { params }),
  getCashFlow: (params) => api.get('/accounting/cash-flow', { params }),
  getExpenses: (params) => api.get('/accounting/expenses', { params }),
  addExpense: (data) => api.post('/accounting/expenses', data),
  getTaxSettings: () => api.get('/accounting/tax-settings'),
  updateTaxSettings: (data) => api.put('/accounting/tax-settings', data),
  getRestaurantSettings: () => api.get('/accounting/restaurant-settings'),
  updateRestaurantSettings: (data) => api.put('/accounting/restaurant-settings', data),
};

// ─── Reports ────────────────────────────────────────────────────────
export const reportsAPI = {
  getDashboard:           ()       => api.get('/reports/dashboard'),
  getBestSellers:         (params) => api.get('/reports/best-sellers',          { params }),
  getWaitressPerformance: (params) => api.get('/reports/waitress-performance',  { params }),
  getAdminDailySummary:   ()       => api.get('/reports/admin-daily-summary'),
  getCashierStats:        (params) => api.get('/reports/cashier-stats',         { params }),
  getKitchenStats:        (params) => api.get('/reports/kitchen-stats',         { params }),
};

// ─── Notifications ───────────────────────────────────────────────────
export const notificationsAPI = {
  getAll: () => api.get('/notifications'),
  markRead: (id) => api.put(`/notifications/${id}/read`),
  markAllRead: () => api.put('/notifications/read-all'),
  deleteOld: () => api.delete('/notifications/old'),
};

// ─── Loans ───────────────────────────────────────────────────────────
export const loansAPI = {
  getAll:        (params) => api.get('/loans', { params }),
  getStats:      ()       => api.get('/loans/stats'),
  markPaid:      (id, data) => api.patch(`/loans/${id}/pay`, data || {}),
  notifyOverdue: ()       => api.post('/loans/notify-overdue'),
};

// ─── Shifts ──────────────────────────────────────────────────────────
export const shiftsAPI = {
  clockIn: (data) => api.post('/shifts/clock-in', data),
  clockOut: () => api.post('/shifts/clock-out'),
  adminClockOut: (user_id) => api.post('/shifts/clock-out', { user_id }),
  getActive: () => api.get('/shifts/active'),
  getMyShifts: () => api.get('/shifts/mine'),
  getAll: (params) => api.get('/shifts', { params }),
  getPayroll: (params) => api.get('/shifts/payroll', { params }),
  getStaffStatus: () => api.get('/shifts/admin/staff-status'),
  // Admin attendance edit
  updateShift: (id, data) => api.put(`/shifts/${id}`, data),
  createManualShift: (data) => api.post('/shifts/manual', data),
};

// ─── Finance ──────────────────────────────────────────────────────────
export const financeAPI = {
  getSummary:        (params) => api.get('/finance/summary', { params }),
  getExpenses:       (params) => api.get('/finance/expenses', { params }),
  createExpense:     (data)   => api.post('/finance/expenses', data),
  updateExpense:     (id, data) => api.put(`/finance/expenses/${id}`, data),
  deleteExpense:     (id)     => api.delete(`/finance/expenses/${id}`),
  getLoans:          ()       => api.get('/finance/loans'),
  createLoan:        (data)   => api.post('/finance/loans', data),
  updateLoan:        (id, data) => api.put(`/finance/loans/${id}`, data),
  deleteLoan:        (id)     => api.delete(`/finance/loans/${id}`),
  recordLoanPayment: (id, data) => api.post(`/finance/loans/${id}/payment`, data),
  getBudgets:        ()       => api.get('/finance/budgets'),
  upsertBudgets:     (data)   => api.post('/finance/budgets', data),
  createManualIncome:(data)   => api.post('/finance/manual-income', data),
  getTaxHistory:     ()       => api.get('/finance/tax-history'),
};

// ─── Staff Payments ───────────────────────────────────────────────────
export const staffPaymentsAPI = {
  getAll:    (params) => api.get('/staff-payments', { params }),
  getMine:   (params) => api.get('/staff-payments/mine', { params }),
  getLatest: ()       => api.get('/staff-payments/latest'),
  create:    (data)   => api.post('/staff-payments', data),
  update:    (id, data) => api.put(`/staff-payments/${id}`, data),
  delete:    (id)     => api.delete(`/staff-payments/${id}`),
};

export default api;

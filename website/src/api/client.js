import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({ baseURL: API_URL, timeout: 15000, headers: { 'Content-Type': 'application/json' } });

// Convert snake_case keys to camelCase recursively
const toCamel = (s) => s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());

function camelizeKeys(obj) {
  if (Array.isArray(obj)) return obj.map(camelizeKeys);
  if (obj !== null && typeof obj === 'object' && !(obj instanceof Date)) {
    return Object.keys(obj).reduce((acc, key) => {
      acc[toCamel(key)] = camelizeKeys(obj[key]);
      return acc;
    }, {});
  }
  return obj;
}

// Convert camelCase keys to snake_case for outgoing requests
const toSnake = (s) => s.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());

function snakeizeKeys(obj) {
  if (Array.isArray(obj)) return obj.map(snakeizeKeys);
  if (obj !== null && typeof obj === 'object' && !(obj instanceof Date)) {
    return Object.keys(obj).reduce((acc, key) => {
      acc[toSnake(key)] = snakeizeKeys(obj[key]);
      return acc;
    }, {});
  }
  return obj;
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (config.data instanceof FormData) {
    // Let axios set Content-Type automatically with the correct multipart boundary.
    // The global 'application/json' default header must be removed or multer can't parse the file.
    delete config.headers['Content-Type'];
    delete config.headers.common?.['Content-Type'];
  } else if (config.data && typeof config.data === 'object') {
    config.data = snakeizeKeys(config.data);
  }
  return config;
});

api.interceptors.response.use(
  r => camelizeKeys(r.data),
  error => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('restaurant');
      window.location.href = '/login';
    }
    return Promise.reject(error.response?.data || error);
  }
);

// All API modules:
export const authAPI = {
  login: (identifier, password) => api.post('/auth/login', { identifier, password }),
  register: (data) => api.post('/auth/register', data),
};

export const usersAPI = {
  getAll: () => api.get('/users'),
  getMe: () => api.get('/users/me'),
  create: (data) => api.post('/users', data),
  update: (id, data) => api.put(`/users/${id}`, data),
  updateCredentials: (id, data) => api.put(`/users/${id}/credentials`, data),
  delete: (id) => api.delete(`/users/${id}`),
};

export const permissionsAPI = {
  get: (userId) => api.get(`/permissions/${userId}`),
  update: (userId, data) => api.put(`/permissions/${userId}`, data),
};

export const printAPI = {
  // Send receipt directly to a network thermal printer via TCP/ESC-POS
  receipt: (printerIp, printerPort, receipt) =>
    api.post('/print/receipt', { printerIp, printerPort: printerPort || 9100, receipt }),
};

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
  renameSection: (oldName, newName) =>
    api.patch(`/tables/sections/${encodeURIComponent(oldName)}`, { newName }),
};

export const menuAPI = {
  getCategories: () => api.get('/menu/categories'),
  createCategory: (data) => api.post('/menu/categories', data),
  updateCategory: (id, data) => api.put(`/menu/categories/${id}`, data),
  deleteCategory: (id) => api.delete(`/menu/categories/${id}`),
  getItems: () => api.get('/menu/items'),
  createItem: (data) => api.post('/menu/items', data),
  updateItem: (id, data) => api.put(`/menu/items/${id}`, data),
  deleteItem: (id) => api.delete(`/menu/items/${id}`),
  getItemIngredients: (itemId) => api.get(`/menu/items/${itemId}/warehouse_items`),
  addItemIngredient: (itemId, data) => api.post(`/menu/items/${itemId}/warehouse_items`, data),
  removeItemIngredient: (itemId, ingId) => api.delete(`/menu/items/${itemId}/warehouse_items/${ingId}`),
  uploadImage: (file) => {
    const formData = new FormData();
    formData.append('image', file);
    // IMPORTANT: Do NOT set Content-Type manually — axios auto-sets it
    // with the required multipart boundary string.
    return api.post('/menu/upload-image', formData);
  },
  // Custom stations — shared between app and website via backend DB
  getStations:    ()     => api.get('/menu/stations'),
  addStation:     (name) => api.post('/menu/stations', { name }),
  deleteStation:  (name) => api.delete(`/menu/stations/${encodeURIComponent(name)}`),
};

export const ordersAPI = {
  getAll: (params) => api.get('/orders', { params }),
  getMyOrders: () => api.get('/orders/mine'),
  getKitchen: () => api.get('/orders/kitchen'),
  getKitchenStats: () => api.get('/orders/kitchen/stats'),
  getKitchenCompleted: (params) => api.get('/orders/kitchen/completed', { params }),
  getById: (id) => api.get(`/orders/${id}`),
  create: (data) => api.post('/orders', data),
  update: (id, data) => api.put(`/orders/${id}`, data),
  updateStatus: (id, status) => api.put(`/orders/${id}/status`, { status }),
  pay: (id, data) => api.put(`/orders/${id}/pay`, data),
  markLoanPaid: (id) => api.put(`/orders/${id}/loan/pay`),
  cancel: (id, reason) => api.put(`/orders/${id}/status`, { status: 'cancelled', cancellationReason: reason }),
  delete: (id) => api.delete(`/orders/${id}`),
  addItems: (id, items) => api.post(`/orders/${id}/items`, { items }),
  markItemReady: (id, itemId) => api.put(`/orders/${id}/items/${itemId}/ready`),
  markItemServed: (id, itemId) => api.put(`/orders/${id}/items/${itemId}/serve`),
};

export const suppliersAPI = {
  getAll: () => api.get('/suppliers'),
  create: (data) => api.post('/suppliers', data),
  update: (id, data) => api.put(`/suppliers/${id}`, data),
  delete: (id) => api.delete(`/suppliers/${id}`),
  getPurchaseOrders: () => api.get('/suppliers/purchase-orders'),
  createPurchaseOrder: (data) => api.post('/suppliers/purchase-orders', data),
  receivePurchaseOrder: (id) => api.put(`/suppliers/purchase-orders/${id}/receive`),
};

export const inventoryAPI = {
  getAll: () => api.get('/inventory'),
  getLowStock: () => api.get('/inventory/low-stock'),
  create: (data) => api.post('/inventory', data),
  update: (id, data) => api.put(`/inventory/${id}`, data),
  delete: (id) => api.delete(`/inventory/${id}`),
  recordWaste: (id, data) => api.post(`/inventory/${id}/waste`, data),
};

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

export const financeAPI = {
  getSummary: (params) => api.get('/finance/summary', { params }),
  getExpenses: (params) => api.get('/finance/expenses', { params }),
  createExpense: (data) => api.post('/finance/expenses', data),
  updateExpense: (id, data) => api.put(`/finance/expenses/${id}`, data),
  deleteExpense: (id) => api.delete(`/finance/expenses/${id}`),
  getLoans: () => api.get('/finance/loans'),
  createLoan: (data) => api.post('/finance/loans', data),
  updateLoan: (id, data) => api.put(`/finance/loans/${id}`, data),
  deleteLoan: (id) => api.delete(`/finance/loans/${id}`),
  recordLoanPayment: (id, data) => api.post(`/finance/loans/${id}/payment`, data),
  getBudgets: () => api.get('/finance/budgets'),
  upsertBudgets: (data) => api.post('/finance/budgets', data),
  createManualIncome: (data) => api.post('/finance/manual-income', data),
  getTaxHistory: () => api.get('/finance/tax-history'),
};

export const reportsAPI = {
  getDashboard: () => api.get('/reports/dashboard'),
  getBestSellers: (params) => api.get('/reports/best-sellers', { params }),
  getWaitressPerformance: (params) => api.get('/reports/waitress-performance', { params }),
  getAdminDailySummary: () => api.get('/reports/admin-daily-summary'),
  getCashierStats: (params) => api.get('/reports/cashier-stats', { params }),
  getKitchenStats: (params) => api.get('/reports/kitchen-stats', { params }),
};

export const notificationsAPI = {
  getAll: () => api.get('/notifications'),
  markRead: (id) => api.put(`/notifications/${id}/read`),
  markAllRead: () => api.put('/notifications/read-all'),
  deleteOld: () => api.delete('/notifications/old'),
};

export const loansAPI = {
  getAll: (params) => api.get('/loans', { params }),
  getStats: () => api.get('/loans/stats'),
  markPaid: (id, data) => api.patch(`/loans/${id}/pay`, data || {}),
  notifyOverdue: () => api.post('/loans/notify-overdue'),
};

export const shiftsAPI = {
  clockIn: (data) => api.post('/shifts/clock-in', data),
  clockOut: () => api.post('/shifts/clock-out'),
  adminClockOut: (user_id) => api.post('/shifts/clock-out', { user_id }),
  getActive: () => api.get('/shifts/active'),
  getMyShifts: () => api.get('/shifts/mine'),
  getAll: (params) => api.get('/shifts', { params }),
  getPayroll: (params) => api.get('/shifts/payroll', { params }),
  getStaffStatus: () => api.get('/shifts/admin/staff-status'),
  updateShift: (id, data) => api.put(`/shifts/${id}`, data),
  createManualShift: (data) => api.post('/shifts/manual', data),
};

export const staffPaymentsAPI = {
  getAll: (params) => api.get('/staff-payments', { params }),
  getMine: (params) => api.get('/staff-payments/mine', { params }),
  getLatest: () => api.get('/staff-payments/latest'),
  create: (data) => api.post('/staff-payments', data),
  update: (id, data) => api.put(`/staff-payments/${id}`, data),
  delete: (id) => api.delete(`/staff-payments/${id}`),
};

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
  removeDeliveryItem: (itemId, removeReason) => api.patch(`/procurement/delivery-items/${itemId}/remove`, { removeReason }),
  updateDeliveryItemQty: (itemId, qty) => api.patch(`/procurement/delivery-items/${itemId}/update-qty`, { qty }),
};

// ─── Super Admin ────────────────────────────────────────────
export const superAdminAPI = {
  // Stats
  getStats: () => api.get('/super-admin/stats'),
  // Restaurants
  getRestaurants: () => api.get('/super-admin/restaurants'),
  getRestaurant: (id) => api.get(`/super-admin/restaurants/${id}`),
  createRestaurant: (data) => api.post('/super-admin/restaurants', data),
  updateRestaurant: (id, data) => api.put(`/super-admin/restaurants/${id}`, data),
  deleteRestaurant: (id) => api.delete(`/super-admin/restaurants/${id}`),
  reactivateRestaurant: (id) => api.post(`/super-admin/restaurants/${id}/reactivate`),
  // Plans & Subscriptions
  getPlans: () => api.get('/super-admin/plans'),
  updatePlan: (restaurantId, data) => api.put(`/super-admin/restaurants/${restaurantId}/plan`, data),
  getPlanHistory: (restaurantId) => api.get(`/super-admin/restaurants/${restaurantId}/plan-history`),
  // Staff (owners & admins)
  getStaff: (restaurantId) => api.get(`/super-admin/restaurants/${restaurantId}/staff`),
  createStaff: (restaurantId, data) => api.post(`/super-admin/restaurants/${restaurantId}/staff`, data),
  updateStaff: (userId, data) => api.put(`/super-admin/staff/${userId}`, data),
  deleteStaff: (userId) => api.delete(`/super-admin/staff/${userId}`),
};

export default api;

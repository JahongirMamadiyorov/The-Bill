// ─────────────────────────────────────────────────────────────────────────────
// Admin panel's API client — mirrors website/src/api/client.js's public shape
// exactly (same ~20 API group objects, same method names/signatures, same
// snake_case<->camelCase auto-conversion) so pages ported from the website
// need zero changes to their data-fetching code, only to their imports.
//
// What's different underneath: the website talks to the backend directly
// over axios from the browser, using a token in localStorage. This Electron
// renderer instead routes every call through main.js's IPC
// (api:get / api:post / api:put / api:patch / api:delete) — main process
// owns the session token, same trust-boundary pattern as every other write
// in this app (see main.js's api:get/api:post comments for why).
//
// On success, each method resolves directly to the camelized response body —
// exactly like the website's axios interceptor did — so ported page code's
// `const rows = await tablesAPI.getAll()` keeps working unchanged. On
// failure, it throws an Error whose `.error` property holds the backend's
// message (matching the website's `Promise.reject(error.response?.data)`
// shape closely enough that existing `catch (err) { setError(err.error) }`
// code keeps working). A 401 additionally dispatches a
// `window` CustomEvent('admin:unauthorized') instead of the website's
// `window.location.href = '/login'` — there's no browser navigation to do
// here; AdminShell/App.jsx listens for this event and clears the session.
//
// printAPI is deliberately NOT ported — printing is explicitly out of scope
// for this phase of the Admin build (2026-07-27 instruction). Add it back
// for real once print support is actually being built.
//
// Known gap, not silently swallowed: menuAPI.uploadImage and
// settingsAPI.uploadLogo used multipart FormData uploads on the website.
// main.js's request() only speaks JSON today, so those two throw a clear
// "not yet supported" error instead of silently mangling the file — image
// upload needs its own dedicated IPC path (read file bytes in the renderer,
// forward them, let main.js do the multipart encoding) before it can work.
// ─────────────────────────────────────────────────────────────────────────────

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

const BASE = '/api';

function withQuery(path, params) {
  if (!params) return path;
  const usp = new URLSearchParams();
  Object.entries(snakeizeKeys(params)).forEach(([k, v]) => {
    if (v !== undefined && v !== null) usp.set(k, v);
  });
  const qs = usp.toString();
  return qs ? `${path}?${qs}` : path;
}

// Every IPC call resolves to { ok, data } or { ok:false, error, status } —
// never rejects on its own (see main.js) — so this is the one place that
// turns a failed response into a thrown Error, and the one place a 401
// triggers the unauthorized event, no matter which of the 20 API groups
// below the call came from.
async function unwrap(resPromise) {
  const res = await resPromise;
  if (!res?.ok) {
    if (res?.status === 401) {
      window.dispatchEvent(new CustomEvent('admin:unauthorized'));
    }
    const err = new Error(res?.error || 'Request failed');
    err.error = res?.error || 'Request failed';
    throw err;
  }
  return camelizeKeys(res.data);
}

function assertNotFormData(data, methodName) {
  if (typeof FormData !== 'undefined' && data instanceof FormData) {
    throw new Error(`${methodName}: file upload isn't wired up yet (main.js only speaks JSON) — printing/upload features are still pending.`);
  }
}

const api = {
  get: (path, config) =>
    unwrap(window.electronAPI.apiGet(withQuery(BASE + path, config?.params))),
  post: (path, data) => {
    assertNotFormData(data, 'post');
    return unwrap(window.electronAPI.apiPost(BASE + path, data != null ? snakeizeKeys(data) : data));
  },
  put: (path, data) => {
    assertNotFormData(data, 'put');
    return unwrap(window.electronAPI.apiPut(BASE + path, data != null ? snakeizeKeys(data) : data));
  },
  patch: (path, data) => {
    assertNotFormData(data, 'patch');
    return unwrap(window.electronAPI.apiPatch(BASE + path, data != null ? snakeizeKeys(data) : data));
  },
  delete: (path, data) => {
    assertNotFormData(data, 'delete');
    return unwrap(window.electronAPI.apiDelete(BASE + path, data != null ? snakeizeKeys(data) : data));
  },
};

// ── All API modules — verbatim from website/src/api/client.js, minus printAPI ──

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
  // See file-header note — not wired up yet, throws a clear error instead of
  // silently mangling the upload.
  uploadImage: () => { throw new Error('menuAPI.uploadImage: image upload is not yet supported in the Admin panel.'); },
  getStations: () => api.get('/menu/stations'),
  addStation: (name) => api.post('/menu/stations', { name }),
  deleteStation: (name) => api.delete(`/menu/stations/${encodeURIComponent(name)}`),
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
  // `extra` (optional): merged into the body alongside `items` — added so
  // callers can pass `{ clientPrintsLocally: true }` when they're about to
  // print the kitchen ticket themselves right after this succeeds (pos-app's
  // Admin screens, unlike the Cashier POS's dedicated `orders:create`/
  // `orders:addItems` IPC handlers, route through this generic REST client,
  // which never auto-injects that flag the way main.js's funnel does — see
  // NewOrderModal.jsx/admin TablesScreen.jsx's handleAddFoodToOrder for the
  // real call sites that need this). Backward-compatible: omitting `extra`
  // behaves exactly as before.
  addItems: (id, items, extra) => api.post(`/orders/${id}/items`, { items, ...extra }),
  markItemReady: (id, itemId) => api.put(`/orders/${id}/items/${itemId}/ready`),
  markItemServed: (id, itemId) => api.put(`/orders/${id}/items/${itemId}/serve`),
};

export const settingsAPI = {
  get: () => api.get('/settings'),
  update: (data) => api.put('/settings', data),
  uploadLogo: () => { throw new Error('settingsAPI.uploadLogo: image upload is not yet supported in the Admin panel.'); },
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
  getDeliveries: () => api.get('/procurement/deliveries'),
  getDelivery: (id) => api.get(`/procurement/deliveries/${id}`),
  getDeliveriesDebt: () => api.get('/procurement/deliveries/debt'),
  createDelivery: (data) => api.post('/procurement/deliveries', data),
  bulkSyncDeliveries: (arr) => api.post('/procurement/deliveries/bulk-sync', arr),
  updateDeliveryStatus: (id, status) => api.patch(`/procurement/deliveries/${id}/status`, { status }),
  payDelivery: (id, data) => api.patch(`/procurement/deliveries/${id}/pay`, data || {}),
  deleteDelivery: (id) => api.delete(`/procurement/deliveries/${id}`),
  removeDeliveryItem: (itemId, removeReason) => api.patch(`/procurement/delivery-items/${itemId}/remove`, { removeReason }),
  updateDeliveryItemQty: (itemId, qty) => api.patch(`/procurement/delivery-items/${itemId}/update-qty`, { qty }),
};

export default api;

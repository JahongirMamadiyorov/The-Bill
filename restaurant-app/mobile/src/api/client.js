import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE_URL = 'http://10.0.2.2:3000/api';// ← Change this to your server IP

const api = axios.create({ baseURL: API_BASE_URL });

// Attach JWT token to every request
api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Global error handler
api.interceptors.response.use(
  res => res,
  async err => {
    if (err.response?.status === 401) {
      await AsyncStorage.removeItem('token');
      // Navigate to login — handled in AuthContext
    }
    return Promise.reject(err);
  }
);

export default api;

// ─── API HELPERS ────────────────────────────────────────────

export const authAPI = {
  login: (email, password) => api.post('/auth/login', { email, password }),
};

export const usersAPI = {
  getAll:            () => api.get('/users'),
  create:            (data) => api.post('/users', data),
  update:            (id, data) => api.put(`/users/${id}`, data),
  updateCredentials: (id, data) => api.put(`/users/${id}/credentials`, data),
  delete:            (id) => api.delete(`/users/${id}`),
  getPermissions:    (id) => api.get(`/permissions/${id}`),
  updatePermissions: (id, data) => api.put(`/permissions/${id}`, data),
};

export const tablesAPI = {
  getAll: () => api.get('/tables'),
  create: (data) => api.post('/tables', data),
  open: (id) => api.put(`/tables/${id}/open`),
  close: (id) => api.put(`/tables/${id}/close`),
  transfer: (id, newWaitressId) => api.put(`/tables/${id}/transfer`, { new_waitress_id: newWaitressId }),
  merge: (id1, id2) => api.put('/tables/merge', { table_id_1: id1, table_id_2: id2 }),
};

export const menuAPI = {
  getCategories: () => api.get('/menu/categories'),
  getItems: (params) => api.get('/menu/items', { params }),
  createItem: (data) => api.post('/menu/items', data),
  updateItem: (id, data) => api.put(`/menu/items/${id}`, data),
  deleteItem: (id) => api.delete(`/menu/items/${id}`),
};

export const ordersAPI = {
  getAll: (params) => api.get('/orders', { params }),
  getById: (id) => api.get(`/orders/${id}`),
  create: (data) => api.post('/orders', data),
  update: (id, data) => api.put(`/orders/${id}`, data),
  updateStatus: (id, status) => api.put(`/orders/${id}/status`, { status }),
  pay: (id, data) => api.put(`/orders/${id}/pay`, data),
  cancel: (id) => api.delete(`/orders/${id}`),
  deleteOrder: (id, data) => api.delete(`/orders/${id}`, { data }),
};

export const accountingAPI = {
  getPnL: (from, to) => api.get('/accounting/pnl', { params: { from, to } }),
  getSales: (params) => api.get('/accounting/sales', { params }),
  getExpenses: (params) => api.get('/accounting/expenses', { params }),
  addExpense: (data) => api.post('/accounting/expenses', data),
  getCashFlow: () => api.get('/accounting/cashflow'),
  addCashFlow: (data) => api.post('/accounting/cashflow', data),
};

export const reportsAPI = {
  getDashboard: () => api.get('/reports/dashboard'),
  getBestSellers: (params) => api.get('/reports/best-sellers', { params }),
  getWaitressPerformance: (params) => api.get('/reports/waitress-performance', { params }),
};

export const inventoryAPI = {
  getAll: () => api.get('/inventory'),
  getLowStock: () => api.get('/inventory/low-stock'),
  create: (data) => api.post('/inventory', data),
  update: (id, data) => api.put(`/inventory/${id}`, data),
  recordWaste: (data) => api.post('/inventory/record-waste', data),
};

export const notificationsAPI = {
  getAll: () => api.get('/notifications'),
  markRead: (id) => api.put(`/notifications/${id}/read`),
  markAllRead: () => api.put('/notifications/read-all'),
};

export const shiftsAPI = {
  clockIn: (hourly_rate) => api.post('/shifts/clock-in', { hourly_rate }),
  clockOut: () => api.put('/shifts/clock-out'),
  getAll: (params) => api.get('/shifts', { params }),
  getPayroll: (params) => api.get('/shifts/payroll', { params }),
};

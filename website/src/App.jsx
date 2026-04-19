import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/auth/Login';

// Super Admin pages
import SuperAdminRestaurants from './pages/super-admin/SuperAdminRestaurants';
import SuperAdminProfile from './pages/super-admin/SuperAdminProfile';

// Owner pages
import OwnerHome from './pages/owner/OwnerHome';
import OwnerSales from './pages/owner/OwnerSales';
import OwnerStaff from './pages/owner/OwnerStaff';
import OwnerInventory from './pages/owner/OwnerInventory';
import OwnerFinance from './pages/owner/OwnerFinance';
import OwnerProfile from './pages/owner/OwnerProfile';

// Admin pages
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminTables from './pages/admin/AdminTables';
import AdminMenu from './pages/admin/AdminMenu';
import AdminInventory from './pages/admin/AdminInventory';
import AdminOrders from './pages/admin/AdminOrders';
import AdminStaff from './pages/admin/AdminStaff';
import AdminProfile from './pages/admin/AdminProfile';
import AdminNewOrder from './pages/admin/AdminNewOrder';

// Cashier pages
import CashierOrders from './pages/cashier/CashierOrders';
import CashierTables from './pages/cashier/CashierTables';
import CashierHistory from './pages/cashier/CashierHistory';
import CashierLoans from './pages/cashier/CashierLoans';
import CashierProfile from './pages/cashier/CashierProfile';

// Waitress pages
import WaitressTables from './pages/waitress/WaitressTables';
import WaitressOrders from './pages/waitress/WaitressOrders';
import WaitressMenu from './pages/waitress/WaitressMenu';
import WaitressNotifications from './pages/waitress/WaitressNotifications';
import WaitressPerformance from './pages/waitress/WaitressPerformance';
import WaitressProfile from './pages/waitress/WaitressProfile';

// Kitchen pages
import KitchenDashboard from './pages/kitchen/KitchenDashboard';
import KitchenNotifications from './pages/kitchen/KitchenNotifications';
import KitchenProfile from './pages/kitchen/KitchenProfile';

function ProtectedRoute({ children, roles }) {
  const { user, isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user?.role)) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const { isAuthenticated, user } = useAuth();

  const defaultRoute = () => {
    if (!isAuthenticated) return '/login';
    const routes = { super_admin: '/super-admin', owner: '/owner', admin: '/admin', cashier: '/cashier', waitress: '/waitress', kitchen: '/kitchen' };
    return routes[user?.role] || '/login';
  };

  return (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to={defaultRoute()} replace /> : <Login />} />

      {/* Super Admin */}
      <Route path="/super-admin" element={<ProtectedRoute roles={['super_admin']}><Layout /></ProtectedRoute>}>
        <Route index element={<SuperAdminRestaurants />} />
        <Route path="profile" element={<SuperAdminProfile />} />
      </Route>

      {/* Owner */}
      <Route path="/owner" element={<ProtectedRoute roles={['owner']}><Layout /></ProtectedRoute>}>
        <Route index element={<OwnerHome />} />
        <Route path="sales" element={<OwnerSales />} />
        <Route path="staff" element={<OwnerStaff />} />
        <Route path="inventory" element={<OwnerInventory />} />
        <Route path="finance" element={<OwnerFinance />} />
        <Route path="profile" element={<OwnerProfile />} />
      </Route>

      {/* Admin */}
      <Route path="/admin" element={<ProtectedRoute roles={['admin']}><Layout /></ProtectedRoute>}>
        <Route index element={<AdminDashboard />} />
        <Route path="tables" element={<AdminTables />} />
        <Route path="menu" element={<AdminMenu />} />
        <Route path="inventory" element={<AdminInventory />} />
        <Route path="orders" element={<AdminOrders />} />
        <Route path="staff" element={<AdminStaff />} />
        <Route path="profile" element={<AdminProfile />} />
        <Route path="new-order" element={<AdminNewOrder />} />
      </Route>

      {/* Cashier */}
      <Route path="/cashier" element={<ProtectedRoute roles={['cashier']}><Layout /></ProtectedRoute>}>
        <Route index element={<CashierOrders />} />
        <Route path="tables" element={<CashierTables />} />
        <Route path="history" element={<CashierHistory />} />
        <Route path="loans" element={<CashierLoans />} />
        <Route path="profile" element={<CashierProfile />} />
        <Route path="new-order" element={<AdminNewOrder />} />
      </Route>

      {/* Waitress */}
      <Route path="/waitress" element={<ProtectedRoute roles={['waitress']}><Layout /></ProtectedRoute>}>
        <Route index element={<WaitressTables />} />
        <Route path="orders" element={<WaitressOrders />} />
        <Route path="menu" element={<WaitressMenu />} />
        <Route path="notifications" element={<WaitressNotifications />} />
        <Route path="performance" element={<WaitressPerformance />} />
        <Route path="profile" element={<WaitressProfile />} />
        <Route path="new-order" element={<AdminNewOrder />} />
      </Route>

      {/* Kitchen */}
      <Route path="/kitchen" element={<ProtectedRoute roles={['kitchen']}><Layout /></ProtectedRoute>}>
        <Route index element={<KitchenDashboard />} />
        <Route path="notifications" element={<KitchenNotifications />} />
        <Route path="profile" element={<KitchenProfile />} />
      </Route>

      {/* Catch-all */}
      <Route path="*" element={<Navigate to={defaultRoute()} replace />} />
    </Routes>
  );
}

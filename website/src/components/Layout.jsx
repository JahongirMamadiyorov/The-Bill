import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Home, BarChart3, Users, Package, Wallet, User, LayoutDashboard, Grid3X3,
  UtensilsCrossed, ClipboardList, ShoppingCart, History, Banknote, Bell,
  TrendingUp, ChefHat, LogOut, Menu, X, ChevronLeft, ChevronRight
} from 'lucide-react';

const ROLE_CONFIG = {
  owner:    { color: '#7C3AED', bg: 'bg-purple-600', bgDark: 'bg-purple-700', bgLight: 'bg-purple-50', text: 'text-purple-600', hover: 'hover:bg-purple-50', activeBg: 'bg-purple-100', label: 'Owner Panel', ring: 'ring-purple-500' },
  admin:    { color: '#2563EB', bg: 'bg-blue-600', bgDark: 'bg-blue-700', bgLight: 'bg-blue-50', text: 'text-blue-600', hover: 'hover:bg-blue-50', activeBg: 'bg-blue-100', label: 'Admin Panel', ring: 'ring-blue-500' },
  cashier:  { color: '#0891B2', bg: 'bg-cyan-600', bgDark: 'bg-cyan-700', bgLight: 'bg-cyan-50', text: 'text-cyan-600', hover: 'hover:bg-cyan-50', activeBg: 'bg-cyan-100', label: 'Cashier Panel', ring: 'ring-cyan-500' },
  waitress: { color: '#16A34A', bg: 'bg-green-600', bgDark: 'bg-green-700', bgLight: 'bg-green-50', text: 'text-green-600', hover: 'hover:bg-green-50', activeBg: 'bg-green-100', label: 'Waitress Panel', ring: 'ring-green-500' },
  kitchen:  { color: '#EA580C', bg: 'bg-orange-600', bgDark: 'bg-orange-700', bgLight: 'bg-orange-50', text: 'text-orange-600', hover: 'hover:bg-orange-50', activeBg: 'bg-orange-100', label: 'Kitchen Panel', ring: 'ring-orange-500' },
};

const NAV_ITEMS = {
  owner: [
    { to: '/owner', icon: Home, label: 'Home', end: true },
    { to: '/owner/sales', icon: BarChart3, label: 'Sales' },
    { to: '/owner/staff', icon: Users, label: 'Staff' },
    { to: '/owner/inventory', icon: Package, label: 'Inventory' },
    { to: '/owner/finance', icon: Wallet, label: 'Finance' },
    { to: '/owner/profile', icon: User, label: 'Profile' },
  ],
  admin: [
    { to: '/admin', icon: LayoutDashboard, label: 'Dashboard', end: true },
    { to: '/admin/tables', icon: Grid3X3, label: 'Tables' },
    { to: '/admin/menu', icon: UtensilsCrossed, label: 'Menu' },
    { to: '/admin/inventory', icon: Package, label: 'Inventory' },
    { to: '/admin/orders', icon: ClipboardList, label: 'Orders' },
    { to: '/admin/staff', icon: Users, label: 'Staff' },
    { to: '/admin/profile', icon: User, label: 'Profile' },
  ],
  cashier: [
    { to: '/cashier', icon: ShoppingCart, label: 'Orders', end: true },
    { to: '/cashier/tables', icon: Grid3X3, label: 'Tables' },
    { to: '/cashier/history', icon: History, label: 'History' },
    { to: '/cashier/loans', icon: Banknote, label: 'Loans' },
    { to: '/cashier/profile', icon: User, label: 'Profile' },
  ],
  waitress: [
    { to: '/waitress', icon: Grid3X3, label: 'Tables', end: true },
    { to: '/waitress/orders', icon: ClipboardList, label: 'Orders' },
    { to: '/waitress/menu', icon: UtensilsCrossed, label: 'Menu' },
    { to: '/waitress/notifications', icon: Bell, label: 'Notifications' },
    { to: '/waitress/performance', icon: TrendingUp, label: 'Performance' },
    { to: '/waitress/profile', icon: User, label: 'Profile' },
  ],
  kitchen: [
    { to: '/kitchen', icon: ChefHat, label: 'Dashboard', end: true },
    { to: '/kitchen/notifications', icon: Bell, label: 'Notifications' },
    { to: '/kitchen/profile', icon: User, label: 'Profile' },
  ],
};

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const role = user?.role || 'admin';
  const rc = ROLE_CONFIG[role] || ROLE_CONFIG.admin;
  const navItems = NAV_ITEMS[role] || [];

  const handleLogout = () => { logout(); navigate('/login'); };

  const initials = (user?.name || 'U').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <div className="flex h-screen bg-gray-100">
      <aside className={`${sidebarOpen ? 'w-64' : 'w-20'} flex flex-col bg-white transition-all duration-300 shrink-0 shadow-md`}>
        {/* Role header with avatar */}
        <div className={`${rc.bg} px-4 py-5`}>
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 border-2 border-white/30"
              style={{ backgroundColor: 'rgba(255,255,255,0.2)', color: 'white' }}
            >
              {initials}
            </div>
            {sidebarOpen && (
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-sm truncate">{user?.name}</p>
                <p className="text-white/60 text-xs truncate">{rc.label}</p>
              </div>
            )}
          </div>
        </div>

        {/* Nav links */}
        <nav className="flex-1 py-4 px-3 overflow-y-auto space-y-1">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? `${rc.activeBg} ${rc.text} shadow-sm`
                    : `text-gray-600 ${rc.hover} hover:text-gray-900`
                }`
              }
            >
              <item.icon size={20} className="shrink-0" />
              {sidebarOpen && <span className="truncate">{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Bottom: collapse toggle + logout */}
        <div className="p-3 space-y-1">
          {/* Collapse / expand */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-all duration-200`}
          >
            {sidebarOpen ? <ChevronLeft size={20} className="shrink-0" /> : <ChevronRight size={20} className="shrink-0" />}
            {sidebarOpen && <span>Collapse</span>}
          </button>

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-gray-500 hover:bg-red-50 hover:text-red-600 transition-all duration-200"
          >
            <LogOut size={20} className="shrink-0" />
            {sidebarOpen && <span>Logout</span>}
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-hidden bg-gray-50">
        <Outlet />
      </main>
    </div>
  );
}

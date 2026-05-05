import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../context/LanguageContext';
import {
  Home, BarChart3, Users, Package, Wallet, User, LayoutDashboard, Grid3X3,
  UtensilsCrossed, ClipboardList, ShoppingCart, History, Banknote, Bell,
  TrendingUp, ChefHat, LogOut, Menu, X, ChevronLeft, ChevronRight, Building2, Shield, Languages
} from 'lucide-react';

const ROLE_STYLE = {
  super_admin: { color: '#DC2626', bg: 'bg-red-600', bgDark: 'bg-red-700', bgLight: 'bg-red-50', text: 'text-red-600', hover: 'hover:bg-red-50', activeBg: 'bg-red-100', labelKey: 'layout.superAdmin', ring: 'ring-red-500' },
  owner:    { color: '#7C3AED', bg: 'bg-purple-600', bgDark: 'bg-purple-700', bgLight: 'bg-purple-50', text: 'text-purple-600', hover: 'hover:bg-purple-50', activeBg: 'bg-purple-100', labelKey: 'layout.ownerPanel', ring: 'ring-purple-500' },
  admin:    { color: '#2563EB', bg: 'bg-blue-600', bgDark: 'bg-blue-700', bgLight: 'bg-blue-50', text: 'text-blue-600', hover: 'hover:bg-blue-50', activeBg: 'bg-blue-100', labelKey: 'layout.adminPanel', ring: 'ring-blue-500' },
  cashier:  { color: '#0891B2', bg: 'bg-cyan-600', bgDark: 'bg-cyan-700', bgLight: 'bg-cyan-50', text: 'text-cyan-600', hover: 'hover:bg-cyan-50', activeBg: 'bg-cyan-100', labelKey: 'layout.cashierPanel', ring: 'ring-cyan-500' },
  waitress: { color: '#16A34A', bg: 'bg-green-600', bgDark: 'bg-green-700', bgLight: 'bg-green-50', text: 'text-green-600', hover: 'hover:bg-green-50', activeBg: 'bg-green-100', labelKey: 'layout.waitressPanel', ring: 'ring-green-500' },
  kitchen:  { color: '#EA580C', bg: 'bg-orange-600', bgDark: 'bg-orange-700', bgLight: 'bg-orange-50', text: 'text-orange-600', hover: 'hover:bg-orange-50', activeBg: 'bg-orange-100', labelKey: 'layout.kitchenPanel', ring: 'ring-orange-500' },
};

const NAV_ITEMS = {
  super_admin: [
    { to: '/super-admin', icon: Building2, labelKey: 'nav.restaurants', end: true },
    { to: '/super-admin/profile', icon: User, labelKey: 'nav.profile' },
  ],
  owner: [
    { to: '/owner', icon: Home, labelKey: 'nav.home', end: true },
    { to: '/owner/sales', icon: BarChart3, labelKey: 'nav.sales' },
    { to: '/owner/staff', icon: Users, labelKey: 'nav.staff' },
    { to: '/owner/inventory', icon: Package, labelKey: 'nav.inventory' },
    { to: '/owner/finance', icon: Wallet, labelKey: 'nav.finance' },
    { to: '/owner/profile', icon: User, labelKey: 'nav.profile' },
  ],
  admin: [
    { to: '/admin', icon: LayoutDashboard, labelKey: 'nav.dashboard', end: true },
    { to: '/admin/tables', icon: Grid3X3, labelKey: 'nav.tables' },
    { to: '/admin/menu', icon: UtensilsCrossed, labelKey: 'nav.menu' },
    { to: '/admin/inventory', icon: Package, labelKey: 'nav.inventory' },
    { to: '/admin/orders', icon: ClipboardList, labelKey: 'nav.orders' },
    { to: '/admin/loans', icon: Banknote, labelKey: 'nav.loans' },
    { to: '/admin/staff', icon: Users, labelKey: 'nav.staff' },
    { to: '/admin/profile', icon: User, labelKey: 'nav.profile' },
  ],
  cashier: [
    { to: '/cashier', icon: ShoppingCart, labelKey: 'nav.orders', end: true },
    { to: '/cashier/tables', icon: Grid3X3, labelKey: 'nav.tables' },
    { to: '/cashier/history', icon: History, labelKey: 'nav.history' },
    { to: '/cashier/loans', icon: Banknote, labelKey: 'nav.loans' },
    { to: '/cashier/profile', icon: User, labelKey: 'nav.profile' },
  ],
  waitress: [
    { to: '/waitress', icon: Grid3X3, labelKey: 'nav.tables', end: true },
    { to: '/waitress/orders', icon: ClipboardList, labelKey: 'nav.orders' },
    { to: '/waitress/menu', icon: UtensilsCrossed, labelKey: 'nav.menu' },
    { to: '/waitress/notifications', icon: Bell, labelKey: 'nav.notifications' },
    { to: '/waitress/performance', icon: TrendingUp, labelKey: 'nav.performance' },
    { to: '/waitress/profile', icon: User, labelKey: 'nav.profile' },
  ],
  kitchen: [
    { to: '/kitchen', icon: ChefHat, labelKey: 'nav.dashboard', end: true },
    { to: '/kitchen/notifications', icon: Bell, labelKey: 'nav.notifications' },
    { to: '/kitchen/profile', icon: User, labelKey: 'nav.profile' },
  ],
};

export default function Layout() {
  const { user, logout } = useAuth();
  const { t, lang, switchLang } = useTranslation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const role = user?.role || 'admin';
  const rc = ROLE_STYLE[role] || ROLE_STYLE.admin;
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
                <p className="text-white/60 text-xs truncate">{t(rc.labelKey)}</p>
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
              {sidebarOpen && <span className="truncate">{t(item.labelKey)}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Bottom: language switcher + collapse + logout */}
        <div className="p-3 space-y-1">
          {/* Language switcher */}
          {sidebarOpen ? (
            <div className="flex items-center gap-2 px-3 py-2">
              <Languages size={18} className="shrink-0 text-gray-500" />
              <div className="flex-1 grid grid-cols-2 gap-1 p-0.5 bg-gray-100 rounded-lg">
                <button
                  onClick={() => switchLang('uz')}
                  className={`px-2 py-1 rounded-md text-xs font-semibold transition-all ${
                    lang === 'uz'
                      ? `bg-white ${rc.text} shadow-sm`
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  UZ
                </button>
                <button
                  onClick={() => switchLang('en')}
                  className={`px-2 py-1 rounded-md text-xs font-semibold transition-all ${
                    lang === 'en'
                      ? `bg-white ${rc.text} shadow-sm`
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  EN
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => switchLang(lang === 'uz' ? 'en' : 'uz')}
              title={t('language.selectLanguage')}
              className="flex items-center justify-center w-full px-3 py-2.5 rounded-lg text-xs font-bold text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-all duration-200"
            >
              <Languages size={18} className="shrink-0" />
              <span className="ml-1">{lang.toUpperCase()}</span>
            </button>
          )}

          {/* Collapse / expand */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-all duration-200`}
          >
            {sidebarOpen ? <ChevronLeft size={20} className="shrink-0" /> : <ChevronRight size={20} className="shrink-0" />}
            {sidebarOpen && <span>{t('layout.collapse')}</span>}
          </button>

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-gray-500 hover:bg-red-50 hover:text-red-600 transition-all duration-200"
          >
            <LogOut size={20} className="shrink-0" />
            {sidebarOpen && <span>{t('layout.logout')}</span>}
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-hidden bg-gray-50">
        <Outlet />
      </main>
    </div>
  );
}

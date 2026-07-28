import { useEffect } from 'react';
import { LanguageProvider } from '../../context/LanguageContext.jsx';
import AdminShell from './AdminShell.jsx';
import DashboardScreen from './screens/DashboardScreen.jsx';
import TablesScreen from './screens/TablesScreen.jsx';
import MenuScreen from './screens/MenuScreen.jsx';
import InventoryScreen from './screens/InventoryScreen.jsx';
import OrdersScreen from './screens/OrdersScreen.jsx';
import LoansScreen from './screens/LoansScreen.jsx';
import StaffScreen from './screens/StaffScreen.jsx';
import SettingsScreen from './screens/SettingsScreen.jsx';
import ProfileScreen from './screens/ProfileScreen.jsx';
// Bring in the Preflight-free Tailwind utilities only when the Admin panel
// actually mounts — see admin.css's own header comment for why Preflight is
// skipped (it would otherwise apply a global element reset that risks subtly
// changing the already-approved, inline-style-based cashier POS screens).
import '../../admin.css';

// ─────────────────────────────────────────────────────────────────────────────
// Admin entry (`admin`/`owner` roles → /admin route). Mirrors PosCashier.jsx's
// pattern exactly: a thin wrapper that owns logout and hands the real session
// data down to the shell. Screens get registered in the SCREENS map below as
// each one is built (see STATUS.md/task list for build order).
// ─────────────────────────────────────────────────────────────────────────────

const SCREENS = {
  dashboard: DashboardScreen,
  tables:    TablesScreen,
  menu:      MenuScreen,
  inventory: InventoryScreen,
  orders:    OrdersScreen,
  loans:     LoansScreen,
  staff:     StaffScreen,
  settings:  SettingsScreen,
  profile:   ProfileScreen,
};

export default function AdminPanel({ session, onLogout }) {
  const handleLogout = async () => {
    await window.electronAPI.logout();
    onLogout();
  };

  // Mirrors the website's axios interceptor calling `window.location.href =
  // '/login'` on a 401 — there's no browser navigation here, so client.js
  // dispatches this event instead and this is where it gets handled.
  useEffect(() => {
    const handler = () => { handleLogout(); };
    window.addEventListener('admin:unauthorized', handler);
    return () => window.removeEventListener('admin:unauthorized', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <LanguageProvider>
      <AdminShell user={session?.user} onLogout={handleLogout} screens={SCREENS} />
    </LanguageProvider>
  );
}

import PosShell from './PosShell.jsx';
import MenuScreen from './MenuScreen.jsx';
import OrdersScreen from './OrdersScreen.jsx';
import TablesScreen from './TablesScreen.jsx';
import HistoryScreen from './HistoryScreen.jsx';
import ReceivablesScreen from './ReceivablesScreen.jsx';
import ProfileScreen from './ProfileScreen.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// New-design Cashier entry (`new_cashier` role → /pos route).
// Replaces the old teal src/pages/Cashier.jsx (kept in the repo as reference
// until the redesign is fully verified — do not delete it yet).
//
// Screens are registered here as they get built:
//   Step 2 ✔ menu    · Step 4 orders · Step 5 tables
//   Step 6 history   · Step 7 receivables · Step 8 profile
// Unregistered screens show the shell's built-in placeholder.
// ─────────────────────────────────────────────────────────────────────────────

const SCREENS = {
  menu:   MenuScreen,
  orders: OrdersScreen,
  tables:  TablesScreen,
  history:     HistoryScreen,
  receivables: ReceivablesScreen,
  profile:     ProfileScreen,
};

export default function PosCashier({ session, onLogout }) {
  const handleLogout = async () => {
    await window.electronAPI.logout();
    onLogout();
  };
  return <PosShell session={session} onLogout={handleLogout} screens={SCREENS} />;
}

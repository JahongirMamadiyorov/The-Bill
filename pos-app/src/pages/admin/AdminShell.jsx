import { useState } from 'react';
import {
  LayoutDashboard, Grid3X3, UtensilsCrossed, Package, ClipboardList, Banknote,
  Users, Settings, User, LogOut, ChevronLeft, ChevronRight, Languages,
} from 'lucide-react';
import { useTranslation } from '../../context/LanguageContext.jsx';
import { useSettings } from '../pos/useSettings.js';

// ─────────────────────────────────────────────────────────────────────────────
// Admin panel shell — sidebar + topbar, faithfully matching
// website/src/components/Layout.jsx's admin styling (same blue theme, same
// Tailwind classes, same 9 nav items in the same order) per the explicit
// "no design changes" instruction for this port. Two real adaptations from
// the website version, neither of which is a visible design change:
//
// 1. No react-router-dom <Outlet/> nesting — pos-app navigates between
//    screens via internal state (`nav`) and a SCREENS map, same pattern
//    PosShell.jsx already uses for the cashier panel, not per-URL routes.
// 2. No useAuth()/AuthContext — pos-app's session lives in App.jsx's state
//    and gets passed down as a prop, matching how PosCashier/PosShell work.
// 3. Deep-link support (added for task #26, OrdersScreen.jsx): TablesScreen.
//    jsx's "View Full Order" button calls `navigate('/admin/orders?open=<id>')`
//    — a pattern lifted from the website, which reads `?open=<id>` via
//    react-router's useLocation()/useSearchParams(). pos-app has neither, so
//    `goTo()` below parses the `open` query param itself (right after it
//    splits on `?` to strip it for nav-key matching) and stores it in
//    `openOrderId` state, passed down to whichever screen is active as a
//    plain prop alongside `navigate`. OrdersScreen.jsx consumes it in a
//    `useEffect` (fetch the order, open its detail modal) and calls the also-
//    passed-down `clearOpenOrderId()` afterward so it doesn't reopen on a
//    later re-render or a trip to another screen and back. Every other
//    screen just ignores the extra prop — same reasoning as `navigate` being
//    passed to every screen even though only some of them call it.
//
// 4. `onLogout` now also passed down to the active screen (added for task
//    #30, ProfileScreen.jsx): this sidebar already centralizes the real
//    logout flow (window.electronAPI.logout() + clearing App.jsx's session,
//    see AdminPanel.jsx's handleLogout) behind its own "Sign Out" button's
//    `onLogout` prop. ProfileScreen.jsx is the first ported screen with its
//    own in-screen Sign Out action (the website's AdminProfile.jsx does its
//    own raw localStorage-clear + window.location.href, which has no
//    equivalent in Electron) — rather than give it a second logout code
//    path, it reuses this exact same `onLogout` function. Every other screen
//    ignores the extra prop harmlessly, same as `navigate`/`openOrderId`.
//
// Deliberately NOT ported from Layout.jsx: useKitchenPrint and the
// settingsAPI.get() call that prefetches kitchenPrinters — both exist only
// to support printing, which was out of scope for the earlier port phase.
//
// 5. `settings` (added when kitchen printing was wired in): now calls the
//    same `useSettings()` hook the Cashier POS shell (PosShell.jsx) already
//    uses, and passes it down to every active screen the same way `user`/
//    `onLogout` already are — so any Admin screen that fires or diffs a
//    kitchen ticket has `settings.kitchenPrinters`/`settings.kitchenShow`
//    available without fetching anything itself. Follows the exact existing
//    "pass shared data down as a prop" convention this file already
//    established, not a new plumbing mechanism.
// ─────────────────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { key: 'dashboard',  icon: LayoutDashboard,  labelKey: 'nav.dashboard' },
  { key: 'tables',     icon: Grid3X3,          labelKey: 'nav.tables' },
  { key: 'menu',       icon: UtensilsCrossed,  labelKey: 'nav.menu' },
  { key: 'inventory',  icon: Package,          labelKey: 'nav.inventory' },
  { key: 'orders',     icon: ClipboardList,    labelKey: 'nav.orders' },
  { key: 'loans',      icon: Banknote,         labelKey: 'nav.loans' },
  { key: 'staff',      icon: Users,            labelKey: 'nav.staff' },
  { key: 'settings',   icon: Settings,         labelKey: 'nav.settings' },
  { key: 'profile',    icon: User,             labelKey: 'nav.profile' },
];

// Matches Layout.jsx's ROLE_STYLE.admin exactly.
const RC = {
  bg: 'bg-blue-600', text: 'text-blue-600', hover: 'hover:bg-blue-50', activeBg: 'bg-blue-100',
};

export default function AdminShell({ user, onLogout, screens = {} }) {
  const { t, lang, switchLang } = useTranslation();
  const settings = useSettings();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [nav, setNav] = useState('dashboard');
  // See header comment #3 — deep-link target order id for OrdersScreen.jsx.
  const [openOrderId, setOpenOrderId] = useState(null);

  const initials = (user?.name || 'U').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const Screen = screens[nav];

  // Adapter so screens ported verbatim from the website (which call
  // `navigate('/admin/orders')` via react-router's useNavigate) keep working
  // unchanged — pos-app has no <Outlet/>/URL routing, just this nav key
  // state, so a path like '/admin/orders' maps straight to the 'orders' key.
  // Also strips a trailing '?...' query string (added for TablesScreen.jsx's
  // "View Full Order" button, which calls `navigate('/admin/orders?open=<id>')`
  // — without this, the raw 'orders?open=<id>' string would never match the
  // 'orders' SCREENS key at all and would just fall through to the generic
  // placeholder). The query value is now parsed and consumed via the
  // `openOrderId`/`clearOpenOrderId` prop pair — see header comment #3 and
  // OrdersScreen.jsx's own header comment.
  const goTo = (path) => {
    const raw = String(path || '');
    const withoutPrefix = raw.replace(/^\/?admin\/?/, '');
    const [pathPart, queryPart] = withoutPrefix.split('?');
    const key = pathPart.split('/')[0];
    setNav(key || 'dashboard');
    if (queryPart) {
      const openId = new URLSearchParams(queryPart).get('open');
      if (openId) setOpenOrderId(openId);
    }
  };

  return (
    <div className="admin-panel flex h-full bg-gray-100">
      <aside className={`${sidebarOpen ? 'w-64' : 'w-20'} flex flex-col bg-white transition-all duration-300 shrink-0 shadow-md`}>
        {/* Role header with avatar */}
        <div className={`${RC.bg} px-4 py-5`}>
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
                <p className="text-white/60 text-xs truncate">{t('layout.adminPanel')}</p>
              </div>
            )}
          </div>
        </div>

        {/* Nav links */}
        <nav className="flex-1 py-4 px-3 overflow-y-auto space-y-1">
          {NAV_ITEMS.map(item => {
            const isActive = nav === item.key;
            return (
              <button
                key={item.key}
                onClick={() => setNav(item.key)}
                className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  isActive ? `${RC.activeBg} ${RC.text} shadow-sm` : `text-gray-600 ${RC.hover} hover:text-gray-900`
                }`}
              >
                <item.icon size={20} className="shrink-0" />
                {sidebarOpen && <span className="truncate">{t(item.labelKey)}</span>}
              </button>
            );
          })}
        </nav>

        {/* Bottom: language switcher + collapse + logout */}
        <div className="p-3 space-y-1">
          {sidebarOpen ? (
            <div className="flex items-center gap-2 px-3 py-2">
              <Languages size={18} className="shrink-0 text-gray-500" />
              <div className="flex-1 grid grid-cols-2 gap-1 p-0.5 bg-gray-100 rounded-lg">
                <button
                  onClick={() => switchLang('uz')}
                  className={`px-2 py-1 rounded-md text-xs font-semibold transition-all ${
                    lang === 'uz' ? `bg-white ${RC.text} shadow-sm` : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  UZ
                </button>
                <button
                  onClick={() => switchLang('en')}
                  className={`px-2 py-1 rounded-md text-xs font-semibold transition-all ${
                    lang === 'en' ? `bg-white ${RC.text} shadow-sm` : 'text-gray-500 hover:text-gray-700'
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

          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-all duration-200"
          >
            {sidebarOpen ? <ChevronLeft size={20} className="shrink-0" /> : <ChevronRight size={20} className="shrink-0" />}
            {sidebarOpen && <span>{t('layout.collapse')}</span>}
          </button>

          <button
            onClick={onLogout}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-gray-500 hover:bg-red-50 hover:text-red-600 transition-all duration-200"
          >
            <LogOut size={20} className="shrink-0" />
            {sidebarOpen && <span>{t('layout.logout')}</span>}
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-hidden bg-gray-50">
        {Screen
          ? <Screen user={user} settings={settings} navigate={goTo} openOrderId={openOrderId} clearOpenOrderId={() => setOpenOrderId(null)} onLogout={onLogout} />
          : <Placeholder label={t(NAV_ITEMS.find(n => n.key === nav)?.labelKey || nav)} />}
      </main>
    </div>
  );
}

function Placeholder({ label }) {
  return (
    <div className="flex-1 h-full flex items-center justify-center text-gray-500 text-base font-medium">
      {label} — coming in a later build step
    </div>
  );
}

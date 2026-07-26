import { useState, useEffect } from 'react';
import {
  LayoutGrid, ClipboardList, TableProperties, Clock, HandCoins, User,
  Search, Bell, Globe, ChevronsLeft, ChevronsRight, LogOut,
} from 'lucide-react';
import { T, card, initials } from './tokens.js';
import { useSettings } from './useSettings.js';

// ─────────────────────────────────────────────────────────────────────────────
// POS Terminal shell — sidebar + top bar + active screen.
// Design: "Shell (all screens)" section of the design handoff README.
// Screens plug in via the SCREENS map; each receives { user, settings, setNav }.
// ─────────────────────────────────────────────────────────────────────────────

const NAV = [
  { key: 'menu',        label: 'Menu',        Icon: LayoutGrid,      searchPlaceholder: 'Search menu...' },
  { key: 'orders',      label: 'Orders',      Icon: ClipboardList,   searchPlaceholder: 'Search orders...' },
  { key: 'tables',      label: 'Tables',      Icon: TableProperties, searchPlaceholder: 'Search tables...' },
  { key: 'history',     label: 'History',     Icon: Clock,           searchPlaceholder: 'Search history...' },
  { key: 'receivables', label: 'Receivables', Icon: HandCoins,       searchPlaceholder: 'Search receivables...' },
  { key: 'profile',     label: 'Profile',     Icon: User,            searchPlaceholder: null }, // "My Profile" title instead
];

function Placeholder({ label }) {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.muted, fontSize: 15, fontWeight: 600 }}>
      {label} — coming in a later build step
    </div>
  );
}

export default function PosShell({ session, onLogout, screens = {} }) {
  const user       = session?.user || {};
  const restaurant = session?.restaurant || {};
  const settings   = useSettings();

  const [nav, setNav]           = useState('menu');
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('pos.sidebarCollapsed') === '1');
  const [lang, setLang]         = useState(() => localStorage.getItem('pos.lang') || 'EN');
  const [search, setSearch]     = useState('');
  const [clockIn, setClockIn]   = useState(null); // "06:33 AM" from /shifts/active

  useEffect(() => { localStorage.setItem('pos.sidebarCollapsed', collapsed ? '1' : '0'); }, [collapsed]);
  useEffect(() => { localStorage.setItem('pos.lang', lang); }, [lang]);
  useEffect(() => { setSearch(''); }, [nav]);

  // Clocked-in time from the real shifts table (existing backend endpoint).
  useEffect(() => {
    (async () => {
      try {
        const res = await window.electronAPI.apiGet('/api/shifts/active');
        if (res?.ok && res.data?.active && res.data.clock_in) {
          const d = new Date(res.data.clock_in);
          setClockIn(d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }));
        }
      } catch { /* offline — just hide the clocked-in line */ }
    })();
  }, []);

  const active   = NAV.find(n => n.key === nav) || NAV[0];
  const restName = settings.restaurantName || restaurant.name || 'The Bill';
  const sbW      = collapsed ? T.sidebarCollapsedW : T.sidebarW;

  const Screen = screens[nav];
  const screenProps = { user, settings, setNav, search, lang };

  return (
    <div style={{
      display: 'flex', height: '100vh', background: T.pageBg,
      fontFamily: T.font, color: T.ink, padding: 16, gap: 16, boxSizing: 'border-box',
    }}>

      {/* ══ Sidebar (floating white rounded card) ══ */}
      <aside style={{
        ...card, borderRadius: T.rCardLg, width: sbW, flexShrink: 0,
        display: 'flex', flexDirection: 'column',
        padding: collapsed ? '20px 14px' : '20px 18px',
        transition: 'width .18s ease, padding .18s ease', overflow: 'hidden',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 26, minHeight: 44 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, background: T.green, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 20, fontWeight: 800,
          }}>
            {(restName[0] || 'T').toUpperCase()}
          </div>
          {!collapsed && (
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 800, whiteSpace: 'nowrap' }}>{restName}</div>
              <div style={{ fontSize: 10, color: T.faint, whiteSpace: 'nowrap' }}>Restaurant management system</div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
          {NAV.map(({ key, label, Icon }) => {
            const isActive = nav === key;
            return (
              <button key={key} onClick={() => setNav(key)} title={label} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                justifyContent: collapsed ? 'center' : 'flex-start',
                padding: collapsed ? '12px 0' : '11px 14px',
                borderRadius: T.rBtn, border: 'none', cursor: 'pointer',
                background: isActive ? T.greenTint : 'transparent',
                color: isActive ? T.greenDark : T.muted,
                fontSize: 13.5, fontWeight: 700, fontFamily: T.font,
                transition: 'background .15s, color .15s', whiteSpace: 'nowrap',
              }}>
                <Icon size={19} strokeWidth={1.8} style={{ flexShrink: 0 }} />
                {!collapsed && label}
              </button>
            );
          })}
        </nav>

        {/* Bottom: language / collapse / logout */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
          {/* UZ/EN segmented toggle */}
          {collapsed ? (
            <button onClick={() => setLang(l => (l === 'EN' ? 'UZ' : 'EN'))} title={`Language: ${lang}`} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px 0',
              borderRadius: T.rBtn, border: 'none', background: 'transparent', color: T.muted,
              cursor: 'pointer', fontFamily: T.font, fontSize: 12, fontWeight: 700, gap: 6,
            }}>
              <Globe size={17} strokeWidth={1.8} />
            </button>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 6px' }}>
              <Globe size={17} strokeWidth={1.8} color={T.muted} style={{ flexShrink: 0 }} />
              <div style={{ display: 'flex', flex: 1, background: T.chipBg, borderRadius: T.rPill, padding: 3 }}>
                {['UZ', 'EN'].map(l => (
                  <button key={l} onClick={() => setLang(l)} style={{
                    flex: 1, padding: '5px 0', borderRadius: T.rPill, border: 'none', cursor: 'pointer',
                    background: lang === l ? T.green : 'transparent',
                    color: lang === l ? '#fff' : T.muted,
                    fontSize: 11, fontWeight: 800, fontFamily: T.font, transition: 'background .15s, color .15s',
                  }}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button onClick={() => setCollapsed(c => !c)} title={collapsed ? 'Expand' : 'Collapse'} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            justifyContent: collapsed ? 'center' : 'flex-start',
            padding: collapsed ? '10px 0' : '9px 14px',
            borderRadius: T.rBtn, border: 'none', background: 'transparent',
            color: T.muted, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: T.font, whiteSpace: 'nowrap',
          }}>
            {collapsed
              ? <ChevronsRight size={18} strokeWidth={1.8} style={{ flexShrink: 0 }} />
              : <ChevronsLeft  size={18} strokeWidth={1.8} style={{ flexShrink: 0 }} />}
            {!collapsed && 'Collapse'}
          </button>

          <button onClick={onLogout} title="Logout" style={{
            display: 'flex', alignItems: 'center', gap: 12,
            justifyContent: collapsed ? 'center' : 'flex-start',
            padding: collapsed ? '10px 0' : '9px 14px',
            borderRadius: T.rBtn, border: 'none', background: 'transparent',
            color: T.coral, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: T.font, whiteSpace: 'nowrap',
          }}>
            <LogOut size={18} strokeWidth={1.8} style={{ flexShrink: 0 }} />
            {!collapsed && 'Logout'}
          </button>
        </div>
      </aside>

      {/* ══ Main column: top bar + screen ══ */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, gap: 16 }}>

        {/* Top bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, minHeight: 48 }}>
          {active.searchPlaceholder ? (
            <div style={{
              ...card, borderRadius: 14, display: 'flex', alignItems: 'center', gap: 10,
              padding: '0 16px', height: 48, width: 320,
            }}>
              <Search size={17} strokeWidth={1.8} color={T.faint} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={active.searchPlaceholder}
                style={{
                  border: 'none', outline: 'none', flex: 1, fontSize: 13.5,
                  fontFamily: T.font, color: T.ink, background: 'transparent',
                }}
              />
            </div>
          ) : (
            <div style={{ fontSize: 22, fontWeight: 800 }}>My Profile</div>
          )}

          <div style={{ flex: 1 }} />

          {/* Staff chip */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 13, fontWeight: 800 }}>{user.name || 'Staff'}</div>
              <div style={{ fontSize: 10.5, color: T.muted }}>
                {clockIn ? `Clocked in at ${clockIn}` : (user.role === 'new_cashier' ? 'Cashier' : user.role || '')}
              </div>
            </div>
            <div style={{
              width: 40, height: 40, borderRadius: '50%', background: T.greenTint,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: T.greenDark, fontSize: 13, fontWeight: 800, flexShrink: 0,
            }}>
              {initials(user.name) || 'ST'}
            </div>
            <button title="Notifications" style={{
              position: 'relative', width: 40, height: 40, borderRadius: '50%',
              border: 'none', background: T.surface, boxShadow: T.cardShadow,
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}>
              <Bell size={17} strokeWidth={1.8} color={T.muted} />
              <span style={{
                position: 'absolute', top: 9, right: 10, width: 7, height: 7,
                borderRadius: '50%', background: T.green, border: '1.5px solid #fff',
              }} />
            </button>
          </div>
        </div>

        {/* Active screen */}
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          {Screen ? <Screen {...screenProps} /> : <Placeholder label={active.label} />}
        </div>
      </div>
    </div>
  );
}

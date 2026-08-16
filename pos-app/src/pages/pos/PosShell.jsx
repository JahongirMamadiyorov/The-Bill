import { useState, useEffect } from 'react';
import {
  LayoutGrid, ClipboardList, Clock, HandCoins, User,
  Search, Bell, Globe, ChevronsLeft, ChevronsRight, LogOut, Wifi, WifiOff, RefreshCw,
  CheckCircle2, XCircle, Loader, Copy, Check, X,
} from 'lucide-react';
import { T, card, initials } from './tokens.js';
import { TableIcon } from './icons.jsx';
import { useSettings } from './useSettings.js';
import { t, tt } from '../../lib/i18n.js';
import { isOpenNow } from '../../lib/businessDate.js';

// ─────────────────────────────────────────────────────────────────────────────
// POS Terminal shell — sidebar + top bar + active screen.
// Design: "Shell (all screens)" section of the design handoff README.
// Screens plug in via the SCREENS map; each receives { user, settings, setNav }.
// ─────────────────────────────────────────────────────────────────────────────

const NAV = [
  { key: 'menu',        label: 'Menu',        Icon: LayoutGrid,      searchPlaceholder: 'Search menu...' },
  { key: 'orders',      label: 'Orders',      Icon: ClipboardList,   searchPlaceholder: 'Search orders...' },
  { key: 'tables',      label: 'Tables',      Icon: TableIcon,       searchPlaceholder: 'Search tables...' },
  { key: 'history',     label: 'History',     Icon: Clock,           searchPlaceholder: 'Search history...' },
  { key: 'receivables', label: 'Receivables', Icon: HandCoins,       searchPlaceholder: 'Search receivables...' },
  { key: 'profile',     label: 'Profile',     Icon: User,            searchPlaceholder: null }, // "My Profile" title instead
];

function Placeholder({ label, lang }) {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.muted, fontSize: 15, fontWeight: 600 }}>
      {label} — {t('coming in a later build step', lang)}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Connection details panel (topbar badge → click). Added 2026-07-31.
//
// Why this exists: the badge collapses THREE independent checks (PowerSync
// connected · local data synced · Express backend reachable) into a single
// word, so a machine reporting "Offline" told us nothing about which one
// actually failed. That's exactly what made the other restaurants' machines
// undiagnosable — no terminal, no DevTools, no access to the machine at all.
// This panel breaks the three apart, shows the real error string main.js now
// keeps (see psLastError there), and offers a Copy button so a remote user can
// paste the whole state into a message instead of describing it.
//
// Purely diagnostic — it reads the same `sync` state the badge already had and
// changes nothing about how Online/Syncing/Offline is decided.
// ─────────────────────────────────────────────────────────────────────────────
function StatusRow({ label, ok, pending }) {
  const color = ok ? T.greenDark : pending ? T.amber : T.coral;
  const Icon  = ok ? CheckCircle2 : pending ? Loader : XCircle;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0',
      borderBottom: `1px solid ${T.line}`,
    }}>
      <Icon size={15} strokeWidth={2} color={color} />
      <span style={{ fontSize: 12, fontWeight: 600, color: T.ink, flex: 1 }}>{label}</span>
    </div>
  );
}

// Plain-text dump for the Copy button — deliberately English-only and
// unformatted: it's meant to be pasted back to whoever is supporting the
// machine, not read on screen (the panel above already does that, translated).
function syncDetailsText(sync, user, restaurant) {
  return [
    `The Bill POS — connection details`,
    `Time:            ${new Date().toISOString()}`,
    `Restaurant:      ${restaurant?.name || '—'} (id ${restaurant?.id ?? '—'})`,
    `User:            ${user?.name || '—'} (${user?.role || '—'})`,
    `PowerSync connected: ${sync.connected ? 'yes' : sync.connecting ? 'connecting' : 'no'}`,
    `Local data synced:   ${sync.hasSynced ? 'yes' : 'no'}`,
    `Backend reachable:   ${sync.backendUp ? 'yes' : 'no'}`,
    `Last synced:     ${sync.lastSyncedAt || 'never'}`,
    `Last checked:    ${sync.checkedAt ? sync.checkedAt.toISOString() : '—'}`,
    `PowerSync error: ${sync.psError || 'none'}`,
    `Backend error:   ${sync.backendError || 'none'}`,
    ``,
    `Connection event log (oldest first) — main.js pushPsEvent:`,
    ...((sync.events && sync.events.length)
      ? sync.events.map(e => `  ${e.at}  ${e.kind}${e.detail ? '  ' + e.detail : ''}`)
      : ['  (no events recorded)']),
  ].join('\n');
}

// Returns a Promise<boolean> so the button only shows "Copied" when it actually
// copied. navigator.clipboard.writeText REJECTS (async) rather than throwing, so a
// plain try/catch around it would silently miss the failure — and it does genuinely
// fail in Electron when the document isn't focused. The hidden-textarea +
// execCommand path is the fallback for exactly that case.
async function copySyncDetails(sync, user, restaurant) {
  const text = syncDetailsText(sync, user, restaurant);
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      // Both paths blocked — not fatal, the panel already shows the same errors
      // on screen, they just have to be read out instead of pasted.
      return false;
    }
  }
}

function SyncDetailsPanel({ sync, lang, copied, onCopy, onRecheck, onClose }) {
  const fmt = (iso) => {
    if (!iso) return t('Never', lang);
    const d = new Date(iso);
    return isNaN(d) ? String(iso) : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };
  const btn = {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: '8px 10px', borderRadius: T.rBtn, border: `1px solid ${T.line}`,
    background: T.surface, color: T.ink, fontFamily: T.font, fontSize: 11.5,
    fontWeight: 700, cursor: 'pointer',
  };
  return (
    <div style={{
      position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 60,
      width: 296, background: T.surface, borderRadius: T.rCard,
      boxShadow: T.modalShadow, padding: 14, fontFamily: T.font, textAlign: 'left',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: T.ink, flex: 1 }}>
          {t('Connection details', lang)}
        </span>
        <button onClick={onClose} title={t('Close', lang)} style={{
          border: 'none', background: 'transparent', cursor: 'pointer', padding: 2,
          display: 'flex', alignItems: 'center',
        }}>
          <X size={14} strokeWidth={2} color={T.muted} />
        </button>
      </div>

      <StatusRow label={t('PowerSync connected', lang)} ok={sync.connected} pending={sync.connecting} />
      <StatusRow label={t('Local data synced', lang)}   ok={sync.hasSynced}  pending={sync.connected && !sync.hasSynced} />
      <StatusRow label={t('Backend reachable', lang)}   ok={sync.backendUp} />

      {(sync.psError || sync.backendError) && (
        <div style={{
          marginTop: 10, padding: '8px 10px', borderRadius: T.rBtn,
          background: T.coralBg, color: T.coral, fontSize: 11, lineHeight: 1.45,
          wordBreak: 'break-word',
        }}>
          {sync.psError && <div><b>PowerSync:</b> {sync.psError}</div>}
          {sync.backendError && <div><b>{t('Backend', lang)}:</b> {sync.backendError}</div>}
        </div>
      )}

      <div style={{ marginTop: 10, fontSize: 10.5, color: T.muted, lineHeight: 1.6 }}>
        <div>{t('Last synced', lang)}: {fmt(sync.lastSyncedAt)}</div>
        <div>{t('Last checked', lang)}: {sync.checkedAt ? fmt(sync.checkedAt.toISOString()) : '—'}</div>
      </div>

      {/* Last few connection events, newest first — the whole point is answering
          "what happened between connecting and now", which no other part of this
          panel can show. Full log goes out via Copy details. */}
      {sync.events?.length > 0 && (
        <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${T.line}` }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: T.faint, marginBottom: 4 }}>
            {t('Recent events', lang)}
          </div>
          {sync.events.slice(-4).reverse().map((e, i) => (
            <div key={`${e.at}-${i}`} style={{
              fontSize: 10, lineHeight: 1.5, color: e.kind.includes('fail') || e.kind.includes('error') || e.kind === 'disconnected' ? T.coral : T.muted,
              wordBreak: 'break-word',
            }}>
              {fmt(e.at)} · <b>{e.kind}</b>{e.detail ? ` — ${e.detail}` : ''}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={onRecheck} style={btn}>
          <RefreshCw size={13} strokeWidth={2} color={T.muted} />
          {t('Re-check now', lang)}
        </button>
        <button onClick={onCopy} style={btn}>
          {copied
            ? <Check size={13} strokeWidth={2} color={T.greenDark} />
            : <Copy size={13} strokeWidth={2} color={T.muted} />}
          {t(copied ? 'Copied' : 'Copy details', lang)}
        </button>
      </div>
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
  const [sync, setSync]         = useState({
    connected: false, hasSynced: false, backendUp: false, checkedAt: null,
    connecting: false, lastSyncedAt: null, psError: null, backendError: null, events: [],
  });
  const [syncOpen, setSyncOpen] = useState(false); // badge details panel
  const [copied, setCopied]     = useState(false);

  useEffect(() => { localStorage.setItem('pos.sidebarCollapsed', collapsed ? '1' : '0'); }, [collapsed]);
  useEffect(() => { localStorage.setItem('pos.lang', lang); }, [lang]);
  useEffect(() => { setSearch(''); }, [nav]);

  // Topbar sync badge — checks TWO independent things, not one. PowerSync's
  // sync stream (psStatus) only tells you whether Menu/Orders/Tables' LOCAL
  // synced copy is current; it says nothing about whether the Express/Render
  // backend that History/Receivables/Profile hit directly via apiGet is
  // actually reachable. Those are genuinely separate services, so PowerSync
  // can be happily connected while the backend is down or slow — which
  // previously showed as a live contradiction: the topbar said "Online" while
  // History's own stale-data badge said "Offline — showing data from Xm ago"
  // (reported against a real screenshot). The badge now requires BOTH to be
  // healthy before it calls itself "Online"; if either is down, it's "Offline".
  const checkSync = async () => {
    try {
      const [s, health] = await Promise.all([
        window.electronAPI.psStatus(),
        window.electronAPI.backendHealth(),
      ]);
      setSync({
        connected:    !!s?.connected,
        hasSynced:    !!s?.hasSynced,
        backendUp:    !!health?.ok,
        checkedAt:    new Date(),
        // Diagnostics only — none of these affect the green/amber/red decision
        // below, they exist purely so the details panel can say WHICH leg failed.
        connecting:   !!s?.connecting,
        lastSyncedAt: s?.lastSyncedAt || null,
        psError:      s?.error || null,
        backendError: health?.error || null,
        events:       Array.isArray(s?.events) ? s.events : [],
      });
    } catch (err) {
      setSync({
        connected: false, hasSynced: false, backendUp: false, checkedAt: new Date(),
        connecting: false, lastSyncedAt: null,
        // The IPC call itself failed — worth showing, it's a different failure
        // mode from "PowerSync reported an error" and would otherwise look identical.
        psError: err?.message || 'Status check failed', backendError: null, events: [],
      });
    }
  };
  useEffect(() => {
    checkSync();
    const t = setInterval(checkSync, 5000);
    return () => clearInterval(t);
  }, []);

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
      display: 'flex', height: '100%', background: T.pageBg,
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
              <div style={{ fontSize: 10, color: T.faint, whiteSpace: 'nowrap' }}>{t('Restaurant management system', lang)}</div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
          {NAV.map(({ key, label, Icon }) => {
            const isActive = nav === key;
            return (
              <button key={key} onClick={() => setNav(key)} title={t(label, lang)} style={{
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
                {!collapsed && t(label, lang)}
              </button>
            );
          })}
        </nav>

        {/* Bottom: language / collapse / logout */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
          {/* UZ/EN segmented toggle */}
          {collapsed ? (
            <button onClick={() => setLang(l => (l === 'EN' ? 'UZ' : 'EN'))} title={`${t('Language', lang)}: ${lang}`} style={{
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

          <button onClick={() => setCollapsed(c => !c)} title={t(collapsed ? 'Expand' : 'Collapse', lang)} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            justifyContent: collapsed ? 'center' : 'flex-start',
            padding: collapsed ? '10px 0' : '9px 14px',
            borderRadius: T.rBtn, border: 'none', background: 'transparent',
            color: T.muted, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: T.font, whiteSpace: 'nowrap',
          }}>
            {collapsed
              ? <ChevronsRight size={18} strokeWidth={1.8} style={{ flexShrink: 0 }} />
              : <ChevronsLeft  size={18} strokeWidth={1.8} style={{ flexShrink: 0 }} />}
            {!collapsed && t('Collapse', lang)}
          </button>

          <button onClick={onLogout} title={t('Logout', lang)} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            justifyContent: collapsed ? 'center' : 'flex-start',
            padding: collapsed ? '10px 0' : '9px 14px',
            borderRadius: T.rBtn, border: 'none', background: 'transparent',
            color: T.coral, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: T.font, whiteSpace: 'nowrap',
          }}>
            <LogOut size={18} strokeWidth={1.8} style={{ flexShrink: 0 }} />
            {!collapsed && t('Logout', lang)}
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
                placeholder={t(active.searchPlaceholder, lang)}
                style={{
                  border: 'none', outline: 'none', flex: 1, fontSize: 13.5,
                  fontFamily: T.font, color: T.ink, background: 'transparent',
                }}
              />
            </div>
          ) : (
            <div style={{ fontSize: 22, fontWeight: 800 }}>{t('My Profile', lang)}</div>
          )}

          <div style={{ flex: 1 }} />

          {/* Sync status — requires BOTH PowerSync (local synced copy for
              Menu/Orders/Tables) AND the Express backend (History/Receivables/
              Profile, via apiGet) to be healthy before calling itself "Online" —
              see checkSync's comment above for why both matter. */}
          {(() => {
            const isOnline  = sync.connected && sync.hasSynced && sync.backendUp;
            const isSyncing = sync.connected && !sync.hasSynced;
            const color = isOnline ? T.greenDark : isSyncing ? T.amber : T.coral;
            return (
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => { setCopied(false); setSyncOpen(o => !o); checkSync(); }}
                  title={t('Click for connection details', lang)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 7, border: 'none', cursor: 'pointer',
                    background: T.surface, boxShadow: T.cardShadow, borderRadius: T.rPill,
                    padding: '7px 12px', fontFamily: T.font,
                  }}
                >
                  {isOnline
                    ? <Wifi size={14} strokeWidth={2} color={color} />
                    : isSyncing
                      ? <RefreshCw size={14} strokeWidth={2} color={color} />
                      : <WifiOff size={14} strokeWidth={2} color={color} />}
                  <span style={{ fontSize: 11, fontWeight: 800, color }}>
                    {t(isOnline ? 'Online' : isSyncing ? 'Syncing…' : 'Offline', lang)}
                  </span>
                </button>
                {syncOpen && (
                  <SyncDetailsPanel
                    sync={sync}
                    lang={lang}
                    copied={copied}
                    onCopy={() => { copySyncDetails(sync, user, restaurant).then(setCopied); }}
                    onRecheck={() => { setCopied(false); checkSync(); }}
                    onClose={() => setSyncOpen(false)}
                  />
                )}
              </div>
            );
          })()}

          {/* Staff chip */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 13, fontWeight: 800 }}>{user.name || t('Staff', lang)}</div>
              <div style={{ fontSize: 10.5, color: T.muted }}>
                {clockIn ? tt(lang, 'Clocked in at {time}', '{time} da ishga kelgan', { time: clockIn }) : (user.role === 'new_cashier' ? t('Cashier', lang) : user.role || '')}
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

        {/* Active screen.
            minWidth: 0 alongside minHeight: 0 (fixed 2026-08-02) — without it this
            flex item keeps its default `min-width: auto` and grows to fit whatever
            the screen renders, pushing the Cashier order panel off the right edge
            once a restaurant has enough categories/menu items. */}
        {/* Outside working hours — a statement, not an obstacle.
            Nothing is blocked: a shift that runs long is normal and the cashier
            must be able to keep serving. This exists so an unusual hour is
            VISIBLE, and because closing time now decides which business day a
            sale counts under — so a cashier working past close should know the
            takings are landing on the night that just ended. Silent when no
            hours are configured (`known: false`), so restaurants that never fill
            this in never see it. */}
        {(() => {
          const s = isOpenNow(settings?.workingHours);
          if (!s.known || s.open) return null;
          return (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '9px 14px', marginBottom: 12,
              background: T.amberBg, border: `1px solid ${T.amber}22`,
              borderRadius: T.rCard, color: T.amber,
              fontFamily: T.font, fontSize: 12.5, fontWeight: 700,
            }}>
              <Clock size={15} />
              <span>{t('Outside working hours — sales still count for the last open day', lang)}</span>
            </div>
          );
        })()}

        <div style={{ flex: 1, display: 'flex', minWidth: 0, minHeight: 0 }}>
          {Screen ? <Screen {...screenProps} /> : <Placeholder label={t(active.label, lang)} lang={lang} />}
        </div>
      </div>
    </div>
  );
}

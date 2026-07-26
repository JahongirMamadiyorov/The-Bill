import { useState, useEffect, useMemo } from 'react';
import { Loader2, Eye, TableProperties } from 'lucide-react';
import { camelizeRows } from '../../lib/case.js';
import { T, card, pill, statusPill, initials, fmtMoney } from './tokens.js';

// ─────────────────────────────────────────────────────────────────────────────
// Tables screen — floor plan overview. Design handoff screen 6.
// Zone pills come from the real table_sections (synced? no — sections live in
// restaurant_tables.section locally); status legend; 4-col table cards with
// the active order's waiter · elapsed · total on occupied tables.
// Tap a table with an active order → right panel shows that order (read-only
// summary; Edit/Charge happen on the Orders screen — setNav('orders')).
// All reads local PowerSync, polls every 4s.
// ─────────────────────────────────────────────────────────────────────────────

const ACTIVE_STATUSES = "('pending','sent_to_kitchen','preparing','ready','served','bill_requested')";

const elapsed = (iso) => {
  if (!iso) return '';
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
};

export default function TablesScreen({ user, settings, search, setNav }) {
  const symbol = settings.currencySymbol;
  const money  = (n) => fmtMoney(n, symbol);

  const [tables,     setTables]     = useState([]);
  const [orders,     setOrders]     = useState([]);
  const [itemsByOrd, setItemsByOrd] = useState({});
  const [menuById,   setMenuById]   = useState({});
  const [staff,      setStaff]      = useState({});
  const [loading,    setLoading]    = useState(true);
  const [zone,       setZone]       = useState(null);
  const [selectedId, setSelectedId] = useState(null); // table id

  const load = async (first = false) => {
    try {
      const [tbls, ords, users, mi] = await Promise.all([
        window.electronAPI.psGetAll('SELECT * FROM restaurant_tables ORDER BY table_number'),
        window.electronAPI.psGetAll(`SELECT * FROM orders WHERE status IN ${ACTIVE_STATUSES} ORDER BY created_at ASC`),
        window.electronAPI.psGetAll('SELECT id, name FROM users'),
        window.electronAPI.psGetAll('SELECT id, name, price FROM menu_items'),
      ]);
      setTables(camelizeRows(tbls));
      const orderRows = camelizeRows(ords);
      setOrders(orderRows);
      setStaff(Object.fromEntries(camelizeRows(users).map(u => [u.id, u.name])));
      setMenuById(Object.fromEntries(camelizeRows(mi).map(m => [m.id, m])));
      if (orderRows.length) {
        const ids = orderRows.map(o => `'${o.id}'`).join(',');
        const items = await window.electronAPI.psGetAll(`SELECT * FROM order_items WHERE order_id IN (${ids})`);
        const map = {};
        for (const it of camelizeRows(items)) (map[it.orderId] = map[it.orderId] || []).push(it);
        setItemsByOrd(map);
      } else setItemsByOrd({});
    } catch { /* keep last data */ }
    finally { if (first) setLoading(false); }
  };

  useEffect(() => {
    load(true);
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, []);

  // Latest active order per table
  const orderByTable = useMemo(() => {
    const map = {};
    for (const o of orders) if (o.tableId) map[o.tableId] = o; // ASC order → last write wins = newest
    return map;
  }, [orders]);

  const zones = useMemo(() => {
    const set = new Set();
    for (const tb of tables) if (tb.section) set.add(tb.section);
    return [...set];
  }, [tables]);

  const filtered = useMemo(() => {
    let list = tables;
    if (zone) list = list.filter(tb => tb.section === zone);
    if (search?.trim()) {
      const q = search.toLowerCase();
      list = list.filter(tb =>
        (tb.name || `table ${tb.tableNumber}`).toLowerCase().includes(q) ||
        String(tb.tableNumber).includes(q));
    }
    return list;
  }, [tables, zone, search]);

  const selTable = tables.find(tb => tb.id === selectedId) || null;
  const selOrder = selTable ? orderByTable[selTable.id] : null;
  const selItems = selOrder ? (itemsByOrd[selOrder.id] || []) : [];

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Loader2 size={34} color={T.green} style={{ animation: 'posspin 1s linear infinite' }} />
      <style>{`@keyframes posspin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  return (
    <div style={{ flex: 1, display: 'flex', gap: 16, minHeight: 0 }}>

      {/* ══ Main column ══ */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14, overflow: 'hidden' }}>

        {/* Zone pills + legend */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <ZonePill label="All" active={!zone} onClick={() => setZone(null)} />
          {zones.map(z => (
            <ZonePill key={z} label={z} active={zone === z} onClick={() => setZone(zone === z ? null : z)} />
          ))}
          <div style={{ flex: 1 }} />
          {[['Available', T.green], ['Occupied', T.coral], ['Reserved', T.amber], ['Needs Bill', T.blue]].map(([lbl, clr]) => (
            <span key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: T.muted }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: clr }} />{lbl}
            </span>
          ))}
        </div>

        {/* Table cards */}
        <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4 }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 60, textAlign: 'center', color: T.muted, fontSize: 14 }}>No tables</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(225px, 1fr))', gap: 14 }}>
              {filtered.map(tb => {
                const o = orderByTable[tb.id];
                const status = o && (tb.status === 'free' || !tb.status) ? 'occupied' : (tb.status || 'free');
                const sp = statusPill(o && status === 'occupied' && o.status === 'bill_requested' ? 'needs_bill' : status);
                const isSel = selectedId === tb.id;
                return (
                  <button key={tb.id} onClick={() => setSelectedId(tb.id)} style={{
                    ...card, textAlign: 'left', padding: 16, cursor: 'pointer', fontFamily: T.font,
                    border: isSel ? `2px solid ${T.green}` : '2px solid transparent',
                    display: 'flex', flexDirection: 'column', gap: 8,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 14.5, fontWeight: 800 }}>{tb.name || `Table ${tb.tableNumber}`}</span>
                      <span style={pill(sp)}>{sp.label}</span>
                    </div>
                    <div style={{ fontSize: 11.5, color: T.muted }}>{tb.capacity ? `${tb.capacity} seats` : ' '}</div>
                    {o && (
                      <div style={{
                        background: T.chipBg, borderRadius: 10, padding: '7px 10px',
                        fontSize: 11, fontWeight: 700, color: T.muted,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {(staff[o.waitressId] || '—')} · {elapsed(o.createdAt)} · {money(o.totalAmount)}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ══ Right panel — table's active order ══ */}
      <div style={{
        ...card, borderRadius: T.rCardLg, width: T.rightPanelW, flexShrink: 0,
        display: 'flex', flexDirection: 'column', padding: 18, overflow: 'hidden',
      }}>
        {!selTable ? (
          <Empty icon={<TableProperties size={34} strokeWidth={1.5} />} title="Select a table" sub="Tap a table card to see its order" />
        ) : !selOrder ? (
          <Empty
            icon={<TableProperties size={34} strokeWidth={1.5} />}
            title={selTable.name || `Table ${selTable.tableNumber}`}
            sub={`No active order — status: ${(selTable.status || 'free')}`}
            action={{ label: 'Start an order on Menu', onClick: () => setNav('menu') }}
          />
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 17, fontWeight: 800 }}>Order #{selOrder.dailyNumber || selOrder.id.slice(-4)}</span>
              <span style={pill(statusPill(selOrder.status))}>{statusPill(selOrder.status).label}</span>
            </div>
            <div style={{ fontSize: 11, color: T.muted, marginBottom: 12 }}>
              {(selTable.name || `Table ${selTable.tableNumber}`)} · {elapsed(selOrder.createdAt)} ago
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 10, borderBottom: `1px solid ${T.line}`, marginBottom: 10 }}>
              <span style={{
                width: 30, height: 30, borderRadius: 9, background: T.greenTint, color: T.greenDark,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 800,
              }}>
                {initials(staff[selOrder.waitressId] || '—')}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12.5, fontWeight: 800 }}>{staff[selOrder.waitressId] || '—'}</div>
                <div style={{ fontSize: 10, color: T.faint }}>Waiter</div>
              </div>
              <span style={{ fontSize: 11, color: T.faint, fontWeight: 700 }}>{selItems.length} items</span>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, marginBottom: 10 }}>
              {selItems.map(it => {
                const m = menuById[it.menuItemId] || {};
                const price = Number(it.unitPrice || m.price || 0);
                return (
                  <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {m.name || 'Item'} <span style={{ color: T.faint, fontWeight: 600 }}>×{Number(it.quantity || 1)}</span>
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 800, flexShrink: 0 }}>{money(price * Number(it.quantity || 1))}</span>
                  </div>
                );
              })}
            </div>

            <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 10, marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                <span style={{ fontSize: 12.5, color: T.muted, fontWeight: 600 }}>Sub Total</span>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: T.muted }}>
                  {money(Number(selOrder.totalAmount || 0) - Number(selOrder.taxAmount || 0))}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                <span style={{ fontSize: 12.5, color: T.muted, fontWeight: 600 }}>Tax & Fees</span>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: T.muted }}>{money(selOrder.taxAmount)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 6 }}>
                <span style={{ fontSize: 15, fontWeight: 800 }}>Total</span>
                <span style={{ fontSize: 19, fontWeight: 800 }}>{money(selOrder.totalAmount)}</span>
              </div>
            </div>

            {/* Edit / charge live on the Orders screen — jump there */}
            <button onClick={() => setNav('orders')} style={{
              padding: '13px 0', borderRadius: T.rBtn, border: 'none',
              background: T.green, color: '#fff', fontSize: 14, fontWeight: 800,
              cursor: 'pointer', fontFamily: T.font, display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: 8, transition: 'background .15s',
            }}
              onMouseEnter={e => e.currentTarget.style.background = T.greenDark}
              onMouseLeave={e => e.currentTarget.style.background = T.green}
            >
              <Eye size={16} strokeWidth={2} /> Open in Orders
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Bits ──────────────────────────────────────────────────────────────────────

function ZonePill({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: '8px 16px', borderRadius: T.rPill, border: 'none', cursor: 'pointer', fontFamily: T.font,
      background: active ? T.green : T.surface, color: active ? '#fff' : T.muted,
      fontSize: 12, fontWeight: 800, boxShadow: active ? 'none' : T.cardShadow,
      transition: 'background .15s, color .15s', flexShrink: 0,
    }}>
      {label}
    </button>
  );
}

function Empty({ icon, title, sub, action }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: T.faint, gap: 8 }}>
      {icon}
      <div style={{ fontSize: 13.5, fontWeight: 700, color: T.muted }}>{title}</div>
      <div style={{ fontSize: 11.5 }}>{sub}</div>
      {action && (
        <button onClick={action.onClick} style={{
          marginTop: 10, padding: '9px 18px', borderRadius: T.rBtn, border: 'none',
          background: T.greenTint, color: T.greenDark, fontSize: 12.5, fontWeight: 800,
          cursor: 'pointer', fontFamily: T.font,
        }}>
          {action.label}
        </button>
      )}
    </div>
  );
}

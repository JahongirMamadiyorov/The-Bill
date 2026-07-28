import { useEffect, useState } from 'react';

// Placeholder landing screen per role — proves login + routing + PowerSync all work end to
// end. Gets replaced by the real screen for each role in its corresponding build phase (see
// STATUS.md / TaskList: Phase 1 Cashier, Phase 1b New Waiter, Phase 2 Kitchen, Phase 3 Admin,
// Phase 4 Owner).
export default function RolePlaceholder({ title, onLogout }) {
  const [status, setStatus]   = useState(null);
  const [restaurant, setRestaurant] = useState(null);
  const [menuCount, setMenuCount]   = useState(null);
  const [error, setError]     = useState('');

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const s = await window.electronAPI.psStatus();
        if (cancelled) return;
        setStatus(s);

        if (s.hasSynced) {
          const rows = await window.electronAPI.psGetAll('SELECT * FROM restaurants LIMIT 1');
          const count = await window.electronAPI.psGet('SELECT COUNT(*) as n FROM menu_items');
          if (!cancelled) {
            setRestaurant(rows?.[0] || null);
            setMenuCount(count?.n ?? 0);
          }
        }
      } catch (err) {
        if (!cancelled) setError(err.message || String(err));
      }
    }

    poll();
    const interval = setInterval(poll, 2000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  async function handleLogout() {
    await window.electronAPI.logout();
    onLogout();
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <h1>{title}</h1>
      <p style={{ color: '#777' }}>This screen is not built yet — Phase 0 foundation only.</p>

      <div style={{ background: '#f4f6fb', borderRadius: 12, padding: '16px 24px', minWidth: 320, fontSize: 14 }}>
        <div><strong>PowerSync status:</strong> {status ? (status.connected ? 'connected' : 'connecting…') : 'checking…'}</div>
        <div><strong>Initial sync complete:</strong> {status?.hasSynced ? 'yes' : 'not yet'}</div>
        {restaurant && <div style={{ marginTop: 8 }}><strong>Synced restaurant:</strong> {restaurant.name}</div>}
        {menuCount !== null && <div><strong>Synced menu items:</strong> {menuCount}</div>}
        {error && <div style={{ color: '#c0392b', marginTop: 8 }}>Error: {error}</div>}
      </div>

      <button onClick={handleLogout} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: '#eee', cursor: 'pointer' }}>
        Log out
      </button>
    </div>
  );
}

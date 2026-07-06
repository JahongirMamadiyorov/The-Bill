// Placeholder landing screen per role — proves login + routing works end to end.
// Gets replaced by the real screen for each role in its corresponding build phase
// (see STATUS.md / TaskList: Phase 1 Cashier, Phase 1b New Waiter, Phase 2 Kitchen,
// Phase 3 Admin, Phase 4 Owner).
export default function RolePlaceholder({ title, onLogout }) {
  async function handleLogout() {
    await window.electronAPI.logout();
    onLogout();
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <h1>{title}</h1>
      <p style={{ color: '#777' }}>This screen is not built yet — Phase 0 foundation only.</p>
      <button onClick={handleLogout} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: '#eee', cursor: 'pointer' }}>
        Log out
      </button>
    </div>
  );
}

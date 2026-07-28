import { useEffect, useState, Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login.jsx';
import RolePlaceholder from './pages/RolePlaceholder.jsx';
import PosCashier from './pages/pos/PosCashier.jsx';
import TitleBar from './TitleBar.jsx';

// Lazy-loaded: the Admin panel pulls in Tailwind utilities + a much larger
// screen set than the cashier bundle. Code-splitting it means cashier/kitchen/
// waiter logins never pay for Admin's JS or CSS — direct application of the
// "speed up to the maximum" instruction for this build phase.
const AdminPanel = lazy(() => import('./pages/admin/AdminPanel.jsx'));

// Phase 0: prove the shell + auth loop works end to end. Each role below gets its
// real screen built out in later phases (see STATUS.md at the project root).
function defaultRouteFor(role) {
  switch (role) {
    case 'admin':
    case 'owner':      return '/admin';
    case 'new_cashier': return '/pos';
    case 'cashier':     return '/cashier';
    case 'kitchen':     return '/kitchen';
    case 'new_waiter':  return '/waiter';
    default:            return '/login';
  }
}

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = loading, null = logged out

  useEffect(() => {
    let cancelled = false;
    window.electronAPI?.getSession().then((s) => {
      if (!cancelled) setSession(s);
    });
    return () => { cancelled = true; };
  }, []);

  const role = session?.user?.role;

  // TitleBar renders unconditionally (even during the initial session check)
  // so the window is always movable/closable, not just once logged in.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <TitleBar />
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {session === undefined ? (
          <CenteredMessage text="Loading…" />
        ) : (
          <Routes>
            <Route
              path="/login"
              element={
                session
                  ? <Navigate to={defaultRouteFor(role)} replace />
                  : <Login onLoggedIn={(s) => setSession(s)} />
              }
            />
            <Route path="/admin"   element={<Guard session={session}><Suspense fallback={<CenteredMessage text="Loading…" />}><AdminPanel session={session} onLogout={() => setSession(null)} /></Suspense></Guard>} />
            <Route path="/cashier" element={<Guard session={session}><RolePlaceholder title="Cashier" onLogout={() => setSession(null)} /></Guard>} />
            <Route path="/pos"     element={<Guard session={session}><PosCashier session={session} onLogout={() => setSession(null)} /></Guard>} />
            <Route path="/kitchen" element={<Guard session={session}><RolePlaceholder title="Kitchen" onLogout={() => setSession(null)} /></Guard>} />
            <Route path="/waiter"  element={<Guard session={session}><RolePlaceholder title="New Waiter" onLogout={() => setSession(null)} /></Guard>} />
            <Route path="*" element={<Navigate to={session ? defaultRouteFor(role) : '/login'} replace />} />
          </Routes>
        )}
      </div>
    </div>
  );
}

function Guard({ session, children }) {
  if (!session) return <Navigate to="/login" replace />;
  return children;
}

function CenteredMessage({ text }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 18, color: '#666' }}>
      {text}
    </div>
  );
}

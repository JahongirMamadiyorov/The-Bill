import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login.jsx';
import RolePlaceholder from './pages/RolePlaceholder.jsx';

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

  if (session === undefined) {
    return <CenteredMessage text="Loading…" />;
  }

  const role = session?.user?.role;

  return (
    <Routes>
      <Route
        path="/login"
        element={
          session
            ? <Navigate to={defaultRouteFor(role)} replace />
            : <Login onLoggedIn={(s) => setSession(s)} />
        }
      />
      <Route path="/admin"   element={<Guard session={session}><RolePlaceholder title="Admin / Owner" onLogout={() => setSession(null)} /></Guard>} />
      <Route path="/cashier" element={<Guard session={session}><RolePlaceholder title="Cashier" onLogout={() => setSession(null)} /></Guard>} />
      <Route path="/pos"     element={<Guard session={session}><RolePlaceholder title="New Cashier (POS)" onLogout={() => setSession(null)} /></Guard>} />
      <Route path="/kitchen" element={<Guard session={session}><RolePlaceholder title="Kitchen" onLogout={() => setSession(null)} /></Guard>} />
      <Route path="/waiter"  element={<Guard session={session}><RolePlaceholder title="New Waiter" onLogout={() => setSession(null)} /></Guard>} />
      <Route path="*" element={<Navigate to={session ? defaultRouteFor(role) : '/login'} replace />} />
    </Routes>
  );
}

function Guard({ session, children }) {
  if (!session) return <Navigate to="/login" replace />;
  return children;
}

function CenteredMessage({ text }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontSize: 18, color: '#666' }}>
      {text}
    </div>
  );
}

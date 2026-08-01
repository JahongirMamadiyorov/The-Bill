import { useEffect, useState, Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login.jsx';
import RolePlaceholder from './pages/RolePlaceholder.jsx';
import PosCashier from './pages/pos/PosCashier.jsx';
import TitleBar from './TitleBar.jsx';
import { t } from './lib/i18n.js';

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
  // A session RESTORED FROM DISK at app launch must be explicitly confirmed before any
  // screen/data renders — added after a real incident where a saved session from one
  // computer ended up active on a different one (root cause unconfirmed — could be a
  // cloned machine/image reusing old local state), and the affected terminal silently
  // showed a completely different restaurant's cashier panel with no indication anything
  // was wrong. This does not explain or fix how that saved session got there, but it makes
  // it impossible to silently continue on the wrong account: every app launch that resumes
  // a saved session requires one explicit tap before it's used for anything. A FRESH login
  // (just typed a password) does NOT need to re-confirm — see handleLoggedIn below.
  const [resumeConfirmed, setResumeConfirmed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    window.electronAPI?.getSession().then((s) => {
      if (!cancelled) setSession(s);
      // resumeConfirmed intentionally stays false here.
    });
    return () => { cancelled = true; };
  }, []);

  const handleLoggedIn = (s) => {
    setSession(s);
    setResumeConfirmed(true); // just typed a password — nothing to reconfirm
  };

  // Must go through the main process, not just reset React state. Until 2026-07-31 this
  // function did ONLY the two setState calls below — so every in-app Logout button (the
  // POS shell, Admin panel, Kitchen, Waiter — see the routes below, all of which pass
  // this as onLogout) left the saved session sitting in electron-store AND left every
  // synced row in the local PowerSync database. The app would then resume as that same
  // user on the next launch, and the next person to use the machine could read the
  // previous restaurant's data. Only SessionResume's "Not you? Log out" ever called the
  // IPC. auth:logout is what deletes the session, drops the psOwner marker and runs
  // disconnectAndClear(), so it has to happen on every logout path, not one of them.
  const handleLogout = async () => {
    try { await window.electronAPI?.logout(); }
    catch { /* clear the UI regardless — a failed IPC must not trap the user in a session */ }
    setSession(null);
    setResumeConfirmed(false);
  };

  const role = session?.user?.role;
  const needsResumeConfirm = !!session && !resumeConfirmed;

  // TitleBar renders unconditionally (even during the initial session check)
  // so the window is always movable/closable, not just once logged in.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <TitleBar />
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {session === undefined ? (
          <CenteredMessage text="Loading…" />
        ) : needsResumeConfirm ? (
          <SessionResume
            session={session}
            onContinue={() => setResumeConfirmed(true)}
            // handleLogout now calls the logout IPC itself, so this no longer
            // needs its own copy of that call (which would log out twice).
            onLogout={handleLogout}
          />
        ) : (
          <Routes>
            <Route
              path="/login"
              element={
                session
                  ? <Navigate to={defaultRouteFor(role)} replace />
                  : <Login onLoggedIn={handleLoggedIn} />
              }
            />
            <Route path="/admin"   element={<Guard session={session}><Suspense fallback={<CenteredMessage text="Loading…" />}><AdminPanel session={session} onLogout={handleLogout} /></Suspense></Guard>} />
            <Route path="/cashier" element={<Guard session={session}><RolePlaceholder title="Cashier" onLogout={handleLogout} /></Guard>} />
            <Route path="/pos"     element={<Guard session={session}><PosCashier session={session} onLogout={handleLogout} /></Guard>} />
            <Route path="/kitchen" element={<Guard session={session}><RolePlaceholder title="Kitchen" onLogout={handleLogout} /></Guard>} />
            <Route path="/waiter"  element={<Guard session={session}><RolePlaceholder title="New Waiter" onLogout={handleLogout} /></Guard>} />
            <Route path="*" element={<Navigate to={session ? defaultRouteFor(role) : '/login'} replace />} />
          </Routes>
        )}
      </div>
    </div>
  );
}

// Shown once per app launch whenever a saved session is restored from disk, before any
// screen/data is visible — see the `resumeConfirmed` comment above for why this exists.
// Deliberately plain-inline-styled + uses lib/i18n.js directly (same reasoning as
// Login.jsx's own header comment): neither of the app's two role-scoped i18n systems is
// mounted yet at this point.
function SessionResume({ session, onContinue, onLogout }) {
  const lang = (localStorage.getItem('pos.lang') === 'EN' || localStorage.getItem('lang') === 'en') ? 'EN' : 'UZ';
  const userName   = session?.user?.name || session?.user?.email || session?.user?.phone || '—';
  const restaurant = session?.restaurant?.name || '';

  return (
    <div style={{
      height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #7b2ff7, #38b6ff)',
    }}>
      <div style={{
        width: 380, background: '#fff', borderRadius: 16, padding: '32px 28px',
        boxShadow: '0 20px 50px rgba(0,0,0,0.25)', textAlign: 'center',
      }}>
        <div style={{ fontSize: 15, color: '#777', marginBottom: 6 }}>
          {t('A saved session was found on this device', lang)}
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 2 }}>{userName}</div>
        {restaurant && <div style={{ fontSize: 14, color: '#999', marginBottom: 20 }}>{restaurant}</div>}

        <button
          onClick={onContinue}
          style={{
            width: '100%', padding: '12px', borderRadius: 10, border: 'none',
            background: '#7b2ff7', color: '#fff', fontSize: 15, fontWeight: 600,
            cursor: 'pointer', marginTop: restaurant ? 0 : 20,
          }}
        >
          {t('Continue as', lang)} {userName}
        </button>
        <button
          onClick={onLogout}
          style={{
            width: '100%', padding: '12px', borderRadius: 10, border: '1px solid #ddd',
            background: '#fff', color: '#c0392b', fontSize: 15, fontWeight: 600,
            cursor: 'pointer', marginTop: 10,
          }}
        >
          {t('Not you? Log out', lang)}
        </button>
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

import { useEffect, useState } from 'react';
import { Minus, Square, Copy, X } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Custom title bar — the window is created with `frame: false` (main.js,
// "kiosk-friendly: no native menu/frame chrome"), which means Electron draws
// NO title bar at all: no minimize/maximize/close buttons, and no draggable
// region to move the window with. That was fine for a locked-down kiosk, but
// this app is meant to still run on regular back-office PCs too, and users
// found there was genuinely no way to move, minimize, resize, or close the
// window from the UI. Rather than turn the native frame back on (which would
// bring back the OS's own title bar styling, clashing with the app's design),
// this renders a slim custom one and wires it to real window control IPC
// (see main.js's window:minimize/maximize/close/isMaximized handlers).
//
// Rendered once at the very top of App.jsx, above the router — so it's
// present on every screen (Login, Admin/Kitchen/Waiter placeholders, the POS
// cashier shell), not just inside the POS. Its height is fixed (see TITLEBAR_H
// below) and every page underneath was changed from `height: '100vh'` to
// `height: '100%'` so they fill the remaining space instead of re-claiming a
// fresh full-viewport height and overflowing the window by this bar's height.
// ─────────────────────────────────────────────────────────────────────────────

export const TITLEBAR_H = 32;

export default function TitleBar() {
  const [isMax, setIsMax] = useState(false);

  useEffect(() => {
    let cancelled = false;
    window.electronAPI?.windowIsMaximized?.().then((v) => { if (!cancelled) setIsMax(!!v); });
    const unsubscribe = window.electronAPI?.onWindowMaximizedChange?.((v) => setIsMax(!!v));
    return () => { cancelled = true; unsubscribe?.(); };
  }, []);

  // Not running inside Electron (e.g. `vite dev` opened directly in a browser
  // tab for quick UI iteration) — window.electronAPI won't exist, and there's
  // a real browser chrome already, so render nothing rather than dead buttons.
  if (typeof window !== 'undefined' && !window.electronAPI) return null;

  return (
    <div
      style={{
        height: TITLEBAR_H, flexShrink: 0, display: 'flex', alignItems: 'center',
        justifyContent: 'flex-end', background: '#FFFFFF', borderBottom: '1px solid #EEF1F1',
        WebkitAppRegion: 'drag', userSelect: 'none', fontFamily: `'Plus Jakarta Sans', system-ui, sans-serif`,
      }}
      onDoubleClick={() => window.electronAPI?.windowMaximize?.()}
    >
      {/* No app label here on purpose — every page under this bar already
          shows the app name/logo itself (POS sidebar, Login card, etc.), so
          this stays a plain, unbranded control strip instead of repeating it. */}
      <div style={{ display: 'flex', height: '100%', WebkitAppRegion: 'no-drag' }}>
        <TitleBarBtn onClick={() => window.electronAPI?.windowMinimize?.()} label="Minimize">
          <Minus size={14} strokeWidth={2} />
        </TitleBarBtn>
        <TitleBarBtn onClick={() => window.electronAPI?.windowMaximize?.()} label={isMax ? 'Restore' : 'Maximize'}>
          {isMax ? <Copy size={12.5} strokeWidth={2} /> : <Square size={12} strokeWidth={2} />}
        </TitleBarBtn>
        <TitleBarBtn onClick={() => window.electronAPI?.windowClose?.()} label="Close" danger>
          <X size={15} strokeWidth={2} />
        </TitleBarBtn>
      </div>
    </div>
  );
}

function TitleBarBtn({ onClick, label, danger, children }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      style={{
        width: 46, height: '100%', border: 'none', background: 'transparent',
        color: '#7C8792', cursor: 'pointer', display: 'flex', alignItems: 'center',
        justifyContent: 'center', transition: 'background .1s, color .1s',
        // Redundant with the wrapper's no-drag above, but Chromium's drag-region
        // hit-test is a real place bugs hide (esp. after a hot-reload without a
        // full app restart) — setting it again directly on the clickable element
        // is cheap insurance against a click being swallowed as "start dragging".
        WebkitAppRegion: 'no-drag',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = danger ? '#E14F45' : '#F5F7F6';
        e.currentTarget.style.color = danger ? '#fff' : '#1E2433';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = '#7C8792';
      }}
    >
      {children}
    </button>
  );
}

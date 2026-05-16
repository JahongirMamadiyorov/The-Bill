/**
 * useKitchenPrint.js
 * ─────────────────────────────────────────────────────────────────────────────
 * WebSocket hook — connects the browser directly to the Render backend WS.
 *
 * On Vercel (production): the hook connects to wss://the-bill-backend.onrender.com/ws
 *   and simply logs received events. Actual printing is handled by the standalone
 *   print-agent running on the LAN (see /print-agent/index.js).
 *
 * On localhost (Vite dev): the hook also tries POST /print-tcp as a bonus so
 *   developers can test printing without running the print agent.
 *
 * Set VITE_WS_URL in your Vercel project env vars:
 *   VITE_WS_URL=wss://the-bill-backend.onrender.com
 */

import { useEffect, useRef, useCallback } from 'react';
import { buildKitchenTicket, groupItemsByStation, uint8ToBase64 } from '../utils/kitchenEscPos';

const ACTIVE_ROLES    = ['cashier', 'admin', 'owner'];
const RECONNECT_DELAY = 5_000;

// Connect directly to Render WS — never through Vercel
// VITE_WS_URL must be set in Vercel env vars: wss://the-bill-backend.onrender.com
const WS_BASE = import.meta.env.VITE_WS_URL || 'wss://the-bill-backend.onrender.com';

// Only attempt /print-tcp when running the Vite dev server locally
const IS_LOCAL = window.location.hostname === 'localhost' ||
                 window.location.hostname === '127.0.0.1' ||
                 /^192\.168\./.test(window.location.hostname);

// When running inside the Electron desktop app, printer.js in the main process
// owns the WebSocket connection and handles all printing. Skip this hook entirely
// to avoid two connections competing with the same token.
const IS_ELECTRON = typeof window !== 'undefined' && !!window.electronAPI?.isElectron;

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useKitchenPrint({ token, role, kitchenPrinters = [] }) {
  const wsRef        = useRef(null);
  const printersRef  = useRef(kitchenPrinters);
  const reconnectRef = useRef(null);
  const mountedRef   = useRef(true);

  useEffect(() => { printersRef.current = kitchenPrinters; }, [kitchenPrinters]);

  // ── Print handler ─────────────────────────────────────────────────────────
  const handlePrintEvent = useCallback(async ({ order, items }) => {
    // On Vercel the print-agent handles printing — log here so the console
    // shows the event arrived (useful for debugging).
    console.log('[kitchenPrint] Event received — order', order?.daily_number, '|', items?.length, 'items');

    if (!IS_LOCAL) return; // print-agent handles this on production

    const printers = printersRef.current;
    if (!Array.isArray(printers) || printers.length === 0) return;

    const groups = groupItemsByStation(items);

    for (const [station, stationItems] of Object.entries(groups)) {
      const printer =
        printers.find(p =>
          Array.isArray(p.stations) &&
          p.stations.some(s => s.toLowerCase() === station.toLowerCase())
        ) ||
        (station === 'default'
          ? printers.find(p => !p.stations || p.stations.length === 0) || printers[0]
          : null);

      if (!printer || !printer.ip) continue;

      try {
        const ticket = buildKitchenTicket({
          order,
          items:        stationItems,
          stationLabel: station !== 'default' ? station : (printer.name || 'Kitchen'),
        });
        await fetch('/print-tcp', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            ip:   printer.ip,
            port: printer.port || 9100,
            data: uint8ToBase64(ticket),
          }),
        });
      } catch (err) {
        console.warn(`[kitchenPrint] /print-tcp failed (${printer.ip}):`, err.message);
      }
    }
  }, []);

  // ── WebSocket connection ──────────────────────────────────────────────────
  const connect = useCallback(() => {
    if (!mountedRef.current || !token) return;
    if (wsRef.current && wsRef.current.readyState < WebSocket.CLOSING) return;

    const url = `${WS_BASE}/ws?token=${token}`;
    const ws  = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[kitchenPrint] WebSocket connected to', WS_BASE);
      if (reconnectRef.current) { clearTimeout(reconnectRef.current); reconnectRef.current = null; }
    };

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'kitchen_print') handlePrintEvent(msg);
      } catch (_) {}
    };

    ws.onclose = (evt) => {
      if (!mountedRef.current) return;
      if (evt.code !== 1000 && evt.code !== 4001) {
        console.log(`[kitchenPrint] WS closed (${evt.code}), retrying in ${RECONNECT_DELAY / 1000}s…`);
        reconnectRef.current = setTimeout(connect, RECONNECT_DELAY);
      }
    };

    ws.onerror = () => {};
  }, [token, handlePrintEvent]);

  useEffect(() => {
    // In Electron, printer.js handles the WebSocket — don't compete with it
    if (!ACTIVE_ROLES.includes(role) || !token || IS_ELECTRON) return;
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (wsRef.current) wsRef.current.close(1000, 'unmount');
    };
  }, [role, token, connect]);
}

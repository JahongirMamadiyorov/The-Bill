/**
 * useKitchenPrint.js
 * ─────────────────────────────────────────────────────────────────────────────
 * WebSocket hook for real-time kitchen printing.
 *
 * How it works:
 *   1. Connects to /ws?token=JWT (Vite dev-server proxies this to Render).
 *   2. Render broadcasts a { type:'kitchen_print', order, items } event
 *      whenever a new order or new items are placed — from ANY client
 *      (website, mobile app, etc.).
 *   3. This hook receives that event, groups items by station, builds an
 *      ESC/POS ticket per station, then POSTs { ip, port, data } to the
 *      Vite-local /print-tcp middleware which opens a raw TCP socket to
 *      the thermal printer on the LAN.
 *
 * Active roles: cashier, admin, owner.
 * The hook is called in Layout.jsx so it runs as long as the panel is open.
 *
 * Usage (in Layout.jsx):
 *   useKitchenPrint({ token, role, kitchenPrinters });
 */

import { useEffect, useRef, useCallback } from 'react';
import { buildKitchenTicket, groupItemsByStation, uint8ToBase64 } from '../utils/kitchenEscPos';

// These roles keep the cashier panel open as their primary screen
const ACTIVE_ROLES = ['cashier', 'admin', 'owner'];

// Reconnect delay after unexpected close (ms)
const RECONNECT_DELAY = 5_000;

// ── Hook ──────────────────────────────────────────────────────────────────────
/**
 * @param {object} params
 * @param {string}  params.token           - JWT auth token from AuthContext
 * @param {string}  params.role            - User role
 * @param {Array}   params.kitchenPrinters - Array from restaurant_settings.kitchen_printers
 *                  Each entry: { name, ip, port, stations: string[] }
 */
export function useKitchenPrint({ token, role, kitchenPrinters = [] }) {
  const wsRef        = useRef(null);
  const printersRef  = useRef(kitchenPrinters);
  const reconnectRef = useRef(null);
  const mountedRef   = useRef(true);

  // Keep printers ref in sync without causing reconnects
  useEffect(() => {
    printersRef.current = kitchenPrinters;
  }, [kitchenPrinters]);

  // ── Print handler (stable — reads from ref, never recreated) ─────────────
  const handlePrintEvent = useCallback(async ({ order, items }) => {
    const printers = printersRef.current;
    if (!Array.isArray(printers) || printers.length === 0) return;

    const groups = groupItemsByStation(items);

    for (const [station, stationItems] of Object.entries(groups)) {
      // Find the printer assigned to this station
      // camelCase comes from axios interceptor (kitchenPrinters → stations array)
      const printer =
        printers.find(p =>
          Array.isArray(p.stations) &&
          p.stations.some(s => s.toLowerCase() === station.toLowerCase())
        ) ||
        // Items with no station go to the first printer that has no station filter,
        // OR to the very first printer as a fallback
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
        const data = uint8ToBase64(ticket);

        const res = await fetch('/print-tcp', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ ip: printer.ip, port: printer.port || 9100, data }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          console.warn(`[kitchenPrint] Printer ${printer.ip} error:`, err.error || res.status);
        }
      } catch (err) {
        console.warn(`[kitchenPrint] TCP send failed (${printer.ip}):`, err.message);
      }
    }
  }, []); // stable — reads printersRef, never depends on state

  // ── WebSocket connection ──────────────────────────────────────────────────
  const connect = useCallback(() => {
    if (!mountedRef.current || !token) return;
    // Don't double-connect
    if (wsRef.current && wsRef.current.readyState < WebSocket.CLOSING) return;

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url   = `${proto}//${window.location.host}/ws?token=${token}`;
    const ws    = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[kitchenPrint] WebSocket connected');
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }
    };

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'kitchen_print') {
          handlePrintEvent(msg);
        }
      } catch (_) {}
    };

    ws.onclose = (evt) => {
      if (!mountedRef.current) return;
      // 1000 = normal close, 4001 = auth failure — don't retry those
      if (evt.code !== 1000 && evt.code !== 4001) {
        console.log(`[kitchenPrint] WS closed (${evt.code}), retrying in ${RECONNECT_DELAY / 1000}s…`);
        reconnectRef.current = setTimeout(connect, RECONNECT_DELAY);
      }
    };

    ws.onerror = () => {
      // onclose always fires after onerror — reconnect logic lives there
    };
  }, [token, handlePrintEvent]);

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!ACTIVE_ROLES.includes(role) || !token) return;

    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (wsRef.current) wsRef.current.close(1000, 'unmount');
    };
  }, [role, token, connect]);
}

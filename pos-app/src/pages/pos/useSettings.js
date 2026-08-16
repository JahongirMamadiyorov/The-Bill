import { useState, useEffect } from 'react';

// Restaurant settings (currency symbol, tax, service charge, receipt options).
// Not in the PowerSync schema, so this comes from the backend over HTTPS
// (read-only apiGet) and is cached in localStorage so the POS still knows the
// currency/service-charge config when it starts offline.
//
// Backend fields are snake_case (restaurant_settings table) — translated here
// once so every screen uses camelCase, same convention as lib/case.js.

const CACHE_KEY = 'pos.restaurantSettings';

const DEFAULTS = {
  restaurantName: null,
  // Per-weekday hours (2026-08-17). Empty = not configured, which every consumer
  // must treat as "midnight boundary, always open" — i.e. unchanged behaviour.
  workingHours: {},
  currencySymbol: "so'm",
  taxRate: 0,
  taxEnabled: false,
  serviceChargeRate: 0,
  serviceChargeEnabled: false,
  receiptShowServiceCharge: true,
  // Receipt printing (see printEngine.js buildReceipt / src/lib/receipt.js).
  // Same raw-JSONB shape as kitchenPrinters below, minus `stations` — a receipt
  // printer has no station routing, and only the FIRST configured one is used.
  receiptHeader: '',
  receiptFooter: '',
  receiptPrinters: [],
  receiptAutoPrint: true,
  receiptShow: {
    logo: true,
    orderNumber: true,
    tableName: true,
    tax: true,
    serviceCharge: true,
    footer: true,
  },
  // Kitchen printing (see pos-app/printEngine.js) — printers is the raw JSONB
  // array as stored (each entry already flat/lowercase: {id,name,ip,port,
  // stations}, no snake_case translation needed, see AdminRestaurantSettings.jsx
  // on the website, which is what actually writes these). `show` mirrors only
  // the flags kitchenPrint.js's ticket builder actually wires up today
  // (tableName/orderNumber/customerName/orderType) — `kitchen_show_notes` and
  // `kitchen_show_qty_unit` exist as DB columns but are dead/unused even in
  // the backend's own ticket builder, so they're deliberately not exposed
  // here either — this is parity with current real behavior, not an omission.
  kitchenPrinters: [],
  kitchenShow: {
    tableName: true,
    orderNumber: true,
    customerName: true,
    orderType: true,
  },
};

function translate(row) {
  if (!row || typeof row !== 'object') return DEFAULTS;
  return {
    restaurantName:           row.restaurant_name ?? null,
    // Kept as the raw object. Guarded because an array or null here would make
    // the business-day lookups throw on every screen that reads it.
    workingHours: (row.working_hours && typeof row.working_hours === 'object'
      && !Array.isArray(row.working_hours)) ? row.working_hours : {},
    currencySymbol:           row.currency_symbol || "so'm",
    taxRate:                  Number(row.tax_rate || 0),
    taxEnabled:               row.tax_enabled === true,
    serviceChargeRate:        Number(row.service_charge_rate || 0),
    serviceChargeEnabled:     row.service_charge_enabled === true,
    receiptShowServiceCharge: row.receipt_show_service_charge !== false,
    // ── Receipt printing (added 2026-08-02) ──────────────────────────────────
    // All of these come straight off `GET /api/settings`, which is a plain
    // SELECT * — so no sync-rules change was needed even though the
    // receipt_show_* columns are absent from the Sync Streams column list.
    receiptHeader:   row.receipt_header || '',
    receiptFooter:   row.receipt_footer || '',
    receiptPrinters: Array.isArray(row.receipt_printers) ? row.receipt_printers : [],
    // Defaults TRUE (matching the DB default and the website, which always
    // printed on payment) — so `=== false` rather than `!== true`.
    receiptAutoPrint: row.receipt_auto_print !== false,
    receiptShow: {
      logo:          row.receipt_show_logo          !== false,
      orderNumber:   row.receipt_show_order_number  !== false,
      tableName:     row.receipt_show_table_name    !== false,
      tax:           row.receipt_show_tax           !== false,
      serviceCharge: row.receipt_show_service_charge !== false,
      footer:        row.receipt_show_footer        !== false,
    },
    kitchenPrinters: Array.isArray(row.kitchen_printers) ? row.kitchen_printers : [],
    kitchenShow: {
      tableName:    row.kitchen_show_table_name    !== false,
      orderNumber:  row.kitchen_show_order_number  !== false,
      customerName: row.kitchen_show_customer_name !== false,
      orderType:    row.kitchen_show_order_type    !== false,
    },
  };
}

export function useSettings() {
  const [settings, setSettings] = useState(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      return cached ? { ...DEFAULTS, ...JSON.parse(cached) } : DEFAULTS;
    } catch { return DEFAULTS; }
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await window.electronAPI.apiGet('/api/settings');
        if (!alive || !res?.ok) return;
        const next = translate(res.data);
        setSettings(next);
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(next)); } catch {}
      } catch { /* offline — cached/default values stay in effect */ }
    })();
    return () => { alive = false; };
  }, []);

  return settings;
}

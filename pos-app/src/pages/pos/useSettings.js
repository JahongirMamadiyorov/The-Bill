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
  currencySymbol: "so'm",
  taxRate: 0,
  taxEnabled: false,
  serviceChargeRate: 0,
  serviceChargeEnabled: false,
  receiptShowServiceCharge: true,
};

function translate(row) {
  if (!row || typeof row !== 'object') return DEFAULTS;
  return {
    restaurantName:           row.restaurant_name ?? null,
    currencySymbol:           row.currency_symbol || "so'm",
    taxRate:                  Number(row.tax_rate || 0),
    taxEnabled:               row.tax_enabled === true,
    serviceChargeRate:        Number(row.service_charge_rate || 0),
    serviceChargeEnabled:     row.service_charge_enabled === true,
    receiptShowServiceCharge: row.receipt_show_service_charge !== false,
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

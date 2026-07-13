'use strict';

const https = require('https');
const http  = require('http');

const BACKEND_BASE = 'https://the-bill-backend-pego.onrender.com';

function request(method, path, body, authToken) {
  return new Promise((resolve, reject) => {
    const url     = new URL(BACKEND_BASE + path);
    const isHttps = url.protocol === 'https:';
    const lib     = isHttps ? https : http;
    const payload = body ? JSON.stringify(body) : null;

    const req = lib.request({
      hostname: url.hostname,
      port:     url.port || (isHttps ? 443 : 80),
      path:     url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...(payload   ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/**
 * Bridges the local PowerSync SQLite database to the existing Express API.
 *
 * @param {() => string|null} getAppToken - returns the current app session JWT
 *   (the one from POST /api/auth/login), or null if logged out.
 */
class Connector {
  constructor(getAppToken) {
    this.getAppToken = getAppToken;
  }

  // Called by the PowerSync SDK whenever it needs a (re)new PowerSync-specific token.
  // We exchange our existing app session JWT for a short-lived PowerSync JWT via the
  // backend endpoint added in restaurant-app/backend/src/routes/auth.js.
  async fetchCredentials() {
    const appToken = this.getAppToken();
    if (!appToken) throw new Error('Not logged in — no app session token available');

    const res = await request('GET', '/api/auth/powersync-token', null, appToken);
    if (res.status !== 200) {
      throw new Error(res.body?.error || `Failed to fetch PowerSync token (${res.status})`);
    }
    return { endpoint: res.body.endpoint, token: res.body.token };
  }

  // PHASE 0 STUB: there is no real write-producing UI yet (Cashier/Waitress screens are
  // Phase 1/1b), so there's nothing genuine to upload. This just drains the queue so it
  // doesn't build up during testing, WITHOUT actually sending anything to the backend.
  //
  // Before Phase 1 ships, replace this with real per-table forwarding to the existing
  // Express routes (orders.js, tables.js, etc.) — do NOT bypass those routes' business
  // logic (stock deduction, permission checks) with a generic passthrough. See
  // MEMORY.md / STATUS.md for this note.
  async uploadData(database) {
    const batch = await database.getCrudBatch();
    if (batch == null) return;

    console.warn(
      `[powersync] uploadData STUB: discarding ${batch.crud.length} queued write(s) — ` +
      'no real backend forwarding implemented yet (Phase 0). Do not rely on writes ' +
      'surviving until Phase 1 wires this up properly.'
    );

    await batch.complete();
  }
}

module.exports = { Connector };

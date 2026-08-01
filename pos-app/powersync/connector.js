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
 * @param {(kind: string, detail: string) => void} [onEvent] - optional diagnostic
 *   sink (see main.js's pushPsEvent). Added 2026-07-31: the PowerSync SDK CATCHES
 *   whatever fetchCredentials throws and silently retries, so a token-renewal
 *   failure mid-session leaves no trace anywhere — which is exactly the state a
 *   machine was found in (connected:false, hasSynced:true, error:none) with no way
 *   to tell why. This makes that path visible.
 */
class Connector {
  constructor(getAppToken, onEvent) {
    this.getAppToken = getAppToken;
    this.onEvent = typeof onEvent === 'function' ? onEvent : () => {};
  }

  // Called by the PowerSync SDK whenever it needs a (re)new PowerSync-specific token.
  // We exchange our existing app session JWT for a short-lived PowerSync JWT via the
  // backend endpoint added in restaurant-app/backend/src/routes/auth.js.
  // Every exit path reports to onEvent — including the successful one, because
  // "did it even try to renew?" is itself a diagnostic answer. The SDK calls this
  // on first connect AND on every token renewal (the minted JWT is 60m, see
  // backend routes/auth.js), so a healthy long-running terminal should show a
  // periodic 'token-ok'.
  async fetchCredentials() {
    const appToken = this.getAppToken();
    if (!appToken) {
      this.onEvent('token-fail', 'Not logged in — no app session token available');
      throw new Error('Not logged in — no app session token available');
    }

    let res;
    try {
      res = await request('GET', '/api/auth/powersync-token', null, appToken);
    } catch (err) {
      // Network-level failure (DNS, TLS, socket reset) — request() rejects rather
      // than resolving, so this would otherwise vanish entirely.
      this.onEvent('token-fail', `Network error fetching PowerSync token: ${err.message}`);
      throw err;
    }

    if (res.status !== 200) {
      const msg = res.body?.error || `Failed to fetch PowerSync token (${res.status})`;
      this.onEvent('token-fail', msg);
      throw new Error(msg);
    }

    this.onEvent('token-ok', `endpoint=${res.body.endpoint || '(none)'}`);
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

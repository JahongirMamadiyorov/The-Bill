// ─────────────────────────────────────────────────────────────────────────────
// Rewrites a menu-item photo URL to the local `app-photo://` scheme so the
// image is served from main.js's on-disk cache instead of re-fetched from the
// Render backend every time (see main.js's protocol.handle('app-photo', ...)
// for the actual cache/download logic).
//
// Only rewrites URLs that actually match our own backend's known upload path
// (`/uploads/menu/<filename>`, see restaurant-app/backend/src/routes/menu.js)
// — anything else passes through untouched rather than being silently broken
// by a URL shape this cache doesn't understand.
// ─────────────────────────────────────────────────────────────────────────────

const BACKEND_ORIGIN = 'https://the-bill-backend-pego.onrender.com';
const UPLOAD_PREFIX  = `${BACKEND_ORIGIN}/uploads/menu/`;
// Some rows in the database have `image_url` stored as `http://...` instead
// of `https://...` — a backend bug (menu.js's upload endpoint building the
// URL from `req.protocol`, which read 'http' behind Render's proxy; fixed at
// the source in restaurant-app/backend/src/server.js via `app.set('trust
// proxy', 1)`, but existing rows saved before that fix stay wrong). Without
// this, those photos would silently fail here too (startsWith would never
// match), the same bug confirmed live in the Admin panel's Menu screen via a
// CSP-block console error. Normalizing the scheme before the prefix check
// means both old (http) and new (https) stored URLs resolve to the same
// cached file — the app-photo:// scheme this returns doesn't carry a
// protocol at all, so this has zero effect on caching behavior either way.
const UPLOAD_PREFIX_HTTP = UPLOAD_PREFIX.replace('https://', 'http://');

export function localPhotoSrc(url) {
  if (!url || typeof url !== 'string') return url;
  let filename;
  if (url.startsWith(UPLOAD_PREFIX)) filename = url.slice(UPLOAD_PREFIX.length);
  else if (url.startsWith(UPLOAD_PREFIX_HTTP)) filename = url.slice(UPLOAD_PREFIX_HTTP.length);
  else return url;
  if (!filename) return url;
  return `app-photo://${encodeURIComponent(filename)}`;
}

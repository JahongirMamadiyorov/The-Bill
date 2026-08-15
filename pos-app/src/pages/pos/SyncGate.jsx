// ─────────────────────────────────────────────────────────────────────────────
// SyncGate / OfflineBanner — the two visual states that go with useSyncGate.
//
// Kept in one file so Orders and Tables can never drift apart visually; both
// screens previously duplicated their loading spinner and would have duplicated
// this too. All colors come from tokens.js — nothing is hardcoded (see the note
// at the top of that file: the screens must not invent their own palette).
//
// Icons only, no emoji, per project rules.
// ─────────────────────────────────────────────────────────────────────────────

import { Loader2, CloudOff } from 'lucide-react';
import { T } from './tokens.js';
import { t } from '../../lib/i18n.js';

// Shown INSTEAD of the rows while the local copy has never been reconciled this
// session. Wording matters: it must tell the cashier that what they would
// otherwise be looking at is not current, without implying anything is broken —
// this is a normal startup state and it resolves on its own.
export function SyncGate({ lang }) {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24,
    }}>
      <Loader2 size={34} color={T.green} style={{ animation: 'posspin 1s linear infinite' }} />
      <div style={{ fontFamily: T.font, fontSize: 17, fontWeight: 600, color: T.ink }}>
        {t('Syncing with the server', lang)}
      </div>
      <div style={{
        fontFamily: T.font, fontSize: 13, lineHeight: '19px',
        color: T.muted, textAlign: 'center', maxWidth: 380,
      }}>
        {t('Orders taken while this terminal was offline are still arriving. The list will appear as soon as it is up to date.', lang)}
      </div>
      <style>{`@keyframes posspin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// Shown ABOVE the rows once a sync has completed but the link has since
// dropped. The data is genuinely usable here — the cashier must keep serving —
// so this never blocks, it only states the age of what they are looking at.
export function OfflineBanner({ lang, lastSyncedAt }) {
  const when = lastSyncedAt
    ? new Date(lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 14px', margin: '0 0 12px',
      background: T.amberBg, border: `1px solid ${T.amber}22`,
      borderRadius: T.rCard, color: T.amber,
      fontFamily: T.font, fontSize: 13, fontWeight: 600,
    }}>
      <CloudOff size={16} />
      <span>
        {when
          ? t('Offline — showing orders as of {time}', lang).replace('{time}', when)
          : t('Offline — showing the last synced orders', lang)}
      </span>
    </div>
  );
}

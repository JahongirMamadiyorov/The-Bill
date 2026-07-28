import { T, card, uppercaseLabel } from './tokens.js';
import { unitSuffix } from '../../lib/weighed.js';
import { t, tt } from '../../lib/i18n.js';

// ─────────────────────────────────────────────────────────────────────────────
// Shared "type an amount" modal for weighed items (kg/l/g/ml) — used by Menu's
// cart, and Orders'/Tables' in-place edit modes, so all three add/adjust
// weighed items the same way instead of each screen reinventing it.
//
// `picker` is { item, draft, priceDraft } (or null to render nothing) — the
// caller owns this state and the three callbacks below, since each screen's
// "confirm" needs to write into a different place (cart vs editItems).
// ─────────────────────────────────────────────────────────────────────────────
export default function AmountPickerModal({ picker, symbol, money, lang, onQtyChange, onPriceChange, onConfirm, onClose }) {
  if (!picker) return null;
  // "add" mode (tapping ADD/+ on an item already on the order) asks for the
  // EXTRA amount and sums it with what's already there — starts blank, never
  // prefilled with the current total, so typing the amount you actually mean
  // to add can't be misread as replacing the whole thing (see MEMORY.md: this
  // was a real mistake risk — "0.5 already there, typed 1.33 meaning +1.33,
  // order ended up at 1.33 instead of 1.83"). "set" mode (the minus stepper,
  // a correction) keeps the old prefilled/replace behavior.
  const adding = picker.mode === 'add';
  const unit = unitSuffix(picker.item);
  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: T.backdrop, zIndex: 70,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{ ...card, borderRadius: T.rCardLg, width: '100%', maxWidth: 360, overflow: 'hidden', boxShadow: T.modalShadow }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ background: T.greenTint, padding: '16px 20px 14px' }}>
          <div style={{ ...uppercaseLabel, color: T.greenDark }}>{t(adding ? 'Add amount' : 'Enter amount', lang)}</div>
          <div style={{ fontSize: 16, fontWeight: 800, marginTop: 2 }}>{picker.item.name}</div>
          <div style={{ fontSize: 11.5, color: T.muted, marginTop: 2 }}>
            {money(picker.item.price)} {t('per', lang)} {unit}
            {adding && picker.existingQty > 0 ? ` · ${tt(lang, 'already {qty} {unit} on this order', 'bu buyurtmada allaqachon {qty} {unit} bor', { qty: picker.existingQty, unit })}` : ''}
          </div>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={uppercaseLabel}>{t(adding ? 'Amount to add' : 'Amount', lang)} ({unit})</span>
            <input
              autoFocus value={picker.draft}
              onChange={e => onQtyChange(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && onConfirm()}
              inputMode="decimal" placeholder="0"
              style={{
                border: `1.5px solid ${T.line}`, borderRadius: T.rBtn, padding: '11px 12px',
                fontSize: 16, fontWeight: 800, fontFamily: T.font, color: T.ink, outline: 'none',
              }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={uppercaseLabel}>{t('Or price', lang)} ({symbol})</span>
            <input
              value={picker.priceDraft}
              onChange={e => onPriceChange(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && onConfirm()}
              inputMode="numeric" placeholder="0"
              style={{
                border: `1.5px solid ${T.line}`, borderRadius: T.rBtn, padding: '11px 12px',
                fontSize: 16, fontWeight: 800, fontFamily: T.font, color: T.ink, outline: 'none',
              }}
            />
          </label>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button onClick={onClose} style={{
              flex: 1, padding: '11px 0', borderRadius: T.rBtn, border: `1px solid ${T.line}`,
              background: T.surface, color: T.muted, fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: T.font,
            }}>
              {t('Cancel', lang)}
            </button>
            <button onClick={onConfirm} style={{
              flex: 1, padding: '11px 0', borderRadius: T.rBtn, border: 'none',
              background: T.green, color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: T.font,
            }}>
              {t('Confirm', lang)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

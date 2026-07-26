import { useState, useMemo, useEffect } from 'react';
import {
  X, Minus, Plus, Banknote, CreditCard, QrCode, Wallet,
  Check, CheckCircle2, AlertCircle, AlertTriangle, Loader2,
} from 'lucide-react';
import { T, card, uppercaseLabel, fmtMoney } from './tokens.js';

// ─────────────────────────────────────────────────────────────────────────────
// Process Payment modal — design handoff screen 2 + "Process Payment modal"
// README section. Two columns: order items (shared steppers) | payment form.
//
// Payload sent to PUT /api/orders/:id/pay (snake_case, exactly what the
// Express route expects — see orders.js):
//   payment_method: 'Cash' | 'Card' | 'QR Code' | 'Loan' | 'Split'
//     (route METHOD_MAP normalizes these to cash/card/qr_code/loan/split)
//   discount_amount: number
//   loan_customer_name / loan_customer_phone / loan_due_date  (Loan)
//   split_payments: [{ method, amount, loan_customer_name?, ... }]  (Split)
// ─────────────────────────────────────────────────────────────────────────────

const METHODS = [
  { id: 'Cash',    Icon: Banknote,   label: 'Cash'    },
  { id: 'Card',    Icon: CreditCard, label: 'Card'    },
  { id: 'QR Code', Icon: QrCode,     label: 'QR Code' },
  { id: 'Loan',    Icon: Wallet,     label: 'Loan'    },
];

export default function PaymentModal({
  entries, subtotal, taxAmt, total, settings,
  formatQty, onQtyChange, onClose, onSubmit, onDone,
}) {
  const symbol = settings.currencySymbol;
  const money  = (n) => fmtMoney(n, symbol);

  const [method,     setMethod]     = useState('Cash');
  const [cashIn,     setCashIn]     = useState('');
  const [discount,   setDiscount]   = useState('');
  const [discPct,    setDiscPct]    = useState(true);
  const [splitWays,  setSplitWays]  = useState(0);       // 0 = no split
  const [splitParts, setSplitParts] = useState([]);
  const [loanName,   setLoanName]   = useState('');
  const [loanPhone,  setLoanPhone]  = useState('');
  const [loanDue,    setLoanDue]    = useState('');
  const [notes,      setNotes]      = useState('');
  const [error,      setError]      = useState('');
  const [busy,       setBusy]       = useState(false);
  const [confirmed,  setConfirmed]  = useState(false);

  // ── Discount / totals ─────────────────────────────────────────────────────
  const discAmt = useMemo(() => {
    const d = parseFloat(discount) || 0;
    if (!d) return 0;
    return discPct ? Math.round(total * d / 100) : Math.min(Math.round(d), total);
  }, [discount, discPct, total]);

  const toPay   = Math.max(0, total - discAmt);
  const change  = Math.max(0, (parseFloat(cashIn) || 0) - toPay);

  // ── Split parts re-init when ways/total changes ───────────────────────────
  useEffect(() => {
    if (!splitWays) { setSplitParts([]); return; }
    const base = Math.floor(toPay / splitWays);
    const rem  = toPay - base * splitWays;
    setSplitParts(Array.from({ length: splitWays }, (_, i) => ({
      amount: i === splitWays - 1 ? base + rem : base,
      method: 'Cash', paid: false,
      loanName: '', loanPhone: '', loanDue: '',
    })));
  }, [splitWays, toPay]);

  const setPart = (i, patch) =>
    setSplitParts(parts => parts.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));

  // ── Validation + payload ──────────────────────────────────────────────────
  const buildPayload = () => {
    if (splitWays) {
      return {
        payment_method:  'Split',
        discount_amount: discAmt,
        split_payments:  splitParts.map(p => ({
          method: p.method,
          amount: p.amount,
          ...(p.method === 'Loan' && {
            loan_customer_name:  p.loanName.trim(),
            loan_customer_phone: p.loanPhone.trim() || null,
            loan_due_date:       p.loanDue,
          }),
        })),
        ...(notes && { notes }),
      };
    }
    if (method === 'Loan') {
      return {
        payment_method:      'Loan',
        discount_amount:     discAmt,
        loan_customer_name:  loanName.trim(),
        loan_customer_phone: loanPhone.trim() || null,
        loan_due_date:       loanDue,
        ...(notes && { notes }),
      };
    }
    return { payment_method: method, discount_amount: discAmt, ...(notes && { notes }) };
  };

  const validate = () => {
    if (!entries.length) return 'Cart is empty';
    if (splitWays) {
      for (const p of splitParts) {
        if (!p.paid) return 'Mark every split part as paid before confirming';
        if (p.method === 'Loan' && (!p.loanName.trim() || !p.loanDue))
          return 'Loan split parts need the borrower\'s name and a due date';
      }
      return '';
    }
    if (method === 'Loan' && (!loanName.trim() || !loanDue))
      return 'Loan payments need the borrower\'s name and a due date';
    return '';
  };

  const handleConfirm = async () => {
    const v = validate();
    if (v) { setError(v); return; }
    setError('');
    setBusy(true);
    try {
      const res = await onSubmit(buildPayload());
      if (!res.ok) { setError(res.error || 'Payment failed'); return; }
      setConfirmed(true);
    } finally { setBusy(false); }
  };

  // ── Success view ──────────────────────────────────────────────────────────
  if (confirmed) {
    return (
      <Backdrop onClose={onDone}>
        <div style={{
          ...card, borderRadius: T.rCardLg, boxShadow: T.modalShadow, width: 400,
          padding: '44px 32px 32px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
          fontFamily: T.font,
        }} onClick={e => e.stopPropagation()}>
          <div style={{
            width: 74, height: 74, borderRadius: '50%', background: T.greenTint,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <CheckCircle2 size={38} color={T.green} strokeWidth={2} />
          </div>
          <div style={{ fontSize: 19, fontWeight: 800, color: T.ink }}>Payment Confirmed</div>
          <div style={{ fontSize: 25, fontWeight: 800, color: T.greenDark }}>{money(toPay)}</div>
          {change > 0 && !splitWays && method === 'Cash' && (
            <div style={{ fontSize: 13, fontWeight: 700, color: T.muted }}>Change to give back: {money(change)}</div>
          )}
          <button onClick={onDone} style={{
            marginTop: 10, width: '100%', padding: '13px 0', borderRadius: T.rBtn, border: 'none',
            background: T.green, color: '#fff', fontSize: 14.5, fontWeight: 800, cursor: 'pointer', fontFamily: T.font,
          }}>
            Done
          </button>
        </div>
      </Backdrop>
    );
  }

  // ── Main view ─────────────────────────────────────────────────────────────
  return (
    <Backdrop onClose={onClose}>
      <div style={{
        ...card, borderRadius: T.rCardLg, boxShadow: T.modalShadow, fontFamily: T.font,
        width: 'min(880px, 94vw)', maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px 14px' }}>
          <div>
            <div style={{ fontSize: 16.5, fontWeight: 800 }}>Process Payment</div>
            <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>
              {new Date().toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()}
              {' · '}
              {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 32, height: 32, borderRadius: '50%', border: 'none', background: T.chipBg,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.muted,
          }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ display: 'flex', gap: 0, flex: 1, minHeight: 0, borderTop: `1px solid ${T.line}` }}>

          {/* ── Left: order items + totals ── */}
          <div style={{ width: 330, flexShrink: 0, borderRight: `1px solid ${T.line}`, padding: '16px 22px', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={uppercaseLabel}>Order items</span>
              <span style={{ ...uppercaseLabel, color: T.greenDark }}>{entries.length} items</span>
            </div>

            {entries.map(e => (
              <div key={e.item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {e.item.name}
                  </div>
                  <div style={{ fontSize: 10.5, color: T.faint }}>{money(e.item.price)}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <MiniBtn onClick={() => onQtyChange(e.item, -1)}><Minus size={11} strokeWidth={2.5} /></MiniBtn>
                  <span style={{ fontSize: 12, fontWeight: 800, minWidth: 26, textAlign: 'center' }}>{formatQty(e.item, e.qty)}</span>
                  <MiniBtn onClick={() => onQtyChange(e.item, +1)}><Plus size={11} strokeWidth={2.5} /></MiniBtn>
                </div>
                <div style={{ width: 82, textAlign: 'right', fontSize: 12.5, fontWeight: 800, flexShrink: 0 }}>
                  {money(Number(e.item.price || 0) * e.qty)}
                </div>
              </div>
            ))}

            <div style={{ borderTop: `1px dashed ${T.line}`, marginTop: 10, paddingTop: 10 }}>
              <Row label="Subtotal" value={money(subtotal)} />
              {settings.taxEnabled && <Row label={`Tax (${settings.taxRate}%)`} value={money(taxAmt)} />}
              {discAmt > 0 && <Row label="Discount" value={`−${money(discAmt)}`} color={T.greenDark} />}
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 800 }}>Total</span>
                <span style={{ fontSize: 17, fontWeight: 800, color: T.greenDark }}>{money(toPay)}</span>
              </div>
            </div>
          </div>

          {/* ── Right: payment form ── */}
          <div style={{ flex: 1, padding: '16px 22px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Method grid (hidden when splitting — per-part methods take over) */}
            {!splitWays && (
              <div>
                <div style={{ ...uppercaseLabel, marginBottom: 8 }}>Payment method</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {METHODS.map(({ id, Icon, label }) => {
                    const active = method === id;
                    return (
                      <button key={id} onClick={() => setMethod(id)} style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                        padding: '14px 0', borderRadius: 14, cursor: 'pointer', fontFamily: T.font,
                        border: active ? `2px solid ${T.green}` : `1.5px solid ${T.line}`,
                        background: active ? T.greenTint : T.surface,
                        color: active ? T.greenDark : T.muted, fontSize: 12.5, fontWeight: 800,
                        transition: 'background .15s, border-color .15s',
                      }}>
                        <Icon size={19} strokeWidth={1.8} />
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Cash received + change */}
            {!splitWays && method === 'Cash' && (
              <div>
                <div style={{ ...uppercaseLabel, marginBottom: 8 }}>Amount received</div>
                <input
                  value={cashIn} onChange={e => setCashIn(e.target.value.replace(/[^\d]/g, ''))}
                  inputMode="numeric" placeholder={String(toPay)}
                  style={{
                    width: '100%', boxSizing: 'border-box', border: `1.5px solid ${T.line}`, borderRadius: T.rBtn,
                    padding: '12px 14px', fontSize: 15, fontWeight: 800, fontFamily: T.font, color: T.ink, outline: 'none',
                  }}
                />
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  background: T.chipBg, borderRadius: T.rBtn, padding: '10px 14px', marginTop: 8,
                }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: T.muted }}>Change to give back</span>
                  <span style={{ fontSize: 14, fontWeight: 800 }}>{money(change)}</span>
                </div>
              </div>
            )}

            {/* Loan fields + warning */}
            {!splitWays && method === 'Loan' && (
              <LoanFields
                name={loanName} setName={setLoanName}
                phone={loanPhone} setPhone={setLoanPhone}
                due={loanDue} setDue={setLoanDue}
              />
            )}

            {/* Discount */}
            <div>
              <div style={{ ...uppercaseLabel, marginBottom: 8 }}>Apply discount (optional)</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ display: 'flex', background: T.chipBg, borderRadius: T.rBtn, padding: 3 }}>
                  {[['%', true], [symbol, false]].map(([lbl, isPct]) => (
                    <button key={String(lbl)} onClick={() => setDiscPct(isPct)} style={{
                      padding: '7px 16px', borderRadius: T.rBtn - 3, border: 'none', cursor: 'pointer',
                      background: discPct === isPct ? T.green : 'transparent',
                      color: discPct === isPct ? '#fff' : T.muted,
                      fontSize: 12, fontWeight: 800, fontFamily: T.font,
                    }}>
                      {lbl}
                    </button>
                  ))}
                </div>
                <input
                  value={discount} onChange={e => setDiscount(e.target.value.replace(/[^\d.]/g, ''))}
                  inputMode="decimal" placeholder={discPct ? '0 – 100' : '0'}
                  style={{
                    flex: 1, border: `1.5px solid ${T.line}`, borderRadius: T.rBtn, padding: '10px 14px',
                    fontSize: 13.5, fontWeight: 700, fontFamily: T.font, color: T.ink, outline: 'none',
                  }}
                />
              </div>
            </div>

            {/* Split bill */}
            <div>
              <div style={{ ...uppercaseLabel, marginBottom: 8 }}>Split bill (optional)</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {[2, 3, 4].map(n => {
                  const active = splitWays === n;
                  return (
                    <button key={n} onClick={() => setSplitWays(active ? 0 : n)} style={{
                      flex: 1, padding: '9px 0', borderRadius: T.rBtn, cursor: 'pointer', fontFamily: T.font,
                      border: active ? `2px solid ${T.green}` : `1.5px solid ${T.line}`,
                      background: active ? T.greenTint : T.surface,
                      color: active ? T.greenDark : T.muted, fontSize: 12.5, fontWeight: 800,
                    }}>
                      {n} ways
                    </button>
                  );
                })}
              </div>

              {splitWays > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                  {splitParts.map((p, i) => (
                    <div key={i} style={{ border: `1.5px solid ${p.paid ? T.green : T.line}`, borderRadius: 14, padding: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 800 }}>Part {i + 1} · {money(p.amount)}</span>
                        <button onClick={() => setPart(i, { paid: !p.paid })} style={{
                          display: 'flex', alignItems: 'center', gap: 6, border: 'none', cursor: 'pointer',
                          background: p.paid ? T.greenTint : T.chipBg, color: p.paid ? T.greenDark : T.muted,
                          borderRadius: T.rPill, padding: '5px 12px', fontSize: 11.5, fontWeight: 800, fontFamily: T.font,
                        }}>
                          <Check size={13} strokeWidth={3} /> Paid
                        </button>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {METHODS.map(({ id, Icon }) => {
                          const act = p.method === id;
                          return (
                            <button key={id} onClick={() => setPart(i, { method: id })} title={id} style={{
                              flex: 1, padding: '8px 0', borderRadius: 10, cursor: 'pointer',
                              border: act ? `2px solid ${T.green}` : `1.5px solid ${T.line}`,
                              background: act ? T.greenTint : T.surface,
                              color: act ? T.greenDark : T.muted,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              <Icon size={15} strokeWidth={1.8} />
                            </button>
                          );
                        })}
                      </div>
                      {p.method === 'Loan' && (
                        <div style={{ marginTop: 8 }}>
                          <LoanFields
                            compact
                            name={p.loanName}  setName={v => setPart(i, { loanName: v })}
                            phone={p.loanPhone} setPhone={v => setPart(i, { loanPhone: v })}
                            due={p.loanDue}    setDue={v => setPart(i, { loanDue: v })}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Notes */}
            <div>
              <div style={{ ...uppercaseLabel, marginBottom: 8 }}>Notes</div>
              <input
                value={notes} onChange={e => setNotes(e.target.value)} placeholder="Add payment notes…"
                style={{
                  width: '100%', boxSizing: 'border-box', border: `1.5px solid ${T.line}`, borderRadius: T.rBtn,
                  padding: '10px 14px', fontSize: 12.5, fontFamily: T.font, color: T.ink, outline: 'none',
                }}
              />
            </div>

            {error && (
              <div style={{
                background: T.coralBg, color: T.coral, borderRadius: T.rBtn, padding: '9px 12px',
                fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <AlertCircle size={14} /> {error}
              </div>
            )}

            {/* Confirm / cancel */}
            <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4 }}>
              <button onClick={handleConfirm} disabled={busy} style={{
                padding: '13px 0', borderRadius: T.rBtn, border: 'none',
                background: T.green, color: '#fff', fontSize: 14, fontWeight: 800,
                cursor: 'pointer', fontFamily: T.font, opacity: busy ? 0.7 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'background .15s',
              }}
                onMouseEnter={e => { if (!busy) e.currentTarget.style.background = T.greenDark; }}
                onMouseLeave={e => e.currentTarget.style.background = T.green}
              >
                {busy
                  ? <Loader2 size={16} style={{ animation: 'posspin 1s linear infinite' }} />
                  : <Check size={16} strokeWidth={2.5} />}
                Confirm Payment · {money(toPay)}
              </button>
              <button onClick={onClose} style={{
                padding: '9px 0', borderRadius: T.rBtn, border: 'none', background: 'transparent',
                color: T.muted, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: T.font,
              }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </Backdrop>
  );
}

// ── Bits ──────────────────────────────────────────────────────────────────────

function Backdrop({ children, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: T.backdrop, zIndex: 80,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      {children}
    </div>
  );
}

function MiniBtn({ children, onClick }) {
  return (
    <button onClick={onClick} style={{
      width: 22, height: 22, borderRadius: 7, border: `1px solid ${T.line}`, background: T.surface,
      color: T.ink, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
      {children}
    </button>
  );
}

function Row({ label, value, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
      <span style={{ fontSize: 12, color: color || T.muted, fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 12, color: color || T.muted, fontWeight: 700 }}>{value}</span>
    </div>
  );
}

function LoanFields({ name, setName, phone, setPhone, due, setDue, compact }) {
  const inputStyle = {
    width: '100%', boxSizing: 'border-box', border: `1.5px solid ${T.line}`, borderRadius: T.rBtn,
    padding: compact ? '8px 10px' : '10px 12px', fontSize: 12.5, fontWeight: 700,
    fontFamily: T.font, color: T.ink, outline: 'none',
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 8, background: T.amberBg, color: T.amber,
        borderRadius: T.rBtn, padding: '9px 12px', fontSize: 11.5, fontWeight: 700, lineHeight: 1.4,
      }}>
        <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
        Order will be marked paid. Debt is tracked in Receivables until the customer returns.
      </div>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Customer name *" style={inputStyle} />
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone" style={{ ...inputStyle, flex: 1 }} />
        <input value={due} onChange={e => setDue(e.target.value)} type="date" style={{ ...inputStyle, flex: 1 }} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// POS Terminal design system tokens
// Source of truth: pos-app/POS Terminal Design System/design_handoff_pos_terminal/README.md
// (approved by the project owner 2026-07-26). Every screen/modal in src/pages/pos/
// imports from here — do NOT hardcode colors/radii/shadows in the screens.
// ─────────────────────────────────────────────────────────────────────────────

export const T = {
  // ── Colors ──────────────────────────────────────────────────────────────────
  pageBg:    '#EAF6EF',   // mint page background
  surface:   '#FFFFFF',   // cards / panels
  green:     '#23B26E',   // primary green
  greenDark: '#1C9C5E',   // hover / green text on tint
  greenTint: '#E4F7EC',   // green tint background
  ink:       '#1E2433',   // primary text
  muted:     '#7C8792',   // secondary text
  faint:     '#B0B8BF',   // labels / placeholders
  line:      '#EEF1F1',   // hairline borders
  line2:     '#F0F2F1',
  rowHover:  '#F7F9F8',
  chipBg:    '#F5F7F6',   // icon-chip background

  coral:     '#E14F45',   // danger / occupied / overdue
  coralBg:   '#FDEBEA',
  amber:     '#B7791E',   // warning / reserved / preparing / active-loan
  amberBg:   '#FFF3DC',
  blue:      '#2A5FD1',   // info / needs-bill / ready-to-serve
  blueBg:    '#E8F0FE',
  gray:      '#6B7280',   // neutral status / cancelled
  grayBg:    '#F1F3F5',
  fire:      '#F2872F',   // Fire button orange

  // ── Shadows ─────────────────────────────────────────────────────────────────
  cardShadow:  '0 12px 32px rgba(20,45,35,0.06)',
  modalShadow: '0 30px 70px rgba(20,45,35,0.25)',
  backdrop:    'rgba(20,35,28,0.45)',

  // ── Typography ──────────────────────────────────────────────────────────────
  font: `'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', sans-serif`,

  // ── Shape & layout ──────────────────────────────────────────────────────────
  rCard:  18,     // card radius (18–22)
  rCardLg: 22,
  rBtn:   12,     // buttons 10–14
  rPill:  999,
  pagePad: 24,
  gap:    16,
  sidebarW: 264,
  sidebarCollapsedW: 88,
  rightPanelW: 372,
};

// ── Semantic status → pill colors (per README "Semantic status colors") ───────
// green = available/served/completed/paid/current · coral = occupied/overdue/refunded
// amber = reserved/preparing/due-soon/active-loan · blue = needs-bill/ready-to-serve
// gray = cancelled/paid-archived
export function statusPill(status) {
  const s = String(status || '').toLowerCase().replace(/\s+/g, '_');
  const GREEN = { color: T.greenDark, bg: T.greenTint };
  const CORAL = { color: T.coral,     bg: T.coralBg };
  const AMBER = { color: T.amber,     bg: T.amberBg };
  const BLUE  = { color: T.blue,      bg: T.blueBg };
  const GRAY  = { color: T.gray,      bg: T.grayBg };
  switch (s) {
    case 'free': case 'available': case 'served': case 'completed':
    case 'paid': case 'current': case 'present': case 'active_shift':
      return { ...GREEN, label: cap(s) };
    case 'occupied': case 'overdue': case 'refunded': case 'late':
      return { ...CORAL, label: cap(s) };
    case 'reserved': case 'preparing': case 'due_soon': case 'active':
    case 'pending': case 'sent_to_kitchen': case 'cleaning':
      return { ...AMBER, label: cap(s) };
    case 'bill_requested': case 'needs_bill': case 'ready': case 'ready_to_serve':
      return { ...BLUE, label: cap(s) };
    case 'cancelled': case 'off': case 'absent':
      return { ...GRAY, label: cap(s) };
    default:
      return { ...GRAY, label: cap(s) };
  }
}

function cap(s) {
  return String(s || '').split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// ── Shared style fragments ────────────────────────────────────────────────────
export const card = {
  background: T.surface,
  borderRadius: T.rCard,
  boxShadow: T.cardShadow,
};

export const uppercaseLabel = {
  fontSize: 10.5,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: T.faint,
};

export const pill = (colors) => ({
  display: 'inline-flex',
  alignItems: 'center',
  padding: '4px 12px',
  borderRadius: T.rPill,
  fontSize: 11,
  fontWeight: 700,
  color: colors.color,
  background: colors.bg,
});

// Initials chip (staff / customer avatars without photos)
export const initials = (name = '') =>
  String(name).trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('');

// ── Money ────────────────────────────────────────────────────────────────────
// Currency symbol comes from restaurant settings (GET /api/settings →
// currency_symbol, default "so'm") — pass it in, never hardcode.
export const fmtMoney = (n, symbol = "so'm") =>
  `${Number(n || 0).toLocaleString('uz-UZ')} ${symbol}`;

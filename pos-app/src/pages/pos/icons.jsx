// ─────────────────────────────────────────────────────────────────────────────
// Small custom icon set for cases where lucide-react doesn't have a good fit.
// Kept separate from tokens.js (plain .js, no JSX) so tokens.js doesn't need
// a JSX-capable loader.
// ─────────────────────────────────────────────────────────────────────────────

// A restaurant table seen from above (table top + 4 chairs) — used everywhere
// a "table" concept needs an icon (sidebar nav, Tables screen, table picker).
// Replaces lucide's TableProperties, which reads as a spreadsheet/data-grid
// icon rather than an actual dining table — explicitly flagged as wrong by
// the project owner. Matches lucide's own prop shape (size/strokeWidth/color)
// so it drops in anywhere a lucide icon was used, same call signature.
export function TableIcon({ size = 20, strokeWidth = 1.8, color = 'currentColor', style }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      style={style}
    >
      <rect x="7" y="7" width="10" height="10" rx="2" />
      <rect x="9" y="1.5" width="6" height="3" rx="1" />
      <rect x="9" y="19.5" width="6" height="3" rx="1" />
      <rect x="1.5" y="9" width="3" height="6" rx="1" />
      <rect x="19.5" y="9" width="3" height="6" rx="1" />
    </svg>
  );
}

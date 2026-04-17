// ════════════════════════════════════════════════════════════════
// RESTAURANT ADMIN — DESIGN SYSTEM
// Single source of truth for colors, typography, spacing, etc.
// ════════════════════════════════════════════════════════════════
import { Platform, StatusBar } from 'react-native';

/**
 * topInset — safe top padding for every screen header.
 * Assumes StatusBar is translucent (see AppNavigator.js).
 * iOS: 44px covers the notch/dynamic-island safe area.
 * Android: StatusBar.currentHeight (typically 24–28px).
 */
export const topInset = Platform.OS === 'android'
  ? (StatusBar.currentHeight || 24)
  : 44;

export const colors = {
  // ── Core brand palette ────────────────────────────────────────
  primary:          '#2563EB',   // Strong blue  — buttons, active states, links
  primaryLight:     '#EFF6FF',   // Soft blue    — chips, badge BGs, tinted surfaces
  primaryDark:      '#1D4ED8',   // Pressed blue — active press state

  // ── Status ────────────────────────────────────────────────────
  success:          '#16A34A',   // Green        — present, paid, free, available
  successLight:     '#F0FDF4',
  warning:          '#D97706',   // Amber        — late, cleaning, pending
  warningLight:     '#FFFBEB',
  danger:           '#DC2626',   // Red          — absent, occupied, delete
  dangerLight:      '#FEF2F2',
  info:             '#0891B2',   // Cyan         — informational
  infoLight:        '#ECFEFF',

  // ── Role colors (unchanged — used across all role navigators) ─
  owner:            '#7C3AED',
  admin:            '#2563EB',
  waitress:         '#059669',

  // ── Neutrals ──────────────────────────────────────────────────
  neutralDark:      '#111827',   // Main text, headings
  neutralMid:       '#6B7280',   // Secondary text, labels
  neutralLight:     '#F9FAFB',   // Page backgrounds
  card:             '#FFFFFF',   // Card backgrounds
  border:           '#E5E7EB',   // Dividers, card borders

  // ── Backwards-compat aliases (used by non-admin screens) ──────
  white:            '#FFFFFF',
  background:       '#F9FAFB',
  textDark:         '#111827',
  textMuted:        '#6B7280',
  error:            '#DC2626',
  accent:           '#2563EB',
  primary_legacy:   '#1A1A2E',
};

// ── Icon sizes ────────────────────────────────────────────────────
export const iconSize = {
  sm:   16,
  md:   20,
  lg:   24,
  xl:   28,
};

// ── Typography ────────────────────────────────────────────────────
export const typography = {
  // raw font sizes
  xs:  11,
  sm:  13,
  md:  15,
  lg:  17,
  xl:  20,
  xxl: 24,

  // semantic aliases
  pageTitle:      24,
  sectionHeading: 18,
  cardTitle:      16,
  body:           14,
  label:          12,
  statNumber:     28,
  caption:        11,
};

// ── Spacing ───────────────────────────────────────────────────────
export const spacing = {
  xs:  4,
  sm:  8,
  md:  12,
  lg:  16,
  xl:  20,
  xxl: 24,
};

// ── Border radius ─────────────────────────────────────────────────
export const radius = {
  sm:    6,
  md:    10,
  lg:    14,
  xl:    20,
  card:  12,
  btn:   12,
  badge:  6,
  full:  9999,
};

// ── Shadows ───────────────────────────────────────────────────────
export const shadow = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
};

// ── Shared text style presets ─────────────────────────────────────
export const textStyles = {
  pageTitle:     { fontSize: 24, fontWeight: '700', color: '#111827' },
  sectionHeading:{ fontSize: 18, fontWeight: '600', color: '#111827' },
  cardTitle:     { fontSize: 16, fontWeight: '600', color: '#111827' },
  body:          { fontSize: 14, fontWeight: '400', color: '#111827' },
  label:         { fontSize: 12, fontWeight: '400', color: '#6B7280' },
  labelBold:     { fontSize: 12, fontWeight: '600', color: '#6B7280' },
  statNumber:    { fontSize: 28, fontWeight: '700' },
  caption:       { fontSize: 11, fontWeight: '400', color: '#6B7280' },
};

// ── Status badge helper ───────────────────────────────────────────
// Returns { bg, text } for a status pill
export const statusBadge = {
  free:        { bg: '#F0FDF4', text: '#16A34A' },
  available:   { bg: '#F0FDF4', text: '#16A34A' },
  paid:        { bg: '#F0FDF4', text: '#16A34A' },
  present:     { bg: '#F0FDF4', text: '#16A34A' },
  active:      { bg: '#EFF6FF', text: '#2563EB' },
  occupied:    { bg: '#FEF2F2', text: '#DC2626' },
  absent:      { bg: '#FEF2F2', text: '#DC2626' },
  cancelled:   { bg: '#FEF2F2', text: '#DC2626' },
  reserved:    { bg: '#FFFBEB', text: '#D97706' },
  cleaning:    { bg: '#EFF6FF', text: '#2563EB' },
  late:        { bg: '#FFFBEB', text: '#D97706' },
  pending:     { bg: '#FFFBEB', text: '#D97706' },
  preparing:   { bg: '#EFF6FF', text: '#2563EB' },
  ready:       { bg: '#F0FDF4', text: '#16A34A' },
  served:      { bg: '#F5F3FF', text: '#7C3AED' },
  delivered:   { bg: '#F0FDF4', text: '#16A34A' },
  in_transit:  { bg: '#EFF6FF', text: '#2563EB' },
  ordered:     { bg: '#FFFBEB', text: '#D97706' },
  default:     { bg: '#F3F4F6', text: '#6B7280' },
};

// ════════════════════════════════════════════════════════════════════════════
// OrderReviewSheet — last look at the order before it goes to the kitchen.
//
// WHY THIS EXISTS (2026-08-17, owner request)
// The waiter tapped "Send Order" and the order left immediately. Once it is in
// the kitchen it is being cooked — a mistake at that point costs food, not just
// a tap. The only summary before this was a total and an item COUNT in the
// floating bar, which cannot tell you that you added Sezar twice or that the
// KFC went in at 1kg instead of 2.
//
// So: one screen, the actual list, then send. Deliberately a confirmation and
// not another editing surface — the menu behind it is where quantities change.
// Tapping a line here takes you back rather than offering a second set of
// steppers that could disagree with the first.
// ════════════════════════════════════════════════════════════════════════════
import React from 'react';
import {
  View, Text, Modal, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Animated,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { colors, spacing, radius, shadow } from '../utils/theme';
import { useTranslation } from '../context/LanguageContext';
import useSheetSwipe from './useSheetSwipe';

const fmtMoney = (n) => Math.round(n || 0).toLocaleString('uz-UZ') + " so'm";

const isWeighed = (unit) => {
  const u = String(unit || 'piece').toLowerCase();
  return u === 'kg' || u === 'l' || u === 'g' || u === 'ml';
};

// Weighed goods read "1.5 kg", countable ones "×2" — the same convention the
// rest of the app and the printed tickets use, so the waiter is checking the
// order in the form the kitchen will receive it.
const qtyLabel = (item) => {
  const q = Number(item.quantity ?? item.qty ?? 0);
  if (isWeighed(item.unit)) {
    const trimmed = Number.isInteger(q) ? String(q) : q.toFixed(3).replace(/\.?0+$/, '');
    return `${trimmed} ${String(item.unit).toLowerCase()}`;
  }
  return `×${q}`;
};

export default function OrderReviewSheet({
  visible,
  items = [],
  tableName,
  sending = false,
  mode = 'new',          // 'new' | 'add'
  onConfirm,
  onClose,
}) {
  const swipe = useSheetSwipe(onClose);
  const { t } = useTranslation();

  const total = items.reduce(
    (s, i) => s + Number(i.price ?? i.unit_price ?? 0) * Number(i.quantity ?? i.qty ?? 0),
    0,
  );
  const lineCount = items.length;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={sending ? undefined : onClose} />
      <Animated.View style={[styles.sheet, swipe.style]}>
        <View {...swipe.panHandlers}>
            <View style={styles.handle} />

        <Text style={styles.title}>
          {mode === 'add'
            ? t('waitress.review.titleAdd', 'Check the items to add')
            : t('waitress.review.title', 'Check the order')}
        </Text>
          </View>
        {!!tableName && <Text style={styles.sub}>{tableName}</Text>}

        <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: spacing.md }}>
          {items.map((item, idx) => (
            <View key={`${item.menu_item_id || item.id || idx}`} style={styles.row}>
              <View style={{ flex: 1, paddingRight: spacing.sm }}>
                <Text style={styles.name} numberOfLines={2}>{item.name}</Text>
                <Text style={styles.unitPrice}>
                  {fmtMoney(item.price ?? item.unit_price)}
                  {isWeighed(item.unit) ? ` / ${String(item.unit).toLowerCase()}` : ''}
                </Text>
              </View>
              <Text style={styles.qty}>{qtyLabel(item)}</Text>
              <Text style={styles.lineTotal}>
                {fmtMoney(Number(item.price ?? item.unit_price ?? 0) * Number(item.quantity ?? item.qty ?? 0))}
              </Text>
            </View>
          ))}
        </ScrollView>

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>
            {t('waitress.review.itemCount', '{n} item(s)').replace('{n}', String(lineCount))}
          </Text>
          <Text style={styles.totalValue}>{fmtMoney(total)}</Text>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.btn, styles.btnGhost]}
            onPress={onClose}
            disabled={sending}
            activeOpacity={0.85}
          >
            <MaterialIcons name="arrow-back" size={18} color={colors.primary} />
            <Text style={styles.btnGhostTxt}>{t('waitress.review.back', 'Back')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btn, styles.btnPrimary, sending && { opacity: 0.7 }]}
            onPress={onConfirm}
            disabled={sending || lineCount === 0}
            activeOpacity={0.85}
          >
            {sending ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <>
                <MaterialIcons name="send" size={18} color={colors.white} />
                <Text style={styles.btnPrimaryTxt}>
                  {mode === 'add'
                    ? t('waitress.review.confirmAdd', 'Add to order')
                    : t('waitress.review.confirm', 'Send to kitchen')}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop:   { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.45)' },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    maxHeight: '85%',
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl ?? 20, borderTopRightRadius: radius.xl ?? 20,
    paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, paddingTop: spacing.sm,
    ...shadow.card,
  },
  handle:     { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB', marginBottom: spacing.md },
  title:      { fontSize: 18, fontWeight: '800', color: colors.textDark, textAlign: 'center' },
  sub:        { fontSize: 13, color: colors.textMuted, textAlign: 'center', marginTop: 2, marginBottom: spacing.sm },
  list:       { flexGrow: 0, marginTop: spacing.sm },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  name:       { fontSize: 14.5, fontWeight: '700', color: colors.textDark },
  unitPrice:  { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  qty:        { fontSize: 14, fontWeight: '700', color: colors.primary, minWidth: 58, textAlign: 'right' },
  lineTotal:  { fontSize: 14, fontWeight: '800', color: colors.textDark, minWidth: 96, textAlign: 'right' },
  totalRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: spacing.md, marginTop: spacing.xs,
    borderTopWidth: 1, borderTopColor: '#E5E7EB',
  },
  totalLabel: { fontSize: 14, color: colors.textMuted, fontWeight: '600' },
  totalValue: { fontSize: 20, fontWeight: '800', color: colors.primary },
  actions:    { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  btn:        { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: spacing.md, borderRadius: radius.btn },
  btnGhost:   { backgroundColor: colors.primaryLight },
  btnGhostTxt:{ color: colors.primary, fontWeight: '800', fontSize: 15 },
  btnPrimary: { backgroundColor: colors.primary, flex: 1.6 },
  btnPrimaryTxt: { color: colors.white, fontWeight: '800', fontSize: 15 },
});

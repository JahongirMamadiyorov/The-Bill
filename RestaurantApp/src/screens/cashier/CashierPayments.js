import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
} from 'react-native';
import ConfirmDialog from '../../components/ConfirmDialog';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useTranslation } from '../../context/LanguageContext';
import { colors, spacing, radius, shadow } from '../../utils/theme';

const fmt = (n) => Number(n || 0).toLocaleString('uz-UZ') + " so'm";

export default function CashierPayments({ navigation }) {
  const { t } = useTranslation();
  const [dialog, setDialog] = useState(null);

  return (
    <ScrollView style={S.page} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
      {/* Active sessions */}
      <View style={S.card}>
        <View style={S.emptySection}>
          <MaterialIcons name="credit-card" size={40} color={colors.border} />
          <Text style={S.emptyTxt}>{t('cashier.payments.noActivePaymentSessions')}</Text>
          <Text style={S.emptySub}>{t('cashier.payments.ordersBeingPaidAppearHere')}</Text>
        </View>
      </View>

      {/* Quick actions */}
      <Text style={S.secHead}>{t('cashier.payments.quickActions')}</Text>

      <TouchableOpacity
        style={S.actionCard}
        onPress={() => setDialog({ title: t('cashier.payments.printed'), message: t('cashier.payments.lastReceiptSent'), type: 'info' })}
        activeOpacity={0.75}
      >
        <View style={[S.actionIcon, { backgroundColor: colors.primaryLight }]}>
          <MaterialIcons name="print" size={20} color={colors.primary} />
        </View>
        <View style={S.flex}>
          <Text style={S.actionTitle}>{t('cashier.payments.reprintLastReceipt')}</Text>
          <Text style={S.actionSub}>{t('cashier.payments.sendsLastReceipt')}</Text>
        </View>
        <MaterialIcons name="chevron-right" size={20} color={colors.neutralMid} />
      </TouchableOpacity>

      <View style={[S.actionCard, { opacity: 0.45 }]}>
        <View style={[S.actionIcon, { backgroundColor: colors.neutralLight }]}>
          <MaterialIcons name="point-of-sale" size={20} color={colors.neutralMid} />
        </View>
        <View style={S.flex}>
          <Text style={S.actionTitle}>{t('cashier.payments.openCashDrawer')}</Text>
          <Text style={S.actionSub}>{t('cashier.payments.hardwareNotConnected')}</Text>
        </View>
        <MaterialIcons name="chevron-right" size={20} color={colors.neutralMid} />
      </View>
      <ConfirmDialog dialog={dialog} onClose={() => setDialog(null)} />
    </ScrollView>
  );
}

const S = StyleSheet.create({
  flex:         { flex: 1 },
  page:         { flex: 1, backgroundColor: colors.background },
  card:         { backgroundColor: colors.white, borderRadius: radius.card, padding: spacing.lg, ...shadow.card },
  emptySection: { alignItems: 'center', paddingVertical: spacing.xl },
  emptyTxt:     { fontSize: 14, fontWeight: '600', color: colors.neutralMid, marginTop: spacing.sm },
  emptySub:     { fontSize: 12, color: colors.neutralMid, marginTop: 2 },
  secHead:      { fontSize: 11, fontWeight: '700', color: colors.neutralMid, textTransform: 'uppercase', letterSpacing: 0.8 },
  actionCard:   { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.white, borderRadius: radius.card, padding: spacing.lg, ...shadow.card },
  actionIcon:   { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  actionTitle:  { fontSize: 14, fontWeight: '600', color: colors.textDark },
  actionSub:    { fontSize: 11, color: colors.neutralMid, marginTop: 2 },
});

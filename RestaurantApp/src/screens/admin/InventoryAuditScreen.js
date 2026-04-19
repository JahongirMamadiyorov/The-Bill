import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, FlatList, TouchableOpacity, TextInput,
    StyleSheet, ActivityIndicator, Platform, ScrollView, StatusBar
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { warehouseAPI } from '../../api/client';
import { spacing, radius, shadow, topInset } from '../../utils/theme';
import ConfirmDialog from '../../components/ConfirmDialog';
import { useTranslation } from '../../context/LanguageContext';

export default function InventoryAuditScreen() {
    const [items, setItems] = useState([]);
    const [counts, setCounts] = useState({}); // { item_id: '12.5' }
    const [reasons, setReasons] = useState({});  // { item_id: 'Reason text' }
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [dialog, setDialog] = useState(null);
    const navigation = useNavigation();
    const { t } = useTranslation();

    const load = useCallback(async () => {
        try {
            const res = await warehouseAPI.getAll();
            setItems(res.data);
        } catch (e) {
            setDialog({ title: t('common.error'), message: e.message, type: 'error' });
        }
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const getVariance = (item) => {
        const actual = parseFloat(counts[item.id]);
        if (isNaN(actual)) return null;
        return actual - parseFloat(item.quantity_in_stock);
    };

    const totalVariances = items.filter(i => getVariance(i) !== null).length;

    const handleSubmit = async () => {
        const auditItems = items
            .filter(i => counts[i.id] !== undefined && counts[i.id] !== '')
            .map(i => ({
                item_id: i.id,
                actual_qty: parseFloat(counts[i.id]),
                reason: reasons[i.id] || 'Routine Audit',
            }));

        if (auditItems.length === 0) {
            setDialog({ title: t('adminExtra.nothingToAudit'), message: t('adminExtra.enterActualCounts'), type: 'warning' });
            return;
        }

        setDialog({
            title: t('adminExtra.submitAuditQ'),
            message: `${auditItems.length} ${t('adminExtra.submitAuditMsg')}`,
            type: 'info',
            confirmLabel: t('adminExtra.submitBtn'),
            onConfirm: async () => {
                setDialog(null);
                setSubmitting(true);
                try {
                    await warehouseAPI.audit({ items: auditItems });
                    setDialog({ title: t('adminExtra.auditComplete'), message: t('adminExtra.auditProcessed'), type: 'success' });
                    setTimeout(() => {
                        setDialog(null);
                        navigation.goBack();
                    }, 1000);
                } catch (e) {
                    setDialog({ title: t('common.error'), message: e.response?.data?.error || e.message, type: 'error' });
                }
                setSubmitting(false);
            }
        });
    };

    if (loading) return (
        <View style={styles.center}><ActivityIndicator color="#0f172a" size="large" /></View>
    );

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Text style={styles.backBtnText}>{'‹ '}{t('adminExtra.backLabel')}</Text>
                </TouchableOpacity>
                <Text style={styles.title}>{t('adminExtra.inventoryAudit')}</Text>
                <View style={styles.backBtn} />
            </View>

            {/* Info Banner */}
            <View style={styles.infoBanner}>
                <Text style={styles.infoBannerTitle}>{t('adminExtra.scanCountMode')}</Text>
                <Text style={styles.infoBannerSub}>
                    {t('adminExtra.scanCountDesc')}
                </Text>
            </View>

            {/* Count Stats */}
            <View style={styles.statsRow}>
                <View style={styles.statCard}>
                    <Text style={styles.statVal}>{totalVariances}</Text>
                    <Text style={styles.statLabel}>{t('adminExtra.counted')}</Text>
                </View>
                <View style={styles.statCard}>
                    <Text style={[styles.statVal, { color: '#ef4444' }]}>
                        {items.filter(i => { const v = getVariance(i); return v !== null && v < 0; }).length}
                    </Text>
                    <Text style={styles.statLabel}>{t('adminExtra.shrinkage')}</Text>
                </View>
                <View style={styles.statCard}>
                    <Text style={[styles.statVal, { color: '#22c55e' }]}>
                        {items.filter(i => { const v = getVariance(i); return v !== null && v > 0; }).length}
                    </Text>
                    <Text style={styles.statLabel}>{t('adminExtra.surplus')}</Text>
                </View>
                <View style={styles.statCard}>
                    <Text style={[styles.statVal, { color: '#6366f1' }]}>
                        {items.filter(i => { const v = getVariance(i); return v === 0; }).length}
                    </Text>
                    <Text style={styles.statLabel}>{t('adminExtra.perfect')}</Text>
                </View>
            </View>

            {/* Item List */}
            <FlatList
                data={items}
                keyExtractor={i => i.id}
                contentContainerStyle={styles.listContent}
                renderItem={({ item }) => {
                    const enteredCount = counts[item.id];
                    const variance = getVariance(item);
                    const hasVariance = variance !== null;
                    const varianceColor = variance < 0 ? '#ef4444' : variance > 0 ? '#22c55e' : '#6366f1';

                    return (
                        <View style={[styles.auditRow, hasVariance && variance !== 0 && styles.auditRowHighlight]}>
                            <View style={styles.auditItemInfo}>
                                <Text style={styles.auditItemName}>{item.name}</Text>
                                <Text style={styles.auditItemSub}>
                                    {item.category} {' \u2022 '}{t('adminExtra.systemLabel')}: {parseFloat(item.quantity_in_stock).toFixed(2)} {item.purchase_unit || item.unit}
                                </Text>
                            </View>

                            <View style={styles.auditInputArea}>
                                <Text style={styles.auditInputLabel}>{t('adminExtra.actual')}</Text>
                                <TextInput
                                    style={styles.auditInput}
                                    value={enteredCount || ''}
                                    onChangeText={text => setCounts(prev => ({ ...prev, [item.id]: text }))}
                                    placeholder={t('placeholders.dashes','--')}
                                    keyboardType="numeric"
                                    placeholderTextColor="#d1d5db"
                                />
                            </View>

                            {hasVariance && (
                                <View style={styles.varianceBox}>
                                    <Text style={[styles.varianceVal, { color: varianceColor }]}>
                                        {variance > 0 ? '+' : ''}{variance.toFixed(2)}
                                    </Text>
                                    <Text style={[styles.varianceLabel, { color: varianceColor }]}>
                                        {variance < 0 ? t('adminExtra.shrinkLabel') : variance > 0 ? t('adminExtra.extraLabel') : t('adminExtra.okLabel')}
                                    </Text>
                                </View>
                            )}
                        </View>
                    );
                }}
                ListFooterComponent={
                    <View style={{ padding: spacing.lg }}>
                        <Text style={styles.sectionLabel}>{t('adminExtra.reasonForVariance')}</Text>
                        <TextInput
                            style={styles.reasonInput}
                            placeholder={t('adminExtra.reasonPlaceholder')}
                            onChangeText={text => {
                                // Set same reason for all entered items
                                const newReasons = {};
                                items.filter(i => counts[i.id]).forEach(i => { newReasons[i.id] = text; });
                                setReasons(newReasons);
                            }}
                        />
                        <TouchableOpacity
                            style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
                            onPress={handleSubmit}
                            disabled={submitting}
                        >
                            {submitting
                                ? <ActivityIndicator color="white" />
                                : <Text style={styles.submitBtnText}>{t('adminExtra.submitAuditReport')}</Text>
                            }
                        </TouchableOpacity>
                    </View>
                }
            />
            <ConfirmDialog dialog={dialog} onClose={() => setDialog(null)} />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8fafc' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: spacing.md, paddingTop: topInset + 16, paddingBottom: spacing.md,
        backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
    },
    title: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
    backBtn: { minWidth: 60 },
    backBtnText: { fontSize: 16, color: '#6366f1', fontWeight: '600' },

    infoBanner: {
        backgroundColor: '#0f172a', margin: spacing.md, borderRadius: 16, padding: 16,
    },
    infoBannerTitle: { fontSize: 15, fontWeight: '800', color: '#fff', marginBottom: 4 },
    infoBannerSub: { fontSize: 12, color: '#94a3b8', lineHeight: 18 },

    statsRow: {
        flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md, marginBottom: spacing.sm,
    },
    statCard: {
        flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 12,
        alignItems: 'center', ...shadow.sm,
    },
    statVal: { fontSize: 22, fontWeight: '800', color: '#0f172a' },
    statLabel: { fontSize: 10, color: '#94a3b8', marginTop: 2, fontWeight: '600' },

    listContent: { paddingHorizontal: spacing.md, paddingTop: 4 },
    auditRow: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#fff', borderRadius: 12, marginBottom: 8, padding: 12, ...shadow.sm,
    },
    auditRowHighlight: { borderLeftWidth: 3, borderLeftColor: '#f59e0b' },
    auditItemInfo: { flex: 1 },
    auditItemName: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
    auditItemSub: { fontSize: 11, color: '#94a3b8', marginTop: 2 },

    auditInputArea: { alignItems: 'center', marginHorizontal: 10 },
    auditInputLabel: { fontSize: 10, color: '#94a3b8', fontWeight: '600', marginBottom: 3 },
    auditInput: {
        borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 10,
        width: 70, textAlign: 'center', fontSize: 16, fontWeight: '700',
        color: '#0f172a', paddingVertical: 8,
    },

    varianceBox: { alignItems: 'center', minWidth: 56 },
    varianceVal: { fontSize: 16, fontWeight: '800' },
    varianceLabel: { fontSize: 9, fontWeight: '700', marginTop: 2 },

    sectionLabel: { fontSize: 12, fontWeight: '600', color: '#64748b', marginBottom: 8 },
    reasonInput: {
        backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0',
        paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: '#0f172a', marginBottom: 20,
    },
    submitBtn: {
        backgroundColor: '#0f172a', borderRadius: 14, padding: 16, alignItems: 'center',
    },
    submitBtnDisabled: { opacity: 0.5 },
    submitBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});

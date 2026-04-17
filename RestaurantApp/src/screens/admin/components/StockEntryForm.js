import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, ScrollView } from 'react-native';
import { warehouseAPI } from '../../../api/client';
import { colors, spacing, radius, typography } from '../../../utils/theme';
import ConfirmDialog from '../../../components/ConfirmDialog';

export default function StockEntryForm({ visible, onClose, onSuccess, suppliers = [], warehouseItems = [] }) {
    const [selectedItem, setSelectedItem] = useState(null);
    const [quantity, setQuantity] = useState('');
    const [expiryDate, setExpiryDate] = useState('');
    const [reason, setReason] = useState('Goods Arrival');
    const [loading, setLoading] = useState(false);
    const [dialog, setDialog] = useState(null);

    const handleSubmit = async () => {
        if (!selectedItem || !quantity) {
            setDialog({ title: 'Error', message: 'Please select an item and enter a quantity.', type: 'error' });
            return;
        }

        setLoading(true);
        try {
            await warehouseAPI.receive({
                item_id: selectedItem.id,
                quantity: parseFloat(quantity),
                expiry_date: expiryDate || null,
                reason
            });
            onSuccess();
        } catch (err) {
            setDialog({ title: 'Error', message: err.response?.data?.error || err.message, type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal visible={visible} animationType="slide" transparent={true}>
            <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>Receive Goods Arrival</Text>
                        <TouchableOpacity onPress={onClose}>
                            <Text style={styles.closeText}>Cancel</Text>
                        </TouchableOpacity>
                    </View>

                    <ScrollView style={styles.scroll}>
                        <Text style={styles.label}>Select Item</Text>
                        <View style={styles.pickerContainer}>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                {warehouseItems.map(item => (
                                    <TouchableOpacity
                                        key={item.id}
                                        style={[styles.itemChip, selectedItem?.id === item.id && styles.itemChipSelected]}
                                        onPress={() => setSelectedItem(item)}
                                    >
                                        <Text style={[styles.itemChipText, selectedItem?.id === item.id && styles.itemChipTextSelected]}>
                                            {item.name}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        </View>

                        <Text style={styles.label}>Quantity Received ({selectedItem ? selectedItem.unit : 'Units'})</Text>
                        <TextInput
                            style={styles.input}
                            keyboardType="numeric"
                            placeholder="e.g. 50"
                            value={quantity}
                            onChangeText={setQuantity}
                        />

                        <Text style={styles.label}>Expiry Date (Optional, YYYY-MM-DD)</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="YYYY-MM-DD"
                            value={expiryDate}
                            onChangeText={setExpiryDate}
                        />

                        <Text style={styles.label}>Notes</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="e.g. Fresh delivery from local farm"
                            value={reason}
                            onChangeText={setReason}
                        />

                        <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} disabled={loading}>
                            <Text style={styles.submitText}>{loading ? 'Processing...' : 'Receive Stock'}</Text>
                        </TouchableOpacity>
                    </ScrollView>
                </View>
            </View>
        </Modal>
        <ConfirmDialog dialog={dialog} onClose={() => setDialog(null)} />
    );
}

const styles = StyleSheet.create({
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: colors.white, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, height: '80%', padding: spacing.lg },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
    modalTitle: { fontSize: typography.lg, fontWeight: '700', color: colors.textDark },
    closeText: { fontSize: typography.md, color: colors.textMuted },
    scroll: { flex: 1 },
    label: { fontSize: typography.sm, fontWeight: '600', color: colors.textDark, marginTop: spacing.md, marginBottom: spacing.xs },
    input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontSize: typography.md, backgroundColor: colors.background },
    pickerContainer: { flexDirection: 'row', paddingVertical: spacing.xs },
    itemChip: { borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full, marginRight: spacing.sm },
    itemChipSelected: { backgroundColor: colors.admin, borderColor: colors.admin },
    itemChipText: { color: colors.textDark, fontSize: typography.sm },
    itemChipTextSelected: { color: colors.white, fontWeight: '700' },
    submitBtn: { backgroundColor: colors.admin, padding: spacing.md, borderRadius: radius.md, alignItems: 'center', marginTop: spacing.xl, marginBottom: spacing.xl },
    submitText: { color: colors.white, fontSize: typography.md, fontWeight: '700' },
});

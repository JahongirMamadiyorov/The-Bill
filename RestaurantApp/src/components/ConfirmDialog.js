// ════════════════════════════════════════════════════════════════
// ConfirmDialog — Styled replacement for Alert.alert
// Supports: confirm (Cancel+Action), info (single OK), multi-option
// ════════════════════════════════════════════════════════════════
import React from 'react';
import {
  View, Text, Modal, TouchableOpacity, TouchableWithoutFeedback,
  StyleSheet, Animated,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { shadow } from '../utils/theme';

/**
 * Usage:
 *
 * 1) Add state:
 *    const [dialog, setDialog] = useState(null);
 *
 * 2) Show dialog (various patterns):
 *
 *    // Simple info / error / success:
 *    setDialog({ title: 'Error', message: 'Something went wrong', type: 'error' });
 *    setDialog({ title: 'Success', message: 'Item saved!', type: 'success' });
 *    setDialog({ title: 'Info', message: 'Receipt sent to printer', type: 'info' });
 *
 *    // Confirm destructive action:
 *    setDialog({
 *      title: 'Delete Item',
 *      message: 'Remove "Burger" from the menu?',
 *      type: 'danger',
 *      confirmLabel: 'Delete',
 *      onConfirm: async () => { setDialog(null); await doDelete(); },
 *    });
 *
 *    // Validation:
 *    setDialog({ title: 'Required', message: 'Name is required.', type: 'warning' });
 *
 *    // Multi-option:
 *    setDialog({
 *      title: 'Add Image',
 *      message: 'Choose how to add a photo',
 *      type: 'info',
 *      options: [
 *        { label: 'Gallery', onPress: () => { setDialog(null); pickGallery(); } },
 *        { label: 'Camera',  onPress: () => { setDialog(null); pickCamera(); } },
 *        { label: 'Remove',  onPress: () => { setDialog(null); remove(); }, style: 'danger' },
 *      ],
 *    });
 *
 * 3) Render once at the bottom of your screen:
 *    <ConfirmDialog dialog={dialog} onClose={() => setDialog(null)} />
 */

const TYPE_CONFIG = {
  danger:  { icon: 'delete-outline',   iconColor: '#dc2626', circleBg: '#fee2e2', btnBg: '#dc2626' },
  error:   { icon: 'error-outline',    iconColor: '#dc2626', circleBg: '#fee2e2', btnBg: '#2563eb' },
  warning: { icon: 'warning',          iconColor: '#d97706', circleBg: '#fef3c7', btnBg: '#2563eb' },
  success: { icon: 'check-circle',     iconColor: '#16a34a', circleBg: '#dcfce7', btnBg: '#16a34a' },
  info:    { icon: 'info-outline',     iconColor: '#2563eb', circleBg: '#dbeafe', btnBg: '#2563eb' },
};

export default function ConfirmDialog({ dialog, onClose }) {
  if (!dialog) return null;

  const type = dialog.type || 'info';
  const cfg = TYPE_CONFIG[type] || TYPE_CONFIG.info;
  const icon = dialog.icon || cfg.icon;
  const hasCancel = !!dialog.onConfirm; // show Cancel only for confirm-style dialogs
  const hasOptions = Array.isArray(dialog.options) && dialog.options.length > 0;

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent>
      <View style={S.overlay}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={S.backdrop} />
        </TouchableWithoutFeedback>

        <View style={S.card}>
          {/* Icon */}
          <View style={[S.iconCircle, { backgroundColor: cfg.circleBg }]}>
            <MaterialIcons name={icon} size={24} color={cfg.iconColor} />
          </View>

          {/* Title */}
          <Text style={S.title}>{dialog.title || 'Alert'}</Text>

          {/* Message */}
          {dialog.message ? (
            <Text style={S.message}>{dialog.message}</Text>
          ) : null}

          {/* Multi-option buttons */}
          {hasOptions ? (
            <View style={S.optionsCol}>
              {dialog.options.map((opt, i) => (
                <TouchableOpacity
                  key={i}
                  style={[
                    S.optionBtn,
                    opt.style === 'danger' && S.optionBtnDanger,
                  ]}
                  onPress={opt.onPress}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    S.optionTxt,
                    opt.style === 'danger' && S.optionTxtDanger,
                  ]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={S.optionBtnCancel} onPress={onClose} activeOpacity={0.7}>
                <Text style={S.optionTxtCancel}>Cancel</Text>
              </TouchableOpacity>
            </View>
          ) : hasCancel ? (
            /* Confirm-style: Cancel + Action */
            <View style={S.btnRow}>
              <TouchableOpacity style={S.cancelBtn} onPress={onClose} activeOpacity={0.7}>
                <Text style={S.cancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[S.confirmBtn, { backgroundColor: dialog.confirmColor || cfg.btnBg }]}
                onPress={dialog.onConfirm}
                activeOpacity={0.7}
              >
                <Text style={S.confirmTxt}>{dialog.confirmLabel || 'Confirm'}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* Info-style: single OK button */
            <TouchableOpacity
              style={[S.okBtn, { backgroundColor: cfg.btnBg }]}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Text style={S.confirmTxt}>{dialog.confirmLabel || 'OK'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const S = StyleSheet.create({
  overlay:        { flex: 1, justifyContent: 'center', alignItems: 'center' },
  backdrop:       { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  card:           { backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 24, paddingTop: 28, paddingBottom: 22, width: '85%', maxWidth: 340, alignItems: 'center', ...shadow.lg },
  iconCircle:     { width: 52, height: 52, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  title:          { fontSize: 17, fontWeight: '800', color: '#0f172a', marginBottom: 6, textAlign: 'center' },
  message:        { fontSize: 13, color: '#64748b', textAlign: 'center', lineHeight: 19, marginBottom: 22 },

  // Confirm-style buttons
  btnRow:         { flexDirection: 'row', gap: 10, width: '100%' },
  cancelBtn:      { flex: 1, paddingVertical: 13, borderRadius: 14, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' },
  cancelTxt:      { fontSize: 14, fontWeight: '700', color: '#64748b' },
  confirmBtn:     { flex: 1, paddingVertical: 13, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  confirmTxt:     { fontSize: 14, fontWeight: '800', color: '#fff' },

  // Single OK button
  okBtn:          { width: '100%', paddingVertical: 13, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },

  // Multi-option
  optionsCol:     { width: '100%', gap: 8 },
  optionBtn:      { width: '100%', paddingVertical: 13, borderRadius: 14, backgroundColor: '#f1f5f9', alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0' },
  optionBtnDanger:{ backgroundColor: '#fee2e2', borderColor: '#fecaca' },
  optionTxt:      { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  optionTxtDanger:{ color: '#dc2626' },
  optionBtnCancel:{ width: '100%', paddingVertical: 13, borderRadius: 14, alignItems: 'center' },
  optionTxtCancel:{ fontSize: 14, fontWeight: '600', color: '#94a3b8' },
});

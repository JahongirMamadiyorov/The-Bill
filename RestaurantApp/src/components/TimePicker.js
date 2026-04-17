import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, Modal, FlatList, StyleSheet,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { colors, spacing, radius, shadow } from '../utils/theme';

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));
const ITEM_H = 44;

function WheelColumn({ data, selected, onSelect, label }) {
  const ref = React.useRef(null);

  useEffect(() => {
    const idx = data.indexOf(selected);
    if (idx >= 0 && ref.current) {
      setTimeout(() => ref.current?.scrollToIndex({ index: idx, animated: false, viewPosition: 0.5 }), 50);
    }
  }, [selected]);

  return (
    <View style={S.wheelCol}>
      <Text style={S.wheelLabel}>{label}</Text>
      <View style={S.wheelWindow}>
        <View style={S.wheelHighlight} />
        <FlatList
          ref={ref}
          data={data}
          keyExtractor={item => item}
          showsVerticalScrollIndicator={false}
          snapToInterval={ITEM_H}
          decelerationRate="fast"
          contentContainerStyle={{ paddingVertical: ITEM_H * 2 }}
          getItemLayout={(_, index) => ({ length: ITEM_H, offset: ITEM_H * index, index })}
          onScrollToIndexFailed={() => {}}
          onMomentumScrollEnd={(e) => {
            const idx = Math.round(e.nativeEvent.contentOffset.y / ITEM_H);
            const clamped = Math.max(0, Math.min(idx, data.length - 1));
            onSelect(data[clamped]);
          }}
          renderItem={({ item }) => {
            const active = item === selected;
            return (
              <TouchableOpacity
                style={S.wheelItem}
                activeOpacity={0.7}
                onPress={() => onSelect(item)}
              >
                <Text style={[S.wheelItemText, active && S.wheelItemActive]}>
                  {item}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>
    </View>
  );
}

export default function TimePicker({ label, value, onChange, placeholder = '09:00' }) {
  const [open, setOpen] = useState(false);

  // Parse current value
  const parts = (value || '').split(':');
  const initH = parts[0] && HOURS.includes(parts[0]) ? parts[0] : '09';
  const initM = parts[1] && MINUTES.includes(parts[1]) ? parts[1] : '00';

  const [selH, setSelH] = useState(initH);
  const [selM, setSelM] = useState(initM);

  useEffect(() => {
    const p = (value || '').split(':');
    if (p[0] && HOURS.includes(p[0])) setSelH(p[0]);
    if (p[1] && MINUTES.includes(p[1])) setSelM(p[1]);
  }, [value]);

  const handleOpen = () => {
    const p = (value || '').split(':');
    setSelH(p[0] && HOURS.includes(p[0]) ? p[0] : '09');
    setSelM(p[1] && MINUTES.includes(p[1]) ? p[1] : '00');
    setOpen(true);
  };

  const handleConfirm = () => {
    onChange(`${selH}:${selM}`);
    setOpen(false);
  };

  const display = value || '';

  return (
    <View>
      {label && <Text style={S.label}>{label}</Text>}
      <TouchableOpacity style={S.trigger} onPress={handleOpen} activeOpacity={0.7}>
        <MaterialIcons name="schedule" size={18} color={colors.primary} />
        <Text style={[S.triggerText, !display && S.triggerPlaceholder]}>
          {display || placeholder}
        </Text>
        <MaterialIcons name="arrow-drop-down" size={20} color="#94a3b8" />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={S.backdrop} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={S.sheet} onStartShouldSetResponder={() => true}>
            <View style={S.sheetHandle} />
            <Text style={S.sheetTitle}>Select Time</Text>

            <View style={S.preview}>
              <Text style={S.previewTime}>{selH}:{selM}</Text>
            </View>

            <View style={S.wheelsRow}>
              <WheelColumn data={HOURS} selected={selH} onSelect={setSelH} label="Hour" />
              <Text style={S.colonSep}>:</Text>
              <WheelColumn data={MINUTES} selected={selM} onSelect={setSelM} label="Min" />
            </View>

            <View style={S.quickRow}>
              {['06:00', '09:00', '12:00', '18:00', '22:00'].map(t => {
                const active = `${selH}:${selM}` === t;
                return (
                  <TouchableOpacity
                    key={t}
                    style={[S.quickChip, active && S.quickChipActive]}
                    onPress={() => { const [h, m] = t.split(':'); setSelH(h); setSelM(m); }}
                    activeOpacity={0.7}
                  >
                    <Text style={[S.quickChipText, active && S.quickChipTextActive]}>{t}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={S.actions}>
              <TouchableOpacity style={S.cancelBtn} onPress={() => setOpen(false)} activeOpacity={0.7}>
                <Text style={S.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={S.confirmBtn} onPress={handleConfirm} activeOpacity={0.8}>
                <MaterialIcons name="check" size={18} color="#fff" />
                <Text style={S.confirmText}>Set Time</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const S = StyleSheet.create({
  label: {
    fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 6,
  },
  trigger: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#F8FAFC', borderWidth: 1.5, borderColor: '#E2E8F0',
    borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 13,
  },
  triggerText: { flex: 1, fontSize: 15, fontWeight: '600', color: '#0f172a' },
  triggerPlaceholder: { color: '#94a3b8', fontWeight: '400' },

  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 24, paddingBottom: 34, paddingTop: 12,
    ...shadow.lg,
  },
  sheetHandle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: '#E2E8F0',
    alignSelf: 'center', marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 18, fontWeight: '800', color: '#0f172a', textAlign: 'center', marginBottom: 8,
  },

  preview: {
    alignItems: 'center', marginBottom: 12,
  },
  previewTime: {
    fontSize: 40, fontWeight: '800', color: colors.primary, letterSpacing: 2,
  },

  wheelsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
  },
  wheelCol: { alignItems: 'center', width: 80 },
  wheelLabel: { fontSize: 11, fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  wheelWindow: { height: ITEM_H * 5, overflow: 'hidden', position: 'relative' },
  wheelHighlight: {
    position: 'absolute', top: ITEM_H * 2, left: 0, right: 0, height: ITEM_H,
    backgroundColor: colors.primaryLight, borderRadius: radius.md,
    borderWidth: 1.5, borderColor: colors.primary + '30',
    zIndex: -1,
  },
  wheelItem: { height: ITEM_H, justifyContent: 'center', alignItems: 'center' },
  wheelItemText: { fontSize: 20, fontWeight: '500', color: '#94a3b8' },
  wheelItemActive: { fontSize: 22, fontWeight: '800', color: colors.primary },

  colonSep: { fontSize: 32, fontWeight: '800', color: '#334155', marginHorizontal: 8, marginTop: 16 },

  quickRow: {
    flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 20,
  },
  quickChip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0',
  },
  quickChipActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  quickChipText: { fontSize: 13, fontWeight: '600', color: '#64748b' },
  quickChipTextActive: { color: colors.primary },

  actions: { flexDirection: 'row', gap: 12 },
  cancelBtn: {
    flex: 1, paddingVertical: 14, borderRadius: radius.md,
    backgroundColor: '#F1F5F9', alignItems: 'center',
  },
  cancelText: { fontSize: 15, fontWeight: '600', color: '#64748b' },
  confirmBtn: {
    flex: 1.5, paddingVertical: 14, borderRadius: radius.md,
    backgroundColor: colors.primary, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  confirmText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});

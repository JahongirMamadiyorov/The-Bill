/**
 * OwnerPeriodPicker
 *
 * Drop-in calendar-based period picker for the Owner panel.
 * Mirrors the admin panel's CalendarPicker / PeriodBar but uses
 * the owner brand colour (#7C3AED).
 *
 * Usage:
 *   const [period, setPeriod] = useState({ from: TODAY, to: TODAY });
 *   const [showPicker, setShowPicker] = useState(false);
 *
 *   <OwnerPeriodBar  period={period} onOpen={() => setShowPicker(true)} />
 *   <OwnerCalendarPicker
 *     visible={showPicker}
 *     onClose={() => setShowPicker(false)}
 *     period={period}
 *     onChange={setPeriod}
 *   />
 */

import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, Pressable, Modal, ScrollView,
  StyleSheet, Platform, KeyboardAvoidingView, StatusBar,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useTranslation } from '../context/LanguageContext';

// ─── theme ───────────────────────────────────────────────────────────────────
const P    = '#7C3AED';   // owner purple
const PL   = '#F5F3FF';   // owner purple-light
const PRANGE = '#EDE9FE'; // range-fill (purple-100)

const TX   = '#111827';  // text dark
const TM   = '#6B7280';  // text mid
const TQ   = '#9CA3AF';  // text muted
const BDR  = '#E5E7EB';  // border
const BG   = '#F1F5F9';  // input bg

// ─── date helpers ─────────────────────────────────────────────────────────────
const _today = new Date();

export const fmtDate = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const TODAY_STR = fmtDate(_today);

const getMonday = (d) => {
  const x = new Date(d);
  x.setDate(x.getDate() - (x.getDay() + 6) % 7);
  return x;
};

const MONTH_NAMES_EN = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const DAY_HDRS_EN = ['Mo','Tu','We','Th','Fr','Sa','Su'];

// ─── CalendarPicker ──────────────────────────────────────────────────────────
export function OwnerCalendarPicker({ visible, onClose, period, onChange }) {
  const { t } = useTranslation();
  const monthNamesT = t('owner.finance.monthNames');
  const MONTH_NAMES = Array.isArray(monthNamesT) && monthNamesT.length === 12 ? monthNamesT : MONTH_NAMES_EN;
  const dayHdrsT = t('owner.finance.dayHeaders');
  const DAY_HDRS = Array.isArray(dayHdrsT) && dayHdrsT.length === 7 ? dayHdrsT : DAY_HDRS_EN;

  const [viewYear,  setViewYear]  = useState(_today.getFullYear());
  const [viewMonth, setViewMonth] = useState(_today.getMonth());
  const [tempFrom,  setTempFrom]  = useState(period.from);
  const [tempTo,    setTempTo]    = useState(period.to);
  const [step,      setStep]      = useState('from'); // 'from' | 'to'

  useEffect(() => {
    if (visible) {
      setTempFrom(period.from);
      setTempTo(period.to);
      setStep('from');
      const d = new Date(period.from + 'T00:00:00');
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
    }
  }, [visible]);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const handleDay = (ds) => {
    if (step === 'from') {
      setTempFrom(ds); setTempTo(ds); setStep('to');
    } else {
      if (ds < tempFrom) { setTempTo(tempFrom); setTempFrom(ds); }
      else setTempTo(ds);
      setStep('from');
    }
  };

  const setPreset = (from, to) => {
    setTempFrom(from); setTempTo(to); setStep('from');
    const d = new Date(from + 'T00:00:00');
    setViewYear(d.getFullYear()); setViewMonth(d.getMonth());
  };

  // Build grid
  const firstDow   = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7; // Mon = 0
  const daysInMon  = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells      = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMon; d++) cells.push(fmtDate(new Date(viewYear, viewMonth, d)));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const presets = [
    { label: t('owner.finance.today', 'Today'),      from: TODAY_STR, to: TODAY_STR },
    { label: t('owner.finance.thisWeek', 'This Week'),  from: fmtDate(getMonday(_today)), to: TODAY_STR },
    { label: t('owner.finance.thisMonth', 'This Month'), from: `${_today.getFullYear()}-${String(_today.getMonth()+1).padStart(2,'0')}-01`, to: TODAY_STR },
    { label: t('owner.finance.lastMonth', 'Last Month'), from: fmtDate(new Date(_today.getFullYear(), _today.getMonth()-1, 1)), to: fmtDate(new Date(_today.getFullYear(), _today.getMonth(), 0)) },
  ];

  const applyLabel = tempFrom === tempTo ? tempFrom : `${tempFrom} → ${tempTo}`;

  // Don't mount the Modal at all when invisible — on Android Fabric an
  // invisible Modal still registers in the native touch chain and silently
  // consumes taps on everything behind it.
  if (!visible) return null;

  const topPad = Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 44;

  return (
    <Modal visible={true} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#fff' }}>
        <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />
        {/* Header — paddingTop covers status bar area */}
        <View style={[st.modalHeader, { paddingTop: topPad + 12 }]}>
          <TouchableOpacity onPress={onClose} style={{ width: 70 }}>
            <Text style={{ fontSize: 15, color: P, fontWeight: '700' }}>← {t('owner.finance.back', 'Back')}</Text>
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, justifyContent: 'center' }}>
            <MaterialIcons name="calendar-today" size={18} color={P} style={{ marginRight: 6 }} />
            <Text style={st.modalTitle}>{t('owner.finance.selectPeriod', 'Select Period')}</Text>
          </View>
          <View style={{ width: 70 }} />
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>

            {/* FROM / TO pills */}
            <View style={{ flexDirection: 'row', marginBottom: 12 }}>
              <TouchableOpacity onPress={() => setStep('from')} style={[st.periodPill, step === 'from' && st.periodPillActive]}>
                <Text style={{ fontSize: 10, color: TQ, fontWeight: '700', marginBottom: 2 }}>{t('owner.finance.from', 'FROM')}</Text>
                <Text style={{ fontSize: 14, fontWeight: '800', color: TX }}>{tempFrom}</Text>
              </TouchableOpacity>
              <View style={{ width: 24, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: TM, fontSize: 18 }}>→</Text>
              </View>
              <TouchableOpacity onPress={() => setStep('to')} style={[st.periodPill, step === 'to' && st.periodPillActive]}>
                <Text style={{ fontSize: 10, color: TQ, fontWeight: '700', marginBottom: 2 }}>{t('owner.finance.to', 'TO')}</Text>
                <Text style={{ fontSize: 14, fontWeight: '800', color: TX }}>{tempTo}</Text>
              </TouchableOpacity>
            </View>

            {/* Hint */}
            <Text style={{ textAlign: 'center', color: TQ, fontSize: 12, marginBottom: 14 }}>
              {step === 'from' ? '● ' + t('owner.finance.tapStart', 'Tap a date to set start') : '● ' + t('owner.finance.tapEnd', 'Tap a date to set end')}
            </Text>

            {/* Month navigation */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <TouchableOpacity onPress={prevMonth} style={st.arrowBtn}>
                <Text style={{ fontSize: 26, color: P, fontWeight: '700', lineHeight: 30 }}>‹</Text>
              </TouchableOpacity>
              <Text style={{ fontSize: 17, fontWeight: '800', color: TX }}>
                {MONTH_NAMES[viewMonth]} {viewYear}
              </Text>
              <TouchableOpacity onPress={nextMonth} style={st.arrowBtn}>
                <Text style={{ fontSize: 26, color: P, fontWeight: '700', lineHeight: 30 }}>›</Text>
              </TouchableOpacity>
            </View>

            {/* Day-of-week headers */}
            <View style={{ flexDirection: 'row', marginBottom: 4 }}>
              {DAY_HDRS.map(d => (
                <View key={d} style={{ flex: 1, alignItems: 'center', paddingVertical: 4 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: TM }}>{d}</Text>
                </View>
              ))}
            </View>

            {/* Calendar grid */}
            {weeks.map((week, wi) => (
              <View key={wi} style={{ flexDirection: 'row' }}>
                {week.map((ds, di) => {
                  if (!ds) return <View key={`e${di}`} style={{ flex: 1, aspectRatio: 1 }} />;

                  const isFrom   = ds === tempFrom;
                  const isTo     = ds === tempTo && tempFrom !== tempTo;
                  const inRange  = ds > tempFrom && ds < tempTo;
                  const isSingle = ds === tempFrom && tempFrom === tempTo;
                  const isTodayDs = ds === TODAY_STR;

                  const bg    = (isFrom || isTo) ? P : inRange ? PRANGE : 'transparent';
                  const txCol = (isFrom || isTo) ? '#fff' : inRange ? P : isTodayDs ? P : TX;
                  const fw    = (isFrom || isTo || isSingle || isTodayDs) ? '800' : '400';

                  const roundLeft  = isFrom || (inRange && di === 0);
                  const roundRight = isTo   || (inRange && di === 6);
                  const br = (isFrom || isTo || isSingle)
                    ? 9
                    : inRange
                      ? (roundLeft || roundRight ? 9 : 0)
                      : 0;

                  return (
                    <TouchableOpacity
                      key={ds}
                      style={{ flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: bg, borderRadius: br }}
                      onPress={() => handleDay(ds)}
                      activeOpacity={0.7}
                    >
                      <Text style={{ fontSize: 13, fontWeight: fw, color: txCol }}>
                        {parseInt(ds.split('-')[2], 10)}
                      </Text>
                      {isTodayDs && !isFrom && !isTo && (
                        <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: P, position: 'absolute', bottom: 3 }} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}

            {/* Quick-select presets */}
            <View style={{ marginTop: 18 }}>
              <Text style={[st.label, { marginBottom: 8 }]}>{t('owner.finance.quickSelect', 'Quick Select')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {presets.map((p, i) => (
                  <TouchableOpacity
                    key={p.label}
                    style={[st.presetBtn, { marginRight: i % 2 === 0 ? 8 : 0, marginBottom: 8 }]}
                    onPress={() => setPreset(p.from, p.to)}
                  >
                    <Text style={st.presetTxt}>{p.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Apply button */}
            <TouchableOpacity
              style={st.btnPrimary}
              onPress={() => { onChange({ from: tempFrom, to: tempTo }); onClose(); }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <MaterialIcons name="check" size={18} color="#fff" style={{ marginRight: 4 }} />
                <Text style={st.btnPrimaryTxt}>{t('owner.finance.apply', 'Apply')}  ·  {applyLabel}</Text>
              </View>
            </TouchableOpacity>

          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ─── PeriodBar ────────────────────────────────────────────────────────────────
export function OwnerPeriodBar({ period, onOpen }) {
  const { t } = useTranslation();
  const isSingle = period.from === period.to;
  const isToday  = period.from === TODAY_STR && period.to === TODAY_STR;
  const label    = isSingle ? period.from : `${period.from}  →  ${period.to}`;

  return (
    <View style={st.filterBar}>
      <Pressable
        style={({ pressed }) => [st.periodBtn, pressed && { opacity: 0.7 }]}
        onPress={onOpen}
      >
        <MaterialIcons name="calendar-today" size={15} color={P} />
        <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: TX, marginLeft: 8 }}>{label}</Text>
        <Text style={{ fontSize: 11, color: TM, fontWeight: '600' }}>▼</Text>
      </Pressable>
      {!isToday && (
        <Pressable
          style={({ pressed }) => [st.todayBtn, pressed && { opacity: 0.7 }]}
          onPress={onOpen}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>{t('owner.finance.today', 'Today')}</Text>
        </Pressable>
      )}
    </View>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: BDR,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: TX,
  },
  filterBar: {
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: BDR,
    flexDirection: 'row',
    alignItems: 'center',
  },
  periodBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BG,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  todayBtn: {
    marginLeft: 8,
    backgroundColor: P,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  periodPill: {
    flex: 1,
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
    backgroundColor: BG,
    borderWidth: 1,
    borderColor: BDR,
  },
  periodPillActive: {
    backgroundColor: PL,
    borderWidth: 2,
    borderColor: P,
  },
  arrowBtn: { padding: 10 },
  presetBtn: {
    flex: 1,
    backgroundColor: BG,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    minWidth: '45%',
  },
  presetTxt: { color: TM, fontWeight: '700', fontSize: 12 },
  label: { fontSize: 13, fontWeight: '700', color: TM },
  btnPrimary: {
    backgroundColor: P,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  btnPrimaryTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
});

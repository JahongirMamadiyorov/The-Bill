// ════════════════════════════════════════════════════════════════
// LanguageSwitcher — Reusable UZ/EN segmented toggle
// Drop into any screen. Reads/writes the global language via
// LanguageContext (which persists to AsyncStorage).
//
// Usage:
//   import LanguageSwitcher from '../../components/LanguageSwitcher';
//   <LanguageSwitcher accentColor={colors.admin} />
// ════════════════════════════════════════════════════════════════
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useTranslation } from '../context/LanguageContext';

export default function LanguageSwitcher({ accentColor = '#2563eb', style }) {
  const { lang, switchLang, t } = useTranslation();

  const isUz = lang === 'uz';
  const isEn = lang === 'en';

  return (
    <View style={[S.wrap, style]}>
      <View style={S.row}>
        <View style={S.iconBox}>
          <MaterialIcons name="language" size={18} color="#64748b" />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={S.label}>{t('language.title')}</Text>
          <Text style={S.value}>
            {isUz ? t('language.uzbek') : t('language.english')}
          </Text>
        </View>
        <View style={S.segWrap}>
          <TouchableOpacity
            style={[S.seg, isUz && { backgroundColor: '#fff', ...S.segActive }]}
            onPress={() => switchLang('uz')}
            activeOpacity={0.7}
          >
            <Text style={[S.segTxt, isUz && { color: accentColor }]}>UZ</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[S.seg, isEn && { backgroundColor: '#fff', ...S.segActive }]}
            onPress={() => switchLang('en')}
            activeOpacity={0.7}
          >
            <Text style={[S.segTxt, isEn && { color: accentColor }]}>EN</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const S = StyleSheet.create({
  wrap: {
    marginHorizontal: 12,
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94a3b8',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  value: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  segWrap: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    padding: 2,
  },
  seg: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    minWidth: 38,
    alignItems: 'center',
  },
  segActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  segTxt: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 0.5,
  },
});

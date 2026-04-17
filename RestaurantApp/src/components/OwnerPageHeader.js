/**
 * OwnerPageHeader — shared premium header for all Owner tab screens.
 *
 * Usage:
 *   <OwnerPageHeader icon="bar-chart" title="Sales Analytics" />
 *   <OwnerPageHeader icon="people" title="Staff" subtitle="Performance & Payroll" right={<SomeNode />} />
 */
import React from 'react';
import { View, Text, StyleSheet, Platform, StatusBar } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { topInset } from '../utils/theme';

const P      = '#7C3AED';
const topPad = topInset;

export default function OwnerPageHeader({ icon, title, subtitle, right, children }) {
  return (
    <View style={s.header}>
      {/* White status-bar icons on every purple/dark owner header */}
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      {/* decorative circles */}
      <View style={s.circle1} />
      <View style={s.circle2} />
      <View style={s.circle3} />

      {/* safe-area top space */}
      <View style={{ height: topPad }} />

      {/* main row */}
      <View style={s.row}>
        {/* icon bubble */}
        <View style={s.iconBubble}>
          <MaterialIcons name={icon} size={20} color="#fff" />
        </View>

        {/* text */}
        <View style={s.textBlock}>
          <Text style={s.title}>{title}</Text>
          {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
        </View>

        {/* optional right node */}
        {right ? <View style={s.rightSlot}>{right}</View> : null}
      </View>

      {/* extra content slot (e.g. tab switchers) */}
      {children ? <View style={s.childSlot}>{children}</View> : null}
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    backgroundColor: P,
    paddingBottom: 18,
    overflow: 'hidden',
  },

  // decorative circles
  circle1: {
    position: 'absolute',
    width: 200, height: 200, borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.06)',
    top: -70, right: -50,
  },
  circle2: {
    position: 'absolute',
    width: 110, height: 110, borderRadius: 55,
    backgroundColor: 'rgba(255,255,255,0.05)',
    top: 10, right: 80,
  },
  circle3: {
    position: 'absolute',
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.04)',
    bottom: -20, left: 30,
  },

  // content
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 12,
  },
  iconBubble: {
    width: 42, height: 42, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  textBlock: { flex: 1 },
  title: {
    fontSize: 22, fontWeight: '800', color: '#fff', letterSpacing: 0.2,
  },
  subtitle: {
    fontSize: 12, color: 'rgba(255,255,255,0.68)', fontWeight: '500', marginTop: 2,
  },
  rightSlot: { alignItems: 'flex-end' },
  childSlot: { paddingTop: 4 },
});

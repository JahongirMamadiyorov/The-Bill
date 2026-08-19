// ════════════════════════════════════════════════════════════════════════════
// CategoryPicker — category selector for the waiter's menu grids
// ════════════════════════════════════════════════════════════════════════════
//
// Replaces the horizontal chip row that both waiter menu grids used to have.
//
// WHY (owner, 2026-08-19): a restaurant with 20-30 categories turned that row
// into a sideways hunt — the waiter could see about four names at a time, with
// no indication of how many more existed off-screen. Finding "Ichimliklar"
// meant swiping blindly. This shows EVERY category at once in a sheet, with
// each one's item count, and costs no permanent vertical space in return.
//
// Searching for a specific DISH is already handled by the search bar above the
// grid — categories are for browsing, which is what this is built for.
//
// SHARED ON PURPOSE: used by both WaitressMenu.js and WaitressTables.js's order
// sheet. Those two grids drifted apart once already (the table sheet was left
// on a 2-column layout when the menu page moved to 3), so the category UI is
// one component rather than two copies that can diverge again.
// ════════════════════════════════════════════════════════════════════════════
import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, FlatList, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { colors, spacing, radius, shadow } from '../utils/theme';
import { useTranslation } from '../context/LanguageContext';

// Show the in-sheet category search only once the list is long enough to be
// worth filtering. Below this a search box is just clutter above six buttons.
const SEARCH_THRESHOLD = 8;

export default function CategoryPicker({ categories = [], items = [], value = null, onChange }) {
  const { t } = useTranslation();
  const [open,  setOpen]  = useState(false);
  const [query, setQuery] = useState('');

  // Item count per category, plus the total for "All". Counted once per data
  // change rather than per rendered row — a 30-category sheet would otherwise
  // filter the whole item list 30 times on every keystroke in the search box.
  //
  // Keyed on String(id) deliberately: category ids do NOT arrive as a
  // consistent type across this codebase — WaitressMenu.js compares them with
  // String(a) === String(b) precisely because a raw === fails when one side is
  // a number and the other the same value as text. A Map keyed on the raw
  // value would silently report 0 items for every category.
  const counts = useMemo(() => {
    const m = new Map();
    for (const it of items) {
      const k = it?.category_id;
      if (k === undefined || k === null) continue;
      const key = String(k);
      m.set(key, (m.get(key) || 0) + 1);
    }
    return m;
  }, [items]);
  const countFor = (id) => counts.get(String(id)) || 0;

  const allLabel = t('waitress.menu.allCategories', 'All categories');
  const current  = value === null || value === undefined
    ? null
    : categories.find(c => String(c.id) === String(value));
  // A category can vanish while still selected (deleted in Admin, or a stale
  // filter after a reload). Falling back to the "All" label keeps the button
  // readable instead of rendering an empty box.
  const triggerLabel = current ? current.name : allLabel;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter(c => String(c.name || '').toLowerCase().includes(q));
  }, [categories, query]);

  const pick = (id) => {
    onChange?.(id);
    setOpen(false);
    setQuery('');
  };

  const renderCell = (id, label, count, isActive) => (
    <TouchableOpacity
      style={[styles.cell, isActive && styles.cellActive]}
      onPress={() => pick(id)}
      activeOpacity={0.85}
    >
      <Text
        style={[styles.cellTxt, isActive && styles.cellTxtActive]}
        numberOfLines={2}
      >
        {label}
      </Text>
      <View style={[styles.countPill, isActive && styles.countPillActive]}>
        <Text style={[styles.countTxt, isActive && styles.countTxtActive]}>{count}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <>
      {/* ── Trigger ── */}
      <View style={styles.triggerWrap}>
        <TouchableOpacity
          style={styles.trigger}
          onPress={() => setOpen(true)}
          activeOpacity={0.8}
        >
          <MaterialIcons name="category" size={18} color={colors.primary} />
          <Text style={styles.triggerTxt} numberOfLines={1}>{triggerLabel}</Text>
          <View style={styles.triggerCount}>
            <Text style={styles.triggerCountTxt}>
              {current ? countFor(current.id) : items.length}
            </Text>
          </View>
          <MaterialIcons name="expand-more" size={22} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* ── Sheet ── */}
      <Modal
        visible={open}
        animationType="slide"
        transparent
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.backdrop}>
          {/* Tapping outside closes — a waiter who opened this by mistake
              should not have to hunt for the X. */}
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={() => setOpen(false)}
          />
          <SafeAreaView edges={['bottom']} style={styles.sheet}>
            <View style={styles.handle} />

            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>
                {t('waitress.menu.chooseCategory', 'Choose category')}
              </Text>
              <TouchableOpacity
                onPress={() => setOpen(false)}
                style={styles.sheetClose}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialIcons name="close" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {categories.length >= SEARCH_THRESHOLD && (
              <View style={styles.searchBar}>
                <MaterialIcons name="search" size={18} color={colors.textMuted} />
                <TextInput
                  style={styles.searchInput}
                  placeholder={t('waitress.menu.searchCategories', 'Search categories…')}
                  placeholderTextColor={colors.textMuted}
                  value={query}
                  onChangeText={setQuery}
                  autoCorrect={false}
                />
                {query.length > 0 && (
                  <TouchableOpacity
                    onPress={() => setQuery('')}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <MaterialIcons name="cancel" size={18} color={colors.textMuted} />
                  </TouchableOpacity>
                )}
              </View>
            )}

            <FlatList
              data={visible}
              keyExtractor={c => String(c.id)}
              numColumns={2}
              columnWrapperStyle={{ gap: spacing.sm }}
              contentContainerStyle={{ padding: spacing.md, paddingTop: spacing.sm, gap: spacing.sm }}
              keyboardShouldPersistTaps="handled"
              // "All" sits above the list rather than inside it so it stays put
              // while the search filters everything else — it is the reset, and
              // a reset you have to search for is useless.
              ListHeaderComponent={
                query.trim()
                  ? null
                  : <View style={{ marginBottom: spacing.sm }}>
                      {renderCell(null, allLabel, items.length, !current)}
                    </View>
              }
              renderItem={({ item }) =>
                renderCell(
                  item.id,
                  item.name,
                  countFor(item.id),
                  !!current && String(current.id) === String(item.id),
                )
              }
              ListEmptyComponent={
                <View style={styles.empty}>
                  <MaterialIcons name="search-off" size={36} color={colors.border} />
                  <Text style={styles.emptyTxt}>
                    {t('waitress.menu.noCategoriesFound', 'No categories found')}
                  </Text>
                </View>
              }
            />
          </SafeAreaView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  triggerWrap: {
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 42,
    paddingHorizontal: spacing.md,
    borderRadius: radius.btn,
    backgroundColor: colors.background,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  triggerTxt:      { flex: 1, fontSize: 14, fontWeight: '700', color: colors.textDark },
  triggerCount:    { minWidth: 22, height: 20, borderRadius: 10, paddingHorizontal: 6, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  triggerCountTxt: { fontSize: 11, fontWeight: '800', color: colors.primary },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    // Capped so the sheet never swallows the whole screen — the waiter keeps
    // sight of the grid behind it and the sheet stays dismissible by tapping
    // above it.
    maxHeight: '75%',
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    ...shadow.lg,
  },
  handle: { width: 40, height: 4, backgroundColor: colors.border, borderRadius: 2, alignSelf: 'center', marginTop: spacing.sm },

  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.sm,
  },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: colors.textDark },
  sheetClose: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },

  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginHorizontal: spacing.md,
    paddingHorizontal: spacing.md,
    height: 40,
    borderRadius: radius.btn,
    backgroundColor: colors.background,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.textDark, paddingVertical: 0 },

  cell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    minHeight: 52,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  cellActive:     { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  cellTxt:        { flex: 1, fontSize: 13, fontWeight: '700', color: colors.textDark },
  cellTxtActive:  { color: colors.primary },
  countPill:      { minWidth: 22, height: 20, borderRadius: 10, paddingHorizontal: 6, backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  countPillActive:{ backgroundColor: colors.primary },
  countTxt:       { fontSize: 11, fontWeight: '800', color: colors.textMuted },
  countTxtActive: { color: colors.white },

  empty:    { alignItems: 'center', paddingVertical: spacing.xxl },
  emptyTxt: { marginTop: spacing.sm, fontSize: 13, color: colors.textMuted, fontWeight: '600' },
});

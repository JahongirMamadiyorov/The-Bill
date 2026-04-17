/**
 * AdminMenu.js — Full Menu Management
 *
 * Items tab  : search bar, category filter chips, item cards with inline
 *              availability toggle, edit / delete.
 * Categories : item counts, add / edit / delete, ↑↓ display-order reorder.
 *
 * Ingredients are managed directly inside the Add / Edit item form.
 * On save the ingredient links are automatically synced to the backend so
 * kitchen usage is deducted from inventory automatically.
 *
 * Fix: Promise.allSettled — one failing endpoint no longer blanks the list.
 */
import React, { useState, useEffect, useCallback } from 'react';
// AsyncStorage no longer used — custom stations are now stored in the backend DB
import {
  View, Text, ScrollView, FlatList, TouchableOpacity, TextInput,
  StyleSheet, Modal, ActivityIndicator, Switch,
  KeyboardAvoidingView, Platform, RefreshControl,
  TouchableWithoutFeedback, SafeAreaView, StatusBar, Image,
} from 'react-native';
// react-native-image-picker requires a native rebuild — guard against null module
let launchImageLibrary = null;
let launchCamera       = null;
try {
  const picker = require('react-native-image-picker');
  launchImageLibrary = picker.launchImageLibrary;
  launchCamera       = picker.launchCamera;
} catch (_) {
  console.warn('react-native-image-picker not linked yet — rebuild the app');
}
import { menuAPI, inventoryAPI } from '../../api/client';
import { colors, shadow, topInset } from '../../utils/theme';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import ConfirmDialog from '../../components/ConfirmDialog';


const IMG_BASE = 'http://10.0.2.2:3000';

// Resolve image URLs for Android emulator — localhost/127.0.0.1 can't be reached
const resolveImgUrl = (url) => {
  if (!url) return null;
  return url
    .replace('http://localhost:', 'http://10.0.2.2:')
    .replace('http://127.0.0.1:', 'http://10.0.2.2:')
    .replace(/^\/uploads/, IMG_BASE + '/uploads');
};

// ─── UNITS ───────────────────────────────────────────────────────────────────
// Shown as a picker below the ingredient selector. The ingredient's own unit
// is always offered first; remaining ones come from this list.
const COMMON_UNITS = ['piece', 'g', 'kg', 'ml', 'l', 'portion', 'tbsp', 'tsp'];

// ─── ITEM TYPES ──────────────────────────────────────────────────────────────
// Both types go through the Kitchen screen; use kitchen_station to route to
// the correct station (e.g. Bar station for drinks/sale items).
const ITEM_TYPES = [
  { id: 'food', iconName: 'set-meal',  label: 'Food', sub: 'Sends order to kitchen' },
  { id: 'sale', iconName: 'local-bar', label: 'Sale', sub: 'Drinks & bar items'     },
];

// ─── KITCHEN STATIONS ─────────────────────────────────────────────────────────
// null = all stations see this item
const KITCHEN_STATIONS = [
  { id: null,     icon: 'restaurant',          label: 'All Stations',  sub: 'Visible to everyone',        bg: '#F3F4F6', text: '#6B7280' },
  { id: 'salad',  icon: 'eco',                 label: 'Salad',         sub: 'Salad station only',          bg: '#F0FDF4', text: '#16A34A' },
  { id: 'grill',  icon: 'outdoor-grill',        label: 'Grill',         sub: 'Grill station only',          bg: '#FFF7ED', text: '#EA580C' },
  { id: 'bar',    icon: 'local-bar',            label: 'Bar',           sub: 'Bar station only',            bg: '#EFF6FF', text: '#2563EB' },
  { id: 'pastry', icon: 'cake',                 label: 'Pastry',        sub: 'Pastry station only',         bg: '#FDF4FF', text: '#A21CAF' },
  { id: 'cold',   icon: 'ac-unit',              label: 'Cold',          sub: 'Cold kitchen only',           bg: '#ECFEFF', text: '#0891B2' },
  { id: 'hot',    icon: 'local-fire-department',label: 'Hot',           sub: 'Hot kitchen only',            bg: '#FEF2F2', text: '#DC2626' },
];

// ─── PALETTE ─────────────────────────────────────────────────────────────────
const PALETTE = [
  { bg: '#e0e7ff', text: '#4338ca', border: '#c7d2fe' },
  { bg: '#dcfce7', text: '#15803d', border: '#bbf7d0' },
  { bg: '#f3e8ff', text: '#7e22ce', border: '#e9d5ff' },
  { bg: '#ffedd5', text: '#c2410c', border: '#fed7aa' },
  { bg: '#ccfbf1', text: '#0f766e', border: '#99f6e4' },
  { bg: '#fee2e2', text: '#b91c1c', border: '#fecaca' },
  { bg: '#fef9c3', text: '#a16207', border: '#fef08a' },
  { bg: '#e0f2fe', text: '#0369a1', border: '#bae6fd' },
];

function catColor(catId, categories) {
  const idx = categories.findIndex(c => String(c.id) === String(catId));
  return PALETTE[idx >= 0 ? idx % PALETTE.length : 0];
}

function money(v) {
  return new Intl.NumberFormat('uz-UZ').format(Math.round(Number(v) || 0)) + " so'm";
}

// ─── SHARED COMPONENTS ───────────────────────────────────────────────────────
function Sheet({ visible, onClose, title, children }) {
  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent>
      <KeyboardAvoidingView
        style={S.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={S.overlayBg} />
        </TouchableWithoutFeedback>
        <View style={S.sheet}>
          <View style={S.sheetHandle} />
          <View style={S.sheetHead}>
            <Text style={S.sheetTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={S.sheetX}>
              <MaterialIcons name="close" size={16} color="#64748b" />
            </TouchableOpacity>
          </View>
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 48 }}
          >
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Field({ label, hint, children }) {
  return (
    <View style={S.field}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
        <Text style={S.fieldLbl}>{label}</Text>
        {hint ? <Text style={S.fieldHint}> — {hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function TInput(props) {
  return (
    <TextInput
      style={[S.input, props.multiline && S.inputMulti]}
      placeholderTextColor="#94a3b8"
      {...props}
    />
  );
}

function Btn({ label, onPress, loading, danger, outline }) {
  return (
    <TouchableOpacity
      style={[S.btn, danger && S.btnDanger, outline && S.btnOutline]}
      onPress={onPress}
      disabled={!!loading}
      activeOpacity={0.8}
    >
      {loading
        ? <ActivityIndicator color={outline ? '#94a3b8' : '#fff'} size="small" />
        : <Text style={[S.btnTxt, outline && S.btnTxtOutline]}>{label}</Text>}
    </TouchableOpacity>
  );
}

// ─── ITEM CARD ────────────────────────────────────────────────────────────────
function ItemCard({ item, categories, onEdit, onDelete, onToggle }) {
  const cc      = catColor(item.category_id, categories);
  const catName = categories.find(c => String(c.id) === String(item.category_id))?.name || '';
  const avail   = (item.is_available ?? item.available) !== false;

  return (
    <View style={[S.itemCard, { borderLeftColor: avail ? cc.border : '#e5e7eb', borderLeftWidth: 4 }, !avail && { opacity: 0.6, backgroundColor: '#f9fafb' }]}>
      {/* Top row */}
      <View style={S.itemRow}>
        {item.image_url ? (
          <View>
            <Image
              source={{ uri: resolveImgUrl(item.image_url) }}
              style={S.itemThumbImg}
              resizeMode="cover"
            />
            {!avail && <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.5)', borderRadius: 14 }} />}
          </View>
        ) : (
          <View style={[S.itemThumb, { backgroundColor: avail ? cc.bg : '#f1f5f9' }]}>
            <Text style={[S.itemThumbTxt, { color: avail ? cc.text : '#94a3b8' }]}>
              {(item.name || '?')[0].toUpperCase()}
            </Text>
          </View>
        )}

        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={S.itemName} numberOfLines={1}>{item.name}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 3 }}>
            {catName ? (
              <View style={[S.catBadge, { backgroundColor: cc.bg }]}>
                <Text style={[S.catBadgeTxt, { color: cc.text }]}>{catName}</Text>
              </View>
            ) : null}
            {item.item_type === 'sale'
              ? <View style={[S.typeBadgeSale, { flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
                  <MaterialIcons name="local-bar" size={12} color="#0369a1" />
                  <Text style={S.typeBadgeSaleTxt}>Bar</Text>
                </View>
              : <View style={[S.typeBadgeFood, { flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
                  <MaterialIcons name="set-meal" size={12} color="#15803d" />
                  <Text style={S.typeBadgeFoodTxt}>Kitchen</Text>
                </View>
            }
            {item.kitchen_station ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#f1f5f9', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 }}>
                <MaterialIcons name="settings" size={10} color="#64748b" />
                <Text style={{ fontSize: 11, fontWeight: '600', color: '#64748b' }}>{item.kitchen_station}</Text>
              </View>
            ) : null}
          </View>
          {item.description ? (
            <Text style={S.itemDesc} numberOfLines={1}>{item.description}</Text>
          ) : null}
        </View>

        <View style={S.itemRight}>
          <Text style={S.itemPrice}>{money(item.price)}</Text>
          <Switch
            value={avail}
            onValueChange={() => onToggle(item)}
            trackColor={{ false: '#e2e8f0', true: colors.admin + '66' }}
            thumbColor={avail ? colors.admin : '#94a3b8'}
            style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
          />
          <Text style={[S.availLbl, { color: avail ? '#15803d' : '#dc2626' }]}>
            {avail ? 'Active' : 'Inactive'}
          </Text>
        </View>
      </View>

      {/* Actions */}
      <View style={S.itemActions}>
        <TouchableOpacity style={[S.chip, { backgroundColor: '#dbeafe', flexDirection: 'row', alignItems: 'center', gap: 4 }]} onPress={() => onEdit(item)}>
          <MaterialIcons name="edit" size={14} color={colors.admin} />
          <Text style={[S.chipTxt, { color: colors.admin }]}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[S.chip, { backgroundColor: '#fee2e2' }]} onPress={() => onDelete(item)}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <MaterialIcons name="close" size={14} color={colors.error} />
            <Text style={[S.chipTxt, { color: colors.error }]}>Delete</Text>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── CATEGORY CARD ────────────────────────────────────────────────────────────
function CatCard({ cat, idx, total, itemCount, onEdit, onDelete, onUp, onDown }) {
  const cc = PALETTE[idx % PALETTE.length];
  return (
    <View style={S.catCard}>
      <View style={[S.catDot, { backgroundColor: cc.bg }]}>
        <Text style={[S.catDotTxt, { color: cc.text }]}>
          {(cat.name || '?')[0].toUpperCase()}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={S.catName}>{cat.name}</Text>
        <Text style={S.catCount}>{itemCount} item{itemCount !== 1 ? 's' : ''}</Text>
      </View>
      <View style={S.catActions}>
        <TouchableOpacity
          style={[S.arrowBtn, idx === 0 && S.arrowDisabled]}
          onPress={onUp} disabled={idx === 0}
        >
          <MaterialIcons name="arrow-upward" size={18} color="#0f172a" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[S.arrowBtn, idx === total - 1 && S.arrowDisabled]}
          onPress={onDown} disabled={idx === total - 1}
        >
          <MaterialIcons name="arrow-downward" size={18} color="#0f172a" />
        </TouchableOpacity>
        <TouchableOpacity style={[S.chip, { backgroundColor: '#dbeafe', marginLeft: 6, flexDirection: 'row', alignItems: 'center', gap: 4 }]} onPress={() => onEdit(cat)}>
          <MaterialIcons name="edit" size={14} color={colors.admin} />
          <Text style={[S.chipTxt, { color: colors.admin }]}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[S.chip, { backgroundColor: '#fee2e2', marginLeft: 6 }]} onPress={() => onDelete(cat)}>
          <MaterialIcons name="close" size={14} color={colors.error} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN SCREEN
// ═══════════════════════════════════════════════════════════════════════════════
export default function AdminMenu() {
  const [categories,     setCategories]     = useState([]);
  const [items,          setItems]          = useState([]);
  const [allIngredients, setAllIngredients] = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [refreshing,     setRefreshing]     = useState(false);
  const [activeTab,      setActiveTab]      = useState('items');
  const [selCat,         setSelCat]         = useState('all');
  const [search,         setSearch]         = useState('');

  // ── Item sheet ──────────────────────────────────────────────────────────────
  const [itemSheet,   setItemSheet]   = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [itemForm,    setItemForm]    = useState({
    name: '', price: '', description: '', category_id: '', available: true,
    item_type: 'food', kitchen_station: null, image_url: '',
  });
  const [saving,        setSaving]        = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const fi = (k, v) => setItemForm(p => ({ ...p, [k]: v }));

  // ── Confirm dialog state ────────────────────────────────────────────────────
  const [dialog, setDialog] = useState(null);
  // { title, message, onConfirm, confirmLabel, confirmColor, icon }

  // ── Custom station presets (persisted in backend DB — shared with website) ───
  const [customStationPresets, setCustomStationPresets] = useState([]);
  // loadStations is also called inside load() below, so stations reload alongside menu data
  const loadStations = useCallback(async () => {
    try {
      const res = await menuAPI.getStations();
      const data = res?.data; // app client has no response interceptor — must read .data
      if (Array.isArray(data)) setCustomStationPresets(data);
    } catch (_) {}
  }, []);
  useEffect(() => { loadStations(); }, [loadStations]);

  // Merge: built-in presets + stations from existing items + DB custom stations
  const allStationPresets = (() => {
    const builtinIds = new Set(KITCHEN_STATIONS.map(s => (s.id || '').toLowerCase()));
    // Derive unique stations already used by menu items
    const fromItems = [...new Set(
      items.map(i => (i.kitchen_station || '').trim()).filter(s => s && !builtinIds.has(s.toLowerCase()))
    )];
    // DB custom stations that aren't already in builtins or derived from items
    const fromDb = customStationPresets.filter(
      s => !builtinIds.has(s.toLowerCase()) && !fromItems.map(x => x.toLowerCase()).includes(s.toLowerCase())
    );
    return [
      ...KITCHEN_STATIONS,
      ...[...fromItems, ...fromDb].map(name => ({
        id: name, icon: 'label', label: name,
        sub: 'Custom station', bg: '#EEF2FF', text: '#6366F1', custom: true,
      })),
    ];
  })();

  const addStationToQuickPick = async () => {
    const val = (itemForm.kitchen_station || '').trim();
    if (!val) return;
    if (KITCHEN_STATIONS.some(p => (p.id || '').toLowerCase() === val.toLowerCase())) return;
    if (customStationPresets.some(s => s.toLowerCase() === val.toLowerCase())) return;
    // Optimistic add so UI feels instant
    setCustomStationPresets(prev => [...prev, val]);
    try {
      const res = await menuAPI.addStation(val);
      const updated = res?.data; // app has no response interceptor — must read .data
      if (Array.isArray(updated)) setCustomStationPresets(updated); // sync with DB truth
    } catch (_) {
      loadStations(); // revert on error
    }
  };

  const removeStationFromQuickPick = (name) => {
    setDialog({
      title: 'Delete Station',
      message: `Remove "${name}" from quick picks? This won't affect existing menu items.`,
      type: 'danger',
      options: [
        { label: 'Cancel', onPress: () => setDialog(null) },
        {
          label: 'Delete',
          onPress: async () => {
            setDialog(null);
            setCustomStationPresets(prev => prev.filter(s => s.toLowerCase() !== name.toLowerCase()));
            try {
              await menuAPI.deleteStation(name);
            } catch (err) {
              const msg = err?.response?.data?.error || err?.error || 'Failed to delete station';
              setDialog({
                title: 'Cannot Delete Station',
                message: msg,
                type: 'warning',
                options: [{ label: 'Got it', onPress: () => setDialog(null) }],
              });
              loadStations(); // restore list
            }
          },
          style: 'danger',
        },
      ],
    });
  };

  // Ingredients inside the item form
  // formIngs: the desired final state — [{ ingredient_id, ingredient_name, quantity, unit }]
  const [formIngs,      setFormIngs]      = useState([]);
  const [originalIngs,  setOriginalIngs]  = useState([]); // loaded on edit, used for diff
  const [ingsFetching,  setIngsFetching]  = useState(false);
  const [pickedIngId,   setPickedIngId]   = useState(null);
  const [pickedIngQty,  setPickedIngQty]  = useState('');
  const [pickedIngUnit, setPickedIngUnit] = useState('piece');
  const [ingSearch,     setIngSearch]     = useState('');

  // Always use the inventory item's own unit — no conversion, no ambiguity.
  const pickedIngNativeUnit = allIngredients.find(i => String(i.id) === String(pickedIngId))?.unit || '';

  // ── Category sheet ──────────────────────────────────────────────────────────
  const [catSheet,  setCatSheet]  = useState(false);
  const [editingCat,setEditingCat]= useState(null);
  const [catName,   setCatName]   = useState('');
  const [catSaving, setCatSaving] = useState(false);

  // ── Load ────────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      const [catRes, itemRes, invRes, stationsRes] = await Promise.allSettled([
        menuAPI.getCategories(),
        menuAPI.getItems(),
        inventoryAPI.getAll(),
        menuAPI.getStations(),
      ]);
      if (catRes.status      === 'fulfilled') setCategories(catRes.value.data        || []);
      if (itemRes.status     === 'fulfilled') setItems(itemRes.value.data            || []);
      if (invRes.status      === 'fulfilled') setAllIngredients(invRes.value.data    || []);
      if (stationsRes.status === 'fulfilled') {
        const sd = stationsRes.value?.data;
        if (Array.isArray(sd)) setCustomStationPresets(sd);
      }
    } catch (_) {}
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Derived list ─────────────────────────────────────────────────────────────
  const visibleItems = items
    .filter(i => {
      if (selCat === 'inactive') return (i.is_available ?? i.available) === false;
      return selCat === 'all' || String(i.category_id) === String(selCat);
    })
    .filter(i => !search.trim() || (i.name || '').toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => {
      // Active items first, then inactive (except in Inactive filter where all are inactive)
      const aAvail = (a.is_available ?? a.available) !== false ? 0 : 1;
      const bAvail = (b.is_available ?? b.available) !== false ? 0 : 1;
      return aAvail - bAvail;
    });

  // ── Item CRUD ────────────────────────────────────────────────────────────────
  function openNewItem() {
    setEditingItem(null);
    setItemForm({
      name: '', price: '', description: '',
      category_id: categories[0]?.id || '',
      available: true,
      item_type: 'food',
      kitchen_station: null,
      image_url: '',
    });
    setFormIngs([]);
    setOriginalIngs([]);
    setPickedIngId(allIngredients[0]?.id || null);
    setPickedIngQty('');
    setPickedIngUnit(allIngredients[0]?.unit || 'piece');
    setIngSearch('');
    setItemSheet(true);
  }

  async function openEditItem(item) {
    setEditingItem(item);
    setItemForm({
      name:            item.name            || '',
      price:           String(item.price    || ''),
      description:     item.description     || '',
      category_id:     item.category_id,
      available:       (item.is_available ?? item.available) !== false,
      item_type:       item.item_type       || 'food',
      kitchen_station: item.kitchen_station || null,
      image_url:       item.image_url       || '',
    });
    setFormIngs([]);
    setOriginalIngs([]);
    setPickedIngId(allIngredients[0]?.id || null);
    setPickedIngQty('');
    setPickedIngUnit(allIngredients[0]?.unit || 'piece');
    setIngSearch('');
    setItemSheet(true);

    // Fetch this item's current ingredient links
    setIngsFetching(true);
    try {
      const res  = await menuAPI.getItemIngredients(item.id);
      const list = res.data || [];
      setFormIngs(list);
      setOriginalIngs(list);
    } catch (_) {}
    setIngsFetching(false);
  }

  // Add an ingredient to the local form list
  function addFormIng() {
    if (!pickedIngId || !pickedIngQty) {
      setDialog({ title: 'Required', message: 'Select an ingredient and enter the quantity needed per dish.', type: 'warning' });
      return;
    }
    const qty = parseFloat(pickedIngQty);
    if (!qty || qty <= 0) {
      setDialog({ title: 'Invalid', message: 'Quantity must be greater than 0.', type: 'warning' });
      return;
    }

    const ing = allIngredients.find(i => String(i.id) === String(pickedIngId));
    if (!ing) return;

    // Always store in the inventory item's native unit — prevents ml/liter confusion
    const nativeUnit = ing.unit || 'piece';
    // Prevent duplicates — update qty if already in list
    setFormIngs(prev => {
      const exists = prev.find(x => String(x.ingredient_id) === String(pickedIngId));
      if (exists) {
        return prev.map(x =>
          String(x.ingredient_id) === String(pickedIngId)
            ? { ...x, quantity: qty, unit: nativeUnit }
            : x
        );
      }
      return [...prev, {
        ingredient_id:   ing.id,
        ingredient_name: ing.name,
        quantity:        qty,
        unit:            nativeUnit,
      }];
    });
    setPickedIngQty('');
  }

  function removeFormIng(ingredientId) {
    setFormIngs(prev => prev.filter(x => String(x.ingredient_id) !== String(ingredientId)));
  }

  // ── Image picker + upload ─────────────────────────────────────────────────────
  function pickImage(fromCamera = false) {
    const launcher = fromCamera ? launchCamera : launchImageLibrary;
    if (!launcher) {
      setDialog({
        title: 'Rebuild Required',
        message: 'Image picker needs a one-time app rebuild to activate.\n\nRun: npx react-native run-android\n\nThen try again.',
        type: 'warning',
        options: [{ label: 'OK', onPress: () => setDialog(null) }],
      });
      return;
    }
    const options = {
      mediaType: 'photo',
      quality: 0.85,
      maxWidth: 1200,
      maxHeight: 1200,
      includeBase64: false,
    };
    launcher(options, async (response) => {
      if (response.didCancel || response.errorCode) return;
      const asset = response.assets?.[0];
      if (!asset?.uri) return;
      setImageUploading(true);
      try {
        const res = await menuAPI.uploadImage(asset.uri, asset.fileName || 'menu-image.jpg', asset.type || 'image/jpeg');
        // fullUrl is the absolute URL; fall back to url (relative path) if needed
        const url = res.data?.fullUrl || res.data?.url;
        if (url) fi('image_url', url);
        else setDialog({ title: 'Upload failed', message: 'Server did not return a URL.', type: 'error' });
      } catch (err) {
        setDialog({ title: 'Upload failed', message: err?.response?.data?.error || 'Could not upload image. Check your connection.', type: 'error' });
      } finally {
        setImageUploading(false);
      }
    });
  }

  function showImageOptions() {
    setDialog({
      title: 'Add Image',
      message: 'Choose how to add a photo',
      type: 'info',
      options: [
        { label: 'Choose from Gallery', onPress: () => { setDialog(null); pickImage(false); } },
        { label: 'Take Photo', onPress: () => { setDialog(null); pickImage(true); } },
        { label: 'Remove Image', onPress: () => { setDialog(null); fi('image_url', ''); }, style: 'danger' },
      ],
    });
  }

  async function saveItem() {
    if (!itemForm.name.trim()) {
      setDialog({ title: 'Required', message: 'Item name is required.', type: 'warning' });
      return;
    }
    if (!itemForm.price) {
      setDialog({ title: 'Required', message: 'Price is required.', type: 'warning' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name:            itemForm.name.trim(),
        description:     itemForm.description.trim(),
        price:           parseFloat(itemForm.price) || 0,
        category_id:     itemForm.category_id,
        is_available:    itemForm.available,
        item_type:       itemForm.item_type || 'food',
        kitchen_station: itemForm.kitchen_station || null,
        image_url:       itemForm.image_url || null,
      };

      // Create or update the item and capture its ID
      let itemId;
      if (editingItem) {
        await menuAPI.updateItem(editingItem.id, payload);
        itemId = editingItem.id;
      } else {
        const res = await menuAPI.createItem(payload);
        // Handle common response shapes: { id } or { item: { id } } or { data: { id } }
        itemId = res.data?.id ?? res.data?.item?.id ?? res.data?.data?.id;
      }

      // ── Sync ingredient links ───────────────────────────────────────────────
      if (itemId) {
        // Remove links that existed originally but are no longer in the form
        for (const orig of originalIngs) {
          const origId    = orig.ingredient_id ?? orig.id;
          const stillHere = formIngs.some(x => String(x.ingredient_id) === String(origId));
          if (!stillHere) {
            try { await menuAPI.removeItemIngredient(itemId, origId); } catch (_) {}
          }
        }
        // Always upsert every ingredient currently in the form
        // (backend uses ON CONFLICT DO UPDATE so this handles both add AND quantity change)
        for (const ing of formIngs) {
          try {
            await menuAPI.addItemIngredient(itemId, {
              ingredient_id: ing.ingredient_id,
              quantity:      ing.quantity,
            });
          } catch (_) {}
        }
      }

      setItemSheet(false);
      load();
    } catch (e) {
      setDialog({ title: 'Error', message: e?.response?.data?.message || 'Failed to save item.', type: 'error' });
    }
    setSaving(false);
  }

  function deleteItem(item) {
    setDialog({
      title: 'Delete Item',
      message: `Remove "${item.name}" from the menu? This action cannot be undone.`,
      type: 'danger',
      options: [
        { label: 'Cancel', onPress: () => setDialog(null) },
        {
          label: 'Delete',
          onPress: async () => {
            setDialog(null);
            try {
              await menuAPI.deleteItem(item.id);
              load();
            } catch (_) {
              setDialog({ title: 'Error', message: 'Delete failed. Please try again.', type: 'error', options: [{ label: 'OK', onPress: () => setDialog(null) }] });
            }
          },
          style: 'danger',
        },
      ],
    });
  }

  async function toggleAvailability(item) {
    const curAvail = (item.is_available ?? item.available) !== false;
    const newVal = !curAvail;
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_available: newVal, available: newVal } : i));
    try {
      // Send ALL fields — backend UPDATE overwrites every column
      await menuAPI.updateItem(item.id, {
        name: item.name,
        description: item.description || '',
        price: item.price,
        category_id: item.category_id,
        is_available: newVal,
        item_type: item.item_type || 'food',
        kitchen_station: item.kitchen_station || null,
        image_url: item.image_url || '',
      });
    } catch (_) {
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_available: curAvail, available: curAvail } : i));
      setDialog({ title: 'Error', message: 'Could not update availability', type: 'error' });
    }
  }

  // ── Category CRUD ────────────────────────────────────────────────────────────
  function openNewCat()   { setEditingCat(null); setCatName(''); setCatSheet(true); }
  function openEditCat(c) { setEditingCat(c); setCatName(c.name); setCatSheet(true); }

  async function saveCat() {
    if (!catName.trim()) {
      setDialog({ title: 'Required', message: 'Category name is required.', type: 'warning' });
      return;
    }
    setCatSaving(true);
    try {
      if (editingCat) await menuAPI.updateCategory(editingCat.id, { name: catName.trim() });
      else            await menuAPI.createCategory({ name: catName.trim(), display_order: categories.length });
      setCatSheet(false);
      load();
    } catch (e) {
      setDialog({ title: 'Error', message: e?.response?.data?.message || 'Failed to save category.', type: 'error' });
    }
    setCatSaving(false);
  }

  function deleteCat(cat) {
    const count = items.filter(i => String(i.category_id) === String(cat.id)).length;
    if (count > 0) {
      setDialog({ title: 'Cannot Delete', message: `"${cat.name}" has ${count} item(s).\nMove or delete those items first.`, type: 'warning', options: [{ label: 'Got it', onPress: () => setDialog(null) }] });
      return;
    }
    setDialog({
      title: 'Delete Category',
      message: `Remove "${cat.name}"? This action cannot be undone.`,
      type: 'danger',
      options: [
        { label: 'Cancel', onPress: () => setDialog(null) },
        {
          label: 'Delete',
          onPress: async () => {
            setDialog(null);
            try {
              await menuAPI.deleteCategory(cat.id);
              load();
            } catch (_) {
              setDialog({ title: 'Error', message: 'Delete failed. Please try again.', type: 'error', options: [{ label: 'OK', onPress: () => setDialog(null) }] });
            }
          },
          style: 'danger',
        },
      ],
    });
  }

  function moveCat(idx, dir) {
    const next = [...categories];
    const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    setCategories(next);
    // Save ALL categories with their new index-based sort_order so DB order is fully correct
    next.forEach((c, i) => {
      menuAPI.updateCategory(c.id, { name: c.name, sort_order: i }).catch(() => {});
    });
  }

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) return (
    <View style={S.center}>
      <ActivityIndicator size="large" color={colors.admin} />
    </View>
  );

  return (
    <SafeAreaView style={S.root}>

      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />
      {/* ── Header ── */}
      <View style={S.header}>
        <View>
          <Text style={S.headerTitle}>Menu</Text>
          <Text style={S.headerSub}>{items.length} items · {categories.length} categories</Text>
        </View>
        <View style={S.avatar}><Text style={S.avatarTxt}>M</Text></View>
      </View>

      {/* ── Tabs ── */}
      <View style={S.tabRow}>
        {[['items', 'Menu Items'], ['categories', 'Categories']].map(([key, label]) => (
          <TouchableOpacity
            key={key}
            style={[S.tab, activeTab === key && S.tabActive]}
            onPress={() => setActiveTab(key)}
          >
            <Text style={[S.tabTxt, activeTab === key && S.tabTxtActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ══════════════════ ITEMS TAB ══════════════════ */}
      {activeTab === 'items' && (
        <>
          {/* Search */}
          <View style={S.searchWrap}>
            <MaterialIcons name="search" size={16} color="#94a3b8" />
            <TextInput
              style={S.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Search menu items..."
              placeholderTextColor="#94a3b8"
              returnKeyType="search"
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <MaterialIcons name="close" size={16} color="#94a3b8" />
              </TouchableOpacity>
            )}
          </View>

          {/* Category filter chips */}
          <View style={S.filterWrap}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={S.filterContent}>
              {[{ id: 'all', name: 'All' }, ...categories].map(cat => {
                const active = String(selCat) === String(cat.id);
                const cc     = cat.id === 'all' ? null : catColor(cat.id, categories);
                const cnt    = cat.id === 'all'
                  ? items.length
                  : items.filter(i => String(i.category_id) === String(cat.id)).length;
                return (
                  <TouchableOpacity
                    key={cat.id}
                    style={[
                      S.filterChip,
                      active && (cc
                        ? { backgroundColor: cc.bg, borderColor: cc.text }
                        : S.filterChipActive),
                    ]}
                    onPress={() => setSelCat(cat.id)}
                  >
                    <Text style={[
                      S.filterChipTxt,
                      active && (cc ? { color: cc.text } : S.filterChipTxtActive),
                    ]}>
                      {cat.name}
                    </Text>
                    <View style={[
                      S.filterBadge,
                      active && { backgroundColor: cc ? cc.text + '22' : 'rgba(255,255,255,0.25)' },
                    ]}>
                      <Text style={[
                        S.filterBadgeTxt,
                        active && (cc ? { color: cc.text } : { color: '#fff' }),
                      ]}>
                        {cnt}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
              {/* Permanent "Inactive" filter — always last */}
              {(() => {
                const inactiveCount = items.filter(i => (i.is_available ?? i.available) === false).length;
                const active = selCat === 'inactive';
                return (
                  <TouchableOpacity
                    style={[
                      S.filterChip,
                      { marginLeft: 4 },
                      active
                        ? { backgroundColor: '#FEE2E2', borderColor: '#DC2626' }
                        : { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
                    ]}
                    onPress={() => setSelCat('inactive')}
                  >
                    <MaterialIcons name="block" size={13} color={active ? '#DC2626' : '#F87171'} />
                    <Text style={[
                      S.filterChipTxt,
                      { color: active ? '#DC2626' : '#F87171' },
                    ]}>
                      Inactive
                    </Text>
                    <View style={[
                      S.filterBadge,
                      { backgroundColor: active ? '#DC262622' : '#FEE2E2' },
                    ]}>
                      <Text style={[
                        S.filterBadgeTxt,
                        { color: active ? '#DC2626' : '#F87171' },
                      ]}>
                        {inactiveCount}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })()}
            </ScrollView>
          </View>

          {/* Item list */}
          <FlatList
            data={visibleItems}
            keyExtractor={i => String(i.id)}
            contentContainerStyle={S.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => { setRefreshing(true); load(); }}
                tintColor={colors.admin}
              />
            }
            ListEmptyComponent={
              <View style={S.empty}>
                {search ? (
                  <MaterialIcons name="search" size={52} color="#e5e7eb" />
                ) : (
                  <MaterialIcons name="restaurant" size={52} color="#e5e7eb" />
                )}
                <Text style={S.emptyTxt}>{search ? 'No results found' : 'No menu items yet'}</Text>
                <Text style={S.emptySub}>
                  {search ? `No items match "${search}"` : 'Tap + Add Item to get started'}
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <ItemCard
                item={item}
                categories={categories}
                onEdit={openEditItem}
                onDelete={deleteItem}
                onToggle={toggleAvailability}
              />
            )}
          />

          <TouchableOpacity style={S.fab} onPress={openNewItem} activeOpacity={0.85}>
            <Text style={S.fabTxt}>+ Add Item</Text>
          </TouchableOpacity>
        </>
      )}

      {/* ══════════════════ CATEGORIES TAB ══════════════════ */}
      {activeTab === 'categories' && (
        <>
          <FlatList
            data={categories}
            keyExtractor={c => String(c.id)}
            contentContainerStyle={S.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => { setRefreshing(true); load(); }}
                tintColor={colors.admin}
              />
            }
            ListEmptyComponent={
              <View style={S.empty}>
                <MaterialIcons name="folder" size={52} color="#e5e7eb" />
                <Text style={S.emptyTxt}>No categories yet</Text>
                <Text style={S.emptySub}>Tap + Add Category to create one</Text>
              </View>
            }
            renderItem={({ item: cat, index }) => (
              <CatCard
                cat={cat}
                idx={index}
                total={categories.length}
                itemCount={items.filter(i => String(i.category_id) === String(cat.id)).length}
                onEdit={openEditCat}
                onDelete={deleteCat}
                onUp={() => moveCat(index, -1)}
                onDown={() => moveCat(index, 1)}
              />
            )}
          />

          <TouchableOpacity style={S.fab} onPress={openNewCat} activeOpacity={0.85}>
            <Text style={S.fabTxt}>+ Add Category</Text>
          </TouchableOpacity>
        </>
      )}

      {/* ══════════════════════════════════════════════════
          ITEM SHEET  (add / edit — includes ingredients)
      ══════════════════════════════════════════════════ */}
      <Sheet
        visible={itemSheet}
        onClose={() => { setIngSearch(''); setItemSheet(false); }}
        title={editingItem ? `Edit — ${editingItem.name}` : 'New Menu Item'}
      >
        {/* ── Basic fields ── */}
        <Field label="Item Name *">
          <TInput
            value={itemForm.name}
            onChangeText={v => fi('name', v)}
            placeholder="e.g. Grilled Salmon, Caesar Salad..."
          />
        </Field>

        <Field label="Price (so'm) *">
          <TInput
            value={itemForm.price}
            onChangeText={v => fi('price', v)}
            placeholder="0"
            keyboardType="decimal-pad"
          />
        </Field>

        <Field label="Description">
          <TInput
            value={itemForm.description}
            onChangeText={v => fi('description', v)}
            placeholder="Optional description shown on menu"
            multiline
            numberOfLines={3}
          />
        </Field>

        <Field label="Category">
          {categories.length === 0 ? (
            <Text style={S.noCatHint}>No categories yet — create one in the Categories tab first.</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {categories.map((cat, idx) => {
                  const active = String(itemForm.category_id) === String(cat.id);
                  const cc     = PALETTE[idx % PALETTE.length];
                  return (
                    <TouchableOpacity
                      key={cat.id}
                      style={[S.pill, active && { backgroundColor: cc.bg, borderColor: cc.text }]}
                      onPress={() => fi('category_id', cat.id)}
                    >
                      <Text style={[S.pillTxt, active && { color: cc.text }]}>{cat.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          )}
        </Field>

        <Field label="Availability">
          <View style={S.switchRow}>
            <Switch
              value={itemForm.available}
              onValueChange={v => fi('available', v)}
              trackColor={{ false: '#e2e8f0', true: colors.admin + '66' }}
              thumbColor={itemForm.available ? colors.admin : '#94a3b8'}
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 10 }}>
              {itemForm.available ? (
                <>
                  <MaterialIcons name="check-circle" size={16} color="#16a34a" />
                  <Text style={S.switchLbl}>Active — visible on menu</Text>
                </>
              ) : (
                <>
                  <MaterialIcons name="block" size={16} color="#dc2626" />
                  <Text style={S.switchLbl}>Inactive — hidden from menu</Text>
                </>
              )}
            </View>
          </View>
        </Field>

        {/* ── Item Type ── */}
        <Field label="Item Type" hint="who gets notified when ordered">
          <View style={S.typeRow}>
            {ITEM_TYPES.map(t => {
              const active = (itemForm.item_type || 'food') === t.id;
              return (
                <TouchableOpacity
                  key={t.id}
                  style={[S.typeCard, active && (t.id === 'food' ? S.typeCardFoodOn : S.typeCardSaleOn)]}
                  onPress={() => fi('item_type', t.id)}
                  activeOpacity={0.8}
                >
                  <MaterialIcons name={t.iconName} size={22} color={active ? (t.id === 'food' ? '#15803d' : '#0369a1') : '#94a3b8'} style={{ marginBottom: 4 }} />
                  <Text style={[S.typeLabel, active && { color: t.id === 'food' ? '#15803d' : '#0369a1' }]}>
                    {t.label}
                  </Text>
                  <Text style={S.typeSub}>{t.sub}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Field>

        {/* ── Kitchen Station ── */}
        <Field label="Kitchen Station" hint="which station prepares this item">
          {/* Free-text input for custom station names */}
          <View style={S.stationInputRow}>
            <TextInput
              style={S.stationTextInput}
              value={itemForm.kitchen_station || ''}
              onChangeText={v => fi('kitchen_station', v.trim().length > 0 ? v : null)}
              placeholder="Type station name (or pick below)"
              placeholderTextColor="#94a3b8"
              autoCapitalize="none"
            />
            {!!itemForm.kitchen_station && (
              <TouchableOpacity
                style={S.stationClearBtn}
                onPress={() => fi('kitchen_station', null)}
              >
                <MaterialIcons name="close" size={16} color="#64748b" />
              </TouchableOpacity>
            )}
          </View>
          {/* Quick-pick preset chips header with + button */}
          {(() => {
            const currentVal = (itemForm.kitchen_station || '').trim();
            const alreadyPreset = allStationPresets.some(p =>
              (p.id === null ? currentVal === '' : (p.id || '').toLowerCase() === currentVal.toLowerCase())
            );
            const canAdd = currentVal.length > 0 && !alreadyPreset;
            return (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, marginBottom: 4 }}>
                <Text style={{ fontSize: 9, color: '#94a3b8', fontWeight: '700', letterSpacing: 0.6 }}>QUICK PICK</Text>
                {canAdd && (
                  <TouchableOpacity
                    onPress={addStationToQuickPick}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 3,
                      backgroundColor: '#EEF2FF', borderRadius: 10,
                      paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: '#A5B4FC',
                    }}
                    activeOpacity={0.75}
                  >
                    <MaterialIcons name="add" size={12} color="#6366F1" />
                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#6366F1' }}>Add "{currentVal}"</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })()}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', gap: 8, paddingBottom: 4 }}>
              {allStationPresets.map(ks => {
                const currentVal = (itemForm.kitchen_station || '').toLowerCase();
                const active = ks.id === null
                  ? itemForm.kitchen_station === null
                  : currentVal === (ks.id || '').toLowerCase();
                return (
                  <TouchableOpacity
                    key={String(ks.id)}
                    style={[
                      S.stationCard,
                      active && { backgroundColor: ks.bg, borderColor: ks.text },
                    ]}
                    onPress={() => fi('kitchen_station', active ? null : ks.id)}
                    activeOpacity={0.75}
                  >
                    <MaterialIcons
                      name={ks.icon}
                      size={18}
                      color={active ? ks.text : '#94a3b8'}
                      style={{ marginBottom: 4 }}
                    />
                    <Text style={[S.stationCardLabel, active && { color: ks.text }]}>
                      {ks.label}
                    </Text>
                    <Text style={S.stationCardSub}>{ks.sub}</Text>
                    {/* Delete button on custom chips — red circle at top-right */}
                    {ks.custom && (
                      <TouchableOpacity
                        onPress={() => removeStationFromQuickPick(ks.id)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={{
                          position: 'absolute', top: -6, right: -6,
                          width: 18, height: 18, borderRadius: 9,
                          backgroundColor: '#ef4444', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        <MaterialIcons name="close" size={11} color="#fff" />
                      </TouchableOpacity>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        </Field>

        {/* ── Item Photo ── */}
        <Field label="Item Photo">
          <TouchableOpacity
            onPress={showImageOptions}
            activeOpacity={0.8}
            style={S.imgPicker}
          >
            {imageUploading ? (
              <View style={S.imgPickerEmpty}>
                <ActivityIndicator color={colors.admin} size="large" />
                <Text style={S.imgPickerHint}>Uploading…</Text>
              </View>
            ) : itemForm.image_url ? (
              <View>
                <Image
                  source={{ uri: resolveImgUrl(itemForm.image_url) }}
                  style={S.imgPreview}
                  resizeMode="cover"
                />
                <View style={S.imgEditBadge}>
                  <MaterialIcons name="edit" size={14} color="#fff" />
                  <Text style={{ fontSize: 11, color: '#fff', fontWeight: '700', marginLeft: 4 }}>Change</Text>
                </View>
                <TouchableOpacity
                  style={S.imgRemoveBadge}
                  onPress={() => fi('image_url', '')}
                  activeOpacity={0.8}
                >
                  <MaterialIcons name="close" size={14} color="#fff" />
                  <Text style={{ fontSize: 11, color: '#fff', fontWeight: '700', marginLeft: 3 }}>Remove</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={S.imgPickerEmpty}>
                <MaterialIcons name="add-photo-alternate" size={36} color={colors.admin + '99'} />
                <Text style={S.imgPickerHint}>Tap to add photo</Text>
                <Text style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>Gallery or camera</Text>
              </View>
            )}
          </TouchableOpacity>
        </Field>

        {/* ── Ingredients section ── */}
        <View style={S.ingSection}>
          <View style={S.ingSectionHead}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <MaterialIcons name="receipt" size={16} color="#3730a3" />
              <Text style={S.ingSectionTitle}>Ingredients</Text>
            </View>
            <Text style={S.ingSectionSub}>Kitchen usage — auto-deducted from inventory per order</Text>
          </View>

          {/* Loading indicator while fetching for edit */}
          {ingsFetching ? (
            <View style={S.ingFetchRow}>
              <ActivityIndicator size="small" color={colors.admin} />
              <Text style={S.ingFetchTxt}>Loading current ingredients...</Text>
            </View>
          ) : (
            <>
              {/* Currently linked ingredients */}
              {formIngs.length === 0 ? (
                <View style={S.ingEmpty}>
                  <Text style={S.ingEmptyTxt}>No ingredients linked yet.</Text>
                  <Text style={S.ingEmptySub}>Add ingredients below to track inventory usage.</Text>
                </View>
              ) : (
                <View style={S.ingList}>
                  {formIngs.map(ing => (
                    <View key={ing.ingredient_id} style={S.ingRow}>
                      <View style={S.ingRowLeft}>
                        <Text style={S.ingRowName}>{ing.ingredient_name}</Text>
                        <Text style={S.ingRowQty}>{ing.quantity} {ing.unit} per dish</Text>
                      </View>
                      <TouchableOpacity
                        style={S.ingRemoveBtn}
                        onPress={() => removeFormIng(ing.ingredient_id)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <MaterialIcons name="close" size={12} color="#dc2626" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              {/* Add ingredient row */}
              {allIngredients.length === 0 ? (
                <Text style={S.noCatHint}>
                  No inventory items found. Add ingredients in the Stock/Warehouse tab first.
                </Text>
              ) : (
                <View style={S.ingAddWrap}>
                  {/* ── Step 1: pick ingredient ── */}
                  <Text style={S.ingAddLabel}>1. Select ingredient:</Text>
                  {/* Search bar for ingredients */}
                  <View style={S.ingSearchRow}>
                    <MaterialIcons name="search" size={16} color="#94a3b8" />
                    <TextInput
                      style={S.ingSearchInput}
                      value={ingSearch}
                      onChangeText={setIngSearch}
                      placeholder="Search ingredients..."
                      placeholderTextColor="#94a3b8"
                      autoCapitalize="none"
                    />
                    {ingSearch.length > 0 && (
                      <TouchableOpacity onPress={() => setIngSearch('')}>
                        <MaterialIcons name="close" size={14} color="#94a3b8" />
                      </TouchableOpacity>
                    )}
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={{ marginBottom: 12 }}
                  >
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {allIngredients
                        .filter(ing => !ingSearch.trim() || ing.name.toLowerCase().includes(ingSearch.toLowerCase()))
                        .map(ing => {
                          const picked = String(pickedIngId) === String(ing.id);
                          return (
                            <TouchableOpacity
                              key={ing.id}
                              style={[S.pill, picked && S.pillOn]}
                              onPress={() => { setPickedIngId(ing.id); setPickedIngQty(''); setIngSearch(''); }}
                            >
                              <Text style={[S.pillTxt, picked && S.pillTxtOn]}>{ing.name}</Text>
                              <Text style={[S.pillUnit, picked && { color: 'rgba(255,255,255,0.7)' }]}>
                                {ing.unit}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                    </View>
                  </ScrollView>

                  {/* ── Step 2: quantity per dish (always in inventory's native unit) ── */}
                  <Text style={S.ingAddLabel}>
                    2. Quantity per dish{pickedIngNativeUnit ? ` (in ${pickedIngNativeUnit})` : ''}:
                  </Text>
                  {pickedIngNativeUnit ? (
                    <Text style={{ fontSize: 11, color: '#f59e0b', marginBottom: 6 }}>
                      ⚠ Enter in {pickedIngNativeUnit} — same unit as the inventory item
                    </Text>
                  ) : null}
                  <View style={S.ingAddRow}>
                    <TextInput
                      style={[S.input, { flex: 1 }]}
                      value={pickedIngQty}
                      onChangeText={setPickedIngQty}
                      placeholder={pickedIngNativeUnit ? `e.g. 0.05 for 50ml if unit is liter` : 'Select ingredient first'}
                      placeholderTextColor="#94a3b8"
                      keyboardType="decimal-pad"
                      returnKeyType="done"
                      onSubmitEditing={addFormIng}
                    />
                    <TouchableOpacity
                      style={[
                        S.btn,
                        { minWidth: 72, paddingVertical: 13 },
                        (!pickedIngId || !pickedIngQty) && { backgroundColor: '#94a3b8' },
                      ]}
                      onPress={addFormIng}
                      disabled={!pickedIngId || !pickedIngQty}
                    >
                      <Text style={S.btnTxt}>+ Add</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </>
          )}
        </View>

        {/* ── Save / Cancel ── */}
        <View style={S.btnRow}>
          <Btn label={editingItem ? 'Save Changes' : 'Add Item'} onPress={saveItem} loading={saving} />
          <Btn label="Cancel" onPress={() => setItemSheet(false)} outline />
        </View>
      </Sheet>

      {/* ══════════════════════════════════════════
          CATEGORY SHEET (add / rename)
      ══════════════════════════════════════════ */}
      <Sheet
        visible={catSheet}
        onClose={() => setCatSheet(false)}
        title={editingCat ? 'Rename Category' : 'New Category'}
      >
        <Field label="Category Name *">
          <TInput
            value={catName}
            onChangeText={setCatName}
            placeholder="e.g. Starters, Mains, Desserts, Drinks..."
            returnKeyType="done"
            onSubmitEditing={saveCat}
          />
        </Field>
        <View style={S.btnRow}>
          <Btn label={editingCat ? 'Save' : 'Add Category'} onPress={saveCat} loading={catSaving} />
          <Btn label="Cancel" onPress={() => setCatSheet(false)} outline />
        </View>
      </Sheet>

      <ConfirmDialog dialog={dialog} onClose={() => setDialog(null)} />

    </SafeAreaView>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#f1f5f9' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f1f5f9' },

  // Header
  header:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 20, paddingTop: topInset + 14, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  headerTitle: { fontSize: 24, fontWeight: '900', color: '#0f172a' },
  headerSub:   { fontSize: 12, color: '#94a3b8', marginTop: 1, fontWeight: '500' },
  avatar:      { width: 40, height: 40, borderRadius: 20, backgroundColor: '#dbeafe', justifyContent: 'center', alignItems: 'center' },
  avatarTxt:   { fontSize: 16, fontWeight: '800', color: '#3b82f6' },

  // Tabs
  tabRow:       { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  tab:          { flex: 1, paddingVertical: 14, alignItems: 'center' },
  tabActive:    { borderBottomWidth: 2.5, borderBottomColor: colors.admin },
  tabTxt:       { fontSize: 13, fontWeight: '600', color: '#94a3b8' },
  tabTxtActive: { color: colors.admin, fontWeight: '700' },

  // Search
  searchWrap:  { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', marginHorizontal: 16, marginTop: 12, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', paddingHorizontal: 12, paddingVertical: 10 },
  searchIcon:  { fontSize: 14, marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, color: '#0f172a', padding: 0 },
  searchClear: { fontSize: 11, color: '#94a3b8', fontWeight: '700', paddingLeft: 8 },

  // Filter chips
  filterWrap:          { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0', marginTop: 8 },
  filterContent:       { paddingHorizontal: 16, paddingVertical: 10, gap: 8, alignItems: 'center' },
  filterChip:          { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0' },
  filterChipActive:    { backgroundColor: colors.admin, borderColor: colors.admin },
  filterChipTxt:       { fontSize: 12, fontWeight: '600', color: '#64748b' },
  filterChipTxtActive: { color: '#fff' },
  filterBadge:         { backgroundColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 5, paddingVertical: 1 },
  filterBadgeTxt:      { fontSize: 10, fontWeight: '700', color: '#64748b' },

  // List
  listContent: { padding: 16, paddingBottom: 110 },

  // Item card
  itemCard:     { backgroundColor: '#fff', borderRadius: 16, marginBottom: 12, overflow: 'hidden', ...shadow.md },
  itemRow:      { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  itemThumb:    { width: 52, height: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  itemThumbImg: { width: 52, height: 52, borderRadius: 14, flexShrink: 0 },
  itemThumbTxt: { fontSize: 24, fontWeight: '900' },
  itemName:     { fontSize: 15, fontWeight: '800', color: '#0f172a', marginBottom: 3 },
  catBadge:     { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, marginBottom: 3 },
  catBadgeTxt:  { fontSize: 10, fontWeight: '700' },
  itemDesc:     { fontSize: 11, color: '#94a3b8' },
  itemRight:    { alignItems: 'flex-end', gap: 2 },
  itemPrice:    { fontSize: 13, fontWeight: '800', color: '#0f172a' },
  availLbl:     { fontSize: 10, fontWeight: '600' },
  itemActions:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingBottom: 12, gap: 8 },

  // Chips
  chip:    { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  chipTxt: { fontSize: 11, fontWeight: '700' },

  // Category card
  catCard:      { backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 12, ...shadow.md },
  catDot:       { width: 46, height: 46, borderRadius: 23, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  catDotTxt:    { fontSize: 20, fontWeight: '900' },
  catName:      { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  catCount:     { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  catActions:   { flexDirection: 'row', alignItems: 'center' },
  arrowBtn:     { width: 32, height: 32, borderRadius: 8, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0', marginLeft: 4 },
  arrowDisabled:{ opacity: 0.25 },
  arrowTxt:     { fontSize: 16, color: '#0f172a', fontWeight: '700' },

  // Empty
  empty:    { alignItems: 'center', paddingTop: 72 },
  emptyIcon:{ fontSize: 52, marginBottom: 12 },
  emptyTxt: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  emptySub: { fontSize: 13, color: '#94a3b8', marginTop: 4 },

  // FAB
  fab:    { position: 'absolute', bottom: 28, right: 20, backgroundColor: colors.admin, paddingHorizontal: 22, paddingVertical: 15, borderRadius: 999, ...shadow.lg },
  fabTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },

  // Sheet
  overlay:    { flex: 1, justifyContent: 'flex-end' },
  overlayBg:  { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet:      { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%' },
  sheetHandle:{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#e2e8f0', alignSelf: 'center', marginTop: 10 },
  sheetHead:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  sheetX:     { width: 30, height: 30, borderRadius: 15, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center' },
  sheetXTxt:  { fontSize: 13, color: '#64748b', fontWeight: '700' },

  // Field
  field:     { marginHorizontal: 20, marginBottom: 14, marginTop: 4 },
  fieldLbl:  { fontSize: 10, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8 },
  fieldHint: { fontSize: 10, color: '#cbd5e1', fontStyle: 'italic' },
  input:     { backgroundColor: '#f8fafc', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', paddingHorizontal: 14, paddingVertical: 13, fontSize: 14, color: '#0f172a' },
  inputMulti:{ height: 80, textAlignVertical: 'top' },

  // Buttons
  btnRow:        { gap: 10, marginHorizontal: 20, marginTop: 8 },
  btn:           { backgroundColor: colors.admin, borderRadius: 14, paddingVertical: 15, alignItems: 'center', justifyContent: 'center' },
  btnDanger:     { backgroundColor: '#dc2626' },
  btnOutline:    { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0' },
  btnTxt:        { color: '#fff', fontWeight: '800', fontSize: 14 },
  btnTxtOutline: { color: '#64748b', fontWeight: '600', fontSize: 14 },

  // Pills
  pill:     { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center' },
  pillOn:   { backgroundColor: colors.admin, borderColor: colors.admin },
  pillTxt:  { fontSize: 13, fontWeight: '600', color: '#64748b' },
  pillTxtOn:{ color: '#fff' },
  pillUnit: { fontSize: 10, color: '#94a3b8', marginTop: 1 },

  // Switch row
  switchRow: { flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'center', backgroundColor: '#f8fafc', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', paddingHorizontal: 14, paddingVertical: 12 },
  switchLbl: { fontSize: 13, color: '#0f172a', fontWeight: '500', flex: 1, marginRight: 8 },

  noCatHint: { fontSize: 13, color: '#94a3b8', fontStyle: 'italic', marginTop: 4 },

  // ── Ingredients section (inside item form) ──────────────────────────────────
  ingSection:     { marginHorizontal: 20, marginBottom: 16, marginTop: 4, backgroundColor: '#f8fafc', borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden' },
  ingSectionHead: { backgroundColor: '#eef2ff', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#e0e7ff' },
  ingSectionTitle:{ fontSize: 14, fontWeight: '800', color: '#3730a3' },
  ingSectionSub:  { fontSize: 11, color: '#6366f1', marginTop: 2 },

  ingFetchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16 },
  ingFetchTxt: { fontSize: 13, color: '#94a3b8' },

  ingEmpty:    { padding: 16, alignItems: 'center' },
  ingEmptyTxt: { fontSize: 13, color: '#64748b', fontWeight: '600' },
  ingEmptySub: { fontSize: 11, color: '#94a3b8', marginTop: 3, textAlign: 'center' },

  ingList: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  ingRow:  { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  ingRowLeft: { flex: 1 },
  ingRowName: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  ingRowQty:  { fontSize: 11, color: '#64748b', marginTop: 2 },
  ingRemoveBtn: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#fee2e2', justifyContent: 'center', alignItems: 'center' },
  ingRemoveTxt: { fontSize: 11, color: '#dc2626', fontWeight: '800' },

  ingAddWrap:   { padding: 16, borderTopWidth: 1, borderTopColor: '#e2e8f0' },
  ingAddLabel:  { fontSize: 10, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  ingAddRow:    { flexDirection: 'row', gap: 10 },
  ingSearchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', paddingHorizontal: 10, paddingVertical: 8, marginBottom: 10 },
  ingSearchInput:{ flex: 1, fontSize: 13, color: '#0f172a', padding: 0 },

  // Unit selector chips
  unitChip:      { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: '#f1f5f9', borderWidth: 1.5, borderColor: '#e2e8f0' },
  unitChipOn:    { backgroundColor: '#0f172a', borderColor: '#0f172a' },
  unitChipTxt:   { fontSize: 12, fontWeight: '700', color: '#64748b' },
  unitChipTxtOn: { color: '#fff' },

  // Item type picker
  typeRow:          { flexDirection: 'row', gap: 10, marginTop: 6 },
  typeCard:         { flex: 1, borderRadius: 14, borderWidth: 2, borderColor: '#e2e8f0', backgroundColor: '#f8fafc', padding: 14, alignItems: 'center', gap: 3 },
  typeCardFoodOn:   { backgroundColor: '#dcfce7', borderColor: '#16a34a' },
  typeCardSaleOn:   { backgroundColor: '#e0f2fe', borderColor: '#0284c7' },
  typeEmoji:        { fontSize: 26, marginBottom: 2 },
  typeLabel:        { fontSize: 14, fontWeight: '800', color: '#0f172a' },
  typeSub:          { fontSize: 10, color: '#64748b', textAlign: 'center' },
  typeComingSoon:   { marginTop: 4, backgroundColor: '#fef9c3', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  typeComingSoonTxt:{ fontSize: 9, fontWeight: '700', color: '#a16207' },

  // Kitchen station picker
  stationInputRow:  { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 10, backgroundColor: '#f8fafc', paddingHorizontal: 10, marginTop: 4 },
  stationTextInput: { flex: 1, height: 40, fontSize: 14, color: '#0f172a', paddingVertical: 0 },
  stationClearBtn:  { padding: 4 },
  stationCard:      { width: 100, borderRadius: 12, borderWidth: 2, borderColor: '#e2e8f0', backgroundColor: '#f8fafc', padding: 12, alignItems: 'center', gap: 2 },
  stationCardLabel: { fontSize: 13, fontWeight: '800', color: '#0f172a' },
  stationCardSub:   { fontSize: 9, color: '#64748b', textAlign: 'center' },

  // Item type badge on cards
  typeBadgeFood:    { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: '#dcfce7' },
  typeBadgeFoodTxt: { fontSize: 9, fontWeight: '700', color: '#15803d' },
  typeBadgeSale:    { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: '#e0f2fe' },
  typeBadgeSaleTxt: { fontSize: 9, fontWeight: '700', color: '#0369a1' },

  // Image picker
  imgPicker:        { borderRadius: 16, overflow: 'hidden', borderWidth: 2, borderColor: '#e2e8f0', borderStyle: 'dashed' },
  imgPickerEmpty:   { height: 140, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc', gap: 6 },
  imgPickerHint:    { fontSize: 13, fontWeight: '600', color: '#94a3b8' },
  imgPreview:       { width: '100%', height: 180, borderRadius: 14 },
  imgEditBadge:     { position: 'absolute', bottom: 8, right: 8, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  imgRemoveBadge:   { position: 'absolute', bottom: 8, left: 8, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(220,38,38,0.85)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
});

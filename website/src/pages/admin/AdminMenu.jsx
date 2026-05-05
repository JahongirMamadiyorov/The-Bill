import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from '../../context/LanguageContext';
import { useApi, money } from '../../hooks/useApi';
import { menuAPI, warehouseAPI } from '../../api/client';
import ConfirmDialog from '../../components/ConfirmDialog';
import {
  Plus, Edit2, Trash2, X, Search, Tag,
  Clock, AlertTriangle, Link, UtensilsCrossed,
  ToggleLeft, ToggleRight, Layers,
  ChefHat, Wine, Leaf, Flame, Snowflake, LayoutGrid, Cake,
  ArrowUp, ArrowDown,
} from 'lucide-react';

// ── Resolve image URLs (Android emulator uses 10.0.2.2 instead of localhost) ──
const resolveImgUrl = (url) => {
  if (!url) return '';
  return url
    .replace('http://10.0.2.2:', 'http://localhost:')
    .replace('https://10.0.2.2:', 'https://localhost:');
};

// ── Item Types (needs t for labels) ──────────────────────────────────────────
const getItemTypes = (t) => [
  { id: 'food', Icon: ChefHat,  label: t('admin.menu.food'), sub: t('admin.menu.foodHint'),  activeBg: 'bg-green-50',  activeBorder: 'border-green-400', activeText: 'text-green-700',  activeIcon: 'text-green-600' },
  { id: 'sale', Icon: Wine,     label: t('admin.menu.sale'), sub: t('admin.menu.saleHint'),  activeBg: 'bg-blue-50',   activeBorder: 'border-blue-400',  activeText: 'text-blue-700',   activeIcon: 'text-blue-600'  },
];

// ── Kitchen Stations (needs t for labels) ───────────────────────────────────
const getKitchenStations = (t) => [
  { id: '',       Icon: LayoutGrid, label: t('common.all'),  sub: '',               bg: 'bg-gray-50',    border: 'border-gray-200',   text: 'text-gray-600'  },
  { id: 'salad',  Icon: Leaf,       label: 'Salad',          sub: 'Salad',          bg: 'bg-green-50',   border: 'border-green-200',  text: 'text-green-700' },
  { id: 'grill',  Icon: Flame,      label: 'Grill',          sub: 'Grill',          bg: 'bg-orange-50',  border: 'border-orange-200', text: 'text-orange-700'},
  { id: 'bar',    Icon: Wine,       label: t('admin.menu.barBadge'),   sub: t('admin.menu.barBadge'),    bg: 'bg-blue-50',    border: 'border-blue-200',   text: 'text-blue-700'  },
  { id: 'pastry', Icon: Cake,       label: 'Pastry',         sub: 'Pastry',         bg: 'bg-purple-50',  border: 'border-purple-200', text: 'text-purple-700'},
  { id: 'cold',   Icon: Snowflake,  label: 'Cold',           sub: 'Cold',           bg: 'bg-cyan-50',    border: 'border-cyan-200',   text: 'text-cyan-700'  },
  { id: 'hot',    Icon: Flame,      label: 'Hot',            sub: 'Hot',            bg: 'bg-red-50',     border: 'border-red-200',    text: 'text-red-700'   },
];

export default function AdminMenu() {
  const { call } = useApi();
  const { t } = useTranslation();

  // Build config arrays inside component so they have access to t()
  const ITEM_TYPES = useMemo(() => getItemTypes(t), [t]);
  const KITCHEN_STATIONS = useMemo(() => getKitchenStations(t), [t]);

  // ── Data ──────────────────────────────────────────────────────────────────
  const [categories,    setCategories]    = useState([]);
  const [items,         setItems]         = useState([]);
  const [pageLoading,   setPageLoading]   = useState(true);

  // ── UI state ──────────────────────────────────────────────────────────────
  const [selectedCat,   setSelectedCat]   = useState(null); // null = All
  const [searchQuery,   setSearchQuery]   = useState('');

  // ── Modals ─────────────────────────────────────────────────────────────────
  const [modal,         setModal]         = useState(null);
  const [editId,        setEditId]        = useState(null);
  const [deleteId,      setDeleteId]      = useState(null);
  const [deleteType,    setDeleteType]    = useState(null);
  const [imageUploading, setImageUploading] = useState(false);
  // Dialog state (replaces stationToDelete and stationDeleteError)
  const [dialog, setDialog] = useState(null);

  // ── Forms ──────────────────────────────────────────────────────────────────
  const [catForm,       setCatForm]       = useState({ name: '', sortOrder: 0 });
  const [itemForm,      setItemForm]      = useState({
    name: '', price: '', description: '', categoryId: '',
    isAvailable: true, itemType: 'food', station: '', imageUrl: '',
    unit: 'piece',
  });

  // ── Custom kitchen stations (persisted in backend DB — shared with app) ─────
  const [customStations, setCustomStations] = useState([]); // loaded from backend
  const fetchStations = useCallback(async () => {
    try {
      const data = await menuAPI.getStations();
      setCustomStations(Array.isArray(data) ? data : []);
    } catch { /* silently ignore */ }
  }, []);

  // Merge: built-in presets + DB custom stations (items-derived duplicates filtered)
  const allStationPresets = (itemsList) => {
    const builtinIds = new Set(KITCHEN_STATIONS.map(s => s.id.toLowerCase()));
    // Also pull unique stations from existing menu items so stations used by items always appear
    const fromItems = [...new Set(
      (itemsList || [])
        .map(i => (i.kitchenStation || i.kitchen_station || i.station || '').trim())
        .filter(s => s && !builtinIds.has(s.toLowerCase()))
    )];
    const fromDb = customStations.filter(
      s => !builtinIds.has(s.toLowerCase()) && !fromItems.map(x => x.toLowerCase()).includes(s.toLowerCase())
    );
    return [
      ...KITCHEN_STATIONS,
      ...[...fromItems, ...fromDb].map(s => ({
        id: s, label: s, sub: t('admin.menu.customStation'), custom: true,
        bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700',
        Icon: UtensilsCrossed,
      })),
    ];
  };
  const addStationPreset = async (val) => {
    const trimmed = val.trim();
    if (!trimmed) return;
    // Optimistic update so the tile appears immediately
    setCustomStations(prev => prev.some(s => s.toLowerCase() === trimmed.toLowerCase()) ? prev : [...prev, trimmed]);
    try {
      const updated = await menuAPI.addStation(trimmed);
      if (Array.isArray(updated)) setCustomStations(updated); // sync with DB truth
    } catch (err) {
      console.error('addStation failed:', err);
      fetchStations(); // revert on error
    }
  };
  const removeStationPreset = (name) => {
    setDialog({
      title: t('admin.menu.deleteStationTitle'),
      message: t('admin.menu.deleteStationMessage', { name }),
      type: 'danger',
      confirmLabel: t('common.delete'),
      onConfirm: async () => {
        setDialog(null);
        setCustomStations(prev => prev.filter(s => s.toLowerCase() !== name.toLowerCase()));
        try {
          await menuAPI.deleteStation(name);
        } catch (err) {
          const msg = err?.error || err?.message || t('alerts.failedDeleteStation', 'Failed to delete station');
          setDialog({ title: t('admin.menu.cannotDeleteStation'), message: msg, type: 'warning' });
          fetchStations();
        }
      },
    });
  };

  // ── Ingredients ────────────────────────────────────────────────────────────
  const [ingredients,        setIngredients]        = useState([]);
  const [pendingIngredients, setPendingIngredients] = useState([]); // for new items before save
  const [warehouseItems,     setWarehouseItems]     = useState([]);
  const [newIngredient,      setNewIngredient]      = useState({ warehouseItemId: '', quantityPerDish: '' });
  const [ingSearch,          setIngSearch]          = useState('');

  const [saving, setSaving] = useState(false);
  const pollRef      = useRef(null);
  const reorderingRef = useRef(false); // blocks poll from overwriting during reorder

  // ── Fetch: initial (shows loading) + silent background poll ───────────────
  const fetchData = useCallback(async (silent = false) => {
    // Don't let the background poll overwrite optimistic state while we're saving a reorder
    if (silent && reorderingRef.current) return;
    try {
      const [cats, itms] = await Promise.all([
        menuAPI.getCategories(),
        menuAPI.getItems(),
      ]);
      setCategories(Array.isArray(cats) ? cats : []);
      setItems(Array.isArray(itms) ? itms : []);
      if (!silent && Array.isArray(cats) && cats.length > 0) {
        setSelectedCat(null); // start on "All"
      }
    } catch (err) {
      console.error(err);
    } finally {
      if (!silent) setPageLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(false);
    fetchStations(); // load custom stations from backend once on mount
    pollRef.current = setInterval(() => fetchData(true), 5000); // silent every 5s
    return () => clearInterval(pollRef.current);
  }, [fetchData, fetchStations]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const displayItems = (selectedCat === 'inactive'
    ? items.filter(i => i.isAvailable === false)
    : selectedCat === null
      ? items
      : items.filter(i => i.categoryId === selectedCat)
  ).slice().sort((a, b) => {
    // Active items first, then inactive
    const aAvail = a.isAvailable !== false ? 0 : 1;
    const bAvail = b.isAvailable !== false ? 0 : 1;
    if (aAvail !== bAvail) return aAvail - bAvail;
    return (a.sortOrder ?? 999) - (b.sortOrder ?? 999) || a.name.localeCompare(b.name);
  });

  const filteredItems = displayItems.filter(i =>
    i.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (i.description || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalItems     = items.length;
  const availableCount = items.filter(i => i.isAvailable).length;

  // ── Category modal ─────────────────────────────────────────────────────────
  const openCategoryModal = useCallback((cat = null) => {
    if (cat) {
      setEditId(cat.id);
      setCatForm({ name: cat.name, sortOrder: cat.sortOrder ?? 0 });
      setModal('edit-cat');
    } else {
      setEditId(null);
      setCatForm({ name: '', sortOrder: 0 });
      setModal('add-cat');
    }
  }, []);

  const handleSaveCategory = async () => {
    if (!catForm.name.trim()) return;
    setSaving(true);
    try {
      if (modal === 'add-cat') {
        await call(menuAPI.createCategory, catForm);
      } else {
        await call(menuAPI.updateCategory, editId, catForm);
      }
      const cats = await menuAPI.getCategories();
      setCategories(Array.isArray(cats) ? cats : []);
      setModal(null); setEditId(null);
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  };

  const handleDeleteCategory = async () => {
    if (!deleteId) return;
    setSaving(true);
    try {
      await call(menuAPI.deleteCategory, deleteId);
      const cats = await menuAPI.getCategories();
      setCategories(Array.isArray(cats) ? cats : []);
      setSelectedCat(null);
      setDeleteId(null); setDeleteType(null);
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  };

  // ── Item modal ─────────────────────────────────────────────────────────────
  const openItemModal = useCallback(async (item = null) => {
    try {
      const warehouse = await warehouseAPI.getAll();
      setWarehouseItems(Array.isArray(warehouse) ? warehouse : []);
    } catch { setWarehouseItems([]); }

    if (item) {
      setEditId(item.id);
      setItemForm({
        name: item.name, price: item.price.toString(),
        description: item.description || '',
        categoryId: item.categoryId, isAvailable: item.isAvailable,
        itemType: item.itemType || item.item_type || 'food',
        station: item.kitchenStation || item.kitchen_station || item.station || '',
        imageUrl: item.imageUrl || item.image_url || '',
        unit: (item.unit || 'piece').toLowerCase(),
      });
      setNewIngredient({ warehouseItemId: '', quantityPerDish: '' });
      try {
        const ing = await menuAPI.getItemIngredients(item.id);
        // Interceptor unwraps r.data + camelizes, so ing is already the array
        setIngredients(Array.isArray(ing) ? ing : []);
      } catch { setIngredients([]); }
      setModal('edit-item');
    } else {
      setEditId(null);
      setItemForm({
        name: '', price: '', description: '',
        categoryId: selectedCat || (categories[0]?.id ?? ''),
        isAvailable: true, itemType: 'food', station: '', imageUrl: '',
        unit: 'piece',
      });
      setIngredients([]);
      setPendingIngredients([]);
      setNewIngredient({ warehouseItemId: '', quantityPerDish: '' });
      setModal('add-item');
    }
  }, [selectedCat, categories]);

  const handleSaveItem = async () => {
    if (!itemForm.name.trim() || !itemForm.price || !itemForm.categoryId) return;
    setSaving(true);
    try {
      const payload = {
        ...itemForm,
        kitchenStation: itemForm.station || null, // interceptor → kitchen_station for backend
        price: parseInt(itemForm.price),
        itemType: itemForm.itemType || 'food',
        unit: (itemForm.unit || 'piece').toLowerCase(),
      };
      if (modal === 'add-item') {
        const created = await call(menuAPI.createItem, payload);
        // Flush any ingredients added before the item existed
        const newId = created?.id || created?.data?.id;
        if (newId && pendingIngredients.length > 0) {
          await Promise.allSettled(
            pendingIngredients.map(ing =>
              menuAPI.addItemIngredient(newId, {
                // camelCase — request interceptor converts to snake_case
                ingredientId: ing.ingredientId,
                quantity:     ing.quantity,
              })
            )
          );
        }
        setPendingIngredients([]);
      } else {
        await call(menuAPI.updateItem, editId, payload);
      }
      const itms = await menuAPI.getItems();
      setItems(Array.isArray(itms) ? itms : []);
      setModal(null); setEditId(null);
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  };

  const handleDeleteItem = async () => {
    if (!deleteId) return;
    setSaving(true);
    try {
      await call(menuAPI.deleteItem, deleteId);
      setItems(prev => prev.filter(i => i.id !== deleteId));
      setDeleteId(null); setDeleteType(null);
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  };

  // ── Move category up/down ────────────────────────────────────────────────
  const moveCategory = async (cat, dir) => {
    // Normalize ALL categories to sequential indices first.
    // Only saving the 2 swapped categories leaves others at sort_order=0 in the DB,
    // so on refresh the DB sort-by-name overrides the saved order.
    const sorted = [...categories].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const normalized = sorted.map((c, i) => ({ ...c, sortOrder: i }));

    const idx = normalized.findIndex(c => c.id === cat.id);
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= normalized.length) return;

    // Build the fully-reordered list
    const reordered = normalized.map((c, i) => {
      if (i === idx)     return { ...c, sortOrder: swapIdx };
      if (i === swapIdx) return { ...c, sortOrder: idx };
      return c;
    });

    // Optimistic update — all categories get correct sortOrder
    const orderMap = new Map(reordered.map(c => [c.id, c.sortOrder]));
    setCategories(prev => prev.map(c => ({ ...c, sortOrder: orderMap.get(c.id) ?? c.sortOrder })));

    // Block poll from overwriting while we save to DB
    reorderingRef.current = true;
    try {
      // Save ALL categories so every row has a unique sort_order in the DB
      await Promise.all(
        reordered.map(c => menuAPI.updateCategory(c.id, { name: c.name, sortOrder: c.sortOrder }))
      );
    } catch (err) {
      console.error('Category reorder failed', err);
    } finally {
      reorderingRef.current = false;
    }
  };

  // ── Quick availability toggle ──────────────────────────────────────────────
  const toggleAvailability = async (item) => {
    const optimistic = items.map(i =>
      i.id === item.id ? { ...i, isAvailable: !i.isAvailable } : i
    );
    setItems(optimistic); // instant UI update
    try {
      await menuAPI.updateItem(item.id, { ...item, isAvailable: !item.isAvailable });
    } catch {
      setItems(items); // revert on error
    }
  };

  // ── Image upload ───────────────────────────────────────────────────────────
  const handleImageFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageUploading(true);
    try {
      const res = await menuAPI.uploadImage(file);
      // Use fullUrl (absolute) for storage so the image works everywhere.
      // Fall back to url (relative) if fullUrl is missing.
      // Interceptor already unwraps r.data, so res IS the response body directly
      const url = res?.fullUrl || res?.url;
      if (url) setItemForm(f => ({ ...f, imageUrl: url }));
      else setDialog({ title: t('admin.menu.uploadIssueTitle'), message: t('admin.menu.uploadIssueMessage'), type: 'warning' });
    } catch (err) {
      console.error('Image upload failed', err);
      setDialog({ title: t('admin.menu.uploadFailedTitle'), message: err?.error || err?.message || t('common.error'), type: 'error' });
    } finally {
      setImageUploading(false);
      e.target.value = ''; // reset so same file can be re-picked
    }
  };

  // ── Ingredients ────────────────────────────────────────────────────────────
  // API returns camelized: { ingredientId, ingredientName, quantity, unit }
  // POST body sent as camelCase — request interceptor snake_cases it automatically
  const handleAddIngredient = async () => {
    if (!newIngredient.warehouseItemId || !newIngredient.quantityPerDish) return;
    const wi = warehouseItems.find(w => w.id === newIngredient.warehouseItemId);
    if (modal === 'add-item') {
      // Store locally (camelCase to match API response shape)
      setPendingIngredients(prev => [...prev, {
        ingredientId:   newIngredient.warehouseItemId,
        quantity:       parseFloat(newIngredient.quantityPerDish),
        ingredientName: wi?.name || '—',
        unit:           wi?.unit || '',
      }]);
      setNewIngredient({ warehouseItemId: '', quantityPerDish: '' });
      return;
    }
    if (!editId) return;
    try {
      // Send camelCase — request interceptor converts to snake_case for the API
      await call(menuAPI.addItemIngredient, editId, {
        ingredientId: newIngredient.warehouseItemId,
        quantity:     parseFloat(newIngredient.quantityPerDish),
      });
      const ing = await menuAPI.getItemIngredients(editId);
      // Interceptor unwraps + camelizes: ing is already the array
      setIngredients(Array.isArray(ing) ? ing : []);
      setNewIngredient({ warehouseItemId: '', quantityPerDish: '' });
    } catch (err) { console.error(err); }
  };

  const handleRemoveIngredient = async (ingId) => {
    try {
      await call(menuAPI.removeItemIngredient, editId, ingId);
      const ing = await menuAPI.getItemIngredients(editId);
      setIngredients(Array.isArray(ing) ? ing : []);
    } catch (err) { console.error(err); }
  };

  // Also fix ingredient loads — interceptor already camelizes + unwraps
  // so getItemIngredients resolves to an array directly, not {data:[...]}

  // ── Loading ────────────────────────────────────────────────────────────────
  if (pageLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500 text-sm">{t('admin.menu.loadingMenu')}</p>
        </div>
      </div>
    );
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  const closeModal = () => { setModal(null); setEditId(null); setIngSearch(''); };

  const InputCls = 'w-full px-3 py-2.5 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm transition';
  const LabelCls = 'block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5';

  return (
    <div className="flex flex-col h-full bg-gray-50">

      {/* ══════════════════════════════════════════════════
          HEADER
      ══════════════════════════════════════════════════ */}
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{t("admin.menu.title")}</h1>
              <p className="text-sm text-gray-400 mt-0.5">{t("admin.menu.subtitle")}</p>
            </div>
            {/* Stats chips */}
            <div className="hidden md:flex items-center gap-2 ml-4">
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 rounded-full">
                <Layers size={13} className="text-gray-500" />
                <span className="text-xs font-semibold text-gray-600">{t("admin.menu.totalItems", {count: totalItems})}</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 rounded-full border border-green-100">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                <span className="text-xs font-semibold text-green-700">{t("admin.menu.available", {count: availableCount})}</span>
              </div>
              {totalItems - availableCount > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 rounded-full border border-red-100">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                  <span className="text-xs font-semibold text-red-600">{t("admin.menu.unavailable", {count: totalItems - availableCount})}</span>
                </div>
              )}
            </div>
          </div>
          <button
            onClick={() => openItemModal()}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Plus size={16} />
            {t('admin.menu.addItem')}
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════
          BODY
      ══════════════════════════════════════════════════ */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── LEFT SIDEBAR: Categories ── */}
        <div className="w-64 bg-white border-r border-gray-100 flex flex-col flex-shrink-0">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <span className="text-sm font-bold text-gray-700">{t("admin.menu.categories")}</span>
            <button
              onClick={() => openCategoryModal()}
              className="w-7 h-7 bg-blue-600 text-white rounded-lg flex items-center justify-center hover:bg-blue-700 transition-colors"
              title={t('admin.menu.addCategory')}
            >
              <Plus size={14} />
            </button>
          </div>

          <div className="overflow-y-auto flex-1 py-1">
            {/* All */}
            <button
              onClick={() => setSelectedCat(null)}
              className={`w-full text-left px-4 py-2.5 flex items-center justify-between transition-colors ${
                selectedCat === null
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span className="text-sm font-semibold">{t("admin.menu.allItems")}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                selectedCat === null ? 'bg-blue-200 text-blue-700' : 'bg-gray-100 text-gray-500'
              }`}>{totalItems}</span>
            </button>

            {/* Category list */}
            {[...categories].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)).map(cat => {
              const count = items.filter(i => i.categoryId === cat.id).length;
              const isActive = selectedCat === cat.id;
              return (
                <div key={cat.id} className={`group border-b border-gray-50 last:border-0 ${isActive ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                  <button
                    onClick={() => setSelectedCat(cat.id)}
                    className="w-full text-left px-4 py-2.5 flex items-center justify-between"
                  >
                    <span className={`text-sm font-medium ${isActive ? 'text-blue-700' : 'text-gray-700'}`}>
                      {cat.name}
                    </span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                      isActive ? 'bg-blue-200 text-blue-700' : 'bg-gray-100 text-gray-500'
                    }`}>{count}</span>
                  </button>

                  {/* Arrows + Edit + Delete — show on hover or when active */}
                  <div className={`px-3 pb-2.5 flex gap-1.5 ${isActive ? 'flex' : 'hidden group-hover:flex'}`}>
                    <button
                      onClick={(e) => { e.stopPropagation(); moveCategory(cat, 'up'); }}
                      title={t('admin.menu.moveUp')}
                      className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-100 hover:bg-indigo-200 text-indigo-600 transition-colors border border-indigo-200"
                    >
                      <ArrowUp size={14} strokeWidth={2.5} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); moveCategory(cat, 'down'); }}
                      title={t('admin.menu.moveDown')}
                      className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-100 hover:bg-indigo-200 text-indigo-600 transition-colors border border-indigo-200"
                    >
                      <ArrowDown size={14} strokeWidth={2.5} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); openCategoryModal(cat); }}
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors border border-blue-100"
                    >
                      <Edit2 size={11} /> {t('common.edit')}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteId(cat.id); setDeleteType('category'); }}
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs font-semibold text-red-500 bg-red-50 hover:bg-red-100 rounded-lg transition-colors border border-red-100"
                    >
                      <Trash2 size={11} /> {t('common.delete')}
                    </button>
                  </div>
                </div>
              );
            })}

            {/* ── Permanent "Inactive" filter — always at the bottom ── */}
            <button
              onClick={() => setSelectedCat('inactive')}
              className={`w-full text-left px-4 py-2.5 flex items-center justify-between transition-colors border-t border-gray-100 ${
                selectedCat === 'inactive'
                  ? 'bg-red-50 text-red-700'
                  : 'text-gray-400 hover:bg-red-50 hover:text-red-600'
              }`}
            >
              <span className="text-sm font-semibold flex items-center gap-1.5">
                <ToggleLeft size={14} />
                {t('admin.menu.inactive')}
              </span>
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                selectedCat === 'inactive' ? 'bg-red-200 text-red-700' : 'bg-red-100 text-red-400'
              }`}>{items.filter(i => i.isAvailable === false).length}</span>
            </button>
          </div>
        </div>

        {/* ── RIGHT PANEL: Items ── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Search + Add button for selected category */}
          <div className="bg-white border-b border-gray-100 px-5 py-3 flex items-center gap-3 flex-shrink-0">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
              <input
                type="text"
                placeholder={selectedCat === 'inactive' ? t('admin.menu.searchInactiveItems') : selectedCat ? t('admin.menu.searchCategoryItems', { name: categories.find(c => c.id === selectedCat)?.name ?? '' }) : t('admin.menu.searchAllItems')}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm transition"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X size={14} />
                </button>
              )}
            </div>
            {selectedCat && selectedCat !== 'inactive' && (
              <button
                onClick={() => openItemModal()}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors whitespace-nowrap"
              >
                <Plus size={14} />
                {t('admin.menu.addToCategory', { name: categories.find(c => c.id === selectedCat)?.name })}
              </button>
            )}
            {searchQuery && (
              <span className="text-xs text-gray-400 whitespace-nowrap">{t('admin.menu.foundCount', { count: filteredItems.length })}</span>
            )}
          </div>

          {/* Items grid */}
          <div className="flex-1 overflow-y-auto p-5">
            {filteredItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
                  <UtensilsCrossed size={28} className="text-gray-300" />
                </div>
                <p className="text-gray-600 font-semibold">
                  {searchQuery ? t('admin.menu.noItemsMatchSearch') : t('admin.menu.noItemsYet')}
                </p>
                <p className="text-sm text-gray-400 mt-1 mb-4">
                  {searchQuery ? t('admin.menu.tryDifferentSearch') : t('admin.menu.addFirstItem')}
                </p>
                {!searchQuery && (
                  <button
                    onClick={() => openItemModal()}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors"
                  >
                    <Plus size={15} /> {t('admin.menu.addItem')}
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {filteredItems.map(item => {
                  const cat = categories.find(c => c.id === item.categoryId);
                  return (
                    <div
                      key={item.id}
                      className={`rounded-2xl border overflow-hidden hover:shadow-md transition-shadow flex flex-col ${
                        item.isAvailable ? 'bg-white border-gray-100' : 'bg-gray-50/80 border-red-200'
                      }`}
                    >
                      {/* Image / placeholder */}
                      <div className="relative">
                        {item.imageUrl ? (
                          <img src={resolveImgUrl(item.imageUrl)} alt={item.name} className={`w-full h-28 object-contain bg-slate-50 ${!item.isAvailable ? 'grayscale opacity-50' : ''}`} />
                        ) : (
                          <div className={`w-full h-24 flex items-center justify-center ${
                            item.isAvailable ? 'bg-gradient-to-br from-blue-50 to-indigo-50' : 'bg-gray-100'
                          }`}>
                            <Tag size={26} className={item.isAvailable ? 'text-blue-200' : 'text-gray-300'} />
                          </div>
                        )}
                        {!item.isAvailable && (
                          <div className="absolute top-2 left-2 px-2 py-0.5 bg-red-500 text-white text-[10px] font-bold rounded-md uppercase tracking-wide">
                            {t('admin.menu.inactive')}
                          </div>
                        )}
                      </div>

                      {/* Body */}
                      <div className="p-3 flex flex-col flex-1">

                        {/* Name + availability toggle */}
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <h3 className="font-bold text-gray-900 text-sm leading-tight line-clamp-1 flex-1">
                            {item.name}
                          </h3>
                          <button
                            onClick={() => toggleAvailability(item)}
                            title={item.isAvailable ? 'Mark unavailable' : 'Mark available'}
                            className="flex-shrink-0 mt-0.5"
                          >
                            {item.isAvailable
                              ? <ToggleRight size={22} className="text-green-500" />
                              : <ToggleLeft size={22} className="text-gray-300" />
                            }
                          </button>
                        </div>

                        {/* Description */}
                        {item.description && (
                          <p className="text-xs text-gray-400 line-clamp-1 mb-2">{item.description}</p>
                        )}

                        {/* Price */}
                        <p className={`text-lg font-black mb-2 leading-none ${item.isAvailable ? 'text-blue-600' : 'text-gray-400'}`}>
                          {money(item.price)}
                        </p>

                        {/* Meta badges */}
                        <div className="flex flex-wrap gap-1 mb-2">
                          {cat && (
                            <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-xs font-semibold rounded-full">
                              {cat.name}
                            </span>
                          )}
                          {item.isAvailable
                            ? <span className="px-2 py-0.5 bg-green-50 text-green-600 text-xs font-semibold rounded-full">{t("admin.menu.availableBadge")}</span>
                            : <span className="px-2 py-0.5 bg-red-50 text-red-500 text-xs font-semibold rounded-full">{t("admin.menu.unavailableBadge")}</span>
                          }
                          {(item.itemType || item.item_type) === 'sale'
                            ? <span className="px-2 py-0.5 bg-blue-50 text-blue-600 text-xs font-semibold rounded-full flex items-center gap-1"><Wine size={10} /> {t('admin.menu.barBadge')}</span>
                            : <span className="px-2 py-0.5 bg-green-50 text-green-700 text-xs font-semibold rounded-full flex items-center gap-1"><ChefHat size={10} /> {t('admin.menu.kitchenBadge')}</span>
                          }
                          {(item.kitchenStation || item.kitchen_station || item.station) && (
                            <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs font-semibold rounded-full flex items-center gap-1">
                              ⚙ {item.kitchenStation || item.kitchen_station || item.station}
                            </span>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2 mt-auto pt-2 border-t border-gray-50">
                          <button
                            onClick={() => openItemModal(item)}
                            className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors"
                          >
                            <Edit2 size={12} /> {t('common.edit')}
                          </button>
                          <button
                            onClick={() => { setDeleteId(item.id); setDeleteType('item'); }}
                            className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs font-semibold text-red-500 bg-red-50 hover:bg-red-100 rounded-xl transition-colors"
                          >
                            <Trash2 size={12} /> {t('common.delete')}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════
          CATEGORY MODAL
      ══════════════════════════════════════════════════ */}
      {(modal === 'add-cat' || modal === 'edit-cat') && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={closeModal}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">
                {modal === 'add-cat' ? t('admin.menu.newCategory') : t('admin.menu.editCategory')}
              </h2>
              <button onClick={closeModal} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                <X size={18} className="text-gray-500" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className={LabelCls}>{t("admin.menu.categoryName")}</label>
                <input
                  type="text" placeholder={t('admin.menu.categoryPlaceholder')}
                  value={catForm.name}
                  onChange={e => setCatForm({ ...catForm, name: e.target.value })}
                  className={InputCls}
                  autoFocus
                />
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={closeModal} className="flex-1 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
                {t('common.cancel')}
              </button>
              <button
                onClick={handleSaveCategory} disabled={saving || !catForm.name.trim()}
                className="flex-1 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {saving ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════
          ITEM MODAL
      ══════════════════════════════════════════════════ */}
      {(modal === 'add-item' || modal === 'edit-item') && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={closeModal}>
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
              <h2 className="text-lg font-bold text-gray-900">
                {modal === 'add-item' ? t('admin.menu.newMenuItem') : `Edit — ${itemForm.name || 'item'}`}
              </h2>
              <button onClick={closeModal} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                <X size={18} className="text-gray-500" />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="overflow-y-auto flex-1 px-6 py-5">
              <div className="grid grid-cols-[2fr_3fr] gap-5">

                {/* ── LEFT COLUMN ─────────────────────────────── */}
                <div className="space-y-4">

                  {/* Name */}
                  <div>
                    <label className={LabelCls}>{t("admin.menu.itemName")}</label>
                    <input type="text" placeholder={t('admin.menu.itemNamePlaceholder')} value={itemForm.name}
                      onChange={e => setItemForm({ ...itemForm, name: e.target.value })}
                      className={InputCls} autoFocus />
                  </div>

                  {/* Price (so'm) */}
                  <div>
                    <label className={LabelCls}>{t("admin.menu.priceSom")}</label>
                    <div className="relative">
                      <input
                        type="number"
                        placeholder={t('placeholders.zero', '0')}
                        value={itemForm.price}
                        onChange={e => setItemForm({ ...itemForm, price: e.target.value })}
                        className={InputCls + (itemForm.unit !== 'piece' ? ' pr-14' : '')}
                      />
                      {itemForm.unit !== 'piece' && (
                        <span className="absolute inset-y-0 right-3 flex items-center text-xs font-semibold text-blue-600 pointer-events-none">
                          / {itemForm.unit}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Unit selector */}
                  <div>
                    <label className={LabelCls}>{t('admin.menu.unit', 'Unit')}</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: 'piece', label: t('admin.menu.unitPiece', 'piece') },
                        { id: 'kg',    label: 'kg' },
                        { id: 'l',     label: 'l'  },
                      ].map(u => {
                        const active = (itemForm.unit || 'piece') === u.id;
                        return (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => setItemForm({ ...itemForm, unit: u.id })}
                            className={`px-3 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                              active
                                ? 'bg-blue-600 border-blue-600 text-white'
                                : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600'
                            }`}
                          >
                            {u.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Description */}
                  <div>
                    <label className={LabelCls}>{t("common.description")}</label>
                    <textarea placeholder={t('admin.menu.descriptionPlaceholder')} value={itemForm.description}
                      onChange={e => setItemForm({ ...itemForm, description: e.target.value })}
                      rows={2} className={InputCls + ' resize-none'} />
                  </div>

                  {/* Category — pill buttons */}
                  <div>
                    <label className={LabelCls}>{t("common.category")} *</label>
                    <div className="flex flex-wrap gap-2">
                      {categories.map(c => (
                        <button
                          key={c.id}
                          onClick={() => setItemForm({ ...itemForm, categoryId: c.id })}
                          className={`px-3 py-1.5 rounded-full text-sm font-semibold border transition-colors ${
                            String(itemForm.categoryId) === String(c.id)
                              ? 'bg-blue-600 border-blue-600 text-white'
                              : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600'
                          }`}
                        >
                          {c.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Availability */}
                  <button
                    onClick={() => setItemForm({ ...itemForm, isAvailable: !itemForm.isAvailable })}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-colors ${
                      itemForm.isAvailable
                        ? 'border-green-300 bg-green-50'
                        : 'border-gray-200 bg-gray-50'
                    }`}
                  >
                    <div className={`w-10 h-6 rounded-full transition-colors relative flex-shrink-0 ${itemForm.isAvailable ? 'bg-blue-500' : 'bg-gray-300'}`}>
                      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${itemForm.isAvailable ? 'left-5' : 'left-1'}`} />
                    </div>
                    {itemForm.isAvailable
                      ? <span className="text-sm font-semibold text-green-700">{t("admin.menu.activeVisibleOnMenu")}</span>
                      : <span className="text-sm font-semibold text-gray-500">{t("admin.menu.hiddenFromMenu")}</span>
                    }
                  </button>

                </div>

                {/* ── RIGHT COLUMN ─────────────────────────────── */}
                <div className="space-y-4">

                  {/* Item Type — Food / Sale */}
                  <div>
                    <label className={LabelCls}>{t("admin.menu.itemType")} <span className="text-gray-400 normal-case font-normal">— who gets notified when ordered</span></label>
                    <div className="grid grid-cols-2 gap-2">
                      {ITEM_TYPES.map(it => {
                        const active = itemForm.itemType === it.id;
                        return (
                          <button
                            key={it.id}
                            onClick={() => setItemForm({ ...itemForm, itemType: it.id })}
                            className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all ${
                              active
                                ? `${it.activeBg} ${it.activeBorder}`
                                : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            <it.Icon size={22} className={active ? it.activeIcon : 'text-gray-400'} />
                            <span className={`text-sm font-bold ${active ? it.activeText : 'text-gray-700'}`}>{it.label}</span>
                            <span className={`text-xs text-center leading-tight ${active ? it.activeText + ' opacity-75' : 'text-gray-400'}`}>{it.sub}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Kitchen Station — text + quick pick */}
                  <div>
                    <label className={LabelCls}>{t("admin.menu.kitchenStation")} <span className="text-gray-400 normal-case font-normal">— which station prepares this</span></label>
                    <div className="flex gap-2 mb-2">
                      <input type="text" placeholder={t('admin.menu.stationPlaceholder')} value={itemForm.station}
                        onChange={e => setItemForm({ ...itemForm, station: e.target.value })}
                        className={InputCls + ' flex-1'} />
                      {(() => {
                        const typed = (itemForm.station || '').trim();
                        const alreadyPreset = allStationPresets(items).some(s => s.id.toLowerCase() === typed.toLowerCase());
                        return typed && !alreadyPreset ? (
                          <button
                            onClick={() => addStationPreset(typed)}
                            className="px-3 py-2 rounded-xl bg-indigo-50 border-2 border-indigo-200 text-indigo-700 text-xs font-bold whitespace-nowrap hover:bg-indigo-100 transition-colors flex items-center gap-1"
                          >
                            <Plus size={12} /> {t('admin.menu.addStationPreset', { name: typed })}
                          </button>
                        ) : null;
                      })()}
                    </div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1.5">{t("admin.menu.quickPick")}</p>
                    <div className="grid grid-cols-4 gap-1.5">
                      {allStationPresets(items).map(s => {
                        const active = itemForm.station === s.id;
                        return (
                          <div key={s.id} className="relative">
                            <button
                              onClick={() => setItemForm({ ...itemForm, station: active ? '' : s.id })}
                              className={`w-full flex flex-col items-center gap-0.5 py-2 px-1 rounded-xl border-2 transition-all ${
                                active
                                  ? `${s.bg} ${s.border}`
                                  : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                              }`}
                            >
                              <s.Icon size={14} className={active ? s.text : 'text-gray-400'} />
                              <span className={`text-xs font-bold leading-tight text-center ${active ? s.text : 'text-gray-600'}`}>{s.label}</span>
                            </button>
                            {s.custom && (
                              <button
                                onClick={() => removeStationPreset(s.id)}
                                className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
                                title={t('admin.menu.removePreset')}
                              >
                                <X size={9} className="text-white" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Image — file upload + preview */}
                  <div>
                    <label className={LabelCls}>{t("admin.menu.itemPhoto")}</label>
                    {itemForm.imageUrl ? (
                      <div className="relative rounded-xl overflow-hidden border border-gray-200 mb-2">
                        <img src={resolveImgUrl(itemForm.imageUrl)} alt={t('common.preview', 'Preview')} className="w-full h-36 object-contain bg-slate-50" />
                        <button
                          onClick={() => setItemForm({ ...itemForm, imageUrl: '' })}
                          className="absolute top-2 right-2 w-7 h-7 bg-black/50 rounded-full flex items-center justify-center hover:bg-black/70 transition-colors"
                        >
                          <X size={14} className="text-white" />
                        </button>
                      </div>
                    ) : null}
                    <label className={`flex items-center gap-2 cursor-pointer px-3 py-2.5 rounded-xl border-2 border-dashed transition-colors ${
                      imageUploading ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-gray-50 hover:border-blue-300 hover:bg-blue-50'
                    }`}>
                      {imageUploading
                        ? <><div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /><span className="text-sm text-blue-600 font-semibold">{t('admin.menu.uploading')}</span></>
                        : <><Plus size={15} className="text-gray-400" /><span className="text-sm text-gray-500 font-medium">{itemForm.imageUrl ? t('admin.menu.changePhoto') : t('admin.menu.uploadPhoto')}</span></>
                      }
                      <input type="file" accept="image/*" className="hidden" onChange={handleImageFileChange} disabled={imageUploading} />
                    </label>
                  </div>

                </div>
              </div>

              {/* ── INGREDIENTS — full width below ───────────── */}
              <div className="mt-5 pt-5 border-t border-gray-100">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 bg-indigo-100 rounded-lg flex items-center justify-center">
                    <Link size={14} className="text-indigo-600" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-800">{t("admin.menu.ingredients")}</p>
                    <p className="text-xs text-gray-400">{t('admin.menu.ingredientsHint')}</p>
                  </div>
                </div>

                {(() => {
                  // In edit mode use saved ingredients; in add mode use pendingIngredients
                  const ingList = modal === 'edit-item' ? ingredients : pendingIngredients;
                  const selWi   = warehouseItems.find(w => w.id === newIngredient.warehouseItemId);
                  return (
                    <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">

                      {/* Existing / pending ingredients */}
                      {ingList.length > 0 && (
                        <div className="divide-y divide-gray-100">
                          {ingList.map((ing, idx) => {
                            // Interceptor camelizes: ingredientName, ingredientId, quantity, unit
                            const ingName = ing.ingredientName || ing.name || '—';
                            const ingQty  = ing.quantity ?? '';
                            const ingUnit = ing.unit || '';
                            return (
                              <div key={ing.ingredientId ?? idx} className="flex items-center justify-between px-4 py-2.5 bg-white">
                                <div>
                                  <p className="text-sm font-semibold text-gray-800">{ingName}</p>
                                  <p className="text-xs text-gray-400">{ingQty} {ingUnit ? t('admin.menu.unitPerDish', { unit: ingUnit }) : t('admin.menu.perDish')}</p>
                                </div>
                                <button
                                  onClick={() => {
                                    if (modal === 'edit-item') handleRemoveIngredient(ing.ingredientId);
                                    else setPendingIngredients(prev => prev.filter((_, i) => i !== idx));
                                  }}
                                  className="w-7 h-7 flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors">
                                  <X size={14} />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Add ingredient form */}
                      <div className="p-4 space-y-3">
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t("admin.menu.selectIngredient")}</p>
                          <div className="relative mb-2">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                              type="text"
                              placeholder={t('admin.menu.searchIngredients')}
                              value={ingSearch}
                              onChange={e => setIngSearch(e.target.value)}
                              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                            {warehouseItems.length === 0 ? (
                              <p className="text-xs text-gray-400">{t("admin.menu.noWarehouseItems")}</p>
                            ) : warehouseItems
                              .filter(wi => !ingSearch.trim() || wi.name.toLowerCase().includes(ingSearch.toLowerCase()))
                              .map(wi => (
                              <button
                                key={wi.id}
                                onClick={() => { setNewIngredient({ ...newIngredient, warehouseItemId: wi.id }); setIngSearch(''); }}
                                className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${
                                  newIngredient.warehouseItemId === wi.id
                                    ? 'bg-blue-600 border-blue-600 text-white'
                                    : 'bg-white border-gray-200 text-gray-600 hover:border-blue-300'
                                }`}
                              >
                                {wi.name}
                                {wi.unit && (
                                  <span className={`ml-1 ${newIngredient.warehouseItemId === wi.id ? 'text-blue-200' : 'text-gray-400'}`}>
                                    {wi.unit}
                                  </span>
                                )}
                              </button>
                            ))}
                            {warehouseItems.length > 0 && ingSearch.trim() && warehouseItems.filter(wi => wi.name.toLowerCase().includes(ingSearch.toLowerCase())).length === 0 && (
                              <p className="text-xs text-gray-400 py-1">{t('admin.menu.noIngredientsMatch', { query: ingSearch })}</p>
                            )}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                            {t('admin.menu.quantityPerDish')}{selWi?.unit ? ` (${selWi.unit})` : ''}
                          </p>
                          {selWi && (
                            <p className="text-xs text-amber-600 flex items-center gap-1 mb-1.5">
                              <Clock size={11} /> {t('admin.menu.enterInUnit', { unit: selWi.unit })}
                            </p>
                          )}
                          <div className="flex gap-2">
                            <input
                              type="number" step="0.001"
                              placeholder={selWi?.unit ? t('admin.menu.qtyPerDishWithUnit', { unit: selWi.unit }) : t('admin.menu.qtyPerDishPlaceholder')}
                              value={newIngredient.quantityPerDish}
                              onChange={e => setNewIngredient({ ...newIngredient, quantityPerDish: e.target.value })}
                              className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <button
                              onClick={handleAddIngredient}
                              disabled={!newIngredient.warehouseItemId || !newIngredient.quantityPerDish}
                              className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-xl hover:bg-green-700 transition-colors flex items-center gap-1.5 disabled:opacity-40"
                            >
                              <Plus size={14} /> {t('common.add')}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 pb-6 pt-3 border-t border-gray-100 flex gap-3 flex-shrink-0">
              <button onClick={closeModal}
                className="flex-1 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
                {t('common.cancel')}
              </button>
              <button
                onClick={handleSaveItem}
                disabled={saving || !itemForm.name.trim() || !itemForm.price || !itemForm.categoryId}
                className="flex-1 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {saving ? t('common.saving') : modal === 'add-item' ? t('admin.menu.createItem') : t('common.saveChanges')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════
          DELETE CONFIRM
      ══════════════════════════════════════════════════ */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={() => { setDeleteId(null); setDeleteType(null); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center mb-4">
              <AlertTriangle size={22} className="text-red-600" />
            </div>
            <h2 className="text-lg font-bold text-gray-900 mb-1">
              {deleteType === 'category' ? t('admin.menu.deleteCategory') : t('admin.menu.deleteItem')}
            </h2>
            <p className="text-sm text-gray-500 mb-6">
              {deleteType === 'category'
                ? t('admin.menu.deleteCategoryMsg')
                : t('admin.menu.deleteItemMsg')}
            </p>
            <div className="flex gap-3">
              <button onClick={() => { setDeleteId(null); setDeleteType(null); }}
                className="flex-1 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
                {t('common.cancel')}
              </button>
              <button
                onClick={deleteType === 'category' ? handleDeleteCategory : handleDeleteItem}
                disabled={saving}
                className="flex-1 py-2.5 text-sm font-semibold text-white bg-red-600 rounded-xl hover:bg-red-700 transition-colors disabled:opacity-50">
                {saving ? t('common.deleting') : t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog dialog={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { UtensilsCrossed, Search, Plus, AlertCircle, Minus } from 'lucide-react';
import { menuAPI, tablesAPI, ordersAPI } from '../../api/client';
import { money } from '../../hooks/useApi';
import Dropdown from '../../components/Dropdown';
import { useTranslation } from '../../context/LanguageContext';

const WaitressMenu = () => {
  const { t } = useTranslation();
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedTable, setSelectedTable] = useState(null);
  const [tables, setTables] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [addingToOrder, setAddingToOrder] = useState(false);

  const fetchData = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const [catRes, itemRes, tableRes] = await Promise.all([
        menuAPI.getCategories(),
        menuAPI.getItems(),
        tablesAPI.getAll(),
      ]);
      const categoriesData = Array.isArray(catRes) ? catRes : catRes?.categories || [];
      const itemsData = Array.isArray(itemRes) ? itemRes : itemRes?.items || [];
      const tablesData = Array.isArray(tableRes) ? tableRes : tableRes?.tables || [];
      setCategories(categoriesData);
      setItems(itemsData);
      setTables(tablesData);
      if (!silent && categoriesData.length > 0) setSelectedCategory(categoriesData[0].id);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const t = setInterval(() => fetchData(true), 1000);
    return () => clearInterval(t);
  }, [fetchData]);

  const filteredItems = items.filter(item => {
    const matchCategory = !selectedCategory || item.categoryId === selectedCategory;
    const matchSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.description && item.description.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchCategory && matchSearch;
  });

  const occupiedTables = tables.filter(t => t.status === 'occupied');

  const handleAddToOrder = async () => {
    if (!selectedItem || !selectedTable || quantity < 1) return;
    try {
      setAddingToOrder(true);
      const orderData = {
        tableId: selectedTable,
        items: [{ menuItemId: selectedItem.id, quantity }],
      };
      await ordersAPI.create(orderData);
      setSelectedItem(null);
      setQuantity(1);
      setSelectedTable(null);
      fetchData();
    } catch (err) {
      setError(err.message);
    } finally {
      setAddingToOrder(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
          <p className="mt-4 text-gray-600">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8 flex items-center gap-2">
          <UtensilsCrossed className="w-8 h-8" style={{ color: '#16A34A' }} />
          {t('waitress.menu.title')}
        </h1>

        {error && (
          <div className="mb-6 p-4 bg-red-100 border border-red-300 rounded-lg flex items-center gap-2 text-red-800">
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow sticky top-8">
              <div className="p-4 border-b border-gray-200">
                <h2 className="font-semibold text-gray-900 mb-3">{t('admin.menu.categories')}</h2>
                <div className="space-y-2">
                  {categories.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => {
                        setSelectedCategory(cat.id);
                        setSearchTerm('');
                      }}
                      className={`w-full text-left px-4 py-2 rounded transition font-medium ${
                        selectedCategory === cat.id
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder={t('waitress.menu.searchPlaceholder')}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-600 text-sm"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {filteredItems.length === 0 ? (
                <div className="col-span-full text-center py-12 bg-white rounded-lg">
                  <UtensilsCrossed className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500 text-lg">{t('waitress.menu.noItemsFound')}</p>
                </div>
              ) : (
                filteredItems.map(item => (
                  <div
                    key={item.id}
                    className={`bg-white p-6 rounded-lg shadow hover:shadow-lg transition ${
                      !item.isAvailable ? 'opacity-60' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <h3 className="text-lg font-semibold text-gray-900 flex-1">{item.name}</h3>
                      {!item.isAvailable && (
                        <span className="text-xs font-bold text-red-600 ml-2 whitespace-nowrap">{t('waitress.menu.outOfStock')}</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mb-4 line-clamp-2">{item.description}</p>

                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600">{t('waitress.menu.price')}</p>
                        <p className="text-2xl font-bold" style={{ color: '#16A34A' }}>
                          {money(item.price)}
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedItem(item);
                          setQuantity(1);
                        }}
                        disabled={!item.isAvailable}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition flex items-center gap-2 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Plus className="w-4 h-4" />
                        {t('common.add')}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {selectedItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="bg-gradient-to-r from-green-600 to-green-700 px-6 py-4 rounded-t-lg">
              <h2 className="text-xl font-bold text-white">{selectedItem.name}</h2>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-gray-600 mb-2 text-sm">{selectedItem.description}</p>
                <p className="text-3xl font-bold" style={{ color: '#16A34A' }}>
                  {money(selectedItem.price)}
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">{t('admin.tables.selectStatus')}</label>
                <Dropdown
                  value={selectedTable || ''}
                  onChange={(value) => setSelectedTable(value ? Number(value) : null)}
                  options={[
                    { value: '', label: t('waitress.menu.chooseTable') },
                    ...occupiedTables.map(t => ({
                      value: t.id,
                      label: `Table ${t.tableNumber} (${t.capacity} seats)`
                    }))
                  ]}
                />
                {occupiedTables.length === 0 && (
                  <p className="text-xs text-amber-600 mt-2">{t('waitress.menu.noOccupiedTables')}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">{t('waitress.menu.quantity')}</label>
                <div className="flex items-center border border-gray-300 rounded-lg">
                  <button
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="px-4 py-2 text-gray-700 hover:bg-gray-100 transition"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <input
                    type="number"
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
                    className="flex-1 text-center py-2 outline-none font-bold"
                    min="1"
                  />
                  <button
                    onClick={() => setQuantity(quantity + 1)}
                    className="px-4 py-2 text-gray-700 hover:bg-gray-100 transition"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-gray-600 text-sm mb-1">{t('common.subtotal')}</p>
                <p className="text-3xl font-bold" style={{ color: '#16A34A' }}>
                  {money(selectedItem.price * quantity)}
                </p>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setSelectedItem(null)}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition font-medium"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleAddToOrder}
                  disabled={!selectedTable || addingToOrder}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition font-medium flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  {addingToOrder ? t('waitress.menu.addingToOrder') : t('waitress.menu.addToOrder')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WaitressMenu;

import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Package, Clock, AlertCircle } from 'lucide-react';
import { warehouseAPI, suppliersAPI } from '../../api/client';
import { useTranslation } from '../../context/LanguageContext';

export default function OwnerInventory() {
  const { t } = useTranslation();
  const [inventory, setInventory] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [expiryAlerts, setExpiryAlerts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchInventoryData = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const [allItems, lowStockItems, expiring, supplierList] = await Promise.all([
        warehouseAPI.getAll(),
        warehouseAPI.getLowStock(),
        warehouseAPI.checkExpiryAlerts(),
        suppliersAPI.getAll(),
      ]);
      setInventory(Array.isArray(allItems?.items) ? allItems.items : Array.isArray(allItems) ? allItems : []);
      setLowStock(Array.isArray(lowStockItems?.items) ? lowStockItems.items : Array.isArray(lowStockItems) ? lowStockItems : []);
      setExpiryAlerts(Array.isArray(expiring?.items) ? expiring.items : Array.isArray(expiring) ? expiring : []);
      setSuppliers(Array.isArray(supplierList?.items) ? supplierList.items : Array.isArray(supplierList) ? supplierList : []);
      setError(null);
    } catch (err) {
      if (!silent) setError(err.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInventoryData();
    const t = setInterval(() => fetchInventoryData(true), 1000);
    return () => clearInterval(t);
  }, [fetchInventoryData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-600">{t('owner.inventory.loadingInventory')}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-lg m-6">
        <div className="flex items-center gap-3 mb-4">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <p className="text-red-700">Error: {error}</p>
        </div>
        <button
          onClick={() => fetchInventoryData()}
          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
        >
          {t('common.retry')}
        </button>
      </div>
    );
  }

  const getStockStatus = (quantity, minStock) => {
    if (quantity <= 0) return { badge: t('owner.inventory.outOfStock'), color: 'bg-red-100 text-red-700' };
    if (quantity <= minStock) return { badge: t('owner.inventory.lowStock'), color: 'bg-yellow-100 text-yellow-700' };
    return { badge: t('admin.inventory.inStock'), color: 'bg-green-100 text-green-700' };
  };

  return (
    <div className="h-full overflow-auto bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8 flex items-center gap-2">
          <Package className="w-8 h-8" style={{ color: '#7C3AED' }} />
          {t('owner.inventory.title')}
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-gray-600">{t('owner.inventory.totalItems')}</h3>
              <Package className="w-5 h-5" style={{ color: '#7C3AED' }} />
            </div>
            <p className="text-3xl font-bold text-gray-900">{inventory.length}</p>
            <p className="text-xs text-gray-500 mt-2">{t('owner.inventory.inWarehouse')}</p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-gray-600">{t('owner.inventory.lowStock')}</h3>
              <AlertTriangle className="w-5 h-5 text-yellow-600" />
            </div>
            <p className="text-3xl font-bold text-gray-900">{lowStock.length}</p>
            <p className="text-xs text-gray-500 mt-2">{t('owner.inventory.itemsBelowMinimum')}</p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-gray-600">{t('admin.inventory.critical')}</h3>
              <Clock className="w-5 h-5 text-red-600" />
            </div>
            <p className="text-3xl font-bold text-gray-900">{expiryAlerts.length}</p>
            <p className="text-xs text-gray-500 mt-2">{t('periods.last30days')}</p>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-8">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-bold text-gray-900">{t('nav.inventory')}</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  <th className="text-left py-3 px-6 text-gray-600 font-medium">{t('common.name')}</th>
                  <th className="text-left py-3 px-6 text-gray-600 font-medium">{t('common.amount')}</th>
                  <th className="text-left py-3 px-6 text-gray-600 font-medium">{t('common.category')}</th>
                  <th className="text-left py-3 px-6 text-gray-600 font-medium">{t('owner.inventory.lowStock')}</th>
                  <th className="text-left py-3 px-6 text-gray-600 font-medium">{t('common.status')}</th>
                  <th className="text-left py-3 px-6 text-gray-600 font-medium">{t('admin.inventory.suppliers')}</th>
                </tr>
              </thead>
              <tbody>
                {Array.isArray(inventory) && inventory.length > 0 ? (
                  inventory.map((item, idx) => {
                    const status = getStockStatus(item.currentStock, item.minStock);
                    return (
                      <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50 transition">
                        <td className="py-4 px-6 text-gray-900 font-medium">{item.name}</td>
                        <td className="py-4 px-6 text-gray-600 font-medium">{item.currentStock}</td>
                        <td className="py-4 px-6 text-gray-600">{item.unit}</td>
                        <td className="py-4 px-6 text-gray-600">{item.minStock}</td>
                        <td className="py-4 px-6">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${status.color}`}>
                            {status.badge}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-gray-600">{item.supplierName || 'N/A'}</td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="6" className="text-center py-8 text-gray-500">{t('common.noResults')}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-600" />
                {t('owner.inventory.lowStock')}
              </h2>
            </div>
            <div className="divide-y divide-gray-200">
              {Array.isArray(lowStock) && lowStock.length > 0 ? (
                lowStock.map((item, idx) => (
                  <div key={idx} className="p-4 hover:bg-gray-50 transition">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium text-gray-900">{item.name}</p>
                        <p className="text-sm text-gray-600 mt-1">Current: {item.currentStock} {item.unit}</p>
                      </div>
                      <span className="bg-yellow-100 text-yellow-700 text-xs font-medium px-2 py-1 rounded">
                        {t('owner.inventory.lowStock')}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-gray-500">{t('common.noResults')}</div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-900">{t('admin.inventory.suppliers')}</h2>
            </div>
            <div className="divide-y divide-gray-200">
              {Array.isArray(suppliers) && suppliers.length > 0 ? (
                suppliers.map((supplier, idx) => (
                  <div key={idx} className="p-4 hover:bg-gray-50 transition">
                    <p className="font-medium text-gray-900">{supplier.name}</p>
                    <p className="text-sm text-gray-600 mt-1">{supplier.contact}</p>
                    <p className="text-xs text-gray-500 mt-2">{supplier.location}</p>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-gray-500">{t('common.noResults')}</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

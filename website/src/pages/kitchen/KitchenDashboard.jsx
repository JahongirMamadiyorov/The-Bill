import { useState, useEffect, useCallback } from 'react';
import { ChefHat, CheckCircle, Clock, AlertCircle, Circle, FileText } from 'lucide-react';
import { ordersAPI } from '../../api/client';
import { money } from '../../hooks/useApi';
import { useTranslation } from '../../context/LanguageContext';

const KitchenDashboard = () => {
  const { t } = useTranslation();
  const [orders, setOrders] = useState([]);
  const [completedOrders, setCompletedOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('queue');
  const [markingReady, setMarkingReady] = useState(null);

  const fetchOrders = useCallback(async () => {
    try {
      const kitchenOrders = await ordersAPI.getKitchen();
      setOrders(Array.isArray(kitchenOrders) ? kitchenOrders : []);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const fetchCompletedOrders = useCallback(async () => {
    try {
      const completed = await ordersAPI.getKitchenCompleted();
      setCompletedOrders(Array.isArray(completed) ? completed : []);
    } catch (err) {
      console.error('Error fetching completed orders:', err);
    }
  }, []);

  const fetchAllData = useCallback(async () => {
    try {
      setLoading(true);
      await Promise.all([fetchOrders(), fetchCompletedOrders()]);
    } finally {
      setLoading(false);
    }
  }, [fetchOrders, fetchCompletedOrders]);

  useEffect(() => {
    fetchAllData();
    const interval = setInterval(fetchAllData, 1000);
    return () => clearInterval(interval);
  }, [fetchAllData]);

  const handleMarkItemReady = async (orderId, itemId) => {
    try {
      setMarkingReady(`${orderId}-${itemId}`);
      await ordersAPI.markItemReady(orderId, itemId);
      fetchOrders();
    } catch (err) {
      setError(err.message);
    } finally {
      setMarkingReady(null);
    }
  };

  const getOrderTimer = (createdAt) => {
    const elapsed = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000);
    const minutes = Math.floor(elapsed / 60);

    if (minutes < 5) return { color: '#16A34A', label: '< 5 min' };
    if (minutes < 10) return { color: '#EA580C', label: '5-10 min' };
    return { color: '#EF4444', label: '> 10 min' };
  };

  const getReadyCount = (order) => {
    return order.items?.filter(i => i.itemReady).length || 0;
  };

  const getTotalCount = (order) => {
    return order.items?.length || 0;
  };

  const stats = {
    activeOrders: orders.length,
    completedToday: completedOrders.length,
    avgCookTime: completedOrders.length > 0
      ? Math.round(completedOrders.reduce((sum, o) => sum + (o.cookTime || 0), 0) / completedOrders.length)
      : 0,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
          <p className="mt-4 text-gray-600">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <ChefHat className="w-8 h-8" style={{ color: '#EA580C' }} />
            {t('kitchen.dashboard.title')}
          </h1>
          <button
            onClick={fetchAllData}
            className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition font-medium"
          >
            {t('common.refresh')}
          </button>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-100 border border-red-300 rounded-lg flex items-center gap-3 text-red-800">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <p className="text-gray-600 text-sm font-medium mb-2">{t('kitchen.dashboard.activeOrders')}</p>
            <p className="text-4xl font-bold" style={{ color: '#EA580C' }}>{stats.activeOrders}</p>
            <p className="text-xs text-gray-500 mt-2">{t('kitchen.dashboard.inQueue')}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <p className="text-gray-600 text-sm font-medium mb-2">{t('kitchen.dashboard.completedToday')}</p>
            <p className="text-4xl font-bold" style={{ color: '#EA580C' }}>{stats.completedToday}</p>
            <p className="text-xs text-gray-500 mt-2">{t('kitchen.dashboard.ordersCompleted')}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <p className="text-gray-600 text-sm font-medium mb-2">{t('kitchen.dashboard.avgCookTime')}</p>
            <p className="text-4xl font-bold text-gray-900">{stats.avgCookTime}m</p>
            <p className="text-xs text-gray-500 mt-2">{t('kitchen.dashboard.averageDuration')}</p>
          </div>
        </div>

        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('queue')}
            className={`px-4 py-2 rounded-lg font-medium transition ${
              activeTab === 'queue'
                ? 'bg-orange-600 text-white'
                : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {t('kitchen.dashboard.inQueue')} ({orders.length})
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 rounded-lg font-medium transition ${
              activeTab === 'history'
                ? 'bg-orange-600 text-white'
                : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {t('nav.history')} ({completedOrders.length})
          </button>
        </div>

        {activeTab === 'queue' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {orders.length === 0 ? (
              <div className="col-span-full text-center py-16">
                <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
                <p className="text-gray-500 text-lg font-medium">{t('kitchen.dashboard.noCompletedOrders')}</p>
                <p className="text-gray-400 text-sm mt-1">{t('common.done')}</p>
              </div>
            ) : (
              orders.map(order => {
                const timer = getOrderTimer(order.createdAt);
                const readyCount = getReadyCount(order);
                const totalCount = getTotalCount(order);

                return (
                  <div key={order.id} className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                    <div className="flex items-start justify-between mb-5">
                      <div>
                        <h3 className="text-2xl font-bold text-gray-900">Order #{order.id}</h3>
                        <p className="text-sm text-gray-600 mt-1">Table {order.tableId}</p>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-2 rounded-full font-semibold text-white" style={{ backgroundColor: timer.color }}>
                        <Circle className="w-3 h-3 fill-current" />
                        {timer.label}
                      </div>
                    </div>

                    <div className="bg-gray-50 p-4 rounded-lg mb-5">
                      <p className="text-xs font-medium text-gray-600 mb-2">{t('kitchen.dashboard.progress')}</p>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1 bg-gray-300 rounded-full h-2">
                          <div
                            className="h-2 rounded-full transition-all"
                            style={{
                              backgroundColor: '#EA580C',
                              width: `${(readyCount / totalCount) * 100}%`,
                            }}
                          ></div>
                        </div>
                        <span className="font-semibold text-gray-900 whitespace-nowrap">
                          {readyCount}/{totalCount}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-3 max-h-64 overflow-y-auto">
                      {order.items?.map((item, i) => (
                        <div key={i} className="p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <p className="font-semibold text-gray-900">{item.name}</p>
                              <p className="text-sm text-gray-600">x{item.quantity}</p>
                            </div>
                            <div className="flex items-center gap-2 ml-2">
                              {item.itemReady ? (
                                <div className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded font-semibold flex items-center gap-1">
                                  <CheckCircle className="w-3 h-3" />
                                  {t('common.done')}
                                </div>
                              ) : (
                                <button
                                  onClick={() => handleMarkItemReady(order.id, item.id)}
                                  disabled={markingReady === `${order.id}-${item.id}`}
                                  className="px-3 py-1 bg-orange-600 text-white text-xs rounded hover:bg-orange-700 disabled:opacity-50 transition font-semibold"
                                >
                                  {markingReady === `${order.id}-${item.id}` ? '...' : t('statuses.ready')}
                                </button>
                              )}
                            </div>
                          </div>
                          {item.notes && (
                            <div className="text-xs text-gray-700 bg-yellow-50 p-2 rounded flex items-start gap-2 mt-2">
                              <FileText className="w-3 h-3 text-yellow-600 flex-shrink-0 mt-0.5" />
                              <span>{item.notes}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-3">
            {completedOrders.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <p>{t('kitchen.dashboard.noCompletedOrders')}</p>
              </div>
            ) : (
              completedOrders.map(order => (
                <div key={order.id} className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 flex items-center justify-between hover:shadow-md transition">
                  <div>
                    <p className="font-semibold text-gray-900">Order #{order.id} - Table {order.tableId}</p>
                    <p className="text-sm text-gray-600">{order.items?.length || 0} items</p>
                  </div>
                  <div className="text-right mr-4">
                    <p className="text-sm text-gray-600">{t('kitchen.dashboard.cookTime')}</p>
                    <p className="font-bold text-gray-900">{order.cookTime || '-'}m</p>
                  </div>
                  <div className="flex items-center gap-2 text-green-600 text-sm font-semibold">
                    <CheckCircle className="w-4 h-4" />
                    {t('kitchen.dashboard.completedToday')}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default KitchenDashboard;

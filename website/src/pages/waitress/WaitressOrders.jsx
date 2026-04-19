import { useState, useEffect, useCallback } from 'react';
import { ClipboardList, Clock, Check, AlertCircle, FileText, RefreshCw } from 'lucide-react';
import { ordersAPI } from '../../api/client';
import { money } from '../../hooks/useApi';
import { useTranslation } from '../../context/LanguageContext';

const WaitressOrders = () => {
  const { t } = useTranslation();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [markingServed, setMarkingServed] = useState(null);
  const [requestingBill, setRequestingBill] = useState(null);

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      const res = await ordersAPI.getMyOrders();
      const data = Array.isArray(res) ? res : res?.orders || [];
      const activeStatuses = ['pending', 'sent_to_kitchen', 'preparing', 'ready', 'served'];
      setOrders(data.filter(o => activeStatuses.includes(o.status)));
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 1000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  const getStatusColor = (status) => {
    const colors = {
      pending: 'bg-gray-100 text-gray-800',
      sent_to_kitchen: 'bg-orange-100 text-orange-800',
      preparing: 'bg-amber-100 text-amber-800',
      ready: 'bg-green-100 text-green-800',
      served: 'bg-blue-100 text-blue-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getElapsedTime = (createdAt) => {
    if (!createdAt) return '0:00';
    const diff = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000);
    const mins = Math.floor(diff / 60);
    const secs = diff % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleMarkItemServed = async (orderId, itemId) => {
    try {
      setMarkingServed(`${orderId}-${itemId}`);
      await ordersAPI.markItemServed(orderId, itemId);
      fetchOrders();
    } catch (err) {
      setError(err.message);
    } finally {
      setMarkingServed(null);
    }
  };

  const handleRequestBill = async (orderId) => {
    try {
      setRequestingBill(orderId);
      await ordersAPI.updateStatus(orderId, 'bill_requested');
      fetchOrders();
    } catch (err) {
      setError(err.message);
    } finally {
      setRequestingBill(null);
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
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
              <ClipboardList className="w-8 h-8" style={{ color: '#16A34A' }} />
              {t('waitress.orders.title')}
            </h1>
            <p className="text-gray-600 mt-1">{orders.length} {t('common.active').toLowerCase()}</p>
          </div>
          <button
            onClick={fetchOrders}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            {t('common.refresh')}
          </button>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-100 border border-red-300 rounded-lg flex items-center gap-2 text-red-800">
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {orders.length === 0 ? (
            <div className="col-span-full text-center py-12 bg-white rounded-lg">
              <ClipboardList className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 text-lg">{t('waitress.orders.noActiveOrders')}</p>
            </div>
          ) : (
            orders.map(order => (
              <div
                key={order.id}
                className="bg-white rounded-lg shadow hover:shadow-lg transition cursor-pointer overflow-hidden"
                onClick={() => setSelectedOrder(order)}
              >
                <div className="bg-gradient-to-r from-green-600 to-green-700 px-6 py-4">
                  <h3 className="text-xl font-bold text-white">Order #{order.id}</h3>
                  <p className="text-green-100 text-sm">Table {order.tableId}</p>
                </div>

                <div className="p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(order.status)}`}>
                      {order.status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                    </span>
                    <div className="flex items-center gap-1 text-sm text-gray-600 font-medium">
                      <Clock className="w-4 h-4" />
                      {getElapsedTime(order.createdAt)}
                    </div>
                  </div>

                  <div className="border-t pt-3">
                    <p className="text-sm font-semibold text-gray-700 mb-2">{t('common.items')} ({order.items?.length || 0})</p>
                    <div className="space-y-2">
                      {order.items?.slice(0, 3).map((item, i) => (
                        <div key={i} className="text-xs text-gray-600">
                          <div className="flex items-start justify-between">
                            <span className="font-medium">{item.name} x{item.quantity}</span>
                            {item.status === 'ready' ? (
                              <Check className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                            ) : (
                              <span className="text-amber-600 text-xs font-medium">{t('statuses.pending').toLowerCase()}</span>
                            )}
                          </div>
                        </div>
                      ))}
                      {(order.items?.length || 0) > 3 && (
                        <p className="text-xs text-gray-500 font-medium">+{(order.items?.length || 0) - 3} more</p>
                      )}
                    </div>
                  </div>

                  <div className="border-t pt-3">
                    <p className="text-sm text-gray-600">{t('common.total')}: <span className="font-bold text-lg" style={{ color: '#16A34A' }}>{money(order.totalAmount)}</span></p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {selectedOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-gradient-to-r from-green-600 to-green-700 px-6 py-4">
              <h2 className="text-xl font-bold text-white">Order #{selectedOrder.id}</h2>
              <p className="text-green-100 text-sm">Table {selectedOrder.tableId}</p>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-gray-600 text-sm">{t('common.status')}</p>
                  <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(selectedOrder.status)}`}>
                    {selectedOrder.status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                  </span>
                </div>
                <div>
                  <p className="text-gray-600 text-sm">{t('waitress.orders.elapsedTime')}</p>
                  <p className="text-sm font-semibold text-gray-900">{getElapsedTime(selectedOrder.createdAt)}</p>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold text-gray-900 mb-3">{t('waitress.orders.orderItems')}</h3>
                <div className="space-y-2">
                  {selectedOrder.items && Array.isArray(selectedOrder.items) && selectedOrder.items.map((item, i) => (
                    <div key={i} className="p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-gray-900">{item.name}</span>
                        <span className="text-sm text-gray-600 font-medium">x{item.quantity}</span>
                      </div>
                      {item.notes && <p className="text-xs text-gray-600 mb-2 italic">{item.notes}</p>}
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">{money(item.unitPrice)}</span>
                        {item.status === 'ready' ? (
                          <span className="text-xs font-semibold text-green-600 flex items-center gap-1">
                            <Check className="w-3 h-3" /> {t('statuses.served')}
                          </span>
                        ) : selectedOrder.status === 'ready' || selectedOrder.status === 'served' ? (
                          <button
                            onClick={() => handleMarkItemServed(selectedOrder.id, item.id)}
                            disabled={markingServed === `${selectedOrder.id}-${item.id}`}
                            className="px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700 disabled:opacity-50 transition font-medium"
                          >
                            {markingServed === `${selectedOrder.id}-${item.id}` ? t('waitress.tables.marking') : t('admin.orders.markServed')}
                          </button>
                        ) : (
                          <span className="text-xs text-amber-600 font-medium">{t('statuses.preparing')}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t pt-4 flex justify-between items-center">
                <div>
                  <p className="text-gray-600 text-sm">{t('common.total')}</p>
                  <p className="text-2xl font-bold" style={{ color: '#16A34A' }}>{money(selectedOrder.totalAmount)}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedOrder(null)}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition font-medium"
                  >
                    {t('common.close')}
                  </button>
                  {selectedOrder.status !== 'bill_requested' && (
                    <button
                      onClick={() => {
                        handleRequestBill(selectedOrder.id);
                        setSelectedOrder(null);
                      }}
                      disabled={requestingBill === selectedOrder.id}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition font-medium flex items-center gap-2"
                    >
                      <FileText className="w-4 h-4" />
                      {requestingBill === selectedOrder.id ? t('waitress.orders.requesting') : t('admin.orders.requestBill')}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WaitressOrders;

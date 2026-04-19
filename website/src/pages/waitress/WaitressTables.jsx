import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Grid3x3, AlertCircle, Lock, Unlock, RefreshCw } from 'lucide-react';
import { tablesAPI } from '../../api/client';
import { useTranslation } from '../../context/LanguageContext';

const WaitressTables = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedTable, setSelectedTable] = useState(null);
  const [actionInProgress, setActionInProgress] = useState(null);

  const fetchTables = useCallback(async () => {
    try {
      setLoading(true);
      const res = await tablesAPI.getAll();
      setTables(Array.isArray(res) ? res : res?.tables || []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTables();
    const interval = setInterval(fetchTables, 1000);
    return () => clearInterval(interval);
  }, [fetchTables]);

  const getStatusBadge = (status) => {
    if (status === 'occupied') return 'bg-red-100 text-red-800 border-red-300';
    if (status === 'reserved') return 'bg-amber-100 text-amber-800 border-amber-300';
    return 'bg-green-100 text-green-800 border-green-300';
  };

  const getStatusDot = (status) => {
    if (status === 'occupied') return 'bg-red-500';
    if (status === 'reserved') return 'bg-amber-500';
    return 'bg-green-500';
  };

  const handleMarkFree = async (tableId) => {
    try {
      setActionInProgress(tableId);
      await tablesAPI.close(tableId);
      fetchTables();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleMarkOccupied = async (table) => {
    try {
      setActionInProgress(table.id);
      await tablesAPI.open(table.id, { status: 'occupied' });
      fetchTables();
      setSelectedTable(null);
      // Navigate to new order with this table pre-selected
      navigate('/waitress/new-order', { state: { table } });
    } catch (err) {
      setError(err.message);
    } finally {
      setActionInProgress(null);
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

  const freeCount = tables.filter(t => t.status === 'free').length;
  const occupiedCount = tables.filter(t => t.status === 'occupied').length;
  const reservedCount = tables.filter(t => t.status === 'reserved').length;

  return (
    <div className="h-full overflow-auto bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
              <Grid3x3 className="w-8 h-8" style={{ color: '#16A34A' }} />
              {t('waitress.tables.title')}
            </h1>
            <p className="text-gray-600 mt-1">
              <span className="font-medium text-green-600">{freeCount} {t('statuses.free').toLowerCase()}</span>
              <span className="mx-2">·</span>
              <span className="font-medium text-red-600">{occupiedCount} {t('statuses.occupied').toLowerCase()}</span>
              <span className="mx-2">·</span>
              <span className="font-medium text-amber-600">{reservedCount} {t('statuses.reserved').toLowerCase()}</span>
            </p>
          </div>
          <button
            onClick={fetchTables}
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

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {tables.map(table => (
            <div
              key={table.id}
              onClick={() => setSelectedTable(table)}
              className={`rounded-lg border-2 cursor-pointer transition transform hover:scale-105 overflow-hidden flex flex-col ${getStatusBadge(table.status)}`}
              style={{ height: 160 }}
            >
              {/* Header row */}
              <div className="flex items-start justify-between px-4 pt-4 pb-2 flex-shrink-0">
                <div>
                  <h3 className="text-2xl font-bold leading-tight">{table.tableNumber || table.name}</h3>
                  <p className="text-xs opacity-75 mt-0.5">
                    {table.status === 'free' ? t('waitress.tables.available') : table.status === 'occupied' ? t('statuses.occupied') : table.status === 'reserved' ? t('statuses.reserved') : t('statuses.cleaning')}
                  </p>
                </div>
                <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1 ${getStatusDot(table.status)}`} />
              </div>
              {/* Body */}
              <div className="px-4 flex-1 flex flex-col justify-between pb-3 overflow-hidden">
                <p className="text-xs font-medium opacity-80">{table.capacity} {t('admin.tables.seats')}</p>
                {/* Reservation guest name (if reserved) */}
                {table.status === 'reserved' && table.reservationGuest && (
                  <p className="text-xs font-semibold truncate opacity-90">{table.reservationGuest}</p>
                )}
                {/* Order info (if occupied) */}
                {table.status === 'occupied' && table.currentOrder && (
                  <p className="text-xs font-medium opacity-80 truncate">Order #{table.currentOrder.id}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {selectedTable && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full">
            <div className="sticky top-0 bg-gradient-to-r from-green-600 to-green-700 px-6 py-4">
              <h2 className="text-xl font-bold text-white">Table {selectedTable.tableNumber}</h2>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-gray-600 text-sm">{t('admin.tables.numberOfSeats')}</p>
                  <p className="text-lg font-semibold text-gray-900">{selectedTable.capacity} {t('admin.tables.seats')}</p>
                </div>
                <div>
                  <p className="text-gray-600 text-sm">{t('common.status')}</p>
                  <p className="text-lg font-semibold text-gray-900 capitalize">
                    {selectedTable.status === 'free' ? t('waitress.tables.available') : selectedTable.status === 'occupied' ? t('statuses.occupied') : t('statuses.reserved')}
                  </p>
                </div>
              </div>

              {selectedTable.currentOrder && (
                <div className="border-t pt-4">
                  <h3 className="font-semibold text-gray-900 mb-3">{t('waitress.tables.currentOrder')}</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm text-gray-700">
                      <span>{t('common.order')} ID:</span>
                      <span className="font-semibold">#{selectedTable.currentOrder.id}</span>
                    </div>
                    <div className="flex justify-between text-sm text-gray-700">
                      <span>{t('common.items')}:</span>
                      <span className="font-semibold">{selectedTable.currentOrder.items?.length || 0}</span>
                    </div>
                    <div className="flex justify-between text-sm text-gray-700">
                      <span>{t('common.status')}:</span>
                      <span className="font-semibold capitalize">
                        {selectedTable.currentOrder.status}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div className="border-t pt-4 flex gap-3">
                <button
                  onClick={() => setSelectedTable(null)}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition font-medium"
                >
                  {t('common.close')}
                </button>

                {selectedTable.status === 'free' && (
                  <button
                    onClick={() => {
                      handleMarkOccupied(selectedTable);
                    }}
                    disabled={actionInProgress === selectedTable.id}
                    className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition font-medium flex items-center justify-center gap-2"
                  >
                    <Lock className="w-4 h-4" />
                    {actionInProgress === selectedTable.id ? t('waitress.tables.marking') : t('waitress.tables.markOccupied')}
                  </button>
                )}

                {selectedTable.status !== 'free' && (
                  <button
                    onClick={() => {
                      handleMarkFree(selectedTable.id);
                      setSelectedTable(null);
                    }}
                    disabled={actionInProgress === selectedTable.id}
                    className="flex-1 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 transition font-medium flex items-center justify-center gap-2"
                  >
                    <Unlock className="w-4 h-4" />
                    {actionInProgress === selectedTable.id ? t('waitress.tables.marking') : t('waitress.tables.markFree')}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WaitressTables;

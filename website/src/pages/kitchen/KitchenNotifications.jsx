import { useState, useEffect, useCallback } from 'react';
import { Bell, AlertTriangle, AlertOctagon, Check, AlertCircle, ClipboardList } from 'lucide-react';
import { notificationsAPI } from '../../api/client';
import { useTranslation } from '../../context/LanguageContext';

const KitchenNotifications = () => {
  const { t } = useTranslation();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [markingRead, setMarkingRead] = useState(null);

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const data = await notificationsAPI.getAll();
      setNotifications(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 1000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const handleMarkAsRead = async (notificationId) => {
    try {
      setMarkingRead(notificationId);
      await notificationsAPI.markRead(notificationId);
      setNotifications(notifications.map(n => n.id === notificationId ? { ...n, read: true } : n));
    } catch (err) {
      setError(err.message);
    } finally {
      setMarkingRead(null);
    }
  };

  const unreadNotifications = notifications.filter(n => !n.isRead);
  const alertNotifications = unreadNotifications.filter(n => n.type === 'low_stock' || n.type === 'urgent');
  const orderNotifications = unreadNotifications.filter(n => n.type === 'new_order');

  const getNotificationIcon = (type) => {
    if (type === 'new_order') return ClipboardList;
    if (type === 'low_stock') return AlertTriangle;
    if (type === 'urgent') return AlertOctagon;
    return Bell;
  };

  const getNotificationColor = (type) => {
    if (type === 'new_order') return 'border-l-blue-500 bg-blue-50';
    if (type === 'low_stock') return 'border-l-amber-500 bg-amber-50';
    if (type === 'urgent') return 'border-l-red-500 bg-red-50';
    return 'border-l-gray-500 bg-gray-50';
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
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <Bell className="w-8 h-8" style={{ color: '#EA580C' }} />
            {t('kitchen.notifications.title')}
          </h1>
          <span
            className="px-4 py-2 rounded-full font-bold text-white text-lg"
            style={{ backgroundColor: '#EA580C' }}
          >
            {unreadNotifications.length}
          </span>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-100 border border-red-300 rounded-lg flex items-center gap-3 text-red-800">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {alertNotifications.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" style={{ color: '#EA580C' }} />
              {t('common.alert')}
            </h2>
            <div className="space-y-3">
              {alertNotifications.map(notification => {
                const IconComponent = getNotificationIcon(notification.type);
                return (
                  <div
                    key={notification.id}
                    className={`p-4 rounded-lg border-l-4 flex items-start justify-between ${getNotificationColor(notification.type)}`}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <IconComponent className="w-5 h-5 flex-shrink-0" style={{ color: notification.type === 'urgent' ? '#EF4444' : '#EA580C' }} />
                        <h3 className="font-bold text-gray-900">{notification.title}</h3>
                      </div>
                      <p className="text-gray-700 mb-2">{notification.message}</p>
                      <p className="text-gray-500 text-xs">
                        {new Date(notification.createdAt).toLocaleTimeString()}
                      </p>
                    </div>
                    <button
                      onClick={() => handleMarkAsRead(notification.id)}
                      disabled={markingRead === notification.id}
                      className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 transition font-semibold flex items-center gap-2 whitespace-nowrap ml-4"
                    >
                      <Check className="w-4 h-4" />
                      {markingRead === notification.id ? t('common.processing') : t('kitchen.notifications.acknowledge')}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {orderNotifications.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <ClipboardList className="w-5 h-5" style={{ color: '#EA580C' }} />
              {t('admin.orders.newOrder')} ({orderNotifications.length})
            </h2>
            <div className="space-y-3">
              {orderNotifications.map(notification => (
                <div
                  key={notification.id}
                  className={`p-4 rounded-lg border-l-4 flex items-start justify-between ${getNotificationColor(notification.type)}`}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <ClipboardList className="w-5 h-5" style={{ color: '#EA580C' }} />
                      <h3 className="font-bold text-gray-900">{notification.title}</h3>
                    </div>
                    <p className="text-gray-700 mb-2">{notification.message}</p>
                    <p className="text-gray-500 text-xs">
                      {new Date(notification.createdAt).toLocaleTimeString()}
                    </p>
                  </div>
                  <button
                    onClick={() => handleMarkAsRead(notification.id)}
                    disabled={markingRead === notification.id}
                    className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 transition font-semibold flex items-center gap-2 whitespace-nowrap ml-4"
                  >
                    <Check className="w-4 h-4" />
                    {markingRead === notification.id ? t('common.processing') : t('kitchen.notifications.markRead')}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {unreadNotifications.length === 0 && (
          <div className="text-center py-16">
            <Bell className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg font-medium">{t('kitchen.notifications.noUnreadNotifications')}</p>
            <p className="text-gray-400 text-sm mt-1">{t('kitchen.notifications.noUnreadNotifications')}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default KitchenNotifications;

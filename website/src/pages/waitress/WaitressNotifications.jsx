import { useState, useEffect, useCallback } from 'react';
import { Bell, Check, CheckCheck, AlertCircle, UtensilsCrossed, ClipboardList, CreditCard, AlertTriangle } from 'lucide-react';
import { notificationsAPI } from '../../api/client';
import { useTranslation } from '../../context/LanguageContext';

const WaitressNotifications = () => {
  const { t } = useTranslation();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('new');
  const [markingRead, setMarkingRead] = useState(null);

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const res = await notificationsAPI.getAll();
      setNotifications(Array.isArray(res) ? res : res?.notifications || []);
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
      setNotifications(notifications.map(n => n.id === notificationId ? { ...n, isRead: true } : n));
    } catch (err) {
      setError(err.message);
    } finally {
      setMarkingRead(null);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await notificationsAPI.markAllRead();
      setNotifications(notifications.map(n => ({ ...n, isRead: true })));
    } catch (err) {
      setError(err.message);
    }
  };

  const filteredNotifications = activeTab === 'new'
    ? notifications.filter(n => !n.isRead)
    : notifications.filter(n => n.isRead);

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'order_ready':
        return <UtensilsCrossed className="w-5 h-5" />;
      case 'order_placed':
        return <ClipboardList className="w-5 h-5" />;
      case 'payment_required':
        return <CreditCard className="w-5 h-5" />;
      case 'table_alert':
        return <AlertTriangle className="w-5 h-5" />;
      default:
        return <Bell className="w-5 h-5" />;
    }
  };

  const getNotificationColor = (type) => {
    switch (type) {
      case 'order_ready':
        return 'border-l-green-500 bg-green-50';
      case 'order_placed':
        return 'border-l-blue-500 bg-blue-50';
      case 'payment_required':
        return 'border-l-amber-500 bg-amber-50';
      case 'table_alert':
        return 'border-l-red-500 bg-red-50';
      default:
        return 'border-l-gray-500 bg-gray-50';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
          <p className="mt-4 text-gray-600">Loading notifications...</p>
        </div>
      </div>
    );
  }

  const newCount = notifications.filter(n => !n.isRead).length;
  const readCount = notifications.filter(n => n.isRead).length;

  return (
    <div className="h-full overflow-auto bg-gray-50 p-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
              <Bell className="w-8 h-8" style={{ color: '#16A34A' }} />
              {t('waitress.notifications.title')}
            </h1>
            <p className="text-gray-600 mt-1">{newCount} new · {readCount} read</p>
          </div>
          {activeTab === 'new' && newCount > 0 && (
            <button
              onClick={handleMarkAllAsRead}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition text-sm flex items-center gap-2 font-medium"
            >
              <CheckCheck className="w-4 h-4" />
              {t('admin.dashboard.markAllRead')}
            </button>
          )}
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-100 border border-red-300 rounded-lg flex items-center gap-2 text-red-800">
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        )}

        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('new')}
            className={`px-4 py-2 rounded-lg font-medium transition ${
              activeTab === 'new'
                ? 'bg-green-600 text-white'
                : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {t('waitress.notifications.newTab')} ({newCount})
          </button>
          <button
            onClick={() => setActiveTab('read')}
            className={`px-4 py-2 rounded-lg font-medium transition ${
              activeTab === 'read'
                ? 'bg-green-600 text-white'
                : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {t('waitress.notifications.readTab')} ({readCount})
          </button>
        </div>

        <div className="space-y-3">
          {filteredNotifications.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg">
              <Bell className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 text-lg">
                {activeTab === 'new' ? t('waitress.notifications.noNewNotifications') : t('waitress.notifications.noReadNotifications')}
              </p>
            </div>
          ) : (
            filteredNotifications.map(notification => (
              <div
                key={notification.id}
                className={`p-4 rounded-lg border-l-4 flex items-start justify-between gap-4 ${getNotificationColor(notification.type)}`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="flex-shrink-0 text-gray-600">
                      {getNotificationIcon(notification.type)}
                    </div>
                    <h3 className="font-semibold text-gray-900">{notification.title}</h3>
                  </div>
                  <p className="text-gray-700 text-sm mb-2">{notification.message}</p>
                  <p className="text-gray-500 text-xs">
                    {new Date(notification.createdAt).toLocaleString()}
                  </p>
                </div>

                {!notification.isRead && (
                  <button
                    onClick={() => handleMarkAsRead(notification.id)}
                    disabled={markingRead === notification.id}
                    className="px-3 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50 transition flex items-center gap-1 whitespace-nowrap font-medium"
                  >
                    <Check className="w-4 h-4" />
                    {markingRead === notification.id ? t('common.processing') : t('waitress.notifications.markRead')}
                  </button>
                )}

                {notification.isRead && (
                  <div className="text-gray-400 pt-1">
                    <CheckCheck className="w-5 h-5" />
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default WaitressNotifications;

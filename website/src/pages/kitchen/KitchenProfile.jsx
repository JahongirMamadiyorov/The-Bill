import { useState, useEffect, useCallback } from 'react';
import { User, LogOut, LogIn, AlertCircle, ChefHat } from 'lucide-react';
import { shiftsAPI, ordersAPI } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from '../../context/LanguageContext';

const KitchenProfile = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [shiftStatus, setShiftStatus] = useState(null);
  const [todayStats, setTodayStats] = useState({ ordersCooked: 0, avgTime: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toggling, setToggling] = useState(false);

  const fetchData = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const shiftData = await shiftsAPI.getActive();
      setShiftStatus(shiftData || null);
      setError(null);
    } catch (err) {
      if (!silent) setError(err.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const t = setInterval(() => fetchData(true), 1000);
    return () => clearInterval(t);
  }, [fetchData]);

  useEffect(() => {
    const fetchTodayStats = async () => {
      try {
        const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })();
        const completed = await ordersAPI.getKitchenCompleted({ date: today });
        if (Array.isArray(completed) && completed.length > 0) {
          const avgTime = completed.length > 0
            ? Math.round(completed.reduce((sum, o) => sum + (o.cookTime || 0), 0) / completed.length)
            : 0;
          setTodayStats({
            ordersCooked: completed.length,
            avgTime: avgTime,
          });
        }
      } catch (err) {
        console.error('Error fetching today stats:', err);
      }
    };
    fetchTodayStats();
  }, []);

  const handleToggleShift = async () => {
    try {
      setToggling(true);
      if (shiftStatus && shiftStatus.clockedIn) {
        await shiftsAPI.clockOut();
      } else {
        await shiftsAPI.clockIn({});
      }
      fetchData();
    } catch (err) {
      setError(err.message);
    } finally {
      setToggling(false);
    }
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
        <h1 className="text-3xl font-bold text-gray-900 mb-8 flex items-center gap-3">
          <User className="w-8 h-8" style={{ color: '#EA580C' }} />
          {t('admin.profile.title')}
        </h1>

        {error && (
          <div className="mb-6 p-4 bg-red-100 border border-red-300 rounded-lg flex items-center gap-3 text-red-800">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-200">
            <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-orange-600 font-bold text-2xl">
                {user?.name?.charAt(0).toUpperCase() || 'K'}
              </span>
            </div>
            <h2 className="text-lg font-bold text-gray-900 text-center">{user?.name || t('roles.kitchenStaff', 'Kitchen Staff')}</h2>
            <p className="text-sm text-gray-600 text-center mt-2 flex items-center justify-center gap-1">
              <ChefHat className="w-4 h-4" style={{ color: '#EA580C' }} />
              {t('kitchen.profile.title')}
            </p>
          </div>

          <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-sm font-medium text-gray-600 mb-4">{t('kitchen.profile.contactInformation')}</h3>
            <div className="space-y-4">
              <div>
                <p className="text-xs text-gray-500 mb-1">{t('common.email')}</p>
                <p className="text-sm font-medium text-gray-900">{user?.email || t('common.notProvided', 'Not provided')}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">{t('kitchen.profile.station')}</p>
                <p className="text-sm font-medium text-gray-900">{user?.station || t('kitchen.profile.generalKitchen')}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-sm font-medium text-gray-600 mb-4">{t('kitchen.profile.shiftStatus')}</h3>
            <div className="flex items-center gap-3 mb-4">
              <div
                className="w-4 h-4 rounded-full animate-pulse"
                style={{
                  backgroundColor: shiftStatus?.clockedIn ? '#16A34A' : '#EF4444',
                }}
              ></div>
              <span className="font-semibold text-gray-900">
                {shiftStatus?.clockedIn ? t('admin.staff.clockedIn') : t('admin.staff.clockedOut')}
              </span>
            </div>
            {shiftStatus?.clockedIn && (
              <p className="text-xs text-gray-600 mb-4">
                Since {new Date(shiftStatus.clockIn).toLocaleTimeString()}
              </p>
            )}
            <button
              onClick={handleToggleShift}
              disabled={toggling}
              className={`w-full px-4 py-2 rounded-lg font-semibold text-white transition flex items-center justify-center gap-2 ${
                shiftStatus?.clockedIn
                  ? 'bg-red-600 hover:bg-red-700 disabled:opacity-50'
                  : 'bg-green-600 hover:bg-green-700 disabled:opacity-50'
              }`}
            >
              {shiftStatus?.clockedIn ? (
                <>
                  <LogOut className="w-4 h-4" />
                  {toggling ? t('common.processing') : t('kitchen.profile.clockOut')}
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  {toggling ? t('common.processing') : t('kitchen.profile.clockIn')}
                </>
              )}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <p className="text-gray-600 text-sm font-medium mb-2">{t('kitchen.profile.ordersCookedToday')}</p>
            <p className="text-4xl font-bold" style={{ color: '#EA580C' }}>{todayStats.ordersCooked}</p>
            <p className="text-xs text-gray-500 mt-2">{t('kitchen.dashboard.ordersCompleted')}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <p className="text-gray-600 text-sm font-medium mb-2">{t('kitchen.profile.averageCookTime')}</p>
            <p className="text-4xl font-bold text-gray-900">{todayStats.avgTime}m</p>
            <p className="text-xs text-gray-500 mt-2">{t('kitchen.dashboard.averageDuration')}</p>
          </div>
        </div>

        <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-200">
          <h2 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
            <ChefHat className="w-5 h-5" style={{ color: '#EA580C' }} />
            {t('common.details')}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-gray-600 text-sm font-medium mb-2">{t('kitchen.profile.station')}</p>
              <p className="text-lg font-semibold text-gray-900">{user?.station || t('kitchen.profile.generalKitchen')}</p>
            </div>
            <div>
              <p className="text-gray-600 text-sm font-medium mb-2">{t('common.role')}</p>
              <p className="text-lg font-semibold text-gray-900">{user?.expertise || t('common.allPurpose', 'All-purpose')}</p>
            </div>
            <div>
              <p className="text-gray-600 text-sm font-medium mb-2">{t('admin.profile.memberSince')}</p>
              <p className="text-lg font-semibold text-gray-900">{user?.yearsExperience || '-'} years</p>
            </div>
            <div>
              <p className="text-gray-600 text-sm font-medium mb-2">{t('common.details')}</p>
              <p className="text-lg font-semibold text-gray-900">
                {user?.certifications && Array.isArray(user.certifications) ? user.certifications.join(', ') : 'None'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default KitchenProfile;

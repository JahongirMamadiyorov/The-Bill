import { useState, useEffect, useCallback } from 'react';
import { User, Clock, TrendingUp, AlertCircle } from 'lucide-react';
import { shiftsAPI, reportsAPI } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { money } from '../../hooks/useApi';

const WaitressProfile = () => {
  const { user } = useAuth();
  const [shiftStatus, setShiftStatus] = useState(null);
  const [todayStats, setTodayStats] = useState({ orders: 0, revenue: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toggling, setToggling] = useState(false);

  const fetchData = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const shiftData = await shiftsAPI.getActive();
      setShiftStatus(shiftData || { active: false });
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

  useEffect(() => {
    const fetchTodayStats = async () => {
      try {
        const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })();
        const reports = await reportsAPI.getWaitressPerformance({
          from: today,
          to: today,
        });
        if (reports) {
          setTodayStats({
            orders: reports.ordersServed || 0,
            revenue: reports.totalRevenue || 0,
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
      if (shiftStatus && shiftStatus.active) {
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
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
          <p className="mt-4 text-gray-600">Loading profile...</p>
        </div>
      </div>
    );
  }

  const initials = user?.name
    ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  return (
    <div className="h-full overflow-auto bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8 flex items-center gap-2">
          <User className="w-8 h-8" style={{ color: '#16A34A' }} />
          Profile
        </h1>

        {error && (
          <div className="mb-6 p-4 bg-red-100 border border-red-300 rounded-lg flex items-center gap-2 text-red-800">
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-white p-8 rounded-lg shadow">
            <div className="flex items-center gap-4 mb-6">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center font-bold text-xl text-white"
                style={{ backgroundColor: '#16A34A' }}
              >
                {initials}
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">{user?.name || 'Waitress'}</h2>
                <p className="text-sm text-gray-600">Waitress</p>
              </div>
            </div>

            <div className="space-y-4 border-t pt-6">
              <div>
                <p className="text-gray-600 text-sm mb-1">Email</p>
                <p className="text-lg font-semibold text-gray-900">{user?.email || 'N/A'}</p>
              </div>
              <div>
                <p className="text-gray-600 text-sm mb-1">Phone</p>
                <p className="text-lg font-semibold text-gray-900">{user?.phone || 'N/A'}</p>
              </div>
              <div>
                <p className="text-gray-600 text-sm mb-1">Role</p>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#16A34A' }}></div>
                  <p className="text-lg font-semibold text-gray-900">Waitress</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white p-8 rounded-lg shadow">
            <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
              <Clock className="w-5 h-5" style={{ color: '#16A34A' }} />
              Shift Status
            </h2>
            <div className="space-y-4">
              <div>
                <p className="text-gray-600 text-sm mb-1">Current Status</p>
                <div className="flex items-center gap-2">
                  <div
                    className="w-4 h-4 rounded-full animate-pulse"
                    style={{
                      backgroundColor: shiftStatus?.active ? '#16A34A' : '#EF4444',
                    }}
                  ></div>
                  <p className="text-lg font-semibold text-gray-900">
                    {shiftStatus?.active ? 'Clocked In' : 'Clocked Out'}
                  </p>
                </div>
              </div>
              {shiftStatus?.active && (
                <div>
                  <p className="text-gray-600 text-sm mb-1">Clock In Time</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {new Date(shiftStatus.clockIn).toLocaleTimeString()}
                  </p>
                </div>
              )}
              <div>
                <p className="text-gray-600 text-sm mb-1">Shift Duration</p>
                <p className="text-lg font-semibold text-gray-900">
                  {shiftStatus?.duration ? `${shiftStatus.duration} hours` : 'N/A'}
                </p>
              </div>
              <button
                onClick={handleToggleShift}
                disabled={toggling}
                className={`w-full mt-6 px-4 py-3 rounded-lg font-semibold text-white transition ${
                  shiftStatus?.active
                    ? 'bg-red-600 hover:bg-red-700 disabled:opacity-50'
                    : 'bg-green-600 hover:bg-green-700 disabled:opacity-50'
                }`}
              >
                {toggling ? 'Processing...' : shiftStatus?.active ? 'Clock Out' : 'Clock In'}
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center justify-between mb-2">
              <p className="text-gray-600 text-sm font-medium">Orders Served Today</p>
              <TrendingUp className="w-5 h-5" style={{ color: '#16A34A' }} />
            </div>
            <p className="text-4xl font-bold" style={{ color: '#16A34A' }}>{todayStats.orders}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center justify-between mb-2">
              <p className="text-gray-600 text-sm font-medium">Total Revenue Today</p>
              <TrendingUp className="w-5 h-5" style={{ color: '#16A34A' }} />
            </div>
            <p className="text-3xl font-bold" style={{ color: '#16A34A' }}>{money(todayStats.revenue)}</p>
          </div>
        </div>

        <div className="bg-white p-8 rounded-lg shadow">
          <h2 className="text-xl font-bold text-gray-900 mb-6">Account Settings</h2>
          <div className="space-y-3">
            <button className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition text-left">
              Change Password
            </button>
            <button className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition text-left">
              Notification Preferences
            </button>
            <button className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition text-left">
              View Terms & Conditions
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WaitressProfile;

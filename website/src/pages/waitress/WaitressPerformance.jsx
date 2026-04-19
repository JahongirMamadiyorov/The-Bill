import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, Calendar, Clock, DollarSign, AlertCircle, ClipboardList } from 'lucide-react';
import { reportsAPI, shiftsAPI, staffPaymentsAPI } from '../../api/client';
import { money } from '../../hooks/useApi';
import DatePicker from '../../components/DatePicker';
import { useTranslation } from '../../context/LanguageContext';

const WaitressPerformance = () => {
  const { t } = useTranslation();
  const [performance, setPerformance] = useState(null);
  const [shifts, setShifts] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fromDate, setFromDate] = useState((() => { const d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })());
  const [toDate, setToDate] = useState((() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })());

  const fetchData = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const [perfData, shiftsRes, paymentsRes] = await Promise.all([
        reportsAPI.getWaitressPerformance({ from: fromDate, to: toDate }),
        shiftsAPI.getMyShifts({ from: fromDate, to: toDate }),
        staffPaymentsAPI.getMine({ from: fromDate, to: toDate }),
      ]);
      setPerformance(perfData);
      setShifts(Array.isArray(shiftsRes) ? shiftsRes : shiftsRes?.shifts || []);
      setPayments(Array.isArray(paymentsRes) ? paymentsRes : paymentsRes?.payments || []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => {
    fetchData();
    const t = setInterval(() => fetchData(true), 1000);
    return () => clearInterval(t);
  }, [fetchData]);

  const stats = performance || {
    ordersServed: 0,
    totalRevenue: 0,
    averagePerOrder: 0,
    shiftHours: 0,
  };

  const totalPayments = payments.reduce((sum, p) => sum + p.amount, 0);

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
        <h1 className="text-3xl font-bold text-gray-900 mb-8 flex items-center gap-2">
          <TrendingUp className="w-8 h-8" style={{ color: '#16A34A' }} />
          {t('waitress.performance.title')}
        </h1>

        {error && (
          <div className="mb-6 p-4 bg-red-100 border border-red-300 rounded-lg flex items-center gap-2 text-red-800">
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        )}

        <div className="bg-white p-6 rounded-lg shadow mb-8">
          <div className="flex flex-col md:flex-row gap-4 items-end">
            <div className="flex-1">
              <label className="block text-sm font-semibold text-gray-700 mb-2">{t('common.from')}</label>
              <DatePicker
                value={fromDate}
                onChange={(v) => setFromDate(v)}
                placeholder={t('common.from')}
                className="w-full"
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-semibold text-gray-700 mb-2">{t('common.to')}</label>
              <DatePicker
                value={toDate}
                onChange={(v) => setToDate(v)}
                placeholder={t('common.to')}
                className="w-full"
              />
            </div>
            <button
              onClick={fetchData}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium"
            >
              {t('common.apply')}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center justify-between mb-2">
              <p className="text-gray-600 text-sm font-medium">{t('waitress.performance.ordersServed')}</p>
              <ClipboardList className="w-5 h-5" style={{ color: '#16A34A' }} />
            </div>
            <p className="text-4xl font-bold" style={{ color: '#16A34A' }}>{stats.ordersServed || 0}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center justify-between mb-2">
              <p className="text-gray-600 text-sm font-medium">{t('waitress.performance.totalRevenue')}</p>
              <DollarSign className="w-5 h-5" style={{ color: '#16A34A' }} />
            </div>
            <p className="text-3xl font-bold" style={{ color: '#16A34A' }}>{money(stats.totalRevenue || 0)}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center justify-between mb-2">
              <p className="text-gray-600 text-sm font-medium">{t('waitress.performance.averagePerOrder')}</p>
              <DollarSign className="w-5 h-5 text-gray-600" />
            </div>
            <p className="text-3xl font-bold text-gray-900">{money(stats.averagePerOrder || 0)}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center justify-between mb-2">
              <p className="text-gray-600 text-sm font-medium">{t('waitress.performance.shiftHours')}</p>
              <Clock className="w-5 h-5 text-gray-600" />
            </div>
            <p className="text-4xl font-bold text-gray-900">{stats.shiftHours || 0}h</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-8 rounded-lg shadow">
            <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
              <Calendar className="w-5 h-5" style={{ color: '#16A34A' }} />
              {t('admin.staff.attendanceShifts')}
            </h2>
            <div className="space-y-3">
              {shifts.length === 0 ? (
                <div className="text-center py-8">
                  <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-500">{t('waitress.performance.noShifts')}</p>
                </div>
              ) : (
                shifts.map(shift => {
                  const clockIn = new Date(shift.clockIn);
                  const clockOut = shift.clockOut ? new Date(shift.clockOut) : null;
                  const duration = clockOut ? ((clockOut - clockIn) / (1000 * 60 * 60)).toFixed(1) : 0;

                  return (
                    <div key={shift.id} className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition">
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-semibold text-gray-900">{clockIn.toLocaleDateString()}</p>
                        <span className="text-xs font-semibold px-3 py-1 rounded-full" style={{ backgroundColor: '#16A34A', color: 'white' }}>
                          {duration}h
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        {clockIn.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {clockOut ? clockOut.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : t('waitress.performance.inProgress')}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="bg-white p-8 rounded-lg shadow">
            <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
              <DollarSign className="w-5 h-5" style={{ color: '#16A34A' }} />
              {t('cashier.history.title')}
            </h2>
            <div className="space-y-3">
              {payments.length === 0 ? (
                <div className="text-center py-8">
                  <DollarSign className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-500">{t('waitress.performance.noPayments')}</p>
                </div>
              ) : (
                <>
                  {payments.map(payment => (
                    <div key={payment.id} className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition">
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-semibold text-gray-900">{payment.description || t('waitress.performance.payment')}</p>
                        <p className="font-bold text-lg" style={{ color: '#16A34A' }}>{money(payment.amount)}</p>
                      </div>
                      <p className="text-sm text-gray-600">
                        {new Date(payment.date).toLocaleDateString()}
                      </p>
                    </div>
                  ))}
                  <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-gray-600 text-sm mb-1">{t('waitress.performance.totalPayments')}</p>
                    <p className="text-2xl font-bold" style={{ color: '#16A34A' }}>{money(totalPayments)}</p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WaitressPerformance;

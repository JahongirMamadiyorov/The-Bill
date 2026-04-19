import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronUp, Users, TrendingUp, AlertCircle } from 'lucide-react';
import { usersAPI, shiftsAPI, reportsAPI } from '../../api/client';
import { money } from '../../hooks/useApi';
import { useTranslation } from '../../context/LanguageContext';

export default function OwnerStaff() {
  const { t } = useTranslation();
  const [staff, setStaff] = useState([]);
  const [staffStatus, setStaffStatus] = useState({});
  const [performance, setPerformance] = useState({});
  const [payroll, setPayroll] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStaffData = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const [staffList, statusData, perfData, payrollData] = await Promise.all([
        usersAPI.getAll(),
        shiftsAPI.getStaffStatus(),
        reportsAPI.getWaitressPerformance(),
        shiftsAPI.getPayroll(),
      ]);
      setStaff(Array.isArray(staffList?.items) ? staffList.items : Array.isArray(staffList) ? staffList : []);
      const statusMap = {};
      (Array.isArray(statusData?.items) ? statusData.items : Array.isArray(statusData) ? statusData : []).forEach(s => { statusMap[s.userId] = s; });
      setStaffStatus(statusMap);
      const perfMap = {};
      (Array.isArray(perfData?.items) ? perfData.items : Array.isArray(perfData) ? perfData : []).forEach(p => { perfMap[p.userId] = p; });
      setPerformance(perfMap);
      setPayroll(payrollData || null);
      setError(null);
    } catch (err) {
      if (!silent) setError(err.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStaffData();
    const t = setInterval(() => fetchStaffData(true), 1000);
    return () => clearInterval(t);
  }, [fetchStaffData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-600">{t('owner.staff.loadingStaff')}</p>
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
          onClick={() => fetchStaffData()}
          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
        >
          {t('common.retry')}
        </button>
      </div>
    );
  }

  const toggleExpand = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const onShiftCount = Object.values(staffStatus).filter(s => s.isOnShift).length;

  return (
    <div className="h-full overflow-auto bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8 flex items-center gap-2">
          <Users className="w-8 h-8" style={{ color: '#7C3AED' }} />
          {t('owner.staff.title')}
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-gray-600">{t('owner.staff.totalStaff')}</h3>
              <Users className="w-5 h-5" style={{ color: '#7C3AED' }} />
            </div>
            <p className="text-3xl font-bold text-gray-900">{staff.length}</p>
            <p className="text-xs text-gray-500 mt-2">{t('owner.staff.teamMembers')}</p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-gray-600">{t('owner.staff.onShift')}</h3>
              <TrendingUp className="w-5 h-5" style={{ color: '#7C3AED' }} />
            </div>
            <p className="text-3xl font-bold text-gray-900">{onShiftCount}</p>
            <p className="text-xs text-gray-500 mt-2">{t('owner.staff.onShift')}</p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-gray-600">{t('owner.finance.payrollSummary')}</h3>
              <DollarSignIcon className="w-5 h-5" style={{ color: '#7C3AED' }} />
            </div>
            <p className="text-3xl font-bold text-gray-900">{money(payroll?.totalPayroll || 0)}</p>
            <p className="text-xs text-gray-500 mt-2">{t('owner.finance.totalExpenses')}</p>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-bold text-gray-900">{t('admin.staff.staffList')}</h2>
          </div>

          <div className="divide-y divide-gray-200">
            {staff.length > 0 ? (
              staff.map((member) => {
                const status = staffStatus[member.id];
                const perf = performance[member.id];
                const isExpanded = expandedId === member.id;

                return (
                  <div key={member.id}>
                    <button
                      onClick={() => toggleExpand(member.id)}
                      className="w-full p-6 hover:bg-gray-50 transition text-left flex items-center justify-between"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                            <span className="text-purple-600 font-bold text-sm">
                              {member.name?.charAt(0).toUpperCase() || 'S'}
                            </span>
                          </div>
                          <div>
                            <p className="font-bold text-gray-900">{member.name}</p>
                            <p className="text-sm text-gray-600">{member.role}</p>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-8 mr-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                          status?.isOnShift
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-700'
                        }`}>
                          {status?.isOnShift ? t('owner.staff.onShift') : t('superAdmin.filterInactive')}
                        </span>

                        {perf && (
                          <div className="text-right hidden sm:block">
                            <p className="text-sm font-medium text-gray-900">{perf.avgRating}/5</p>
                            <p className="text-xs text-gray-600">{t('common.status')}</p>
                          </div>
                        )}
                      </div>

                      {isExpanded ? (
                        <ChevronUp className="w-5 h-5 text-gray-400 flex-shrink-0" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />
                      )}
                    </button>

                    {isExpanded && (
                      <div className="px-6 py-5 bg-gray-50 border-t border-gray-200">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                          <div>
                            <p className="text-xs font-medium text-gray-600 mb-1">{t('common.email')}</p>
                            <p className="text-sm font-medium text-gray-900">{member.email}</p>
                          </div>
                          {perf && (
                            <>
                              <div>
                                <p className="text-xs font-medium text-gray-600 mb-1">{t('owner.staff.ordersHandled')}</p>
                                <p className="text-sm font-medium text-gray-900">{perf.ordersHandled}</p>
                              </div>
                              <div>
                                <p className="text-xs font-medium text-gray-600 mb-1">{t('owner.staff.avgRating')}</p>
                                <p className="text-sm font-medium text-gray-900">{perf.avgRating}/5</p>
                              </div>
                              <div>
                                <p className="text-xs font-medium text-gray-600 mb-1">{t('owner.staff.hourlyRate')}</p>
                                <p className="text-sm font-medium text-gray-900">{money(perf.hourlyRate || 0)}</p>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="text-center py-8 text-gray-500">{t('common.noResults')}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DollarSignIcon({ className, style }) {
  return (
    <svg className={className} style={style} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

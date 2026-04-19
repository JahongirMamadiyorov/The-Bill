import { useState, useEffect, useCallback, useMemo } from 'react';
import { TrendingUp, TrendingDown, Plus, Edit2, Trash2, X, AlertCircle } from 'lucide-react';
import { financeAPI } from '../../api/client';
import { money, todayStr } from '../../hooks/useApi';
import Dropdown from '../../components/Dropdown';
import DatePicker from '../../components/DatePicker';
import { useTranslation } from '../../context/LanguageContext';

const P  = '#7C3AED';
const PL = '#F5F3FF';

const now = new Date();
const DEFAULT_FROM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

export default function OwnerFinance() {
  const { t } = useTranslation();
  const [fromDate, setFromDate] = useState(DEFAULT_FROM);
  const [toDate, setToDate] = useState(todayStr());
  const [summary, setSummary] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [loans, setLoans] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [taxes, setTaxes] = useState([]);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showLoanModal, setShowLoanModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const [expenseForm, setExpenseForm] = useState({ description: '', amount: '', category: '' });
  const [loanForm, setLoanForm] = useState({ lenderName: '', totalAmount: '', interestRate: '', dueDate: '' });

  /* The finance backend expects "start" / "end" query params, not "from" / "to" */
  const fetchFinanceData = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const params = { start: fromDate, end: toDate };
      const [sumData, expData, loanData, budgetData, taxData] = await Promise.all([
        financeAPI.getSummary(params).catch(() => null),
        financeAPI.getExpenses(params).catch(() => []),
        financeAPI.getLoans().catch(() => []),
        financeAPI.getBudgets().catch(() => []),
        financeAPI.getTaxHistory().catch(() => []),
      ]);
      setSummary(sumData);
      setExpenses(Array.isArray(expData) ? expData : []);
      setLoans(Array.isArray(loanData) ? loanData : []);
      setBudgets(Array.isArray(budgetData) ? budgetData : []);
      setTaxes(Array.isArray(taxData) ? taxData : []);
      setError(null);
    } catch (err) {
      if (!silent) setError(err.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => {
    fetchFinanceData();
    const t = setInterval(() => fetchFinanceData(true), 5000);
    return () => clearInterval(t);
  }, [fetchFinanceData]);

  /* Computed values from the summary */
  const totalRevenue  = summary?.current?.totalRevenue  || 0;
  const totalExpenses = summary?.current?.totalExpenses  || 0;
  const netProfit     = summary?.current?.netProfit      || 0;
  const profitMargin  = summary?.current?.profitMargin   || 0;

  /* Total outstanding debt from loans */
  const totalDebt = useMemo(
    () => loans.reduce((sum, l) => {
      const remaining = (l.totalAmount || 0) - (l.amountPaid || 0);
      return sum + (remaining > 0 ? remaining : 0);
    }, 0),
    [loans]
  );

  /* Revenue breakdown from summary */
  const revenueBreakdown = useMemo(() => {
    if (!summary?.revenueByPayment) return [];
    const pm = summary.revenueByPayment;
    return [
      { category: t('paymentMethods.cash'),   amount: pm.cash || 0 },
      { category: t('paymentMethods.card'),   amount: pm.card || 0 },
      { category: t('paymentMethods.qrCode') + '/' + t('paymentMethods.online'), amount: pm.qr || 0 },
    ].filter(i => i.amount > 0);
  }, [summary]);

  /* Expense breakdown from summary */
  const expenseBreakdown = useMemo(() => {
    if (!summary?.expenseByCategory) return [];
    return summary.expenseByCategory.map(item => ({
      category: item.category,
      amount: item.total || 0,
    }));
  }, [summary]);

  /* Budget vs Actual - join budgets with expense data */
  const budgetItems = useMemo(() => {
    if (budgets.length === 0) return [];
    const expMap = {};
    expenses.forEach(e => {
      const cat = e.category || t('common.other', 'Other');
      expMap[cat] = (expMap[cat] || 0) + parseFloat(e.amount || 0);
    });
    return budgets.map(b => ({
      category: b.category,
      budgeted: parseFloat(b.monthlyBudget || 0),
      actual: expMap[b.category] || 0,
    }));
  }, [budgets, expenses]);

  /* Handlers */
  const handleAddExpense = async () => {
    if (!expenseForm.description || !expenseForm.amount) return;
    try {
      setSaving(true);
      await financeAPI.createExpense({
        description: expenseForm.description,
        amount: parseFloat(expenseForm.amount),
        category: expenseForm.category || t('common.other', 'Other'),
        date: todayStr(),
      });
      setShowExpenseModal(false);
      setExpenseForm({ description: '', amount: '', category: '' });
      await fetchFinanceData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEditExpense = (expense) => {
    setEditingExpense(expense);
    setExpenseForm({
      description: expense.description || '',
      amount: expense.amount || '',
      category: expense.category || '',
    });
    setShowExpenseModal(true);
  };

  const handleUpdateExpense = async () => {
    if (!expenseForm.description || !expenseForm.amount || !editingExpense) return;
    try {
      setSaving(true);
      await financeAPI.updateExpense(editingExpense.id, {
        description: expenseForm.description,
        amount: parseFloat(expenseForm.amount),
        category: expenseForm.category || t('common.other', 'Other'),
      });
      setShowExpenseModal(false);
      setEditingExpense(null);
      setExpenseForm({ description: '', amount: '', category: '' });
      await fetchFinanceData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteExpense = async (expenseId) => {
    if (!window.confirm(t('common.confirmDelete'))) return;
    try {
      await financeAPI.deleteExpense(expenseId);
      await fetchFinanceData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleAddLoan = async () => {
    if (!loanForm.lenderName || !loanForm.totalAmount) return;
    try {
      setSaving(true);
      await financeAPI.createLoan({
        lenderName: loanForm.lenderName,
        totalAmount: parseFloat(loanForm.totalAmount),
        interestRate: parseFloat(loanForm.interestRate) || 0,
        dueDate: loanForm.dueDate || null,
      });
      setShowLoanModal(false);
      setLoanForm({ lenderName: '', totalAmount: '', interestRate: '', dueDate: '' });
      await fetchFinanceData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const closeExpenseModal = () => {
    setShowExpenseModal(false);
    setEditingExpense(null);
    setExpenseForm({ description: '', amount: '', category: '' });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-600">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  if (error && !summary) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-lg m-6">
        <div className="flex items-center gap-3 mb-4">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <p className="text-red-700">Error: {error}</p>
        </div>
        <button onClick={() => fetchFinanceData()} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition">
          {t('common.retry')}
        </button>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8 flex items-center gap-2">
          <DollarSignIcon className="w-8 h-8" style={{ color: P }} />
          {t('owner.finance.title')}
        </h1>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <span className="text-red-700">{error}</span>
            <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Date Range */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 mb-8">
          <div className="flex gap-6 items-end flex-wrap">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('common.from')}</label>
              <DatePicker value={fromDate} onChange={setFromDate} placeholder={t('common.from')} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('common.to')}</label>
              <DatePicker value={toDate} onChange={setToDate} placeholder={t('common.to')} />
            </div>
            <button
              onClick={() => { setFromDate(todayStr()); setToDate(todayStr()); }}
              className="px-4 py-2 text-sm font-bold text-white rounded-lg transition" style={{ backgroundColor: P }}
            >
              {t('common.today')}
            </button>
          </div>
        </div>

        {/* ── KPI Cards ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-600">{t('owner.finance.totalRevenue')}</h3>
              <TrendingUp className="w-5 h-5 text-green-600" />
            </div>
            <p className="text-3xl font-bold text-green-600">{money(totalRevenue)}</p>
            <p className="text-xs text-gray-500 mt-2">{t('owner.finance.totalRevenue')}</p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-600">{t('owner.finance.totalExpenses')}</h3>
              <TrendingDown className="w-5 h-5 text-red-600" />
            </div>
            <p className="text-3xl font-bold text-red-600">{money(totalExpenses)}</p>
            <p className="text-xs text-gray-500 mt-2">{t('owner.finance.totalExpenses')}</p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-600">{t('owner.finance.netProfit')}</h3>
              {netProfit >= 0
                ? <TrendingUp className="w-5 h-5 text-green-600" />
                : <TrendingDown className="w-5 h-5 text-red-600" />
              }
            </div>
            <p className={`text-3xl font-bold ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {money(netProfit)}
            </p>
            <p className="text-xs text-gray-500 mt-2">{profitMargin}% {t('owner.finance.profitMargin')}</p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-600">{t('owner.finance.loansDebt')}</h3>
              <AlertCircle className="w-5 h-5 text-orange-600" />
            </div>
            <p className="text-3xl font-bold text-orange-600">{money(totalDebt)}</p>
            <p className="text-xs text-gray-500 mt-2">{t('owner.finance.loansDebt')}</p>
          </div>
        </div>

        {/* ── Revenue & Expense Breakdown ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h2 className="text-lg font-bold text-gray-900 mb-4">{t('owner.finance.revenueBreakdown')}</h2>
            <div className="space-y-4">
              {revenueBreakdown.length > 0 ? (
                revenueBreakdown.map((item, idx) => (
                  <div key={idx}>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-medium text-gray-700">{item.category}</span>
                      <span className="text-sm font-bold text-gray-900">{money(item.amount)}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="h-2 rounded-full transition-all"
                        style={{ backgroundColor: P, width: `${Math.min((item.amount / (totalRevenue || 1)) * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-center text-gray-500 py-4">{t('common.noResults')}</p>
              )}
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h2 className="text-lg font-bold text-gray-900 mb-4">{t('owner.finance.totalExpenses')}</h2>
            <div className="space-y-4">
              {expenseBreakdown.length > 0 ? (
                expenseBreakdown.map((item, idx) => (
                  <div key={idx}>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-medium text-gray-700">{item.category}</span>
                      <span className="text-sm font-bold text-gray-900">{money(item.amount)}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-red-600 h-2 rounded-full transition-all"
                        style={{ width: `${Math.min((item.amount / (totalExpenses || 1)) * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-center text-gray-500 py-4">{t('common.noResults')}</p>
              )}
            </div>
          </div>
        </div>

        {/* ── Expenses Table + Budget vs Actual ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-lg font-bold text-gray-900">{t('owner.finance.totalExpenses')}</h2>
              <button
                onClick={() => {
                  setEditingExpense(null);
                  setExpenseForm({ description: '', amount: '', category: '' });
                  setShowExpenseModal(true);
                }}
                className="flex items-center gap-2 px-3 py-2 text-white rounded-lg hover:opacity-90 transition"
                style={{ backgroundColor: P }}
              >
                <Plus className="w-4 h-4" /> {t('common.add')}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-200 bg-gray-50">
                  <tr>
                    <th className="text-left py-2 px-4 text-gray-600 font-medium">{t('common.description')}</th>
                    <th className="text-left py-2 px-4 text-gray-600 font-medium">{t('common.category')}</th>
                    <th className="text-left py-2 px-4 text-gray-600 font-medium">{t('common.amount')}</th>
                    <th className="text-left py-2 px-4 text-gray-600 font-medium">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.length > 0 ? (
                    expenses.map((exp, idx) => (
                      <tr key={exp.id || idx} className="border-b border-gray-100 hover:bg-gray-50 transition">
                        <td className="py-3 px-4 text-gray-900 font-medium">{exp.description}</td>
                        <td className="py-3 px-4 text-gray-600">{exp.category}</td>
                        <td className="py-3 px-4 text-gray-900 font-medium">{money(exp.amount || 0)}</td>
                        <td className="py-3 px-4">
                          <div className="flex gap-2">
                            <button onClick={() => handleEditExpense(exp)} className="text-purple-600 hover:text-purple-700 transition" title={t('common.edit', 'Edit')}>
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleDeleteExpense(exp.id)} className="text-red-600 hover:text-red-700 transition" title={t('common.delete', 'Delete')}>
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="4" className="text-center py-8 text-gray-500">{t('common.noResults')}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-900">{t('owner.finance.budgetVsActual')}</h2>
            </div>
            <div className="p-6 space-y-4">
              {budgetItems.length > 0 ? (
                budgetItems.map((b, idx) => {
                  const pct = b.budgeted > 0 ? (b.actual / b.budgeted) * 100 : 0;
                  return (
                    <div key={idx}>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm font-medium text-gray-700">{b.category}</span>
                        <span className="text-sm font-bold text-gray-900">{Math.min(pct, 100).toFixed(0)}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all ${pct > 100 ? 'bg-red-600' : 'bg-blue-600'}`}
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-1">{money(b.actual)} / {money(b.budgeted)}</p>
                    </div>
                  );
                })
              ) : (
                <p className="text-center text-gray-500 py-4">{t('common.noResults')}</p>
              )}
            </div>
          </div>
        </div>

        {/* ── Loans + Tax Summary ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-lg font-bold text-gray-900">{t('owner.finance.loansDebt')}</h2>
              <button
                onClick={() => setShowLoanModal(true)}
                className="flex items-center gap-2 px-3 py-2 text-white rounded-lg hover:opacity-90 transition"
                style={{ backgroundColor: P }}
              >
                <Plus className="w-4 h-4" /> {t('common.add')}
              </button>
            </div>
            <div className="p-6 space-y-4">
              {loans.length > 0 ? (
                loans.map((loan, idx) => {
                  const remaining = (loan.totalAmount || 0) - (loan.amountPaid || 0);
                  const paidPct = loan.totalAmount > 0 ? ((loan.amountPaid || 0) / loan.totalAmount) * 100 : 0;
                  return (
                    <div key={loan.id || idx} className="border border-gray-200 p-4 rounded-lg hover:shadow-sm transition">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h3 className="font-bold text-gray-900">{loan.lenderName}</h3>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                            loan.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                          }`}>
                            {loan.status || 'active'}
                          </span>
                        </div>
                        <span className="text-lg font-bold" style={{ color: P }}>{money(loan.totalAmount || 0)}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-sm text-gray-600 mt-3">
                        <div>
                          <p className="text-xs text-gray-500">{t('owner.finance.interestRate')}</p>
                          <p className="font-medium text-gray-900">{loan.interestRate || 0}%</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">{t('common.paid')}</p>
                          <p className="font-medium text-gray-900">{money(loan.amountPaid || 0)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">{t('owner.finance.remaining')}</p>
                          <p className="font-medium text-red-600">{money(remaining > 0 ? remaining : 0)}</p>
                        </div>
                      </div>
                      {/* Payment progress bar */}
                      <div className="w-full bg-gray-200 rounded-full h-1.5 mt-3">
                        <div className="h-1.5 rounded-full transition-all" style={{ backgroundColor: P, width: `${Math.min(paidPct, 100)}%` }} />
                      </div>
                      {loan.dueDate && (
                        <p className="text-xs text-gray-400 mt-2">{t('owner.finance.duePrefix')} {new Date(loan.dueDate).toLocaleDateString()}</p>
                      )}
                    </div>
                  );
                })
              ) : (
                <p className="text-center text-gray-500 py-4">{t('common.noResults')}</p>
              )}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-900">{t('owner.finance.taxSummary')}</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-200 bg-gray-50">
                  <tr>
                    <th className="text-left py-2 px-4 text-gray-600 font-medium">{t('common.date')}</th>
                    <th className="text-left py-2 px-4 text-gray-600 font-medium">{t('owner.finance.totalRevenue')}</th>
                    <th className="text-left py-2 px-4 text-gray-600 font-medium">{t('owner.finance.taxSummary')}</th>
                  </tr>
                </thead>
                <tbody>
                  {taxes.length > 0 ? (
                    taxes.map((tax, idx) => (
                      <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50 transition">
                        <td className="py-3 px-4 text-gray-900 font-medium">{tax.monthLabel || tax.month}</td>
                        <td className="py-3 px-4 text-gray-600">{money(tax.revenue || 0)}</td>
                        <td className="py-3 px-4 text-gray-900 font-medium">{money(tax.taxCollected || 0)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="3" className="text-center py-8 text-gray-500">{t('common.noResults')}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ── Expense Modal ── */}
        {showExpenseModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-8 rounded-lg w-96 shadow-xl">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-900">
                  {editingExpense ? t('owner.finance.editExpense') : t('owner.finance.addExpense')}
                </h2>
                <button onClick={closeExpenseModal} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.description')}</label>
                  <input
                    type="text"
                    value={expenseForm.description}
                    onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder={t('owner.finance.descriptionPlaceholder')}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.category')}</label>
                  <Dropdown
                    value={expenseForm.category}
                    onChange={(value) => setExpenseForm({ ...expenseForm, category: value })}
                    options={[
                      { value: '', label: t('owner.finance.selectCategory') },
                      ...t('owner.finance.expenseCategories').map((cat, i) => ({
                        value: ['Supplies','Utilities','Maintenance','Marketing','Rent','Salaries','Other'][i],
                        label: cat,
                      })),
                    ]}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.amount')}</label>
                  <input
                    type="number"
                    value={expenseForm.amount}
                    onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder={t('placeholders.zero', '0')}
                  />
                </div>
                <div className="flex gap-3 mt-6">
                  <button onClick={closeExpenseModal} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition">
                    {t('common.cancel')}
                  </button>
                  <button
                    onClick={editingExpense ? handleUpdateExpense : handleAddExpense}
                    disabled={saving}
                    className="flex-1 px-4 py-2 text-white rounded-lg hover:opacity-90 transition disabled:opacity-50"
                    style={{ backgroundColor: P }}
                  >
                    {saving ? t('common.saving') : editingExpense ? t('common.save') : t('common.add')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Loan Modal ── */}
        {showLoanModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-8 rounded-lg w-96 shadow-xl">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-900">{t('owner.finance.addLoan')}</h2>
                <button onClick={() => setShowLoanModal(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('owner.finance.lenderNamePlaceholder')}</label>
                  <input
                    type="text"
                    value={loanForm.lenderName}
                    onChange={(e) => setLoanForm({ ...loanForm, lenderName: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder={t('owner.finance.lenderNamePlaceholder')}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.amount')}</label>
                  <input
                    type="number"
                    value={loanForm.totalAmount}
                    onChange={(e) => setLoanForm({ ...loanForm, totalAmount: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder={t('placeholders.zero', '0')}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('owner.finance.interestRate')}</label>
                  <input
                    type="number"
                    value={loanForm.interestRate}
                    onChange={(e) => setLoanForm({ ...loanForm, interestRate: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder={t('placeholders.zero', '0')}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('owner.finance.dueDatePlaceholder')}</label>
                  <DatePicker
                    value={loanForm.dueDate}
                    onChange={(v) => setLoanForm({ ...loanForm, dueDate: v })}
                    placeholder={t('owner.finance.dueDatePlaceholder')}
                  />
                </div>
                <div className="flex gap-3 mt-6">
                  <button onClick={() => setShowLoanModal(false)} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition">
                    {t('common.cancel')}
                  </button>
                  <button
                    onClick={handleAddLoan}
                    disabled={saving}
                    className="flex-1 px-4 py-2 text-white rounded-lg hover:opacity-90 transition disabled:opacity-50"
                    style={{ backgroundColor: P }}
                  >
                    {saving ? t('common.saving') : t('common.add')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
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

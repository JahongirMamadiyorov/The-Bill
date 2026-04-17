import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, Modal, Pressable, TouchableOpacity,
  TextInput, Switch, Dimensions, StyleSheet, LayoutAnimation,
  Platform, UIManager, Share, ActivityIndicator,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import OwnerPageHeader from '../../components/OwnerPageHeader';
import {
  OwnerPeriodBar, OwnerCalendarPicker, TODAY_STR, fmtDate,
} from '../../components/OwnerPeriodPicker';
import { shadow } from '../../utils/theme';
import { financeAPI } from '../../api/client';
import ConfirmDialog from '../../components/ConfirmDialog';

// ════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ════════════════════════════════════════════════════════════════════════
const P  = '#7C3AED';
const PL = '#F5F3FF';
const GN = '#10B981';
const RD = '#EF4444';
const AM = '#F59E0B';
const BL = '#3B82F6';
const CY = '#06B6D4';
const PK = '#EC4899';
const { width: SW, height: SH } = Dimensions.get('window');

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const _now = new Date();
const DEFAULT_PERIOD = {
  from: `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}-01`,
  to: TODAY_STR,
};

const money = (v) => {
  const n = Math.round(Number(v) || 0);
  const neg = n < 0;
  const s = Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return (neg ? '-' : '') + s + " so'm";
};

const pctStr = (cur, prev) => {
  if (!prev) return cur > 0 ? '+100%' : '0%';
  const c = ((cur - prev) / Math.abs(prev) * 100).toFixed(1);
  return (c > 0 ? '+' : '') + c + '%';
};

const CATS = ['Rent','Utilities','Salaries','Ingredients','Equipment','Marketing','Maintenance','Other'];
const CAT_IC = { Rent:'home', Utilities:'bolt', Salaries:'people', Ingredients:'restaurant', Equipment:'build', Marketing:'campaign', Maintenance:'handyman', Other:'more-horiz' };
const INC_CATS = ['Sales','Other Income','Refund Received'];
const INC_IC = { Sales:'point-of-sale', 'Other Income':'attach-money', 'Refund Received':'replay' };
const SHORT_DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

// ════════════════════════════════════════════════════════════════════════
// REUSABLE PIECES (internal only)
// ════════════════════════════════════════════════════════════════════════
function BottomSheet({ visible, onClose, title, children }) {
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.bsOverlay} onPress={onClose} />
      <View style={s.bsBox}>
        <View style={s.bsHandle} />
        {title ? (
          <View style={s.bsTitleRow}>
            <Text style={s.bsTitleTxt}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={12}><MaterialIcons name="close" size={22} color="#9CA3AF" /></Pressable>
          </View>
        ) : null}
        <ScrollView style={{ paddingHorizontal: 16 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {children}
          <View style={{ height: 36 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

function Sec({ title, icon, open: dOpen, children }) {
  const [open, setOpen] = useState(dOpen || false);
  const toggle = () => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setOpen(o => !o); };
  return (
    <View style={s.sec}>
      <Pressable style={s.secHdr} onPress={toggle}>
        <MaterialIcons name={icon} size={20} color={P} style={{ marginRight: 10 }} />
        <Text style={s.secTitle}>{title}</Text>
        <View style={{ flex: 1 }} />
        <MaterialIcons name={open ? 'expand-less' : 'expand-more'} size={24} color={P} />
      </Pressable>
      {open && <View style={s.secBody}>{children}</View>}
    </View>
  );
}

function Bar({ pct, color = P, h = 8 }) {
  return (
    <View style={{ height: h, backgroundColor: '#E5E7EB', borderRadius: h / 2, overflow: 'hidden' }}>
      <View style={{ height: h, width: `${Math.min(Math.max(pct || 0, 0), 100)}%`, backgroundColor: color, borderRadius: h / 2 }} />
    </View>
  );
}

function Pills({ opts, val, onPick, icons }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {opts.map(o => {
        const on = val === o;
        return (
          <Pressable key={o} onPress={() => onPick(o)} style={[s.pill, on && s.pillOn]}>
            {icons && icons[o] ? <MaterialIcons name={icons[o]} size={14} color={on ? P : '#6B7280'} style={{ marginRight: 4 }} /> : null}
            <Text style={[s.pillTx, on && s.pillTxOn]}>{o}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function LabelInput({ icon, label, children }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 5 }}>
        {icon ? <MaterialIcons name={icon} size={14} color="#6B7280" style={{ marginRight: 5 }} /> : null}
        <Text style={s.formLbl}>{label}</Text>
      </View>
      {children}
    </View>
  );
}

// ── Single-date calendar picker (mirrors OwnerCalendarPicker style) ──
const CAL_DAYS = ['Mo','Tu','We','Th','Fr','Sa','Su'];
const CAL_MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function DatePickerModal({ visible, onClose, value, onChange }) {
  const initD = value ? new Date(value + 'T00:00:00') : new Date();
  const [vYear, setVYear] = useState(initD.getFullYear());
  const [vMonth, setVMonth] = useState(initD.getMonth());
  const [selected, setSelected] = useState(value || TODAY_STR);

  React.useEffect(() => {
    if (visible) {
      const d = value ? new Date(value + 'T00:00:00') : new Date();
      setVYear(d.getFullYear());
      setVMonth(d.getMonth());
      setSelected(value || TODAY_STR);
    }
  }, [visible]);

  const prevM = () => { if (vMonth === 0) { setVMonth(11); setVYear(y => y - 1); } else setVMonth(m => m - 1); };
  const nextM = () => { if (vMonth === 11) { setVMonth(0); setVYear(y => y + 1); } else setVMonth(m => m + 1); };

  const firstDow = (new Date(vYear, vMonth, 1).getDay() + 6) % 7;
  const daysInM = new Date(vYear, vMonth + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInM; d++) cells.push(fmtDate(new Date(vYear, vMonth, d)));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const handlePick = (ds) => { setSelected(ds); };
  const apply = () => { onChange(selected); onClose(); };

  if (!visible) return null;
  const topPad = Platform.OS === 'android' ? (Platform.Version >= 21 ? 24 : 0) : 44;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#fff' }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, paddingTop: topPad + 12, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' }}>
          <TouchableOpacity onPress={onClose} style={{ width: 70 }}>
            <Text style={{ fontSize: 15, color: P, fontWeight: '700' }}>{'<-'} Back</Text>
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, justifyContent: 'center' }}>
            <MaterialIcons name="calendar-today" size={18} color={P} style={{ marginRight: 6 }} />
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#111827' }}>Select Date</Text>
          </View>
          <View style={{ width: 70 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {/* Selected date display */}
          <View style={{ alignItems: 'center', marginBottom: 16 }}>
            <View style={{ backgroundColor: PL, borderWidth: 2, borderColor: P, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 }}>
              <Text style={{ fontSize: 10, color: '#9CA3AF', fontWeight: '700', marginBottom: 2, textAlign: 'center' }}>SELECTED</Text>
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#111827' }}>{selected}</Text>
            </View>
          </View>

          {/* Month nav */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <TouchableOpacity onPress={prevM} style={{ padding: 10 }}>
              <Text style={{ fontSize: 26, color: P, fontWeight: '700', lineHeight: 30 }}>{'\u2039'}</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 17, fontWeight: '800', color: '#111827' }}>{CAL_MONTHS[vMonth]} {vYear}</Text>
            <TouchableOpacity onPress={nextM} style={{ padding: 10 }}>
              <Text style={{ fontSize: 26, color: P, fontWeight: '700', lineHeight: 30 }}>{'\u203A'}</Text>
            </TouchableOpacity>
          </View>

          {/* Day headers */}
          <View style={{ flexDirection: 'row', marginBottom: 4 }}>
            {CAL_DAYS.map(d => (
              <View key={d} style={{ flex: 1, alignItems: 'center', paddingVertical: 4 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#6B7280' }}>{d}</Text>
              </View>
            ))}
          </View>

          {/* Calendar grid */}
          {weeks.map((week, wi) => (
            <View key={wi} style={{ flexDirection: 'row' }}>
              {week.map((ds, di) => {
                if (!ds) return <View key={'e' + di} style={{ flex: 1, aspectRatio: 1 }} />;
                const isSel = ds === selected;
                const isToday = ds === TODAY_STR;
                return (
                  <TouchableOpacity
                    key={ds}
                    style={{ flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: isSel ? P : 'transparent', borderRadius: 9 }}
                    onPress={() => handlePick(ds)}
                    activeOpacity={0.7}
                  >
                    <Text style={{ fontSize: 13, fontWeight: isSel || isToday ? '800' : '400', color: isSel ? '#fff' : isToday ? P : '#111827' }}>
                      {parseInt(ds.split('-')[2], 10)}
                    </Text>
                    {isToday && !isSel && (
                      <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: P, position: 'absolute', bottom: 3 }} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}

          {/* Quick selects */}
          <View style={{ marginTop: 18 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#6B7280', marginBottom: 8 }}>Quick Select</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={{ flex: 1, backgroundColor: '#F1F5F9', borderRadius: 8, paddingVertical: 8, alignItems: 'center' }} onPress={() => { setSelected(TODAY_STR); const d = new Date(); setVYear(d.getFullYear()); setVMonth(d.getMonth()); }}>
                <Text style={{ color: '#6B7280', fontWeight: '700', fontSize: 12 }}>Today</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Apply */}
          <TouchableOpacity
            style={{ backgroundColor: P, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 12 }}
            onPress={apply}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <MaterialIcons name="check" size={18} color="#fff" style={{ marginRight: 4 }} />
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Apply  {'\u00B7'}  {selected}</Text>
            </View>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

function DatePickerField({ value, onChange, placeholder }) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Pressable style={[s.inp, { flexDirection: 'row', alignItems: 'center' }]} onPress={() => setOpen(true)}>
        <MaterialIcons name="calendar-today" size={16} color={P} style={{ marginRight: 8 }} />
        <Text style={{ flex: 1, fontSize: 14, color: value ? '#111827' : '#9CA3AF' }}>{value || placeholder || 'Select date'}</Text>
        <MaterialIcons name="expand-more" size={18} color="#6B7280" />
      </Pressable>
      <DatePickerModal visible={open} onClose={() => setOpen(false)} value={value} onChange={onChange} />
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════════════
export default function OwnerFinance() {
  // ── state ─────────────────────────────────────────────────────────
  const [period, setPeriod] = useState(DEFAULT_PERIOD);
  const [showPicker, setShowPicker] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dialog, setDialog] = useState(null);

  // API data
  const [summary, setSummary] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [loans, setLoans] = useState([]);
  const [budgets, setBudgets] = useState({});
  const [taxHistory, setTaxHistory] = useState([]);
  const [manualInc, setManualInc] = useState([]);

  // sheets
  const [sheetExp, setSheetExp] = useState(false);
  const [sheetLoan, setSheetLoan] = useState(false);
  const [sheetPay, setSheetPay] = useState(false);
  const [sheetBgt, setSheetBgt] = useState(false);
  const [sheetInc, setSheetInc] = useState(false);
  const [sheetFab, setSheetFab] = useState(false);
  const [exporting, setExporting] = useState(false);

  // form fields
  const [editExp, setEditExp] = useState(null);
  const [fCat, setFCat] = useState('Ingredients');
  const [fAmt, setFAmt] = useState('');
  const [fDate, setFDate] = useState(TODAY_STR);
  const [fDesc, setFDesc] = useState('');
  const [fRec, setFRec] = useState(false);
  const [fFreq, setFFreq] = useState('Monthly');

  const [lName, setLName] = useState('');
  const [lTotal, setLTotal] = useState('');
  const [lPaid, setLPaid] = useState('0');
  const [lRate, setLRate] = useState('');
  const [lDue, setLDue] = useState('');
  const [lNotes, setLNotes] = useState('');

  const [pLoanId, setPLoanId] = useState(null);
  const [pAmt, setPAmt] = useState('');
  const [pDate, setPDate] = useState(TODAY_STR);
  const [pMethod, setPMethod] = useState('Cash');

  const [iAmt, setIAmt] = useState('');
  const [iCat, setICat] = useState('Sales');
  const [iDate, setIDate] = useState(TODAY_STR);
  const [iNote, setINote] = useState('');

  const [bgtEdits, setBgtEdits] = useState({});

  const [xRevRow, setXRevRow] = useState(false);
  const [xExpRow, setXExpRow] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);

  // ── fetch all data ────────────────────────────────────────────────
  const fetchAll = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    setError(null);
    try {
      const params = { start: period.from, end: period.to };
      const [sumRes, expRes, loanRes, bgtRes, taxRes] = await Promise.all([
        financeAPI.getSummary(params),
        financeAPI.getExpenses(params),
        financeAPI.getLoans(),
        financeAPI.getBudgets(),
        financeAPI.getTaxHistory(),
      ]);
      setSummary(sumRes.data);
      // Normalize expenses from API to match the shape used in render
      setExpenses((expRes.data || []).map(e => ({
        id: e.id,
        cat: e.category,
        desc: e.description || '',
        amt: parseFloat(e.amount),
        date: typeof e.date === 'string' ? e.date.split('T')[0] : e.date,
        rec: e.recurring || false,
        freq: e.frequency || undefined,
      })));
      // Normalize loans
      setLoans((loanRes.data || []).map(l => ({
        id: l.id,
        lender: l.lender_name,
        total: parseFloat(l.total_amount),
        paid: parseFloat(l.amount_paid),
        rate: parseFloat(l.interest_rate || 0),
        due: l.due_date ? (typeof l.due_date === 'string' ? l.due_date.split('T')[0] : l.due_date) : '',
        notes: l.notes || '',
        status: l.status,
        payments: (l.payments || []).map(p => ({
          d: typeof p.payment_date === 'string' ? p.payment_date.split('T')[0] : p.payment_date,
          a: parseFloat(p.amount),
          m: p.method || 'Cash',
        })),
      })));
      // Normalize budgets from array to object { category: amount }
      const bgtObj = {};
      (bgtRes.data || []).forEach(b => { bgtObj[b.category] = parseFloat(b.monthly_budget); });
      setBudgets(bgtObj);
      // Tax history
      setTaxHistory((taxRes.data || []).map(t => ({
        month: t.month_label,
        rev: t.revenue,
        tax: t.tax_collected,
      })));
    } catch (err) {
      console.warn('Finance fetch error:', err.message);
      setError('Could not load finance data. Pull to retry.');
    }
    setLoading(false);
  }, [period]);

  // Fetch on mount and when period changes
  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── derived calculations ──────────────────────────────────────────
  const f = useMemo(() => {
    // Use API summary when available
    const sm = summary || {};
    const cur = sm.current || {};
    const prev = sm.previous || {};
    const { from, to } = period;

    const totalRev = cur.total_revenue || 0;
    const totalExp = cur.total_expenses || 0;
    const net = cur.net_profit || (totalRev - totalExp);
    const margin = cur.profit_margin || (totalRev > 0 ? (net / totalRev * 100) : 0);
    const days = sm.period ? sm.period.days : 0;

    const prevRev = prev.total_revenue || 0;
    const prevExp = prev.total_expenses || 0;
    const prevNet = prev.net_profit || (prevRev - prevExp);
    const prevMargin = prev.profit_margin || (prevRev > 0 ? (prevNet / prevRev * 100) : 0);

    // Revenue breakdowns from summary
    const rPay = sm.revenue_by_payment || {};
    const revFood = 0; // Not broken down by food/drink/other in API — use total for now
    const revDrinks = 0;
    const revOther = 0;
    const byPay = {
      Cash: rPay.cash || 0,
      Card: rPay.card || 0,
      'QR/Online': rPay.qr || 0,
    };
    const rOrd = sm.revenue_by_order_type || {};
    const byOrd = {
      'Dine-In': rOrd.dine_in || 0,
      'To-Go': rOrd.takeaway || 0,
      Delivery: rOrd.delivery || 0,
    };
    const rTime = sm.revenue_by_time || {};
    const byTime = {
      'Morning (06-12)': rTime.morning || 0,
      'Afternoon (12-17)': rTime.afternoon || 0,
      'Evening (17-23)': rTime.evening || 0,
    };
    const apiDow = sm.revenue_by_dow || {};
    const byDow = {};
    SHORT_DAYS.forEach(d => { byDow[d] = { total: (apiDow[d] && apiDow[d].total) || 0, cnt: (apiDow[d] && (apiDow[d].count || apiDow[d].cnt)) || 0 }; });

    // expense by cat
    const expCat = {};
    CATS.forEach(c => { expCat[c] = 0; });
    const apiExpCat = sm.expense_by_category || [];
    apiExpCat.forEach(e => { if (expCat.hasOwnProperty(e.category)) expCat[e.category] = e.total; else expCat[e.category] = e.total; });
    // Also compute from local expenses for filtered list display
    const filtExp = expenses.filter(e => e.date >= from && e.date <= to);

    // cash flow from API
    const apiCF = sm.daily_cash_flow || [];
    const cfDays = apiCF.map(d => ({
      date: typeof d.date === 'string' ? d.date.split('T')[0] : d.date,
      ci: d.cash_in || 0,
      co: d.cash_out || 0,
      net: d.net || ((d.cash_in || 0) - (d.cash_out || 0)),
      bal: d.balance || 0,
    }));
    const totCI = cfDays.reduce((a,d)=>a+d.ci,0);
    const totCO = cfDays.reduce((a,d)=>a+d.co,0);
    let negDay = null;
    cfDays.forEach(d => { if (d.bal < 0 && !negDay) negDay = d.date; });

    // tax from API
    const taxData = sm.tax || {};
    const taxRate = taxData.rate || 0.12;
    const svcRate = taxData.service_charge_rate || 0.05;
    const taxCol = taxData.tax_collected || Math.round(totalRev * taxRate);
    const svcCol = taxData.service_charge || Math.round(totalRev * svcRate);
    const taxHist = taxHistory;

    // payroll from API
    const apiPayroll = sm.payroll || [];
    const payrollMap = {};
    apiPayroll.forEach(p => { payrollMap[p.role] = { n: p.staff_count, cost: p.total_cost }; });
    const totPay = apiPayroll.reduce((a,r) => a+r.total_cost, 0);
    const payPct = totalRev > 0 ? (totPay/totalRev*100).toFixed(1) : '0';

    // budget total
    const totBgt = Object.values(budgets).reduce((a,v) => a+v, 0);

    // insights
    const bestDow = SHORT_DAYS.reduce((b,d) => { const avg = byDow[d].cnt>0 ? byDow[d].total/byDow[d].cnt : 0; return avg>b.avg ? {day:d,avg} : b; }, {day:'',avg:0});
    const timeE = Object.entries(byTime);
    const bestTime = timeE.reduce((b,[k,v]) => v>b.v ? {k,v} : b, {k:'',v:0});
    const numDays = days || cfDays.length || 1;
    const avgDaily = numDays > 0 ? Math.round(totalRev / numDays) : 0;
    const avgOrd = numDays > 0 ? Math.round(totalRev / (numDays * 42)) : 0;
    const revChg = prevRev > 0 ? ((totalRev-prevRev)/prevRev*100).toFixed(1) : '0';
    const trend = Number(revChg) > 2 ? 'Growing' : Number(revChg) < -2 ? 'Declining' : 'Stable';
    const fixedCost = (budgets.Rent||0)+(budgets.Utilities||0)+(budgets.Salaries||0);
    const beD = avgDaily > 0 ? Math.ceil(fixedCost/avgDaily) : 99;
    const busiest = cfDays.reduce((b,d) => d.ci>b.total ? {total:d.ci,date:d.date} : b, {total:0,date:''});
    const payVals = Object.values(byPay);
    const topPayIdx = payVals.indexOf(Math.max(...payVals));
    const topPayName = Object.keys(byPay)[topPayIdx >= 0 ? topPayIdx : 0] || '';

    return {
      totalRev, totalExp, net, margin, days: numDays,
      prevRev, prevExp, prevNet, prevMargin,
      revFood, revDrinks, revOther,
      byPay, byOrd, byTime, byDow,
      expCat, filtExp,
      cfDays, totCI, totCO, netBal: totCI-totCO, negDay,
      taxCol, svcCol, taxHist, taxRate, svcRate,
      totPay, payPct, payrollMap, totBgt,
      bestDow, bestTime, avgDaily, avgOrd, revChg, trend, beD, busiest, topPayName,
    };
  }, [summary, period, expenses, budgets, taxHistory]);

  // ── handlers ──────────────────────────────────────────────────────
  const openExpForm = (e) => {
    if (e) { setEditExp(e); setFCat(e.cat); setFAmt(String(e.amt)); setFDate(e.date); setFDesc(e.desc); setFRec(e.rec); setFFreq(e.freq||'Monthly'); }
    else { setEditExp(null); setFCat('Ingredients'); setFAmt(''); setFDate(TODAY_STR); setFDesc(''); setFRec(false); setFFreq('Monthly'); }
    setSheetExp(true);
  };
  const saveExp = async () => {
    const a = Number(fAmt)||0; if (a<=0) return;
    try {
      const data = { category: fCat, amount: a, date: fDate, description: fDesc, recurring: fRec, frequency: fRec ? fFreq : null };
      if (editExp) await financeAPI.updateExpense(editExp.id, data);
      else await financeAPI.createExpense(data);
      setSheetExp(false);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      fetchAll(false);
    } catch (err) { setDialog({ title: 'Error', message: err.message, type: 'error' }); }
  };
  const delExp = async (id) => {
    try {
      await financeAPI.deleteExpense(id);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      fetchAll(false);
    } catch (err) { setDialog({ title: 'Error', message: err.message, type: 'error' }); }
  };

  const openLoanForm = () => { setLName(''); setLTotal(''); setLPaid('0'); setLRate(''); setLDue(''); setLNotes(''); setSheetLoan(true); };
  const saveLoan = async () => {
    const t = Number(lTotal)||0; if (t<=0||!lName) return;
    try {
      await financeAPI.createLoan({
        lender_name: lName, total_amount: t, amount_paid: Number(lPaid)||0,
        interest_rate: Number(lRate)||0, due_date: lDue || null, notes: lNotes || null,
      });
      setSheetLoan(false);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      fetchAll(false);
    } catch (err) { setDialog({ title: 'Error', message: err.message, type: 'error' }); }
  };

  const openPayForm = (lid) => { setPLoanId(lid); setPAmt(''); setPDate(TODAY_STR); setPMethod('Cash'); setSheetPay(true); };
  const savePay = async () => {
    const a = Number(pAmt)||0; if (a<=0||!pLoanId) return;
    try {
      await financeAPI.recordLoanPayment(pLoanId, { amount: a, payment_date: pDate, method: pMethod });
      setSheetPay(false);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      fetchAll(false);
    } catch (err) { setDialog({ title: 'Error', message: err.message, type: 'error' }); }
  };

  const delLoan = async (id) => {
    try {
      await financeAPI.deleteLoan(id);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setConfirmDel(null);
      fetchAll(false);
    } catch (err) { setDialog({ title: 'Error', message: err.message, type: 'error' }); }
  };

  const openBgtForm = () => { setBgtEdits({...budgets}); setSheetBgt(true); };
  const saveBgt = async () => {
    const o={}; CATS.forEach(c=>{o[c]=Number(bgtEdits[c])||0;});
    try {
      await financeAPI.upsertBudgets({ budgets: o });
      setSheetBgt(false);
      fetchAll(false);
    } catch (err) { setDialog({ title: 'Error', message: err.message, type: 'error' }); }
  };

  const openIncForm = () => { setIAmt(''); setICat('Sales'); setIDate(TODAY_STR); setINote(''); setSheetInc(true); };
  const saveInc = async () => {
    const a = Number(iAmt)||0; if (a<=0) return;
    try {
      await financeAPI.createManualIncome({ amount: a, category: iCat, date: iDate, note: iNote || null });
      setSheetInc(false);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      fetchAll(false);
    } catch (err) { setDialog({ title: 'Error', message: err.message, type: 'error' }); }
  };

  const onRefresh = useCallback(() => { fetchAll(); }, [fetchAll]);

  // ── Export helpers (Share API — zero native deps) ───────────────────
  const SEP = '\u2500'.repeat(36);

  const exportCashFlowPdf = async () => {
    setExporting(true);
    try {
      let txt = `CASH FLOW REPORT\n${period.from}  \u2192  ${period.to}\n${SEP}\n`;
      txt += `Total Cash In:   ${money(f.totCI)}\n`;
      txt += `Total Cash Out:  ${money(f.totCO)}\n`;
      txt += `Net Balance:     ${money(f.netBal)}\n`;
      if (f.negDay) txt += `\n\u26A0 Cash flow went negative on ${f.negDay}\n`;
      txt += `\n${SEP}\nDAILY BREAKDOWN\n${SEP}\n`;
      f.cfDays.forEach(d => {
        txt += `${d.date}   In: +${money(d.ci)}   Out: \u2212${money(d.co)}   Bal: ${money(d.bal)}\n`;
      });
      await Share.share({ title: 'Cash Flow Report', message: txt });
    } catch (_) {}
    setExporting(false);
  };

  const exportTaxPdf = async () => {
    setExporting(true);
    try {
      let txt = `TAX REPORT\n${period.from}  \u2192  ${period.to}\n${SEP}\n`;
      txt += `Revenue:          ${money(f.totalRev)}\n`;
      txt += `Tax Rate:         ${(f.taxRate*100)}%\n`;
      txt += `Tax Collected:    ${money(f.taxCol)}\n`;
      txt += `Service Charge:   ${money(f.svcCol)}\n`;
      txt += `Est. Tax Payable: ${money(f.taxCol)}\n`;
      txt += `\n${SEP}\nMONTHLY TAX HISTORY\n${SEP}\n`;
      f.taxHist.forEach(h => {
        txt += `${h.month}   Revenue: ${money(h.rev)}   Tax: ${money(h.tax)}\n`;
      });
      await Share.share({ title: 'Tax Report', message: txt });
    } catch (_) {}
    setExporting(false);
  };

  const exportFullPdf = async () => {
    setExporting(true);
    try {
      const loanPayTotal = loans.reduce((a,l)=>a+l.payments.filter(p=>p.d>=period.from&&p.d<=period.to).reduce((pa,p)=>pa+p.a,0),0);
      let txt = `FINANCIAL REPORT\n${period.from}  \u2192  ${period.to}\n${'═'.repeat(36)}\n`;

      txt += `\n\u25B6 PROFIT & LOSS\n${SEP}\n`;
      txt += `Revenue:       ${money(f.totalRev)}\n`;
      txt += `Expenses:      ${money(f.totalExp)}\n`;
      txt += `Net Profit:    ${money(f.net)}\n`;
      txt += `Profit Margin: ${f.margin.toFixed(1)}%\n`;

      txt += `\n\u25B6 TAX & CHARGES\n${SEP}\n`;
      txt += `Tax Collected (${(f.taxRate*100)}%):    ${money(f.taxCol)}\n`;
      txt += `Service Charge (${(f.svcRate*100)}%):   ${money(f.svcCol)}\n`;

      txt += `\n\u25B6 PAYROLL\n${SEP}\n`;
      Object.entries(f.payrollMap).forEach(([role,d]) => {
        txt += `${role} (${d.n} staff):  ${money(d.cost)}\n`;
      });
      txt += `${SEP}\nTotal Payroll: ${money(f.totPay)}\n`;

      txt += `\n\u25B6 EXPENSE DETAILS\n${SEP}\n`;
      f.filtExp.forEach(e => {
        txt += `${e.date}  ${e.cat}  ${e.desc}  ${money(e.amt)}\n`;
      });
      txt += `${SEP}\nTotal Expenses: ${money(f.totalExp)}\n`;

      txt += `\n\u25B6 LOANS & DEBT\n${SEP}\n`;
      loans.forEach(l => {
        txt += `${l.lender}  Total: ${money(l.total)}  Paid: ${money(l.paid)}  Remaining: ${money(l.total-l.paid)}  Due: ${l.due||'N/A'}\n`;
      });
      txt += `Loan payments this period: ${money(loanPayTotal)}\n`;

      txt += `\n\u25B6 DAILY CASH FLOW\n${SEP}\n`;
      f.cfDays.forEach(d => {
        txt += `${d.date}   In: +${money(d.ci)}   Out: \u2212${money(d.co)}   Bal: ${money(d.bal)}\n`;
      });

      await Share.share({ title: 'Financial Report', message: txt });
    } catch (_) {}
    setExporting(false);
  };

  // ═══════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════

  // Loading skeleton
  if (loading && !summary) {
    return (
      <View style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
        <OwnerPageHeader icon="account-balance" title="Finance" subtitle="Accounting & Insights" />
        <OwnerPeriodBar period={period} onOpen={() => setShowPicker(true)} />
        <OwnerCalendarPicker visible={showPicker} onClose={() => setShowPicker(false)} period={period} onChange={setPeriod} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={P} />
          <Text style={{ marginTop: 12, fontSize: 14, color: '#6B7280' }}>Loading finance data...</Text>
        </View>
      </View>
    );
  }

  // Error state with retry
  if (error && !summary) {
    return (
      <View style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
        <OwnerPageHeader icon="account-balance" title="Finance" subtitle="Accounting & Insights" />
        <OwnerPeriodBar period={period} onOpen={() => setShowPicker(true)} />
        <OwnerCalendarPicker visible={showPicker} onClose={() => setShowPicker(false)} period={period} onChange={setPeriod} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <MaterialIcons name="cloud-off" size={48} color="#D1D5DB" />
          <Text style={{ marginTop: 12, fontSize: 14, color: '#6B7280', textAlign: 'center' }}>{error}</Text>
          <Pressable style={{ marginTop: 16, backgroundColor: P, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12 }} onPress={onRefresh}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Retry</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
      {/* HEADER */}
      <OwnerPageHeader icon="account-balance" title="Finance" subtitle="Accounting & Insights"
        right={<Pressable onPress={onRefresh} style={{padding:4}}><MaterialIcons name="refresh" size={22} color="rgba(255,255,255,0.85)" /></Pressable>}
      />
      <OwnerPeriodBar period={period} onOpen={() => setShowPicker(true)} />
      <OwnerCalendarPicker visible={showPicker} onClose={() => setShowPicker(false)} period={period} onChange={setPeriod} />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>

        {/* Inline error banner (when data exists but refresh failed) */}
        {error && summary && (
          <Pressable style={[s.warn, { marginBottom: 12 }]} onPress={onRefresh}>
            <MaterialIcons name="warning" size={16} color="#D97706" />
            <Text style={s.warnTx}>{error} Tap to retry.</Text>
          </Pressable>
        )}

        {/* ─── SECTION 1: PROFIT & LOSS ─────────────────────────────── */}
        <Sec title="Profit & Loss" icon="trending-up" open>
          {/* 2×2 grid — two explicit rows with flex:1 children */}
          <View style={{ gap: 10 }}>
            {/* Row 1 */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {/* Revenue */}
              <View style={[s.mCard, { borderTopColor: GN }]}>
                <View style={[s.mCardIcWrap, { backgroundColor: '#ECFDF5' }]}>
                  <MaterialIcons name="trending-up" size={20} color={GN} />
                </View>
                <Text style={s.mCardLbl}>Revenue</Text>
                <Text style={[s.mCardVal, { color: GN }]}>{money(f.totalRev)}</Text>
              </View>
              {/* Expenses */}
              <View style={[s.mCard, { borderTopColor: RD }]}>
                <View style={[s.mCardIcWrap, { backgroundColor: '#FEF2F2' }]}>
                  <MaterialIcons name="trending-down" size={20} color={RD} />
                </View>
                <Text style={s.mCardLbl}>Expenses</Text>
                <Text style={[s.mCardVal, { color: RD }]}>{money(f.totalExp)}</Text>
              </View>
            </View>
            {/* Row 2 */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {/* Net Profit */}
              <View style={[s.mCard, { borderTopColor: f.net >= 0 ? GN : RD }]}>
                <View style={[s.mCardIcWrap, { backgroundColor: f.net >= 0 ? '#ECFDF5' : '#FEF2F2' }]}>
                  <MaterialIcons name={f.net >= 0 ? 'trending-up' : 'trending-down'} size={20} color={f.net >= 0 ? GN : RD} />
                </View>
                <Text style={s.mCardLbl}>Net Profit</Text>
                <Text style={[s.mCardVal, { color: f.net >= 0 ? GN : RD }]}>{money(f.net)}</Text>
              </View>
              {/* Margin */}
              <View style={[s.mCard, { borderTopColor: P }]}>
                <View style={[s.mCardIcWrap, { backgroundColor: PL }]}>
                  <MaterialIcons name="percent" size={20} color={P} />
                </View>
                <Text style={s.mCardLbl}>Profit Margin</Text>
                <Text style={[s.mCardVal, { color: f.margin >= 0 ? P : RD }]}>{f.margin.toFixed(1)}%</Text>
              </View>
            </View>
          </View>

          {/* Comparison table */}
          <View style={{flexDirection:'row',alignItems:'center',marginTop:16,marginBottom:8}}>
            <MaterialIcons name="compare-arrows" size={16} color="#6B7280" style={{marginRight:6}} />
            <Text style={s.subH}>This Period vs Last Period</Text>
          </View>
          <View style={s.tbl}>
            <View style={s.tblHdr}>
              <Text style={[s.tblC,{flex:2,fontWeight:'700'}]}>Metric</Text>
              <Text style={[s.tblC,{fontWeight:'700'}]}>Current</Text>
              <Text style={[s.tblC,{fontWeight:'700'}]}>Previous</Text>
              <Text style={[s.tblC,{fontWeight:'700'}]}>Change</Text>
            </View>
            {/* Revenue row */}
            <Pressable onPress={()=>{LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);setXRevRow(r=>!r);}}>
              <View style={s.tblRow}>
                <View style={{flex:2,flexDirection:'row',alignItems:'center'}}>
                  <MaterialIcons name="trending-up" size={14} color={GN} style={{marginRight:4}} />
                  <Text style={s.tblC}>Revenue</Text>
                  <MaterialIcons name={xRevRow?'expand-less':'expand-more'} size={14} color={P} />
                </View>
                <Text style={s.tblC}>{money(f.totalRev)}</Text>
                <Text style={s.tblC}>{money(f.prevRev)}</Text>
                <Text style={[s.tblC,{color:f.totalRev>=f.prevRev?GN:RD}]}>{pctStr(f.totalRev,f.prevRev)}</Text>
              </View>
            </Pressable>
            {xRevRow && (
              <View style={{paddingLeft:16,paddingVertical:8,backgroundColor:'#FAFAFA'}}>
                {[{l:'Cash',v:f.byPay.Cash,ic:'payments'},{l:'Card',v:f.byPay.Card,ic:'credit-card'},{l:'QR/Online',v:f.byPay['QR/Online'],ic:'qr-code-2'}].map(r=>(
                  <View key={r.l} style={{marginBottom:8}}>
                    <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:3}}>
                      <View style={{flexDirection:'row',alignItems:'center'}}><MaterialIcons name={r.ic} size={13} color="#6B7280" style={{marginRight:4}} /><Text style={{fontSize:12,color:'#6B7280'}}>{r.l}</Text></View>
                      <Text style={{fontSize:12,fontWeight:'600',color:'#111827'}}>{money(r.v)} ({f.totalRev>0?((r.v/f.totalRev)*100).toFixed(0):0}%)</Text>
                    </View>
                    <Bar pct={f.totalRev>0?(r.v/f.totalRev)*100:0} color={GN} />
                  </View>
                ))}
              </View>
            )}
            {/* Expenses row */}
            <Pressable onPress={()=>{LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);setXExpRow(r=>!r);}}>
              <View style={s.tblRow}>
                <View style={{flex:2,flexDirection:'row',alignItems:'center'}}>
                  <MaterialIcons name="trending-down" size={14} color={RD} style={{marginRight:4}} />
                  <Text style={s.tblC}>Expenses</Text>
                  <MaterialIcons name={xExpRow?'expand-less':'expand-more'} size={14} color={P} />
                </View>
                <Text style={s.tblC}>{money(f.totalExp)}</Text>
                <Text style={s.tblC}>{money(f.prevExp)}</Text>
                <Text style={[s.tblC,{color:f.totalExp<=f.prevExp?GN:RD}]}>{pctStr(f.totalExp,f.prevExp)}</Text>
              </View>
            </Pressable>
            {xExpRow && (
              <View style={{paddingLeft:16,paddingVertical:8,backgroundColor:'#FAFAFA'}}>
                {CATS.filter(c=>f.expCat[c]>0).map(c=>(
                  <View key={c} style={{marginBottom:8}}>
                    <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:3}}>
                      <View style={{flexDirection:'row',alignItems:'center'}}><MaterialIcons name={CAT_IC[c]} size={13} color="#6B7280" style={{marginRight:4}} /><Text style={{fontSize:12,color:'#6B7280'}}>{c}</Text></View>
                      <Text style={{fontSize:12,fontWeight:'600',color:'#111827'}}>{money(f.expCat[c])} ({f.totalExp>0?((f.expCat[c]/f.totalExp)*100).toFixed(0):0}%)</Text>
                    </View>
                    <Bar pct={f.totalExp>0?(f.expCat[c]/f.totalExp)*100:0} color={RD} />
                  </View>
                ))}
              </View>
            )}
            {/* Net Profit */}
            <View style={s.tblRow}>
              <View style={{flex:2,flexDirection:'row',alignItems:'center'}}><MaterialIcons name="account-balance-wallet" size={14} color={P} style={{marginRight:4}} /><Text style={[s.tblC,{fontWeight:'600'}]}>Net Profit</Text></View>
              <Text style={[s.tblC,{color:f.net>=0?GN:RD}]}>{money(f.net)}</Text>
              <Text style={[s.tblC,{color:f.prevNet>=0?GN:RD}]}>{money(f.prevNet)}</Text>
              <Text style={[s.tblC,{color:f.net>=f.prevNet?GN:RD}]}>{pctStr(f.net,f.prevNet)}</Text>
            </View>
            {/* Margin */}
            <View style={s.tblRow}>
              <View style={{flex:2,flexDirection:'row',alignItems:'center'}}><MaterialIcons name="percent" size={14} color={P} style={{marginRight:4}} /><Text style={[s.tblC,{fontWeight:'600'}]}>Margin</Text></View>
              <Text style={s.tblC}>{f.margin.toFixed(1)}%</Text>
              <Text style={s.tblC}>{f.prevMargin.toFixed(1)}%</Text>
              <Text style={[s.tblC,{color:f.margin>=f.prevMargin?GN:RD}]}>{(f.margin-f.prevMargin).toFixed(1)}pp</Text>
            </View>
          </View>
        </Sec>

        {/* ─── SECTION 2: REVENUE BREAKDOWN ─────────────────────────── */}
        <Sec title="Revenue Breakdown" icon="bar-chart">
          {/* By payment */}
          <View style={{flexDirection:'row',alignItems:'center',marginBottom:8}}><MaterialIcons name="payment" size={15} color="#6B7280" style={{marginRight:5}} /><Text style={s.subH}>By Payment Method</Text></View>
          {[{k:'Cash',ic:'payments',c:GN},{k:'Card',ic:'credit-card',c:BL},{k:'QR/Online',ic:'qr-code-2',c:P}].map(({k,ic,c})=>(
            <View key={k} style={{marginBottom:10}}>
              <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:4}}>
                <View style={{flexDirection:'row',alignItems:'center'}}><MaterialIcons name={ic} size={15} color={c} style={{marginRight:6}} /><Text style={{fontSize:13,color:'#374151'}}>{k}</Text></View>
                <Text style={{fontSize:13,fontWeight:'600',color:'#111827'}}>{money(f.byPay[k])} ({f.totalRev>0?((f.byPay[k]/f.totalRev)*100).toFixed(0):0}%)</Text>
              </View>
              <Bar pct={f.totalRev>0?(f.byPay[k]/f.totalRev)*100:0} color={c} />
            </View>
          ))}

          {/* By order type */}
          <View style={{flexDirection:'row',alignItems:'center',marginTop:16,marginBottom:8}}><MaterialIcons name="restaurant-menu" size={15} color="#6B7280" style={{marginRight:5}} /><Text style={s.subH}>By Order Type</Text></View>
          {[{k:'Dine-In',ic:'restaurant',c:AM},{k:'To-Go',ic:'shopping-bag',c:CY},{k:'Delivery',ic:'delivery-dining',c:PK}].map(({k,ic,c})=>(
            <View key={k} style={{marginBottom:10}}>
              <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:4}}>
                <View style={{flexDirection:'row',alignItems:'center'}}><MaterialIcons name={ic} size={15} color={c} style={{marginRight:6}} /><Text style={{fontSize:13,color:'#374151'}}>{k}</Text></View>
                <Text style={{fontSize:13,fontWeight:'600',color:'#111827'}}>{money(f.byOrd[k])} ({f.totalRev>0?((f.byOrd[k]/f.totalRev)*100).toFixed(0):0}%)</Text>
              </View>
              <Bar pct={f.totalRev>0?(f.byOrd[k]/f.totalRev)*100:0} color={c} />
            </View>
          ))}

          {/* By time of day */}
          <View style={{flexDirection:'row',alignItems:'center',marginTop:16,marginBottom:8}}><MaterialIcons name="schedule" size={15} color="#6B7280" style={{marginRight:5}} /><Text style={s.subH}>By Time of Day</Text></View>
          <View style={{flexDirection:'row',alignItems:'flex-end',height:130,gap:12,marginTop:4}}>
            {Object.entries(f.byTime).map(([k,v])=>{
              const mx = Math.max(...Object.values(f.byTime));
              const pct = mx>0?(v/mx)*100:0;
              return (
                <View key={k} style={{flex:1,alignItems:'center'}}>
                  <Text style={{fontSize:9,fontWeight:'600',color:'#111827',marginBottom:4}}>{money(v)}</Text>
                  <View style={{width:'100%',height:`${pct}%`,backgroundColor:P,borderRadius:6,minHeight:4}} />
                  <Text style={{fontSize:9,color:'#6B7280',marginTop:4,textAlign:'center'}}>{k.split(' ')[0]}</Text>
                </View>
              );
            })}
          </View>

          {/* By day of week */}
          <View style={{flexDirection:'row',alignItems:'center',marginTop:20,marginBottom:8}}><MaterialIcons name="calendar-today" size={15} color="#6B7280" style={{marginRight:5}} /><Text style={s.subH}>By Day of Week</Text></View>
          <View style={{flexDirection:'row',alignItems:'flex-end',height:130,gap:4,marginTop:4}}>
            {SHORT_DAYS.map(d=>{
              const data = f.byDow[d];
              const mx = Math.max(...SHORT_DAYS.map(dd=>f.byDow[dd].total));
              const pct = mx>0?(data.total/mx)*100:0;
              const best = f.bestDow.day===d;
              return (
                <View key={d} style={{flex:1,alignItems:'center'}}>
                  {best && <View style={{backgroundColor:'#FEF3C7',borderRadius:4,paddingHorizontal:3,paddingVertical:1,marginBottom:2}}><MaterialIcons name="star" size={10} color="#D97706" /></View>}
                  <Text style={{fontSize:7,fontWeight:'600',color:'#111827',marginBottom:2}}>{data.total>0?(data.total/1000000).toFixed(1)+'M':'0'}</Text>
                  <View style={{width:'80%',height:`${pct}%`,backgroundColor:best?AM:P,borderRadius:4,minHeight:4}} />
                  <Text style={{fontSize:10,color:'#6B7280',marginTop:4,fontWeight:best?'700':'400'}}>{d}</Text>
                </View>
              );
            })}
          </View>
        </Sec>

        {/* ─── SECTION 3: CASH FLOW ─────────────────────────────────── */}
        <Sec title="Cash Flow" icon="swap-horiz">
          {/* Summary cards */}
          <View style={{flexDirection:'row',gap:8,marginBottom:12}}>
            <View style={[s.cfCard,{borderLeftColor:GN}]}><View style={{flexDirection:'row',alignItems:'center',marginBottom:4}}><MaterialIcons name="south-west" size={14} color={GN} style={{marginRight:4}} /><Text style={s.cfLbl}>Cash In</Text></View><Text style={[s.cfVal,{color:GN}]}>{money(f.totCI)}</Text></View>
            <View style={[s.cfCard,{borderLeftColor:RD}]}><View style={{flexDirection:'row',alignItems:'center',marginBottom:4}}><MaterialIcons name="north-east" size={14} color={RD} style={{marginRight:4}} /><Text style={s.cfLbl}>Cash Out</Text></View><Text style={[s.cfVal,{color:RD}]}>{money(f.totCO)}</Text></View>
            <View style={[s.cfCard,{borderLeftColor:P}]}><View style={{flexDirection:'row',alignItems:'center',marginBottom:4}}><MaterialIcons name="balance" size={14} color={P} style={{marginRight:4}} /><Text style={s.cfLbl}>Net Balance</Text></View><Text style={[s.cfVal,{color:f.netBal>=0?P:RD}]}>{money(f.netBal)}</Text></View>
          </View>

          {f.negDay && <View style={s.warn}><MaterialIcons name="warning" size={16} color="#D97706" /><Text style={s.warnTx}>Cash flow warning on {f.negDay}</Text></View>}

          <Pressable style={[s.addBtn,{marginTop:12}]} onPress={exportCashFlowPdf} disabled={exporting}>
            <MaterialIcons name="share" size={18} color={P} /><Text style={s.addBtnTx}>{exporting ? 'Preparing…' : 'Share Cash Flow Report'}</Text>
          </Pressable>
        </Sec>

        {/* ─── SECTION 4: EXPENSE MANAGER ───────────────────────────── */}
        <Sec title="Expense Manager" icon="receipt-long">
          <Pressable style={s.addBtn} onPress={()=>openExpForm(null)}>
            <MaterialIcons name="add" size={18} color={P} /><Text style={s.addBtnTx}>Add Expense</Text>
          </Pressable>

          {f.filtExp.map(e=>(
            <Pressable key={e.id} style={s.expRow} onPress={()=>openExpForm(e)}>
              <View style={s.expIc}><MaterialIcons name={CAT_IC[e.cat]||'more-horiz'} size={16} color={P} /></View>
              <View style={{flex:1}}>
                <Text style={{fontSize:13,fontWeight:'600',color:'#111827'}}>{e.desc}</Text>
                <View style={{flexDirection:'row',alignItems:'center',gap:6,marginTop:2}}>
                  <MaterialIcons name="event" size={11} color="#9CA3AF" /><Text style={{fontSize:11,color:'#6B7280'}}>{e.date}</Text>
                  {e.rec && <View style={s.badge}><MaterialIcons name="repeat" size={9} color={BL} style={{marginRight:2}} /><Text style={s.badgeTx}>Recurring</Text></View>}
                </View>
              </View>
              <Text style={{fontSize:13,fontWeight:'700',color:RD}}>{money(e.amt)}</Text>
              <Pressable onPress={()=>delExp(e.id)} style={{padding:8,marginLeft:4}} hitSlop={8}><MaterialIcons name="delete-outline" size={18} color="#D1D5DB" /></Pressable>
            </Pressable>
          ))}

          {/* Category breakdown */}
          <View style={{flexDirection:'row',alignItems:'center',marginTop:16,marginBottom:8}}><MaterialIcons name="donut-small" size={15} color="#6B7280" style={{marginRight:5}} /><Text style={s.subH}>Category Breakdown</Text></View>
          {CATS.filter(c=>f.expCat[c]>0).map(c=>(
            <View key={c} style={{marginBottom:10}}>
              <View style={{flexDirection:'row',alignItems:'center',marginBottom:4}}>
                <MaterialIcons name={CAT_IC[c]} size={14} color={P} style={{marginRight:6}} />
                <Text style={{fontSize:13,color:'#374151',flex:1}}>{c}</Text>
                <Text style={{fontSize:12,fontWeight:'600',color:'#111827'}}>{money(f.expCat[c])} ({f.totalExp>0?((f.expCat[c]/f.totalExp)*100).toFixed(0):0}%)</Text>
              </View>
              <Bar pct={f.totalExp>0?(f.expCat[c]/f.totalExp)*100:0} color={RD} />
            </View>
          ))}
          <View style={s.totRow}>
            <View style={{flexDirection:'row',alignItems:'center'}}><MaterialIcons name="functions" size={16} color="#374151" style={{marginRight:4}} /><Text style={s.totLbl}>Total Expenses</Text></View>
            <Text style={[s.totVal,{color:RD}]}>{money(f.totalExp)}</Text>
          </View>
        </Sec>

        {/* ─── SECTION 5: BUDGET VS ACTUAL ──────────────────────────── */}
        <Sec title="Budget vs Actual" icon="track-changes">
          <Pressable style={s.addBtn} onPress={openBgtForm}>
            <MaterialIcons name="settings" size={18} color={P} /><Text style={s.addBtnTx}>Set Budget</Text>
          </Pressable>

          {/* Summary */}
          <View style={{flexDirection:'row',justifyContent:'space-between',marginBottom:12}}>
            <View><View style={{flexDirection:'row',alignItems:'center'}}><MaterialIcons name="flag" size={13} color="#6B7280" style={{marginRight:3}} /><Text style={{fontSize:11,color:'#6B7280'}}>Total Budget</Text></View><Text style={{fontSize:16,fontWeight:'700',color:'#111827'}}>{money(f.totBgt)}</Text></View>
            <View style={{alignItems:'flex-end'}}><View style={{flexDirection:'row',alignItems:'center'}}><MaterialIcons name="payments" size={13} color="#6B7280" style={{marginRight:3}} /><Text style={{fontSize:11,color:'#6B7280'}}>Actual Spent</Text></View><Text style={{fontSize:16,fontWeight:'700',color:f.totalExp>f.totBgt?RD:'#111827'}}>{money(f.totalExp)}</Text></View>
          </View>

          {CATS.map(c=>{
            const b=budgets[c]||0; const a=f.expCat[c]||0; const rem=b-a;
            const pct=b>0?(a/b)*100:0;
            const clr = pct>=100?RD:pct>=75?AM:GN;
            return (
              <View key={c} style={{marginBottom:12}}>
                <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:2}}>
                  <View style={{flexDirection:'row',alignItems:'center'}}>
                    <MaterialIcons name={CAT_IC[c]} size={14} color={P} style={{marginRight:5}} />
                    <Text style={{fontSize:13,color:'#374151'}}>{c}</Text>
                    {pct>=100 && <View style={[s.badge,{backgroundColor:'#FEE2E2',marginLeft:6}]}><MaterialIcons name="error" size={9} color="#DC2626" style={{marginRight:2}} /><Text style={[s.badgeTx,{color:'#DC2626'}]}>Over Budget</Text></View>}
                  </View>
                  <Text style={{fontSize:12,color:'#6B7280'}}>{money(a)} / {money(b)}</Text>
                </View>
                <Bar pct={Math.min(pct,100)} color={clr} />
                <Text style={{fontSize:10,color:rem>=0?'#6B7280':RD,marginTop:2}}>{rem>=0?money(rem)+' remaining':money(Math.abs(rem))+' over budget'}</Text>
              </View>
            );
          })}

          {/* Alerts */}
          {(()=>{
            const alerted = CATS.filter(c=>{ const b=budgets[c]||0; return b>0&&((f.expCat[c]||0)/b*100)>=80; });
            if (!alerted.length) return null;
            return (
              <View style={[s.warn,{marginTop:8}]}>
                <MaterialIcons name="warning" size={16} color="#D97706" />
                <View style={{flex:1,marginLeft:8}}>
                  <Text style={{fontSize:12,fontWeight:'600',color:'#92400E'}}>Budget Alerts</Text>
                  {alerted.map(c=>{const pct=budgets[c]>0?((f.expCat[c]||0)/budgets[c]*100):0; return <Text key={c} style={{fontSize:11,color:'#92400E',marginTop:2}}><MaterialIcons name="warning" size={10} color="#D97706" /> {c}: {pct.toFixed(0)}% used</Text>;})}
                </View>
              </View>
            );
          })()}
        </Sec>

        {/* ─── SECTION 6: TAX SUMMARY ───────────────────────────────── */}
        <Sec title="Tax Summary" icon="description">
          <View style={{gap:6}}>
            <View style={s.taxR}><View style={{flexDirection:'row',alignItems:'center'}}><MaterialIcons name="percent" size={14} color="#6B7280" style={{marginRight:5}} /><Text style={s.taxL}>Tax Rate</Text></View><Text style={s.taxV}>{(f.taxRate*100).toFixed(0)}%</Text></View>
            <View style={s.taxR}><View style={{flexDirection:'row',alignItems:'center'}}><MaterialIcons name="trending-up" size={14} color="#6B7280" style={{marginRight:5}} /><Text style={s.taxL}>Total Revenue</Text></View><Text style={s.taxV}>{money(f.totalRev)}</Text></View>
            <View style={s.taxR}><View style={{flexDirection:'row',alignItems:'center'}}><MaterialIcons name="receipt" size={14} color="#6B7280" style={{marginRight:5}} /><Text style={s.taxL}>Tax Collected</Text></View><Text style={[s.taxV,{color:RD}]}>{money(f.taxCol)}</Text></View>
            <View style={s.taxR}><View style={{flexDirection:'row',alignItems:'center'}}><MaterialIcons name="room-service" size={14} color="#6B7280" style={{marginRight:5}} /><Text style={s.taxL}>Service Charge ({(f.svcRate*100).toFixed(0)}%)</Text></View><Text style={s.taxV}>{money(f.svcCol)}</Text></View>
            <View style={[s.taxR,{borderTopWidth:1,borderTopColor:'#E5E7EB',paddingTop:8}]}>
              <View style={{flexDirection:'row',alignItems:'center'}}><MaterialIcons name="account-balance" size={14} color={RD} style={{marginRight:5}} /><Text style={[s.taxL,{fontWeight:'700'}]}>Est. Tax Payable</Text></View>
              <Text style={[s.taxV,{fontWeight:'800',color:RD}]}>{money(f.taxCol)}</Text>
            </View>
          </View>

          <View style={{flexDirection:'row',alignItems:'center',marginTop:16,marginBottom:8}}><MaterialIcons name="history" size={15} color="#6B7280" style={{marginRight:5}} /><Text style={s.subH}>Monthly Tax History</Text></View>
          {f.taxHist.map(h=>(
            <View key={h.month} style={s.taxR}>
              <View style={{flexDirection:'row',alignItems:'center'}}><MaterialIcons name="calendar-today" size={12} color="#9CA3AF" style={{marginRight:5}} /><Text style={{fontSize:13,color:'#374151'}}>{h.month}</Text></View>
              <View style={{alignItems:'flex-end'}}><Text style={{fontSize:11,color:'#6B7280'}}>{money(h.rev)} rev</Text><Text style={{fontSize:12,fontWeight:'600',color:'#111827'}}>{money(h.tax)} tax</Text></View>
            </View>
          ))}

          <Pressable style={[s.addBtn,{marginTop:12}]} onPress={exportTaxPdf} disabled={exporting}>
            <MaterialIcons name="share" size={18} color={P} /><Text style={s.addBtnTx}>{exporting ? 'Preparing…' : 'Share Tax Report'}</Text>
          </Pressable>
        </Sec>

        {/* ─── SECTION 7: LOANS & DEBT ──────────────────────────────── */}
        <Sec title="Loans & Debt" icon="account-balance">
          {(()=>{
            const totOut = loans.reduce((a,l) => a+(l.total-l.paid), 0);
            const hasOD = loans.some(l=>l.due&&new Date(l.due+'T00:00:00')<new Date()&&l.paid<l.total);
            return (
              <View style={{marginBottom:12}}>
                <View style={{flexDirection:'row',alignItems:'center'}}><MaterialIcons name="account-balance" size={16} color={hasOD?RD:'#6B7280'} style={{marginRight:5}} /><Text style={{fontSize:12,color:'#6B7280'}}>Total Outstanding</Text></View>
                <Text style={{fontSize:24,fontWeight:'800',color:hasOD?RD:'#111827'}}>{money(totOut)}</Text>
              </View>
            );
          })()}

          <Pressable style={s.addBtn} onPress={openLoanForm}>
            <MaterialIcons name="add" size={18} color={P} /><Text style={s.addBtnTx}>Add Loan</Text>
          </Pressable>

          {loans.map(l=>{
            const rem=l.total-l.paid; const pct=l.total>0?(l.paid/l.total)*100:0;
            const isOD=l.due&&new Date(l.due+'T00:00:00')<new Date()&&rem>0;
            const soon=!isOD&&l.due&&(new Date(l.due+'T00:00:00')-new Date())<7*86400000&&rem>0;
            const paid=rem<=0;
            const st2=paid?'Paid':isOD?'Overdue':'Active';
            const stC=paid?GN:isOD?RD:BL;
            const stBg=paid?'#F0FDF4':isOD?'#FEF2F2':'#EFF6FF';
            return (
              <View key={l.id} style={[s.loanCard,isOD&&{borderLeftWidth:3,borderLeftColor:RD}]}>
                <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                  <View style={{flexDirection:'row',alignItems:'center',flex:1}}><MaterialIcons name="person" size={16} color="#374151" style={{marginRight:5}} /><Text style={{fontSize:15,fontWeight:'700',color:'#111827'}}>{l.lender}</Text></View>
                  <View style={{backgroundColor:stBg,paddingHorizontal:8,paddingVertical:3,borderRadius:6,flexDirection:'row',alignItems:'center'}}>
                    <MaterialIcons name={paid?'check-circle':isOD?'error':'schedule'} size={11} color={stC} style={{marginRight:3}} />
                    <Text style={{fontSize:11,fontWeight:'700',color:stC}}>{st2}</Text>
                  </View>
                </View>
                <View style={{flexDirection:'row',justifyContent:'space-between',marginBottom:4}}>
                  <View style={{flexDirection:'row',alignItems:'center'}}><MaterialIcons name="attach-money" size={12} color="#6B7280" /><Text style={{fontSize:12,color:'#6B7280'}}>Total: {money(l.total)}</Text></View>
                  <View style={{flexDirection:'row',alignItems:'center'}}><MaterialIcons name="check" size={12} color={GN} /><Text style={{fontSize:12,color:'#6B7280'}}>Paid: {money(l.paid)}</Text></View>
                </View>
                <View style={{flexDirection:'row',alignItems:'center',marginBottom:6}}><MaterialIcons name="hourglass-bottom" size={12} color={P} style={{marginRight:3}} /><Text style={{fontSize:12,fontWeight:'600',color:'#111827'}}>Remaining: {money(rem)}</Text></View>
                <Bar pct={pct} color={stC} />
                <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:8}}>
                  <View style={{flexDirection:'row',alignItems:'center'}}><MaterialIcons name="event" size={13} color={isOD?RD:soon?AM:'#6B7280'} style={{marginRight:4}} /><Text style={{fontSize:12,color:isOD?RD:soon?'#D97706':'#6B7280',fontWeight:isOD||soon?'600':'400'}}>Due: {l.due||'N/A'}</Text></View>
                  {l.rate>0&&<View style={{flexDirection:'row',alignItems:'center'}}><MaterialIcons name="percent" size={11} color="#6B7280" /><Text style={{fontSize:11,color:'#6B7280'}}>{l.rate}% interest</Text></View>}
                </View>
                <View style={{flexDirection:'row',gap:8,marginTop:10}}>
                  {!paid&&<Pressable style={[s.smBtn,{backgroundColor:PL}]} onPress={()=>openPayForm(l.id)}><MaterialIcons name="credit-card" size={14} color={P} /><Text style={{fontSize:12,fontWeight:'600',color:P,marginLeft:4}}>Make Payment</Text></Pressable>}
                  {confirmDel===l.id?(
                    <View style={{flexDirection:'row',gap:6}}>
                      <Pressable style={[s.smBtn,{backgroundColor:'#FEE2E2'}]} onPress={()=>delLoan(l.id)}><MaterialIcons name="check" size={14} color="#DC2626" /><Text style={{fontSize:12,fontWeight:'600',color:'#DC2626',marginLeft:2}}>Confirm</Text></Pressable>
                      <Pressable style={s.smBtn} onPress={()=>setConfirmDel(null)}><MaterialIcons name="close" size={14} color="#6B7280" /><Text style={{fontSize:12,color:'#6B7280',marginLeft:2}}>Cancel</Text></Pressable>
                    </View>
                  ):(
                    <Pressable style={s.smBtn} onPress={()=>setConfirmDel(l.id)}><MaterialIcons name="delete-outline" size={14} color="#9CA3AF" /></Pressable>
                  )}
                </View>
              </View>
            );
          })}
        </Sec>

        {/* ─── SECTION 8: PAYROLL SUMMARY ───────────────────────────── */}
        <Sec title="Payroll Summary" icon="people">
          <View style={{marginBottom:12}}>
            <View style={{flexDirection:'row',alignItems:'center',marginBottom:4}}><MaterialIcons name="payments" size={16} color={P} style={{marginRight:5}} /><Text style={{fontSize:12,color:'#6B7280'}}>Total Payroll Cost</Text></View>
            <Text style={{fontSize:22,fontWeight:'800',color:'#111827'}}>{money(f.totPay)}</Text>
          </View>

          {Object.entries(f.payrollMap).map(([role,d])=>(
            <View key={role} style={s.payRow}>
              <View style={{flexDirection:'row',alignItems:'center',flex:1}}><MaterialIcons name="person" size={14} color={P} style={{marginRight:6}} /><Text style={{fontSize:13,color:'#374151'}}>{role} ({d.n})</Text></View>
              <Text style={{fontSize:13,fontWeight:'600',color:'#111827'}}>{money(d.cost)}</Text>
            </View>
          ))}

          <View style={[s.taxR,{marginTop:12,borderTopWidth:1,borderTopColor:'#E5E7EB',paddingTop:10}]}>
            <View style={{flexDirection:'row',alignItems:'center'}}><MaterialIcons name="pie-chart" size={14} color={P} style={{marginRight:5}} /><Text style={{fontSize:13,color:'#6B7280'}}>Payroll as % of Revenue</Text></View>
            <Text style={{fontSize:14,fontWeight:'700',color:P}}>{f.payPct}%</Text>
          </View>

          <View style={{flexDirection:'row',alignItems:'center',marginTop:12}}>
            <MaterialIcons name="info-outline" size={14} color="#9CA3AF" style={{marginRight:5}} />
            <Text style={{fontSize:12,color:'#9CA3AF',fontStyle:'italic',flex:1}}>Manage individual payments in the Staff tab.</Text>
          </View>
        </Sec>

        {/* ─── SECTION 9: BUSINESS INSIGHTS ─────────────────────────── */}
        <Sec title="Business Insights" icon="lightbulb">
          {[
            {ic:'calendar-today',l:'Best Day of Week',v:f.bestDow.day+' (avg '+money(Math.round(f.bestDow.avg))+')'},
            {ic:'schedule',l:'Best Time of Day',v:f.bestTime.k},
            {ic:'trending-up',l:'Avg Daily Revenue',v:money(f.avgDaily)},
            {ic:'shopping-bag',l:'Avg Order Value',v:money(f.avgOrd)},
            {ic:f.trend==='Declining'?'trending-down':'trending-up',l:'Revenue Trend',v:f.trend+' ('+f.revChg+'%)'},
            {ic:'track-changes',l:'Break-even Tracker',v:f.beD<=new Date(_now.getFullYear(),_now.getMonth()+1,0).getDate()?f.beD+' days to break-even':'Already break-even'},
            {ic:'flash-on',l:'Busiest Day',v:f.busiest.date?(f.busiest.date+' ('+money(f.busiest.total)+')'):'N/A'},
            {ic:'star',l:'Top Payment Method',v:f.topPayName},
          ].map(item=>(
            <View key={item.l} style={s.insCard}>
              <View style={s.insIcWrap}><MaterialIcons name={item.ic} size={18} color={P} /></View>
              <View style={{flex:1}}>
                <Text style={{fontSize:11,color:'#6B7280'}}>{item.l}</Text>
                <Text style={{fontSize:14,fontWeight:'600',color:'#111827',marginTop:1}}>{item.v}</Text>
              </View>
            </View>
          ))}
        </Sec>

        {/* ─── EXPORT FULL REPORT ───────────────────────────────────── */}
        <Pressable style={s.exportBtn} onPress={exportFullPdf} disabled={exporting}>
          <MaterialIcons name="share" size={20} color="#fff" /><Text style={s.exportBtnTx}>{exporting ? 'Preparing…' : 'Share Full Report'}</Text>
        </Pressable>

      </ScrollView>

      {/* ─── FAB ─────────────────────────────────────────────────────── */}
      <Pressable style={s.fab} onPress={()=>setSheetFab(true)}>
        <MaterialIcons name="add" size={28} color="#fff" />
      </Pressable>

      {/* ─── FAB SHEET ───────────────────────────────────────────────── */}
      <BottomSheet visible={sheetFab} onClose={()=>setSheetFab(false)} title="Quick Actions">
        <Pressable style={s.fabOpt} onPress={()=>{setSheetFab(false);setTimeout(()=>openExpForm(null),300);}}>
          <View style={[s.fabOptIc,{backgroundColor:'#FEF2F2'}]}><MaterialIcons name="receipt" size={20} color={RD} /></View>
          <Text style={s.fabOptTx}>Add Expense</Text>
        </Pressable>
        <Pressable style={s.fabOpt} onPress={()=>{setSheetFab(false);setTimeout(openLoanForm,300);}}>
          <View style={[s.fabOptIc,{backgroundColor:'#EFF6FF'}]}><MaterialIcons name="account-balance" size={20} color={BL} /></View>
          <Text style={s.fabOptTx}>Add Loan</Text>
        </Pressable>
        <Pressable style={s.fabOpt} onPress={()=>{setSheetFab(false);setTimeout(openIncForm,300);}}>
          <View style={[s.fabOptIc,{backgroundColor:'#F0FDF4'}]}><MaterialIcons name="add-circle" size={20} color={GN} /></View>
          <Text style={s.fabOptTx}>Add Manual Income Entry</Text>
        </Pressable>
      </BottomSheet>

      {/* ─── EXPENSE FORM ────────────────────────────────────────────── */}
      <BottomSheet visible={sheetExp} onClose={()=>setSheetExp(false)} title={editExp?'Edit Expense':'Add Expense'}>
        <LabelInput icon="category" label="Category"><Pills opts={CATS} val={fCat} onPick={setFCat} icons={CAT_IC} /></LabelInput>
        <LabelInput icon="attach-money" label="Amount (so'm)"><TextInput style={s.inp} keyboardType="numeric" value={fAmt} onChangeText={setFAmt} placeholder="Enter amount" placeholderTextColor="#9CA3AF" /></LabelInput>
        <LabelInput icon="event" label="Date"><DatePickerField value={fDate} onChange={setFDate} placeholder="Select expense date" /></LabelInput>
        <LabelInput icon="notes" label="Description"><TextInput style={s.inp} value={fDesc} onChangeText={setFDesc} placeholder="Enter description" placeholderTextColor="#9CA3AF" /></LabelInput>
        <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
          <View style={{flexDirection:'row',alignItems:'center'}}><MaterialIcons name="repeat" size={14} color="#6B7280" style={{marginRight:5}} /><Text style={s.formLbl}>Recurring</Text></View>
          <Switch value={fRec} onValueChange={setFRec} trackColor={{true:P}} thumbColor="#fff" />
        </View>
        {fRec&&<View style={{marginBottom:14}}><Pills opts={['Daily','Weekly','Monthly']} val={fFreq} onPick={setFFreq} /></View>}
        <Pressable style={s.saveBtn} onPress={saveExp}><MaterialIcons name="check" size={18} color="#fff" style={{marginRight:6}} /><Text style={s.saveTx}>Save</Text></Pressable>
      </BottomSheet>

      {/* ─── LOAN FORM ───────────────────────────────────────────────── */}
      <BottomSheet visible={sheetLoan} onClose={()=>setSheetLoan(false)} title="Add Loan">
        <LabelInput icon="person" label="Lender Name"><TextInput style={s.inp} value={lName} onChangeText={setLName} placeholder="Enter lender name" placeholderTextColor="#9CA3AF" /></LabelInput>
        <LabelInput icon="attach-money" label="Total Loan Amount"><TextInput style={s.inp} keyboardType="numeric" value={lTotal} onChangeText={setLTotal} placeholder="Enter total" placeholderTextColor="#9CA3AF" /></LabelInput>
        <LabelInput icon="check-circle" label="Amount Already Paid"><TextInput style={s.inp} keyboardType="numeric" value={lPaid} onChangeText={setLPaid} placeholder="0" placeholderTextColor="#9CA3AF" /></LabelInput>
        <LabelInput icon="percent" label="Interest Rate % (optional)"><TextInput style={s.inp} keyboardType="numeric" value={lRate} onChangeText={setLRate} placeholder="0" placeholderTextColor="#9CA3AF" /></LabelInput>
        <LabelInput icon="event" label="Due Date"><DatePickerField value={lDue} onChange={setLDue} placeholder="Select due date" /></LabelInput>
        <LabelInput icon="notes" label="Notes"><TextInput style={s.inp} value={lNotes} onChangeText={setLNotes} placeholder="Add notes" placeholderTextColor="#9CA3AF" /></LabelInput>
        <Pressable style={s.saveBtn} onPress={saveLoan}><MaterialIcons name="check" size={18} color="#fff" style={{marginRight:6}} /><Text style={s.saveTx}>Save</Text></Pressable>
      </BottomSheet>

      {/* ─── PAYMENT FORM ────────────────────────────────────────────── */}
      <BottomSheet visible={sheetPay} onClose={()=>setSheetPay(false)} title="Make Payment">
        <LabelInput icon="attach-money" label="Payment Amount"><TextInput style={s.inp} keyboardType="numeric" value={pAmt} onChangeText={setPAmt} placeholder="Enter amount" placeholderTextColor="#9CA3AF" /></LabelInput>
        <LabelInput icon="event" label="Date"><DatePickerField value={pDate} onChange={setPDate} placeholder="Select payment date" /></LabelInput>
        <LabelInput icon="payment" label="Method"><Pills opts={['Cash','Bank Transfer','Card']} val={pMethod} onPick={setPMethod} icons={{Cash:'payments','Bank Transfer':'account-balance',Card:'credit-card'}} /></LabelInput>
        <Pressable style={s.saveBtn} onPress={savePay}><MaterialIcons name="check" size={18} color="#fff" style={{marginRight:6}} /><Text style={s.saveTx}>Save Payment</Text></Pressable>
      </BottomSheet>

      {/* ─── BUDGET FORM ─────────────────────────────────────────────── */}
      <BottomSheet visible={sheetBgt} onClose={()=>setSheetBgt(false)} title="Set Monthly Budget">
        {CATS.map(c=>(
          <LabelInput key={c} icon={CAT_IC[c]} label={c}><TextInput style={s.inp} keyboardType="numeric" value={String(bgtEdits[c]||'')} onChangeText={v=>setBgtEdits(p=>({...p,[c]:v}))} placeholder="0" placeholderTextColor="#9CA3AF" /></LabelInput>
        ))}
        <Pressable style={s.saveBtn} onPress={saveBgt}><MaterialIcons name="check" size={18} color="#fff" style={{marginRight:6}} /><Text style={s.saveTx}>Save Budget</Text></Pressable>
      </BottomSheet>

      {/* ─── INCOME FORM ─────────────────────────────────────────────── */}
      <BottomSheet visible={sheetInc} onClose={()=>setSheetInc(false)} title="Add Manual Income">
        <LabelInput icon="attach-money" label="Amount (so'm)"><TextInput style={s.inp} keyboardType="numeric" value={iAmt} onChangeText={setIAmt} placeholder="Enter amount" placeholderTextColor="#9CA3AF" /></LabelInput>
        <LabelInput icon="category" label="Category"><Pills opts={INC_CATS} val={iCat} onPick={setICat} icons={INC_IC} /></LabelInput>
        <LabelInput icon="event" label="Date"><DatePickerField value={iDate} onChange={setIDate} placeholder="Select income date" /></LabelInput>
        <LabelInput icon="notes" label="Note"><TextInput style={s.inp} value={iNote} onChangeText={setINote} placeholder="Optional note" placeholderTextColor="#9CA3AF" /></LabelInput>
        <Pressable style={s.saveBtn} onPress={saveInc}><MaterialIcons name="check" size={18} color="#fff" style={{marginRight:6}} /><Text style={s.saveTx}>Save</Text></Pressable>
      </BottomSheet>
      <ConfirmDialog dialog={dialog} onClose={() => setDialog(null)} />
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════════
// STYLES
// ════════════════════════════════════════════════════════════════════════
const s = StyleSheet.create({
  // bottom sheet
  bsOverlay:{flex:1,backgroundColor:'rgba(0,0,0,0.5)'},
  bsBox:{position:'absolute',bottom:0,left:0,right:0,maxHeight:SH*0.85,backgroundColor:'#fff',borderTopLeftRadius:20,borderTopRightRadius:20,paddingTop:12,...shadow.lg},
  bsHandle:{alignSelf:'center',width:40,height:4,borderRadius:2,backgroundColor:'#D1D5DB',marginBottom:8},
  bsTitleRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingHorizontal:16,marginBottom:12},
  bsTitleTxt:{fontSize:18,fontWeight:'700',color:'#111827'},
  // section
  sec:{marginBottom:12,backgroundColor:'#fff',borderRadius:14,borderWidth:1,borderColor:'#F3F4F6',...shadow.sm},
  secHdr:{flexDirection:'row',alignItems:'center',paddingHorizontal:16,paddingVertical:14,minHeight:48},
  secTitle:{fontSize:16,fontWeight:'700',color:'#1F2937'},
  secBody:{paddingHorizontal:16,paddingBottom:16,borderTopWidth:1,borderTopColor:'#F3F4F6',paddingTop:12},
  // metric card
  mCard:{flex:1,backgroundColor:'#FAFAFA',borderTopWidth:3,borderRadius:14,padding:14,borderWidth:1,borderColor:'#F3F4F6'},
  mCardIcWrap:{width:36,height:36,borderRadius:10,alignItems:'center',justifyContent:'center',marginBottom:10},
  mCardLbl:{fontSize:12,fontWeight:'600',color:'#6B7280',marginBottom:6},
  mCardVal:{fontSize:18,fontWeight:'800'},
  // sub heading
  subH:{fontSize:14,fontWeight:'700',color:'#374151'},
  // table
  tbl:{backgroundColor:'#FAFAFA',borderRadius:10,overflow:'hidden',borderWidth:1,borderColor:'#F3F4F6',marginTop:4},
  tblHdr:{flexDirection:'row',paddingHorizontal:8,paddingVertical:8,backgroundColor:'#F3F4F6'},
  tblRow:{flexDirection:'row',paddingHorizontal:8,paddingVertical:7,borderTopWidth:1,borderTopColor:'#E5E7EB'},
  tblC:{flex:1,fontSize:10,color:'#374151'},
  // cash flow
  cfCard:{flex:1,backgroundColor:'#FAFAFA',borderRadius:10,padding:10,borderLeftWidth:3,borderWidth:1,borderColor:'#F3F4F6'},
  cfLbl:{fontSize:10,color:'#6B7280'},
  cfVal:{fontSize:13,fontWeight:'700'},
  // warning
  warn:{flexDirection:'row',alignItems:'center',backgroundColor:'#FFFBEB',borderRadius:10,padding:12,borderWidth:1,borderColor:'#FDE68A',marginBottom:8},
  warnTx:{fontSize:12,fontWeight:'600',color:'#92400E',marginLeft:8,flex:1},
  // add button
  addBtn:{flexDirection:'row',alignItems:'center',justifyContent:'center',borderWidth:1.5,borderColor:P,borderRadius:10,paddingVertical:12,marginBottom:12,borderStyle:'dashed',minHeight:44},
  addBtnTx:{fontSize:14,fontWeight:'600',color:P,marginLeft:6},
  // expense row
  expRow:{flexDirection:'row',alignItems:'center',paddingVertical:10,borderBottomWidth:1,borderBottomColor:'#F3F4F6',minHeight:44},
  expIc:{width:34,height:34,borderRadius:10,backgroundColor:PL,alignItems:'center',justifyContent:'center',marginRight:10},
  // badge
  badge:{backgroundColor:'#EFF6FF',paddingHorizontal:6,paddingVertical:2,borderRadius:4,flexDirection:'row',alignItems:'center'},
  badgeTx:{fontSize:10,fontWeight:'600',color:BL},
  // tax
  taxR:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingVertical:6},
  taxL:{fontSize:13,color:'#6B7280'},
  taxV:{fontSize:13,fontWeight:'600',color:'#111827'},
  // total row
  totRow:{flexDirection:'row',justifyContent:'space-between',borderTopWidth:1,borderTopColor:'#E5E7EB',paddingTop:10,marginTop:8},
  totLbl:{fontSize:14,fontWeight:'700',color:'#374151'},
  totVal:{fontSize:15,fontWeight:'800'},
  // payroll
  payRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingVertical:8,borderBottomWidth:1,borderBottomColor:'#F3F4F6',minHeight:44},
  // loan card
  loanCard:{backgroundColor:'#FAFAFA',borderRadius:12,padding:14,marginBottom:10,borderWidth:1,borderColor:'#F3F4F6'},
  // small btn
  smBtn:{flexDirection:'row',alignItems:'center',paddingHorizontal:10,paddingVertical:7,borderRadius:8,backgroundColor:'#F3F4F6',minHeight:34},
  // insight card
  insCard:{flexDirection:'row',alignItems:'center',paddingVertical:10,borderBottomWidth:1,borderBottomColor:'#F3F4F6',minHeight:44},
  insIcWrap:{width:36,height:36,borderRadius:10,backgroundColor:PL,alignItems:'center',justifyContent:'center',marginRight:12},
  // export
  exportBtn:{flexDirection:'row',alignItems:'center',justifyContent:'center',backgroundColor:P,borderRadius:12,paddingVertical:14,marginTop:8,minHeight:48},
  exportBtnTx:{fontSize:15,fontWeight:'700',color:'#fff',marginLeft:8},
  exportBlk:{backgroundColor:'#FAFAFA',borderRadius:12,padding:16,marginTop:12,borderWidth:1,borderColor:'#E5E7EB'},
  exportH:{fontSize:15,fontWeight:'700',color:'#111827',marginBottom:4},
  exportLn:{fontSize:12,color:'#374151',marginVertical:1},
  // fab
  fab:{position:'absolute',right:20,bottom:20,width:56,height:56,borderRadius:28,backgroundColor:P,alignItems:'center',justifyContent:'center',...shadow.lg},
  fabOpt:{flexDirection:'row',alignItems:'center',paddingVertical:14,borderBottomWidth:1,borderBottomColor:'#F3F4F6',minHeight:48},
  fabOptIc:{width:40,height:40,borderRadius:12,alignItems:'center',justifyContent:'center',marginRight:14},
  fabOptTx:{fontSize:15,fontWeight:'600',color:'#111827'},
  // forms
  formLbl:{fontSize:13,fontWeight:'600',color:'#374151'},
  inp:{backgroundColor:'#F3F4F6',borderRadius:10,paddingHorizontal:14,paddingVertical:12,fontSize:14,color:'#111827',borderWidth:1,borderColor:'#E5E7EB',minHeight:44},
  saveBtn:{backgroundColor:P,borderRadius:12,paddingVertical:14,alignItems:'center',marginTop:16,minHeight:48,flexDirection:'row',justifyContent:'center'},
  saveTx:{fontSize:15,fontWeight:'700',color:'#fff'},
  // pills
  pill:{paddingHorizontal:14,paddingVertical:8,borderRadius:20,backgroundColor:'#F3F4F6',borderWidth:1,borderColor:'#E5E7EB',flexDirection:'row',alignItems:'center',minHeight:36},
  pillOn:{backgroundColor:PL,borderColor:P},
  pillTx:{fontSize:12,fontWeight:'600',color:'#6B7280'},
  pillTxOn:{color:P},
});

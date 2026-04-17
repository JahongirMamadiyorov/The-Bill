import React, { useState, useEffect, useRef } from "react";
import {
  TrendingUp, TrendingDown, DollarSign, Percent, CreditCard, Banknote,
  QrCode, UtensilsCrossed, ShoppingBag, Truck, Sun, Coffee, Moon,
  Calendar, BarChart3, ArrowLeftRight, Receipt, Target, FileText,
  Landmark, Users, Lightbulb, Plus, X, ChevronDown, ChevronUp,
  Trash2, Edit, RefreshCw, Printer, AlertTriangle, Star, Clock,
  Repeat, Search, LogOut, Home, Zap, Wrench, MoreHorizontal, Megaphone,
  Hammer, PiggyBank, ArrowUpRight, ArrowDownLeft, Scale, Download,
  CheckCircle, XCircle, Timer, Activity, ShoppingCart, Filter,
} from "lucide-react";

// ══════════════════════════════════════════════════════════════════
// CONSTANTS & HELPERS
// ══════════════════════════════════════════════════════════════════
const API = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
const P = "#7C3AED", GN = "#10B981", RD = "#EF4444", AM = "#F59E0B", BL = "#3B82F6", CY = "#06B6D4", PK = "#EC4899";

const CATS = ["Rent","Utilities","Salaries","Ingredients","Equipment","Marketing","Maintenance","Other"];
const CAT_ICONS = { Rent: Home, Utilities: Zap, Salaries: Users, Ingredients: UtensilsCrossed, Equipment: Wrench, Marketing: Megaphone, Maintenance: Hammer, Other: MoreHorizontal };
const INC_CATS = ["Sales","Other Income","Refund Received"];
const SHORT_DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const MO_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const money = (v) => {
  const n = Math.round(Number(v) || 0);
  const neg = n < 0;
  const s = Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return (neg ? "-" : "") + s + " so'm";
};
const pctStr = (cur, prev) => {
  if (!prev) return cur > 0 ? "+100%" : "0%";
  const c = ((cur - prev) / Math.abs(prev) * 100).toFixed(1);
  return (c > 0 ? "+" : "") + c + "%";
};
const fmtD = (d) => { const dt = new Date(d); return dt.toISOString().split("T")[0]; };
const todayStr = () => fmtD(new Date());
const monthStart = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-01`; };
const weekStart = () => { const d = new Date(); const day = d.getDay(); const diff = d.getDate() - day + (day === 0 ? -6 : 1); return fmtD(new Date(d.getFullYear(), d.getMonth(), diff)); };

// ══════════════════════════════════════════════════════════════════
// SEED DATA (fallback when API not available)
// ══════════════════════════════════════════════════════════════════
function makeDayRev(year, month, day) {
  const dow = new Date(year, month - 1, day).getDay();
  const wknd = dow === 0 || dow === 5 || dow === 6;
  const t = wknd ? 320000+(((day*7+month*13)%17)*8000) : 180000+(((day*11+month*7)%19)*7500);
  return {
    date: `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`,
    total:t, food:Math.round(t*0.60), drinks:Math.round(t*0.28), other:t-Math.round(t*0.60)-Math.round(t*0.28),
    cash:Math.round(t*0.55), card:Math.round(t*0.30), qr:t-Math.round(t*0.55)-Math.round(t*0.30),
    dineIn:Math.round(t*0.60), toGo:Math.round(t*0.25), delivery:t-Math.round(t*0.60)-Math.round(t*0.25),
    morning:Math.round(t*0.20), afternoon:Math.round(t*0.35), evening:t-Math.round(t*0.20)-Math.round(t*0.35),
  };
}
function buildSeedSummary(start, end) {
  const allDays = [];
  for (let d = 1; d <= 28; d++) allDays.push(makeDayRev(2026,2,d));
  for (let d = 1; d <= 23; d++) allDays.push(makeDayRev(2026,3,d));
  const dr = allDays.filter(d => d.date >= start && d.date <= end);
  const totalRev = dr.reduce((a,d)=>a+d.total,0);
  const seedExp = [850000,2400000,3500000,780000,1200000,550000,480000,380000,920000,220000];
  const totalExp = seedExp.reduce((a,v)=>a+v,0);
  const net = totalRev - totalExp;
  const days = Math.round((new Date(end)-new Date(start))/86400000)+1;
  const prevEnd = new Date(start); prevEnd.setDate(prevEnd.getDate()-1);
  const prevStart = new Date(prevEnd); prevStart.setDate(prevStart.getDate()-days+1);
  const pDr = allDays.filter(d => d.date >= fmtD(prevStart) && d.date <= fmtD(prevEnd));
  const prevRev = pDr.reduce((a,d)=>a+d.total,0);
  const prevNet = prevRev - totalExp;
  let bal = 0;
  const cfDays = dr.map(d => {
    const expDay = d.date === "2026-03-01" ? 3500000 : d.date === "2026-03-02" ? 850000 : d.date === "2026-03-05" ? 780000 : d.date === "2026-03-07" ? 2400000 : d.date === "2026-03-08" ? 480000 : d.date === "2026-03-10" ? 1200000 : d.date === "2026-03-12" ? 550000 : d.date === "2026-03-15" ? 380000 : d.date === "2026-03-18" ? 920000 : d.date === "2026-03-20" ? 220000 : 0;
    bal += d.total - expDay;
    return { date: d.date, cash_in: d.total, cash_out: expDay, net: d.total-expDay, balance: bal };
  });
  const byDow = {};
  SHORT_DAYS.forEach(d => { byDow[d] = { total:0, count:0 }; });
  dr.forEach(d => { const dow = new Date(d.date+"T00:00:00").getDay(); const nm = SHORT_DAYS[(dow+6)%7]; byDow[nm].total += d.total; byDow[nm].count++; });
  const expCat = { Ingredients:850000+1200000+920000, Salaries:2400000, Rent:3500000, Utilities:780000, Equipment:550000, Marketing:480000, Maintenance:380000, Other:220000 };

  return {
    period: { start, end, days },
    current: { total_revenue:totalRev, total_expenses:totalExp, net_profit:net, profit_margin: totalRev>0?Math.round(net/totalRev*1000)/10:0 },
    previous: { start:fmtD(prevStart), end:fmtD(prevEnd), total_revenue:prevRev, total_expenses:totalExp, net_profit:prevNet, profit_margin: prevRev>0?Math.round(prevNet/prevRev*1000)/10:0 },
    revenue_by_payment: { cash:Math.round(totalRev*0.55), card:Math.round(totalRev*0.30), qr:totalRev-Math.round(totalRev*0.55)-Math.round(totalRev*0.30) },
    revenue_by_order_type: { dine_in:Math.round(totalRev*0.60), takeaway:Math.round(totalRev*0.25), delivery:totalRev-Math.round(totalRev*0.60)-Math.round(totalRev*0.25) },
    revenue_by_time: { morning:Math.round(totalRev*0.20), afternoon:Math.round(totalRev*0.35), evening:totalRev-Math.round(totalRev*0.20)-Math.round(totalRev*0.35) },
    revenue_by_dow: byDow,
    expense_by_category: Object.entries(expCat).map(([category,total])=>({category,total})),
    daily_cash_flow: cfDays,
    payroll: [{role:"Waitress",staff_count:4,total_cost:3200000},{role:"Kitchen",staff_count:3,total_cost:4100000},{role:"Bar",staff_count:1,total_cost:2800000},{role:"Cashier",staff_count:2,total_cost:2400000},{role:"Cleaner",staff_count:1,total_cost:1200000}],
    tax: { rate:0.12, tax_collected:Math.round(totalRev*0.12), service_charge_rate:0.05, service_charge:Math.round(totalRev*0.05) },
  };
}
const SEED_EXPENSES = [
  { id:1, category:"Ingredients", amount:850000, date:"2026-03-02", description:"Fresh vegetables - Chorsu Bazaar", recurring:false },
  { id:2, category:"Salaries", amount:2400000, date:"2026-03-07", description:"Weekly staff wages", recurring:true, frequency:"Weekly" },
  { id:3, category:"Rent", amount:3500000, date:"2026-03-01", description:"Monthly restaurant rent", recurring:true, frequency:"Monthly" },
  { id:4, category:"Utilities", amount:780000, date:"2026-03-05", description:"Electricity & water bill", recurring:true, frequency:"Monthly" },
  { id:5, category:"Ingredients", amount:1200000, date:"2026-03-10", description:"Meat supplier delivery", recurring:false },
  { id:6, category:"Equipment", amount:550000, date:"2026-03-12", description:"New blender for bar", recurring:false },
  { id:7, category:"Marketing", amount:480000, date:"2026-03-08", description:"Instagram ads campaign", recurring:true, frequency:"Monthly" },
  { id:8, category:"Maintenance", amount:380000, date:"2026-03-15", description:"Kitchen hood cleaning", recurring:false },
  { id:9, category:"Ingredients", amount:920000, date:"2026-03-18", description:"Rice and flour wholesale", recurring:false },
  { id:10, category:"Other", amount:220000, date:"2026-03-20", description:"Disposable containers & napkins", recurring:false },
];
const SEED_LOANS = [
  { id:1, lender_name:"Hamid Karimov", total_amount:15000000, amount_paid:5000000, interest_rate:8, due_date:"2026-04-15", notes:"Kitchen renovation", status:"active",
    payments:[{id:"p1",amount:2500000,payment_date:"2026-02-15",method:"Cash"},{id:"p2",amount:2500000,payment_date:"2026-03-15",method:"Bank Transfer"}] },
  { id:2, lender_name:"Sardor Ergashev", total_amount:8000000, amount_paid:2000000, interest_rate:0, due_date:"2026-03-10", notes:"Short-term personal loan", status:"active",
    payments:[{id:"p3",amount:1000000,payment_date:"2026-01-20",method:"Cash"},{id:"p4",amount:1000000,payment_date:"2026-02-20",method:"Cash"}] },
];
const SEED_BUDGETS = { Rent:3500000, Utilities:800000, Salaries:10000000, Ingredients:3200000, Equipment:600000, Marketing:500000, Maintenance:400000, Other:300000 };
const SEED_TAX_HISTORY = [
  { month:"2026-03", month_label:"March 2026", revenue:5200000, tax_collected:624000 },
  { month:"2026-02", month_label:"February 2026", revenue:6800000, tax_collected:816000 },
  { month:"2026-01", month_label:"January 2026", revenue:5900000, tax_collected:708000 },
  { month:"2025-12", month_label:"December 2025", revenue:7200000, tax_collected:864000 },
  { month:"2025-11", month_label:"November 2025", revenue:5500000, tax_collected:660000 },
  { month:"2025-10", month_label:"October 2025", revenue:6100000, tax_collected:732000 },
];
const SEED_PAYROLL = { Waitress:{n:4,cost:3200000}, Kitchen:{n:3,cost:4100000}, Bar:{n:1,cost:2800000}, Cashier:{n:2,cost:2400000}, Cleaner:{n:1,cost:1200000} };

// ══════════════════════════════════════════════════════════════════
// API LAYER
// ══════════════════════════════════════════════════════════════════
function apiFetch(path, opts = {}) {
  const token = localStorage.getItem("token");
  const headers = { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  return fetch(`${API}${path}`, { ...opts, headers: { ...headers, ...opts.headers } }).then(async r => {
    if (r.status === 401) throw new Error("UNAUTHORIZED");
    if (!r.ok) { const e = await r.json().catch(()=>({})); throw new Error(e.error || `HTTP ${r.status}`); }
    return r.json();
  });
}

// ══════════════════════════════════════════════════════════════════
// SMALL SHARED COMPONENTS
// ══════════════════════════════════════════════════════════════════
function Skeleton({ className = "" }) {
  return <div className={`animate-pulse bg-gray-200 rounded ${className}`} />;
}
function SectionSkeleton() {
  return <div className="space-y-3 py-4"><Skeleton className="h-6 w-48" /><Skeleton className="h-24 w-full" /><Skeleton className="h-16 w-full" /></div>;
}
function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white rounded-t-2xl flex items-center justify-between px-6 py-4 border-b border-gray-100 z-10">
          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100"><X size={20} className="text-gray-400" /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
function ErrorBanner({ msg, onRetry }) {
  return (
    <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl p-4 my-4">
      <AlertTriangle size={18} className="text-red-500 flex-shrink-0" />
      <span className="text-sm text-red-700 flex-1">{msg}</span>
      {onRetry && <button onClick={onRetry} className="text-sm font-semibold text-red-600 hover:text-red-800 flex items-center gap-1"><RefreshCw size={14} /> Retry</button>}
    </div>
  );
}
function BarDiv({ pct, color = P, h = 8 }) {
  return (
    <div className="rounded-full overflow-hidden bg-gray-200" style={{ height: h }}>
      <div className="h-full rounded-full transition-all duration-300" style={{ width: `${Math.min(Math.max(pct||0,0),100)}%`, backgroundColor: color }} />
    </div>
  );
}
function NumInput({ value, onChange, placeholder, className = "" }) {
  const fmt = (v) => { const n = v.replace(/[^0-9]/g,""); return n ? Number(n).toLocaleString("en-US").replace(/,/g," ") : ""; };
  const raw = (v) => v.replace(/\s/g,"");
  return <input type="text" value={fmt(String(value||""))} onChange={e=>onChange(raw(e.target.value))} placeholder={placeholder} className={`border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-violet-200 focus:border-violet-400 outline-none ${className}`} />;
}

// Section IDs for sidebar nav
const SECTIONS = [
  { id:"profit-loss", label:"Profit & Loss", icon: TrendingUp },
  { id:"revenue", label:"Revenue Breakdown", icon: BarChart3 },
  { id:"cash-flow", label:"Cash Flow", icon: ArrowLeftRight },
  { id:"expenses", label:"Expense Manager", icon: Receipt },
  { id:"budget", label:"Budget vs Actual", icon: Target },
  { id:"tax", label:"Tax Summary", icon: FileText },
  { id:"loans", label:"Loans & Debt", icon: Landmark, ownerOnly: true },
  { id:"payroll", label:"Payroll Summary", icon: Users, ownerOnly: true },
  { id:"insights", label:"Business Insights", icon: Lightbulb },
];

// ══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════
export default function FinanceApp() {
  // Auth
  const [token] = useState(() => localStorage.getItem("token"));
  const [role] = useState(() => localStorage.getItem("role") || "owner");
  const [expired, setExpired] = useState(!token);
  const isOwner = role === "owner";

  // Period
  const [periodType, setPeriodType] = useState("month");
  const [customStart, setCustomStart] = useState(monthStart());
  const [customEnd, setCustomEnd] = useState(todayStr());
  const [start, setStart] = useState(monthStart());
  const [end, setEnd] = useState(todayStr());

  // Data
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [loans, setLoans] = useState([]);
  const [budgets, setBudgets] = useState({});
  const [taxHistory, setTaxHistory] = useState([]);
  const [usingSeed, setUsingSeed] = useState(false);

  // UI State
  const [expSort, setExpSort] = useState({ key:"date", asc:false });
  const [showExpModal, setShowExpModal] = useState(false);
  const [editExp, setEditExp] = useState(null);
  const [showLoanModal, setShowLoanModal] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [payLoanId, setPayLoanId] = useState(null);
  const [showBgtModal, setShowBgtModal] = useState(false);
  const [showIncModal, setShowIncModal] = useState(false);
  const [formErr, setFormErr] = useState("");
  const [activeNav, setActiveNav] = useState("profit-loss");
  const printRef = useRef(null);

  // Expense form
  const [fCat, setFCat] = useState("Ingredients");
  const [fAmt, setFAmt] = useState("");
  const [fDate, setFDate] = useState(todayStr());
  const [fDesc, setFDesc] = useState("");
  const [fRec, setFRec] = useState(false);
  const [fFreq, setFFreq] = useState("Monthly");

  // Loan form
  const [lName, setLName] = useState("");
  const [lTotal, setLTotal] = useState("");
  const [lPaid, setLPaid] = useState("0");
  const [lRate, setLRate] = useState("");
  const [lDue, setLDue] = useState("");
  const [lNotes, setLNotes] = useState("");

  // Payment form
  const [pAmt, setPAmt] = useState("");
  const [pDate, setPDate] = useState(todayStr());
  const [pMethod, setPMethod] = useState("Cash");

  // Budget form
  const [bgtEdits, setBgtEdits] = useState({});

  // Income form
  const [iAmt, setIAmt] = useState("");
  const [iCat, setICat] = useState("Sales");
  const [iDate, setIDate] = useState(todayStr());
  const [iNote, setINote] = useState("");

  // ── Period calc ──
  useEffect(() => {
    if (periodType === "today") { setStart(todayStr()); setEnd(todayStr()); }
    else if (periodType === "week") { setStart(weekStart()); setEnd(todayStr()); }
    else if (periodType === "month") { setStart(monthStart()); setEnd(todayStr()); }
  }, [periodType]);

  const applyCustom = () => { setStart(customStart); setEnd(customEnd); setPeriodType("custom"); };

  // ── Data fetch ──
  const fetchAll = async () => {
    setLoading(true); setError(null);
    try {
      const [sumData, expData, loanData, bgtData, taxData] = await Promise.all([
        apiFetch(`/finance/summary?start=${start}&end=${end}`),
        apiFetch(`/finance/expenses?start=${start}&end=${end}`),
        apiFetch("/finance/loans"),
        apiFetch("/finance/budgets"),
        apiFetch("/finance/tax-history"),
      ]);
      setSummary(sumData);
      setExpenses(expData);
      setLoans(loanData);
      const bObj = {};
      (bgtData || []).forEach(b => { bObj[b.category] = b.monthly_budget; });
      setBudgets(bObj);
      setTaxHistory(taxData || []);
      setUsingSeed(false);
    } catch (e) {
      if (e.message === "UNAUTHORIZED") { setExpired(true); return; }
      // Fallback to seed data
      setSummary(buildSeedSummary(start, end));
      setExpenses(SEED_EXPENSES.filter(ex => ex.date >= start && ex.date <= end));
      setLoans(SEED_LOANS);
      setBudgets(SEED_BUDGETS);
      setTaxHistory(SEED_TAX_HISTORY);
      setUsingSeed(true);
    }
    setLoading(false);
  };

  useEffect(() => { if (token) fetchAll(); }, [start, end]);

  // ── Derived ──
  const f = summary || buildSeedSummary(start, end);
  const totPay = f.payroll ? f.payroll.reduce((a,r)=>a+r.total_cost,0) : 0;
  const totBgt = Object.values(budgets).reduce((a,v)=>a+Number(v),0);
  const expCatMap = {};
  CATS.forEach(c => { expCatMap[c] = 0; });
  expenses.forEach(e => { expCatMap[e.category] = (expCatMap[e.category]||0) + Number(e.amount); });
  const filtExpenses = [...expenses].sort((a,b) => {
    const ka = expSort.key, va = a[ka], vb = b[ka];
    const cmp = typeof va === "number" ? va - vb : String(va||"").localeCompare(String(vb||""));
    return expSort.asc ? cmp : -cmp;
  });
  const bestDow = Object.entries(f.revenue_by_dow||{}).reduce((b,[k,v])=>{ const avg = v.count>0?v.total/v.count:0; return avg>b.avg?{day:k,avg}:b; },{day:"",avg:0});
  const timeEntries = Object.entries(f.revenue_by_time||{});
  const bestTime = timeEntries.reduce((b,[k,v])=>v>b.v?{k,v}:b,{k:"",v:0});
  const avgDaily = f.current && f.period ? Math.round(f.current.total_revenue / Math.max(f.period.days,1)) : 0;

  // ── Mutations ──
  const doMutation = async (method, path, body) => {
    setFormErr("");
    try {
      const opts = { method };
      if (body) opts.body = JSON.stringify(body);
      await apiFetch(path, opts);
      await fetchAll();
      return true;
    } catch (e) {
      if (e.message === "UNAUTHORIZED") { setExpired(true); return false; }
      setFormErr(e.message || "Operation failed");
      return false;
    }
  };

  const saveExpense = async () => {
    const amt = Number(String(fAmt).replace(/\s/g,""));
    if (!fCat || amt <= 0) { setFormErr("Category and amount required"); return; }
    const body = { category:fCat, amount:amt, date:fDate, description:fDesc, recurring:fRec, frequency:fRec?fFreq:null };
    let ok;
    if (editExp) ok = await doMutation("PUT", `/finance/expenses/${editExp.id}`, body);
    else ok = await doMutation("POST", "/finance/expenses", body);
    if (ok) { setShowExpModal(false); setEditExp(null); }
  };
  const deleteExpense = async (id) => { await doMutation("DELETE", `/finance/expenses/${id}`); };
  const saveLoan = async () => {
    const total = Number(String(lTotal).replace(/\s/g,""));
    if (!lName || total <= 0) { setFormErr("Lender name and total required"); return; }
    const body = { lender_name:lName, total_amount:total, amount_paid:Number(String(lPaid).replace(/\s/g,""))||0, interest_rate:Number(lRate)||0, due_date:lDue||null, notes:lNotes||null };
    const ok = await doMutation("POST", "/finance/loans", body);
    if (ok) setShowLoanModal(false);
  };
  const deleteLoan = async (id) => { await doMutation("DELETE", `/finance/loans/${id}`); };
  const savePayment = async () => {
    const amt = Number(String(pAmt).replace(/\s/g,""));
    if (amt <= 0) { setFormErr("Amount must be greater than 0"); return; }
    const ok = await doMutation("POST", `/finance/loans/${payLoanId}/payment`, { amount:amt, payment_date:pDate, method:pMethod });
    if (ok) setShowPayModal(false);
  };
  const saveBudget = async () => {
    const ok = await doMutation("POST", "/finance/budgets", { budgets: bgtEdits });
    if (ok) setShowBgtModal(false);
  };
  const saveIncome = async () => {
    const amt = Number(String(iAmt).replace(/\s/g,""));
    if (amt <= 0) { setFormErr("Amount must be greater than 0"); return; }
    const ok = await doMutation("POST", "/finance/manual-income", { amount:amt, category:iCat, date:iDate, note:iNote||null });
    if (ok) setShowIncModal(false);
  };

  // ── Helpers for opening forms ──
  const openExpForm = (exp) => {
    setFormErr("");
    if (exp) { setEditExp(exp); setFCat(exp.category); setFAmt(String(exp.amount)); setFDate(exp.date?.split("T")[0]||todayStr()); setFDesc(exp.description||""); setFRec(!!exp.recurring); setFFreq(exp.frequency||"Monthly"); }
    else { setEditExp(null); setFCat("Ingredients"); setFAmt(""); setFDate(todayStr()); setFDesc(""); setFRec(false); setFFreq("Monthly"); }
    setShowExpModal(true);
  };
  const openLoanForm = () => { setFormErr(""); setLName(""); setLTotal(""); setLPaid("0"); setLRate(""); setLDue(""); setLNotes(""); setShowLoanModal(true); };
  const openPayForm = (lid) => { setFormErr(""); setPayLoanId(lid); setPAmt(""); setPDate(todayStr()); setPMethod("Cash"); setShowPayModal(true); };
  const openBgtForm = () => { setFormErr(""); setBgtEdits({...budgets}); setShowBgtModal(true); };
  const openIncForm = () => { setFormErr(""); setIAmt(""); setICat("Sales"); setIDate(todayStr()); setINote(""); setShowIncModal(true); };

  const handlePrint = () => { window.print(); };
  const toggleSort = (key) => setExpSort(s => s.key === key ? {...s, asc:!s.asc} : {key, asc:true});
  const SortIcon = ({ k }) => expSort.key === k ? (expSort.asc ? <ChevronUp size={12}/> : <ChevronDown size={12}/>) : <ChevronDown size={12} className="opacity-30"/>;

  const scrollTo = (id) => { document.getElementById(id)?.scrollIntoView({ behavior:"smooth", block:"start" }); setActiveNav(id); };

  // ── Intersection observer for active nav ──
  useEffect(() => {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) setActiveNav(e.target.id); });
    }, { threshold: 0.2, rootMargin: "-80px 0px -60% 0px" });
    SECTIONS.forEach(s => { const el = document.getElementById(s.id); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, [loading]);

  const logout = () => { localStorage.clear(); setExpired(true); };

  // ── Expired / no token ──
  if (expired) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-lg p-10 text-center max-w-sm">
          <AlertTriangle size={48} className="text-amber-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Session expired</h2>
          <p className="text-gray-500 mb-6">Please log in again.</p>
          <button onClick={logout} className="bg-violet-600 text-white px-6 py-2.5 rounded-xl font-semibold hover:bg-violet-700 transition flex items-center gap-2 mx-auto">
            <LogOut size={16} /> Log out
          </button>
        </div>
      </div>
    );
  }

  const visibleSections = SECTIONS.filter(s => !s.ownerOnly || isOwner);

  // ══════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════
  return (
    <div className="flex min-h-screen bg-gray-50 print:block">
      {/* ── SIDEBAR ── */}
      <aside className="fixed top-0 left-0 w-60 h-screen bg-white border-r border-gray-200 flex flex-col z-40 print:hidden">
        <div className="px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-violet-600 flex items-center justify-center"><Landmark size={18} className="text-white" /></div>
            <div><div className="font-extrabold text-gray-900 text-base">The Bill</div><div className="text-[11px] text-gray-400 font-medium">Finance Panel</div></div>
          </div>
        </div>
        <nav className="flex-1 py-3 px-3 space-y-0.5 overflow-y-auto">
          {visibleSections.map(s => {
            const Icon = s.icon;
            const active = activeNav === s.id;
            return (
              <button key={s.id} onClick={()=>scrollTo(s.id)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${active ? "bg-violet-50 text-violet-700" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"}`}>
                <Icon size={16} className={active ? "text-violet-600" : "text-gray-400"} />
                {s.label}
              </button>
            );
          })}
        </nav>
        <div className="p-3 border-t border-gray-100">
          <button onClick={logout} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-500 hover:bg-red-50 hover:text-red-600 transition">
            <LogOut size={16} /> Logout
          </button>
        </div>
      </aside>

      {/* ── MAIN CONTENT ── */}
      <main className="ml-60 flex-1 print:ml-0">
        {/* Sticky header */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-gray-200 px-8 py-4 print:hidden">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-xl font-extrabold text-gray-900">Finance &mdash; Accounting & Insights</h1>
              {usingSeed && <span className="text-xs text-amber-600 font-medium bg-amber-50 px-2 py-0.5 rounded-full">Demo data (API unavailable)</span>}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {["today","week","month","custom"].map(t => (
                <button key={t} onClick={()=>setPeriodType(t)} className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${periodType===t ? "bg-violet-600 text-white shadow-sm" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                  {t === "today" ? "Today" : t === "week" ? "This Week" : t === "month" ? "This Month" : "Custom Range"}
                </button>
              ))}
              {periodType === "custom" && (
                <div className="flex items-center gap-2">
                  <input type="date" value={customStart} onChange={e=>setCustomStart(e.target.value)} className="border border-gray-200 rounded-xl px-3 py-2 text-sm" />
                  <span className="text-gray-400">&rarr;</span>
                  <input type="date" value={customEnd} onChange={e=>setCustomEnd(e.target.value)} className="border border-gray-200 rounded-xl px-3 py-2 text-sm" />
                  <button onClick={applyCustom} className="bg-violet-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-violet-700 flex items-center gap-1"><Filter size={14} /> Filter</button>
                </div>
              )}
              <button onClick={handlePrint} className="bg-gray-900 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-gray-800 flex items-center gap-2 ml-2">
                <Printer size={14} /> Export Report
              </button>
            </div>
          </div>
          <div className="text-xs text-gray-400 mt-1 flex items-center gap-1"><Calendar size={12} /> {start} &rarr; {end}</div>
        </header>

        <div className="px-8 py-6 max-w-7xl space-y-10" ref={printRef}>

          {/* ═══ SECTION 1: PROFIT & LOSS ═══ */}
          <section id="profit-loss">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2 border-b border-gray-200 pb-3">
              <TrendingUp size={20} className="text-violet-600" /> Profit & Loss
            </h2>
            {loading ? <SectionSkeleton /> : (
              <>
                <div className="grid grid-cols-4 gap-4 mb-6">
                  {[
                    { label:"Revenue", value:money(f.current.total_revenue), color:GN, icon:TrendingUp, change:pctStr(f.current.total_revenue, f.previous.total_revenue) },
                    { label:"Expenses", value:money(f.current.total_expenses), color:RD, icon:TrendingDown, change:pctStr(f.current.total_expenses, f.previous.total_expenses) },
                    { label:"Net Profit", value:money(f.current.net_profit), color:f.current.net_profit>=0?GN:RD, icon:f.current.net_profit>=0?TrendingUp:TrendingDown, change:pctStr(f.current.net_profit, f.previous.net_profit) },
                    { label:"Profit Margin", value:`${f.current.profit_margin}%`, color:P, icon:Percent, change:`${(f.current.profit_margin - f.previous.profit_margin).toFixed(1)}pp` },
                  ].map(c => {
                    const Icon = c.icon;
                    return (
                      <div key={c.label} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm" style={{ borderTopWidth:3, borderTopColor:c.color }}>
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3" style={{ backgroundColor: c.color+"15" }}><Icon size={18} style={{ color:c.color }} /></div>
                        <div className="text-xs font-semibold text-gray-500 mb-1">{c.label}</div>
                        <div className="text-xl font-extrabold" style={{ color:c.color }}>{c.value}</div>
                        <div className="text-xs mt-1 text-gray-400">vs prev: <span className="font-semibold">{c.change}</span></div>
                      </div>
                    );
                  })}
                </div>
                {/* Comparison table */}
                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-gray-50 text-gray-500 text-xs font-semibold"><th className="px-4 py-3 text-left">Metric</th><th className="px-4 py-3 text-right">Current</th><th className="px-4 py-3 text-right">Previous</th><th className="px-4 py-3 text-right">Change</th></tr></thead>
                    <tbody>
                      {[
                        { m:"Revenue", cur:f.current.total_revenue, prev:f.previous.total_revenue },
                        { m:"Expenses", cur:f.current.total_expenses, prev:f.previous.total_expenses },
                        { m:"Net Profit", cur:f.current.net_profit, prev:f.previous.net_profit },
                      ].map(r => (
                        <tr key={r.m} className="border-t border-gray-50 hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-700">{r.m}</td>
                          <td className="px-4 py-3 text-right font-semibold">{money(r.cur)}</td>
                          <td className="px-4 py-3 text-right text-gray-500">{money(r.prev)}</td>
                          <td className="px-4 py-3 text-right font-semibold" style={{ color: r.m==="Expenses" ? (r.cur<=r.prev?GN:RD) : (r.cur>=r.prev?GN:RD) }}>{pctStr(r.cur, r.prev)}</td>
                        </tr>
                      ))}
                      <tr className="border-t border-gray-200 bg-gray-50">
                        <td className="px-4 py-3 font-bold text-gray-700">Margin</td>
                        <td className="px-4 py-3 text-right font-bold">{f.current.profit_margin}%</td>
                        <td className="px-4 py-3 text-right text-gray-500">{f.previous.profit_margin}%</td>
                        <td className="px-4 py-3 text-right font-bold" style={{ color:f.current.profit_margin>=f.previous.profit_margin?GN:RD }}>{(f.current.profit_margin-f.previous.profit_margin).toFixed(1)}pp</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>

          {/* ═══ SECTION 2: REVENUE BREAKDOWN ═══ */}
          <section id="revenue">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2 border-b border-gray-200 pb-3">
              <BarChart3 size={20} className="text-violet-600" /> Revenue Breakdown
            </h2>
            {loading ? <SectionSkeleton /> : (
              <>
                <div className="grid grid-cols-3 gap-6 mb-6">
                  {/* By Payment */}
                  <div>
                    <div className="text-xs font-bold text-gray-500 mb-3 flex items-center gap-1"><CreditCard size={13}/> BY PAYMENT</div>
                    {[{k:"cash",l:"Cash",icon:Banknote,c:GN},{k:"card",l:"Card",icon:CreditCard,c:BL},{k:"qr",l:"QR/Online",icon:QrCode,c:P}].map(({k,l,c})=>{
                      const val = f.revenue_by_payment?.[k]||0; const pct = f.current.total_revenue>0?(val/f.current.total_revenue*100):0;
                      return <div key={k} className="mb-3"><div className="flex justify-between text-xs mb-1"><span className="text-gray-600">{l}</span><span className="font-semibold text-gray-900">{money(val)} ({pct.toFixed(0)}%)</span></div><BarDiv pct={pct} color={c} /></div>;
                    })}
                  </div>
                  {/* By Order Type */}
                  <div>
                    <div className="text-xs font-bold text-gray-500 mb-3 flex items-center gap-1"><UtensilsCrossed size={13}/> BY ORDER TYPE</div>
                    {[{k:"dine_in",l:"Dine-In",c:AM},{k:"takeaway",l:"To-Go",c:CY},{k:"delivery",l:"Delivery",c:PK}].map(({k,l,c})=>{
                      const val = f.revenue_by_order_type?.[k]||0; const pct = f.current.total_revenue>0?(val/f.current.total_revenue*100):0;
                      return <div key={k} className="mb-3"><div className="flex justify-between text-xs mb-1"><span className="text-gray-600">{l}</span><span className="font-semibold text-gray-900">{money(val)} ({pct.toFixed(0)}%)</span></div><BarDiv pct={pct} color={c} /></div>;
                    })}
                  </div>
                  {/* Category breakdown */}
                  <div>
                    <div className="text-xs font-bold text-gray-500 mb-3 flex items-center gap-1"><Receipt size={13}/> BY EXPENSE CATEGORY</div>
                    {(f.expense_by_category||[]).filter(c=>c.total>0).slice(0,5).map(c=>{
                      const pct = f.current.total_expenses>0?(c.total/f.current.total_expenses*100):0;
                      return <div key={c.category} className="mb-3"><div className="flex justify-between text-xs mb-1"><span className="text-gray-600">{c.category}</span><span className="font-semibold text-gray-900">{money(c.total)} ({pct.toFixed(0)}%)</span></div><BarDiv pct={pct} color={RD} /></div>;
                    })}
                  </div>
                </div>
                {/* Time + DOW charts side by side */}
                <div className="grid grid-cols-2 gap-6">
                  {/* Time of Day */}
                  <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                    <div className="text-xs font-bold text-gray-500 mb-4 flex items-center gap-1"><Clock size={13}/> BY TIME OF DAY</div>
                    <div className="flex items-end gap-6 h-36">
                      {[{k:"morning",l:"Morning",sub:"06-12",icon:Sun},{k:"afternoon",l:"Afternoon",sub:"12-17",icon:Coffee},{k:"evening",l:"Evening",sub:"17-23",icon:Moon}].map(({k,l,sub,icon:Ic})=>{
                        const val = f.revenue_by_time?.[k]||0; const mx = Math.max(...Object.values(f.revenue_by_time||{morning:0,afternoon:0,evening:0})); const pct = mx>0?(val/mx*100):0;
                        return (
                          <div key={k} className="flex-1 flex flex-col items-center">
                            <span className="text-[10px] font-bold text-gray-900 mb-1">{money(val)}</span>
                            <div className="w-full rounded-t-lg transition-all duration-300" style={{ height:`${pct}%`, minHeight:4, backgroundColor:P }} />
                            <Ic size={14} className="text-gray-400 mt-2" />
                            <span className="text-[10px] text-gray-500 mt-0.5">{l}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  {/* Day of Week */}
                  <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                    <div className="text-xs font-bold text-gray-500 mb-4 flex items-center gap-1"><Calendar size={13}/> BY DAY OF WEEK</div>
                    <div className="flex items-end gap-2 h-36">
                      {SHORT_DAYS.map(d=>{
                        const data = f.revenue_by_dow?.[d] || {total:0,count:0};
                        const mx = Math.max(...SHORT_DAYS.map(dd=>(f.revenue_by_dow?.[dd]?.total||0)));
                        const pct = mx>0?(data.total/mx*100):0;
                        const best = bestDow.day === d;
                        return (
                          <div key={d} className="flex-1 flex flex-col items-center">
                            {best && <Star size={10} className="text-amber-500 mb-0.5" />}
                            <span className="text-[9px] font-bold text-gray-900 mb-1">{data.total>0?`${(data.total/1000000).toFixed(1)}M`:"0"}</span>
                            <div className="w-full rounded-t-lg transition-all duration-300" style={{ height:`${pct}%`, minHeight:4, backgroundColor:best?AM:P }} />
                            <span className={`text-[10px] mt-2 ${best?"font-bold text-amber-600":"text-gray-500"}`}>{d}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </>
            )}
          </section>

          {/* ═══ SECTION 3: CASH FLOW ═══ */}
          <section id="cash-flow">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2 border-b border-gray-200 pb-3">
              <ArrowLeftRight size={20} className="text-violet-600" /> Cash Flow
            </h2>
            {loading ? <SectionSkeleton /> : (
              <>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  {[
                    { l:"Cash In", v:f.daily_cash_flow?.reduce((a,d)=>a+d.cash_in,0)||0, c:GN, icon:ArrowDownLeft },
                    { l:"Cash Out", v:f.daily_cash_flow?.reduce((a,d)=>a+d.cash_out,0)||0, c:RD, icon:ArrowUpRight },
                    { l:"Net Balance", v:(f.daily_cash_flow?.reduce((a,d)=>a+d.cash_in,0)||0)-(f.daily_cash_flow?.reduce((a,d)=>a+d.cash_out,0)||0), c:P, icon:Scale },
                  ].map(c=>{const Icon=c.icon;return(
                    <div key={c.l} className="bg-white rounded-2xl border-l-4 border border-gray-100 p-4 shadow-sm" style={{borderLeftColor:c.c}}>
                      <div className="flex items-center gap-2 text-xs text-gray-500 mb-1"><Icon size={14} style={{color:c.c}}/>{c.l}</div>
                      <div className="text-lg font-bold" style={{color:c.c}}>{money(c.v)}</div>
                    </div>
                  );})}
                </div>
                {(f.daily_cash_flow||[]).some(d=>d.balance<0) && (
                  <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 text-sm text-amber-800 font-medium">
                    <AlertTriangle size={16} className="text-amber-500" /> Cash flow went negative during this period
                  </div>
                )}
                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm mb-4">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-gray-50 text-xs text-gray-500 font-semibold"><th className="px-4 py-3 text-left">Date</th><th className="px-4 py-3 text-right text-emerald-600">Cash In</th><th className="px-4 py-3 text-right text-red-500">Cash Out</th><th className="px-4 py-3 text-right">Net</th><th className="px-4 py-3 text-right">Balance</th></tr></thead>
                    <tbody>
                      {(f.daily_cash_flow||[]).map(d=>(
                        <tr key={d.date} className={`border-t border-gray-50 hover:bg-gray-50 ${d.balance<0?"bg-red-50":""}`}>
                          <td className="px-4 py-2.5 text-gray-700">{d.date}</td>
                          <td className="px-4 py-2.5 text-right text-emerald-600 font-medium">+{money(d.cash_in)}</td>
                          <td className="px-4 py-2.5 text-right text-red-500 font-medium">{d.cash_out>0?`-${money(d.cash_out)}`:`${money(0)}`}</td>
                          <td className="px-4 py-2.5 text-right font-medium" style={{color:d.net>=0?GN:RD}}>{money(d.net)}</td>
                          <td className={`px-4 py-2.5 text-right font-bold ${d.balance<0?"text-red-600":"text-gray-900"}`}>{money(d.balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>

          {/* ═══ SECTION 4: EXPENSE MANAGER ═══ */}
          <section id="expenses">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3 mb-4">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2"><Receipt size={20} className="text-violet-600" /> Expense Manager</h2>
              <button onClick={()=>openExpForm(null)} className="bg-violet-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-violet-700 flex items-center gap-1.5"><Plus size={14}/> Add Expense</button>
            </div>
            {loading ? <SectionSkeleton /> : (
              <>
                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm mb-6">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-gray-50 text-xs text-gray-500 font-semibold">
                      <th className="px-4 py-3 text-left cursor-pointer select-none" onClick={()=>toggleSort("date")}><span className="flex items-center gap-1">Date <SortIcon k="date"/></span></th>
                      <th className="px-4 py-3 text-left cursor-pointer select-none" onClick={()=>toggleSort("category")}><span className="flex items-center gap-1">Category <SortIcon k="category"/></span></th>
                      <th className="px-4 py-3 text-left">Description</th>
                      <th className="px-4 py-3 text-right cursor-pointer select-none" onClick={()=>toggleSort("amount")}><span className="flex items-center gap-1 justify-end">Amount <SortIcon k="amount"/></span></th>
                      <th className="px-4 py-3 text-center">Recurring</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr></thead>
                    <tbody>
                      {filtExpenses.map(e=>(
                        <tr key={e.id} className="border-t border-gray-50 hover:bg-gray-50">
                          <td className="px-4 py-2.5 text-gray-600">{(e.date||"").split("T")[0]}</td>
                          <td className="px-4 py-2.5"><span className="inline-flex items-center gap-1 bg-violet-50 text-violet-700 px-2 py-0.5 rounded-lg text-xs font-semibold">{e.category}</span></td>
                          <td className="px-4 py-2.5 text-gray-700">{e.description}</td>
                          <td className="px-4 py-2.5 text-right font-bold text-red-500">{money(e.amount)}</td>
                          <td className="px-4 py-2.5 text-center">{e.recurring ? <span className="inline-flex items-center gap-1 text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-lg"><Repeat size={10}/>{e.frequency}</span> : <span className="text-gray-300">-</span>}</td>
                          <td className="px-4 py-2.5 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={()=>openExpForm(e)} className="p-1.5 rounded-lg hover:bg-gray-100"><Edit size={14} className="text-gray-400"/></button>
                              <button onClick={()=>deleteExpense(e.id)} className="p-1.5 rounded-lg hover:bg-red-50"><Trash2 size={14} className="text-gray-400 hover:text-red-500"/></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {filtExpenses.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No expenses for this period</td></tr>}
                    </tbody>
                  </table>
                </div>
                {/* Category cards */}
                <div className="grid grid-cols-4 gap-3">
                  {CATS.filter(c=>expCatMap[c]>0).map(c=>{const Icon=CAT_ICONS[c];const pct=f.current.total_expenses>0?(expCatMap[c]/f.current.total_expenses*100):0;return(
                    <div key={c} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                      <div className="flex items-center gap-2 mb-2"><div className="w-7 h-7 rounded-lg bg-violet-50 flex items-center justify-center"><Icon size={14} className="text-violet-600"/></div><span className="text-sm font-semibold text-gray-700">{c}</span></div>
                      <div className="text-base font-bold text-red-500">{money(expCatMap[c])}</div>
                      <div className="text-xs text-gray-400">{pct.toFixed(0)}% of total</div>
                      <div className="mt-2"><BarDiv pct={pct} color={RD}/></div>
                    </div>
                  );})}
                </div>
              </>
            )}
          </section>

          {/* ═══ SECTION 5: BUDGET VS ACTUAL ═══ */}
          <section id="budget">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3 mb-4">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2"><Target size={20} className="text-violet-600" /> Budget vs Actual</h2>
              <button onClick={openBgtForm} className="bg-gray-100 text-gray-700 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-gray-200 flex items-center gap-1.5"><Edit size={14}/> Set Budget</button>
            </div>
            {loading ? <SectionSkeleton /> : (
              <>
                <div className="flex gap-6 mb-4">
                  <div><div className="text-xs text-gray-500">Total Budget</div><div className="text-xl font-extrabold text-gray-900">{money(totBgt)}</div></div>
                  <div><div className="text-xs text-gray-500">Actual Spent</div><div className="text-xl font-extrabold" style={{color:f.current.total_expenses>totBgt?RD:"#111827"}}>{money(f.current.total_expenses)}</div></div>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-gray-50 text-xs text-gray-500 font-semibold"><th className="px-4 py-3 text-left">Category</th><th className="px-4 py-3 text-right">Budget</th><th className="px-4 py-3 text-right">Actual</th><th className="px-4 py-3 text-right">Remaining</th><th className="px-4 py-3 w-48">Progress</th></tr></thead>
                    <tbody>
                      {CATS.map(c=>{const b=Number(budgets[c])||0;const a=expCatMap[c]||0;const rem=b-a;const pct=b>0?(a/b*100):0;const clr=pct>=100?RD:pct>=75?AM:GN;return(
                        <tr key={c} className="border-t border-gray-50 hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-700 flex items-center gap-2">{React.createElement(CAT_ICONS[c],{size:14,className:"text-violet-500"})}{c}{pct>=100&&<span className="text-[10px] bg-red-100 text-red-600 font-bold px-1.5 py-0.5 rounded">OVER</span>}</td>
                          <td className="px-4 py-3 text-right text-gray-600">{money(b)}</td>
                          <td className="px-4 py-3 text-right font-semibold">{money(a)}</td>
                          <td className="px-4 py-3 text-right font-semibold" style={{color:rem>=0?GN:RD}}>{rem>=0?money(rem):`-${money(Math.abs(rem))}`}</td>
                          <td className="px-4 py-3"><BarDiv pct={Math.min(pct,100)} color={clr}/><div className="text-[10px] text-gray-400 mt-0.5">{pct.toFixed(0)}% used</div></td>
                        </tr>
                      );})}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>

          {/* ═══ SECTION 6: TAX SUMMARY ═══ */}
          <section id="tax">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2 border-b border-gray-200 pb-3">
              <FileText size={20} className="text-violet-600" /> Tax Summary
            </h2>
            {loading ? <SectionSkeleton /> : (
              <div className="grid grid-cols-2 gap-6">
                <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm space-y-3">
                  {[
                    { l:"Tax Rate", v:`${((f.tax?.rate||0.12)*100).toFixed(0)}%` },
                    { l:"Total Revenue", v:money(f.current.total_revenue) },
                    { l:"Tax Collected", v:money(f.tax?.tax_collected||0), c:RD },
                    { l:"Service Charge (5%)", v:money(f.tax?.service_charge||0) },
                  ].map(r=>(
                    <div key={r.l} className="flex justify-between py-1.5 border-b border-gray-50 last:border-0">
                      <span className="text-sm text-gray-600">{r.l}</span>
                      <span className="text-sm font-bold" style={{color:r.c||"#111827"}}>{r.v}</span>
                    </div>
                  ))}
                  <div className="flex justify-between pt-2 border-t-2 border-gray-200">
                    <span className="text-sm font-bold text-gray-700">Est. Tax Payable</span>
                    <span className="text-base font-extrabold text-red-500">{money(f.tax?.tax_collected||0)}</span>
                  </div>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                  <div className="text-xs font-bold text-gray-500 mb-3 flex items-center gap-1"><Clock size={13}/> MONTHLY TAX HISTORY</div>
                  <div className="space-y-2">
                    {taxHistory.map(h=>(
                      <div key={h.month} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
                        <span className="text-sm text-gray-600">{h.month_label}</span>
                        <div className="text-right"><div className="text-xs text-gray-400">{money(h.revenue)} rev</div><div className="text-sm font-bold text-gray-900">{money(h.tax_collected)} tax</div></div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* ═══ SECTION 7: LOANS & DEBT ═══ */}
          {isOwner && (
            <section id="loans">
              <div className="flex items-center justify-between border-b border-gray-200 pb-3 mb-4">
                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2"><Landmark size={20} className="text-violet-600" /> Loans & Debt</h2>
                <button onClick={openLoanForm} className="bg-violet-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-violet-700 flex items-center gap-1.5"><Plus size={14}/> Add Loan</button>
              </div>
              {loading ? <SectionSkeleton /> : (
                <>
                  <div className="mb-4">
                    <div className="text-xs text-gray-500">Total Outstanding</div>
                    <div className="text-2xl font-extrabold text-gray-900">{money(loans.reduce((a,l)=>a+(Number(l.total_amount)-Number(l.amount_paid)),0))}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {loans.map(l=>{
                      const rem=Number(l.total_amount)-Number(l.amount_paid); const pct=Number(l.total_amount)>0?(Number(l.amount_paid)/Number(l.total_amount)*100):0;
                      const isOD=l.due_date&&new Date(l.due_date)<new Date()&&rem>0;
                      const paid=rem<=0;
                      const stC=paid?GN:isOD?RD:BL; const stLabel=paid?"Paid":isOD?"Overdue":"Active";
                      return(
                        <div key={l.id} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm" style={{borderLeftWidth:isOD?4:0,borderLeftColor:RD}}>
                          <div className="flex justify-between items-start mb-3">
                            <div className="flex items-center gap-2"><Users size={16} className="text-gray-500"/><span className="font-bold text-gray-900">{l.lender_name}</span></div>
                            <span className="text-xs font-bold px-2 py-1 rounded-lg" style={{backgroundColor:stC+"15",color:stC}}>{stLabel}</span>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-xs mb-3">
                            <div><span className="text-gray-500">Total</span><div className="font-bold text-gray-900">{money(l.total_amount)}</div></div>
                            <div><span className="text-gray-500">Paid</span><div className="font-bold text-emerald-600">{money(l.amount_paid)}</div></div>
                            <div><span className="text-gray-500">Remaining</span><div className="font-bold" style={{color:P}}>{money(rem)}</div></div>
                          </div>
                          <BarDiv pct={pct} color={stC} />
                          <div className="flex justify-between items-center mt-3 text-xs text-gray-500">
                            <span>Due: {l.due_date||"N/A"}{l.interest_rate>0?` | ${l.interest_rate}% interest`:""}</span>
                            <div className="flex gap-1">
                              {!paid && <button onClick={()=>openPayForm(l.id)} className="text-xs bg-violet-50 text-violet-700 px-3 py-1.5 rounded-lg font-semibold hover:bg-violet-100">Pay</button>}
                              <button onClick={()=>deleteLoan(l.id)} className="p-1.5 rounded-lg hover:bg-red-50"><Trash2 size={13} className="text-gray-400 hover:text-red-500"/></button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {loans.length===0&&<div className="col-span-2 text-center py-8 text-gray-400">No loans recorded</div>}
                  </div>
                </>
              )}
            </section>
          )}

          {/* ═══ SECTION 8: PAYROLL SUMMARY ═══ */}
          {isOwner && (
            <section id="payroll">
              <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2 border-b border-gray-200 pb-3">
                <Users size={20} className="text-violet-600" /> Payroll Summary
              </h2>
              {loading ? <SectionSkeleton /> : (
                <>
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
                      <div className="text-xs text-gray-500 mb-1">Total Payroll Cost</div>
                      <div className="text-xl font-extrabold text-gray-900">{money(totPay)}</div>
                    </div>
                    <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
                      <div className="text-xs text-gray-500 mb-1">% of Revenue</div>
                      <div className="text-xl font-extrabold" style={{color:P}}>{f.current.total_revenue>0?(totPay/f.current.total_revenue*100).toFixed(1):"0"}%</div>
                    </div>
                    <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
                      <div className="text-xs text-gray-500 mb-1">Total Staff</div>
                      <div className="text-xl font-extrabold text-gray-900">{(f.payroll||[]).reduce((a,r)=>a+r.staff_count,0)}</div>
                    </div>
                  </div>
                  <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                    {(f.payroll||[]).map(r=>{const pct=totPay>0?(r.total_cost/totPay*100):0;return(
                      <div key={r.role} className="mb-4 last:mb-0">
                        <div className="flex justify-between text-sm mb-1.5">
                          <span className="font-medium text-gray-700">{r.role} ({r.staff_count} staff)</span>
                          <span className="font-bold text-gray-900">{money(r.total_cost)}</span>
                        </div>
                        <BarDiv pct={pct} color={P} h={10} />
                      </div>
                    );})}
                  </div>
                </>
              )}
            </section>
          )}

          {/* ═══ SECTION 9: BUSINESS INSIGHTS ═══ */}
          <section id="insights">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2 border-b border-gray-200 pb-3">
              <Lightbulb size={20} className="text-violet-600" /> Business Insights
            </h2>
            {loading ? <SectionSkeleton /> : (
              <div className="grid grid-cols-3 gap-4">
                {[
                  { icon:Calendar, l:"Best Day of Week", v:`${bestDow.day} (avg ${money(Math.round(bestDow.avg))})` },
                  { icon:Clock, l:"Best Time of Day", v:bestTime.k ? bestTime.k.charAt(0).toUpperCase()+bestTime.k.slice(1) : "N/A" },
                  { icon:TrendingUp, l:"Avg Daily Revenue", v:money(avgDaily) },
                  { icon:Activity, l:"Revenue Trend", v: f.current.total_revenue>f.previous.total_revenue*1.02?"Growing":f.current.total_revenue<f.previous.total_revenue*0.98?"Declining":"Stable" },
                  { icon:Star, l:"Period Revenue", v:money(f.current.total_revenue) },
                  { icon:PiggyBank, l:"Total Savings", v:money(f.current.net_profit) },
                ].map(item=>{const Icon=item.icon;return(
                  <div key={item.l} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm flex items-center gap-4">
                    <div className="w-11 h-11 rounded-xl bg-violet-50 flex items-center justify-center flex-shrink-0"><Icon size={20} className="text-violet-600"/></div>
                    <div><div className="text-xs text-gray-500">{item.l}</div><div className="text-sm font-bold text-gray-900 mt-0.5">{item.v}</div></div>
                  </div>
                );})}
              </div>
            )}
          </section>

        </div>
      </main>

      {/* ═══ MODALS ═══ */}

      {/* Expense Modal */}
      <Modal open={showExpModal} onClose={()=>{setShowExpModal(false);setEditExp(null);}} title={editExp?"Edit Expense":"Add Expense"}>
        {formErr && <div className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2 mb-3">{formErr}</div>}
        <div className="space-y-3">
          <div><label className="text-xs font-semibold text-gray-500 mb-1 block">Category</label><div className="flex flex-wrap gap-2">{CATS.map(c=><button key={c} onClick={()=>setFCat(c)} className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${fCat===c?"bg-violet-600 text-white":"bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>{c}</button>)}</div></div>
          <div><label className="text-xs font-semibold text-gray-500 mb-1 block">Amount (so'm)</label><NumInput value={fAmt} onChange={setFAmt} placeholder="Enter amount" className="w-full" /></div>
          <div><label className="text-xs font-semibold text-gray-500 mb-1 block">Date</label><input type="date" value={fDate} onChange={e=>setFDate(e.target.value)} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm" /></div>
          <div><label className="text-xs font-semibold text-gray-500 mb-1 block">Description</label><input type="text" value={fDesc} onChange={e=>setFDesc(e.target.value)} placeholder="Enter description" className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm" /></div>
          <div className="flex items-center justify-between"><span className="text-sm text-gray-600">Recurring</span><button onClick={()=>setFRec(!fRec)} className={`w-10 h-5 rounded-full transition ${fRec?"bg-violet-600":"bg-gray-300"}`}><div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${fRec?"translate-x-5":"translate-x-0.5"}`}/></button></div>
          {fRec && <div className="flex gap-2">{["Daily","Weekly","Monthly"].map(fr=><button key={fr} onClick={()=>setFFreq(fr)} className={`px-3 py-1.5 rounded-xl text-xs font-semibold ${fFreq===fr?"bg-violet-600 text-white":"bg-gray-100 text-gray-600"}`}>{fr}</button>)}</div>}
          <button onClick={saveExpense} className="w-full bg-violet-600 text-white py-3 rounded-xl font-bold hover:bg-violet-700 transition mt-2">Save</button>
        </div>
      </Modal>

      {/* Loan Modal */}
      <Modal open={showLoanModal} onClose={()=>setShowLoanModal(false)} title="Add Loan">
        {formErr && <div className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2 mb-3">{formErr}</div>}
        <div className="space-y-3">
          <div><label className="text-xs font-semibold text-gray-500 mb-1 block">Lender Name</label><input type="text" value={lName} onChange={e=>setLName(e.target.value)} placeholder="Enter lender name" className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm" /></div>
          <div><label className="text-xs font-semibold text-gray-500 mb-1 block">Total Amount</label><NumInput value={lTotal} onChange={setLTotal} placeholder="Enter total" className="w-full" /></div>
          <div><label className="text-xs font-semibold text-gray-500 mb-1 block">Already Paid</label><NumInput value={lPaid} onChange={setLPaid} placeholder="0" className="w-full" /></div>
          <div><label className="text-xs font-semibold text-gray-500 mb-1 block">Interest Rate %</label><input type="number" value={lRate} onChange={e=>setLRate(e.target.value)} placeholder="0" className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm" /></div>
          <div><label className="text-xs font-semibold text-gray-500 mb-1 block">Due Date</label><input type="date" value={lDue} onChange={e=>setLDue(e.target.value)} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm" /></div>
          <div><label className="text-xs font-semibold text-gray-500 mb-1 block">Notes</label><input type="text" value={lNotes} onChange={e=>setLNotes(e.target.value)} placeholder="Add notes" className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm" /></div>
          <button onClick={saveLoan} className="w-full bg-violet-600 text-white py-3 rounded-xl font-bold hover:bg-violet-700 transition mt-2">Save</button>
        </div>
      </Modal>

      {/* Payment Modal */}
      <Modal open={showPayModal} onClose={()=>setShowPayModal(false)} title="Make Payment">
        {formErr && <div className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2 mb-3">{formErr}</div>}
        <div className="space-y-3">
          <div><label className="text-xs font-semibold text-gray-500 mb-1 block">Amount</label><NumInput value={pAmt} onChange={setPAmt} placeholder="Enter amount" className="w-full" /></div>
          <div><label className="text-xs font-semibold text-gray-500 mb-1 block">Date</label><input type="date" value={pDate} onChange={e=>setPDate(e.target.value)} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm" /></div>
          <div><label className="text-xs font-semibold text-gray-500 mb-1 block">Method</label><div className="flex gap-2">{["Cash","Bank Transfer","Card"].map(m=><button key={m} onClick={()=>setPMethod(m)} className={`px-3 py-1.5 rounded-xl text-xs font-semibold ${pMethod===m?"bg-violet-600 text-white":"bg-gray-100 text-gray-600"}`}>{m}</button>)}</div></div>
          <button onClick={savePayment} className="w-full bg-violet-600 text-white py-3 rounded-xl font-bold hover:bg-violet-700 transition mt-2">Save Payment</button>
        </div>
      </Modal>

      {/* Budget Modal */}
      <Modal open={showBgtModal} onClose={()=>setShowBgtModal(false)} title="Set Monthly Budget">
        {formErr && <div className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2 mb-3">{formErr}</div>}
        <div className="space-y-3">
          {CATS.map(c=><div key={c}><label className="text-xs font-semibold text-gray-500 mb-1 block">{c}</label><NumInput value={String(bgtEdits[c]||"")} onChange={v=>setBgtEdits(p=>({...p,[c]:v}))} placeholder="0" className="w-full" /></div>)}
          <button onClick={saveBudget} className="w-full bg-violet-600 text-white py-3 rounded-xl font-bold hover:bg-violet-700 transition mt-2">Save Budget</button>
        </div>
      </Modal>

      {/* Income Modal */}
      <Modal open={showIncModal} onClose={()=>setShowIncModal(false)} title="Add Manual Income">
        {formErr && <div className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2 mb-3">{formErr}</div>}
        <div className="space-y-3">
          <div><label className="text-xs font-semibold text-gray-500 mb-1 block">Amount (so'm)</label><NumInput value={iAmt} onChange={setIAmt} placeholder="Enter amount" className="w-full" /></div>
          <div><label className="text-xs font-semibold text-gray-500 mb-1 block">Category</label><div className="flex gap-2">{INC_CATS.map(c=><button key={c} onClick={()=>setICat(c)} className={`px-3 py-1.5 rounded-xl text-xs font-semibold ${iCat===c?"bg-violet-600 text-white":"bg-gray-100 text-gray-600"}`}>{c}</button>)}</div></div>
          <div><label className="text-xs font-semibold text-gray-500 mb-1 block">Date</label><input type="date" value={iDate} onChange={e=>setIDate(e.target.value)} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm" /></div>
          <div><label className="text-xs font-semibold text-gray-500 mb-1 block">Note</label><input type="text" value={iNote} onChange={e=>setINote(e.target.value)} placeholder="Optional note" className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm" /></div>
          <button onClick={saveIncome} className="w-full bg-violet-600 text-white py-3 rounded-xl font-bold hover:bg-violet-700 transition mt-2">Save</button>
        </div>
      </Modal>

      {/* ═══ PRINT STYLES ═══ */}
      <style>{`
        @media print {
          body { background: white !important; font-size: 11px; }
          .print\\:hidden { display: none !important; }
          .print\\:block { display: block !important; }
          .print\\:ml-0 { margin-left: 0 !important; }
          section { break-inside: avoid; page-break-inside: avoid; margin-bottom: 20px; }
          table { font-size: 10px; }
          .shadow-sm, .shadow-lg, .shadow-2xl { box-shadow: none !important; }
          .rounded-2xl { border-radius: 8px !important; }
        }
      `}</style>
    </div>
  );
}

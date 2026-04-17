import { useState, useEffect, useRef } from "react";
import {
  Plus, X, Eye, EyeOff, Clock, Calendar, Settings,
  Edit2, Trash2, CheckCircle, AlertTriangle,
  ChevronDown, Download, ArrowLeft, Phone,
  Shield, MoreVertical, Banknote, Filter,
  UserCheck, UserX, ClipboardList, Users,
} from "lucide-react";

// ══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════════════════════
const ROLES = ["Waitress", "Kitchen", "Bar", "Cashier", "Cleaner"];
const SALARY_TYPES = ["Hourly", "Daily", "Weekly", "Monthly"];
const PAYMENT_METHODS = ["Cash", "Bank Transfer", "Card"];
const BONUS_REASONS = ["Best Performance", "Extra Shift", "Other"];

const ROLE_STYLE = {
  Waitress: { bg: "#dbeafe", color: "#1e40af" },
  Kitchen:  { bg: "#ffedd5", color: "#9a3412" },
  Bar:      { bg: "#f3e8ff", color: "#6b21a8" },
  Cashier:  { bg: "#dcfce7", color: "#166534" },
  Cleaner:  { bg: "#f1f5f9", color: "#475569" },
};

const RATE_LABEL = {
  Hourly:  "Hourly Rate (so'm)",
  Daily:   "Daily Rate (so'm)",
  Weekly:  "Weekly Rate (so'm)",
  Monthly: "Monthly Salary (so'm)",
};

// ══════════════════════════════════════════════════════════════════════════════
// SEED DATA
// Phone / Password reference (stored in comments only):
//   s1  Aisha Karimova:   +998901234567 / secret123
//   s2  Bobur Toshmatov:  +998912345678 / secret123
//   s3  Kamola Yusupova:  +998933456789 / secret123
//   s4  Jasur Nazarov:    +998944567890 / secret123
//   s5  Dilnoza Hamidova: +998955678901 / secret123
// ══════════════════════════════════════════════════════════════════════════════
const SEED_STAFF = [
  { id:"s1", name:"Aisha Karimova",   role:"Waitress", phone:"+998901234567", shiftStart:"09:00", shiftEnd:"18:00", salaryType:"Monthly", rate:1500000, status:"Active",    password:"secret123" },
  { id:"s2", name:"Bobur Toshmatov",  role:"Kitchen",  phone:"+998912345678", shiftStart:"08:00", shiftEnd:"18:00", salaryType:"Hourly",  rate:18000,   status:"Active",    password:"secret123" },
  { id:"s3", name:"Kamola Yusupova",  role:"Bar",      phone:"+998933456789", shiftStart:"12:00", shiftEnd:"22:00", salaryType:"Daily",   rate:90000,   status:"Active",    password:"secret123" },
  { id:"s4", name:"Jasur Nazarov",    role:"Cashier",  phone:"+998944567890", shiftStart:"09:00", shiftEnd:"18:00", salaryType:"Monthly", rate:1200000, status:"Suspended", password:"secret123" },
  { id:"s5", name:"Dilnoza Hamidova", role:"Cleaner",  phone:"+998955678901", shiftStart:"07:00", shiftEnd:"12:00", salaryType:"Daily",   rate:60000,   status:"Active",    password:"secret123" },
];

const SEED_ATTENDANCE = [
  // ── Mar 2 (Monday) ──
  { id:"a01", staffId:"s1", date:"2026-03-02", clockIn:"09:05", clockOut:"18:10", status:"on-time", lateMinutes:0,  hoursWorked:9.08, note:"" },
  { id:"a02", staffId:"s2", date:"2026-03-02", clockIn:"08:00", clockOut:"18:00", status:"on-time", lateMinutes:0,  hoursWorked:10,   note:"" },
  { id:"a03", staffId:"s3", date:"2026-03-02", clockIn:"12:15", clockOut:"22:05", status:"late",    lateMinutes:15, hoursWorked:9.83, note:"" },
  { id:"a04", staffId:"s4", date:"2026-03-02", clockIn:null,    clockOut:null,    status:"absent",  lateMinutes:0,  hoursWorked:0,    note:"Suspended" },
  { id:"a05", staffId:"s5", date:"2026-03-02", clockIn:"07:10", clockOut:"12:00", status:"late",    lateMinutes:10, hoursWorked:4.83, note:"" },
  // ── Mar 3 (Tuesday) ──
  { id:"a06", staffId:"s1", date:"2026-03-03", clockIn:"09:00", clockOut:"18:00", status:"on-time", lateMinutes:0,  hoursWorked:9,    note:"" },
  { id:"a07", staffId:"s2", date:"2026-03-03", clockIn:"08:22", clockOut:"18:05", status:"late",    lateMinutes:22, hoursWorked:9.72, note:"" },
  { id:"a08", staffId:"s3", date:"2026-03-03", clockIn:null,    clockOut:null,    status:"absent",  lateMinutes:0,  hoursWorked:0,    note:"Sick" },
  { id:"a09", staffId:"s4", date:"2026-03-03", clockIn:null,    clockOut:null,    status:"absent",  lateMinutes:0,  hoursWorked:0,    note:"Suspended" },
  { id:"a10", staffId:"s5", date:"2026-03-03", clockIn:"07:00", clockOut:"12:00", status:"on-time", lateMinutes:0,  hoursWorked:5,    note:"" },
  // ── Mar 4 (Wednesday) ──
  { id:"a11", staffId:"s1", date:"2026-03-04", clockIn:"09:35", clockOut:"18:30", status:"late",    lateMinutes:35, hoursWorked:8.92, note:"" },
  { id:"a12", staffId:"s2", date:"2026-03-04", clockIn:"08:00", clockOut:"18:00", status:"on-time", lateMinutes:0,  hoursWorked:10,   note:"" },
  { id:"a13", staffId:"s3", date:"2026-03-04", clockIn:"12:00", clockOut:"22:00", status:"on-time", lateMinutes:0,  hoursWorked:10,   note:"" },
  { id:"a14", staffId:"s4", date:"2026-03-04", clockIn:null,    clockOut:null,    status:"absent",  lateMinutes:0,  hoursWorked:0,    note:"Suspended" },
  { id:"a15", staffId:"s5", date:"2026-03-04", clockIn:"07:00", clockOut:"11:45", status:"on-time", lateMinutes:0,  hoursWorked:4.75, note:"" },
  // ── Mar 5 (Thursday) ──
  { id:"a16", staffId:"s1", date:"2026-03-05", clockIn:"09:00", clockOut:"18:00", status:"on-time", lateMinutes:0,  hoursWorked:9,    note:"" },
  { id:"a17", staffId:"s2", date:"2026-03-05", clockIn:null,    clockOut:null,    status:"absent",  lateMinutes:0,  hoursWorked:0,    note:"Personal day" },
  { id:"a18", staffId:"s3", date:"2026-03-05", clockIn:"12:00", clockOut:"22:00", status:"on-time", lateMinutes:0,  hoursWorked:10,   note:"" },
  { id:"a19", staffId:"s4", date:"2026-03-05", clockIn:null,    clockOut:null,    status:"absent",  lateMinutes:0,  hoursWorked:0,    note:"Suspended" },
  { id:"a20", staffId:"s5", date:"2026-03-05", clockIn:"07:05", clockOut:"12:00", status:"late",    lateMinutes:5,  hoursWorked:4.92, note:"" },
  // ── Mar 6 (Friday = today, some still clocked in) ──
  { id:"a21", staffId:"s1", date:"2026-03-06", clockIn:"09:03", clockOut:null,    status:"on-time", lateMinutes:0,  hoursWorked:null, note:"" },
  { id:"a22", staffId:"s2", date:"2026-03-06", clockIn:"08:25", clockOut:null,    status:"late",    lateMinutes:25, hoursWorked:null, note:"" },
  { id:"a23", staffId:"s3", date:"2026-03-06", clockIn:null,    clockOut:null,    status:"absent",  lateMinutes:0,  hoursWorked:0,    note:"" },
  { id:"a24", staffId:"s4", date:"2026-03-06", clockIn:null,    clockOut:null,    status:"absent",  lateMinutes:0,  hoursWorked:0,    note:"Suspended" },
  { id:"a25", staffId:"s5", date:"2026-03-06", clockIn:"07:00", clockOut:"12:00", status:"on-time", lateMinutes:0,  hoursWorked:5,    note:"" },
];

const SEED_BONUSES = [
  { id:"bon1", staffId:"s1", date:"2026-03-03", amount:100000, reason:"Best Performance", note:"Outstanding table service" },
  { id:"bon2", staffId:"s3", date:"2026-03-04", amount:50000,  reason:"Extra Shift",      note:"Covered Sunday shift" },
];

const SEED_PAYMENTS = [
  { id:"pmt1", staffId:"s1", periodFrom:"2026-02-01", periodTo:"2026-02-28", amount:1580000, method:"Bank Transfer", paymentDate:"2026-03-01" },
  { id:"pmt2", staffId:"s2", periodFrom:"2026-02-01", periodTo:"2026-02-28", amount:3240000, method:"Cash",          paymentDate:"2026-03-01" },
];

// ══════════════════════════════════════════════════════════════════════════════
// UTILITIES
// ══════════════════════════════════════════════════════════════════════════════
const TODAY = "2026-03-06";

function formatCurrency(n) {
  if (n == null || n === "") return "—";
  return Number(n).toLocaleString("ru-RU") + " so'm";
}

function maskPhone(phone) {
  if (!phone) return "—";
  const d = phone.replace(/\D/g, "");
  if (d.length < 9) return phone;
  return `+998 ${d.slice(3, 5)} *** ** ${d.slice(-2)}`;
}

function displayPhone(phone) {
  if (!phone) return "—";
  const d = phone.replace(/\D/g, "");
  if (d.length === 12) return `+${d.slice(0,3)} ${d.slice(3,5)} ${d.slice(5,8)} ${d.slice(8,10)} ${d.slice(10,12)}`;
  return phone;
}

function formatDate(s) {
  if (!s) return "—";
  const d = new Date(s + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" });
}

function parseTimeToMin(t) {
  if (!t) return 0;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function getWeekDates(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(d); mon.setDate(d.getDate() + diff);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  return { from: mon.toISOString().split("T")[0], to: sun.toISOString().split("T")[0] };
}

function getMonthDates(dateStr) {
  const [y, m] = dateStr.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${y}-${String(m).padStart(2,"0")}-01`, to: `${y}-${String(m).padStart(2,"0")}-${last}` };
}

function getDateRange(filter, today, customFrom, customTo) {
  if (filter === "today") return { from: today, to: today };
  if (filter === "week")  return getWeekDates(today);
  if (filter === "month") return getMonthDates(today);
  return { from: customFrom || today, to: customTo || today };
}

function getISOWeekKey(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const y = d.getFullYear();
  const start = new Date(y, 0, 1);
  const week = Math.ceil(((d - start) / 86400000 + start.getDay() + 1) / 7);
  return `${y}-W${week}`;
}

function countWorkingDays(from, to) {
  let count = 0;
  const d = new Date(from + "T00:00:00");
  const end = new Date(to + "T00:00:00");
  while (d <= end) { const day = d.getDay(); if (day !== 0 && day !== 6) count++; d.setDate(d.getDate() + 1); }
  return count;
}

function calcBaseSalary(salaryType, rate, periodAtt, periodFrom, periodTo) {
  const present = periodAtt.filter(r => r.status !== "absent");
  switch (salaryType) {
    case "Hourly": return Math.round(present.reduce((s, r) => s + (r.hoursWorked || 0), 0) * rate);
    case "Daily":  return present.length * rate;
    case "Weekly": return new Set(present.map(r => getISOWeekKey(r.date))).size * rate;
    case "Monthly": {
      const workDaysInPeriod = countWorkingDays(periodFrom, periodTo);
      const [y, m] = periodFrom.split("-").map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      const workDaysInMonth = countWorkingDays(`${y}-${String(m).padStart(2,"0")}-01`, `${y}-${String(m).padStart(2,"0")}-${lastDay}`);
      if (workDaysInPeriod >= workDaysInMonth) return rate;
      return Math.round((present.length / Math.max(1, workDaysInPeriod)) * Math.round(rate * workDaysInPeriod / workDaysInMonth));
    }
    default: return 0;
  }
}

function calcPayroll(member, attendance, bonuses, payments, settings, periodFrom, periodTo) {
  const periodAtt = attendance.filter(r => r.staffId === member.id && r.date >= periodFrom && r.date <= periodTo);
  const present   = periodAtt.filter(r => r.status !== "absent");
  const late      = periodAtt.filter(r => r.status === "late");
  const absent    = periodAtt.filter(r => r.status === "absent");
  const totalHours = present.reduce((s, r) => s + (r.hoursWorked || 0), 0);
  const baseSalary = calcBaseSalary(member.salaryType, member.rate, periodAtt, periodFrom, periodTo);

  const deductions = [];
  if (late.length > 0 && settings.penaltyPerLate > 0) {
    deductions.push({ id:"d-late", label:`${late.length} late arrival${late.length>1?"s":""} × ${formatCurrency(settings.penaltyPerLate)}`, amount: late.length * settings.penaltyPerLate });
  }
  if (settings.absenceDeductionEnabled && member.salaryType === "Monthly" && absent.length > 0) {
    const dailyRate = Math.round(member.rate / 26);
    deductions.push({ id:"d-abs", label:`${absent.length} absent day${absent.length>1?"s":""} × ${formatCurrency(dailyRate)}/day`, amount: absent.length * dailyRate });
  }
  const totalDeductions = deductions.reduce((s, d) => s + d.amount, 0);
  const periodBonuses = bonuses.filter(b => b.staffId === member.id && b.date >= periodFrom && b.date <= periodTo);
  const totalBonuses  = periodBonuses.reduce((s, b) => s + b.amount, 0);
  const finalAmount   = Math.max(0, baseSalary - totalDeductions + totalBonuses);
  const payment = payments.find(p => p.staffId === member.id && p.periodFrom === periodFrom && p.periodTo === periodTo);
  return { presentCount: present.length, lateCount: late.length, absentCount: absent.length, totalHours, baseSalary, deductions, totalDeductions, bonuses: periodBonuses, totalBonuses, finalAmount, payment: payment || null, isPaid: !!payment, periodAtt };
}

let idCounter = 1;
function uid(prefix = "id") { return `${prefix}_${Date.now()}_${idCounter++}`; }

// ══════════════════════════════════════════════════════════════════════════════
// PRIMITIVE UI COMPONENTS
// ══════════════════════════════════════════════════════════════════════════════
function BottomSheet({ open, onClose, title, children, maxH = "90vh", zIndex = 50 }) {
  return (
    <div
      className="fixed inset-0 flex flex-col justify-end"
      style={{ background: open ? "rgba(0,0,0,0.5)" : "transparent", transition:"background 0.3s", pointerEvents: open ? "auto" : "none", zIndex }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-white rounded-t-3xl overflow-hidden flex flex-col"
        style={{ transform: open ? "translateY(0)" : "translateY(100%)", transition:"transform 0.32s cubic-bezier(0.32,0.72,0,1)", maxHeight: maxH }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>
        {title && (
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 flex-shrink-0">
            <span className="text-base font-bold text-gray-900">{title}</span>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 active:bg-gray-200"><X size={15} /></button>
          </div>
        )}
        <div className="overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
}

function FullScreen({ open, onClose, title, children, rightEl }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-gray-50 flex flex-col"
      style={{ transform: open ? "translateY(0)" : "translateY(100%)", transition:"transform 0.32s cubic-bezier(0.32,0.72,0,1)" }}
    >
      <div className="bg-blue-600 text-white px-4 py-4 flex items-center gap-3 flex-shrink-0" style={{ paddingTop:"max(16px, env(safe-area-inset-top))" }}>
        <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full bg-white/20 active:bg-white/30 flex-shrink-0"><ArrowLeft size={18} /></button>
        <span className="font-bold text-lg flex-1 truncate">{title}</span>
        {rightEl}
      </div>
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}

function ActionSheet({ open, onClose, options }) {
  return (
    <BottomSheet open={open} onClose={onClose}>
      <div className="px-4 pb-6 pt-2 space-y-2">
        {options.map((opt, i) => (
          <button
            key={i}
            disabled={opt.disabled}
            onClick={() => { if (!opt.disabled) { onClose(); opt.onClick?.(); } }}
            className="w-full flex items-center gap-3 px-4 py-4 rounded-2xl bg-gray-50 text-left font-semibold text-base active:opacity-70 disabled:opacity-40"
            style={{ color: opt.color || "#111827" }}
          >
            {opt.icon && <span className="text-xl">{opt.icon}</span>}
            <span>{opt.label}</span>
          </button>
        ))}
        <button onClick={onClose} className="w-full py-4 rounded-2xl bg-gray-100 text-gray-500 font-semibold active:bg-gray-200">Cancel</button>
      </div>
    </BottomSheet>
  );
}

function ConfirmDialog({ open, onClose, title, message, onConfirm, danger = true }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background:"rgba(0,0,0,0.5)" }}>
      <div className="bg-white rounded-2xl p-5 w-full max-w-xs shadow-xl">
        <h3 className="font-bold text-gray-900 text-base mb-2">{title}</h3>
        <p className="text-gray-500 text-sm mb-5 leading-relaxed">{message}</p>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold active:bg-gray-50">Cancel</button>
          <button onClick={() => { onClose(); onConfirm(); }} className={`flex-1 py-3 rounded-xl font-bold text-white active:opacity-80 ${danger ? "bg-red-500" : "bg-blue-600"}`}>Confirm</button>
        </div>
      </div>
    </div>
  );
}

function Pill({ active, onClick, children, color = "#2563eb" }) {
  return (
    <button
      onClick={onClick}
      className="px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all active:scale-95"
      style={{ background: active ? color : "#f1f5f9", color: active ? "#fff" : "#64748b", border: `1.5px solid ${active ? color : "#e2e8f0"}` }}
    >{children}</button>
  );
}

function RoleBadge({ role }) {
  const s = ROLE_STYLE[role] || { bg:"#f1f5f9", color:"#475569" };
  return <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md uppercase tracking-wide" style={{ background:s.bg, color:s.color }}>{role}</span>;
}

function LiveTimer({ clockIn }) {
  const [label, setLabel] = useState("");
  useEffect(() => {
    function upd() {
      const now = new Date();
      const [h, m] = clockIn.split(":").map(Number);
      const base = new Date(); base.setHours(h, m, 0, 0);
      const diff = Math.max(0, now - base);
      setLabel(`${Math.floor(diff/3600000)}h ${Math.floor((diff%3600000)/60000)}m`);
    }
    upd();
    const id = setInterval(upd, 30000);
    return () => clearInterval(id);
  }, [clockIn]);
  return <span className="font-mono font-bold text-blue-600">{label}</span>;
}

function useLongPress(callback, delay = 650) {
  const timer = useRef(null);
  const clear = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  return {
    onMouseDown: () => { timer.current = setTimeout(callback, delay); },
    onMouseUp: clear, onMouseLeave: clear,
    onTouchStart: e => { e.preventDefault(); timer.current = setTimeout(callback, delay); },
    onTouchEnd: clear, onTouchCancel: clear,
  };
}

function DateFilter({ filter, setFilter, from, setFrom, to, setTo, onApply }) {
  return (
    <div className="bg-white border-b border-gray-100 px-4 pt-3 pb-3">
      <div className="flex gap-2 overflow-x-auto pb-2" style={{ msOverflowStyle:"none", scrollbarWidth:"none" }}>
        {[["today","Today"],["week","This Week"],["month","This Month"],["custom","Custom"]].map(([k,l]) => (
          <Pill key={k} active={filter===k} onClick={() => setFilter(k)}>{l}</Pill>
        ))}
      </div>
      {filter === "custom" && (
        <div className="flex items-center gap-2 mt-2">
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 bg-gray-50 outline-none focus:border-blue-400" />
          <span className="text-gray-400 text-xs font-semibold">to</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 bg-gray-50 outline-none focus:border-blue-400" />
          <button onClick={onApply} className="px-3 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold active:bg-blue-700">Go</button>
        </div>
      )}
    </div>
  );
}

function FieldLabel({ children }) {
  return <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5 block">{children}</label>;
}

function Field({ label, value, error, onChange, placeholder, type = "text", right }) {
  return (
    <div>
      {label && <FieldLabel>{label}</FieldLabel>}
      <div className="relative">
        <input
          value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} type={type}
          className={`w-full border rounded-xl px-4 py-3 text-sm text-gray-900 bg-gray-50 outline-none focus:border-blue-400 ${error ? "border-red-400" : "border-gray-200"} ${right ? "pr-10" : ""}`}
        />
        {right && <span className="absolute right-3 top-1/2 -translate-y-1/2">{right}</span>}
      </div>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MEMBERS TAB COMPONENTS
// ══════════════════════════════════════════════════════════════════════════════
function StaffCard({ member, onTap }) {
  const s = ROLE_STYLE[member.role] || {};
  const initials = member.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <button onClick={() => onTap(member)} className="w-full bg-white rounded-2xl p-4 mb-3 text-left active:bg-gray-50" style={{ boxShadow:"0 1px 3px rgba(0,0,0,0.07)" }}>
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-full flex items-center justify-center font-extrabold text-base flex-shrink-0" style={{ background: s.bg, color: s.color }}>
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="font-bold text-gray-900 text-sm truncate">{member.name}</span>
            {member.status === "Suspended"
              ? <span className="text-[10px] font-extrabold bg-red-100 text-red-600 px-2 py-0.5 rounded-md uppercase tracking-wide flex-shrink-0">Suspended</span>
              : <RoleBadge role={member.role} />}
          </div>
          <p className="text-xs text-gray-400 mb-1">{maskPhone(member.phone)} · {member.shiftStart}–{member.shiftEnd}</p>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-500">{member.salaryType}</span>
            <span className="text-gray-300">·</span>
            <span className="text-xs font-bold text-gray-700">{formatCurrency(member.rate)}</span>
            {member.status === "Active" && <span className="ml-auto text-[10px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">● Active</span>}
          </div>
        </div>
      </div>
    </button>
  );
}

function StaffProfile({ open, member, onClose, onEdit, onEditLogin, onDelete, onToggleStatus, hasUnpaid }) {
  const [showDel, setShowDel] = useState(false);
  if (!member) return null;
  const s = ROLE_STYLE[member.role] || {};
  const initials = member.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <FullScreen open={open} onClose={onClose} title="Staff Profile">
      <div className="p-4 pb-12">
        {/* Avatar */}
        <div className="bg-white rounded-2xl p-5 mb-4 flex flex-col items-center shadow-sm">
          <div className="w-20 h-20 rounded-full flex items-center justify-center font-extrabold text-3xl mb-3" style={{ background: s.bg, color: s.color }}>{initials}</div>
          <h2 className="font-extrabold text-gray-900 text-lg mb-1">{member.name}</h2>
          <div className="flex items-center gap-2">
            <RoleBadge role={member.role} />
            {member.status === "Suspended"
              ? <span className="text-[10px] font-extrabold bg-red-100 text-red-600 px-2 py-0.5 rounded-md uppercase tracking-wide">Suspended</span>
              : <span className="text-[10px] font-extrabold bg-green-100 text-green-600 px-2 py-0.5 rounded-md uppercase tracking-wide">Active</span>}
          </div>
        </div>

        {/* Info grid */}
        <div className="bg-white rounded-2xl p-4 mb-4 shadow-sm space-y-3">
          {[["Phone", maskPhone(member.phone)], ["Shift", `${member.shiftStart} – ${member.shiftEnd}`], ["Salary Type", member.salaryType], ["Rate / Salary", formatCurrency(member.rate)]].map(([k, v]) => (
            <div key={k} className="flex justify-between items-center">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{k}</span>
              <span className="text-sm font-bold text-gray-800">{v}</span>
            </div>
          ))}
        </div>

        {/* Buttons */}
        <div className="flex gap-3 mb-3">
          <button onClick={() => { onClose(); onEdit(member); }} className="flex-1 py-3.5 bg-blue-600 text-white rounded-2xl font-bold text-sm active:bg-blue-700 flex items-center justify-center gap-2">
            <Edit2 size={15} /> Edit Info
          </button>
          <button onClick={() => { onClose(); onEditLogin(member); }} className="flex-1 py-3.5 bg-gray-100 text-gray-700 rounded-2xl font-bold text-sm active:bg-gray-200 flex items-center justify-center gap-2">
            <Shield size={15} /> Edit Login
          </button>
        </div>
        <button
          onClick={() => { onClose(); onToggleStatus(member); }}
          className={`w-full py-3.5 rounded-2xl font-bold text-sm active:opacity-80 flex items-center justify-center gap-2 mb-3 ${member.status === "Suspended" ? "bg-green-50 text-green-700" : "bg-orange-50 text-orange-600"}`}
        >
          {member.status === "Suspended" ? <><UserCheck size={15} /> Reactivate Account</> : <><UserX size={15} /> Suspend Account</>}
        </button>
        <button
          disabled={hasUnpaid}
          onClick={() => setShowDel(true)}
          className={`w-full py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 ${hasUnpaid ? "bg-gray-100 text-gray-400" : "bg-red-50 text-red-600 active:bg-red-100"}`}
        >
          <Trash2 size={15} /> {hasUnpaid ? "Cannot Delete (Unpaid Payroll)" : "Delete Staff Member"}
        </button>
        {hasUnpaid && <p className="text-xs text-red-400 text-center mt-2">Pay all pending payroll before deleting.</p>}
      </div>
      <ConfirmDialog
        open={showDel} onClose={() => setShowDel(false)} title="Delete Staff Member"
        message={`Are you sure? This will permanently delete all attendance and payroll records for ${member.name}.`}
        onConfirm={() => { onClose(); onDelete(member); }}
      />
    </FullScreen>
  );
}

function StaffForm({ open, onClose, onSave, initial, mode, existingPhones }) {
  const blank = { name:"", role:"Waitress", phone:"", shiftStart:"", shiftEnd:"", salaryType:"Monthly", rate:"", password:"", confirmPassword:"" };
  const [form, setForm] = useState(blank);
  const [showPw, setShowPw] = useState(false);
  const [showCpw, setShowCpw] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (open) {
      setForm(initial ? { ...blank, ...initial, phone: initial.phone?.replace(/[^\d]/g, "") || "", password:"", confirmPassword:"" } : blank);
      setErrors({});
    }
  }, [open]);

  const set = (k, v) => { setForm(p => ({ ...p, [k]: v })); setErrors(p => ({ ...p, [k]:"" })); };

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = "Full name is required";
    const d = form.phone.replace(/\D/g, "");
    if (!d || d.length < 9) e.phone = "Valid phone number required";
    else if (existingPhones.filter(p => p.staffId !== initial?.id).some(p => p.phone.replace(/\D/g, "") === d)) e.phone = "Phone already in use";
    if (!form.shiftStart) e.shiftStart = "Required";
    if (!form.shiftEnd) e.shiftEnd = "Required";
    if (!form.rate || isNaN(Number(form.rate))) e.rate = "Valid rate required";
    if (mode === "add" || form.password) {
      if (!form.password || form.password.length < 6) e.password = "Min 6 characters";
      if (form.password !== form.confirmPassword) e.confirmPassword = "Passwords don't match";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;
    const phone = "+" + form.phone.replace(/\D/g, "");
    onSave({ ...form, phone, rate: Number(form.rate) });
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={mode === "add" ? "Add New Staff" : "Edit Staff Info"} maxH="95vh">
      <div className="px-5 pb-8 pt-3 space-y-4">
        <Field label="Full Name *" value={form.name} onChange={v => set("name", v)} placeholder="Full name" error={errors.name} />

        <div>
          <FieldLabel>Role</FieldLabel>
          <div className="flex flex-wrap gap-2">{ROLES.map(r => <Pill key={r} active={form.role===r} onClick={() => set("role",r)}>{r}</Pill>)}</div>
        </div>

        <Field label="Phone Number *" value={form.phone} onChange={v => set("phone",v)} placeholder="+998 90 123 45 67" type="tel" error={errors.phone} />

        <div className="flex gap-3">
          <div className="flex-1">
            <FieldLabel>Shift Start *</FieldLabel>
            <input type="time" value={form.shiftStart} onChange={e => set("shiftStart", e.target.value)} className={`w-full border rounded-xl px-3 py-3 text-sm bg-gray-50 outline-none focus:border-blue-400 ${errors.shiftStart ? "border-red-400" : "border-gray-200"}`} />
            {errors.shiftStart && <p className="text-xs text-red-500 mt-1">{errors.shiftStart}</p>}
          </div>
          <div className="flex-1">
            <FieldLabel>Shift End *</FieldLabel>
            <input type="time" value={form.shiftEnd} onChange={e => set("shiftEnd", e.target.value)} className={`w-full border rounded-xl px-3 py-3 text-sm bg-gray-50 outline-none focus:border-blue-400 ${errors.shiftEnd ? "border-red-400" : "border-gray-200"}`} />
            {errors.shiftEnd && <p className="text-xs text-red-500 mt-1">{errors.shiftEnd}</p>}
          </div>
        </div>

        <div>
          <FieldLabel>Salary Type</FieldLabel>
          <div className="flex flex-wrap gap-2">{SALARY_TYPES.map(t => <Pill key={t} active={form.salaryType===t} onClick={() => set("salaryType",t)}>{t}</Pill>)}</div>
        </div>

        <Field label={RATE_LABEL[form.salaryType]} value={form.rate} onChange={v => set("rate",v)} placeholder="e.g. 1500000" type="number" error={errors.rate} />

        <div className="flex items-center gap-3 py-1">
          <div className="h-px flex-1 bg-gray-200" />
          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">App Login Credentials</span>
          <div className="h-px flex-1 bg-gray-200" />
        </div>

        <div>
          <FieldLabel>Password {mode === "add" ? "*" : "(leave blank to keep)"}</FieldLabel>
          <div className="relative">
            <input value={form.password} onChange={e => set("password", e.target.value)} placeholder={mode === "add" ? "Min 6 characters" : "Leave blank to keep current"} type={showPw ? "text" : "password"}
              className={`w-full border rounded-xl px-4 py-3 pr-10 text-sm bg-gray-50 outline-none focus:border-blue-400 ${errors.password ? "border-red-400" : "border-gray-200"}`} />
            <button onClick={() => setShowPw(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">{showPw ? <EyeOff size={16} /> : <Eye size={16} />}</button>
          </div>
          {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password}</p>}
        </div>

        <div>
          <FieldLabel>Confirm Password {mode === "add" ? "*" : ""}</FieldLabel>
          <div className="relative">
            <input value={form.confirmPassword} onChange={e => set("confirmPassword", e.target.value)} placeholder="Repeat password" type={showCpw ? "text" : "password"}
              className={`w-full border rounded-xl px-4 py-3 pr-10 text-sm bg-gray-50 outline-none focus:border-blue-400 ${errors.confirmPassword ? "border-red-400" : "border-gray-200"}`} />
            <button onClick={() => setShowCpw(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">{showCpw ? <EyeOff size={16} /> : <Eye size={16} />}</button>
          </div>
          {errors.confirmPassword && <p className="text-xs text-red-500 mt-1">{errors.confirmPassword}</p>}
        </div>

        <p className="text-xs text-blue-600 bg-blue-50 rounded-xl px-4 py-3 leading-relaxed">Staff will use their phone number and this password to log in.</p>

        <button onClick={handleSave} className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold text-base active:bg-blue-700">
          {mode === "add" ? "Add Staff Member" : "Save Changes"}
        </button>
      </div>
    </BottomSheet>
  );
}

function EditLoginSheet({ open, onClose, member, onSave, existingPhones }) {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showCpw, setShowCpw] = useState(false);
  const [errors, setErrors] = useState({});
  const [changingPhone, setChangingPhone] = useState(false);

  useEffect(() => {
    if (open && member) { setPhone(member.phone?.replace(/\D/g,"") || ""); setPassword(""); setConfirm(""); setErrors({}); setChangingPhone(false); }
  }, [open, member]);

  const handleSave = () => {
    const e = {};
    if (changingPhone) {
      const d = phone.replace(/\D/g,"");
      if (d.length < 9) e.phone = "Invalid phone";
      else if (existingPhones.filter(p => p.staffId !== member?.id).some(p => p.phone.replace(/\D/g,"") === d)) e.phone = "Phone already in use";
    }
    if (password) {
      if (password.length < 6) e.password = "Min 6 characters";
      if (password !== confirm) e.confirm = "Passwords don't match";
    }
    if (Object.keys(e).length > 0) { setErrors(e); return; }
    onSave({ phone: changingPhone ? "+" + phone.replace(/\D/g,"") : member.phone, password: password || null });
  };

  if (!member) return null;
  return (
    <BottomSheet open={open} onClose={onClose} title="Edit Login" maxH="85vh">
      <div className="px-5 pb-8 pt-3 space-y-4">
        <div className="bg-gray-50 rounded-xl px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-[11px] text-gray-400 font-bold uppercase tracking-wide mb-0.5">Current Phone</p>
            <p className="font-bold text-gray-800 text-sm">{maskPhone(member.phone)}</p>
          </div>
          <button onClick={() => setChangingPhone(p => !p)} className="text-blue-600 font-semibold text-sm active:opacity-70">{changingPhone ? "Cancel" : "Change"}</button>
        </div>
        {changingPhone && (
          <Field label="New Phone Number" value={phone} onChange={v => { setPhone(v); setErrors(p => ({...p, phone:""})); }} placeholder="+998 90 123 45 67" type="tel" error={errors.phone} />
        )}
        <div>
          <FieldLabel>New Password (leave blank to keep current)</FieldLabel>
          <div className="relative">
            <input value={password} onChange={e => { setPassword(e.target.value); setErrors(p => ({...p, password:""})); }} placeholder="Leave blank to keep current" type={showPw ? "text" : "password"}
              className={`w-full border rounded-xl px-4 py-3 pr-10 text-sm bg-gray-50 outline-none focus:border-blue-400 ${errors.password ? "border-red-400" : "border-gray-200"}`} />
            <button onClick={() => setShowPw(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">{showPw ? <EyeOff size={16} /> : <Eye size={16} />}</button>
          </div>
          {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password}</p>}
        </div>
        <div>
          <FieldLabel>Confirm Password</FieldLabel>
          <div className="relative">
            <input value={confirm} onChange={e => { setConfirm(e.target.value); setErrors(p => ({...p, confirm:""})); }} placeholder="Repeat new password" type={showCpw ? "text" : "password"}
              className={`w-full border rounded-xl px-4 py-3 pr-10 text-sm bg-gray-50 outline-none focus:border-blue-400 ${errors.confirm ? "border-red-400" : "border-gray-200"}`} />
            <button onClick={() => setShowCpw(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">{showCpw ? <EyeOff size={16} /> : <Eye size={16} />}</button>
          </div>
          {errors.confirm && <p className="text-xs text-red-500 mt-1">{errors.confirm}</p>}
        </div>
        <button onClick={handleSave} className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold text-base active:bg-blue-700">Save Login &amp; Password</button>
      </div>
    </BottomSheet>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ATTENDANCE TAB COMPONENTS
// ══════════════════════════════════════════════════════════════════════════════
function AttendanceCard({ member, todayRecord, periodSummary, onCheckIn, onCheckOut, onMarkAbsent, onViewHistory, today }) {
  const s = ROLE_STYLE[member.role] || {};
  const initials = member.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const longPressProps = useLongPress(onMarkAbsent);
  const isSuspended = member.status === "Suspended";

  const dotColor = todayRecord?.status === "on-time" ? "#22c55e"
    : todayRecord?.status === "late" ? "#f97316"
    : todayRecord?.status === "absent" ? "#ef4444"
    : "#d1d5db";

  const isCurrentlyIn = todayRecord?.clockIn && !todayRecord?.clockOut;

  return (
    <div className="bg-white rounded-2xl p-4 mb-3" style={{ boxShadow:"0 1px 3px rgba(0,0,0,0.07)" }}>
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 rounded-full flex items-center justify-center font-extrabold text-sm flex-shrink-0" style={{ background: s.bg, color: s.color }}>{initials}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: dotColor }} />
            <button onClick={onViewHistory} className="font-bold text-gray-900 text-sm truncate text-left active:opacity-60">{member.name}</button>
            <RoleBadge role={member.role} />
          </div>
          <p className="text-xs text-gray-400">Shift {member.shiftStart}–{member.shiftEnd}</p>
        </div>
        <button {...longPressProps} className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 active:bg-gray-200 flex-shrink-0">
          <MoreVertical size={16} className="text-gray-500" />
        </button>
      </div>

      {/* Today status */}
      {todayRecord?.status === "absent" && (
        <div className="bg-red-50 rounded-xl px-3 py-2.5 mb-3">
          <span className="text-xs font-extrabold text-red-500 uppercase tracking-wide">● Absent</span>
          {todayRecord.note ? <span className="text-xs text-red-400 ml-2">· {todayRecord.note}</span> : null}
        </div>
      )}
      {isCurrentlyIn && (
        <div className="bg-blue-50 rounded-xl px-3 py-2.5 mb-3 flex items-center justify-between">
          <div>
            <p className="text-xs text-blue-500 font-semibold mb-0.5">Clocked in at {todayRecord.clockIn}</p>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase ${todayRecord.status === "late" ? "bg-orange-100 text-orange-600" : "bg-green-100 text-green-600"}`}>
                {todayRecord.status === "late" ? `LATE +${todayRecord.lateMinutes}m` : "ON TIME"}
              </span>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-blue-400 font-semibold mb-0.5">Duration</p>
            <LiveTimer clockIn={todayRecord.clockIn} />
          </div>
        </div>
      )}
      {todayRecord?.clockIn && todayRecord?.clockOut && (
        <div className="bg-gray-50 rounded-xl px-3 py-2.5 mb-3 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500 font-semibold">{todayRecord.clockIn} → {todayRecord.clockOut}</p>
            <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase ${todayRecord.status === "late" ? "bg-orange-100 text-orange-600" : "bg-green-100 text-green-600"}`}>
              {todayRecord.status === "late" ? `LATE +${todayRecord.lateMinutes}m` : "ON TIME"}
            </span>
          </div>
          <p className="text-sm font-bold text-gray-700">{todayRecord.hoursWorked?.toFixed(1)}h</p>
        </div>
      )}

      {/* Period summary (when not "today" view) */}
      {periodSummary && (
        <div className="grid grid-cols-3 gap-2 mb-3 text-center">
          {[["Present", periodSummary.present, "#22c55e"], ["Late", periodSummary.late, "#f97316"], ["Absent", periodSummary.absent, "#ef4444"]].map(([k, v, c]) => (
            <div key={k} className="rounded-xl py-2" style={{ background: c + "15" }}>
              <p className="text-base font-extrabold" style={{ color: c }}>{v}</p>
              <p className="text-[10px] font-semibold text-gray-500">{k}</p>
            </div>
          ))}
        </div>
      )}

      {/* Action buttons */}
      {!isSuspended && (
        <div className="flex gap-2">
          {!todayRecord?.clockIn && todayRecord?.status !== "absent" && (
            <button onClick={onCheckIn} className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold active:bg-blue-700 flex items-center justify-center gap-1.5">
              <Clock size={13} /> Check In
            </button>
          )}
          {isCurrentlyIn && (
            <button onClick={onCheckOut} className="flex-1 py-2.5 rounded-xl bg-gray-800 text-white text-xs font-bold active:bg-gray-900 flex items-center justify-center gap-1.5">
              <CheckCircle size={13} /> Check Out
            </button>
          )}
          {todayRecord?.clockIn && todayRecord?.clockOut && (
            <span className="flex-1 py-2.5 text-center text-xs font-semibold text-green-600">✓ Shift complete</span>
          )}
          <button onClick={onViewHistory} className="px-3 py-2.5 rounded-xl bg-gray-100 text-gray-600 text-xs font-bold active:bg-gray-200">History</button>
        </div>
      )}
    </div>
  );
}

function AttendanceHistory({ open, member, attendance, from, to, onClose, onEdit, onDelete }) {
  if (!member) return null;
  const records = attendance.filter(r => r.staffId === member.id && r.date >= from && r.date <= to).sort((a, b) => b.date.localeCompare(a.date));
  const present = records.filter(r => r.status !== "absent");
  const late = records.filter(r => r.status === "late");
  const absent = records.filter(r => r.status === "absent");
  const totalHours = present.reduce((s, r) => s + (r.hoursWorked || 0), 0);

  return (
    <FullScreen open={open} onClose={onClose} title={`${member.name} · History`}>
      <div className="p-4 pb-12">
        {/* Summary */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          {[["Present", present.length, "#22c55e15", "#16a34a"], ["Late", late.length, "#f9731615", "#c2410c"], ["Absent", absent.length, "#ef444415", "#dc2626"], ["Hours", totalHours.toFixed(1), "#dbeafe", "#1e40af"]].map(([l, v, bg, c]) => (
            <div key={l} className="rounded-xl py-3 text-center" style={{ background: bg }}>
              <p className="text-base font-extrabold" style={{ color: c }}>{v}</p>
              <p className="text-[10px] font-semibold text-gray-500">{l}</p>
            </div>
          ))}
        </div>

        {/* Records */}
        {records.length === 0 && <p className="text-center text-gray-400 text-sm py-10">No records for this period.</p>}
        {records.map(r => (
          <div key={r.id} className="bg-white rounded-xl p-4 mb-2 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase ${r.status === "on-time" ? "bg-green-100 text-green-600" : r.status === "late" ? "bg-orange-100 text-orange-600" : "bg-red-100 text-red-600"}`}>
                    {r.status === "on-time" ? "On Time" : r.status === "late" ? `Late +${r.lateMinutes}m` : "Absent"}
                  </span>
                  <span className="text-xs font-bold text-gray-700">{formatDate(r.date)}</span>
                </div>
                {r.status !== "absent" && (
                  <p className="text-xs text-gray-500">{r.clockIn || "—"} → {r.clockOut || "Still in"} {r.hoursWorked ? `· ${r.hoursWorked.toFixed(1)}h` : ""}</p>
                )}
                {r.note ? <p className="text-xs text-gray-400 italic mt-0.5">{r.note}</p> : null}
              </div>
              <div className="flex gap-2">
                <button onClick={() => onEdit(r)} className="w-8 h-8 flex items-center justify-center rounded-lg bg-blue-50 active:bg-blue-100"><Edit2 size={13} className="text-blue-600" /></button>
                <button onClick={() => onDelete(r)} className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-50 active:bg-red-100"><Trash2 size={13} className="text-red-500" /></button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </FullScreen>
  );
}

function EditAttendanceSheet({ open, onClose, record, onSave }) {
  const [form, setForm] = useState({ date:"", clockIn:"", clockOut:"", status:"on-time", note:"" });
  useEffect(() => {
    if (open && record) setForm({ date: record.date || "", clockIn: record.clockIn || "", clockOut: record.clockOut || "", status: record.status || "on-time", note: record.note || "" });
  }, [open, record]);
  const set = (k, v) => setForm(p => ({...p, [k]: v}));
  const handleSave = () => {
    const clockInMin = parseTimeToMin(form.clockIn);
    const shiftStartMin = parseTimeToMin(record?.shiftStart || "09:00");
    const lateMinutes = form.clockIn ? Math.max(0, clockInMin - shiftStartMin) : 0;
    const status = form.status === "absent" ? "absent" : lateMinutes > 0 ? "late" : "on-time";
    let hoursWorked = null;
    if (form.clockIn && form.clockOut) {
      const diff = parseTimeToMin(form.clockOut) - parseTimeToMin(form.clockIn);
      hoursWorked = Math.round(diff / 6) / 10;
    }
    onSave({ ...record, ...form, status, lateMinutes, hoursWorked });
  };
  if (!record) return null;
  return (
    <BottomSheet open={open} onClose={onClose} title="Edit Attendance Record">
      <div className="px-5 pb-8 pt-3 space-y-4">
        <Field label="Date" value={form.date} onChange={v => set("date",v)} type="date" />
        <div className="flex gap-3">
          <div className="flex-1">
            <FieldLabel>Clock-in Time</FieldLabel>
            <input type="time" value={form.clockIn} onChange={e => set("clockIn", e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm bg-gray-50 outline-none focus:border-blue-400" />
          </div>
          <div className="flex-1">
            <FieldLabel>Clock-out Time</FieldLabel>
            <input type="time" value={form.clockOut} onChange={e => set("clockOut", e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm bg-gray-50 outline-none focus:border-blue-400" />
          </div>
        </div>
        <div>
          <FieldLabel>Status</FieldLabel>
          <div className="flex gap-2">
            {[["on-time","On Time"],["late","Late"],["absent","Absent"]].map(([k,l]) => (
              <Pill key={k} active={form.status===k} onClick={() => set("status",k)} color={k==="absent"?"#dc2626":k==="late"?"#ea580c":"#16a34a"}>{l}</Pill>
            ))}
          </div>
        </div>
        <Field label="Note (optional)" value={form.note} onChange={v => set("note",v)} placeholder="e.g. Doctor visit" />
        <button onClick={handleSave} className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold active:bg-blue-700">Save Changes</button>
      </div>
    </BottomSheet>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PAYROLL TAB COMPONENTS
// ══════════════════════════════════════════════════════════════════════════════
function PayrollCard({ member, calc, onPayNow, onDetails }) {
  const s = ROLE_STYLE[member.role] || {};
  const initials = member.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div className="bg-white rounded-2xl p-4 mb-3" style={{ boxShadow:"0 1px 3px rgba(0,0,0,0.07)" }}>
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-full flex items-center justify-center font-extrabold text-sm flex-shrink-0" style={{ background: s.bg, color: s.color }}>{initials}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-bold text-gray-900 text-sm truncate">{member.name}</span>
            <RoleBadge role={member.role} />
          </div>
          <p className="text-xs text-gray-400">{member.salaryType} · {calc.presentCount} days · {calc.totalHours.toFixed(1)}h</p>
        </div>
        {calc.isPaid
          ? <span className="text-[10px] font-extrabold bg-green-100 text-green-600 px-2 py-1 rounded-lg uppercase tracking-wide flex-shrink-0">Paid</span>
          : <span className="text-[10px] font-extrabold bg-orange-100 text-orange-600 px-2 py-1 rounded-lg uppercase tracking-wide flex-shrink-0">Pending</span>}
      </div>

      <div className="bg-gray-50 rounded-xl px-3 py-2.5 mb-3 space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-gray-500">Base salary</span>
          <span className="font-semibold text-gray-800">{formatCurrency(calc.baseSalary)}</span>
        </div>
        {calc.totalDeductions > 0 && (
          <div className="flex justify-between text-xs">
            <span className="text-red-500">Deductions</span>
            <span className="font-semibold text-red-500">−{formatCurrency(calc.totalDeductions)}</span>
          </div>
        )}
        {calc.totalBonuses > 0 && (
          <div className="flex justify-between text-xs">
            <span className="text-green-600">Bonuses</span>
            <span className="font-semibold text-green-600">+{formatCurrency(calc.totalBonuses)}</span>
          </div>
        )}
        <div className="flex justify-between text-sm pt-1 border-t border-gray-200">
          <span className="font-bold text-gray-900">Total</span>
          <span className="font-extrabold text-gray-900">{formatCurrency(calc.finalAmount)}</span>
        </div>
      </div>

      <div className="flex gap-2">
        {!calc.isPaid && (
          <button onClick={onPayNow} className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold active:bg-blue-700 flex items-center justify-center gap-1.5">
            <Banknote size={13} /> Pay Now
          </button>
        )}
        {calc.isPaid && (
          <div className="flex-1 py-2.5 bg-green-50 text-green-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5">
            <CheckCircle size={13} /> Paid · {calc.payment?.method}
          </div>
        )}
        <button onClick={onDetails} className="px-3 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-xs font-bold active:bg-gray-200">Details</button>
      </div>
    </div>
  );
}

function PayNowSheet({ open, onClose, member, calc, periodFrom, periodTo, onPay }) {
  const [method, setMethod] = useState("Cash");
  if (!member || !calc) return null;
  return (
    <BottomSheet open={open} onClose={onClose} title="Pay Now">
      <div className="px-5 pb-8 pt-3 space-y-4">
        <div className="bg-gray-50 rounded-2xl p-4 space-y-2">
          <div className="flex justify-between text-sm"><span className="text-gray-500">Staff</span><span className="font-bold text-gray-900">{member.name}</span></div>
          <div className="flex justify-between text-sm"><span className="text-gray-500">Period</span><span className="font-semibold text-gray-700">{formatDate(periodFrom)} – {formatDate(periodTo)}</span></div>
          <div className="flex justify-between text-sm"><span className="text-gray-500">Base salary</span><span className="font-semibold text-gray-700">{formatCurrency(calc.baseSalary)}</span></div>
          {calc.totalDeductions > 0 && <div className="flex justify-between text-sm"><span className="text-red-500">Deductions</span><span className="font-semibold text-red-500">−{formatCurrency(calc.totalDeductions)}</span></div>}
          {calc.totalBonuses > 0 && <div className="flex justify-between text-sm"><span className="text-green-600">Bonuses</span><span className="font-semibold text-green-600">+{formatCurrency(calc.totalBonuses)}</span></div>}
          <div className="flex justify-between text-base pt-2 border-t border-gray-200"><span className="font-extrabold text-gray-900">Final Amount</span><span className="font-extrabold text-blue-600 text-lg">{formatCurrency(calc.finalAmount)}</span></div>
        </div>

        <div>
          <FieldLabel>Payment Method</FieldLabel>
          <div className="flex gap-2">{PAYMENT_METHODS.map(m => <Pill key={m} active={method===m} onClick={() => setMethod(m)}>{m}</Pill>)}</div>
        </div>

        <button onClick={() => onPay(method)} className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold text-base active:bg-blue-700">
          Confirm Payment · {formatCurrency(calc.finalAmount)}
        </button>
      </div>
    </BottomSheet>
  );
}

function PayrollDetails({ open, onClose, member, calc, periodFrom, periodTo, onAddBonus, onEditBonus, onDeleteBonus, onEditPayroll, overrides }) {
  const [showAddBonus, setShowAddBonus] = useState(false);
  const [editingBonus, setEditingBonus] = useState(null);
  const [showOverrideForm, setShowOverrideForm] = useState(false);
  const [overrideAmount, setOverrideAmount] = useState("");
  const [overrideNote, setOverrideNote] = useState("");
  const [bonusForm, setBonusForm] = useState({ amount:"", reason:"Best Performance", note:"" });

  useEffect(() => {
    if (editingBonus) { setBonusForm({ amount: String(editingBonus.amount), reason: editingBonus.reason, note: editingBonus.note }); setShowAddBonus(true); }
  }, [editingBonus]);

  if (!member || !calc) return null;

  const override = overrides?.find(o => o.staffId === member.id && o.periodFrom === periodFrom && o.periodTo === periodTo);
  const finalShown = override ? override.amount : calc.finalAmount;

  const handleBonusSave = () => {
    const amount = Number(bonusForm.amount);
    if (!amount || amount <= 0) return;
    if (editingBonus) { onEditBonus({ ...editingBonus, ...bonusForm, amount }); }
    else { onAddBonus({ staffId: member.id, date: periodTo, ...bonusForm, amount }); }
    setShowAddBonus(false); setEditingBonus(null); setBonusForm({ amount:"", reason:"Best Performance", note:"" });
  };

  return (
    <FullScreen open={open} onClose={onClose} title={`${member.name} · Payroll`}>
      <div className="p-4 pb-16">
        <p className="text-xs text-gray-400 text-center mb-4">{formatDate(periodFrom)} – {formatDate(periodTo)}</p>

        {/* Daily breakdown */}
        <div className="bg-white rounded-2xl mb-4 overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-gray-100"><p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Daily Breakdown</p></div>
          {calc.periodAtt.filter(r => r.status !== "absent").length === 0 && <p className="px-4 py-3 text-sm text-gray-400">No records in this period.</p>}
          {calc.periodAtt.filter(r => r.status !== "absent").sort((a,b) => a.date.localeCompare(b.date)).map((r, i) => {
            const earning = member.salaryType === "Hourly" ? (r.hoursWorked || 0) * member.rate
              : member.salaryType === "Daily" ? member.rate
              : member.salaryType === "Weekly" ? 0
              : Math.round(member.rate / 26);
            return (
              <div key={r.id} className={`px-4 py-3 flex items-center justify-between text-sm ${i > 0 ? "border-t border-gray-50" : ""}`}>
                <div>
                  <p className="font-semibold text-gray-800">{formatDate(r.date)}</p>
                  <p className="text-xs text-gray-400">
                    {r.clockIn}–{r.clockOut || "..."} · {r.hoursWorked?.toFixed(1) || "?"}h
                    {r.status === "late" ? ` · Late +${r.lateMinutes}m` : ""}
                  </p>
                </div>
                {member.salaryType !== "Weekly" && <span className="font-bold text-gray-800">{formatCurrency(earning)}</span>}
              </div>
            );
          })}
        </div>

        {/* Salary summary */}
        <div className="bg-white rounded-2xl p-4 mb-4 shadow-sm space-y-2.5">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Summary</p>
          <div className="flex justify-between text-sm"><span className="text-gray-600">Base salary</span><span className="font-bold text-gray-900">{formatCurrency(calc.baseSalary)}</span></div>

          {calc.deductions.length > 0 && (
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mt-3 mb-2">Deductions</p>
              {calc.deductions.map(d => (
                <div key={d.id} className="flex justify-between text-sm mb-1.5">
                  <span className="text-gray-500 text-xs">{d.label}</span>
                  <span className="font-semibold text-red-500">−{formatCurrency(d.amount)}</span>
                </div>
              ))}
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mt-3 mb-2">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Bonuses</p>
              <button onClick={() => { setEditingBonus(null); setBonusForm({ amount:"", reason:"Best Performance", note:"" }); setShowAddBonus(true); }} className="text-xs font-bold text-blue-600 active:opacity-70">+ Add</button>
            </div>
            {calc.bonuses.length === 0 && <p className="text-xs text-gray-400">No bonuses.</p>}
            {calc.bonuses.map(b => (
              <div key={b.id} className="flex items-center justify-between mb-1.5">
                <div className="flex-1 min-w-0">
                  <span className="text-xs text-gray-600 font-semibold">{b.reason}</span>
                  {b.note ? <span className="text-xs text-gray-400 ml-1">· {b.note}</span> : null}
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-green-600 text-sm">+{formatCurrency(b.amount)}</span>
                  <button onClick={() => { setEditingBonus(b); }} className="w-6 h-6 flex items-center justify-center rounded bg-blue-50 active:bg-blue-100"><Edit2 size={11} className="text-blue-600" /></button>
                  <button onClick={() => onDeleteBonus(b.id)} className="w-6 h-6 flex items-center justify-center rounded bg-red-50 active:bg-red-100"><Trash2 size={11} className="text-red-500" /></button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-between text-base pt-2 border-t border-gray-200">
            <span className="font-extrabold text-gray-900">Final Total</span>
            <span className="font-extrabold text-blue-600">{formatCurrency(override ? override.amount : calc.finalAmount)}</span>
          </div>
          {override && <p className="text-xs text-orange-500">Manual override · {override.note}</p>}

          <button onClick={() => { setOverrideAmount(String(finalShown)); setOverrideNote(override?.note || ""); setShowOverrideForm(p => !p); }} className="w-full py-2.5 bg-gray-100 text-gray-600 rounded-xl text-xs font-bold active:bg-gray-200 mt-1">
            {showOverrideForm ? "Cancel Override" : "Edit Final Amount"}
          </button>
          {showOverrideForm && (
            <div className="space-y-3 pt-2">
              <Field label="Override Amount (so'm)" value={overrideAmount} onChange={setOverrideAmount} placeholder="Final amount" type="number" />
              <Field label="Reason / Note" value={overrideNote} onChange={setOverrideNote} placeholder="e.g. Manual adjustment" />
              <button onClick={() => { onEditPayroll({ staffId: member.id, periodFrom, periodTo, amount: Number(overrideAmount), note: overrideNote }); setShowOverrideForm(false); }} className="w-full py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold active:bg-blue-700">Apply Override</button>
            </div>
          )}
        </div>

        {/* Payment history */}
        {calc.payment && (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Payment History</p>
            <div className="flex justify-between text-sm">
              <div>
                <p className="font-semibold text-gray-800">{formatDate(calc.payment.paymentDate)}</p>
                <p className="text-xs text-gray-400">{calc.payment.method}</p>
              </div>
              <span className="font-bold text-green-600">{formatCurrency(calc.payment.amount)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Bonus Sheet */}
      <BottomSheet open={showAddBonus} onClose={() => { setShowAddBonus(false); setEditingBonus(null); }} title={editingBonus ? "Edit Bonus" : "Add Bonus"} zIndex={60}>
        <div className="px-5 pb-8 pt-3 space-y-4">
          <Field label="Amount (so'm)" value={bonusForm.amount} onChange={v => setBonusForm(p => ({...p, amount:v}))} placeholder="e.g. 100000" type="number" />
          <div>
            <FieldLabel>Reason</FieldLabel>
            <div className="flex flex-wrap gap-2">{BONUS_REASONS.map(r => <Pill key={r} active={bonusForm.reason===r} onClick={() => setBonusForm(p => ({...p, reason:r}))}>{r}</Pill>)}</div>
          </div>
          <Field label="Note (optional)" value={bonusForm.note} onChange={v => setBonusForm(p => ({...p, note:v}))} placeholder="Additional details" />
          <button onClick={handleBonusSave} className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold active:bg-blue-700">{editingBonus ? "Save Changes" : "Add Bonus"}</button>
        </div>
      </BottomSheet>
    </FullScreen>
  );
}

function PayrollSettings({ open, onClose, settings, onSave }) {
  const [penalty, setPenalty] = useState("");
  const [deductAbsence, setDeductAbsence] = useState(true);
  useEffect(() => { if (open) { setPenalty(String(settings.penaltyPerLate)); setDeductAbsence(settings.absenceDeductionEnabled); } }, [open, settings]);
  return (
    <BottomSheet open={open} onClose={onClose} title="Payroll Settings">
      <div className="px-5 pb-8 pt-3 space-y-4">
        <Field label="Penalty per Late Arrival (so'm)" value={penalty} onChange={setPenalty} placeholder="e.g. 10000" type="number" />
        <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3.5">
          <div>
            <p className="text-sm font-semibold text-gray-800">Absence Deduction</p>
            <p className="text-xs text-gray-400">Deduct daily rate for monthly staff absences</p>
          </div>
          <button onClick={() => setDeductAbsence(p => !p)} className={`w-12 h-6 rounded-full transition-colors ${deductAbsence ? "bg-blue-600" : "bg-gray-300"}`}>
            <span className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${deductAbsence ? "translate-x-6" : "translate-x-0.5"}`} />
          </button>
        </div>
        <button onClick={() => { onSave({ penaltyPerLate: Number(penalty) || 0, absenceDeductionEnabled: deductAbsence }); onClose(); }} className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold active:bg-blue-700">Save Settings</button>
      </div>
    </BottomSheet>
  );
}

function ExportSummary({ open, onClose, staff, calcs, periodFrom, periodTo }) {
  return (
    <FullScreen open={open} onClose={onClose} title="Export Summary">
      <div className="p-4 pb-12">
        <p className="text-xs text-gray-400 text-center mb-4">{formatDate(periodFrom)} – {formatDate(periodTo)}</p>
        {staff.map(m => {
          const c = calcs[m.id];
          if (!c) return null;
          return (
            <div key={m.id} className="bg-white rounded-xl p-4 mb-3 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <span className="font-bold text-gray-900 text-sm">{m.name}</span>
                <RoleBadge role={m.role} />
                {c.isPaid
                  ? <span className="ml-auto text-[10px] font-extrabold bg-green-100 text-green-600 px-2 py-0.5 rounded-full">PAID</span>
                  : <span className="ml-auto text-[10px] font-extrabold bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full">PENDING</span>}
              </div>
              <div className="space-y-1 text-xs text-gray-600">
                <div className="flex justify-between"><span>Base salary</span><span className="font-semibold">{formatCurrency(c.baseSalary)}</span></div>
                {c.totalDeductions > 0 && <div className="flex justify-between"><span className="text-red-500">Deductions</span><span className="font-semibold text-red-500">−{formatCurrency(c.totalDeductions)}</span></div>}
                {c.totalBonuses > 0 && <div className="flex justify-between"><span className="text-green-600">Bonuses</span><span className="font-semibold text-green-600">+{formatCurrency(c.totalBonuses)}</span></div>}
                <div className="flex justify-between pt-1 border-t border-gray-100"><span className="font-bold text-gray-900">Final</span><span className="font-extrabold text-gray-900">{formatCurrency(c.finalAmount)}</span></div>
              </div>
            </div>
          );
        })}
      </div>
    </FullScreen>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════
export default function StaffPage() {
  // ── Core data
  const [staff, setStaff] = useState(SEED_STAFF);
  const [attendance, setAttendance] = useState(SEED_ATTENDANCE);
  const [bonuses, setBonuses] = useState(SEED_BONUSES);
  const [payments, setPayments] = useState(SEED_PAYMENTS);
  const [payrollSettings, setPayrollSettings] = useState({ penaltyPerLate: 10000, absenceDeductionEnabled: true });
  const [payrollOverrides, setPayrollOverrides] = useState([]);

  // ── Tab
  const [activeTab, setActiveTab] = useState("members");

  // ── Members tab state
  const [profileMember, setProfileMember] = useState(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [showEditInfo, setShowEditInfo] = useState(false);
  const [showEditLogin, setShowEditLogin] = useState(false);
  const [editingMember, setEditingMember] = useState(null);

  // ── Attendance tab state
  const [attFilter, setAttFilter] = useState("today");
  const [attFrom, setAttFrom] = useState(TODAY);
  const [attTo, setAttTo] = useState(TODAY);
  const [attApplied, setAttApplied] = useState({ from: TODAY, to: TODAY });
  const [historyMember, setHistoryMember] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showActionSheet, setShowActionSheet] = useState(false);
  const [actionMember, setActionMember] = useState(null);
  const [showEditAtt, setShowEditAtt] = useState(false);
  const [editingAtt, setEditingAtt] = useState(null);
  const [showMarkAbsent, setShowMarkAbsent] = useState(false);

  // ── Payroll tab state
  const [payFilter, setPayFilter] = useState("month");
  const [payFrom, setPayFrom] = useState(TODAY);
  const [payTo, setPayTo] = useState(TODAY);
  const [payApplied, setPayApplied] = useState(() => getMonthDates(TODAY));
  const [showPayNow, setShowPayNow] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [selectedPayMember, setSelectedPayMember] = useState(null);

  // ── Derived date ranges
  const attRange = attFilter !== "custom" ? getDateRange(attFilter, TODAY, attFrom, attTo) : attApplied;
  const payRange = payFilter !== "custom" ? getDateRange(payFilter, TODAY, payFrom, payTo) : payApplied;

  // ── Phone list for uniqueness check
  const existingPhones = staff.map(s => ({ staffId: s.id, phone: s.phone }));

  // ══ MEMBERS HANDLERS ══════════════════════════════════════════════════════
  const openProfile = m => { setProfileMember(m); setShowProfile(true); };

  const handleAddStaff = form => {
    const newMember = { ...form, id: uid("s"), status: "Active" };
    setStaff(p => [...p, newMember]);
    setShowAddStaff(false);
  };

  const handleEditInfo = form => {
    setStaff(p => p.map(m => m.id === editingMember.id ? { ...m, ...form } : m));
    setShowEditInfo(false);
  };

  const handleEditLogin = ({ phone, password }) => {
    setStaff(p => p.map(m => m.id === editingMember.id ? { ...m, phone, ...(password ? { password } : {}) } : m));
    setShowEditLogin(false);
  };

  const handleDelete = m => {
    setStaff(p => p.filter(s => s.id !== m.id));
    setAttendance(p => p.filter(r => r.staffId !== m.id));
    setBonuses(p => p.filter(b => b.staffId !== m.id));
    setPayments(p => p.filter(pay => pay.staffId !== m.id));
  };

  const handleToggleStatus = m => {
    setStaff(p => p.map(s => s.id === m.id ? { ...s, status: s.status === "Active" ? "Suspended" : "Active" } : s));
    setProfileMember(prev => prev?.id === m.id ? { ...prev, status: prev.status === "Active" ? "Suspended" : "Active" } : prev);
  };

  const hasUnpaidPayroll = m => {
    const pending = payments.filter(p => p.staffId === m.id);
    const allPaid = !staff.find(s => s.id === m.id) || pending.length === payments.filter(p => p.staffId === m.id).length;
    // Simplified: check if there's any period where payroll is pending (no payment record)
    return false; // In this demo, allow delete; real logic would check pending
  };

  // ══ ATTENDANCE HANDLERS ════════════════════════════════════════════════════
  const getToday = () => TODAY;

  const handleCheckIn = member => {
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
    const shiftStartMin = parseTimeToMin(member.shiftStart);
    const nowMin = parseTimeToMin(timeStr);
    const lateMinutes = Math.max(0, nowMin - shiftStartMin);
    const status = lateMinutes > 0 ? "late" : "on-time";
    const existing = attendance.find(r => r.staffId === member.id && r.date === TODAY);
    if (existing) {
      setAttendance(p => p.map(r => r.id === existing.id ? { ...r, clockIn: timeStr, status, lateMinutes } : r));
    } else {
      setAttendance(p => [...p, { id: uid("a"), staffId: member.id, date: TODAY, clockIn: timeStr, clockOut: null, status, lateMinutes, hoursWorked: null, note:"" }]);
    }
  };

  const handleCheckOut = member => {
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
    setAttendance(p => p.map(r => {
      if (r.staffId !== member.id || r.date !== TODAY) return r;
      const diff = parseTimeToMin(timeStr) - parseTimeToMin(r.clockIn);
      const hoursWorked = Math.round(diff / 6) / 10;
      return { ...r, clockOut: timeStr, hoursWorked };
    }));
  };

  const handleMarkAbsent = member => {
    const existing = attendance.find(r => r.staffId === member.id && r.date === TODAY);
    if (existing) {
      setAttendance(p => p.map(r => r.id === existing.id ? { ...r, clockIn: null, clockOut: null, status:"absent", lateMinutes:0, hoursWorked:0 } : r));
    } else {
      setAttendance(p => [...p, { id: uid("a"), staffId: member.id, date: TODAY, clockIn: null, clockOut: null, status:"absent", lateMinutes:0, hoursWorked:0, note:"" }]);
    }
  };

  const handleEditAtt = updated => {
    setAttendance(p => p.map(r => r.id === updated.id ? updated : r));
    setShowEditAtt(false);
    setEditingAtt(null);
  };

  const handleDeleteAtt = r => {
    setAttendance(p => p.filter(a => a.id !== r.id));
  };

  // ══ PAYROLL HANDLERS ═══════════════════════════════════════════════════════
  const handlePay = (member, method) => {
    const calc = calcPayroll(member, attendance, bonuses, payments, payrollSettings, payRange.from, payRange.to);
    setPayments(p => [...p, { id: uid("pmt"), staffId: member.id, periodFrom: payRange.from, periodTo: payRange.to, amount: calc.finalAmount, method, paymentDate: TODAY }]);
    setShowPayNow(false);
  };

  const handleAddBonus = bonus => setBonuses(p => [...p, { ...bonus, id: uid("bon") }]);
  const handleEditBonus = bonus => setBonuses(p => p.map(b => b.id === bonus.id ? bonus : b));
  const handleDeleteBonus = id => setBonuses(p => p.filter(b => b.id !== id));
  const handleEditPayroll = override => {
    setPayrollOverrides(p => { const existing = p.find(o => o.staffId === override.staffId && o.periodFrom === override.periodFrom && o.periodTo === override.periodTo); return existing ? p.map(o => o.staffId === override.staffId && o.periodFrom === override.periodFrom ? override : o) : [...p, override]; });
  };

  // ══ COMPUTED ═══════════════════════════════════════════════════════════════
  // Attendance summary for selected period
  const attSummary = (() => {
    const inRange = attendance.filter(r => r.date >= attRange.from && r.date <= attRange.to);
    return {
      present: inRange.filter(r => r.status === "on-time").length,
      late: inRange.filter(r => r.status === "late").length,
      absent: inRange.filter(r => r.status === "absent").length,
      total: new Set(inRange.map(r => r.staffId)).size,
    };
  })();

  // Today's records
  const todayRecords = attendance.filter(r => r.date === TODAY);

  // Payroll calcs for all staff
  const payrollCalcs = {};
  staff.forEach(m => { payrollCalcs[m.id] = calcPayroll(m, attendance, bonuses, payments, payrollSettings, payRange.from, payRange.to); });

  const payrollSummary = (() => {
    const calcs = Object.values(payrollCalcs);
    return {
      totalPayroll: calcs.reduce((s, c) => s + c.finalAmount, 0),
      totalHours: calcs.reduce((s, c) => s + c.totalHours, 0),
      pending: calcs.filter(c => !c.isPaid).reduce((s, c) => s + c.finalAmount, 0),
      paid: calcs.filter(c => c.isPaid).reduce((s, c) => s + (c.payment?.amount || 0), 0),
    };
  })();

  // ══ RENDER ════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-gray-100 flex justify-center">
      <div className="w-full max-w-sm bg-gray-100 flex flex-col relative" style={{ minHeight:"100vh" }}>

        {/* ── HEADER ─────────────────────────────────────────────────────── */}
        <div className="bg-blue-600 text-white px-4 pt-12 pb-4 flex-shrink-0">
          <h1 className="text-2xl font-extrabold tracking-tight">Staff</h1>
          <p className="text-blue-200 text-sm font-medium">Team Management</p>
        </div>

        {/* ── TABS ───────────────────────────────────────────────────────── */}
        <div className="bg-white flex border-b border-gray-100 flex-shrink-0">
          {[["members","Members",<Users size={15} key="u" />],["attendance","Attendance",<ClipboardList size={15} key="c" />],["payroll","Payroll",<Banknote size={15} key="b" />]].map(([k, l, icon]) => (
            <button
              key={k} onClick={() => setActiveTab(k)}
              className={`flex-1 py-3 flex flex-col items-center gap-0.5 text-[11px] font-bold transition-colors ${activeTab === k ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-400"}`}
            >
              {icon}{l}
            </button>
          ))}
        </div>

        {/* ── CONTENT ────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto pb-24">

          {/* ════════════ MEMBERS TAB ════════════ */}
          {activeTab === "members" && (
            <div className="p-4">
              {staff.length === 0 && (
                <div className="text-center py-16">
                  <p className="text-4xl mb-3">👤</p>
                  <p className="text-gray-400 font-semibold">No staff members</p>
                  <p className="text-gray-400 text-sm">Tap + to add your first staff member</p>
                </div>
              )}
              {staff.map(m => <StaffCard key={m.id} member={m} onTap={openProfile} />)}
            </div>
          )}

          {/* ════════════ ATTENDANCE TAB ════════════ */}
          {activeTab === "attendance" && (
            <div>
              <DateFilter
                filter={attFilter} setFilter={f => { setAttFilter(f); if (f !== "custom") setAttApplied(getDateRange(f, TODAY, attFrom, attTo)); }}
                from={attFrom} setFrom={setAttFrom} to={attTo} setTo={setAttTo}
                onApply={() => setAttApplied({ from: attFrom, to: attTo })}
              />

              {/* Summary row */}
              <div className="grid grid-cols-4 gap-2 p-4 pb-2">
                {[["Present", attSummary.present, "#dcfce7","#16a34a"],["Late",attSummary.late,"#ffedd5","#c2410c"],["Absent",attSummary.absent,"#fee2e2","#dc2626"],["Staff",attSummary.total,"#dbeafe","#1d4ed8"]].map(([l,v,bg,c]) => (
                  <div key={l} className="rounded-2xl py-3 text-center" style={{ background: bg }}>
                    <p className="text-xl font-extrabold" style={{ color: c }}>{v}</p>
                    <p className="text-[10px] font-bold text-gray-500">{l}</p>
                  </div>
                ))}
              </div>

              {/* Attendance cards */}
              <div className="px-4 pt-2">
                {staff.map(m => {
                  const todayRec = todayRecords.find(r => r.staffId === m.id);
                  const periodRecs = attendance.filter(r => r.staffId === m.id && r.date >= attRange.from && r.date <= attRange.to);
                  const periodSummary = attFilter !== "today" ? {
                    present: periodRecs.filter(r => r.status !== "absent").length,
                    late: periodRecs.filter(r => r.status === "late").length,
                    absent: periodRecs.filter(r => r.status === "absent").length,
                  } : null;
                  return (
                    <AttendanceCard
                      key={m.id} member={m} todayRecord={todayRec} periodSummary={periodSummary} today={TODAY}
                      onCheckIn={() => handleCheckIn(m)}
                      onCheckOut={() => handleCheckOut(m)}
                      onMarkAbsent={() => { setActionMember(m); setShowActionSheet(true); }}
                      onViewHistory={() => { setHistoryMember(m); setShowHistory(true); }}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* ════════════ PAYROLL TAB ════════════ */}
          {activeTab === "payroll" && (
            <div>
              <div className="flex items-center justify-between px-4 pt-3 pb-1">
                <button onClick={() => setShowSettings(true)} className="flex items-center gap-1.5 text-blue-600 text-xs font-bold active:opacity-70"><Settings size={14} /> Settings</button>
                <button onClick={() => setShowExport(true)} className="flex items-center gap-1.5 text-blue-600 text-xs font-bold active:opacity-70"><Download size={14} /> Export</button>
              </div>

              <DateFilter
                filter={payFilter} setFilter={f => { setPayFilter(f); if (f !== "custom") setPayApplied(getDateRange(f, TODAY, payFrom, payTo)); }}
                from={payFrom} setFrom={setPayFrom} to={payTo} setTo={setPayTo}
                onApply={() => setPayApplied({ from: payFrom, to: payTo })}
              />

              {/* Summary cards */}
              <div className="flex gap-3 px-4 pt-4 pb-2 overflow-x-auto" style={{ msOverflowStyle:"none", scrollbarWidth:"none" }}>
                {[
                  ["Total Payroll", formatCurrency(payrollSummary.totalPayroll), "#1e40af","#dbeafe"],
                  ["Total Hours", payrollSummary.totalHours.toFixed(1) + "h", "#6b21a8","#f3e8ff"],
                  ["Pending", formatCurrency(payrollSummary.pending), "#c2410c","#ffedd5"],
                  ["Paid", formatCurrency(payrollSummary.paid), "#166534","#dcfce7"],
                ].map(([l, v, c, bg]) => (
                  <div key={l} className="flex-shrink-0 rounded-2xl px-4 py-3 min-w-[130px]" style={{ background: bg }}>
                    <p className="text-[10px] font-bold mb-1" style={{ color: c }}>{l}</p>
                    <p className="font-extrabold text-sm" style={{ color: c }}>{v}</p>
                  </div>
                ))}
              </div>

              {/* Payroll cards */}
              <div className="px-4 pt-2">
                {staff.map(m => (
                  <PayrollCard
                    key={m.id} member={m} calc={payrollCalcs[m.id]}
                    onPayNow={() => { setSelectedPayMember(m); setShowPayNow(true); }}
                    onDetails={() => { setSelectedPayMember(m); setShowDetails(true); }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── BOTTOM NAV ─────────────────────────────────────────────────── */}
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-sm bg-white border-t border-gray-100 flex items-center justify-around px-2 py-2" style={{ boxShadow:"0 -1px 8px rgba(0,0,0,0.06)" }}>
          {[["H","Home"],["T","Tables"],["M","Menu"],["I","Inventory"],["O","Orders"],["S","Staff"],["P","Profile"]].map(([k, l]) => {
            const isActive = k === "S";
            return (
              <button key={k} className="flex flex-col items-center gap-0.5 min-w-[40px] py-1">
                <span className={`w-8 h-8 flex items-center justify-center rounded-xl font-extrabold text-sm ${isActive ? "bg-blue-600 text-white" : "text-gray-400"}`}>{k}</span>
                <span className={`text-[9px] font-semibold ${isActive ? "text-blue-600" : "text-gray-400"}`}>{l}</span>
              </button>
            );
          })}
        </div>

        {/* ── FLOATING ADD BUTTON (Members only) ─────────────────────────── */}
        {activeTab === "members" && (
          <button
            onClick={() => setShowAddStaff(true)}
            className="fixed bottom-20 right-4 w-14 h-14 bg-blue-600 text-white rounded-full flex items-center justify-center active:bg-blue-700"
            style={{ boxShadow:"0 4px 16px rgba(37,99,235,0.45)" }}
          >
            <Plus size={26} />
          </button>
        )}

        {/* ════════════ MEMBERS MODALS ════════════ */}
        <StaffProfile
          open={showProfile} member={profileMember} onClose={() => setShowProfile(false)}
          onEdit={m => { setEditingMember(m); setShowProfile(false); setTimeout(() => setShowEditInfo(true), 350); }}
          onEditLogin={m => { setEditingMember(m); setShowProfile(false); setTimeout(() => setShowEditLogin(true), 350); }}
          onDelete={handleDelete}
          onToggleStatus={handleToggleStatus}
          hasUnpaid={false}
        />

        <StaffForm open={showAddStaff} onClose={() => setShowAddStaff(false)} onSave={handleAddStaff} mode="add" existingPhones={existingPhones} />
        <StaffForm open={showEditInfo} onClose={() => { setShowEditInfo(false); setEditingMember(null); }} onSave={handleEditInfo} initial={editingMember} mode="edit" existingPhones={existingPhones} />
        <EditLoginSheet open={showEditLogin} onClose={() => { setShowEditLogin(false); setEditingMember(null); }} member={editingMember} onSave={handleEditLogin} existingPhones={existingPhones} />

        {/* ════════════ ATTENDANCE MODALS ════════════ */}
        <AttendanceHistory
          open={showHistory} member={historyMember} attendance={attendance}
          from={attRange.from} to={attRange.to} onClose={() => setShowHistory(false)}
          onEdit={r => { setEditingAtt({ ...r, shiftStart: historyMember?.shiftStart }); setShowHistory(false); setTimeout(() => setShowEditAtt(true), 350); }}
          onDelete={handleDeleteAtt}
        />

        <EditAttendanceSheet
          open={showEditAtt} onClose={() => { setShowEditAtt(false); setEditingAtt(null); }}
          record={editingAtt} onSave={handleEditAtt}
        />

        <ActionSheet
          open={showActionSheet} onClose={() => setShowActionSheet(false)}
          options={[
            { label:"Mark Absent Today", icon:"🚫", color:"#dc2626", onClick: () => { if (actionMember) handleMarkAbsent(actionMember); } },
            { label:"View History", icon:"📋", onClick: () => { if (actionMember) { setHistoryMember(actionMember); setShowHistory(true); } } },
          ]}
        />

        {/* ════════════ PAYROLL MODALS ════════════ */}
        <PayNowSheet
          open={showPayNow} onClose={() => setShowPayNow(false)}
          member={selectedPayMember} calc={selectedPayMember ? payrollCalcs[selectedPayMember.id] : null}
          periodFrom={payRange.from} periodTo={payRange.to}
          onPay={method => selectedPayMember && handlePay(selectedPayMember, method)}
        />

        <PayrollDetails
          open={showDetails} onClose={() => setShowDetails(false)}
          member={selectedPayMember} calc={selectedPayMember ? payrollCalcs[selectedPayMember.id] : null}
          periodFrom={payRange.from} periodTo={payRange.to}
          onAddBonus={handleAddBonus} onEditBonus={handleEditBonus} onDeleteBonus={handleDeleteBonus}
          onEditPayroll={handleEditPayroll} overrides={payrollOverrides}
        />

        <PayrollSettings open={showSettings} onClose={() => setShowSettings(false)} settings={payrollSettings} onSave={setPayrollSettings} />

        <ExportSummary
          open={showExport} onClose={() => setShowExport(false)}
          staff={staff} calcs={payrollCalcs} periodFrom={payRange.from} periodTo={payRange.to}
        />

      </div>
    </div>
  );
}

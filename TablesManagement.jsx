import { useState, useEffect, useCallback, useRef } from "react";
import {
  Home, LayoutGrid, UtensilsCrossed, Package, ClipboardList,
  Users, User, Plus, X, ChevronDown, ChevronUp, Trash2,
  Clock, UserCheck, AlertCircle, CheckCircle, Edit2,
  MapPin, Armchair, RefreshCw
} from "lucide-react";

// ─── SEED DATA ────────────────────────────────────────────────────────────────
const WAITERS = [
  { id: 1, name: "Aisha" },
  { id: 2, name: "Bobur" },
  { id: 3, name: "Kamola" },
  { id: 4, name: "Jasur" },
];

const now = Date.now();
const SEED_TABLES = [
  { id: 1, name: "Table 1",  seats: 4, section: "Indoor",  shape: "Square",    status: "occupied",  occupiedAt: now - 14*60000 + 32000, guests: 3, waiterId: 1, orderTotal: 285000 },
  { id: 2, name: "Table 2",  seats: 2, section: "Indoor",  shape: "Round",     status: "free",      occupiedAt: null, guests: 0, waiterId: null, orderTotal: 0 },
  { id: 3, name: "Table 3",  seats: 6, section: "VIP",     shape: "Rectangle", status: "occupied",  occupiedAt: now - 58*60000 + 10000, guests: 6, waiterId: 2, orderTotal: 1240000 },
  { id: 4, name: "Table 4",  seats: 4, section: "Outdoor", shape: "Square",    status: "reserved",  occupiedAt: null, guests: 0, waiterId: null, orderTotal: 0, reservation: { guest: "Sherzod A.", phone: "+998901234567", date: "2026-03-06", time: "19:00" } },
  { id: 5, name: "Table 5",  seats: 2, section: "Bar",     shape: "Round",     status: "free",      occupiedAt: null, guests: 0, waiterId: null, orderTotal: 0 },
  { id: 6, name: "Table 6",  seats: 8, section: "Terrace", shape: "Rectangle", status: "cleaning",  occupiedAt: null, guests: 0, waiterId: null, orderTotal: 0 },
  { id: 7, name: "Table 7",  seats: 4, section: "VIP",     shape: "Square",    status: "occupied",  occupiedAt: now - 32*60000, guests: 2, waiterId: 3, orderTotal: 560000 },
  { id: 8, name: "Table 8",  seats: 6, section: "Outdoor", shape: "Rectangle", status: "reserved",  occupiedAt: null, guests: 0, waiterId: null, orderTotal: 0, reservation: { guest: "Nilufar B.", phone: "+998909876543", date: "2026-03-06", time: "20:30" } },
];

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const SECTIONS   = ["All", "Indoor", "Outdoor", "VIP", "Bar", "Terrace"];
const SEC_OPTIONS = ["Indoor", "Outdoor", "VIP", "Bar", "Terrace"];
const SHAPES     = ["Square", "Round", "Rectangle"];
const STATUSES   = ["free", "occupied", "reserved", "cleaning"];

const STATUS_META = {
  free:     { label: "FREE",          bg: "bg-green-100",  text: "text-green-700",  dot: "bg-green-500",  border: "border-green-200" },
  occupied: { label: "OCCUPIED",      bg: "bg-red-100",    text: "text-red-700",    dot: "bg-red-500",    border: "border-red-200"   },
  reserved: { label: "RESERVED",      bg: "bg-blue-100",   text: "text-blue-700",   dot: "bg-blue-500",   border: "border-blue-200"  },
  cleaning: { label: "NEEDS CLEANING",bg: "bg-yellow-100", text: "text-yellow-700", dot: "bg-yellow-500", border: "border-yellow-200"},
};

const SEC_COLORS = {
  Indoor:  "bg-indigo-100 text-indigo-700",
  Outdoor: "bg-green-100 text-green-700",
  VIP:     "bg-purple-100 text-purple-700",
  Bar:     "bg-orange-100 text-orange-700",
  Terrace: "bg-teal-100 text-teal-700",
};

const NAV = [
  { id: "home",      label: "Home",      Icon: Home },
  { id: "tables",    label: "Tables",    Icon: LayoutGrid },
  { id: "menu",      label: "Menu",      Icon: UtensilsCrossed },
  { id: "inventory", label: "Inventory", Icon: Package },
  { id: "orders",    label: "Orders",    Icon: ClipboardList },
  { id: "staff",     label: "Staff",     Icon: Users },
  { id: "profile",   label: "Profile",   Icon: User },
];

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const currency = (v) => new Intl.NumberFormat("uz-UZ").format(v) + " so'm";

function elapsed(ms) {
  if (!ms) return "00:00:00";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map(n => String(n).padStart(2, "0")).join(":");
}

function useNow() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  return now;
}

// ─── BOTTOM SHEET ─────────────────────────────────────────────────────────────
function Sheet({ open, onClose, title, children, tall }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" style={{ fontFamily: "inherit" }}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative bg-white rounded-t-3xl shadow-2xl flex flex-col transition-transform duration-300 ${tall ? "max-h-[92vh]" : "max-h-[80vh]"}`}
        style={{ animation: "slideUp 0.28s cubic-bezier(.32,1.2,.64,1) both" }}>
        <style>{`@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100 shrink-0">
          <div className="absolute top-3 left-1/2 -translate-x-1/2 w-10 h-1 bg-gray-200 rounded-full" />
          <h2 className="text-base font-bold text-gray-800">{title}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 pb-8 pt-4 space-y-4">{children}</div>
      </div>
    </div>
  );
}

// ─── FIELD + INPUT ────────────────────────────────────────────────────────────
const Label = ({ children }) => <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{children}</p>;
const TInput = ({ ...p }) => <input className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition" {...p} />;
const PillSelect = ({ options, value, onChange }) => (
  <div className="flex flex-wrap gap-2">
    {options.map(o => (
      <button key={o} onClick={() => onChange(o)}
        className={`px-3 py-1.5 rounded-full text-xs font-semibold transition border
          ${value === o ? "bg-indigo-600 text-white border-indigo-600" : "bg-gray-100 text-gray-500 border-transparent hover:bg-gray-200"}`}>
        {o}
      </button>
    ))}
  </div>
);
const SaveBtn = ({ onClick, children = "Save", disabled }) => (
  <button onClick={onClick} disabled={disabled}
    className="w-full bg-indigo-600 hover:bg-indigo-700 active:scale-95 disabled:opacity-50 text-white font-semibold py-3.5 rounded-2xl transition text-sm">
    {children}
  </button>
);
const CancelBtn = ({ onClick }) => (
  <button onClick={onClick} className="w-full bg-gray-100 hover:bg-gray-200 text-gray-600 font-semibold py-3.5 rounded-2xl transition text-sm">
    Cancel
  </button>
);

// ─── STATUS BADGE ─────────────────────────────────────────────────────────────
const StatusBadge = ({ status }) => {
  const m = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold ${m.bg} ${m.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />{m.label}
    </span>
  );
};

// ─── TABLE CARD ───────────────────────────────────────────────────────────────
function TableCard({ table, now, onStatusClick, onEditClick, onDeleteClick }) {
  const m = STATUS_META[table.status];
  const waiter = WAITERS.find(w => w.id === table.waiterId);
  const timeElapsed = table.status === "occupied" && table.occupiedAt ? now - table.occupiedAt : 0;

  return (
    <div className={`bg-white rounded-2xl border-2 ${m.border} shadow-sm overflow-hidden flex flex-col`}>
      {/* Card top */}
      <div className="px-3 pt-3 pb-2 flex items-start justify-between gap-1">
        <div className="min-w-0">
          <button onClick={() => onEditClick(table)}
            className="text-sm font-bold text-gray-800 hover:text-indigo-600 transition flex items-center gap-1">
            <span className="truncate">{table.name}</span>
            <Edit2 className="w-3 h-3 shrink-0" />
          </button>
          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
            <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${SEC_COLORS[table.section] || "bg-gray-100 text-gray-600"}`}>{table.section}</span>
            <span className="text-[9px] text-gray-400">{table.seats} seats</span>
          </div>
        </div>
        <StatusBadge status={table.status} />
      </div>

      {/* Body */}
      <div className="px-3 pb-2 flex-1">
        {table.status === "occupied" && (
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-red-600">
              <Clock className="w-3 h-3" />
              <span className="text-xs font-mono font-bold">{elapsed(timeElapsed)}</span>
            </div>
            <p className="text-xs font-bold text-gray-800">{currency(table.orderTotal)}</p>
            {waiter && (
              <div className="flex items-center gap-1">
                <UserCheck className="w-3 h-3 text-gray-400" />
                <span className="text-[10px] text-gray-500">{waiter.name}</span>
              </div>
            )}
            <p className="text-[10px] text-gray-400">{table.guests} guest{table.guests !== 1 ? "s" : ""}</p>
          </div>
        )}
        {table.status === "reserved" && table.reservation && (
          <div className="space-y-0.5">
            <p className="text-xs font-bold text-blue-700">{table.reservation.guest}</p>
            <p className="text-[10px] text-gray-500">{table.reservation.time} · {table.reservation.date}</p>
            <p className="text-[10px] text-gray-400">{table.reservation.phone}</p>
          </div>
        )}
        {table.status === "cleaning" && (
          <div className="flex items-center gap-1 text-yellow-600">
            <RefreshCw className="w-3 h-3" />
            <span className="text-xs font-medium">Being cleaned</span>
          </div>
        )}
        {table.status === "free" && (
          <p className="text-[10px] text-gray-400">Available</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex border-t border-gray-100">
        <button onClick={() => onStatusClick(table)}
          className="flex-1 py-2 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 transition">
          Status
        </button>
        <div className="w-px bg-gray-100" />
        <button onClick={() => onDeleteClick(table)}
          className="flex-1 py-2 text-xs font-semibold text-red-500 hover:bg-red-50 transition">
          Delete
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════════════════
export default function TablesManagement() {
  const now = useNow();
  const [tables, setTables] = useState(SEED_TABLES);
  const [activeNav, setActiveNav] = useState("tables");
  const [section, setSection] = useState("All");
  const [summaryOpen, setSummaryOpen] = useState(false);

  // ── Sheet state ─────────────────────────────────────────────────────────────
  const [addSheet,    setAddSheet]    = useState(false);
  const [editSheet,   setEditSheet]   = useState(null);  // table | null
  const [statusSheet, setStatusSheet] = useState(null);  // table | null
  const [deleteTarget, setDeleteTarget] = useState(null);

  // ── Add/Edit form ────────────────────────────────────────────────────────────
  const blankForm = { name: "", seats: "4", section: "Indoor", shape: "Square" };
  const [form, setForm] = useState(blankForm);
  const fi = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // ── Status form ──────────────────────────────────────────────────────────────
  const [newStatus, setNewStatus]   = useState("free");
  const [occGuests, setOccGuests]   = useState("2");
  const [occWaiter, setOccWaiter]   = useState(1);
  const [resGuest,  setResGuest]    = useState("");
  const [resPhone,  setResPhone]    = useState("");
  const [resDate,   setResDate]     = useState("");
  const [resTime,   setResTime]     = useState("");

  // ── Computed ─────────────────────────────────────────────────────────────────
  const filtered = tables.filter(t => section === "All" || t.section === section);

  const statusCounts = {
    free:     tables.filter(t => t.status === "free").length,
    occupied: tables.filter(t => t.status === "occupied").length,
    reserved: tables.filter(t => t.status === "reserved").length,
    cleaning: tables.filter(t => t.status === "cleaning").length,
  };

  const occupancyRate = tables.length ? Math.round((statusCounts.occupied / tables.length) * 100) : 0;
  const totalOrderValue = tables.filter(t => t.status === "occupied").reduce((s, t) => s + (t.orderTotal || 0), 0);

  // ── Add table ────────────────────────────────────────────────────────────────
  function addTable() {
    if (!form.name.trim()) return;
    const newTable = {
      id: Date.now(),
      name: form.name.trim(),
      seats: parseInt(form.seats) || 2,
      section: form.section,
      shape: form.shape,
      status: "free",
      occupiedAt: null, guests: 0, waiterId: null, orderTotal: 0,
    };
    setTables(p => [...p, newTable]);
    setForm(blankForm);
    setAddSheet(false);
  }

  // ── Edit table ───────────────────────────────────────────────────────────────
  function openEdit(t) {
    setForm({ name: t.name, seats: String(t.seats), section: t.section, shape: t.shape });
    setEditSheet(t);
  }
  function saveEdit() {
    if (!form.name.trim()) return;
    setTables(p => p.map(t => t.id === editSheet.id
      ? { ...t, name: form.name.trim(), seats: parseInt(form.seats) || 2, section: form.section, shape: form.shape }
      : t
    ));
    setEditSheet(null);
  }

  // ── Delete table ─────────────────────────────────────────────────────────────
  function requestDelete(t) {
    if (t.status === "occupied" || t.status === "reserved") {
      setDeleteTarget({ table: t, blocked: true });
    } else {
      setDeleteTarget({ table: t, blocked: false });
    }
  }
  function confirmDelete() {
    setTables(p => p.filter(t => t.id !== deleteTarget.table.id));
    setDeleteTarget(null);
  }

  // ── Open status sheet ────────────────────────────────────────────────────────
  function openStatus(t) {
    setNewStatus(t.status);
    setOccGuests("2");
    setOccWaiter(WAITERS[0].id);
    setResGuest(""); setResPhone(""); setResDate(""); setResTime("");
    setStatusSheet(t);
  }

  // ── Apply status ─────────────────────────────────────────────────────────────
  function applyStatus() {
    setTables(p => p.map(t => {
      if (t.id !== statusSheet.id) return t;
      if (newStatus === "occupied") {
        return { ...t, status: "occupied", occupiedAt: Date.now(), guests: parseInt(occGuests) || 1, waiterId: parseInt(occWaiter), orderTotal: 0 };
      }
      if (newStatus === "reserved") {
        return { ...t, status: "reserved", occupiedAt: null, guests: 0, waiterId: null, orderTotal: 0, reservation: { guest: resGuest, phone: resPhone, date: resDate, time: resTime } };
      }
      if (newStatus === "free") {
        return { ...t, status: "free", occupiedAt: null, guests: 0, waiterId: null, orderTotal: 0, reservation: null };
      }
      if (newStatus === "cleaning") {
        return { ...t, status: "cleaning", occupiedAt: null, guests: 0, orderTotal: 0 };
      }
      return t;
    }));
    setStatusSheet(null);
  }

  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-200 p-4">
      {/* Phone shell */}
      <div className="w-full max-w-sm bg-white rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col"
        style={{ height: "812px", maxHeight: "95vh" }}>

        {/* Status bar */}
        <div className="bg-white px-6 pt-3 pb-1 flex items-center justify-between shrink-0">
          <span className="text-xs font-bold text-gray-800">9:41</span>
          <div className="flex items-center gap-1">
            <div className="flex gap-0.5 items-end h-3">
              {[3,5,7,9].map((h,i) => <div key={i} className="w-1 bg-gray-800 rounded-sm" style={{height:h}} />)}
            </div>
            <div className="w-5 h-2.5 border border-gray-800 rounded-sm relative ml-1">
              <div className="absolute left-0.5 top-0.5 bottom-0.5 w-3 bg-gray-800 rounded-sm" />
              <div className="absolute -right-1 top-1/2 -translate-y-1/2 w-0.5 h-1.5 bg-gray-800 rounded-full" />
            </div>
          </div>
        </div>

        {/* Header */}
        <div className="bg-white px-4 py-3 flex items-center justify-between border-b border-gray-100 shrink-0">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Tables</h1>
            <p className="text-[10px] text-gray-400">Restaurant Admin</p>
          </div>
          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
            <span className="text-sm font-bold text-indigo-700">A</span>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col bg-gray-50 relative">

          {/* ── Top Status Bar ── */}
          <div className="bg-white px-4 py-2.5 flex items-center justify-between border-b border-gray-100 shrink-0">
            {[
              { label: "Free",     count: statusCounts.free,     color: "text-green-600" },
              { label: "Occupied", count: statusCounts.occupied,  color: "text-red-600"   },
              { label: "Reserved", count: statusCounts.reserved,  color: "text-blue-600"  },
              { label: "Total",    count: tables.length,          color: "text-gray-700"  },
            ].map(({ label, count, color }) => (
              <div key={label} className="text-center">
                <p className={`text-base font-black ${color}`}>{count}</p>
                <p className="text-[9px] text-gray-400 font-semibold">{label}</p>
              </div>
            ))}
          </div>

          {/* ── Floor Summary (collapsible) ── */}
          <button
            onClick={() => setSummaryOpen(p => !p)}
            className="w-full flex items-center justify-between px-4 py-2 bg-indigo-600 text-white text-xs font-semibold shrink-0">
            <span>Floor Summary</span>
            {summaryOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {summaryOpen && (
            <div className="bg-indigo-50 border-b border-indigo-100 px-4 py-3 flex gap-4 shrink-0">
              <div className="text-center flex-1">
                <p className="text-base font-black text-indigo-700">{tables.length}</p>
                <p className="text-[9px] text-indigo-400 font-semibold">Total Tables</p>
              </div>
              <div className="text-center flex-1">
                <p className="text-base font-black text-indigo-700">{occupancyRate}%</p>
                <p className="text-[9px] text-indigo-400 font-semibold">Occupied</p>
              </div>
              <div className="text-center flex-1">
                <p className="text-sm font-black text-indigo-700">{(totalOrderValue/1000).toFixed(0)}K</p>
                <p className="text-[9px] text-indigo-400 font-semibold">so'm Active</p>
              </div>
            </div>
          )}

          {/* ── Section Tabs ── */}
          <div className="bg-white border-b border-gray-100 shrink-0">
            <div className="flex overflow-x-auto scrollbar-hide px-2 gap-1 py-2">
              {SECTIONS.map(s => (
                <button key={s} onClick={() => setSection(s)}
                  className={`px-3 py-1.5 rounded-full text-[10px] font-bold whitespace-nowrap transition shrink-0
                    ${section === s ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* ── Table Grid ── */}
          <div className="flex-1 overflow-y-auto p-3 pb-20">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-300 gap-2">
                <LayoutGrid className="w-12 h-12" />
                <p className="text-sm font-semibold">No tables in this section</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                {filtered.map(table => (
                  <TableCard
                    key={table.id}
                    table={table}
                    now={now}
                    onStatusClick={openStatus}
                    onEditClick={openEdit}
                    onDeleteClick={requestDelete}
                  />
                ))}
              </div>
            )}
          </div>

          {/* ── FAB ── */}
          <button
            onClick={() => { setForm(blankForm); setAddSheet(true); }}
            className="absolute bottom-4 right-4 w-12 h-12 bg-indigo-600 hover:bg-indigo-700 active:scale-95 rounded-full shadow-lg flex items-center justify-center transition z-10">
            <Plus className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Bottom Nav */}
        <div className="bg-white border-t border-gray-100 px-1 pb-2 pt-1 shrink-0">
          <div className="flex items-center">
            {NAV.map(({ id, label, Icon }) => {
              const active = activeNav === id;
              return (
                <button key={id} onClick={() => setActiveNav(id)}
                  className={`flex-1 flex flex-col items-center py-1.5 gap-0.5 rounded-xl transition
                    ${active ? "text-indigo-600" : "text-gray-400 hover:text-gray-600"}`}>
                  <div className={`p-1 rounded-lg transition ${active ? "bg-indigo-100" : ""}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className={`text-[8px] font-semibold ${active ? "text-indigo-600" : "text-gray-400"}`}>{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ════════ SHEETS ════════ */}

      {/* ── Add Table ── */}
      <Sheet open={addSheet} onClose={() => setAddSheet(false)} title="Add Table">
        <div>
          <Label>Table Name</Label>
          <TInput value={form.name} onChange={e => fi("name", e.target.value)} placeholder='e.g. Table 9' />
        </div>
        <div>
          <Label>Number of Seats</Label>
          <TInput type="number" value={form.seats} onChange={e => fi("seats", e.target.value)} min="1" max="20" />
        </div>
        <div>
          <Label>Section</Label>
          <PillSelect options={SEC_OPTIONS} value={form.section} onChange={v => fi("section", v)} />
        </div>
        <div>
          <Label>Shape</Label>
          <PillSelect options={SHAPES} value={form.shape} onChange={v => fi("shape", v)} />
        </div>
        <SaveBtn onClick={addTable}>Add Table</SaveBtn>
        <CancelBtn onClick={() => setAddSheet(false)} />
      </Sheet>

      {/* ── Edit Table ── */}
      <Sheet open={!!editSheet} onClose={() => setEditSheet(null)} title={`Edit — ${editSheet?.name || ""}`}>
        <div>
          <Label>Table Name</Label>
          <TInput value={form.name} onChange={e => fi("name", e.target.value)} placeholder="Table name" />
        </div>
        <div>
          <Label>Number of Seats</Label>
          <TInput type="number" value={form.seats} onChange={e => fi("seats", e.target.value)} min="1" max="20" />
        </div>
        <div>
          <Label>Section</Label>
          <PillSelect options={SEC_OPTIONS} value={form.section} onChange={v => fi("section", v)} />
        </div>
        <div>
          <Label>Shape</Label>
          <PillSelect options={SHAPES} value={form.shape} onChange={v => fi("shape", v)} />
        </div>
        <SaveBtn onClick={saveEdit}>Save Changes</SaveBtn>
        <CancelBtn onClick={() => setEditSheet(null)} />
      </Sheet>

      {/* ── Status Sheet ── */}
      <Sheet open={!!statusSheet} onClose={() => setStatusSheet(null)} title={`Status — ${statusSheet?.name || ""}`} tall>
        <div>
          <Label>Select Status</Label>
          <div className="grid grid-cols-2 gap-2">
            {STATUSES.map(s => {
              const m = STATUS_META[s];
              return (
                <button key={s} onClick={() => setNewStatus(s)}
                  className={`flex items-center gap-2 px-3 py-3 rounded-2xl border-2 text-left transition
                    ${newStatus === s ? `${m.bg} ${m.border} ${m.text}` : "bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100"}`}>
                  <span className={`w-2.5 h-2.5 rounded-full ${m.dot} shrink-0`} />
                  <span className="text-xs font-bold">{m.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Occupied fields */}
        {newStatus === "occupied" && (
          <div className="space-y-4 border-t border-gray-100 pt-4">
            <div>
              <Label>Number of Guests</Label>
              <TInput type="number" value={occGuests} onChange={e => setOccGuests(e.target.value)} min="1" placeholder="e.g. 3" />
            </div>
            <div>
              <Label>Assign Waiter</Label>
              <div className="flex flex-wrap gap-2">
                {WAITERS.map(w => (
                  <button key={w.id} onClick={() => setOccWaiter(w.id)}
                    className={`px-4 py-2 rounded-full text-xs font-semibold transition border
                      ${occWaiter === w.id ? "bg-indigo-600 text-white border-indigo-600" : "bg-gray-100 text-gray-600 border-transparent hover:bg-gray-200"}`}>
                    {w.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Reserved fields */}
        {newStatus === "reserved" && (
          <div className="space-y-3 border-t border-gray-100 pt-4">
            <div>
              <Label>Guest Name</Label>
              <TInput value={resGuest} onChange={e => setResGuest(e.target.value)} placeholder="Full name" />
            </div>
            <div>
              <Label>Phone Number</Label>
              <TInput value={resPhone} onChange={e => setResPhone(e.target.value)} placeholder="+998 90 ..." type="tel" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Date</Label>
                <TInput type="date" value={resDate} onChange={e => setResDate(e.target.value)} />
              </div>
              <div>
                <Label>Time</Label>
                <TInput type="time" value={resTime} onChange={e => setResTime(e.target.value)} />
              </div>
            </div>
          </div>
        )}

        <SaveBtn onClick={applyStatus}>Apply Status</SaveBtn>
        <CancelBtn onClick={() => setStatusSheet(null)} />
      </Sheet>

      {/* ── Delete Confirm ── */}
      <Sheet open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Table">
        {deleteTarget?.blocked ? (
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center">
              <AlertCircle className="w-7 h-7 text-red-500" />
            </div>
            <p className="text-sm font-bold text-gray-800 text-center">Cannot Delete</p>
            <p className="text-xs text-gray-500 text-center">
              <strong>{deleteTarget.table.name}</strong> is currently{" "}
              <strong>{deleteTarget.table.status}</strong>. Change its status to Free or Needs Cleaning first.
            </p>
            <button onClick={() => setDeleteTarget(null)}
              className="w-full bg-gray-100 text-gray-700 font-semibold py-3 rounded-2xl text-sm hover:bg-gray-200 transition mt-2">
              Got It
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center">
              <Trash2 className="w-7 h-7 text-red-500" />
            </div>
            <p className="text-sm font-bold text-gray-800">Delete {deleteTarget?.table.name}?</p>
            <p className="text-xs text-gray-500 text-center">This action cannot be undone.</p>
            <div className="w-full space-y-2 mt-2">
              <button onClick={confirmDelete}
                className="w-full bg-red-500 hover:bg-red-600 text-white font-semibold py-3 rounded-2xl text-sm transition active:scale-95">
                Yes, Delete
              </button>
              <CancelBtn onClick={() => setDeleteTarget(null)} />
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}

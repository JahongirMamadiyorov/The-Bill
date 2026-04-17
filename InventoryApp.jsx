import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  Home, Table2, UtensilsCrossed, Package, ClipboardList, Users, User,
  Search, Plus, X, ChevronDown, ChevronUp, Edit2, Trash2, Save,
  Truck, ArrowDownCircle, AlertTriangle, CheckCircle, XCircle,
  Clock, Filter, ChevronRight, Bell, ShoppingBag, CreditCard, ChefHat,
  CheckCheck, Settings, Store, Check, BarChart2, Banknote, UserCheck, Minus,
} from "lucide-react";

// ─── DATE HELPERS ─────────────────────────────────────────────────────────────
const today = new Date();
const fmtDate = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return fmtDate(r); };

// ─── INVENTORY SEED DATA ──────────────────────────────────────────────────────
const SEED_SUPPLIERS = [
  { id: 1, name: "FreshFarm Co.", category: "Food", phone: "+998 90 111 2233", email: "ali@freshfarm.uz", contact: "Ali Karimov" },
  { id: 2, name: "BeverageWorld", category: "Beverage", phone: "+998 91 444 5566", email: "sara@bevworld.uz", contact: "Sara Lee" },
  { id: 3, name: "CleanPro Supply", category: "Cleaning", phone: "+998 93 777 8899", email: "john@cleanpro.uz", contact: "John Doe" },
];

const SEED_ITEMS = [
  { id: 1, name: "Chicken Breast", category: "Food", unit: "kg", stock: 45, minStock: 20, unitCost: 12000, expiry: addDays(today, 5) },
  { id: 2, name: "Tomatoes", category: "Food", unit: "kg", stock: 8, minStock: 15, unitCost: 3500, expiry: addDays(today, 3) },
  { id: 3, name: "Olive Oil", category: "Food", unit: "liter", stock: 12, minStock: 10, unitCost: 28000, expiry: addDays(today, 120) },
  { id: 4, name: "Cola (330ml)", category: "Beverage", unit: "piece", stock: 0, minStock: 50, unitCost: 2500, expiry: addDays(today, 180) },
  { id: 5, name: "Mineral Water", category: "Beverage", unit: "bottle", stock: 120, minStock: 60, unitCost: 1200, expiry: addDays(today, 90) },
  { id: 6, name: "Flour", category: "Food", unit: "kg", stock: 60, minStock: 30, unitCost: 4000, expiry: addDays(today, 30) },
  { id: 7, name: "Sugar", category: "Food", unit: "kg", stock: 14, minStock: 20, unitCost: 3800, expiry: addDays(today, 60) },
  { id: 8, name: "Take-away Boxes", category: "Packaging", unit: "box", stock: 3, minStock: 50, unitCost: 800, expiry: "" },
  { id: 9, name: "Dish Soap", category: "Cleaning", unit: "bottle", stock: 18, minStock: 10, unitCost: 9500, expiry: addDays(today, 200) },
  { id: 10, name: "Paper Napkins", category: "Packaging", unit: "box", stock: 30, minStock: 20, unitCost: 5500, expiry: "" },
];

const SEED_DELIVERIES = [
  { id: 1, supplier: "FreshFarm Co.", date: addDays(today, -10), invoice: "INV-001", lines: [{ name: "Chicken Breast", qty: 30, unitPrice: 11500 }, { name: "Tomatoes", qty: 20, unitPrice: 3300 }] },
  { id: 2, supplier: "BeverageWorld", date: addDays(today, -8), invoice: "INV-002", lines: [{ name: "Mineral Water", qty: 100, unitPrice: 1100 }, { name: "Cola (330ml)", qty: 60, unitPrice: 2400 }] },
  { id: 3, supplier: "CleanPro Supply", date: addDays(today, -15), invoice: "INV-003", lines: [{ name: "Dish Soap", qty: 20, unitPrice: 9000 }] },
  { id: 4, supplier: "FreshFarm Co.", date: addDays(today, -20), invoice: "INV-004", lines: [{ name: "Flour", qty: 50, unitPrice: 3900 }, { name: "Sugar", qty: 25, unitPrice: 3700 }] },
  { id: 5, supplier: "FreshFarm Co.", date: addDays(today, -3), invoice: "INV-005", lines: [{ name: "Take-away Boxes", qty: 100, unitPrice: 750 }, { name: "Paper Napkins", qty: 40, unitPrice: 5200 }] },
];

const SEED_OUTPUTS = [
  { id: 1, itemName: "Chicken Breast", itemId: 1, qty: 15, reason: "Kitchen Use", date: addDays(today, -2), note: "Dinner service" },
  { id: 2, itemName: "Tomatoes", itemId: 2, qty: 5, reason: "Waste", date: addDays(today, -1), note: "Expired" },
  { id: 3, itemName: "Cola (330ml)", itemId: 4, qty: 60, reason: "Kitchen Use", date: addDays(today, -3), note: "Bar service" },
  { id: 4, itemName: "Flour", itemId: 6, qty: 10, reason: "Kitchen Use", date: addDays(today, -5), note: "Baking" },
  { id: 5, itemName: "Sugar", itemId: 7, qty: 6, reason: "Spoilage", date: addDays(today, -4), note: "Moisture damage" },
];

// ─── ORDERS SEED DATA ─────────────────────────────────────────────────────────
const SIMPLE_MENU = [
  { id: 1, name: "Shashlik",    price: 35000 },
  { id: 2, name: "Plov",        price: 30000 },
  { id: 3, name: "Lagman",      price: 25000 },
  { id: 4, name: "Samsa",       price: 12000 },
  { id: 5, name: "Tea",         price:  5000 },
  { id: 6, name: "Cola",        price:  8000 },
  { id: 7, name: "Fresh Juice", price: 15000 },
  { id: 8, name: "Manti",       price: 28000 },
];
const SIMPLE_TABLES = ["Table 1", "Table 2", "Table 3", "Table 4", "Table 5", "VIP Room"];

const SEED_ORDERS = [
  { id: "0041", table: "Table 2", items: ["Plov ×2", "Tea ×2"],              total:  70000, status: "Preparing", time: "12:30" },
  { id: "0042", table: "Table 5", items: ["Shashlik ×3", "Cola ×3"],          total: 129000, status: "Ready",     time: "12:45" },
  { id: "0043", table: "VIP Room", items: ["Lagman ×4", "Samsa ×4"],          total: 148000, status: "Paid",      time: "11:30" },
  { id: "0044", table: "Table 1", items: ["Manti ×2", "Fresh Juice ×2"],      total:  86000, status: "Pending",   time: "13:05" },
];

// ─── STAFF SEED DATA ──────────────────────────────────────────────────────────
const SEED_STAFF = [
  { id: "s1", name: "Aisha Karimova",   role: "Waitress", shiftStart: "09:00", clockedIn: true,  clockInTime: "09:03", status: "active" },
  { id: "s2", name: "Bobur Toshmatov",  role: "Kitchen",  shiftStart: "08:00", clockedIn: true,  clockInTime: "08:25", status: "active" },
  { id: "s3", name: "Kamola Yusupova",  role: "Bar",      shiftStart: "12:00", clockedIn: false, clockInTime: null,    status: "active" },
  { id: "s4", name: "Jasur Nazarov",    role: "Cashier",  shiftStart: "09:00", clockedIn: false, clockInTime: null,    status: "suspended" },
  { id: "s5", name: "Dilnoza Hamidova", role: "Cleaner",  shiftStart: "07:00", clockedIn: true,  clockInTime: "07:00", status: "active" },
];

// ─── NOTIFICATIONS SEED DATA ──────────────────────────────────────────────────
const tsNow = Date.now();
const SEED_NOTIFICATIONS = [
  { id: "n1", type: "new_order",     title: "New Order #0047",     description: "Table 3 has placed an order",               time: tsNow - 3  * 60000,    read: false },
  { id: "n2", type: "payment",       title: "Payment Received",    description: "Order #0044 paid — 285,000 so'm",            time: tsNow - 18 * 60000,    read: false },
  { id: "n3", type: "low_stock",     title: "Low Stock Alert",     description: "Tomatoes is running low (8 kg remaining)",   time: tsNow - 47 * 60000,    read: false },
  { id: "n4", type: "kitchen_ready", title: "Order Ready",         description: "Order #0043 is ready for Table 1",           time: tsNow - 2  * 3600000,  read: true  },
  { id: "n5", type: "staff_late",    title: "Staff Late",          description: "Bobur Toshmatov clocked in 25 minutes late", time: tsNow - 5  * 3600000,  read: true  },
];

// ─── NOTIFICATION META ────────────────────────────────────────────────────────
const NOTIF_META = {
  new_order:     { Icon: ShoppingBag, bg: "#eff6ff", color: "#2563eb" },
  low_stock:     { Icon: Package,     bg: "#fff7ed", color: "#f97316" },
  staff_late:    { Icon: Clock,       bg: "#fff1f2", color: "#dc2626" },
  payment:       { Icon: CreditCard,  bg: "#f0fdf4", color: "#16a34a" },
  kitchen_ready: { Icon: ChefHat,     bg: "#faf5ff", color: "#9333ea" },
};

const NOTIF_NAV = {
  new_order: "orders", low_stock: "inventory",
  staff_late: "staff", payment: "orders", kitchen_ready: "orders",
};

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const CATEGORIES    = ["Food", "Beverage", "Packaging", "Cleaning", "Other"];
const UNITS         = ["kg", "g", "liter", "piece", "box", "bottle"];
const OUTPUT_REASONS = ["Kitchen Use", "Waste", "Spoilage", "Transfer"];

const NAV_ITEMS = [
  { id: "home",      icon: Home          },
  { id: "tables",    icon: Table2        },
  { id: "menu",      icon: UtensilsCrossed },
  { id: "inventory", icon: Package       },
  { id: "orders",    icon: ClipboardList },
  { id: "staff",     icon: Users         },
  { id: "profile",   icon: User          },
];

const LANG = {
  English: { home: "Home", tables: "Tables", menu: "Menu", inventory: "Inventory", orders: "Orders", staff: "Staff", profile: "Settings" },
  Russian: { home: "Главная", tables: "Столики", menu: "Меню", inventory: "Склад", orders: "Заказы", staff: "Персонал", profile: "Настройки" },
  Uzbek:   { home: "Bosh", tables: "Stollar", menu: "Menyu", inventory: "Inventar", orders: "Buyurtmalar", staff: "Xodimlar", profile: "Sozlamalar" },
};

const ROLE_STYLE = {
  Waitress: { bg: "#dbeafe", color: "#1e40af" },
  Kitchen:  { bg: "#ffedd5", color: "#9a3412" },
  Bar:      { bg: "#f3e8ff", color: "#6b21a8" },
  Cashier:  { bg: "#dcfce7", color: "#166534" },
  Cleaner:  { bg: "#f1f5f9", color: "#475569" },
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const currency = (v) => new Intl.NumberFormat("uz-UZ").format(Math.round(v)) + " so'm";
const fmtCurrency = (n, curr = "so'm") => new Intl.NumberFormat("uz-UZ").format(Math.round(n)) + " " + curr;
const deliveryTotal = (d) => d.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);

const stockStatus = (item) => {
  if (item.stock === 0) return "critical";
  if (item.stock < item.minStock) return "low";
  return "ok";
};

const isExpiringSoon = (item) => {
  if (!item.expiry) return false;
  const diff = (new Date(item.expiry) - today) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= 7;
};

const statusDot = { ok: "bg-green-500", low: "bg-yellow-400", critical: "bg-red-500" };
const catColors = {
  Food: "bg-orange-100 text-orange-700",
  Beverage: "bg-blue-100 text-blue-700",
  Packaging: "bg-purple-100 text-purple-700",
  Cleaning: "bg-teal-100 text-teal-700",
  Other: "bg-gray-100 text-gray-600",
};

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return "Yesterday";
}

// ─── BOTTOM SHEET ─────────────────────────────────────────────────────────────
const BottomSheet = ({ open, onClose, title, children, tall }) => {
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <div className={`fixed inset-0 z-50 transition-all duration-300 ${open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className={`absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl transition-transform duration-300 ${open ? "translate-y-0" : "translate-y-full"} ${tall ? "max-h-[92vh]" : "max-h-[80vh]"} flex flex-col`}>
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100 shrink-0">
          <div className="w-10 h-1 bg-gray-200 rounded-full absolute top-3 left-1/2 -translate-x-1/2" />
          <h2 className="text-base font-bold text-gray-800">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-full bg-gray-100 hover:bg-gray-200 transition"><X className="w-4 h-4 text-gray-500" /></button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 pb-6 pt-4">{children}</div>
      </div>
    </div>
  );
};

// ─── MINI COMPONENTS ─────────────────────────────────────────────────────────
const Field = ({ label, children }) => (
  <div className="space-y-1.5">
    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</label>
    {children}
  </div>
);

const Input = (props) => (
  <input className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition" {...props} />
);

const Sel = ({ children, ...props }) => (
  <select className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition" {...props}>{children}</select>
);

const Pill = ({ children, active, onClick, color }) => (
  <button onClick={onClick}
    className={`px-4 py-1.5 rounded-full text-xs font-semibold transition whitespace-nowrap
      ${active ? (color || "bg-indigo-600 text-white") : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
    {children}
  </button>
);

const StatPill = ({ label, count, color }) => (
  <div className={`flex-1 rounded-2xl px-3 py-2.5 ${color} text-center`}>
    <p className="text-lg font-bold">{count}</p>
    <p className="text-xs font-medium opacity-80">{label}</p>
  </div>
);

const SaveBtn = ({ onClick, children = "Save" }) => (
  <button onClick={onClick}
    className="w-full bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-semibold py-3.5 rounded-2xl transition text-sm flex items-center justify-center gap-2">
    <Save className="w-4 h-4" />{children}
  </button>
);

const CancelBtn = ({ onClick }) => (
  <button onClick={onClick}
    className="w-full bg-gray-100 hover:bg-gray-200 text-gray-600 font-semibold py-3.5 rounded-2xl transition text-sm">
    Cancel
  </button>
);

const Toggle = ({ on, onToggle }) => (
  <button onClick={onToggle} style={{
    width: 44, height: 24, borderRadius: 99, flexShrink: 0,
    background: on ? "#4f46e5" : "#e2e8f0", border: "none",
    cursor: "pointer", position: "relative", transition: "background 0.2s",
  }}>
    <span style={{
      position: "absolute", top: 3, left: on ? 23 : 3,
      width: 18, height: 18, borderRadius: "50%", background: "#fff",
      boxShadow: "0 1px 4px rgba(0,0,0,0.2)", transition: "left 0.2s",
    }} />
  </button>
);

const SectionLabel = ({ children }) => (
  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1 pt-5 pb-1">{children}</p>
);

// ─── TOAST ────────────────────────────────────────────────────────────────────
const Toast = ({ msg, visible }) => (
  <div style={{
    position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)",
    zIndex: 9999, transition: "opacity 0.25s", opacity: visible ? 1 : 0, pointerEvents: "none",
  }}>
    <div style={{
      background: "#16a34a", color: "#fff", padding: "9px 20px", borderRadius: 99,
      fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6,
      boxShadow: "0 4px 20px rgba(0,0,0,0.18)",
    }}>
      <Check size={14} /> {msg}
    </div>
  </div>
);

// ══════════════════════════════════════════════════════════════════════════════
// INVENTORY SCREEN (user's fixed version — only addNotification prop added)
// ══════════════════════════════════════════════════════════════════════════════
const InventoryScreen = ({ items, setItems, deliveries, setDeliveries, outputs, setOutputs, suppliers, setSuppliers, addNotification }) => {
  const [innerTab, setInnerTab] = useState("inventory");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");

  const [itemSheet, setItemSheet] = useState(null);
  const [deliverySheet, setDeliverySheet] = useState(false);
  const [outputSheet, setOutputSheet] = useState(false);
  const [supplierSheet, setSupplierSheet] = useState(null);

  const blankItem = { name: "", category: "Food", unit: "kg", stock: 0, minStock: 0, unitCost: 0, expiry: "" };
  const [itemForm, setItemForm] = useState(blankItem);
  const [deliveryForm, setDeliveryForm] = useState({ supplier: "", date: fmtDate(today), invoice: "", lines: [] });
  const [delivLine, setDelivLine] = useState({ name: "", qty: 1, unitPrice: 0 });
  const [outputForm, setOutputForm] = useState({ itemId: "", qty: 1, reason: "Kitchen Use", date: fmtDate(today), note: "" });
  const [supForm, setSupForm] = useState({ name: "", category: "Food", phone: "", email: "", contact: "" });

  const lowCount = useMemo(() => items.filter(i => stockStatus(i) === "low").length, [items]);
  const outCount = useMemo(() => items.filter(i => stockStatus(i) === "critical").length, [items]);
  const expCount = useMemo(() => items.filter(isExpiringSoon).length, [items]);

  const bannerStatus = useMemo(() => {
    if (outCount > 0) return "critical";
    if (lowCount > 0) return "low";
    return "ok";
  }, [outCount, lowCount]);

  const bannerConfig = {
    ok:       { bg: "bg-green-500",  icon: CheckCircle, text: "All stock levels healthy" },
    low:      { bg: "bg-yellow-400", icon: AlertTriangle, text: `${lowCount} item${lowCount !== 1 ? "s" : ""} low on stock` },
    critical: { bg: "bg-red-500",    icon: XCircle, text: `${outCount} item${outCount !== 1 ? "s are" : " is"} out of stock` },
  };
  const bc = bannerConfig[bannerStatus];

  const filtered = useMemo(() => items.filter(item => {
    const matchSearch = item.name.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === "All" || (filter === "Low Stock" && stockStatus(item) === "low") || (filter === "Expiring" && isExpiringSoon(item));
    return matchSearch && matchFilter;
  }), [items, search, filter]);

  const openAddItem  = () => { setItemForm(blankItem); setItemSheet({ mode: "add" }); };
  const openEditItem = (item) => { setItemForm({ ...item }); setItemSheet({ mode: "edit", item }); };
  const saveItem = () => {
    const it = { ...itemForm, stock: +itemForm.stock, minStock: +itemForm.minStock, unitCost: +itemForm.unitCost };
    if (!it.name.trim()) return;
    if (itemSheet.mode === "add") setItems(p => [...p, { ...it, id: Date.now() }]);
    else setItems(p => p.map(i => i.id === itemSheet.item.id ? { ...i, ...it } : i));
    setItemSheet(null);
  };
  const deleteItem = (id) => setItems(p => p.filter(i => i.id !== id));

  const addDelivLine = () => {
    if (!delivLine.name.trim() || delivLine.qty <= 0) return;
    setDeliveryForm(p => ({ ...p, lines: [...p.lines, { ...delivLine, qty: +delivLine.qty, unitPrice: +delivLine.unitPrice }] }));
    setDelivLine({ name: "", qty: 1, unitPrice: 0 });
  };
  const saveDelivery = () => {
    if (!deliveryForm.supplier || deliveryForm.lines.length === 0) return;
    setDeliveries(p => [{ ...deliveryForm, id: Date.now() }, ...p]);
    setItems(prev => prev.map(item => {
      const line = deliveryForm.lines.find(l => l.name.toLowerCase() === item.name.toLowerCase());
      return line ? { ...item, stock: item.stock + line.qty } : item;
    }));
    setDeliveryForm({ supplier: "", date: fmtDate(today), invoice: "", lines: [] });
    setDeliverySheet(false);
  };

  const saveOutput = () => {
    if (!outputForm.itemId || +outputForm.qty <= 0) return;
    const item = items.find(i => i.id === +outputForm.itemId);
    if (!item) return;
    const newStock = Math.max(0, item.stock - +outputForm.qty);
    setOutputs(p => [{ ...outputForm, id: Date.now(), itemName: item.name, qty: +outputForm.qty }, ...p]);
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, stock: newStock } : i));
    // ── Fire low-stock notification if stock drops below minimum ──
    if (newStock < item.minStock && addNotification) {
      addNotification({
        type: "low_stock",
        title: "Low Stock Alert",
        description: `${item.name} is running low (${newStock} ${item.unit} remaining)`,
      });
    }
    setOutputForm({ itemId: "", qty: 1, reason: "Kitchen Use", date: fmtDate(today), note: "" });
    setOutputSheet(false);
  };

  const openAddSup  = () => { setSupForm({ name: "", category: "Food", phone: "", email: "", contact: "" }); setSupplierSheet({ mode: "add" }); };
  const openEditSup = (s) => { setSupForm({ ...s }); setSupplierSheet({ mode: "edit", supplier: s }); };
  const saveSup = () => {
    if (!supForm.name.trim()) return;
    if (supplierSheet.mode === "add") setSuppliers(p => [...p, { ...supForm, id: Date.now() }]);
    else setSuppliers(p => p.map(s => s.id === supplierSheet.supplier.id ? { ...s, ...supForm } : s));
    setSupplierSheet(null);
  };
  const deleteSup = (id) => setSuppliers(p => p.filter(s => s.id !== id));

  const fi = (key, val) => setItemForm(p => ({ ...p, [key]: val }));

  return (
    <div className="flex flex-col h-full">
      {/* Status Banner */}
      <div className={`${bc.bg} flex items-center gap-2 px-4 py-2.5`}>
        <bc.icon className="w-4 h-4 text-white shrink-0" />
        <p className="text-white text-xs font-semibold">{bc.text}</p>
      </div>

      {/* Inner tabs */}
      <div className="flex border-b border-gray-100 bg-white px-2 shrink-0">
        {[
          { id: "inventory",  label: "Inventory",  icon: Package         },
          { id: "deliveries", label: "Deliveries", icon: Truck           },
          { id: "outputs",    label: "Output",     icon: ArrowDownCircle },
          { id: "suppliers",  label: "Suppliers",  icon: Users           },
        ].map(t => (
          <button key={t.id} onClick={() => setInnerTab(t.id)}
            className={`flex-1 flex flex-col items-center py-2.5 gap-0.5 text-[10px] font-semibold transition border-b-2
              ${innerTab === t.id ? "text-indigo-600 border-indigo-600" : "text-gray-400 border-transparent"}`}>
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto bg-gray-50">
        {/* ══ INVENTORY TAB ══ */}
        {innerTab === "inventory" && (
          <div className="p-4 space-y-3">
            <div className="flex gap-2">
              <StatPill label="Low Stock"    count={lowCount} color="bg-yellow-100 text-yellow-700" />
              <StatPill label="Out of Stock" count={outCount} color="bg-red-100 text-red-700" />
              <StatPill label="Expiring Soon" count={expCount} color="bg-orange-100 text-orange-700" />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {["All", "Low Stock", "Expiring"].map(f => (
                <Pill key={f} active={filter === f} onClick={() => setFilter(f)}>{f}</Pill>
              ))}
            </div>
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input className="w-full pl-10 pr-4 py-3 text-sm bg-white border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-400 transition"
                placeholder="Search items..." value={search} onChange={e => setSearch(e.target.value)} />
              {search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="w-4 h-4 text-gray-400" /></button>}
            </div>
            <button onClick={openAddItem}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-2xl text-sm transition active:scale-95">
              <Plus className="w-4 h-4" /> Add Inventory Item
            </button>
            {filtered.length === 0 ? (
              <div className="py-16 text-center text-gray-400">
                <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium">No items found</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.map(item => {
                  const st = stockStatus(item);
                  const expiring = isExpiringSoon(item);
                  return (
                    <div key={item.id} className="bg-white rounded-2xl px-4 py-3.5 shadow-sm border border-gray-100 flex items-center gap-3">
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${statusDot[st]}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-gray-800 truncate">{item.name}</p>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${catColors[item.category] || catColors.Other}`}>{item.category}</span>
                          {expiring && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700"><Clock className="w-2.5 h-2.5 inline mr-0.5" />Expiring</span>}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">{item.stock} {item.unit} · Min: {item.minStock} · {currency(item.unitCost)}/{item.unit}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => openEditItem(item)} className="p-2 rounded-xl hover:bg-indigo-50 text-gray-400 hover:text-indigo-600 transition"><Edit2 className="w-3.5 h-3.5" /></button>
                        <button onClick={() => deleteItem(item.id)} className="p-2 rounded-xl hover:bg-red-50 text-gray-400 hover:text-red-500 transition"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ══ DELIVERIES TAB ══ */}
        {innerTab === "deliveries" && (
          <div className="p-4 space-y-3">
            <button onClick={() => { setDeliveryForm({ supplier: suppliers[0]?.name || "", date: fmtDate(today), invoice: "", lines: [] }); setDeliverySheet(true); }}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-2xl text-sm transition active:scale-95">
              <Plus className="w-4 h-4" /> Record Delivery
            </button>
            {deliveries.length === 0 ? (
              <div className="py-16 text-center text-gray-400"><Truck className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="text-sm">No deliveries yet</p></div>
            ) : (
              <div className="space-y-2">
                {deliveries.map(d => (
                  <div key={d.id} className="bg-white rounded-2xl px-4 py-3.5 shadow-sm border border-gray-100">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{d.supplier}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{d.date} · {d.invoice || "No invoice"}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-indigo-700">{currency(deliveryTotal(d))}</p>
                        <p className="text-xs text-gray-400">{d.lines.length} item{d.lines.length !== 1 ? "s" : ""}</p>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {d.lines.map((l, i) => (
                        <span key={i} className="text-[10px] bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">{l.name} ×{l.qty}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══ OUTPUT TAB ══ */}
        {innerTab === "outputs" && (
          <div className="p-4 space-y-3">
            <button onClick={() => { setOutputForm({ itemId: items[0]?.id || "", qty: 1, reason: "Kitchen Use", date: fmtDate(today), note: "" }); setOutputSheet(true); }}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-2xl text-sm transition active:scale-95">
              <Plus className="w-4 h-4" /> Record Output
            </button>
            {outputs.length === 0 ? (
              <div className="py-16 text-center text-gray-400"><ArrowDownCircle className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="text-sm">No outputs yet</p></div>
            ) : (
              <div className="space-y-2">
                {outputs.map(o => {
                  const reasonColors = { "Kitchen Use": "bg-blue-100 text-blue-700", "Waste": "bg-red-100 text-red-700", "Spoilage": "bg-orange-100 text-orange-700", "Transfer": "bg-purple-100 text-purple-700" };
                  return (
                    <div key={o.id} className="bg-white rounded-2xl px-4 py-3.5 shadow-sm border border-gray-100">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm font-semibold text-gray-800">{o.itemName}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{o.date} {o.note ? `· ${o.note}` : ""}</p>
                        </div>
                        <div className="text-right flex flex-col items-end gap-1">
                          <p className="text-sm font-bold text-gray-700">-{o.qty}</p>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${reasonColors[o.reason] || "bg-gray-100 text-gray-600"}`}>{o.reason}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ══ SUPPLIERS TAB ══ */}
        {innerTab === "suppliers" && (
          <div className="p-4 space-y-3">
            <button onClick={openAddSup}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-2xl text-sm transition active:scale-95">
              <Plus className="w-4 h-4" /> Add Supplier
            </button>
            {suppliers.length === 0 ? (
              <div className="py-16 text-center text-gray-400"><Users className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="text-sm">No suppliers yet</p></div>
            ) : (
              <div className="space-y-2">
                {suppliers.map(s => (
                  <div key={s.id} className="bg-white rounded-2xl px-4 py-3.5 shadow-sm border border-gray-100 flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-base font-bold shrink-0 ${catColors[s.category] || catColors.Other}`}>
                      {s.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800">{s.name}</p>
                      <p className="text-xs text-gray-400">{s.phone} · {s.category}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => openEditSup(s)} className="p-2 rounded-xl hover:bg-indigo-50 text-gray-400 hover:text-indigo-600 transition"><Edit2 className="w-3.5 h-3.5" /></button>
                      <button onClick={() => deleteSup(s.id)} className="p-2 rounded-xl hover:bg-red-50 text-gray-400 hover:text-red-500 transition"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── BOTTOM SHEETS ── */}
      <BottomSheet open={!!itemSheet} onClose={() => setItemSheet(null)} title={itemSheet?.mode === "add" ? "Add Inventory Item" : "Edit Item"} tall>
        <div className="space-y-4">
          <Field label="Item Name"><Input value={itemForm.name} onChange={e => fi("name", e.target.value)} placeholder="e.g. Chicken Breast" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <Sel value={itemForm.category} onChange={e => fi("category", e.target.value)}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </Sel>
            </Field>
            <Field label="Unit">
              <Sel value={itemForm.unit} onChange={e => fi("unit", e.target.value)}>
                {UNITS.map(u => <option key={u}>{u}</option>)}
              </Sel>
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Stock"><Input type="number" value={itemForm.stock} onChange={e => fi("stock", e.target.value)} min="0" /></Field>
            <Field label="Min Stock"><Input type="number" value={itemForm.minStock} onChange={e => fi("minStock", e.target.value)} min="0" /></Field>
            <Field label="Unit Cost"><Input type="number" value={itemForm.unitCost} onChange={e => fi("unitCost", e.target.value)} min="0" /></Field>
          </div>
          <Field label="Expiry Date (optional)"><Input type="date" value={itemForm.expiry} onChange={e => fi("expiry", e.target.value)} /></Field>
          <div className="pt-2 space-y-2">
            <SaveBtn onClick={saveItem} />
            <CancelBtn onClick={() => setItemSheet(null)} />
          </div>
        </div>
      </BottomSheet>

      <BottomSheet open={deliverySheet} onClose={() => setDeliverySheet(false)} title="Record Delivery" tall>
        <div className="space-y-4">
          <Field label="Supplier">
            <Sel value={deliveryForm.supplier} onChange={e => setDeliveryForm(p => ({ ...p, supplier: e.target.value }))}>
              {suppliers.map(s => <option key={s.id}>{s.name}</option>)}
              <option value="Other">Other</option>
            </Sel>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date"><Input type="date" value={deliveryForm.date} onChange={e => setDeliveryForm(p => ({ ...p, date: e.target.value }))} /></Field>
            <Field label="Invoice #"><Input value={deliveryForm.invoice} onChange={e => setDeliveryForm(p => ({ ...p, invoice: e.target.value }))} placeholder="INV-xxx" /></Field>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Items Received</p>
            <div className="bg-gray-50 rounded-2xl p-3 space-y-2">
              <div className="grid grid-cols-3 gap-2">
                <Input className="col-span-3" value={delivLine.name} onChange={e => setDelivLine(p => ({ ...p, name: e.target.value }))} placeholder="Item name" />
                <Input type="number" value={delivLine.qty} onChange={e => setDelivLine(p => ({ ...p, qty: e.target.value }))} placeholder="Qty" min="1" />
                <Input type="number" value={delivLine.unitPrice} onChange={e => setDelivLine(p => ({ ...p, unitPrice: e.target.value }))} placeholder="Price" />
                <button onClick={addDelivLine} className="bg-indigo-100 text-indigo-700 rounded-2xl text-xs font-semibold flex items-center justify-center gap-1 transition hover:bg-indigo-200">
                  <Plus className="w-3.5 h-3.5" /> Add
                </button>
              </div>
              {deliveryForm.lines.length > 0 && (
                <div className="space-y-1 pt-1 border-t border-gray-200">
                  {deliveryForm.lines.map((l, i) => (
                    <div key={i} className="flex items-center justify-between text-xs bg-white rounded-xl px-3 py-2 border border-gray-100">
                      <span className="font-medium text-gray-700">{l.name}</span>
                      <span className="text-gray-500">×{l.qty}</span>
                      <span className="text-gray-500">{currency(l.unitPrice)}</span>
                      <span className="font-semibold text-indigo-700">{currency(l.qty * l.unitPrice)}</span>
                      <button onClick={() => setDeliveryForm(p => ({ ...p, lines: p.lines.filter((_, j) => j !== i) }))}><X className="w-3.5 h-3.5 text-gray-400 hover:text-red-500" /></button>
                    </div>
                  ))}
                  <div className="flex justify-between text-xs font-bold text-indigo-700 pt-1 px-1">
                    <span>Total</span>
                    <span>{currency(deliveryForm.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0))}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="space-y-2 pt-2">
            <SaveBtn onClick={saveDelivery}>Save Delivery</SaveBtn>
            <CancelBtn onClick={() => setDeliverySheet(false)} />
          </div>
        </div>
      </BottomSheet>

      <BottomSheet open={outputSheet} onClose={() => setOutputSheet(false)} title="Record Stock Output">
        <div className="space-y-4">
          <Field label="Item">
            <Sel value={outputForm.itemId} onChange={e => setOutputForm(p => ({ ...p, itemId: e.target.value }))}>
              <option value="">Select item...</option>
              {items.map(i => <option key={i.id} value={i.id}>{i.name} (stock: {i.stock} {i.unit})</option>)}
            </Sel>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Quantity"><Input type="number" value={outputForm.qty} onChange={e => setOutputForm(p => ({ ...p, qty: e.target.value }))} min="1" /></Field>
            <Field label="Reason">
              <Sel value={outputForm.reason} onChange={e => setOutputForm(p => ({ ...p, reason: e.target.value }))}>
                {OUTPUT_REASONS.map(r => <option key={r}>{r}</option>)}
              </Sel>
            </Field>
          </div>
          <Field label="Date"><Input type="date" value={outputForm.date} onChange={e => setOutputForm(p => ({ ...p, date: e.target.value }))} /></Field>
          <Field label="Note (optional)">
            <textarea className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
              rows={2} value={outputForm.note} onChange={e => setOutputForm(p => ({ ...p, note: e.target.value }))} placeholder="Optional notes..." />
          </Field>
          <div className="space-y-2 pt-2">
            <SaveBtn onClick={saveOutput}>Save Output</SaveBtn>
            <CancelBtn onClick={() => setOutputSheet(false)} />
          </div>
        </div>
      </BottomSheet>

      <BottomSheet open={!!supplierSheet} onClose={() => setSupplierSheet(null)} title={supplierSheet?.mode === "add" ? "Add Supplier" : "Edit Supplier"}>
        <div className="space-y-4">
          <Field label="Supplier Name"><Input value={supForm.name} onChange={e => setSupForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. FreshFarm Co." /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <Sel value={supForm.category} onChange={e => setSupForm(p => ({ ...p, category: e.target.value }))}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </Sel>
            </Field>
            <Field label="Contact"><Input value={supForm.contact} onChange={e => setSupForm(p => ({ ...p, contact: e.target.value }))} placeholder="Full name" /></Field>
          </div>
          <Field label="Phone"><Input value={supForm.phone} onChange={e => setSupForm(p => ({ ...p, phone: e.target.value }))} placeholder="+998 90 ..." /></Field>
          <Field label="Email"><Input type="email" value={supForm.email} onChange={e => setSupForm(p => ({ ...p, email: e.target.value }))} placeholder="email@domain.com" /></Field>
          <div className="space-y-2 pt-2">
            <SaveBtn onClick={saveSup} />
            <CancelBtn onClick={() => setSupplierSheet(null)} />
          </div>
        </div>
      </BottomSheet>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// HOME SCREEN
// ══════════════════════════════════════════════════════════════════════════════
const HomeScreen = ({ appSettings, orders, items, staff, setActiveNav }) => {
  const activeOrders = orders.filter(o => o.status !== "Paid").length;
  const staffOnDuty  = staff.filter(s => s.clockedIn && s.status === "active").length;
  const lowStockAlerts = items.filter(i => stockStatus(i) !== "ok").length;
  const todayRevenue = orders.filter(o => o.status === "Paid").reduce((s, o) => s + o.total, 0);

  const quickLinks = [
    { id: "orders",    label: "Orders",    icon: ClipboardList, color: "bg-blue-50 text-blue-600",   count: activeOrders   },
    { id: "inventory", label: "Inventory", icon: Package,       color: "bg-orange-50 text-orange-600", count: lowStockAlerts },
    { id: "staff",     label: "Staff",     icon: Users,         color: "bg-purple-50 text-purple-600", count: staffOnDuty    },
    { id: "tables",    label: "Tables",    icon: Table2,        color: "bg-green-50 text-green-600",   count: null           },
  ];

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 p-4 space-y-4">
      {/* Welcome card */}
      <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-3xl p-5 text-white">
        <p className="text-indigo-200 text-xs font-semibold uppercase tracking-wider mb-1">Welcome back</p>
        <h2 className="text-xl font-bold mb-0.5">{appSettings.restaurantName}</h2>
        <p className="text-indigo-200 text-xs">
          {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Active Orders",    value: activeOrders,   icon: ClipboardList, bg: "bg-blue-50",   ic: "text-blue-500"   },
          { label: "Staff On Duty",    value: staffOnDuty,    icon: UserCheck,     bg: "bg-green-50",  ic: "text-green-500"  },
          { label: "Stock Alerts",     value: lowStockAlerts, icon: AlertTriangle, bg: "bg-orange-50", ic: "text-orange-500" },
          { label: "Today's Revenue",  value: fmtCurrency(todayRevenue, appSettings.currency), icon: Banknote, bg: "bg-purple-50", ic: "text-purple-500" },
        ].map(({ label, value, icon: Icon, bg, ic }) => (
          <div key={label} className={`${bg} rounded-2xl p-4`}>
            <Icon className={`w-5 h-5 ${ic} mb-2`} />
            <p className="text-xl font-bold text-gray-800">{value}</p>
            <p className="text-xs text-gray-500 font-medium mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Quick navigation */}
      <div>
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Quick Access</p>
        <div className="grid grid-cols-2 gap-3">
          {quickLinks.map(({ id, label, icon: Icon, color, count }) => (
            <button key={id} onClick={() => setActiveNav(id)}
              className="bg-white rounded-2xl p-4 flex items-center gap-3 shadow-sm border border-gray-100 hover:shadow-md transition text-left">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
                <Icon className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-800">{label}</p>
                {count !== null && (
                  <p className="text-xs text-gray-400">{count} active</p>
                )}
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300" />
            </button>
          ))}
        </div>
      </div>

      {/* Settings info card */}
      <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Restaurant Info</p>
        <div className="space-y-2">
          {[
            { label: "Currency",    value: appSettings.currency },
            { label: "Tax Rate",    value: `${appSettings.taxRate}%` },
            { label: "Language",    value: appSettings.language },
            { label: "Service Charge", value: appSettings.serviceChargeEnabled ? `${appSettings.serviceCharge}% (on)` : "Off" },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between items-center">
              <span className="text-xs text-gray-500">{label}</span>
              <span className="text-xs font-semibold text-gray-800">{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// ORDERS SCREEN
// ══════════════════════════════════════════════════════════════════════════════
const STATUS_STYLE = {
  Pending:   "bg-blue-100 text-blue-700",
  Preparing: "bg-orange-100 text-orange-700",
  Ready:     "bg-green-100 text-green-700",
  Paid:      "bg-gray-100 text-gray-500",
};
const STATUS_NEXT = { Pending: "Preparing", Preparing: "Ready", Ready: "Paid" };

const OrdersScreen = ({ orders, setOrders, addNotification, appSettings }) => {
  const [tab, setTab]               = useState("active");
  const [newOrderSheet, setNewOrderSheet] = useState(false);
  const [newTable, setNewTable]     = useState("Table 1");
  const [pickedItems, setPickedItems] = useState([]);

  const active = orders.filter(o => o.status !== "Paid");
  const paid   = orders.filter(o => o.status === "Paid");

  const toggleItem = (mi) => {
    setPickedItems(prev => {
      const ex = prev.find(p => p.id === mi.id);
      if (ex) return prev.filter(p => p.id !== mi.id);
      return [...prev, { ...mi, qty: 1 }];
    });
  };
  const changeQty = (id, delta) => {
    setPickedItems(prev => prev.map(p => p.id === id ? { ...p, qty: Math.max(1, p.qty + delta) } : p));
  };
  const orderTotal = pickedItems.reduce((s, p) => s + p.price * p.qty, 0);

  const createOrder = () => {
    if (pickedItems.length === 0) return;
    const id = String(Math.floor(Math.random() * 9000) + 1000);
    const newOrder = {
      id,
      table: newTable,
      items: pickedItems.map(p => `${p.name} ×${p.qty}`),
      total: orderTotal,
      status: "Pending",
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    setOrders(prev => [newOrder, ...prev]);
    addNotification({ type: "new_order", title: `New Order #${id}`, description: `${newTable} has placed an order` });
    setPickedItems([]);
    setNewOrderSheet(false);
  };

  const advance = (orderId) => {
    setOrders(prev => prev.map(o => {
      if (o.id !== orderId) return o;
      const next = STATUS_NEXT[o.status];
      if (!next) return o;
      if (next === "Ready") {
        addNotification({ type: "kitchen_ready", title: "Order Ready", description: `Order #${o.id} is ready for ${o.table}` });
      }
      if (next === "Paid") {
        addNotification({ type: "payment", title: "Payment Received", description: `Order #${o.id} paid — ${fmtCurrency(o.total, appSettings.currency)}` });
      }
      return { ...o, status: next };
    }));
  };

  const renderCard = (o) => (
    <div key={o.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-gray-900">#{o.id}</span>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLE[o.status]}`}>{o.status}</span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{o.table} · {o.time}</p>
        </div>
        <p className="text-sm font-bold text-indigo-700">{fmtCurrency(o.total, appSettings.currency)}</p>
      </div>
      <div className="flex flex-wrap gap-1 mb-3">
        {o.items.map((it, i) => (
          <span key={i} className="text-[10px] bg-gray-100 text-gray-600 rounded-lg px-2 py-0.5">{it}</span>
        ))}
      </div>
      {o.status !== "Paid" && (
        <button onClick={() => advance(o.id)}
          className="w-full py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition active:scale-95">
          Mark as {STATUS_NEXT[o.status]}
        </button>
      )}
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex gap-2 px-4 py-3 bg-white border-b border-gray-100 shrink-0">
        {[["active", `Active (${active.length})`], ["paid", `Paid (${paid.length})`]].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex-1 py-2 rounded-xl text-xs font-semibold transition ${tab === key ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600"}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto bg-gray-50 p-4 space-y-3">
        <button onClick={() => { setPickedItems([]); setNewTable("Table 1"); setNewOrderSheet(true); }}
          className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-2xl text-sm transition active:scale-95">
          <Plus className="w-4 h-4" /> New Order
        </button>

        {(tab === "active" ? active : paid).map(renderCard)}

        {(tab === "active" ? active : paid).length === 0 && (
          <div className="py-16 text-center text-gray-300">
            <ClipboardList className="w-12 h-12 mx-auto mb-3" />
            <p className="text-sm font-medium">No {tab} orders</p>
          </div>
        )}
      </div>

      {/* New Order Sheet */}
      <BottomSheet open={newOrderSheet} onClose={() => setNewOrderSheet(false)} title="New Order" tall>
        <div className="space-y-4">
          <Field label="Table">
            <Sel value={newTable} onChange={e => setNewTable(e.target.value)}>
              {SIMPLE_TABLES.map(t => <option key={t}>{t}</option>)}
            </Sel>
          </Field>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Select Items</p>
            <div className="space-y-2">
              {SIMPLE_MENU.map(mi => {
                const picked = pickedItems.find(p => p.id === mi.id);
                return (
                  <div key={mi.id} className={`flex items-center gap-3 p-3 rounded-2xl border transition ${picked ? "border-indigo-300 bg-indigo-50" : "border-gray-100 bg-white"}`}>
                    <button onClick={() => toggleItem(mi)} className="flex-1 text-left">
                      <p className="text-sm font-semibold text-gray-800">{mi.name}</p>
                      <p className="text-xs text-indigo-600">{fmtCurrency(mi.price, appSettings.currency)}</p>
                    </button>
                    {picked && (
                      <div className="flex items-center gap-2">
                        <button onClick={() => changeQty(mi.id, -1)} className="w-7 h-7 rounded-full bg-white border border-gray-200 flex items-center justify-center"><Minus className="w-3 h-3 text-gray-600" /></button>
                        <span className="text-sm font-bold text-gray-800 w-4 text-center">{picked.qty}</span>
                        <button onClick={() => changeQty(mi.id,  1)} className="w-7 h-7 rounded-full bg-white border border-gray-200 flex items-center justify-center"><Plus className="w-3 h-3 text-gray-600" /></button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          {pickedItems.length > 0 && (
            <div className="bg-indigo-50 rounded-2xl px-4 py-3 flex justify-between items-center">
              <span className="text-sm font-semibold text-gray-700">Total</span>
              <span className="text-base font-bold text-indigo-700">{fmtCurrency(orderTotal, appSettings.currency)}</span>
            </div>
          )}
          <div className="space-y-2 pt-1">
            <button onClick={createOrder} disabled={pickedItems.length === 0}
              className="w-full bg-indigo-600 disabled:opacity-40 text-white font-semibold py-3.5 rounded-2xl text-sm flex items-center justify-center gap-2 transition active:scale-95">
              <ShoppingBag className="w-4 h-4" /> Place Order
            </button>
            <CancelBtn onClick={() => setNewOrderSheet(false)} />
          </div>
        </div>
      </BottomSheet>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// STAFF SCREEN
// ══════════════════════════════════════════════════════════════════════════════
const StaffScreen = ({ staff, setStaff, addNotification }) => {
  const clockIn = (memberId) => {
    setStaff(prev => prev.map(s => {
      if (s.id !== memberId || s.clockedIn || s.status === "suspended") return s;
      const now = new Date();
      const [sh, sm] = s.shiftStart.split(":").map(Number);
      const shiftMins   = sh * 60 + sm;
      const currentMins = now.getHours() * 60 + now.getMinutes();
      const lateBy      = currentMins - shiftMins;
      if (lateBy > 5) {
        addNotification({
          type: "staff_late",
          title: "Staff Late",
          description: `${s.name} clocked in ${lateBy} minutes late`,
        });
      }
      const clockInTime = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      return { ...s, clockedIn: true, clockInTime };
    }));
  };

  const clockOut = (memberId) => {
    setStaff(prev => prev.map(s => s.id === memberId ? { ...s, clockedIn: false, clockInTime: null } : s));
  };

  const onDuty = staff.filter(s => s.clockedIn && s.status === "active").length;

  return (
    <div className="flex flex-col h-full">
      {/* Banner */}
      <div className="bg-indigo-600 flex items-center gap-2 px-4 py-2.5 shrink-0">
        <UserCheck className="w-4 h-4 text-white" />
        <p className="text-white text-xs font-semibold">{onDuty} staff member{onDuty !== 1 ? "s" : ""} on duty today</p>
      </div>

      <div className="flex-1 overflow-y-auto bg-gray-50 p-4 space-y-3">
        {staff.map(s => {
          const roleStyle = ROLE_STYLE[s.role] || ROLE_STYLE.Cleaner;
          const suspended = s.status === "suspended";
          return (
            <div key={s.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-sm font-bold shrink-0"
                  style={{ background: roleStyle.bg, color: roleStyle.color }}>
                  {s.name.split(" ").map(w => w[0]).join("").slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-800 truncate">{s.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: roleStyle.bg, color: roleStyle.color }}>
                      {s.role}
                    </span>
                    {suspended && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-600">Suspended</span>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-gray-400">Shift: {s.shiftStart}</p>
                  {s.clockedIn && <p className="text-xs text-green-600 font-semibold">In: {s.clockInTime}</p>}
                </div>
              </div>
              {!suspended && (
                <div className="mt-3">
                  {s.clockedIn ? (
                    <button onClick={() => clockOut(s.id)}
                      className="w-full py-2 rounded-xl text-xs font-bold bg-gray-100 text-gray-600 hover:bg-gray-200 transition">
                      Clock Out
                    </button>
                  ) : (
                    <button onClick={() => clockIn(s.id)}
                      className="w-full py-2 rounded-xl text-xs font-bold bg-green-600 text-white hover:bg-green-700 transition active:scale-95">
                      Clock In
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// SETTINGS SCREEN  (FIX 1 — all state lives in Root, persists across nav)
// ══════════════════════════════════════════════════════════════════════════════
const SettingsScreen = ({ appSettings, setAppSettings }) => {
  // Local draft mirrors the root state for the restaurant form sheet
  const [restSheet, setRestSheet] = useState(false);
  const [draft, setDraft] = useState({ ...appSettings });
  const [toast, setToast] = useState({ msg: "", visible: false });
  const toastTimer = useRef(null);

  const showToast = (msg = "Settings saved ✓") => {
    clearTimeout(toastTimer.current);
    setToast({ msg, visible: true });
    toastTimer.current = setTimeout(() => setToast(t => ({ ...t, visible: false })), 2200);
  };

  const save = (partial) => {
    setAppSettings(prev => ({ ...prev, ...partial }));
    showToast();
  };

  const saveRestSheet = () => {
    setAppSettings(prev => ({
      ...prev,
      restaurantName:        draft.restaurantName,
      currency:              draft.currency,
      taxRate:               draft.taxRate,
      serviceCharge:         draft.serviceCharge,
      receiptHeader:         draft.receiptHeader,
    }));
    setRestSheet(false);
    showToast();
  };

  const openRestSheet = () => {
    setDraft({ ...appSettings });
    setRestSheet(true);
  };

  const Row = ({ iconBg, iconColor, Icon, label, value, onPress }) => (
    <button onClick={onPress} style={{
      display: "flex", alignItems: "center", gap: 12, width: "100%",
      padding: "13px 16px", borderBottom: "1px solid #f1f5f9", background: "#fff",
      border: "none", cursor: "pointer", minHeight: 56, textAlign: "left",
    }}>
      <div style={{ width: 34, height: 34, borderRadius: 10, background: iconBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon size={16} style={{ color: iconColor }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</div>
      </div>
      <ChevronRight size={16} style={{ color: "#cbd5e1", flexShrink: 0 }} />
    </button>
  );

  const ToggleRow = ({ iconBg, iconColor, Icon, label, val, stateKey, nested }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", borderBottom: "1px solid #f1f5f9", minHeight: 56, background: "#fff" }}>
      <div style={{ width: 34, height: 34, borderRadius: 10, background: iconBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon size={16} style={{ color: iconColor }} />
      </div>
      <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "#0f172a" }}>{label}</div>
      <Toggle on={val} onToggle={() => {
        if (nested) {
          save({ notifications: { ...appSettings.notifications, [stateKey]: !appSettings.notifications[stateKey] } });
        } else {
          save({ [stateKey]: !appSettings[stateKey] });
        }
      }} />
    </div>
  );

  return (
    <div style={{ flex: 1, overflowY: "auto", background: "#f1f5f9", fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}>
      <Toast msg={toast.msg} visible={toast.visible} />

      {/* ── Restaurant Settings ── */}
      <SectionLabel>Restaurant</SectionLabel>
      <div style={{ background: "#fff", borderRadius: 18, margin: "0 12px 4px", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
        <Row iconBg="#faf5ff" iconColor="#9333ea" Icon={Store}    label="Restaurant Name" value={appSettings.restaurantName} onPress={openRestSheet} />
        <Row iconBg="#eff6ff" iconColor="#2563eb" Icon={Banknote} label="Currency"         value={appSettings.currency}       onPress={openRestSheet} />
        <Row iconBg="#fff1f2" iconColor="#dc2626" Icon={BarChart2} label="Tax Rate"         value={`${appSettings.taxRate}%`}  onPress={openRestSheet} />
        <Row iconBg="#fefce8" iconColor="#ca8a04" Icon={BarChart2} label={`Service Charge (${appSettings.serviceCharge}%)`} value={appSettings.serviceChargeEnabled ? "Enabled" : "Disabled"} onPress={openRestSheet} />
      </div>

      {/* ── Language ── */}
      <SectionLabel>Language</SectionLabel>
      <div style={{ background: "#fff", borderRadius: 18, margin: "0 12px 4px", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", padding: "14px 16px" }}>
        <div style={{ display: "flex", gap: 8 }}>
          {["English", "Russian", "Uzbek"].map(l => (
            <button key={l} onClick={() => save({ language: l })} style={{
              flex: 1, padding: "9px 4px", borderRadius: 99, fontWeight: 700, fontSize: 12, cursor: "pointer",
              border: `2px solid ${appSettings.language === l ? "#4f46e5" : "#e2e8f0"}`,
              background: appSettings.language === l ? "#4f46e5" : "#f8fafc",
              color: appSettings.language === l ? "#fff" : "#64748b",
            }}>{l}</button>
          ))}
        </div>
      </div>

      {/* ── Notification toggles ── */}
      <SectionLabel>Notification Preferences</SectionLabel>
      <div style={{ background: "#fff", borderRadius: 18, margin: "0 12px 4px", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
        <ToggleRow iconBg="#eff6ff"  iconColor="#2563eb" Icon={Bell}     label="New Order Alerts"    val={appSettings.notifications.newOrder}       stateKey="newOrder"       nested />
        <ToggleRow iconBg="#fff7ed"  iconColor="#f97316" Icon={Package}  label="Low Stock Alerts"    val={appSettings.notifications.lowStock}       stateKey="lowStock"       nested />
        <ToggleRow iconBg="#fff1f2"  iconColor="#dc2626" Icon={Clock}    label="Staff Late Alerts"   val={appSettings.notifications.staffLate}      stateKey="staffLate"      nested />
        <ToggleRow iconBg="#f0fdf4"  iconColor="#16a34a" Icon={CreditCard} label="Payment Received"  val={appSettings.notifications.paymentReceived} stateKey="paymentReceived" nested />
        <ToggleRow iconBg="#faf5ff"  iconColor="#9333ea" Icon={ChefHat}  label="Kitchen Ready"       val={appSettings.notifications.kitchenReady}   stateKey="kitchenReady"   nested />
      </div>

      {/* ── App settings ── */}
      <SectionLabel>App Settings</SectionLabel>
      <div style={{ background: "#fff", borderRadius: 18, margin: "0 12px 4px", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
        <ToggleRow iconBg="#eef2ff" iconColor="#4f46e5" Icon={Settings} label="Sound Effects" val={appSettings.sound}     stateKey="sound"     />
        <ToggleRow iconBg="#fdf2f8" iconColor="#db2777" Icon={Settings} label="Vibration"     val={appSettings.vibration} stateKey="vibration" />
        {/* Auto-lock */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", background: "#fff", minHeight: 56 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: "#f0fdfa", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Settings size={16} style={{ color: "#0d9488" }} />
          </div>
          <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "#0f172a" }}>Auto-lock Screen</div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {["Never", "5 min", "10 min", "30 min"].map(opt => (
              <button key={opt} onClick={() => save({ autoLock: opt })} style={{
                fontSize: 10, padding: "5px 8px", borderRadius: 8, fontWeight: 700, cursor: "pointer",
                border: `1.5px solid ${appSettings.autoLock === opt ? "#4f46e5" : "#e2e8f0"}`,
                background: appSettings.autoLock === opt ? "#4f46e5" : "#f8fafc",
                color: appSettings.autoLock === opt ? "#fff" : "#64748b",
              }}>{opt}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ height: 32 }} />

      {/* ── Restaurant details sheet ── */}
      <BottomSheet open={restSheet} onClose={() => setRestSheet(false)} title="Restaurant Details" tall>
        <div className="space-y-4">
          <Field label="Restaurant Name">
            <Input value={draft.restaurantName} onChange={e => setDraft(p => ({ ...p, restaurantName: e.target.value }))} placeholder="e.g. The Bill" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Currency">
              <Input value={draft.currency} onChange={e => setDraft(p => ({ ...p, currency: e.target.value }))} placeholder="so'm" />
            </Field>
            <Field label="Tax Rate (%)">
              <Input type="number" value={draft.taxRate} onChange={e => setDraft(p => ({ ...p, taxRate: +e.target.value }))} min="0" max="100" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Service Charge (%)">
              <Input type="number" value={draft.serviceCharge} onChange={e => setDraft(p => ({ ...p, serviceCharge: +e.target.value }))} min="0" max="100" />
            </Field>
            <Field label="Service Charge">
              <div className="flex items-center gap-3 bg-gray-50 rounded-2xl px-4 py-3 border border-gray-200">
                <span className="text-sm text-gray-600 flex-1">{draft.serviceChargeEnabled ? "On" : "Off"}</span>
                <Toggle on={draft.serviceChargeEnabled} onToggle={() => setDraft(p => ({ ...p, serviceChargeEnabled: !p.serviceChargeEnabled }))} />
              </div>
            </Field>
          </div>
          <Field label="Receipt Header">
            <Input value={draft.receiptHeader} onChange={e => setDraft(p => ({ ...p, receiptHeader: e.target.value }))} placeholder="Thank you for dining with us!" />
          </Field>
          <div className="space-y-2 pt-2">
            <SaveBtn onClick={saveRestSheet}>Save Changes</SaveBtn>
            <CancelBtn onClick={() => setRestSheet(false)} />
          </div>
        </div>
      </BottomSheet>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// PLACEHOLDER SCREEN
// ══════════════════════════════════════════════════════════════════════════════
const PlaceholderScreen = ({ icon: Icon, label }) => (
  <div className="flex-1 flex flex-col items-center justify-center text-gray-300 gap-3">
    <Icon className="w-16 h-16" />
    <p className="text-base font-semibold">{label}</p>
    <p className="text-xs text-gray-400">Coming soon</p>
  </div>
);

// ══════════════════════════════════════════════════════════════════════════════
// ROOT APP
// ══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [activeNav, setActiveNav] = useState("home");

  // ── Inventory state ──────────────────────────────────────────────────────
  const [items,     setItems]     = useState(SEED_ITEMS);
  const [deliveries, setDeliveries] = useState(SEED_DELIVERIES);
  const [outputs,   setOutputs]   = useState(SEED_OUTPUTS);
  const [suppliers, setSuppliers] = useState(SEED_SUPPLIERS);

  // ── Orders & Staff state ─────────────────────────────────────────────────
  const [orders, setOrders] = useState(SEED_ORDERS);
  const [staff,  setStaff]  = useState(SEED_STAFF);

  // ── FIX 1: App settings at root level — persists across navigation ────────
  const [appSettings, setAppSettings] = useState({
    restaurantName:      "The Bill Restaurant",
    currency:            "so'm",
    language:            "English",
    taxRate:             12,
    serviceCharge:       10,
    serviceChargeEnabled: true,
    receiptHeader:       "Thank you for dining with us!",
    notifications: {
      newOrder: true, lowStock: true, staffLate: true,
      paymentReceived: true, kitchenReady: true,
    },
    sound:     true,
    vibration: true,
    autoLock:  "10 min",
  });

  // ── FIX 2: Notifications at root level ───────────────────────────────────
  const [notifications,   setNotifications]   = useState(SEED_NOTIFICATIONS);
  const [showNotifPanel,  setShowNotifPanel]   = useState(false);
  const notifPanelRef = useRef(null);

  const addNotification = useCallback((notif) => {
    setNotifications(prev => [
      { id: `${Date.now()}-${Math.random()}`, read: false, time: Date.now(), ...notif },
      ...prev,
    ]);
  }, []);

  const markRead = (id) => setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  const markAllRead = () => setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  const clearAll = () => { setNotifications([]); setShowNotifPanel(false); };
  const unreadCount = notifications.filter(n => !n.read).length;

  // Close notification panel on outside click
  useEffect(() => {
    const handler = (e) => {
      if (notifPanelRef.current && !notifPanelRef.current.contains(e.target)) {
        setShowNotifPanel(false);
      }
    };
    if (showNotifPanel) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showNotifPanel]);

  // Language-aware nav labels
  const t = LANG[appSettings.language] || LANG.English;

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-200 p-4">
      {/* Phone shell */}
      <div className="w-full max-w-sm bg-white rounded-[2.5rem] shadow-2xl flex flex-col relative"
        style={{ height: "812px", maxHeight: "95vh" }}>

        {/* Rounded-corner clip layer */}
        <div className="absolute inset-0 rounded-[2.5rem] overflow-hidden pointer-events-none z-0" />

        {/* Status bar */}
        <div className="bg-white px-6 pt-3 pb-1 flex items-center justify-between shrink-0 relative z-10 rounded-t-[2.5rem]">
          <span className="text-xs font-bold text-gray-800">
            {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
          <div className="flex items-center gap-1">
            <div className="flex gap-0.5 items-end h-3">
              {[3, 5, 7, 9].map((h, i) => <div key={i} className="w-1 bg-gray-800 rounded-sm" style={{ height: h }} />)}
            </div>
            <div className="w-5 h-2.5 border border-gray-800 rounded-sm relative ml-1">
              <div className="absolute left-0.5 top-0.5 bottom-0.5 w-3 bg-gray-800 rounded-sm" />
              <div className="absolute -right-1 top-1/2 -translate-y-1/2 w-0.5 h-1.5 bg-gray-800 rounded-full" />
            </div>
          </div>
        </div>

        {/* Page header — shows restaurant name + bell on Home */}
        <div className="bg-white px-5 py-3 flex items-center justify-between border-b border-gray-100 shrink-0 relative z-10">
          <div>
            <h1 className="text-lg font-bold text-gray-900">
              {t[activeNav] || NAV_ITEMS.find(n => n.id === activeNav)?.id || ""}
            </h1>
            <p className="text-xs text-gray-400">{appSettings.restaurantName}</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Bell icon — visible on Home page only */}
            {activeNav === "home" && (
              <button
                onClick={() => setShowNotifPanel(v => !v)}
                className="relative w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition"
              >
                <Bell className="w-4 h-4 text-gray-700" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>
            )}
            <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center">
              <span className="text-sm font-bold text-indigo-700">
                {appSettings.restaurantName.charAt(0).toUpperCase()}
              </span>
            </div>
          </div>
        </div>

        {/* Screen content */}
        <div className="flex-1 overflow-hidden flex flex-col relative z-10">
          {activeNav === "home"      && <HomeScreen      appSettings={appSettings} orders={orders} items={items} staff={staff} setActiveNav={setActiveNav} />}
          {activeNav === "inventory" && <InventoryScreen items={items} setItems={setItems} deliveries={deliveries} setDeliveries={setDeliveries} outputs={outputs} setOutputs={setOutputs} suppliers={suppliers} setSuppliers={setSuppliers} addNotification={addNotification} />}
          {activeNav === "orders"    && <OrdersScreen    orders={orders} setOrders={setOrders} addNotification={addNotification} appSettings={appSettings} />}
          {activeNav === "staff"     && <StaffScreen     staff={staff} setStaff={setStaff} addNotification={addNotification} />}
          {activeNav === "profile"   && <SettingsScreen  appSettings={appSettings} setAppSettings={setAppSettings} />}
          {activeNav === "tables"    && <PlaceholderScreen icon={Table2}          label={t.tables} />}
          {activeNav === "menu"      && <PlaceholderScreen icon={UtensilsCrossed} label={t.menu}   />}
        </div>

        {/* Bottom Nav */}
        <div className="bg-white border-t border-gray-100 px-2 pb-2 pt-1 shrink-0 relative z-10 rounded-b-[2.5rem]">
          <div className="flex items-center">
            {NAV_ITEMS.map(item => {
              const active = activeNav === item.id;
              return (
                <button key={item.id} onClick={() => { setActiveNav(item.id); setShowNotifPanel(false); }}
                  className={`flex-1 flex flex-col items-center py-2 gap-0.5 rounded-2xl transition ${active ? "text-indigo-600" : "text-gray-400 hover:text-gray-600"}`}>
                  <div className={`p-1.5 rounded-xl transition ${active ? "bg-indigo-100" : ""}`}>
                    <item.icon className="w-4 h-4" />
                  </div>
                  <span className={`text-[9px] font-semibold ${active ? "text-indigo-600" : "text-gray-400"}`}>
                    {t[item.id] || item.id}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── FIX 2: Notification panel — floating card below header ── */}
        {showNotifPanel && (
          <>
            {/* Backdrop */}
            <div className="fixed inset-0 z-40" onClick={() => setShowNotifPanel(false)} />
            {/* Panel */}
            <div ref={notifPanelRef} className="absolute z-50 bg-white rounded-2xl shadow-2xl border border-gray-100 flex flex-col"
              style={{ top: 104, left: 10, right: 10, maxHeight: 480 }}>
              {/* Panel header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
                <span className="text-sm font-bold text-gray-900">Notifications</span>
                <button onClick={markAllRead}
                  className="flex items-center gap-1 text-xs text-indigo-600 font-semibold hover:text-indigo-700 transition">
                  <CheckCheck className="w-3.5 h-3.5" /> Mark all read
                </button>
              </div>

              {/* Notification list */}
              <div className="overflow-y-auto flex-1">
                {notifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-gray-300 gap-2">
                    <Bell className="w-10 h-10" />
                    <p className="text-sm font-medium text-gray-400">No notifications</p>
                  </div>
                ) : (
                  notifications.map(n => {
                    const meta = NOTIF_META[n.type] || NOTIF_META.new_order;
                    return (
                      <button key={n.id}
                        onClick={() => {
                          markRead(n.id);
                          setShowNotifPanel(false);
                          setActiveNav(NOTIF_NAV[n.type] || "home");
                        }}
                        className="w-full text-left flex items-start gap-3 px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition"
                        style={{
                          borderLeft: n.read ? "3px solid transparent" : "3px solid #2563eb",
                          background: n.read ? "white" : "#eff6ff20",
                        }}
                      >
                        <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                          style={{ background: meta.bg }}>
                          <meta.Icon className="w-3.5 h-3.5" style={{ color: meta.color }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-gray-900 truncate">{n.title}</p>
                          <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed line-clamp-2">{n.description}</p>
                          <p className="text-[10px] text-gray-400 mt-1">{timeAgo(n.time)}</p>
                        </div>
                        {!n.read && <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-1.5" />}
                      </button>
                    );
                  })
                )}
              </div>

              {/* Clear all footer */}
              {notifications.length > 0 && (
                <div className="p-3 border-t border-gray-100 shrink-0">
                  <button onClick={clearAll}
                    className="w-full text-xs text-red-500 font-semibold py-2 rounded-xl hover:bg-red-50 transition flex items-center justify-center gap-1.5">
                    <X className="w-3.5 h-3.5" /> Clear all
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

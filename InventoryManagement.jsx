import { useState, useMemo, useCallback } from "react";
import {
  Package, Truck, ArrowDownCircle, Users, Plus, Edit2, Trash2,
  Search, X, ChevronUp, ChevronDown, AlertTriangle, CheckCircle,
  XCircle, DollarSign, TrendingDown, ShoppingCart, BarChart2,
  ChevronRight, Save, Filter
} from "lucide-react";

// ─── SEED DATA ────────────────────────────────────────────────────────────────
const SEED_SUPPLIERS = [
  { id: 1, name: "FreshFarm Co.", contact: "Ali Karimov", phone: "+998 90 111 2233", email: "ali@freshfarm.uz", category: "Food" },
  { id: 2, name: "BeverageWorld", contact: "Sara Lee", phone: "+998 91 444 5566", email: "sara@bevworld.uz", category: "Beverage" },
  { id: 3, name: "CleanPro Supply", contact: "John Doe", phone: "+998 93 777 8899", email: "john@cleanpro.uz", category: "Cleaning" },
];

const SEED_ITEMS = [
  { id: 1, name: "Chicken Breast", category: "Food", unit: "kg", stock: 45, minStock: 20, unitCost: 12000 },
  { id: 2, name: "Tomatoes", category: "Food", unit: "kg", stock: 8, minStock: 15, unitCost: 3500 },
  { id: 3, name: "Olive Oil", category: "Food", unit: "liter", stock: 12, minStock: 10, unitCost: 28000 },
  { id: 4, name: "Cola (330ml)", category: "Beverage", unit: "piece", stock: 0, minStock: 50, unitCost: 2500 },
  { id: 5, name: "Mineral Water", category: "Beverage", unit: "bottle", stock: 120, minStock: 60, unitCost: 1200 },
  { id: 6, name: "Flour", category: "Food", unit: "kg", stock: 60, minStock: 30, unitCost: 4000 },
  { id: 7, name: "Sugar", category: "Food", unit: "kg", stock: 14, minStock: 20, unitCost: 3800 },
  { id: 8, name: "Take-away Boxes", category: "Packaging", unit: "box", stock: 3, minStock: 50, unitCost: 800 },
  { id: 9, name: "Dish Soap", category: "Cleaning", unit: "bottle", stock: 18, minStock: 10, unitCost: 9500 },
  { id: 10, name: "Paper Napkins", category: "Packaging", unit: "box", stock: 30, minStock: 20, unitCost: 5500 },
];

const today = new Date();
const fmt = (d) => d.toISOString().slice(0, 10);
const monthStart = fmt(new Date(today.getFullYear(), today.getMonth(), 1));

const SEED_DELIVERIES = [
  {
    id: 1, supplierId: 1, supplierName: "FreshFarm Co.", date: monthStart,
    invoice: "INV-001", status: "Confirmed",
    lines: [{ itemId: 1, itemName: "Chicken Breast", qty: 30, unitPrice: 11500 }, { itemId: 2, itemName: "Tomatoes", qty: 20, unitPrice: 3300 }]
  },
  {
    id: 2, supplierId: 2, supplierName: "BeverageWorld", date: fmt(new Date(today.getFullYear(), today.getMonth(), 3)),
    invoice: "INV-002", status: "Confirmed",
    lines: [{ itemId: 5, itemName: "Mineral Water", qty: 100, unitPrice: 1100 }, { itemId: 4, itemName: "Cola (330ml)", qty: 60, unitPrice: 2400 }]
  },
  {
    id: 3, supplierId: 3, supplierName: "CleanPro Supply", date: fmt(new Date(today.getFullYear(), today.getMonth() - 1, 20)),
    invoice: "INV-003", status: "Confirmed",
    lines: [{ itemId: 9, itemName: "Dish Soap", qty: 20, unitPrice: 9000 }]
  },
  {
    id: 4, supplierId: 1, supplierName: "FreshFarm Co.", date: fmt(new Date(today.getFullYear(), today.getMonth() - 1, 25)),
    invoice: "INV-004", status: "Confirmed",
    lines: [{ itemId: 6, itemName: "Flour", qty: 50, unitPrice: 3900 }, { itemId: 7, itemName: "Sugar", qty: 25, unitPrice: 3700 }]
  },
  {
    id: 5, supplierId: 1, supplierName: "FreshFarm Co.", date: fmt(new Date(today.getFullYear(), today.getMonth(), 2)),
    invoice: "INV-005", status: "Pending",
    lines: [{ itemId: 8, itemName: "Take-away Boxes", qty: 100, unitPrice: 750 }, { itemId: 10, itemName: "Paper Napkins", qty: 40, unitPrice: 5200 }]
  },
];

const SEED_OUTPUTS = [
  { id: 1, itemId: 1, itemName: "Chicken Breast", qty: 15, reason: "Kitchen Usage", date: fmt(new Date(today.getFullYear(), today.getMonth(), 1)), note: "Dinner service" },
  { id: 2, itemId: 2, itemName: "Tomatoes", qty: 5, reason: "Waste", date: fmt(new Date(today.getFullYear(), today.getMonth(), 2)), note: "Expired" },
  { id: 3, itemId: 4, itemName: "Cola (330ml)", qty: 60, reason: "Kitchen Usage", date: fmt(new Date(today.getFullYear(), today.getMonth(), 3)), note: "Bar service" },
  { id: 4, itemId: 6, itemName: "Flour", qty: 10, reason: "Kitchen Usage", date: fmt(new Date(today.getFullYear(), today.getMonth() - 1, 28)), note: "Baking" },
  { id: 5, itemId: 7, itemName: "Sugar", qty: 6, reason: "Spoilage", date: fmt(new Date(today.getFullYear(), today.getMonth() - 1, 29)), note: "Moisture damage" },
];

const CATEGORIES = ["Food", "Beverage", "Packaging", "Cleaning", "Other"];
const UNITS = ["kg", "g", "liter", "piece", "box", "bottle"];
const OUTPUT_REASONS = ["Kitchen Usage", "Waste", "Spoilage", "Transfer"];
const TABS = ["Inventory", "Deliveries", "Stock Output", "Suppliers"];

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const currency = (v) => new Intl.NumberFormat("uz-UZ").format(Math.round(v)) + " so'm";

const deliveryTotal = (d) => d.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);

const stockStatus = (item) => {
  if (item.stock === 0) return "critical";
  if (item.stock < item.minStock) return "low";
  return "ok";
};

const statusColors = {
  ok: { bg: "bg-green-100", text: "text-green-700", dot: "bg-green-500", label: "Sufficient" },
  low: { bg: "bg-yellow-100", text: "text-yellow-700", dot: "bg-yellow-500", label: "Low Stock" },
  critical: { bg: "bg-red-100", text: "text-red-700", dot: "bg-red-500", label: "Out of Stock" },
};

const SortIcon = ({ col, sortState }) => {
  if (sortState.col !== col) return <ChevronUp className="w-3 h-3 opacity-20" />;
  return sortState.dir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />;
};

const useSortableTable = (data, defaultCol) => {
  const [sort, setSort] = useState({ col: defaultCol, dir: "asc" });
  const toggle = useCallback((col) => setSort(s => ({ col, dir: s.col === col && s.dir === "asc" ? "desc" : "asc" })), []);
  const sorted = useMemo(() => {
    return [...data].sort((a, b) => {
      const va = a[sort.col] ?? ""; const vb = b[sort.col] ?? "";
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb));
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [data, sort]);
  return { sorted, sort, toggle };
};

// ─── MODAL WRAPPER ────────────────────────────────────────────────────────────
const Modal = ({ title, onClose, children, wide }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
    <div className={`bg-white rounded-2xl shadow-2xl w-full ${wide ? "max-w-3xl" : "max-w-lg"} max-h-[90vh] flex flex-col`}>
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <h2 className="text-lg font-bold text-gray-800">{title}</h2>
        <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="overflow-y-auto p-6 flex-1">{children}</div>
    </div>
  </div>
);

// ─── STAT CARD ────────────────────────────────────────────────────────────────
const StatCard = ({ icon: Icon, label, value, color, sub }) => (
  <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex items-start gap-4">
    <div className={`p-3 rounded-xl ${color}`}>
      <Icon className="w-6 h-6 text-white" />
    </div>
    <div>
      <p className="text-sm text-gray-500 font-medium">{label}</p>
      <p className="text-2xl font-bold text-gray-800 mt-0.5">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  </div>
);

// ─── FIELD ────────────────────────────────────────────────────────────────────
const Field = ({ label, children }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
    {children}
  </div>
);

const Input = ({ ...props }) => (
  <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-gray-50" {...props} />
);

const Select = ({ children, ...props }) => (
  <select className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-gray-50" {...props}>
    {children}
  </select>
);

const Btn = ({ children, variant = "primary", sm, ...props }) => {
  const base = "inline-flex items-center gap-2 font-medium rounded-xl transition focus:outline-none";
  const size = sm ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm";
  const variants = {
    primary: "bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm",
    secondary: "bg-gray-100 hover:bg-gray-200 text-gray-700",
    danger: "bg-red-50 hover:bg-red-100 text-red-600",
    success: "bg-green-600 hover:bg-green-700 text-white shadow-sm",
  };
  return <button className={`${base} ${size} ${variants[variant]}`} {...props}>{children}</button>;
};

const Th = ({ children, col, sort, onSort }) => (
  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none whitespace-nowrap"
    onClick={() => onSort(col)}>
    <span className="flex items-center gap-1">{children}<SortIcon col={col} sortState={sort} /></span>
  </th>
);

// ══════════════════════════════════════════════════════════════════════════════
// INVENTORY TAB
// ══════════════════════════════════════════════════════════════════════════════
const InventoryTab = ({ items, setItems }) => {
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [modal, setModal] = useState(null); // null | { mode, item }
  const [form, setForm] = useState({});
  const [deleteId, setDeleteId] = useState(null);

  const filtered = useMemo(() => items.filter(i => {
    const matchSearch = i.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = catFilter === "All" || i.category === catFilter;
    const matchStatus = statusFilter === "All" || stockStatus(i) === statusFilter;
    return matchSearch && matchCat && matchStatus;
  }), [items, search, catFilter, statusFilter]);

  const { sorted, sort, toggle } = useSortableTable(filtered, "name");

  const openAdd = () => { setForm({ name: "", category: "Food", unit: "kg", stock: 0, minStock: 0, unitCost: 0 }); setModal({ mode: "add" }); };
  const openEdit = (item) => { setForm({ ...item }); setModal({ mode: "edit", item }); };

  const save = () => {
    const item = { ...form, stock: +form.stock, minStock: +form.minStock, unitCost: +form.unitCost };
    if (!item.name.trim()) return;
    if (modal.mode === "add") {
      setItems(prev => [...prev, { ...item, id: Date.now() }]);
    } else {
      setItems(prev => prev.map(i => i.id === modal.item.id ? { ...i, ...item } : i));
    }
    setModal(null);
  };

  const del = (id) => { setItems(prev => prev.filter(i => i.id !== id)); setDeleteId(null); };

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-gray-50"
            placeholder="Search items..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={catFilter} onChange={e => setCatFilter(e.target.value)} className="w-auto">
          <option value="All">All Categories</option>
          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </Select>
        <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="w-auto">
          <option value="All">All Status</option>
          <option value="ok">Sufficient</option>
          <option value="low">Low Stock</option>
          <option value="critical">Out of Stock</option>
        </Select>
        <Btn onClick={openAdd}><Plus className="w-4 h-4" />Add Item</Btn>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <Th col="name" sort={sort} onSort={toggle}>Item Name</Th>
                <Th col="category" sort={sort} onSort={toggle}>Category</Th>
                <Th col="unit" sort={sort} onSort={toggle}>Unit</Th>
                <Th col="stock" sort={sort} onSort={toggle}>Current Stock</Th>
                <Th col="minStock" sort={sort} onSort={toggle}>Min Stock</Th>
                <Th col="unitCost" sort={sort} onSort={toggle}>Unit Cost</Th>
                <Th col="totalValue" sort={sort} onSort={toggle}>Total Value</Th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sorted.map(item => {
                const st = stockStatus(item);
                const sc = statusColors[st];
                return (
                  <tr key={item.id} className="hover:bg-gray-50/60 transition">
                    <td className="px-4 py-3 font-medium text-gray-800 text-sm">{item.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-medium">{item.category}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{item.unit}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-800">{item.stock}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{item.minStock}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{currency(item.unitCost)}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-800">{currency(item.stock * item.unitCost)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${sc.bg} ${sc.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />{sc.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEdit(item)} className="p-1.5 rounded-lg hover:bg-indigo-50 text-gray-400 hover:text-indigo-600 transition"><Edit2 className="w-4 h-4" /></button>
                        <button onClick={() => setDeleteId(item.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {sorted.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-400 text-sm">No items found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {modal && (
        <Modal title={modal.mode === "add" ? "Add Inventory Item" : "Edit Inventory Item"} onClose={() => setModal(null)}>
          <div className="space-y-4">
            <Field label="Item Name"><Input value={form.name} onChange={e => f("name", e.target.value)} placeholder="e.g. Chicken Breast" /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Category">
                <Select value={form.category} onChange={e => f("category", e.target.value)}>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </Select>
              </Field>
              <Field label="Unit">
                <Select value={form.unit} onChange={e => f("unit", e.target.value)}>
                  {UNITS.map(u => <option key={u}>{u}</option>)}
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <Field label="Current Stock"><Input type="number" value={form.stock} onChange={e => f("stock", e.target.value)} min="0" /></Field>
              <Field label="Min Stock Threshold"><Input type="number" value={form.minStock} onChange={e => f("minStock", e.target.value)} min="0" /></Field>
              <Field label="Unit Cost (so'm)"><Input type="number" value={form.unitCost} onChange={e => f("unitCost", e.target.value)} min="0" /></Field>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Btn variant="secondary" onClick={() => setModal(null)}>Cancel</Btn>
              <Btn onClick={save}><Save className="w-4 h-4" />Save Item</Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Confirm */}
      {deleteId && (
        <Modal title="Delete Item?" onClose={() => setDeleteId(null)}>
          <p className="text-sm text-gray-600 mb-6">Are you sure you want to delete this item? This cannot be undone.</p>
          <div className="flex justify-end gap-3">
            <Btn variant="secondary" onClick={() => setDeleteId(null)}>Cancel</Btn>
            <Btn variant="danger" onClick={() => del(deleteId)}><Trash2 className="w-4 h-4" />Delete</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// DELIVERIES TAB
// ══════════════════════════════════════════════════════════════════════════════
const DeliveriesTab = ({ deliveries, setDeliveries, items, setItems, suppliers }) => {
  const [modal, setModal] = useState(false);
  const [viewModal, setViewModal] = useState(null);
  const [form, setForm] = useState({ supplierId: "", date: fmt(today), invoice: "", lines: [] });
  const [lineForm, setLineForm] = useState({ itemId: "", qty: 1, unitPrice: 0 });

  const { sorted, sort, toggle } = useSortableTable(deliveries, "date");

  const openNew = () => {
    setForm({ supplierId: suppliers[0]?.id || "", date: fmt(today), invoice: "", lines: [] });
    setLineForm({ itemId: items[0]?.id || "", qty: 1, unitPrice: 0 });
    setModal(true);
  };

  const addLine = () => {
    if (!lineForm.itemId || lineForm.qty <= 0) return;
    const item = items.find(i => i.id === +lineForm.itemId);
    if (!item) return;
    setForm(p => ({
      ...p,
      lines: [...p.lines, { itemId: item.id, itemName: item.name, qty: +lineForm.qty, unitPrice: +lineForm.unitPrice }]
    }));
    setLineForm({ itemId: items[0]?.id || "", qty: 1, unitPrice: 0 });
  };

  const removeLine = (idx) => setForm(p => ({ ...p, lines: p.lines.filter((_, i) => i !== idx) }));

  const save = (status) => {
    if (!form.supplierId || form.lines.length === 0) return;
    const supplier = suppliers.find(s => s.id === +form.supplierId);
    const delivery = {
      id: Date.now(),
      supplierId: +form.supplierId,
      supplierName: supplier?.name || "",
      date: form.date,
      invoice: form.invoice,
      status,
      lines: form.lines,
    };
    setDeliveries(p => [delivery, ...p]);
    // update stock
    setItems(prev => prev.map(item => {
      const line = form.lines.find(l => l.itemId === item.id);
      return line ? { ...item, stock: item.stock + line.qty } : item;
    }));
    setModal(false);
  };

  const confirmDelivery = (id) => {
    setDeliveries(p => p.map(d => d.id === id ? { ...d, status: "Confirmed" } : d));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-800">Delivery History</h2>
        <Btn onClick={openNew}><Plus className="w-4 h-4" />Record Delivery</Btn>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <Th col="date" sort={sort} onSort={toggle}>Date</Th>
                <Th col="supplierName" sort={sort} onSort={toggle}>Supplier</Th>
                <Th col="invoice" sort={sort} onSort={toggle}>Invoice #</Th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Items</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Total Cost</th>
                <Th col="status" sort={sort} onSort={toggle}>Status</Th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sorted.map(d => (
                <tr key={d.id} className="hover:bg-gray-50/60 transition">
                  <td className="px-4 py-3 text-sm text-gray-700">{d.date}</td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-800">{d.supplierName}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 font-mono">{d.invoice}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{d.lines.length} item{d.lines.length !== 1 ? "s" : ""}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-gray-800">{currency(deliveryTotal(d))}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${d.status === "Confirmed" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                      {d.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => setViewModal(d)} className="p-1.5 rounded-lg hover:bg-indigo-50 text-gray-400 hover:text-indigo-600 transition text-xs font-medium px-2">View</button>
                      {d.status === "Pending" && (
                        <button onClick={() => confirmDelivery(d.id)} className="p-1.5 rounded-lg hover:bg-green-50 text-gray-400 hover:text-green-600 transition text-xs font-medium px-2">Confirm</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400 text-sm">No deliveries recorded.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Delivery Modal */}
      {modal && (
        <Modal title="Record New Delivery" onClose={() => setModal(false)} wide>
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Supplier">
                <Select value={form.supplierId} onChange={e => setForm(p => ({ ...p, supplierId: e.target.value }))}>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </Field>
              <Field label="Date"><Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} /></Field>
              <Field label="Invoice Number"><Input value={form.invoice} onChange={e => setForm(p => ({ ...p, invoice: e.target.value }))} placeholder="INV-xxx" /></Field>
            </div>

            {/* Line Items */}
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-3">Items Received</p>
              <div className="flex flex-wrap gap-2 mb-3">
                <Select value={lineForm.itemId} onChange={e => setLineForm(p => ({ ...p, itemId: e.target.value }))} className="flex-1 min-w-[140px]">
                  {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                </Select>
                <Input type="number" value={lineForm.qty} onChange={e => setLineForm(p => ({ ...p, qty: e.target.value }))} placeholder="Qty" className="w-24" min="1" />
                <Input type="number" value={lineForm.unitPrice} onChange={e => setLineForm(p => ({ ...p, unitPrice: e.target.value }))} placeholder="Unit price" className="w-36" min="0" />
                <Btn variant="secondary" onClick={addLine}><Plus className="w-4 h-4" />Add</Btn>
              </div>

              {form.lines.length > 0 && (
                <div className="border border-gray-100 rounded-xl overflow-hidden">
                  <table className="min-w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs text-gray-500 font-semibold">Item</th>
                        <th className="px-3 py-2 text-left text-xs text-gray-500 font-semibold">Qty</th>
                        <th className="px-3 py-2 text-left text-xs text-gray-500 font-semibold">Unit Price</th>
                        <th className="px-3 py-2 text-left text-xs text-gray-500 font-semibold">Subtotal</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {form.lines.map((l, i) => (
                        <tr key={i}>
                          <td className="px-3 py-2 text-sm text-gray-800">{l.itemName}</td>
                          <td className="px-3 py-2 text-sm text-gray-600">{l.qty}</td>
                          <td className="px-3 py-2 text-sm text-gray-600">{currency(l.unitPrice)}</td>
                          <td className="px-3 py-2 text-sm font-semibold">{currency(l.qty * l.unitPrice)}</td>
                          <td className="px-3 py-2"><button onClick={() => removeLine(i)} className="text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50">
                      <tr>
                        <td colSpan={3} className="px-3 py-2 text-sm font-bold text-gray-700 text-right">Total:</td>
                        <td className="px-3 py-2 text-sm font-bold text-indigo-700">{currency(form.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0))}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Btn variant="secondary" onClick={() => setModal(false)}>Cancel</Btn>
              <Btn variant="secondary" onClick={() => save("Pending")}><Save className="w-4 h-4" />Save as Pending</Btn>
              <Btn variant="success" onClick={() => save("Confirmed")}><CheckCircle className="w-4 h-4" />Save & Confirm</Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* View Delivery Modal */}
      {viewModal && (
        <Modal title={`Delivery — ${viewModal.invoice || "No Invoice"}`} onClose={() => setViewModal(null)} wide>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-500">Supplier:</span> <span className="font-medium text-gray-800">{viewModal.supplierName}</span></div>
              <div><span className="text-gray-500">Date:</span> <span className="font-medium text-gray-800">{viewModal.date}</span></div>
              <div><span className="text-gray-500">Invoice:</span> <span className="font-mono text-gray-800">{viewModal.invoice}</span></div>
              <div><span className="text-gray-500">Status:</span> <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${viewModal.status === "Confirmed" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>{viewModal.status}</span></div>
            </div>
            <table className="min-w-full border border-gray-100 rounded-xl overflow-hidden text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-gray-500 font-semibold">Item</th>
                  <th className="px-4 py-2 text-left text-gray-500 font-semibold">Qty</th>
                  <th className="px-4 py-2 text-left text-gray-500 font-semibold">Unit Price</th>
                  <th className="px-4 py-2 text-left text-gray-500 font-semibold">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {viewModal.lines.map((l, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2 text-gray-800">{l.itemName}</td>
                    <td className="px-4 py-2 text-gray-600">{l.qty}</td>
                    <td className="px-4 py-2 text-gray-600">{currency(l.unitPrice)}</td>
                    <td className="px-4 py-2 font-semibold">{currency(l.qty * l.unitPrice)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50">
                <tr>
                  <td colSpan={3} className="px-4 py-2 font-bold text-gray-700 text-right">Total:</td>
                  <td className="px-4 py-2 font-bold text-indigo-700">{currency(deliveryTotal(viewModal))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// STOCK OUTPUT TAB
// ══════════════════════════════════════════════════════════════════════════════
const StockOutputTab = ({ outputs, setOutputs, items, setItems }) => {
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ itemId: "", qty: 1, reason: "Kitchen Usage", date: fmt(today), note: "" });

  const { sorted, sort, toggle } = useSortableTable(outputs, "date");

  const openNew = () => {
    setForm({ itemId: items[0]?.id || "", qty: 1, reason: "Kitchen Usage", date: fmt(today), note: "" });
    setModal(true);
  };

  const save = () => {
    if (!form.itemId || form.qty <= 0) return;
    const item = items.find(i => i.id === +form.itemId);
    if (!item) return;
    const newQty = +form.qty;
    const output = { id: Date.now(), itemId: item.id, itemName: item.name, qty: newQty, reason: form.reason, date: form.date, note: form.note };
    setOutputs(p => [output, ...p]);
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, stock: Math.max(0, i.stock - newQty) } : i));
    setModal(false);
  };

  const reasonColors = {
    "Kitchen Usage": "bg-blue-100 text-blue-700",
    "Waste": "bg-red-100 text-red-700",
    "Spoilage": "bg-orange-100 text-orange-700",
    "Transfer": "bg-purple-100 text-purple-700",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-800">Stock Output History</h2>
        <Btn onClick={openNew}><Plus className="w-4 h-4" />Record Output</Btn>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <Th col="date" sort={sort} onSort={toggle}>Date</Th>
                <Th col="itemName" sort={sort} onSort={toggle}>Item</Th>
                <Th col="qty" sort={sort} onSort={toggle}>Quantity</Th>
                <Th col="reason" sort={sort} onSort={toggle}>Reason</Th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sorted.map(o => (
                <tr key={o.id} className="hover:bg-gray-50/60 transition">
                  <td className="px-4 py-3 text-sm text-gray-700">{o.date}</td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-800">{o.itemName}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{o.qty}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${reasonColors[o.reason] || "bg-gray-100 text-gray-700"}`}>
                      {o.reason}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">{o.note || "—"}</td>
                </tr>
              ))}
              {sorted.length === 0 && <tr><td colSpan={5} className="px-4 py-12 text-center text-gray-400 text-sm">No stock outputs recorded.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <Modal title="Record Stock Output" onClose={() => setModal(false)}>
          <div className="space-y-4">
            <Field label="Item">
              <Select value={form.itemId} onChange={e => setForm(p => ({ ...p, itemId: e.target.value }))}>
                {items.map(i => <option key={i.id} value={i.id}>{i.name} (stock: {i.stock} {i.unit})</option>)}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Quantity">
                <Input type="number" value={form.qty} onChange={e => setForm(p => ({ ...p, qty: e.target.value }))} min="1" />
              </Field>
              <Field label="Reason">
                <Select value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))}>
                  {OUTPUT_REASONS.map(r => <option key={r}>{r}</option>)}
                </Select>
              </Field>
            </div>
            <Field label="Date"><Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} /></Field>
            <Field label="Note (optional)">
              <textarea className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-gray-50 resize-none"
                rows={2} value={form.note} onChange={e => setForm(p => ({ ...p, note: e.target.value }))} placeholder="Optional notes..." />
            </Field>
            <div className="flex justify-end gap-3 pt-2">
              <Btn variant="secondary" onClick={() => setModal(false)}>Cancel</Btn>
              <Btn onClick={save}><Save className="w-4 h-4" />Save Output</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// SUPPLIERS TAB
// ══════════════════════════════════════════════════════════════════════════════
const SuppliersTab = ({ suppliers, setSuppliers }) => {
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [deleteId, setDeleteId] = useState(null);

  const { sorted, sort, toggle } = useSortableTable(suppliers, "name");

  const openAdd = () => { setForm({ name: "", contact: "", phone: "", email: "", category: "Food" }); setModal({ mode: "add" }); };
  const openEdit = (s) => { setForm({ ...s }); setModal({ mode: "edit", supplier: s }); };

  const save = () => {
    if (!form.name.trim()) return;
    if (modal.mode === "add") {
      setSuppliers(p => [...p, { ...form, id: Date.now() }]);
    } else {
      setSuppliers(p => p.map(s => s.id === modal.supplier.id ? { ...s, ...form } : s));
    }
    setModal(null);
  };

  const del = (id) => { setSuppliers(p => p.filter(s => s.id !== id)); setDeleteId(null); };
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-800">Suppliers</h2>
        <Btn onClick={openAdd}><Plus className="w-4 h-4" />Add Supplier</Btn>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <Th col="name" sort={sort} onSort={toggle}>Supplier Name</Th>
                <Th col="contact" sort={sort} onSort={toggle}>Contact Person</Th>
                <Th col="phone" sort={sort} onSort={toggle}>Phone</Th>
                <Th col="email" sort={sort} onSort={toggle}>Email</Th>
                <Th col="category" sort={sort} onSort={toggle}>Category</Th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sorted.map(s => (
                <tr key={s.id} className="hover:bg-gray-50/60 transition">
                  <td className="px-4 py-3 font-semibold text-gray-800 text-sm">{s.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{s.contact}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 font-mono">{s.phone}</td>
                  <td className="px-4 py-3 text-sm text-indigo-600">{s.email}</td>
                  <td className="px-4 py-3">
                    <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-medium">{s.category}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(s)} className="p-1.5 rounded-lg hover:bg-indigo-50 text-gray-400 hover:text-indigo-600 transition"><Edit2 className="w-4 h-4" /></button>
                      <button onClick={() => setDeleteId(s.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400 text-sm">No suppliers added.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <Modal title={modal.mode === "add" ? "Add Supplier" : "Edit Supplier"} onClose={() => setModal(null)}>
          <div className="space-y-4">
            <Field label="Supplier Name"><Input value={form.name} onChange={e => f("name", e.target.value)} placeholder="e.g. FreshFarm Co." /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Contact Person"><Input value={form.contact} onChange={e => f("contact", e.target.value)} placeholder="Full name" /></Field>
              <Field label="Category">
                <Select value={form.category} onChange={e => f("category", e.target.value)}>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Phone"><Input value={form.phone} onChange={e => f("phone", e.target.value)} placeholder="+998 90 ..." /></Field>
              <Field label="Email"><Input type="email" value={form.email} onChange={e => f("email", e.target.value)} placeholder="email@domain.com" /></Field>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Btn variant="secondary" onClick={() => setModal(null)}>Cancel</Btn>
              <Btn onClick={save}><Save className="w-4 h-4" />Save Supplier</Btn>
            </div>
          </div>
        </Modal>
      )}

      {deleteId && (
        <Modal title="Delete Supplier?" onClose={() => setDeleteId(null)}>
          <p className="text-sm text-gray-600 mb-6">Are you sure you want to remove this supplier?</p>
          <div className="flex justify-end gap-3">
            <Btn variant="secondary" onClick={() => setDeleteId(null)}>Cancel</Btn>
            <Btn variant="danger" onClick={() => del(deleteId)}><Trash2 className="w-4 h-4" />Delete</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// MAIN APP
// ══════════════════════════════════════════════════════════════════════════════
export default function InventoryManagement() {
  const [tab, setTab] = useState("Inventory");
  const [items, setItems] = useState(SEED_ITEMS);
  const [deliveries, setDeliveries] = useState(SEED_DELIVERIES);
  const [outputs, setOutputs] = useState(SEED_OUTPUTS);
  const [suppliers, setSuppliers] = useState(SEED_SUPPLIERS);

  // ── Dashboard Stats ──────────────────────────────────────────────────────
  const totalValue = useMemo(() => items.reduce((s, i) => s + i.stock * i.unitCost, 0), [items]);
  const lowCount = useMemo(() => items.filter(i => stockStatus(i) === "low").length, [items]);
  const outCount = useMemo(() => items.filter(i => stockStatus(i) === "critical").length, [items]);
  const monthlySpend = useMemo(() => {
    const ym = fmt(today).slice(0, 7);
    return deliveries.filter(d => d.date.startsWith(ym)).reduce((s, d) => s + deliveryTotal(d), 0);
  }, [deliveries]);

  const tabIcons = { Inventory: Package, Deliveries: Truck, "Stock Output": ArrowDownCircle, Suppliers: Users };

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center gap-3 py-4">
            <div className="p-2 bg-indigo-600 rounded-xl">
              <BarChart2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900 leading-tight">Inventory Management</h1>
              <p className="text-xs text-gray-400">Restaurant Admin Dashboard</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={DollarSign} label="Total Inventory Value" value={currency(totalValue)} color="bg-indigo-500" sub="All items combined" />
          <StatCard icon={AlertTriangle} label="Low Stock Items" value={lowCount} color="bg-yellow-500" sub="Below minimum threshold" />
          <StatCard icon={XCircle} label="Out of Stock" value={outCount} color="bg-red-500" sub="Needs restocking" />
          <StatCard icon={ShoppingCart} label="Monthly Deliveries" value={currency(monthlySpend)} color="bg-green-500" sub={`${fmt(today).slice(0, 7)}`} />
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-1.5 flex gap-1 overflow-x-auto">
          {TABS.map(t => {
            const Icon = tabIcons[t];
            const active = tab === t;
            return (
              <button key={t} onClick={() => setTab(t)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition whitespace-nowrap flex-1 justify-center
                  ${active ? "bg-indigo-600 text-white shadow-sm" : "text-gray-500 hover:bg-gray-100 hover:text-gray-800"}`}>
                <Icon className="w-4 h-4" />{t}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        {tab === "Inventory" && <InventoryTab items={items} setItems={setItems} />}
        {tab === "Deliveries" && <DeliveriesTab deliveries={deliveries} setDeliveries={setDeliveries} items={items} setItems={setItems} suppliers={suppliers} />}
        {tab === "Stock Output" && <StockOutputTab outputs={outputs} setOutputs={setOutputs} items={items} setItems={setItems} />}
        {tab === "Suppliers" && <SuppliersTab suppliers={suppliers} setSuppliers={setSuppliers} />}
      </div>
    </div>
  );
}

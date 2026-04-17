import React, { useState, useEffect, useRef } from 'react';
import {
  ShoppingBag, CreditCard, History, User, LogOut, Plus, ArrowLeft,
  Banknote, QrCode, Printer, ChevronDown, Check, X, Clock, RefreshCw,
  PlusCircle, AlertCircle, CheckCircle, Search, Calendar, TrendingUp,
  DollarSign, Package, Users, Lock, Phone, Timer, Receipt,
} from 'lucide-react';

// ── Constants ──────────────────────────────────────────────────────────────
const CASHIER = { name: 'Jasur Nazarov', role: 'Cashier', phone: '+998 ** *** **47', shiftStart: '09:00', shiftEnd: '18:00' };
const TAX_RATE = 0.12;
const SERVICE_RATE = 0.05;
const fmt = (n) => Number(n).toLocaleString('uz-UZ') + ' so\'m';
const now = () => new Date();
const pad = (n) => String(n).padStart(2, '0');
const timeStr = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const dateStr = (d) => `${pad(d.getDate())}.${pad(d.getMonth()+1)}.${d.getFullYear()}`;
const elapsed = (iso) => {
  const diff = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (diff < 60) return `${diff}m ago`;
  return `${Math.floor(diff/60)}h ${diff%60}m ago`;
};

const MENU = [
  { id: 1, cat: 'Starters', name: 'Caesar Salad', price: 45000 },
  { id: 2, cat: 'Starters', name: 'Mushroom Soup', price: 38000 },
  { id: 3, cat: 'Starters', name: 'Bruschetta', price: 32000 },
  { id: 4, cat: 'Mains', name: 'Beef Steak', price: 120000 },
  { id: 5, cat: 'Mains', name: 'Grilled Salmon', price: 98000 },
  { id: 6, cat: 'Mains', name: 'Pasta Carbonara', price: 65000 },
  { id: 7, cat: 'Mains', name: 'Chicken Kiev', price: 72000 },
  { id: 8, cat: 'Drinks', name: 'Fresh Juice', price: 22000 },
  { id: 9, cat: 'Drinks', name: 'Ayran', price: 12000 },
  { id: 10, cat: 'Drinks', name: 'Mineral Water', price: 8000 },
  { id: 11, cat: 'Desserts', name: 'Tiramisu', price: 42000 },
  { id: 12, cat: 'Desserts', name: 'Cheesecake', price: 38000 },
];

const t0 = new Date(); t0.setHours(11,15,0,0);
const t1 = new Date(); t1.setHours(12,30,0,0);
const t2 = new Date(); t2.setHours(13,5,0,0);

const INIT_ORDERS = [
  {
    id: 1001, table: 'Table 3', waitress: 'Malika T.', status: 'served',
    createdAt: t0.toISOString(),
    items: [
      { id: 4, name: 'Beef Steak', qty: 2, price: 120000 },
      { id: 1, name: 'Caesar Salad', qty: 2, price: 45000 },
      { id: 8, name: 'Fresh Juice', qty: 3, price: 22000 },
    ],
  },
  {
    id: 1002, table: 'Table 7', waitress: 'Dilnoza K.', status: 'served',
    createdAt: t1.toISOString(),
    items: [
      { id: 6, name: 'Pasta Carbonara', qty: 1, price: 65000 },
      { id: 2, name: 'Mushroom Soup', qty: 2, price: 38000 },
      { id: 11, name: 'Tiramisu', qty: 2, price: 42000 },
      { id: 10, name: 'Mineral Water', qty: 2, price: 8000 },
    ],
  },
  {
    id: 1003, table: 'Walk-in', waitress: 'Counter', status: 'ready',
    createdAt: t2.toISOString(),
    items: [
      { id: 7, name: 'Chicken Kiev', qty: 1, price: 72000 },
      { id: 9, name: 'Ayran', qty: 1, price: 12000 },
    ],
  },
];

const makeHistory = (id, table, method, cashier, amt, discount, refunded, daysAgo, hoursAgo) => {
  const d = new Date(); d.setDate(d.getDate()-daysAgo); d.setHours(hoursAgo,0,0,0);
  return { id, table, method, cashier, amount: amt, discount, refunded, paidAt: d.toISOString(), status: refunded ? 'Refunded' : 'Paid' };
};
const INIT_HISTORY = [
  makeHistory(9001,'Table 1','Cash','Jasur Nazarov',396000,0,false,0,10),
  makeHistory(9002,'Table 5','Card','Jasur Nazarov',201000,20000,false,0,11),
  makeHistory(9003,'Walk-in','Cash','Jasur Nazarov',84000,0,false,0,12),
  makeHistory(9004,'Table 2','QR','Jasur Nazarov',530000,50000,true,0,13),
  makeHistory(9005,'Table 8','Card','Jasur Nazarov',265000,0,false,1,14),
  makeHistory(9006,'Table 4','Cash','Jasur Nazarov',178000,0,false,1,15),
  makeHistory(9007,'Walk-in','QR','Jasur Nazarov',96000,10000,false,2,9),
  makeHistory(9008,'Table 6','Card','Jasur Nazarov',312000,0,false,2,11),
];

const DISCOUNT_REASONS = ['Manager Approved','Loyalty Customer','Complaint Resolution','Other'];
// ── Helper Components ────────────────────────────────────────────────────────
function Toast({ msg, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2600); return () => clearTimeout(t); }, []);
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white px-4 py-2 rounded-full text-sm font-medium shadow-lg flex items-center gap-2 animate-fade-in">
      <CheckCircle size={15} className="text-green-400" />{msg}
    </div>
  );
}

function BottomSheet({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative bg-white rounded-t-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center px-4 pt-4 pb-2 border-b border-gray-100">
          <span className="font-semibold text-gray-800 text-base">{title}</span>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }) {
  return (
    <div className="bg-white rounded-xl p-3 flex-1 shadow-sm border border-gray-100">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-lg font-bold text-gray-900 leading-tight">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Start Shift Modal ────────────────────────────────────────────────────────
function StartShiftModal({ onStart }) {
  return (
    <div className="fixed inset-0 z-50 bg-gray-50 flex flex-col items-center justify-center px-6">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm text-center">
        <div className="w-14 h-14 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <Timer size={28} className="text-blue-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-1">Start Your Shift</h2>
        <p className="text-sm text-gray-500 mb-2">Welcome, <span className="font-semibold text-gray-800">{CASHIER.name}</span></p>
        <p className="text-xs text-gray-400 mb-6">Scheduled: {CASHIER.shiftStart} – {CASHIER.shiftEnd}</p>
        <button onClick={onStart} className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-semibold text-base">
          Start Shift
        </button>
      </div>
    </div>
  );
}

// ── Walk-in Order Modal ──────────────────────────────────────────────────────
function WalkinModal({ open, onClose, onSubmit }) {
  const [cart, setCart] = useState([]);
  const [activeCat, setActiveCat] = useState('Starters');
  const cats = [...new Set(MENU.map(m => m.cat))];
  const addItem = (item) => setCart(c => {
    const ex = c.find(x => x.id === item.id);
    return ex ? c.map(x => x.id === item.id ? { ...x, qty: x.qty + 1 } : x) : [...c, { ...item, qty: 1 }];
  });
  const removeItem = (id) => setCart(c => c.flatMap(x => x.id === id ? (x.qty > 1 ? [{ ...x, qty: x.qty - 1 }] : []) : [x]));
  const subtotal = cart.reduce((s, x) => s + x.price * x.qty, 0);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 bg-white flex flex-col">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
        <button onClick={onClose} className="p-2"><ArrowLeft size={20} className="text-gray-700" /></button>
        <h2 className="font-bold text-gray-900 text-base flex-1">New Walk-in Order</h2>
        <span className="text-xs text-gray-400">{cart.reduce((s, x) => s + x.qty, 0)} items</span>
      </div>
      <div className="flex gap-2 px-4 py-2 overflow-x-auto border-b border-gray-100">
        {cats.map(c => (
          <button key={c} onClick={() => setActiveCat(c)} className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${activeCat === c ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>{c}</button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {MENU.filter(m => m.cat === activeCat).map(item => {
          const inCart = cart.find(x => x.id === item.id);
          return (
            <div key={item.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2.5">
              <div>
                <p className="text-sm font-medium text-gray-800">{item.name}</p>
                <p className="text-xs text-gray-500">{fmt(item.price)}</p>
              </div>
              {inCart ? (
                <div className="flex items-center gap-3">
                  <button onClick={() => removeItem(item.id)} className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center font-bold text-gray-700">−</button>
                  <span className="text-sm font-semibold w-4 text-center">{inCart.qty}</span>
                  <button onClick={() => addItem(item)} className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center"><Plus size={14} className="text-white" /></button>
                </div>
              ) : (
                <button onClick={() => addItem(item)} className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center"><Plus size={14} className="text-white" /></button>
              )}
            </div>
          );
        })}
      </div>
      {cart.length > 0 && (
        <div className="px-4 pb-6 pt-3 border-t border-gray-100 space-y-2">
          <div className="flex justify-between text-sm font-semibold text-gray-800">
            <span>Total</span><span>{fmt(subtotal)}</span>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { onSubmit(cart, 'kitchen'); onClose(); }} className="flex-1 bg-gray-100 text-gray-800 py-3 rounded-xl font-semibold text-sm">Send to Kitchen</button>
            <button onClick={() => { onSubmit(cart, 'pay'); onClose(); }} className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-semibold text-sm">Go to Payment</button>
          </div>
        </div>
      )}
    </div>
  );
}
// ── Split Bill Sheet ─────────────────────────────────────────────────────────
function SplitBillSheet({ open, onClose, total, onConfirm }) {
  const [ways, setWays] = useState(2);
  const [custom, setCustom] = useState('');
  const [splits, setSplits] = useState([]);
  const [confirmed, setConfirmed] = useState([]);
  const count = custom ? parseInt(custom) || 2 : ways;
  const splitAmt = Math.ceil(total / count);

  useEffect(() => { setSplits(Array(count).fill('Cash')); setConfirmed(Array(count).fill(false)); }, [count]);

  const allOk = confirmed.every(Boolean);
  return (
    <BottomSheet open={open} onClose={onClose} title="Split Bill">
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          {[2,3,4].map(n => (
            <button key={n} onClick={() => { setWays(n); setCustom(''); }} className={`flex-1 py-2 rounded-xl text-sm font-semibold ${!custom && ways===n ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}>{n} ways</button>
          ))}
          <input placeholder="Custom" value={custom} onChange={e => setCustom(e.target.value)} className="flex-1 border border-gray-200 rounded-xl text-sm text-center py-2 outline-none" />
        </div>
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {Array.from({length:count}).map((_,i) => (
            <div key={i} className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2.5">
              <span className="text-sm font-medium text-gray-600 w-16">Part {i+1}</span>
              <span className="text-sm font-semibold text-gray-800 flex-1">{fmt(splitAmt)}</span>
              <select value={splits[i]||'Cash'} onChange={e => { const s=[...splits]; s[i]=e.target.value; setSplits(s); }} className="text-xs bg-white border border-gray-200 rounded-lg px-2 py-1 outline-none">
                <option>Cash</option><option>Card</option><option>QR Code</option>
              </select>
              <button onClick={() => { const c=[...confirmed]; c[i]=!c[i]; setConfirmed(c); }} className={`w-7 h-7 rounded-full flex items-center justify-center ${confirmed[i] ? 'bg-green-500' : 'bg-gray-200'}`}>
                {confirmed[i] && <Check size={13} className="text-white" />}
              </button>
            </div>
          ))}
        </div>
        <button disabled={!allOk} onClick={() => onConfirm(splits)} className={`w-full py-3.5 rounded-xl font-semibold text-sm ${allOk ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-400'}`}>
          Confirm All Splits
        </button>
      </div>
    </BottomSheet>
  );
}

// ── Receipt Sheet ─────────────────────────────────────────────────────────────
function ReceiptSheet({ open, onClose, order, payment, onPrint }) {
  if (!order) return null;
  const subtotal = order.items.reduce((s, x) => s + x.price * x.qty, 0) - (payment?.discount||0);
  const tax = Math.round(subtotal * TAX_RATE);
  const service = Math.round(subtotal * SERVICE_RATE);
  const total = subtotal + tax + service;
  return (
    <BottomSheet open={open} onClose={onClose} title="Receipt Preview">
      <div className="p-4 space-y-3">
        <div className="bg-gray-50 rounded-xl p-4 space-y-1 text-center">
          <p className="font-bold text-gray-900 text-base">The Bill Restaurant</p>
          <p className="text-xs text-gray-500">Thank you for dining with us!</p>
          <p className="text-xs text-gray-400">Order #{order.id} • {order.table}</p>
          <p className="text-xs text-gray-400">{dateStr(now())} {timeStr(now())}</p>
        </div>
        <div className="space-y-1.5">
          {order.items.map((item, i) => (
            <div key={i} className="flex justify-between text-sm">
              <span className="text-gray-700">{item.name} x{item.qty}</span>
              <span className="text-gray-800 font-medium">{fmt(item.price * item.qty)}</span>
            </div>
          ))}
        </div>
        <div className="border-t border-dashed border-gray-200 pt-2 space-y-1">
          <div className="flex justify-between text-xs text-gray-500"><span>Subtotal</span><span>{fmt(order.items.reduce((s,x)=>s+x.price*x.qty,0))}</span></div>
          {(payment?.discount||0) > 0 && <div className="flex justify-between text-xs text-green-600"><span>Discount</span><span>−{fmt(payment.discount)}</span></div>}
          <div className="flex justify-between text-xs text-gray-500"><span>Tax (12%)</span><span>{fmt(tax)}</span></div>
          <div className="flex justify-between text-xs text-gray-500"><span>Service (5%)</span><span>{fmt(service)}</span></div>
          <div className="flex justify-between text-sm font-bold text-gray-900 pt-1 border-t border-gray-200"><span>Total</span><span>{fmt(total)}</span></div>
          {payment?.method==='Cash' && payment?.change > 0 && <div className="flex justify-between text-xs text-blue-600"><span>Change</span><span>{fmt(payment.change)}</span></div>}
        </div>
        <div className="flex justify-between text-xs text-gray-400">
          <span>Method: {payment?.method||'—'}</span>
          <span>Cashier: {CASHIER.name}</span>
        </div>
        <p className="text-center text-xs text-gray-400 italic">Come back soon!</p>
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 py-3 bg-gray-100 rounded-xl text-sm font-semibold text-gray-700">Skip</button>
          <button onClick={onPrint} className="flex-1 py-3 bg-blue-600 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2"><Printer size={15}/>Print</button>
        </div>
      </div>
    </BottomSheet>
  );
}

// ── Refund Sheet ──────────────────────────────────────────────────────────────
function RefundSheet({ open, onClose, tx, onConfirm }) {
  const [amt, setAmt] = useState(tx?.amount||0);
  const [reason, setReason] = useState('Customer Complaint');
  const REASONS = ['Customer Complaint','Wrong Order','Duplicate Payment','Other'];
  useEffect(() => { if (tx) setAmt(tx.amount); }, [tx]);
  if (!tx) return null;
  return (
    <BottomSheet open={open} onClose={onClose} title={`Refund — Order #${tx.id}`}>
      <div className="p-4 space-y-4">
        <div className="bg-gray-50 rounded-xl p-3 space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-gray-500">Table</span><span className="font-medium">{tx.table}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Paid</span><span className="font-medium">{fmt(tx.amount)}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Method</span><span className="font-medium">{tx.method}</span></div>
        </div>
        <div>
          <label className="text-xs text-gray-500 font-medium block mb-1.5">Refund Amount</label>
          <input type="number" value={amt} onChange={e=>setAmt(Number(e.target.value))} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none" />
        </div>
        <div>
          <label className="text-xs text-gray-500 font-medium block mb-1.5">Reason</label>
          <select value={reason} onChange={e=>setReason(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none bg-white">
            {REASONS.map(r=><option key={r}>{r}</option>)}
          </select>
        </div>
        <button onClick={()=>onConfirm(tx.id, amt, reason)} className="w-full py-3.5 bg-red-600 text-white rounded-xl font-semibold text-sm">Confirm Refund</button>
      </div>
    </BottomSheet>
  );
}
// ── Payment Screen ────────────────────────────────────────────────────────────
function PaymentScreen({ order, onBack, onPaid, showToast }) {
  const rawSub = order.items.reduce((s, x) => s + x.price * x.qty, 0);
  const [method, setMethod] = useState('Cash');
  const [cash, setCash] = useState('');
  const [cardConfirmed, setCardConfirmed] = useState(false);
  const [qrConfirmed, setQrConfirmed] = useState(false);
  const [discType, setDiscType] = useState('Percentage');
  const [discVal, setDiscVal] = useState('');
  const [discReason, setDiscReason] = useState(DISCOUNT_REASONS[0]);
  const [showSplit, setShowSplit] = useState(false);
  const [splitDone, setSplitDone] = useState(false);

  const discAmt = discVal
    ? discType === 'Percentage' ? Math.round(rawSub * Math.min(parseFloat(discVal)||0, 100) / 100) : Math.min(parseInt(discVal)||0, rawSub)
    : 0;
  const subtotal = rawSub - discAmt;
  const tax = Math.round(subtotal * TAX_RATE);
  const service = Math.round(subtotal * SERVICE_RATE);
  const total = subtotal + tax + service;
  const changeDue = method === 'Cash' ? Math.max(0, (parseInt(cash)||0) - total) : 0;

  const canConfirm = splitDone || (
    method === 'Cash' ? (parseInt(cash)||0) >= total :
    method === 'Card' ? cardConfirmed :
    qrConfirmed
  );

  const handlePay = () => {
    onPaid(order, { method, discount: discAmt, change: changeDue, discReason: discAmt > 0 ? discReason : null });
  };

  const METHODS = [
    { id: 'Cash', icon: Banknote }, { id: 'Card', icon: CreditCard }, { id: 'QR Code', icon: QrCode },
  ];

  return (
    <div className="fixed inset-0 z-30 bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button onClick={onBack} className="p-2"><ArrowLeft size={20} className="text-gray-700" /></button>
        <div className="flex-1">
          <p className="text-xs text-gray-500">Process Payment</p>
          <p className="font-bold text-gray-900">Order #{order.id}</p>
        </div>
        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">{order.table}</span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Items */}
        <div className="bg-white rounded-xl p-4 space-y-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Order Items</p>
          {order.items.map((item, i) => (
            <div key={i} className="flex justify-between text-sm">
              <span className="text-gray-700">{item.name} <span className="text-gray-400">x{item.qty}</span></span>
              <span className="font-medium text-gray-800">{fmt(item.price * item.qty)}</span>
            </div>
          ))}
          <div className="border-t border-dashed border-gray-100 pt-2 mt-2 space-y-1">
            <div className="flex justify-between text-xs text-gray-400"><span>Subtotal</span><span>{fmt(rawSub)}</span></div>
            {discAmt > 0 && <div className="flex justify-between text-xs text-green-600"><span>Discount</span><span>−{fmt(discAmt)}</span></div>}
            <div className="flex justify-between text-xs text-gray-400"><span>Tax 12%</span><span>{fmt(tax)}</span></div>
            <div className="flex justify-between text-xs text-gray-400"><span>Service 5%</span><span>{fmt(service)}</span></div>
            <div className="flex justify-between text-sm font-bold text-gray-900 pt-1 border-t border-gray-100">
              <span>Total</span><span className="text-blue-700 text-base">{fmt(total)}</span>
            </div>
          </div>
        </div>

        {/* Payment Method */}
        <div className="bg-white rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Payment Method</p>
          <div className="flex gap-2">
            {METHODS.map(({ id, icon: Icon }) => (
              <button key={id} onClick={() => setMethod(id)} className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 transition-all ${method===id ? 'border-blue-600 bg-blue-50' : 'border-gray-100 bg-gray-50'}`}>
                <Icon size={22} className={method===id ? 'text-blue-600' : 'text-gray-500'} />
                <span className={`text-xs font-semibold ${method===id ? 'text-blue-700' : 'text-gray-600'}`}>{id}</span>
              </button>
            ))}
          </div>

          <div className="mt-3">
            {method === 'Cash' && (
              <div>
                <label className="text-xs text-gray-500 block mb-1.5">Amount received</label>
                <input type="number" placeholder="0" value={cash} onChange={e=>setCash(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none" />
                {parseInt(cash) >= total && (
                  <div className="mt-2 bg-green-50 rounded-xl p-3 text-center">
                    <p className="text-xs text-green-600">Change to give back</p>
                    <p className="text-2xl font-bold text-green-600">{fmt(changeDue)}</p>
                  </div>
                )}
              </div>
            )}
            {method === 'Card' && (
              <button onClick={() => setCardConfirmed(!cardConfirmed)} className={`mt-1 w-full flex items-center gap-3 p-3 rounded-xl border-2 ${cardConfirmed ? 'border-green-500 bg-green-50' : 'border-gray-200'}`}>
                <div className={`w-5 h-5 rounded flex items-center justify-center ${cardConfirmed ? 'bg-green-500' : 'border-2 border-gray-300'}`}>{cardConfirmed && <Check size={12} className="text-white"/>}</div>
                <span className="text-sm text-gray-700">Card payment confirmed on terminal</span>
              </button>
            )}
            {method === 'QR Code' && (
              <div className="space-y-2 mt-1">
                <div className="border-2 border-dashed border-gray-200 rounded-xl h-32 flex items-center justify-center">
                  <div className="text-center"><QrCode size={36} className="text-gray-300 mx-auto mb-1"/><p className="text-xs text-gray-400">Customer scans to pay</p></div>
                </div>
                <button onClick={() => setQrConfirmed(!qrConfirmed)} className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 ${qrConfirmed ? 'border-green-500 bg-green-50' : 'border-gray-200'}`}>
                  <div className={`w-5 h-5 rounded flex items-center justify-center ${qrConfirmed ? 'bg-green-500' : 'border-2 border-gray-300'}`}>{qrConfirmed && <Check size={12} className="text-white"/>}</div>
                  <span className="text-sm text-gray-700">QR payment confirmed</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Discount */}
        <div className="bg-white rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Apply Discount</p>
          <div className="flex gap-2">
            {['Percentage','Fixed Amount'].map(t => (
              <button key={t} onClick={() => { setDiscType(t); setDiscVal(''); }} className={`flex-1 py-2 rounded-xl text-xs font-semibold ${discType===t ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>{t}</button>
            ))}
          </div>
          <input type="number" placeholder={discType==='Percentage' ? '0 %' : '0 so\'m'} value={discVal} onChange={e=>setDiscVal(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none" />
          {discVal && (
            <select value={discReason} onChange={e=>setDiscReason(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none bg-white">
              {DISCOUNT_REASONS.map(r=><option key={r}>{r}</option>)}
            </select>
          )}
        </div>

        {/* Split */}
        <button onClick={() => setShowSplit(true)} className="w-full bg-white border border-gray-200 py-3 rounded-xl text-sm font-semibold text-gray-700 flex items-center justify-center gap-2">
          <Users size={16} className="text-gray-500"/>Split Bill
        </button>
        {splitDone && <div className="text-center text-xs text-green-600 font-medium flex items-center justify-center gap-1"><CheckCircle size={13}/>Split confirmed</div>}
      </div>

      {/* Confirm */}
      <div className="px-4 pb-6 pt-3 bg-white border-t border-gray-100">
        <button disabled={!canConfirm} onClick={handlePay} className={`w-full py-4 rounded-2xl font-bold text-base ${canConfirm ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-400'}`}>
          Confirm Payment — {fmt(total)}
        </button>
      </div>

      <SplitBillSheet open={showSplit} onClose={() => setShowSplit(false)} total={total} onConfirm={() => { setSplitDone(true); setShowSplit(false); showToast('Split bill confirmed'); }} />
    </div>
  );
}
// ── Orders Tab ────────────────────────────────────────────────────────────────
function OrdersTab({ orders, history, onPay, showToast }) {
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showWalkin, setShowWalkin] = useState(false);
  const [localOrders, setLocalOrders] = useState(orders);

  useEffect(() => setLocalOrders(orders), [orders]);

  const todayPaid = history.filter(h => {
    const d = new Date(h.paidAt); const today = new Date();
    return d.toDateString() === today.toDateString() && h.status !== 'Refunded';
  });
  const todayRev = todayPaid.reduce((s,h) => s+h.amount, 0);

  const handleWalkin = (cart, mode) => {
    const newOrder = {
      id: 1000 + Math.floor(Math.random()*9000), table: 'Walk-in', waitress: 'Counter',
      status: mode === 'pay' ? 'served' : 'ready', createdAt: new Date().toISOString(),
      items: cart,
    };
    setLocalOrders(prev => [...prev, newOrder]);
    if (mode === 'pay') setSelectedOrder(newOrder);
    showToast(mode === 'kitchen' ? 'Order sent to kitchen' : 'Opening payment screen');
  };

  if (selectedOrder) {
    return <PaymentScreen order={selectedOrder} onBack={() => setSelectedOrder(null)} showToast={showToast}
      onPaid={(ord, payment) => { onPay(ord, payment); setSelectedOrder(null); }} />;
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Stats */}
      <div className="px-4 pt-4 pb-2 flex gap-2">
        <StatCard label="Pending Payment" value={localOrders.length} />
        <StatCard label="Completed Today" value={todayPaid.length} />
        <StatCard label="Revenue Today" value={fmt(todayRev).replace(' so\'m','')} sub="so'm" />
      </div>

      {/* Walk-in Button */}
      <div className="px-4 pb-3">
        <button onClick={() => setShowWalkin(true)} className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2">
          <PlusCircle size={16}/>New Walk-in Order
        </button>
      </div>

      {/* Order Cards */}
      <div className="px-4 space-y-3 pb-6">
        {localOrders.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <Package size={40} className="mx-auto mb-2 opacity-40"/>
            <p className="text-sm">No orders awaiting payment</p>
          </div>
        )}
        {localOrders.map(order => {
          const total = order.items.reduce((s,x)=>s+x.price*x.qty,0);
          const tax = Math.round(total * TAX_RATE); const svc = Math.round(total*SERVICE_RATE);
          const grand = total + tax + svc;
          return (
            <button key={order.id} onClick={() => setSelectedOrder(order)} className="w-full bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-left">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <span className="text-sm font-bold text-gray-900">#{order.id}</span>
                  <span className="ml-2 text-sm text-gray-500">{order.table}</span>
                </div>
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">Awaiting Payment</span>
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-400">
                <span className="flex items-center gap-1"><ShoppingBag size={12}/>{order.items.reduce((s,x)=>s+x.qty,0)} items</span>
                <span className="flex items-center gap-1"><User size={12}/>{order.waitress}</span>
                <span className="flex items-center gap-1"><Clock size={12}/>{elapsed(order.createdAt)}</span>
              </div>
              <div className="mt-2 pt-2 border-t border-gray-50 flex justify-between items-center">
                <span className="text-xs text-gray-400">{order.items.length} item types</span>
                <span className="text-base font-bold text-blue-700">{fmt(grand)}</span>
              </div>
            </button>
          );
        })}
      </div>

      <WalkinModal open={showWalkin} onClose={() => setShowWalkin(false)} onSubmit={handleWalkin} />
    </div>
  );
}

// ── Payments Tab ──────────────────────────────────────────────────────────────
function PaymentsTab({ showToast }) {
  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
      <div className="text-center py-10 bg-white rounded-2xl border border-gray-100">
        <CreditCard size={36} className="mx-auto text-gray-300 mb-2"/>
        <p className="text-sm text-gray-400">No active payment sessions</p>
      </div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Quick Actions</p>
      <button onClick={() => showToast('Receipt sent to printer')} className="w-full bg-white border border-gray-200 py-4 rounded-xl flex items-center gap-3 px-4">
        <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center"><Printer size={18} className="text-blue-600"/></div>
        <div className="text-left"><p className="text-sm font-semibold text-gray-800">Reprint Last Receipt</p><p className="text-xs text-gray-400">Order #9001</p></div>
      </button>
      <button className="w-full bg-white border border-gray-200 py-4 rounded-xl flex items-center gap-3 px-4 opacity-50">
        <div className="w-9 h-9 bg-gray-50 rounded-xl flex items-center justify-center"><Package size={18} className="text-gray-400"/></div>
        <div className="text-left"><p className="text-sm font-semibold text-gray-500">Open Cash Drawer</p><p className="text-xs text-gray-400">Not connected</p></div>
      </button>
    </div>
  );
}

// ── History Tab ───────────────────────────────────────────────────────────────
function HistoryTab({ history, setHistory, showToast }) {
  const [filter, setFilter] = useState('Today');
  const [refundTarget, setRefundTarget] = useState(null);
  const METHOD_ICONS = { Cash: Banknote, Card: CreditCard, 'QR Code': QrCode };
  const PILLS = ['Today','This Week','This Month'];

  const filtered = history.filter(h => {
    const d = new Date(h.paidAt); const now2 = new Date();
    if (filter==='Today') return d.toDateString() === now2.toDateString();
    if (filter==='This Week') { const wk = new Date(now2); wk.setDate(now2.getDate()-7); return d >= wk; }
    if (filter==='This Month') { return d.getMonth()===now2.getMonth() && d.getFullYear()===now2.getFullYear(); }
    return true;
  });

  const totRev = filtered.filter(h=>h.status!=='Refunded').reduce((s,h)=>s+h.amount,0);
  const totDisc = filtered.filter(h=>h.status!=='Refunded').reduce((s,h)=>s+(h.discount||0),0);
  const byCash = filtered.filter(h=>h.method==='Cash'&&h.status!=='Refunded').reduce((s,h)=>s+h.amount,0);
  const byCard = filtered.filter(h=>h.method==='Card'&&h.status!=='Refunded').reduce((s,h)=>s+h.amount,0);
  const byQr   = filtered.filter(h=>h.method==='QR Code'&&h.status!=='Refunded').reduce((s,h)=>s+h.amount,0);

  const handleRefund = (id, amt, reason) => {
    setHistory(prev => prev.map(h => h.id===id ? {...h, status:'Refunded', refundReason:reason, refundAmount:amt} : h));
    setRefundTarget(null);
    showToast('Refund processed. Admin notified.');
  };

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Filter Pills */}
      <div className="px-4 pt-4 pb-2 flex gap-2">
        {PILLS.map(p => (
          <button key={p} onClick={() => setFilter(p)} className={`px-3 py-1.5 rounded-full text-xs font-semibold ${filter===p ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>{p}</button>
        ))}
      </div>

      {/* Summary */}
      <div className="px-4 pb-2 grid grid-cols-2 gap-2">
        <StatCard label="Transactions" value={filtered.filter(h=>h.status!=='Refunded').length} />
        <StatCard label="Total Revenue" value={fmt(totRev).replace(' so\'m','')} sub="so'm" />
        <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 col-span-2">
          <p className="text-xs text-gray-400 mb-1.5">By Payment Method</p>
          <div className="flex gap-3 text-xs">
            <span className="flex items-center gap-1 text-gray-600"><Banknote size={12}/>{fmt(byCash)}</span>
            <span className="flex items-center gap-1 text-gray-600"><CreditCard size={12}/>{fmt(byCard)}</span>
            <span className="flex items-center gap-1 text-gray-600"><QrCode size={12}/>{fmt(byQr)}</span>
          </div>
          <p className="text-xs text-gray-400 mt-1.5">Total discounts: <span className="text-orange-600 font-medium">{fmt(totDisc)}</span></p>
        </div>
      </div>

      {/* Transactions */}
      <div className="px-4 space-y-2 pb-6">
        {filtered.map(tx => {
          const Icon = METHOD_ICONS[tx.method] || Banknote;
          return (
            <div key={tx.id} className="bg-white rounded-xl p-3 border border-gray-100">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-gray-50 rounded-xl flex items-center justify-center"><Icon size={15} className="text-gray-500"/></div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">#{tx.id}</p>
                    <p className="text-xs text-gray-400">{tx.table}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-gray-900">{fmt(tx.amount)}</p>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${tx.status==='Refunded' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700'}`}>{tx.status}</span>
                </div>
              </div>
              <div className="flex justify-between items-center mt-2 text-xs text-gray-400">
                <span>{dateStr(new Date(tx.paidAt))} {timeStr(new Date(tx.paidAt))}</span>
                {tx.discount > 0 && <span className="text-orange-500">−{fmt(tx.discount)} disc</span>}
                {tx.status !== 'Refunded' && (
                  <button onClick={() => setRefundTarget(tx)} className="text-red-500 font-semibold flex items-center gap-0.5"><RefreshCw size={11}/>Refund</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <RefundSheet open={!!refundTarget} onClose={() => setRefundTarget(null)} tx={refundTarget} onConfirm={handleRefund} />
    </div>
  );
}

// ── Profile Tab ───────────────────────────────────────────────────────────────
function ProfileTab({ shiftStart, history, onSignOut, showToast }) {
  const [showPwSheet, setShowPwSheet] = useState(false);
  const [showEndShift, setShowEndShift] = useState(false);
  const [curPw, setCurPw] = useState(''); const [newPw, setNewPw] = useState(''); const [confPw, setConfPw] = useState('');

  const todayTx = history.filter(h => new Date(h.paidAt).toDateString()===new Date().toDateString() && h.status!=='Refunded');
  const todayRev = todayTx.reduce((s,h)=>s+h.amount,0);
  const avgOrder = todayTx.length ? Math.round(todayRev/todayTx.length) : 0;
  const shiftMins = shiftStart ? Math.floor((Date.now()-new Date(shiftStart))/60000) : 0;
  const shiftHrs = `${Math.floor(shiftMins/60)}h ${shiftMins%60}m`;

  const changePw = () => { if (newPw===confPw && newPw.length>=4) { showToast('Password updated'); setShowPwSheet(false); setCurPw(''); setNewPw(''); setConfPw(''); } };

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 pb-8">
      {/* Identity */}
      <div className="bg-white rounded-2xl p-4 flex items-center gap-4">
        <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center"><User size={26} className="text-blue-600"/></div>
        <div>
          <p className="font-bold text-gray-900 text-base">{CASHIER.name}</p>
          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">{CASHIER.role}</span>
          <div className="flex items-center gap-1 mt-1"><Phone size={11} className="text-gray-400"/><span className="text-xs text-gray-400">{CASHIER.phone}</span></div>
          <div className="flex items-center gap-1 mt-0.5"><Timer size={11} className="text-gray-400"/><span className="text-xs text-gray-400">{CASHIER.shiftStart} – {CASHIER.shiftEnd}</span></div>
        </div>
      </div>

      {/* Today Stats */}
      <div className="grid grid-cols-3 gap-2">
        <StatCard label="Orders" value={todayTx.length} />
        <StatCard label="Revenue" value={String(Math.round(todayRev/1000))+'K'} sub="so'm" />
        <StatCard label="Avg Order" value={String(Math.round(avgOrder/1000))+'K'} sub="so'm" />
      </div>

      {/* Shift Duration */}
      {shiftStart && (
        <div className="bg-white rounded-xl p-3 flex items-center justify-between border border-gray-100">
          <div className="flex items-center gap-2"><Timer size={16} className="text-blue-500"/><span className="text-sm text-gray-700">Shift duration</span></div>
          <span className="text-sm font-bold text-gray-900">{shiftHrs}</span>
        </div>
      )}

      {/* Change Password */}
      <button onClick={() => setShowPwSheet(true)} className="w-full bg-white border border-gray-200 py-3.5 rounded-xl flex items-center gap-3 px-4">
        <Lock size={16} className="text-gray-500"/>
        <span className="text-sm font-medium text-gray-800">Change Password</span>
        <ChevronDown size={14} className="text-gray-400 ml-auto -rotate-90"/>
      </button>

      {/* End Shift */}
      <button onClick={() => setShowEndShift(true)} className="w-full bg-orange-50 border border-orange-200 text-orange-700 py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2">
        <Timer size={15}/>End Shift
      </button>

      {/* Sign Out */}
      <button onClick={onSignOut} className="w-full border-2 border-red-500 text-red-600 py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2">
        <LogOut size={16}/>Sign Out
      </button>

      {/* Change Password Sheet */}
      <BottomSheet open={showPwSheet} onClose={() => setShowPwSheet(false)} title="Change Password">
        <div className="p-4 space-y-3">
          {[['Current Password',curPw,setCurPw],['New Password',newPw,setNewPw],['Confirm New Password',confPw,setConfPw]].map(([label,val,setter]) => (
            <div key={label}><label className="text-xs text-gray-500 block mb-1">{label}</label>
              <input type="password" value={val} onChange={e=>setter(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none" /></div>
          ))}
          <button onClick={changePw} className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-semibold text-sm">Update Password</button>
        </div>
      </BottomSheet>

      {/* End Shift Sheet */}
      <BottomSheet open={showEndShift} onClose={() => setShowEndShift(false)} title="End Shift Summary">
        <div className="p-4 space-y-3">
          <div className="bg-gray-50 rounded-xl p-3 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Duration</span><span className="font-semibold">{shiftHrs}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Orders processed</span><span className="font-semibold">{todayTx.length}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Total revenue</span><span className="font-semibold">{fmt(todayRev)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Average order</span><span className="font-semibold">{fmt(avgOrder)}</span></div>
          </div>
          <button onClick={() => { setShowEndShift(false); showToast('Shift ended. Goodbye!'); }} className="w-full bg-orange-600 text-white py-3.5 rounded-xl font-semibold text-sm">Confirm End Shift</button>
        </div>
      </BottomSheet>
    </div>
  );
}
// ── Main App ──────────────────────────────────────────────────────────────────
export default function CashierApp() {
  const [shiftStarted, setShiftStarted] = useState(false);
  const [shiftStartTime, setShiftStartTime] = useState(null);
  const [activeTab, setActiveTab] = useState('orders');
  const [orders, setOrders] = useState(INIT_ORDERS);
  const [history, setHistory] = useState(INIT_HISTORY);
  const [toast, setToast] = useState(null);
  const [receiptData, setReceiptData] = useState(null);
  const [loggedOut, setLoggedOut] = useState(false);

  const showToast = (msg) => { setToast(msg); };

  const handlePay = (order, payment) => {
    // Move order to history
    const sub = order.items.reduce((s, x) => s + x.price * x.qty, 0) - (payment.discount || 0);
    const tax = Math.round(sub * TAX_RATE);
    const svc = Math.round(sub * SERVICE_RATE);
    const total = sub + tax + svc;

    const newTx = {
      id: 9000 + Math.floor(Math.random() * 999),
      table: order.table,
      method: payment.method,
      cashier: CASHIER.name,
      amount: total,
      discount: payment.discount || 0,
      refunded: false,
      paidAt: new Date().toISOString(),
      status: 'Paid',
    };
    setHistory(h => [newTx, ...h]);
    setOrders(o => o.filter(x => x.id !== order.id));
    setReceiptData({ order, payment: { ...payment, total } });
    showToast('Payment confirmed! Admin notified.');
  };

  const TABS = [
    { id: 'orders', label: 'Orders', icon: ShoppingBag },
    { id: 'payments', label: 'Payments', icon: CreditCard },
    { id: 'history', label: 'History', icon: History },
    { id: 'profile', label: 'Profile', icon: User },
  ];

  if (loggedOut) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center space-y-2">
          <LogOut size={32} className="text-gray-400 mx-auto" />
          <p className="text-gray-500 font-medium">Signed out</p>
          <button onClick={() => { setLoggedOut(false); setShiftStarted(false); }} className="text-blue-600 text-sm font-semibold underline">Sign in again</button>
        </div>
      </div>
    );
  }

  if (!shiftStarted) {
    return <StartShiftModal onStart={() => { setShiftStarted(true); setShiftStartTime(new Date().toISOString()); }} />;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col" style={{ maxWidth: 430, margin: '0 auto', position: 'relative' }}>
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-400">Panel</p>
          <p className="font-bold text-gray-900 text-base">Cashier</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-xs font-semibold text-gray-800">{CASHIER.name}</p>
            <p className="text-xs text-gray-400">{CASHIER.shiftStart}–{CASHIER.shiftEnd}</p>
          </div>
          <button onClick={() => setLoggedOut(true)} className="p-2 bg-gray-50 rounded-xl">
            <LogOut size={18} className="text-gray-500" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {activeTab === 'orders'   && <OrdersTab orders={orders} history={history} onPay={handlePay} showToast={showToast} />}
        {activeTab === 'payments' && <PaymentsTab showToast={showToast} />}
        {activeTab === 'history'  && <HistoryTab history={history} setHistory={setHistory} showToast={showToast} />}
        {activeTab === 'profile'  && <ProfileTab shiftStart={shiftStartTime} history={history} showToast={showToast} onSignOut={() => setLoggedOut(true)} />}
      </div>

      {/* Bottom Nav */}
      <div className="bg-white border-t border-gray-100 flex" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setActiveTab(id)} className={`flex-1 flex flex-col items-center py-2.5 gap-1 min-h-[56px] ${activeTab===id ? 'text-blue-600' : 'text-gray-400'}`}>
            <Icon size={20} />
            <span className="text-[10px] font-semibold">{label}</span>
          </button>
        ))}
      </div>

      {/* Toast */}
      {toast && <Toast msg={toast} onDone={() => setToast(null)} />}

      {/* Receipt */}
      <ReceiptSheet
        open={!!receiptData}
        onClose={() => setReceiptData(null)}
        order={receiptData?.order}
        payment={receiptData?.payment}
        onPrint={() => { setReceiptData(null); showToast('Receipt sent to printer'); }}
      />
    </div>
  );
}

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Pencil, Trash2, X, Plus, Minus, ChevronDown, Search, AlertTriangle,
} from "lucide-react";

// ─── Constants ───────────────────────────────────────────────────────────────
const TABLES   = ["Table 1","Table 2","Table 3","Table 4","Table 5","Table 6","VIP Room"];
const WAITRESSES = ["Sarah","Maria","Jessica","Anna","Kate"];
const PAYMENT_METHODS = ["Cash","Card","QR"];
const DELETE_REASONS  = ["Duplicate Entry","Wrong Table","Test Order","Other"];

const MENU_ITEMS = [
  { id:101, name:"Shashlik",    price:35000 },
  { id:102, name:"Lagman",      price:25000 },
  { id:103, name:"Plov",        price:30000 },
  { id:104, name:"Samsa",       price:12000 },
  { id:105, name:"Manti",       price:28000 },
  { id:106, name:"Naryn",       price:22000 },
  { id:107, name:"Cola",        price: 8000 },
  { id:108, name:"Tea",         price: 5000 },
  { id:109, name:"Water",       price: 4000 },
  { id:110, name:"Fresh Juice", price:15000 },
  { id:111, name:"Bread",       price: 3000 },
  { id:112, name:"Salad",       price:18000 },
];

const SEED_ORDERS = [
  {
    id:"0001", table:"Table 1", waitress:"Sarah", guests:3,
    status:"Preparing", isPaid:false, notes:"No spicy food", time:"12:30",
    paymentMethod:null,
    items:[
      {id:101,name:"Shashlik",   price:35000,quantity:2},
      {id:102,name:"Lagman",     price:25000,quantity:1},
      {id:107,name:"Cola",       price: 8000,quantity:2},
    ],
  },
  {
    id:"0002", table:"Table 3", waitress:"Maria", guests:2,
    status:"Ready", isPaid:false, notes:"", time:"12:45",
    paymentMethod:null,
    items:[
      {id:103,name:"Plov", price:30000,quantity:2},
      {id:108,name:"Tea",  price: 5000,quantity:2},
    ],
  },
  {
    id:"0003", table:"Table 5", waitress:"Jessica", guests:4,
    status:"Pending", isPaid:false, notes:"Birthday table", time:"13:00",
    paymentMethod:null,
    items:[
      {id:101,name:"Shashlik",    price:35000,quantity:4},
      {id:104,name:"Samsa",       price:12000,quantity:8},
      {id:110,name:"Fresh Juice", price:15000,quantity:4},
    ],
  },
  {
    id:"0004", table:"Table 2", waitress:"Anna", guests:2,
    status:"Paid", isPaid:true, notes:"Regular customer", time:"11:30",
    paymentMethod:"Cash",
    items:[
      {id:102,name:"Lagman", price:25000,quantity:2},
      {id:108,name:"Tea",    price: 5000,quantity:2},
    ],
  },
  {
    id:"0005", table:"VIP Room", waitress:"Kate", guests:6,
    status:"Paid", isPaid:true, notes:"", time:"11:00",
    paymentMethod:"Card",
    items:[
      {id:101,name:"Shashlik",    price:35000,quantity:3},
      {id:105,name:"Manti",       price:28000,quantity:2},
      {id:106,name:"Naryn",       price:22000,quantity:1},
      {id:110,name:"Fresh Juice", price:15000,quantity:6},
    ],
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt   = (n) => new Intl.NumberFormat("uz-UZ").format(n) + " so'm";
const calcTotal = (items) => items.reduce((s,i) => s + i.price * i.quantity, 0);
const clone = (o) => JSON.parse(JSON.stringify(o));

function statusStyle(s) {
  return ({
    Preparing:"bg-orange-100 text-orange-700",
    Ready:    "bg-green-100 text-green-700",
    Pending:  "bg-blue-100 text-blue-600",
    Paid:     "bg-gray-100 text-gray-500",
  })[s] ?? "bg-gray-100 text-gray-500";
}

// ─── SelectField ─────────────────────────────────────────────────────────────
function SelectField({ label, value, options, onChange }) {
  return (
    <div className="mb-3">
      <p className="text-sm font-medium text-gray-600 mb-1.5">{label}</p>
      <div className="relative bg-gray-50 rounded-2xl">
        <select
          value={value ?? ""}
          onChange={e => onChange(e.target.value)}
          style={{ minHeight:48 }}
          className="w-full bg-transparent px-4 py-3 text-sm font-medium text-gray-800 outline-none appearance-none pr-10"
        >
          <option value="">Select {label}</option>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
      </div>
    </div>
  );
}

// ─── BottomSheet ─────────────────────────────────────────────────────────────
function BottomSheet({ children, onClose }) {
  const [show, setShow]           = useState(false);
  const [dragY, setDragY]         = useState(0);
  const [isDragging, setDragging] = useState(false);
  const startY = useRef(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => setShow(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const dismiss = useCallback(() => {
    setShow(false);
    setTimeout(onClose, 300);
  }, [onClose]);

  const handleStart = (e) => { startY.current = e.touches[0].clientY; setDragging(true); };
  const handleMove  = (e) => { const dy = e.touches[0].clientY - startY.current; if (dy > 0) setDragY(dy); };
  const handleEnd   = ()  => { setDragging(false); if (dragY > 80) dismiss(); else setDragY(0); startY.current = null; };

  const transition = isDragging ? "none" : "transform 0.32s cubic-bezier(0.34,1.56,0.64,1)";

  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end">
      <div
        className="absolute inset-0 bg-black"
        style={{ opacity: show ? 0.45 : 0, transition:"opacity 0.28s" }}
        onClick={dismiss}
      />
      <div
        className="relative z-10 bg-white rounded-t-3xl shadow-2xl"
        style={{ transform:`translateY(${show ? dragY : 400}px)`, transition }}
      >
        <div
          className="flex justify-center pt-3 pb-1"
          onTouchStart={handleStart} onTouchMove={handleMove} onTouchEnd={handleEnd}
        >
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── SwipeableCard ────────────────────────────────────────────────────────────
const ACTION_W   = 132;
const SWIPE_THR  = 60;
const SPRING     = "transform 0.32s cubic-bezier(0.34,1.56,0.64,1)";

function SwipeableCard({ order, isSwiped, onSwipeOpen, onSwipeClose, onEdit, onDelete, onLongPress, isExiting }) {
  const [offsetX,   setOffsetX]  = useState(0);
  const [dragging,  setDragging] = useState(false);
  const startX   = useRef(null);
  const startY   = useRef(null);
  const lpTimer  = useRef(null);
  const isScroll = useRef(false);

  useEffect(() => { setOffsetX(isSwiped ? -ACTION_W : 0); }, [isSwiped]);

  const onStart = (e) => {
    startX.current   = e.touches[0].clientX;
    startY.current   = e.touches[0].clientY;
    isScroll.current = false;
    setDragging(true);
    lpTimer.current  = setTimeout(() => {
      setDragging(false);
      // reset swipe before long press
      setOffsetX(0);
      onSwipeClose();
      onLongPress();
    }, 500);
  };

  const onMove = (e) => {
    if (startX.current === null) return;
    const dx = e.touches[0].clientX - startX.current;
    const dy = Math.abs(e.touches[0].clientY - startY.current);

    if (dy > 8 && dy > Math.abs(dx)) {
      isScroll.current = true;
      clearTimeout(lpTimer.current);
      setDragging(false);
      setOffsetX(isSwiped ? -ACTION_W : 0);
      return;
    }
    if (Math.abs(dx) > 5) clearTimeout(lpTimer.current);

    if (isSwiped) {
      setOffsetX(Math.min(Math.max(-ACTION_W + dx, -ACTION_W), 0));
    } else if (dx < 0) {
      setOffsetX(Math.max(dx, -ACTION_W));
    }
  };

  const onEnd = () => {
    clearTimeout(lpTimer.current);
    setDragging(false);
    if (isScroll.current) return;

    if (!isSwiped && offsetX < -SWIPE_THR) {
      setOffsetX(-ACTION_W); onSwipeOpen();
    } else if (isSwiped && offsetX > -ACTION_W + SWIPE_THR) {
      setOffsetX(0); onSwipeClose();
    } else {
      setOffsetX(isSwiped ? -ACTION_W : 0);
    }
  };

  return (
    <div
      className="relative rounded-2xl overflow-hidden"
      style={{
        opacity:    isExiting ? 0 : 1,
        maxHeight:  isExiting ? 0  : 400,
        marginBottom: isExiting ? -12 : 0,
        transition: isExiting ? "opacity 0.25s, max-height 0.3s, margin 0.3s" : "none",
      }}
    >
      {/* Action buttons */}
      <div className="absolute right-0 top-0 bottom-0 flex" style={{ width:ACTION_W }}>
        <button
          onClick={onEdit}
          className="flex-1 bg-blue-500 flex flex-col items-center justify-center gap-1"
          style={{ minWidth:44 }}
        >
          <Pencil size={18} color="white" />
          <span className="text-white text-xs font-semibold">Edit</span>
        </button>
        <button
          onClick={onDelete}
          className="flex-1 bg-red-500 rounded-r-2xl flex flex-col items-center justify-center gap-1"
          style={{ minWidth:44 }}
        >
          <Trash2 size={18} color="white" />
          <span className="text-white text-xs font-semibold">Delete</span>
        </button>
      </div>

      {/* Card face */}
      <div
        className="bg-white rounded-2xl p-4 relative z-10 select-none"
        style={{ transform:`translateX(${offsetX}px)`, transition: dragging ? "none" : SPRING }}
        onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd}
      >
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-bold text-gray-900">#{order.id}</span>
              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${statusStyle(order.status)}`}>
                {order.status}
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-0.5">{order.table} · {order.waitress}</p>
          </div>
          <div className="text-right shrink-0 ml-3">
            <p className="text-base font-bold text-blue-600">{fmt(calcTotal(order.items))}</p>
            <p className="text-xs text-gray-400">{order.guests} guests · {order.time}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {order.items.map(it => (
            <span key={it.id} className="bg-gray-50 border border-gray-100 rounded-lg px-2.5 py-1 text-xs text-gray-600">
              {it.name} ×{it.quantity}
            </span>
          ))}
        </div>

        {order.notes ? <p className="text-xs text-gray-400 mt-2 italic">"{order.notes}"</p> : null}

        {order.isPaid && order.paymentMethod && (
          <div className="flex items-center gap-1.5 mt-2">
            <div className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
            <span className="text-xs text-gray-500">Paid via {order.paymentMethod}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── CurrentEditModal (full-screen slide-up) ──────────────────────────────────
function CurrentEditModal({ data, setData, onClose, onSave, showToast }) {
  const [show,      setShow]    = useState(false);
  const [dragY,     setDragY]   = useState(0);
  const [isDragging,setDrag]    = useState(false);
  const [search,    setSearch]  = useState("");
  const startY = useRef(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => setShow(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const dismiss = useCallback(() => {
    setShow(false);
    setTimeout(onClose, 320);
  }, [onClose]);

  const hStart = (e) => { startY.current = e.touches[0].clientY; setDrag(true); };
  const hMove  = (e) => { const dy = e.touches[0].clientY - startY.current; if (dy > 0) setDragY(dy); };
  const hEnd   = ()  => { setDrag(false); if (dragY > 80) dismiss(); else setDragY(0); startY.current = null; };

  const kitchenBusy = ["Preparing","Ready"].includes(data.status);
  const transition  = isDragging ? "none" : "transform 0.32s cubic-bezier(0.34,1.56,0.64,1)";

  const addItem = (mi) => {
    setData(prev => {
      const ex = prev.items.find(i => i.id === mi.id);
      if (ex) return { ...prev, items: prev.items.map(i => i.id===mi.id ? {...i, quantity:i.quantity+1} : i) };
      return { ...prev, items:[...prev.items, {...mi, quantity:1}] };
    });
  };
  const changeQty = (id, delta) => {
    setData(prev => ({
      ...prev,
      items: prev.items.map(i => i.id===id ? {...i, quantity: Math.max(1, i.quantity+delta)} : i),
    }));
  };
  const removeItem = (id) => {
    setData(prev => {
      if (prev.items.length <= 1) { showToast("At least 1 item required", "error"); return prev; }
      return { ...prev, items: prev.items.filter(i => i.id !== id) };
    });
  };

  const filtered = MENU_ITEMS.filter(m => m.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black"
        style={{ opacity: show ? 0.4 : 0, transition:"opacity 0.28s" }}
        onClick={dismiss}
      />
      <div
        className="absolute inset-0 bg-white flex flex-col"
        style={{ transform:`translateY(${show ? `${dragY}px` : "100%"})`, transition }}
      >
        {/* Drag handle */}
        <div
          className="flex justify-center pt-3 pb-1 shrink-0"
          onTouchStart={hStart} onTouchMove={hMove} onTouchEnd={hEnd}
        >
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        {/* Header */}
        <div className="px-4 py-3 flex items-center justify-between border-b border-gray-100 shrink-0">
          <button onClick={dismiss} className="w-11 h-11 flex items-center justify-center rounded-full bg-gray-100">
            <X size={20} className="text-gray-600" />
          </button>
          <h2 className="text-base font-bold text-gray-900">Edit Order #{data.id}</h2>
          <button
            onClick={onSave}
            className="bg-blue-500 text-white px-5 py-2.5 rounded-xl text-sm font-semibold"
            style={{ minHeight:44 }}
          >
            Save
          </button>
        </div>

        {/* Kitchen warning (non-dismissable) */}
        {kitchenBusy && (
          <div className="bg-orange-50 border-b border-orange-100 px-4 py-3 flex gap-2 items-start shrink-0">
            <AlertTriangle size={16} className="text-orange-500 mt-0.5 shrink-0" />
            <p className="text-xs text-orange-700">
              Kitchen is preparing this order. Item changes may cause confusion. Proceed carefully.
            </p>
          </div>
        )}

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">

          {/* Order Info */}
          <div className="px-4 pt-5">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Order Info</p>
            <SelectField label="Table"    value={data.table}    options={TABLES}    onChange={v => setData(p=>({...p,table:v}))} />
            <SelectField label="Waitress" value={data.waitress} options={WAITRESSES} onChange={v => setData(p=>({...p,waitress:v}))} />
            <div className="mb-4">
              <p className="text-sm font-medium text-gray-600 mb-1.5">Number of Guests</p>
              <div className="flex items-center gap-4 bg-gray-50 rounded-2xl px-4 py-3">
                <button onClick={() => setData(p=>({...p,guests:Math.max(1,p.guests-1)}))} className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center">
                  <Minus size={16} className="text-gray-600" />
                </button>
                <span className="flex-1 text-center text-base font-bold text-gray-900">{data.guests}</span>
                <button onClick={() => setData(p=>({...p,guests:p.guests+1}))} className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center">
                  <Plus size={16} className="text-gray-600" />
                </button>
              </div>
            </div>
          </div>

          {/* Order Items */}
          <div className="px-4 pt-1">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Order Items</p>
            <div className="flex flex-col gap-2">
              {data.items.map(it => (
                <div key={it.id} className="bg-gray-50 rounded-2xl px-4 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{it.name}</p>
                    <p className="text-xs text-blue-500 mt-0.5">{fmt(it.price)}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => changeQty(it.id,-1)} className="w-9 h-9 rounded-full bg-white shadow-sm flex items-center justify-center">
                      <Minus size={14} className="text-gray-600" />
                    </button>
                    <span className="w-5 text-center text-sm font-bold text-gray-800">{it.quantity}</span>
                    <button onClick={() => changeQty(it.id,1)} className="w-9 h-9 rounded-full bg-white shadow-sm flex items-center justify-center">
                      <Plus size={14} className="text-gray-600" />
                    </button>
                    <button onClick={() => removeItem(it.id)} className="w-9 h-9 rounded-full bg-red-50 flex items-center justify-center ml-1">
                      <X size={14} className="text-red-500" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Add Items */}
          <div className="px-4 pt-5">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Add Items</p>
            <div className="flex items-center gap-2 bg-gray-50 rounded-2xl px-4 py-3 mb-3">
              <Search size={15} className="text-gray-400 shrink-0" />
              <input
                type="text"
                placeholder="Search menu…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="flex-1 bg-transparent text-sm outline-none text-gray-700 placeholder-gray-400"
              />
            </div>
            <div className="flex flex-col gap-2">
              {filtered.map(mi => (
                <button
                  key={mi.id}
                  onClick={() => addItem(mi)}
                  className="flex items-center justify-between bg-white border border-gray-100 rounded-2xl px-4 py-3"
                  style={{ minHeight:52 }}
                >
                  <div className="text-left">
                    <p className="text-sm font-medium text-gray-800">{mi.name}</p>
                    <p className="text-xs text-blue-500">{fmt(mi.price)}</p>
                  </div>
                  <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center">
                    <Plus size={16} className="text-blue-500" />
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="px-4 pt-5">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Notes</p>
            <textarea
              value={data.notes}
              onChange={e => setData(p=>({...p,notes:e.target.value}))}
              placeholder="Special instructions…"
              rows={3}
              className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm text-gray-700 outline-none resize-none placeholder-gray-400"
            />
          </div>

          {/* Live total */}
          <div className="mx-4 mt-5 mb-8 bg-blue-50 rounded-2xl px-4 py-4 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700">Order Total</span>
            <span className="text-lg font-bold text-blue-600">{fmt(calcTotal(data.items))}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── PaidEditModal (bottom sheet) ────────────────────────────────────────────
function PaidEditModal({ data, setData, onClose, onSave }) {
  return (
    <BottomSheet onClose={onClose}>
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-gray-100">
        <button onClick={onClose} className="w-11 h-11 flex items-center justify-center rounded-full bg-gray-100">
          <X size={20} className="text-gray-600" />
        </button>
        <h2 className="text-base font-bold text-gray-900">Edit Paid Order #{data.id}</h2>
        <button
          onClick={onSave}
          className="bg-blue-500 text-white px-5 py-2.5 rounded-xl text-sm font-semibold"
          style={{ minHeight:44 }}
        >
          Save
        </button>
      </div>

      {/* Warning */}
      <div className="bg-orange-50 border-b border-orange-100 px-4 py-3 flex gap-2 items-start">
        <AlertTriangle size={16} className="text-orange-500 mt-0.5 shrink-0" />
        <p className="text-xs text-orange-700">
          This order is paid. Only administrative details can be changed.
        </p>
      </div>

      {/* Scrollable content */}
      <div className="overflow-y-auto px-4 py-4" style={{ maxHeight:"65vh" }}>
        <SelectField label="Payment Method"    value={data.paymentMethod} options={PAYMENT_METHODS} onChange={v => setData(p=>({...p,paymentMethod:v}))} />
        <SelectField label="Assigned Waitress" value={data.waitress}      options={WAITRESSES}       onChange={v => setData(p=>({...p,waitress:v}))} />
        <SelectField label="Table"             value={data.table}         options={TABLES}           onChange={v => setData(p=>({...p,table:v}))} />

        <div className="mb-4">
          <p className="text-sm font-medium text-gray-600 mb-1.5">Internal Notes</p>
          <textarea
            value={data.notes}
            onChange={e => setData(p=>({...p,notes:e.target.value}))}
            placeholder="Internal notes…"
            rows={2}
            className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm text-gray-700 outline-none resize-none placeholder-gray-400"
          />
        </div>

        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Order Items (Read-only)</p>
        <div className="flex flex-col gap-2 mb-4">
          {data.items.map(it => (
            <div key={it.id} className="bg-gray-50 rounded-2xl px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{it.name}</p>
                <p className="text-xs text-gray-400">×{it.quantity}</p>
              </div>
              <p className="text-sm font-semibold text-gray-600">{fmt(it.price * it.quantity)}</p>
            </div>
          ))}
        </div>

        <div className="bg-blue-50 rounded-2xl px-4 py-4 flex items-center justify-between mb-4">
          <span className="text-sm font-semibold text-gray-700">Total</span>
          <span className="text-lg font-bold text-blue-600">{fmt(calcTotal(data.items))}</span>
        </div>
      </div>
    </BottomSheet>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function RestaurantOrders() {
  const [orders,      setOrders]      = useState(SEED_ORDERS);
  const [tab,         setTab]         = useState("current");
  const [swipedId,    setSwipedId]    = useState(null);
  const [actionSheet, setActionSheet] = useState(null);   // { orderId }
  const [deleteConf,  setDeleteConf]  = useState(null);   // { orderId }
  const [delReason,   setDelReason]   = useState("");
  const [delOther,    setDelOther]    = useState("");
  const [editModal,   setEditModal]   = useState(null);   // { orderId }
  const [editData,    setEditData]    = useState(null);
  const [toasts,      setToasts]      = useState([]);
  const [exiting,     setExiting]     = useState({});

  const current = orders.filter(o => !o.isPaid);
  const paid    = orders.filter(o =>  o.isPaid);

  // ── Toasts ──
  const showToast = useCallback((message, type="success") => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  }, []);

  // ── Open Edit ──
  const openEdit = (orderId) => {
    setEditData(clone(orders.find(o => o.id === orderId)));
    setEditModal({ orderId });
    setActionSheet(null);
    setSwipedId(null);
  };

  // ── Open Delete ──
  const openDelete = (orderId) => {
    setDeleteConf({ orderId });
    setDelReason("");
    setDelOther("");
    setActionSheet(null);
    setSwipedId(null);
  };

  // ── Confirm Delete ──
  const confirmDelete = () => {
    const order = orders.find(o => o.id === deleteConf.orderId);
    if (order.isPaid && !delReason) return;

    setExiting(prev => ({ ...prev, [deleteConf.orderId]: true }));
    setTimeout(() => {
      setOrders(prev => prev.filter(o => o.id !== deleteConf.orderId));
      setExiting(prev => { const n={...prev}; delete n[deleteConf.orderId]; return n; });
    }, 320);

    showToast(`Order #${deleteConf.orderId} deleted successfully`, "success");
    setDeleteConf(null);
  };

  // ── Save Edit ──
  const saveEdit = () => {
    if (!editData) return;

    if (!editData.isPaid) {
      if (editData.items.length === 0) { showToast("At least 1 item required", "error"); return; }
      if (!editData.table || !editData.waitress) { showToast("Select table and waitress", "error"); return; }
    }

    setOrders(prev => prev.map(o => o.id === editData.id ? { ...editData } : o));
    showToast(`Order #${editData.id} updated`, "success");
    setEditModal(null);
    setEditData(null);
  };

  // ── Toast colours ──
  const toastBg = { success:"bg-green-500", warning:"bg-orange-500", error:"bg-red-500" };

  const deleteOrder = deleteConf ? orders.find(o => o.id === deleteConf.orderId) : null;

  return (
    <div className="min-h-screen bg-gray-100 max-w-md mx-auto relative">

      {/* ── Toast Rack ── */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-md z-50 px-4 pt-4 flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`${toastBg[t.type] ?? "bg-gray-700"} text-white text-sm font-semibold px-4 py-3 rounded-2xl shadow-lg`}
            style={{ animation:"slideDown 0.25s ease" }}
          >
            {t.message}
          </div>
        ))}
      </div>

      {/* ── Header ── */}
      <div className="bg-white px-4 pt-12 pb-4 shadow-sm">
        <h1 className="text-xl font-bold text-gray-900">Restaurant Orders</h1>
        <div className="flex gap-2 mt-3">
          {[["current",`Current (${current.length})`],["paid",`Paid (${paid.length})`]].map(([key,label]) => (
            <button
              key={key}
              onClick={() => { setTab(key); setSwipedId(null); }}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                tab===key ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-600"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Order List ── */}
      <div className="px-4 py-4 flex flex-col gap-3 pb-24">
        {(tab==="current" ? current : paid).map(order => (
          <SwipeableCard
            key={order.id}
            order={order}
            isSwiped={swipedId === order.id}
            onSwipeOpen={() => setSwipedId(order.id)}
            onSwipeClose={() => setSwipedId(null)}
            onEdit={() => openEdit(order.id)}
            onDelete={() => openDelete(order.id)}
            onLongPress={() => setActionSheet({ orderId: order.id })}
            isExiting={!!exiting[order.id]}
          />
        ))}
        {(tab==="current" ? current : paid).length === 0 && (
          <div className="text-center py-16 text-gray-400 text-sm">No {tab} orders</div>
        )}
      </div>

      {/* ── Action Sheet ── */}
      {actionSheet && (
        <BottomSheet onClose={() => setActionSheet(null)}>
          <div className="px-4 pb-8">
            <p className="text-center text-xs text-gray-400 mb-4">
              Order #{actionSheet.orderId}
            </p>
            <button
              onClick={() => openEdit(actionSheet.orderId)}
              className="w-full flex items-center gap-3 py-4 border-b border-gray-100"
              style={{ minHeight:60 }}
            >
              <div className="w-11 h-11 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                <Pencil size={18} className="text-blue-500" />
              </div>
              <span className="text-base font-medium text-gray-800">Edit Order</span>
            </button>
            <button
              onClick={() => openDelete(actionSheet.orderId)}
              className="w-full flex items-center gap-3 py-4 border-b border-gray-100"
              style={{ minHeight:60 }}
            >
              <div className="w-11 h-11 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                <Trash2 size={18} className="text-red-500" />
              </div>
              <span className="text-base font-medium text-red-600">Delete Order</span>
            </button>
            <button
              onClick={() => setActionSheet(null)}
              className="w-full py-4 text-center text-base font-semibold text-blue-500"
              style={{ minHeight:56 }}
            >
              Cancel
            </button>
          </div>
        </BottomSheet>
      )}

      {/* ── Delete Confirmation ── */}
      {deleteConf && deleteOrder && (
        <BottomSheet onClose={() => setDeleteConf(null)}>
          <div className="px-4 pb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">Delete Order</h3>
              <button onClick={() => setDeleteConf(null)} className="w-9 h-9 flex items-center justify-center">
                <X size={20} className="text-gray-400" />
              </button>
            </div>

            {/* Summary */}
            <div className="bg-gray-50 rounded-2xl p-4 mb-4">
              {[["Order",  `#${deleteOrder.id}`],
                ["Table",  deleteOrder.table],
                ["Total",  fmt(calcTotal(deleteOrder.items))]].map(([k,v]) => (
                <div key={k} className="flex justify-between text-sm mb-1 last:mb-0">
                  <span className="text-gray-500">{k}</span>
                  <span className={`font-semibold ${k==="Total" ? "text-blue-600" : "text-gray-800"}`}>{v}</span>
                </div>
              ))}
            </div>

            {/* Paid orders need a reason */}
            {deleteOrder.isPaid && (
              <div className="mb-4">
                <p className="text-sm font-semibold text-gray-700 mb-2">Reason for deletion <span className="text-red-500">*</span></p>
                <div className="flex flex-col gap-2">
                  {DELETE_REASONS.map(r => (
                    <button
                      key={r}
                      onClick={() => setDelReason(r)}
                      className={`flex items-center gap-3 py-3 px-4 rounded-xl border text-sm font-medium transition-colors ${
                        delReason===r ? "border-red-400 bg-red-50 text-red-700" : "border-gray-200 bg-white text-gray-700"
                      }`}
                      style={{ minHeight:48 }}
                    >
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                        delReason===r ? "border-red-500 bg-red-500" : "border-gray-300"
                      }`}>
                        {delReason===r && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                      {r}
                    </button>
                  ))}
                  {delReason==="Other" && (
                    <input
                      type="text"
                      placeholder="Describe the reason…"
                      value={delOther}
                      onChange={e => setDelOther(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-blue-400"
                    />
                  )}
                </div>
              </div>
            )}

            <div className="flex gap-3 mt-2">
              <button
                onClick={() => setDeleteConf(null)}
                className="flex-1 py-3.5 rounded-2xl bg-gray-100 text-gray-700 font-semibold text-sm"
                style={{ minHeight:52 }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleteOrder.isPaid && !delReason}
                className="flex-1 py-3.5 rounded-2xl bg-red-500 text-white font-semibold text-sm disabled:opacity-40"
                style={{ minHeight:52 }}
              >
                Delete
              </button>
            </div>
          </div>
        </BottomSheet>
      )}

      {/* ── Edit Modals ── */}
      {editModal && editData && (
        editData.isPaid
          ? <PaidEditModal    data={editData} setData={setEditData} onClose={() => { setEditModal(null); setEditData(null); }} onSave={saveEdit} />
          : <CurrentEditModal data={editData} setData={setEditData} onClose={() => { setEditModal(null); setEditData(null); }} onSave={saveEdit} showToast={showToast} />
      )}

      {/* Slide-down keyframe for toasts */}
      <style>{`@keyframes slideDown { from { opacity:0; transform:translateY(-12px) } to { opacity:1; transform:translateY(0) } }`}</style>
    </div>
  );
}

import { useState, useRef } from "react";
import {
  User, Lock, Bell, Settings, ChevronRight, LogOut,
  Phone, Mail, Store, Camera, Edit3, Eye, EyeOff, Check, X,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────
function fmtDate(iso) {
  try { return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); }
  catch (_) { return "—"; }
}
function fmtDateTime(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) +
           " · " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch (_) { return "—"; }
}

// ─── Toast ────────────────────────────────────────────────────
function Toast({ msg, visible }) {
  return (
    <div
      style={{
        position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)",
        zIndex: 9999, transition: "opacity 0.25s",
        opacity: visible ? 1 : 0, pointerEvents: "none",
      }}
    >
      <div style={{
        background: "#16a34a", color: "#fff", padding: "8px 18px", borderRadius: 99,
        fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6,
        boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
      }}>
        <Check size={14} /> {msg}
      </div>
    </div>
  );
}

// ─── Toggle Switch ────────────────────────────────────────────
function Toggle({ on, onToggle }) {
  return (
    <button
      onClick={onToggle}
      style={{
        width: 48, height: 26, borderRadius: 99,
        background: on ? "#2563eb" : "#e2e8f0",
        border: "none", cursor: "pointer", position: "relative",
        transition: "background 0.2s", flexShrink: 0,
      }}
    >
      <span style={{
        position: "absolute", top: 3, left: on ? 25 : 3,
        width: 20, height: 20, borderRadius: "50%", background: "#fff",
        boxShadow: "0 1px 4px rgba(0,0,0,0.2)", transition: "left 0.2s",
      }} />
    </button>
  );
}

// ─── Section Header ───────────────────────────────────────────
function SectionHeader({ title }) {
  return (
    <div style={{ padding: "20px 20px 6px" }}>
      <span style={{ fontSize: 11, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1.2 }}>
        {title}
      </span>
    </div>
  );
}

// ─── Card wrapper ─────────────────────────────────────────────
function Card({ children, style }) {
  return (
    <div style={{
      background: "#fff", borderRadius: 18, margin: "0 16px 4px",
      overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
      ...style,
    }}>
      {children}
    </div>
  );
}

// ─── Info Row (tappable) ──────────────────────────────────────
function InfoRow({ iconBg = "#eff6ff", iconColor = "#2563eb", icon: Icon, label, value, onPress, readOnly }) {
  const [pressed, setPressed] = useState(false);
  return (
    <button
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      onClick={readOnly ? undefined : onPress}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        width: "100%", padding: "13px 16px", textAlign: "left",
        borderBottom: "1px solid #f8fafc", background: pressed && !readOnly ? "#f8fafc" : "#fff",
        cursor: readOnly ? "default" : "pointer", border: "none", minHeight: 56,
        borderBottomColor: "#f1f5f9", transition: "background 0.1s",
      }}
    >
      <div style={{
        width: 34, height: 34, borderRadius: 10, background: iconBg,
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        <Icon size={16} style={{ color: iconColor }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 700, marginBottom: 2, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value || "—"}</div>
      </div>
      {!readOnly && <ChevronRight size={16} style={{ color: "#cbd5e1", flexShrink: 0 }} />}
    </button>
  );
}

// ─── Toggle Row ───────────────────────────────────────────────
function ToggleRow({ iconBg = "#eff6ff", iconColor = "#2563eb", icon: Icon, label, on, onToggle }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "13px 16px", borderBottom: "1px solid #f1f5f9", minHeight: 56,
    }}>
      <div style={{
        width: 34, height: 34, borderRadius: 10, background: iconBg,
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        <Icon size={16} style={{ color: iconColor }} />
      </div>
      <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "#0f172a" }}>{label}</div>
      <Toggle on={on} onToggle={onToggle} />
    </div>
  );
}

// ─── Tappable Row ─────────────────────────────────────────────
function TapRow({ iconBg = "#fff7ed", iconColor = "#f97316", icon: Icon, label, sub, onPress }) {
  const [pressed, setPressed] = useState(false);
  return (
    <button
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      onClick={onPress}
      style={{
        display: "flex", alignItems: "center", gap: 12, width: "100%",
        padding: "13px 16px", textAlign: "left", border: "none",
        borderBottom: "1px solid #f1f5f9", background: pressed ? "#f8fafc" : "#fff",
        cursor: "pointer", minHeight: 56, transition: "background 0.1s",
      }}
    >
      <div style={{
        width: 34, height: 34, borderRadius: 10, background: iconBg,
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        <Icon size={16} style={{ color: iconColor }} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>{label}</div>
        {sub && <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 1 }}>{sub}</div>}
      </div>
      <ChevronRight size={16} style={{ color: "#cbd5e1", flexShrink: 0 }} />
    </button>
  );
}

// ─── Bottom Sheet ─────────────────────────────────────────────
function BottomSheet({ visible, onClose, title, children }) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      display: visible ? "flex" : "none", alignItems: "flex-end",
    }}>
      <div
        onClick={onClose}
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }}
      />
      <div style={{
        position: "relative", width: "100%", maxWidth: 430, margin: "0 auto",
        background: "#fff", borderRadius: "24px 24px 0 0",
        maxHeight: "88vh", overflowY: "auto",
        boxShadow: "0 -4px 32px rgba(0,0,0,0.15)",
      }}>
        <div style={{ width: 40, height: 4, background: "#e2e8f0", borderRadius: 99, margin: "12px auto 4px" }} />
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 20px 14px", borderBottom: "1px solid #f1f5f9",
        }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: "#0f172a" }}>{title}</span>
          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: "50%", background: "#f1f5f9",
              border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <X size={14} style={{ color: "#64748b" }} />
          </button>
        </div>
        <div style={{ padding: "20px 20px 36px" }}>{children}</div>
      </div>
    </div>
  );
}

// ─── Field ────────────────────────────────────────────────────
function Field({ label, value, onChange, type = "text", placeholder = "" }) {
  const [show, setShow] = useState(false);
  const isPass = type === "password";
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ position: "relative" }}>
        <input
          type={isPass && !show ? "password" : "text"}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={{
            width: "100%", boxSizing: "border-box",
            background: "#f8fafc", border: "1.5px solid #e2e8f0", borderRadius: 12,
            padding: isPass ? "12px 44px 12px 14px" : "12px 14px",
            fontSize: 14, color: "#0f172a", outline: "none",
          }}
          onFocus={e => { e.target.style.borderColor = "#2563eb"; e.target.style.background = "#fff"; }}
          onBlur={e => { e.target.style.borderColor = "#e2e8f0"; e.target.style.background = "#f8fafc"; }}
        />
        {isPass && (
          <button
            onClick={() => setShow(s => !s)}
            style={{
              position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
              background: "none", border: "none", cursor: "pointer", color: "#94a3b8",
              display: "flex", alignItems: "center",
            }}
          >
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
      </div>
    </div>
  );
}

function SaveBtn({ label = "Save Changes", onClick, danger }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%", background: danger ? "#dc2626" : "#2563eb", color: "#fff",
        border: "none", borderRadius: 14, padding: "15px 0",
        fontSize: 14, fontWeight: 800, cursor: "pointer", marginTop: 8,
      }}
    >
      {label}
    </button>
  );
}

function ErrMsg({ msg }) {
  if (!msg) return null;
  return <div style={{ color: "#dc2626", fontSize: 12, fontWeight: 600, marginBottom: 10 }}>⚠ {msg}</div>;
}

// ─── Bottom Nav ───────────────────────────────────────────────
const NAV = [
  { id: "H", label: "Home" },
  { id: "T", label: "Tables" },
  { id: "M", label: "Menu" },
  { id: "I", label: "Items" },
  { id: "O", label: "Orders" },
  { id: "S", label: "Staff" },
  { id: "P", label: "Profile" },
];

// ─── Avatar Colors ────────────────────────────────────────────
const AVATAR_COLORS = ["#2563eb", "#7c3aed", "#dc2626", "#059669", "#d97706", "#0891b2", "#db2777", "#0f172a"];

// ════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════
export default function AdminProfilePage() {
  // ── Profile
  const [profile, setProfile] = useState({
    name: "Alisher Nazarov",
    phone: "+998 90 000 00 01",
    email: "admin@thebill.uz",
    memberSince: "2025-10-01T08:00:00Z",
    lastLogin: new Date().toISOString(),
  });
  const [avatarColor, setAvatarColor] = useState("#2563eb");

  // ── Restaurant Settings
  const [rest, setRest] = useState({
    name: "The Bill Restaurant",
    currency: "so'm",
    language: "English",
    taxRate: "12",
    serviceCharge: "5",
    serviceChargeOn: true,
    receiptHeader: "Thank you for dining with us!",
  });

  // ── Notifications
  const [notifs, setNotifs] = useState({
    newOrder: true, lowStock: true, staffLate: false, payment: true, kitchenReady: true,
  });

  // ── App Settings
  const [appSet, setAppSet] = useState({ sound: true, vibration: true, autoLock: "5 min" });

  // ── Sheets
  const [sheet, setSheet] = useState(null);

  // ── Forms
  const [editForm, setEditForm] = useState({ name: "", phone: "", email: "" });
  const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" });
  const [pwError, setPwError] = useState("");
  const [restForm, setRestForm] = useState({ ...rest });

  // ── Toast
  const [toast, setToast] = useState({ msg: "", visible: false });
  const toastTimer = useRef(null);

  function showToast(msg = "Changes saved ✓") {
    clearTimeout(toastTimer.current);
    setToast({ msg, visible: true });
    toastTimer.current = setTimeout(() => setToast(t => ({ ...t, visible: false })), 2200);
  }

  const openSheet = s => setSheet(s);
  const closeSheet = () => setSheet(null);

  function openEditProfile() {
    setEditForm({ name: profile.name, phone: profile.phone, email: profile.email });
    openSheet("editProfile");
  }

  function saveProfile() {
    if (!editForm.name.trim()) return;
    setProfile(p => ({ ...p, ...editForm }));
    closeSheet();
    showToast();
  }

  function openChangePassword() {
    setPwForm({ current: "", next: "", confirm: "" });
    setPwError("");
    openSheet("changePassword");
  }

  function savePassword() {
    setPwError("");
    if (!pwForm.current) return setPwError("Enter current password");
    if (pwForm.next.length < 6) return setPwError("New password must be at least 6 characters");
    if (pwForm.next !== pwForm.confirm) return setPwError("Passwords do not match");
    setPwForm({ current: "", next: "", confirm: "" });
    closeSheet();
    showToast("Password changed");
  }

  function openEditRest() {
    setRestForm({ ...rest });
    openSheet("editRest");
  }

  function saveRest() {
    setRest({ ...restForm });
    closeSheet();
    showToast();
  }

  function toggleNotif(key) {
    setNotifs(n => ({ ...n, [key]: !n[key] }));
    showToast();
  }

  function toggleApp(key) {
    setAppSet(s => ({ ...s, [key]: !s[key] }));
    showToast();
  }

  const initials = profile.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div style={{ maxWidth: 430, margin: "0 auto", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", background: "#f1f5f9", minHeight: "100vh", position: "relative" }}>

      <Toast msg={toast.msg} visible={toast.visible} />

      {/* ── Scrollable body ── */}
      <div style={{ paddingBottom: 80, overflowY: "auto" }}>

        {/* ════ PROFILE HEADER ════ */}
        <div style={{ background: "linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)", padding: "56px 20px 32px", textAlign: "center" }}>
          {/* Avatar */}
          <div style={{ position: "relative", display: "inline-block", marginBottom: 12 }}>
            <button
              onClick={() => openSheet("colorPicker")}
              style={{
                width: 84, height: 84, borderRadius: "50%", background: avatarColor,
                border: "3px solid rgba(255,255,255,0.4)", display: "flex",
                alignItems: "center", justifyContent: "center", cursor: "pointer",
                boxShadow: "0 4px 20px rgba(0,0,0,0.2)", outline: "none",
              }}
            >
              <span style={{ fontSize: 30, fontWeight: 900, color: "#fff" }}>{initials}</span>
            </button>
            <div style={{
              position: "absolute", bottom: 0, right: 0,
              width: 28, height: 28, borderRadius: "50%", background: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
            }}>
              <Camera size={13} style={{ color: "#2563eb" }} />
            </div>
          </div>
          {/* Name */}
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#fff", margin: "0 0 6px" }}>{profile.name}</h1>
          {/* Badges */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
            <span style={{
              background: "rgba(255,255,255,0.2)", color: "#fff",
              fontSize: 11, fontWeight: 800, padding: "4px 12px", borderRadius: 99, letterSpacing: 1.2,
            }}>ADMIN</span>
            <span style={{ display: "flex", alignItems: "center", gap: 5, color: "rgba(255,255,255,0.85)", fontSize: 12, fontWeight: 600 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#4ade80", display: "inline-block" }} />
              Online
            </span>
          </div>
        </div>

        {/* ════ PROFILE INFO ════ */}
        <SectionHeader title="Profile Info" />
        <Card>
          <InfoRow icon={User}     label="Full Name"     value={profile.name}            onPress={openEditProfile} iconBg="#eff6ff"  iconColor="#2563eb" />
          <InfoRow icon={Phone}    label="Phone Number"  value={profile.phone}           onPress={openEditProfile} iconBg="#f0fdf4"  iconColor="#16a34a" />
          <InfoRow icon={Mail}     label="Email"         value={profile.email}           onPress={openEditProfile} iconBg="#fdf4ff"  iconColor="#9333ea" />
          <InfoRow icon={User}     label="Role"          value="Administrator"           readOnly               iconBg="#f8fafc"  iconColor="#64748b" />
          <InfoRow icon={Settings} label="Member Since"  value={fmtDate(profile.memberSince)} readOnly          iconBg="#f8fafc"  iconColor="#64748b" />
          <InfoRow icon={Settings} label="Last Login"    value={fmtDateTime(profile.lastLogin)} readOnly        iconBg="#f8fafc"  iconColor="#64748b" />
        </Card>
        <div style={{ margin: "8px 16px 0" }}>
          <button
            onClick={openEditProfile}
            style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              background: "#2563eb", color: "#fff", border: "none", borderRadius: 14,
              padding: "14px 0", fontSize: 14, fontWeight: 700, cursor: "pointer",
            }}
          >
            <Edit3 size={15} /> Edit Profile
          </button>
        </div>

        {/* ════ SECURITY ════ */}
        <SectionHeader title="Security" />
        <Card>
          <TapRow icon={Lock} label="Change Password" sub="Update your login password" onPress={openChangePassword} iconBg="#fff7ed" iconColor="#f97316" />
        </Card>

        {/* ════ RESTAURANT SETTINGS ════ */}
        <SectionHeader title="Restaurant Settings" />
        <Card>
          <TapRow icon={Store} label={rest.name} sub="Restaurant Name" onPress={openEditRest} iconBg="#faf5ff" iconColor="#9333ea" />

          {/* Language inline picker */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", borderBottom: "1px solid #f1f5f9" }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: "#eff6ff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: "#2563eb" }}>🌐</span>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Language</div>
              <div style={{ display: "flex", gap: 6 }}>
                {["English", "Russian", "Uzbek"].map(l => (
                  <button
                    key={l}
                    onClick={() => { setRest(s => ({ ...s, language: l })); showToast(); }}
                    style={{
                      fontSize: 11, padding: "5px 10px", borderRadius: 99,
                      border: `1.5px solid ${rest.language === l ? "#2563eb" : "#e2e8f0"}`,
                      background: rest.language === l ? "#2563eb" : "#f8fafc",
                      color: rest.language === l ? "#fff" : "#64748b",
                      fontWeight: 700, cursor: "pointer",
                    }}
                  >{l}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Tax Rate */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", borderBottom: "1px solid #f1f5f9", minHeight: 56 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: "#fff1f2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: "#dc2626" }}>%</span>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>Tax Rate</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>{rest.taxRate}%</div>
            </div>
            <button onClick={openEditRest} style={{ background: "#f1f5f9", border: "none", borderRadius: 8, width: 30, height: 30, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Edit3 size={13} style={{ color: "#64748b" }} />
            </button>
          </div>

          {/* Service Charge */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", borderBottom: "1px solid #f1f5f9", minHeight: 56 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: "#fefce8", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: "#ca8a04" }}>SC</span>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>Service Charge ({rest.serviceCharge}%)</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: rest.serviceChargeOn ? "#16a34a" : "#94a3b8" }}>{rest.serviceChargeOn ? "Enabled" : "Disabled"}</div>
            </div>
            <Toggle on={rest.serviceChargeOn} onToggle={() => { setRest(s => ({ ...s, serviceChargeOn: !s.serviceChargeOn })); showToast(); }} />
          </div>

          {/* Receipt Header */}
          <TapRow icon={Store} label="Receipt Header" sub={rest.receiptHeader} onPress={openEditRest} iconBg="#f8fafc" iconColor="#64748b" />
        </Card>

        {/* ════ NOTIFICATIONS ════ */}
        <SectionHeader title="Notifications" />
        <Card>
          <ToggleRow icon={Bell} label="New Order Alerts"     on={notifs.newOrder}     onToggle={() => toggleNotif("newOrder")}     iconBg="#eff6ff"  iconColor="#2563eb" />
          <ToggleRow icon={Bell} label="Low Stock Alerts"     on={notifs.lowStock}     onToggle={() => toggleNotif("lowStock")}     iconBg="#fff7ed"  iconColor="#f97316" />
          <ToggleRow icon={Bell} label="Staff Late Alerts"    on={notifs.staffLate}    onToggle={() => toggleNotif("staffLate")}    iconBg="#fff1f2"  iconColor="#dc2626" />
          <ToggleRow icon={Bell} label="Payment Received"     on={notifs.payment}      onToggle={() => toggleNotif("payment")}      iconBg="#f0fdf4"  iconColor="#16a34a" />
          <ToggleRow icon={Bell} label="Kitchen Order Ready"  on={notifs.kitchenReady} onToggle={() => toggleNotif("kitchenReady")} iconBg="#faf5ff"  iconColor="#9333ea" />
        </Card>

        {/* ════ APP SETTINGS ════ */}
        <SectionHeader title="App Settings" />
        <Card>
          <ToggleRow icon={Settings} label="Sound Effects" on={appSet.sound}     onToggle={() => toggleApp("sound")}     iconBg="#eef2ff"  iconColor="#4f46e5" />
          <ToggleRow icon={Settings} label="Vibration"     on={appSet.vibration} onToggle={() => toggleApp("vibration")} iconBg="#fdf2f8"  iconColor="#db2777" />
          {/* Auto-lock */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", minHeight: 56 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: "#f0fdfa", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Settings size={16} style={{ color: "#0d9488" }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>Auto-lock Screen</div>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              {["Never", "5 min", "10 min", "30 min"].map(opt => (
                <button
                  key={opt}
                  onClick={() => { setAppSet(s => ({ ...s, autoLock: opt })); showToast(); }}
                  style={{
                    fontSize: 10, padding: "5px 8px", borderRadius: 8, fontWeight: 700, cursor: "pointer",
                    border: `1.5px solid ${appSet.autoLock === opt ? "#2563eb" : "#e2e8f0"}`,
                    background: appSet.autoLock === opt ? "#2563eb" : "#f8fafc",
                    color: appSet.autoLock === opt ? "#fff" : "#64748b",
                  }}
                >{opt}</button>
              ))}
            </div>
          </div>
        </Card>

        {/* ════ SIGN OUT ════ */}
        <div style={{ margin: "16px 16px 24px" }}>
          <button
            onClick={() => openSheet("signOut")}
            style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              background: "#fff", color: "#dc2626", border: "2px solid #fecaca",
              borderRadius: 16, padding: "15px 0", fontSize: 14, fontWeight: 800, cursor: "pointer",
            }}
          >
            <LogOut size={16} /> Sign Out
          </button>
        </div>
      </div>

      {/* ── Bottom Nav ── */}
      <div style={{
        position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
        width: "100%", maxWidth: 430, background: "#fff",
        borderTop: "1px solid #e2e8f0", display: "flex", zIndex: 50,
        boxShadow: "0 -2px 12px rgba(0,0,0,0.06)",
      }}>
        {NAV.map(item => {
          const active = item.id === "P";
          return (
            <button
              key={item.id}
              style={{
                flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
                justifyContent: "center", padding: "8px 0 10px", border: "none", background: "none",
                cursor: "pointer", minHeight: 56,
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 900, color: active ? "#2563eb" : "#94a3b8" }}>{item.id}</span>
              <span style={{ fontSize: 9, fontWeight: 600, color: active ? "#2563eb" : "#cbd5e1", marginTop: 2 }}>{item.label}</span>
              {active && <div style={{ width: 20, height: 3, background: "#2563eb", borderRadius: 99, marginTop: 3 }} />}
            </button>
          );
        })}
      </div>

      {/* ════ BOTTOM SHEETS ════ */}

      {/* Edit Profile */}
      <BottomSheet visible={sheet === "editProfile"} onClose={closeSheet} title="Edit Profile">
        <Field label="Full Name"    value={editForm.name}  onChange={v => setEditForm(f => ({ ...f, name: v }))}  placeholder="Your full name" />
        <Field label="Phone Number" value={editForm.phone} onChange={v => setEditForm(f => ({ ...f, phone: v }))} placeholder="+998 90 000 00 01" />
        <Field label="Email"        value={editForm.email} onChange={v => setEditForm(f => ({ ...f, email: v }))} placeholder="you@email.com" />
        <SaveBtn onClick={saveProfile} />
      </BottomSheet>

      {/* Change Password */}
      <BottomSheet visible={sheet === "changePassword"} onClose={closeSheet} title="Change Password">
        <Field label="Current Password" type="password" value={pwForm.current}  onChange={v => setPwForm(f => ({ ...f, current: v }))}  placeholder="Enter current password" />
        <Field label="New Password"     type="password" value={pwForm.next}    onChange={v => setPwForm(f => ({ ...f, next: v }))}    placeholder="Min 6 characters" />
        <Field label="Confirm Password" type="password" value={pwForm.confirm} onChange={v => setPwForm(f => ({ ...f, confirm: v }))} placeholder="Repeat new password" />
        <ErrMsg msg={pwError} />
        <SaveBtn label="Change Password" onClick={savePassword} />
      </BottomSheet>

      {/* Edit Restaurant Settings */}
      <BottomSheet visible={sheet === "editRest"} onClose={closeSheet} title="Restaurant Settings">
        <Field label="Restaurant Name"   value={restForm.name}          onChange={v => setRestForm(s => ({ ...s, name: v }))}          placeholder="e.g. The Bill" />
        <Field label="Currency"          value={restForm.currency}      onChange={v => setRestForm(s => ({ ...s, currency: v }))}      placeholder="so'm" />
        <Field label="Tax Rate (%)"      value={restForm.taxRate}       onChange={v => setRestForm(s => ({ ...s, taxRate: v }))}       placeholder="12" />
        <Field label="Service Charge (%)" value={restForm.serviceCharge} onChange={v => setRestForm(s => ({ ...s, serviceCharge: v }))} placeholder="5" />
        <Field label="Receipt Header"    value={restForm.receiptHeader} onChange={v => setRestForm(s => ({ ...s, receiptHeader: v }))} placeholder="Thank you for dining!" />
        <SaveBtn onClick={saveRest} />
      </BottomSheet>

      {/* Avatar Color Picker */}
      <BottomSheet visible={sheet === "colorPicker"} onClose={closeSheet} title="Choose Avatar Color">
        <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 14, padding: "8px 0 4px" }}>
          {AVATAR_COLORS.map(c => (
            <button
              key={c}
              onClick={() => { setAvatarColor(c); closeSheet(); showToast("Avatar updated"); }}
              style={{
                width: 52, height: 52, borderRadius: "50%", background: c,
                border: avatarColor === c ? "3px solid #0f172a" : "3px solid transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                outline: avatarColor === c ? "2px solid #fff" : "none",
              }}
            >
              {avatarColor === c && <Check size={20} style={{ color: "#fff" }} />}
            </button>
          ))}
        </div>
        <p style={{ textAlign: "center", fontSize: 12, color: "#94a3b8", marginTop: 12 }}>Tap a color to apply</p>
      </BottomSheet>

      {/* Sign Out Confirmation */}
      <BottomSheet visible={sheet === "signOut"} onClose={closeSheet} title="Sign Out">
        <div style={{ textAlign: "center", padding: "8px 0" }}>
          <div style={{
            width: 68, height: 68, borderRadius: "50%", background: "#fff1f2",
            display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px",
          }}>
            <LogOut size={28} style={{ color: "#dc2626" }} />
          </div>
          <p style={{ fontSize: 17, fontWeight: 800, color: "#0f172a", margin: "0 0 6px" }}>Are you sure?</p>
          <p style={{ fontSize: 13, color: "#94a3b8", margin: "0 0 24px", lineHeight: 1.5 }}>
            You will be signed out of your admin account.
          </p>
          <SaveBtn label="Sign Out" danger onClick={closeSheet} />
          <button
            onClick={closeSheet}
            style={{
              width: "100%", background: "#f1f5f9", color: "#64748b", border: "none",
              borderRadius: 14, padding: "15px 0", fontSize: 14, fontWeight: 700, cursor: "pointer", marginTop: 10,
            }}
          >
            Cancel
          </button>
        </div>
      </BottomSheet>

    </div>
  );
}

import { useState, useEffect } from 'react';
import { useTranslation } from '../../../context/LanguageContext.jsx';
import { usersAPI } from '../../../api/client.js';
import ConfirmDialog from '../../../components/ConfirmDialog.jsx';
import PhoneInput, { formatPhoneDisplay } from '../../../components/PhoneInput.jsx';
import { camelizeRow } from '../../../lib/case.js';
import {
  User, Mail, Phone, Shield, Save, X, LogOut,
  Lock, Edit2, Eye, EyeOff, Clock, Calendar,
  ChevronRight, Check, AlertCircle,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Ported verbatim from website/src/pages/admin/AdminProfile.jsx (~320 lines,
// the smallest Admin screen) — the logged-in admin's own profile info, an
// edit-profile modal, and a change-password modal. Same design, same data,
// same computations ("no design/functional changes" rule for this whole
// Admin build), with the following adaptations, none of them visual:
//
// 1. NO AuthContext — the website reads/writes the logged-in user via
//    `useAuth()` (`authUser`, `updateUser`), which lives in
//    website/src/context/AuthContext.jsx and also owns `localStorage`/token
//    persistence. pos-app has no such context; its session lives in
//    App.jsx's own `useState` and is handed down as a plain `user` prop
//    (AdminShell.jsx → this screen), the same reasoning already used for
//    every other Admin screen that needed the current user (Dashboard's
//    `navigate` prop is the same class of adaptation). Replaced `authUser`
//    with a local `profile` state seeded from the `user` prop, and
//    `updateUser(patch)` with `setProfile(prev => ({ ...prev, ...patch }))` —
//    same "refresh from GET /users/me on mount, patch in-place after a save"
//    behavior as the source, just held locally instead of in a shared
//    context.
//
//    KNOWN, DELIBERATE LIMITATION (not a silent bug — flagging clearly, same
//    as every other real deviation in this build): AdminShell.jsx's sidebar
//    header (avatar initials + name) reads `user` from a prop snapshot taken
//    once when the Admin panel mounted (App.jsx's `session` state) and has
//    no callback wired back up to refresh it. Editing your name/phone on
//    this screen updates this screen's own display immediately (identical to
//    the website), but the sidebar's name won't reflect the edit until the
//    next login — the website doesn't have this gap since its AuthContext is
//    one shared source of truth for both the profile page and its own
//    sidebar. Re-threading a live update callback through App.jsx → AdminPanel
//    → AdminShell was judged out of scope for this port (would touch 3 files
//    outside this screen for a cosmetic staleness gap on a rarely-changed
//    field); revisit if the project owner wants the sidebar to update live.
//
// 2. SIGN OUT — the source's `handleLogout` does its own
//    `localStorage.removeItem('token'/'user')` + `window.location.href =
//    '/login'` (a raw browser redirect, meaningless in Electron — there's no
//    `/login` URL to navigate to outside App.jsx's own react-router route,
//    and pos-app's actual logout also has to call `window.electronAPI.
//    logout()` first, see AdminPanel.jsx's `handleLogout`). AdminShell.jsx
//    already centralizes this exact logout flow for its own sidebar "Sign
//    Out" button via an `onLogout` prop — this screen's identical Sign Out
//    button/confirm-dialog now calls that same passed-down `onLogout` prop
//    instead of re-implementing the redirect, so there is exactly one logout
//    code path, not two. This required adding `onLogout` to the prop list
//    AdminShell.jsx already passes to whichever screen is active (alongside
//    `navigate`/`openOrderId`/`clearOpenOrderId`) — see AdminShell.jsx's own
//    header comment for the matching note. Same confirm-dialog UX either way
//    (Sign Out button → styled confirm → actual sign-out on confirm).
//
// 3. Import paths adjusted for pos-app's file layout (screens/ is one level
//    deeper than the website's pages/admin/) — `useTranslation` path
//    adjusted; `usersAPI` (client.js — `getMe`/`update`/`updateCredentials`)
//    was already ported and verified for the foundation task (#20), every
//    method this screen calls matches exactly; `ConfirmDialog`/`PhoneInput`
//    (+ its named `formatPhoneDisplay` export) were already ported and
//    verified for earlier screens, reused unchanged.
//
// 4. PRINTING / window.prompt|confirm|alert / avatar upload — all three
//    standing concerns for this build were grepped for and found clean:
//    - No "print"/"Print" anywhere in the source — nothing to exclude.
//    - No bare `window.prompt`/`window.confirm`/`window.alert` (or bare
//      `prompt(`/`confirm(`/`alert(`) anywhere — the source already routes
//      its own confirm-style prompts (delete... well, here just Sign Out)
//      through its own `ConfirmDialog` component, exactly the pattern this
//      whole build standardized on for Inventory's/Staff's real bugs.
//    - No avatar/staff-photo upload feature anywhere in this screen or this
//      codebase (confirmed earlier against `users.js`/`schema.sql` — staff
//      are shown via initials chips only). This screen's header avatar is a
//      pure initials chip (`getInitials`), no file input, no upload API call
//      of any kind — nothing to stub.
//
// Component renamed AdminProfile → AdminProfileScreen on export, matching
// the AdminMenuScreen/AdminOrdersScreen/.../AdminSettingsScreen naming
// convention from earlier screens, and to avoid any confusion with the
// unrelated cashier-side pos-app/src/pages/pos/ProfileScreen.jsx (different
// folder, no actual filename collision).
//
// ── 2026-07-28: read converted to local PowerSync, ninth/last screen of
// task #31 (after Tables/Loans/Menu/Orders/Inventory/Staff/Dashboard) — see
// OrdersScreen.jsx's own header comment for the general pattern
// (psGetAll/psGet + camelizeRow/camelizeRows, no restaurant_id filter needed
// since the local DB is already scoped to one restaurant). Checked the
// cashier-side `pos-app/src/pages/pos/ProfileScreen.jsx` first for
// precedent (per task #19's network-vs-offline handling) — it reads shifts/
// orders via the REST-only `apiGet` IPC and never calls `usersAPI.getMe()`
// at all (it just uses its own `user` prop directly), so there was no
// existing local-read pattern there to reuse for this specific call; this
// conversion is a fresh one.
//
// The mount-time refresh (`usersAPI.getMe()`, GET /api/users/me) was
// verified against the real route first, not assumed: `SELECT id, name,
// email, phone, role, salary, salary_type, shift_start, shift_end,
// is_active, kitchen_station, commission_rate, created_at FROM users
// WHERE id=$1` — a single-row lookup by the current user's own id (from the
// JWT), explicit column list (already excludes `password_hash`), no joins,
// no aggregation. Every one of those columns exists on the local `users`
// table (`pos-app/powersync/schema.js`) — a direct 1:1 port, converted to
// `SELECT id, name, email, phone, role, salary, salary_type, shift_start,
// shift_end, is_active, kitchen_station, commission_rate, created_at FROM
// users WHERE id = ?` using `user?.id` (the same id `profile` was already
// seeded from). Same "silently fall back to cached data" try/catch shape as
// the original REST call — a missing/failed local row just leaves the
// `user`-prop-seeded `profile` state as-is, identical fallback behavior to
// before.
//
// Boolean-column check: `users.is_active` (→ `isActive`) is already in
// case.js's `BOOL_FIELDS` — verified directly. Not actually rendered
// anywhere on this screen (only name/phone/email/role/createdAt/lastLogin
// are displayed), so this is a non-issue in practice, but the coercion is
// correct either way, consistent with every other screen's boolean check.
// `users.last_login` does not exist as a column at all, in Postgres or
// locally — the real REST route never selected it either, so
// `profile.lastLogin || profile.last_login || new Date()` already fell
// through to `new Date()` before this conversion; unchanged behavior, not a
// bug introduced here.
//
// Every write on this screen (`usersAPI.update`/`updateCredentials`) is
// completely untouched — still REST, unchanged. `usersAPI` import is kept
// for those two remaining writes.
// ─────────────────────────────────────────────────────────────────────────────

// ── Toast Component ──────────────────────────────────────────────────────────
function Toast({ message, visible }) {
  if (!visible) return null;
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white px-5 py-3 rounded-lg shadow-lg flex items-center gap-2 animate-fade-in">
      <Check size={16} className="text-green-400" />
      {message}
    </div>
  );
}

export default function AdminProfileScreen({ user, onLogout }) {
  const { t } = useTranslation();

  // ── Local profile state, seeded from the `user` prop (see header comment #1) ──
  const [profile, setProfile] = useState(user || null);

  // ── Fetch fresh profile from local PowerSync on mount ────────────────────
  // Was `usersAPI.getMe()` (REST) — see this file's own header comment
  // (2026-07-28 conversion note) for the full reasoning. Same "silently fall
  // back to cached data" behavior as before on any failure.
  useEffect(() => {
    (async () => {
      try {
        if (!user?.id) return;
        const fresh = await window.electronAPI.psGet(`
          SELECT id, name, email, phone, role, salary, salary_type, shift_start, shift_end,
                 is_active, kitchen_station, commission_rate, created_at
          FROM users WHERE id = ?
        `, [user.id]);
        if (fresh && fresh.id) setProfile(prev => ({ ...prev, ...camelizeRow(fresh) }));
      } catch (_) { /* silently fall back to cached data */ }
    })();
  }, [user?.id]);

  // ── State ────────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState(null); // 'editProfile' | 'changePassword'
  const [dialog, setDialog] = useState(null);
  const [toast, setToast] = useState({ msg: '', visible: false });

  // Profile form
  const [profileForm, setProfileForm] = useState({ name: '', phone: '', email: '' });

  // Password form
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [showPw, setShowPw] = useState({ current: false, next: false, confirm: false });

  // ── Helpers ──────────────────────────────────────────────────────────────
  const showToast = (msg) => {
    setToast({ msg, visible: true });
    setTimeout(() => setToast({ msg: '', visible: false }), 2200);
  };

  const getInitials = (name) => {
    if (!name) return 'AD';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const formatDate = (d) => {
    try { return new Date(d).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }); }
    catch { return '—'; }
  };
  const formatDateTime = (d) => {
    try { return new Date(d).toLocaleString('en-US', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
    catch { return '—'; }
  };

  // ── Handlers ─────────────────────────────────────────────────────────────
  const openEditProfile = () => {
    setProfileForm({ name: profile?.name || '', phone: profile?.phone || '', email: profile?.email || '' });
    setModal('editProfile');
  };

  const saveProfile = async () => {
    if (!profileForm.name.trim()) {
      setDialog({ title: 'Required', message: 'Name is required.', type: 'warning' }); return;
    }
    try {
      setSaving(true);
      const updated = await usersAPI.update(profile.id, { name: profileForm.name, phone: profileForm.phone });
      // Update local profile state (screen's own display) — see header
      // comment #1 for why this doesn't also propagate to the sidebar.
      setProfile(prev => ({ ...prev, name: updated.name || profileForm.name, phone: updated.phone || profileForm.phone }));
      showToast(t('admin.profile.profileUpdated'));
      setModal(null);
    } catch (e) {
      setDialog({ title: t('common.error', 'Error'), message: e?.error || e?.response?.data?.error || t('alerts.failedUpdateProfile', 'Failed to update profile.'), type: 'error' });
    } finally { setSaving(false); }
  };

  const openChangePassword = () => {
    setPwForm({ current: '', next: '', confirm: '' });
    setShowPw({ current: false, next: false, confirm: false });
    setModal('changePassword');
  };

  const savePassword = async () => {
    if (pwForm.next.length < 6) { setDialog({ title: 'Too Short', message: 'New password must be at least 6 characters.', type: 'warning' }); return; }
    if (pwForm.next !== pwForm.confirm) { setDialog({ title: 'Mismatch', message: 'New passwords do not match.', type: 'warning' }); return; }
    try {
      setSaving(true);
      await usersAPI.updateCredentials(profile.id, {
        password: pwForm.next, confirm_password: pwForm.confirm,
      });
      showToast(t('admin.profile.passwordChanged'));
      setModal(null);
    } catch (e) {
      setDialog({ title: t('common.error', 'Error'), message: e?.error || e?.response?.data?.error || t('alerts.failedChangePassword', 'Failed to change password.'), type: 'error' });
    } finally { setSaving(false); }
  };

  // See header comment #2 — reuses AdminShell's own centralized logout flow
  // instead of the source's raw localStorage-clear + window.location.href.
  const handleLogout = () => {
    setDialog({
      title: t('admin.profile.signOut'),
      message: t('admin.profile.signOutConfirm'),
      type: 'danger',
      confirmLabel: t('admin.profile.signOut'),
      onConfirm: () => { onLogout?.(); },
    });
  };

  if (!profile) return <div className="p-8 text-center text-gray-500">{t("common.loading")}</div>;

  return (
    <div className="h-full overflow-auto bg-gray-50">
      {/* ── Profile Header ── */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600">
        <div className="max-w-5xl mx-auto px-6 py-10">
          <div className="flex items-center gap-6">
            <div className="w-24 h-24 rounded-full bg-white/20 border-4 border-white/40 flex items-center justify-center flex-shrink-0">
              <span className="text-3xl font-bold text-white">{getInitials(profile.name)}</span>
            </div>
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-white">{profile.name}</h1>
              <div className="flex items-center gap-3 mt-2">
                <span className="inline-flex items-center px-3 py-1 rounded-full bg-white/20 text-white text-sm font-semibold">
                  <Shield size={13} className="mr-1.5" />
                  {profile.role}
                </span>
                <span className="text-blue-200 text-sm flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-green-400" /> Online
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main Content ── */}
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">

        {/* ── Row 1: Profile Info + Security ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Profile Info Card */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-bold text-gray-900 flex items-center gap-2"><User size={18} className="text-blue-600" /> {t("admin.profile.profileInformation")}</h2>
              <button onClick={openEditProfile} className="text-blue-600 hover:text-blue-700 text-sm font-semibold flex items-center gap-1">
                <Edit2 size={14} /> {t("common.edit")}
              </button>
            </div>
            <div className="p-6 space-y-5">
              {[
                [t('admin.profile.fullName'), profile.name, <User key="u" size={16} className="text-gray-400" />],
                [t('admin.profile.phoneNumber'), formatPhoneDisplay(profile.phone), <Phone key="p" size={16} className="text-gray-400" />],
                [t('common.email'), profile.email, <Mail key="e" size={16} className="text-gray-400" />],
                [t('common.role'), (profile.role || '').charAt(0).toUpperCase() + (profile.role || '').slice(1), <Shield key="s" size={16} className="text-gray-400" />],
                [t('admin.profile.memberSince'), formatDate(profile.createdAt || profile.created_at), <Calendar key="c" size={16} className="text-gray-400" />],
                [t('admin.profile.lastLogin'), formatDateTime(profile.lastLogin || profile.last_login || new Date()), <Clock key="l" size={16} className="text-gray-400" />],
              ].map(([label, value, icon]) => (
                <div key={label} className="flex items-center gap-3">
                  {icon}
                  <div>
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
                    <p className="text-sm font-medium text-gray-900">{value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Security + Sign Out */}
          <div className="space-y-6">
            {/* Change Password */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="font-bold text-gray-900 flex items-center gap-2"><Lock size={18} className="text-blue-600" /> {t("admin.profile.security")}</h2>
              </div>
              <div className="p-6">
                <button
                  onClick={openChangePassword}
                  className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                      <Lock size={18} className="text-amber-600" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-semibold text-gray-900">{t("admin.profile.changePassword")}</p>
                      <p className="text-xs text-gray-500">{t("admin.profile.updateLoginPassword")}</p>
                    </div>
                  </div>
                  <ChevronRight size={18} className="text-gray-400 group-hover:text-gray-600" />
                </button>
              </div>
            </div>

            {/* Sign Out */}
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-red-50 text-red-600 font-semibold rounded-xl border border-red-200 hover:bg-red-100 transition-colors"
            >
              <LogOut size={18} />
              {t('admin.profile.signOut')}
            </button>
          </div>
        </div>

      </div>

      {/* ══════════════════════ MODALS ══════════════════════ */}

      {/* Edit Profile Modal */}
      {modal === 'editProfile' && (
        <ModalWrapper title={t('admin.profile.editProfile')} onClose={() => setModal(null)}>
          <div className="space-y-4">
            <FormField label={t('admin.profile.fullName')} value={profileForm.name} onChange={v => setProfileForm({ ...profileForm, name: v })} placeholder={t('placeholders.yourName', 'Your name')} />
            <PhoneInput label={t('admin.profile.phoneNumber')} value={profileForm.phone} onChange={v => setProfileForm({ ...profileForm, phone: v })} />
            <FormField label={t('common.email')} value={profileForm.email} disabled note="Email cannot be changed here" />
          </div>
          <ModalActions onSave={saveProfile} onCancel={() => setModal(null)} saving={saving} saveLabel={t('common.saveChanges')} savingLabel={t('common.saving')} cancelLabel={t('common.cancel')} />
        </ModalWrapper>
      )}

      {/* Change Password Modal */}
      {modal === 'changePassword' && (
        <ModalWrapper title={t('admin.profile.changePassword')} onClose={() => setModal(null)}>
          <div className="space-y-4">
            <PasswordField label={t('admin.profile.newPassword')} value={pwForm.next} onChange={v => setPwForm({ ...pwForm, next: v })} show={showPw.next} onToggle={() => setShowPw({ ...showPw, next: !showPw.next })} />
            <PasswordField label={t('admin.profile.confirmPassword')} value={pwForm.confirm} onChange={v => setPwForm({ ...pwForm, confirm: v })} show={showPw.confirm} onToggle={() => setShowPw({ ...showPw, confirm: !showPw.confirm })} />
            {pwForm.next && pwForm.next.length < 6 && <p className="text-xs text-amber-600 flex items-center gap-1"><AlertCircle size={12} /> {t('admin.profile.min6Characters')}</p>}
            {pwForm.confirm && pwForm.next !== pwForm.confirm && <p className="text-xs text-red-600 flex items-center gap-1"><AlertCircle size={12} /> {t('admin.profile.passwordsDoNotMatch')}</p>}
          </div>
          <ModalActions onSave={savePassword} onCancel={() => setModal(null)} saving={saving} saveLabel={t('admin.profile.changePassword')} savingLabel={t('common.saving')} cancelLabel={t('common.cancel')} />
        </ModalWrapper>
      )}

      <ConfirmDialog dialog={dialog} onClose={() => setDialog(null)} />
      <Toast message={toast.msg} visible={toast.visible} />
    </div>
  );
}

// ── Reusable Sub-Components ──────────────────────────────────────────────────

function ModalWrapper({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

function ModalActions({ onSave, onCancel, saving, saveLabel = 'Save Changes', savingLabel = 'Saving...', cancelLabel = 'Cancel' }) {
  return (
    <div className="flex gap-3 pt-5">
      <button onClick={onSave} disabled={saving}
        className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:bg-blue-400 transition-colors">
        <Save size={16} /> {saving ? savingLabel : saveLabel}
      </button>
      <button onClick={onCancel} className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 font-semibold rounded-lg hover:bg-gray-200 transition-colors">
        {cancelLabel}
      </button>
    </div>
  );
}

function FormField({ label, value, onChange, placeholder, type = 'text', disabled, note }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-1.5">{label}</label>
      <input
        type={type} value={value} onChange={e => onChange?.(e.target.value)}
        placeholder={placeholder} disabled={disabled}
        className={`w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${disabled ? 'bg-gray-50 text-gray-500' : ''}`}
      />
      {note && <p className="text-xs text-gray-400 mt-1">{note}</p>}
    </div>
  );
}

function PasswordField({ label, value, onChange, show, onToggle }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-1.5">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'} value={value} onChange={e => onChange(e.target.value)}
          className="w-full px-4 py-2.5 pr-12 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button type="button" onClick={onToggle} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
          {show ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </div>
  );
}

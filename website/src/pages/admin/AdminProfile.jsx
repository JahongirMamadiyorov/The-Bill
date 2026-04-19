import { useState, useEffect } from 'react';
import { useTranslation } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { usersAPI } from '../../api/client';
import ConfirmDialog from '../../components/ConfirmDialog';
import PhoneInput, { formatPhoneDisplay } from '../../components/PhoneInput';
import {
  User, Mail, Phone, Shield, Save, X, LogOut,
  Lock, Edit2, Eye, EyeOff, Clock, Calendar,
  ChevronRight, Check, AlertCircle,
} from 'lucide-react';

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

export default function AdminProfile() {
  const { user: authUser, updateUser } = useAuth();
  const { t } = useTranslation();

  // ── Fetch fresh profile from backend on mount ────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const fresh = await usersAPI.getMe();
        if (fresh && fresh.id) updateUser(fresh);
      } catch (_) { /* silently fall back to cached data */ }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    setProfileForm({ name: authUser?.name || '', phone: authUser?.phone || '', email: authUser?.email || '' });
    setModal('editProfile');
  };

  const saveProfile = async () => {
    if (!profileForm.name.trim()) {
      setDialog({ title: 'Required', message: 'Name is required.', type: 'warning' }); return;
    }
    try {
      setSaving(true);
      const updated = await usersAPI.update(authUser.id, { name: profileForm.name, phone: profileForm.phone });
      // Update auth context + localStorage in one call
      updateUser({ name: updated.name || profileForm.name, phone: updated.phone || profileForm.phone });
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
      await usersAPI.updateCredentials(authUser.id, {
        password: pwForm.next, confirm_password: pwForm.confirm,
      });
      showToast(t('admin.profile.passwordChanged'));
      setModal(null);
    } catch (e) {
      setDialog({ title: t('common.error', 'Error'), message: e?.error || e?.response?.data?.error || t('alerts.failedChangePassword', 'Failed to change password.'), type: 'error' });
    } finally { setSaving(false); }
  };

  const handleLogout = () => {
    setDialog({
      title: t('admin.profile.signOut'),
      message: t('admin.profile.signOutConfirm'),
      type: 'danger',
      confirmLabel: t('admin.profile.signOut'),
      onConfirm: () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
      },
    });
  };

  if (!authUser) return <div className="p-8 text-center text-gray-500">{t("common.loading")}</div>;

  return (
    <div className="h-full overflow-auto bg-gray-50">
      {/* ── Profile Header ── */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600">
        <div className="max-w-5xl mx-auto px-6 py-10">
          <div className="flex items-center gap-6">
            <div className="w-24 h-24 rounded-full bg-white/20 border-4 border-white/40 flex items-center justify-center flex-shrink-0">
              <span className="text-3xl font-bold text-white">{getInitials(authUser.name)}</span>
            </div>
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-white">{authUser.name}</h1>
              <div className="flex items-center gap-3 mt-2">
                <span className="inline-flex items-center px-3 py-1 rounded-full bg-white/20 text-white text-sm font-semibold">
                  <Shield size={13} className="mr-1.5" />
                  {authUser.role}
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
                [t('admin.profile.fullName'), authUser.name, <User key="u" size={16} className="text-gray-400" />],
                [t('admin.profile.phoneNumber'), formatPhoneDisplay(authUser.phone), <Phone key="p" size={16} className="text-gray-400" />],
                [t('common.email'), authUser.email, <Mail key="e" size={16} className="text-gray-400" />],
                [t('common.role'), (authUser.role || '').charAt(0).toUpperCase() + (authUser.role || '').slice(1), <Shield key="s" size={16} className="text-gray-400" />],
                [t('admin.profile.memberSince'), formatDate(authUser.createdAt || authUser.created_at), <Calendar key="c" size={16} className="text-gray-400" />],
                [t('admin.profile.lastLogin'), formatDateTime(authUser.lastLogin || authUser.last_login || new Date()), <Clock key="l" size={16} className="text-gray-400" />],
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

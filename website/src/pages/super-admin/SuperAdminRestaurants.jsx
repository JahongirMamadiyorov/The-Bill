import { useState, useEffect, useCallback } from 'react';
import {
  Building2, Plus, Search, Edit3, Trash2, RotateCcw, Users, X,
  MapPin, Phone, Eye, EyeOff, ChevronDown, ChevronUp, Loader2,
  CheckCircle2, XCircle, AlertCircle, UserPlus, Shield, Crown,
  Clock, DollarSign, Calendar, History, Star, Zap, Award,
} from 'lucide-react';
import { superAdminAPI } from '../../api/client';
import { useTranslation } from '../../context/LanguageContext';

/* ── Helpers ──────────────────────────────────────────────────────────────── */
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

// Format local digits as XX XXX XX XX (max 9 digits)
function formatPhoneLocal(digits) {
  const d = digits.slice(0, 9);
  let out = '';
  if (d.length > 0) out += d.slice(0, 2);
  if (d.length > 2) out += ' ' + d.slice(2, 5);
  if (d.length > 5) out += ' ' + d.slice(5, 7);
  if (d.length > 7) out += ' ' + d.slice(7, 9);
  return out;
}

// Extract local 9 digits from a stored phone value like "+998901234567"
function phoneToLocal(stored) {
  if (!stored) return '';
  const digits = stored.replace(/\D/g, '');
  if (digits.startsWith('998') && digits.length > 3) return digits.slice(3, 12);
  return digits.slice(0, 9);
}

// Build +998XXXXXXXXX from local digits
function localToPhone(local) {
  if (!local) return '';
  return '+998' + local;
}

/* ── Phone Input Component ────────────────────────────────────────────────── */
function PhoneInput({ value, onChange, className }) {
  // value = full phone like "+998901234567", onChange receives full phone
  const { t } = useTranslation();
  const local = phoneToLocal(value);
  const display = formatPhoneLocal(local);

  const handleChange = (e) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 9);
    onChange(raw ? localToPhone(raw) : '');
  };

  return (
    <div className="flex">
      <div className="flex items-center gap-1.5 px-3 bg-gray-100 border border-r-0 border-gray-200 rounded-l-xl text-sm font-semibold text-gray-600 select-none whitespace-nowrap">
        <span>UZ</span>
        <span>+998</span>
      </div>
      <input
        className={className || "flex-1 px-3.5 py-2.5 border border-gray-200 rounded-r-xl text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-shadow"}
        type="tel"
        inputMode="numeric"
        value={display}
        onChange={handleChange}
        placeholder={t('placeholders.phoneLocal', '90 123 45 67')}
      />
    </div>
  );
}

const PLAN_META = {
  trial:    { label: 'Free Trial',  color: 'amber',  icon: Clock,      monthly: 0,  total: 0,   days: 30  },
  monthly:  { label: 'Monthly',     color: 'blue',   icon: Calendar,   monthly: 41, total: 41,  days: 30  },
  '6month': { label: '6 Months',    color: 'indigo',  icon: Zap,       monthly: 36, total: 216, days: 180 },
  '12month':{ label: '12 Months',   color: 'purple', icon: Award,      monthly: 30, total: 360, days: 365 },
  vip:      { label: 'VIP',         color: 'yellow', icon: Crown,      monthly: 0,  total: 0,   days: null },
};

function planBadgeClasses(plan) {
  const map = {
    trial:    'bg-amber-100 text-amber-700 border-amber-200',
    monthly:  'bg-blue-100 text-blue-700 border-blue-200',
    '6month': 'bg-indigo-100 text-indigo-700 border-indigo-200',
    '12month':'bg-purple-100 text-purple-700 border-purple-200',
    vip:      'bg-yellow-100 text-yellow-700 border-yellow-200',
  };
  return map[plan] || 'bg-gray-100 text-gray-600 border-gray-200';
}

function planStatus(restaurant, t) {
  const plan = restaurant.plan || 'trial';
  if (plan === 'vip') return { status: 'active', label: t('superAdmin.planUnlimited'), color: 'green' };
  const exp = restaurant.planExpiresAt;
  if (!exp) return { status: 'unknown', label: t('superAdmin.noExpirySet'), color: 'gray' };
  const now = new Date();
  const expDate = new Date(exp);
  const daysLeft = Math.ceil((expDate - now) / (1000 * 60 * 60 * 24));
  if (daysLeft < 0) return { status: 'expired', label: t('superAdmin.expiredDaysAgo', { days: Math.abs(daysLeft) }), color: 'red' };
  if (daysLeft <= 7) return { status: 'warning', label: t('superAdmin.daysLeftLabel', { days: daysLeft }), color: 'amber' };
  return { status: 'active', label: t('superAdmin.daysLeftLabel', { days: daysLeft }), color: 'green' };
}

function formatDate(d) {
  if (!d) return '--';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/* ── Status Badge ─────────────────────────────────────────────────────────── */
function StatusBadge({ active }) {
  const { t } = useTranslation();
  return active ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
      <CheckCircle2 size={12} /> {t('common.active')}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
      <XCircle size={12} /> {t('common.inactive')}
    </span>
  );
}

/* ── Plan Badge ───────────────────────────────────────────────────────────── */
function PlanBadge({ plan }) {
  const meta = PLAN_META[plan] || PLAN_META.trial;
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border ${planBadgeClasses(plan)}`}>
      <Icon size={12} /> {meta.label}
    </span>
  );
}

/* ── Restaurant Form Modal ────────────────────────────────────────────────── */
function RestaurantModal({ open, onClose, onSave, initial, saving }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({ name: '', slug: '', address: '', phone: '', logoUrl: '', plan: 'trial' });
  const [autoSlug, setAutoSlug] = useState(!initial);

  useEffect(() => {
    if (open) {
      if (initial) {
        setForm({
          name: initial.name || '', slug: initial.slug || '', address: initial.address || '',
          phone: initial.phone || '', logoUrl: initial.logoUrl || '', plan: initial.plan || 'trial',
        });
        setAutoSlug(false);
      } else {
        setForm({ name: '', slug: '', address: '', phone: '', logoUrl: '', plan: 'trial' });
        setAutoSlug(true);
      }
    }
  }, [open, initial]);

  const handleNameChange = (val) => {
    setForm(f => ({ ...f, name: val, ...(autoSlug ? { slug: slugify(val) } : {}) }));
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg animate-in fade-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-red-100 rounded-xl flex items-center justify-center">
              <Building2 size={18} className="text-red-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-900">{initial ? t('superAdmin.editRestaurant') : t('superAdmin.newRestaurant')}</h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-colors"><X size={18} className="text-gray-400" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{t('owner.profile.restaurantName')}</label>
              <input className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-shadow"
                value={form.name} onChange={e => handleNameChange(e.target.value)} placeholder={t('superAdmin.restaurantNamePlaceholder')} />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{t('superAdmin.slugUrl')}</label>
              <input className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm font-mono focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-shadow"
                value={form.slug} onChange={e => { setAutoSlug(false); setForm(f => ({ ...f, slug: e.target.value })); }} placeholder={t('placeholders.egSlug', 'the-bill-downtown')} />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{t('superAdmin.address')}</label>
              <input className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-shadow"
                value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder={t('placeholders.egAddress', '123 Main Street, Tashkent')} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{t('common.phone')}</label>
              <PhoneInput value={form.phone} onChange={(val) => setForm(f => ({ ...f, phone: val }))} />
            </div>
            {!initial && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{t('superAdmin.changePlan')}</label>
                <select className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none bg-white transition-shadow"
                  value={form.plan} onChange={e => setForm(f => ({ ...f, plan: e.target.value }))}>
                  <option value="trial">{t('subscription.freeTrial30')}</option>
                  <option value="monthly">{t('subscription.planMonthly')} ($41/mo)</option>
                  <option value="6month">{t('subscription.plan6month')} ($36/mo)</option>
                  <option value="12month">{t('subscription.plan12month')} ($30/mo)</option>
                  <option value="vip">{t('subscription.planVip')} ({t('subscription.unlimited')})</option>
                </select>
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">{t('common.cancel')}</button>
          <button
            onClick={() => onSave(form)}
            disabled={saving || !form.name.trim() || !form.slug.trim()}
            className="px-5 py-2.5 text-sm font-semibold text-white bg-red-600 rounded-xl hover:bg-red-700 disabled:opacity-40 flex items-center gap-2 transition-colors shadow-sm"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {initial ? t('common.saveChanges') : t('superAdmin.createRestaurant')}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Plan Change Modal ────────────────────────────────────────────────────── */
function PlanModal({ open, onClose, onSave, restaurant, saving }) {
  const { t } = useTranslation();
  const [selectedPlan, setSelectedPlan] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (open && restaurant) {
      setSelectedPlan(restaurant.plan || 'trial');
      setNote('');
    }
  }, [open, restaurant]);

  if (!open || !restaurant) return null;

  const plans = Object.entries(PLAN_META);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-amber-100 rounded-xl flex items-center justify-center">
              <DollarSign size={18} className="text-amber-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">{t('superAdmin.changePlan')}</h3>
              <p className="text-xs text-gray-500">{restaurant.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-colors"><X size={18} className="text-gray-400" /></button>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 gap-2.5">
            {plans.map(([key, meta]) => {
              const Icon = meta.icon;
              const isSelected = selectedPlan === key;
              const isCurrent = (restaurant.plan || 'trial') === key;
              return (
                <button
                  key={key}
                  onClick={() => setSelectedPlan(key)}
                  className={`flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all ${
                    isSelected
                      ? 'border-red-500 bg-red-50/50 shadow-sm'
                      : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    isSelected ? 'bg-red-100' : 'bg-gray-100'
                  }`}>
                    <Icon size={20} className={isSelected ? 'text-red-600' : 'text-gray-400'} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-gray-900">{meta.label}</span>
                      {isCurrent && (
                        <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase bg-gray-200 text-gray-600 rounded">{t('superAdmin.currentPlan')}</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {key === 'vip' ? t('subscription.freeNeverExpires') :
                       key === 'trial' ? t('subscription.freeTrial30') :
                       `$${meta.monthly}/month${meta.total !== meta.monthly ? ` ($${meta.total} total)` : ''} -- ${meta.days} days`}
                    </p>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    isSelected ? 'border-red-500' : 'border-gray-300'
                  }`}>
                    {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-red-500" />}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-4">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{t('superAdmin.noteOptional')}</label>
            <input className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-shadow"
              value={note} onChange={e => setNote(e.target.value)} placeholder={t('placeholders.egPaymentDesc', 'e.g. Paid via bank transfer')} />
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">{t('common.cancel')}</button>
          <button
            onClick={() => onSave({ plan: selectedPlan, note: note || undefined })}
            disabled={saving || selectedPlan === (restaurant.plan || 'trial')}
            className="px-5 py-2.5 text-sm font-semibold text-white bg-red-600 rounded-xl hover:bg-red-700 disabled:opacity-40 flex items-center gap-2 transition-colors shadow-sm"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {t('superAdmin.changePlan')}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Plan History Modal ───────────────────────────────────────────────────── */
function PlanHistoryModal({ open, onClose, restaurant }) {
  const { t } = useTranslation();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && restaurant) {
      setLoading(true);
      superAdminAPI.getPlanHistory(restaurant.id)
        .then(data => setHistory(Array.isArray(data) ? data : []))
        .catch(() => setHistory([]))
        .finally(() => setLoading(false));
    }
  }, [open, restaurant]);

  if (!open || !restaurant) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center">
              <History size={18} className="text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">{t('superAdmin.planHistory')}</h3>
              <p className="text-xs text-gray-500">{restaurant.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-colors"><X size={18} className="text-gray-400" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="py-10 text-center"><Loader2 size={24} className="animate-spin text-gray-400 mx-auto" /></div>
          ) : history.length === 0 ? (
            <p className="text-sm text-gray-400 py-10 text-center">{t('superAdmin.noPlanChanges')}</p>
          ) : (
            <div className="space-y-3">
              {history.map((h, i) => (
                <div key={h.id || i} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
                  <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center border mt-0.5">
                    {(() => { const Icon = PLAN_META[h.plan]?.icon || Clock; return <Icon size={14} className="text-gray-500" />; })()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <PlanBadge plan={h.plan} />
                      {h.totalAmount > 0 && (
                        <span className="text-xs font-semibold text-gray-500">${h.totalAmount}</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {formatDate(h.startedAt)} {h.expiresAt ? ` -- ${formatDate(h.expiresAt)}` : ` -- ${t('superAdmin.neverExpires')}`}
                    </p>
                    {h.note && <p className="text-xs text-gray-400 mt-1 italic">"{h.note}"</p>}
                  </div>
                  <span className="text-[10px] text-gray-400 whitespace-nowrap">{formatDate(h.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl">
          <button onClick={onClose} className="w-full px-4 py-2.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">{t('common.close')}</button>
        </div>
      </div>
    </div>
  );
}

/* ── Staff Form Modal ─────────────────────────────────────────────────────── */
function StaffModal({ open, onClose, onSave, initial, saving, restaurantName }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', role: 'owner' });
  const [showPw, setShowPw] = useState(false);

  useEffect(() => {
    if (open) {
      if (initial) {
        setForm({ name: initial.name || '', email: initial.email || '', phone: initial.phone || '', password: '', role: initial.role || 'owner' });
      } else {
        setForm({ name: '', email: '', phone: '', password: '', role: 'owner' });
      }
      setShowPw(false);
    }
  }, [open, initial]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center">
              <UserPlus size={18} className="text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">{initial ? t('superAdmin.editStaff') : t('superAdmin.addStaff')}</h3>
              <p className="text-xs text-gray-500">{restaurantName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-colors"><X size={18} className="text-gray-400" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{t('admin.profile.fullName')}</label>
            <input className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-shadow"
              value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={t('superAdmin.staffNamePlaceholder')} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{t('common.email')}</label>
            <input className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-shadow"
              value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder={t('placeholders.egEmail', 'john@thebill.uz')} type="email" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{t('common.phone')}</label>
            <PhoneInput value={form.phone} onChange={(val) => setForm(f => ({ ...f, phone: val }))} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{initial ? t('superAdmin.newPasswordLabel') : t('superAdmin.passwordLabel')}</label>
            <div className="relative">
              <input className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none pr-10 transition-shadow"
                type={showPw ? 'text' : 'password'}
                value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                placeholder={initial ? t('superAdmin.keepCurrentPlaceholder') : t('superAdmin.minCharPlaceholder')} />
              <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{t('common.role')}</label>
            <select className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none bg-white transition-shadow"
              value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
              <option value="owner">{t('roles.owner')}</option>
              <option value="admin">{t('roles.admin')}</option>
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">{t('common.cancel')}</button>
          <button
            onClick={() => onSave(form)}
            disabled={saving || !form.name.trim() || !form.email.trim() || (!initial && !form.password)}
            className="px-5 py-2.5 text-sm font-semibold text-white bg-red-600 rounded-xl hover:bg-red-700 disabled:opacity-40 flex items-center gap-2 transition-colors shadow-sm"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {initial ? t('common.saveChanges') : t('superAdmin.addStaff')}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Confirm Dialog ───────────────────────────────────────────────────────── */
function ConfirmDialog({ open, title, message, onConfirm, onCancel, confirmLabel, danger }) {
  const { t } = useTranslation();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
        <div className={`w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center ${danger ? 'bg-red-100' : 'bg-amber-100'}`}>
          <AlertCircle size={28} className={danger ? 'text-red-500' : 'text-amber-500'} />
        </div>
        <h3 className="text-lg font-bold text-gray-900 mb-1">{title}</h3>
        <p className="text-sm text-gray-500 mb-6">{message}</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">{t('common.cancel')}</button>
          <button onClick={onConfirm}
            className={`flex-1 px-4 py-2.5 text-sm font-semibold text-white rounded-xl transition-colors shadow-sm ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-500 hover:bg-amber-600'}`}>
            {confirmLabel || t('common.confirm', 'Confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Staff Row ────────────────────────────────────────────────────────────── */
function StaffRow({ staff, onEdit, onDelete }) {
  return (
    <div className="flex items-center justify-between py-3 px-4 hover:bg-white rounded-xl transition-colors">
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold ${
          staff.role === 'owner' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
        }`}>
          {(staff.name || '?')[0].toUpperCase()}
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900">{staff.name}</p>
          <p className="text-xs text-gray-500">{staff.email}{staff.phone ? ` | ${staff.phone}` : ''}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${
          staff.role === 'owner' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
        }`}>{staff.role}</span>
        <StatusBadge active={staff.isActive !== false} />
        <button onClick={() => onEdit(staff)} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Edit3 size={14} /></button>
        <button onClick={() => onDelete(staff)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={14} /></button>
      </div>
    </div>
  );
}

/* ── Restaurant Card ──────────────────────────────────────────────────────── */
function RestaurantCard({ restaurant, onEdit, onDelete, onReactivate, onChangePlan, onViewHistory }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [staff, setStaff] = useState([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffModal, setStaffModal] = useState({ open: false, initial: null });
  const [staffSaving, setStaffSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);

  const loadStaff = useCallback(async () => {
    setStaffLoading(true);
    try {
      const data = await superAdminAPI.getStaff(restaurant.id);
      setStaff(Array.isArray(data) ? data : []);
    } catch { setStaff([]); }
    setStaffLoading(false);
  }, [restaurant.id]);

  const handleToggle = () => {
    if (!expanded) loadStaff();
    setExpanded(!expanded);
  };

  const handleStaffSave = async (form) => {
    setStaffSaving(true);
    try {
      if (staffModal.initial) {
        const data = { name: form.name, email: form.email, phone: form.phone, role: form.role };
        if (form.password) data.password = form.password;
        await superAdminAPI.updateStaff(staffModal.initial.id, data);
      } else {
        await superAdminAPI.createStaff(restaurant.id, form);
      }
      setStaffModal({ open: false, initial: null });
      loadStaff();
    } catch (err) {
      alert(err.error || t('superAdmin.failedToSaveStaff'));
    }
    setStaffSaving(false);
  };

  const handleStaffDelete = async () => {
    if (!confirmDel) return;
    try {
      await superAdminAPI.deleteStaff(confirmDel.id);
      setConfirmDel(null);
      loadStaff();
    } catch (err) {
      alert(err.error || t('superAdmin.failedToDeactivate'));
    }
  };

  const isActive = restaurant.isActive !== false;
  const ps = planStatus(restaurant, t);

  return (
    <div className={`bg-white rounded-2xl border-2 ${
      isActive ? 'border-gray-100' : 'border-red-200 bg-red-50/20'
    } shadow-sm transition-all hover:shadow-md`}>
      {/* Header */}
      <div className="px-6 py-5">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-lg font-bold shadow-sm ${
              isActive ? 'bg-gradient-to-br from-red-500 to-red-600 text-white' : 'bg-gray-200 text-gray-500'
            }`}>
              {(restaurant.name || 'R')[0]}
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h3 className="text-base font-bold text-gray-900">{restaurant.name}</h3>
                <StatusBadge active={isActive} />
              </div>
              <p className="text-xs text-gray-400 font-mono mt-0.5">{restaurant.slug}</p>
              <div className="flex items-center gap-3 mt-2">
                {restaurant.address && (
                  <span className="text-xs text-gray-500 flex items-center gap-1"><MapPin size={11} /> {restaurant.address}</span>
                )}
                {restaurant.phone && (
                  <span className="text-xs text-gray-500 flex items-center gap-1"><Phone size={11} /> {restaurant.phone}</span>
                )}
              </div>
            </div>
          </div>

          {/* Plan info */}
          <div className="text-right flex flex-col items-end gap-1.5">
            <PlanBadge plan={restaurant.plan || 'trial'} />
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              ps.color === 'green' ? 'bg-green-100 text-green-700' :
              ps.color === 'amber' ? 'bg-amber-100 text-amber-700' :
              ps.color === 'red' ? 'bg-red-100 text-red-700' :
              'bg-gray-100 text-gray-500'
            }`}>
              {ps.label}
            </span>
            {restaurant.planExpiresAt && (restaurant.plan || 'trial') !== 'vip' && (
              <span className="text-[10px] text-gray-400">{t('superAdmin.expiresPrefix')} {formatDate(restaurant.planExpiresAt)}</span>
            )}
          </div>
        </div>

        {/* Actions bar */}
        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-100">
          <button onClick={() => onEdit(restaurant)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors">
            <Edit3 size={13} /> {t('common.edit')}
          </button>
          {isActive ? (
            <button onClick={() => onDelete(restaurant)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-red-600 bg-red-50 rounded-xl hover:bg-red-100 transition-colors">
              <Trash2 size={13} /> {t('superAdmin.deactivateLabel')}
            </button>
          ) : (
            <button onClick={() => onReactivate(restaurant)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-green-600 bg-green-50 rounded-xl hover:bg-green-100 transition-colors">
              <RotateCcw size={13} /> {t('common.active')}
            </button>
          )}
          <button onClick={() => onChangePlan(restaurant)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-amber-600 bg-amber-50 rounded-xl hover:bg-amber-100 transition-colors">
            <DollarSign size={13} /> {t('superAdmin.changePlan')}
          </button>
          <button onClick={() => onViewHistory(restaurant)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-blue-600 bg-blue-50 rounded-xl hover:bg-blue-100 transition-colors">
            <History size={13} /> {t('superAdmin.planHistory')}
          </button>

          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-gray-400 bg-gray-100 px-2.5 py-1 rounded-lg font-medium">
              {t('superAdmin.staffCount', { count: restaurant.staffCount || 0 })}
            </span>
            <button onClick={handleToggle}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-indigo-600 bg-indigo-50 rounded-xl hover:bg-indigo-100 transition-colors">
              <Users size={13} /> {expanded ? t('superAdmin.hideStaff') : t('superAdmin.showStaff')}
              {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          </div>
        </div>
      </div>

      {/* Expanded staff section */}
      {expanded && (
        <div className="border-t-2 border-gray-100 bg-gray-50/70 px-6 py-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">{t('superAdmin.ownersAndAdmins')}</p>
            <button onClick={() => setStaffModal({ open: true, initial: null })}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors">
              <UserPlus size={13} /> {t('superAdmin.addStaff')}
            </button>
          </div>
          {staffLoading ? (
            <div className="py-8 text-center"><Loader2 size={22} className="animate-spin text-gray-400 mx-auto" /></div>
          ) : staff.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">{t('superAdmin.noOwnersYet')}</p>
          ) : (
            <div className="space-y-1">
              {staff.map(s => (
                <StaffRow key={s.id} staff={s}
                  onEdit={(s) => setStaffModal({ open: true, initial: s })}
                  onDelete={(s) => setConfirmDel(s)} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Staff modals */}
      <StaffModal
        open={staffModal.open}
        onClose={() => setStaffModal({ open: false, initial: null })}
        onSave={handleStaffSave}
        initial={staffModal.initial}
        saving={staffSaving}
        restaurantName={restaurant.name}
      />
      <ConfirmDialog
        open={!!confirmDel}
        title={t('superAdmin.deactivateStaff')}
        message={`${t('common.actionCannotBeUndone')} ${confirmDel?.name}`}
        confirmLabel={t('superAdmin.deactivateLabel')}
        danger
        onConfirm={handleStaffDelete}
        onCancel={() => setConfirmDel(null)}
      />
    </div>
  );
}

/* ── Main Page ────────────────────────────────────────────────────────────── */
export default function SuperAdminRestaurants() {
  const { t } = useTranslation();
  const [restaurants, setRestaurants] = useState([]);
  const [stats, setStats] = useState({ totalRestaurants: 0, activeRestaurants: 0, totalStaff: 0, expiredSubscriptions: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // all | active | inactive | expired
  const [modal, setModal] = useState({ open: false, initial: null });
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);
  const [planModal, setPlanModal] = useState({ open: false, restaurant: null });
  const [planSaving, setPlanSaving] = useState(false);
  const [historyModal, setHistoryModal] = useState({ open: false, restaurant: null });

  const load = useCallback(async () => {
    try {
      const [restData, statsData] = await Promise.all([
        superAdminAPI.getRestaurants(),
        superAdminAPI.getStats(),
      ]);
      setRestaurants(Array.isArray(restData) ? restData : []);
      setStats(statsData || {});
    } catch (err) {
      console.error('Load error:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (form) => {
    setSaving(true);
    try {
      if (modal.initial) {
        await superAdminAPI.updateRestaurant(modal.initial.id, form);
      } else {
        await superAdminAPI.createRestaurant(form);
      }
      setModal({ open: false, initial: null });
      load();
    } catch (err) {
      alert(err.error || t('superAdmin.failedToSaveRestaurant'));
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!confirmDel) return;
    try {
      await superAdminAPI.deleteRestaurant(confirmDel.id);
      setConfirmDel(null);
      load();
    } catch (err) {
      alert(err.error || t('superAdmin.failedToDeactivate'));
    }
  };

  const handleReactivate = async (r) => {
    try {
      await superAdminAPI.reactivateRestaurant(r.id);
      load();
    } catch (err) {
      alert(err.error || t('superAdmin.failedToReactivate'));
    }
  };

  const handlePlanSave = async (data) => {
    if (!planModal.restaurant) return;
    setPlanSaving(true);
    try {
      await superAdminAPI.updatePlan(planModal.restaurant.id, data);
      setPlanModal({ open: false, restaurant: null });
      load();
    } catch (err) {
      alert(err.error || t('superAdmin.failedToUpdatePlan'));
    }
    setPlanSaving(false);
  };

  const filtered = restaurants.filter(r => {
    const matchSearch = !search || r.name?.toLowerCase().includes(search.toLowerCase()) || r.slug?.toLowerCase().includes(search.toLowerCase());
    if (!matchSearch) return false;
    if (filter === 'active') return r.isActive !== false;
    if (filter === 'inactive') return r.isActive === false;
    if (filter === 'expired') {
      const ps = planStatus(r, t);
      return ps.status === 'expired';
    }
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={32} className="animate-spin text-red-500" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-50/50">
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-11 h-11 bg-gradient-to-br from-red-500 to-red-600 rounded-2xl flex items-center justify-center shadow-sm">
              <Shield size={22} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-gray-900">{t('nav.restaurants')}</h1>
              <p className="text-sm text-gray-500">{t('superAdmin.title')}</p>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { icon: Building2, value: stats.totalRestaurants || 0, label: t('superAdmin.totalLabel'), bg: 'bg-red-100', iconColor: 'text-red-600' },
            { icon: CheckCircle2, value: stats.activeRestaurants || 0, label: t('superAdmin.activeLabel'), bg: 'bg-green-100', iconColor: 'text-green-600' },
            { icon: Users, value: stats.totalStaff || 0, label: t('superAdmin.staffLabel'), bg: 'bg-blue-100', iconColor: 'text-blue-600' },
            { icon: AlertCircle, value: stats.expiredSubscriptions || 0, label: t('superAdmin.expiredLabel'), bg: 'bg-red-100', iconColor: 'text-red-500' },
          ].map((s, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3 shadow-sm">
              <div className={`w-10 h-10 ${s.bg} rounded-xl flex items-center justify-center`}>
                <s.icon size={20} className={s.iconColor} />
              </div>
              <div>
                <p className="text-2xl font-extrabold text-gray-900">{s.value}</p>
                <p className="text-xs text-gray-500 font-medium">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Search + Filter + Add */}
        <div className="flex items-center gap-3 mb-5">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-shadow"
              placeholder={t('superAdmin.searchPlaceholder')}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="flex bg-white border border-gray-200 rounded-xl overflow-hidden">
            {[
              { key: 'all', label: t('superAdmin.filterAll') },
              { key: 'active', label: t('superAdmin.filterActive') },
              { key: 'expired', label: t('superAdmin.filterExpired') },
              { key: 'inactive', label: t('superAdmin.filterInactive') },
            ].map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-3.5 py-2.5 text-xs font-semibold transition-colors ${
                  filter === f.key ? 'bg-red-600 text-white' : 'text-gray-500 hover:bg-gray-50'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setModal({ open: true, initial: null })}
            className="flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white text-sm font-semibold rounded-xl hover:bg-red-700 shadow-sm transition-colors"
          >
            <Plus size={16} /> {t('superAdmin.newRestaurant')}
          </button>
        </div>

        {/* Restaurant list */}
        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Building2 size={32} className="text-gray-300" />
            </div>
            <p className="text-sm font-medium text-gray-400">{t('common.noResults')}</p>
            <p className="text-xs text-gray-300 mt-1">{t('common.search')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map(r => (
              <RestaurantCard
                key={r.id}
                restaurant={r}
                onEdit={(r) => setModal({ open: true, initial: r })}
                onDelete={(r) => setConfirmDel(r)}
                onReactivate={handleReactivate}
                onChangePlan={(r) => setPlanModal({ open: true, restaurant: r })}
                onViewHistory={(r) => setHistoryModal({ open: true, restaurant: r })}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      <RestaurantModal
        open={modal.open}
        onClose={() => setModal({ open: false, initial: null })}
        onSave={handleSave}
        initial={modal.initial}
        saving={saving}
      />
      <PlanModal
        open={planModal.open}
        onClose={() => setPlanModal({ open: false, restaurant: null })}
        onSave={handlePlanSave}
        restaurant={planModal.restaurant}
        saving={planSaving}
      />
      <PlanHistoryModal
        open={historyModal.open}
        onClose={() => setHistoryModal({ open: false, restaurant: null })}
        restaurant={historyModal.restaurant}
      />
      <ConfirmDialog
        open={!!confirmDel}
        title={t('superAdmin.deactivateRestaurant')}
        message={`${t('common.actionCannotBeUndone')} ${confirmDel?.name}`}
        confirmLabel={t('superAdmin.deactivateLabel')}
        danger
        onConfirm={handleDelete}
        onCancel={() => setConfirmDel(null)}
      />
    </div>
  );
}

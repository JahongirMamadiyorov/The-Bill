import { useState } from 'react';
import { Shield, LogOut, User, Mail, Lock, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from '../../context/LanguageContext';

export default function SuperAdminProfile() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const [showSection, setShowSection] = useState(null);

  const initials = (user?.name || 'SA').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="bg-gradient-to-r from-red-600 to-red-700 rounded-2xl p-6 text-white mb-6 shadow-lg">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center text-xl font-bold border-2 border-white/30">
              {initials}
            </div>
            <div>
              <h1 className="text-xl font-extrabold">{user?.name || t('roles.superAdmin', 'Super Admin')}</h1>
              <div className="flex items-center gap-2 mt-1">
                <Shield size={14} className="text-white/70" />
                <span className="text-sm text-white/80 font-medium">{t('roles.super_admin')}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Info card */}
        <div className="bg-white rounded-xl border shadow-sm p-6 mb-4">
          <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-4">{t('superAdmin.accountInfo')}</h2>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-gray-100 rounded-lg flex items-center justify-center">
                <User size={16} className="text-gray-500" />
              </div>
              <div>
                <p className="text-xs text-gray-400 font-medium">{t('common.name')}</p>
                <p className="text-sm font-semibold text-gray-900">{user?.name || '-'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-gray-100 rounded-lg flex items-center justify-center">
                <Mail size={16} className="text-gray-500" />
              </div>
              <div>
                <p className="text-xs text-gray-400 font-medium">{t('common.email')}</p>
                <p className="text-sm font-semibold text-gray-900">{user?.email || '-'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-gray-100 rounded-lg flex items-center justify-center">
                <Shield size={16} className="text-gray-500" />
              </div>
              <div>
                <p className="text-xs text-gray-400 font-medium">{t('common.role')}</p>
                <p className="text-sm font-semibold text-gray-900">{t('roles.super_admin')}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Logout */}
        <button
          onClick={logout}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-red-200 rounded-xl text-red-600 font-bold hover:bg-red-50 transition-colors"
        >
          <LogOut size={18} />
          {t('admin.profile.signOut')}
        </button>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from '../../context/LanguageContext';
import { Eye, EyeOff, LogIn, UtensilsCrossed, ShieldOff, Phone as PhoneIcon, Languages } from 'lucide-react';

// Detect input type for hint + phone formatting
function detectType(input) {
  if (!input) return null;
  if (input.includes('@')) return 'email';
  if (/^\+?\d[\d\s\-()+]*$/.test(input.trim())) return 'phone';
  return 'username';
}

export default function Login() {
  const { login, loading } = useAuth();
  const { t, lang, switchLang } = useTranslation();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [expired, setExpired] = useState(null); // { plan, expiredAt }

  const idType = detectType(identifier);
  const isPhone = idType === 'phone';

  // Format phone digits as XX XXX XX XX for display
  const formatPhoneLocal = (raw) => {
    const digits = raw.replace(/\D/g, '');
    const local = digits.startsWith('998') ? digits.slice(3) : digits;
    const d = local.slice(0, 9);
    let out = '';
    if (d.length > 0) out += d.slice(0, 2);
    if (d.length > 2) out += ' ' + d.slice(2, 5);
    if (d.length > 5) out += ' ' + d.slice(5, 7);
    if (d.length > 7) out += ' ' + d.slice(7, 9);
    return out;
  };

  // When phone detected, store raw digits but display formatted
  const [rawPhone, setRawPhone] = useState('');

  const handleIdentifierChange = (val) => {
    const type = detectType(val);
    if (type === 'phone') {
      const digits = val.replace(/\D/g, '');
      const local = digits.startsWith('998') ? digits.slice(3) : digits;
      setRawPhone(local.slice(0, 9));
      setIdentifier(formatPhoneLocal(val));
    } else {
      setRawPhone('');
      setIdentifier(val);
    }
  };

  // Build the actual identifier to send to backend
  const getLoginIdentifier = () => {
    if (isPhone) {
      return '+998' + rawPhone;
    }
    return identifier;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setExpired(null);
    try {
      const user = await login(getLoginIdentifier(), password);
      const roleRoutes = { super_admin: '/super-admin', owner: '/owner', admin: '/admin', cashier: '/cashier', waitress: '/waitress', kitchen: '/kitchen' };
      navigate(roleRoutes[user.role] || '/admin');
    } catch (err) {
      const data = err.response?.data || err;
      if (data?.code === 'SUBSCRIPTION_EXPIRED') {
        setExpired({ plan: data.plan, expiredAt: data.expiredAt || data.expired_at });
      } else {
        setError(data?.error || t('login.loginFailed'));
      }
    }
  };

  // ── Subscription expired screen ──
  if (expired) {
    const planLabels = { trial: t('subscription.planTrial'), monthly: t('subscription.planMonthly'), '6month': t('subscription.plan6month'), '12month': t('subscription.plan12month') };
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-600 via-red-700 to-gray-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-2xl mb-4">
            <ShieldOff className="text-red-600" size={32} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('subscription.expired')}</h1>
          <p className="text-gray-500 text-sm mb-6">
            {t('subscription.expiredMessage', {
              plan: planLabels[expired.plan] || expired.plan,
              date: expired.expiredAt ? ` ${new Date(expired.expiredAt).toLocaleDateString('uz-UZ', { day: '2-digit', month: 'short', year: 'numeric' })}` : ''
            })}
          </p>
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
            <div className="flex items-center justify-center gap-2 text-red-700 mb-2">
              <PhoneIcon size={16} />
              <span className="font-semibold text-sm">{t('subscription.contactAdmin')}</span>
            </div>
            <p className="text-xs text-red-600">
              {t('subscription.contactMessage')}
            </p>
          </div>
          <button
            onClick={() => { setExpired(null); setIdentifier(''); setPassword(''); }}
            className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 rounded-xl transition-colors text-sm"
          >
            {t('subscription.backToLogin')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 via-blue-600 to-cyan-500 flex items-center justify-center p-4 relative">
      {/* Language switcher (top-right) */}
      <div className="absolute top-4 right-4 flex items-center gap-1 bg-white/15 backdrop-blur-sm rounded-lg p-1">
        <Languages size={16} className="text-white ml-1" />
        <button
          onClick={() => switchLang('uz')}
          className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all ${
            lang === 'uz' ? 'bg-white text-purple-700 shadow' : 'text-white hover:bg-white/15'
          }`}
        >
          UZ
        </button>
        <button
          onClick={() => switchLang('en')}
          className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all ${
            lang === 'en' ? 'bg-white text-purple-700 shadow' : 'text-white hover:bg-white/15'
          }`}
        >
          EN
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-purple-100 rounded-2xl mb-4">
            <UtensilsCrossed className="text-purple-600" size={32} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{t('login.title')}</h1>
          <p className="text-gray-500 text-sm mt-1">{t('login.subtitle')}</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('login.identifierLabel')}</label>
            <div className="relative flex">
              {isPhone && (
                <div className="flex items-center gap-1.5 px-3 bg-gray-100 border border-r-0 border-gray-300 rounded-l-xl text-sm font-semibold text-gray-700 select-none">
                  <span>UZ</span>
                  <span>+998</span>
                </div>
              )}
              <input
                type="text"
                value={identifier}
                onChange={e => handleIdentifierChange(e.target.value)}
                className={`w-full px-4 py-3 border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none text-sm ${isPhone ? 'rounded-r-xl' : 'rounded-xl'}`}
                placeholder={t('login.identifierPlaceholder')}
                required
              />
            </div>
            {idType && (
              <p className={`text-xs mt-1.5 font-medium ${isPhone ? 'text-blue-600' : 'text-gray-400'}`}>
                {idType === 'phone' ? t('login.signingInWithPhone') : idType === 'email' ? t('login.signingInWithEmail') : t('login.signingInWithUsername')}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('login.passwordLabel')}</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none text-sm pr-12"
                placeholder={t('login.passwordPlaceholder')}
                required
              />
              <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <><LogIn size={18} /> {t('login.signIn')}</>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
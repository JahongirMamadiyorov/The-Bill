import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Eye, EyeOff, LogIn, UtensilsCrossed } from 'lucide-react';

// Detect input type for hint + phone formatting
function detectType(input) {
  if (!input) return null;
  if (input.includes('@')) return 'email';
  if (/^\+?\d[\d\s\-()+]*$/.test(input.trim())) return 'phone';
  return 'username';
}

export default function Login() {
  const { login, loading } = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');

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
    try {
      const user = await login(getLoginIdentifier(), password);
      const roleRoutes = { owner: '/owner', admin: '/admin', cashier: '/cashier', waitress: '/waitress', kitchen: '/kitchen' };
      navigate(roleRoutes[user.role] || '/admin');
    } catch (err) {
      setError(err.response?.data?.error || err?.error || 'Login failed. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 via-blue-600 to-cyan-500 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-purple-100 rounded-2xl mb-4">
            <UtensilsCrossed className="text-purple-600" size={32} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">The Bill</h1>
          <p className="text-gray-500 text-sm mt-1">Restaurant Management System</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email, Phone, or Username</label>
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
                placeholder="Enter your credentials"
                required
              />
            </div>
            {idType && (
              <p className={`text-xs mt-1.5 font-medium ${isPhone ? 'text-blue-600' : 'text-gray-400'}`}>
                {idType === 'phone' ? 'Signing in with phone number' : idType === 'email' ? 'Signing in with email' : 'Signing in with username'}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none text-sm pr-12"
                placeholder="Enter your password"
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
              <><LogIn size={18} /> Sign In</>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
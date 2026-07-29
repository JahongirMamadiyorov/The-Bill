import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { t } from '../lib/i18n.js';

// This is the one screen that runs before any role is known, so it can't
// hook into either of the app's two existing translation systems the way
// every other screen does: the Admin panel uses a context Provider
// (LanguageContext.jsx) that only mounts inside AdminPanel.jsx, and the
// Cashier POS keeps its own `lang` state inside PosShell.jsx — neither
// exists yet at the login screen. Reuses `lib/i18n.js`'s plain `t(str, lang)`
// dictionary lookup directly instead (same one PosShell/MenuScreen/etc. use),
// with its own local `lang` state.
//
// Language persistence: `pos.lang` ('EN'/'UZ') is PosShell's own key,
// `lang` ('en'/'uz') is the Admin panel's — the two are deliberately
// independent everywhere else in the app (see LanguageContext.jsx's header
// comment), but at LOGIN specifically neither role is known yet, so picking
// a language here should carry into whichever shell the user lands in next.
// `switchLang` below writes both keys on every toggle so that's true
// regardless of which role logs in; `initialLang()` reads whichever key
// already has a value so a returning user sees their last choice instead of
// always restarting at the default.
function initialLang() {
  const posLang = localStorage.getItem('pos.lang');
  if (posLang === 'EN' || posLang === 'UZ') return posLang;
  const adminLang = localStorage.getItem('lang');
  if (adminLang === 'en') return 'EN';
  if (adminLang === 'uz') return 'UZ';
  return 'UZ';
}

export default function Login({ onLoggedIn }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword]     = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError]           = useState('');
  const [loading, setLoading]       = useState(false);
  const [lang, setLangState]        = useState(initialLang);

  const switchLang = (l) => {
    setLangState(l);
    localStorage.setItem('pos.lang', l);
    localStorage.setItem('lang', l.toLowerCase());
  };

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!identifier || !password) {
      setError(t('Enter your email/phone/username and password.', lang));
      return;
    }
    setLoading(true);
    try {
      const res = await window.electronAPI.login(identifier, password);
      if (!res.ok) {
        setError(res.error || t('Login failed.', lang));
        return;
      }
      onLoggedIn({ user: res.user, restaurant: res.restaurant });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.langToggle}>
        {['UZ', 'EN'].map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => switchLang(l)}
            style={{
              ...styles.langBtn,
              background: lang === l ? '#7b2ff7' : 'transparent',
              color: lang === l ? '#fff' : '#666',
            }}
          >
            {l}
          </button>
        ))}
      </div>

      <form style={styles.card} onSubmit={handleSubmit}>
        <h1 style={styles.title}>The Bill</h1>
        <p style={styles.subtitle}>{t('Restaurant Management System — POS', lang)}</p>

        {error && <div style={styles.error}>{error}</div>}

        <label style={styles.label}>{t('Email, Phone, or Username', lang)}</label>
        <input
          style={styles.input}
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          autoFocus
        />

        <label style={styles.label}>{t('Password', lang)}</label>
        <div style={styles.passwordWrap}>
          <input
            style={{ ...styles.input, paddingRight: 40 }}
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            title={t(showPassword ? 'Hide password' : 'Show password', lang)}
            style={styles.eyeBtn}
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>

        <button style={styles.button} type="submit" disabled={loading}>
          {loading ? t('Signing in…', lang) : t('Sign In', lang)}
        </button>
      </form>
    </div>
  );
}

const styles = {
  page: {
    height: '100%',
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #7b2ff7, #38b6ff)',
  },
  langToggle: {
    position: 'absolute',
    top: 20,
    right: 20,
    display: 'flex',
    gap: 2,
    background: 'rgba(255,255,255,0.85)',
    borderRadius: 10,
    padding: 3,
  },
  langBtn: {
    padding: '6px 14px',
    borderRadius: 8,
    border: 'none',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'background .15s, color .15s',
  },
  card: {
    width: 380,
    background: '#fff',
    borderRadius: 16,
    padding: '32px 28px',
    boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
  },
  title:    { fontSize: 26, fontWeight: 700, textAlign: 'center' },
  subtitle: { fontSize: 13, color: '#777', textAlign: 'center', marginBottom: 20 },
  label:    { display: 'block', fontSize: 13, fontWeight: 600, marginTop: 14, marginBottom: 4 },
  input: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid #ddd',
    fontSize: 15,
    boxSizing: 'border-box',
  },
  passwordWrap: {
    position: 'relative',
  },
  eyeBtn: {
    position: 'absolute',
    right: 10,
    top: '50%',
    transform: 'translateY(-50%)',
    border: 'none',
    background: 'transparent',
    color: '#888',
    cursor: 'pointer',
    padding: 4,
    display: 'flex',
    alignItems: 'center',
  },
  button: {
    width: '100%',
    marginTop: 22,
    padding: '12px',
    borderRadius: 10,
    border: 'none',
    background: '#7b2ff7',
    color: '#fff',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
  },
  error: {
    background: '#fde8e8',
    color: '#c0392b',
    padding: '8px 12px',
    borderRadius: 8,
    fontSize: 13,
    marginBottom: 8,
  },
};

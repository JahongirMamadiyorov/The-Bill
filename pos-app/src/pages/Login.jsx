import { useState } from 'react';

export default function Login({ onLoggedIn }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword]     = useState('');
  const [error, setError]           = useState('');
  const [loading, setLoading]       = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!identifier || !password) {
      setError('Enter your email/phone/username and password.');
      return;
    }
    setLoading(true);
    try {
      const res = await window.electronAPI.login(identifier, password);
      if (!res.ok) {
        setError(res.error || 'Login failed.');
        return;
      }
      onLoggedIn({ user: res.user, restaurant: res.restaurant });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.page}>
      <form style={styles.card} onSubmit={handleSubmit}>
        <h1 style={styles.title}>The Bill</h1>
        <p style={styles.subtitle}>Restaurant Management System — POS</p>

        {error && <div style={styles.error}>{error}</div>}

        <label style={styles.label}>Email, Phone, or Username</label>
        <input
          style={styles.input}
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          autoFocus
        />

        <label style={styles.label}>Password</label>
        <input
          style={styles.input}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button style={styles.button} type="submit" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign In'}
        </button>
      </form>
    </div>
  );
}

const styles = {
  page: {
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #7b2ff7, #38b6ff)',
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

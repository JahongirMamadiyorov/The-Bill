import { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
  });
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [restaurant, setRestaurant] = useState(() => {
    try { return JSON.parse(localStorage.getItem('restaurant')); } catch { return null; }
  });
  const [loading, setLoading] = useState(false);

  const login = async (identifier, password) => {
    setLoading(true);
    try {
      const res = await authAPI.login(identifier, password);
      const { token: t, user: u, restaurant: r } = res;
      localStorage.setItem('token', t);
      localStorage.setItem('user', JSON.stringify(u));
      if (r) localStorage.setItem('restaurant', JSON.stringify(r));
      setToken(t);
      setUser(u);
      if (r) setRestaurant(r);
      return u;
    } finally { setLoading(false); }
  };

  // Update user state + localStorage (for profile edits, etc.)
  const updateUser = (updates) => {
    setUser((prev) => {
      const merged = { ...prev, ...updates };
      localStorage.setItem('user', JSON.stringify(merged));
      return merged;
    });
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('restaurant');
    setToken(null);
    setUser(null);
    setRestaurant(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, restaurant, login, logout, updateUser, loading, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

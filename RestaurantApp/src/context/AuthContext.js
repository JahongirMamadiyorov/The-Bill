import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authAPI } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,       setUser]       = useState(null);
  const [token,      setToken]      = useState(null);
  const [restaurant, setRestaurant] = useState(null);
  const [loading,    setLoading]    = useState(true);

  // On mount: restore saved session
  useEffect(() => {
    (async () => {
      try {
        const savedToken      = await AsyncStorage.getItem('token');
        const savedUser       = await AsyncStorage.getItem('user');
        const savedRestaurant = await AsyncStorage.getItem('restaurant');
        if (savedToken && savedUser) {
          setToken(savedToken);
          setUser(JSON.parse(savedUser));
          if (savedRestaurant) setRestaurant(JSON.parse(savedRestaurant));
        }
      } catch (_) {}
      setLoading(false);
    })();
  }, []);

  async function login(identifier, password) {
    const res = await authAPI.login(identifier, password);
    const { token: t, user: u, restaurant: r } = res.data;
    await AsyncStorage.setItem('token', t);
    await AsyncStorage.setItem('user',  JSON.stringify(u));
    if (r) await AsyncStorage.setItem('restaurant', JSON.stringify(r));
    setToken(t);
    setUser(u);
    if (r) setRestaurant(r);
    return u;
  }

  async function logout() {
    await AsyncStorage.multiRemove(['token', 'user', 'restaurant']);
    setToken(null);
    setUser(null);
    setRestaurant(null);
  }

  // Update user fields in context + AsyncStorage (after profile edits)
  async function updateUser(updates) {
    const updated = { ...user, ...updates };
    setUser(updated);
    try { await AsyncStorage.setItem('user', JSON.stringify(updated)); } catch (_) {}
  }

  return (
    <AuthContext.Provider value={{ user, token, restaurant, loading, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

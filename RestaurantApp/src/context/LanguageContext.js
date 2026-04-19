import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import en from '../i18n/en.json';
import uz from '../i18n/uz.json';

const LANGS = { en, uz };
const STORAGE_KEY = 'lang';
const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState('uz');

  // Load saved language preference asynchronously
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (saved && LANGS[saved]) {
        setLang(saved);
      }
    });
  }, []);

  const switchLang = useCallback((l) => {
    setLang(l);
    AsyncStorage.setItem(STORAGE_KEY, l);
  }, []);

  // t('admin.dashboard.title')  ->  looks up LANGS[lang].admin.dashboard.title
  // t('hello', { name: 'Ali' }) ->  replaces {name} with Ali
  const t = useCallback((key, params) => {
    const keys = key.split('.');
    let val = LANGS[lang];
    for (const k of keys) {
      if (val == null) break;
      val = val[k];
    }
    // Fallback to English if missing
    if (val == null) {
      val = LANGS.en;
      for (const k of keys) {
        if (val == null) break;
        val = val[k];
      }
    }
    // Still missing -- return the key itself
    if (val == null) return key;
    // If it's not a string, return as-is (arrays, objects)
    if (typeof val !== 'string') return val;
    // Interpolate {param}
    if (params) {
      return val.replace(/\{(\w+)\}/g, (_, p) => (params[p] != null ? params[p] : `{${p}}`));
    }
    return val;
  }, [lang]);

  return (
    <LanguageContext.Provider value={{ lang, switchLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useTranslation = () => {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useTranslation must be inside LanguageProvider');
  return ctx;
};

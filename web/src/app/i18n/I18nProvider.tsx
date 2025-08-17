'use client';
import { createContext, useEffect, useState, useCallback } from 'react';
import de from './de.json';
import en from './en.json';

const translations = { de, en };

type Language = 'de' | 'en';

type TranslationValue = string | { [key: string]: TranslationValue };

type I18nContextType = {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: string) => string;
};

export const I18nContext = createContext<I18nContextType | undefined>(
  undefined,
);

export const I18nProvider = ({ children }: { children: React.ReactNode }) => {
  const [lang, setLang] = useState<Language>('de');

  useEffect(() => {
    const browserLang = navigator.language.split('-')[0];
    if (browserLang in translations) {
      setLang(browserLang as Language);
    }
  }, []);

  const t = useCallback(
    (key: string) => {
      const keys = key.split('.');
      let value: TranslationValue = translations[lang];
      for (const k of keys) {
        if (typeof value === 'object' && value !== null && k in value) {
          const newValue: TranslationValue = value[k];
          if (typeof newValue === 'string') {
            value = newValue;
          } else if (typeof newValue === 'object' && newValue !== null) {
            value = newValue;
          } else {
            return key;
          }
        } else {
          return key;
        }
      }
      return typeof value === 'string' ? value : key;
    },
    [lang],
  );

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
};

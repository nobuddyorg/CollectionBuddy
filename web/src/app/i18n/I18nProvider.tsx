'use client';
import { createContext, useEffect, useState, useCallback, useRef } from 'react';
import de from './de.json';
import en from './en.json';

const translations = { de, en };

type Language = 'de' | 'en';

type TranslationValue = string | { [key: string]: TranslationValue };

type FlattenKeys<T, Prefix extends string = ''> = T extends string
  ? Prefix
  : {
      [K in keyof T & string]: FlattenKeys<
        T[K],
        `${Prefix}${Prefix extends '' ? '' : '.'}${K}`
      >;
    }[keyof T & string];

export type TranslationKey = FlattenKeys<typeof en>;

type I18nContextType = {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: TranslationKey) => string;
};

export const I18nContext = createContext<I18nContextType | undefined>(
  undefined,
);

export const I18nProvider = ({ children }: { children: React.ReactNode }) => {
  const [lang, setLang] = useState<Language>('de');
  // t reads lang through this ref instead of depending on it directly, so
  // its identity stays stable across the language change that happens on
  // mount for any non-German browser. Otherwise every callback/effect that
  // lists t (or something derived from it) as a dependency -- category
  // loading, item creation -- re-fires once right after mount.
  const langRef = useRef(lang);
  langRef.current = lang;

  useEffect(() => {
    const browserLang = navigator.language.split('-')[0];
    if (browserLang in translations) {
      setLang(browserLang as Language);
    }
  }, []);

  const t = useCallback((key: TranslationKey) => {
    const keys = key.split('.');
    let value: TranslationValue = translations[langRef.current];
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
  }, []);

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
};

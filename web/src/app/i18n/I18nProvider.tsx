"use client";
import {
  createContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import de from "../locales/de.json";
import en from "../locales/en.json";

const translations = { de, en };

type Language = "de" | "en";

type I18nContextType = {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: string) => string;
};

export const I18nContext = createContext<I18nContextType | undefined>(
  undefined
);

export const I18nProvider = ({ children }: { children: React.ReactNode }) => {
  const [lang, setLang] = useState<Language>("de");

  useEffect(() => {
    const browserLang = navigator.language.split("-")[0];
    if (browserLang in translations) {
      setLang(browserLang as Language);
    }
  }, []);

  const t = useCallback(
    (key: string) => {
      const keys = key.split(".");

      let value: any = translations[lang];
      for (const k of keys) {
        if (value && typeof value === "object" && k in value) {
          value = value[k];
        } else {
          return key;
        }
      }
      return value;
    },
    [lang]
  );

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
};

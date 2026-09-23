'use client';
import {
  createContext,
  useEffect,
  useLayoutEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
} from 'react';
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

// undefined on any miss (unknown segment, or a sub-object), so callers decide what a miss means.
export function resolveTranslationKey(
  dictionary: TranslationValue,
  key: string,
): string | undefined {
  const value = key.split('.').reduce<TranslationValue | undefined>(
    (current, segment) =>
      typeof current === 'object' &&
      // eslint-disable-next-line sonarjs/different-types-comparison -- a translation JSON can carry a literal null the type has not seen
      current !== null &&
      Object.hasOwn(current, segment)
        ? current[segment]
        : undefined,
    dictionary,
  );
  return typeof value === 'string' ? value : undefined;
}

type I18nContextType = {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: TranslationKey) => string;
  /** Picks `${baseKey}_one` by the locale's plural rule (German and English disagree), else `baseKey`. */
  tCount: (baseKey: TranslationKey, count: number) => string;
};

export const I18nContext = createContext<I18nContextType | undefined>(
  undefined,
);

const LANGUAGE_STORAGE_KEY = 'lang';

function detectLanguage(): Language {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored && stored in translations) return stored as Language;
    const browserLanguage = navigator.language.split('-')[0];
    if (browserLanguage in translations) return browserLanguage as Language;
  } catch {
    // localStorage can throw (private browsing); falls through to the 'en' default.
  }
  return 'en';
}

export const I18nProvider = ({ children }: { children: React.ReactNode }) => {
  // Starts at 'de' to match the prerendered markup; the layout effect corrects it before paint.
  const [lang, setLang] = useState<Language>('de');
  // t reads lang through this ref so its identity survives a language change.
  const languageRef = useRef(lang);
  // eslint-disable-next-line react-hooks/refs -- written during render so t never reads a stale lang in this render
  languageRef.current = lang;

  useLayoutEffect(() => {
    setLang(detectLanguage());
  }, []);

  const setLangAndPersist = useCallback((next: Language) => {
    setLang(next);
    localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
  }, []);

  // Keeps <html lang> and the meta description with the language, or screen readers use the wrong phonetics.
  useEffect(() => {
    document.documentElement.lang = lang;
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute(
        'content',
        resolveTranslationKey(translations[lang], 'page.footer') ?? '',
      );
  }, [lang]);

  const t = useCallback(
    (key: TranslationKey) =>
      resolveTranslationKey(translations[languageRef.current], key) ?? key,
    [],
  );

  const tCount = useCallback((baseKey: TranslationKey, count: number) => {
    const dictionary = translations[languageRef.current];
    const category = new Intl.PluralRules(languageRef.current).select(count);
    const template =
      (category === 'one'
        ? resolveTranslationKey(dictionary, `${baseKey}_one`)
        : undefined) ??
      resolveTranslationKey(dictionary, baseKey) ??
      baseKey;
    return template.replace('{count}', String(count));
  }, []);

  const value = useMemo(
    () => ({ lang, setLang: setLangAndPersist, t, tCount }),
    [lang, setLangAndPersist, t, tCount],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

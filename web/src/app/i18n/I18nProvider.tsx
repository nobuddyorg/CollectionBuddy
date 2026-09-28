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

export type TranslationValues = Record<string, string | number>;

// A replacer function, never a replacement string: user text such as "US$$" or "$'" must land verbatim.
export function interpolate(
  template: string,
  values: TranslationValues,
): string {
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : placeholder,
  );
}

/** Each number in the format's digit grouping (1.000 in German, 1,000 in English); text as given. */
export function formatNumbers(
  values: TranslationValues,
  numberFormat: Intl.NumberFormat,
): TranslationValues {
  return Object.fromEntries(
    Object.entries(values).map(([name, value]) => [
      name,
      typeof value === 'number' ? numberFormat.format(value) : value,
    ]),
  );
}

/** Fills each `{name}` placeholder the template holds from `values`, numbers in the formatting locale. */
export type Translate = (
  key: TranslationKey,
  values?: TranslationValues,
) => string;

type I18nContextType = {
  language: Language;
  /** What dates and numbers are formatted in: the app language, in the browser's own regional form of it when it has one. */
  locale: string;
  setLanguage: (language: Language) => void;
  t: Translate;
  /** Picks `${baseKey}_one` when the locale's plural rule says 'one', else `baseKey`. */
  tCount: (
    baseKey: TranslationKey,
    values: TranslationValues & { count: number },
  ) => string;
};

export const I18nContext = createContext<I18nContextType | undefined>(
  undefined,
);

const LANGUAGE_STORAGE_KEY = 'lang';

function isLanguage(value: string | null): value is Language {
  return value === 'de' || value === 'en';
}

/** A stored choice, else the browser's language, else German; `LANG_INIT_SCRIPT` in layout.tsx decides the same way. */
export function pickLanguage(
  stored: string | null,
  browserLocale: string,
): Language {
  if (isLanguage(stored)) return stored;
  const browserLanguage = browserLocale.split('-')[0];
  return isLanguage(browserLanguage) ? browserLanguage : 'de';
}

/** The first browser locale in `language` (en-GB keeps 31/12/2099), else the bare language. */
export function formattingLocale(
  language: Language,
  browserLocales: readonly string[],
): string {
  return (
    browserLocales.find((locale) => locale.split('-')[0] === language) ??
    language
  );
}

export function detectLanguage(): Language {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  } catch {
    // localStorage can throw (private browsing); the browser language still decides.
  }
  return pickLanguage(stored, navigator.language);
}

export const I18nProvider = ({ children }: { children: React.ReactNode }) => {
  // Starts at 'de' to match the prerendered markup; the layout effect corrects it before paint.
  const [language, setLanguage] = useState<Language>('de');
  // t reads language through this ref so its identity survives a language change.
  const languageRef = useRef(language);
  // eslint-disable-next-line react-hooks/refs -- written during render so t never reads a stale language in this render
  languageRef.current = language;

  // Prerendered markup holds no date and no number past 999, so the build machine's navigator cannot cause a hydration mismatch.
  const locale = useMemo(
    () => formattingLocale(language, navigator.languages),
    [language],
  );
  // Built once per language: t runs on every render, and building a format costs more than using one.
  const numberFormat = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const numberFormatRef = useRef(numberFormat);
  // eslint-disable-next-line react-hooks/refs -- written during render, as languageRef, so t formats numbers for this render's language
  numberFormatRef.current = numberFormat;

  useLayoutEffect(() => {
    setLanguage(detectLanguage());
  }, []);

  const setLanguageAndPersist = useCallback((next: Language) => {
    setLanguage(next);
    localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
  }, []);

  // Keeps <html lang> and the meta description with the language, or screen readers use the wrong phonetics.
  useEffect(() => {
    document.documentElement.lang = language;
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute(
        'content',
        resolveTranslationKey(translations[language], 'page.footer') ?? '',
      );
  }, [language]);

  const t = useCallback(
    (key: TranslationKey, values: TranslationValues = {}) =>
      interpolate(
        resolveTranslationKey(translations[languageRef.current], key) ?? key,
        formatNumbers(values, numberFormatRef.current),
      ),
    [],
  );

  const tCount = useCallback<I18nContextType['tCount']>((baseKey, values) => {
    const dictionary = translations[languageRef.current];
    const category = new Intl.PluralRules(languageRef.current).select(
      values.count,
    );
    const template =
      (category === 'one'
        ? resolveTranslationKey(dictionary, `${baseKey}_one`)
        : undefined) ??
      resolveTranslationKey(dictionary, baseKey) ??
      baseKey;
    return interpolate(
      template,
      formatNumbers(values, numberFormatRef.current),
    );
  }, []);

  const value = useMemo(
    () => ({ language, locale, setLanguage: setLanguageAndPersist, t, tCount }),
    [language, locale, setLanguageAndPersist, t, tCount],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

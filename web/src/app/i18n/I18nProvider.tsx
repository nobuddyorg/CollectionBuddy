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

/* v8 ignore start -- only used by the ignored I18nProvider below. */
// Stryker disable all: only used by the ignored I18nProvider below.
const translations = { de, en };
// Stryker restore all
/* v8 ignore stop */

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

// Returns undefined on any miss -- unknown segment, or a sub-object
// instead of a string -- rather than the key itself, so callers decide
// what a miss means.
export function resolveTranslationKey(
  dict: TranslationValue,
  key: string,
): string | undefined {
  const keys = key.split('.');
  let value: TranslationValue = dict;
  for (const k of keys) {
    if (typeof value === 'object' && value !== null && k in value) {
      value = value[k];
    } else {
      return undefined;
    }
  }
  return typeof value === 'string' ? value : undefined;
}

type I18nContextType = {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: TranslationKey) => string;
  /** Like `t`, but picks `${baseKey}_one` vs `baseKey` by the locale's
   *  plural rule, not a naive `count === 1`, since German and English
   *  disagree on it. Falls back to `baseKey` if no `_one` variant exists. */
  tCount: (baseKey: TranslationKey, count: number) => string;
};

export const I18nContext = createContext<I18nContextType | undefined>(
  undefined,
);

/* v8 ignore start -- provider internals (localStorage, DOM, navigator);
 * resolveTranslationKey above is what's gated and mutation-tested. */
// Stryker disable all: provider internals aren't covered by tests, only
// resolveTranslationKey above is -- mutants in here would only be noise.
const LANG_STORAGE_KEY = 'lang';

function detectLang(): Language {
  try {
    const stored = localStorage.getItem(LANG_STORAGE_KEY);
    if (stored && stored in translations) return stored as Language;
    const browserLang = navigator.language.split('-')[0];
    if (browserLang in translations) return browserLang as Language;
  } catch {
    // localStorage can throw (private browsing, disabled storage); falls
    // through to the 'en' default below, same as a stored-language miss.
  }
  return 'en';
}

// A no-op on the server: Next still executes this once during the static
// export's prerender, where useLayoutEffect would otherwise warn.
const useIsomorphicLayoutEffect =
  typeof window === 'undefined' ? useEffect : useLayoutEffect;

export const I18nProvider = ({ children }: { children: React.ReactNode }) => {
  // Must start at 'de' to match the static export's prerendered markup --
  // seeding from detectLang() directly causes a hydration mismatch on the
  // first client render. useIsomorphicLayoutEffect below corrects it
  // before the next paint.
  const [lang, setLang] = useState<Language>('de');
  // t reads lang through this ref, not directly, so its identity stays
  // stable across a language change -- otherwise every callback/effect
  // depending on it re-fires whenever someone switches language.
  const langRef = useRef(lang);
  // Written synchronously during render, not in an effect, so `t` never
  // reads a stale `lang` during that same render cycle.
  // eslint-disable-next-line react-hooks/refs
  langRef.current = lang;

  useIsomorphicLayoutEffect(() => {
    setLang(detectLang());
  }, []);

  const setLangAndPersist = useCallback((next: Language) => {
    setLang(next);
    localStorage.setItem(LANG_STORAGE_KEY, next);
  }, []);

  // Keeps <html lang> and the meta description in sync with the active
  // language -- otherwise screen readers use the wrong phonetics and
  // browsers offer to "translate" an already-matching page.
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
      resolveTranslationKey(translations[langRef.current], key) ?? key,
    [],
  );

  const tCount = useCallback((baseKey: TranslationKey, count: number) => {
    const dict = translations[langRef.current];
    const category = new Intl.PluralRules(langRef.current).select(count);
    const template =
      (category === 'one'
        ? resolveTranslationKey(dict, `${baseKey}_one`)
        : undefined) ??
      resolveTranslationKey(dict, baseKey) ??
      baseKey;
    return template.replace('{count}', String(count));
  }, []);

  const value = useMemo(
    () => ({ lang, setLang: setLangAndPersist, t, tCount }),
    [lang, setLangAndPersist, t, tCount],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};
// Stryker restore all
/* v8 ignore stop */

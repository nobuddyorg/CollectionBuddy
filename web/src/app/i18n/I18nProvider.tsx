'use client';
import {
  createContext,
  useEffect,
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

// Resolves a dotted key path against a translation tree. Returns
// undefined on any miss (unknown segment, or the path bottoms out on a
// sub-object instead of a string) rather than falling back to the key
// itself, so callers can decide what a miss means.
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
  /** Like `t`, but for a `{count}` string that has to agree with `count`
   *  grammatically -- "1 tag" is a different key (`${baseKey}_one`) from
   *  "2 tags" (`baseKey` itself), and which one applies isn't just "count
   *  === 1" once German and English disagree on a locale's plural rule.
   *  Falls back to `baseKey` for any category without its own `_one`
   *  variant (German's invariant "1 Treffer"/"2 Treffer", e.g.). */
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

export const I18nProvider = ({ children }: { children: React.ReactNode }) => {
  const [lang, setLang] = useState<Language>('de');
  // t reads lang through this ref instead of depending on it directly, so
  // its identity stays stable across the language change that happens on
  // mount for any non-German browser. Otherwise every callback/effect that
  // lists t (or something derived from it) as a dependency -- category
  // loading, item creation -- re-fires once right after mount.
  const langRef = useRef(lang);
  // Written synchronously during render (not in an effect) so `t`, called
  // by consumers during their own render, never reads a stale `lang` for
  // the one render cycle before an effect would otherwise have fired.
  // eslint-disable-next-line react-hooks/refs
  langRef.current = lang;

  useEffect(() => {
    const stored = localStorage.getItem(LANG_STORAGE_KEY);
    if (stored && stored in translations) {
      setLang(stored as Language);
      return;
    }
    const browserLang = navigator.language.split('-')[0];
    if (browserLang in translations) {
      setLang(browserLang as Language);
    }
  }, []);

  const setLangAndPersist = useCallback((next: Language) => {
    setLang(next);
    localStorage.setItem(LANG_STORAGE_KEY, next);
  }, []);

  // Keeps the document's declared language and description in sync with
  // the active UI language -- screen readers otherwise pronounce the
  // other language with the wrong phonetics, and browsers offer to
  // "translate" a page that's already in the visitor's language.
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

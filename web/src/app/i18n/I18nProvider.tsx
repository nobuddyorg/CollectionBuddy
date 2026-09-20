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
    if (
      typeof value === 'object' &&
      // `TranslationValue` never includes `null`, so the type checker
      // considers this unreachable -- kept anyway because `typeof null ===
      // 'object'` is true, and nothing stops a translation JSON file from
      // adding a literal `null` value the type just hasn't seen yet.
      // eslint-disable-next-line sonarjs/different-types-comparison
      value !== null &&
      Object.hasOwn(value, k)
    ) {
      // The rule flags any `obj = obj[dynamicKey]` inside a loop regardless
      // of the guard in front of it -- the `Object.hasOwn` check above
      // already closes the actual prototype-pollution path this rule
      // exists to catch (see TEST_STRATEGY.md §6's SAST guidance: verify a
      // rewrite actually stops the pattern-matcher from firing before
      // assuming it does); the shape it's
      // matching on is inherent to walking a dot-separated key path, so
      // there's no rewrite left that changes the underlying algorithm
      // without just restructuring code to dodge a pattern-matcher.
      // nosemgrep: javascript.lang.security.audit.prototype-pollution.prototype-pollution-loop.prototype-pollution-loop
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

export const I18nProvider = ({ children }: { children: React.ReactNode }) => {
  // Starts at 'de', matching the prerendered markup -- seeding from detectLang() here is a hydration mismatch, so the layout effect below corrects it before paint.
  const [lang, setLang] = useState<Language>('de');
  // t reads lang through this ref, not directly, so its identity stays
  // stable across a language change -- otherwise every callback/effect
  // depending on it re-fires whenever someone switches language.
  const langRef = useRef(lang);
  // Written synchronously during render, not in an effect, so `t` never
  // reads a stale `lang` during that same render cycle.
  // eslint-disable-next-line react-hooks/refs
  langRef.current = lang;

  useLayoutEffect(
    () => {
      setLang(detectLang());
    },
    // Stryker disable next-line ArrayDeclaration: a constant dep list never changes either.
    [],
  );

  const setLangAndPersist = useCallback(
    (next: Language) => {
      setLang(next);
      localStorage.setItem(LANG_STORAGE_KEY, next);
    },
    // Stryker disable next-line ArrayDeclaration: a constant dep list never changes either.
    [],
  );

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
    // Stryker disable next-line ArrayDeclaration: a constant dep list never changes either.
    [],
  );

  const tCount = useCallback(
    (baseKey: TranslationKey, count: number) => {
      const dict = translations[langRef.current];
      const category = new Intl.PluralRules(langRef.current).select(count);
      const template =
        (category === 'one'
          ? resolveTranslationKey(dict, `${baseKey}_one`)
          : undefined) ??
        resolveTranslationKey(dict, baseKey) ??
        baseKey;
      return template.replace('{count}', String(count));
    },
    // Stryker disable next-line ArrayDeclaration: a constant dep list never changes either.
    [],
  );

  const value = useMemo(
    () => ({ lang, setLang: setLangAndPersist, t, tCount }),
    [lang, setLangAndPersist, t, tCount],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

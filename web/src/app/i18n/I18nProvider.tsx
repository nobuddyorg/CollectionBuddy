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
    // localStorage can throw (private browsing, disabled storage) -- the
    // 'de' default below is exactly what a stored-language miss falls back
    // to anyway.
  }
  return 'de';
}

// useLayoutEffect on the client, a no-op on the server -- this file only
// ever renders as a client component, but Next.js still executes it once
// during the static export's prerender, where `useLayoutEffect` would
// otherwise warn ("does nothing on the server").
const useIsomorphicLayoutEffect =
  typeof window === 'undefined' ? useEffect : useLayoutEffect;

export const I18nProvider = ({ children }: { children: React.ReactNode }) => {
  // Starts at 'de', matching the static export's own prerendered markup --
  // seeding this from `detectLang()` directly (matching what a non-German
  // browser will settle on) diverges from that markup on the very first
  // client render, which is a hydration mismatch, not just a flash: React
  // logs it and, in the signed-in e2e suite, that failed every test in the
  // run (error #418). `useIsomorphicLayoutEffect` below still corrects it
  // before the browser's next paint, same as the pre-paint theme script,
  // just one render later -- after hydration has already committed once
  // against markup that matches.
  const [lang, setLang] = useState<Language>('de');
  // t reads lang through this ref instead of depending on it directly, so
  // its identity stays stable across a language change from the switcher.
  // Otherwise every callback/effect that lists t (or something derived from
  // it) as a dependency -- category loading, item creation -- re-fires the
  // moment someone changes the language.
  const langRef = useRef(lang);
  // Written synchronously during render (not in an effect) so `t`, called
  // by consumers during their own render, never reads a stale `lang` for
  // the one render cycle before an effect would otherwise have fired.
  // eslint-disable-next-line react-hooks/refs
  langRef.current = lang;

  // Runs before the browser paints the post-hydration frame, so a non-German
  // visitor still never sees a settled German frame -- only the one the
  // static export itself painted before any JS ran at all, which no client
  // fix can reach.
  useIsomorphicLayoutEffect(() => {
    setLang(detectLang());
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

  const value = useMemo(
    () => ({ lang, setLang: setLangAndPersist, t }),
    [lang, setLangAndPersist, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};
// Stryker restore all
/* v8 ignore stop */

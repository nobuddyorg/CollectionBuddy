'use client';

import { useSyncExternalStore } from 'react';

import { buttonClasses } from './components/ui/buttonClasses';
import de from './i18n/de.json';
import en from './i18n/en.json';
import { detectLanguage } from './i18n/I18nProvider';
import { detectTheme } from './useTheme';

// No globals.css: this renders only in the browser, after the root layout's stylesheet loaded, and React keeps that in <head>.
const messages = { de: de.app_error, en: en.app_error };

// The choice cannot change while this screen shows, so there is nothing to subscribe to.
const subscribeToNothing = () => () => {};

/** Replaces the root layout when it throws, providers included, so it reads the language itself and needs nothing that blocked storage breaks. */
export default function GlobalError() {
  // German on the build machine, as layout.tsx prerenders; the visitor's language in the browser.
  const language = useSyncExternalStore(
    subscribeToNothing,
    detectLanguage,
    () => 'de' as const,
  );

  // Light on the build machine, as the root layout before its pre-paint script; the visitor's theme in the browser.
  const theme = useSyncExternalStore(
    subscribeToNothing,
    detectTheme,
    () => 'light' as const,
  );

  const text = messages[language];

  return (
    <html lang={language} data-theme={theme}>
      <body className="antialiased">
        <main
          role="alert"
          data-testid="app-error"
          className="min-h-[100dvh] flex flex-col items-center justify-center gap-4 p-6 text-center bg-background text-foreground"
        >
          <h1 className="font-display text-lg">{text.title}</h1>
          <p className="text-sm text-muted-foreground">{text.body}</p>
          <button
            type="button"
            data-testid="app-error-reload"
            className={buttonClasses()}
            onClick={() => window.location.reload()}
          >
            {text.reload}
          </button>
        </main>
      </body>
    </html>
  );
}

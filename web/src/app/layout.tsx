import type { Metadata } from 'next';
import { Archivo, IBM_Plex_Mono, Inter } from 'next/font/google';

import './globals.css';
import { ConfirmProvider } from './components/Confirm/ConfirmProvider';
import { ToastProvider } from './components/Toast/ToastProvider';
import { I18nProvider } from './i18n/I18nProvider';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

// Three roles, on purpose: a grotesque with institutional-signage weight
// for the wordmark and headings, a quiet body face for everything read at
// length, and a tracked-out mono for object labels -- the museum-caption
// motif that recurs through the app.
// Weights are deliberately not enumerated for the two families that have a
// variable version: naming them makes next/font emit one static file per
// weight and preload every one, and the browser then complains about the
// ones the page never renders (#240). Only three weights are used in the
// whole app -- 700 via `.font-display`, 500 via `font-medium`, 400 for
// everything else -- so most of what was being fetched was dead weight.
// One variable file per family covers all of them and can't fall out of
// sync with the CSS the way a hand-kept weight list does.
const displayFont = Archivo({
  subsets: ['latin'],
  variable: '--font-display-family',
});
const bodyFont = Inter({
  subsets: ['latin'],
  variable: '--font-body-family',
});
// IBM Plex Mono has no variable version on Google Fonts, so this one still
// has to name its weight. 400 is the only one used: `.font-label` sets no
// weight of its own and never sits under `font-medium`.
const labelFont = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-label-family',
});

export const metadata: Metadata = {
  title: 'CollectionBuddy',
  description: 'Sammeln • Ordnen • Behalten',
  icons: {
    icon: [
      { url: `${basePath}/favicon.ico` },
      {
        url: `${basePath}/favicon-32x32.png`,
        sizes: '32x32',
        type: 'image/png',
      },
    ],
    apple: [{ url: `${basePath}/apple-touch-icon.png` }],
    shortcut: [{ url: `${basePath}/favicon.ico` }],
  },
  manifest: `${basePath}/site.webmanifest`,
};

export const viewport = {
  themeColor: '#f4f3ef',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="de"
      className={`${displayFont.variable} ${bodyFont.variable} ${labelFont.variable}`}
    >
      <body className="antialiased">
        <I18nProvider>
          <ToastProvider>
            <ConfirmProvider>{children}</ConfirmProvider>
          </ToastProvider>
        </I18nProvider>
      </body>
    </html>
  );
}

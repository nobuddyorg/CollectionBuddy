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
const displayFont = Archivo({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-display-family',
});
const bodyFont = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-body-family',
});
const labelFont = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
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

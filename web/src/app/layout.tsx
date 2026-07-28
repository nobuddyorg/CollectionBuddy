import type { Metadata } from 'next';
import { Baloo_2, IBM_Plex_Mono, Inter } from 'next/font/google';

import './globals.css';
import { ConfirmProvider } from './components/Confirm/ConfirmProvider';
import { ToastProvider } from './components/Toast/ToastProvider';
import { I18nProvider } from './i18n/I18nProvider';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

// Three roles, on purpose: a chunky display face for the wordmark and
// headers only, a quiet body face for everything read at length, and a
// tracked-out mono face for tags/place/labels -- the "hand-labeled
// specimen tag" motif that recurs through the redesign.
const displayFont = Baloo_2({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
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
  themeColor: '#1f3b38',
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

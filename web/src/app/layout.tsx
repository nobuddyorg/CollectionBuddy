import type { Metadata } from 'next';

import { geistMono, geistSans } from './fonts';
import './globals.css';
import { I18nProvider } from './i18n/I18nProvider';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}

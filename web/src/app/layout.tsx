import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { I18nProvider } from './i18n/I18nProvider';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export const metadata: Metadata = {
  title: 'CollectionBuddy 🪙',
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

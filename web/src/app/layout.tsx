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
  // The browser chrome around the page -- the address bar on Android, the
  // status bar area of an installed app. Two entries rather than one so it
  // matches whichever theme the page settles on; a paper-coloured bar over
  // a near-black page is the seam that gives a retrofitted dark mode away.
  //
  // These follow the OS, not the in-app control, because that is the whole
  // of what a meta tag can express. A visitor who overrides the OS keeps a
  // bar from the other theme, which is a smaller wrong than no dark bar at
  // all for the many who don't.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f3ef' },
    { media: '(prefers-color-scheme: dark)', color: '#191815' },
  ],
};

// Runs before the first paint, so the page is already the right colour when
// it arrives rather than flashing paper and correcting itself a beat later.
// It reads exactly what useTheme.ts reads and answers it the same way; the
// hook takes over keeping the attribute in step once React is running.
//
// Inline and blocking on purpose: an external file, or `defer`, is a file
// the browser fetches after it has painted, which is the flash this exists
// to prevent.
const THEME_INIT_SCRIPT = `(function(){try{var s=localStorage.getItem('theme');document.documentElement.setAttribute('data-theme',s==='light'||s==='dark'?s:(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'));}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="de"
      className={`${displayFont.variable} ${bodyFont.variable} ${labelFont.variable}`}
      // The script above writes data-theme onto this element before React
      // sees it, so the server's markup and the client's never match here.
      // That is the mechanism working, not a bug to be reported.
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="antialiased">
        {/* Dialogs portal straight to document.body (CenteredModal, ModalImage),
            landing as siblings of this wrapper rather than inside it. That
            makes it the one element useInertBackground needs to reach for:
            marking it inert while a dialog is open hides the header, main
            and footer from assistive tech without also hiding the dialog
            portalled next to it (#295). */}
        <div id="app-root">
          <I18nProvider>
            <ToastProvider>
              <ConfirmProvider>{children}</ConfirmProvider>
            </ToastProvider>
          </I18nProvider>
        </div>
      </body>
    </html>
  );
}

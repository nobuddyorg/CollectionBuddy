import type { Metadata } from 'next';
import { Archivo, IBM_Plex_Mono, Inter } from 'next/font/google';

import './globals.css';
import { ConfirmProvider } from './components/Confirm/ConfirmProvider';
import { ToastProvider } from './components/Toast/ToastProvider';
import { I18nProvider } from './i18n/I18nProvider';
import { ServiceWorkerRegistration } from './ServiceWorkerRegistration';
import { SupabaseWarmup } from './SupabaseWarmup';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

// The origin every Supabase call (REST, Auth, Storage -- all one project,
// different path prefixes) goes to, read the same literal-expression way
// supabase.ts reads it, so Next's static-export inliner can still resolve
// it as a build-time constant instead of leaving it undefined in the
// browser. Used only to build the CSP below; there is no fallback because
// there is no offline mode -- a build missing this is already broken, and
// failing here is no different from failing wherever supabase.ts is first
// imported.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!supabaseUrl) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL -- copy web/.env.example to web/.env.local and fill it in.',
  );
}
const SUPABASE_ORIGIN = new URL(supabaseUrl).origin;

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
//
// A measured cost, not an oversight: this is a third family on the
// critical path (~9.8 KB of this one's preloaded woff2, ~91.2 KB across
// all three combined). `.font-label` is only ever small captions, and
// could in principle be served by the body face at tracked-out
// letter-spacing instead -- kept as its own family because the
// museum-caption motif above is a deliberate part of what the three
// roles are for, not because the cost went unnoticed.
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

// The same pre-paint trick as the theme script above, but for the declared
// language: without it, `<html lang="de">` -- the static export's baked-in
// default -- is what a screen reader reads until I18nProvider's own mount
// effect corrects it, so an English visitor's first frame gets German
// phonetics on English text. Kept in exact lockstep with I18nProvider's
// `initialLang()`, which seeds the React state the same way.
const LANG_INIT_SCRIPT = `(function(){try{var s=localStorage.getItem('lang');var l=(s==='de'||s==='en')?s:(navigator.language||'').split('-')[0];document.documentElement.lang=(l==='de'||l==='en')?l:'de';}catch(e){}})();`;

// GitHub Pages does not allow custom response headers, so there is no way
// to send X-Frame-Options or a frame-ancestors CSP directive -- browsers
// only honour frame-ancestors from a real header, never from a <meta> tag.
// This is the fallback: if the page ever ends up in a frame, it navigates
// the top-level frame to itself, breaking out rather than sitting there
// invisibly under an attacker's decoy UI (clickjacking against the delete
// flow's confirm button, e.g.). Same inline-and-blocking reasoning as the
// theme script -- this has to run before anything is interactive, or the
// frame it's meant to bust already had a chance to be clicked through.
const FRAMEBUST_SCRIPT = `if(window.top!==window.self){window.top.location=window.self.location;}`;

// The directives a <meta http-equiv="Content-Security-Policy"> tag can
// actually enforce (frame-ancestors and sandbox cannot, hence the script
// above). 'unsafe-inline' on script-src/style-src is what the theme and
// framebusting scripts above, and every component using a React `style`
// prop, need -- there is no server to hand out a per-request nonce for a
// static export, so a strict CSP here would mean building a hash allowlist
// that has to be kept in sync by hand with every inline script and style
// in the app. Still meaningfully constrains where a script can be loaded
// *from* and where a fetch can go, which is what actually matters if an
// XSS sink ever shows up.
const CONTENT_SECURITY_POLICY = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline'`,
  `style-src 'self' 'unsafe-inline'`,
  // data: is Leaflet's own doing -- its default icon handling loads a 1x1
  // transparent GIF as a data URI internally, not something this app
  // constructs itself.
  `img-src 'self' data: ${SUPABASE_ORIGIN} https://*.tile.openstreetmap.org`,
  `connect-src 'self' ${SUPABASE_ORIGIN} https://photon.komoot.io`,
  `font-src 'self'`,
  // browser-image-compression (the upload path's resize step) runs in a Web
  // Worker it creates from a blob: URL. Worker script loading falls back to
  // script-src when worker-src is unset, and script-src has no blob: in it
  // -- every photo upload silently failed to compress at all until this was
  // explicit.
  `worker-src 'self' blob:`,
  `object-src 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
].join('; ');

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
        {/* As early as possible: a CSP meta tag only covers what the
            document parses after it. */}
        <meta
          httpEquiv="Content-Security-Policy"
          content={CONTENT_SECURITY_POLICY}
        />
        {/* Strips the path/query when a link to this app is followed from
            elsewhere -- a collection's contents have no business showing up
            in another site's referrer logs. same-origin navigation (the app
            linking to itself) keeps the full referrer, which is the one
            case that's actually useful. */}
        <meta name="referrer" content="strict-origin-when-cross-origin" />
        <script dangerouslySetInnerHTML={{ __html: FRAMEBUST_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: LANG_INIT_SCRIPT }} />
      </head>
      <body className="antialiased">
        {/* Dialogs portal straight to document.body (CenteredModal, ModalImage),
            landing as siblings of this wrapper rather than inside it. That
            makes it the one element useInertBackground needs to reach for:
            marking it inert while a dialog is open hides the header, main
            and footer from assistive tech without also hiding the dialog
            portalled next to it (#295). */}
        <div id="app-root">
          <SupabaseWarmup />
          <ServiceWorkerRegistration />
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

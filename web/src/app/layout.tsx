import { Archivo, IBM_Plex_Mono, Inter } from 'next/font/google';

import './globals.css';
import { ConfirmProvider } from './components/Confirm/ConfirmProvider';
import { ToastProvider } from './components/Toast/ToastProvider';
import { I18nProvider } from './i18n/I18nProvider';
import { ServiceWorkerRegistration } from './ServiceWorkerRegistration';
import { SupabaseWarmup } from './SupabaseWarmup';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

// Read as a literal `process.env.X` expression, same as supabase.ts, so
// Next's static-export inliner can resolve it at build time. Used only to
// build the CSP below.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!supabaseUrl) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL -- copy web/.env.example to web/.env.local and fill it in.',
  );
}
const SUPABASE_ORIGIN = new URL(supabaseUrl).origin;

// Weights deliberately not enumerated for these two variable-font
// families: naming them makes next/font emit and preload a static file per
// weight, and the browser warns about the ones the page never renders.
const displayFont = Archivo({
  subsets: ['latin'],
  variable: '--font-display-family',
});
const bodyFont = Inter({
  subsets: ['latin'],
  variable: '--font-body-family',
});
// IBM Plex Mono has no variable version on Google Fonts, so this one still
// has to name its weight; 400 is the only one used.
const labelFont = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-label-family',
});

// Title/description/icons/manifest/theme-color are hand-written tags, not
// Next's `metadata`/`viewport` exports: in this static export, that
// machinery re-inserts a second copy of every managed tag during client
// hydration instead of adopting what's already in the exported HTML.
// Firefox desktop's favicon stops resolving when duplicated this way.
const THEME_COLORS = [
  { media: '(prefers-color-scheme: light)', color: '#f4f3ef' },
  { media: '(prefers-color-scheme: dark)', color: '#191815' },
];

// Inline and blocking on purpose: an external file, or `defer`, would run
// after first paint, which is the flash this exists to prevent. Reads the
// same storage key as useTheme.ts, which takes over once React mounts.
const THEME_INIT_SCRIPT = `(function(){try{var s=localStorage.getItem('theme');document.documentElement.setAttribute('data-theme',s==='light'||s==='dark'?s:(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'));}catch(e){}})();`;

// Same pre-paint trick as the theme script, for `<html lang>`. Kept in
// lockstep with I18nProvider's own initial-language logic.
const LANG_INIT_SCRIPT = `(function(){try{var s=localStorage.getItem('lang');var l=(s==='de'||s==='en')?s:(navigator.language||'').split('-')[0];document.documentElement.lang=(l==='de'||l==='en')?l:'de';}catch(e){}})();`;

// GitHub Pages can't send custom response headers, so frame-ancestors
// (which browsers only honour from a real header) isn't available. This is
// the fallback: navigates the top frame to itself to break out of a
// clickjacking frame before anything in it becomes clickable.
const FRAMEBUST_SCRIPT = `if(window.top!==window.self){window.top.location=window.self.location;}`;

// frame-ancestors and sandbox can't be enforced from a <meta> CSP tag,
// hence the script above. 'unsafe-inline' on script-src/style-src is
// needed for the inline scripts here and every component's React `style`
// prop -- there's no server to hand out a per-request nonce for a static
// export. Still constrains script/fetch origins, which is what matters if
// an XSS sink ever shows up.
const CONTENT_SECURITY_POLICY = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline'`,
  `style-src 'self' 'unsafe-inline'`,
  // data: is Leaflet's doing -- its default icon loads a 1x1 transparent
  // GIF as a data URI internally.
  `img-src 'self' data: ${SUPABASE_ORIGIN} https://*.tile.openstreetmap.org`,
  `connect-src 'self' ${SUPABASE_ORIGIN} https://photon.komoot.io`,
  `font-src 'self'`,
  // browser-image-compression runs in a Web Worker created from a blob:
  // URL. Worker loading falls back to script-src when worker-src is unset,
  // which has no blob: in it -- uploads silently failed to compress
  // without this.
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
      // The script above writes data-theme before React sees it, so
      // server and client markup never match here -- expected, not a bug.
      suppressHydrationWarning
    >
      <head>
        <title>CollectionBuddy</title>
        {/* I18nProvider updates this via a `meta[name="description"]`
            selector that must keep matching this tag. */}
        <meta name="description" content="Sammeln • Ordnen • Behalten" />
        <link rel="manifest" href={`${basePath}/site.webmanifest`} />
        <link rel="icon" href={`${basePath}/favicon.ico`} />
        <link
          rel="icon"
          href={`${basePath}/favicon-32x32.png`}
          sizes="32x32"
          type="image/png"
        />
        <link
          rel="apple-touch-icon"
          href={`${basePath}/apple-touch-icon.png`}
        />
        <link rel="shortcut icon" href={`${basePath}/favicon.ico`} />
        {/* Two entries so the browser chrome matches whichever theme the
            page settles on; these follow the OS, since that's all a meta
            tag can express, not the in-app toggle. */}
        {THEME_COLORS.map(({ media, color }) => (
          <meta key={media} name="theme-color" content={color} media={media} />
        ))}
        {/* As early as possible: a CSP meta tag only covers what the
            document parses after it. */}
        <meta
          httpEquiv="Content-Security-Policy"
          content={CONTENT_SECURITY_POLICY}
        />
        {/* Strips path/query on cross-origin navigation, so a collection's
            contents don't show up in another site's referrer logs. */}
        <meta name="referrer" content="strict-origin-when-cross-origin" />
        <script dangerouslySetInnerHTML={{ __html: FRAMEBUST_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: LANG_INIT_SCRIPT }} />
      </head>
      <body className="antialiased">
        {/* Dialogs portal straight to document.body, as siblings of this
            wrapper -- useInertBackground marks this element inert while a
            dialog is open, hiding header/main/footer without also hiding
            the portalled dialog. */}
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

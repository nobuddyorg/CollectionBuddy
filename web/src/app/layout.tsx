import { Archivo, IBM_Plex_Mono, Inter } from 'next/font/google';

import './globals.css';
import { ConfirmProvider } from './components/Confirm/ConfirmProvider';
import { ToastProvider } from './components/Toast/ToastProvider';
import { I18nProvider } from './i18n/I18nProvider';
import { ServiceWorkerRegistration } from './ServiceWorkerRegistration';
import { SupabaseWarmup } from './SupabaseWarmup';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

// Read as a literal `process.env.X` expression, the only form Next's static export inlines.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!supabaseUrl) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL -- copy web/.env.example to web/.env.local and fill it in.',
  );
}
const SUPABASE_ORIGIN = new URL(supabaseUrl).origin;

// No weights for the variable fonts: naming them makes next/font preload a file per weight.
const displayFont = Archivo({
  subsets: ['latin'],
  variable: '--font-display-family',
});
const bodyFont = Inter({
  subsets: ['latin'],
  variable: '--font-body-family',
});
// IBM Plex Mono has no variable version on Google Fonts, so its one weight must be named.
const labelFont = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-label-family',
});

// Hand-written head tags, not Next's `metadata` export, which duplicates each tag on hydration here.
const THEME_COLORS = [
  { media: '(prefers-color-scheme: light)', color: '#f4f3ef' },
  { media: '(prefers-color-scheme: dark)', color: '#191815' },
];

// Inline and blocking on purpose: anything deferred runs after first paint, the flash this prevents.
const THEME_INIT_SCRIPT = `(function(){try{var s=localStorage.getItem('theme');document.documentElement.setAttribute('data-theme',s==='light'||s==='dark'?s:(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'));}catch(e){}})();`;

// Same pre-paint trick for `<html lang>`, kept in lockstep with I18nProvider's initial-language logic.
const LANG_INIT_SCRIPT = `(function(){try{var s=localStorage.getItem('lang');var l=(s==='de'||s==='en')?s:(navigator.language||'').split('-')[0];document.documentElement.lang=(l==='de'||l==='en')?l:'de';}catch(e){}})();`;

// GitHub Pages sends no headers, so no frame-ancestors; this breaks out of a clickjacking frame instead.
const FRAMEBUST_SCRIPT = `if(window.top!==window.self){window.top.location=window.self.location;}`;

// 'unsafe-inline' is unavoidable with no server to hand out nonces; origins are still constrained.
const CONTENT_SECURITY_POLICY = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline'`,
  `style-src 'self' 'unsafe-inline'`,
  // data: is for Leaflet's default icon, a 1x1 GIF loaded as a data URI.
  `img-src 'self' data: ${SUPABASE_ORIGIN} https://*.tile.openstreetmap.org`,
  `connect-src 'self' ${SUPABASE_ORIGIN} https://photon.komoot.io`,
  `font-src 'self'`,
  // browser-image-compression runs its worker from a blob: URL; without this, uploads silently skipped compression.
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
      // The pre-paint script writes data-theme before React sees it, so server and client markup differ.
      suppressHydrationWarning
    >
      <head>
        <title>CollectionBuddy</title>
        {/* I18nProvider updates this via a `meta[name="description"]` selector that must keep matching. */}
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
        {/* One per OS scheme: a meta tag can only follow the OS, not the in-app toggle. */}
        {THEME_COLORS.map(({ media, color }) => (
          <meta key={media} name="theme-color" content={color} media={media} />
        ))}
        {/* As early as possible: a CSP meta tag only covers what the document parses after it. */}
        <meta
          httpEquiv="Content-Security-Policy"
          content={CONTENT_SECURITY_POLICY}
        />
        {/* Strips path/query on cross-origin navigation, keeping a collection's contents out of referrer logs. */}
        <meta name="referrer" content="strict-origin-when-cross-origin" />
        <script dangerouslySetInnerHTML={{ __html: FRAMEBUST_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: LANG_INIT_SCRIPT }} />
      </head>
      <body className="antialiased">
        {/* Dialogs portal to document.body, so useInertBackground can mark this wrapper inert without them. */}
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

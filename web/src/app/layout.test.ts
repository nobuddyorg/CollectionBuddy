import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Runs from a <script> tag before React exists to import from, so it's
// asserted on as raw source text rather than executed.
const layout = readFileSync(new URL('layout.tsx', import.meta.url), 'utf8');

describe('the framebusting script in layout.tsx', () => {
  const script = layout.slice(
    layout.indexOf('const FRAMEBUST_SCRIPT'),
    layout.indexOf('const CONTENT_SECURITY_POLICY'),
  );

  it('compares the top frame to itself', () => {
    expect(script).toContain('window.top!==window.self');
  });

  it('breaks out by navigating the top frame, not just this one', () => {
    expect(script).toContain('window.top.location=window.self.location');
  });

  it('is declared and rendered before the theme script, so it runs first', () => {
    const declared = layout.indexOf('const FRAMEBUST_SCRIPT');
    const themeDeclared = layout.indexOf('const THEME_INIT_SCRIPT');
    const rendered = layout.indexOf('FRAMEBUST_SCRIPT }}');
    const themeRendered = layout.indexOf('THEME_INIT_SCRIPT }}');
    expect(declared).toBeGreaterThan(-1);
    expect(themeDeclared).toBeGreaterThan(-1);
    expect(rendered).toBeLessThan(themeRendered);
  });
});

describe('the Content-Security-Policy meta tag in layout.tsx', () => {
  const policy = layout.slice(
    layout.indexOf('const CONTENT_SECURITY_POLICY'),
    layout.indexOf('export default function RootLayout'),
  );

  it('restricts fetches and images to self plus the services the app actually talks to', () => {
    expect(layout).toContain(
      "img-src 'self' data: ${SUPABASE_ORIGIN} https://*.tile.openstreetmap.org",
    );
    expect(layout).toContain(
      "connect-src 'self' ${SUPABASE_ORIGIN} https://photon.komoot.io",
    );
  });

  it('allows a worker to be created from a blob: URL', () => {
    expect(policy).toContain(`worker-src 'self' blob:`);
  });

  it('allows a data: URI image, which Leaflet loads internally', () => {
    expect(policy).toMatch(/img-src[^;]*\bdata:/);
  });

  it('blocks plugin/object embeds outright', () => {
    expect(layout).toContain("object-src 'none'");
  });

  // Guards against someone adding frame-ancestors later believing it does
  // something in a <meta> tag; the framebusting script carries that job.
  it('does not declare frame-ancestors, which a meta tag cannot enforce', () => {
    expect(policy).not.toContain('frame-ancestors');
  });

  it('is rendered before the framebusting and theme scripts, so it covers everything that follows', () => {
    const cspRendered = layout.indexOf('httpEquiv="Content-Security-Policy"');
    const framebustRendered = layout.indexOf('FRAMEBUST_SCRIPT }}');
    expect(cspRendered).toBeGreaterThan(-1);
    expect(cspRendered).toBeLessThan(framebustRendered);
  });
});

describe('the referrer meta tag in layout.tsx', () => {
  it('strips the path/query on a cross-origin navigation rather than sending the full URL', () => {
    expect(layout).toContain(
      'name="referrer" content="strict-origin-when-cross-origin"',
    );
  });
});

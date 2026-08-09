import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Same reasoning as useTheme.test.ts's read of the pre-paint script: this
// runs from a <meta>/<script> tag in the document head, before React (or
// any bundled module) exists to import from, so it's read and asserted on
// as raw source text rather than executed.
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
      "img-src 'self' ${SUPABASE_ORIGIN} https://*.tile.openstreetmap.org",
    );
    expect(layout).toContain(
      "connect-src 'self' ${SUPABASE_ORIGIN} https://photon.komoot.io",
    );
  });

  it('blocks plugin/object embeds outright', () => {
    expect(layout).toContain("object-src 'none'");
  });

  // frame-ancestors is the directive that would actually stop a clickjacking
  // frame, and it is meaningless in a <meta> tag -- browsers only honour it
  // from a real header, which GitHub Pages cannot send. Asserting its
  // absence here is a guard against someone adding it later believing it
  // does something: the framebusting script above is what has to carry that
  // job instead.
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

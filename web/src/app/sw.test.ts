import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('../../public/sw.js', import.meta.url),
  'utf8',
);

// sw.js runs outside any bundler as a plain script, with no import path
// back into this suite, so its two decision functions are pulled out of
// the raw source and evaluated in isolation here.
function extractFunction(name: string): string {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`${name} not found in sw.js`);
  const end = source.indexOf('\n}', start) + 2;
  return source.slice(start, end);
}

function load<T>(name: string): T {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const factory = new Function(
    `${extractFunction(name)}\nreturn ${name};`,
  ) as () => T;
  return factory();
}

describe('isHashedStaticAsset', () => {
  const isHashedStaticAsset = load<(pathname: string) => boolean>(
    'isHashedStaticAsset',
  );

  it('matches a content-hashed Next.js chunk', () => {
    expect(
      isHashedStaticAsset('/CollectionBuddy/_next/static/chunks/1.js'),
    ).toBe(true);
  });

  it('does not match the app shell or the manifest', () => {
    expect(isHashedStaticAsset('/CollectionBuddy/')).toBe(false);
    expect(isHashedStaticAsset('/CollectionBuddy/site.webmanifest')).toBe(
      false,
    );
  });
});

describe('isAppShellRequest', () => {
  const isAppShellRequest =
    load<(pathname: string, mode: string) => boolean>('isAppShellRequest');

  it('matches a navigation regardless of which page it lands on', () => {
    expect(isAppShellRequest('/CollectionBuddy/', 'navigate')).toBe(true);
    expect(isAppShellRequest('/CollectionBuddy/login/', 'navigate')).toBe(true);
  });

  it('matches the manifest even outside a navigation', () => {
    expect(isAppShellRequest('/CollectionBuddy/site.webmanifest', 'cors')).toBe(
      true,
    );
  });

  it('matches neither a hashed asset nor an unrelated request', () => {
    expect(
      isAppShellRequest('/CollectionBuddy/_next/static/chunks/1.js', 'cors'),
    ).toBe(false);
    expect(isAppShellRequest('/CollectionBuddy/favicon.ico', 'no-cors')).toBe(
      false,
    );
  });
});

describe('the fetch handler', () => {
  it('never intercepts a non-GET request', () => {
    expect(source).toContain("request.method !== 'GET'");
  });

  // Supabase must be excluded from caching: PostgREST/Auth responses must
  // never be served stale, and Storage's signed URLs expire in an hour
  // (data/images.ts). There's no Supabase-specific allowlist for that --
  // this same-origin check excludes every cross-origin request outright,
  // and every Supabase call is cross-origin by construction.
  it('never intercepts a cross-origin request, which is what excludes Supabase', () => {
    expect(source).toContain('url.origin !== self.location.origin');
  });
});

describe('cache versioning', () => {
  it('names one cache the activate handler can find and clear a stale copy of', () => {
    expect(source).toMatch(/CACHE_NAME = '[^']+'/);
    expect(source).toContain('.filter((key) => key !== CACHE_NAME)');
  });
});

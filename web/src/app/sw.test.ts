import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

const source = readFileSync(
  new URL('../../public/sw.js', import.meta.url),
  'utf8',
);

// sw.js is a plain script with no import path, so its decision functions are evaluated from raw source.
function extractFunction(name: string): string {
  const match = new RegExp(`^(async )?function ${name}\\(`, 'm').exec(source);
  if (!match) throw new Error(`${name} not found in sw.js`);
  const start = match.index;
  const end = source.indexOf('\n}', start) + 2;
  return source.slice(start, end);
}

function load<T>(name: string, preamble = ''): T {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- sw.js exports nothing; evaluating its source is the only way in
  const factory = new Function(
    `${preamble}\n${extractFunction(name)}\nreturn ${name};`,
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

  // Every Supabase call is cross-origin, so this check alone keeps its responses and signed URLs uncached.
  it('never intercepts a cross-origin request, which is what excludes Supabase', () => {
    expect(source).toContain('url.origin !== self.location.origin');
  });
});

describe('cacheNameFor', () => {
  const cacheNameFor = load<(search: string) => string>(
    'cacheNameFor',
    "const CACHE_PREFIX = 'collectionbuddy-';",
  );

  it('names the cache after the build that registered the worker', () => {
    expect(cacheNameFor('?build=abc-123')).toBe('collectionbuddy-abc-123');
  });

  // An old build's HTML registers plain sw.js; its worker still needs a cache the next build can delete.
  it('falls back to one prefixed name when no build is given', () => {
    expect(cacheNameFor('')).toBe('collectionbuddy-unversioned');
  });
});

describe('isStaleCache', () => {
  const isStaleCache = load<(key: string, current: string) => boolean>(
    'isStaleCache',
    "const CACHE_PREFIX = 'collectionbuddy-';",
  );

  it("marks an earlier build's cache, and the pre-versioning one, for deletion", () => {
    expect(isStaleCache('collectionbuddy-old', 'collectionbuddy-new')).toBe(
      true,
    );
    expect(
      isStaleCache('collectionbuddy-shell-v1', 'collectionbuddy-new'),
    ).toBe(true);
  });

  it("keeps the current build's cache", () => {
    expect(isStaleCache('collectionbuddy-new', 'collectionbuddy-new')).toBe(
      false,
    );
  });

  // Every project page of a GitHub account shares one origin, and with it Cache Storage.
  it("never touches another site's cache on the same origin", () => {
    expect(isStaleCache('other-app-v1', 'collectionbuddy-new')).toBe(false);
  });
});

describe('networkFirst', () => {
  const networkFirst = load<(request: Request) => Promise<Response>>(
    'networkFirst',
    "const CACHE_NAME = 'collectionbuddy-test';",
  );
  const request = new Request('https://example.test/CollectionBuddy/');

  function stubCache(cached?: Response) {
    const cache = {
      match: vi.fn().mockResolvedValue(cached),
      put: vi.fn().mockResolvedValue(undefined),
    };
    const open = vi.fn().mockResolvedValue(cache);
    vi.stubGlobal('caches', { open });
    return { cache, open };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // A cached shell from an earlier build would load chunks the deploy removed.
  it("answers with the network's page even when one is cached, and caches it", async () => {
    const { cache, open } = stubCache(new Response('old build'));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('new build', { status: 200 })),
    );

    const response = await networkFirst(request);

    expect(await response.text()).toBe('new build');
    expect(open).toHaveBeenCalledWith('collectionbuddy-test');
    expect(cache.put).toHaveBeenCalledWith(request, expect.any(Response));
    expect(cache.match).not.toHaveBeenCalled();
  });

  it('passes an error status through without caching it', async () => {
    const { cache } = stubCache(new Response('old build'));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('missing', { status: 404 })),
    );

    const response = await networkFirst(request);

    expect(response.status).toBe(404);
    expect(cache.put).not.toHaveBeenCalled();
  });

  it('falls back to the cached page when the network is gone', async () => {
    stubCache(new Response('offline copy'));
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));

    const response = await networkFirst(request);

    expect(await response.text()).toBe('offline copy');
  });

  it('fails as the network did when offline with nothing cached', async () => {
    stubCache();
    const failure = new TypeError('offline');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(failure));

    await expect(networkFirst(request)).rejects.toBe(failure);
  });
});

describe('cache versioning', () => {
  it("activating a worker deletes the earlier builds' caches", () => {
    expect(source).toContain(
      'const CACHE_NAME = cacheNameFor(self.location.search);',
    );
    expect(source).toContain('.filter((key) => isStaleCache(key, CACHE_NAME))');
  });

  it('serves the app shell network-first', () => {
    expect(source).toContain('event.respondWith(networkFirst(request));');
  });
});

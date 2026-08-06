import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // Modules under test transitively import supabase.ts, which builds a
    // client at import time and throws without these. Never used to reach
    // the network -- only Supabase's own client-construction validation
    // needs them to be present and URL-shaped.
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/app/**/*.{ts,tsx}'],
      exclude: ['src/app/**/types.ts', 'src/app/i18n/*.json', '**/*.d.ts'],
      thresholds: {
        // Global floor: a coverage regression fails CI instead of silently
        // slipping through. Two things to know before trusting a green
        // local run:
        //
        // 1. `npm test` does NOT enforce these. Only `npm test -- --coverage`
        //    does, which is what CI runs. Check with coverage before pushing.
        // 2. CI measures ~0.1pp lower than a local run (it is pinned to Node
        //    22 while local dev is typically newer, and V8 counts branches
        //    slightly differently). These values sit a few tenths below the
        //    last local measurement to absorb that -- keep that headroom
        //    when raising them.
        //
        // Lowered by hand once, deliberately: removing ItemCard's
        // reveal-on-tap action row deleted well-covered lines, which moves
        // the ratio for a structural reason rather than a regression in
        // testing (the suite grew 84 -> 120 tests in the same change).
        //
        // Raised to the measurement in #246. They had drifted to roughly 16
        // points below what the suite actually achieved, which meant half the
        // tests could have been deleted and CI would still have gone green --
        // a floor that far under the floorboards is not holding anything up.
        // The rule from here is that a PR may raise these and must not lower
        // them.
        statements: 39.4,
        branches: 38.8,
        functions: 40.8,
        lines: 40.0,

        // Was `true`. autoUpdate wrote the local measurement straight back
        // into this file after every coverage run, including a value CI
        // could not reach, so a green local run kept producing a red PR --
        // and any headroom added here was erased by the next local run.
        // The floor still fails CI on a real regression; it just no longer
        // moves itself. Raise it by hand when coverage genuinely improves.
        autoUpdate: false,

        // Per-file floors for the pure, high-risk logic called out in
        // https://github.com/nobuddyorg/CollectionBuddy/issues/140 --
        // string/boundary construction where line coverage alone doesn't
        // prove the assertions are load-bearing (see the mutation-testing
        // config in stryker.config.mjs for that part). Each of these
        // files pairs a `/* v8 ignore start/stop */` block around
        // React/effect/I-O internals with one or more exported pure
        // functions that carry the actual risk, so the 100% floor only
        // has to hold for what's left instrumented -- also autoUpdated,
        // so any future line added to these functions must be tested.
        'src/app/data/items.ts': {
          statements: 100,
          functions: 100,
          branches: 100,
          lines: 100,
        },
        'src/app/components/ItemList/Pagination.tsx': {
          statements: 100,
          functions: 100,
          branches: 100,
          lines: 100,
        },
        'src/app/components/ItemList/useItemImages.tsx': {
          statements: 100,
          functions: 100,
          branches: 100,
          lines: 100,
        },
        'src/app/useTheme.ts': {
          statements: 100,
          functions: 100,
          branches: 100,
          lines: 100,
        },
        'src/app/components/ItemList/optimistic.ts': {
          statements: 100,
          functions: 100,
          branches: 100,
          lines: 100,
        },
        'src/app/components/ItemList/paging.ts': {
          statements: 100,
          functions: 100,
          branches: 100,
          lines: 100,
        },
        'src/app/components/ItemList/imageCache.ts': {
          statements: 100,
          functions: 100,
          branches: 100,
          lines: 100,
        },
        'src/app/components/CenteredModal/getFocusable.ts': {
          statements: 100,
          functions: 100,
          branches: 100,
          lines: 100,
        },
        'src/app/components/CenteredModal/useEscapeToClose.tsx': {
          statements: 100,
          functions: 100,
          branches: 100,
          lines: 100,
        },
        'src/app/components/Coin/size.ts': {
          statements: 100,
          functions: 100,
          branches: 100,
          lines: 100,
        },
        'src/app/components/ItemForm/usePhoton.tsx': {
          statements: 100,
          functions: 100,
          branches: 100,
          lines: 100,
        },
        'src/app/i18n/I18nProvider.tsx': {
          statements: 100,
          functions: 100,
          branches: 100,
          lines: 100,
        },
      },
    },
  },
});

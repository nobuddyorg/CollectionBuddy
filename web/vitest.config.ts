import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
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
        // Global floor. `autoUpdate` writes the measured value back into
        // this file whenever it improves, so this number only ever climbs
        // and a regression fails CI instead of silently slipping through.
        // Do not raise it by hand -- let a real coverage improvement do it.
        statements: 9.11,
        branches: 6.04,
        functions: 4.69,
        lines: 9.73,
        autoUpdate: true,

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

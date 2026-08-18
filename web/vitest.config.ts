import { defineConfig } from 'vitest/config';

import { MUTATE_TARGETS, NO_COVERAGE_FLOOR } from './mutation-targets.mjs';

const PER_FILE_FLOOR = {
  statements: 100,
  functions: 100,
  branches: 100,
  lines: 100,
};

// One floor object per mutation-tested module, minus the ones documented in
// mutation-targets.mjs as deliberately not carrying one -- see
// stryker.config.mjs for the shared source list this is built from.
const perFileThresholds = Object.fromEntries(
  MUTATE_TARGETS.filter((path) => !NO_COVERAGE_FLOOR.includes(path)).map(
    (path) => [path, PER_FILE_FLOOR],
  ),
);

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
        // Global floor. Only `npm test -- --coverage` enforces this (what
        // CI runs, not plain `npm test`), and CI measures ~0.1pp lower than
        // local (pinned Node version). A PR may raise these values and must
        // not lower them.
        statements: 39.4,
        branches: 38.8,
        functions: 40.8,
        lines: 40.0,

        // Was `true`: autoUpdate wrote the local measurement back into this
        // file after every run, so a green local run kept producing a red
        // PR. Raise by hand when coverage genuinely improves.
        autoUpdate: false,

        // Per-file floors for the pure, high-risk logic in
        // mutation-targets.mjs, where line coverage alone doesn't prove the
        // assertions are load-bearing (stryker.config.mjs covers that part).
        // Built from that shared list rather than listed by hand, so it
        // can't drift from what Stryker mutates.
        ...perFileThresholds,
      },
    },
  },
});

import { defineConfig } from 'vitest/config';

import { MUTATE_TARGETS, NO_COVERAGE_FLOOR } from './mutation-targets.mjs';

// Global floor. Only `npm test -- --coverage` enforces this (what CI runs,
// not plain `npm test`), and CI measures ~0.1pp lower than local (pinned
// Node version). A PR may raise these values and must not lower them.
//
// Declared before PER_FILE_FLOOR on purpose: the job-summary step in ci.yml
// (davelosert/vitest-coverage-report-action) doesn't evaluate this file, it
// regex-scans the raw text for the first `statements: N` etc. it finds. With
// PER_FILE_FLOOR's 100s ahead of these, it picked those up as the "target"
// instead, showing every category as red no matter the real result.
const GLOBAL_COVERAGE_THRESHOLDS = {
  statements: 85,
  branches: 78,
  functions: 85,
  lines: 88,
};

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
      // `json-summary` feeds the job-summary step in ci.yml
      // (davelosert/vitest-coverage-report-action) -- nothing else reads it.
      reporter: ['text', 'lcov', 'json-summary'],
      include: ['src/app/**/*.{ts,tsx}'],
      exclude: [
        'src/app/**/types.ts',
        'src/app/i18n/*.json',
        '**/*.d.ts',
        // Routing/auth glue and the Leaflet wrapper -- verified by
        // Playwright (login.spec.ts, sign-out.spec.ts, map.spec.ts), not
        // unit tests.
        'src/app/layout.tsx',
        'src/app/page.tsx',
        'src/app/login/page.tsx',
        'src/app/useSignOut.ts',
        'src/app/login/useGoogleSignIn.ts',
        'src/app/login/useAuthRedirect.ts',
        'src/app/login/useDemoSignIn.ts',
        'src/app/data/auth.ts',
        'src/app/components/Map/index.tsx',
      ],
      thresholds: {
        ...GLOBAL_COVERAGE_THRESHOLDS,

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

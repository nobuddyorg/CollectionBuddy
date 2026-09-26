// Walks the whole module graph, so it catches a component reaching Supabase through another module, which ESLint's per-file no-restricted-imports cannot.
const config = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment:
        'A cycle between modules makes both harder to reason about and to test in isolation.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      severity: 'error',
      comment:
        'A module nothing imports and that imports nothing local is dead code -- ' +
        'CLAUDE.md rules that out explicitly. Test/spec files and .d.ts files are ' +
        'expected to be "orphans" in graph terms (they are run, not imported).',
      from: {
        orphan: true,
        pathNot: ['\\.(test|spec)\\.(ts|tsx)$', '\\.d\\.ts$'],
      },
      to: {},
    },
    {
      name: 'not-to-unresolvable',
      severity: 'error',
      comment:
        'An import dependency-cruiser cannot resolve is usually a typo or a missing dependency.',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'supabase-behind-data-layer',
      severity: 'error',
      comment:
        'Only data/, login/ and the session files (supabase.ts, useSession.ts, useSignOut.ts, ' +
        'SupabaseWarmup.tsx, and their tests) import the client or @supabase/*, types included, ' +
        'so no helper module can hand a component a Supabase reach of its own.',
      from: {
        path: '^src/app/',
        pathNot: [
          '^src/app/data/',
          '^src/app/login/',
          '^src/app/(supabase|useSession|useSignOut)(\\.test)?\\.ts$',
          '^src/app/SupabaseWarmup(\\.test)?\\.tsx$',
        ],
      },
      to: { path: ['^src/app/supabase\\.ts$', '^node_modules/@supabase/'] },
    },
    {
      name: 'one-supabase-client',
      severity: 'error',
      comment:
        'supabase.ts builds the one client; anywhere else, @supabase/* is for types only.',
      from: { path: '^src/app/', pathNot: '^src/app/supabase\\.ts$' },
      to: {
        path: '^node_modules/@supabase/',
        dependencyTypesNot: ['type-only'],
      },
    },
    {
      name: 'data-layer-no-components',
      severity: 'error',
      comment:
        'The data-access layer is consumed by components, never the other way around.',
      from: { path: '^src/app/data/' },
      to: { path: '^src/app/components/' },
    },
    {
      name: 'i18n-no-app-deps',
      severity: 'error',
      comment:
        'Translation lookup is a leaf: it must not depend on data access, UI, or the login feature.',
      from: { path: '^src/app/i18n/' },
      to: { path: '^src/app/(data|components|login)/' },
    },
    {
      name: 'e2e-is-black-box',
      severity: 'error',
      comment:
        'e2e/ drives the app through a real browser and never imports app internals directly -- ' +
        'it has its own helpers (e2e/helpers.ts, e2e/axe.ts) instead of reaching into src/app. ' +
        'Verified as already true; keeping it a rule stops it from being weakened by accident.',
      from: { path: '^e2e/' },
      to: { path: '^src/app/' },
    },
    {
      name: 'scripts-are-standalone',
      severity: 'error',
      comment:
        'web/scripts/** are Node tools that run outside the Next.js build (export server, ' +
        'local-stack runner, icon generation, mutation summary) and must not depend on browser-only app code.',
      from: { path: '^scripts/' },
      to: { path: '^src/app/' },
    },
    {
      name: 'app-bundle-no-node-tooling',
      severity: 'error',
      comment:
        'The reverse of scripts-are-standalone: src/app/ is what actually ships in the static ' +
        'export, so it must never import from scripts/ or e2e/. Those are the only places a ' +
        'service_role key or other Node-only/CI-only credential is ever referenced in web/ -- this ' +
        'rule is what would catch one of them being pulled into the client bundle.',
      from: { path: '^src/app/' },
      to: { path: '^(scripts|e2e)/' },
    },
  ],
  options: {
    tsConfig: { fileName: 'tsconfig.json' },
    // Type-only imports are erased at runtime but are real coupling; without this most sibling `types.ts` files misreport as orphans.
    tsPreCompilationDeps: true,
    doNotFollow: { path: 'node_modules' },
    progress: { type: 'none' },
  },
};

export default config;

// Architectural-boundary checks for web/src/app, web/e2e and web/scripts.
//
// This does not duplicate eslint.config.mjs's no-restricted-imports rule
// (components/** may not import Supabase directly) -- that rule only sees a
// single file's own import statements. dependency-cruiser walks the whole
// module graph instead, so it catches the case ESLint structurally cannot:
// some *other* module (lib/, a new components-adjacent helper, ...) importing
// Supabase directly and a component then reaching it through that module.
// See `supabase-behind-data-layer` below, which is scoped to the whole app
// rather than components/** for exactly that reason.
//
// Every rule here was checked against the actual dependency graph in
// discovery mode before being turned into an `error` (see the PR that added
// this file) -- run `npm run depcruise` locally after changing a rule to
// confirm it still reflects reality rather than an aspiration.
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
        "Components talk to Supabase through data/, never the client directly -- eslint.config.mjs's " +
        'no-restricted-imports enforces the direct-import half of this for components/**. This rule ' +
        'is the complement: it forbids *any* module outside data/, login/ and the top-level ' +
        'auth/session bootstrap files (useSession.ts, useSignOut.ts, SupabaseWarmup.tsx -- "the ' +
        'top-level auth/session surface has nowhere else to live", per eslint.config.mjs) from ' +
        'importing supabase.ts directly, so a component cannot regain direct access by routing ' +
        'through a new helper module that itself talks to Supabase.',
      from: {
        path: '^src/app',
        pathNot: [
          '^src/app/data/',
          '^src/app/login/',
          '^src/app/[^/]+\\.(ts|tsx)$',
        ],
      },
      to: { path: '^src/app/supabase\\.ts$' },
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
    // Regular (non-`import type`) imports of type-only bindings get erased by
    // the TypeScript compiler and carry nothing at runtime, but they are still
    // real, intentional coupling between modules -- and without this, most
    // sibling `types.ts` files misreport as orphans (see no-orphans above).
    tsPreCompilationDeps: true,
    doNotFollow: { path: 'node_modules' },
    progress: { type: 'none' },
  },
};

export default config;

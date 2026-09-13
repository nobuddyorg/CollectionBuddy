import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
import tseslint from 'typescript-eslint';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import sonarjs from 'eslint-plugin-sonarjs';

const eslintConfig = [
  // Generated output and working directories from an interrupted run
  // (Stryker's sandbox is a second copy of the project). database.types.ts
  // is kept honest by CI's own drift check, not lint.
  {
    ignores: [
      'coverage/**',
      '.stryker-tmp/**',
      'reports/**',
      'out/**',
      '.e2e-serve/**',
      'test-results/**',
      'playwright-report/**',
      'src/app/data/database.types.ts',
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  // eslint-plugin-react's auto-detection calls a context.getFilename() that
  // ESLint 10 removed, crashing react/display-name on every file. Setting
  // the version explicitly skips that detection path.
  {
    settings: { react: { version: '19.2.8' } },
  },
  // Type-aware linting, scoped to source -- type-checking e2e/ too would
  // mean a second tsconfig. no-floating-promises/no-misused-promises catch
  // an event handler or effect that drops an async rejection on the floor.
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: ['src/**/*.{ts,tsx}'],
  })),
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  // A mock standing in for an async API rarely needs to await anything --
  // the point being tested is the shape of the call, not the implementation.
  {
    files: ['src/**/*.test.{ts,tsx}'],
    rules: {
      '@typescript-eslint/require-await': 'off',
    },
  },
  // eslint-config-next's core-web-vitals bundles eslint-plugin-jsx-a11y
  // transitively but only enables 6 of its rules (verified with
  // `eslint --print-config`). core-web-vitals already registers the
  // plugin under the "jsx-a11y" namespace, so only apply the fuller rule
  // set here -- redeclaring `plugins` errors with "Cannot redefine plugin".
  // Scoped to JSX-bearing app source, not tests (which don't ship to users).
  {
    files: ['src/app/**/*.tsx'],
    ignores: ['src/app/**/*.test.tsx'],
    rules: {
      ...jsxA11y.flatConfigs.strict.rules,
      // Crashes ("_minimatch.default is not a function") under this repo's
      // minimatch@10 override (see design-decisions.md's advisory section)
      // -- the rule's `mayContainChildComponent` helper calls minimatch as
      // a default export, which v10's CJS build no longer has. No other
      // jsx-a11y rule uses that helper. @axe-core/playwright's runtime
      // check covers missing form labels instead.
      'jsx-a11y/label-has-associated-control': 'off',
    },
  },
  // Maintainability/code-smell analysis, scoped like the type-aware block
  // above and not to tests -- a test's job is to be exhaustive, not
  // non-repetitive, and cognitive-complexity budgets belong to the logic
  // under test, not the assertions describing it.
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/**/*.test.{ts,tsx}'],
    ...sonarjs.configs.recommended,
    // sonarjs.configs.recommended sets settings.react to a placeholder
    // version; without repeating the fix above, ESLint's flat config would
    // let that clobber it for every file this block also matches, since a
    // later config's `settings` key wins over an earlier one wholesale
    // rather than merging per nested field.
    settings: { react: { version: '19.2.8' } },
    rules: {
      ...sonarjs.configs.recommended.rules,
      // Fires on every repeated Tailwind className string, not on
      // duplicated business logic -- see design-decisions.md's advisory
      // section for the same near-identical problem already documented for
      // Stryker mutating JSX/Tailwind strings.
      'sonarjs/no-duplicate-string': 'off',
      // Conflicts with this codebase's established `void somePromise`
      // convention for marking an intentionally-unawaited promise (~30
      // call sites) and TypeScript's own `const x: never = y; void x;`
      // exhaustiveness-check idiom (Icon/index.tsx) -- both are exactly
      // what `@typescript-eslint/no-floating-promises` (already on, via
      // recommendedTypeChecked above) requires as the fix for a dropped
      // promise, so this rule would flag the correct answer to another
      // rule's own error.
      'sonarjs/void-use': 'off',
      // Would require wrapping nearly every component's props type in
      // `Readonly<...>` -- a house-style adoption this codebase hasn't
      // made anywhere yet (checked: zero existing uses), not a small fix
      // to the ~30 files the initial run flagged. Worth adopting
      // incrementally, the same way component test coverage was rolled
      // out (see design-decisions.md), not as a drive-by of this change.
      'sonarjs/prefer-read-only-props': 'off',
      // The plugin's default (15) flagged functions with real, deliberate
      // branching -- straight-line guard clauses and small state
      // dispatch, not deep nesting -- as "too complex" project-wide.
      // Raised to the lowest value that leaves the codebase's actual
      // distribution clean: after simplifying ItemList/index.tsx's main
      // component (28, mostly nested-ternary JSX flattened into `&&`
      // blocks elsewhere in this change) the highest score left is 21,
      // Map/usePlaces.tsx's partitionByStoredCoords -- suppressed at its
      // own definition instead of lowering this further, since it's
      // already covered by mutation-targets.mjs's 100% floor and
      // splitting its two bookkeeping loops wouldn't reduce the actual
      // logic, just where the lines sit. Everything else in the codebase
      // is at 18 or below.
      'sonarjs/cognitive-complexity': ['warn', 20],
    },
  },
  // Components talk to Supabase through data/, never the client directly.
  // Scoped to components/, not the whole app: the top-level auth/session
  // surface has nowhere else to live.
  {
    files: ['src/app/components/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/supabase', '**/supabase.ts'],
              message:
                "Components don't talk to Supabase directly -- add what you need to data/ (or data/auth.ts for the current user) and import that instead.",
            },
          ],
        },
      ],
    },
  },
];

export default eslintConfig;

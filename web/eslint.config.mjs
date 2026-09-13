import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
import tseslint from 'typescript-eslint';
import jsxA11y from 'eslint-plugin-jsx-a11y';

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

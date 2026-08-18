import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
import tseslint from 'typescript-eslint';

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

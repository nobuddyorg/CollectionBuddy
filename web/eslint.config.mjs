import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
import tseslint from 'typescript-eslint';

const eslintConfig = [
  // Generated output, not source. Coverage was the first: linting it flagged
  // a stray "unused eslint-disable directive" left over by the coverage tool
  // itself. The rest are working directories that only exist when a run was
  // interrupted -- Stryker's sandbox is a whole second copy of the project,
  // so a killed mutation run otherwise leaves `npm run lint` reporting
  // hundreds of errors in files that are not the ones being edited.
  //
  // database.types.ts is generated too (`supabase gen types`) -- CI's own
  // drift check (the "Verify database.types.ts matches the schema" step)
  // is what keeps it honest, not lint. Hand-editing it to satisfy a rule
  // here would just be undone by the next regeneration.
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
  // Type-aware linting, scoped to source (type-checking the whole project,
  // e2e/ included, would mean creating and maintaining a second tsconfig
  // for it). no-floating-promises and no-misused-promises catch an event
  // handler or an effect that drops an async call's rejection on the floor
  // -- something the type checker alone doesn't -- and turning this on
  // found two real instances the first time (useSession.ts's initial load,
  // useAuthRedirect.ts's session check).
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
  // the point being tested is the shape of the call, not the
  // implementation -- so this rule is noise here in a way it isn't in
  // production code.
  {
    files: ['src/**/*.test.{ts,tsx}'],
    rules: {
      '@typescript-eslint/require-await': 'off',
    },
  },
  // Components talk to Supabase through data/ (table and storage queries)
  // or data/auth.ts (the current user) -- never the client directly. Scoped
  // to components/ rather than the whole app: the top-level auth/session
  // surface (useSession.ts, page.tsx, login/*) has nowhere else to live,
  // since there is no data/auth.ts equivalent for session management itself.
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

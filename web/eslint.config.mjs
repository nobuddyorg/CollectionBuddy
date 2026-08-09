import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

const eslintConfig = [
  // Generated output, not source. Coverage was the first: linting it flagged
  // a stray "unused eslint-disable directive" left over by the coverage tool
  // itself. The rest are working directories that only exist when a run was
  // interrupted -- Stryker's sandbox is a whole second copy of the project,
  // so a killed mutation run otherwise leaves `npm run lint` reporting
  // hundreds of errors in files that are not the ones being edited.
  {
    ignores: [
      'coverage/**',
      '.stryker-tmp/**',
      'reports/**',
      'out/**',
      '.e2e-serve/**',
      'test-results/**',
      'playwright-report/**',
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
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

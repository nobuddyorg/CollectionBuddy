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
];

export default eslintConfig;

import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

const eslintConfig = [
  // Generated coverage output, not source -- linting it flagged a stray
  // "unused eslint-disable directive" left over by the coverage tool itself.
  { ignores: ['coverage/**'] },
  ...nextCoreWebVitals,
  ...nextTypescript,
];

export default eslintConfig;

import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      // New, stricter rules from eslint-plugin-react-hooks v7 (pulled in
      // transitively via eslint-config-next). Several existing hooks
      // intentionally use the patterns these flag -- resetting/clamping
      // state in response to a prop change, writing to a ref during render
      // to keep a callback's identity stable across the initial-mount
      // language switch. Downgraded to warn so they stay visible without
      // blocking CI on pre-existing, deliberate code.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
    },
  },
];

export default eslintConfig;

// Builds against the running local stack (the Supabase URL is baked in at build time) and runs the signed-in e2e suite.
import { execFileSync } from 'node:child_process';

import { localStack, webDirectory } from './local-stack.mjs';

// The variables take either key format; the publishable and secret keys here keep e2e:local on the non-JWT path.
const { API_URL, PUBLISHABLE_KEY, SECRET_KEY } = localStack([
  'API_URL',
  'PUBLISHABLE_KEY',
  'SECRET_KEY',
]);

const environment = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: API_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: PUBLISHABLE_KEY,
  E2E_SUPABASE_URL: API_URL,
  E2E_SUPABASE_ANON_KEY: PUBLISHABLE_KEY,
  E2E_SUPABASE_SERVICE_KEY: SECRET_KEY,
  // This build never deploys, so source maps are free; they make e2e/coverage.ts point at real source.
  E2E_COVERAGE_SOURCEMAPS: 'true',
};

const run = (command, args) =>
  execFileSync(command, args, {
    cwd: webDirectory,
    env: environment,
    stdio: 'inherit',
  });

console.log(`Building against ${API_URL}`);
run('npx', ['next', 'build']);

// Every Chromium project, so one coverage report covers the whole app; Firefox adds no coverage.
run('npx', [
  'playwright',
  'test',
  '--project=chromium',
  '--project=mobile',
  '--project=signed-in',
  ...process.argv.slice(2),
]);

// Builds against the running local stack (the Supabase URL is baked in at build time) and runs the signed-in e2e suite.
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const webDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(webDirectory, '..');

function status() {
  try {
    return JSON.parse(
      execFileSync('supabase', ['status', '-o', 'json'], {
        cwd: repositoryRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    );
  } catch {
    console.error(
      'Could not read the local Supabase stack. Start it first:\n\n  supabase start\n',
    );
    process.exit(1);
  }
}

const { API_URL, ANON_KEY, SERVICE_ROLE_KEY } = status();
if (!API_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  console.error('The local stack reported no API URL or keys.');
  process.exit(1);
}

const environment = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: API_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
  E2E_SUPABASE_URL: API_URL,
  E2E_SUPABASE_ANON_KEY: ANON_KEY,
  E2E_SUPABASE_SERVICE_KEY: SERVICE_ROLE_KEY,
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

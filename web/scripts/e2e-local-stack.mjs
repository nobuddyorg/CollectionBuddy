// Builds the app against a running local Supabase stack and runs the
// signed-in end-to-end suite against it.
//
// Usage: npm run e2e:local        (with `supabase start` already up)
//
// One script rather than a list of commands in the docs and a copy of that
// list in the workflow: the keys have to be read out of the running stack and
// the *build* has to be pointed at it too, because the Supabase URL is baked
// into the bundle at build time. Getting that second part wrong produces a
// suite that passes while testing a bundle talking to production.
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const webDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(webDir, '..');

function status() {
  try {
    return JSON.parse(
      execFileSync('supabase', ['status', '-o', 'json'], {
        cwd: repoRoot,
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

const env = {
  ...process.env,
  // What the bundle talks to. Baked in at build time, which is why the build
  // happens here rather than being assumed to have already happened.
  NEXT_PUBLIC_SUPABASE_URL: API_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
  // What the suite's setup step uses to create the user and sign it in.
  E2E_SUPABASE_URL: API_URL,
  E2E_SUPABASE_ANON_KEY: ANON_KEY,
  E2E_SUPABASE_SERVICE_KEY: SERVICE_ROLE_KEY,
};

const run = (command, args) =>
  execFileSync(command, args, { cwd: webDir, env, stdio: 'inherit' });

console.log(`Building against ${API_URL}`);
run('npx', ['next', 'build']);

// `--project=signed-in` pulls in the setup project it depends on, and leaves
// the signed-out suite to the job that already runs it against the export.
run('npx', [
  'playwright',
  'test',
  '--project=signed-in',
  ...process.argv.slice(2),
]);

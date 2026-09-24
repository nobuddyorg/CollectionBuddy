// Demo mode against the local stack: every visitor is signed in as a fresh anonymous user, so no OAuth is needed.
import { spawn, execFileSync } from 'node:child_process';
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
      'Could not read the local Supabase stack. Start it first:\n\n  supabase start\n  supabase db reset\n',
    );
    process.exit(1);
  }
}

const { API_URL, ANON_KEY } = status();
if (!API_URL || !ANON_KEY) {
  console.error('The local stack reported no API URL or anon key.');
  process.exit(1);
}

const environment = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: API_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
  NEXT_PUBLIC_DEMO_MODE: 'true',
};

console.log(`Starting the demo against ${API_URL}`);
const child = spawn('npx', ['next', 'dev'], {
  cwd: webDirectory,
  env: environment,
  stdio: 'inherit',
});
child.on('exit', (code) => process.exit(code ?? 0));

// Demo mode against the local stack: every visitor is signed in as a fresh anonymous user, so no OAuth is needed.
import { spawn } from 'node:child_process';

import { localStack, webDirectory } from './local-stack.mjs';

const { API_URL, PUBLISHABLE_KEY } = localStack(['API_URL', 'PUBLISHABLE_KEY']);

const environment = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: API_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: PUBLISHABLE_KEY,
  NEXT_PUBLIC_DEMO_MODE: 'true',
};

console.log(`Starting the demo against ${API_URL}`);
const child = spawn('npx', ['next', 'dev'], {
  cwd: webDirectory,
  env: environment,
  stdio: 'inherit',
});
child.on('exit', (code) => process.exit(code ?? 0));

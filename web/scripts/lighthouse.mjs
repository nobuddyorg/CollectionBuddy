// Lighthouse CI against the production export, signed out and signed in (demo mode), served as GitHub Pages serves it.
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

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

const { API_URL, ANON_KEY } = status();
if (!API_URL || !ANON_KEY) {
  console.error('The local stack reported no API URL or anon key.');
  process.exit(1);
}

const run = ({ command, args, environment }) =>
  execFileSync(command, args, {
    cwd: webDirectory,
    env: environment,
    stdio: 'inherit',
  });

const baseEnvironment = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: API_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
  // chrome-launcher reads CHROME_PATH; the e2e suite's Chromium spares a second browser download.
  CHROME_PATH: process.env.CHROME_PATH ?? chromium.executablePath(),
};

console.log(`Building the signed-out export against ${API_URL}`);
run({
  command: 'npx',
  args: ['next', 'build'],
  environment: baseEnvironment,
});

console.log('Running Lighthouse CI against the signed-out export...');
run({
  command: 'npx',
  args: ['lhci', 'autorun', '--config=lighthouserc.signed-out.json'],
  environment: baseEnvironment,
});

console.log(`Building the signed-in (demo mode) export against ${API_URL}`);
run({
  command: 'npx',
  args: ['next', 'build'],
  environment: { ...baseEnvironment, NEXT_PUBLIC_DEMO_MODE: 'true' },
});

console.log('Running Lighthouse CI against the signed-in export...');
run({
  command: 'npx',
  args: ['lhci', 'autorun', '--config=lighthouserc.signed-in.json'],
  environment: baseEnvironment,
});

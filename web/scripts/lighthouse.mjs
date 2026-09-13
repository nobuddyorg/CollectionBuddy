// Runs Lighthouse CI against the real production export, twice: once
// signed out (the plain static build) and once signed in (demo mode, which
// signs the visitor in as a fresh anonymous user -- see scripts/demo.mjs).
// Both builds point at a local Supabase stack rather than needing repo
// secrets, and both are served exactly as GitHub Pages serves the real
// site (scripts/serve-export.mjs), never `next dev`.
//
// Usage: npm run lighthouse        (with `supabase start` already up)
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

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

const { API_URL, ANON_KEY } = status();
if (!API_URL || !ANON_KEY) {
  console.error('The local stack reported no API URL or anon key.');
  process.exit(1);
}

const run = (command, args, env) =>
  execFileSync(command, args, { cwd: webDir, env, stdio: 'inherit' });

const baseEnv = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: API_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
  // Same Chromium the e2e suite already needs (`npx playwright install
  // --with-deps chromium`), not a second browser download -- chrome-launcher
  // (what Lighthouse itself uses to drive Chrome) reads this variable.
  CHROME_PATH: process.env.CHROME_PATH ?? chromium.executablePath(),
};

console.log(`Building the signed-out export against ${API_URL}`);
run('npx', ['next', 'build'], baseEnv);

console.log('Running Lighthouse CI against the signed-out export...');
run(
  'npx',
  ['lhci', 'autorun', '--config=lighthouserc.signed-out.json'],
  baseEnv,
);

console.log(`Building the signed-in (demo mode) export against ${API_URL}`);
run('npx', ['next', 'build'], { ...baseEnv, NEXT_PUBLIC_DEMO_MODE: 'true' });

console.log('Running Lighthouse CI against the signed-in export...');
run(
  'npx',
  ['lhci', 'autorun', '--config=lighthouserc.signed-in.json'],
  baseEnv,
);

// Lighthouse CI against the production export, signed out and signed in to a photographed collection, served as GitHub Pages serves it.
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
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

const { API_URL, PUBLISHABLE_KEY, SECRET_KEY } = status();
if (!API_URL || !PUBLISHABLE_KEY || !SECRET_KEY) {
  console.error('The local stack reported no API URL or keys.');
  process.exit(1);
}

// lighthouserc.signed-in.json's --user-data-dir and upload.outputDir.
const PROFILE_DIRECTORY = '.lighthouse-profile';
const SIGNED_IN_MANIFEST = 'lighthouse-reports/signed-in/manifest.json';

const run = ({ command, args, environment }) =>
  execFileSync(command, args, {
    cwd: webDirectory,
    env: environment,
    stdio: 'inherit',
  });

const baseEnvironment = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: API_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: PUBLISHABLE_KEY,
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

console.log(
  'Seeding a photographed collection and signing its collector in...',
);
run({
  command: 'node',
  args: ['scripts/lighthouse-collector.ts', PROFILE_DIRECTORY],
  environment: {
    ...baseEnvironment,
    E2E_SUPABASE_URL: API_URL,
    E2E_SUPABASE_ANON_KEY: PUBLISHABLE_KEY,
    E2E_SUPABASE_SERVICE_KEY: SECRET_KEY,
  },
});

console.log('Running Lighthouse CI against the signed-in export...');
try {
  run({
    command: 'npx',
    args: ['lhci', 'autorun', '--config=lighthouserc.signed-in.json'],
    environment: baseEnvironment,
  });
} finally {
  rmSync(PROFILE_DIRECTORY, { recursive: true, force: true });
}

// No lhci assertion tells a signed-out or photo-less page from the grid, and either would pass every budget.
for (const { jsonPath } of JSON.parse(
  readFileSync(SIGNED_IN_MANIFEST, 'utf8'),
)) {
  const { audits } = JSON.parse(readFileSync(jsonPath, 'utf8'));
  // A list of tables; the first holds the element's node.
  const [elementTable] =
    audits['largest-contentful-paint-element']?.details?.items ?? [];
  const snippet = elementTable?.items?.[0]?.node?.snippet ?? '';
  if (!snippet.includes('data-testid="item-image"')) {
    console.error(
      `The signed-in pass's largest paint was not a photograph, so it measured no photo grid (${jsonPath}).`,
    );
    process.exit(1);
  }
}

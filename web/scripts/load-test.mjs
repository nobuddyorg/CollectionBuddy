// Runs one k6 script from load/ against a Supabase project; the same script CI runs (docs/how-to/load-testing.md).
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout } from 'node:timers/promises';
import { parseArgs } from 'node:util';

import {
  STATS_FLUSH_MS,
  dbReportMarkdown,
  finishDbCapture,
  startDbCapture,
} from './load-db-report.mjs';

const FLOWS = ['smoke', 'catalogue', 'shared-viewer', 'write', 'population'];
const PROFILES = ['normal', 'peak', 'stress'];
const webDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(webDir, '..');

function fail(message) {
  console.error(message);
  process.exit(1);
}

function supabaseStatus() {
  try {
    return execFileSync('supabase', ['status', '-o', 'json'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    fail(
      'Could not read the local Supabase stack. Start it first:\n\n  supabase start\n',
    );
  }
}

function localStack() {
  const { API_URL, ANON_KEY, DB_URL } = JSON.parse(supabaseStatus());
  return { url: API_URL, anonKey: ANON_KEY, dbUrl: DB_URL };
}

function hosted(confirmed) {
  if (!confirmed) {
    fail(
      '--target hosted loads the production project; add --confirm-production to mean it.',
    );
  }
  const url = process.env.LOAD_SUPABASE_URL;
  const anonKey = process.env.LOAD_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    fail('--target hosted needs LOAD_SUPABASE_URL and LOAD_SUPABASE_ANON_KEY.');
  }
  return { url, anonKey };
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    target: { type: 'string', default: 'local-stack' },
    profile: { type: 'string', default: 'normal' },
    'confirm-production': { type: 'boolean', default: false },
  },
});
const [flow] = positionals;
if (!FLOWS.includes(flow)) fail(`Pick a flow: ${FLOWS.join(', ')}`);
if (!PROFILES.includes(values.profile)) {
  fail(`--profile must be one of ${PROFILES.join(', ')}`);
}

const confirmed = values['confirm-production'];
const targets = { 'local-stack': localStack, hosted: () => hosted(confirmed) };
if (!Object.hasOwn(targets, values.target)) {
  fail(`--target must be local-stack or hosted, not ${values.target}`);
}
const project = targets[values.target]();

// k6 writes the summary files handleSummary names but will not create their directory.
mkdirSync(resolve(webDir, 'load-results'), { recursive: true });

function runK6() {
  console.log(
    `k6 ${flow}, ${values.profile} profile, against ${values.target} (${project.url})`,
  );
  const { status } = spawnSync(
    'k6',
    ['run', '--out', 'web-dashboard', `load/${flow}.js`],
    {
      cwd: webDir,
      stdio: 'inherit',
      env: {
        ...process.env,
        LOAD_SUPABASE_URL: project.url,
        LOAD_SUPABASE_ANON_KEY: project.anonKey,
        LOAD_TARGET: values.target,
        LOAD_CONFIRM_PRODUCTION: String(confirmed),
        LOAD_PROFILE: values.profile,
        K6_NO_USAGE_REPORT: 'true',
        // The dashboard's HTML report only; port -1 keeps k6 from serving a live page it would then wait on.
        K6_WEB_DASHBOARD_PORT: '-1',
        K6_WEB_DASHBOARD_EXPORT: `load-results/${flow}.html`,
      },
    },
  );
  return status ?? 1;
}

// The hosted database is never reachable from here (CLAUDE.md: no SUPABASE_DB_URL), so only a local run gets the Postgres report.
if (values.target !== 'local-stack') process.exit(runK6());

let before;
try {
  before = startDbCapture(project.dbUrl);
} catch (error) {
  fail(
    `Could not read Postgres statistics (needs psql on PATH, as supabase/splinter.sh does): ${error.message}`,
  );
}
const status = runK6();
await setTimeout(STATS_FLUSH_MS);
const dbReport = `load-results/${flow}.db.md`;
const dbMarkdown = dbReportMarkdown(
  `\`${flow}\`, \`${values.profile}\` profile`,
  finishDbCapture(project.dbUrl, before),
);
writeFileSync(resolve(webDir, dbReport), dbMarkdown);
// Printed like k6's own table, so the job log carries it for whoever cannot open the artifact.
console.log(`${dbMarkdown}\nPostgres report: ${dbReport}`);
process.exit(status);

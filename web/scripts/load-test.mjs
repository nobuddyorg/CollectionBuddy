// Runs one k6 script from load/ against a Supabase project; the same script CI runs (docs/how-to/load-testing.md).
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const FLOWS = ['smoke', 'catalogue', 'shared-viewer', 'write'];
const webDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(webDir, '..');

function fail(message) {
  console.error(message);
  process.exit(1);
}

function localStack() {
  try {
    const { API_URL, ANON_KEY } = JSON.parse(
      execFileSync('supabase', ['status', '-o', 'json'], {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    );
    return { url: API_URL, anonKey: ANON_KEY };
  } catch {
    return fail(
      'Could not read the local Supabase stack. Start it first:\n\n  supabase start\n',
    );
  }
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
    'confirm-production': { type: 'boolean', default: false },
  },
});
const [flow] = positionals;
if (!FLOWS.includes(flow)) fail(`Pick a flow: ${FLOWS.join(', ')}`);

const confirmed = values['confirm-production'];
const targets = { 'local-stack': localStack, hosted: () => hosted(confirmed) };
const resolveProject =
  targets[values.target] ??
  fail(`--target must be local-stack or hosted, not ${values.target}`);
const project = resolveProject();

// k6 writes the summary files handleSummary names but will not create their directory.
mkdirSync(resolve(webDir, 'load-results'), { recursive: true });

console.log(`k6 ${flow} against ${values.target} (${project.url})`);
const { status } = spawnSync('k6', ['run', `load/${flow}.js`], {
  cwd: webDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    LOAD_SUPABASE_URL: project.url,
    LOAD_SUPABASE_ANON_KEY: project.anonKey,
    LOAD_TARGET: values.target,
    LOAD_CONFIRM_PRODUCTION: String(confirmed),
    K6_NO_USAGE_REPORT: 'true',
  },
});
process.exit(status ?? 1);

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

export const webDirectory = resolve(import.meta.dirname, '..');
const repositoryRoot = resolve(webDirectory, '..');

function readStatus() {
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

export function localStack(requiredKeys) {
  const status = readStatus();
  const missing = requiredKeys.filter((key) => !status[key]);
  if (missing.length > 0) {
    // Key names only: SECRET_KEY's value must never reach a log.
    console.error(`The local stack reported no ${missing.join(', ')}.`);
    process.exit(1);
  }
  return status;
}

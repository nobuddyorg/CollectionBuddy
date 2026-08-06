// Serves the static export the way GitHub Pages does: under the base path,
// not at the root.
//
// That distinction is the whole point. `next build` bakes the base path into
// every asset URL, every router link and the manifest, so an export served at
// `/` answers 404 to nearly everything it asks for -- and a suite pointed at
// it would be testing a site that has never existed. The directory built below
// exists only to put `out/` one level down, at the name the base path expects.
//
// Usage: node scripts/serve-export.mjs <port> [basePath]
//
// Started by playwright.config.ts, which passes the base path it read from
// next.config.ts -- this script deliberately does not know the name itself.
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const webDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = process.argv[2] ?? '4173';
const basePath = (process.argv[3] ?? '').replace(/^\//, '');

const scratch = resolve(webDir, '.e2e-serve');
const out = resolve(webDir, 'out');

let root = out;
if (basePath) {
  rmSync(scratch, { recursive: true, force: true });
  mkdirSync(scratch, { recursive: true });
  symlinkSync(out, resolve(scratch, basePath), 'dir');
  root = scratch;
}

const cleanUp = () => rmSync(scratch, { recursive: true, force: true });

const child = spawn('npx', ['serve', root, '-l', port], {
  cwd: webDir,
  stdio: 'inherit',
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    child.kill();
    cleanUp();
  });
}
child.on('exit', (code) => {
  cleanUp();
  process.exit(code ?? 0);
});

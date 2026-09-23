// Serves out/ under the base path playwright.config.ts passes (`<port> [basePath]`), as GitHub Pages does; at `/` it 404s.
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const webDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = process.argv[2] ?? '4173';
const basePath = (process.argv[3] ?? '').replace(/^\//, '');

const scratch = resolve(webDirectory, '.e2e-serve');
const out = resolve(webDirectory, 'out');

let root = out;
if (basePath) {
  rmSync(scratch, { recursive: true, force: true });
  mkdirSync(scratch, { recursive: true });
  symlinkSync(out, resolve(scratch, basePath), 'dir');
  root = scratch;
}

const cleanUp = () => rmSync(scratch, { recursive: true, force: true });

const child = spawn('npx', ['serve', root, '-l', port], {
  cwd: webDirectory,
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

// The shards' Stryker reports as one: `node scripts/mutation-merge.mjs <shard folder>...`, each holding mutation.json, stryker-incremental.json and targets.txt.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

// Where a single run writes them: the summary, the dashboard and the next run's incremental mode read them there.
const OUTPUTS = {
  'mutation.json': 'reports/mutation/mutation.json',
  'stryker-incremental.json': 'reports/stryker-incremental.json',
};

/** Each file from the shard that mutated it (a report also carries the incremental file's older results for the rest); tests renumbered, one id per file and name, since every shard counts from 0. */
function merge(shards) {
  const merged = { ...shards[0].report, files: {}, testFiles: {} };
  const ids = new Map();
  for (const { report, targets } of shards) {
    const renamed = new Map();
    for (const [path, testFile] of Object.entries(report.testFiles ?? {})) {
      merged.testFiles[path] ??= { ...testFile, tests: [] };
      for (const test of testFile.tests) {
        const key = `${path}\u0000${test.name}`;
        if (!ids.has(key)) {
          ids.set(key, String(ids.size));
          merged.testFiles[path].tests.push({ ...test, id: ids.get(key) });
        }
        renamed.set(test.id, ids.get(key));
      }
    }
    const rename = (testIds) => testIds?.map((id) => renamed.get(id));
    for (const path of targets) {
      const file = report.files[path];
      if (!file)
        throw new Error(`The shard given ${path} reported nothing for it`);
      if (path in merged.files) throw new Error(`Two shards mutated ${path}`);
      merged.files[path] = {
        ...file,
        mutants: file.mutants.map((mutant) => ({
          ...mutant,
          ...(mutant.coveredBy && { coveredBy: rename(mutant.coveredBy) }),
          ...(mutant.killedBy && { killedBy: rename(mutant.killedBy) }),
        })),
      };
    }
  }
  return merged;
}

const folders = process.argv.slice(2);
if (folders.length === 0) {
  throw new Error('Usage: node scripts/mutation-merge.mjs <shard folder>...');
}
for (const [name, output] of Object.entries(OUTPUTS)) {
  const shards = await Promise.all(
    folders.map(async (folder) => ({
      report: JSON.parse(await readFile(join(folder, name), 'utf8')),
      targets: (await readFile(join(folder, 'targets.txt'), 'utf8'))
        .trim()
        .split(','),
    })),
  );
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(merge(shards)));
}

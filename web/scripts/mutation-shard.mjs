// The mutation targets one CI shard mutates, as Stryker's comma-separated --mutate: `node scripts/mutation-shard.mjs <shard> <of>`.
import { statSync } from 'node:fs';

import { MUTATE_TARGETS } from '../mutation-targets.mjs';

const [shard, of] = process.argv.slice(2).map(Number);
if (!(
  Number.isInteger(shard) &&
  Number.isInteger(of) &&
  shard >= 1 &&
  shard <= of
)) {
  throw new Error(
    'Usage: node scripts/mutation-shard.mjs <shard> <of>, 1 <= shard <= of',
  );
}

// Source size stands in for mutant count: the largest first, each to the lightest shard, so every machine is done at about the same time.
const bySize = MUTATE_TARGETS.map((path) => ({
  path,
  size: statSync(path).size,
})).sort((a, b) => b.size - a.size || a.path.localeCompare(b.path));
const shards = Array.from({ length: of }, () => ({ size: 0, paths: [] }));
for (const target of bySize) {
  const lightest = shards.reduce((min, next) =>
    next.size < min.size ? next : min,
  );
  lightest.size += target.size;
  lightest.paths.push(target.path);
}

process.stdout.write(shards[shard - 1].paths.join(','));

import { chunk } from '../lib/chunk';
import { REMOVE_OBJECTS_BATCH_SIZE, removeImageObjects } from './images';

type Outcome = { error: Error | null };

/** The Storage objects an `images` row names: the full size, and the thumbnail when it has one. */
export function objectPathsOf(row: {
  path_full: string;
  path_thumb: string | null;
}): string[] {
  return row.path_thumb ? [row.path_full, row.path_thumb] : [row.path_full];
}

/** Every delete path's order: a row that is gone can no longer name its objects, and only Storage deletes bytes. */
export async function removeObjectsThenRows({
  paths,
  deleteRows,
  removeObjects = removeImageObjects,
}: {
  paths: string[];
  deleteRows: () => PromiseLike<Outcome>;
  removeObjects?: (paths: string[]) => PromiseLike<Outcome>;
}): Promise<Outcome> {
  for (const batch of chunk(paths, REMOVE_OBJECTS_BATCH_SIZE)) {
    const { error } = await removeObjects(batch);
    if (error) return { error };
  }
  return deleteRows();
}

import { readAllKeysetPages } from '../lib/pages';
import { supabase } from '../supabase';
import { objectPathsOf, removeObjectsThenRows } from './imageRemoval';
import type { ImageListRow } from './images';

// PostgREST caps an unranged request at max_rows (supabase/config.toml) and truncates silently.
const ROW_PAGE_SIZE = 1000;

type OwnImagePathRow = Omit<ImageListRow, 'item_id'>;

// Keyset-paged down images_pkey; the user_id filter keeps out the rows a grant shows, which are another owner's.
function rawListOwnImagePaths({
  userId,
  after,
}: {
  userId: string;
  after: OwnImagePathRow | null;
}) {
  let query = supabase
    .from('images')
    .select('id, path_full, path_thumb')
    .eq('user_id', userId);
  if (after) query = query.gt('id', after.id);
  return query
    .order('id')
    .limit(ROW_PAGE_SIZE)
    .overrideTypes<OwnImagePathRow[], { merge: false }>();
}

/** Every Storage path the user's own photograph rows name, the ones editors added to its entries included. */
export async function listOwnImagePaths(
  userId: string,
): Promise<{ data: string[]; error: null } | { data: null; error: unknown }> {
  const listed = await readAllKeysetPages<OwnImagePathRow>(
    ROW_PAGE_SIZE,
    (after) => rawListOwnImagePaths({ userId, after }),
  );
  if (listed.error !== null) return { data: null, error: listed.error };
  return { data: listed.data.flatMap(objectPathsOf), error: null };
}

/** Photographs first, then every row and the Auth user in one call (0033), then this browser's session. */
export async function deleteOwnAccount(
  userId: string,
): Promise<{ error: unknown }> {
  const listed = await listOwnImagePaths(userId);
  if (listed.data === null) return { error: listed.error };
  const { error } = await removeObjectsThenRows({
    paths: listed.data,
    deleteRows: () => supabase.rpc('delete_own_account'),
  });
  if (error) return { error };
  // The server-side sessions went with the user, so only this browser's copy is left to clear.
  await supabase.auth.signOut({ scope: 'local' });
  return { error: null };
}

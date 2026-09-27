/** What the entries area shows in place of the grid, or the grid itself. */
export type ListView = 'grid' | 'skeleton' | 'loadError' | 'empty';

export function listViewFor({
  itemCount,
  total,
  loading,
  loadFailed,
}: {
  itemCount: number;
  total: number;
  loading: boolean;
  loadFailed: boolean;
}): ListView {
  if (itemCount > 0) return 'grid';
  // Ahead of loading: a retry keeps the error and its focused button in place until an answer arrives.
  if (loadFailed) return 'loadError';
  // A zero-item page with a positive total is a page correction in flight, not an empty collection.
  if (loading || total > 0) return 'skeleton';
  return 'empty';
}

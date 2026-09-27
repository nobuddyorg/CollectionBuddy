/** What the page shows below the category strip. */
export type CatalogueView = 'skeleton' | 'entries' | 'loadError' | 'empty';

export function catalogueViewFor({
  ready,
  hasCategory,
  loadFailed,
}: {
  ready: boolean;
  hasCategory: boolean;
  loadFailed: boolean;
}): CatalogueView {
  if (!ready) return 'skeleton';
  if (hasCategory) return 'entries';
  return loadFailed ? 'loadError' : 'empty';
}

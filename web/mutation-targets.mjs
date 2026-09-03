// The single list of pure, high-risk modules that get both mutation testing
// (stryker.config.mjs) and the stricter per-file coverage floor
// (vitest.config.ts) -- shared so the two lists can't drift apart.
//
// Every file here pairs pure exported logic with a `Stryker disable all`
// region around whatever I/O it sits next to, so what's scored is the part
// that carries the risk.
export const MUTATE_TARGETS = [
  'src/app/data/items.ts',
  'src/app/data/zip.ts',
  'src/app/data/exportFormat.ts',
  'src/app/data/exportCategory.ts',
  'src/app/data/importCategory.ts',
  'src/app/data/photon.ts',
  'src/app/lib/pool.ts',
  'src/app/lib/backoff.ts',
  'src/app/components/CategorySelect/useExportCategory.tsx',
  'src/app/components/ItemList/Pagination.tsx',
  'src/app/components/ItemList/useItemImages.tsx',
  'src/app/lib/optimistic.ts',
  'src/app/components/ItemList/paging.ts',
  'src/app/components/ItemList/imageCache.ts',
  'src/app/components/Map/usePlaces.tsx',
  'src/app/components/Map/useCurrentLocation.ts',
  'src/app/components/Coin/size.ts',
  'src/app/components/CenteredModal/getFocusable.ts',
  'src/app/components/CenteredModal/useEscapeToClose.tsx',
  'src/app/useTheme.ts',
  'src/app/components/ItemForm/usePhoton.tsx',
  'src/app/i18n/I18nProvider.tsx',
];

// Mutation-tested but deliberately without a per-file coverage floor -- see
// Configuration's "Coverage and mutation thresholds" for why.
export const NO_COVERAGE_FLOOR = [
  'src/app/components/Map/usePlaces.tsx',
  'src/app/components/Map/useCurrentLocation.ts',
];

// The single list of pure, high-risk modules that get both mutation testing
// (stryker.config.mjs) and the stricter per-file coverage floor
// (vitest.config.ts). Both configs import this instead of keeping their own
// hand-written copy -- two lists in two formats drifted apart with nothing
// noticing (#370): the two `Map/` hooks below picked up mutation testing
// without anyone adding the matching coverage floor.
//
// Every file here pairs pure exported logic with a `Stryker disable all`
// region around whatever I/O it sits next to, so what is scored is the part
// that carries the risk. Adding a file means first drawing that line in it,
// then adding it here -- both configs pick it up automatically.
export const MUTATE_TARGETS = [
  'src/app/data/items.ts',
  'src/app/data/zip.ts',
  'src/app/data/exportFormat.ts',
  'src/app/data/exportCategory.ts',
  'src/app/data/photon.ts',
  'src/app/components/CategorySelect/useExportCategory.tsx',
  'src/app/components/ItemList/Pagination.tsx',
  'src/app/components/ItemList/useItemImages.tsx',
  'src/app/components/ItemList/optimistic.ts',
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

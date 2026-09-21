// The single list of modules that carry both mutation testing
// (stryker.config.mjs) and the stricter per-file coverage floor
// (vitest.config.mts) -- shared so the two lists can't drift apart.
//
// A file belongs here once its logic is reachable from tests without
// faking the world into a shape nobody would recognise: pure functions,
// the data layer's query construction, and the hooks whose state machines
// are drivable through their own fakes. What stays out is rendering --
// mutating JSX and class strings produces near-equivalent mutants by the
// thousand and a score nobody can act on.
//
// Nothing in these files is suppressed: no `Stryker disable`, no
// `/* v8 ignore */`. A raw call is reached through an injected parameter so
// a test can drive it, and a query builder is asserted by the request it
// composed. A mutant that survives is a missing assertion or dead code --
// the only class no test can reach is a React dependency list, which
// Stryker fills with a constant React reads as unchanged on every render.
export const MUTATE_TARGETS = [
  'src/app/data/items.ts',
  'src/app/data/zip.ts',
  'src/app/data/exportFormat.ts',
  'src/app/data/exportCategory.ts',
  'src/app/data/importCategory.ts',
  'src/app/data/photon.ts',
  'src/app/lib/pool.ts',
  'src/app/lib/backoff.ts',
  'src/app/lib/chunk.ts',
  'src/app/components/CategorySelect/useExportCategory.tsx',
  'src/app/components/ItemList/Pagination.tsx',
  'src/app/components/ItemList/imageEntries.ts',
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
  'src/app/data/importFormat.ts',
  'src/app/data/categories.ts',
  'src/app/data/images.ts',
  'src/app/data/shares.ts',
  'src/app/components/CategorySelect/selection.ts',
  'src/app/components/CategorySelect/useImportCategory.tsx',
  'src/app/components/ItemList/searchStatus.ts',
  'src/app/components/Map/popup.ts',
  'src/app/lib/useRequestSequence.ts',
  'src/app/lib/useSyncedRef.ts',
  'src/app/lib/useDebouncedValue.ts',
  'src/app/lib/useGuardedModalClose.ts',
  'src/app/useCatalogue.ts',
  'src/app/useServiceWorker.ts',
  'src/app/useSession.ts',
  'src/app/components/CategorySelect/useCategories.tsx',
  'src/app/components/CategorySelect/useShares.tsx',
  'src/app/components/CategorySelect/useCategoryRemoval.tsx',
  'src/app/components/ItemList/useItems.tsx',
  'src/app/components/ItemList/useItemMutations.tsx',
  'src/app/components/ItemList/useItemImages.tsx',
  'src/app/components/ItemCreate/useCreateItem.tsx',
  'src/app/components/Header/useMenu.tsx',
  'src/app/components/CenteredModal/useFocusTrap.tsx',
  'src/app/components/CenteredModal/useInertBackground.tsx',
  'src/app/components/CenteredModal/useLockBodyScroll.tsx',
];

// Mutation-tested but deliberately without a per-file coverage floor -- see
// Configuration's "Coverage and mutation thresholds" for why.
export const NO_COVERAGE_FLOOR = [
  'src/app/components/Map/usePlaces.tsx',
  'src/app/components/Map/useCurrentLocation.ts',
];

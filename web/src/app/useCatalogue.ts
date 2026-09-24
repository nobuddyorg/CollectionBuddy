'use client';
import { useCallback, useEffect, useState } from 'react';

import {
  pickInitialCategory,
  readStoredCategory,
  storeSelectedCategory,
} from './components/CategorySelect/selection';
import { useCategories } from './components/CategorySelect/useCategories';
import { prefetchFirstPage } from './components/ItemList/firstPagePrefetch';

/** Waits on the session: category rows are only readable under the signed-in user's RLS policies. */
export function useCatalogue(loading: boolean, userId: string | undefined) {
  const categories = useCategories();
  const { reload } = categories;

  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null,
  );
  // Set in the same tick as the selection, so no render shows categories loaded with nothing selected.
  const [catalogueReady, setCatalogueReady] = useState(false);

  const selectCategory = useCallback((id: string | null) => {
    setSelectedCategoryId(id);
    storeSelectedCategory(id);
  }, []);

  useEffect(() => {
    if (loading || !userId) return;
    const storedId = readStoredCategory();
    if (storedId) prefetchFirstPage(storedId);
    void reload().then((loadedCategories) => {
      setSelectedCategoryId(
        (current) => current ?? pickInitialCategory(loadedCategories, storedId),
      );
      setCatalogueReady(true);
    });
  }, [loading, userId, reload]);

  return { categories, selectedCategoryId, selectCategory, catalogueReady };
}

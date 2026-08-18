'use client';
import { useCallback, useEffect, useState } from 'react';

import {
  pickInitialCategory,
  readStoredCategory,
  storeSelectedCategory,
} from './components/CategorySelect/selection';
import { useCategories } from './components/CategorySelect/useCategories';

/**
 * The signed-in catalogue: the category list, which one is selected, and
 * whether the initial load (list fetched, a selection settled) has
 * resolved. Waits on `loading`/`userId` since these rows are only readable
 * under the signed-in user's RLS policies -- firing before the session
 * resolves just asks for a list Postgres will refuse to return.
 */
export function useCatalogue(loading: boolean, userId: string | undefined) {
  const categories = useCategories();
  const { reload } = categories;

  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null,
  );
  // True only once the first listing is back *and* a category is selected,
  // in the same tick -- otherwise there's a render with categories loaded
  // but nothing selected, which used to flash the "choose a category"
  // prompt unnecessarily.
  const [catalogueReady, setCatalogueReady] = useState(false);

  // Every selection is remembered, so the next visit opens where this one
  // left off rather than on a chooser.
  const selectCategory = useCallback((id: string | null) => {
    setSelectedCategoryId(id);
    storeSelectedCategory(id);
  }, []);

  useEffect(() => {
    if (loading || !userId) return;
    void reload().then((catsData) => {
      // Whatever was last on screen, or the first category. Auto-selecting
      // only a lone category meant owning a second one turned every
      // sign-in into a decision.
      setSelectedCategoryId(
        (current) =>
          current ?? pickInitialCategory(catsData, readStoredCategory()),
      );
      setCatalogueReady(true);
    });
  }, [loading, userId, reload]);

  return { categories, selectedCategoryId, selectCategory, catalogueReady };
}

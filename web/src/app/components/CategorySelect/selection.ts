import type { CategorySummary } from '../../data/categories';

// Namespaced: localStorage is shared with everything else served from this origin.
export const SELECTED_CATEGORY_KEY = 'collectionbuddy.selectedCategory';

/** German collation with base sensitivity: ä sorts with a, and case decides nothing. */
export function sortCategories<T extends { name: string }>(
  categories: readonly T[],
): T[] {
  return [...categories].sort((a, b) =>
    a.name.localeCompare(b.name, 'de', { sensitivity: 'base' }),
  );
}

export function pickInitialCategory(
  categories: readonly CategorySummary[],
  storedId: string | null,
): string | null {
  if (!categories.length) return null;
  if (storedId && categories.some((category) => category.id === storedId)) {
    return storedId;
  }
  return sortCategories(categories)[0].id;
}

export function nextAfterRemoving<T extends { id: string }>(
  sortedCategories: readonly T[],
  removedId: string,
): string | null {
  return (
    sortedCategories.find((category) => category.id !== removedId)?.id ?? null
  );
}

// Storage can throw (Safari private mode, cookies blocked); the preference is not worth failing for.
export function readStoredCategory(): string | null {
  try {
    return window.localStorage.getItem(SELECTED_CATEGORY_KEY);
  } catch {
    return null;
  }
}

export function storeSelectedCategory(id: string | null) {
  try {
    if (id) window.localStorage.setItem(SELECTED_CATEGORY_KEY, id);
    else window.localStorage.removeItem(SELECTED_CATEGORY_KEY);
  } catch {
    // Storage can throw (Safari private mode); the preference is not worth failing for.
  }
}

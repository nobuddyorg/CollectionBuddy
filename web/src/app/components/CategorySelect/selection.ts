import type { CategorySummary } from '../../data/categories';

// Where the last category the user chose is kept. Namespaced because
// localStorage is shared with everything else served from this origin.
export const SELECTED_CATEGORY_KEY = 'collectionbuddy.selectedCategory';

/**
 * The order categories are shown in. German collation with base
 * sensitivity, so ä sorts with a and case doesn't decide anything.
 */
export function sortCategories<T extends { name: string }>(
  cats: readonly T[],
): T[] {
  return [...cats].sort((a, b) =>
    a.name.localeCompare(b.name, 'de', { sensitivity: 'base' }),
  );
}

/**
 * What to show on arrival: the last category chosen, falling back to the
 * first one if there is no such choice to honour (or it's gone).
 */
export function pickInitialCategory(
  cats: readonly CategorySummary[],
  storedId: string | null,
): string | null {
  if (!cats.length) return null;
  if (storedId && cats.some((c) => c.id === storedId)) return storedId;
  return sortCategories(cats)[0].id;
}

// Storage can throw (Safari private mode, cookies blocked); losing the
// preference is a smaller failure than failing to render the catalogue.
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
    // Preference not kept; the session itself is unaffected.
  }
}

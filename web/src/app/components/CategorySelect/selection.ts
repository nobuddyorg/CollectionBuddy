import type { CategorySummary } from '../../data/categories';

// Where the last category the user chose is kept. Namespaced because
// localStorage is shared with everything else served from this origin.
export const SELECTED_CATEGORY_KEY = 'collectionbuddy.selectedCategory';

/**
 * The order the categories are shown in -- and therefore what "the first
 * one" means. German collation with base sensitivity, so ä sorts with a
 * and case doesn't decide anything.
 */
export function sortCategories<T extends { name: string }>(
  cats: readonly T[],
): T[] {
  return [...cats].sort((a, b) =>
    a.name.localeCompare(b.name, 'de', { sensitivity: 'base' }),
  );
}

/**
 * What to show on arrival. Signing in used to land on "choose a category"
 * unless the collection happened to have exactly one, which made the most
 * ordinary case -- open the app, look at my things -- start with a
 * decision. It now opens on the category last chosen, and on the first one
 * when there is no such choice to honour (or the category it named is
 * gone).
 */
export function pickInitialCategory(
  cats: readonly CategorySummary[],
  storedId: string | null,
): string | null {
  if (!cats.length) return null;
  if (storedId && cats.some((c) => c.id === storedId)) return storedId;
  return sortCategories(cats)[0].id;
}

// Storage is allowed to throw -- Safari's private mode does, and a browser
// with cookies blocked can too. Losing the preference is a smaller failure
// than failing to render the catalogue, so both directions swallow it.
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

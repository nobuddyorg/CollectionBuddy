import { supabase } from '../supabase';
import type { Database } from './database.types';

export type CategoryRow = Database['public']['Tables']['categories']['Row'];
export type CategorySummary = Pick<CategoryRow, 'id' | 'name'>;

export function listCategories() {
  return supabase
    .from('categories')
    .select('id,name')
    .returns<CategorySummary[]>();
}

export function createCategory(name: string) {
  return supabase
    .from('categories')
    .insert({ name })
    .select('id,name')
    .single<CategorySummary>();
}

export function deleteCategory(id: string) {
  return supabase.from('categories').delete().eq('id', id);
}

// Item ids linked to this category, used to find what a category deletion
// would orphan.
export function listItemIdsForCategory(categoryId: string) {
  return supabase
    .from('item_categories')
    .select('item_id')
    .eq('category_id', categoryId);
}

// Of the given items, which are still linked to some category other than
// the one being deleted -- i.e. which of them would NOT be orphaned.
export function listItemIdsLinkedElsewhere(
  itemIds: string[],
  excludingCategoryId: string,
) {
  return supabase
    .from('item_categories')
    .select('item_id')
    .in('item_id', itemIds)
    .neq('category_id', excludingCategoryId);
}

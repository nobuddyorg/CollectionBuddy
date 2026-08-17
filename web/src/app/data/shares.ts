import { supabase } from '../supabase';
import type { Database } from './database.types';

export type CategoryShareRow =
  Database['public']['Tables']['category_shares']['Row'];
export type ShareRole = 'viewer' | 'editor';
export type CategoryShareSummary = Pick<
  CategoryShareRow,
  'id' | 'invited_email' | 'expires_at' | 'owner_user_id'
> & { role: ShareRole };

const SHARE_COLUMNS = 'id,invited_email,expires_at,owner_user_id,role';

// One query, two readers: the RLS policy on category_shares (0011) only
// ever returns rows where the caller is the owner or the invited grantee,
// so this comes back as "every grant I've made for this category" for an
// owner and "my own grant, if any" for a recipient -- no client-side
// filtering by uid needed either way.
export function listSharesForCategory(categoryId: string) {
  return supabase
    .from('category_shares')
    .select(SHARE_COLUMNS)
    .eq('category_id', categoryId)
    .returns<CategoryShareSummary[]>();
}

// owner_user_id is required by the generated Insert type because the column
// is `not null` with no default -- same reason createCategory casts around
// it (categories.ts). tg_category_shares_enforce (0011_category_shares.sql)
// fills it in from the category's own owner and re-normalizes the email, so
// the row the insert returns -- not the value sent -- is what a caller
// should render or merge into state.
export function createShare(
  categoryId: string,
  invitedEmail: string,
  expiresAt: string | null,
  role: ShareRole = 'viewer',
) {
  return supabase
    .from('category_shares')
    .insert({
      category_id: categoryId,
      invited_email: invitedEmail,
      expires_at: expiresAt,
      role,
    } as Database['public']['Tables']['category_shares']['Insert'])
    .select(SHARE_COLUMNS)
    .single<CategoryShareSummary>();
}

// Toggles an existing grant between viewer and editor. tg_category_shares_enforce
// (0014_editor_shares.sql) rejects any other column changing in the same
// update, and the "update own category_shares role" policy limits this to
// the owner -- nothing left for this function to decide beyond which row.
export function updateShareRole(id: string, role: ShareRole) {
  return supabase
    .from('category_shares')
    .update({ role })
    .eq('id', id)
    .select(SHARE_COLUMNS)
    .single<CategoryShareSummary>();
}

// Ends a grant. The same call for both directions -- an owner revoking or a
// recipient leaving -- because the "delete own or invited category_shares"
// policy already limits which row a given caller may target; there is
// nothing left for this function to decide.
export function deleteShare(id: string) {
  return supabase.from('category_shares').delete().eq('id', id);
}

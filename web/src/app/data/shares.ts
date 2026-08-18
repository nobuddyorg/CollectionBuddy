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

// The RLS policy on category_shares (0011) only ever returns rows where the
// caller is the owner or the invited grantee, so no client-side filtering
// by uid is needed.
export function listSharesForCategory(categoryId: string) {
  return supabase
    .from('category_shares')
    .select(SHARE_COLUMNS)
    .eq('category_id', categoryId)
    .returns<CategoryShareSummary[]>();
}

// owner_user_id is cast around here since the not-null column has no
// default; tg_category_shares_enforce (0011_category_shares.sql) fills it
// in from the category's own owner and re-normalizes the email, so the row
// the insert returns, not the value sent, is what a caller should use.
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

// tg_category_shares_enforce (0014_editor_shares.sql) rejects any other
// column changing in the same update, and the "update own category_shares
// role" policy limits this to the owner.
export function updateShareRole(id: string, role: ShareRole) {
  return supabase
    .from('category_shares')
    .update({ role })
    .eq('id', id)
    .select(SHARE_COLUMNS)
    .single<CategoryShareSummary>();
}

// Same call for both an owner revoking and a recipient leaving: the
// "delete own or invited category_shares" policy already limits which row
// a given caller may target.
export function deleteShare(id: string) {
  return supabase.from('category_shares').delete().eq('id', id);
}

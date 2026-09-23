import { supabase } from '../supabase';
import type { Database } from './database.types';

type CategoryShareRow = Database['public']['Tables']['category_shares']['Row'];
export type ShareRole = 'viewer' | 'editor';
export type CategoryShareSummary = Pick<
  CategoryShareRow,
  'id' | 'invited_email' | 'expires_at' | 'owner_user_id'
> & { role: ShareRole };

const SHARE_COLUMNS = 'id,invited_email,expires_at,owner_user_id,role';

// RLS returns only rows where the caller is the owner or the invited grantee; no client uid filter.
export function listSharesForCategory(categoryId: string) {
  return supabase
    .from('category_shares')
    .select(SHARE_COLUMNS)
    .eq('category_id', categoryId)
    .overrideTypes<CategoryShareSummary[], { merge: false }>();
}

// tg_category_shares_enforce fills owner_user_id and re-normalizes the email: use the returned row.
export function createShare({
  categoryId,
  invitedEmail,
  expiresAt,
  role = 'viewer',
}: {
  categoryId: string;
  invitedEmail: string;
  expiresAt: string | null;
  role?: ShareRole;
}) {
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

// tg_category_shares_enforce rejects any other column changing; the update policy limits this to owners.
export function updateShareRole(id: string, role: ShareRole) {
  return supabase
    .from('category_shares')
    .update({ role })
    .eq('id', id)
    .select(SHARE_COLUMNS)
    .single<CategoryShareSummary>();
}

// One call for an owner revoking and a recipient leaving: the delete policy limits each to its rows.
export function deleteShare(id: string) {
  return supabase.from('category_shares').delete().eq('id', id);
}

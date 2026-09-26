import { readFileSync } from 'node:fs';

import { createClient } from '@supabase/supabase-js';

import { CONTEXT_PATH, SEED, type SeedContext } from '../fixtures';

export const context = () =>
  JSON.parse(readFileSync(CONTEXT_PATH, 'utf8')) as SeedContext;

/** A PostgREST client carrying one user's access token, and nothing more. */
export function apiAs(token: string) {
  return createClient(
    process.env.E2E_SUPABASE_URL!,
    process.env.E2E_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    },
  );
}

/** Issues a grant as the category's owner; `role` left out is the column default, `viewer`. */
export async function share(grant: {
  token: string;
  categoryId: string;
  invitedEmail: string;
  role?: 'viewer' | 'editor';
  window?: { createdAt: string; expiresAt: string };
}) {
  const { data, error } = await apiAs(grant.token)
    .from('category_shares')
    .insert({
      category_id: grant.categoryId,
      invited_email: grant.invitedEmail,
      ...(grant.role && { role: grant.role }),
      ...(grant.window && {
        created_at: grant.window.createdAt,
        expires_at: grant.window.expiresAt,
      }),
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function unshare(token: string, shareId: string) {
  await apiAs(token).from('category_shares').delete().eq('id', shareId);
}

export async function ownedCategoryId(owner: {
  token: string;
  userId: string;
  name: string;
}) {
  const { data, error } = await apiAs(owner.token)
    .from('categories')
    .select('id')
    .eq('user_id', owner.userId)
    .eq('name', owner.name)
    .single();
  if (error) throw error;
  return data.id;
}

/** One of the owner's seeded categories, plus a throwaway entry of the owner's inside it. */
export async function ownerEntryIn(entry: {
  token: string;
  userId: string;
  category: string;
  title: string;
}): Promise<{ categoryId: string; itemId: string }> {
  const { token, userId, category, title } = entry;
  const categoryId = await ownedCategoryId({ token, userId, name: category });
  const { data: item, error: itemError } = await apiAs(token)
    .from('items')
    .insert({ user_id: userId, title })
    .select('id')
    .single();
  if (itemError) throw itemError;

  const { error: linkError } = await apiAs(token)
    .from('item_categories')
    .insert({ item_id: item!.id, category_id: categoryId });
  if (linkError) throw linkError;

  return { categoryId, itemId: item!.id };
}

export async function editorShare(token: string, categoryId: string) {
  return share({
    token,
    categoryId,
    invitedEmail: SEED.other.email,
    role: 'editor',
  });
}

/** An entry the grantee creates and files into the owner's category, so its `user_id` is the grantee's. */
export async function entryFiledBy(
  grantee: { token: string; categoryId: string },
  title: string,
): Promise<string> {
  const { data: item, error: itemError } = await apiAs(grantee.token)
    .from('items')
    .insert({ title })
    .select('id')
    .single();
  if (itemError) throw itemError;

  const { error: linkError } = await apiAs(grantee.token)
    .from('item_categories')
    .insert({ item_id: item!.id, category_id: grantee.categoryId });
  if (linkError) throw linkError;
  return item!.id;
}

/** Grants edit access again for as long as the grantee takes to remove its entry and photographs. */
export async function removeFiledEntry(entry: {
  token: string;
  otherToken: string;
  categoryId: string;
  itemId: string;
  paths: string[];
}) {
  const shareId = await editorShare(entry.token, entry.categoryId);
  try {
    const grantee = apiAs(entry.otherToken);
    if (entry.paths.length)
      await grantee.storage.from('item-images').remove(entry.paths);
    await grantee.from('items').delete().eq('id', entry.itemId);
  } finally {
    await unshare(entry.token, shareId);
  }
}

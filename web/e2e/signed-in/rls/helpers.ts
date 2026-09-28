import { readFileSync } from 'node:fs';

import { createClient } from '@supabase/supabase-js';

import { fileEntry } from '../collectors';
import { CONTEXT_PATH, SEED, type SeedContext } from '../fixtures';

export const context = () =>
  JSON.parse(readFileSync(CONTEXT_PATH, 'utf8')) as SeedContext;

/** Storage's answer when the storage.objects insert policy refuses an upload. */
export const UPLOAD_REFUSED = {
  statusCode: '403',
  message: 'new row violates row-level security policy',
};

/** Storage's answer for an object no policy lets the caller sign or move; only a stored-object control tells it from absence. */
export const OBJECT_HIDDEN = { statusCode: '404', message: 'Object not found' };

// Typed: the bucket restricts allowed_mime_types, so an untyped Blob is refused on that alone.
export const probeObject = (content: BlobPart = 'probe') =>
  new Blob([content], { type: 'image/webp' });

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

/** A client with no user token, only the anon key. */
export function anonApi() {
  return createClient(
    process.env.E2E_SUPABASE_URL!,
    process.env.E2E_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
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

// The check constraint only demands expires_at > created_at, so an already-expired grant is a legal row.
export function expiredWindow() {
  const hour = 60 * 60 * 1000;
  return {
    createdAt: new Date(Date.now() - 2 * hour).toISOString(),
    expiresAt: new Date(Date.now() - hour).toISOString(),
  };
}

/** Throws, so a revoke that failed surfaces here, not as the next share()'s unique-constraint clash. */
export async function unshare(token: string, shareId: string) {
  const { error } = await apiAs(token)
    .from('category_shares')
    .delete()
    .eq('id', shareId);
  if (error) throw error;
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

/** A seeded entry's id, read as `token`; throws, so a missing row fails here, not as a null id. */
export async function seededEntryId(entry: {
  token: string;
  ownerId: string;
  title: string;
}): Promise<string> {
  const { data, error } = await apiAs(entry.token)
    .from('items')
    .select('id')
    .eq('user_id', entry.ownerId)
    .eq('title', entry.title)
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
  const itemId = await fileEntry(apiAs(token), {
    categoryId,
    fields: { user_id: userId, title },
  });
  return { categoryId, itemId };
}

export async function viewerShare(token: string, categoryId: string) {
  return share({ token, categoryId, invitedEmail: SEED.other.email });
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
  return fileEntry(apiAs(grantee.token), {
    categoryId: grantee.categoryId,
    fields: { title },
  });
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
    if (entry.paths.length) {
      const { error: removeError } = await grantee.storage
        .from('item-images')
        .remove(entry.paths);
      if (removeError) throw removeError;
    }
    const { error } = await grantee
      .from('items')
      .delete()
      .eq('id', entry.itemId);
    if (error) throw error;
  } finally {
    await unshare(entry.token, shareId);
  }
}

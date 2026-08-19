-- Search is substring ILIKE across four text columns OR'd together
-- (ITEMS_SEARCH_SELECT, items.ts), so all four need a trigram index: one
-- unindexed branch collapses the whole query onto a sequential scan.
-- tags_text exists solely to give the tags array a fourth ILIKE-able
-- branch.
begin;

-- Case-insensitive uniqueness of category names, per user.
create unique index if not exists categories_user_lower_name_idx
on public.categories (user_id, lower(name));

-- The list view: a user's items, newest first.
create index if not exists idx_items_user_created_at
on public.items (user_id, created_at desc);

-- The four ILIKE branches.
create index if not exists idx_items_title_trgm
on public.items using gin (title extensions.gin_trgm_ops);

create index if not exists idx_items_description_trgm
on public.items using gin (description extensions.gin_trgm_ops);

create index if not exists idx_items_place_trgm
on public.items using gin (place extensions.gin_trgm_ops);

create index if not exists idx_items_tags_text_trgm
on public.items using gin (tags_text extensions.gin_trgm_ops);

-- Tag filtering by containment, which is an array operation rather than a
-- substring one and needs the array itself.
create index if not exists idx_items_tags_gin
on public.items using gin (tags);

-- Both directions of the mapping, plus the FK cover Postgres wants for
-- cascading deletes.
create index if not exists idx_item_categories_item
on public.item_categories (item_id);

create index if not exists idx_item_categories_category
on public.item_categories (category_id);

create index if not exists idx_item_categories_user
on public.item_categories (user_id);

-- No separate index on category_id alone --
-- category_shares_category_email_unique's own backing index already
-- covers a category_id-first lookup.
create index if not exists idx_category_shares_owner
on public.category_shares (owner_user_id);

create index if not exists idx_category_shares_email
on public.category_shares (invited_email);

-- A thumbnail path is exactly as unique as a full one -- partial, since
-- path_thumb is nullable and a photograph whose thumbnail upload failed
-- (an existing, accepted failure mode -- see uploadImage in
-- useItemImages.tsx) has none.
create unique index if not exists images_path_thumb_key
on public.images (path_thumb)
where path_thumb is not null;

-- The read path: an item's photographs oldest-first, and what capturing
-- paths ahead of an item/category delete filters by. `id` breaks a tie
-- between two photographs uploaded in the same instant, the same reason
-- listItemsForExport orders by (created_at, id) rather than created_at
-- alone.
create index if not exists idx_images_item_created_at
on public.images (item_id, created_at asc, id);

-- Same precedent as item_categories above: index user_id even though
-- item_id already narrows most queries, since RLS is a user_id check and a
-- verification/backfill query wants "every image row this user has"
-- without joining through items.
create index if not exists idx_images_user
on public.images (user_id);

commit;

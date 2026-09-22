-- Trigram indexes are reachable only through search_category_items: ILIKE is not leakproof, so RLS-scoped reads never use them.
begin;

-- Case-insensitive uniqueness of category names, per user.
create unique index categories_user_lower_name_idx
on public.categories (user_id, lower(name));

-- A user's items, newest first.
create index idx_items_user_created_at
on public.items (user_id, created_at desc);

-- The four ILIKE branches of the search.
create index idx_items_title_trgm
on public.items using gin (title extensions.gin_trgm_ops);

create index idx_items_description_trgm
on public.items using gin (description extensions.gin_trgm_ops);

create index idx_items_place_trgm
on public.items using gin (place extensions.gin_trgm_ops);

create index idx_items_tags_text_trgm
on public.items using gin (tags_text extensions.gin_trgm_ops);

-- Tag filtering by containment, an array operation on the array itself.
create index idx_items_tags_gin
on public.items using gin (tags);

-- Both directions of the mapping, plus the FK cover cascading deletes want.
create index idx_item_categories_item
on public.item_categories (item_id);

create index idx_item_categories_category
on public.item_categories (category_id);

create index idx_item_categories_user
on public.item_categories (user_id);

-- The catalogue page drives from item_categories: scoped by category, already in page order, item_id covering.
create index idx_item_categories_cat_created
on public.item_categories (category_id, created_at desc, item_id);

-- No index on category_id alone: category_shares_category_email_unique already covers that prefix.
create index idx_category_shares_owner
on public.category_shares (owner_user_id);

create index idx_category_shares_email
on public.category_shares (invited_email);

-- Partial: a photograph whose thumbnail upload failed has no path_thumb.
create unique index images_path_thumb_key
on public.images (path_thumb)
where path_thumb is not null;

-- An item's photographs oldest-first; id breaks ties between uploads in the same instant.
create index idx_images_item_created_at
on public.images (item_id, created_at asc, id);

create index idx_images_user
on public.images (user_id);

commit;

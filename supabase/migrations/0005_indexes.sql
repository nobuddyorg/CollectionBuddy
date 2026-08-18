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

commit;

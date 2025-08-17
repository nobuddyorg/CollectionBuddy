-- All indexes, including case-insensitive uniqueness and search.
begin;

-- categories: case-insensitive uniqueness per user
create unique index if not exists categories_user_lower_name_idx
on public.categories (user_id, lower(name));

-- items: practical access patterns
create index if not exists idx_items_user_created_at
on public.items (user_id, created_at desc);

create index if not exists idx_items_title_trgm
on public.items using gin (title extensions.gin_trgm_ops);

create index if not exists idx_items_description_trgm
on public.items using gin (description extensions.gin_trgm_ops);

create index if not exists idx_items_place_trgm
on public.items using gin (place extensions.gin_trgm_ops);

create index if not exists idx_items_tags_gin
on public.items using gin (tags);

-- FTS
create index if not exists idx_items_search_gin
on public.items using gin (search);

-- mapping helpers
create index if not exists idx_item_categories_category
on public.item_categories (category_id);

create index if not exists idx_item_categories_user
on public.item_categories (user_id);

-- NEW: cover FK item_id to silence linter & speed joins
create index if not exists idx_item_categories_item
on public.item_categories (item_id);

commit;

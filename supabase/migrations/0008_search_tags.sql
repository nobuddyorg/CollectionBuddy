begin;

-- 1) Immutable helper to join tags
drop function if exists public.join_tags(text[]);
create function public.join_tags(tags text[])
returns text
language sql
immutable
as $$
  select coalesce(array_to_string($1, ' '), '')
$$;

-- 2) Generated text version of tags (what your app expects)
do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'items' and column_name = 'tags_text'
  ) then
    alter table public.items
    add column tags_text text
    generated always as ( public.join_tags(tags) ) stored;
  end if;
end$$;

-- 3) German full-text search column that also includes tags
--    (keep your existing 'search' column; this adds a DE variant)
do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'items' and column_name = 'search_de'
  ) then
    alter table public.items
    add column search_de tsvector
    generated always as (
      setweight(to_tsvector('german', coalesce(title, '')), 'A') ||
      setweight(to_tsvector('german', coalesce(description, '')), 'B') ||
      setweight(to_tsvector('german', coalesce(place, '')), 'C') ||
      setweight(to_tsvector('german', coalesce(public.join_tags(tags), '')), 'D')
    ) stored;
  end if;
end$$;

-- 4) Index for the German FTS column
create index if not exists idx_items_search_de_gin
on public.items using gin (search_de);

commit;

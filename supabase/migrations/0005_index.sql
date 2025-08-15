create extension if not exists pg_trgm;

-- mirror tags for search
alter table public.items add column if not exists tags_text text;

create or replace function public.items_tags_text()
returns trigger language plpgsql as $$
begin
  new.tags_text := array_to_string(coalesce(new.tags, array[]::text[]), ' ');
  return new;
end $$;

drop trigger if exists items_tags_text_biu on public.items;
create trigger items_tags_text_biu
before insert or update on public.items
for each row execute function public.items_tags_text();

-- backfill once
update public.items set tags_text = array_to_string(coalesce(tags, array[]::text[]), ' ');

-- indexes
create index if not exists items_title_trgm on public.items using gin (title gin_trgm_ops);
create index if not exists items_description_trgm on public.items using gin (description gin_trgm_ops);
create index if not exists items_place_trgm on public.items using gin (place gin_trgm_ops);
create index if not exists items_tags_text_trgm on public.items using gin (tags_text gin_trgm_ops);

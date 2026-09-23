-- #637's ceilings, extended to every table and text column one account could otherwise grow without end (#716).
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- The shape of 0009: statement-level, PT507, so a batch is checked once per owner.
create function public.tg_categories_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from (select distinct n.user_id from new_rows n) owners
    where (
      select count(*) from public.categories c where c.user_id = owners.user_id
    ) > 1000
  ) then
    raise exception 'category quota of 1000 reached'
      using errcode = 'PT507';
  end if;
  return null;
end
$$;

create function public.tg_category_shares_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from (select distinct n.owner_user_id from new_rows n) owners
    where (
      select count(*)
      from public.category_shares s
      where s.owner_user_id = owners.owner_user_id
    ) > 1000
  ) then
    raise exception 'share quota of 1000 reached'
      using errcode = 'PT507';
  end if;
  return null;
end
$$;

-- Per entry, not per owner: the entry cap already bounds entries, so this bounds links.
create function public.tg_item_categories_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from (select distinct n.item_id from new_rows n) linked
    where (
      select count(*)
      from public.item_categories ic
      where ic.item_id = linked.item_id
    ) > 10
  ) then
    raise exception 'category link quota of 10 per entry reached'
      using errcode = 'PT507';
  end if;
  return null;
end
$$;

revoke execute on function
public.tg_categories_quota(),
public.tg_category_shares_quota(),
public.tg_item_categories_quota()
from public, anon, authenticated;

create trigger trg_categories_quota
after insert on public.categories
referencing new table as new_rows
for each statement execute function public.tg_categories_quota();

create trigger trg_category_shares_quota
after insert on public.category_shares
referencing new table as new_rows
for each statement execute function public.tg_category_shares_quota();

create trigger trg_item_categories_quota
after insert on public.item_categories
referencing new table as new_rows
for each statement execute function public.tg_item_categories_quota();

-- `not valid`: checked on every write from now on; a production row already past a limit must not fail the unattended deploy.
alter table public.categories
add constraint categories_name_length
check (char_length(name) <= 200) not valid;

alter table public.items
add constraint items_title_length
check (char_length(title) <= 300) not valid,
add constraint items_description_length
check (char_length(description) <= 10000) not valid,
add constraint items_place_length
check (char_length(place) <= 500) not valid,
-- 50 tags of up to 100 characters, space-joined in tags_text.
add constraint items_tags_bounded
check (cardinality(tags) <= 50 and char_length(tags_text) <= 5049) not valid;

alter table public.category_shares
add constraint category_shares_invited_email_length
check (char_length(invited_email) <= 320) not valid;

commit;

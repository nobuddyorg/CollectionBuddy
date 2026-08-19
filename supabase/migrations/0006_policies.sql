-- Row Level Security, and the grants underneath it.
--
-- This is the *only* authorization layer in the application: the frontend
-- is a static export with no server runtime, so every request reaches
-- Postgres carrying the user's JWT and these policies are what stands
-- between it and someone else's rows.
--
-- Every policy is a scalar-subquery comparison against auth.uid()/auth.jwt(),
-- so the planner evaluates it once per query rather than once per row. No
-- role is named, so `anon` is denied too -- auth.uid() and auth.jwt() are
-- both null for it, and only `authenticated` is granted anything below
-- anyway.
--
-- Deliberately explicit per-table grants below, not one "all tables in
-- schema public" statement: a table created after that statement ran
-- wouldn't be covered by it (this bit category_shares and images once
-- already), so every table has always needed its own line here regardless.
begin;

alter table public.categories enable row level security;
alter table public.items enable row level security;
alter table public.item_categories enable row level security;
alter table public.category_shares enable row level security;
alter table public.images enable row level security;

-- The two predicates every policy below is built from -- here rather than
-- 0002_functions.sql because `language sql` is resolved at CREATE FUNCTION
-- time and needs the tables from 0003 to already exist.
--
-- Deliberately bundles category ownership *in*: an owner needs write access
-- to every item in their own category regardless of who created it, so
-- every write policy that calls this can drop its own separate ownership
-- check.
create or replace function public.has_category_write_access(cat_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.categories c
    where c.id = cat_id
      and c.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.category_shares s
    where s.category_id = cat_id
      and s.invited_email = public.caller_email()
      and s.role = 'editor'
      and (s.expires_at is null or s.expires_at > now())
  )
$$;

revoke execute on function public.has_category_write_access(uuid) from public;
grant execute on function public.has_category_write_access(uuid) to authenticated;

-- Deliberately *not* bundled with ownership the way has_category_write_access
-- is: every read policy below keeps its own row's ownership check as a
-- separate OR clause, so bundling ownership in here too would let a
-- category's owner see every item merely linked into that category,
-- including ones an editor added that the owner was never otherwise
-- granted visibility into. Don't "simplify" this to match the other's shape.
create or replace function public.has_category_read_access(cat_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.category_shares s
    where s.category_id = cat_id
      and s.invited_email = public.caller_email()
      and (s.expires_at is null or s.expires_at > now())
  )
$$;

revoke execute on function public.has_category_read_access(uuid) from public;
grant execute on function public.has_category_read_access(uuid) to authenticated;

-- categories. Category-level actions stay owner-only -- an editor grant
-- widens access to item *content* within a shared category (below), never
-- to renaming, deleting, or managing shares on the category itself.
drop policy if exists "select own categories" on public.categories;
drop policy if exists "select categories with read access" on public.categories;
create policy "select categories with read access"
on public.categories
for select
using (
  user_id = (select auth.uid())
  or public.has_category_read_access(categories.id)
);

drop policy if exists "insert own categories" on public.categories;
create policy "insert own categories"
on public.categories
for insert
with check (user_id = (select auth.uid()));

drop policy if exists "update own categories" on public.categories;
create policy "update own categories"
on public.categories
for update
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "delete own categories" on public.categories;
create policy "delete own categories"
on public.categories
for delete
using (user_id = (select auth.uid()));

-- items
drop policy if exists "select own items" on public.items;
drop policy if exists "select items with read access" on public.items;
create policy "select items with read access"
on public.items
for select
using (
  user_id = (select auth.uid())
  or exists (
    select 1
    from public.item_categories ic
    where ic.item_id = items.id
      and public.has_category_read_access(ic.category_id)
  )
);

-- insert is untouched -- the gate that matters is linking an item into
-- someone else's category (item_categories' insert trigger, 0002), not
-- creating the bare row.
drop policy if exists "insert own items" on public.items;
create policy "insert own items"
on public.items
for insert
with check (user_id = (select auth.uid()));

drop policy if exists "update own items" on public.items;
drop policy if exists "update items with write access" on public.items;
create policy "update items with write access"
on public.items
for update
using (
  user_id = (select auth.uid())
  or exists (
    select 1
    from public.item_categories ic
    where ic.item_id = items.id
      and public.has_category_write_access(ic.category_id)
  )
)
with check (
  user_id = (select auth.uid())
  or exists (
    select 1
    from public.item_categories ic
    where ic.item_id = items.id
      and public.has_category_write_access(ic.category_id)
  )
);

drop policy if exists "delete own items" on public.items;
drop policy if exists "delete items with write access" on public.items;
create policy "delete items with write access"
on public.items
for delete
using (
  user_id = (select auth.uid())
  or exists (
    select 1
    from public.item_categories ic
    where ic.item_id = items.id
      and public.has_category_write_access(ic.category_id)
  )
);

-- item_categories. No update policy: a mapping has nothing to change --
-- rows are added and removed, never edited.
drop policy if exists "select own item_categories" on public.item_categories;
drop policy if exists "select item_categories with read access" on public.item_categories;
create policy "select item_categories with read access"
on public.item_categories
for select
using (
  user_id = (select auth.uid())
  or public.has_category_read_access(item_categories.category_id)
);

-- Still "own": user_id here is the *item's* owner (set by
-- tg_item_categories_enforce), so this only ever lets someone link in an
-- item they themselves own -- has_category_write_access is what separately
-- widens *which categories* that item may be linked into.
drop policy if exists "insert own item_categories" on public.item_categories;
create policy "insert own item_categories"
on public.item_categories
for insert
with check (user_id = (select auth.uid()));

drop policy if exists "delete own item_categories" on public.item_categories;
drop policy if exists "delete item_categories with write access" on public.item_categories;
create policy "delete item_categories with write access"
on public.item_categories
for delete
using (
  user_id = (select auth.uid())
  or public.has_category_write_access(item_categories.category_id)
);

-- category_shares. No expiry check on select/delete: an expired grant
-- should still be visible to the owner (to see it dangling and clean it up)
-- and the grantee (to leave it) -- only the category/item/image access
-- policies above and below stop honoring it.
drop policy if exists "select own or invited category_shares" on public.category_shares;
create policy "select own or invited category_shares"
on public.category_shares
for select
using (
  owner_user_id = (select auth.uid())
  or invited_email = public.caller_email()
);

-- Not a sufficient gate on its own: tg_category_shares_enforce re-derives
-- owner_user_id from the category, so a forged value in the client's
-- payload is overwritten before it reaches here.
drop policy if exists "insert own category_shares" on public.category_shares;
create policy "insert own category_shares"
on public.category_shares
for insert
with check (owner_user_id = (select auth.uid()));

-- Owner only -- tg_category_shares_enforce is what actually enforces "only
-- role may change"; this is just the gate on who may attempt an update.
drop policy if exists "update own category_shares role" on public.category_shares;
create policy "update own category_shares role"
on public.category_shares
for update
using (owner_user_id = (select auth.uid()))
with check (owner_user_id = (select auth.uid()));

-- Owner revoking, or grantee leaving -- same two predicates as select, so
-- whichever side initiated it, the other side's access ends the moment
-- the row is gone.
drop policy if exists "delete own or invited category_shares" on public.category_shares;
create policy "delete own or invited category_shares"
on public.category_shares
for delete
using (
  owner_user_id = (select auth.uid())
  or invited_email = public.caller_email()
);

-- images
drop policy if exists "select own images" on public.images;
drop policy if exists "select images with read access" on public.images;
create policy "select images with read access"
on public.images
for select
using (
  user_id = (select auth.uid())
  or exists (
    select 1
    from public.item_categories ic
    where ic.item_id = images.item_id
      and public.has_category_read_access(ic.category_id)
  )
);

drop policy if exists "insert own images" on public.images;
drop policy if exists "insert images with write access" on public.images;
create policy "insert images with write access"
on public.images
for insert
with check (
  user_id = (select auth.uid())
  or exists (
    select 1
    from public.item_categories ic
    where ic.item_id = images.item_id
      and public.has_category_write_access(ic.category_id)
  )
);

drop policy if exists "delete own images" on public.images;
drop policy if exists "delete images with write access" on public.images;
create policy "delete images with write access"
on public.images
for delete
using (
  user_id = (select auth.uid())
  or exists (
    select 1
    from public.item_categories ic
    where ic.item_id = images.item_id
      and public.has_category_write_access(ic.category_id)
  )
);

-- Deliberately narrow: usage plus DML on each table, no `create` on the
-- schema -- which is also what keeps `search_path = ''` on 0002's
-- security-definer functions from being worth attacking.
grant usage on schema public to authenticated;
grant select, insert, update, delete
  on public.categories, public.items, public.item_categories
  to authenticated;
grant select, insert, update, delete on public.category_shares to authenticated;
grant select, insert, delete on public.images to authenticated;

-- Anon never held anything RLS didn't already deny -- Supabase's project
-- bootstrap grants `anon` default table privileges, so this makes the
-- denial explicit rather than relying on it holding by default.
revoke all on public.items, public.categories, public.item_categories, public.images
from anon;

-- 0007_storage.sql's grants to authenticated assume storage.objects RLS is
-- on; this catches that assumption breaking instead of silently exposing
-- every object in every bucket. Read-only, not `alter table ... enable row
-- level security`: that needs `supabase_storage_admin`, and a permission
-- error here would fail every migration after it.
do $$
begin
  if not (
    select relrowsecurity
    from pg_catalog.pg_class
    where oid = 'storage.objects'::regclass
  ) then
    raise exception
      'storage.objects must have row level security enabled -- 0007_storage.sql''s grants assume it';
  end if;
end $$;

commit;

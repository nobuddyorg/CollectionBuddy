-- The only authorization layer: the frontend is a static export, so these policies are all that stands between a JWT and someone else's rows.
-- `(select auth.uid())` is evaluated once per query, not per row. No policy names `anon`; auth.uid() is null for it anyway.
begin;

alter table public.categories enable row level security;
alter table public.items enable row level security;
alter table public.item_categories enable row level security;
alter table public.category_shares enable row level security;
alter table public.images enable row level security;

-- categories: category-level actions (rename, delete, manage shares) stay owner-only at every role.
create policy "select categories with read access"
on public.categories
for select
using (
  user_id = (select auth.uid())
  or public.has_category_read_access(categories.id)
);

create policy "insert own categories"
on public.categories
for insert
with check (user_id = (select auth.uid()));

create policy "update own categories"
on public.categories
for update
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "delete own categories"
on public.categories
for delete
using (user_id = (select auth.uid()));

-- items
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

-- Insert stays owner-only: the gate is linking the item into a category (tg_item_categories_enforce), not the bare row.
create policy "insert own items"
on public.items
for insert
with check (user_id = (select auth.uid()));

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

-- item_categories: no update policy, a mapping is added and removed, never edited.
create policy "select item_categories with read access"
on public.item_categories
for select
using (
  user_id = (select auth.uid())
  or public.has_category_read_access(item_categories.category_id)
);

-- user_id is the item's owner (tg_item_categories_enforce): one may only link an item one owns.
create policy "insert own item_categories"
on public.item_categories
for insert
with check (user_id = (select auth.uid()));

create policy "delete item_categories with write access"
on public.item_categories
for delete
using (
  user_id = (select auth.uid())
  or public.has_category_write_access(item_categories.category_id)
);

-- category_shares: no expiry check on select/delete, so either side can still see and remove an expired grant.
create policy "select own or invited category_shares"
on public.category_shares
for select
using (
  owner_user_id = (select auth.uid())
  or invited_email = public.caller_email()
);

-- tg_category_shares_enforce overwrites owner_user_id from the category before this runs.
create policy "insert own category_shares"
on public.category_shares
for insert
with check (owner_user_id = (select auth.uid()));

-- Gates who may attempt an update; tg_category_shares_enforce is what limits it to role.
create policy "update own category_shares role"
on public.category_shares
for update
using (owner_user_id = (select auth.uid()))
with check (owner_user_id = (select auth.uid()));

-- Owner revoking or grantee leaving: the same row, from either side.
create policy "delete own or invited category_shares"
on public.category_shares
for delete
using (
  owner_user_id = (select auth.uid())
  or invited_email = public.caller_email()
);

-- images: no update policy, a row is written once and removed.
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

-- Grants are the second denial. Supabase's bootstrap grants every privilege to anon and authenticated; that goes first.
-- Then exactly the DML the policies above back: no UPDATE where there is no update policy, and no TRUNCATE, which RLS never filters.
grant usage on schema public to authenticated;

revoke all
  on public.categories, public.items, public.item_categories,
     public.category_shares, public.images
  from anon, authenticated;

grant select, insert, update, delete
  on public.categories, public.items, public.category_shares
  to authenticated;

grant select, insert, delete
  on public.item_categories, public.images
  to authenticated;

commit;

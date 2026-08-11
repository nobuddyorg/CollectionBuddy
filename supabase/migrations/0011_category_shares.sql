-- Account-based category sharing (#483).
--
-- One new table, `category_shares`: a row is one owner's grant of read-only
-- access to one category, to one invited email. There is no separate
-- "pending" vs "accepted" state to track -- the grant works the moment its
-- `invited_email` matches the signed-in user's own email, which the JWT
-- already carries. That also means resolution needs no trigger on
-- `auth.users`: an invite sent before the recipient ever signs up starts
-- working the instant they do, because the RLS predicate below is
-- evaluated fresh on every request rather than stamped once at insert time.
--
-- Deliberately narrower than the schema could support: view-only (no new
-- write policies -- a grantee never gets anything beyond `select`), and
-- category-level only (no per-item grants). Photos are out of scope here on
-- purpose -- storage.objects is keyed `<owner_uid>/...`
-- (0007_storage.sql), and authorizing a grantee to read a different
-- owner's objects needs its own migration and its own review, not a rider
-- on this one.
begin;

create table if not exists public.category_shares (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete cascade,

  -- Denormalized, same reasoning as item_categories.user_id (0003_tables.sql):
  -- every policy below is a column comparison, never a join back to
  -- categories to find out who owns it.
  owner_user_id uuid not null,

  invited_email text not null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),

  constraint category_shares_invited_email_looks_like_email
    check (invited_email like '%@%'),
  constraint category_shares_expiry_in_future
    check (expires_at is null or expires_at > created_at),

  -- One grant per (category, email) -- re-sharing with someone already
  -- invited is a no-op, not a second row with its own, different expiry.
  constraint category_shares_category_email_unique unique (category_id, invited_email)
);

-- Ownership + normalization, the same shape as tg_item_categories_enforce
-- (0002_functions.sql): verify the category belongs to the caller, derive
-- owner_user_id from the row rather than trust it from the client, and
-- normalize the email so the unique constraint and every RLS comparison
-- below see the same casing regardless of how it was typed.
create or replace function public.tg_category_shares_enforce()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  cat_owner uuid;
  caller_email text;
begin
  select c.user_id into cat_owner
  from public.categories c
  where c.id = new.category_id;

  if cat_owner is null then
    raise exception 'category not found';
  end if;

  if cat_owner <> auth.uid() then
    raise exception 'ownership mismatch';
  end if;

  new.owner_user_id := cat_owner;
  new.invited_email := lower(btrim(new.invited_email));

  if new.invited_email is null or new.invited_email = '' then
    raise exception 'invited_email required';
  end if;

  caller_email := lower((select auth.jwt() ->> 'email'));
  if caller_email is not null and new.invited_email = caller_email then
    raise exception 'cannot share a category with yourself';
  end if;

  return new;
end
$$;

drop trigger if exists trg_category_shares_enforce on public.category_shares;
create trigger trg_category_shares_enforce
before insert on public.category_shares
for each row execute function public.tg_category_shares_enforce();

-- Both directions of the mapping (owner managing grants, grantee reading
-- what's shared with them), plus expiry pruning during RLS evaluation.
create index if not exists idx_category_shares_category
on public.category_shares (category_id);

create index if not exists idx_category_shares_owner
on public.category_shares (owner_user_id);

create index if not exists idx_category_shares_email
on public.category_shares (invited_email);

alter table public.category_shares enable row level security;

-- select: the owner managing their own grants, or the grantee finding out
-- what has been shared with them -- both need to see the row, since
-- "leave" is a grantee-initiated delete of a row they first have to see.
-- No expiry check here: an expired grant should still be visible to the
-- owner (so they see it dangling and can clean it up) and to the grantee
-- (so leaving something that already lapsed still works) -- only the
-- *category/item* access policies below stop honoring it once it expires.
drop policy if exists "select own or invited category_shares" on public.category_shares;
create policy "select own or invited category_shares"
on public.category_shares
for select
using (
  owner_user_id = (select auth.uid())
  or invited_email = lower((select auth.jwt() ->> 'email'))
);

-- insert: owner only. tg_category_shares_enforce above re-derives
-- owner_user_id and re-checks it against the category, so this is a
-- necessary gate, not a sufficient one -- a forged owner_user_id in the
-- client's insert payload is overwritten before it ever reaches here.
drop policy if exists "insert own category_shares" on public.category_shares;
create policy "insert own category_shares"
on public.category_shares
for insert
with check (owner_user_id = (select auth.uid()));

-- delete: owner revoking, or grantee leaving. Same two predicates as
-- select, above -- whichever side initiated it, the other side's access
-- ends the moment this row is gone. No update policy: a grant is created
-- and removed, never edited, the same reasoning as item_categories
-- (0006_policies.sql) -- changing an expiry is a new invite, not a patch.
drop policy if exists "delete own or invited category_shares" on public.category_shares;
create policy "delete own or invited category_shares"
on public.category_shares
for delete
using (
  owner_user_id = (select auth.uid())
  or invited_email = lower((select auth.jwt() ->> 'email'))
);

grant select, insert, delete on public.category_shares to authenticated;

-- Extend read access on the three existing tables to an active grant, on
-- top of ownership. Redeclared here rather than edited in 0006/0003 --
-- migrations in this repo are never patched in place once applied (see
-- 0008-0010) -- so these three statements are the *complete*, current
-- definition of each select policy; 0006's original `user_id = auth.uid()`
-- versions no longer apply once these run.
--
-- Write policies (insert/update/delete) are untouched: nothing below grants
-- a grantee anything but select, which is what makes this view-only without
-- needing a separate read-only flag anywhere.
drop policy if exists "select own categories" on public.categories;
create policy "select own categories"
on public.categories
for select
using (
  user_id = (select auth.uid())
  or exists (
    select 1
    from public.category_shares s
    where s.category_id = categories.id
      and s.invited_email = lower((select auth.jwt() ->> 'email'))
      and (s.expires_at is null or s.expires_at > now())
  )
);

drop policy if exists "select own items" on public.items;
create policy "select own items"
on public.items
for select
using (
  user_id = (select auth.uid())
  or exists (
    select 1
    from public.item_categories ic
    join public.category_shares s on s.category_id = ic.category_id
    where ic.item_id = items.id
      and s.invited_email = lower((select auth.jwt() ->> 'email'))
      and (s.expires_at is null or s.expires_at > now())
  )
);

drop policy if exists "select own item_categories" on public.item_categories;
create policy "select own item_categories"
on public.item_categories
for select
using (
  user_id = (select auth.uid())
  or exists (
    select 1
    from public.category_shares s
    where s.category_id = item_categories.category_id
      and s.invited_email = lower((select auth.jwt() ->> 'email'))
      and (s.expires_at is null or s.expires_at > now())
  )
);

commit;

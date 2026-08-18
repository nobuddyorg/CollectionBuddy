-- One new table, `category_shares`: a row is one owner's grant of access to
-- one category, to one invited email. No separate "pending"/"accepted"
-- state -- the grant works the moment `invited_email` matches the caller's
-- own JWT email, evaluated fresh on every request, so an invite sent before
-- signup starts working the instant the invitee signs up.
--
-- View-only as introduced here (write access for an editor role came
-- later, 0014_editor_shares.sql); photos came later too (0012).
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

-- Verifies the category belongs to the caller, derives owner_user_id rather
-- than trusting the client, and normalizes the email so the unique
-- constraint and every RLS comparison see the same casing.
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

-- No expiry check here: an expired grant should still be visible to the
-- owner (to see it dangling and clean it up) and the grantee (to leave it)
-- -- only the category/item access policies below stop honoring it.
drop policy if exists "select own or invited category_shares" on public.category_shares;
create policy "select own or invited category_shares"
on public.category_shares
for select
using (
  owner_user_id = (select auth.uid())
  or invited_email = lower((select auth.jwt() ->> 'email'))
);

-- Not a sufficient gate on its own: tg_category_shares_enforce re-derives
-- owner_user_id from the category, so a forged value in the client's
-- payload is overwritten before it reaches here.
drop policy if exists "insert own category_shares" on public.category_shares;
create policy "insert own category_shares"
on public.category_shares
for insert
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
  or invited_email = lower((select auth.jwt() ->> 'email'))
);

grant select, insert, delete on public.category_shares to authenticated;

-- Extends read access on the three existing tables to an active grant, on
-- top of ownership. Redeclared, not edited in 0006/0003 -- migrations here
-- are never patched in place once applied (see 0008-0010) -- so these are
-- the *complete*, current definition of each select policy.
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

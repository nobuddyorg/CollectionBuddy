-- Least privilege: make the grants state the same intent the policies do.
-- Neither revoke below changes what any caller can currently do -- both
-- remove a privilege that RLS was already denying, so the denial stops
-- resting on one layer alone.
begin;

-- #638. 0006_policies.sql revokes anon's privileges on four tables and omits
-- the fifth, leaving anon holding SELECT, INSERT, UPDATE, DELETE, REFERENCES,
-- TRIGGER and TRUNCATE on category_shares. Nothing is exploitable today: the
-- insert policy cannot be satisfied with a null auth.uid(), and the select
-- policy raises before it resolves because anon lacks EXECUTE on
-- caller_email(). But that second denial is a function grant doing the work of
-- a table grant, which is not what the documentation describes, and it would
-- quietly disappear the moment some future anonymous flow granted
-- caller_email() to anon -- leaving anon still holding full DML here.
--
-- TRUNCATE is the one that stands out: RLS does not filter it at all.
revoke all on public.category_shares from anon;

-- #641. item_categories deliberately has no UPDATE policy -- "a mapping has
-- nothing to change", 0006_policies.sql -- so with RLS on, the UPDATE granted
-- beside it is dead, and an update is a silent no-op rather than a refusal.
-- Dropping it means a future `create policy ... for update` on this table
-- cannot become reachable without someone revisiting the grant too.
--
-- images is the same case, and was not in the issue: 0006 grants it only
-- `select, insert, delete` and defines policies for exactly those three (a
-- photograph row is written once and removed, never edited), but the bootstrap
-- UPDATE was still there.
revoke update on public.item_categories, public.images from authenticated;

-- Not from any issue -- found while reading the catalog back after the two
-- revokes above, and the same class as both. 0006_policies.sql says its grants
-- are "deliberately narrow: usage plus DML on each table", and that was not
-- true: Supabase's project bootstrap grants `authenticated` all privileges on
-- public tables, so TRUNCATE, REFERENCES and TRIGGER were sitting on all five
-- alongside the DML the app needs.
--
-- TRUNCATE is the one that matters. Row level security does not filter it at
-- all, so the privilege means "empty this table, every user's rows included" --
-- executed as `authenticated` against the local stack, `truncate public.items
-- cascade` succeeded and took item_categories and images with it. It is not
-- reachable today: PostgREST exposes no TRUNCATE verb and there is no other
-- way to run arbitrary SQL as this role, which is why this is a
-- defence-in-depth gap rather than a live hole. It is also exactly the reason
-- the anon revoke above exists.
--
-- TRIGGER and REFERENCES are DDL on someone else's table; nothing in the app
-- uses either, since every trigger and foreign key here is created by these
-- migrations as `postgres`.
revoke truncate, references, trigger
  on public.categories, public.items, public.item_categories,
     public.category_shares, public.images
  from authenticated;

commit;

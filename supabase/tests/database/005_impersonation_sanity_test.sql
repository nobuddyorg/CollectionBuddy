-- Proves the suite's impersonation reaches grants and RLS: refused as the wrong identity, allowed as the right one, and dependent on the sub claim.
begin;
select no_plan();

\ir _helpers.psql

-- pg_prove connects as postgres, the superuser every other file must switch away from before asserting anything.
select lives_ok(
  'select 1 from public.categories limit 1',
  'as the postgres role, reading categories raises nothing (RLS and grants both bypassed, as expected of a superuser)'
);

-- Switching to anon: the identical query is refused outright, since anon holds no grant on the table (0006_policies.sql).
select pg_temp.auth_as_anon();
select throws_ok(
  'select 1 from public.categories limit 1',
  '42501',
  'permission denied for table categories',
  'as anon, the identical read is refused -- the grant is doing the work, not a coincidence of empty data'
);

-- authenticated holds the grant, and the claim gives the policy an auth.uid() to evaluate.
select pg_temp.auth_as(gen_random_uuid());
select lives_ok(
  'select 1 from public.categories limit 1',
  'as authenticated with a claim, the identical read is permitted again'
);

-- The read depends on the sub claim, not just the role: the creating claim sees the row...
select gen_random_uuid() as probe_user_id \gset
select pg_temp.auth_as(:'probe_user_id'::uuid);
insert into public.categories (name) values ('Impersonation probe')
returning id as probe_category_id \gset

select is(
  (select count(*) from public.categories where id = :'probe_category_id'::uuid),
  1::bigint,
  'the identity that created the row can read it back'
);

-- ...and a different sub under the same role and grant does not, so the policy reads request.jwt.claims.
select pg_temp.auth_as(gen_random_uuid());
select is(
  (select count(*) from public.categories where id = :'probe_category_id'::uuid),
  0::bigint,
  'a different sub claim, same role, cannot see it -- the policy reads the claim, not just the role'
);

select * from finish();
rollback;

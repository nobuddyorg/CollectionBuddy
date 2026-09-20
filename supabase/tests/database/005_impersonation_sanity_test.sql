-- Sanity check for the impersonation mechanism every other file in this
-- suite relies on: SET LOCAL ROLE plus request.jwt.claims must actually
-- exercise the same grant-and-policy path PostgREST does, not silently run
-- as postgres/superuser -- which bypasses both grants and RLS entirely,
-- and would make every other test in this suite pass without testing
-- anything (issue #649's own requirement: "a test that impersonates
-- incorrectly and silently runs as postgres/superuser would pass without
-- testing anything").
--
-- Proven the way that issue asked for: the identical query is shown to
-- fail under the wrong identity and pass once switched to the right one,
-- and a read is shown to depend on the specific claim, not merely on
-- having assumed the authenticated role.
begin;
select no_plan();

\ir _helpers.psql

-- As postgres -- the role pg_prove actually connects as -- RLS and grants
-- are both bypassed, which is exactly what every other file in this suite
-- has to work around before it can assert anything meaningful.
select ok(
  not pg_temp.raises('select 1 from public.categories limit 1'),
  'as the postgres role, reading categories raises nothing (RLS and grants both bypassed, as expected of a superuser)'
);

-- Switching to anon: the identical query is now refused outright, because
-- anon holds no grant on the table (0006_policies.sql, 0011_least_privilege_grants.sql).
set local role anon;
select ok(
  pg_temp.raises('select 1 from public.categories limit 1'),
  'as anon, the identical read is refused -- the grant is doing the work, not a coincidence of empty data'
);

-- Switching to authenticated with a real claim: the identical query
-- succeeds again, because authenticated holds the grant and the policy
-- now has an auth.uid() to evaluate.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', gen_random_uuid()::text, 'role', 'authenticated')::text,
  true
);
select ok(
  not pg_temp.raises('select 1 from public.categories limit 1'),
  'as authenticated with a claim, the identical read is permitted again'
);

-- And the read genuinely depends on the claim's content, not merely on
-- having assumed the authenticated role: a category created under one sub
-- claim is visible to that same claim...
select gen_random_uuid() as probe_user_id \gset
set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', :'probe_user_id'::text, 'role', 'authenticated')::text,
  true
);
insert into public.categories (name) values ('Impersonation probe')
returning id as probe_category_id \gset

select is(
  (select count(*) from public.categories where id = :'probe_category_id'::uuid),
  1::bigint,
  'the identity that created the row can read it back'
);

-- ...and a second, different sub claim -- same role, same table grant --
-- cannot see it, which is the part that proves the policy is reading
-- request.jwt.claims and not merely checking role membership.
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', gen_random_uuid()::text, 'role', 'authenticated')::text,
  true
);
select is(
  (select count(*) from public.categories where id = :'probe_category_id'::uuid),
  0::bigint,
  'a different sub claim, same role, cannot see it -- the policy reads the claim, not just the role'
);

select * from finish();
rollback;

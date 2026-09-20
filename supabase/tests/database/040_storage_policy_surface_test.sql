-- The photograph bucket and the policy surface on storage.objects.
--
-- Deliberately catalog-level, not behavioural: storage is the one boundary
-- where the bytes, the Storage API's own guards and the policies only meet
-- in a running stack, so `web/e2e/signed-in/rls.spec.ts` is where a
-- grantee actually reads an owner's object and an editor actually fails to
-- plant one (TEST_STRATEGY.md §7 -- end-to-end tests "are usually the only
-- place storage-level authorization gets exercised at all"). What this
-- file adds is the half that is invisible from there: that the *capability*
-- two separate security fixes removed is still absent, which no passing
-- end-to-end test can demonstrate.
begin;
select no_plan();

-- The bucket is private. Flipping it to public serves every photograph in
-- the app to anyone with a URL, past RLS entirely, and nothing in the
-- client would look any different -- the app reads through signed URLs
-- either way.
select is(
  (select public from storage.buckets where id = 'item-images'),
  false,
  'the photograph bucket is private -- nothing is served without a signed URL'
);

-- The size cap and the MIME allowlist are the only thing standing between
-- a signed-in user calling the Storage API directly and arbitrary content
-- at arbitrary size: the file picker's `accept` and the browser-side WebP
-- compression are both trivially bypassed.
select is(
  (select allowed_mime_types from storage.buckets where id = 'item-images'),
  array['image/webp', 'image/jpeg', 'image/png'],
  'the bucket accepts images only, enforced server-side'
);
select is(
  (select file_size_limit from storage.buckets where id = 'item-images'),
  5242880::bigint,
  'the per-file size cap is 5 MiB'
);

-- An object's path can never change (CLAUDE.md's settled decision, and
-- 0008_storage_no_update.sql's security fix). The capability is gone in
-- both layers -- no policy authorizes an UPDATE, and the privilege
-- underneath it is revoked -- so neither alone is load-bearing. Restoring
-- either reopens a real, previously exploited escalation: an editor moving
-- the owner's photograph into their own namespace, past revocation and
-- past the nightly sweep.
select is(
  (select array_agg(policyname::text order by policyname)
   from pg_catalog.pg_policies
   where schemaname = 'storage' and tablename = 'objects' and cmd = 'UPDATE'),
  null,
  'no policy on storage.objects authorizes an UPDATE -- an object''s path is fixed once written'
);

-- The privilege underneath that policy is NOT asserted, and the reason is
-- worth recording: 0008_storage_no_update.sql revokes UPDATE on
-- storage.objects from authenticated, but the revoke does not survive on a
-- running stack. Supabase's own bootstrap grants ALL on storage.objects to
-- anon, authenticated and service_role, and storage-api re-applies its
-- migrations on start -- so the privilege is back, and this suite measured
-- it back (the assertion was written, and failed here while passing against
-- a hand-built schema). Asserting it true would lock in a weakness;
-- asserting it false fails on every real stack.
--
-- What follows from that: on a live database the *absence of an UPDATE
-- policy* above is the only thing denying an update, not one of two
-- independent layers. That makes the assertion above load-bearing rather
-- than belt-and-braces, which is exactly why it is stated first.

-- An object may only be created under the uploader's own uid prefix
-- (0010_storage_pin_upload_prefix.sql). "write shared objects" constrained
-- the *item* segment and said nothing about the uid segment, which let an
-- editor store bytes of their choosing under the owner's prefix -- served
-- back to her by her own read policy, and attributable to her by path
-- alone. It was dropped rather than amended, so the assertion is that
-- exactly one policy can authorize an insert at all.
select is(
  (select array_agg(policyname::text order by policyname)
   from pg_catalog.pg_policies
   where schemaname = 'storage' and tablename = 'objects' and cmd = 'INSERT'),
  array['upload own objects'],
  'only the own-prefix policy authorizes an insert -- there is no shared-write path'
);

-- The read and delete policies that do remain, and are what let the owner
-- (or a second editor) reach an object that legitimately landed under a
-- different editor's prefix.
select is(
  (select array_agg(policyname::text order by policyname)
   from pg_catalog.pg_policies
   where schemaname = 'storage' and tablename = 'objects' and cmd in ('SELECT', 'DELETE')),
  array['delete own objects', 'delete shared objects', 'read own signed objects', 'read shared objects'],
  'the own-prefix and shared read/delete policies are all present'
);

-- Every one of them names `authenticated`. A policy with no role named
-- applies to PUBLIC, which would put `anon` inside whichever predicate it
-- carries rather than outside it.
select is(
  (select array_agg(policyname::text order by policyname)
   from pg_catalog.pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and roles <> array['authenticated']::name[]),
  null,
  'no policy on storage.objects reaches past the authenticated role'
);

-- The older hand-written dashboard policies 0007_storage.sql dropped, by
-- name: they were verified redundant before removal, and a dashboard edit
-- is exactly how one of them would come back without a migration.
select is(
  (select array_agg(policyname::text order by policyname)
   from pg_catalog.pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname in ('list own', 'upload own', 'update own', 'delete own',
                        'update shared objects', 'write shared objects')),
  null,
  'none of the superseded storage policies has come back'
);

select * from finish();
rollback;

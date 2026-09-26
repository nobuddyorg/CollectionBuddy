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

-- An object's path never changes: no policy authorizes an UPDATE on storage.objects (0007_storage.sql, design-decisions.md).
select is(
  (select array_agg(policyname::text order by policyname)
   from pg_catalog.pg_policies
   where schemaname = 'storage' and tablename = 'objects' and cmd = 'UPDATE'),
  null,
  'no policy on storage.objects authorizes an UPDATE -- an object''s path is fixed once written'
);

-- The UPDATE privilege is NOT asserted: Supabase's bootstrap grants ALL on storage.objects and storage-api re-applies it on start, so the missing policy above is the only denial.

-- Exactly one policy admits an insert: an object may only be created under the uploader's own uid prefix (0007_storage.sql).
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

-- An own-prefix write under an entry the caller can see but no longer write is refused (0021, #739).
select is(
  (select array_agg(policyname::text order by policyname)
   from pg_catalog.pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname in ('upload own objects', 'delete own objects')
     and coalesce(qual, with_check) like '%has_item_write_access(%'),
  array['delete own objects', 'upload own objects'],
  'the own-prefix upload and delete policies both require write access to the entry'
);

-- Splinter's auth_rls_initplan skips the storage schema, so this is its check here: auth.uid() only ever inside a scalar subquery (0012, #719).
select is(
  (select array_agg(policyname::text order by policyname)
   from pg_catalog.pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and (
       replace(coalesce(qual, ''), '( SELECT auth.uid() AS uid)', '') like '%auth.uid()%'
       or replace(coalesce(with_check, ''), '( SELECT auth.uid() AS uid)', '') like '%auth.uid()%'
     )),
  null,
  'no policy on storage.objects calls auth.uid() once per row'
);

select * from finish();
rollback;

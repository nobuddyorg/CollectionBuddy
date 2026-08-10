-- Asserts, rather than assumes, that row level security is actually
-- enabled on storage.objects.
--
-- 0007_storage.sql grants select/insert/update/delete on storage.objects to
-- `authenticated` for *every* bucket, not just item-images, on the
-- assumption that RLS is what narrows that grant down to "your own objects
-- only." Supabase enables RLS on storage.objects by default, so this holds
-- today -- but 0007's own premise is that it describes the project exactly
-- enough that a local stack reproduces it. If RLS on that table were ever
-- toggled off, the grant above becomes full read/write/delete over every
-- object in every bucket for every signed-in user, silently.
--
-- A read-only check rather than `alter table ... enable row level
-- security`: altering a table in the `storage` schema may require running
-- as `supabase_storage_admin`, which this migration's role is not
-- guaranteed to be, and a permission error here would fail every migration
-- after it. Reading pg_class needs no special privilege.
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

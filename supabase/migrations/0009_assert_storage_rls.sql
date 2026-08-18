-- 0007_storage.sql grants full DML on storage.objects to `authenticated`
-- for *every* bucket, relying on RLS to narrow that down to "your own
-- objects only." If RLS on that table were ever toggled off, that grant
-- silently becomes full read/write/delete over every object in every
-- bucket for every signed-in user -- this asserts it's on rather than
-- assuming so.
--
-- A read-only check, not `alter table ... enable row level security`:
-- altering a `storage` schema table may need the `supabase_storage_admin`
-- role, and a permission error here would fail every migration after it.
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

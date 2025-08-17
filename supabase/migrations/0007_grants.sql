-- Keep privileges narrow; RLS does the real access control.
begin;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- Storage schema usage is needed for RLS checks on storage.objects
grant usage on schema storage to authenticated;
grant select, insert, update, delete on storage.objects to authenticated;

commit;

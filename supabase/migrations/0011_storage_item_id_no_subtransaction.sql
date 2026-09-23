-- storage_item_id() tests the segment instead of catching the cast's error, so no call opens a subtransaction (#720).
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Same signature, so images_path_full_matches_item and the shared storage policies are untouched; uuid spellings Postgres accepts still parse.
create or replace function public.storage_item_id(path text)
returns uuid
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  segment text := pg_catalog.split_part(path, '/', 2);
begin
  if pg_catalog.pg_input_is_valid(segment, 'uuid') then
    return segment::uuid;
  end if;
  return null;
end
$$;

commit;

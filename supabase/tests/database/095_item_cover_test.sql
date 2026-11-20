-- An entry's cover is one of its own photos (0037, #894): any other is refused, a gone one leaves the entry editable, and search puts the cover first. Through PostgREST: e2e/signed-in/rls/cover.spec.ts.
begin;
select no_plan();

\ir _helpers.psql

select gen_random_uuid() as owner_id, gen_random_uuid() as viewer_id, gen_random_uuid() as stranger_id \gset

select pg_temp.auth_as(:'owner_id'::uuid, 'cover-owner@collectionbuddy.test');
insert into public.categories (name) values ('Covers (pgTAP)')
returning id as category_id \gset
insert into public.items (title) values ('Covered entry')
returning id as item_id \gset
insert into public.items (title) values ('Neighbouring entry')
returning id as neighbour_id \gset
insert into public.item_categories (item_id, category_id)
values (:'item_id'::uuid, :'category_id'::uuid), (:'neighbour_id'::uuid, :'category_id'::uuid);
insert into public.images (item_id, path_full, created_at)
values (:'item_id'::uuid, :'owner_id'::text || '/' || :'item_id'::text || '/oldest.webp', now() - interval '1 hour')
returning id as oldest_id \gset
insert into public.images (item_id, path_full)
values (:'item_id'::uuid, :'owner_id'::text || '/' || :'item_id'::text || '/newer.webp')
returning id as newer_id \gset
insert into public.images (item_id, path_full)
values (:'neighbour_id'::uuid, :'owner_id'::text || '/' || :'neighbour_id'::text || '/theirs.webp')
returning id as neighbours_photo_id \gset
insert into public.category_shares (category_id, invited_email, role)
values (:'category_id'::uuid, 'cover-viewer@collectionbuddy.test', 'viewer');

create function pg_temp.cover()
returns uuid
language sql
as $$ select cover_image_id from public.items where title = 'Covered entry' $$;

create function pg_temp.first_found(p_category_id uuid)
returns uuid
language sql
as $$
  select (images -> 0 ->> 'id')::uuid
  from public.search_category_entries(p_category_id, 0, 8, '%Covered%')
$$;

select is(pg_temp.first_found(:'category_id'::uuid), :'oldest_id'::uuid,
  'with no cover chosen, search puts the oldest photo first');

select lives_ok(format('update public.items set cover_image_id = %L where id = %L', :'newer_id', :'item_id'),
  'the owner makes a later photo of the entry its cover');
select is(pg_temp.cover(), :'newer_id'::uuid, 'and it is the cover');
select is(pg_temp.first_found(:'category_id'::uuid), :'newer_id'::uuid,
  'and search puts it first, the oldest after it');

select throws_ok(format('update public.items set cover_image_id = %L where id = %L', :'neighbours_photo_id', :'item_id'),
  '23503', 'a cover must be a photo of its own entry',
  'a photo of another entry is refused as its cover');
select throws_ok(format('update public.items set cover_image_id = %L where id = %L', gen_random_uuid(), :'item_id'),
  '23503', 'a cover must be a photo of its own entry',
  'and so is an id that names no photo at all');
select throws_ok(format('insert into public.items (title, cover_image_id) values (%L, %L)', 'Born covered', :'oldest_id'),
  '23503', 'a cover must be a photo of its own entry',
  'a new entry has no photo yet, so it cannot be born with a cover');
select is(pg_temp.cover(), :'newer_id'::uuid, 'the refusals left the cover as it was');

select pg_temp.auth_as(:'viewer_id'::uuid, 'cover-viewer@collectionbuddy.test');
select is(pg_temp.first_found(:'category_id'::uuid), :'newer_id'::uuid,
  'a viewer''s search puts the chosen cover first too');
select is(pg_temp.rows_written(format('update public.items set cover_image_id = %L where id = %L returning id', :'oldest_id', :'item_id')),
  0::bigint, 'but a viewer cannot choose the cover');

select pg_temp.auth_as(:'stranger_id'::uuid, 'cover-stranger@collectionbuddy.test');
select is(pg_temp.rows_written(format('update public.items set cover_image_id = %L where id = %L returning id', :'oldest_id', :'item_id')),
  0::bigint, 'nor can a stranger');

select pg_temp.auth_as(:'owner_id'::uuid, 'cover-owner@collectionbuddy.test');
delete from public.images where id = :'newer_id'::uuid;
select is(pg_temp.cover(), :'newer_id'::uuid, 'a deleted cover''s id stays behind, naming no photo');
select is(pg_temp.first_found(:'category_id'::uuid), :'oldest_id'::uuid,
  'and the oldest photo is first again');
select lives_ok(format('update public.items set title = %L where id = %L', 'Covered entry', :'item_id'),
  'the entry''s other fields still save: only a cover being set is checked');
select lives_ok(format('update public.items set cover_image_id = null where id = %L', :'item_id'),
  'and the cover can be cleared');

select is(has_function_privilege('authenticated', 'public.tg_items_cover_is_own_photo()', 'execute'), false,
  'no API role may call the cover check itself');

select * from finish();
rollback;

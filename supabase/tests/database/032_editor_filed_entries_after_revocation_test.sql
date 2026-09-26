-- An entry an editor filed stays the editor's row; revoking or demoting the grant must still end the editor's writes to it (0021, #739). Storage: e2e/signed-in/rls/editor-share-photographs.spec.ts.
begin;
select no_plan();

\ir _helpers.psql

-- Rows one write would touch, always rolled back, so an attempt that wrongly succeeds cannot hide the ones after it.
create function pg_temp.rows_written(p_sql text)
returns bigint
language plpgsql
as $$
declare
  touched bigint;
begin
  execute format('with attempt as (%s) select count(*) from attempt', p_sql) into touched;
  raise exception using errcode = 'UNDO0';
exception when sqlstate 'UNDO0' then
  return touched;
end
$$;

-- Every write the entry's owner branch used to allow, tried once per grant state below.
create function pg_temp.writes_refused(p_state text)
returns setof text
language plpgsql
as $$
declare
  filed text := current_setting('t.filed');
begin
  return next is(
    pg_temp.rows_written(format('update public.items set title = %L where id = %L returning id', 'rewritten', filed)),
    0::bigint, p_state || ': the editor cannot edit the entry it filed');
  return next is(
    pg_temp.rows_written(format('delete from public.images where item_id = %L returning id', filed)),
    0::bigint, p_state || ': nor remove its photograph record');
  return next ok(
    pg_temp.raises(format('select pg_temp.rows_written(%L)', format(
      'insert into public.images (item_id, path_full) values (%L, %L) returning id',
      filed, current_setting('t.editor') || '/' || filed || '/b.webp'))),
    p_state || ': nor add a photograph record to it');
  return next is(
    pg_temp.rows_written(format('delete from public.item_categories where item_id = %L returning item_id', filed)),
    0::bigint, p_state || ': nor unlink it from the collection');
  return next is(
    pg_temp.rows_written(format('delete from public.items where id = %L returning id', filed)),
    0::bigint, p_state || ': nor delete it');
end
$$;

select gen_random_uuid() as owner_id, gen_random_uuid() as editor_id, gen_random_uuid() as viewer_id \gset

select pg_temp.auth_as(:'owner_id'::uuid, 'filed-owner@collectionbuddy.test');
insert into public.categories (name) values ('Shared (pgTAP)')
returning id as category_id \gset
insert into public.category_shares (category_id, invited_email, role)
values (:'category_id'::uuid, 'filed-editor@collectionbuddy.test', 'editor')
returning id as share_id \gset
insert into public.category_shares (category_id, invited_email)
values (:'category_id'::uuid, 'filed-viewer@collectionbuddy.test');

select pg_temp.auth_as(:'editor_id'::uuid, 'filed-editor@collectionbuddy.test');
insert into public.items (title) values ('Filed by the editor')
returning id as filed_id \gset
insert into public.item_categories (item_id, category_id)
values (:'filed_id'::uuid, :'category_id'::uuid);
insert into public.images (item_id, path_full)
values (:'filed_id'::uuid, :'editor_id'::text || '/' || :'filed_id'::text || '/a.webp')
returning id as image_id \gset

-- The editor's own collection, and an entry in no collection yet: neither is shared, so no grant may reach them.
insert into public.categories (name) values ('Editor''s own (pgTAP)')
returning id as own_category_id \gset
insert into public.items (title) values ('In the editor''s own collection')
returning id as own_entry_id \gset
insert into public.item_categories (item_id, category_id)
values (:'own_entry_id'::uuid, :'own_category_id'::uuid);
insert into public.items (title) values ('Not filed yet')
returning id as unfiled_id \gset
insert into public.items (title) values ('Filed twice')
returning id as twice_id \gset

-- Filed in both collections, a shape only rows from before 0020 have.
reset role;
alter table public.item_categories disable trigger trg_item_categories_quota;
select pg_temp.auth_as(:'editor_id'::uuid, 'filed-editor@collectionbuddy.test');
insert into public.item_categories (item_id, category_id)
values (:'twice_id'::uuid, :'own_category_id'::uuid), (:'twice_id'::uuid, :'category_id'::uuid);
reset role;
alter table public.item_categories enable trigger trg_item_categories_quota;
select pg_temp.auth_as(:'editor_id'::uuid, 'filed-editor@collectionbuddy.test');

with attempt as (
  update public.items set title = 'edited while granted' where id = :'filed_id'::uuid returning id
)
select is((select count(*) from attempt), 1::bigint,
  'an editor edits the entry it filed while the grant is active');

select set_config('t.filed', :'filed_id', true) as t_filed,
  set_config('t.editor', :'editor_id', true) as t_editor \gset

-- The control for every refusal below: the probe does count a write that goes through, then undoes it.
select is(
  pg_temp.rows_written(format('delete from public.items where id = %L returning id', :'filed_id')),
  1::bigint,
  'while granted, the editor could delete it -- the probe counts a write that succeeds'
);
select is((select count(*) from public.items where id = :'filed_id'::uuid), 1::bigint,
  'and undoes it, so every attempt below meets the entry intact');

-- Demoted to viewer: still reads the entry, writes nothing.
select pg_temp.auth_as(:'owner_id'::uuid, 'filed-owner@collectionbuddy.test');
update public.category_shares set role = 'viewer' where id = :'share_id'::uuid;

select pg_temp.auth_as(:'editor_id'::uuid, 'filed-editor@collectionbuddy.test');
select * from pg_temp.writes_refused('demoted to viewer');

-- Promoted again: write access follows the grant back.
select pg_temp.auth_as(:'owner_id'::uuid, 'filed-owner@collectionbuddy.test');
update public.category_shares set role = 'editor' where id = :'share_id'::uuid;

select pg_temp.auth_as(:'editor_id'::uuid, 'filed-editor@collectionbuddy.test');
with attempt as (
  update public.items set title = 'edited once promoted again' where id = :'filed_id'::uuid returning id
)
select is((select count(*) from attempt), 1::bigint,
  'promoted back to editor, it edits the entry again');

-- Revoked.
select pg_temp.auth_as(:'owner_id'::uuid, 'filed-owner@collectionbuddy.test');
delete from public.category_shares where id = :'share_id'::uuid;

select pg_temp.auth_as(:'editor_id'::uuid, 'filed-editor@collectionbuddy.test');
select * from pg_temp.writes_refused('revoked');

-- Read back with no identity in the way: the refusals above are the grant, not rows that stopped existing.
reset role;
select is(
  (select title from public.items where id = :'filed_id'::uuid),
  'edited once promoted again',
  'the entry is still there, as last written under a grant'
);
select is(
  (select count(*) from public.images where id = :'image_id'::uuid),
  1::bigint,
  'and so is its photograph record'
);

-- Every other grantee still reads it inside the collection; only the writes ended.
select pg_temp.auth_as(:'viewer_id'::uuid, 'filed-viewer@collectionbuddy.test');
select is(
  (select count(*) from public.items where id = :'filed_id'::uuid),
  1::bigint,
  'another grantee of the collection still reads the entry'
);

-- The revocation reaches only what is in the shared collection.
select pg_temp.auth_as(:'editor_id'::uuid, 'filed-editor@collectionbuddy.test');
with attempt as (
  update public.items set title = 'still mine' where id = :'own_entry_id'::uuid returning id
)
select is((select count(*) from attempt), 1::bigint,
  'the ex-editor still edits an entry in its own collection');

insert into public.images (item_id, path_full)
values (:'unfiled_id'::uuid, :'editor_id'::text || '/' || :'unfiled_id'::text || '/c.webp');
with attempt as (
  delete from public.items where id = :'unfiled_id'::uuid returning id
)
select is((select count(*) from attempt), 1::bigint,
  'and photographs and deletes an entry in no collection, which is its owner''s alone');

-- One collection the caller can no longer write is enough, even with the caller's own collection holding the entry too.
with attempt as (
  update public.items set title = 'rewritten through my own collection' where id = :'twice_id'::uuid returning id
)
select is((select count(*) from attempt), 0::bigint,
  'an entry also filed in a collection the caller lost is refused, even through the caller''s own collection');

-- The owner's side is unchanged: the asymmetry of 0006 still hides the entry, and the collection's delete still sweeps it (055).
select pg_temp.auth_as(:'owner_id'::uuid, 'filed-owner@collectionbuddy.test');
select is(
  (select count(*) from public.items where id = :'filed_id'::uuid),
  0::bigint,
  'the collection''s owner still does not see the entry the editor filed'
);

select * from finish();
rollback;

-- Security fix: an object can no longer be moved out of the prefix it was
-- created under.
--
-- "update shared objects" (0007) authorized an UPDATE on segment *2* of the
-- path -- the item id, which storage_item_id parses back out -- while the
-- four owner-only policies beside it authorize on segment *1*, the uploader's
-- uid. Its WITH CHECK re-tested only segment 2, so an UPDATE that rewrote
-- segment 1 to the caller's own uid satisfied both halves: an editor on a
-- shared category could move the owner's photograph into their own namespace.
--
-- Nothing then reached it again. Revoking the share did not, because the
-- object had stopped depending on the grant and now matched the attacker's
-- own-prefix policy. The owner could not see it, because segment 1 was no
-- longer hers and has_category_read_access deliberately excludes ownership
-- (0006_policies.sql). The weekly sweep (cleanup-orphaned-photos.yml) did
-- not, because it joins items on segment 2, which the move leaves alone.
--
-- The capability itself is what goes, rather than the predicate being
-- tightened: the app never updates or moves an object. data/images.ts calls
-- only upload (an INSERT -- never with `upsert`, which is the one upload
-- shape that would need UPDATE), remove and createSignedUrls. Pinning
-- segment 1 in "update shared objects" would have made it a strict subset of
-- "update own objects" and left a capability nothing asks for; this way the
-- invariant is that an object's path is fixed from the moment it is written.
begin;

drop policy if exists "update shared objects" on storage.objects;
drop policy if exists "update own objects" on storage.objects;

-- Defence in depth, the same pairing as 0006's `revoke all ... from anon`:
-- with no UPDATE policy left, RLS already denies every UPDATE, and this
-- removes the privilege underneath it so the denial does not rest on the
-- absence of a policy alone. Revoking a grant this same migration chain made
-- (0007_storage.sql) -- policies on storage.objects are fine, it is that
-- table's DDL that hosted Supabase will not let us touch.
revoke update on storage.objects from authenticated;

commit;

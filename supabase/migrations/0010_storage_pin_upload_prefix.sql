-- Security fix: an object can only be created under the uploader's own uid
-- prefix.
--
-- "write shared objects" (0007) constrained only segment 2 of the path -- the
-- item id -- and said nothing about segment 1. An editor on a shared category
-- could therefore insert an object prefixed with the *owner's* uid: bytes of
-- the attacker's choosing, stored against the victim's storage quota, served
-- back to her by her own "read own signed objects" policy, and attributable to
-- her by path alone. Paired with an `images` row, which an editor may
-- legitimately insert for a shared item, arbitrary content renders as the
-- owner's photograph of the owner's entry.
--
-- The policy is dropped rather than amended, because pinning segment 1 is what
-- makes it redundant: "upload own objects" already allows exactly
-- `split_part(name,'/',1) = auth.uid()::text`, so a pinned "write shared
-- objects" would be that same predicate plus an extra conjunct -- a strict
-- subset, and Postgres ORs every applicable policy. Its own comment in 0007
-- said as much already: "An object's path is prefixed with whoever is
-- *uploading* it (imagePrefix, data/images.ts), so an editor's own upload
-- already satisfies the owner-only policies above." The legitimate flow never
-- needed a foreign prefix.
--
-- The shared *read* and *delete* policies stay: they are what let the owner,
-- or a second editor, reach an object that legitimately landed under a
-- different editor's prefix. Only the ability to create one there goes.
begin;

drop policy if exists "write shared objects" on storage.objects;

commit;

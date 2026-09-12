-- Make the `images` -> Storage mirror self-consistent by construction rather
-- than by convention.
--
-- tg_images_enforce (0002_functions.sql) validates the *item* -- owner, or
-- write access through a shared category -- and never looks at path_full, so
-- any string was accepted: a path belonging to another user's object, or one
-- that is not a storage path at all.
--
-- This is not an authorization fix and closing it grants and denies no access.
-- Claiming a path conveys nothing: the storage policies parse an object's own
-- name and never consult this table, so the two surfaces stay independent, and
-- traversal is inert because the Storage API resolves keys within the bucket
-- and RLS denies anything outside the caller's prefix. Squatting on a path a
-- victim will later use is infeasible -- filenames are crypto.randomUUID().
-- What it prevents is a row pointing at a path its own owner cannot read, and
-- a client rendering a broken plate for it.
--
-- `is not distinct from`, not `=`. storage_item_id() returns NULL rather than
-- raising on a path whose second segment is not a uuid (0002_functions.sql) --
-- which is what keeps a malformed value from taking the statement down, but
-- also means a plain `=` yields NULL, and a CHECK constraint *passes* on NULL.
-- Written with `=`, this constraint admits every unparseable path and rejects
-- only well-formed ones naming the wrong item: executed, `'../../etc/passwd'`
-- inserted happily. Since item_id is NOT NULL, `is not distinct from` is false
-- whenever the left side is NULL, so both shapes are rejected.
--
-- Verified against a populated database before shipping, per TEST_STRATEGY.md
-- §8: seeded rows first, then this file. Both write sites build the path as
-- `imagePrefix(uid, itemId)/<uuid>` (useItemImages.tsx, importCategory.ts), so
-- every row the app has ever written satisfies it.
begin;

alter table public.images
  add constraint images_path_full_matches_item
  check (public.storage_item_id(path_full) is not distinct from item_id);

commit;

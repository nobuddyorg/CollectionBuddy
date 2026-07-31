-- Deleting an item has been failing with 42501 "Direct deletion from
-- storage tables is not allowed. Use the Storage API instead."
--
-- Supabase's storage migration `prevent-direct-deletes` (applied to this
-- project 2026-02-28) puts a BEFORE DELETE ... FOR EACH STATEMENT trigger
-- on storage.objects that raises unless the session sets
-- storage.allow_delete_query, which only the Storage API does. Our
-- cleanup_item_images trigger deletes from storage.objects directly, so it
-- has been raising ever since -- and because the guard is statement-level,
-- it fires even when the delete matches no rows at all. The client removes
-- an item's images through the Storage API *before* deleting the row
-- (removeItem in ItemList), so by the time this trigger ran there was
-- normally nothing left for it to delete; it still killed the whole
-- transaction.
--
-- The trigger cannot be repaired, only removed. It was already only a
-- metadata backstop: 0010 established that SQL cannot reach the object
-- bytes, and that actual cleanup happens client-side. That backstop is now
-- unreachable, so it goes, and the client-side path is the whole story.
--
-- What is lost: if the client dies between deleting the item row and
-- removing its objects, the storage rows are orphaned with nothing to
-- collect them. Reclaiming those needs the Storage API, so it belongs in
-- application code or a scheduled job, not in a trigger.
begin;

drop trigger if exists trg_items_cleanup on public.items;
drop function if exists public.cleanup_item_images();

commit;

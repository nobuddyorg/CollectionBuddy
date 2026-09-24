# Architecture review

Reviewer: `architecture-reviewer`. Scope: the whole repository at commit `f6a4b91` (2026-09-24); vendored, generated and third-party code skipped (`web/node_modules`, `web/package-lock.json`, `web/src/app/data/database.types.ts`, binary assets, build output). Read-only: no source file was modified.

Method: 2 scoped lens reviewers (`code-structure`, `data-design-docs`) read their scope in full, a consolidation pass merged and spot-checked their findings, and adversarial verifiers re-checked every critical and high finding (two independent skeptics: `trace` and `context`) and every medium finding (`batch`). Low and info findings were not agent-verified. The lead reviewer's cross-dimension disposition of each finding is in [REVIEW.md](../REVIEW.md).

Findings: 23 (0 critical, 0 high, 5 medium, 15 low, 3 info).

## Summary

CollectionBuddy has a clean architecture overall. Supabase access is confined to data/, login/ and three session files. Every source file is under 350 lines. The data functions take their I/O as injectable defaults. All static gates are green (tsc, ESLint at zero warnings, depcruise, knip, 100% per-file coverage). There are no critical or high findings. The biggest structural risk is that the hard rule on delete order (Storage first, then the row) is written out by hand in four separate places, and two of them break it. Deleting a single photo removes the row first. An import that fails or is cancelled deletes the category and leaves every uploaded object behind. That frees the owner's quota while the bytes stay stored. The editor-sharing model has two consequences the docs don't cover. First, an owner cannot sign photos an editor added to their own entry, yet they count toward their quota, and a revoked editor can still delete them. Second, entries an editor adds are invisible to the owner: they are left out of the delete count, deleted along with the category, and stranded when the editor's access is revoked. Several hooks treat a failed load as empty data, most visibly a failed image re-sign that blanks every card's photos for about 55 minutes. Enforcement tooling is also looser than the docs claim. The depcruise and ESLint Supabase boundary has two holes, and pgTAP negative assertions accept any error. The remaining findings are low-severity duplication, dead code kept alive by the coverage floor, and a cluster of docs that no longer match the migration chain and the code.

## Findings

| ID | Severity | Title | Location | Verification | Lead review |
| --- | --- | --- | --- | --- | --- |
| [ARCH-01](#arch-01) | Medium | The Storage-before-row delete order has no single home, and two of the four delete paths break the CLAUDE.md hard rule (single photo removes the row first; import rollback removes no objects) | `web/src/app/components/ItemList/useItemImages.tsx:248` +8 | batch: partially confirmed (medium) | see REVIEW.md |
| [ARCH-02](#arch-02) | Medium | An owner cannot sign photos an editor added to their own entry, yet they count toward their quota, and the editor can still read and delete them after revocation | `supabase/migrations/0002_functions.sql:262` +7 | batch: confirmed (medium) | see REVIEW.md |
| [ARCH-03](#arch-03) | Medium | Entries an editor adds are invisible to the category owner: their delete confirmation undercounts, deleting the category destroys them, and revoking the editor strands them on the editor's quota | `supabase/migrations/0002_functions.sql:151` +8 | batch: confirmed (medium) | see REVIEW.md |
| [ARCH-04](#arch-04) | Medium | Failed loads are rendered as empty data: a failed image re-sign blanks every card's photos and suppresses retries for about 55 minutes | `web/src/app/components/ItemList/useItemImages.tsx:111` +9 | batch: partially confirmed (medium) | see REVIEW.md |
| [ARCH-05](#arch-05) | Medium | Importing an export scrambles each entry's photo order, cover photo included, because photo rows are timestamped in upload-completion order | `web/src/app/data/importCategory.ts:217` +5 | batch: confirmed (medium) | see REVIEW.md |
| [ARCH-06](#arch-06) | Low | Import reads and parses the archive twice; the hook's unguarded copy reports malformed archives as 'try again', and the reader trusts ZIP headers it never checks | `web/src/app/components/CategorySelect/useImportCategory.tsx:52` +7 | not agent-verified (low/info) | see REVIEW.md |
| [ARCH-07](#arch-07) | Low | The depcruise and ESLint rules that keep Supabase behind data/ have two holes, and architecture.md misstates who imports the client | `web/.dependency-cruiser.mjs:49` +5 | not agent-verified (low/info) | see REVIEW.md |
| [ARCH-08](#arch-08) | Low | The privacy policy promises account deletion, but user_id has no foreign key to auth.users and no deletion runbook exists | `supabase/migrations/0003_tables.sql:6` +2 | not agent-verified (low/info) | see REVIEW.md |
| [ARCH-09](#arch-09) | Low | The definition of an active grant is written twice (read set vs. write predicate), although design-decisions.md says it is written once | `supabase/migrations/0002_functions.sql:294` +2 | not agent-verified (low/info) | see REVIEW.md |
| [ARCH-10](#arch-10) | Low | Creating an entry takes two requests, and the compensating delete ignores its own result, so a failure can leave an invisible entry that still counts toward the quota | `web/src/app/components/ItemCreate/useCreateItem.tsx:26` +3 | not agent-verified (low/info) | see REVIEW.md |
| [ARCH-11](#arch-11) | Low | pg_temp.raises() treats any error as the expected refusal, so pgTAP negative authorization assertions can pass for the wrong reason | `supabase/tests/database/_helpers.psql:56` +2 | not agent-verified (low/info) | see REVIEW.md |
| [ARCH-12](#arch-12) | Low | The category-delete id listing pages with offsets but no ORDER BY | `web/src/app/data/categories.ts:74` +2 | not agent-verified (low/info) | see REVIEW.md |
| [ARCH-13](#arch-13) | Low | Switching category while the list is still loading shows a false 'Search failed' toast | `web/src/app/components/ItemList/useItems.tsx:108` +3 | not agent-verified (low/info) | see REVIEW.md |
| [ARCH-14](#arch-14) | Low | Export is disabled for grantees for a technical reason that is false | `web/src/app/components/CategorySelect/TransferRows.tsx:77` +4 | not agent-verified (low/info) | see REVIEW.md |
| [ARCH-15](#arch-15) | Low | Photon requests live in component hooks, not data/photon.ts, and the three hand-rolled retry loops have already diverged | `web/src/app/components/ItemForm/usePhoton.tsx:124` +6 | not agent-verified (low/info) | see REVIEW.md |
| [ARCH-16](#arch-16) | Low | The PostgREST search-filter branch is dead in production, yet the docs present it as the live injection guard and a mutation target | `web/src/app/data/items.ts:71` +4 | not agent-verified (low/info) | see REVIEW.md |
| [ARCH-17](#arch-17) | Low | Code and docs disagree on the default-language fallback and on whether hand-typed places are pinned | `web/src/app/layout.tsx:46` +4 | not agent-verified (low/info) | see REVIEW.md |
| [ARCH-18](#arch-18) | Low | The database doesn't cap a single tag at 100 characters, although textLimits.ts and two docs say it does | `supabase/migrations/0016_bound_row_volume.sql:109` +4 | not agent-verified (low/info) | see REVIEW.md |
| [ARCH-19](#arch-19) | Low | Docs no longer match the migration chain and CI: which file holds current definitions, the re-share behaviour, CI path filters, secrets and test references | `docs/explanation/design-decisions.md:25` +9 | not agent-verified (low/info) | see REVIEW.md |
| [ARCH-20](#arch-20) | Low | Dead code is kept alive only by tests: modal open/close props, ZipWriter.size, the always-zero skippedItemCount and HeaderProps.className | `web/src/app/components/CenteredModal/index.tsx:28` +6 | not agent-verified (low/info) | see REVIEW.md |
| [ARCH-21](#arch-21) | Info | "One collection per entry" is enforced by a statement-level count trigger on an M:N table, not declaratively | `supabase/migrations/0020_one_collection_per_entry.sql:8` +3 | not agent-verified (low/info) | see REVIEW.md |
| [ARCH-22](#arch-22) | Info | The squash procedure requires hand-run SQL on the hosted project without saying it is maintainer-only | `docs/how-to/developer-guide.md:392` +1 | not agent-verified (low/info) | see REVIEW.md |
| [ARCH-23](#arch-23) | Info | Dependency watch: browser-image-compression has had no release since 2023, and dev tooling pulls in deprecated transitive packages | `web/package.json:28` +1 | not agent-verified (low/info) | see REVIEW.md |

### ARCH-01

Medium: **The Storage-before-row delete order has no single home, and two of the four delete paths break the CLAUDE.md hard rule (single photo removes the row first; import rollback removes no objects)**

- Category: hard-rule-violation
- Location: `web/src/app/components/ItemList/useItemImages.tsx:248`, `web/src/app/components/ItemList/useItemImages.tsx:264`, `web/src/app/data/images.ts:63`, `web/src/app/data/importCategory.ts:250`, `web/src/app/data/importCategory.cancellation.test.ts:70`, `web/src/app/components/CategorySelect/useCategories.tsx:203`, `web/src/app/components/ItemList/useItemMutations.tsx:99`, `web/src/app/components/ItemList/index.tsx:110`, `CLAUDE.md:50`
- Confidence: high; reported by lens `code-structure`, `data-design-docs`
- Verification: batch: partially confirmed (medium)

**Description.** The ordering invariant is security- and data-critical, but no data-layer function owns it. Each of the four delete paths (category, entry, single photo, import rollback) writes its own sequence. The single-photo path reverses the order on purpose, which silently overrides a hard rule and contradicts design-decisions.md. The import rollback skips object removal entirely. Deleting an entry is split across two hooks (useItemMutations plus two callbacks from useItemImages), which is the friction that lets the order drift without any test noticing.

**Impact.** (a) A user deletes a photo. The row delete succeeds, then removeImageObjects fails (connection lost, Storage 5xx). Both WebP objects stay in the bucket for at least 48 h, and no client knows their paths any more. (b) A user cancels a 3,000-photo import at photo 2,500, or it hits a quota refusal. About 5,000 objects lose their images rows but stay in Storage. tg_images_quota sums images rows, so the owner's 1 GiB quota frees up immediately while the bytes remain. Repeating import-and-cancel grows project storage outside every per-user quota, limited only by the sweeper's 10,000 objects per daily run. (c) Future edits to any delete path have no shared function or test that pins the order.

**Recommendation.** Put the order in the data layer once, e.g. data/images.ts `removeObjectsThenRows({paths, deleteRows})`: remove objects in REMOVE_OBJECTS_BATCH_SIZE chunks, fail fast, then delete rows. Call it from all four paths. Have importCategory record the paths it uploaded, or list them with listImagePathsForItems for the created item ids, and remove them before deleteCategoryRow. Assert that removal in the cancellation and cleanup tests. For the single photo, either read the paths, remove the objects, then delete the row, or raise the row-first choice with the maintainer and amend the hard rule and design-decisions.md instead of leaving an undocumented exception.

Evidence:

```text
CLAUDE.md hard rule: "Delete storage objects client-side **before** the DB row, never after, and never through a DB trigger." docs/explanation/design-decisions.md:48 "So the client removes the objects _first_, then deletes the item or category row. Reversing the order orphans the files with no way to find them again."

Single photo (verified): web/src/app/components/ItemList/useItemImages.tsx:248 `const { data, error } = await deleteImageRow(image.id);` then :259 `// Row already gone: a failure below is a storage leak, not data loss.` then :264 `const { error: removeError } = await removeImageObjects(paths);`. web/src/app/data/images.ts:63 `// The row itself is removed, not a cascade's side effect, so delete-and-capture in one call is safe.` No doc records this exception (grep for deleteImageRow or "storage leak" in docs/ returns nothing).

Import rollback (verified): web/src/app/data/importCategory.ts:250-251 `} catch (error) { const { error: cleanupError } = await deleteCategoryRow(category.id);`. This runs after runPool/importPhoto has already uploaded `${pathBase}.webp` and `.thumb.webp` (importPhoto.ts:80-96). The cascade then runs categories → item_categories → delete_item_if_orphan (0002_functions.sql:161-173, security definer) → items → images (0003_tables.sql:64 `on delete cascade`). importCategory.cancellation.test.ts:70 'stops the whole photo pool and cleans up when cancelled mid-upload' asserts only `expect(deleteCategoryRow).toHaveBeenCalledWith('new-cat-1')`.

The compliant paths are each hand-written: useCategories.tsx:196-207 `for (const paths of chunk(orphanedPaths, REMOVE_OBJECTS_BATCH_SIZE)) { ... await removeImageObjects(paths) ... } const { error } = await deleteCategoryRow(id);` and useItemMutations.tsx:99-101 `captureItemImagePaths(id)` → `removeImageBytes(id, imagePaths)` → `deleteItem(id)`. The last two callbacks live in useItemImages (322 lines) and are wired through ItemList/index.tsx.

Backstop: .github/workflows/cleanup-orphaned-photos.yml:36 `o.created_at < now() - interval '48 hours'`, :49 `MAX_OBJECTS_PER_RUN=10000`.
```

<details>
<summary>Verifier notes</summary>

- `batch` (partially confirmed, medium): Both hard-rule breaches are real. (1) Single-photo delete removes the row first and the objects second. This is deliberate: a unit test pins that order. No doc records it as an exception to CLAUDE.md's "Delete storage objects client-side before the DB row, never after", and design-decisions.md:48 states the opposite. (2) The import rollback deletes the category row. The cascade (item_categories -> delete_item_if_orphan -> items -> images) drops the images rows for objects importPhoto already uploaded, and no object is ever removed. runPool awaits every in-flight worker before it rethrows (pool.ts:34-35), so nothing uploads after the row delete, but everything uploaded before it is orphaned. The cancellation test asserts only deleteCategoryRow. Overstated parts: (a) "no client knows their paths any more" and "no way to find them again" ignore the daily sweeper, which removes any object no images row names once it is older than 48 h, so the harm is bytes lingering for 48 h or more, not permanent loss. (b) The quota-bypass framing is not new. design-decisions.md:44 already accepts that rowless uploads are outside every quota until swept, and any user can upload rowless objects directly through the Storage API, so import-and-cancel adds no abuse capability. (c) "No single home" is a maintainability opinion, not a defect. Medium stands for the unflagged hard-rule reversal and the untested orphaning on a data-critical path. Measured by actual harm alone (transient orphaned bytes), low would also be defensible. Mitigations: The daily cleanup-orphaned-photos.yml sweep removes any object no images row references once it is older than 48 h, capped at 10,000 per run, so orphans are temporary. The single-photo path shows the error toast delete_image_cleanup_error when object removal fails. The quota impact is already accepted in design-decisions.md:44.

</details>

### ARCH-02

Medium: **An owner cannot sign photos an editor added to their own entry, yet they count toward their quota, and the editor can still read and delete them after revocation**

- Category: design-decision-challenge
- Location: `supabase/migrations/0002_functions.sql:262`, `supabase/migrations/0012_storage_owner_policies_initplan.sql:7`, `supabase/migrations/0017_shared_read_once_per_statement.sql:76`, `supabase/migrations/0002_functions.sql:222`, `docs/reference/architecture.md:120`, `docs/explanation/design-decisions.md:40`, `web/e2e/signed-in/rls/editor-share-photographs.spec.ts:51`, `web/src/app/components/ItemList/imageEntries.ts:58`
- Confidence: high; reported by lens `data-design-docs`
- Verification: batch: confirmed (medium)

**Description.** An editor uploads under their own uid prefix, but tg_images_enforce files the images row under the item's owner. The owner can see the row, and it counts toward their quota. No storage SELECT policy matches for them, though: segment 1 is the editor's uid, and they hold no grant on their own category. architecture.md calls this "the same asymmetry" as editor-filed items. It isn't. The documented reason for keeping ownership out of the read predicate (architecture.md:50) is to hide items the owner never owned, and it doesn't cover an object attached to the owner's own entry. The "own objects" policies also key on segment 1, so revoking the share leaves the ex-editor able to read and delete those bytes.

**Impact.** The owner shares a collection at editor level, and the editor adds a photo to one of the owner's entries, as user-guide.md:39-43 describes. The owner's client lists the images row, but signing is refused and toImageEntries drops the plate, so the photo never appears on their own entry and their export cannot include its bytes. It still counts toward their 1 GiB quota. After they revoke the editor, the ex-editor can still `remove()` the object under their own prefix. The owner's images row then points at missing bytes, and they could never see the photo in the first place.

**Recommendation.** Add an item-owner branch to "read shared objects" (and consider it for delete), e.g. `or exists (select 1 from public.items i where i.id = public.storage_item_id(name) and i.user_id = (select auth.uid()))`. This reveals nothing hidden, because the owner already sees the item and the row. Ship it with an e2e/signed-in/rls/ case where the owner signs an editor-uploaded photo on their own entry, plus a case for what a revoked editor can still do with such an object. Correct architecture.md:120. Alternatively, record the revoke behaviour explicitly as accepted.

Evidence:

```text
supabase/migrations/0002_functions.sql:262 (tg_images_enforce) `new.user_id := itm_user;` sets the images row to the item owner. 0012_storage_owner_policies_initplan.sql:7-12 `alter policy "read own signed objects" ... split_part(name, '/', 1) = (select auth.uid())::text` (and the same shape for "delete own objects" at :21-26). 0017_shared_read_once_per_statement.sql:76-86 `alter policy "read shared objects" ... ic.category_id = any(array(select public.granted_category_ids()))`. granted_category_ids (0017:9-22) excludes ownership, and 0002:222 `raise exception 'cannot share a category with yourself';`. editor-share-photographs.spec.ts:50-51 `// An editor's upload lands under the editor's own uid prefix ... const path = `${otherUserId}/${itemId}/rls-editor-probe.webp`;`. That spec signs only as the editor (`apiAs(otherToken)...createSignedUrl(path, 60)`); no spec signs as the owner. storage-js 2.116.0 JSDoc for createSignedUrls (web/node_modules/@supabase/storage-js/dist/index.d.cts:1403-1405, mirrored at https://supabase.com/docs/reference/javascript/storage-from-createsignedurls): "RLS policy permissions required: ... `objects` table permissions: `select`". imageEntries.ts:58 `if (!urlFull && position < RENDERABLE_PLATES) continue;` drops an unsigned plate. architecture.md:120 "the owner cannot read or sign an object an editor uploaded — same asymmetry as an editor-filed item being invisible to the category's owner. Deliberate." design-decisions.md:40 "A photograph added by an editor lands on the owner's row, so it counts against the owner's quota."
```

<details>
<summary>Verifier notes</summary>

- `batch` (confirmed, medium): Traced through the current policy set. No migration after 0017 touches storage.objects policies (0018-0020 contain none). An editor uploads under `<editorUid>/<ownerItemId>/...`. The only insert policy admits that, and the e2e spec uses exactly that path. tg_images_enforce then files the images row under the item's owner, so the owner's `select images` owner branch shows it and tg_images_quota (0009) sums it against them. For the bytes, the owner matches neither SELECT policy on storage.objects: - "read own signed objects" requires segment 1 = auth.uid(), and segment 1 is the editor's uid. - "read shared objects" requires `category_id = any(granted_category_ids())`, which excludes ownership, and 0002:222 forbids sharing with yourself. storage-js 2.116.0 documents that createSignedUrls needs `select` on objects, so signing is refused. toImageEntries drops an unsigned plate at positions under 5, so the photo never renders on their own entry. The revocation claim holds too: "read own signed objects" and "delete own objects" key only on segment 1, so a revoked editor keeps read and delete on those bytes. architecture.md:120 calls the behaviour deliberate, but the reasoning given does not transfer. The documented reason for keeping ownership out of the read predicate (architecture.md:50) is to hide items the owner was never granted. Here the owner owns the item and already reads the images row, so an owner branch reveals nothing new. Additional consequence the finding does not state: storage-js documents remove() as needing `delete` AND `select`. When the owner deletes their entry, the "delete shared objects" policy matches through has_category_write_access (which includes ownership), but SELECT does not, so the editor's objects are not removed and orphan until the sweep. No test covers the owner signing such an object: editor-share-photographs.spec.ts signs only as the editor. Medium: a functional defect in a core sharing flow plus a revocation gap, with no cross-tenant read. Mitigations: Partial only. architecture.md:120 documents that the owner cannot sign editor-uploaded objects, though not the quota, export or revocation consequences. The sweep removes the bytes 48 h after their row is gone. Export skips and counts unfetchable photos rather than failing (exportCategory.ts:219). No cross-tenant confidentiality breach: the ex-editor can read only bytes they uploaded themselves.

</details>

### ARCH-03

Medium: **Entries an editor adds are invisible to the category owner: their delete confirmation undercounts, deleting the category destroys them, and revoking the editor strands them on the editor's quota**

- Category: design-decision-challenge
- Location: `supabase/migrations/0002_functions.sql:151`, `supabase/migrations/0002_functions.sql:307`, `supabase/migrations/0017_shared_read_once_per_statement.sql:57`, `web/src/app/data/categories.ts:96`, `web/src/app/components/CategorySelect/useCategoryRemoval.tsx:72`, `web/src/app/components/CategorySelect/useCategories.tsx:158`, `supabase/tests/database/055_triggers_edge_cases_test.sql:116`, `docs/how-to/user-guide.md:39`, `docs/reference/architecture.md:50`
- Confidence: high; reported by lens `data-design-docs`
- Verification: batch: confirmed (medium)

**Description.** Hiding editor-filed items from the owner is a documented, deliberate choice. Three consequences of it are not documented, and each does concrete harm. (1) The owner's delete dialog counts only their own links. The SECURITY DEFINER orphan sweep then deletes the editor's entries too, and their photos are never removed client-side. (2) When the owner revokes the grant or the editor leaves, the editor's entries stay linked only to a category the editor can no longer list. They still count toward the editor's 50,000-entry and 1 GiB quotas, but no UI path can reach, export or delete them. That is the stranding 055 says the delete-time sweep exists to avoid. (3) The user guide describes editors adding to the owner's collection, not to a layer inside it that the owner cannot see.

**Impact.** The owner shares "Coins" at editor level, and a friend adds 40 entries. The owner never sees them. Deleting "Coins" asks them to confirm deleting 12 entries, then removes 52, the friend's 40 included, without telling the friend. Their photos wait for the 48 h sweep. If they revoke the friend instead, the friend's 40 entries and photos become unreachable in the friend's own account but stay on their quota indefinitely.

**Recommendation.** Choose and document a model. Either let the category owner read everything linked into their category, or on revoke/leave re-home editor-owned entries into an editor-owned category and count them in the owner's delete confirmation. At minimum, state all three consequences in user-guide.md and architecture.md, and add rls/ cases for delete-destroys and revoke-strands.

Evidence:

```text
supabase/migrations/0002_functions.sql:151 (tg_item_categories_enforce) `new.user_id := itm_user;`, so an editor-created item's link carries the editor's user_id. 0017_shared_read_once_per_statement.sql:57-62 `alter policy "select item_categories with read access" ... using ( user_id = (select auth.uid()) or category_id = any(array(select public.granted_category_ids())) )`, and the owner has no grant on their own category. 0002:307 `-- Deliberately excludes ownership: an owner must not see an item an editor merely filed into their category.` categories.ts:96-101 `countItemsForCategory ... .select('item_id', { count: 'exact', head: true }).eq('category_id', categoryId)` (RLS-scoped) feeds the confirm message (useCategoryRemoval.tsx:72-84). useCategories.tsx:158 `await listItemIdsForCategory(id)` collects only visible ids before `deleteCategoryRow(id)`. 055_triggers_edge_cases_test.sql:116-122: "an entry an editor filed into a shared collection is removed along with the collection ... even though the owner can neither see nor delete that entry directly ... Leaving it behind would strand a row its owner could no longer reach through any collection." user-guide.md:39-43 "They can then add, change and delete items and photos in that category".
```

<details>
<summary>Verifier notes</summary>

- `batch` (confirmed, medium): Hiding editor-filed items from the owner is documented (0002:307, architecture.md:50). All three undocumented consequences hold in code. (1) Undercount. tg_item_categories_enforce sets link.user_id to the item owner (the editor). The owner's item_categories SELECT matches neither `user_id = auth.uid()` nor a grant. countItemsForCategory is an RLS-scoped exact head count, so the confirmation dialog shows only their own links. listItemIdsForCategory, used to collect orphaned photo paths, is likewise RLS-scoped. The FK `on delete cascade` plus the SECURITY DEFINER statement-level delete_item_if_orphan then deletes the editor's items too; 055 asserts this. Their images rows cascade without their objects ever being removed client-side (the owner cannot see those rows or objects). (2) Stranding. After revoke or leave, the editor still owns the items (items SELECT owner branch) and the link (item_categories.user_id = editor). The category disappears from their list: categories SELECT is owner-or-granted. Every item read in the data layer filters by category_id (items.ts:69,102,109; the search RPC is per category; exportItemPages.ts:36), so no UI path reaches, exports or deletes them. They still count toward the editor's entry quota and, because images.user_id = the item owner, the editor's byte quota. 0020's one-collection-per-entry ceiling also means the editor cannot re-file them without first deleting the link, and deleting the link fires the orphan sweep. The 055 test's own comment names this stranding as the thing the sweep exists to prevent, but revocation produces it and nothing documents it (grep for "strand" in docs/ returns nothing). (3) user-guide.md:39-43 tells users an editor can "add, change and delete items and photos in that category" and never says the owner won't see the additions. Medium: an edge-case correctness and data-lifecycle issue in a documented design, with a misleading confirmation before an irreversible delete of another user's entries. Mitigations: The owner-invisibility itself is documented (architecture.md:50, 0002:307). Cascade deletion of editor entries is intended and pgTAP-tested (055). Orphaned objects are swept after 48 h. A stranded editor could still delete their items directly through the API. Nothing mitigates the undercount or the post-revocation stranding.

</details>

### ARCH-04

Medium: **Failed loads are rendered as empty data: a failed image re-sign blanks every card's photos and suppresses retries for about 55 minutes**

- Category: error-handling
- Location: `web/src/app/components/ItemList/useItemImages.tsx:111`, `web/src/app/components/ItemList/useItemImages.tsx:122`, `web/src/app/components/ItemList/useItemImages.tsx:45`, `web/src/app/components/ItemList/imageEntries.ts:88`, `web/src/app/components/ItemList/ItemCard.tsx:47`, `web/src/app/components/ItemList/useItemImages.refresh.test.tsx:80`, `web/src/app/components/CategorySelect/useCategories.tsx:63`, `web/src/app/page.tsx:107`, `web/src/app/components/CategorySelect/useShares.tsx:47`, `web/src/app/components/CategorySelect/useCategoryRemoval.tsx:37`
- Confidence: high; reported by lens `code-structure`
- Verification: batch: partially confirmed (medium)

**Description.** CLAUDE.md says to fail fast and not to use empty values as signals. Several hooks turn a failed load into an empty collection, and the image path also records the failed attempt as a successful sign, so the render layer cannot tell "failed" from "empty". The category and share paths do show a toast, but they still render the wrong state underneath it. The image path fails completely silently. useItems, by contrast, keeps the previous items and toasts, which is the right shape.

**Impact.** A tab is left open for more than an hour, and a laptop wakes from sleep. visibilitychange fires the re-sign before Wi-Fi is back, listImagesForItems fails, and every card switches to "no photos, add photo". It stays that way for about 55 minutes after the network returns (reproduced), which invites duplicate uploads. A failed category load shows the first-run "name your first category" screen to an owner with many categories. A failed share load tells the owner nobody has access, and makes Leave do nothing for a grantee.

**Recommendation.** Keep the previous entries on a failed list or sign, and don't stamp lastSignedAtRef on failure, so the 60 s interval retries. Return a tagged result such as {status:'failed'} from useCategories.reload and useShares.reload, and render a retryable error state instead of empty or first-run. Replace the 'settles the item as empty' test with a failure-then-recovery test.

Evidence:

```text
web/src/app/components/ItemList/useItemImages.tsx:122-127 `const grouped = listed.error !== null ? new Map<string, Map<string, ImageEntryData>>() : groupImageRows(listed.data); if (listed.error !== null) console.error('Failed to list images', listed.error);`. applyGroupedImages then does `setImages((previous) => ({ ...previous, ...signed }))`, which sets every item to [], and :111 `lastSignedAtRef.current = Date.now();` whether or not the list failed. The gate at :45-49 skips refresh while `Date.now() - lastSignedAtRef.current < SIGNED_URL_SERVER_TTL_MS - REFRESH_MARGIN_MS`. There is no toast, only console.error. ItemCard.tsx:47 `const awaitingPhoto = !images.length && !imagesLoading && !busy;` renders the add-photo plate. useItemImages.refresh.test.tsx:80 `it('reports a failed listing and settles the item as empty'` locks this in. The lens reproduced it with the real hook (scratch test): `after failure: 0 list calls 3` / `10 min later: 0 list calls 3`.

Same shape elsewhere. useCategories.tsx:62-63 `if (isCurrent(mySequence)) toast.error(t('category_select.load_error')); return [];` leads to page.tsx:107 `// Only reachable for a collection with no categories at all.` (the first-run empty state). useShares.tsx:47 `return [];` leads to share-list-empty. useCategoryRemoval.tsx:37 `if (!myShareId) return;` makes Leave a silent no-op after a failed share load.
```

<details>
<summary>Verifier notes</summary>

- `batch` (partially confirmed, medium): The image path is fully confirmed. When listImagesForItems fails, refreshAllImages substitutes an empty Map, only console.errors (no toast), and calls applyGroupedImages. signEntries then returns [] for every item id and overwrites state, and applyGroupedImages stamps lastSignedAtRef = Date.now() anyway. useSignedUrlRefresh skips while `Date.now() - lastSignedAtRef < 55 min`, so neither the 60 s interval nor visibilitychange retries for about 55 minutes. ItemList's effect re-runs only when itemIdsKey changes, so a reload returning the same items does not recover either. ItemCard then renders the add-photo plate. The unit test 'reports a failed listing and settles the item as empty' locks this in. The realistic trigger is a tab idle for over 55 minutes whose re-sign fires on wake before the network returns. This contradicts CLAUDE.md's "Surface errors, never swallow them" and "no null/undefined as a signal where a type or empty collection models it". The other paths are overstated. useCategories.reload does not overwrite existing categories on failure: setCategories is skipped and it toasts load_error. Only on the very first load does the [] return make useCatalogue select null and show the "No collections yet" screen, and even then under a visible "Could not load collections. Please try again." toast. useShares.reload likewise skips setShares and toasts share_load_error. Leave becoming a no-op after a failed share load is real but follows a visible error. These are low-severity UX issues, not silent failures. Overall medium, driven by the silent, retry-suppressing image path (an edge-case correctness bug); no data is lost. Mitigations: Image path: none automatic. A full page reload, or anything that changes the visible item set (paging, search, switching category), re-lists and recovers. Category and share paths: a visible error toast accompanies the wrong empty state, and later category reload failures keep the previously loaded list.

</details>

### ARCH-05

Medium: **Importing an export scrambles each entry's photo order, cover photo included, because photo rows are timestamped in upload-completion order**

- Category: correctness
- Location: `web/src/app/data/importCategory.ts:217`, `web/src/app/data/importPhoto.ts:102`, `supabase/migrations/0003_tables.sql:71`, `web/src/app/data/images.ts:92`, `docs/how-to/user-guide.md:84`, `docs/reference/architecture.md:131`
- Confidence: high; reported by lens `data-design-docs`
- Verification: batch: confirmed (medium)

**Description.** A photo's position is simply its images.created_at, which is when its row was inserted. The importer uploads each item's photos in parallel, six at a time, with retries and backoff, and inserts each row only when its uploads finish. Rows therefore land in completion order, not archive order. The item rows get explicit, archive-ordered timestamps. The photo rows don't.

**Impact.** Take an entry with 1.webp (4 MB, the cover) and 2.webp (200 KB). Photo 2 usually finishes first, gets the earlier created_at, and becomes the card's cover after import. A retried upload (backoff) moves a photo to the end. Nothing in the UI reorders photos, so restoring a backup silently rearranges multi-photo entries, and fixing it means deleting and re-uploading. A lesser point: the manifest's per-item created_at is also discarded (the export CSV/JSON then shows the import time), but no screen shows that date.

**Recommendation.** Send an explicit created_at on each images insert, derived from archive order (for example, the item's timestamp plus the photo index in ms), and grant or allow it in the insert the way items already do. Add a unit test in which photo uploads resolve out of order.

Evidence:

```text
importCategory.ts:217-242 flattens every photo of every item into one `runPool({ items: photoTasks, concurrency: PHOTO_UPLOAD_CONCURRENCY, ...})`. importPhoto.ts:80-107 uploads the full and thumb objects with retries, then `createImage({ item_id: task.itemId, path_full: ..., path_thumb: ..., size_bytes: bytes.length })`, with no created_at. 0003_tables.sql:71 `created_at timestamptz not null default now(),`, and there is no position column. images.ts:92-93 orders photo reads by `.order('created_at', { ascending: true }).order('id', ...)`. user-guide.md:84 "An item can have any number of photos, in the order you added them." For comparison, items get deterministic timestamps: importFormat.ts:42 `/** One created_at per item, 1 ms apart, ending at now, so one insert keeps the archive order. */`.
```

<details>
<summary>Verifier notes</summary>

- `batch` (confirmed, medium): I could not refute this finding. I traced the full path and each step holds. (1) The export writes an item's photos into the archive oldest-first, by images.created_at, then id. The manifest order and the N.webp names follow that order. (2) The import flattens every photo of every item into one task list and runs it through runPool at a concurrency of 6. Each runner pulls the next task from a shared iterator and awaits it, so sibling photos of one item run at the same time. (3) Each worker compresses a thumbnail (browser-image-compression with useWebWorker: true, so off the main thread and in parallel), uploads the full image and the thumbnail with retries and backoff, and only then calls createImage. It sends no created_at. (4) images.created_at defaults to now(). Per the Postgres docs, now() is the start time of the inserting transaction, and each PostgREST insert is its own transaction. So the rows are stamped in completion order. (5) Every read orders photos by created_at ascending, then id: listImagesForItems and the embedded page read in items.ts. groupImageRows keeps that order, and ImageGrid renders slot 0 as the hero, or as the first of the two-photo 'front and back' pair. Concrete case: an entry with 1.webp and 2.webp is imported. If photo 2 compresses and uploads faster, which happens often because network and size jitter make the race roughly a coin flip, photo 2 becomes the hero after the restore. No UI can reorder photos: the normal upload takes one file per call and nothing else changes the order. The only fix is deleting and re-uploading, which contradicts user-guide.md:84. Two small corrections that do not change the verdict. First, the '4 MB' example is inflated: stored photos are re-encoded to WebP at 1000px max at upload (useItemImages.tsx:163-166), so sizes are typically a few hundred KB. The reorder does not depend on a large size gap, though; similar sizes still race. Second, 'a retried upload moves a photo to the end' is true only relative to siblings still in flight. The secondary point, that item created_at is discarded, is deliberate: importTimestamps is documented as 'ending at `now`'. It is not a separate defect. Severity is medium, not higher: no photo is lost, every photo still arrives, and only the order and the cover change. It is an edge-case correctness bug limited to import. Tests do not catch it. The unit tests use one photo per item, or fakes that resolve in call order. The e2e import spec (web/e2e/signed-in/import.spec.ts:72-104) uploads a single photo. Mitigations: None in code, tests or docs. No reorder UI exists, and no test covers multi-photo import order: importCategory.photos.test.ts uses one photo, and the e2e import.spec.ts uploads one photo. The fix needs no migration. The table-level grant `grant select, insert, delete on public.item_categories, public.images to authenticated` (supabase/migrations/0006_policies.sql:198-200) already lets the client send created_at, and tg_images_enforce does not override it. So the recommendation (an explicit created_at per image, derived from the item's import timestamp plus the photo's index, with a unit test in which uploads resolve out of order) is feasible as stated. Another option is to insert each item's image rows in archive order once that item's uploads have settled.

</details>

### ARCH-06

Low: **Import reads and parses the archive twice; the hook's unguarded copy reports malformed archives as 'try again', and the reader trusts ZIP headers it never checks**

- Category: duplication
- Location: `web/src/app/components/CategorySelect/useImportCategory.tsx:52`, `web/src/app/components/CategorySelect/useImportCategory.tsx:57`, `web/src/app/components/CategorySelect/useImportCategory.tsx:104`, `web/src/app/data/importCategory.ts:156`, `web/src/app/data/importCategory.ts:170`, `web/src/app/data/importFormat.ts:14`, `web/src/app/data/importFormat.ts:32`, `web/src/app/data/zip.ts:211`
- Confidence: high; reported by lens `code-structure`, `data-design-docs`
- Verification: not agent-verified (low/info)

**Description.** Reading and validating an import is split across two layers with different error handling. The component hook repeats the data layer's full archive read and manifest parse just to pick a unique name, so importCategory's careful error classification can't be reached for the most common malformed inputs. The manifest is trusted past its format tag, and the reader only works on byte-for-byte output of its own writer without detecting when it isn't. The user guide scopes import to archives "exported from CollectionBuddy", which limits this to low.

**Impact.** A truncated or corrupt collection.json, or an export re-zipped with any standard tool (deflate, extra fields), shows "Could not import this archive. Please try again.", which can never succeed. A deflated photo entry inside bounds is read as garbage bytes. A manifest item without `photos` passes parseManifest and throws a TypeError (`item.photos.map`) after the category was created and rolled back. Every import decodes and copies the whole archive twice.

**Recommendation.** Read and parse once: a data-layer `readArchive(file)` returning {entries, manifest}, passed into importCategory (or give importCategory a `nameFor(manifestName)` callback). Map ZipReadError, SyntaxError and entries whose method is not 0, or whose compressed size is not equal to their size, to ImportFormatError. Honour extra and comment lengths. Validate item shape (string title, string[] tags and photos) in parseManifest. Use MANIFEST_NAME in findManifestPath.

Evidence:

```text
useImportCategory.tsx:51-59 `// Peeked ahead of the real read only to name the category first ... const entries = await readZipEntries(file); ... const manifest = parseManifest( JSON.parse(new TextDecoder().decode(entries.get(manifestPath))),`. A SyntaxError or ZipReadError thrown here reaches :104 `: t('category_select.import_error')` instead of import_format_error. importCategory.ts:156 `entries = await readZip(file);` re-reads the file, and :170-179 wraps parse failures `throw new ImportFormatError('Could not read collection.json in this archive')`, a mapping the peek preempts. importFormat.ts:14 `/** Checks only the format tag and version ...*/` and :26 `return data as ExportManifest;`. zip.ts:211-228 reads `size` at central offset 24 but never the method (offset 10) or compressed size (20). It computes `dataStart = localOffset + LOCAL_HEADER_BYTES + localNameLength` without the local extra length, and advances `directoryAt += CENTRAL_HEADER_BYTES + nameLength` ignoring extra and comment lengths. The lens confirmed the offsets against yauzl (web/node_modules/yauzl/index.js:266-282). Scratch check: a Python ZIP_DEFLATED archive gives `JSON.parse threw SyntaxError`. importFormat.ts:32 hard-codes '/collection.json'.
```

### ARCH-07

Low: **The depcruise and ESLint rules that keep Supabase behind data/ have two holes, and architecture.md misstates who imports the client**

- Category: boundary-enforcement
- Location: `web/.dependency-cruiser.mjs:49`, `web/.dependency-cruiser.mjs:52`, `web/eslint.config.mjs:80`, `web/eslint.config.mjs:87`, `docs/reference/architecture.md:138`, `CLAUDE.md:119`
- Confidence: high; reported by lens `code-structure`, `data-design-docs`
- Verification: not agent-verified (low/info)

**Description.** The layering holds today, but only by convention. The tools don't enforce the boundary that CLAUDE.md ("besides `login/` and the top-level session files") and architecture.md describe as enforced. The Supabase client is where authorization-sensitive queries originate.

**Impact.** A change adds a Supabase query to a new top-level hook (components already import top-level modules, e.g. Header/Menu.tsx imports '../../useTheme'), or constructs its own client from @supabase/supabase-js inside a component. depcruise and ESLint both pass, and the fetch/transform/render split erodes silently.

**Recommendation.** Replace the directory-wide regex with the three named files (`'^src/app/(useSession|useSignOut)\\.ts$'`, `'^src/app/SupabaseWarmup\\.tsx$'`). Forbid value imports of `@supabase/supabase-js` outside supabase.ts (depcruise rule with `dependencyTypesNot: ['type-only']`). Fix architecture.md:138.

Evidence:

```text
web/.dependency-cruiser.mjs:46-50 `pathNot: [ '^src/app/data/', '^src/app/login/', '^src/app/[^/]+\\.(ts|tsx)$', ]` exempts every top-level file, while its comment (:39-43) names only "useSession.ts, useSignOut.ts, SupabaseWarmup.tsx" and promises "a component cannot regain direct access by routing through a new helper module". :52 `to: { path: '^src/app/supabase\\.ts$' }` does not cover `@supabase/supabase-js`. eslint.config.mjs:80 `files: ['src/app/components/**/*.{ts,tsx}']` and :87 `group: ['**/supabase', '**/supabase.ts']`. The lens probed a scratch copy: a new top-level helper importing supabase.ts, consumed by a component, plus a component calling `createClient` from '@supabase/supabase-js'. depcruise printed `✔ no dependency violations found`, and ESLint returned `[]` for the createClient import. architecture.md:138 "Session code (`useSession.ts`, `page.tsx`, `login/`) reaches `supabase.ts` directly". grep shows the actual importers outside data/ are login/*, useSession.ts, useSignOut.ts and SupabaseWarmup.tsx, not page.tsx.
```

### ARCH-08

Low: **The privacy policy promises account deletion, but user_id has no foreign key to auth.users and no deletion runbook exists**

- Category: schema-design
- Location: `supabase/migrations/0003_tables.sql:6`, `web/public/privacy-policy.txt:33`, `.github/workflows/cleanup-orphaned-photos.yml:36`
- Confidence: medium; reported by lens `data-design-docs`
- Verification: not agent-verified (low/info)

**Description.** Deleting a user in Supabase removes only the auth.users row. Without foreign keys nothing cascades, and the sweeper keeps the user's objects because their images rows still reference them. The operator has no documented order that complies with the rule (Storage first) for honouring a deletion request.

**Impact.** A deletion request handled by deleting the user in the dashboard leaves all their categories, items, shares and photos in the database and bucket indefinitely. The published privacy promise is silently broken.

**Recommendation.** Add `references auth.users(id) on delete cascade` (`not valid`, validated once no orphans exist), so the existing sweeper reclaims the objects after 48 h. Ship it with the CLAUDE.md migration checklist. Alternatively, document a deletion runbook in developer-guide.md that removes Storage objects first.

Evidence:

```text
0003_tables.sql:6 `user_id uuid not null,` (categories), and the same for items, item_categories, category_shares.owner_user_id and images. `grep -rn 'auth.users' supabase/migrations` returns nothing. privacy-policy.txt:32-33 "You may request access, correction, or deletion of your data at any time. - To delete your account and associated data, please contact: support@nobuddy.org". cleanup-orphaned-photos.yml sweeps only objects no images row references. The only deletion procedure in docs/ is the load-test teardown (load-testing.md:66).
```

### ARCH-09

Low: **The definition of an active grant is written twice (read set vs. write predicate), although design-decisions.md says it is written once**

- Category: duplication
- Location: `supabase/migrations/0002_functions.sql:294`, `supabase/migrations/0017_shared_read_once_per_statement.sql:17`, `docs/explanation/design-decisions.md:126`
- Confidence: high; reported by lens `data-design-docs`
- Verification: not agent-verified (low/info)

**Description.** 0017 unified the read side, but the write predicate still restates "an active grant for the caller's email" separately. These are authorization predicates, and the docs tell a reviewer the definition lives in one place.

**Impact.** Suppose a later change tightens what a grant is (an acceptance flag, a different email comparison) by editing granted_category_ids() as the docs direct. An editor whose grant no longer qualifies for read keeps write access to items, item_categories, images and shared storage objects through has_category_write_access().

**Recommendation.** Define write access on the same source, e.g. `exists (select 1 from category_shares s where s.category_id = cat_id and s.role = 'editor' and cat_id = any(array(select granted_category_ids())))` (keep the plan cost measured with 075), or correct the doc claim. Add a pgTAP case that pins read and write agreeing on an expired editor grant.

Evidence:

```text
0002_functions.sql:294-301 (has_category_write_access) `from public.category_shares s where s.category_id = cat_id and s.invited_email = public.caller_email() and s.role = 'editor' and (s.expires_at is null or s.expires_at > now())`. 0017_shared_read_once_per_statement.sql:17-21 (granted_category_ids) `from public.category_shares s where s.invited_email = public.caller_email() and (s.expires_at is null or s.expires_at > now());`. 0017:27 `-- One definition of a grant: the scalar check now asks the set.` design-decisions.md:126 "`has_category_read_access()` is defined on the same set, so what a grant is (email, expiry) is written once." has_category_write_access backs policies in 0006 (lines 65, 74, 87, 111, 168, 181) and storage (0007:90).
```

### ARCH-10

Low: **Creating an entry takes two requests, and the compensating delete ignores its own result, so a failure can leave an invisible entry that still counts toward the quota**

- Category: data-integrity
- Location: `web/src/app/components/ItemCreate/useCreateItem.tsx:26`, `web/src/app/components/ItemCreate/useCreateItem.tsx:41`, `web/src/app/data/importCategory.ts:100`, `supabase/migrations/0002_functions.sql:169`
- Confidence: medium; reported by lens `code-structure`
- Verification: not agent-verified (low/info)

**Description.** Entry creation is not atomic, and the compensation swallows its error, contrary to CLAUDE.md's "Surface errors, never swallow them".

**Impact.** The connection drops (or the tab closes) between the item insert and the link insert, and the compensating delete also fails. The entry now sits in no category. It never appears in the grid, search, map or export, yet counts toward the 50,000-entry limit forever. In the import path, up to 100 such rows per failed batch.

**Recommendation.** At minimum, check and report the compensating delete's result. Better, create the item and its link in one transaction via a SECURITY INVOKER RPC, with the rls/ e2e case CLAUDE.md requires. Or extend the daily job to report zero-category items.

Evidence:

```text
useCreateItem.tsx:26 `const { data, error } = await createItem({ ...values, tags });` then :31 `await linkItemToCategory(itemId, categoryId,`. On failure, :41-43 `if (itemId) { await deleteItem(itemId); }`, and the result is neither checked nor logged. importCategory.ts:100-105 logs a failed batch cleanup only. The orphan sweep (0002_functions.sql:169-173 `delete from public.items i where i.id in (select item_id from old_rows) and not exists (...)`) fires only on item_categories deletes, so an item that was never linked is never swept.
```

### ARCH-11

Low: **pg_temp.raises() treats any error as the expected refusal, so pgTAP negative authorization assertions can pass for the wrong reason**

- Category: test-design
- Location: `supabase/tests/database/_helpers.psql:56`, `supabase/tests/database/002_function_hardening_test.sql:116`, `TEST_STRATEGY.md:282`
- Confidence: high; reported by lens `data-design-docs`
- Verification: not agent-verified (low/info)

**Description.** None of the roughly 48 raises() uses pins a SQLSTATE or message. A refusal caused by an unrelated error (unique violation, CHECK, missing column, fixture drift) satisfies an authorization assertion. The e2e rls/ suite is the primary authorization check and pins codes, which is why this is low.

**Impact.** The 002 assertion is already vacuous. If a fixture edit makes an 'editor cannot issue a grant' insert collide with the (category_id, invited_email) unique key, the test keeps passing even if tg_category_shares_enforce's ownership check regressed.

**Recommendation.** Give raises() an expected-SQLSTATE parameter (`exception when others then return sqlstate = p_expected;`), or use throws_ok with codes as 070 does. Assert the trigger-call property as a role that holds EXECUTE.

Evidence:

```text
_helpers.psql:56-66 `create or replace function pg_temp.raises(p_sql text) ... execute p_sql; return false; exception when others then return true;`. 002_function_hardening_test.sql:115-119 `set local role anon; select ok( pg_temp.raises('select public.enforce_user_id()'), 'a trigger function cannot be invoked directly ...'`, but anon had EXECUTE on enforce_user_id revoked (0010_revoke_public_execute.sql:9, 0015_revoke_api_role_execute.sql:9), so a permission error satisfies it whether or not trigger functions can be called directly. Uses per file: 000:18, 002:2, 005:3, 010:4, 020:1, 025:7, 030:1, 055:3, 070:9. TEST_STRATEGY.md:282 "Assert on the **mechanism** ... Distinguish them, especially for `anon`".
```

### ARCH-12

Low: **The category-delete id listing pages with offsets but no ORDER BY**

- Category: sql-design
- Location: `web/src/app/data/categories.ts:74`, `web/src/app/data/categories.ts:114`, `web/src/app/lib/pages.ts:7`
- Confidence: medium; reported by lens `code-structure`
- Verification: not agent-verified (low/info)

**Description.** listItemIdsForCategory supplies the delete-category flow with the item ids whose photo paths must be captured before the cascade. Postgres guarantees no stable row order across offset pages without ORDER BY.

**Impact.** A category with more than 1000 entries is deleted while another device or an editor adds entries. A link row can be skipped between pages, and that entry's photos are not removed client-side before the cascade. They stay orphaned until the 48 h sweep. Duplicates are harmless (a Set).

**Recommendation.** Order by the existing index (`.order('created_at', {ascending:false}).order('item_id')`), or use keyset paging as exportItemPages does.

Evidence:

```text
categories.ts:74-79 `supabase.from('item_categories').select('item_id').eq('category_id', categoryId).range(from, to);` has no `.order()`. Neither does rawListItemIdsLinkedElsewhere (:114-119). readAllPages (pages.ts:7-24) walks pages of 1000 by offset. Compare images.ts:92-94, which pages with `.order('created_at').order('id').range(...)`, and the existing index 0005_indexes.sql:40-41 `(category_id, created_at desc, item_id)`. PostgreSQL 17 docs (https://www.postgresql.org/docs/17/queries-limit.html, quoted from the REL_17_STABLE source): "Using different LIMIT/OFFSET values to select different subsets of a query result will give inconsistent results unless you enforce a predictable result ordering with ORDER BY."
```

### ARCH-13

Low: **Switching category while the list is still loading shows a false 'Search failed' toast**

- Category: correctness
- Location: `web/src/app/components/ItemList/useItems.tsx:108`, `web/src/app/components/ItemList/useItems.tsx:71`, `web/src/app/lib/useRequestSequence.ts:8`, `web/src/app/page.tsx:100`
- Confidence: high; reported by lens `code-structure`
- Verification: not agent-verified (low/info)

**Description.** The sequence counter can't tell "unmounted" apart from "still current". usePhoton (identity check on abortRef) and usePlaces (a `cancelled` flag) solve the same problem correctly, each differently. This third hand-rolled variant is the buggy one.

**Impact.** On a slow connection, clicking another category tab before the current list loads shows "Search failed. Please try again." when nothing failed. Arrowing across N tabs in the roving tablist can post up to N-1 error toasts.

**Recommendation.** Call next() in the cleanup, or skip reporting when controller.signal.aborted. Add a test that resolves the aborted request after unmount. Consider one shared `useLatestRequest` for useItems, usePhoton and usePlaces.

Evidence:

```text
useItems.tsx:106-109 `useEffect(() => { void load(); return () => abortRef.current!.abort(); }, [load]);`, then :71-73 `if (!isCurrent(sequenceNumber)) return; if (error) { toast.reportError('load items', error, t('item_list.search_error'));`. useRequestSequence.ts:8-10 compares only against the last `next()`, and nothing calls next() on unmount. page.tsx:100 `key={selectedCategoryId}` remounts ItemList on every category change. postgrest-js 2.116.0 (web/node_modules/@supabase/postgrest-js/dist/index.cjs:418-449, installed source) catches an AbortError and resolves `{ success: false, error: { message: `${fetchError.name}: ${fetchError.message}`, ... hint: "Request was aborted (timeout or manual cancellation)" } }` instead of rejecting. The lens reproduced it with the real supabase-js chain: `TOASTS: ["Search failed. Please try again."]`.
```

### ARCH-14

Low: **Export is disabled for grantees for a technical reason that is false**

- Category: documentation-drift
- Location: `web/src/app/components/CategorySelect/TransferRows.tsx:77`, `web/src/app/components/CategorySelect/TransferRows.tsx:97`, `web/src/app/data/exportCategory.ts:243`, `web/src/app/components/CategorySelect/index.shared.test.tsx:78`, `web/e2e/signed-in/shared-with-me.spec.ts:86`
- Confidence: high; reported by lens `code-structure`
- Verification: not agent-verified (low/info)

**Description.** The UI gate, its unit test and its e2e test all rest on an implementation detail that doesn't exist (the lens traced it back to the first imported commit). Grantees can read the images rows and sign shared objects through RLS. Whether they should be allowed to export is a product decision nobody has written down.

**Impact.** A viewer or editor cannot export a collection shared with them, despite README's "Data can also be imported and exported, so it is never locked into the application". A maintainer who goes looking for the uid-prefix problem the comment names won't find it.

**Recommendation.** Decide explicitly. Either enable export for grantees (with an e2e journey), or record "owners only" as a product decision in design-decisions.md and fix the comment and both tests. Drop the vestigial getSession injection if it's no longer needed.

Evidence:

```text
TransferRows.tsx:77 `/** Disabled for a shared category: exportCategory() builds storage paths from the caller's uid, not the owner's. */` and :97 `disabled={isExporting || isShared}`. exportCategory builds no paths: it reads path_full from the images table (fetchPhotoPaths → listExportImagesForItems) and uses the session only as a guard, :243-244 `const { data: sessionData } = await getSession(); if (!sessionData.session?.user.id) throw new ExportError('No user session');`. The same false reason appears in index.shared.test.tsx:78 `// exportCategory() builds storage paths from the caller's uid, which is wrong for a grantee.` and shared-with-me.spec.ts:86 `// Both would be refused: the rename by RLS, the export by the prefix.`
```

### ARCH-15

Low: **Photon requests live in component hooks, not data/photon.ts, and the three hand-rolled retry loops have already diverged**

- Category: layering
- Location: `web/src/app/components/ItemForm/usePhoton.tsx:124`, `web/src/app/components/Map/usePlaces.tsx:168`, `web/src/app/components/Map/usePlaces.tsx:176`, `web/src/app/data/exportCategory.ts:107`, `web/src/app/data/photon.ts:32`, `web/src/app/data/importPhoto.ts:35`, `docs/reference/architecture.md:136`
- Confidence: high; reported by lens `code-structure`
- Verification: not agent-verified (low/info)

**Description.** This departs from CLAUDE.md's "fetch in src/app/data/" split (depcruise guards only supabase.ts, so no tool catches it), and the docs describe a Photon client that doesn't exist. Retry has reached its third copy, past the "extract on the third occurrence" threshold, and the copies already behave differently.

**Impact.** While Photon is unreachable, each unresolvable place holds a map worker for 3.5 s instead of 1.5 s, which roughly doubles how long the map's loading badge stays up for hand-typed places. In-flight geocodes outlive closing the map. Any change to the retry policy has to be made three times.

**Recommendation.** Move the Photon request into data/photon.ts (e.g. `searchPlaces(query, {limit, lang, signal})`) and use it from both hooks. Extract a `withRetry({attempts, baseMs, isRetryable, signal})` into lib/backoff.ts that doesn't sleep after the last attempt. Delete the duplicate isRetryableStatus.

Evidence:

```text
architecture.md:136 "`photon.ts` — the one Photon geocoding client both the form's autocomplete and the map use." data/photon.ts holds only URL building, parsing and isRetryableStatus. The fetches are in usePhoton.tsx:124 `const response = await fetch(url, { signal: controller.signal });` (no retry) and usePlaces.tsx:168 `const response = await fetch(url);` (3 attempts, not abortable). usePlaces.tsx:164-177 `for (const attempt of attempts(GEOCODE_ATTEMPTS)) { ... await delay(backoffDelayMs(RETRY_BASE_MS, attempt)); }` sleeps after the final attempt too. exportCategory.ts:107-109 `function isRetryableStatus(status: number): boolean { return status === 429 || status >= 500; }` duplicates photon.ts:32-34 verbatim. importPhoto.ts:35-41 is the third retry loop.
```

### ARCH-16

Low: **The PostgREST search-filter branch is dead in production, yet the docs present it as the live injection guard and a mutation target**

- Category: dead-code
- Location: `web/src/app/data/items.ts:71`, `web/src/app/data/items.ts:97`, `web/src/app/data/items.ts:185`, `web/src/app/data/itemSearch.ts:30`, `docs/explanation/design-decisions.md:100`
- Confidence: high; reported by lens `data-design-docs`
- Verification: not agent-verified (low/info)

**Description.** Search moved to the search_category_items RPC. The filter branches in rawListItems/rawCountItems and buildSearchFilter can't run, but unit tests calling the raw functions directly keep them at 100% coverage. That breaks CLAUDE.md's "no dead code" and spends mutation and property-testing effort on unreachable code.

**Impact.** Maintainers of search edit both the RPC and a dead PostgREST filter the docs call security-relevant. Meanwhile the real ILIKE path (likePattern escaping passed to the RPC) gets less scrutiny than the dead builder.

**Recommendation.** Drop the `search` parameter and filter branches from rawListItems and rawCountItems. Delete buildSearchFilter/searchFilterFor and their property test. Move the property test to likePatternFor's escaping. Update design-decisions.md:78 and 100-111.

Evidence:

```text
itemSearch.ts:30-39 `searchFilterFor` and `likePatternFor` share one gate, `search.length >= searchMinLength(search)`. items.ts:185-186 `const likePattern = likePatternFor(params.search); if (likePattern) { const { data, error } = await rawSearch({` returns early. Only otherwise does it call `rawList(params), rawCount(params)`, where items.ts:71-72 `const filter = searchFilterFor(search); if (filter) query = query.or(filter, { referencedTable: 'items' });` and :97 `const filter = searchFilterFor(search);` can therefore never be non-null. grep: searchFilterFor/buildSearchFilter have no production caller outside items.ts. design-decisions.md:100-103 presents `buildSearchFilter` as adversarial-input code with property tests, and :78 names 'the PostgREST filter builder' as a mutation target.
```

### ARCH-17

Low: **Code and docs disagree on the default-language fallback and on whether hand-typed places are pinned**

- Category: documentation-drift
- Location: `web/src/app/layout.tsx:46`, `web/src/app/i18n/I18nProvider.tsx:72`, `docs/reference/configuration.md:94`, `docs/how-to/user-guide.md:70`, `web/src/app/components/Map/usePlaces.tsx:200`
- Confidence: high; reported by lens `code-structure`
- Verification: not agent-verified (low/info)

**Description.** A code comment claims two language-detection paths match when they don't, and the user guide describes map behaviour the code doesn't have.

**Impact.** A visitor whose browser language is neither de nor en gets `<html lang="de">` before paint and English text from React until an effect corrects lang. Contributors believe German is the fallback. Users are told free-text places stay off the map, but the map pins them and writes the coordinates into the (possibly shared) entry.

**Recommendation.** Pick one fallback. If German, change detectLanguage and its test; otherwise change LANG_INIT_SCRIPT and the docs. Fix the user-guide Place row.

Evidence:

```text
layout.tsx:46 `// Same pre-paint trick for `<html lang>`, kept in lockstep with I18nProvider's initial-language logic.` and :47 `document.documentElement.lang=(l==='de'||l==='en')?l:'de'`. I18nProvider.tsx:70-72 `// ... falls through to the 'en' default. } return 'en';` (asserted by I18nProvider.render.test.tsx 'falls back to English'). CLAUDE.md "German is the default locale". configuration.md:94 "German (`de`, default)". user-guide.md:70 "Pick a suggestion if you want the item on the map; free text is kept but not pinned." But usePlaces.tsx geocodes unlocated places and writes coordinates back, :200 `void updateItemsPlace({ ids: ids.get(place)!, payload: { place_lat: entry.lat, place_lng: entry.lng } });`, as architecture.md:37 describes ("null for hand-typed places, which the map geocodes on demand").
```

### ARCH-18

Low: **The database doesn't cap a single tag at 100 characters, although textLimits.ts and two docs say it does**

- Category: documentation-drift
- Location: `supabase/migrations/0016_bound_row_volume.sql:109`, `web/src/app/lib/textLimits.ts:1`, `docs/reference/architecture.md:37`, `docs/explanation/design-decisions.md:37`, `supabase/tests/database/070_quotas_test.sql:192`
- Confidence: high; reported by lens `data-design-docs`
- Verification: not agent-verified (low/info)

**Description.** The only tag constraint is an aggregate one, so a single tag of up to 5,049 characters passes. The client's maxLength is the only 100-character limit, and the importer and direct API calls bypass it. Every other textLimits constant matches its CHECK exactly. The aggregate bound still limits row volume, so this is drift, not a volume risk.

**Impact.** A direct PostgREST insert or an imported manifest stores `tags = ['<5,000 characters>']`, and the database accepts it, while three places claim it would refuse anything over 100.

**Recommendation.** Either add a per-element check (an immutable `set search_path = ''` helper returning the max char_length over the array, `check (... <= 100) not valid`, plus a 101-character pgTAP case), or change the three claims to "at most 5,049 characters of tags in total".

Evidence:

```text
0016_bound_row_volume.sql:109-111 `-- 50 tags of up to 100 characters, space-joined in tags_text. add constraint items_tags_bounded check (cardinality(tags) <= 50 and char_length(tags_text) <= 5049) not valid;`. textLimits.ts:1 `// The ceilings 0016_bound_row_volume.sql enforces; the database is the check, these only stop typing past it.` architecture.md:37 "50 tags of up to 100 characters". design-decisions.md:37 "50 tags of up to 100 characters | `check` constraints (`0016`)". 070:192-195 tests only `array[repeat('a', 5050)]`.
```

### ARCH-19

Low: **Docs no longer match the migration chain and CI: which file holds current definitions, the re-share behaviour, CI path filters, secrets and test references**

- Category: documentation-drift
- Location: `docs/explanation/design-decisions.md:25`, `docs/reference/architecture.md:80`, `docs/reference/architecture.md:44`, `docs/reference/architecture.md:74`, `docs/explanation/design-decisions.md:130`, `docs/how-to/developer-guide.md:14`, `docs/reference/configuration.md:25`, `docs/how-to/load-testing.md:19`, `supabase/tests/database/070_quotas_test.sql:4`, `supabase/tests/database/002_function_hardening_test.sql:3`
- Confidence: high; reported by lens `data-design-docs`
- Verification: not agent-verified (low/info)

**Description.** Thirteen migrations landed after the latest squash, and seven of them rewrite baseline objects. The prose about where definitions live, and several CI and secret details, weren't updated. Every 00NN_ filename still resolves; the claims about which file holds the current definition are what's stale.

**Impact.** A contributor following design-decisions.md:25 reads 0002 and gets the pre-0018 bodies of search_category_items and list_category_places and the pre-0017 has_category_read_access. Copying one into a new `create or replace` silently reverts behaviour that 075 guards only at the plan level. A PR touching only supabase/config.toml or seed files skips e2e_local_stack, contrary to the guide. A fork misses CODECOV_TOKEN.

**Recommendation.** Replace "every function lives in 0002" with "0002 plus the later files in the architecture.md table; the latest `create or replace` wins", or perform the documented squash. Fix each listed sentence in one change, and decide whether the CI `sql` filter should widen to `supabase/**` or the guide should narrow.

Evidence:

```text
design-decisions.md:25 "Since the third squash every function lives in `0002_functions.sql`." Functions are created or replaced in 0009, 0011, 0016, 0017, 0018 and 0020 (grep for `create function|create or replace function`). architecture.md:80 "Functions in 0002_functions.sql, triggers in 0004_triggers.sql". architecture.md:44 "All policies are in 0006_policies.sql" (storage policies are in 0007/0012/0017). architecture.md:74 "re-sharing is a no-op", yet shares.ts:34-43 inserts and the unique constraint `category_shares_category_email_unique` (0003:58) refuses it. design-decisions.md:130 "The query text is unchanged" (0018 adds a CASE and id tiebreaks). developer-guide.md:14-16 "`e2e_local_stack` and `opengrep` unless `web/**` or `supabase/**` changed", but ci.yml:52-57 filters only `supabase/migrations/**`, `supabase/tests/database/**`, `supabase/splinter.sh`, `.sqlfluff`. configuration.md omits CODECOV_TOKEN (ci.yml:124). load-testing.md:19 names "the `has_category_read_access()` path" (reads use granted_category_ids() since 0017). 070_quotas_test.sql:4 cites `web/e2e/signed-in/rls.spec.ts`, which doesn't exist (the file is rls/quotas.spec.ts).
```

### ARCH-20

Low: **Dead code is kept alive only by tests: modal open/close props, ZipWriter.size, the always-zero skippedItemCount and HeaderProps.className**

- Category: dead-code
- Location: `web/src/app/components/CenteredModal/index.tsx:28`, `web/src/app/components/CenteredModal/Dialog.tsx:42`, `web/src/app/components/CenteredModal/Backdrop.tsx:13`, `web/src/app/data/zip.ts:305`, `web/src/app/data/exportCategory.ts:38`, `web/src/app/components/CategorySelect/useExportCategory.tsx:70`, `web/src/app/components/Header/types.ts:6`
- Confidence: high; reported by lens `code-structure`
- Verification: not agent-verified (low/info)

**Description.** CLAUDE.md rules out dead code. Knip can't see unused props or object members, and the 100% per-file coverage floor then forces tests that pin unreachable behaviour.

**Impact.** Maintenance cost only. The modal's fade transition never runs because the dialog mounts already open, and each item has tests that assert nothing a user can reach.

**Recommendation.** Drop the `open` prop from Dialog and Backdrop, the unused CenteredModal options, ZipWriter.size, skippedItemCount with its branch and i18n key, and HeaderProps.className, together with the tests that exist only to cover them.

Evidence:

```text
CenteredModal/index.tsx:28 `if (typeof document === 'undefined' || !open) return null;`, so Dialog.tsx:42 and Backdrop.tsx:13 `open ? 'opacity-100' : 'pointer-events-none opacity-0'` never see open=false in production (only Dialog.test.tsx and Backdrop.test.tsx do). `closeOnBackdrop = true, closeOnEsc = true` (index.tsx:18-19) are never set by any caller. zip.ts:305 `size: () => offset,` has no production caller. exportCategory.ts:38-39 `/** Always 0: the batched `images` query has no per-item listing failure to count. */ skippedItemCount: number;` and :333 `skippedItemCount: 0` still drive useExportCategory.tsx:70 `if (result.skippedItemCount > 0) {` and the export_listing_partial key in both dictionaries. HeaderProps.className (Header/types.ts:6) is unused.
```

### ARCH-21

Info: **"One collection per entry" is enforced by a statement-level count trigger on an M:N table, not declaratively**

- Category: schema-design
- Location: `supabase/migrations/0020_one_collection_per_entry.sql:8`, `supabase/migrations/0003_tables.sql:34`, `web/src/app/data/categories.ts:122`, `docs/reference/architecture.md:38`
- Confidence: high; reported by lens `data-design-docs`
- Verification: not agent-verified (low/info)

**Description.** Keeping legacy multi-linked rows is a documented, reasoned choice, and it is what blocks a unique index. As a result, the invariant is a per-transaction snapshot count reported with the quota SQLSTATE, and the client still pays for M:N code. Two concurrent statements linking the same item to different categories can both commit, but only the item's owner can link it, and no UI path re-links an existing item. So there is no concrete harm today, only a cleanup opportunity.

**Impact.** No user-facing defect. An owner's concurrent direct-API links could leave an item in two collections, harming only their own data. The linked-elsewhere scan runs on every category delete.

**Recommendation.** Once production holds no multi-linked rows (check with a query run by the maintainer), replace the trigger with `create unique index ... on item_categories (item_id)` and retire the M:N-only client code.

Evidence:

```text
0020_one_collection_per_entry.sql:15-25 `where ( select count(*) from public.item_categories ic where ic.item_id = linked.item_id ) > 1 ) then raise exception 'an entry belongs to one collection' using errcode = 'PT507';`. architecture.md:38 "Rows filed twice before `0020` are left as they are". categories.ts:122-142 listItemIdsLinkedElsewhere still computes multi-category orphans on every category delete.
```

### ARCH-22

Info: **The squash procedure requires hand-run SQL on the hosted project without saying it is maintainer-only**

- Category: doc-contradiction
- Location: `docs/how-to/developer-guide.md:392`, `CLAUDE.md:78`
- Confidence: high; reported by lens `data-design-docs`
- Verification: not agent-verified (low/info)

**Description.** The step is legitimate for a human maintainer, but the guide doesn't mark it as such. With 0008-0020 now rewriting much of the baseline, a squash is a likely next request, and an assistant following the guide will hit a hard rule halfway through.

**Impact.** A half-done squash: files rewritten and PR ready, but history rows not deleted, so the next `migrate` job fails on remote versions missing locally.

**Recommendation.** Mark the step as human-only in developer-guide.md (an assistant must stop and hand it over), or move it into a guarded workflow_dispatch step.

Evidence:

```text
developer-guide.md:391-397 "Then, in the hosted project's SQL editor and right before merging, delete the rows of the files that no longer exist so `db push` stops looking for them: `delete from supabase_migrations.schema_migrations where version > '0007';`". CLAUDE.md:78 "Never `supabase db push` or run SQL against the hosted project; CI's `migrate` job does that on merge."
```

### ARCH-23

Info: **Dependency watch: browser-image-compression has had no release since 2023, and dev tooling pulls in deprecated transitive packages**

- Category: dependencies
- Location: `web/package.json:28`, `web/package.json:40`
- Confidence: medium; reported by lens `code-structure`
- Verification: not agent-verified (low/info)

**Description.** Every production dependency earns its place. browser-image-compression runs on every upload and import but hasn't had a release in about 3.5 years. The deprecated packages are dev-only.

**Impact.** No defect today. If the library breaks with a future browser or bundler change, uploads lose compression, and a CSP-dependent worker path is involved (layout.tsx:61).

**Recommendation.** Track it. If it needs replacing, `createImageBitmap` plus OffscreenCanvas `convertToBlob({type:'image/webp'})` would remove the dependency.

Evidence:

```text
`npm view browser-image-compression time.modified version` → `2023-03-06T13:46:33.379Z`, `2.0.2`. `npm ls inflight` → `@lhci/cli@0.15.1 > chrome-launcher@0.13.4 > rimraf@3.0.2 > glob@7.2.3 > inflight@1.0.6`, which accounts for the `npm warn deprecated` lines in facts/npm-ci.log. npm-outdated.log shows only patch or minor runtime updates. The pending majors (Stryker 10, Vitest 5, TypeScript 7) are dev-only.
```

## Strengths

- Supabase access is confined as documented: grep shows only data/, login/, useSession.ts, useSignOut.ts, SupabaseWarmup.tsx and supabase.ts import the client. The fetch/transform/render split holds everywhere, even though the tooling that enforces it has holes (ARCH-07).
- Data functions take their I/O as injectable defaults (listItems' rawList/rawCount/rawSearch, exportCategory, importCategory, readAllPages, runPool), so tests need no module mocks. The items `.select()` string and its type come from one list (items.ts ITEM_FIELD_KEYS).
- All static gates are green in the facts logs: build, tsc, ESLint (type-aware, sonarjs, jsx-a11y strict) at --max-warnings 0, prettier, depcruise, knip, and 100% statement/branch/function/line coverage. Every source file is under 350 lines and every test file under 600. No `any` appears in non-test source.
- Paging is careful where it matters: readAllChunks fails the whole read rather than returning partial data, export uses keyset paging (exportItemPages.ts), and category delete aborts on any incomplete 'linked elsewhere' answer.
- Security-sensitive invariants are declarative where it counts: images_path_full_matches_item and images_path_thumb_matches_item use `is not distinct from`, so an unparsable path fails closed. Storage has no UPDATE policy, and editor-share-photographs.spec.ts asserts that from both sides.
- Quota and orphan triggers are statement-level with transition tables (set-based), late constraints are `not valid` with the reason documented, and migrations since 0011 set lock_timeout/statement_timeout under Squawk.
- 002_function_hardening_test derives the SECURITY DEFINER and search_path checks from pg_catalog, so every newly added function is covered automatically.
- The archive format carries an explicit format tag and integer version, and the importer rejects unknown versions instead of guessing.
- i18n parity is enforced by a test that scans every t()/tCount() call site against both dictionaries, and there are no placeholder mismatches across 174 keys. No doc claims sharing is read-only.
- Leaflet popups are built with textContent, never HTML parsing (Map/popup.ts), and undo windows share one mechanism (toast onExpire) across entry, photo, category and share deletes.
- Every 00NN_ migration filename referenced in docs, SQL, workflows and code still resolves. The coverage and mutation thresholds in configuration.md match vitest.config.mts and stryker.config.mjs exactly.

## Coverage and gaps

No build, unit, e2e, mutation, pgTAP, Splinter, Lighthouse or load runs were made; the gates come from the facts logs. The lenses did run small scratch tests under the scratchpad: the useItems unmount toast, the useItemImages failed refresh, a depcruise/ESLint probe on a copy of src/, and a Node probe of readZipEntries on a deflated archive. Every RLS and Storage conclusion (ARCH-02, ARCH-03) comes from reading the policy and trigger text plus the existing specs. No one executed an owner signing an editor-uploaded photo, or a revoked editor deleting one. The egress proxy blocked supabase.com and postgresql.org. The createSignedUrls permission requirement was confirmed from the installed storage-js 2.116.0 JSDoc, which mirrors the Supabase reference page; PostgREST abort behaviour from the installed postgrest-js source; the Postgres LIMIT/ORDER BY quote from the REL_17_STABLE doc source. Not verified: how Storage reports a refused path inside a createSignedUrls batch (skip vs. whole-batch error), which decides whether an owner's export skips or fails on editor photos. Also not checked: whether production holds multi-linked item_categories rows or over-length grandfathered rows (no hosted access, by rule), and how often import photo reordering happens in practice (timing-dependent). Only excerpts of most pgTAP files (000–075) and most unit tests were read. The generated database.types.ts, globals.css and Icon SVG path data were skipped. SQL migrations were reviewed for data design, not for a full RLS audit, which belongs to the security reviewer. Product intent on grantee export (ARCH-14) and on the language fallback (ARCH-17) needs a maintainer decision.

- `code-structure`: 149 files read, 12 raw findings. Not checked: Not run: build, unit, e2e, mutation, Lighthouse or load tests (the facts logs cover the gates). Scratch vitest runs (useItems unmount toast, useItemImages failed refresh), a depcruise/ESLint probe on a scratch copy of src/, and a Node probe of readZipEntries on a deflated archive were all done under the scratchpad (agents/arch); nothing in the repo was modified. External docs: postgresql.org and postgrest.org are blocked by the egress proxy. The Postgres LIMIT/ORDER BY quote comes from the REL_17_STABLE doc source on raw.githubusercontent.com. PostgREST abort behaviour was taken from the installed postgrest-js 2.116.0 source, not its docs. React/Next docs were not consulted because no finding depends on framework semantics beyond what the scratch tests exercised. Not reviewed: database.types.ts (generated), globals.css, Icon SVG path data, SQL migrations beyond the cascade and orphan-trigger lines (RLS and migration safety belong to other reviewers), and most test files (read only where they revealed design friction). GitHub API is blocked for the browser-image-compression maintenance check; that relies on npm view and the GitHub web page. Not verified: how Supabase Storage remove() reports objects that RLS denies; no finding depends on it. The product intent on grantee export (finding 5) and on the German vs English fallback (finding 11) needs a maintainer decision.
- `data-design-docs`: 72 files read, 14 raw findings. Not checked: External official documentation was unreachable. The egress proxy blocked supabase.com, postgresql.org and pkware.cachefly.net. I therefore could not confirm the following against current docs: (a) Supabase Storage createSignedUrls' batch behaviour for a path the caller may not read (skip versus whole-batch error), which is why finding 1 leaves that export outcome unverified; (b) hosted Supabase default-privilege entries (a 0015-related claim was not reported for that reason); (c) ZIP header offsets, which I verified instead against the repo's own writer and the installed yauzl reader. I did not run pgTAP, Splinter, e2e or unit tests, so every RLS and storage conclusion comes from reading the policy text plus the existing specs and tests; in particular, I did not execute an owner trying to sign an editor-uploaded photo. I read supabase/tests/database/\*.sql other than _helpers.psql only in excerpts, and did not read 000, 001, 005, 010, 020, 025, 030, 040, 050, 060, 065 and 075 in full. I did not measure how often the photo reordering on import happens; it depends on timing. I did not query whether production holds multi-linked item_categories rows or over-length grandfathered rows (no hosted access by rule).

## Dropped during consolidation

- Import rollback deletes the category row without first deleting uploaded photos (data-design-docs, separate finding): Same root cause as the code-structure delete-order finding. Merged into ARCH-01, keeping the cancellation-test evidence and the 10,000-per-run sweeper cap.
- Archive import checks too little (data-design-docs) / Import reads and parses the archive twice (code-structure): Same root cause, reported by both lenses. Merged into ARCH-06.
- Dependency-cruiser rule exempts every top-level src/app file (data-design-docs) / depcruise and ESLint rules have two holes (code-structure): Same root cause. Merged into ARCH-07, and architecture.md:138 (page.tsx listed as a Supabase importer) was moved there from both docs-drift findings so it is reported once.
- Export-then-import loses entry dates (sub-claim of the import-order finding): Downgraded to a side note in ARCH-05. importTimestamps is a documented, deliberate design (importFormat.ts:42), and no screen shows items.created_at (grep finds no created_at use in any .tsx). Only the export CSV/JSON reflect it, so the harm is minimal. The photo-order part is kept.
- Failed category load is silent (sub-claim of the load-failure finding): Corrected, not kept as stated. useCategories.tsx:62 does show toast.error(t('category_select.load_error')), and useShares also toasts. ARCH-04 keeps the misleading empty or first-run state under the toast, and the image path, which really is silent.
- One-collection-per-entry trigger race, reported as low: Downgraded to info (ARCH-21). The design is documented (architecture.md:38, 0020 header), the race needs concurrent direct-API calls by the item's owner, no UI path re-links an existing item, and the only possible harm is to the caller's own data.

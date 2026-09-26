# Design decisions

Why things are the way they are, where reading the code once would not tell you. For _what_ exists, see the [Architecture reference](../reference/architecture.md).

## Why authorization lives entirely in Postgres RLS

The app is a static export: there is no server runtime, so there is nowhere to put server-side authorization even if we wanted it. Row Level Security is the _only_ place access is enforced, which means the client can be fully trusted with the anon key — it has no more access than the policies grant, whatever the frontend does. A bug in a component can make the UI behave wrong; it cannot leak another user's data.

The consequence for contributors: a client-side check ("only show the delete button if…") is UX, not authorization. The policy is the check, and every new query needs one.

## Why sharing has no public link

Issue #483 asked for sharing a category, a single entry, or a filtered list, with other users or by public link. What shipped is whole-category sharing with named accounts, and the cut was deliberate.

A public link means an anonymous reader. Every predicate here resolves an actual `auth.uid()` or an actual JWT email, both empty for `anon`. Authorizing a link would mean either the first policy that grants `anon` anything, keyed on an unguessable token, or the first server-side code this app has ever had. Either is a materially larger attack surface than extending an owner-only predicate to a second known identity, on a project whose history already includes several RLS-correctness bugs (#292, #387, #335, #290, #386). A link also has no real revocation: once seen or forwarded it cannot be taken back, whereas deleting a `category_shares` row ends a specific person's access immediately.

The `editor` role (#562) widened the grant without touching that argument: sharing is no longer read-only, but it is still _identified_. If public links are ever wanted, they are a separate, explicitly higher-risk piece of work.

## Why the hosted Auth settings are pinned

Sharing authorizes on an address: `caller_email()` reads the access token's `email` claim, and a grant has no accept step, so whoever first holds a session carrying the invited address holds the grant. Whether that address was proven is decided by the hosted Auth configuration, not by anything in the repository, and a few dashboard toggles turn it into an invite takeover (#745). In GoTrue's source:

- **Anonymous sign-ins with Confirm email off.** An anonymous session calls `updateUser({ email })` with the invitee's address and is confirmed on the spot (`user.IsAnonymous && config.Mailer.Autoconfirm`), with `is_anonymous` cleared and `email_confirmed_at` set. #634 ran it end to end against the local stack, reading and writing a collection at `editor`.
- **The email provider with Confirm email off.** Sign up as the invitee, with any password.
- **An unverified provider email.** An OAuth sign-in is confirmed when the provider says the email is verified _or_ Confirm email is off; with **Allow unverified email sign-ins** on it gets a session either way.
- **Anything else that mints an email claim** this app never reviewed: another provider, SAML, a custom OAuth provider, a third-party auth issuer, a custom access token hook.

No SQL check can tell such a caller apart. The access token has no `email_verified` claim (only GoTrue's OIDC ID token does), `user_metadata.email_verified` is whatever the user writes with `updateUser({ data })`, and the anonymous path sets the same `auth.users` columns a real sign-up does. Requiring an OAuth `amr` would hold in production, but every local and CI identity signs in with a password.

So the settings are the control, and they are versioned: [`supabase/hosted-auth.json`](../../supabase/hosted-auth.json) holds the expected values ([Configuration](../reference/configuration.md#hosted-auth-settings)), and `hosted-auth-check.yml` compares the live config with it every hour and fails on drift. A check, not an enforcer: it cannot stop the toggle, only shorten the window, and it reads with the Management token rather than writing through it. The local stack deliberately differs, with anonymous sign-ins for demo mode and the email provider without confirmations for test accounts, so the takeover still reproduces there.

## Why the origin is a trust boundary

A browser isolates by origin, not by path. As a project site the app lives at `/CollectionBuddy/` on the org's Pages origin (`nobuddyorg.github.io`, or the org site's custom domain, which GitHub gives every project site of the account), and so does every other Pages site of the org: the root site, the other project sites, any repository added later. Their scripts run as the app's origin (#750):

- **The session.** supabase-js keeps the access and refresh tokens in `localStorage['sb-<ref>-auth-token']`, which any script on the origin reads. To RLS the holder _is_ the victim: every collection of theirs, and every one shared with them at `editor`, to read, change and delete until the refresh token is revoked. No policy can tell the difference.
- **The service worker.** A worker may claim any scope under its script's directory, so a `/sw.js` at the origin root can register for `/CollectionBuddy/` and replace the app's worker, then answer every later visit with HTML of its own. The app cannot re-register its way out: the page that would do it is the one the impostor serves.
- **Everything else per origin.** `script-src 'self'` admits every sibling's scripts; Cache Storage (which is why the worker deletes only `collectionbuddy-*` caches), the geolocation grant, and the other `localStorage` keys, including the geocode cache the map trusts, are shared too.

So each sibling repository's XSS surface, dependency tree and contributors sit inside the app's session boundary, and a supply-chain compromise of any of them reaches every collector who opens that site in the same browser.

**The fix is an origin of its own**: a custom domain on this repository, a subdomain such as `collectionbuddy.nobuddy.org`. A path on the org's own domain is the same shared origin again. The code is ready for it: the deploy takes the site URL from the Pages settings and bakes its path, empty on a custom domain, into the export, and `site.webmanifest` names its URLs relative to itself. The move is DNS, Pages and Supabase settings only the owner can change, plus revoking the sessions left behind on the old origin ([runbook](../how-to/developer-guide.md#move-to-a-custom-domain)). A subdomain is still the same _site_ as the org's apex, which matters only to cookies, and the app sets none. A host that sends response headers would add a header CSP with `frame-ancestors`, a larger move this does not need.

**Until then**, every org Pages repository and its supply chain is inside the session boundary: keep those sites free of third-party scripts and unreviewed dependencies, grant write access to them only to people trusted with every collector's data, and never serve a `sw.js` from the org root.

Not done: moving the session to `sessionStorage`. Any script on the origin in the same tab still reads it, so it closes only the sibling-page-in-another-tab path, does nothing about the worker, and would sign the user out of every new tab and every launch of the installed app.

## Why deletes wait out an undo window, and ending a grant does not

Deleting an entry, a photo or a collection hides it at once and sends the delete only when the toast's six-second undo window closes, on its own or through the close button; Undo puts it back because nothing was sent. Each toast settles once, whichever comes first of Undo, Close, its timer and `commitPending()`, and settling clears its timer, so an undone delete is never sent and a committed one never twice. Until then the delete exists only in the open tab, so `ToastProvider` guards it: `beforeunload` asks before a reload, close or navigation would drop it, and sign-out runs every pending delete through `commitPending()` before `signOut()`, since afterwards it would go out as `anon` and be refused. A tab closed anyway, or a mobile browser that skips `beforeunload`, drops the delete unsent: the item is still there next time, nothing is half-deleted.

A grant cannot wait like that. A deferred revoke is access that continues after the owner was told it had ended, so revoking and leaving send the `category_shares` delete at once, and the row leaves the list only when the delete has succeeded (#737). The owner's Undo inserts the same grant again, email, role and expiry, as a new row; one already expired cannot be re-inserted (`expires_at` must be after `created_at`) and says so. Leaving has no Undo, because only the owner may insert a grant.

## Why an editor's filed entries follow the grant

An entry an editor files into someone else's category stays the editor's row: `user_id` is the editor, which keeps it on the editor's quota and outside the owner's read predicate. Every write policy used to carry an owner branch that ignored grants, so revoking or demoting the editor only stopped new filings. The ex-editor kept editing, re-photographing and deleting what it had filed, inside a collection the owner goes on sharing with others (#739). Since `0021`, each of those writes needs `has_item_write_access()`: write access to every category the entry is in. Ownership alone still covers an entry in no category (one being created) and entries in the editor's own categories.

Withdrawing is refused too: deleting or unlinking the entry, removing its photographs. An ex-editor allowed to delete but not edit could still remove a photograph's bytes and upload new ones at the path its `images` row names, and ending a grant ends access to the category, not part of it. It is a predicate, not a trigger that unlinks anything, so nothing is destroyed on revocation and the owner's Undo restores the writes with the grant. The cost: the entries stay on the editor's quota and invisible to the owner, whose remedies are deleting the category or granting `editor` again so the editor can remove them. Showing the owner entries filed by others would reopen the read asymmetry ([Architecture](../reference/architecture.md#row-level-security)) and is not done here.

## Why a photograph an editor adds to your entry is yours

An editor's upload lands under the editor's own uid prefix, the only path an insert policy admits, while `tg_images_enforce()` files the `images` row under the entry's owner. Until `0023` the bytes followed the prefix and the record followed the entry. The owner listed the row and paid its quota, yet no read policy matched her (the shared ones exclude ownership), so she could neither sign the photograph nor, since Storage deletes only what it can read, delete it; her client dropped the plate and her export left it out. After a revocation the ex-editor, who could no longer see the entry, still passed the own-prefix policies: it could delete the bytes, and fill a path it had recorded before uploading (#741).

The owner now reads the objects her own `images` rows name, on their own entry, and nothing else under another prefix: that shows her the bytes of rows she already reads, and an object someone left under her entry without a record stays unreadable to her. Filed entries are unaffected, since their rows are the editor's ([above](#why-an-editors-filed-entries-follow-the-grant)). The own-prefix upload and delete need an entry the caller sees and may write, a positive check. The `0021` form refused only entries the caller could see, and an ex-editor sees none of the owner's. The quota stays with the owner, on whose entry the photograph is.

Two costs, accepted. An uploader can no longer delete its own object once the entry is gone or was never there; the daily sweep removes those after 48 h. And an ex-editor still reads the bytes it uploaded itself: refusing that, while keeping its own orphans readable, means telling an entry hidden from the caller from no entry at all, which only a `SECURITY DEFINER` lookup callable by every signed-in user can do. It would hide bytes the editor already holds.

## Why the migrations were squashed

Three times: on 2026-08-06 sixteen migrations became a seven-file baseline; in #580 those seven plus the seven that had accumulated since were folded back into `0001`–`0007`; on 2026-09-22 the eight that had followed (`0008`–`0015`, three of them security fixes to `0007`) were folded in again, so each file once more holds one concern. A third of the original statements existed only to undo an earlier file — a table created and dropped, full-text-search columns added and removed, a trigger written three times. Reading them told you the history but not the schema.

Every squash was verified rather than asserted: the local stack was reset from the new files, both databases introspected down to column defaults, constraint expressions, index definitions, function bodies, trigger timing, policy predicates and grants, and diffed. The only differences were local-stack platform defaults no migration sets. Doing it again: [Developer guide](../how-to/developer-guide.md#squashing-migrations-again).

Since the third squash every function lives in `0002_functions.sql`. The `language sql` ones that read tables are created with `check_function_bodies` off, as `pg_dump` restores them, because Postgres would otherwise parse their bodies before `0003_tables.sql` exists; the pgTAP suite calls every one of them, so a broken body still fails CI.

## Why migrations only roll forward

Production records every migration it applied, and `supabase db push` refuses to run while that record names a file the checkout lacks. Reverting a PR that added a migration therefore does not undo it: it deletes the file, every later deploy stops at `migrate`, and the bundle that needed reverting stays live (#752). Undoing a migration takes a new one that compensates, which applies like any other and leaves the history as production has it. Editing an applied file changes nothing in production and makes every fresh database differ from it, so it is refused as well; the exceptions are a squash and a file production never applied, and the commit says so. The check runs in CI, not as a commit hook, because only the PR's base shows what is already history.

The same order sets the compatibility rule. `migrate` runs before the bundle that needs it is built, because PostgREST rejects a request naming a column that does not exist yet; so the previous bundle meets the new schema, briefly during every deploy and for as long as a tab opened before it stays open. A migration that expands keeps it working. One that drops, renames or tightens breaks it, so that step waits for a later PR. Reverting only app code then always lands on a schema the older code can use. No job runs the previous bundle against the new schema: it would need a second build and the previous commit's signed-in suite on the same stack, for a rule review can hold.

## Why quotas are counted in the database

Any signed-in collector could otherwise create rows and upload 5 MiB objects without end, and on a free-tier project that is the likeliest way to take the app down (#637). There is no server to rate-limit at, so the ceilings live in the database:

| Ceiling | Enforced by |
| --- | --- |
| 256 MiB of photographs per owner, thumbnails included | `tg_images_quota()` (`0009`, lowered from 1 GiB of full sizes by `0025`) |
| 768 MiB in the photograph bucket, whoever stored it | `tg_images_quota()` (`0025`) |
| Backstops at upload: 832 MiB in the bucket, 320 MiB under one uploader's prefix | `photo_upload_has_room()` in the `upload own objects` policy (`0025`) |
| 50,000 entries per owner | `tg_items_quota()` (`0009`) |
| 1,000 categories per owner | `tg_categories_quota()` (`0016`) |
| 1,000 shares per owner, across all their categories | `tg_category_shares_quota()` (`0016`) |
| One category per entry | `tg_item_categories_quota()` (`0016`, lowered from 10 by `0020`) |
| Text: category name 200, title 300, description 10,000, place 500, invited email 320 characters; 50 tags of up to 100 characters | `check` constraints (`0016`) |

A photograph added by an editor lands on the owner's row, so it counts against the owner's quota; it is a photograph of her entry, which she reads and deletes like her own ([above](#why-a-photograph-an-editor-adds-to-your-entry-is-yours)). The link ceiling is per entry rather than per owner because the entry ceiling already bounds the entries; together they bound the links. The UI files an entry in one category, so no message covers the link ceiling; the form's `maxLength`s mirror the text ceilings, so typing stops before the database would refuse. The text checks are `not valid`: every write since `0016` is checked, but a row already past a limit was left in place rather than failing the unattended deploy, and editing such a row fails until the long field is shortened. Once production holds no row past a limit, a later migration can `validate constraint` each one.

The byte ceilings are sized to the plan, not to a collector. The project is on Supabase's Free plan, whose 1 GB of Storage is for the whole project, and any Google account can sign in. Until `0025` one owner could hold 1 GiB of full sizes, with the thumbnails and up to 48 h of orphans uncounted on top, so a single collector could take the project over its quota while staying within their own, and every collector's writes would fail at once (#753). A quarter of that is an owner's share now, and the bucket as a whole stops at 768 MiB. Moving to a paid plan is a new migration raising the numbers ([Configuration](../reference/configuration.md#photograph-storage-ceilings)).

The byte count cannot trust the client, which sends `size_bytes` itself. `tg_images_size_from_storage()` replaces it, and fills `thumb_size_bytes`, with the sizes Storage recorded for the objects, which Storage writes before the upload request returns. A path with nothing stored counts the bucket's 5 MiB cap, so under-reporting a size buys nothing. Nothing may be stored at a path a row names afterwards, not even once its object is removed, so no path is filled with other bytes after its size was sampled. The counts are statement-level, so a batch insert is checked once per owner. A refusal carries SQLSTATE `PT507`, which PostgREST turns into HTTP 507; the bucket's refusal adds the detail `project`, and the app shows a message naming the limit, or saying the app's storage is full, rather than a generic failure.

The bucket's own ceiling counts what Storage bills: every object, recorded or not. Rows alone cannot bound that, because an upload that never gets a row costs the same bytes until the daily sweep removes it after 48 h, and Storage completes an upload that passed its policy check even if a row named the path meanwhile. So the upload policy has two backstops of its own, 64 MiB above the row's ceilings so a collector meets the row's message first: the bucket, and the uploader's own prefix, which bounds one account's orphans. `storage.objects` takes no index or trigger from this project (DDL there is refused), so `photo_upload_has_room()` scans the bucket's rows on every upload, and the photograph trigger once per insert: about 12 ms for 30,000 objects on the local stack. It is `SECURITY DEFINER` because an uploader may not read the rest of the bucket, and it answers only yes or no. An upload the backstop refuses shows the generic upload failure: Storage reports every refusing policy the same way. What remains unbounded is the handful of uploads in flight at one moment, each at most 5 MiB.

## Why images are deleted client-side before the database row

Only the Storage API can delete file bytes; SQL reaches the `storage.objects` metadata row and nothing more. So the client removes the objects _first_, then deletes the row — a collection, an entry, a single photograph, or a failed import's half-built collection. Reversing the order orphans the files with no way to find them again. One function, `removeObjectsThenRows()` in `data/imageRemoval.ts`, holds the order for all four paths, so none can drift from it on its own (#740).

The single-photograph delete used to go row first, to reuse the paths the delete returned; a failed Storage call then left both files with no row to name them, and the quota freed while the bytes stayed. The cost of the right order is the opposite half-failure: objects gone, row delete refused, and the photograph comes back as a broken image. That one is visible and recoverable: the row still names its paths, removing a missing object succeeds, and deleting it again finishes the job. Undo is unaffected either way, because nothing reaches Storage or the database before the undo window closes ([above](#why-deletes-wait-out-an-undo-window-and-ending-a-grant-does-not)).

A failed or cancelled import removes every path it attempted, not only those that reported success, since a request that timed out may still have stored its object. The photo pool lets in-flight uploads settle before it rethrows, so nothing lands after the removal. If Storage refuses, the half-built collection stays, for the user to delete like any other, rather than dropping `images` rows whose bytes would stay in the bucket outside every quota.

A `cleanup_item_images()` trigger used to back this up. It was removed because Supabase's `prevent-direct-deletes` migration guards `storage.objects` with a `BEFORE DELETE ... FOR EACH STATEMENT` trigger that raises `42501` for any session outside the Storage API — statement-level, so it fires even when the delete matches nothing, which is the normal case once the client has already removed the objects. Every item deletion failed. There is no SQL-side backstop available; [`cleanup-orphaned-photos.yml`](../../.github/workflows/cleanup-orphaned-photos.yml) sweeps unreferenced objects daily through the Storage API instead, past a 48 h grace period so nothing still uploading is mistaken for orphaned. It refuses to delete when more objects are orphaned than max(50, 5 % of the bucket) unless run by hand with an override: a bug, a bad migration or a restore that removes `images` rows in bulk looks exactly like mass orphaning, and the sweep would make that loss permanent.

The client deletes whatever paths a row names, with the deleting user's token, so a row may only name paths under its own entry: `images_path_full_matches_item`, and since `0019` `images_path_thumb_matches_item`. Before `0019` an editor could file a record whose thumbnail named the owner's photograph in a collection the editor was never granted, and the owner's own delete of that entry removed it.

## Why a storage object's path can never change

No update policy exists on `storage.objects` ([`0007_storage.sql`](../../supabase/migrations/0007_storage.sql)), and the grant `postgres` makes there omits `UPDATE`. Storage's own bootstrap grant still carries it and is re-applied on every start, so the missing policy is the control, not the privilege. `move()`, `copy()`-to-self and `upsert` are refused for owner and grantee alike. It took a working exploit to find out why this matters.

The owner-only storage policies key on path segment 1, the uploader's uid. The shared policies cannot — a grantee's uid appears nowhere in `<uid>/<itemId>/<file>` — so they key on segment 2 and join through `item_categories`. The old `"update shared objects"` policy tested segment 2 in both `USING` and `WITH CHECK`, and `UPDATE` is the one verb where those halves describe different rows: an update that rewrote **segment 1** passed both. An editor could move the owner's photo into their own uid prefix. Three controls then failed to reach it — revoking the share (the object now matched the attacker's own-prefix policy), the owner's read (segment 1 was no longer hers, and `has_category_read_access()` excludes ownership), and the sweep (it keyed on segment 2, which the move left intact). The photo was gone, permanently, to an account whose access had been revoked.

Pinning segment 1 would have closed the hole and left a strict subset of `"update own objects"` — a capability nothing uses. `data/images.ts` only ever calls `upload` (never with `upsert`), `remove` and `createSignedUrls`, so dropping the verb costs nothing. `e2e/signed-in/rls/editor-share-photographs.spec.ts` asserts it from both sides.

## Why Safari uploads JPEG instead of WebP

WebKit's canvas has no WebP encoder: `toBlob`, `toDataURL` and `OffscreenCanvas.convertToBlob` answer an `image/webp` request with PNG, silently (MDN browser-compat-data, `type_parameter_webp`: Safari `false`, iOS mirrors it). `browser-image-compression` passes that PNG through, so Safari and every iOS browser stored roughly 10x the bytes under a `.webp` name, and every viewer downloaded them.

`lib/imageCompression.ts` now encodes a 1x1 canvas as WebP once per session and asks for JPEG at the same quality when the answer is anything else; JPEG is about 1.3x WebP's bytes, not 12x. The path is named after the type the encoder actually returned (`data/photoType.ts`), so a name never lies about its bytes. The bucket already accepted all three types, and no policy, trigger, constraint or the orphan sweep reads the extension, so no migration was needed. Objects uploaded before the fix keep their PNG bytes under a `.webp` name. CI has no WebKit project; `e2e/signed-in/photos.spec.ts` emulates WebKit's canvas in Chromium instead, and `web/load/proofs/browser/safari-webp.js` proves the same with k6.

## Why the orphan-cleanup trigger is statement-level

`delete_item_if_orphan()` removes an item once it belongs to zero categories. The first version ran `FOR EACH ROW`, one `EXISTS` probe per deleted `item_categories` row — deleting a 500-item category meant ~500 sequential lookups. It now runs `FOR EACH STATEMENT` with a transition table, one set-based `DELETE ... WHERE id IN (...) AND NOT EXISTS (...)`. Same logic, one query instead of N.

## Why production is backed up by a workflow

The project runs on Supabase's Free plan, which keeps no database backup, and no plan's backup contains Storage objects. Production is migrated unattended on every merge that passes CI and swept daily by an irreversible `service_role` delete, so one bad migration or sweep regression would be permanent. Moving to Pro would buy daily database backups and still leave the photographs uncovered, so `backup.yml` does both halves on the Free plan (#736).

- **Encrypted on the runner, to a public key.** The repository is public and so are its Actions artifacts. age needs only the recipient in GitHub; the identity that decrypts stays off it, so a leaked backup key or bucket exposes ciphertext.
- **An S3-compatible bucket, not a service integration.** Any provider works through the AWS CLI already on the runner; the owner picks it by setting three variables.
- **Photographs are copied once.** An object's path never changes ([above](#why-a-storage-objects-path-can-never-change)), so a name already mirrored holds the same bytes and a daily run downloads only what is new, which keeps Free-plan egress small. A removed object moves to a dated prefix the bucket's lifecycle rule expires, rather than being kept forever or deleted at once: long enough to outlive the sweep's 48 h grace, not longer than a restore needs.
- **The listing and the key come from the Management API**, as in the sweep: no second long-lived Storage credential.
- **Storage's tables are not in the dump.** A new project gets the bucket from `0007` and each object's row from its re-upload; restoring either from the dump would collide with both, and `postgres` may not write Storage's other tables at all (found rehearsing the restore).
- **The pre-migration dump runs only when something is pending.** A deploy without migrations never depends on the backup bucket; one with migrations stops rather than migrate without a copy.

## Why the Management API tokens are scoped per job

The sweep and the backup fetch the secret key per run so it is never stored, but the token they fetched it with was a classic one: every permission on every organization and project on the owner's account, including revealing every key, running any SQL and deleting projects, and it reached every deploy and an hourly job (#748). Now each job holds a token scoped to this project and to the endpoints it calls ([Configuration](../reference/configuration.md#management-api-tokens)).

- **`migrate` needs none.** It already holds the database URL; `supabase db query` sends the `NOTIFY` over it, and PostgREST receives it when that statement commits.
- **Database: Read, not Read-write.** Read-write runs any SQL as `postgres`, so a leaked token could plant a function, trigger or role that outlives every key rotation. The read-only endpoint runs as `supabase_read_only_user`; granting it `orphan_sweep_plan()` in `0024` adds nothing that role could not select itself.
- **Two tokens, not one per workflow.** The hourly Auth check needs only Auth Config: Read, so it no longer carries a token that reveals keys. The sweep and the backup need the same three permissions; splitting them would narrow nothing and double the rotation.
- **What remains.** The secret key that token reveals still reads and deletes every collector's data; that is the price of not storing it, and the 90-day expiry bounds how long an unnoticed leak stays useful.

## Why the deploy waits for CI on `main`

CI and the deploy used to start side by side on every push, so production was migrated and published minutes before `main`'s CI finished, and a PR merged while behind `main` shipped a tree no CI run had passed (#735). `pages-deploy.yml` now starts from `workflow_run` when CI succeeds on a push to `main`, and deploys that commit, not whatever `main` holds by then.

- **Only the tip.** CI runs finish out of order and can be re-run; deploying every green commit would let an older one publish over a newer bundle, and `db push` refuses a tree missing migrations production already has. A superseded run queues in a group of its own, so it cannot displace the tip's queued deploy.
- **Queued, not cancelled.** Cancelling a run in progress could stop `migrate` between two migrations; a newer deploy waits instead.
- **`workflow_run` is safe here** because it only acts on `push` events of this repository: `branches: [main]` alone also matches a fork's pull request from a branch named `main`, whose code must never reach the production secrets.

## Why Dependabot auto-merges only dev-only lockfile changes

`auto-merge.yml` merges a Dependabot patch bump without review, so whatever it merges must never reach the shipped bundle. `package.json`'s `devDependencies` used to stand for that, and did not: the deploy build ran every install script and loaded Tailwind's CSS pipeline and TypeScript from `devDependencies`, so a malicious patch of either could have written into `web/out` (#746). The property now holds by construction:

- **Everything `next build` runs is in `dependencies`**: `tailwindcss`, `@tailwindcss/postcss` and `typescript` moved there, so npm's lockfile no longer marks them, or what they pull in, `dev: true`. Measured, not assumed: tracing every file `next build` opens (`strace -f -e trace=openat`) finds no `dev: true` package file besides type declarations and `package.json`. A package the build loads (a PostCSS plugin, a Next plugin, a loader) goes in `dependencies` too; re-run that trace when adding one.
- **`setup-web` installs with `--ignore-scripts`**, in CI and in the deploy build alike, so no package's lifecycle script can rewrite `node_modules` before the build. None of the installed packages needs one: on Linux only `unrs-resolver` declares one, a fallback for a missing prebuilt binary (`fsevents`' is macOS-only).
- **The gate reads the lockfile, not the manifest.** A dev bump can also move a transitive package the build shares, such as `postcss` or `magic-string`, so `auto-merge.yml` merges only when every entry the PR adds or changes in `package-lock.json` is `dev: true`; anything else, `devOptional` included, waits for a human.

The seven-day cooldown and the required checks still apply on top; neither would catch a patch that only injects code into the bundle.

## Why search uses trigram ILIKE instead of full-text search

Early migrations added `tsvector` columns and GIN indexes. They were dropped because search is a substring match (`ILIKE '%query%'`) across title, description, place and tags, and full-text search was never used — extra storage and write cost for a feature that was not there. `pg_trgm` GIN indexes on each searched column are what `ILIKE '%…%'` needs to avoid a sequential scan.

On their own those indexes only work under `BYPASSRLS`. `texticlike` is not leakproof, and Postgres refuses to evaluate a non-leakproof qual before a relation's RLS qual, so for `authenticated` the planner never chooses them: a rare-term search over a 100,000-item category measured 415.8 ms as a sequential scan, and `enable_seqscan = off` did not change the plan (#621). The catalogue's search therefore goes through `search_category_items()`, a `SECURITY DEFINER` function that re-implements the read-access check itself and queries with RLS bypassed — 24.3 ms on the same term. The map's `list_category_places()` stays `SECURITY INVOKER` and still cannot use them.

The planner picks between three paths per call (0018 plans each call with its real arguments): the trigram indexes for a term rare across the whole table, the category's own links for a small collection, or a sequential scan of `items` when the term is common across everyone. Postgres costs an `ILIKE` evaluation far below what it takes, so that last path wins until `items` is several times larger than the collection searched. The `population` load test measured it at 33,600 entries over 28 collectors: 8.7 ms by sequential scan against 3.6 ms from the collection's links. That grows with every user's entries, not just the searcher's, and stays in the tens of milliseconds at this app's scale. Forcing the collection-first path would give up the trigram path, which answers a rare term in a 40,000-entry collection in 1.5 ms instead of about 200, so the choice stays with the planner.

The 3-character minimum before a search fires is not about the index: a one- or two-character query matches nearly every row, so firing one per keystroke would cost a full scan for no narrowing. The debounce does the same job for typing speed.

## Why mutation testing is scoped to a list of files

Line coverage answers "did this run," not "would a real bug here have been caught." For presentational components and hooks that mostly orchestrate Supabase calls, the gap barely matters. It matters a lot for pure functions doing string and boundary construction — the PostgREST filter builder, pagination windows, ZIP date packing, CSV formula-injection guards, retry/backoff arithmetic — where a test can execute every line and assert nothing. The list is [`web/mutation-targets.mjs`](../../web/mutation-targets.mjs), shared with `vitest.config.mts`'s per-file coverage floors so the two cannot drift; each entry's own comment says what it guards.

Mutating the whole `src/app` tree would mean JSX and Tailwind class strings too: thousands of near-equivalent mutants, a multi-minute run, and a score that means nothing. A scoped run finishes in seconds and produces a number worth acting on, which is why CI runs it on every PR rather than only on `main` — learning after the merge that a test asserts nothing is learning it too late.

### Incremental on pull requests, full on `main`

Stryker's incremental mode (#714) reuses a mutant's previous result when neither the mutated code nor the tests that covered it changed, diffing both against `web/reports/stryker-incremental.json`. What it cannot see is everything else: a module a target imports without being on the list itself (`supabase.ts`, `data/auth.ts`, the i18n, toast and confirm providers), a test helper, a dependency bump. So CI keys the cached file on `package-lock.json` and the Stryker and Vitest config, and a change there starts from nothing; and `main` runs with `--force`, rerunning every mutant, so the dashboard score is always a full run and `main`'s file is the one every PR restores. A PR that only changes a non-target module a target depends on can pass on a reused result. `main`'s run is where that surfaces, and `npm run test:mutation -- --force` reproduces it locally.

### No suppressions

There is no `Stryker disable` or `/* v8 ignore */` in `src/`. There used to be — around the Supabase query builders, the whole of `useExportCategory`, and a handful of lines carrying mutants nobody could kill. What they hid is now tested: a PostgREST builder composes its request eagerly and only sends it when awaited, so `items.test.ts` reads back the table, filter, method, headers and body each call produced, without a server; the one real call per module (`getSession`, `compressThumb`) has a small test that mocks the module underneath and drives the default. Three suppressed lines turned out to guard code that did not need to exist — a guard for a value the callee accepted anyway, an option that spelled out the library's default, a wrapper every caller unwrapped — which is the ending [TEST_STRATEGY.md](../../TEST_STRATEGY.md) §11 calls the one that pays for the exercise.

### What still survives, and why no test can kill it

React compares a dependency array against the **previous render's** array element by element. Stryker's `ArrayDeclaration` mutator rewrites `[]` as `["Stryker was here"]` in _every_ render, so `prevDeps` and `nextDeps` are the same constant and nothing fires. No input distinguishes the two: every empty dependency list is an equivalent mutant by construction.

Where the memoization those lists guard was not load-bearing, it is gone — callbacks handed straight to elements nothing memoizes earned nothing from `useCallback`. What remains is where identity really is a contract: a mount-only `useEffect`, or a callback another hook lists in its own dependencies. Those survive, deliberately unsuppressed, so the report keeps showing them.

The other class is the **timeout**, which Stryker counts as a kill. Most were avoidable and the fixes were worth having: counters replaced by iteration over the thing being counted (`chunk()`, `attempts()`, the pool's shared iterator); page fakes backed by a finite table so a walk that asks for one page too many gets nothing instead of spinning; and `timeoutMS` raised to 20 s, since with the 5 s default a mutant covered by a few hundred tests was reported as a timeout after failing seven of them honestly. Three remain, each a mutant whose only effect is non-termination: two in `excludePendingDeletes`, whose job is returning the same reference when nothing changed (break that and the effect reading it re-renders for ever — the bug the line prevents), and `readAllPages`' one unbounded walk, which cannot know how many pages it needs.

## Why four functions have property tests

`buildSearchFilter`, `csvCell`, `dosDateTime` and `clampPage`/`pageRange` take
input that is adversarial or unbounded (any search term, any user text, any
date, any page and total), and each has a property that is easy to state: the
filter is always exactly four quoted conditions that match the term literally;
a CSV cell always parses back to the text, apostrophe-guarded exactly when it
would start a formula; a DOS timestamp always decodes to a valid date and
clamps rather than wraps; a page range always holds an entry when there is
one. The generic playbook adopts property testing only after a near-miss;
these were adopted at the maintainer's request (#616) without one. They run
seeded and deterministic, with one dependency (`fast-check`), beside the
example tests, in about two seconds. Everything else keeps example tests
alone: small, enumerable inputs gain nothing from generated ones.

## Why component tests run in jsdom, and two things that bite

Pure-logic tests could not have caught the hydration mismatch fixed in `008d33b`, so components and hooks are rendering-tested with Testing Library (`web/vitest.setup.ts`). Two things to know when adding more:

- **`window.localStorage` is undefined in jsdom without a patch.** Node 22 ships a global `localStorage`, and Vitest's jsdom environment skips overriding any key already on the Node global. `vitest.setup.ts` patches `globalThis`; anything touching `localStorage`/`sessionStorage` relies on it.
- **Testing Library's auto-cleanup does not fire** because `test.globals` is off. `vitest.setup.ts` calls `afterEach(cleanup)` explicitly; without it, DOM from one test leaks into the next as flaky "found multiple elements" failures.

## Why SQL linting runs `core` minus nine rules, and never autofixes

[`.sqlfluff`](../../.sqlfluff) uses the `core` bundle and excludes nine rules, for one reason: a migration is applied history and a pgTAP suite is reviewed SQL, so a finding that only reformats one is churn on security-critical files, not a caught defect. `aliasing.table` and five `layout.*` rules would rewrite every file; `references.special_chars` objects to the quoted policy names, and renaming a policy is DDL against the authorization boundary; `references.keywords` objects to the documented `category_shares.role` column; `references.consistent` would qualify every column reference across applied migrations. What is left — `ambiguous.*`, most of `structure.*`, `capitalisation.*` pinned to `lower` — was clean when adopted and still earns its place on new SQL. Only `sqlfluff-lint` runs as a hook, never `sqlfluff-fix`.

## Why read policies take the caller's grants as one set

A grantee's read used to call `has_category_read_access(category_id)` on every row, and twice per entry, since the `items` policy reads `item_categories` under that table's own policy. The function pins `search_path`, and PostgreSQL never inlines a function with a `SET` clause, so each row paid a full call and an index probe into `category_shares`. The k6 `shared-viewer` run measured it: 300 shared entries browsed slower than the owner's 10,000, and at the `peak` profile p95 passed 9 s with 3.6% of requests failing. `0017` has every read policy ask `category_id = any(array(select granted_category_ids()))` instead: an initPlan, evaluated once per statement and only when the owner branch has not already decided, which inside the `EXISTS` becomes part of one primary-key probe. `granted_category_ids()` is plpgsql so its query is planned once per connection, and `has_category_read_access()` is defined on the same set, so what a grant is (email, expiry) is written once. Ownership stays outside the set for the same reason it stays outside the read predicate. `075_query_plans_test.sql` fails if a read plan calls `has_category_read_access()` again.

## Why the map and search RPCs are plpgsql

Postgres 17 plans a SQL function's body without its argument values, so `category_id = cat_id` was costed on an average category. In the load test's `peak` run a 1,000-entry shared category was read by scanning all 26,000 links, 10,936 times. `0018` makes both RPCs plpgsql with `plan_cache_mode = force_custom_plan`: each call is planned with the category it names, as the SQL functions were already re-planned on every call, so planning costs nothing extra. The query text is unchanged, and `075_query_plans_test.sql` plans that same text with literal arguments, which is now also what runs.

## Why the service worker fetches pages network-first

GitHub Pages sends no cache headers the app controls, so the worker (#333) makes the content-hashed `_next/static/**` files cache-first. It used to serve the HTML stale-while-revalidate too, and every deploy replaces the whole Pages site, so the first visit after a deploy ran the previous build's HTML and runtime. Its lazy chunks (the entry form, the map, the image compressor) were cached only if that user had opened them before; otherwise they 404'd, and with no error boundary Next's English "This page couldn't load" replaced the app until a reload (#742). Every merge deploys, so this could happen to every user once per deploy.

- **Network-first for pages.** The HTML now always matches the chunks the server has. It costs one round trip per navigation, the same as having no worker, while the hashed assets that dominate the bytes stay cache-first. The cache is used only when the network fails, which keeps the app opening offline.
- **One reload for a missing chunk.** A tab left open across a deploy still runs the old build. `error.tsx` reloads once on a `ChunkLoadError` and refuses a second reload within 30 s, so a chunk that stays missing shows a reload button rather than a loop. A failed `import('browser-image-compression')` during an upload is not a render error: it stays a toast, because the same compressor runs inside a collection import, which a reload would abort.
- **One cache per build.** The cache name was fixed and `sw.js` never changed between deploys, so no new worker ever activated and old builds' assets stayed forever. The registration URL now names the build, so each deploy installs a worker with its own cache and deletes the previous ones. Pruning old builds' chunks is safe only because pages are network-first; the one-reload recovery covers a tab that outlives it. The prefix filter matters because every project page of an account shares one Pages origin, and with it Cache Storage ([why the origin matters](#why-the-origin-is-a-trust-boundary)).

`web/load/proofs/browser/sw-deploy.sh` proves the deploy scenario with two real builds swapped mid-run.

## Why load testing is manual and local by default

Collections are personal-scale, one owner each, with no throughput SLA, and a load number measured against a Free-tier project or a CI runner measures the hosting tier (TEST_STRATEGY.md §12). So the k6 scripts (#662) are a measurement a person asks for, never a gate. The default target is a Supabase stack started inside the workflow run, because there is no staging and the only other backend is production, shared with real collectors. The hosted target exists behind two switches and currently cannot sign in ([Load testing](../how-to/load-testing.md#the-hosted-target-and-why-not)).

What would regress under load is gated deterministically instead: `075_query_plans_test.sql` (#704) asserts that each index-backed query can reach its index and, at a realistic row count, picks it. A plan assertion costs milliseconds and fails the PR that broke it; a load test would only show a slower number later.

## npm audit: what's overridden and what's accepted risk

`web/package.json`'s `overrides` pin transitive dependencies that `npm audit` flagged and that have a same-major patched version:

- `qs` → `6.16.0`, via `typed-rest-client` and `@lhci/cli`'s `express` (GHSA-q8mj-m7cp-5q26, GHSA-x5fp-wj9c-mxmx). Dev-only.
- `@babel/core` → `7.29.7` (GHSA-4x5r-pxfx-6jf8). Stryker's toolchain, never shipped.
- `minimatch` → `10.2.6`, which brings a patched `brace-expansion`. Three `minimatch` majors used to be installed across `eslint`, `typescript-eslint` and Stryker, two with vulnerable `brace-expansion` ranges. Overriding `brace-expansion` directly broke `npm audit`'s own advisory correlation into a bogus 20-vulnerability cascade; overriding `minimatch` sidesteps that and dedupes the install.
- `sharp` → `0.35.4` (GHSA-rgj7-g3m4-5g8c), in range of `next`'s own `optionalDependencies`. It was accepted risk while the only fix was a 7-major `next` downgrade; a same-range patch shipped later. Check for that before assuming a downgrade is the only option.
- `eslint` → `$eslint` (the direct ESLint 10) under `eslint-plugin-import`, `eslint-plugin-react`, `eslint-plugin-react-hooks` and `eslint-plugin-jsx-a11y` (#722). The installed releases declare peer ranges that stop at ESLint 9, and `eslint-config-next` pulls in the first three. Without the override, every `npm ci` prints `ERESOLVE overriding peer dependency`. The accepted risk: a rule that silently stops reporting under ESLint 10 would look like a clean lint run. Revisit when a plugin widens its `eslint` peer range, and drop that entry. `eslint-plugin-react-hooks` already has: `7.1.1`, inside `eslint-config-next`'s range, supports ESLint 10, but its `set-state-in-effect` rule reports three existing hooks (`usePhoton`, `useItems`, `I18nProvider`), so moving to it is its own change.
- No `typescript-eslint` entry. It once repeated the direct dependency's literal range, which npm refuses as soon as Dependabot bumps the direct one (#721). `eslint-config-next`'s range dedupes to the one copy without it.
- `tmp` → `0.2.7` and `uuid` → `^14.0.2`, from `@lhci/cli` (#651). Both dev-only, reached only by `lhci open`, which this project never runs; the calls each package makes stayed source-compatible, checked against the installed packages.

Accepted risk: `extract-zip` (GHSA-jmr9-qjv8-65gv, GHSA-7pqw-9j4j-h8q3), unresolved upstream, four levels under `@lhci/cli`. Only `@puppeteer/browsers`' Chrome-download path calls it, and this project's Lighthouse config points at the runner's or Playwright's existing Chrome, so that path never executes. Revisit if `@lhci/cli` moves past `lighthouse@13.3.0` / `puppeteer-core@24.43.1`.

**Do not run `npm audit fix` here**, not even without `--force`: it reshuffled unrelated transitive versions and made the audit output worse. A from-scratch `rm -rf node_modules package-lock.json && npm install` re-resolves the whole tree against current advisories and was observed to produce a worse baseline than the committed lockfile. Add a targeted `overrides` entry and run `npm install`.

# k6 proofs for the performance issues

Each script turns one issue's claim into a k6 threshold:

- **Red** (k6 exit 99): the defect is present.
- **Green** (exit 0): the issue's suggested fix works.

**The rule: run the proof while working on its issue.** Run it once before the fix (red) and once after (green), and put both reports (`load-results/proof-*.md`) in the PR. Copy `load-results/` aside between the two runs; `run-all.sh` clears it.

These scripts belong at `web/load/proofs/`. Each shared helper lands with the first proof that uses it, so `knip` never sees an unused export. They build on the harness in `web/load/lib/`: its request helpers, its target guard (local stack unless told otherwise) and its summary conventions.

**Status:** reviewed statically in three rounds (lint, import and fixture checks, plus an adversarial review against the app, the migrations, Storage and the k6 v2.3.0 source), with every confirmed defect fixed. **They have never been run**, so the first run on each issue may need small fixes.

## Mirrors that follow the fix

Some proofs replay the client's own request sequence, the way `lib/api.js` mirrors `data/*.ts`. When the fix changes that sequence, update the mirror in the same PR, or the proof keeps measuring the old code.

| Proof                            | Mirrors                                                                                         | What to update with the fix                                                                |
| -------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `deep-offset.js` (#758)          | `lib/api.js` `listPage` → `data/itemPage.ts`                                                    | How a page is read                                                                         |
| `short-search.js` (#779)         | `SEARCH_MIN_LENGTH_NON_ASCII` → `data/itemSearch.ts`                                            | The floor, if the fix raises it                                                            |
| `map-places-cap.js` (#756)       | `CLIENT_PAGE_SIZE` → `data/items.ts` `PLACE_PAGE_SIZE`                                          | The page size, if the client's changes                                                     |
| `sign-many.js` (#757)            | `useItemImages.tsx` / `imageEntries.ts` refresh                                                 | Batching of the refresh                                                                    |
| `quota-refused-import.js` (#765) | `importPhoto.ts` retry loop                                                                     | Stop after a quota refusal; 4xx is permanent                                               |
| `round-trips.js` (#780)          | `exportCategory.ts`, `images.ts`, `categories.ts`/`useCategories.tsx` delete reads, search path | Embedded export read; one keyset-paged images read for delete; search returning image rows |
| `gate-blind-spots.js` (#781)     | `lib/flows.js` `browse`                                                                         | Name the new requests `catalogue last page` and `sign urls`                                |

The browser proofs drive the real app, so they need no mirror.

## Run

```bash
supabase start && supabase db reset          # repo root, before each full run
cd web && load/proofs/run-all.sh             # HTTP proofs only
# or everything in one pass: start the demo build, wait for its "serving http://localhost:4173/CollectionBuddy/" line, then
load/proofs/browser/serve-demo.sh &
BROWSER=1 load/proofs/run-all.sh             # sw-deploy builds its own pair on :4174
```

`run-all.sh` runs #779 and its control first, on the freshly reset stack, then the rest. A proof whose script is not in the tree yet is listed as skipped. It sorts each run into one of four groups:

- **Red:** exit 99 and a conclusive report.
- **Green:** exit 0.
- **Recorded:** the #779 control and `png-vs-webp.js`. They carry no verdict and only have to finish cleanly.
- **Broken:** any other exit, or a report marked **INCONCLUSIVE**. That means no iteration reached its verdict, an iteration stopped early, a guard (checks, request failures, a precondition counter) failed, or a verdict metric has no sample. Empty metrics pass their thresholds, so these runs are never counted as green.

To run one proof: `mkdir -p load-results && k6 run load/proofs/<name>.js` (browser proofs: `load/proofs/browser/<name>.js`, with `serve-demo.sh` running). Set `LOAD_SUPABASE_URL`, `LOAD_SUPABASE_ANON_KEY`, `LOAD_TARGET=local-stack` and `LOAD_PROFILE=normal` as `run-all.sh` does. #755 and #742 run only through `browser/import-memory.sh` and `browser/sw-deploy.sh`.

The browser proofs launch Chromium through k6: point `K6_BROWSER_EXECUTABLE_PATH` at a Chromium binary when k6 finds none, and add `K6_BROWSER_ARGS=no-sandbox` when running as root (a container).

Knobs:

- **Seed sizes:** `PROOF_ENTRIES` (default 40,000, under the 50,000-entry quota), `PROOF_OTHER_ENTRIES`, `PROOF_PLACES`, `PROOF_PAGES`, `PROOF_PHOTOS`, `PROOF_FITTING`, `PROOF_ARCHIVE_MB` (default 100, also the most: the seeded photos and their imported copies share one owner's 256 MiB).
- **Sampling and format:** `PROOF_SAMPLES`, `PROOF_SAFARI_FORMAT`.
- **App URL:** `PROOF_APP_URL`.
- **Replay a pre-fix client:** `PROOF_CLIENT_PAGE_SIZE=0` reads the map unranged, as before #756.
- **Separate report for a second run:** `PROOF_VARIANT` (for example a control run).

A failed setup is cleaned up. A setup killed by its 5-minute timeout can leave rows behind, so run `supabase db reset` before the #779 control run.

## What each proof shows

| Issue                      | Script                                                         | Red today means                                                                                                                                                                                                                                                                                  |
| -------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| #758 deep offset           | `deep-offset.js`                                               | Last page p95 ≥ 150 ms, the gate's own browse budget. The last page also costs ≥ 3× "page the ids, then embed 9".                                                                                                                                                                                |
| #779 no-trigram search     | `short-search.js` (+ control run with `PROOF_OTHER_ENTRIES=0`) | `'Öl'` costs ≥ 3× `'Öllampe'`, although both find the same 60 entries. The control shows that other collectors' rows are the cause. The probe waits 2 minutes so autovacuum has analyzed the fresh rows, because the defect is a planner choice.                                                 |
| #756 map `max_rows`        | `map-places-cap.js`                                            | Fewer than 1,500 of 1,500 places reach the map.                                                                                                                                                                                                                                                  |
| #757 re-sign > 1,000 paths | `sign-many.js`                                                 | After 28 pages × 9 entries × 2 photos, the single refresh call is refused, because Storage caps `paths` at 1,000. Photos are left unsigned.                                                                                                                                                      |
| #765 uploads after quota   | `quota-refused-import.js`                                      | Bytes are still uploaded, and objects orphaned, after the first quota refusal (orphans counted from Storage's own listing). A 409 or 413 is retried.                                                                                                                                             |
| #780 round trips           | `round-trips.js`                                               | PERF-14: the export metadata phase sends more requests than the embedded read needs (521 vs 121 at 40,000 entries), and category delete's reads send ~841 against a budget of 446 (measured read-only; nothing is deleted). PERF-13: a search page needs 3 sequential steps to reach its photos. |
| #781 blind gate            | `gate-blind-spots.js`                                          | The stock `browse` flow sends no last-page and no sign request. The deep and photo scenarios' p95 rows are the evidence.                                                                                                                                                                         |
| #738 Safari PNG            | `browser/safari-webp.js`                                       | With Safari's canvas emulated in Chromium, the app stores PNG objects. `png-vs-webp.js` only records the cost and has no verdict.                                                                                                                                                                |
| #771 worker CSP            | `browser/worker-csp.js`                                        | Compression workers report failure (2 today: full size and thumbnail).                                                                                                                                                                                                                           |
| #778 Photon                | `browser/photon-geocoding.js`                                  | About 2 s pass between the last failed attempt and the end of loading. In-flight requests complete after the map closes. More than 3 requests start per second after the first burst. A viewer's map sends write-backs.                                                                          |
| #782 frontend loading      | `browser/frontend-loading.js`                                  | Export, import or ZIP modules are in the first-paint scripts. Opening the map fetches chunks the hover did not warm. Plates on a phone at DPR 1 load full-size images.                                                                                                                           |
| #755 import memory         | `browser/import-memory.sh`                                     | Renderer RSS grows by ≥ 1.5× the archive during import. `performance.memory` misses ArrayBuffers, so RSS is sampled from outside.                                                                                                                                                                |
| #742 stale service worker  | `browser/sw-deploy.sh`                                         | After a real deploy (build A swapped for build B mid-run), New entry does not open on the first visit, even allowing one recovery reload.                                                                                                                                                        |

Not provable with k6, and each issue says so:

- **#757:** the stale single `lastSignedAt` stamp is client state.
- **#780 (PERF-15):** the retry and jitter policy is client logic; unit-test it.
- **#781:** the Lighthouse half.

## Fixtures

`fixtures/source/` holds three photos from scikit-image's sample data:

- `astronaut.png` (NASA, public domain).
- `coffee.png` and `chelsea.png` (CC0).

They and everything generated from them are git-ignored. Fetch and generate them once, from `web/`:

```bash
pip download scikit-image --no-deps --only-binary=:all: -d /tmp/sk
unzip -j /tmp/sk/*.whl skimage/data/astronaut.png skimage/data/coffee.png skimage/data/chelsea.png -d load/proofs/fixtures/source
node load/proofs/fixtures/generate.mjs node_modules/sharp
```

All three are 300–600 px, so the "1000 px full size" is the source resolution.

`fixtures/generate.mjs` re-encodes them with the repo's own `sharp`, as the upload path does: full size first, then the thumbnail from that output. Each comes out as WebP q80, PNG with adaptive filtering, and JPEG q80. The script also writes:

- `camera-12mp.jpeg`: an upscale, kept for its pixel count.
- `archive-photo.jpeg`: ~1 MB of noise at 1024×768.

Pass a directory of your own photos of 1000 px or more to get realistic full-size bytes.

Measured with sharp (not k6): PNG is **11.9–13.8×** the bytes of WebP q80 for these photos, and JPEG q80 is 1.24–1.43×.

# Load testing

[k6](https://grafana.com/docs/k6/latest/) scripts that drive the app's real
requests (PostgREST, the two read RPCs, Storage) at a Supabase project. They
are a **measurement, never a gate**: nothing runs them on a push or a pull
request, and no merge waits on their thresholds. Why:
[Design decisions](../explanation/design-decisions.md#why-load-testing-is-manual-and-local-by-default).

## What the scripts do

The scripts live in [`web/load/`](../../web/load), one file per journey, and
spell out as HTTP the same requests `web/src/app/data/*.ts` sends through
supabase-js. Change one, change the other.

| Script | Scenarios | Normal load | Exercises |
| --- | --- | --- | --- |
| `smoke.js` | every journey below | 1 VU, 1 iteration each, whatever the profile | That the scripts and the target work, before a heavier run |
| `catalogue.js` | `browse`, `search` | 10 + 5 VUs | The owner paging the catalogue (list, exact count, map) and searching it through `search_category_items` |
| `shared-viewer.js` | `shared_browse`, `shared_search` | 10 + 5 VUs | A second identity reading a category it holds a `viewer` grant on: the `has_category_read_access()` path (#619) |
| `write.js` | `write` | 5 VUs | Creating an entry, filing it, uploading a photograph and its thumbnail, writing its `images` row |
| `population.js` | `own_browse`, `own_search`, `lent_browse`, `write` | 10 + 5 + 5 + 3 VUs | Many collectors at once, each VU one of them: tables and trigram indexes shared by everyone, a grant per collector, quota triggers per owner. Searches are mostly another collector's word, common across the table and absent from the searcher's own collection |

### Profiles

A profile (`web/load/lib/profile.js`) scales every ramped scenario's virtual
users and sets the seed size, so a heavier run needs no new script:

| Profile | Virtual users | Shape | Seed: searched + shared entries | `population`: collectors × entries |
| --- | --- | --- | --- | --- |
| `normal` (default) | ×1: 15 on `catalogue` | 30 s ramp, 2 min hold, 15 s down | 10,000 + 300 | 50 × 200 |
| `peak` | ×5: 75 on `catalogue` | 1 min ramp, 5 min hold, 30 s down | 25,000 + 1,000 | 100 × 250 |
| `stress` | steps to ×20: 300 on `catalogue` | a quarter, half, then all of it for 2 min each, held 2 min more, 1 min down | 40,000 + 2,000 | 200 × 200 |

`stress` is meant to cross the thresholds: the question it answers is where
latency bends and errors start, which the HTML report's charts show step by
step. Seeds stop at 42,000 because one owner may hold 50,000 entries
(`0009_user_quotas.sql`); to grow past that, add owners, not rows. When the
app's real traffic changes shape, change a profile here rather than adding a
script.

### Seed and teardown

Every script shares one `setup()` (`web/load/lib/seed.js`):

1. Signs up three fresh users with email and a random password: an owner, a
   viewer, and a writer.
2. As the owner, through RLS like any client: the profile's entries in one
   category (the one searched) and a smaller category shared with the viewer
   at `viewer`. Rows go in batches of 10,000, each **one request, so one
   `INSERT`**. Below a few thousand rows every plan is a sequential scan and
   the numbers say nothing about production shape.
3. As the writer, one empty category that `write` files its new entries into,
   so a `stress` run's writes never meet the owner's quota.

Nine seeded entries in ten carry their place's coordinates, as picking a
suggestion stores them, so the map returns the shape real collections get.

`population.js` has its own `setup()` (`web/load/lib/population.js`): the
profile's number of collectors, each with a collection titled with one word
of their own and a fifth as many entries lent, at `viewer`, to the next
collector in a ring: the same totals as the other seeds, spread over many
people. Sign-up is the only way in without `service_role`, so
`supabase/config.toml` raises the local stack's sign-up limit from 30 to 500
per 5 minutes; production never reads that file.

`teardown()` deletes each account's photographs from Storage **before** any
row (CLAUDE.md), then its entries and categories. The users stay in the
stack's `auth.users`; on the ephemeral CI stack that is moot, and locally
`supabase db reset` clears them.

## Run locally

Install [k6](https://grafana.com/docs/k6/latest/set-up/install-k6/) (CI pins
2.3.0), then from the repository root:

```bash
supabase start
cd web
npm run load -- smoke          # then: catalogue, shared-viewer, write, population
npm run load -- catalogue --profile peak
```

`scripts/load-test.mjs` reads the URL and anon key from `supabase status`,
the same way `npm run e2e:local` does, and runs
`k6 run --out web-dashboard load/<flow>.js`. Results land in
`web/load-results/`:

| File | What |
| --- | --- |
| `<flow>.md` | The table below, also printed to stdout |
| `<flow>.json` | k6's full end-of-test summary object |
| `<flow>.html` | k6's self-contained HTML report: request rate, latency percentiles, VUs and errors as charts over time. Skipped, with a warning, for a run under three 10 s periods, so never for `smoke` |
| `<flow>.db.md` | What Postgres did during the run: see [the Postgres side](#the-postgres-side). Also printed to stdout. Local stack only |

It also sets `K6_NO_USAGE_REPORT`, so k6 does not phone home, and disables the
live dashboard's port, so k6 exits when the run does.

A bare `k6 run` refuses to start without the variables the wrapper sets, and
refuses a `local-stack` target whose URL is not `127.0.0.1` or `localhost`.

## Run in GitHub Actions

**Actions → Load test (k6) → Run workflow**
([`k6-load-test.yml`](../../.github/workflows/k6-load-test.yml)). Inputs:

| Input | Default | Meaning |
| --- | --- | --- |
| `flow` | `smoke` | Which script |
| `profile` | `normal` | Load shape and seed size, as above |
| `target` | `local-stack` | `local-stack` starts a Supabase stack inside the run, applying every migration, exactly as CI's `e2e_local_stack` does. It cannot reach the hosted project. |
| `confirm_production` | off | Required with `target=hosted`; without it the job fails before checkout, before any secret is read |

The run's name and job name both say which flow, profile and target it ran.
The Markdown table is the job summary; all of `load-results/`, the HTML report
included, is uploaded as the `k6-<flow>-<profile>-<target>` artifact for 30
days. One run per target at a time. The README's "Load test (k6)" badge shows
the latest run's outcome on `main`, and reads "no status" until the first one.

## Read the results

Per scenario: requests, requests per second, failed requests (count and
rate), and p50, p95 and p99 of `http_req_duration`. Setup and teardown are in
none of those rows; they appear once, in the line of totals under the table,
together with the timeout count (a request that hit k6's own timeout, error
code 1050). Requests per second is over the whole run, setup included, so it
understates a scenario's rate a little.

The thresholds (`web/load/lib/options.js`) are under 1% failed requests, no
timeouts, over 99% of checks passing, and a p95 per scenario calibrated the
way TEST_STRATEGY.md §12 says: two `normal` runs of every script on a GitHub
runner, three times the worse p95, at least 100 ms, rounded up to 50.

| Scenario | Measured p95 (two runs) | Threshold |
| --- | --- | --- |
| `browse` | 27.4, 34.4 ms | 150 ms |
| `search` | 46.1, 62.2 ms | 200 ms |
| `shared_browse` | 5.6, 5.0 ms | 100 ms |
| `shared_search` | 35.2, 33.6 ms | 150 ms |
| `write` | 9.9, 12.9 ms (`population`: 12.3, 15.0 ms) | 100 ms |
| `own_browse`, `lent_browse`, `own_search` | at most 7.8 ms | 100 ms |

The margin is wide on purpose: the same script on the same runner type has
varied by 2× between runs, and the floor keeps a 5 ms scenario from turning
red on a noisy neighbour. They hold for `normal`; `peak` and `stress` are
meant to find where they break. The owner's map on a 25,000-entry category
does at `peak`: it returns every title of every place in one call, which is
kept on purpose so a popup opens without a second request.
Recalibrate the same way when a change moves a scenario's baseline.

A stack on a GitHub runner measures the runner as much as the app. Compare a
run with an earlier run of the same script on the same runner type, not with
production. When a number moves, check
[`075_query_plans_test.sql`](../../supabase/tests/database/075_query_plans_test.sql)
first: it is the deterministic gate for the same queries, and a plan change
shows up there before it shows up here.

## The Postgres side

k6 says a request was slow; Postgres says which statement made it slow, how
often it ran, and what it scanned. For a local-stack run,
`scripts/load-db-report.mjs` resets `pg_stat_statements` (enabled by
`0001_extensions.sql`) and snapshots the table and index counters just before
k6 starts, snapshots again after it ends, and writes `<flow>.db.md`, which the
workflow appends to the job summary under the k6 table:

| Section | Read it for |
| --- | --- |
| Most time in total | Where the database's time went: statement, calls, mean and max ms, rows, share of the total, buffer cache hit rate, and the role that ran it (`authenticated` for PostgREST, `supabase_storage_admin` for Storage, `supabase_auth_admin` for sign-up) |
| Most calls | Something called far more often than the journeys explain: a per-row trigger lookup, an N+1 from the client |
| Table access | Sequential scans and the rows they read against index scans, per table. A table the app filters that shows sequential scans reading many rows is the first thing to check against [`075_query_plans_test.sql`](../../supabase/tests/database/075_query_plans_test.sql) |
| Index use | Scans per index, and the indexes this run never touched. An index no journey uses is a candidate to drop (as #629 did), or a sign that its query plans around it |

Three things to keep in mind:

- It covers the whole run, setup and teardown included, so the seed's bulk
  `INSERT`s and their per-row trigger lookups show up. They are recognisable
  by their shape: a few calls, many rows each.
- `pg_stat_statements` tracks top-level statements only, so the statements
  inside `search_category_items` count toward the call that ran it.
- The wrapper waits 11 s after k6 before the second snapshot, because an idle
  backend can hold its table counters for up to 10 s before flushing them.

It needs `psql` on `PATH`, as `supabase/splinter.sh` does, and reads the local
stack's `DB_URL` from `supabase status`. A hosted run gets no Postgres report:
nothing here holds a connection string for the hosted database, by design.

## The hosted target, and why not

`target=hosted` points the scripts at the production project, with the
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` secrets. The
anon key is the only credential involved; no script ever holds
`service_role`. Two things stand in the way:

- **Sign-in is unresolved.** `setup()` signs up with email and password,
  which the hosted project does not offer: it signs in through Google only,
  and the email provider staying off is itself a security control (the
  anonymous sign-in note in `supabase/config.toml`, #634). A hosted run
  therefore fails at sign-up with the Auth server's own error. Until there is
  an answer that does not reopen that, the load test stays local.
- **The Free tier is shared with real users.** A sustained run spends the
  plan's request, egress and compute allowance and can get the project
  throttled while collectors are using it, and `setup()` writes up to 42,000
  entries, plus photographs, into production accounts.

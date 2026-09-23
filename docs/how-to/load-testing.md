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

### Profiles

A profile (`web/load/lib/profile.js`) scales every ramped scenario's virtual
users and sets the seed size, so a heavier run needs no new script:

| Profile | Virtual users | Shape | Seed: searched + shared entries |
| --- | --- | --- | --- |
| `normal` (default) | ×1: 15 on `catalogue` | 30 s ramp, 2 min hold, 15 s down | 10,000 + 300 |
| `peak` | ×5: 75 on `catalogue` | 1 min ramp, 5 min hold, 30 s down | 25,000 + 1,000 |
| `stress` | steps to ×20: 300 on `catalogue` | a quarter, half, then all of it for 2 min each, held 2 min more, 1 min down | 40,000 + 2,000 |

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
npm run load -- smoke          # then: catalogue, shared-viewer, write
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

The thresholds (`web/load/lib/options.js`) are **initial proposals, not
validated limits**: under 1% failed requests, no timeouts, over 99% of checks
passing, and a p95 of 500 ms for browsing, 800 ms for searching and 1,500 ms
for a write. Calibrate them the way TEST_STRATEGY.md §12 says for any
performance threshold: run the same script a few times on the same runner,
take the measured p95, and set the threshold above it with margin. A red
threshold before that is a question, not a regression.

A stack on a GitHub runner measures the runner as much as the app. Compare a
run with an earlier run of the same script on the same runner type, not with
production. When a number moves, check
[`075_query_plans_test.sql`](../../supabase/tests/database/075_query_plans_test.sql)
first: it is the deterministic gate for the same queries, and a plan change
shows up there before it shows up here.

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

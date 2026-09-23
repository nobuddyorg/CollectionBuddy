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

| Script | Scenarios | Load | Exercises |
| --- | --- | --- | --- |
| `smoke.js` | every journey below | 1 VU, 1 iteration each | That the scripts and the target work, before a heavier run |
| `catalogue.js` | `browse`, `search` | ramp to 10 + 5 VUs, 2 min hold | The owner paging the catalogue (list, exact count, map) and searching it through `search_category_items` |
| `shared-viewer.js` | `shared_browse`, `shared_search` | ramp to 10 + 5 VUs, 2 min hold | A second identity reading a category it holds a `viewer` grant on: the `has_category_read_access()` path (#619) |
| `write.js` | `write` | ramp to 5 VUs, 2 min hold | Creating an entry, filing it, uploading a photograph and its thumbnail, writing its `images` row |

Every script shares one `setup()` (`web/load/lib/seed.js`):

1. Signs up two fresh users with email and a random password: an owner and a
   viewer.
2. As the owner, through RLS like any client: 10,000 entries in one category
   (the one searched) and 300 in another, each batch **one request, so one
   `INSERT`**, plus a `viewer` grant on the second category. Below a few
   thousand rows every plan is a sequential scan and the numbers say nothing
   about production shape.

`teardown()` deletes the owner's photographs from Storage **before** any row
(CLAUDE.md), then the entries and categories. The two users stay in the
stack's `auth.users`; on the ephemeral CI stack that is moot, and locally
`supabase db reset` clears them.

## Run locally

Install [k6](https://grafana.com/docs/k6/latest/set-up/install-k6/) (CI pins
2.3.0), then from the repository root:

```bash
supabase start
cd web
npm run load -- smoke          # then: catalogue, shared-viewer, write
```

`scripts/load-test.mjs` reads the URL and anon key from `supabase status`,
the same way `npm run e2e:local` does, and runs `k6 run load/<flow>.js`. The
report prints to stdout and lands in `web/load-results/<flow>.md` and
`<flow>.json` (the full k6 summary object). It also sets
`K6_NO_USAGE_REPORT`, so k6 does not phone home.

A bare `k6 run` refuses to start without the variables the wrapper sets, and
refuses a `local-stack` target whose URL is not `127.0.0.1` or `localhost`.

## Run in GitHub Actions

**Actions → Load test (k6) → Run workflow**
([`k6-load-test.yml`](../../.github/workflows/k6-load-test.yml)). Inputs:

| Input | Default | Meaning |
| --- | --- | --- |
| `flow` | `smoke` | Which script |
| `target` | `local-stack` | `local-stack` starts a Supabase stack inside the run, applying every migration, exactly as CI's `e2e_local_stack` does. It cannot reach the hosted project. |
| `confirm_production` | off | Required with `target=hosted`; without it the job fails before checkout, before any secret is read |

The run's name and job name both say which target it hit. The report is the
job summary; `load-results/` is uploaded as the `k6-<flow>-<target>`
artifact for 30 days. One run per target at a time.

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
  throttled while collectors are using it, and `setup()` writes 10,300
  entries and photographs into production accounts.

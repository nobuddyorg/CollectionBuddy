# Configuration reference

## Web app environment variables

`web/.env.local`, from `web/.env.example`. Both are required; the Supabase client throws at import time without them.

| Variable | Local | Production |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `http://127.0.0.1:54321` | The project's API URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase's well-known local anon key; the `npm run` scripts that read `supabase status` pass its publishable key | The project's publishable key (`sb_publishable_…`), or its legacy anon key until [migrated](../how-to/developer-guide.md#migrate-to-publishable-and-secret-keys) |
| `NEXT_PUBLIC_DEMO_MODE` | `true` signs every visitor in anonymously; `npm run demo` sets it | unset |
| `PAGES_BASE_URL` | unset: the export is served under `/CollectionBuddy` | Build only: `pages-deploy.yml` sets it to the Pages site URL (`actions/configure-pages`), whose path becomes `basePath`, empty on a custom domain |

Place search uses the public [Photon](https://photon.komoot.io/) API unauthenticated; there is no key.

## Google OAuth

`supabase start` reads `GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID` and `GOTRUE_EXTERNAL_GOOGLE_SECRET` into `supabase/config.toml`'s `[auth.external.google]` block. Setup: [CONTRIBUTING.md](../../CONTRIBUTING.md#local-development).

## Local Supabase stack

From `supabase/config.toml`: API `54321`, Postgres `54322`, Studio `54323`, Mailpit `54324`. Anonymous sign-ins are enabled for demo mode, and the email provider without confirmations for the password test accounts; production has neither ([Hosted Auth settings](#hosted-auth-settings)). The project-level storage limit is 50 MiB; the `item-images` bucket is further restricted to 5 MiB per file and `image/webp`, `image/jpeg`, `image/png` ([Architecture](architecture.md#storage)).

## Photograph storage ceilings

Sized to the hosted project's plan, Supabase Free, whose 1 GB of Storage is for the whole project (`storage.size` in Supabase's [`pricing.ts`](https://github.com/supabase/supabase/blob/master/packages/shared-data/pricing.ts)). They are constants in [`0025_photo_ceilings_fit_the_plan.sql`](../../supabase/migrations/0025_photo_ceilings_fit_the_plan.sql); on another plan, a new migration replaces `tg_images_quota()` and `photo_upload_has_room()` with other numbers, and `item_list.photo_quota_error` in both dictionaries names the new owner's share ([why](../explanation/design-decisions.md#why-quotas-are-counted-in-the-database)).

| Ceiling | Counted | Checked when | Refused with |
| --- | --- | --- | --- |
| 256 MiB per owner | the sizes the owner's `images` rows recorded, full size and thumbnail | recording a photograph | `PT507`; the app shows `photo_quota_error` |
| 768 MiB | every object in `item-images` | recording a photograph | `PT507` with detail `project`; the app shows `photo_storage_full_error` |
| 832 MiB | every object in `item-images` | uploading | Storage's policy refusal; the app shows `upload_error` |
| 320 MiB per uploader | every object under the uploader's uid prefix | uploading | Storage's policy refusal; the app shows `upload_error` |

## Hosted Auth settings

The hosted project's Auth configuration lives in its dashboard, so the values sharing depends on are pinned in [`supabase/hosted-auth.json`](../../supabase/hosted-auth.json), keyed by their [Management API](https://supabase.com/docs/reference/api/v1-get-auth-service-config) field names. [`hosted-auth-check.yml`](../../.github/workflows/hosted-auth-check.yml) fails when production differs ([why](../explanation/design-decisions.md#why-the-hosted-auth-settings-are-pinned); [when it fails](../how-to/developer-guide.md#check-the-hosted-auth-settings)).

| Dashboard setting | Field | Production | Local stack (`config.toml`) |
| --- | --- | --- | --- |
| Allow anonymous sign-ins | `external_anonymous_users_enabled` | off | on, for demo mode |
| Email provider | `external_email_enabled` | off | on, for password test accounts |
| Confirm email | `mailer_autoconfirm` (its inverse) | on (`false`) | off |
| Allow unverified email sign-ins | `mailer_allow_unverified_email_sign_ins` | off | off |
| Allow manual linking | `security_manual_linking_enabled` | off | off |
| Google, and its nonce check | `external_google_enabled`, `external_google_skip_nonce_check` | on, nonce checked | same |
| Every other provider: phone, Web3, other OAuth, SAML, custom OAuth | any other `external_*_enabled`, `saml_enabled`, `custom_oauth_enabled` | off | off |
| Third-party auth | `/config/auth/third-party-auth` | none | none |
| Customize access token hook | `hook_custom_access_token_enabled` | off | off |
| Refresh token rotation, reuse interval | `refresh_token_rotation_enabled`, `security_refresh_token_reuse_interval` | on, 10 s | same |
| Site URL | `site_url` | `https://nobuddyorg.github.io/CollectionBuddy/` | `http://localhost:3000` |
| Redirect URLs | `uri_allow_list` | empty | the two local dev origins |

- **Redirect URLs stay empty.** Sign-in returns to the site's own URL, and GoTrue admits any redirect with the Site URL's scheme, host and port without an entry. A wildcard matching a host nobody here controls would let a sign-in hand its code to that host.
- **One setting is recorded, not checked**: Data API → exposed schemas is `public` only, as in `config.toml`'s `[api]`. Reading it through the Management API also returns the project's JWT secret.
- **Site URL follows the Pages URL.** A custom domain changes both in one PR ([Move to a custom domain](../how-to/developer-guide.md#move-to-a-custom-domain)).
- **Changing a value** is a PR to the file, reviewed like a policy change, with the dashboard changed as it merges; the push to `main` re-runs the check. For a fork, `site_url` is its own Pages URL.

## GitHub Actions secrets

`SUPABASE_DB_URL`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_AUTH_CONFIG_TOKEN`
and `SUPABASE_PROJECT_REF` are secrets of the `production` environment, not
repository secrets: that
environment's deployment-branch policy allows only `main`, so a workflow run
on any other branch cannot read them. `migrate`, `cleanup`, both
`backup.yml` jobs and `hosted-auth-check.yml` reference it and also refuse
any ref but `main`. The
`github-pages` environment is restricted to `main` the same way. The other
secrets are repository secrets.

| Secret | Used by | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `ci.yml`, `pages-deploy.yml`, `keep-alive.yml`, `cleanup-orphaned-photos.yml`, `backup.yml`; `k6-load-test.yml` with `target=hosted` only | Required |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `ci.yml`, `pages-deploy.yml`, `keep-alive.yml`; `k6-load-test.yml` with `target=hosted` only | Required. Either key format ([API keys](#api-keys)); `pages-deploy.yml`'s `build` calls `keepalive()` with it and publishes nothing if the project rejects it |
| `SUPABASE_DB_URL` | `pages-deploy.yml` (`migrate`), `backup.yml` (`database`) | Required. The **session pooler** string (`aws-0-<region>.pooler.supabase.com`), password percent-encoded. The direct `db.<ref>.supabase.co` host is IPv6-only and unreachable from GitHub runners; `supabase link` reports success anyway and the push fails. `migrate` also sends PostgREST's schema-cache reload through it. |
| `SUPABASE_ACCESS_TOKEN` | `cleanup-orphaned-photos.yml`, `backup.yml` (`photographs`) | Required. Scoped Management API token: runs a read-only query and fetches a fresh secret key ([Management API tokens](#management-api-tokens)). |
| `SUPABASE_AUTH_CONFIG_TOKEN` | `hosted-auth-check.yml` | Recommended. Scoped Management API token that reads the Auth config ([Management API tokens](#management-api-tokens)). Until it is set, the check borrows `SUPABASE_ACCESS_TOKEN` and warns on every run. |
| `SUPABASE_PROJECT_REF` | `cleanup-orphaned-photos.yml`, `backup.yml` (`photographs`), `hosted-auth-check.yml` | Required |
| `STRYKER_DASHBOARD_API_KEY` | `ci.yml` (`mutation_test`) | Optional; without it Stryker writes a local HTML report only |

None of these may appear in the repository. gitleaks
([`.gitleaks.toml`](../../.gitleaks.toml)) flags a JWT, a secret key
(`sb_secret_…`), a Management API access token (`sbp_…`) or a
password-bearing `*.supabase.co` / `*.pooler.supabase.com` connection string.
JWTs whose payload carries `"role":"anon"` are allowlisted and no rule matches
a publishable key, because both are public by design; a `service_role` key
still fails. It runs twice:

- **Commit hook**: the staged changes, before anything leaves the machine.
- **`ci.yml`'s `prek` job**: every commit the checked-out `HEAD` reaches —
  each commit of a pull request, even one whose secret a later commit
  removes, and commits made without the hook. Findings are redacted in the
  log. It runs after the push, so a secret it finds is already public:
  [rotate it](../how-to/developer-guide.md#rotate-a-credential), then drop the
  commit from the pull request's branch. The job pins the gitleaks release by
  version and SHA-256; bump both with the hook's `rev`.

Only a reviewed false positive, or a leak already rotated on `main`, goes in
[`.gitleaksignore`](../../.gitleaksignore), by fingerprint; never widen an
allowlist for it. GitHub push protection also refuses a push carrying a secret
key or a classic access token, but has no pattern for a legacy JWT or a
connection string.

### Management API tokens

Each is a **scoped** personal access token (`sbp_fc…`) reaching this one
project and nothing else, never a classic token
([why](../explanation/design-decisions.md#why-the-management-api-tokens-are-scoped-per-job)).
`migrate` holds none: it reloads the schema cache over `SUPABASE_DB_URL`.

| Secret | Permissions, on this project only | Endpoints | Used by |
| --- | --- | --- | --- |
| `SUPABASE_ACCESS_TOKEN` | **Database**: Read; **API Keys**: Read; **API Key Secrets**: Read | `POST /v1/projects/{ref}/database/query/read-only`, `GET /v1/projects/{ref}/api-keys?reveal=true` | `cleanup-orphaned-photos.yml`, `backup.yml` (`photographs`) |
| `SUPABASE_AUTH_CONFIG_TOKEN` | **Auth Config**: Read | `GET /v1/projects/{ref}/config/auth`, `GET /v1/projects/{ref}/config/auth/third-party-auth` | `hosted-auth-check.yml` |

- **Names** are the dashboard's, from Supabase's [permission
  table](https://supabase.com/docs/guides/platform/personal-access-tokens#permission-scopes);
  the Management API spec calls them `database_read`,
  `api_gateway_keys_read`, `api_gateway_keys_secret_read` and
  `auth_config_read`. Grant nothing else: no Read-write, no organization or
  account access.
- **Database: Read, not Read-write.** The read-only endpoint runs as
  `supabase_read_only_user`, which reads every table past RLS and writes
  nothing; `0024` lets it execute `orphan_sweep_plan()`.
- **Both key permissions.** `reveal=true` returns the secret key only with
  API Keys and API Key Secrets together ([API keys](#api-keys)).
- **Expiry: 90 days**, the longest preset (a custom date may reach a year).
  Rotate both tokens on one day, a week before they expire: [Rotate a
  credential](../how-to/developer-guide.md#rotate-a-credential). An expired
  token fails its job with a 401; nothing retries.
- **Scoped tokens are in public alpha.** If the token form offers no
  permissions, the account has no access yet; Supabase support grants it.
  Until then a classic token works in both secrets, with the shortest expiry
  you will keep rotating.
- **The creating account's role caps the token**, re-checked on every
  request: both key permissions need at least the Developer role.

### API keys

Supabase deprecates the legacy JWT `anon` and `service_role` keys by the end
of 2026 in favour of publishable (`sb_publishable_…`) and secret
(`sb_secret_…`) keys. Both kinds work side by side until the legacy ones are
deactivated, and every workflow here takes either, so the switch is a
dashboard and secret change with no code change: [Migrate to publishable and
secret keys](../how-to/developer-guide.md#migrate-to-publishable-and-secret-keys).

- **The public key keeps its name.** `NEXT_PUBLIC_SUPABASE_ANON_KEY` holds
  the publishable key once migrated: both map to the `anon` Postgres role,
  supabase-js takes either, and one secret swapping its value avoids a
  rename across every workflow and script.
- **No secret key is stored.** `cleanup-orphaned-photos.yml` and
  `backup.yml` fetch one per run through the Management API
  (`SUPABASE_ACCESS_TOKEN`): the first key of type `secret`, else the legacy
  `service_role` key while the project has no secret key. Rotating it
  therefore changes nothing in GitHub.
- **Header rule.** A new-format key is not a JWT: it goes on the `apikey`
  header alone. A legacy key also rides as `Authorization: Bearer`. The
  workflows' `curl` calls branch on the `sb_` prefix; supabase-js handles
  both on its own.
- **Local stack.** `supabase status` prints both kinds. `web/.env.example`
  holds the legacy anon key; `npm run e2e:local`, `demo`, `lighthouse` and
  `load`, and CI's `zap_baseline`, pass the publishable key (`e2e:local` the
  secret key too), so CI covers the new format while production may still run
  the old one.
  The local stack accepts an unknown `apikey` as `anon`; only the hosted
  project rejects a wrong key.

Rotating any credential in this section: [Rotate a
credential](../how-to/developer-guide.md#rotate-a-credential).

### Backups

[`backup.yml`](../../.github/workflows/backup.yml) and the pre-migration dump
in `migrate` ([Back up production](../how-to/developer-guide.md#back-up-production))
read six more values from the `production` environment. All are required: a
missing one fails the job by name, so `backup.yml` fails every night and a
deploy with a pending migration stops before applying it.

| Name | Kind | Value |
| --- | --- | --- |
| `BACKUP_S3_ENDPOINT` | variable | The S3 API endpoint of the off-site store, e.g. `https://<account>.r2.cloudflarestorage.com` or `https://s3.<region>.backblazeb2.com` |
| `BACKUP_S3_REGION` | variable | Its region for request signing, e.g. `auto` on R2 |
| `BACKUP_S3_BUCKET` | variable | A private bucket used for nothing else |
| `BACKUP_S3_ACCESS_KEY_ID` | secret | A key scoped to that one bucket, read and write |
| `BACKUP_S3_SECRET_ACCESS_KEY` | secret | Its secret |
| `BACKUP_AGE_RECIPIENT` | variable | The `age1…` public key everything is encrypted to. Public by design; its identity file never goes into GitHub |

## Coverage and mutation thresholds

| Gate | Where | Value |
| --- | --- | --- |
| Unit coverage, global | `web/vitest.config.mts` `GLOBAL_COVERAGE_THRESHOLDS` | 99% statements, branches, functions, lines |
| Unit coverage, per file | same file, `PER_FILE_FLOOR`, over `mutation-targets.mjs` | 100%, except the two `Map/` hooks in `NO_COVERAGE_FLOOR` |
| Unit coverage, what counts | same file, `coverage.exclude` | Product code only: `*.test.*` (Vitest's own rule) and `*.test-support.*`, the fixtures and fakes a family of test files shares, are test code |
| Mutation score | `web/stryker.config.mjs` `thresholds.break` | 99 — one below the measured 100, so a single new equivalent mutant cannot block unrelated work |
| E2E JS/CSS coverage | `web/e2e/coverage.ts` `COVERAGE_THRESHOLDS` | One floor, on `npm run e2e:local` only (every Chromium project, source-mapped); `npm run e2e` and the smoke test collect nothing |
| Lighthouse | `web/lighthouserc.signed-out.json`, `.signed-in.json` | Performance, best-practices and SEO scores plus LCP, TBT, CLS, set from a measured baseline with margin; accessibility at exactly 1.0 |

Every floor is raised by hand when a real run reports a higher number, and never lowered to make a change fit. The global unit floor sits one point under the measured 100% because CI's pinned Node measures about 0.1 pp lower than a local run. `autoUpdate` is off in Vitest: it wrote the local measurement back into the config after every run, so a green local run produced a red PR.

Stryker runs incrementally (`incremental: true`, reusing `web/reports/stryker-incremental.json`); CI caches that file keyed on `package-lock.json` and the Stryker and Vitest config, and `main` passes `--force` for a full run. k6's p95 thresholds (`web/load/lib/options.js`) are calibrated from two `normal` runs per script with a 3× margin ([Load testing](../how-to/load-testing.md#read-the-results)).

Stryker runs Vitest through `web/vitest.mutation.config.mts`, which only changes `test.reporters`: Vitest adds a `github-actions` annotation reporter under `GITHUB_ACTIONS`, and a killed mutant is an expected test failure that would otherwise become a workflow annotation.

## CI job summaries

Each job writes its report to its own Actions summary (`$GITHUB_STEP_SUMMARY`); nothing posts a PR comment, and Codecov's comment is off in [`codecov.yml`](../../codecov.yml).

| Job | Summary | Source |
| --- | --- | --- |
| `build_and_test` | Coverage against the thresholds above | `davelosert/vitest-coverage-report-action` over the `json-summary` reporter |
| `build_and_test` | Signed-out e2e results | `daun/playwright-report-summary` over the `json` reporter |
| `build_and_test` | `depcruise` and `knip` output | The step's text, `tee`'d into the summary; Knip prints nothing when clean, so the summary says so |
| `e2e_local_stack` | pgTAP results; signed-in e2e results | `pg_prove` output; the same Playwright action |
| `mutation_test` | Mutation score, overall and per file | `web/scripts/mutation-summary.mjs` over Stryker's `json` reporter |
| `opengrep` | Finding count, total and by rule; every partially analyzed file | `jq` over the uploaded SARIF; `jq` over the same scan's `--json-output` `errors[]` |
| `lighthouse` | Scores, LCP, CLS against each page's thresholds | `web/scripts/lighthouse-summary.mjs` over each target's `manifest.json` |
| `build_and_test`, `e2e_local_stack` | Non-blocking accessibility findings | `web/e2e/axe.ts` `reportNonBlockingFindings`, from inside the test, CI only |
| `zap_baseline` | Every alert with its verdict, per pass; an alert `.zap/rules.tsv` ignores shows its reason | `web/scripts/zap-summary.mjs` over `report_json.json` from `zaproxy/action-baseline` |
| `load_test` (`k6-load-test.yml`, manual) | Per scenario: requests, rate, failures, p50/p95/p99; every threshold. On the local stack, also Postgres's view: top statements by time and by calls, scans per table, use per index. Charts over time are in the artifact's HTML report | `handleSummary` in `web/load/lib/summary.js`; `web/scripts/load-db-report.mjs` over `pg_stat_statements` and the table and index statistics; k6's `web-dashboard` output |

## End-to-end tests

[`web/playwright.config.ts`](../../web/playwright.config.ts), specs in `web/e2e/`. Projects: `chromium` (Desktop Chrome), `mobile` (Pixel 7), `firefox`; with a local stack also `setup` and `signed-in`.

| Variable | Effect |
| --- | --- |
| _(unset)_ | Serves `web/out` under the base path and tests it |
| `E2E_BASE_URL` | Tests that origin instead; starts no server; `retries: 2` |
| `E2E_PORT` | Local server port, default `4173` |
| `E2E_SUPABASE_URL` | Enables the `setup` and `signed-in` projects |
| `E2E_SUPABASE_ANON_KEY` | Signs the test user in |
| `E2E_SUPABASE_SERVICE_KEY` | Creates the test user, nothing else — the `service_role` role it maps to has no table grants |
| `E2E_COVERAGE_SOURCEMAPS` | `true` makes `next build` emit source maps so the coverage report maps to `src/app/**` |

`npm run e2e:local` sets the three `E2E_SUPABASE_*` values from `supabase status` (the publishable and secret keys) and builds the bundle against the local stack; nothing reads them from a deployed project's secrets, because the suite seeds whatever database it is pointed at. Retries are `0` locally: a page that fails one run in ten fails for a tenth of visitors.

## i18n

German (`de`, default) and English (`en`): [`web/src/app/i18n/de.json`](../../web/src/app/i18n/de.json), `en.json`, keys grouped by area (`brand`, `page`, `header`, `category_select`, `item_create`, `item_list`, `google_sign_in_button`, `login_page`, `common`). `web/src/app/i18n/parity.test.ts` scans every `t('…')` call site and fails on a key missing from either file or on the two files declaring different key sets.

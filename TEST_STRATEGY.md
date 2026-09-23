# Test strategy playbook

A portable testing strategy for one shape of app: a **Next.js frontend with no
backend of its own**, on **Supabase** (Postgres, Auth, Storage), where **Row
Level Security is the only authorization boundary**. It says what each test
layer can and cannot prove in that architecture, and which layer owns which
behavior. Copy it into a new project of the same shape, then localize it (§16).
**This file names no real table, route, file path, or measured number** —
those belong in the project's own docs.

Two meta-rules: **disagree in the open rather than departing quietly** — if a
task needs something this strategy rules out, say so first — and **update this
file the moment the architecture moves**; a stale strategy produces false
confidence at exactly the layer nobody double-checks.

Vocabulary used throughout: *users* own *resources*; a resource can be
*shared* with another user through a *grant* carrying a *role* (`viewer`,
`editor`); a resource may reference *storage objects* in a private bucket.

---

## 0. When this applies

- The frontend ships as static files or a thin serverless layer with **no
  server-side authorization code**. Pages talk to Supabase with the user's own
  token.
- Authorization lives in Postgres RLS, reached through PostgREST — no
  hand-written endpoints.
- The anon key and the bundle are public. Anyone can issue arbitrary requests,
  so the policies are the entire defense.
- There is probably no staging; migrations apply straight to production on
  merge.

If a server-side execution surface appears — an Edge Function, a route handler,
a `SECURITY DEFINER` function that re-implements an access check — the central
claim (**only the database can catch an authorization bug**) stops holding for
that surface. Rethink this document there; don't patch it.

---

## 1. Purpose

Put each check at the cheapest level that would actually catch the failure it
is aimed at. This needs writing down because there is no server: a wrong policy
is caught by nothing else, and the interface looks normal while showing
somebody else's data. A strategy that only describes what is already green is
not a strategy — name the gaps (§16).

---

## 2. System testing context

### Map the shape, for the real project

Write this into the project's own docs with its real pieces:

| Piece | Testing consequence |
| --- | --- |
| Next.js frontend, static or serverless | Nothing server-side to unit-test for authorization |
| Static host / CDN | Deployment failures are path failures (base path, asset URLs) — needs a real fetch against the deployed origin |
| Postgres: tables, functions, triggers, constraints | Unreachable from a unit test — needs a real database |
| RLS policies, on every table and on `storage.objects` | The entire authorization boundary — §7 |
| PostgREST | The schema *is* the contract; generated client types drifting from it is a production failure |
| Supabase Auth | Interactive sign-in cannot run in CI — mint sessions via the admin API |
| Supabase Storage | Bytes cannot be deleted from SQL; object *paths* often carry authorization meaning |
| Third-party services called from the browser | Always faked |
| CI/CD holding `service_role` and the database URL | The highest-privilege *code* is shell in a workflow, not app code |

### Trust boundaries to enumerate

1. **Browser bundle → PostgREST.** The only meaningful test does what an
   attacker could: a direct request with a real token, bypassing the UI.
2. **One user → another user's resources**, through sharing. The most
   permissive role gets the most scrutiny (§7).
3. **Anonymous → everything.** Denied twice — by RLS (no predicate matches
   without an identity) and by an explicit `REVOKE` of the table grant. Test
   both: a revoked grant errors before any policy runs; a policy filter returns
   `[]`. A project can have one covered while believing both are.
4. **CI/CD → production.** Covered by workflow-scanning tools and review, not
   by a test.
5. **App → third-party HTTP.** Always faked; never reached.

---

## 3. Testing principles

1. **Authorization is not testable from the client.** A hidden button is a UX
   property. Authorization tests hold a real token and talk to a real database.
2. **Never mock the thing that carries the risk.** Mocking the Supabase client
   tests your own call shape, not RLS, triggers, or constraints.
3. **Coverage is a signal; mutation score is stronger.** A line ran proves
   nothing about pure, high-consequence logic.
4. **Lowest level with the same confidence.** Pagination math is a unit test;
   *that the UI paginates* is one E2E case, not one per field.
5. **Deterministic or deleted.** No retries except the post-deploy smoke test,
   where a retry distinguishes a broken deploy from a dropped connection. A
   flake is a defect.
6. **Test the failure paths.** Anything that retries, skips-and-continues, or
   is cancellable carries a data-loss or duplication risk — inject failures.
7. **If it is hard to test, fix the design.** Extract pure logic from the I/O
   beside it; don't fake the world.
8. **Fixtures may not out-privilege the app.** `service_role` in a fixture
   opens exactly one door: creating test users.
9. **One new behavior, one new assertion, at one level.**

---

## 4. Risk model — a template, not a checklist

Rank by expected cost. "Cheapest meaningful test" is the level below which the
risk is uncovered. Replace the rows with the real project's tables, roles, and
operations:

| Risk | Cost | Cheapest meaningful test |
| --- | --- | --- |
| **Cross-tenant read or write** — a policy stops holding | Silent, total confidentiality failure; UI looks fine | Integration, real token, real database, bypassing the UI |
| **A permissive role reaches further than intended** (`editor` renames, deletes, or promotes itself) | Privilege escalation | Same, with a second user holding that role |
| **A storage policy keys on the wrong path segment** | A grantee moves or overwrites the owner's object; revocation no longer reaches it | Integration against real Storage, both identities |
| **Orphaned storage objects or data loss on delete** | Bytes unreachable, or an attachment silently lost | Unit test for delete ordering; integration for the cascade |
| **A migration that cannot apply to a populated database** | Deploy blocked or half-applied, unattended | From-scratch CI catches syntax only — §8 |
| **Client/schema drift** | Runtime errors after deploy | Generated-types diff in CI |
| **Injection into PostgREST's filter grammar** | User input rewrites the query | Unit + mutation on the filter builder; adversarial E2E input |
| **Export-format injection or corruption** (CSV formulas, archive limits) | A file that damages the opener or won't open | Unit + mutation on the encoder |
| **Static-hosting or base-path faults** | A site that quietly breaks post-deploy | Serve the real artifact under its real path, locally and deployed |
| **In-client race conditions** | Stale data, broken assets | Unit tests on sequencing and caching |
| **Duplicate or repeated operations** | Duplicate records or side effects | Unit tests with fakes simulating the retry |
| **Third-party outage** | Degraded feature | Unit test on the error branch |
| **Free-tier auto-pause** | App down | A keep-alive job, not a test |
| **Destructive scheduled-job faults** | Irreversible deletion of live data | No cheap test; dry-run mode + treat the query as security-critical — §12 |
| **Capacity** | Slow queries at real usage | Index design + query-plan inspection, absent a real SLA |
| **Accessibility regressions** | Unusable with keyboard or screen reader | Static lint + runtime axe — §9 |

Keep 10–20 rows, each marked covered / partly / not covered, updated as
incidents happen.

---

## 5. Test layers

| Layer | Verdict | Why |
| --- | --- | --- |
| Unit (pure functions) | **Required** | Where extracted logic lives; the only level mutation testing means anything at. |
| Component / hook | **Required** | Hydration mismatches, missing a11y attributes, a control that never disables — invisible to pure-logic tests. |
| Database tests (pgTAP) | **Required** | Policies, triggers, constraints, function hardening, proven directly and fast under impersonated roles. |
| Integration: real Postgres + Storage + Auth through PostgREST | **Required, non-negotiable** | The only level where RLS through the API, storage policies, signed URLs, MIME/size limits, and session minting exist. |
| API testing | **Not a separate suite** | PostgREST is generated; the integration suite issuing direct calls *is* the API suite. |
| Contract testing | **Narrow form only** | Schema ↔ generated types. Pact-style testing is unjustified without independent deploys on both sides. |
| Authorization/security | **Required — highest priority** | §7. |
| Dynamic scanning (DAST) | **Recommended, narrow** | Passive scan of the running build; never authorization coverage — §6. |
| Property-based | **Narrowly** | §10. |
| Mutation | **Required, scoped** | §11. |
| E2E | **Required, small** | §9. |
| API fuzzing | **Not justified** | Fuzzes the vendor's product; hostile-input unit tests cover what is yours. |
| Load testing | **Not justified** | Until an actual throughput SLA exists. |
| Concurrency | **Unit level** | In-client races are common; same-row multi-writer conflicts are rare in single-owner data. |
| Failure injection | **Unit level** | Retry, backoff, skip, cancel through injected fakes; the real stack adds cost without signal. |
| Deployment | **Required** | Every migration applied from scratch in CI; the built artifact served under its real base path. |
| Smoke | **Required** | Signed-out suite against the deployed origin — a Node prerender masks failures only a browser bundle shows. |
| Production synthetic | **Optional** | Duplicates smoke. Never signed-in against production. |

### Who owns which behavior — and who does not

| Behavior | Owning layer | Not this |
| --- | --- | --- |
| Pure transforms (filters, pagination, encoding, formatting) | Unit + mutation | Not the browser |
| Rendering, disabled states, focus, keyboard paths, a11y attributes | Component | Not E2E, unless the journey depends on it |
| Triggers, ownership rewriting, constraints, cascades | pgTAP + integration | Not unit — it doesn't exist in app code |
| Row/object visibility, grant scope, expiry, revocation, anon denial | Integration, second real identity, through PostgREST | **Never** client code or a component test |
| Generated types ↔ schema | Automated diff | Not a hand-written assertion |
| Base path, icons, manifest, pre-hydration behavior | Signed-out browser suite | Not unit alone |
| One complete user journey | E2E | Not one case per field |
| Migration applicability | CI from scratch + populated-database check (§8) | Not review by eye |
| Repo tooling outside the bundle | The job that depends on it | Not unit tests, not bundle coverage |

---

## 6. Architecture-specific strategy

### The shape of the pyramid

The middle band — integration against a real database — is unusually
load-bearing, because authorization and much business logic live in SQL:

```text
Layer                              Weight           Runs against
---------------------------------  ---------------  --------------------------------
Unit + component                   most of it       fakes; a scoped subset also
                                                      mutation-scored
Database tests (pgTAP)             fast, targeted   real Postgres, impersonated roles
API-level integration              a wide band      real database + storage + auth,
                                                      real tokens, no browser
Browser, signed-in journeys        one per journey  real stack, real bundle
Browser, signed-out                small            built artifact; also post-deploy
```

Two ways it drifts: new policies landing without the API band growing
(authorization silently leaving coverage), or the browser bands asserting what
a cheaper level could have settled.

### What must be real, and what may be faked

| Thing | Unit/component | Integration |
| --- | --- | --- |
| Supabase client | Faked (injected or module mock) | **Real** — one client per identity |
| Postgres, RLS, triggers | Absent — never simulated | **Real** |
| Storage | Faked | **Real**, including MIME/size enforcement and path policies |
| Auth/sessions | Faked | **Real**, minted via the admin API |
| Browser-only APIs (Worker, Canvas, geolocation) | Faked | Real |
| Third-party services | **Always faked** | Always faked |
| Ids, clocks | Injected | Real |
| `service_role` | Never | **Only** to create test users |

### Managed-service boundaries

- **`SECURITY DEFINER` functions** that bypass RLS and re-implement an access
  check are authorization boundaries in their own right; each needs its own §7
  case.
- **Storage paths that carry authorization meaning.** A path that fails to
  parse must make the policy **not match** — a raised error inside `USING`
  aborts the whole statement. Unit-test the fail-closed parser in pgTAP.
- **Schema-cache staleness.** A new column is invisible to PostgREST until
  `NOTIFY pgrst, 'reload schema'`; a hand-applied migration needs the same
  reload an automated deploy sends.
- **Row caps.** PostgREST's default row limit silently truncates unranged
  responses. Page deliberately; test page boundaries with fakes.
- **Correlated writes.** If one action writes twice (a row and its object, a
  full-size and a thumbnail), decide and test the chosen partial-failure
  behavior with an injected failing write.
- **Local vs. deployed.** `supabase start` runs the same engines; trust its
  integration results. Reserve "only provable deployed" for host-specific
  behavior: CDN, base path, cold starts.

### Static analysis layering

Four tools answer four different questions; none stands in for another:

1. **Module-boundary graph** (dependency-cruiser): only the data-access layer
   imports the Supabase client — a single-file linter can't see an *indirect*
   reach through another module. Also: no cycles, no orphans, and the bundle
   never imports Node-only tooling that might carry credentials.
2. **Dead code / unused dependencies** (knip). Generated files get an explicit
   ignore; anything referenced only as a string in another tool's config gets
   an explicit entry point.
3. **General-purpose SAST** (Semgrep/Opengrep). Block on error severity,
   surface the rest for triage. Every suppression carries its reason at the
   suppression; a claimed fix is verified to stop the matcher firing.
4. **Code-smell linter** (cognitive complexity, duplication). Tune thresholds
   against the project's own code; a copied default is a guess.

Measure run time before placement: seconds-scale belongs in a pre-commit gate;
a network fetch or cold binary install belongs in CI only.

### Dynamic scanning (DAST)

A **passive baseline scan** (spider plus passive rules, never an active attack
scan) against an isolated local build is the only layer that sees a response
header regress or a stack trace leak into rendered HTML.

- It never signs in and never holds a token, so it says nothing about
  authorization. A green DAST run is not §7 coverage.
- Never against a deployed or production target.
- Scan a signed-in state too, if the app's real content only exists once signed
  in; a login screen alone has almost nothing rendered.
- A header the static host cannot set stays explicitly ignored, with the reason
  written down — not silently unaddressed.
- Graduated severity: a small blocking set, the rest for triage.

---

## 7. Security and authorization testing

**The highest-value testing in this architecture.** No second layer catches an
authorization bug; it fails silently and looks like success. A frontend test is
never evidence that an authorization rule works.

### Rules

1. A **real access token for a real user**, issued **directly against
   PostgREST and the Storage API**, never through the UI.
2. **At least two users.** A single-identity suite only ever makes allowed
   requests and can never notice a broken policy.
3. Assert on the **mechanism**: an empty result means a policy filtered the
   row; a permission error means the grant never existed. Distinguish them,
   especially for `anon`.
4. Query for the other user's **known row** and get `[]` — sharper than an
   unfiltered read that merely doesn't contain it.
5. Write-side tests **read back as the owner**; a write accepted but hidden
   from the writer's own later read is the worst outcome.
6. **Every mirrored surface needs its own test.** A row and the storage object
   it references are governed by separate policies.
7. Grants **in both directions**: an active grant opens exactly what it should,
   *and* revocation or expiry closes it again **with the resource still
   present** — otherwise "denied" only proves the resource stopped existing.
8. **Every verb, every identity, every negative.** `SELECT`, `INSERT`,
   `UPDATE`, `DELETE`, as owner, as grantee at each role, as a stranger, as
   `anon`. A table with no `UPDATE` policy is tested for the denial that
   omission implies.

### The most-permissive role needs the most scrutiny

Write out and test both halves for the widest non-owner role: what it **can**
do inside the shared resource, and what it **cannot** — rename, delete, or
manage grants on the resource itself, self-promote, reach an ungranted
resource, write under another user's storage prefix, act after revocation.

One asymmetry worth a named test once confirmed: if "can write" includes
ownership of the parent but "can read" requires an active grant, then
**owning the parent does not reveal everything a delegate did inside it**.
That is a legitimate design, easy to mistake for a bug.

### Two levels of authorization test

- **pgTAP** (`SET LOCAL ROLE authenticated` plus a `request.jwt.claims` GUC)
  proves policy, trigger, and constraint logic fast enough for every schema
  change. Verify the impersonation itself: an identical query fails with no
  claim, passes with one, depends on its content — otherwise a suite running as
  `postgres` passes everything.
- **End-to-end through PostgREST** with a real minted JWT proves the same
  properties through the real pipeline, and is the only place storage
  authorization and the bytes behind a `storage.objects` row get exercised.

A policy, grant, or ownership-trigger change ships an end-to-end case in the
same change. A pgTAP case alongside is encouraged but does not discharge this:
the failure is invisible, and SQL review by eye has a documented history of
missing exactly this class of bug.

A SQL linter answers "is this well-formed," not "is this policy correct." It
adds no authorization coverage.

### Out of scope

Penetration testing the managed platform; anonymous share links if the project
has ruled them out (a new, higher-risk boundary if ever added); secret scanning
beyond a dedicated hook and the platform's own tooling.

---

## 8. Integration strategy

### Setup that must not be weakened

- **Seed as the user, never as `service_role`.** A bypass constructs states the
  app could never reach and hides policy bugs.
- **Isolate fixtures across parallel specs.** Read-only shared state versus
  scratch resources owned by one writing spec — decided explicitly.
- **Build the bundle against the stack it tests.** The Supabase URL is baked in
  at build time; a bundle built against another project passes while testing
  the wrong backend.
- **Clean up in `finally`.** Probe rows and objects must not survive a failed
  assertion.
- **Fail on an unexpected console or runtime error.** This catches a rejected
  background query hiding behind a passing assertion.
- **Flush browser coverage before every full navigation.** V8 keeps counts
  only for the live document; a reload or `goto` discards everything the test
  did before it, silently, and a "keep across navigations" option does not
  change that. A spec ending on a reload then reports the journey as
  unexecuted, and the gap list lies.
- **Read function coverage, not line coverage, when deciding what a browser
  suite never reached.** Minified bundles map function starts reliably and
  block ranges inside async bodies poorly; a function at 0 calls is a real
  gap, an uncovered line inside an executed function usually is not.

### Migrations against a populated database

CI applies every migration to an **empty** database; production applies only
*pending* ones to a database **full of rows**, unattended. A `NOT NULL` with no
default, a unique index existing rows violate, or a check constraint existing
data fails passes CI and fails in production.

**Policy:** any migration altering an existing table, or adding a constraint or
index to one, is verified locally against seeded rows (reset, seed, *then*
apply) before merge, and that verification is stated in the PR.

### Idempotency and repeated operations

Every repeatable operation gets a *decided*, tested answer:

| Operation | Decide and test |
| --- | --- |
| An import or create run twice with the same input | Duplicate, or an identity that detects the repeat |
| An upload retried after a partial failure | Same path? If the bucket forbids overwrite, the fallback (skip and flag, fresh path), driven by a fake that fails partway |
| Creating a grant that already exists | No-op or clear conflict, never a silent duplicate with different terms |
| Revoking a grant already revoked | Idempotent — a second delete affecting zero rows |
| A cleanup job re-run | Safe to repeat; set-based and existence-checked gets this free |

### Not here

Pure logic already covered at unit level. A unit test finds broken pagination
arithmetic in milliseconds; the same point through a browser and a real
database costs orders of magnitude more.

---

## 9. E2E strategy

Two suites with different jobs.

**Signed-out** — must hold for an anonymous visitor, which is what makes it
safe against production post-deploy: base path, manifest and icons,
pre-hydration behavior, theme, more than one viewport, the sign-in entry point
up to the redirect.

**Signed-in** — whole journeys against a real local stack: the main view shows
correct data; create, edit, delete the core resource; search narrows results,
including hostile input; an upload persists, survives reload, and goes with its
resource; a secondary view agrees with the list; export/import round-trips;
sharing driven from both sides with two real sessions; sign-out ends the
session. Sign-in bypasses the interface when the provider is an OAuth flow no
runner can drive: a setup project creates the user through the admin API and
writes the session into storage state.

A UI change gets one E2E case for its journey; field-level detail (disabled
states, validation wording, focus order) belongs in component tests. Treat
mobile as its own target if layout faults are viewport-specific. Poll for
expected state wherever the UI debounces or waits on a round trip.

### How the browser suite addresses the UI

Pick the locator that matches what the test is about, and record the
project's default:

- **Accessible locators** (`getByRole`, `getByLabel`) when the test is about
  what a user sees and does. A control a role-based locator can't find, a
  screen reader can't find either.
- **Stable test ids** (`data-testid`) where they carry a deliberate benefit: a
  repeated card or row, an element whose name is translated or user-supplied,
  an attribute-state assertion (`disabled`, `aria-current`, `lang`), a suite
  that must survive copy edits across locales.
- **Never CSS class or DOM structure.**
- **Text that is the subject is asserted, not located by** — finding an element
  by the text you then assert is circular.
- **A third party's DOM** (a map, an editor) is reached the way it allows,
  inside the page object, with a one-line comment.

**One page object per screen, all hung off one tree.** Each screen exports
`init<Screen>(page)` returning its root locator as a callable, plus `locators`
(grouped handles) and `do` (whole interactions); a repeated row or card gets a
nested object of the same shape:

```ts
export function initResourceList(page: Page) {
  const root = page.getByRole('main');
  const locators = {
    buttons: { newResource: root.getByRole('button', { name: /new/i }) },
    cards: root.getByTestId('resource-card'),
  };
  const interactions = {
    addResource: async (title: string) => {
      await locators.buttons.newResource.click();
      await page.getByLabel(/title/i).fill(title);
      await page.getByRole('button', { name: /save/i }).click();
      await expect(locators.cards.filter({ hasText: title })).toBeVisible();
    },
  };
  return Object.assign(() => root, { locators, do: interactions });
}
```

A tree of getters collects the screens, a fixture hands it to every spec, and
a spec reads as the journey it is:

```ts
test('files a resource and finds it again', async ({ on, page }) => {
  const app = on(page);
  await app.resources.do.addResource('Title');
  await expect(app.resources.card('Title').locators.title).toHaveText('Title');
});
```

Four rules keep this from decaying:

- **No spec names a selector.** Grep the spec directory for `getByTestId`,
  `getByRole`, `locator(`; only document-level elements (`html`, `body`,
  `meta`, `link`) may show up.
- **`do` holds whole actions; `locators` holds handles.** An action spanning
  two screens belongs to the screen that starts it.
- **Waiting belongs to the page object.** `open()` returns when the screen is
  there, not when the click landed. No spec carries a sleep.
- **Assertions belong to the spec.** A page object asserts only its own
  action's postcondition.

### Accessibility

**Static** (a JSX a11y linter) catches missing alt text, invalid ARIA, an
unlabeled control before anything renders. **Runtime** (axe-core in the browser
suite) catches computed contrast, real focus order, accessible-name computation
— on representative states, not every route. Decide which severities block;
treating every finding as blocking gets the gate disabled the first time it
catches something ambiguous. Neither proves compliance or screen-reader
behavior: a clean run is "no known regression," and the docs say so.

---

## 10. Property-based testing strategy

Only where an input space is genuinely adversarial and a property is easy to
state: a filter builder that must never let input escape PostgREST's grammar,
an encode/decode pair that must round-trip, a date-packing function that must
never underflow. Seeded and deterministic, one dependency, beside the example
tests rather than replacing them, inside the unit suite's time budget. Adopt on
a real near-miss, not speculatively.

---

## 11. Mutation testing strategy

**Required, scoped — never the whole codebase.**

- One short, explicit file list, shared with the per-file coverage floor so the
  two can't drift.
- Every listed file is pure logic, or I/O reached through an injected parameter
  so a test can drive it and assert the request it composed. Prefer that over
  exclusion regions; any exclusion carries its reason at the exclusion.
- **Never mutate the rendering layer.** JSX mutants are near-equivalent by the
  thousand. A file that can't split into logic and rendering is the problem.
- Run on every change touching scoped files. A scoped run is fast; learning
  after the merge that a test asserts nothing is too late.
- Incremental reuse of earlier results is fine on a change, provided the
  branch that deploys reruns everything: the tool's diff sees mutated code and
  tests, not what the mutated code imports, nor a dependency bump. Key the
  saved results on what it cannot see.

A surviving mutant has two honest endings: **a missing assertion** (kill it
with a real behavioral test, usually an unpinned boundary or error path), or
**equivalent**. For an equivalent mutant, first ask whether the code needs to
exist — a guard the type system already discharges, a default spelled out, a
wrapper every caller unwraps. Deleting that code is the ending that pays for
the exercise. What genuinely remains is left visible in the report with its
reason written down, never hidden behind a suppression. Never write a test that
can't fail just to kill a mutant.

Two structural survivor classes in React: an empty dependency array (the tool
replaces it with a constant React reads as unchanged — drop the memoization if
it isn't load-bearing, otherwise leave the survivor visible), and a timeout (a
counter driven backwards, or a page fake that answers every page identically —
iterate over the thing being counted, or back the fake with a finite table).

Below threshold fails the build. Above threshold but below 100% is not a pass;
every survivor is an open question.

---

## 12. Performance and resilience testing

### Performance

**No numeric backend gate without a real throughput SLA** — a synthetic load
number against a low-traffic app measures the hosting tier. Instead: a new
filtering or sorting query names its index (every branch of an OR'd search
needs its own — one gap collapses the query to a sequential scan); bulk
operations are set-based; large reads page around PostgREST's row cap. Inspect
the plan for any new hot query **as the role the app uses** — an index the
planner chooses as `postgres` may be unreachable under RLS when the operator is
not leakproof.

**The frontend side benefits from a numeric gate** (Lighthouse CI): against the
production build, never a dev server; a few representative states (signed out,
and signed in via an anonymous or demo session); gate on performance, and
assert accessibility at a perfect score as a second lens on §9's tooling;
median of several runs; **thresholds from a measured baseline with margin**,
never the tool's defaults or the exact measured value. When a measurement reveals something worth understanding (a
first-run layout shift a real session never sees), write down why the threshold
sits where it does.

### Resilience

Failure injection at unit level, through fakes the modules already accept: a
batched operation's failed sub-call and its retry/skip; a bulk import's missing
input, exhausted retries, partial multi-write failure, and cancellation; a
bounded pool's first-rejection-stops-pickup; delete ordering, verified and never
silently reversed. Injecting into the real stack is rarely worth it once these
branches are reachable with a fake.

### Destructive scheduled jobs — the highest-risk logic in the system

A scheduled job holding `service_role` and doing irreversible bulk deletes (a
storage-orphan sweep) is more security-critical than most RLS policies: silent,
irreversible, live data. Three cheap mitigations, always: **review its query
like a schema change**; **a dry-run mode that lists what it would delete and
exits before fetching any elevated credential**, defaulted on for manual runs;
and **a grace period** between "looks orphaned" and "eligible" long enough that
a slow or partial write can never fall inside it — the invariant a future edit
is most likely to shrink while "simplifying."

Three lessons for the query itself:

- **Match every derived artifact.** If one record produces more than one object
  (full-size plus thumbnail), matching only the primary path classifies every
  secondary object as orphaned. A plausible first draft does this; only running
  the predicate against real data catches it.
- **Never cast an untrusted identifier into a typed column inside the query.**
  A failed cast aborts the entire query rather than not matching.
- **Ask "does anything still reference this object," not a proxy** like "does a
  record with this parsed-out id exist." A proxy keeps an object merely sharing
  an id with something unrelated, and never finds one whose owning row's insert
  failed after the bytes were written.

---

## 13. CI/CD execution strategy

1. **Fast hygiene first** — file hygiene, secrets, formatting gate everything
   else, so a bad config fails before minutes are spent on browsers and
   databases.
2. **Path-filter heavy jobs on PRs.** A job skipped by its own condition
   reports as passing and never weakens branch protection.
3. **Full, unconditional set on the branch that deploys**, whatever the push
   touched.
4. **Deploy pipeline fails safe**: migrate, reload the PostgREST schema cache,
   build, deploy, smoke-test — each depending on the last, so a rejected
   migration leaves the previous bundle serving the previous schema.
5. **Retry only the deploy-target smoke test.** Everywhere else `retries: 0`.
6. **No staging means a heavier PR gate**: the full authorization and
   integration suite on every relevant PR, not nightly.
7. **Pin one Supabase CLI version** for CI's local stack and the unattended
   `db push`, through a shared action, so migrations are exercised by the CLI
   that applies them.

**Scheduled jobs:** a destructive sweep (dry-run by default, §12); a keep-alive
(a mitigation, not a test); dependency updates — auto-merge patch-level
dev-only bumps at most. A dev dependency reaches the CI runner; a runtime one
reaches every user's browser. That asymmetry is a security control.

---

## 14. Quality gates

Every gate needs a stated reason; a gate without one gets loosened the first
time it is inconvenient.

| Gate | Guidance |
| --- | --- |
| Coverage floor | A **floor** set from what the suite achieves, with margin — not a target. Raised by hand. One floor per browser suite, since signed-in and signed-out reach very different amounts of the app. |
| Auto-ratcheting coverage | **No.** It makes a green local run produce a red PR. |
| Mutation score | A break threshold just below the measured score, so one new equivalent mutant can't block unrelated work. Survivors above it remain open questions. |
| Any threshold | **Never lowered** to pass a build. Redesign, or raise the question. |
| Gate scope | A gate is required when the diff touches its inputs. Comments, docs and file moves produce no new mutant, bundle or policy, so the gates that read those inputs are not required for such a change; CI's path filter is the executable form of the same rule. |
| Test pass rate | 100%, `retries: 0` except the deploy-target smoke test. |
| Authorization | A policy, grant, or trigger change ships its case in the same change (§7). |
| Schema contract | Generated-types diff clean. |
| Deployment | Post-deploy smoke green against the **live** origin. |
| Performance | No backend gate without an SLA; a frontend budget from a measured baseline (§12). |
| Static analysis | Block on real findings, surface the rest (§6). |
| Suppressions | Only with the reason written at the suppression, after understanding the failure. |
| New UI | An E2E case for the journey, component coverage for field detail. |
| New behavior | A unit test; authorization behavior additionally §7. |

---

## 15. Test anti-patterns

Each of these passes silently or looks like flake when it is a defect.

1. A client-side check as an authorization test.
2. Mocking the Supabase client and calling it an integration test.
3. Seeding fixtures as `service_role`.
4. Testing the row and assuming the storage object.
5. Two parallel writing specs sharing one seeded resource.
6. Probe rows or objects left behind on a failed assertion.
7. A signed-in test in the suite that runs against production.
8. Retries or sleeps to paper over a flake.
9. Pure logic re-tested through the browser.
10. A threshold lowered, or a suppression added, to get to green.
11. A test written to touch a line, a branch added to dodge a mutant, a file
    excluded to avoid dealing with it.
12. Mutation scope widened to the rendering layer.
13. A test for a behavior the platform has already ruled out (deleting from
    `storage.objects` in SQL, DDL on a table the project does not own).
14. Any test, migration, or destructive operation against the hosted project.
15. A truthiness check on an error object instead of its code or status.
16. An E2E case for a field-level detail.
17. An element located by CSS class, DOM position, or the text the test then
    asserts.

---

## 16. Adapting and maintaining this playbook

**Copying into a new project:** fill §2's table and boundaries; build §4's
risk table with real tables, roles, and operations; fill §5's ownership table
once real modules exist; pick §6's four static-analysis tools and §11's
mutation scope; record §9's default locator strategy; measure §12 and §14's
thresholds — never carry another project's numbers. The instantiation goes in
the project's own docs (architecture, design decisions, CI config, pre-merge
checklist), never into a copy of this file.

**Update it when:** a server-side execution surface appears (invalidates §0); a
new trust boundary appears (another role, grant shape, data source, or a
previously ruled-out capability); a §5 verdict changes (record the reasoning);
a gate moves (a changed number is a changed justification); a named gap closes
(delete it); or an incident happens — add it to the risk model and name the
level that should have caught it.

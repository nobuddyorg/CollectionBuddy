// #742: after a deploy the worker serves the old HTML whose lazy chunks are gone; run via sw-deploy.sh, which swaps A for B on PROOF_PHASE1_DONE.
import { browser } from 'k6/browser';
import { check, sleep } from 'k6';
import http from 'k6/http';
import { Counter, Rate, Trend } from 'k6/metrics';

import { clearAccount } from '../../lib/seed.js';
import { insertEntries, newCategory, seedOrClear } from '../lib/fixtures.js';
import { PROOF_TREND_STATS, measured, proofSummary } from '../lib/report.js';
import {
  APP_URL,
  browserScenario,
  openAsDemoUser,
  reloadCatalogue,
} from './lib/app.js';

// Build B changes only ItemForm (sw-deploy.sh), so New entry is the one lazy screen whose chunk the deploy removes.
const LAZY_BUTTON = 'new-entry';
const LAZY_READY = '[data-testid="item-title"]';
const DEPLOY_TIMEOUT_SECONDS = 15 * 60;
// Long enough for a fix that recovers with one guarded reload and a second click.
const OPEN_BUDGET_MS = 20000;

const chunk404s = new Counter('stale_chunk_404s');
const lazyOpened = new Rate('lazy_screen_opened_after_deploy');
const cacheEntries = new Trend('sw_cache_entries');

export const options = {
  summaryTrendStats: PROOF_TREND_STATS,
  scenarios: { deploy: browserScenario({ maxDuration: '30m' }) },
  thresholds: {
    // The verdict: New entry opens on the first visit after a deploy, however the fix gets there.
    lazy_screen_opened_after_deploy: ['rate>0.99'],
    // For the record: a reload-on-ChunkLoadError fix still meets the 404 once.
    stale_chunk_404s: [],
    'sw_cache_entries{phase:build_a}': [],
    'sw_cache_entries{phase:build_b}': [],
    proof_measured: ['count>0'],
    checks: ['rate==1'],
  },
};

function countCacheEntries(page) {
  return page.evaluate(async () => {
    let total = 0;
    for (const name of await caches.keys())
      total += (await (await caches.open(name)).keys()).length;
    return total;
  });
}

/** Polls the server directly (k6 HTTP, no service worker) until the HTML it serves changes. */
function waitForDeploy(before) {
  for (let waited = 0; waited < DEPLOY_TIMEOUT_SECONDS; waited += 2) {
    if (http.get(APP_URL, { tags: { name: 'deploy poll' } }).body !== before)
      return true;
    sleep(2);
  }
  return false;
}

/** Whether `selector` becomes visible within `timeoutMs` (never throws). */
async function visibleBefore(page, selector, timeoutMs) {
  if (timeoutMs <= 0) return false;
  try {
    await page
      .locator(selector)
      .waitFor({ state: 'visible', timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}

export default async function firstVisitAfterDeploy() {
  const page = await browser.newPage();
  const missing = [];
  page.on('response', (response) => {
    if (response.status() === 404 && response.url().includes('/_next/static/'))
      missing.push(response.url());
  });
  let session;
  try {
    // Build A: sign in, let the worker take control, and let it cache A's HTML. New entry is never hovered or opened.
    session = await openAsDemoUser(page);
    seedOrClear([session], () =>
      insertEntries({
        session,
        categoryId: newCategory(session, 'Proof: deploy'),
        count: 3,
        fields: (n) => ({
          title: `Eintrag ${n}`,
          description: 'for dem Deploy',
          place: 'Rom',
          tags: ['sw'],
        }),
      }),
    );
    await page.waitForFunction(
      () => Boolean(navigator.serviceWorker.controller),
      { timeout: 30000 },
    );
    await reloadCatalogue(page);
    await reloadCatalogue(page);
    cacheEntries.add(await countCacheEntries(page), { phase: 'build_a' });
    const buildA = http.get(APP_URL, { tags: { name: 'deploy poll' } }).body;
    console.info('PROOF_PHASE1_DONE');

    const deployed = waitForDeploy(buildA);
    check(deployed, { 'build B was deployed': (value) => value === true });
    if (!deployed)
      throw new Error(
        'build B never appeared; is sw-deploy.sh swapping the served directory?',
      );

    // First visit after the deploy: the worker answers with A's cached HTML; A's lazy chunk is no longer served.
    await page.goto(APP_URL, { waitUntil: 'networkidle' });
    await page
      .getByTestId(LAZY_BUTTON)
      .waitFor({ state: 'visible', timeout: 30000 });
    const deadline = Date.now() + OPEN_BUDGET_MS;
    await page.getByTestId(LAZY_BUTTON).click();
    let opened = await visibleBefore(
      page,
      LAZY_READY,
      Math.min(8000, OPEN_BUDGET_MS),
    );
    if (!opened) {
      // A fix may recover by reloading once; then the button is back and a second click has to work.
      const again = await visibleBefore(
        page,
        `[data-testid="${LAZY_BUTTON}"]`,
        deadline - Date.now(),
      );
      if (again) {
        await page.getByTestId(LAZY_BUTTON).click();
        opened = await visibleBefore(page, LAZY_READY, deadline - Date.now());
      }
    }
    lazyOpened.add(opened);
    chunk404s.add(missing.length);
    console.info(
      `${LAZY_BUTTON} after deploy: ${opened ? 'opened' : 'did not open'}; 404s: ${missing.join(', ') || 'none'}`,
    );

    // The cache after a second visit on B: A's hashed files are never evicted.
    await reloadCatalogue(page);
    await reloadCatalogue(page);
    cacheEntries.add(await countCacheEntries(page), { phase: 'build_b' });
    measured.add(1);
  } finally {
    await page.close();
    if (session) clearAccount(session);
  }
}

export function handleSummary(data) {
  return proofSummary({
    proof: 'sw-deploy',
    issue: 742,
    claim:
      "after a deploy the service worker serves the previous build's HTML; its never-opened New entry chunk is gone from the server, so New entry does not open on the first visit.",
    notes: [
      "Two real builds (sw-deploy.sh): B differs from A by one ItemForm attribute, so only ItemForm's chunk name moves.",
      '`stale_chunk_404s` is for the record; a reload-on-ChunkLoadError fix meets the 404 once and still opens the form.',
    ],
    metrics: [
      'lazy_screen_opened_after_deploy',
      'stale_chunk_404s',
      'sw_cache_entries{phase:build_a}',
      'sw_cache_entries{phase:build_b}',
    ],
    data,
  });
}

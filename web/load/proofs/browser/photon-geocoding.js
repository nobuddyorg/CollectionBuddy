// #778: map geocoding waits after its final attempt, never aborts in-flight Photon requests, bursts them, and viewers send write-backs RLS turns into no-ops.
import { browser } from 'k6/browser';
import { check } from 'k6';
import http from 'k6/http';
import { Counter, Trend } from 'k6/metrics';

import { insertRows } from '../../lib/api.js';
import { expectOk } from '../../lib/http.js';
import { clearAccount } from '../../lib/seed.js';
import { ANON_KEY, SUPABASE_URL } from '../../lib/target.js';
import {
  call,
  inList,
  insertEntries,
  newCategory,
  newCollector,
  seedOrClear,
} from '../lib/fixtures.js';
import { PROOF_TREND_STATS, measured, proofSummary } from '../lib/report.js';
import { browserScenario, openAsDemoUser, reloadCatalogue } from './lib/app.js';
import {
  SLOW_RESPONSE_MS,
  WATCH_LOADING_BADGE,
  closeMap,
  fakePhoton,
  openMap,
  settle,
} from './lib/photon.js';

// usePlaces.tsx GEOCODE_CONCURRENCY.
const WORKERS = 3;
const PLACES = 12;
const VIEWER_PLACES = 5;

const waitAfterFinal = new Trend('photon_wait_after_final_attempt_ms', true);
const completedAfterClose = new Counter('photon_completed_after_close');
const sustainedPeak = new Trend(
  'photon_peak_starts_per_second_after_first_burst',
);
const viewerWriteBacks = new Counter('viewer_write_backs_sent');
const phasesMeasured = new Counter('photon_phases_measured');

export const options = {
  summaryTrendStats: PROOF_TREND_STATS,
  scenarios: { map: browserScenario() },
  thresholds: {
    // Once the third attempt has failed there is nothing left to wait for: the badge should go within a round trip.
    photon_wait_after_final_attempt_ms: ['max<250'],
    // Closing the map should abort what it started.
    photon_completed_after_close: ['count<1'],
    // After the first GEOCODE_CONCURRENCY requests, a gap or token bucket should hold starts to 3 per second.
    photon_peak_starts_per_second_after_first_burst: ['max<=3'],
    // A read-only category should not send write-backs at all.
    viewer_write_backs_sent: ['count<1'],
    // Guards: a phase that never ran leaves its metric empty, and empty metrics pass.
    photon_phases_measured: ['count>=4'],
    proof_measured: ['count>0'],
    checks: ['rate==1'],
  },
};

async function ownerMap() {
  const context = await browser.newContext();
  await context.addInitScript(WATCH_LOADING_BADGE);
  const page = await context.newPage();
  const mode = { current: 'throttled' };
  const { requests, outcomes } = await fakePhoton(page, mode);
  let session;
  try {
    session = await openAsDemoUser(page);
    insertEntries({
      session,
      categoryId: newCategory(session, 'Proof: Photon'),
      count: PLACES,
      // Unlocated, hand-typed find spots: every one needs a geocode.
      fields: (n) => ({
        title: `Fund ${n}`,
        description: 'ohne Koordinaten',
        place: `Fundstelle ${n}`,
        tags: ['boden'],
      }),
    });
    await reloadCatalogue(page);

    // Throttled: every attempt answers 503, so every place fails after three attempts and the map ends in its error state.
    await openMap(page);
    await settle(page, requests);
    const timing = await page.evaluate(() => {
      const photon = performance
        .getEntriesByType('resource')
        .filter((entry) => new URL(entry.name).hostname === 'photon.komoot.io');
      return {
        gone: window.__proofBadgeGone.at(-1),
        lastEnd: Math.max(...photon.map((entry) => entry.responseEnd)),
      };
    });
    const throttled = requests.filter(
      (request) => request.mode === 'throttled',
    );
    check(timing, {
      // A circuit breaker may stop early (the issue suggests one); more than three tries per place never.
      'the throttled phase ran and never retried more than three times': () =>
        throttled.length >= WORKERS && throttled.length <= PLACES * 3,
      'the loading badge went away': (value) =>
        typeof value.gone === 'number' && Number.isFinite(value.lastEnd),
    });
    console.info(`throttled phase sent ${throttled.length} Photon requests`);
    if (typeof timing.gone === 'number')
      waitAfterFinal.add(timing.gone - timing.lastEnd);
    phasesMeasured.add(1);
    await closeMap(page);

    // Slow: answers take 3 s; close the map while the first requests are in flight.
    mode.current = 'slow';
    const slowFrom = requests.length;
    await openMap(page);
    for (
      let waited = 0;
      requests.length - slowFrom < WORKERS && waited < 5000;
      waited += 100
    )
      await page.waitForTimeout(100);
    await closeMap(page);
    const inFlight = requests.slice(slowFrom).map((request) => request.url);
    check(inFlight, {
      'three requests were in flight at close': (urls) =>
        urls.length === WORKERS,
    });
    await page.waitForTimeout(SLOW_RESPONSE_MS + 3000);
    for (const url of inFlight)
      if (outcomes.get(url) === 'completed') completedAfterClose.add(1);
    console.info(
      `closed with ${inFlight.length} Photon requests in flight: ${inFlight.map((url) => outcomes.get(url) ?? 'pending').join(', ')}`,
    );
    phasesMeasured.add(1);
    await settle(page, requests);

    // OK: instant answers; after the first burst of three, how many start in the busiest second.
    mode.current = 'ok';
    const okFrom = requests.length;
    await openMap(page);
    await settle(page, requests);
    check(requests.slice(okFrom), {
      'every place was geocoded once, none retried': (list) =>
        list.length === PLACES,
    });
    // Start times on the page's own clock; a 950 ms window leaves a 3/s token bucket (333 ms apart) a margin.
    const okTimes = await page.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .filter(
          (entry) =>
            new URL(entry.name).hostname === 'photon.komoot.io' &&
            entry.startTime >= window.__proofOpenedAt,
        )
        .map((entry) => entry.startTime)
        .sort((a, b) => a - b),
    );
    const peak = Math.max(
      0,
      ...okTimes
        .slice(WORKERS)
        .map(
          (start) =>
            okTimes.filter((at) => at >= start && at < start + 950).length,
        ),
    );
    sustainedPeak.add(peak);
    phasesMeasured.add(1);
  } finally {
    await page.close();
    await context.close();
    if (session) clearAccount(session);
  }
}

/** A real viewer of a shared category opens its map in the app; every PATCH to items it sends is a write-back RLS will ignore. */
async function viewerMap() {
  const owner = newCollector('photon-owner');
  const email = `proof-photon-viewer-${Date.now()}@collectionbuddy.test`;
  const signup = expectOk(
    http.post(
      `${SUPABASE_URL}/auth/v1/signup`,
      JSON.stringify({ email, password: crypto.randomUUID() }),
      {
        headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
        tags: { name: 'viewer signup' },
      },
    ),
    `signing up ${email}`,
  );
  // A local stack confirms sign-ups at once and answers with the whole session supabase-js stores.
  const readerSession = signup.json();
  const reader = {
    token: readerSession.access_token,
    userId: readerSession.user.id,
    email,
  };
  const ids = seedOrClear([owner], () => {
    const categoryId = newCategory(owner, 'Proof: shared places');
    const seeded = insertEntries({
      session: owner,
      categoryId,
      count: VIEWER_PLACES,
      fields: (n) => ({
        title: `Fund ${n}`,
        description: 'geteilt',
        place: `Geteilte Fundstelle ${n}`,
        tags: ['boden'],
      }),
    });
    insertRows({
      session: owner,
      table: 'category_shares',
      rows: [{ category_id: categoryId, invited_email: email, role: 'viewer' }],
    });
    return seeded;
  });

  let context;
  let page;
  try {
    context = await browser.newContext();
    page = await context.newPage();
    const { requests } = await fakePhoton(page, { current: 'ok' });
    const patches = [];
    page.on('request', (request) => {
      if (
        request.method() === 'PATCH' &&
        /\/rest\/v1\/items/.test(request.url())
      )
        patches.push(request.url());
    });
    const demo = await openAsDemoUser(page);
    await page.evaluate(
      ([key, value]) => localStorage.setItem(key, value),
      [demo.storageKey, JSON.stringify(readerSession)],
    );
    await reloadCatalogue(page);
    await openMap(page);
    await settle(page, requests);
    check(requests, {
      "the viewer's map geocoded the shared places": (list) =>
        list.length >= VIEWER_PLACES,
    });
    viewerWriteBacks.add(patches.length);

    // For the record: what RLS answers such a write-back, and that nothing changed.
    const answer = call({
      method: 'PATCH',
      path: `/rest/v1/items?id=${inList(ids)}`,
      session: reader,
      body: JSON.stringify({ place_lat: 49.75, place_lng: 6.64 }),
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      probe: 'viewer_write_back',
    });
    console.info(
      `viewer map sent ${patches.length} write-backs; RLS answers one with HTTP ${answer.status} and ${answer.status === 200 ? answer.json().length : '?'} rows`,
    );
    phasesMeasured.add(1);
  } finally {
    if (page) await page.close();
    if (context) await context.close();
    clearAccount(owner);
  }
}

export default async function ownerThenViewerMap() {
  await ownerMap();
  await viewerMap();
  measured.add(1);
}

export function handleSummary(data) {
  return proofSummary({
    proof: 'photon-geocoding',
    issue: 778,
    claim:
      'map geocoding waits ~2 s after its final attempt, lets in-flight Photon requests finish after the map closes, starts requests without pacing, and sends write-backs from read-only viewers that RLS turns into no-ops.',
    notes: [
      'Photon is faked with page.route (with CORS), so nothing reaches photon.komoot.io.',
      'Wait after the final attempt is measured in-page: loading badge gone minus the last Photon responseEnd.',
    ],
    metrics: [
      'photon_wait_after_final_attempt_ms',
      'photon_completed_after_close',
      'photon_peak_starts_per_second_after_first_burst',
      'viewer_write_backs_sent',
    ],
    guards: ['photon_phases_measured'],
    data,
  });
}

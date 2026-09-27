// #771: the CSP blocks browser-image-compression's worker from importScripts on cdn.jsdelivr.net, so every compression worker fails.
import { browser } from 'k6/browser';
import { check } from 'k6';
import encoding from 'k6/encoding';
import { Counter, Trend } from 'k6/metrics';

import { clearAccount } from '../../lib/seed.js';
import { insertEntries, newCategory, seedOrClear } from '../lib/fixtures.js';
import { PROOF_TREND_STATS, measured, proofSummary } from '../lib/report.js';
import {
  browserScenario,
  longTasks,
  openAsDemoUser,
  reloadCatalogue,
  watchLongTasks,
} from './lib/app.js';

// A 12 MP phone-sized photo, so compressing it costs what a real upload costs.
const PHOTO = encoding.b64encode(open('../fixtures/camera-12mp.jpeg', 'b'));

/** Counts compression workers that report failure: the library posts {error} when importScripts is refused, then falls back to the main thread. */
const COUNT_WORKER_FAILURES = `
  window.__proofWorkerFailures = 0;
  const NativeWorker = window.Worker;
  window.Worker = class extends NativeWorker {
    constructor(...args) {
      super(...args);
      this.addEventListener('message', (event) => { if (event.data && event.data.error) window.__proofWorkerFailures++; });
      this.addEventListener('error', () => { window.__proofWorkerFailures++; });
    }
  };
`;

const workerFailures = new Counter('compression_worker_failures');
const longestTask = new Trend('main_thread_longest_task_ms', true);
const blockedTime = new Trend('main_thread_long_task_total_ms', true);

export const options = {
  summaryTrendStats: PROOF_TREND_STATS,
  scenarios: { upload: browserScenario() },
  thresholds: {
    // Two today (full size and thumbnail). Zero once the library loads from the page's origin, or once useWebWorker is off.
    compression_worker_failures: ['count<1'],
    // The cost, for the record: headless desktop Chromium may compress fast enough that no task is long.
    main_thread_longest_task_ms: [],
    main_thread_long_task_total_ms: [],
    proof_measured: ['count>0'],
    checks: ['rate==1'],
  },
};

export default async function uploadCameraPhoto() {
  const context = await browser.newContext();
  await context.addInitScript(COUNT_WORKER_FAILURES);
  const page = await context.newPage();
  let session;
  try {
    session = await openAsDemoUser(page);
    seedOrClear([session], () =>
      insertEntries({
        session,
        categoryId: newCategory(session, 'Proof: worker'),
        count: 1,
        fields: () => ({
          title: 'Kamera',
          description: 'Bild aus der Kamera',
          place: 'Rom',
          tags: ['kamera'],
        }),
      }),
    );
    await reloadCatalogue(page);

    await watchLongTasks(page);
    // The images row is written after both uploads; waiting for it keeps teardown from orphaning the objects.
    // The insert's own POST: a URL match alone would catch the cross-origin CORS preflight first.
    const recorded = page.waitForEvent('response', {
      predicate: (response) =>
        response.request().method() === 'POST' &&
        /\/rest\/v1\/images\?select=/.test(response.url()),
      timeout: 120000,
    });
    await page.setInputFiles('[data-testid="upload-photo"]', {
      name: 'camera.jpeg',
      mimetype: 'image/jpeg',
      buffer: PHOTO,
    });
    check(await recorded, {
      'the photo was compressed, uploaded and recorded': (response) =>
        response.ok(),
    });

    const failures = await page.evaluate(() => window.__proofWorkerFailures);
    workerFailures.add(failures);
    const tasks = await longTasks(page);
    longestTask.add(tasks.length ? Math.max(...tasks) : 0);
    blockedTime.add(tasks.reduce((sum, duration) => sum + duration, 0));
    console.info(
      `compression workers failed: ${failures}; long tasks: ${JSON.stringify(tasks.map(Math.round))}`,
    );
    measured.add(1);
  } finally {
    await page.close();
    await context.close();
    if (session) clearAccount(session);
  }
}

export function handleSummary(data) {
  return proofSummary({
    proof: 'worker-csp',
    issue: 771,
    claim:
      "the CSP refuses browser-image-compression's worker its importScripts from cdn.jsdelivr.net, so every compression worker fails and the work falls back to the main thread.",
    notes: [
      'Input: a 12 MP JPEG (an upscale; pixel count is what drives compression CPU).',
      'Long tasks are for the record: headless desktop Chromium may compress fast enough that none is long.',
    ],
    metrics: [
      'compression_worker_failures',
      'main_thread_longest_task_ms',
      'main_thread_long_task_total_ms',
    ],
    data,
  });
}

// #771: a CSP whose worker-src refuses the compression worker fails every compression worker.
import { browser } from 'k6/browser';
import { check } from 'k6';
import encoding from 'k6/encoding';
import { Counter, Trend } from 'k6/metrics';

import { clearAccount } from '../../lib/seed.js';
import { insertEntries, newCategory } from '../lib/fixtures.js';
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

/** Counts what the compression workers post back: {blob} for a compressed photo; {error}, or an error event, for a failure. */
const COUNT_WORKER_ANSWERS = `
  window.__proofCompression = { photos: 0, failures: 0 };
  const NativeWorker = window.Worker;
  window.Worker = class extends NativeWorker {
    constructor(...args) {
      super(...args);
      this.addEventListener('message', (event) => {
        if (event.data && event.data.blob) window.__proofCompression.photos++;
        if (event.data && event.data.error) window.__proofCompression.failures++;
      });
      this.addEventListener('error', () => { window.__proofCompression.failures++; });
    }
  };
`;

const workerFailures = new Counter('compression_worker_failures');
const workerPhotos = new Counter('compression_worker_photos');
const longestTask = new Trend('main_thread_longest_task_ms', true);
const blockedTime = new Trend('main_thread_long_task_total_ms', true);

export const options = {
  summaryTrendStats: PROOF_TREND_STATS,
  scenarios: { upload: browserScenario() },
  thresholds: {
    // A failed worker fails the upload; nothing falls back to the main thread.
    compression_worker_failures: ['count<1'],
    // The full size and the thumbnail; fewer means the work ran on the main thread, or not at all.
    compression_worker_photos: ['count==2'],
    // The cost, for the record: headless desktop Chromium may compress fast enough that no task is long.
    main_thread_longest_task_ms: [],
    main_thread_long_task_total_ms: [],
    proof_measured: ['count>0'],
    checks: ['rate==1'],
  },
};

export default async function uploadCameraPhoto() {
  const context = await browser.newContext();
  await context.addInitScript(COUNT_WORKER_ANSWERS);
  const page = await context.newPage();
  let session;
  try {
    session = await openAsDemoUser(page);
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
    });
    await reloadCatalogue(page);

    await watchLongTasks(page);
    // The images POST follows both uploads (teardown then orphans nothing); matching its method skips the CORS preflight. A failed worker means no POST.
    const recorded = page
      .waitForEvent('response', {
        predicate: (response) =>
          response.request().method() === 'POST' &&
          /\/rest\/v1\/images\?select=/.test(response.url()),
        timeout: 120000,
      })
      .catch(() => null);
    await page.setInputFiles('[data-testid="upload-photo"]', {
      name: 'camera.jpeg',
      mimetype: 'image/jpeg',
      buffer: PHOTO,
    });
    const response = await recorded;

    const { photos, failures } = await page.evaluate(
      () => window.__proofCompression,
    );
    workerFailures.add(failures);
    workerPhotos.add(photos);
    // A failure is the verdict, not a broken run: the upload it stops is the defect itself.
    if (failures === 0) {
      check(response, {
        'the photo was compressed, uploaded and recorded': (recordedPost) =>
          recordedPost !== null && recordedPost.ok(),
      });
    }
    const tasks = await longTasks(page);
    longestTask.add(tasks.length ? Math.max(...tasks) : 0);
    blockedTime.add(tasks.reduce((sum, duration) => sum + duration, 0));
    console.info(
      `compression workers answered with ${photos} photos and ${failures} failures; long tasks: ${JSON.stringify(tasks.map(Math.round))}`,
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
      'a CSP whose worker-src refuses the compression worker fails every compression worker, and the upload with it.',
    notes: [
      'Input: a 12 MP JPEG (an upscale; pixel count is what drives compression CPU).',
      'Long tasks are for the record: headless desktop Chromium may compress fast enough that none is long.',
    ],
    metrics: [
      'compression_worker_failures',
      'compression_worker_photos',
      'main_thread_longest_task_ms',
      'main_thread_long_task_total_ms',
    ],
    data,
  });
}

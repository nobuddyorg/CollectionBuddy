// #755: import reads and decodes the whole archive twice and copies every entry; import-memory.sh samples the renderer's RSS between the markers this prints.
import { browser } from 'k6/browser';
import { check } from 'k6';
import encoding from 'k6/encoding';
import { Trend } from 'k6/metrics';

import { clearAccount } from '../../lib/seed.js';
import {
  attachPhotos,
  envInt,
  insertEntries,
  newCategory,
  seedOrClear,
} from '../lib/fixtures.js';
import { PROOF_TREND_STATS, measured, proofSummary } from '../lib/report.js';
import { browserScenario, openAsDemoUser, reloadCatalogue } from './lib/app.js';

// ~1 MB of high-entropy JPEG at 1024x768: bulky in the archive, ~3 MB per thumbnail decode, so decoding cannot pass for archive copies.
const PHOTO = open('../fixtures/archive-photo.jpeg', 'b');
// A 1x1 WebP: the export carries only full sizes, so seeded thumbnails need not weigh on the quota.
const THUMB = encoding.b64decode(
  'UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA',
  'std',
);
const ARCHIVE_MB = envInt('PROOF_ARCHIVE_MB', 100);
const PHOTOS = Math.ceil((ARCHIVE_MB * 1024 * 1024) / PHOTO.byteLength);
// Seeded photos plus imported copies and their thumbnails share one owner's 256 MiB photo quota; past this the import is refused part-way.
if (ARCHIVE_MB > 100) {
  throw new Error(
    'PROOF_ARCHIVE_MB above 100 overflows the 256 MiB photo quota (seeded plus imported copies)',
  );
}
const ARCHIVE_NAME = 'Proof: archive';

const importSeconds = new Trend('import_seconds');
const heapPeak = new Trend('import_js_heap_peak_bytes');

export const options = {
  summaryTrendStats: PROOF_TREND_STATS,
  scenarios: { roundTrip: browserScenario({ maxDuration: '45m' }) },
  thresholds: {
    import_seconds: [],
    import_js_heap_peak_bytes: [],
    proof_measured: ['count>0'],
    checks: ['rate==1'],
  },
};

/** Keeps the export's Blob when downloadBlob hands it to createObjectURL, so the import can reuse it without a download. */
const CAPTURE_ARCHIVE = `
  const create = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (object) => {
    // zip.ts builds the archive as an untyped Blob; photographs and workers always carry a type.
    if (object instanceof Blob && object.type === '') window.__proofArchive = object;
    return create(object);
  };
`;

export default async function importOwnExport() {
  const context = await browser.newContext();
  await context.addInitScript(CAPTURE_ARCHIVE);
  const page = await context.newPage();
  let session;
  try {
    session = await openAsDemoUser(page);
    seedOrClear([session], () => {
      const itemIds = insertEntries({
        session,
        categoryId: newCategory(session, ARCHIVE_NAME),
        count: PHOTOS,
        fields: (n) => ({
          title: `Aufnahme ${n}`,
          description: 'Seeded for the import proof',
          place: 'Prag',
          tags: ['proof'],
        }),
      });
      attachPhotos({
        session,
        itemIds,
        photosEach: 1,
        bytes: PHOTO,
        thumbBytes: THUMB,
      });
    });
    await reloadCatalogue(page);

    const expand = page.getByTestId('expand-categories');
    if (await expand.isVisible()) await expand.click();
    await page.getByTestId('export-category').click();
    await page.waitForFunction(() => window.__proofArchive instanceof Blob, {
      timeout: 30 * 60000,
      polling: 1000,
    });
    const archiveBytes = await page.evaluate(() => window.__proofArchive.size);

    // Settle, collect what export left behind (needs K6_BROWSER_ARGS=js-flags=--expose-gc), then mark the baseline.
    await page.waitForTimeout(5000);
    await page.evaluate(() => window.gc?.());
    await page.waitForTimeout(2000);
    await page.evaluate(() => {
      window.__proofHeapPeak = 0;
      window.__proofHeapTimer = setInterval(() => {
        window.__proofHeapPeak = Math.max(
          window.__proofHeapPeak,
          performance.memory?.usedJSHeapSize ?? 0,
        );
      }, 100);
    });
    console.info(`PROOF_IMPORT_START ${archiveBytes}`);
    // import-memory.sh polls every 100 ms; this pause lets it take the baseline before the import reads anything.
    await page.waitForTimeout(1500);
    const started = Date.now();

    await page.evaluate(() => {
      const input = document.querySelector('[data-testid="import-file-input"]');
      const files = new DataTransfer();
      files.items.add(
        new File([window.__proofArchive], 'export.zip', {
          type: 'application/zip',
        }),
      );
      input.files = files.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    // On success the app selects the imported copy, named as data/categories.ts uniqueCategoryName names a duplicate.
    await page.waitForFunction(
      (name) =>
        document
          .querySelector('[data-testid="selected-category"]')
          ?.textContent?.trim() === name,
      { timeout: 30 * 60000, polling: 250 },
      `${ARCHIVE_NAME} (2)`,
    );
    console.info('PROOF_IMPORT_END');

    importSeconds.add((Date.now() - started) / 1000);
    heapPeak.add(
      await page.evaluate(() => {
        clearInterval(window.__proofHeapTimer);
        return window.__proofHeapPeak;
      }),
    );
    check(archiveBytes, {
      'the archive reached the requested size': (bytes) =>
        bytes >= ARCHIVE_MB * 1024 * 1024 * 0.9,
    });
    measured.add(1);
  } finally {
    await page.close();
    await context.close();
    if (session) clearAccount(session);
  }
}

export function handleSummary(data) {
  return proofSummary({
    proof: 'import-memory',
    issue: 755,
    claim:
      "import reads and decodes the whole archive twice and copies every entry, so peak memory is 2-3x the archive; the verdict is import-memory.sh's renderer RSS ratio.",
    notes: [
      "The archive is the app's own export of the seeded photographs, handed to the import without a download.",
      '`import_js_heap_peak_bytes` misses ArrayBuffers; the RSS the wrapper samples does not.',
    ],
    metrics: ['import_seconds', 'import_js_heap_peak_bytes'],
    // The verdict is import-memory.sh's RSS ratio, which it appends to this report.
    purpose: 'record',
    data,
  });
}

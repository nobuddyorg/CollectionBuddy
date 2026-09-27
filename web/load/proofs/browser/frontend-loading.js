// #782: export/import/ZIP code rides in the first-paint scripts, intent prefetch warms the wrong chunk, and hero plates always fetch the full size.
import { browser } from 'k6/browser';
import { check } from 'k6';
import { Counter, Trend } from 'k6/metrics';

import { clearAccount } from '../../lib/seed.js';
import {
  attachPhotos,
  insertEntries,
  newCategory,
  seedOrClear,
} from '../lib/fixtures.js';
import { PROOF_TREND_STATS, measured, proofSummary } from '../lib/report.js';
import {
  APP_URL,
  browserScenario,
  openAsDemoUser,
  reloadCatalogue,
} from './lib/app.js';

// String literals the minifier keeps, one per module that should load only on an Export or Import click.
const ON_DEMAND_MARKERS = {
  'data/zip.ts (read)': 'Not a ZIP archive: no end-of-central-directory record',
  'data/zip.ts (write)': 'Archive would exceed 65535 ZIP entries',
  'data/exportCategory.ts': 'Could not sign photograph URLs',
  'data/importPhoto.ts': 'Could not record photograph',
};
// A real 1000 px WebP and its 600 px thumbnail (public-domain sample photo), so the plates have something to fetch.
const PHOTO = open('../fixtures/astronaut.full.webp', 'b');
const THUMB = open('../fixtures/astronaut.thumb.webp', 'b');
// A phone at DPR 1: a srcset would pick the 600 px thumbnail for a ~360 px plate.
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 };

const firstPaintScriptBytes = new Trend('first_paint_script_bytes');
const onDemandInFirstPaint = new Counter('on_demand_modules_in_first_paint');
const chunksAfterPrefetch = new Counter('chunks_fetched_after_prefetch');
const fullSizePlates = new Counter('full_size_plate_loads');

export const options = {
  summaryTrendStats: PROOF_TREND_STATS,
  scenarios: { visit: browserScenario() },
  thresholds: {
    first_paint_script_bytes: [],
    on_demand_modules_in_first_paint: ['count<1'],
    chunks_fetched_after_prefetch: ['count<1'],
    full_size_plate_loads: ['count<1'],
    // Guards: each Counter above reads 0 when its step never ran, so the steps themselves are checked.
    proof_measured: ['count>0'],
    checks: ['rate==1'],
  },
};

function isScript(url) {
  return url.startsWith(APP_URL) && /\.js(\?|$)/.test(url);
}

export default async function firstPaintThenMap() {
  const context = await browser.newContext(PHONE);
  const page = await context.newPage();
  const scripts = [];
  const images = [];
  page.on('response', (response) => {
    const url = response.url();
    if (isScript(url)) scripts.push(response);
    if (/\/storage\/v1\/object\/sign\/item-images\/.+\.webp\?/.test(url))
      images.push(url);
  });

  let session;
  try {
    session = await openAsDemoUser(page);
    seedOrClear([session], () => {
      const itemIds = insertEntries({
        session,
        categoryId: newCategory(session, 'Proof: first paint'),
        count: 9,
        // Located, so opening the map needs no geocode and never reaches photon.komoot.io.
        fields: (n) => ({
          title: `Plakette ${n}`,
          description: 'mit Bild',
          place: 'Wien',
          place_lat: 48.21,
          place_lng: 16.37,
          tags: ['bild'],
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

    // First paint: a fresh load of the seeded catalogue, before any click.
    scripts.length = 0;
    images.length = 0;
    await reloadCatalogue(page);
    await page.waitForTimeout(2000);
    let bytes = 0;
    const bodies = [];
    for (const response of scripts) {
      const body = await response.text();
      bytes += body.length;
      bodies.push(body);
    }
    check(scripts, {
      'first-paint scripts were captured': (list) => list.length > 0,
    });
    firstPaintScriptBytes.add(bytes);
    for (const [module, marker] of Object.entries(ON_DEMAND_MARKERS)) {
      if (bodies.some((body) => body.includes(marker))) {
        onDemandInFirstPaint.add(1);
        console.info(`first paint carries ${module}`);
      }
    }

    // Hero plates: each card's first photograph, fetched through its signed URL.
    check(images, {
      'the plates fetched their photographs': (list) => list.length > 0,
    });
    const full = images.filter((url) => !/\.thumb\.webp\?/.test(url));
    fullSizePlates.add(full.length);
    console.info(
      `plates fetched ${full.length} full-size and ${images.length - full.length} thumbnail images`,
    );

    // Intent prefetch: hover the map button, let it settle, then open the map; anything new was not warmed.
    await page.getByTestId('open-map').hover();
    await page.waitForTimeout(3000);
    const warmed = new Set(scripts.map((response) => response.url()));
    await page.getByTestId('open-map').click();
    await page.waitForTimeout(3000);
    // k6 browser's isVisible() is async, so the answer is awaited before check() sees it.
    const mapOpened = await page.locator('.leaflet-container').isVisible();
    check(mapOpened, { 'the map opened': (visible) => visible === true });
    const late = scripts
      .map((response) => response.url())
      .filter((url) => !warmed.has(url));
    chunksAfterPrefetch.add(late.length);
    if (late.length)
      console.info(`opening the map still fetched: ${late.join(', ')}`);
    measured.add(1);
  } finally {
    await page.close();
    await context.close();
    if (session) clearAccount(session);
  }
}

export function handleSummary(data) {
  return proofSummary({
    proof: 'frontend-loading',
    issue: 782,
    claim:
      'export/import/ZIP code ships in the first-paint scripts, the hover prefetch warms a different chunk than the map loads, and hero plates fetch the full-size image even where the thumbnail suffices.',
    notes: [
      'Phone viewport 390x844 at DPR 1, where a 600w thumbnail covers a ~360 px plate.',
      'On-demand modules are recognised by string literals the minifier keeps.',
    ],
    metrics: [
      'on_demand_modules_in_first_paint',
      'chunks_fetched_after_prefetch',
      'full_size_plate_loads',
      'first_paint_script_bytes',
    ],
    data,
  });
}

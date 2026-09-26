// #738: with Safari's canvas (no WebP encoder) emulated in Chromium, an uploaded photograph is stored as PNG under a .webp name.
import { browser } from 'k6/browser';
import { check } from 'k6';
import encoding from 'k6/encoding';
import { Counter } from 'k6/metrics';

import { clearAccount } from '../../lib/seed.js';
import {
  BUCKET,
  call,
  insertEntries,
  newCategory,
  seedOrClear,
} from '../lib/fixtures.js';
import { PROOF_TREND_STATS, measured, proofSummary } from '../lib/report.js';
import { browserScenario, openAsDemoUser, reloadCatalogue } from './lib/app.js';

const PHOTO = encoding.b64encode(open('../fixtures/source/astronaut.png', 'b'));

// Safari answers an 'image/webp' encode with PNG (MDN browser-compat-data); no Worker keeps compression on this patched main thread.
const EMULATE_SAFARI_CANVAS = `
  const asSafari = (type) => (type === 'image/webp' ? 'image/png' : type);
  const toBlob = HTMLCanvasElement.prototype.toBlob;
  HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) { return toBlob.call(this, callback, asSafari(type), quality); };
  const toDataURL = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL = function (type, quality) { return toDataURL.call(this, asSafari(type), quality); };
  if (typeof OffscreenCanvas !== 'undefined') {
    const convertToBlob = OffscreenCanvas.prototype.convertToBlob;
    OffscreenCanvas.prototype.convertToBlob = function (options = {}) { return convertToBlob.call(this, { ...options, type: asSafari(options.type) }); };
  }
  window.Worker = undefined;
`;

const pngObjects = new Counter('png_objects_stored');
const objectsListed = new Counter('objects_listed');

export const options = {
  summaryTrendStats: PROOF_TREND_STATS,
  scenarios: { upload: browserScenario() },
  thresholds: {
    // Every stored derivative should be WebP, or whatever the fix falls back to, never PNG.
    png_objects_stored: ['count<1'],
    objects_listed: ['count>0'],
    proof_measured: ['count>0'],
    checks: ['rate==1'],
  },
};

function listFolder(session, prefix) {
  const response = call({
    method: 'POST',
    path: `/storage/v1/object/list/${BUCKET}`,
    session,
    body: JSON.stringify({ prefix, limit: 100, offset: 0 }),
    headers: { 'Content-Type': 'application/json' },
    probe: 'list_folder',
  });
  return response.status === 200 ? response.json() : [];
}

export default async function uploadAsSafari() {
  const context = await browser.newContext();
  await context.addInitScript(EMULATE_SAFARI_CANVAS);
  const page = await context.newPage();
  let session;
  try {
    session = await openAsDemoUser(page);
    const [itemId] = seedOrClear([session], () =>
      insertEntries({
        session,
        categoryId: newCategory(session, 'Proof: Safari'),
        count: 1,
        fields: () => ({
          title: 'Astronaut',
          description: 'Safari-Upload',
          place: 'Houston',
          tags: ['photo'],
        }),
      }),
    );
    await reloadCatalogue(page);

    // The images row is written after both uploads, so its response means both objects exist.
    // The insert's own POST: a URL match alone would catch the cross-origin CORS preflight first.
    const recorded = page.waitForEvent('response', {
      predicate: (response) =>
        response.request().method() === 'POST' &&
        /\/rest\/v1\/images\?select=/.test(response.url()),
      timeout: 120000,
    });
    await page.setInputFiles('[data-testid="upload-photo"]', {
      name: 'astronaut.png',
      mimetype: 'image/png',
      buffer: PHOTO,
    });
    check(await recorded, {
      'the photograph was recorded': (response) => response.ok(),
    });

    const objects = listFolder(session, `${session.userId}/${itemId}`);
    objectsListed.add(objects.length);
    for (const object of objects) {
      if (object.metadata?.mimetype === 'image/png') pngObjects.add(1);
      console.info(
        `${object.name}: ${object.metadata?.mimetype} ${object.metadata?.size} B`,
      );
    }
    check(objects, {
      'full size and thumbnail are both stored': (list) => list.length === 2,
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
    proof: 'safari-webp',
    issue: 738,
    claim:
      "with Safari's canvas emulated in Chromium (no WebP encoder; the library on the main thread), an uploaded photograph is stored as PNG under a .webp name.",
    notes: [
      "Emulation: toBlob/toDataURL/convertToBlob answer 'image/webp' with PNG, as Safari does (MDN browser-compat-data); Worker is removed so the patch applies.",
      "Input: astronaut.png (NASA, public domain). The stored MIME types come from Storage's own folder listing.",
    ],
    metrics: ['png_objects_stored', 'objects_listed'],
    guards: ['objects_listed'],
    data,
  });
}

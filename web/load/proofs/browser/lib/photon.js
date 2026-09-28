// The #778 proof's Photon fake and map steps: faked answers per mode, a log of every Photon request, and the loading badge's clock.
import { setTimeout } from 'k6/timers';

const PHOTON = /photon\.komoot\.io\/api/;
export const SLOW_RESPONSE_MS = 3000;
const QUIET_MS = 5000;
// The app fetches Photon cross-origin, so a faked answer without this header is blocked like a network error.
const CORS = { 'Access-Control-Allow-Origin': '*' };
const FEATURE = JSON.stringify({
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [6.64, 49.75] },
      properties: { name: 'Trier' },
    },
  ],
});

/** In-page clock for the map's loading badge, so its end and Photon's resource timings share performance.now(). */
export const WATCH_LOADING_BADGE = `
  performance.setResourceTimingBufferSize(5000);
  window.__proofBadgeGone = [];
  let loading = false;
  new MutationObserver(() => {
    const now = Boolean(document.querySelector('[role="dialog"] [role="status"]'));
    if (loading && !now) window.__proofBadgeGone.push(performance.now());
    loading = now;
  }).observe(document, { childList: true, subtree: true });
`;

function placeOf(url) {
  return decodeURIComponent(/[?&]q=([^&]*)/.exec(url)[1].replace(/\+/g, ' '));
}

export async function openMap(page) {
  await page.evaluate(() => {
    window.__proofBadgeGone = [];
    window.__proofOpenedAt = performance.now();
  });
  await page.getByTestId('open-map').click();
}

export async function closeMap(page) {
  await page.getByTestId('dialog-close').click();
}

/** Waits until no Photon request has started for QUIET_MS. */
export async function settle(page, log) {
  for (let last = log.length; ; last = log.length) {
    await page.waitForTimeout(QUIET_MS);
    if (log.length === last) return;
  }
}

/** Routes Photon to a fake whose behaviour `mode()` picks per request, and logs every request and how it ended. */
export async function fakePhoton(page, mode) {
  const requests = [];
  const outcomes = new Map();
  await page.route(PHOTON, (route) => {
    const answer = (status, body) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        headers: CORS,
        body,
      });
    if (mode.current === 'ok') return answer(200, FEATURE);
    if (mode.current === 'slow') {
      // After an abort the interception is gone; the late fulfill then rejects, which is the fixed behaviour, not an error.
      setTimeout(() => answer(503, '{}').catch(() => {}), SLOW_RESPONSE_MS);
      return undefined;
    }
    return answer(503, '{}');
  });
  page.on('request', (request) => {
    if (PHOTON.test(request.url()))
      requests.push({
        at: Date.now(),
        place: placeOf(request.url()),
        mode: mode.current,
        url: request.url(),
      });
  });
  page.on('response', (response) => {
    if (PHOTON.test(response.url())) outcomes.set(response.url(), 'completed');
  });
  page.on('requestfailed', (request) => {
    if (PHOTON.test(request.url())) outcomes.set(request.url(), 'failed');
  });
  return { requests, outcomes };
}

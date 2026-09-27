// A photographed collection and a Chrome profile signed in as its collector, so the signed-in Lighthouse pass measures the photo grid.
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { rmSync } from 'node:fs';

import { chromium, type BrowserContext, type Page } from '@playwright/test';

import { initCatalogue } from '../e2e/pages/catalogue.ts';
import {
  clearCollection,
  ensureUser,
  mintSession,
  type MintedSession,
} from '../e2e/signed-in/collectors.ts';

const COLLECTOR = {
  email: 'lighthouse@collectionbuddy.test',
  password: 'lighthouse-password-not-a-secret',
};
// The origin lighthouserc.signed-in.json measures: localStorage is per origin, port included.
const PORT = '4173';
const APP_URL = `http://127.0.0.1:${PORT}/CollectionBuddy/`;
const BUCKET = 'item-images';
// A page of nine and a second page; the full size and thumbnail at the widths useItemImages.tsx uploads.
const ENTRY_COUNT = 12;
const FULL_SIZE = { width: 1000, height: 750 };
const THUMB_SIZE = { width: 600, height: 450 };
const PLACES = [
  { place: 'Rom', place_lat: 41.9028, place_lng: 12.4964 },
  { place: 'Wien', place_lat: 48.2082, place_lng: 16.3738 },
  { place: 'Trier', place_lat: 49.7499, place_lng: 6.6371 },
  { place: 'Prag', place_lat: 50.0755, place_lng: 14.4378 },
];

type Photo = { full: Buffer; thumb: Buffer };

/** The `n`th oldest entry; the newest comes first in the grid. */
function entryFields(n: number) {
  return {
    title: `Fundstück ${String(n + 1).padStart(2, '0')}`,
    description:
      'Aus einer Haushaltsauflösung, gereinigt und mit Herkunftsnotiz. '.repeat(
        1 + (n % 3),
      ),
    ...PLACES[n % PLACES.length],
    tags: ['antik', n % 2 ? 'silber' : 'bronze'],
  };
}

/** One to three photographs apiece, so some cards fill their strip. */
function photosFor(n: number) {
  return 1 + (n % 3);
}

/** Photograph-like WebP bytes painted in the page: soft shapes under sensor noise, so they compress like a photo. */
async function paintPhotos(page: Page, count: number): Promise<Photo[]> {
  const encoded = await page.evaluate(
    async ({ count, full, thumb }) => {
      const toBase64 = (blob: Blob) =>
        new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(',')[1]);
          reader.readAsDataURL(blob);
        });
      const paint = (seed: number) => {
        let state = seed;
        const random = () => {
          state = (state * 16807) % 2147483647;
          return state / 2147483647;
        };
        const canvas = new OffscreenCanvas(full.width, full.height);
        const context = canvas.getContext('2d')!;
        const hue = random() * 360;
        const gradient = context.createLinearGradient(0, 0, 0, full.height);
        gradient.addColorStop(0, `hsl(${hue} 35% 70%)`);
        gradient.addColorStop(1, `hsl(${(hue + 40) % 360} 30% 25%)`);
        context.fillStyle = gradient;
        context.fillRect(0, 0, full.width, full.height);
        context.filter = 'blur(10px)';
        for (let shape = 0; shape < 40; shape++) {
          context.fillStyle = `hsl(${(hue + random() * 120) % 360} ${30 + random() * 40}% ${20 + random() * 60}%)`;
          context.beginPath();
          context.ellipse(
            random() * full.width,
            random() * full.height,
            20 + random() * 200,
            20 + random() * 150,
            random() * Math.PI,
            0,
            2 * Math.PI,
          );
          context.fill();
        }
        context.filter = 'none';
        const pixels = context.getImageData(0, 0, full.width, full.height);
        for (let index = 0; index < pixels.data.length; index++) {
          if (index % 4 !== 3) pixels.data[index] += (random() - 0.5) * 24;
        }
        context.putImageData(pixels, 0, 0);
        return canvas;
      };
      const encode = (canvas: OffscreenCanvas) =>
        canvas
          .convertToBlob({ type: 'image/webp', quality: 0.8 })
          .then(toBase64);
      const photos = [];
      for (let n = 0; n < count; n++) {
        const canvas = paint(n + 1);
        const small = new OffscreenCanvas(thumb.width, thumb.height);
        small
          .getContext('2d')!
          .drawImage(canvas, 0, 0, thumb.width, thumb.height);
        photos.push({ full: await encode(canvas), thumb: await encode(small) });
      }
      return photos;
    },
    { count, full: FULL_SIZE, thumb: THUMB_SIZE },
  );
  return encoded.map(({ full, thumb }) => ({
    full: Buffer.from(full, 'base64'),
    thumb: Buffer.from(thumb, 'base64'),
  }));
}

/** Objects first, then the row, as the app uploads; RLS and the images trigger check both. */
async function attachPhoto(
  session: MintedSession,
  { userId, itemId, photo }: { userId: string; itemId: string; photo: Photo },
) {
  const base = `${userId}/${itemId}/${crypto.randomUUID()}`;
  const bucket = session.client.storage.from(BUCKET);
  for (const [path, bytes] of [
    [`${base}.webp`, photo.full],
    [`${base}.thumb.webp`, photo.thumb],
  ] as const) {
    const { error } = await bucket.upload(path, bytes, {
      contentType: 'image/webp',
    });
    if (error) throw error;
  }
  const { error } = await session.client.from('images').insert({
    item_id: itemId,
    path_full: `${base}.webp`,
    path_thumb: `${base}.thumb.webp`,
    size_bytes: photo.full.byteLength,
  });
  if (error) throw error;
}

/** Deleted and rebuilt, so every run measures the same collection. */
async function seedCollection(
  session: MintedSession,
  { userId, photos }: { userId: string; photos: Photo[] },
) {
  await clearCollection(session.client, userId);
  const { data: category, error: categoryError } = await session.client
    .from('categories')
    .insert({ user_id: userId, name: 'Fundstücke' })
    .select('id')
    .single();
  if (categoryError) throw categoryError;

  let photoIndex = 0;
  // One at a time, oldest first, so the grid's order is the seed's.
  for (let n = 0; n < ENTRY_COUNT; n++) {
    const { data: item, error: itemError } = await session.client
      .from('items')
      .insert({ user_id: userId, ...entryFields(n) })
      .select('id')
      .single();
    if (itemError) throw itemError;
    const { error: linkError } = await session.client
      .from('item_categories')
      .insert({ item_id: item.id, category_id: category.id, user_id: userId });
    if (linkError) throw linkError;
    for (let photo = 0; photo < photosFor(n); photo++) {
      await attachPhoto(session, {
        userId,
        itemId: item.id,
        photo: photos[photoIndex++],
      });
    }
  }
}

// Its own process group, so stopping it stops `serve` too; its output stays drained, or `serve` dies on its next log line.
async function startServer() {
  const server = spawn(
    'node',
    ['scripts/serve-export.mjs', PORT, '/CollectionBuddy'],
    { stdio: ['ignore', 'pipe', 'inherit'], detached: true },
  );
  const ready = new Promise<void>((resolve, reject) => {
    server.stdout.on('data', (chunk) => {
      const line = String(chunk);
      if (!line.includes('Accepting connections')) return;
      // `serve` falls back to a free port when PORT is taken; the profile would then belong to another origin.
      if (line.includes(`:${PORT}`)) resolve();
      else reject(new Error(`port ${PORT} is taken: ${line.trim()}`));
    });
    server.on('exit', () =>
      reject(
        new Error('the export server exited before accepting connections'),
      ),
    );
  });
  try {
    await ready;
  } catch (error) {
    if (server.exitCode === null) await stopServer(server);
    throw error;
  }
  return server;
}

async function stopServer(server: ChildProcess) {
  const exited = once(server, 'exit');
  process.kill(-server.pid!, 'SIGTERM');
  await exited;
}

/** Opens the catalogue once as the collector, so the profile holds what a returning visit finds, and fails unless a photograph renders. */
async function visitSignedIn(context: BrowserContext, session: MintedSession) {
  await context.addInitScript(
    ({ origin, key, value }) => {
      if (window.location.origin === origin)
        window.localStorage.setItem(key, value);
    },
    { origin: new URL(APP_URL).origin, key: session.key, value: session.value },
  );
  const server = await startServer();
  try {
    const page = await context.newPage();
    await page.goto(APP_URL);
    const newest = initCatalogue(page).card(entryFields(ENTRY_COUNT - 1).title);
    const photo = newest.locators.images.first();
    await photo.waitFor({ timeout: 30_000 });
    await photo.evaluate((image) => (image as HTMLImageElement).decode());
  } finally {
    await stopServer(server);
  }
}

const profileDirectory = process.argv[2];
if (!profileDirectory)
  throw new Error('usage: lighthouse-collector.ts <profile directory>');
rmSync(profileDirectory, { recursive: true, force: true });

const userId = await ensureUser(COLLECTOR.email, COLLECTOR.password);
const session = await mintSession(COLLECTOR.email, COLLECTOR.password);
// The browser Lighthouse later runs, so the profile it reads is one it wrote.
const context = await chromium.launchPersistentContext(profileDirectory, {
  executablePath: process.env.CHROME_PATH,
  args: ['--no-sandbox'],
});
try {
  const [blank] = context.pages();
  const photos = await paintPhotos(
    blank ?? (await context.newPage()),
    Array.from({ length: ENTRY_COUNT }, (_, n) => photosFor(n)).reduce(
      (sum, count) => sum + count,
    ),
  );
  console.log(
    `Seeding ${ENTRY_COUNT} entries, ${photos.length} photographs of ~${Math.round(photos[0].full.byteLength / 1024)} KB (thumbnail ~${Math.round(photos[0].thumb.byteLength / 1024)} KB)`,
  );
  await seedCollection(session, { userId, photos });
  await visitSignedIn(context, session);
} finally {
  await context.close();
}

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { SupabaseClient } from '@supabase/supabase-js';

// Not './test': every refused photograph row is a 507, which the browser logs to the console.
import { expect, test as base } from '../fixture';

import { SEED } from './fixtures';
import {
  browserState,
  clearCollection,
  ensureUser,
  mintSession,
  reseedSingle,
} from './collectors';

// 0025_photo_ceilings_fit_the_plan.sql: 256 MiB per owner; a row whose path holds no object counts as the 5 MiB bucket cap.
const OWNER_QUOTA_BYTES = 268_435_456;
const UNSTORED_ROW_BYTES = 5_242_880;
// More than importCategory.ts runs at once (6), so a pool that stopped uploads fewer than all of them.
const PHOTOS = 8;
const IN_FLIGHT = 6;
const PHOTO = readFileSync(resolve(process.cwd(), 'public/icon-192.png'));

type Collector = { email: string; userId: string; client: SupabaseClient };

// Filling the quota would refuse every other spec's photographs, so this spec fills a collector of its own.
const test = base.extend<{ collector: Collector }>({
  // One per parallel slot, so two runs at once never fill each other's quota.
  collector: async ({}, provide, testInfo) => {
    const email = `e2e-photo-quota-${testInfo.parallelIndex}@collectionbuddy.test`;
    const userId = await ensureUser(email, SEED.photoQuota.password);
    const { client } = await mintSession(email, SEED.photoQuota.password);
    await provide({ email, userId, client });
    await clearCollection(client, userId);
  },
  storageState: async ({ collector, baseURL }, provide) => {
    const session = await mintSession(
      collector.email,
      SEED.photoQuota.password,
    );
    await seedPhotographs(collector);
    await provide(browserState(new URL(baseURL!).origin, session));
  },
});

test.use({ locale: 'en-GB' });
test.describe.configure({ timeout: 120_000 });

/** A write that must succeed. */
async function succeed(request: PromiseLike<{ error: unknown }>) {
  const { error } = await request;
  if (error) throw error;
}

/** A read that must succeed and return rows. */
async function read<T>(
  request: PromiseLike<{ data: T | null; error: unknown }>,
): Promise<T> {
  const { data, error } = await request;
  if (error) throw error;
  if (data === null) throw new Error('the read returned nothing');
  return data;
}

/** One category of PHOTOS entries, one real photograph each. */
async function seedPhotographs({ client, userId }: Collector) {
  await reseedSingle(client, {
    userId,
    category: SEED.photoQuota.category,
    title: SEED.photoQuota.item,
    place: 'Kassel',
  });
  const { id: categoryId } = await read(
    client
      .from('categories')
      .select('id')
      .eq('name', SEED.photoQuota.category)
      .single<{ id: string }>(),
  );
  const items = await read(
    client
      .from('items')
      .insert(
        Array.from({ length: PHOTOS - 1 }, (_, n) => ({
          title: `${SEED.photoQuota.item} ${n + 2}`,
        })),
      )
      .select('id'),
  );
  await succeed(
    client
      .from('item_categories')
      .insert(
        items.map(({ id }) => ({ item_id: id, category_id: categoryId })),
      ),
  );
  const all = await read(client.from('items').select('id'));
  for (const { id } of all) {
    const path = `${userId}/${id}/${randomUUID()}.png`;
    await succeed(
      client.storage
        .from('item-images')
        .upload(path, PHOTO, { contentType: 'image/png' }),
    );
    await succeed(
      client.from('images').insert({
        item_id: id,
        path_full: path,
        path_thumb: null,
        size_bytes: 0,
      }),
    );
  }
}

/** Rows naming no object, then one object sized so the quota has room for nothing more. */
async function fillPhotoQuota({ client, userId }: Collector) {
  const [{ id: itemId }] = await read(
    client.from('items').select('id').limit(1),
  );
  const recorded = await read(
    client.from('images').select('size_bytes, thumb_size_bytes'),
  );
  const used = recorded.reduce(
    (sum, row) => sum + row.size_bytes + row.thumb_size_bytes,
    0,
  );
  const unstoredRows = Math.floor(
    (OWNER_QUOTA_BYTES - used) / UNSTORED_ROW_BYTES,
  );
  await succeed(
    client.from('images').insert(
      Array.from({ length: unstoredRows }, () => ({
        item_id: itemId,
        path_full: `${userId}/${itemId}/${randomUUID()}.webp`,
        path_thumb: null,
        size_bytes: 0,
      })),
    ),
  );
  const room = OWNER_QUOTA_BYTES - used - unstoredRows * UNSTORED_ROW_BYTES;
  const filler = `${userId}/${itemId}/${randomUUID()}.webp`;
  await succeed(
    client.storage
      .from('item-images')
      .upload(filler, new Uint8Array(room - 1), { contentType: 'image/webp' }),
  );
  await succeed(
    client.from('images').insert({
      item_id: itemId,
      path_full: filler,
      path_thumb: null,
      size_bytes: 0,
    }),
  );
}

test.describe('importing into a full photo quota', () => {
  test('stops uploading at the first refusal and says the quota is why', async ({
    on,
    page,
    collector,
  }) => {
    const app = on(page);
    await app.categories.do.open(SEED.photoQuota.category);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      app.categories.do.exportCollection(),
    ]);
    const archive = await download.path();
    if (!archive) throw new Error('the export did not save a file to disk');

    await fillPhotoQuota(collector);
    const uploads: string[] = [];
    page.on('request', (request) => {
      const { pathname } = new URL(request.url());
      if (
        request.method() === 'POST' &&
        pathname.includes('/storage/v1/object/item-images/')
      ) {
        uploads.push(pathname);
      }
    });

    await app.categories.do.importArchive(archive);
    await expect(app.categories.locators.selected).toHaveText(
      `${SEED.photoQuota.category} (2)`,
      { timeout: 60_000 },
    );
    await expect(app.toast.locators.alert).toContainText(
      `${PHOTOS} of ${PHOTOS} photographs were not imported: the limit of 256 MiB of photographs is reached. Delete some to make room.`,
    );
    // Full size and thumbnail of the photographs already in flight, none after.
    expect(uploads.length).toBeLessThanOrEqual(IN_FLIGHT * 2);
    expect(uploads.length).toBeLessThan(PHOTOS * 2);
  });
});

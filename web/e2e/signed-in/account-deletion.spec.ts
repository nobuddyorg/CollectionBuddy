import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Not './test': clearing the session afterwards asks Auth to log out a user it no longer has, whose 403 the browser logs.
import { expect, test as base } from '../fixture';

import { SEED } from './fixtures';
import {
  BUCKET,
  adminApi,
  browserState,
  ensureUser,
  mintSession,
  reseedSingle,
  type MintedSession,
} from './collectors';
import { LOGIN_URL } from '../pages/login';

// A real image, so the card renders it rather than logging a decode failure.
const PHOTO = readFileSync(resolve(process.cwd(), 'public/logo.png'));

// Deleting the account ends every session of its user, so it deletes a collector no other spec shares.
const test = base.extend<{
  collector: { email: string; photo: string; session: MintedSession };
}>({
  // One per parallel slot, created afresh on each run: the journey deletes it.
  collector: async ({}, provide, testInfo) => {
    const email = `e2e-account-deletion-${testInfo.parallelIndex}@collectionbuddy.test`;
    const userId = await ensureUser(email, SEED.accountDeletion.password);
    const session = await mintSession(email, SEED.accountDeletion.password);
    await reseedSingle(session.client, {
      userId,
      category: SEED.accountDeletion.category,
      title: SEED.accountDeletion.item,
      place: 'Lindau',
    });
    const { data: item, error: itemError } = await session.client
      .from('items')
      .select('id')
      .eq('title', SEED.accountDeletion.item)
      .single();
    if (itemError) throw itemError;
    const photo = `${userId}/${item.id}/nachlass.png`;
    const { error: uploadError } = await session.client.storage
      .from(BUCKET)
      .upload(photo, new Blob([PHOTO], { type: 'image/png' }));
    if (uploadError) throw uploadError;
    const { error: rowError } = await session.client
      .from('images')
      .insert({ item_id: item.id, path_full: photo });
    if (rowError) throw rowError;
    await provide({ email, photo, session });
  },
  storageState: async ({ collector, baseURL }, provide) => {
    await provide(browserState(new URL(baseURL!).origin, collector.session));
  },
});

test.use({ locale: 'en-GB' });

/** Storage as the project sees it, since the deleted collector has no session left to look with. */
async function stored(path: string) {
  const folder = path.slice(0, path.lastIndexOf('/'));
  const { data, error } = await adminApi().storage.from(BUCKET).list(folder);
  if (error) throw error;
  return data.some((object) => `${folder}/${object.name}` === path);
}

test.describe('deleting one’s account', () => {
  test('asks first, then removes the photographs and the account and returns to the login page', async ({
    on,
    page,
    collector,
  }) => {
    const app = on(page);
    const problems: string[] = [];
    page.on('pageerror', (error) => problems.push(`threw: ${error.message}`));
    page.on('console', (message) => {
      const expectedLogout =
        message.location().url.includes('/auth/v1/logout') &&
        message.text().includes('403');
      if (message.type() === 'error' && !expectedLogout)
        problems.push(`logged: ${message.text()}`);
    });
    await app.categories.do.open(SEED.accountDeletion.category);

    await app.account.do.open();
    await app.account.do.deleteAccount();
    await expect(app.confirm.locators.message).toContainText(
      'Delete your account?',
    );
    await app.confirm.do.cancel();
    await expect(page).not.toHaveURL(LOGIN_URL);
    expect(await stored(collector.photo)).toBe(true);

    await app.account.do.open();
    await app.account.do.deleteAccount();
    await app.confirm.do.accept();

    await expect(page).toHaveURL(LOGIN_URL);
    await expect(app.toast()).toContainText('Your account has been deleted.');
    expect(await stored(collector.photo)).toBe(false);
    await expect(
      mintSession(collector.email, SEED.accountDeletion.password),
    ).rejects.toThrow();

    // No session survives a reload: the one in this browser was cleared, and the server's went with the user.
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page).toHaveURL(LOGIN_URL);
    expect(problems, 'the page threw or logged errors').toEqual([]);
  });
});

import { resolve } from 'node:path';

import { type Locator, type Page } from '@playwright/test';

// Not './test': every case drives the app into toast.reportError, which logs to the console by design.
import { expect, test } from '../fixture';

import { removeEntriesTitled } from './cleanup';
import { SEED } from './fixtures';
import { apiAs, context, ownedCategoryId, share, unshare } from './rls/helpers';
// Failures are injected at the network boundary, so the app's own code runs for real.
test.use({ locale: 'en-GB' });

test.describe.configure({ timeout: 120_000 });

const PHOTO = resolve(process.cwd(), 'public/logo.png');
const uniqueTitle = (what: string) => `${what} ${Date.now()}`;

test.describe('when something outside the app fails', () => {
  test.beforeEach(async ({ on, page }) => {
    await on(page).categories.do.open(SEED.failureCategory);
  });

  // The form has to stay usable with the geocoder down rather than block an entry needing no lookup.
  test('a hand-typed place is still saved with the geocoder down', async ({
    on,
    page,
  }) => {
    const app = on(page);
    await page.route('https://photon.komoot.io/**', (route) =>
      route.fulfill({ status: 503, body: '' }),
    );

    const title = uniqueTitle('Ohne Geocoder');
    try {
      await app.catalogue.do.openEntryForm();
      await app.form.do.fill({ title });

      await app.form.locators.inputs.place.fill('Entenhausen');
      await expect(app.form.locators.texts.placeError).toBeVisible();

      await app.form.do.submit();
      await expect(app.catalogue.card(title).locators.place).toHaveText(
        'Entenhausen',
      );
    } finally {
      await removeEntriesTitled(title);
    }
  });

  // A photograph that never reaches storage must say so, not show a picture that is not there.
  test('a photograph that cannot be stored is reported, not pretended', async ({
    on,
    page,
  }) => {
    const app = on(page);
    const title = uniqueTitle('Upload kaputt');
    try {
      await app.catalogue.do.addEntry(title);
      const card = app.catalogue.card(title);

      await page.route('**/storage/v1/object/**', (route) =>
        route.fulfill({ status: 500, json: { message: 'nope' } }),
      );
      await card.do.uploadPhoto(PHOTO);

      // role=alert: a failed upload is the one kind of toast that interrupts.
      await expect(app.toast()).toContainText('Could not upload this');
      await expect(app.toast()).toHaveAttribute('role', 'alert');
      await expect(card.locators.images).toHaveCount(0);
    } finally {
      await page.unroute('**/storage/v1/object/**');
      await removeEntriesTitled(title);
    }
  });

  // Objects go before the row: a refused Storage delete must leave the row, so no file is left unnamed.
  test('a photograph Storage will not remove stays, row and files', async ({
    on,
    page,
  }) => {
    const app = on(page);
    const { token, userId } = context();
    const api = apiAs(token);
    const bulkDelete = '**/storage/v1/object/item-images';
    const title = uniqueTitle('Bleibt ganz');
    try {
      await app.catalogue.do.addEntry(title);
      const card = app.catalogue.card(title);
      await card.do.uploadPhoto(PHOTO);
      await expect(card.locators.images).toBeVisible({ timeout: 45_000 });
      const { data: item } = await api
        .from('items')
        .select('id')
        .eq('title', title)
        .single();
      const itemId = (item as { id: string }).id;
      const storedFiles = async () =>
        (
          (await api.storage.from('item-images').list(`${userId}/${itemId}`))
            .data ?? []
        ).length;
      const filesBefore = await storedFiles();
      expect(filesBefore).toBeGreaterThan(0);

      await page.route(bulkDelete, (route) =>
        route.request().method() === 'DELETE'
          ? route.fulfill({ status: 500, json: { message: 'nope' } })
          : route.fallback(),
      );
      await card.locators.buttons.deleteImage.click();
      await app.confirm.do.accept();
      await app.toast.do.close();

      await expect(app.toast()).toContainText('Could not delete this image');
      await expect(card.locators.images).toHaveCount(1);
      const { data: rows } = await api
        .from('images')
        .select('id')
        .eq('item_id', itemId);
      expect(rows).toHaveLength(1);
      expect(await storedFiles()).toBe(filesBefore);
    } finally {
      await page.unroute(bulkDelete);
      await removeEntriesTitled(title);
    }
  });

  // Each row acts by its share id: one left over from the previous collection would revoke or promote there.
  test("a collection whose grants fail to load never shows the previous one's", async ({
    on,
    page,
  }) => {
    const app = on(page);
    const { token, userId } = context();
    const categoryId = await ownedCategoryId({
      token,
      userId,
      name: SEED.failureCategory,
    });
    const shareId = await share({
      token,
      categoryId,
      invitedEmail: SEED.other.email,
    });
    const shareList = (url: URL) =>
      url.pathname.endsWith('/rest/v1/category_shares');
    try {
      await app.categories.do.openPanel();
      await expect(app.sharing.row(SEED.other.email)()).toBeVisible();

      await page.route(shareList, (route) =>
        route.fulfill({ status: 500, json: { message: 'nope' } }),
      );
      await app.categories.tab('Münzen').click();
      await expect(app.categories.locators.selected).toHaveText('Münzen');
      await app.categories.do.openPanel();

      await expect(app.toast()).toContainText('Could not load sharing');
      await expect(app.sharing.locators.rows).toHaveCount(0);
    } finally {
      await page.unroute(shareList);
      await unshare(token, shareId);
    }
  });

  // A deploy removes the previous build's chunks; a tab still running that build must recover, not crash.
  test.describe("after a deploy removed a screen's code", () => {
    // A page route never sees what the service worker fetches; the worker has its own spec.
    test.use({ serviceWorkers: 'block' });

    /** Reloads to learn which chunks the catalogue needs, then 404s every other one while `deploy.gone`. */
    async function removeUnloadedChunks(page: Page, newEntry: Locator) {
      const loaded = new Set<string>();
      const record = (request: { url(): string }) => loaded.add(request.url());
      page.on('request', record);
      await page.reload();
      await expect(newEntry).toBeVisible();
      page.off('request', record);

      const deploy = { gone: true };
      await page.route('**/_next/static/chunks/**', (route) =>
        deploy.gone && !loaded.has(route.request().url())
          ? route.fulfill({ status: 404, body: '' })
          : route.fallback(),
      );
      return deploy;
    }

    test('New entry reloads the page once, then opens', async ({
      on,
      page,
    }) => {
      const app = on(page);
      const deploy = await removeUnloadedChunks(
        page,
        app.catalogue.locators.buttons.newEntry,
      );
      // The reload is what fetches the current build, whose chunks the server has.
      page.on('request', (request) => {
        if (request.isNavigationRequest()) deploy.gone = false;
      });

      const reloaded = page.waitForEvent('framenavigated');
      await app.catalogue.locators.buttons.newEntry.click();
      await reloaded;

      await app.catalogue.do.openEntryForm();
      await expect(app.form.locators.inputs.title).toBeVisible();
    });

    test('a chunk still missing after that reload shows a way out, not a reload loop', async ({
      on,
      page,
    }) => {
      const app = on(page);
      const deploy = await removeUnloadedChunks(
        page,
        app.catalogue.locators.buttons.newEntry,
      );

      const reloaded = page.waitForEvent('framenavigated');
      await app.catalogue.locators.buttons.newEntry.click();
      await reloaded;
      await app.catalogue.locators.buttons.newEntry.click();

      await expect(app.appError()).toContainText('Something went wrong');
      await expect(app.catalogue.locators.buttons.newEntry).toBeHidden();

      deploy.gone = false;
      await app.appError.do.reload();
      await app.catalogue.do.openEntryForm();
      await expect(app.form.locators.inputs.title).toBeVisible();
    });
  });
});

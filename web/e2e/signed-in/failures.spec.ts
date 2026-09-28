import { resolve } from 'node:path';

import { type Locator, type Page } from '@playwright/test';

// Not './test': every case drives the app into toast.reportError, which logs to the console by design.
import { expect, test } from '../fixture';

import { writeArchiveClaiming } from './archives';
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

  // Background removal is an extra, never a gate: with no model to be had, the original still uploads.
  test('a photo still uploads as it was when the background model cannot be loaded', async ({
    on,
    page,
  }) => {
    const app = on(page);
    await page
      .context()
      .route('**/models/isnet-general-use-fp16.onnx', (route) =>
        route.fulfill({ status: 404, body: '' }),
      );
    await app.account.do.open();
    await app.account.do.toggleCutout();
    await page.keyboard.press('Escape');

    const title = uniqueTitle('Ohne Modell');
    try {
      await app.catalogue.do.addEntry(title);
      const card = app.catalogue.card(title);
      await card.do.uploadPhoto(PHOTO);

      await expect(app.backgroundRemoval.locators.status).toHaveText(
        'The background could not be removed. The original can still be uploaded.',
        { timeout: 45_000 },
      );
      await expect(app.backgroundRemoval.locators.original).toBeVisible();
      await expect(
        app.backgroundRemoval.locators.buttons.useCutout,
      ).toBeDisabled();
      await app.backgroundRemoval.do.keepOriginal();

      await expect(card.locators.images).toBeVisible({ timeout: 45_000 });
    } finally {
      await removeEntriesTitled(title);
    }
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

  // #785: the input still held the file, so picking it again for a retry fired no change and did nothing.
  test('the same photograph can be picked again once its upload failed', async ({
    on,
    page,
  }) => {
    const app = on(page);
    const title = uniqueTitle('Nochmal');
    try {
      await app.catalogue.do.addEntry(title);
      const card = app.catalogue.card(title);
      // The first through the empty frame, so the next ones go through the card's own + control, which stays mounted.
      await card.do.uploadPhoto(PHOTO);
      await expect(card.locators.images).toHaveCount(1, { timeout: 45_000 });

      await page.route('**/storage/v1/object/**', (route) =>
        route.request().method() === 'POST'
          ? route.fulfill({ status: 500, json: { message: 'nope' } })
          : route.fallback(),
      );
      await card.do.uploadPhoto(PHOTO);
      await expect(app.toast()).toContainText('Could not upload this');
      await page.unroute('**/storage/v1/object/**');

      await card.do.uploadPhoto(PHOTO);
      await expect(card.locators.images).toHaveCount(2, { timeout: 45_000 });
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

// A failed load must not read as an empty collection, or a collector may rebuild what is still there.
test.describe('when a list fails to load', () => {
  /** Fails every read of `table` with a 500 until the returned switch is turned off. */
  async function failReads(page: Page, table: string) {
    const outage = { on: true };
    await page.route(
      (url) => url.pathname.endsWith(`/rest/v1/${table}`),
      (route) =>
        outage.on && route.request().method() === 'GET'
          ? route.fulfill({ status: 500, json: { message: 'nope' } })
          : route.fallback(),
    );
    return outage;
  }

  test('the collections say they failed, not that there are none, and a retry loads them', async ({
    on,
    page,
  }) => {
    const app = on(page);
    const outage = await failReads(page, 'categories');

    await page.goto('');

    await expect(app.collectionsLoadError.locators.title).toHaveText(
      'Your collections could not be loaded',
    );
    await expect(app.toast()).toContainText('Could not load collections');
    await expect(app.help.locators.buttons.emptyState).toBeHidden();

    outage.on = false;
    await app.collectionsLoadError.do.retry();

    await expect(app.collectionsLoadError()).toBeHidden();
    await expect(app.categories.locators.selected).not.toBeEmpty();
    await expect(app.catalogue.locators.buttons.newEntry).toBeVisible();
  });

  test('the entries say they failed, not that there are none, and a retry loads them', async ({
    on,
    page,
  }) => {
    const app = on(page);
    await app.categories.do.open(SEED.failureCategory);
    const outage = await failReads(page, 'item_categories');

    await page.reload();

    await expect(app.entriesLoadError.locators.title).toHaveText(
      'The entries could not be loaded',
    );
    await expect(app.toast()).toContainText('Could not load entries');
    await expect(app.catalogue.locators.texts.emptyTitle).toBeHidden();

    outage.on = false;
    await app.entriesLoadError.locators.buttons.retry.focus();
    await page.keyboard.press('Enter');

    await expect(app.entriesLoadError()).toBeHidden();
    await expect(app.catalogue.locators.cards.first()).toBeVisible();
  });
});

// #787: a crafted archive is refused before anything is created, and says why rather than "try again".
test.describe('when an archive is not what the export wrote', () => {
  test('one claiming to unpack past the limit is refused, and no collection appears', async ({
    on,
    page,
  }, testInfo) => {
    const app = on(page);
    await app.categories.do.open(SEED.failureCategory);
    const category = uniqueTitle('Riesenarchiv');
    const crafted = testInfo.outputPath('crafted.zip');
    writeArchiveClaiming(
      { category, declaredSize: 200 * 1024 * 1024 },
      crafted,
    );

    await app.categories.do.importArchive(crafted);

    await expect(app.toast()).toContainText(
      'This archive unpacks to more than an import accepts, so nothing was imported.',
    );
    await expect(app.categories.locators.buttons.cancelImport).toBeHidden();
    await app.categories.do.openPanel();
    await expect(app.categories.tab(category)).toHaveCount(0);
  });
});

// auth-js answers an expired token it cannot refresh (offline) with an error, and keeps the session unless the app removes it.
test.describe('when sign-out cannot reach the auth server', () => {
  test('the session still ends on this device, and stays ended once back online', async ({
    on,
    page,
  }) => {
    const app = on(page);
    await app.categories.do.open(SEED.failureCategory);
    // Blocked before the token expires, so neither a refresh nor the revoke reaches the session every spec shares.
    await page.route('**/auth/v1/**', (route) =>
      route.abort('internetdisconnected'),
    );
    await page.evaluate(() => {
      const key = Object.keys(window.localStorage).find(
        (name) => name.startsWith('sb-') && name.endsWith('-auth-token'),
      );
      if (!key) throw new Error('no stored session');
      const session = JSON.parse(window.localStorage.getItem(key)!);
      session.expires_at = Math.floor(Date.now() / 1000) - 60;
      window.localStorage.setItem(key, JSON.stringify(session));
    });

    await app.account.do.open();
    await app.account.do.signOut();

    // auth-js retries the refresh for up to its 30 s tick before it gives up.
    await expect(page).toHaveURL(/\/login\/?$/, { timeout: 45_000 });
    await expect(app.toast()).toContainText("Sign-out didn't fully complete");
    const sessionKeys = await page.evaluate(() =>
      Object.keys(window.localStorage).filter(
        (name) => name.startsWith('sb-') && name.endsWith('-auth-token'),
      ),
    );
    expect(sessionKeys).toEqual([]);

    // A session left in storage would refresh here and sign straight back in.
    await page.unroute('**/auth/v1/**');
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page).toHaveURL(/\/login\/?$/);
  });
});

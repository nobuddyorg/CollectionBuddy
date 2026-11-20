import { expect, test } from './test';
import { OTHER_AUTH_STATE_PATH, SEED } from './fixtures';
import { removeCategoryNamed } from './cleanup';
import { fileEntry } from './collectors';
import { GEOCODER, photonFeature, uniqueName } from './helpers';
import {
  apiAs,
  context,
  ownedCategoryId,
  unshare,
  viewerShare,
} from './rls/helpers';

// The grantee's side, in their own session; rls/viewer-share.spec.ts has what it reaches.
test.use({ storageState: OTHER_AUTH_STATE_PATH, locale: 'en-GB' });

test.describe('a collection shared with you', () => {
  test('is marked as someone else, refuses the owner controls, and can be left', async ({
    on,
    page,
  }) => {
    const app = on(page);
    const { token, userId } = context();

    // Issued by the owner, as sharing.spec.ts does through the panel.
    const categoryId = await ownedCategoryId({
      token,
      userId,
      name: SEED.grantedCategory,
    });
    const shareId = await viewerShare(token, categoryId);

    try {
      await app.categories.do.load();
      await app.categories.do.openPanel();

      await expect(
        app.categories.sharedMarkerOn(SEED.grantedCategory),
      ).toBeVisible();
      await app.categories.tab(SEED.grantedCategory).click();

      await expect(app.categories.locators.selected).toHaveText(
        SEED.grantedCategory,
      );
      await expect(app.catalogue.card('Schatullenstück')()).toBeVisible();

      // A viewer grant reads; the one control that would write is shut.
      await expect(app.catalogue.locators.buttons.newEntry).toBeDisabled();

      await app.categories.do.openPanel();
      // Rename is refused by RLS; export is owners-only by product decision.
      await expect(app.categories.locators.buttons.rename).toBeDisabled();
      await expect(app.categories.locators.buttons.export).toBeDisabled();
      // Who else a collection is shared with is the owner's business.
      await expect(app.sharing.locators.inputs.email).toHaveCount(0);

      // Same button as an owner's delete; here it ends only their access.
      await app.categories.do.delete();
      await expect(app.confirm.locators.message).toContainText(
        `Leave "${SEED.grantedCategory}"?`,
      );
      await app.confirm.do.accept();

      await expect(app.categories.locators.selected).not.toHaveText(
        SEED.grantedCategory,
      );
      await app.categories.do.openPanel();
      await expect(app.categories.tab(SEED.grantedCategory)).toHaveCount(0);

      // Sent at once, with no undo window: once confirmed, a reload straight away finds it still gone.
      await expect(
        app.toast().filter({ hasText: 'Left shared collection.' }),
      ).toBeVisible();
      await page.reload({ waitUntil: 'networkidle' });
      await expect(app.categories.locators.selected).not.toBeEmpty();
      await app.categories.do.openPanel();
      await expect(app.categories.tab(SEED.grantedCategory)).toHaveCount(0);
      const { data: left } = await apiAs(token)
        .from('category_shares')
        .select('id')
        .eq('id', shareId);
      expect(left).toEqual([]);
    } finally {
      // Cleanup for a run that failed before leaving.
      await unshare(token, shareId);
    }
  });
});

test.describe('the map of a collection shared with you', () => {
  // A viewer could not store the answer, so asking would send the owner's place names to Photon for nothing.
  test('asks Photon nothing for a place without coordinates, and says it is not shown', async ({
    on,
    page,
  }) => {
    const app = on(page);
    const { token, userId } = context();
    const name = uniqueName('E2E Geteilte Karte');
    const owner = apiAs(token);
    const { data: category, error } = await owner
      .from('categories')
      .insert({ user_id: userId, name })
      .select('id')
      .single();
    if (error) throw error;

    try {
      await fileEntry(owner, {
        categoryId: category.id,
        fields: { user_id: userId, title: 'Kartenstück', place: 'Aachen' },
      });
      await viewerShare(token, category.id);
      const lookups: string[] = [];
      await page.route(GEOCODER, (route) => {
        lookups.push(route.request().url());
        return route.fulfill({
          json: { features: [photonFeature('Aachen', [6.0839, 50.7753])] },
        });
      });

      await app.categories.do.load();
      await app.categories.do.openPanel();
      await app.categories.tab(name).click();
      await expect(app.catalogue.card('Kartenstück')()).toBeVisible();

      // Nothing to pin, so no map is drawn: the catalogue's button alone opens the dialog.
      await app.catalogue.do.openMap();
      await expect(app.map.locators.texts.unplaced).toHaveText(
        '1 place has no location and is not shown',
      );
      await expect(app.map.locators.pins).toHaveCount(0);
      expect(lookups).toEqual([]);
    } finally {
      await removeCategoryNamed(name);
    }
  });
});

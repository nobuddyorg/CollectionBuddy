import { expect, test } from './test';

import { expectNoSeriousA11yViolations } from '../axe';
test.use({ locale: 'en-GB' });

test.describe('accessibility -- signed in', () => {
  // Also covers an entry's detail: everything is rendered inline on the card, there is no detail page.
  test('the catalogue grid has no serious or critical violations', async ({
    on,
    page,
  }, testInfo) => {
    const app = on(page);
    await app.categories.do.open('Münzen');
    await app.catalogue.do.waitForCardsSettled();
    await expectNoSeriousA11yViolations(page, testInfo);
  });

  test('the map view has no serious or critical violations', async ({
    on,
    page,
  }, testInfo) => {
    const app = on(page);
    await app.categories.do.open('Münzen');
    await app.map.do.open();
    await expectNoSeriousA11yViolations(page, testInfo);
  });

  test('search results have no serious or critical violations', async ({
    on,
    page,
  }, testInfo) => {
    const app = on(page);
    await app.categories.do.open('Münzen');
    await app.catalogue.do.search('Silberdenar');
    await expect(app.catalogue.locators.cards).toHaveCount(1);
    await app.catalogue.do.waitForCardsSettled();
    await expectNoSeriousA11yViolations(page, testInfo);
  });

  // Distinct markup from a populated grid: a message instead of cards.
  test('the no-results search state has no serious or critical violations', async ({
    on,
    page,
  }, testInfo) => {
    const app = on(page);
    await app.categories.do.open('Münzen');
    await app.catalogue.do.search('zzzznothing');
    await expect(app.catalogue.locators.cards).toHaveCount(0);
    await expectNoSeriousA11yViolations(page, testInfo);
  });

  test('the entry form has no serious or critical violations', async ({
    on,
    page,
  }, testInfo) => {
    const app = on(page);
    await app.categories.do.open('Münzen');
    await app.catalogue.do.openEntryForm();
    await expect(app.form.locators.inputs.title).toBeVisible();
    await expectNoSeriousA11yViolations(page, testInfo);
    // Closed, not submitted -- this spec only looks, it doesn't write.
    await app.form.do.close();
  });

  // The sharing panel lives inside the expanded strip, rendered for an owned category.
  test('the sharing panel has no serious or critical violations', async ({
    on,
    page,
  }, testInfo) => {
    const app = on(page);
    await app.categories.do.open('Münzen');
    await app.catalogue.do.waitForCardsSettled();
    await app.categories.do.openPanel();
    await expect(app.categories.locators.inputs.newName).toBeVisible();
    await expectNoSeriousA11yViolations(page, testInfo);
  });

  test('the help dialog has no serious or critical violations', async ({
    on,
    page,
  }, testInfo) => {
    const app = on(page);
    await app.categories.do.open('Münzen');
    await app.catalogue.do.waitForCardsSettled();
    await app.help.do.openByKeyboard();
    await app.help.do.openTopic('entries');
    await expect(app.help.locators.topic('entries')).toHaveAttribute('open');
    await expectNoSeriousA11yViolations(page, testInfo);
  });
});

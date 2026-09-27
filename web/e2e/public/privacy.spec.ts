import { expect, test } from '../fixture';

import { expectNoSeriousA11yViolations } from '../axe';

// The notice opens without a session; signed-in/preferences.spec.ts follows the account menu's link.
test.describe('the privacy notice', () => {
  test.describe('in English', () => {
    test.use({ locale: 'en-GB' });

    test('opens from the sign-in page, before anyone signs in', async ({
      on,
      page,
    }, testInfo) => {
      await on(page).login.do.open();
      await on(page).login.locators.privacyLink.click();

      const { contact, controller, title } = on(page).privacy.locators;
      await expect(title).toHaveText('Privacy notice');
      await expect(page).toHaveTitle('Privacy notice · CollectionBuddy');
      await expect(controller).toContainText('Matthias Eggert');
      await expect(contact).toHaveAttribute('href', 'mailto:info@nobuddy.org');
      await expectNoSeriousA11yViolations(page, testInfo);
    });
  });

  test.describe('in German', () => {
    test.use({ locale: 'de-DE' });

    test('reads in the browser’s language and leads back to the app', async ({
      on,
      page,
    }) => {
      await on(page).privacy.do.open();

      await expect(page.locator('html')).toHaveAttribute('lang', 'de');
      await expect(on(page).privacy.locators.title).toHaveText(
        'Datenschutzhinweis',
      );
      await expect(page).toHaveTitle('Datenschutzhinweis · CollectionBuddy');
      await expect(on(page).privacy.locators.contact).toHaveAttribute(
        'href',
        'mailto:info@nobuddy.org',
      );

      await on(page).privacy.locators.back.click();
      await expect(on(page).login.locators.buttons.signIn).toBeVisible();
    });
  });
});

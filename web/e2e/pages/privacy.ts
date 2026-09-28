import { type Locator, type Page } from '@playwright/test';

/** The privacy notice, a page of its own that opens without signing in. */
interface PrivacyPage {
  (): Locator;
  do: {
    open(): Promise<void>;
  };
  locators: {
    back: Locator;
    contact: Locator;
    controller: Locator;
    title: Locator;
  };
}

export function initPrivacyPage(page: Page): PrivacyPage {
  const root = page.getByTestId('app-root');
  const locators = {
    back: root.getByTestId('privacy-back'),
    contact: root.getByTestId('privacy-contact'),
    controller: root.getByTestId('privacy-controller'),
    title: root.getByTestId('privacy-title'),
  };
  const interactions = {
    open: async () => {
      await page.goto('privacy/', { waitUntil: 'networkidle' });
    },
  };
  return Object.assign(() => root, { locators, do: interactions });
}

import { type Locator, type Page } from '@playwright/test';

interface LoadError {
  (): Locator;
  do: {
    retry(): Promise<void>;
  };
  locators: {
    buttons: {
      retry: Locator;
    };
    title: Locator;
  };
}

/** What a list shows in place of its entries when loading them failed: `collections` or `entries`. */
export function initLoadError(
  page: Page,
  list: 'collections' | 'entries',
): LoadError {
  const testId =
    list === 'collections' ? 'catalogue-load-error' : 'entries-load-error';
  const root = page.locator('#app-root').getByTestId(testId);
  const locators = {
    buttons: {
      retry: root.getByTestId('load-error-retry'),
    },
    title: root.getByTestId('load-error-title'),
  };
  const interactions = {
    retry: async () => {
      await locators.buttons.retry.click();
    },
  };
  return Object.assign(() => root, { locators, do: interactions });
}

import { type Locator, type Page } from '@playwright/test';

interface AppError {
  (): Locator;
  do: {
    reload(): Promise<void>;
  };
  locators: {
    buttons: {
      reload: Locator;
    };
  };
}

/** The screen the app's error boundary shows in place of a page that failed to render. */
export function initAppError(page: Page): AppError {
  const root = page.getByTestId('app-error');
  const locators = {
    buttons: {
      reload: root.getByTestId('app-error-reload'),
    },
  };
  const interactions = {
    reload: async () => {
      await locators.buttons.reload.click();
    },
  };
  return Object.assign(() => root, { locators, do: interactions });
}

import { type Locator, type Page } from '@playwright/test';

interface BlurReview {
  (): Locator;
  do: {
    keep(): Promise<void>;
    skip(): Promise<void>;
  };
  locators: {
    buttons: {
      keep: Locator;
      skip: Locator;
    };
    preview: Locator;
    warning: Locator;
  };
}

/** The question a blurry photo raises before it uploads, when background removal is off. */
export function initBlurReview(page: Page): BlurReview {
  const root = page.getByTestId('blur-review');
  const locators = {
    buttons: {
      keep: root.getByTestId('blur-keep'),
      skip: root.getByTestId('blur-skip'),
    },
    preview: root.getByTestId('blur-preview'),
    warning: root.getByTestId('blur-warning'),
  };
  const interactions = {
    keep: async () => {
      await locators.buttons.keep.click();
    },
    skip: async () => {
      await locators.buttons.skip.click();
    },
  };
  return Object.assign(() => root, { locators, do: interactions });
}

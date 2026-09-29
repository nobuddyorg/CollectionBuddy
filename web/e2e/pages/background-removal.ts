import { type Locator, type Page } from '@playwright/test';

interface CutoutReview {
  (): Locator;
  do: {
    cancel(): Promise<void>;
    keepOriginal(): Promise<void>;
    useCutout(): Promise<void>;
  };
  locators: {
    buttons: {
      close: Locator;
      keepOriginal: Locator;
      useCutout: Locator;
    };
    cutout: Locator;
    original: Locator;
    status: Locator;
  };
}

/** The review that stands between picking a photo and uploading it, once "Remove backgrounds" is on. */
export function initBackgroundRemovalReview(page: Page): CutoutReview {
  const root = page.getByTestId('background-removal-review');
  const locators = {
    buttons: {
      close: page.getByTestId('dialog-close'),
      keepOriginal: root.getByTestId('cutout-keep-original'),
      useCutout: root.getByTestId('cutout-use'),
    },
    cutout: root.getByTestId('cutout-result'),
    original: root.getByTestId('cutout-original'),
    status: root.getByTestId('cutout-status'),
  };
  const interactions = {
    cancel: async () => {
      await locators.buttons.close.click();
    },
    keepOriginal: async () => {
      await locators.buttons.keepOriginal.click();
    },
    useCutout: async () => {
      await locators.buttons.useCutout.click();
    },
  };
  return Object.assign(() => root, { locators, do: interactions });
}

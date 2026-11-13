import { type Locator, type Page } from '@playwright/test';

interface CutoutReview {
  (): Locator;
  do: {
    cancel(): Promise<void>;
    keepOriginal(): Promise<void>;
    skip(): Promise<void>;
    useCutout(): Promise<void>;
  };
  locators: {
    buttons: {
      close: Locator;
      keepOriginal: Locator;
      skip: Locator;
      useCutout: Locator;
    };
    /** Shown only once the photo reads as blurry. */
    blurWarning: Locator;
    cutout: Locator;
    original: Locator;
    /** "Photo 2 of 3"; absent for a single photo. */
    progress: Locator;
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
      skip: root.getByTestId('cutout-skip'),
      useCutout: root.getByTestId('cutout-use'),
    },
    blurWarning: root.getByTestId('blur-warning'),
    cutout: root.getByTestId('cutout-result'),
    original: root.getByTestId('cutout-original'),
    progress: page.getByTestId('cutout-progress'),
    status: root.getByTestId('cutout-status'),
  };
  const interactions = {
    cancel: async () => {
      await locators.buttons.close.click();
    },
    keepOriginal: async () => {
      await locators.buttons.keepOriginal.click();
    },
    skip: async () => {
      await locators.buttons.skip.click();
    },
    useCutout: async () => {
      await locators.buttons.useCutout.click();
    },
  };
  return Object.assign(() => root, { locators, do: interactions });
}

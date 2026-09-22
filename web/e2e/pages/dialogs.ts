import { type Locator, type Page } from '@playwright/test';

interface Confirm {
  /**
   * Points to self.
   */
  (): Locator;
  /**
   * High-level interactions.
   */
  do: {
    accept(): Promise<void>;
    cancel(): Promise<void>;
  };
  /**
   * Raw locators.
   */
  locators: {
    buttons: {
      accept: Locator;
      cancel: Locator;
    };
    message: Locator;
  };
}

interface Toast {
  (): Locator;
  do: {
    close(): Promise<void>;
    undo(): Promise<void>;
  };
  locators: {
    buttons: {
      action: Locator;
      close: Locator;
    };
  };
}

interface ImageViewer {
  (): Locator;
  do: {
    close(): Promise<void>;
    previous(): Promise<void>;
  };
  locators: {
    buttons: {
      close: Locator;
      previous: Locator;
    };
    position: Locator;
  };
}

export function initConfirm(page: Page): Confirm {
  const root = page.getByTestId('dialog-message');
  const locators = {
    buttons: {
      accept: page.getByTestId('confirm-accept'),
      cancel: page.getByTestId('confirm-cancel'),
    },
    message: root,
  };
  const interactions = {
    accept: async () => {
      await locators.buttons.accept.click();
    },
    cancel: async () => {
      await locators.buttons.cancel.click();
    },
  };
  return Object.assign(() => root, { locators, do: interactions });
}

export function initToast(page: Page): Toast {
  const root = page.getByTestId('toast');
  // The newest toast that offers an action: a plain success toast may still be on screen beside the undo one.
  const pending = root.filter({ has: page.getByTestId('toast-action') }).last();
  const locators = {
    buttons: {
      action: pending.getByTestId('toast-action'),
      close: pending.getByTestId('toast-close'),
    },
  };
  const interactions = {
    close: async () => {
      await locators.buttons.close.click();
    },
    undo: async () => {
      await locators.buttons.action.click();
    },
  };
  return Object.assign(() => root, { locators, do: interactions });
}

export function initImageViewer(page: Page): ImageViewer {
  const root = page.getByTestId('image-viewer');
  const locators = {
    buttons: {
      close: root.getByTestId('close-image'),
      previous: root.getByTestId('previous-image'),
    },
    position: root.getByTestId('image-position'),
  };
  const interactions = {
    close: async () => {
      await locators.buttons.close.click();
    },
    previous: async () => {
      await locators.buttons.previous.click();
    },
  };
  return Object.assign(() => root, { locators, do: interactions });
}

import { expect, type Locator, type Page } from '@playwright/test';

interface Confirm {
  (): Locator;
  do: {
    accept(): Promise<void>;
    cancel(): Promise<void>;
  };
  locators: {
    buttons: {
      accept: Locator;
      cancel: Locator;
    };
    message: Locator;
  };
}

/** The table whose row a deferred delete removes last, after the objects. */
type DeletedTable = 'items' | 'images' | 'categories';

interface Toast {
  (): Locator;
  do: {
    close(): Promise<void>;
    commitDeletion(table: DeletedTable): Promise<void>;
    hold(): Promise<void>;
    undo(): Promise<void>;
    undoByKeyboard(): Promise<void>;
  };
  locators: {
    alert: Locator;
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
    deleteImage(): Promise<void>;
    previous(): Promise<void>;
    /** Closes the viewer and opens the cut-out review for the photo shown. */
    removeBackground(): Promise<void>;
    /** Opens the rotation's tools for the photo shown. */
    rotate(): Promise<void>;
    rotateLeft(): Promise<void>;
    rotateRight(): Promise<void>;
    /** Moves the slider from where it is by `steps` of 0.1°, by keyboard, as a collector without a pointer would. */
    nudgeAngle(steps: number): Promise<void>;
    straighten(): Promise<void>;
    resetRotation(): Promise<void>;
    cancelRotation(): Promise<void>;
    /** Saves the rotation and waits until the turned photo has taken the original's place. */
    saveRotation(): Promise<void>;
    /** Opens the crop's panel; the crop shows once the item is found. */
    cropToItem(): Promise<void>;
    cancelCrop(): Promise<void>;
    /** Saves the crop and waits until it has taken the original's place. */
    saveCrop(): Promise<void>;
  };
  locators: {
    buttons: {
      close: Locator;
      deleteImage: Locator;
      previous: Locator;
      removeBackground: Locator;
      rotate: Locator;
      crop: Locator;
    };
    photo: Locator;
    position: Locator;
    rotation: {
      controls: Locator;
      left: Locator;
      right: Locator;
      angle: Locator;
      angleValue: Locator;
      straighten: Locator;
      reset: Locator;
      cancel: Locator;
      save: Locator;
      preview: Locator;
    };
    crop: {
      controls: Locator;
      status: Locator;
      preview: Locator;
      cancel: Locator;
      save: Locator;
    };
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
    // An error toast, the one kind that interrupts; a success toast may be on screen beside it.
    alert: root.and(page.getByRole('alert')),
    buttons: {
      action: pending.getByTestId('toast-action'),
      close: pending.getByTestId('toast-close'),
    },
  };
  const interactions = {
    close: async () => {
      await locators.buttons.close.click();
    },
    // Closing ends the undo window; waiting for the row's delete keeps a navigation from aborting it.
    commitDeletion: async (table: DeletedTable) => {
      const deleted = page.waitForResponse(
        (response) =>
          response.request().method() === 'DELETE' &&
          new URL(response.url()).pathname.endsWith(`/rest/v1/${table}`),
      );
      await locators.buttons.close.click();
      expect((await deleted).ok()).toBe(true);
    },
    // A pointer resting on the toast stops its timer until it leaves.
    hold: async () => {
      await pending.hover();
    },
    undo: async () => {
      await locators.buttons.action.click();
    },
    // From wherever focus is: the toasts come last in the tab order.
    undoByKeyboard: async () => {
      await page.keyboard.press('ControlOrMeta+z');
    },
  };
  return Object.assign(() => root, { locators, do: interactions });
}

export function initImageViewer(page: Page): ImageViewer {
  const root = page.getByTestId('image-viewer');
  // The src of the photo a crop started on, which a saved crop replaces.
  let cropped = '';
  const locators = {
    buttons: {
      close: root.getByTestId('close-image'),
      deleteImage: root.getByTestId('delete-image'),
      previous: root.getByTestId('previous-image'),
      removeBackground: root.getByTestId('remove-background-image'),
      rotate: root.getByTestId('rotate-image'),
      crop: root.getByTestId('crop-image'),
    },
    photo: root.getByTestId('viewer-photo'),
    position: root.getByTestId('image-position'),
    rotation: {
      controls: root.getByTestId('rotation-controls'),
      left: root.getByTestId('rotate-left'),
      right: root.getByTestId('rotate-right'),
      angle: root.getByTestId('rotation-angle'),
      angleValue: root.getByTestId('rotation-angle-value'),
      straighten: root.getByTestId('straighten-image'),
      reset: root.getByTestId('rotation-reset'),
      cancel: root.getByTestId('rotation-cancel'),
      save: root.getByTestId('rotation-save'),
      preview: root.getByTestId('rotation-preview'),
    },
    crop: {
      controls: root.getByTestId('crop-controls'),
      status: root.getByTestId('crop-status'),
      preview: root.getByTestId('crop-preview'),
      cancel: root.getByTestId('crop-cancel'),
      save: root.getByTestId('crop-save'),
    },
  };
  const interactions = {
    close: async () => {
      await locators.buttons.close.click();
    },
    // Opens the confirmation only: answering it is the caller's step.
    deleteImage: async () => {
      await locators.buttons.deleteImage.click();
    },
    previous: async () => {
      await locators.buttons.previous.click();
    },
    removeBackground: async () => {
      await locators.buttons.removeBackground.click();
    },
    rotate: async () => {
      await locators.buttons.rotate.click();
      await expect(locators.rotation.controls).toBeVisible();
    },
    rotateLeft: async () => {
      await locators.rotation.left.click();
    },
    rotateRight: async () => {
      await locators.rotation.right.click();
    },
    nudgeAngle: async (steps: number) => {
      await locators.rotation.angle.focus();
      const key = steps < 0 ? 'ArrowLeft' : 'ArrowRight';
      for (let step = 0; step < Math.abs(steps); step += 1) {
        await page.keyboard.press(key);
      }
    },
    straighten: async () => {
      await locators.rotation.straighten.click();
    },
    resetRotation: async () => {
      await locators.rotation.reset.click();
    },
    cancelRotation: async () => {
      await locators.rotation.cancel.click();
    },
    // The new row's photo has a new path, so its signed URL differs from the original's.
    saveRotation: async () => {
      const original = await locators.photo.getAttribute('src');
      await expect(locators.rotation.save).toBeEnabled();
      await locators.rotation.save.click();
      await expect(locators.rotation.controls).toHaveCount(0);
      await expect(locators.photo).not.toHaveAttribute('src', original ?? '', {
        timeout: 45_000,
      });
    },
    // The preview takes the photo's place, so its src is read before the crop starts.
    cropToItem: async () => {
      cropped = (await locators.photo.getAttribute('src')) ?? '';
      await locators.buttons.crop.click();
      await expect(locators.crop.controls).toBeVisible();
    },
    cancelCrop: async () => {
      await locators.crop.cancel.click();
    },
    saveCrop: async () => {
      await locators.crop.save.click();
      await expect(locators.crop.controls).toHaveCount(0);
      await expect(locators.photo).not.toHaveAttribute('src', cropped, {
        timeout: 45_000,
      });
    },
  };
  return Object.assign(() => root, { locators, do: interactions });
}

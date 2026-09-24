import { type Locator, type Page } from '@playwright/test';

interface EntryForm {
  (): Locator;
  do: {
    addTag(tag: string, key?: 'Enter' | ','): Promise<void>;
    cancel(): Promise<void>;
    close(): Promise<void>;
    fill(fields: { title?: string; description?: string }): Promise<void>;
    pickPlace(query: string): Promise<void>;
    removeLastTag(): Promise<void>;
    removeTag(tag: string): Promise<void>;
    submit(): Promise<void>;
  };
  locators: {
    buttons: {
      cancel: Locator;
      close: Locator;
      submit: Locator;
    };
    inputs: {
      description: Locator;
      place: Locator;
      tags: Locator;
      title: Locator;
    };
    placeOptions: Locator;
    tags: Locator;
    texts: {
      placeError: Locator;
    };
  };
  /** One tag chip's remove button, by the tag it carries. */
  tag(tag: string): Locator;
}

export function initEntryForm(page: Page): EntryForm {
  const root = page.getByTestId('item-title');
  const locators = {
    buttons: {
      cancel: page.getByTestId('item-cancel'),
      // The creation form has no Cancel of its own; only the modal's close.
      close: page.getByTestId('dialog-close'),
      submit: page.getByTestId('item-submit'),
    },
    inputs: {
      description: page.getByTestId('item-description'),
      place: page.getByTestId('item-place'),
      tags: page.getByTestId('item-tags'),
      title: page.getByTestId('item-title'),
    },
    placeOptions: page.getByTestId('place-option'),
    tags: page.getByTestId('tag-chip'),
    texts: {
      placeError: page.getByTestId('place-error'),
    },
  };
  const interactions = {
    addTag: async (tag: string, key: 'Enter' | ',' = 'Enter') => {
      await locators.inputs.tags.fill(tag);
      await locators.inputs.tags.press(key);
    },
    cancel: async () => {
      await locators.buttons.cancel.click();
    },
    close: async () => {
      await locators.buttons.close.click();
    },
    fill: async (fields: { title?: string; description?: string }) => {
      if (fields.title !== undefined) {
        await locators.inputs.title.fill(fields.title);
      }
      if (fields.description !== undefined) {
        await locators.inputs.description.fill(fields.description);
      }
    },
    pickPlace: async (query: string) => {
      await locators.inputs.place.fill(query);
      await locators.placeOptions.first().click();
    },
    removeLastTag: async () => {
      await locators.inputs.tags.press('Backspace');
    },
    removeTag: async (tag: string) => {
      await locators.tags
        .filter({ hasText: tag })
        .getByTestId('remove-tag')
        .click();
    },
    submit: async () => {
      await locators.buttons.submit.click();
    },
  };
  return Object.assign(() => root, {
    locators,
    do: interactions,
    tag: (tag: string) => locators.tags.filter({ hasText: tag }),
  });
}
